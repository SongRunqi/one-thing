// @vitest-environment happy-dom
import { EditorState } from '@codemirror/state'
import { markdown } from '@codemirror/lang-markdown'
import { EditorView } from '@codemirror/view'
import { afterEach, describe, expect, it } from 'vitest'
import {
  analyzeMarkdownLivePreviewLine,
  isLineActive,
  markdownLivePreviewExtension,
} from '../markdown-live-preview'

describe('markdown live preview helpers', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('classifies common markdown lines', () => {
    expect(analyzeMarkdownLivePreviewLine('## Heading', false)).toMatchObject({
      kind: 'heading',
      headingLevel: 2,
    })
    expect(analyzeMarkdownLivePreviewLine('# ', false)).toMatchObject({
      kind: 'heading',
      headingLevel: 1,
      markerLength: 2,
    })
    expect(analyzeMarkdownLivePreviewLine('- [x] Done', false)).toMatchObject({
      kind: 'task',
      checked: true,
    })
    expect(analyzeMarkdownLivePreviewLine('```ts', false)).toMatchObject({ kind: 'fence' })
    expect(analyzeMarkdownLivePreviewLine('const a = 1', true)).toMatchObject({ kind: 'code' })
    expect(analyzeMarkdownLivePreviewLine('> quoted', false)).toMatchObject({ kind: 'blockquote' })
    expect(analyzeMarkdownLivePreviewLine('- ', false)).toMatchObject({ kind: 'unordered-list' })
    expect(analyzeMarkdownLivePreviewLine('1. ', false)).toMatchObject({ kind: 'ordered-list' })
    expect(analyzeMarkdownLivePreviewLine('> ', false)).toMatchObject({ kind: 'blockquote' })
  })

  it('keeps incomplete markdown syntax visible while typing', () => {
    for (const doc of ['#', '##', '-', '1.', '>', '- [ ]', '**', '[link](', '`', '```', '```js\n']) {
      const view = new EditorView({
        state: EditorState.create({
          doc,
          selection: { anchor: doc.length },
          extensions: [markdown(), markdownLivePreviewExtension(true)],
        }),
        parent: document.body,
      })

      expect(view.dom.textContent).toContain(doc.trim() || doc)
      expect(view.dom.querySelector('.md-live-heading')).toBeNull()
      expect(view.dom.querySelector('.md-live-list-marker-widget')).toBeNull()
      expect(view.dom.querySelector('.md-live-blockquote')).toBeNull()
      expect(view.dom.querySelector('.md-live-inline-code')).toBeNull()
      expect(view.dom.querySelector('.md-live-link')).toBeNull()
      expect(view.dom.querySelector('.md-live-codeblock-fence-hidden')).toBeNull()

      view.destroy()
      document.body.innerHTML = ''
    }
  })

  it('renders empty block structures after their required space and keeps a caret anchor', () => {
    const cases = [
      {
        doc: '# ',
        raw: '#',
        selector: '.md-live-heading-1',
        anchor: '.md-live-empty-structure-caret-anchor',
      },
      {
        doc: '- ',
        raw: '-',
        selector: '.md-live-list-marker-widget',
      },
      {
        doc: '1. ',
        selector: '.md-live-list-marker-widget',
      },
      {
        doc: '- [ ] ',
        raw: '- [ ]',
        selector: '.md-live-task-checkbox-slot',
      },
      {
        doc: '> ',
        raw: '>',
        selector: '.md-live-blockquote',
        anchor: '.md-live-empty-structure-caret-anchor',
      },
    ]

    for (const item of cases) {
      const view = new EditorView({
        state: EditorState.create({
          doc: item.doc,
          selection: { anchor: item.doc.length },
          extensions: [markdown(), markdownLivePreviewExtension(true)],
        }),
        parent: document.body,
      })

      if (item.raw) expect(view.dom.textContent).not.toContain(item.raw)
      expect(view.dom.querySelector(item.selector)).not.toBeNull()
      if (item.anchor) expect(view.dom.querySelector(item.anchor)).not.toBeNull()

      view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Backspace',
        bubbles: true,
        cancelable: true,
      }))
      expect(view.state.doc.toString()).toBe('')

      view.destroy()
      document.body.innerHTML = ''
    }
  })

  it('turns heading markers into empty live-preview headings only after a space', () => {
    const markerOnly = new EditorView({
      state: EditorState.create({
        doc: '#',
        selection: { anchor: 1 },
        extensions: [markdown(), markdownLivePreviewExtension(true)],
      }),
      parent: document.body,
    })

    expect(markerOnly.dom.textContent).toContain('#')
    expect(markerOnly.dom.querySelector('.md-live-heading')).toBeNull()
    markerOnly.destroy()
    document.body.innerHTML = ''

    const emptyHeading = new EditorView({
      state: EditorState.create({
        doc: '# ',
        selection: { anchor: 2 },
        extensions: [markdown(), markdownLivePreviewExtension(true)],
      }),
      parent: document.body,
    })

    expect(emptyHeading.dom.textContent).not.toContain('#')
    expect(emptyHeading.dom.querySelector('.md-live-heading-1')).not.toBeNull()

    emptyHeading.contentDOM.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Backspace',
      bubbles: true,
      cancelable: true,
    }))
    expect(emptyHeading.state.doc.toString()).toBe('')
    emptyHeading.destroy()
  })

  it('renders task markers as a stable checkbox slot while keeping caret placement', () => {
    const view = new EditorView({
      state: EditorState.create({
        doc: '- [ ] ',
        selection: { anchor: 6 },
        extensions: [markdown(), markdownLivePreviewExtension(true)],
      }),
      parent: document.body,
    })

    const slot = view.dom.querySelector('.md-live-task-checkbox-slot')

    expect(slot).not.toBeNull()
    expect(slot?.querySelector('.md-live-task-checkbox')).not.toBeNull()
    expect(view.dom.querySelector('.md-live-task-checkbox')).not.toBeNull()
    expect(view.dom.textContent).not.toContain('- [ ]')
    expect(view.state.doc.toString()).toBe('- [ ] ')

    view.dispatch({
      changes: { from: 6, insert: '1' },
      selection: { anchor: 7 },
    })

    expect(view.state.doc.toString()).toBe('- [ ] 1')
    expect(view.dom.querySelector('.md-live-task-checkbox-slot')).not.toBeNull()
    expect(view.dom.querySelector('.md-live-task-checkbox')).not.toBeNull()
    expect(view.dom.textContent).not.toContain('- [ ]')

    view.destroy()
  })

  it('keeps an emptied heading rendered until the hidden marker is deleted', () => {
    const view = new EditorView({
      state: EditorState.create({
        doc: '# Title',
        selection: { anchor: '# Title'.length },
        extensions: [markdown(), markdownLivePreviewExtension(true)],
      }),
      parent: document.body,
    })

    view.dispatch({
      changes: { from: 2, to: '# Title'.length, insert: '' },
      selection: { anchor: 2 },
    })

    expect(view.state.doc.toString()).toBe('# ')
    expect(view.dom.textContent).not.toContain('#')
    expect(view.dom.querySelector('.md-live-heading-1')).not.toBeNull()

    view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Backspace',
      bubbles: true,
      cancelable: true,
    }))
    expect(view.state.doc.toString()).toBe('')

    view.destroy()
  })

  it('reports active lines from the editor selection', () => {
    const view = new EditorView({
      state: EditorState.create({
        doc: '# Title\n\n- [ ] Task',
        selection: { anchor: 0 },
        extensions: [markdownLivePreviewExtension(true)],
      }),
      parent: document.body,
    })

    const firstLine = view.state.doc.line(1)
    const thirdLine = view.state.doc.line(3)

    expect(isLineActive(view, firstLine.from, firstLine.to)).toBe(true)
    expect(isLineActive(view, thirdLine.from, thirdLine.to)).toBe(false)

    view.destroy()
  })

  it('uses markdown syntax-tree decorations for document nodes', () => {
    const view = new EditorView({
      state: EditorState.create({
        doc: '# Title\n\n![alt](image.png)\n\n---\n\n| A | B |\n| --- | --- |',
        selection: { anchor: 32 },
        extensions: [markdown(), markdownLivePreviewExtension(true)],
      }),
      parent: document.body,
    })

    expect(view.dom.querySelector('.md-live-heading-1')).not.toBeNull()
    expect(view.dom.querySelector('.md-live-image-widget')).not.toBeNull()
    expect(view.dom.querySelector('.md-live-horizontal-rule-widget')).not.toBeNull()
    expect(view.dom.querySelector('.md-live-table')).not.toBeNull()

    view.destroy()
  })

  it('keeps rendered headings stable on hover without revealing source markers', () => {
    const view = new EditorView({
      state: EditorState.create({
        doc: '# Stable Heading\n\nbody',
        selection: { anchor: 19 },
        extensions: [markdown(), markdownLivePreviewExtension(true)],
      }),
      parent: document.body,
    })

    const heading = view.dom.querySelector('.md-live-heading-1')
    expect(heading).not.toBeNull()
    expect(view.dom.textContent).not.toContain('# Stable Heading')

    heading?.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }))
    heading?.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }))

    expect(view.dom.querySelector('.md-live-heading-1')).not.toBeNull()
    expect(view.dom.textContent).not.toContain('# Stable Heading')

    view.destroy()
  })

  it('keeps rendered markdown syntax stable without exposing raw source markers', () => {
    const view = new EditorView({
      state: EditorState.create({
        doc: [
          '# Stable Heading',
          '- [ ] Task',
          '- item',
          '> quote',
          '**bold** and [link](https://example.com) and `code`',
          '```ts',
          'const a = 1',
          '```',
          '| A | B |',
          '| --- | --- |',
          '| C | D |',
        ].join('\n'),
        selection: { anchor: 2 },
        extensions: [markdown(), markdownLivePreviewExtension(true)],
      }),
      parent: document.body,
    })

    const rendered = view.dom.textContent || ''
    expect(rendered).toContain('Stable Heading')
    expect(rendered).toContain('Task')
    expect(rendered).toContain('bold')
    expect(rendered).toContain('link')
    expect(rendered).toContain('code')
    expect(rendered).toContain('A')
    expect(rendered).not.toContain('# Stable Heading')
    expect(rendered).not.toContain('- [ ] Task')
    expect(rendered).not.toContain('- item')
    expect(rendered).not.toContain('> quote')
    expect(rendered).not.toContain('**bold**')
    expect(rendered).not.toContain('[link](https://example.com)')
    expect(rendered).not.toContain('`code`')
    expect(rendered).not.toContain('```')
    expect(rendered).not.toContain('| A | B |')

    view.destroy()
  })

  it('renders complete inline/media syntax and leaves cleared syntax as source text', () => {
    const complete = new EditorView({
      state: EditorState.create({
        doc: [
          '**bold** *italic* ~~gone~~ <u>under</u> `code` [link](https://example.com) $x$ :rocket:',
          '![alt](image.png)',
          '| A | B |',
        ].join('\n'),
        extensions: [markdown(), markdownLivePreviewExtension(true)],
      }),
      parent: document.body,
    })

    expect(complete.dom.querySelector('.md-live-bold')).not.toBeNull()
    expect(complete.dom.querySelector('.md-live-italic')).not.toBeNull()
    expect(complete.dom.querySelector('.md-live-strikethrough')).not.toBeNull()
    expect(complete.dom.querySelector('.md-live-underline')).not.toBeNull()
    expect(complete.dom.querySelector('.md-live-inline-code')).not.toBeNull()
    expect(complete.dom.querySelector('.md-live-link')).not.toBeNull()
    expect(complete.dom.querySelector('.md-live-math')).not.toBeNull()
    expect(complete.dom.querySelector('.md-live-emoji')).not.toBeNull()
    expect(complete.dom.querySelector('.md-live-image-widget')).not.toBeNull()
    expect(complete.dom.querySelector('.md-live-table-row')).not.toBeNull()
    complete.destroy()
    document.body.innerHTML = ''

    const cleared = new EditorView({
      state: EditorState.create({
        doc: '**** __ __ `` [](https://example.com) $$ ![alt]() | | :notemoji:',
        extensions: [markdown(), markdownLivePreviewExtension(true)],
      }),
      parent: document.body,
    })

    const raw = cleared.dom.textContent || ''
    expect(raw).toContain('****')
    expect(raw).toContain('[](https://example.com)')
    expect(raw).toContain('![alt]()')
    expect(raw).toContain('| |')
    expect(cleared.dom.querySelector('.md-live-bold')).toBeNull()
    expect(cleared.dom.querySelector('.md-live-inline-code')).toBeNull()
    expect(cleared.dom.querySelector('.md-live-link')).toBeNull()
    expect(cleared.dom.querySelector('.md-live-image-widget')).toBeNull()
    expect(cleared.dom.querySelector('.md-live-table-row')).toBeNull()

    cleared.destroy()
  })

  it('renders fenced code as a polished code block without language labels', () => {
    const view = new EditorView({
      state: EditorState.create({
        doc: '```java\npublic static void main(String[] args) {\n\n}\n```',
        selection: { anchor: 8 },
        extensions: [markdown(), markdownLivePreviewExtension(true)],
      }),
      parent: document.body,
    })

    const rendered = view.dom.textContent || ''
    expect(rendered).toContain('public static void main')
    expect(rendered).not.toContain('```')
    expect(rendered).not.toContain('java')
    expect(view.dom.querySelector('.md-live-codeblock-first')).not.toBeNull()
    expect(view.dom.querySelector('.md-live-codeblock-last')).not.toBeNull()
    expect(view.dom.querySelector('.md-live-code-keyword')).not.toBeNull()

    view.destroy()
  })

  it('keeps non-ascii fenced code content visible', () => {
    const doc = '```java\n这里面写东西看得到\n```'
    const view = new EditorView({
      state: EditorState.create({
        doc,
        selection: { anchor: doc.indexOf('东西') },
        extensions: [markdown(), markdownLivePreviewExtension(true)],
      }),
      parent: document.body,
    })

    const rendered = view.dom.textContent || ''
    expect(rendered).toContain('这里面写东西看得到')
    expect(rendered).not.toContain('```')
    expect(rendered).not.toContain('java')
    expect(view.dom.querySelector('.md-live-code')).not.toBeNull()

    view.destroy()
  })

  it('keeps incomplete and single-line backtick fences visible while editing', () => {
    const openingOnly = new EditorView({
      state: EditorState.create({
        doc: '```java',
        selection: { anchor: '```java'.length },
        extensions: [markdown(), markdownLivePreviewExtension(true)],
      }),
      parent: document.body,
    })

    expect(openingOnly.dom.textContent).toContain('```java')
    expect(openingOnly.dom.querySelector('.md-live-codeblock-fence-hidden')).toBeNull()
    openingOnly.destroy()
    document.body.innerHTML = ''

    const inlineTriple = new EditorView({
      state: EditorState.create({
        doc: '```java```',
        selection: { anchor: '```java```'.length },
        extensions: [markdown(), markdownLivePreviewExtension(true)],
      }),
      parent: document.body,
    })

    const rendered = inlineTriple.dom.textContent || ''
    expect(rendered).toContain('java')
    expect(rendered).not.toContain('```')
    expect(inlineTriple.dom.querySelector('.md-live-inline-code')).not.toBeNull()
    expect(inlineTriple.dom.querySelector('.md-live-codeblock-fence-hidden')).toBeNull()
    inlineTriple.destroy()
  })

  it('normalizes an adjacent empty fenced code block before editing inside it', async () => {
    const view = new EditorView({
      state: EditorState.create({
        doc: '```java\n```',
        selection: { anchor: '```java\n'.length },
        extensions: [markdown(), markdownLivePreviewExtension(true)],
      }),
      parent: document.body,
    })

    await new Promise(resolve => setTimeout(resolve, 0))

    expect(view.state.doc.toString()).toBe('```java\n\n```')
    const rendered = view.dom.textContent || ''
    expect(rendered).not.toContain('```')
    expect(rendered).not.toContain('java')
    expect(view.dom.querySelector('.md-live-codeblock-first')).not.toBeNull()
    expect(view.dom.querySelector('.md-live-codeblock-last')).not.toBeNull()

    view.destroy()
  })

  it('does not normalize an adjacent empty fenced block unless the cursor is inside it', async () => {
    const afterClosing = new EditorView({
      state: EditorState.create({
        doc: '```java\n```',
        selection: { anchor: '```java\n```'.length },
        extensions: [markdown(), markdownLivePreviewExtension(true)],
      }),
      parent: document.body,
    })

    await new Promise(resolve => setTimeout(resolve, 0))
    expect(afterClosing.state.doc.toString()).toBe('```java\n```')
    afterClosing.destroy()
    document.body.innerHTML = ''

    const editingLanguage = new EditorView({
      state: EditorState.create({
        doc: '```java\n```',
        selection: { anchor: 5 },
        extensions: [markdown(), markdownLivePreviewExtension(true)],
      }),
      parent: document.body,
    })

    await new Promise(resolve => setTimeout(resolve, 0))
    expect(editingLanguage.state.doc.toString()).toBe('```java\n```')
    editingLanguage.destroy()
  })

  it('deletes the whole fenced code block after its content is cleared', () => {
    const doc = '```java\n\n```'
    const view = new EditorView({
      state: EditorState.create({
        doc,
        selection: { anchor: '```java\n'.length },
        extensions: [markdown(), markdownLivePreviewExtension(true)],
      }),
      parent: document.body,
    })

    const event = new KeyboardEvent('keydown', {
      key: 'Backspace',
      bubbles: true,
      cancelable: true,
    })
    view.contentDOM.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    expect(view.state.doc.toString()).toBe('')

    view.destroy()
  })

  it('deletes whitespace-only fenced code blocks without leaving blank lines', () => {
    const doc = [
      'before',
      '```java',
      '  ',
      '',
      '```',
      'after',
    ].join('\n')
    const view = new EditorView({
      state: EditorState.create({
        doc,
        selection: { anchor: doc.indexOf('  ') + 2 },
        extensions: [markdown(), markdownLivePreviewExtension(true)],
      }),
      parent: document.body,
    })

    view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Backspace',
      bubbles: true,
      cancelable: true,
    }))

    expect(view.state.doc.toString()).toBe('before\nafter')

    view.destroy()
  })

  it('keeps adjacent fence text visible when it contains non-language content', () => {
    const view = new EditorView({
      state: EditorState.create({
        doc: '```java这里面写东西看不到\n```',
        selection: { anchor: 0 },
        extensions: [markdown(), markdownLivePreviewExtension(true)],
      }),
      parent: document.body,
    })

    expect(view.dom.textContent).toContain('```java这里面写东西看不到')
    expect(view.dom.textContent).toContain('```')
    expect(view.dom.querySelector('.md-live-codeblock-fence-hidden')).toBeNull()

    view.destroy()
  })

  it('can delete hidden markdown markers from rendered syntax boundaries', () => {
    const headingView = new EditorView({
      state: EditorState.create({
        doc: '# Title',
        selection: { anchor: 2 },
        extensions: [markdown(), markdownLivePreviewExtension(true)],
      }),
      parent: document.body,
    })

    headingView.contentDOM.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Backspace',
      bubbles: true,
      cancelable: true,
    }))
    expect(headingView.state.doc.toString()).toBe('Title')
    headingView.destroy()

    const inlineView = new EditorView({
      state: EditorState.create({
        doc: '**bold**',
        selection: { anchor: 2 },
        extensions: [markdown(), markdownLivePreviewExtension(true)],
      }),
      parent: document.body,
    })

    inlineView.contentDOM.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Backspace',
      bubbles: true,
      cancelable: true,
    }))
    expect(inlineView.state.doc.toString()).toBe('bold')
    inlineView.destroy()

    const codeView = new EditorView({
      state: EditorState.create({
        doc: '```java\npublic static void main() {}\n```',
        selection: { anchor: '```java\n'.length },
        extensions: [markdown(), markdownLivePreviewExtension(true)],
      }),
      parent: document.body,
    })

    codeView.contentDOM.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Backspace',
      bubbles: true,
      cancelable: true,
    }))
    expect(codeView.state.doc.toString()).toBe('public static void main() {}')
    codeView.destroy()
  })

  it('does not treat markdown-looking code lines as hidden block markers', () => {
    const doc = [
      '```md',
      '# heading-looking code',
      '- list-looking code',
      '```',
    ].join('\n')
    const view = new EditorView({
      state: EditorState.create({
        doc,
        selection: { anchor: doc.indexOf('heading-looking') },
        extensions: [markdown(), markdownLivePreviewExtension(true)],
      }),
      parent: document.body,
    })

    view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Backspace',
      bubbles: true,
      cancelable: true,
    }))
    expect(view.state.doc.toString()).toBe(doc)

    view.dispatch({ selection: { anchor: doc.indexOf('list-looking') } })
    view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Backspace',
      bubbles: true,
      cancelable: true,
    }))
    expect(view.state.doc.toString()).toBe(doc)

    view.destroy()
  })

  it('decorates strikethrough and underline fallback inline marks on inactive lines', () => {
    const view = new EditorView({
      state: EditorState.create({
        doc: 'active\n\n~~removed~~ and <u>underlined</u>',
        selection: { anchor: 0 },
        extensions: [markdown(), markdownLivePreviewExtension(true)],
      }),
      parent: document.body,
    })

    expect(view.dom.querySelector('.md-live-strikethrough')).not.toBeNull()
    expect(view.dom.querySelector('.md-live-underline')).not.toBeNull()

    view.destroy()
  })

  it('renders emoji shortcodes in live preview while keeping code literal', () => {
    const view = new EditorView({
      state: EditorState.create({
        doc: 'active\n\nShip it :rocket: :sparkles:\n\n```txt\n:rocket:\n```',
        selection: { anchor: 0 },
        extensions: [markdown(), markdownLivePreviewExtension(true)],
      }),
      parent: document.body,
    })

    const emojis = Array.from(view.dom.querySelectorAll('.md-live-emoji'))
    const rendered = view.dom.textContent || ''
    expect(emojis).toHaveLength(2)
    expect(rendered).toContain('🚀')
    expect(rendered).toContain('✨')
    expect(rendered).toContain(':rocket:')
    expect(rendered).not.toContain('Ship it :rocket:')

    view.destroy()
  })

  it('can delete rendered emoji shortcodes from the preview boundary', () => {
    const view = new EditorView({
      state: EditorState.create({
        doc: 'Go :rocket:',
        selection: { anchor: 'Go :rocket:'.length },
        extensions: [markdown(), markdownLivePreviewExtension(true)],
      }),
      parent: document.body,
    })

    view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Backspace',
      bubbles: true,
      cancelable: true,
    }))
    expect(view.state.doc.toString()).toBe('Go ')

    view.destroy()
  })

  it('selects the current fenced code block content with Cmd+A', () => {
    const doc = [
      'Before',
      '```ts',
      'const first = 1',
      'const second = 2',
      '```',
      'After',
    ].join('\n')
    const view = new EditorView({
      state: EditorState.create({
        doc,
        selection: { anchor: doc.indexOf('second') },
        extensions: [markdown(), markdownLivePreviewExtension(true)],
      }),
      parent: document.body,
    })

    const event = new KeyboardEvent('keydown', {
      key: 'a',
      metaKey: true,
      bubbles: true,
      cancelable: true,
    })
    view.contentDOM.dispatchEvent(event)

    const selection = view.state.selection.main
    expect(event.defaultPrevented).toBe(true)
    expect(view.state.sliceDoc(selection.from, selection.to)).toBe('const first = 1\nconst second = 2')
    expect(view.state.sliceDoc(selection.from, selection.to)).not.toContain('```')

    view.destroy()
  })
})
