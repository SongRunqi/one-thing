// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import FilePanel from '../FilePanel.vue'

vi.mock('@/components/editor/EditorWorkbench.vue', () => ({
  default: {
    name: 'EditorWorkbench',
    props: ['initialFilePath', 'workspaceRoot', 'active'],
    template: '<div class="mock-workbench">{{ initialFilePath }} {{ workspaceRoot }} {{ active }}</div>',
  },
}))

describe('FilePanel', () => {
  it('wraps EditorWorkbench with the file path and active state', () => {
    const wrapper = mount(FilePanel, {
      props: {
        filePath: '/tmp/example.ts',
        workspaceRoot: '/tmp',
        active: true,
      },
    })

    expect(wrapper.find('.mock-workbench').text()).toContain('/tmp/example.ts')
    expect(wrapper.find('.mock-workbench').text()).toContain('/tmp')
    expect(wrapper.find('.mock-workbench').text()).toContain('true')
  })
})
