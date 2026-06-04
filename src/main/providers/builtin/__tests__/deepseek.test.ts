import { describe, expect, it, vi, beforeEach } from 'vitest'
import deepseekProvider from '../deepseek.js'

const { fetchHolder } = vi.hoisted(() => ({
  fetchHolder: {
    current: undefined as unknown as typeof globalThis.fetch,
  },
}))

vi.mock('../../bound-fetch.js', () => ({
  createRequiredAppFetch: () => fetchHolder.current,
}))

const encoder = new TextEncoder()

function sse(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`
}

function createControlledSseFetch() {
  let controller!: ReadableStreamDefaultController<Uint8Array>
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c
    },
  })
  const fetchImpl = vi.fn(async () => new Response(body, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  })) as unknown as typeof globalThis.fetch

  return {
    fetchImpl,
    enqueue(text: string) {
      controller.enqueue(encoder.encode(text))
    },
    close() {
      controller.close()
    },
  }
}

async function waitFor(predicate: () => boolean, message: string) {
  const started = Date.now()
  while (Date.now() - started < 1000) {
    if (predicate()) return
    await new Promise(resolve => setTimeout(resolve, 5))
  }
  throw new Error(message)
}

describe('DeepSeek provider streaming tool calls', () => {
  beforeEach(() => {
    fetchHolder.current = vi.fn(async () => new Response('', { status: 500 })) as unknown as typeof globalThis.fetch
  })

  it('sends only official DeepSeek reasoning effort values', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 200 })) as unknown as typeof globalThis.fetch
    fetchHolder.current = fetchImpl
    const model = deepseekProvider
      .create({ apiKey: 'test-key', baseUrl: 'https://deepseek.test' })
      .createModel('deepseek-v4-pro') as any

    await model.doStream({
      prompt: [{ role: 'user', content: [{ type: 'text', text: 'Think' }] }],
      providerOptions: {
        deepseek: {
          thinking: 'enabled',
          reasoningEffort: 'max',
        },
      },
    } as any)

    let body = JSON.parse((fetchImpl as any).mock.calls[0][1].body)
    expect(body.reasoning_effort).toBe('max')

    await model.doStream({
      prompt: [{ role: 'user', content: [{ type: 'text', text: 'Think' }] }],
      providerOptions: {
        deepseek: {
          thinking: 'enabled',
          reasoningEffort: 'medium',
        },
      },
    } as any)

    body = JSON.parse((fetchImpl as any).mock.calls[1][1].body)
    expect(body.reasoning_effort).toBe('high')
  })

  it('emits tool input end as soon as each streamed tool argument JSON is complete', async () => {
    const harness = createControlledSseFetch()
    fetchHolder.current = harness.fetchImpl

    const tmpFile = `${process.cwd()}/TMP/deepseek-provider-order.md`
    const argsA = {
      path: tmpFile,
      edits: [{ oldText: 'A0', newText: 'A1' }],
    }
    const argsB = {
      path: tmpFile,
      edits: [{ oldText: 'B0', newText: 'B1' }],
    }
    const argsAText = JSON.stringify(argsA)
    const argsBText = JSON.stringify(argsB)

    const model = deepseekProvider
      .create({ apiKey: 'test-key', baseUrl: 'https://deepseek.test' })
      .createModel('deepseek-chat') as any

    const result = await model.doStream({
      prompt: [{ role: 'user', content: [{ type: 'text', text: 'Edit the same file twice' }] }],
      tools: [{
        type: 'function',
        name: 'edit',
        description: 'Edit a file',
        inputSchema: { type: 'object', properties: {}, required: [] },
      }],
    } as any)

    const chunks: any[] = []
    const reader = result.stream.getReader()
    const collecting = (async () => {
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          chunks.push(value)
        }
      } finally {
        reader.releaseLock()
      }
    })()

    harness.enqueue(sse({
      choices: [{
        index: 0,
        delta: {
          tool_calls: [{
            index: 0,
            id: 'call_a',
            type: 'function',
            function: { name: 'edit', arguments: argsAText.slice(0, 32) },
          }],
        },
        finish_reason: null,
      }],
    }))
    await waitFor(() => chunks.length >= 2, 'first tool input chunks were not emitted')
    expect(chunks[0]).toEqual({
      type: 'tool-input-start',
      toolCallId: 'call_a',
      toolName: 'edit',
    })
    expect(chunks[1]).toEqual({
      type: 'tool-input-delta',
      toolCallId: 'call_a',
      inputTextDelta: argsAText.slice(0, 32),
    })

    harness.enqueue(sse({
      choices: [{
        index: 0,
        delta: {
          tool_calls: [{
            index: 1,
            id: 'call_b',
            type: 'function',
            function: { name: 'edit', arguments: argsBText.slice(0, 32) },
          }],
        },
        finish_reason: null,
      }],
    }))
    await waitFor(() => chunks.length >= 4, 'second tool input chunks were not emitted')
    expect(chunks[2]).toEqual({
      type: 'tool-input-start',
      toolCallId: 'call_b',
      toolName: 'edit',
    })
    expect(chunks[3]).toEqual({
      type: 'tool-input-delta',
      toolCallId: 'call_b',
      inputTextDelta: argsBText.slice(0, 32),
    })

    harness.enqueue(sse({
      choices: [{
        index: 0,
        delta: {
          tool_calls: [
            { index: 0, function: { arguments: argsAText.slice(32) } },
            { index: 1, function: { arguments: argsBText.slice(32) } },
          ],
        },
        finish_reason: null,
      }],
    }))
    await waitFor(() => chunks.length >= 8, 'remaining tool input deltas and ends were not emitted')
    expect(chunks[4]).toEqual({
      type: 'tool-input-delta',
      toolCallId: 'call_a',
      inputTextDelta: argsAText.slice(32),
    })
    expect(chunks[5]).toEqual({
      type: 'tool-input-end',
      toolCallId: 'call_a',
    })
    expect(chunks[6]).toEqual({
      type: 'tool-input-delta',
      toolCallId: 'call_b',
      inputTextDelta: argsBText.slice(32),
    })
    expect(chunks[7]).toEqual({
      type: 'tool-input-end',
      toolCallId: 'call_b',
    })
    expect(chunks.some(chunk => chunk.type === 'tool-call')).toBe(false)

    harness.enqueue(sse({
      choices: [{
        index: 0,
        delta: {},
        finish_reason: 'tool_calls',
      }],
    }))
    await waitFor(
      () => chunks.filter(chunk => chunk.type === 'tool-call').length === 2,
      'complete tool calls were not emitted after finish_reason=tool_calls',
    )

    expect(chunks[8]).toEqual({
      type: 'tool-call',
      toolCallId: 'call_a',
      toolName: 'edit',
      input: argsA,
    })
    expect(chunks[9]).toEqual({
      type: 'tool-call',
      toolCallId: 'call_b',
      toolName: 'edit',
      input: argsB,
    })

    harness.enqueue(sse({
      choices: [],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 20,
        total_tokens: 30,
      },
    }))
    harness.close()
    await collecting

    expect(chunks[10]).toEqual({
      type: 'finish',
      finishReason: 'tool-calls',
      usage: {
        inputTokens: 10,
        outputTokens: 20,
        totalTokens: 30,
      },
    })
  })

  it('closes the reasoning block before emitting tool input when thinking goes straight to a tool call', async () => {
    const harness = createControlledSseFetch()
    fetchHolder.current = harness.fetchImpl

    const args = { city: 'Shanghai' }
    const argsText = JSON.stringify(args)

    const model = deepseekProvider
      .create({ apiKey: 'test-key', baseUrl: 'https://deepseek.test' })
      .createModel('deepseek-v4-pro') as any

    const result = await model.doStream({
      prompt: [{ role: 'user', content: [{ type: 'text', text: 'Weather?' }] }],
      providerOptions: { deepseek: { thinking: 'enabled' } },
      tools: [{
        type: 'function',
        name: 'get_weather',
        description: 'Get weather',
        inputSchema: { type: 'object', properties: {}, required: [] },
      }],
    } as any)

    const chunks: any[] = []
    const reader = result.stream.getReader()
    const collecting = (async () => {
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          chunks.push(value)
        }
      } finally {
        reader.releaseLock()
      }
    })()

    // Thinking phase first.
    harness.enqueue(sse({
      choices: [{
        index: 0,
        delta: { reasoning_content: 'Let me think about the weather.' },
        finish_reason: null,
      }],
    }))
    await waitFor(() => chunks.length >= 2, 'reasoning chunks were not emitted')
    expect(chunks[0]).toEqual({ type: 'reasoning-start', id: 'reasoning-0' })
    expect(chunks[1]).toEqual({
      type: 'reasoning-delta',
      id: 'reasoning-0',
      delta: 'Let me think about the weather.',
    })

    // Model decides to call a tool with no intervening `content`.
    harness.enqueue(sse({
      choices: [{
        index: 0,
        delta: {
          tool_calls: [{
            index: 0,
            id: 'call_w',
            type: 'function',
            function: { name: 'get_weather', arguments: argsText },
          }],
        },
        finish_reason: null,
      }],
    }))
    await waitFor(() => chunks.length >= 5, 'reasoning-end + tool input chunks were not emitted')

    // The reasoning block must be closed *before* the tool input starts.
    expect(chunks[2]).toEqual({ type: 'reasoning-end', id: 'reasoning-0' })
    expect(chunks[3]).toEqual({
      type: 'tool-input-start',
      toolCallId: 'call_w',
      toolName: 'get_weather',
    })
    expect(chunks[4]).toEqual({
      type: 'tool-input-delta',
      toolCallId: 'call_w',
      inputTextDelta: argsText,
    })
    // tool-input-end fires as soon as the JSON args are complete.
    await waitFor(
      () => chunks.some(c => c.type === 'tool-input-end'),
      'tool-input-end was not emitted',
    )

    // reasoning-end must appear exactly once (not re-emitted at finish).
    const finishChunk = (() => {
      harness.enqueue(sse({
        choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }],
      }))
      return undefined
    })()
    void finishChunk
    harness.enqueue(sse({
      choices: [],
      usage: { prompt_tokens: 5, completion_tokens: 7, total_tokens: 12 },
    }))
    harness.close()
    await collecting

    expect(chunks.filter(c => c.type === 'reasoning-end')).toHaveLength(1)
    expect(chunks.filter(c => c.type === 'tool-call')).toEqual([
      { type: 'tool-call', toolCallId: 'call_w', toolName: 'get_weather', input: args },
    ])
    expect(chunks[chunks.length - 1]).toEqual({
      type: 'finish',
      finishReason: 'tool-calls',
      usage: { inputTokens: 5, outputTokens: 7, totalTokens: 12 },
    })
  })
})
