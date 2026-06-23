import { describe, expect, it, vi } from 'vitest'
import { streamAgentLoopProviderChunks } from '../bridge.js'
import { isAgentLoopPauseForConfirmationError } from '../errors.js'
import type { AgentProvider } from '../types.js'

describe('agent loop bridge', () => {
  it('streams provider-shaped chunks while running the full agent loop', async () => {
    const provider: AgentProvider = {
      id: 'bridge-provider',
      capabilities: {
        capabilities: ['text-input', 'text-output', 'streaming', 'tool-calls'],
        inputModalities: ['text'],
        outputModalities: ['text'],
        supportsStreaming: true,
        supportsTools: true,
      },
      async *streamTurn(request) {
        if (request.turn === 1) {
          yield { type: 'tool-call-start', turn: 1, toolCallId: 'call_1', toolName: 'lookup' }
          yield {
            type: 'tool-call-delta',
            turn: 1,
            toolCallId: 'call_1',
            toolName: 'lookup',
            argumentsDelta: '{"query":"moon"}',
          }
          yield {
            type: 'tool-call-done',
            turn: 1,
            toolCall: { id: 'call_1', name: 'lookup', arguments: '{"query":"moon"}' },
          }
          yield { type: 'finish', turn: 1, finishReason: 'tool_calls' }
          return
        }

        expect(request.messages.at(-1)).toEqual({
          role: 'tool',
          toolCallId: 'call_1',
          content: 'result: moon',
        })
        yield { type: 'text-delta', turn: 2, delta: 'done' }
        yield { type: 'finish', turn: 2, finishReason: 'stop' }
      },
    }
    const onEvent = vi.fn()
    const chunks = []

    for await (const chunk of streamAgentLoopProviderChunks({
      provider,
      model: 'bridge-model',
      messages: [{ role: 'user', content: 'lookup the moon' }],
      tools: [{
        name: 'lookup',
        parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
        execute: async args => ({ content: `result: ${args.query}` }),
      }],
      sessionId: 's1',
      messageId: 'm1',
      onEvent,
    })) {
      chunks.push(chunk)
    }

    expect(chunks).toEqual([
      { type: 'turn-start', turnStart: { turn: 1 } },
      { type: 'tool-input-start', toolInputStart: { toolCallId: 'call_1', toolName: 'lookup' } },
      { type: 'tool-input-delta', toolInputDelta: { toolCallId: 'call_1', argsTextDelta: '{"query":"moon"}' } },
      { type: 'tool-input-end', toolInputEnd: { toolCallId: 'call_1' } },
      { type: 'finish', finishReason: 'tool-calls', usage: undefined },
      {
        type: 'tool-result',
        toolResult: {
          toolCallId: 'call_1',
          result: { content: 'result: moon' },
        },
      },
      { type: 'turn-start', turnStart: { turn: 2 } },
      { type: 'text', text: 'done' },
      { type: 'finish', finishReason: 'stop', usage: undefined },
    ])
    expect(onEvent).toHaveBeenCalledWith({ type: 'tool-result', turn: 1, toolCall: {
      id: 'call_1',
      name: 'lookup',
      arguments: '{"query":"moon"}',
    }, result: { content: 'result: moon' } })
  })

  it('yields confirmation-gated tool results before surfacing the pause signal', async () => {
    const provider: AgentProvider = {
      id: 'bridge-confirmation-provider',
      capabilities: {
        capabilities: ['text-input', 'text-output', 'streaming', 'tool-calls'],
        inputModalities: ['text'],
        outputModalities: ['text'],
        supportsStreaming: true,
        supportsTools: true,
      },
      async *streamTurn(request) {
        expect(request.turn).toBe(1)
        yield {
          type: 'tool-call-done',
          turn: 1,
          toolCall: { id: 'call_1', name: 'bash', arguments: '{"cmd":"rm -rf tmp"}' },
        }
        yield { type: 'finish', turn: 1, finishReason: 'tool_calls' }
      },
    }
    const chunks = []
    let error: unknown

    try {
      for await (const chunk of streamAgentLoopProviderChunks({
        provider,
        model: 'bridge-model',
        messages: [{ role: 'user', content: 'delete tmp' }],
        tools: [{
          name: 'bash',
          parameters: { type: 'object', properties: { cmd: { type: 'string' } }, required: ['cmd'] },
          execute: async () => ({
            content: '',
            error: 'Needs approval',
            requiresConfirmation: true,
            commandType: 'dangerous',
          }),
        }],
        sessionId: 's1',
        messageId: 'm1',
      })) {
        chunks.push(chunk)
      }
    } catch (caught) {
      error = caught
    }

    expect(isAgentLoopPauseForConfirmationError(error)).toBe(true)
    expect(chunks).toEqual([
      { type: 'turn-start', turnStart: { turn: 1 } },
      {
        type: 'tool-call',
        toolCall: {
          toolCallId: 'call_1',
          toolName: 'bash',
          args: { cmd: 'rm -rf tmp' },
        },
      },
      { type: 'finish', finishReason: 'tool-calls', usage: undefined },
      {
        type: 'tool-result',
        toolResult: {
          toolCallId: 'call_1',
          result: {
            content: '',
            error: 'Needs approval',
            requiresConfirmation: true,
            commandType: 'dangerous',
          },
        },
      },
    ])
  })
})
