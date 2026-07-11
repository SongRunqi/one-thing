import type { MessageAttachment } from '@/types'

export interface QueuedMessage {
  id: string
  content: string
  attachments?: MessageAttachment[]
}

export interface QueuedFileChangeSummary {
  fileCount: number
  additions: number
  deletions: number
  selectedStepId?: string
}

export function isPatchLikeFile(file: MessageAttachment): boolean {
  return /\.(diff|patch)$/i.test(file.fileName) || /(?:x-)?(?:diff|patch)/i.test(file.mimeType)
}

export function hasDiffLikeContent(content: string): boolean {
  return /^(diff --git|@@\s|[-+]{3}\s[ab]\/)/m.test(content)
}

export function hasQueuedFileChanges(item: QueuedMessage): boolean {
  return hasDiffLikeContent(item.content) || !!item.attachments?.some(isPatchLikeFile)
}

export function changedFilesLabel(fileCount: number): string {
  return fileCount === 1 ? '1 file changed' : `${fileCount} files changed`
}

export function parseDiffStats(diff: string): { additions: number; deletions: number; fileCount: number } {
  if (!diff) return { additions: 0, deletions: 0, fileCount: 0 }
  let additions = 0
  let deletions = 0
  let fileCount = 0

  for (const line of diff.split('\n')) {
    if (line.startsWith('diff --git ')) fileCount += 1
    if (line.startsWith('+') && !line.startsWith('+++')) additions += 1
    if (line.startsWith('-') && !line.startsWith('---')) deletions += 1
  }

  return {
    additions,
    deletions,
    fileCount: fileCount || (additions || deletions ? 1 : 0),
  }
}

export function decodeAttachmentText(file: MessageAttachment): string {
  if (!file.base64Data) return ''
  try {
    return globalThis.atob(file.base64Data)
  } catch {
    return ''
  }
}
