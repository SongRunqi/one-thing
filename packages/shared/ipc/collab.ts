/**
 * Collab board wire types — docs/design/multi-agent-collab.md D6/P1.
 * The board is room-scoped; mutations flow through the board tool / main
 * process store, the renderer reads snapshots + subscribes to
 * 'collab:board-changed' session events on the room session.
 */

import type { ChatMessageReaction, ChatMessageReactionActor } from './chat.js'
import type { PermissionMode } from './tools.js'

export type CollabTaskStatus = 'backlog' | 'todo' | 'doing' | 'review' | 'done' | 'blocked'

/**
 * Structural execution trace (W9b.4): toolName → completed-call count, counted
 * by CODE from the work session's persisted messages. A model cannot write it,
 * which is exactly why the panel renders it verbatim (empty = 无执行记录).
 */
export interface CollabTaskEvidence {
  toolCounts: Record<string, number>
  /**
   * 交付物 (W17): write/edit targets of the work session, de-duplicated and
   * relativised to the room's workingDirectory. Code-collected like
   * toolCounts. Absent on pre-W17 cards.
   */
  files?: string[]
}

export interface CollabTask {
  id: string
  rev: number
  title: string
  description?: string
  status: CollabTaskStatus
  assigneeAgentId?: string
  createdBy: { type: 'user' | 'agent'; agentId?: string }
  workSessionIds: string[]
  rejections: number
  /** Times this card was halted (W9b.2). Absent on pre-W9b cards = 0. */
  haltedCount?: number
  /** Why it is/was blocked (W9b.3). Absent on pre-W9b cards. */
  blockReason?: string
  report?: { summary: string; messageId?: string; evidence?: CollabTaskEvidence }
  createdAt: number
  updatedAt: number
}

export interface CollabBoard {
  version: 1
  tasks: CollabTask[]
  /**
   * Monotonic commit counter stamped by the main-process board store (P2-18).
   * The renderer drops any snapshot whose seq is lower than the one on screen —
   * broadcast, write reply and GET race, and arrival order proves nothing.
   * Absent on boards written before this field; readers treat that as 0.
   */
  seq?: number
}

export interface CollabBoardGetRequest {
  roomSessionId: string
}

export interface CollabBoardGetResponse {
  success: boolean
  board?: CollabBoard
  error?: string
}

/**
 * Board mutation vocabulary (W16). Structurally identical to the runtime's
 * `CollabBoardAction` on purpose: the request carries the action ACROSS
 * unchanged and the pure reducer — the single source of truth for what is
 * legal — decides. Adding a case here without adding it there just yields the
 * reducer's own error text on the wire, which is the intended failure mode.
 */
export type CollabBoardAction =
  | {
      action: 'create'
      title: string
      description?: string
      assigneeAgentId?: string
      status?: 'backlog' | 'todo'
    }
  | { action: 'assign'; taskId: string; assigneeAgentId: string; expectedRev?: number }
  | { action: 'move'; taskId: string; status: CollabTaskStatus; expectedRev?: number; reason?: string }
  | { action: 'update'; taskId: string; title?: string; description?: string; expectedRev?: number }
  | { action: 'comment'; taskId: string; comment: string }
  | { action: 'complete'; taskId: string; summary: string; expectedRev?: number }
  | { action: 'block'; taskId: string; reason?: string; expectedRev?: number }
  | { action: 'list' }

/**
 * User-driven board mutation (W16). The actor is pinned to the human on the
 * main-process side — a renderer must never be able to act AS an agent, and
 * W9b's halt cap / 打回 accounting deliberately exempt the user.
 */
export interface CollabBoardActRequest {
  roomSessionId: string
  action: CollabBoardAction
}

export interface CollabBoardActResponse {
  success: boolean
  error?: string
  /**
   * The board AFTER the attempt — present on success and on a rev conflict
   * alike, so the panel can repaint from truth instead of re-fetching. The
   * broadcast still arrives (30ms coalesced); this only removes the wait.
   */
  board?: CollabBoard
}

/**
 * 停止一张卡正在跑的执行(collab-team-v2 §5.1 入口②)。
 *
 * 与「标受阻」分开的通道,因为它们是两件事:受阻宣告「这事儿卡住了、要人
 * 裁决」并烧掉一次自动处置预算,停止只是把手从方向盘上拿开——卡回到待办,
 * 现场留着,谁都可以 board start 续做。
 */
export interface CollabTaskStopRequest {
  roomSessionId: string
  taskId: string
}

export interface CollabTaskStopResponse {
  success: boolean
  /** false = 这张卡此刻没有在跑的执行(菜单项本不该出现在那儿)。 */
  stopped?: boolean
  error?: string
}

export interface CollabRoomFrozenRequest {
  roomSessionId: string
  frozen: boolean
}

export interface CollabRoomFrozenResponse {
  success: boolean
  error?: string
}

// ── 协调器状态条(docs/design/collab-coordinator-inspector.md)─────────────
//
// 房间里最贵、最不可见的一步是**调度**:谁被问了、谁答了不说、谁排在队里、卡在
// 哪道闸上,全发生在用户看不见的地方。这一族类型就是把它画出来所需的全部。
//
// 形态逐字照抄看板那条已经跑通的链路:一次 GET 冷启动 + `collab:coordinator-changed`
// 带**完整快照**的会话事件。快照很小,而全量广播省掉了增量合并那一整类 bug。

/** 一条正在跑的回合。 */
export interface CollabCoordinatorTurn {
  agentId: string
  /** 'mention' | 'self-elected' | 'task-event' | 'schedule' | 'relay' */
  reason: string
  startedAt: number
  /** 停它要打的那条执行会话 —— 「停」按钮的靶子,也是下钻的靶子。 */
  agentSessionId: string
}

/** 一条排队等发言的激活。 */
export interface CollabCoordinatorQueued {
  id: string
  agentId: string
  reason: string
}

/** 一道闸的读数。`max` 为 0 表示这道闸关着(不限)。 */
export interface CollabCoordinatorGate {
  value: number
  max: number
}

/**
 * 一条调度事件(「刚才」那一段)。
 *
 * 只活在内存的环形缓冲里,**不落盘** —— 它说的是"刚才",而重启之后没有刚才。
 * 落盘账本是另一件事(qm-collab-learnings P2-8),目的也不同。
 */
export interface CollabCoordinatorLogEntry {
  at: number
  kind:
    | 'received'      // 收到用户消息
    | 'judging'       // 开始判定 N 人
    | 'judged'        // 判定 N 人 → count 人接话
    | 'relay-pass'    // 发言里 @ 到的人被插进编排的下一批
    | 'planned'       // 协调器给出一份编排(count = 几批, detail = 一句话理由)
    | 'wave'          // 发出一批(count = 这批几个人)
    | 'plan-failed'   // 编排要不到(detail = timeout/unparsable/unresolved/…),已降级
    | 'spoke'         // 谁说了 count 句
    | 'silent'        // 谁没说话(读完确实没自己的事)
    | 'unsent'        // 写了大段正文却没调 say,且收养投递也没送出去(写而未发)
    | 'adopted'       // 写而未发被收养:收尾正文由框架代为投进群(2026-08-02 翻案)
    | 'blocked'       // 撞闸(detail 说明是哪一道)
    | 'stopped'       // 用户喊停清场
  agentId?: string
  /** 'judged' = 几人接话;'spoke' = 说了几句;'judging' = 问了几人。 */
  count?: number
  /** 'judged' 的分母(问了几人)—— 「判定 4 人 → 1 人接话」要两个数才说得完整。 */
  total?: number
  /**
   * 'judged' 的成因分布,键是 `CollabWillingnessOutcomeKind`
   * ('yes' | 'no' | 'unparsable' | 'timeout' | 'unresolved' | 'aborted' | 'error')。
   *
   * 「都没接话」有五种完全不同的成因,而在这一格之前它们长得一模一样:满屋子 `no`
   * 是这群人真的没话说(不用管),满屋子 `timeout`/`unresolved` 是判定这条链断了
   * (必须修)。状态条存在的理由就是分开这两件事。
   */
  outcomes?: Record<string, number>
  /** 'chain' | 'budget' | 'loops' | 'frozen' —— 仅 'blocked' 用;'planned'/'plan-failed' 放理由。 */
  detail?: string
  /**
   * 'planned' 专用:编排的完整批次(agentId 的有序批)。
   *
   * 编排跑完就被丢掉(`state.plan` 是执行态,不是历史),而「刚才」是唯一活得比它
   * 久的地方 —— 不带上批次,用户回头只能看见「编排 2 批」这个数,说不出谁在哪批。
   */
  waves?: string[][]
}

export interface CollabCoordinatorState {
  roomSessionId: string
  mode: 'auto' | 'parallel' | 'serial'
  frozen: boolean
  turns: CollabCoordinatorTurn[]
  queue: CollabCoordinatorQueued[]
  /** 在飞的意愿判定轮数(并行模式);0 = 此刻没有判定在跑。 */
  judging: number
  /** 这一轮判定在问谁 —— 常驻条那句「4 人在判断要不要接话」的名字来源。 */
  judgingAgentIds: string[]
  gates: {
    chain: CollabCoordinatorGate
    concurrency: CollabCoordinatorGate
    /** 单位是美元;`value` 取协调器自己的 60s 缓存(与预算闸读的是同一个数)。 */
    budget: CollabCoordinatorGate
  }
  /**
   * 此刻在跑的**编排**(collab-coordinator-plan.md);没有编排在飞时为 null。
   *
   * 接力时代这里是「环 + 持棒者」。编排之后环是 waves 的一个特例
   * (`[[a],[b],[c]]`),所以视图直接给 waves —— 它同时画得出
   * 「阿般 → 小李 → Iris」(单人批)和「阿般 · 小李 / Iris」(多人批),
   * 而环那个形状画不出后者。
   */
  plan: {
    /** 有序批次;批内并行、批间串行。 */
    waves: string[][]
    /** 正在跑(或即将发)的那一批。 */
    waveIndex: number
    /** 这一趟已经执行了几批。 */
    waveCount: number
    /** 走完之后要不要从头再来。 */
    cycle: boolean
    /** 协调器给的一句话理由 —— 用户第一次能看到它**为什么**这么排。 */
    why: string
    /** 0 = 不限圈。 */
    loops: number
  } | null
  /** 最近的调度事件,**旧在前**。 */
  log: CollabCoordinatorLogEntry[]
}

export interface CollabCoordinatorGetRequest {
  roomSessionId: string
}

export interface CollabCoordinatorGetResponse {
  success: boolean
  error?: string
  state?: CollabCoordinatorState
}

/** Update room budgets. Only provided fields change; 0 disables that gate. */
export interface CollabRoomBudgetsRequest {
  roomSessionId: string
  dailyCostUSD?: number
  maxChain?: number
  /** 回合断路器上限 (W22); 0 = 关闭该闸。 */
  maxTurnToolCalls?: number
  maxTurnSayCalls?: number
  /** 同时最多几个人说话(房间回合并行化)。缺省 = 内置默认;0 = 不限。 */
  maxConcurrentTurns?: number
}

/** What a budgets write may change — the request minus its address. Named
 *  because four layers (preload, renderer platform type, daemon, app) each
 *  carried their own copy of this shape and the last two fields showed how
 *  quickly the copies drift. */
export type CollabRoomBudgetsPatch = Omit<CollabRoomBudgetsRequest, 'roomSessionId'>

export interface CollabRoomBudgetsResponse {
  success: boolean
  error?: string
}

/**
 * Read-only spend view for the room settings panel (W13.5). Same ledger
 * aggregation the coordinator's budget gate uses (room session + its work
 * sessions, today), read once when the panel opens — no live refresh.
 */
export interface CollabRoomSpendRequest {
  roomSessionId: string
}

export interface CollabRoomSpendResponse {
  success: boolean
  error?: string
  /** Today's total cost in USD across the room and its work sessions. */
  spentTodayUSD?: number
  /** The room's configured daily cap; 0 means no cap. */
  dailyCostUSD?: number
}

/**
 * Team settings update (W6). Only provided fields change:
 *  - `memberAgentIds` replaces the roster (每个 id 必须是存在的 agent,至少 1 人)
 *  - `pmAgentId` must be one of the resulting members; `null` clears it
 *  - `permissionMode` writes the ROOM session's mode; work sessions inherit it
 *  - `responseMode` / `speakOrder` / `relayLoops` 是响应模式三件套
 *    (docs/design/collab-speaking-order.md);`speakOrder: []` = 清空,退回名册序
 */
export interface CollabRoomUpdateRequest {
  roomSessionId: string
  name?: string
  memberAgentIds?: string[]
  pmAgentId?: string | null
  permissionMode?: PermissionMode
  responseMode?: 'auto' | 'parallel' | 'serial'
  speakOrder?: string[]
  relayLoops?: number
}

/**
 * What a room-settings write may change — the request minus its address.
 *
 * 与 `CollabRoomBudgetsPatch` 同一条纪律,而且是被同一种事故逼出来的:这个形状
 * 此前在 preload 与 renderer 的类型表里各手抄了一份,加一个字段要记得改三处,
 * 漏掉哪一处都不报错,只是那个字段静默到不了主进程(隔壁 budgets 的
 * `maxConcurrentTurns` 就这么丢了几个月)。现在只有一份。
 */
export type CollabRoomUpdatePatch = Omit<CollabRoomUpdateRequest, 'roomSessionId'>

export interface CollabRoomUpdateResponse {
  success: boolean
  error?: string
}

/**
 * 清空一间房的对话记忆
 * (docs/design/collab-room-clear-and-mention-all.md B)。
 *
 * **不可恢复**,且不止是这间房的转录:每位成员(含曾在册的)在这间房的执行会话
 * 一并清空、已读游标归零 —— 否则旧记忆继续躺在成员那侧,每轮都被读进上下文。
 * 看板卡片、房间设置、成员本体、今日已花额度都不动。
 *
 * 删之前房间转录会原样留档一份(`messages.cleared-<ts>.jsonl`,不进任何读取
 * 路径);执行会话是派生记忆,不留档。
 */
export interface CollabRoomClearHistoryRequest {
  roomSessionId: string
  /**
   * 连带清空成员两两之间的私聊房(及其执行会话)。
   *
   * 缺省 false:pair 私聊房是**跨群共享**的(Iris⇄Bram 只有一间,别的群也用它),
   * 连带清空是用户的显式选择,不是"清空这间房"的默认语义。
   */
  includeMemberDms?: boolean
}

export interface CollabRoomClearHistoryResponse {
  success: boolean
  /** 清掉的房间消息条数。 */
  clearedMessageCount?: number
  /** 连带清空的成员间私聊房数(仅当 includeMemberDms)。 */
  clearedDmRoomCount?: number
  /** 一并清空的成员执行会话数。 */
  clearedSessionCount?: number
  /** 一并清掉的看板卡片数(含连带清空的私聊房)。 */
  clearedTaskCount?: number
  error?: string
}

/**
 * 打开(必要时惰性创建)用户 ↔ 某个 agent 的托管私聊房
 * (docs/design/agent-im-dm.md D1)。
 *
 * 幂等:房间 id 从 agentId 派生,同一个 agent 永远是同一间房,所以这个请求既是
 * "创建"也是"打开",调用方不需要先查再建。
 *
 * 失败(`success: false`)的含义只有一种:**这个 agent 不该有私聊房** ——
 * 查无此人、service agent(不是同事)、已退休。desktop-only:rooms 需要主进程的
 * RoomCoordinator,web 端返回明确的不支持错误。
 */
export interface CollabDmRoomEnsureRequest {
  agentId: string
}

export interface CollabDmRoomEnsureResponse {
  success: boolean
  /** 私聊房的会话 id(= `userDmRoomId(agentId)`)。 */
  roomSessionId?: string
  error?: string
}

/**
 * 群 folder 的只读列目录(docs/design/agent-im-chat-ui.md §3.2「文件」块)。
 *
 * 为什么不是 `file:list-directory`:folder 的位置是主进程的推导
 * (`collabRoomFolder` = workingDirectory ?? `<store>/rooms/<id>`),渲染进程只
 * 拿得到房间会话上那个**可能还没写下来**的 workingDirectory,拿它去猜等于把
 * 一条回退规则抄第二份。所以通道按房间 id 问,由主进程回答"在哪儿 + 有什么"。
 *
 * 只读:没有建/删/写。desktop-only(rooms 本就是,web 端给不支持错误)。
 */
export interface CollabRoomFolderListRequest {
  roomSessionId: string
}

/** folder 里的一个文件。目录本身不成行 —— 这是个文件列表,不是文件树控件。 */
export interface CollabRoomFolderEntry {
  /** 相对 folder 的路径,永远用 `/` 分隔 —— 行上显示的就是它。 */
  relativePath: string
  /** 绝对路径,点开走既有 openFile 链路。 */
  path: string
  size: number
  mtimeMs: number
}

export interface CollabRoomFolderListResponse {
  success: boolean
  /** folder 的绝对路径;非房间会话时缺席。 */
  folder?: string
  entries?: CollabRoomFolderEntry[]
  /** 目录还没建过(这个房间从没往里放过东西)—— 不是错误,是空。 */
  missing?: boolean
  /** 条目超过上限,列表被截断。 */
  truncated?: boolean
  error?: string
}

/**
 * Toggle one emoji on one room message (W8, §3.5 B). Same actor + same emoji
 * again takes it back; `emoji` must be one of the six-emoji palette
 * (COLLAB_REACTION_EMOJIS) or the write is refused.
 */
export interface CollabMessageReactRequest {
  roomSessionId: string
  messageId: string
  emoji: string
  /**
   * @deprecated Ignored on the main-process side, which pins the actor to the
   * human user — exactly like CollabBoardActRequest. A reaction is attribution
   * (a silent member's emoji IS its answer), so a renderer must never be able
   * to file one under an agent's name. Kept on the type for wire compatibility;
   * agent reactions are written in-process by the willingness round.
   */
  actor?: ChatMessageReactionActor
}

export interface CollabMessageReactResponse {
  success: boolean
  error?: string
  /** The message's reactions after the write (aggregated per emoji). */
  reactions?: ChatMessageReaction[]
}
