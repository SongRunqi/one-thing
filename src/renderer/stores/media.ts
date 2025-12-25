import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export interface GeneratedMedia {
  id: string
  type: 'image'
  filePath: string
  prompt: string
  revisedPrompt?: string
  model: string
  createdAt: number
  sessionId: string
  messageId: string
}

export const useMediaStore = defineStore('media', () => {
  const mediaItems = ref<GeneratedMedia[]>([])
  const isLoading = ref(false)

  const images = computed(() =>
    mediaItems.value.filter(m => m.type === 'image').sort((a, b) => b.createdAt - a.createdAt)
  )

  // Load all media from disk
  async function loadMedia() {
    isLoading.value = true
    try {
      const items = await window.electronAPI.loadAllMedia()
      mediaItems.value = items
    } catch (e) {
      console.error('Failed to load media:', e)
    } finally {
      isLoading.value = false
    }
  }

  // Save a new image (from URL or base64)
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
      mediaItems.value.unshift(item)
      return item
    } catch (e) {
      console.error('Failed to save image:', e)
      return null
    }
  }

  async function removeMedia(id: string) {
    try {
      await window.electronAPI.deleteMedia(id)
      mediaItems.value = mediaItems.value.filter(m => m.id !== id)
    } catch (e) {
      console.error('Failed to delete media:', e)
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

  // Get media:// URL for displaying image (uses custom protocol)
  function getImageUrl(media: GeneratedMedia): string {
    // Extract filename from full path
    const filename = media.filePath.split('/').pop() || media.filePath
    return `media://${filename}`
  }

  return {
    mediaItems,
    images,
    isLoading,
    loadMedia,
    saveImage,
    removeMedia,
    clearAll,
    getImageUrl,
  }
})
