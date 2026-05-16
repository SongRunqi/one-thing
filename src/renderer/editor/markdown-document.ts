import type { EditorHandle, EditorSelection } from './types'

export type MarkdownDocumentSurface =
  | 'todo-notes'
  | 'document'
  | 'assistant-message'
  | 'user-message'
  | 'streaming'
  | string

export interface MarkdownFeatureSet {
  tasks?: boolean
  tables?: boolean
  images?: boolean
  math?: boolean
  codeBlocks?: boolean
  frontmatter?: boolean
}

export type MarkdownCommand =
  | 'bold'
  | 'italic'
  | 'strikethrough'
  | 'underline'
  | 'inline-code'
  | 'link'
  | 'heading-1'
  | 'heading-2'
  | 'heading-3'
  | 'bullet-list'
  | 'ordered-list'
  | 'task-list'
  | 'blockquote'
  | 'code-block'
  | 'table'
  | 'image'
  | 'horizontal-rule'

export interface MarkdownCommandResult {
  content: string
  selection: EditorSelection
}

export interface MarkdownDocumentEditorHandle extends EditorHandle {
  applyCommand: (command: MarkdownCommand) => void
}

export interface MarkdownRenderOptions {
  surface?: 'document' | 'assistant-message' | 'user-message' | 'streaming'
  streaming?: boolean
  allowHtml?: boolean
  math?: boolean
}

export const DEFAULT_MARKDOWN_FEATURES: Required<MarkdownFeatureSet> = {
  tasks: true,
  tables: true,
  images: true,
  math: true,
  codeBlocks: true,
  frontmatter: true,
}

const TASK_PREFIX_RE = /^(\s*)([-*+]\s+)\[[ xX]\]\s+/
const LIST_PREFIX_RE = /^(\s*)(?:[-*+]\s+|\d+\.\s+|[-*+]\s+\[[ xX]\]\s+)/
const HEADING_PREFIX_RE = /^\s{0,3}#{1,6}\s+/
const BLOCKQUOTE_PREFIX_RE = /^(\s*)>\s?/

export function normalizeMarkdownFeatures(features?: MarkdownFeatureSet): Required<MarkdownFeatureSet> {
  return {
    ...DEFAULT_MARKDOWN_FEATURES,
    ...(features || {}),
  }
}

export function applyMarkdownCommand(
  content: string,
  selection: EditorSelection,
  command: MarkdownCommand,
): MarkdownCommandResult {
  if (command === 'bold') return wrapInline(content, selection, '**', '**', 'bold text')
  if (command === 'italic') return wrapInline(content, selection, '*', '*', 'italic text')
  if (command === 'strikethrough') return wrapInline(content, selection, '~~', '~~', 'struck text')
  if (command === 'underline') return wrapInline(content, selection, '<u>', '</u>', 'underlined text')
  if (command === 'inline-code') return wrapInline(content, selection, '`', '`', 'code')
  if (command === 'link') return insertLink(content, selection)
  if (command === 'image') return insertImage(content, selection)
  if (command === 'heading-1') return prefixSelectedLines(content, selection, line => headingLine(line, 1))
  if (command === 'heading-2') return prefixSelectedLines(content, selection, line => headingLine(line, 2))
  if (command === 'heading-3') return prefixSelectedLines(content, selection, line => headingLine(line, 3))
  if (command === 'bullet-list') return prefixSelectedLines(content, selection, bulletLine)
  if (command === 'ordered-list') return prefixSelectedLines(content, selection, orderedLine)
  if (command === 'task-list') return prefixSelectedLines(content, selection, taskLine)
  if (command === 'blockquote') return prefixSelectedLines(content, selection, quoteLine)
  if (command === 'code-block') return insertCodeBlock(content, selection)
  if (command === 'table') return insertBlock(content, selection, '| Column A | Column B |\n| --- | --- |\n| Value | Value |')
  if (command === 'horizontal-rule') return insertBlock(content, selection, '---')
  return { content, selection }
}

function replaceRange(content: string, from: number, to: number, insert: string): string {
  return `${content.slice(0, from)}${insert}${content.slice(to)}`
}

function normalizeSelection(content: string, selection: EditorSelection): EditorSelection {
  const from = Math.max(0, Math.min(selection.from, selection.to, content.length))
  const to = Math.max(0, Math.min(Math.max(selection.from, selection.to), content.length))
  return { from, to }
}

function wrapInline(
  content: string,
  selection: EditorSelection,
  prefix: string,
  suffix: string,
  placeholder: string,
): MarkdownCommandResult {
  const range = normalizeSelection(content, selection)
  const selected = content.slice(range.from, range.to)
  const before = content.slice(Math.max(0, range.from - prefix.length), range.from)
  const after = content.slice(range.to, range.to + suffix.length)

  if (selected && before === prefix && after === suffix) {
    const nextContent = replaceRange(
      content,
      range.from - prefix.length,
      range.to + suffix.length,
      selected,
    )
    return {
      content: nextContent,
      selection: {
        from: range.from - prefix.length,
        to: range.to - prefix.length,
      },
    }
  }

  const inner = selected || placeholder
  const insert = `${prefix}${inner}${suffix}`
  const nextFrom = range.from + prefix.length
  return {
    content: replaceRange(content, range.from, range.to, insert),
    selection: { from: nextFrom, to: nextFrom + inner.length },
  }
}

function insertLink(content: string, selection: EditorSelection): MarkdownCommandResult {
  const range = normalizeSelection(content, selection)
  const selected = content.slice(range.from, range.to)
  const label = selected || 'link text'
  const url = selected && /^https?:\/\//i.test(selected) ? selected : 'https://'
  const insert = `[${label}](${url})`
  const urlFrom = range.from + label.length + 3
  const urlTo = urlFrom + url.length
  return {
    content: replaceRange(content, range.from, range.to, insert),
    selection: { from: selected ? urlFrom : range.from + 1, to: selected ? urlTo : range.from + 1 + label.length },
  }
}

function insertImage(content: string, selection: EditorSelection): MarkdownCommandResult {
  const range = normalizeSelection(content, selection)
  const selected = content.slice(range.from, range.to)
  const alt = selected || 'image'
  const insert = `![${alt}](image-url)`
  const urlFrom = range.from + alt.length + 4
  return {
    content: replaceRange(content, range.from, range.to, insert),
    selection: { from: urlFrom, to: urlFrom + 'image-url'.length },
  }
}

function lineRange(content: string, selection: EditorSelection): { from: number; to: number; text: string } {
  const range = normalizeSelection(content, selection)
  const from = content.lastIndexOf('\n', Math.max(0, range.from - 1)) + 1
  let to = range.to
  if (to > from && content[to - 1] === '\n') to -= 1
  const nextBreak = content.indexOf('\n', to)
  const end = nextBreak === -1 ? content.length : nextBreak
  return { from, to: end, text: content.slice(from, end) }
}

function prefixSelectedLines(
  content: string,
  selection: EditorSelection,
  transform: (line: string, index: number) => string,
): MarkdownCommandResult {
  const range = lineRange(content, selection)
  const lines = range.text.split('\n')
  const nextText = lines.map(transform).join('\n')
  const nextContent = replaceRange(content, range.from, range.to, nextText)
  const delta = nextText.length - range.text.length
  return {
    content: nextContent,
    selection: {
      from: Math.min(selection.from + Math.max(0, delta), nextContent.length),
      to: Math.min(selection.to + delta, nextContent.length),
    },
  }
}

function stripLinePrefix(line: string): string {
  return line.replace(HEADING_PREFIX_RE, '').replace(LIST_PREFIX_RE, '$1')
}

function headingLine(line: string, level: number): string {
  const body = line.replace(HEADING_PREFIX_RE, '').trimStart()
  return `${'#'.repeat(level)} ${body || 'Heading'}`
}

function bulletLine(line: string): string {
  const leading = line.match(/^\s*/)?.[0] || ''
  return `${leading}- ${stripLinePrefix(line).trimStart() || 'List item'}`
}

function orderedLine(line: string, index: number): string {
  const leading = line.match(/^\s*/)?.[0] || ''
  return `${leading}${index + 1}. ${stripLinePrefix(line).trimStart() || 'List item'}`
}

function taskLine(line: string): string {
  if (TASK_PREFIX_RE.test(line)) {
    return line.replace(TASK_PREFIX_RE, '$1$2')
  }
  const leading = line.match(/^\s*/)?.[0] || ''
  return `${leading}- [ ] ${stripLinePrefix(line).trimStart() || 'Task'}`
}

function quoteLine(line: string): string {
  if (BLOCKQUOTE_PREFIX_RE.test(line)) return line.replace(BLOCKQUOTE_PREFIX_RE, '$1')
  const leading = line.match(/^\s*/)?.[0] || ''
  return `${leading}> ${line.slice(leading.length) || 'Quote'}`
}

function insertCodeBlock(content: string, selection: EditorSelection): MarkdownCommandResult {
  const range = normalizeSelection(content, selection)
  const selected = content.slice(range.from, range.to)
  const body = selected || 'code'
  const insert = `\`\`\`\n${body}\n\`\`\``
  const bodyFrom = range.from + 4
  return {
    content: replaceRange(content, range.from, range.to, insert),
    selection: { from: bodyFrom, to: bodyFrom + body.length },
  }
}

function insertBlock(content: string, selection: EditorSelection, block: string): MarkdownCommandResult {
  const range = normalizeSelection(content, selection)
  const before = content.slice(0, range.from)
  const after = content.slice(range.to)
  const prefix = before.length && !before.endsWith('\n') ? '\n\n' : before.endsWith('\n\n') || !before.length ? '' : '\n'
  const suffix = after.length && !after.startsWith('\n') ? '\n\n' : '\n'
  const insert = `${prefix}${block}${suffix}`
  const from = range.from + prefix.length
  return {
    content: `${before}${insert}${after}`,
    selection: { from, to: from + block.length },
  }
}
