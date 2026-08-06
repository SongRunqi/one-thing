/**
 * 右栏开合初值(im-workbench-layout.md W-Q2)。
 *
 * 这个文件的前身是 `useShellMode.test.ts` —— C0 的 workbench↔classic 回滚闸已于
 * 2026-08-05 退役(docs/design/product-two-forms-chatgpt-shell.md D2),形态判定
 * 那一半跟着删了,只剩右栏初值这一半。
 *
 * 两类断言:
 *  1. 纯函数 —— 右栏初值,直接喂数据;
 *  2. 源文件文本 —— 挂载线与 CSS 纪律只存在于源文件里,vue-test-utils 不套用
 *     scoped CSS,渲染断言看不见它们,所以直接读源文件。
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  WORKBENCH_INSPECTOR_MIN_VIEWPORT_WIDTH,
  resolveInspectorDefaultOpen,
} from '../useInspectorDefault'

function readRendererFile(relativePath: string) {
  return readFileSync(new URL(`../../${relativePath}`, import.meta.url), 'utf8')
}

describe('resolveInspectorDefaultOpen', () => {
  const wide = WORKBENCH_INSPECTOR_MIN_VIEWPORT_WIDTH
  const base = { stored: null }

  it('阈值就是 W-Q2 拍板的 1400', () => {
    expect(WORKBENCH_INSPECTOR_MIN_VIEWPORT_WIDTH).toBe(1400)
  })

  it('没存过时按窗宽给默认值(≥1400 展开)', () => {
    expect(resolveInspectorDefaultOpen({ ...base, viewportWidth: wide })).toBe(true)
    expect(resolveInspectorDefaultOpen({ ...base, viewportWidth: wide + 200 })).toBe(true)
    expect(resolveInspectorDefaultOpen({ ...base, viewportWidth: wide - 1 })).toBe(false)
    expect(resolveInspectorDefaultOpen({ ...base, viewportWidth: 1200 })).toBe(false)
  })

  it('窗宽取不到就当窄窗:宁可少开,不要把中栏挤没', () => {
    expect(resolveInspectorDefaultOpen({ ...base, viewportWidth: Number.NaN })).toBe(false)
    expect(resolveInspectorDefaultOpen({ ...base, viewportWidth: 0 })).toBe(false)
  })

  it('存过的用户选择永远胜出 —— 默认不是强制', () => {
    expect(resolveInspectorDefaultOpen({ viewportWidth: 1920, stored: false })).toBe(false)
    expect(resolveInspectorDefaultOpen({ viewportWidth: 1000, stored: true })).toBe(true)
  })
})

describe('App.vue 的挂载线', () => {
  const app = readRendererFile('App.vue')

  it('右栏初值只算一次,且等设置真的落地之后', () => {
    const mounted = app.slice(app.indexOf('settingsStore.loadSettings(),'))
    expect(mounted.slice(0, 200)).toContain('applyInspectorDefaultOnce()')
    expect(app).toContain('let inspectorDefaultApplied = false')
  })

  it('用户的开合落盘,沿用右栏自己那套 localStorage(不另开 appState 字段)', () => {
    expect(app).toContain("const INSPECTOR_OPEN_STORAGE_KEY = 'inspectorOpen'")
    expect(app).toContain('writeStoredInspectorOpen(open)')
    expect(app).toContain('stored: readStoredInspectorOpen(),')
  })

  /**
   * 外壳形态开关(workbench↔classic)于 2026-08-05 整套退役:U0 删了判定与设置
   * 字段,U0b 删了 CSS 门与根属性本身。这条钉住它没被人加回来 —— 再加一个同名
   * 不同物的"形态"会和 U3 的产品形态搅在一起。
   */
  it('外壳形态开关连根没了:根属性、判定、CSS 门一个不剩', () => {
    // 扫**用法**不扫字面量 —— 那段说明它为什么被删的注释当然会提到这个名字。
    expect(app).not.toContain("setAttribute('data-shell-mode'")
    expect(app).not.toMatch(/\[data-shell-mode/)
    expect(app).not.toContain('resolveShellMode')
    expect(app).not.toMatch(/watch\(shellMode/)
  })
})

describe('ChatPanel 的阅读列纪律', () => {
  const chatPanel = readRendererFile('components/chat/ChatPanel.vue')

  it('阅读列公式拆成变量后展开仍与改造前逐字符等价', () => {
    expect(chatPanel).toContain('--chat-measure-cap: max(58%, calc(100% - 144px));')
    expect(chatPanel).toContain('--chat-content-width: min(var(--content-measure, 46rem), var(--chat-measure-cap));')
    expect(chatPanel).toContain('@media (max-width: 768px)')
  })

  /**
   * 纪律仍然成立:谁要在 `.chat-panel` 上加高特异性的覆盖,只许改
   * `--content-measure` / `--chat-measure-cap` 这两枚**输入**变量。直接写派生的
   * `--chat-content-width` 会压过本文件末尾 768 / 480 两个 `@media` 里 (0,1,0)
   * 的 `.chat-panel` 覆盖,把窄窗降级整个废掉。
   */
  it('不许有人直接写派生的 --chat-content-width 去压窄窗降级', () => {
    const lines = chatPanel.split('\n')
    const overrides = lines.reduce<string[]>((blocks, line, index) => {
      const selector = line.trimStart()
      if (selector.startsWith(':root[') || selector.startsWith('html[')) {
        blocks.push(lines.slice(index, index + 6).join('\n'))
      }
      return blocks
    }, [])

    for (const block of overrides) {
      expect(block).not.toContain('--chat-content-width:')
    }
    expect(chatPanel).toContain('@media (max-width: 480px)')
  })
})
