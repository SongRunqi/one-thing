import {
  InputRule,
  inputRules,
  textblockTypeInputRule,
  wrappingInputRule,
} from 'prosemirror-inputrules'
import type { MarkType, NodeType } from 'prosemirror-model'
import type { Plugin } from 'prosemirror-state'
import { findEmojiShortcodes } from '../markdown-emoji'
import { noteSchema } from './schema'

// Type-to-render rules: markdown syntax converts into rich nodes/marks the
// moment it is completed, Typora-style. The raw syntax never lives in the
// document — there is nothing for the caret to get lost in.

function markInputRule(pattern: RegExp, markType: MarkType): InputRule {
  return new InputRule(pattern, (state, match, start, end) => {
    const content = match[1]
    if (!content) return null
    const matchStart = start + match[0].indexOf(match[0])
    // Skip inside code marks / code blocks.
    const $start = state.doc.resolve(start)
    if ($start.parent.type.spec.code) return null
    if (state.doc.rangeHasMark(start, end, noteSchema.marks.code)) return null
    const tr = state.tr.delete(matchStart, end)
    const insertAt = matchStart
    tr.insertText(content, insertAt)
    tr.addMark(insertAt, insertAt + content.length, markType.create())
    tr.removeStoredMark(markType)
    return tr
  })
}

const boldRule = markInputRule(/\*\*([^*\s](?:[^*]*[^*\s])?)\*\*$/, noteSchema.marks.strong)
const emRule = markInputRule(/(?<!\*)\*([^*\s](?:[^*]*[^*\s])?)\*$/, noteSchema.marks.em)
const strikeRule = markInputRule(/~~([^~\s](?:[^~]*[^~\s])?)~~$/, noteSchema.marks.strikethrough)
const codeRule = markInputRule(/`([^`\n]+)`$/, noteSchema.marks.code)

// $x+y$ with the flanking rules shared with markdown-io (no dollar amounts).
const mathRule = new InputRule(/(?<!\\)\$([^$\s][^$\n]*[^$\s]|[^$\s])\$$/, (state, match, start, end) => {
  const $start = state.doc.resolve(start)
  if ($start.parent.type.spec.code) return null
  return state.tr.replaceRangeWith(start, end, noteSchema.nodes.math_inline.create({ tex: match[1] }))
})

const emojiRule = new InputRule(/(:[a-z0-9_+-]+:)$/, (state, match, start, end) => {
  const found = findEmojiShortcodes(match[1])
  if (!found.length || found[0].from !== 0 || found[0].to !== match[1].length) return null
  return state.tr.insertText(found[0].emoji, start, end)
})

const headingRule = textblockTypeInputRule(/^(#{1,6})\s$/, noteSchema.nodes.heading, match => ({
  level: match[1].length,
}))

const blockquoteRule = wrappingInputRule(/^>\s$/, noteSchema.nodes.blockquote)

const bulletListRule = wrappingInputRule(/^\s*[-*+]\s$/, noteSchema.nodes.bullet_list)

const orderedListRule = wrappingInputRule(
  /^\s*(\d+)[.)]\s$/,
  noteSchema.nodes.ordered_list,
  match => ({ order: Number(match[1]) }),
  (match, node) => node.childCount + node.attrs.order === Number(match[1]),
)

// Typing "[ ] " / "[x] " at the start of a list item turns it into a task.
const taskRule = new InputRule(/^\[( |x|X)\]\s$/, (state, match, start, end) => {
  const $start = state.doc.resolve(start)
  const listItem = $start.node(-1)
  if (listItem?.type !== noteSchema.nodes.list_item) return null
  if ($start.index(-1) !== 0) return null
  const itemPos = $start.before(-1)
  return state.tr
    .delete(start, end)
    .setNodeMarkup(itemPos, undefined, { ...listItem.attrs, checked: match[1] !== ' ' })
})

export function noteInputRules(): Plugin {
  return inputRules({
    rules: [
      headingRule,
      blockquoteRule,
      bulletListRule,
      orderedListRule,
      taskRule,
      boldRule,
      emRule,
      strikeRule,
      codeRule,
      mathRule,
      emojiRule,
    ],
  })
}

export function codeFenceParamsFromText(text: string): string | null {
  const match = text.match(/^```([\w+#.-]*)$/)
  return match ? match[1] : null
}

export function isHorizontalRuleText(text: string): boolean {
  return /^(?:---+|\*\*\*+|___+)$/.test(text)
}

export { noteSchema }
export type { NodeType }
