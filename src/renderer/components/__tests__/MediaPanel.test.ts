// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import MediaPanel from '../MediaPanel.vue'
import type { MediaAsset } from '@/types'

vi.mock('../ArchivedChatsContent.vue', () => ({
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

  it('shows uploaded and generated image categories', () => {
    const wrapper = mount(MediaPanel, {
      props: { visible: true },
      global: { stubs: { ArchivedChatsContent: true } },
    })

    expect(wrapper.text()).toContain('Uploaded')
    expect(wrapper.text()).toContain('Generated')
    expect(wrapper.findAll('.media-item')).toHaveLength(2)
  })

  it('filters uploaded images separately from generated images', async () => {
    const wrapper = mount(MediaPanel, {
      props: { visible: true },
      global: { stubs: { ArchivedChatsContent: true } },
    })

    await wrapper.findAll('.source-tab')[1].trigger('click')

    expect(wrapper.findAll('.media-item')).toHaveLength(1)
    expect(wrapper.text()).toContain('pasted.png')
    expect(wrapper.text()).not.toContain('a glass city')
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
