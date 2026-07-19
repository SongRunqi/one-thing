import { describe, expect, it, vi } from 'vitest'
import { createAcpConnector } from '../acp-connector.js'
import type { CoreACPPromptStreamEvent, CoreACPPromptStreamOptions } from '../../agent-loop/providers/acp.js'

async function* replay(events: CoreACPPromptStreamEvent[]): AsyncGenerator<CoreACPPromptStreamEvent, void, void> {
  for (const event of events) yield event
}

describe('AcpConnector', () => {
  it('streams a full ACP turn as normalized agent events with externally-executed tools', async () => {
    const calls: { model: string; options: CoreACPPromptStreamOptions }[] = []
    const connector = createAcpConnector({
      agentId: 'claude-code',
      streamPrompt: (model, options) => {
        calls.push({ model, options })
        return replay([
          {
            type: 'update',
            notification: {
              update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'hi ' } },
            },
          },
          {
            type: 'update',
            notification: {
              update: {
                sessionUpdate: 'tool_call',
                toolCallId: 'tc-1',
                title: 'Run ls',
                kind: 'execute',
                status: 'pending',
                rawInput: { command: 'ls' },
              },
            },
          },
          {
            type: 'update',
            notification: {
              update: { sessionUpdate: 'tool_call_update', toolCallId: 'tc-1', status: 'completed' },
            },
          },
          { type: 'finish', stopReason: 'end_turn' },
        ])
      },
    })

    expect(connector.id).toBe('acp:claude-code')
    expect(connector.capabilities.concurrentSessions).toBe('multiplexed')

    const events = []
    for await (const event of connector.streamTurn({
      localSessionId: 'session-1',
      prompt: 'list files',
      cwd: '/tmp/project',
      turn: 1,
    })) {
      events.push(event)
    }

    expect(calls).toEqual([{
      model: 'claude-code',
      options: {
        localSessionId: 'session-1',
        prompt: 'list files',
        cwd: '/tmp/project',
        abortSignal: undefined,
      },
    }])
    expect(events.map(event => event.type)).toEqual([
      'text-delta',
      'tool-call-start',
      'tool-call-done',
      'tool-metadata',
      'tool-result',
      'finish',
    ])
    const done = events.find(event => event.type === 'tool-call-done')
    expect(done).toMatchObject({ toolCall: { id: 'tc-1', externallyExecuted: true } })
  })

  it('routes interrupt to the ACP session cancellation', async () => {
    const cancelSession = vi.fn(async () => {})
    const connector = createAcpConnector({
      agentId: 'codex',
      streamPrompt: () => replay([{ type: 'finish', stopReason: 'end_turn' }]),
      cancelSession,
    })
    await connector.interrupt('session-9')
    expect(cancelSession).toHaveBeenCalledWith('session-9', 'codex')
  })
})
