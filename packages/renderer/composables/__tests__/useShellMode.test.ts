/**
 * 工作台式外壳的形态推导与回滚闸(docs/design/im-workbench-layout.md §5 C0)。
 *
 * 两类断言:
 *  1. 纯函数 —— 形态判定与右栏初值,直接喂数据;
 *  2. 源文件文本 —— 视觉门与 classic 的像素等价性只存在于 CSS/挂载线里,
 *     vue-test-utils 不套用 scoped CSS,渲染断言看不见它们,所以直接读源文件。
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  WORKBENCH_INSPECTOR_MIN_VIEWPORT_WIDTH,
  resolveInspectorDefaultOpen,
  resolveShellMode,
} from '../useShellMode'
import type { AppSettings } from '@/types'

function settingsWithShellMode(shellMode?: string): Pick<AppSettings, 'ui'> {
  return { ui: shellMode ? { shellMode: shellMode as 'workbench' | 'classic' } : undefined }
}

function readRendererFile(relativePath: string) {
  return readFileSync(new URL(`../../${relativePath}`, import.meta.url), 'utf8')
}

describe('resolveShellMode', () => {
  it('defaults to workbench when unset', () => {
    expect(resolveShellMode(undefined)).toBe('workbench')
    expect(resolveShellMode(null)).toBe('workbench')
    expect(resolveShellMode({} as Pick<AppSettings, 'ui'>)).toBe('workbench')
    expect(resolveShellMode(settingsWithShellMode())).toBe('workbench')
  })

  it('only a literal "classic" rolls back', () => {
    expect(resolveShellMode(settingsWithShellMode('classic'))).toBe('classic')
    expect(resolveShellMode(settingsWithShellMode('workbench'))).toBe('workbench')
    // 拼错的回滚闸不能把用户悄悄留在旧外壳;方案 D 的 'stage' 也已经不存在了
    expect(resolveShellMode(settingsWithShellMode('Classic'))).toBe('workbench')
    expect(resolveShellMode(settingsWithShellMode('stage'))).toBe('workbench')
  })

  it('与 shared 的 normalizeUISettings 同口径(两处都只认 classic)', () => {
    const shared = readFileSync(
      new URL('../../../shared/defaults/settings.ts', import.meta.url),
      'utf8',
    )
    expect(shared).toContain("shellMode: settings?.shellMode === 'classic' ? 'classic'")
  })
})

describe('右栏默认展开(W-Q2)', () => {
  const wide = WORKBENCH_INSPECTOR_MIN_VIEWPORT_WIDTH
  const base = { shellMode: 'workbench' as const, stored: null }

  it('阈值是 1400', () => {
    expect(WORKBENCH_INSPECTOR_MIN_VIEWPORT_WIDTH).toBe(1400)
  })

  it('workbench 下 ≥1400 默认展开,以下默认收起', () => {
    expect(resolveInspectorDefaultOpen({ ...base, viewportWidth: wide })).toBe(true)
    expect(resolveInspectorDefaultOpen({ ...base, viewportWidth: wide + 200 })).toBe(true)
    expect(resolveInspectorDefaultOpen({ ...base, viewportWidth: wide - 1 })).toBe(false)
    expect(resolveInspectorDefaultOpen({ ...base, viewportWidth: 1200 })).toBe(false)
  })

  it('窗宽不可知就当窄窗:宁可少开,不要把中栏挤没', () => {
    expect(resolveInspectorDefaultOpen({ ...base, viewportWidth: Number.NaN })).toBe(false)
    expect(resolveInspectorDefaultOpen({ ...base, viewportWidth: 0 })).toBe(false)
  })

  it('「默认」不是「强制」:存过的用户选择永远胜出', () => {
    // 手动收起过的人,在宽屏上也不该每次被重新弹开
    expect(resolveInspectorDefaultOpen({ shellMode: 'workbench', viewportWidth: 1920, stored: false })).toBe(false)
    // 反过来,窄屏上手动开过就保持开着
    expect(resolveInspectorDefaultOpen({ shellMode: 'workbench', viewportWidth: 1000, stored: true })).toBe(true)
  })

  it('classic 的初值行为一个字节不变:恒关,连存过的值都不吃', () => {
    expect(resolveInspectorDefaultOpen({ shellMode: 'classic', viewportWidth: 1920, stored: true })).toBe(false)
    expect(resolveInspectorDefaultOpen({ shellMode: 'classic', viewportWidth: 1920, stored: null })).toBe(false)
  })
})

describe('data-shell-mode 根属性', () => {
  const app = readRendererFile('App.vue')

  it('App.vue 把形态写到 documentElement —— 这是所有视觉门的唯一来源', () => {
    expect(app).toContain("document.documentElement.setAttribute('data-shell-mode', mode)")
    expect(app).toContain('watch(shellMode, (mode) => {')
    expect(app).toContain("from '@/composables/useShellMode'")
  })

  it('右栏初值等设置真的落地之后才算,否则会把 classic 用户也弹开', () => {
    const mounted = app.slice(app.indexOf('settingsStore.loadSettings(),'))
    expect(mounted.slice(0, 200)).toContain('applyInspectorDefaultOnce()')
    expect(app).toContain('let inspectorDefaultApplied = false')
  })

  it('用户的开合落盘,沿用右栏自己那套 localStorage(不另开 appState 字段)', () => {
    expect(app).toContain("const INSPECTOR_OPEN_STORAGE_KEY = 'inspectorOpen'")
    expect(app).toContain('writeStoredInspectorOpen(open)')
    expect(app).toContain('stored: readStoredInspectorOpen(),')
  })
})

describe('classic 逐像素回滚闸', () => {
  const chatPanel = readRendererFile('components/chat/ChatPanel.vue')

  it('阅读列公式拆成变量后展开仍与改造前逐字符等价', () => {
    expect(chatPanel).toContain('--chat-measure-cap: max(58%, calc(100% - 144px));')
    expect(chatPanel).toContain('--chat-content-width: min(var(--content-measure, 46rem), var(--chat-measure-cap));')
    expect(chatPanel).toContain('@media (max-width: 768px)')
  })

  /**
   * ChatPanel 当前**没有**按外壳形态分叉的样式(C2 的账页流宽度分支已随 C2′
   * 整体撤回;C2′ 的分流是模板里换消息列表,不是 CSS 宽度分支)。
   *
   * 这条看门狗对「零个分支」与「将来某天又加了分支」都成立:一旦有人加回
   * `:root[data-shell-mode='workbench'] .chat-panel`,它只许改
   * `--content-measure` / `--chat-measure-cap` 这两枚**输入**变量。直接写派生的
   * `--chat-content-width` 会以 (0,2,1) 压过本文件末尾 768 / 480 两个 `@media`
   * 里 (0,1,0) 的 `.chat-panel` 覆盖,把窄窗降级整个废掉 —— 这正是 C0 拆
   * `--chat-measure-cap` 时写在注释里的那条纪律。
   */
  it('若出现 workbench 样式分支,只许改输入变量,绝不直接写派生的 --chat-content-width', () => {
    const lines = chatPanel.split('\n')
    // 只认**选择器行**(行首就是 `:root[...]`)。纪律本身写在同文件的一段 CSS
    // 注释里,那段注释当然会提到这个属性选择器 —— 按裸子串扫会把注释自己
    // 当成分支,断言就变成了"不许在注释里解释这条纪律"。
    const branchBlocks = lines.reduce<string[]>((blocks, line, index) => {
      if (line.trimStart().startsWith(":root[data-shell-mode='workbench']")) {
        blocks.push(lines.slice(index, index + 6).join('\n'))
      }
      return blocks
    }, [])

    for (const block of branchBlocks) {
      expect(block).not.toContain('--chat-content-width:')
    }
    expect(chatPanel).toContain('@media (max-width: 480px)')
  })
})
