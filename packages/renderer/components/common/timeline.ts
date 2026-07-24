import type { Component, ComputedRef, InjectionKey } from 'vue'

export const timelineModes = ['start', 'alternate', 'alternate-reverse', 'end'] as const
export const timelineItemPlacements = ['top', 'bottom'] as const
export const timelineItemTypes = ['', 'primary', 'success', 'warning', 'danger', 'info'] as const
export const timelineItemSizeNames = ['normal', 'large'] as const

export type TimelineMode = (typeof timelineModes)[number]
export type TimelineItemPlacement = (typeof timelineItemPlacements)[number]
export type TimelineItemType = (typeof timelineItemTypes)[number]
export type TimelineItemSizeName = (typeof timelineItemSizeNames)[number]
export type TimelineItemNodeSize = TimelineItemSizeName | number | string
export type TimelineItemIcon = string | Component

export interface TimelineContext {
  mode: ComputedRef<TimelineMode>
}

export const timelineContextKey: InjectionKey<TimelineContext> = Symbol('TimelineContext')

export function normalizeTimelineMode(mode: string | undefined): TimelineMode {
  if (mode && timelineModes.includes(mode as TimelineMode)) {
    return mode as TimelineMode
  }

  return 'start'
}

export function normalizeTimelinePlacement(placement: string | undefined): TimelineItemPlacement {
  if (placement && timelineItemPlacements.includes(placement as TimelineItemPlacement)) {
    return placement as TimelineItemPlacement
  }

  return 'bottom'
}

export function normalizeTimelineItemSize(size: TimelineItemNodeSize | undefined): string {
  if (size === 'large') return '16px'
  if (size === 'normal' || size === undefined) return '12px'

  return normalizeCssLength(size)
}

function normalizeCssLength(value: number | string): string {
  if (typeof value === 'number') {
    return `${Math.max(0, value)}px`
  }

  const trimmed = value.trim()
  if (!trimmed) return '12px'
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return `${Math.max(0, Number(trimmed))}px`

  return trimmed
}
