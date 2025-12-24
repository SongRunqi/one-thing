import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export interface GeneratedMedia {
  id: string
  type: 'image'
  url: string
  prompt: string
  revisedPrompt?: string
  model: string
  createdAt: number
  sessionId: string
  messageId: string
}

export const useMediaStore = defineStore('media', () => {
  const mediaItems = ref<GeneratedMedia[]>([])

  // Load from localStorage on init
  const stored = localStorage.getItem('generated-media')
  if (stored) {
    try {
      mediaItems.value = JSON.parse(stored)
    } catch (e) {
      console.error('Failed to load media from localStorage:', e)
    }
  }

  const images = computed(() =>
    mediaItems.value.filter(m => m.type === 'image').sort((a, b) => b.createdAt - a.createdAt)
  )

  function addMedia(media: GeneratedMedia) {
    mediaItems.value.unshift(media)
    saveToStorage()
  }

  function removeMedia(id: string) {
    mediaItems.value = mediaItems.value.filter(m => m.id !== id)
    saveToStorage()
  }

  function clearAll() {
    mediaItems.value = []
    saveToStorage()
  }

  function saveToStorage() {
    localStorage.setItem('generated-media', JSON.stringify(mediaItems.value))
  }

  return {
    mediaItems,
    images,
    addMedia,
    removeMedia,
    clearAll,
  }
})
