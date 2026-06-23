import { describe, expect, it, vi } from 'vitest'

const { acpManager } = vi.hoisted(() => ({
  acpManager: {
    streamPrompt: vi.fn(),
  },
}))

vi.mock('../../acp/index.js', () => ({
  ACPManager: acpManager,
}))

import { createACPAgentProvider } from '../providers/acp.js'
import { collectAgentTurnFromStream } from '../stream.js'
import { providerSupportsCapability } from '../capabilities.js'

describe('ACP agent provider', () => {
  it('exposes ACP as a stream-capable agent provider', async () => {
    acpManager.streamPrompt.mockImplementation(async function* () {
      yield {
        type: 'update',
        notification: {
          update: {
            sessionUpdate: 'agent_thought_chunk',
            content: { type: 'text', text: 'thinking ' },
          },
        },
      }
      yield {
        type: 'update',
        notification: {
          update: {
            sessionUpdate: 'agent_message_chunk',
            content: { type: 'text', text: 'answer' },
          },
        },
      }
      yield {
        type: 'finish',
        stopReason: 'end_turn',
        usage: { inputTokens: 3, outputTokens: 2, totalTokens: 5 },
      }
    })

    const provider = createACPAgentProvider({
      workingDirectory: '/tmp/project',
      localSessionId: 'local-1',
    })

    expect(provider.capabilities?.supportsStreaming).toBe(true)
    expect(provider.capabilities?.supportsTools).toBe(false)
    await expect(providerSupportsCapability(provider, 'codex-acp', 'streaming')).resolves.toBe(true)
    await expect(providerSupportsCapability(provider, 'codex-acp', 'tool-calls')).resolves.toBe(false)
    expect(provider.streamTurn).toBeDefined()

    const events: string[] = []
    const turn = await collectAgentTurnFromStream(provider.streamTurn!({
      model: 'codex-acp',
      messages: [{ role: 'user', content: 'do work' }],
      turn: 1,
    }), event => events.push(event.type))

    expect(acpManager.streamPrompt).toHaveBeenCalledWith('codex-acp', {
      localSessionId: 'local-1',
      prompt: 'do work',
      cwd: '/tmp/project',
      abortSignal: undefined,
    })
    expect(events).toEqual(['reasoning-delta', 'text-delta', 'finish'])
    expect(turn).toEqual({
      message: {
        role: 'assistant',
        content: 'answer',
        reasoningContent: 'thinking ',
      },
      finishReason: 'stop',
      usage: { inputTokens: 3, outputTokens: 2, totalTokens: 5 },
    })
  })

  it('passes abort signals through to the ACP manager', async () => {
    acpManager.streamPrompt.mockImplementation(async function* () {
      yield {
        type: 'finish',
        stopReason: 'end_turn',
      }
    })
    const controller = new AbortController()
    const provider = createACPAgentProvider({
      workingDirectory: '/tmp/project',
      localSessionId: 'local-abort',
    })

    await collectAgentTurnFromStream(provider.streamTurn!({
      model: 'codex-acp',
      messages: [{ role: 'user', content: 'cancelable work' }],
      turn: 1,
      abortSignal: controller.signal,
    }))

    expect(acpManager.streamPrompt).toHaveBeenCalledWith('codex-acp', {
      localSessionId: 'local-abort',
      prompt: 'cancelable work',
      cwd: '/tmp/project',
      abortSignal: controller.signal,
    })
  })
})
