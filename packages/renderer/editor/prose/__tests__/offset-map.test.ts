import { describe, expect, it } from 'vitest'
import { parseNoteMarkdown, serializeNoteMarkdown } from '../markdown-io'
import { draftRangeToPmRange, pmRangeToDraftRange } from '../offset-map'

// 用 | 标出光标：先把 markdown 解析成文档，再把 | 前的字符数当成草稿偏移。
function withCaret(markdownWithCaret: string) {
  const caret = markdownWithCaret.indexOf('|')
  const markdown = markdownWithCaret.replace('|', '')
  const doc = parseNoteMarkdown(markdown)
  const draft = serializeNoteMarkdown(doc)
  return { doc, draft, caret }
}

/** 把 PM 位置画回草稿上，肉眼可读。 */
function draftCaret(draft: string, offset: number): string {
  return `${draft.slice(0, offset)}|${draft.slice(offset)}`
}

describe('草稿偏移 <-> ProseMirror 位置', () => {
  it('加粗文字内部的光标落在标记内部，不再被甩到标记左边', () => {
    const { doc, draft, caret } = withCaret('abc **1|**\n')
    const pm = draftRangeToPmRange(doc, draft, caret, caret)!
    const back = pmRangeToDraftRange(doc, draft, pm.from, pm.to)

    expect(draftCaret(draft, back.from)).toBe('abc **1|**\n')
  })

  it('块首的行内代码不再把光标丢到文末', () => {
    const { doc, draft } = withCaret('`x`\n')
    // PM 位置 1 = 代码文字 x 的前面（段落起点 1）。旧实现这里 context 为空，
    // 直接返回 draft.length，光标被甩到文末。
    const back = pmRangeToDraftRange(doc, draft, 1, 1)

    expect(draftCaret(draft, back.from)).toBe('`|x`\n')
  })

  it('多段文档里每个段落起点都能来回换算，不会塌到文末', () => {
    const markdown = '# 标题\n\n第一段\n\n- [ ] 一个待办\n- [x] 另一个\n\n最后一段\n'
    const doc = parseNoteMarkdown(markdown)
    const draft = serializeNoteMarkdown(doc)

    const offsets = [draft.indexOf('第一段'), draft.indexOf('一个待办'), draft.indexOf('最后一段')]
    for (const offset of offsets) {
      const pm = draftRangeToPmRange(doc, draft, offset, offset)!
      const back = pmRangeToDraftRange(doc, draft, pm.from, pm.to)
      expect(back.from).toBe(offset)
    }
  })

  it('落在块级标记里的偏移贴到最近的可落点，而不是丢掉', () => {
    const markdown = '# 标题\n\n正文\n'
    const doc = parseNoteMarkdown(markdown)
    const draft = serializeNoteMarkdown(doc)

    // 偏移 0 在 "# " 这个标题标记里，没有对应的光标位置。
    const pm = draftRangeToPmRange(doc, draft, 0, 0)!
    const back = pmRangeToDraftRange(doc, draft, pm.from, pm.to)
    expect(draftCaret(draft, back.from)).toBe('# |标题\n\n正文\n')
  })

  it('选中一段文字来回换算保持同一段文字', () => {
    const markdown = '第一段有些字\n\n第二段也有些字\n'
    const doc = parseNoteMarkdown(markdown)
    const draft = serializeNoteMarkdown(doc)
    const from = draft.indexOf('第二段')
    const to = from + '第二段'.length

    const pm = draftRangeToPmRange(doc, draft, from, to)!
    expect(doc.textBetween(pm.from, pm.to)).toBe('第二段')
    expect(pmRangeToDraftRange(doc, draft, pm.from, pm.to)).toEqual({ from, to })
  })

  it('文档任意位置都不会报出超过草稿长度的偏移', () => {
    const markdown = '# H\n\n**粗**和`码`和*斜*\n\n> 引用\n'
    const doc = parseNoteMarkdown(markdown)
    const draft = serializeNoteMarkdown(doc)

    for (let pos = 0; pos <= doc.content.size; pos += 1) {
      const { from, to } = pmRangeToDraftRange(doc, draft, pos, pos)
      expect(from).toBeGreaterThanOrEqual(0)
      expect(to).toBeLessThanOrEqual(draft.length)
    }
  })
})
