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
  // 闩先落:dispose 过程中(以及此后任何时刻)插件再来注册一律 no-op。
  state.disposed = true

  drainCallbacks(state.disposeCallbacks)

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
