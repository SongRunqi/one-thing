import type {
  AgentContentPart,
  AgentJsonObject,
  AgentJsonValue,
  AgentMessage,
  AgentMessageContent,
  AgentProviderData,
  AgentRole,
  AgentToolCall,
} from './types.js'

export type AgentHistoryContent =
  | string
  | null
  | undefined
  | Array<{
      type: string
      text?: string
      image?: string
      audio?: string
      video?: string
      data?: string
      url?: string
      mediaType?: string
      mimeType?: string
      filename?: string
      name?: string
    }>

export type AgentHistoryMessage =
  | { role: 'system' | 'developer' | 'user'; content?: AgentHistoryContent }
  | {
      role: 'assistant'
      content?: AgentHistoryContent
      reasoningContent?: string
      providerData?: AgentProviderData[]
      toolCalls?: Array<{
        id?: string
        name?: string
        arguments?: string
        toolCallId?: string
        toolName?: string
        args?: AgentJsonObject
      }>
    }
  | {
      role: 'tool'
      toolCallId?: string
      content?: string | Array<{
        type?: string
        toolCallId?: string
        toolName?: string
        result?: AgentJsonValue
      }>
    }

function stringifyToolResult(result: AgentJsonValue | undefined): string {
  if (result == null) return ''
  if (typeof result === 'string') return result
  try {
    return JSON.stringify(result)
  } catch {
    return String(result)
  }
}

function toolCallArguments(call: NonNullable<Extract<AgentHistoryMessage, { role: 'assistant' }>['toolCalls']>[number]): string {
  if (typeof call.arguments === 'string') return call.arguments
  try {
    return JSON.stringify(call.args ?? {})
  } catch {
    return '{}'
  }
}

function agentRoleFromHistory(role: 'system' | 'developer' | 'user'): AgentRole {
  return role === 'developer' ? 'system' : role
}

export function agentContentFromHistoryContent(content: AgentHistoryContent): AgentMessageContent {
  if (content == null) return ''
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return String(content)

  const parts: AgentContentPart[] = []
  for (const part of content) {
    if (part.type === 'text' && typeof part.text === 'string') {
      parts.push({ type: 'text', text: part.text })
      continue
    }

    if (part.type === 'image') {
      const image = part.image ?? part.url ?? part.data
      if (typeof image === 'string') {
        parts.push({
          type: 'image',
          image,
          mediaType: part.mediaType ?? part.mimeType,
        })
      }
      continue
    }

    if (part.type === 'file') {
      const data = part.data ?? part.url
      const mediaType = part.mediaType ?? part.mimeType
      if (typeof data === 'string' && typeof mediaType === 'string') {
        parts.push({
          type: 'file',
          data,
          mediaType,
          filename: part.filename ?? part.name,
        })
      }
      continue
    }

    if (part.type === 'audio') {
      const audio = part.audio ?? part.data ?? part.url
      if (typeof audio === 'string') {
        parts.push({
          type: 'audio',
          audio,
          mediaType: part.mediaType ?? part.mimeType,
        })
      }
      continue
    }

    if (part.type === 'video') {
      const video = part.video ?? part.data ?? part.url
      if (typeof video === 'string') {
        parts.push({
          type: 'video',
          video,
          mediaType: part.mediaType ?? part.mimeType,
        })
      }
    }
  }

  return parts.length > 0 ? parts : ''
}

export function agentToolCallsFromHistory(
  toolCalls: Extract<AgentHistoryMessage, { role: 'assistant' }>['toolCalls'] = [],
): AgentToolCall[] {
  return toolCalls
    .map(call => ({
      id: call.id ?? call.toolCallId ?? '',
      name: call.name ?? call.toolName ?? '',
      arguments: toolCallArguments(call),
    }))
    .filter(call => call.id && call.name)
}

export function agentMessagesFromHistory(messages: AgentHistoryMessage[]): AgentMessage[] {
  const result: AgentMessage[] = []

  for (const message of messages) {
    if (message.role === 'tool') {
      if (Array.isArray(message.content)) {
        for (const item of message.content) {
          result.push({
            role: 'tool',
            toolCallId: item.toolCallId ?? message.toolCallId ?? '',
            content: stringifyToolResult(item.result),
          })
        }
      } else {
        result.push({
          role: 'tool',
          toolCallId: message.toolCallId ?? '',
          content: message.content ?? '',
        })
      }
      continue
    }

    if (message.role === 'assistant') {
      const toolCalls = agentToolCallsFromHistory(message.toolCalls)
      const providerData = message.providerData ?? []
      result.push({
        role: 'assistant',
        content: agentContentFromHistoryContent(message.content),
        ...(message.reasoningContent ? { reasoningContent: message.reasoningContent } : {}),
        ...(providerData.length > 0 ? { providerData } : {}),
        ...(toolCalls.length > 0 ? { toolCalls } : {}),
      })
      continue
    }

    result.push({
      role: agentRoleFromHistory(message.role),
      content: agentContentFromHistoryContent(message.content),
    })
  }

  return result
}
