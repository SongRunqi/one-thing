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

const DIFF_HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/

export function parseDiffStats(diff: string): { additions: number; deletions: number; fileCount: number } {
  if (!diff) return { additions: 0, deletions: 0, fileCount: 0 }
  const lines = diff.split('\n')
  let additions = 0
  let deletions = 0
  let fileCount = 0

  // Count body lines off against the @@ headers (the way git parses patches):
  // prefix matching alone misreads a deleted `-- foo` line — serialized as
  // `--- foo` — as a file header and undercounts.
  let sawHeader = false
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const header = line.match(DIFF_HUNK_HEADER)
    if (!header) {
      if (line.startsWith('diff --git ')) fileCount += 1
      i += 1
      continue
    }
    sawHeader = true
    let remainingOld = header[2] !== undefined ? parseInt(header[2], 10) : 1
    let remainingNew = header[4] !== undefined ? parseInt(header[4], 10) : 1
    i += 1
    while (i < lines.length && (remainingOld > 0 || remainingNew > 0)) {
      const prefix = lines[i][0]
      if (prefix === '\\') {
        i += 1
        continue
      }
      if (prefix === '+') {
        additions += 1
        remainingNew -= 1
      } else if (prefix === '-') {
        deletions += 1
        remainingOld -= 1
      } else {
        remainingOld -= 1
        remainingNew -= 1
      }
      i += 1
    }
  }

  // Header-less fragments (hand-pasted snippets) fall back to prefix counting.
  if (!sawHeader) {
    for (const line of lines) {
      if (line.startsWith('+') && !line.startsWith('+++')) additions += 1
      if (line.startsWith('-') && !line.startsWith('---')) deletions += 1
    }
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
