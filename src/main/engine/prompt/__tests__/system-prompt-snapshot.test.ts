import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(() => ({
    id: 's1',
    agentId: 'agent-1',
    workingDirectory: '/tmp/project',
    workingDirectoryRoots: ['/tmp/project'],
  })),
  getSettings: vi.fn(() => ({
    ai: {
      provider: 'deepseek',
      providers: {
        deepseek: {
          model: 'deepseek-v4-flash',
          selectedModels: ['deepseek-v4-flash'],
        },
      },
    },
    chat: { agentLoopStream: true },
    skills: { enableSkills: false },
    tools: { enableToolCalls: false, tools: {} },
  })),
  getAgent: vi.fn(() => ({ id: 'agent-1', name: 'Agent One' })),
  getEffectiveProviderConfig: vi.fn(() => ({
    providerId: 'deepseek',
    model: 'deepseek-v4-flash',
    providerConfig: {
      model: 'deepseek-v4-flash',
      selectedModels: ['deepseek-v4-flash'],
      baseUrl: 'https://api.deepseek.com',
    },
  })),
  resolveProviderAuth: vi.fn(async () => ({ kind: 'api-key', apiKey: 'key' })),
  isProviderSupported: vi.fn(() => true),
  modelSupportsTools: vi.fn(async () => false),
  getCodexNativeToolsForConfig: vi.fn(async () => []),
  getSkillsForSession: vi.fn(() => []),
  getEnabledToolsAsync: vi.fn(async () => []),
  initializeAsyncTools: vi.fn(async () => undefined),
  setInitContext: vi.fn(),
  getMCPToolsForAI: vi.fn(() => ({})),
  convertToolDefinitionsForAI: vi.fn(() => ({})),
  buildContextVariablesPromptText: vi.fn(async () => 'dynamic vars'),
  buildProjectDirsPromptVars: vi.fn(() => ({ active: undefined, known: [] })),
  buildPrompt: vi.fn(async () => ({
    systemPrompt: 'system prompt',
    messages: [{ role: 'system', content: 'system prompt' }],
  })),
}))

vi.mock('../../../store.js', () => ({
  getSession: mocks.getSession,
  getSettings: mocks.getSettings,
}))

vi.mock('../../../agents/index.js', () => ({
  getAgent: mocks.getAgent,
}))

vi.mock('../../stream/provider-helpers.js', () => ({
  getEffectiveProviderConfig: mocks.getEffectiveProviderConfig,
  resolveProviderAuth: mocks.resolveProviderAuth,
}))

vi.mock('../../../providers/index.js', () => ({
  convertToolDefinitionsForAI: mocks.convertToolDefinitionsForAI,
  isProviderSupported: mocks.isProviderSupported,
}))

vi.mock('../../../providers/model-registry.js', () => ({
  modelSupportsTools: mocks.modelSupportsTools,
}))

vi.mock('../../stream/tool-loop.js', () => ({
  getCodexNativeToolsForConfig: mocks.getCodexNativeToolsForConfig,
}))

vi.mock('../../../ipc/skills.js', () => ({
  getSkillsForSession: mocks.getSkillsForSession,
}))

vi.mock('../../../mcp/index.js', () => ({
  getMCPToolsForAI: mocks.getMCPToolsForAI,
}))

vi.mock('../../../tools/index.js', () => ({
  getEnabledToolsAsync: mocks.getEnabledToolsAsync,
  initializeAsyncTools: mocks.initializeAsyncTools,
  setInitContext: mocks.setInitContext,
}))

vi.mock('../../../variables/index.js', () => ({
  buildContextVariablesPromptText: mocks.buildContextVariablesPromptText,
}))

vi.mock('../../../project-dirs/index.js', () => ({
  buildProjectDirsPromptVars: mocks.buildProjectDirsPromptVars,
}))

vi.mock('../system-prompt.js', () => ({
  buildPrompt: mocks.buildPrompt,
}))

const { buildSystemPromptSnapshot } = await import('../system-prompt-snapshot.js')

describe('system prompt snapshot agent-loop route', () => {
  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
  })

  it('exposes the active agent-loop stream route for supported providers', async () => {
    const snapshot = await buildSystemPromptSnapshot('s1')

    expect(snapshot.providerId).toBe('deepseek')
    expect(snapshot.model).toBe('deepseek-v4-flash')
    expect(snapshot.agentLoopStream).toMatchObject({
      enabled: true,
      enabledBy: 'settings',
      providerSupported: true,
      active: true,
    })
    expect(snapshot.agentLoopStream.supportedProviderIds).toEqual(expect.arrayContaining(['deepseek', 'acp']))
    expect(mocks.buildPrompt).toHaveBeenCalledWith(expect.objectContaining({
      providerId: 'deepseek',
      contextVariables: 'dynamic vars',
      hasTools: false,
      historyMessages: [],
    }))
  })

  it('shows unsupported providers as enabled but inactive when the setting is on', async () => {
    mocks.getEffectiveProviderConfig.mockReturnValueOnce({
      providerId: 'openai',
      model: 'gpt-test',
      providerConfig: {
        model: 'gpt-test',
        selectedModels: ['gpt-test'],
        baseUrl: 'https://api.openai.com/v1',
      },
    })

    const snapshot = await buildSystemPromptSnapshot('s1')

    expect(snapshot.agentLoopStream).toMatchObject({
      enabled: true,
      enabledBy: 'settings',
      providerSupported: false,
      active: false,
    })
  })
})
