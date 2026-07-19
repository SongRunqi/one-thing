// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import CommandPicker from '../CommandPicker.vue'
import FilePicker from '../FilePicker.vue'
import PathPicker from '../PathPicker.vue'
import type { ComposerExtensionItem } from '@/composables/usePickerOrchestration'
import type { PaletteItem } from '@/types/palette'

const paletteItem: PaletteItem = {
  id: 'command:compact',
  type: 'command',
  title: '/compact',
  description: 'Summarize older conversation history',
  command: {
    id: 'compact',
    name: 'Compact',
    description: 'Summarize older conversation history',
    usage: '/compact',
    execute: async () => ({ success: true }),
  },
}

const commandItem: ComposerExtensionItem = {
  id: 'command:compact',
  kind: 'command',
  title: '/compact',
  description: 'Summarize older conversation history',
  meta: '/compact',
  value: 'compact',
  paletteItem,
}

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
  it('renders slash commands as a lightweight command popover variant', async () => {
    const secondPaletteItem: PaletteItem = {
      ...paletteItem,
      id: 'command:memory',
      title: '/memory',
      description: 'Inspect memory notes',
      command: {
        ...paletteItem.command!,
        id: 'memory',
        name: 'Memory',
        description: 'Inspect memory notes',
        usage: '/memory status',
      },
    }
    const secondCommandItem: ComposerExtensionItem = {
      id: 'command:memory',
      kind: 'command',
      title: '/memory',
      description: 'Inspect memory notes',
      meta: '/memory status',
      value: 'memory',
      paletteItem: secondPaletteItem,
    }
    const wrapper = mount(CommandPicker, {
      props: {
        visible: true,
        items: [commandItem, secondCommandItem],
        selectedIndex: 1,
        query: 'compact',
      },
    })

    expect(wrapper.find('.composer-extension-panel.command-palette-panel').exists()).toBe(true)
    // Ledger layout: the command variant shows the ruled header line too.
    expect(wrapper.find('.composer-extension-header').exists()).toBe(true)
    expect(wrapper.findAll('.command-kind').map(kind => kind.text())).toEqual(['cmd', 'cmd'])
    expect(wrapper.find('.command-palette-list').attributes('role')).toBe('listbox')
    expect(wrapper.find('.command-palette-list').attributes('aria-activedescendant')).toContain('command-palette-option-1')
    expect(wrapper.find('.composer-extension-row').attributes('role')).toBe('option')
    expect(wrapper.findAll('.composer-extension-row')[1].attributes('aria-selected')).toBe('true')
    expect(wrapper.text()).toContain('/compact')
    expect(wrapper.text()).not.toContain('Command suggestions')
    expect(wrapper.find('.composer-extension-row.selected').exists()).toBe(true)

    await wrapper.find('.composer-extension-row').trigger('click')

    expect(wrapper.emitted('select')?.[0]).toEqual([paletteItem])
  })

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
