/**
 * 左栏第一区「进行中」的纯逻辑 —— 工作台式外壳 C1
 * (docs/design/im-workbench-layout.md §3 W1 / §4 W-Q1 / §7)。
 *
 * 这里只放**纯函数**:状态标映射、进度刻度、跨房聚合与排序、以及"该补拉哪几间
 * 房的看板"。理由与 useShellMode.ts 同一条:.vue 里挂不起测试,而这三件恰恰是
 * 最容易在下一次改动里悄悄长出第二份口径的地方。
 *
 * 纪律:
 *  1. **一个字段都不新增。** 卡片的名字/负责人/状态/进度全部由 `CollabTask`
 *     既有的 status / assigneeAgentId / workSessionIds / report.evidence /
 *     updatedAt 推导(packages/shared/ipc/collab.ts)。看板是唯一真源,左栏是
 *     它的一个读法,不是它的副本。
 *  2. **状态标只有三种呈现**(W1):执行中 / 待审批 / 已交付。`blocked` 不自成
 *     一档 —— 它归入待审批,`blockReason` 挂 title。多一档就等于要求用户在侧栏
 *     学一套看板词汇。
 *  3. **进度是阶段刻度,不是百分比。** 系统不知道"这活干完了 72%",编一个数字
 *     出来比不画更糟;所以这里只回答"走到哪一档了",四档,写死在下面那张表里。
 */
import type { CollabBoard, CollabTask, CollabTaskStatus } from '@shared/ipc'
import { findAgentDoingTask } from '@/components/chat/agent-activity'

/** 卡上那截短号(与 agent-activity.ts 同宽,同一张卡两处显示必须一致)。 */
const TASK_SHORT_ID_LENGTH = 8

/**
 * 进第一区的状态(W-Q1 已拍板):`doing` + `review` + `blocked`。
 *
 * `todo` **不进** —— 那是待办不是在做,它的入口在看板。第一区一旦收下待办,
 * "以活为脊"就退化成第二个看板。
 */
export const ACTIVE_WORK_STATUSES: readonly CollabTaskStatus[] = ['doing', 'review', 'blocked']

export function isActiveWorkStatus(status: CollabTaskStatus | undefined): boolean {
  return !!status && ACTIVE_WORK_STATUSES.includes(status)
}

/** 三档呈现。`tone` 决定颜色(绿/橙/墨),`label` 是标上的字。 */
export type ActiveWorkTone = 'running' | 'awaiting' | 'delivered'

export interface ActiveWorkTag {
  tone: ActiveWorkTone
  label: string
  /** 挂在 title 上的补语:blocked 给 blockReason,待放行给一句人话。 */
  hint?: string
}

const TAG_RUNNING: ActiveWorkTag = { tone: 'running', label: '执行中' }
const TAG_DELIVERED: ActiveWorkTag = { tone: 'delivered', label: '已交付' }

/**
 * 状态标映射 —— **全系统唯一一处**"这张卡该显示成什么"。
 *
 * `awaitingPermission` 是 doing 卡的一个覆盖:人还在跑,但跑不动了,在等你放行。
 * 它读的是 collabBoard store 既有的 `hasPendingAsk`(按工作台会话记的那本),
 * 不是新账 —— 拿不到就退回执行中,宁可少说一句也不假报一次待审批。
 */
export function resolveActiveWorkTag(
  task: Pick<CollabTask, 'status' | 'blockReason'>,
  options: { awaitingPermission?: boolean } = {},
): ActiveWorkTag {
  if (task.status === 'blocked') {
    return { tone: 'awaiting', label: '待审批', hint: (task.blockReason || '').trim() || undefined }
  }
  if (task.status === 'review' || task.status === 'done') return TAG_DELIVERED
  if (options.awaitingPermission) return { tone: 'awaiting', label: '待审批', hint: '等你放行' }
  return TAG_RUNNING
}

/**
 * 进度的四档阶梯。数值只是画条子的宽度,语义在档名上:
 *  - `assigned`  领了活,还没开过工作台
 *  - `started`   开过工作台,还没留下执行痕迹
 *  - `producing` evidence 里有工具调用或交付物(code 数出来的,模型写不了)
 *  - `delivered` 交付了(review / done)
 *
 * `blocked` 不单独占一档:它停在停下来的那一档上 —— 卡住的活不该因为卡住而
 * 显得更完成或更不完成。
 */
export const ACTIVE_WORK_STAGE_RATIO = {
  assigned: 0.15,
  started: 0.45,
  producing: 0.75,
  delivered: 1,
} as const

export type ActiveWorkStage = keyof typeof ACTIVE_WORK_STAGE_RATIO

export function resolveActiveWorkStage(
  task: Pick<CollabTask, 'status' | 'workSessionIds' | 'report'>,
): ActiveWorkStage {
  if (task.status === 'review' || task.status === 'done') return 'delivered'
  const evidence = task.report?.evidence
  const hasEvidence = !!evidence
    && (Object.keys(evidence.toolCounts || {}).length > 0 || (evidence.files || []).length > 0)
  if (hasEvidence) return 'producing'
  return (task.workSessionIds || []).length > 0 ? 'started' : 'assigned'
}

/** 身份投影(域模型 M4 的 `displayAgent`)—— 查无此人给墓碑,绝不冒充 default。 */
export interface ActiveWorkIdentity {
  name: string
  avatar?: string
  avatarImage?: string
}

/** 左栏一张活卡片要画的全部东西。渲染层不再从 task 上现算任何一格。 */
export interface ActiveWorkCardModel {
  taskId: string
  /** `#xxxxxxxx` —— 与私聊房头徽标同一截短号。 */
  shortId: string
  /** 这张卡所属的房。点卡 = 开这间房。 */
  roomSessionId: string
  title: string
  assigneeAgentId: string
  assigneeName: string
  assigneeAvatar?: string
  assigneeAvatarImage?: string
  tag: ActiveWorkTag
  stage: ActiveWorkStage
  /** 0–1,画条子用。见 ACTIVE_WORK_STAGE_RATIO 的注释:这是档不是百分比。 */
  progress: number
  updatedAt: number
  /**
   * 负责人此刻在干的**就是这张卡**(W7「谁在干什么活」)。
   *
   * 判定转发 `findAgentDoingTask` —— 私聊房头徽标吃的是同一个函数,所以左栏和
   * 房头永远不会各说各的。同一个人名下有两张 doing 卡时只有最新的那张算数。
   */
  isAssigneeCurrent: boolean
  /**
   * 这张卡**最新**的工作台会话(尾条 = 当前那次执行);没有就是空串。
   *
   * C3 的接口:右栏 `'thread'` tab 要开的就是它。C1 只把它算出来带在卡上,
   * 不自己造右栏。
   */
  workSessionId: string
}

export interface CollectActiveWorkInput {
  /** collabBoard store 的 `boards`:roomSessionId → board。只读已加载的那些。 */
  boards: Readonly<Record<string, CollabBoard | undefined>>
  identityOf: (agentId: string) => ActiveWorkIdentity
  /**
   * 这间房还在不在(会话列表里)。房被删了但 store 里还躺着一份旧快照时,
   * 卡片必须跟着消失 —— 点开一间不存在的房是死链。不给就一律收下。
   */
  isKnownRoom?: (roomSessionId: string) => boolean
  /** 这个工作台会话此刻是否卡在权限上。不给就一律当没卡。 */
  awaitingPermission?: (workSessionId: string) => boolean
}

/**
 * 跨房把「在跑的活」摊成一份扁平清单,**按 updatedAt 倒序**。
 *
 * 不按房分组(§7 的取舍):活是主体,房是属性 —— 左栏第一区回答的是"此刻有什么
 * 在动",而不是"哪间房里有什么"。房的入口在下一区。
 * 同一毫秒的两张卡按 taskId 兜底排序,免得每次重算都换位置。
 */
export function collectActiveWork(input: CollectActiveWorkInput): ActiveWorkCardModel[] {
  const cards: ActiveWorkCardModel[] = []

  for (const [roomSessionId, board] of Object.entries(input.boards)) {
    if (!board) continue
    if (input.isKnownRoom && !input.isKnownRoom(roomSessionId)) continue
    // 一间房里每个负责人算一次「此刻在干哪张卡」,别在卡的循环里重算。
    const currentByAgent = new Map<string, string>()
    for (const task of board.tasks || []) {
      if (!isActiveWorkStatus(task.status)) continue
      const workSessionId = task.workSessionIds?.[task.workSessionIds.length - 1] || ''
      const assigneeAgentId = task.assigneeAgentId || ''
      const identity = input.identityOf(assigneeAgentId)
      const shortId = `#${task.id.slice(0, TASK_SHORT_ID_LENGTH)}`
      const stage = resolveActiveWorkStage(task)
      if (assigneeAgentId && !currentByAgent.has(assigneeAgentId)) {
        currentByAgent.set(assigneeAgentId, findAgentDoingTask(board, assigneeAgentId)?.taskId || '')
      }
      cards.push({
        taskId: task.id,
        shortId,
        roomSessionId,
        title: (task.title || '').trim() || shortId,
        assigneeAgentId,
        assigneeName: identity.name,
        assigneeAvatar: identity.avatar,
        assigneeAvatarImage: identity.avatarImage,
        tag: resolveActiveWorkTag(task, {
          awaitingPermission: !!workSessionId && input.awaitingPermission?.(workSessionId) === true,
        }),
        stage,
        progress: ACTIVE_WORK_STAGE_RATIO[stage],
        updatedAt: task.updatedAt || 0,
        isAssigneeCurrent: !!assigneeAgentId && currentByAgent.get(assigneeAgentId) === task.id,
        workSessionId,
      })
    }
  }

  return cards.sort((a, b) => (b.updatedAt - a.updatedAt) || a.taskId.localeCompare(b.taskId))
}

// ── 跨房补齐:哪几间房值得拉一次看板 ──────────────────────────────────────
//
// `collabBoard` store 是「一间房一块板」(`load(roomSessionId)`),左栏却要跨房
// 聚合。**不能**为此在启动时把每间房都 load 一遍:N 间房 = N 次 IPC,而且"左栏
// 看得见"本身不该成为全量拉取的理由。
//
// 所以补齐是**定向**的:候选集从内存里已有的会话列表推导 —— 一间房只有开过
// 工作台(有 `kind='work'` 的子会话指着它)才可能有 doing/review 卡。没干过活的
// 房永远不会被拉。再按最近活动截断,只补最新的那几间。

/** 一次冷启补齐最多拉几间房。超出的等广播/开房自己热起来。 */
export const ACTIVE_WORK_HYDRATION_LIMIT = 8

/** 补齐候选只需要会话的这几格。`SessionListItem` 结构上满足它。 */
export interface ActiveWorkSessionSource {
  id: string
  kind?: string
  updatedAt?: number
  collab?: { roomSessionId?: string } | null
}

export interface HydrationTargetsInput {
  /** 全量会话(不是 filteredSessions —— 工作台会话正是被它摘掉的那一路)。 */
  sessions: readonly ActiveWorkSessionSource[]
  /** 已经在 store 里的房(不重复拉)。 */
  loadedRoomIds?: readonly string[]
  /** 这间房还在不在会话列表里。房没了就别去拉它的板。 */
  isKnownRoom?: (roomSessionId: string) => boolean
  limit?: number
}

/**
 * 该补拉看板的房,**最近有活动的在前**,去重且截断。
 *
 * 代价(明写在这儿,免得下一个人以为它是全量):一张 review 卡如果所属的房从来
 * 没开过工作台,冷启时不会被补到 —— 它得等用户开房、或等一条
 * `collab:board-changed` 广播把快照推进来。用一次可能的漏,换掉 N 次必然的 IPC。
 */
export function activeWorkHydrationTargets(input: HydrationTargetsInput): string[] {
  const loaded = new Set(input.loadedRoomIds || [])
  const lastActive = new Map<string, number>()

  for (const session of input.sessions) {
    // 只认真的执行会话:work = 干某张卡,agent = 答某间房的驱动(W18)。
    if (session.kind !== 'work' && session.kind !== 'agent') continue
    const roomSessionId = session.collab?.roomSessionId
    if (!roomSessionId || loaded.has(roomSessionId)) continue
    if (input.isKnownRoom && !input.isKnownRoom(roomSessionId)) continue
    const at = session.updatedAt || 0
    if ((lastActive.get(roomSessionId) ?? -1) < at) lastActive.set(roomSessionId, at)
  }

  return [...lastActive.entries()]
    .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]))
    .slice(0, Math.max(0, input.limit ?? ACTIVE_WORK_HYDRATION_LIMIT))
    .map(([roomSessionId]) => roomSessionId)
}
