/**
 * Settings Module
 * Application settings type definitions for IPC communication
 */

import type { AISettings } from './providers.js'
import type { ToolSettings } from './tools.js'
import type { MCPSettings } from './mcp.js'
import type { ACPSettings } from './acp.js'
import type { SkillSettings } from './skills.js'
import type { TodoPlanSettings } from './todo-plan.js'
import type { VoiceSettings } from './voice.js'

export type ColorTheme = 'blue' | 'purple' | 'green' | 'orange' | 'pink' | 'cyan' | 'red'

// Message list density mode
export type MessageListDensity = 'compact' | 'comfortable' | 'spacious'

// Global typography density mode
export type TypographyDensity = 'compact' | 'comfortable'

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
  sequence?: 'double-shift'
}

export interface ShortcutSettings {
  sendMessage: KeyboardShortcut      // Send message
  newChat: KeyboardShortcut          // New chat
  closeChat: KeyboardShortcut        // Close current chat
  toggleSidebar: KeyboardShortcut    // Toggle sidebar
  focusInput: KeyboardShortcut       // Focus input (default /)
  searchEverywhere?: KeyboardShortcut      // Toggle Search Everywhere window
  searchOverlay?: KeyboardShortcut         // Deprecated: legacy Search Everywhere shortcut
  toggleTodoPlanWindow?: KeyboardShortcut  // Toggle standalone todo/plan window
  toggleTodoPlan?: KeyboardShortcut        // Toggle todo/plan card
}

// Quick command button configuration for InputBox toolbar
export interface QuickCommandConfig {
  commandId: string    // Command ID, e.g., 'cd', 'git', 'files'
  enabled: boolean     // Whether to show this button
}

export interface DailyNoteSettings {
  enabled?: boolean
  directoryMode?: 'personal' | 'custom'
  customDirectory?: string
  useObsidianConfig?: boolean
  format?: string
}

export interface EditorSettings {
  tabSize?: number
  lineWrapping?: boolean
  softWrapColumn?: number
  syntaxHighlighting?: boolean
  completionEnabled?: boolean
  composerMaxHeight?: number
  markdownNoteAttachmentDirectory?: string
  markdownProjectAttachmentDirectory?: string
}

export interface SoulMemoryActiveSettings {
  enabled?: boolean
  queryMode?: 'message' | 'recent' | 'full'
  promptStyle?: 'balanced' | 'strict' | 'contextual' | 'recall-heavy' | 'precision-heavy' | 'preference-only'
  timeoutMs?: number
  cacheTtlMs?: number
  maxSummaryChars?: number
  recentUserTurns?: number
  recentAssistantTurns?: number
  recentUserChars?: number
  recentAssistantChars?: number
  circuitBreakerMaxTimeouts?: number
  circuitBreakerCooldownMs?: number
}

export interface SoulMemorySearchSettings {
  enabled?: boolean
  chunkTokens?: number
  chunkOverlap?: number
  maxResults?: number
  mmrEnabled?: boolean
  temporalDecayHalfLifeDays?: number
}

export interface SoulMemoryEmbeddingSettings {
  enabled?: boolean
  providerId?: 'auto' | 'openai' | 'openrouter' | 'gemini' | 'custom' | 'ollama' | string
  customProviderId?: string
  apiKey?: string
  model?: string
  baseUrl?: string
  dimensions?: number
}

export interface SoulMemoryFlushSettings {
  enabled?: boolean
  maxInputChars?: number
}

export interface SoulMemoryCaptureSettings {
  enabled?: boolean
  mode?: 'explicit-only' | 'auto' | 'off'
  maxInputChars?: number
  timeoutMs?: number
}

export interface SoulMemoryReviewSettings {
  enabled?: boolean
  interval?: number
  maxInputChars?: number
  timeoutMs?: number
  maxCandidates?: number
  minConfidence?: number
}

export interface SoulMemoryCanonicalSettings {
  enabled?: boolean
  store?: 'sqlite'
  highConfidenceThreshold?: number
  semanticDedupeThreshold?: number
}

export interface SoulMemoryDreamingSettings {
  enabled?: boolean
  frequency?: string
  timezone?: string
  /** @deprecated Memory Dreaming uses tools.toolCallModel provider/model. */
  model?: string
  sources?: Array<'daily'>
  lookbackDays?: number
  maxSourceFiles?: number
  maxSessions?: number
  maxMessagesPerSession?: number
  maxInputChars?: number
  maxPromotions?: number
  minScore?: number
  minRecallCount?: number
  minUniqueSources?: number
  timeoutMs?: number
}

export interface SoulMemoryDailyContextSettings {
  enabled?: boolean
  mode?: 'session-start' | 'always'
  daysBack?: number
  maxChars?: number
}

export interface SoulMemoryReadSettings {
  defaultLines?: number
  maxLines?: number
}

export type SoulMemoryLogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface SoulMemoryLoggingSettings {
  enabled?: boolean
  retentionDays?: number
  level?: SoulMemoryLogLevel
  maxPreviewChars?: number
  includeHttpErrorBody?: boolean
}

export interface SoulMemorySettings {
  enabled?: boolean
  directoryMode?: 'ai-note-dir' | 'custom'
  customDirectory?: string
  bootstrapMaxChars?: number
  activeMemory?: SoulMemoryActiveSettings
  search?: SoulMemorySearchSettings
  embeddings?: SoulMemoryEmbeddingSettings
  memoryFlush?: SoulMemoryFlushSettings
  capture?: SoulMemoryCaptureSettings
  review?: SoulMemoryReviewSettings
  canonicalMemory?: SoulMemoryCanonicalSettings
  dreaming?: SoulMemoryDreamingSettings
  dailyContext?: SoulMemoryDailyContextSettings
  read?: SoulMemoryReadSettings
  logging?: SoulMemoryLoggingSettings
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
  typographyDensity?: TypographyDensity  // Global typography density, default 'compact'
  messageListDensity?: MessageListDensity  // Message list display density, default 'comfortable'
  messageLineHeight?: number  // Message line height, 1.2-2.2, default 1.6
  quickCommands?: QuickCommandConfig[]  // Quick command buttons shown above InputBox
  dailyNotes?: DailyNoteSettings
  soulMemory?: SoulMemorySettings
  todoPlan?: TodoPlanSettings
  editor?: EditorSettings
  // User profile for lightweight context injection
  userProfile?: UserProfileSettings
  maxTabs?: number           // Maximum open tabs per panel, 3-30, default 15
  maxFilePreviewKB?: number  // Maximum file preview size in KB, 64-1024, default 256
  /**
   * @deprecated Migrated to `variables.json` (variables subsystem). The
   * field is retained so that older installs can be migrated on first
   * boot post-upgrade. New code should NOT read this; consult the
   * variables store via `getVariablesStore().getAiNoteDir()` instead.
   */
  aiNoteDir?: string
  /**
   * @deprecated See `aiNoteDir`.
   */
  userNoteDir?: string
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
  chatFontSize?: number        // Chat font size in px, 12-20, default 15
  chatFontEn?: string          // English body font registry ID (e.g., 'system-ui', 'public-sans', 'lora')
  chatFontZh?: string          // Chinese body font registry ID (e.g., 'system-cjk', 'noto-sans-sc', 'lxgw-wenkai')
  contextCompactEnabled?: boolean  // Enable automatic context compacting, default true
  contextCompactThreshold?: number  // Context usage % to trigger compacting, 50-100, default 85
  contextCompactKeepRecentTurns?: number  // Recent user/assistant turns to keep verbatim, default 6
  agentLoopStream?: boolean        // Legacy compatibility flag; supported providers always use the agent-loop stream runtime
}

export interface ProxySettings {
  enabled: boolean
  url: string
  bypassRules?: string
}

export interface NetworkSettings {
  proxy: ProxySettings
}

export interface WechatChannelSettings {
  enabled: boolean
  accounts?: Array<{
    id: string
    label?: string
    enabled: boolean
  }>
}

export interface ChannelSettings {
  wechat: WechatChannelSettings
}

export interface AppSettings {
  ai: AISettings
  theme: 'light' | 'dark' | 'system'
  general: GeneralSettings
  voice?: VoiceSettings
  chat?: ChatSettings
  tools: ToolSettings
  network?: NetworkSettings
  channels?: ChannelSettings
  mcp?: MCPSettings
  acp?: ACPSettings
  skills?: SkillSettings
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
  settings?: AppSettings
  error?: string
}

export interface TestProxyRequest {
  proxy: ProxySettings
}

export interface TestProxyResponse {
  success: boolean
  error?: string
  status?: number
}
