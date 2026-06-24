import type { ToolResult as CanonicalToolResult, ToolResultContentPart } from '../../../shared/ipc/index.js'
import type { JsonObject } from '../../../shared/json.js'
import { toJsonObject } from '../../../shared/json.js'
import { summarizeToolFailureParameters } from '../../../shared/tool-failure-params.js'
import { formatPermissionRejectedMessage } from '../../../shared/tool-errors.js'

export interface ToolResultLike {
  title?: string
  output?: string
  metadata?: JsonObject
  attachments?: Array<{
    type: 'file' | 'image'
    path: string
    content?: string
    data?: string
    mimeType?: string
  }>
}

export function textFromToolResult(result: CanonicalToolResult | undefined): string {
  if (!result) return ''
  const text = result.content
    .map((part) => {
      if (part.type === 'text') return part.text ?? ''
      if (part.type === 'file') return part.path ? `[File: ${part.path}]` : ''
      if (part.type === 'image') return part.path ? `[Image: ${part.path}]` : '[Image]'
      return ''
    })
    .filter(Boolean)
    .join('\n')
  return text || JSON.stringify(result)
}

type ToolResultInput =
  | string
  | ToolResultLike
  | CanonicalToolResult<JsonObject | undefined>
  | null
  | undefined

export function toolResultToStructured(result: ToolResultInput): CanonicalToolResult<JsonObject | undefined> {
  if (result && typeof result === 'object' && isCanonicalToolResult(result)) return result

  if (typeof result === 'string') {
    return { content: [{ type: 'text', text: result }], details: undefined }
  }

  const value = (result && typeof result === 'object' ? result : {}) as ToolResultLike
  const content: ToolResultContentPart[] = []

  if (typeof value.output === 'string') {
    content.push({ type: 'text', text: value.output })
  }

  for (const attachment of value.attachments ?? []) {
    if (!attachment?.path) continue
    const part: ToolResultContentPart = {
      type: attachment.type === 'image' ? 'image' : 'file',
      path: attachment.path,
      mimeType: attachment.mimeType,
    }
    const attachmentData = attachment.content ?? attachment.data
    if (attachment.type === 'image') {
      part.data = attachmentData
    } else {
      part.text = attachment.content
      part.data = attachment.data
    }
    content.push(part)
  }

  if (content.length === 0) {
    content.push({ type: 'text', text: JSON.stringify(result ?? null) })
  }

  return {
    content,
    details: value.metadata ? toJsonObject(value.metadata) : undefined,
  }
}

export interface ToolFailureLike {
  error?: string
  rejected?: boolean
  rejectionReason?: string
  status?: string
  toolName?: string
  toolId?: string
  arguments?: JsonObject
}

export interface ToolFailureResultForAI {
  error: string
  rejected?: boolean
  rejectionReason?: string
  status?: string
  parameters?: JsonObject
  parameterSummary?: string
}

export function toolFailureText(failure: ToolFailureLike): string {
  if (failure.rejected) {
    return formatPermissionRejectedMessage(failure.rejectionReason) || failure.error || 'The user rejected permission for this tool.'
  }
  if (typeof failure.error === 'string' && failure.error.trim()) return failure.error
  if (failure.status === 'cancelled') return 'Tool execution was cancelled.'
  return 'Tool execution failed.'
}

export function toolFailureResultForAI(failure: ToolFailureLike): ToolFailureResultForAI {
  const result: ToolFailureResultForAI = {
    error: toolFailureText(failure),
  }
  const parameterSummary = summarizeToolFailureParameters(
    failure.toolName || failure.toolId,
    failure.arguments,
  )
  if (parameterSummary) {
    result.parameterSummary = parameterSummary.summary
    result.parameters = parameterSummary.parameters
  }
  if (failure.rejected) result.rejected = true
  if (failure.rejectionReason) result.rejectionReason = failure.rejectionReason
  if (failure.status) result.status = failure.status
  return result
}

export function isCanonicalToolResult(value: object | null | undefined): value is CanonicalToolResult<JsonObject | undefined> {
  return Boolean(
    value &&
    Array.isArray((value as Partial<CanonicalToolResult>).content),
  )
}
