/**
 * Context Compacting Service
 *
 * Manages automatic context compression when the conversation reaches
 * a configurable threshold of the model's context window.
 *
 * Unlike the old trigger-based approach that used token estimation,
 * this service uses actual token counts from the AI SDK response.
 */

import type { ChatMessage } from '../../../shared/ipc.js'
import { generateChatResponse } from '../../providers/index.js'
import { updateSessionSummary, getSession } from '../../stores/sessions.js'
import { getSettings } from '../../stores/settings.js'
import { countMessagesAfter } from './token-counter.js'

// Configuration
const DEFAULT_COMPACT_THRESHOLD = 85  // Default: compact at 85% context usage
const MIN_MESSAGES_FOR_SUMMARY = 10   // Need at least 10 messages to summarize

// Summary generation prompt (English)
const SUMMARY_PROMPT = `You are a conversation summarization assistant. Please read the following conversation history and generate a structured summary.

## Conversation History
{messages}

## Task
Generate a summary that includes:
1. **Main Topics**: What was primarily discussed
2. **Key Decisions**: Important decisions or conclusions made
3. **Context Information**: User preferences, conventions, important background
4. **Ongoing Tasks**: Incomplete items or to-dos

## Requirements
- Output in clear Markdown format
- Keep it within 500 words
- Preserve all important technical details and context
- Use third person description ("The user mentioned...", "The assistant suggested...")`

/**
 * Check if context compacting should be triggered based on actual token usage
 */
export function shouldCompact(
  inputTokens: number,
  modelContextLength: number,
  thresholdPercent?: number
): boolean {
  const threshold = thresholdPercent ?? getCompactThreshold()
  if (modelContextLength <= 0) return false

  const usagePercent = (inputTokens / modelContextLength) * 100
  return usagePercent >= threshold
}

/**
 * Get the compact threshold from settings
 */
export function getCompactThreshold(): number {
  const settings = getSettings()
  return settings.chat?.contextCompactThreshold ?? DEFAULT_COMPACT_THRESHOLD
}

/**
 * Format messages for the summary prompt
 */
function formatMessagesForSummary(messages: ChatMessage[]): string {
  return messages
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => {
      const role = m.role === 'user' ? 'User' : 'Assistant'
      // Truncate very long messages
      const content = m.content.length > 500
        ? m.content.slice(0, 500) + '...(content truncated)'
        : m.content
      return `**${role}**: ${content}`
    })
    .join('\n\n')
}

/**
 * Context for compacting operation
 */
export interface CompactingContext {
  sessionId: string
  messages: ChatMessage[]
  providerId: string
  providerConfig: {
    apiKey: string
    baseUrl?: string
    model: string
  }
}

/**
 * Result of compacting operation
 */
export interface CompactingResult {
  success: boolean
  summary?: string
  error?: string
}

/**
 * Execute context compacting - generate a summary of the conversation
 */
export async function executeCompacting(ctx: CompactingContext): Promise<CompactingResult> {
  const { sessionId, messages, providerId, providerConfig } = ctx

  console.log('[ContextCompacting] Starting context compacting for session:', sessionId)

  // Check minimum messages requirement
  if (messages.length < MIN_MESSAGES_FOR_SUMMARY) {
    console.log(`[ContextCompacting] Not enough messages (${messages.length} < ${MIN_MESSAGES_FOR_SUMMARY})`)
    return { success: false, error: 'Not enough messages to summarize' }
  }

  // Get current session to check for existing summary
  const session = getSession(sessionId)
  if (!session) {
    return { success: false, error: 'Session not found' }
  }

  // Determine which messages to include in the summary
  let messagesToSummarize = messages
  let existingSummary = ''

  if (session.summary && session.summaryUpToMessageId) {
    const summaryIndex = messages.findIndex(m => m.id === session.summaryUpToMessageId)
    if (summaryIndex !== -1) {
      // Check if we have new messages since last summary
      const newMessagesCount = countMessagesAfter(messages, session.summaryUpToMessageId)
      if (newMessagesCount < 5) {
        console.log(`[ContextCompacting] Only ${newMessagesCount} new messages since last summary, skipping`)
        return { success: false, error: 'Not enough new messages since last summary' }
      }
      // Include existing summary context and new messages
      existingSummary = session.summary
      messagesToSummarize = messages.slice(summaryIndex + 1)
    }
  }

  // Build summary messages with existing summary as context if available
  let summaryMessages = messagesToSummarize
  if (existingSummary) {
    summaryMessages = [
      { id: 'summary', role: 'assistant' as const, content: `[Previous Summary]\n${existingSummary}`, timestamp: 0 },
      ...messagesToSummarize
    ]
  }

  // Generate summary
  const formattedMessages = formatMessagesForSummary(summaryMessages)
  const prompt = SUMMARY_PROMPT.replace('{messages}', formattedMessages)

  try {
    const summary = await generateChatResponse(
      providerId,
      {
        apiKey: providerConfig.apiKey,
        baseUrl: providerConfig.baseUrl,
        model: providerConfig.model,
      },
      [{ role: 'user', content: prompt }],
      { temperature: 0.3, maxTokens: 800 }
    )

    if (!summary) {
      return { success: false, error: 'Empty summary generated' }
    }

    // Find the last message ID to mark where the summary covers
    const lastMessage = messages[messages.length - 1]
    if (!lastMessage) {
      return { success: false, error: 'No messages to summarize' }
    }

    // Save the summary to the session
    const saveSuccess = updateSessionSummary(sessionId, summary.trim(), lastMessage.id)

    if (saveSuccess) {
      console.log('[ContextCompacting] Summary saved successfully')
      console.log('[ContextCompacting] Summary preview:', summary.slice(0, 200) + '...')
      return { success: true, summary: summary.trim() }
    } else {
      return { success: false, error: 'Failed to save summary' }
    }
  } catch (error) {
    console.error('[ContextCompacting] Failed to generate summary:', error)
    return { success: false, error: String(error) }
  }
}

/**
 * Export configuration for external use
 */
export const COMPACTING_CONFIG = {
  defaultThreshold: DEFAULT_COMPACT_THRESHOLD,
  minMessagesForSummary: MIN_MESSAGES_FOR_SUMMARY,
}
