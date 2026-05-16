// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import TextEditor from '../TextEditor.vue'
import type { EditorHandle } from '../types'

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
    document.body.innerHTML = ''
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
})
