/**
 * Plugin Loader
 *
 * Central component for loading and managing plugins.
 * Handles plugin discovery, loading, initialization, and lifecycle.
 */

import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import type {
  PluginConfig,
  PluginDefinition,
  LoadedPlugin,
  Hooks,
  InstallPluginRequest,
  InstallPluginResult,
} from '../types.js'
import { hookManager } from '../hooks/index.js'
import { createPluginInput } from '../context/index.js'
import { loadNpmPlugin, uninstallNpmPlugin } from './npm-loader.js'
import { loadLocalPlugin, discoverLocalPlugins } from './local-loader.js'
import { validatePlugin, validateHooks, PluginValidationError } from './validation.js'

/**
 * Plugin store interface (will be implemented in stores/plugins.ts)
 */
interface PluginStore {
  getPluginConfigs(): PluginConfig[]
  savePluginConfig(config: PluginConfig): void
  removePluginConfig(pluginId: string): void
}

// Placeholder - will be replaced with actual store
let pluginStore: PluginStore | null = null

/**
 * Set the plugin store (called during initialization)
 */
export function setPluginStore(store: PluginStore): void {
  pluginStore = store
}

/**
 * Get plugin configs from store
 */
function getPluginConfigs(): PluginConfig[] {
  return pluginStore?.getPluginConfigs() ?? []
}

/**
 * Save plugin config to store
 */
function savePluginConfig(config: PluginConfig): void {
  pluginStore?.savePluginConfig(config)
}

/**
 * Remove plugin config from store
 */
function removePluginConfig(pluginId: string): void {
  pluginStore?.removePluginConfig(pluginId)
}

/**
 * PluginLoader - Manages plugin lifecycle
 */
export class PluginLoader {
  private loadedPlugins: Map<string, LoadedPlugin> = new Map()
  private initialized: boolean = false

  /**
   * Get the plugins directory path
   */
  getPluginsPath(): string {
    return path.join(app.getPath('userData'), 'plugins')
  }

  /**
   * Get NPM plugins cache path
   */
  getNpmCachePath(): string {
    return path.join(this.getPluginsPath(), 'npm_cache')
  }

  /**
   * Get local plugins path
   */
  getLocalPluginsPath(): string {
    return path.join(this.getPluginsPath(), 'local')
  }

  /**
   * Ensure plugin directories exist
   */
  ensureDirectories(): void {
    const dirs = [this.getPluginsPath(), this.getNpmCachePath(), this.getLocalPluginsPath()]

    for (const dir of dirs) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
    }
  }

  /**
   * Initialize and load all configured plugins
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      console.log('[PluginLoader] Already initialized')
      return
    }

    this.ensureDirectories()

    // Load plugins from store config
    const configs = getPluginConfigs()
    console.log(`[PluginLoader] Loading ${configs.length} configured plugins`)

    for (const config of configs) {
      if (config.enabled) {
        await this.loadPlugin(config)
      } else {
        // Track disabled plugins
        this.loadedPlugins.set(config.id, {
          definition: {
            meta: { id: config.id, name: config.id, version: '0.0.0' },
            init: async () => ({}),
          },
          config,
          hooks: {},
          status: 'disabled',
        })
      }
    }

    // Discover local plugins not in config
    await this.discoverAndLoadLocalPlugins()

    this.initialized = true

    // Execute app:init hooks
    await hookManager.executeAll('app:init', undefined)

    console.log(`[PluginLoader] Initialized with ${this.loadedPlugins.size} plugins`)
  }

  /**
   * Discover and load local plugins from the plugins directory
   */
  private async discoverAndLoadLocalPlugins(): Promise<void> {
    const localPath = this.getLocalPluginsPath()
    const discoveredPaths = await discoverLocalPlugins(localPath)

    for (const pluginPath of discoveredPaths) {
      // Skip if already loaded
      const existingId = Array.from(this.loadedPlugins.values()).find(
        (p) => p.config.localPath === pluginPath,
      )?.config.id

      if (existingId) {
        continue
      }

      try {
        const definition = await loadLocalPlugin(pluginPath)
        validatePlugin(definition)

        // Create config for discovered plugin
        const config: PluginConfig = {
          id: definition.meta.id,
          source: 'local',
          localPath: pluginPath,
          enabled: true,
          installedAt: Date.now(),
        }

        // Save to store
        savePluginConfig(config)

        // Load the plugin
        await this.loadPlugin(config)
      } catch (error: any) {
        console.error(`[PluginLoader] Failed to load discovered plugin ${pluginPath}:`, error)
      }
    }
  }

  /**
   * Load a single plugin
   */
  async loadPlugin(config: PluginConfig): Promise<LoadedPlugin | null> {
    try {
      console.log(`[PluginLoader] Loading plugin: ${config.id}`)

      // Load plugin definition based on source
      let definition: PluginDefinition

      switch (config.source) {
        case 'npm':
          if (!config.packageName) {
            throw new Error('NPM plugin requires packageName')
          }
          definition = await loadNpmPlugin(config.packageName, this.getNpmCachePath())
          break

        case 'local':
          if (!config.localPath) {
            throw new Error('Local plugin requires localPath')
          }
          definition = await loadLocalPlugin(config.localPath)
          break

        case 'builtin':
          throw new Error('Builtin plugins should be loaded separately')

        default:
          throw new Error(`Unknown plugin source: ${config.source}`)
      }

      // Validate plugin definition
      validatePlugin(definition)

      // Create plugin input
      const input = createPluginInput(config)

      // Initialize plugin to get hooks
      const hooks = await definition.init(input)

      // Validate hooks
      validateHooks(hooks, definition.meta.id)

      const loadedPlugin: LoadedPlugin = {
        definition,
        config,
        hooks,
        status: 'loaded',
        loadedAt: Date.now(),
      }

      // Register hooks with the hook manager
      hookManager.registerPlugin(loadedPlugin)

      this.loadedPlugins.set(config.id, loadedPlugin)
      console.log(`[PluginLoader] Plugin loaded successfully: ${config.id}`)

      return loadedPlugin
    } catch (error: any) {
      console.error(`[PluginLoader] Failed to load plugin ${config.id}:`, error)

      const failedPlugin: LoadedPlugin = {
        definition: {
          meta: { id: config.id, name: config.id, version: '0.0.0' },
          init: async () => ({}),
        },
        config,
        hooks: {},
        status: 'error',
        error: error.message,
      }

      this.loadedPlugins.set(config.id, failedPlugin)
      return failedPlugin
    }
  }

  /**
   * Install a new plugin
   */
  async installPlugin(request: InstallPluginRequest): Promise<InstallPluginResult> {
    try {
      let definition: PluginDefinition
      let localPath: string | undefined

      if (request.source === 'npm') {
        if (!request.packageName) {
          return { success: false, error: 'NPM plugin requires packageName' }
        }
        definition = await loadNpmPlugin(request.packageName, this.getNpmCachePath())
      } else {
        if (!request.localPath) {
          return { success: false, error: 'Local plugin requires localPath' }
        }
        definition = await loadLocalPlugin(request.localPath)
        localPath = request.localPath
      }

      validatePlugin(definition)

      // Check if already installed
      if (this.loadedPlugins.has(definition.meta.id)) {
        return { success: false, error: `Plugin ${definition.meta.id} is already installed` }
      }

      // Create and save config
      const config: PluginConfig = {
        id: definition.meta.id,
        source: request.source,
        packageName: request.packageName,
        localPath,
        enabled: true,
        installedAt: Date.now(),
      }

      savePluginConfig(config)

      // Load the plugin
      await this.loadPlugin(config)

      return {
        success: true,
        plugin: {
          id: definition.meta.id,
          name: definition.meta.name,
          version: definition.meta.version,
        },
      }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  }

  /**
   * Uninstall a plugin
   */
  async uninstallPlugin(pluginId: string): Promise<{ success: boolean; error?: string }> {
    const plugin = this.loadedPlugins.get(pluginId)
    if (!plugin) {
      return { success: false, error: `Plugin ${pluginId} not found` }
    }

    try {
      // Unregister hooks
      hookManager.unregisterPlugin(pluginId)

      // Remove from NPM cache if needed
      if (plugin.config.source === 'npm' && plugin.config.packageName) {
        await uninstallNpmPlugin(plugin.config.packageName, this.getNpmCachePath())
      }

      // Remove config
      removePluginConfig(pluginId)

      // Remove from loaded plugins
      this.loadedPlugins.delete(pluginId)

      console.log(`[PluginLoader] Plugin uninstalled: ${pluginId}`)
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  }

  /**
   * Enable a plugin
   */
  async enablePlugin(pluginId: string): Promise<{ success: boolean; error?: string }> {
    const plugin = this.loadedPlugins.get(pluginId)
    if (!plugin) {
      return { success: false, error: `Plugin ${pluginId} not found` }
    }

    if (plugin.status === 'loaded') {
      return { success: true } // Already enabled
    }

    // Update config
    plugin.config.enabled = true
    savePluginConfig(plugin.config)

    // Reload the plugin
    this.loadedPlugins.delete(pluginId)
    await this.loadPlugin(plugin.config)

    return { success: true }
  }

  /**
   * Disable a plugin
   */
  async disablePlugin(pluginId: string): Promise<{ success: boolean; error?: string }> {
    const plugin = this.loadedPlugins.get(pluginId)
    if (!plugin) {
      return { success: false, error: `Plugin ${pluginId} not found` }
    }

    // Unregister hooks
    hookManager.unregisterPlugin(pluginId)

    // Update status
    plugin.config.enabled = false
    plugin.status = 'disabled'
    plugin.hooks = {}
    savePluginConfig(plugin.config)

    console.log(`[PluginLoader] Plugin disabled: ${pluginId}`)
    return { success: true }
  }

  /**
   * Reload a plugin
   */
  async reloadPlugin(pluginId: string): Promise<{ success: boolean; error?: string }> {
    const plugin = this.loadedPlugins.get(pluginId)
    if (!plugin) {
      return { success: false, error: `Plugin ${pluginId} not found` }
    }

    // Unregister existing hooks
    hookManager.unregisterPlugin(pluginId)

    // Remove and reload
    this.loadedPlugins.delete(pluginId)
    const reloaded = await this.loadPlugin(plugin.config)

    if (reloaded?.status === 'error') {
      return { success: false, error: reloaded.error }
    }

    return { success: true }
  }

  /**
   * Update plugin configuration
   */
  updatePluginConfig(
    pluginId: string,
    config: Record<string, unknown>,
  ): { success: boolean; error?: string } {
    const plugin = this.loadedPlugins.get(pluginId)
    if (!plugin) {
      return { success: false, error: `Plugin ${pluginId} not found` }
    }

    plugin.config.config = config
    savePluginConfig(plugin.config)

    return { success: true }
  }

  /**
   * Get all loaded plugins
   */
  getLoadedPlugins(): LoadedPlugin[] {
    return Array.from(this.loadedPlugins.values())
  }

  /**
   * Get a specific loaded plugin
   */
  getPlugin(pluginId: string): LoadedPlugin | undefined {
    return this.loadedPlugins.get(pluginId)
  }

  /**
   * Check if a plugin is loaded
   */
  isPluginLoaded(pluginId: string): boolean {
    const plugin = this.loadedPlugins.get(pluginId)
    return plugin?.status === 'loaded'
  }

  /**
   * Shutdown all plugins
   */
  async shutdown(): Promise<void> {
    // Execute app:quit hooks
    await hookManager.executeAll('app:quit', undefined)

    // Unregister all hooks
    for (const pluginId of this.loadedPlugins.keys()) {
      hookManager.unregisterPlugin(pluginId)
    }

    this.loadedPlugins.clear()
    this.initialized = false

    console.log('[PluginLoader] All plugins shutdown')
  }
}

// Singleton instance
export const pluginLoader = new PluginLoader()
