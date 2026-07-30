/**
 * Room runtime primitives — the vocabulary every other coordinator module
 * speaks (R2 split of the 1538-line coordinator).
 *
 * Two things live here, and they belong together because everything else in
 * `app/collab` needs both:
 *
 *  - the per-room RUNTIME: activation records, the durable state file
 *    (<store>/collab/<roomId>/state.json), the in-memory `rooms` map, and the
 *    watermark;
 *  - the room's own read/write PRIMITIVES: who is in it, what its caps are,
 *    which channel it answers on, and how a system line is posted into it.
 *
 * Watermark discipline (评审修订): lastProcessedMessageId advances only when a
 * message is actually CONSUMED — zero-activation messages advance immediately;
 * messages that spawned activations advance at harvest (watermark = reply id).
 * A crash between receipt and drive therefore leaves the mention recoverable;
 * duplicate re-drives are prevented by activation records carrying
 * sourceMessageId (a record past 'queued' means the drive was persisted).
 *
 * W23 gives that dedup a second, unbounded level. The records above are capped
 * at 50 and the watermark does not advance for a failed activation, so a busy
 * room can outlive the proof that a message was answered. Every drive is also a
 * persisted user message stamped with the room message it answers
 * (`collabSourceMessageId`), and transcripts have no cap — so when the records
 * miss, boot reconciliation asks the transcript instead of re-driving.
 */
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { readJsonFile, writeJsonFile } from '@onething/core/storage'
import {
  COLLAB_DEFAULT_MAX_CHAIN,
  COLLAB_DM_PAIR_MAX_CHAIN,
  COLLAB_MESSAGE_SOURCE,
  COLLAB_SYSTEM_SOURCE_TASK,
  isAgentPairDmRoom,
  type CollabActivationReason,
  type CollabAgentLike,
} from '@onething/runtime/collab'
import { isActiveAgent, type ChatMessage, type ChatSession } from '@shared/ipc.js'
import * as store from '../store.js'
import { getEventBus } from '../events/index.js'
import { getStreamEngineSafe } from '../engine/index.js'
import { findAgent } from '../agents/index.js'
import { getStorePath } from '../stores/paths.js'

/** One activation as the queue and the durable record both see it. */
export interface CollabActivationInput {
  agentId: string
  reason: CollabActivationReason
  driveLabel?: string
}

/** The willingness round's request shape — declared here so the turn module can
 *  ask for one without importing the queue that runs it (R2 拆环). */
export interface CollabElectionRequest {
  roomSessionId: string
  session: ChatSession
  /** Already activated deterministically (mentions) — they skip judgement. */
  exclude: ReadonlySet<string>
  /** The message's author never judges itself. */
  authorAgentId?: string
  /** The message this round is judging — where silent members' emoji land. */
  targetMessageId?: string
}

export interface CollabActivationRecord {
  id: string
  agentId: string
  reason: CollabActivationReason
  stage: 'queued' | 'driving' | 'streaming' | 'harvested' | 'failed'
  driveMessageId?: string
  /** The room message that caused this activation (dedup on reconciliation). */
  sourceMessageId?: string
  /** Overrides the drive line's reason label — 'task-event' covers both a
   *  delivery review and a halted-card disposition, and the transcript must
   *  say which (W9.2). */
  driveLabel?: string
}

export interface CollabRoomStateFile {
  version: 1
  lastProcessedMessageId?: string
  /** Timestamp fallback for the watermark (survives watermark-message deletion). */
  lastProcessedAt?: number
  chainCount: number
  activations: CollabActivationRecord[]
}

export interface RoomRuntime {
  state: CollabRoomStateFile
  queue: CollabActivationRecord[]
  running: boolean
  chainNoticePosted: boolean
  /** The 「房间已暂停」 line was already said this freeze (P2-17). Reset when
   *  the room is unfrozen, so the next pause gets to say it again. */
  frozenNoticePosted: boolean
  budgetCheckedAt: number
  budgetSpentUSD: number
  budgetNoticeDay: string
  /** The execution session currently carrying this room's turn. W18 moved the
   *  stream off the room session, so anything that means "stop this room" has
   *  to be able to find where the turn actually lives. Set on entering the
   *  agent lock, cleared by the same finally — never outlives the turn. */
  activeTurn?: { agentSessionId: string; agentId: string }
}

const rooms = new Map<string, RoomRuntime>()

function statePath(roomSessionId: string): string {
  return path.join(getStorePath(), 'collab', roomSessionId, 'state.json')
}

function loadRoomState(roomSessionId: string): CollabRoomStateFile {
  const raw = readJsonFile<CollabRoomStateFile | null>(statePath(roomSessionId), null)
  if (raw && raw.version === 1) {
    return {
      version: 1,
      lastProcessedMessageId: raw.lastProcessedMessageId,
      lastProcessedAt: typeof raw.lastProcessedAt === 'number' ? raw.lastProcessedAt : undefined,
      chainCount: typeof raw.chainCount === 'number' ? raw.chainCount : 0,
      activations: Array.isArray(raw.activations) ? raw.activations : [],
    }
  }
  return { version: 1, chainCount: 0, activations: [] }
}

/**
 * Forced flush, every call. `writeJsonFile` is `writeFileSync` + `renameSync`:
 * synchronous and atomic, never queued and never throttled — so the moments
 * that matter (a record created at enqueue, the terminal state after harvest)
 * are already on disk before the next line runs, and a `kill` cannot open a
 * window between the decision and its record. W23 verified this against the
 * live store rather than assuming it: the state files survived every force-quit
 * with their records intact. The durability gap is elsewhere — the session
 * TRANSCRIPTS are the async, 300ms-throttled writers, which is why the state
 * file runs AHEAD of them and never behind.
 */
export function persistRoomState(roomSessionId: string, runtime: RoomRuntime): void {
  // Only the recent tail of activations matters for reconciliation; cap growth.
  //
  // This cap is the fast path's known blind spot (W23): a room busy enough to
  // push 50 records past a stalled watermark loses the record that proves an
  // older message was consumed. `reconcileRoom`'s level-2 transcript scan is
  // the answer — raising the cap would only move the cliff.
  if (runtime.state.activations.length > 50) {
    runtime.state.activations = runtime.state.activations.slice(-50)
  }
  writeJsonFile(statePath(roomSessionId), runtime.state)
}

export function roomRuntime(roomSessionId: string): RoomRuntime {
  let runtime = rooms.get(roomSessionId)
  if (!runtime) {
    runtime = {
      state: loadRoomState(roomSessionId),
      queue: [],
      running: false,
      chainNoticePosted: false,
      frozenNoticePosted: false,
      budgetCheckedAt: 0,
      budgetSpentUSD: 0,
      budgetNoticeDay: '',
    }
    rooms.set(roomSessionId, runtime)
  }
  return runtime
}

/**
 * Move the watermark forward — and only forward (P2-2).
 *
 * Two `handleRoomUserMessage` calls run concurrently on purpose (serialising
 * them would make B's judgement wait out A's 8-second willingness round), so
 * the later message can finish first and write a watermark the earlier one then
 * overwrites with its own, older, position. Nothing is lost while the process
 * lives — the queue already holds both — but the state file is what boot
 * reconciliation reads, and a watermark that walked backwards makes the next
 * start re-decide messages the room already answered.
 *
 * The guard, not serialisation, is the fix: it removes the harm and keeps the
 * concurrency.
 */
export function advanceWatermark(runtime: RoomRuntime, message: Pick<ChatMessage, 'id' | 'timestamp'>): void {
  const current = runtime.state.lastProcessedAt
  if (current !== undefined && message.timestamp < current) return
  runtime.state.lastProcessedMessageId = message.id
  runtime.state.lastProcessedAt = message.timestamp
}

/**
 * Timer registry (P2-6). Every deferred kick the coordinator arms goes through
 * here, so `shutdownCollabCoordinator` can prove it left nothing armed —
 * previously a 60s requeue-retry survived teardown and woke a queue whose
 * subscriptions were gone.
 *
 * `key` de-duplicates: a room that parks ten activations behind one budget
 * ceiling arms one kick, not ten.
 */
const pendingTimers = new Set<ReturnType<typeof setTimeout>>()
const keyedTimers = new Map<string, ReturnType<typeof setTimeout>>()

export function scheduleRoomTimer(delayMs: number, run: () => void, key?: string): void {
  if (key && keyedTimers.has(key)) return
  const timer = setTimeout(() => {
    pendingTimers.delete(timer)
    if (key) keyedTimers.delete(key)
    run()
  }, delayMs)
  // A pending kick must never hold the process open (CLI/daemon exit).
  timer.unref?.()
  pendingTimers.add(timer)
  if (key) keyedTimers.set(key, timer)
}

export function clearRoomTimers(): void {
  for (const timer of pendingTimers) clearTimeout(timer)
  pendingTimers.clear()
  keyedTimers.clear()
}

/**
 * 这个房间**还能指望**的成员名册:主动接话的候选面、mention 的可解析目标、
 * 提示词里的花名册,都读这一条。
 *
 * 退休的成员不在里面(域模型 §3.2 激活链一行):它照旧留在 `memberAgentIds`
 * 里(数据不动,成员条上是墓碑),但不再被提名、不再被 @ 到、也不进模型看到的
 * 花名册 —— 一个永远沉默的名字出现在这三处,只会让房间对着它空转。
 */
export function roomMembers(session: ChatSession): CollabAgentLike[] {
  const ids = session.room?.memberAgentIds ?? []
  const members: CollabAgentLike[] = []
  for (const id of ids) {
    const agent = findAgent(id)
    if (!agent || !isActiveAgent(agent)) continue
    members.push({
      id: agent.id,
      name: agent.name,
      title: agent.title,
      description: agent.description,
      avatar: agent.avatar,
      avatarImage: agent.avatarImage,
    })
  }
  return members
}

/**
 * 这个房间的链长闸上限:无人类输入时,讨论最多连着走几条。
 *
 * 三条规则,与 dailyCostUSD / 两个回合断路器上限同一套约定:
 *  - 缺省(从没配过)→ `COLLAB_DEFAULT_MAX_CHAIN`,**双成员 dm 房除外**:那里
 *    缺省是 `COLLAB_DM_PAIR_MAX_CHAIN`(6,agent-im-dm.md §3.3)。一对一免判
 *    激活之后,唯一还拦得住客套乒乓的就是这道闸,而群房那个 32 对两个人来说
 *    等于没有。**只改缺省**:显式配置(含 0 = 不限)照旧原样生效;
 *  - **0 = 关闭该闸** → Infinity。`CollabRoomBudgets` 的注释一直是这么写的,
 *    但代码此前把 0 读成"没配"、回落默认——文档与行为对不上,填 0 的人得到的
 *    是默认值而不是"不限"。现在按文档来。
 *  - 其余正数原样生效,**不再夹上限**。此前有一道 `min(cap, 默认×4)` 的隐形
 *    天花板:填 100 实际得到 32,而没有任何地方告诉你被夹了。要么让人填,
 *    要么别让人填,不该给一个填得进去却不生效的数字。
 *
 * 负数按"没配"处理——它不是一个有意义的上限,也不该被当成关闭。
 */
export function maxChainFor(session: ChatSession): number {
  const configured = session.room?.budgets?.maxChain
  if (typeof configured !== 'number' || !Number.isFinite(configured) || configured < 0) {
    return isAgentPairDmRoom(session.room) ? COLLAB_DM_PAIR_MAX_CHAIN : COLLAB_DEFAULT_MAX_CHAIN
  }
  return configured === 0 ? Number.POSITIVE_INFINITY : Math.floor(configured)
}

export function roomChannel(sessionId: string): string | undefined {
  // goal kick precedent: live channel unless it is the no-signal 'ipc'
  // fallback, then the session's persisted connector.
  const live = getStreamEngineSafe()?.getChannel(sessionId)
  if (live && live !== 'ipc') return live
  return store.getSession(sessionId)?.lastConnector || live
}

/**
 * Operational system line: budget, chain gate, freeze, turn failures,
 * permission reminders. Display-only — never enters the model projection
 * (W9.1: machine bookkeeping is not a room fact).
 */
export function postSystemLine(roomSessionId: string, content: string, source: string = COLLAB_MESSAGE_SOURCE): void {
  const message: ChatMessage = {
    id: randomUUID(),
    role: 'system',
    content,
    timestamp: Date.now(),
    source,
  }
  store.addMessage(roomSessionId, message)
  void getEventBus().emit(roomSessionId, {
    type: 'message:user-created',
    message,
  } as Parameters<ReturnType<typeof getEventBus>['emit']>[1])
}

/**
 * Task-lifecycle system line (started / halted / interrupted / review). Same
 * message shape, different source marker — this one IS projected to the model
 * so a reviewer sees what actually happened instead of only what the executor
 * claims (W9.1). Renderer treats both identically.
 */
export function postTaskSystemLine(roomSessionId: string, content: string): void {
  postSystemLine(roomSessionId, content, COLLAB_SYSTEM_SOURCE_TASK)
}

/**
 * W14b retired the coordinator's ghost-writer. It used to post 交付/进展 under
 * a worker's name (COLLAB_HARVEST_SOURCE); now the worker says those things
 * itself through `say`, and the harvest falls back to a SYSTEM line when it
 * stays quiet — 冒名发言 is exactly what「说话即行动」removes. The marker still
 * matters for pre-W14b transcripts: the chain recompute must keep skipping the
 * posts those rooms already hold (W12).
 */

export function selfElected(agentIds: readonly string[]): Array<{ agentId: string; reason: CollabActivationReason }> {
  return agentIds.map(agentId => ({ agentId, reason: 'self-elected' as const }))
}

export function isRoom(sessionId: string): boolean {
  return store.getSession(sessionId)?.kind === 'room'
}
/** Forget every room's in-memory runtime (process teardown / test reset). The
 *  durable state files are untouched — they are the thing that survives. */
export function clearRoomRuntimes(): void {
  rooms.clear()
}

/** Forget ONE room's runtime — the room itself is gone (P2-10). */
export function deleteRoomRuntime(roomSessionId: string): void {
  rooms.delete(roomSessionId)
}

/**
 * Remove a deleted room's whole collab directory — state.json, board.json and
 * activity.jsonl (P2-10).
 *
 * The three Maps that kept a room in memory were only-ever-growing, and the
 * directory outlived the session entirely: delete a room and its board, its
 * audit trail and its watermark stayed on disk forever, keyed by an id nothing
 * would ever look up again.
 */
export function removeCollabRoomDirectory(roomSessionId: string): void {
  try {
    fs.rmSync(path.join(getStorePath(), 'collab', roomSessionId), { recursive: true, force: true })
  } catch (error) {
    console.error('[collab] room directory cleanup failed:', error)
  }
}

/** The runtime for a room ONLY if one already exists. Callers that are merely
 *  inspecting (an abort target, a typing sweep) must not conjure one — reading
 *  a room into memory has a disk cost and leaves an entry behind. */
export function peekRoomRuntime(roomSessionId: string): RoomRuntime | undefined {
  return rooms.get(roomSessionId)
}
