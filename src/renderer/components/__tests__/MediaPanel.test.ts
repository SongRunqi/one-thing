// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import MediaPanel from '../MediaPanel.vue'
import type { MediaAsset } from '@/types'

vi.mock('../ArchivedChatsContent.vue', () => ({
  default: { template: '<div />' },
}))

vi.mock('../AgentsPanelContent.vue', () => ({
  default: { template: '<div />' },
}))

vi.mock('../memory/MemoryPanelContent.vue', () => ({
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

vi.mock('@/stores/media', () => ({
  useMediaStore: () => storeState.mediaStore,
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
    vi.stubGlobal('confirm', vi.fn(() => true))
    Object.defineProperty(window, 'electronAPI', {
      value: {
        onImageGenerated: vi.fn(() => vi.fn()),
        openImageGallery: vi.fn(),
        openPath: vi.fn(),
      },
      configurable: true,
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  it('shows reusable search and filter controls without tab buttons', () => {
    const wrapper = mount(MediaPanel, {
      props: { visible: true },
      global: { stubs: { ArchivedChatsContent: true } },
    })

    expect(wrapper.find('.media-filter-bar').exists()).toBe(true)
    expect(wrapper.find('.filter-search-input').exists()).toBe(true)
    expect(wrapper.findAll('.filter-select-trigger')).toHaveLength(2)
    expect(wrapper.find('.filter-select-count').exists()).toBe(false)
    expect(wrapper.find('.kind-tabs').exists()).toBe(false)
    expect(wrapper.find('.source-tabs').exists()).toBe(false)
    expect(wrapper.text()).toContain('Uploaded')
    expect(wrapper.text()).toContain('Generated')
    expect(wrapper.text()).toContain('Tasks')
    expect(wrapper.text()).not.toContain('OK')
    expect(wrapper.findAll('.media-item')).toHaveLength(2)
  })

  it('filters uploaded images separately from generated images', async () => {
    const wrapper = mount(MediaPanel, {
      props: { visible: true },
      global: { stubs: { ArchivedChatsContent: true } },
    })

    await wrapper.find('.media-source-filter .filter-select-trigger').trigger('click')

    const uploadedOption = wrapper.findAll('.media-source-filter .filter-select-option')
      .find(option => option.text().includes('Uploaded'))

    expect(uploadedOption).toBeTruthy()
    expect(uploadedOption!.find('.filter-select-count').exists()).toBe(false)
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

  it('uses themed loading spinner while media is loading', () => {
    storeState.mediaStore.isLoading = true

    const wrapper = mount(MediaPanel, {
      props: { visible: true },
      global: { stubs: { ArchivedChatsContent: true } },
    })

    expect(wrapper.find('.loading-spinner-root').exists()).toBe(true)
    expect(wrapper.find('.loading-spinner-ring').exists()).toBe(true)
    expect(wrapper.text()).toContain('Loading media...')
    expect(wrapper.findAll('.media-item')).toHaveLength(0)

    storeState.mediaStore.isLoading = false
    storeState.mediaStore.isRebuilding = true
    const rebuildingWrapper = mount(MediaPanel, {
      props: { visible: true },
      global: { stubs: { ArchivedChatsContent: true } },
    })

    expect(rebuildingWrapper.find('.loading-spinner-root').exists()).toBe(true)
    expect(rebuildingWrapper.text()).toContain('Indexing media...')
  })

  it('keeps visited workspace panel views mounted when switching the active tab', async () => {
    const wrapper = mount(MediaPanel, {
      props: { visible: true, mode: 'main', activeTab: 'memory' },
      global: { stubs: { ArchivedChatsContent: true } },
    })

    expect(wrapper.find('[data-workspace-panel-view="memory"]').exists()).toBe(true)
    expect(wrapper.find('[data-workspace-panel-view="media"]').exists()).toBe(false)

    await wrapper.setProps({ activeTab: 'media' })

    expect(wrapper.find('[data-workspace-panel-view="memory"]').exists()).toBe(true)
    expect(wrapper.find('[data-workspace-panel-view="media"]').exists()).toBe(true)

    await wrapper.setProps({ activeTab: 'agents' })

    expect(wrapper.find('[data-workspace-panel-view="memory"]').exists()).toBe(true)
    expect(wrapper.find('[data-workspace-panel-view="media"]').exists()).toBe(true)
    expect(wrapper.find('[data-workspace-panel-view="agents"]').exists()).toBe(true)
  })

  it('removes assets from the library without requiring message edits', async () => {
    const wrapper = mount(MediaPanel, {
      props: { visible: true },
      global: { stubs: { ArchivedChatsContent: true } },
    })

    await wrapper.find('.delete-btn').trigger('click')

    expect(storeState.mediaStore.removeMedia).toHaveBeenCalledWith('upload-1')
  })
})
