/**
 * Room header member strip — pure logic (W7,
 * docs/design/multi-agent-collab-im.md §3.5 C).
 *
 * The strip is the IM-side entry to membership: a row of chips, a ＋ that pulls
 * somebody in, a right-click that pushes somebody out or hands over the lead.
 * Every write goes through W6's existing COLLAB_ROOM_UPDATE channel, so the
 * only thing this module decides is WHAT the next roster should be — the
 * dialog does the same via room-settings-form. Kept DOM-free so the roster
 * arithmetic (unknown ids, the last-member floor, PM hand-over) is testable.
 */

import { isActiveAgent, isColleague, type AgentKind, type AgentStatus } from '@shared/ipc'
import { AGENT_AVATAR_FALLBACK } from '@/components/common/agent-avatar'

/** The agent fields the strip reads; an AgentDefinition satisfies it. */
export interface RoomStripAgent {
  id: string
  name: string
  title?: string
  avatar?: string
  /** Media file name of the picture avatar; the chip prefers it over the emoji. */
  avatarImage?: string
  isDefault?: boolean
  /** 分类(agent-domain-model.md M2);缺省 colleague。 */
  kind?: AgentKind
  /** 生命周期(M3);缺省 active。 */
  status?: AgentStatus
}

/** 墓碑的名字(域模型 M4):查无此人与已退休共用这一个词。 */
export const ROOM_MEMBER_TOMBSTONE_NAME = '已注销'

export interface RoomMemberEntry {
  id: string
  name: string
  title?: string
  avatar: string
  avatarImage?: string
  isPm: boolean
  /**
   * 墓碑态(域模型 §3.2 / M4):**已退休** 或 **查无此人**。
   *
   * 两种情况在成员条上是同一件事 —— 这个名字还挂在房间的花名册里,但它不会再
   * 说话了,所以照旧显示(绝不静默丢弃,否则"把这个陈旧成员踢掉"就没了入口),
   * 只是灰显 + 「已注销」。区别只在有没有名字可显示:退休的还叫自己的名字。
   */
  isRetired: boolean
}

/** Chip fallback when an agent carries no emoji of its own. */
export const ROOM_MEMBER_FALLBACK_AVATAR = AGENT_AVATAR_FALLBACK

/** Tooltip text: 名字 · 职务 (the title is dropped when there is none). */
export function formatRoomMemberTooltip(entry: RoomMemberEntry): string {
  const parts = [entry.name]
  if (entry.title) parts.push(entry.title)
  if (entry.isPm) parts.push('负责人')
  // 墓碑上加一句 —— 「这个人还在花名册里,但已经注销了」比一个灰掉的名字更明白。
  // 查无此人时把 id 也带上:名字已经不可考,id 是唯一能对上号的东西。
  if (entry.isRetired) parts.push(entry.name === ROOM_MEMBER_TOMBSTONE_NAME ? entry.id : '已注销')
  return parts.join(' · ')
}

/**
 * One chip per member, in roster order.
 *
 * 三态(域模型 §3.2 的成员条一行):在职 → 正常;已退休 → 名字照旧、灰显;
 * 查无此人 → 墓碑「已注销」。后两种共用 `isRetired`,因为在这一行上它们是同一
 * 件事:名字还挂在房间上,人不会再说话了。任何一种都照旧出一个 chip —— 藏起来
 * 就等于藏掉了"把这个陈旧成员踢出去"的唯一入口。
 */
export function buildRoomMemberEntries(options: {
  memberAgentIds: readonly string[]
  agents: readonly RoomStripAgent[]
  pmAgentId?: string
}): RoomMemberEntry[] {
  return options.memberAgentIds.map(id => {
    const agent = options.agents.find(candidate => candidate.id === id)
    return {
      id,
      name: agent?.name || ROOM_MEMBER_TOMBSTONE_NAME,
      title: agent?.title,
      avatar: agent?.avatar || ROOM_MEMBER_FALLBACK_AVATAR,
      avatarImage: agent?.avatarImage,
      isPm: Boolean(options.pmAgentId) && options.pmAgentId === id,
      isRetired: !agent || !isActiveAgent(agent),
    }
  })
}

/**
 * Who the ＋ can pull in: every agent that is not already a member. The blank
 * default persona is not a room role (same rule as the settings dialog).
 *
 * 这是一个**社交面**(域模型 M2/§3.2):只收在职的同事 —— service(radio-dj 等
 * 后台设施)与已退休的都不出现在这个 ＋ 里。
 */
export function buildAddableRoomAgents(options: {
  memberAgentIds: readonly string[]
  agents: readonly RoomStripAgent[]
}): RoomStripAgent[] {
  return options.agents.filter(agent =>
    !agent.isDefault
    && isColleague(agent)
    && isActiveAgent(agent)
    && !options.memberAgentIds.includes(agent.id))
}

/** Next roster after pulling somebody in. Idempotent. */
export function planRoomMemberAdd(
  memberAgentIds: readonly string[],
  agentId: string,
): string[] | null {
  if (!agentId || memberAgentIds.includes(agentId)) return null
  return [...memberAgentIds, agentId]
}

export interface RoomMemberRemovalPlan {
  memberAgentIds: string[]
  /** Sent only when the removal also vacates the lead seat. */
  pmAgentId?: null
}

/**
 * Next roster after pushing somebody out. Returns a reason instead of a plan
 * when the app layer would refuse it (a room needs at least one member) — the
 * caller surfaces that as a line of ink, never as a silent no-op.
 */
export function planRoomMemberRemoval(options: {
  memberAgentIds: readonly string[]
  pmAgentId?: string
  agentId: string
}): { plan: RoomMemberRemovalPlan } | { error: string } {
  if (!options.memberAgentIds.includes(options.agentId)) {
    return { error: 'TA 已经不在这个群里' }
  }
  if (options.memberAgentIds.length <= 1) {
    return { error: '房间至少需要一名成员' }
  }
  const memberAgentIds = options.memberAgentIds.filter(id => id !== options.agentId)
  return {
    plan: options.pmAgentId === options.agentId
      ? { memberAgentIds, pmAgentId: null }
      : { memberAgentIds },
  }
}
