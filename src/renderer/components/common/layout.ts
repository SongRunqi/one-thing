import type { Component } from 'vue'

export const layoutBreakpoints = ['base', 'sm', 'md', 'lg', 'xl'] as const
export const LAYOUT_COLUMN_COUNT = 24

export type LayoutBreakpoint = (typeof layoutBreakpoints)[number]
export type ResponsiveProp<T> = T | Partial<Record<LayoutBreakpoint, T>>
export type LayoutType = 'flex' | 'grid'
export type LayoutLength = number | string
export type LayoutColumns = number | string
export type LayoutSpan = number | 'auto' | 'full'
export type LayoutLine = number | 'auto'
export type LayoutDirection = 'row' | 'row-reverse' | 'column' | 'column-reverse'
export type LayoutWrap = boolean | 'wrap' | 'nowrap' | 'wrap-reverse'
export type LayoutItemsAlignment = 'start' | 'center' | 'end' | 'stretch' | 'baseline'
export type LayoutSelfAlignment = LayoutItemsAlignment | 'auto'
export type LayoutContentAlignment =
  | 'start'
  | 'center'
  | 'end'
  | 'stretch'
  | 'space-between'
  | 'space-around'
  | 'space-evenly'
  | 'between'
  | 'around'
  | 'evenly'
export type LayoutAutoFlow = 'row' | 'column' | 'dense' | 'row dense' | 'column dense'

export interface LayoutGridProps {
  as?: string | Component
  type?: LayoutType
  columns?: ResponsiveProp<LayoutColumns>
  gap?: ResponsiveProp<LayoutLength>
  columnGap?: ResponsiveProp<LayoutLength>
  rowGap?: ResponsiveProp<LayoutLength>
  direction?: ResponsiveProp<LayoutDirection>
  wrap?: ResponsiveProp<LayoutWrap>
  alignItems?: ResponsiveProp<LayoutItemsAlignment>
  justifyItems?: ResponsiveProp<LayoutItemsAlignment>
  alignContent?: ResponsiveProp<LayoutContentAlignment>
  justifyContent?: ResponsiveProp<LayoutContentAlignment>
  autoFlow?: ResponsiveProp<LayoutAutoFlow>
  autoRows?: ResponsiveProp<LayoutLength>
  inline?: boolean
}

export interface LayoutGridItemProps {
  as?: string | Component
  span?: ResponsiveProp<LayoutSpan>
  start?: ResponsiveProp<LayoutLine>
  offset?: ResponsiveProp<number>
  order?: ResponsiveProp<number>
  alignSelf?: ResponsiveProp<LayoutSelfAlignment>
  justifySelf?: ResponsiveProp<LayoutSelfAlignment>
}

type CssVarName = `--${string}`
export type LayoutStyle = Record<CssVarName, string | number>

const lengthTokens: Record<string, string> = {
  none: '0',
  xxs: '2px',
  xs: '4px',
  sm: '8px',
  md: '12px',
  lg: '16px',
  xl: '24px',
  xxl: '32px',
}

const contentAlignmentMap: Record<string, string> = {
  between: 'space-between',
  around: 'space-around',
  evenly: 'space-evenly',
}

export function createLayoutGridStyle(props: LayoutGridProps): LayoutStyle {
  return {
    ...createResponsiveStyle('--layout-grid-columns', props.columns, normalizeColumns),
    ...createResponsiveStyle('--layout-grid-gap', props.gap, normalizeLength),
    ...createResponsiveStyle('--layout-grid-column-gap', props.columnGap, normalizeLength),
    ...createResponsiveStyle('--layout-grid-row-gap', props.rowGap, normalizeLength),
    ...createResponsiveStyle('--layout-grid-direction', props.direction, normalizeRawValue),
    ...createResponsiveStyle('--layout-grid-wrap', props.wrap, normalizeWrap),
    ...createResponsiveStyle('--layout-grid-align-items', props.alignItems, normalizeAlignment),
    ...createResponsiveStyle('--layout-grid-justify-items', props.justifyItems, normalizeAlignment),
    ...createResponsiveStyle('--layout-grid-align-content', props.alignContent, normalizeContentAlignment),
    ...createResponsiveStyle('--layout-grid-justify-content', props.justifyContent, normalizeContentAlignment),
    ...createResponsiveStyle('--layout-grid-auto-flow', props.autoFlow, normalizeRawValue),
    ...createResponsiveStyle('--layout-grid-auto-rows', props.autoRows, normalizeLength),
  }
}

export function createLayoutGridItemStyle(props: LayoutGridItemProps): LayoutStyle {
  return {
    ...createResponsiveFlexSpanStyle(props.span),
    ...createResponsiveGridColumnStyle(props),
    ...createResponsiveStyle('--layout-grid-item-offset', props.offset, normalizeOffset),
    ...createResponsiveStyle('--layout-grid-item-order', props.order, normalizeNumber),
    ...createResponsiveStyle('--layout-grid-item-align-self', props.alignSelf, normalizeAlignment),
    ...createResponsiveStyle('--layout-grid-item-justify-self', props.justifySelf, normalizeAlignment),
  }
}

export function createResponsiveStyle<T>(
  cssVar: CssVarName,
  value: ResponsiveProp<T> | undefined,
  normalize: (value: T) => string | number | undefined,
): LayoutStyle {
  const style = {} as LayoutStyle

  if (value === undefined || value === null) return style

  if (!isResponsiveRecord(value)) {
    setStyleValue(style, cssVar, normalize(value))
    return style
  }

  for (const breakpoint of layoutBreakpoints) {
    const breakpointValue = value[breakpoint]
    if (breakpointValue === undefined || breakpointValue === null) continue
    setStyleValue(style, breakpointCssVar(cssVar, breakpoint), normalize(breakpointValue))
  }

  return style
}

function createResponsiveFlexSpanStyle(value: ResponsiveProp<LayoutSpan> | undefined): LayoutStyle {
  const style = {} as LayoutStyle
  if (value === undefined || value === null) return style

  const setSpanVars = (breakpoint: LayoutBreakpoint, spanValue: LayoutSpan) => {
    const flexSpan = normalizeFlexSpan(spanValue)
    if (!flexSpan) return

    setStyleValue(style, breakpointCssVar('--layout-grid-item-display', breakpoint), flexSpan.display)
    setStyleValue(style, breakpointCssVar('--layout-grid-item-flex', breakpoint), flexSpan.flex)
    setStyleValue(style, breakpointCssVar('--layout-grid-item-max-width', breakpoint), flexSpan.maxWidth)
  }

  if (!isResponsiveRecord(value)) {
    setSpanVars('base', value)
    return style
  }

  for (const breakpoint of layoutBreakpoints) {
    const breakpointValue = value[breakpoint]
    if (breakpointValue === undefined || breakpointValue === null) continue
    setSpanVars(breakpoint, breakpointValue)
  }

  return style
}

function createResponsiveGridColumnStyle(props: LayoutGridItemProps): LayoutStyle {
  const style = {} as LayoutStyle
  let currentSpan: LayoutSpan | undefined
  let currentStart: LayoutLine | undefined
  let currentOffset: number | undefined

  for (const breakpoint of layoutBreakpoints) {
    const spanValue = getBreakpointValue(props.span, breakpoint)
    const startValue = getBreakpointValue(props.start, breakpoint)
    const offsetValue = getBreakpointValue(props.offset, breakpoint)

    if (spanValue !== undefined) currentSpan = spanValue
    if (startValue !== undefined) currentStart = startValue
    if (offsetValue !== undefined) currentOffset = offsetValue

    const shouldSetColumn =
      hasBreakpointValue(props.span, breakpoint) ||
      hasBreakpointValue(props.start, breakpoint) ||
      hasBreakpointValue(props.offset, breakpoint)

    if (!shouldSetColumn) continue

    setStyleValue(
      style,
      breakpointCssVar('--layout-grid-item-column', breakpoint),
      normalizeGridColumn({
        span: currentSpan,
        start: currentStart,
        offset: currentOffset,
      }),
    )
  }

  return style
}

function normalizeGridColumn(options: {
  span?: LayoutSpan
  start?: LayoutLine
  offset?: number
}): string | undefined {
  const span = normalizeGridSpan(options.span)
  const start = normalizeStart(options.start, options.offset)

  if (span === 0) return undefined
  if (!span && !start) return undefined

  const columnStart = start ?? 'auto'
  const columnEnd = span ? `span ${span}` : 'auto'

  return `${columnStart} / ${columnEnd}`
}

function normalizeColumns(value: LayoutColumns): string | undefined {
  if (typeof value === 'number') {
    const columns = normalizeColumnUnit(value)
    return columns === 0 ? 'none' : `repeat(${columns}, minmax(0, 1fr))`
  }

  const trimmed = value.trim()
  if (!trimmed) return undefined

  if (/^\d+$/.test(trimmed)) {
    const columns = normalizeColumnUnit(Number(trimmed))
    return columns === 0 ? 'none' : `repeat(${columns}, minmax(0, 1fr))`
  }

  if (trimmed === 'responsive' || trimmed === 'auto-fit') {
    return 'repeat(auto-fit, minmax(min(100%, 14rem), 1fr))'
  }

  if (trimmed === 'auto-fill') {
    return 'repeat(auto-fill, minmax(min(100%, 14rem), 1fr))'
  }

  return trimmed
}

function normalizeLength(value: LayoutLength): string | undefined {
  if (typeof value === 'number') {
    return `${Math.max(0, value)}px`
  }

  const trimmed = value.trim()
  if (!trimmed) return undefined

  if (lengthTokens[trimmed]) return lengthTokens[trimmed]
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return `${Math.max(0, Number(trimmed))}px`

  return trimmed
}

function normalizeWrap(value: LayoutWrap): string | undefined {
  if (typeof value === 'boolean') return value ? 'wrap' : 'nowrap'
  return value
}

function normalizeAlignment(value: LayoutItemsAlignment | LayoutSelfAlignment): string | undefined {
  if (!value) return undefined
  return value
}

function normalizeContentAlignment(value: LayoutContentAlignment): string | undefined {
  if (!value) return undefined
  return contentAlignmentMap[value] ?? value
}

function normalizeRawValue<T extends string>(value: T): string | undefined {
  return value || undefined
}

function normalizeNumber(value: number): number | undefined {
  return Number.isFinite(value) ? value : undefined
}

function normalizeOffset(value: number): string | undefined {
  return columnPercent(normalizeColumnUnit(value))
}

function normalizeFlexSpan(value: LayoutSpan | undefined): {
  display: string
  flex: string
  maxWidth: string
} | undefined {
  if (value === undefined || value === null) return undefined
  if (value === 'auto') {
    return {
      display: 'block',
      flex: '1 1 0',
      maxWidth: 'none',
    }
  }

  const span = value === 'full' ? LAYOUT_COLUMN_COUNT : normalizeColumnUnit(value)
  if (span === 0) {
    return {
      display: 'none',
      flex: '0 0 0',
      maxWidth: '0',
    }
  }

  const width = columnPercent(span)
  return {
    display: 'block',
    flex: `0 0 ${width}`,
    maxWidth: width,
  }
}

function normalizeGridSpan(value: LayoutSpan | undefined): number | undefined {
  if (value === undefined || value === null || value === 'auto') return undefined
  if (value === 'full') return LAYOUT_COLUMN_COUNT
  return normalizeColumnUnit(value)
}

function normalizeStart(start: LayoutLine | undefined, offset: number | undefined): number | 'auto' | undefined {
  if (start === 'auto') return 'auto'
  if (typeof start === 'number') return normalizeGridLine(start)
  if (typeof offset === 'number' && Number.isFinite(offset) && offset > 0) {
    return normalizeColumnUnit(offset) + 1
  }
  return undefined
}

function normalizeGridLine(value: number): number {
  return Math.max(1, Math.min(LAYOUT_COLUMN_COUNT + 1, Math.floor(value)))
}

function normalizeColumnUnit(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(LAYOUT_COLUMN_COUNT, Math.floor(value)))
}

function columnPercent(value: number): string {
  if (value <= 0) return '0'
  if (value >= LAYOUT_COLUMN_COUNT) return '100%'
  return `${Number(((value / LAYOUT_COLUMN_COUNT) * 100).toFixed(6))}%`
}

function breakpointCssVar(cssVar: CssVarName, breakpoint: LayoutBreakpoint): CssVarName {
  return breakpoint === 'base' ? cssVar : `${cssVar}-${breakpoint}`
}

function setStyleValue(style: LayoutStyle, cssVar: CssVarName, value: string | number | undefined) {
  if (value === undefined || value === '') return
  style[cssVar] = value
}

function getBreakpointValue<T>(value: ResponsiveProp<T> | undefined, breakpoint: LayoutBreakpoint): T | undefined {
  if (value === undefined || value === null) return undefined
  if (!isResponsiveRecord(value)) return breakpoint === 'base' ? value : undefined
  return value[breakpoint]
}

function hasBreakpointValue<T>(value: ResponsiveProp<T> | undefined, breakpoint: LayoutBreakpoint): boolean {
  if (value === undefined || value === null) return false
  if (!isResponsiveRecord(value)) return breakpoint === 'base'
  return value[breakpoint] !== undefined && value[breakpoint] !== null
}

function isResponsiveRecord<T>(value: ResponsiveProp<T>): value is Partial<Record<LayoutBreakpoint, T>> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  return layoutBreakpoints.some((breakpoint) => breakpoint in value)
}
