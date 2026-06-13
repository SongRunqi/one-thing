import type { Component } from 'vue'

export const borderLineStyles = ['solid', 'dashed', 'hidden'] as const
export const borderRadiusValues = ['none', 'xs', 'sm', 'md', 'lg', 'xl', 'full'] as const
export const borderShadowValues = ['none', 'xs', 'sm', 'md', 'lg', 'xl', 'inner', 'floating'] as const
export const borderSpaceValues = ['none', 'xs', 'sm', 'md', 'lg', 'xl'] as const

export type BorderLineStyle = (typeof borderLineStyles)[number]
export type BorderRadius = (typeof borderRadiusValues)[number]
export type BorderShadow = (typeof borderShadowValues)[number]
export type BorderSpaceToken = (typeof borderSpaceValues)[number]
export type BorderTone = 'default' | 'subtle' | 'strong' | 'accent' | 'success' | 'warning' | 'danger'
export type BorderSurface = 'transparent' | 'panel' | 'elevated' | 'input'
export type BorderLength = number | string
export type BorderSpace = number | string | BorderSpaceToken

export interface BorderOption<T extends string> {
  value: T
  label: string
}

export interface BorderBoxProps {
  as?: string | Component
  borderStyle?: BorderLineStyle
  radius?: BorderRadius
  radiusValue?: BorderLength
  shadow?: BorderShadow
  shadowValue?: string
  hoverShadowValue?: string
  tone?: BorderTone
  surface?: BorderSurface
  background?: string
  hoverBackground?: string
  borderColor?: string
  hoverBorderColor?: string
  focusRingColor?: string
  width?: BorderLength
  padding?: BorderSpace
  interactive?: boolean
}

type CssVarName = `--${string}`
export type BorderBoxStyle = Record<CssVarName, string | number>

export const borderStyleOptions = [
  { value: 'solid', label: 'Solid' },
  { value: 'dashed', label: 'Dashed' },
  { value: 'hidden', label: 'Hidden' },
] as const satisfies readonly BorderOption<BorderLineStyle>[]

export const borderRadiusOptions = [
  { value: 'none', label: 'None' },
  { value: 'xs', label: 'XS' },
  { value: 'sm', label: 'SM' },
  { value: 'md', label: 'MD' },
  { value: 'lg', label: 'LG' },
  { value: 'xl', label: 'XL' },
  { value: 'full', label: 'Full' },
] as const satisfies readonly BorderOption<BorderRadius>[]

export const borderShadowOptions = [
  { value: 'none', label: 'None' },
  { value: 'xs', label: 'XS' },
  { value: 'sm', label: 'SM' },
  { value: 'md', label: 'MD' },
  { value: 'lg', label: 'LG' },
  { value: 'xl', label: 'XL' },
  { value: 'inner', label: 'Inner' },
  { value: 'floating', label: 'Floating' },
] as const satisfies readonly BorderOption<BorderShadow>[]

const radiusTokens: Record<BorderRadius, string> = {
  none: '0',
  xs: 'var(--radius-xs)',
  sm: 'var(--radius-sm)',
  md: 'var(--radius-md)',
  lg: 'var(--radius-lg)',
  xl: 'var(--radius-xl)',
  full: 'var(--radius-full)',
}

const shadowTokens: Record<BorderShadow, string> = {
  none: 'none',
  xs: 'var(--shadow-xs)',
  sm: 'var(--shadow-sm)',
  md: 'var(--shadow-md)',
  lg: 'var(--shadow-lg)',
  xl: 'var(--shadow-xl)',
  inner: 'var(--shadow-inner)',
  floating: 'var(--shadow-floating)',
}

const toneBorderTokens: Record<BorderTone, string> = {
  default: 'var(--ui-border-default-border, var(--border))',
  subtle: 'color-mix(in srgb, var(--ui-border-subtle-border, var(--border-subtle, var(--border))) 72%, transparent)',
  strong: 'var(--ui-border-strong-border, var(--border-strong, var(--border)))',
  accent: 'color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 58%, transparent)',
  success: 'color-mix(in srgb, var(--ui-status-success-fg, var(--color-success, #10b981)) 58%, transparent)',
  warning: 'color-mix(in srgb, var(--ui-status-warning-fg, var(--color-warning, #f59e0b)) 58%, transparent)',
  danger: 'color-mix(in srgb, var(--ui-status-danger-fg, var(--color-danger, #ef4444)) 58%, transparent)',
}

const toneHoverBorderTokens: Record<BorderTone, string> = {
  default: 'var(--ui-border-strong-border, var(--border-strong, var(--border)))',
  subtle: 'var(--ui-border-default-border, var(--border))',
  strong: 'color-mix(in srgb, var(--ui-border-strong-border, var(--border-strong, var(--border))) 88%, var(--ui-text-primary-fg, var(--text)))',
  accent: 'var(--ui-accent-primary-fg, var(--accent))',
  success: 'var(--ui-status-success-fg, var(--color-success, #10b981))',
  warning: 'var(--ui-status-warning-fg, var(--color-warning, #f59e0b))',
  danger: 'var(--ui-status-danger-fg, var(--color-danger, #ef4444))',
}

const surfaceTokens: Record<BorderSurface, string> = {
  transparent: 'transparent',
  panel: 'var(--ui-surface-panel-bg, var(--panel))',
  elevated: 'var(--ui-surface-elevated-bg, var(--bg-elevated, var(--panel)))',
  input: 'var(--ui-surface-input-bg, var(--bg-input, var(--bg)))',
}

const spaceTokens: Record<BorderSpaceToken, string> = {
  none: '0',
  xs: 'var(--space-1)',
  sm: 'var(--space-2)',
  md: 'var(--space-3)',
  lg: 'var(--space-4)',
  xl: 'var(--space-6)',
}

export function createBorderBoxStyle(props: BorderBoxProps): BorderBoxStyle {
  const tone = normalizeOption(props.tone, toneBorderTokens, 'default')
  const shadow = normalizeOption(props.shadow, shadowTokens, 'none')
  const shadowValue = normalizeCssValue(props.shadowValue) || shadowTokens[shadow]

  return {
    '--border-box-border-style': normalizeLineStyle(props.borderStyle),
    '--border-box-border-radius': normalizeLength(props.radiusValue, radiusTokens[normalizeOption(props.radius, radiusTokens, 'md')]),
    '--border-box-shadow': shadowValue,
    '--border-box-hover-shadow': normalizeCssValue(props.hoverShadowValue) || (shadowValue === 'none' ? 'var(--shadow-xs)' : shadowValue),
    '--border-box-border-color': normalizeCssValue(props.borderColor) || toneBorderTokens[tone],
    '--border-box-hover-border-color': normalizeCssValue(props.hoverBorderColor) || toneHoverBorderTokens[tone],
    '--border-box-background': normalizeCssValue(props.background) || surfaceTokens[normalizeOption(props.surface, surfaceTokens, 'transparent')],
    '--border-box-hover-background': normalizeCssValue(props.hoverBackground) || normalizeCssValue(props.background) || surfaceTokens[normalizeOption(props.surface, surfaceTokens, 'transparent')],
    '--border-box-focus-ring-color': normalizeCssValue(props.focusRingColor) || 'var(--ui-border-focus-ring, var(--ui-accent-primary-fg, var(--accent)))',
    '--border-box-border-width': normalizeLength(props.width, '1px'),
    '--border-box-padding': normalizeSpace(props.padding, '0'),
  }
}

function normalizeLineStyle(value: BorderLineStyle | undefined): BorderLineStyle {
  return value && borderLineStyles.includes(value) ? value : 'solid'
}

function normalizeOption<T extends string>(
  value: T | undefined,
  tokens: Record<T, string>,
  fallback: T,
): T {
  return value && value in tokens ? value : fallback
}

function normalizeLength(value: BorderLength | undefined, fallback: string): string {
  if (value === undefined || value === null) return fallback
  if (typeof value === 'number') return `${Math.max(0, value)}px`

  const trimmed = value.trim()
  if (!trimmed) return fallback
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return `${Math.max(0, Number(trimmed))}px`

  return trimmed
}

function normalizeSpace(value: BorderSpace | undefined, fallback: string): string {
  if (value === undefined || value === null) return fallback
  if (typeof value === 'string' && value in spaceTokens) {
    return spaceTokens[value as keyof typeof spaceTokens]
  }

  return normalizeLength(value, fallback)
}

function normalizeCssValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed || undefined
}
