/**
 * Plugin IPC Handlers
 *
 * Bridges the renderer (Settings UI) to the PluginManager in the main process.
 */

import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc.js'
import { getPluginManager } from '../plugins/index.js'
import { getEventBus } from '../events/index.js'
import * as store from '../store.js'

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

  // ── Slash commands from loaded plugins ──
  ipcMain.handle(IPC_CHANNELS.PLUGINS_COMMANDS, async () => {
    try {
      const manager = getPluginManager()
      if (!manager) {
        return { success: false, error: 'Plugin system not initialized' }
      }
      const commands = Array.from(manager.getPluginCommands().values()).map(command => {
        const id = command.name.replace(/^\//, '')
        return {
          id,
          name: command.name,
          description: command.description || 'Plugin command',
          usage: command.usage || command.name,
        }
      })
      return { success: true, commands }
    } catch (error: any) {
      console.error('[PluginIPC] commands error:', error)
      return { success: false, error: error.message || 'Failed to list plugin commands' }
    }
  })

  ipcMain.handle(IPC_CHANNELS.PLUGINS_EXECUTE_COMMAND, async (_event, request: {
    commandName: string
    args?: string
    sessionId: string
  }) => {
    try {
      const manager = getPluginManager()
      if (!manager) {
        return { success: false, error: 'Plugin system not initialized' }
      }

      const commandName = request.commandName.startsWith('/')
        ? request.commandName
        : `/${request.commandName}`
      const command = manager.getCommandHandler(commandName)
      if (!command) {
        return { success: false, error: `Unknown plugin command: ${commandName}` }
      }

      const session = store.getSession(request.sessionId)
      const eventBus = getEventBus()
      let lastNotification: string | undefined
      await command.handler(request.args || '', {
        sessionId: request.sessionId,
        cwd: session?.workingDirectory,
        steer(content) {
          eventBus.emit(request.sessionId, {
            type: 'command:inject-steering',
            content,
            source: `plugin-command:${commandName}`,
          }).catch(error => console.error('[PluginIPC] steer emit failed:', error))
        },
        followUp(content) {
          eventBus.emit(request.sessionId, {
            type: 'command:inject-followup',
            content,
            source: `plugin-command:${commandName}`,
          }).catch(error => console.error('[PluginIPC] follow-up emit failed:', error))
        },
        notify(message, level = 'info') {
          lastNotification = message
          eventBus.emitGlobal({
            type: 'plugin:notification',
            pluginId: 'command',
            message,
            level,
          })
        },
        async exec(commandToRun, args = []) {
          const { execa } = await import('execa')
          try {
            const result = await execa(commandToRun, args, {
              cwd: session?.workingDirectory,
              reject: false,
            })
            return {
              stdout: result.stdout,
              stderr: result.stderr,
              exitCode: result.exitCode ?? 0,
            }
          } catch (error: any) {
            return {
              stdout: error.stdout || '',
              stderr: error.stderr || error.message || '',
              exitCode: error.exitCode ?? 1,
            }
          }
        },
      })

      return { success: true, message: lastNotification || `${commandName} completed` }
    } catch (error: any) {
      console.error('[PluginIPC] execute command error:', error)
      return { success: false, error: error.message || 'Failed to execute plugin command' }
    }
  })

  console.log('[PluginIPC] handlers registered')
}
