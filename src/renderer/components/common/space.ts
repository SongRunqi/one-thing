import type { Component, CSSProperties, VNode } from 'vue'

export type SpaceDirection = 'horizontal' | 'vertical'
export type SpaceLength = number | string
export type SpaceSize = SpaceLength | readonly [SpaceLength, SpaceLength]
export type SpaceAlignment = NonNullable<CSSProperties['alignItems']>
export type SpaceSpacer = string | number | VNode

export interface SpaceProps {
  as?: string | Component
  direction?: SpaceDirection
  size?: SpaceSize
  wrap?: boolean
  spacer?: SpaceSpacer
  separator?: SpaceSpacer
  align?: SpaceAlignment
  alignment?: SpaceAlignment
  fill?: boolean
  fillRatio?: number
}

type CssVarName = `--${string}`
export type SpaceStyle = CSSProperties & Record<CssVarName, string | number>

const sizeTokens: Record<string, string> = {
  none: '0',
  xxs: '2px',
  xs: '4px',
  small: '8px',
  sm: '8px',
  default: '12px',
  medium: '12px',
  md: '12px',
  large: '16px',
  lg: '16px',
  xl: '24px',
  xxl: '32px',
}

export function createSpaceStyle(props: Pick<SpaceProps, 'size' | 'align' | 'alignment' | 'fillRatio'>): SpaceStyle {
  const { rowGap, columnGap } = resolveSpaceGaps(props.size ?? 'small')
  const style: SpaceStyle = {
    '--app-space-row-gap': rowGap,
    '--app-space-column-gap': columnGap,
  }
  const alignItems = props.align ?? props.alignment

  if (alignItems) {
    style['--app-space-align-items'] = alignItems
  }

  if (props.fillRatio !== undefined) {
    style['--app-space-fill-ratio'] = `${normalizeFillRatio(props.fillRatio)}%`
  }

  return style
}

export function createSpaceItemStyle(props: Pick<SpaceProps, 'direction' | 'fill' | 'fillRatio'>): SpaceStyle {
  if (!props.fill) return {}

  const fillRatio = `${normalizeFillRatio(props.fillRatio)}%`

  if ((props.direction ?? 'horizontal') === 'vertical') {
    return {
      width: fillRatio,
      maxWidth: '100%',
    }
  }

  return {
    flexGrow: 1,
    minWidth: fillRatio,
  }
}

export function resolveSpaceGaps(size: SpaceSize): { rowGap: string; columnGap: string } {
  if (isSpaceSizePair(size)) {
    const [horizontal, vertical] = size
    return {
      rowGap: normalizeSpaceLength(vertical ?? horizontal),
      columnGap: normalizeSpaceLength(horizontal),
    }
  }

  const gap = normalizeSpaceLength(size)
  return {
    rowGap: gap,
    columnGap: gap,
  }
}

function isSpaceSizePair(size: SpaceSize): size is readonly [SpaceLength, SpaceLength] {
  return Array.isArray(size)
}

function normalizeSpaceLength(value: SpaceLength): string {
  if (typeof value === 'number') {
    return `${Math.max(0, value)}px`
  }

  const trimmed = value.trim()
  if (!trimmed) return '0'
  if (sizeTokens[trimmed]) return sizeTokens[trimmed]
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return `${Math.max(0, Number(trimmed))}px`

  return trimmed
}

function normalizeFillRatio(value: number | undefined): number {
  if (value === undefined) return 100
  if (!Number.isFinite(value)) return 100
  return Math.max(0, value)
}
