/**
 * 「这个人名下是哪张 doing 卡」—— 一次**看板查询**,从看板现算,不新增任何账。
 *
 * ## 这个文件曾经是「在忙」的口径,现在不是了(D8 观测体系 §4.4)
 *
 * C4 审查里那个「四口径」问题的最后一块就落在这里:在场判定从前是从看板的 doing
 * 卡现算的 —— 一张卡躺在「在做」列里,这个人就被画成在忙。那个判据在两个方向上
 * 都撒谎:一张忘了收的卡让一个闲了三天的人一直亮着;一个正在群里写长回复、名下
 * 却没有卡的人则显示空闲。而 v3 特有的「持牌等大脑」它压根表达不了。
 *
 * 「谁在忙」现在由 collabBoard 的 `agents` 账回答
 * (`chat/room-member-strip.ts` 的 `resolveRoomMemberPresence`)。这个函数留下来,
 * 但它回答的是另一个问题,而那个问题本来就该由看板回答:**「TA 在做哪张卡」** ——
 * 卡标题、短号、以及"点得开哪条线程"的靶子。
 *
 * 三个消费点共用这一份实现:
 *  - TabBar 私聊房头 / say 流的工作卡徽标(agent-im-dm.md §4.3),它要点得开,
 *    所以只认真开过工作台的卡(`requireWorkSession`);
 *  - C1 左栏「进行中」活卡片(im-workbench-layout.md §3 W1),它只是说一句
 *    "TA 手上是哪张卡",没开过工作台的 doing 卡照样算;
 *  - 右栏成员表那一行的副文案(`workbench/room-members.ts`),同上一档。
 *
 * 差别收在一个选项里而不是两份 filter —— 否则下一次改"什么算一张在做的卡"就会
 * 漏掉其中一处,而那正是两个界面开始互相打架的方式。
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
