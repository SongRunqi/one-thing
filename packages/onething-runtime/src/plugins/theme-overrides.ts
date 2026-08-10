/**
 * 插件主题 token 覆盖的**裁决层**(B 期,L2)。
 *
 * 住在产品层是因为它需要两样东西:core 的安全判据(颜色白名单)与主题的
 * token 表(`CSS_VAR_MAP`)。产品层 → 产品层是合法方向;主题模块**不认识插件**,
 * 只收一张 token → 颜色的表当参数(`applyTheme(…, tokenOverrides)`)。
 *
 * 合成点在主题计算**之内**(`resolveThemeUI` / `generateCSSVariables` 之前),
 * 不在它产出之后 —— 后者只能盖住原始变量,而 renderer 上可见的 UI 绝大多数
 * 消费的是从 resolvedColors 派生出来的 `--ui-*` / `-rgb` / 色阶变量。
 *
 * 这里只做纯函数裁决,不碰插件管理器、不碰宿主 IPC:
 *  - 键必须过主题系统自己那道门 `isThemeTokenOverridable`(= `CSS_VAR_MAP` ∪
 *    代码色权威族 `syntax.*`,**白名单就是那两张表本身**,不另抄一份 ——
 *    抄一份就一定会漂移);
 *  - 值必须过 core 的颜色字面量白名单;
 *  - 冲突按**全局规范顺序后者胜**(core 的 `comparePluginCanonicalOrder`,
 *    与锚点块排列同一出处);代码色先按 `canonicalHighlightToken` 归一到权威族
 *    `syntax.*` 再比,别名族 `text.code.*` 与它同格竞争(见 `css-mapper.ts`);
 *  - 非法条目**不拒载**,只是被标成 `invalid` 让设置页说得出来(与未知锚点同规)。
 */
import {
  comparePluginCanonicalOrder,
  isPluginThemeColorValue,
  normalizePluginThemeColorValue,
} from '@onething/core/plugins'
import {
  canonicalHighlightToken,
  isHighlightAliasToken,
  isThemeTokenOverridable,
  themeTokenCssVariables,
} from '../themes/css-mapper.js'

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
  /**
   * 这条声明归一后的**权威键**,只在声明用的是别名族时出现
   * (`text.code.keyword` → `syntax.keyword`)。设置页据此写 "alias of …"。
   */
  canonicalToken?: string
  /**
   * status === 'shadowed' 且赢家用的是**另一个键名**时,赢家那个键名。
   *
   * 这是别名归一带出来的新情形:同一个插件同时声明 `text.code.keyword` 与
   * `syntax.keyword`,两条指向同一个权威键 —— `shadowedBy` 会是它自己的 id,
   * 光看那一栏说不清是被谁吞的。
   */
  shadowedByToken?: string
}

export interface PluginThemeOverrideInput {
  pluginId: string
  enabled: boolean
  overrides?: Record<string, string>
}

export interface PluginThemeOverrideResolution {
  /** 逐插件的裁决结果(键 = pluginId,顺序即声明顺序)。 */
  byPlugin: Map<string, PluginThemeOverrideEntry[]>
  /**
   * 裁决后"谁生效"的扁平表:**主题 token 路径** → 颜色字面量。
   *
   * 这是喂给主题计算的那一份 —— 它在 `resolveThemeUI` / `generateCSSVariables`
   * 之前落位,所以 ui 语义层、-rgb 变体、primary 色阶都按覆盖色重新派生。
   *
   * 代码色的键已归一成权威族(`text.code.keyword` 声明在这里是 `syntax.keyword`)。
   */
  tokenValues: Record<string, string>
  /**
   * `tokenValues` 经 `CSS_VAR_MAP` 展开后的**原始**变量名 → 值。
   *
   * 只是"这条覆盖会写到哪些变量上"的说明性投影(设置页明细)。**不要**拿它去
   * 叠主题产出:那样只有这些原始变量会变色,派生层会整片留在旧色上。
   */
  cssVariables: Record<string, string>
}

/**
 * 键合法性:白名单就是主题系统自己那道门(`CSS_VAR_MAP` ∪ 代码色权威族 `syntax.*`),
 * 不新增 token、也不在这里抄第二份 —— 抄一份就一定会漂移。
 */
export function isPluginThemeOverrideToken(token: string): boolean {
  return isThemeTokenOverridable(token)
}

/**
 * 裁决一组插件的主题覆盖。
 *
 * 顺序语义:先按全局规范顺序排,再顺序写入 —— 后写的赢。被赢掉的那条
 * 标 `shadowed` 并记下赢家,设置页据此说"你的覆盖被谁压了"。
 *
 * **别名归一**:代码色有两族键写同一批变量(权威族 `syntax.*`、别名族
 * `text.code.*`,归一表在 `themes/css-mapper.ts`)。冲突裁决按**权威键**做,
 * 不按声明用的字面键 —— 否则两个插件各写一族会双双"生效",最后谁赢由变量
 * 写入顺序偷偷决定。同一插件同时声明两族:**权威族胜**(实现是别名族先写、
 * 权威族后写),被吞的那条标 `shadowed` + `shadowedByToken`。
 */
export function resolvePluginThemeOverrides(
  inputs: readonly PluginThemeOverrideInput[],
): PluginThemeOverrideResolution {
  const ordered = [...inputs].sort((a, b) => comparePluginCanonicalOrder(a.pluginId, b.pluginId))

  const byPlugin = new Map<string, PluginThemeOverrideEntry[]>()
  /** **权威** token → 当前赢家(pluginId + 该插件条目对象),用来回填 shadowed。 */
  const winners = new Map<string, { pluginId: string; entry: PluginThemeOverrideEntry }>()
  const resolvedTokens: Record<string, string> = {}

  for (const input of ordered) {
    const entries: PluginThemeOverrideEntry[] = []
    /** 本插件里参与合成的条目(声明顺序),稍后按"别名先、权威后"写入。 */
    const pending: Array<{ entry: PluginThemeOverrideEntry; canonical: string; alias: boolean }> = []

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
      const canonical = canonicalHighlightToken(token) ?? token
      const entry: PluginThemeOverrideEntry = { token, value, status: 'active' }
      if (canonical !== token) entry.canonicalToken = canonical
      entries.push(entry)
      pending.push({ entry, canonical, alias: isHighlightAliasToken(token) })
    }

    // 别名族先写、权威族后写 —— 于是同一插件内两族撞车时权威族赢，且与
    // `pickHighlightTokenOverrides`(主题层同一裁决)的口径一字不差。
    for (const item of [...pending.filter(p => p.alias), ...pending.filter(p => !p.alias)]) {
      const previous = winners.get(item.canonical)
      if (previous) {
        previous.entry.status = 'shadowed'
        previous.entry.shadowedBy = input.pluginId
        if (previous.entry.token !== item.entry.token) {
          previous.entry.shadowedByToken = item.entry.token
        }
      }
      winners.set(item.canonical, { pluginId: input.pluginId, entry: item.entry })
      resolvedTokens[item.canonical] = item.entry.value
    }

    byPlugin.set(input.pluginId, entries)
  }

  return { byPlugin, tokenValues: resolvedTokens, cssVariables: expandThemeTokens(resolvedTokens) }
}

/**
 * token → CSS 变量名展开。
 *
 * 用的是主题系统同一张出口表(`themeTokenCssVariables`:普通 token 查
 * `CSS_VAR_MAP`,代码色查高亮层的 `--hg-*-fg` + legacy 别名)。一个 token 可能
 * 映射多个变量名,向后兼容的别名要一起覆盖,否则组件按别名取值时会看到旧色。
 *
 * 注意这只是**说明性投影**:代码色的真值还要过对比度护栏,屏幕上的最终值可能
 * 与这里列的不同(护栏在 `resolveThemeHighlights` 里跑,见 `applyTheme`)。
 */
function expandThemeTokens(tokens: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [token, value] of Object.entries(tokens)) {
    for (const cssVar of themeTokenCssVariables(token)) {
      result[cssVar] = value
    }
  }
  return result
}
