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
 *  room stuck at "正在输入" forever is worse than one that forgets — so the
 *  SNAPSHOT carries the timestamp and its typing list expires on read
 *  (架构收敛 C4 §1:兜底挂在快照上,不再是每个 true 自带一个死线)。 */
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
  /**
   * 协调器运行时状态(docs/design/collab-coordinator-inspector.md):
   * roomSessionId → 最近一次快照。
   *
   * 挂在这个 store 而不是新开一个:它与看板走的是**同一条**会话事件通道,而
   * `ensureSubscribed` 是那条通道唯一的订阅处 —— 为一个分支再开一个 store,
   * 就有了两处订阅、两份生命周期,以及迟早对不上的两个"是否已订阅"标志。
   *
   * **「agent 现在在干嘛」的唯一账本**(架构收敛 C4 §1)。此前这件事有四个口径:
   * `collab:turn-active` 事件攒的一本(停止按钮读它,而且**没有冷启动补水** ——
   * 窗口中途重载,按钮的账直接丢)、协调器快照一本(设置面板读它)、
   * `collab:typing` 事件 + 60s TTL 一本(打字行读它)、看板 doing 卡现算一本。
   * 四本各自漂移,真机上已经出过「常驻条 10–40s 显示空闲」的回归。
   *
   * 现在 speaking / typing 都是快照的字段,两个消费点读同一份派生;
   * `collab:turn-active` 与 `collab:typing` 仍然在线上(向后兼容),但渲染层
   * **不再拿它们记账** —— 后端在同一处触发点上推快照,那才是真值。
   */
  const coordinators = ref<Record<string, CollabCoordinatorState>>({})
  const reconcileTimers = new Map<string, ReturnType<typeof setTimeout>>()
  /** 已经补过水的房(冷启动 GET 每间房一次就够,之后跟着广播走)。 */
  const hydratedCoordinators = new Set<string>()
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

  /**
   * 采纳一份协调器快照 —— **唯一**的写入口(广播、冷启动 GET 都走它)。
   *
   * 与看板的 `applySnapshot` 同一条去序规则(P2-18):比屏幕上更旧的快照丢掉。
   * 两条路会赛跑,而到达顺序什么都证明不了 —— 一次在广播之前发出的 GET 完全
   * 可能在广播之后才回来,把停止按钮按回到上一帧。`seq` 由主进程每广播一次 +1,
   * 所以"更旧"是事实而不是猜测;缺这个字段的旧数据读作 0(0 < 0 为假,照收)。
   *
   * 这条规则同时替掉了老的「关窗只认关它的那个人」:迟到的一条 idle 不再需要
   * 带着 agentId 来自证身份,它带的是号,号小就不算数。
   */
  function applyCoordinatorSnapshot(sessionId: string, state: CollabCoordinatorState): void {
    const current = coordinators.value[sessionId]
    if (current && (state.seq ?? 0) < (current.seq ?? 0)) return
    coordinators.value = { ...coordinators.value, [sessionId]: state }
  }

  /**
   * 冷启动补水:这间房的快照拉一次(每间房一次,之后跟着广播走)。
   *
   * 停止按钮此前的病根就在这里 —— 它读的是事件账,而 `load()` 只重建看板与
   * 待审批数,于是「窗口在一轮发言中途重载」= 按钮的账凭空消失,而下一条事件
   * 要等这一轮结束才来。
   */
  function ensureCoordinator(roomSessionId: string | undefined | null): void {
    if (!roomSessionId || hydratedCoordinators.has(roomSessionId)) return
    hydratedCoordinators.add(roomSessionId)
    void loadCoordinator(roomSessionId)
  }

  /** 这个房间此刻有没有可以停的一轮 —— 停止按钮与「在忙」读的同一格。 */
  function isRoomTurnActive(sessionId: string | undefined | null): boolean {
    if (!sessionId) return false
    return (coordinators.value[sessionId]?.speaking?.length ?? 0) > 0
  }

  function ensureSubscribed(): void {
    if (subscribed) return
    // 宿主没有这条通道(单测的裸 platformApi、还没接上的 web 端)时什么都不做,
    // 而且**不置位** —— 装不上就该在下次还能再试一次。
    if (typeof platformApi.onSessionEvent !== 'function') return
    subscribed = true
    platformApi.onSessionEvent(envelope => {
      const event = envelope.event as
        | {
          type?: string
          board?: CollabBoard
          state?: CollabCoordinatorState
        }
        | undefined
      if (!event?.type) return
      if (event.type === 'collab:board-changed' && event.board) {
        applySnapshot(envelope.sessionId, event.board)
      } else if (event.type === 'collab:coordinator-changed' && event.state) {
        // 「谁在说 / 谁在打字」全在这一份里(C4 §1)。`collab:typing` 与
        // `collab:turn-active` 照旧在线上,但这里**刻意不接**:后端在同一处触发
        // 点上推快照,再接一遍就是第二本账,而两本账迟早对不上 —— 那正是这次
        // 收敛要拆掉的东西。
        applyCoordinatorSnapshot(envelope.sessionId, event.state)
      } else if (event.type === 'permission:request' || event.type === 'permission:settled') {
        // The event says "something moved here"; the count comes from the ask.
        scheduleReconcile(envelope.sessionId)
      }
    })
  }

  async function load(roomSessionId: string): Promise<void> {
    ensureSubscribed()
    // 看板补水的同时把协调器那一份也补上(C4 §1):停止按钮、打字行与「在忙」
    // 读的都是它,而它们分布在几个不打开看板的界面上。
    ensureCoordinator(roomSessionId)
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
    hydratedCoordinators.add(roomSessionId)
    try {
      ensureSubscribed()
      const response = await platformApi.getCollabCoordinator?.(roomSessionId)
      if (response?.success && response.state) {
        applyCoordinatorSnapshot(roomSessionId, response.state)
      }
    } catch (error) {
      console.error('[collabBoard] coordinator load failed:', error)
    }
  }

  function coordinatorFor(roomSessionId: string | undefined | null): CollabCoordinatorState | null {
    return (roomSessionId && coordinators.value[roomSessionId]) || null
  }

  /**
   * Members currently typing in a room, oldest first(名单顺序由后端的 Set
   * 插入序给出:先开口的在前)。
   *
   * 陈旧兜底挂在**快照时间戳**上而不是每个 true 自己的死线:名单是整份替换的,
   * 所以"这份名单是什么时候的"才是那个唯一有意义的问题。协调器进程崩了、事件
   * 掉了,一间房最多顶着一分钟的旧名单,而不是永远停在「正在输入」。
   * 过期在**读**的时候判,所以安静的房间一个定时器都不跑
   * (CollabTypingLine 的 1s 脉搏只在显示期间存在)。
   */
  function typingAgents(sessionId: string | undefined | null): string[] {
    if (!sessionId) return []
    const snapshot = coordinators.value[sessionId]
    if (!snapshot?.typing?.length) return []
    if (Date.now() - (snapshot.at ?? 0) > TYPING_TTL_MS) return []
    return [...snapshot.typing]
  }

  return {
    boards,
    pendingAsks,
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
    isRoomTurnActive,
    coordinators,
    applyCoordinatorSnapshot,
    ensureCoordinator,
    loadCoordinator,
    coordinatorFor,
  }
})
