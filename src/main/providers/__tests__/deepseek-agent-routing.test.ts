import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Mock } from 'vitest'
import { toJsonObject, type JsonObject, type JsonValue } from '../../../shared/json.js'

type FetchMock = ReturnType<typeof vi.fn<typeof globalThis.fetch>>
type ThrowingAIMock = Mock<() => never>
type JsonSchemaMock = Mock<(schema: JsonValue) => JsonValue>
type AsyncIterableValue<T> = T extends AsyncIterable<infer Value> ? Value : never
type SimpleStreamChunk = AsyncIterableValue<ReturnType<typeof streamChatResponse>>
type ReasoningStreamChunk = AsyncIterableValue<ReturnType<typeof streamChatResponseWithReasoning>>
type ToolStreamChunk = AsyncIterableValue<ReturnType<typeof streamChatResponseWithTools>>
type UIMessageStreamChunk = AsyncIterableValue<ReturnType<typeof streamChatWithUIMessages>>

const { fetchHolder, aiMocks } = vi.hoisted((): {
  fetchHolder: { current: typeof globalThis.fetch }
  aiMocks: {
    generateText: ThrowingAIMock
    streamText: ThrowingAIMock
    convertToModelMessages: ThrowingAIMock
    jsonSchema: JsonSchemaMock
  }
} => ({
  fetchHolder: {
    current: async () => new Response('', { status: 500 }),
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
    jsonSchema: vi.fn((schema: JsonValue): JsonValue => schema),
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
  streamChatResponse,
  streamChatResponseWithReasoning,
  streamChatResponseWithTools,
  streamChatWithUIMessages,
} from '../index.js'
import { registerAgentProviderRuntime } from '../../agent-loop/index.js'
import type { AgentTurn, AgentTurnRequest } from '../../agent-loop/index.js'

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

function sse(payload: JsonValue): string {
  return `data: ${JSON.stringify(payload)}\n\n`
}

function mockFetchResponse(response: Response): FetchMock {
  return vi.fn<typeof globalThis.fetch>(async () => response)
}

function headersRecord(headers: HeadersInit | undefined): Record<string, string> {
  if (!headers) return {}
  if (headers instanceof Headers) {
    const record: Record<string, string> = {}
    headers.forEach((value, key) => {
      record[key] = value
    })
    return record
  }
  if (Array.isArray(headers)) {
    return Object.fromEntries(headers)
  }
  return { ...headers }
}

function requestUrl(input: Parameters<typeof globalThis.fetch>[0]): string {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.toString()
  return input.url
}

function parseRequestBody(body: BodyInit | null | undefined): JsonObject {
  if (typeof body !== 'string') return {}
  return toJsonObject(JSON.parse(body) as JsonValue)
}

function jsonArrayField(object: JsonObject, key: string): JsonValue[] {
  const value = object[key]
  return Array.isArray(value) ? value : []
}

function jsonObjectField(object: JsonObject, key: string): JsonObject {
  return toJsonObject(object[key])
}

function jsonObjectAt(values: JsonValue[], index: number): JsonObject {
  return toJsonObject(values[index])
}

function firstFetchCall(fetchImpl: FetchMock) {
  const call = fetchImpl.mock.calls[0]
  if (!call) throw new Error('Expected fetch to have been called')
  const [input, init] = call
  return {
    url: requestUrl(input),
    init,
    headers: headersRecord(init?.headers),
    body: parseRequestBody(init?.body),
  }
}

function withTimeout<T>(promise: Promise<T>, message = 'timed out waiting for abort'): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(message)), 100)),
  ])
}

describe('DeepSeek provider agent routing', () => {
  const previousDumpEnv = process.env.ONETHING_DUMP_PROVIDER_REQUESTS

  beforeEach(() => {
    process.env.ONETHING_DUMP_PROVIDER_REQUESTS = '0'
    vi.clearAllMocks()
    fetchHolder.current = mockFetchResponse(new Response('', { status: 500 }))
  })

  afterEach(() => {
    if (previousDumpEnv === undefined) {
      delete process.env.ONETHING_DUMP_PROVIDER_REQUESTS
    } else {
      process.env.ONETHING_DUMP_PROVIDER_REQUESTS = previousDumpEnv
    }
  })

  it('requires an agent runtime for utility generation', async () => {
    await expect(generateChatResponse(
      'legacy-only',
      { model: 'legacy-model' },
      [{ role: 'user', content: 'hello' }],
    )).rejects.toThrow('Provider legacy-only does not have an AgentProvider runtime for generate.')

    expect(aiMocks.generateText).not.toHaveBeenCalled()
    expect(aiMocks.streamText).not.toHaveBeenCalled()
    expect(aiMocks.convertToModelMessages).not.toHaveBeenCalled()
  })

  it('generates DeepSeek utility responses through the agent provider without the AI SDK', async () => {
    const fetchImpl = mockFetchResponse(streamResponse([
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
    ]))
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

    const request = firstFetchCall(fetchImpl)
    const body = request.body
    expect(request.url).toBe('https://deepseek.test/chat/completions')
    expect(body.model).toBe('deepseek-v4-flash')
    expect(body.max_tokens).toBe(900)
    expect(body.thinking).toEqual({ type: 'enabled' })
    expect(body.temperature).toBeUndefined()
    expect(body.messages).toEqual([
      { role: 'system', content: 'daily note planner' },
      { role: 'user', content: 'Current daily note' },
    ])
  })

  it('generates OpenAI-compatible utility responses through the agent provider without the AI SDK', async () => {
    const fetchImpl = mockFetchResponse(streamResponse([
      sse({
        choices: [{ index: 0, delta: { content: 'native ' }, finish_reason: null }],
      }),
      sse({
        choices: [{ index: 0, delta: { content: 'response' }, finish_reason: 'stop' }],
      }),
      sse({
        choices: [],
        usage: { prompt_tokens: 7, completion_tokens: 2, total_tokens: 9 },
      }),
      'data: [DONE]\n\n',
    ]))
    fetchHolder.current = fetchImpl

    const text = await generateChatResponse(
      'openai',
      {
        apiKey: 'openai-key',
        baseUrl: 'https://openai.test/v1',
        model: 'gpt-test',
      },
      [
        { role: 'system', content: 'utility rules' },
        { role: 'user', content: 'summarize' },
      ],
      { temperature: 0.2, maxTokens: 123 },
    )

    expect(text).toBe('native response')
    expect(aiMocks.generateText).not.toHaveBeenCalled()
    expect(aiMocks.streamText).not.toHaveBeenCalled()
    expect(aiMocks.convertToModelMessages).not.toHaveBeenCalled()

    const request = firstFetchCall(fetchImpl)
    const body = request.body
    expect(request.url).toBe('https://openai.test/v1/chat/completions')
    expect(request.headers.Authorization).toBe('Bearer openai-key')
    expect(body).toMatchObject({
      model: 'gpt-test',
      stream: true,
      stream_options: { include_usage: true },
      max_completion_tokens: 123,
      temperature: 0.2,
    })
    expect(body.tools).toBeUndefined()
    expect(body.tool_choice).toBeUndefined()
    expect(body.messages).toEqual([
      { role: 'system', content: 'utility rules' },
      { role: 'user', content: 'summarize' },
    ])
  })

  it('generates custom OpenAI-compatible utility responses through the agent provider without the AI SDK', async () => {
    const fetchImpl = mockFetchResponse(streamResponse([
      sse({
        choices: [{ index: 0, delta: { content: 'custom native' }, finish_reason: 'stop' }],
      }),
      sse({
        choices: [],
        usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 },
      }),
      'data: [DONE]\n\n',
    ]))
    fetchHolder.current = fetchImpl

    const text = await generateChatResponse(
      'custom-local-openai',
      {
        apiKey: 'custom-key',
        baseUrl: 'https://custom-openai.test/v1',
        model: 'custom-chat',
        apiType: 'openai',
      },
      [
        { role: 'system', content: 'utility rules' },
        { role: 'user', content: 'summarize' },
      ],
      { temperature: 0.3, maxTokens: 64 },
    )

    expect(text).toBe('custom native')
    expect(aiMocks.generateText).not.toHaveBeenCalled()
    expect(aiMocks.streamText).not.toHaveBeenCalled()
    expect(aiMocks.convertToModelMessages).not.toHaveBeenCalled()

    const request = firstFetchCall(fetchImpl)
    const body = request.body
    expect(request.url).toBe('https://custom-openai.test/v1/chat/completions')
    expect(request.headers.Authorization).toBe('Bearer custom-key')
    expect(body).toMatchObject({
      model: 'custom-chat',
      stream: true,
      stream_options: { include_usage: true },
      max_tokens: 64,
      temperature: 0.3,
    })
    expect(body.tools).toBeUndefined()
    expect(body.tool_choice).toBeUndefined()
  })

  it('generates Claude utility responses through the agent provider without the AI SDK', async () => {
    const fetchImpl = mockFetchResponse(streamResponse([
      'event: message_start\n',
      'data: {"type":"message_start","message":{"usage":{"input_tokens":6,"output_tokens":1}}}\n\n',
      'event: content_block_delta\n',
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"claude native"}}\n\n',
      'event: message_delta\n',
      'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":2}}\n\n',
      'event: message_stop\n',
      'data: {"type":"message_stop"}\n\n',
    ]))
    fetchHolder.current = fetchImpl

    const text = await generateChatResponse(
      'claude',
      {
        apiKey: 'anthropic-key',
        baseUrl: 'https://anthropic.test/v1',
        model: 'claude-test',
      },
      [
        { role: 'system', content: 'utility rules' },
        { role: 'user', content: 'summarize' },
      ],
      { temperature: 0.2, maxTokens: 222 },
    )

    expect(text).toBe('claude native')
    expect(aiMocks.generateText).not.toHaveBeenCalled()
    expect(aiMocks.streamText).not.toHaveBeenCalled()
    expect(aiMocks.convertToModelMessages).not.toHaveBeenCalled()

    const request = firstFetchCall(fetchImpl)
    const body = request.body
    expect(request.url).toBe('https://anthropic.test/v1/messages')
    expect(request.headers['x-api-key']).toBe('anthropic-key')
    expect(body).toMatchObject({
      model: 'claude-test',
      system: 'utility rules',
      max_tokens: 222,
      stream: true,
      temperature: 0.2,
    })
    expect(body.messages).toEqual([{ role: 'user', content: 'summarize' }])
    expect(body.tools).toBeUndefined()
  })

  it('generates custom Anthropic-compatible utility responses through the agent provider without the AI SDK', async () => {
    const fetchImpl = mockFetchResponse(streamResponse([
      'event: message_start\n',
      'data: {"type":"message_start","message":{"usage":{"input_tokens":4,"output_tokens":1}}}\n\n',
      'event: content_block_delta\n',
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"custom claude"}}\n\n',
      'event: message_delta\n',
      'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":2}}\n\n',
      'event: message_stop\n',
      'data: {"type":"message_stop"}\n\n',
    ]))
    fetchHolder.current = fetchImpl

    const text = await generateChatResponse(
      'custom-local-anthropic',
      {
        apiKey: 'custom-anthropic-key',
        baseUrl: 'https://custom-anthropic.test/v1',
        model: 'custom-claude',
        apiType: 'anthropic',
      },
      [
        { role: 'system', content: 'utility rules' },
        { role: 'user', content: 'summarize' },
      ],
      { temperature: 0.2, maxTokens: 128 },
    )

    expect(text).toBe('custom claude')
    expect(aiMocks.generateText).not.toHaveBeenCalled()
    expect(aiMocks.streamText).not.toHaveBeenCalled()
    expect(aiMocks.convertToModelMessages).not.toHaveBeenCalled()

    const request = firstFetchCall(fetchImpl)
    const body = request.body
    expect(request.url).toBe('https://custom-anthropic.test/v1/messages')
    expect(request.headers['x-api-key']).toBe('custom-anthropic-key')
    expect(body).toMatchObject({
      model: 'custom-claude',
      system: 'utility rules',
      max_tokens: 128,
      stream: true,
      temperature: 0.2,
    })
    expect(body.messages).toEqual([{ role: 'user', content: 'summarize' }])
  })

  it('generates Gemini utility responses through the agent provider without the AI SDK', async () => {
    const fetchImpl = mockFetchResponse(streamResponse([
      'data: {"candidates":[{"content":{"parts":[{"text":"gemini native"}]},"finishReason":"STOP"}],"usageMetadata":{"promptTokenCount":4,"candidatesTokenCount":2,"totalTokenCount":6}}\n\n',
    ]))
    fetchHolder.current = fetchImpl

    const text = await generateChatResponse(
      'gemini',
      {
        apiKey: 'gemini-key',
        baseUrl: 'https://gemini.test/v1beta',
        model: 'gemini-test',
      },
      [
        { role: 'system', content: 'utility rules' },
        { role: 'user', content: 'summarize' },
      ],
      { temperature: 0.4, maxTokens: 333 },
    )

    expect(text).toBe('gemini native')
    expect(aiMocks.generateText).not.toHaveBeenCalled()
    expect(aiMocks.streamText).not.toHaveBeenCalled()
    expect(aiMocks.convertToModelMessages).not.toHaveBeenCalled()

    const request = firstFetchCall(fetchImpl)
    const url = new URL(request.url)
    const body = request.body
    expect(url.origin + url.pathname).toBe('https://gemini.test/v1beta/models/gemini-test:streamGenerateContent')
    expect(url.searchParams.get('alt')).toBe('sse')
    expect(url.searchParams.get('key')).toBe('gemini-key')
    expect(body).toMatchObject({
      systemInstruction: { parts: [{ text: 'utility rules' }] },
      generationConfig: {
        maxOutputTokens: 333,
        temperature: 0.4,
      },
    })
    expect(body.contents).toEqual([{ role: 'user', parts: [{ text: 'summarize' }] }])
    expect(body.tools).toBeUndefined()
  })

  it('streams DeepSeek tool turns through the agent provider without the AI SDK', async () => {
    const toolArgs = JSON.stringify({ path: '/tmp/example.txt' })
    const fetchImpl = mockFetchResponse(streamResponse([
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
    ]))
    fetchHolder.current = fetchImpl

    const chunks: ToolStreamChunk[] = []
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

    const body = firstFetchCall(fetchImpl).body
    const toolFunction = jsonObjectField(jsonObjectAt(jsonArrayField(body, 'tools'), 0), 'function')
    expect(toolFunction.name).toBe('read')
    expect(body.tool_choice).toBe('auto')
    expect(body.thinking).toEqual({ type: 'enabled' })
    expect(body.reasoning_effort).toBe('max')
    expect(body.temperature).toBeUndefined()
  })

  it('streams OpenAI-compatible tool turns through the agent provider without the AI SDK', async () => {
    const toolArgs = JSON.stringify({ path: '/tmp/example.txt' })
    const fetchImpl = mockFetchResponse(streamResponse([
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
        usage: { prompt_tokens: 12, completion_tokens: 4, total_tokens: 16 },
      }),
      'data: [DONE]\n\n',
    ]))
    fetchHolder.current = fetchImpl

    const chunks: ToolStreamChunk[] = []
    for await (const chunk of streamChatResponseWithTools(
      'openai',
      {
        apiKey: 'openai-key',
        baseUrl: 'https://openai.test/v1',
        model: 'gpt-test',
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
        maxTokens: 88,
        debugSessionId: 'session-openai',
        debugTurn: 4,
      },
    )) {
      chunks.push(chunk)
    }

    expect(aiMocks.generateText).not.toHaveBeenCalled()
    expect(aiMocks.streamText).not.toHaveBeenCalled()
    expect(aiMocks.convertToModelMessages).not.toHaveBeenCalled()
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
      usage: { inputTokens: 12, outputTokens: 4, totalTokens: 16 },
    })

    const request = firstFetchCall(fetchImpl)
    const body = request.body
    expect(request.url).toBe('https://openai.test/v1/chat/completions')
    const toolFunction = jsonObjectField(jsonObjectAt(jsonArrayField(body, 'tools'), 0), 'function')
    expect(toolFunction).toEqual({
      name: 'read',
      description: 'Read a file',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path' },
        },
        required: ['path'],
      },
    })
    expect(body.tool_choice).toBe('auto')
    expect(body.max_completion_tokens).toBe(88)
  })

  it('streams custom OpenAI-compatible UIMessages through the agent provider without the AI SDK', async () => {
    const fetchImpl = mockFetchResponse(streamResponse([
      sse({
        choices: [{ index: 0, delta: { content: 'seen image' }, finish_reason: 'stop' }],
      }),
      sse({
        choices: [],
        usage: { prompt_tokens: 9, completion_tokens: 2, total_tokens: 11 },
      }),
      'data: [DONE]\n\n',
    ]))
    fetchHolder.current = fetchImpl

    const chunks: UIMessageStreamChunk[] = []
    for await (const chunk of streamChatWithUIMessages(
      'custom-ui-openai',
      {
        apiKey: 'custom-key',
        baseUrl: 'https://custom-ui.test/v1',
        model: 'custom-vision',
        apiType: 'openai',
      },
      [{
        id: 'u1',
        role: 'user',
        parts: [
          { type: 'text', text: 'describe this' },
          {
            type: 'file',
            mediaType: 'image/png',
            filename: 'shot.png',
            url: 'data:image/png;base64,abc123',
          },
        ],
      }],
      {
        inspect: {
          description: 'Inspect the image',
          parameters: [{
            name: 'focus',
            type: 'string',
            description: 'Focus area',
            required: true,
          }],
        },
      },
      { maxTokens: 66 },
    )) {
      chunks.push(chunk)
    }

    expect(aiMocks.generateText).not.toHaveBeenCalled()
    expect(aiMocks.streamText).not.toHaveBeenCalled()
    expect(aiMocks.convertToModelMessages).not.toHaveBeenCalled()
    expect(chunks).toEqual([
      { type: 'text', text: 'seen image' },
      {
        type: 'finish',
        finishReason: 'stop',
        usage: { inputTokens: 9, outputTokens: 2, totalTokens: 11 },
      },
    ])

    const request = firstFetchCall(fetchImpl)
    const body = request.body
    expect(request.url).toBe('https://custom-ui.test/v1/chat/completions')
    expect(jsonObjectAt(jsonArrayField(body, 'messages'), 0)).toEqual({
      role: 'user',
      content: [
        { type: 'text', text: 'describe this' },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,abc123' } },
      ],
    })
    const toolFunction = jsonObjectField(jsonObjectAt(jsonArrayField(body, 'tools'), 0), 'function')
    expect(toolFunction.name).toBe('inspect')
    expect(body.tool_choice).toBe('auto')
    expect(body.max_tokens).toBe(66)
  })

  it('streams runTurn-only tool turns through the agent provider without the AI SDK', async () => {
    const runTurn = vi.fn(async (request: AgentTurnRequest) => {
      expect(request.toolChoice).toBe('auto')
      expect(request.tools?.map(tool => tool.name)).toEqual(['read'])
      return {
        message: {
          role: 'assistant',
          content: '',
          reasoningContent: 'need file',
          toolCalls: [{
            id: 'call_run_1',
            name: 'read',
            arguments: '{"path":"/tmp/run.txt"}',
          }],
        },
        finishReason: 'tool_calls',
        usage: { inputTokens: 9, outputTokens: 4, totalTokens: 13 },
      } satisfies AgentTurn
    })
    const unregister = registerAgentProviderRuntime('runturn-only-test', () => ({
      id: 'runturn-only-test',
      capabilities: {
        capabilities: ['text-input', 'text-output', 'tool-calls', 'reasoning'],
        inputModalities: ['text'],
        outputModalities: ['text'],
        supportsTools: true,
        supportsReasoning: true,
      },
      runTurn,
    }), { replace: true })

    try {
      const chunks: ToolStreamChunk[] = []
      for await (const chunk of streamChatResponseWithTools(
        'runturn-only-test',
        {
          apiKey: 'test-key',
          baseUrl: 'https://runturn.test/v1',
          model: 'run-model',
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
          maxTokens: 44,
          debugSessionId: 'session-runturn',
          debugTurn: 2,
        },
      )) {
        chunks.push(chunk)
      }

      expect(aiMocks.generateText).not.toHaveBeenCalled()
      expect(aiMocks.streamText).not.toHaveBeenCalled()
      expect(aiMocks.convertToModelMessages).not.toHaveBeenCalled()
      expect(runTurn).toHaveBeenCalledTimes(1)
      expect(chunks).toEqual([
        { type: 'reasoning', reasoning: 'need file' },
        { type: 'tool-input-start', toolInputStart: { toolCallId: 'call_run_1', toolName: 'read' } },
        { type: 'tool-input-delta', toolInputDelta: { toolCallId: 'call_run_1', argsTextDelta: '{"path":"/tmp/run.txt"}' } },
        { type: 'tool-input-end', toolInputEnd: { toolCallId: 'call_run_1' } },
        {
          type: 'finish',
          finishReason: 'tool-calls',
          usage: { inputTokens: 9, outputTokens: 4, totalTokens: 13 },
        },
      ])
    } finally {
      unregister()
    }
  })

  it('streams runTurn onEvent deltas before the runTurn promise resolves', async () => {
    const release = { current: undefined as undefined | (() => void) }
    const runTurn = vi.fn(async (request: AgentTurnRequest) => {
      request.onEvent?.({ type: 'reasoning-delta', turn: request.turn, delta: 'plan ' })
      request.onEvent?.({ type: 'text-delta', turn: request.turn, delta: 'partial ' })
      await new Promise<void>(resolve => {
        release.current = resolve
      })
      return {
        message: {
          role: 'assistant',
          content: 'partial done',
          reasoningContent: 'plan final',
        },
        finishReason: 'stop',
        usage: { inputTokens: 3, outputTokens: 2, totalTokens: 5 },
      } satisfies AgentTurn
    })
    const unregister = registerAgentProviderRuntime('runturn-live-stream-test', () => ({
      id: 'runturn-live-stream-test',
      runTurn,
    }), { replace: true })

    try {
      const iterator = streamChatResponseWithReasoning(
        'runturn-live-stream-test',
        {
          apiKey: 'test-key',
          baseUrl: 'https://runturn.test/v1',
          model: 'run-model',
        },
        [{ role: 'user', content: 'stream' }],
      )[Symbol.asyncIterator]()

      await expect(iterator.next()).resolves.toEqual({
        done: false,
        value: { type: 'text', text: '', reasoning: 'plan ' },
      })
      await expect(iterator.next()).resolves.toEqual({
        done: false,
        value: { type: 'text', text: 'partial ' },
      })

      release.current?.()

      await expect(iterator.next()).resolves.toEqual({
        done: false,
        value: { type: 'text', text: '', reasoning: 'final' },
      })
      await expect(iterator.next()).resolves.toEqual({
        done: false,
        value: { type: 'text', text: 'done' },
      })
      await expect(iterator.next()).resolves.toEqual({
        done: false,
        value: {
          type: 'finish',
          usage: { inputTokens: 3, outputTokens: 2, totalTokens: 5 },
        },
      })
      await expect(iterator.next()).resolves.toEqual({ done: true, value: undefined })

      expect(aiMocks.generateText).not.toHaveBeenCalled()
      expect(aiMocks.streamText).not.toHaveBeenCalled()
      expect(aiMocks.convertToModelMessages).not.toHaveBeenCalled()
      expect(runTurn).toHaveBeenCalledTimes(1)
    } finally {
      unregister()
    }
  })

  it('aborts pending runTurn utility generation even when the provider does not resolve', async () => {
    const controller = new AbortController()
    const runTurn = vi.fn(async (request: AgentTurnRequest) => {
      expect(request.abortSignal).toBe(controller.signal)
      setTimeout(() => controller.abort(), 0)
      return new Promise<AgentTurn>(() => {})
    })
    const unregister = registerAgentProviderRuntime('runturn-abort-generate-test', () => ({
      id: 'runturn-abort-generate-test',
      runTurn,
    }), { replace: true })

    try {
      await expect(withTimeout(generateChatResponse(
        'runturn-abort-generate-test',
        {
          apiKey: 'test-key',
          baseUrl: 'https://runturn.test/v1',
          model: 'run-model',
        },
        [{ role: 'user', content: 'wait' }],
        { abortSignal: controller.signal },
      ))).rejects.toMatchObject({ name: 'AbortError' })

      expect(aiMocks.generateText).not.toHaveBeenCalled()
      expect(aiMocks.streamText).not.toHaveBeenCalled()
      expect(aiMocks.convertToModelMessages).not.toHaveBeenCalled()
      expect(runTurn).toHaveBeenCalledTimes(1)
    } finally {
      unregister()
    }
  })

  it('aborts pending runTurn tool turns even when the provider does not resolve', async () => {
    const controller = new AbortController()
    const runTurn = vi.fn(async (request: AgentTurnRequest) => {
      expect(request.abortSignal).toBe(controller.signal)
      setTimeout(() => controller.abort(), 0)
      return new Promise<AgentTurn>(() => {})
    })
    const unregister = registerAgentProviderRuntime('runturn-abort-tool-test', () => ({
      id: 'runturn-abort-tool-test',
      capabilities: {
        capabilities: ['text-input', 'text-output', 'tool-calls'],
        inputModalities: ['text'],
        outputModalities: ['text'],
        supportsTools: true,
      },
      runTurn,
    }), { replace: true })
    const chunks: ToolStreamChunk[] = []
    let error: Error | undefined

    try {
      await withTimeout((async () => {
        for await (const chunk of streamChatResponseWithTools(
          'runturn-abort-tool-test',
          {
            apiKey: 'test-key',
            baseUrl: 'https://runturn.test/v1',
            model: 'run-model',
          },
          [{ role: 'user', content: 'wait' }],
          {
            read: {
              description: 'Read a file',
              parameters: [],
            },
          },
          { abortSignal: controller.signal },
        )) {
          chunks.push(chunk)
        }
      })())
    } catch (caught) {
      error = caught instanceof Error ? caught : new Error(String(caught))
    } finally {
      unregister()
    }

    expect(error).toMatchObject({ name: 'AbortError' })
    expect(chunks).toEqual([])
    expect(aiMocks.generateText).not.toHaveBeenCalled()
    expect(aiMocks.streamText).not.toHaveBeenCalled()
    expect(aiMocks.convertToModelMessages).not.toHaveBeenCalled()
    expect(runTurn).toHaveBeenCalledTimes(1)
  })

  it('streams DeepSeek reasoning responses through the agent provider without the AI SDK', async () => {
    const fetchImpl = mockFetchResponse(streamResponse([
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
    ]))
    fetchHolder.current = fetchImpl

    const chunks: ReasoningStreamChunk[] = []
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

    const body = firstFetchCall(fetchImpl).body
    expect(body.model).toBe('deepseek-reasoner')
    expect(body.thinking).toEqual({ type: 'enabled' })
    expect(body.max_tokens).toBe(50)
  })

  it('streams the simple text facade through the DeepSeek agent provider without the AI SDK', async () => {
    const fetchImpl = mockFetchResponse(streamResponse([
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
    ]))
    fetchHolder.current = fetchImpl

    const chunks: SimpleStreamChunk[] = []
    for await (const chunk of streamChatResponse(
      'deepseek',
      {
        apiKey: 'test-key',
        baseUrl: 'https://deepseek.test',
        model: 'deepseek-v4-flash',
      },
      [{ role: 'user', content: 'stream' }],
      { maxTokens: 50 },
    )) {
      chunks.push(chunk)
    }

    expect(aiMocks.generateText).not.toHaveBeenCalled()
    expect(aiMocks.streamText).not.toHaveBeenCalled()
    expect(aiMocks.convertToModelMessages).not.toHaveBeenCalled()
    expect(chunks).toEqual([
      { text: '', reasoning: 'plan ' },
      { text: 'answer', reasoning: undefined },
    ])

    const body = firstFetchCall(fetchImpl).body
    expect(body.model).toBe('deepseek-v4-flash')
    expect(body.thinking).toEqual({ type: 'enabled' })
    expect(body.max_tokens).toBe(50)
  })

  it('streams OpenAI-compatible reasoning utility responses through the agent provider without the AI SDK', async () => {
    const fetchImpl = mockFetchResponse(streamResponse([
      sse({
        choices: [{ index: 0, delta: { reasoning: 'plan ' }, finish_reason: null }],
      }),
      sse({
        choices: [{ index: 0, delta: { content: 'answer' }, finish_reason: 'stop' }],
      }),
      sse({
        choices: [],
        usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 },
      }),
      'data: [DONE]\n\n',
    ]))
    fetchHolder.current = fetchImpl

    const chunks: ReasoningStreamChunk[] = []
    for await (const chunk of streamChatResponseWithReasoning(
      'openai',
      {
        apiKey: 'openai-key',
        baseUrl: 'https://openai.test/v1',
        model: 'gpt-test',
      },
      [{ role: 'user', content: 'think' }],
      { maxTokens: 77 },
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
        usage: { inputTokens: 5, outputTokens: 3, totalTokens: 8 },
      },
    ])

    const request = firstFetchCall(fetchImpl)
    const body = request.body
    expect(request.url).toBe('https://openai.test/v1/chat/completions')
    expect(body.max_completion_tokens).toBe(77)
    expect(body.tool_choice).toBeUndefined()
  })
})
