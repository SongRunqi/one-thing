/**
 * 协调器状态条的纯逻辑(docs/design/collab-coordinator-inspector.md)。
 *
 * 这一面全是"数字怎么读"的判断——阈值、单位、优先级、措辞——而那正是最容易
 * 悄悄写错、又最难在真机上看出来的地方(一个读错的闸看起来和读对的一模一样)。
 */
import { describe, expect, it } from 'vitest'
import type { CollabCoordinatorState } from '@shared/ipc'
import {
  buildCoordinatorBar,
  buildCoordinatorGateRows,
  buildCoordinatorLogRows,
  buildCoordinatorNowRows,
  buildCoordinatorPlan,
  formatCoordinatorAgo,
  formatCoordinatorElapsed,
} from '../coordinator-status'

const NAMES: Record<string, string> = { a: '阿般', b: '小李', c: 'Iris', d: '老丁' }
const name = (id: string): string => NAMES[id] ?? id

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
    ...patch,
  }
}

const turn = (agentId: string, reason = 'relay') => ({
  agentId,
  reason,
  startedAt: 1_000,
  agentSessionId: `agent-exec-${agentId}-room-1`,
})

describe('常驻条', () => {
  it('没有快照 = 空闲(冷启动不该闪一下空白)', () => {
    const bar = buildCoordinatorBar(null, name)
    expect(bar.text).toBe('空闲')
    expect(bar.lamp).toBe('off')
  })

  it('空闲也是状态,而且灯是空心的', () => {
    expect(buildCoordinatorBar(state(), name)).toMatchObject({ text: '空闲', lamp: 'off', tail: '并行' })
  })

  it('有人在说 → 报名字,有编排在飞时右端带批数', () => {
    const bar = buildCoordinatorBar(
      state({
        mode: 'serial',
        turns: [turn('a')],
        plan: { waves: [['a'], ['b']], waveIndex: 0, waveCount: 6, cycle: true, why: '', loops: 0 },
      }),
      name,
    )
    expect(bar).toMatchObject({ lamp: 'run', text: '阿般 正在说', tail: '顺序 · 第 7 批' })
  })

  it('多人并行时说清一共几个', () => {
    expect(buildCoordinatorBar(state({ turns: [turn('a'), turn('b')] }), name).text)
      .toBe('阿般 等 2 人正在说')
  })

  it('**闸优先于在跑**:自己会结束的事排在不动手就不会结束的事之后', () => {
    const bar = buildCoordinatorBar(
      state({ turns: [turn('a')], gates: { ...state().gates, chain: { value: 32, max: 32 } } }),
      name,
    )
    expect(bar).toMatchObject({ lamp: 'wait', text: '已按住 · 连聊 32 条' })
  })

  it('暂停压过一切,并且把「恢复」直接给到条上', () => {
    const bar = buildCoordinatorBar(state({ frozen: true, turns: [turn('a')] }), name)
    expect(bar).toMatchObject({ text: '已暂停 · 队列已清空', action: 'resume' })
  })

  it('预算用尽也是「按住」', () => {
    const bar = buildCoordinatorBar(
      state({ gates: { ...state().gates, budget: { value: 5, max: 5 } } }),
      name,
    )
    expect(bar.text).toBe('已按住 · 今日预算用尽')
  })

  it('判定在飞:拿不到名字时退回不点名的说法,不编人数', () => {
    expect(buildCoordinatorBar(state({ judging: 1 }), name).text).toBe('正在判断谁接话')
    expect(buildCoordinatorBar(state({ judging: 1, judgingAgentIds: ['a', 'b'] }), name).text)
      .toBe('2 人在判断要不要接话')
  })

  it('只有队列时报排队人数', () => {
    const bar = buildCoordinatorBar(
      state({ queue: [{ id: 'q1', agentId: 'b', reason: 'mention' }] }),
      name,
    )
    expect(bar.text).toBe('1 人排队中')
  })
})

describe('现在', () => {
  it('在跑的在前、排队的在后,判定那条垫底', () => {
    const rows = buildCoordinatorNowRows(
      state({
        turns: [turn('a', 'relay')],
        queue: [{ id: 'q1', agentId: 'b', reason: 'mention' }],
        judging: 1,
      }),
      name,
    )
    expect(rows.map(row => row.glyph)).toEqual(['▶', '○', '◌'])
    expect(rows[0]).toMatchObject({ name: '阿般', reason: '轮到发言', running: true })
    expect(rows[1]).toMatchObject({ name: '小李', reason: '被 @ 激活', activationId: 'q1' })
  })

  it('在跑的行带得走执行会话 id —— 那是下钻和「停」的靶子', () => {
    const rows = buildCoordinatorNowRows(state({ turns: [turn('a')] }), name)
    expect(rows[0].agentSessionId).toBe('agent-exec-a-room-1')
  })
})

describe('闸', () => {
  it('百分比与告警阈值(80%)', () => {
    const rows = buildCoordinatorGateRows(state({
      gates: {
        chain: { value: 8, max: 32 },
        concurrency: { value: 1, max: 6 },
        budget: { value: 4.21, max: 5 },
      },
    }))
    expect(rows[0]).toMatchObject({ percent: 25, value: '8/32', warn: false })
    expect(rows[2]).toMatchObject({ value: '$4.21/5', warn: true })
  })

  it('**不限的闸永远画成空线**——走满的线会让"不限"看起来像"撞死了"', () => {
    const rows = buildCoordinatorGateRows(state({
      gates: {
        chain: { value: 99, max: 0 },
        concurrency: { value: 3, max: 0 },
        budget: { value: 12, max: 0 },
      },
    }))
    expect(rows[0]).toMatchObject({ percent: 0, value: '99/∞', warn: false })
    expect(rows[2].value).toBe('$12.00')
  })

  it('刚好压线算告警', () => {
    const rows = buildCoordinatorGateRows(state({
      gates: { ...state().gates, chain: { value: 26, max: 32 } },
    }))
    expect(rows[0].warn).toBe(true)
  })
})

describe('编排', () => {
  const planned = (patch: Partial<NonNullable<CollabCoordinatorState['plan']>> = {}) =>
    buildCoordinatorPlan(
      state({
        mode: 'auto',
        plan: {
          waves: [['a'], ['b', 'c']],
          waveIndex: 1,
          waveCount: 3,
          cycle: true,
          why: '先让阿般定调',
          loops: 0,
          ...patch,
        },
      }),
      name,
    )

  it('**多人批**是环画不出来的形状 —— 编排比模式多出来的表达力就在这儿', () => {
    const view = planned()
    expect(view?.waves).toEqual([
      { names: ['阿般'], current: false },
      { names: ['小李', 'Iris'], current: true },
    ])
  })

  it('批号说的是**正在跑**的那一批(跑完 3 批、每轮 2 批 → 正跑第 4 批 · 第 2 轮)', () => {
    expect(planned()?.progress).toBe('第 4 批 · 第 2 轮')
    expect(planned()?.limit).toBe('不限轮')
    expect(planned({ loops: 3 })?.limit).toBe('上限 3 轮')
  })

  it('不循环的编排不说"轮" —— 它只走一遍', () => {
    const view = planned({ cycle: false })
    expect(view?.progress).toBe('第 4 批')
    expect(view?.limit).toBe('走一遍')
  })

  it('编排装上即第一批在跑 —— 不说「尚未开跑」,「现在」里成员已经亮着 ▶', () => {
    expect(planned({ waveCount: 0 })?.progress).toBe('第 1 批 · 第 1 轮')
  })

  it('没有编排在飞时这一段不画', () => {
    expect(buildCoordinatorPlan(state(), name)).toBeNull()
  })

  it('常驻条右端:智能模式带批数', () => {
    const bar = buildCoordinatorBar(
      state({
        mode: 'auto',
        turns: [turn('a')],
        plan: { waves: [['a']], waveIndex: 0, waveCount: 6, cycle: true, why: '', loops: 0 },
      }),
      name,
    )
    expect(bar.tail).toBe('智能 · 第 7 批')
  })
})

describe('刚才', () => {
  it('「写了话但没发送」是事故不是选择 —— 与「没说话」分开呈现且不置灰', () => {
    const rows = buildCoordinatorLogRows(
      state({
        log: [
          { at: 1, kind: 'silent', agentId: 'a' },
          { at: 2, kind: 'unsent', agentId: 'b' },
        ],
      }),
      name,
    )
    expect(rows.map(row => row.text)).toEqual(['小李 写了话但没发送', '阿般 没说话'])
    expect(rows[0].muted).toBe(false)
    expect(rows[1].muted).toBe(true)
  })

  it('「编排」一行给出完整决定:谁、什么次序、为什么;空编排也开口', () => {
    const rows = buildCoordinatorLogRows(
      state({
        log: [
          { at: 1, kind: 'planned', count: 2, detail: '先让阿般定调', waves: [['a'], ['b', 'c']] },
          { at: 2, kind: 'planned', count: 0, detail: '不是找他们的' },
        ],
      }),
      name,
    )
    expect(rows.map(row => row.text)).toEqual([
      '编排:这轮无人发言(不是找他们的)',
      '编排:阿般 → 小李·Iris(先让阿般定调)',
    ])
  })

  it('新在前,并且「都没接话」比「0 人接话」像人话', () => {
    const rows = buildCoordinatorLogRows(
      state({
        log: [
          { at: 1, kind: 'received' },
          { at: 2, kind: 'judging', count: 4 },
          { at: 3, kind: 'judged', count: 0, total: 4 },
        ],
      }),
      name,
    )
    expect(rows.map(row => row.text)).toEqual([
      '判定 4 人 → 都没接话',
      '判定 4 人…',
      '收到你的消息',
    ])
  })

  it('接了话的那条把两个数都说出来', () => {
    const rows = buildCoordinatorLogRows(
      state({ log: [{ at: 1, kind: 'judged', count: 1, total: 4 }] }),
      name,
    )
    expect(rows[0].text).toBe('判定 4 人 → 1 人接话')
  })

  /** §8:「都没接话」的五种成因必须分得开 —— 这是这块面板存在的理由。 */
  it('分布把"链断了"和"真没话说"分开,且链断的排在前面', () => {
    const rows = buildCoordinatorLogRows(
      state({
        log: [{ at: 1, kind: 'judged', count: 0, total: 3, outcomes: { timeout: 2, no: 1 } }],
      }),
      name,
    )
    expect(rows[0].text).toBe('判定 3 人 → 都没接话(2 超时 · 1 说不)')
  })

  it('全员「说不」不加括号 —— 那是正常沉默,不是要解释的事故', () => {
    const rows = buildCoordinatorLogRows(
      state({ log: [{ at: 1, kind: 'judged', count: 0, total: 3, outcomes: { no: 3 } }] }),
      name,
    )
    expect(rows[0].text).toBe('判定 3 人 → 都没接话')
  })

  it('「没发出去」单独成一类 —— 它是调用根本没离开进程,与超时不是一回事', () => {
    const rows = buildCoordinatorLogRows(
      state({
        log: [{ at: 1, kind: 'judged', count: 0, total: 3, outcomes: { unresolved: 3 } }],
      }),
      name,
    )
    expect(rows[0].text).toBe('判定 3 人 → 都没接话(3 没发出去)')
  })

  it('接了话的同时也报成因(1 接话 2 超时 ≠ 1 接话 2 说不)', () => {
    const rows = buildCoordinatorLogRows(
      state({
        log: [{ at: 1, kind: 'judged', count: 1, total: 3, outcomes: { yes: 1, timeout: 2 } }],
      }),
      name,
    )
    expect(rows[0].text).toBe('判定 3 人 → 1 人接话(2 超时)')
  })

  it('没有分布(旧快照)时行为不变', () => {
    const rows = buildCoordinatorLogRows(
      state({ log: [{ at: 1, kind: 'judged', count: 0, total: 2 }] }),
      name,
    )
    expect(rows[0].text).toBe('判定 2 人 → 都没接话')
  })

  it('传棒 / 说了几句 / 没说话 / 被按住各有各的说法,沉默与按住走灰行', () => {
    const rows = buildCoordinatorLogRows(
      state({
        log: [
          { at: 1, kind: 'relay-pass', agentId: 'b' },
          { at: 2, kind: 'spoke', agentId: 'a', count: 2 },
          { at: 3, kind: 'silent', agentId: 'c' },
          { at: 4, kind: 'blocked', detail: 'loops' },
          { at: 5, kind: 'stopped' },
        ],
      }),
      name,
    )
    expect(rows.map(row => row.text)).toEqual([
      '你喊了停 · 已清场',
      '按住 · 轮次用尽',
      'Iris 没说话',
      '阿般 说了 2 句',
      // 编排之后这条 kind 只在「agent 在发言里 @ 了人 → 提到下一批」时出现,
      // 「传棒」这个说法跟着环一起退休了。
      '插队 → 小李',
    ])
    expect(rows.map(row => row.muted)).toEqual([false, true, true, false, false])
  })

  it('只画最近几条 —— 再多就成了日志', () => {
    const log = Array.from({ length: 20 }, (_, index) => ({
      at: index,
      kind: 'received' as const,
    }))
    expect(buildCoordinatorLogRows(state({ log }), name)).toHaveLength(6)
  })
})

describe('时间', () => {
  it('「多久以前」用短单位', () => {
    const now = 10_000_000
    expect(formatCoordinatorAgo(now - 12_000, now)).toBe('12s')
    expect(formatCoordinatorAgo(now - 180_000, now)).toBe('3m')
    expect(formatCoordinatorAgo(now - 7_200_000, now)).toBe('2h')
    expect(formatCoordinatorAgo(0, now)).toBe('')
  })

  it('「跑了多久」是走着的计时,分:秒', () => {
    const now = 10_000_000
    expect(formatCoordinatorElapsed(now - 12_000, now)).toBe('0:12')
    expect(formatCoordinatorElapsed(now - 132_000, now)).toBe('2:12')
    expect(formatCoordinatorElapsed(0, now)).toBe('')
  })
})
