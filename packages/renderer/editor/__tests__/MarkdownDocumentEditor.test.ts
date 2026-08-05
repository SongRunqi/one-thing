// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import MarkdownDocumentEditor from '../MarkdownDocumentEditor.vue'

vi.mock('../TextEditor.vue', () => ({
  default: {
    name: 'TextEditor',
    props: ['modelValue', 'markdownLivePreview', 'markdownLivePreviewFeatures'],
    emits: ['update:modelValue', 'keydown', 'transaction', 'focus', 'blur', 'paste', 'cancel'],
    setup(props: { modelValue: string }, { emit, expose }: { emit: (name: string, ...args: unknown[]) => void; expose: (value: Record<string, unknown>) => void }) {
      const value = ref(props.modelValue)
      expose({
        focus: vi.fn(),
        blur: vi.fn(),
        getValue: () => value.value,
        getSelectedText: () => value.value,
        setValue: (next: string) => {
          value.value = next
          emit('update:modelValue', next)
        },
        getSelection: () => ({ from: 0, to: value.value.length }),
        setSelection: vi.fn(),
        replaceRange: vi.fn(),
        scrollToTop: vi.fn(),
        getScrollTop: () => 0,
        setScrollTop: vi.fn(),
        getCursorLineInfo: () => ({ lineNumber: 1, totalLines: 1, from: 0, to: value.value.length, text: value.value }),
      })
      return { value }
    },
    template: '<textarea class="mock-text-editor" :value="value" @keydown="$emit(\'keydown\', $event)" />',
  },
}))

describe('MarkdownDocumentEditor', () => {
  it('wraps TextEditor with live preview enabled and command toolbar actions', async () => {
    const wrapper = mount(MarkdownDocumentEditor, {
      props: {
        modelValue: 'hello',
        surface: 'todo-notes',
        documentId: 'note-1',
        toolbar: true,
      },
    })

    expect(wrapper.findComponent({ name: 'TextEditor' }).props('markdownLivePreview')).toBe(true)
    expect(wrapper.findComponent({ name: 'TextEditor' }).props('markdownLivePreviewFeatures')).toMatchObject({
      tasks: true,
      tables: true,
      images: true,
      math: true,
      codeBlocks: true,
      frontmatter: true,
    })

    await wrapper.find('[aria-label="Bold"]').trigger('click')
    await nextTick()

    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['**hello**'])
    expect(wrapper.emitted('command')?.at(-1)).toEqual(['bold'])
  })

  it('keeps the formatting toolbar hidden by default', () => {
    const wrapper = mount(MarkdownDocumentEditor, {
      props: { modelValue: 'hello' },
    })

    expect(wrapper.find('.markdown-document-toolbar').exists()).toBe(false)
  })

  it('passes feature switches through to the live preview editor', () => {
    const wrapper = mount(MarkdownDocumentEditor, {
      props: {
        modelValue: 'hello',
        features: {
          tables: false,
          images: false,
          math: false,
          codeBlocks: false,
          frontmatter: false,
        },
      },
    })

    expect(wrapper.findComponent({ name: 'TextEditor' }).props('markdownLivePreviewFeatures')).toMatchObject({
      tasks: true,
      tables: false,
      images: false,
      math: false,
      codeBlocks: false,
      frontmatter: false,
    })
  })

  it('toggles full-source mode without replacing the document editor', async () => {
    const wrapper = mount(MarkdownDocumentEditor, {
      props: { modelValue: '# hello' },
    })

    const button = wrapper.find('.markdown-source-toggle')
    expect(button.exists()).toBe(true)
    expect(wrapper.findComponent({ name: 'TextEditor' }).props('markdownLivePreview')).toBe(true)

    await button.trigger('click')
    await nextTick()

    expect(wrapper.findComponent({ name: 'TextEditor' }).props('markdownLivePreview')).toBe(false)
    expect(button.attributes('aria-pressed')).toBe('true')
  })

  it('emits explicit image open events from live-preview widgets', async () => {
    const wrapper = mount(MarkdownDocumentEditor, {
      props: { modelValue: '![alt](image.png)' },
    })

    wrapper.element.dispatchEvent(new CustomEvent('markdown-open-image', {
      bubbles: true,
      detail: { src: 'image.png', alt: 'alt' },
    }))
    await nextTick()

    expect(wrapper.emitted('openImage')?.[0]).toEqual([expect.objectContaining({ src: 'image.png', alt: 'alt' })])
  })
})
