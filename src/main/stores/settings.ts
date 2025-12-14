import type { AppSettings } from '../../shared/ipc.js'
import { AIProvider } from '../../shared/ipc.js'
import { getSettingsPath, readJsonFile, writeJsonFile } from './paths.js'

const defaultSettings: AppSettings = {
  ai: {
    provider: AIProvider.OpenAI,
    temperature: 0.7,
    providers: {
      [AIProvider.OpenAI]: {
        apiKey: '',
        model: 'gpt-4',
        selectedModels: ['gpt-4', 'gpt-4o', 'gpt-3.5-turbo'],
      },
      [AIProvider.Claude]: {
        apiKey: '',
        model: 'claude-sonnet-4-5-20250929',
        selectedModels: ['claude-sonnet-4-5-20250929', 'claude-3-5-haiku-20241022'],
      },
      [AIProvider.Custom]: {
        apiKey: '',
        baseUrl: '',
        model: '',
        selectedModels: [],
      },
    },
  },
  theme: 'dark',
  general: {
    animationSpeed: 0.25,
  },
}

// Migrate old settings format to new format
function migrateSettings(settings: any): AppSettings {
  // Check if settings have the old format (apiKey at root level of ai)
  if (settings.ai && !settings.ai.providers && settings.ai.apiKey !== undefined) {
    console.log('Migrating old settings format to new format')
    const oldApiKey = settings.ai.apiKey || ''
    const oldBaseUrl = settings.ai.baseUrl || ''
    const oldModel = settings.ai.model || ''
    const currentProvider = settings.ai.provider || AIProvider.OpenAI

    // Create new format with providers
    const migratedSettings: AppSettings = {
      ai: {
        provider: currentProvider,
        temperature: settings.ai.temperature ?? 0.7,
        providers: {
          [AIProvider.OpenAI]: {
            apiKey: currentProvider === AIProvider.OpenAI ? oldApiKey : '',
            model: currentProvider === AIProvider.OpenAI ? oldModel : 'gpt-4',
            baseUrl: currentProvider === AIProvider.OpenAI ? oldBaseUrl : undefined,
            selectedModels: currentProvider === AIProvider.OpenAI && oldModel ? [oldModel] : ['gpt-4', 'gpt-4o'],
          },
          [AIProvider.Claude]: {
            apiKey: currentProvider === AIProvider.Claude ? oldApiKey : '',
            model: currentProvider === AIProvider.Claude ? oldModel : 'claude-sonnet-4-5-20250929',
            baseUrl: currentProvider === AIProvider.Claude ? oldBaseUrl : undefined,
            selectedModels: currentProvider === AIProvider.Claude && oldModel ? [oldModel] : ['claude-sonnet-4-5-20250929'],
          },
          [AIProvider.Custom]: {
            apiKey: currentProvider === AIProvider.Custom ? oldApiKey : '',
            model: currentProvider === AIProvider.Custom ? oldModel : '',
            baseUrl: currentProvider === AIProvider.Custom ? oldBaseUrl : '',
            selectedModels: currentProvider === AIProvider.Custom && oldModel ? [oldModel] : [],
          },
        },
      },
      theme: settings.theme || 'dark',
      general: settings.general || defaultSettings.general,
    }

    // Save migrated settings
    saveSettings(migratedSettings)
    return migratedSettings
  }

  // Ensure providers object exists (partial migration case)
  if (settings.ai && !settings.ai.providers) {
    settings.ai.providers = defaultSettings.ai.providers
    saveSettings(settings)
  }

  // Ensure selectedModels exists for each provider
  let needsSave = false
  if (settings.ai?.providers) {
    for (const providerKey of Object.keys(settings.ai.providers)) {
      const provider = settings.ai.providers[providerKey]
      if (!provider.selectedModels) {
        provider.selectedModels = provider.model ? [provider.model] : []
        needsSave = true
      }
    }
  }

  // Ensure general settings exist
  if (!settings.general) {
    settings.general = defaultSettings.general
    needsSave = true
  }

  if (needsSave) {
    saveSettings(settings)
  }

  return settings as AppSettings
}

export function getSettings(): AppSettings {
  const settings = readJsonFile(getSettingsPath(), defaultSettings)
  return migrateSettings(settings)
}

export function saveSettings(settings: AppSettings): void {
  writeJsonFile(getSettingsPath(), settings)
}

export { defaultSettings }
