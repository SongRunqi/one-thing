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
  electronAPI: {
    listVariables: vi.fn(),
    executeTool: vi.fn(),
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
    mocks.electronAPI.listVariables.mockResolvedValue({ success: true, variables: [] })
    Object.defineProperty(window, 'electronAPI', {
      value: mocks.electronAPI,
      configurable: true,
    })
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

  it('opens files inside additional workdir roots at the project root', async () => {
    const wrapper = mount(RightWorkbenchPanel, {
      props: {
        sessionId: 'session-1',
        workspaceRoot: '/repo',
        workspaceRoots: ['/repo', '/other-repo'],
      },
    })

    await (wrapper.vm as unknown as { openFile: (filePath: string) => Promise<void> })
      .openFile('/other-repo/src/a.ts')
    await settle()

    expect(wrapper.find('.mock-editor-workbench').text()).toContain('/other-repo /other-repo/src/a.ts true')
    expect(mocks.editorWorkspace.setWorkspaceRoot).toHaveBeenCalledWith('/other-repo')
    expect(mocks.editorWorkspace.setWorkspaceRoot).not.toHaveBeenCalledWith('/other-repo/src')
  })

  it('opens note files at the configured note directory', async () => {
    mocks.electronAPI.listVariables.mockResolvedValue({
      success: true,
      variables: [
        { name: 'workdir', value: '/repo', values: ['/repo'], scope: 'session' },
        { name: 'ai_note_dir', value: '/notes/ai', scope: 'global' },
        { name: 'user_note_dir', value: '/notes/user', scope: 'global' },
        { name: 'work_note_dir', value: '', scope: 'global' },
      ],
    })
    const wrapper = mount(RightWorkbenchPanel, {
      props: {
        sessionId: 'session-1',
        workspaceRoot: '/repo',
        workspaceRoots: ['/repo'],
      },
    })

    await (wrapper.vm as unknown as { openFile: (filePath: string) => Promise<void> })
      .openFile('/notes/user/daily/today.md')
    await settle()

    expect(wrapper.find('.mock-editor-workbench').text()).toContain('/notes/user /notes/user/daily/today.md true')
    expect(mocks.editorWorkspace.setWorkspaceRoot).toHaveBeenCalledWith('/notes/user')
    expect(mocks.editorWorkspace.setWorkspaceRoot).not.toHaveBeenCalledWith('/notes/user/daily')
  })

  it('opens explorer selections as top-level file tabs', async () => {
    const wrapper = mount(RightWorkbenchPanel, {
      props: {
        sessionId: 'session-1',
        workspaceRoot: '/repo',
      },
    })

    expect(wrapper.find('.empty-add').exists()).toBe(false)
    await wrapper.findAll('.empty-action').find(button => button.text() === 'Files')!.trigger('click')
    await settle()

    expect(wrapper.text()).toContain('Files')

    await wrapper.find('.mock-open-file').trigger('click')
    await settle()

    expect(wrapper.text()).toContain('b.ts')
    expect(mocks.editorWorkspace.openFile).toHaveBeenCalledWith('/repo/src/b.ts')
  })

  it('maps workbench tool icons to category slots 5 through 7', async () => {
    const wrapper = mount(RightWorkbenchPanel, {
      props: {
        sessionId: 'session-1',
        workspaceRoot: '/repo',
      },
    })

    const emptyActions = wrapper.findAll('.empty-action')
    expect(emptyActions.find(button => button.text() === 'Files')?.attributes('style')).toContain('--workbench-tool-icon-color: var(--ui-category-5-icon);')
    expect(emptyActions.find(button => button.text() === 'Terminal')?.attributes('style')).toContain('--workbench-tool-icon-color: var(--ui-category-6-icon);')
    expect(emptyActions.find(button => button.text() === 'Browser')?.attributes('style')).toContain('--workbench-tool-icon-color: var(--ui-category-7-icon);')

    await emptyActions.find(button => button.text() === 'Terminal')!.trigger('click')
    await settle()

    expect(wrapper.find('.workbench-tab-label').attributes('style')).toContain('--workbench-tool-icon-color: var(--ui-category-6-icon);')
  })
})
