export interface CorePluginAPIState<TApi = unknown, TCommand = unknown> {
  api: TApi
  unsubs: Array<() => void>
  commands: Map<string, TCommand>
  toolIds: string[]
  skillRootUnsubs: Array<() => void>
  promptContextUnsubs: Array<() => void>
  lifecycleUnsubs: Array<() => void>
  disposeCallbacks: Array<() => void>
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
  drainCallbacks(state.disposeCallbacks)

  for (const toolId of state.toolIds.splice(0)) {
    if (options.unregisterTool) {
      runCleanup(() => options.unregisterTool!(toolId))
    }
  }

  drainCallbacks(state.promptContextUnsubs)
  drainCallbacks(state.lifecycleUnsubs)
  drainCallbacks(state.skillRootUnsubs)
  drainCallbacks(state.unsubs)

  state.commands.clear()
}
