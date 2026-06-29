import type { JsonObject } from '../json.js'
import { buildContextCompactPrompt } from './compact-prompt.js'
import { sanitizeToolResultForAI } from './history.js'
import {
  estimateTextTokens,
  getContextUsageTriggerReason,
} from './context-usage.js'

export const DEFAULT_KEEP_RECENT_TURNS = 6
export const SUMMARY_MAX_OUTPUT_TOKENS = 1600
export const MAX_CHUNK_CHARS = 80000
export const SUMMARY_TOOL_RESULT_MAX_CHARS = 6000

export interface CoreCompactAttachment {
  fileName: string
  mimeType: string
  size: number
}

export interface CoreCompactToolCall {
  toolId?: string
  toolName: string
  arguments?: JsonObject
  status?: string
  result?: any
  error?: string
  rejectionReason?: string
}

export interface CoreCompactMessage {
  id: string
  role: string
  content?: string
  reasoning?: string
  isStreaming?: boolean
  attachments?: CoreCompactAttachment[]
  toolCalls?: CoreCompactToolCall[]
}

export interface CoreCompactSession<TMessage extends CoreCompactMessage = CoreCompactMessage> {
  id?: string
  messages: TMessage[]
  summary?: string
  summaryUpToMessageId?: string
  contextSize?: number
  lastInputTokens?: number
}

export interface CompactPlan<TMessage extends CoreCompactMessage = CoreCompactMessage> {
  cutoffIndex: number
  cutoffMessage: TMessage
  messagesToSummarize: TMessage[]
  previousSummary?: string
}

export type CoreContextCompactStatus = 'compacting' | 'completed' | 'failed'

export interface CoreContextCompactContent {
  type: 'context-compact'
  status: CoreContextCompactStatus
  summary: string
  compactedMessageCount: number
  error?: string
}

export interface CoreContextCompactMessage {
  id: string
  role: 'system'
  content: string
  timestamp: number
}

export function buildContextCompactContent(input: {
  status: CoreContextCompactStatus
  compactedMessageCount: number
  summary?: string
  error?: string
}): string {
  const content: CoreContextCompactContent = {
    type: 'context-compact',
    status: input.status,
    summary: input.summary ?? '',
    compactedMessageCount: input.compactedMessageCount,
  }
  if (input.error) {
    content.error = input.error
  }
  return JSON.stringify(content)
}

export function createContextCompactMessage(input: {
  id: string
  timestamp: number
  compactedMessageCount: number
}): CoreContextCompactMessage {
  return {
    id: input.id,
    role: 'system',
    content: buildContextCompactContent({
      status: 'compacting',
      compactedMessageCount: input.compactedMessageCount,
    }),
    timestamp: input.timestamp,
  }
}

export function buildContextCompactCompletedContent(summary: string, compactedMessageCount: number): string {
  return buildContextCompactContent({
    status: 'completed',
    summary,
    compactedMessageCount,
  })
}

export function buildContextCompactFailedContent(error: string, compactedMessageCount: number): string {
  return buildContextCompactContent({
    status: 'failed',
    summary: '',
    error,
    compactedMessageCount,
  })
}

export function normalizeContextCompactError(error: unknown, fallback = 'Failed to compact context'): string {
  return error instanceof Error && error.message
    ? error.message
    : fallback
}

export interface CoreContextSummaryChunkInput {
  chunk: string
  previousSummary?: string
}

export interface CoreContextCompactSummaryMessage {
  role: 'system' | 'user'
  content: string
}

export interface SummarizeContextInChunksOptions {
  messages: string
  previousSummary?: string
  maxChunkChars?: number
  summarizeChunk: (input: CoreContextSummaryChunkInput) => string | Promise<string>
}

export function buildContextCompactSummaryMessages(
  input: CoreContextSummaryChunkInput,
): CoreContextCompactSummaryMessage[] {
  return [
    {
      role: 'system',
      content: 'You summarize chat history for context compaction. Return only valid JSON matching the requested schema.',
    },
    {
      role: 'user',
      content: buildContextCompactPrompt(input.chunk, input.previousSummary),
    },
  ]
}

export async function summarizeContextInChunks(
  options: SummarizeContextInChunksOptions,
): Promise<string> {
  const chunks = chunkText(options.messages, options.maxChunkChars ?? MAX_CHUNK_CHARS)
  let summary = options.previousSummary || ''

  for (const chunk of chunks) {
    const nextSummary = await options.summarizeChunk({
      chunk,
      previousSummary: summary || undefined,
    })
    summary = normalizeContextSummaryOutput(nextSummary)
  }

  return summary.trim()
}

export function selectCompactPlan<TMessage extends CoreCompactMessage>(
  session: CoreCompactSession<TMessage>,
  keepRecentTurns = DEFAULT_KEEP_RECENT_TURNS,
): CompactPlan<TMessage> | null {
  const messages = session.messages.filter(message => message.role === 'user' || message.role === 'assistant')
  if (messages.length === 0) return null

  let userTurnsSeen = 0
  let recentStartMessageId: string | undefined

  for (let index = messages.length - 1; index >= 0; index--) {
    if (messages[index].role === 'user') {
      userTurnsSeen++
      if (userTurnsSeen >= keepRecentTurns) {
        recentStartMessageId = messages[index].id
        break
      }
    }
  }

  if (!recentStartMessageId) return null

  const recentStartIndex = session.messages.findIndex(message => message.id === recentStartMessageId)
  const cutoffIndex = recentStartIndex - 1
  if (cutoffIndex < 0) return null

  const cutoffMessage = session.messages[cutoffIndex]
  let previousSummaryIndex = -1
  let previousSummary: string | undefined
  if (session.summary && session.summaryUpToMessageId) {
    previousSummaryIndex = session.messages.findIndex(message => message.id === session.summaryUpToMessageId)
    if (previousSummaryIndex === -1) {
      console.warn('[ContextCompact] Ignoring summary with missing anchor:', {
        sessionId: session.id,
        summaryUpToMessageId: session.summaryUpToMessageId,
      })
    } else {
      previousSummary = session.summary
    }
  }

  if (previousSummaryIndex >= cutoffIndex) return null

  const messagesToSummarize = session.messages
    .slice(previousSummaryIndex + 1, cutoffIndex + 1)
    .filter(message => message.role === 'user' || message.role === 'assistant')

  if (messagesToSummarize.length === 0) return null

  return {
    cutoffIndex,
    cutoffMessage,
    messagesToSummarize,
    previousSummary,
  }
}

export async function shouldAutoCompactBeforeSend(options: {
  session: CoreCompactSession
  modelContextLength: number
  thresholdPercent: number
  reservedOutputTokens?: number
  inputTokens?: number
}): Promise<boolean> {
  return getContextCompactReason(options) !== null
}

export function getContextCompactReason(options: {
  session?: CoreCompactSession
  modelContextLength: number
  thresholdPercent: number
  reservedOutputTokens?: number
  inputTokens?: number
}): 'threshold' | 'hard-limit' | null {
  const inputContextSize = options.inputTokens ?? (
    options.session ? estimateCurrentInputTokens(options.session) : 0
  )
  const reason = getContextUsageTriggerReason({
    inputTokens: inputContextSize,
    modelContextLength: options.modelContextLength,
    thresholdPercent: options.thresholdPercent,
    reservedOutputTokens: options.reservedOutputTokens,
  })
  return reason === 'none' ? null : reason
}

export function estimateCurrentInputTokens(session: CoreCompactSession): number {
  const providerInputTokens = Math.max(
    0,
    session.contextSize ?? 0,
    session.lastInputTokens ?? 0,
  )
  const estimatedInputTokens = estimateSessionInputTokens(session)
  return Math.max(providerInputTokens, estimatedInputTokens)
}

export function estimateSessionInputTokens(
  session: Pick<CoreCompactSession, 'messages' | 'summary' | 'summaryUpToMessageId'>,
): number {
  const parts: string[] = []

  if (session.summary && session.summaryUpToMessageId) {
    parts.push(`[Conversation History Summary]\n${session.summary}`)
  }

  const summaryIndex = session.summary && session.summaryUpToMessageId
    ? session.messages.findIndex(message => message.id === session.summaryUpToMessageId)
    : -1
  const messages = summaryIndex >= 0
    ? session.messages.slice(summaryIndex + 1)
    : session.messages

  for (const message of messages) {
    if (message.role !== 'user' && message.role !== 'assistant') continue
    if (message.isStreaming) continue

    parts.push(`${message.role}: ${message.content || ''}`)
    if (message.reasoning) {
      parts.push(`reasoning: ${message.reasoning}`)
    }
    if (message.attachments?.length) {
      parts.push(`attachments: ${message.attachments.map(attachment =>
        `${attachment.fileName} (${attachment.mimeType}, ${attachment.size} bytes)`,
      ).join('; ')}`)
    }
    if (message.toolCalls?.length) {
      parts.push(`toolCalls: ${formatToolCallsForSummary(message.toolCalls)}`)
    }
  }

  return estimateTextTokens(parts.join('\n\n'))
}

export function shouldSkipAutoCompactForProviderUsageMismatch(options: {
  providerId: string
  session: Pick<CoreCompactSession, 'contextSize' | 'lastInputTokens'>
  modelContextLength: number
  inputTokens?: number
}): boolean {
  if (!Number.isFinite(options.modelContextLength) || options.modelContextLength <= 0) return false
  const inputContextSize = options.inputTokens ?? options.session.contextSize ?? options.session.lastInputTokens ?? 0
  return inputContextSize > options.modelContextLength
}

export function normalizeContextSummaryOutput(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''

  const withoutFence = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()

  try {
    return JSON.stringify(JSON.parse(withoutFence), null, 2)
  } catch {
    const start = withoutFence.indexOf('{')
    const end = withoutFence.lastIndexOf('}')
    if (start >= 0 && end > start) {
      const candidate = withoutFence.slice(start, end + 1)
      try {
        return JSON.stringify(JSON.parse(candidate), null, 2)
      } catch {
        // Fall through to returning the raw text.
      }
    }
  }

  return trimmed
}

export function formatMessagesForSummary<TMessage extends CoreCompactMessage>(messages: TMessage[]): string {
  return messages.map((message, index) => {
    const label = message.role === 'user' ? 'User' : 'Assistant'
    const parts = [`### ${index + 1}. ${label}`, message.content || '(empty)']

    if (message.reasoning) {
      parts.push(`Reasoning summary source:\n${message.reasoning}`)
    }

    if (message.toolCalls?.length) {
      parts.push(`Tool calls:\n${formatToolCallsForSummary(message.toolCalls)}`)
    }

    if (message.attachments?.length) {
      parts.push(`Attachments:\n${message.attachments.map(attachment => `- ${attachment.fileName} (${attachment.mimeType}, ${attachment.size} bytes)`).join('\n')}`)
    }

    return parts.join('\n\n')
  }).join('\n\n---\n\n')
}

function formatToolCallsForSummary(toolCalls: CoreCompactToolCall[]): string {
  return toolCalls.map(toolCall => {
    const status = toolCall.status ? ` (${toolCall.status})` : ''
    const lines = [`- ${toolCall.toolName || toolCall.toolId}${status}: ${safeJsonForSummary(toolCall.arguments || {})}`]
    const result = formatToolCallResultForSummary(toolCall)
    if (result) {
      lines.push(`  result: ${result}`)
    }
    return lines.join('\n')
  }).join('\n')
}

function formatToolCallResultForSummary(toolCall: CoreCompactToolCall): string {
  if (toolCall.status === 'failed' || toolCall.status === 'cancelled') {
    return compactSummaryText(toolCall.error || toolCall.rejectionReason || 'Tool did not complete.')
  }

  if (toolCall.status !== 'completed') return ''
  const sanitized = sanitizeToolResultForAI(toolCall.result)
  return compactSummaryText(safeJsonForSummary(sanitized))
}

function safeJsonForSummary(value: unknown): string {
  try {
    return typeof value === 'string' ? value : JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function compactSummaryText(value: string): string {
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (normalized.length <= SUMMARY_TOOL_RESULT_MAX_CHARS) return normalized
  return `${normalized.slice(0, SUMMARY_TOOL_RESULT_MAX_CHARS).trimEnd()} [truncated ${normalized.length - SUMMARY_TOOL_RESULT_MAX_CHARS} chars]`
}

export function chunkText(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text]

  const chunks: string[] = []
  for (let start = 0; start < text.length; start += maxChars) {
    chunks.push(text.slice(start, start + maxChars))
  }
  return chunks
}
