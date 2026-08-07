// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import MediaPanel from '../MediaPanel.vue'
import { confirmStack, settleConfirm } from '@/composables/useConfirm'
import { destroyUiOverlayHost } from '@/services/ui-overlay-host'
import type { MediaAsset } from '@/types'

/** P2: the native `confirm()` is now the promise service. */
async function answerConfirm(accepted: boolean): Promise<void> {
  await vi.waitFor(() => expect(confirmStack.value.length).toBeGreaterThan(0))
  settleConfirm(confirmStack.value[confirmStack.value.length - 1].id, accepted)
}

vi.mock('../ArchivedChatsContent.vue', () => ({
  default: { template: '<div />' },
}))

vi.mock('../AgentsPanelContent.vue', () => ({
  default: { template: '<div />' },
}))

vi.mock('../SchedulerPanelContent.vue', () => ({
  default: { template: '<div />' },
}))

const storeState = vi.hoisted(() => ({
  mediaStore: {
    assets: [] as MediaAsset[],
    images: [] as MediaAsset[],
    kindCounts: {
      image: 0,
      video: 0,
      audio: 0,
      document: 0,
      file: 0,
    },
    isLoading: false,
    isRebuilding: false,
    loadMedia: vi.fn(),
    removeMedia: vi.fn(),
    getImageUrl: vi.fn((asset: MediaAsset) => `media://${asset.id}.png`),
  },
}))

const platformState = vi.hoisted(() => ({
  platformApi: {
    onImageGenerated: vi.fn(() => vi.fn()),
    openImageGallery: vi.fn(),
    openPath: vi.fn(),
  },
}))

vi.mock('@/stores/media', () => ({
  useMediaStore: () => storeState.mediaStore,
}))

vi.mock('@/platform', () => ({
  platformApi: platformState.platformApi,
}))

function imageAsset(overrides: Partial<MediaAsset>): MediaAsset {
  return {
    id: 'asset-1',
    kind: 'image',
    source: 'user-upload',
    mimeType: 'image/png',
    size: 10,
    fileName: 'upload.png',
    filePath: '/tmp/upload.png',
    links: [],
    createdAt: 1,
    ...overrides,
  }
}

function refreshCounts() {
  storeState.mediaStore.images = storeState.mediaStore.assets.filter(asset => asset.kind === 'image')
  storeState.mediaStore.kindCounts = {
    image: storeState.mediaStore.assets.filter(asset => asset.kind === 'image').length,
    video: storeState.mediaStore.assets.filter(asset => asset.kind === 'video').length,
    audio: storeState.mediaStore.assets.filter(asset => asset.kind === 'audio').length,
    document: storeState.mediaStore.assets.filter(asset => asset.kind === 'document').length,
    file: storeState.mediaStore.assets.filter(asset => asset.kind === 'file').length,
  }
}

describe('MediaPanel', () => {
  beforeEach(() => {
    storeState.mediaStore.assets = [
      imageAsset({ id: 'upload-1', source: 'user-upload', fileName: 'pasted.png', createdAt: 2 }),
      imageAsset({
        id: 'generated-1',
        source: 'ai-generated',
        fileName: 'generated.png',
        metadata: { prompt: 'a glass city', model: 'gpt-image-1' },
        createdAt: 1,
      }),
    ]
    refreshCounts()
    storeState.mediaStore.isLoading = false
    storeState.mediaStore.isRebuilding = false
    storeState.mediaStore.loadMedia.mockResolvedValue(undefined)
    storeState.mediaStore.removeMedia.mockResolvedValue(undefined)
    platformState.platformApi.onImageGenerated.mockReturnValue(vi.fn())
    Object.defineProperty(window, 'electronAPI', {
      value: {
        onImageGenerated: platformState.platformApi.onImageGenerated,
        openImageGallery: platformState.platformApi.openImageGallery,
        openPath: platformState.platformApi.openPath,
      },
      configurable: true,
    })
  })

  afterEach(() => {
    confirmStack.value = []
    destroyUiOverlayHost()
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  it('shows reusable search and filter controls without tab buttons', async () => {
    const wrapper = mount(MediaPanel, {
      props: { visible: true },
      global: { stubs: { ArchivedChatsContent: true } },
    })

    expect(wrapper.find('.media-filter-bar').exists()).toBe(true)
    expect(wrapper.find('.filter-search-input').exists()).toBe(true)
    expect(wrapper.findAll('.app-select-control')).toHaveLength(2)
    expect(wrapper.find('.kind-tabs').exists()).toBe(false)
    expect(wrapper.find('.source-tabs').exists()).toBe(false)
    expect(wrapper.text()).toContain('Uploaded')

    await wrapper.find('.media-source-filter .app-select-control').trigger('click')
    // 来源下拉的选项就这三个。上一版这里还断言过 'Tasks' —— 而 'Tasks' 根本不是
    // 来源选项,它是被**当时默认渲染的那条竖直导航**的标签偶然满足的
    // (测试没传 mode,默认走的是 side 形态)。改成钉真正的选项集合;
    // 导航标签由专门的导航用例去钉。
    expect(wrapper.text()).toContain('Uploaded')
    expect(wrapper.text()).toContain('Generated')
    expect(wrapper.text()).not.toContain('OK')
    expect(wrapper.findAll('.media-item')).toHaveLength(2)
  })

  it('loads the media index without rebuilding when the panel becomes visible', async () => {
    mount(MediaPanel, {
      props: { visible: true },
      global: { stubs: { ArchivedChatsContent: true } },
    })

    await vi.waitFor(() => {
      expect(storeState.mediaStore.loadMedia).toHaveBeenCalled()
    })
    expect(storeState.mediaStore.loadMedia).toHaveBeenCalledWith({ rebuild: false, force: false })
    expect(storeState.mediaStore.loadMedia).not.toHaveBeenCalledWith(expect.objectContaining({ rebuild: true }))
  })

  it('filters uploaded images separately from generated images', async () => {
    const wrapper = mount(MediaPanel, {
      props: { visible: true },
      global: { stubs: { ArchivedChatsContent: true } },
    })

    await wrapper.find('.media-source-filter .app-select-control').trigger('click')

    const uploadedOption = wrapper.findAll('.media-source-filter .app-select-option')
      .find(option => option.text().includes('Uploaded'))

    expect(uploadedOption).toBeTruthy()
    await uploadedOption!.trigger('click')

    expect(wrapper.findAll('.media-item')).toHaveLength(1)
    expect(wrapper.text()).toContain('pasted.png')
    expect(wrapper.text()).not.toContain('a glass city')
  })

  it('renders image thumbnails with intrinsic dimensions for masonry layout', () => {
    storeState.mediaStore.assets = [
      imageAsset({ id: 'portrait', width: 900, height: 1400, createdAt: 3 }),
      imageAsset({ id: 'landscape', width: 1600, height: 900, createdAt: 2 }),
    ]
    refreshCounts()

    const wrapper = mount(MediaPanel, {
      props: { visible: true },
      global: { stubs: { ArchivedChatsContent: true } },
    })

    const thumbnails = wrapper.findAll('.media-thumbnail')

    expect(thumbnails[0].attributes('width')).toBe('900')
    expect(thumbnails[0].attributes('height')).toBe('1400')
    expect(thumbnails[1].attributes('width')).toBe('1600')
    expect(thumbnails[1].attributes('height')).toBe('900')
  })

  it('shows a plain ledger note while media is loading', () => {
    storeState.mediaStore.isLoading = true

    const wrapper = mount(MediaPanel, {
      props: { visible: true },
      global: { stubs: { ArchivedChatsContent: true } },
    })

    expect(wrapper.find('.ledger-note').exists()).toBe(true)
    expect(wrapper.text()).toContain('loading media…')
    expect(wrapper.findAll('.media-item')).toHaveLength(0)

    storeState.mediaStore.isLoading = false
    storeState.mediaStore.isRebuilding = true
    const rebuildingWrapper = mount(MediaPanel, {
      props: { visible: true },
      global: { stubs: { ArchivedChatsContent: true } },
    })

    expect(rebuildingWrapper.find('.ledger-note').exists()).toBe(true)
    expect(rebuildingWrapper.text()).toContain('indexing media…')
  })

  it('keeps visited workspace panel views mounted when switching the active tab', async () => {
    const wrapper = mount(MediaPanel, {
      props: { visible: true, mode: 'main', activeTab: 'tasks' },
      global: { stubs: { ArchivedChatsContent: true } },
    })

    expect(wrapper.find('[data-workspace-panel-view="tasks"]').exists()).toBe(true)
    expect(wrapper.find('[data-workspace-panel-view="media"]').exists()).toBe(false)
    expect(wrapper.find('.main-panel-title').exists()).toBe(false)
    expect(wrapper.find('.main-panel-header-spacer').exists()).toBe(true)

    await wrapper.setProps({ activeTab: 'media' })

    expect(wrapper.find('[data-workspace-panel-view="tasks"]').exists()).toBe(true)
    expect(wrapper.find('[data-workspace-panel-view="media"]').exists()).toBe(true)

    await wrapper.setProps({ activeTab: 'agents' })

    expect(wrapper.find('[data-workspace-panel-view="tasks"]').exists()).toBe(true)
    expect(wrapper.find('[data-workspace-panel-view="media"]').exists()).toBe(true)
    expect(wrapper.find('[data-workspace-panel-view="agents"]').exists()).toBe(true)
  })

  it('gives every inPanelNav entry a clickable tab in the main window', async () => {
    /*
     * **真机走查抓到的缺陷的回归防线。**
     *
     * 面板内导航此前的条件是 `v-if="mode !== 'main'"`,而唯一的使用点
     * (App.vue)传的正是 `mode="main"` —— 导航条从不渲染。后果:
     *  · 内置的 `archive` 是 nav-only(inSidebarMenu: false),侧栏 ⋯ 菜单按定义
     *    不含它 —— 主窗口里**根本进不去**;
     *  · 全部插件面板同理(它们也进不了 ⋯ 菜单)。
     * 两个入口丢失是同一个原因,而这个缺陷早于插件系统存在。
     */
    const { setPluginWorkspacePanels } = await import('@/workspace/panel-registry')
    setPluginWorkspacePanels([
      { pluginId: 'ui-demo', pluginName: 'UI Demo', panelId: 'demo', label: 'UI Demo', loaded: true },
    ])

    const wrapper = mount(MediaPanel, {
      props: { visible: true, activeTab: 'media' },
      global: { stubs: { ArchivedChatsContent: true, PluginPanelHost: true } },
    })
    await nextTick()

    const labels = wrapper.findAll('.workspace-tab').map(tab => tab.text())
    // nav-only 的内置面板与插件面板都必须在导航里 —— 它们没有别的入口。
    expect(labels).toContain('Archived Chats')
    expect(labels).toContain('UI Demo')
    // 侧栏菜单里的那些当然也在(面板内导航是超集)。
    expect(labels).toContain('Media')

    setPluginWorkspacePanels([])
  })

  it('switches to a nav-only builtin and to a plugin panel by clicking its tab', async () => {
    const { setPluginWorkspacePanels } = await import('@/workspace/panel-registry')
    setPluginWorkspacePanels([
      { pluginId: 'ui-demo', pluginName: 'UI Demo', panelId: 'demo', label: 'UI Demo', loaded: true },
    ])

    const wrapper = mount(MediaPanel, {
      props: { visible: true, activeTab: 'media' },
      global: { stubs: { ArchivedChatsContent: true, PluginPanelHost: true } },
    })
    await nextTick()

    const tabFor = (label: string) => wrapper.findAll('.workspace-tab').find(tab => tab.text() === label)!

    await tabFor('Archived Chats').trigger('click')
    expect(wrapper.find('[data-workspace-panel-view="archive"]').exists()).toBe(true)

    await tabFor('UI Demo').trigger('click')
    expect(wrapper.find('[data-workspace-panel-view="plugin:ui-demo:demo"]').exists()).toBe(true)

    setPluginWorkspacePanels([])
  })

  it('keeps the tab of an enabled-but-broken plugin — declaration precedes code', async () => {
    // 加载失败的插件入口要留着:清单来自 manifest,不需要插件跑起来,
    // 点开由 PluginPanelHost 说明原因。
    const { setPluginWorkspacePanels } = await import('@/workspace/panel-registry')
    setPluginWorkspacePanels([
      { pluginId: 'broken', pluginName: 'Broken', panelId: 'p', label: 'Broken Panel', loaded: false },
    ])

    const wrapper = mount(MediaPanel, {
      props: { visible: true, activeTab: 'media' },
      global: { stubs: { ArchivedChatsContent: true, PluginPanelHost: true } },
    })
    await nextTick()

    expect(wrapper.findAll('.workspace-tab').map(tab => tab.text())).toContain('Broken Panel')
    setPluginWorkspacePanels([])
  })

  it('drops the tab when the plugin is disabled, and falls back if it was open', async () => {
    const { setPluginWorkspacePanels } = await import('@/workspace/panel-registry')
    setPluginWorkspacePanels([
      { pluginId: 'ui-demo', pluginName: 'UI Demo', panelId: 'demo', label: 'UI Demo', loaded: true },
    ])

    const wrapper = mount(MediaPanel, {
      props: { visible: true, activeTab: 'plugin:ui-demo:demo' },
      global: { stubs: { ArchivedChatsContent: true, PluginPanelHost: true } },
    })
    await nextTick()
    expect(wrapper.findAll('.workspace-tab').map(tab => tab.text())).toContain('UI Demo')

    // 停用 → 清单里没有它了(R5 的回落在新入口下仍要成立)。
    setPluginWorkspacePanels([])
    await nextTick()

    expect(wrapper.findAll('.workspace-tab').map(tab => tab.text())).not.toContain('UI Demo')
    expect(wrapper.find('[data-workspace-panel-view="media"]').exists()).toBe(true)
    expect(wrapper.find('[data-workspace-panel-view="plugin:ui-demo:demo"]').exists()).toBe(false)
  })

  it('falls back to media when the open plugin panel disappears', async () => {
    // 停用一个插件(或它被熔断自动禁用)之后入口会从清单里消失,但 activeNav
    // 还指着那个 nav id —— 导航条上没有任何一项高亮,主区一片空白,而且没有一句
    // 话解释发生了什么。
    const { setPluginWorkspacePanels } = await import('@/workspace/panel-registry')
    setPluginWorkspacePanels([
      { pluginId: 'log-monitor', pluginName: 'Log monitor', panelId: 'logs', label: 'Agent logs', loaded: true },
    ])

    const wrapper = mount(MediaPanel, {
      props: { visible: true, mode: 'main', activeTab: 'plugin:log-monitor:logs' },
      global: { stubs: { ArchivedChatsContent: true, PluginPanelHost: true } },
    })
    await nextTick()
    expect(wrapper.find('[data-workspace-panel-view="plugin:log-monitor:logs"]').exists()).toBe(true)

    // 插件被停用 → 清单里没有它了。
    setPluginWorkspacePanels([])
    await nextTick()

    expect(wrapper.find('[data-workspace-panel-view="media"]').exists()).toBe(true)
    expect(wrapper.find('[data-workspace-panel-view="plugin:log-monitor:logs"]').exists()).toBe(false)
  })

  it('removes assets from the library without requiring message edits', async () => {
    const wrapper = mount(MediaPanel, {
      props: { visible: true },
      global: { stubs: { ArchivedChatsContent: true } },
    })

    await wrapper.find('.delete-btn').trigger('click')
    await answerConfirm(true)

    await vi.waitFor(() =>
      expect(storeState.mediaStore.removeMedia).toHaveBeenCalledWith('upload-1'))
  })
})
