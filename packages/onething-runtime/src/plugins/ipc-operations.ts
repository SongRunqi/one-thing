import type {
  CorePluginCommandContext,
  CorePluginCommandDefinition,
  CorePluginRequestInput,
  CorePluginRequestResult,
} from '@onething/core/plugins'
import {
  executeOnethingPluginCommand,
  type ExecuteOnethingPluginCommandOptions,
  type ExecuteOnethingPluginCommandResult,
  type OnethingPluginCommandSessionLike,
} from './plugin-command-execution.js'
import type { PluginConfigError, PluginConfigField } from './config-schema.js'
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
  /** 统一请求通道(R2)。分发逻辑在 core,这里只是宿主的转发面。 */
  uninstallPlugin?(pluginId: string): Promise<{ success: boolean; archivePath?: string; error?: string }>
  handleRequest?(input: CorePluginRequestInput): Promise<CorePluginRequestResult>
  abortRequest?(requestId: string): boolean
  getRequestActions?(pluginId: string): string[]
}

interface OnethingPluginIpcOperationOptions<
  TPlugin extends OnethingPluginListItemLike = OnethingPluginListItemLike,
  TCommandInfo extends OnethingPluginCommandLike = OnethingPluginCommandLike,
  TCommand extends CorePluginCommandDefinition<CorePluginCommandContext> =
    CorePluginCommandDefinition<CorePluginCommandContext>,
> {
  manager?: OnethingPluginIpcManagerLike<TPlugin, TCommandInfo, TCommand> | null
  logger?: OnethingPluginIpcLogger
  /** 有效配置取值器(R3);省略时列表里的配置值退回默认。 */
  getPluginConfig?(pluginId: string): Record<string, unknown>
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
      plugins: projectOnethingPluginsForRenderer(manager.getPlugins(), {
        getRequestActions: pluginId => manager.getRequestActions?.(pluginId) ?? [],
        getConfig: options.getPluginConfig,
      }),
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
  options: OnethingPluginIpcOperationOptions<TPlugin, TCommandInfo, TCommand> & {
    pluginId: string
    /**
     * 手动停用的清账钩子。
     *
     * 熔断的自动禁用**不走这个入口**(它直接调 manager.disablePlugin),所以
     * 这里天然只对"用户亲手关的"生效:清掉后端 tracker 与盘上的原因,否则
     * 重开设置页红条照样复现。
     */
    onManualDisable?: (pluginId: string) => void
  },
): Promise<ToggleOnethingPluginForIpcResult> {
  try {
    const manager = requireOnethingPluginManager(options.manager)
    await manager.disablePlugin(options.pluginId)
    options.onManualDisable?.(options.pluginId)
    return { success: true }
  } catch (error) {
    return pluginIpcError(options.logger, `disable ${options.pluginId}`, error, 'Failed to disable plugin')
  }
}

export type UninstallOnethingPluginForIpcResult = {
  success: boolean
  archivePath?: string
  error?: string
}

/**
 * 卸载的宿主转发面(R4)。
 *
 * 生命周期本身在 core 的 manager.uninstallPlugin;这里只负责把结果原样带出去
 * (含 archivePath —— 用户要知道自己的数据被搬去了哪)。
 */
export async function uninstallOnethingPluginForIpc<
  TPlugin extends OnethingPluginListItemLike,
  TCommandInfo extends OnethingPluginCommandLike,
  TCommand extends CorePluginCommandDefinition<CorePluginCommandContext>,
>(
  options: OnethingPluginIpcOperationOptions<TPlugin, TCommandInfo, TCommand> & { pluginId: string },
): Promise<UninstallOnethingPluginForIpcResult> {
  try {
    const manager = requireOnethingPluginManager(options.manager)
    if (!manager.uninstallPlugin) {
      return { success: false, error: 'Plugin uninstall is unavailable on this host' }
    }
    return await manager.uninstallPlugin(options.pluginId)
  } catch (error) {
    return pluginIpcError(options.logger, `uninstall ${options.pluginId}`, error, 'Failed to uninstall plugin')
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

/**
 * 统一请求通道的宿主转发面(设计文档 §5 R2)。
 *
 * 这里刻意**不**做任何分发/序列化判断 —— 那些都在 core 的 manager.handleRequest
 * 里,四个宿主共用同一份语义;@main / http 只负责把参数递进来、把结果递出去。
 */
export type OnethingPluginRequestForIpcResult = CorePluginRequestResult

export interface OnethingPluginRequestForIpcOptions<
  TPlugin extends OnethingPluginListItemLike = OnethingPluginListItemLike,
  TCommandInfo extends OnethingPluginCommandLike = OnethingPluginCommandLike,
  TCommand extends CorePluginCommandDefinition<CorePluginCommandContext> =
    CorePluginCommandDefinition<CorePluginCommandContext>,
> extends OnethingPluginIpcOperationOptions<TPlugin, TCommandInfo, TCommand> {
  pluginId: string
  action: string
  payload?: unknown
  requestId?: string
  onProgress?: CorePluginRequestInput['onProgress']
}

export async function handleOnethingPluginRequestForIpc<
  TPlugin extends OnethingPluginListItemLike,
  TCommandInfo extends OnethingPluginCommandLike,
  TCommand extends CorePluginCommandDefinition<CorePluginCommandContext>,
>(
  options: OnethingPluginRequestForIpcOptions<TPlugin, TCommandInfo, TCommand>,
): Promise<OnethingPluginRequestForIpcResult> {
  // **不在这里预生成 requestId。** 之前用 `${pluginId}#${Date.now()}`(毫秒精度、
  // 无序列号)把 core 那个带单调序列号的 nextRequestId 旁路成了死码,同毫秒并发
  // 两个请求会串号:先到的 AbortController 失联,先 settle 的一方把另一方的
  // 登记也删掉。缺省交给 core 生成,真正生效的 id 随结果回传。
  try {
    const manager = requireOnethingPluginManager(options.manager)
    if (!manager.handleRequest) {
      return {
        success: false,
        requestId: options.requestId || '',
        error: 'Plugin request channel is unavailable on this host',
      }
    }
    return await manager.handleRequest({
      pluginId: options.pluginId,
      action: options.action,
      payload: options.payload,
      requestId: options.requestId,
      onProgress: options.onProgress,
    })
  } catch (error) {
    const projected = pluginIpcError(
      options.logger,
      `request ${options.pluginId}/${options.action}`,
      error,
      'Plugin request failed',
    )
    return { success: false, requestId: options.requestId || '', error: projected.error }
  }
}

export function abortOnethingPluginRequestForIpc<
  TPlugin extends OnethingPluginListItemLike,
  TCommandInfo extends OnethingPluginCommandLike,
  TCommand extends CorePluginCommandDefinition<CorePluginCommandContext>,
>(
  options: OnethingPluginIpcOperationOptions<TPlugin, TCommandInfo, TCommand> & { requestId: string },
): { success: boolean; aborted: boolean; error?: string } {
  try {
    const manager = requireOnethingPluginManager(options.manager)
    return { success: true, aborted: manager.abortRequest?.(options.requestId) ?? false }
  } catch (error) {
    const projected = pluginIpcError(options.logger, 'abort request', error, 'Failed to abort plugin request')
    return { success: false, aborted: false, error: projected.error }
  }
}

/**
 * 插件自有配置的宿主转发面(R3)。
 *
 * 与请求通道不同,这两条**不经过插件代码**:schema 在 manifest、存储与校验在
 * 宿主,所以未启用甚至从未加载过的插件也能配 —— 这正是"声明先于代码"的红利。
 */
export interface OnethingPluginConfigAccess {
  describe(pluginId: string): {
    declared: boolean
    supported: boolean
    title?: string
    fields: PluginConfigField[]
    unsupportedReasons: string[]
  }
  read(pluginId: string): Record<string, unknown>
  write(pluginId: string, config: unknown): {
    success: boolean
    config?: Record<string, unknown>
    errors?: PluginConfigError[]
  }
}

export type GetOnethingPluginConfigForIpcResult = {
  success: boolean
  fields?: PluginConfigField[]
  config?: Record<string, unknown>
  title?: string
  declared?: boolean
  unsupportedReasons?: string[]
  editable?: boolean
  readOnlyReason?: string
  error?: string
}

export function getOnethingPluginConfigForIpc(options: {
  access?: OnethingPluginConfigAccess | null
  pluginId: string
  logger?: OnethingPluginIpcLogger
}): GetOnethingPluginConfigForIpcResult {
  try {
    if (!options.access) return { success: false, error: ONETHING_PLUGIN_SYSTEM_NOT_INITIALIZED }
    const described = options.access.describe(options.pluginId)
    return {
      success: true,
      declared: described.declared,
      title: described.title,
      fields: described.supported ? described.fields : [],
      unsupportedReasons: described.unsupportedReasons,
      config: described.declared ? options.access.read(options.pluginId) : {},
      editable: true,
    }
  } catch (error) {
    return pluginIpcError(options.logger, `config get ${options.pluginId}`, error, 'Failed to read plugin config')
  }
}

export function setOnethingPluginConfigForIpc(options: {
  access?: OnethingPluginConfigAccess | null
  pluginId: string
  config: unknown
  logger?: OnethingPluginIpcLogger
}): { success: boolean; config?: Record<string, unknown>; errors?: PluginConfigError[]; error?: string } {
  try {
    if (!options.access) return { success: false, error: ONETHING_PLUGIN_SYSTEM_NOT_INITIALIZED }
    return options.access.write(options.pluginId, options.config)
  } catch (error) {
    return pluginIpcError(options.logger, `config set ${options.pluginId}`, error, 'Failed to save plugin config')
  }
}

export function getOnethingPluginFootprintForIpc(options: {
  readFootprint?: (pluginId: string) => {
    pluginId: string
    dataDir: string
    dataDirExists: boolean
    entries: string[]
    legacyKvExists: boolean
    settingsKeys: string[]
  }
  pluginId: string
  logger?: OnethingPluginIpcLogger
}): { success: boolean; footprint?: ReturnType<NonNullable<typeof options.readFootprint>>; error?: string } {
  try {
    if (!options.readFootprint) return { success: false, error: 'Plugin footprint is unavailable on this host' }
    return { success: true, footprint: options.readFootprint(options.pluginId) }
  } catch (error) {
    return pluginIpcError(options.logger, `footprint ${options.pluginId}`, error, 'Failed to read plugin footprint')
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
