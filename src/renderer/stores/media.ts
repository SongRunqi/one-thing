import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { MediaAsset, MediaKind, MediaQuery } from '@/types'

export type GeneratedMedia = MediaAsset

function sortNewestFirst(a: MediaAsset, b: MediaAsset) {
  return b.createdAt - a.createdAt
}

export const useMediaStore = defineStore('media', () => {
  const mediaItems = ref<MediaAsset[]>([])
  const isLoading = ref(false)
  const isRebuilding = ref(false)
  const hasBackfilled = ref(false)

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
      await window.electronAPI.rebuildMediaLibrary()
      hasBackfilled.value = true
    } catch (e) {
      console.error('Failed to rebuild media library:', e)
    } finally {
      isRebuilding.value = false
    }
  }

  async function loadMedia(options: { rebuild?: boolean; query?: MediaQuery } = {}) {
    isLoading.value = true
    try {
      if (options.rebuild) {
        await rebuildLibraryOnce()
      }
      mediaItems.value = await window.electronAPI.listMediaAssets(options.query)
    } catch (e) {
      console.error('Failed to load media:', e)
    } finally {
      isLoading.value = false
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
      const item = await window.electronAPI.saveImage(data)
      await loadMedia()
      return mediaItems.value.find(asset => asset.id === item.id) || null
    } catch (e) {
      console.error('Failed to save image:', e)
      return null
    }
  }

  async function removeMedia(id: string) {
    try {
      await window.electronAPI.hideMediaAsset(id)
      mediaItems.value = mediaItems.value.filter(m => m.id !== id)
    } catch (e) {
      console.error('Failed to remove media from library:', e)
    }
  }

  async function clearAll() {
    try {
      await window.electronAPI.clearAllMedia()
      mediaItems.value = []
    } catch (e) {
      console.error('Failed to clear media:', e)
    }
  }

  function getImageUrl(media: MediaAsset): string {
    if (!media.filePath) return ''
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
    loadMedia,
    rebuildLibraryOnce,
    saveImage,
    removeMedia,
    clearAll,
    getImageUrl,
  }
})
