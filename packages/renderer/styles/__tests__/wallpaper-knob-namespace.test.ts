/**
 * 旋钮名字空间的**棘轮**(批 3b)。
 *
 * 插件按前缀寻址旋钮(`themes/knobs.ts`),而寻址能不能拨得动,取决于一条 CSS 事实:
 * 主题变量的唯一出口是 `documentElement.style.setProperty`(`stores/themes.ts`),
 * **行内样式只压得住同一个元素上的规则声明**。所以旋钮必须声明在**根**上;一旦有人
 * 顺手把新旋钮写进 `html.has-wallpaper body {}`(它历史上就在那儿),插件那边会得到
 * 一个存在但拨不动的地址 —— 比没有更坏,而且真机上完全看不出来。
 *
 * 这条测试就守这一件事,守法是读文件而不是跑浏览器:两个块的边界靠大括号配平找,
 * 不靠行号。
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const WALLPAPER_CSS = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../wallpaper.css'
)

const source = fs.readFileSync(WALLPAPER_CSS, 'utf-8')

/** 去掉注释,免得块首注里的例子被当成声明。 */
const code = source.replace(/\/\*[\s\S]*?\*\//g, '')

/** 取某条选择器后面那一对大括号里的内容(不嵌套,壁纸文件里没有嵌套块)。 */
function ruleBody(selector: string): string {
  const start = code.indexOf(selector)
  expect(start, `选择器不见了:${selector}`).toBeGreaterThanOrEqual(0)
  const open = code.indexOf('{', start)
  const close = code.indexOf('}', open)
  return code.slice(open + 1, close)
}

/** 一段规则体里声明了哪些自定义属性。 */
function declaredCustomProps(body: string): string[] {
  return [...body.matchAll(/(--[a-z0-9-]+)\s*:/gi)].map(m => m[1])
}

/** 可被插件寻址的旋钮 = `--ot-` 前缀 + 类型后缀(与 themes/knobs.ts 同一条判据)。 */
const ADDRESSABLE_KNOB = /^--ot-.*-(alpha|blur)$/

describe('旋钮名字空间', () => {
  it('六枚旋钮全部声明在根块(html.has-wallpaper)上', () => {
    const rootKnobs = declaredCustomProps(ruleBody('html.has-wallpaper {'))
      .filter(name => ADDRESSABLE_KNOB.test(name))
      .sort()
    expect(rootKnobs).toEqual([
      '--ot-active-alpha',
      '--ot-card-alpha',
      '--ot-frost-alpha',
      '--ot-frost-blur',
      '--ot-state-alpha',
      '--ot-surface-alpha',
    ])
  })

  it('body 块里一枚可寻址旋钮都不许有(根上的行内覆写压不动它)', () => {
    const bodyProps = declaredCustomProps(ruleBody('html.has-wallpaper body {'))
    expect(bodyProps.filter(name => ADDRESSABLE_KNOB.test(name))).toEqual([])
  })

  it('ink 快照留在 --wallpaper- 名字空间且留在 body 上', () => {
    // 它们必须隔一层元素才躲得开后代的同名覆写(实现纪律 3),所以提不上根 ——
    // 也正因此不能改名进 `--ot-`:那会开出一批"前缀内、却拨不动"的地址。
    const bodyProps = declaredCustomProps(ruleBody('html.has-wallpaper body {'))
    const inks = bodyProps.filter(name => name.endsWith('-ink'))
    expect(inks.length).toBeGreaterThan(0)
    expect(inks.every(name => name.startsWith('--wallpaper-'))).toBe(true)
  })
})
