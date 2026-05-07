/**
 * Plugin IPC Handlers
 *
 * Bridges the renderer (Settings UI) to the PluginManager in the main process.
 */

import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc.js'
import { getPluginManager } from '../plugins/index.js'

export function registerPluginHandlers(): void {
  // ── List all plugins ──
  ipcMain.handle(IPC_CHANNELS.PLUGINS_LIST, async () => {
    try {
      const manager = getPluginManager()
      if (!manager) {
        return { success: false, error: 'Plugin system not initialized' }
      }
      const plugins = manager.getPlugins()
      return {
        success: true,
        plugins: plugins.map((p) => ({
          id: p.definition.id,
          source: p.definition.source || 'user',
          name: p.definition.manifest.name,
          version: p.definition.manifest.version,
          description: p.definition.manifest.description || '',
          author: p.definition.manifest.author || '',
          loaded: p.loaded,
          enabled: p.definition.enabled,
          commands: p.commands,
          error: p.error || '',
          dirPath: p.definition.dirPath,
          needsInstall: p.definition.needsInstall || false,
        })),
      }
    } catch (error: any) {
      console.error('[PluginIPC] list error:', error)
      return { success: false, error: error.message || 'Failed to list plugins' }
    }
  })

  // ── Enable a plugin ──
  ipcMain.handle(IPC_CHANNELS.PLUGINS_ENABLE, async (_event, { pluginId }: { pluginId: string }) => {
    try {
      const manager = getPluginManager()
      if (!manager) {
        return { success: false, error: 'Plugin system not initialized' }
      }
      await manager.enablePlugin(pluginId)
      return { success: true }
    } catch (error: any) {
      console.error(`[PluginIPC] enable ${pluginId} error:`, error)
      return { success: false, error: error.message || 'Failed to enable plugin' }
    }
  })

  // ── Disable a plugin ──
  ipcMain.handle(IPC_CHANNELS.PLUGINS_DISABLE, async (_event, { pluginId }: { pluginId: string }) => {
    try {
      const manager = getPluginManager()
      if (!manager) {
        return { success: false, error: 'Plugin system not initialized' }
      }
      await manager.disablePlugin(pluginId)
      return { success: true }
    } catch (error: any) {
      console.error(`[PluginIPC] disable ${pluginId} error:`, error)
      return { success: false, error: error.message || 'Failed to disable plugin' }
    }
  })

  // ── Refresh (rescan plugins directory) ──
  ipcMain.handle(IPC_CHANNELS.PLUGINS_REFRESH, async () => {
    try {
      const manager = getPluginManager()
      if (!manager) {
        return { success: false, error: 'Plugin system not initialized' }
      }
      await manager.refreshPlugins()
      return { success: true }
    } catch (error: any) {
      console.error('[PluginIPC] refresh error:', error)
      return { success: false, error: error.message || 'Failed to refresh plugins' }
    }
  })

  console.log('[PluginIPC] handlers registered')
}
