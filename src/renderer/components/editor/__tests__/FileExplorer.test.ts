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

    const revealButton = wrapper
      .findAll('.explorer-menu button')
      .find(button => button.text() === 'Reveal in Finder')

    expect(revealButton).toBeTruthy()
    await revealButton!.trigger('click')
    await nextTick()

    expect(revealPath).toHaveBeenCalledWith('/repo/src/index.ts')
  })
})
