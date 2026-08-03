/**
 * 房间背台「调度」页的**纯逻辑** —— docs/design/collab-v3-observability.md §4.2。
 *
 * 线程 / 成员 / 看板回答的是「这间房产出了什么」。这一格回答的是**发动机**在干嘛:
 * 谁持牌、谁举手卡在哪道闸、裁决窗此刻什么状态、刚才那一串到底怎么走的。状态条那
 * 一小条已经答了前半句(它挂在线程格顶上,宽度只够一行),这一格是它的展开面 ——
 * 一张租约表、一列举手队列、一张裁决卡片、一条时间轴。
 *
 * 纪律(与 `room-backstage.ts` / `room-members.ts` / `coordinator-status.ts` 同一条):
 *  - **一份账都不新增**。租约与举手读协调器快照,大脑在哪读 collabBoard 的 agents
 *    账,「刚才」读盘上的调度时间轴;这个文件连状态都不存;
 *  - **不碰 DOM**。措辞、次序、着色分档、因果引用怎么读成人话,全在这里,所以
 *    全部判定得了。
 *
 * ## 时间轴为什么要参与「现在」那一半
 *
 * 举手时长这一格在房间快照里**没有** —— `CollabCoordinatorQueued` 只有人、原因、
 * 卡在哪道闸,没有"从什么时候开始举着"。它在时间轴的 `hand` 行上(那一行带 `at`),
 * 所以这里把两边按 agentId 对上。这不是把时间轴当账用:账仍然只回答"此刻是什么",
 * 时间轴回答"这件事是什么时候开始的",而后者本来就只有历史答得出。
 */
import type {
  CollabCoordinatorBlockedBy,
  CollabCoordinatorState,
  CollabSchedulerLogEntry,
} from '@shared/ipc'

/**
 * 「去看这间房的调度页」的契约 —— 与 `OPEN_MEMBERS_EVENT` 同一条 window 事件
 * 解耦线路。派事件的是线程格顶上那条状态条,收事件的是它隔壁的分段器,两者之间
 * 隔着好几层组件,而这条指令的全部内容就是"换一格、顺便把时间轴过滤成这一类"。
 */
export const OPEN_ROOM_SCHEDULE_EVENT = 'onething:open-room-schedule'

export interface OpenRoomScheduleDetail {
  roomSessionId: string
  /** 时间轴要过滤到哪一类('' / 缺席 = 不过滤)。 */
  filter?: string
}

/** 时间轴一次尾读要几条。再多就成了日志,而这一格是诊断不是日志查看器。 */
export const ROOM_SCHEDULE_LOG_ROWS = 40

// ── 租约表 ────────────────────────────────────────────────────────────────

export interface RoomScheduleLeaseRow {
  key: string
  agentId: string
  name: string
  /** 授牌原因的三个字(与状态条同源同文案)。 */
  reason: string
  /** 牌号。**不是** epoch —— 代数没有上 wire(见文件末的「留待」)。 */
  leaseId: string
  since: number
  executing: boolean
  /** 没在生成时,那颗大脑在哪:'' = 空闲或读不到。 */
  thinkingIn: string
  /** 一句话状态:生成中 / 在别处思考 / 等大脑。 */
  stateText: string
}

/**
 * 租约表。**行序照快照给的顺序**(发牌次序),不按时长重排 ——
 * 「谁先拿到牌」本身就是调度的答案之一,重排会把它抹掉。
 */
export function buildRoomScheduleLeases(options: {
  state: CollabCoordinatorState | null
  resolveName: (agentId: string) => string
  /** 这个人的大脑在哪间房('' = 空闲/读不到)。 */
  resolveMindRoom?: (agentId: string) => string
  /** 房间会话 id → 房名。拿不到就退回 id。 */
  resolveRoomName?: (roomSessionId: string) => string
  reasonLabel: (reason: string) => string
}): RoomScheduleLeaseRow[] {
  const state = options.state
  if (!state) return []
  return state.turns.map(turn => {
    const mindRoom = turn.executing ? '' : (options.resolveMindRoom?.(turn.agentId) || '')
    const elsewhere = Boolean(mindRoom) && mindRoom !== state.roomSessionId
    const thinkingIn = elsewhere
      ? (options.resolveRoomName?.(mindRoom) || mindRoom)
      : ''
    return {
      key: turn.agentSessionId || `${turn.agentId}:${turn.startedAt}`,
      agentId: turn.agentId,
      name: options.resolveName(turn.agentId),
      reason: options.reasonLabel(turn.reason),
      leaseId: turn.agentSessionId,
      since: turn.startedAt,
      executing: turn.executing,
      thinkingIn,
      stateText: turn.executing
        ? '生成中'
        : elsewhere ? `在「${thinkingIn}」思考` : '等大脑',
    }
  })
}

// ── 举手队列 ──────────────────────────────────────────────────────────────

export interface RoomScheduleHandRow {
  key: string
  agentId: string
  name: string
  reason: string
  blockedBy: CollabCoordinatorBlockedBy
  /** 闸的三个字。 */
  gateLabel: string
  /** 这道闸要谁做什么。 */
  gateHint: string
  /** 要人动手的四道闸(链/相位/冻结/预算)—— 呈现层据它决定要不要扎眼。 */
  actionable: boolean
  /**
   * 从什么时候举着的(ms);**0 = 时间轴上找不到那一行**。
   *
   * 找不到是常态而不是错误:账本只留 14 天,而且尾读只取最近 N 条 —— 一只举了
   * 很久的手完全可能已经翻出了那一页。给 0 让呈现层留白,比编一个"刚刚"好。
   */
  raisedAt: number
}

const GATE_LABEL: Readonly<Record<CollabCoordinatorBlockedBy, string>> = {
  judging: '裁决中',
  seats: '等座位',
  chain: '链闸',
  phase: '相位挂起',
  frozen: '冻结',
  budget: '预算',
}

const GATE_HINT: Readonly<Record<CollabCoordinatorBlockedBy, string>> = {
  judging: '正在判谁先说,几秒后自解',
  seats: '同时发言已满,等人让位',
  chain: '连聊到上限,你说句话就放开',
  phase: '不在活跃相,要换相才轮得到',
  frozen: '房间已暂停,恢复后才排得上',
  budget: '今日预算用尽,明天恢复或改配额',
}

const GATE_ACTIONABLE: ReadonlySet<CollabCoordinatorBlockedBy> =
  new Set<CollabCoordinatorBlockedBy>(['chain', 'phase', 'frozen', 'budget'])

export function roomScheduleGateLabel(gate: CollabCoordinatorBlockedBy): string {
  return GATE_LABEL[gate] ?? String(gate)
}

/**
 * 举手队列。举手时刻从时间轴的 `hand` 行现取 —— 每人取**最近**那一行
 * (同一个人可能举过好几次,而屏幕上那只手是最后一只)。
 */
export function buildRoomScheduleHands(options: {
  state: CollabCoordinatorState | null
  resolveName: (agentId: string) => string
  reasonLabel: (reason: string) => string
  /** 时间轴尾段,**新在前**(与读口同序)。 */
  log?: readonly CollabSchedulerLogEntry[]
}): RoomScheduleHandRow[] {
  const state = options.state
  if (!state) return []
  const raisedAt = new Map<string, number>()
  for (const row of options.log ?? []) {
    if (row.type !== 'hand') continue
    const agentId = typeof row.agentId === 'string' ? row.agentId : ''
    // 新在前 —— 第一次见到的那一条就是最近的一条,后面的不覆盖。
    if (agentId && !raisedAt.has(agentId)) raisedAt.set(agentId, row.at)
  }
  return state.queue.map(queued => ({
    key: queued.id,
    agentId: queued.agentId,
    name: options.resolveName(queued.agentId),
    reason: options.reasonLabel(queued.reason),
    blockedBy: queued.blockedBy,
    gateLabel: roomScheduleGateLabel(queued.blockedBy),
    gateHint: GATE_HINT[queued.blockedBy] ?? '',
    actionable: GATE_ACTIONABLE.has(queued.blockedBy),
    raisedAt: raisedAt.get(queued.agentId) ?? 0,
  }))
}

// ── 裁决卡片:最近一次的完整回放 ──────────────────────────────────────────

export interface RoomScheduleVerdict {
  at: number
  token: string
  /** 授牌次序。**空数组是一个有效答案**(「这轮谁都不该说」)。 */
  order: string[]
  /** 裁判给的一句话理由 —— 这一格是整张卡片存在的理由。 */
  why: string
  elapsedMs: number
  /** 买这次调用用的模型;解析不出 provider 时是 ''。 */
  model: string
  /** 开窗那一刻的候选(从配对的 judge-open 行来);对不上就是空。 */
  candidates: string[]
  /** 这一次是降级吗(同 token 的 judge-degraded 行存在)。 */
  degraded: boolean
  /** 降级成因('' = 不是降级)。 */
  degradedReason: string
}

/**
 * 时间轴尾段里**最近一次**裁决的完整回放。
 *
 * 三条 `judge-*` 行按 token 配对(open 给候选、verdict 给排序与理由、degraded 给
 * 成因),而不是按时间挨着猜:并行的房间里挨着的两行完全可能属于两扇窗。
 *
 * 降级那一路没有 verdict 行(裁判压根没答出来),所以这里也认单独的 degraded 行 ——
 * 「刚才为什么没人理我」在降级那一次上最需要答案,而那正是最容易被漏掉的一路。
 */
export function buildRoomScheduleVerdict(
  log: readonly CollabSchedulerLogEntry[] | undefined,
): RoomScheduleVerdict | null {
  if (!log?.length) return null
  const strings = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
  const text = (value: unknown): string => (typeof value === 'string' ? value : '')
  const num = (value: unknown): number => (typeof value === 'number' ? value : 0)

  // 新在前,所以第一条 verdict / degraded 就是最近的那一次。
  const head = log.find(row => row.type === 'judge-verdict' || row.type === 'judge-degraded')
  if (!head) return null
  const token = text(head.token)
  const open = token ? log.find(row => row.type === 'judge-open' && text(row.token) === token) : undefined
  const verdict = head.type === 'judge-verdict'
    ? head
    : (token ? log.find(row => row.type === 'judge-verdict' && text(row.token) === token) : undefined)
  const degraded = head.type === 'judge-degraded'
    ? head
    : (token ? log.find(row => row.type === 'judge-degraded' && text(row.token) === token) : undefined)

  return {
    at: head.at,
    token,
    order: strings(verdict?.order),
    why: text(verdict?.why),
    elapsedMs: num(verdict?.elapsedMs ?? degraded?.elapsedMs),
    model: text(verdict?.model),
    candidates: strings(open?.candidates),
    degraded: Boolean(degraded),
    degradedReason: text(degraded?.reason),
  }
}

// ── 时间轴视图 ────────────────────────────────────────────────────────────

/**
 * 一行的着色分档。**四档而不是十四色**:一屏四十行、十四种颜色读起来是一张噪声图,
 * 而人来这一面只想分开四件事 —— 出事了 / 花钱了 / 动了牌 / 只是流水。
 */
export type RoomScheduleLogTone = 'fault' | 'judge' | 'floor' | 'plain'

export interface RoomScheduleLogRow {
  key: string
  at: number
  type: string
  tone: RoomScheduleLogTone
  /** 一句人话。 */
  text: string
  /**
   * 因果引用读成人话:`← 阿娜的消息` / `← 牌 room#L3`。
   *
   * `triggeredBy` 在账里是一串裸 id,而一串裸 id 在屏幕上等于没有 —— 这本账的
   * 脊梁(每件事指得回上一件)只有在读得出来的时候才是脊梁。
   */
  triggeredBy: string
}

const TONE: Readonly<Record<string, RoomScheduleLogTone>> = {
  'dead-letter': 'fault',
  'judge-degraded': 'fault',
  'gate-block': 'fault',
  'judge-open': 'judge',
  'judge-verdict': 'judge',
  grant: 'floor',
  revoke: 'floor',
  yield: 'floor',
  hand: 'floor',
}

export function roomScheduleLogTone(type: string): RoomScheduleLogTone {
  return TONE[type] ?? 'plain'
}

/** 一行一句人话。名字经 `resolveName`,id 一律不裸奔。 */
function logLineText(
  row: CollabSchedulerLogEntry,
  resolveName: (agentId: string) => string,
): string {
  const who = typeof row.agentId === 'string' && row.agentId ? resolveName(row.agentId) : ''
  const text = (value: unknown): string => (typeof value === 'string' ? value : '')
  switch (row.type) {
    case 'posted': {
      const kind = text(row.authorKind)
      const author = kind === 'user' ? '你' : kind === 'system' ? '系统' : (who || '有人')
      return row.chainReset === true ? `${author}发言(链归零)` : `${author}发言`
    }
    case 'hand':
      return `${who} 举手(${text(row.reason) || '未注明'})`
    case 'judge-open':
      return `开裁决窗 · ${(Array.isArray(row.candidates) ? row.candidates : []).length} 位候选`
    case 'judge-verdict': {
      const order = (Array.isArray(row.order) ? row.order : [])
        .filter((id): id is string => typeof id === 'string')
        .map(resolveName)
        .join(' → ')
      const head = order ? `裁决:${order}` : '裁决:这轮无人发言'
      const why = text(row.why)
      return why ? `${head}(${why})` : head
    }
    case 'judge-degraded':
      return `裁决降级(${text(row.reason) || '未注明'})→ 回落 FIFO`
    case 'grant':
      return `发牌 → ${who}`
    case 'gate-block':
      return `${who} 撞闸 · ${roomScheduleGateLabel(text(row.gate) as CollabCoordinatorBlockedBy)}`
    case 'speak':
      return `${who} 说了一句`
    case 'yield':
      return `${who} 让位${text(row.reason) ? `(${text(row.reason)})` : ''}`
    case 'revoke':
      return `收牌 · ${who}(${text(row.cause) || '未注明'})`
    case 'phase':
      return `换相 → ${text(row.name) || '(无名)'}`
    case 'worker-spawn':
      return `${who} 派出一只手`
    case 'worker-result':
      return `${who} 交活(${text(row.outcome) || '未注明'})`
    case 'dead-letter':
      return `${text(row.actor) || '某个 actor'} 处理 ${text(row.eventType) || '事件'} 失败:${text(row.error)}`
    default:
      return String(row.type)
  }
}

/**
 * 因果引用读成人话。
 *
 * 三种 id 长得不一样,而这一格的价值全在"指得回哪一件事":牌号带 `#L`、裁决 token
 * 带 `#J`,其余当消息 id。认不出来就原样显示 —— 一串看得见的 id 仍然查得动,
 * 而一个被藏起来的 id 就真的断了链。
 */
export function formatRoomScheduleTrigger(triggeredBy: string | undefined): string {
  const id = (triggeredBy || '').trim()
  if (!id) return ''
  if (id.includes('#L')) return `← 牌 ${id.slice(id.indexOf('#') + 1)}`
  if (id.includes('#J')) return `← 裁决 ${id.slice(id.indexOf('#') + 1)}`
  if (id.startsWith('evt:')) return `← 事件 ${id.slice(4)}`
  return `← 消息 ${id.length > 12 ? `${id.slice(0, 12)}…` : id}`
}

export function buildRoomScheduleLogRows(options: {
  log: readonly CollabSchedulerLogEntry[] | undefined
  resolveName: (agentId: string) => string
  /** 只看这一类('' = 全要)。死信红点跳过来时带的就是它。 */
  filter?: string
  limit?: number
}): RoomScheduleLogRow[] {
  const rows = options.log ?? []
  const filter = (options.filter || '').trim()
  const limit = options.limit ?? ROOM_SCHEDULE_LOG_ROWS
  const out: RoomScheduleLogRow[] = []
  for (let index = 0; index < rows.length && out.length < limit; index += 1) {
    const row = rows[index]
    if (filter && row.type !== filter) continue
    out.push({
      key: `${row.at}:${index}:${row.type}`,
      at: row.at,
      type: row.type,
      tone: roomScheduleLogTone(row.type),
      text: logLineText(row, options.resolveName),
      triggeredBy: formatRoomScheduleTrigger(
        typeof row.triggeredBy === 'string' ? row.triggeredBy : undefined,
      ),
    })
  }
  return out
}

/**
 * 时间轴的类型过滤器有哪几格。
 *
 * 刻意**不是** 14 类全表:那是 CLI 的活(`--type` 要全)。界面上只给四个"我现在
 * 想看哪一类问题"的入口 —— 一个十四项的下拉菜单在诊断现场没人读得完。
 */
export const ROOM_SCHEDULE_LOG_FILTERS: ReadonlyArray<{ key: string; label: string }> = [
  { key: '', label: '全部' },
  { key: 'judge-verdict', label: '裁决' },
  { key: 'grant', label: '发牌' },
  { key: 'gate-block', label: '撞闸' },
  { key: 'dead-letter', label: '死信' },
]
