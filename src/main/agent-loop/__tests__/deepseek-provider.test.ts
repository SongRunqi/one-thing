import { describe, expect, it, vi } from 'vitest'
import { createDeepSeekAgentProvider } from '../providers/deepseek.js'

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

describe('DeepSeek agent provider', () => {
  it('streams thinking tokens and accumulates tool calls without the AI SDK', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(streamResponse([
      'data: {"choices":[{"index":0,"delta":{"reasoning_content":"think "},"finish_reason":null}],"usage":null}\n\n',
      'data: {"choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"skill_manage","arguments":"{\\"action\\":\\"create\\""}}]},"finish_reason":null}],"usage":null}\n\n',
      'data: {"choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":",\\"name\\":\\"docs\\"}"}}]},"finish_reason":"tool_calls"}],"usage":null}\n\n',
      'data: {"choices":[],"usage":{"prompt_tokens":10,"completion_tokens":4,"total_tokens":14}}\n\n',
      'data: [DONE]\n\n',
    ]))
    const provider = createDeepSeekAgentProvider({
      apiKey: 'test-key',
      baseUrl: 'https://deepseek.test',
      fetchImpl,
    })
    const events: string[] = []

    expect(provider.runTurn).toBeDefined()
    const turn = await provider.runTurn!({
      model: 'deepseek-v4-pro',
      messages: [{ role: 'user', content: 'create a skill' }],
      tools: [{
        name: 'skill_manage',
        description: 'Manage skills',
        parameters: { type: 'object', properties: {}, required: [] },
        execute: async () => ({ content: 'ok' }),
      }],
      toolChoice: 'auto',
      thinking: 'enabled',
      reasoningEffort: 'max',
      temperature: 0.1,
      turn: 1,
      onEvent(event) {
        events.push(event.type)
      },
    })

    const request = JSON.parse(fetchImpl.mock.calls[0][1].body)
    expect(fetchImpl.mock.calls[0][0]).toBe('https://deepseek.test/chat/completions')
    expect(request.thinking).toEqual({ type: 'enabled' })
    expect(request.reasoning_effort).toBe('max')
    expect(request.temperature).toBeUndefined()
    expect(request.tools[0].function.name).toBe('skill_manage')
    expect(turn.message.reasoningContent).toBe('think ')
    expect(turn.message.toolCalls).toEqual([{
      id: 'call_1',
      name: 'skill_manage',
      arguments: '{"action":"create","name":"docs"}',
    }])
    expect(turn.finishReason).toBe('tool_calls')
    expect(turn.usage).toEqual({ inputTokens: 10, outputTokens: 4, totalTokens: 14 })
    expect(events).toContain('reasoning-delta')
    expect(events).toContain('tool-call-done')
  })
})
