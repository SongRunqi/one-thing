/**
 * 右栏在**房/私聊**下的固定页签组 —— 纯逻辑。
 *
 * 勘误(2026-08-04,用户拍板):此前右栏有**两套面板系统并存** —— 工作台页签
 * (`RightWorkbenchPanel` 的 tools 形态)与房间背台(`RoomBackstagePanel` 的
 * 分段器,房里的默认形态)。背台在房里**盖住**页签那一路,于是任何往页签里加
 * 内容的修都落在一张够不着的界面上 —— 走查 F2 就是这么坏的:群 folder 开出的
 * files 页签在房里永远不可见,因为它画在被盖住的那一层。
 *
 * 背台整体退役,四段内容原样搬进工作台页签,右栏只剩一套。背台当初挣来的两条
 * 纪律照搬进页签(它们本来就与"分段器还是页签"无关):
 *
 *  1. **格数只由房的形态决定,与内容无关** —— 一条线程都没有的房照样有「线程」
 *     页签(空的是内容,不是入口)。这一条治「按需才开 → 看不到线程」。
 *  2. **固定短标签 + 单例**:线程 / 成员 / 看板 / 调度各只有一条,换房是换靶子
 *     而不是再开一页;标题恒定,不跟着内容变长。这一条治「换房攒页签」与
 *     「中文被截成『成..』」「下钻后把自己挤出可视区」。
 *
 * 纪律(与 `room-members.ts` / `room-threads.ts` 同一条,W7):
 *  - **一个字段都不新增**:在跑读 chat store 的 `isSessionGenerating`,待你读
 *    `hasPendingAsk` + `CollabTask.status`,新消息读 `isUnreadSession`,
 *    死信读协调器快照那一格;
 *  - **不显示计数**:系统只知道"有没有",编个数字出来比不显示更糟。状态点只有
 *    "亮 / 不亮"两态。
 */

/** 一间房的固定页签(与 `WorkbenchTabType` 同名,那边是全集,这里是房的子集)。 */
export type RoomFixedTabType = 'thread' | 'members' | 'board' | 'schedule'

/**
 * 状态点的四种含义(样板 `.dot.run / .dot.wait / .dot.new`,D8 补 `fault`)。
 *
 * `fault` 是 D8 加的:调度页上有死信 —— 一封信炸了,循环继续跑而系统静默变哑。
 * 它与 `wait`(有事等你处理)刻意分开:等你放行是正常流程的一步,炸了不是。
 */
export type RoomTabDot = 'run' | 'wait' | 'new' | 'fault'

export interface RoomFixedTab {
  type: RoomFixedTabType
  /** **恒定文案**。页签标题永不随内容变化 —— 这是固定组的全部意义所在。 */
  label: string
  /** null = 不画点。计数一律不显示。 */
  dot: RoomTabDot | null
}

/**
 * 五个固定文案。写成常量是为了让"标题不变"这件事有一处可断言的锚。
 *
 * `space` 不是第五条页签,是「成员」那一条在私聊房里的名字 —— 一对一没有
 * "成员"这回事,那一页直接就是对方的空间页。
 */
export const ROOM_TAB_LABELS = {
  thread: '线程',
  members: '成员',
  space: '空间',
  board: '看板',
  schedule: '调度',
} as const

// ── 这一面到底是不是"一间房" ──────────────────────────────────────────────

/** 判形态只需要会话的这几格;一个 `SessionListItem` 天然满足它。 */
export interface RoomPanelSessionLike {
  id: string
  kind?: string
  room?: { dm?: boolean; memberAgentIds?: string[] } | null
}

export interface RoomPanelTarget {
  /** '' = 这一面不是房(直聊 / 工程面 / classic 外壳),不备固定页签组。 */
  roomSessionId: string
  /** 用户私聊房(单成员 dm 房)—— 没有「成员」也没有「看板」。 */
  isDm: boolean
  /** 私聊房的那一个人;群房恒为 ''。 */
  dmAgentId: string
}

export const NO_ROOM_TARGET: RoomPanelTarget = { roomSessionId: '', isDm: false, dmAgentId: '' }

/**
 * 右栏此刻对着哪一间房 —— **唯一一处**判定。
 *
 * classic 外壳是逐像素回滚闸:那一档下右栏恒是既有的工具页签,不备房的固定组。
 *
 * 私聊判定不自写 `room.dm && members.length === 1` —— 与 store 的
 * `isUserDmRoomSession` 同源,由调用方注入(`isUserDmRoom` 是产品层纯规则,
 * "人数即形态")。这里只做分发,不重造判定。
 */
export function resolveRoomPanelTarget(input: {
  session: RoomPanelSessionLike | null | undefined
  /** `isUserDmRoom`(产品层规则)。不给就当成没有私聊房。 */
  isUserDm?: (session: RoomPanelSessionLike) => boolean
}): RoomPanelTarget {
  const session = input.session
  if (!session?.id || session.kind !== 'room') return NO_ROOM_TARGET

  const isDm = input.isUserDm?.(session) === true
  return {
    roomSessionId: session.id,
    isDm,
    dmAgentId: isDm ? (session.room?.memberAgentIds?.[0] || '') : '',
  }
}

// ── 固定页签组:哪几条、哪几条亮点 ────────────────────────────────────────

export interface RoomTabSignals {
  /** 这间房有执行会话在跑 → 线程页亮绿点。 */
  threadsRunning?: boolean
  /** 看板上有「待你」的卡(受阻 / 等你放行)→ 看板页亮橙点。 */
  boardAwaiting?: boolean
  /** 有成员的私聊未读 → 成员页亮墨点。 */
  membersUnread?: boolean
  /**
   * 这间房的 actor 处理事件失败过 → 调度页亮红点(D8 §3.4)。
   *
   * 与另外三个信号刻意不同档:那三个说的是"有事在发生",这个说的是**有事坏了**。
   * 在它之前,一封炸掉的信只让系统静默地变哑 —— 用户看见的是「它没回应」。
   */
  scheduleFaulted?: boolean
}

/**
 * 这间房的固定页签组。
 *
 * 群房四条:线程 / 成员 / 看板 / 调度。
 * 私聊房三条:线程 / 空间 / 调度 —— 一对一没有"成员"这回事,而看板是干活现场的
 * 东西,样板把它从私聊那一面拿掉了(right-panel.html 设计决策第五条)。
 *
 * 「调度」**两种形态都有**:私聊房一样有租约、有闸、有死信,一间只有两个人的房
 * 照样会卡住 —— 而在这一页之前,那种卡住完全不可见。
 *
 * 注:双成员 pair dm 房(两个 agent 互聊)在这里算**群**形态,照旧有看板页 ——
 * 「无看板入口」那条语义收在 `RoomHeader` 的 ⋯ 菜单上(`isAgentPairDmRoom`),
 * 沿现状不动。
 */
export function buildRoomFixedTabs(input: {
  isDm: boolean
  signals?: RoomTabSignals
}): RoomFixedTab[] {
  const signals = input.signals || {}
  const thread: RoomFixedTab = {
    type: 'thread',
    label: ROOM_TAB_LABELS.thread,
    dot: signals.threadsRunning ? 'run' : null,
  }
  const schedule: RoomFixedTab = {
    type: 'schedule',
    label: ROOM_TAB_LABELS.schedule,
    dot: signals.scheduleFaulted ? 'fault' : null,
  }

  if (input.isDm) {
    return [thread, { type: 'members', label: ROOM_TAB_LABELS.space, dot: null }, schedule]
  }

  return [
    thread,
    {
      type: 'members',
      label: ROOM_TAB_LABELS.members,
      dot: signals.membersUnread ? 'new' : null,
    },
    {
      type: 'board',
      label: ROOM_TAB_LABELS.board,
      dot: signals.boardAwaiting ? 'wait' : null,
    },
    schedule,
  ]
}

/**
 * 外部入口(`onething:open-thread` / `open-members` / `collab-open-board` /
 * `open-room-schedule` / `room-workbench`)要落在哪一条。
 *
 * - 这一条在 → 就是它(私聊房请求「成员」落到那条叫「空间」的,同一条页签);
 * - 这一条不在(私聊房请求看板)→ 返回 null,**原地不动**。
 *   宁可不动,也不要把人甩到一个 TA 没要的视图上。
 */
export function pickRoomFixedTab(
  requested: RoomFixedTabType | undefined,
  tabs: readonly RoomFixedTab[],
): RoomFixedTabType | null {
  if (!requested) return null
  return tabs.some(tab => tab.type === requested) ? requested : null
}
