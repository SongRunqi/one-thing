import { describe, expect, it } from 'vitest'
import { createExternalAgentProvider } from '../provider.js'
import type {
  ExternalAgentConnector,
  ExternalAgentTurnRequest,
} from '../types.js'

function captureConnector(captured: ExternalAgentTurnRequest[]): ExternalAgentConnector {
  return {
    id: 'claude-code-agent',
    capabilities: {
      streamingText: true,
      thinking: true,
      toolSteps: true,
      permissionBridge: 'callback',
      resume: true,
      fork: true,
      steer: false,
      imagesIn: false,
      mcpInjection: 'in-process',
      concurrentSessions: 'per-process',
    },
    async *streamTurn(request) {
      captured.push(request)
      yield { type: 'finish', turn: request.turn, finishReason: 'stop' }
    },
    async interrupt() {},
    async dispose() {},
  }
}

describe('createExternalAgentProvider', () => {
  it('maps the pseudo-model to CLI default and forwards real models with thinking/effort', async () => {
    const captured: ExternalAgentTurnRequest[] = []
    const provider = createExternalAgentProvider({
      providerId: 'claude-code-agent',
      connector: captureConnector(captured),
      localSessionId: 'session-1',
      workingDirectory: '/tmp/project',
    })

    const drain = async (model: string) => {
      for await (const _event of provider.streamTurn!({
        model,
        messages: [{ role: 'user', content: 'hi' }],
        thinking: 'enabled',
        reasoningEffort: 'xhigh',
        turn: 1,
      })) { /* drain */ }
    }

    await drain('claude-code-agent')
    expect(captured.at(-1)).toMatchObject({
      model: undefined,
      thinking: 'enabled',
      reasoningEffort: 'xhigh',
      cwd: '/tmp/project',
    })

    await drain('claude-opus-4-8')
    expect(captured.at(-1)).toMatchObject({ model: 'claude-opus-4-8' })
  })

  it('falls back to process.cwd() when the working directory is an empty string', async () => {
    const captured: ExternalAgentTurnRequest[] = []
    const provider = createExternalAgentProvider({
      providerId: 'claude-code-agent',
      connector: captureConnector(captured),
      localSessionId: 'session-1',
      workingDirectory: '',
    })
    for await (const _event of provider.streamTurn!({
      model: 'claude-code-agent',
      messages: [{ role: 'user', content: 'hi' }],
      turn: 1,
    })) { /* drain */ }
    expect(captured.at(-1)?.cwd).toBe(process.cwd())
  })
})
