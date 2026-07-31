/**
 * 右栏「空间页」(成员的下钻层)的**纯逻辑** —— 去复用重构 R2
 * (样板 `docs/design/im-redesign/final.html` 二 · 右栏三态,图 4)。
 *
 * 空间页在样板里是:80px 大头像 + 名字 + `职位 · 同事` + 一句描述 +
 * `会话 / 文件 / 配置` 三档 + 计数行。
 *
 * **计数不新算。** 四个数字全部取自履历页那份归类
 * (`utils/agent-sessions.ts` 的 `buildAgentHistory`,它自己又只是把 store 的
 * `agentPresence` / `agentDirectChatSessions` 摆成行)。右栏只是同一份账的
 * "摘要读法" —— 若这里自己写一遍 `kind==='agent' && agentId===…`,右栏与履历页
 * 就会在某次口径修改后开始互相打架,而那正是 W7 那条纪律要防的事。
 */
import type { AgentKind, AgentStatus } from '@shared/ipc'
import type { AgentHistory } from '@/utils/agent-sessions'

export type AgentSpaceCountKey = 'conversations' | 'rooms' | 'work' | 'pairDms'

export interface AgentSpaceCountRow {
  key: AgentSpaceCountKey
  label: string
  count: number
}

/**
 * 计数行。顺序即心智:先是"你和 TA",再是"TA 和别人"。
 *
 * 「干过的活」数的是**卡**不是会话:`work` 已经按卡分了组,一张卡跑了三次仍然
 * 是一件活。
 */
export function buildAgentSpaceCounts(history: AgentHistory): AgentSpaceCountRow[] {
  return [
    { key: 'conversations', label: '与你的对话', count: history.conversations.length },
    { key: 'rooms', label: '群聊', count: history.rooms.length },
    { key: 'work', label: '干过的活', count: history.work.length },
    { key: 'pairDms', label: '私下', count: history.pairDms.length },
  ]
}

export interface AgentSpaceSubtitleInput {
  title?: string
  kind?: AgentKind
  status?: AgentStatus
}

/**
 * 头像下面那一行:`职位 · 同事`。
 *
 * 没有职位就只剩分类那一截;已退休的补一个「已注销」——墓碑上必须写清楚,
 * 否则一个灰掉的名字读起来像是"暂时不在"。
 */
export function buildAgentSpaceSubtitle(input: AgentSpaceSubtitleInput): string {
  const parts: string[] = []
  const title = (input.title || '').trim()
  if (title) parts.push(title)
  parts.push(input.kind === 'service' ? '服务' : '同事')
  if (input.status === 'retired') parts.push('已注销')
  return parts.join(' · ')
}
