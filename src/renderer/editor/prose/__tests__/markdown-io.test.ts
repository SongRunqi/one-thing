import { describe, expect, it } from 'vitest'
import { parseNoteMarkdown, serializeNoteMarkdown, splitFrontmatter } from '../markdown-io'

function roundtrip(text: string): string {
  return serializeNoteMarkdown(parseNoteMarkdown(text))
}

// Exact fixed points: documents already in canonical style must survive a
// parse→serialize cycle byte-for-byte (modulo one trailing newline).
const CANONICAL_SAMPLES: Record<string, string> = {
  paragraphs: '第一段文本。\n\n第二段 with **bold** and *em* and ~~strike~~ and `code`。\n',
  softBreak: '第一行\n第二行紧跟着(单换行)\n\n新段落\n',
  headings: '# 标题一\n\n## 标题二\n\ncontent\n',
  taskList: '- [ ] 未完成任务 中文\n- [x] 已完成任务\n- 普通项目\n',
  orderedList: '1. 第一\n2. 第二\n',
  nestedList: '- 外层\n  - 内层一\n  - 内层二\n',
  blockquote: '> 引用第一行\n> 第二行\n\n正文\n',
  fence: '```js\nconst x = 1\nconst y = "`"\n```\n',
  table: '| 名称 | 值 |\n| --- | --- |\n| 中文内容 | **粗体** |\n| `code` | [链接](https://a.b) |\n',
  frontmatter: '---\ntitle: Test\ntags:\n  - note\n---\n\n正文开始\n',
  math: '价格 $5 和 $10 不是公式,而 $x + y$ 是。\n',
  image: '![alt 文本](assets/pic.png)\n\n![[obsidian.png]] 与 [[wiki 链接]] 原样保留\n',
  hr: 'above\n\n---\n\nbelow\n',
  link: '看 [这里](https://example.com "标题") 和 <https://bare.link>。\n',
  htmlBlock: '<div class="x">\n原样保留\n</div>\n\n后文\n',
  underlineHtml: '带 <u>下划线</u> 的句子。\n',
  escapes: '字面星号 \\*not em\\* 保持转义。\n',
}

describe('note markdown round-trip', () => {
  for (const [name, sample] of Object.entries(CANONICAL_SAMPLES)) {
    it(`keeps canonical ${name} byte-identical`, () => {
      expect(roundtrip(sample)).toBe(sample)
    })
  }

  it('is idempotent on every sample (canonical fixed point)', () => {
    for (const sample of Object.values(CANONICAL_SAMPLES)) {
      const once = roundtrip(sample)
      expect(roundtrip(once)).toBe(once)
    }
  })

  it('normalizes bullets and setext headings into canonical style, then stays stable', () => {
    const messy = '* star bullet\n* second\n\nTitle\n=====\n\nSub\n-----\n'
    const once = roundtrip(messy)
    expect(once).toBe('- star bullet\n- second\n\n# Title\n\n## Sub\n')
    expect(roundtrip(once)).toBe(once)
  })

  it('preserves task state through parse', () => {
    const doc = parseNoteMarkdown('- [ ] open\n- [x] done\n- plain\n')
    const items: Array<boolean | null> = []
    doc.descendants((node) => {
      if (node.type.name === 'list_item') items.push(node.attrs.checked)
      return true
    })
    expect(items).toEqual([false, true, null])
  })

  it('keeps table cell marks and pipes intact', () => {
    const md = '| a | b |\n| --- | --- |\n| **x** | p\\|q |\n'
    expect(roundtrip(md)).toBe(md)
  })

  it('does not treat a leading divider with blank line as front matter', () => {
    expect(splitFrontmatter('---\n\nSection\n\n---\n')).toEqual({ frontmatter: null, body: '---\n\nSection\n\n---\n' })
    expect(splitFrontmatter('---\ntitle: x\n---\nbody')).toEqual({ frontmatter: 'title: x', body: 'body' })
    expect(splitFrontmatter('---\n---\nbody')).toEqual({ frontmatter: '', body: 'body' })
  })

  it('keeps dollar amounts as plain text (flanking rules)', () => {
    const doc = parseNoteMarkdown('Price is $5 and $10 today\n')
    let math = 0
    doc.descendants((node) => {
      if (node.type.name === 'math_inline') math += 1
      return true
    })
    expect(math).toBe(0)
    expect(roundtrip('Price is $5 and $10 today\n')).toBe('Price is $5 and $10 today\n')
  })

  it('parses real math into math nodes and serializes back', () => {
    const doc = parseNoteMarkdown('inline $a_i^2$ math\n')
    let tex = ''
    doc.descendants((node) => {
      if (node.type.name === 'math_inline') tex = node.attrs.tex
      return true
    })
    expect(tex).toBe('a_i^2')
  })
})
