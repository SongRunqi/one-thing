import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { CollabBoard, CollabCoordinatorState, CollabTask } from '@shared/ipc.js'
import { platformApi } from '@/platform'
import { invalidateCollabTagCards } from '@/composables/collabInlineTags'

/**
 * Room board mirrors (docs/design/multi-agent-collab.md P1): hydrate via
 * COLLAB_BOARD_GET, then follow 'collab:board-changed' session events —
 * the main-process store broadcasts a full (small) snapshot per change.
 */
/** A 'typing: true' with no matching false is forgotten after this long. The
 *  coordinator's false can go missing (crash, restart, dropped event) and a
 *  room stuck at "正在输入" forever is worse than one that forgets — so trues
 *  carry their timestamp and expire on read. */
const TYPING_TTL_MS = 60_000
/**
 * A permission event is a hint that the session's ask set MOVED, not a delta to
 * apply — several can land in one tick (a settle immediately followed by the
 * next queued prompt's request), and re-asking once for the settled truth is
 * both cheaper and more correct than trying to replay the sequence.
 */
const PENDING_RECONCILE_DEBOUNCE_MS = 200

export const useCollabBoardStore = defineStore('collabBoard', () => {
  const boards = ref<Record<string, CollabBoard>>({})
  /** Sessions with a permission ask outstanding (worker waiting on approval). */
  const pendingAsks = ref<Record<string, number>>({})
  /** IM typing indicator (multi-agent-collab-im §2.4): sessionId → agentId →
   *  last 'typing: true' timestamp. Insertion order = who started first. */
  const typing = ref<Record<string, Record<string, number>>>({})
  /**
   * 房间当前有没有一轮发言在跑(collab-team-v2 §5.1 入口①):
   * roomSessionId → 占着场子的 agentId。
   *
   * 与 `typing` 分开存是刻意的:typing 在一轮里明灭数次(每次 say 的参数流),
   * 拿它当停止按钮的可见性,按钮就会在两句话之间消失 —— 正好是想打断的人伸手
   * 的那几秒。这个信号一轮只翻两次,窗口与主进程 `abortRoomTurn` 的靶完全同宽。
   */
  const roomTurnAgents = ref<Record<string, string>>({})
  /**
   * 协调器运行时状态(docs/design/collab-coordinator-inspector.md):
   * roomSessionId → 最近一次快照。
   *
   * 挂在这个 store 而不是新开一个:它与看板走的是**同一条**会话事件通道,而
   * `ensureSubscribed` 是那条通道唯一的订阅处 —— 为一个分支再开一个 store,
   * 就有了两处订阅、两份生命周期,以及迟早对不上的两个"是否已订阅"标志。
   */
  const coordinators = ref<Record<string, CollabCoordinatorState>>({})
  const reconcileTimers = new Map<string, ReturnType<typeof setTimeout>>()
  let subscribed = false

  /**
   * Ask the main process what this session is actually waiting on (P1-3).
   *
   * The badge used to be kept by ±1 event accounting, which cannot be right
   * even in principle: core emits `permission:request` for the HEAD of a
   * session's prompt queue only, while every prompt — queued followers
   * included — emits `permission:settled`, so the ledger drifted negative and a
   * `Math.max(0, …)` clamp hid it. Worse, nothing rebuilt it on reload: a
   * window reopened over a worker waiting for approval showed no badge at all.
   *
   * `getPendingPermissions` is the source of truth core already exposes
   * (promptState and all), so the count is derived rather than accumulated.
   * Queued prompts count too — a session sitting behind its own queue is still
   * a session waiting on the user, which is exactly what the badge claims.
   */
  async function reconcilePending(sessionId: string): Promise<void> {
    try {
      const response = await platformApi.getPendingPermissions(sessionId)
      const count = response?.success && response.pending ? response.pending.length : 0
      pendingAsks.value = { ...pendingAsks.value, [sessionId]: count }
    } catch (error) {
      // Keep the last known count: a failed read is not evidence of an empty
      // queue, and dropping the badge would tell the user the opposite.
      console.error('[collabBoard] pending reconcile failed:', error)
    }
  }

  function scheduleReconcile(sessionId: string): void {
    const existing = reconcileTimers.get(sessionId)
    if (existing) clearTimeout(existing)
    reconcileTimers.set(sessionId, setTimeout(() => {
      reconcileTimers.delete(sessionId)
      void reconcilePending(sessionId)
    }, PENDING_RECONCILE_DEBOUNCE_MS))
  }

  function setTyping(sessionId: string, agentId: string, isTyping: boolean): void {
    const current = typing.value[sessionId]
    if (isTyping) {
      // Spreading an existing key keeps its original slot, so a re-affirmed
      // typing (the coordinator restates true before every drive) refreshes
      // the deadline without reshuffling the name order.
      typing.value = { ...typing.value, [sessionId]: { ...current, [agentId]: Date.now() } }
      return
    }
    if (!current || !(agentId in current)) return
    const next = { ...current }
    delete next[agentId]
    typing.value = { ...typing.value, [sessionId]: next }
  }

  /**
   * 关窗只认关它的那个人 —— 一条迟到的 idle 不该抹掉后一轮已经开的窗。房间的
   * 回合队列是串行的,但事件跨进程,顺序不是免费的。
   */
  function setRoomTurnActive(sessionId: string, agentId: string, active: boolean): void {
    if (active) {
      roomTurnAgents.value = { ...roomTurnAgents.value, [sessionId]: agentId }
      return
    }
    if (roomTurnAgents.value[sessionId] !== agentId) return
    const next = { ...roomTurnAgents.value }
    delete next[sessionId]
    roomTurnAgents.value = next
  }

  /** 这个房间此刻有没有可以停的一轮。 */
  function isRoomTurnActive(sessionId: string | undefined | null): boolean {
    return Boolean(sessionId && roomTurnAgents.value[sessionId])
  }

  function ensureSubscribed(): void {
    if (subscribed) return
    subscribed = true
    platformApi.onSessionEvent(envelope => {
      const event = envelope.event as
        | {
          type?: string
          board?: CollabBoard
          agentId?: string
          typing?: boolean
          active?: boolean
          state?: CollabCoordinatorState
        }
        | undefined
      if (!event?.type) return
      if (event.type === 'collab:board-changed' && event.board) {
        applySnapshot(envelope.sessionId, event.board)
      } else if (event.type === 'collab:typing' && typeof event.agentId === 'string') {
        setTyping(envelope.sessionId, event.agentId, event.typing === true)
      } else if (event.type === 'collab:turn-active' && typeof event.agentId === 'string') {
        setRoomTurnActive(envelope.sessionId, event.agentId, event.active === true)
      } else if (event.type === 'collab:coordinator-changed' && event.state) {
        coordinators.value = { ...coordinators.value, [envelope.sessionId]: event.state }
      } else if (event.type === 'permission:request' || event.type === 'permission:settled') {
        // The event says "something moved here"; the count comes from the ask.
        scheduleReconcile(envelope.sessionId)
      }
    })
  }

  async function load(roomSessionId: string): Promise<void> {
    ensureSubscribed()
    try {
      const response = await platformApi.getCollabBoard(roomSessionId)
      if (response.success && response.board) {
        applySnapshot(roomSessionId, response.board)
        // Cold start: nothing replayed the permission events this window missed,
        // so the badges are rebuilt from the live queues of the sessions that
        // can actually be waiting on one — the workers currently executing.
        await hydratePendingAsks(response.board)
      }
    } catch (error) {
      console.error('[collabBoard] load failed:', error)
    }
  }

  async function hydratePendingAsks(board: CollabBoard): Promise<void> {
    const sessionIds = board.tasks
      .filter(task => task.status === 'doing')
      .map(task => task.workSessionIds[task.workSessionIds.length - 1])
      .filter((sessionId): sessionId is string => Boolean(sessionId))
    await Promise.all([...new Set(sessionIds)].map(sessionId => reconcilePending(sessionId)))
  }

  function boardFor(roomSessionId: string): CollabBoard | undefined {
    return boards.value[roomSessionId]
  }

  /**
   * Adopt a snapshot — from the 30ms-coalesced broadcast, from a write's reply
   * (W16: no coalescing wait, so a card the user just moved repaints at once),
   * or from the initial fetch. REPLACE semantics, with one ordering rule
   * (P2-18): a snapshot older than the one on screen is dropped.
   *
   * Three producers race over two paths, and the panel used to keep whichever
   * landed last — a GET issued before an act could answer after it and put the
   * card back where it was. `seq` is stamped by the main-process board store on
   * every commit, so "older" is a fact and not a guess. Boards written before
   * this field read as 0 and stay accepted (0 < 0 is false) rather than frozen.
   */
  function applySnapshot(roomSessionId: string, board: CollabBoard): void {
    const current = boards.value[roomSessionId]
    if (current && (board.seq ?? 0) < (current.seq ?? 0)) return
    boards.value = { ...boards.value, [roomSessionId]: board }
    // 行内 <card> 的验真结果是按 id 记住的,新快照可能刚建了(或删了)那张卡。
    invalidateCollabTagCards()
  }

  /**
   * 按 id 找一张卡 —— 行内 `<card>` 标签验真的后端(collab-team-v2 §6.1)。
   *
   * 接受任意唯一前缀,因为模型照抄的是看板摘要里的 8 位短 id;前缀撞车时返回
   * undefined 而不是"随便挑一张":指不准就等于指不出,这正是验真要的语义。
   */
  function findTask(taskId: string): { roomSessionId: string; task: CollabTask } | undefined {
    const query = (taskId ?? '').trim().replace(/^#/, '')
    if (!query) return undefined
    const matches: { roomSessionId: string; task: CollabTask }[] = []
    for (const [roomSessionId, board] of Object.entries(boards.value)) {
      for (const task of board.tasks) {
        if (task.id === query) return { roomSessionId, task }
        if (task.id.startsWith(query)) matches.push({ roomSessionId, task })
      }
    }
    return matches.length === 1 ? matches[0] : undefined
  }

  /**
   * 看板要滚到并高亮的那张卡。CollabBoardPanel 是被裸实例化的(无 props、无
   * defineExpose),所以"定位到某张卡"这条命令只能经由 store 传达。
   *
   * 带 `at` 时间戳:连点同一张卡时 id 没变,但高亮动画应该重放一次。
   */
  const focusedTask = ref<{ roomSessionId: string; taskId: string; at: number } | null>(null)

  function focusTask(taskId: string): boolean {
    const found = findTask(taskId)
    if (!found) return false
    focusedTask.value = { roomSessionId: found.roomSessionId, taskId: found.task.id, at: Date.now() }
    return true
  }

  function hasPendingAsk(sessionId: string | undefined): boolean {
    return Boolean(sessionId && (pendingAsks.value[sessionId] ?? 0) > 0)
  }

  /**
   * 协调器状态的冷启动:面板打开时补一次,之后跟着会话事件走。
   *
   * 与 `load` 同一形态(先 `ensureSubscribed` 再取快照)—— 反过来的话,取到快照
   * 与装上订阅之间的那几毫秒里发生的调度就永远丢了。
   */
  async function loadCoordinator(roomSessionId: string): Promise<void> {
    if (!roomSessionId) return
    ensureSubscribed()
    try {
      const response = await platformApi.getCollabCoordinator(roomSessionId)
      if (response.success && response.state) {
        coordinators.value = { ...coordinators.value, [roomSessionId]: response.state }
      }
    } catch (error) {
      console.error('[collabBoard] coordinator load failed:', error)
    }
  }

  function coordinatorFor(roomSessionId: string | undefined | null): CollabCoordinatorState | null {
    return (roomSessionId && coordinators.value[roomSessionId]) || null
  }

  /** Members currently typing in a room, oldest first. Expiry is applied here
   *  rather than on a standing timer — nothing ticks while a room is quiet;
   *  the caller re-reads (CollabTypingLine's 1s pulse) only while it shows. */
  function typingAgents(sessionId: string | undefined | null): string[] {
    if (!sessionId) return []
    const entry = typing.value[sessionId]
    if (!entry) return []
    const cutoff = Date.now() - TYPING_TTL_MS
    return Object.keys(entry).filter(agentId => entry[agentId] > cutoff)
  }

  return {
    boards,
    pendingAsks,
    typing,
    load,
    boardFor,
    applySnapshot,
    hasPendingAsk,
    reconcilePending,
    typingAgents,
    ensureSubscribed,
    findTask,
    focusedTask,
    focusTask,
    roomTurnAgents,
    isRoomTurnActive,
    coordinators,
    loadCoordinator,
    coordinatorFor,
  }
})
