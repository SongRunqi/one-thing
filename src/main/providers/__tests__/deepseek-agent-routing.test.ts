import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { fetchHolder, aiMocks } = vi.hoisted(() => ({
  fetchHolder: {
    current: undefined as unknown as typeof globalThis.fetch,
  },
  aiMocks: {
    generateText: vi.fn(() => {
      throw new Error('AI SDK generateText should not be called for DeepSeek')
    }),
    streamText: vi.fn(() => {
      throw new Error('AI SDK streamText should not be called for DeepSeek')
    }),
    convertToModelMessages: vi.fn(() => {
      throw new Error('AI SDK convertToModelMessages should not be called for DeepSeek')
    }),
    jsonSchema: vi.fn((schema: unknown) => schema),
  },
}))

vi.mock('ai', () => ({
  generateText: aiMocks.generateText,
  streamText: aiMocks.streamText,
  convertToModelMessages: aiMocks.convertToModelMessages,
  jsonSchema: aiMocks.jsonSchema,
}))

vi.mock('../bound-fetch.js', () => ({
  createRequiredAppFetch: () => fetchHolder.current,
}))

import {
  generateChatResponse,
  streamChatResponseWithReasoning,
  streamChatResponseWithTools,
} from '../index.js'

function streamResponse(chunks: string[]): Response {
  const encoder = new TextEncoder()
  return new Response(new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk))
      }
      controller.close()
    },
  }), { status: 200 })
}

function sse(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`
}

describe('DeepSeek provider agent routing', () => {
  const previousDumpEnv = process.env.ONETHING_DUMP_PROVIDER_REQUESTS

  beforeEach(() => {
    process.env.ONETHING_DUMP_PROVIDER_REQUESTS = '0'
    vi.clearAllMocks()
    fetchHolder.current = vi.fn(async () => new Response('', { status: 500 })) as unknown as typeof globalThis.fetch
  })

  afterEach(() => {
    if (previousDumpEnv === undefined) {
      delete process.env.ONETHING_DUMP_PROVIDER_REQUESTS
    } else {
      process.env.ONETHING_DUMP_PROVIDER_REQUESTS = previousDumpEnv
    }
  })

  it('generates DeepSeek utility responses through the agent provider without the AI SDK', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(streamResponse([
      sse({
        choices: [{ index: 0, delta: { reasoning_content: 'think ' }, finish_reason: null }],
      }),
      sse({
        choices: [{ index: 0, delta: { content: 'capture-json' }, finish_reason: 'stop' }],
      }),
      sse({
        choices: [],
        usage: { prompt_tokens: 11, completion_tokens: 2, total_tokens: 13 },
      }),
      'data: [DONE]\n\n',
    ])) as unknown as typeof globalThis.fetch
    fetchHolder.current = fetchImpl

    const text = await generateChatResponse(
      'deepseek',
      {
        apiKey: 'test-key',
        baseUrl: 'https://deepseek.test',
        model: 'deepseek-v4-flash',
      },
      [
        { role: 'system', content: 'daily note planner' },
        { role: 'user', content: 'Current daily note' },
      ],
      { temperature: 0.1, maxTokens: 900 },
    )

    expect(text).toBe('capture-json')
    expect(aiMocks.generateText).not.toHaveBeenCalled()
    expect(aiMocks.streamText).not.toHaveBeenCalled()
    expect(aiMocks.convertToModelMessages).not.toHaveBeenCalled()

    const body = JSON.parse((fetchImpl as any).mock.calls[0][1].body)
    expect((fetchImpl as any).mock.calls[0][0]).toBe('https://deepseek.test/chat/completions')
    expect(body.model).toBe('deepseek-v4-flash')
    expect(body.max_tokens).toBe(900)
    expect(body.thinking).toEqual({ type: 'enabled' })
    expect(body.temperature).toBeUndefined()
    expect(body.messages).toEqual([
      { role: 'system', content: 'daily note planner' },
      { role: 'user', content: 'Current daily note' },
    ])
  })

  it('streams DeepSeek tool turns through the agent provider without the AI SDK', async () => {
    const toolArgs = JSON.stringify({ path: '/tmp/example.txt' })
    const fetchImpl = vi.fn().mockResolvedValue(streamResponse([
      sse({
        choices: [{ index: 0, delta: { reasoning_content: 'inspect ' }, finish_reason: null }],
      }),
      sse({
        choices: [{
          index: 0,
          delta: {
            tool_calls: [{
              index: 0,
              id: 'call_1',
              type: 'function',
              function: { name: 'read', arguments: toolArgs },
            }],
          },
          finish_reason: null,
        }],
      }),
      sse({
        choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }],
      }),
      sse({
        choices: [],
        usage: { prompt_tokens: 20, completion_tokens: 7, total_tokens: 27 },
      }),
      'data: [DONE]\n\n',
    ])) as unknown as typeof globalThis.fetch
    fetchHolder.current = fetchImpl

    const chunks = []
    for await (const chunk of streamChatResponseWithTools(
      'deepseek',
      {
        apiKey: 'test-key',
        baseUrl: 'https://deepseek.test',
        model: 'deepseek-v4-pro',
      },
      [{ role: 'user', content: 'read the file' }],
      {
        read: {
          description: 'Read a file',
          parameters: [{
            name: 'path',
            type: 'string',
            description: 'File path',
            required: true,
          }],
        },
      },
      {
        maxTokens: 100,
        thinking: true,
        thinkingEffort: 'max',
        debugSessionId: 'session-1',
        debugTurn: 3,
      },
    )) {
      chunks.push(chunk)
    }

    expect(aiMocks.generateText).not.toHaveBeenCalled()
    expect(aiMocks.streamText).not.toHaveBeenCalled()
    expect(aiMocks.convertToModelMessages).not.toHaveBeenCalled()
    expect(chunks).toContainEqual({ type: 'reasoning', reasoning: 'inspect ' })
    expect(chunks).toContainEqual({
      type: 'tool-input-start',
      toolInputStart: { toolCallId: 'call_1', toolName: 'read' },
    })
    expect(chunks).toContainEqual({
      type: 'tool-input-delta',
      toolInputDelta: { toolCallId: 'call_1', argsTextDelta: toolArgs },
    })
    expect(chunks).toContainEqual({
      type: 'tool-input-end',
      toolInputEnd: { toolCallId: 'call_1' },
    })
    expect(chunks.at(-1)).toEqual({
      type: 'finish',
      finishReason: 'tool-calls',
      usage: { inputTokens: 20, outputTokens: 7, totalTokens: 27 },
    })

    const body = JSON.parse((fetchImpl as any).mock.calls[0][1].body)
    expect(body.tools[0].function.name).toBe('read')
    expect(body.tool_choice).toBe('auto')
    expect(body.thinking).toEqual({ type: 'enabled' })
    expect(body.reasoning_effort).toBe('max')
    expect(body.temperature).toBeUndefined()
  })

  it('streams DeepSeek reasoning responses through the agent provider without the AI SDK', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(streamResponse([
      sse({
        choices: [{ index: 0, delta: { reasoning_content: 'plan ' }, finish_reason: null }],
      }),
      sse({
        choices: [{ index: 0, delta: { content: 'answer' }, finish_reason: 'stop' }],
      }),
      sse({
        choices: [],
        usage: { prompt_tokens: 8, completion_tokens: 3, total_tokens: 11 },
      }),
      'data: [DONE]\n\n',
    ])) as unknown as typeof globalThis.fetch
    fetchHolder.current = fetchImpl

    const chunks = []
    for await (const chunk of streamChatResponseWithReasoning(
      'deepseek',
      {
        apiKey: 'test-key',
        baseUrl: 'https://deepseek.test',
        model: 'deepseek-reasoner',
      },
      [{ role: 'user', content: 'think' }],
      { maxTokens: 50 },
    )) {
      chunks.push(chunk)
    }

    expect(aiMocks.generateText).not.toHaveBeenCalled()
    expect(aiMocks.streamText).not.toHaveBeenCalled()
    expect(aiMocks.convertToModelMessages).not.toHaveBeenCalled()
    expect(chunks).toEqual([
      { type: 'text', text: '', reasoning: 'plan ' },
      { type: 'text', text: 'answer' },
      {
        type: 'finish',
        usage: { inputTokens: 8, outputTokens: 3, totalTokens: 11 },
      },
    ])

    const body = JSON.parse((fetchImpl as any).mock.calls[0][1].body)
    expect(body.model).toBe('deepseek-reasoner')
    expect(body.thinking).toEqual({ type: 'enabled' })
    expect(body.max_tokens).toBe(50)
  })
})
