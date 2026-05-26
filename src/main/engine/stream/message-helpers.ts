/**
 * Message Helpers Module
 * Handles message building, history construction, and system prompt generation
 */

import type { ChatMessage } from '../../../shared/ipc.js'
import type { AIMessageContent } from '../../providers/index.js'
import { getAIToolName } from '../../providers/tool-name-alias.js'
import { buildSystemPrompt } from '../prompt/index.js'
import { logMessageBodyShape } from './chat-logger.js'

/**
 * Format messages for logging without full base64 data
 */
export function formatMessagesForLog(messages: unknown[]): unknown[] {
  return messages.map(msg => {
    const m = msg as Record<string, unknown>
    if (Array.isArray(m.content)) {
      return {
        ...m,
        content: m.content.map((part: Record<string, unknown>) => {
          if (part.type === 'image' && typeof part.image === 'string') {
            const imgStr = part.image as string
            return {
              ...part,
              image: imgStr.substring(0, 50) + `... (${imgStr.length} chars)`,
            }
          }
          return part
        }),
      }
    }
    return m
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
        // mediaType is auto-detected from Data URL by AI SDK
      })
    } else if (attachment.base64Data) {
      // For non-image files, add as file type
      contentParts.push({
        type: 'file',
        data: attachment.base64Data,
        mediaType: attachment.mimeType,  // AI SDK 6.x uses 'mediaType'
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
      toolCalls?: Array<{ toolCallId: string; toolName: string; args: Record<string, unknown> }>
    }
  | {
      role: 'tool'
      content: Array<{ type: 'tool-result'; toolCallId: string; toolName: string; result: unknown }>
    }

export function sanitizeToolResultForAI(result: unknown): unknown {
  if (!result || typeof result !== 'object') return result

  if (Array.isArray(result)) {
    return result.map(sanitizeToolResultForAI)
  }

  const sanitized: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(result as Record<string, unknown>)) {
    if (key === 'originalContent' || key === 'originalContentHash') continue
    sanitized[key] = sanitizeToolResultForAI(value)
  }
  return sanitized
}

function jsonLength(value: unknown): number {
  try {
    return JSON.stringify(value ?? '').length
  } catch {
    return String(value ?? '').length
  }
}

function summarizeRetainedMessagesForLog(messages: ChatMessage[], startIndex: number): Array<Record<string, unknown>> {
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

  const push = (text: unknown): void => {
    if (typeof text !== 'string') return
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
      // Get messages after the summary point
      const recentMessages = messages.slice(summaryIndex + 1)

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
      for (const m of recentMessages) {
        if (m.role !== 'user' && m.role !== 'assistant') continue
        if (m.isStreaming) continue
        const codexEncryptedReasoning = getCodexEncryptedReasoning(m)
        const hasToolContext = (m.toolCalls?.length ?? 0) > 0
        // Skip messages with empty content (causes API error)
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

          const reasoningContent = getMessageReasoningContent(m)
          if (reasoningContent) {
            assistantMsg.reasoningContent = reasoningContent
          }
          if (codexEncryptedReasoning.length > 0) {
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
              content: completedToolCalls.map(tc => ({
                type: 'tool-result' as const,
                toolCallId: tc.id,
                toolName: getAIToolName(tc.toolId || tc.toolName),
                result: tc.status === 'completed' ? sanitizeToolResultForAI(tc.result) : { error: tc.error },
              })),
            })
          }
        }
      }

      logMessageBodyShape('[buildHistoryMessages] compacted history body', result as Array<Record<string, any>>, {
        sessionId: session.id,
        summaryUpToMessageId: session.summaryUpToMessageId,
        summaryIndex,
        totalSessionMessages: messages.length,
        recentSessionMessages: recentMessages.length,
        summaryChars: session.summary.length,
        retainedMessages: summarizeRetainedMessagesForLog(recentMessages, summaryIndex + 1),
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
            result: tc.status === 'completed' ? sanitizeToolResultForAI(tc.result) : { error: tc.error },
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

// Re-export buildSystemPrompt from prompt service for backward compatibility
export { buildSystemPrompt }
