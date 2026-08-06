import {
  CORE_PLUGIN_LIFECYCLE_HOOK_TIMEOUT_MS,
  runWithPluginTimeout,
} from './runtime-guard.js'

export interface CoreBeforeContextCompactContext<
  TSettings = unknown,
  TMessage = unknown,
  TConfigWithApiKey = unknown,
> {
  sessionId: string
  providerId: string
  configWithApiKey: TConfigWithApiKey
  settings: TSettings
  keepRecentTurns?: number
  messagesToSummarize: TMessage[]
}

export type CoreBeforeContextCompactHook<TContext = CoreBeforeContextCompactContext> = (
  context: TContext,
) => Promise<void> | void

export interface CoreAfterAssistantResponseContext<
  TSettings = unknown,
  TSession = unknown,
  TMessage = unknown,
  TProviderConfig = unknown,
> {
  sessionId: string
  assistantMessageId: string
  session: TSession
  messages: TMessage[]
  lastUserMessage: string
  lastAssistantMessage: string
  providerId: string
  providerConfig: TProviderConfig
  settings: TSettings
}

export type CoreAfterAssistantResponseHook<TContext = CoreAfterAssistantResponseContext> = (
  context: TContext,
) => Promise<void> | void

interface RegisteredPluginHook<THook> {
  pluginId: string
  hookId: string
  hook: THook
}

export interface CorePluginLifecycleLogger {
  error(message: string, error: unknown): void
}

export interface CorePluginLifecycleRegistryOptions {
  logger?: CorePluginLifecycleLogger
  /** 每个钩子的超时预算;<=0 关闭超时。 */
  timeoutMs?: number
  /** 钩子超时或抛错时回调,供失败计数熔断消费。 */
  onHookFailure?(input: { pluginId: string; hookId: string; scope: string; error: unknown }): void
  onHookSuccess?(input: { pluginId: string; hookId: string; scope: string }): void
}

export class CorePluginLifecycleRegistry<
  TBeforeContext = CoreBeforeContextCompactContext,
  TAfterContext = CoreAfterAssistantResponseContext,
> {
  private beforeCompactHooks = new Map<string, RegisteredPluginHook<CoreBeforeContextCompactHook<TBeforeContext>>>()
  private afterResponseHooks = new Map<string, RegisteredPluginHook<CoreAfterAssistantResponseHook<TAfterContext>>>()
  private readonly logger: CorePluginLifecycleLogger
  private readonly options: CorePluginLifecycleRegistryOptions

  constructor(loggerOrOptions: CorePluginLifecycleLogger | CorePluginLifecycleRegistryOptions = console) {
    const options: CorePluginLifecycleRegistryOptions = typeof (loggerOrOptions as CorePluginLifecycleLogger).error === 'function'
      ? { logger: loggerOrOptions as CorePluginLifecycleLogger }
      : (loggerOrOptions as CorePluginLifecycleRegistryOptions)
    this.options = options
    this.logger = options.logger ?? console
  }

  registerBeforeContextCompactHook(
    pluginId: string,
    hookId: string,
    hook: CoreBeforeContextCompactHook<TBeforeContext>,
  ): () => void {
    const hookKey = this.key(pluginId, hookId)
    this.beforeCompactHooks.set(hookKey, {
      pluginId,
      hookId,
      hook,
    })
    return () => {
      this.beforeCompactHooks.delete(hookKey)
    }
  }

  registerAfterAssistantResponseHook(
    pluginId: string,
    hookId: string,
    hook: CoreAfterAssistantResponseHook<TAfterContext>,
  ): () => void {
    const hookKey = this.key(pluginId, hookId)
    this.afterResponseHooks.set(hookKey, {
      pluginId,
      hookId,
      hook,
    })
    return () => {
      this.afterResponseHooks.delete(hookKey)
    }
  }

  async runBeforeContextCompactHooks(context: TBeforeContext): Promise<void> {
    await this.runHooks('beforeContextCompact', this.beforeCompactHooks, context)
  }

  async runAfterAssistantResponseHooks(context: TAfterContext): Promise<void> {
    await this.runHooks('afterAssistantResponse', this.afterResponseHooks, context)
  }

  /**
   * 逐钩子跑,每个都带超时预算。
   *
   * 之前这里是裸 await:一个不 resolve 的钩子会把上下文压缩(以及排在它后面的
   * 所有钩子)永久挂住。catch 挡得住抛错,挡不住挂起。
   */
  private async runHooks<TContext, THook extends (context: TContext) => Promise<void> | void>(
    scope: string,
    hooks: Map<string, RegisteredPluginHook<THook>>,
    context: TContext,
  ): Promise<void> {
    const timeoutMs = this.options.timeoutMs ?? CORE_PLUGIN_LIFECYCLE_HOOK_TIMEOUT_MS
    for (const item of [...hooks.values()]) {
      const label = `${item.pluginId}/${item.hookId}`
      try {
        await runWithPluginTimeout(`${scope}:${label}`, timeoutMs, () => item.hook(context))
        this.options.onHookSuccess?.({ pluginId: item.pluginId, hookId: item.hookId, scope })
      } catch (error) {
        this.logger.error(`[PluginLifecycle] ${scope} failed for "${label}":`, error)
        this.options.onHookFailure?.({
          pluginId: item.pluginId,
          hookId: item.hookId,
          scope,
          error,
        })
      }
    }
  }

  clearLifecycleHooksForPlugin(pluginId: string): void {
    for (const item of this.beforeCompactHooks.values()) {
      if (item.pluginId === pluginId) {
        this.beforeCompactHooks.delete(this.key(item.pluginId, item.hookId))
      }
    }
    for (const item of this.afterResponseHooks.values()) {
      if (item.pluginId === pluginId) {
        this.afterResponseHooks.delete(this.key(item.pluginId, item.hookId))
      }
    }
  }

  clear(): void {
    this.beforeCompactHooks.clear()
    this.afterResponseHooks.clear()
  }

  getHookCounts(): { beforeContextCompact: number; afterAssistantResponse: number } {
    return {
      beforeContextCompact: this.beforeCompactHooks.size,
      afterAssistantResponse: this.afterResponseHooks.size,
    }
  }

  private key(pluginId: string, hookId: string): string {
    return `${pluginId}:${hookId.trim() || 'default'}`
  }
}
