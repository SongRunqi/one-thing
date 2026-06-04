import { describe, expect, it } from 'vitest'
import type { Base46Theme } from '../../../shared/ipc/themes.js'
import { convertBase46ToTheme } from '../base46-parser.js'

function parseHexColor(value: string): [number, number, number] {
  const match = /^#([0-9a-f]{6})$/i.exec(value)
  if (!match) {
    throw new Error(`Expected a 6-digit hex color, received ${value}`)
  }

  const numericValue = Number.parseInt(match[1], 16)
  return [
    (numericValue >> 16) & 255,
    (numericValue >> 8) & 255,
    numericValue & 255,
  ]
}

function relativeLuminance(color: string): number {
  const [red, green, blue] = parseHexColor(color).map(channel => {
    const normalized = channel / 255
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4
  })

  return (0.2126 * red) + (0.7152 * green) + (0.0722 * blue)
}

function contrastRatio(foreground: string, background: string): number {
  const lighter = Math.max(relativeLuminance(foreground), relativeLuminance(background))
  const darker = Math.min(relativeLuminance(foreground), relativeLuminance(background))
  return (lighter + 0.05) / (darker + 0.05)
}

describe('Base46 theme conversion', () => {
  it('derives readable UI roles instead of blindly using low-contrast palette greys', () => {
    const base46: Base46Theme = {
      type: 'dark',
      base_30: {
        black: '#2E3440',
        darker_black: '#262C36',
        one_bg: '#3B4252',
        one_bg2: '#434C5E',
        one_bg3: '#4C566A',
        grey: '#303642',
        grey_fg: '#354052',
        grey_fg2: '#3A4557',
        light_grey: '#D8DEE9',
        white: '#ECEFF4',
        blue: '#88C0D0',
        nord_blue: '#81A1C1',
        cyan: '#8FBCBB',
        red: '#BF616A',
        green: '#A3BE8C',
        vibrant_green: '#A3BE8C',
        orange: '#D08770',
        yellow: '#EBCB8B',
        purple: '#B48EAD',
        teal: '#8FBCBB',
        line: '#4C566A',
      },
      base_16: {
        base00: '#2E3440',
        base01: '#3B4252',
        base02: '#434C5E',
        base03: '#4C566A',
        base04: '#4C566A',
        base05: '#D8DEE9',
        base06: '#E5E9F0',
        base07: '#ECEFF4',
        base08: '#BF616A',
        base09: '#D08770',
        base0A: '#EBCB8B',
        base0B: '#A3BE8C',
        base0C: '#8FBCBB',
        base0D: '#81A1C1',
        base0E: '#B48EAD',
        base0F: '#5E81AC',
      },
    }

    const theme = convertBase46ToTheme(base46, 'low-contrast-nordish')
    const sidebarBg = theme.theme.bg.sidebar as string
    const inputBg = theme.theme.bg.input as string
    const sidebarSurface = theme.ui?.semanticTokens?.['ui.sidebar.surface'] as { bg?: string } | undefined

    expect(theme.theme.bg.chat).toBe('#262C36')
    expect(theme.theme.bg.panel).toBe('#3B4252')
    expect(theme.theme.text.sidebar?.itemActive).toBe(theme.theme.text.primary)
    expect(sidebarSurface?.bg).toBe(sidebarBg)

    expect(contrastRatio(theme.theme.text.sidebar?.item as string, sidebarBg)).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(theme.theme.text.sidebar?.muted as string, sidebarBg)).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(theme.theme.text.inputPlaceholder as string, inputBg)).toBeGreaterThanOrEqual(4.5)
  })
})
