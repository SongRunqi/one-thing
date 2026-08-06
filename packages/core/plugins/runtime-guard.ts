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
/** npm install 那一段的独立预算(装依赖本来就是分钟级的事)。 */
export const CORE_PLUGIN_INSTALL_TIMEOUT_MS = 120_000
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

interface PluginHealthEntry {
  /** 每条车道各记各的连败数。 */
  scopes: Map<string, number>
  status: CorePluginHealthStatus
  lastError?: string
  lastErrorScope?: string
  lastErrorAt?: number
  disabledReason?: string
}

/**
 * 运行期失败计数与熔断。
 *
 * **计数键是 pluginId + scope,不是 pluginId。** 插件级混算有两个反向的坏处:
 *  - 一个每回合都成功的 afterAssistantResponse 钩子会不停清掉同一插件里那个
 *    挂死的 promptContextProvider 的失败计数 —— R1 的头号目标场景永不熔断;
 *  - 一个纯事件插件的偶发错误会跨天累加,最后被误禁。
 * 所以:**某一 scope 连败达阈**即触发**插件级**熔断(插件是启停的单位),
 * 而一次成功只清同 scope 的账。
 */
export class CorePluginHealthTracker {
  private readonly health = new Map<string, PluginHealthEntry>()
  private readonly threshold: number
  private readonly now: () => number

  constructor(private readonly options: CorePluginHealthTrackerOptions = {}) {
    this.threshold = options.threshold ?? CORE_PLUGIN_FAILURE_THRESHOLD
    this.now = options.now ?? (() => Date.now())
  }

  get(pluginId: string): CorePluginRuntimeHealth | undefined {
    const entry = this.health.get(pluginId)
    return entry ? this.project(entry) : undefined
  }

  list(): Array<CorePluginRuntimeHealth & { pluginId: string }> {
    return [...this.health.entries()].map(([pluginId, entry]) => ({ pluginId, ...this.project(entry) }))
  }

  recordFailure(pluginId: string, scope: string, error: unknown): CorePluginRuntimeHealth {
    const entry = this.health.get(pluginId) ?? { scopes: new Map<string, number>(), status: 'healthy' as CorePluginHealthStatus }
    const scopeFailures = (entry.scopes.get(scope) ?? 0) + 1
    entry.scopes.set(scope, scopeFailures)

    const alreadyDisabled = entry.status === 'disabled'
    const tripped = !alreadyDisabled && scopeFailures >= this.threshold

    entry.status = alreadyDisabled || tripped ? 'disabled' : 'degraded'
    entry.lastError = describePluginError(error)
    entry.lastErrorScope = scope
    entry.lastErrorAt = this.now()
    if (tripped) {
      entry.disabledReason = `${scopeFailures} consecutive failures in ${scope} (last: ${describePluginError(error)})`
    }
    this.health.set(pluginId, entry)

    const projected = this.project(entry)
    if (tripped) {
      this.options.onTrip?.(pluginId, projected)
    }
    return projected
  }

  /**
   * 只清 `scope` 这一条车道。
   *
   * 高频路径(每次发消息的 promptContext、每个事件 handler)都会调它,所以
   * 快路径必须零分配:从没失败过的插件在这里直接返回。
   */
  recordSuccess(pluginId: string, scope: string): void {
    const entry = this.health.get(pluginId)
    if (!entry || entry.status === 'disabled') return
    if (!entry.scopes.get(scope)) return

    entry.scopes.set(scope, 0)
    if ([...entry.scopes.values()].every(count => count === 0)) {
      entry.status = entry.status === 'installing' ? 'installing' : 'healthy'
      entry.disabledReason = undefined
    }
  }

  markInstalling(pluginId: string): void {
    const entry = this.health.get(pluginId) ?? { scopes: new Map<string, number>(), status: 'healthy' as CorePluginHealthStatus }
    entry.status = 'installing'
    this.health.set(pluginId, entry)
  }

  markLoadError(pluginId: string, scope: string, error: unknown): void {
    const entry = this.health.get(pluginId) ?? { scopes: new Map<string, number>(), status: 'healthy' as CorePluginHealthStatus }
    if (entry.status !== 'disabled') entry.status = 'degraded'
    entry.lastError = describePluginError(error)
    entry.lastErrorScope = scope
    entry.lastErrorAt = this.now()
    this.health.set(pluginId, entry)
  }

  /**
   * 回灌(重启后从盘上读回禁用原因)。
   *
   * 只恢复"说明为什么被禁"的那部分,不恢复计数 —— 计数是本次进程的连败观察,
   * 跨重启累加没有意义。
   */
  restore(pluginId: string, health: CorePluginRuntimeHealth): void {
    this.health.set(pluginId, {
      scopes: new Map<string, number>(),
      status: health.status,
      lastError: health.lastError,
      lastErrorScope: health.lastErrorScope,
      lastErrorAt: health.lastErrorAt,
      disabledReason: health.disabledReason,
    })
  }

  /** 重新启用时清账:熔断状态与失败计数都不该跨越一次显式启用。 */
  clear(pluginId: string): void {
    this.health.delete(pluginId)
  }

  clearAll(): void {
    this.health.clear()
  }

  private project(entry: PluginHealthEntry): CorePluginRuntimeHealth {
    let worst = 0
    for (const count of entry.scopes.values()) {
      if (count > worst) worst = count
    }
    return {
      status: entry.status,
      consecutiveFailures: worst,
      lastError: entry.lastError,
      lastErrorScope: entry.lastErrorScope,
      lastErrorAt: entry.lastErrorAt,
      disabledReason: entry.disabledReason,
    }
  }
}
