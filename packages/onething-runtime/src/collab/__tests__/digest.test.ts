import { describe, expect, it } from 'vitest'
import {
  COLLAB_DIGEST_MAX_CHARS,
  buildCollabDigestPrompt,
  formatCollabDigestLines,
  parseCollabDigestReply,
} from '../digest.js'
import { planCollabHistoryWindow } from '../history-window.js'
import { projectRoomHistory } from '../projection.js'
import type { CollabMessageLike } from '../types.js'

const AGENTS = [
  { id: 'a', name: 'Atlas' },
  { id: 'i', name: 'Iris' },
]

describe('buildCollabDigestPrompt', () => {
  it('署名保留 —— 谁说的往往就是信息本身', () => {
    const { user } = buildCollabDigestPrompt({
      roomName: 'cumo',
      day: '2026-07-28',
      messages: [
        { id: 'm1', role: 'assistant', agentId: 'i', content: '我来发牌' },
        { id: 'm2', role: 'user', content: '好' },
      ],
      agents: AGENTS,
      userLabel: '一天',
    })
    expect(user).toContain('Iris: 我来发牌')
    expect(user).toContain('一天: 好')
  })

  it('不带人设 —— 摘要是房间的客观事实,不是某位同事的复述', () => {
    const { system } = buildCollabDigestPrompt({
      roomName: 'cumo',
      day: '2026-07-28',
      messages: [{ id: 'm1', role: 'assistant', agentId: 'i', content: 'x' }],
      agents: AGENTS,
    })
    expect(system).not.toContain('persona')
    expect(system).toContain(String(COLLAB_DIGEST_MAX_CHARS))
  })
})

describe('parseCollabDigestReply', () => {
  it('(无) / 空 / 空白都落成空串 —— "这天没什么可记的"是个有效结论', () => {
    for (const reply of ['(无)', '（无）', '(none)', '   ', '', undefined]) {
      expect(parseCollabDigestReply(reply)).toBe('')
    }
  })

  it('超长截断,换行压平', () => {
    const long = 'x'.repeat(COLLAB_DIGEST_MAX_CHARS + 50)
    expect(parseCollabDigestReply(long).length).toBe(COLLAB_DIGEST_MAX_CHARS + 1)
    expect(parseCollabDigestReply('第一行\n第二行')).toBe('第一行 第二行')
  })
})

describe('formatCollabDigestLines', () => {
  it('空摘要不渲染 —— 这一块任何时候都不该假装知道被折掉了什么', () => {
    const lines = formatCollabDigestLines([
      { day: '2026-07-28', summary: '发了牌,等确认', messageCount: 3, generatedAt: 0 },
      { day: '2026-07-29', summary: '', messageCount: 1, generatedAt: 0 },
    ])
    expect(lines).toEqual(['<Day date="2026-07-28">发了牌,等确认</Day>'])
  })
})

describe('投影里的摘要', () => {
  const NOON = new Date(2026, 7, 1, 12, 0, 0).getTime()
  const DAY = 86_400_000
  const messages: CollabMessageLike[] = [
    { id: 'm1', role: 'assistant', agentId: 'i', content: '三天前', timestamp: NOON - 3 * DAY },
    { id: 'm2', role: 'assistant', agentId: 'a', content: '今天', timestamp: NOON - 1000 },
  ]
  const digests = [
    { day: '2026-07-29', summary: '发了牌,等四个人确认', messageCount: 1, generatedAt: 0 },
  ]

  it('折叠了才渲染摘要,且紧跟折叠行', () => {
    const window = planCollabHistoryWindow({ messages, now: NOON, historyTailCount: 0 })
    const [projected] = projectRoomHistory({
      messages,
      selfAgentId: 'a',
      agents: AGENTS,
      window,
      digests,
    })
    const folded = projected.content.indexOf('<Folded')
    const day = projected.content.indexOf('<Day date=')
    expect(folded).toBeGreaterThan(-1)
    expect(day).toBeGreaterThan(folded)
    expect(projected.content.indexOf('<message ')).toBeGreaterThan(day)
  })

  it('没折叠就不渲染 —— 否则同一天的事说两遍', () => {
    const window = planCollabHistoryWindow({ messages, now: NOON, historyDays: 0 })
    const [projected] = projectRoomHistory({
      messages,
      selfAgentId: 'a',
      agents: AGENTS,
      window,
      digests,
    })
    expect(projected.content).not.toContain('<Day date=')
  })
})
