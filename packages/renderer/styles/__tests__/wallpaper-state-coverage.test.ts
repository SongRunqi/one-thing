/**
 * 壁纸态 token 的覆盖棘轮(G8-b 立,Surface v2·行为内置后改写,2026-08-11)。
 *
 * ── 它防的是同一个事故,只是断言换了机制 ────────────────────────────────────
 * 事故原型:**一枚新的态 token 落地时忘了进壁纸体系** —— 主题层把它解析成实色,
 * 壁纸模式下它就是一块实心(rail 族从 P4 起就是这个状态)。
 *
 * 旧机制下"进体系"要在**三处**各登记一次(body 的 ink 快照 / `.app-shell` 的覆写 /
 * E 级浮层里的回满),漏任何一处就是窟窿,所以旧断言逐 token 查三处。
 *
 * 行为内置之后登记位只剩**一处**:`styles/state-alpha.ts` 的 `STATE_ALPHA_TIERS`。
 * 在册即自带公式 —— 浓度长在 token 的定义里,壁纸只在根上拨旋钮。于是本棘轮改查:
 *   1. 每枚在册 token 都真的**带着 alpha var**(产出层 + 静态兜底两条路各一份);
 *   2. 稀释的作用域被显式**回满**过(浮层/对话框那批不透明面);
 *   3. 旧的三层结构没有借尸还魂(wallpaper.css 里不该再出现 ink 快照层)。
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { describe, expect, it } from 'vitest'
import {
  ACTIVE_ALPHA_VAR,
  REGION_SCOPED_STATE_TOKENS,
  STATE_ALPHA_TIERS,
  STATE_ALPHA_VAR,
  inkVarName,
  withStateAlpha,
} from '../state-alpha'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const rendererRoot = path.resolve(dirname, '../..')

function read(relativePath: string): string {
  return fs.readFileSync(path.join(rendererRoot, relativePath), 'utf8')
}

/** 取出以 `selectorStart` 开头的那条规则的声明体(按花括号配对)。 */
function ruleBody(css: string, selectorStart: string): string {
  const at = css.indexOf(selectorStart)
  expect(at, `wallpaper.css 里找不到规则 ${selectorStart}`).toBeGreaterThanOrEqual(0)
  const open = css.indexOf('{', at)
  let depth = 0
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1
    else if (css[i] === '}') {
      depth -= 1
      if (depth === 0) return css.slice(open + 1, i)
    }
  }
  throw new Error(`${selectorStart}: 花括号没有配对`)
}

const wallpaperCss = read('styles/wallpaper.css')
/**
 * 静态兜底的**行为层**。它与 `variables.css` 的分工是刻意的:字典那一层由
 * `ui-token-vars.test.ts` 逐条钉着"主题语义的规范表达式",浓度公式不塞进去。
 */
const behaviourCss = read('styles/state-alpha.css')
/** 浮层/不透明任务面里的「态反馈用满」块 —— 稀释作用域的唯一例外区。 */
const refillBlock = ruleBody(wallpaperCss, 'html.has-wallpaper :is(\n    .app-popover.is-surface,\n    .app-context-menu.is-surface,\n    .tooltip,')
/** 区域别名 token 的稀释块(例外清单第 1 条,永久具名)。 */
const sidebarBlock = ruleBody(wallpaperCss, 'html.has-wallpaper .sidebar {')

/** 参与交互反馈、必须在册的 token(= 旧棘轮那 12 枚 + 行为内置后一并收编的页签条族)。 */
const STATE_TOKENS = [
  '--ui-state-hover-bg',
  '--ui-state-active-bg',
  '--ui-state-selected-bg',
  '--ui-state-selected-hover-bg',
  '--ui-state-hover-accent-bg',
  '--ui-state-hover-accent-strong-bg',
  '--ui-state-hover-raised-bg',
  '--ui-action-danger-hover-bg',
  '--ui-sidebar-item-hover-bg',
  '--ui-sidebar-item-active-bg',
  // G8-b 补上的既存窟窿:rail 族的两档态。
  '--ui-sidebar-rail-hover-bg',
  '--ui-sidebar-rail-active-bg',
]

describe('wallpaper mode state token coverage', () => {
  for (const token of STATE_TOKENS) {
    it(`${token}: 在册 / 自带 alpha / 浮层回满`, () => {
      // 1. 在唯一的归档表里。加不上就说明它还没进壁纸体系。
      expect(
        Object.prototype.hasOwnProperty.call(STATE_ALPHA_TIERS, token),
        `${token} 不在 state-alpha.ts 的 STATE_ALPHA_TIERS 里 —— 主题层把它解析成实色,壁纸下就是一块实心`
      ).toBe(true)

      const ink = inkVarName(token)
      const alphaVar = STATE_ALPHA_TIERS[token]

      // 2a. 产出层:主题的实色会被搬进墨,成品带上 alpha var(区域别名族只搬墨)。
      const produced = withStateAlpha({ [token]: '#123456' })
      expect(produced[ink], `${token} 的墨没有被产出`).toBe('#123456')
      if (alphaVar) {
        expect(produced[token]).toBe(
          `color-mix(in srgb, var(${ink}) var(${alphaVar}, 100%), transparent)`
        )
      } else {
        // 区域别名族:公式不在 :root 上穿,稀释落在 wallpaper.css 的区域根块里。
        expect(produced[token], `${token} 不该在 :root 上被稀释`).toBe('#123456')
        expect(
          new RegExp(`${token}:\\s*color-mix\\([^;]*var\\(${ink}\\)`).test(sidebarBlock),
          `${token} 没有在侧栏区域块里稀释 —— 区域别名 token 的公式住在区域根上`
        ).toBe(true)
      }

      // 2b. 静态兜底:未加载主题时同一对(墨 / 公式)也要在行为层里成立。
      expect(
        new RegExp(`${ink}:`).test(behaviourCss),
        `${ink} 没有在 state-alpha.css 里定义 —— 未加载主题时浮层回满会读到空值`
      ).toBe(true)
      if (alphaVar) {
        expect(
          new RegExp(`${token}:\\s*color-mix\\([^;]*var\\(${ink}\\)\\s*var\\(${alphaVar}, 100%\\)`).test(
            behaviourCss
          ),
          `${token} 的静态兜底没有自带 alpha 公式`
        ).toBe(true)
      }
      // 环坑:墨绝不能读回同名成品(`--x: …var(--x)…` 静默作废)。
      expect(
        new RegExp(`${ink}:[^;]*var\\(${token}[,)]`).test(behaviourCss) &&
          new RegExp(`\\n\\t*${token}:`).test(behaviourCss),
        `${ink} 读回了同名成品 ${token},而后者又在同一层被重定义 —— 自引用环`
      ).toBe(false)

      // 3. 稀释过的东西必须有回满的地方(磨砂/不透明底上 45% 的反馈读不出来)。
      expect(
        new RegExp(`${token}:\\s*var\\(${ink}\\)`).test(refillBlock),
        `${token} 没有在浮层块里回满原值`
      ).toBe(true)
    })
  }

  it('两个旋钮都拨在根上(定义位 = 旋钮位,否则类切换不会重算)', () => {
    const knobs = ruleBody(wallpaperCss, 'html.has-wallpaper {')
    expect(knobs).toContain(`${STATE_ALPHA_VAR}: 45%;`)
    expect(knobs).toContain(`${ACTIVE_ALPHA_VAR}: 60%;`)
  })

  it('旧的 ink 快照层没有借尸还魂', () => {
    // `--wallpaper-*-ink: var(--ui-*-…-bg)` 是旧三层结构的化石:态 token 的墨现在
    // 由主题层直接产出(`--ot-ink-*`),再在 body 上拍一次快照就是把坑请回来。
    for (const token of STATE_TOKENS) {
      expect(
        new RegExp(`--wallpaper-[a-z-]+-ink:\\s*var\\(${token}[,)]`).test(wallpaperCss),
        `${token} 又出现了 body 层 ink 快照 —— 行为内置之后不需要它`
      ).toBe(false)
    }
  })

  it('区域别名族只有四枚,且都不在 :root 上穿公式', () => {
    expect([...REGION_SCOPED_STATE_TOKENS]).toEqual([
      '--ui-sidebar-item-hover-bg',
      '--ui-sidebar-item-active-bg',
      '--ui-sidebar-rail-hover-bg',
      '--ui-sidebar-rail-active-bg',
    ])
    for (const token of REGION_SCOPED_STATE_TOKENS) {
      expect(STATE_ALPHA_TIERS[token]).toBe('')
    }
  })

  /**
   * 波 2 的教训:hover 与它的另一半必须**成对**引同一族 token。拆开迁(只迁 hover
   * 或只迁选中)会让两档落在不同基面上,阶梯当场倒挂。
   */
  it('侧栏面板行的 hover / 当前项成对引 rail 族 token', () => {
    const sidebar = read('components/sidebar/Sidebar.vue')
    const hoverRule = sidebar.slice(
      sidebar.indexOf('.sidebar-pane .sidebar-room-item:hover {'),
      sidebar.indexOf('.sidebar-pane .sidebar-room-item.is-active {')
    )
    expect(hoverRule).toContain('background: var(--ui-sidebar-rail-hover-bg);')
    expect(hoverRule).not.toContain('color-mix')

    expect(sidebar).toContain('--sidebar-pane-row-active-fill: var(--ui-sidebar-rail-active-bg);')
  })
})
