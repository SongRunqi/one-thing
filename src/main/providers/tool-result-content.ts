type ToolResultJsonValue =
  | string
  | number
  | boolean
  | null
  | ToolResultJsonValue[]
  | { [key: string]: ToolResultJsonValue | undefined }

type ToolResultRawValue =
  | ToolResultJsonValue
  | object
  | undefined

type ToolResultRawRecord = { [key: string]: ToolResultRawValue }

type ToolResultContentOutputPart =
  | { type: 'text'; text: string }
  | { type: 'image-data'; data: string; mediaType: string }
  | { type: 'image-url'; url: string }
  | { type: 'file-data'; data: string; mediaType: string; filename?: string }
  | { type: 'file-url'; url: string }

type ToolResultOutput =
  | { type: 'json'; value: ToolResultJsonValue }
  | { type: 'text'; value: string }
  | { type: 'content'; value: ToolResultContentOutputPart[] }

type CodexToolResultOutput =
  | string
  | Array<
      | { type: 'input_text'; text: string }
      | { type: 'input_image'; image_url: string; detail: 'auto' }
    >

function isRecord(value: ToolResultRawValue): value is ToolResultRawRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

export function toolResultPayloadFromPart(part: ToolResultRawValue): ToolResultRawValue {
  if (!isRecord(part)) return part
  return part.result ?? part.output
}

function unwrapToolResultPayload(payload: ToolResultRawValue): ToolResultRawValue {
  if (!isRecord(payload)) return payload
  if ('value' in payload && typeof payload.type === 'string') {
    return payload.value
  }
  return payload
}

function parseDataUrl(value: string): { mediaType: string; data: string } | null {
  const match = /^data:([^;,]+);base64,(.*)$/i.exec(value)
  if (!match) return null
  return { mediaType: match[1], data: match[2] }
}

function mediaPartFromData(
  type: ToolResultRawValue,
  data: ToolResultRawValue,
  mediaType: ToolResultRawValue,
  filename?: ToolResultRawValue,
): ToolResultContentOutputPart | null {
  if (typeof data !== 'string' || data.length === 0) return null

  if (data.startsWith('http://') || data.startsWith('https://')) {
    return type === 'image'
      ? { type: 'image-url', url: data }
      : { type: 'file-url', url: data }
  }

  const parsed = parseDataUrl(data)
  const resolvedMediaType = typeof mediaType === 'string' && mediaType
    ? mediaType
    : parsed?.mediaType

  if (!resolvedMediaType) return null

  const base64Data = parsed?.data ?? data
  if (type === 'image' || resolvedMediaType.startsWith('image/')) {
    return { type: 'image-data', data: base64Data, mediaType: resolvedMediaType }
  }

  return {
    type: 'file-data',
    data: base64Data,
    mediaType: resolvedMediaType,
    ...(typeof filename === 'string' && filename ? { filename } : {}),
  }
}

function addToolResultContentParts(payload: ToolResultRawValue, parts: ToolResultContentOutputPart[]): boolean {
  const value = unwrapToolResultPayload(payload)
  if (!isRecord(value)) return false

  let hasMedia = false
  const addText = (text: ToolResultRawValue) => {
    if (typeof text === 'string' && text.length > 0) {
      parts.push({ type: 'text', text })
    }
  }

  addText(value.output)

  if (Array.isArray(value.content)) {
    for (const part of value.content) {
      if (!isRecord(part)) continue
      if (part.type === 'text') {
        addText(part.text)
        continue
      }
      if (part.type === 'image' || part.type === 'file') {
        const media = mediaPartFromData(part.type, part.data ?? part.image, part.mimeType ?? part.mediaType, part.filename)
        if (media) {
          parts.push(media)
          hasMedia = true
        } else if (typeof part.path === 'string' && part.path) {
          addText(part.type === 'image' ? `[Image: ${part.path}]` : `[File: ${part.path}]`)
        }
      }
    }
  }

  if (Array.isArray(value.attachments)) {
    for (const attachment of value.attachments) {
      if (!isRecord(attachment)) continue
      const media = mediaPartFromData(
        attachment.type,
        attachment.content ?? attachment.data,
        attachment.mimeType ?? attachment.mediaType,
        attachment.filename,
      )
      if (media) {
        parts.push(media)
        hasMedia = true
      } else if (typeof attachment.path === 'string' && attachment.path) {
        addText(attachment.type === 'image' ? `[Image: ${attachment.path}]` : `[File: ${attachment.path}]`)
      }
    }
  }

  return hasMedia
}

function sanitizeJsonValue(value: ToolResultRawValue): ToolResultJsonValue {
  try {
    return JSON.parse(JSON.stringify(value ?? null, (_key, nestedValue: ToolResultRawValue) => {
      if (isRecord(nestedValue)) {
        const nestedType = nestedValue.type
        if (nestedType === 'image' || nestedType === 'file') {
          const copy = { ...nestedValue }
          if (typeof copy.data === 'string') copy.data = `[${nestedType} data omitted: ${copy.data.length} chars]`
          if (typeof copy.content === 'string') copy.content = `[${nestedType} data omitted: ${copy.content.length} chars]`
          if (typeof copy.image === 'string' && copy.image.startsWith('data:')) {
            copy.image = `[${nestedType} data URL omitted: ${copy.image.length} chars]`
          }
          return copy
        }
      }
      return nestedValue
    })) as ToolResultJsonValue
  } catch {
    return String(value)
  }
}

export function toolResultToText(payload: ToolResultRawValue): string {
  const value = unwrapToolResultPayload(payload)
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (isRecord(value)) {
    if (typeof value.output === 'string') return value.output
    if (Array.isArray(value.content)) {
      const text = value.content
        .map((part) => {
          if (!isRecord(part)) return ''
          if (part.type === 'text') return typeof part.text === 'string' ? part.text : ''
          if (part.type === 'image') return typeof part.path === 'string' ? `[Image: ${part.path}]` : '[Image]'
          if (part.type === 'file') return typeof part.path === 'string' ? `[File: ${part.path}]` : '[File]'
          return ''
        })
        .filter(Boolean)
        .join('\n')
      if (text) return text
    }
  }
  return JSON.stringify(sanitizeJsonValue(value))
}

export function toolResultToAISDKOutput(payload: ToolResultRawValue): ToolResultOutput {
  const parts: ToolResultContentOutputPart[] = []
  if (addToolResultContentParts(payload, parts)) {
    return { type: 'content', value: parts }
  }
  return { type: 'json', value: sanitizeJsonValue(unwrapToolResultPayload(payload)) }
}

export function toolResultToCodexOutput(payload: ToolResultRawValue): CodexToolResultOutput {
  const parts: ToolResultContentOutputPart[] = []
  if (!addToolResultContentParts(payload, parts)) {
    return toolResultToText(payload)
  }

  const output: Exclude<CodexToolResultOutput, string> = []
  for (const part of parts) {
    if (part.type === 'text') {
      if (part.text) output.push({ type: 'input_text', text: part.text })
      continue
    }
    if (part.type === 'image-data') {
      output.push({
        type: 'input_image',
        image_url: `data:${part.mediaType};base64,${part.data}`,
        detail: 'auto',
      })
      continue
    }
    if (part.type === 'image-url') {
      output.push({ type: 'input_image', image_url: part.url, detail: 'auto' })
    }
  }

  return output
}
