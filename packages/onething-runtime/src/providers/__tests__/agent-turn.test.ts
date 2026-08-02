import { describe, expect, it } from 'vitest'
import type {
  AgentProvider,
  AgentTurnRequest,
  AgentTurnStreamEvent,
} from '@onething/core/agent-loop'
import {
  generateWithOnethingDeepSeekAgent,
  runOnethingUtilityAgentTurn,
  streamOnethingDeepSeekAgentTurn,
  streamOnethingAgentProviderToolTurn,
  streamOnethingUtilityAgentTurn,
  type OnethingProviderRequestDumpContext,
} from '../agent-turn.js'

function fakeProvider(
  onRequest?: (request: AgentTurnRequest) => void,
): AgentProvider {
  return {
    id: 'fake',
    async *streamTurn(request) {
      onRequest?.(request)
      yield { type: 'reasoning-delta', turn: request.turn, delta: 'think' }
      yield { type: 'text-delta', turn: request.turn, delta: 'hello' }
      if (request.toolChoice === 'auto') {
        yield { type: 'tool-call-start', turn: request.turn, toolCallId: 'call_1', toolName: 'read' }
        yield { type: 'tool-call-delta', turn: request.turn, toolCallId: 'call_1', toolName: 'read', argumentsDelta: '{"path":"a' }
        yield { type: 'tool-call-delta', turn: request.turn, toolCallId: 'call_1', toolName: 'read', argumentsDelta: '.txt"}' }
        yield {
          type: 'tool-call-done',
          turn: request.turn,
          toolCall: {
            id: 'call_1',
            name: 'read',
            arguments: '{"path":"a.txt"}',
          },
        }
      }
      yield {
        type: 'finish',
        turn: request.turn,
        finishReason: request.toolChoice === 'auto' ? 'tool_calls' : 'stop',
        usage: { inputTokens: 3, outputTokens: 2, totalTokens: 5 },
      }
    },
  }
}

async function collect<T>(items: AsyncIterable<T>): Promise<T[]> {
  const result: T[] = []
  for await (const item of items) result.push(item)
  return result
}

function deepSeekResponse(lines: string[]): Response {
  return new Response([
    ...lines.map(line => `data: ${line}\n\n`),
    'data: [DONE]\n\n',
  ].join(''), {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  })
}

describe('onething provider agent turn runners', () => {
  it('runs utility agent turns through core agent-loop primitives', async () => {
    let request: AgentTurnRequest | undefined
    const dumps: OnethingProviderRequestDumpContext[] = []

    const result = await runOnethingUtilityAgentTurn({
      providerId: 'openai',
      provider: fakeProvider(next => { request = next }),
      config: { model: 'gpt-test' },
      messages: [
        { role: 'system', content: 'rules' },
        { role: 'user', content: 'hello' },
      ],
      mode: 'stream-reasoning',
      options: {
        temperature: 0.2,
        maxTokens: 123,
        thinking: true,
        thinkingEffort: 'xhigh',
        debugPurpose: 'test',
        debugSessionId: 'session_1',
      },
      onRequestPrepared(context) {
        dumps.push(context)
      },
    })

    expect(request).toMatchObject({
      model: 'gpt-test',
      toolChoice: 'none',
      maxTokens: 123,
      temperature: 0.2,
      thinking: 'enabled',
      reasoningEffort: 'max',
      turn: 1,
    })
    expect(dumps[0]).toMatchObject({
      providerId: 'openai',
      model: 'gpt-test',
      mode: 'stream-reasoning',
      metadata: {
        purpose: 'test',
        sessionId: 'session_1',
        transport: 'agent-provider',
      },
      requestBody: {
        model: 'gpt-test',
        stream: true,
        tool_choice: 'none',
        max_tokens: 123,
        thinking: 'enabled',
        reasoning_effort: 'max',
      },
    })
    expect(result).toEqual({
      text: 'hello',
      reasoning: 'think',
      toolCalls: undefined,
      // Carried out so side-line callers (title, memory) can bill the call —
      // the generate path used to drop it while the stream twin kept it.
      usage: { inputTokens: 3, outputTokens: 2, totalTokens: 5 },
    })
  })

  it('streams utility agent reasoning chunks', async () => {
    const chunks = await collect(streamOnethingUtilityAgentTurn({
      providerId: 'openai',
      provider: fakeProvider(),
      config: { model: 'gpt-test' },
      messages: [{ role: 'user', content: 'hello' }],
      mode: 'stream',
      options: { thinking: false },
    }))

    expect(chunks).toEqual([
      { type: 'text', text: '', reasoning: 'think' },
      { type: 'text', text: 'hello' },
      { type: 'finish', usage: { inputTokens: 3, outputTokens: 2, totalTokens: 5 } },
    ])
  })

  it('streams tool turns through provider stream chunk adapters', async () => {
    const dumps: OnethingProviderRequestDumpContext[] = []
    const chunks = await collect(streamOnethingAgentProviderToolTurn({
      providerId: 'openai',
      provider: fakeProvider(),
      config: { model: 'gpt-test' },
      messages: [{ role: 'user', content: 'read a file' }],
      tools: {
        read: {
          description: 'Read a file',
          parameters: [],
          parameterSchema: {
            type: 'object',
            properties: { path: { type: 'string' } },
          },
        },
      },
      options: {
        debugSessionId: 'session_1',
        debugTurn: 2,
      },
      onRequestPrepared(context) {
        dumps.push(context)
      },
    }))

    expect(dumps[0]).toMatchObject({
      providerId: 'openai',
      mode: 'stream-tools',
      metadata: {
        sessionId: 'session_1',
        turn: 2,
        originalMessageCount: 1,
        convertedMessageCount: 1,
        transport: 'agent-provider',
      },
      requestBody: {
        model: 'gpt-test',
        stream: true,
        tool_choice: 'auto',
      },
    })
    expect(chunks.map(chunk => chunk.type)).toEqual([
      'reasoning',
      'text',
      'tool-input-start',
      'tool-input-delta',
      'tool-input-delta',
      'tool-input-end',
      'finish',
    ])
  })

  it('generates DeepSeek agent turns from runtime without main provider glue', async () => {
    const dumps: OnethingProviderRequestDumpContext[] = []
    const fetchCalls: Array<{ url: string; body?: string }> = []
    const fetchImpl = async (input: Parameters<typeof globalThis.fetch>[0], init?: RequestInit) => {
      fetchCalls.push({
        url: typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url,
        body: typeof init?.body === 'string' ? init.body : undefined,
      })
      return deepSeekResponse([
        '{"choices":[{"index":0,"delta":{"reasoning_content":"think"}}]}',
        '{"choices":[{"index":0,"delta":{"content":"hello"}}]}',
        '{"usage":{"prompt_tokens":3,"completion_tokens":2,"total_tokens":5}}',
        '{"choices":[{"index":0,"finish_reason":"stop"}]}',
      ])
    }

    const result = await generateWithOnethingDeepSeekAgent({
      config: {
        apiKey: 'api-key',
        baseUrl: 'https://deepseek.test',
        model: 'deepseek-reasoner',
        fetchImpl,
      },
      messages: [{ role: 'user', content: 'hello' }],
      options: {
        temperature: 0.7,
        maxTokens: 321,
        thinking: true,
        thinkingEffort: 'xhigh',
        debugSessionId: 'session_1',
      },
      onRequestPrepared(context) {
        dumps.push(context)
      },
    })

    // usage 随行(2026-08-02):旁路调用(意愿判定、标题、摘要)全靠
    // `if (result.usage) onUsage(...)` 计费,而这条 generate 路径此前把它丢在
    // 最后一步 —— 于是走它的整类开销在账本上一条都不留(真机实证:
    // `collab-willingness` 从标签存在至今零记录,而判定一直在跑)。
    expect(result).toEqual({
      text: 'hello',
      reasoning: 'think',
      usage: { inputTokens: 3, outputTokens: 2, totalTokens: 5 },
    })
    expect(dumps[0]).toMatchObject({
      providerId: 'deepseek',
      model: 'deepseek-reasoner',
      mode: 'stream-reasoning',
      metadata: {
        sessionId: 'session_1',
        transport: 'deepseek-agent',
      },
      requestBody: {
        model: 'deepseek-reasoner',
        stream: true,
        stream_options: { include_usage: true },
        max_tokens: 321,
        thinking: { type: 'enabled' },
        reasoning_effort: 'max',
      },
    })
    const requestBody = JSON.parse(fetchCalls[0].body ?? '{}')
    expect(fetchCalls[0].url).toBe('https://deepseek.test/chat/completions')
    expect(requestBody.temperature).toBeUndefined()
    expect(requestBody.thinking).toEqual({ type: 'enabled' })
  })

  it('streams DeepSeek tool turns through runtime runner', async () => {
    const dumps: OnethingProviderRequestDumpContext[] = []
    const fetchImpl = async () => deepSeekResponse([
      '{"choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"read","arguments":"{\\"path\\":\\"a"}}]}}]}',
      '{"choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":".txt\\"}"}}]}}]}',
      '{"usage":{"prompt_tokens":3,"completion_tokens":2,"total_tokens":5}}',
      '{"choices":[{"index":0,"finish_reason":"tool_calls"}]}',
    ])

    const chunks = await collect(streamOnethingDeepSeekAgentTurn({
      config: {
        apiKey: 'api-key',
        baseUrl: 'https://deepseek.test',
        model: 'deepseek-chat',
        fetchImpl,
      },
      messages: [{ role: 'user', content: 'read file' }],
      tools: {
        read: {
          description: 'Read a file',
          parameters: [],
          parameterSchema: { type: 'object', properties: { path: { type: 'string' } } },
        },
      },
      options: {
        debugSessionId: 'session_1',
        debugTurn: 2,
      },
      metadata: {
        originalMessageCount: 1,
      },
      onRequestPrepared(context) {
        dumps.push(context)
      },
    }))

    expect(dumps[0]).toMatchObject({
      providerId: 'deepseek',
      mode: 'stream-tools',
      metadata: {
        originalMessageCount: 1,
        sessionId: 'session_1',
        turn: 2,
        transport: 'deepseek-agent',
      },
      requestBody: {
        model: 'deepseek-chat',
        stream: true,
        tool_choice: 'auto',
      },
    })
    expect(chunks.map(chunk => chunk.type)).toEqual([
      'tool-input-start',
      'tool-input-delta',
      'tool-input-delta',
      'tool-input-end',
      'finish',
    ])
  })
})
