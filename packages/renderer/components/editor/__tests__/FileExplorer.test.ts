// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick, reactive } from 'vue'
import FileExplorer from '../FileExplorer.vue'
import TreeDirectory from '../TreeDirectory.vue'

const revealPath = vi.fn().mockResolvedValue({ success: true })
const workspace = reactive({
  tree: new Map<string, any>(),
})

vi.mock('@/composables/useEditorWorkspace', () => ({
  useEditorWorkspace: () => ({
    workspace,
    loadDirectory: vi.fn(),
    openFile: vi.fn(),
    createFile: vi.fn(),
    createDirectory: vi.fn(),
    renamePath: vi.fn(),
    deletePath: vi.fn(),
    revealPath,
    toggleDirectory: vi.fn(),
  }),
}))

describe('FileExplorer', () => {
  afterEach(() => {
    revealPath.mockClear()
    workspace.tree.clear()
    document.body.innerHTML = ''
  })

  it('reveals the selected path from the context menu', async () => {
    const wrapper = mount(FileExplorer, {
      attachTo: document.body,
      props: {
        root: '/repo',
        activePath: '',
      },
    })

    wrapper.findComponent(TreeDirectory).vm.$emit('contextMenu', {
      path: '/repo/src/index.ts',
      type: 'file',
      x: 20,
      y: 30,
    })
    await nextTick()

    // P2: the right-click menu is `common/ContextMenu.vue` (a coordinate-pinned
    // Dropdown), so it teleports to <body> and carries the primitive's markup.
    const revealButton = Array.from(document.querySelectorAll('.app-context-item'))
      .find(button => button.textContent?.trim() === 'Reveal in Finder') as HTMLElement | undefined

    expect(revealButton).toBeTruthy()
    revealButton!.click()
    await nextTick()

    expect(revealPath).toHaveBeenCalledWith('/repo/src/index.ts')
  })

  it('emits file selections for the workbench to open as top-level tabs', async () => {
    const wrapper = mount(FileExplorer, {
      attachTo: document.body,
      props: {
        root: '/repo',
        activePath: '',
      },
    })

    wrapper.findComponent(TreeDirectory).vm.$emit('openFile', '/repo/src/index.ts')
    await nextTick()

    expect(wrapper.emitted('openFile')).toEqual([['/repo/src/index.ts']])
  })
})
