/**
 * 房间背台「调度」格的纯逻辑(D8 观测体系 §4.2)。
 *
 * 这一面回答四个必答问题里的第一个与第四个,而两者的判据都很容易悄悄写错:
 * 一张读错的租约表看起来和读对的一模一样,一条对不上因果的时间轴同样。
 */
import { describe, expect, it } from 'vitest'
import type { CollabCoordinatorState, CollabSchedulerLogEntry } from '@shared/ipc'
import { coordinatorReasonLabel } from '../coordinator-status'
import {
  buildRoomScheduleHands,
  buildRoomScheduleLeases,
  buildRoomScheduleLogRows,
  buildRoomScheduleVerdict,
  formatRoomScheduleTrigger,
  roomScheduleGateLabel,
  roomScheduleLogTone,
  ROOM_SCHEDULE_LOG_FILTERS,
} from '../room-schedule'

const NAMES: Record<string, string> = { a: '阿般', b: '小李', c: 'Iris' }
const name = (id: string): string => NAMES[id] ?? id
const roomName = (id: string): string => (id === 'room-9' ? '排期房' : id)

function state(patch: Partial<CollabCoordinatorState> = {}): CollabCoordinatorState {
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

const turn = (agentId: string, executing = false, leaseId = `room-1#L1`) => ({
  agentId,
  reason: 'mention',
  startedAt: 1_000,
  agentSessionId: leaseId,
  executing,
})

const leases = (input: {
  state: CollabCoordinatorState
  mindRoom?: Record<string, string>
}) => buildRoomScheduleLeases({
  state: input.state,
  resolveName: name,
  resolveMindRoom: agentId => input.mindRoom?.[agentId] ?? '',
  resolveRoomName: roomName,
  reasonLabel: coordinatorReasonLabel,
})

describe('租约表', () => {
  it('三态各有各的说法:生成中 / 在别处思考 / 等大脑', () => {
    const rows = leases({
      state: state({
        turns: [
          turn('a', true, 'room-1#L1'),
          turn('b', false, 'room-1#L2'),
          turn('c', false, 'room-1#L3'),
        ],
      }),
      mindRoom: { b: 'room-9' },
    })
    expect(rows.map(row => row.stateText)).toEqual(['生成中', '在「排期房」思考', '等大脑'])
    expect(rows.map(row => row.executing)).toEqual([true, false, false])
    expect(rows[1].thinkingIn).toBe('排期房')
  })

  // 大脑就在本房但登记簿里没这张牌 = 还没起跑,不是"在别处"。
  it('大脑在本房却没在生成 → 等大脑', () => {
    const rows = leases({
      state: state({ turns: [turn('a')] }),
      mindRoom: { a: 'room-1' },
    })
    expect(rows[0].stateText).toBe('等大脑')
    expect(rows[0].thinkingIn).toBe('')
  })

  it('房名解析不出来时退回 id —— 一个查得动的 id 好过一片空白', () => {
    const rows = buildRoomScheduleLeases({
      state: state({ turns: [turn('a')] }),
      resolveName: name,
      resolveMindRoom: () => 'room-77',
      reasonLabel: coordinatorReasonLabel,
    })
    expect(rows[0].thinkingIn).toBe('room-77')
  })

  // 「谁先拿到牌」本身就是调度的答案之一,按时长重排会把它抹掉。
  it('行序照发牌次序,不重排', () => {
    const rows = leases({
      state: state({
        turns: [
          { ...turn('c', false, 'room-1#L1'), startedAt: 9_000 },
          { ...turn('a', false, 'room-1#L2'), startedAt: 1_000 },
        ],
      }),
    })
    expect(rows.map(row => row.name)).toEqual(['Iris', '阿般'])
  })

  it('没有快照 = 空表', () => {
    expect(leases({ state: state() })).toEqual([])
  })
})

describe('举手队列', () => {
  const log: CollabSchedulerLogEntry[] = [
    { at: 9_000, type: 'hand', agentId: 'a' },
    { at: 5_000, type: 'grant', agentId: 'b' },
    { at: 3_000, type: 'hand', agentId: 'a' },
  ]

  it('闸的文案与「要人动手吗」跟着每一行走', () => {
    const rows = buildRoomScheduleHands({
      state: state({
        queue: [
          { id: 'q1', agentId: 'a', reason: 'mention', blockedBy: 'chain' },
          { id: 'q2', agentId: 'b', reason: 'self-elected', blockedBy: 'judging' },
        ],
      }),
      resolveName: name,
      reasonLabel: coordinatorReasonLabel,
    })
    expect(rows.map(row => row.gateLabel)).toEqual(['链闸', '裁决中'])
    expect(rows.map(row => row.actionable)).toEqual([true, false])
    expect(rows[0].gateHint).toContain('说句话')
  })

  // 举手时刻在房间快照里根本没有(`CollabCoordinatorQueued` 只有人/原因/闸),
  // 它只在时间轴的 hand 行上 —— 两边按 agentId 对上,取**最近**那一条。
  it('举手时刻从时间轴取,每人取最近那一条', () => {
    const rows = buildRoomScheduleHands({
      state: state({ queue: [{ id: 'q1', agentId: 'a', reason: 'mention', blockedBy: 'seats' }] }),
      resolveName: name,
      reasonLabel: coordinatorReasonLabel,
      log,
    })
    expect(rows[0].raisedAt).toBe(9_000)
  })

  it('时间轴上找不到那只手时给 0(留白),不编一个「刚刚」', () => {
    const rows = buildRoomScheduleHands({
      state: state({ queue: [{ id: 'q1', agentId: 'c', reason: 'mention', blockedBy: 'seats' }] }),
      resolveName: name,
      reasonLabel: coordinatorReasonLabel,
      log,
    })
    expect(rows[0].raisedAt).toBe(0)
  })

  it('六道闸都有文案,一个都不裸奔', () => {
    for (const gate of ['judging', 'seats', 'chain', 'phase', 'frozen', 'budget'] as const) {
      expect(roomScheduleGateLabel(gate)).not.toBe(gate)
    }
  })
})

describe('裁决回放', () => {
  const open: CollabSchedulerLogEntry = {
    at: 1_000, type: 'judge-open', token: 'room-1#J2', candidates: ['a', 'b', 'c'],
  }
  const verdict: CollabSchedulerLogEntry = {
    at: 1_800,
    type: 'judge-verdict',
    token: 'room-1#J2',
    order: ['b', 'a'],
    why: '小李最近在管这块',
    elapsedMs: 780,
    model: 'deepseek-chat',
    triggeredBy: 'room-1#J2',
  }

  // 三条 judge-* 行按 token 配对,不按时间挨着猜:并行的房间里挨着的两行完全
  // 可能属于两扇窗。
  it('按 token 配对,把候选 / 排序 / 理由 / 耗时 / 模型凑齐', () => {
    const other: CollabSchedulerLogEntry = {
      at: 1_500, type: 'judge-open', token: 'room-1#J9', candidates: ['c'],
    }
    const replay = buildRoomScheduleVerdict([verdict, other, open])
    expect(replay).toMatchObject({
      token: 'room-1#J2',
      order: ['b', 'a'],
      why: '小李最近在管这块',
      elapsedMs: 780,
      model: 'deepseek-chat',
      candidates: ['a', 'b', 'c'],
      degraded: false,
    })
  })

  // 降级那一路**没有 verdict 行**(裁判压根没答出来),而「刚才为什么没人理我」
  // 恰恰在那一次上最需要答案。
  it('降级也认:单独一条 judge-degraded 就能回放', () => {
    const degraded: CollabSchedulerLogEntry = {
      at: 2_000, type: 'judge-degraded', token: 'room-1#J2', reason: 'timeout', elapsedMs: 30_000,
    }
    const replay = buildRoomScheduleVerdict([degraded, open])
    expect(replay).toMatchObject({
      degraded: true,
      degradedReason: 'timeout',
      elapsedMs: 30_000,
      order: [],
      candidates: ['a', 'b', 'c'],
    })
  })

  it('空排序是一个有效答案(「这轮谁都不该说」),不是「没有裁决」', () => {
    const empty: CollabSchedulerLogEntry = {
      at: 1_800, type: 'judge-verdict', token: 'room-1#J2', order: [], elapsedMs: 400,
    }
    expect(buildRoomScheduleVerdict([empty])).toMatchObject({ order: [], degraded: false })
  })

  it('账上没有裁决行就是 null', () => {
    expect(buildRoomScheduleVerdict([{ at: 1, type: 'posted' }])).toBeNull()
    expect(buildRoomScheduleVerdict([])).toBeNull()
    expect(buildRoomScheduleVerdict(undefined)).toBeNull()
  })
})

describe('时间轴视图', () => {
  const log: CollabSchedulerLogEntry[] = [
    { at: 9_000, type: 'dead-letter', actor: 'agent:a', eventType: 'room:floor-granted', error: 'boom' },
    { at: 8_000, type: 'grant', agentId: 'a', leaseId: 'room-1#L4', triggeredBy: 'room-1#J2' },
    {
      at: 7_000,
      type: 'judge-verdict',
      token: 'room-1#J2',
      order: ['a'],
      why: '她提的',
      elapsedMs: 700,
      triggeredBy: 'msg-abcdefghijklmnop',
    },
    { at: 6_000, type: 'gate-block', agentId: 'b', gate: 'chain' },
    { at: 5_000, type: 'posted', authorKind: 'user', chainReset: true, messageId: 'm1' },
  ]

  it('四档着色:出事了 / 花钱了 / 动了牌 / 只是流水', () => {
    expect(roomScheduleLogTone('dead-letter')).toBe('fault')
    expect(roomScheduleLogTone('judge-degraded')).toBe('fault')
    expect(roomScheduleLogTone('gate-block')).toBe('fault')
    expect(roomScheduleLogTone('judge-verdict')).toBe('judge')
    expect(roomScheduleLogTone('grant')).toBe('floor')
    expect(roomScheduleLogTone('posted')).toBe('plain')
    expect(roomScheduleLogTone('未来某一类')).toBe('plain')
  })

  it('每一行读成人话,名字不裸奔成 id', () => {
    const rows = buildRoomScheduleLogRows({ log, resolveName: name })
    expect(rows.map(row => row.text)).toEqual([
      'agent:a 处理 room:floor-granted 失败:boom',
      '发牌 → 阿般',
      '裁决:阿般(她提的)',
      '小李 撞闸 · 链闸',
      '你发言(链归零)',
    ])
  })

  // 因果引用是这本账的脊梁,而一串裸 id 在屏幕上等于没有。
  it('triggeredBy 读成可读引用:牌 / 裁决 / 消息各有各的说法', () => {
    const rows = buildRoomScheduleLogRows({ log, resolveName: name })
    expect(rows[1].triggeredBy).toBe('← 裁决 J2')
    expect(rows[2].triggeredBy).toBe('← 消息 msg-abcdefgh…')
    expect(formatRoomScheduleTrigger('room-1#L4')).toBe('← 牌 L4')
    expect(formatRoomScheduleTrigger('evt:room-1:m1')).toBe('← 事件 room-1:m1')
    expect(formatRoomScheduleTrigger(undefined)).toBe('')
    expect(formatRoomScheduleTrigger('  ')).toBe('')
  })

  it('过滤只留那一类 —— 死信红点跳过来时带的就是它', () => {
    const rows = buildRoomScheduleLogRows({ log, resolveName: name, filter: 'dead-letter' })
    expect(rows).toHaveLength(1)
    expect(rows[0].tone).toBe('fault')
  })

  it('尾长有上限 —— 再多就成了日志', () => {
    const many = Array.from({ length: 80 }, (_, index) => ({ at: index, type: 'posted' }))
    expect(buildRoomScheduleLogRows({ log: many, resolveName: name, limit: 5 })).toHaveLength(5)
  })

  it('账为空 / 拿不到都给空表', () => {
    expect(buildRoomScheduleLogRows({ log: [], resolveName: name })).toEqual([])
    expect(buildRoomScheduleLogRows({ log: undefined, resolveName: name })).toEqual([])
  })

  // 界面上的过滤器刻意不是 14 类全表(那是 CLI 的活)—— 一个十四项的下拉菜单
  // 在诊断现场没人读得完。
  it('过滤器是四个入口 + 全部,不是 14 类全表', () => {
    expect(ROOM_SCHEDULE_LOG_FILTERS).toHaveLength(5)
    expect(ROOM_SCHEDULE_LOG_FILTERS[0]).toEqual({ key: '', label: '全部' })
    expect(ROOM_SCHEDULE_LOG_FILTERS.map(option => option.key)).toContain('dead-letter')
  })
})
