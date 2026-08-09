/**
 * 插件主题 token 覆盖的**裁决层**(B 期,L2)。
 *
 * 住在产品层是因为它需要两样东西:core 的安全判据(颜色白名单)与主题的
 * token 表(`CSS_VAR_MAP`)。产品层 → 产品层是合法方向;主题模块本身零改动
 * (`generateCSSVariables` 一行没动),覆盖是叠在它**产出之上**的一层。
 *
 * 这里只做纯函数裁决,不碰插件管理器、不碰宿主 IPC:
 *  - 键必须 ∈ `CSS_VAR_MAP` 的键集合(**白名单就是这张表本身**,不另抄一份 ——
 *    抄一份就一定会漂移);
 *  - 值必须过 core 的颜色字面量白名单;
 *  - 冲突按**全局规范顺序后者胜**(core 的 `comparePluginCanonicalOrder`,
 *    与锚点块排列同一出处);
 *  - 非法条目**不拒载**,只是被标成 `invalid` 让设置页说得出来(与未知锚点同规)。
 */
import {
  comparePluginCanonicalOrder,
  isPluginThemeColorValue,
  normalizePluginThemeColorValue,
} from '@onething/core/plugins'
import { CSS_VAR_MAP } from '../themes/css-mapper.js'

/** 一条覆盖声明在裁决后的状态。 */
export type PluginThemeOverrideStatus =
  /** 生效中:这条覆盖此刻正写在 `:root` 上。 */
  | 'active'
  /** 被更后者压过:合法,但同一 token 有个规范顺序更靠后的插件也覆盖了。 */
  | 'shadowed'
  /** 插件未启用:声明还在,但不参与合成。 */
  | 'inactive'
  /** 键不在主题 token 表 / 值不是允许的颜色字面量 —— 丢弃。 */
  | 'invalid'

export type PluginThemeOverrideInvalidReason = 'unknown-token' | 'invalid-color'

export interface PluginThemeOverrideEntry {
  token: string
  value: string
  status: PluginThemeOverrideStatus
  /** status === 'invalid' 时的逐条原因。 */
  reason?: PluginThemeOverrideInvalidReason
  /** status === 'shadowed' 时压过它的那个插件 id。 */
  shadowedBy?: string
}

export interface PluginThemeOverrideInput {
  pluginId: string
  enabled: boolean
  overrides?: Record<string, string>
}

export interface PluginThemeOverrideResolution {
  /** 逐插件的裁决结果(键 = pluginId,顺序即声明顺序)。 */
  byPlugin: Map<string, PluginThemeOverrideEntry[]>
  /** 合成后的 CSS 变量表:token 经 `CSS_VAR_MAP` 展开后的变量名 → 值。 */
  cssVariables: Record<string, string>
}

/** 键合法性:白名单就是 `CSS_VAR_MAP` 的键集合,不新增 token。 */
export function isPluginThemeOverrideToken(token: string): boolean {
  return Object.prototype.hasOwnProperty.call(CSS_VAR_MAP, token)
}

/**
 * 裁决一组插件的主题覆盖。
 *
 * 顺序语义:先按全局规范顺序排,再顺序写入 —— 后写的赢。被赢掉的那条
 * 标 `shadowed` 并记下赢家,设置页据此说"你的覆盖被谁压了"。
 */
export function resolvePluginThemeOverrides(
  inputs: readonly PluginThemeOverrideInput[],
): PluginThemeOverrideResolution {
  const ordered = [...inputs].sort((a, b) => comparePluginCanonicalOrder(a.pluginId, b.pluginId))

  const byPlugin = new Map<string, PluginThemeOverrideEntry[]>()
  /** token → 当前赢家(pluginId + 该插件条目对象),用来回填 shadowed。 */
  const winners = new Map<string, { pluginId: string; entry: PluginThemeOverrideEntry }>()
  const resolvedTokens: Record<string, string> = {}

  for (const input of ordered) {
    const entries: PluginThemeOverrideEntry[] = []
    for (const [token, rawValue] of Object.entries(input.overrides ?? {})) {
      if (!isPluginThemeOverrideToken(token)) {
        entries.push({ token, value: String(rawValue), status: 'invalid', reason: 'unknown-token' })
        continue
      }
      if (!isPluginThemeColorValue(rawValue)) {
        entries.push({ token, value: String(rawValue), status: 'invalid', reason: 'invalid-color' })
        continue
      }
      const value = normalizePluginThemeColorValue(rawValue)
      if (!input.enabled) {
        // 停用的插件声明照样可见(卡片要能说"它会覆盖什么"),但不参与合成,
        // 也不参与冲突裁决 —— 否则关掉一个插件会改变另一个插件的呈现状态。
        entries.push({ token, value, status: 'inactive' })
        continue
      }
      const entry: PluginThemeOverrideEntry = { token, value, status: 'active' }
      const previous = winners.get(token)
      if (previous) {
        previous.entry.status = 'shadowed'
        previous.entry.shadowedBy = input.pluginId
      }
      winners.set(token, { pluginId: input.pluginId, entry })
      resolvedTokens[token] = value
      entries.push(entry)
    }
    byPlugin.set(input.pluginId, entries)
  }

  return { byPlugin, cssVariables: expandThemeTokens(resolvedTokens) }
}

/**
 * token → CSS 变量名展开。
 *
 * 用的是主题系统同一张 `CSS_VAR_MAP`(一个 token 可能映射多个变量名,
 * 向后兼容的别名要一起覆盖,否则组件按别名取值时会看到旧色)。
 */
function expandThemeTokens(tokens: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [token, value] of Object.entries(tokens)) {
    for (const cssVar of CSS_VAR_MAP[token] ?? []) {
      result[cssVar] = value
    }
  }
  return result
}

/**
 * 合成:主题产出 ⊕ 插件覆盖。
 *
 * 覆盖永远叠在**当前主题产出之上** —— 于是主题切换时覆盖天然保留
 * (新主题产出一张新表,这一层照样往上叠),不需要任何"记住覆盖"的状态。
 */
export function composeThemeVariablesWithPluginOverrides(
  themeVariables: Record<string, string>,
  overrideVariables: Record<string, string>,
): Record<string, string> {
  if (!Object.keys(overrideVariables).length) return themeVariables
  return { ...themeVariables, ...overrideVariables }
}
