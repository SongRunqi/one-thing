import type { CorePluginAPIState } from './api-state.js'
import { deepFreezeCorePluginValue } from './freeze.js'
import { PluginStorageError, type CorePluginMessageStateStore, type CorePluginStorage } from './storage.js'
import {
  PLUGIN_PANEL_INIT_ACTION,
  PLUGIN_PANEL_INVOKE_ACTION,
  PLUGIN_PANEL_RENDER_ACTION,
  isReservedPluginPanelAction,
  type CorePluginPanelContext,
  type CorePluginPanelRegistration,
} from './panel.js'
import {
  PLUGIN_UI_INVOKE_ACTION,
  PLUGIN_UI_RENDER_ACTION,
  isReservedPluginUiAction,
  isUiAnchor,
  uiSlotAddress,
  uiSlotSurfaceId,
  type CorePluginUiSlotContext,
  type CorePluginUiSlotRegistration,
} from './ui-anchor.js'
import type { CorePluginStatusPart, CorePluginStatusRegistry } from './status.js'
import { pluginScope, type PluginFailureScope } from './policy.js'
import {
  assertPluginPayloadSerializable,
  normalizePluginRequestAction,
  type CorePluginRequestContext,
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
  /** 面板主动刷新的投递口(R5)——走既有的 plugin:notification 轨。 */
  emitPanelRefresh?(pluginId: string, panelId: string): void
  /**
   * 流状态的投递口(R6)——走既有的 `content:part` 会话事件。
   *
   * 宿主负责把它接到会话总线上;core 只管账与清扫语义。
   */
  emitPluginStatus?(pluginId: string, sessionId: string, part: CorePluginStatusPart): void
  /** 有被合并窗压住的状态变化 —— 宿主据此排一次 trailing flush。 */
  notePluginStatusPending?(): void
  /**
   * IM 连接器注册表的转发口(R7)。返回退订函数。
   *
   * 宿主注入;core 不认识渠道。开放下一个注册表时照抄这一行 + 在策略表里加条目。
   */
  registerIMConnector?(pluginId: string, connector: unknown): (() => void) | undefined
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
  /**
   * 消息作用域状态存储(plugin-message-state-2026-08)。宿主按 manifest 的
   * lifetime 声明决定落盘(persistent)还是纯内存(ephemeral);不给 =
   * 本宿主没有消息态面,`api.storage.message()` 调用处抛(与 storage 缺席同规)。
   */
  messageState?: CorePluginMessageStateStore
  /**
   * manifest 里声明过的面板 id(R5)。
   * registerWorkspacePanel 拿它做匹配 —— 声明先于代码,清单是权威。
   */
  declaredPanelIds?: string[]
  /**
   * 其中哪些是 **webview 形态**的面板(C 期,`contributes.panels[].view === 'webview'`)。
   *
   * 它决定 render 挂到哪个 action 名上:webview 面板的返回值是**初始化数据**
   * 而不是描述树,于是走 `panel:init:<id>`(通道守卫按前缀判定,不必反查形态)。
   * 不传 = 全是描述树面板(headless / 测试替身的自然缺省)。
   */
  declaredWebviewPanelIds?: string[]
  /**
   * manifest 里声明过的锚点块(R5.x)。
   * registerUiSlot 拿它做(anchor, id) 匹配 —— 与面板同一条"声明先于代码"。
   */
  declaredUiSlots?: Array<{ anchor: string; id: string }>
  /**
   * 状态账本(R6)。宿主注入**同一个实例**给所有插件 —— 清扫按会话进行,
   * 每插件一本账就扫不干净。不注入时 api.status 是安静的 no-op(headless)。
   */
  statusRegistry?: CorePluginStatusRegistry
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
  // **签名收口**:scope 是品牌类型,只能由 pluginScope.* 工厂产出。
  // 写裸字符串在这里就编译不过 —— 这是"新增 scope 必须登记"的执行点,
  // 正则反查只当兜底(R7 第一版只有正则,npm-install 就那样漏了过去)。
  const reportFailure = (scope: PluginFailureScope, error: unknown): void => {
    options.onPluginFailure?.({ pluginId, scope, error })
  }
  const reportSuccess = (scope: PluginFailureScope): void => {
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
  const requireMessageState = (): CorePluginMessageStateStore => {
    if (!options.messageState) {
      throw new Error(`Plugin "${pluginId}" has no message-state surface on this host`)
    }
    return options.messageState
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
    const scope = pluginScope.storage(what)
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
    // **onDispose 期间放行。** 插件最自然的收尾写法就是在 onDispose 里存盘;
    // 拒掉它等于让插件静默丢数据,而且报的错("插件已拆除")还会误导排查方向。
    if (state.disposing) return
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
      const scope = pluginScope.event(eventType)
      const onHandlerError = (error: unknown): void => {
        logger.error(`[Plugin:${pluginId}] Event handler error (${eventType}):`, error)
        reportFailure(scope, error)
      }
      const wrappedHandler = ((...args: unknown[]) => {
        // 事件面**不**在 dispose 窗口里放行:拆除中的插件不该再被喂新事件。
        // 放行的只有写面(storage / store),那是为了让 onDispose 能存盘。
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
        reportFailure(pluginScope.steer(), error)
      }
    },

    followUp(sessionId: string, content: string): void {
      if (rejectLateCall('followUp')) return
      try {
        host.followUp(pluginId, sessionId, content)
      } catch (error) {
        logger.error(`[Plugin:${pluginId}] followUp error:`, error)
        reportFailure(pluginScope.followUp(), error)
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
      // `panel:` 与 `ui:` 是宿主保留的命名空间。不挡的话,插件可以直接登记
      // `panel:render:<id>` / `ui:render:<anchor>:<id>` 顶掉宿主装好的那层 ——
      // 一条 replacing 日志之后,一棵没校验过的树就直通 renderer 了。
      // 这与"未声明的面板 id"同一性质,所以同款处理:报错 + 计熔断,不注册。
      if (isReservedPluginPanelAction(normalized) || isReservedPluginUiAction(normalized)) {
        logger.error(
          `[Plugin:${pluginId}] registerRequestHandler("${normalized}") is refused: the "panel:" and "ui:" `
          + 'action namespaces belong to the host. Use registerWorkspacePanel() / registerUiSlot() instead.',
          undefined,
        )
        reportFailure(pluginScope.registration('RequestHandler'), new Error(`reserved action "${normalized}"`))
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

    /**
     * 面板注册 —— 只绑行为,不带存在感。
     *
     * id 必须匹配 manifest 的 contributes.panels:不匹配就报错而不是默默注册一个
     * 谁也进不去的面板(插件侧那句"注册成功了"是最难查的一类假象)。
     * 落地方式是把 render/onAction 挂到统一请求通道上 —— 于是它们免费拿到
     * R2 的超时预算、abort、progress 与 `request:<action>` 熔断账,不另起一套。
     */
    registerWorkspacePanel(registration: CorePluginPanelRegistration): void {
      if (rejectLateCall('registerWorkspacePanel')) return
      const panelId = String(registration?.id ?? '').trim()
      if (!panelId) {
        logger.error(`[Plugin:${pluginId}] registerWorkspacePanel needs an id`, undefined)
        return
      }
      const declared = options.declaredPanelIds ?? []
      if (!declared.includes(panelId)) {
        logger.error(
          `[Plugin:${pluginId}] registerWorkspacePanel("${panelId}") does not match any panel declared in `
          + `contributes.panels (declared: ${declared.length ? declared.join(', ') : 'none'}). `
          + 'Declare it in plugin.json first — the host renders the entry from the manifest.',
          undefined,
        )
        reportFailure(pluginScope.registration('WorkspacePanel'), new Error(`undeclared panel "${panelId}"`))
        return
      }
      if (typeof registration.render !== 'function') {
        logger.error(`[Plugin:${pluginId}] registerWorkspacePanel("${panelId}") needs a render function`, undefined)
        return
      }
      /*
       * webview 面板的 render 挂在**另一个 action 名**上(C 期)。
       *
       * 插件侧的写法不变(还是 `registerWorkspacePanel({ id, render, onAction })`),
       * 变的是 render 的**返回值契约**:webview 面板的内容由静态文件提供,
       * render 交出的是给 iframe 的初始化数据(任意可序列化 JSON),宿主不解释它。
       * 换个 action 名,通道守卫按前缀就知道该用哪套校验 —— 不必反查"这个面板
       * 是哪一种",也就不会有那份反查漂移之后的两类事故。
       *
       * **零代码的纯静态面板是合法的**:manifest 声明 view+entry 就够,
       * 插件完全可以不调 registerWorkspacePanel —— 声明先于代码,宿主凭清单
       * 就能把 iframe 挂起来(renderer 据 requestActions 判断有没有初始化数据可拉)。
       */
      const renderAction = (options.declaredWebviewPanelIds ?? []).includes(panelId)
        ? PLUGIN_PANEL_INIT_ACTION
        : PLUGIN_PANEL_RENDER_ACTION

      // 同一个 id 注册两次:静默覆盖会让"我明明注册了"与"点开是另一个面板"
      // 同时成立,这是最难查的一类。清单里一个 id 就是一个面板,重复即错。
      if (requestHandlers.has(`${renderAction}:${panelId}`)) {
        logger.error(
          `[Plugin:${pluginId}] registerWorkspacePanel("${panelId}") was already registered; `
          + 'one manifest panel id binds exactly one implementation.',
          undefined,
        )
        reportFailure(pluginScope.registration('WorkspacePanel'), new Error(`duplicate panel "${panelId}"`))
        return
      }

      const panelContext = (ctx: CorePluginRequestContext): CorePluginPanelContext => ({
        requestId: ctx.requestId,
        abortSignal: ctx.abortSignal,
        // 主动刷新走**通知通道**而不是 progress:progress 只在请求在飞期间有效
        // (R2 已裁决 abort/settle 之后一律丢弃),而真实的刷新几乎都发生在
        // 请求之外(日志文件变了、定时器到点了)。复用既有通知轨,不另开一条
        // (§5.2 第 4 条:R5 需要投递面时用现成的)。
        refresh: () => host.emitPanelRefresh?.(pluginId, panelId),
      })

      // 形状校验不在这里做:通道层(manager.handleRequest)对所有 panel:* 结果
      // 统一执行,包装可以被绕开而通道不能。这里只做包装自己的事。
      requestHandlers.set(`${renderAction}:${panelId}`, (_payload, ctx) =>
        registration.render(panelContext(ctx)))

      requestHandlers.set(`${PLUGIN_PANEL_INVOKE_ACTION}:${panelId}`, async (payload, ctx) => {
        if (!registration.onAction) return { refresh: false }
        const input = (payload ?? {}) as { actionId?: unknown; payload?: unknown }
        const actionId = String(input.actionId ?? '')
        if (!actionId) throw new Error(`Panel "${panelId}" received an action without an actionId`)
        const result = await registration.onAction({ actionId, payload: input.payload }, panelContext(ctx))
        return result ?? { refresh: false }
      })

      logger.log(`[Plugin:${pluginId}] Registered workspace panel: ${panelId}`)
    },

    /**
     * 锚点块注册(R5.x)—— 与 registerWorkspacePanel 同构,只绑行为。
     *
     * (anchor, id) 必须匹配 manifest 的 contributes.uiSlots;render 返回的是同一套
     * 描述树协议(块只是"小面板",协议不因位置而分叉)。落地方式同样是把
     * render/onAction 挂到统一请求通道上(`ui:render:<anchor>:<id>` /
     * `ui:action:<anchor>:<id>`),免费继承超时预算、abort、progress 与熔断账。
     */
    registerUiSlot(registration: CorePluginUiSlotRegistration): void {
      if (rejectLateCall('registerUiSlot')) return
      const slotAnchor = String(registration?.anchor ?? '').trim()
      const slotId = String(registration?.id ?? '').trim()
      if (!slotAnchor || !slotId) {
        logger.error(`[Plugin:${pluginId}] registerUiSlot needs an anchor and an id`, undefined)
        return
      }
      // 未知锚点在这里是**代码错误**(与 manifest 层的"降级为 unsupported"不同:
      // 到了注册期,插件在代码里指名道姓要一个宿主没有的位置,没有歧义可容)。
      if (!isUiAnchor(slotAnchor)) {
        logger.error(
          `[Plugin:${pluginId}] registerUiSlot("${slotAnchor}") is refused: unknown anchor. `
          + 'Anchors are a host-defined set (UI_ANCHORS); a plugin cannot invent one.',
          undefined,
        )
        reportFailure(pluginScope.registration('UiSlot'), new Error(`unknown anchor "${slotAnchor}"`))
        return
      }
      const declared = options.declaredUiSlots ?? []
      if (!declared.some(slot => slot.anchor === slotAnchor && slot.id === slotId)) {
        logger.error(
          `[Plugin:${pluginId}] registerUiSlot("${slotId}") does not match any ui slot declared in `
          + `contributes.uiSlots for anchor "${slotAnchor}" (declared: ${
            declared.length ? declared.map(slot => `${slot.anchor}/${slot.id}`).join(', ') : 'none'
          }). Declare it in plugin.json first — the host renders the block from the manifest.`,
          undefined,
        )
        reportFailure(pluginScope.registration('UiSlot'), new Error(`undeclared ui slot "${slotId}"`))
        return
      }
      if (typeof registration.render !== 'function') {
        logger.error(`[Plugin:${pluginId}] registerUiSlot("${slotId}") needs a render function`, undefined)
        return
      }
      const address = uiSlotAddress(slotAnchor, slotId)
      if (requestHandlers.has(`${PLUGIN_UI_RENDER_ACTION}:${address}`)) {
        logger.error(
          `[Plugin:${pluginId}] registerUiSlot("${slotId}") was already registered; `
          + 'one manifest ui slot id binds exactly one implementation.',
          undefined,
        )
        reportFailure(pluginScope.registration('UiSlot'), new Error(`duplicate ui slot "${slotId}"`))
        return
      }

      const slotContext = (ctx: CorePluginRequestContext): CorePluginUiSlotContext => ({
        requestId: ctx.requestId,
        abortSignal: ctx.abortSignal,
        // 与面板同一条通知轨:panelId 字段带 `ui:<anchor>:<id>` 形式的 surface id,
        // renderer 按它与块对号入座。
        refresh: () => host.emitPanelRefresh?.(pluginId, uiSlotSurfaceId(slotAnchor, slotId)),
        anchor: slotAnchor,
        sessionId: null,
      })
      /** sessionId 由调用方(renderer)随 payload 传入 —— 宿主在会话切换时重拉。 */
      const withSession = (base: CorePluginUiSlotContext, payload: unknown): CorePluginUiSlotContext => {
        const raw = (payload as { sessionId?: unknown } | undefined)?.sessionId
        // messageId 同理(消息级锚点):宿主按消息实例挂载时随 payload 传入,
        // 会话级锚点不带这个字段。
        const rawMessageId = (payload as { messageId?: unknown } | undefined)?.messageId
        return {
          ...base,
          sessionId: typeof raw === 'string' && raw ? raw : null,
          ...(typeof rawMessageId === 'string' && rawMessageId ? { messageId: rawMessageId } : {}),
        }
      }

      requestHandlers.set(`${PLUGIN_UI_RENDER_ACTION}:${address}`, (payload, ctx) =>
        registration.render(withSession(slotContext(ctx), payload)))

      requestHandlers.set(`${PLUGIN_UI_INVOKE_ACTION}:${address}`, async (payload, ctx) => {
        if (!registration.onAction) return { refresh: false }
        const input = (payload ?? {}) as { actionId?: unknown; payload?: unknown }
        const actionId = String(input.actionId ?? '')
        if (!actionId) throw new Error(`Ui slot "${slotId}" received an action without an actionId`)
        const result = await registration.onAction(
          { actionId, payload: input.payload },
          withSession(slotContext(ctx), payload),
        )
        return result ?? { refresh: false }
      })

      logger.log(`[Plugin:${pluginId}] Registered ui slot: ${address}`)
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
          reportFailure(pluginScope.eventEmit(name), error)
          return
        }
        try {
          host.emitPluginEvent?.(pluginId, name, payload)
        } catch (error) {
          logger.error(`[Plugin:${pluginId}] events.emit failed:`, error)
          reportFailure(pluginScope.eventEmit(name), error)
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
        if (state.disposed && !state.disposing) {
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
        if (state.disposed && !state.disposing) {
          rejectLateCall('storage.exists')
          return false
        }
        return withStorageFailureReport('exists', () => requireStorage().exists(name))
      },
      /**
       * 消息作用域状态(plugin-message-state-2026-08)。**坐标随调用递交** ——
       * 宿主在这一刻收到 (sessionId, messageId),结构性归账,零语义解释。
       * 读写语义与 KV 同规:写面抛(配额/不可序列化)、拆除闩、熔断分车道。
       */
      message(sessionId: string, messageId: string) {
        return {
          readJson<T = unknown>(fallback?: T): T | undefined {
            if (state.disposed && !state.disposing) {
              rejectLateCall('storage.message.readJson')
              return fallback
            }
            return withStorageFailureReport('message.readJson', () =>
              requireMessageState().readJson<T>(sessionId, messageId, fallback))
          },
          writeJson(value: unknown): void {
            rejectDisposedWrite('message.writeJson')
            withStorageFailureReport('message.writeJson', () =>
              requireMessageState().writeJson(sessionId, messageId, value))
          },
          exists(): boolean {
            if (state.disposed && !state.disposing) {
              rejectLateCall('storage.message.exists')
              return false
            }
            return withStorageFailureReport('message.exists', () =>
              requireMessageState().exists(sessionId, messageId))
          },
        }
      },
    },
    scheduler,
    /**
     * 流状态(R6)。
     *
     * 纳入 disposed 闩:插件被拆除之后再 show 一条状态,等于在一个没人再会来
     * 清扫的账上挂东西 —— 停用之后气泡里多出一个永远转圈的指示器,而它的主人
     * 已经不在了。
     */
    status: {
      show(sessionId: string, status: { id: string; label: string }): void {
        if (rejectLateCall('status.show')) return
        const registry = options.statusRegistry
        if (!registry) return
        // 地址与账本键用**同一份** trim 过的值:一边 trim 一边不 trim 的话,
        // 状态会 show 到一个地址、clear 到另一个,谁也撤不下来。
        const address = String(sessionId ?? '').trim()
        const part = registry.show({
          pluginId,
          sessionId: address,
          id: String(status?.id ?? ''),
          label: String(status?.label ?? ''),
        })
        // null 表示"不必投递":被拒(不合法/不在流内/超配额)或纯粹没变化(频控)。
        // 一律不抛 —— 一个写错 label 的插件不该让它正在跑的那次调用失败。
        if (!part) {
          // 被合并窗压住的变化要让宿主排一次补发,否则最终状态会丢。
          host.notePluginStatusPending?.()
          return
        }
        host.emitPluginStatus?.(pluginId, address, part)
      },
      clear(sessionId: string, id: string): void {
        if (rejectLateCall('status.clear')) return
        const registry = options.statusRegistry
        if (!registry) return
        const address = String(sessionId ?? '').trim()
        const part = registry.clear({ pluginId, sessionId: address, id: String(id ?? '') })
        if (!part) return
        host.emitPluginStatus?.(pluginId, address, part)
      },
    },

    /**
     * IM 连接器(R7 试点)。
     *
     * 三件宿主的事都在这里:disposed 闩(拆除之后再注册 = 往一个没人再会来清扫的
     * 表里塞东西)、退订函数收进 disposeCallbacks(插件不调也能拆干净)、
     * 失败进熔断账(scope `connector`,策略表判为 degrade-surface —— 一条渠道
     * 坏掉不该放大成插件故障)。
     */
    registerIMConnector(connector: { id?: unknown }): () => void {
      if (rejectLateCall('registerIMConnector')) return () => {}
      const rawId = String(connector?.id ?? '').trim()
      if (!rawId) {
        logger.error(`[Plugin:${pluginId}] registerIMConnector needs a connector with an id`, undefined)
        // 注册期违规是**代码错误**,与未声明的 panel id 同构 —— 归 registration
        // 家族(阈值 1),不是运行期的 connector 家族。
        reportFailure(pluginScope.registration('IMConnector'), new Error('connector without an id'))
        return () => {}
      }
      // 命名空间与 registerTool 同构:插件不能占用一个全局 id,更不能顶掉别人的。
      const connectorId = `plugin:${pluginId}:${rawId}`
      let unregister: (() => void) | undefined
      try {
        unregister = host.registerIMConnector?.(pluginId, { ...connector, id: connectorId })
      } catch (error) {
        logger.error(`[Plugin:${pluginId}] registerIMConnector("${connectorId}") failed:`, error)
        reportFailure(pluginScope.registration('IMConnector'), error)
        return () => {}
      }
      if (!unregister) {
        // 宿主没接这条线(headless / server / CLI daemon —— §6 方案 A 下只有
        // 桌面宿主执行插件)。如实告诉插件它被忽略了,而不是假装成功。
        logger.log(`[Plugin:${pluginId}] IM connectors are not available on this host; "${connectorId}" was ignored`)
        return () => {}
      }
      let released = false
      const release = (): void => {
        if (released) return
        released = true
        try {
          unregister?.()
        } catch (error) {
          logger.error(`[Plugin:${pluginId}] Failed to unregister IM connector "${connectorId}":`, error)
        }
      }
      // 插件自己不调 release 也能拆干净 —— 拆除语义不建立在插件守规矩上。
      disposeCallbacks.push(release)
      logger.log(`[Plugin:${pluginId}] Registered IM connector: ${connectorId}`)
      return release
    },

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
