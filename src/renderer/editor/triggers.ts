export type EditorTriggerType = 'command' | 'path' | 'file'

export interface EditorTrigger {
  type: EditorTriggerType
  query: string
  from: number
  to: number
  explicit?: boolean
}

export function parseEditorTrigger(value: string, cursor = value.length): EditorTrigger | null {
  const boundedCursor = Math.max(0, Math.min(cursor, value.length))
  const beforeCursor = value.slice(0, boundedCursor)
  const afterCursor = value.slice(boundedCursor)
  const lineStart = beforeCursor.lastIndexOf('\n') + 1
  const lineBeforeCursor = beforeCursor.slice(lineStart)

  const commandMatch = lineBeforeCursor.match(/^\/([\w-]*)$/)
  if (lineStart === 0 && commandMatch && !afterCursor.trim()) {
    return {
      type: 'command',
      query: commandMatch[1],
      from: 0,
      to: boundedCursor,
    }
  }

  const pathMatch = lineBeforeCursor.match(/^\/cd\s+([^\n]*)$/)
  if (lineStart === 0 && pathMatch) {
    return {
      type: 'path',
      query: pathMatch[1],
      from: 0,
      to: boundedCursor,
    }
  }

  const explicitFileMatch = lineBeforeCursor.match(/(^|\s)@files(?:\s+([^\n@]*))?$/)
  if (explicitFileMatch?.index !== undefined) {
    const leading = explicitFileMatch[1] || ''
    return {
      type: 'file',
      query: (explicitFileMatch[2] || '').trim(),
      from: lineStart + explicitFileMatch.index + leading.length,
      to: boundedCursor,
      explicit: true,
    }
  }

  const fileMatch = lineBeforeCursor.match(/@([^\s@]*)$/)
  if (fileMatch?.index !== undefined) {
    return {
      type: 'file',
      query: fileMatch[1],
      from: lineStart + fileMatch.index,
      to: boundedCursor,
      explicit: false,
    }
  }

  return null
}

export function applyTriggerReplacement(
  value: string,
  trigger: EditorTrigger,
  replacement: string,
): string {
  return `${value.slice(0, trigger.from)}${replacement}${value.slice(trigger.to)}`
}
