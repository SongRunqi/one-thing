import type {
  CorePluginCommandContext,
  CorePluginCommandDefinition,
} from '@onething/core/plugins'
import {
  executeOnethingPluginCommand,
  type ExecuteOnethingPluginCommandOptions,
  type ExecuteOnethingPluginCommandResult,
  type OnethingPluginCommandSessionLike,
} from './plugin-command-execution.js'
import {
  projectOnethingPluginCommandsForRenderer,
  projectOnethingPluginsForRenderer,
  type OnethingPluginCommandLike,
  type OnethingPluginListItemLike,
  type OnethingRendererPluginCommandInfo,
  type OnethingRendererPluginInfo,
} from './plugin-list.js'

type MaybePromise<T> = T | Promise<T>

export const ONETHING_PLUGIN_SYSTEM_NOT_INITIALIZED = 'Plugin system not initialized'

export interface OnethingPluginIpcLogger {
  error?: (...args: unknown[]) => void
}

export interface OnethingPluginCommandsLike<TCommand extends OnethingPluginCommandLike = OnethingPluginCommandLike> {
  values(): Iterable<TCommand>
}

export interface OnethingPluginIpcManagerLike<
  TPlugin extends OnethingPluginListItemLike = OnethingPluginListItemLike,
  TCommandInfo extends OnethingPluginCommandLike = OnethingPluginCommandLike,
  TCommand extends CorePluginCommandDefinition<CorePluginCommandContext> =
    CorePluginCommandDefinition<CorePluginCommandContext>,
> {
  getPlugins(): TPlugin[]
  enablePlugin(pluginId: string): MaybePromise<unknown>
  disablePlugin(pluginId: string): MaybePromise<unknown>
  refreshPlugins(): MaybePromise<unknown>
  getPluginCommands(): OnethingPluginCommandsLike<TCommandInfo>
  getCommandHandler(commandName: string): MaybePromise<TCommand | undefined>
}

interface OnethingPluginIpcOperationOptions<
  TPlugin extends OnethingPluginListItemLike = OnethingPluginListItemLike,
  TCommandInfo extends OnethingPluginCommandLike = OnethingPluginCommandLike,
  TCommand extends CorePluginCommandDefinition<CorePluginCommandContext> =
    CorePluginCommandDefinition<CorePluginCommandContext>,
> {
  manager?: OnethingPluginIpcManagerLike<TPlugin, TCommandInfo, TCommand> | null
  logger?: OnethingPluginIpcLogger
}

export type ListOnethingPluginsForIpcResult =
  | { success: true; plugins: OnethingRendererPluginInfo[] }
  | { success: false; error: string }

export async function listOnethingPluginsForIpc<
  TPlugin extends OnethingPluginListItemLike,
  TCommandInfo extends OnethingPluginCommandLike,
  TCommand extends CorePluginCommandDefinition<CorePluginCommandContext>,
>(
  options: OnethingPluginIpcOperationOptions<TPlugin, TCommandInfo, TCommand>,
): Promise<ListOnethingPluginsForIpcResult> {
  try {
    const manager = requireOnethingPluginManager(options.manager)
    return {
      success: true,
      plugins: projectOnethingPluginsForRenderer(manager.getPlugins()),
    }
  } catch (error) {
    return pluginIpcError(options.logger, 'list', error, 'Failed to list plugins')
  }
}

export type ToggleOnethingPluginForIpcResult =
  | { success: true }
  | { success: false; error: string }

export async function enableOnethingPluginForIpc<
  TPlugin extends OnethingPluginListItemLike,
  TCommandInfo extends OnethingPluginCommandLike,
  TCommand extends CorePluginCommandDefinition<CorePluginCommandContext>,
>(
  options: OnethingPluginIpcOperationOptions<TPlugin, TCommandInfo, TCommand> & { pluginId: string },
): Promise<ToggleOnethingPluginForIpcResult> {
  try {
    const manager = requireOnethingPluginManager(options.manager)
    await manager.enablePlugin(options.pluginId)
    return { success: true }
  } catch (error) {
    return pluginIpcError(options.logger, `enable ${options.pluginId}`, error, 'Failed to enable plugin')
  }
}

export async function disableOnethingPluginForIpc<
  TPlugin extends OnethingPluginListItemLike,
  TCommandInfo extends OnethingPluginCommandLike,
  TCommand extends CorePluginCommandDefinition<CorePluginCommandContext>,
>(
  options: OnethingPluginIpcOperationOptions<TPlugin, TCommandInfo, TCommand> & { pluginId: string },
): Promise<ToggleOnethingPluginForIpcResult> {
  try {
    const manager = requireOnethingPluginManager(options.manager)
    await manager.disablePlugin(options.pluginId)
    return { success: true }
  } catch (error) {
    return pluginIpcError(options.logger, `disable ${options.pluginId}`, error, 'Failed to disable plugin')
  }
}

export async function refreshOnethingPluginsForIpc<
  TPlugin extends OnethingPluginListItemLike,
  TCommandInfo extends OnethingPluginCommandLike,
  TCommand extends CorePluginCommandDefinition<CorePluginCommandContext>,
>(
  options: OnethingPluginIpcOperationOptions<TPlugin, TCommandInfo, TCommand>,
): Promise<ToggleOnethingPluginForIpcResult> {
  try {
    const manager = requireOnethingPluginManager(options.manager)
    await manager.refreshPlugins()
    return { success: true }
  } catch (error) {
    return pluginIpcError(options.logger, 'refresh', error, 'Failed to refresh plugins')
  }
}

export type ListOnethingPluginCommandsForIpcResult =
  | { success: true; commands: OnethingRendererPluginCommandInfo[] }
  | { success: false; error: string }

export async function listOnethingPluginCommandsForIpc<
  TPlugin extends OnethingPluginListItemLike,
  TCommandInfo extends OnethingPluginCommandLike,
  TCommand extends CorePluginCommandDefinition<CorePluginCommandContext>,
>(
  options: OnethingPluginIpcOperationOptions<TPlugin, TCommandInfo, TCommand>,
): Promise<ListOnethingPluginCommandsForIpcResult> {
  try {
    const manager = requireOnethingPluginManager(options.manager)
    return {
      success: true,
      commands: projectOnethingPluginCommandsForRenderer(manager.getPluginCommands().values()),
    }
  } catch (error) {
    return pluginIpcError(options.logger, 'commands', error, 'Failed to list plugin commands')
  }
}

export interface ExecuteOnethingPluginCommandForIpcOptions<
  TCommand extends CorePluginCommandDefinition<CorePluginCommandContext> =
    CorePluginCommandDefinition<CorePluginCommandContext>,
  TSession extends OnethingPluginCommandSessionLike = OnethingPluginCommandSessionLike,
> extends Omit<ExecuteOnethingPluginCommandOptions<TCommand, TSession>, 'getCommandHandler'> {
  manager?: Pick<OnethingPluginIpcManagerLike<OnethingPluginListItemLike, OnethingPluginCommandLike, TCommand>, 'getCommandHandler'> | null
  logger?: OnethingPluginIpcLogger
}

export async function executeOnethingPluginCommandForIpc<
  TCommand extends CorePluginCommandDefinition<CorePluginCommandContext>,
  TSession extends OnethingPluginCommandSessionLike,
>(
  options: ExecuteOnethingPluginCommandForIpcOptions<TCommand, TSession>,
): Promise<ExecuteOnethingPluginCommandResult> {
  const { manager, logger, ...commandOptions } = options
  try {
    const requiredManager = requireOnethingPluginManager(manager)
    return await executeOnethingPluginCommand({
      ...commandOptions,
      getCommandHandler: commandName => requiredManager.getCommandHandler(commandName),
    })
  } catch (error) {
    return pluginIpcError(logger, 'execute command', error, 'Failed to execute plugin command')
  }
}

function requireOnethingPluginManager<TManager>(
  manager: TManager | null | undefined,
): TManager {
  if (!manager) throw new Error(ONETHING_PLUGIN_SYSTEM_NOT_INITIALIZED)
  return manager
}

function pluginIpcError(
  logger: OnethingPluginIpcLogger | undefined,
  label: string,
  error: unknown,
  fallback: string,
): { success: false; error: string } {
  logger?.error?.(`[PluginIPC] ${label} error:`, error)
  return {
    success: false,
    error: error instanceof Error && error.message ? error.message : fallback,
  }
}
