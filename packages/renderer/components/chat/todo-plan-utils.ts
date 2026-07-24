import type { EditorSelection } from '@/editor/types'

export interface ParsedTask {
  lineIndex: number
  done: boolean
  text: string
  section: string
}

export interface TaskSection {
  title: string
  tasks: ParsedTask[]
}

export interface FindMatch {
  from: number
  to: number
  lineIndex: number
}

export type MarkdownFormatKind = 'bold' | 'italic' | 'inline-code' | 'task'

export interface MarkdownFormatResult {
  content: string
  selection: EditorSelection
}

const FENCE_RE = /^\s*(```|~~~)/
const TASK_RE = /^(\s*[-*]\s+\[)([ xX])(\]\s+)(.*)$/

function lineBoundsAt(content: string, position: number): { from: number; to: number; text: string } {
  const safePosition = Math.max(0, Math.min(position, content.length))
  const from = content.lastIndexOf('\n', safePosition - 1) + 1
  const nextBreak = content.indexOf('\n', safePosition)
  const to = nextBreak === -1 ? content.length : nextBreak
  return { from, to, text: content.slice(from, to) }
}

function lineIndexAt(content: string, position: number): number {
  return content.slice(0, Math.max(0, Math.min(position, content.length))).split('\n').length - 1
}

function replaceRange(content: string, from: number, to: number, insert: string): string {
  return `${content.slice(0, from)}${insert}${content.slice(to)}`
}

export function parseTasks(content: string): ParsedTask[] {
  let section = 'Tasks'
  let inFence = false
  const tasks: ParsedTask[] = []

  content.split('\n').forEach((line, lineIndex) => {
    if (FENCE_RE.test(line)) {
      inFence = !inFence
      return
    }
    if (inFence) return

    const heading = line.match(/^##\s+(.+?)\s*$/)
    if (heading) {
      section = heading[1].trim() || 'Tasks'
      return
    }

    const task = line.match(TASK_RE)
    if (!task) return
    tasks.push({
      lineIndex,
      done: task[2].toLowerCase() === 'x',
      text: task[4].trim(),
      section,
    })
  })

  return tasks
}

export function groupTasksBySection(sourceTasks: ParsedTask[]): TaskSection[] {
  const sections: TaskSection[] = []
  for (const task of sourceTasks) {
    let section = sections.find(item => item.title === task.section)
    if (!section) {
      section = { title: task.section, tasks: [] }
      sections.push(section)
    }
    section.tasks.push(task)
  }
  return sections
}

export function toggleTaskLine(content: string, lineIndex: number): string {
  const lines = content.split('\n')
  const line = lines[lineIndex]
  const match = line?.match(TASK_RE)
  if (!match) return content
  lines[lineIndex] = `${match[1]}${match[2].toLowerCase() === 'x' ? ' ' : 'x'}${match[3]}${match[4]}`
  return lines.join('\n')
}

export function deleteTaskLine(content: string, lineIndex: number): string {
  const lines = content.split('\n')
  if (!lines[lineIndex]?.match(TASK_RE)) return content
  lines.splice(lineIndex, 1)
  return lines.join('\n').replace(/\n*$/, '\n')
}

export function appendTask(content: string, text: string, sectionTitle?: string): string {
  const taskText = text.trim()
  if (!taskText) return content
  const taskLine = `- [ ] ${taskText}`

  if (!sectionTitle) {
    const separator = content.endsWith('\n') || content.length === 0 ? '' : '\n'
    return `${content}${separator}${taskLine}\n`
  }

  const lines = content.split('\n')
  const sectionIndex = lines.findIndex(line => line.trim().toLowerCase() === `## ${sectionTitle.toLowerCase()}`)
  if (sectionIndex === -1) {
    const separator = content.endsWith('\n') || content.length === 0 ? '' : '\n'
    return `${content}${separator}## ${sectionTitle}\n${taskLine}\n`
  }

  let insertIndex = lines.length
  for (let index = sectionIndex + 1; index < lines.length; index += 1) {
    if (/^##\s+/.test(lines[index])) {
      insertIndex = index
      break
    }
  }

  while (insertIndex > sectionIndex + 1 && lines[insertIndex - 1]?.trim() === '') {
    insertIndex -= 1
  }
  lines.splice(insertIndex, 0, taskLine)
  return lines.join('\n').replace(/\n*$/, '\n')
}

export function titleFromMarkdown(content: string, fallback: string): string {
  const firstContentLine = content
    .split('\n')
    .map(line => line.trim())
    .find(Boolean)
  if (!firstContentLine) return fallback
  const heading = firstContentLine.match(/^#\s+(.+)$/)
  return (heading?.[1] || firstContentLine).trim() || fallback
}

export function findMarkdownMatches(content: string, query: string): FindMatch[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return []

  const matches: FindMatch[] = []
  const haystack = content.toLowerCase()
  let index = 0
  while (index <= haystack.length) {
    const found = haystack.indexOf(needle, index)
    if (found === -1) break
    matches.push({
      from: found,
      to: found + needle.length,
      lineIndex: lineIndexAt(content, found),
    })
    index = found + Math.max(needle.length, 1)
  }
  return matches
}

function wrapSelection(
  content: string,
  selection: EditorSelection,
  prefix: string,
  suffix: string,
  placeholder: string,
): MarkdownFormatResult {
  const selected = content.slice(selection.from, selection.to)
  const inner = selected || placeholder
  const insert = `${prefix}${inner}${suffix}`
  const nextFrom = selection.from + prefix.length
  return {
    content: replaceRange(content, selection.from, selection.to, insert),
    selection: {
      from: nextFrom,
      to: nextFrom + inner.length,
    },
  }
}

export function applyMarkdownFormat(
  content: string,
  selection: EditorSelection,
  kind: MarkdownFormatKind,
): MarkdownFormatResult {
  if (kind === 'bold') return wrapSelection(content, selection, '**', '**', 'bold text')
  if (kind === 'italic') return wrapSelection(content, selection, '*', '*', 'italic text')
  if (kind === 'inline-code') return wrapSelection(content, selection, '`', '`', 'code')

  const line = lineBoundsAt(content, selection.from)
  const existingTask = line.text.match(TASK_RE)
  if (existingTask) {
    const leading = line.text.match(/^\s*/)?.[0] || ''
    const nextLine = `${leading}- ${existingTask[4]}`
    const nextContent = replaceRange(content, line.from, line.to, nextLine)
    return {
      content: nextContent,
      selection: {
        from: Math.min(selection.from, nextContent.length),
        to: Math.min(selection.to, nextContent.length),
      },
    }
  }

  const trimmed = line.text.trim()
  const leading = line.text.match(/^\s*/)?.[0] || ''
  const taskLine = `${leading}- [ ] ${trimmed}`
  const cursor = line.from + `${leading}- [ ] `.length + trimmed.length
  return {
    content: replaceRange(content, line.from, line.to, taskLine),
    selection: { from: cursor, to: cursor },
  }
}
