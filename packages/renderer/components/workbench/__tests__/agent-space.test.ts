import { describe, expect, it } from 'vitest'
import type { AgentHistory } from '@/utils/agent-sessions'
import { buildAgentSpaceCounts, buildAgentSpaceSubtitle } from '../agent-space'

function history(overrides: Partial<AgentHistory> = {}): AgentHistory {
  return {
    conversations: [],
    rooms: [],
    pairDms: [],
    work: [],
    ...overrides,
  }
}

function row(sessionId: string) {
  return { sessionId, label: sessionId, note: '', updatedAt: 0, messageCount: 0, readOnly: false }
}

describe('buildAgentSpaceCounts', () => {
  it('四行的顺序与文案照样板:与你的对话 / 群聊 / 干过的活 / 私下', () => {
    const rows = buildAgentSpaceCounts(history())
    expect(rows.map(item => item.label)).toEqual(['与你的对话', '群聊', '干过的活', '私下'])
    expect(rows.map(item => item.key)).toEqual(['conversations', 'rooms', 'work', 'pairDms'])
  })

  it('计数直接读履历页那份归类,不自己再过滤一遍', () => {
    const rows = buildAgentSpaceCounts(history({
      conversations: [row('s1'), row('s2')],
      rooms: [row('r1')],
      pairDms: [row('p1'), row('p2'), row('p3')],
      work: [
        { taskId: 't1', title: '卡一', rows: [row('w1'), row('w2')], updatedAt: 0 },
        { taskId: 't2', title: '卡二', rows: [row('w3')], updatedAt: 0 },
      ],
    }))

    expect(rows.map(item => item.count)).toEqual([2, 1, 2, 3])
  })

  it('「干过的活」数的是卡不是会话:一张卡跑三次仍然是一件活', () => {
    const rows = buildAgentSpaceCounts(history({
      work: [{ taskId: 't1', title: '卡一', rows: [row('a'), row('b'), row('c')], updatedAt: 0 }],
    }))
    expect(rows.find(item => item.key === 'work')?.count).toBe(1)
  })
})

describe('buildAgentSpaceSubtitle', () => {
  it('职位 · 同事', () => {
    expect(buildAgentSpaceSubtitle({ title: '架构', kind: 'colleague' })).toBe('架构 · 同事')
  })

  it('没有职位就只剩分类', () => {
    expect(buildAgentSpaceSubtitle({ kind: 'colleague' })).toBe('同事')
    expect(buildAgentSpaceSubtitle({ title: '   ' })).toBe('同事')
  })

  it('service 是「服务」,退休补一句「已注销」', () => {
    expect(buildAgentSpaceSubtitle({ kind: 'service' })).toBe('服务')
    expect(buildAgentSpaceSubtitle({ title: '前端', status: 'retired' })).toBe('前端 · 同事 · 已注销')
  })
})
