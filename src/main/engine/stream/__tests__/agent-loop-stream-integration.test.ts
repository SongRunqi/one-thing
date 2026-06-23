import { afterEach, describe, expect, it, vi } from 'vitest'
import { IPC_CHANNELS } from '../../../../shared/ipc.js'
import type { AgentProvider } from '../../../agent-loop/index.js'
import type { StreamExecutionParams } from '../stream-executor.js'

const mocks = vi.hoisted(() => ({
  engine: {
    registerController: vi.fn(),
    removeController: vi.fn(),
    getSteeringQueue: vi.fn(() => undefined),
    getFollowUpQueue: vi.fn(() => undefined),
  },
  eventBusEmit: vi.fn(async () => undefined),
  streamPush: vi.fn(),
  senderSend: vi.fn(),
  modelSupportsImageGeneration: vi.fn(async () => false),
  modelSupportsTools: vi.fn(async () => false),
  getModelContextLength: vi.fn(async () => 128000),
  getModelMaxOutputTokens: vi.fn(async () => 4096),
  processImageGenerationStream: vi.fn(async () => true),
  executeStreamGeneration: vi.fn(async () => ({ pausedForConfirmation: false })),
  buildPrompt: vi.fn(async ({ historyMessages }) => ({
    systemPrompt: 'system prompt',
    messages: [
      { role: 'system', content: 'system prompt' },
      ...historyMessages,
    ],
  })),
  updateSessionUsage: vi.fn(),
  triggerRunPostResponse: vi.fn(async () => undefined),
  runAfterAssistantResponseHooks: vi.fn(async () => undefined),
  getSkillsForSession: vi.fn(() => []),
  getMCPToolsForAI: vi.fn(() => ({})),
  getEnabledToolsAsync: vi.fn(async () => []),
  initializeAsyncTools: vi.fn(async () => undefined),
  setInitContext: vi.fn(),
  convertToolDefinitionsForAI: vi.fn(() => ({})),
  executeToolDirectly: vi.fn(),
  acpStreamPrompt: vi.fn(),
  buildContextVariablesPromptText: vi.fn(async () => ''),
  buildProjectDirsPromptVars: vi.fn(() => ({ active: undefined, known: [] })),
  getContextCompactReason: vi.fn(() => null),
  store: {
    addMessage: vi.fn(),
    addMessageContentPart: vi.fn(),
    addMessageStep: vi.fn(),
    updateMessageStep: vi.fn(),
    updateMessageContent: vi.fn(),
    updateMessageReasoning: vi.fn(),
    updateMessageToolCalls: vi.fn(),
    updateMessageUsage: vi.fn(),
    updateMessageStreaming: vi.fn(),
    updateMessageError: vi.fn(),
    updateSessionContextSize: vi.fn(),
    updateMessageSkill: vi.fn(),
    flushSessionSave: vi.fn(async () => undefined),
    getSession: vi.fn(() => ({
      id: 's1',
      name: 'Session',
      messages: [],
      createdAt: 1,
      updatedAt: 1,
      workingDirectory: '/tmp/project',
    })),
  },
}))

vi.mock('../../index.js', () => ({
  getStreamEngine: () => mocks.engine,
}))

vi.mock('../../../events/index.js', () => ({
  getEventBus: () => ({ emit: mocks.eventBusEmit }),
  getStreamChannel: () => ({ push: mocks.streamPush }),
}))

vi.mock('../../../store.js', () => ({
  ...mocks.store,
}))

vi.mock('../../../providers/model-registry.js', () => ({
  modelSupportsImageGeneration: mocks.modelSupportsImageGeneration,
  modelSupportsTools: mocks.modelSupportsTools,
  getModelContextLength: mocks.getModelContextLength,
  getModelMaxOutputTokens: mocks.getModelMaxOutputTokens,
}))

vi.mock('../image-stream.js', () => ({
  processImageGenerationStream: mocks.processImageGenerationStream,
}))

vi.mock('../tool-loop.js', () => ({
  executeStreamGeneration: mocks.executeStreamGeneration,
}))

vi.mock('../tool-execution.js', () => ({
  executeToolDirectly: mocks.executeToolDirectly,
}))

vi.mock('../../prompt/index.js', () => ({
  buildPrompt: mocks.buildPrompt,
}))

vi.mock('../../../ipc/sessions.js', () => ({
  updateSessionUsage: mocks.updateSessionUsage,
}))

vi.mock('../../triggers/index.js', () => ({
  triggerManager: {
    runPostResponse: mocks.triggerRunPostResponse,
  },
}))

vi.mock('../../../plugins/lifecycle.js', () => ({
  runAfterAssistantResponseHooks: mocks.runAfterAssistantResponseHooks,
}))

vi.mock('../../../ipc/skills.js', () => ({
  getSkillsForSession: mocks.getSkillsForSession,
}))

vi.mock('../../../mcp/index.js', () => ({
  getMCPToolsForAI: mocks.getMCPToolsForAI,
  isMCPTool: vi.fn(() => false),
  parseMCPToolId: vi.fn(() => null),
  findMCPToolIdByShortName: vi.fn(() => null),
  MCPManager: {
    getServerState: vi.fn(() => null),
  },
}))

vi.mock('../../../providers/index.js', () => ({
  convertToolDefinitionsForAI: mocks.convertToolDefinitionsForAI,
}))

vi.mock('../../../tools/index.js', () => ({
  getEnabledToolsAsync: mocks.getEnabledToolsAsync,
  initializeAsyncTools: mocks.initializeAsyncTools,
  setInitContext: mocks.setInitContext,
  createToolCall: vi.fn((toolId: string, toolName: string, args: Record<string, unknown>) => ({
    id: `call_${toolId}`,
    toolId,
    toolName,
    arguments: args,
    status: 'pending',
    timestamp: 1,
  })),
}))

vi.mock('../../../variables/index.js', () => ({
  buildContextVariablesPromptText: mocks.buildContextVariablesPromptText,
}))

vi.mock('../../../project-dirs/index.js', () => ({
  buildProjectDirsPromptVars: mocks.buildProjectDirsPromptVars,
}))

vi.mock('../../context-compact.js', () => ({
  compactSessionContext: vi.fn(),
  getContextCompactReason: mocks.getContextCompactReason,
}))

vi.mock('../../../prompts/resolver.js', () => ({
  resolvePromptReferences: vi.fn((content: string) => ({
    modelContent: content,
    displayContent: content,
    contentParts: undefined,
  })),
}))

vi.mock('../../../acp/index.js', () => ({
  ACPManager: {
    streamPrompt: mocks.acpStreamPrompt,
  },
}))

const { registerAgentProviderRuntime } = await import('../../../agent-loop/index.js')
const { executeMessageStream } = await import('../stream-executor.js')

function params(overrides: Partial<StreamExecutionParams> = {}): StreamExecutionParams {
  return {
    sender: {
      isDestroyed: () => false,
      send: mocks.senderSend,
    } as any,
    sessionId: 's1',
    assistantMessageId: 'm1',
    messageContent: 'hello',
    historyMessages: [{ role: 'user', content: 'hello' }],
    configWithApiKey: {
      apiKey: 'key',
      model: 'test-model',
      selectedModels: ['test-model'],
    } as any,
    providerId: 'test-agent',
    settings: {
      chat: { agentLoopStream: true },
      skills: { enableSkills: false },
      tools: { enableToolCalls: false },
    } as any,
    toolSettings: { enableToolCalls: false, tools: {} } as any,
    sessionName: 'Session',
    ...overrides,
  }
}

describe('agent-loop stream entry integration', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('runs executeMessageStream through the real agent-loop runtime and executor for registered providers', async () => {
    const providerRequests: unknown[] = []
    const unregister = registerAgentProviderRuntime('test-agent', () => ({
      id: 'test-agent',
      capabilities: {
        capabilities: ['text-input', 'text-output', 'streaming'],
        inputModalities: ['text'],
        outputModalities: ['text'],
        supportsStreaming: true,
      },
      async *streamTurn(request) {
        providerRequests.push({
          ...request,
          messages: request.messages.map(message => ({ ...message })),
        })
        yield { type: 'text-delta', turn: request.turn, delta: 'agent says hi' }
        yield {
          type: 'finish',
          turn: request.turn,
          finishReason: 'stop',
          usage: { inputTokens: 3, outputTokens: 4, totalTokens: 7 },
        }
      },
    } satisfies AgentProvider))

    try {
      const result = await executeMessageStream(params())

      expect(result).toEqual({
        handled: true,
        isImageGeneration: false,
        pausedForConfirmation: false,
      })
      expect(providerRequests).toHaveLength(1)
      expect((providerRequests[0] as any).messages.map((message: any) => message.content)).toEqual([
        'system prompt',
        'hello',
      ])
      expect((providerRequests[0] as any).tools).toEqual([])
      expect((providerRequests[0] as any).toolChoice).toBe('none')
      expect(mocks.getEnabledToolsAsync).not.toHaveBeenCalled()
      expect(mocks.convertToolDefinitionsForAI).not.toHaveBeenCalled()
      expect(mocks.executeStreamGeneration).not.toHaveBeenCalled()
      expect(mocks.store.updateMessageContent).toHaveBeenCalledWith('s1', 'm1', 'agent says hi')
      expect(mocks.streamPush).toHaveBeenCalledWith('s1', {
        type: 'text-delta',
        text: 'agent says hi',
        turnIndex: 1,
      })
      expect(mocks.store.updateMessageUsage).toHaveBeenCalledWith('s1', 'm1', expect.objectContaining({
        inputTokens: 3,
        outputTokens: 4,
        totalTokens: 7,
      }))
      expect(mocks.updateSessionUsage).toHaveBeenCalledWith(
        's1',
        expect.objectContaining({ totalTokens: 7 }),
        expect.objectContaining({ inputTokens: 3, outputTokens: 4 }),
      )
      expect(mocks.eventBusEmit).toHaveBeenCalledWith('s1', expect.objectContaining({
        type: 'stream:complete',
      }))
      expect(mocks.senderSend).toHaveBeenCalledWith(
        IPC_CHANNELS.UI_MESSAGE_STREAM,
        expect.objectContaining({
          sessionId: 's1',
          messageId: 'm1',
          chunk: expect.objectContaining({ type: 'finish' }),
        }),
      )
      expect(mocks.engine.removeController).toHaveBeenCalledWith('s1')
      expect(mocks.triggerRunPostResponse).toHaveBeenCalled()
      expect(mocks.runAfterAssistantResponseHooks).toHaveBeenCalled()
    } finally {
      unregister()
    }
  })

  it('routes built-in ACP providers through the agent-loop stream entry', async () => {
    const abortController = new AbortController()
    mocks.acpStreamPrompt.mockImplementationOnce(async function* () {
      yield {
        type: 'update',
        notification: {
          update: {
            sessionUpdate: 'agent_thought_chunk',
            content: { type: 'text', text: 'planning ' },
          },
        },
      }
      yield {
        type: 'update',
        notification: {
          update: {
            sessionUpdate: 'agent_message_chunk',
            content: { type: 'text', text: 'acp answer' },
          },
        },
      }
      yield {
        type: 'finish',
        stopReason: 'end_turn',
        usage: { inputTokens: 8, outputTokens: 4, totalTokens: 12 },
      }
    })

    const result = await executeMessageStream(params({
      providerId: 'acp',
      configWithApiKey: {
        apiKey: '',
        model: 'codex-acp',
        selectedModels: ['codex-acp'],
      } as any,
    }), abortController)

    expect(result).toEqual({
      handled: true,
      isImageGeneration: false,
      pausedForConfirmation: false,
    })
    expect(mocks.acpStreamPrompt).toHaveBeenCalledWith('codex-acp', {
      localSessionId: 's1',
      prompt: 'hello',
      cwd: '/tmp/project',
      abortSignal: abortController.signal,
    })
    expect(mocks.store.updateMessageReasoning).toHaveBeenCalledWith('s1', 'm1', 'planning ')
    expect(mocks.store.updateMessageContent).toHaveBeenCalledWith('s1', 'm1', 'acp answer')
    expect(mocks.updateSessionUsage).toHaveBeenCalledWith(
      's1',
      expect.objectContaining({ totalTokens: 12 }),
      expect.objectContaining({ inputTokens: 8, outputTokens: 4 }),
    )
    expect(mocks.executeStreamGeneration).not.toHaveBeenCalled()
    expect(mocks.engine.removeController).toHaveBeenCalledWith('s1')
  })

  it('emits aborted and skips completion when the agent-loop stream is stopped mid-turn', async () => {
    const abortController = new AbortController()
    const unregister = registerAgentProviderRuntime('test-agent-abort', () => ({
      id: 'test-agent-abort',
      capabilities: {
        capabilities: ['text-input', 'text-output', 'streaming'],
        inputModalities: ['text'],
        outputModalities: ['text'],
        supportsStreaming: true,
      },
      async *streamTurn(request) {
        yield { type: 'text-delta', turn: request.turn, delta: 'partial text' }
        abortController.abort()
        yield { type: 'finish', turn: request.turn, finishReason: 'stop' }
      },
    } satisfies AgentProvider))

    try {
      const result = await executeMessageStream(params({
        providerId: 'test-agent-abort',
        configWithApiKey: {
          apiKey: 'key',
          model: 'test-abort-model',
          selectedModels: ['test-abort-model'],
        } as any,
      }), abortController)

      expect(result).toEqual({
        handled: true,
        isImageGeneration: false,
        pausedForConfirmation: false,
      })
      expect(mocks.store.updateMessageContent).toHaveBeenCalledWith('s1', 'm1', 'partial text')
      expect(mocks.eventBusEmit).toHaveBeenCalledWith('s1', expect.objectContaining({
        type: 'stream:aborted',
        reason: 'User cancelled',
      }))
      expect(mocks.eventBusEmit).not.toHaveBeenCalledWith('s1', expect.objectContaining({
        type: 'stream:complete',
      }))
      expect(mocks.senderSend).not.toHaveBeenCalledWith(
        IPC_CHANNELS.UI_MESSAGE_STREAM,
        expect.objectContaining({
          chunk: expect.objectContaining({ type: 'finish' }),
        }),
      )
      expect(mocks.triggerRunPostResponse).not.toHaveBeenCalled()
      expect(mocks.runAfterAssistantResponseHooks).not.toHaveBeenCalled()
      expect(mocks.engine.removeController).toHaveBeenCalledWith('s1')
    } finally {
      unregister()
    }
  })

  it('passes skill-aware dynamic prompt messages from buildPrompt into the agent-loop provider', async () => {
    const providerRequests: any[] = []
    const skill = {
      id: 'skill_repo',
      name: 'repo-skill',
      description: 'Repo workflow',
      instructions: 'Always inspect the repo first.',
      source: 'user',
      path: '/skills/repo-skill/SKILL.md',
      enabled: true,
    }
    mocks.getSkillsForSession.mockReturnValueOnce([skill] as any)
    mocks.buildContextVariablesPromptText.mockResolvedValueOnce('<context>branch=agent-loop</context>')
    mocks.buildPrompt.mockImplementationOnce(async (input: any) => {
      expect(input.skills).toEqual([skill])
      expect(input.contextVariables).toBe('<context>branch=agent-loop</context>')
      return {
        systemPrompt: 'system prompt with repo-skill and branch=agent-loop',
        messages: [
          { role: 'system', content: 'system prompt with repo-skill' },
          { role: 'system', content: 'dynamic context: branch=agent-loop' },
          ...input.historyMessages,
        ],
      }
    })

    const unregister = registerAgentProviderRuntime('test-agent-skills', () => ({
      id: 'test-agent-skills',
      capabilities: {
        capabilities: ['text-input', 'text-output', 'streaming'],
        inputModalities: ['text'],
        outputModalities: ['text'],
        supportsStreaming: true,
      },
      async *streamTurn(request) {
        providerRequests.push({
          messages: request.messages.map(message => ({ ...message })),
        })
        yield { type: 'text-delta', turn: request.turn, delta: 'skill prompt ok' }
        yield { type: 'finish', turn: request.turn, finishReason: 'stop' }
      },
    } satisfies AgentProvider))

    try {
      const result = await executeMessageStream(params({
        providerId: 'test-agent-skills',
        configWithApiKey: {
          apiKey: 'key',
          model: 'test-skill-model',
          selectedModels: ['test-skill-model'],
        } as any,
        settings: {
          chat: { agentLoopStream: true },
          skills: { enableSkills: true },
          tools: { enableToolCalls: false },
        } as any,
      }))

      expect(result.pausedForConfirmation).toBe(false)
      expect(mocks.getSkillsForSession).toHaveBeenCalledWith('/tmp/project')
      expect(providerRequests).toHaveLength(1)
      expect(providerRequests[0].messages.map((message: any) => message.content)).toEqual([
        'system prompt with repo-skill',
        'dynamic context: branch=agent-loop',
        'hello',
      ])
      expect(providerRequests[0].messages.filter((message: any) => String(message.content).includes('repo-skill'))).toHaveLength(1)
      expect(mocks.store.updateMessageContent).toHaveBeenCalledWith('s1', 'm1', 'skill prompt ok')
      expect(mocks.engine.removeController).toHaveBeenCalledWith('s1')
    } finally {
      unregister()
    }
  })

  it('preserves multimodal image content for capable agent-loop providers', async () => {
    const providerRequests: any[] = []
    const imageContent = [
      { type: 'text' as const, text: 'look at this' },
      { type: 'image' as const, image: 'data:image/png;base64,abc', mediaType: 'image/png' },
    ]
    const unregister = registerAgentProviderRuntime('test-agent-vision', () => ({
      id: 'test-agent-vision',
      capabilities: {
        capabilities: ['text-input', 'vision-input', 'text-output', 'streaming'],
        inputModalities: ['text', 'image'],
        outputModalities: ['text'],
        supportsStreaming: true,
      },
      async *streamTurn(request) {
        providerRequests.push({
          messages: request.messages.map(message => ({ ...message })),
        })
        yield { type: 'text-delta', turn: request.turn, delta: 'vision ok' }
        yield { type: 'finish', turn: request.turn, finishReason: 'stop' }
      },
    } satisfies AgentProvider))

    try {
      const result = await executeMessageStream(params({
        providerId: 'test-agent-vision',
        messageContent: imageContent as any,
        historyMessages: [{ role: 'user', content: imageContent }] as any,
        configWithApiKey: {
          apiKey: 'key',
          model: 'test-vision-model',
          selectedModels: ['test-vision-model'],
        } as any,
      }))

      expect(result.pausedForConfirmation).toBe(false)
      expect(providerRequests).toHaveLength(1)
      expect(providerRequests[0].messages.map((message: any) => message.content)).toEqual([
        'system prompt',
        imageContent,
      ])
      expect(mocks.store.updateMessageContent).toHaveBeenCalledWith('s1', 'm1', 'vision ok')
      expect(mocks.engine.removeController).toHaveBeenCalledWith('s1')
    } finally {
      unregister()
    }
  })

  it('rejects multimodal image content before calling unsupported agent-loop providers', async () => {
    const streamTurn = vi.fn(async function* () {
      yield { type: 'text-delta' as const, turn: 1, delta: 'unreachable' }
      yield { type: 'finish' as const, turn: 1, finishReason: 'stop' as const }
    })
    const imageContent = [
      { type: 'text' as const, text: 'look at this' },
      { type: 'image' as const, image: 'data:image/png;base64,abc', mediaType: 'image/png' },
    ]
    const unregister = registerAgentProviderRuntime('test-agent-text-only', () => ({
      id: 'test-agent-text-only',
      capabilities: {
        capabilities: ['text-input', 'text-output', 'streaming'],
        inputModalities: ['text'],
        outputModalities: ['text'],
        supportsStreaming: true,
      },
      streamTurn,
    } satisfies AgentProvider))

    try {
      const result = await executeMessageStream(params({
        providerId: 'test-agent-text-only',
        messageContent: imageContent as any,
        historyMessages: [{ role: 'user', content: imageContent }] as any,
        configWithApiKey: {
          apiKey: 'key',
          model: 'test-text-only-model',
          selectedModels: ['test-text-only-model'],
        } as any,
      }))

      expect(result.pausedForConfirmation).toBe(false)
      expect(streamTurn).not.toHaveBeenCalled()
      expect(mocks.store.updateMessageError).toHaveBeenCalledWith(
        's1',
        'm1',
        expect.stringContaining('does not support image input'),
      )
      expect(mocks.eventBusEmit).toHaveBeenCalledWith('s1', expect.objectContaining({
        type: 'stream:error',
        data: expect.objectContaining({
          error: expect.stringContaining('does not support image input'),
          preserved: true,
        }),
      }))
      expect(mocks.eventBusEmit).toHaveBeenCalledWith('s1', expect.objectContaining({
        type: 'stream:complete',
        data: expect.objectContaining({
          error: expect.stringContaining('does not support image input'),
        }),
      }))
      expect(mocks.engine.removeController).toHaveBeenCalledWith('s1')
    } finally {
      unregister()
    }
  })

  it('executes model-requested tools through the real agent-loop entry path', async () => {
    const providerRequests: any[] = []
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
      autoExecute: true,
      category: 'builtin',
    }] as any)
    mocks.convertToolDefinitionsForAI.mockReturnValueOnce({
      lookup: {
        description: 'Lookup facts',
        parameters: [{
          name: 'query',
          type: 'string',
          description: 'Search query',
          required: true,
        }],
      },
    })
    mocks.executeToolDirectly.mockResolvedValueOnce({
      success: true,
      data: { output: 'lookup result: moon' },
    })

    const unregister = registerAgentProviderRuntime('test-agent-tools', () => ({
      id: 'test-agent-tools',
      capabilities: {
        capabilities: ['text-input', 'text-output', 'streaming', 'tool-calls'],
        inputModalities: ['text'],
        outputModalities: ['text'],
        supportsStreaming: true,
        supportsTools: true,
      },
      async *streamTurn(request) {
        providerRequests.push({
          turn: request.turn,
          toolChoice: request.toolChoice,
          tools: request.tools?.map(tool => tool.name),
          messages: request.messages.map(message => ({ ...message })),
        })
        if (request.turn === 1) {
          yield { type: 'tool-call-start', turn: 1, toolCallId: 'call_lookup', toolName: 'lookup' }
          yield {
            type: 'tool-call-delta',
            turn: 1,
            toolCallId: 'call_lookup',
            toolName: 'lookup',
            argumentsDelta: '{"query":"moon"}',
          }
          yield {
            type: 'tool-call-done',
            turn: 1,
            toolCall: { id: 'call_lookup', name: 'lookup', arguments: '{"query":"moon"}' },
          }
          yield { type: 'finish', turn: 1, finishReason: 'tool_calls' }
          return
        }

        expect(request.messages.at(-1)).toEqual({
          role: 'tool',
          toolCallId: 'call_lookup',
          content: 'lookup result: moon',
        })
        yield { type: 'text-delta', turn: 2, delta: 'final with lookup' }
        yield {
          type: 'finish',
          turn: 2,
          finishReason: 'stop',
          usage: { inputTokens: 5, outputTokens: 6, totalTokens: 11 },
        }
      },
    } satisfies AgentProvider))

    try {
      const result = await executeMessageStream(params({
        providerId: 'test-agent-tools',
        configWithApiKey: {
          apiKey: 'key',
          model: 'test-tool-model',
          selectedModels: ['test-tool-model'],
        } as any,
        settings: {
          chat: { agentLoopStream: true },
          skills: { enableSkills: false },
          tools: { enableToolCalls: true, tools: {} },
        } as any,
        toolSettings: { enableToolCalls: true, tools: {} } as any,
      }))

      expect(result).toEqual({
        handled: true,
        isImageGeneration: false,
        pausedForConfirmation: false,
      })
      expect(providerRequests).toHaveLength(2)
      expect(providerRequests[0]).toMatchObject({
        turn: 1,
        toolChoice: 'auto',
        tools: ['lookup'],
      })
      expect(providerRequests[1].messages.at(-1)).toEqual({
        role: 'tool',
        toolCallId: 'call_lookup',
        content: 'lookup result: moon',
      })
      expect(mocks.executeToolDirectly).toHaveBeenCalledWith(
        'lookup',
        { query: 'moon' },
        expect.objectContaining({
          sessionId: 's1',
          messageId: 'm1',
          toolCallId: 'call_lookup',
          workingDirectory: '/tmp/project',
        }),
      )
      expect(mocks.eventBusEmit).toHaveBeenCalledWith('s1', expect.objectContaining({
        type: 'tool:input-start',
        toolCallId: 'call_lookup',
        toolName: 'lookup',
      }))
      expect(mocks.eventBusEmit).toHaveBeenCalledWith('s1', expect.objectContaining({
        type: 'tool:execution-start',
        toolCallId: 'call_lookup',
        toolName: 'lookup',
        args: { query: 'moon' },
      }))
      expect(mocks.eventBusEmit).toHaveBeenCalledWith('s1', expect.objectContaining({
        type: 'tool:result',
        toolCall: expect.objectContaining({
          id: 'call_lookup',
          status: 'completed',
          result: { output: 'lookup result: moon' },
        }),
      }))
      expect(mocks.streamPush).toHaveBeenCalledWith('s1', {
        type: 'tool-input-delta',
        toolCallId: 'call_lookup',
        argsTextDelta: '{"query":"moon"}',
      })
      expect(mocks.streamPush).toHaveBeenCalledWith('s1', {
        type: 'text-delta',
        text: 'final with lookup',
        turnIndex: 2,
      })
      expect(mocks.store.updateMessageContent).toHaveBeenCalledWith('s1', 'm1', 'final with lookup')
      expect(mocks.engine.removeController).toHaveBeenCalledWith('s1')
    } finally {
      unregister()
    }
  })

  it('pauses and keeps the stream open when an agent-loop tool requires confirmation', async () => {
    const providerRequests: any[] = []
    mocks.modelSupportsTools.mockResolvedValueOnce(true)
    mocks.getEnabledToolsAsync.mockResolvedValueOnce([{
      id: 'dangerous',
      name: 'dangerous',
      description: 'Dangerous command',
      parameters: [{
        name: 'cmd',
        type: 'string',
        description: 'Command',
        required: true,
      }],
      enabled: true,
      autoExecute: true,
      category: 'builtin',
    }] as any)
    mocks.convertToolDefinitionsForAI.mockReturnValueOnce({
      dangerous: {
        description: 'Dangerous command',
        parameters: [{
          name: 'cmd',
          type: 'string',
          description: 'Command',
          required: true,
        }],
      },
    })
    mocks.executeToolDirectly.mockResolvedValueOnce({
      success: false,
      error: 'Needs approval',
      requiresConfirmation: true,
      commandType: 'dangerous',
    })

    const unregister = registerAgentProviderRuntime('test-agent-confirm', () => ({
      id: 'test-agent-confirm',
      capabilities: {
        capabilities: ['text-input', 'text-output', 'streaming', 'tool-calls'],
        inputModalities: ['text'],
        outputModalities: ['text'],
        supportsStreaming: true,
        supportsTools: true,
      },
      async *streamTurn(request) {
        providerRequests.push({
          turn: request.turn,
          toolChoice: request.toolChoice,
          tools: request.tools?.map(tool => tool.name),
          messages: request.messages.map(message => ({ ...message })),
        })

        if (request.turn !== 1) {
          throw new Error('should not request another provider turn before confirmation')
        }

        yield { type: 'tool-call-start', turn: 1, toolCallId: 'call_danger', toolName: 'dangerous' }
        yield {
          type: 'tool-call-delta',
          turn: 1,
          toolCallId: 'call_danger',
          toolName: 'dangerous',
          argumentsDelta: '{"cmd":"rm -rf tmp"}',
        }
        yield {
          type: 'tool-call-done',
          turn: 1,
          toolCall: { id: 'call_danger', name: 'dangerous', arguments: '{"cmd":"rm -rf tmp"}' },
        }
        yield { type: 'finish', turn: 1, finishReason: 'tool_calls' }
      },
    } satisfies AgentProvider))

    try {
      const result = await executeMessageStream(params({
        providerId: 'test-agent-confirm',
        configWithApiKey: {
          apiKey: 'key',
          model: 'test-confirm-model',
          selectedModels: ['test-confirm-model'],
        } as any,
        settings: {
          chat: { agentLoopStream: true },
          skills: { enableSkills: false },
          tools: { enableToolCalls: true, tools: {} },
        } as any,
        toolSettings: { enableToolCalls: true, tools: {} } as any,
      }))

      expect(result).toEqual({
        handled: true,
        isImageGeneration: false,
        pausedForConfirmation: true,
      })
      expect(providerRequests).toHaveLength(1)
      expect(providerRequests[0]).toMatchObject({
        turn: 1,
        toolChoice: 'auto',
        tools: ['dangerous'],
      })
      expect(mocks.executeToolDirectly).toHaveBeenCalledWith(
        'dangerous',
        { cmd: 'rm -rf tmp' },
        expect.objectContaining({
          sessionId: 's1',
          messageId: 'm1',
          toolCallId: 'call_danger',
          workingDirectory: '/tmp/project',
        }),
      )
      expect(mocks.eventBusEmit).toHaveBeenCalledWith('s1', expect.objectContaining({
        type: 'tool:result',
        toolCall: expect.objectContaining({
          id: 'call_danger',
          status: 'pending',
          requiresConfirmation: true,
          commandType: 'dangerous',
          error: 'Needs approval',
        }),
      }))
      expect(mocks.eventBusEmit).toHaveBeenCalledWith('s1', expect.objectContaining({
        type: 'step:updated',
        updates: expect.objectContaining({
          status: 'awaiting-confirmation',
          error: 'Needs approval',
          toolCall: expect.objectContaining({
            id: 'call_danger',
            requiresConfirmation: true,
          }),
        }),
      }))
      expect(mocks.eventBusEmit).not.toHaveBeenCalledWith('s1', expect.objectContaining({
        type: 'stream:complete',
      }))
      expect(mocks.senderSend).not.toHaveBeenCalledWith(
        IPC_CHANNELS.UI_MESSAGE_STREAM,
        expect.objectContaining({
          chunk: expect.objectContaining({ type: 'finish' }),
        }),
      )
      expect(mocks.engine.removeController).not.toHaveBeenCalled()
    } finally {
      unregister()
    }
  })
})
