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
      },
      [AIProvider.Claude]: {
        apiKey: '',
        model: 'claude-sonnet-4-5-20250929',
      },
      [AIProvider.Custom]: {
        apiKey: '',
        baseUrl: '',
        model: '',
      },
    },
  },
  theme: 'light',
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
          },
          [AIProvider.Claude]: {
            apiKey: currentProvider === AIProvider.Claude ? oldApiKey : '',
            model: currentProvider === AIProvider.Claude ? oldModel : 'claude-sonnet-4-5-20250929',
            baseUrl: currentProvider === AIProvider.Claude ? oldBaseUrl : undefined,
          },
          [AIProvider.Custom]: {
            apiKey: currentProvider === AIProvider.Custom ? oldApiKey : '',
            model: currentProvider === AIProvider.Custom ? oldModel : '',
            baseUrl: currentProvider === AIProvider.Custom ? oldBaseUrl : '',
          },
        },
      },
      theme: settings.theme || 'light',
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
