import { syntaxTree } from '@codemirror/language'
import {
  EditorSelection,
  EditorState,
  Prec,
  RangeSet,
  StateEffect,
  StateField,
  type Extension,
  type Range,
} from '@codemirror/state'
import {
  Decoration,
  type DecorationSet,
  Direction,
  EditorView,
  type LayerMarker,
  layer,
  type Rect,
  RectangleMarker,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from '@codemirror/view'
import type { MarkdownAssetResolution } from '@shared/ipc/markdown'
import { createDomButton, unmountDomButtons } from '@/components/common/dom-button'
import { findEmojiShortcodes } from './markdown-emoji'
import { platformApi } from '@/platform'

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

interface MarkdownTableWidgetRow {
  cells: string[]
  header: boolean
}

interface MarkdownTableBlock {
  rows: MarkdownTableWidgetRow[]
  columnCount: number
  signature: string
  from: number
  to: number
}

interface MarkdownTableLineState {
  role: 'block' | 'hidden'
  block?: MarkdownTableBlock
}

interface MarkdownFrontMatterBlock {
  from: number
  to: number
  openingLineNumber: number
  closingLineNumber: number
  openingFence: string
  closingFence: string
  content: string
  signature: string
}

export interface MarkdownAssetResolverContext {
  kind: 'image' | 'link'
}

export type MarkdownAssetResolver = (
  rawTarget: string,
  context: MarkdownAssetResolverContext,
) => Promise<MarkdownAssetResolution | null | undefined>

export interface MarkdownLivePreviewFeatures {
  tasks?: boolean
  tables?: boolean
  images?: boolean
  math?: boolean
  codeBlocks?: boolean
  frontmatter?: boolean
}

export interface MarkdownLivePreviewOptions {
  features?: MarkdownLivePreviewFeatures
  fullScanLineLimit?: number
  viewportLineMargin?: number
  resolveAsset?: MarkdownAssetResolver
}

interface AssetResolutionCacheEntry {
  createdAt: number
  promise: Promise<MarkdownAssetResolution | null | undefined>
  settled: boolean
  value?: MarkdownAssetResolution | null | undefined
}

const FENCE_RE = /^\s*(```|~~~)/
const FRONT_MATTER_OPEN_RE = /^\s*---\s*$/
const FRONT_MATTER_CLOSE_RE = /^\s*(---|\.\.\.)\s*$/
const HEADING_RE = /^(\s{0,3})(#{1,6})([ \t]+)(.*)$/
const TASK_RE = /^(\s*)([-*+])([ \t]+)\[([ xX])](\s+)(.*)$/
const INCOMPLETE_TASK_RE = /^\s*[-*+][ \t]+\[[ xX]?\]?\s*$/
const UNORDERED_LIST_RE = /^(\s*)([-*+])([ \t]+)(.*)$/
const ORDERED_LIST_RE = /^(\s*)(\d+\.)([ \t]+)(.*)$/
const BLOCKQUOTE_RE = /^(\s*>+[ \t]+)(.*)$/
const SETEXT_LIST_TYPING_RE = /^\s*-{1,2}\s*$/
const TABLE_SEPARATOR_RE = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/
const TABLE_ROW_RE = /^\s*\|.+\|\s*$/
// Flanking rules (Pandoc-style) keep dollar amounts like "$5 and $10" from
// being treated as math: content must not start/end with whitespace, and a
// closing single "$" must not be immediately followed by a digit.
const MATH_RE = /(?<!\\)(\${1,2})(?!\s)([^$\n]*?[^\s$])\1(?!\d)/g
const STRIKETHROUGH_RE = /~~([^~\n]+?)~~/g
const UNDERLINE_RE = /<u>([^<\n]+?)<\/u>/gi
const INLINE_CODE_RE = /`([^`\n]+?)`/g
const STRONG_RE = /(\*\*|__)([^*_`\n]+?)\1/g
const ITALIC_RE = /(?<![*_])([*_])([^*_`\n]+?)\1(?![*_])/g
const LINK_OR_IMAGE_RE = /!?\[([^\]\n]+)]\([^)]+\)/g
const OBSIDIAN_LINK_RE = /!?\[\[([^\]\n]+)]]/g
const CODE_COMMENT_RE = /(\/\/.*$|#.*$)/g
const CODE_STRING_RE = /(["'`])(?:\\.|(?!\1).)*\1/g
const CODE_NUMBER_RE = /\b(?:0x[\da-f]+|\d+(?:\.\d+)?)\b/gi
const CODE_KEYWORD_RE = /\b(?:abstract|async|await|break|case|catch|class|const|continue|def|default|do|else|enum|export|extends|final|finally|for|from|func|function|go|if|implements|import|in|interface|let|new|null|package|private|protected|public|return|static|struct|switch|this|throw|try|type|var|void|while|yield)\b/g
const CODE_TYPE_RE = /\b(?:Array|Boolean|Double|Float|Int|Integer|List|Long|Map|Number|Promise|Record|Set|String|boolean|char|double|float|int|long|short|string|true|false|undefined)\b/g
const CODE_BLOCK_PADDING_X = 14
const CODE_BLOCK_PADDING_Y = 8
const CODE_BLOCK_FOLD_GUTTER_WIDTH = 20
const ASSET_RESOLUTION_CACHE_TTL_MS = 30000
const ASSET_RESOLUTION_CACHE_MAX_ENTRIES = 200
const FULL_SCAN_LINE_LIMIT = 1200
const VIEWPORT_SCAN_MARGIN_LINES = 80

const DEFAULT_MARKDOWN_LIVE_PREVIEW_FEATURES: Required<MarkdownLivePreviewFeatures> = {
  tasks: true,
  tables: true,
  images: true,
  math: true,
  codeBlocks: true,
  frontmatter: true,
}

interface FoldScrollAnchor {
  position: number
  top: number
  scrollTop: number
  scrollLeft: number
}

interface MarkdownScanRange {
  from: number
  to: number
}

interface MarkdownLineScanRange {
  from: number
  to: number
}

const EMPTY_FOLDS = new Set<string>()
const assetResolutionCache = new WeakMap<MarkdownAssetResolver, Map<string, AssetResolutionCacheEntry>>()

const toggleMarkdownFoldEffect = StateEffect.define<string>()

const markdownFoldState = StateField.define<Set<string>>({
  create: () => EMPTY_FOLDS,
  update(value, transaction) {
    let next = value
    for (const effect of transaction.effects) {
      if (!effect.is(toggleMarkdownFoldEffect)) continue
      if (next === value) next = new Set(value)
      if (next.has(effect.value)) {
        next.delete(effect.value)
      } else {
        next.add(effect.value)
      }
    }
    return next
  },
})

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

// Exported for tests.
export function markdownWidgetCaretRect(dom: HTMLElement, pos: number, side: number): Rect | null {
  const rect = dom.getBoundingClientRect()
  const line = dom.closest('.cm-line') as HTMLElement | null
  const lineRect = line?.getBoundingClientRect()
  const height = markdownTextCaretHeight(line)
    || markdownLineRectHeight(line)
    || (Number.isFinite(rect.height) && rect.height > 0 ? rect.height : 16)
  // Anchor vertically on the widget's own rect: on a wrapped line the line
  // block spans several visual rows and centering on it parks the caret
  // between rows; the widget rect pins it to the row the widget lives in.
  const top = Number.isFinite(rect.height) && rect.height > 0
    ? rect.top + (rect.height - height) / 2
    : (lineRect ? lineRect.top + Math.max(0, (lineRect.height - height) / 2) : rect.top)
  // The caret edge follows the position inside the replaced range: 0 sits
  // before the widget, anything past it sits after. Deciding by `side` drew
  // the caret on the wrong side of the widget (before-positions rendered
  // after the checkbox and vice versa). `side` only breaks the tie for
  // zero-length widgets, where both edges share one document position.
  const left = pos > 0 || (pos === 0 && side > 0 && rect.width === 0)
    ? rect.right
    : rect.left

  return {
    left,
    right: left,
    top,
    bottom: top + height,
  }
}

// Match the caret height CodeMirror uses on plain text (roughly the font's
// ascent+descent) instead of the full line box, so the caret does not grow
// when it lands next to a widget.
function markdownTextCaretHeight(line: HTMLElement | null): number | null {
  if (!line) return null
  const fontSize = Number.parseFloat(getComputedStyle(line).fontSize)
  return Number.isFinite(fontSize) && fontSize > 0 ? fontSize * 1.2 : null
}

function markdownLineRectHeight(line: HTMLElement | null): number | null {
  if (!line) return null
  const lineStyle = getComputedStyle(line)
  const lineHeight = Number.parseFloat(lineStyle.lineHeight)
  if (Number.isFinite(lineHeight) && lineHeight > 0) return lineHeight

  const lineRect = line.getBoundingClientRect()
  return Number.isFinite(lineRect.height) && lineRect.height > 0 ? lineRect.height : null
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

    const button = createDomButton({
      className: this.checked ? 'md-live-task-checkbox checked' : 'md-live-task-checkbox',
      ariaLabel: this.checked ? 'Mark task incomplete' : 'Mark task complete',
      disabled: view.state.facet(EditorState.readOnly),
      styled: true,
      attrs: {
        'aria-checked': String(this.checked),
      },
      onMouseDown: (event) => {
        event.preventDefault()
      },
      onClick: (event) => {
        event.preventDefault()
        if (view.state.facet(EditorState.readOnly)) return
        view.dispatch({
          changes: {
            from: this.checkFrom,
            to: this.checkFrom + 1,
            insert: this.checked ? ' ' : 'x',
          },
        })
        view.focus()
      },
    })
    slot.append(button.host)
    return slot
  }

  destroy(dom: HTMLElement): void {
    unmountDomButtons(dom)
  }

  coordsAt(dom: HTMLElement, pos: number, side: number): Rect | null {
    return markdownWidgetCaretRect(dom, pos, side)
  }

  ignoreEvent(event: Event): boolean {
    return event.type !== 'click' && event.type !== 'mousedown'
  }
}

class MarkdownImageWidget extends WidgetType {
  constructor(
    private readonly alt: string,
    private readonly src: string,
    private readonly rawSource: string,
    private readonly from: number,
    private readonly to: number,
    private readonly foldKey: string,
    private readonly collapsed: boolean,
    private readonly options: MarkdownLivePreviewOptions = {},
  ) {
    super()
  }

  eq(widget: MarkdownImageWidget): boolean {
    return widget.alt === this.alt &&
      widget.src === this.src &&
      widget.rawSource === this.rawSource &&
      widget.foldKey === this.foldKey &&
      widget.collapsed === this.collapsed
  }

  toDOM(view: EditorView): HTMLElement {
    const frame = document.createElement('span')
    frame.className = this.collapsed
      ? 'md-live-asset-frame md-live-image-frame collapsed'
      : 'md-live-asset-frame md-live-image-frame'

    frame.append(foldToggleButton(view, this.foldKey, this.collapsed, this.collapsed ? 'Show image preview' : 'Collapse image preview', 'md-live-asset-fold-toggle'))

    let resolved: MarkdownAssetResolution | null = null

    if (this.collapsed) {
      const summary = document.createElement('span')
      summary.className = 'md-live-asset-collapsed-widget'
      summary.title = this.src
      summary.textContent = `Image: ${this.alt || displayTargetLabel(this.src)}`
      frame.append(summary, assetSourceEditor(view, this.rawSource, this.from, this.to, 'Image Markdown source'))
      return frame
    }

    const buttonMount = createDomButton({
      className: 'md-live-image-widget',
      title: this.src,
      children: this.alt || displayTargetLabel(this.src),
    })
    const button = buttonMount.button

    const applyResolved = (asset: MarkdownAssetResolution | null | undefined) => {
      if (!button.isConnected) return
      resolved = asset || null
      button.dataset.assetKind = asset?.kind || 'missing'
      button.replaceChildren()
      if (asset?.kind === 'image' && asset.dataUrl) {
        const img = document.createElement('img')
        img.className = 'md-live-image-preview'
        img.alt = this.alt || asset.fileName || displayTargetLabel(this.src)
        img.src = asset.dataUrl
        button.title = asset.absolutePath || this.src
        button.append(img)
        return
      }

      const label = document.createElement('span')
      label.className = 'md-live-asset-label'
      label.textContent = asset?.kind === 'missing'
        ? `Missing image: ${displayTargetLabel(this.src)}`
        : this.alt || asset?.fileName || displayTargetLabel(this.src)
      button.append(label)
    }

    if (this.options.resolveAsset) {
      const entry = cachedAssetResolution(this.options.resolveAsset, this.src, { kind: 'image' })
      if (entry.settled) applyResolved(entry.value)
      void entry.promise
        .then(applyResolved)
        .catch(() => applyResolved({ kind: 'missing', rawTarget: this.src, error: 'Failed to resolve image' }))
    } else if (/^(https?:|data:)/i.test(this.src)) {
      applyResolved({ kind: 'image', rawTarget: this.src, dataUrl: this.src })
    }

    button.addEventListener('mousedown', event => event.preventDefault())
    button.addEventListener('click', (event) => {
      event.preventDefault()
      view.dom.dispatchEvent(new CustomEvent('markdown-open-image', {
        bubbles: true,
        detail: {
          alt: this.alt,
          src: resolved?.dataUrl || resolved?.href || this.src,
          absolutePath: resolved?.absolutePath,
          asset: resolved,
        },
      }))
    })
    frame.append(buttonMount.host, assetSourceEditor(view, this.rawSource, this.from, this.to, 'Image Markdown source'))
    return frame
  }

  destroy(dom: HTMLElement): void {
    unmountDomButtons(dom)
  }

  coordsAt(dom: HTMLElement, pos: number, side: number): Rect | null {
    return markdownWidgetCaretRect(dom, pos, side)
  }

  ignoreEvent(event: Event): boolean {
    return event.type !== 'click' && event.type !== 'mousedown'
  }
}

class MarkdownFileWidget extends WidgetType {
  constructor(
    private readonly label: string,
    private readonly href: string,
    private readonly rawSource: string,
    private readonly from: number,
    private readonly to: number,
    private readonly options: MarkdownLivePreviewOptions = {},
  ) {
    super()
  }

  eq(widget: MarkdownFileWidget): boolean {
    return widget.label === this.label &&
      widget.href === this.href &&
      widget.rawSource === this.rawSource &&
      widget.options === this.options
  }

  toDOM(view: EditorView): HTMLElement {
    const frame = document.createElement('span')
    frame.className = 'md-live-asset-frame md-live-file-frame'

    let resolved: MarkdownAssetResolution | null = null

    const buttonMount = createDomButton({
      className: 'md-live-file-widget',
      title: this.href,
      children: this.label || displayTargetLabel(this.href),
    })
    const button = buttonMount.button

    if (this.options.resolveAsset) {
      const entry = cachedAssetResolution(this.options.resolveAsset, this.href, { kind: 'link' })
      if (entry.settled && entry.value) {
        resolved = entry.value
        button.dataset.assetKind = entry.value.kind
        button.textContent = entry.value.kind === 'missing'
          ? `Missing file: ${displayTargetLabel(this.href)}`
          : this.label || entry.value.fileName || displayTargetLabel(this.href)
        button.title = entry.value.absolutePath || entry.value.href || this.href
      }
      void entry.promise
        .then((asset) => {
          if (!button.isConnected || !asset) return
          resolved = asset
          button.dataset.assetKind = asset.kind
          button.textContent = asset.kind === 'missing'
            ? `Missing file: ${displayTargetLabel(this.href)}`
            : this.label || asset.fileName || displayTargetLabel(this.href)
          button.title = asset.absolutePath || asset.href || this.href
        })
        .catch(() => {
          if (!button.isConnected) return
          button.dataset.assetKind = 'missing'
          button.textContent = `Missing file: ${displayTargetLabel(this.href)}`
        })
    }

    button.addEventListener('mousedown', event => event.preventDefault())
    button.addEventListener('click', (event) => {
      event.preventDefault()
      view.dom.dispatchEvent(new CustomEvent('markdown-open-link', {
        bubbles: true,
        detail: {
          href: resolved?.absolutePath || resolved?.href || this.href,
          asset: resolved,
        },
      }))
    })
    frame.append(buttonMount.host, assetSourceEditor(view, this.rawSource, this.from, this.to, 'File Markdown source'))
    return frame
  }

  destroy(dom: HTMLElement): void {
    unmountDomButtons(dom)
  }

  coordsAt(dom: HTMLElement, pos: number, side: number): Rect | null {
    return markdownWidgetCaretRect(dom, pos, side)
  }

  ignoreEvent(event: Event): boolean {
    return event.type !== 'click' && event.type !== 'mousedown'
  }
}

function assetSourceEditor(
  view: EditorView,
  rawSource: string,
  from: number,
  to: number,
  label: string,
): HTMLElement {
  const wrap = document.createElement('span')
  wrap.className = 'md-live-asset-source-editor'
  const readOnly = view.state.facet(EditorState.readOnly)

  const toggleMount = createDomButton({
    className: 'md-live-source-toggle',
    title: label,
    ariaLabel: label,
    disabled: readOnly,
    attrs: {
      'aria-expanded': 'false',
    },
    children: '</>',
    onMouseDown: event => event.preventDefault(),
    onClick: (event) => {
      event.preventDefault()
      event.stopPropagation()
      if (readOnly) return
      if (wrap.classList.contains('editing')) {
        finishEditing(true, true)
        return
      }
      editingDone = false
      wrap.classList.add('editing')
      toggle.setAttribute('aria-expanded', 'true')
      const range = resolveLiveSourceRange(view, wrap, rawSource, from, to)
      input.value = range.current || rawSource
      input.focus()
      input.select()
      document.addEventListener('pointerdown', handleOutsidePointerDown, true)
    },
  })
  const toggle = toggleMount.button

  const input = document.createElement('input')
  input.className = 'md-live-source-input'
  input.value = rawSource
  input.spellcheck = false
  input.readOnly = readOnly
  input.setAttribute('aria-label', label)
  let editingDone = false

  const finishEditing = (commit: boolean, focusView: boolean) => {
    if (editingDone) return
    editingDone = true
    document.removeEventListener('pointerdown', handleOutsidePointerDown, true)
    wrap.classList.remove('editing')
    toggle.setAttribute('aria-expanded', 'false')
    if (!commit || readOnly) {
      if (focusView) view.focus()
      return
    }
    const next = input.value
    const range = resolveLiveSourceRange(view, wrap, rawSource, from, to)
    const current = range.current
    if (next !== current) {
      view.dispatch({
        changes: { from: range.from, to: range.to, insert: next },
        selection: { anchor: range.from + next.length },
      })
    }
    if (focusView) view.focus()
  }

  const handleOutsidePointerDown = (event: Event) => {
    const target = event.target
    if (target instanceof Node && wrap.contains(target)) return
    finishEditing(true, false)
  }

  input.addEventListener('mousedown', event => event.stopPropagation())
  input.addEventListener('click', event => event.stopPropagation())
  input.addEventListener('keydown', (event) => {
    event.stopPropagation()
    if (event.isComposing) return
    if (event.key === 'Enter') {
      event.preventDefault()
      finishEditing(true, true)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      input.value = rawSource
      finishEditing(false, true)
    }
  })
  input.addEventListener('blur', () => finishEditing(true, false))

  wrap.append(toggleMount.host, input)
  return wrap
}

function cachedAssetResolution(
  resolveAsset: MarkdownAssetResolver,
  rawTarget: string,
  context: MarkdownAssetResolverContext,
): AssetResolutionCacheEntry {
  const now = Date.now()
  let cache = assetResolutionCache.get(resolveAsset)
  if (!cache) {
    cache = new Map()
    assetResolutionCache.set(resolveAsset, cache)
  }

  const key = `${context.kind}\u0000${rawTarget}`
  const cached = cache.get(key)
  if (cached && now - cached.createdAt < ASSET_RESOLUTION_CACHE_TTL_MS) return cached

  if (cache.size >= ASSET_RESOLUTION_CACHE_MAX_ENTRIES) {
    const firstKey = cache.keys().next().value as string | undefined
    if (firstKey) cache.delete(firstKey)
  }

  const entry: AssetResolutionCacheEntry = {
    createdAt: now,
    settled: false,
    promise: resolveAsset(rawTarget, context),
  }
  void entry.promise.then((asset) => {
    entry.settled = true
    entry.value = asset
    return asset
  }).catch((error) => {
    cache.delete(key)
    throw error
  })
  cache.set(key, entry)
  return entry
}

function resolveLiveSourceRange(
  view: EditorView,
  anchor: HTMLElement,
  rawSource: string,
  fallbackFrom: number,
  fallbackTo: number,
): { from: number, to: number, current: string } {
  const doc = view.state.doc
  const docText = doc.toString()
  const clippedFallbackFrom = Math.max(0, Math.min(fallbackFrom, doc.length))
  const clippedFallbackTo = Math.max(clippedFallbackFrom, Math.min(fallbackTo, doc.length))
  let anchorPos = clippedFallbackFrom

  try {
    anchorPos = view.posAtDOM(anchor)
  } catch {
    // Reused widgets may move when text is inserted before them; fallback below keeps edits safe.
  }

  if (rawSource && doc.sliceString(anchorPos, Math.min(anchorPos + rawSource.length, doc.length)) === rawSource) {
    return {
      from: anchorPos,
      to: anchorPos + rawSource.length,
      current: rawSource,
    }
  }

  if (rawSource) {
    let bestIndex = -1
    let bestDistance = Number.POSITIVE_INFINITY
    let searchFrom = 0
    while (searchFrom <= docText.length) {
      const index = docText.indexOf(rawSource, searchFrom)
      if (index < 0) break
      const distance = Math.abs(index - anchorPos)
      if (distance < bestDistance) {
        bestIndex = index
        bestDistance = distance
      }
      searchFrom = index + Math.max(1, rawSource.length)
    }
    if (bestIndex >= 0) {
      return {
        from: bestIndex,
        to: bestIndex + rawSource.length,
        current: rawSource,
      }
    }
  }

  return {
    from: clippedFallbackFrom,
    to: clippedFallbackTo,
    current: doc.sliceString(clippedFallbackFrom, clippedFallbackTo),
  }
}

function foldToggleButton(
  view: EditorView,
  foldKey: string,
  collapsed: boolean,
  label: string,
  extraClass = '',
): HTMLElement {
  const mounted = createDomButton({
    className: ['md-live-fold-button', collapsed ? 'collapsed' : '', extraClass].filter(Boolean).join(' '),
    title: label,
    ariaLabel: label,
    attrs: {
      'aria-expanded': String(!collapsed),
      'data-fold-state': collapsed ? 'collapsed' : 'expanded',
    },
    children: collapsed ? '▸' : '▾',
    onMouseDown: event => event.preventDefault(),
    onClick: (event) => {
      event.preventDefault()
      event.stopPropagation()
      toggleMarkdownFold(view, foldKey, mounted.button)
    },
  })
  return mounted.host
}

function toggleMarkdownFold(view: EditorView, foldKey: string, anchorElement?: HTMLElement): void {
  const scrollAnchor = captureFoldScrollAnchor(view, anchorElement)
  view.dispatch({ effects: toggleMarkdownFoldEffect.of(foldKey) })
  restoreFoldScrollAnchor(view, scrollAnchor)
}

function captureFoldScrollAnchor(view: EditorView, anchorElement?: HTMLElement): FoldScrollAnchor {
  const scrollDOM = view.scrollDOM
  const position = foldAnchorPosition(view, anchorElement)
  const coords = view.coordsAtPos(position, 1)
  const elementRect = anchorElement?.getBoundingClientRect()
  return {
    position,
    top: coords?.top ?? elementRect?.top ?? scrollDOM.getBoundingClientRect().top,
    scrollTop: scrollDOM.scrollTop,
    scrollLeft: scrollDOM.scrollLeft,
  }
}

function foldAnchorPosition(view: EditorView, anchorElement?: HTMLElement): number {
  if (anchorElement) {
    try {
      return view.posAtDOM(anchorElement)
    } catch {
      const rect = anchorElement.getBoundingClientRect()
      const position = view.posAtCoords({
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      }, false)
      if (position != null) return position
    }
  }
  return view.state.selection.main.head
}

function restoreFoldScrollAnchor(view: EditorView, anchor: FoldScrollAnchor): void {
  const apply = () => {
    if (!view.dom.isConnected) return
    const scrollDOM = view.scrollDOM
    const position = Math.max(0, Math.min(anchor.position, view.state.doc.length))
    const coords = view.coordsAtPos(position, 1)
    if (!coords) {
      scrollDOM.scrollTop = anchor.scrollTop
      scrollDOM.scrollLeft = anchor.scrollLeft
      return
    }
    const delta = (coords.top - anchor.top) / (view.scaleY || 1)
    if (Number.isFinite(delta) && Math.abs(delta) > 0.5) {
      scrollDOM.scrollTop += delta
    }
    scrollDOM.scrollLeft = anchor.scrollLeft
  }

  apply()
  queueMicrotask(apply)
  if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(apply)
  }
}

class CodeBlockTopbarWidget extends WidgetType {
  constructor(
    private readonly code: string,
    private readonly foldKey: string,
    private readonly collapsed: boolean,
  ) {
    super()
  }

  eq(widget: CodeBlockTopbarWidget): boolean {
    return widget.code === this.code &&
      widget.foldKey === this.foldKey &&
      widget.collapsed === this.collapsed
  }

  // Without this, CodeMirror flattens the full-width toolbar rect and draws
  // the line-start caret at the toolbar's RIGHT edge. Anchor it on the first
  // code character outside the toolbar instead, so approaching the line from
  // either direction yields the same caret position.
  coordsAt(dom: HTMLElement): Rect | null {
    const line = dom.closest('.cm-line') as HTMLElement | null
    if (!line) return null

    const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT, {
      acceptNode: node => (dom.contains(node) || !node.textContent?.length)
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT,
    })
    const textNode = walker.nextNode()
    if (textNode?.textContent?.length) {
      const range = document.createRange()
      range.setStart(textNode, 0)
      range.setEnd(textNode, 1)
      const rect = range.getClientRects()[0]
      if (rect && rect.height > 0) {
        return { left: rect.left, right: rect.left, top: rect.top, bottom: rect.bottom }
      }
    }

    // Empty first code line: sit at the line's left edge below the toolbar.
    const lineRect = line.getBoundingClientRect()
    const height = markdownTextCaretHeight(line) || 16
    const top = Math.min(Math.max(lineRect.top, dom.getBoundingClientRect().bottom), Math.max(lineRect.top, lineRect.bottom - height))
    return { left: lineRect.left, right: lineRect.left, top, bottom: top + height }
  }

  toDOM(view: EditorView): HTMLElement {
    const toolbar = document.createElement('span')
    toolbar.className = 'md-live-codeblock-topbar'
    toolbar.append(foldToggleButton(view, this.foldKey, this.collapsed, this.collapsed ? 'Show code block' : 'Collapse code block', 'md-live-codeblock-fold-toggle'))

    const actions = document.createElement('span')
    actions.className = 'md-live-codeblock-actions'

    const copyMount = createDomButton({
      className: 'md-live-code-copy-button',
      title: 'Copy code',
      children: 'Copy',
      onMouseDown: event => event.preventDefault(),
      onClick: (event) => {
        event.preventDefault()
        event.stopPropagation()
        void copyText(this.code).then((ok) => {
          const copy = copyMount.button
          copy.textContent = ok ? 'Copied' : 'Copy failed'
          window.setTimeout(() => {
            if (copy.isConnected) copy.textContent = 'Copy'
          }, 900)
        })
      },
    })

    actions.append(copyMount.host)
    toolbar.append(actions)
    return toolbar
  }

  destroy(dom: HTMLElement): void {
    unmountDomButtons(dom)
  }

  ignoreEvent(event: Event): boolean {
    return event.type !== 'click' && event.type !== 'mousedown'
  }
}

class CodeBlockFoldSummaryWidget extends WidgetType {
  constructor(
    private readonly language: string,
    private readonly lineCount: number,
  ) {
    super()
  }

  eq(widget: CodeBlockFoldSummaryWidget): boolean {
    return widget.language === this.language &&
      widget.lineCount === this.lineCount
  }

  toDOM(): HTMLElement {
    const summary = document.createElement('span')
    summary.className = 'md-live-fold-summary'
    summary.textContent = `${this.language || 'code'} block - ${this.lineCount} ${this.lineCount === 1 ? 'line' : 'lines'} hidden`
    return summary
  }

  coordsAt(dom: HTMLElement, pos: number, side: number): Rect | null {
    return markdownWidgetCaretRect(dom, pos, side)
  }
}

class CodeBlockLanguageWidget extends WidgetType {
  constructor(
    private readonly rawSource: string,
    private readonly blockFrom: number,
  ) {
    super()
  }

  eq(widget: CodeBlockLanguageWidget): boolean {
    return widget.rawSource === this.rawSource && widget.blockFrom === this.blockFrom
  }

  toDOM(view: EditorView): HTMLElement {
    const parsed = parseFenceSource(this.rawSource)
    const wrap = document.createElement('span')
    wrap.className = 'md-live-codeblock-footer'
    const readOnly = view.state.facet(EditorState.readOnly)

    const input = document.createElement('input')
    input.className = 'md-live-code-language-input'
    input.value = parsed.language
    input.placeholder = 'plain'
    input.spellcheck = false
    input.readOnly = readOnly
    input.setAttribute('aria-label', 'Code block language')
    input.addEventListener('mousedown', event => event.stopPropagation())
    input.addEventListener('click', event => event.stopPropagation())
    input.addEventListener('keydown', (event) => {
      event.stopPropagation()
      if (event.isComposing) return
      if (event.key === 'Enter') {
        event.preventDefault()
        input.blur()
      } else if (event.key === 'Escape') {
        event.preventDefault()
        input.value = parsed.language
        input.blur()
      }
    })
    input.addEventListener('change', () => {
      if (readOnly) return
      const sanitized = sanitizeFenceLanguage(input.value)
      const replacement = `${parsed.indent}${parsed.marker}${sanitized}`
      view.dispatch({
        changes: { from: this.blockFrom, to: this.blockFrom + this.rawSource.length, insert: replacement },
        selection: { anchor: this.blockFrom + replacement.length },
      })
    })

    wrap.append(input)
    return wrap
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

  coordsAt(dom: HTMLElement, pos: number, side: number): Rect | null {
    return markdownWidgetCaretRect(dom, pos, side)
  }
}

class EmptyMarkdownWidget extends WidgetType {
  toDOM(): HTMLElement {
    const span = document.createElement('span')
    span.className = 'md-live-hidden-source-widget'
    return span
  }

  coordsAt(dom: HTMLElement, pos: number, side: number): Rect | null {
    return markdownWidgetCaretRect(dom, pos, side)
  }
}

class EmptyStructureCaretWidget extends WidgetType {
  toDOM(): HTMLElement {
    const span = document.createElement('span')
    span.className = 'md-live-empty-structure-caret-anchor'
    span.setAttribute('aria-hidden', 'true')
    return span
  }

  coordsAt(dom: HTMLElement): Rect | null {
    const line = dom.closest('.cm-line') as HTMLElement | null
    const lineRect = line?.getBoundingClientRect()
    const anchorRect = dom.getBoundingClientRect()
    if (!line || !lineRect) return anchorRect

    const lineStyle = getComputedStyle(line)
    const lineHeight = Number.parseFloat(lineStyle.lineHeight)
    const height = Number.isFinite(lineHeight) && lineHeight > 0
      ? lineHeight
      : lineRect.height
    const top = lineRect.top + Math.max(0, (lineRect.height - height) / 2)
    const left = Number.isFinite(anchorRect.left) ? anchorRect.left : lineRect.left
    return {
      left,
      right: left,
      top,
      bottom: top + height,
    }
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

  coordsAt(dom: HTMLElement, pos: number, side: number): Rect | null {
    return markdownWidgetCaretRect(dom, pos, side)
  }
}

class MarkdownTableBlockWidget extends WidgetType {
  constructor(private readonly block: MarkdownTableBlock) {
    super()
  }

  eq(widget: MarkdownTableBlockWidget): boolean {
    return widget.block.signature === this.block.signature &&
      widget.block.from === this.block.from &&
      widget.block.to === this.block.to
  }

  toDOM(view: EditorView): HTMLElement {
    const table = document.createElement('span')
    table.className = 'md-live-table-widget'
    table.style.setProperty('--md-live-table-columns', String(this.block.columnCount))
    table.setAttribute('role', 'table')
    const readOnly = view.state.facet(EditorState.readOnly)

    for (let rowIndex = 0; rowIndex < this.block.rows.length; rowIndex += 1) {
      const row = this.block.rows[rowIndex]
      const lastRow = rowIndex === this.block.rows.length - 1
      for (let columnIndex = 0; columnIndex < this.block.columnCount; columnIndex += 1) {
        const cell = document.createElement('span')
        cell.className = [
          'md-live-table-cell',
          row.header ? 'header' : '',
          lastRow ? 'last-row' : '',
          columnIndex === this.block.columnCount - 1 ? 'last-col' : '',
        ].filter(Boolean).join(' ')
        cell.setAttribute('role', row.header ? 'columnheader' : 'cell')
        const input = document.createElement('input')
        input.className = 'md-live-table-cell-input'
        input.value = row.cells[columnIndex] ?? ''
        input.size = tableCellInputSize(input.value)
        input.spellcheck = false
        input.readOnly = readOnly
        input.setAttribute('aria-label', `Table ${row.header ? 'header' : 'cell'} ${rowIndex + 1}, ${columnIndex + 1}`)

        const originalValue = input.value
        let committed = false
        const commit = () => {
          if (committed) return
          const nextValue = input.value
          input.size = tableCellInputSize(nextValue)
          if (nextValue === originalValue || readOnly) return
          committed = true
          const nextTable = tableMarkdownWithUpdatedCell(this.block, rowIndex, columnIndex, nextValue)
          view.dispatch({
            changes: { from: this.block.from, to: Math.min(this.block.to, view.state.doc.length), insert: nextTable },
            selection: { anchor: this.block.from + nextTable.length },
          })
        }

        input.addEventListener('mousedown', event => event.stopPropagation())
        input.addEventListener('click', event => event.stopPropagation())
        input.addEventListener('input', () => {
          input.size = tableCellInputSize(input.value)
        })
        input.addEventListener('keydown', (event) => {
          event.stopPropagation()
          if (event.isComposing) return
          if (event.key === 'Enter') {
            event.preventDefault()
            commit()
            input.blur()
          } else if (event.key === 'Escape') {
            event.preventDefault()
            input.value = originalValue
            input.blur()
            view.focus()
          }
        })
        input.addEventListener('change', commit)
        input.addEventListener('blur', commit)

        cell.append(input)
        table.append(cell)
      }
    }

    return table
  }

  coordsAt(dom: HTMLElement, pos: number, side: number): Rect | null {
    return markdownWidgetCaretRect(dom, pos, side)
  }

  ignoreEvent(event: Event): boolean {
    return event.type !== 'click' && event.type !== 'mousedown'
  }
}

class MarkdownFrontMatterWidget extends WidgetType {
  constructor(private readonly block: MarkdownFrontMatterBlock) {
    super()
  }

  eq(widget: MarkdownFrontMatterWidget): boolean {
    return widget.block.signature === this.block.signature &&
      widget.block.from === this.block.from &&
      widget.block.to === this.block.to
  }

  toDOM(view: EditorView): HTMLElement {
    const panel = document.createElement('span')
    panel.className = 'md-live-frontmatter-widget'
    const readOnly = view.state.facet(EditorState.readOnly)

    const header = document.createElement('span')
    header.className = 'md-live-frontmatter-header'
    header.textContent = 'Properties'

    const textarea = document.createElement('textarea')
    textarea.className = 'md-live-frontmatter-textarea'
    textarea.value = this.block.content
    textarea.placeholder = 'Add YAML properties'
    textarea.spellcheck = false
    textarea.readOnly = readOnly
    textarea.rows = Math.max(1, Math.min(8, this.block.content.split('\n').length))
    textarea.setAttribute('aria-label', 'Markdown front matter')

    const originalValue = textarea.value
    let committed = false
    const resize = () => {
      textarea.rows = Math.max(1, Math.min(8, textarea.value.split('\n').length))
    }
    const commit = () => {
      if (committed) return
      resize()
      if (textarea.value === originalValue || readOnly) return
      committed = true
      const replacement = frontMatterSource(this.block, textarea.value)
      view.dispatch({
        changes: { from: this.block.from, to: Math.min(this.block.to, view.state.doc.length), insert: replacement },
        selection: { anchor: this.block.from + replacement.length },
      })
    }

    textarea.addEventListener('mousedown', event => event.stopPropagation())
    textarea.addEventListener('click', event => event.stopPropagation())
    textarea.addEventListener('input', resize)
    textarea.addEventListener('keydown', (event) => {
      event.stopPropagation()
      if (event.isComposing) return
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault()
        commit()
        textarea.blur()
      } else if (event.key === 'Escape') {
        event.preventDefault()
        textarea.value = originalValue
        textarea.blur()
        view.focus()
      }
    })
    textarea.addEventListener('change', commit)
    textarea.addEventListener('blur', commit)

    panel.append(header, textarea)
    return panel
  }

  coordsAt(dom: HTMLElement, pos: number, side: number): Rect | null {
    return markdownWidgetCaretRect(dom, pos, side)
  }

  ignoreEvent(event: Event): boolean {
    return event.type !== 'click' && event.type !== 'mousedown'
  }
}

class HorizontalRuleWidget extends WidgetType {
  toDOM(): HTMLElement {
    const hr = document.createElement('span')
    hr.className = 'md-live-horizontal-rule-widget'
    return hr
  }

  coordsAt(dom: HTMLElement, pos: number, side: number): Rect | null {
    return markdownWidgetCaretRect(dom, pos, side)
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

  coordsAt(dom: HTMLElement, pos: number, side: number): Rect | null {
    return markdownWidgetCaretRect(dom, pos, side)
  }
}

class MarkdownLivePreviewPlugin {
  decorations: DecorationSet
  atomicRanges: RangeSet<Decoration>
  private normalizeScheduled = false

  constructor(
    view: EditorView,
    private readonly options: MarkdownLivePreviewOptions = {},
  ) {
    this.decorations = buildMarkdownDecorations(view, this.options)
    this.atomicRanges = buildMarkdownAtomicRanges(view.state, this.decorations)
    this.scheduleEmptyCodeBlockNormalization(view)
  }

  update(update: ViewUpdate): void {
    const foldsChanged = update.transactions.some(transaction =>
      transaction.effects.some(effect => effect.is(toggleMarkdownFoldEffect)),
    )
    if (
      update.docChanged ||
      update.selectionSet ||
      update.viewportChanged ||
      foldsChanged
    ) {
      this.decorations = buildMarkdownDecorations(update.view, this.options)
      this.atomicRanges = buildMarkdownAtomicRanges(update.view.state, this.decorations)
    }
    if (update.docChanged || update.selectionSet) {
      this.scheduleEmptyCodeBlockNormalization(update.view)
    }
  }

  private scheduleEmptyCodeBlockNormalization(view: EditorView): void {
    if (!markdownLivePreviewFeatures(this.options).codeBlocks) return
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

function buildMarkdownDecorations(view: EditorView, options: MarkdownLivePreviewOptions = {}): DecorationSet {
  const ranges: Range<Decoration>[] = []
  const features = markdownLivePreviewFeatures(options)
  const scanRanges = markdownDecorationScanRanges(view, options)
  const lineScanRanges = markdownLineScanRanges(view.state.doc, scanRanges)
  const folded = markdownFoldKeys(view.state)
  const frontMatter = features.frontmatter ? collectMarkdownFrontMatterBlock(view.state.doc) : null
  addSyntaxTreeDecorations(view, ranges, options, features, folded, frontMatter, scanRanges)
  addFrontMatterDecorations(view, ranges, frontMatter, lineScanRanges)
  addLineFallbackDecorations(view, ranges, options, features, folded, frontMatter, lineScanRanges)
  return Decoration.set(ranges, true)
}

function addLivePreviewReplace(
  view: EditorView,
  ranges: Range<Decoration>[],
  from: number,
  to: number,
  spec: Parameters<typeof Decoration.replace>[0] = {},
): void {
  if (from >= to) return
  if (shouldRevealMarkdownSourceRange(view, from, to)) {
    ranges.push(Decoration.mark({ class: 'md-live-source-revealed' }).range(from, to))
    return
  }
  // Every replaced (hidden) range is atomic for cursor motion — see
  // buildMarkdownAtomicRanges. Revealed ranges become marks above and stay
  // freely editable.
  ranges.push(Decoration.replace({ ...spec, markdownAtomic: true }).range(from, to))
}

function shouldRevealMarkdownSourceRange(view: EditorView, from: number, to: number): boolean {
  return view.state.selection.ranges.some((range) => {
    if (range.empty) return range.head > from && range.head < to
    return range.from < to && range.to > from
  })
}

// Hidden lines collapse to height 0; the reveal check must include the line
// boundaries, otherwise the caret can sit on a zero-height line and typing
// lands in invisible text.
function isMarkdownHiddenLineRevealed(view: EditorView, from: number, to: number): boolean {
  return view.state.selection.ranges.some((range) => {
    if (range.empty) return range.head >= from && range.head <= to
    return range.from <= to && range.to >= from
  })
}

function markdownHiddenLineClass(
  view: EditorView,
  lineFrom: number,
  lineTo: number,
  baseClass: string,
  hiddenClass: string,
): string {
  if (isMarkdownHiddenLineRevealed(view, lineFrom, lineTo)) return baseClass
  return `${baseClass} ${hiddenClass}`
}

function markdownLivePreviewFeatures(options: MarkdownLivePreviewOptions): Required<MarkdownLivePreviewFeatures> {
  return {
    ...DEFAULT_MARKDOWN_LIVE_PREVIEW_FEATURES,
    ...(options.features || {}),
  }
}

const markdownLivePreviewCursorLayer: Extension = [
  layer({
    above: true,
    markers(view): readonly LayerMarker[] {
      if (!markdownLivePreviewContentHasFocus(view)) return []
      const cursors: LayerMarker[] = []
      for (const range of view.state.selection.ranges) {
        if (!range.empty) continue
        const className = range === view.state.selection.main
          ? 'cm-cursor cm-cursor-primary'
          : 'cm-cursor cm-cursor-secondary'
        cursors.push(...markdownLivePreviewCursorMarkers(view, className, range))
      }
      return cursors
    },
    update(update, dom) {
      if (update.transactions.some(transaction => transaction.selection)) {
        dom.style.animationName = dom.style.animationName === 'cm-blink' ? 'cm-blink2' : 'cm-blink'
      }
      return update.docChanged ||
        update.selectionSet ||
        update.viewportChanged ||
        update.geometryChanged ||
        update.focusChanged
    },
    class: 'cm-cursorLayer',
  }),
  EditorView.theme({
    '.cm-content, .cm-line': {
      caretColor: 'transparent !important',
    },
    '.cm-content :focus': {
      caretColor: 'initial !important',
    },
  }),
]

function markdownLivePreviewContentHasFocus(view: EditorView): boolean {
  return view.hasFocus && view.root.activeElement === view.contentDOM
}

function markdownLivePreviewCursorMarkers(
  view: EditorView,
  className: string,
  range: EditorSelection['main'],
): readonly LayerMarker[] {
  const markers = RectangleMarker
    .forRange(view, className, range)
    .map(marker => normalizedMarkdownLivePreviewCursorMarker(view, className, range.head, marker))

  if (markers.length > 0) return markers

  const fallback = fallbackMarkdownLivePreviewCursorMarker(view, className, range.head)
  return fallback ? [fallback] : []
}

function normalizedMarkdownLivePreviewCursorMarker(
  view: EditorView,
  className: string,
  position: number,
  marker: RectangleMarker,
): RectangleMarker {
  const height = markdownLivePreviewCursorHeight(view, position) || marker.height
  const top = marker.top + (marker.height - height) / 2
  return new RectangleMarker(className, marker.left, top, null, height)
}

function markdownLivePreviewCursorHeight(
  view: EditorView,
  position: number,
): number | null {
  const after = position < view.state.doc.length ? view.coordsForChar(position) : null
  if (after) return after.bottom - after.top

  const before = position > 0 ? view.coordsForChar(position - 1) : null
  if (before) return before.bottom - before.top

  return null
}

function fallbackMarkdownLivePreviewCursorMarker(
  view: EditorView,
  className: string,
  position: number,
): RectangleMarker | null {
  const safePosition = Math.max(0, Math.min(position, view.state.doc.length))
  const lineBlock = view.lineBlockAt(safePosition)
  const height = markdownLivePreviewCursorHeight(view, safePosition)
    || markdownLivePreviewLineHeightAtPosition(view, safePosition)
    || view.defaultLineHeight
    || 16
  const left = markdownLivePreviewCursorLeft(view, safePosition)
  if (left === null) return null

  // Prefer the visual row of the adjacent character: centering on the whole
  // line block parks the caret between rows once the line wraps.
  const charRect = (safePosition < view.state.doc.length ? view.coordsForChar(safePosition) : null)
    || (safePosition > 0 ? view.coordsForChar(safePosition - 1) : null)
  const lineElement = markdownLivePreviewLineElementAtPosition(view, safePosition)
  let top = lineBlock.top + Math.max(0, (lineBlock.height - height) / 2)
  if (charRect && lineElement) {
    const lineElementRect = lineElement.getBoundingClientRect()
    const rowOffset = charRect.top + ((charRect.bottom - charRect.top) - height) / 2 - lineElementRect.top
    top = lineBlock.top + Math.max(0, rowOffset)
  }
  return new RectangleMarker(className, left, top, null, height)
}

function markdownLivePreviewCursorLeft(view: EditorView, position: number): number | null {
  const after = position < view.state.doc.length ? view.coordsForChar(position) : null
  if (after) return screenLeftToDocumentLeft(view, after.left)

  const before = position > 0 ? view.coordsForChar(position - 1) : null
  if (before) return screenLeftToDocumentLeft(view, before.right)

  const line = markdownLivePreviewLineElementAtPosition(view, position)
  if (line) {
    const lineRect = line.getBoundingClientRect()
    const style = getComputedStyle(line)
    const paddingLeft = Number.parseFloat(style.paddingLeft)
    const inset = Number.isFinite(paddingLeft) ? paddingLeft : 0
    return screenLeftToDocumentLeft(view, lineRect.left + inset)
  }

  const contentRect = view.contentDOM.getBoundingClientRect()
  if (Number.isFinite(contentRect.left)) return screenLeftToDocumentLeft(view, contentRect.left)
  return null
}

function markdownLivePreviewLineHeightAtPosition(view: EditorView, position: number): number | null {
  return markdownLineRectHeight(markdownLivePreviewLineElementAtPosition(view, position))
}

function markdownLivePreviewLineElementAtPosition(view: EditorView, position: number): HTMLElement | null {
  for (const side of [1, -1] as const) {
    try {
      const { node } = view.domAtPos(position, side)
      const element = node instanceof Element ? node : node.parentElement
      const line = element?.closest('.cm-line') as HTMLElement | null
      if (line) return line
    } catch {
      // Some hidden widget boundaries are not directly mapped to a DOM text node.
    }
  }
  return view.contentDOM.querySelector('.cm-line')
}

function screenLeftToDocumentLeft(view: EditorView, screenLeft: number): number {
  const scrollRect = view.scrollDOM.getBoundingClientRect()
  const baseLeft = view.textDirection === Direction.LTR
    ? scrollRect.left
    : scrollRect.right - view.scrollDOM.clientWidth * view.scaleX
  return screenLeft - (baseLeft - view.scrollDOM.scrollLeft * view.scaleX)
}

function markdownDecorationScanRanges(view: EditorView, options: MarkdownLivePreviewOptions): MarkdownScanRange[] {
  const doc = view.state.doc
  const fullScanLineLimit = options.fullScanLineLimit ?? FULL_SCAN_LINE_LIMIT
  if (doc.lines <= fullScanLineLimit) return [{ from: 0, to: doc.length }]

  const margin = options.viewportLineMargin ?? VIEWPORT_SCAN_MARGIN_LINES
  const sourceRanges: MarkdownScanRange[] = [
    ...view.visibleRanges,
    ...view.state.selection.ranges.map(range => ({ from: range.from, to: range.to })),
  ]

  const expanded = sourceRanges.map(range => expandScanRangeByLines(doc, range.from, range.to, margin))
  return mergeScanRanges(expanded)
}

function expandScanRangeByLines(
  doc: EditorState['doc'],
  from: number,
  to: number,
  margin: number,
): MarkdownScanRange {
  const safeFrom = Math.max(0, Math.min(from, doc.length))
  const safeTo = Math.max(safeFrom, Math.min(to, doc.length))
  const startLine = doc.lineAt(safeFrom)
  const endLine = doc.lineAt(Math.max(safeFrom, safeTo - 1))
  const fromLine = doc.line(Math.max(1, startLine.number - margin))
  const toLine = doc.line(Math.min(doc.lines, endLine.number + margin))
  return { from: fromLine.from, to: toLine.to }
}

function mergeScanRanges(ranges: MarkdownScanRange[]): MarkdownScanRange[] {
  const sorted = ranges
    .filter(range => range.to >= range.from)
    .sort((a, b) => a.from - b.from || a.to - b.to)
  const merged: MarkdownScanRange[] = []

  for (const range of sorted) {
    const previous = merged.at(-1)
    if (!previous || range.from > previous.to + 1) {
      merged.push({ ...range })
      continue
    }
    previous.to = Math.max(previous.to, range.to)
  }

  return merged
}

function markdownLineScanRanges(
  doc: EditorState['doc'],
  ranges: MarkdownScanRange[],
): MarkdownLineScanRange[] {
  return ranges.map((range) => {
    const fromLine = doc.lineAt(Math.max(0, Math.min(range.from, doc.length)))
    const toLine = doc.lineAt(Math.max(range.from, Math.min(range.to, doc.length)))
    return {
      from: fromLine.number,
      to: toLine.number,
    }
  })
}

function lineInScanRanges(lineNumber: number, ranges: MarkdownLineScanRange[]): boolean {
  return ranges.some(range => lineNumber >= range.from && lineNumber <= range.to)
}

function addSyntaxTreeDecorations(
  view: EditorView,
  ranges: Range<Decoration>[],
  options: MarkdownLivePreviewOptions,
  features: Required<MarkdownLivePreviewFeatures>,
  folded: ReadonlySet<string>,
  frontMatter: MarkdownFrontMatterBlock | null,
  scanRanges: MarkdownScanRange[],
): void {
  const doc = view.state.doc
  const tree = syntaxTree(view.state)

  for (const scanRange of scanRanges) {
    tree.iterate({
      from: scanRange.from,
      to: scanRange.to,
      enter: ({ name, from, to }) => {
        if (from >= to) return
        if (frontMatter && rangeIntersects(from, to, frontMatter.from, frontMatter.to)) return

        if (/^ATXHeading[1-6]$/.test(name)) {
          const level = Number(name.slice(-1))
          const line = doc.lineAt(from)
          if (!isRenderableHeadingLine(line.text)) return
          ranges.push(Decoration.line({ class: `md-live-line md-live-heading md-live-heading-${level}` }).range(line.from))
          return
        }

        if (/^SetextHeading[12]$/.test(name)) {
          if (addSetextListTypingDecorations(view, ranges, from, to)) return
        }

        if (name === 'HeaderMark') {
          const line = doc.lineAt(from)
          if (!isRenderableHeadingLine(line.text)) return
          const whitespaceTo = Math.min(line.to, to + trailingWhitespaceLength(line.text.slice(to - line.from)))
          addLivePreviewReplace(view, ranges, from, whitespaceTo, {
            widget: new EmptyStructureCaretWidget(),
            inclusive: false,
          })
          return
        }

        if (name === 'ListMark') {
          const line = doc.lineAt(from)
          if (!isRenderableListLine(line.text)) return
          if (!isPrimaryLineMarker(line.text, line.from, from)) return
          if (!isTaskLine(line.text)) {
            const ordered = /^\d+\.$/.test(doc.sliceString(from, to))
            const markerTo = Math.min(line.to, to + trailingWhitespaceLength(line.text.slice(to - line.from)))
            const label = ordered ? doc.sliceString(from, to) : '•'
            ranges.push(Decoration.line({ class: `md-live-line md-live-${ordered ? 'ordered-list' : 'unordered-list'}` }).range(line.from))
            addLivePreviewReplace(view, ranges, from, markerTo, {
              widget: new MarkdownListMarkerWidget(label),
              inclusive: false,
            })
          }
          return
        }

        if (name === 'QuoteMark') {
          const line = doc.lineAt(from)
          if (!isRenderableBlockquoteLine(line.text)) return
          const markerTo = Math.min(line.to, to + trailingWhitespaceLength(line.text.slice(to - line.from)))
          ranges.push(Decoration.line({ class: 'md-live-line md-live-blockquote' }).range(line.from))
          addLivePreviewReplace(view, ranges, from, markerTo, {
            widget: markerTo >= line.to ? new EmptyStructureCaretWidget() : undefined,
            inclusive: false,
          })
          return
        }

        if (name === 'FencedCode') {
          if (!features.codeBlocks) return
          addFencedCodeDecorations(view, ranges, from, to, folded)
          return
        }

        if (name === 'StrongEmphasis' || name === 'Emphasis') {
          addEmphasisDecoration(view, ranges, from, to, name === 'StrongEmphasis' ? 'md-live-bold' : 'md-live-italic')
          return
        }

        if (name === 'InlineCode') {
          addInlineCodeDecoration(view, ranges, from, to)
          return
        }

        if (name === 'Link') {
          addLinkDecoration(view, ranges, from, to)
          return
        }

        if (name === 'Image') {
          if (!features.images) return
          addImageDecoration(view, ranges, from, to, options, folded)
          return
        }

        if (name === 'HorizontalRule') {
          const line = doc.lineAt(from)
          ranges.push(Decoration.line({ class: 'md-live-line md-live-horizontal-rule' }).range(line.from))
          addLivePreviewReplace(view, ranges, from, to, {
            widget: new HorizontalRuleWidget(),
            inclusive: false,
          })
        }
      },
    })
  }
}

function addLineFallbackDecorations(
  view: EditorView,
  ranges: Range<Decoration>[],
  options: MarkdownLivePreviewOptions,
  features: Required<MarkdownLivePreviewFeatures>,
  folded: ReadonlySet<string>,
  frontMatter: MarkdownFrontMatterBlock | null,
  scanRanges: MarkdownLineScanRange[],
): void {
  const tableLines = features.tables
    ? collectMarkdownTableLineStates(view.state.doc, scanRanges)
    : new Map<number, MarkdownTableLineState>()

  for (const scanRange of scanRanges) {
    let fence = markdownFenceStateAtLine(view.state.doc, scanRange.from)

    for (let lineNumber = scanRange.from; lineNumber <= scanRange.to; lineNumber += 1) {
      const line = view.state.doc.line(lineNumber)
      if (frontMatter && lineNumber >= frontMatter.openingLineNumber && lineNumber <= frontMatter.closingLineNumber) {
        continue
      }
      const closesFence = fence !== null && markdownFenceClosing(line.text, fence)
      const opensFence = fence === null ? markdownFenceOpening(line.text) : null
      // Inside a fence only a matching closing line is a fence boundary; a
      // shorter or different-marker fence (a markdown sample inside a
      // ````-block) is plain code and must not toggle the state or render.
      const info: MarkdownLivePreviewLineInfo = fence
        ? (closesFence ? { kind: 'fence' } : { kind: 'code' })
        : analyzeMarkdownLivePreviewLine(line.text, false)
      const tableLine = fence === null ? tableLines.get(lineNumber) : undefined

      if (features.tables && tableLine) {
        addTableBlockDecoration(view, ranges, line.from, line.to, tableLine)
        continue
      }

      if (features.tasks) addTaskDecoration(view, ranges, line.from, line.to, line.text, info)
      if (features.tables) addTableDecoration(view, ranges, line.from, line.to, line.text, info)
      if (info.kind !== 'table' && info.kind !== 'code' && info.kind !== 'fence') {
        const inlineCode = collectInlineCodeRanges(line.text, line.from)
        if (features.math) addMathDecorations(view, ranges, line.from, line.text, inlineCode)
        addInlineFallbackDecorations(view, ranges, line.from, line.text, inlineCode)
        if (features.images) addObsidianLinkDecorations(view, ranges, line.from, line.text, options, folded, inlineCode)
        addEmojiDecorations(view, ranges, line.from, line.text, inlineCode)
      }

      if (closesFence) {
        fence = null
      } else if (opensFence) {
        fence = opensFence
      }
    }
  }
}

function collectMarkdownFrontMatterBlock(doc: EditorState['doc']): MarkdownFrontMatterBlock | null {
  if (doc.lines < 2) return null
  const openingLine = doc.line(1)
  if (!FRONT_MATTER_OPEN_RE.test(openingLine.text)) return null

  for (let lineNumber = 2; lineNumber <= doc.lines; lineNumber += 1) {
    const line = doc.line(lineNumber)
    if (!FRONT_MATTER_CLOSE_RE.test(line.text)) {
      // A blank line before the closing fence means the leading "---" is a
      // horizontal rule, not front matter — otherwise a document that starts
      // with a divider swallows its body into the properties panel.
      if (!line.text.trim()) return null
      continue
    }
    const contentLines: string[] = []
    for (let contentLineNumber = 2; contentLineNumber < lineNumber; contentLineNumber += 1) {
      contentLines.push(doc.line(contentLineNumber).text)
    }
    const content = contentLines.join('\n')
    const signature = `${openingLine.text}\u0000${line.text}\u0000${content}`
    return {
      from: openingLine.from,
      to: line.to,
      openingLineNumber: openingLine.number,
      closingLineNumber: line.number,
      openingFence: openingLine.text.trim() || '---',
      closingFence: line.text.trim() || '---',
      content,
      signature,
    }
  }

  return null
}

function addFrontMatterDecorations(
  view: EditorView,
  ranges: Range<Decoration>[],
  block: MarkdownFrontMatterBlock | null,
  scanRanges: MarkdownLineScanRange[],
): void {
  if (!block) return
  if (!scanRanges.some(range => block.openingLineNumber <= range.to && block.closingLineNumber >= range.from)) return
  const doc = view.state.doc
  const openingLine = doc.line(block.openingLineNumber)
  ranges.push(Decoration.line({ class: 'md-live-line md-live-frontmatter-line' }).range(openingLine.from))
  addReplaceOrWidgetDecoration(view, ranges, openingLine.from, openingLine.to, new MarkdownFrontMatterWidget(block))

  for (let lineNumber = block.openingLineNumber + 1; lineNumber <= block.closingLineNumber; lineNumber += 1) {
    const line = doc.line(lineNumber)
    ranges.push(Decoration.line({
      class: markdownHiddenLineClass(view, line.from, line.to, 'md-live-line', 'md-live-frontmatter-hidden md-live-fold-hidden'),
    }).range(line.from))
    addReplaceOrWidgetDecoration(view, ranges, line.from, line.to, new EmptyMarkdownWidget())
  }
}

function rangeIntersects(from: number, to: number, otherFrom: number, otherTo: number): boolean {
  return from < otherTo && to > otherFrom
}

function collectMarkdownTableLineStates(
  doc: EditorState['doc'],
  scanRanges?: MarkdownLineScanRange[],
): Map<number, MarkdownTableLineState> {
  const states = new Map<number, MarkdownTableLineState>()
  const ranges = scanRanges?.length
    ? scanRanges.map(range => ({
        from: Math.max(1, range.from - 2),
        to: Math.min(doc.lines, range.to + 2),
      }))
    : [{ from: 1, to: doc.lines }]

  for (const range of ranges) {
    let lineNumber = range.from

    while (lineNumber <= range.to) {
      const startLineNumber = lineNumber
      const rows: Array<{ lineNumber: number, cells: string[], separator: boolean }> = []

      while (lineNumber <= doc.lines) {
        const line = doc.line(lineNumber)
        const separator = TABLE_SEPARATOR_RE.test(line.text)
        const row = TABLE_ROW_RE.test(line.text)
        if (!separator && !row) break

        const cells = separator ? [] : parseTableCells(line.text)
        if (!separator && cells.length === 0) break
        rows.push({ lineNumber, cells, separator })
        lineNumber += 1
      }

      if (rows.length === 0) {
        lineNumber += 1
        continue
      }

      const separatorIndex = rows.findIndex(row => row.separator)
      if (separatorIndex !== 1 || rows.length < 2 || rows[0].cells.length === 0) {
        continue
      }

      const widgetRows = rows
        .filter(row => !row.separator)
        .map((row, index) => ({
          cells: row.cells,
          header: index === 0,
        }))
      const columnCount = Math.max(...widgetRows.map(row => row.cells.length), 1)
      const signature = widgetRows
        .map(row => `${row.header ? 'h' : 'b'}:${row.cells.join('\u0000')}`)
        .join('\u0001')
      const block: MarkdownTableBlock = {
        rows: widgetRows,
        columnCount,
        signature,
        from: doc.line(startLineNumber).from,
        to: doc.line(rows[rows.length - 1].lineNumber).to,
      }

      states.set(startLineNumber, { role: 'block', block })
      for (const row of rows.slice(1)) {
        states.set(row.lineNumber, { role: 'hidden' })
      }
    }
  }

  return states
}

function addTaskDecoration(
  view: EditorView,
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
  addLivePreviewReplace(view, ranges, markerFrom, markerTo, {
    widget: new MarkdownTaskWidget(Boolean(info.checked), checkFrom),
    inclusive: false,
  })
}

function addSetextListTypingDecorations(
  view: EditorView,
  ranges: Range<Decoration>[],
  from: number,
  to: number,
): boolean {
  const doc = view.state.doc
  const underlineLine = doc.lineAt(Math.max(from, to - 1))
  if (!SETEXT_LIST_TYPING_RE.test(underlineLine.text)) return false

  const firstLineNumber = doc.lineAt(from).number
  for (let lineNumber = firstLineNumber; lineNumber <= underlineLine.number; lineNumber += 1) {
    const line = doc.line(lineNumber)
    ranges.push(Decoration.line({ class: 'md-live-line md-live-setext-list-typing' }).range(line.from))
  }
  return true
}

function addTableDecoration(
  view: EditorView,
  ranges: Range<Decoration>[],
  lineFrom: number,
  lineTo: number,
  text: string,
  info: MarkdownLivePreviewLineInfo,
): void {
  if (info.kind !== 'table') return
  ranges.push(Decoration.line({ class: 'md-live-line md-live-table' }).range(lineFrom))
  addLivePreviewReplace(view, ranges, lineFrom, lineTo, {
    widget: new MarkdownTableRowWidget(parseTableCells(text), TABLE_SEPARATOR_RE.test(text)),
    inclusive: false,
  })
}

function addTableBlockDecoration(
  view: EditorView,
  ranges: Range<Decoration>[],
  lineFrom: number,
  lineTo: number,
  state: MarkdownTableLineState,
): void {
  if (state.role === 'block' && state.block) {
    ranges.push(Decoration.line({ class: 'md-live-line md-live-table md-live-table-block-line' }).range(lineFrom))
    addReplaceOrWidgetDecoration(view, ranges, lineFrom, lineTo, new MarkdownTableBlockWidget(state.block))
    return
  }

  ranges.push(Decoration.line({
    class: markdownHiddenLineClass(view, lineFrom, lineTo, 'md-live-line', 'md-live-table-hidden md-live-fold-hidden'),
  }).range(lineFrom))
  addReplaceOrWidgetDecoration(view, ranges, lineFrom, lineTo, new EmptyMarkdownWidget())
}

function addFencedCodeDecorations(
  view: EditorView,
  ranges: Range<Decoration>[],
  from: number,
  to: number,
  folded: ReadonlySet<string>,
): void {
  const doc = view.state.doc
  const startLine = doc.lineAt(from)
  const endLine = doc.lineAt(Math.max(from, to - 1))
  if (endLine.number <= startLine.number || !FENCE_RE.test(endLine.text)) return
  if (endLine.number === startLine.number + 1) return
  const codeRange = fencedCodeContentRange(doc, startLine.number, endLine.number)
  const code = doc.sliceString(codeRange.from, codeRange.to)
  // Content-signature key (like asset fold keys): a position-based key would
  // change on every edit above the block and silently unfold it.
  const foldKey = markdownFoldKey('code', 0, `${startLine.text}\n${endLine.number - startLine.number}\n${code.slice(0, 240)}`)
  const collapsed = folded.has(foldKey)
  const parsed = parseFenceSource(startLine.text)
  const contentLineCount = Math.max(0, endLine.number - startLine.number - 1)

  for (let lineNumber = startLine.number; lineNumber <= endLine.number; lineNumber += 1) {
    const line = doc.line(lineNumber)
    const isOpeningFence = lineNumber === startLine.number
    const isClosingFence = lineNumber === endLine.number
    const isFirstContentLine = lineNumber === startLine.number + 1
    const firstCodeLine = lineNumber === startLine.number + 1
    const lastCodeLine = lineNumber === endLine.number - 1

    if (isOpeningFence) {
      ranges.push(Decoration.line({
        class: markdownHiddenLineClass(view, line.from, line.to, 'md-live-line md-live-fence', 'md-live-codeblock-fence-hidden'),
      }).range(line.from))
      addReplaceOrWidgetDecoration(view, ranges, line.from, line.to, new EmptyMarkdownWidget())
      continue
    }

    if (collapsed) {
      if (isFirstContentLine) {
        ranges.push(Decoration.line({ class: 'md-live-line md-live-codeblock-fold-summary-line' }).range(line.from))
        ranges.push(Decoration.widget({
          widget: new CodeBlockTopbarWidget(code, foldKey, collapsed),
          side: -1,
        }).range(line.from))
        addReplaceOrWidgetDecoration(
          view,
          ranges,
          line.from,
          line.to,
          new CodeBlockFoldSummaryWidget(parsed.language, contentLineCount),
        )
      } else {
        ranges.push(Decoration.line({
          class: markdownHiddenLineClass(view, line.from, line.to, 'md-live-line', 'md-live-fold-hidden'),
        }).range(line.from))
        addReplaceOrWidgetDecoration(view, ranges, line.from, line.to, new EmptyMarkdownWidget())
      }
      continue
    }

    if (isClosingFence) {
      ranges.push(Decoration.line({
        class: markdownHiddenLineClass(view, line.from, line.to, 'md-live-line md-live-fence', 'md-live-codeblock-fence-hidden'),
      }).range(line.from))
      addReplaceOrWidgetDecoration(view, ranges, line.from, line.to, new EmptyMarkdownWidget())
      continue
    }

    ranges.push(Decoration.line({
      class: [
        'md-live-line md-live-code',
        firstCodeLine ? 'md-live-codeblock-first' : '',
        lastCodeLine ? 'md-live-codeblock-last' : '',
      ].filter(Boolean).join(' '),
    }).range(line.from))
    if (firstCodeLine) {
      ranges.push(Decoration.widget({
        widget: new CodeBlockTopbarWidget(code, foldKey, collapsed),
        side: -1,
      }).range(line.from))
    }
    if (lastCodeLine) {
      ranges.push(Decoration.widget({
        widget: new CodeBlockLanguageWidget(startLine.text, startLine.from),
        side: 1,
      }).range(line.to))
    }
    addCodeSyntaxDecorations(ranges, line.from, line.text)
  }
}

function addReplaceOrWidgetDecoration(
  view: EditorView,
  ranges: Range<Decoration>[],
  from: number,
  to: number,
  widget: WidgetType,
): void {
  if (from < to) {
    addLivePreviewReplace(view, ranges, from, to, {
      widget,
      inclusive: false,
    })
    return
  }

  ranges.push(Decoration.widget({
    widget,
    side: 0,
  }).range(from))
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
  addLivePreviewReplace(view, ranges, from, contentFrom, { inclusive: false })
  ranges.push(Decoration.mark({ class: className }).range(contentFrom, contentTo))
  addLivePreviewReplace(view, ranges, contentTo, to, { inclusive: false })
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
  addLivePreviewReplace(view, ranges, from, contentFrom, { inclusive: false })
  ranges.push(Decoration.mark({ class: 'md-live-inline-code' }).range(contentFrom, contentTo))
  addLivePreviewReplace(view, ranges, contentTo, to, { inclusive: false })
}

function addLinkDecoration(
  view: EditorView,
  ranges: Range<Decoration>[],
  from: number,
  to: number,
): void {
  const parts = parseLinkParts(view.state.doc.sliceString(from, to), from)
  if (!parts || parts.labelFrom >= parts.labelTo) return
  addLivePreviewReplace(view, ranges, from, parts.labelFrom, { inclusive: false })
  ranges.push(Decoration.mark({
    class: 'md-live-link',
    attributes: parts.url ? { 'data-href': parts.url } : undefined,
  }).range(parts.labelFrom, parts.labelTo))
  addLivePreviewReplace(view, ranges, parts.labelTo, to, { inclusive: false })
}

function addImageDecoration(
  view: EditorView,
  ranges: Range<Decoration>[],
  from: number,
  to: number,
  options: MarkdownLivePreviewOptions,
  folded: ReadonlySet<string>,
): void {
  const parts = parseLinkParts(view.state.doc.sliceString(from, to), from, true)
  if (!parts?.url) return
  const alt = view.state.doc.sliceString(parts.labelFrom, parts.labelTo)
  const rawSource = view.state.doc.sliceString(from, to)
  if (!shouldRenderMarkdownImageTarget(parts.url)) {
    addLivePreviewReplace(view, ranges, from, to, {
      widget: new MarkdownFileWidget(alt || displayTargetLabel(parts.url), parts.url, rawSource, from, to, options),
      inclusive: false,
    })
    return
  }
  const foldKey = markdownAssetFoldKey(rawSource)
  addLivePreviewReplace(view, ranges, from, to, {
    widget: new MarkdownImageWidget(alt, parts.url, rawSource, from, to, foldKey, folded.has(foldKey), options),
    inclusive: false,
  })
}

function addMathDecorations(
  view: EditorView,
  ranges: Range<Decoration>[],
  lineFrom: number,
  text: string,
  inlineCode: InlineCodeRange[],
): void {
  for (const match of text.matchAll(MATH_RE)) {
    const index = match.index ?? 0
    const delimiter = match[1]
    const content = match[2]
    if (!delimiter || !content) continue
    const from = lineFrom + index
    const contentFrom = from + delimiter.length
    const contentTo = contentFrom + content.length
    const to = contentTo + delimiter.length
    if (overlapsInlineCode(from, to, inlineCode)) continue
    addLivePreviewReplace(view, ranges, from, contentFrom, { inclusive: false })
    ranges.push(Decoration.mark({ class: 'md-live-math' }).range(contentFrom, contentTo))
    addLivePreviewReplace(view, ranges, contentTo, to, { inclusive: false })
  }
}

function addInlineFallbackDecorations(
  view: EditorView,
  ranges: Range<Decoration>[],
  lineFrom: number,
  text: string,
  inlineCode: InlineCodeRange[],
): void {
  addDelimitedInlineDecorations(view, ranges, lineFrom, text, STRIKETHROUGH_RE, 2, 2, 'md-live-strikethrough', inlineCode)
  addDelimitedInlineDecorations(view, ranges, lineFrom, text, UNDERLINE_RE, 3, 4, 'md-live-underline', inlineCode)
}

function addObsidianLinkDecorations(
  view: EditorView,
  ranges: Range<Decoration>[],
  lineFrom: number,
  text: string,
  options: MarkdownLivePreviewOptions,
  folded: ReadonlySet<string>,
  inlineCode: InlineCodeRange[],
): void {
  OBSIDIAN_LINK_RE.lastIndex = 0
  for (const match of text.matchAll(OBSIDIAN_LINK_RE)) {
    if (match.index === undefined || !match[1]) continue
    const raw = match[0]
    const target = match[1].trim()
    const display = displayTargetLabel(target)
    const from = lineFrom + match.index
    const to = from + raw.length
    if (overlapsInlineCode(from, to, inlineCode)) continue
    const embed = raw.startsWith('![[')
    const image = embed && isLikelyImageTarget(target)
    const foldKey = image ? markdownAssetFoldKey(raw) : ''
    addLivePreviewReplace(view, ranges, from, to, {
      widget: image
        ? new MarkdownImageWidget(display, target, raw, from, to, foldKey, folded.has(foldKey), options)
        : new MarkdownFileWidget(display, target, raw, from, to, options),
      inclusive: false,
    })
  }
}

interface InlineCodeRange {
  from: number
  to: number
}

function overlapsInlineCode(from: number, to: number, inlineCode: InlineCodeRange[]): boolean {
  return inlineCode.some(range => rangesOverlap(from, to, range.from, range.to))
}

function collectInlineCodeRanges(text: string, lineFrom: number): InlineCodeRange[] {
  const ranges: InlineCodeRange[] = []
  let index = 0

  while (index < text.length) {
    if (text[index] !== '`') {
      index += 1
      continue
    }

    let delimiterLength = 1
    while (text[index + delimiterLength] === '`') delimiterLength += 1

    const delimiter = '`'.repeat(delimiterLength)
    const closeIndex = text.indexOf(delimiter, index + delimiterLength)
    if (closeIndex < 0) {
      index += delimiterLength
      continue
    }

    const from = lineFrom + index
    const to = lineFrom + closeIndex + delimiterLength
    if (to > from + delimiterLength * 2) ranges.push({ from, to })
    index = closeIndex + delimiterLength
  }

  return ranges
}

function rangesOverlap(from: number, to: number, otherFrom: number, otherTo: number): boolean {
  return from < otherTo && to > otherFrom
}

function addEmojiDecorations(
  view: EditorView,
  ranges: Range<Decoration>[],
  lineFrom: number,
  text: string,
  inlineCode: InlineCodeRange[],
): void {
  for (const match of findEmojiShortcodes(text)) {
    if (overlapsInlineCode(lineFrom + match.from, lineFrom + match.to, inlineCode)) continue
    addLivePreviewReplace(view, ranges, lineFrom + match.from, lineFrom + match.to, {
      widget: new MarkdownEmojiWidget(match.emoji, match.name),
      inclusive: false,
    })
  }
}

function addDelimitedInlineDecorations(
  view: EditorView,
  ranges: Range<Decoration>[],
  lineFrom: number,
  text: string,
  pattern: RegExp,
  prefixLength: number,
  suffixLength: number,
  className: string,
  inlineCode: InlineCodeRange[],
): void {
  pattern.lastIndex = 0
  for (const match of text.matchAll(pattern)) {
    if (match.index === undefined || !match[1]) continue
    const from = lineFrom + match.index
    const contentFrom = from + prefixLength
    const contentTo = from + match[0].length - suffixLength
    if (contentFrom >= contentTo) continue
    if (overlapsInlineCode(from, from + match[0].length, inlineCode)) continue
    addLivePreviewReplace(view, ranges, from, contentFrom, { inclusive: false })
    ranges.push(Decoration.mark({ class: className }).range(contentFrom, contentTo))
    addLivePreviewReplace(view, ranges, contentTo, from + match[0].length, { inclusive: false })
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
  const cells = trimmed.split('|').map(cell => cell.trim())
  return cells.some(Boolean) ? cells : []
}

function tableMarkdownWithUpdatedCell(
  block: MarkdownTableBlock,
  rowIndex: number,
  columnIndex: number,
  nextValue: string,
): string {
  const rows = block.rows.map(row => ({
    header: row.header,
    cells: Array.from({ length: block.columnCount }, (_, index) => row.cells[index] ?? ''),
  }))
  if (!rows[rowIndex]) return block.rows.map(row => formatMarkdownTableRow(row.cells)).join('\n')
  rows[rowIndex].cells[columnIndex] = sanitizeMarkdownTableCell(nextValue)

  const header = rows[0] || { header: true, cells: Array.from({ length: block.columnCount }, () => '') }
  const body = rows.slice(1)
  return [
    formatMarkdownTableRow(header.cells),
    formatMarkdownTableSeparator(block.columnCount),
    ...body.map(row => formatMarkdownTableRow(row.cells)),
  ].join('\n')
}

function sanitizeMarkdownTableCell(value: string): string {
  return value.replace(/\r?\n/g, ' ').replace(/\|/g, '\\|').trim()
}

function formatMarkdownTableRow(cells: string[]): string {
  return `| ${cells.map(sanitizeMarkdownTableCell).join(' | ')} |`
}

function formatMarkdownTableSeparator(columnCount: number): string {
  return `| ${Array.from({ length: Math.max(1, columnCount) }, () => '---').join(' | ')} |`
}

function frontMatterSource(block: MarkdownFrontMatterBlock, content: string): string {
  const normalized = content.replace(/\r\n?/g, '\n').replace(/\s+$/g, '')
  if (!normalized) return `${block.openingFence}\n${block.closingFence}`
  return `${block.openingFence}\n${normalized}\n${block.closingFence}`
}

function inlineCodeDelimiterLength(text: string): number {
  const opening = text.match(/^`+/)?.[0]
  if (!opening || !text.endsWith(opening)) return 0
  return opening.length
}

function parseFenceSource(source: string): { indent: string; marker: string; language: string } {
  const match = source.match(/^(\s*)(`{3,}|~{3,})(.*)$/)
  return {
    indent: match?.[1] || '',
    marker: match?.[2] || '```',
    language: (match?.[3] || '').trim(),
  }
}

function sanitizeFenceLanguage(value: string): string {
  return value.trim().replace(/[`~\r\n]/g, '').replace(/\s+/g, '-')
}

async function copyText(text: string): Promise<boolean> {
  try {
    const result = await platformApi?.writeClipboardText?.(text)
    if (result && result.success !== false) return true
  } catch {
    // Fall back to the browser clipboard paths below.
  }

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // Fall back to the legacy copy path below.
  }

  try {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.position = 'fixed'
    textarea.style.left = '-9999px'
    textarea.style.top = '0'
    textarea.setAttribute('readonly', 'true')
    document.body.append(textarea)
    textarea.select()
    const copied = document.execCommand?.('copy') ?? false
    textarea.remove()
    return copied
  } catch {
    return false
  }
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

function displayTargetLabel(target: string): string {
  const clean = target.split('|')[0].split('#')[0].trim()
  const parts = clean.split(/[\\/]/).filter(Boolean)
  return parts.at(-1) || clean || target
}

function isLikelyImageTarget(target: string): boolean {
  return /\.(avif|bmp|gif|jpe?g|png|svg|webp)(?:$|[?#])/i.test(target.split('|')[0])
}

function shouldRenderMarkdownImageTarget(target: string): boolean {
  const clean = target.split('|')[0].trim()
  if (isLikelyImageTarget(clean) || /^data:image\//i.test(clean)) return true
  return !/\.[a-z0-9]{1,12}(?:$|[?#])/i.test(clean)
}

function markdownFoldKeys(state: EditorState): ReadonlySet<string> {
  return state.field(markdownFoldState, false) || EMPTY_FOLDS
}

function markdownFoldKey(kind: string, from: number, signature: string): string {
  return `${kind}:${from}:${hashString(signature)}`
}

function markdownAssetFoldKey(rawSource: string): string {
  return markdownFoldKey('asset', 0, rawSource)
}

const FULL_WIDTH_CHAR_RE = /[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6\u{20000}-\u{3FFFD}]/u

// input.size counts average character widths; CJK and other full-width
// glyphs render about twice as wide, so weigh them double or CJK columns
// come out half the needed width.
function tableCellInputSize(value: string): number {
  let width = 0
  for (const char of value) {
    width += FULL_WIDTH_CHAR_RE.test(char) ? 2 : 1
  }
  return Math.max(6, Math.min(48, width + 1))
}

function hashString(value: string): string {
  let hash = 5381
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) + hash) ^ value.charCodeAt(index)
  }
  return (hash >>> 0).toString(36)
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

function leadingWhitespaceLength(text: string): number {
  return text.match(/^\s*/)?.[0].length || 0
}

function isPrimaryLineMarker(text: string, lineFrom: number, markerFrom: number): boolean {
  return markerFrom === lineFrom + leadingWhitespaceLength(text)
}

function markdownLivePreviewPlugin(options: MarkdownLivePreviewOptions): Extension {
  return ViewPlugin.define(
    view => new MarkdownLivePreviewPlugin(view, options),
    {
      decorations: value => value.decorations,
      provide: plugin => EditorView.atomicRanges.of(
        view => view.plugin(plugin)?.atomicRanges ?? RangeSet.empty,
      ),
    },
  )
}

const atomicRangeMarker = Decoration.mark({})
const HIDDEN_LINE_CLASS_RE = /\bmd-live-fold-hidden\b|\bmd-live-codeblock-fence-hidden\b/

// Cursor motion treats hidden ranges as single units so arrow keys never
// stop on positions with no visible caret (Typora-style). Zero-height hidden
// lines and lines fully replaced by a widget are extended across their
// surrounding newlines and merged with touching neighbours, so a whole
// rendered block is one island whose motion stops sit on real text of the
// adjacent lines. Partial-line replaces (inline syntax delimiters, checkbox
// markers, emoji, links) stay exact and are crossed in one step. Revealed
// ranges become marks instead of replaces and automatically stop being
// atomic; a selection spanning an atom still reveals the raw source, which
// remains the editing path for hidden syntax.
function buildMarkdownAtomicRanges(state: EditorState, decorations: DecorationSet): RangeSet<Decoration> {
  const doc = state.doc
  const intervals: Array<{ from: number, to: number }> = []

  const cursor = decorations.iter()
  while (cursor.value) {
    const spec = cursor.value.spec as { class?: string, markdownAtomic?: boolean }
    if (cursor.from === cursor.to && typeof spec.class === 'string' && HIDDEN_LINE_CLASS_RE.test(spec.class)) {
      const line = doc.lineAt(cursor.from)
      intervals.push({ from: Math.max(0, line.from - 1), to: Math.min(doc.length, line.to + 1) })
    } else if (cursor.from < cursor.to && spec.markdownAtomic === true) {
      const line = doc.lineAt(cursor.from)
      const fullLine = cursor.from === line.from && cursor.to === line.to
      intervals.push(fullLine
        ? { from: Math.max(0, cursor.from - 1), to: Math.min(doc.length, cursor.to + 1) }
        : { from: cursor.from, to: cursor.to })
    }
    cursor.next()
  }
  if (!intervals.length) return RangeSet.empty

  intervals.sort((a, b) => a.from - b.from || a.to - b.to)
  const merged: Array<{ from: number, to: number }> = []
  for (const interval of intervals) {
    const last = merged[merged.length - 1]
    // Strict overlap only: consecutive hidden/widget lines overlap by one
    // character across their shared newline and merge into one island, while
    // two blocks separated by an empty line merely touch at that position —
    // it must stay a valid stop or the empty line becomes unreachable.
    if (last && interval.from < last.to) {
      last.to = Math.max(last.to, interval.to)
    } else {
      merged.push({ ...interval })
    }
  }

  return RangeSet.of(merged.map(interval => atomicRangeMarker.range(interval.from, interval.to)), false)
}

const linkHandler = EditorView.domEventHandlers({
  click: (event, view) => {
    const target = event.target as Element | null
    const link = target?.closest?.('.md-live-link[data-href]') as HTMLElement | null
    const href = link?.dataset.href
    if (!href) return false
    event.preventDefault()
    view.dom.dispatchEvent(new CustomEvent('markdown-open-link', {
      bubbles: true,
      detail: { href },
    }))
    return true
  },
})

const codeBlockSyntaxCompletionHandler = Prec.highest(EditorView.domEventHandlers({
  keydown: (event, view) => {
    if (!isCodeBlockCompletionKey(event) || view.state.selection.ranges.length !== 1) return false
    if (view.state.facet(EditorState.readOnly)) return false

    const selection = view.state.selection.main
    if (!selection.empty) return false

    const doc = view.state.doc
    const line = doc.lineAt(selection.head)
    if (selection.head !== line.to) return false

    const fence = parseCompletableFenceLine(line.text)
    if (!fence || !isOpeningFenceLine(doc, line.number)) return false
    if (hasAdjacentClosingFence(doc, line.number, fence)) return false

    const insert = `\n\n${fence.indent}${fence.marker}`
    event.preventDefault()
    event.stopPropagation()
    view.dispatch({
      changes: { from: line.to, insert },
      selection: { anchor: line.to + 1 },
      scrollIntoView: true,
    })
    return true
  },
}))

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
    })
    return true
  },
}))

const orderedListExistingMarkerSplitHandler = Prec.highest(EditorView.domEventHandlers({
  keydown: (event, view) => {
    if (!isPlainEnterKey(event) || view.state.selection.ranges.length !== 1) return false
    if (view.state.facet(EditorState.readOnly)) return false

    const edit = existingOrderedListMarkerSplit(view)
    if (!edit) return false

    event.preventDefault()
    event.stopPropagation()
    view.dispatch({
      changes: { from: edit.from, to: edit.position, insert: '\n' },
      selection: { anchor: edit.from + 1 },
      scrollIntoView: true,
    })
    return true
  },
}))

function hiddenSyntaxDeleteHandler(features: Required<MarkdownLivePreviewFeatures>): Extension {
  return EditorView.domEventHandlers({
    keydown: (event, view) => {
      if (
        (event.key !== 'Backspace' && event.key !== 'Delete') ||
        event.isComposing ||
        view.state.facet(EditorState.readOnly) ||
        view.state.selection.main.empty === false
      ) {
        return false
      }

      const removed = deleteHiddenLineMarker(view, event.key, features) ||
        (features.codeBlocks && deleteEmptyFencedCodeBlock(view)) ||
        (features.codeBlocks && unwrapHiddenFenceSyntax(view, event.key)) ||
        deleteHiddenEmojiSyntax(view, event.key) ||
        unwrapHiddenInlineSyntax(view, event.key, features)
      if (!removed) return false
      event.preventDefault()
      event.stopPropagation()
      return true
    },
  })
}

function existingOrderedListMarkerSplit(view: EditorView): { from: number; position: number } | null {
  const selection = view.state.selection.main
  if (!selection.empty) return null

  const position = selection.head
  const doc = view.state.doc
  const line = doc.lineAt(position)
  if (position <= line.from || position >= line.to) return null
  if (isLineInFencedCodeContent(doc, line.number)) return null

  const info = analyzeMarkdownLivePreviewLine(line.text, false)
  if (info.kind !== 'ordered-list' || !info.markerLength) return null
  if (position <= line.from + info.markerLength) return null

  const beforeContent = line.text.slice(info.markerLength, position - line.from)
  if (!beforeContent.trim()) return null

  const afterContent = line.text.slice(position - line.from)
  if (!/^\d+[.)][ \t]+/.test(afterContent)) return null

  let from = position
  while (from > line.from + info.markerLength && /[ \t]/.test(doc.sliceString(from - 1, from))) {
    from -= 1
  }

  return { from, position }
}

interface CompletableFenceLine {
  indent: string
  marker: string
  markerChar: '`' | '~'
}

function isPlainEnterKey(event: KeyboardEvent): boolean {
  return event.key === 'Enter' &&
    !event.shiftKey &&
    !event.altKey &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.isComposing
}

function isCodeBlockCompletionKey(event: KeyboardEvent): boolean {
  return isPlainEnterKey(event)
}

function parseCompletableFenceLine(text: string): CompletableFenceLine | null {
  const match = text.match(/^(\s*)((`{3,}|~{3,}))(.*)$/)
  if (!match) return null
  const marker = match[2]
  const markerChar = marker[0] as '`' | '~'
  const info = (match[4] || '').trim()
  if (markerChar === '`' && info.includes('`')) return null
  if (info && !/^[\w.+#-]+$/.test(info)) return null
  return {
    indent: match[1],
    marker,
    markerChar,
  }
}

function isOpeningFenceLine(doc: EditorView['state']['doc'], lineNumber: number): boolean {
  return markdownFenceStateAtLine(doc, lineNumber) === null
}

function hasAdjacentClosingFence(
  doc: EditorView['state']['doc'],
  lineNumber: number,
  fence: CompletableFenceLine,
): boolean {
  if (lineNumber >= doc.lines) return false
  const nextLine = doc.line(lineNumber + 1).text.trim()
  if (!nextLine || nextLine[0] !== fence.markerChar) return false
  if (nextLine.length < fence.marker.length) return false
  return [...nextLine].every(char => char === fence.markerChar)
}

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
  let fence: MarkdownFenceState | null = null

  for (let lineNumber = 1; lineNumber <= doc.lines; lineNumber += 1) {
    const line = doc.line(lineNumber)

    if (!fence) {
      fence = markdownFenceOpening(line.text)
      if (fence) openingLine = line
      continue
    }

    if (!markdownFenceClosing(line.text, fence) || !openingLine) continue

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
    fence = null
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

function deleteHiddenLineMarker(
  view: EditorView,
  key: 'Backspace' | 'Delete',
  features: Required<MarkdownLivePreviewFeatures>,
): boolean {
  const position = view.state.selection.main.head
  const doc = view.state.doc
  const line = doc.lineAt(position)
  if (isLineInFencedCodeContent(doc, line.number)) return false
  const info = analyzeMarkdownLivePreviewLine(line.text, false)
  if (info.kind === 'task' && !features.tasks) return false
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

interface MarkdownFenceState {
  markerChar: '`' | '~'
  markerLength: number
}

const FENCE_MARKER_RE = /^\s*(`{3,}|~{3,})(.*)$/

function markdownFenceOpening(text: string): MarkdownFenceState | null {
  const match = text.match(FENCE_MARKER_RE)
  if (!match) return null
  const markerChar = match[1][0] as '`' | '~'
  // CommonMark: a backtick fence cannot carry backticks in its info string.
  if (markerChar === '`' && match[2].includes('`')) return null
  return { markerChar, markerLength: match[1].length }
}

function markdownFenceClosing(text: string, fence: MarkdownFenceState): boolean {
  const match = text.match(FENCE_MARKER_RE)
  if (!match) return false
  return match[1][0] === fence.markerChar
    && match[1].length >= fence.markerLength
    && match[2].trim() === ''
}

// Fence state just before the given line: null when outside a fence,
// otherwise the marker of the still-open fence.
function markdownFenceStateAtLine(doc: EditorView['state']['doc'], lineNumber: number): MarkdownFenceState | null {
  let fence: MarkdownFenceState | null = null
  for (let number = 1; number < lineNumber; number += 1) {
    const text = doc.line(number).text
    if (fence) {
      if (markdownFenceClosing(text, fence)) fence = null
    } else {
      fence = markdownFenceOpening(text)
    }
  }
  return fence
}

// True only for content lines strictly inside a *closed* fenced block.
function isLineInFencedCodeContent(doc: EditorView['state']['doc'], lineNumber: number): boolean {
  const fence = markdownFenceStateAtLine(doc, lineNumber)
  if (!fence) return false
  if (markdownFenceClosing(doc.line(lineNumber).text, fence)) return false
  for (let number = lineNumber + 1; number <= doc.lines; number += 1) {
    if (markdownFenceClosing(doc.line(number).text, fence)) return true
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

function unwrapHiddenInlineSyntax(
  view: EditorView,
  key: 'Backspace' | 'Delete',
  features: Required<MarkdownLivePreviewFeatures>,
): boolean {
  const position = view.state.selection.main.head
  const line = view.state.doc.lineAt(position)
  const wrapper = inlineWrapperRanges(line.text, line.from, features).find((range) => {
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

function inlineWrapperRanges(
  text: string,
  lineFrom: number,
  features: Required<MarkdownLivePreviewFeatures>,
): InlineWrapperRange[] {
  const ranges = [
    ...delimitedRanges(text, lineFrom, STRONG_RE, 2, 2, 2),
    ...delimitedRanges(text, lineFrom, ITALIC_RE, 1, 1, 2),
    ...delimitedRanges(text, lineFrom, INLINE_CODE_RE, 1, 1),
    ...delimitedRanges(text, lineFrom, STRIKETHROUGH_RE, 2, 2),
    ...delimitedRanges(text, lineFrom, UNDERLINE_RE, 3, 4),
    ...linkRanges(text, lineFrom),
  ]
  if (features.math) ranges.push(...mathRanges(text, lineFrom))
  return ranges.sort((a, b) => a.from - b.from || b.to - a.to)
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
  '&': {
    '--md-live-code-padding-x': `${CODE_BLOCK_PADDING_X}px`,
    '--md-live-code-padding-x-total': `${CODE_BLOCK_PADDING_X * 2}px`,
    '--md-live-code-fold-gutter-width': `${CODE_BLOCK_FOLD_GUTTER_WIDTH}px`,
    '--md-live-code-padding-y': `${CODE_BLOCK_PADDING_Y}px`,
    '--md-live-code-bg': 'color-mix(in srgb, var(--editor-text, var(--ui-text-primary-fg)) 9%, transparent)',
  },
  '.cm-scroller': {
    overflowAnchor: 'none',
  },
  '.md-live-line': {
    transition: 'background-color 120ms ease',
  },
  '.md-live-source-revealed': {
    color: 'var(--ui-text-muted-fg)',
    fontFamily: 'var(--font-sans)',
    fontSize: 'var(--editor-font-size, 15px)',
    fontStyle: 'normal',
    fontWeight: '400',
    lineHeight: 'inherit',
    textDecoration: 'none !important',
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
  '.md-live-setext-list-typing, .md-live-setext-list-typing span': {
    color: 'var(--editor-text, var(--ui-text-primary-fg)) !important',
    fontWeight: 'inherit !important',
    textDecoration: 'none !important',
  },
  '.md-live-task': {
    color: 'var(--editor-text, var(--ui-text-primary-fg))',
  },
  '.md-live-task-done': {
    color: 'var(--ui-text-muted-fg)',
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
    // Center anchor calibrated against the first-row text center (em-scaled
    // so it tracks the editor font size); 50% of the 1em slot sat ~2.4px low.
    top: '0.365em',
    transform: 'translateY(-50%)',
    '--app-button-height': '16px',
    '--app-button-min-width': '16px',
    '--app-button-padding-x': '0',
    '--app-button-gap': '0',
    '--app-button-fill': 'color-mix(in srgb, var(--editor-text, var(--ui-editor-text-fg)) 5%, transparent)',
    '--app-button-hover-fill': 'color-mix(in srgb, var(--editor-text, var(--ui-editor-text-fg)) 9%, transparent)',
    '--app-button-border': 'color-mix(in srgb, var(--editor-text, var(--ui-editor-text-fg)) 42%, var(--ui-border-default-border))',
    '--app-button-hover-border': 'color-mix(in srgb, var(--editor-text, var(--ui-editor-text-fg)) 62%, var(--ui-border-default-border))',
    '--app-button-shadow': 'none',
    '--app-button-hover-shadow': 'none',
    width: '16px !important',
    minWidth: '16px !important',
    height: '16px !important',
    minHeight: '16px !important',
    margin: '0 !important',
    padding: '0 !important',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '1px solid var(--app-button-border)',
    borderRadius: '5px',
    color: 'var(--ui-action-primary-fg)',
    background: 'var(--app-button-fill)',
    cursor: 'pointer',
  },
  '.md-live-task-checkbox.checked': {
    '--app-button-fill': 'var(--ui-accent-primary-fg)',
    '--app-button-hover-fill': 'var(--ui-accent-primary-fg)',
    '--app-button-border': 'var(--ui-accent-primary-fg)',
    '--app-button-hover-border': 'var(--ui-accent-primary-fg)',
    borderColor: 'var(--app-button-border)',
    background: 'var(--app-button-fill)',
  },
  '.md-live-task-checkbox .app-button-content': {
    display: 'none',
  },
  '.md-live-task-checkbox.checked::after': {
    content: '"✓"',
    fontSize: '11px',
    fontWeight: '700',
    lineHeight: '1',
  },
  '.md-live-list-marker-widget': {
    minWidth: '1.35em',
    marginRight: '0.35em',
    display: 'inline-flex',
    justifyContent: 'center',
    color: 'var(--ui-text-muted-fg)',
  },
  '.md-live-hidden-source-widget': {
    display: 'inline-block',
    width: '0',
    height: '0',
    overflow: 'hidden',
  },
  '.md-live-fold-hidden': {
    height: '0 !important',
    minHeight: '0 !important',
    paddingTop: '0 !important',
    paddingBottom: '0 !important',
    lineHeight: '0 !important',
    overflow: 'hidden',
  },
  '.md-live-fold-button': {
    appearance: 'none',
    boxSizing: 'border-box',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '18px',
    minWidth: '18px',
    height: '18px',
    minHeight: '18px',
    padding: '0',
    border: '0',
    borderRadius: '4px',
    color: 'color-mix(in srgb, var(--ui-text-muted-fg) 76%, transparent)',
    background: 'transparent',
    boxShadow: 'none',
    fontFamily: 'var(--font-sans, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif)',
    fontSize: '12px',
    fontWeight: '700',
    lineHeight: '1',
    cursor: 'pointer',
    opacity: '0.74',
    userSelect: 'none',
    transition: 'background-color 120ms ease, color 120ms ease, opacity 120ms ease',
  },
  '.md-live-fold-button:hover': {
    color: 'var(--ui-text-primary-fg)',
    background: 'color-mix(in srgb, var(--ui-accent-primary-fg) 10%, transparent)',
    opacity: '1',
  },
  '.md-live-fold-button:focus-visible': {
    outline: '1px solid color-mix(in srgb, var(--ui-accent-primary-fg) 62%, transparent)',
    outlineOffset: '1px',
    color: 'var(--ui-text-primary-fg)',
    background: 'color-mix(in srgb, var(--ui-accent-primary-fg) 10%, transparent)',
    opacity: '1',
  },
  '.md-live-fold-button:active': {
    transform: 'translateY(1px)',
  },
  '.md-live-codeblock-fold-summary-line': {
    position: 'relative',
    minHeight: '30px',
    marginTop: '0.45em',
    marginBottom: '0.45em',
    paddingLeft: 'calc(var(--md-live-code-padding-x) + var(--md-live-code-fold-gutter-width)) !important',
    paddingRight: 'var(--md-live-code-padding-x) !important',
    paddingTop: '5px !important',
    paddingBottom: '5px !important',
    backgroundColor: 'color-mix(in srgb, var(--editor-text, var(--ui-text-primary-fg)) 4%, transparent)',
    borderRadius: '7px',
    boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--ui-text-muted-fg) 10%, transparent)',
  },
  '.md-live-codeblock-fold-summary-line .md-live-fold-summary': {
    maxWidth: 'calc(100% - 90px)',
    minHeight: '20px',
    marginLeft: '0',
    marginRight: '90px',
    padding: '1px 0',
    border: '0',
    borderRadius: '0',
    color: 'var(--ui-text-muted-fg)',
    background: 'transparent',
    boxShadow: 'none',
    appearance: 'none',
  },
  '.md-live-codeblock-fold-summary-line .md-live-fold-summary:hover': {
    color: 'var(--ui-text-muted-fg)',
    background: 'transparent',
  },
  '.md-live-fold-summary': {
    display: 'inline-flex',
    alignItems: 'center',
    maxWidth: '100%',
    minHeight: '24px',
    padding: '1px 8px',
    border: '0',
    borderRadius: '4px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    color: 'var(--ui-text-muted-fg)',
    background: 'color-mix(in srgb, var(--editor-text, var(--ui-text-primary-fg)) 5%, transparent)',
    font: 'inherit',
    cursor: 'default',
  },
  '.md-live-fold-summary:hover': {
    color: 'var(--ui-text-muted-fg)',
  },
  '.md-live-empty-structure-caret-anchor': {
    display: 'inline-block',
    width: '0',
    minWidth: '0',
    height: '0',
    overflow: 'hidden',
    verticalAlign: 'baseline',
  },
  '.md-live-blockquote': {
    paddingLeft: '10px !important',
    borderLeft: '3px solid var(--ui-border-default-border)',
    color: 'var(--ui-text-muted-fg)',
  },
  '.md-live-code': {
    position: 'relative',
    paddingLeft: 'calc(var(--md-live-code-padding-x) + var(--md-live-code-fold-gutter-width)) !important',
    paddingRight: 'var(--md-live-code-padding-x) !important',
    backgroundColor: 'var(--md-live-code-bg)',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    fontSize: '0.76em',
    lineHeight: '1.55',
  },
  '.md-live-fence': {
    color: 'var(--ui-text-muted-fg)',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  },
  '.md-live-codeblock-first': {
    position: 'relative',
    marginTop: '0.45em',
    paddingTop: 'var(--md-live-code-padding-y) !important',
    paddingRight: 'calc(var(--md-live-code-padding-x) + 84px) !important',
    borderTopLeftRadius: '10px',
    borderTopRightRadius: '10px',
  },
  '.md-live-codeblock-last': {
    paddingRight: 'calc(var(--md-live-code-padding-x) + 96px) !important',
    paddingBottom: 'calc(var(--md-live-code-padding-y) + 2px) !important',
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
  '.md-live-codeblock-topbar': {
    position: 'absolute',
    top: '4px',
    left: 'var(--md-live-code-padding-x)',
    right: 'var(--md-live-code-padding-x)',
    zIndex: '2',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
    width: 'auto',
    maxWidth: 'calc(100% - var(--md-live-code-padding-x-total))',
    verticalAlign: 'middle',
    pointerEvents: 'none',
  },
  '.md-live-codeblock-actions': {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    marginLeft: 'auto',
    pointerEvents: 'auto',
  },
  '.md-live-codeblock-fold-toggle': {
    width: '18px',
    minWidth: '18px',
    height: '18px',
    minHeight: '18px',
    padding: '0',
    borderRadius: '4px',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'var(--font-sans, system-ui, sans-serif)',
    fontSize: '13px',
    fontWeight: '700',
    lineHeight: '1',
    pointerEvents: 'auto',
  },
  '.md-live-code-copy-button': {
    boxSizing: 'border-box',
    minHeight: '22px',
    padding: '1px 8px',
    border: '1px solid color-mix(in srgb, var(--ui-text-muted-fg) 28%, var(--ui-surface-elevated-bg))',
    borderRadius: '5px',
    color: 'var(--ui-text-muted-fg)',
    background: 'var(--ui-surface-elevated-bg)',
    boxShadow: '0 3px 10px rgba(0, 0, 0, 0.12)',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    fontSize: '11px',
    lineHeight: '1.3',
    cursor: 'pointer',
  },
  '.md-live-code-copy-button:hover': {
    color: 'var(--ui-text-primary-fg)',
    borderColor: 'var(--ui-accent-primary-fg)',
    background: 'color-mix(in srgb, var(--ui-accent-primary-fg) 8%, var(--ui-surface-elevated-bg))',
  },
  '.md-live-codeblock-footer': {
    position: 'absolute',
    right: 'var(--md-live-code-padding-x)',
    bottom: '4px',
    zIndex: '2',
    display: 'inline-flex',
    justifyContent: 'flex-end',
    width: 'auto',
    maxWidth: 'calc(100% - var(--md-live-code-padding-x-total))',
    verticalAlign: 'middle',
    pointerEvents: 'none',
  },
  '.md-live-code-language-input': {
    width: '10ch',
    maxWidth: '34vw',
    minHeight: '18px',
    padding: '0 4px',
    border: '1px solid transparent',
    borderRadius: '4px',
    outline: 'none',
    color: 'var(--ui-text-muted-fg)',
    background: 'transparent',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    fontSize: '11px',
    lineHeight: '1.25',
    textAlign: 'right',
    pointerEvents: 'auto',
  },
  '.md-live-code-language-input:hover, input.md-live-code-language-input:focus': {
    color: 'var(--ui-text-primary-fg)',
    borderColor: 'var(--ui-accent-primary-fg)',
    background: 'color-mix(in srgb, var(--ui-accent-primary-fg) 9%, transparent)',
  },
  '.md-live-code-keyword': {
    color: 'var(--ui-accent-primary-fg)',
    fontWeight: '600',
  },
  '.md-live-code-type': {
    color: 'color-mix(in srgb, var(--editor-text, var(--ui-text-primary-fg)) 56%, transparent)',
  },
  '.md-live-code-string': {
    color: 'var(--ui-status-success-fg, var(--color-success))',
  },
  '.md-live-code-number': {
    color: 'var(--ui-status-warning-fg, var(--color-warning))',
  },
  '.md-live-code-comment': {
    color: 'var(--ui-text-muted-fg)',
    fontStyle: 'italic',
  },
  '.md-live-table': {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    color: 'var(--editor-text, var(--ui-text-primary-fg))',
    backgroundColor: 'color-mix(in srgb, var(--ui-surface-elevated-bg) 72%, transparent)',
  },
  '.md-live-table-block-line': {
    paddingTop: '4px !important',
    paddingBottom: '4px !important',
    backgroundColor: 'transparent',
  },
  '.md-live-table-widget': {
    boxSizing: 'border-box',
    display: 'inline-grid',
    gridTemplateColumns: 'repeat(var(--md-live-table-columns), minmax(6ch, max-content))',
    maxWidth: '100%',
    overflowX: 'auto',
    verticalAlign: 'middle',
    border: '1px solid var(--ui-border-default-border)',
    borderRadius: '7px',
    background: 'color-mix(in srgb, var(--ui-surface-elevated-bg) 72%, transparent)',
    boxShadow: '0 1px 0 rgba(0, 0, 0, 0.03)',
  },
  '.md-live-table-row': {
    display: 'inline-grid',
    gridAutoColumns: 'minmax(6ch, auto)',
    gridAutoFlow: 'column',
    gap: '0',
    maxWidth: '100%',
    verticalAlign: 'middle',
    border: '1px solid var(--ui-border-default-border)',
    borderRadius: '5px',
    overflow: 'hidden',
  },
  '.md-live-table-row.separator': {
    width: '100%',
    height: '1px',
    display: 'inline-block',
    border: '0',
    borderRadius: '0',
    backgroundColor: 'var(--ui-border-default-border)',
  },
  '.md-live-table-cell': {
    minWidth: '6ch',
    padding: '0',
    borderRight: '1px solid var(--ui-border-default-border)',
    borderBottom: '1px solid var(--ui-border-default-border)',
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
    lineHeight: '1.45',
    display: 'flex',
    alignItems: 'stretch',
  },
  '.md-live-table-cell.header': {
    fontWeight: '600',
    background: 'color-mix(in srgb, var(--editor-text, var(--ui-text-primary-fg)) 4%, transparent)',
  },
  '.md-live-table-cell.last-col, .md-live-table-cell:last-child': {
    borderRight: '0',
  },
  '.md-live-table-cell.last-row': {
    borderBottom: '0',
  },
  '.md-live-table-cell-input': {
    boxSizing: 'border-box',
    width: '100%',
    minWidth: '6ch',
    maxWidth: '56ch',
    minHeight: '28px',
    padding: '3px 9px',
    border: '1px solid transparent',
    borderRadius: '0',
    outline: 'none',
    color: 'inherit',
    background: 'transparent',
    font: 'inherit',
    lineHeight: '1.45',
  },
  '.md-live-table-cell-input:hover': {
    background: 'color-mix(in srgb, var(--ui-accent-primary-fg) 5%, transparent)',
  },
  'input.md-live-table-cell-input:focus': {
    borderColor: 'color-mix(in srgb, var(--ui-accent-primary-fg) 56%, transparent)',
    background: 'color-mix(in srgb, var(--ui-accent-primary-fg) 8%, var(--ui-surface-elevated-bg))',
    boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--ui-accent-primary-fg) 28%, transparent)',
  },
  '.md-live-frontmatter-line': {
    paddingTop: '4px !important',
    paddingBottom: '4px !important',
    backgroundColor: 'transparent',
  },
  '.md-live-frontmatter-widget': {
    boxSizing: 'border-box',
    display: 'inline-flex',
    flexDirection: 'column',
    gap: '5px',
    width: 'min(100%, 680px)',
    maxWidth: '100%',
    padding: '8px 10px',
    border: '1px solid color-mix(in srgb, var(--ui-text-muted-fg) 22%, transparent)',
    borderRadius: '7px',
    verticalAlign: 'middle',
    color: 'var(--editor-text, var(--ui-text-primary-fg))',
    background: 'color-mix(in srgb, var(--ui-surface-elevated-bg) 78%, transparent)',
    boxShadow: '0 1px 0 rgba(0, 0, 0, 0.03)',
    fontFamily: 'var(--font-sans, system-ui, sans-serif)',
  },
  '.md-live-frontmatter-header': {
    display: 'inline-flex',
    alignItems: 'center',
    width: 'fit-content',
    minHeight: '18px',
    padding: '0 6px',
    borderRadius: '4px',
    color: 'var(--ui-text-muted-fg)',
    background: 'color-mix(in srgb, var(--editor-text, var(--ui-text-primary-fg)) 5%, transparent)',
    fontSize: '11px',
    fontWeight: '600',
    lineHeight: '1.4',
  },
  '.md-live-frontmatter-textarea': {
    boxSizing: 'border-box',
    width: '100%',
    minHeight: '28px',
    maxHeight: '180px',
    padding: '3px 6px',
    border: '1px solid transparent',
    borderRadius: '5px',
    outline: 'none',
    resize: 'vertical',
    color: 'var(--editor-text, var(--ui-text-primary-fg))',
    background: 'transparent',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    fontSize: '0.78em',
    lineHeight: '1.45',
  },
  '.md-live-frontmatter-textarea:hover': {
    background: 'color-mix(in srgb, var(--ui-accent-primary-fg) 4%, transparent)',
  },
  'textarea.md-live-frontmatter-textarea:focus': {
    borderColor: 'color-mix(in srgb, var(--ui-accent-primary-fg) 54%, transparent)',
    background: 'color-mix(in srgb, var(--ui-accent-primary-fg) 7%, var(--ui-surface-elevated-bg))',
    boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--ui-accent-primary-fg) 24%, transparent)',
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
    backgroundColor: 'var(--ui-border-default-border)',
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
    backgroundColor: 'color-mix(in srgb, var(--ui-text-muted-fg) 15%, transparent)',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    fontSize: '0.92em',
  },
  '.md-live-link': {
    color: 'var(--ui-accent-primary-fg)',
    textDecoration: 'underline',
    textUnderlineOffset: '2px',
  },
  '.md-live-image-widget': {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '30px',
    maxWidth: '100%',
    padding: '4px',
    border: '1px solid var(--ui-border-default-border)',
    borderRadius: '6px',
    color: 'var(--ui-accent-primary-fg)',
    background: 'color-mix(in srgb, var(--ui-surface-elevated-bg) 78%, transparent)',
    font: 'inherit',
    cursor: 'pointer',
  },
  '.md-live-asset-frame': {
    display: 'inline-flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: '4px',
    maxWidth: '100%',
    position: 'relative',
    verticalAlign: 'middle',
  },
  '.md-live-asset-frame.collapsed': {
    display: 'inline-flex',
    flexDirection: 'row',
    alignItems: 'center',
    maxWidth: 'min(100%, 60ch)',
    minWidth: '0',
    lineHeight: '1.35',
  },
  '.md-live-image-widget[data-asset-kind="image"]': {
    padding: '0',
    border: '0',
    background: 'transparent',
  },
  '.md-live-image-preview': {
    maxWidth: 'min(100%, 520px)',
    maxHeight: '360px',
    display: 'block',
    borderRadius: '8px',
    boxShadow: '0 6px 20px rgba(0, 0, 0, 0.18)',
  },
  '.md-live-file-widget': {
    display: 'inline-flex',
    alignItems: 'center',
    minHeight: '26px',
    maxWidth: '100%',
    padding: '2px 8px',
    border: '1px solid var(--ui-border-default-border)',
    borderRadius: '6px',
    color: 'var(--ui-accent-primary-fg)',
    background: 'color-mix(in srgb, var(--ui-surface-elevated-bg) 78%, transparent)',
    font: 'inherit',
    cursor: 'pointer',
  },
  '.md-live-asset-collapsed-widget': {
    boxSizing: 'border-box',
    display: 'inline-flex',
    alignItems: 'center',
    width: '100%',
    maxWidth: '100%',
    minWidth: '0',
    minHeight: '24px',
    padding: '2px 46px 2px 30px',
    border: '0',
    borderRadius: '4px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    color: 'var(--ui-text-muted-fg)',
    background: 'color-mix(in srgb, var(--editor-text, var(--ui-text-primary-fg)) 4%, transparent)',
    font: 'inherit',
    fontSize: '0.92em',
    cursor: 'default',
  },
  '.md-live-asset-collapsed-widget:hover': {
    color: 'var(--ui-text-muted-fg)',
  },
  '.md-live-asset-fold-toggle': {
    position: 'absolute',
    top: '5px',
    left: '7px',
    zIndex: '2',
    opacity: '0',
    transition: 'opacity 120ms ease, color 120ms ease, border-color 120ms ease',
  },
  '.md-live-asset-frame:hover .md-live-asset-fold-toggle, .md-live-asset-frame:focus-within .md-live-asset-fold-toggle, .md-live-asset-frame.collapsed .md-live-asset-fold-toggle': {
    opacity: '1',
  },
  '.md-live-asset-frame.collapsed .md-live-asset-fold-toggle': {
    top: '3px',
    left: '6px',
  },
  '.md-live-asset-source-editor': {
    position: 'absolute',
    top: '0',
    left: '0',
    right: '0',
    zIndex: '3',
    display: 'block',
    maxWidth: '100%',
    width: '100%',
    pointerEvents: 'none',
  },
  '.md-live-asset-frame.collapsed .md-live-asset-source-editor': {
    top: '0',
    left: '0',
    right: '0',
    bottom: '0',
  },
  '.md-live-source-toggle': {
    boxSizing: 'border-box',
    position: 'absolute',
    top: '6px',
    right: '6px',
    zIndex: '2',
    minWidth: '28px',
    minHeight: '24px',
    padding: '1px 6px',
    border: '1px solid color-mix(in srgb, var(--ui-text-muted-fg) 32%, transparent)',
    borderRadius: '5px',
    color: 'var(--ui-text-muted-fg)',
    background: 'color-mix(in srgb, var(--ui-surface-elevated-bg) 88%, transparent)',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.14)',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    fontSize: '11px',
    lineHeight: '1.35',
    whiteSpace: 'nowrap',
    cursor: 'pointer',
    opacity: '0',
    pointerEvents: 'auto',
    transition: 'opacity 120ms ease, color 120ms ease, border-color 120ms ease',
  },
  '.md-live-asset-frame:hover .md-live-source-toggle, .md-live-asset-frame:focus-within .md-live-source-toggle': {
    opacity: '1',
  },
  '.md-live-asset-frame.collapsed .md-live-source-toggle': {
    top: '0',
    right: '2px',
    minWidth: '34px',
    minHeight: '24px',
    padding: '1px 5px',
    boxShadow: 'none',
    opacity: '0.72',
  },
  '.md-live-asset-frame.collapsed:hover .md-live-source-toggle, .md-live-asset-frame.collapsed:focus-within .md-live-source-toggle': {
    opacity: '1',
  },
  '.md-live-source-toggle:hover': {
    color: 'var(--ui-text-primary-fg)',
    borderColor: 'var(--ui-accent-primary-fg)',
    background: 'color-mix(in srgb, var(--ui-accent-primary-fg) 10%, var(--ui-surface-elevated-bg))',
  },
  '.md-live-source-input': {
    display: 'none',
    position: 'absolute',
    left: '0',
    top: '0',
    transform: 'translateY(calc(-100% - 6px))',
    width: 'min(100%, 58ch)',
    minHeight: '24px',
    padding: '2px 7px',
    border: '1px solid var(--ui-accent-primary-fg)',
    borderRadius: '5px',
    outline: 'none',
    color: 'var(--editor-text, var(--ui-text-primary-fg))',
    caretColor: 'var(--ui-editor-caret-fg)',
    background: 'var(--ui-surface-elevated-bg)',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    fontSize: '12px',
    lineHeight: '1.35',
    boxShadow: '0 8px 22px rgba(0, 0, 0, 0.18)',
    pointerEvents: 'auto',
  },
  '.md-live-asset-source-editor.editing .md-live-source-input': {
    display: 'block',
  },
  '.md-live-asset-source-editor.editing .md-live-source-toggle': {
    opacity: '1',
  },
  '.md-live-file-widget[data-asset-kind="missing"], .md-live-image-widget[data-asset-kind="missing"]': {
    color: 'var(--ui-status-warning-fg, var(--color-warning))',
    borderColor: 'var(--ui-status-warning-border, var(--color-warning))',
  },
  '.md-live-asset-label': {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  '.md-live-math': {
    padding: '0.05em 0.28em',
    borderRadius: '4px',
    color: 'var(--ui-accent-primary-fg)',
    backgroundColor: 'color-mix(in srgb, var(--ui-accent-primary-fg) 10%, transparent)',
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

export function markdownLivePreviewExtension(
  enabled: boolean,
  options: MarkdownLivePreviewOptions = {},
): Extension {
  const features = markdownLivePreviewFeatures(options)
  return enabled ? [
    markdownFoldState,
    markdownLivePreviewCursorLayer,
    orderedListExistingMarkerSplitHandler,
    features.codeBlocks ? codeBlockSelectAllHandler : [],
    features.codeBlocks ? codeBlockSyntaxCompletionHandler : [],
    markdownLivePreviewPlugin(options),
    linkHandler,
    hiddenSyntaxDeleteHandler(features),
    theme,
  ] : []
}
