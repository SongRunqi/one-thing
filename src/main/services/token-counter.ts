/**
 * Token Counter Service
 *
 * Provides estimation for token counts in messages.
 * Uses a simple heuristic for mixed Chinese/English text.
 */

import type { ChatMessage } from '../../shared/ipc.js'

/**
 * Estimate tokens for a text string.
 *
 * Heuristics:
 * - English: ~4 characters per token
 * - Chinese: ~1.5 characters per token
 * - We use a blended approach for mixed text
 */
export function estimateTokens(text: string): number {
  if (!text) return 0

  // Count Chinese characters (CJK Unified Ideographs)
  const chineseChars = (text.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length

  // Non-Chinese characters
  const otherChars = text.length - chineseChars

  // Estimate: Chinese ~1.5 chars/token, English ~4 chars/token
  const chineseTokens = Math.ceil(chineseChars / 1.5)
  const otherTokens = Math.ceil(otherChars / 4)

  return chineseTokens + otherTokens
}

/**
 * Calculate total tokens for a message including all content.
 */
export function calculateMessageTokens(message: ChatMessage): number {
  let tokens = 0

  // Main content
  tokens += estimateTokens(message.content)

  // Reasoning content (if present)
  if (message.reasoning) {
    tokens += estimateTokens(message.reasoning)
  }

  // Tool calls (estimate JSON size)
  if (message.toolCalls) {
    const toolCallsJson = JSON.stringify(message.toolCalls)
    tokens += estimateTokens(toolCallsJson)
  }

  return tokens
}

/**
 * Calculate total tokens for a list of messages.
 */
export function calculateSessionTokens(messages: ChatMessage[]): number {
  return messages.reduce((total, msg) => total + calculateMessageTokens(msg), 0)
}

/**
 * Count messages after a specific message ID.
 */
export function countMessagesAfter(messages: ChatMessage[], afterMessageId: string): number {
  const index = messages.findIndex(m => m.id === afterMessageId)
  if (index === -1) return messages.length
  return messages.length - index - 1
}
