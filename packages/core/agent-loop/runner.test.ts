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

describe('runAgentLoop concurrent tool execution', () => {
  it('streams later tool calls and executes them while an earlier tool is still running', async () => {
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
      executionMode: 'parallel',
      async execute(args) {
        const path = String(args.path)
        events.push(`execute:${path}:start`)
        if (path === 'a') await releaseFirst.promise
        events.push(`execute:${path}:end`)
        return { content: `read ${path}` }
      },
    }

    const run = runAgentLoop(baseOptions(provider, tool, events))

    // While call_1 is blocked, call_2 must still stream, execute, and settle.
    await waitFor(() => events.includes('result:call_2'))
    expect(events).toContain('start:call_2')
    expect(events).toContain('execute:b:end')
    expect(events).not.toContain('execute:a:end')

    releaseFirst.resolve()
    const result = await run

    expect(events.indexOf('result:call_1')).toBeGreaterThan(events.indexOf('execute:a:end'))
    // Completion order: call_2 settled first…
    expect(events.indexOf('result:call_2')).toBeLessThan(events.indexOf('result:call_1'))
    // …but tool messages follow the assistant's declaration order.
    const toolMessages = result.messages.filter(message => message.role === 'tool')
    expect(toolMessages.map(message => message.toolCallId)).toEqual(['call_1', 'call_2'])
    expect(result.toolResults.map(item => item.toolCall.id)).toEqual(['call_1', 'call_2'])
  })

  it('orders a later read behind an in-flight mutation (barrier semantics)', async () => {
    const events: string[] = []
    const releaseEdit = deferred()
    let fileContent = 'old'
    const provider = baseProvider(async function* (request) {
      if (request.turn === 1) {
        yield { type: 'tool-call-done', turn: request.turn, toolCall: { id: 'call_edit', name: 'edit', arguments: '{"path":"a"}' } }
        yield { type: 'tool-call-done', turn: request.turn, toolCall: { id: 'call_read', name: 'read', arguments: '{"path":"a"}' } }
        yield { type: 'finish', turn: request.turn, finishReason: 'tool_calls' }
        return
      }
      yield { type: 'text-delta', turn: request.turn, delta: 'done' }
      yield { type: 'finish', turn: request.turn, finishReason: 'stop' }
    })
    // No executionMode declaration → barrier.
    const editTool: AgentTool = {
      name: 'edit',
      parameters: { type: 'object' },
      async execute() {
        events.push('execute:edit:start')
        await releaseEdit.promise
        fileContent = 'new'
        events.push('execute:edit:end')
        return { content: 'edited' }
      },
    }
    const readTool: AgentTool = {
      name: 'read',
      parameters: { type: 'object' },
      executionMode: 'parallel',
      async execute() {
        events.push(`execute:read:${fileContent}`)
        return { content: fileContent }
      },
    }

    const run = runAgentLoop({
      ...baseOptions(provider, editTool, events),
      tools: [editTool, readTool],
    })

    // The read streamed in while the edit is still running; it must stay queued.
    await waitFor(() => events.includes('done:call_read'))
    expect(events).toContain('execute:edit:start')
    expect(events.some(event => event.startsWith('execute:read:'))).toBe(false)

    releaseEdit.resolve()
    const result = await run

    // The read only ran after the edit completed, observing post-edit state.
    expect(events).toContain('execute:read:new')
    expect(events).not.toContain('execute:read:old')
    expect(events.indexOf('execute:read:new')).toBeGreaterThan(events.indexOf('execute:edit:end'))
    const toolMessages = result.messages.filter(message => message.role === 'tool')
    expect(toolMessages.map(message => message.toolCallId)).toEqual(['call_edit', 'call_read'])
  })

  it('lets sibling tools settle before pausing for confirmation, and pauses on the first declared', async () => {
    const events: string[] = []
    const provider = baseProvider(async function* (request) {
      yield* toolCallEvents(request.turn)
    })
    const tool: AgentTool = {
      name: 'read',
      parameters: { type: 'object' },
      executionMode: 'parallel',
      async execute(args) {
        const path = String(args.path)
        // call_1 settles after call_2 so the declaration-order tie-break is exercised.
        if (path === 'a') await new Promise(resolve => setTimeout(resolve, 10))
        events.push(`execute:${path}`)
        return {
          content: '',
          error: 'confirm',
          requiresConfirmation: true,
        }
      },
    }

    const run = runAgentLoop(baseOptions(provider, tool, events))
    const error = await run.then(
      () => {
        throw new Error('Expected the loop to pause for confirmation')
      },
      (err: unknown) => err,
    )

    expect(error).toBeInstanceOf(AgentLoopPauseForConfirmationError)
    expect((error as AgentLoopPauseForConfirmationError).toolCall.id).toBe('call_1')
    // Siblings are not stranded: both executed and reported before the pause.
    expect(events).toContain('execute:a')
    expect(events).toContain('execute:b')
    expect(events).toContain('result:call_1')
    expect(events).toContain('result:call_2')
  })

  it('caps concurrent executions at maxConcurrentTools', async () => {
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
      executionMode: 'parallel',
      async execute(args) {
        const path = String(args.path)
        events.push(`execute:${path}:start`)
        if (path === 'a') await releaseFirst.promise
        events.push(`execute:${path}:end`)
        return { content: `read ${path}` }
      },
    }

    const run = runAgentLoop({
      ...baseOptions(provider, tool, events),
      maxConcurrentTools: 1,
    })

    // Both tool calls stream in, but with a cap of 1 the second execution
    // must wait for the first slot to free up.
    await waitFor(() => events.includes('done:call_2'))
    expect(events).toContain('execute:a:start')
    expect(events).not.toContain('execute:b:start')

    releaseFirst.resolve()
    await run

    expect(events.indexOf('execute:b:start')).toBeGreaterThan(events.indexOf('execute:a:end'))
  })

  it('blocks the 4th consecutive identical failing call (doom loop guard)', async () => {
    const events: string[] = []
    const repeatedCall = (id: string): AgentTurnStreamEvent[] => [
      { type: 'tool-call-start', turn: 1, toolCallId: id, toolName: 'read' },
      { type: 'tool-call-done', turn: 1, toolCall: { id, name: 'read', arguments: '{"path":"same"}' } },
    ]
    const provider = baseProvider(async function* (request) {
      if (request.turn === 1) {
        yield* ['call_1', 'call_2', 'call_3', 'call_4'].flatMap(repeatedCall)
        yield { type: 'finish', turn: request.turn, finishReason: 'tool_calls' }
        return
      }
      yield { type: 'text-delta', turn: request.turn, delta: 'done' }
      yield { type: 'finish', turn: request.turn, finishReason: 'stop' }
    })
    let executions = 0
    const tool: AgentTool = {
      name: 'read',
      parameters: { type: 'object' },
      async execute() {
        executions += 1
        return { content: '', error: 'not found' }
      },
    }

    const result = await runAgentLoop(baseOptions(provider, tool, events))

    expect(executions).toBe(3)
    const fourth = result.toolResults.find(item => item.toolCall.id === 'call_4')
    expect(fourth?.result.error).toMatch(/Repeated identical tool call/)
  })

  it('never blocks repeated identical successful calls (legitimate polling)', async () => {
    const events: string[] = []
    const repeatedCall = (id: string): AgentTurnStreamEvent[] => [
      { type: 'tool-call-start', turn: 1, toolCallId: id, toolName: 'read' },
      { type: 'tool-call-done', turn: 1, toolCall: { id, name: 'read', arguments: '{"job_id":"bg-1"}' } },
    ]
    const provider = baseProvider(async function* (request) {
      if (request.turn === 1) {
        yield* ['call_1', 'call_2', 'call_3', 'call_4', 'call_5'].flatMap(repeatedCall)
        yield { type: 'finish', turn: request.turn, finishReason: 'tool_calls' }
        return
      }
      yield { type: 'text-delta', turn: request.turn, delta: 'done' }
      yield { type: 'finish', turn: request.turn, finishReason: 'stop' }
    })
    let executions = 0
    const tool: AgentTool = {
      name: 'read',
      parameters: { type: 'object' },
      async execute() {
        executions += 1
        return { content: 'still starting' }
      },
    }

    const result = await runAgentLoop(baseOptions(provider, tool, events))

    expect(executions).toBe(5)
    expect(result.toolResults.every(item => !item.result.error)).toBe(true)
  })

  it('prefers abort over pause when converging a turn with mixed failures', async () => {
    const events: string[] = []
    const provider = baseProvider(async function* (request) {
      yield* toolCallEvents(request.turn)
    })
    const tool: AgentTool = {
      name: 'read',
      parameters: { type: 'object' },
      async execute(args) {
        const path = String(args.path)
        events.push(`execute:${path}`)
        if (path === 'a') {
          return { content: '', error: 'confirm', requiresConfirmation: true }
        }
        return { content: '', aborted: true }
      },
    }

    await expect(runAgentLoop(baseOptions(provider, tool, events)))
      .rejects.toMatchObject({ name: 'AbortError' })

    expect(events).toContain('execute:a')
    expect(events).toContain('execute:b')
  })
})

describe('runAgentLoop externally-executed tool calls', () => {
  const externalCall = { id: 'ext_1', name: 'bash', arguments: '{"command":"ls"}', externallyExecuted: true as const }

  function externalProvider(): AgentProvider {
    return baseProvider(async function* (request) {
      const turn = request.turn
      yield { type: 'text-delta', turn, delta: 'working…' }
      yield { type: 'tool-call-start', turn, toolCallId: 'ext_1', toolName: 'bash' }
      yield { type: 'tool-call-done', turn, toolCall: externalCall }
      yield {
        type: 'tool-partial-result',
        turn,
        toolCall: externalCall,
        update: { content: [{ type: 'text', text: 'partial output' }] },
      }
      yield {
        type: 'tool-result',
        turn,
        toolCall: externalCall,
        result: { content: 'file-a\nfile-b' },
      }
      yield { type: 'text-delta', turn, delta: ' done' }
      yield { type: 'finish', turn, finishReason: 'stop' }
    })
  }

  it('never executes an externally-executed call locally, even when a same-named tool exists', async () => {
    let executions = 0
    const tool: AgentTool = {
      name: 'bash',
      parameters: { type: 'object' },
      async execute() {
        executions += 1
        return { content: 'LOCAL SIDE EFFECT' }
      },
    }
    const seen: AgentStreamEvent[] = []
    const result = await runAgentLoop({
      provider: externalProvider(),
      model: 'external-agent',
      messages: [{ role: 'user', content: 'list files' }],
      tools: [tool],
      sessionId: 'session-1',
      messageId: 'message-1',
      onEvent(event) {
        seen.push(event)
      },
    })

    expect(executions).toBe(0)
    // Single turn: the external call must not trigger another round.
    expect(result.turns).toBe(1)
    expect(result.finishReason).toBe('stop')
    expect(result.text).toBe('working… done')
    // The provider's own result is recorded for observability…
    expect(result.toolResults).toEqual([
      { toolCall: externalCall, result: { content: 'file-a\nfile-b' } },
    ])
    // …but no tool message is synthesized into the transcript.
    expect(result.messages.filter(message => message.role === 'tool')).toEqual([])
    const assistant = result.messages.at(-1)
    expect(assistant?.toolCalls).toEqual([externalCall])
    // Events pass through to the observer, including the tool result.
    expect(seen.filter(event => event.type === 'tool-partial-result')).toHaveLength(1)
    expect(seen.filter(event => event.type === 'tool-result')).toHaveLength(1)
  })

  it('drops provider-emitted tool observation events for calls it did not mark externally executed', async () => {
    const spoofedCall = { id: 'call_local', name: 'read', arguments: '{}' }
    const provider = baseProvider(async function* (request) {
      const turn = request.turn
      yield {
        type: 'tool-result',
        turn,
        toolCall: spoofedCall,
        result: { content: 'spoofed' },
      }
      yield { type: 'text-delta', turn, delta: 'ok' }
      yield { type: 'finish', turn, finishReason: 'stop' }
    })
    const seen: AgentStreamEvent[] = []
    const result = await runAgentLoop({
      provider,
      model: 'test-model',
      messages: [{ role: 'user', content: 'hi' }],
      sessionId: 'session-1',
      messageId: 'message-1',
      onEvent(event) {
        seen.push(event)
      },
    })

    expect(result.toolResults).toEqual([])
    expect(seen.filter(event => event.type === 'tool-result')).toEqual([])
    expect(result.text).toBe('ok')
  })
})

describe('runAgentLoop no-valid-tool-call nudge', () => {
  it('nudges the model once when a turn claims tool_calls with zero calls, then continues', async () => {
    const turnsSeen: number[] = []
    const provider = baseProvider(async function* (request) {
      turnsSeen.push(request.turn)
      if (request.turn === 1) {
        // Provider-side loss: finish claims tool_calls but no call was emitted.
        yield { type: 'finish', turn: request.turn, finishReason: 'tool_calls' }
        return
      }
      yield { type: 'text-delta', turn: request.turn, delta: 'recovered' }
      yield { type: 'finish', turn: request.turn, finishReason: 'stop' }
    })

    const result = await runAgentLoop({
      provider,
      model: 'test-model',
      messages: [{ role: 'user', content: 'do the thing' }],
      sessionId: 'session-1',
      messageId: 'message-1',
      maxTurns: 5,
    })

    expect(turnsSeen).toEqual([1, 2])
    expect(result.text).toBe('recovered')
    expect(result.finishReason).toBe('stop')
    const nudges = result.messages.filter(
      message => message.role === 'user'
        && typeof message.content === 'string'
        && message.content.includes('no valid tool call was received'),
    )
    expect(nudges).toHaveLength(1)
  })

  it('stops nudging after two attempts and lets the run end', async () => {
    let calls = 0
    const provider = baseProvider(async function* (request) {
      calls++
      yield { type: 'finish', turn: request.turn, finishReason: 'tool_calls' }
    })

    const result = await runAgentLoop({
      provider,
      model: 'test-model',
      messages: [{ role: 'user', content: 'do the thing' }],
      sessionId: 'session-1',
      messageId: 'message-1',
      maxTurns: 10,
    })

    // 1 original turn + 2 nudged retries, then the run ends normally.
    expect(calls).toBe(3)
    expect(result.turns).toBe(3)
  })
})

describe('runAgentLoop turn-level auto-retry', () => {
  it('retries transient provider errors in the same turn and emits auto-retry events', async () => {
    let calls = 0
    const provider = baseProvider(async function* (request) {
      calls++
      if (calls <= 2) {
        throw Object.assign(new Error('fetch failed'), {})
      }
      yield { type: 'text-delta', turn: request.turn, delta: 'recovered' }
      yield { type: 'finish', turn: request.turn, finishReason: 'stop' }
    })

    const seen: AgentStreamEvent[] = []
    const result = await runAgentLoop({
      provider,
      model: 'test-model',
      messages: [{ role: 'user', content: 'hi' }],
      sessionId: 'session-1',
      messageId: 'message-1',
      turnRetryDelaysMs: [0, 0, 0],
      onEvent(event) {
        seen.push(event)
      },
    })

    expect(calls).toBe(3)
    expect(result.text).toBe('recovered')
    expect(result.turns).toBe(1)
    const retries = seen.filter(event => event.type === 'auto-retry')
    expect(retries).toHaveLength(2)
    expect(retries.map(event => event.type === 'auto-retry' && event.attempt)).toEqual([1, 2])
  })

  it('gives up after exhausting the backoff schedule', async () => {
    let calls = 0
    const provider = baseProvider(async function* () {
      calls++
      throw Object.assign(new Error('request failed'), { statusCode: 503 })
    })

    await expect(runAgentLoop({
      provider,
      model: 'test-model',
      messages: [{ role: 'user', content: 'hi' }],
      sessionId: 'session-1',
      messageId: 'message-1',
      turnRetryDelaysMs: [0, 0, 0],
    })).rejects.toThrow('request failed')
    expect(calls).toBe(4)
  })

  it('does not retry fatal errors (quota/billing)', async () => {
    let calls = 0
    const provider = baseProvider(async function* () {
      calls++
      throw Object.assign(new Error('insufficient_quota: billing hard limit reached'), { statusCode: 429 })
    })

    await expect(runAgentLoop({
      provider,
      model: 'test-model',
      messages: [{ role: 'user', content: 'hi' }],
      sessionId: 'session-1',
      messageId: 'message-1',
      turnRetryDelaysMs: [0, 0, 0],
    })).rejects.toThrow('insufficient_quota')
    expect(calls).toBe(1)
  })

  it('does not retry once a tool has executed in the failed attempt', async () => {
    let calls = 0
    const provider = baseProvider(async function* (request) {
      calls++
      yield { type: 'tool-call-start', turn: request.turn, toolCallId: 'call_1', toolName: 'read' }
      yield { type: 'tool-call-delta', turn: request.turn, toolCallId: 'call_1', toolName: 'read', argumentsDelta: '{"path":"a"}' }
      yield { type: 'tool-call-done', turn: request.turn, toolCall: { id: 'call_1', name: 'read', arguments: '{"path":"a"}' } }
      throw new Error('socket hang up mid-stream')
    })
    const tool: AgentTool = {
      name: 'read',
      parameters: { type: 'object' },
      async execute() {
        return { content: 'file contents' }
      },
    }

    await expect(runAgentLoop({
      provider,
      model: 'test-model',
      messages: [{ role: 'user', content: 'hi' }],
      tools: [tool],
      sessionId: 'session-1',
      messageId: 'message-1',
      turnRetryDelaysMs: [0, 0, 0],
    })).rejects.toThrow('socket hang up')
    expect(calls).toBe(1)
  })
})

describe('runAgentLoop final-turn notice', () => {
  it('injects a wrap-up notice before the last turn when the limit will cut the run', async () => {
    const noticesSeenAtTurn: Array<{ turn: number; hasNotice: boolean }> = []
    const provider = baseProvider(async function* (request) {
      noticesSeenAtTurn.push({
        turn: request.turn,
        hasNotice: request.messages.some(
          message => message.role === 'user'
            && typeof message.content === 'string'
            && message.content.includes('final turn of this run'),
        ),
      })
      yield { type: 'tool-call-start', turn: request.turn, toolCallId: `call_${request.turn}`, toolName: 'read' }
      yield { type: 'tool-call-done', turn: request.turn, toolCall: { id: `call_${request.turn}`, name: 'read', arguments: '{}' } }
      yield { type: 'finish', turn: request.turn, finishReason: 'tool_calls' }
    })
    const tool: AgentTool = {
      name: 'read',
      parameters: { type: 'object' },
      async execute() {
        return { content: 'ok' }
      },
    }

    const result = await runAgentLoop({
      provider,
      model: 'test-model',
      messages: [{ role: 'user', content: 'go' }],
      tools: [tool],
      sessionId: 'session-1',
      messageId: 'message-1',
      maxTurns: 3,
    })

    expect(result.finishReason).toBe('max_turns')
    expect(noticesSeenAtTurn).toEqual([
      { turn: 1, hasNotice: false },
      { turn: 2, hasNotice: false },
      { turn: 3, hasNotice: true },
    ])
  })
})

describe('runAgentLoop steering interrupt (response boundary)', () => {
  function toolCallTurnProvider(requests: { turn: number; messages: unknown[] }[]): AgentProvider {
    return baseProvider(async function* (request) {
      requests.push({ turn: request.turn, messages: request.messages.map(message => ({ ...message })) })
      if (request.turn === 1) {
        yield { type: 'tool-call-start', turn: request.turn, toolCallId: 'call_1', toolName: 'read' }
        yield { type: 'tool-call-done', turn: request.turn, toolCall: { id: 'call_1', name: 'read', arguments: '{}' } }
        yield { type: 'finish', turn: request.turn, finishReason: 'tool_calls' }
        return
      }
      yield { type: 'text-delta', turn: request.turn, delta: 'answered steer' }
      yield { type: 'finish', turn: request.turn, finishReason: 'stop' }
    })
  }

  const readTool: AgentTool = {
    name: 'read',
    parameters: { type: 'object' },
    async execute() {
      return { content: 'ok' }
    },
  }

  it('emits response-boundary before turn-start when beforeTurn injects a steering message', async () => {
    const requests: { turn: number; messages: unknown[] }[] = []
    const orderedEvents: string[] = []

    const result = await runAgentLoop({
      provider: toolCallTurnProvider(requests),
      model: 'test-model',
      messages: [{ role: 'user', content: 'original ask' }],
      tools: [readTool],
      sessionId: 'session-1',
      messageId: 'message-1',
      maxTurns: 3,
      beforeTurn({ turn, messages }) {
        if (turn !== 2) return undefined
        return {
          messages: [...messages, { role: 'user', content: 'STEER: do this instead' }],
          startNewResponse: true,
        }
      },
      onEvent(event) {
        if (event.type === 'turn-start' || event.type === 'response-boundary') {
          orderedEvents.push(`${event.type}:${event.turn}`)
        }
      },
    })

    expect(result.text).toBe('answered steer')
    // Boundary lands between turn 1 completing and turn 2 starting.
    expect(orderedEvents).toEqual(['turn-start:1', 'response-boundary:2', 'turn-start:2'])
    // The steer message reaches the model as the request tail of turn 2.
    const lastTurnMessages = requests[1].messages as { role: string; content: string }[]
    expect(lastTurnMessages[lastTurnMessages.length - 1]).toEqual({
      role: 'user',
      content: 'STEER: do this instead',
    })
  })

  it('keeps plain-array hook returns silent (no response boundary)', async () => {
    const requests: { turn: number; messages: unknown[] }[] = []
    const boundaryEvents: unknown[] = []

    await runAgentLoop({
      provider: toolCallTurnProvider(requests),
      model: 'test-model',
      messages: [{ role: 'user', content: 'original ask' }],
      tools: [readTool],
      sessionId: 'session-1',
      messageId: 'message-1',
      maxTurns: 3,
      beforeTurn({ messages }) {
        return [...messages]
      },
      onEvent(event) {
        if (event.type === 'response-boundary') boundaryEvents.push(event)
      },
    })

    expect(boundaryEvents).toEqual([])
  })
})
