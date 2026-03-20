import type { AppSettings } from '../../shared/ipc.js'
import { AIProvider } from '../../shared/ipc.js'
import { getSettingsPath, readJsonFile, writeJsonFile } from './paths.js'
import { createDefaultSettings, mergeWithDefaults } from '../../shared/defaults/settings.js'
import * as fs from 'fs'

// ============================================================================
// Settings Singleton State
// ============================================================================

// Single instance - initialized once at startup
let settingsInstance: AppSettings | null = null
let initPromise: Promise<AppSettings> | null = null

// Legacy alias for backward compatibility
const defaultSettings = createDefaultSettings()

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

// ============================================================================
// Async Initialization (Recommended for startup)
// ============================================================================

/**
 * Initialize settings asynchronously at startup
 * This should be called once during app initialization before any getSettings() calls
 *
 * @returns Promise<AppSettings> - The loaded settings
 */
export async function initializeSettings(): Promise<AppSettings> {
  // Return existing instance if already initialized
  if (settingsInstance !== null) {
    console.log('[Settings] Already initialized, returning cached instance')
    return settingsInstance
  }

  // Return pending promise if initialization is in progress
  if (initPromise !== null) {
    console.log('[Settings] Initialization in progress, waiting...')
    return initPromise
  }

  console.log('[Settings] Starting async initialization...')

  // Create initialization promise
  initPromise = (async () => {
    const settingsPath = getSettingsPath()

    try {
      // Use async file read
      const data = await fs.promises.readFile(settingsPath, 'utf-8')
      const parsed = JSON.parse(data)
      settingsInstance = migrateSettings(parsed)
      console.log('[Settings] Loaded from disk successfully')
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        // File doesn't exist - use defaults
        console.log('[Settings] No settings file found, using defaults')
        settingsInstance = createDefaultSettings()
        await saveSettingsAsync(settingsInstance)
      } else {
        // Parse error or other - use defaults but log the error
        console.error('[Settings] Error loading settings, using defaults:', error.message)
        settingsInstance = createDefaultSettings()
        await saveSettingsAsync(settingsInstance)
      }
    }

    return settingsInstance
  })()

  return initPromise
}

/**
 * Check if settings have been initialized
 */
export function isSettingsInitialized(): boolean {
  return settingsInstance !== null
}

// ============================================================================
// Sync Getters (Hot path - after initialization)
// ============================================================================

/**
 * Get settings synchronously (for hot path after initialization)
 * Falls back to sync read if not yet initialized (backward compatibility)
 *
 * @returns AppSettings
 */
export function getSettings(): AppSettings {
  // Return cached instance if available
  if (settingsInstance !== null) {
    return settingsInstance
  }

  // Fallback: sync read for backward compatibility
  // This should rarely happen if initializeSettings() is called at startup
  console.warn('[Settings] getSettings() called before initialization, using sync fallback')
  const settings = readJsonFile(getSettingsPath(), defaultSettings)
  settingsInstance = migrateSettings(settings)
  return settingsInstance
}

// ============================================================================
// Save Operations
// ============================================================================

/**
 * Save settings asynchronously (recommended)
 * Updates both disk and memory cache
 */
export async function saveSettingsAsync(settings: AppSettings): Promise<void> {
  const settingsPath = getSettingsPath()
  await fs.promises.writeFile(settingsPath, JSON.stringify(settings, null, 2), 'utf-8')
  settingsInstance = settings
  console.log('[Settings] Saved to disk asynchronously')
}

/**
 * Save settings synchronously (for backward compatibility)
 * Updates both disk and memory cache
 */
export function saveSettings(settings: AppSettings): void {
  writeJsonFile(getSettingsPath(), settings)
  settingsInstance = settings
}

// ============================================================================
// Cache Management
// ============================================================================

/**
 * Invalidate settings cache (for hot reload or external modification)
 * Next getSettings() call will reload from disk
 */
export function invalidateSettingsCache(): void {
  settingsInstance = null
  initPromise = null
  console.log('[Settings] Cache invalidated')
}

/**
 * Update settings in memory without saving to disk
 * Useful for temporary overrides
 */
export function updateSettingsInMemory(settings: AppSettings): void {
  settingsInstance = settings
}

// ============================================================================
// Exports
// ============================================================================

export { defaultSettings }
