// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import FilePicker from '../FilePicker.vue'
import PathPicker from '../PathPicker.vue'
import type { ComposerExtensionItem } from '@/composables/usePickerOrchestration'

const fileItem: ComposerExtensionItem = {
  id: 'file:/repo/src/editor/TextEditor.vue',
  kind: 'file',
  title: 'src/editor/TextEditor.vue',
  description: '/repo/src/editor/TextEditor.vue',
  meta: 'File',
  value: '/repo/src/editor/TextEditor.vue',
}

const pathItem: ComposerExtensionItem = {
  id: 'path:/Users/me/project',
  kind: 'path',
  title: 'project',
  description: '/Users/me/project',
  meta: 'Directory',
  value: '/Users/me/project',
}

describe('composer extension pickers', () => {
  it('renders file rows as a composer extension and emits selected paths', async () => {
    const wrapper = mount(FilePicker, {
      props: {
        visible: true,
        items: [fileItem],
        selectedIndex: 0,
        query: 'editor',
      },
    })

    expect(wrapper.find('.composer-extension-row.selected').exists()).toBe(true)
    await wrapper.find('.composer-extension-row').trigger('click')

    expect(wrapper.emitted('select')?.[0]).toEqual(['/repo/src/editor/TextEditor.vue'])
  })

  it('renders path rows as a composer extension and emits selected directories', async () => {
    const wrapper = mount(PathPicker, {
      props: {
        visible: true,
        items: [pathItem],
        selectedIndex: 0,
        pathInput: '/Users/me',
      },
    })

    expect(wrapper.find('.composer-extension-row.selected').exists()).toBe(true)
    await wrapper.find('.composer-extension-row').trigger('click')

    expect(wrapper.emitted('select')?.[0]).toEqual(['/Users/me/project'])
  })
})
