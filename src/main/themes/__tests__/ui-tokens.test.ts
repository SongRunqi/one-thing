import { describe, expect, it, vi } from 'vitest'
import type { Theme } from '../../../shared/ipc/themes.js'
import { generateCSSVariables } from '../css-mapper.js'
import { resolveTheme, resolveThemeUI } from '../resolver.js'

function makeTheme(overrides: Partial<Theme> = {}): Theme {
  return {
    id: 'test-ui-theme',
    name: 'Test UI Theme',
    type: 'full',
    defs: {
      app: '#101010',
      sidebar: '#151515',
      chat: '#181818',
      panel: '#202020',
      elevated: '#282828',
      floating: '#303030',
      text: '#eeeeee',
      secondary: '#cccccc',
      muted: '#888888',
      faint: '#555555',
      accent: '#3388dd',
      accentSub: '#cce4ff',
      danger: '#dd3333',
      dangerBg: 'rgba(221, 51, 51, 0.14)',
      success: '#33aa55',
      successBg: 'rgba(51, 170, 85, 0.14)',
      override: '#ff00ff',
    },
    theme: {
      accent: 'accent',
      accentSub: 'accentSub',
      bg: {
        app: 'app',
        sidebar: 'sidebar',
        chat: 'chat',
        panel: 'panel',
        elevated: 'elevated',
        floating: 'floating',
        message: {
          user: 'linear-gradient(135deg, #202020 0%, #181818 100%)',
          userSolid: '#202020',
          ai: 'transparent',
          system: '#181818',
          error: 'dangerBg',
          hover: 'rgba(255, 255, 255, 0.04)',
        },
        toolCall: 'panel',
        toolCallHover: 'elevated',
        toolResult: 'chat',
        input: 'panel',
        inputFocus: 'elevated',
        btn: {
          primary: 'accent',
          primaryHover: 'accentSub',
          secondary: 'elevated',
          secondaryHover: 'floating',
          ghost: 'transparent',
          ghostHover: 'elevated',
          danger: 'danger',
          dangerHover: '#aa2222',
        },
        code: {
          inline: 'elevated',
          block: 'panel',
          header: 'elevated',
        },
        menu: 'floating',
        menuItemHover: 'elevated',
        tooltip: '#eeeeee',
        modal: 'panel',
        selected: 'rgba(51, 136, 221, 0.16)',
        selectedHover: 'rgba(51, 136, 221, 0.22)',
        highlight: 'rgba(255, 200, 0, 0.16)',
        hover: 'rgba(255, 255, 255, 0.04)',
        active: 'rgba(255, 255, 255, 0.08)',
      },
      text: {
        primary: 'text',
        secondary: 'secondary',
        muted: 'muted',
        faint: 'faint',
        error: 'danger',
        success: 'success',
        link: 'accent',
        input: 'text',
        inputPlaceholder: 'muted',
        user: {
          primary: 'text',
        },
        ai: {
          primary: 'text',
          thinking: 'muted',
        },
        tool: {
          name: 'accent',
          args: 'muted',
          result: 'secondary',
          error: 'danger',
          label: 'faint',
        },
        btn: {
          primary: 'app',
          secondary: 'text',
          ghost: 'text',
          danger: 'app',
        },
        code: {
          inline: 'text',
          block: 'text',
        },
      },
      border: {
        default: '#303030',
        subtle: '#282828',
        accent: 'accent',
        error: 'danger',
        success: 'success',
        input: '#303030',
        inputFocus: 'accent',
        message: '#282828',
        messageUser: '#303030',
        code: '#303030',
        divider: '#282828',
      },
      color: {
        danger: 'danger',
        dangerLight: 'dangerBg',
        success: 'success',
        successLight: 'successBg',
        info: 'accent',
        infoLight: 'rgba(51, 136, 221, 0.14)',
      },
    },
    ...overrides,
  }
}

describe('theme UI semantic tokens', () => {
  it('derives UI CSS variables from legacy theme colors', () => {
    const theme = makeTheme()
    const resolvedTheme = resolveTheme(theme, 'dark')
    const resolvedUI = resolveThemeUI(theme, 'dark', resolvedTheme)
    const cssVariables = generateCSSVariables(resolvedTheme, undefined, resolvedUI)

    expect(resolvedUI['ui.text.primary'].fg).toBe('#eeeeee')
    expect(resolvedUI['ui.action.primary']).toMatchObject({
      bg: '#3388dd',
      fg: '#101010',
      border: '#3388dd',
    })
    expect(resolvedUI['ui.tool.surface']).toMatchObject({
      bg: '#202020',
      border: '#282828',
    })
    expect(resolvedUI['ui.surface.note']).toMatchObject({
      bg: '#282828',
      fg: '#eeeeee',
      border: '#282828',
    })
    expect(resolvedUI['ui.sidebar.surface']).toMatchObject({
      bg: '#151515',
      fg: '#cccccc',
      border: '#282828',
    })
    expect(resolvedUI['ui.surface.previewLight'].bg).toBe('#ffffff')
    expect(resolvedUI['ui.surface.previewDark'].bg).toBe('#0f1117')
    expect(resolvedUI['ui.sidebar.item']).toMatchObject({
      fg: '#cccccc',
    })
    expect(resolvedUI['ui.sidebar.itemHover']).toMatchObject({
      bg: 'rgba(255, 255, 255, 0.04)',
      fg: '#eeeeee',
    })
    expect(resolvedUI['ui.sidebar.action']).toMatchObject({
      fg: '#cccccc',
      bg: 'transparent',
    })
    expect(resolvedUI['ui.sidebar.itemActive']).toMatchObject({
      fg: '#eeeeee',
      border: '#3388dd',
    })
    expect(resolvedUI['ui.tabBar.itemActive']).toMatchObject({
      fg: '#eeeeee',
      border: 'transparent',
    })
    expect(resolvedUI['ui.status.danger']).toMatchObject({
      fg: '#dd3333',
      bg: 'rgba(221, 51, 51, 0.14)',
      border: '#dd3333',
    })

    expect(cssVariables['--ui-text-primary-fg']).toBe('#eeeeee')
    expect(cssVariables['--text-primary']).toBe('#eeeeee')
    expect(cssVariables['--ui-action-primary-bg']).toBe('#3388dd')
    expect(cssVariables['--bg-btn-primary']).toBe('#3388dd')
    expect(cssVariables['--ui-tool-surface-bg']).toBe('#202020')
    expect(cssVariables['--tool-surface']).toBe('#202020')
    expect(cssVariables['--ui-sidebar-surface-bg']).toBe('#151515')
    expect(cssVariables['--bg-sidebar']).toBe('#151515')
    expect(cssVariables['--ui-surface-note-bg']).toBe('#282828')
    expect(cssVariables['--bg-note']).toBe('#282828')
    expect(cssVariables['--ui-surface-preview-light-bg']).toBe('#ffffff')
    expect(cssVariables['--ui-surface-preview-dark-bg']).toBe('#0f1117')
    expect(cssVariables['--ui-sidebar-item-active-fg']).toBe('#eeeeee')
    expect(cssVariables['--text-sidebar-item-active']).toBe('#eeeeee')
    expect(cssVariables['--ui-tab-bar-item-active-fg']).toBe('#eeeeee')
    expect(cssVariables['--tab-item-active-fg']).toBe('#eeeeee')
    expect(cssVariables['--ui-status-danger-fg']).toBe('#dd3333')
    expect(cssVariables['--color-danger']).toBe('#dd3333')
  })

  it('resolves UI semantic tokens, linked groups, aliases, and circular fallback', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const theme = makeTheme({
      ui: {
        semanticTokens: {
          'ui.text.primary': { fg: 'override' },
        },
        groups: {
          PrimaryButton: { bg: 'override', fg: 'app', border: 'override' },
          ToolCard: { link: 'PrimaryButton' },
          LoopA: { link: 'LoopB' },
          LoopB: { link: 'LoopA' },
        },
        aliases: {
          ToolCard: 'ui.tool.surface',
          LoopA: 'ui.text.faint',
        },
      },
    })

    const resolvedTheme = resolveTheme(theme, 'dark')
    const resolvedUI = resolveThemeUI(theme, 'dark', resolvedTheme)
    const cssVariables = generateCSSVariables(resolvedTheme, undefined, resolvedUI)

    expect(resolvedUI['ui.text.primary'].fg).toBe('#ff00ff')
    expect(resolvedUI['ui.action.primary']).toMatchObject({
      bg: '#ff00ff',
      fg: '#101010',
      border: '#ff00ff',
    })
    expect(resolvedUI['ui.tool.surface']).toMatchObject({
      bg: '#ff00ff',
      fg: '#101010',
      border: '#ff00ff',
    })
    expect(resolvedUI['ui.text.faint'].fg).toBe('#555555')
    expect(cssVariables['--ui-action-primary-bg']).toBe('#ff00ff')
    expect(cssVariables['--bg-btn-primary']).toBe('#ff00ff')
    expect(cssVariables['--ui-tool-surface-bg']).toBe('#ff00ff')
    expect(cssVariables['--tool-surface']).toBe('#ff00ff')
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})
