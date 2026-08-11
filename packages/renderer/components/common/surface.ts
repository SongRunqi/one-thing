/**
 * 区域面档位(G7-1,2026-08-11)—— 「区域底色」从各处自绘收成一枚**声明**。
 *
 * ── 为什么需要它 ────────────────────────────────────────────────────────────
 * 壁纸模式(`styles/wallpaper.css`)今天靠一张**类名白名单**认面:`.right-workbench`
 * 画 panel 面、`.media-panel` 画 chat 面…… 每张新面进树都得先去 wallpaper.css
 * 登记一行,忘了就是"这块没被壁纸覆盖"的报障。根因是**区域底色没有组件端的声明位**
 * —— 面色是各组件 scoped CSS 里的一句 `background: var(--ui-surface-xxx-bg)`,
 * 外面既读不到也认不出。
 *
 * 档位化之后,区域根**说自己是哪一档**,底色由档位画;同一枚声明在根元素上盖一枚
 * `data-surface="<tier>"` 的章。章是给 G7-2 的钩子:wallpaper.css 届时可以从
 * "类名枚举"退化成 `html.has-wallpaper .app-surface[data-surface='panel'] { … }`
 * 这样一条通用规则,新面**用了原语就自动在册**。
 *
 * ── 四档 = 四枚区域面 token,不是新设计 ─────────────────────────────────────
 *   app       页面底(`--ui-surface-app-bg`)
 *   panel     区域面板底(`--ui-surface-panel-bg`)
 *   chat      对话区底(`--ui-surface-chat-bg`,退到 app —— 与 wallpaper.css 的
 *             `--wallpaper-chat-ink` 逐字同款)
 *   elevated  抬起面(`--ui-surface-elevated-bg`)
 * 浮层的三档面(menu / floating / elevated)不在这里 —— 那是 Popover 的
 * `popover-surface.ts`(G1)。两张表**故意不合并**:浮层面还管边框/圆角/阴影,
 * 区域面只管一件事(底色),合并只会让两边都长出用不上的旋钮。
 *
 * ── 画在哪里 ────────────────────────────────────────────────────────────────
 * 档位的四条规则住在 **`styles/components.css`**(全局层)而不是 `Surface.vue` 的
 * scoped 块里:`Container`(layout-container 族)也吃同一张表,而它渲染的是**自己
 * 的根元素**,拿不到 Surface.vue 的 scopeId。全局一份 = 两个宿主同一张面。
 *
 * ── 盖章而不上色的用法 ──────────────────────────────────────────────────────
 * `data-surface` 是**章**,`.app-surface` 才是**画笔**。一张仍由自己(或自己的
 * 区域别名族)画底的面,可以只盖章不加类 —— 本期没有这种住户。
 *
 * ── G8-b 判决:sidebar **不**走这条路(这条通道至今零住户)────────────────────
 * 曾经的计划是 G8 把 sidebar 那一族(`--ui-sidebar-surface-bg` 墨阶)并进来。量完
 * 之后判不接:并档只换掉 wallpaper.css 侧栏块的**一行**(面 token),而那个块里另外
 * 四行是**态** token(行 hover / 选中、rail hover / 当前项)—— 一档只映射一枚面
 * token,态不在档位表的职责里,换不掉。净结果是一行改名 + 档位表多一档,总行数不减。
 * 通道本身保留(将来真有"自己画底、但要被壁纸认出来"的面时它仍是正解),但**不为
 * sidebar 造这一档**。
 */
export type SurfaceTier = 'app' | 'panel' | 'chat' | 'elevated'

export const SURFACE_TIERS: readonly SurfaceTier[] = ['app', 'panel', 'chat', 'elevated']

/** 画笔类名。缺省档(未声明)**不加**它 —— 零破坏的判据落在这里。 */
export const SURFACE_CLASS = 'app-surface'

/**
 * 档位 → 根元素类名。
 *
 * 未声明档位返回空数组:既有调用点的 DOM 与命中的 CSS 规则与改动前逐字节相同。
 */
export function surfaceClasses(tier: SurfaceTier | undefined | null): string[] {
  return tier ? [SURFACE_CLASS] : []
}
