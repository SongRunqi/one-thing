/**
 * Message Helpers Module
 * Handles message building, history construction, and system prompt generation
 */

import type { ChatMessage } from '../../../shared/ipc.js'
import type { JsonObject, JsonValue } from '../../../shared/json.js'
import { toJsonValue } from '../../../shared/json.js'
import type { AIMessageContent } from '../../providers/index.js'
import { getAIToolName } from '../../providers/tool-name-alias.js'
import { toolFailureResultForAI } from '../../tools/core/tool-result.js'
import { logMessageBodyShape, type ChatLogMessageShape } from './chat-logger.js'

const COMPACTED_HISTORY_RETAINED_PAYLOAD_BUDGET_CHARS = 300_000
const COMPACTED_HISTORY_TOOL_RESULT_BUDGET_CHARS = 24_000
const COMPACTED_HISTORY_TOOL_RESULTS_TOTAL_BUDGET_CHARS = 80_000

/**
 * Format messages for logging without full base64 data
 */
export function formatMessagesForLog(messages: JsonObject[]): JsonObject[] {
  return messages.map(message => {
    const content = message.content
    if (Array.isArray(content)) {
      return {
        ...message,
        content: content.map((part): JsonValue => {
          if (!part || typeof part !== 'object' || Array.isArray(part)) return part
          if (part.type === 'image' && typeof part.image === 'string') {
            const imgStr = part.image
            return {
              ...part,
              image: imgStr.substring(0, 50) + `... (${imgStr.length} chars)`,
            }
          }
          return part
        }),
      }
    }
    return message
  })
}

/**
 * Convert message with attachments to multimodal format
 */
export function buildMessageContent(message: ChatMessage): AIMessageContent {
  // If no attachments, return simple string content
  if (!message.attachments || message.attachments.length === 0) {
    return message.content
  }

  // Build multimodal content array
  const contentParts: Exclude<AIMessageContent, string> = []

  // Add text content first (if any)
  if (message.content) {
    contentParts.push({ type: 'text', text: message.content })
  }

  // Add attachments
  for (const attachment of message.attachments) {
    if (attachment.mediaType === 'image' && attachment.base64Data) {
      // Use Data URL format for better compatibility across providers
      const dataUrl = `data:${attachment.mimeType};base64,${attachment.base64Data}`
      console.log('[Chat] Adding image attachment:', {
        mimeType: attachment.mimeType,
        base64Length: attachment.base64Data.length,
        dataUrlPrefix: dataUrl.substring(0, 50) + '...',
      })
      contentParts.push({
        type: 'image',
        image: dataUrl,
        // mediaType is encoded in the Data URL
      })
    } else if (attachment.base64Data) {
      // For non-image files, add as file type
      contentParts.push({
        type: 'file',
        data: attachment.base64Data,
        mediaType: attachment.mimeType,
      })
    }
  }

  return contentParts.length > 0 ? contentParts : message.content
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
      codexEncryptedReasoning?: string[]
      toolCalls?: Array<{ toolCallId: string; toolName: string; args: JsonObject }>
    }
  | {
      role: 'tool'
      content: Array<{ type: 'tool-result'; toolCallId: string; toolName: string; result: JsonValue }>
    }

function historyMessagesForLog(messages: HistoryMessage[]): ChatLogMessageShape[] {
  return messages.map(message => {
    if (message.role === 'assistant') {
      return {
        role: message.role,
        content: message.content,
        toolCalls: message.toolCalls,
        reasoningContent: message.reasoningContent,
      }
    }

    return {
      role: message.role,
      content: message.content,
    }
  })
}

export function sanitizeToolResultForAI(result: JsonValue | undefined): JsonValue {
  if (result === undefined) return null
  if (!result || typeof result !== 'object') return result

  if (Array.isArray(result)) {
    return result.map(sanitizeToolResultForAI)
  }

  const sanitized: JsonObject = {}
  for (const [key, value] of Object.entries(result)) {
    if (key === 'originalContent' || key === 'originalContentHash') continue
    sanitized[key] = sanitizeToolResultForAI(value)
  }
  return sanitized
}

function jsonLength(value: JsonValue | undefined): number {
  try {
    return JSON.stringify(value ?? '').length
  } catch {
    return String(value ?? '').length
  }
}

function messagePayloadLength(message: ChatMessage): number {
  return jsonLength(message as unknown as JsonValue)
}

function retainedPayloadLength(messages: ChatMessage[]): number {
  return messages.reduce((sum, message) => sum + messagePayloadLength(message), 0)
}

function selectCompactedRecentMessagesForPrompt(messages: ChatMessage[]): {
  retainedMessages: ChatMessage[]
  droppedMessages: ChatMessage[]
  retainedPayloadChars: number
} {
  if (messages.length === 0) {
    return { retainedMessages: [], droppedMessages: [], retainedPayloadChars: 0 }
  }

  const retained: ChatMessage[] = []
  const dropped: ChatMessage[] = []
  let retainedPayloadChars = 0

  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index]
    const payloadChars = messagePayloadLength(message)
    const isLatestMessage = index === messages.length - 1

    if (
      !isLatestMessage &&
      retainedPayloadChars > 0 &&
      retainedPayloadChars + payloadChars > COMPACTED_HISTORY_RETAINED_PAYLOAD_BUDGET_CHARS
    ) {
      dropped.push(message)
      continue
    }

    retained.push(message)
    retainedPayloadChars += payloadChars
  }

  retained.reverse()
  dropped.reverse()
  return { retainedMessages: retained, droppedMessages: dropped, retainedPayloadChars }
}

function compactedToolResultPlaceholder(result: JsonValue | undefined, includePreview = true): JsonObject {
  const originalChars = jsonLength(result)
  const placeholder: JsonObject = {
    truncated: true,
    reason: 'Tool result omitted from compacted history to keep the provider request body within budget.',
    originalChars,
  }

  if (result && typeof result === 'object' && !Array.isArray(result)) {
    const title = result.title
    const error = result.error
    const output = result.output
    if (typeof title === 'string' && title.length > 0) placeholder.title = title.slice(0, 500)
    if (includePreview && typeof error === 'string' && error.length > 0) placeholder.error = error.slice(0, 1000)
    if (includePreview && typeof output === 'string' && output.length > 0) {
      placeholder.outputPreview = output.slice(0, 2000)
    }
  }

  return placeholder
}

function sanitizeCompactedToolResultForAI(result: JsonValue | undefined): JsonValue {
  const sanitized = sanitizeToolResultForAI(result)
  return jsonLength(sanitized) > COMPACTED_HISTORY_TOOL_RESULT_BUDGET_CHARS
    ? compactedToolResultPlaceholder(sanitized)
    : sanitized
}

function compactedFailureToolResultForAI(
  toolCall: NonNullable<ChatMessage['toolCalls']>[number],
): JsonValue {
  return sanitizeCompactedToolResultForAI(toJsonValue(toolFailureResultForAI(toolCall)) ?? null)
}

function buildCompactedToolResultContent(
  toolCalls: NonNullable<ChatMessage['toolCalls']>,
): Array<{ type: 'tool-result'; toolCallId: string; toolName: string; result: JsonValue }> {
  let totalResultChars = 0

  return toolCalls.map(toolCall => {
    const rawResult = toolCall.status === 'completed'
      ? sanitizeCompactedToolResultForAI(toolCall.result)
      : compactedFailureToolResultForAI(toolCall)
    const resultChars = jsonLength(rawResult)
    const exceedsTotalBudget =
      totalResultChars > 0 &&
      totalResultChars + resultChars > COMPACTED_HISTORY_TOOL_RESULTS_TOTAL_BUDGET_CHARS
    const result = exceedsTotalBudget
      ? compactedToolResultPlaceholder(
          toolCall.status === 'completed'
            ? sanitizeToolResultForAI(toolCall.result)
            : toJsonValue(toolFailureResultForAI(toolCall)) ?? null,
          false,
        )
      : rawResult

    totalResultChars += jsonLength(result)
    return {
      type: 'tool-result' as const,
      toolCallId: toolCall.id,
      toolName: getAIToolName(toolCall.toolId || toolCall.toolName),
      result,
    }
  })
}

function summarizeRetainedMessagesForLog(messages: ChatMessage[], startIndex: number): JsonObject[] {
  return messages.map((message, offset) => {
    const completedToolCalls = message.toolCalls?.filter(
      toolCall => toolCall.status === 'completed' || toolCall.status === 'failed',
    ) ?? []
    return {
      index: startIndex + offset,
      id: message.id,
      role: message.role,
      contentChars: message.content?.length ?? 0,
      toolCalls: completedToolCalls.length,
      toolArgChars: completedToolCalls.reduce((sum, toolCall) => sum + jsonLength(toolCall.arguments ?? {}), 0),
      toolResultChars: completedToolCalls.reduce(
        (sum, toolCall) => sum + jsonLength(toolCall.status === 'completed' ? toolCall.result : { error: toolCall.error }),
        0,
      ),
      usageInputTokens: message.usage?.inputTokens,
      isStreaming: message.isStreaming === true,
    }
  })
}

function getCodexEncryptedReasoning(message: ChatMessage): string[] {
  const encrypted: string[] = []
  for (const part of message.contentParts ?? []) {
    if (
      part.type === 'provider-data' &&
      part.provider === 'codex' &&
      typeof part.encryptedReasoning === 'string' &&
      part.encryptedReasoning.length > 0
    ) {
      encrypted.push(part.encryptedReasoning)
    }
  }
  return encrypted
}

function getMessageReasoningContent(message: ChatMessage): string | undefined {
  const fragments: string[] = []
  const seen = new Set<string>()

  const push = (text: string | undefined): void => {
    if (!text) return
    const trimmed = text.trim()
    if (!trimmed || seen.has(trimmed)) return
    seen.add(trimmed)
    fragments.push(text)
  }

  push(message.reasoning)
  for (const part of message.contentParts ?? []) {
    if (part.type === 'reasoning') push(part.content)
  }

  return fragments.length > 0 ? fragments.join('\n\n') : undefined
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
  // If session has a summary, use it to reduce context
  if (session?.summary && session?.summaryUpToMessageId) {
    const summaryIndex = messages.findIndex(m => m.id === session.summaryUpToMessageId)

    if (summaryIndex !== -1) {
      // Get messages after the summary point, then cap the actual retained payload.
      const recentMessages = messages.slice(summaryIndex + 1)
      const {
        retainedMessages: budgetedRecentMessages,
        droppedMessages,
        retainedPayloadChars,
      } = selectCompactedRecentMessagesForPrompt(recentMessages)

      // Build the history with summary + recent messages
      const result: HistoryMessage[] = []

      // Add summary as a "user" message (context injection)
      result.push({
        role: 'user',
        content: `[Conversation History Summary]\n${session.summary}\n\nPlease continue the conversation based on the above context.`,
      })

      // Add an acknowledgment from assistant
      result.push({
        role: 'assistant',
        content: 'Understood. I have reviewed the previous conversation context. Please continue.',
      })

      // Add recent messages with tool call context
      for (const m of budgetedRecentMessages) {
        if (m.role !== 'user' && m.role !== 'assistant') continue
        if (m.isStreaming) continue
        const codexEncryptedReasoning = getCodexEncryptedReasoning(m)
        const includeCodexEncryptedReasoning =
          codexEncryptedReasoning.length > 0 &&
          m === budgetedRecentMessages[budgetedRecentMessages.length - 1]
        const hasToolContext = (m.toolCalls?.length ?? 0) > 0
        // Skip messages with empty content (causes API error)
        if (!m.content && (!m.attachments || m.attachments.length === 0) && !includeCodexEncryptedReasoning && !hasToolContext) continue

        if (m.role === 'user') {
          result.push({
            role: 'user',
            content: buildMessageContent(m),
          })
        } else {
          // Assistant message
          const assistantMsg: HistoryMessage & { role: 'assistant' } = {
            role: 'assistant',
            content: buildMessageContent(m),
          }

          const reasoningContent = getMessageReasoningContent(m)
          if (reasoningContent) {
            assistantMsg.reasoningContent = reasoningContent
          }
          if (includeCodexEncryptedReasoning) {
            assistantMsg.codexEncryptedReasoning = codexEncryptedReasoning
          }

          // Include completed/failed tool calls
          const completedToolCalls = m.toolCalls?.filter(
            tc => tc.status === 'completed' || tc.status === 'failed'
          )

          if (completedToolCalls && completedToolCalls.length > 0) {
            assistantMsg.toolCalls = completedToolCalls.map(tc => ({
              toolCallId: tc.id,
              toolName: getAIToolName(tc.toolId || tc.toolName),
              args: tc.arguments,
            }))
          }

          result.push(assistantMsg)

          // Add tool result message
          if (completedToolCalls && completedToolCalls.length > 0) {
            result.push({
              role: 'tool',
              content: buildCompactedToolResultContent(completedToolCalls),
            })
          }
        }
      }

      logMessageBodyShape('[buildHistoryMessages] compacted history body', historyMessagesForLog(result), {
        sessionId: session.id,
        summaryUpToMessageId: session.summaryUpToMessageId,
        summaryIndex,
        totalSessionMessages: messages.length,
        recentSessionMessages: recentMessages.length,
        retainedRecentMessages: budgetedRecentMessages.length,
        droppedRecentMessages: droppedMessages.length,
        retainedPayloadChars,
        originalRecentPayloadChars: retainedPayloadLength(recentMessages),
        retainedPayloadBudgetChars: COMPACTED_HISTORY_RETAINED_PAYLOAD_BUDGET_CHARS,
        summaryChars: session.summary.length,
        retainedMessages: summarizeRetainedMessagesForLog(budgetedRecentMessages, summaryIndex + 1),
        droppedMessages: summarizeRetainedMessagesForLog(droppedMessages, summaryIndex + 1),
      })
      return result
    }

    console.warn('[buildHistoryMessages] Ignoring summary with missing anchor:', {
      sessionId: session.id,
      summaryUpToMessageId: session.summaryUpToMessageId,
    })
  }

  // No summary - use full history
  const result: HistoryMessage[] = []

  for (const m of messages) {
    // Only include user and assistant messages
    if (m.role !== 'user' && m.role !== 'assistant') continue
    // Exclude streaming messages (current message being generated)
    if (m.isStreaming) continue
    const codexEncryptedReasoning = getCodexEncryptedReasoning(m)
    const hasToolContext = (m.toolCalls?.length ?? 0) > 0
    // Exclude messages with empty content (causes API error)
    if (!m.content && (!m.attachments || m.attachments.length === 0) && codexEncryptedReasoning.length === 0 && !hasToolContext) continue

    if (m.role === 'user') {
      result.push({
        role: 'user',
        content: buildMessageContent(m),
      })
    } else {
      // Assistant message
      const assistantMsg: HistoryMessage & { role: 'assistant' } = {
        role: 'assistant',
        content: buildMessageContent(m),
      }

      // Include reasoning content for assistant messages (needed for DeepSeek Reasoner)
      const reasoningContent = getMessageReasoningContent(m)
      if (reasoningContent) {
        assistantMsg.reasoningContent = reasoningContent
      }
      if (codexEncryptedReasoning.length > 0) {
        assistantMsg.codexEncryptedReasoning = codexEncryptedReasoning
      }

      // Include completed/failed tool calls for context preservation across turns
      const completedToolCalls = m.toolCalls?.filter(
        tc => tc.status === 'completed' || tc.status === 'failed'
      )

      if (completedToolCalls && completedToolCalls.length > 0) {
        assistantMsg.toolCalls = completedToolCalls.map(tc => ({
          toolCallId: tc.id,
          toolName: getAIToolName(tc.toolId || tc.toolName),
          args: tc.arguments,
        }))
      }

      result.push(assistantMsg)

      // Add tool result message after assistant message with tool calls
      if (completedToolCalls && completedToolCalls.length > 0) {
        result.push({
          role: 'tool',
          content: completedToolCalls.map(tc => ({
            type: 'tool-result' as const,
            toolCallId: tc.id,
            toolName: getAIToolName(tc.toolId || tc.toolName),
            result: tc.status === 'completed'
              ? sanitizeToolResultForAI(tc.result)
              : toJsonValue(toolFailureResultForAI(tc)) ?? null,
          })),
        })
      }
    }
  }

  return result
}

/**
 * Filter history messages for non-tool-aware APIs
 * Removes tool messages and extracts only user/assistant messages
 * Used for APIs like generateChatResponseWithReasoning that don't support tool messages
 */
export function filterHistoryForNonToolAPI(
  messages: HistoryMessage[]
): Array<{ role: 'user' | 'assistant'; content: AIMessageContent; reasoningContent?: string }> {
  return messages
    .filter((m): m is HistoryMessage & { role: 'user' | 'assistant' } =>
      m.role === 'user' || m.role === 'assistant'
    )
    .map(m => {
      if (m.role === 'user') {
        return { role: 'user' as const, content: m.content }
      }
      const result: { role: 'assistant'; content: AIMessageContent; reasoningContent?: string } = {
        role: 'assistant',
        content: m.content,
      }
      if (m.reasoningContent) {
        result.reasoningContent = m.reasoningContent
      }
      return result
    })
}

/**
 * Extract text from AI message content (string or multimodal array)
 */
export function getTextFromContent(content: AIMessageContent): string {
  if (typeof content === 'string') {
    return content
  }
  if (Array.isArray(content)) {
    return content
      .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
      .map(part => part.text)
      .join('\n')
  }
  return ''
}
