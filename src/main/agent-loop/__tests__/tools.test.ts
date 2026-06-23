import { describe, expect, it, vi } from 'vitest'
import { agentToolsFromRegistry } from '../tools.js'

const registryMocks = vi.hoisted(() => ({
  executeTool: vi.fn(),
  getToolsForAI: vi.fn(),
  initializeToolRegistry: vi.fn(),
  setInitContext: vi.fn(),
}))

vi.mock('../../tools/registry.js', () => registryMocks)

describe('agent loop registry tool adapter', () => {
  it('forwards per-call execution context and streaming callbacks to registry tools', async () => {
    const abortSignal = new AbortController().signal
    const onMetadata = vi.fn()
    const onPartialResult = vi.fn()

    registryMocks.getToolsForAI.mockResolvedValue({
      lookup: {
        description: 'Lookup data',
        parameters: { type: 'object', properties: { query: { type: 'string' } } },
      },
    })
    registryMocks.executeTool.mockImplementation(async (_name, _args, ctx) => {
      ctx.onMetadata?.({ title: 'Preview', metadata: { path: '/tmp/a.txt' } })
      ctx.onPartialResult?.({ content: [{ type: 'text', text: 'halfway' }] })
      return { success: true, data: { output: 'done' } }
    })

    const tools = await agentToolsFromRegistry({
      executionContext: {
        sessionId: 'base-session',
        messageId: 'base-message',
        workingDirectory: '/base',
        abortSignal: new AbortController().signal,
      },
    })

    const result = await tools[0].execute(
      { query: 'moon' },
      {
        sessionId: 'agent-session',
        messageId: 'agent-message',
        toolCallId: 'call_1',
        workingDirectory: '/turn',
        abortSignal,
        onMetadata,
        onPartialResult,
      },
    )

    expect(registryMocks.executeTool).toHaveBeenCalledWith(
      'lookup',
      { query: 'moon' },
      expect.objectContaining({
        sessionId: 'agent-session',
        messageId: 'agent-message',
        toolCallId: 'call_1',
        workingDirectory: '/turn',
        abortSignal,
      }),
    )
    expect(onMetadata).toHaveBeenCalledWith({ title: 'Preview', metadata: { path: '/tmp/a.txt' } })
    expect(onPartialResult).toHaveBeenCalledWith({ content: [{ type: 'text', text: 'halfway' }] })
    expect(result).toEqual({ content: 'done', data: { output: 'done' } })
  })
})
