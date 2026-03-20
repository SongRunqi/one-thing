/**
 * Token Counter Service
 *
 * Provides utility functions for message counting.
 * Note: Token estimation functions have been removed in favor of using
 * actual token counts from the AI SDK (usage.inputTokens).
 */

import type { ChatMessage } from '../../../shared/ipc.js'

/**
 * Count messages after a specific message ID.
 * Used by context compacting to determine how many new messages
 * have accumulated since the last summary.
 */
export function countMessagesAfter(messages: ChatMessage[], afterMessageId: string): number {
  const index = messages.findIndex(m => m.id === afterMessageId)
  if (index === -1) return messages.length
  return messages.length - index - 1
}
