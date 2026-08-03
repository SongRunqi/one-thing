/**
 * Agent 空间「大脑」面的**纯逻辑** —— docs/design/collab-v3-observability.md §4.3。
 *
 * 蓝图四个必答问题里的第二个:**「这个人现在在干嘛?」**
 *
 * 那个问题在房间那本账里根本问不出来 —— 它只看得见自己这一间房里的那一格。而 v3
 * 把世界改成了 agent 中心:一个大脑、跨房的租约、一条持久信箱、一把工作卡。「TA 在
 * 哪间房想」「信箱压了多少封」「手上几张卡」全是跨房的事实,硬要从 N 份房间快照里
 * 拼,拼出来的是 N 份各自过期的碎片。
 *
 * 纪律:
 *  - **一份账都不新增**。全部九格来自 collabBoard 的 agents 账(那本账自己也只是
 *    后端快照的镜像),房名经 sessions store 翻译;
 *  - **不碰 DOM**,所以每一句措辞与每一条判据都判定得了;
 *  - **保密**:信箱只给深度与最旧时刻 —— 快照本身就不携带正文(契约层钉死),
 *    这一面因此也没有可泄漏的东西,而那句「事件不含正文」是**说给用户听的**:
 *    否则一个「积压 12」会让人以为点进去能读到那 12 条内容。
 */
import type {
  CollabAgentActivitySnapshot,
  CollabAgentHeldLease,
  CollabAgentWorkerCard,
} from '@shared/ipc'

/** 信箱那一行的固定副文案(保密纪律的**用户可见**那一半)。 */
export const AGENT_MIND_INBOX_NOTE = '只记事件类型与到达时刻,不含正文'

export type AgentMindState = 'idle' | 'thinking' | 'holding'

export interface AgentMindHeadline {
  state: AgentMindState
  /** 大字。 */
  text: string
  /**
   * 计时基准(ms);**0 = 不计时**。
   *
   * 空闲没有"空闲了多久"这回事 —— 一个从开机起就没说过话的人,那个数字只会
   * 让人误以为出了什么事。
   */
  since: number
}

export interface AgentMindLeaseRow {
  key: string
  roomSessionId: string
  roomName: string
  since: number
  executing: boolean
  /** 「生成中」/「等大脑」—— 与状态条、调度页同一套词汇表。 */
  stateText: string
}

export interface AgentMindWorkerRow {
  key: string
  cardId: string
  /** `#xxxxxxxx` —— 与看板行上那截同一个短号。 */
  shortId: string
  roomSessionId: string
  roomName: string
  status: CollabAgentWorkerCard['status']
  statusText: string
  since: number
}

export interface AgentMindView {
  headline: AgentMindHeadline
  leases: AgentMindLeaseRow[]
  workers: AgentMindWorkerRow[]
  inbox: { depth: number; oldestAt: number; note: string }
  deadLetterCount: number
  lastSpokeAt: number
  /**
   * 快照本身缺席('' = 有快照)。
   *
   * 「读不到」与「空闲」在**别的界面上**刻意是同一个样子(徽标不画),但这一面
   * 是专门来看这个人的:在这儿把两者混起来,就等于对着一个可能正在忙的人写
   * 「空闲」。所以这一面单独说一句。
   */
  missing: string
}

const WORKER_STATUS_TEXT: Readonly<Record<CollabAgentWorkerCard['status'], string>> = {
  running: '在做',
  done: '已交',
  interrupted: '被打断',
}

const TASK_SHORT_ID_LENGTH = 8

/** 最早的一张牌是"等了多久"的基准 —— 后来那几张只是叠加,不改变起点。 */
function earliestLeaseSince(leases: readonly CollabAgentHeldLease[]): number {
  let earliest = 0
  for (const lease of leases) {
    if (!lease.since) continue
    if (earliest === 0 || lease.since < earliest) earliest = lease.since
  }
  return earliest
}

/**
 * 大脑此刻的一句话 + 计时基准。
 *
 * 三态的次序是**判据的次序**而不是重要性的排序:大脑在想 → 就是在想(哪怕它同时
 * 持着三张别的房的牌);没在想但手上有牌 → 那是「持牌等待」,v3 特有的第三种状态;
 * 两样都没有 → 空闲。
 *
 * 「持 N 张牌等待」这一句是这一面最值钱的一句话:它说的是「系统认为轮到 TA 了,
 * 而 TA 还没开始」—— 在 D8 之前,这个状态在每一个界面上都被画成「正在说」。
 */
export function buildAgentMindHeadline(
  activity: CollabAgentActivitySnapshot | null | undefined,
  resolveRoomName: (roomSessionId: string) => string,
): AgentMindHeadline {
  if (!activity) return { state: 'idle', text: '空闲', since: 0 }
  if (activity.mind.state === 'thinking') {
    const room = resolveRoomName(activity.mind.roomSessionId) || activity.mind.roomSessionId
    return { state: 'thinking', text: `在「${room}」思考`, since: activity.mind.since }
  }
  if (activity.heldLeases.length > 0) {
    return {
      state: 'holding',
      text: `持 ${activity.heldLeases.length} 张牌等待`,
      since: earliestLeaseSince(activity.heldLeases),
    }
  }
  return { state: 'idle', text: '空闲', since: 0 }
}

/**
 * 一位同事的整面。
 *
 * `resolveRoomName` 由宿主从 sessions store 注入 —— 翻不出名字就退回 id
 * (一个查得动的 id 好过一片空白,与调度页同一条)。
 */
export function buildAgentMindView(options: {
  activity: CollabAgentActivitySnapshot | null | undefined
  resolveRoomName: (roomSessionId: string) => string
}): AgentMindView {
  const activity = options.activity
  const roomName = (roomSessionId: string): string =>
    options.resolveRoomName(roomSessionId) || roomSessionId
  const headline = buildAgentMindHeadline(activity, options.resolveRoomName)

  if (!activity) {
    return {
      headline,
      leases: [],
      workers: [],
      inbox: { depth: 0, oldestAt: 0, note: AGENT_MIND_INBOX_NOTE },
      deadLetterCount: 0,
      lastSpokeAt: 0,
      missing: '还没收到 TA 的活动快照 —— 这台机器上的协作运行时可能没在跑。',
    }
  }

  return {
    headline,
    leases: activity.heldLeases.map(lease => ({
      key: lease.leaseId,
      roomSessionId: lease.roomSessionId,
      roomName: roomName(lease.roomSessionId),
      since: lease.since,
      executing: lease.executing,
      stateText: lease.executing ? '生成中' : '等大脑',
    })),
    workers: activity.workers.map(worker => ({
      key: `${worker.cardId}:${worker.since}`,
      cardId: worker.cardId,
      shortId: `#${worker.cardId.slice(0, TASK_SHORT_ID_LENGTH)}`,
      roomSessionId: worker.roomSessionId,
      roomName: roomName(worker.roomSessionId),
      status: worker.status,
      statusText: WORKER_STATUS_TEXT[worker.status] ?? worker.status,
      since: worker.since,
    })),
    inbox: {
      depth: activity.inbox.depth,
      oldestAt: activity.inbox.oldestAt ?? 0,
      note: AGENT_MIND_INBOX_NOTE,
    },
    deadLetterCount: activity.deadLetterCount,
    lastSpokeAt: activity.lastSpokeAt ?? 0,
    missing: '',
  }
}
