/**
 * xterm theme derivation. The app's 16 theme JSONs carry no ANSI-16 assets,
 * so we derive: fg/bg/cursor/selection come from the live CSS tokens, and the
 * 16 ANSI colors come from one of two baked palettes picked by the effective
 * color scheme (the default xterm palette is designed for dark backgrounds
 * and is unreadable on the light/paper themes).
 */

// Type-only import — xterm itself is loaded dynamically by the registry.
import type { ITheme } from '@xterm/xterm'

/** Readable on dark backgrounds (VS Code dark-modern lineage). */
const DARK_ANSI = {
  black: '#3f3f3f',
  red: '#f48771',
  green: '#8ec07c',
  yellow: '#e5c07b',
  blue: '#6cb6ff',
  magenta: '#d3869b',
  cyan: '#56b6c2',
  white: '#d4d4d4',
  brightBlack: '#7f7f7f',
  brightRed: '#f48771',
  brightGreen: '#b8e0a5',
  brightYellow: '#f0d399',
  brightBlue: '#8cc8ff',
  brightMagenta: '#e2a3b3',
  brightCyan: '#7cd6e0',
  brightWhite: '#f2f2f2',
}

/** Darker variants that hold contrast on light/paper backgrounds. */
const LIGHT_ANSI = {
  black: '#2e2e2e',
  red: '#af2318',
  green: '#3d6d10',
  yellow: '#94620a',
  blue: '#205ea6',
  magenta: '#8b2d84',
  cyan: '#15756c',
  white: '#8f8d84',
  brightBlack: '#575653',
  brightRed: '#d14d41',
  brightGreen: '#66800b',
  brightYellow: '#ad8301',
  brightBlue: '#4385be',
  brightMagenta: '#ce5d97',
  brightCyan: '#3aa99f',
  brightWhite: '#6f6e69',
}

function cssColor(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  // xterm's color parser understands hex and rgb()/rgba(); anything else
  // (oklch, color-mix leftovers) falls back to a known-good constant.
  if (/^#|^rgb/.test(value)) return value
  return fallback
}

export function buildXtermTheme(mode: 'dark' | 'light'): ITheme {
  const dark = mode === 'dark'
  const background = cssColor('--ui-surface-panel-bg', dark ? '#1e1e1e' : '#fafafa')
  const foreground = cssColor('--ui-text-primary-fg', dark ? '#e6e4d9' : '#1c1b1a')
  return {
    background,
    foreground,
    cursor: foreground,
    cursorAccent: background,
    selectionBackground: dark ? '#ffffff30' : '#00000025',
    ...(dark ? DARK_ANSI : LIGHT_ANSI),
  }
}

export function resolveMonoFontFamily(): string {
  if (typeof document === 'undefined') return 'Menlo, monospace'
  const value = getComputedStyle(document.documentElement).getPropertyValue('--font-mono').trim()
  return value || 'Menlo, monospace'
}
