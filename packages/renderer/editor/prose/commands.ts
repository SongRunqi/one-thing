import { setBlockType, toggleMark, wrapIn } from 'prosemirror-commands'
import { wrapInList } from 'prosemirror-schema-list'
import { TextSelection } from 'prosemirror-state'
import type { EditorView } from 'prosemirror-view'
import type { MarkdownCommand } from '../markdown-document'
import { noteSchema } from './schema'

// The 17 formatting commands of MarkdownDocumentEditorHandle.applyCommand,
// expressed as real rich-text operations.

function toggleHeading(level: number) {
  return (view: EditorView): boolean => {
    const { $from } = view.state.selection
    const isSame = $from.parent.type === noteSchema.nodes.heading && $from.parent.attrs.level === level
    const command = isSame
      ? setBlockType(noteSchema.nodes.paragraph)
      : setBlockType(noteSchema.nodes.heading, { level })
    return command(view.state, view.dispatch)
  }
}

function toggleTaskList(view: EditorView): boolean {
  const { $from } = view.state.selection
  const listItem = $from.node(-1)
  if (listItem?.type === noteSchema.nodes.list_item) {
    const pos = $from.before(-1)
    const checked = listItem.attrs.checked === null ? false : null
    view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { ...listItem.attrs, checked }))
    return true
  }
  const wrapped = wrapInList(noteSchema.nodes.bullet_list)(view.state, view.dispatch)
  if (!wrapped) return false
  const { $from: $after } = view.state.selection
  const item = $after.node(-1)
  if (item?.type === noteSchema.nodes.list_item) {
    view.dispatch(view.state.tr.setNodeMarkup($after.before(-1), undefined, { ...item.attrs, checked: false }))
  }
  return true
}

function insertLink(view: EditorView): boolean {
  const { empty } = view.state.selection
  const href = window.prompt('Link URL', 'https://') || ''
  if (!href.trim()) return false
  if (empty) {
    const text = noteSchema.text(href, [noteSchema.marks.link.create({ href })])
    view.dispatch(view.state.tr.replaceSelectionWith(text, false))
    return true
  }
  return toggleMark(noteSchema.marks.link, { href })(view.state, view.dispatch)
}

function insertImage(view: EditorView): boolean {
  const src = window.prompt('Image path or URL', '') || ''
  if (!src.trim()) return false
  view.dispatch(view.state.tr.replaceSelectionWith(noteSchema.nodes.image.create({ src, alt: '' }), false))
  return true
}

function insertTable(view: EditorView): boolean {
  const makeCell = (type: 'table_header' | 'table_cell', text?: string) =>
    noteSchema.nodes[type].create(null, noteSchema.nodes.paragraph.create(null, text ? noteSchema.text(text) : undefined))
  const table = noteSchema.nodes.table.create(null, [
    noteSchema.nodes.table_row.create(null, [makeCell('table_header', '列一'), makeCell('table_header', '列二')]),
    noteSchema.nodes.table_row.create(null, [makeCell('table_cell'), makeCell('table_cell')]),
  ])
  const tr = view.state.tr.replaceSelectionWith(table)
  view.dispatch(tr.scrollIntoView())
  return true
}

function insertHorizontalRule(view: EditorView): boolean {
  view.dispatch(view.state.tr.replaceSelectionWith(noteSchema.nodes.horizontal_rule.create()).scrollIntoView())
  return true
}

function insertCodeBlock(view: EditorView): boolean {
  const command = setBlockType(noteSchema.nodes.code_block, { params: '' })
  if (command(view.state, view.dispatch)) return true
  const block = noteSchema.nodes.code_block.create({ params: '' })
  const tr = view.state.tr.replaceSelectionWith(block)
  view.dispatch(tr.setSelection(TextSelection.near(tr.doc.resolve(view.state.selection.from + 1))))
  return true
}

export function applyNoteCommand(view: EditorView, command: MarkdownCommand): boolean {
  switch (command) {
    case 'bold': return toggleMark(noteSchema.marks.strong)(view.state, view.dispatch)
    case 'italic': return toggleMark(noteSchema.marks.em)(view.state, view.dispatch)
    case 'strikethrough': return toggleMark(noteSchema.marks.strikethrough)(view.state, view.dispatch)
    case 'underline': return toggleMark(noteSchema.marks.underline)(view.state, view.dispatch)
    case 'inline-code': return toggleMark(noteSchema.marks.code)(view.state, view.dispatch)
    case 'link': return insertLink(view)
    case 'heading-1': return toggleHeading(1)(view)
    case 'heading-2': return toggleHeading(2)(view)
    case 'heading-3': return toggleHeading(3)(view)
    case 'bullet-list': return wrapInList(noteSchema.nodes.bullet_list)(view.state, view.dispatch)
    case 'ordered-list': return wrapInList(noteSchema.nodes.ordered_list)(view.state, view.dispatch)
    case 'task-list': return toggleTaskList(view)
    case 'blockquote': return wrapIn(noteSchema.nodes.blockquote)(view.state, view.dispatch)
    case 'code-block': return insertCodeBlock(view)
    case 'table': return insertTable(view)
    case 'image': return insertImage(view)
    case 'horizontal-rule': return insertHorizontalRule(view)
    default: return false
  }
}
