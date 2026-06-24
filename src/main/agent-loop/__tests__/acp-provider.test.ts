import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ACPPromptStreamEvent, ACPPromptStreamOptions } from '../../acp/index.js'
import { createACPAgentProvider } from '../providers/acp.js'
import type { AgentTurnStreamEvent } from '../types.js'

interface ACPStreamCall {
  agentId: string
  options: ACPPromptStreamOptions
}

const acpMocks = vi.hoisted(() => ({
  streamPrompt: vi.fn(),
}))

vi.mock('../../acp/index.js', () => ({
  ACPManager: {
    streamPrompt: acpMocks.streamPrompt,
  },
}))

function textUpdate(sessionUpdate: 'agent_message_chunk' | 'agent_thought_chunk', text: string): ACPPromptStreamEvent {
  return {
    type: 'update',
    notification: {
      sessionId: 'acp-session',
      update: {
        sessionUpdate,
        content: { type: 'text', text },
      },
    },
  }
}

async function* acpEvents(events: ACPPromptStreamEvent[]): AsyncGenerator<ACPPromptStreamEvent, void, void> {
  for (const event of events) {
    yield event
  }
}

describe('ACP agent provider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('streams ACP message, thought, warning, and finish events as agent turn events', async () => {
    const controller = new AbortController()
    const calls: ACPStreamCall[] = []
    acpMocks.streamPrompt.mockImplementation((agentId: string, options: ACPPromptStreamOptions) => {
      calls.push({ agentId, options })
      return acpEvents([
        textUpdate('agent_thought_chunk', 'thinking'),
        { type: 'warning', message: 'heads up' },
        textUpdate('agent_message_chunk', 'hello'),
        {
          type: 'finish',
          stopReason: 'end_turn',
          usage: { inputTokens: 2, outputTokens: 3, totalTokens: 5 },
        },
      ])
    })

    const provider = createACPAgentProvider({
      workingDirectory: '/tmp/project',
      localSessionId: 'local-acp-session',
    })
    if (!provider.streamTurn) throw new Error('ACP provider did not expose streamTurn')

    const events: AgentTurnStreamEvent[] = []
    for await (const event of provider.streamTurn({
      model: 'claude-code',
      messages: [
        { role: 'system', content: 'project notes' },
        { role: 'user', content: 'run checks' },
      ],
      abortSignal: controller.signal,
      turn: 7,
    })) {
      events.push(event)
    }

    expect(calls).toEqual([{
      agentId: 'claude-code',
      options: {
        localSessionId: 'local-acp-session',
        prompt: 'run checks',
        cwd: '/tmp/project',
        abortSignal: controller.signal,
      },
    }])
    expect(events).toEqual([
      { type: 'reasoning-delta', turn: 7, delta: 'thinking' },
      { type: 'reasoning-delta', turn: 7, delta: 'heads up' },
      { type: 'text-delta', turn: 7, delta: 'hello' },
      {
        type: 'finish',
        turn: 7,
        finishReason: 'stop',
        usage: { inputTokens: 2, outputTokens: 3, totalTokens: 5 },
      },
    ])
  })

  it('uses a deterministic default local session id and rejects empty prompts', async () => {
    acpMocks.streamPrompt.mockImplementation((agentId: string, options: ACPPromptStreamOptions) =>
      acpEvents([{
        type: 'finish',
        stopReason: 'max_tokens',
      }]),
    )

    const provider = createACPAgentProvider()
    if (!provider.streamTurn) throw new Error('ACP provider did not expose streamTurn')

    const events: AgentTurnStreamEvent[] = []
    for await (const event of provider.streamTurn({
      model: 'pi',
      messages: [{ role: 'user', content: '  hello acp  ' }],
      turn: 1,
    })) {
      events.push(event)
    }

    expect(acpMocks.streamPrompt).toHaveBeenCalledWith('pi', {
      localSessionId: 'acp-pi',
      prompt: 'hello acp',
      cwd: process.cwd(),
      abortSignal: undefined,
    })
    expect(events).toEqual([{ type: 'finish', turn: 1, finishReason: 'length', usage: undefined }])

    await expect(async () => {
      for await (const _event of provider.streamTurn!({
        model: 'pi',
        messages: [{ role: 'system', content: 'no user prompt' }],
        turn: 1,
      })) {
        // Exhaust generator to surface prompt validation.
      }
    }).rejects.toThrow('ACP prompt is empty')
  })
})
