/**
 * 「调度总览」的纯逻辑(D8 观测体系 §4.5)。
 *
 * 这一面全是**聚合**,而聚合写错了是最难看出来的一类错:一个偏大的死信总数和一个
 * 对的死信总数在屏幕上都是一个数字,只有测试分得开 —— 而这一面存在的意义正是
 * 让人相信那几个数字。
 */
import { describe, expect, it } from 'vitest'
import type { CollabAgentActivitySnapshot, CollabCoordinatorState } from '@shared/ipc'
import {
  buildSchedulingAgentRows,
  buildSchedulingRoomCards,
  buildSchedulingTotals,
  SCHEDULING_WORKER_SLOTS,
} from '../scheduling-overview'

function room(patch: Partial<CollabCoordinatorState> = {}): CollabCoordinatorState {
  return {
    roomSessionId: 'room-1',
    mode: 'parallel',
    frozen: false,
    seq: 1,
    at: 1_000,
    speaking: [],
    typing: [],
    turns: [],
    queue: [],
    judging: 0,
    judgingAgentIds: [],
    gates: {
      chain: { value: 0, max: 32 },
      concurrency: { value: 0, max: 6 },
      budget: { value: 0, max: 5 },
    },
    plan: null,
    log: [],
    judgment: { state: 'idle' },
    deadLetterCount: 0,
    ...patch,
  }
}

const turn = (agentId: string, executing: boolean) => ({
  agentId,
  reason: 'mention',
  startedAt: 1_000,
  agentSessionId: `room-1#L-${agentId}`,
  executing,
})

function agent(
  agentId: string,
  patch: Partial<CollabAgentActivitySnapshot> = {},
): CollabAgentActivitySnapshot {
  return {
    agentId,
    seq: 1,
    at: 10_000,
    mind: { state: 'idle' },
    heldLeases: [],
    inbox: { depth: 0 },
    workers: [],
    deadLetterCount: 0,
    ...patch,
  }
}

const worker = (status: 'running' | 'done' | 'interrupted') => ({
  cardId: `card-${status}`,
  roomSessionId: 'room-1',
  status,
  since: 1,
})

const NAMES: Record<string, string> = { a: '阿般', b: '小李', z: 'Zed' }
const name = (id: string): string => NAMES[id] ?? id
const roomName = (id: string): string => (id === 'room-1' ? '排期房' : '')

describe('顶部三数字', () => {
  /**
   * 三个数字各自的出处刻意分开:它们花的是同一份钱,但出事时要做的事完全不同 ——
   * 对话卡住是调度的问题,裁决卡住是裁判那条链的问题,工作卡住是某只手的问题。
   */
  it('对话数登记簿、裁决数窗、工作数 running 卡', () => {
    const totals = buildSchedulingTotals({
      rooms: [
        room({ roomSessionId: 'r1', turns: [turn('a', true), turn('b', false)] }),
        room({
          roomSessionId: 'r2',
          turns: [turn('z', true)],
          judgment: { state: 'inflight', candidates: ['a'], since: 1 },
        }),
      ],
      agents: [
        agent('a', { workers: [worker('running'), worker('done')] }),
        agent('b', { workers: [worker('running')] }),
      ],
    })
    expect(totals).toMatchObject({ conversations: 2, judgments: 1, workers: 2 })
  })

  it('防抖与降级都不算「在飞」—— 那两态一分钱都没花在飞', () => {
    const totals = buildSchedulingTotals({
      rooms: [
        room({ roomSessionId: 'r1', judgment: { state: 'debouncing', opensAt: 5 } }),
        room({ roomSessionId: 'r2', judgment: { state: 'degraded', reason: 'timeout', at: 5 } }),
      ],
      agents: [],
    })
    expect(totals.judgments).toBe(0)
  })

  it('全局工作槽的上限取产品层那个常量,不在界面里另写一个数', () => {
    const totals = buildSchedulingTotals({
      rooms: [],
      agents: [agent('a', { workers: [worker('running')] })],
    })
    expect(totals.workerSlots).toEqual({ used: 1, max: SCHEDULING_WORKER_SLOTS })
    expect(SCHEDULING_WORKER_SLOTS).toBeGreaterThan(0)
  })

  /**
   * 死信取两本账的**最大值**而不是相加:一封信炸在 room actor 上,也炸在收信那个
   * agent 的循环里 —— 两本账记的是同一批坏信的两个视角,相加会得到一个谁都对不上
   * 的数字。
   */
  it('死信取两本账的最大值,不相加', () => {
    expect(buildSchedulingTotals({
      rooms: [room({ deadLetterCount: 3 })],
      agents: [agent('a', { deadLetterCount: 2 })],
    }).deadLetters).toBe(3)
    expect(buildSchedulingTotals({
      rooms: [room({ deadLetterCount: 1 })],
      agents: [agent('a', { deadLetterCount: 5 })],
    }).deadLetters).toBe(5)
  })

  it('全静时 active 为假 —— 整屏收成一句话,不摆一屏 0', () => {
    expect(buildSchedulingTotals({ rooms: [room()], agents: [agent('a')] }).active).toBe(false)
    expect(buildSchedulingTotals({ rooms: [], agents: [] }).active).toBe(false)
    expect(buildSchedulingTotals({
      rooms: [room({ deadLetterCount: 1 })],
      agents: [],
    }).active).toBe(true)
  })
})

describe('活跃房卡片', () => {
  it('只画在动的房 —— 一屏全是 0 的清单等于没有这一面', () => {
    const cards = buildSchedulingRoomCards({
      rooms: [
        room({ roomSessionId: 'quiet' }),
        room({ roomSessionId: 'room-1', turns: [turn('a', true)] }),
      ],
      resolveRoomName: roomName,
    })
    expect(cards.map(card => card.roomSessionId)).toEqual(['room-1'])
    expect(cards[0]).toMatchObject({ name: '排期房', holding: 1, generating: 1, hands: 0 })
  })

  // 冻结与死信恰恰是不动手就永远不会自己好的两种状态。
  it('冻着的房、有死信的房也算「在动」', () => {
    const cards = buildSchedulingRoomCards({
      rooms: [
        room({ roomSessionId: 'frozen', frozen: true }),
        room({ roomSessionId: 'faulted', deadLetterCount: 2 }),
      ],
      resolveRoomName: roomName,
    })
    expect(cards.map(card => card.roomSessionId)).toEqual(['frozen', 'faulted'])
  })

  it('裁决三态各有各的说法,降级另外挂一个标记', () => {
    const [debouncing, inflight, degraded] = buildSchedulingRoomCards({
      rooms: [
        room({ roomSessionId: 'r1', judgment: { state: 'debouncing', opensAt: 1 } }),
        room({ roomSessionId: 'r2', judgment: { state: 'inflight', candidates: [], since: 1 } }),
        room({ roomSessionId: 'r3', judgment: { state: 'degraded', reason: 'timeout', at: 1 } }),
      ],
      resolveRoomName: roomName,
    })
    expect(debouncing.judgmentText).toBe('准备裁决')
    expect(inflight.judgmentText).toBe('裁决中')
    expect(degraded).toMatchObject({ judgmentText: '裁决降级', degraded: true })
    expect(debouncing.degraded).toBe(false)
  })

  it('三闸迷你条:不限的闸恒 0%,80% 起告警', () => {
    const [card] = buildSchedulingRoomCards({
      rooms: [room({
        roomSessionId: 'room-1',
        turns: [turn('a', true)],
        gates: {
          chain: { value: 30, max: 0 },
          concurrency: { value: 5, max: 6 },
          budget: { value: 1, max: 5 },
        },
      })],
      resolveRoomName: roomName,
    })
    expect(card.gates.map(gate => gate.percent)).toEqual([0, 83, 20])
    expect(card.gates.map(gate => gate.warn)).toEqual([false, true, false])
  })

  it('房名翻不出来时退回 id', () => {
    const [card] = buildSchedulingRoomCards({
      rooms: [room({ roomSessionId: 'room-77', turns: [turn('a', true)] })],
      resolveRoomName: roomName,
    })
    expect(card.name).toBe('room-77')
  })
})

describe('agent 矩阵', () => {
  it('一人一行,四个数字各就各位', () => {
    const [row] = buildSchedulingAgentRows({
      agents: [agent('a', {
        heldLeases: [
          { roomSessionId: 'room-1', leaseId: 'L1', since: 1, executing: false },
          { roomSessionId: 'room-2', leaseId: 'L2', since: 2, executing: false },
        ],
        inbox: { depth: 7 },
        workers: [worker('running'), worker('done')],
        deadLetterCount: 1,
      })],
      resolveName: name,
      resolveRoomName: roomName,
    })
    expect(row).toMatchObject({
      name: '阿般',
      presence: 'holding',
      leases: 2,
      inbox: 7,
      workers: 1,
      deadLetters: 1,
      mindText: '持 2 张牌',
    })
  })

  it('大脑在想时报房名', () => {
    const [row] = buildSchedulingAgentRows({
      agents: [agent('a', { mind: { state: 'thinking', roomSessionId: 'room-1', since: 1 } })],
      resolveName: name,
      resolveRoomName: roomName,
    })
    expect(row).toMatchObject({ mindRoom: '排期房', mindText: '在「排期房」想', presence: 'generating' })
  })

  // 一屏之内眼睛该先落在需要出手的那几行上。
  it('排序:出事的在最前,在动的居中,闲着的垫底;同档按名字稳定排', () => {
    const rows = buildSchedulingAgentRows({
      agents: [
        agent('z'),
        agent('b', { mind: { state: 'thinking', roomSessionId: 'room-1', since: 1 } }),
        agent('a', { deadLetterCount: 2 }),
      ],
      resolveName: name,
      resolveRoomName: roomName,
    })
    expect(rows.map(row => row.agentId)).toEqual(['a', 'b', 'z'])
  })

  it('空表就是空表 —— 不编一行占位', () => {
    expect(buildSchedulingAgentRows({
      agents: [],
      resolveName: name,
      resolveRoomName: roomName,
    })).toEqual([])
  })
})
