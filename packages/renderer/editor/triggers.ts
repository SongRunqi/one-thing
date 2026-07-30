export type EditorTriggerType = 'command' | 'path' | 'file' | 'prompt' | 'skill' | 'page' | 'member'

export interface EditorTrigger {
  type: EditorTriggerType
  query: string
  from: number
  to: number
  explicit?: boolean
}

export interface EditorTriggerOptions {
  /**
   * '@page' references the embedded browser, a desktop-only surface. Hosts
   * without it disable the keyword so the text stays an ordinary bare-@ file
   * query instead of a dead trigger.
   */
  pageTrigger?: boolean
  /**
   * Collab rooms: bare `@` targets room MEMBERS (the feature's primary
   * interaction) instead of files — a mention must be spelled exactly for
   * activation, so it needs the completion popover, while files remain
   * reachable via the explicit `@files` keyword.
   */
  memberTrigger?: boolean
}

export function parseEditorTrigger(
  value: string,
  cursor = value.length,
  options: EditorTriggerOptions = {},
): EditorTrigger | null {
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

  const promptMatch = lineBeforeCursor.match(/(^|\s)@prompts?(?:\s+([^\n@]*))?$/)
  if (promptMatch?.index !== undefined) {
    const leading = promptMatch[1] || ''
    return {
      type: 'prompt',
      query: (promptMatch[2] || '').trim(),
      from: lineStart + promptMatch.index + leading.length,
      to: boundedCursor,
      explicit: true,
    }
  }

  if (options.pageTrigger !== false) {
    const pageMatch = lineBeforeCursor.match(/(^|\s)@pages?(?:\s+([^\n@]*))?$/)
    if (pageMatch?.index !== undefined) {
      const leading = pageMatch[1] || ''
      return {
        type: 'page',
        query: (pageMatch[2] || '').trim(),
        from: lineStart + pageMatch.index + leading.length,
        to: boundedCursor,
        explicit: true,
      }
    }
  }

  const skillMatch = lineBeforeCursor.match(/(^|\s)@skills?(?:\s+([^\n@]*))?$/)
  if (skillMatch?.index !== undefined) {
    const leading = skillMatch[1] || ''
    return {
      type: 'skill',
      query: (skillMatch[2] || '').trim(),
      from: lineStart + skillMatch.index + leading.length,
      to: boundedCursor,
      explicit: true,
    }
  }

  const fileMatch = lineBeforeCursor.match(/@([^\s@]*)$/)
  if (fileMatch?.index !== undefined) {
    return {
      type: options.memberTrigger ? 'member' : 'file',
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
