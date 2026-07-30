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

/** Update room budgets. Only provided fields change; 0 disables that gate. */
export interface CollabRoomBudgetsRequest {
  roomSessionId: string
  dailyCostUSD?: number
  maxChain?: number
  /** 回合断路器上限 (W22); 0 = 关闭该闸。 */
  maxTurnToolCalls?: number
  maxTurnSayCalls?: number
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
 */
export interface CollabRoomUpdateRequest {
  roomSessionId: string
  name?: string
  memberAgentIds?: string[]
  pmAgentId?: string | null
  permissionMode?: PermissionMode
}

export interface CollabRoomUpdateResponse {
  success: boolean
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
