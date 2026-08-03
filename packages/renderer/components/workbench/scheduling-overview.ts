/**
 * 「调度总览」的**纯逻辑** —— docs/design/collab-v3-observability.md §4.5。
 *
 * 蓝图四个必答问题里的第三个:**「整个系统在忙什么?」**
 *
 * 前两个问题各有各的面(房间背台的「调度」格、Agent 空间的「大脑」面),而它们都
 * 只回答一个对象。第三个问题问的是**全局**:三间房同时在跑、五个人的大脑各在别处、
 * 全局工作槽满了 —— 这些事实分散在 N 份房间快照 × M 份 agent 快照里,谁都看不见
 * 全貌。这一面就是那一屏。
 *
 * 纪律:
 *  - **一份账都不新增**。全部读 collabBoard 的两本快照账(coordinators + agents),
 *    这个文件只做**聚合**;
 *  - 聚合就是聚合:它不去猜任何一份快照里没有的东西。全局工作槽的**上限**取自
 *    产品层的 `COLLAB_WORKER_MAX_GLOBAL`(而不是在这儿写一个 4:那个数改了,
 *    界面必须跟着改);
 *  - **不碰 DOM**。
 */
import { COLLAB_WORKER_MAX_GLOBAL } from '@onething/runtime/collab/actors'
import type { CollabAgentActivitySnapshot, CollabCoordinatorState } from '@shared/ipc'

import { countCoordinatorGenerating } from './coordinator-status'
import { resolveRoomMemberPresence, type RoomMemberPresence } from '@/components/chat/room-member-strip'

/** 全局工作槽的上限 —— 属主在产品层,这里只是转发。 */
export const SCHEDULING_WORKER_SLOTS = COLLAB_WORKER_MAX_GLOBAL

// ── 顶部三数字 ────────────────────────────────────────────────────────────

export interface SchedulingTotals {
  /**
   * 在飞 LLM 调用的三色(蓝图 §4.5)。
   *
   * 三个数字而不是一个总数:它们花的是同一份钱,但**出事时要做的事完全不同** ——
   * 对话卡住是调度的问题,裁决卡住是裁判那条链的问题,工作卡住是某只手的问题。
   */
  conversations: number
  judgments: number
  workers: number
  /** 全局工作槽的占用 / 上限。 */
  workerSlots: { used: number; max: number }
  deadLetters: number
  /** 有房或有人在动。全静就整屏收成一句话,不摆一屏 0。 */
  active: boolean
}

/**
 * 三个数字各自的**出处**是刻意分开的:
 *  - 在飞对话 = Σ 各房 `turns[].executing`(登记簿说的"真在生成");
 *  - 在飞裁决 = Σ 各房 judgment `inflight`(一扇窗一次调用,所以数窗即数调用);
 *  - 在飞工作 = Σ 各人 running 工作卡。
 *
 * 死信总数取**两本账的最大值**而不是相加:房间那本与 agent 那本记的是**同一批**
 * 坏信的两个视角(一封信炸在 room actor 上,也炸在收信那个 agent 的循环里),
 * 相加会得到一个谁都对不上的数字。
 */
export function buildSchedulingTotals(input: {
  rooms: readonly CollabCoordinatorState[]
  agents: readonly CollabAgentActivitySnapshot[]
}): SchedulingTotals {
  let conversations = 0
  let judgments = 0
  let roomDeadLetters = 0
  for (const room of input.rooms) {
    conversations += countCoordinatorGenerating(room)
    if (room.judgment.state === 'inflight') judgments += 1
    roomDeadLetters += room.deadLetterCount ?? 0
  }

  let workers = 0
  let agentDeadLetters = 0
  for (const agent of input.agents) {
    workers += agent.workers.filter(worker => worker.status === 'running').length
    agentDeadLetters += agent.deadLetterCount ?? 0
  }

  const deadLetters = Math.max(roomDeadLetters, agentDeadLetters)
  return {
    conversations,
    judgments,
    workers,
    workerSlots: { used: workers, max: SCHEDULING_WORKER_SLOTS },
    deadLetters,
    active: conversations + judgments + workers + deadLetters > 0,
  }
}

// ── 房卡片 ────────────────────────────────────────────────────────────────

export interface SchedulingGateReading {
  key: 'chain' | 'concurrency' | 'budget'
  label: string
  /** 0–100;上限关着(max=0)时恒 0 —— 走满的线会让"不限"看起来像"撞死了"。 */
  percent: number
  warn: boolean
}

export interface SchedulingRoomCard {
  key: string
  roomSessionId: string
  name: string
  /** 持牌 / 生成中 / 举手 三个数。 */
  holding: number
  generating: number
  hands: number
  /** 裁决窗此刻的三个字('' = 窗关着)。 */
  judgmentText: string
  /** 降级要扎眼:呈现层据它上黄。 */
  degraded: boolean
  frozen: boolean
  deadLetters: number
  gates: SchedulingGateReading[]
}

/** 与状态条同一个阈值:80% 是"还能跑但该知道了"。 */
const GATE_WARN_RATIO = 0.8

function gateReading(
  key: SchedulingGateReading['key'],
  label: string,
  gate: { value: number; max: number },
): SchedulingGateReading {
  const unlimited = !(gate.max > 0)
  const ratio = unlimited ? 0 : gate.value / gate.max
  return {
    key,
    label,
    percent: Math.max(0, Math.min(100, Math.round(ratio * 100))),
    warn: !unlimited && ratio >= GATE_WARN_RATIO,
  }
}

const JUDGMENT_TEXT: Readonly<Record<string, string>> = {
  idle: '',
  debouncing: '准备裁决',
  inflight: '裁决中',
  degraded: '裁决降级',
}

/**
 * 活跃房的卡片流。
 *
 * **只画在动的房**(有牌 / 有手 / 有裁决 / 冻着 / 有死信):一个长长的、全是 0 的
 * 房间清单读起来和没有这一面是一样的。冻结与死信算"在动"是刻意的 —— 那两种恰恰
 * 是不动手就永远不会自己好的状态。
 */
export function buildSchedulingRoomCards(input: {
  rooms: readonly CollabCoordinatorState[]
  resolveRoomName: (roomSessionId: string) => string
}): SchedulingRoomCard[] {
  const cards: SchedulingRoomCard[] = []
  for (const room of input.rooms) {
    const holding = room.turns.length
    const hands = room.queue.length
    const judgmentText = JUDGMENT_TEXT[room.judgment.state] ?? ''
    const deadLetters = room.deadLetterCount ?? 0
    if (holding + hands + deadLetters === 0 && !judgmentText && !room.frozen) continue
    cards.push({
      key: room.roomSessionId,
      roomSessionId: room.roomSessionId,
      name: input.resolveRoomName(room.roomSessionId) || room.roomSessionId,
      holding,
      generating: countCoordinatorGenerating(room),
      hands,
      judgmentText,
      degraded: room.judgment.state === 'degraded',
      frozen: room.frozen,
      deadLetters,
      gates: [
        gateReading('chain', '链', room.gates.chain),
        gateReading('concurrency', '并发', room.gates.concurrency),
        gateReading('budget', '预算', room.gates.budget),
      ],
    })
  }
  return cards
}

// ── agent 矩阵 ────────────────────────────────────────────────────────────

export interface SchedulingAgentRow {
  key: string
  agentId: string
  name: string
  presence: RoomMemberPresence
  /** 大脑此刻在哪('' = 空闲)。 */
  mindRoom: string
  /** 一句话:空闲 / 在「房名」想 / 持 N 张牌。 */
  mindText: string
  leases: number
  inbox: number
  workers: number
  deadLetters: number
}

/**
 * agent 矩阵,**一人一行**。
 *
 * 排序是刻意的:出事的(死信)在最前,然后是在动的,最后才是闲着的 —— 一屏之内
 * 眼睛该先落在需要出手的那几行上。同档之内按名字稳定排,免得每次刷新行都在跳。
 */
export function buildSchedulingAgentRows(input: {
  agents: readonly CollabAgentActivitySnapshot[]
  resolveName: (agentId: string) => string
  resolveRoomName: (roomSessionId: string) => string
}): SchedulingAgentRow[] {
  const rows = input.agents.map(agent => {
    const presence = resolveRoomMemberPresence(agent)
    const mindRoom = agent.mind.state === 'thinking'
      ? (input.resolveRoomName(agent.mind.roomSessionId) || agent.mind.roomSessionId)
      : ''
    return {
      key: agent.agentId,
      agentId: agent.agentId,
      name: input.resolveName(agent.agentId),
      presence,
      mindRoom,
      mindText: mindRoom
        ? `在「${mindRoom}」想`
        : agent.heldLeases.length > 0 ? `持 ${agent.heldLeases.length} 张牌` : '空闲',
      leases: agent.heldLeases.length,
      inbox: agent.inbox.depth,
      workers: agent.workers.filter(worker => worker.status === 'running').length,
      deadLetters: agent.deadLetterCount ?? 0,
    }
  })

  const rank = (row: SchedulingAgentRow): number => {
    if (row.deadLetters > 0) return 0
    if (row.presence !== 'idle') return 1
    return 2
  }
  return rows.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name))
}
