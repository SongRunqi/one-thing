/**
 * 房头的**纯逻辑** —— 去复用重构 R1(样板 `docs/design/im-redesign/final.html`
 * 一 · 群聊 / 三 · 私聊)。
 *
 * 房头有且只有两态:
 *  - **群聊**:`# 房名` + 主题 + 成员头像堆 + 动作;
 *  - **私聊**:头像 + 名字 + 「在忙 · 正在做什么」一行。
 *
 * 纪律(与 W7 同一条):在场与"在忙什么"一律从看板现算,**不新增第四套账**。
 * 主题也一样——它不是一个新字段,而是"这间房现在有哪些活在跑"的一句话读法。
 * 拿不到看板就整句不画:空主题好过编一个。
 */
import type { CollabBoard } from '@shared/ipc'
import { findAgentDoingTask, type AgentDoingTask } from '@/components/chat/agent-activity'
import { ACTIVE_WORK_STATUSES } from '@/components/sidebar/active-work'

export type RoomHeadMode = 'group' | 'dm'

export interface RoomHeadAgent {
  id: string
  name: string
  title?: string
  avatar?: string
  avatarImage?: string
}

export interface RoomHeadModel {
  mode: RoomHeadMode
  /** 群聊 = 房名;私聊 = 那个人的名字。 */
  name: string
  /** 群聊 = 主题(在跑的活);私聊 = 在忙什么。空串 = 这一行不画。 */
  subtitle: string
  /** 私聊态才有;群聊态恒 null(群里的"谁"在成员堆里)。 */
  agent: RoomHeadAgent | null
  /** 私聊态:TA 名下那张 doing 卡(点得开工作台才给)。 */
  work: AgentDoingTask | null
}

/** 主题最多摊几张卡 —— 再多就不是主题而是看板了。 */
const TOPIC_TASK_LIMIT = 3
const TOPIC_SEPARATOR = ' · '

/**
 * 群聊房头的主题行 = 这间房**在跑的活**(doing / review / blocked),按最近更新
 * 排,最多三张。没有活在跑就是空串 —— 房头那一格干脆不画。
 */
export function buildRoomTopic(board: CollabBoard | null | undefined): string {
  if (!board?.tasks?.length) return ''
  return [...board.tasks]
    .filter(task => ACTIVE_WORK_STATUSES.includes(task.status))
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .slice(0, TOPIC_TASK_LIMIT)
    .map(task => (task.title || '').trim())
    .filter(Boolean)
    .join(TOPIC_SEPARATOR)
}

/** 私聊房头第二行:「在忙 · 干什么」/「空闲」。 */
export function buildDmPresence(task: AgentDoingTask | null): string {
  return task ? `在忙${TOPIC_SEPARATOR}${task.title}` : '空闲'
}

/**
 * composer 的占位符 —— 样板 `final.html`:群聊「发送到 #浏览器重构」、
 * 私聊「给小林发消息」(样板行 387 / 584)。
 *
 * 为什么是纯函数而不是 CSS:占位符是 `InputBox` 内部 `composerPlaceholder`
 * computed 的产物,CSS 够不着。R3 因此给 `InputBox` 开了一个**只读 prop**
 * (`placeholder`),房面把这句话算好递进去;直聊不传,`InputBox` 的行为一个
 * 字节不变(§8 铁律 5「composer 不重写」)。
 *
 * 空名字不编:退回一句不带名字的通用话,而不是画出「发送到 #」这种半截。
 */
export function buildComposerPlaceholder(head: Pick<RoomHeadModel, 'mode' | 'name'>): string {
  const name = (head.name || '').trim()
  if (head.mode === 'dm') return name ? `给${name}发消息` : '发消息'
  return name ? `发送到 #${name}` : '发送到这间房'
}

/**
 * 右栏「线程」tab 的默认落点:这间房里**最近在跑且真开过工作台**的那次执行。
 *
 * 右栏本身仍然是 App 级的那一个(`RightWorkbenchPanel`,C3-B 已带 `thread` tab
 * 与 `ThreadWorkbench`,开合口径 `resolveInspectorDefaultOpen` ≥1400) —— 房面
 * 不另起第二根栏,只负责回答"这间房该看哪条线程"。
 *
 * 拿不到就返回 null,**绝不派空事件**:`onething:open-thread` 收到空
 * workSessionId 只会打开一个没有内容的线程。
 */
export function findRoomDefaultThread(
  board: CollabBoard | null | undefined,
): { workSessionId: string; title: string; taskId: string } | null {
  if (!board?.tasks?.length) return null
  const task = [...board.tasks]
    .filter(candidate => candidate.status === 'doing' && candidate.workSessionIds.length > 0)
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0]
  const workSessionId = task?.workSessionIds[task.workSessionIds.length - 1]
  if (!task || !workSessionId) return null
  return { workSessionId, title: (task.title || '').trim(), taskId: task.id }
}

export interface RoomHeadInput {
  /** 会话名(群聊房名)。 */
  sessionName?: string
  /** 私聊房的那位同事;群聊传 null。 */
  dmAgent: RoomHeadAgent | null
  board: CollabBoard | null | undefined
}

/**
 * 房头模型。判定只有一条:**有 dmAgent 就是私聊态**——"人数即形态"这条规则
 * 在产品层(`isUserDmRoom`)已经判过,这里不再自己拼一遍。
 */
export function buildRoomHead(input: RoomHeadInput): RoomHeadModel {
  if (input.dmAgent) {
    const work = findAgentDoingTask(input.board, input.dmAgent.id, { requireWorkSession: true })
    return {
      mode: 'dm',
      name: input.dmAgent.name,
      subtitle: buildDmPresence(work),
      agent: input.dmAgent,
      work,
    }
  }
  return {
    mode: 'group',
    name: (input.sessionName || '').trim() || '未命名房间',
    subtitle: buildRoomTopic(input.board),
    agent: null,
    work: null,
  }
}
