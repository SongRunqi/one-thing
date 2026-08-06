import { describePluginConfigSchema } from './config-schema.js'

export interface OnethingPluginListManifestLike {
  name: string
  version: string
  description?: string
  author?: string
  minAppVersion?: string
  contributes?: {
    commands?: Array<{ name: string }>
    panels?: Array<{ id: string; label: string }>
    settings?: {
      title?: string
      schema?: Record<string, unknown>
      ui?: Record<string, { label?: string; hint?: string; control?: string }>
    }
    permissions?: string[]
    activation?: { events?: string[] }
  }
}

export interface OnethingPluginListDefinitionLike {
  id: string
  source?: string
  manifest: OnethingPluginListManifestLike
  enabled: boolean
  dirPath: string
  needsInstall?: boolean
}

/** 运行期健康(core 的 CorePluginRuntimeHealth 的结构镜像,过线只走 JSON)。 */
export interface OnethingPluginRuntimeHealthLike {
  status: string
  consecutiveFailures: number
  lastError?: string
  lastErrorScope?: string
  lastErrorAt?: number
  disabledReason?: string
}

export interface OnethingPluginListItemLike {
  definition: OnethingPluginListDefinitionLike
  loaded: boolean
  commands: string[]
  error?: string
  health?: OnethingPluginRuntimeHealthLike
}

export interface ProjectOnethingPluginsOptions {
  /** 每个插件当前登记的请求 action(来自 manager 的活状态,不是 manifest)。 */
  getRequestActions?(pluginId: string): string[]
  /** 已校验、已填默认值的有效配置(宿主持有;未启用的插件也有)。 */
  getConfig?(pluginId: string): Record<string, unknown>
}

export interface OnethingRendererPluginInfo {
  id: string
  source: string
  name: string
  version: string
  description: string
  author: string
  loaded: boolean
  enabled: boolean
  commands: string[]
  error: string
  dirPath: string
  needsInstall: boolean
  /**
   * manifest 声明的贡献点摘要(宪法第 3 条:声明先于代码)。
   * R2 只把它透出到设置页,消费者在 R3(settings)/R5(panels)。
   */
  contributes: {
    commands: string[]
    panels: Array<{ id: string; label: string }>
    hasSettingsSchema: boolean
    permissions: string[]
    activationEvents: string[]
  }
  /** 插件登记的请求通道 action 列表。 */
  requestActions: string[]
  /**
   * 配置区的渲染材料(R3)。schema 单源在 manifest,归约成控件表在产品层 ——
   * renderer 不自己解 JSON Schema,两端各写一份解析器就是漂移的开始。
   */
  configFields: OnethingPluginConfigFieldLike[]
  configTitle: string
  configValues: Record<string, unknown>
  /** 声明了 settings schema 但超出宿主控件集时的逐条原因。 */
  configUnsupportedReasons: string[]
  minAppVersion: string
  /** 'healthy' | 'installing' | 'degraded' | 'disabled';无健康记录时为 'healthy'。 */
  healthStatus: string
  healthFailures: number
  /** 运行期失败原因(熔断说明优先,其次最后一次错误)—— 设置页据此亮红。 */
  healthReason: string
}

export interface OnethingPluginCommandLike {
  name: string
  description?: string
  usage?: string
}

export interface OnethingRendererPluginCommandInfo {
  id: string
  name: string
  description: string
  usage: string
}

export function projectOnethingPluginsForRenderer<TPlugin extends OnethingPluginListItemLike>(
  plugins: TPlugin[],
  options: ProjectOnethingPluginsOptions = {},
): OnethingRendererPluginInfo[] {
  return plugins.map(plugin => ({
    id: plugin.definition.id,
    source: plugin.definition.source || 'user',
    name: plugin.definition.manifest.name,
    version: plugin.definition.manifest.version,
    description: plugin.definition.manifest.description || '',
    author: plugin.definition.manifest.author || '',
    loaded: plugin.loaded,
    enabled: plugin.definition.enabled,
    commands: plugin.commands,
    error: plugin.error || '',
    dirPath: plugin.definition.dirPath,
    needsInstall: plugin.definition.needsInstall || false,
    contributes: {
      commands: (plugin.definition.manifest.contributes?.commands ?? []).map(command => command.name),
      panels: (plugin.definition.manifest.contributes?.panels ?? []).map(panel => ({
        id: panel.id,
        label: panel.label,
      })),
      hasSettingsSchema: Boolean(plugin.definition.manifest.contributes?.settings?.schema),
      permissions: plugin.definition.manifest.contributes?.permissions ?? [],
      activationEvents: plugin.definition.manifest.contributes?.activation?.events ?? [],
    },
    requestActions: options.getRequestActions?.(plugin.definition.id) ?? [],
    ...projectPluginConfig(plugin, options),
    minAppVersion: plugin.definition.manifest.minAppVersion || '',
    healthStatus: plugin.health?.status || 'healthy',
    healthFailures: plugin.health?.consecutiveFailures || 0,
    healthReason: plugin.health?.disabledReason
      || (plugin.health?.lastError
        ? `${plugin.health.lastErrorScope ? `${plugin.health.lastErrorScope}: ` : ''}${plugin.health.lastError}`
        : ''),
  }))
}

export interface OnethingPluginConfigFieldLike {
  key: string
  control: 'switch' | 'text' | 'number' | 'select' | 'string-list'
  label: string
  hint?: string
  required: boolean
  options?: string[]
  minimum?: number
  maximum?: number
  integer?: boolean
  defaultValue: unknown
}

function projectPluginConfig<TPlugin extends OnethingPluginListItemLike>(
  plugin: TPlugin,
  options: ProjectOnethingPluginsOptions,
): {
  configFields: OnethingPluginConfigFieldLike[]
  configTitle: string
  configValues: Record<string, unknown>
  configUnsupportedReasons: string[]
} {
  const settings = plugin.definition.manifest.contributes?.settings
  if (!settings?.schema) {
    return { configFields: [], configTitle: '', configValues: {}, configUnsupportedReasons: [] }
  }
  const described = describePluginConfigSchema(settings.schema, {
    title: settings.title,
    ui: settings.ui,
  })
  if (!described.supported) {
    return {
      configFields: [],
      configTitle: settings.title || '',
      configValues: {},
      configUnsupportedReasons: described.reasons,
    }
  }
  return {
    configFields: described.fields,
    configTitle: described.title || '',
    // 宿主没给取值器时(server 只读镜像)退回默认值:呈现要诚实,
    // 但不能因为拿不到值就把整个配置区藏起来。
    configValues: options.getConfig?.(plugin.definition.id)
      ?? Object.fromEntries(described.fields.map(field => [field.key, field.defaultValue])),
    configUnsupportedReasons: [],
  }
}

export function projectOnethingPluginCommandsForRenderer<TCommand extends OnethingPluginCommandLike>(
  commands: Iterable<TCommand>,
): OnethingRendererPluginCommandInfo[] {
  return Array.from(commands).map(command => ({
    id: command.name.replace(/^\//, ''),
    name: command.name,
    description: command.description || 'Plugin command',
    usage: command.usage || command.name,
  }))
}
