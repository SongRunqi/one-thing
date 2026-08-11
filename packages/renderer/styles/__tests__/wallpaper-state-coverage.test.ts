/**
 * 壁纸态 token 的三处覆盖棘轮(G8-b)。
 *
 * 波 2 抓到的窟窿不是"某条规则写错了",而是**一枚新的态 token 落地时忘了进壁纸
 * 体系**:主题层把它解析成实色,壁纸模式下它就是一块实心。rail 族(hover / 当前项)
 * 从 P4 起就是这个状态 —— rail 的**底**早在 A 级交出去了,底上的两档态没人管。
 *
 * 于是把 wallpaper.css 文件头那两条"实现纪律"钉成测试:一枚参与交互反馈的 token
 * 必须同时出现在三处 ——
 *   1. `html.has-wallpaper body` 里的 **ink 快照**(自定义属性惰性求值,快照层必须
 *      夹在主题定义层和覆写层之间,否则 `--x: color-mix(…var(--x)…)` 自引用作废);
 *   2. **某个覆写块**(S 级的 `.app-shell` / `.app-floating-sidebar-host`,或侧栏
 *      作用域 token 的 `.sidebar` 块)—— 派生 token 不会因为上游变了就重算,
 *      必须逐条列名;
 *   3. **E 级浮层块**里回满原值 —— 磨砂底上 45% 的反馈读不出来。
 *
 * 名单是**枚举制**(与 E 级同理由):新态 token 落地时来这里加一行,加不上就说明
 * 它还没进壁纸体系。页签条一族(`--ui-tab-bar-*`)刻意不在名单里:页签条不会出现在
 * 浮层内部,E 级对它没有意义。
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { describe, expect, it } from 'vitest'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const rendererRoot = path.resolve(dirname, '../..')

function read(relativePath: string): string {
  return fs.readFileSync(path.join(rendererRoot, relativePath), 'utf8')
}

/** 取出以 `selectorStart` 开头的那条规则的声明体(按花括号配对,注释里的括号不参与)。 */
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
const snapshotBlock = ruleBody(wallpaperCss, 'html.has-wallpaper body {')
const frostBlock = ruleBody(wallpaperCss, 'html.has-wallpaper :is(')
/** 覆写层 = 除快照块以外的全文(S 级块、`.sidebar` 块、台面补丁块都算)。 */
const overrideText = wallpaperCss.replace(snapshotBlock, '').replace(frostBlock, '')

/** 参与交互反馈、必须三处齐全的 token。 */
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
    it(`${token}: 快照 / 覆写 / 浮层回满三处齐全`, () => {
      expect(
        new RegExp(`--wallpaper-[a-z-]+-ink:\\s*var\\(${token}[,)]`).test(snapshotBlock),
        `${token} 没有在 html.has-wallpaper body 上取 ink 快照(环坑:覆写层直接读会自引用作废)`
      ).toBe(true)

      expect(
        new RegExp(`${token}:\\s*var\\(--wallpaper-`).test(overrideText),
        `${token} 没有任何壁纸覆写 —— 主题层把它解析成实色,壁纸下它就是一块实心`
      ).toBe(true)

      expect(
        new RegExp(`${token}:\\s*var\\(--wallpaper-[a-z-]+-ink\\)`).test(frostBlock),
        `${token} 没有在 E 级浮层块里回满原值(磨砂底上稀释过的反馈读不出来)`
      ).toBe(true)
    })
  }

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
