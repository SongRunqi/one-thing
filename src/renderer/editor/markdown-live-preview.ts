import { syntaxTree } from '@codemirror/language'
import {
  EditorSelection,
  EditorState,
  Prec,
  StateEffect,
  StateField,
  type Extension,
  type Range,
} from '@codemirror/state'
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from '@codemirror/view'
import type { MarkdownAssetResolution } from '@shared/ipc/markdown'
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
const MATH_RE = /(?<!\\)(\${1,2})([^$\n]+?)\1/g
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
    button.disabled = view.state.facet(EditorState.readOnly)
    button.addEventListener('mousedown', (event) => {
      event.preventDefault()
    })
    button.addEventListener('click', (event) => {
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

    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'md-live-image-widget'
    button.title = this.src
    button.textContent = this.alt || displayTargetLabel(this.src)

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
    frame.append(button, assetSourceEditor(view, this.rawSource, this.from, this.to, 'Image Markdown source'))
    return frame
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

    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'md-live-file-widget'
    button.title = this.href
    button.textContent = this.label || displayTargetLabel(this.href)

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
    frame.append(button, assetSourceEditor(view, this.rawSource, this.from, this.to, 'File Markdown source'))
    return frame
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

  const toggle = document.createElement('button')
  toggle.type = 'button'
  toggle.className = 'md-live-source-toggle'
  toggle.title = label
  toggle.setAttribute('aria-label', label)
  toggle.setAttribute('aria-expanded', 'false')
  toggle.textContent = '</>'
  toggle.disabled = readOnly
  toggle.addEventListener('mousedown', event => event.preventDefault())
  toggle.addEventListener('click', (event) => {
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
  })

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

  wrap.append(toggle, input)
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
): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = ['md-live-fold-button', collapsed ? 'collapsed' : '', extraClass].filter(Boolean).join(' ')
  button.title = label
  button.setAttribute('aria-label', label)
  button.setAttribute('aria-expanded', String(!collapsed))
  button.dataset.foldState = collapsed ? 'collapsed' : 'expanded'
  button.textContent = collapsed ? '▸' : '▾'
  button.addEventListener('mousedown', event => event.preventDefault())
  button.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    toggleMarkdownFold(view, foldKey, button)
  })
  return button
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

  toDOM(view: EditorView): HTMLElement {
    const toolbar = document.createElement('span')
    toolbar.className = 'md-live-codeblock-topbar'
    toolbar.append(foldToggleButton(view, this.foldKey, this.collapsed, this.collapsed ? 'Show code block' : 'Collapse code block', 'md-live-codeblock-fold-toggle'))

    const actions = document.createElement('span')
    actions.className = 'md-live-codeblock-actions'

    const copy = document.createElement('button')
    copy.type = 'button'
    copy.className = 'md-live-code-copy-button'
    copy.title = 'Copy code'
    copy.textContent = 'Copy'
    copy.addEventListener('mousedown', event => event.preventDefault())
    copy.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      void copyText(this.code).then((ok) => {
        copy.textContent = ok ? 'Copied' : 'Copy failed'
        window.setTimeout(() => {
          if (copy.isConnected) copy.textContent = 'Copy'
        }, 900)
      })
    })

    actions.append(copy)
    toolbar.append(actions)
    return toolbar
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
        input.size = Math.max(6, Math.min(48, input.value.length + 1))
        input.spellcheck = false
        input.readOnly = readOnly
        input.setAttribute('aria-label', `Table ${row.header ? 'header' : 'cell'} ${rowIndex + 1}, ${columnIndex + 1}`)

        const originalValue = input.value
        let committed = false
        const commit = () => {
          if (committed) return
          const nextValue = input.value
          input.size = Math.max(6, Math.min(48, nextValue.length + 1))
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
          input.size = Math.max(6, Math.min(48, input.value.length + 1))
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

  constructor(
    view: EditorView,
    private readonly options: MarkdownLivePreviewOptions = {},
  ) {
    this.decorations = buildMarkdownDecorations(view, this.options)
    this.scheduleEmptyCodeBlockNormalization(view)
  }

  update(update: ViewUpdate): void {
    const foldsChanged = update.transactions.some(transaction =>
      transaction.effects.some(effect => effect.is(toggleMarkdownFoldEffect)),
    )
    const selectionChangesScanRange = update.selectionSet &&
      update.view.state.doc.lines > (this.options.fullScanLineLimit ?? FULL_SCAN_LINE_LIMIT)
    if (
      update.docChanged ||
      selectionChangesScanRange ||
      update.viewportChanged ||
      foldsChanged
    ) {
      this.decorations = buildMarkdownDecorations(update.view, this.options)
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

function markdownLivePreviewFeatures(options: MarkdownLivePreviewOptions): Required<MarkdownLivePreviewFeatures> {
  return {
    ...DEFAULT_MARKDOWN_LIVE_PREVIEW_FEATURES,
    ...(options.features || {}),
  }
}

const hiddenHeadingCaretFilter = EditorState.transactionFilter.of((transaction) => {
  const normalized = normalizeHiddenHeadingSelection(transaction.newDoc, transaction.newSelection)
  if (!normalized) return transaction
  return [
    transaction,
    { selection: normalized, sequential: true },
  ]
})

function normalizeHiddenHeadingSelection(
  doc: EditorState['doc'],
  selection: EditorSelection,
): EditorSelection | null {
  let changed = false
  const ranges = selection.ranges.map((range) => {
    if (!range.empty) return range
    const target = visibleHeadingStartAtPosition(doc, range.head)
    if (target == null || target === range.head) return range
    changed = true
    return EditorSelection.cursor(target, range.assoc, range.bidiLevel ?? undefined, range.goalColumn)
  })

  return changed ? EditorSelection.create(ranges, selection.mainIndex) : null
}

function visibleHeadingStartAtPosition(doc: EditorState['doc'], position: number): number | null {
  const safePosition = Math.max(0, Math.min(position, doc.length))
  const line = doc.lineAt(safePosition)
  const heading = line.text.match(HEADING_RE)
  if (!heading) return null

  const visibleStart = line.from + heading[1].length + heading[2].length + heading[3].length
  if (safePosition >= line.from && safePosition < visibleStart) return visibleStart
  return null
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
          ranges.push(Decoration.replace({
            widget: new EmptyStructureCaretWidget(),
            inclusive: false,
          }).range(from, whitespaceTo))
          return
        }

        if (name === 'ListMark') {
          const line = doc.lineAt(from)
          if (!isRenderableListLine(line.text)) return
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
          return
        }

        if (name === 'QuoteMark') {
          const line = doc.lineAt(from)
          if (!isRenderableBlockquoteLine(line.text)) return
          const markerTo = Math.min(line.to, to + trailingWhitespaceLength(line.text.slice(to - line.from)))
          ranges.push(Decoration.line({ class: 'md-live-line md-live-blockquote' }).range(line.from))
          ranges.push(Decoration.replace({
            widget: markerTo >= line.to ? new EmptyStructureCaretWidget() : undefined,
            inclusive: false,
          }).range(from, markerTo))
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
          ranges.push(Decoration.replace({
            widget: new HorizontalRuleWidget(),
            inclusive: false,
          }).range(from, to))
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
    let inFence = isLineInFencedCodeContent(view.state.doc, scanRange.from)

    for (let lineNumber = scanRange.from; lineNumber <= scanRange.to; lineNumber += 1) {
      const line = view.state.doc.line(lineNumber)
      if (frontMatter && lineNumber >= frontMatter.openingLineNumber && lineNumber <= frontMatter.closingLineNumber) {
        continue
      }
      const lineInFence = inFence
      const isFence = FENCE_RE.test(line.text)
      const info = analyzeMarkdownLivePreviewLine(line.text, lineInFence)
      const tableLine = tableLines.get(lineNumber)

      if (features.tables && tableLine) {
        addTableBlockDecoration(ranges, line.from, line.to, tableLine)
        continue
      }

      if (features.tasks) addTaskDecoration(ranges, line.from, line.to, line.text, info)
      if (features.tables) addTableDecoration(ranges, line.from, line.to, line.text, info)
      if (info.kind !== 'table' && info.kind !== 'code' && info.kind !== 'fence') {
        if (features.math) addMathDecorations(ranges, line.from, line.text)
        addInlineFallbackDecorations(ranges, line.from, line.text)
        if (features.images) addObsidianLinkDecorations(ranges, line.from, line.text, options, folded)
        addEmojiDecorations(ranges, line.from, line.text)
      }

      if (isFence) inFence = !inFence
    }
  }
}

function collectMarkdownFrontMatterBlock(doc: EditorState['doc']): MarkdownFrontMatterBlock | null {
  if (doc.lines < 2) return null
  const openingLine = doc.line(1)
  if (!FRONT_MATTER_OPEN_RE.test(openingLine.text)) return null

  for (let lineNumber = 2; lineNumber <= doc.lines; lineNumber += 1) {
    const line = doc.line(lineNumber)
    if (!FRONT_MATTER_CLOSE_RE.test(line.text)) continue
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
  addReplaceOrWidgetDecoration(ranges, openingLine.from, openingLine.to, new MarkdownFrontMatterWidget(block))

  for (let lineNumber = block.openingLineNumber + 1; lineNumber <= block.closingLineNumber; lineNumber += 1) {
    const line = doc.line(lineNumber)
    ranges.push(Decoration.line({ class: 'md-live-line md-live-frontmatter-hidden md-live-fold-hidden' }).range(line.from))
    addReplaceOrWidgetDecoration(ranges, line.from, line.to, new EmptyMarkdownWidget())
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

function addTableBlockDecoration(
  ranges: Range<Decoration>[],
  lineFrom: number,
  lineTo: number,
  state: MarkdownTableLineState,
): void {
  if (state.role === 'block' && state.block) {
    ranges.push(Decoration.line({ class: 'md-live-line md-live-table md-live-table-block-line' }).range(lineFrom))
    addReplaceOrWidgetDecoration(ranges, lineFrom, lineTo, new MarkdownTableBlockWidget(state.block))
    return
  }

  ranges.push(Decoration.line({ class: 'md-live-line md-live-table-hidden md-live-fold-hidden' }).range(lineFrom))
  addReplaceOrWidgetDecoration(ranges, lineFrom, lineTo, new EmptyMarkdownWidget())
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
  const foldKey = markdownFoldKey('code', startLine.from, `${startLine.text}\n${endLine.number - startLine.number}\n${code.slice(0, 240)}`)
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
      ranges.push(Decoration.line({ class: 'md-live-line md-live-fence md-live-codeblock-fence-hidden' }).range(line.from))
      addReplaceOrWidgetDecoration(ranges, line.from, line.to, new EmptyMarkdownWidget())
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
          ranges,
          line.from,
          line.to,
          new CodeBlockFoldSummaryWidget(parsed.language, contentLineCount),
        )
      } else {
        ranges.push(Decoration.line({ class: 'md-live-line md-live-fold-hidden' }).range(line.from))
        addReplaceOrWidgetDecoration(ranges, line.from, line.to, new EmptyMarkdownWidget())
      }
      continue
    }

    if (isClosingFence) {
      ranges.push(Decoration.line({ class: 'md-live-line md-live-fence md-live-codeblock-fence-hidden' }).range(line.from))
      addReplaceOrWidgetDecoration(ranges, line.from, line.to, new EmptyMarkdownWidget())
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
  ranges: Range<Decoration>[],
  from: number,
  to: number,
  widget: WidgetType,
): void {
  if (from < to) {
    ranges.push(Decoration.replace({
      widget,
      inclusive: false,
    }).range(from, to))
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
  options: MarkdownLivePreviewOptions,
  folded: ReadonlySet<string>,
): void {
  const parts = parseLinkParts(view.state.doc.sliceString(from, to), from, true)
  if (!parts?.url) return
  const alt = view.state.doc.sliceString(parts.labelFrom, parts.labelTo)
  const rawSource = view.state.doc.sliceString(from, to)
  if (!shouldRenderMarkdownImageTarget(parts.url)) {
    ranges.push(Decoration.replace({
      widget: new MarkdownFileWidget(alt || displayTargetLabel(parts.url), parts.url, rawSource, from, to, options),
      inclusive: false,
    }).range(from, to))
    return
  }
  const foldKey = markdownAssetFoldKey(rawSource)
  ranges.push(Decoration.replace({
    widget: new MarkdownImageWidget(alt, parts.url, rawSource, from, to, foldKey, folded.has(foldKey), options),
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

function addObsidianLinkDecorations(
  ranges: Range<Decoration>[],
  lineFrom: number,
  text: string,
  options: MarkdownLivePreviewOptions,
  folded: ReadonlySet<string>,
): void {
  const inlineCodeRanges = collectInlineCodeRanges(text, lineFrom)
  OBSIDIAN_LINK_RE.lastIndex = 0
  for (const match of text.matchAll(OBSIDIAN_LINK_RE)) {
    if (match.index === undefined || !match[1]) continue
    const raw = match[0]
    const target = match[1].trim()
    const display = displayTargetLabel(target)
    const from = lineFrom + match.index
    const to = from + raw.length
    if (inlineCodeRanges.some(range => rangesOverlap(from, to, range.from, range.to))) continue
    const embed = raw.startsWith('![[')
    const image = embed && isLikelyImageTarget(target)
    const foldKey = image ? markdownAssetFoldKey(raw) : ''
    ranges.push(Decoration.replace({
      widget: image
        ? new MarkdownImageWidget(display, target, raw, from, to, foldKey, folded.has(foldKey), options)
        : new MarkdownFileWidget(display, target, raw, from, to, options),
      inclusive: false,
    }).range(from, to))
  }
}

function collectInlineCodeRanges(text: string, lineFrom: number): Array<{ from: number; to: number }> {
  const ranges: Array<{ from: number; to: number }> = []
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
    const result = await window.electronAPI?.writeClipboardText?.(text)
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

function markdownLivePreviewPlugin(options: MarkdownLivePreviewOptions): Extension {
  return ViewPlugin.define(
    view => new MarkdownLivePreviewPlugin(view, options),
    { decorations: value => value.decorations },
  )
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

interface CompletableFenceLine {
  indent: string
  marker: string
  markerChar: '`' | '~'
}

function isCodeBlockCompletionKey(event: KeyboardEvent): boolean {
  return event.key === 'Enter' &&
    !event.shiftKey &&
    !event.altKey &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.isComposing
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
  let inFence = false
  for (let number = 1; number < lineNumber; number += 1) {
    if (FENCE_RE.test(doc.line(number).text)) inFence = !inFence
  }
  return !inFence
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
    '--md-live-code-bg': 'color-mix(in srgb, var(--editor-text, var(--text)) 9%, transparent)',
  },
  '.cm-scroller': {
    overflowAnchor: 'none',
  },
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
  '.md-live-setext-list-typing, .md-live-setext-list-typing span': {
    color: 'var(--editor-text, var(--text)) !important',
    fontWeight: 'inherit !important',
    textDecoration: 'none !important',
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
    color: 'color-mix(in srgb, var(--text-muted, var(--muted)) 76%, transparent)',
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
    color: 'var(--text)',
    background: 'color-mix(in srgb, var(--accent) 10%, transparent)',
    opacity: '1',
  },
  '.md-live-fold-button:focus-visible': {
    outline: '1px solid color-mix(in srgb, var(--accent) 62%, transparent)',
    outlineOffset: '1px',
    color: 'var(--text)',
    background: 'color-mix(in srgb, var(--accent) 10%, transparent)',
    opacity: '1',
  },
  '.md-live-fold-button:active': {
    transform: 'translateY(1px)',
  },
  '.md-live-fold-summary-line': {
    paddingLeft: 'var(--md-live-code-padding-x) !important',
    paddingRight: 'var(--md-live-code-padding-x) !important',
    backgroundColor: 'transparent',
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
    backgroundColor: 'color-mix(in srgb, var(--editor-text, var(--text)) 4%, transparent)',
    borderRadius: '7px',
    boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--text-muted, var(--muted)) 10%, transparent)',
  },
  '.md-live-codeblock-fold-summary-line .md-live-fold-summary': {
    maxWidth: 'calc(100% - 90px)',
    minHeight: '20px',
    marginLeft: '0',
    marginRight: '90px',
    padding: '1px 0',
    border: '0',
    borderRadius: '0',
    color: 'var(--text-muted, var(--muted))',
    background: 'transparent',
    boxShadow: 'none',
    appearance: 'none',
  },
  '.md-live-codeblock-fold-summary-line .md-live-fold-summary:hover': {
    color: 'var(--text-muted, var(--muted))',
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
    color: 'var(--text-muted, var(--muted))',
    background: 'color-mix(in srgb, var(--editor-text, var(--text)) 5%, transparent)',
    font: 'inherit',
    cursor: 'default',
  },
  '.md-live-fold-summary:hover': {
    color: 'var(--text-muted, var(--muted))',
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
    position: 'relative',
    paddingLeft: 'calc(var(--md-live-code-padding-x) + var(--md-live-code-fold-gutter-width)) !important',
    paddingRight: 'var(--md-live-code-padding-x) !important',
    backgroundColor: 'var(--md-live-code-bg)',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    fontSize: '0.76em',
    lineHeight: '1.55',
  },
  '.md-live-fence': {
    color: 'var(--text-muted, var(--muted))',
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
  '.md-live-codeblock-fence-toolbar': {
    display: 'flex !important',
    alignItems: 'center',
    minHeight: '28px',
    marginTop: '0.45em',
    padding: '2px var(--md-live-code-padding-x) !important',
    borderTopLeftRadius: '10px',
    borderTopRightRadius: '10px',
    lineHeight: '1.2 !important',
    overflow: 'hidden',
    backgroundColor: 'var(--md-live-code-bg)',
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
    border: '1px solid color-mix(in srgb, var(--text-muted, var(--muted)) 28%, var(--bg-elevated, var(--panel)))',
    borderRadius: '5px',
    color: 'var(--text-muted, var(--muted))',
    background: 'var(--bg-elevated, var(--panel))',
    boxShadow: '0 3px 10px rgba(0, 0, 0, 0.12)',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    fontSize: '11px',
    lineHeight: '1.3',
    cursor: 'pointer',
  },
  '.md-live-code-copy-button:hover': {
    color: 'var(--text)',
    borderColor: 'var(--accent)',
    background: 'color-mix(in srgb, var(--accent) 8%, var(--bg-elevated, var(--panel)))',
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
    color: 'var(--text-muted, var(--muted))',
    background: 'transparent',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    fontSize: '11px',
    lineHeight: '1.25',
    textAlign: 'right',
    pointerEvents: 'auto',
  },
  '.md-live-code-language-input:hover, .md-live-code-language-input:focus': {
    color: 'var(--text)',
    borderColor: 'var(--accent)',
    background: 'color-mix(in srgb, var(--accent) 9%, transparent)',
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
    border: '1px solid var(--border, rgba(128, 128, 128, 0.28))',
    borderRadius: '7px',
    background: 'color-mix(in srgb, var(--bg-elevated, var(--panel)) 72%, transparent)',
    boxShadow: '0 1px 0 rgba(0, 0, 0, 0.03)',
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
    padding: '0',
    borderRight: '1px solid var(--border, rgba(128, 128, 128, 0.2))',
    borderBottom: '1px solid var(--border, rgba(128, 128, 128, 0.2))',
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
    lineHeight: '1.45',
    display: 'flex',
    alignItems: 'stretch',
  },
  '.md-live-table-cell.header': {
    fontWeight: '600',
    background: 'color-mix(in srgb, var(--editor-text, var(--text)) 4%, transparent)',
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
    background: 'color-mix(in srgb, var(--accent) 5%, transparent)',
  },
  '.md-live-table-cell-input:focus': {
    borderColor: 'color-mix(in srgb, var(--accent) 56%, transparent)',
    background: 'color-mix(in srgb, var(--accent) 8%, var(--bg-elevated, var(--panel)))',
    boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--accent) 28%, transparent)',
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
    border: '1px solid color-mix(in srgb, var(--text-muted, var(--muted)) 22%, transparent)',
    borderRadius: '7px',
    verticalAlign: 'middle',
    color: 'var(--editor-text, var(--text))',
    background: 'color-mix(in srgb, var(--bg-elevated, var(--panel)) 78%, transparent)',
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
    color: 'var(--text-muted, var(--muted))',
    background: 'color-mix(in srgb, var(--editor-text, var(--text)) 5%, transparent)',
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
    color: 'var(--editor-text, var(--text))',
    background: 'transparent',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    fontSize: '0.78em',
    lineHeight: '1.45',
  },
  '.md-live-frontmatter-textarea:hover': {
    background: 'color-mix(in srgb, var(--accent) 4%, transparent)',
  },
  '.md-live-frontmatter-textarea:focus': {
    borderColor: 'color-mix(in srgb, var(--accent) 54%, transparent)',
    background: 'color-mix(in srgb, var(--accent) 7%, var(--bg-elevated, var(--panel)))',
    boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--accent) 24%, transparent)',
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
    justifyContent: 'center',
    minHeight: '30px',
    maxWidth: '100%',
    padding: '4px',
    border: '1px solid var(--border, rgba(128, 128, 128, 0.3))',
    borderRadius: '6px',
    color: 'var(--accent)',
    background: 'color-mix(in srgb, var(--bg-elevated, var(--panel)) 78%, transparent)',
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
    border: '1px solid var(--border, rgba(128, 128, 128, 0.3))',
    borderRadius: '6px',
    color: 'var(--accent)',
    background: 'color-mix(in srgb, var(--bg-elevated, var(--panel)) 78%, transparent)',
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
    color: 'var(--text-muted, var(--muted))',
    background: 'color-mix(in srgb, var(--editor-text, var(--text)) 4%, transparent)',
    font: 'inherit',
    fontSize: '0.92em',
    cursor: 'default',
  },
  '.md-live-asset-collapsed-widget:hover': {
    color: 'var(--text-muted, var(--muted))',
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
    border: '1px solid color-mix(in srgb, var(--text-muted, var(--muted)) 32%, transparent)',
    borderRadius: '5px',
    color: 'var(--text-muted, var(--muted))',
    background: 'color-mix(in srgb, var(--bg-elevated, var(--panel)) 88%, transparent)',
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
    color: 'var(--text)',
    borderColor: 'var(--accent)',
    background: 'color-mix(in srgb, var(--accent) 10%, var(--bg-elevated, var(--panel)))',
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
    border: '1px solid var(--accent)',
    borderRadius: '5px',
    outline: 'none',
    color: 'var(--editor-text, var(--text))',
    background: 'var(--bg-elevated, var(--panel))',
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
    color: 'var(--color-warning, #d97706)',
    borderColor: 'color-mix(in srgb, var(--color-warning, #d97706) 42%, transparent)',
  },
  '.md-live-asset-label': {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
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

export function markdownLivePreviewExtension(
  enabled: boolean,
  options: MarkdownLivePreviewOptions = {},
): Extension {
  const features = markdownLivePreviewFeatures(options)
  return enabled ? [
    markdownFoldState,
    hiddenHeadingCaretFilter,
    features.codeBlocks ? codeBlockSelectAllHandler : [],
    features.codeBlocks ? codeBlockSyntaxCompletionHandler : [],
    markdownLivePreviewPlugin(options),
    linkHandler,
    hiddenSyntaxDeleteHandler(features),
    theme,
  ] : []
}
