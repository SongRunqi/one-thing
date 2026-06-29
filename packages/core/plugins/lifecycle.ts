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

export class CorePluginLifecycleRegistry<
  TBeforeContext = CoreBeforeContextCompactContext,
  TAfterContext = CoreAfterAssistantResponseContext,
> {
  private beforeCompactHooks = new Map<string, RegisteredPluginHook<CoreBeforeContextCompactHook<TBeforeContext>>>()
  private afterResponseHooks = new Map<string, RegisteredPluginHook<CoreAfterAssistantResponseHook<TAfterContext>>>()

  constructor(private readonly logger: CorePluginLifecycleLogger = console) {}

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
    for (const item of this.beforeCompactHooks.values()) {
      try {
        await item.hook(context)
      } catch (error) {
        this.logger.error(
          `[PluginLifecycle] beforeContextCompact failed for "${item.pluginId}/${item.hookId}":`,
          error,
        )
      }
    }
  }

  async runAfterAssistantResponseHooks(context: TAfterContext): Promise<void> {
    for (const item of this.afterResponseHooks.values()) {
      try {
        await item.hook(context)
      } catch (error) {
        this.logger.error(
          `[PluginLifecycle] afterAssistantResponse failed for "${item.pluginId}/${item.hookId}":`,
          error,
        )
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
