/**
 * 右栏「房间背台」的**纯逻辑** —— 样板 `docs/design/im-redesign/right-panel.html`。
 *
 * 诊断(为什么要有这个文件):线程 / 成员 / 看板被实现成了 App 级工作台的**页签**
 * (可开可关可加可滚、标题跟着内容变)。但它们是**同一件东西的三个视图** ——
 * 这间房的背台。页签形态因此接连崩了四次,而且四个症状同源:
 *
 *  | 症状                    | 根因                     |
 *  |-------------------------|--------------------------|
 *  | 看不到线程              | 页签按需才开             |
 *  | 换房攒页签              | 页签按靶子开             |
 *  | 中文被截成「成..」      | 页签要给 ✕ 和内边距让位  |
 *  | 下钻后页签把自己挤出去  | 页签标题跟着内容变长     |
 *
 * **固定三格的分段器**从结构上让这四个不可能再发生:等宽 `flex: 1 1 0`、无 ✕、
 * 无 ＋、不可滚、**标题永不改变**。这个文件回答的就是"哪几格、每格亮不亮点、
 * 外部入口落在哪一格",三件都不碰 DOM,所以都判定得了。
 *
 * 纪律(与 `room-members.ts` / `room-threads.ts` 同一条,W7):
 *  - **一个字段都不新增**:在跑读 chat store 的 `isSessionGenerating`,待你读
 *    `hasPendingAsk` + `CollabTask.status`,新消息读 `isUnreadSession`;
 *  - **不显示计数**:系统只知道"有没有",编个数字出来比不显示更糟(与侧栏未读点
 *    同一纪律)。所以状态点只有"亮 / 不亮"两态。
 */
import type { ShellMode } from '@/types'

/**
 * 分段器的格子。
 *
 * `space` 只在私聊房出现,顶替 `members` —— 一对一没有"成员"这回事,那一格
 * 直接就是对方的空间页。
 */
export type RoomBackstageSegmentKey = 'threads' | 'members' | 'space' | 'board'

/** 状态点的三种含义(样板 `.dot.run / .dot.wait / .dot.new`)。 */
export type RoomBackstageDot = 'run' | 'wait' | 'new'

export interface RoomBackstageSegment {
  key: RoomBackstageSegmentKey
  /** **恒定文案**。格子的标题永不随内容变化 —— 这是分段器的全部意义所在。 */
  label: string
  /** null = 不画点。计数一律不显示。 */
  dot: RoomBackstageDot | null
}

/** 四个固定文案。写成常量是为了让"标题不变"这件事有一处可断言的锚。 */
export const ROOM_BACKSTAGE_LABELS: Readonly<Record<RoomBackstageSegmentKey, string>> = {
  threads: '线程',
  members: '成员',
  space: '空间',
  board: '看板',
}

/** 空态文案(样板 三 · 空态):空的是内容,不是入口。 */
export const ROOM_BACKSTAGE_EMPTY = {
  boardTitle: '这间房还没有卡片。',
  boardHint: '有人建卡之后,这里会按「待你 / 在做 / 待办 / 已交付」列出来。',
} as const

// ── 形态分岔:右栏到底画哪一种 ────────────────────────────────────────────

/** 判形态只需要会话的这几格;一个 `SessionListItem` 天然满足它。 */
export interface RightPanelSessionLike {
  id: string
  kind?: string
  room?: { dm?: boolean; memberAgentIds?: string[] } | null
}

export interface RightPanelForm {
  /** 'backstage' = 房间背台(分段器);'tools' = 既有工具页签。 */
  form: 'backstage' | 'tools'
  /** backstage 形态下这间房是谁;tools 形态恒为 ''。 */
  roomSessionId: string
  /** 私聊房(单成员 dm 房)—— 分段器换成两格「线程 / 空间」。 */
  isDm: boolean
  /** 私聊房的那一个人;群房恒为 ''。 */
  dmAgentId: string
}

const TOOLS_FORM: RightPanelForm = { form: 'tools', roomSessionId: '', isDm: false, dmAgentId: '' }

/**
 * 右栏的两形态判定 —— **唯一一处**。
 *
 * 房/私聊 → 背台;直聊/工程面 → 既有工具页签(Files/Terminal/Browser,一个字节
 * 不变)。classic 外壳是逐像素回滚闸,一律走工具页签。
 *
 * 私聊判定不自写 `room.dm && members.length === 1` —— 与 store 的
 * `isUserDmRoomSession` 同源,由调用方注入(`isUserDmRoom` 是产品层纯规则,
 * "人数即形态")。这里只做形态分发,不重造判定。
 */
export function resolveRightPanelForm(input: {
  shellMode: ShellMode
  session: RightPanelSessionLike | null | undefined
  /** `isUserDmRoom`(产品层规则)。不给就当成没有私聊房。 */
  isUserDm?: (session: RightPanelSessionLike) => boolean
}): RightPanelForm {
  if (input.shellMode !== 'workbench') return TOOLS_FORM
  const session = input.session
  if (!session?.id || session.kind !== 'room') return TOOLS_FORM

  const isDm = input.isUserDm?.(session) === true
  return {
    form: 'backstage',
    roomSessionId: session.id,
    isDm,
    dmAgentId: isDm ? (session.room?.memberAgentIds?.[0] || '') : '',
  }
}

// ── 分段器:固定几格、哪几格亮点 ──────────────────────────────────────────

export interface RoomBackstageSignals {
  /** 这间房有执行会话在跑 → 线程格亮绿点。 */
  threadsRunning?: boolean
  /** 看板上有「待你」的卡(受阻 / 等你放行)→ 看板格亮橙点。 */
  boardAwaiting?: boolean
  /** 有成员的私聊未读 → 成员格亮墨点。 */
  membersUnread?: boolean
}

/**
 * 这间房的分段器。**格数只由房的形态决定,与内容无关** ——
 * 一条线程都没有的房照样有「线程」格(空的是内容,不是入口)。
 *
 * 群房三格:线程 / 成员 / 看板。
 * 私聊房两格:线程 / 空间 —— 一对一没有"成员"这回事,而看板是干活现场的东西,
 * 样板把它从私聊背台里拿掉了(见 right-panel.html 设计决策第五条)。
 */
export function buildRoomBackstageSegments(input: {
  isDm: boolean
  signals?: RoomBackstageSignals
}): RoomBackstageSegment[] {
  const signals = input.signals || {}
  const threads: RoomBackstageSegment = {
    key: 'threads',
    label: ROOM_BACKSTAGE_LABELS.threads,
    dot: signals.threadsRunning ? 'run' : null,
  }

  if (input.isDm) {
    return [threads, { key: 'space', label: ROOM_BACKSTAGE_LABELS.space, dot: null }]
  }

  return [
    threads,
    {
      key: 'members',
      label: ROOM_BACKSTAGE_LABELS.members,
      dot: signals.membersUnread ? 'new' : null,
    },
    {
      key: 'board',
      label: ROOM_BACKSTAGE_LABELS.board,
      dot: signals.boardAwaiting ? 'wait' : null,
    },
  ]
}

/**
 * 外部入口(`onething:open-thread` / `open-members` / `collab-open-board` /
 * `room-workbench`)要落在哪一格。
 *
 * - 请求的格在 → 就是它;
 * - 请求「成员」但这是私聊房 → 落到「空间」(同一个位置,换个名字);
 * - 请求的格不在(私聊房请求看板)→ 返回 null,**原地不动**。
 *   宁可不动,也不要把人甩到一个 TA 没要的视图上。
 */
export function pickRoomBackstageSegment(
  requested: RoomBackstageSegmentKey | undefined,
  segments: readonly RoomBackstageSegment[],
): RoomBackstageSegmentKey | null {
  if (!requested) return null
  if (segments.some(segment => segment.key === requested)) return requested
  if (requested === 'members' && segments.some(segment => segment.key === 'space')) return 'space'
  if (requested === 'space' && segments.some(segment => segment.key === 'members')) return 'members'
  return null
}

/**
 * 外部入口的一次「落座」指令。
 *
 * `nonce` 变化即一次新指令 —— 同一个靶子也能重放(用户第二次点房头的「看板」时,
 * 靶子没变但意图是"再带我去一次")。
 */
export interface RoomBackstageLanding {
  segment?: RoomBackstageSegmentKey
  /** 线程格:下钻到这条执行会话('' = 停在列表层)。 */
  threadSessionId?: string
  /** 成员/空间格:下钻到这个人的空间页('' = 停在成员表)。 */
  agentId?: string
  nonce: number
}

/** 当前格失效时的兜底(换房、形态从群变私聊)——恒回第一格「线程」。 */
export function fallbackRoomBackstageSegment(
  current: RoomBackstageSegmentKey,
  segments: readonly RoomBackstageSegment[],
): RoomBackstageSegmentKey {
  if (segments.some(segment => segment.key === current)) return current
  return segments[0]?.key || 'threads'
}
