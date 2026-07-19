import {
  drawSelection,
  EditorView as CodeMirrorView,
  keymap as cmKeymap,
  lineNumbers,
} from '@codemirror/view'
import { defaultKeymap, indentWithTab } from '@codemirror/commands'
import { defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { Compartment } from '@codemirror/state'
import type { Node as ProseNode } from 'prosemirror-model'
import { Selection, TextSelection } from 'prosemirror-state'
import { exitCode } from 'prosemirror-commands'
import { redo, undo } from 'prosemirror-history'
import type { EditorView, NodeView, NodeViewConstructor } from 'prosemirror-view'
import { languageExtension, languageFromPath } from '../languages'

export interface NoteNodeViewOptions {
  resolveImageSrc?: (rawSrc: string) => Promise<string | null>
  onOpenImage?: (payload: { src: string, alt: string }) => void
  onOpenLink?: (href: string) => void
}

type GetPos = () => number | undefined

// ---------------------------------------------------------------------------
// Task list item: checkbox lives outside the contentDOM so clicking it can
// never corrupt the text selection.

class TaskItemView implements NodeView {
  dom: HTMLElement
  contentDOM: HTMLElement
  private checkbox: HTMLButtonElement

  constructor(private node: ProseNode, view: EditorView, getPos: GetPos) {
    this.dom = document.createElement('li')
    this.checkbox = document.createElement('button')
    this.checkbox.type = 'button'
    this.checkbox.className = 'pm-note-task-checkbox'
    this.checkbox.contentEditable = 'false'
    this.checkbox.addEventListener('mousedown', event => event.preventDefault())
    this.checkbox.addEventListener('click', (event) => {
      event.preventDefault()
      const pos = getPos()
      if (pos === undefined) return
      const current = view.state.doc.nodeAt(pos)
      if (!current) return
      view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, {
        ...current.attrs,
        checked: !current.attrs.checked,
      }))
    })
    this.checkbox.setAttribute('aria-hidden', 'false')
    this.contentDOM = document.createElement('div')
    this.contentDOM.className = 'pm-note-task-content'
    // contentDOM first, checkbox absolutely positioned after it: a
    // non-editable element in the inline flow before the text gives the
    // browser a second "equivalent" caret position at the item start, and
    // the native selection then oscillates between it and ProseMirror's
    // corrected position (visible as a caret flickering between two spots).
    this.dom.append(this.contentDOM, this.checkbox)
    this.sync()
  }

  private sync(): void {
    const checked = this.node.attrs.checked
    this.dom.className = checked === null ? '' : `pm-note-task-item${checked ? ' checked' : ''}`
    this.checkbox.style.display = checked === null ? 'none' : ''
    this.checkbox.setAttribute('aria-checked', String(checked === true))
    this.checkbox.classList.toggle('checked', checked === true)
  }

  update(node: ProseNode): boolean {
    if (node.type !== this.node.type) return false
    this.node = node
    this.sync()
    return true
  }
}

// ---------------------------------------------------------------------------
// Code block: an embedded CodeMirror instance (Typora-style). Ported from the
// official "CodeMirror in ProseMirror" example, with our language loader and
// a params field.

class CodeBlockView implements NodeView {
  dom: HTMLElement
  private cm: CodeMirrorView
  private updating = false
  private languageCompartment = new Compartment()
  private paramsInput: HTMLInputElement

  constructor(
    private node: ProseNode,
    private view: EditorView,
    private getPos: GetPos,
  ) {
    this.cm = new CodeMirrorView({
      doc: this.node.textContent,
      extensions: [
        cmKeymap.of([...this.codeMirrorKeymap(), indentWithTab, ...defaultKeymap]),
        drawSelection(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        lineNumbers(),
        this.languageCompartment.of(this.languageExtensionFor(this.node.attrs.params)),
        CodeMirrorView.updateListener.of(update => this.forwardUpdate(update)),
      ],
    })

    const topbar = document.createElement('div')
    topbar.className = 'pm-note-codeblock-topbar'
    topbar.contentEditable = 'false'
    this.paramsInput = document.createElement('input')
    this.paramsInput.className = 'pm-note-codeblock-lang'
    this.paramsInput.placeholder = 'lang'
    this.paramsInput.value = this.node.attrs.params
    this.paramsInput.addEventListener('change', () => this.commitParams())
    this.paramsInput.addEventListener('keydown', (event) => {
      event.stopPropagation()
      if (event.key === 'Enter') {
        event.preventDefault()
        this.commitParams()
        this.cm.focus()
      }
    })
    const copyButton = document.createElement('button')
    copyButton.type = 'button'
    copyButton.className = 'pm-note-codeblock-copy'
    copyButton.textContent = 'Copy'
    copyButton.addEventListener('click', (event) => {
      event.preventDefault()
      void navigator.clipboard?.writeText(this.cm.state.doc.toString())
    })
    topbar.append(this.paramsInput, copyButton)

    this.dom = document.createElement('div')
    this.dom.className = 'pm-note-codeblock'
    this.dom.append(topbar, this.cm.dom)
  }

  private languageExtensionFor(params: string) {
    const language = languageFromPath(`f.${(params || '').split(/\s+/)[0]}`)
    return languageExtension(language)
  }

  private commitParams(): void {
    const pos = this.getPos()
    if (pos === undefined) return
    const params = this.paramsInput.value.trim()
    if (params === this.node.attrs.params) return
    this.view.dispatch(this.view.state.tr.setNodeMarkup(pos, undefined, { ...this.node.attrs, params }))
  }

  private forwardUpdate(update: { docChanged: boolean, state: { selection: { main: { from: number, to: number } } } }): void {
    if (this.updating || !this.cm.hasFocus) return
    const pos = this.getPos()
    if (pos === undefined) return
    let offset = pos + 1
    const { main } = update.state.selection
    const selFrom = offset + main.from
    const selTo = offset + main.to
    const pmSel = this.view.state.selection
    if (update.docChanged || pmSel.from !== selFrom || pmSel.to !== selTo) {
      const tr = this.view.state.tr
      if (update.docChanged) {
        const cmText = this.cm.state.doc.toString()
        const pmText = this.node.textContent
        if (cmText !== pmText) {
          let start = 0
          let cmEnd = cmText.length
          let pmEnd = pmText.length
          while (start < cmEnd && start < pmEnd && cmText[start] === pmText[start]) start += 1
          while (cmEnd > start && pmEnd > start && cmText[cmEnd - 1] === pmText[pmEnd - 1]) {
            cmEnd -= 1
            pmEnd -= 1
          }
          const replacement = cmText.slice(start, cmEnd)
          if (replacement.length) {
            tr.replaceWith(offset + start, offset + pmEnd, this.view.state.schema.text(replacement))
          } else {
            tr.delete(offset + start, offset + pmEnd)
          }
          offset = pos + 1
        }
      }
      tr.setSelection(TextSelection.create(tr.doc, Math.min(selFrom, tr.doc.content.size), Math.min(selTo, tr.doc.content.size)))
      this.view.dispatch(tr)
    }
  }

  private codeMirrorKeymap() {
    return [
      { key: 'ArrowUp', run: () => this.maybeEscape('line', -1) },
      { key: 'ArrowLeft', run: () => this.maybeEscape('char', -1) },
      { key: 'ArrowDown', run: () => this.maybeEscape('line', 1) },
      { key: 'ArrowRight', run: () => this.maybeEscape('char', 1) },
      { key: 'Mod-Enter', run: () => {
        if (!exitCode(this.view.state, this.view.dispatch)) return false
        this.view.focus()
        return true
      } },
      { key: 'Mod-z', run: () => undo(this.view.state, this.view.dispatch) },
      { key: 'Shift-Mod-z', run: () => redo(this.view.state, this.view.dispatch) },
      { key: 'Mod-y', run: () => redo(this.view.state, this.view.dispatch) },
      { key: 'Backspace', run: () => {
        // Empty code block: delete it and put the caret in a paragraph.
        if (this.cm.state.doc.length > 0) return false
        const pos = this.getPos()
        if (pos === undefined) return false
        const tr = this.view.state.tr.replaceRangeWith(
          pos,
          pos + this.node.nodeSize,
          this.view.state.schema.nodes.paragraph.createAndFill()!,
        )
        tr.setSelection(TextSelection.create(tr.doc, pos + 1))
        this.view.dispatch(tr)
        this.view.focus()
        return true
      } },
    ]
  }

  private maybeEscape(unit: 'line' | 'char', dir: -1 | 1): boolean {
    const { state } = this.cm
    const { main } = state.selection
    if (!main.empty) return false
    const range = unit === 'line' ? state.doc.lineAt(main.head) : main
    if (dir < 0 ? range.from > 0 : range.to < state.doc.length) return false
    const pos = this.getPos()
    if (pos === undefined) return false
    const targetPos = pos + (dir < 0 ? 0 : this.node.nodeSize)
    const selection = Selection.near(this.view.state.doc.resolve(targetPos), dir)
    const tr = this.view.state.tr.setSelection(selection).scrollIntoView()
    this.view.dispatch(tr)
    this.view.focus()
    return true
  }

  update(node: ProseNode): boolean {
    if (node.type !== this.node.type) return false
    const paramsChanged = node.attrs.params !== this.node.attrs.params
    this.node = node
    if (paramsChanged) {
      this.paramsInput.value = node.attrs.params
      this.cm.dispatch({ effects: this.languageCompartment.reconfigure(this.languageExtensionFor(node.attrs.params)) })
    }
    if (this.updating) return true
    const newText = node.textContent
    const curText = this.cm.state.doc.toString()
    if (newText !== curText) {
      let start = 0
      let curEnd = curText.length
      let newEnd = newText.length
      while (start < curEnd && start < newEnd && curText[start] === newText[start]) start += 1
      while (curEnd > start && newEnd > start && curText[curEnd - 1] === newText[newEnd - 1]) {
        curEnd -= 1
        newEnd -= 1
      }
      this.updating = true
      this.cm.dispatch({ changes: { from: start, to: curEnd, insert: newText.slice(start, newEnd) } })
      this.updating = false
    }
    return true
  }

  setSelection(anchor: number, head: number): void {
    this.cm.focus()
    this.updating = true
    this.cm.dispatch({ selection: { anchor, head } })
    this.updating = false
  }

  selectNode(): void {
    this.cm.focus()
  }

  stopEvent(): boolean {
    return true
  }

  ignoreMutation(): boolean {
    return true
  }

  destroy(): void {
    this.cm.destroy()
  }
}

// ---------------------------------------------------------------------------
// Front matter: the Properties panel from the live preview, now a NodeView.

class FrontmatterView implements NodeView {
  dom: HTMLElement
  private textarea: HTMLTextAreaElement

  constructor(private node: ProseNode, view: EditorView, getPos: GetPos) {
    this.dom = document.createElement('div')
    this.dom.className = 'pm-note-frontmatter'
    this.dom.contentEditable = 'false'
    const label = document.createElement('div')
    label.className = 'pm-note-frontmatter-label'
    label.textContent = 'Properties'
    this.textarea = document.createElement('textarea')
    this.textarea.className = 'pm-note-frontmatter-textarea'
    this.textarea.value = this.node.attrs.content
    this.textarea.spellcheck = false
    this.textarea.addEventListener('keydown', event => event.stopPropagation())
    this.textarea.addEventListener('change', () => {
      const pos = getPos()
      if (pos === undefined) return
      view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { content: this.textarea.value }))
    })
    this.dom.append(label, this.textarea)
    this.autosize()
    this.textarea.addEventListener('input', () => this.autosize())
  }

  private autosize(): void {
    this.textarea.rows = Math.max(1, this.textarea.value.split('\n').length)
  }

  update(node: ProseNode): boolean {
    if (node.type !== this.node.type) return false
    this.node = node
    if (document.activeElement !== this.textarea) {
      this.textarea.value = node.attrs.content
      this.autosize()
    }
    return true
  }

  stopEvent(): boolean {
    return true
  }

  ignoreMutation(): boolean {
    return true
  }
}

// ---------------------------------------------------------------------------
// Images (and Obsidian image embeds): resolved through the app's asset
// pipeline, rendered inline, click opens the preview window.

function createImageDom(
  rawSrc: string,
  alt: string,
  options: NoteNodeViewOptions,
): HTMLElement {
  const wrapper = document.createElement('span')
  wrapper.className = 'pm-note-image'
  wrapper.contentEditable = 'false'
  const img = document.createElement('img')
  img.alt = alt
  img.draggable = false
  wrapper.append(img)

  const assign = (src: string) => {
    img.src = src
    img.addEventListener('click', (event) => {
      event.preventDefault()
      options.onOpenImage?.({ src: img.src, alt })
    })
  }
  if (options.resolveImageSrc) {
    wrapper.classList.add('loading')
    void options.resolveImageSrc(rawSrc).then((resolved) => {
      wrapper.classList.remove('loading')
      if (resolved) assign(resolved)
      else wrapper.replaceChildren(document.createTextNode(alt || rawSrc))
    })
  } else {
    assign(rawSrc)
  }
  return wrapper
}

const IMAGE_TARGET_RE = /\.(avif|bmp|gif|jpe?g|png|svg|webp)(?:$|[?#])/i

class ObsidianLinkView implements NodeView {
  dom: HTMLElement

  constructor(node: ProseNode, _view: EditorView, _getPos: GetPos, options: NoteNodeViewOptions) {
    const target = String(node.attrs.target)
    const plainTarget = target.split('|')[0].trim()
    if (node.attrs.embed && IMAGE_TARGET_RE.test(plainTarget)) {
      this.dom = createImageDom(plainTarget, target, options)
    } else {
      const chip = document.createElement('span')
      chip.className = 'pm-note-obsidian-link'
      chip.contentEditable = 'false'
      chip.textContent = plainTarget.split(/[\\/]/).filter(Boolean).at(-1) || target
      chip.title = target
      chip.addEventListener('click', (event) => {
        event.preventDefault()
        options.onOpenLink?.(plainTarget)
      })
      this.dom = chip
    }
  }
}

// ---------------------------------------------------------------------------

export function noteNodeViews(options: NoteNodeViewOptions): Record<string, NodeViewConstructor> {
  return {
    list_item: (node, view, getPos) => new TaskItemView(node, view, getPos),
    code_block: (node, view, getPos) => new CodeBlockView(node, view, getPos),
    frontmatter: (node, view, getPos) => new FrontmatterView(node, view, getPos),
    image: node => ({ dom: createImageDom(node.attrs.src, node.attrs.alt, options) }),
    obsidian_link: (node, view, getPos) => new ObsidianLinkView(node, view, getPos, options),
  }
}
