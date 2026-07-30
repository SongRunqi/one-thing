/**
 * RoomCoordinator — docs/design/multi-agent-collab.md D4/§6.
 *
 * The ONLY driver of room-session streams. User messages land via the ingress
 * gate (persist-only, message:user-created on the bus); this module owns the
 * wiring and the room's configuration doors, while the work itself lives in the
 * three modules it composes (R2):
 *
 *   room-runtime.ts  runtime state, the durable state file, room primitives
 *   budget.ts        the 费用闸 over the room's session set
 *   turn.ts          one turn end to end: drive, wait, abort, harvest
 *   queue.ts         who speaks and in what order: willingness, queue, reconcile
 *
 * What is left here: process lifecycle (init / shutdown / boot reconciliation),
 * the event subscriptions, and the four settings doors the UI and the CLI call
 * (freeze, budgets, team config, board actions).
 */
import {
  COLLAB_SYSTEM_SOURCE_MEMBERSHIP,
  buildCollabMembershipLines,
  isCollabDriveMessage,
  type CollabBoard,
  type CollabBoardAction,
} from '@onething/runtime/collab'
import { randomUUID } from 'node:crypto'
import { isActiveAgent, type ChatMessage, type PermissionMode } from '@shared/ipc.js'
import * as store from '../store.js'
import { getEventBus } from '../events/index.js'
import { findAgent } from '../agents/index.js'
import {
  applyBoardAction,
  forgetCollabBoardRoom,
  shutdownCollabBoardBroadcasts,
} from './board-store.js'
import { emitCollabTyping } from './typing-observer.js'
import { isRoomOverBudget } from './budget.js'
import { configureCollabDriveGuard } from './drive-guard.js'
import {
  clearRoomRuntimes,
  clearRoomTimers,
  deleteRoomRuntime,
  isRoom,
  removeCollabRoomDirectory,
  peekRoomRuntime,
  persistRoomState,
  postSystemLine,
  postTaskSystemLine,
  roomChannel,
  roomRuntime,
} from './room-runtime.js'
import {
  abortRoomTurn,
  clearAgentSessionLocks,
  setCollabTurnsShuttingDown,
  waitForEngineBound,
  waitForRoomTurn,
} from './turn.js'
import {
  enqueue,
  handleRoomUserMessage,
  processQueue,
  reconcileRoom,
} from './queue.js'
import {
  forgetCollabRoomWork,
  freezeRoomWork,
  initializeCollabWorkers,
  reconcileRoomBoard,
  resumeRoomWork,
  shutdownCollabWorkers,
} from './worker.js'

/**
 * Re-exported so the app's public collab surface (and the say executor, the
 * settings panel, the room IPC handlers) keeps one import site even though the
 * implementations moved out (R2).
 */
export {
  getCollabRoomSpend,
  isRoomOverBudget,
  readCollabRoomSpentTodayUSD,
} from './budget.js'
export { abortRoomTurn } from './turn.js'

let initialized = false
let disposers: Array<() => void> = []

export function initializeCollabCoordinator(): void {
  if (initialized) return
  initialized = true
  setCollabTurnsShuttingDown(false)
  // P2-8: one token per process, minted before anything can drive. It is what
  // turns 'collab' from a claim into a credential (see drive-guard.ts).
  configureCollabDriveGuard(randomUUID())

  initializeCollabWorkers({
    postSystemLine,
    postTaskSystemLine,
    enqueueRoomActivation(roomSessionId, agentId, reason, driveLabel) {
      const runtime = roomRuntime(roomSessionId)
      enqueue(roomSessionId, runtime, [{ agentId, reason, driveLabel }], undefined)
    },
    waitForEngineBound,
    waitForTurn: waitForRoomTurn,
    roomChannel,
    isRoomOverBudget,
  })

  const bus = getEventBus()
  disposers.push(
    bus.onAnySession('message:user-created', envelope => {
      const sessionId = envelope.sessionId
      const message = (envelope.event as { message?: ChatMessage }).message
      if (!message || message.role !== 'user') return
      if (isCollabDriveMessage(message)) return
      if (!isRoom(sessionId)) return
      void handleRoomUserMessage(sessionId, message)
    }, 'collab-coordinator'),
    bus.onAnySession('steering:consumed', envelope => {
      const sessionId = envelope.sessionId
      if (!isRoom(sessionId)) return
      const runtime = roomRuntime(sessionId)
      runtime.state.chainCount = 0
      runtime.chainNoticePosted = false
      persistRoomState(sessionId, runtime)
      if (runtime.queue.length > 0) void processQueue(sessionId)
    }, 'collab-coordinator'),
  )

  // A deleted room takes its runtime, its board machinery and its directory
  // with it (P2-10). The store notifies; it does not know what collab is.
  disposers.push(store.onSessionsDeleted(sessionIds => {
    for (const sessionId of sessionIds) disposeCollabRoom(sessionId)
  }))

  // Boot reconciliation over every known room (transcript watermark + board).
  try {
    for (const meta of store.getSessionsList() as Array<{ id: string; kind?: string }>) {
      if (meta.kind !== 'room') continue
      const session = store.getSession(meta.id)
      if (session?.kind === 'room') {
        reconcileRoom(session)
        reconcileRoomBoard(session.id)
      }
    }
  } catch (error) {
    console.error('[collab] boot reconciliation failed:', error)
  }
}

export function shutdownCollabCoordinator(): void {
  // Latch first: an engine-bind wait can be five minutes into its poll loop,
  // and it must not outlive the subscriptions it was going to drive into.
  setCollabTurnsShuttingDown(true)
  // Nothing may drive a room once there is no coordinator to have sent it.
  configureCollabDriveGuard(null)
  shutdownCollabWorkers()
  shutdownCollabBoardBroadcasts()
  for (const dispose of disposers) {
    try { dispose() } catch { /* noop */ }
  }
  disposers = []
  clearRoomTimers()
  clearRoomRuntimes()
  clearAgentSessionLocks()
  initialized = false
}

/**
 * Everything a room owned outside its session file (P2-10).
 *
 * Runs AFTER the delete, so the session is already gone and its kind cannot be
 * checked — which is fine and deliberate: every step is a no-op for an id that
 * never had collab state, and guessing from a name would be worse than doing
 * nothing four times. The three Maps that leaked (`rooms`, the board write
 * queue, the worker's pending list) and the `<store>/collab/<roomId>/`
 * directory all go here.
 */
function disposeCollabRoom(roomSessionId: string): void {
  abortRoomTurn(roomSessionId)
  forgetCollabRoomWork(roomSessionId)
  forgetCollabBoardRoom(roomSessionId)
  deleteRoomRuntime(roomSessionId)
  removeCollabRoomDirectory(roomSessionId)
}

/** Room-wide pause switch (总闸): freezes activations AND all work streams. */
export function setCollabRoomFrozen(roomSessionId: string, frozen: boolean): boolean {
  const session = store.getSession(roomSessionId)
  if (!session || session.kind !== 'room' || !session.room) return false
  const updated = store.updateSessionCollab(roomSessionId, {
    room: { ...session.room, frozen },
  })
  if (!updated) return updated
  if (frozen) {
    const runtime = roomRuntime(roomSessionId)
    for (const record of runtime.queue) {
      // Everyone who was waiting to speak stops "typing" (§2.4).
      emitCollabTyping(roomSessionId, record.agentId, false)
      // …and is retired in the durable record too. The queue entries ARE the
      // state records (same objects), so a discarded activation that stays
      // 'queued' is one boot reconciliation away from coming back to life —
      // the room would resume a conversation the user explicitly stopped.
      record.stage = 'failed'
    }
    runtime.queue.length = 0
    persistRoomState(roomSessionId, runtime)
    abortRoomTurn(roomSessionId)
    freezeRoomWork(roomSessionId)
    postSystemLine(roomSessionId, '房间已全部暂停:进行中的执行已中止,恢复后可重新指派')
  } else {
    // A new pause gets to say its piece again (P2-17).
    roomRuntime(roomSessionId).frozenNoticePosted = false
    resumeRoomWork(roomSessionId)
  }
  return updated
}

export interface CollabBoardActResult {
  success: boolean
  error?: string
  board?: CollabBoard
}

/**
 * The USER's board mutation door (W16). Same reducer, same per-room write
 * queue, same broadcast as the board tool — the only thing pinned here is the
 * actor: a human. That matters beyond bookkeeping, because W9b's halt cap and
 * the 打回 counter gate AGENT-driven retries only, so a user can always push a
 * card that the room has stopped touching by itself.
 *
 * The board comes back on BOTH paths: a rev conflict is the expected outcome
 * of two writers (agent + user) on one card, and the caller repaints from the
 * returned truth rather than guessing.
 */
export async function applyUserCollabBoardAction(
  roomSessionId: string,
  action: CollabBoardAction,
): Promise<CollabBoardActResult> {
  const session = store.getSession(roomSessionId)
  if (!session) return { success: false, error: 'Session not found' }
  if (session.kind !== 'room' || !session.room) return { success: false, error: 'Not a room session' }
  const outcome = await applyBoardAction(roomSessionId, action, { type: 'user' })
  // Reducer refusals (unknown id, rev conflict, illegal transition) travel
  // VERBATIM: their wording is the actionable part ("re-read the board…").
  if (outcome.error) return { success: false, error: outcome.error, board: outcome.board }
  return { success: true, board: outcome.board }
}

const PERMISSION_MODES: readonly PermissionMode[] = ['normal', 'auto-accept-edits', 'dangerously-allow-all']

/** Room settings patch (W6). Absent field = unchanged; pmAgentId null = clear. */
export interface CollabRoomConfigPatch {
  name?: string
  memberAgentIds?: string[]
  pmAgentId?: string | null
  permissionMode?: PermissionMode
}

export interface CollabRoomConfigResult {
  success: boolean
  error?: string
}

/**
 * Team settings (W6): rename / roster / PM / permission mode in one atomic
 * validation pass, followed by the 群公告 lines the room (and the model) reads.
 *
 * Membership semantics (§3.5 C): a removed member keeps its in-flight work
 * session — the task is still harvested — but stops taking the floor. Nothing
 * caches the roster: willingness (roomMembers), mention decisions and the
 * drive-time guard all read store.getSession() fresh, so the next round after
 * this write already excludes them.
 */
export function setCollabRoomConfig(
  roomSessionId: string,
  patch: CollabRoomConfigPatch,
): CollabRoomConfigResult {
  const session = store.getSession(roomSessionId)
  if (!session || session.kind !== 'room' || !session.room) {
    return { success: false, error: 'Not a room session' }
  }

  const previousMembers = session.room.memberAgentIds ?? []
  let nextMembers = previousMembers
  if (patch.memberAgentIds !== undefined) {
    const requested = Array.isArray(patch.memberAgentIds) ? patch.memberAgentIds : []
    const unique = [...new Set(requested.filter(id => typeof id === 'string' && id.length > 0))]
    if (unique.length === 0) {
      return { success: false, error: 'Room needs at least one member agent' }
    }
    for (const agentId of unique) {
      const agent = findAgent(agentId)
      if (!agent) {
        return { success: false, error: `Unknown agent: ${agentId}` }
      }
      // 退休的人不能被**拉进来**(域模型 §3.2);已经在房里的原样通过 —— 否则
      // 一间旧房只要有一个成员退休了,这间房的任何设置修改都会被整体拒掉,
      // 而"已在房的 retired 成员留在 memberAgentIds"正是本期的数据纪律。
      if (!isActiveAgent(agent) && !previousMembers.includes(agentId)) {
        return { success: false, error: `Agent is retired: ${agent.name}` }
      }
    }
    nextMembers = unique
  }

  const previousPm = session.room.pmAgentId || undefined
  let nextPm = previousPm
  if (patch.pmAgentId !== undefined) {
    nextPm = patch.pmAgentId || undefined
    if (nextPm && !nextMembers.includes(nextPm)) {
      return { success: false, error: 'PM must be a room member' }
    }
  }
  // PM dropped from the roster → the room simply has no PM (§3.5 C). Validation
  // guarantees this rather than leaving a dangling pmAgentId behind.
  if (nextPm && !nextMembers.includes(nextPm)) nextPm = undefined

  if (patch.permissionMode !== undefined && !PERMISSION_MODES.includes(patch.permissionMode)) {
    return { success: false, error: `Invalid permission mode: ${patch.permissionMode}` }
  }

  let nextName: string | undefined
  if (patch.name !== undefined) {
    nextName = patch.name.trim()
    if (!nextName) return { success: false, error: 'Room name cannot be empty' }
  }

  // Roster equality is SET equality: re-sending the same members in another
  // order is not a membership change and must not post a 群公告 (or rewrite
  // the room). Only joins and departures count.
  const membersChanged = nextMembers !== previousMembers
    && (nextMembers.length !== previousMembers.length
      || nextMembers.some(id => !previousMembers.includes(id)))
  const pmChanged = nextPm !== previousPm

  if (membersChanged || pmChanged) {
    const room = { ...session.room, memberAgentIds: [...nextMembers] }
    if (nextPm) room.pmAgentId = nextPm
    else delete room.pmAgentId
    if (!store.updateSessionCollab(roomSessionId, { room })) {
      return { success: false, error: 'Failed to update room' }
    }
  }
  if (patch.permissionMode !== undefined && patch.permissionMode !== session.permissionMode) {
    store.updateSessionPermissionMode(roomSessionId, patch.permissionMode)
  }
  if (nextName && nextName !== session.name) {
    store.renameSession(roomSessionId, nextName)
  }

  if (membersChanged || pmChanged) {
    const roster = [...new Set([...previousMembers, ...nextMembers])]
      .map(agentId => findAgent(agentId))
      .filter((agent): agent is NonNullable<typeof agent> => Boolean(agent))
      .map(agent => ({ id: agent.id, name: agent.name, avatar: agent.avatar }))
    for (const line of buildCollabMembershipLines({
      previousMemberIds: previousMembers,
      nextMemberIds: nextMembers,
      previousPmAgentId: previousPm,
      nextPmAgentId: nextPm,
      agents: roster,
    })) {
      postSystemLine(roomSessionId, line, COLLAB_SYSTEM_SOURCE_MEMBERSHIP)
    }
    if (membersChanged) clearTypingForNonMembers(roomSessionId, nextMembers)
  }
  return { success: true }
}

/** A queued-but-removed member stops "typing" immediately; the record itself is
 *  dropped by the drive-time roster guard when the queue reaches it. The head
 *  of a running queue is skipped — it is mid-stream and may be mid-`say`.
 *  Since W19 a merely-queued member has no light to clear (nothing lights until
 *  its `say` streams), so this is 兜底 for stale trues, not the mechanism. */
function clearTypingForNonMembers(roomSessionId: string, members: readonly string[]): void {
  const runtime = peekRoomRuntime(roomSessionId)
  if (!runtime) return
  runtime.queue.forEach((record, index) => {
    if (index === 0 && runtime.running) return
    if (!members.includes(record.agentId)) emitCollabTyping(roomSessionId, record.agentId, false)
  })
}

/** Soft reminder line for long-pending worker permission asks (D8 30min). */
export function postCollabSystemLine(roomSessionId: string, content: string): void {
  if (store.getSession(roomSessionId)?.kind !== 'room') return
  postSystemLine(roomSessionId, content)
}

/** 预算可配置(用户要求):只改给定字段;0 = 关闭该闸。生效即时(缓存失效)。 */
export function setCollabRoomBudgets(
  roomSessionId: string,
  budgets: {
    dailyCostUSD?: number
    maxChain?: number
    maxTurnToolCalls?: number
    maxTurnSayCalls?: number
  },
): boolean {
  const session = store.getSession(roomSessionId)
  if (!session || session.kind !== 'room' || !session.room) return false
  const next = { ...(session.room.budgets ?? {}) }
  if (budgets.dailyCostUSD !== undefined && Number.isFinite(budgets.dailyCostUSD) && budgets.dailyCostUSD >= 0) {
    next.dailyCostUSD = budgets.dailyCostUSD
  }
  if (budgets.maxChain !== undefined && Number.isFinite(budgets.maxChain) && budgets.maxChain >= 0) {
    next.maxChain = Math.floor(budgets.maxChain)
  }
  // 回合断路器上限 (W22): same 0 = 关闭 shape as the gates above. Takes effect on
  // the next turn — the breaker reads its caps when the turn window opens.
  if (
    budgets.maxTurnToolCalls !== undefined
    && Number.isFinite(budgets.maxTurnToolCalls)
    && budgets.maxTurnToolCalls >= 0
  ) {
    next.maxTurnToolCalls = Math.floor(budgets.maxTurnToolCalls)
  }
  if (
    budgets.maxTurnSayCalls !== undefined
    && Number.isFinite(budgets.maxTurnSayCalls)
    && budgets.maxTurnSayCalls >= 0
  ) {
    next.maxTurnSayCalls = Math.floor(budgets.maxTurnSayCalls)
  }
  const updated = store.updateSessionCollab(roomSessionId, {
    room: { ...session.room, budgets: next },
  })
  if (updated) {
    const runtime = roomRuntime(roomSessionId)
    runtime.budgetCheckedAt = 0
    runtime.budgetNoticeDay = ''
    runtime.chainNoticePosted = false
    // 新额度可能解除封锁 — 立刻重试排队中的激活与任务。
    if (runtime.queue.length > 0) void processQueue(roomSessionId)
  }
  return updated
}