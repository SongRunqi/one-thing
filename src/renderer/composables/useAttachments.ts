import { ref, computed } from 'vue'
import { useSettingsStore } from '@/stores/settings'
import type { MessageAttachment, AttachmentMediaType } from '@/types'

const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024

// Local interface for file preview (extends MessageAttachment with preview)
export interface AttachedFile extends Omit<MessageAttachment, 'base64Data'> {
  preview?: string       // Data URL for preview display
  base64Data: string     // Base64 encoded file data
}

export interface AttachmentRejection {
  fileName: string
  reason: 'too-large' | 'unsupported-image-model' | 'read-error'
  message: string
}

export interface AttachmentOperationResult {
  handled: boolean
  accepted: AttachedFile[]
  rejected: AttachmentRejection[]
}

export function useAttachments() {
  const settingsStore = useSettingsStore()

  const attachedFiles = ref<AttachedFile[]>([])
  const fileInputRef = ref<HTMLInputElement | null>(null)
  const isProcessing = ref(false)

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

  function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
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

  async function buildAttachedFile(file: File): Promise<AttachedFile> {
    const id = `attachment-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const mimeType = file.type || 'application/octet-stream'
    const mediaType = getMediaType(mimeType)
    const base64Data = await readFileAsBase64(file)

    const attachedFile: AttachedFile = {
      id,
      fileName: file.name || 'clipboard-file',
      mimeType,
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

    return attachedFile
  }

  async function processFile(file: File): Promise<AttachedFile> {
    const mediaType = getMediaType(file.type || 'application/octet-stream')
    if (file.size > MAX_ATTACHMENT_SIZE) {
      throw {
        fileName: file.name || 'clipboard-file',
        reason: 'too-large',
        message: `${file.name || 'File'} is too large. Maximum size is ${formatBytes(MAX_ATTACHMENT_SIZE)}.`,
      } satisfies AttachmentRejection
    }

    if (mediaType === 'image') {
      if (!currentModelSupportsVision.value) {
        throw {
          fileName: file.name || 'clipboard-image',
          reason: 'unsupported-image-model',
          message: 'Current model does not support image input.',
        } satisfies AttachmentRejection
      }
    }

    return buildAttachedFile(file)
  }

  async function processFiles(files: File[]): Promise<AttachmentOperationResult> {
    const accepted: AttachedFile[] = []
    const rejected: AttachmentRejection[] = []

    if (files.length === 0) {
      return { handled: false, accepted, rejected }
    }

    isProcessing.value = true
    try {
      for (const file of files) {
        try {
          accepted.push(await processFile(file))
        } catch (error) {
          if (error && typeof error === 'object' && 'reason' in error) {
            rejected.push(error as AttachmentRejection)
          } else {
            rejected.push({
              fileName: file.name || 'clipboard-file',
              reason: 'read-error',
              message: `Failed to read ${file.name || 'clipboard file'}.`,
            })
          }
        }
      }
    } finally {
      isProcessing.value = false
    }

    if (accepted.length > 0) {
      attachedFiles.value = [...attachedFiles.value, ...accepted]
    }

    return { handled: true, accepted, rejected }
  }

  function clipboardFiles(event: ClipboardEvent): File[] {
    const data = event.clipboardData
    if (!data) return []

    const files = new Map<string, File>()
    const add = (file: File | null) => {
      if (!file) return
      const key = `${file.name}:${file.type}:${file.size}:${file.lastModified}`
      files.set(key, file)
    }

    for (const file of Array.from(data.files ?? [])) {
      add(file)
    }

    for (const item of Array.from(data.items ?? [])) {
      if (item.kind === 'file' || item.type.startsWith('image/')) {
        add(item.getAsFile())
      }
    }

    return Array.from(files.values())
  }

  function attachmentFromMessageAttachment(attachment: MessageAttachment): AttachedFile {
    const attachedFile: AttachedFile = {
      id: attachment.id,
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
      size: attachment.size,
      mediaType: attachment.mediaType,
      base64Data: attachment.base64Data || '',
      width: attachment.width,
      height: attachment.height,
      url: attachment.url,
    }

    if (attachment.mediaType === 'image' && attachment.base64Data) {
      attachedFile.preview = `data:${attachment.mimeType};base64,${attachment.base64Data}`
    }

    attachedFiles.value = [...attachedFiles.value, attachedFile]
    return attachedFile
  }

  function handleAttach() {
    fileInputRef.value?.click()
  }

  async function handleFileSelect(event: Event) {
    const input = event.target as HTMLInputElement
    const files = input.files
    if (!files || files.length === 0) return { handled: false, accepted: [], rejected: [] }

    const result = await processFiles(Array.from(files))
    // Reset input for re-selection
    input.value = ''
    return result
  }

  async function handlePaste(event: ClipboardEvent): Promise<AttachmentOperationResult> {
    const files = clipboardFiles(event)
    if (files.length === 0) {
      return { handled: false, accepted: [], rejected: [] }
    }

    event.preventDefault()
    return processFiles(files)
  }

  function restoreAttachments(attachments?: MessageAttachment[]) {
    attachedFiles.value = []
    for (const attachment of attachments ?? []) {
      attachmentFromMessageAttachment(attachment)
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
    isProcessing,
    handleAttach,
    handleFileSelect,
    handlePaste,
    processFiles,
    restoreAttachments,
    removeAttachment,
    clearAttachments,
    toMessageAttachments,
  }
}
