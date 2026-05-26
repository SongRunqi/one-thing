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

  it('emits tool input end as soon as each streamed tool argument JSON is complete', async () => {
    const harness = createControlledSseFetch()
    fetchHolder.current = harness.fetchImpl

    const tmpFile = `${process.cwd()}/TMP/deepseek-provider-order.md`
    const argsA = {
      file_path: tmpFile,
      old_string: 'A0',
      new_string: 'A1',
      replace_all: false,
    }
    const argsB = {
      file_path: tmpFile,
      old_string: 'B0',
      new_string: 'B1',
      replace_all: false,
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
})
