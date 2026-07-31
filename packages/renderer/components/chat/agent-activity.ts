/**
 * 「这个人此刻在忙什么」—— 从看板现算,不新增任何账。
 *
 * 两个消费点共用这一份实现:
 *  - TabBar 私聊房头的工作状态徽标(agent-im-dm.md §4.3),它要点得开,所以
 *    只认真开过工作台的卡(`requireWorkSession`);
 *  - C1 左栏「进行中」活卡片与在场状态(im-workbench-layout.md §3 W1/W7),
 *    它只是说一句"谁在干什么活",没有工作台的 doing 卡照样算在忙。
 *
 * 差别收在一个选项里而不是两份 filter —— 否则下一次改"什么算在忙"就会漏掉
 * 其中一处,而那正是两个界面开始互相打架的方式。
 */
import type { CollabBoard } from '@shared/ipc'

const TASK_SHORT_ID_LENGTH = 8

export interface AgentDoingTask {
  taskId: string
  /** 卡标题;没写标题就退到短号。 */
  title: string
  /** `#xxxxxxxx` —— 徽标上那截。 */
  shortId: string
  /** 这张卡**最新**的工作台会话(尾条 = 当前那次执行);没有就是空串。 */
  sessionId: string
}

/**
 * 这个 agent 名下最近更新的一张 doing 卡。
 *
 * 判定读看板既有的数据面(status + assigneeAgentId + workSessionIds),看板没
 * 加载 / 没有这样的卡都返回 null —— 空徽标是一个没有内容的承诺。
 */
export function findAgentDoingTask(
  board: CollabBoard | undefined | null,
  agentId: string | undefined | null,
  options: { requireWorkSession?: boolean } = {},
): AgentDoingTask | null {
  if (!board || !agentId) return null
  const task = [...(board.tasks || [])]
    .filter(candidate =>
      candidate.status === 'doing' &&
      candidate.assigneeAgentId === agentId &&
      (!options.requireWorkSession || candidate.workSessionIds.length > 0))
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0]
  if (!task) return null
  const shortId = `#${task.id.slice(0, TASK_SHORT_ID_LENGTH)}`
  return {
    taskId: task.id,
    title: (task.title || '').trim() || shortId,
    shortId,
    sessionId: task.workSessionIds[task.workSessionIds.length - 1] || '',
  }
}
