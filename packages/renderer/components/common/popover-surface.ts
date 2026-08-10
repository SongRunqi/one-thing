/**
 * 浮面档位(G1,2026-08-10)—— Popover 家族「面色 / 边框 / 圆角 / 阴影」的唯一开关。
 *
 * 为什么是组件的 prop 而不是消费者自己写 CSS:Popover 的**根元素拿不到调用方的
 * scoped 作用域**(它的根是 Teleport,Vue 只把 scopeId 传给单个根元素,
 * docs/design/ui-system.md §1)。于是每一个想换张面的消费者都被迫
 * `:surface="false"` + 自绘一层内框 —— 存量 8 个消费者里有 6 个就是这么长出来的。
 * 档位化之后,面由组件按名字画,消费者只说要哪一张。
 *
 * 三档对应 ui-system.md §2 的浮层配方,不是新设计:
 *   floating  锚定浮层通用面(`--ui-surface-floating-bg` + `--shadow-floating`)
 *   menu      菜单族面(`--ui-surface-menu-bg`,2026-08-09 拍板:S 带 / trigger /
 *             ctx 三类浮层统一菜单面 —— floating 在夜间比它亮一档,两族并排打架)
 *   elevated  抬起的卡片面(`--ui-surface-elevated-bg` + `--shadow-elevated`)
 */
export type PopoverSurface = 'menu' | 'floating' | 'elevated'

export const POPOVER_SURFACES: readonly PopoverSurface[] = ['menu', 'floating', 'elevated']

/**
 * 档位 → 根元素类名。
 *
 * 缺省档**不加修饰类**,这是零破坏的关键:既有消费者要么不传、要么传
 * `:surface="false"`,两条路的 DOM 与命中的 CSS 规则都与改动前逐字节相同。
 * 只有显式选了非缺省档的调用才会多出一个 `is-surface-<tier>`。
 *
 * @param surface  prop 原值(`false` = 内容自带面)
 * @param defaultTier 该组件的缺省档(Popover 是 floating,Dropdown 是 menu)
 */
export function popoverSurfaceClasses(
  surface: boolean | PopoverSurface | undefined,
  defaultTier: PopoverSurface
): string[] {
  if (surface === false) return []
  const tier: PopoverSurface = surface === true || surface === undefined ? defaultTier : surface
  return tier === defaultTier ? ['is-surface'] : ['is-surface', `is-surface-${tier}`]
}
