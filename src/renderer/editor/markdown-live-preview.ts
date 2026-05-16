import { syntaxTree } from '@codemirror/language'
import { EditorSelection, Prec, type Extension, type Range } from '@codemirror/state'
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate, WidgetType } from '@codemirror/view'
import { findEmojiShortcodes } from './markdown-emoji'

export type MarkdownLivePreviewLineKind =
  | 'heading'
  | 'task'
  | 'unordered-list'
  | 'ordered-list'
  | 'blockquote'
  | 'fence'
  | 'code'
  | 'table'
  | 'image'
  | 'horizontal-rule'
  | 'plain'

export interface MarkdownLivePreviewLineInfo {
  kind: MarkdownLivePreviewLineKind
  headingLevel?: number
  checked?: boolean
  markerLength?: number
}

interface LinkParts {
  labelFrom: number
  labelTo: number
  urlFrom?: number
  urlTo?: number
  url?: string
}

interface CodeBlockContentRange {
  from: number
  to: number
}

interface FencedCodeBlockRange extends CodeBlockContentRange {
  blockFrom: number
  blockTo: number
  openingLineNumber: number
  closingLineNumber: number
}

const FENCE_RE = /^\s*(```|~~~)/
const HEADING_RE = /^(\s{0,3})(#{1,6})([ \t]+)(.*)$/
const TASK_RE = /^(\s*)([-*+])([ \t]+)\[([ xX])](\s+)(.*)$/
const INCOMPLETE_TASK_RE = /^\s*[-*+][ \t]+\[[ xX]?\]?\s*$/
const UNORDERED_LIST_RE = /^(\s*)([-*+])([ \t]+)(.*)$/
const ORDERED_LIST_RE = /^(\s*)(\d+\.)([ \t]+)(.*)$/
const BLOCKQUOTE_RE = /^(\s*>+[ \t]+)(.*)$/
const TABLE_SEPARATOR_RE = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/
const TABLE_ROW_RE = /^\s*\|.+\|\s*$/
const MATH_RE = /(?<!\\)(\${1,2})([^$\n]+?)\1/g
const STRIKETHROUGH_RE = /~~([^~\n]+?)~~/g
const UNDERLINE_RE = /<u>([^<\n]+?)<\/u>/gi
const INLINE_CODE_RE = /`([^`\n]+?)`/g
const STRONG_RE = /(\*\*|__)([^*_`\n]+?)\1/g
const ITALIC_RE = /(?<![*_])([*_])([^*_`\n]+?)\1(?![*_])/g
const LINK_OR_IMAGE_RE = /!?\[([^\]\n]+)]\([^)]+\)/g
const CODE_COMMENT_RE = /(\/\/.*$|#.*$)/g
const CODE_STRING_RE = /(["'`])(?:\\.|(?!\1).)*\1/g
const CODE_NUMBER_RE = /\b(?:0x[\da-f]+|\d+(?:\.\d+)?)\b/gi
const CODE_KEYWORD_RE = /\b(?:abstract|async|await|break|case|catch|class|const|continue|def|default|do|else|enum|export|extends|final|finally|for|from|func|function|go|if|implements|import|in|interface|let|new|null|package|private|protected|public|return|static|struct|switch|this|throw|try|type|var|void|while|yield)\b/g
const CODE_TYPE_RE = /\b(?:Array|Boolean|Double|Float|Int|Integer|List|Long|Map|Number|Promise|Record|Set|String|boolean|char|double|float|int|long|short|string|true|false|undefined)\b/g

export function analyzeMarkdownLivePreviewLine(text: string, inFence: boolean): MarkdownLivePreviewLineInfo {
  if (FENCE_RE.test(text)) return { kind: 'fence' }
  if (inFence) return { kind: 'code' }

  const heading = text.match(HEADING_RE)
  if (heading) {
    return {
      kind: 'heading',
      headingLevel: heading[2].length,
      markerLength: heading[1].length + heading[2].length + heading[3].length,
    }
  }

  const task = text.match(TASK_RE)
  if (task) {
    return {
      kind: 'task',
      checked: task[4].toLowerCase() === 'x',
      markerLength: task[1].length + task[2].length + task[3].length + 3 + task[5].length,
    }
  }

  if (INCOMPLETE_TASK_RE.test(text)) return { kind: 'plain' }

  const unordered = text.match(UNORDERED_LIST_RE)
  if (unordered) return { kind: 'unordered-list', markerLength: unordered[1].length + unordered[2].length + unordered[3].length }

  const ordered = text.match(ORDERED_LIST_RE)
  if (ordered) return { kind: 'ordered-list', markerLength: ordered[1].length + ordered[2].length + ordered[3].length }

  const blockquote = text.match(BLOCKQUOTE_RE)
  if (blockquote) return { kind: 'blockquote', markerLength: blockquote[1].length }
  if (TABLE_SEPARATOR_RE.test(text) || (TABLE_ROW_RE.test(text) && parseTableCells(text).length > 0)) return { kind: 'table' }
  if (/^\s*!\[[^\]\n]*]\([^)]+\)\s*$/.test(text)) return { kind: 'image' }
  if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(text)) return { kind: 'horizontal-rule' }

  return { kind: 'plain' }
}

export function isLineActive(view: EditorView, lineFrom: number, lineTo: number): boolean {
  // Keep live preview stable: hover must not reveal Markdown delimiters or resize headings.
  // The helper remains useful for selection-sensitive commands, but decorations stay stable.
  return view.state.selection.ranges.some((range) => {
    const from = Math.min(range.from, range.to)
    const to = Math.max(range.from, range.to)
    if (from === to) return from >= lineFrom && from <= lineTo
    return from <= lineTo && to >= lineFrom
  })
}

class MarkdownTaskWidget extends WidgetType {
  constructor(
    private readonly checked: boolean,
    private readonly checkFrom: number,
  ) {
    super()
  }

  eq(widget: MarkdownTaskWidget): boolean {
    return widget.checked === this.checked && widget.checkFrom === this.checkFrom
  }

  toDOM(view: EditorView): HTMLElement {
    const slot = document.createElement('span')
    slot.className = 'md-live-task-checkbox-slot'

    const button = document.createElement('button')
    button.type = 'button'
    button.className = this.checked ? 'md-live-task-checkbox checked' : 'md-live-task-checkbox'
    button.setAttribute('aria-label', this.checked ? 'Mark task incomplete' : 'Mark task complete')
    button.setAttribute('aria-checked', String(this.checked))
    button.addEventListener('mousedown', (event) => {
      event.preventDefault()
    })
    button.addEventListener('click', (event) => {
      event.preventDefault()
      view.dispatch({
        changes: {
          from: this.checkFrom,
          to: this.checkFrom + 1,
          insert: this.checked ? ' ' : 'x',
        },
      })
      view.focus()
    })
    slot.append(button)
    return slot
  }

  ignoreEvent(event: Event): boolean {
    return event.type !== 'click' && event.type !== 'mousedown'
  }
}

class MarkdownImageWidget extends WidgetType {
  constructor(
    private readonly alt: string,
    private readonly src: string,
  ) {
    super()
  }

  eq(widget: MarkdownImageWidget): boolean {
    return widget.alt === this.alt && widget.src === this.src
  }

  toDOM(view: EditorView): HTMLElement {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'md-live-image-widget'
    button.title = this.src
    button.textContent = this.alt || this.src
    button.addEventListener('mousedown', event => event.preventDefault())
    button.addEventListener('click', (event) => {
      event.preventDefault()
      view.dom.dispatchEvent(new CustomEvent('markdown-open-image', {
        bubbles: true,
        detail: { alt: this.alt, src: this.src },
      }))
    })
    return button
  }

  ignoreEvent(event: Event): boolean {
    return event.type !== 'click' && event.type !== 'mousedown'
  }
}

class MarkdownListMarkerWidget extends WidgetType {
  constructor(private readonly label: string) {
    super()
  }

  eq(widget: MarkdownListMarkerWidget): boolean {
    return widget.label === this.label
  }

  toDOM(): HTMLElement {
    const marker = document.createElement('span')
    marker.className = 'md-live-list-marker-widget'
    marker.textContent = this.label
    return marker
  }
}

class EmptyMarkdownWidget extends WidgetType {
  toDOM(): HTMLElement {
    const span = document.createElement('span')
    span.className = 'md-live-hidden-source-widget'
    return span
  }
}

class EmptyStructureCaretWidget extends WidgetType {
  toDOM(): HTMLElement {
    const span = document.createElement('span')
    span.className = 'md-live-empty-structure-caret-anchor'
    span.setAttribute('aria-hidden', 'true')
    return span
  }
}

class MarkdownTableRowWidget extends WidgetType {
  constructor(
    private readonly cells: string[],
    private readonly separator: boolean,
  ) {
    super()
  }

  eq(widget: MarkdownTableRowWidget): boolean {
    return widget.separator === this.separator && widget.cells.join('\u0000') === this.cells.join('\u0000')
  }

  toDOM(): HTMLElement {
    const row = document.createElement('span')
    row.className = this.separator ? 'md-live-table-row separator' : 'md-live-table-row'
    if (this.separator) return row
    for (const cellText of this.cells) {
      const cell = document.createElement('span')
      cell.className = 'md-live-table-cell'
      cell.textContent = cellText
      row.append(cell)
    }
    return row
  }
}

class HorizontalRuleWidget extends WidgetType {
  toDOM(): HTMLElement {
    const hr = document.createElement('span')
    hr.className = 'md-live-horizontal-rule-widget'
    return hr
  }
}

class MarkdownEmojiWidget extends WidgetType {
  constructor(
    private readonly emoji: string,
    private readonly name: string,
  ) {
    super()
  }

  eq(widget: MarkdownEmojiWidget): boolean {
    return widget.emoji === this.emoji && widget.name === this.name
  }

  toDOM(): HTMLElement {
    const span = document.createElement('span')
    span.className = 'md-live-emoji'
    span.setAttribute('aria-label', `:${this.name}:`)
    span.textContent = this.emoji
    return span
  }
}

class MarkdownLivePreviewPlugin {
  decorations: DecorationSet
  private normalizeScheduled = false

  constructor(view: EditorView) {
    this.decorations = buildMarkdownDecorations(view)
    this.scheduleEmptyCodeBlockNormalization(view)
  }

  update(update: ViewUpdate): void {
    if (
      update.docChanged ||
      update.selectionSet ||
      update.viewportChanged ||
      update.geometryChanged
    ) {
      this.decorations = buildMarkdownDecorations(update.view)
    }
    if (update.docChanged || update.selectionSet) {
      this.scheduleEmptyCodeBlockNormalization(update.view)
    }
  }

  private scheduleEmptyCodeBlockNormalization(view: EditorView): void {
    if (this.normalizeScheduled) return
    const edit = findAdjacentEmptyFencedCodeBlockAtSelection(view)
    if (!edit) return
    this.normalizeScheduled = true
    queueMicrotask(() => {
      this.normalizeScheduled = false
      const nextEdit = findAdjacentEmptyFencedCodeBlockAtSelection(view)
      if (!nextEdit) return
      view.dispatch({
        changes: { from: nextEdit.insertAt, insert: '\n' },
        selection: { anchor: nextEdit.insertAt },
      })
    })
  }
}

function buildMarkdownDecorations(view: EditorView): DecorationSet {
  const ranges: Range<Decoration>[] = []
  addSyntaxTreeDecorations(view, ranges)
  addLineFallbackDecorations(view, ranges)
  return Decoration.set(ranges, true)
}

function addSyntaxTreeDecorations(view: EditorView, ranges: Range<Decoration>[]): void {
  const doc = view.state.doc
  const cursor = syntaxTree(view.state).cursor()

  do {
    const { name, from, to } = cursor
    if (from >= to) continue

    if (/^ATXHeading[1-6]$/.test(name)) {
      const level = Number(name.slice(-1))
      const line = doc.lineAt(from)
      if (!isRenderableHeadingLine(line.text)) continue
      ranges.push(Decoration.line({ class: `md-live-line md-live-heading md-live-heading-${level}` }).range(line.from))
      continue
    }

    if (name === 'HeaderMark') {
      const line = doc.lineAt(from)
      if (!isRenderableHeadingLine(line.text)) continue
      const whitespaceTo = Math.min(line.to, to + trailingWhitespaceLength(line.text.slice(to - line.from)))
      ranges.push(Decoration.replace({
        widget: whitespaceTo >= line.to ? new EmptyStructureCaretWidget() : undefined,
        inclusive: false,
      }).range(from, whitespaceTo))
      continue
    }

    if (name === 'ListMark') {
      const line = doc.lineAt(from)
      if (!isRenderableListLine(line.text)) continue
      if (!isTaskLine(line.text)) {
        const ordered = /^\d+\.$/.test(doc.sliceString(from, to))
        const markerTo = Math.min(line.to, to + trailingWhitespaceLength(line.text.slice(to - line.from)))
        const label = ordered ? doc.sliceString(from, to) : '•'
        ranges.push(Decoration.line({ class: `md-live-line md-live-${ordered ? 'ordered-list' : 'unordered-list'}` }).range(line.from))
        ranges.push(Decoration.replace({
          widget: new MarkdownListMarkerWidget(label),
          inclusive: false,
        }).range(from, markerTo))
      }
      continue
    }

    if (name === 'QuoteMark') {
      const line = doc.lineAt(from)
      if (!isRenderableBlockquoteLine(line.text)) continue
      const markerTo = Math.min(line.to, to + trailingWhitespaceLength(line.text.slice(to - line.from)))
      ranges.push(Decoration.line({ class: 'md-live-line md-live-blockquote' }).range(line.from))
      ranges.push(Decoration.replace({
        widget: markerTo >= line.to ? new EmptyStructureCaretWidget() : undefined,
        inclusive: false,
      }).range(from, markerTo))
      continue
    }

    if (name === 'FencedCode') {
      addFencedCodeDecorations(view, ranges, from, to)
      continue
    }

    if (name === 'StrongEmphasis' || name === 'Emphasis') {
      addEmphasisDecoration(view, ranges, from, to, name === 'StrongEmphasis' ? 'md-live-bold' : 'md-live-italic')
      continue
    }

    if (name === 'InlineCode') {
      addInlineCodeDecoration(view, ranges, from, to)
      continue
    }

    if (name === 'Link') {
      addLinkDecoration(view, ranges, from, to)
      continue
    }

    if (name === 'Image') {
      addImageDecoration(view, ranges, from, to)
      continue
    }

    if (name === 'HorizontalRule') {
      const line = doc.lineAt(from)
      ranges.push(Decoration.line({ class: 'md-live-line md-live-horizontal-rule' }).range(line.from))
      ranges.push(Decoration.replace({
        widget: new HorizontalRuleWidget(),
        inclusive: false,
      }).range(from, to))
    }
  } while (cursor.next())
}

function addLineFallbackDecorations(view: EditorView, ranges: Range<Decoration>[]): void {
  let inFence = false

  for (let lineNumber = 1; lineNumber <= view.state.doc.lines; lineNumber += 1) {
    const line = view.state.doc.line(lineNumber)
    const lineInFence = inFence
    const isFence = FENCE_RE.test(line.text)
    const info = analyzeMarkdownLivePreviewLine(line.text, lineInFence)

    addTaskDecoration(ranges, line.from, line.to, line.text, info)
    addTableDecoration(ranges, line.from, line.to, line.text, info)
    if (info.kind !== 'table' && info.kind !== 'code' && info.kind !== 'fence') {
      addMathDecorations(ranges, line.from, line.text)
      addInlineFallbackDecorations(ranges, line.from, line.text)
      addEmojiDecorations(ranges, line.from, line.text)
    }

    if (isFence) inFence = !inFence
  }
}

function addTaskDecoration(
  ranges: Range<Decoration>[],
  lineFrom: number,
  lineTo: number,
  text: string,
  info: MarkdownLivePreviewLineInfo,
): void {
  if (info.kind !== 'task' || !info.markerLength) return
  const task = text.match(TASK_RE)
  if (!task) return
  const markerFrom = lineFrom + task[1].length
  const markerTo = Math.min(lineTo, lineFrom + info.markerLength)
  const checkboxIndex = text.indexOf(`[${task[4]}]`, task[1].length)
  if (checkboxIndex < 0) return
  const checkFrom = lineFrom + checkboxIndex + 1
  ranges.push(Decoration.line({ class: `md-live-line md-live-task${info.checked ? ' md-live-task-done' : ''}` }).range(lineFrom))
  ranges.push(Decoration.replace({
    widget: new MarkdownTaskWidget(Boolean(info.checked), checkFrom),
    inclusive: false,
  }).range(markerFrom, markerTo))
}

function addTableDecoration(
  ranges: Range<Decoration>[],
  lineFrom: number,
  lineTo: number,
  text: string,
  info: MarkdownLivePreviewLineInfo,
): void {
  if (info.kind !== 'table') return
  ranges.push(Decoration.line({ class: 'md-live-line md-live-table' }).range(lineFrom))
  ranges.push(Decoration.replace({
    widget: new MarkdownTableRowWidget(parseTableCells(text), TABLE_SEPARATOR_RE.test(text)),
    inclusive: false,
  }).range(lineFrom, lineTo))
}

function addFencedCodeDecorations(
  view: EditorView,
  ranges: Range<Decoration>[],
  from: number,
  to: number,
): void {
  const doc = view.state.doc
  const startLine = doc.lineAt(from)
  const endLine = doc.lineAt(Math.max(from, to - 1))
  if (endLine.number <= startLine.number || !FENCE_RE.test(endLine.text)) return
  if (endLine.number === startLine.number + 1) return

  for (let lineNumber = startLine.number; lineNumber <= endLine.number; lineNumber += 1) {
    const line = doc.line(lineNumber)
    const isFence = lineNumber === startLine.number || lineNumber === endLine.number
    const firstCodeLine = lineNumber === startLine.number + 1
    const lastCodeLine = lineNumber === endLine.number - 1
    ranges.push(Decoration.line({
      class: isFence
        ? 'md-live-line md-live-fence md-live-codeblock-fence-hidden'
        : [
            'md-live-line md-live-code',
            firstCodeLine ? 'md-live-codeblock-first' : '',
            lastCodeLine ? 'md-live-codeblock-last' : '',
          ].filter(Boolean).join(' '),
    }).range(line.from))
    if (isFence) {
      ranges.push(Decoration.replace({
        widget: new EmptyMarkdownWidget(),
        inclusive: false,
      }).range(line.from, line.to))
    } else {
      addCodeSyntaxDecorations(ranges, line.from, line.text)
    }
  }
}

function addEmphasisDecoration(
  view: EditorView,
  ranges: Range<Decoration>[],
  from: number,
  to: number,
  className: string,
): void {
  const text = view.state.doc.sliceString(from, to)
  const delimiterLength = text.startsWith('**') || text.startsWith('__') || text.startsWith('~~') ? 2 : 1
  const contentFrom = from + delimiterLength
  const contentTo = to - delimiterLength
  if (contentFrom >= contentTo) return
  ranges.push(Decoration.replace({ inclusive: false }).range(from, contentFrom))
  ranges.push(Decoration.mark({ class: className }).range(contentFrom, contentTo))
  ranges.push(Decoration.replace({ inclusive: false }).range(contentTo, to))
}

function addInlineCodeDecoration(
  view: EditorView,
  ranges: Range<Decoration>[],
  from: number,
  to: number,
): void {
  const text = view.state.doc.sliceString(from, to)
  const delimiterLength = inlineCodeDelimiterLength(text)
  if (!delimiterLength) return
  const contentFrom = from + delimiterLength
  const contentTo = to - delimiterLength
  if (contentFrom >= contentTo) return
  ranges.push(Decoration.replace({ inclusive: false }).range(from, contentFrom))
  ranges.push(Decoration.mark({ class: 'md-live-inline-code' }).range(contentFrom, contentTo))
  ranges.push(Decoration.replace({ inclusive: false }).range(contentTo, to))
}

function addLinkDecoration(
  view: EditorView,
  ranges: Range<Decoration>[],
  from: number,
  to: number,
): void {
  const parts = parseLinkParts(view.state.doc.sliceString(from, to), from)
  if (!parts || parts.labelFrom >= parts.labelTo) return
  ranges.push(Decoration.replace({ inclusive: false }).range(from, parts.labelFrom))
  ranges.push(Decoration.mark({
    class: 'md-live-link',
    attributes: parts.url ? { 'data-href': parts.url } : undefined,
  }).range(parts.labelFrom, parts.labelTo))
  ranges.push(Decoration.replace({ inclusive: false }).range(parts.labelTo, to))
}

function addImageDecoration(
  view: EditorView,
  ranges: Range<Decoration>[],
  from: number,
  to: number,
): void {
  const parts = parseLinkParts(view.state.doc.sliceString(from, to), from, true)
  if (!parts?.url) return
  const alt = view.state.doc.sliceString(parts.labelFrom, parts.labelTo)
  ranges.push(Decoration.replace({
    widget: new MarkdownImageWidget(alt, parts.url),
    inclusive: false,
  }).range(from, to))
}

function addMathDecorations(ranges: Range<Decoration>[], lineFrom: number, text: string): void {
  for (const match of text.matchAll(MATH_RE)) {
    const index = match.index ?? 0
    const delimiter = match[1]
    const content = match[2]
    if (!delimiter || !content) continue
    const from = lineFrom + index
    const contentFrom = from + delimiter.length
    const contentTo = contentFrom + content.length
    ranges.push(Decoration.replace({ inclusive: false }).range(from, contentFrom))
    ranges.push(Decoration.mark({ class: 'md-live-math' }).range(contentFrom, contentTo))
    ranges.push(Decoration.replace({ inclusive: false }).range(contentTo, contentTo + delimiter.length))
  }
}

function addInlineFallbackDecorations(
  ranges: Range<Decoration>[],
  lineFrom: number,
  text: string,
): void {
  addDelimitedInlineDecorations(ranges, lineFrom, text, STRIKETHROUGH_RE, 2, 2, 'md-live-strikethrough')
  addDelimitedInlineDecorations(ranges, lineFrom, text, UNDERLINE_RE, 3, 4, 'md-live-underline')
}

function addEmojiDecorations(
  ranges: Range<Decoration>[],
  lineFrom: number,
  text: string,
): void {
  for (const match of findEmojiShortcodes(text)) {
    ranges.push(Decoration.replace({
      widget: new MarkdownEmojiWidget(match.emoji, match.name),
      inclusive: false,
    }).range(lineFrom + match.from, lineFrom + match.to))
  }
}

function addDelimitedInlineDecorations(
  ranges: Range<Decoration>[],
  lineFrom: number,
  text: string,
  pattern: RegExp,
  prefixLength: number,
  suffixLength: number,
  className: string,
): void {
  pattern.lastIndex = 0
  for (const match of text.matchAll(pattern)) {
    if (match.index === undefined || !match[1]) continue
    const from = lineFrom + match.index
    const contentFrom = from + prefixLength
    const contentTo = from + match[0].length - suffixLength
    if (contentFrom >= contentTo) continue
    ranges.push(Decoration.replace({ inclusive: false }).range(from, contentFrom))
    ranges.push(Decoration.mark({ class: className }).range(contentFrom, contentTo))
    ranges.push(Decoration.replace({ inclusive: false }).range(contentTo, from + match[0].length))
  }
}

interface CodeTokenRange {
  from: number
  to: number
  className: string
}

function addCodeSyntaxDecorations(
  ranges: Range<Decoration>[],
  lineFrom: number,
  text: string,
): void {
  const tokens: CodeTokenRange[] = []
  collectCodeTokens(tokens, lineFrom, text, CODE_COMMENT_RE, 'md-live-code-comment')
  collectCodeTokens(tokens, lineFrom, text, CODE_STRING_RE, 'md-live-code-string')
  collectCodeTokens(tokens, lineFrom, text, CODE_KEYWORD_RE, 'md-live-code-keyword')
  collectCodeTokens(tokens, lineFrom, text, CODE_TYPE_RE, 'md-live-code-type')
  collectCodeTokens(tokens, lineFrom, text, CODE_NUMBER_RE, 'md-live-code-number')

  const accepted: CodeTokenRange[] = []
  for (const token of tokens.sort((a, b) => a.from - b.from || (b.to - b.from) - (a.to - a.from))) {
    if (accepted.some(existing => token.from < existing.to && token.to > existing.from)) continue
    accepted.push(token)
    ranges.push(Decoration.mark({ class: token.className }).range(token.from, token.to))
  }
}

function collectCodeTokens(
  tokens: CodeTokenRange[],
  lineFrom: number,
  text: string,
  pattern: RegExp,
  className: string,
): void {
  pattern.lastIndex = 0
  for (const match of text.matchAll(pattern)) {
    if (match.index === undefined || !match[0]) continue
    tokens.push({
      from: lineFrom + match.index,
      to: lineFrom + match.index + match[0].length,
      className,
    })
  }
}

function parseTableCells(text: string): string[] {
  const trimmed = text.trim().replace(/^\|/, '').replace(/\|$/, '')
  return trimmed.split('|').map(cell => cell.trim()).filter(Boolean)
}

function inlineCodeDelimiterLength(text: string): number {
  const opening = text.match(/^`+/)?.[0]
  if (!opening || !text.endsWith(opening)) return 0
  return opening.length
}

function parseLinkParts(source: string, offset: number, image = false): LinkParts | null {
  const prefixLength = image ? 2 : 1
  if (!source.startsWith(image ? '![' : '[')) return null
  const labelEnd = source.indexOf(']', prefixLength)
  if (labelEnd < prefixLength || source[labelEnd + 1] !== '(') return null
  const urlEnd = source.indexOf(')', labelEnd + 2)
  if (urlEnd < 0) return null
  const urlFrom = offset + labelEnd + 2
  const urlTo = offset + urlEnd
  return {
    labelFrom: offset + prefixLength,
    labelTo: offset + labelEnd,
    urlFrom,
    urlTo,
    url: source.slice(labelEnd + 2, urlEnd),
  }
}

function isTaskLine(text: string): boolean {
  return TASK_RE.test(text)
}

function isRenderableHeadingLine(text: string): boolean {
  return HEADING_RE.test(text)
}

function isRenderableListLine(text: string): boolean {
  if (TASK_RE.test(text)) return true
  if (INCOMPLETE_TASK_RE.test(text)) return false
  return UNORDERED_LIST_RE.test(text) || ORDERED_LIST_RE.test(text)
}

function isRenderableBlockquoteLine(text: string): boolean {
  return BLOCKQUOTE_RE.test(text)
}

function trailingWhitespaceLength(text: string): number {
  return text.match(/^\s*/)?.[0].length || 0
}

const plugin = ViewPlugin.fromClass(MarkdownLivePreviewPlugin, {
  decorations: value => value.decorations,
})

const linkHandler = EditorView.domEventHandlers({
  click: (event, view) => {
    const target = event.target as Element | null
    const link = target?.closest?.('.md-live-link[data-href]') as HTMLElement | null
    const href = link?.dataset.href
    if (!href || (!event.metaKey && !event.ctrlKey)) return false
    event.preventDefault()
    view.dom.dispatchEvent(new CustomEvent('markdown-open-link', {
      bubbles: true,
      detail: { href },
    }))
    return true
  },
})

const codeBlockSelectAllHandler = Prec.highest(EditorView.domEventHandlers({
  keydown: (event, view) => {
    if (!isSelectAllShortcut(event) || view.state.selection.ranges.length !== 1) return false
    const range = findCurrentFencedCodeBlockContentRange(view)
    if (!range || range.from === range.to) return false
    const selection = view.state.selection.main
    if (selection.from === range.from && selection.to === range.to) return false

    event.preventDefault()
    event.stopPropagation()
    view.dispatch({
      selection: EditorSelection.create([EditorSelection.range(range.from, range.to)]),
      scrollIntoView: true,
    })
    return true
  },
}))

const hiddenSyntaxDeleteHandler = EditorView.domEventHandlers({
  keydown: (event, view) => {
    if ((event.key !== 'Backspace' && event.key !== 'Delete') || view.state.selection.main.empty === false) {
      return false
    }

    const removed = deleteHiddenLineMarker(view, event.key) ||
      deleteEmptyFencedCodeBlock(view) ||
      unwrapHiddenFenceSyntax(view, event.key) ||
      deleteHiddenEmojiSyntax(view, event.key) ||
      unwrapHiddenInlineSyntax(view, event.key)
    if (!removed) return false
    event.preventDefault()
    event.stopPropagation()
    return true
  },
})

function isSelectAllShortcut(event: KeyboardEvent): boolean {
  if (event.key.toLowerCase() !== 'a' || event.altKey || event.shiftKey) return false
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform)
  return isMac ? event.metaKey : event.metaKey || event.ctrlKey
}

function findCurrentFencedCodeBlockContentRange(view: EditorView): CodeBlockContentRange | null {
  const position = view.state.selection.main.head
  const doc = view.state.doc
  const block = findFencedCodeBlockAtPosition(doc, position)
  if (block) return { from: block.from, to: block.to }

  return null
}

function findFencedCodeBlockAtPosition(
  doc: EditorView['state']['doc'],
  position: number,
): FencedCodeBlockRange | null {
  let openingLine: ReturnType<typeof doc.line> | null = null

  for (let lineNumber = 1; lineNumber <= doc.lines; lineNumber += 1) {
    const line = doc.line(lineNumber)
    if (!FENCE_RE.test(line.text)) continue

    if (!openingLine) {
      openingLine = line
      continue
    }

    const closingLine = line
    const blockFrom = openingLine.from
    const blockTo = closingLine.to
    if (position >= blockFrom && position <= blockTo) {
      return {
        ...fencedCodeContentRange(doc, openingLine.number, closingLine.number),
        blockFrom,
        blockTo,
        openingLineNumber: openingLine.number,
        closingLineNumber: closingLine.number,
      }
    }

    openingLine = null
  }

  return null
}

function fencedCodeContentRange(
  doc: EditorView['state']['doc'],
  openingLineNumber: number,
  closingLineNumber: number,
): CodeBlockContentRange {
  if (closingLineNumber <= openingLineNumber + 1) {
    const openingLine = doc.line(openingLineNumber)
    return {
      from: Math.min(doc.length, openingLine.to + 1),
      to: Math.min(doc.length, openingLine.to + 1),
    }
  }

  const firstContentLine = doc.line(openingLineNumber + 1)
  const lastContentLine = doc.line(closingLineNumber - 1)
  return {
    from: firstContentLine.from,
    to: lastContentLine.to,
  }
}

function findAdjacentEmptyFencedCodeBlockAtSelection(view: EditorView): { insertAt: number } | null {
  if (view.state.selection.ranges.length !== 1 || !view.state.selection.main.empty) return null
  const position = view.state.selection.main.head
  const doc = view.state.doc

  for (let lineNumber = 1; lineNumber < doc.lines; lineNumber += 1) {
    const openingLine = doc.line(lineNumber)
    if (!isNormalizableOpeningFenceLine(openingLine.text)) continue
    const closingLine = doc.line(lineNumber + 1)
    if (!isClosingFenceLine(closingLine.text)) continue
    if (position !== closingLine.from) continue
    return { insertAt: closingLine.from }
  }

  return null
}

function isNormalizableOpeningFenceLine(text: string): boolean {
  const match = text.match(/^\s*(```|~~~)(.*)$/)
  if (!match) return false
  const info = (match[2] || '').trim()
  return !info || /^[\w.+#-]+$/.test(info)
}

function isClosingFenceLine(text: string): boolean {
  return /^\s*(```|~~~)\s*$/.test(text)
}

function deleteEmptyFencedCodeBlock(view: EditorView): boolean {
  const position = view.state.selection.main.head
  const doc = view.state.doc
  const block = findFencedCodeBlockAtPosition(doc, position)
  if (!block) return false
  if (position < block.from || position > block.to) return false
  if (doc.sliceString(block.from, block.to).trim().length > 0) return false

  const range = expandFencedCodeBlockDeletionRange(doc, block.blockFrom, block.blockTo)
  view.dispatch({
    changes: { from: range.from, to: range.to },
    selection: { anchor: range.from },
  })
  return true
}

function expandFencedCodeBlockDeletionRange(
  doc: EditorView['state']['doc'],
  blockFrom: number,
  blockTo: number,
): { from: number, to: number } {
  let from = blockFrom
  let to = blockTo
  if (to < doc.length && doc.sliceString(to, to + 1) === '\n') {
    to += 1
  } else if (from > 0 && doc.sliceString(from - 1, from) === '\n') {
    from -= 1
  }
  return { from, to }
}

function deleteHiddenLineMarker(view: EditorView, key: 'Backspace' | 'Delete'): boolean {
  const position = view.state.selection.main.head
  const doc = view.state.doc
  const line = doc.lineAt(position)
  if (isLineInFencedCodeContent(doc, line.number)) return false
  const info = analyzeMarkdownLivePreviewLine(line.text, false)
  const markerLength = info.markerLength || 0
  if (!markerLength) return false

  const markerFrom = line.from
  const markerTo = Math.min(line.to, line.from + markerLength)
  const shouldDelete = key === 'Backspace'
    ? position === markerTo
    : position === markerFrom
  if (!shouldDelete) return false

  view.dispatch({
    changes: { from: markerFrom, to: markerTo },
  })
  return true
}

function isLineInFencedCodeContent(doc: EditorView['state']['doc'], lineNumber: number): boolean {
  let openingLineNumber = 0
  for (let number = 1; number <= doc.lines; number += 1) {
    const line = doc.line(number)
    if (!FENCE_RE.test(line.text)) continue
    if (!openingLineNumber) {
      openingLineNumber = number
      continue
    }
    if (lineNumber > openingLineNumber && lineNumber < number) return true
    openingLineNumber = 0
  }
  return false
}

function unwrapHiddenFenceSyntax(view: EditorView, key: 'Backspace' | 'Delete'): boolean {
  const position = view.state.selection.main.head
  const doc = view.state.doc
  const line = doc.lineAt(position)

  const openingFence = key === 'Backspace' && position === line.from && line.number > 1
    ? doc.line(line.number - 1)
    : key === 'Delete'
      ? findOpeningFenceBefore(doc, line.number)
      : null
  const closingFence = key === 'Delete' && position === line.to && line.number < doc.lines
    ? doc.line(line.number + 1)
    : key === 'Backspace'
      ? findClosingFenceAfter(doc, line.number)
      : null

  if (!openingFence || !closingFence || !FENCE_RE.test(openingFence.text) || !FENCE_RE.test(closingFence.text)) {
    return false
  }

  view.dispatch({
    changes: [
      { from: openingFence.from, to: Math.min(doc.length, openingFence.to + 1) },
      { from: Math.max(0, closingFence.from - 1), to: closingFence.to },
    ],
  })
  return true
}

function findOpeningFenceBefore(doc: EditorView['state']['doc'], lineNumber: number) {
  for (let number = lineNumber - 1; number >= 1; number -= 1) {
    const line = doc.line(number)
    if (FENCE_RE.test(line.text)) return line
  }
  return null
}

function findClosingFenceAfter(doc: EditorView['state']['doc'], lineNumber: number) {
  for (let number = lineNumber + 1; number <= doc.lines; number += 1) {
    const line = doc.line(number)
    if (FENCE_RE.test(line.text)) return line
  }
  return null
}

interface InlineWrapperRange {
  from: number
  to: number
  contentFrom: number
  contentTo: number
}

function unwrapHiddenInlineSyntax(view: EditorView, key: 'Backspace' | 'Delete'): boolean {
  const position = view.state.selection.main.head
  const line = view.state.doc.lineAt(position)
  const wrapper = inlineWrapperRanges(line.text, line.from).find((range) => {
    return key === 'Backspace'
      ? position === range.contentFrom
      : position === range.contentTo
  })
  if (!wrapper) return false

  view.dispatch({
    changes: [
      { from: wrapper.from, to: wrapper.contentFrom },
      { from: wrapper.contentTo, to: wrapper.to },
    ],
  })
  return true
}

function deleteHiddenEmojiSyntax(view: EditorView, key: 'Backspace' | 'Delete'): boolean {
  const position = view.state.selection.main.head
  const line = view.state.doc.lineAt(position)
  const emoji = findEmojiShortcodes(line.text).find((match) => {
    const from = line.from + match.from
    const to = line.from + match.to
    return key === 'Backspace' ? position === to : position === from
  })
  if (!emoji) return false

  view.dispatch({
    changes: {
      from: line.from + emoji.from,
      to: line.from + emoji.to,
    },
  })
  return true
}

function inlineWrapperRanges(text: string, lineFrom: number): InlineWrapperRange[] {
  return [
    ...delimitedRanges(text, lineFrom, STRONG_RE, 2, 2, 2),
    ...delimitedRanges(text, lineFrom, ITALIC_RE, 1, 1, 2),
    ...delimitedRanges(text, lineFrom, INLINE_CODE_RE, 1, 1),
    ...delimitedRanges(text, lineFrom, STRIKETHROUGH_RE, 2, 2),
    ...delimitedRanges(text, lineFrom, UNDERLINE_RE, 3, 4),
    ...mathRanges(text, lineFrom),
    ...linkRanges(text, lineFrom),
  ].sort((a, b) => a.from - b.from || b.to - a.to)
}

function delimitedRanges(
  text: string,
  lineFrom: number,
  pattern: RegExp,
  prefixLength: number,
  suffixLength: number,
  contentGroup = 1,
): InlineWrapperRange[] {
  pattern.lastIndex = 0
  const ranges: InlineWrapperRange[] = []
  for (const match of text.matchAll(pattern)) {
    if (match.index === undefined || !match[contentGroup]) continue
    const from = lineFrom + match.index
    const contentFrom = from + prefixLength
    const contentTo = from + match[0].length - suffixLength
    if (contentFrom >= contentTo) continue
    ranges.push({ from, to: from + match[0].length, contentFrom, contentTo })
  }
  return ranges
}

function linkRanges(text: string, lineFrom: number): InlineWrapperRange[] {
  LINK_OR_IMAGE_RE.lastIndex = 0
  const ranges: InlineWrapperRange[] = []
  for (const match of text.matchAll(LINK_OR_IMAGE_RE)) {
    if (match.index === undefined || !match[1]) continue
    const from = lineFrom + match.index
    const prefixLength = match[0].startsWith('![') ? 2 : 1
    const contentFrom = from + prefixLength
    const contentTo = contentFrom + match[1].length
    ranges.push({ from, to: from + match[0].length, contentFrom, contentTo })
  }
  return ranges
}

function mathRanges(text: string, lineFrom: number): InlineWrapperRange[] {
  MATH_RE.lastIndex = 0
  const ranges: InlineWrapperRange[] = []
  for (const match of text.matchAll(MATH_RE)) {
    if (match.index === undefined || !match[1] || !match[2]) continue
    const from = lineFrom + match.index
    const delimiterLength = match[1].length
    const contentFrom = from + delimiterLength
    const contentTo = contentFrom + match[2].length
    ranges.push({ from, to: from + match[0].length, contentFrom, contentTo })
  }
  return ranges
}

const theme = EditorView.theme({
  '.md-live-line': {
    transition: 'background-color 120ms ease',
  },
  '.md-live-heading': {
    fontFamily: 'var(--font-sans)',
    fontWeight: '720',
    lineHeight: '1.25',
    textDecoration: 'none !important',
  },
  '.md-live-heading span': {
    textDecoration: 'none !important',
  },
  '.md-live-heading-1': {
    fontSize: '1.65em',
  },
  '.md-live-heading-2': {
    fontSize: '1.38em',
  },
  '.md-live-heading-3': {
    fontSize: '1.18em',
  },
  '.md-live-heading-4, .md-live-heading-5, .md-live-heading-6': {
    fontSize: '1.05em',
  },
  '.md-live-task': {
    color: 'var(--editor-text, var(--text))',
  },
  '.md-live-task-done': {
    color: 'var(--text-muted, var(--muted))',
    textDecoration: 'line-through',
  },
  '.md-live-task-checkbox-slot': {
    display: 'inline-block',
    position: 'relative',
    width: '28px',
    height: '1em',
    lineHeight: '1',
    verticalAlign: '-0.12em',
  },
  '.md-live-task-checkbox': {
    position: 'absolute',
    left: '0',
    top: '50%',
    transform: 'translateY(-50%)',
    width: '16px',
    height: '16px',
    margin: '0',
    padding: '0',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '1.5px solid var(--border, rgba(128, 128, 128, 0.35))',
    borderRadius: '5px',
    color: 'var(--text-btn-primary, #fff)',
    background: 'transparent',
    cursor: 'pointer',
  },
  '.md-live-task-checkbox.checked': {
    borderColor: 'var(--accent)',
    background: 'var(--accent)',
  },
  '.md-live-task-checkbox.checked::after': {
    content: '"✓"',
    fontSize: '11px',
    fontWeight: '700',
    lineHeight: '1',
  },
  '.md-live-list-marker, .md-live-quote-marker, .md-live-fence-marker': {
    color: 'var(--text-muted, var(--muted))',
  },
  '.md-live-list-marker-widget': {
    minWidth: '1.35em',
    marginRight: '0.35em',
    display: 'inline-flex',
    justifyContent: 'center',
    color: 'var(--text-muted, var(--muted))',
  },
  '.md-live-hidden-source-widget': {
    display: 'inline-block',
    width: '0',
    height: '0',
    overflow: 'hidden',
  },
  '.md-live-empty-structure-caret-anchor': {
    display: 'inline-block',
    width: '0.08em',
    minWidth: '1px',
    height: '1em',
    verticalAlign: '-0.08em',
  },
  '.md-live-blockquote': {
    paddingLeft: '10px !important',
    borderLeft: '3px solid var(--border, rgba(128, 128, 128, 0.28))',
    color: 'var(--text-muted, var(--muted))',
  },
  '.md-live-code': {
    paddingLeft: '26px !important',
    paddingRight: '26px !important',
    backgroundColor: 'color-mix(in srgb, var(--editor-text, var(--text)) 9%, transparent)',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    fontSize: '0.76em',
    lineHeight: '1.55',
  },
  '.md-live-fence': {
    color: 'var(--text-muted, var(--muted))',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  },
  '.md-live-codeblock-first': {
    marginTop: '0.45em',
    paddingTop: '18px !important',
    borderTopLeftRadius: '10px',
    borderTopRightRadius: '10px',
  },
  '.md-live-codeblock-last': {
    marginBottom: '0.45em',
    paddingBottom: '18px !important',
    borderBottomLeftRadius: '10px',
    borderBottomRightRadius: '10px',
  },
  '.md-live-codeblock-fence-hidden': {
    height: '0 !important',
    minHeight: '0 !important',
    paddingTop: '0 !important',
    paddingBottom: '0 !important',
    lineHeight: '0 !important',
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  '.md-live-code-keyword': {
    color: 'var(--accent)',
    fontWeight: '600',
  },
  '.md-live-code-type': {
    color: 'color-mix(in srgb, var(--editor-text, var(--text)) 56%, transparent)',
  },
  '.md-live-code-string': {
    color: 'var(--color-success, #6a8f2a)',
  },
  '.md-live-code-number': {
    color: 'var(--color-warning, #d97706)',
  },
  '.md-live-code-comment': {
    color: 'var(--text-muted, var(--muted))',
    fontStyle: 'italic',
  },
  '.md-live-table': {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    color: 'var(--editor-text, var(--text))',
    backgroundColor: 'color-mix(in srgb, var(--bg-elevated, var(--panel)) 72%, transparent)',
  },
  '.md-live-table-row': {
    display: 'inline-grid',
    gridAutoColumns: 'minmax(6ch, auto)',
    gridAutoFlow: 'column',
    gap: '0',
    maxWidth: '100%',
    verticalAlign: 'middle',
    border: '1px solid var(--border, rgba(128, 128, 128, 0.28))',
    borderRadius: '5px',
    overflow: 'hidden',
  },
  '.md-live-table-row.separator': {
    width: '100%',
    height: '1px',
    display: 'inline-block',
    border: '0',
    borderRadius: '0',
    backgroundColor: 'var(--border, rgba(128, 128, 128, 0.28))',
  },
  '.md-live-table-cell': {
    minWidth: '6ch',
    padding: '2px 8px',
    borderRight: '1px solid var(--border, rgba(128, 128, 128, 0.2))',
  },
  '.md-live-table-cell:last-child': {
    borderRight: '0',
  },
  '.md-live-horizontal-rule': {
    display: 'flex',
    alignItems: 'center',
    minHeight: '24px',
  },
  '.md-live-horizontal-rule-widget': {
    display: 'inline-block',
    width: '100%',
    height: '1px',
    verticalAlign: 'middle',
    backgroundColor: 'var(--border, rgba(128, 128, 128, 0.35))',
  },
  '.md-live-bold': {
    fontWeight: '700',
  },
  '.md-live-italic': {
    fontStyle: 'italic',
  },
  '.md-live-strikethrough': {
    textDecoration: 'line-through',
    textDecorationThickness: '1.5px',
  },
  '.md-live-underline': {
    textDecoration: 'underline',
    textUnderlineOffset: '2px',
  },
  '.md-live-inline-code': {
    padding: '0.1em 0.32em',
    borderRadius: '4px',
    backgroundColor: 'color-mix(in srgb, var(--text-muted, var(--muted)) 15%, transparent)',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    fontSize: '0.92em',
  },
  '.md-live-link': {
    color: 'var(--accent)',
    textDecoration: 'underline',
    textUnderlineOffset: '2px',
  },
  '.md-live-image-widget': {
    display: 'inline-flex',
    alignItems: 'center',
    minHeight: '30px',
    maxWidth: '100%',
    padding: '4px 8px',
    border: '1px solid var(--border, rgba(128, 128, 128, 0.3))',
    borderRadius: '6px',
    color: 'var(--accent)',
    background: 'color-mix(in srgb, var(--bg-elevated, var(--panel)) 78%, transparent)',
    font: 'inherit',
    cursor: 'pointer',
  },
  '.md-live-math': {
    padding: '0.05em 0.28em',
    borderRadius: '4px',
    color: 'var(--accent)',
    backgroundColor: 'color-mix(in srgb, var(--accent) 10%, transparent)',
    fontFamily: 'ui-serif, Georgia, serif',
  },
  '.md-live-emoji': {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: '1em',
    verticalAlign: '-0.08em',
    fontFamily: '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif',
    fontSize: '1.02em',
    lineHeight: '1',
  },
})

export function markdownLivePreviewExtension(enabled: boolean): Extension {
  return enabled ? [codeBlockSelectAllHandler, plugin, linkHandler, hiddenSyntaxDeleteHandler, theme] : []
}
