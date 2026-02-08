/**
 * Settings Module
 * Application settings type definitions for IPC communication
 */

import type { AISettings } from './providers.js'
import type { ToolSettings } from './tools.js'
import type { MCPSettings } from './mcp.js'
import type { SkillSettings } from './skills.js'

export type ColorTheme = 'blue' | 'purple' | 'green' | 'orange' | 'pink' | 'cyan' | 'red'

// Message list density mode
export type MessageListDensity = 'compact' | 'comfortable' | 'spacious'

// Base theme controls the overall look (backgrounds, text colors, etc.)
export type BaseTheme =
  | 'obsidian' | 'ocean' | 'forest' | 'rose' | 'ember'  // Original themes
  | 'nord' | 'dracula' | 'tokyo' | 'catppuccin' | 'gruvbox' | 'onedark' | 'github' | 'rosepine'  // New themes

// Keyboard shortcut configuration
export interface KeyboardShortcut {
  key: string           // Main key (e.g., 'Enter', 'n', '/')
  ctrlKey?: boolean
  metaKey?: boolean     // Cmd on Mac
  shiftKey?: boolean
  altKey?: boolean
}

export interface ShortcutSettings {
  sendMessage: KeyboardShortcut      // Send message
  newChat: KeyboardShortcut          // New chat
  closeChat: KeyboardShortcut        // Close current chat
  toggleSidebar: KeyboardShortcut    // Toggle sidebar
  focusInput: KeyboardShortcut       // Focus input (default /)
}

// Quick command button configuration for InputBox toolbar
export interface QuickCommandConfig {
  commandId: string    // Command ID, e.g., 'cd', 'git', 'files'
  enabled: boolean     // Whether to show this button
}

export interface GeneralSettings {
  animationSpeed: number  // 0.1 - 0.5 seconds, default 0.25
  sendShortcut: 'enter' | 'ctrl-enter' | 'cmd-enter'  // Legacy, kept for compatibility
  colorTheme: ColorTheme  // Accent color theme
  baseTheme: BaseTheme    // Base theme (overall colors) - DEPRECATED, use themeId
  themeId?: string        // Theme ID - DEPRECATED, use darkThemeId/lightThemeId
  darkThemeId?: string    // Theme ID for dark mode (e.g., 'dracula', 'nord')
  lightThemeId?: string   // Theme ID for light mode (e.g., 'flexoki')
  shortcuts?: ShortcutSettings  // Custom keyboard shortcuts
  messageListDensity?: MessageListDensity  // Message list display density, default 'comfortable'
  messageLineHeight?: number  // Message line height, 1.2-2.2, default 1.6
  quickCommands?: QuickCommandConfig[]  // Quick command buttons shown above InputBox
  autoCheckUpdates?: boolean  // Auto check for updates on startup, default true
  // User profile for lightweight context injection
  userProfile?: UserProfileSettings
}

// Lightweight user profile for system prompt injection (low token, high value)
export interface UserProfileSettings {
  name?: string           // User's name
  timezone?: string       // Timezone (e.g., 'Asia/Shanghai')
  language?: string       // Preferred language (e.g., 'zh-CN', 'en')
  customInfo?: string     // Brief custom info (max 100 chars)
}

// Chat settings for model parameters
export interface ChatSettings {
  temperature: number           // 0-2, default 0.7
  maxTokens: number            // Maximum output tokens, default 4096
  topP?: number                // Nucleus sampling, 0-1, default 1
  presencePenalty?: number     // -2 to 2, default 0
  frequencyPenalty?: number    // -2 to 2, default 0
  branchOpenInSplitScreen?: boolean  // Whether branches open in split screen, default true
  chatFontSize?: number        // Chat font size in px, 12-20, default 14
  contextCompactThreshold?: number  // Context usage % to trigger compacting, 50-100, default 85
}

// Supported embedding provider types
export type EmbeddingProviderType = 'openai' | 'zhipu' | 'gemini' | 'local'

// Embedding provider metadata for UI
export interface EmbeddingProviderMeta {
  id: EmbeddingProviderType
  name: string
  defaultModel: string
  models: { id: string; name: string; dimensions?: number }[]
  supportsCustomDimensions?: boolean
}

// Embedding settings for memory system
export interface EmbeddingSettings {
  provider: EmbeddingProviderType  // Which embedding provider to use
  memoryEnabled?: boolean          // Master switch for memory extraction (default: true)

  // Common model settings (applies to API providers)
  model?: string                   // Selected model ID
  dimensions?: number              // Vector dimensions (if supported by model)

  // Optional overrides (if not set, use AI Provider config)
  apiKeyOverride?: string
  baseUrlOverride?: string

  // Legacy fields (for backward compatibility)
  openai?: {
    apiKey?: string
    baseUrl?: string
    model: string
    dimensions?: number
  }
  local?: {
    model: string
  }
}

export interface AppSettings {
  ai: AISettings
  theme: 'light' | 'dark' | 'system'
  general: GeneralSettings
  chat?: ChatSettings
  tools: ToolSettings
  mcp?: MCPSettings
  skills?: SkillSettings
  embedding?: EmbeddingSettings
}

// Settings IPC Request/Response types
export interface GetSettingsResponse {
  success: boolean
  settings?: AppSettings
  error?: string
}

export interface SaveSettingsRequest extends AppSettings { }

export interface SaveSettingsResponse {
  success: boolean
  error?: string
}
