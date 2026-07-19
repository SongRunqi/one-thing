import MarkdownIt from 'markdown-it'
import type Token from 'markdown-it/lib/token.mjs'
import { MarkdownParser, MarkdownSerializer, defaultMarkdownSerializer } from 'prosemirror-markdown'
import type { Node as ProseNode } from 'prosemirror-model'
import { noteSchema } from './schema'

// markdown <-> ProseMirror document IO for the render-first note editor.
// Canonical output style deliberately matches what the agent writes: "-"
// bullets, "- [ ]" tasks, ATX headings, backtick fences, "~~" strikethrough.

// ---------------------------------------------------------------------------
// Front matter: same semantics as the CodeMirror live preview — the document
// must start with "---" and the closing fence must appear before any blank
// line, otherwise the leading "---" is a horizontal rule.

const FRONT_MATTER_CLOSE_RE = /^(?:---+|\.\.\.)\s*$/

export function splitFrontmatter(text: string): { frontmatter: string | null, body: string } {
  const lines = text.split('\n')
  if (lines.length < 2 || !/^---\s*$/.test(lines[0])) return { frontmatter: null, body: text }
  for (let index = 1; index < lines.length; index += 1) {
    if (FRONT_MATTER_CLOSE_RE.test(lines[index])) {
      return {
        frontmatter: lines.slice(1, index).join('\n'),
        body: lines.slice(index + 1).join('\n'),
      }
    }
    if (!lines[index].trim()) return { frontmatter: null, body: text }
  }
  return { frontmatter: null, body: text }
}

// ---------------------------------------------------------------------------
// markdown-it plugins

// Task list items: mark the list_item_open token and strip the "[ ] " prefix
// from the first inline token.
const TASK_PREFIX_RE = /^\[( |x|X)\]\s+/

function taskListPlugin(md: MarkdownIt): void {
  md.core.ruler.after('inline', 'note-task-lists', (state) => {
    const tokens = state.tokens
    for (let index = 0; index < tokens.length; index += 1) {
      if (tokens[index].type !== 'list_item_open') continue
      for (let inner = index + 1; inner < tokens.length; inner += 1) {
        const token = tokens[inner]
        if (token.type === 'list_item_close' || token.type === 'list_item_open') break
        if (token.type !== 'inline') continue
        const match = token.content.match(TASK_PREFIX_RE)
        if (match) {
          tokens[index].meta = { ...(tokens[index].meta || {}), checked: match[1] !== ' ' }
          token.content = token.content.slice(match[0].length)
          const first = token.children?.[0]
          if (first && first.type === 'text') {
            first.content = first.content.replace(TASK_PREFIX_RE, '')
          }
        }
        break
      }
    }
    return true
  })
}

// Inline math with the same flanking rules as the live preview: content must
// not start/end with whitespace and a closing "$" may not precede a digit.
function mathPlugin(md: MarkdownIt): void {
  md.inline.ruler.after('escape', 'note-math-inline', (state, silent) => {
    const src = state.src
    const start = state.pos
    if (src[start] !== '$' || src[start + 1] === '$') return false
    if (start > 0 && src[start - 1] === '\\') return false
    const after = src[start + 1]
    if (!after || /\s/.test(after)) return false

    let end = -1
    for (let index = start + 1; index < src.length; index += 1) {
      const char = src[index]
      if (char === '\n') return false
      if (char === '$' && src[index - 1] !== '\\') { end = index; break }
    }
    if (end < 0) return false
    const content = src.slice(start + 1, end)
    if (!content || /\s$/.test(content)) return false
    if (/^\d/.test(src[end + 1] || '')) return false

    if (!silent) {
      const token = state.push('math_inline', 'span', 0)
      token.content = content
    }
    state.pos = end + 1
    return true
  })
}

// Obsidian [[wiki]] / ![[embed]] links, kept verbatim instead of being
// escaped into \[\[...\]\] by the serializer.
const OBSIDIAN_LINK_RE = /^(!?)\[\[([^\n[\]]+)\]\]/

function obsidianLinkPlugin(md: MarkdownIt): void {
  md.inline.ruler.before('link', 'note-obsidian-link', (state, silent) => {
    const match = state.src.slice(state.pos).match(OBSIDIAN_LINK_RE)
    if (!match) return false
    if (!silent) {
      const token = state.push('obsidian_link', 'span', 0)
      token.content = match[2]
      token.meta = { embed: match[1] === '!' }
    }
    state.pos += match[0].length
    return true
  })
}

// GFM table cells arrive as bare inline tokens; wrap them in paragraph
// tokens so the parser can fill our paragraph-based cell content. Inline
// HTML becomes literal text so it round-trips untouched.
function tokenNormalizerPlugin(md: MarkdownIt): void {
  md.core.ruler.push('note-token-normalizer', (state) => {
    const tokens = state.tokens
    for (let index = 0; index < tokens.length; index += 1) {
      const token = tokens[index]
      if ((token.type === 'th_open' || token.type === 'td_open') && tokens[index + 1]?.type === 'inline') {
        const open = new state.Token('paragraph_open', 'p', 1)
        const close = new state.Token('paragraph_close', 'p', -1)
        tokens.splice(index + 1, 0, open)
        tokens.splice(index + 3, 0, close)
        index += 3
      }
      if (token.type === 'inline' && token.children) {
        for (const child of token.children) {
          if (child.type === 'html_inline') child.type = 'text'
        }
      }
    }
    return true
  })
}

export const noteMarkdownIt: MarkdownIt = MarkdownIt({ html: true, linkify: false })
  .use(taskListPlugin)
  .use(mathPlugin)
  .use(obsidianLinkPlugin)
  .use(tokenNormalizerPlugin)

// ---------------------------------------------------------------------------
// Parser

const bodyParser = new MarkdownParser(noteSchema, noteMarkdownIt, {
  blockquote: { block: 'blockquote' },
  paragraph: { block: 'paragraph' },
  list_item: {
    block: 'list_item',
    getAttrs: token => ({ checked: token.meta?.checked ?? null }),
  },
  bullet_list: {
    block: 'bullet_list',
    getAttrs: (_, tokens, index) => ({ tight: listIsTight(tokens, index) }),
  },
  ordered_list: {
    block: 'ordered_list',
    getAttrs: (token, tokens, index) => ({
      order: Number(token.attrGet('start')) || 1,
      tight: listIsTight(tokens, index),
    }),
  },
  heading: {
    block: 'heading',
    getAttrs: token => ({ level: Number(token.tag.slice(1)) || 1 }),
  },
  code_block: { block: 'code_block', noCloseToken: true },
  fence: {
    block: 'code_block',
    getAttrs: token => ({ params: token.info || '' }),
    noCloseToken: true,
  },
  hr: { node: 'horizontal_rule' },
  image: {
    node: 'image',
    getAttrs: token => ({
      src: token.attrGet('src') || '',
      alt: token.children?.[0]?.content || token.content || '',
      title: token.attrGet('title') || null,
    }),
  },
  hardbreak: { node: 'hard_break' },
  softbreak: { node: 'soft_break' },
  html_block: {
    node: 'html_block',
    getAttrs: token => ({ content: token.content.replace(/\n$/, '') }),
    noCloseToken: true,
  },
  math_inline: {
    node: 'math_inline',
    getAttrs: token => ({ tex: token.content }),
    noCloseToken: true,
  },
  obsidian_link: {
    node: 'obsidian_link',
    getAttrs: token => ({ target: token.content, embed: token.meta?.embed === true }),
    noCloseToken: true,
  },
  table: { block: 'table' },
  thead: { ignore: true },
  tbody: { ignore: true },
  tr: { block: 'table_row' },
  th: { block: 'table_header' },
  td: { block: 'table_cell' },

  em: { mark: 'em' },
  strong: { mark: 'strong' },
  s: { mark: 'strikethrough' },
  link: {
    mark: 'link',
    getAttrs: token => ({
      href: token.attrGet('href') || '',
      title: token.attrGet('title') || null,
    }),
  },
  code_inline: { mark: 'code', noCloseToken: true },
})

function listIsTight(tokens: readonly Token[], index: number): boolean {
  for (let position = index + 1; position < tokens.length; position += 1) {
    if (tokens[position].type !== 'list_item_open') return tokens[position].hidden
  }
  return false
}

export function parseNoteMarkdown(text: string): ProseNode {
  const { frontmatter, body } = splitFrontmatter(text)
  const bodyDoc = bodyParser.parse(body)
  if (frontmatter === null) return bodyDoc
  const frontmatterNode = noteSchema.nodes.frontmatter.create({ content: frontmatter })
  return noteSchema.nodes.doc.create(null, [frontmatterNode, ...childrenOf(bodyDoc)])
}

function childrenOf(doc: ProseNode): ProseNode[] {
  const children: ProseNode[] = []
  doc.forEach(child => children.push(child))
  return children
}

// ---------------------------------------------------------------------------
// Serializer

type SerializerState = Parameters<(typeof defaultMarkdownSerializer.nodes)['paragraph']>[0]
  & { out: string, delim: string }

function taskPrefix(item: ProseNode): string {
  if (item.attrs.checked === null) return ''
  return item.attrs.checked ? '[x] ' : '[ ] '
}

// Table cells hold a single line of inline markdown; render it with a small
// dedicated writer instead of hijacking the serializer state — the state's
// pending-block flushing and start-of-line escaping (e.g. "1." → "1\\.")
// don't apply inside a table row.
const CELL_MARK_DELIMS: Record<string, [string, string]> = {
  strong: ['**', '**'],
  em: ['*', '*'],
  strikethrough: ['~~', '~~'],
  underline: ['<u>', '</u>'],
}

function serializeCellInline(cell: ProseNode): string {
  let text = ''
  cell.forEach((block, _, blockIndex) => {
    if (blockIndex > 0) text += ' '
    block.forEach((node) => {
      let piece: string
      if (node.isText) {
        piece = (node.text || '').replace(/\|/g, '\\|')
        for (const mark of node.marks) {
          if (mark.type.name === 'code') {
            piece = `\`${node.text || ''}\``
          } else if (mark.type.name === 'link') {
            piece = `[${piece}](${mark.attrs.href})`
          } else {
            const delims = CELL_MARK_DELIMS[mark.type.name]
            if (delims) piece = `${delims[0]}${piece}${delims[1]}`
          }
        }
      } else if (node.type.name === 'image') {
        piece = `![${node.attrs.alt || ''}](${node.attrs.src})`
      } else if (node.type.name === 'math_inline') {
        piece = `$${node.attrs.tex}$`
      } else if (node.type.name === 'obsidian_link') {
        piece = `${node.attrs.embed ? '!' : ''}[[${node.attrs.target}]]`
      } else if (node.type.name === 'hard_break' || node.type.name === 'soft_break') {
        piece = ' '
      } else {
        piece = node.textContent.replace(/\|/g, '\\|')
      }
      text += piece
    })
  })
  return text.replace(/\n/g, ' ')
}

export const noteMarkdownSerializer = new MarkdownSerializer({
  ...defaultMarkdownSerializer.nodes,

  bullet_list(state, node) {
    state.renderList(node, '  ', index => `- ${taskPrefix(node.child(index))}`)
  },

  ordered_list(state, node) {
    const start = node.attrs.order ?? 1
    const maxWidth = String(start + node.childCount - 1).length
    const space = ' '.repeat(maxWidth + 2)
    state.renderList(node, space, (index) => {
      const label = String(start + index)
      return `${' '.repeat(maxWidth - label.length)}${label}. ${taskPrefix(node.child(index))}`
    })
  },

  horizontal_rule(state, node) {
    state.write(node.attrs.markup || '---')
    state.closeBlock(node)
  },

  frontmatter(state, node) {
    state.write(`---\n${node.attrs.content}\n---`)
    state.closeBlock(node)
  },

  html_block(state, node) {
    state.write(node.attrs.content)
    state.closeBlock(node)
  },

  math_inline(state, node) {
    state.write(`$${node.attrs.tex}$`)
  },

  obsidian_link(state, node) {
    state.write(`${node.attrs.embed ? '!' : ''}[[${node.attrs.target}]]`)
  },

  soft_break(state) {
    const typed = state as SerializerState
    typed.out += '\n'
    if (typed.delim) typed.out += typed.delim
  },

  table(state, node) {
    const rows: string[][] = []
    let headerColumns = 0
    node.forEach((row, _, rowIndex) => {
      const cells: string[] = []
      row.forEach(cell => cells.push(serializeCellInline(cell)))
      if (rowIndex === 0) headerColumns = cells.length
      rows.push(cells)
    })
    const lines = rows.map(cells => `| ${cells.join(' | ')} |`)
    lines.splice(1, 0, `| ${Array.from({ length: headerColumns }, () => '---').join(' | ')} |`)
    for (const [index, line] of lines.entries()) {
      state.write(line)
      if (index < lines.length - 1) state.ensureNewLine()
    }
    state.closeBlock(node)
  },

  table_row() {},
  table_cell() {},
  table_header() {},
}, {
  ...defaultMarkdownSerializer.marks,
  strikethrough: { open: '~~', close: '~~', mixable: true, expelEnclosingWhitespace: true },
  underline: { open: '<u>', close: '</u>', mixable: true },
})

export function serializeNoteMarkdown(doc: ProseNode): string {
  const text = noteMarkdownSerializer.serialize(doc, { tightLists: true })
  return text.endsWith('\n') ? text : `${text}\n`
}
