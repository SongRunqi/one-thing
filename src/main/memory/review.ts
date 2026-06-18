import type { ChatMessage } from '../../shared/ipc.js'
import type { HermesMemoryTarget } from './hermes-file-memory.js'

export type MemoryReviewAction = 'add' | 'replace' | 'remove'
export type MemoryReviewTarget = HermesMemoryTarget | 'soul' | 'dreams'

export interface MemoryReviewCandidate {
  action: MemoryReviewAction
  target: MemoryReviewTarget
  confidence: number
  content?: string
  oldText?: string
  newText?: string
  text?: string
  reason?: string
}

export interface MemoryReviewModelResult {
  candidates: MemoryReviewCandidate[]
  confidence: number
  reason?: string
}

export interface MemoryReviewProgress {
  userTurns: number
  turnsSinceReview: number
  turnsUntilReview: number
  shouldReview: boolean
}

export function countUserTurns(messages: ChatMessage[]): number {
  return messages.filter(message => message.role === 'user').length
}

export function getMemoryReviewProgress(options: {
  messages: ChatMessage[]
  interval: number
  lastReviewedTurn?: number
}): MemoryReviewProgress {
  const userTurns = countUserTurns(options.messages)
  const interval = Math.max(0, Math.floor(options.interval))
  if (interval <= 0 || userTurns <= 0) {
    return {
      userTurns,
      turnsSinceReview: 0,
      turnsUntilReview: 0,
      shouldReview: false,
    }
  }

  const turnsSinceReview = userTurns % interval
  const shouldReview = turnsSinceReview === 0 && options.lastReviewedTurn !== userTurns
  return {
    userTurns,
    turnsSinceReview,
    turnsUntilReview: shouldReview ? 0 : interval - turnsSinceReview,
    shouldReview,
  }
}

function stripJsonFence(value: string): string {
  const trimmed = value.trim()
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  return fenced?.[1]?.trim() || trimmed
}

function clampConfidence(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.min(1, value))
    : fallback
}

function normalizeAction(value: unknown): MemoryReviewAction | null {
  const action = String(value || 'add').toLowerCase()
  if (action === 'add' || action === 'replace' || action === 'remove') return action
  return null
}

function normalizeTarget(value: unknown): MemoryReviewTarget | null {
  const target = String(value || 'memory').toLowerCase()
  if (target === 'user' || target === 'memory' || target === 'soul' || target === 'dreams') return target
  return null
}

function asText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

export function parseMemoryReviewModelResult(value: string): MemoryReviewModelResult | null {
  const jsonText = stripJsonFence(value)
  const start = jsonText.indexOf('{')
  const end = jsonText.lastIndexOf('}')
  if (start < 0 || end <= start) return null

  try {
    const parsed = JSON.parse(jsonText.slice(start, end + 1)) as {
      action?: unknown
      confidence?: unknown
      memories?: unknown
      candidates?: unknown
      reason?: unknown
    }
    if (String(parsed.action || '').toLowerCase() === 'none') return null

    const confidence = clampConfidence(parsed.confidence, 0.75)
    const rawItems = Array.isArray(parsed.memories)
      ? parsed.memories
      : Array.isArray(parsed.candidates)
        ? parsed.candidates
        : []

    const candidates = rawItems
      .map((item): MemoryReviewCandidate | null => {
        if (!item || typeof item !== 'object') return null
        const record = item as Record<string, unknown>
        const action = normalizeAction(record.action)
        const target = normalizeTarget(record.target)
        if (!action || !target) return null

        const sensitivity = String(record.sensitivity || 'normal').toLowerCase()
        if (sensitivity === 'secret' || sensitivity === 'sensitive') return null

        const candidateConfidence = clampConfidence(record.confidence, confidence)
        const content = asText(record.content) || asText(record.memory)
        const oldText = asText(record.oldText) || asText(record.old_text)
        const newText = asText(record.newText) || asText(record.new_text)
        const text = asText(record.text) || oldText || content

        if (action === 'add' && !content && !text) return null
        if (action === 'replace' && (!oldText || typeof newText !== 'string')) return null
        if (action === 'remove' && !text) return null

        return {
          action,
          target,
          confidence: candidateConfidence,
          ...(content || text ? { content: content || text } : {}),
          ...(oldText ? { oldText } : {}),
          ...(typeof newText === 'string' ? { newText } : {}),
          ...(text ? { text } : {}),
          ...(typeof record.reason === 'string' ? { reason: record.reason.slice(0, 500) } : {}),
        }
      })
      .filter((item): item is MemoryReviewCandidate => Boolean(item))

    if (candidates.length === 0) return null
    return {
      candidates,
      confidence,
      reason: typeof parsed.reason === 'string' ? parsed.reason.slice(0, 500) : undefined,
    }
  } catch {
    return null
  }
}

export function formatMemoryReviewConversation(messages: ChatMessage[], maxChars: number): string {
  const formatted = messages
    .filter(message => message.role === 'user' || message.role === 'assistant')
    .map(message => {
      const role = message.role === 'assistant' ? 'Assistant' : 'User'
      const content = message.content.trim()
      return content ? `${role}: ${content}` : ''
    })
    .filter(Boolean)
    .join('\n\n')

  const limit = Math.max(1000, Math.floor(maxChars))
  if (formatted.length <= limit) return formatted

  const tail = formatted.slice(-limit)
  const boundary = tail.indexOf('\n\n')
  const trimmedTail = boundary > 0 ? tail.slice(boundary + 2).trimStart() : tail.trimStart()
  return `[Older conversation omitted]\n\n${trimmedTail}`
}
