import { getAIToolName } from '../agent-loop/tool-names.js'
import type { AgentProviderData } from '../agent-loop/types.js'
import type { JsonObject, JsonValue } from '../json.js'
import type { CoreChatLogMessageShape, CoreChatLogValue } from './chat-logger.js'

export const COMPACTED_HISTORY_RETAINED_PAYLOAD_BUDGET_CHARS = 300_000
export const COMPACTED_HISTORY_TOOL_RESULT_BUDGET_CHARS = 24_000
export const COMPACTED_HISTORY_TOOL_RESULTS_TOTAL_BUDGET_CHARS = 80_000

export type CoreHistoryMessage =
  | { role: 'user'; content: unknown }
  | {
      role: 'assistant'
      content: unknown
      reasoningContent?: string
      providerData?: AgentProviderData[]
      toolCalls?: Array<{ toolCallId: string; toolName: string; args: JsonObject }>
    }
  | {
      role: 'tool'
      content: Array<{ type: 'tool-result'; toolCallId: string; toolName: string; result: JsonValue }>
    }

export interface CoreResumeToolCall {
  id: string
  toolId?: string
  toolName: string
  arguments: JsonObject
  status?: string
  result?: JsonValue
  error?: string
}

export interface CoreResumeAssistantMessage {
  content?: string
  reasoning?: string
  toolCalls?: CoreResumeToolCall[]
}

export interface CoreHistoryContentPart {
  type: string
  provider?: string
  encryptedReasoning?: string
  providerData?: AgentProviderData
  content?: string
}

export interface CoreHistoryToolCall {
  id: string
  toolId?: string
  toolName: string
  arguments: JsonObject
  status?: string
  result?: JsonValue
  error?: string
  rejected?: boolean
  rejectionReason?: string
}

export interface CoreHistoryChatMessage {
  id: string
  role: string
  content?: string
  reasoning?: string
  isStreaming?: boolean
  contentParts?: CoreHistoryContentPart[]
  toolCalls?: CoreHistoryToolCall[]
  usage?: { inputTokens?: number }
}

export interface CoreCompactedRecentMessagesPlan<TMessage extends CoreHistoryChatMessage = CoreHistoryChatMessage> {
  retainedMessages: TMessage[]
  droppedMessages: TMessage[]
  retainedPayloadChars: number
}

export interface CoreHistorySessionSummary {
  id?: string
  summary?: string
  summaryUpToMessageId?: string
}

export interface CoreCompactedHistoryLogDetails<TMessage extends CoreHistoryChatMessage = CoreHistoryChatMessage> {
  sessionId?: string
  summaryUpToMessageId: string
  summaryIndex: number
  totalSessionMessages: number
  recentSessionMessages: number
  retainedRecentMessages: number
  droppedRecentMessages: number
  retainedPayloadChars: number
  originalRecentPayloadChars: number
  retainedPayloadBudgetChars: number
  summaryChars: number
  retainedMessages: JsonObject[]
  droppedMessages: JsonObject[]
  resultMessages: CoreHistoryMessage[]
}

export interface CoreCompactedToolResultOptions {
  getAIToolName?: (name: string) => string
  failureResultForAI?: (toolCall: CoreHistoryToolCall) => JsonValue
}

export interface CoreBuildHistoryMessagesOptions<TContent = unknown, TMessage extends CoreHistoryChatMessage = CoreHistoryChatMessage> {
  buildMessageContent: (message: TMessage) => TContent
  getAIToolName?: (name: string) => string
  failureResultForAI?: (toolCall: CoreHistoryToolCall) => JsonValue
  providerDataFromContentPart?: (part: CoreHistoryContentPart, message: TMessage) => AgentProviderData | undefined
  onCompactedHistory?: (details: CoreCompactedHistoryLogDetails<TMessage>) => void
  onMissingSummaryAnchor?: (details: { sessionId?: string; summaryUpToMessageId: string }) => void
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

export function jsonLength(value: JsonValue | undefined): number {
  try {
    return JSON.stringify(value ?? '').length
  } catch {
    return String(value ?? '').length
  }
}

export function historyMessagePayloadLength(message: CoreHistoryChatMessage): number {
  return jsonLength(message as unknown as JsonValue)
}

export function retainedHistoryPayloadLength(messages: CoreHistoryChatMessage[]): number {
  return messages.reduce((sum, message) => sum + historyMessagePayloadLength(message), 0)
}

export function selectCompactedRecentMessagesForPrompt<TMessage extends CoreHistoryChatMessage>(
  messages: TMessage[],
  budgetChars = COMPACTED_HISTORY_RETAINED_PAYLOAD_BUDGET_CHARS,
): CoreCompactedRecentMessagesPlan<TMessage> {
  if (messages.length === 0) {
    return { retainedMessages: [], droppedMessages: [], retainedPayloadChars: 0 }
  }

  const retained: TMessage[] = []
  const dropped: TMessage[] = []
  let retainedPayloadChars = 0

  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index]
    const payloadChars = historyMessagePayloadLength(message)
    const isLatestMessage = index === messages.length - 1

    if (
      !isLatestMessage &&
      retainedPayloadChars > 0 &&
      retainedPayloadChars + payloadChars > budgetChars
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

export function compactedToolResultPlaceholder(
  result: JsonValue | undefined,
  includePreview = true,
): JsonObject {
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

export function sanitizeCompactedToolResultForAI(
  result: JsonValue | undefined,
  budgetChars = COMPACTED_HISTORY_TOOL_RESULT_BUDGET_CHARS,
): JsonValue {
  const sanitized = sanitizeToolResultForAI(result)
  return jsonLength(sanitized) > budgetChars
    ? compactedToolResultPlaceholder(sanitized)
    : sanitized
}

function defaultFailureResultForAI(toolCall: CoreHistoryToolCall): JsonValue {
  return { error: toolCall.error ?? null }
}

export function compactedFailureToolResultForAI(
  toolCall: CoreHistoryToolCall,
  options: Pick<CoreCompactedToolResultOptions, 'failureResultForAI'> = {},
): JsonValue {
  return sanitizeCompactedToolResultForAI(options.failureResultForAI?.(toolCall) ?? defaultFailureResultForAI(toolCall))
}

export function buildCompactedToolResultContent(
  toolCalls: CoreHistoryToolCall[],
  options: CoreCompactedToolResultOptions = {},
): Array<{ type: 'tool-result'; toolCallId: string; toolName: string; result: JsonValue }> {
  let totalResultChars = 0
  const toolNameForAI = options.getAIToolName ?? getAIToolName

  return toolCalls.map(toolCall => {
    const rawResult = toolCall.status === 'completed'
      ? sanitizeCompactedToolResultForAI(toolCall.result)
      : compactedFailureToolResultForAI(toolCall, options)
    const resultChars = jsonLength(rawResult)
    const exceedsTotalBudget =
      totalResultChars > 0 &&
      totalResultChars + resultChars > COMPACTED_HISTORY_TOOL_RESULTS_TOTAL_BUDGET_CHARS
    const result = exceedsTotalBudget
      ? compactedToolResultPlaceholder(
          toolCall.status === 'completed'
            ? sanitizeToolResultForAI(toolCall.result)
            : options.failureResultForAI?.(toolCall) ?? defaultFailureResultForAI(toolCall),
          false,
        )
      : rawResult

    totalResultChars += jsonLength(result)
    return {
      type: 'tool-result' as const,
      toolCallId: toolCall.id,
      toolName: toolNameForAI(toolCall.toolId || toolCall.toolName),
      result,
    }
  })
}

export function summarizeRetainedMessagesForLog(
  messages: CoreHistoryChatMessage[],
  startIndex: number,
): JsonObject[] {
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

export function getHistoryProviderData<TMessage extends CoreHistoryChatMessage>(
  message: TMessage,
  options: Pick<CoreBuildHistoryMessagesOptions<unknown, TMessage>, 'providerDataFromContentPart'> = {},
): AgentProviderData[] {
  const providerData: AgentProviderData[] = []
  for (const part of message.contentParts ?? []) {
    if (part.type !== 'provider-data') continue

    const mapped = options.providerDataFromContentPart?.(part, message)
    if (mapped) {
      providerData.push(mapped)
      continue
    }

    if (part.providerData) {
      providerData.push(part.providerData)
    }
  }
  return providerData
}

export function getMessageReasoningContent(message: CoreHistoryChatMessage): string | undefined {
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

function completedHistoryToolCalls(message: CoreHistoryChatMessage): CoreHistoryToolCall[] {
  return message.toolCalls?.filter(
    toolCall => toolCall.status === 'completed' || toolCall.status === 'failed',
  ) ?? []
}

function hasHistoryMessageContent(message: CoreHistoryChatMessage, providerData: AgentProviderData[]): boolean {
  const hasToolContext = (message.toolCalls?.length ?? 0) > 0
  return Boolean(
    message.content ||
    providerData.length > 0 ||
    hasToolContext ||
    (message as CoreHistoryChatMessage & { attachments?: unknown[] }).attachments?.length,
  )
}

function appendHistoryMessage<TContent, TMessage extends CoreHistoryChatMessage>(
  result: CoreHistoryMessage[],
  message: TMessage,
  options: CoreBuildHistoryMessagesOptions<TContent, TMessage>,
  providerData: AgentProviderData[],
  useCompactedToolResults: boolean,
): void {
  const toolNameForAI = options.getAIToolName ?? getAIToolName

  if (message.role === 'user') {
    result.push({
      role: 'user',
      content: options.buildMessageContent(message),
    })
    return
  }

  const assistantMessage: CoreHistoryMessage & { role: 'assistant' } = {
    role: 'assistant',
    content: options.buildMessageContent(message),
  }

  const reasoningContent = getMessageReasoningContent(message)
  if (reasoningContent) {
    assistantMessage.reasoningContent = reasoningContent
  }

  if (providerData.length > 0) {
    assistantMessage.providerData = providerData
  }

  const completedToolCalls = completedHistoryToolCalls(message)
  if (completedToolCalls.length > 0) {
    assistantMessage.toolCalls = completedToolCalls.map(toolCall => ({
      toolCallId: toolCall.id,
      toolName: toolNameForAI(toolCall.toolId || toolCall.toolName),
      args: toolCall.arguments,
    }))
  }

  result.push(assistantMessage)

  if (completedToolCalls.length === 0) return

  result.push({
    role: 'tool',
    content: useCompactedToolResults
      ? buildCompactedToolResultContent(completedToolCalls, {
          getAIToolName: toolNameForAI,
          failureResultForAI: options.failureResultForAI,
        })
      : completedToolCalls.map(toolCall => ({
          type: 'tool-result' as const,
          toolCallId: toolCall.id,
          toolName: toolNameForAI(toolCall.toolId || toolCall.toolName),
          result: toolCall.status === 'completed'
            ? sanitizeToolResultForAI(toolCall.result)
            : options.failureResultForAI?.(toolCall) ?? defaultFailureResultForAI(toolCall),
        })),
  })
}

export function buildHistoryMessages<TContent = unknown, TMessage extends CoreHistoryChatMessage = CoreHistoryChatMessage>(
  messages: TMessage[],
  session: CoreHistorySessionSummary | undefined,
  options: CoreBuildHistoryMessagesOptions<TContent, TMessage>,
): CoreHistoryMessage[] {
  if (session?.summary && session.summaryUpToMessageId) {
    const summaryIndex = messages.findIndex(message => message.id === session.summaryUpToMessageId)
    if (summaryIndex !== -1) {
      const recentMessages = messages.slice(summaryIndex + 1)
      const {
        retainedMessages,
        droppedMessages,
        retainedPayloadChars,
      } = selectCompactedRecentMessagesForPrompt(recentMessages)
      const result: CoreHistoryMessage[] = [
        {
          role: 'user',
          content: `[Conversation History Summary]\n${session.summary}\n\nPlease continue the conversation based on the above context.`,
        },
        {
          role: 'assistant',
          content: 'Understood. I have reviewed the previous conversation context. Please continue.',
        },
      ]

      for (const message of retainedMessages) {
        if (message.role !== 'user' && message.role !== 'assistant') continue
        if (message.isStreaming) continue
        const providerData = message === retainedMessages[retainedMessages.length - 1]
          ? getHistoryProviderData(message, options)
          : []
        if (!hasHistoryMessageContent(message, providerData)) continue
        appendHistoryMessage(result, message, options, providerData, true)
      }

      options.onCompactedHistory?.({
        sessionId: session.id,
        summaryUpToMessageId: session.summaryUpToMessageId,
        summaryIndex,
        totalSessionMessages: messages.length,
        recentSessionMessages: recentMessages.length,
        retainedRecentMessages: retainedMessages.length,
        droppedRecentMessages: droppedMessages.length,
        retainedPayloadChars,
        originalRecentPayloadChars: retainedHistoryPayloadLength(recentMessages),
        retainedPayloadBudgetChars: COMPACTED_HISTORY_RETAINED_PAYLOAD_BUDGET_CHARS,
        summaryChars: session.summary.length,
        retainedMessages: summarizeRetainedMessagesForLog(retainedMessages, summaryIndex + 1),
        droppedMessages: summarizeRetainedMessagesForLog(droppedMessages, summaryIndex + 1),
        resultMessages: result,
      })

      return result
    }

    options.onMissingSummaryAnchor?.({
      sessionId: session.id,
      summaryUpToMessageId: session.summaryUpToMessageId,
    })
  }

  const result: CoreHistoryMessage[] = []
  for (const message of messages) {
    if (message.role !== 'user' && message.role !== 'assistant') continue
    if (message.isStreaming) continue
    const providerData = getHistoryProviderData(message, options)
    if (!hasHistoryMessageContent(message, providerData)) continue
    appendHistoryMessage(result, message, options, providerData, false)
  }

  return result
}

export function filterHistoryForNonToolAPI<TContent = unknown>(
  messages: CoreHistoryMessage[],
): Array<{ role: 'user' | 'assistant'; content: TContent; reasoningContent?: string }> {
  return messages
    .filter((message): message is CoreHistoryMessage & { role: 'user' | 'assistant' } =>
      message.role === 'user' || message.role === 'assistant'
    )
    .map(message => {
      if (message.role === 'user') {
        return { role: 'user' as const, content: message.content as TContent }
      }
      const result: { role: 'assistant'; content: TContent; reasoningContent?: string } = {
        role: 'assistant',
        content: message.content as TContent,
      }
      if (message.reasoningContent) {
        result.reasoningContent = message.reasoningContent
      }
      return result
    })
}

export function historyMessagesForLog(messages: CoreHistoryMessage[]): CoreChatLogMessageShape[] {
  return messages.map(message => {
    if (message.role === 'assistant') {
      return {
        role: message.role,
        content: message.content as CoreChatLogValue,
        toolCalls: message.toolCalls as CoreChatLogMessageShape['toolCalls'],
        reasoningContent: message.reasoningContent,
      }
    }

    return {
      role: message.role,
      content: message.content as CoreChatLogValue,
    }
  })
}

export function buildResumeHistoryAfterToolConfirmation(
  historyWithoutCurrent: CoreHistoryMessage[],
  assistantMessage: CoreResumeAssistantMessage,
): CoreHistoryMessage[] {
  const toolCalls = assistantMessage.toolCalls ?? []
  return [
    ...historyWithoutCurrent,
    {
      role: 'assistant',
      content: assistantMessage.content || '',
      toolCalls: toolCalls.map(toolCall => ({
        toolCallId: toolCall.id,
        toolName: getAIToolName(toolCall.toolId || toolCall.toolName),
        args: toolCall.arguments,
      })),
      ...(assistantMessage.reasoning && { reasoningContent: assistantMessage.reasoning }),
    },
    {
      role: 'tool',
      content: toolCalls.map(toolCall => ({
        type: 'tool-result' as const,
        toolCallId: toolCall.id,
        toolName: getAIToolName(toolCall.toolId || toolCall.toolName),
        result: toolCall.status === 'completed'
          ? sanitizeToolResultForAI(toolCall.result)
          : { error: toolCall.error ?? null },
      })),
    },
  ]
}
