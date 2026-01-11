/**
 * Plugin System Type Definitions
 *
 * This file contains all TypeScript interfaces for the plugin system,
 * adapted from OpenCode's plugin architecture for Electron context.
 */

import type { z } from 'zod'
import type { ToolInfo } from '../tools/core/tool.js'

// ============================================
// Shell Helper Types
// ============================================

/**
 * Result of a shell command execution
 */
export interface ShellResult {
  stdout: string
  stderr: string
  exitCode: number
}

/**
 * Options for shell command execution
 */
export interface ShellOptions {
  /** Working directory for the command */
  cwd?: string
  /** Environment variables */
  env?: Record<string, string>
  /** Timeout in milliseconds (default: 30000) */
  timeout?: number
}

/**
 * Shell helper for executing commands
 * Similar to OpenCode's BunShell but using Node.js child_process
 */
export interface ShellHelper {
  /**
   * Execute a shell command
   * @param command - The command to execute
   * @param options - Execution options
   * @returns Promise resolving to shell result
   */
  run(command: string, options?: ShellOptions): Promise<ShellResult>
}

// ============================================
// Electron Context Types
// ============================================

/**
 * Electron app context information
 */
export interface ElectronContext {
  /** App version from package.json */
  version: string
  /** Platform (darwin, win32, linux) */
  platform: NodeJS.Platform
  /** Is development mode */
  isDev: boolean
  /** User data path (~/.0neThing or similar) */
  userDataPath: string
  /** Resources path (for bundled assets) */
  resourcesPath: string
}

/**
 * Session context when available during plugin operations
 */
export interface SessionContext {
  /** Session ID */
  id: string
  /** Working directory for the session */
  workingDirectory?: string
  /** Agent ID if using an agent */
  agentId?: string
  /** AI Provider ID */
  providerId?: string
  /** Model being used */
  model?: string
}

// ============================================
// Logger Types
// ============================================

/**
 * Logger interface for plugins
 */
export interface PluginLogger {
  info(message: string, ...args: unknown[]): void
  warn(message: string, ...args: unknown[]): void
  error(message: string, ...args: unknown[]): void
  debug(message: string, ...args: unknown[]): void
}

// ============================================
// Plugin Input Types
// ============================================

/**
 * Input provided to plugin initialization function
 * Adapted from OpenCode's PluginInput for Electron context
 */
export interface PluginInput {
  /** Electron app context */
  electron: ElectronContext
  /** Current working directory */
  directory: string
  /** Project path (if in a project context) */
  project?: string
  /** Shell command helper */
  $shell: ShellHelper
  /** Logger for plugin */
  logger: PluginLogger
  /** Plugin configuration from settings */
  config: Record<string, unknown>
  /** Current session context (when available) */
  session?: SessionContext
}

// ============================================
// Hook Result Types
// ============================================

/**
 * Hook result with abort capability
 * Used for modifier hooks that can transform data or abort execution
 */
export interface HookResult<T> {
  /** Modified value (or original if unchanged) */
  value: T
  /** Set to true to abort subsequent hooks and original action */
  abort?: boolean
  /** Abort reason/message */
  abortReason?: string
}

// ============================================
// Hook Input/Output Types
// ============================================

// --- Lifecycle Hooks ---

/** Input for config:change hook */
export interface ConfigChangeInput {
  settings: unknown
  changedKeys: string[]
}

// --- Chat/Message Hooks ---

/** Input for message:pre hook */
export interface MessagePreInput {
  sessionId: string
  message: string
  attachments?: unknown[]
  systemPrompt: string
}

/** Output for message:pre hook */
export interface MessagePreOutput {
  message: string
  attachments?: unknown[]
  systemPrompt: string
}

/** Input for message:post hook */
export interface MessagePostInput {
  sessionId: string
  userMessage: string
  assistantMessage: string
  usage?: {
    inputTokens: number
    outputTokens: number
    totalTokens: number
  }
}

/** Input for params:pre hook */
export interface ParamsPreInput {
  providerId: string
  model: string
  temperature: number
  maxTokens: number
  topP?: number
}

/** Output for params:pre hook */
export interface ParamsPreOutput {
  model: string
  temperature: number
  maxTokens: number
  topP?: number
}

// --- Tool Execution Hooks ---

/** Input for tool:pre hook */
export interface ToolPreInput {
  toolId: string
  toolName: string
  args: Record<string, unknown>
  sessionId: string
  messageId: string
}

/** Output for tool:pre hook */
export interface ToolPreOutput {
  args: Record<string, unknown>
}

/** Input for tool:post hook */
export interface ToolPostInput {
  toolId: string
  toolName: string
  args: Record<string, unknown>
  result: {
    success: boolean
    data?: unknown
    error?: string
  }
  sessionId: string
  messageId: string
}

/** Output for tool:post hook */
export interface ToolPostOutput {
  result: {
    success: boolean
    data?: unknown
    error?: string
  }
}

// --- Permission Hooks ---

/** Input for permission:check hook */
export interface PermissionCheckInput {
  type: string
  pattern?: string | string[]
  sessionId: string
  metadata: Record<string, unknown>
}

/** Output for permission:check hook */
export interface PermissionCheckOutput {
  /** Auto-approve this permission */
  approved?: boolean
  /** Custom approval message */
  message?: string
}

// --- Session Hooks ---

/** Input for session:create hook */
export interface SessionCreateInput {
  sessionId: string
  name: string
  agentId?: string
  workingDirectory?: string
}

/** Input for session:switch hook */
export interface SessionSwitchInput {
  fromSessionId?: string
  toSessionId: string
}

// --- Event Hooks ---

/** Input for event:custom hook */
export interface CustomEventInput {
  eventName: string
  data: unknown
}

// ============================================
// Hook Definitions
// ============================================

/**
 * All available hooks that plugins can implement
 */
export interface Hooks {
  // --- Lifecycle Hooks (Event type - fire and forget) ---

  /** Called during app initialization */
  'app:init'?: () => Promise<void>

  /** Called before app quit */
  'app:quit'?: () => Promise<void>

  /** Called when settings change */
  'config:change'?: (input: ConfigChangeInput) => Promise<void>

  // --- Chat Hooks (Modifier type - can transform data) ---

  /** Called before sending a message to AI */
  'message:pre'?: (input: MessagePreInput) => Promise<HookResult<MessagePreOutput>>

  /** Called after receiving AI response (Event type) */
  'message:post'?: (input: MessagePostInput) => Promise<void>

  /** Called to modify AI request parameters */
  'params:pre'?: (input: ParamsPreInput) => Promise<HookResult<ParamsPreOutput>>

  // --- Tool Execution Hooks (Modifier type) ---

  /** Called before tool execution */
  'tool:pre'?: (input: ToolPreInput) => Promise<HookResult<ToolPreOutput>>

  /** Called after tool execution */
  'tool:post'?: (input: ToolPostInput) => Promise<HookResult<ToolPostOutput>>

  /** Register custom tools (Collector type) */
  'tool:register'?: () => Promise<ToolInfo[]>

  // --- Permission Hooks (Modifier type) ---

  /** Called before permission check */
  'permission:check'?: (input: PermissionCheckInput) => Promise<HookResult<PermissionCheckOutput>>

  // --- Session Hooks (Event type) ---

  /** Called when a new session is created */
  'session:create'?: (input: SessionCreateInput) => Promise<void>

  /** Called when session is switched */
  'session:switch'?: (input: SessionSwitchInput) => Promise<void>

  // --- Event Hooks (Event type) ---

  /** Custom event handler */
  'event:custom'?: (input: CustomEventInput) => Promise<void>
}

/**
 * Hook names as a union type
 */
export type HookName = keyof Hooks

/**
 * Hook types categorized by execution pattern
 */
export type ModifierHookName =
  | 'message:pre'
  | 'params:pre'
  | 'tool:pre'
  | 'tool:post'
  | 'permission:check'

export type EventHookName =
  | 'app:init'
  | 'app:quit'
  | 'config:change'
  | 'message:post'
  | 'session:create'
  | 'session:switch'
  | 'event:custom'

export type CollectorHookName = 'tool:register'

// ============================================
// Plugin Definition Types
// ============================================

/**
 * Plugin metadata
 */
export interface PluginMetadata {
  /** Unique plugin ID (lowercase, hyphens allowed) */
  id: string
  /** Display name */
  name: string
  /** Plugin version (semver) */
  version: string
  /** Plugin description */
  description?: string
  /** Author name or email */
  author?: string
  /** Repository URL */
  repository?: string
  /** Minimum app version required */
  minAppVersion?: string
  /** Plugin configuration schema (Zod) */
  configSchema?: z.ZodType
}

/**
 * Plugin function signature
 * Plugin is a function that receives input and returns hooks
 */
export type PluginFunction = (input: PluginInput) => Promise<Hooks>

/**
 * Complete plugin definition
 */
export interface PluginDefinition {
  /** Plugin metadata */
  meta: PluginMetadata
  /** Plugin initialization function */
  init: PluginFunction
}

/**
 * Plugin source types
 */
export type PluginSource = 'npm' | 'local' | 'builtin'

/**
 * Plugin configuration (stored in settings)
 */
export interface PluginConfig {
  /** Plugin ID */
  id: string
  /** Source type */
  source: PluginSource
  /** NPM package name (for npm source) */
  packageName?: string
  /** Local path (for local source) */
  localPath?: string
  /** Whether plugin is enabled */
  enabled: boolean
  /** Plugin-specific configuration */
  config?: Record<string, unknown>
  /** Installation timestamp */
  installedAt?: number
}

/**
 * Loaded plugin state
 */
export interface LoadedPlugin {
  /** Plugin definition */
  definition: PluginDefinition
  /** Plugin configuration */
  config: PluginConfig
  /** Registered hooks */
  hooks: Hooks
  /** Load status */
  status: 'loaded' | 'error' | 'disabled'
  /** Error message if status is 'error' */
  error?: string
  /** Load timestamp */
  loadedAt?: number
}

// ============================================
// Plugin Manager Types
// ============================================

/**
 * Plugin installation request
 */
export interface InstallPluginRequest {
  /** Source type */
  source: 'npm' | 'local'
  /** NPM package name (for npm source) */
  packageName?: string
  /** Local path (for local source) */
  localPath?: string
}

/**
 * Plugin installation result
 */
export interface InstallPluginResult {
  success: boolean
  plugin?: {
    id: string
    name: string
    version: string
  }
  error?: string
}

/**
 * Hook execution context for debugging
 */
export interface HookExecutionContext {
  pluginId: string
  hookName: HookName
  startTime: number
}
