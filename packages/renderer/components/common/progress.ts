export const progressTypes = ['line', 'circle', 'dashboard'] as const
export const progressStatuses = ['success', 'warning', 'exception'] as const
export const progressStrokeLinecaps = ['butt', 'round', 'square'] as const

export type ProgressType = (typeof progressTypes)[number]
export type ProgressStatus = (typeof progressStatuses)[number]
export type ProgressStrokeLinecap = (typeof progressStrokeLinecaps)[number]

export interface ProgressColorStop {
  color: string
  percentage: number
}

export type ProgressColor =
  | string
  | ProgressColorStop[]
  | ((percentage: number) => string)

const progressStatusColors: Record<ProgressStatus, string> = {
  success: 'var(--ui-status-success-fg, var(--color-success))',
  warning: 'var(--ui-status-warning-fg, var(--color-warning))',
  exception: 'var(--ui-status-danger-fg, var(--color-danger))',
}

const defaultProgressColor = 'var(--ui-accent-primary-fg)'

export function normalizeProgressPercentage(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(100, Math.max(0, value))
}

export function resolveProgressStatusColor(status?: ProgressStatus): string {
  return status ? progressStatusColors[status] : defaultProgressColor
}

export function resolveProgressColor(
  color: ProgressColor | undefined,
  percentage: number,
  status?: ProgressStatus,
): string {
  const normalizedPercentage = normalizeProgressPercentage(percentage)

  if (typeof color === 'string' && color.trim()) {
    return color
  }

  if (typeof color === 'function') {
    return color(normalizedPercentage) || resolveProgressStatusColor(status)
  }

  if (Array.isArray(color) && color.length > 0) {
    const sortedStops = [...color]
      .filter((stop) => typeof stop.color === 'string' && stop.color.trim())
      .sort((a, b) => a.percentage - b.percentage)

    const matchedStop = sortedStops.find((stop) => normalizedPercentage <= stop.percentage)
    return matchedStop?.color ?? sortedStops[sortedStops.length - 1]?.color ?? resolveProgressStatusColor(status)
  }

  return resolveProgressStatusColor(status)
}
