/**
 * Plugin IPC Handlers
 *
 * Bridges the renderer (Settings UI) to the PluginManager in the main process.
 */

import {
  registerElectronPluginsIpcHandlers,
  type ElectronPluginExecuteCommandRequest,
  type ElectronPluginToggleRequest,
} from '@onething/electron-host/ipc/plugins'
import {
  disableOnethingPluginForIpc,
  enableOnethingPluginForIpc,
  executeOnethingPluginCommandForIpc,
  type ListOnethingPluginCommandsForIpcResult,
  listOnethingPluginCommandsForIpc,
  listOnethingPluginsForIpc,
  refreshOnethingPluginsForIpc,
} from '@onething/runtime/plugins'
import type { GatewayCommandProvider } from '@onething/gateway'
import { IPC_CHANNELS } from '@shared/ipc.js'
import { getPluginManager } from '@onething/app/plugins/index.js'
import { clearPluginRuntimeHealth } from '@onething/app/plugins/health.js'
import { getEventBus } from '@onething/app/events/index.js'
import * as store from '@onething/app/store.js'

export function createGatewayPluginCommandProvider(): GatewayCommandProvider {
  return {
    async listCommands() {
      const result = await listPluginCommandsForGateway()
      return result.success ? result.commands : []
    },
    executeCommand(request) {
      return executePluginCommand({
        commandName: request.command.name,
        args: request.args,
        sessionId: request.sessionId,
      })
    },
  }
}

async function listPluginCommandsForGateway(): Promise<ListOnethingPluginCommandsForIpcResult> {
  const manager = getPluginManager()
  if (!manager) return { success: true, commands: [] }
  return listOnethingPluginCommandsForIpc({
    manager,
    logger: console,
  })
}

function executePluginCommand(request: ElectronPluginExecuteCommandRequest) {
  const eventBus = getEventBus()
  return executeOnethingPluginCommandForIpc({
    manager: getPluginManager(),
    commandName: request.commandName,
    args: request.args,
    sessionId: request.sessionId,
    getSession: sessionId => store.getSession(sessionId),
    emitSessionCommand: (sessionId, event) => eventBus.emit(sessionId, event),
    emitGlobalEvent: event => eventBus.emitGlobal(event),
    async exec(commandToRun, args = [], options) {
      const { execa } = await import('execa')
      try {
        const result = await execa(commandToRun, args, {
          cwd: options.cwd,
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
    onEmitError(label, error) {
      console.error(`[PluginIPC] ${label} emit failed:`, error)
    },
    logger: console,
  })
}

export function registerPluginHandlers(): void {
  registerElectronPluginsIpcHandlers({
    channels: {
      list: IPC_CHANNELS.PLUGINS_LIST,
      enable: IPC_CHANNELS.PLUGINS_ENABLE,
      disable: IPC_CHANNELS.PLUGINS_DISABLE,
      refresh: IPC_CHANNELS.PLUGINS_REFRESH,
      commands: IPC_CHANNELS.PLUGINS_COMMANDS,
      executeCommand: IPC_CHANNELS.PLUGINS_EXECUTE_COMMAND,
    },
    listPlugins: () => {
      return listOnethingPluginsForIpc({
        manager: getPluginManager(),
        logger: console,
      })
    },
    enablePlugin: (request: ElectronPluginToggleRequest) => {
      return enableOnethingPluginForIpc({
        manager: getPluginManager(),
        pluginId: request.pluginId,
        logger: console,
      })
    },
    disablePlugin: (request: ElectronPluginToggleRequest) => {
      return disableOnethingPluginForIpc({
        manager: getPluginManager(),
        pluginId: request.pluginId,
        logger: console,
        // 用户亲手关的 = 清账。熔断的自动禁用不经过这条 IPC,所以两者天然分得开。
        onManualDisable: clearPluginRuntimeHealth,
      })
    },
    refreshPlugins: () => {
      return refreshOnethingPluginsForIpc({
        manager: getPluginManager(),
        logger: console,
      })
    },
    listCommands: () => {
      return listOnethingPluginCommandsForIpc({
        manager: getPluginManager(),
        logger: console,
      })
    },
    executeCommand: (request: ElectronPluginExecuteCommandRequest) => {
      return executePluginCommand(request)
    },
  })

  console.log('[PluginIPC] handlers registered')
}
