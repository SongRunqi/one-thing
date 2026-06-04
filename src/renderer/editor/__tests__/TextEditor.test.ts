// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import TextEditor from '../TextEditor.vue'
import type { EditorHandle } from '../types'
import { createSkillToken } from '@shared/prompt-references'
import { DEFAULT_EDITOR_SETTINGS, languageExtensions } from '../extensions'

class ResizeObserverStub {
  observe = vi.fn()
  disconnect = vi.fn()
  unobserve = vi.fn()
}

function installDomStubs() {
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    return window.setTimeout(() => callback(performance.now()), 0)
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    window.clearTimeout(id)
  })

  Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      x: 0,
      y: 0,
      width: 320,
      height: 80,
      top: 0,
      right: 320,
      bottom: 80,
      left: 0,
      toJSON: () => ({}),
    }),
  })
  Object.defineProperty(HTMLElement.prototype, 'getClientRects', {
    configurable: true,
    value: () => [],
  })
  Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      toJSON: () => ({}),
    }),
  })
  Object.defineProperty(Range.prototype, 'getClientRects', {
    configurable: true,
    value: () => [],
  })
}

async function flushEditor() {
  await nextTick()
  await new Promise(resolve => window.setTimeout(resolve, 0))
  await nextTick()
}

async function mountEditor(
  props: Partial<InstanceType<typeof TextEditor>['$props']> = {},
): Promise<{ wrapper: VueWrapper; editor: EditorHandle }> {
  const wrapper = mount(TextEditor, {
    attachTo: document.body,
    props: {
      modelValue: '',
      profile: 'composer',
      language: 'markdown',
      ...props,
    },
  })
  await flushEditor()
  return { wrapper, editor: wrapper.vm as unknown as EditorHandle }
}

describe('TextEditor', () => {
  beforeEach(() => {
    installDomStubs()
  })

  afterEach(() => {
    document.body.textContent = ''
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('emits v-model and transaction updates from programmatic edits', async () => {
    const { wrapper, editor } = await mountEditor()

    editor.setValue('hello')
    await flushEditor()

    expect(editor.getValue()).toBe('hello')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['hello'])
    expect(wrapper.emitted('transaction')?.at(-1)?.[0]).toMatchObject({
      value: 'hello',
      docChanged: true,
      selectionChanged: true,
    })
  })

  it('supports replaceRange and selectionChange through the exposed handle', async () => {
    const { wrapper, editor } = await mountEditor({ modelValue: 'hello world' })

    editor.setSelection(6, 11)
    await flushEditor()
    editor.replaceRange(6, 11, 'editor')
    await flushEditor()

    expect(editor.getValue()).toBe('hello editor')
    expect(editor.getSelection()).toEqual({ from: 12, to: 12 })
    expect(wrapper.emitted('selectionChange')?.at(-1)?.[0]).toEqual({ from: 12, to: 12 })
  })

  it('preserves selection when external v-model changes replace the document', async () => {
    const { wrapper, editor } = await mountEditor({ modelValue: 'hello' })

    editor.setSelection(2)
    await flushEditor()
    await wrapper.setProps({ modelValue: 'hello world' })
    await flushEditor()

    expect(editor.getValue()).toBe('hello world')
    expect(editor.getSelection()).toEqual({ from: 2, to: 2 })
  })

  it('reconfigures readOnly, language, and settings without recreating the EditorView DOM', async () => {
    const { wrapper, editor } = await mountEditor({
      modelValue: 'const value = 1',
      language: 'javascript',
      settings: {
        tabSize: 2,
        lineWrapping: true,
        syntaxHighlighting: true,
        completionEnabled: true,
        composerMaxHeight: 200,
      },
    })
    const editorDom = wrapper.element.querySelector('.cm-editor')
    editor.setSelection(5)
    await flushEditor()

    await wrapper.setProps({
      readOnly: true,
      language: 'typescript',
      settings: {
        tabSize: 4,
        lineWrapping: false,
        syntaxHighlighting: true,
        completionEnabled: false,
        composerMaxHeight: 240,
      },
    })
    await flushEditor()

    expect(wrapper.element.querySelector('.cm-editor')).toBe(editorDom)
    expect(editor.getValue()).toBe('const value = 1')
    expect(editor.getSelection()).toEqual({ from: 5, to: 5 })
  })

  it('uses app highlight group variables for CodeMirror syntax highlighting', async () => {
    await mountEditor({
      modelValue: 'const value = "Ada"',
      language: 'javascript',
      settings: {
        tabSize: 2,
        lineWrapping: true,
        syntaxHighlighting: true,
        completionEnabled: true,
        composerMaxHeight: 200,
      },
    })
    await flushEditor()

    const styleText = Array.from(document.querySelectorAll('style'))
      .map(style => style.textContent || '')
      .join('\n')
    expect(styleText).toContain('--hg-syntax-keyword-fg')
    expect(styleText).toContain('--hg-syntax-string-fg')
  })

  it('does not load language or highlight extensions when syntax highlighting is disabled', () => {
    const extensions = languageExtensions({
      ...DEFAULT_EDITOR_SETTINGS,
      syntaxHighlighting: false,
    }, 'javascript')

    expect(extensions).toEqual([])
  })

  it('renders markdown live preview widgets without breaking v-model updates', async () => {
    const { wrapper, editor } = await mountEditor({
      modelValue: '# Title\n\n- [ ] Task',
      profile: 'markdown-document',
      markdownLivePreview: true,
    })

    await flushEditor()
    const checkbox = wrapper.element.querySelector('.md-live-task-checkbox') as HTMLButtonElement | null

    expect(checkbox).not.toBeNull()
    checkbox?.click()
    await flushEditor()

    expect(editor.getValue()).toBe('# Title\n\n- [x] Task')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['# Title\n\n- [x] Task'])
  })

  it('uses the theme editor caret token in markdown live preview', async () => {
    const { wrapper } = await mountEditor({
      modelValue: '# Title',
      profile: 'markdown-document',
      markdownLivePreview: true,
    })

    await flushEditor()

    const styleText = Array.from(document.querySelectorAll('style'))
      .map(style => style.textContent || '')
      .join('\n')
    expect(styleText).toContain('--editor-caret')
    expect(styleText).toContain('caret-color')
    expect(styleText).toContain('border-left')
    expect(wrapper.element.querySelector('.md-live-heading-1')).not.toBeNull()
  })

  it('removes prompt reference widgets from the composer close button', async () => {
    const { wrapper, editor } = await mountEditor({
      modelValue: 'before {{prompt:p1}} after',
      promptRefs: [{
        id: 'p1',
        title: 'Review Prompt',
        body: 'Review this.',
        createdAt: 1,
        updatedAt: 1,
      }],
    })

    await flushEditor()
    const close = wrapper.element.querySelector('.prompt-ref-widget-close') as HTMLButtonElement | null

    expect(close).not.toBeNull()
    close?.click()
    await flushEditor()

    expect(editor.getValue()).toBe('before  after')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['before  after'])
  })

  it('renders prompt reference popovers outside editor clipping containers', async () => {
    const { wrapper } = await mountEditor({
      modelValue: '{{prompt:p1}}',
      promptRefs: [{
        id: 'p1',
        title: 'Review Prompt',
        body: 'Review this.',
        createdAt: 1,
        updatedAt: 1,
      }],
    })

    const widget = wrapper.element.querySelector('.prompt-ref-widget') as HTMLElement | null
    widget?.dispatchEvent(new window.Event('mouseenter'))
    await flushEditor()

    const popover = document.body.querySelector('.prompt-ref-widget-floating-popover')
    expect(popover?.textContent).toContain('Review this.')
    expect(wrapper.element.contains(popover)).toBe(false)
  })

  it('renders command and skill references as composer widgets', async () => {
    const { wrapper } = await mountEditor({
      modelValue: `/compact then ${createSkillToken('user:skill-development')}`,
      commandRefs: [{
        id: 'compact',
        name: 'Compact Context',
        description: 'Summarize older conversation history',
        usage: '/compact',
        execute: vi.fn(),
      }],
      skillRefs: [{
        id: 'user:skill-development',
        name: 'Skill Development',
        description: 'Create or update skills',
        source: 'user',
        path: '/skills/skill-development/SKILL.md',
        directoryPath: '/skills/skill-development',
        enabled: true,
        instructions: 'Build skills carefully.',
      }],
    })

    await flushEditor()
    const command = wrapper.element.querySelector('.prompt-ref-widget.is-command')
    const skill = wrapper.element.querySelector('.prompt-ref-widget.is-skill')

    expect(command?.textContent).toContain('/compact')
    expect(skill?.textContent).toContain('Skill Development')
  })
})
