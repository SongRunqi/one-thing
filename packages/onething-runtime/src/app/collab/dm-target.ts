/**
 * `dm` 的 `to` 指的是谁(docs/design/agent-dm-user.md §3.1)。
 *
 * 此前 `to` 只认 agent —— 用户没有 agentId,于是 `dm to:"用户"` 必然解析失败。
 * 这个模块在 `resolveCollabAgentHandle` **之前**加一档用户匹配,而不是改写它:
 * 那个函数的语义是"从同事名册里找一个人",给它塞进一个不是 agent 的返回值会
 * 污染它另外两个调用点(board 的 assignee、say 的 mentions)——用户既不能被
 * 指派卡,也不在 mentions[] 里。
 *
 * 匹配顺序是"先用户后同事",冲突则**双双拒绝**:用户的名字或句柄撞上某个
 * agent 时,两个答案都成立,而 dm 发错人是不可撤销的。与既有的 agent 重名
 * 拒绝同款措辞——列出候选,让模型用精确写法再说一次(A1「绝不 default 冒充」)。
 */
import {
  COLLAB_USER_CONSTANT_WORDS,
  formatCollabAgentHandle,
  resolveCollabAgentHandle,
  type CollabAgentLike,
} from '@onething/runtime/collab'
import { resolveUserIdentity } from './user-identity.js'

export type CollabDmTarget =
  | { kind: 'user' }
  | { kind: 'agent'; agentId: string }

export type CollabDmTargetResolution =
  | { ok: true; target: CollabDmTarget }
  | { ok: false; error: string }

/**
 * 两个常量词。**即使用户从没配置过资料**,`dm to:"用户"` 也必须可达 ——
 * 一个只在配置之后才存在的通道等于没有通道。
 *
 * 单一属主(collab-handle-codec.md §2.1):这份表同时是裸句柄「名实相符」判据
 * 的别名来源(`collabUserIdentity` 的 aliases)。两处各抄一份的下场是可预见的
 * —— 改一处、另一处安静地不认,而"另一处"正是这次泄漏的现场。
 */
const USER_CONSTANT_WORDS: readonly string[] = COLLAB_USER_CONSTANT_WORDS

/** 这个写法指的是用户吗。句柄与英文常量词按小写比,中文名按原文比。 */
function matchesUser(raw: string, identity: { label: string; handle: string }): boolean {
  const lower = raw.toLowerCase()
  if (USER_CONSTANT_WORDS.includes(lower)) return true

  const handle = identity.handle.toLowerCase()
  // 句柄的三种写法:裸句柄、`#句柄`、`名字#句柄`(与同事行逐字同构)。
  if (lower === handle || lower === `#${handle}`) return true
  const hashAt = raw.lastIndexOf('#')
  if (hashAt >= 0) {
    const namePart = raw.slice(0, hashAt).trim()
    const handlePart = raw.slice(hashAt + 1).trim().toLowerCase()
    if (handlePart === handle) {
      // 名字对不上不算否决:花名册里那一行写的是「名字#句柄(用户)」,而
      // 「以句柄为准,名字只当显示」是既有的 agent 解析口径,这里一致。
      return namePart === identity.label || USER_CONSTANT_WORDS.includes(namePart.toLowerCase()) || !namePart
    }
  }

  return raw === identity.label
}

export function resolveDmTarget(
  query: string | undefined | null,
  agents: readonly CollabAgentLike[],
): CollabDmTargetResolution {
  const raw = (query ?? '').trim().replace(/^@/, '')
  if (!raw) return { ok: false, error: '要发给谁?to 填花名册里的写法「名字#句柄」,发给用户本人就写「用户」。' }

  const identity = resolveUserIdentity()
  if (!matchesUser(raw, identity)) {
    const resolved = resolveCollabAgentHandle(raw, agents)
    return resolved.ok
      ? { ok: true, target: { kind: 'agent', agentId: resolved.agentId } }
      : { ok: false, error: resolved.error }
  }

  // 命中用户 —— 但同一个写法也可能指向某位同事。两边都成立时不选,只报。
  const clashing = resolveCollabAgentHandle(raw, agents)
  if (clashing.ok) {
    const agent = agents.find(candidate => candidate.id === clashing.agentId)
    const agentLabel = agent ? formatCollabAgentHandle(agent.id, agent.name) : clashing.agentId
    return {
      ok: false,
      error: `「${raw}」既是用户本人,也是同事${agentLabel} —— 说清是哪一个:发给用户写「用户」,发给同事写「#${agentLabel.split('#')[1] ?? ''}」。`,
    }
  }

  return { ok: true, target: { kind: 'user' } }
}
