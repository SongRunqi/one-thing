import { describe, expect, it, vi } from 'vitest'
import { runAgentLoop } from '../runner.js'
import type { AgentProvider, AgentTurn } from '../types.js'

describe('agent loop runner', () => {
  it('executes selected tools and feeds results into the next model turn', async () => {
    const provider: AgentProvider = {
      id: 'fake',
      runTurn: vi.fn(async request => {
        if (request.turn === 1) {
          request.onEvent?.({ type: 'text-delta', turn: 1, delta: 'calling' })
          return {
            message: {
              role: 'assistant',
              content: '',
              reasoningContent: 'need a tool',
              toolCalls: [{
                id: 'call_1',
                name: 'make_note',
                arguments: '{"text":"hello"}',
              }],
            },
            finishReason: 'tool_calls',
          } satisfies AgentTurn
        }

        expect(request.messages.at(-1)).toEqual({
          role: 'tool',
          toolCallId: 'call_1',
          content: 'noted: hello',
        })
        return {
          message: {
            role: 'assistant',
            content: '{"changed":true}',
          },
          finishReason: 'stop',
        } satisfies AgentTurn
      }),
    }
    const execute = vi.fn(async args => ({ content: `noted: ${args.text}` }))
    const events: string[] = []

    const result = await runAgentLoop({
      provider,
      model: 'fake-model',
      messages: [{ role: 'user', content: 'make note' }],
      tools: [
        {
          name: 'make_note',
          description: 'Create a note',
          parameters: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
          execute,
        },
        {
          name: 'disabled_tool',
          parameters: { type: 'object', properties: {}, required: [] },
          execute: async () => ({ content: 'nope' }),
        },
      ],
      selectedToolNames: ['make_note'],
      sessionId: 's1',
      messageId: 'm1',
      maxTurns: 4,
      onEvent(event) {
        events.push(event.type)
      },
    })

    expect(provider.runTurn).toHaveBeenCalledTimes(2)
    expect((provider.runTurn as any).mock.calls[0][0].tools.map((tool: any) => tool.name))
      .toEqual(['make_note'])
    expect(execute).toHaveBeenCalledWith(
      { text: 'hello' },
      expect.objectContaining({ sessionId: 's1', messageId: 'm1', toolCallId: 'call_1' }),
    )
    expect(result.text).toBe('{"changed":true}')
    expect(result.turns).toBe(2)
    expect(result.toolResults).toHaveLength(1)
    expect(events).toContain('tool-result')
  })
})
