/**
 * 态 token 的「自带 alpha」产出层(Surface v2·行为内置,2026-08-11)。
 *
 * ── 它替掉了什么 ────────────────────────────────────────────────────────────
 * 壁纸模式过去靠 `wallpaper.css` 一本**中央规则本**做三件事:先在 `body` 上给每枚态
 * token 拍一张 ink 快照,再用快照兑出一枚 `--wallpaper-*` 半透明值,最后在
 * `.app-shell` 上逐条把 `--ui-*` 覆写成那枚值。三层里每一层都是"行为住在组件外"的
 * 代价 —— 新态 token 落地时忘了进任何一层,壁纸下它就是一块实心(G8-b 抓到的 rail
 * 窟窿就是这么来的)。
 *
 * 行为内置之后,token **自己**就带着公式:
 *
 *     --ot-ink-state-hover-bg: <主题解析出的实色>;
 *     --ui-state-hover-bg: color-mix(in srgb, var(--ot-ink-state-hover-bg) var(--ot-state-alpha, 100%), transparent);
 *
 * 全局行为(壁纸)只需在**根上拨一个数**:`html.has-wallpaper { --ot-state-alpha: 45% }`。
 * 缺省 100% 时 `color-mix(…X 100%, transparent)` 与实色 X **逐像素相同**(Chromium
 * 实测;computed 串会从 `rgb()` 序列化成 `color(srgb …)`,那只是序列化差异),所以
 * 壁纸关闭时零视觉变化。
 *
 * ── 为什么定义位必须与旋钮位是**同一个元素** ────────────────────────────────
 * 自定义属性的 `var()` 在**定义元素**上解析、按计算值继承。token 定义在 `:root`
 * (= `html`),旋钮也设在 `html.has-wallpaper` —— 同一个元素,所以类一挂即重算;
 * 两个名字不同,所以不构成 `--x: …var(--x)…` 的自引用环(旧文件的"实现纪律 3"
 * 防的就是那个坑,现在从结构上不存在)。
 *
 * **推论(实测确认,别照直觉写)**:后代元素上改 `--ot-state-alpha` 是**没用**的 ——
 * token 早在 `:root` 处算完了。浮层里要"反馈用满",只能在浮层上把 token 本身重新
 * 声明成 `var(--ot-ink-*)`(wallpaper.css 的浮层块就是干这个的),不是拨一下旋钮。
 *
 * ── 为什么住在渲染层而不是 css-mapper ───────────────────────────────────────
 * 主题层(`themes/css-mapper.ts`)的产出是**已解析的实色**,而 `themes/__tests__/
 * theme-gallery-regression.test.ts` 的内联快照与对比度断言逐条读它(`--ui-sidebar-
 * item-active-bg` / `--ui-tab-bar-item-active-bg` 都在快照里,是十六进制)。把
 * color-mix 塞回主题层会让整张画廊快照与 `parseCssColor` 的对比度校验一起失效 ——
 * 那层的职责就是"解析成实色",不该知道壁纸。于是分工是:主题层出**墨**,渲染层
 * 给墨**穿上公式**。`applyThemeVariables` 是主题变量落到 `documentElement` 的唯一
 * 出口(全仓仅此一处 `style.setProperty`),所以这里是产出层的正确位置。
 */

/** 壁纸模式下跟随「hover 旋钮」的那一档(瞬时反馈)。 */
const HOVER_TIER_TOKENS = [
  '--ui-state-hover-bg',
  '--ui-state-hover-accent-bg',
  '--ui-action-danger-hover-bg',
  '--ui-sidebar-action-hover-bg',
  '--ui-tab-bar-item-hover-bg',
  '--ui-tab-bar-action-hover-bg',
] as const

/**
 * 壁纸模式下跟随「active 旋钮」的那一档(要站得住的强调底)。
 *
 * `--ui-state-hover-accent-bg` 的强档与 `--ui-state-hover-raised-bg` 也在这里:
 * 它们在 token 层的语义就是"比 hover 更站得住的那一档",与 selected 同级 ——
 * 这条归档与旧 wallpaper.css 的两处注解逐字一致,不是本次新定的。
 */
const ACTIVE_TIER_TOKENS = [
  '--ui-state-active-bg',
  '--ui-state-selected-bg',
  '--ui-state-selected-hover-bg',
  '--ui-state-hover-accent-strong-bg',
  '--ui-state-hover-raised-bg',
  '--ui-tab-bar-item-active-bg',
] as const

/**
 * 区域作用域的态 token(侧栏一族)**不在全局表里**。
 *
 * 它们是**区域别名**(`--ui-sidebar-*`),消费者不止侧栏一棵树;全局稀释会波及
 * 侧栏之外读同一枚 token 的面,而那些面今天是实色。壁纸侧对它们的稀释落在
 * `wallpaper.css` 的侧栏例外块上(例外清单第 1 条,G8-b 判过"永久具名")——
 * 那里同样用 `--ot-ink-*` + 旋钮写,只是作用域是区域根而不是 `:root`。
 */
export const REGION_SCOPED_STATE_TOKENS = [
  '--ui-sidebar-item-hover-bg',
  '--ui-sidebar-item-active-bg',
  '--ui-sidebar-rail-hover-bg',
  '--ui-sidebar-rail-active-bg',
] as const

/**
 * 区域面档位的四枚面 token —— **只出墨,不在 `:root` 上穿公式**。
 *
 * 区域面的浓度不是全局行为:同一枚 `--ui-surface-panel-bg` 既画区域台面(壁纸下要
 * 变纱),也画浮层面(壁纸下要磨砂),还被消费者当"页面底"读。在 `:root` 上稀释
 * 就等于把三种用法一起拽走。所以公式住在**原语**里(`styles/components.css` 的四条
 * 区域面档位规则),那是"底色确实由档位画"的那一批面 —— 用了原语就自带行为。
 *
 * 墨在这里出,是因为原语的公式必须读一个**与被重定义的 token 异名**的源,否则
 * `--ui-surface-panel-bg: color-mix(…var(--ui-surface-panel-bg)…)` 在同一元素上
 * 构成自引用环,整条声明静默作废。
 */
export const SURFACE_INK_TOKENS = [
  '--ui-surface-app-bg',
  '--ui-surface-panel-bg',
  '--ui-surface-chat-bg',
  '--ui-surface-elevated-bg',
] as const

/** hover 档旋钮名。缺省 100% = 实色。 */
export const STATE_ALPHA_VAR = '--ot-state-alpha'
/** active 档旋钮名。缺省 100% = 实色。 */
export const ACTIVE_ALPHA_VAR = '--ot-active-alpha'

/**
 * token → 它跟随的旋钮。**全窗态反馈的唯一归档表** —— 新态 token 落地时加一行,
 * 它就自动进壁纸体系(不必再去 wallpaper.css 三个地方各登记一次)。
 */
export const STATE_ALPHA_TIERS: Readonly<Record<string, string>> = Object.freeze({
  ...Object.fromEntries(HOVER_TIER_TOKENS.map(token => [token, STATE_ALPHA_VAR])),
  ...Object.fromEntries(ACTIVE_TIER_TOKENS.map(token => [token, ACTIVE_ALPHA_VAR])),
  // 区域作用域的四枚同样要有墨(侧栏例外块引它们),只是不在 :root 上穿公式。
  ...Object.fromEntries(REGION_SCOPED_STATE_TOKENS.map(token => [token, ''])),
  // 区域面档位的四枚面 token:同样只出墨(公式住在原语里,见 SURFACE_INK_TOKENS)。
  ...Object.fromEntries(SURFACE_INK_TOKENS.map(token => [token, ''])),
})

/** `--ui-state-hover-bg` → `--ot-ink-state-hover-bg`(机械改名,别手写)。 */
export function inkVarName(token: string): string {
  return token.replace(/^--ui-/, '--ot-ink-')
}

/**
 * 给主题产出的实色穿上 alpha 公式。
 *
 * 输入是 `applyTheme()` 的原始表(实色);输出在原表基础上:
 *   · 为每枚在册的态 token 补一枚 `--ot-ink-*` 墨(原实色,一字不改);
 *   · 把有旋钮的那些 token 本身改写成 `color-mix(墨 var(旋钮, 100%), transparent)`。
 * 不在册的 token 原样透传。表里有名字但主题没产出这一枚时**什么都不做** ——
 * 那一枚会退回 `variables.css` 的静态兜底(那份同样自带公式)。
 */
export function withStateAlpha(variables: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = { ...variables }

  for (const [token, alphaVar] of Object.entries(STATE_ALPHA_TIERS)) {
    const ink = variables[token]
    if (!ink) continue
    out[inkVarName(token)] = ink
    if (!alphaVar) continue
    out[token] = `color-mix(in srgb, var(${inkVarName(token)}) var(${alphaVar}, 100%), transparent)`
  }

  return out
}
