import { describe, expect, it } from 'vitest'
import type { AppSettings } from '@/types'
import { resolveProviderModelSelection } from '../provider-model'

function settings(overrides: Partial<AppSettings['ai']>): AppSettings {
  return {
    ai: {
      provider: 'codex',
      providers: {
        codex: {
          model: 'gpt-5.5',
          selectedModels: ['gpt-5.5'],
        },
        deepseek: {
          model: 'deepseek-chat',
          selectedModels: ['deepseek-chat'],
        },
      },
      customProviders: [],
      ...overrides,
    },
  } as AppSettings
}

describe('resolveProviderModelSelection', () => {
  it('repairs a saved provider/model pair when the model belongs to another provider', () => {
    const selection = resolveProviderModelSelection({
      settings: settings({}),
      session: {
        lastProvider: 'deepseek',
        lastModel: 'gpt-5.5',
      },
      providers: [
        {
          id: 'codex',
          name: 'Codex',
          description: '',
          defaultBaseUrl: '',
          defaultModel: 'gpt-5.5',
          icon: 'codex',
          supportsCustomBaseUrl: false,
          requiresApiKey: false,
        },
        {
          id: 'deepseek',
          name: 'DeepSeek',
          description: '',
          defaultBaseUrl: '',
          defaultModel: 'deepseek-chat',
          icon: 'deepseek',
          supportsCustomBaseUrl: true,
          requiresApiKey: true,
        },
      ],
    })

    expect(selection).toEqual({
      providerId: 'codex',
      model: 'gpt-5.5',
    })
  })

  it('keeps a valid saved session pair', () => {
    const selection = resolveProviderModelSelection({
      settings: settings({}),
      session: {
        lastProvider: 'deepseek',
        lastModel: 'deepseek-chat',
      },
    })

    expect(selection).toEqual({
      providerId: 'deepseek',
      model: 'deepseek-chat',
    })
  })
})
