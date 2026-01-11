/**
 * Context Compacting Service
 *
 * Manages automatic context compression when the conversation reaches
 * a configurable threshold of the model's context window.
 *
 * Unlike the old trigger-based approach that used token estimation,
 * this service uses actual token counts from the AI SDK response.
 */

import * as fs from 'fs'
import type { ChatMessage } from '../../../shared/ipc.js'
import { generateChatResponse } from '../../providers/index.js'
import { updateSessionSummary, getSession, insertMessageAfter } from '../../stores/sessions.js'
import { v4 as uuidv4 } from 'uuid'
import { getSettings } from '../../stores/settings.js'
import { getSessionHistoryDir, getSessionHistoryPath } from '../../stores/paths.js'
import { getPromptManager } from '../prompt/prompt-manager.js'
import type { ContextCompactVariables } from '../prompt/types.js'

// Configuration
const DEFAULT_COMPACT_THRESHOLD = 85  // Default: compact at 85% context usage

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
  historyFilePath?: string  // Path to the full conversation history backup
  error?: string
}

/**
 * Write full conversation history to a file before compacting
 * This allows the AI to reference the original conversation if needed
 */
function writeHistoryBackup(sessionId: string, messages: ChatMessage[]): string | undefined {
  try {
    // Ensure directory exists
    const historyDir = getSessionHistoryDir()
    if (!fs.existsSync(historyDir)) {
      fs.mkdirSync(historyDir, { recursive: true })
    }

    const historyPath = getSessionHistoryPath(sessionId)

    // Build markdown content
    const lines: string[] = [
      '# Conversation History Backup',
      '',
      `> Session ID: ${sessionId}`,
      `> Backup Time: ${new Date().toISOString()}`,
      `> Total Messages: ${messages.length}`,
      '',
      '---',
      '',
    ]

    for (const msg of messages) {
      if (msg.role !== 'user' && msg.role !== 'assistant') continue

      const role = msg.role === 'user' ? '👤 User' : '🤖 Assistant'
      const timestamp = new Date(msg.timestamp).toLocaleString()

      lines.push(`## ${role}`)
      lines.push(`*${timestamp}*`)
      lines.push('')
      lines.push(msg.content)
      lines.push('')

      // Include tool calls summary if any
      if (msg.toolCalls && msg.toolCalls.length > 0) {
        lines.push('**Tool Calls:**')
        for (const tc of msg.toolCalls) {
          const status = tc.status === 'completed' ? '✓' : tc.status === 'failed' ? '✗' : '...'
          lines.push(`- [${status}] ${tc.toolName}`)
        }
        lines.push('')
      }

      lines.push('---')
      lines.push('')
    }

    fs.writeFileSync(historyPath, lines.join('\n'), 'utf-8')
    console.log(`[ContextCompacting] History backup saved: ${historyPath}`)
    return historyPath
  } catch (error) {
    console.error('[ContextCompacting] Failed to write history backup:', error)
    return undefined
  }
}

/**
 * Get the history file path for a session (if it exists)
 */
export function getHistoryFilePath(sessionId: string): string | null {
  const historyPath = getSessionHistoryPath(sessionId)
  return fs.existsSync(historyPath) ? historyPath : null
}

/**
 * Execute context compacting - generate a summary of the conversation
 * Triggered only by context size threshold, not message count
 */
export async function executeCompacting(ctx: CompactingContext): Promise<CompactingResult> {
  const { sessionId, messages, providerId, providerConfig } = ctx

  console.log('[ContextCompacting] Starting context compacting for session:', sessionId)

  // Only check if there are any messages to summarize
  if (messages.length === 0) {
    console.log('[ContextCompacting] No messages to summarize')
    return { success: false, error: 'No messages to summarize' }
  }

  // Get current session to check for existing summary
  const session = getSession(sessionId)
  if (!session) {
    return { success: false, error: 'Session not found' }
  }

  // Write full conversation history to file BEFORE compacting
  // This preserves the original context for potential recovery
  const historyFilePath = writeHistoryBackup(sessionId, messages)

  // Determine which messages to include in the summary
  let messagesToSummarize = messages
  let existingSummary = ''

  if (session.summary && session.summaryUpToMessageId) {
    const summaryIndex = messages.findIndex(m => m.id === session.summaryUpToMessageId)
    if (summaryIndex !== -1) {
      // Include existing summary context and summarize only new messages
      existingSummary = session.summary
      messagesToSummarize = messages.slice(summaryIndex + 1)

      // If no new messages since last summary, nothing to do
      if (messagesToSummarize.length === 0) {
        console.log('[ContextCompacting] No new messages since last summary')
        return { success: false, error: 'No new messages since last summary' }
      }
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

  // Generate summary using template
  const formattedMessages = formatMessagesForSummary(summaryMessages)
  const promptManager = getPromptManager()
  const prompt = promptManager.render('main/context-compact', { messages: formattedMessages } as ContextCompactVariables)

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
      if (historyFilePath) {
        console.log('[ContextCompacting] Full history available at:', historyFilePath)
      }

      // Add a system message to show the compact summary in the chat
      // Insert it after the last summarized message for correct UI position
      const compactMessage: ChatMessage = {
        id: uuidv4(),
        sessionId,
        role: 'system',
        content: JSON.stringify({
          type: 'context-compact',
          summary: summary.trim(),
        }),
        timestamp: Date.now(),
      }
      insertMessageAfter(sessionId, lastMessage.id, compactMessage)
      console.log('[ContextCompacting] Compact message inserted after:', lastMessage.id)

      return { success: true, summary: summary.trim(), historyFilePath }
    } else {
      return { success: false, error: 'Failed to save summary', historyFilePath }
    }
  } catch (error) {
    console.error('[ContextCompacting] Failed to generate summary:', error)
    return { success: false, error: String(error), historyFilePath }
  }
}

/**
 * Export configuration for external use
 */
export const COMPACTING_CONFIG = {
  defaultThreshold: DEFAULT_COMPACT_THRESHOLD,
}
