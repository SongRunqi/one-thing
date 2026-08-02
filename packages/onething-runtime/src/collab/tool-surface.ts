/**
 * Which tools a collab session may call — pure rule (D5 + W14b §4.5).
 *
 * Lives here rather than inline in the engine adapter because it is a PRODUCT
 * decision with two invariants worth a test of their own:
 *
 *  - a room turn's surface is a UNION (collab-team-v2 §2.1): say + board are a
 *    FLOOR under the agent's own whitelist; no whitelist means no restriction;
 *  - a work session's surface is the same UNION: the delivery protocol needs
 *    `board` (complete/block) and W14b made the delivery itself the worker's
 *    own words, so `say` is required too. Both are added to a curated
 *    whitelist, never substituted for it (the agent keeps its real tools).
 */

/**
 * The tools every room turn must have, whatever else the agent carries.
 *
 * `say` + `board` are the original pair, and W22 is why it was not three for a
 * while. W18b briefly added `stay_silent` so that the forced opening call would
 * leave silence reachable; the model then looped on it (77 calls in four turns,
 * 真机 2026-07-28) because an inert tool whose result says "now stop" is still a
 * legal next move. The tool stayed retired when the forced opening call itself
 * was removed (2026-07-30, see turn.ts): silence is now simply "call nothing",
 * which leaves a turn no landing spot to spin on at all.
 *
 * `dm` joined on 2026-07-30 (agent-im-dm.md §3.4 / D5) and left again on
 * 2026-08-02: it is now the `to` parameter of `send_message`
 * (collab-send-channel-and-wake.md §2 —— 一个带 channel 的发送面)。旧名保留为
 * **隐藏真工具**(`tools/builtin/dm.ts`),刻意不在这张表里 —— 进来就等于进
 * 请求的 tools 参数,模型会看见两个同义工具,而合并的全部意义就是只有一个。
 */
/**
 * `history` 于 2026-08-02 加入(collab-history-search.md),取代同年 08-01 那个
 * 只查当前房折叠段的 `room_history`。它先是**按天折叠的配套**——投影不再逐字带
 * 四天历史了,那就必须留一条翻回去的路,否则折叠就是静默截断;取消默认隔离之后
 * 它同时是**跨房的那条路**:同一位同事在群里、在私聊里说过的话,查得回来。
 *
 * 进 floor 是安全的,因为它只读、且授权由数据推(`collabRoomVisibleUntil`):
 * 它能查的恒等于「我在场过的房」,别人之间的对话对它不存在。
 */
/**
 * `say` 于 2026-08-02 改名 `send_message`(collab-turn-protocol-and-identity.md A)。
 * 旧名保留为**静默别名**(`COLLAB_SEND_MESSAGE_LEGACY_TOOL_NAME`),但它刻意
 * **不进这张表** —— 进来就等于进请求的 tools 参数,模型会看见两个同义工具。
 */
export const COLLAB_ROOM_TOOLS: readonly string[] = ['send_message', 'board', 'history']

/** Tools a work session must have on top of whatever its agent was given. */
export const COLLAB_WORK_REQUIRED_TOOLS: readonly string[] = ['board', 'send_message']

/**
 * Returns the allowlist for a session, or `null` for "no restriction" (an
 * ordinary session with no per-agent whitelist).
 */
export function resolveCollabToolAllowlist(options: {
  kind?: string
  /** The agent's own whitelist, or null when it has none. */
  ownTools?: readonly string[] | null
  /**
   * 这一回合答的是**单成员 dm 房**(用户 ↔ agent 托管私聊)吗?
   * agent-im-dm.md D7:私聊常驻会话的工具面**恒为 union**。
   */
  dm?: boolean
}): string[] | null {
  const own = options.ownTools ?? null

  // D7:dm 房先判,而且它不共用群房那一格。托管私聊的本义就是"agent 替你干活",
  // 群房收紧的动机(N 个 agent 的工具噪声、与群 roster 文案矛盾)在一对一不存在。
  // 独立一支的意义在于**隔离**:群房语义将来若再次收紧成 replace,私聊不会跟着
  // 被收窄——那会把托管私聊直接废掉。白名单为空 = null = 不限制,union 后即全量。
  if (options.dm && (options.kind === 'room' || options.kind === 'agent')) {
    return own ? unionWith(own, COLLAB_ROOM_TOOLS) : null
  }

  // W18: the room RESPONSE turn moved into the agent's own execution session,
  // so the surface follows the turn, not the session that stores the messages.
  // Both kinds mean the same thing — "this turn answers a room".
  //
  // Union 语义(collab-team-v2 §2.1,2026-07-30 曾收紧为 replace,同日应
  // 用户要求撤销):配了白名单 → own ∪ {say, board};没配 = null = 跟随全局
  // = 完全不限制。轻活(随手查个资料再回答)可以在群回合里直接做,重活仍
  // 走建卡 → `kind === 'work'` 工作台会话。roster 的情况说明与此保持一致。
  if (options.kind === 'room' || options.kind === 'agent') {
    return own ? unionWith(own, COLLAB_ROOM_TOOLS) : null
  }

  if (options.kind === 'work' && own) return unionWith(own, COLLAB_WORK_REQUIRED_TOOLS)
  return own ? [...own] : null
}

function unionWith(own: readonly string[], required: readonly string[]): string[] {
  const union = [...own]
  for (const tool of required) {
    if (!union.includes(tool)) union.push(tool)
  }
  return union
}
