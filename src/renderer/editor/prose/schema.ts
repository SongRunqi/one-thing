import { Schema, type NodeSpec, type MarkSpec } from 'prosemirror-model'
import { tableNodes } from 'prosemirror-tables'

// Render-first note editor schema. The document tree is the source of truth;
// markdown is only the parse/serialize format (see markdown-io.ts). Node
// toDOM/parseDOM cover clipboard + basic rendering; block widgets get richer
// NodeViews in node-views/.

const tableNodeSpecs = tableNodes({
  tableGroup: 'block',
  cellContent: 'paragraph+',
  cellAttributes: {},
})

const nodes: Record<string, NodeSpec> = {
  doc: {
    content: 'frontmatter? block+',
  },

  paragraph: {
    content: 'inline*',
    group: 'block',
    parseDOM: [{ tag: 'p' }],
    toDOM: () => ['p', 0],
  },

  blockquote: {
    content: 'block+',
    group: 'block',
    parseDOM: [{ tag: 'blockquote' }],
    toDOM: () => ['blockquote', 0],
  },

  horizontal_rule: {
    group: 'block',
    parseDOM: [{ tag: 'hr' }],
    toDOM: () => ['div', { class: 'pm-note-hr' }, ['hr']],
  },

  heading: {
    attrs: { level: { default: 1 } },
    content: 'inline*',
    group: 'block',
    defining: true,
    parseDOM: [1, 2, 3, 4, 5, 6].map(level => ({ tag: `h${level}`, attrs: { level } })),
    toDOM: node => [`h${node.attrs.level}`, 0],
  },

  code_block: {
    attrs: { params: { default: '' } },
    content: 'text*',
    marks: '',
    group: 'block',
    code: true,
    defining: true,
    isolating: true,
    parseDOM: [{
      tag: 'pre',
      preserveWhitespace: 'full',
      getAttrs: dom => ({ params: (dom as HTMLElement).getAttribute('data-params') || '' }),
    }],
    toDOM: node => ['pre', { 'data-params': node.attrs.params }, ['code', 0]],
  },

  ordered_list: {
    attrs: { order: { default: 1 }, tight: { default: true } },
    content: 'list_item+',
    group: 'block',
    parseDOM: [{
      tag: 'ol',
      getAttrs: dom => ({
        order: Number((dom as HTMLElement).getAttribute('start')) || 1,
        tight: (dom as HTMLElement).hasAttribute('data-tight'),
      }),
    }],
    toDOM: node => ['ol', {
      start: node.attrs.order === 1 ? undefined : node.attrs.order,
      'data-tight': node.attrs.tight ? 'true' : undefined,
    }, 0],
  },

  bullet_list: {
    attrs: { tight: { default: true } },
    content: 'list_item+',
    group: 'block',
    parseDOM: [{
      tag: 'ul',
      getAttrs: dom => ({ tight: (dom as HTMLElement).hasAttribute('data-tight') }),
    }],
    toDOM: node => ['ul', { 'data-tight': node.attrs.tight ? 'true' : undefined }, 0],
  },

  // checked === null → plain list item; boolean → task item with checkbox.
  list_item: {
    attrs: { checked: { default: null } },
    content: 'block+',
    defining: true,
    parseDOM: [{
      tag: 'li',
      getAttrs: dom => {
        const checked = (dom as HTMLElement).getAttribute('data-checked')
        return { checked: checked === null ? null : checked === 'true' }
      },
    }],
    toDOM: node => ['li', {
      'data-checked': node.attrs.checked === null ? undefined : String(node.attrs.checked),
      class: node.attrs.checked === null ? undefined : 'pm-note-task-item',
    }, 0],
  },

  // Leading YAML front matter, edited through a Properties panel NodeView.
  frontmatter: {
    attrs: { content: { default: '' } },
    atom: true,
    selectable: true,
    parseDOM: [{
      tag: 'div[data-frontmatter]',
      getAttrs: dom => ({ content: (dom as HTMLElement).getAttribute('data-frontmatter') || '' }),
    }],
    toDOM: node => ['div', { 'data-frontmatter': node.attrs.content, class: 'pm-note-frontmatter' }],
  },

  // Raw HTML blocks pass through untouched (never re-serialized lossily).
  html_block: {
    attrs: { content: { default: '' } },
    group: 'block',
    atom: true,
    parseDOM: [{
      tag: 'div[data-html-block]',
      getAttrs: dom => ({ content: (dom as HTMLElement).getAttribute('data-html-block') || '' }),
    }],
    toDOM: node => ['div', { 'data-html-block': node.attrs.content, class: 'pm-note-html-block' }],
  },

  // Obsidian-style [[target]] / ![[embed]] links, kept verbatim.
  obsidian_link: {
    attrs: { target: { default: '' }, embed: { default: false } },
    group: 'inline',
    inline: true,
    atom: true,
    parseDOM: [{
      tag: 'span[data-obsidian-target]',
      getAttrs: dom => ({
        target: (dom as HTMLElement).getAttribute('data-obsidian-target') || '',
        embed: (dom as HTMLElement).getAttribute('data-obsidian-embed') === 'true',
      }),
    }],
    toDOM: node => ['span', {
      'data-obsidian-target': node.attrs.target,
      'data-obsidian-embed': String(node.attrs.embed),
      class: 'pm-note-obsidian-link',
    }, `${node.attrs.embed ? '!' : ''}[[${node.attrs.target}]]`],
  },

  math_inline: {
    attrs: { tex: { default: '' } },
    group: 'inline',
    inline: true,
    atom: true,
    parseDOM: [{
      tag: 'span[data-math]',
      getAttrs: dom => ({ tex: (dom as HTMLElement).getAttribute('data-math') || '' }),
    }],
    toDOM: node => ['span', { 'data-math': node.attrs.tex, class: 'pm-note-math' }, `$${node.attrs.tex}$`],
  },

  image: {
    attrs: {
      src: { default: '' },
      alt: { default: '' },
      title: { default: null },
    },
    group: 'inline',
    inline: true,
    draggable: true,
    parseDOM: [{
      tag: 'img[src]',
      getAttrs: dom => ({
        src: (dom as HTMLElement).getAttribute('src') || '',
        alt: (dom as HTMLElement).getAttribute('alt') || '',
        title: (dom as HTMLElement).getAttribute('title'),
      }),
    }],
    toDOM: node => ['img', { src: node.attrs.src, alt: node.attrs.alt, title: node.attrs.title || undefined }],
  },

  hard_break: {
    group: 'inline',
    inline: true,
    selectable: false,
    parseDOM: [{ tag: 'br' }],
    toDOM: () => ['br'],
  },

  // A single newline inside a paragraph. Kept as its own node (instead of
  // the default "collapse to space") so the user's line structure survives
  // the markdown round-trip byte-for-byte — with CJK text a joining space
  // would even be visible.
  soft_break: {
    group: 'inline',
    inline: true,
    selectable: false,
    parseDOM: [{ tag: 'br[data-soft]' }],
    toDOM: () => ['br', { 'data-soft': 'true' }],
  },

  text: {
    group: 'inline',
  },

  ...tableNodeSpecs,
}

const marks: Record<string, MarkSpec> = {
  strong: {
    parseDOM: [
      { tag: 'strong' },
      { tag: 'b', getAttrs: dom => (dom as HTMLElement).style.fontWeight !== 'normal' && null },
      { style: 'font-weight', getAttrs: value => /^(bold(er)?|[5-9]\d{2,})$/.test(value as string) && null },
    ],
    toDOM: () => ['strong', 0],
  },

  em: {
    parseDOM: [{ tag: 'i' }, { tag: 'em' }, { style: 'font-style=italic' }],
    toDOM: () => ['em', 0],
  },

  code: {
    parseDOM: [{ tag: 'code' }],
    toDOM: () => ['code', { class: 'pm-note-inline-code' }, 0],
  },

  strikethrough: {
    parseDOM: [{ tag: 's' }, { tag: 'del' }, { style: 'text-decoration=line-through' }],
    toDOM: () => ['s', 0],
  },

  underline: {
    parseDOM: [{ tag: 'u' }, { style: 'text-decoration=underline' }],
    toDOM: () => ['u', 0],
  },

  link: {
    attrs: { href: { default: '' }, title: { default: null } },
    inclusive: false,
    parseDOM: [{
      tag: 'a[href]',
      getAttrs: dom => ({
        href: (dom as HTMLElement).getAttribute('href') || '',
        title: (dom as HTMLElement).getAttribute('title'),
      }),
    }],
    toDOM: node => ['a', { href: node.attrs.href, title: node.attrs.title || undefined, class: 'pm-note-link' }, 0],
  },
}

export const noteSchema = new Schema({ nodes, marks })
