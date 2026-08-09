/**
 * 插件主题 token 覆盖的**装配接线**(B 期,L2)。
 *
 * 分工:
 *  - core 给安全判据(颜色白名单)与全局规范顺序;
 *  - 产品层 `@onething/runtime/plugins/theme-overrides` 给纯裁决(键白名单 =
 *    `CSS_VAR_MAP`、后者胜、token → CSS 变量展开);
 *  - **这里**只做一件事:把"当前活着的插件清单"喂给裁决,给宿主一张可以直接
 *    叠在主题产出之上的变量表。
 *
 * 为什么没有缓存:唯一的数据源是插件管理器的**内存清单**(`getPlugins()`),
 * enable/disable/install/uninstall 一改它就变。再缓存一层等于给自己造一个需要
 * 失效的副本 —— 而合成只发生在 applyTheme 这种低频调用上,重算一次是几十条
 * manifest 的遍历。"缓存失效"最强的实现是没有缓存。
 */
import { getPluginManager } from './manager.js'
import {
  resolvePluginThemeOverrides,
  type PluginThemeOverrideEntry,
  type PluginThemeOverrideInput,
} from '@onething/runtime/plugins/theme-overrides'

export interface PluginThemeOverrideTable {
  /** 可直接叠在主题产出上的 CSS 变量表(已按规范顺序裁决完冲突)。 */
  cssVariables: Record<string, string>
  /** 逐插件裁决明细(设置页卡片用)。 */
  byPlugin: Map<string, PluginThemeOverrideEntry[]>
}

const EMPTY_TABLE: PluginThemeOverrideTable = { cssVariables: {}, byPlugin: new Map() }

/**
 * 从插件管理器读取覆盖声明。
 *
 * 只读 manifest —— **一行插件代码都不执行**(宪法第 3 条:声明先于代码)。
 * 启用闸门交给裁决层:停用的插件声明照样投影出来(卡片要看得见),
 * 但不参与合成。
 */
function collectThemeOverrideInputs(): PluginThemeOverrideInput[] {
  const manager = getPluginManager()
  if (!manager) return []
  return manager.getPlugins().map(plugin => ({
    pluginId: plugin.definition.id,
    enabled: plugin.definition.enabled,
    overrides: plugin.definition.manifest.contributes?.theme?.overrides,
  }))
}

/** 当前生效的插件主题覆盖表。插件系统没装配起来时是空表(而不是抛)。 */
export function getPluginThemeOverrideTable(): PluginThemeOverrideTable {
  const inputs = collectThemeOverrideInputs()
  if (!inputs.length) return EMPTY_TABLE
  return resolvePluginThemeOverrides(inputs)
}

/**
 * 主题产出 ⊕ 插件覆盖 —— 宿主把主题变量发给 renderer 之前的最后一步。
 *
 * 覆盖叠在"当前主题产出"之上,所以主题切换时天然保留(新主题算出新表,
 * 这一层照样往上叠),不需要任何额外状态。停用/卸载后表里就没有这条了,
 * 下一次下发 `:root` 自动回到主题原值 —— 这就是拆除语义。
 */
export function applyPluginThemeOverrides(
  themeVariables: Record<string, string>,
): Record<string, string> {
  const { cssVariables } = getPluginThemeOverrideTable()
  if (!Object.keys(cssVariables).length) return themeVariables
  return { ...themeVariables, ...cssVariables }
}
