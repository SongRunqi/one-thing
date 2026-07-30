import { Fragment, Slice, type Node as ProseNode } from 'prosemirror-model'
import { Selection } from 'prosemirror-state'
import { serializeNoteMarkdown } from './markdown-io'
import { noteSchema } from './schema'

// 面板用的是「序列化后 markdown 草稿里的字符偏移」，编辑器用的是 ProseMirror 位置，
// 两边得能互相换算。
//
// 以前这里靠「取光标前 12 个渲染字符，去草稿里找同名出现」来对齐。渲染文本里是没有
// `**`、`` ` `` 这些标记的，所以：
//   - 光标停在 `**1**` 的 `1` 附近时只能匹配到标记之外，报出来的偏移左移了；
//   - 光标在块首（前面没有渲染字符）时 context 为空，直接 `return draft.length`——
//     光标被甩到文末，也就是「光标丢失」。
//
// 现在改成插哨兵：把一个私有区字符插到光标处，整篇序列化一次，哨兵在结果里的下标就是
// 精确的草稿偏移。标记、列表、front matter、块边界一概照顾到，且不依赖任何文本查找。
// 反向换算利用「偏移随位置单调不减」做二分。

// Unicode 私有区，笔记正文不会出现，序列化器也不会转义它。
const SENTINEL = ''

export interface DraftRange {
  from: number
  to: number
}

/** 二分或调用方给的位置可能落在块边界上，插不进文本；贴到最近的可放光标处。 */
function snapToInlinePos(doc: ProseNode, pos: number): number {
  const clamped = Math.max(0, Math.min(pos, doc.content.size))
  const $pos = doc.resolve(clamped)
  if ($pos.parent.inlineContent) return clamped
  return Selection.near($pos).from
}

/**
 * 把哨兵插到 `pos` 处并整篇序列化，返回哨兵的下标。
 *
 * 哨兵带上该位置的 marks：光标在加粗run 内部时哨兵也在 `**` 里面，报出来的偏移就落在
 * 标记内部而不是标记外面——这正是 `**|1**` 被报成 `|**1**` 的那个偏差。
 */
function draftOffsetAt(doc: ProseNode, pos: number): number | null {
  const inlinePos = snapToInlinePos(doc, pos)
  const $pos = doc.resolve(inlinePos)
  let marked: ProseNode
  try {
    const sentinel = noteSchema.text(SENTINEL, $pos.marks())
    marked = doc.replace(inlinePos, inlinePos, new Slice(Fragment.from(sentinel), 0, 0))
  } catch {
    return null
  }
  const index = serializeNoteMarkdown(marked).indexOf(SENTINEL)
  return index < 0 ? null : index
}

export function pmPosToDraftOffset(doc: ProseNode, draft: string, pos: number): number {
  const offset = draftOffsetAt(doc, pos)
  if (offset === null) return Math.min(draft.length, pos)
  return Math.max(0, Math.min(offset, draft.length))
}

/**
 * 反向：草稿偏移 → ProseMirror 位置。偏移随位置单调不减，二分取第一个 >= 目标的位置。
 */
export function draftOffsetToPmPos(doc: ProseNode, draft: string, offset: number): number {
  const target = Math.max(0, Math.min(offset, draft.length))
  let low = 0
  let high = doc.content.size
  while (low < high) {
    const mid = (low + high) >> 1
    if (pmPosToDraftOffset(doc, draft, mid) < target) low = mid + 1
    else high = mid
  }
  return low
}

/** 草稿里的 [from, to) 映射到 PM 位置区间。 */
export function draftRangeToPmRange(
  doc: ProseNode,
  draft: string,
  from: number,
  to: number,
): DraftRange | null {
  const pmFrom = snapToInlinePos(doc, draftOffsetToPmPos(doc, draft, from))
  const pmTo = from === to ? pmFrom : snapToInlinePos(doc, draftOffsetToPmPos(doc, draft, to))
  return { from: Math.min(pmFrom, pmTo), to: Math.max(pmFrom, pmTo) }
}

/** PM 选区映射回草稿偏移。 */
export function pmRangeToDraftRange(
  doc: ProseNode,
  draft: string,
  from: number,
  to: number,
): DraftRange {
  const draftFrom = pmPosToDraftOffset(doc, draft, from)
  const draftTo = from === to ? draftFrom : pmPosToDraftOffset(doc, draft, to)
  return { from: Math.min(draftFrom, draftTo), to: Math.max(draftFrom, draftTo) }
}
