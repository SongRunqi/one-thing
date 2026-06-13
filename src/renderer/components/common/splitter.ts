import type { ComputedRef, InjectionKey, Ref, StyleValue } from 'vue'

export type SplitterLayout = 'horizontal' | 'vertical'
export type SplitterLength = number | string
export type SplitterSizeUnit = 'percent' | 'px'

export interface SplitterPanelState {
  key: symbol
  element: Ref<HTMLElement | null>
  size: ComputedRef<number | undefined>
  sizeUnit: ComputedRef<SplitterSizeUnit>
  flex: ComputedRef<boolean>
  min: ComputedRef<number | undefined>
  max: ComputedRef<number | undefined>
  resizable: ComputedRef<boolean>
  collapsible: ComputedRef<boolean>
  collapsed: ComputedRef<boolean | undefined>
  collapsedSize: ComputedRef<number>
  collapseThreshold: ComputedRef<number | undefined>
  emitSize: (size: number) => void
  emitCollapsed: (collapsed: boolean) => void
}

export interface SplitterContext {
  layout: ComputedRef<SplitterLayout>
  registerPanel: (panel: SplitterPanelState) => void
  unregisterPanel: (key: symbol) => void
  syncPanelSizes: () => void
  getPanelStyle: (key: symbol) => StyleValue
  getPanelSize: (key: symbol) => number
  isPanelCollapsed: (key: symbol) => boolean
  togglePanelCollapsed: (key: symbol) => void
}

export const splitterContextKey: InjectionKey<SplitterContext> = Symbol('splitter')

export function normalizeSplitterLength(value: SplitterLength | undefined, fallback: string): string {
  if (value === undefined || value === null || value === '') return fallback
  return typeof value === 'number' ? `${value}px` : value
}

export function isFiniteSize(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

export function roundSplitterSize(value: number): number {
  return Math.round(value * 10000) / 10000
}
