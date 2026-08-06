/**
 * 插件软隔离原语:超时预算 + 失败熔断 + 运行期健康状态。
 *
 * 设计文档 §3.1 的结论:异常层面的 catch 早就是齐的,真正的故障面是**挂起、慢
 * 与不可见**——一个不 resolve 的 promptContextProvider 会把所有会话的发消息热
 * 路径永久钉死,而插件卡片仍然显示 Active。
 *
 * 这里只放机制(零依赖纯 TS,四个宿主共享),接线在 app 层。
 */

/** 提示词装配是每次发消息的热路径,预算必须小。 */
export const CORE_PLUGIN_PROMPT_CONTEXT_TIMEOUT_MS = 5_000
/** 上下文压缩 / 回合结束钩子。 */
export const CORE_PLUGIN_LIFECYCLE_HOOK_TIMEOUT_MS = 5_000
/** 插件 entry(api):注册期可以慢一点,但不能无限。 */
export const CORE_PLUGIN_ENTRY_TIMEOUT_MS = 10_000
/** 连续失败到这个数就自动禁用。 */
export const CORE_PLUGIN_FAILURE_THRESHOLD = 3

export class CorePluginTimeoutError extends Error {
  constructor(
    readonly label: string,
    readonly timeoutMs: number,
  ) {
    super(`Plugin call "${label}" exceeded ${timeoutMs}ms`)
    this.name = 'CorePluginTimeoutError'
  }
}

export function isCorePluginTimeoutError(error: unknown): error is CorePluginTimeoutError {
  return error instanceof CorePluginTimeoutError
}

/**
 * 给一次插件调用套超时预算。
 *
 * 超时**不取消**插件那一侧的工作(JS 里没法真正杀掉一个 promise),它保证的是
 * 宿主这一侧不再等下去——先例是权限 120s 降级。
 */
export async function runWithPluginTimeout<T>(
  label: string,
  timeoutMs: number,
  run: () => T | Promise<T>,
): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return await run()
  }

  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      (async () => run())(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new CorePluginTimeoutError(label, timeoutMs)), timeoutMs)
        // 别让守卫计时器把进程钉住(CLI daemon / server 退出时尤为要紧)。
        ;(timer as unknown as { unref?: () => void }).unref?.()
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export type CorePluginHealthStatus = 'healthy' | 'installing' | 'degraded' | 'disabled'

export interface CorePluginRuntimeHealth {
  status: CorePluginHealthStatus
  consecutiveFailures: number
  lastError?: string
  lastErrorScope?: string
  lastErrorAt?: number
  disabledReason?: string
}

export interface CorePluginHealthTrackerOptions {
  threshold?: number
  now?: () => number
  /** 熔断时回调一次(只回调一次,直到该插件被重新启用)。 */
  onTrip?(pluginId: string, health: CorePluginRuntimeHealth): void
}

function describePluginError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'string' && error) return error
  return 'Unknown error'
}

/**
 * 运行期失败计数与熔断。
 *
 * 计的是**连续**失败:一次成功就清零,免得一个偶发超时在几天后累加成禁用。
 */
export class CorePluginHealthTracker {
  private readonly health = new Map<string, CorePluginRuntimeHealth>()
  private readonly threshold: number
  private readonly now: () => number

  constructor(private readonly options: CorePluginHealthTrackerOptions = {}) {
    this.threshold = options.threshold ?? CORE_PLUGIN_FAILURE_THRESHOLD
    this.now = options.now ?? (() => Date.now())
  }

  get(pluginId: string): CorePluginRuntimeHealth | undefined {
    const entry = this.health.get(pluginId)
    return entry ? { ...entry } : undefined
  }

  list(): Array<CorePluginRuntimeHealth & { pluginId: string }> {
    return [...this.health.entries()].map(([pluginId, value]) => ({ pluginId, ...value }))
  }

  recordFailure(pluginId: string, scope: string, error: unknown): CorePluginRuntimeHealth {
    const previous = this.health.get(pluginId)
    const consecutiveFailures = (previous?.consecutiveFailures ?? 0) + 1
    const alreadyDisabled = previous?.status === 'disabled'
    const tripped = !alreadyDisabled && consecutiveFailures >= this.threshold
    const next: CorePluginRuntimeHealth = {
      status: alreadyDisabled ? 'disabled' : tripped ? 'disabled' : 'degraded',
      consecutiveFailures,
      lastError: describePluginError(error),
      lastErrorScope: scope,
      lastErrorAt: this.now(),
      disabledReason: alreadyDisabled
        ? previous?.disabledReason
        : tripped
          ? `${consecutiveFailures} consecutive failures (last: ${scope} — ${describePluginError(error)})`
          : undefined,
    }
    this.health.set(pluginId, next)

    if (tripped) {
      this.options.onTrip?.(pluginId, { ...next })
    }
    return { ...next }
  }

  recordSuccess(pluginId: string): void {
    const previous = this.health.get(pluginId)
    if (!previous || previous.status === 'disabled') return
    if (previous.consecutiveFailures === 0 && previous.status === 'healthy') return
    this.health.set(pluginId, {
      ...previous,
      status: 'healthy',
      consecutiveFailures: 0,
      disabledReason: undefined,
    })
  }

  markInstalling(pluginId: string): void {
    const previous = this.health.get(pluginId)
    this.health.set(pluginId, {
      ...previous,
      status: 'installing',
      consecutiveFailures: previous?.consecutiveFailures ?? 0,
    })
  }

  markLoadError(pluginId: string, scope: string, error: unknown): void {
    const previous = this.health.get(pluginId)
    this.health.set(pluginId, {
      status: previous?.status === 'disabled' ? 'disabled' : 'degraded',
      consecutiveFailures: previous?.consecutiveFailures ?? 0,
      lastError: describePluginError(error),
      lastErrorScope: scope,
      lastErrorAt: this.now(),
      disabledReason: previous?.disabledReason,
    })
  }

  /** 重新启用时清账:熔断状态与失败计数都不该跨越一次显式启用。 */
  clear(pluginId: string): void {
    this.health.delete(pluginId)
  }

  clearAll(): void {
    this.health.clear()
  }
}
