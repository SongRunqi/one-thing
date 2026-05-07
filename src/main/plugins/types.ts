/**
 * Plugin System Types
 *
 * Plugins are directories under ~/.onething/plugins/.
 * Each plugin has a plugin-entry.ts (default export) and an optional plugin.json manifest.
 *
 * Inspired by pi-mono's extension system, adapted for onething's Electron architecture.
 */

import type { z } from 'zod'
import type { ToolMetadata, ToolContext as CoreToolContext } from '../tools/core/tool.js'
import type { ToolInfo, ToolInfoAsync } from '../tools/core/tool.js'
import type { PluginSkillRootProvider } from '../skills/plugin-roots.js'

// ── Plugin Manifest ─────────────────────────────

export interface PluginManifest {
  /** Plugin identifier (directory name if omitted) */
  name: string
  /** Semantic version */
  version: string
  /** Human-readable description */
  description?: string
  /** Entry file (defaults to "plugin-entry.ts") */
  entry?: string
  /** Author */
  author?: string
  /** Minimum app version required */
  minAppVersion?: string
}

// ── Plugin Definition (loaded plugin) ──────────

export interface PluginDefinition {
  /** Unique ID (directory name) */
  id: string
  /** Where this plugin comes from */
  source?: 'builtin' | 'user'
  /** Resolved manifest */
  manifest: PluginManifest
  /** Absolute path to plugin directory */
  dirPath: string
  /** Absolute path to entry file */
  entryPath: string
  /** Statically bundled entry for built-in plugins */
  entry?: PluginEntry
  /** Whether the plugin is currently enabled */
  enabled: boolean
  /** Whether `npm install` needs to run before loading */
  needsInstall?: boolean
  /** Load errors, if any */
  error?: string
}

// ── Plugin Store (per-plugin persistent key-value) ──

export interface PluginStoreData {
  [key: string]: unknown
}

// ── Tool Definition (simplified for plugins) ───

export interface PluginToolDefinition<
  P extends z.ZodType = z.ZodType,
  M extends ToolMetadata = ToolMetadata,
> {
  /** Unique tool name (used in LLM tool calls) */
  name: string
  /** Description for LLM */
  description: string
  /** Zod parameter schema */
  parameters: P
  /** Execute the tool */
  execute(args: z.infer<P>, ctx: PluginToolContext<M>): Promise<PluginToolResult<M>>
  /** Optional: permission guard (default: 'permission-gated') */
  permissionGuard?: 'safe' | 'sandboxed' | 'internal-check' | 'permission-gated' | 'external'
}

export interface PluginToolContext<M extends ToolMetadata = ToolMetadata> {
  /** Session ID this tool call belongs to */
  sessionId: string
  /** Message ID */
  messageId: string
  /** Tool call ID */
  toolCallId: string
  /** Working directory (sandbox boundary) */
  workingDirectory?: string
  /** Abort signal */
  abortSignal?: AbortSignal
  /** Stream metadata updates to UI */
  metadata(input: { title?: string; metadata?: Partial<M> }): void
}

export interface PluginToolResult<M extends ToolMetadata = ToolMetadata> {
  /** Short title */
  title: string
  /** Output shown to the LLM */
  output: string
  /** Extra metadata for UI */
  metadata: M
}

// ── Command Definition ─────────────────────────

export interface PluginCommandDefinition {
  /** Command name (with or without leading /) */
  name: string
  /** Description shown in command picker */
  description?: string
  /** Execute the command */
  handler(args: string, ctx: PluginCommandContext): Promise<void>
}

export interface PluginCommandContext {
  sessionId: string
  cwd?: string
  /** Inject a steering message (interrupts current turn) */
  steer(content: string): void
  /** Queue a follow-up message (waits for agent to stop) */
  followUp(content: string): void
  /** Show a notification to the user */
  notify(message: string, level?: 'info' | 'warn' | 'error'): void
  /** Execute a shell command */
  exec(command: string, args?: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }>
}

// ── Plugin API (the "pi" object passed to plugin entry) ──

export interface PluginAPI {
  /** Plugin ID (set by loader) */
  readonly id: string

  // ── Tool Registration ──
  /** Register a tool the LLM can call */
  registerTool<P extends z.ZodType, M extends ToolMetadata>(
    tool: PluginToolDefinition<P, M>,
  ): void

  // ── Event Subscription ──
  /**
   * Subscribe to session events.
   * Handler receives the event envelope (with sessionId, sequence, etc.).
   * Use this to react to tool calls, stream lifecycle, etc.
   */
  on(eventType: string, handler: PluginEventHandler): () => void

  // ── Message Injection (steering/followUp) ──
  /**
   * Inject a steering message during streaming.
   * Interrupts after the current turn ends.
   */
  steer(sessionId: string, content: string): void

  /**
   * Queue a follow-up message.
   * Only fires after the agent would naturally stop.
   */
  followUp(sessionId: string, content: string): void

  // ── Command Registration ──
  /** Register a slash command */
  registerCommand(name: string, options: Omit<PluginCommandDefinition, 'name'>): void

  /** Register additional filesystem roots that expose SKILL.md-based skills. */
  registerSkillRoot(provider: PluginSkillRootProvider): void

  /** Register cleanup work to run when the plugin is disabled or reloaded. */
  onDispose(callback: () => void): void

  // ── Persistent Storage ──
  /** Scoped key-value store (persisted per-plugin) */
  store: PluginStore

  // ── UI (minimal v1) ──
  ui: MinimalPluginUI
}

/** Event handler receives the full SessionEventEnvelope */
export type PluginEventHandler = (envelope: {
  sessionId: string
  sequence: number
  timestamp: number
  event: { type: string; [key: string]: unknown }
}) => Promise<void> | void

// ── Plugin Store ───────────────────────────────

export interface PluginStore {
  get<T = unknown>(key: string): T | undefined
  set<T = unknown>(key: string, value: T): void
  delete(key: string): void
  keys(): string[]
}

// ── Minimal UI (v1) ────────────────────────────

export interface MinimalPluginUI {
  /** Send a notification to the renderer */
  notify(message: string, level?: 'info' | 'warn' | 'error'): void
}

// ── Plugin Entry ───────────────────────────────

/** Function exported by plugin-entry.ts */
export type PluginEntry = (api: PluginAPI) => void | Promise<void>
