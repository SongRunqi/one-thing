import { describe, expect, it } from 'vitest'
import {
  buildCompactedToolResultContent,
  buildDegradedToolResultContent,
  buildHistoryMessages,
  buildResumeHistoryAfterToolConfirmation,
  degradeToolArgsForAI,
  filterHistoryForNonToolAPI,
  getHistoryProviderData,
  getMessageReasoningContent,
  historyMessagesForLog,
  sanitizeToolResultForAI,
  selectCompactedRecentMessagesForPrompt,
  type CoreHistoryMessage,
  type CoreHistoryChatMessage,
} from '@onething/core/engine'
import { providerDataFromOnethingContentPart } from '@onething/runtime/agent-loop/providers'

describe('core resume history', () => {
  it('appends the paused assistant tool call and confirmed tool result messages', () => {
    const history: CoreHistoryMessage[] = [
      { role: 'user', content: 'delete tmp' },
    ]

    expect(buildResumeHistoryAfterToolConfirmation(history, {
      content: 'I need to run a command.',
      reasoning: 'The user asked for cleanup.',
      toolCalls: [
        {
          id: 'call_1',
          toolId: 'bash',
          toolName: 'Bash',
          arguments: { cmd: 'rm -rf tmp' },
          status: 'completed',
          result: { output: 'removed', originalContent: 'secret' },
        },
        {
          id: 'call_2',
          toolId: 'write',
          toolName: 'Write',
          arguments: { path: '/tmp/a.txt' },
          status: 'failed',
          error: 'Denied',
        },
      ],
    })).toEqual([
      { role: 'user', content: 'delete tmp' },
      {
        role: 'assistant',
        content: 'I need to run a command.',
        reasoningContent: 'The user asked for cleanup.',
        toolCalls: [
          {
            toolCallId: 'call_1',
            toolName: 'bash',
            args: { cmd: 'rm -rf tmp' },
          },
          {
            toolCallId: 'call_2',
            toolName: 'write',
            args: { path: '/tmp/a.txt' },
          },
        ],
      },
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'call_1',
            toolName: 'bash',
            result: { output: 'removed' },
          },
          {
            type: 'tool-result',
            toolCallId: 'call_2',
            toolName: 'write',
            result: { error: 'Denied' },
          },
        ],
      },
    ])
  })

  it('sanitizes internal diff payload fields recursively', () => {
    expect(sanitizeToolResultForAI({
      ok: true,
      originalContent: 'before',
      nested: {
        originalContentHash: 'hash',
        value: 'kept',
      },
    })).toEqual({
      ok: true,
      nested: {
        value: 'kept',
      },
    })
  })

  it('caps compacted recent history and summarizes oversized tool results', () => {
    const recent = [
      { id: 'old', role: 'user', content: 'old'.repeat(100) },
      { id: 'middle', role: 'assistant', content: 'middle'.repeat(100) },
      { id: 'latest', role: 'user', content: 'latest'.repeat(100) },
    ]
    const plan = selectCompactedRecentMessagesForPrompt(recent, 1500)

    expect(plan.retainedMessages.map(message => message.id)).toEqual(['middle', 'latest'])
    expect(plan.droppedMessages.map(message => message.id)).toEqual(['old'])
    expect(plan.degradedMessageIds.size).toBe(0)

    const result = buildCompactedToolResultContent([{
      id: 'call_1',
      toolId: 'read',
      toolName: 'read',
      arguments: { path: '/tmp/large.txt' },
      status: 'completed',
      result: {
        title: 'Read large file',
        output: 'x'.repeat(80_000),
      },
    }])

    expect(result).toMatchObject([{
      toolCallId: 'call_1',
      toolName: 'read',
      result: {
        truncated: true,
        title: 'Read large file',
        originalChars: expect.any(Number),
      },
    }])
  })

  it('budgets the compacted tail at sent-form size, not raw in-memory size', () => {
    // Raw JSON is huge (steps duplicate the tool result), but the sent form
    // caps the result at 24k — the message must be retained at full fidelity.
    const fatResult = { output: 'x'.repeat(200_000) }
    const recent: CoreHistoryChatMessage[] = [
      { id: 'u1', role: 'user', content: 'question' },
      {
        id: 'a1',
        role: 'assistant',
        content: 'answer',
        toolCalls: [{
          id: 'call_1',
          toolId: 'read',
          toolName: 'read',
          arguments: { path: '/tmp/f' },
          status: 'completed',
          result: fatResult,
        }],
        steps: [{ toolCallId: 'call_1', turnIndex: 1 }],
      },
      { id: 'u2', role: 'user', content: 'follow-up' },
    ]

    const plan = selectCompactedRecentMessagesForPrompt(recent, 100_000)
    expect(plan.retainedMessages.map(message => message.id)).toEqual(['u1', 'a1', 'u2'])
    expect(plan.degradedMessageIds.size).toBe(0)
    expect(plan.droppedMessages).toEqual([])
  })

  it('degrades over-budget assistant messages instead of dropping them', () => {
    const fatToolCall = (id: string) => ({
      id,
      toolId: 'bash',
      toolName: 'bash',
      arguments: { cmd: 'grep something' },
      status: 'completed' as const,
      result: { title: 'grep output', output: 'y'.repeat(30_000) },
    })
    const recent: CoreHistoryChatMessage[] = [
      { id: 'u1', role: 'user', content: 'first question' },
      {
        id: 'a1',
        role: 'assistant',
        content: 'first answer',
        toolCalls: [fatToolCall('call_a1')],
      },
      { id: 'u2', role: 'user', content: 'second question' },
      {
        id: 'a2',
        role: 'assistant',
        content: 'second answer',
        toolCalls: [fatToolCall('call_a2')],
      },
      { id: 'u3', role: 'user', content: 'latest question' },
    ]

    // Budget below one full-fidelity assistant (each estimates ~24k after the
    // per-result cap) — a1/a2 must degrade, not vanish. No holes: every user
    // message keeps its assistant reply.
    const plan = selectCompactedRecentMessagesForPrompt(recent, 20_000)
    expect(plan.retainedMessages.map(message => message.id)).toEqual(['u1', 'a1', 'u2', 'a2', 'u3'])
    expect([...plan.degradedMessageIds].sort()).toEqual(['a1', 'a2'])
    expect(plan.droppedMessages).toEqual([])
  })

  it('drops only a contiguous oldest prefix when even skeletons overflow', () => {
    const recent: CoreHistoryChatMessage[] = [
      { id: 'u1', role: 'user', content: 'z'.repeat(2_000) },
      { id: 'a1', role: 'assistant', content: 'z'.repeat(2_000) },
      { id: 'u2', role: 'user', content: 'z'.repeat(2_000) },
      { id: 'a2', role: 'assistant', content: 'z'.repeat(2_000) },
      { id: 'latest', role: 'user', content: 'z'.repeat(2_000) },
    ]

    const plan = selectCompactedRecentMessagesForPrompt(recent, 5_000)
    // Whatever fits, the dropped set must be a prefix — never a hole.
    const retainedIds = plan.retainedMessages.map(message => message.id)
    const droppedIds = plan.droppedMessages.map(message => message.id)
    expect([...droppedIds, ...retainedIds]).toEqual(['u1', 'a1', 'u2', 'a2', 'latest'])
    expect(retainedIds).toContain('latest')
    expect(droppedIds.length).toBeGreaterThan(0)
  })

  it('truncates over-budget tool args and placeholders results in degraded form', () => {
    const fatArgs = { content: 'w'.repeat(10_000) }
    expect(degradeToolArgsForAI(fatArgs)).toMatchObject({
      truncated: true,
      originalChars: expect.any(Number),
      preview: expect.any(String),
    })
    expect(degradeToolArgsForAI({ cmd: 'ls' })).toEqual({ cmd: 'ls' })

    const content = buildDegradedToolResultContent([
      {
        id: 'call_ok',
        toolId: 'edit',
        toolName: 'edit',
        arguments: fatArgs,
        status: 'completed',
        result: { title: 'Edited file', output: 'v'.repeat(60_000) },
      },
      {
        id: 'call_bad',
        toolId: 'bash',
        toolName: 'bash',
        arguments: { cmd: 'false' },
        status: 'failed',
        error: 'exit 1',
      },
    ])
    expect(content).toMatchObject([
      {
        toolCallId: 'call_ok',
        toolName: 'edit',
        result: { truncated: true, title: 'Edited file' },
      },
      {
        toolCallId: 'call_bad',
        toolName: 'bash',
        result: { error: 'exit 1' },
      },
    ])
    // Placeholder must not carry the fat output preview.
    expect(JSON.stringify(content[0]).length).toBeLessThan(2_000)
  })

  it('renders the degraded skeleton end to end when the tail overflows the real budget', () => {
    // Each assistant message estimates ~100k in sent form (4 results hitting
    // the 24k per-result cap, capped again at 80k per message, plus args);
    // five of them overflow the 300k default budget, so the oldest ones must
    // ship degraded — never dropped.
    const fatAssistant = (id: string): CoreHistoryChatMessage => ({
      id,
      role: 'assistant',
      content: `answer ${id}`,
      toolCalls: Array.from({ length: 4 }, (_, callIndex) => ({
        id: `${id}-c${callIndex}`,
        toolId: 'read',
        toolName: 'read',
        arguments: { path: `/tmp/${id}-${callIndex}`, filler: 'w'.repeat(5_000) },
        status: 'completed' as const,
        result: { title: `Read ${id}-${callIndex}`, output: 'v'.repeat(90_000) },
      })),
    })
    const messages: CoreHistoryChatMessage[] = [
      { id: 'anchor', role: 'user', content: 'anchor' },
    ]
    for (let index = 1; index <= 5; index++) {
      messages.push({ id: `u${index}`, role: 'user', content: `question ${index}` })
      messages.push(fatAssistant(`a${index}`))
    }
    messages.push({ id: 'latest', role: 'user', content: 'latest question' })

    let loggedDetails: { degradedRecentMessages: number; droppedRecentMessages: number } | undefined
    const result = buildHistoryMessages(
      messages,
      { id: 's1', summary: 'summary text', summaryUpToMessageId: 'anchor' },
      {
        buildMessageContent: message => message.content ?? '',
        onCompactedHistory: details => {
          loggedDetails = details
        },
      },
    )

    expect(loggedDetails?.degradedRecentMessages).toBeGreaterThan(0)
    expect(loggedDetails?.droppedRecentMessages).toBe(0)

    // Structure is intact: every question keeps its assistant reply.
    const textOf = (content: unknown): string => typeof content === 'string' ? content : ''
    const assistantTexts = result
      .filter(message => message.role === 'assistant')
      .map(message => textOf(message.content))
    for (let index = 1; index <= 5; index++) {
      expect(assistantTexts.some(text => text.includes(`answer a${index}`))).toBe(true)
    }

    // The oldest assistant ships as a skeleton: tool call retained, args
    // truncated, result placeholdered — and the request stays bounded.
    const a1 = result.find(
      (message): message is Extract<CoreHistoryMessage, { role: 'assistant' }> =>
        message.role === 'assistant' && textOf(message.content).includes('answer a1'),
    )
    expect(a1?.toolCalls?.[0]).toMatchObject({ toolCallId: 'a1-c0' })
    expect(a1?.toolCalls?.[0]?.args).toMatchObject({ truncated: true })
    const a1Results = result.find(
      (message): message is Extract<CoreHistoryMessage, { role: 'tool' }> =>
        message.role === 'tool' &&
        message.content.some(entry => entry.toolCallId === 'a1-c0'),
    )
    expect(a1Results?.content[0]?.result).toMatchObject({ truncated: true })
    expect(JSON.stringify(result).length).toBeLessThan(400_000)
  })

  it('extracts reasoning fragments and strips tool messages for non-tool APIs', () => {
    expect(getHistoryProviderData({
      id: 'm1',
      role: 'assistant',
      contentParts: [
        { type: 'provider-data', providerData: { provider: 'codex', type: 'encrypted-reasoning', encryptedContent: 'secret' } },
      ],
    })).toEqual([{ provider: 'codex', type: 'encrypted-reasoning', encryptedContent: 'secret' }])

    expect(getHistoryProviderData({
      id: 'm1-legacy',
      role: 'assistant',
      contentParts: [
        { type: 'provider-data', provider: 'codex', encryptedReasoning: 'legacy-secret' },
      ],
    }, {
      providerDataFromContentPart: providerDataFromOnethingContentPart,
    })).toEqual([{ provider: 'codex', type: 'encrypted-reasoning', encryptedContent: 'legacy-secret' }])

    expect(getMessageReasoningContent({
      id: 'm2',
      role: 'assistant',
      reasoning: 'think',
      contentParts: [
        { type: 'reasoning', content: 'think' },
        { type: 'reasoning', content: 'more' },
      ],
    })).toBe('think\n\nmore')

    expect(filterHistoryForNonToolAPI([
      { role: 'user', content: 'hello' },
      { role: 'tool', content: [] },
      { role: 'assistant', content: 'hi', reasoningContent: 'because' },
    ])).toEqual([
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi', reasoningContent: 'because' },
    ])

    expect(historyMessagesForLog([
      { role: 'user', content: 'hello' },
      {
        role: 'assistant',
        content: 'working',
        reasoningContent: 'because',
        toolCalls: [{ toolCallId: 'call_1', toolName: 'read', args: { path: '/tmp/a.txt' } }],
      },
      {
        role: 'tool',
        content: [{ type: 'tool-result', toolCallId: 'call_1', toolName: 'read', result: { output: 'ok' } }],
      },
    ])).toEqual([
      { role: 'user', content: 'hello' },
      {
        role: 'assistant',
        content: 'working',
        reasoningContent: 'because',
        toolCalls: [{ toolCallId: 'call_1', toolName: 'read', args: { path: '/tmp/a.txt' } }],
      },
      {
        role: 'tool',
        content: [{ type: 'tool-result', toolCallId: 'call_1', toolName: 'read', result: { output: 'ok' } }],
      },
    ])
  })

  it('builds provider history with reasoning and tool result context in core', () => {
    const messages: CoreHistoryChatMessage[] = [
      { id: 'u1', role: 'user', content: 'hello' },
      { id: 'skip-streaming', role: 'assistant', content: 'typing', isStreaming: true },
      { id: 'skip-empty', role: 'assistant', content: '' },
      {
        id: 'a1',
        role: 'assistant',
        content: 'I will read it.',
        reasoning: 'Need file contents.',
        contentParts: [
          { type: 'provider-data', provider: 'codex', encryptedReasoning: 'encrypted' },
        ],
        toolCalls: [
          {
            id: 'call_1',
            toolId: 'read',
            toolName: 'Read',
            arguments: { path: '/tmp/a.txt' },
            status: 'completed',
            result: { output: 'ok', originalContent: 'hidden' },
          },
          {
            id: 'call_2',
            toolId: 'bash',
            toolName: 'Bash',
            arguments: { cmd: 'false' },
            status: 'failed',
            error: 'Nope',
          },
        ],
      },
    ]

    expect(buildHistoryMessages(messages, undefined, {
      buildMessageContent: message => `content:${message.id}`,
      getAIToolName: name => `ai:${name}`,
      failureResultForAI: toolCall => ({ error: `failed:${toolCall.error}` }),
      providerDataFromContentPart: providerDataFromOnethingContentPart,
    })).toEqual([
      { role: 'user', content: 'content:u1' },
      {
        role: 'assistant',
        content: 'content:a1',
        reasoningContent: 'Need file contents.',
        providerData: [{ provider: 'codex', type: 'encrypted-reasoning', encryptedContent: 'encrypted' }],
        toolCalls: [
          { toolCallId: 'call_1', toolName: 'ai:read', args: { path: '/tmp/a.txt' } },
          { toolCallId: 'call_2', toolName: 'ai:bash', args: { cmd: 'false' } },
        ],
      },
      {
        role: 'tool',
        content: [
          { type: 'tool-result', toolCallId: 'call_1', toolName: 'ai:read', result: { output: 'ok' } },
          { type: 'tool-result', toolCallId: 'call_2', toolName: 'ai:bash', result: { error: 'failed:Nope' } },
        ],
      },
    ])
  })

  it('builds compacted provider history and reports retained-message metadata in core', () => {
    const messages: CoreHistoryChatMessage[] = [
      { id: 'u1', role: 'user', content: 'old' },
      { id: 'a1', role: 'assistant', content: 'anchor' },
      {
        id: 'a2',
        role: 'assistant',
        content: 'recent',
        contentParts: [
          { type: 'provider-data', provider: 'codex', encryptedReasoning: 'kept-only-on-latest' },
        ],
      },
    ]
    const compactedLogs: unknown[] = []

    const history = buildHistoryMessages(messages, {
      id: 's1',
      summary: 'Earlier summary',
      summaryUpToMessageId: 'a1',
    }, {
      buildMessageContent: message => `content:${message.id}`,
      providerDataFromContentPart: providerDataFromOnethingContentPart,
      onCompactedHistory: details => compactedLogs.push(details),
    })

    expect(history).toEqual([
      {
        role: 'user',
        content: '[Conversation History Summary]\nEarlier summary\n\nPlease continue the conversation based on the above context.',
      },
      {
        role: 'assistant',
        content: 'Understood. I have reviewed the previous conversation context. Please continue.',
      },
      {
        role: 'assistant',
        content: 'content:a2',
        providerData: [{ provider: 'codex', type: 'encrypted-reasoning', encryptedContent: 'kept-only-on-latest' }],
      },
    ])
    expect(compactedLogs).toHaveLength(1)
    expect(compactedLogs[0]).toMatchObject({
      sessionId: 's1',
      summaryUpToMessageId: 'a1',
      summaryIndex: 1,
      totalSessionMessages: 3,
      recentSessionMessages: 1,
      retainedRecentMessages: 1,
      droppedRecentMessages: 0,
      summaryChars: 'Earlier summary'.length,
    })
  })
})
