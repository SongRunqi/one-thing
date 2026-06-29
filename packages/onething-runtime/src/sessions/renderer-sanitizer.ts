export interface OnethingRendererContentPartLike {
  type?: string
}

export interface OnethingRendererMessageLike {
  contentParts?: OnethingRendererContentPartLike[]
}

export interface OnethingRendererSessionLike<TMessage extends OnethingRendererMessageLike = OnethingRendererMessageLike> {
  messages: TMessage[]
}

function sanitizeContentParts<TPart extends OnethingRendererContentPartLike>(
  parts: TPart[] | undefined,
): TPart[] | undefined {
  if (!parts?.some(part => part.type === 'provider-data')) return parts
  return parts.filter(part => part.type !== 'provider-data')
}

export function sanitizeOnethingMessageForRenderer<TMessage extends OnethingRendererMessageLike>(
  message: TMessage,
): TMessage {
  const contentParts = sanitizeContentParts(message.contentParts)
  if (contentParts === message.contentParts) return message
  return { ...message, contentParts } as TMessage
}

export function sanitizeOnethingMessagesForRenderer<TMessage extends OnethingRendererMessageLike>(
  messages: TMessage[] | undefined,
): TMessage[] | undefined {
  if (!messages?.some(message => message.contentParts?.some(part => part.type === 'provider-data'))) {
    return messages
  }
  return messages.map(sanitizeOnethingMessageForRenderer)
}

export function sanitizeOnethingSessionForRenderer<
  TMessage extends OnethingRendererMessageLike,
  TSession extends OnethingRendererSessionLike<TMessage>,
>(session: TSession): TSession {
  const messages = sanitizeOnethingMessagesForRenderer(session.messages)
  if (messages === session.messages) return session
  return { ...session, messages } as TSession
}
