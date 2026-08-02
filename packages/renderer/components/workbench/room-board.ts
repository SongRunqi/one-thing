/**
 * 房间背台「看板」格的**纯逻辑**(样板 `docs/design/im-redesign/right-panel.html`
 * 一 · 看板)。
 *
 * 既有的 `CollabBoardPanel.vue` 是**三列卡片**,250px 的右栏里塞不进去(一列
 * 80px,卡片本身的内边距就吃掉一半)。所以背台换成**窄栏行式**:同一份数据
 * (`CollabTask`),只换呈现。`CollabBoardPanel.vue` 一个字节不动 —— 它还服务
 * 工具页签那一路(直聊/工程面下的「看板」页签)。
 *
 * 纪律(与 `active-work.ts` 同一条):
 *  1. **一个字段都不新增**。分组、副文、右端那一句全部由 `CollabTask` 既有的
 *     status / blockReason / report.evidence / updatedAt 推导。
 *  2. **判定不重造**。"这张卡该显示成什么"只有 `resolveActiveWorkTag` 一处,
 *     "行右端写什么"只有 `resolveActiveWorkRowMeta` 一处 —— 左栏活卡片吃的就是
 *     这两个,右栏不另起一套时间/状态话术。
 *  3. **「待你」永远置顶**。看板上唯一需要人动手的那一撮,不该排在"在做"后面
 *     等人滚下去找。
 */
import type { CollabTask } from '@shared/ipc'
import {
  resolveActiveWorkRowMeta,
  resolveActiveWorkTag,
  type ActiveWorkTag,
} from '@/components/sidebar/active-work'
import { BOARD_COLUMNS, formatBoardEvidence } from './collab-board-card'

/**
 * 四段。前三段与左栏活卡片的三档同源(执行中 / 待你 / 已交付),多出来的
 * 「待办」是**为了不丢数据**:看板有 backlog/todo 两列,左栏第一区不收它们
 * (那是待办不是在做),但背台的看板格是**整块板的另一种读法**,漏掉待办等于
 * 让用户在这一面上看不见自己排的活。
 */
export type RoomBoardGroupKey = 'awaiting' | 'doing' | 'todo' | 'delivered'

export interface RoomBoardRow {
  taskId: string
  /** 卡标题;没写标题就退到短号(与左栏活卡片同一截)。 */
  title: string
  /** 一行副文:等你什么 / 执行记录 / 所在列。'' = 不画。 */
  detail: string
  assigneeAgentId: string
  name: string
  avatar?: string
  avatarImage?: string
  /** 墓碑行:名字还读得出来,只是灰显。 */
  isRetired: boolean
  /** 行右端那一句(与左栏活卡片同一处格式化)。 */
  meta: string
  /** 在跑 → 行右端一枚绿点。 */
  running: boolean
  /** 点这一行能打开的执行会话('' = 这张卡还没开过工作台,点不动)。 */
  workSessionId: string
  updatedAt: number
}

export interface RoomBoardGroup {
  key: RoomBoardGroupKey
  /** 段头文案(计数由呈现层拼「待你 — 1」,与成员表同一手法)。 */
  label: string
  rows: RoomBoardRow[]
}

const BOARD_GROUP_LABEL: Record<RoomBoardGroupKey, string> = {
  awaiting: '待你',
  doing: '在做',
  todo: '待办',
  delivered: '已交付',
}

/** 「待你」置顶 —— 这一行顺序就是样板的自上而下。 */
const BOARD_GROUP_ORDER: readonly RoomBoardGroupKey[] = ['awaiting', 'doing', 'todo', 'delivered']

const TASK_SHORT_ID_LENGTH = 8

/** 卡在哪一列(`BOARD_COLUMNS` 是列名的唯一真源,不在这里另写一张中文表)。 */
function columnLabel(task: CollabTask): string {
  return BOARD_COLUMNS.find(column => column.status === task.status)?.label || ''
}

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
 * 一行副文。
 *
 * - **待你** → 等你什么(`tag.hint`:blockReason 或「等你放行」);
 * - **其余** → 执行记录(`write×1, read×2`,code 数出来的),没有记录就说它在哪一列。
 *
 * 都是既有字段的直读。**不去数"37 步"** —— 样板画的是步数,但卡上没有这个数,
 * 从 `toolCounts` 求和冒充步数是编造(工具调用次数 ≠ 执行步数)。
 */
function detailOf(task: CollabTask, tag: ActiveWorkTag, group: RoomBoardGroupKey): string {
  if (group === 'awaiting') {
    const hint = (tag.hint || '').trim()
    if (hint) return hint
  }
  const evidence = formatBoardEvidence(task.report?.evidence)
  return evidence || columnLabel(task)
}

/** 署名投影 —— `agentsStore.displayAgent` 的产物子集(与 `room-threads.ts` 同形)。 */
export interface RoomBoardIdentity {
  name: string
  avatar?: string
  avatarImage?: string
  status?: string
}

export interface BuildRoomBoardGroupsInput {
  tasks: readonly CollabTask[]
  /** `agentsStore.displayAgent` —— 墓碑三态在它里面,这里不判。 */
  identity: (agentId: string) => RoomBoardIdentity
  /** 这条工作台会话此刻是否卡在权限上(collabBoard store 的 `hasPendingAsk`)。 */
  awaitingPermission?: (workSessionId: string) => boolean
  /** 此刻在跑(chat store 的 `isSessionGenerating`,不是第二本账)。 */
  isRunning?: (workSessionId: string) => boolean
  /** 一处计时:整张表一个 now。 */
  now?: number
}

/**
 * 看板 → 窄栏行式的四段,**「待你」永远置顶**,段内按 `updatedAt` 倒序。
 *
 * 空段整段不画;同刻的两张卡按 taskId 定序(排序必须稳定)。
 */
export function buildRoomBoardGroups(input: BuildRoomBoardGroupsInput): RoomBoardGroup[] {
  const now = input.now ?? Date.now()
  const buckets: Record<RoomBoardGroupKey, RoomBoardRow[]> = {
    awaiting: [],
    doing: [],
    todo: [],
    delivered: [],
  }

  for (const task of input.tasks) {
    if (!task?.id) continue
    const workSessionId = task.workSessionIds?.[task.workSessionIds.length - 1] || ''
    const tag = resolveActiveWorkTag(task, {
      awaitingPermission: !!workSessionId && input.awaitingPermission?.(workSessionId) === true,
    })
    const group = groupOf(task, tag)
    const agentId = (task.assigneeAgentId || '').trim()
    const who = input.identity(agentId)
    const shortId = `#${task.id.slice(0, TASK_SHORT_ID_LENGTH)}`
    const updatedAt = task.updatedAt || 0

    buckets[group].push({
      taskId: task.id,
      title: (task.title || '').trim() || shortId,
      detail: detailOf(task, tag, group),
      assigneeAgentId: agentId,
      name: (who?.name || '').trim(),
      avatar: who?.avatar,
      avatarImage: who?.avatarImage,
      isRetired: who?.status === 'retired',
      meta: resolveActiveWorkRowMeta({ tag, updatedAt }, now),
      running: !!workSessionId && input.isRunning?.(workSessionId) === true,
      workSessionId,
      updatedAt,
    })
  }

  return BOARD_GROUP_ORDER
    .map(key => ({
      key,
      label: BOARD_GROUP_LABEL[key],
      rows: buckets[key].sort((a, b) => (b.updatedAt - a.updatedAt) || a.taskId.localeCompare(b.taskId)),
    }))
    .filter(group => group.rows.length > 0)
}

/**
 * 看板格要不要亮橙点 —— 「有没有待你的卡」。
 *
 * 判定复用 `groupOf`(与行分组同一处),所以点亮与置顶永远说的是同一撮卡;
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
