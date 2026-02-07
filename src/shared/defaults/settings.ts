/**
 * Unified Default Settings
 * Single source of truth for all default settings across main and renderer processes
 */

import { AIProvider } from '../ipc/providers.js'
import type {
  AppSettings,
  GeneralSettings,
  ChatSettings,
  EmbeddingSettings,
} from '../ipc/settings.js'
import type { ProviderConfig, AISettings } from '../ipc/providers.js'
import type { ToolSettings } from '../ipc/tools.js'

// ============================================================================
// Constants
// ============================================================================

export const DEFAULT_TEMPERATURE = 0.7
export const DEFAULT_MAX_TOKENS = 4096
export const DEFAULT_CONTEXT_LENGTH = 128000

// ============================================================================
// Provider Configurations
// ============================================================================

export const DEFAULT_PROVIDER_CONFIGS: Record<string, ProviderConfig> = {
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
    model: 'glm-4-flash',
    selectedModels: ['glm-4-flash', 'glm-4-plus', 'glm-4'],
  },
  [AIProvider.OpenRouter]: {
    apiKey: '',
    model: 'openai/gpt-4o',
    selectedModels: [
      'openai/gpt-4o',
      'openai/gpt-4o-mini',
      'anthropic/claude-3.5-sonnet',
      'google/gemini-pro-1.5',
      'meta-llama/llama-3.1-70b-instruct',
    ],
  },
  [AIProvider.Gemini]: {
    apiKey: '',
    model: 'gemini-2.0-flash-exp',
    selectedModels: ['gemini-2.0-flash-exp', 'gemini-1.5-pro', 'gemini-1.5-flash'],
  },
  [AIProvider.ClaudeCode]: {
    model: 'claude-sonnet-4-20250514',
    selectedModels: ['claude-sonnet-4-20250514', 'claude-3-5-haiku-20241022', 'claude-opus-4-20250514'],
    authType: 'oauth',
  },
  [AIProvider.GitHubCopilot]: {
    model: 'gpt-4o',
    selectedModels: ['gpt-4o', 'gpt-4o-mini', 'o1-preview', 'o1-mini'],
    authType: 'oauth',
  },
  [AIProvider.Custom]: {
    apiKey: '',
    baseUrl: '',
    model: '',
    selectedModels: [],
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
  },
  quickCommands: [
    { commandId: 'cd', enabled: true },
    { commandId: 'git', enabled: true },
    { commandId: 'files', enabled: true },
  ],
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
}

// ============================================================================
// Tool Settings
// ============================================================================

export const DEFAULT_TOOL_SETTINGS: ToolSettings = {
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
}

// ============================================================================
// Embedding Settings
// ============================================================================

export const DEFAULT_EMBEDDING_SETTINGS: EmbeddingSettings = {
  provider: 'openai',
  memoryEnabled: true,
  model: 'text-embedding-3-small',
  dimensions: 384,
  openai: {
    model: 'text-embedding-3-small',
    dimensions: 384,
  },
  local: {
    model: 'all-MiniLM-L6-v2',
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
    embedding: JSON.parse(JSON.stringify(DEFAULT_EMBEDDING_SETTINGS)),
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
    },
    chat: {
      ...defaults.chat,
      ...settings.chat,
    },
    tools: {
      ...defaults.tools,
      ...settings.tools,
      bash: {
        ...defaults.tools.bash,
        ...settings.tools?.bash,
      },
    },
    embedding: {
      ...defaults.embedding,
      ...settings.embedding,
    },
    mcp: settings.mcp,
    skills: settings.skills,
  }

  return merged as AppSettings
}
