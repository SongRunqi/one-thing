/**
 * Plugin IPC Handlers
 *
 * Handles IPC communication for plugin management between
 * the main process and renderer.
 */

import { ipcMain, shell } from 'electron'
import { classifyError } from '../../shared/errors.js'
import { pluginLoader } from '../plugins/loader/index.js'
import { hookManager } from '../plugins/hooks/index.js'
import type { LoadedPlugin } from '../plugins/types.js'
import {
  PLUGIN_CHANNELS,
  type PluginInfo,
  type GetPluginsResponse,
  type GetPluginResponse,
  type InstallPluginRequest,
  type InstallPluginResponse,
  type UninstallPluginResponse,
  type TogglePluginResponse,
  type ReloadPluginResponse,
  type UpdatePluginConfigRequest,
  type UpdatePluginConfigResponse,
  type PluginDirectoriesInfo,
} from '../../shared/ipc/plugins.js'

/**
 * Convert LoadedPlugin to PluginInfo for IPC
 */
function toPluginInfo(plugin: LoadedPlugin): PluginInfo {
  return {
    id: plugin.definition.meta.id,
    name: plugin.definition.meta.name,
    version: plugin.definition.meta.version,
    description: plugin.definition.meta.description,
    author: plugin.definition.meta.author,
    repository: plugin.definition.meta.repository,
    source: plugin.config.source,
    enabled: plugin.config.enabled,
    status: plugin.status,
    error: plugin.error,
    installedAt: plugin.config.installedAt,
    loadedAt: plugin.loadedAt,
    hooks: Object.keys(plugin.hooks).filter(k => typeof plugin.hooks[k as keyof typeof plugin.hooks] === 'function'),
    config: plugin.config.config,
  }
}

/**
 * Register all plugin IPC handlers
 */
export function registerPluginHandlers(): void {
  // Get all plugins
  ipcMain.handle(PLUGIN_CHANNELS.GET_ALL, async (): Promise<GetPluginsResponse> => {
    try {
      const plugins = pluginLoader.getLoadedPlugins()
      return {
        success: true,
        plugins: plugins.map(toPluginInfo),
      }
    } catch (error: any) {
      const appError = classifyError(error)
      console.error(`[Plugin][${appError.category}] Failed to get plugins:`, error)
      return { success: false, error: appError.message }
    }
  })

  // Get single plugin
  ipcMain.handle(PLUGIN_CHANNELS.GET, async (_, pluginId: string): Promise<GetPluginResponse> => {
    try {
      const plugin = pluginLoader.getPlugin(pluginId)
      if (!plugin) {
        return { success: false, error: `Plugin ${pluginId} not found` }
      }
      return { success: true, plugin: toPluginInfo(plugin) }
    } catch (error: any) {
      const appError = classifyError(error)
      console.error(`[Plugin][${appError.category}] Failed to get plugin:`, error)
      return { success: false, error: appError.message }
    }
  })

  // Install plugin
  ipcMain.handle(PLUGIN_CHANNELS.INSTALL, async (_, request: InstallPluginRequest): Promise<InstallPluginResponse> => {
    try {
      const result = await pluginLoader.installPlugin(request)
      return result
    } catch (error: any) {
      const appError = classifyError(error)
      console.error(`[Plugin][${appError.category}] Failed to install plugin:`, error)
      return { success: false, error: appError.message }
    }
  })

  // Uninstall plugin
  ipcMain.handle(PLUGIN_CHANNELS.UNINSTALL, async (_, pluginId: string): Promise<UninstallPluginResponse> => {
    try {
      const result = await pluginLoader.uninstallPlugin(pluginId)
      return result
    } catch (error: any) {
      const appError = classifyError(error)
      console.error(`[Plugin][${appError.category}] Failed to uninstall plugin:`, error)
      return { success: false, error: appError.message }
    }
  })

  // Enable plugin
  ipcMain.handle(PLUGIN_CHANNELS.ENABLE, async (_, pluginId: string): Promise<TogglePluginResponse> => {
    try {
      const result = await pluginLoader.enablePlugin(pluginId)
      return result
    } catch (error: any) {
      const appError = classifyError(error)
      console.error(`[Plugin][${appError.category}] Failed to enable plugin:`, error)
      return { success: false, error: appError.message }
    }
  })

  // Disable plugin
  ipcMain.handle(PLUGIN_CHANNELS.DISABLE, async (_, pluginId: string): Promise<TogglePluginResponse> => {
    try {
      const result = await pluginLoader.disablePlugin(pluginId)
      return result
    } catch (error: any) {
      const appError = classifyError(error)
      console.error(`[Plugin][${appError.category}] Failed to disable plugin:`, error)
      return { success: false, error: appError.message }
    }
  })

  // Reload plugin
  ipcMain.handle(PLUGIN_CHANNELS.RELOAD, async (_, pluginId: string): Promise<ReloadPluginResponse> => {
    try {
      const result = await pluginLoader.reloadPlugin(pluginId)
      return result
    } catch (error: any) {
      const appError = classifyError(error)
      console.error(`[Plugin][${appError.category}] Failed to reload plugin:`, error)
      return { success: false, error: appError.message }
    }
  })

  // Update plugin config
  ipcMain.handle(PLUGIN_CHANNELS.UPDATE_CONFIG, async (_, request: UpdatePluginConfigRequest): Promise<UpdatePluginConfigResponse> => {
    try {
      const result = pluginLoader.updatePluginConfig(request.pluginId, request.config)
      return result
    } catch (error: any) {
      const appError = classifyError(error)
      console.error(`[Plugin][${appError.category}] Failed to update plugin config:`, error)
      return { success: false, error: appError.message }
    }
  })

  // Get plugin directories
  ipcMain.handle(PLUGIN_CHANNELS.GET_DIRECTORIES, async (): Promise<PluginDirectoriesInfo> => {
    return {
      pluginsPath: pluginLoader.getPluginsPath(),
      npmCachePath: pluginLoader.getNpmCachePath(),
      localPluginsPath: pluginLoader.getLocalPluginsPath(),
    }
  })

  // Open plugin directory in file explorer
  ipcMain.handle(PLUGIN_CHANNELS.OPEN_DIRECTORY, async (_, dirType: 'plugins' | 'npm' | 'local'): Promise<void> => {
    let dirPath: string
    switch (dirType) {
      case 'npm':
        dirPath = pluginLoader.getNpmCachePath()
        break
      case 'local':
        dirPath = pluginLoader.getLocalPluginsPath()
        break
      default:
        dirPath = pluginLoader.getPluginsPath()
    }

    // Ensure directory exists
    pluginLoader.ensureDirectories()

    await shell.openPath(dirPath)
  })

  console.log('[PluginIPC] Plugin handlers registered')
}

/**
 * Unregister all plugin IPC handlers
 */
export function unregisterPluginHandlers(): void {
  for (const channel of Object.values(PLUGIN_CHANNELS)) {
    ipcMain.removeHandler(channel)
  }
  console.log('[PluginIPC] Plugin handlers unregistered')
}
