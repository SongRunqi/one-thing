import { describePluginConfigSchema, type PluginConfigField } from './config-schema.js'
import {
  describePluginWebviewPanelProblem,
  isEffectiveUiDrawerSlot,
  isIgnoredUiDrawerDeclaration,
  isUiAnchor,
  isPluginWebviewPanel,
} from '@onething/core/plugins'
import {
  resolvePluginThemeOverrides,
  type PluginThemeOverrideEntry,
} from './theme-overrides.js'

export interface OnethingPluginListManifestLike {
  name: string
  version: string
  description?: string
  author?: string
  minAppVersion?: string
  contributes?: {
    commands?: Array<{ name: string }>
    panels?: Array<{ id: string; label: string; view?: string; entry?: string }>
    uiSlots?: Array<{ anchor: string; id: string; label: string; lifetime?: string; drawer?: boolean }>
    theme?: { overrides?: Record<string, string> }
    webviewRoot?: string
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
}

/** 运行期健康(core 的 CorePluginRuntimeHealth 的结构镜像,过线只走 JSON)。 */
export interface OnethingPluginRuntimeHealthLike {
  status: string
  consecutiveFailures: number
  lastError?: string
  lastErrorScope?: string
  lastErrorAt?: number
  disabledReason?: string
  /** 降级中的界面(R7):只影响一个面板,插件其余能力照常。 */
  degradedSurfaces?: Array<{ surface: string; reason: string; at: number }>
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
  /**
   * manifest 声明的贡献点摘要(宪法第 3 条:声明先于代码)。
   * R2 只把它透出到设置页,消费者在 R3(settings)/R5(panels)。
   */
  contributes: {
    commands: string[]
    /**
     * 面板(R5)。C 期起逐条带形态与判决:
     * `view` 是 `'descriptor'` 或 `'webview'`;`unsupported` = 这条声明非法
     * (webview 缺 entry / entry 越界 / 静态根非法 / view 是个不认识的值),
     * 该面板**不渲染**,但设置页要能把 `reason` 说出来 —— 与未知锚点同规:
     * 降级不拒载,不计熔断。
     */
    panels: Array<{
      id: string
      label: string
      view: string
      entry: string
      unsupported: boolean
      reason: string
    }>
    /**
     * 锚点块(R5.x)。`unsupported` = 该条声明的锚点不在宿主清单里:
     * 块不渲染,但设置页要能把这件事说出来(前向兼容,见设计文档 §4.1)。
     *
     * `lifetime` 原样流出(plugin-message-state-2026-08 §3.2):它是消息态落盘的
     * **闸门声明**,装前确认页要据此告诉用户"这插件会在消息上留下持久内容"。
     * 不在这里归一成布尔 —— 市场索引那条路走的是未投影的 manifest 原文,
     * 两条路各判一次才是漂移的开始,判据只留在 renderer 的一个 helper 里。
     *
     * `drawer` 是 **裁决后的**抽屉形态(F 期):锚点开了抽屉能力 **且** 这条
     * 声明了 `drawer: true` 才为 true;别的锚点上声明它 → `drawer: false` +
     * `drawerIgnored: true`(该字段被忽略,插件照常加载)。判据在 core 的
     * `isEffectiveUiDrawerSlot`,renderer 不再判第二遍 —— 与未知锚点同规:
     * 一处裁决,两处消费。
     */
    uiSlots: Array<{
      anchor: string
      id: string
      label: string
      unsupported: boolean
      lifetime: string
      drawer: boolean
      drawerIgnored: boolean
    }>
    /**
     * 主题 token 覆盖(B 期)。逐条带裁决结果:
     * `active` 生效中 / `shadowed` 被规范顺序更后的插件压过 / `inactive` 插件未启用 /
     * `invalid` 键不在主题 token 表或值不过颜色白名单(丢弃,但要说得出来)。
     *
     * 裁决在投影里做而不是在设置页做:它依赖**全体插件**(谁压谁),
     * renderer 只拿到一个插件的卡片,自己判不出来;server 只读镜像走同一条
     * 投影 —— 声明透传,合成不发生在那一侧(方案 A)。
     */
    theme: PluginThemeOverrideEntry[]
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
  configFields: PluginConfigField[]
  configTitle: string
  configValues: Record<string, unknown>
  /** 声明了 settings schema 但超出宿主控件集时的逐条原因。 */
  configUnsupportedReasons: string[]
  /**
   * configValues 是"schema 默认值"而不是宿主真实存量。
   *
   * server 只读镜像没接取值器 —— 不标出来的话,用户会把默认值读成桌面真值。
   */
  configValuesAreDefaults: boolean
  /** 本宿主是否允许编辑配置(方案 A 下 server 侧为 false)。 */
  configEditable: boolean
  minAppVersion: string
  /** 'healthy' | 'degraded' | 'disabled';无健康记录时为 'healthy'。 */
  healthStatus: string
  healthFailures: number
  /** 运行期失败原因(熔断说明优先,其次最后一次错误)—— 设置页据此亮红。 */
  healthReason: string
  /**
   * 降级中的界面(R7)。
   *
   * 插件卡片要如实说"某个面板暂不可用",而不是把整体标成 Failed —— 用户主动
   * 触发的失败只连坐它自己那一个界面,插件的工具/命令/提示词照常。
   */
  degradedSurfaces: Array<{ surface: string; reason: string }>
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
  // 主题覆盖的冲突裁决要看**全体插件**,所以先整体算一遍再逐个投影。
  const themeResolution = resolvePluginThemeOverrides(plugins.map(plugin => ({
    pluginId: plugin.definition.id,
    enabled: plugin.definition.enabled,
    overrides: plugin.definition.manifest.contributes?.theme?.overrides,
  })))
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
    contributes: {
      commands: (plugin.definition.manifest.contributes?.commands ?? []).map(command => command.name),
      panels: (plugin.definition.manifest.contributes?.panels ?? []).map(panel => {
        const problem = describePluginWebviewPanelProblem(
          panel,
          plugin.definition.manifest.contributes?.webviewRoot,
        )
        return {
          id: panel.id,
          label: panel.label,
          // 非法声明一律按 descriptor 呈现形态报出去:renderer 不该拿一个
          // "自称 webview 但被丢弃"的条目去拼 iframe 的 src。
          view: !problem && isPluginWebviewPanel(panel) ? 'webview' : 'descriptor',
          entry: !problem && isPluginWebviewPanel(panel) ? String(panel.entry ?? '') : '',
          unsupported: Boolean(problem),
          reason: problem ?? '',
        }
      }),
      uiSlots: (plugin.definition.manifest.contributes?.uiSlots ?? []).map(slot => ({
        anchor: slot.anchor,
        id: slot.id,
        label: slot.label,
        unsupported: !isUiAnchor(slot.anchor),
        lifetime: slot.lifetime ?? '',
        drawer: isEffectiveUiDrawerSlot(slot.anchor, slot.drawer),
        drawerIgnored: isIgnoredUiDrawerDeclaration(slot.anchor, slot.drawer),
      })),
      theme: themeResolution.byPlugin.get(plugin.definition.id) ?? [],
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
    degradedSurfaces: (plugin.health?.degradedSurfaces ?? [])
      .map(entry => ({ surface: entry.surface, reason: entry.reason })),
  }))
}

function projectPluginConfig<TPlugin extends OnethingPluginListItemLike>(
  plugin: TPlugin,
  options: ProjectOnethingPluginsOptions,
): {
  configFields: PluginConfigField[]
  configTitle: string
  configValues: Record<string, unknown>
  configUnsupportedReasons: string[]
  configValuesAreDefaults: boolean
  configEditable: boolean
} {
  const editable = Boolean(options.getConfig)
  const settings = plugin.definition.manifest.contributes?.settings
  if (!settings?.schema) {
    return {
      configFields: [],
      configTitle: '',
      configValues: {},
      configUnsupportedReasons: [],
      configValuesAreDefaults: false,
      configEditable: editable,
    }
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
      configValuesAreDefaults: false,
      configEditable: editable,
    }
  }
  // 宿主没给取值器时(server 只读镜像)退回默认值:呈现要诚实,
  // 但不能因为拿不到值就把整个配置区藏起来 —— 所以退默认的同时把
  // configValuesAreDefaults 标出来,让 UI 说清楚"这不是桌面真值"。
  return {
    configFields: described.fields,
    configTitle: described.title || '',
    configValues: options.getConfig?.(plugin.definition.id)
      ?? Object.fromEntries(described.fields.map(field => [field.key, field.defaultValue])),
    configUnsupportedReasons: [],
    configValuesAreDefaults: !editable,
    configEditable: editable,
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
