import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * 输入框皮相(R2 的 B 段)。
 *
 * 样板要的是「圆角 12px + 浅底 + 一行图标 + 右侧 34px 深色圆钮」,而 `InputBox`
 * 自己是蓝图框(方角、发丝描边、顶边浮标签、mono 的 SEND)。**两件事都得成立**:
 * 房面按样板走,直聊逐像素不变。
 *
 * 这一组盯的是让两件事同时成立的那条结构性理由:皮相整段写在 `RoomSurface` 的
 * scoped CSS 里,编译出来带着 `.room-composer[data-v-…]` 前缀,而直聊那棵树上
 * 根本没有这个祖先 —— 直聊不变不是"我记得没改到",是选择器够不着。
 *
 * 用源码而不是 DOM 断言,是因为 happy-dom 不跑 scoped CSS:能证明"改不到直聊"
 * 的证据在选择器里,不在渲染结果里。
 */
const ROOM_SURFACE = readFileSync(
  fileURLToPath(new URL('../room/RoomSurface.vue', import.meta.url)),
  'utf8',
)
const INPUT_BOX = readFileSync(
  fileURLToPath(new URL('../InputBox.vue', import.meta.url)),
  'utf8',
)

function styleBlock(source: string): string {
  const start = source.indexOf('<style')
  return start === -1 ? '' : source.slice(start)
}

/** 选择器行 = 以 `{` 结尾的那一行(去掉块内的声明行与注释)。 */
function selectorLines(css: string): string[] {
  return css
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.endsWith('{') && !line.startsWith('/*') && !line.startsWith('@'))
}

describe('房面 composer 皮相', () => {
  const roomCss = styleBlock(ROOM_SURFACE)

  it('皮相在 RoomSurface 一侧:样板那几件都在', () => {
    expect(roomCss).toContain('border-radius: 12px')
    expect(roomCss).toContain('border-radius: 50%')
    expect(roomCss).toContain('.send-label')
    expect(roomCss).toContain('.composer-frame-label')
  })

  it('每一条穿透规则都挂在 .room-composer 下 —— 直聊那棵树上没有这个祖先', () => {
    const deepRules = selectorLines(roomCss).filter(line => line.includes(':deep('))
    expect(deepRules.length).toBeGreaterThan(8)
    for (const rule of deepRules) {
      for (const selector of rule.replace(/\s*\{$/, '').split(',')) {
        expect(selector.trim()).toMatch(/^(\.room-surface )?\.room-composer[ >]/)
      }
    }
  })

  it('InputBox 本体没有被动过:蓝图框那套原样留着,也没有任何房面选择器', () => {
    const inputCss = styleBlock(INPUT_BOX)
    // 蓝图框的三件构件仍在(方角 / 发丝描边 / 顶边浮标签 / mono 的 SEND)。
    expect(inputCss).toContain('border-radius: var(--radius-xs, 4px);')
    expect(inputCss).toContain('.composer-frame-label {')
    expect(inputCss).toMatch(/\.send-label \{[^}]*font-family: var\(--font-mono/)
    // 房面的东西一个字都没漏进来。
    expect(INPUT_BOX).not.toContain('room-composer')
    expect(INPUT_BOX).not.toContain('room-surface')
  })

  it('房独有的 messenger 门仍然只在 messenger 形态生效(旧壳不受影响)', () => {
    expect(INPUT_BOX).toContain(".composer-toolbar[data-profile='messenger']")
  })

  /**
   * R3 的占位符入口:样板要「发送到 #浏览器重构」/「给小林发消息」,占位符是
   * `InputBox` 的 computed,CSS 够不着 —— 于是开一个只读 prop。**直聊零变化的
   * 证据是结构性的:全库只有房面传它**,旧壳那处 `InputBox` 一个字都没加。
   */
  it('placeholder 只有房面传:旧壳的 InputBox 挂点上没有这个绑定', () => {
    expect(ROOM_SURFACE).toContain(':placeholder="composerPlaceholder"')

    const chatPanel = readFileSync(
      fileURLToPath(new URL('../ChatPanel.vue', import.meta.url)),
      'utf8',
    )
    expect(chatPanel).toContain('<InputBox')
    expect(chatPanel).not.toContain(':placeholder')
    expect(chatPanel).not.toContain('placeholder=')
  })
})
