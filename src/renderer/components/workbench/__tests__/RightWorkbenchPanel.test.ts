// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import RightWorkbenchPanel from '../RightWorkbenchPanel.vue'

const mocks = vi.hoisted(() => ({
  editorWorkspace: {
    setWorkspaceRoot: vi.fn().mockResolvedValue(undefined),
    openFile: vi.fn().mockResolvedValue(undefined),
  },
}))

vi.mock('@/composables/useEditorWorkspace', () => ({
  useEditorWorkspace: () => mocks.editorWorkspace,
}))

vi.mock('@/components/editor/EditorWorkbench.vue', () => ({
  default: {
    name: 'EditorWorkbench',
    props: ['workspaceRoot', 'initialFilePath', 'active'],
    emits: ['openFile'],
    template: `
      <div class="mock-editor-workbench">
        {{ workspaceRoot }} {{ initialFilePath }} {{ active }}
        <button class="mock-open-file" @click="$emit('openFile', '/repo/src/b.ts')">open</button>
      </div>
    `,
  },
}))

async function settle() {
  await nextTick()
  await Promise.resolve()
  await nextTick()
}

describe('RightWorkbenchPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('opens files as top-level file tabs named after the file', async () => {
    const wrapper = mount(RightWorkbenchPanel, {
      props: {
        sessionId: 'session-1',
        workspaceRoot: '/repo',
      },
    })

    await (wrapper.vm as unknown as { openFile: (filePath: string) => Promise<void> })
      .openFile('/repo/src/a.ts')
    await settle()

    expect(wrapper.text()).toContain('a.ts')
    expect(wrapper.text()).not.toContain('Files')
    expect(wrapper.find('.mock-editor-workbench').text()).toContain('/repo /repo/src/a.ts true')
    expect(mocks.editorWorkspace.setWorkspaceRoot).toHaveBeenCalledWith('/repo')
    expect(mocks.editorWorkspace.openFile).toHaveBeenCalledWith('/repo/src/a.ts')
  })

  it('opens explorer selections as top-level file tabs', async () => {
    const wrapper = mount(RightWorkbenchPanel, {
      props: {
        sessionId: 'session-1',
        workspaceRoot: '/repo',
      },
    })

    await wrapper.find('.empty-add').trigger('click')
    await settle()
    await wrapper.findAll('.picker-option').find(button => button.text() === 'Files')!.trigger('click')
    await settle()

    expect(wrapper.text()).toContain('Files')

    await wrapper.find('.mock-open-file').trigger('click')
    await settle()

    expect(wrapper.text()).toContain('b.ts')
    expect(mocks.editorWorkspace.openFile).toHaveBeenCalledWith('/repo/src/b.ts')
  })
})
