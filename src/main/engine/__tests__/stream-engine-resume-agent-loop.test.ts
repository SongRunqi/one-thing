import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  eventBus: {
    emit: vi.fn(async () => undefined),
    onAnySession: vi.fn(() => vi.fn()),
  },
  sender: {
    isDestroyed: vi.fn(() => false),
    send: vi.fn(),
    on: vi.fn(),
  },
  getSettings: vi.fn(() => ({
    ai: {
      provider: 'deepseek',
      providers: {
        deepseek: { model: 'deepseek-v4-flash', selectedModels: ['deepseek-v4-flash'] },
      },
    },
    tools: { enableToolCalls: true, tools: {} },
    skills: { enableSkills: true },
    chat: {},
  })),
  getSession: vi.fn(),
  addMessage: vi.fn(),
  deleteMessage: vi.fn(),
  getEffectiveProviderConfig: vi.fn(() => ({
    providerId: 'deepseek',
    providerConfig: { model: 'deepseek-v4-flash', selectedModels: ['deepseek-v4-flash'] },
    model: 'deepseek-v4-flash',
  })),
  resolveProviderAuth: vi.fn(async () => ({ kind: 'api-key', apiKey: 'key' })),
  getSkillsForSession: vi.fn(() => []),
  getEnabledToolsAsync: vi.fn(async () => []),
  initializeAsyncTools: vi.fn(async () => undefined),
  setInitContext: vi.fn(),
  getMCPToolsForAI: vi.fn(() => ({})),
  modelSupportsTools: vi.fn(async () => true),
  buildContextVariablesPromptText: vi.fn(async () => ''),
  buildProjectDirsPromptVars: vi.fn(() => ({ active: undefined, known: [] })),
  buildPrompt: vi.fn(async () => ({ systemPrompt: 'system', messages: [] })),
  shouldUseAgentLoopStream: vi.fn(() => true),
  executeAgentLoopStreamGeneration: vi.fn(async () => ({ pausedForConfirmation: false })),
  runStream: vi.fn(async () => ({ pausedForConfirmation: false })),
}))

vi.mock('../../store.js', () => ({
  getSettings: mocks.getSettings,
  getSession: mocks.getSession,
  addMessage: mocks.addMessage,
  deleteMessage: mocks.deleteMessage,
}))

vi.mock('../stream/provider-helpers.js', () => ({
  getEffectiveProviderConfig: mocks.getEffectiveProviderConfig,
  resolveProviderAuth: mocks.resolveProviderAuth,
  extractErrorDetails: vi.fn((error: any) => error?.message),
  getProviderApiType: vi.fn(() => 'chat'),
}))

vi.mock('../../providers/index.js', () => ({
  isProviderSupported: vi.fn(() => true),
  requiresOAuth: vi.fn(() => false),
  convertToolDefinitionsForAI: vi.fn(() => ({})),
  generateChatTitle: vi.fn(async () => 'Generated title'),
}))

vi.mock('../stream/stream-executor.js', () => ({
  executeMessageStream: vi.fn(),
}))

vi.mock('../stream/agent-loop-executor.js', () => ({
  shouldUseAgentLoopStream: mocks.shouldUseAgentLoopStream,
  executeAgentLoopStreamGeneration: mocks.executeAgentLoopStreamGeneration,
}))

vi.mock('../stream/tool-loop.js', () => ({
  runStream: mocks.runStream,
}))

vi.mock('../prompt/index.js', () => ({
  buildPrompt: mocks.buildPrompt,
}))

vi.mock('../../ipc/skills.js', () => ({
  getSkillsForSession: mocks.getSkillsForSession,
}))

vi.mock('../../tools/index.js', () => ({
  getEnabledToolsAsync: mocks.getEnabledToolsAsync,
  initializeAsyncTools: mocks.initializeAsyncTools,
  setInitContext: mocks.setInitContext,
}))

vi.mock('../../mcp/index.js', () => ({
  getMCPToolsForAI: mocks.getMCPToolsForAI,
}))

vi.mock('../../providers/model-registry.js', () => ({
  modelSupportsTools: mocks.modelSupportsTools,
}))

vi.mock('../../variables/index.js', () => ({
  buildContextVariablesPromptText: mocks.buildContextVariablesPromptText,
}))

vi.mock('../../project-dirs/index.js', () => ({
  buildProjectDirsPromptVars: mocks.buildProjectDirsPromptVars,
}))

vi.mock('../../media/media-library-service.js', () => ({
  mediaLibraryService: {
    ingestMessageAttachments: vi.fn(),
  },
}))

vi.mock('../context-compact.js', () => ({
  compactSessionContext: vi.fn(),
  getContextCompactReason: vi.fn(() => null),
}))

vi.mock('../../prompts/resolver.js', () => ({
  resolvePromptReferences: vi.fn((content: string) => ({
    modelContent: content,
    displayContent: content,
    contentParts: undefined,
  })),
}))

const { StreamEngine } = await import('../stream-engine.js')

function session() {
  return {
    id: 's1',
    name: 'Resume Session',
    workingDirectory: '/tmp/project',
    messages: [
      {
        id: 'u1',
        role: 'user',
        content: 'delete tmp',
        timestamp: 1,
      },
      {
        id: 'm1',
        role: 'assistant',
        content: 'I need approval.',
        reasoning: 'The command is destructive.',
        timestamp: 2,
        isStreaming: true,
        toolCalls: [{
          id: 'call_1',
          toolId: 'bash',
          toolName: 'Bash',
          arguments: { cmd: 'rm -rf tmp' },
          status: 'completed',
          result: { output: 'removed' },
          timestamp: 2,
        }],
      },
    ],
  } as any
}

describe('StreamEngine resume-after-confirm agent-loop path', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('resumes through agent-loop with reconstructed assistant/tool history', async () => {
    mocks.getSession.mockReturnValue(session())
    const engine = new StreamEngine()
    engine.setEventBus(mocks.eventBus as any)

    await engine.handleResumeAfterConfirm(
      's1',
      { type: 'command:resume-after-confirm', messageId: 'm1' } as any,
      mocks.sender as any,
    )

    expect(mocks.shouldUseAgentLoopStream).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: 's1',
      assistantMessageId: 'm1',
      providerId: 'deepseek',
    }))
    expect(mocks.executeAgentLoopStreamGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 's1',
        assistantMessageId: 'm1',
        providerId: 'deepseek',
      }),
      [
        { role: 'user', content: 'delete tmp' },
        {
          role: 'assistant',
          content: 'I need approval.',
          reasoningContent: 'The command is destructive.',
          toolCalls: [{
            toolCallId: 'call_1',
            toolName: 'bash',
            args: { cmd: 'rm -rf tmp' },
          }],
        },
        {
          role: 'tool',
          content: [{
            type: 'tool-result',
            toolCallId: 'call_1',
            toolName: 'bash',
            result: { output: 'removed' },
          }],
        },
      ],
      'Resume Session',
      {
        initialContent: {
          content: 'I need approval.',
          reasoning: 'The command is destructive.',
        },
      },
    )
    expect(mocks.runStream).not.toHaveBeenCalled()
    expect(engine.getController('s1')).toBeUndefined()
  })

  it('keeps the active controller when resumed agent-loop pauses again', async () => {
    mocks.getSession.mockReturnValue(session())
    mocks.executeAgentLoopStreamGeneration.mockResolvedValueOnce({ pausedForConfirmation: true })
    const engine = new StreamEngine()
    engine.setEventBus(mocks.eventBus as any)

    await engine.handleResumeAfterConfirm(
      's1',
      { type: 'command:resume-after-confirm', messageId: 'm1' } as any,
      mocks.sender as any,
    )

    expect(mocks.executeAgentLoopStreamGeneration).toHaveBeenCalled()
    expect(engine.getController('s1')).toBeInstanceOf(AbortController)
  })

  it('subscribes to abort commands through the event bus', () => {
    const engine = new StreamEngine()
    engine.setEventBus(mocks.eventBus as any)

    expect(mocks.eventBus.onAnySession).toHaveBeenCalledWith(
      'command:abort',
      expect.any(Function),
      'StreamEngine',
    )
  })

  it('aborts active streams and clears queued agent messages', () => {
    const engine = new StreamEngine()
    const controller = new AbortController()
    engine.registerController('s1', controller)
    engine.steerMessage('s1', 'stop after this', 'test')
    engine.followUpMessage('s1', 'next thing', 'test')

    expect(engine.getSteeringQueue('s1').size).toBe(1)
    expect(engine.getFollowUpQueue('s1').size).toBe(1)

    const aborted = engine.handleAbort('s1', { type: 'command:abort', reason: 'test stop' })

    expect(aborted).toBe(true)
    expect(controller.signal.aborted).toBe(true)
    expect(engine.getController('s1')).toBeUndefined()
    expect(engine.getSteeringQueue('s1').size).toBe(0)
    expect(engine.getFollowUpQueue('s1').size).toBe(0)
  })
})
