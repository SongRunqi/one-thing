/**
 * 插件运行期健康 —— 失败计数熔断的装配层落点。
 *
 * core 只提供机制(CorePluginHealthTracker),这里把它接到三样宿主设施上:
 * 自动禁用(走完整 disablePlugin/dispose)、ui.notify、以及插件信息里的
 * 健康字段(设置页据此亮红)。
 *
 * 为什么要熔断:加载期错误会写进 CorePluginInfo.error,**运行期**错误在此之前
 * 不进任何用户可见状态 —— 一个每回合都抛错的插件会一直显示 Active。
 */
import {
  CorePluginHealthTracker,
  type CorePluginRuntimeHealth,
  type PersistedPluginHealth,
} from '@onething/core/plugins'

export interface PluginHealthHost {
  /** 熔断时禁用插件(走完整 dispose)。 */
  disablePlugin(pluginId: string): void | Promise<void>
  /** 熔断时通知用户。 */
  notify(pluginId: string, message: string): void
  /**
   * 落盘"为什么被禁"。传 null 表示清账。
   * 存储细节归 manager(它才认识 plugin-settings),这里只声明需求。
   */
  persistHealth?(pluginId: string, health: PersistedPluginHealth | null): void
  /** 启动时回灌:上次跑的时候被熔断禁用的插件,重启后仍要能说明原因。 */
  loadPersistedHealth?(): Array<{ pluginId: string; health: PersistedPluginHealth }>
}

let host: PluginHealthHost | null = null

function toPersisted(health: CorePluginRuntimeHealth): PersistedPluginHealth | null {
  if (health.status !== 'disabled' && health.status !== 'degraded') return null
  return {
    status: health.status,
    lastError: health.lastError,
    lastErrorScope: health.lastErrorScope,
    lastErrorAt: health.lastErrorAt,
    disabledReason: health.disabledReason,
  }
}

const tracker = new CorePluginHealthTracker({
  onTrip(pluginId, health) {
    const reason = health.disabledReason ?? health.lastError ?? 'repeated runtime failures'
    console.error(`[PluginHealth] Auto-disabling plugin "${pluginId}": ${reason}`)
    try {
      host?.notify(pluginId, `Plugin "${pluginId}" was disabled automatically: ${reason}`)
    } catch (error) {
      console.error('[PluginHealth] notify failed:', error)
    }
    // 原因必须落盘:enabled:false 本来就持久化,原因不落盘的话重启后就成了
    // 一个用户没关过、又没有任何解释的关闭开关。
    try {
      host?.persistHealth?.(pluginId, toPersisted(health))
    } catch (error) {
      console.error(`[PluginHealth] Failed to persist health for "${pluginId}":`, error)
    }
    // 熔断禁用必须走完整的 disablePlugin —— 半禁用等于把注册表足迹留在原地。
    Promise.resolve(host?.disablePlugin(pluginId)).catch(error => {
      console.error(`[PluginHealth] Failed to auto-disable plugin "${pluginId}":`, error)
    })
  },
})

/** 启动时回灌上次的禁用原因。幂等。 */
export function restorePluginRuntimeHealth(): void {
  const persisted = host?.loadPersistedHealth?.() ?? []
  for (const { pluginId, health } of persisted) {
    tracker.restore(pluginId, {
      status: health.status,
      consecutiveFailures: 0,
      lastError: health.lastError,
      lastErrorScope: health.lastErrorScope,
      lastErrorAt: health.lastErrorAt,
      disabledReason: health.disabledReason,
    })
  }
}

/** 由 plugin manager 在 bootstrap 时接线(late-bound:core 不认识宿主)。 */
export function configurePluginHealthHost(next: PluginHealthHost | null): void {
  host = next
}

export function reportPluginRuntimeFailure(pluginId: string, scope: string, error: unknown): void {
  tracker.recordFailure(pluginId, scope, error)
}

export function reportPluginRuntimeSuccess(pluginId: string, scope: string): void {
  tracker.recordSuccess(pluginId, scope)
}

export function markPluginInstalling(pluginId: string): void {
  tracker.markInstalling(pluginId)
}

export function markPluginLoadError(pluginId: string, scope: string, error: unknown): void {
  tracker.markLoadError(pluginId, scope, error)
}

export function getPluginRuntimeHealth(pluginId: string): CorePluginRuntimeHealth | undefined {
  return tracker.get(pluginId)
}

export function listPluginRuntimeHealth(): Array<CorePluginRuntimeHealth & { pluginId: string }> {
  return tracker.list()
}

/** 显式启用(或手动停用)是一次清账:熔断状态与失败计数都不跨越它,盘上也清掉。 */
export function clearPluginRuntimeHealth(pluginId: string): void {
  tracker.clear(pluginId)
  try {
    host?.persistHealth?.(pluginId, null)
  } catch (error) {
    console.error(`[PluginHealth] Failed to clear persisted health for "${pluginId}":`, error)
  }
}

export function resetPluginRuntimeHealthForTests(): void {
  tracker.clearAll()
}

export type { CorePluginRuntimeHealth, PersistedPluginHealth }
