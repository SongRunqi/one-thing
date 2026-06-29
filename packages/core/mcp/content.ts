import { toJsonValue } from '../json.js'
import type { MCPToolCallResult } from './types.js'

export function normalizeMCPContent(content: object[] | undefined): MCPToolCallResult['content'] {
  if (!Array.isArray(content)) return undefined
  return content.map(item => {
    const record = toJsonValue(item)
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      return { type: 'text', text: String(record ?? '') }
    }
    const type = typeof record.type === 'string' ? record.type : 'text'
    if (type === 'image') {
      return {
        type: 'image',
        data: typeof record.data === 'string' ? record.data : undefined,
        mimeType: typeof record.mimeType === 'string' ? record.mimeType : undefined,
      }
    }
    if (type === 'resource') {
      return {
        type: 'resource',
        text: typeof record.text === 'string' ? record.text : undefined,
        data: typeof record.data === 'string' ? record.data : undefined,
        mimeType: typeof record.mimeType === 'string' ? record.mimeType : undefined,
      }
    }
    return {
      type: 'text',
      text: typeof record.text === 'string' ? record.text : JSON.stringify(record),
    }
  })
}
