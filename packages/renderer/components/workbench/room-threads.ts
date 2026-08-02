/**
 * 右栏「线程」tab **列表层**的纯逻辑。
 *
 * 线程从「直接展示某一次执行」改成两层:**这间房的执行会话列表 → 选中 → 该会话
 * 详情**(详情是 `ThreadChatDetail` —— 既有的聊天 UI,一行渲染都没重写)。这个文件只回答
 * 列表层那三个问题:哪些会话进来、怎么排、每行副文写什么。
 *
 * 与 `room-members.ts` 同一条纪律(W7,`docs/design/im-workbench-layout.md` §3):
 * **一份账都不新增**。
 *
 *  - 归属:一间房的执行会话就在 sessions store 里,靠 `session.collab.roomSessionId`
 *    认门(`packages/shared/ipc/chat.ts` 的 `CollabWorkRef`)。
 *    **禁止反解 id 字符串** —— `agent-exec-<agentId>-<roomSessionId>` 那族 id 只是
 *    幂等键,归属永远读结构化字段,署名永远读 `session.agentId`;
 *  - 署名:`displayAgent`(域模型 M4)由调用方以 `identity` 注入 —— 查无此人给墓碑,
 *    渲染永不炸,也绝不冒充 default agent;
 *  - 卡标题:看板那份 `CollabTask.title`(`taskId` 对上即可),由 `taskTitle` 注入;
 *  - 右端那一句:直接用左栏活卡片那一处 `resolveActiveWorkRowMeta` —— 「跑了多久 /
 *    交在什么时候」两处措辞必须一模一样,右栏不另起一套时间话术。
 *
 * 两类执行会话的差别只在副文这一格:
 *  - `kind === 'work'` —— 某张卡的工作台执行,副文是**卡标题**;
 *  - `kind === 'agent'` —— 某个 agent 在这间房的常驻执行会话(W18),它服务的是
 *    房间对话而不是某一张卡,`taskId` 因此可有可无,副文写「服务房间对话」。
 */
import type { AgentStatus } from '@shared/ipc'
import { resolveActiveWorkRowMeta, type ActiveWorkTag } from '@/components/sidebar/active-work'

/** `kind === 'agent'` 那一档的副文:它服务的是这间房的对话,不是某一张卡。 */
export const ROOM_THREAD_AGENT_DETAIL = '服务房间对话'

/** `kind === 'dm'` 那一档的副文(两位成员私下说的话,D4 透明制:可旁观可插话)。 */
export const ROOM_THREAD_DM_DETAIL = '私下对话'

/** 卡指针查不到标题、会话自己也没名字时的兜底 —— 不编造卡名。 */
export const ROOM_THREAD_WORK_FALLBACK = '工作台执行'

/** 空态那一句(这间房还没跑过任何活)。 */
export const ROOM_THREAD_EMPTY_HINT = '这间房还没有执行会话。'

/** 空态的第二句(样板 三 · 空态):说清楚"这里以后会长出什么",不是一块死白。 */
export const ROOM_THREAD_EMPTY_SUBHINT = '有人开工之后,这里会按人列出每一次执行。'

/** 列表层读的会话字段;一个 `SessionDetails` 天然满足它。 */
export interface RoomThreadSessionLike {
  id: string
  name?: string
  kind?: string
  agentId?: string
  updatedAt?: number
  /** 归属指针(结构化字段,唯一真源)。 */
  collab?: { roomSessionId?: string; taskId?: string } | null
}

/** 署名投影 —— `agentsStore.displayAgent` 的产物子集。 */
export interface RoomThreadIdentity {
  name: string
  avatar?: string
  avatarImage?: string
  status?: AgentStatus
}

/** 一张脸(私下行画两张:那是两个人的对话,只画一张就是在骗人)。 */
export interface RoomThreadFace {
  agentId: string
  avatar?: string
  avatarImage?: string
  isRetired: boolean
}

export interface RoomThreadRow {
  /** 这条会话 —— 选中它就是详情层的靶子(执行会话或私下房)。 */
  sessionId: string
  agentId: string
  /**
   * 'work' = 某张卡的工作台执行;'agent' = 这间房的常驻执行会话(W18);
   * 'dm' = 两位成员之间的私下房(agent ⇄ agent,D3/D4)。
   */
  kind: 'agent' | 'work' | 'dm'
  /** 'work' 恒有;'agent' / 'dm' 可空(它们不绑卡)。 */
  taskId: string
  name: string
  avatar?: string
  avatarImage?: string
  /** 墓碑行:名字还读得出来,只是灰显。 */
  isRetired: boolean
  /** 一行副文:卡标题 / 「服务房间对话」/「私下对话」。 */
  detail: string
  updatedAt: number
  /** 行右端那一句(与左栏活卡片同一处格式化)。 */
  meta: string
  running: boolean
  /** 私下行的两张脸;执行行不给(呈现层照旧画单张头像,逐像素不变)。 */
  faces?: RoomThreadFace[]
}

export interface BuildRoomThreadRowsInput {
  /** 这间房。空串 = 无从谈起,返回空表(空态由呈现层画)。 */
  roomSessionId: string
  sessions: readonly RoomThreadSessionLike[]
  /** `agentsStore.displayAgent` —— 墓碑三态在它里面,这里不判。 */
  identity: (agentId: string) => RoomThreadIdentity
  /** 看板的卡标题;拿不到就落到会话名。 */
  taskTitle?: (taskId: string) => string
  /** 此刻在跑(chat store 的 `isSessionGenerating`,不是第二本账)。 */
  isRunning?: (sessionId: string) => boolean
  /** 一处计时:整张表一个 now,不在每一行各取一次。 */
  now?: number
}

const ROOM_THREAD_RUNNING_TAG: ActiveWorkTag = { tone: 'running', label: '执行中' }
const ROOM_THREAD_IDLE_TAG: ActiveWorkTag = { tone: 'delivered', label: '已交付' }

function workDetail(
  taskId: string,
  sessionName: string,
  taskTitle?: (taskId: string) => string,
): string {
  const fromBoard = taskId ? (taskTitle?.(taskId) || '').trim() : ''
  if (fromBoard) return fromBoard
  // 卡被删了(或看板还没到)——会话名是冻结在创建时的那一份,读它比编一个卡名诚实。
  const frozen = (sessionName || '').trim()
  return frozen || ROOM_THREAD_WORK_FALLBACK
}

/**
 * 这条会话算不算「这间房的一条线程」——**归属判定的唯一一处**。
 *
 * 两类进来:`work`(某张卡的工作台执行)与 `agent`(这间房的常驻执行会话,W18)。
 * 归属只认结构化字段 `collab.roomSessionId`,**禁止反解 id 字符串**。
 */
export function isRoomThreadSession(
  session: RoomThreadSessionLike | null | undefined,
  roomSessionId: string,
): boolean {
  if (!session?.id) return false
  if (session.kind !== 'agent' && session.kind !== 'work') return false
  return (session.collab?.roomSessionId || '').trim() === (roomSessionId || '').trim()
}

/**
 * 这间房此刻有没有线程在跑 —— 分段器「线程」格那枚绿点读它。
 *
 * 与列表层同一条归属判定、同一份在跑口径(chat store 的 `isSessionGenerating`),
 * 不新起第二本账;而且**只回答有没有**,不数几条(计数一律不显示)。
 */
export function hasRunningRoomThread(input: {
  roomSessionId: string
  sessions: readonly RoomThreadSessionLike[]
  isRunning: (sessionId: string) => boolean
}): boolean {
  const room = (input.roomSessionId || '').trim()
  if (!room) return false
  return input.sessions.some(session =>
    isRoomThreadSession(session, room) && input.isRunning(session!.id) === true)
}

/**
 * 这间房的执行会话 → 列表层的行,**按 `updatedAt` 倒序**(最近动过的在最上面)。
 *
 * 同刻的两条按 id 定序 —— 排序必须稳定,否则一次无关的重算就能让两行互换位置。
 */
export function buildRoomThreadRows(input: BuildRoomThreadRowsInput): RoomThreadRow[] {
  const room = (input.roomSessionId || '').trim()
  if (!room) return []

  const now = input.now ?? Date.now()
  const rows: RoomThreadRow[] = []

  for (const session of input.sessions) {
    if (!isRoomThreadSession(session, room)) continue
    const kind = session.kind as 'agent' | 'work'

    const agentId = (session.agentId || '').trim()
    const who = input.identity(agentId)
    const taskId = (session.collab?.taskId || '').trim()
    const running = input.isRunning?.(session.id) === true
    const updatedAt = session.updatedAt || 0

    rows.push({
      sessionId: session.id,
      agentId,
      kind,
      taskId,
      name: (who?.name || '').trim(),
      avatar: who?.avatar,
      avatarImage: who?.avatarImage,
      isRetired: who?.status === 'retired',
      detail: kind === 'work'
        ? workDetail(taskId, session.name || '', input.taskTitle)
        : ROOM_THREAD_AGENT_DETAIL,
      updatedAt,
      meta: resolveActiveWorkRowMeta(
        { tag: running ? ROOM_THREAD_RUNNING_TAG : ROOM_THREAD_IDLE_TAG, updatedAt },
        now,
      ),
      running,
    })
  }

  rows.sort((a, b) => (b.updatedAt - a.updatedAt) || a.sessionId.localeCompare(b.sessionId))
  return rows
}

// ── 私下:这间房的两位成员之间的私聊房(2026-08-01 用户要求)────────────────
//
// 用户原话:「线程里面我最好能够看到他们的私聊的 session」。D4 的透明制本来就
// 承诺"agent 私下说的话用户可旁观可插话",但在**这间房**的背台里一直看不到 ——
// 侧栏那个「私下」折叠组是全局的,不告诉你哪一对是这屋子里的人。
//
// 归属怎么算:私下房是**按人对**建的(`agentDmRoomId` 由两个 agentId 字典序派生),
// 它不隶属于任何一间房 —— 所以"这间房的私下"只能由**名册**回答:双方都在这间房的
// 花名册上。这是唯一诚实的关联,不是新造一份归属账。
//
// 形态判定(哪些房算私下房)不在这里做:调用方直接给 store 的
// `agentPairDmRoomSessions`,那是"人数即形态"的唯一一处答案。

/** 私下房读的字段;一个 `SessionDetails` 天然满足它。 */
export interface RoomPairDmSessionLike {
  id: string
  name?: string
  updatedAt?: number
  room?: { memberAgentIds?: readonly string[] } | null
}

export interface BuildRoomPairDmRowsInput {
  /** 这间房的花名册(`room.memberAgentIds`)。空 = 无从关联,返回空表。 */
  memberAgentIds?: readonly string[]
  /** store 的 `agentPairDmRoomSessions` —— 形态在那一处判完了。 */
  pairDmRooms?: readonly RoomPairDmSessionLike[]
  identity: (agentId: string) => RoomThreadIdentity
  /** 此刻有人在说话(chat store 的 `isSessionGenerating`,不是第二本账)。 */
  isRunning?: (sessionId: string) => boolean
  now?: number
}

/** 房名兜底:引擎现算的房名拿不到时,用两位的名字自己拼(与引擎同一个分隔符)。 */
const PAIR_NAME_SEPARATOR = ' ⇄ '

/**
 * 这间房成员之间的私下房 → 列表层的行。
 *
 * **双方都在名册上才算**:一位成员和屋外某人的私聊不是这间房的事,列进来就等于
 * 把别处的对话安到这间房头上。
 */
export function buildRoomPairDmRows(input: BuildRoomPairDmRowsInput): RoomThreadRow[] {
  const roster = new Set((input.memberAgentIds ?? []).map(id => (id || '').trim()).filter(Boolean))
  if (roster.size < 2) return []

  const now = input.now ?? Date.now()
  const rows: RoomThreadRow[] = []

  for (const session of input.pairDmRooms ?? []) {
    const members = (session.room?.memberAgentIds ?? [])
      .map(id => (id || '').trim())
      .filter(Boolean)
    if (members.length !== 2) continue
    if (!members.every(id => roster.has(id))) continue

    const faces: RoomThreadFace[] = members.map(agentId => {
      const who = input.identity(agentId)
      return {
        agentId,
        avatar: who?.avatar,
        avatarImage: who?.avatarImage,
        isRetired: who?.status === 'retired',
      }
    })
    const names = members.map(agentId => (input.identity(agentId)?.name || '').trim())
    const running = input.isRunning?.(session.id) === true
    const updatedAt = session.updatedAt || 0

    rows.push({
      sessionId: session.id,
      // 私下房没有"署名人"——它是两个人的房。单人字段留空,呈现层读 `faces`。
      agentId: '',
      kind: 'dm',
      taskId: '',
      name: (session.name || '').trim() || names.join(PAIR_NAME_SEPARATOR),
      isRetired: faces.every(face => face.isRetired),
      detail: ROOM_THREAD_DM_DETAIL,
      updatedAt,
      meta: resolveActiveWorkRowMeta(
        { tag: running ? ROOM_THREAD_RUNNING_TAG : ROOM_THREAD_IDLE_TAG, updatedAt },
        now,
      ),
      running,
      faces,
    })
  }

  rows.sort((a, b) => (b.updatedAt - a.updatedAt) || a.sessionId.localeCompare(b.sessionId))
  return rows
}

// ── 分组:正在跑 / 今天 / 更早 / 私下(房间背台,right-panel.html 一 · 线程)──
//
// 纯时间倒序在 15 条线程的房里没有重心 —— 正在跑的那一条会沉在「今天」中间。
// 分组把它抬到顶上,而且**不新增任何字段**:在跑读的还是 `row.running`
// (chat store 的 `isSessionGenerating`),今天/更早读的还是 `row.updatedAt`。

export type RoomThreadGroupKey = 'running' | 'today' | 'earlier' | 'dm'

export interface RoomThreadGroup {
  key: RoomThreadGroupKey
  /** 段头文案(不含计数 —— 与状态点同一条纪律:有没有,不是几个)。 */
  label: string
  rows: RoomThreadRow[]
}

const THREAD_GROUP_LABEL: Record<RoomThreadGroupKey, string> = {
  running: '正在跑',
  today: '今天',
  earlier: '更早',
  dm: '私下',
}

const THREAD_GROUP_ORDER: readonly RoomThreadGroupKey[] = ['running', 'today', 'earlier', 'dm']

function isSameDay(a: number, b: number): boolean {
  const left = new Date(a)
  const right = new Date(b)
  return left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate()
}

/**
 * 列表层的四段。
 *
 * - **正在跑**:`running` 恒置顶(在跑的活是这一面的重心,时间戳说了不算);
 * - **今天**:与 `now` 同一个日历日;
 * - **更早**:其余。没有 `updatedAt` 的行归「更早」—— 不知道什么时候动过的东西
 *   不该冒充今天。
 * - **私下**:两位成员之间的私聊房,**恒在最后自成一段**,不按时间混进上面三段。
 *   它不是"一次执行",而是一段还在继续的对话 —— 混进时间桶里,"这间房跑过哪几次
 *   活"这条主线就被冲散了。在跑(有人正说话)照旧亮绿点,只是不上浮。
 *
 * 组内顺序照抄入参(两个 builder 都已按 updatedAt 倒序排好),这里只分桶。
 * **空段整段不画**(样板里没有「今天 — 0」这种行)。
 */
export function groupRoomThreadRows(
  rows: readonly RoomThreadRow[],
  now: number = Date.now(),
): RoomThreadGroup[] {
  const buckets: Record<RoomThreadGroupKey, RoomThreadRow[]> = {
    running: [], today: [], earlier: [], dm: [],
  }
  for (const row of rows) {
    if (row.kind === 'dm') {
      buckets.dm.push(row)
      continue
    }
    if (row.running) {
      buckets.running.push(row)
      continue
    }
    buckets[row.updatedAt && isSameDay(row.updatedAt, now) ? 'today' : 'earlier'].push(row)
  }
  return THREAD_GROUP_ORDER
    .map(key => ({ key, label: THREAD_GROUP_LABEL[key], rows: buckets[key] }))
    .filter(group => group.rows.length > 0)
}
