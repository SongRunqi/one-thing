/**
 * The PRODUCTION room projection (buildHistoryMessages over a kind='room'
 * session). The rules are specified in @onething/runtime/collab projection.ts;
 * this file guards the ChatMessage-level adapter that actually feeds the
 * provider — the 2026-07-28 incident lived exactly in the gap between the two
 * (W9.1: system lines were dropped here, so the reviewer only ever saw what
 * the executor claimed).
 */
import { describe, expect, it, vi } from 'vitest'

vi.mock('../../../agents/index.js', () => ({
  findAgent: (agentId: string) => {
    const names: Record<string, string> = { fe: '小李', pm: '阿明' }
    return names[agentId] ? { id: agentId, name: names[agentId] } : null
  },
}))

/** W18: an execution session's history IS the room's, so the projection has to
 *  go and read it. */
const rooms = new Map<string, unknown>()
vi.mock('../../../store.js', () => ({
  getSession: (id: string) => rooms.get(id),
}))

import { buildHistoryMessages } from '../message-helpers.js'
import type { ChatMessage } from '@shared/ipc.js'

const ROOM = { id: 'room-1', kind: 'room', agentId: 'pm' }

function message(partial: Partial<ChatMessage> & Pick<ChatMessage, 'role'>): ChatMessage {
  return { id: Math.random().toString(36).slice(2), timestamp: Date.now(), content: '', ...partial } as ChatMessage
}

describe('room projection for the model (W9.1)', () => {
  it('gives the reviewer the task facts and hides the operational noise', () => {
    const history = buildHistoryMessages([
      message({ role: 'user', content: '@小李 给项目加个 notes.txt' }),
      message({ role: 'user', content: '(小李 · 被 @ 激活)', source: 'collab' }),
      message({ role: 'system', content: '「加 notes.txt」→ 小李 开始执行(看板可查看现场)', source: 'collab-task' }),
      message({ role: 'system', content: '「加 notes.txt」排队等待执行(并发上限)', source: 'collab' }),
      message({ role: 'system', content: '「加 notes.txt」受阻:小李 无法继续,任务未交付(原因见看板任务卡)', source: 'collab-task' }),
      message({ role: 'assistant', agentId: 'fe', content: '已交付。notes.txt 写好了' }),
    ], ROOM)

    const text = history.map(entry => String(entry.content)).join('\n')
    expect(text).toContain('<msg from="系统">「加 notes.txt」→ 小李 开始执行')
    expect(text).toContain('<msg from="系统">「加 notes.txt」受阻:小李 无法继续,任务未交付')
    expect(text).toContain('<msg from="小李">已交付。notes.txt 写好了')
    // Drive lines and operational noise never reach the model.
    expect(text).not.toContain('被 @ 激活')
    expect(text).not.toContain('排队等待执行')
    // Everything above is one merged user-side block for the activated PM.
    expect(history).toHaveLength(1)
    expect(history[0].role).toBe('user')
  })

  it('keeps unmarked system lines out entirely (they are display-only)', () => {
    const history = buildHistoryMessages([
      message({ role: 'user', content: '继续' }),
      message({ role: 'system', content: '今天这个房间已花费 $5.00,达到日预算 $5', source: 'collab' }),
    ], ROOM)
    expect(history.map(entry => String(entry.content)).join('\n')).not.toContain('日预算')
  })

  it('carries the quote reply into the model view, quote line above the speech (W7)', () => {
    // Same two-line shape the pure spec asserts (collab/projection.ts) — this
    // is the adapter that actually feeds the provider, so both must agree.
    const history = buildHistoryMessages([
      message({ role: 'assistant', agentId: 'fe', content: '先做接口再做页面' }),
      message({
        role: 'user',
        content: '就按这个来',
        replyTo: { messageId: 'm1', authorLabel: '小李', excerpt: '先做接口再做页面' },
      }),
    ], ROOM)

    const text = history.map(entry => String(entry.content)).join('\n')
    expect(text).toContain('<msg from="用户">> 小李: 先做接口再做页面\n就按这个来')
  })

  // W13.2: the coordinator hangs quotes on AGENT replies after the fact, so
  // the adapter must emit the quote line for another member's speech too —
  // W7 only ever exercised the user's own quoted message here.
  it('carries a quote hung on another agent’s reply (W13.2 补挂)', () => {
    const history = buildHistoryMessages([
      message({ role: 'user', content: '登录页什么时候能好?' }),
      message({ role: 'assistant', agentId: 'pm', content: '我这边排期留了位置' }),
      message({
        role: 'assistant',
        agentId: 'fe',
        content: '明天下班前',
        replyTo: { messageId: 'm1', authorLabel: '用户', excerpt: '登录页什么时候能好?' },
      }),
    ], ROOM)

    const text = history.map(entry => String(entry.content)).join('\n')
    expect(text).toContain('<msg from="小李">> 用户: 登录页什么时候能好?\n明天下班前')
  })

  it('never decorates the activated agent’s OWN quoted message', () => {
    // Self messages stay structural: an agent reading a quote line it never
    // wrote back into its own past output is words put in its mouth.
    // ROOM.agentId is 'pm' — this message is the activated agent's own.
    const history = buildHistoryMessages([
      message({
        role: 'assistant',
        agentId: 'pm',
        content: '明天下班前',
        replyTo: { messageId: 'm1', authorLabel: '用户', excerpt: '登录页什么时候能好?' },
      }),
    ], ROOM)

    const text = history.map(entry => String(entry.content)).join('\n')
    expect(text).not.toContain('> 用户:')
    expect(text).toContain('明天下班前')
  })

  it('tail-annotates reacted messages with the same tally the spec asserts (W8)', () => {
    const history = buildHistoryMessages([
      message({
        role: 'assistant',
        agentId: 'fe',
        content: '接口写完了',
        reactions: [{ emoji: '👍', by: [{ type: 'user' }, { type: 'agent', agentId: 'pm' }] }],
      }),
      message({
        role: 'user',
        content: '辛苦',
        reactions: [{ emoji: '🎉', by: [{ type: 'agent', agentId: 'fe' }] }],
      }),
    ], ROOM)

    const text = history.map(entry => String(entry.content)).join('\n')
    expect(text).toContain('<msg from="小李">接口写完了 (👍×2)')
    expect(text).toContain('<msg from="用户">辛苦 (🎉)')
  })

  it('never annotates the activated agent’s own messages', () => {
    // ROOM's agentId is 'pm', so this message stays structural — appending a
    // tally would put words the agent never wrote into its own transcript.
    const history = buildHistoryMessages([
      message({
        role: 'assistant',
        agentId: 'pm',
        content: '我来评审',
        reactions: [{ emoji: '👍', by: [{ type: 'user' }] }],
      }),
    ], ROOM)
    expect(history.map(entry => String(entry.content)).join('\n')).toBe('我来评审')
  })

  /**
   * W18 §4.6「模型输入不变」: the turn moved into the agent's execution session,
   * and what it reads did NOT — it is still the room's IM projection. The
   * execution session's own transcript (thinking, tool traffic, older drives) is
   * a log, deliberately not input this round.
   *
   * ONE exception since 2026-07-30: the CURRENT drive is appended at the tail.
   * It used to be swallowed with the rest of the log, which made every comment
   * about the drive "sitting at the end of the context" false.
   */
  describe('execution session (W18)', () => {
    const AGENT_SESSION = {
      id: 'agent-exec-fe',
      kind: 'agent',
      agentId: 'fe',
      collab: { roomSessionId: 'room-1' },
    }

    it('projects the TARGET room, from the driven agent’s point of view', () => {
      rooms.set('room-1', {
        id: 'room-1',
        kind: 'room',
        messages: [
          message({ role: 'user', content: '@小李 登录页什么时候能好?' }),
          message({ role: 'assistant', agentId: 'pm', content: '排期我留了位置', source: 'collab-say' }),
          message({ role: 'assistant', agentId: 'fe', content: '明天下班前', source: 'collab-say' }),
        ],
      })

      // The execution session's own transcript — a log, except for the drive.
      const history = buildHistoryMessages([
        message({ role: 'user', content: '(小李 · 被 @ 激活)', source: 'collab' }),
        message({ role: 'assistant', agentId: 'fe', content: '内部盘算', source: 'collab-turn' }),
      ], AGENT_SESSION)

      const text = history.map(entry => String(entry.content)).join('\n')
      expect(text).toContain('<msg from="用户">@小李 登录页什么时候能好?')
      expect(text).toContain('<msg from="阿明">排期我留了位置')
      // Its own utterance stays structural (assistant), like any self message.
      expect(history.some(entry => entry.role === 'assistant' && entry.content === '明天下班前')).toBe(true)
      // The turn record — and every other bit of execution traffic — stays out.
      expect(text).not.toContain('内部盘算')
    })

    /**
     * The bug this whole branch exists for: the drive carries the ONLY
     * instruction the turn gets about how the channel works (发言走 say),
     * and it reached the model exactly never.
     */
    it('appends the CURRENT drive at the tail, as a plain unenveloped user line', () => {
      rooms.set('room-1', {
        id: 'room-1',
        kind: 'room',
        messages: [message({ role: 'user', content: '@小李 登录页什么时候能好?' })],
      })

      const history = buildHistoryMessages([
        message({ role: 'user', content: '(小李 · 上一轮的旧驱动)', source: 'collab' }),
        message({ role: 'assistant', agentId: 'fe', content: '上一轮的盘算', source: 'collab-turn' }),
        message({
          role: 'user',
          content: '(小李 · 被 @ 激活)\n(你的发言通过 say 工具送出,可多次;说完直接结束。)',
          source: 'collab',
        }),
      ], AGENT_SESSION)

      const text = history.map(entry => String(entry.content)).join('\n')
      // It is the last thing the model reads.
      expect(String(history[history.length - 1].content)).toContain('你的发言通过 say 工具送出')
      expect(history[history.length - 1].role).toBe('user')
      // Coordinator machinery, not a room voice: no 「用户」 envelope around it.
      expect(text).not.toContain('<msg from="用户">(小李 · 被 @ 激活)')
      // Only the current drive: the previous round's drive and its thinking
      // record are still the execution LOG.
      expect(text).not.toContain('上一轮的旧驱动')
      expect(text).not.toContain('上一轮的盘算')
    })

    it('merges the drive into the trailing user block (no two adjacent user rows)', () => {
      rooms.set('room-1', {
        id: 'room-1',
        kind: 'room',
        messages: [
          message({ role: 'user', content: '@小李 登录页什么时候能好?' }),
          message({ role: 'assistant', agentId: 'pm', content: '排期我留了位置', source: 'collab-say' }),
        ],
      })

      const history = buildHistoryMessages([
        message({ role: 'user', content: '(小李 · 被 @ 激活)', source: 'collab' }),
      ], AGENT_SESSION)

      // Both room rows are user-side for 小李, and so is the drive: one block,
      // drive text last. Two adjacent user messages are a 400 from any
      // alternation-strict provider.
      expect(history).toHaveLength(1)
      expect(history[0].role).toBe('user')
      expect(String(history[0].content).endsWith('(小李 · 被 @ 激活)')).toBe(true)
    })

    it('keeps the drive its own row after the agent’s own structural message', () => {
      rooms.set('room-1', {
        id: 'room-1',
        kind: 'room',
        messages: [
          message({ role: 'user', content: '@小李 登录页什么时候能好?' }),
          message({ role: 'assistant', agentId: 'fe', content: '明天下班前', source: 'collab-say' }),
        ],
      })

      const history = buildHistoryMessages([
        message({ role: 'user', content: '(小李 · 被 @ 激活)', source: 'collab' }),
      ], AGENT_SESSION)

      expect(history.map(entry => entry.role)).toEqual(['user', 'assistant', 'user'])
      expect(history[2].content).toBe('(小李 · 被 @ 激活)')
    })

    it('appends the LATEST drive when the session holds several rounds', () => {
      rooms.set('room-1', {
        id: 'room-1',
        kind: 'room',
        messages: [message({ role: 'user', content: '@小李 登录页什么时候能好?' })],
      })

      const history = buildHistoryMessages([
        message({ role: 'user', content: '(小李 · 被 @ 激活)', source: 'collab' }),
        message({ role: 'assistant', agentId: 'fe', content: '答案写好了', source: 'collab-turn' }),
        message({ role: 'user', content: '(小李 · 主动接话)', source: 'collab' }),
      ], AGENT_SESSION)

      const text = history.map(entry => String(entry.content)).join('\n')
      expect(text).toContain('主动接话')
      // The turn record stays a log: it is still not input.
      expect(text).not.toContain('<msg from="小李">答案写好了')
      expect(history.filter(entry => entry.role === 'assistant')).toHaveLength(0)
    })

    it('never lets the execution session’s summary anchor swallow the room', () => {
      // The appended drive is the only row carrying an id from THIS session, so
      // it is the only one that could match a compaction anchor and turn the
      // whole projection into 「summary + 好的」. It must not.
      rooms.set('room-1', {
        id: 'room-1',
        kind: 'room',
        messages: [message({ role: 'user', content: '@小李 登录页什么时候能好?' })],
      })
      const drive = message({
        id: 'drive-1',
        role: 'user',
        content: '(小李 · 被 @ 激活)',
        source: 'collab',
      })

      const history = buildHistoryMessages([drive], {
        ...AGENT_SESSION,
        summary: '执行日志的摘要',
        summaryUpToMessageId: 'drive-1',
      })

      const text = history.map(entry => String(entry.content)).join('\n')
      expect(text).toContain('<msg from="用户">@小李 登录页什么时候能好?')
      expect(text).toContain('被 @ 激活')
      expect(text).not.toContain('执行日志的摘要')
    })

    it('reads nothing at all when no drive has pointed it at a room', () => {
      expect(buildHistoryMessages([
        message({ role: 'assistant', agentId: 'fe', content: '孤立记录', source: 'collab-turn' }),
      ], { id: 'agent-exec-fe', kind: 'agent', agentId: 'fe' })).toEqual([])
    })
  })

  it('leaves ordinary sessions untouched', () => {
    const messages = [
      message({ role: 'user', content: '你好' }),
      message({ role: 'system', content: '不该出现', source: 'collab-task' }),
      message({ role: 'assistant', content: '你好呀' }),
    ]
    const history = buildHistoryMessages(messages, { id: 's1', kind: 'chat' })
    expect(history).toEqual([
      { role: 'user', content: '你好' },
      { role: 'assistant', content: '你好呀' },
    ])
  })
})
