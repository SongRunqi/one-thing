// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import RightWorkbenchPanel from '../RightWorkbenchPanel.vue'

const mocks = vi.hoisted(() => ({
  editorWorkspace: {
    setWorkspaceRoot: vi.fn().mockResolvedValue(undefined),
    openFile: vi.fn().mockResolvedValue(undefined),
  },
  electronAPI: {
    listVariables: vi.fn(),
    listTerminals: vi.fn(),
    createTerminal: vi.fn(),
    killTerminal: vi.fn(),
  },
}))

vi.mock('@/composables/useEditorWorkspace', () => ({
  useEditorWorkspace: () => mocks.editorWorkspace,
}))

// The real TerminalView opens an xterm instance — meaningless (and crash-prone)
// under happy-dom. The panel contract is just "render a view for terminalId".
vi.mock('@/components/terminal/TerminalView.vue', () => ({
  default: {
    name: 'TerminalView',
    props: ['terminalId'],
    template: '<div class="mock-terminal-view">{{ terminalId }}</div>',
  },
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
    setActivePinia(createPinia())
    mocks.electronAPI.listVariables.mockResolvedValue({ success: true, variables: [] })
    mocks.electronAPI.listTerminals.mockResolvedValue({ success: true, terminals: [] })
    mocks.electronAPI.createTerminal.mockResolvedValue({
      success: true,
      terminal: {
        id: 'pty-1',
        title: 'zsh',
        cwd: '/repo',
        shell: '/bin/zsh',
        cols: 80,
        rows: 24,
        createdAt: 0,
      },
    })
    mocks.electronAPI.killTerminal.mockResolvedValue({ success: true })
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

  it('creates a PTY per terminal tab and renders its view', async () => {
    const wrapper = mount(RightWorkbenchPanel, {
      props: {
        sessionId: 'session-1',
        workspaceRoot: '/repo',
      },
    })

    await wrapper.findAll('.empty-action').find(button => button.text() === 'Terminal')!.trigger('click')
    await settle()
    await settle()

    expect(mocks.electronAPI.createTerminal).toHaveBeenCalledWith(
      expect.objectContaining({ cwd: '/repo', sessionId: 'session-1' }),
    )
    expect(wrapper.find('.mock-terminal-view').text()).toContain('pty-1')
  })

  it('re-adopts surviving PTYs as tabs on mount (renderer reload recovery)', async () => {
    mocks.electronAPI.listTerminals.mockResolvedValue({
      success: true,
      terminals: [
        { id: 'pty-a', title: 'zsh', cwd: '/repo', shell: '/bin/zsh', cols: 80, rows: 24, createdAt: 0 },
        { id: 'pty-b', title: 'node', cwd: '/repo', shell: '/bin/zsh', cols: 80, rows: 24, createdAt: 0 },
      ],
    })

    const wrapper = mount(RightWorkbenchPanel, {
      props: {
        sessionId: 'session-1',
        workspaceRoot: '/repo',
      },
    })
    await settle()
    await settle()

    const labels = wrapper.findAll('.workbench-tab-label')
    expect(labels).toHaveLength(2)
    expect(wrapper.text()).toContain('zsh')
    expect(wrapper.text()).toContain('node')
  })
})
