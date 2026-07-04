import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { MediaAsset, MediaKind, MediaQuery } from '@/types'
import { platformApi } from '@/platform'

export type GeneratedMedia = MediaAsset

function sortNewestFirst(a: MediaAsset, b: MediaAsset) {
  return b.createdAt - a.createdAt
}

export const useMediaStore = defineStore('media', () => {
  const mediaItems = ref<MediaAsset[]>([])
  const isLoading = ref(false)
  const isRebuilding = ref(false)
  const hasBackfilled = ref(false)
  const hasLoaded = ref(false)
  let activeLoad: Promise<void> | null = null
  let activeLoadKey = ''

  const assets = computed(() => mediaItems.value)
  const images = computed(() =>
    mediaItems.value.filter(m => m.kind === 'image').sort(sortNewestFirst)
  )

  const kindCounts = computed<Record<MediaKind, number>>(() => ({
    image: mediaItems.value.filter(m => m.kind === 'image').length,
    video: mediaItems.value.filter(m => m.kind === 'video').length,
    audio: mediaItems.value.filter(m => m.kind === 'audio').length,
    document: mediaItems.value.filter(m => m.kind === 'document').length,
    file: mediaItems.value.filter(m => m.kind === 'file').length,
  }))

  async function rebuildLibraryOnce(force = false) {
    if (hasBackfilled.value && !force) return
    isRebuilding.value = true
    try {
      await platformApi.rebuildMediaLibrary()
      hasBackfilled.value = true
    } catch (e) {
      console.error('Failed to rebuild media library:', e)
    } finally {
      isRebuilding.value = false
    }
  }

  async function loadMedia(options: { rebuild?: boolean; query?: MediaQuery; force?: boolean } = {}) {
    const queryKey = JSON.stringify(options.query ?? {})
    if (!options.rebuild && !options.force && hasLoaded.value && queryKey === activeLoadKey) return
    if (activeLoad && !options.force && !options.rebuild && queryKey === activeLoadKey) {
      return activeLoad
    }

    activeLoadKey = queryKey
    isLoading.value = true
    const load = (async () => {
      if (options.rebuild) {
        await rebuildLibraryOnce()
      }
      mediaItems.value = await platformApi.listMediaAssets(options.query)
      hasLoaded.value = true
    })()
    activeLoad = load

    try {
      await load
    } catch (e) {
      console.error('Failed to load media:', e)
    } finally {
      if (activeLoad === load) {
        activeLoad = null
        isLoading.value = false
      }
    }
  }

  async function saveImage(data: {
    url?: string
    base64?: string
    prompt: string
    revisedPrompt?: string
    model: string
    sessionId: string
    messageId: string
  }): Promise<GeneratedMedia | null> {
    try {
      const item = await platformApi.saveImage(data)
      await loadMedia()
      return mediaItems.value.find(asset => asset.id === item.id) || null
    } catch (e) {
      console.error('Failed to save image:', e)
      return null
    }
  }

  async function removeMedia(id: string) {
    try {
      await platformApi.hideMediaAsset(id)
      mediaItems.value = mediaItems.value.filter(m => m.id !== id)
    } catch (e) {
      console.error('Failed to remove media from library:', e)
    }
  }

  async function clearAll() {
    try {
      await platformApi.clearAllMedia()
      mediaItems.value = []
    } catch (e) {
      console.error('Failed to clear media:', e)
    }
  }

  function getImageUrl(media: MediaAsset): string {
    if (!media.filePath) return ''
    if (/^(https?:)?\/\//.test(media.filePath) || media.filePath.startsWith('/api/')) {
      return media.filePath
    }
    const filename = media.filePath.split('/').pop() || media.fileName
    return `media://${filename}`
  }

  return {
    mediaItems,
    assets,
    images,
    kindCounts,
    isLoading,
    isRebuilding,
    hasLoaded,
    loadMedia,
    rebuildLibraryOnce,
    saveImage,
    removeMedia,
    clearAll,
    getImageUrl,
  }
})
