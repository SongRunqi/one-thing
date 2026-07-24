/**
 * Message Helpers Module
 * Handles message building, history construction, and system prompt generation
 */

import type { ChatMessage } from '@shared/ipc.js'
import type { AgentProviderData } from '@onething/core/agent-loop'
import type { JsonObject, JsonValue } from '@shared/json.js'
import type { AIMessageContent } from '../../providers/index.js'
import { logMessageBodyShape } from './chat-logger.js'
import {
  formatMessagesForLog,
  getTextFromContent,
  historyMessagesForLog,
  renderContextUpdateBlock,
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
  return buildOnethingMessageContent(prepareUserMessageForModel(message), {
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
  return buildOnethingHistoryMessages(
    collapseSupersededGoalDrives(messages).map(prepareUserMessageForModel),
    session,
    {
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
        degradedRecentMessages: details.degradedRecentMessages,
        droppedRecentMessages: details.droppedRecentMessages,
        retainedPayloadChars: details.retainedPayloadChars,
        originalRecentPayloadChars: details.originalRecentPayloadChars,
        retainedPayloadBudgetChars: details.retainedPayloadBudgetChars,
        summaryChars: details.summaryChars,
        retainedMessages: details.retainedMessages,
        degradedMessageIds: details.degradedMessageIds,
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

const SUPERSEDED_GOAL_DRIVE_MARKER =
  '(automatic goal continuation — superseded by a later one)'

/**
 * Goal drives are persisted as user messages whose content is largely the
 * same template each time. Replaying them all verbatim makes the model read
 * the transcript as "the user keeps repeating the same message", so the
 * model view keeps only the newest drive in full and shrinks the superseded
 * ones to a one-line marker. Roles are kept (providers require user/assistant
 * alternation) and the renderer view is untouched — it folds these visually
 * via origin.source already.
 */
export function collapseSupersededGoalDrives(messages: ChatMessage[]): ChatMessage[] {
  let latestGoalDriveIndex = -1
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index]
    if (message?.role === 'user' && message.origin?.source === 'goal') {
      latestGoalDriveIndex = index
      break
    }
  }
  if (latestGoalDriveIndex === -1) return messages

  return messages.map((message, index) => {
    if (index >= latestGoalDriveIndex) return message
    if (message.role !== 'user' || message.origin?.source !== 'goal') return message
    return {
      ...message,
      content: SUPERSEDED_GOAL_DRIVE_MARKER,
      // The stale turn-context block adds nothing to a superseded ping.
      contextUpdate: undefined,
    }
  })
}

function prepareUserMessageForModel(message: ChatMessage): ChatMessage {
  return appendContextUpdateForModel(labelUserMessageForModel(message))
}

function labelUserMessageForModel(message: ChatMessage): ChatMessage {
  if (message.role !== 'user') return message
  const actor = message.origin?.actor
  if (!actor) return message

  const speaker = actor.displayName || actor.handle || actor.externalUserId
  if (!speaker) return message
  return {
    ...message,
    content: `${speaker} said:\n${message.content}`,
  }
}

/**
 * Render the persisted turn-volatile context block into the model-facing
 * content. The stored field is replayed verbatim on every history rebuild so
 * the request bytes stay identical (prompt-cache safe, append-only history).
 */
function appendContextUpdateForModel(message: ChatMessage): ChatMessage {
  if (message.role !== 'user' || !message.contextUpdate) return message
  return {
    ...message,
    content: renderContextUpdateBlock(message.content, message.contextUpdate),
  }
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
