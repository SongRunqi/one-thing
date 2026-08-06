/**
 * 插件自有配置的宿主侧(R3)。
 *
 * schema 的唯一事实源是 manifest 的 `contributes.settings.schema` —— 存储、校验、
 * 默认值填充、变更推送全由宿主做,**不执行一行插件代码**。直接的红利:
 * 未启用(甚至从没加载过)的插件也能在设置页配置。
 */
import {
  CORE_PLUGIN_SETTINGS_HOOK_TIMEOUT_MS,
  runWithPluginTimeout,
} from '@onething/core/plugins'
import {
  coercePluginConfig,
  describePluginConfigSchema,
  type PluginConfigField,
  type PluginConfigSchemaDescription,
} from '@onething/runtime/plugins'
import {
  reportPluginRuntimeFailure,
  reportPluginRuntimeSuccess,
} from './health.js'

export interface PluginConfigHost {
  /** manifest 的 contributes.settings(schema 单源)。 */
  getSettingsContribution(pluginId: string): {
    title?: string
    schema?: Record<string, unknown>
    ui?: Record<string, { label?: string; hint?: string; control?: string }>
  } | undefined
  readConfig(pluginId: string): Record<string, unknown>
  writeConfig(pluginId: string, config: Record<string, unknown> | null): void
}

let host: PluginConfigHost | null = null

export function configurePluginConfigHost(next: PluginConfigHost | null): void {
  host = next
}

const listeners = new Map<string, Set<(config: Record<string, unknown>) => void>>()
/** 已经就"读到坏值"吼过的插件,免得每次读都刷屏。 */
const warnedPlugins = new Set<string>()

export function describePluginConfig(pluginId: string): PluginConfigSchemaDescription | null {
  const contribution = host?.getSettingsContribution(pluginId)
  if (!contribution?.schema) return null
  return describePluginConfigSchema(contribution.schema, {
    title: contribution.title,
    ui: contribution.ui,
  })
}

function fieldsOf(pluginId: string): PluginConfigField[] | null {
  const described = describePluginConfig(pluginId)
  return described && described.supported ? described.fields : null
}

/**
 * 已校验、已填默认值的有效配置。
 *
 * schema 缺失或不受支持 → 返回盘上原样(没有 schema 就没有契约可执行),
 * 让调用方自己决定怎么呈现。
 */
export function getEffectivePluginConfig(pluginId: string): Record<string, unknown> {
  const stored = host?.readConfig(pluginId) ?? {}
  const fields = fieldsOf(pluginId)
  if (!fields) return { ...stored }

  const result = coercePluginConfig(fields, stored)
  if (result.warnings.length > 0 && !warnedPlugins.has(pluginId)) {
    warnedPlugins.add(pluginId)
    console.warn(
      `[PluginConfig] Stored config for "${pluginId}" has invalid values; using defaults for them:\n  `
      + result.warnings.join('\n  '),
    )
  }
  return result.config
}

export interface SetPluginConfigResult {
  success: boolean
  config?: Record<string, unknown>
  errors?: string[]
}

/**
 * 写入配置。
 *
 * 顺序是 **校验 → 持久化 → 通知**:通知是插件代码,它挂了不能把已经通过校验的
 * 配置写丢(第 6 条软隔离的字面要求)。
 */
export function setPluginConfig(pluginId: string, input: unknown): SetPluginConfigResult {
  if (!host) return { success: false, errors: ['Plugin config host is not configured'] }

  const described = describePluginConfig(pluginId)
  if (!described) {
    return { success: false, errors: [`Plugin "${pluginId}" does not declare contributes.settings.schema`] }
  }
  if (!described.supported) {
    return { success: false, errors: described.reasons }
  }

  const result = coercePluginConfig(described.fields, input)
  if (result.errors.length > 0) {
    return { success: false, errors: result.errors }
  }

  host.writeConfig(pluginId, result.config)
  warnedPlugins.delete(pluginId)
  void notifyPluginConfigChange(pluginId, result.config)

  return { success: true, config: result.config }
}

/** 插件侧 api.settings.onChange 的登记口。 */
export function subscribePluginConfigChange(
  pluginId: string,
  callback: (config: Record<string, unknown>) => void,
): () => void {
  const set = listeners.get(pluginId) ?? new Set()
  set.add(callback)
  listeners.set(pluginId, set)
  return () => {
    set.delete(callback)
    if (set.size === 0) listeners.delete(pluginId)
  }
}

/**
 * 推送变更 —— onChange 回调是**插件代码**,纳入软隔离。
 *
 * 每个回调各带超时预算,失败/超时进 R1 的熔断账(scope `settings:onChange`),
 * 而且一律不影响配置保存本身:保存早就在这之前完成了。
 */
export async function notifyPluginConfigChange(
  pluginId: string,
  config: Record<string, unknown>,
): Promise<void> {
  const set = listeners.get(pluginId)
  if (!set || set.size === 0) return

  const snapshot = Object.freeze({ ...config })
  for (const callback of [...set]) {
    try {
      await runWithPluginTimeout(
        `settings.onChange:${pluginId}`,
        CORE_PLUGIN_SETTINGS_HOOK_TIMEOUT_MS,
        () => callback(snapshot),
      )
      reportPluginRuntimeSuccess(pluginId, 'settings:onChange')
    } catch (error) {
      console.error(`[PluginConfig] onChange failed for "${pluginId}":`, error)
      reportPluginRuntimeFailure(pluginId, 'settings:onChange', error)
    }
  }
}

export function resetPluginConfigListenersForTests(): void {
  listeners.clear()
  warnedPlugins.clear()
}
