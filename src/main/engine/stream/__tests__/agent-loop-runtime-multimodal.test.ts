import { beforeEach, describe, expect, it, vi } from 'vitest'
import { runAgentLoop } from '../../../agent-loop/runner.js'
import { PendingMessageQueue } from '../message-queue.js'
import type { StreamContext } from '../stream-processor.js'

const mocks = vi.hoisted(() => ({
  seenMessages: [] as unknown[],
  seenRequests: [] as Array<{
    requestedOutputModalities?: unknown
    toolChoice?: unknown
    tools?: unknown
  }>,
  promptInputs: [] as any[],
  visionProvider: {
    id: 'vision-runtime-provider',
    capabilities: {
      capabilities: ['text-input', 'vision-input', 'text-output', 'image-output', 'streaming'],
      inputModalities: ['text', 'image'],
      outputModalities: ['text'],
      supportsStreaming: true,
    },
    async *streamTurn(request: any) {
      mocks.seenMessages.push(request.messages.map((message: any) => ({ ...message })))
      mocks.seenRequests.push({
        requestedOutputModalities: request.requestedOutputModalities,
        toolChoice: request.toolChoice,
        tools: request.tools?.map((tool: any) => tool.name),
      })
      yield { type: 'text-delta', turn: request.turn, delta: 'vision ok' }
      yield { type: 'finish', turn: request.turn, finishReason: 'stop' }
    },
  },
  addMessage: vi.fn(),
  emit: vi.fn(async () => undefined),
  getSession: vi.fn(() => ({
    id: 's1',
    name: 'Session',
    messages: [],
    createdAt: 1,
    updatedAt: 1,
    workingDirectory: '/tmp/project',
  })),
  getSkillsForSession: vi.fn(() => []),
  getMCPToolsForAI: vi.fn(() => ({})),
  modelSupportsTools: vi.fn(async () => false),
  getModelContextLength: vi.fn(async () => 128000),
  getModelMaxOutputTokens: vi.fn(async () => 8192),
  convertToolDefinitionsForAI: vi.fn(() => ({})),
  getEnabledToolsAsync: vi.fn(async () => []),
  initializeAsyncTools: vi.fn(async () => undefined),
  setInitContext: vi.fn(),
  buildContextVariablesPromptText: vi.fn(async () => ''),
  buildProjectDirsPromptVars: vi.fn(() => ({ active: undefined, known: [] })),
  getContextCompactReason: vi.fn(() => null),
}))

vi.mock('../../../store.js', () => ({
  getSession: mocks.getSession,
  addMessage: mocks.addMessage,
}))

vi.mock('../../../ipc/skills.js', () => ({
  getSkillsForSession: mocks.getSkillsForSession,
}))

vi.mock('../../../mcp/index.js', () => ({
  getMCPToolsForAI: mocks.getMCPToolsForAI,
}))

vi.mock('../../../providers/model-registry.js', () => ({
  modelSupportsTools: mocks.modelSupportsTools,
  getModelContextLength: mocks.getModelContextLength,
  getModelMaxOutputTokens: mocks.getModelMaxOutputTokens,
}))

vi.mock('../../../providers/index.js', () => ({
  convertToolDefinitionsForAI: mocks.convertToolDefinitionsForAI,
}))

vi.mock('../../../tools/index.js', () => ({
  getEnabledToolsAsync: mocks.getEnabledToolsAsync,
  initializeAsyncTools: mocks.initializeAsyncTools,
  setInitContext: mocks.setInitContext,
}))

vi.mock('../../prompt/index.js', () => ({
  buildPrompt: vi.fn(async (input) => {
    mocks.promptInputs.push(input)
    return {
      systemPrompt: 'system prompt',
      messages: [
        { role: 'system', content: 'system prompt' },
        ...input.historyMessages,
      ],
    }
  }),
}))

vi.mock('../../../variables/index.js', () => ({
  buildContextVariablesPromptText: mocks.buildContextVariablesPromptText,
}))

vi.mock('../../../project-dirs/index.js', () => ({
  buildProjectDirsPromptVars: mocks.buildProjectDirsPromptVars,
}))

vi.mock('../../../agent-loop/providers/factory.js', () => ({
  isAgentProviderRuntimeSupported: vi.fn(() => true),
  createAgentProviderFromRuntime: vi.fn(() => mocks.visionProvider),
}))

vi.mock('../../context-compact.js', () => ({
  compactSessionContext: vi.fn(),
  getContextCompactReason: mocks.getContextCompactReason,
}))

vi.mock('../../../events/index.js', () => ({
  getEventBus: () => ({ emit: mocks.emit }),
}))

vi.mock('../../../prompts/resolver.js', () => ({
  resolvePromptReferences: vi.fn((content: string) => ({
    modelContent: content,
    displayContent: content,
    contentParts: undefined,
  })),
}))

const { buildAgentLoopRuntimeFromStreamContext } = await import('../agent-loop-runtime.js')
const { createAgentProviderFromRuntime } = await import('../../../agent-loop/providers/factory.js')

function ctx(): StreamContext {
  return {
    sessionId: 's1',
    assistantMessageId: 'm1',
    abortSignal: new AbortController().signal,
    settings: { chat: {}, skills: {}, tools: { enableToolCalls: false } } as any,
    providerConfig: { model: 'vision-model', selectedModels: ['vision-model'], apiKey: 'key' } as any,
    providerId: 'deepseek',
    toolSettings: { enableToolCalls: false } as any,
    sender: { isDestroyed: () => false, send: vi.fn() } as any,
  }
}

describe('agent loop stream runtime multimodal input', () => {
  beforeEach(() => {
    mocks.seenMessages.length = 0
    mocks.seenRequests.length = 0
    mocks.promptInputs.length = 0
    vi.clearAllMocks()
  })

  it('preserves image content parts from history for capable providers', async () => {
    const imageContent = [
      { type: 'text' as const, text: 'look' },
      { type: 'image' as const, image: 'data:image/png;base64,abc', mediaType: 'image/png' },
    ]
    const prepared = await buildAgentLoopRuntimeFromStreamContext(ctx(), [
      { role: 'user', content: imageContent },
    ] as any)

    expect(prepared.supported).toBe(true)
    if (!prepared.supported) return

    const result = await runAgentLoop(prepared.runtime)
    expect(result.text).toBe('vision ok')
    expect((mocks.seenMessages[0] as any)[1].content).toEqual(imageContent)
  })

  it('passes requested output modalities from stream context into provider turns', async () => {
    const context = ctx()
    context.requestedOutputModalities = ['image']

    const prepared = await buildAgentLoopRuntimeFromStreamContext(context, [
      { role: 'user', content: 'draw this' },
    ] as any)

    expect(prepared.supported).toBe(true)
    if (!prepared.supported) return

    await runAgentLoop(prepared.runtime)

    expect(mocks.seenRequests[0].requestedOutputModalities).toEqual(['image'])
  })

  it('passes provider auth context into the agent provider runtime factory', async () => {
    const context = ctx()
    const oauthToken = {
      accessToken: 'oauth-access-token',
      expiresAt: Date.now() + 60_000,
      tokenType: 'Bearer',
      accountId: 'acct_123',
    }
    context.providerId = 'codex'
    context.providerConfig = {
      model: 'gpt-5.5',
      selectedModels: ['gpt-5.5'],
      apiKey: 'api-key',
      oauthToken,
      authContext: {
        kind: 'oauth',
        token: oauthToken,
        account: { email: 'dev@example.test' },
      },
    } as any

    const prepared = await buildAgentLoopRuntimeFromStreamContext(context, [
      { role: 'user', content: 'hello' },
    ] as any)

    expect(prepared.supported).toBe(true)
    expect(createAgentProviderFromRuntime).toHaveBeenCalledWith(
      'codex',
      expect.objectContaining({
        apiKey: 'api-key',
        model: 'gpt-5.5',
        oauthToken,
        authContext: expect.objectContaining({
          kind: 'oauth',
          token: oauthToken,
        }),
      }),
      expect.objectContaining({
        workingDirectory: '/tmp/project',
        localSessionId: 's1',
      }),
    )
  })

  it('emits active-memory prompt loading indicators while building the initial prompt', async () => {
    const context = ctx()
    context.settings = {
      chat: {},
      skills: {},
      tools: { enableToolCalls: false },
      general: {
        soulMemory: {
          enabled: true,
          activeMemory: { enabled: true, timeoutMs: 4321 },
        },
      },
    } as any
    const emitter = {
      sendContentPart: vi.fn(),
    }

    const prepared = await buildAgentLoopRuntimeFromStreamContext(context, [
      { role: 'user', content: 'hello' },
    ] as any, { emitter: emitter as any })

    expect(prepared.supported).toBe(true)
    expect(emitter.sendContentPart).toHaveBeenNthCalledWith(1, { type: 'loading-memory' })
    expect(emitter.sendContentPart).toHaveBeenNthCalledWith(2, { type: 'waiting' })
  })

  it('keeps provider tool capability authoritative when building prompts and runtime tools', async () => {
    mocks.modelSupportsTools.mockResolvedValueOnce(true)
    mocks.getEnabledToolsAsync.mockResolvedValueOnce([{
      id: 'lookup',
      name: 'lookup',
      description: 'Lookup facts',
      parameters: [{
        name: 'query',
        type: 'string',
        description: 'Search query',
        required: true,
      }],
      enabled: true,
    }] as any)

    const context = ctx()
    context.settings = { chat: {}, skills: {}, tools: { enableToolCalls: true, tools: {} } } as any
    context.toolSettings = { enableToolCalls: true, tools: {} } as any

    const prepared = await buildAgentLoopRuntimeFromStreamContext(context, [
      { role: 'user', content: 'hello' },
    ] as any)

    expect(prepared.supported).toBe(true)
    if (!prepared.supported) return

    expect(prepared.hasTools).toBe(false)
    expect(prepared.toolNames).toEqual([])
    expect(mocks.promptInputs[0]).toMatchObject({
      hasTools: false,
      toolNames: [],
      mcpToolNames: [],
    })
    expect(mocks.convertToolDefinitionsForAI).not.toHaveBeenCalled()

    await runAgentLoop(prepared.runtime)

    expect(mocks.seenRequests[0]).toMatchObject({
      toolChoice: 'none',
      tools: [],
    })
  })

  it('includes MCP router tools in the agent-loop runtime when tools are enabled', async () => {
    const originalCapabilities = mocks.visionProvider.capabilities
    ;(mocks.visionProvider as any).capabilities = {
      ...originalCapabilities,
      capabilities: [...originalCapabilities.capabilities, 'tool-calls'],
      supportsTools: true,
    }
    mocks.modelSupportsTools.mockResolvedValueOnce(true)
    mocks.getEnabledToolsAsync.mockResolvedValueOnce([] as any)
    mocks.getMCPToolsForAI.mockReturnValueOnce({
      mcp_search: {
        description: 'Search and call MCP tools',
        parameters: [{
          name: 'action',
          type: 'string',
          description: 'MCP action',
          required: true,
        }],
        parameterSchema: {
          type: 'object',
          properties: {
            action: { type: 'string' },
          },
          required: ['action'],
        },
      },
    })

    try {
      const context = ctx()
      context.settings = { chat: {}, skills: {}, tools: { enableToolCalls: true, tools: {} } } as any
      context.toolSettings = { enableToolCalls: true, tools: {} } as any

      const prepared = await buildAgentLoopRuntimeFromStreamContext(context, [
        { role: 'user', content: 'hello' },
      ] as any)

      expect(prepared.supported).toBe(true)
      if (!prepared.supported) return

      expect(prepared.hasTools).toBe(true)
      expect(prepared.toolNames).toEqual([])
      expect(prepared.mcpToolNames).toEqual(['mcp_search'])
      expect(mocks.promptInputs[0]).toMatchObject({
        hasTools: true,
        toolNames: [],
        mcpToolNames: ['mcp_search'],
      })

      await runAgentLoop(prepared.runtime)

      expect(mocks.seenRequests[0]).toMatchObject({
        toolChoice: 'auto',
        tools: ['mcp_search'],
      })
    } finally {
      ;(mocks.visionProvider as any).capabilities = originalCapabilities
    }
  })

  it('injects queued steering messages before the next provider turn', async () => {
    const steeringQueue = new PendingMessageQueue('one-at-a-time')
    steeringQueue.enqueue({ content: 'steer now', source: 'test', timestamp: 123 })
    const context = ctx()
    context.steeringQueue = steeringQueue

    const prepared = await buildAgentLoopRuntimeFromStreamContext(context, [
      { role: 'user', content: 'hello' },
    ] as any)

    expect(prepared.supported).toBe(true)
    if (!prepared.supported) return

    await runAgentLoop(prepared.runtime)

    expect((mocks.seenMessages[0] as any).map((message: any) => message.content)).toEqual([
      'system prompt',
      'hello',
      'steer now',
    ])
    expect(mocks.addMessage).toHaveBeenCalledWith('s1', expect.objectContaining({
      role: 'user',
      content: 'steer now',
      timestamp: 123,
    }))
    expect(mocks.emit).toHaveBeenCalledWith('s1', expect.objectContaining({
      type: 'message:user-created',
      message: expect.objectContaining({ content: 'steer now' }),
    }))
  })

  it('continues with queued follow-up messages after a natural stop', async () => {
    const followUpQueue = new PendingMessageQueue('all')
    followUpQueue.enqueue({ content: 'follow up', source: 'test', timestamp: 456 })
    const context = ctx()
    context.followUpQueue = followUpQueue

    const prepared = await buildAgentLoopRuntimeFromStreamContext(context, [
      { role: 'user', content: 'hello' },
    ] as any)

    expect(prepared.supported).toBe(true)
    if (!prepared.supported) return

    const result = await runAgentLoop(prepared.runtime)

    expect(result.turns).toBe(2)
    expect((mocks.seenMessages[1] as any).map((message: any) => message.content)).toEqual([
      'system prompt',
      'hello',
      'vision ok',
      'follow up',
    ])
    expect(mocks.addMessage).toHaveBeenCalledWith('s1', expect.objectContaining({
      role: 'user',
      content: 'follow up',
      timestamp: 456,
    }))
  })

  it('prioritizes queued steering over follow-up after a natural stop', async () => {
    const steeringQueue = new PendingMessageQueue('one-at-a-time')
    const followUpQueue = new PendingMessageQueue('all')
    followUpQueue.enqueue({ content: 'follow up', source: 'test', timestamp: 456 })

    const originalStreamTurn = mocks.visionProvider.streamTurn
    mocks.visionProvider.streamTurn = async function* streamTurn(request: any) {
      mocks.seenMessages.push(request.messages.map((message: any) => ({ ...message })))
      if (request.turn === 1) {
        steeringQueue.enqueue({ content: 'late steering', source: 'test', timestamp: 789 })
      }
      yield { type: 'text-delta', turn: request.turn, delta: `turn ${request.turn}` }
      yield { type: 'finish', turn: request.turn, finishReason: 'stop' }
    }

    try {
      const context = ctx()
      context.steeringQueue = steeringQueue
      context.followUpQueue = followUpQueue

      const prepared = await buildAgentLoopRuntimeFromStreamContext(context, [
        { role: 'user', content: 'hello' },
      ] as any)

      expect(prepared.supported).toBe(true)
      if (!prepared.supported) return

      const result = await runAgentLoop(prepared.runtime)

      expect(result.turns).toBe(3)
      expect((mocks.seenMessages[1] as any).map((message: any) => message.content)).toEqual([
        'system prompt',
        'hello',
        'turn 1',
        'late steering',
      ])
      expect((mocks.seenMessages[2] as any).map((message: any) => message.content)).toEqual([
        'system prompt',
        'hello',
        'turn 1',
        'late steering',
        'turn 2',
        'follow up',
      ])
      expect(mocks.addMessage).toHaveBeenNthCalledWith(1, 's1', expect.objectContaining({
        role: 'user',
        content: 'late steering',
        timestamp: 789,
      }))
      expect(mocks.addMessage).toHaveBeenNthCalledWith(2, 's1', expect.objectContaining({
        role: 'user',
        content: 'follow up',
        timestamp: 456,
      }))
    } finally {
      mocks.visionProvider.streamTurn = originalStreamTurn
    }
  })
})
