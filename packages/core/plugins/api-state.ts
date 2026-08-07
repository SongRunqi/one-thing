import type { CorePluginRequestHandler } from './request-channel.js'

export interface CorePluginAPIState<TApi = unknown, TCommand = unknown> {
  api: TApi
  unsubs: Array<() => void>
  commands: Map<string, TCommand>
  /** action → handler(统一请求通道的分发表,按插件私有)。 */
  requestHandlers: Map<string, CorePluginRequestHandler>
  toolIds: string[]
  skillRootUnsubs: Array<() => void>
  promptContextUnsubs: Array<() => void>
  lifecycleUnsubs: Array<() => void>
  /** api.settings.onChange 的退订(R3)。 */
  configUnsubs: Array<() => void>
  disposeCallbacks: Array<() => void>
  /**
   * 晚到注册闸(由 disposeCorePluginState 置位)。
   *
   * dispose 只是把已注册的东西撤掉,它管不住"之后还来注册"。entry 超时被拆掉
   * 的插件恢复过来再调 api.registerTool,注册会真的生效,而这份 state 已经不在
   * pluginStates 里 —— 那个工具从此没有任何人能回收。置位后 api 的全部注册入口
   * no-op。
   */
  disposed?: boolean
  /**
   * 正在跑 onDispose 回调。
   *
   * 这段窗口里**写面照常放行**:插件最自然的收尾写法就是在 onDispose 里存盘,
   * 而 disposed 闩先落的话那次写入会被拒、数据静默丢失,报的错还是"插件已拆除"
   * 这种误导性诊断。内置插件恰好只在 onDispose 里关流,所以全套测试都是绿的 ——
   * 这条只有第三方插件会踩。
   *
   * 它**不**放行注册面:dispose 期间再注册工具仍然无人回收。
   */
  disposing?: boolean
}

export interface DisposeCorePluginStateOptions {
  unregisterTool?: (toolId: string) => void
}

function runCleanup(callback: () => void): void {
  try {
    callback()
  } catch {
    // Plugin cleanup must be best-effort; one failing cleanup must not block the rest.
  }
}

function drainCallbacks(callbacks: Array<() => void>): void {
  for (const callback of callbacks.splice(0)) {
    runCleanup(callback)
  }
}

export function disposeCorePluginState<TApi, TCommand>(
  state: CorePluginAPIState<TApi, TCommand>,
  options: DisposeCorePluginStateOptions = {},
): void {
  /*
   * 注册闩先落,**写面留到 onDispose 跑完之后再关**。
   *
   * 两件事必须分开:
   *  - 注册面(registerTool / registerCommand / …)从这一刻起 no-op —— 拆除之后
   *    再注册的东西没有任何人能回收,这是闩存在的理由;
   *  - 写面(storage / store)在 onDispose 期间仍要能用 —— "收尾时把状态存下来"
   *    是插件最自然的写法,拒掉它等于让插件静默丢数据。
   */
  state.disposed = true
  state.disposing = true
  try {
    drainCallbacks(state.disposeCallbacks)
  } finally {
    state.disposing = false
  }

  for (const toolId of state.toolIds.splice(0)) {
    if (options.unregisterTool) {
      runCleanup(() => options.unregisterTool!(toolId))
    }
  }

  drainCallbacks(state.promptContextUnsubs)
  drainCallbacks(state.lifecycleUnsubs)
  drainCallbacks(state.skillRootUnsubs)
  drainCallbacks(state.configUnsubs)
  drainCallbacks(state.unsubs)

  state.commands.clear()
  state.requestHandlers.clear()
}
