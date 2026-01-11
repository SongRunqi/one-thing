/**
 * Plugin System Main Exports
 *
 * Central entry point for the plugin system.
 * Exports all public APIs for plugin management.
 */

// Core types
export type {
  // Plugin types
  PluginDefinition,
  PluginFunction,
  PluginMetadata,
  PluginConfig,
  PluginSource,
  LoadedPlugin,
  InstallPluginRequest,
  InstallPluginResult,
  // Input types
  PluginInput,
  ElectronContext,
  SessionContext,
  PluginLogger,
  ShellHelper,
  ShellResult,
  ShellOptions,
  // Hook types
  Hooks,
  HookName,
  HookResult,
  ModifierHookName,
  EventHookName,
  CollectorHookName,
  // Hook input/output types
  ConfigChangeInput,
  MessagePreInput,
  MessagePreOutput,
  MessagePostInput,
  ParamsPreInput,
  ParamsPreOutput,
  ToolPreInput,
  ToolPreOutput,
  ToolPostInput,
  ToolPostOutput,
  PermissionCheckInput,
  PermissionCheckOutput,
  SessionCreateInput,
  SessionSwitchInput,
  CustomEventInput,
} from './types.js'

// Hook manager
export { hookManager, HookManager } from './hooks/index.js'

// Plugin loader
export { pluginLoader, PluginLoader, setPluginStore } from './loader/index.js'

// Context helpers
export { createPluginInput, updatePluginInputSession, createShellHelper } from './context/index.js'

// Validation
export { validatePlugin, validateHooks, PluginValidationError, safeValidatePlugin } from './loader/validation.js'

// Local loader utilities
export { loadLocalPlugin, discoverLocalPlugins, watchPluginsDirectory } from './loader/local-loader.js'

// NPM loader utilities
export { loadNpmPlugin, parsePackageSpecifier, uninstallNpmPlugin, listInstalledNpmPlugins } from './loader/npm-loader.js'

import { pluginLoader, setPluginStore } from './loader/index.js'
import { hookManager } from './hooks/index.js'
import pluginStore from '../stores/plugins.js'

/**
 * Initialize the plugin system
 *
 * This should be called during app startup, after stores are initialized
 * but before the main window is created.
 */
export async function initializePlugins(): Promise<void> {
  console.log('[Plugins] Initializing plugin system...')

  // Connect plugin store to loader
  setPluginStore(pluginStore)

  // Initialize and load all plugins
  await pluginLoader.initialize()

  console.log('[Plugins] Plugin system initialized')
}

/**
 * Shutdown the plugin system
 *
 * This should be called during app quit.
 */
export async function shutdownPlugins(): Promise<void> {
  console.log('[Plugins] Shutting down plugin system...')
  await pluginLoader.shutdown()
  console.log('[Plugins] Plugin system shutdown complete')
}

/**
 * Get the hook manager instance
 */
export function getHookManager() {
  return hookManager
}

/**
 * Get the plugin loader instance
 */
export function getPluginLoader() {
  return pluginLoader
}
