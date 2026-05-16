import type { ChatMessage, ChatSession, ContentPart } from '../../shared/ipc.js'

function sanitizeContentParts(parts: ContentPart[] | undefined): ContentPart[] | undefined {
  if (!parts?.some((part) => part.type === 'provider-data')) return parts
  return parts.filter((part) => part.type !== 'provider-data')
}

export function sanitizeMessageForRenderer<T extends ChatMessage>(message: T): T {
  const contentParts = sanitizeContentParts(message.contentParts)
  if (contentParts === message.contentParts) return message
  return { ...message, contentParts } as T
}

export function sanitizeMessagesForRenderer<T extends ChatMessage>(messages: T[] | undefined): T[] | undefined {
  if (!messages?.some((message) => message.contentParts?.some((part) => part.type === 'provider-data'))) {
    return messages
  }
  return messages.map(sanitizeMessageForRenderer)
}

export function sanitizeSessionForRenderer<T extends ChatSession>(session: T): T {
  const messages = sanitizeMessagesForRenderer(session.messages)
  if (messages === session.messages) return session
  return { ...session, messages } as T
}
