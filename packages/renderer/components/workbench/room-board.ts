/**
 * 看板页签那枚**橙点**的纯逻辑 —— 「这间房有没有待你的卡」。
 *
 * 勘误(2026-08-04):这个文件原本还带着一份**窄栏行式看板**
 * (`buildRoomBoardGroups`),那是房间背台「看板」格的呈现层。右栏收敛成一套
 * 工作台页签之后,看板那一页画的是既有的 `CollabBoardPanel`(预算 / 冻结 /
 * 群 folder 都在它身上),窄栏那一份随背台一并退役 —— 留下的只有橙点。
 *
 * 纪律(与 `active-work.ts` 同一条):
 *  1. **一个字段都不新增**:分档全部由 `CollabTask` 既有的 status 与权限态推导;
 *  2. **判定不重造**:"这张卡该显示成什么"只有 `resolveActiveWorkTag` 一处;
 *  3. **不显示计数**:只回答"有没有",不数几张。
 */
import type { CollabTask } from '@shared/ipc'
import { resolveActiveWorkTag, type ActiveWorkTag } from '@/components/sidebar/active-work'

/**
 * 四档。前三档与左栏活卡片同源(执行中 / 待你 / 已交付),多出来的「待办」是
 * 看板 backlog/todo 两列的归处 —— 橙点只认第一档,其余三档留着是为了让
 * `groupOf` 这一处判定读起来仍是完整的一张表,而不是一个 boolean 的伪装。
 */
type RoomBoardGroupKey = 'awaiting' | 'doing' | 'todo' | 'delivered'

/**
 * 分组:先看状态标(`awaiting` = 受阻或等你放行),再看列。
 *
 * `awaiting` 优先于列 —— 一张 doing 卡卡在权限上时,它的位置是「待你」而不是
 * 「在做」,那正是它需要被抬到顶上的原因。
 */
function groupOf(task: CollabTask, tag: ActiveWorkTag): RoomBoardGroupKey {
  if (tag.tone === 'awaiting') return 'awaiting'
  if (task.status === 'review' || task.status === 'done') return 'delivered'
  if (task.status === 'doing') return 'doing'
  return 'todo'
}

/**
 * 看板页签要不要亮橙点 —— 「有没有待你的卡」。
 *
 * 判定走 `groupOf`,所以"点亮"说的与看板上「待你」那一撮永远是同一批卡;
 * 而且**只回答有没有**,不数几张(计数一律不显示)。
 */
export function hasRoomBoardAwaiting(input: {
  tasks: readonly CollabTask[]
  awaitingPermission?: (workSessionId: string) => boolean
}): boolean {
  return input.tasks.some(task => {
    if (!task?.id) return false
    const workSessionId = task.workSessionIds?.[task.workSessionIds.length - 1] || ''
    const tag = resolveActiveWorkTag(task, {
      awaitingPermission: !!workSessionId && input.awaitingPermission?.(workSessionId) === true,
    })
    return groupOf(task, tag) === 'awaiting'
  })
}
