/**
 * Unified Default Settings
 * Single source of truth for all default settings across main and renderer processes
 */

import { AIProvider } from '../ipc/providers.js'
import type {
  AppSettings,
  GeneralSettings,
  ChatSettings,
  EditorSettings,
  NetworkSettings,
} from '../ipc/settings.js'
import type { ProviderConfig, AISettings } from '../ipc/providers.js'
import type { ToolSettings } from '../ipc/tools.js'

// ============================================================================
// Constants
// ============================================================================

export const DEFAULT_TEMPERATURE = 0.7
export const DEFAULT_MAX_TOKENS = 4096
export const DEFAULT_CONTEXT_LENGTH = 128000

export const DEFAULT_EDITOR_SETTINGS: Required<EditorSettings> = {
  tabSize: 2,
  lineWrapping: true,
  syntaxHighlighting: true,
  completionEnabled: true,
  composerMaxHeight: 200,
}

// ============================================================================
// Provider Configurations
// ============================================================================

export const DEFAULT_PROVIDER_CONFIGS: Record<string, ProviderConfig> = {
  [AIProvider.OpenAI]: {
    apiKey: '',
    model: 'gpt-4o',
    selectedModels: [],
    enabled: false,
  },
  [AIProvider.Claude]: {
    apiKey: '',
    model: 'claude-sonnet-4-5-20250929',
    selectedModels: [],
    enabled: false,
  },
  [AIProvider.DeepSeek]: {
    apiKey: '',
    model: 'deepseek-chat',
    selectedModels: [],
    enabled: false,
  },
  [AIProvider.Kimi]: {
    apiKey: '',
    model: 'moonshot-v1-8k',
    selectedModels: [],
    enabled: false,
  },
  [AIProvider.Zhipu]: {
    apiKey: '',
    model: 'glm-4-flash',
    selectedModels: [],
    enabled: false,
  },
  [AIProvider.OpenRouter]: {
    apiKey: '',
    model: 'openai/gpt-4o',
    selectedModels: [],
    enabled: false,
  },
  [AIProvider.Gemini]: {
    apiKey: '',
    model: 'gemini-2.0-flash-exp',
    selectedModels: [],
    enabled: false,
  },
  [AIProvider.ClaudeCode]: {
    model: 'claude-sonnet-4-20250514',
    selectedModels: [],
    authType: 'oauth',
    enabled: false,
  },
  [AIProvider.GitHubCopilot]: {
    model: 'gpt-4o',
    selectedModels: [],
    authType: 'oauth',
    enabled: false,
  },
  [AIProvider.Custom]: {
    apiKey: '',
    baseUrl: '',
    model: '',
    selectedModels: [],
    enabled: false,
  },
}

// ============================================================================
// AI Settings
// ============================================================================

export const DEFAULT_AI_SETTINGS: AISettings = {
  provider: AIProvider.OpenAI,
  temperature: DEFAULT_TEMPERATURE,
  providers: DEFAULT_PROVIDER_CONFIGS as AISettings['providers'],
  customProviders: [],
}

// ============================================================================
// General Settings
// ============================================================================

export const DEFAULT_GENERAL_SETTINGS: GeneralSettings = {
  animationSpeed: 0.25,
  sendShortcut: 'enter',
  colorTheme: 'blue',
  baseTheme: 'obsidian',
  themeId: 'flexoki',
  darkThemeId: 'flexoki',
  lightThemeId: 'flexoki',
  messageListDensity: 'comfortable',
  shortcuts: {
    sendMessage: { key: 'Enter' },
    newChat: { key: 'n', metaKey: true },
    closeChat: { key: 'w', metaKey: true },
    toggleSidebar: { key: 'b', metaKey: true },
    focusInput: { key: '/' },
    searchEverywhere: { key: 'k', metaKey: true },
    toggleTodoPlanWindow: { key: 't', metaKey: true, shiftKey: true },
    toggleTodoPlan: { key: 't', metaKey: true, altKey: true },
  },
  quickCommands: [
    { commandId: 'cd', enabled: true },
    { commandId: 'git', enabled: true },
    { commandId: 'files', enabled: true },
  ],
  dailyNotes: {
    enabled: true,
    directoryMode: 'personal',
    customDirectory: '',
    useObsidianConfig: true,
    format: 'YYYY-MM-DD',
  },
  todoPlan: {
    enabled: true,
    directory: '',
    cardHeight: 360,
    pinned: false,
    docked: false,
  },
  editor: DEFAULT_EDITOR_SETTINGS,
}

// ============================================================================
// Chat Settings
// ============================================================================

export const DEFAULT_CHAT_SETTINGS: ChatSettings = {
  temperature: DEFAULT_TEMPERATURE,
  maxTokens: DEFAULT_MAX_TOKENS,
  topP: 1,
  presencePenalty: 0,
  frequencyPenalty: 0,
  branchOpenInSplitScreen: true,
  chatFontSize: 14,
  contextCompactEnabled: true,
  contextCompactThreshold: 85,
  contextCompactKeepRecentTurns: 6,
}

// ============================================================================
// Tool Settings
// ============================================================================

export const DEFAULT_TOOL_SETTINGS: ToolSettings = {
  enableToolCalls: true,
  // Per-tool settings are user overrides keyed by the dynamic tool registry.
  // Tool defaults come from each ToolDefinition, so new tools do not require
  // editing this settings file.
  tools: {},
  bash: {
    enableSandbox: true,
    defaultWorkingDirectory: '',
    allowedDirectories: [],
    confirmDangerousCommands: true,
    dangerousCommandWhitelist: [],
  },
}

export const DEFAULT_NETWORK_SETTINGS: NetworkSettings = {
  proxy: {
    enabled: false,
    url: '',
    bypassRules: 'localhost;127.0.0.1;::1;*.local',
  },
}

// ============================================================================
// Complete Default Settings Factory
// ============================================================================

/**
 * Create a fresh copy of default settings
 * Use this function to ensure you get a clean copy without reference issues
 */
export function createDefaultSettings(): AppSettings {
  return {
    ai: JSON.parse(JSON.stringify(DEFAULT_AI_SETTINGS)),
    theme: 'dark',
    general: JSON.parse(JSON.stringify(DEFAULT_GENERAL_SETTINGS)),
    chat: JSON.parse(JSON.stringify(DEFAULT_CHAT_SETTINGS)),
    tools: JSON.parse(JSON.stringify(DEFAULT_TOOL_SETTINGS)),
    network: JSON.parse(JSON.stringify(DEFAULT_NETWORK_SETTINGS)),
  }
}

/**
 * Deep merge settings with defaults
 * Ensures all required fields exist while preserving user values
 */
export function mergeWithDefaults(settings: Partial<AppSettings>): AppSettings {
  const defaults = createDefaultSettings()

  // Use type assertion because we know defaults provides all required fields
  // and spread operations preserve those values
  const merged = {
    ai: {
      ...defaults.ai,
      ...settings.ai,
      providers: {
        ...defaults.ai.providers,
        ...settings.ai?.providers,
      },
    },
    theme: settings.theme ?? defaults.theme,
    general: {
      ...defaults.general,
      ...settings.general,
      shortcuts: {
        ...defaults.general.shortcuts,
        ...settings.general?.shortcuts,
      },
      quickCommands: settings.general?.quickCommands ?? defaults.general.quickCommands,
      dailyNotes: {
        ...defaults.general.dailyNotes,
        ...settings.general?.dailyNotes,
      },
      todoPlan: {
        ...defaults.general.todoPlan,
        ...settings.general?.todoPlan,
      },
      editor: normalizeEditorSettings(settings.general?.editor),
    },
    chat: {
      ...defaults.chat,
      ...settings.chat,
      contextCompactEnabled: settings.chat?.contextCompactEnabled ?? DEFAULT_CHAT_SETTINGS.contextCompactEnabled,
      contextCompactThreshold: clampNumber(
        settings.chat?.contextCompactThreshold,
        50,
        100,
        DEFAULT_CHAT_SETTINGS.contextCompactThreshold ?? 85,
      ),
      contextCompactKeepRecentTurns: clampNumber(
        settings.chat?.contextCompactKeepRecentTurns,
        1,
        20,
        DEFAULT_CHAT_SETTINGS.contextCompactKeepRecentTurns ?? 6,
      ),
    },
    tools: {
      ...defaults.tools,
      ...settings.tools,
      bash: {
        ...defaults.tools.bash,
        ...settings.tools?.bash,
      },
    },
    network: {
      ...defaults.network!,
      ...settings.network,
      proxy: {
        ...defaults.network!.proxy,
        ...settings.network?.proxy,
      },
    },
    mcp: settings.mcp,
    skills: settings.skills,
  }

  stripLegacyProviderLocalAddress(merged.ai.providers)
  if (Array.isArray(merged.ai.customProviders)) {
    for (const provider of merged.ai.customProviders) {
      delete (provider as any).localAddress
    }
  }

  return merged as AppSettings
}

export function normalizeEditorSettings(settings?: EditorSettings): Required<EditorSettings> {
  return {
    tabSize: clampNumber(settings?.tabSize, 1, 8, DEFAULT_EDITOR_SETTINGS.tabSize),
    lineWrapping: settings?.lineWrapping ?? DEFAULT_EDITOR_SETTINGS.lineWrapping,
    syntaxHighlighting: settings?.syntaxHighlighting ?? DEFAULT_EDITOR_SETTINGS.syntaxHighlighting,
    completionEnabled: settings?.completionEnabled ?? DEFAULT_EDITOR_SETTINGS.completionEnabled,
    composerMaxHeight: clampNumber(
      settings?.composerMaxHeight,
      80,
      640,
      DEFAULT_EDITOR_SETTINGS.composerMaxHeight,
    ),
  }
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.max(min, Math.min(max, Math.round(value)))
}

function stripLegacyProviderLocalAddress(providers: Record<string, unknown>): void {
  for (const config of Object.values(providers)) {
    if (config && typeof config === 'object') {
      delete (config as any).localAddress
    }
  }
}
