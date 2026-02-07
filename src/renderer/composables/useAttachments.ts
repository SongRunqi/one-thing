import { ref, computed } from 'vue'
import { useSettingsStore } from '@/stores/settings'
import type { MessageAttachment, AttachmentMediaType } from '@/types'

// Local interface for file preview (extends MessageAttachment with preview)
export interface AttachedFile extends Omit<MessageAttachment, 'base64Data'> {
  preview?: string       // Data URL for preview display
  base64Data: string     // Base64 encoded file data
}

export function useAttachments() {
  const settingsStore = useSettingsStore()

  const attachedFiles = ref<AttachedFile[]>([])
  const fileInputRef = ref<HTMLInputElement | null>(null)

  // Check if current model supports image input (vision capability)
  const currentModelSupportsVision = computed(() => {
    const provider = settingsStore.settings.ai.provider
    const modelId = settingsStore.settings.ai.providers[provider]?.model
    const models = settingsStore.getCachedModels(provider)
    const model = models.find(m => m.id === modelId)
    return model?.architecture?.input_modalities?.includes('image') || false
  })

  function getMediaType(mimeType: string): AttachmentMediaType {
    if (mimeType.startsWith('image/')) return 'image'
    if (mimeType.startsWith('audio/')) return 'audio'
    if (mimeType.startsWith('video/')) return 'video'
    if (mimeType === 'application/pdf' || mimeType.includes('document') || mimeType.includes('word')) return 'document'
    return 'file'
  }

  function readFileAsBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const result = reader.result as string
        const base64 = result.split(',')[1]
        resolve(base64)
      }
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  function createImagePreview(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  function getImageDimensions(dataUrl: string): Promise<{ width: number; height: number }> {
    return new Promise((resolve) => {
      const img = new Image()
      img.onload = () => resolve({ width: img.width, height: img.height })
      img.onerror = () => resolve({ width: 0, height: 0 })
      img.src = dataUrl
    })
  }

  async function processFile(file: File): Promise<boolean> {
    const maxFileSize = 10 * 1024 * 1024 // 10MB limit
    if (file.size > maxFileSize) {
      console.warn(`File ${file.name} is too large (max 10MB)`)
      return false
    }

    const id = `attachment-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const mediaType = getMediaType(file.type)
    const base64Data = await readFileAsBase64(file)

    const attachedFile: AttachedFile = {
      id,
      fileName: file.name,
      mimeType: file.type || 'application/octet-stream',
      size: file.size,
      mediaType,
      base64Data,
    }

    if (mediaType === 'image') {
      attachedFile.preview = await createImagePreview(file)
      const dimensions = await getImageDimensions(attachedFile.preview)
      attachedFile.width = dimensions.width
      attachedFile.height = dimensions.height
    }

    attachedFiles.value = [...attachedFiles.value, attachedFile]
    return true
  }

  function handleAttach() {
    fileInputRef.value?.click()
  }

  async function handleFileSelect(event: Event) {
    const input = event.target as HTMLInputElement
    const files = input.files
    if (!files || files.length === 0) return

    for (const file of Array.from(files)) {
      await processFile(file)
    }

    // Reset input for re-selection
    input.value = ''
  }

  async function handlePaste(event: ClipboardEvent) {
    const items = event.clipboardData?.items
    if (!items) return

    for (const item of items) {
      if (item.type.startsWith('image/')) {
        if (!currentModelSupportsVision.value) {
          const provider = settingsStore.settings.ai.provider
          const modelId = settingsStore.settings.ai.providers[provider]?.model
          const models = settingsStore.getCachedModels(provider)
          const model = models.find(m => m.id === modelId)
          console.warn('[InputBox] Current model does not support image input:', {
            provider,
            modelId,
            modelFound: !!model,
            inputModalities: model?.architecture?.input_modalities,
            cachedModelsCount: models.length,
          })
          return
        }

        event.preventDefault()
        const file = item.getAsFile()
        if (file) {
          await processFile(file)
        }
        return
      }
    }
  }

  function removeAttachment(id: string) {
    attachedFiles.value = attachedFiles.value.filter(f => f.id !== id)
  }

  function clearAttachments() {
    attachedFiles.value = []
  }

  /** Convert attached files to MessageAttachment format (without preview) */
  function toMessageAttachments(): MessageAttachment[] | undefined {
    if (attachedFiles.value.length === 0) return undefined
    return attachedFiles.value.map(f => ({
      id: f.id,
      fileName: f.fileName,
      mimeType: f.mimeType,
      size: f.size,
      mediaType: f.mediaType,
      base64Data: f.base64Data,
      width: f.width,
      height: f.height,
    }))
  }

  return {
    attachedFiles,
    fileInputRef,
    handleAttach,
    handleFileSelect,
    handlePaste,
    removeAttachment,
    clearAttachments,
    toMessageAttachments,
  }
}
