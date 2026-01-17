import type { AppSettings } from '../../shared/ipc.js'
import { AIProvider } from '../../shared/ipc.js'
import { getSettingsPath, readJsonFile, writeJsonFile } from './paths.js'

// 内存缓存 - 避免每次都读取文件
let cachedSettings: AppSettings | null = null

const defaultSettings: AppSettings = {
  ai: {
    provider: AIProvider.OpenAI,
    temperature: 0.3,
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
      [AIProvider.DeepSeek]: {
        apiKey: '',
        model: 'deepseek-chat',
        selectedModels: ['deepseek-chat', 'deepseek-reasoner'],
      },
      [AIProvider.Kimi]: {
        apiKey: '',
        model: 'moonshot-v1-8k',
        selectedModels: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'],
      },
      [AIProvider.Zhipu]: {
        apiKey: '',
        model: 'glm-4',
        selectedModels: ['glm-4', 'glm-4v', 'glm-3-turbo'],
      },
    },
  },
  theme: 'dark',
  general: {
    animationSpeed: 0.25,
    sendShortcut: 'enter',
    colorTheme: 'blue',
    baseTheme: 'obsidian',
    themeId: 'flexoki',  // Default JSON theme (deprecated, use darkThemeId/lightThemeId)
    darkThemeId: 'flexoki',
    lightThemeId: 'flexoki',
    quickCommands: [
      { commandId: 'cd', enabled: true },
      { commandId: 'git', enabled: true },
      { commandId: 'files', enabled: true },
    ],
  },
  tools: {
    enableToolCalls: true,
    tools: {
      get_current_time: { enabled: true, autoExecute: true },
      calculator: { enabled: true, autoExecute: true },
    },
    bash: {
      enableSandbox: true,
      defaultWorkingDirectory: '',
      allowedDirectories: [],
      confirmDangerousCommands: true,
      dangerousCommandWhitelist: [],
    },
  },
  // Chat settings for model parameters and display
  chat: {
    temperature: 0.7,
    maxTokens: 4096,
    topP: 1,
    presencePenalty: 0,
    frequencyPenalty: 0,
    branchOpenInSplitScreen: true,
    chatFontSize: 14,
  },
  // Embedding settings for memory system
  embedding: {
    provider: 'openai',
    openai: {
      model: 'text-embedding-3-small',
      dimensions: 384,  // Use reduced dimensions for efficiency
    },
    local: {
      model: 'all-MiniLM-L6-v2',
    },
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
          [AIProvider.DeepSeek]: {
            apiKey: currentProvider === AIProvider.DeepSeek ? oldApiKey : '',
            model: currentProvider === AIProvider.DeepSeek ? oldModel : 'deepseek-chat',
            baseUrl: currentProvider === AIProvider.DeepSeek ? oldBaseUrl : undefined,
            selectedModels: currentProvider === AIProvider.DeepSeek && oldModel ? [oldModel] : ['deepseek-chat', 'deepseek-reasoner'],
          },
          [AIProvider.Kimi]: {
            apiKey: currentProvider === AIProvider.Kimi ? oldApiKey : '',
            model: currentProvider === AIProvider.Kimi ? oldModel : 'moonshot-v1-8k',
            baseUrl: currentProvider === AIProvider.Kimi ? oldBaseUrl : undefined,
            selectedModels: currentProvider === AIProvider.Kimi && oldModel ? [oldModel] : ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'],
          },
          [AIProvider.Zhipu]: {
            apiKey: currentProvider === AIProvider.Zhipu ? oldApiKey : '',
            model: currentProvider === AIProvider.Zhipu ? oldModel : 'glm-4',
            baseUrl: currentProvider === AIProvider.Zhipu ? oldBaseUrl : undefined,
            selectedModels: currentProvider === AIProvider.Zhipu && oldModel ? [oldModel] : ['glm-4', 'glm-4v', 'glm-3-turbo'],
          },
        },
      },
      theme: settings.theme || 'dark',
      general: settings.general || defaultSettings.general,
      tools: settings.tools || defaultSettings.tools,
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

  // Ensure sendShortcut exists in general settings
  if (settings.general && !settings.general.sendShortcut) {
    settings.general.sendShortcut = 'enter'
    needsSave = true
  }

  // Ensure colorTheme exists in general settings
  if (settings.general && !settings.general.colorTheme) {
    settings.general.colorTheme = 'blue'
    needsSave = true
  }

  // Ensure baseTheme exists in general settings
  if (settings.general && !settings.general.baseTheme) {
    settings.general.baseTheme = 'obsidian'
    needsSave = true
  }

  // Ensure themeId exists in general settings (for JSON theme system)
  if (settings.general && !settings.general.themeId) {
    settings.general.themeId = 'flexoki'
    needsSave = true
  }

  // Ensure darkThemeId exists in general settings (dual theme system)
  if (settings.general && !settings.general.darkThemeId) {
    settings.general.darkThemeId = settings.general.themeId || 'flexoki'
    needsSave = true
  }

  // Ensure lightThemeId exists in general settings (dual theme system)
  if (settings.general && !settings.general.lightThemeId) {
    settings.general.lightThemeId = settings.general.themeId || 'flexoki'
    needsSave = true
  }

  // Ensure quickCommands exists in general settings
  if (settings.general && !settings.general.quickCommands) {
    settings.general.quickCommands = defaultSettings.general.quickCommands
    needsSave = true
  }

  // Ensure tools settings exist
  if (!settings.tools) {
    settings.tools = defaultSettings.tools
    needsSave = true
  }

  // Ensure bash settings exist in tools
  if (settings.tools && !settings.tools.bash) {
    settings.tools.bash = defaultSettings.tools.bash
    needsSave = true
  }

  // Ensure embedding settings exist
  if (!settings.embedding) {
    settings.embedding = defaultSettings.embedding
    needsSave = true
  }

  if (needsSave) {
    saveSettings(settings)
  }

  return settings as AppSettings
}

export function getSettings(): AppSettings {
  // 如果有缓存，直接返回
  if (cachedSettings !== null) {
    return cachedSettings
  }

  // 首次调用，从磁盘读取并缓存
  const settings = readJsonFile(getSettingsPath(), defaultSettings)
  cachedSettings = migrateSettings(settings)
  return cachedSettings
}

export function saveSettings(settings: AppSettings): void {
  writeJsonFile(getSettingsPath(), settings)
  // 更新缓存
  cachedSettings = settings
}

/**
 * 手动刷新缓存（用于热重载或外部修改场景）
 */
export function invalidateSettingsCache(): void {
  cachedSettings = null
}

export { defaultSettings }
