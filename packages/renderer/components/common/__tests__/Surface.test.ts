// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import Surface from '../Surface.vue'
import Container from '../Container.vue'
import { SURFACE_CLASS, SURFACE_TIERS, surfaceClasses, type SurfaceTier } from '../surface'

function readRepoFile(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8')
}

const COMPONENTS_CSS = readRepoFile('packages/renderer/styles/components.css')

/** 档位 → 它必须画的那一枚 token 表达式(逐字与迁移前的自绘一致)。 */
const TIER_BACKGROUND: Record<SurfaceTier, string> = {
  app: 'var(--ui-surface-app-bg)',
  panel: 'var(--ui-surface-panel-bg)',
  chat: 'var(--ui-surface-chat-bg, var(--ui-surface-app-bg))',
  elevated: 'var(--ui-surface-elevated-bg)',
}

describe('Surface 区域面原语(G7-1)', () => {
  it('renders a single root element carrying the brush class and the stamp', () => {
    const wrapper = mount(Surface, {
      props: { surface: 'panel' },
      slots: { default: '<span class="child">x</span>' },
    })

    expect(wrapper.element.tagName).toBe('DIV')
    expect(wrapper.classes()).toContain(SURFACE_CLASS)
    expect(wrapper.attributes('data-surface')).toBe('panel')
    // 不多一层 DOM:插槽内容直接是根的子节点。
    expect(wrapper.element.firstElementChild?.className).toBe('child')
  })

  it('keeps the root tag swappable through `as`', () => {
    const wrapper = mount(Surface, { props: { as: 'aside', surface: 'chat' } })

    expect(wrapper.element.tagName).toBe('ASIDE')
    expect(wrapper.attributes('data-surface')).toBe('chat')
  })

  it('stamps every declared tier', () => {
    for (const tier of SURFACE_TIERS) {
      const wrapper = mount(Surface, { props: { surface: tier } })
      expect(wrapper.attributes('data-surface')).toBe(tier)
    }
  })

  it('hands out the brush class only when a tier is declared', () => {
    expect(surfaceClasses(undefined)).toEqual([])
    expect(surfaceClasses(null)).toEqual([])
    for (const tier of SURFACE_TIERS) {
      expect(surfaceClasses(tier)).toEqual([SURFACE_CLASS])
    }
  })
})

describe('Container surface 档位', () => {
  it('adds nothing when no tier is declared (零破坏判据)', () => {
    const wrapper = mount(Container, { slots: { default: '<p>main</p>' } })

    expect(wrapper.classes()).not.toContain(SURFACE_CLASS)
    expect(wrapper.attributes('data-surface')).toBeUndefined()
  })

  it('paints and stamps when a tier is declared', () => {
    const wrapper = mount(Container, {
      props: { surface: 'panel' },
      slots: { default: '<p>main</p>' },
    })

    expect(wrapper.classes()).toContain('layout-container')
    expect(wrapper.classes()).toContain(SURFACE_CLASS)
    expect(wrapper.attributes('data-surface')).toBe('panel')
  })
})

describe('档位画笔规则(styles/components.css)', () => {
  it('paints each tier with its documented token, once', () => {
    for (const tier of SURFACE_TIERS) {
      const rule = `.${SURFACE_CLASS}[data-surface='${tier}'] {\n  background: ${TIER_BACKGROUND[tier]};\n}`
      expect(COMPONENTS_CSS).toContain(rule)
    }
  })

  it('never uses a bare [data-surface] selector', () => {
    // 编辑器一族(MarkdownDocumentEditor / ProseNoteEditor)早就在用同名属性的别的
    // 取值,裸属性选择器会把它们一并染上 —— 画笔类必须在选择器里。
    const bare = COMPONENTS_CSS.match(/(^|[\s,{}])\[data-surface/g)
    expect(bare).toBeNull()
  })
})

describe('区域根接入(逐处同一枚 token,只是改由原语画)', () => {
  /** 取出某条选择器的规则体(只到第一个 `}`,够用:区域根规则里没有嵌套块)。 */
  function ruleBody(css: string, selector: string): string {
    const start = css.indexOf(`\n${selector} {`)
    expect(start, `${selector} rule not found`).toBeGreaterThan(-1)
    return css.slice(start, css.indexOf('\n}', start))
  }

  it('right workbench declares the panel tier instead of self-painting', () => {
    const source = readRepoFile('packages/renderer/components/workbench/RightWorkbenchPanel.vue')

    expect(source).toContain('surface="panel"')
    // 只钉**区域根**那一条:台面里的 `.browser-toolbar` / 浏览器面各自还画自己的
    // panel 面(壁纸体系里它们是 A 级让位,另有规则),不在本刀范围内。
    expect(ruleBody(source, '.right-workbench')).not.toContain('background:')
  })

  it('media panel declares the chat tier instead of self-painting', () => {
    const source = readRepoFile('packages/renderer/components/MediaPanel.vue')

    expect(source).toContain('<Surface')
    expect(source).toContain('surface="chat"')
    expect(ruleBody(source, '.media-panel')).not.toContain('background:')
  })

  it('leaves the two declined region roots exactly as they were', () => {
    // 判决记在 docs/design/ui-system.md §6.6:
    // · `.session-header` 画的是页签条族的派生 token,不在四档表内(硬塞会改色);
    // · `.sidebar` 画的是区域别名 `--ui-sidebar-surface-bg`(墨阶一族),借 `app`
    //   档盖章会让 G7-2 的通用规则在 sidebar 子树里误伤后代面,而它自己纹丝不动。
    const sessionHeader = readRepoFile('packages/renderer/components/chat/SessionHeader.vue')
    const sidebar = readRepoFile('packages/renderer/components/sidebar/Sidebar.vue')

    expect(sessionHeader).toContain('background: var(--ui-tab-bar-surface-bg, var(--ui-surface-chat-bg));')
    expect(sessionHeader).not.toContain('data-surface')
    expect(sidebar).toContain('--sidebar-bg: var(--ui-sidebar-surface-bg, var(--ui-surface-app-bg));')
    expect(sidebar).not.toContain('data-surface')
  })
})

describe('壁纸认章不认类名(G7-2)', () => {
  const WALLPAPER_CSS = readRepoFile('packages/renderer/styles/wallpaper.css')

  it('covers all four tiers with one generic rule each', () => {
    // 四档都在册(`app` / `elevated` 当前零住户 —— 预写的规则惰性,第一张面盖上
    // 章的同一刻生效,不必回 wallpaper.css 补一行)。
    const TIER_TOKEN: Record<SurfaceTier, string> = {
      app: '--ui-surface-app-bg',
      panel: '--ui-surface-panel-bg',
      chat: '--ui-surface-chat-bg',
      elevated: '--ui-surface-elevated-bg',
    }
    for (const tier of SURFACE_TIERS) {
      expect(WALLPAPER_CSS).toContain(
        `html.has-wallpaper .${SURFACE_CLASS}[data-surface='${tier}'] {`,
      )
      expect(WALLPAPER_CSS).toContain(`  ${TIER_TOKEN[tier]}: var(--wallpaper-veil);`)
    }
  })

  it('never uses a bare [data-surface] selector', () => {
    // 与 components.css 同一条理由:编辑器一族用同名属性的别的取值,裸属性选择器
    // 会把 `document` / `todo-notes` 的面一并稀释成纱。
    expect(WALLPAPER_CSS.match(/(^|[\s,{}])\[data-surface/g)).toBeNull()
  })

  it('drops the two class-name entries the generic rules replaced', () => {
    // 枚举制在区域面这一档终结:两条具名覆写不该再存在,否则就是一处两治。
    expect(WALLPAPER_CSS).not.toContain('.right-workbench {\n  --ui-surface-panel-bg:')
    expect(WALLPAPER_CSS).not.toMatch(/html\.has-wallpaper \.media-panel \{/)
  })

  it('keeps the bench-only patches named (they read other tokens)', () => {
    // 例外清单第 2 条:台面**里**的内容面读的不是 panel 那一枚,档位推不动它们。
    expect(WALLPAPER_CSS).toContain('html.has-wallpaper .right-workbench {')
    for (const token of ['--ui-surface-elevated-bg', '--ui-surface-app-bg', '--workbench-tool-card-bg']) {
      expect(WALLPAPER_CSS).toContain(`  ${token}: color-mix(`)
    }
  })
})
