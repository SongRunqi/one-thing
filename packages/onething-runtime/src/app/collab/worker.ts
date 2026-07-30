/**
 * Worker lifecycle (docs/design/multi-agent-collab.md D5/P1): an assigned
 * task spawns a kind='work' session bound to the assignee, briefed by the
 * coordinator, executed with the agent's FULL toolset, and harvested when the
 * turn ends — the delivery summary is posted back into the room under the
 * worker's name and the PM is activated for review. 打回 (review→todo)
 * re-executes up to COLLAB_MAX_REJECTIONS rounds without human input.
 *
 * Concurrency gates (§6.2): per-room and global caps with FIFO queues —
 * activeStreams itself is unbounded, the gate lives here.
 */
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import {
  COLLAB_BLOCK_REASON_MAX_CHARS,
  COLLAB_DRIVE_LABEL_TASK_ASSIGNED,
  COLLAB_DRIVE_LABEL_TASK_HALTED,
  COLLAB_DRIVE_LABEL_TASK_REVIEW,
  COLLAB_MAX_HALTS,
  COLLAB_MAX_REJECTIONS,
  COLLAB_MESSAGE_SOURCE,
  COLLAB_USAGE_SOURCE_WORK,
  buildCollabSilentDeliveryLine,
  buildCollabTaskAssignedLine,
  buildCollabTaskDeliveredLine,
  buildCollabWorkRules,
  buildCollabTaskDoneLine,
  buildCollabTaskHaltCapLine,
  buildCollabTaskHaltedLine,
  buildCollabTaskInterruptedLine,
  buildCollabTaskRequeueRefusedLine,
  renderCollabBoardDigest,
  isCollabDriveMessage,
  isCollabSayMessage,
  isCollabThinkingMessage,
  type CollabBoardEvent,
  type CollabTask,
  type CollabTaskEvidence,
} from '@onething/runtime/collab'
import { isActiveAgent, type ChatMessage } from '@shared/ipc.js'
import * as store from '../store.js'
import { getEventBus } from '../events/index.js'
import { getStreamEngineSafe } from '../engine/index.js'
import { findAgent } from '../agents/index.js'
import { getCollabTask, loadCollabBoard, onCollabBoardEvent, patchCollabTask } from './board-store.js'
// 只取日历日的算法,不取预算判定(那条仍走 host 端口)—— 两处"今天"必须是
// 同一个今天,各自 new Date() 会在跨日边界上各说各话。
import { budgetDayKey } from './budget.js'
import { collabRoomFolder, ensureCollabRoomFolder } from './room-folder.js'
import { observeCollabSayTyping } from './typing-observer.js'

const MAX_CONCURRENT_WORK_PER_ROOM = 2
const MAX_CONCURRENT_WORK_GLOBAL = 4
const WORK_START_TIMEOUT_MS = 30_000
const WORK_TOTAL_TIMEOUT_MS = 30 * 60_000
const PROGRESS_EXCERPT_CHARS = 400
/**
 * The board tool is how a member TALKS about work, not how it does work —
 * counting it as evidence would let the 事故 pattern (a room member whose only
 * tool is `board` closing its own card) look executed. W9b.4.
 */
const EVIDENCE_EXCLUDED_TOOLS = new Set(['board'])
/**
 * 交付物 = files a task actually produced (W17). Only the two tools that write
 * bytes qualify: bash could write too, but its "target" is not a field we can
 * read without parsing shell, and a guessed deliverable is worse than none.
 */
const DELIVERABLE_TOOLS = new Set(['write', 'edit'])
/** Tolerant arg lookup — different tool generations named the same field differently. */
const DELIVERABLE_PATH_KEYS = ['file_path', 'path', 'filePath'] as const
/**
 * Board cards are persisted whole; a refactor touching thousands of files must
 * not turn one card into a megabyte. toolCounts stays the authoritative count,
 * so truncating the list loses detail, never truth.
 */
const MAX_DELIVERABLE_FILES = 200

interface ActiveWork {
  roomSessionId: string
  taskId: string
  agentId: string
  workSessionId: string
}

interface WorkerHost {
  /** Operational noise (queueing, concurrency) — display-only. */
  postSystemLine(roomSessionId: string, content: string): void
  /** Task lifecycle fact — projected to the model (W9.1). */
  postTaskSystemLine(roomSessionId: string, content: string): void
  enqueueRoomActivation(roomSessionId: string, agentId: string, reason: 'task-event', driveLabel?: string): void
  waitForEngineBound(): Promise<boolean>
  waitForTurn(sessionId: string, startTimeoutMs: number, totalTimeoutMs: number): Promise<'complete' | 'error' | 'aborted' | 'timeout'>
  roomChannel(roomSessionId: string): string | undefined
  /** 费用闸:超日预算时不再起新 worker(任务留 todo,预算恢复后重指派)。 */
  isRoomOverBudget(roomSessionId: string): Promise<boolean>
}

const activeByTask = new Map<string, ActiveWork>()
const pendingByRoom = new Map<string, string[]>()
/**
 * 刚被用户按下「停止执行」的卡(collab-team-v2 §5.1 入口②)。
 *
 * 一次性闩,由随后到达的 harvest 消费掉:停止的说明由按下停止的那条路径贴,
 * 中断分支看见这个标记就闭嘴。纯内存,进程死了就没了——那种情况下 boot 对账
 * 会把卡收敛到同一个地方,标记本来也没用了。
 */
const stoppedByUser = new Set<string>()
/** taskId → 已经为「预算拦住了这张卡」贴过说明的那一天(§5.2 预算去静默)。 */
const budgetBlockedNoticeDay = new Map<string, string>()
let host: WorkerHost | null = null
let disposeBoardEvents: (() => void) | null = null

function activeCount(roomSessionId?: string): number {
  let count = 0
  for (const work of activeByTask.values()) {
    if (!roomSessionId || work.roomSessionId === roomSessionId) count += 1
  }
  return count
}

function agentName(agentId: string): string {
  const agent = findAgent(agentId)
  return agent ? agent.name : agentId
}

/** Last real room messages rendered IM-style for the task briefing. */
function roomTranscriptTail(roomSessionId: string, limit: number): string {
  const session = store.getSession(roomSessionId)
  if (!session) return ''
  const lines: string[] = []
  for (let index = session.messages.length - 1; index >= 0 && lines.length < limit; index--) {
    const message = session.messages[index] as ChatMessage
    if (isCollabDriveMessage(message)) continue
    // W14b: a thinking record was never said out loud — briefing a worker with
    // another member's private deliberation would put words in the room that
    // the room never heard.
    if (isCollabThinkingMessage(message)) continue
    if (message.role === 'user' && message.content) {
      lines.push(`用户: ${message.content}`)
    } else if (message.role === 'assistant' && message.content && message.content.trim().toLowerCase() !== '[pass]') {
      lines.push(`${message.agentId ? agentName(message.agentId) : '成员'}: ${message.content}`)
    }
  }
  return lines.reverse().join('\n\n')
}

/** The slice of a persisted tool call the evidence walk reads. */
export interface CollabEvidenceToolCall {
  toolId?: string
  toolName?: string
  status?: string
  rejected?: boolean
  arguments?: unknown
  changes?: { filePath?: unknown } | null
}

/**
 * The write/edit target of one tool call, or undefined when this call did not
 * produce a file. Deliberately defensive: `arguments` comes off disk (and,
 * historically, off a streaming JSON parser), so every field is treated as
 * unknown until proven to be a non-empty string.
 *
 * `changes.filePath` wins when present — the engine stamps it with the path it
 * RESOLVED and wrote, which beats re-deriving one from a possibly relative arg.
 */
function deliverablePathOf(call: CollabEvidenceToolCall): string | undefined {
  const resolved = call.changes?.filePath
  if (typeof resolved === 'string' && resolved.trim()) return resolved.trim()
  const args = call.arguments
  if (!args || typeof args !== 'object' || Array.isArray(args)) return undefined
  const record = args as Record<string, unknown>
  for (const key of DELIVERABLE_PATH_KEYS) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return undefined
}

/**
 * Relativise to the room's workingDirectory so a card reads
 * `src/app.ts`, not a 90-character absolute path. Anything outside that root
 * (or collected without a root) stays absolute — silently rendering `../../..`
 * chains would be worse than the long truth.
 */
function relativiseDeliverable(filePath: string, workingDirectory?: string): string {
  if (!workingDirectory || !path.isAbsolute(filePath)) return filePath
  const relative = path.relative(workingDirectory, filePath)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return filePath
  return relative
}

/**
 * 交付物 collection (W17), pure over the tool calls it is handed so the
 * fault-tolerance matrix is testable without a store. First-seen order is
 * preserved: it is the order the worker produced them in.
 */
export function collectDeliverableFiles(
  calls: Iterable<CollabEvidenceToolCall>,
  workingDirectory?: string,
): string[] {
  const files: string[] = []
  const seen = new Set<string>()
  for (const call of calls) {
    const name = call.toolName || call.toolId
    if (!name || !DELIVERABLE_TOOLS.has(name)) continue
    const raw = deliverablePathOf(call)
    if (!raw) continue
    const file = relativiseDeliverable(raw, workingDirectory)
    if (seen.has(file)) continue
    seen.add(file)
    files.push(file)
    if (files.length >= MAX_DELIVERABLE_FILES) break
  }
  return files
}

/**
 * Structural execution trace of a work session (W9b.4): COMPLETED tool calls
 * counted by name, straight off persisted messages. Code-generated on purpose
 * — the model writes the report, the machine writes the receipt.
 *
 * W17 rides the same walk: the write/edit targets among those same completed,
 * unrejected calls become the card's 交付物 list — one source, one 口径.
 */
function collectWorkEvidence(workSessionIds: string[], workingDirectory?: string): CollabTaskEvidence {
  const toolCounts: Record<string, number> = {}
  const counted: CollabEvidenceToolCall[] = []
  for (const workSessionId of workSessionIds) {
    const session = store.getSession(workSessionId)
    for (const message of session?.messages ?? []) {
      for (const call of message.toolCalls ?? []) {
        // Only calls that actually ran count — a rejected/failed write did not
        // write anything, and evidence must not inflate on attempts.
        if (call.status !== 'completed' || call.rejected) continue
        const name = call.toolName || call.toolId
        if (!name || EVIDENCE_EXCLUDED_TOOLS.has(name)) continue
        toolCounts[name] = (toolCounts[name] ?? 0) + 1
        counted.push(call as CollabEvidenceToolCall)
      }
    }
  }
  const files = collectDeliverableFiles(counted, workingDirectory)
  return { toolCounts, ...(files.length > 0 ? { files } : {}) }
}

/** The room's project root — what deliverable paths are relativised against. */
/**
 * W17 evidence 的相对化基准 —— collab-team-v2 §7 把它从 workingDirectory 换成
 * roomFolder。
 *
 * 此前没设工作目录的房间,卡上只能显示绝对路径,于是「卡上的文件名」和
 * 「folder 里的文件名」是两套东西。同一个基准之后它们是同一套。
 */
function roomWorkingDirectory(roomSessionId: string): string | undefined {
  return collabRoomFolder(roomSessionId)
}

/** Last assistant text of the work session — the halt-reason fallback (W9b.3). */
function lastAssistantExcerpt(workSessionId: string, maxChars: number): string {
  const session = store.getSession(workSessionId)
  const last = [...(session?.messages ?? [])].reverse()
    .find(message => message.role === 'assistant' && message.content)
  return (last?.content ?? '').replace(/\s+/g, ' ').trim().slice(0, maxChars)
}

/**
 * W13.1 note (typing before a worker's room message): with W14b the worker's
 * 回贴 paths are gone — it speaks through `say`, and W19 made that light real:
 * the work turn is watched for streaming `say` arguments exactly like a room
 * turn (see spawnWork below). What is left here posts only system lines, which
 * nobody is "typing".
 */

function haltedCountOf(task: CollabTask): number {
  return task.haltedCount ?? 0
}

function buildBriefing(roomSessionId: string, task: CollabTask, resuming = false): string {
  const roomSession = store.getSession(roomSessionId)
  const roomName = roomSession?.name ?? '群聊'
  const pmAgentId = roomSession?.room?.pmAgentId
  const pm = pmAgentId && pmAgentId !== task.assigneeAgentId ? agentName(pmAgentId) : ''
  // W10: the briefing is read BY the assignee — its own cards say 「你(小研)」,
  // matching what the board tool will hand back later in the same session.
  const self = task.assigneeAgentId
    ? { agentId: task.assigneeAgentId, name: agentName(task.assigneeAgentId) }
    : undefined
  const digest = renderCollabBoardDigest(loadCollabBoard(roomSessionId), agentName, self)
  const tail = roomTranscriptTail(roomSessionId, 12)
  return [
    // 续做版(collab-team-v2 §5.3):现场就在本会话里,所以不重述任务背景,
    // 直接让它盘点。说"此前被中断"而不说被什么中断——超时、停止、重启在模型
    // 这一侧是同一件事:上次没做完。
    resuming
      ? `这个任务此前的执行被中断了,现在继续。你的工作历史就在本会话里——先盘点已经做到哪一步(别重复已完成的写入),再往下做。`
      : `你被指派了群聊「${roomName}」看板上的任务,请在这个工作会话里完成它。`,
    '',
    `任务 #${task.id}(当前 rev ${task.rev})`,
    `标题: ${task.title}`,
    task.description ? `详情: ${task.description}` : null,
    task.rejections > 0 ? `注意: 此前的交付被评审打回过 ${task.rejections} 次,最新评审意见在下方群聊记录里。` : null,
    '',
    '看板现状:',
    digest,
    tail ? `\n群聊最近的讨论:\n${tail}` : null,
    '',
    // W14b 交付自主化(用户实锤"交付像程序编排的 trigger,不是 agent 自主行为"):
    // 交付的话由执行者自己说 —— say 是他的嘴,board complete 是流转。
    `完成后先用 say 把关键结论发进群里${pm ? `(顺手 @ 负责人 ${pm})` : ''},再调用 board 工具 `
      + `{ action: "complete", taskId: "${task.id}", summary: 交付摘要 } 作为你的最后一个动作,任务进入评审。`,
    `工作过程中随时可以用 say 在群里说一句(有发现、要确认、卡住了);不说也没关系。无法继续时用 board `
      + `{ action: "block", taskId: "${task.id}", reason: 原因 }。`,
    // 工作台的 system prompt 是完整产品提示词(collabRoomOverrides 只认 room/
    // agent 两种 kind),所以这份 briefing 是通用规则唯一够得着工作台的入口。
    '',
    buildCollabWorkRules(),
  ].filter(line => line !== null).join('\n')
}

async function spawnWork(roomSessionId: string, task: CollabTask): Promise<void> {
  if (!host) return
  const assignee = task.assigneeAgentId
  if (!assignee) return
  const agent = findAgent(assignee)
  if (!agent) {
    host.postTaskSystemLine(roomSessionId, `无法执行「${task.title}」:成员 ${assignee} 不存在`)
    return
  }
  // 退休的人不被指派开工(域模型 §3.2)。卡留在板上等改派 —— 静默不开工会让
  // 一张卡永远停在 doing 上,说一句是让人能动手的最小成本。
  if (!isActiveAgent(agent)) {
    host.postTaskSystemLine(roomSessionId, `无法执行「${task.title}」:${agent.name} 已注销,请改派他人`)
    return
  }

  /**
   * 续做模式(collab-team-v2 §5.3)。
   *
   * 一张被中断过的卡带着它上一条工作台会话。重开一条新会话等于把现场扔掉,
   * 让模型从零开始猜自己上次做到哪儿了;重驱**同一条**会话则什么都不用做 ——
   * 它自己的转录就是现场。冷加载时 sanitize 已经把半截 step/toolCall 收口成
   * Interrupted 态,模型看到的是干净的"做到一半"。
   *
   * 这就是不变量二的兑现:流从不恢复,只重驱。没有断点续传这种机制,也不需要。
   *
   * 会话不在了(被删、损坏、迁移丢失)就退回新建并 append —— evidence 采集按
   * workSessionIds 列表遍历,天然覆盖多段执行。
   */
  const previousWorkSessionId = task.workSessionIds[task.workSessionIds.length - 1]
  const resuming = Boolean(previousWorkSessionId && store.getSession(previousWorkSessionId))
  const workSessionId = resuming ? previousWorkSessionId! : randomUUID()
  activeByTask.set(task.id, { roomSessionId, taskId: task.id, agentId: assignee, workSessionId })

  // W19: a worker that says something mid-task (or delivers with `say`) lights
  // the room's typing line for exactly as long as that call's words stream.
  // Attached only for this work turn and detached in the finally below.
  let detachTyping: (() => void) | null = null

  try {
    if (!resuming) {
      // createSession moves the global current-session pointer — restore it
      // (scheduler agent-task-runner precedent).
      const previousSessionId = store.getCurrentSessionId()
      store.createSession(workSessionId, `[任务] ${task.title}`)
      if (previousSessionId) store.setCurrentSessionId(previousSessionId)
    }

    store.updateSessionCollab(workSessionId, {
      kind: 'work',
      collab: { roomSessionId, taskId: task.id },
    })
    store.updateSessionAgent(workSessionId, assignee)
    const roomSession = store.getSession(roomSessionId)
    // collab-team-v2 §7:工作台的 cwd 是群 folder —— 房间设过 workingDirectory
    // 就是它,没设过就是自动分配的 <store>/rooms/<id>/。「产出放哪儿」因此
    // 不再需要任何新工具或新约定。
    const roomWorkdir = ensureCollabRoomFolder(roomSessionId)
    if (roomWorkdir) store.updateSessionWorkingDirectory(workSessionId, roomWorkdir)
    // Work sessions inherit the room's permission mode — a room set to
    // auto-approve (e.g. headless self-tests, trusted projects) must not have
    // its workers stall on asks nobody will answer.
    //
    // P1-4: only at CREATION. Re-stamping on every 续做 made the snapshot a
    // recurring overwrite: a user who loosened/tightened this work session by
    // hand had the room's value copied back over it on the next round. Room
    // changes that must take effect immediately do so through the ask-time
    // composition (agents/profile.ts reads the live value), not through here.
    if (!resuming && roomSession?.permissionMode) {
      store.updateSessionPermissionMode(workSessionId, roomSession.permissionMode)
    }
    /**
     * P1-4: a session the user pinned by hand outranks the agent's binding.
     *
     * Two things follow from one flag. (1) The system copy below is marked
     * `pinned: false`, i.e. indistinguishable from "no pick" — so re-copying
     * over a `pinned: true` record would erase the user's choice on the next
     * 续做. (2) The command-level override further down would beat the session
     * entirely (`withAgentModelBinding` short-circuits on any command that
     * already carries providerId), so a pinned session must not get one:
     * without it the engine resolves the session's own model, which is exactly
     * what the user picked.
     */
    const workModelPinned = store.getSession(workSessionId)?.modelPinned === true
    if (!workModelPinned && agent.model?.providerId && agent.model?.modelId) {
      // Not a user pick — this IS the agent's binding being applied, so it must
      // not read back later as "the user chose otherwise".
      store.updateSessionModel(workSessionId, agent.model.providerId, agent.model.modelId, { pinned: false })
    }

    await patchCollabTask(roomSessionId, task.id, {
      status: 'doing',
      // 续做不新增一段:重驱的就是列表里最后那一条。
      ...(resuming ? {} : { workSessionIds: [...task.workSessionIds, workSessionId] }),
    })
    host.postTaskSystemLine(
      roomSessionId,
      resuming
        ? `「${task.title}」→ ${agent.name} 续做(接着原来的工作会话往下做)`
        : `「${task.title}」→ ${agent.name} 开始执行(看板可查看现场)`,
    )

    if (!(await host.waitForEngineBound())) {
      throw new Error('engine has no bound sender')
    }
    // W14b: the watermark for "did this worker speak for itself" — every say it
    // posts into the room lands after this instant.
    const startedAt = Date.now()
    detachTyping = observeCollabSayTyping({
      sessionId: workSessionId,
      roomSessionId,
      agentId: assignee,
    })
    await getEventBus().emit(workSessionId, {
      type: 'command:send-message',
      channel: host.roomChannel(roomSessionId),
      content: buildBriefing(roomSessionId, getCollabTask(roomSessionId, task.id) ?? task, resuming),
      source: COLLAB_MESSAGE_SOURCE,
      origin: { transport: 'api', source: COLLAB_MESSAGE_SOURCE, receivedAt: Date.now() },
      suppressTitleGeneration: true,
      // W13.3: task execution is room work, not a chat turn.
      usageSource: COLLAB_USAGE_SOURCE_WORK,
      // P1-4: no override on a pinned session — see workModelPinned above.
      ...(workModelPinned
        ? {}
        : {
            ...(agent.model?.providerId ? { providerId: agent.model.providerId } : {}),
            ...(agent.model?.modelId ? { model: agent.model.modelId } : {}),
            ...(agent.model?.thinking && agent.model?.providerId
              ? { thinking: true, thinkingEffort: agent.model.thinking }
              : {}),
          }),
    } as Parameters<ReturnType<typeof getEventBus>['emit']>[1])

    const outcome = await host.waitForTurn(workSessionId, WORK_START_TIMEOUT_MS, WORK_TOTAL_TIMEOUT_MS)
    if (outcome === 'timeout') {
      // Never leave a zombie stream: the slot is about to be freed and the
      // one-worker-per-task invariant depends on the stream actually ending.
      getStreamEngineSafe()?.abort(workSessionId)
    }
    // The harvest is NOT part of the spawn (P3). The catch below means "this
    // task never started, put it back" — and it used to swallow harvest
    // failures too, so a card the worker had already delivered into `review`
    // was quietly pushed back to `todo` by an error in the reporting code that
    // ran after it. The turn is over by now; a failure here is a logging
    // matter, not a re-dispatch.
    try {
      await harvestWork(roomSessionId, task.id, workSessionId, assignee, outcome, startedAt)
    } catch (error) {
      console.error('[collab] work harvest failed:', error)
    }
  } catch (error) {
    console.error('[collab] work spawn failed:', error)
    host.postTaskSystemLine(roomSessionId, `「${task.title}」启动失败,任务退回待办`)
    await patchCollabTask(roomSessionId, task.id, { status: 'todo' })
  } finally {
    detachTyping?.()
    activeByTask.delete(task.id)
    pumpQueues()
  }
}

/**
 * Did the worker speak for itself while the task ran (W14b 交付自主化)?
 *
 * The room transcript is the only honest place to ask: a `say` from a work
 * session lands in the ROOM under the worker's name, and the harvest's whole
 * job is now to fill the gap only when there is one.
 */
function collabSaysSince(
  roomSessionId: string,
  agentId: string,
  sinceTs: number,
): ChatMessage[] {
  const messages = (store.getSession(roomSessionId)?.messages ?? []) as ChatMessage[]
  const says: ChatMessage[] = []
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index]
    if (message.timestamp < sinceTs) break
    if (message.agentId === agentId && isCollabSayMessage(message)) says.unshift(message)
  }
  return says
}

async function harvestWork(
  roomSessionId: string,
  taskId: string,
  workSessionId: string,
  agentId: string,
  outcome: 'complete' | 'error' | 'aborted' | 'timeout',
  startedAt: number,
): Promise<void> {
  if (!host) return
  const task = getCollabTask(roomSessionId, taskId)
  if (!task) return

  // W14b: the worker's own utterances during this run. Their existence is what
  // decides whether the harvest has anything left to say (see below).
  const spokeFor = collabSaysSince(roomSessionId, agentId, startedAt)

  if (task.status === 'review' && task.report) {
    // Worker declared completion via the board tool during the turn.
    const evidence = collectWorkEvidence([workSessionId], roomWorkingDirectory(roomSessionId))
    // 用户实锤:交付是 agent 的自主行为,不是编排出来的 trigger。所以这里不再
    // 以执行者的名义代笔贴「【交付】…」——它自己已经说过了。一句都没说时,
    // 房间仍然要知道卡动了,兜底走**系统行**(不冒名,§4.5 W14b)。
    const messageId = spokeFor[spokeFor.length - 1]?.id
    if (!messageId) {
      host.postTaskSystemLine(
        roomSessionId,
        buildCollabSilentDeliveryLine({
          title: task.title,
          assigneeName: agentName(agentId),
          summary: task.report.summary,
          kind: 'delivery',
        }),
      )
    }
    await patchCollabTask(roomSessionId, taskId, {
      report: { ...task.report, ...(messageId ? { messageId } : {}), evidence },
    })
    // W9b.4: the receipt goes out as a TASK system line, next to the report but
    // in a channel the model cannot write — a delivery claim and its execution
    // trace must not come from the same mouth.
    host.postTaskSystemLine(
      roomSessionId,
      buildCollabTaskDeliveredLine({ title: task.title, assigneeName: agentName(agentId), evidence }),
    )

    const pm = store.getSession(roomSessionId)?.room?.pmAgentId
    if (pm && pm !== agentId) {
      host.enqueueRoomActivation(roomSessionId, pm, 'task-event', COLLAB_DRIVE_LABEL_TASK_REVIEW)
    } else {
      host.postTaskSystemLine(roomSessionId, `「${task.title}」进入评审,等你确认(看板 move done / 打回 todo)`)
    }
    return
  }

  if (task.status === 'blocked') {
    // W9.2: 受阻不是交付。事故里 worker 如实标了受阻,房间侧却没人看见——
    // 事实行进投影(W9.1),负责人被拉进来做**处置**决定(重派/换人/改方案/
    // 问用户),而不是评审一份并不存在的交付。
    // W9b.3: 原因落卡——模型 block 时带的说明优先,否则退到工作会话末条
    // assistant 文本,再否则退到本轮的终局(超时/中止/出错)。
    const outcomeReason = outcome === 'timeout' ? '执行超时'
      : outcome === 'aborted' ? '执行被中止'
      : outcome === 'error' ? '执行出错'
      : ''
    const reason = task.blockReason?.trim()
      || lastAssistantExcerpt(workSessionId, COLLAB_BLOCK_REASON_MAX_CHARS)
      || outcomeReason
    if (reason && reason !== task.blockReason) {
      await patchCollabTask(roomSessionId, taskId, { blockReason: reason })
    }

    const assigneeName = agentName(agentId)
    // W9b.2: per-task halt cap. 事故回路是 受阻 → PM 解阻 → 受阻 → …,靠用户
    // 消息才止住;第 COLLAB_MAX_HALTS 次起房间闭嘴,把决定权交回用户。
    const halted = haltedCountOf(task)
    if (halted >= COLLAB_MAX_HALTS) {
      host.postTaskSystemLine(
        roomSessionId,
        buildCollabTaskHaltCapLine({ title: task.title, haltedCount: halted, assigneeName, reason }),
      )
      return
    }

    host.postTaskSystemLine(
      roomSessionId,
      buildCollabTaskHaltedLine({ title: task.title, assigneeName, reason }),
    )
    const pm = store.getSession(roomSessionId)?.room?.pmAgentId
    if (pm && pm !== agentId) {
      host.enqueueRoomActivation(roomSessionId, pm, 'task-event', COLLAB_DRIVE_LABEL_TASK_HALTED)
    }
    return
  }

  if (outcome === 'complete') {
    // Turn ended without a board complete. If the worker already told the room
    // where it stands (W14b), the room has its update from the horse's mouth
    // and the harvest adds nothing. Otherwise the same non-impersonating
    // fallback the delivery path uses: a system line carrying the excerpt.
    if (spokeFor.length === 0) {
      const work = store.getSession(workSessionId)
      const lastAssistant = [...(work?.messages ?? [])].reverse()
        .find(message => message.role === 'assistant' && message.content)
      host.postTaskSystemLine(
        roomSessionId,
        buildCollabSilentDeliveryLine({
          title: task.title,
          assigneeName: agentName(agentId),
          summary: (lastAssistant?.content ?? '').slice(0, PROGRESS_EXCERPT_CHARS),
          kind: 'progress',
        }),
      )
    }
    return
  }

  // Card already settled by PM/user (done, or moved to review manually):
  // the abort was intentional — no misleading interruption line.
  if (task.status !== 'doing' && task.status !== 'todo') return
  // Already queued for re-execution (解阻重派 / 换人): the abort IS the
  // re-dispatch, and "任务未交付,可重新指派继续" would contradict the respawn
  // that is one tick away (W9b.1).
  if (pendingByRoom.get(roomSessionId)?.includes(taskId)) return
  // Same reasoning for the 总闸: freezing aborts every live worker at once, and
  // one interruption line per card under the freeze's own 「房间已全部暂停」
  // notice is noise that says nothing new. The card keeps its 'doing' status
  // and comes back with `resumeRoomWork`.
  if (roomFrozen(roomSessionId)) return
  // 用户按了卡上的「停止执行」:卡已收敛、说明已贴,这一行是同一件事的第二遍。
  if (stoppedByUser.delete(taskId)) return

  // collab-team-v2 §5.2/§5.4: 收敛到 todo(保留 assignee),而不是把卡悬在
  // doing 上只说一句话。悬着的 doing 是最坏的一种:并发闸把它当在跑的活占着
  // 槽位,看板把它显示成有人在做,而实际上没有任何流还活着。
  //
  // 不计 haltedCount —— 这里走的是 patchCollabTask 而非 reducer,所以既不会
  // 烧掉自动处置预算,也不会发出板事件触发自动重驱:续做是一个决定,由人、
  // 由 PM、或由下一次激活里的 agent 用 board start 作出。
  const why = outcome === 'timeout' ? '执行超时' : outcome === 'aborted' ? '执行被中止' : '执行出错'
  await patchCollabTask(roomSessionId, taskId, { status: 'todo' })
  host.postTaskSystemLine(roomSessionId, buildCollabTaskInterruptedLine({
    title: task.title,
    assigneeName: task.assigneeAgentId ? agentName(task.assigneeAgentId) : undefined,
    cause: why,
    hasWorkSession: task.workSessionIds.length > 0,
  }))
}

function roomFrozen(roomSessionId: string): boolean {
  const session = store.getSession(roomSessionId)
  return session?.kind !== 'room' || Boolean(session.room?.frozen)
}

function scheduleWork(roomSessionId: string, task: CollabTask): void {
  if (!host) return
  if (activeByTask.has(task.id)) return // one active work session per task
  if (roomFrozen(roomSessionId)) return
  void host.isRoomOverBudget(roomSessionId).then(over => {
    if (!over) {
      scheduleWorkUnbudgeted(roomSessionId, task)
      return
    }
    // collab-team-v2 §5.2 预算去静默:超预算此前是原地 return,于是一张刚被
    // 指派的卡就那么停着,看板上读起来是「派了没人动」——最像 bug 的一种正常
    // 行为。`isRoomOverBudget` 每天贴一次房间级的通知,但那条通知可能早在别处
    // (比如一次被拒的 say)就用掉了,而看着这张卡的人未必读到过。
    //
    // 每卡每天一次:说清楚是哪张卡被拦下,又不至于把一屋子卡刷成一屏。
    const today = budgetDayKey()
    if (budgetBlockedNoticeDay.get(task.id) === today) return
    budgetBlockedNoticeDay.set(task.id, today)
    host?.postTaskSystemLine(
      roomSessionId,
      `「${task.title}」暂不执行:这个群今天的预算已用完。明天自动恢复,或由用户调整房间预算。`,
    )
  })
}

function enqueuePending(roomSessionId: string, taskId: string): void {
  const queue = pendingByRoom.get(roomSessionId) ?? []
  if (!queue.includes(taskId)) queue.push(taskId)
  pendingByRoom.set(roomSessionId, queue)
}

/**
 * W9b.1 — the death-path fix. Re-dispatch (解阻重派 / 换人 / 重开已完成的卡)
 * used to change a column and nothing else: no board event, no spawnWork, zero
 * work sessions in the dump, and the "retry" degenerated into room theatre.
 * Every re-dispatch now lands here.
 *
 * Idempotence: a card with a live work session for the SAME assignee is left
 * alone (never two workers per card, the activeByTask invariant). A live
 * session for a DIFFERENT assignee — or one whose card was pulled back to todo
 * — is aborted first (D6 abort-first) and the card queued, so the re-spawn
 * happens from spawnWork's finally → pumpQueues, after the slot is free.
 *
 * The halt cap (W9b.2) gates agent-driven re-dispatch only: a user moving the
 * card themselves always executes.
 */
function requeueWork(roomSessionId: string, task: CollabTask, options: { byUser: boolean }): void {
  if (!host) return
  if (!task.assigneeAgentId) return

  const halted = haltedCountOf(task)
  if (!options.byUser && halted >= COLLAB_MAX_HALTS) {
    host.postTaskSystemLine(
      roomSessionId,
      buildCollabTaskRequeueRefusedLine({ title: task.title, haltedCount: halted }),
    )
    return
  }

  const active = activeByTask.get(task.id)
  if (active) {
    if (active.agentId === task.assigneeAgentId && task.status === 'doing') return // already executing
    getStreamEngineSafe()?.abort(active.workSessionId)
    enqueuePending(roomSessionId, task.id)
    return
  }
  scheduleWork(roomSessionId, task)
}

function scheduleWorkUnbudgeted(roomSessionId: string, task: CollabTask): void {
  if (!host) return
  if (activeByTask.has(task.id)) return
  if (roomFrozen(roomSessionId)) return

  if (activeCount(roomSessionId) >= MAX_CONCURRENT_WORK_PER_ROOM || activeCount() >= MAX_CONCURRENT_WORK_GLOBAL) {
    enqueuePending(roomSessionId, task.id)
    host.postSystemLine(roomSessionId, `「${task.title}」排队等待执行(并发上限)`)
    return
  }
  void spawnWork(roomSessionId, task)
}

function pumpQueues(): void {
  for (const [roomSessionId, queue] of pendingByRoom) {
    if (roomFrozen(roomSessionId)) continue // frozen rooms hold their queue
    while (queue.length > 0) {
      if (activeCount(roomSessionId) >= MAX_CONCURRENT_WORK_PER_ROOM || activeCount() >= MAX_CONCURRENT_WORK_GLOBAL) break
      const taskId = queue.shift()!
      const task = getCollabTask(roomSessionId, taskId)
      // status filter mirrors spawn eligibility; 'blocked' never reaches here
      // because assign now un-blocks to todo (评审修订).
      if (task && (task.status === 'todo' || task.status === 'doing') && task.assigneeAgentId) {
        void spawnWork(roomSessionId, task)
      }
    }
    if (queue.length === 0) pendingByRoom.delete(roomSessionId)
  }
}

/**
 * The room is gone (P2-10): stop its workers and forget it entirely.
 *
 * Same abort-first shape as the freeze, but nothing is coming back — the
 * pending queue and the active entries are dropped rather than parked, because
 * there is no board left to re-schedule them from.
 */
export function forgetCollabRoomWork(roomSessionId: string): void {
  pendingByRoom.delete(roomSessionId)
  for (const [taskId, work] of [...activeByTask]) {
    if (work.roomSessionId !== roomSessionId) continue
    getStreamEngineSafe()?.abort(work.workSessionId)
    activeByTask.delete(taskId)
  }
}

/** 总闸 (D8): abort every live worker of the room and drop its queue. */
export function freezeRoomWork(roomSessionId: string): void {
  pendingByRoom.delete(roomSessionId)
  for (const work of activeByTask.values()) {
    if (work.roomSessionId === roomSessionId) {
      getStreamEngineSafe()?.abort(work.workSessionId)
    }
  }
}

/**
 * Unfreezing re-schedules every assigned card the freeze stranded.
 *
 * 'doing' is included on purpose: the 总闸 aborts live workers but leaves their
 * cards in 'doing' (the interruption line is suppressed for exactly this
 * reason), so a todo-only sweep left them beached until the next app restart,
 * where `reconcileRoomBoard` would finally notice and mark them blocked. The
 * two dispositions are now symmetric — restart blocks them, unfreeze resumes
 * them — and a card with a live worker is skipped either way.
 */
export function resumeRoomWork(roomSessionId: string): void {
  const board = loadCollabBoard(roomSessionId)
  for (const task of board.tasks) {
    if (
      (task.status === 'todo' || task.status === 'doing')
      && task.assigneeAgentId
      && !activeByTask.has(task.id)
    ) {
      scheduleWork(roomSessionId, task)
    }
  }
}

function handleBoardEvent(roomSessionId: string, event: CollabBoardEvent): void {
  if (!host) return
  switch (event.type) {
    /**
     * 开工是一个动作(collab-team-v2 §3)。这是唯一一个还会开工作台的板事件。
     */
    case 'task-started':
      requeueWork(roomSessionId, event.task, { byUser: event.byUser })
      return

    /**
     * 指派 / 重新指派 / 解阻回 todo / 重开 done —— 一律只是**通知**(§3.2)。
     *
     * 此前这条分支直接 spawnWork:被指派的瞬间砰地开一条会话,被派活的人没有
     * 提问的余地,这就是那股官僚味的来源。现在把话带到被指派者的常驻会话,
     * 由 TA 自己决定问清楚、开工、还是 block 说明做不了。
     *
     * halt/打回上限照旧在 requeueWork 里 —— 但那条路现在只有真正的开工走,
     * 所以这里改用同一份上限判断来决定"还要不要再叫人",免得一张已经烧光
     * 自动处置预算的卡靠反复重派把人一直叫醒。
     */
    case 'task-assigned':
    case 'task-requeued': {
      const assignee = event.task.assigneeAgentId
      if (!assignee) return

      // D6 abort-first 不因为"指派改成通知"而失效:一张 doing 卡被挪回 todo
      // (或被改派给别人)时,原来那条流必须先停,否则看板说这活在待办、进程里
      // 却还有人在干,两边说的不是同一件事。
      //
      // 唯一不动手的情形:同一个人、卡还在 doing —— 那是一次重复指派,no-op。
      const active = activeByTask.get(event.task.id)
      if (active) {
        if (active.agentId === assignee && event.task.status === 'doing') return
        getStreamEngineSafe()?.abort(active.workSessionId)
      }
      const halted = haltedCountOf(event.task)
      if (!event.byUser && halted >= COLLAB_MAX_HALTS) {
        host.postTaskSystemLine(
          roomSessionId,
          buildCollabTaskRequeueRefusedLine({ title: event.task.title, haltedCount: halted }),
        )
        return
      }
      host.postTaskSystemLine(roomSessionId, buildCollabTaskAssignedLine({
        title: event.task.title,
        taskId: event.task.id,
        assigneeName: agentName(assignee),
        ...(event.task.blockReason ? { reason: event.task.blockReason } : {}),
      }))
      host.enqueueRoomActivation(roomSessionId, assignee, 'task-event', COLLAB_DRIVE_LABEL_TASK_ASSIGNED)
      return
    }
    case 'task-rejected': {
      if (event.task.rejections > COLLAB_MAX_REJECTIONS) {
        void patchCollabTask(roomSessionId, event.task.id, {
          status: 'blocked',
          // 打回超限转受阻也是一次受阻:计数,否则回路能靠 review→todo 绕开闸。
          haltedCount: haltedCountOf(event.task) + 1,
          blockReason: `评审打回 ${event.task.rejections} 次仍未通过,超出自动重做上限`,
        })
        host.postTaskSystemLine(
          roomSessionId,
          `「${event.task.title}」已打回 ${event.task.rejections} 次,超出自动重做上限,转为受阻等你定夺`,
        )
        return
      }
      scheduleWork(roomSessionId, event.task)
      return
    }
    case 'task-completed': {
      // Normally harvested when the work turn ends; handle the room-side
      // complete (PM completing a card directly) where no worker is live.
      if (activeByTask.has(event.task.id)) return
      // W9b.4: no work session ran for this completion — say so where the
      // reviewer reads, before it decides on a report nothing backs.
      host.postTaskSystemLine(
        roomSessionId,
        buildCollabTaskDeliveredLine({
          title: event.task.title,
          assigneeName: event.task.assigneeAgentId ? agentName(event.task.assigneeAgentId) : undefined,
          evidence: collectWorkEvidence(event.task.workSessionIds, roomWorkingDirectory(roomSessionId)),
        }),
      )
      const pm = store.getSession(roomSessionId)?.room?.pmAgentId
      if (pm && event.task.assigneeAgentId && pm !== event.task.assigneeAgentId) {
        host.enqueueRoomActivation(roomSessionId, pm, 'task-event', COLLAB_DRIVE_LABEL_TASK_REVIEW)
      }
      return
    }
    case 'task-done': {
      // D6 abort-first still applies (a doing card can be closed directly).
      const active = activeByTask.get(event.task.id)
      if (active) getStreamEngineSafe()?.abort(active.workSessionId)
      // W9b.4: the receipt at close. A card whose report was written without a
      // single tool call reads 「无执行记录」 — the theatre tell, code-stamped.
      host.postTaskSystemLine(
        roomSessionId,
        buildCollabTaskDoneLine({
          title: event.task.title,
          evidence: event.task.report?.evidence
            ?? collectWorkEvidence(event.task.workSessionIds, roomWorkingDirectory(roomSessionId)),
        }),
      )
      return
    }
    case 'task-blocked':
    case 'task-halted': {
      // D6 abort-first: a doing card moved away (or blocked) stops its worker.
      const active = activeByTask.get(event.task.id)
      if (active) getStreamEngineSafe()?.abort(active.workSessionId)
      return
    }
  }
}

/**
 * Boot reconciliation for boards (§6.3, re-aimed by collab-team-v2 §5.3).
 *
 * A 'doing' card with no live worker is a crash artifact: the流 state is pure
 * memory and died with the process, so nothing is executing it. It used to be
 * parked in `blocked`, which said the wrong thing — blocked means "a human must
 * decide something", and a power cut is not a decision. It now goes to **todo
 * with its assignee kept**, which with `board start` IS the resumable state.
 *
 * Two disciplines carry over unchanged from the old code, and both matter:
 * haltedCount is NOT bumped (a few restarts must not spend the card's automatic
 * disposition budget), and nothing is re-driven here — recovery never replays
 * side effects by itself.
 */
export function reconcileRoomBoard(roomSessionId: string): void {
  if (!host) return
  const board = loadCollabBoard(roomSessionId)
  for (const task of board.tasks) {
    if (task.status === 'doing' && !activeByTask.has(task.id)) {
      void patchCollabTask(roomSessionId, task.id, { status: 'todo' })
      host.postTaskSystemLine(roomSessionId, buildCollabTaskInterruptedLine({
        title: task.title,
        assigneeName: task.assigneeAgentId ? agentName(task.assigneeAgentId) : undefined,
        cause: '因重启中断',
        hasWorkSession: task.workSessionIds.length > 0,
      }))
    }
  }
}

/**
 * 卡级停止(collab-team-v2 §5.1 入口②)。
 *
 * 「停止执行」与「标受阻」是两件事,此前只有后者可用,于是想按暂停的人只能
 * 去点一个宣告「这事儿卡住了、要人裁决」的按钮 —— 语义被迫撒谎,还白烧一次
 * haltedCount。这条路只做它字面上的事:停流、把卡放回可续做的待办、在群里
 * 留一行说明。
 *
 * 返回 false = 这张卡此刻没有在跑的执行,按钮不该出现在那儿。
 */
export async function stopCollabTaskWork(roomSessionId: string, taskId: string): Promise<boolean> {
  if (!host) return false
  const active = activeByTask.get(taskId)
  if (!active || active.roomSessionId !== roomSessionId) return false
  const task = getCollabTask(roomSessionId, taskId)

  // abort 会唤醒 harvestWork,而 todo 正是它认作"还没完事"的状态之一 —— 不闩
  // 一下,同一次停止会被说两遍(这里一行,harvest 的中断分支再一行)。与冻结
  // 抑制中断行是同一个理由:说明由发起停止的那一方负责,只说一次。
  stoppedByUser.add(taskId)
  await patchCollabTask(roomSessionId, taskId, { status: 'todo' })
  getStreamEngineSafe()?.abort(active.workSessionId)
  if (task) {
    host.postTaskSystemLine(roomSessionId, buildCollabTaskInterruptedLine({
      title: task.title,
      assigneeName: task.assigneeAgentId ? agentName(task.assigneeAgentId) : undefined,
      cause: '执行已被停止',
      hasWorkSession: task.workSessionIds.length > 0,
    }))
  }
  return true
}

/** 这张卡此刻有没有在跑的执行 —— 「停止执行」菜单项的显示条件。 */
export function hasActiveCollabWork(taskId: string): boolean {
  return activeByTask.has(taskId)
}

export function initializeCollabWorkers(workerHost: WorkerHost): void {
  host = workerHost
  disposeBoardEvents = onCollabBoardEvent(handleBoardEvent)
}

export function shutdownCollabWorkers(): void {
  disposeBoardEvents?.()
  disposeBoardEvents = null
  host = null
  activeByTask.clear()
  pendingByRoom.clear()
  stoppedByUser.clear()
  budgetBlockedNoticeDay.clear()
}
