import type { MarkdownAttachmentInput } from '@shared/ipc/markdown'
import type { EditorHandle } from './types'
import { platformApi } from '@/platform'

function clipboardFiles(event: ClipboardEvent): File[] {
  const files = new Map<string, File>()
  for (const file of Array.from(event.clipboardData?.files ?? [])) {
    const key = `${file.name}:${file.type}:${file.size}`
    files.set(key, file)
  }
  for (const item of Array.from(event.clipboardData?.items ?? [])) {
    if (item.kind !== 'file') continue
    const file = item.getAsFile()
    if (!file) continue
    const key = `${file.name}:${file.type}:${file.size}`
    files.set(key, file)
  }
  return Array.from(files.values())
}

function extensionFromMime(mimeType: string): string {
  if (mimeType === 'image/jpeg') return '.jpg'
  if (mimeType === 'image/png') return '.png'
  if (mimeType === 'image/gif') return '.gif'
  if (mimeType === 'image/webp') return '.webp'
  if (mimeType === 'image/svg+xml') return '.svg'
  if (mimeType === 'application/pdf') return '.pdf'
  return ''
}

function fallbackFileName(file: File, index: number): string {
  if (file.name) return file.name
  const ext = extensionFromMime(file.type || '')
  return file.type?.startsWith('image/')
    ? `pasted-image-${index + 1}${ext || '.png'}`
    : `pasted-file-${index + 1}${ext}`
}

function readBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result || '')
      resolve(result.includes(',') ? result.split(',')[1] : result)
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

async function toAttachmentInput(file: File, index: number): Promise<MarkdownAttachmentInput> {
  return {
    fileName: fallbackFileName(file, index),
    mimeType: file.type || 'application/octet-stream',
    base64Data: await readBase64(file),
  }
}

export async function handleMarkdownAttachmentPaste(options: {
  event: ClipboardEvent
  editor: EditorHandle | null
  documentPath?: string
  workspaceRoot?: string
}): Promise<boolean> {
  const files = clipboardFiles(options.event)
  if (!files.length) return false
  if (!options.editor || !options.documentPath) return false

  options.event.preventDefault()
  const attachments = await Promise.all(files.map(toAttachmentInput))
  const response = await platformApi.saveMarkdownAttachments({
    documentPath: options.documentPath,
    workspaceRoot: options.workspaceRoot,
    files: attachments,
  })

  if (!response.success || !response.insertText) {
    window.alert(response.error || 'Failed to save Markdown attachment')
    return true
  }

  const selection = options.editor.getSelection()
  options.editor.replaceRange(selection.from, selection.to, response.insertText)
  return true
}
