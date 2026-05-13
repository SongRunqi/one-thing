// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { reactive } from 'vue'
import TreeDirectory from '../TreeDirectory.vue'

const workspace = reactive({
  tree: new Map<string, any>(),
})

vi.mock('@/composables/useEditorWorkspace', () => ({
  useEditorWorkspace: () => ({
    workspace,
    loadDirectory: vi.fn(),
    toggleDirectory: vi.fn(),
  }),
}))

describe('TreeDirectory', () => {
  afterEach(() => {
    workspace.tree.clear()
    vi.restoreAllMocks()
  })

  it('emits app context menu payload instead of calling native prompt', async () => {
    workspace.tree.set('/repo', {
      expanded: true,
      loading: false,
      entries: [
        { name: 'src', path: '/repo/src', type: 'directory' },
        { name: 'index.ts', path: '/repo/index.ts', type: 'file' },
      ],
    })
    workspace.tree.set('/repo/src', {
      expanded: false,
      loading: false,
      entries: [],
    })
    Object.defineProperty(window, 'prompt', {
      configurable: true,
      value: vi.fn(() => {
        throw new Error('prompt should not be called')
      }),
    })
    const promptSpy = vi.mocked(window.prompt)

    const wrapper = mount(TreeDirectory, {
      props: {
        dirPath: '/repo',
        depth: 0,
        activePath: '',
      },
    })

    await wrapper.find('.directory-row').trigger('contextmenu', {
      clientX: 12,
      clientY: 24,
    })

    expect(promptSpy).not.toHaveBeenCalled()
    expect(wrapper.emitted('contextMenu')?.[0]?.[0]).toEqual({
      path: '/repo',
      type: 'directory',
      x: 12,
      y: 24,
    })

    await wrapper.find('.file-row').trigger('contextmenu', {
      clientX: 40,
      clientY: 50,
    })

    expect(promptSpy).not.toHaveBeenCalled()
    expect(wrapper.emitted('contextMenu')?.[1]?.[0]).toEqual({
      path: '/repo/index.ts',
      type: 'file',
      x: 40,
      y: 50,
    })
  })
})
