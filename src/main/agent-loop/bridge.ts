import { runAgentLoop } from './runner.js'
import { agentEventsToProviderStreamChunks, type AgentProviderStreamChunk } from './provider-stream.js'
import type {
  AgentLoopOptions,
  AgentLoopResult,
  AgentStreamEvent,
} from './types.js'

class AgentEventQueue implements AsyncIterable<AgentStreamEvent> {
  private values: AgentStreamEvent[] = []
  private closed = false
  private error: unknown
  private notify: (() => void) | undefined

  push(event: AgentStreamEvent): void {
    if (this.closed) return
    this.values.push(event)
    this.notify?.()
    this.notify = undefined
  }

  close(): void {
    this.closed = true
    this.notify?.()
    this.notify = undefined
  }

  fail(error: unknown): void {
    this.error = error
    this.closed = true
    this.notify?.()
    this.notify = undefined
  }

  async *[Symbol.asyncIterator](): AsyncIterator<AgentStreamEvent> {
    while (true) {
      const next = this.values.shift()
      if (next) {
        yield next
        continue
      }
      if (this.error) throw this.error
      if (this.closed) return
      await new Promise<void>(resolve => {
        this.notify = resolve
      })
    }
  }
}

export async function* streamAgentLoopProviderChunks(
  options: AgentLoopOptions,
): AsyncGenerator<AgentProviderStreamChunk, AgentLoopResult, unknown> {
  const queue = new AgentEventQueue()
  const onEvent = options.onEvent
  let result: AgentLoopResult | undefined

  const run = (async () => {
    try {
      result = await runAgentLoop({
        ...options,
        onEvent(event) {
          onEvent?.(event)
          queue.push(event)
        },
      })
      queue.close()
    } catch (error) {
      queue.fail(error)
    }
  })()

  for await (const chunk of agentEventsToProviderStreamChunks(queue)) {
    yield chunk
  }

  await run
  if (!result) {
    throw new Error('Agent loop completed without a result')
  }
  return result
}
