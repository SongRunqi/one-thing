import type { Component, StyleValue } from 'vue'

const containerBreakpoints = ['base', 'sm', 'md', 'lg', 'xl'] as const

export type ContainerBreakpoint = (typeof containerBreakpoints)[number]
export type ContainerResponsiveProp<T> = T | Partial<Record<ContainerBreakpoint, T>>
export type ContainerLength = number | string
export type ContainerStyle = Record<`--${string}`, string | number>

export type ContainerSidebarPosition = 'left' | 'right'
export type ContainerOverflow = 'visible' | 'hidden' | 'clip' | 'auto' | 'scroll'
export type ContainerFlexDirection = 'row' | 'row-reverse' | 'column' | 'column-reverse'
export type ContainerFlexWrap = boolean | 'wrap' | 'nowrap' | 'wrap-reverse'
export type ContainerFlexAlignment = 'start' | 'center' | 'end' | 'stretch' | 'baseline' | 'flex-start' | 'flex-end'
export type ContainerFlexJustify =
  | 'start'
  | 'center'
  | 'end'
  | 'flex-start'
  | 'flex-end'
  | 'space-between'
  | 'space-around'
  | 'space-evenly'
  | 'between'
  | 'around'
  | 'evenly'
export type ContainerFlexContentAlignment = ContainerFlexJustify | 'stretch'
export type ContainerFlexValue = number | string
export type ContainerClassValue =
  | string
  | Record<string, boolean>
  | Array<string | Record<string, boolean>>

export interface ContainerProps {
  as?: string | Component
  headerAs?: string | Component
  sidebarAs?: string | Component
  mainAs?: string | Component
  footerAs?: string | Component
  headerClass?: ContainerClassValue
  headerStyle?: StyleValue
  bodyClass?: ContainerClassValue
  bodyStyle?: StyleValue
  sidebarClass?: ContainerClassValue
  sidebarStyle?: StyleValue
  mainClass?: ContainerClassValue
  mainStyle?: StyleValue
  footerClass?: ContainerClassValue
  footerStyle?: StyleValue
  sidebarPosition?: ContainerSidebarPosition
  width?: ContainerResponsiveProp<ContainerLength>
  height?: ContainerResponsiveProp<ContainerLength>
  minHeight?: ContainerResponsiveProp<ContainerLength>
  gap?: ContainerResponsiveProp<ContainerLength>
  rowGap?: ContainerResponsiveProp<ContainerLength>
  columnGap?: ContainerResponsiveProp<ContainerLength>
  padding?: ContainerResponsiveProp<ContainerLength>
  headerHeight?: ContainerResponsiveProp<ContainerLength>
  footerHeight?: ContainerResponsiveProp<ContainerLength>
  sidebarWidth?: ContainerResponsiveProp<ContainerLength>
  mainPadding?: ContainerResponsiveProp<ContainerLength>
  sidebarPadding?: ContainerResponsiveProp<ContainerLength>
  overflow?: ContainerResponsiveProp<ContainerOverflow>
  mainOverflow?: ContainerResponsiveProp<ContainerOverflow>
  sidebarOverflow?: ContainerResponsiveProp<ContainerOverflow>
  bodyDirection?: ContainerResponsiveProp<ContainerFlexDirection>
  bodyWrap?: ContainerResponsiveProp<ContainerFlexWrap>
  bodyAlign?: ContainerResponsiveProp<ContainerFlexAlignment>
  bodyJustify?: ContainerResponsiveProp<ContainerFlexJustify>
  bodyAlignContent?: ContainerResponsiveProp<ContainerFlexContentAlignment>
  mainFlex?: ContainerResponsiveProp<ContainerFlexValue>
  sidebarFlex?: ContainerResponsiveProp<ContainerFlexValue>
  fullHeight?: boolean
}

type CssVarName = `--${string}`

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

const flexContentAlignmentMap: Record<string, string> = {
  between: 'space-between',
  around: 'space-around',
  evenly: 'space-evenly',
}

export function createContainerStyle(props: ContainerProps): ContainerStyle {
  return {
    ...createResponsiveStyle('--layout-container-width', props.width, normalizeLength),
    ...createResponsiveStyle('--layout-container-height', props.height ?? (props.fullHeight ? '100%' : undefined), normalizeLength),
    ...createResponsiveStyle('--layout-container-min-height', props.minHeight, normalizeLength),
    ...createResponsiveStyle('--layout-container-gap', props.gap, normalizeLength),
    ...createResponsiveStyle('--layout-container-row-gap', props.rowGap, normalizeLength),
    ...createResponsiveStyle('--layout-container-column-gap', props.columnGap, normalizeLength),
    ...createResponsiveStyle('--layout-container-padding', props.padding, normalizeLength),
    ...createResponsiveStyle('--layout-container-header-height', props.headerHeight, normalizeLength),
    ...createResponsiveStyle('--layout-container-footer-height', props.footerHeight, normalizeLength),
    ...createResponsiveStyle('--layout-container-sidebar-width', props.sidebarWidth, normalizeLength),
    ...createResponsiveStyle('--layout-container-main-padding', props.mainPadding, normalizeLength),
    ...createResponsiveStyle('--layout-container-sidebar-padding', props.sidebarPadding, normalizeLength),
    ...createResponsiveStyle('--layout-container-overflow', props.overflow, normalizeRawValue),
    ...createResponsiveStyle('--layout-container-main-overflow', props.mainOverflow, normalizeRawValue),
    ...createResponsiveStyle('--layout-container-sidebar-overflow', props.sidebarOverflow, normalizeRawValue),
    ...createResponsiveStyle('--layout-container-body-direction', props.bodyDirection, normalizeRawValue),
    ...createResponsiveStyle('--layout-container-body-wrap', props.bodyWrap, normalizeFlexWrap),
    ...createResponsiveStyle('--layout-container-body-align-items', props.bodyAlign, normalizeRawValue),
    ...createResponsiveStyle('--layout-container-body-justify-content', props.bodyJustify, normalizeFlexContentAlignment),
    ...createResponsiveStyle('--layout-container-body-align-content', props.bodyAlignContent, normalizeFlexContentAlignment),
    ...createResponsiveStyle('--layout-container-main-flex', props.mainFlex, normalizeFlexValue),
    ...createResponsiveStyle('--layout-container-sidebar-flex', props.sidebarFlex, normalizeFlexValue),
  }
}

function createResponsiveStyle<T>(
  cssVar: CssVarName,
  value: ContainerResponsiveProp<T> | undefined,
  normalize: (value: T) => string | number | undefined,
): ContainerStyle {
  const style = {} as ContainerStyle

  if (value === undefined || value === null) return style

  if (!isResponsiveRecord(value)) {
    setStyleValue(style, cssVar, normalize(value))
    return style
  }

  for (const breakpoint of containerBreakpoints) {
    const breakpointValue = value[breakpoint]
    if (breakpointValue === undefined || breakpointValue === null) continue
    setStyleValue(style, breakpointCssVar(cssVar, breakpoint), normalize(breakpointValue))
  }

  return style
}

function normalizeLength(value: ContainerLength): string | undefined {
  if (typeof value === 'number') {
    return `${Math.max(0, value)}px`
  }

  const trimmed = value.trim()
  if (!trimmed) return undefined

  if (lengthTokens[trimmed]) return lengthTokens[trimmed]
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return `${Math.max(0, Number(trimmed))}px`

  return trimmed
}

function normalizeRawValue<T extends string>(value: T): string | undefined {
  return value || undefined
}

function normalizeFlexWrap(value: ContainerFlexWrap): string | undefined {
  if (typeof value === 'boolean') return value ? 'wrap' : 'nowrap'
  return value || undefined
}

function normalizeFlexContentAlignment(value: ContainerFlexJustify | ContainerFlexContentAlignment): string | undefined {
  if (!value) return undefined
  return flexContentAlignmentMap[value] ?? value
}

function normalizeFlexValue(value: ContainerFlexValue): string | number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  const trimmed = value.trim()
  return trimmed || undefined
}

function breakpointCssVar(cssVar: CssVarName, breakpoint: ContainerBreakpoint): CssVarName {
  return breakpoint === 'base' ? cssVar : `${cssVar}-${breakpoint}`
}

function setStyleValue(style: ContainerStyle, cssVar: CssVarName, value: string | number | undefined) {
  if (value === undefined || value === '') return
  style[cssVar] = value
}

function isResponsiveRecord<T>(
  value: ContainerResponsiveProp<T>,
): value is Partial<Record<ContainerBreakpoint, T>> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  return containerBreakpoints.some((breakpoint) => breakpoint in value)
}
