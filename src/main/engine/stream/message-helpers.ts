/**
 * Message Helpers Module
 * Handles message building, history construction, and system prompt generation
 */

import type { ChatMessage } from '../../../shared/ipc.js'
import type { AgentProviderData } from '@onething/core/agent-loop'
import type { JsonObject, JsonValue } from '../../../shared/json.js'
import type { AIMessageContent } from '../../providers/index.js'
import { logMessageBodyShape } from './chat-logger.js'
import {
  formatMessagesForLog,
  getTextFromContent,
  historyMessagesForLog,
  sanitizeToolResultForAI,
} from '@onething/core/engine'
import {
  buildOnethingHistoryMessages,
  buildOnethingMessageContent,
  filterOnethingHistoryForNonToolAPI,
} from '@onething/runtime/sessions'

export { formatMessagesForLog, getTextFromContent, sanitizeToolResultForAI }

/**
 * Convert message with attachments to multimodal format
 */
export function buildMessageContent(message: ChatMessage): AIMessageContent {
  return buildOnethingMessageContent(message, {
    onImageAttachment: ({ mimeType, base64Length, dataUrlPrefix }) => {
      console.log('[Chat] Adding image attachment:', {
        mimeType,
        base64Length,
        dataUrlPrefix,
      })
    },
  }) as AIMessageContent
}

/**
 * History message type for AI conversation
 * Supports user, assistant (with optional tool calls), and tool result messages
 */
export type HistoryMessage =
  | { role: 'user'; content: AIMessageContent }
  | {
      role: 'assistant'
      content: AIMessageContent
      reasoningContent?: string
      providerData?: AgentProviderData[]
      toolCalls?: Array<{ toolCallId: string; toolName: string; args: JsonObject }>
    }
  | {
      role: 'tool'
      content: Array<{ type: 'tool-result'; toolCallId: string; toolName: string; result: JsonValue }>
    }

/**
 * Build history messages from session messages
 * Includes reasoningContent for assistant messages (required by DeepSeek Reasoner)
 * Includes tool calls and tool results for multi-turn tool context preservation
 * Filters out streaming messages (empty assistant messages being generated)
 * When session has a summary, uses [summary] + [recent messages] to reduce context window usage
 */
export function buildHistoryMessages(
  messages: ChatMessage[],
  session?: { id?: string; summary?: string; summaryUpToMessageId?: string }
): HistoryMessage[] {
  return buildOnethingHistoryMessages(messages, session, {
    onImageAttachment: ({ mimeType, base64Length, dataUrlPrefix }) => {
      console.log('[Chat] Adding image attachment:', {
        mimeType,
        base64Length,
        dataUrlPrefix,
      })
    },
    onCompactedHistory: details => {
      logMessageBodyShape('[buildHistoryMessages] compacted history body', historyMessagesForLog(details.resultMessages as HistoryMessage[]), {
        sessionId: details.sessionId,
        summaryUpToMessageId: details.summaryUpToMessageId,
        summaryIndex: details.summaryIndex,
        totalSessionMessages: details.totalSessionMessages,
        recentSessionMessages: details.recentSessionMessages,
        retainedRecentMessages: details.retainedRecentMessages,
        droppedRecentMessages: details.droppedRecentMessages,
        retainedPayloadChars: details.retainedPayloadChars,
        originalRecentPayloadChars: details.originalRecentPayloadChars,
        retainedPayloadBudgetChars: details.retainedPayloadBudgetChars,
        summaryChars: details.summaryChars,
        retainedMessages: details.retainedMessages,
        droppedMessages: details.droppedMessages,
      })
    },
    onMissingSummaryAnchor: details => {
      console.warn('[buildHistoryMessages] Ignoring summary with missing anchor:', {
        sessionId: details.sessionId,
        summaryUpToMessageId: details.summaryUpToMessageId,
      })
    },
  }) as HistoryMessage[]
}

/**
 * Filter history messages for non-tool-aware APIs
 * Removes tool messages and extracts only user/assistant messages
 * Used for APIs like generateChatResponseWithReasoning that don't support tool messages
 */
export function filterHistoryForNonToolAPI(
  messages: HistoryMessage[]
): Array<{ role: 'user' | 'assistant'; content: AIMessageContent; reasoningContent?: string }> {
  return filterOnethingHistoryForNonToolAPI(messages) as Array<{
    role: 'user' | 'assistant'
    content: AIMessageContent
    reasoningContent?: string
  }>
}
