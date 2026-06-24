import type { ChatMessage, ToolCall } from '../../../shared/ipc.js'
import { getAIToolName } from '../../providers/tool-name-alias.js'
import { sanitizeToolResultForAI, type HistoryMessage } from './message-helpers.js'

type ResumeAssistantMessage = Pick<ChatMessage, 'content' | 'reasoning'> & {
  toolCalls?: ToolCall[]
}

export function buildResumeHistoryAfterToolConfirmation(
  historyWithoutCurrent: HistoryMessage[],
  assistantMessage: ResumeAssistantMessage,
): HistoryMessage[] {
  const toolCalls = assistantMessage.toolCalls ?? []
  return [
    ...historyWithoutCurrent,
    {
      role: 'assistant',
      content: assistantMessage.content || '',
      toolCalls: toolCalls.map(tc => ({
        toolCallId: tc.id,
        toolName: getAIToolName(tc.toolId || tc.toolName),
        args: tc.arguments,
      })),
      ...(assistantMessage.reasoning && { reasoningContent: assistantMessage.reasoning }),
    },
    {
      role: 'tool',
      content: toolCalls.map(tc => ({
        type: 'tool-result' as const,
        toolCallId: tc.id,
        toolName: getAIToolName(tc.toolId || tc.toolName),
        result: tc.status === 'completed' ? sanitizeToolResultForAI(tc.result) : { error: tc.error ?? null },
      })),
    },
  ]
}
