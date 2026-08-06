/**
 * Plugin System Types
 *
 * Plugins are directories under ~/.onething/plugins/.
 * Each plugin has a plugin-entry.ts (default export) and an optional plugin.json manifest.
 *
 * Inspired by pi-mono's extension system, adapted for onething's Electron architecture.
 */

import type { z } from 'zod'
import type { IMConnector } from '@shared/ipc.js'
import type {
  CorePluginPanelRegistration,
  CorePluginRequestHandler,
  CorePluginStatusAPI,
  CorePluginStorage,
  CorePluginAPI,
  CorePluginCommandContext,
  CorePluginCommandDefinition,
  CorePluginDefinition,
  CorePluginEntry,
  CorePluginEventHandler,
  CorePluginSchedulerAPI,
  CorePluginStoreShape,
  CorePluginStoreData,
  CorePluginToolContext,
  CorePluginToolDefinition,
  CorePluginToolResult,
  MinimalCorePluginUI,
  PluginManifest,
  PluginSettings,
  PluginSource,
} from '@onething/core/plugins'
import type { ToolMetadata, ToolContext as CoreToolContext } from '../tools/core/tool.js'
import type { ToolInfo, ToolInfoAsync } from '../tools/core/tool.js'
import type { PluginSkillRootProvider } from '../skills/plugin-roots.js'
import type {
  PluginPromptContext,
  PluginPromptContextProvider,
} from '../engine/prompt/plugin-context.js'
import type {
  BeforeContextCompactContext,
  BeforeContextCompactHook,
  AfterAssistantResponseContext,
  AfterAssistantResponseHook,
} from './lifecycle.js'
import type {
  SchedulerRunOptions,
  SchedulerRunRecord,
  SchedulerTaskHandle,
  SchedulerTaskRegistration,
  SchedulerTaskSnapshot,
} from '../scheduler/types.js'

export type {
  CorePluginDefinition,
  CorePluginAPI,
  CorePluginCommandContext,
  CorePluginCommandDefinition,
  CorePluginEntry,
  CorePluginEventHandler,
  CorePluginSchedulerAPI,
  CorePluginStoreShape,
  CorePluginStoreData,
  CorePluginToolContext,
  CorePluginToolDefinition,
  CorePluginToolResult,
  MinimalCorePluginUI,
  PluginManifest,
  PluginSettings,
  PluginSource,
}

// ── Plugin Definition (loaded plugin) ──────────

export interface PluginDefinition extends CorePluginDefinition<PluginEntry> {}

// ── Plugin Store (per-plugin persistent key-value) ──

export interface PluginStoreData extends CorePluginStoreData {}

// ── Tool Definition (simplified for plugins) ───

export interface PluginToolDefinition<
  P extends z.ZodType = z.ZodType,
  M extends ToolMetadata = ToolMetadata,
> extends CorePluginToolDefinition<P, z.infer<P>, PluginToolContext<M>, PluginToolResult<M>> {}

export interface PluginToolContext<M extends ToolMetadata = ToolMetadata> extends CorePluginToolContext<M> {}

export interface PluginToolResult<M extends ToolMetadata = ToolMetadata> extends CorePluginToolResult<M> {}

// ── Command Definition ─────────────────────────

export interface PluginCommandDefinition extends CorePluginCommandDefinition<PluginCommandContext> {}

export interface PluginCommandContext extends CorePluginCommandContext {}

export type PluginScheduledTaskRegistration = Omit<SchedulerTaskRegistration, 'pluginId'>

export interface PluginSchedulerAPI
  extends CorePluginSchedulerAPI<
    PluginScheduledTaskRegistration,
    SchedulerTaskHandle,
    SchedulerTaskSnapshot,
    SchedulerRunOptions,
    SchedulerRunRecord
  > {}

// ── Plugin API (the "pi" object passed to plugin entry) ──

export interface PluginAPI
  extends CorePluginAPI<
    PluginToolDefinition,
    PluginEventHandler,
    Omit<PluginCommandDefinition, 'name'>,
    PluginPromptContextProvider,
    BeforeContextCompactHook,
    AfterAssistantResponseHook,
    PluginSkillRootProvider,
    PluginStore,
    PluginSchedulerAPI,
    MinimalPluginUI,
    CorePluginRequestHandler,
    CorePluginStorage,
    CorePluginPanelRegistration,
    CorePluginStatusAPI,
    IMConnector
  > {
  registerTool<P extends z.ZodType, M extends ToolMetadata>(
    tool: PluginToolDefinition<P, M>,
  ): void
}

/** Event handler receives the full SessionEventEnvelope */
export type PluginEventHandler = CorePluginEventHandler

export type {
  PluginPromptContext,
  PluginPromptContextProvider,
  BeforeContextCompactContext,
  BeforeContextCompactHook,
  AfterAssistantResponseContext,
  AfterAssistantResponseHook,
  SchedulerRunOptions,
  SchedulerRunRecord,
  SchedulerTaskHandle,
  SchedulerTaskRegistration,
  SchedulerTaskSnapshot,
}

// ── Plugin Store ───────────────────────────────

export interface PluginStore extends CorePluginStoreShape {}

// ── Minimal UI (v1) ────────────────────────────

export interface MinimalPluginUI extends MinimalCorePluginUI {}

// ── Plugin Entry ───────────────────────────────

/** Function exported by plugin-entry.ts */
export type PluginEntry = CorePluginEntry<PluginAPI>
