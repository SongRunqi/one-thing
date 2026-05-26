import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { describe, expect, it } from 'vitest'
import type { Theme } from '../../../shared/ipc/themes.js'
import { resolveTheme } from '../resolver.js'

const dirname = path.dirname(fileURLToPath(import.meta.url))

function loadBuiltinTheme(fileName: string): Theme {
  const themePath = path.resolve(dirname, '../builtin', fileName)
  return JSON.parse(fs.readFileSync(themePath, 'utf8')) as Theme
}

function getPathValue(source: unknown, dottedPath: string): unknown {
  return dottedPath.split('.').reduce<unknown>((value, key) => {
    if (value && typeof value === 'object' && key in value) {
      return (value as Record<string, unknown>)[key]
    }
    return undefined
  }, source)
}

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

describe('built-in theme text contrast', () => {
  it('keeps GitHub Light chat metadata and thinking text readable', () => {
    const theme = loadBuiltinTheme('github-light.json')
    const resolvedTheme = resolveTheme(theme, 'light')
    const background = resolvedTheme['bg.chat']
    const readableTextTokens = [
      'text.faint',
      'text.ai.thinking',
      'text.tool.args',
      'text.sidebar.muted',
      'text.inputPlaceholder',
      'text.menu.header',
      'text.helper',
    ]

    for (const token of readableTextTokens) {
      expect(getPathValue(theme.theme, token), `${token} should not use a border color as text`).not.toBe('borderDefault')
      expect(contrastRatio(resolvedTheme[token], background), `${token} contrast`).toBeGreaterThanOrEqual(4.5)
    }
  })
})
