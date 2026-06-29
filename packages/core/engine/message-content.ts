import type { JsonObject, JsonValue } from '../json.js'

export type CoreAIMessageContent =
  | string
  | Array<
      | { type: 'text'; text: string }
      | { type: 'image'; image: string; mediaType?: string }
      | { type: 'file'; data: string; mediaType: string }
    >

export interface CoreMessageAttachment {
  fileName?: string
  mimeType: string
  size?: number
  mediaType: string
  base64Data?: string
}

export interface CoreMessageContentSource {
  content: string
  attachments?: CoreMessageAttachment[]
}

export interface BuildMessageContentOptions {
  onImageAttachment?: (input: {
    mimeType: string
    base64Length: number
    dataUrlPrefix: string
  }) => void
}

/**
 * Format messages for logging without full base64 data.
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
 * Convert a message with attachments to provider-facing multimodal content.
 */
export function buildMessageContent(
  message: CoreMessageContentSource,
  options: BuildMessageContentOptions = {},
): CoreAIMessageContent {
  if (!message.attachments || message.attachments.length === 0) {
    return message.content
  }

  const contentParts: Exclude<CoreAIMessageContent, string> = []

  if (message.content) {
    contentParts.push({ type: 'text', text: message.content })
  }

  for (const attachment of message.attachments) {
    if (attachment.mediaType === 'image' && attachment.base64Data) {
      const dataUrl = `data:${attachment.mimeType};base64,${attachment.base64Data}`
      options.onImageAttachment?.({
        mimeType: attachment.mimeType,
        base64Length: attachment.base64Data.length,
        dataUrlPrefix: dataUrl.substring(0, 50) + '...',
      })
      contentParts.push({
        type: 'image',
        image: dataUrl,
      })
    } else if (attachment.base64Data) {
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
 * Extract text from provider-facing message content.
 */
export function getTextFromContent(content: CoreAIMessageContent): string {
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
