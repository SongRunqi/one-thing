import { describe, expect, it, vi } from 'vitest'
import { createOpenAICompatibleAgentProvider } from '../providers/openai-compatible.js'

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

describe('OpenAI-compatible agent provider', () => {
  it('streams text, reasoning, tools, and usage without the AI SDK', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(streamResponse([
      'data: {"choices":[{"index":0,"delta":{"reasoning_content":"think "},"finish_reason":null}],"usage":null}\n\n',
      'data: {"choices":[{"index":0,"delta":{"content":"hello "},"finish_reason":null}],"usage":null}\n\n',
      'data: {"choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"read","arguments":"{\\"path\\":\\"a"}}]},"finish_reason":null}],"usage":null}\n\n',
      'data: {"choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":".txt\\"}"}}]},"finish_reason":"tool_calls"}],"usage":null}\n\n',
      'data: {"choices":[],"usage":{"prompt_tokens":12,"completion_tokens":5,"total_tokens":17}}\n\n',
      'data: [DONE]\n\n',
    ]))
    const provider = createOpenAICompatibleAgentProvider({
      providerId: 'openai',
      apiKey: 'test-key',
      baseUrl: 'https://openai.test/v1',
      defaultBaseUrl: 'https://api.openai.com/v1',
      fetchImpl,
      supportsVision: true,
      supportsReasoning: true,
      maxTokensField: 'max_completion_tokens',
    })
    const events: string[] = []

    const turn = await provider.runTurn!({
      model: 'gpt-test',
      messages: [
        { role: 'system', content: 'System rules' },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'look' },
            { type: 'image', image: 'abc', mediaType: 'image/png' },
          ],
        },
      ],
      tools: [{
        name: 'read',
        description: 'Read a file',
        parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
        execute: async () => ({ content: 'ok' }),
      }],
      toolChoice: 'auto',
      maxTokens: 123,
      temperature: 0.2,
      turn: 1,
      onEvent(event) {
        events.push(event.type)
      },
    })

    const request = JSON.parse(fetchImpl.mock.calls[0][1].body)
    expect(fetchImpl.mock.calls[0][0]).toBe('https://openai.test/v1/chat/completions')
    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBe('Bearer test-key')
    expect(request).toMatchObject({
      model: 'gpt-test',
      stream: true,
      stream_options: { include_usage: true },
      temperature: 0.2,
      max_completion_tokens: 123,
      tool_choice: 'auto',
    })
    expect(request.messages).toEqual([
      { role: 'system', content: 'System rules' },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'look' },
          { type: 'image_url', image_url: { url: 'data:image/png;base64,abc' } },
        ],
      },
    ])
    expect(request.tools[0]).toEqual({
      type: 'function',
      function: {
        name: 'read',
        description: 'Read a file',
        parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
      },
    })
    expect(turn.message.content).toBe('hello ')
    expect(turn.message.reasoningContent).toBe('think ')
    expect(turn.message.toolCalls).toEqual([{
      id: 'call_1',
      name: 'read',
      arguments: '{"path":"a.txt"}',
    }])
    expect(turn.finishReason).toBe('tool_calls')
    expect(turn.usage).toEqual({ inputTokens: 12, outputTokens: 5, totalTokens: 17 })
    expect(events).toEqual(expect.arrayContaining([
      'reasoning-delta',
      'text-delta',
      'tool-call-start',
      'tool-call-delta',
      'tool-call-done',
    ]))
  })

  it('can preserve assistant reasoning for compatible providers that accept it', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(streamResponse([
      'data: {"choices":[{"index":0,"delta":{"content":"ok"},"finish_reason":"stop"}],"usage":{"prompt_tokens":1,"completion_tokens":1,"total_tokens":2}}\n\n',
      'data: [DONE]\n\n',
    ]))
    const provider = createOpenAICompatibleAgentProvider({
      providerId: 'kimi',
      apiKey: 'test-key',
      baseUrl: 'https://kimi.test/v1',
      defaultBaseUrl: 'https://api.moonshot.cn/v1',
      fetchImpl,
      supportsReasoning: true,
      includeAssistantReasoning: true,
    })

    await provider.runTurn!({
      model: 'moonshot-test',
      messages: [
        { role: 'assistant', content: '', reasoningContent: 'previous thinking' },
        { role: 'user', content: 'continue' },
      ],
      turn: 1,
    })

    const request = JSON.parse(fetchImpl.mock.calls[0][1].body)
    expect(request.messages[0]).toMatchObject({
      role: 'assistant',
      content: null,
      reasoning_content: 'previous thinking',
    })
  })
})
