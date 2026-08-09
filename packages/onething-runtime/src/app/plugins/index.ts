/**
 * Plugin System — public entry point.
 *
 * Usage:
 *   import { bootstrapPluginSystem } from './plugins/index.js'
 *   await bootstrapPluginSystem(eventBus, streamEngine)
 */

export type {
  CorePluginInfo,
  CorePluginManagerHost,
} from '@onething/core/plugins'

export { bootstrapPluginSystem, getPluginManager, PluginManager } from './manager.js'
export { applyPluginThemeOverrides, getPluginThemeOverrideTable } from './theme-overrides.js'
export type { PluginThemeOverrideTable } from './theme-overrides.js'
export type { PluginInfo } from './manager.js'
export type {
  PluginAPI,
  PluginEntry,
  PluginManifest,
  PluginDefinition,
  PluginToolDefinition,
  PluginToolContext,
  PluginToolResult,
  PluginCommandDefinition,
  PluginCommandContext,
  PluginPromptContext,
  PluginPromptContextProvider,
  BeforeContextCompactContext,
  BeforeContextCompactHook,
  PluginEventHandler,
  PluginStore,
  MinimalPluginUI,
} from './types.js'
