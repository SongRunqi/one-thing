import { describe, expect, it, vi } from 'vitest'
import {
  extractOnethingCaughtErrorDetails,
  fallbackOnethingChatTitle,
  generateOnethingChatTitle,
  generateOnethingChatTitleForIpc,
  getOnethingCaughtErrorMessage,
  getEffectiveOnethingProviderConfig,
  getOnethingApiKeyForProvider,
  getOnethingCredentialsError,
  resolveOnethingProviderConfigForChat,
} from '../provider-runtime.js'
import {
  ONETHING_ZHIPU_CODING_PLAN_BASE_URL,
  ONETHING_ZHIPU_STANDARD_BASE_URL,
} from '../zhipu.js'

interface TestProviderConfig {
  model?: string
  selectedModels?: string[]
  apiKey?: string
  baseUrl?: string
  zhipuApiMode?: 'standard' | 'coding-plan'
  temperature?: number
  oauthToken?: unknown
}

interface TestAuth {
  kind: 'api-key' | 'oauth'
  apiKey?: string
}

const settings = {
  ai: {
    provider: 'deepseek',
    providers: {
      deepseek: {
        model: 'deepseek-chat',
        apiKey: 'deepseek-key',
        temperature: 0.4,
      },
      openai: {
        model: 'gpt-4.1',
        apiKey: 'openai-key',
      },
    } satisfies Record<string, TestProviderConfig>,
    temperature: 0.7,
  },
}

describe('onething provider runtime', () => {
  it('resolves session provider/model overrides through the session adapter', () => {
    const resolved = getEffectiveOnethingProviderConfig(settings, 'session-1', {
      getSession: () => ({
        lastProvider: 'openai',
        lastModel: 'gpt-4.1-mini',
      }),
    })

    expect(resolved).toMatchObject({
      providerId: 'openai',
      model: 'gpt-4.1-mini',
      providerConfig: {
        model: 'gpt-4.1-mini',
        apiKey: 'openai-key',
      },
    })
  })

  it('resolves Zhipu API mode into the matching endpoint', async () => {
    const zhipuSettings = {
      ai: {
        provider: 'zhipu',
        providers: {
          zhipu: {
            model: 'glm-5.2',
            apiKey: 'zhipu-key',
            zhipuApiMode: 'coding-plan' as const,
          },
        } satisfies Record<string, TestProviderConfig>,
        temperature: 0.7,
      },
    }

    expect(getEffectiveOnethingProviderConfig<TestProviderConfig>(zhipuSettings, 'session-1', {
      getSession: () => null,
    }).providerConfig?.baseUrl).toBe(ONETHING_ZHIPU_CODING_PLAN_BASE_URL)

    await expect(resolveOnethingProviderConfigForChat<TestProviderConfig, TestAuth>({
      sessionId: 'session-1',
      settings: zhipuSettings,
      adapters: {
        getSession: () => null,
        isOAuthProvider: () => false,
        resolveApiKey: (_providerId, providerConfig) => providerConfig?.apiKey,
        resolveOAuthAuth: async () => null,
        createApiKeyAuth: apiKey => ({ kind: 'api-key', apiKey }),
      },
    })).resolves.toMatchObject({
      providerId: 'zhipu',
      baseUrl: ONETHING_ZHIPU_CODING_PLAN_BASE_URL,
      providerConfig: {
        baseUrl: ONETHING_ZHIPU_CODING_PLAN_BASE_URL,
      },
    })
  })

  it('keeps custom Zhipu-compatible endpoints when present', () => {
    const zhipuSettings = {
      ai: {
        provider: 'zhipu',
        providers: {
          zhipu: {
            model: 'glm-5.2',
            apiKey: 'zhipu-key',
            baseUrl: 'https://proxy.example.test/v1',
            zhipuApiMode: 'coding-plan' as const,
          },
        } satisfies Record<string, TestProviderConfig>,
        temperature: 0.7,
      },
    }

    expect(getEffectiveOnethingProviderConfig<TestProviderConfig>(zhipuSettings, 'session-1', {
      getSession: () => null,
    }).providerConfig?.baseUrl).toBe('https://proxy.example.test/v1')
  })

  it('defaults Zhipu to the standard API endpoint', () => {
    const zhipuSettings = {
      ai: {
        provider: 'zhipu',
        providers: {
          zhipu: {
            model: 'glm-5.2',
            apiKey: 'zhipu-key',
          },
        } satisfies Record<string, TestProviderConfig>,
        temperature: 0.7,
      },
    }

    expect(getEffectiveOnethingProviderConfig<TestProviderConfig>(zhipuSettings, 'session-1', {
      getSession: () => null,
    }).providerConfig?.baseUrl).toBe(ONETHING_ZHIPU_STANDARD_BASE_URL)
  })

  it('uses OAuth refresh adapters when resolving API keys', async () => {
    const refreshOAuthToken = vi.fn(async () => ({ accessToken: 'oauth-token' }))

    await expect(getOnethingApiKeyForProvider('codex', { model: 'codex-mini' }, {
      isOAuthProvider: providerId => providerId === 'codex',
      refreshOAuthToken,
      resolveApiKey: () => null,
    })).resolves.toBe('oauth-token')

    expect(refreshOAuthToken).toHaveBeenCalledWith('codex')
  })

  it('resolves chat provider config with auth supplied by adapters', async () => {
    await expect(resolveOnethingProviderConfigForChat<TestProviderConfig, TestAuth>({
      sessionId: 'session-1',
      settings,
      adapters: {
        getSession: () => null,
        isOAuthProvider: () => false,
        resolveApiKey: (_providerId, providerConfig) => providerConfig?.apiKey,
        resolveOAuthAuth: async () => null,
        createApiKeyAuth: apiKey => ({ kind: 'api-key', apiKey }),
      },
    })).resolves.toMatchObject({
      providerId: 'deepseek',
      model: 'deepseek-chat',
      apiKey: 'deepseek-key',
      authContext: {
        kind: 'api-key',
        apiKey: 'deepseek-key',
      },
      temperature: 0.4,
    })
  })

  it('formats credential errors using provider auth classification adapters', () => {
    expect(getOnethingCredentialsError('codex', {
      isOAuthProvider: providerId => providerId === 'codex',
    })).toBe('Not logged in to codex. Please login in settings.')
    expect(getOnethingCredentialsError('deepseek', {
      isOAuthProvider: providerId => providerId === 'codex',
    })).toBe('API Key not configured. Please configure your AI settings.')
  })

  it('normalizes caught provider errors for runtime IPC callers', () => {
    expect(getOnethingCaughtErrorMessage(new Error('plain failure'), 'fallback'))
      .toBe('plain failure')
    expect(getOnethingCaughtErrorMessage({ message: 'object failure' }, 'fallback'))
      .toBe('object failure')
    expect(getOnethingCaughtErrorMessage(null, 'fallback'))
      .toBe('fallback')

    expect(extractOnethingCaughtErrorDetails({
      message: 'request failed',
      responseBody: JSON.stringify({ error: { message: 'quota exceeded' } }),
    })).toBe('quota exceeded')
  })

  it('generates chat titles through the configured utility model', async () => {
    const generateTitle = vi.fn(async () => 'Runtime Title')

    await expect(generateOnethingChatTitle<TestProviderConfig, TestAuth>({
      userMessage: 'please summarize this repo',
      settings: {
        ...settings,
        tools: {
          toolCallModel: {
            providerId: 'openai',
            model: 'gpt-4.1-mini',
            thinking: true,
            thinkingEffort: 'low',
          },
        },
      },
      adapters: {
        isProviderSupported: providerId => providerId === 'openai',
        resolveAuth: async (_providerId, providerConfig) => ({
          kind: 'api-key',
          apiKey: providerConfig?.apiKey,
        }),
        getProviderApiType: () => 'openai',
        generateTitle,
      },
    })).resolves.toEqual({
      title: 'Runtime Title',
      usedFallback: false,
    })

    expect(generateTitle).toHaveBeenCalledWith(
      'openai',
      expect.objectContaining({
        apiKey: 'openai-key',
        model: 'gpt-4.1-mini',
        apiType: 'openai',
      }),
      'please summarize this repo',
      {
        thinking: true,
        thinkingEffort: 'low',
      },
    )
  })

  it('projects generated chat titles into the IPC success shape', async () => {
    await expect(generateOnethingChatTitleForIpc<TestProviderConfig, TestAuth>({
      userMessage: 'please summarize this repo',
      settings,
      adapters: {
        isProviderSupported: () => true,
        resolveAuth: async () => ({ kind: 'api-key', apiKey: 'deepseek-key' }),
        getProviderApiType: () => 'openai',
        generateTitle: async () => 'IPC Title',
      },
    })).resolves.toEqual({
      success: true,
      title: 'IPC Title',
    })
  })

  it('falls back when title provider credentials are unavailable', async () => {
    await expect(generateOnethingChatTitle<TestProviderConfig, TestAuth>({
      userMessage: '012345678901234567890123456789abc',
      settings,
      adapters: {
        isProviderSupported: () => true,
        resolveAuth: async () => null,
        generateTitle: async () => 'unused',
      },
    })).resolves.toEqual({
      title: '012345678901234567890123456789...',
      usedFallback: true,
    })

    expect(fallbackOnethingChatTitle('short')).toBe('short')
  })
})
