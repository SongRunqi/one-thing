import type { CorePluginAPIState } from './api-state.js'
import { deepFreezeCorePluginValue } from './freeze.js'
import { PluginStorageError, type CorePluginStorage } from './storage.js'
import {
  assertPluginPayloadSerializable,
  normalizePluginRequestAction,
  type CorePluginRequestHandler,
} from './request-channel.js'
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
  /**
   * 插件自定义事件出口。事件名由宿主统一加 `plugin:<pluginId>:` 前缀 ——
   * 命名空间不由插件自己保证,否则两个插件迟早撞名。
   */
  emitPluginEvent?(pluginId: string, eventName: string, payload: unknown): void
  /**
   * 插件自有配置的访问面(R3)。
   *
   * 宿主全权管理存储与校验;插件只读快照 —— 没有 registerSettings,
   * schema 的唯一事实源是 manifest 的 contributes.settings.schema。
   */
  getPluginConfig?(pluginId: string): Record<string, unknown>
  onPluginConfigChange?(
    pluginId: string,
    callback: (config: Record<string, unknown>) => void,
  ): () => void
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
  /** 插件数据目录访问面(R4);路径/序列化守卫在 core 的 storage.ts。 */
  storage?: CorePluginStorage
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
  /**
   * 运行期成功上报,清同 scope 的连败账。
   * 事件 handler 是高频路径,这个回调必须零 IO 纯内存。
   */
  onPluginSuccess?(input: { pluginId: string; scope: string }): void
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
  const reportSuccess = (scope: string): void => {
    options.onPluginSuccess?.({ pluginId, scope })
  }

  const unsubs: Array<() => void> = []
  const commands = new Map<string, TCommand>()
  const toolIds: string[] = []
  const skillRootUnsubs: Array<() => void> = []
  const promptContextUnsubs: Array<() => void> = []
  const lifecycleUnsubs: Array<() => void> = []
  const disposeCallbacks = options.disposeCallbacks ?? []

  // 晚到注册闸。
  //
  // entry(api) 超时之后宿主会把这份 state 拆掉,但那个 promise 并没有被取消 ——
  // 十分钟后它恢复过来照样能调 api.registerTool,而这份 state 已经不在
  // pluginStates 里,disposeAll() 永远摸不到它:那个工具就是个永久孤儿。
  // 置位后所有注册入口 no-op,并按插件归因 warn 一次。
  const requireStorage = (): CorePluginStorage => {
    if (!options.storage) {
      throw new Error(`Plugin "${pluginId}" has no storage surface on this host`)
    }
    return options.storage
  }
  /**
   * 存储失败进熔断账,然后**继续抛给插件** —— 路径穿越这类错误必须让插件
   * 当场知道自己写错了,静默吞掉只会让它以为写成功了。
   *
   * scope 按**操作**分车道(`storage.writeJson` / `storage.readJson` / …),
   * 与 `request:<action>` 同一个先例:单车道会让 exists 的成功不断清掉
   * writeJson 的连败,插件级混计的假阴性会在 scope 内原样复现。
   */
  const withStorageFailureReport = <T>(what: string, run: () => T): T => {
    const scope = `storage.${what}`
    try {
      const result = run()
      options.onPluginSuccess?.({ pluginId, scope })
      return result
    } catch (error) {
      logger.error(`[Plugin:${pluginId}] storage.${what} failed:`, error)
      reportFailure(scope, error)
      throw error
    }
  }
  /**
   * 拆除之后的存储语义:**写面抛、读面退化**。
   *
   * 写面静默 no-op 是"假装写成功了",插件会以为数据落盘了;读面抛则会让
   * teardown 竞速里的一次无害读取把插件炸掉。dir() 归入写面 —— 它会建目录,
   * 而且返回 '' 会让插件的 path.join 落进进程 CWD。
   */
  const rejectDisposedWrite = (what: string): void => {
    if (!state.disposed) return
    const error = new PluginStorageError(
      'unavailable',
      `Plugin "${pluginId}" was disposed; storage.${what} is no longer available`,
    )
    rejectLateCall(`storage.${what}`)
    throw error
  }

  const requestHandlers = new Map<string, CorePluginRequestHandler>()
  const configUnsubs: Array<() => void> = []

  const state: CorePluginAPIState<TApi, TCommand> = {
    api: undefined as unknown as TApi,
    unsubs,
    commands,
    requestHandlers,
    toolIds,
    skillRootUnsubs,
    promptContextUnsubs,
    lifecycleUnsubs,
    configUnsubs,
    disposeCallbacks,
    disposed: false,
  }
  let lateWarned = false
  const rejectLateCall = (what: string): boolean => {
    if (!state.disposed) return false
    if (!lateWarned) {
      lateWarned = true
      logger.error(
        `[Plugin:${pluginId}] Ignoring "${what}" after dispose — the plugin resumed past its teardown `
        + '(entry timeout or a late async callback). Further late calls are silently dropped.',
        undefined,
      )
    }
    return true
  }

  const api = {
    id: pluginId,

    registerTool(tool: TTool): void {
      if (rejectLateCall('registerTool')) return
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
      if (rejectLateCall('on')) return () => {}
      const scope = `event:${eventType}`
      const onHandlerError = (error: unknown): void => {
        logger.error(`[Plugin:${pluginId}] Event handler error (${eventType}):`, error)
        reportFailure(scope, error)
      }
      const wrappedHandler = ((...args: unknown[]) => {
        if (state.disposed) {
          // 拆除之后到达的事件不再进插件 —— 见 CorePluginAPIState.disposed。
          return
        }
        try {
          const result = handler(...args)
          if (result instanceof Promise) {
            result.then(() => reportSuccess(scope), onHandlerError)
          } else {
            reportSuccess(scope)
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
      if (rejectLateCall('steer')) return
      try {
        host.steer(pluginId, sessionId, content)
      } catch (error) {
        logger.error(`[Plugin:${pluginId}] steer error:`, error)
        reportFailure('steer', error)
      }
    },

    followUp(sessionId: string, content: string): void {
      if (rejectLateCall('followUp')) return
      try {
        host.followUp(pluginId, sessionId, content)
      } catch (error) {
        logger.error(`[Plugin:${pluginId}] followUp error:`, error)
        reportFailure('followUp', error)
      }
    },

    registerCommand(name: string, options: TCommandOptions): void {
      if (rejectLateCall('registerCommand')) return
      const fullName = name.startsWith('/') ? name : `/${name}`
      commands.set(fullName, { name: fullName, ...options } as unknown as TCommand)
      logger.log(`[Plugin:${pluginId}] Registered command: ${fullName}`)
    },

    registerPromptContextProvider(id: string, provider: TPromptContextProvider): void {
      if (rejectLateCall('registerPromptContextProvider')) return
      const unsub = host.registerPromptContextProvider(pluginId, id, provider)
      promptContextUnsubs.push(unsub)
      logger.log(`[Plugin:${pluginId}] Registered prompt context provider: ${id}`)
    },

    beforeContextCompact(id: string, hook: TBeforeContextCompactHook): void {
      if (rejectLateCall('beforeContextCompact')) return
      const unsub = host.registerBeforeContextCompactHook(pluginId, id, hook)
      lifecycleUnsubs.push(unsub)
      logger.log(`[Plugin:${pluginId}] Registered beforeContextCompact hook: ${id}`)
    },

    afterAssistantResponse(id: string, hook: TAfterAssistantResponseHook): void {
      if (rejectLateCall('afterAssistantResponse')) return
      const unsub = host.registerAfterAssistantResponseHook(pluginId, id, hook)
      lifecycleUnsubs.push(unsub)
      logger.log(`[Plugin:${pluginId}] Registered afterAssistantResponse hook: ${id}`)
    },

    registerSkillRoot(provider: TSkillRootProvider): void {
      if (rejectLateCall('registerSkillRoot')) return
      const unsub = host.registerSkillRoot(pluginId, provider)
      skillRootUnsubs.push(unsub)
      Promise.resolve(host.invalidateSkillsCache?.()).catch(() => undefined)
      logger.log(`[Plugin:${pluginId}] Registered skill root provider`)
    },

    /**
     * 统一请求通道的插件侧登记口(设计文档 §5 R2)。
     *
     * handler 拿到的 ctx 带 requestId / abortSignal / progress —— 与宿主工具
     * 执行上下文同构,长任务从第一天就有取消与中间态。
     */
    registerRequestHandler(action: string, handler: CorePluginRequestHandler): void {
      if (rejectLateCall('registerRequestHandler')) return
      const normalized = normalizePluginRequestAction(action)
      if (!normalized) {
        logger.error(`[Plugin:${pluginId}] registerRequestHandler needs a non-empty action`, undefined)
        return
      }
      if (requestHandlers.has(normalized)) {
        logger.error(`[Plugin:${pluginId}] Duplicate request handler for action "${normalized}" (replacing)`, undefined)
      }
      requestHandlers.set(normalized, handler)
      logger.log(`[Plugin:${pluginId}] Registered request handler: ${normalized}`)
    },

    settings: {
      /**
       * **有意不带 disposed 闩**:读配置没有破坏性(不注册、不落盘、不发事件),
       * 拆除之后一个晚到的读取最多拿到一份过期快照。给它加闩只会让插件在
       * teardown 竞速里拿到 undefined 而崩,收益为负。
       */
      get<T = Record<string, unknown>>(): T {
        // 深冻结快照,不是活引用:浅冻结只挡住顶层赋值,
        // `get().tags.push('x')` 照样能写穿共享的数组(乃至 manifest 里的
        // schema.default 本体)。而且 H 线把插件搬进子进程之后,
        // "同步读一个远端对象"根本不成立 —— 快照语义现在就定死。
        return deepFreezeCorePluginValue({ ...(host.getPluginConfig?.(pluginId) ?? {}) }) as T
      },
      onChange(callback: (config: Record<string, unknown>) => void): () => void {
        if (rejectLateCall('settings.onChange')) return () => {}
        const unsub = host.onPluginConfigChange?.(pluginId, callback) ?? (() => {})
        configUnsubs.push(unsub)
        return unsub
      },
    },

    events: {
      /**
       * 发一条命名空间事件。投递名 = `plugin:<pluginId>:<name>`,
       * 任何插件都能用 api.on 订阅它。payload 过线,必须 JSON-可序列化。
       */
      emit(eventName: string, payload?: unknown): void {
        if (rejectLateCall('events.emit')) return
        const name = String(eventName || '').trim()
        if (!name) {
          logger.error(`[Plugin:${pluginId}] events.emit needs a non-empty event name`, undefined)
          return
        }
        try {
          assertPluginPayloadSerializable(payload, `plugin event "${name}" payload`)
        } catch (error) {
          logger.error(`[Plugin:${pluginId}] events.emit rejected:`, error)
          reportFailure(`events.emit:${name}`, error)
          return
        }
        try {
          host.emitPluginEvent?.(pluginId, name, payload)
        } catch (error) {
          logger.error(`[Plugin:${pluginId}] events.emit failed:`, error)
          reportFailure(`events.emit:${name}`, error)
        }
      },
    },

    onDispose(callback: () => void): void {
      if (rejectLateCall('onDispose')) return
      disposeCallbacks.push(callback)
    },

    store,
    /**
     * 目录访问面。路径穿越与序列化守卫在 createCorePluginStorage 里(它会抛),
     * 这一层只加两件宿主的事:disposed 闩 + 把失败记进熔断账(scope `storage`)。
     */
    storage: {
      dir(): string {
        rejectDisposedWrite('dir')
        return withStorageFailureReport('dir', () => requireStorage().dir())
      },
      readJson<T = unknown>(name: string, fallback?: T): T | undefined {
        if (state.disposed) {
          rejectLateCall('storage.readJson')
          return fallback
        }
        return withStorageFailureReport('readJson', () => requireStorage().readJson<T>(name, fallback))
      },
      writeJson(name: string, value: unknown): void {
        rejectDisposedWrite('writeJson')
        withStorageFailureReport('writeJson', () => requireStorage().writeJson(name, value))
      },
      exists(name: string): boolean {
        if (state.disposed) {
          rejectLateCall('storage.exists')
          return false
        }
        return withStorageFailureReport('exists', () => requireStorage().exists(name))
      },
    },
    scheduler,
    ui: {
      notify(message: string, level: 'info' | 'warn' | 'error' = 'info'): void {
        if (rejectLateCall('ui.notify')) return
        try {
          host.notify(pluginId, message, level)
        } catch (error) {
          logger.error(`[Plugin:${pluginId}] notify error:`, error)
        }
      },
    },
  } as unknown as TApi

  state.api = api
  return { api, state }
}
