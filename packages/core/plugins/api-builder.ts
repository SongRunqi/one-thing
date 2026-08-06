import type { CorePluginAPIState } from './api-state.js'
import type {
  CorePluginToolContext,
  CorePluginToolDefinition,
  CorePluginToolResult,
} from './types.js'

export interface CorePluginAPILogger {
  log(message: string): void
  error(message: string, error?: unknown): void
}

export interface CorePluginAPIHost<
  TTool extends { name: string },
  TEventHandler extends (...args: any[]) => any,
  TPromptContextProvider,
  TBeforeContextCompactHook,
  TAfterAssistantResponseHook,
  TSkillRootProvider,
> {
  registerTool(pluginId: string, toolId: string, tool: TTool): void
  subscribeEvent(pluginId: string, eventType: string, handler: TEventHandler): () => void
  steer(pluginId: string, sessionId: string, content: string): void
  followUp(pluginId: string, sessionId: string, content: string): void
  notify(pluginId: string, message: string, level: 'info' | 'warn' | 'error'): void
  registerPromptContextProvider(pluginId: string, id: string, provider: TPromptContextProvider): () => void
  registerBeforeContextCompactHook(pluginId: string, id: string, hook: TBeforeContextCompactHook): () => void
  registerAfterAssistantResponseHook(pluginId: string, id: string, hook: TAfterAssistantResponseHook): () => void
  registerSkillRoot(pluginId: string, provider: TSkillRootProvider): () => void
  invalidateSkillsCache?(): void | Promise<void>
}

export interface CreateCorePluginAPIOptions<
  TTool extends { name: string },
  TEventHandler extends (...args: any[]) => any,
  TCommand,
  TPromptContextProvider,
  TBeforeContextCompactHook,
  TAfterAssistantResponseHook,
  TSkillRootProvider,
  TStore,
  TScheduler,
> {
  pluginId: string
  store: TStore
  scheduler: TScheduler
  disposeCallbacks?: Array<() => void>
  host: CorePluginAPIHost<
    TTool,
    TEventHandler,
    TPromptContextProvider,
    TBeforeContextCompactHook,
    TAfterAssistantResponseHook,
    TSkillRootProvider
  >
  logger?: CorePluginAPILogger
  /**
   * 运行期失败上报(事件 handler 抛错、steer/followUp/notify 抛错)。
   * 宿主拿它做失败计数熔断 —— 在这之前这些错只进 console,插件卡片永远 Active。
   */
  onPluginFailure?(input: { pluginId: string; scope: string; error: unknown }): void
}

export interface CorePluginHostToolContext<TMetadata extends object = object> {
  sessionId: string
  messageId: string
  toolCallId?: string
  workingDirectory?: string
  abortSignal?: AbortSignal
  metadata?(input: { title?: string; metadata?: Partial<TMetadata> }): void
}

export interface CorePluginHostToolResult<TMetadata extends object = object> {
  title: string
  output: string
  metadata: TMetadata
}

export async function executeCorePluginTool<
  TParameters,
  TArgs,
  TMetadata extends object,
  TPluginContext extends CorePluginToolContext<TMetadata>,
  TResult extends CorePluginToolResult<TMetadata>,
>(
  tool: CorePluginToolDefinition<TParameters, TArgs, TPluginContext, TResult>,
  args: TArgs,
  hostContext: CorePluginHostToolContext<TMetadata>,
): Promise<CorePluginHostToolResult<TMetadata>> {
  const pluginContext = {
    sessionId: hostContext.sessionId,
    messageId: hostContext.messageId,
    toolCallId: hostContext.toolCallId ?? '',
    workingDirectory: hostContext.workingDirectory,
    abortSignal: hostContext.abortSignal,
    metadata(input: { title?: string; metadata?: Partial<TMetadata> }) {
      hostContext.metadata?.(input)
    },
  } as TPluginContext
  const result = await tool.execute(args, pluginContext)
  return {
    title: result.title,
    output: result.output,
    metadata: result.metadata,
  }
}

export function createCorePluginAPI<
  TApi,
  TTool extends { name: string },
  TEventHandler extends (...args: any[]) => any,
  TCommand,
  TCommandOptions extends object,
  TPromptContextProvider,
  TBeforeContextCompactHook,
  TAfterAssistantResponseHook,
  TSkillRootProvider,
  TStore,
  TScheduler,
>(
  options: CreateCorePluginAPIOptions<
    TTool,
    TEventHandler,
    TCommand,
    TPromptContextProvider,
    TBeforeContextCompactHook,
    TAfterAssistantResponseHook,
    TSkillRootProvider,
    TStore,
    TScheduler
  >,
): { api: TApi; state: CorePluginAPIState<TApi, TCommand> } {
  const { pluginId, store, scheduler, host } = options
  const logger = options.logger ?? console
  const reportFailure = (scope: string, error: unknown): void => {
    options.onPluginFailure?.({ pluginId, scope, error })
  }

  const unsubs: Array<() => void> = []
  const commands = new Map<string, TCommand>()
  const toolIds: string[] = []
  const skillRootUnsubs: Array<() => void> = []
  const promptContextUnsubs: Array<() => void> = []
  const lifecycleUnsubs: Array<() => void> = []
  const disposeCallbacks = options.disposeCallbacks ?? []

  const api = {
    id: pluginId,

    registerTool(tool: TTool): void {
      const toolId = `plugin:${pluginId}:${tool.name}`
      try {
        host.registerTool(pluginId, toolId, tool)
        if (!toolIds.includes(toolId)) {
          toolIds.push(toolId)
        }
        logger.log(`[Plugin:${pluginId}] Registered tool: ${tool.name}`)
      } catch (error) {
        logger.error(`[Plugin:${pluginId}] Failed to register tool "${tool.name}":`, error)
      }
    },

    on(eventType: string, handler: TEventHandler): () => void {
      const onHandlerError = (error: unknown): void => {
        logger.error(`[Plugin:${pluginId}] Event handler error (${eventType}):`, error)
        reportFailure(`event:${eventType}`, error)
      }
      const wrappedHandler = ((...args: unknown[]) => {
        try {
          const result = handler(...args)
          if (result instanceof Promise) {
            result.catch(onHandlerError)
          }
        } catch (error) {
          onHandlerError(error)
        }
      }) as TEventHandler

      const unsub = host.subscribeEvent(pluginId, eventType, wrappedHandler)
      unsubs.push(unsub)
      return unsub
    },

    steer(sessionId: string, content: string): void {
      try {
        host.steer(pluginId, sessionId, content)
      } catch (error) {
        logger.error(`[Plugin:${pluginId}] steer error:`, error)
        reportFailure('steer', error)
      }
    },

    followUp(sessionId: string, content: string): void {
      try {
        host.followUp(pluginId, sessionId, content)
      } catch (error) {
        logger.error(`[Plugin:${pluginId}] followUp error:`, error)
        reportFailure('followUp', error)
      }
    },

    registerCommand(name: string, options: TCommandOptions): void {
      const fullName = name.startsWith('/') ? name : `/${name}`
      commands.set(fullName, { name: fullName, ...options } as unknown as TCommand)
      logger.log(`[Plugin:${pluginId}] Registered command: ${fullName}`)
    },

    registerPromptContextProvider(id: string, provider: TPromptContextProvider): void {
      const unsub = host.registerPromptContextProvider(pluginId, id, provider)
      promptContextUnsubs.push(unsub)
      logger.log(`[Plugin:${pluginId}] Registered prompt context provider: ${id}`)
    },

    beforeContextCompact(id: string, hook: TBeforeContextCompactHook): void {
      const unsub = host.registerBeforeContextCompactHook(pluginId, id, hook)
      lifecycleUnsubs.push(unsub)
      logger.log(`[Plugin:${pluginId}] Registered beforeContextCompact hook: ${id}`)
    },

    afterAssistantResponse(id: string, hook: TAfterAssistantResponseHook): void {
      const unsub = host.registerAfterAssistantResponseHook(pluginId, id, hook)
      lifecycleUnsubs.push(unsub)
      logger.log(`[Plugin:${pluginId}] Registered afterAssistantResponse hook: ${id}`)
    },

    registerSkillRoot(provider: TSkillRootProvider): void {
      const unsub = host.registerSkillRoot(pluginId, provider)
      skillRootUnsubs.push(unsub)
      Promise.resolve(host.invalidateSkillsCache?.()).catch(() => undefined)
      logger.log(`[Plugin:${pluginId}] Registered skill root provider`)
    },

    onDispose(callback: () => void): void {
      disposeCallbacks.push(callback)
    },

    store,
    scheduler,
    ui: {
      notify(message: string, level: 'info' | 'warn' | 'error' = 'info'): void {
        try {
          host.notify(pluginId, message, level)
        } catch (error) {
          logger.error(`[Plugin:${pluginId}] notify error:`, error)
        }
      },
    },
  } as unknown as TApi

  return {
    api,
    state: {
      api,
      unsubs,
      commands,
      toolIds,
      skillRootUnsubs,
      promptContextUnsubs,
      lifecycleUnsubs,
      disposeCallbacks,
    },
  }
}
