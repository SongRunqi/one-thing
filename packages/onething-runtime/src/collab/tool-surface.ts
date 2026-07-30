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
 * `dm` joined on 2026-07-30 (agent-im-dm.md §3.4 / D5) and is a different kind
 * of tool from `stay_silent`: it has a real effect outside the turn (a room gets
 * created, a message lands in it, somebody is activated), so a model that loops
 * on it is loudly visible rather than silently expensive — and it is bounded by
 * the same say 幂等窗 plus the dm room's own (tighter) chain cap.
 */
export const COLLAB_ROOM_TOOLS: readonly string[] = ['say', 'board', 'dm']

/** Tools a work session must have on top of whatever its agent was given. */
export const COLLAB_WORK_REQUIRED_TOOLS: readonly string[] = ['board', 'say']

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
