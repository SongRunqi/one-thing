export type CoreContextUsageTriggerReason = 'none' | 'threshold' | 'hard-limit'
export type CoreContextUsageSource = 'empty' | 'provider-usage' | 'request-estimate'

export interface CoreContextUsageSessionLike {
  contextSize?: number
  lastInputTokens?: number
  summary?: string
  summaryUpToMessageId?: string
}

export interface CoreContextUsageSnapshot {
  providerId?: string
  model?: string
  modelContextLength: number
  reservedOutputTokens: number
  thresholdPercent: number
  providerInputTokens: number
  requestEstimatedInputTokens?: number
  visibleInputTokens: number
  effectiveInputTokens: number
  contextPercent: number | null
  triggerReason: CoreContextUsageTriggerReason
  source: CoreContextUsageSource
  details: {
    historyMessageCount: number
    summaryUsed: boolean
  }
}

export function estimateTextTokens(text: string): number {
  if (!text) return 0
  const cjkCount = (text.match(/[\u4e00-\u9fff]/g) || []).length
  const nonCjkCount = Math.max(0, text.length - cjkCount)
  return Math.ceil(cjkCount / 1.8 + nonCjkCount / 4)
}

export function normalizeContextThresholdPercent(value: number | undefined): number {
  return Math.max(50, Math.min(100, value || 85))
}

export function normalizeContextLength(value: number | undefined): number {
  return value && value > 0 ? value : 128000
}

export function contextHardLimitSafetyMargin(modelContextLength: number): number {
  return Math.min(2048, Math.floor(modelContextLength * 0.01))
}

export function getContextUsageTriggerReason(input: {
  inputTokens: number
  modelContextLength: number
  thresholdPercent: number
  reservedOutputTokens?: number
}): CoreContextUsageTriggerReason {
  const contextLength = normalizeContextLength(input.modelContextLength)
  const inputTokens = Math.max(0, Math.floor(input.inputTokens || 0))
  if (inputTokens <= 0) return 'none'

  const threshold = normalizeContextThresholdPercent(input.thresholdPercent)
  const reservedOutputTokens = Math.max(0, Math.floor(input.reservedOutputTokens || 0))
  const thresholdHit = inputTokens >= Math.floor(contextLength * (threshold / 100))
  const hardLimitRisk =
    inputTokens + reservedOutputTokens >= contextLength - contextHardLimitSafetyMargin(contextLength)

  if (hardLimitRisk) return 'hard-limit'
  if (thresholdHit) return 'threshold'
  return 'none'
}

export function estimateHistoryMessagesInputTokens(historyMessages: unknown[] | undefined): number | undefined {
  if (!historyMessages) return undefined
  if (historyMessages.length === 0) return 0
  return estimateTextTokens(safeJsonForUsage(normalizeHistoryValueForUsage(historyMessages)))
}

export function buildContextUsageSnapshot(options: {
  session?: CoreContextUsageSessionLike | null
  historyMessages?: unknown[]
  modelContextLength: number
  thresholdPercent: number
  reservedOutputTokens?: number
  providerId?: string
  model?: string
}): CoreContextUsageSnapshot {
  const modelContextLength = normalizeContextLength(options.modelContextLength)
  const thresholdPercent = normalizeContextThresholdPercent(options.thresholdPercent)
  const reservedOutputTokens = Math.max(0, Math.floor(options.reservedOutputTokens || 0))
  const providerInputTokens = Math.max(
    0,
    Math.floor(options.session?.contextSize ?? 0),
    Math.floor(options.session?.lastInputTokens ?? 0),
  )
  const requestEstimatedInputTokens = estimateHistoryMessagesInputTokens(options.historyMessages)
  const hasRequestEstimate = requestEstimatedInputTokens !== undefined
  const visibleInputTokens = hasRequestEstimate
    ? Math.max(0, requestEstimatedInputTokens)
    : providerInputTokens
  const effectiveInputTokens = visibleInputTokens
  const triggerReason = getContextUsageTriggerReason({
    inputTokens: effectiveInputTokens,
    modelContextLength,
    thresholdPercent,
    reservedOutputTokens,
  })

  return {
    providerId: options.providerId,
    model: options.model,
    modelContextLength,
    reservedOutputTokens,
    thresholdPercent,
    providerInputTokens,
    requestEstimatedInputTokens,
    visibleInputTokens,
    effectiveInputTokens,
    contextPercent: modelContextLength > 0
      ? effectiveInputTokens / modelContextLength
      : null,
    triggerReason,
    source: hasRequestEstimate
      ? 'request-estimate'
      : providerInputTokens > 0
        ? 'provider-usage'
        : 'empty',
    details: {
      historyMessageCount: options.historyMessages?.length ?? 0,
      summaryUsed: Boolean(options.session?.summary && options.session?.summaryUpToMessageId),
    },
  }
}

function safeJsonForUsage(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function normalizeHistoryValueForUsage(value: unknown, depth = 0): unknown {
  if (depth > 20) return '[Max depth reached]'
  if (typeof value === 'string') return normalizeStringForUsage(value)
  if (!value || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(item => normalizeHistoryValueForUsage(item, depth + 1))

  const normalized: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(value)) {
    if (key === 'originalContent' || key === 'originalContentHash') continue
    normalized[key] = normalizeHistoryValueForUsage(child, depth + 1)
  }
  return normalized
}

function normalizeStringForUsage(value: string): string {
  if (value.length <= 4000) return value
  if (/^data:[^;]+;base64,/.test(value) || /^[A-Za-z0-9+/=]{4000,}$/.test(value)) {
    return `[large inline data omitted: ${value.length} chars]`
  }
  return value
}
