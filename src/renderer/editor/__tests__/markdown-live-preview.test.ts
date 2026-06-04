// @vitest-environment happy-dom
import { EditorState } from '@codemirror/state'
import { markdown } from '@codemirror/lang-markdown'
import { defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { cursorCharLeft, deleteCharBackward } from '@codemirror/commands'
import { EditorView } from '@codemirror/view'
import { afterEach, describe, expect, it, vi } from 'vitest'
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

  it('does not style previous text as a Setext heading while starting a dash list', () => {
    const doc = [
      'site:',
      'iva dnis: 24316530033',
      'route to',
      '-',
    ].join('\n')
    const view = new EditorView({
      state: EditorState.create({
        doc,
        selection: { anchor: doc.length },
        extensions: [
          markdown(),
          syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
          markdownLivePreviewExtension(true),
        ],
      }),
      parent: document.body,
    })

    expect(view.dom.textContent).toContain('site:')
    expect(view.dom.querySelectorAll('.md-live-setext-list-typing')).toHaveLength(4)
    expect(view.dom.querySelector('.md-live-heading')).toBeNull()

    view.destroy()
  })

  it('renders opening front matter as an editable properties block', () => {
    const doc = [
      '---',
      'title: Test',
      'tags:',
      '  - note',
      '---',
      'body',
    ].join('\n')
    const view = new EditorView({
      state: EditorState.create({
        doc,
        extensions: [markdown(), markdownLivePreviewExtension(true)],
      }),
      parent: document.body,
    })

    const widget = view.dom.querySelector('.md-live-frontmatter-widget')
    const textarea = view.dom.querySelector('.md-live-frontmatter-textarea') as HTMLTextAreaElement | null
    expect(widget).not.toBeNull()
    expect(textarea?.value).toBe('title: Test\ntags:\n  - note')
    expect(view.dom.querySelector('.md-live-horizontal-rule-widget')).toBeNull()
    expect(view.dom.querySelector('.md-live-heading')).toBeNull()
    expect(view.dom.textContent).toContain('body')

    view.destroy()
  })

  it('edits front matter content from the properties block', () => {
    const view = new EditorView({
      state: EditorState.create({
        doc: '---\n---\nbody',
        extensions: [markdown(), markdownLivePreviewExtension(true)],
      }),
      parent: document.body,
    })

    const textarea = view.dom.querySelector('.md-live-frontmatter-textarea') as HTMLTextAreaElement | null
    if (!textarea) throw new Error('Missing front matter textarea')
    expect(textarea.value).toBe('')
    textarea.value = 'title: Next'
    textarea.dispatchEvent(new Event('change', { bubbles: true }))

    expect(view.state.doc.toString()).toBe('---\ntitle: Next\n---\nbody')

    view.destroy()
  })

  it('keeps body horizontal rules outside front matter rendering as rules', () => {
    const view = new EditorView({
      state: EditorState.create({
        doc: 'body\n\n---\n---',
        extensions: [markdown(), markdownLivePreviewExtension(true)],
      }),
      parent: document.body,
    })

    expect(view.dom.querySelector('.md-live-frontmatter-widget')).toBeNull()
    expect(view.dom.querySelectorAll('.md-live-horizontal-rule-widget')).toHaveLength(2)

    view.destroy()
  })

  it('completes fenced code block syntax and deletes the empty block on Backspace', () => {
    const view = new EditorView({
      state: EditorState.create({
        doc: '```ts',
        selection: { anchor: '```ts'.length },
        extensions: [markdown(), markdownLivePreviewExtension(true)],
      }),
      parent: document.body,
    })

    const enterEvent = new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true,
    })
    view.contentDOM.dispatchEvent(enterEvent)

    expect(enterEvent.defaultPrevented).toBe(true)
    expect(view.state.doc.toString()).toBe('```ts\n\n```')
    expect(view.state.selection.main.head).toBe('```ts\n'.length)

    const backspaceEvent = new KeyboardEvent('keydown', {
      key: 'Backspace',
      bubbles: true,
      cancelable: true,
    })
    view.contentDOM.dispatchEvent(backspaceEvent)

    expect(backspaceEvent.defaultPrevented).toBe(true)
    expect(view.state.doc.toString()).toBe('')

    view.destroy()
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

  it('keeps a caret anchor before the visible heading text', () => {
    const view = new EditorView({
      state: EditorState.create({
        doc: '# Title',
        selection: { anchor: 2 },
        extensions: [markdown(), markdownLivePreviewExtension(true)],
      }),
      parent: document.body,
    })

    const anchor = view.dom.querySelector('.md-live-empty-structure-caret-anchor')
    expect(view.dom.textContent).not.toContain('# Title')
    expect(view.dom.querySelector('.md-live-heading-1')).not.toBeNull()
    expect(anchor).not.toBeNull()
    expect(anchor?.closest('.md-live-heading-1')).not.toBeNull()

    view.dispatch({ selection: { anchor: 0 }, userEvent: 'select' })
    expect(view.state.selection.main.head).toBe(0)
    expect(view.dom.querySelector('.md-live-empty-structure-caret-anchor')).not.toBeNull()
    view.dispatch({ selection: { anchor: 1 }, userEvent: 'select' })
    expect(view.state.selection.main.head).toBe(1)
    expect(view.dom.textContent).toContain('# Title')
    expect(view.dom.querySelector('.md-live-empty-structure-caret-anchor')).toBeNull()

    view.dispatch({ selection: { anchor: 2 }, userEvent: 'select' })
    expect(view.dom.textContent).not.toContain('# Title')
    expect(view.dom.querySelector('.md-live-empty-structure-caret-anchor')).not.toBeNull()

    view.destroy()
  })

  it('keeps the visible line start reachable while skipping hidden line prefixes', () => {
    const doc = [
      'Before',
      '## Now',
      '- [ ] Task',
    ].join('\n')
    const view = new EditorView({
      state: EditorState.create({
        doc,
        selection: { anchor: doc.indexOf('Now') + 1 },
        extensions: [markdown(), markdownLivePreviewExtension(true)],
      }),
      parent: document.body,
    })

    let moved = view.moveByChar(view.state.selection.main, false)
    view.dispatch({ selection: moved, userEvent: 'select' })
    expect(view.state.selection.main.head).toBe(doc.indexOf('Now'))

    view.dispatch({ selection: { anchor: doc.indexOf('Task') + 1 }, userEvent: 'select' })
    moved = view.moveByChar(view.state.selection.main, false)
    view.dispatch({ selection: moved, userEvent: 'select' })
    expect(view.state.selection.main.head).toBe(doc.indexOf('Task'))

    view.destroy()
  })

  it('preserves programmatic selections in hidden Markdown source', () => {
    const view = new EditorView({
      state: EditorState.create({
        doc: '# Title',
        selection: { anchor: 2 },
        extensions: [markdown(), markdownLivePreviewExtension(true)],
      }),
      parent: document.body,
    })

    view.dispatch({ selection: { anchor: 0 } })
    expect(view.state.selection.main.head).toBe(0)

    view.destroy()
  })

  it('moves through hidden Markdown source by character', () => {
    const doc = [
      'Before',
      '- [ ] Task',
      '**bold** after',
    ].join('\n')
    const view = new EditorView({
      state: EditorState.create({
        doc,
        selection: { anchor: doc.indexOf('Task') },
        extensions: [markdown(), markdownLivePreviewExtension(true)],
      }),
      parent: document.body,
    })

    const taskTextFrom = doc.indexOf('Task')
    let moved = view.moveByChar(view.state.selection.main, false)
    expect(moved.head).toBe(taskTextFrom - 1)
    view.dispatch({ selection: moved, userEvent: 'select' })
    expect(view.state.selection.main.head).toBe(taskTextFrom - 1)

    moved = view.moveByChar(view.state.selection.main, false)
    view.dispatch({ selection: moved, userEvent: 'select' })
    expect(view.state.selection.main.head).toBe(taskTextFrom - 2)

    view.destroy()

    const inlineView = new EditorView({
      state: EditorState.create({
        doc: '**bold** after',
        selection: { anchor: 0 },
        extensions: [markdown(), markdownLivePreviewExtension(true)],
      }),
      parent: document.body,
    })

    moved = inlineView.moveByChar(inlineView.state.selection.main, true)
    expect(moved.head).toBe(1)
    inlineView.destroy()

    const inlineSuffixView = new EditorView({
      state: EditorState.create({
        doc: '**bold** after',
        selection: { anchor: 6 },
        extensions: [markdown(), markdownLivePreviewExtension(true)],
      }),
      parent: document.body,
    })

    moved = inlineSuffixView.moveByChar(inlineSuffixView.state.selection.main, true)
    expect(moved.head).toBe(7)

    inlineSuffixView.destroy()
  })

  it('reveals hidden Markdown source while the caret is inside it', () => {
    const taskView = new EditorView({
      state: EditorState.create({
        doc: '- [ ] Task',
        selection: { anchor: ' -'.length },
        extensions: [markdown(), markdownLivePreviewExtension(true)],
      }),
      parent: document.body,
    })

    expect(taskView.dom.textContent).toContain('- [ ]')
    expect(taskView.dom.querySelector('.md-live-task-checkbox-slot')).toBeNull()
    taskView.dispatch({ selection: { anchor: '- [ ] '.length }, userEvent: 'select' })
    expect(taskView.dom.textContent).not.toContain('- [ ]')
    expect(taskView.dom.querySelector('.md-live-task-checkbox-slot')).not.toBeNull()
    taskView.destroy()
    document.body.innerHTML = ''

    const inlineView = new EditorView({
      state: EditorState.create({
        doc: '**bold** [label](url)',
        selection: { anchor: 1 },
        extensions: [markdown(), markdownLivePreviewExtension(true)],
      }),
      parent: document.body,
    })

    expect(inlineView.dom.textContent).toContain('**bold')
    inlineView.dispatch({ selection: { anchor: '**bold*'.length }, userEvent: 'select' })
    expect(inlineView.dom.textContent).toContain('bold**')
    inlineView.dispatch({ selection: { anchor: '**bold** [label]('.length + 1 }, userEvent: 'select' })
    expect(inlineView.dom.textContent).toContain('(url)')
    inlineView.destroy()
    document.body.innerHTML = ''

    const imageView = new EditorView({
      state: EditorState.create({
        doc: '![alt](image.png)',
        selection: { anchor: 1 },
        extensions: [markdown(), markdownLivePreviewExtension(true)],
      }),
      parent: document.body,
    })

    expect(imageView.dom.textContent).toContain('![alt](image.png)')
    expect(imageView.dom.querySelector('.md-live-image-widget')).toBeNull()
    imageView.destroy()
  })

  it('keeps heading marker source reachable during keyboard selection', () => {
    const doc = [
      'Before',
      '## Now',
    ].join('\n')
    const view = new EditorView({
      state: EditorState.create({
        doc,
        selection: { anchor: doc.indexOf('Now') },
        extensions: [markdown(), markdownLivePreviewExtension(true)],
      }),
      parent: document.body,
    })

    let moved = view.moveByChar(view.state.selection.main, false)
    view.dispatch({ selection: moved, userEvent: 'select' })
    expect(view.state.selection.main.head).toBe(doc.indexOf('Now') - 1)

    moved = view.moveByChar(view.state.selection.main, false)
    view.dispatch({ selection: moved, userEvent: 'select' })
    expect(view.state.selection.main.head).toBe(doc.indexOf('Now') - 2)

    view.destroy()
  })

  it('moves through nested ordered-list markers without jumping to the outer marker', () => {
    const doc = '1. Premier 误判断修复\n2. 2. 非Premier 进入Premier流程修复 '
    const view = new EditorView({
      state: EditorState.create({
        doc,
        selection: { anchor: doc.indexOf('2. 非Premier') + 2 },
        extensions: [markdown(), markdownLivePreviewExtension(true)],
      }),
      parent: document.body,
    })

    expect(view.dom.querySelectorAll('.md-live-list-marker-widget')).toHaveLength(2)

    const positions: number[] = []
    for (let index = 0; index < 4; index += 1) {
      const moved = view.moveByChar(view.state.selection.main, false)
      view.dispatch({ selection: moved, userEvent: 'select' })
      positions.push(view.state.selection.main.head)
    }

    expect(positions).toEqual([21, 20, 19, 18])

    view.destroy()
  })

  it('does not render marker-looking inline content as another list marker', () => {
    const doc = '2. 2.'
    const view = new EditorView({
      state: EditorState.create({
        doc,
        selection: { anchor: doc.length },
        extensions: [markdown(), markdownLivePreviewExtension(true)],
      }),
      parent: document.body,
    })

    expect(view.dom.querySelectorAll('.md-live-list-marker-widget')).toHaveLength(1)

    cursorCharLeft(view)
    expect(view.state.selection.main.head).toBe(4)

    view.destroy()

    const backspaceView = new EditorView({
      state: EditorState.create({
        doc,
        selection: { anchor: doc.length },
        extensions: [markdown(), markdownLivePreviewExtension(true)],
      }),
      parent: document.body,
    })

    deleteCharBackward(backspaceView)
    expect(backspaceView.state.doc.toString()).toBe('2. 2')
    expect(backspaceView.state.selection.main.head).toBe(4)

    backspaceView.destroy()
  })

  it('splits before an existing ordered-list marker without duplicating the marker', () => {
    const doc = '1. Premier 误判断修复 2. 非Premier 进入Premier流程修复 '
    const splitAt = doc.indexOf('2. 非Premier')
    const view = new EditorView({
      state: EditorState.create({
        doc,
        selection: { anchor: splitAt },
        extensions: [markdown(), markdownLivePreviewExtension(true)],
      }),
      parent: document.body,
    })

    const enterEvent = new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true,
    })
    view.contentDOM.dispatchEvent(enterEvent)

    expect(enterEvent.defaultPrevented).toBe(true)
    expect(view.state.doc.toString()).toBe('1. Premier 误判断修复\n2. 非Premier 进入Premier流程修复 ')
    expect(view.state.selection.main.head).toBe('1. Premier 误判断修复\n'.length)

    view.destroy()
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
    expect(view.dom.querySelector('.md-live-table-widget')).not.toBeNull()

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

  it('keeps rendered markdown syntax stable while exposing editable block sources', () => {
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
    expect(Array.from(view.dom.querySelectorAll('.md-live-table-cell-input')).map(cell => (cell as HTMLInputElement).value)).toContain('A')
    expect(rendered).not.toContain('# Stable Heading')
    expect(rendered).not.toContain('- [ ] Task')
    expect(rendered).not.toContain('- item')
    expect(rendered).not.toContain('> quote')
    expect(rendered).not.toContain('**bold**')
    expect(rendered).not.toContain('[link](https://example.com)')
    expect(rendered).not.toContain('`code`')
    expect(rendered).not.toContain('| A | B |')
    expect(rendered).not.toContain('```ts')
    expect(view.dom.querySelector('.md-live-code-copy-button')).not.toBeNull()
    expect((view.dom.querySelector('.md-live-code-language-input') as HTMLInputElement | null)?.value).toBe('ts')

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

  it('renders fenced code with editable source controls', () => {
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
    expect(rendered).not.toContain('```java')
    expect(view.dom.querySelector('.md-live-codeblock-first')).not.toBeNull()
    expect(view.dom.querySelector('.md-live-codeblock-last')).not.toBeNull()
    expect(view.dom.querySelector('.md-live-codeblock-fence-hidden')).not.toBeNull()
    expect(view.dom.querySelector('.md-live-codeblock-fence-toolbar')).toBeNull()
    expect(view.dom.querySelector('.md-live-codeblock-fence-footer')).toBeNull()
    expect(view.dom.querySelector('.md-live-code-keyword')).not.toBeNull()
    expect(view.dom.querySelector('.md-live-code-copy-button')).not.toBeNull()
    const languageInput = view.dom.querySelector('.md-live-code-language-input') as HTMLInputElement | null
    expect(languageInput?.value).toBe('java')
    expect(languageInput?.closest('.cm-line')?.classList.contains('md-live-codeblock-last')).toBe(true)

    view.destroy()
  })

  it('renders complete markdown tables as one aligned block', () => {
    const view = new EditorView({
      state: EditorState.create({
        doc: [
          '| 文件 | 区域 | 改动 | 数量 |',
          '| --- | --- | --- | --- |',
          '| `nlp_test.lua` | selectChatBot（表内） | `["8068857300"]` 函数（2 行改动） | 1 |',
          '| `iva_router.lua` | iva_config_insert | IN + Think -> iva | 1 |',
        ].join('\n'),
        extensions: [markdown(), markdownLivePreviewExtension(true)],
      }),
      parent: document.body,
    })

    const table = view.dom.querySelector('.md-live-table-widget') as HTMLElement | null
    expect(table).not.toBeNull()
    expect(view.dom.querySelector('.md-live-table-row')).toBeNull()
    expect(table?.style.getPropertyValue('--md-live-table-columns')).toBe('4')
    expect(Array.from(view.dom.querySelectorAll('.md-live-table-cell.header .md-live-table-cell-input')).map(cell => (cell as HTMLInputElement).value)).toEqual([
      '文件',
      '区域',
      '改动',
      '数量',
    ])
    expect(Array.from(view.dom.querySelectorAll('.md-live-table-cell-input')).map(cell => (cell as HTMLInputElement).value)).toContain('`nlp_test.lua`')
    expect(view.dom.textContent).not.toContain('| --- | --- |')

    view.destroy()
  })

  it('edits rendered table cells and writes Markdown table source', () => {
    const view = new EditorView({
      state: EditorState.create({
        doc: [
          '| A | B |',
          '| --- | --- |',
          '| C | D |',
        ].join('\n'),
        extensions: [markdown(), markdownLivePreviewExtension(true)],
      }),
      parent: document.body,
    })

    const inputs = Array.from(view.dom.querySelectorAll('.md-live-table-cell-input')) as HTMLInputElement[]
    expect(inputs.map(input => input.value)).toEqual(['A', 'B', 'C', 'D'])
    inputs[2].value = 'Changed'
    inputs[2].dispatchEvent(new Event('change', { bubbles: true }))

    expect(view.state.doc.toString()).toBe([
      '| A | B |',
      '| --- | --- |',
      '| Changed | D |',
    ].join('\n'))

    view.destroy()
  })

  it('edits fenced code language from the live-preview language field and copies code', async () => {
    const view = new EditorView({
      state: EditorState.create({
        doc: '```java\nconst value = 1\n```',
        extensions: [markdown(), markdownLivePreviewExtension(true)],
      }),
      parent: document.body,
    })

    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })

    const languageInput = view.dom.querySelector('.md-live-code-language-input') as HTMLInputElement | null
    expect(languageInput?.value).toBe('java')
    if (!languageInput) throw new Error('Missing language input')
    languageInput.value = 'ts'
    languageInput.dispatchEvent(new Event('change', { bubbles: true }))
    expect(view.state.doc.toString()).toBe('```ts\nconst value = 1\n```')

    const copyButton = view.dom.querySelector('.md-live-code-copy-button') as HTMLButtonElement | null
    copyButton?.click()
    await Promise.resolve()
    expect(writeText).toHaveBeenCalledWith('const value = 1')

    view.destroy()
  })

  it('collapses and expands fenced code blocks without changing source text', () => {
    const doc = [
      '```ts',
      'const first = 1',
      'const second = 2',
      'const third = 3',
      '```',
    ].join('\n')
    const view = new EditorView({
      state: EditorState.create({
        doc,
        extensions: [markdown(), markdownLivePreviewExtension(true)],
      }),
      parent: document.body,
    })

    const foldButton = view.dom.querySelector('.md-live-codeblock-topbar .md-live-codeblock-fold-toggle') as HTMLButtonElement | null
    expect(foldButton?.getAttribute('aria-expanded')).toBe('true')
    expect(foldButton?.dataset.foldState).toBe('expanded')
    foldButton?.click()

    expect(view.state.doc.toString()).toBe(doc)
    expect(view.dom.querySelector('.md-live-codeblock-fold-summary-line')).not.toBeNull()
    expect(view.dom.textContent).toContain('ts block - 3 lines hidden')
    expect(view.dom.textContent).not.toContain('const second = 2')
    expect(view.dom.querySelector('.md-live-codeblock-fold-summary-line .md-live-fold-summary')).not.toBeNull()
    const showButton = view.dom.querySelector('.md-live-codeblock-fold-summary-line .md-live-codeblock-topbar .md-live-codeblock-fold-toggle') as HTMLButtonElement | null
    expect(showButton?.getAttribute('aria-label')).toBe('Show code block')
    expect(showButton?.getAttribute('aria-expanded')).toBe('false')
    expect(showButton?.dataset.foldState).toBe('collapsed')

    showButton?.click()

    expect(view.state.doc.toString()).toBe(doc)
    expect(view.dom.textContent).toContain('const second = 2')
    expect(view.dom.querySelector('.md-live-code-language-input')).not.toBeNull()

    view.destroy()
  })

  it('collapses fenced code blocks whose first content line is empty', () => {
    const doc = [
      '```txt',
      '',
      '<System_Persona>',
      'body',
      '```',
    ].join('\n')
    const view = new EditorView({
      state: EditorState.create({
        doc,
        extensions: [markdown(), markdownLivePreviewExtension(true)],
      }),
      parent: document.body,
    })

    const foldButton = view.dom.querySelector('.md-live-codeblock-topbar .md-live-codeblock-fold-toggle') as HTMLButtonElement | null
    foldButton?.click()

    expect(view.state.doc.toString()).toBe(doc)
    expect(view.dom.querySelector('.md-live-codeblock-fold-summary-line')).not.toBeNull()
    expect(view.dom.textContent).toContain('txt block - 3 lines hidden')
    expect(view.dom.textContent).not.toContain('<System_Persona>')
    expect(view.dom.querySelector('.md-live-codeblock-fold-summary-line .md-live-codeblock-fold-toggle')?.getAttribute('aria-label')).toBe('Show code block')

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
    expect(rendered).not.toContain('```java')
    expect(view.dom.querySelector('.md-live-code')).not.toBeNull()
    expect((view.dom.querySelector('.md-live-code-language-input') as HTMLInputElement | null)?.value).toBe('java')

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
    expect(rendered).not.toContain('```java')
    expect(view.dom.querySelector('.md-live-codeblock-first')).not.toBeNull()
    expect(view.dom.querySelector('.md-live-codeblock-last')).not.toBeNull()
    expect((view.dom.querySelector('.md-live-code-language-input') as HTMLInputElement | null)?.value).toBe('java')

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

  it('does not delete hidden syntax while IME composition is active', () => {
    const view = new EditorView({
      state: EditorState.create({
        doc: '# 标题',
        selection: { anchor: 2 },
        extensions: [markdown(), markdownLivePreviewExtension(true)],
      }),
      parent: document.body,
    })

    view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Backspace',
      isComposing: true,
      bubbles: true,
      cancelable: true,
    }))

    expect(view.state.doc.toString()).toBe('# 标题')

    view.destroy()
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

  it('renders resolved Markdown images as inline preview widgets', async () => {
    const resolveAsset = vi.fn().mockResolvedValue({
      kind: 'image',
      rawTarget: 'image.png',
      absolutePath: '/tmp/image.png',
      fileName: 'image.png',
      mimeType: 'image/png',
      dataUrl: 'data:image/png;base64,aW1hZ2U=',
    })
    const view = new EditorView({
      state: EditorState.create({
        doc: 'active\n\n![alt](image.png)',
        selection: { anchor: 0 },
        extensions: [markdown(), markdownLivePreviewExtension(true, { resolveAsset })],
      }),
      parent: document.body,
    })

    await Promise.resolve()
    await Promise.resolve()

    const image = view.dom.querySelector('.md-live-image-preview') as HTMLImageElement | null
    expect(resolveAsset).toHaveBeenCalledWith('image.png', { kind: 'image' })
    expect(image?.getAttribute('src')).toBe('data:image/png;base64,aW1hZ2U=')
    expect(image?.getAttribute('alt')).toBe('alt')
    expect((view.dom.querySelector('.md-live-source-input') as HTMLInputElement | null)?.value).toBe('![alt](image.png)')

    view.destroy()
  })

  it('keeps image preview DOM stable while typing before the image', async () => {
    const resolveAsset = vi.fn().mockResolvedValue({
      kind: 'image',
      rawTarget: 'image.png',
      absolutePath: '/tmp/image.png',
      fileName: 'image.png',
      mimeType: 'image/png',
      dataUrl: 'data:image/png;base64,aW1hZ2U=',
    })
    const view = new EditorView({
      state: EditorState.create({
        doc: 'intro\n![alt](image.png)',
        extensions: [markdown(), markdownLivePreviewExtension(true, { resolveAsset })],
      }),
      parent: document.body,
    })

    await Promise.resolve()
    await Promise.resolve()

    const image = view.dom.querySelector('.md-live-image-preview')
    expect(image).not.toBeNull()
    view.dispatch({ changes: { from: 0, insert: 'x' } })
    await Promise.resolve()
    await Promise.resolve()

    expect(resolveAsset).toHaveBeenCalledTimes(1)
    expect(view.dom.querySelector('.md-live-image-preview')).toBe(image)

    const toggle = view.dom.querySelector('.md-live-source-toggle') as HTMLButtonElement | null
    toggle?.click()
    const sourceInput = view.dom.querySelector('.md-live-source-input') as HTMLInputElement | null
    if (!sourceInput) throw new Error('Missing image source input')
    sourceInput.value = '![new](next.png)'
    sourceInput.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true,
    }))

    expect(view.state.doc.toString()).toBe('xintro\n![new](next.png)')

    view.destroy()
  })

  it('renders Markdown image syntax with non-image extensions as file widgets', async () => {
    const resolveAsset = vi.fn().mockResolvedValue({
      kind: 'file',
      rawTarget: 'report.xlsx',
      absolutePath: '/tmp/report.xlsx',
      fileName: 'report.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    const view = new EditorView({
      state: EditorState.create({
        doc: '![report.xlsx](report.xlsx)',
        extensions: [markdown(), markdownLivePreviewExtension(true, { resolveAsset })],
      }),
      parent: document.body,
    })

    await Promise.resolve()
    await Promise.resolve()

    expect(view.dom.querySelector('.md-live-image-widget')).toBeNull()
    expect(view.dom.querySelector('.md-live-file-widget')?.textContent).toBe('report.xlsx')
    expect(resolveAsset).toHaveBeenCalledWith('report.xlsx', { kind: 'link' })

    view.destroy()
  })

  it('edits and clears Markdown image source from the preview source field', () => {
    const view = new EditorView({
      state: EditorState.create({
        doc: 'before\n![alt](image.png)\nafter',
        selection: { anchor: 0 },
        extensions: [markdown(), markdownLivePreviewExtension(true)],
      }),
      parent: document.body,
    })

    let toggle = view.dom.querySelector('.md-live-source-toggle') as HTMLButtonElement | null
    expect(toggle?.getAttribute('aria-expanded')).toBe('false')
    toggle?.click()
    let sourceInput = view.dom.querySelector('.md-live-source-input') as HTMLInputElement | null
    if (!sourceInput) throw new Error('Missing image source input')
    expect(sourceInput.closest('.md-live-asset-source-editor')?.classList.contains('editing')).toBe(true)
    expect(toggle?.getAttribute('aria-expanded')).toBe('true')
    document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    expect(sourceInput.closest('.md-live-asset-source-editor')?.classList.contains('editing')).toBe(false)
    expect(toggle?.getAttribute('aria-expanded')).toBe('false')

    toggle?.click()
    sourceInput = view.dom.querySelector('.md-live-source-input') as HTMLInputElement | null
    if (!sourceInput) throw new Error('Missing image source input after reopen')
    sourceInput.value = '![new](next.png)'
    sourceInput.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true,
    }))

    expect(view.state.doc.toString()).toBe('before\n![new](next.png)\nafter')

    toggle = view.dom.querySelector('.md-live-source-toggle') as HTMLButtonElement | null
    toggle?.click()
    sourceInput = view.dom.querySelector('.md-live-source-input') as HTMLInputElement | null
    if (!sourceInput) throw new Error('Missing image source input after edit')
    sourceInput.value = ''
    sourceInput.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true,
    }))

    expect(view.state.doc.toString()).toBe('before\n\nafter')

    view.destroy()
  })

  it('collapses and expands image previews without changing Markdown source', () => {
    const doc = 'before\n![alt](image.png)\nafter'
    const view = new EditorView({
      state: EditorState.create({
        doc,
        extensions: [markdown(), markdownLivePreviewExtension(true)],
      }),
      parent: document.body,
    })

    const foldButton = view.dom.querySelector('.md-live-asset-fold-toggle') as HTMLButtonElement | null
    expect(foldButton?.getAttribute('aria-expanded')).toBe('true')
    foldButton?.click()

    expect(view.state.doc.toString()).toBe(doc)
    expect(view.dom.querySelector('.md-live-image-widget')).toBeNull()
    expect(view.dom.querySelector('.md-live-asset-collapsed-widget')?.textContent).toBe('Image: alt')

    const showButton = view.dom.querySelector('.md-live-asset-frame.collapsed .md-live-asset-fold-toggle') as HTMLButtonElement | null
    expect(showButton?.getAttribute('aria-label')).toBe('Show image preview')
    expect(showButton?.getAttribute('aria-expanded')).toBe('false')
    expect(view.dom.querySelector('.md-live-asset-frame.collapsed .md-live-source-toggle')?.getAttribute('aria-label')).toBe('Image Markdown source')
    showButton?.click()

    expect(view.state.doc.toString()).toBe(doc)
    expect(view.dom.querySelector('.md-live-image-widget')).not.toBeNull()

    view.destroy()
  })

  it('renders Obsidian wiki embeds and dispatches resolved file clicks', async () => {
    const resolveAsset = vi.fn(async (target: string) => {
      if (target === 'assets/photo.png') {
        return {
          kind: 'image' as const,
          rawTarget: target,
          absolutePath: '/vault/assets/photo.png',
          fileName: 'photo.png',
          mimeType: 'image/png',
          dataUrl: 'data:image/png;base64,cGhvdG8=',
        }
      }
      if (target === 'data/report.xlsx') {
        return {
          kind: 'file' as const,
          rawTarget: target,
          absolutePath: '/vault/data/report.xlsx',
          fileName: 'report.xlsx',
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }
      }
      return {
        kind: 'file' as const,
        rawTarget: target,
        absolutePath: '/vault/docs/spec.pdf',
        fileName: 'spec.pdf',
        mimeType: 'application/pdf',
      }
    })
    const opened: unknown[] = []
    const view = new EditorView({
      state: EditorState.create({
        doc: 'active\n\n![[assets/photo.png]]\n![[data/report.xlsx]]\n[[docs/spec.pdf]]',
        selection: { anchor: 0 },
        extensions: [markdown(), markdownLivePreviewExtension(true, { resolveAsset })],
      }),
      parent: document.body,
    })
    view.dom.addEventListener('markdown-open-link', (event) => {
      opened.push((event as CustomEvent).detail)
    })

    await Promise.resolve()
    await Promise.resolve()

    expect(view.dom.querySelector('.md-live-image-preview')?.getAttribute('src')).toBe('data:image/png;base64,cGhvdG8=')
    expect(view.dom.querySelectorAll('.md-live-image-widget')).toHaveLength(1)
    const fileWidgets = Array.from(view.dom.querySelectorAll('.md-live-file-widget')) as HTMLButtonElement[]
    expect(fileWidgets.map(widget => widget.textContent)).toEqual(['report.xlsx', 'spec.pdf'])
    expect(fileWidgets[0]?.closest('.md-live-file-frame')?.querySelector('.md-live-asset-fold-toggle')).toBeNull()
    expect(Array.from(view.dom.querySelectorAll('.md-live-source-input')).map(node => (node as HTMLInputElement).value)).toEqual([
      '![[assets/photo.png]]',
      '![[data/report.xlsx]]',
      '[[docs/spec.pdf]]',
    ])

    fileWidgets[1]?.click()

    expect(opened).toEqual([
      expect.objectContaining({
        href: '/vault/docs/spec.pdf',
        asset: expect.objectContaining({ kind: 'file', absolutePath: '/vault/docs/spec.pdf' }),
      }),
    ])

    view.destroy()
  })

  it('keeps Obsidian wiki syntax literal inside code', () => {
    const doc = [
      'active',
      '',
      '`[[attatch/]]`',
      '``[[double-delimited]]``',
      '```md',
      '[[codeblock]]',
      '```',
      '[[docs/spec.pdf]]',
    ].join('\n')
    const view = new EditorView({
      state: EditorState.create({
        doc,
        selection: { anchor: 0 },
        extensions: [markdown(), markdownLivePreviewExtension(true)],
      }),
      parent: document.body,
    })

    const fileWidgets = Array.from(view.dom.querySelectorAll('.md-live-file-widget'))
      .map(widget => widget.textContent)
    expect(fileWidgets).toEqual(['spec.pdf'])
    expect(view.dom.textContent).toContain('[[attatch/]]')
    expect(view.dom.textContent).toContain('[[double-delimited]]')
    expect(view.dom.textContent).toContain('[[codeblock]]')

    view.destroy()
  })

  it('does not expose fold controls for long Markdown lists', () => {
    const doc = [
      '- one',
      '- two',
      '- three',
      '- four',
      '- five',
      '- six',
    ].join('\n')
    const view = new EditorView({
      state: EditorState.create({
        doc,
        extensions: [markdown(), markdownLivePreviewExtension(true)],
      }),
      parent: document.body,
    })

    expect(view.state.doc.toString()).toBe(doc)
    expect(view.dom.querySelector('.md-live-list-fold-toggle')).toBeNull()
    expect(view.dom.querySelector('.md-live-list-fold-summary')).toBeNull()
    expect(view.dom.textContent).toContain('one')
    expect(view.dom.textContent).toContain('six')

    view.destroy()
  })

  it('honors feature switches for rich Markdown widgets', () => {
    const doc = [
      '---',
      'title: Hidden',
      '---',
      '- [ ] Task',
      '![alt](image.png)',
      '$x$',
      '```ts',
      'const value = 1',
      '```',
      '| A | B |',
      '| --- | --- |',
      '| C | D |',
    ].join('\n')
    const view = new EditorView({
      state: EditorState.create({
        doc,
        extensions: [
          markdown(),
          markdownLivePreviewExtension(true, {
            features: {
              tasks: false,
              tables: false,
              images: false,
              math: false,
              codeBlocks: false,
              frontmatter: false,
            },
          }),
        ],
      }),
      parent: document.body,
    })

    const rendered = view.dom.textContent || ''
    expect(view.dom.querySelector('.md-live-task-checkbox')).toBeNull()
    expect(view.dom.querySelector('.md-live-image-widget')).toBeNull()
    expect(view.dom.querySelector('.md-live-math')).toBeNull()
    expect(view.dom.querySelector('.md-live-codeblock-first')).toBeNull()
    expect(view.dom.querySelector('.md-live-frontmatter-widget')).toBeNull()
    expect(view.dom.querySelector('.md-live-table-widget')).toBeNull()
    expect(rendered).toContain('- [ ] Task')
    expect(rendered).toContain('![alt](image.png)')
    expect(rendered).toContain('$x$')
    expect(rendered).toContain('```ts')
    expect(rendered).toContain('| A | B |')

    view.destroy()
  })

  it('limits long-document asset work to visible and selected ranges', async () => {
    const resolveAsset = vi.fn().mockResolvedValue({
      kind: 'image',
      rawTarget: 'late.png',
      absolutePath: '/tmp/late.png',
      fileName: 'late.png',
      mimeType: 'image/png',
      dataUrl: 'data:image/png;base64,bGF0ZQ==',
    })
    const doc = [
      '# Top',
      ...Array.from({ length: 200 }, (_, index) => `plain ${index}`),
      '![late](late.png)',
    ].join('\n')
    const view = new EditorView({
      state: EditorState.create({
        doc,
        selection: { anchor: 0 },
        extensions: [
          markdown(),
          markdownLivePreviewExtension(true, {
            resolveAsset,
            fullScanLineLimit: 10,
            viewportLineMargin: 0,
          }),
        ],
      }),
      parent: document.body,
    })

    await Promise.resolve()
    await Promise.resolve()

    expect(resolveAsset).not.toHaveBeenCalled()
    expect(view.dom.querySelector('.md-live-image-widget')).toBeNull()

    view.dispatch({ selection: { anchor: doc.length } })
    await Promise.resolve()
    await Promise.resolve()

    expect(resolveAsset).toHaveBeenCalledWith('late.png', { kind: 'image' })
    expect(view.dom.querySelector('.md-live-image-widget')).not.toBeNull()

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
    view.scrollDOM.scrollTop = 120

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
    expect(view.scrollDOM.scrollTop).toBe(120)

    view.destroy()
  })
})
