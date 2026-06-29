import { describe, expect, it } from 'vitest'
import { AgentLoopPauseForConfirmationError } from './errors.js'
import { runAgentLoop } from './runner.js'
import type {
  AgentLoopOptions,
  AgentProvider,
  AgentStreamEvent,
  AgentTool,
  AgentTurnStreamEvent,
} from './types.js'

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

async function waitFor(predicate: () => boolean): Promise<void> {
  const started = Date.now()
  while (!predicate()) {
    if (Date.now() - started > 1_000) {
      throw new Error('Timed out waiting for condition')
    }
    await new Promise(resolve => setTimeout(resolve, 0))
  }
}

function baseProvider(streamTurn: AgentProvider['streamTurn']): AgentProvider {
  return {
    id: 'test-provider',
    capabilities: {
      capabilities: ['text-input', 'text-output', 'streaming', 'tool-calls'],
      inputModalities: ['text'],
      outputModalities: ['text'],
      supportsStreaming: true,
      supportsTools: true,
    },
    streamTurn,
  }
}

function toolCallEvents(turn: number): AgentTurnStreamEvent[] {
  return [
    { type: 'tool-call-start', turn, toolCallId: 'call_1', toolName: 'read' },
    { type: 'tool-call-delta', turn, toolCallId: 'call_1', toolName: 'read', argumentsDelta: '{"path":"a"}' },
    { type: 'tool-call-done', turn, toolCall: { id: 'call_1', name: 'read', arguments: '{"path":"a"}' } },
    { type: 'tool-call-start', turn, toolCallId: 'call_2', toolName: 'read' },
    { type: 'tool-call-delta', turn, toolCallId: 'call_2', toolName: 'read', argumentsDelta: '{"path":"b"}' },
    { type: 'tool-call-done', turn, toolCall: { id: 'call_2', name: 'read', arguments: '{"path":"b"}' } },
    { type: 'finish', turn, finishReason: 'tool_calls' },
  ]
}

function eventLabel(event: AgentStreamEvent): string | null {
  switch (event.type) {
    case 'tool-call-start':
      return `start:${event.toolCallId}`
    case 'tool-call-delta':
      return `delta:${event.toolCallId}`
    case 'tool-call-done':
      return `done:${event.toolCall.id}`
    case 'tool-result':
      return `result:${event.toolCall.id}`
    default:
      return null
  }
}

function baseOptions(provider: AgentProvider, tool: AgentTool, events: string[]): AgentLoopOptions {
  return {
    provider,
    model: 'test-model',
    messages: [{ role: 'user', content: 'read two files' }],
    tools: [tool],
    sessionId: 'session-1',
    messageId: 'message-1',
    maxTurns: 2,
    onEvent(event) {
      const label = eventLabel(event)
      if (label) events.push(label)
    },
  }
}

describe('runAgentLoop tool sequencing', () => {
  it('does not stream the next tool call until the current tool execution settles', async () => {
    const events: string[] = []
    const releaseFirst = deferred()
    const provider = baseProvider(async function* (request) {
      if (request.turn === 1) {
        yield* toolCallEvents(request.turn)
        return
      }
      yield { type: 'text-delta', turn: request.turn, delta: 'done' }
      yield { type: 'finish', turn: request.turn, finishReason: 'stop' }
    })
    const tool: AgentTool = {
      name: 'read',
      parameters: { type: 'object' },
      async execute(args) {
        const path = String(args.path)
        events.push(`execute:${path}:start`)
        if (path === 'a') await releaseFirst.promise
        events.push(`execute:${path}:end`)
        return { content: `read ${path}` }
      },
    }

    const run = runAgentLoop(baseOptions(provider, tool, events))

    await waitFor(() => events.includes('execute:a:start'))
    expect(events).not.toContain('start:call_2')

    releaseFirst.resolve()
    await run

    expect(events.indexOf('result:call_1')).toBeGreaterThan(events.indexOf('execute:a:end'))
    expect(events.indexOf('start:call_2')).toBeGreaterThan(events.indexOf('result:call_1'))
    expect(events.indexOf('result:call_2')).toBeGreaterThan(events.indexOf('execute:b:end'))
  })

  it('does not stream later tool calls when the current tool pauses for confirmation', async () => {
    const events: string[] = []
    const provider = baseProvider(async function* (request) {
      yield* toolCallEvents(request.turn)
    })
    const tool: AgentTool = {
      name: 'read',
      parameters: { type: 'object' },
      async execute(args) {
        events.push(`execute:${String(args.path)}`)
        return {
          content: '',
          error: 'confirm',
          requiresConfirmation: true,
        }
      },
    }

    await expect(runAgentLoop(baseOptions(provider, tool, events)))
      .rejects.toBeInstanceOf(AgentLoopPauseForConfirmationError)

    expect(events).toContain('result:call_1')
    expect(events).not.toContain('start:call_2')
    expect(events).not.toContain('execute:b')
  })
})
