import { describe, expect, it } from 'vitest'
import {
  buildAssembledPromptDump,
  buildContinuationMessageLogLines,
  buildMessageBodyShapePayload,
  buildRequestEndLogLines,
  buildRequestStartLogLines,
  buildToolsDetailLogLines,
  buildTurnEndLogLine,
  chatLogContentTextLength,
  CoreChatTurnTimer,
  formatSkillNames,
  formatToolNames,
} from '@onething/core/engine'

describe('core chat logger helpers', () => {
  it('builds system prompt dump text without host file access', () => {
    expect(buildAssembledPromptDump({
      sessionId: 's1',
      providerId: 'deepseek',
      model: 'deepseek-chat',
      systemPrompt: 'You are helpful.',
      nowIso: '2026-06-25T00:00:00.000Z',
    })).toBe([
      '# 2026-06-25T00:00:00.000Z | deepseek | deepseek-chat | session s1',
      '# 16 chars',
      '',
      'You are helpful.',
    ].join('\n'))
  })

  it('summarizes request start lines from structural tool and skill data', () => {
    const lines = buildRequestStartLogLines({
      provider: 'deepseek',
      model: 'deepseek-chat',
      systemPromptLength: 42,
      messages: [
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'hi' },
      ],
      tools: {
        read: { description: 'Read files' },
        write: { description: 'Write files' },
      },
      skills: [
        { name: 'review', description: 'Review workflow', source: 'user' },
        { name: 'build', description: 'Build workflow', source: 'project' },
      ],
      hasTools: true,
    })

    expect(lines).toEqual(expect.arrayContaining([
      '[Chat] Provider: deepseek | Model: deepseek-chat',
      '[Chat] System Prompt: 42 chars',
      '[Chat] Messages: 2 (user: 1, assistant: 1)',
      '[Chat]    Sources: 1 user, 1 project, 0 plugin',
    ]))
    expect(lines.find(line => line.includes('Tools (2)'))).toContain('read, write')
    expect(lines.find(line => line.includes('Skills (2)'))).toContain('review, build')
  })

  it('computes message body shape rows and totals', () => {
    const payload = buildMessageBodyShapePayload([
      { role: 'user', content: [{ type: 'text', text: 'hello' }] },
      {
        role: 'assistant',
        content: 'answer',
        reasoningContent: 'thinking',
        toolCalls: [{ toolCallId: 'call_1', toolName: 'read', args: { path: 'a.txt' } }],
      },
      {
        role: 'tool',
        content: [{ type: 'tool-result', result: { ok: true } }],
      },
    ], { provider: 'deepseek' })

    expect(payload.provider).toBe('deepseek')
    expect(payload.messageCount).toBe(3)
    expect(payload.roleCounts).toEqual({ user: 1, assistant: 1, tool: 1 })
    expect(payload.rows).toEqual([
      expect.objectContaining({ role: 'user', contentChars: 5 }),
      expect.objectContaining({ role: 'assistant', toolCalls: 1, reasoningChars: 8 }),
      expect.objectContaining({ role: 'tool', toolResults: 1, resultChars: 11 }),
    ])
    expect(payload.totals.toolCalls).toBe(1)
    expect(payload.totals.toolResults).toBe(1)
  })

  it('formats turn, request end, continuation, and detail lines', () => {
    expect(buildTurnEndLogLine(2, {
      inputTokens: 100,
      outputTokens: 25,
      totalTokens: 125,
    }, 3, 5000)).toContain('25 out, 3 tools | 5.0 tok/s')

    expect(buildRequestEndLogLines(2, {
      inputTokens: 10,
      outputTokens: 4,
      totalTokens: 14,
    }, {
      inputTokens: 8,
      outputTokens: 4,
    })).toEqual(expect.arrayContaining([
      '[Chat] Duration: 2.00s',
      '[Chat] Total Tokens: 10 in, 4 out (2.0 tok/s)',
      '[Chat] Context Window: 8 in + 4 out = 12',
    ]))

    const continuation = buildContinuationMessageLogLines(
      1,
      'x'.repeat(120),
      [{ toolCallId: 'call_123456789', toolName: 'read', args: { path: 'a'.repeat(220) } }],
      [{ toolCallId: 'call_987654321', toolName: 'read', result: 'b'.repeat(320) }],
    )
    expect(continuation.find(line => line.includes('Assistant text'))).toContain('...')
    expect(continuation.find(line => line.includes('args:'))).toContain('...')
    expect(continuation.find(line => line.includes('result:'))).toContain('...')

    expect(buildToolsDetailLogLines({
      read: {
        description: 'Read files from disk',
        parameters: { properties: { path: { type: 'string' } } },
      },
    })).toContain('[Chat]     params: path')
  })

  it('keeps compact display helpers deterministic', () => {
    expect(chatLogContentTextLength([{ text: 'abc' }, { data: 'de' }])).toBe(5)
    expect(formatToolNames(['a', 'b', 'c'], 2)).toBe('a, b, ... (+1 more)')
    expect(formatSkillNames(['a', 'b', 'c'], 2)).toBe('a, b, ... (+1 more)')
  })

  it('tracks turn durations in core without host logger state', () => {
    let now = 1_000
    const timer = new CoreChatTurnTimer(() => now)

    expect(timer.startTurn(3)).toBe('[Chat] 🔄 Turn 3 starting...')
    now = 3_500
    expect(timer.endTurn(3, {
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 150,
    }, 2)).toBe('[Chat] ✓ Turn 3 complete: 100 in, 50 out, 2 tools | 20.0 tok/s')

    now = 10_000
    expect(timer.endTurn(3, {
      inputTokens: 1,
      outputTokens: 1,
      totalTokens: 2,
    }, 0)).toBe('[Chat] ✓ Turn 3 complete: 1 in, 1 out, 0 tools')
  })
})
