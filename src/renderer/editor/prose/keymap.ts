import { baseKeymap, chainCommands, exitCode, toggleMark } from 'prosemirror-commands'
import { redo, undo } from 'prosemirror-history'
import { keymap } from 'prosemirror-keymap'
import {
  liftListItem,
  sinkListItem,
  splitListItem,
} from 'prosemirror-schema-list'
import { goToNextCell } from 'prosemirror-tables'
import { Selection, TextSelection, type Command, type Plugin } from 'prosemirror-state'
import { codeFenceParamsFromText, isHorizontalRuleText } from './input-rules'
import { noteSchema } from './schema'

// Arrow keys moving toward an embedded CodeMirror block hand the selection
// to the NodeView (its setSelection focuses the inner editor). From the
// official "CodeMirror in ProseMirror" example.
function arrowHandler(dir: 'left' | 'right' | 'up' | 'down'): Command {
  return (state, dispatch, view) => {
    if (!state.selection.empty || !view?.endOfTextblock(dir)) return false
    const side = dir === 'left' || dir === 'up' ? -1 : 1
    const $head = state.selection.$head
    const nextPos = Selection.near(state.doc.resolve(side > 0 ? $head.after() : $head.before()), side)
    if (nextPos.$head && nextPos.$head.parent.type === noteSchema.nodes.code_block) {
      dispatch?.(state.tr.setSelection(nextPos))
      return true
    }
    return false
  }
}

// Enter on a paragraph containing exactly "```lang" turns it into a code
// block; on "---" it becomes a horizontal rule. Input rules cannot see the
// Enter key, so these live in the keymap.
const enterBlockTriggers: Command = (state, dispatch) => {
  const { $from, empty } = state.selection
  if (!empty || $from.parent.type !== noteSchema.nodes.paragraph) return false
  if ($from.parentOffset !== $from.parent.content.size) return false
  const text = $from.parent.textContent

  const params = codeFenceParamsFromText(text)
  if (params !== null) {
    if (dispatch) {
      const start = $from.before()
      const tr = state.tr.replaceRangeWith(
        start,
        $from.after(),
        noteSchema.nodes.code_block.create({ params }),
      )
      tr.setSelection(TextSelection.create(tr.doc, start + 1))
      dispatch(tr.scrollIntoView())
    }
    return true
  }

  if (isHorizontalRuleText(text)) {
    if (dispatch) {
      const start = $from.before()
      const tr = state.tr.replaceRangeWith(start, $from.after(), noteSchema.nodes.horizontal_rule.create())
      const paragraph = noteSchema.nodes.paragraph.createAndFill()
      if (paragraph) {
        tr.insert(tr.mapping.map($from.after()), paragraph)
        tr.setSelection(TextSelection.near(tr.doc.resolve(tr.mapping.map($from.after())), 1))
      }
      dispatch(tr.scrollIntoView())
    }
    return true
  }

  return false
}

// Splitting a checked task item starts the next one unchecked.
const splitTaskItem: Command = (state, dispatch) => {
  const { $from } = state.selection
  const listItem = $from.node(-1)
  if (listItem?.type !== noteSchema.nodes.list_item || listItem.attrs.checked === null) {
    return splitListItem(noteSchema.nodes.list_item)(state, dispatch)
  }
  return splitListItem(noteSchema.nodes.list_item)(state, (tr) => {
    const after = tr.selection.$from.before(-1)
    tr.setNodeMarkup(after, undefined, { ...listItem.attrs, checked: false })
    dispatch?.(tr)
  })
}

export function noteKeymaps(): Plugin[] {
  return [
    keymap({
      'Mod-z': undo,
      'Shift-Mod-z': redo,
      'Mod-y': redo,
      'Mod-b': toggleMark(noteSchema.marks.strong),
      'Mod-i': toggleMark(noteSchema.marks.em),
      'Mod-u': toggleMark(noteSchema.marks.underline),
      'Mod-e': toggleMark(noteSchema.marks.code),
      'Enter': chainCommands(enterBlockTriggers, splitTaskItem),
      'Tab': chainCommands(goToNextCell(1), sinkListItem(noteSchema.nodes.list_item)),
      'Shift-Tab': chainCommands(goToNextCell(-1), liftListItem(noteSchema.nodes.list_item)),
      'Mod-Enter': exitCode,
      'Shift-Enter': (state, dispatch) => {
        dispatch?.(state.tr.replaceSelectionWith(noteSchema.nodes.hard_break.create()).scrollIntoView())
        return true
      },
      'ArrowLeft': arrowHandler('left'),
      'ArrowRight': arrowHandler('right'),
      'ArrowUp': arrowHandler('up'),
      'ArrowDown': arrowHandler('down'),
    }),
    keymap(baseKeymap),
  ]
}
