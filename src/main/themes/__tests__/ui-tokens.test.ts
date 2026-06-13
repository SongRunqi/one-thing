import { describe, expect, it } from 'vitest'
import type { Theme } from '../../../shared/ipc/themes.js'
import { generateCSSVariables } from '../css-mapper.js'
import { resolveTheme, resolveThemeColorSemantics, resolveThemeUI } from '../resolver.js'

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
      bg: 'rgba(255, 200, 0, 0.16)',
      fg: '#eeeeee',
      border: '#282828',
    })
    expect(resolvedUI['ui.surface.app']).toMatchObject({
      bg: '#101010',
    })
    expect(resolvedUI['ui.surface.chat']).toMatchObject({
      bg: '#202020',
    })
    expect(resolvedUI['ui.sidebar.surface']).toMatchObject({
      bg: '#101010',
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

    const colorSemantics = resolveThemeColorSemantics(resolvedTheme)
    expect(colorSemantics.primary).toBe('#3388dd')
    expect(colorSemantics.status).toMatchObject({
      success: '#33aa55',
      warning: '#F59E0B',
      danger: '#dd3333',
      info: '#3388dd',
    })
    expect(colorSemantics.neutral).toMatchObject({
      primaryText: '#eeeeee',
      regularText: '#cccccc',
      secondaryText: '#888888',
      placeholderText: '#888888',
      disabledText: '#555555',
      baseBorder: '#303030',
      lightBorder: '#282828',
      baseFill: '#202020',
      blankFill: 'transparent',
      basicBlack: '#000000',
      basicWhite: '#FFFFFF',
      pageBackground: '#101010',
      baseBackground: '#181818',
      overlayBackground: '#202020',
    })

    expect(cssVariables['--color-primary']).toBe('#3388dd')
    expect(cssVariables['--primary']).toBe('#3388dd')
    expect(cssVariables['--ui-text-primary-fg']).toBe('#eeeeee')
    expect(cssVariables['--text-primary']).toBe('#eeeeee')
    expect(cssVariables['--color-neutral-primary-text']).toBe('#eeeeee')
    expect(cssVariables['--text-color-primary']).toBe('#eeeeee')
    expect(cssVariables['--color-neutral-regular-text']).toBe('#cccccc')
    expect(cssVariables['--text-color-regular']).toBe('#cccccc')
    expect(cssVariables['--color-neutral-base-border']).toBe('#303030')
    expect(cssVariables['--border-color-base']).toBe('#303030')
    expect(cssVariables['--color-neutral-base-fill']).toBe('#202020')
    expect(cssVariables['--fill-color-base']).toBe('#202020')
    expect(cssVariables['--color-neutral-page-background']).toBe('#101010')
    expect(cssVariables['--bg-color-page']).toBe('#101010')
    expect(cssVariables['--ui-action-primary-bg']).toBe('#3388dd')
    expect(cssVariables['--bg-btn-primary']).toBe('#3388dd')
    expect(cssVariables['--ui-tool-surface-bg']).toBe('#202020')
    expect(cssVariables['--tool-surface']).toBe('#202020')
    expect(cssVariables['--ui-surface-app-bg']).toBe('#101010')
    expect(cssVariables['--bg-app']).toBe('#101010')
    expect(cssVariables['--ui-sidebar-surface-bg']).toBe('#101010')
    expect(cssVariables['--bg-sidebar']).toBe('#101010')
    expect(cssVariables['--ui-surface-note-bg']).toBe('rgba(255, 200, 0, 0.16)')
    expect(cssVariables['--bg-note']).toBe('rgba(255, 200, 0, 0.16)')
    expect(cssVariables['--ui-surface-preview-light-bg']).toBe('#ffffff')
    expect(cssVariables['--ui-surface-preview-dark-bg']).toBe('#0f1117')
    expect(cssVariables['--ui-sidebar-item-active-fg']).toBe('#eeeeee')
    expect(cssVariables['--text-sidebar-item-active']).toBe('#eeeeee')
    expect(cssVariables['--ui-tab-bar-item-active-fg']).toBe('#eeeeee')
    expect(cssVariables['--tab-item-active-fg']).toBe('#eeeeee')
    expect(cssVariables['--ui-status-danger-fg']).toBe('#dd3333')
    expect(cssVariables['--color-danger']).toBe('#dd3333')
  })

  it('lets new primary and neutral definitions override duplicated legacy roles', () => {
    const theme = makeTheme()
    theme.theme.primary = 'override'
    theme.theme.neutral = {
      regularText: 'override',
      pageBackground: 'override',
      blankFill: '#123456',
    }

    const resolvedTheme = resolveTheme(theme, 'dark')
    const resolvedUI = resolveThemeUI(theme, 'dark', resolvedTheme)
    const cssVariables = generateCSSVariables(resolvedTheme, undefined, resolvedUI)
    const colorSemantics = resolveThemeColorSemantics(resolvedTheme)

    expect(resolvedTheme.primary).toBe('#ff00ff')
    expect(resolvedTheme.accent).toBe('#ff00ff')
    expect(resolvedTheme['bg.btn.primary']).toBe('#ff00ff')
    expect(colorSemantics.primary).toBe('#ff00ff')
    expect(colorSemantics.neutral.regularText).toBe('#ff00ff')
    expect(colorSemantics.neutral.pageBackground).toBe('#ff00ff')
    expect(colorSemantics.neutral.blankFill).toBe('#123456')
    expect(cssVariables['--color-primary']).toBe('#ff00ff')
    expect(cssVariables['--accent']).toBe('#ff00ff')
    expect(cssVariables['--bg-btn-primary']).toBe('#ff00ff')
    expect(cssVariables['--text-color-regular']).toBe('#ff00ff')
    expect(cssVariables['--bg-color-page']).toBe('#ff00ff')
    expect(cssVariables['--fill-color-blank']).toBe('#123456')
    expect(cssVariables['--color-primary-rgb']).toBe('255, 0, 255')
    expect(cssVariables['--color-neutral-blank-fill-rgb']).toBe('18, 52, 86')
  })

  it('ignores theme UI overrides so every theme uses shared role mapping', () => {
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
    expect(resolvedUI['ui.text.faint'].fg).toBe('#555555')
    expect(cssVariables['--ui-action-primary-bg']).toBe('#3388dd')
    expect(cssVariables['--bg-btn-primary']).toBe('#3388dd')
    expect(cssVariables['--ui-tool-surface-bg']).toBe('#202020')
    expect(cssVariables['--tool-surface']).toBe('#202020')
  })

  it('repairs flattened legacy surfaces into distinct app roles', () => {
    const theme = makeTheme()
    theme.theme.bg.sidebar = 'chat'
    theme.theme.bg.panel = 'chat'
    theme.theme.bg.elevated = 'chat'
    theme.theme.bg.floating = 'chat'

    const resolvedTheme = resolveTheme(theme, 'dark')
    const resolvedUI = resolveThemeUI(theme, 'dark', resolvedTheme)

    expect(resolvedUI['ui.surface.chat'].bg).toBe('#181818')
    expect(resolvedUI['ui.surface.app'].bg).not.toBe(resolvedUI['ui.surface.chat'].bg)
    expect(resolvedUI['ui.surface.app'].bg).toBe(resolvedUI['ui.sidebar.surface'].bg)
    expect(resolvedUI['ui.sidebar.surface'].bg).not.toBe(resolvedUI['ui.surface.chat'].bg)
    expect(resolvedUI['ui.surface.panel'].bg).toBe(resolvedUI['ui.surface.chat'].bg)
    expect(resolvedUI['ui.tabBar.surface'].bg).toBe(resolvedUI['ui.surface.chat'].bg)
    expect(resolvedUI['ui.tabBar.surface'].bg).not.toBe(resolvedUI['ui.sidebar.surface'].bg)
    expect(resolvedUI['ui.surface.elevated'].bg).not.toBe(resolvedUI['ui.surface.panel'].bg)
  })
})
