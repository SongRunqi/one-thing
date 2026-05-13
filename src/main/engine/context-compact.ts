import { v4 as uuidv4 } from 'uuid'
import type { AppSettings, ChatMessage, ChatSession } from '../../shared/ipc.js'
import type { ProviderConfigWithKey } from './stream/stream-executor.js'
import { generateChatResponse } from '../providers/index.js'
import { buildContextCompactPrompt } from './prompt/index.js'
import * as store from '../store.js'

export interface ContextCompactResult {
  success: boolean
  skipped?: boolean
  summary?: string
  message?: ChatMessage
  compactedThroughMessageId?: string
  error?: string
}

interface CompactPlan {
  cutoffIndex: number
  cutoffMessage: ChatMessage
  messagesToSummarize: ChatMessage[]
  previousSummary?: string
}

const DEFAULT_KEEP_RECENT_TURNS = 6
const SUMMARY_MAX_OUTPUT_TOKENS = 1200
const MAX_CHUNK_CHARS = 80000

export function selectCompactPlan(
  session: ChatSession,
  keepRecentTurns = DEFAULT_KEEP_RECENT_TURNS,
): CompactPlan | null {
  const messages = session.messages.filter(m => m.role === 'user' || m.role === 'assistant')
  if (messages.length === 0) return null

  let userTurnsSeen = 0
  let recentStartMessageId: string | undefined

  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') {
      userTurnsSeen++
      if (userTurnsSeen >= keepRecentTurns) {
        recentStartMessageId = messages[i].id
        break
      }
    }
  }

  if (!recentStartMessageId) return null

  const recentStartIndex = session.messages.findIndex(m => m.id === recentStartMessageId)
  const cutoffIndex = recentStartIndex - 1
  if (cutoffIndex < 0) return null

  const cutoffMessage = session.messages[cutoffIndex]
  const previousSummaryIndex = session.summaryUpToMessageId
    ? session.messages.findIndex(m => m.id === session.summaryUpToMessageId)
    : -1

  if (previousSummaryIndex >= cutoffIndex) return null

  const messagesToSummarize = session.messages
    .slice(previousSummaryIndex + 1, cutoffIndex + 1)
    .filter(m => m.role === 'user' || m.role === 'assistant')

  if (messagesToSummarize.length === 0) return null

  return {
    cutoffIndex,
    cutoffMessage,
    messagesToSummarize,
    previousSummary: session.summary,
  }
}

export async function compactSessionContext(options: {
  sessionId: string
  providerId: string
  configWithApiKey: ProviderConfigWithKey
  settings: AppSettings
  keepRecentTurns?: number
  onMessageCreated?: (message: ChatMessage) => Promise<void>
  onMessageUpdated?: (messageId: string, updates: Partial<ChatMessage>) => Promise<void>
}): Promise<ContextCompactResult> {
  const session = store.getSession(options.sessionId)
  if (!session) {
    return { success: false, error: 'Session not found' }
  }

  const plan = selectCompactPlan(session, options.keepRecentTurns)
  if (!plan) {
    return {
      success: true,
      skipped: true,
      error: `Nothing to compact yet. Need more than ${options.keepRecentTurns ?? DEFAULT_KEEP_RECENT_TURNS} recent turns.`,
    }
  }

  const compactMessage: ChatMessage = {
    id: uuidv4(),
    role: 'system',
    content: JSON.stringify({
      type: 'context-compact',
      status: 'compacting',
      summary: '',
      compactedMessageCount: plan.messagesToSummarize.length,
    }),
    timestamp: Date.now(),
  }

  store.insertMessageAfter(options.sessionId, plan.cutoffMessage.id, compactMessage)
  await options.onMessageCreated?.(compactMessage)

  try {
    const formattedMessages = formatMessagesForSummary(plan.messagesToSummarize)
    const summary = await summarizeInChunks({
      providerId: options.providerId,
      configWithApiKey: options.configWithApiKey,
      settings: options.settings,
      messages: formattedMessages,
      previousSummary: plan.previousSummary,
    })

    const finalContent = JSON.stringify({
      type: 'context-compact',
      status: 'completed',
      summary,
      compactedMessageCount: plan.messagesToSummarize.length,
    })

    store.updateSessionSummary(options.sessionId, summary, plan.cutoffMessage.id)
    store.updateSessionContextSize(options.sessionId, 0)
    store.updateMessageContent(options.sessionId, compactMessage.id, finalContent)
    await options.onMessageUpdated?.(compactMessage.id, { content: finalContent })

    return {
      success: true,
      summary,
      message: { ...compactMessage, content: finalContent },
      compactedThroughMessageId: plan.cutoffMessage.id,
    }
  } catch (error: any) {
    console.error('[ContextCompact] Failed to compact session:', error)
    const errorMessage = error?.message || 'Failed to compact context'
    const failedContent = JSON.stringify({
      type: 'context-compact',
      status: 'failed',
      summary: '',
      error: errorMessage,
      compactedMessageCount: plan.messagesToSummarize.length,
    })
    store.updateMessageContent(options.sessionId, compactMessage.id, failedContent)
    await options.onMessageUpdated?.(compactMessage.id, { content: failedContent })

    return {
      success: false,
      message: { ...compactMessage, content: failedContent },
      error: errorMessage,
    }
  }
}

export async function shouldAutoCompactBeforeSend(options: {
  session: ChatSession
  modelContextLength: number
  thresholdPercent: number
  reservedOutputTokens?: number
}): Promise<boolean> {
  return getContextCompactReason(options) !== null
}

export function getContextCompactReason(options: {
  session: ChatSession
  modelContextLength: number
  thresholdPercent: number
  reservedOutputTokens?: number
}): 'threshold' | 'hard-limit' | null {
  const threshold = Math.max(50, Math.min(100, options.thresholdPercent || 85))
  const contextLength = options.modelContextLength > 0 ? options.modelContextLength : 128000
  const inputContextSize = options.session.contextSize || options.session.lastInputTokens || 0
  if (inputContextSize <= 0) return null

  const reservedOutputTokens = Math.max(0, options.reservedOutputTokens || 0)
  const thresholdHit = inputContextSize >= Math.floor(contextLength * (threshold / 100))
  const hardLimitSafetyMargin = Math.min(2048, Math.floor(contextLength * 0.01))
  const hardLimitRisk = inputContextSize + reservedOutputTokens >= contextLength - hardLimitSafetyMargin

  if (hardLimitRisk) return 'hard-limit'
  if (thresholdHit) return 'threshold'
  return null
}

export function estimateSessionInputTokens(session: ChatSession): number {
  const effectiveMessages = getEffectiveContextMessages(session)
  const summaryText = session.summary && session.summaryUpToMessageId
    ? `[Conversation History Summary]\n${session.summary}\n\nPlease continue the conversation based on the above context.\nUnderstood. I have reviewed the previous conversation context. Please continue.\n`
    : ''
  const text = summaryText + effectiveMessages
    .map(formatMessageForTokenEstimate)
    .join('\n')

  return Math.ceil(text.length / 4)
}

function formatMessageForTokenEstimate(message: ChatMessage): string {
  const parts = [`${message.role}: ${message.content || ''}`]

  if (message.reasoning) {
    parts.push(`reasoning: ${message.reasoning}`)
  }

  if (message.toolCalls?.length) {
    for (const tc of message.toolCalls) {
      parts.push(`toolCall ${tc.toolName || tc.toolId}: ${safeStringify(tc.arguments || {})}`)
      if (tc.result !== undefined) {
        parts.push(`toolResult ${tc.toolName || tc.toolId}: ${safeStringify(sanitizeToolResultLikeRequest(tc.result))}`)
      }
      if (tc.error) {
        parts.push(`toolError ${tc.toolName || tc.toolId}: ${tc.error}`)
      }
    }
  }

  if (message.attachments?.length) {
    parts.push(`attachments: ${message.attachments.map(a => `${a.fileName} ${a.mimeType} ${a.size} ${a.base64Data || ''}`).join('\n')}`)
  }

  return parts.join('\n')
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function sanitizeToolResultLikeRequest(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(sanitizeToolResultLikeRequest)

  const out: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (key === 'originalContent') continue
    out[key] = sanitizeToolResultLikeRequest(child)
  }
  return out
}

function getEffectiveContextMessages(session: ChatSession): ChatMessage[] {
  if (session.summary && session.summaryUpToMessageId) {
    const summaryIndex = session.messages.findIndex(m => m.id === session.summaryUpToMessageId)
    if (summaryIndex !== -1) {
      return session.messages
        .slice(summaryIndex + 1)
        .filter(m => m.role === 'user' || m.role === 'assistant')
    }
  }

  return session.messages.filter(m => m.role === 'user' || m.role === 'assistant')
}

async function summarizeInChunks(options: {
  providerId: string
  configWithApiKey: ProviderConfigWithKey
  settings: AppSettings
  messages: string
  previousSummary?: string
}): Promise<string> {
  const chunks = chunkText(options.messages, MAX_CHUNK_CHARS)
  let summary = options.previousSummary || ''

  for (const chunk of chunks) {
    const prompt = buildContextCompactPrompt(chunk, summary || undefined)
    summary = await generateChatResponse(
      options.providerId,
      options.configWithApiKey,
      [
        {
          role: 'system',
          content: 'You summarize chat history for context compaction. Return only the updated Markdown summary.',
        },
        { role: 'user', content: prompt },
      ],
      {
        temperature: 0.2,
        maxTokens: SUMMARY_MAX_OUTPUT_TOKENS,
      },
    )
  }

  return summary.trim()
}

function formatMessagesForSummary(messages: ChatMessage[]): string {
  return messages.map((message, index) => {
    const label = message.role === 'user' ? 'User' : 'Assistant'
    const parts = [`### ${index + 1}. ${label}`, message.content || '(empty)']

    if (message.reasoning) {
      parts.push(`Reasoning summary source:\n${message.reasoning}`)
    }

    if (message.toolCalls?.length) {
      parts.push(`Tool calls:\n${message.toolCalls.map(tc => {
        const status = tc.status ? ` (${tc.status})` : ''
        return `- ${tc.toolName || tc.toolId}${status}: ${JSON.stringify(tc.arguments || {})}`
      }).join('\n')}`)
    }

    if (message.attachments?.length) {
      parts.push(`Attachments:\n${message.attachments.map(a => `- ${a.fileName} (${a.mimeType}, ${a.size} bytes)`).join('\n')}`)
    }

    return parts.join('\n\n')
  }).join('\n\n---\n\n')
}

function chunkText(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text]

  const chunks: string[] = []
  for (let start = 0; start < text.length; start += maxChars) {
    chunks.push(text.slice(start, start + maxChars))
  }
  return chunks
}
