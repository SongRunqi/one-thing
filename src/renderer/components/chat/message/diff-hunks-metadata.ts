import type { ChangeContent, ContextContent, FileDiffMetadata, Hunk } from '@pierre/diffs'
import type { DiffHunk } from '@/types'

/**
 * Builds @pierre/diffs' FileDiffMetadata directly from structured hunks,
 * replacing parsePatchFiles for our own diffs. The library's text parser
 * splits files on /^---\s+\S/ and so misreads a deleted `-- foo` line
 * (serialized `--- foo`) as a file boundary, truncating the hunk; structured
 * hunks make that re-parse unnecessary.
 *
 * Field semantics mirror parsePatchFiles: content lines keep a trailing
 * newline, a no-newline marker strips it from the preceding line and sets the
 * matching noEOFCR flag, and split/unified line counts accumulate per group.
 */
export function fileDiffMetadataFromHunks(hunks: DiffHunk[], name: string): FileDiffMetadata {
  const file: FileDiffMetadata = {
    name,
    prevName: undefined,
    type: 'change',
    hunks: [],
    splitLineCount: 0,
    unifiedLineCount: 0,
  }

  let lastHunkEnd = 0
  for (const hunk of hunks) {
    const hunkContent: (ContextContent | ChangeContent)[] = []
    let current: ContextContent | ChangeContent | undefined
    let lastLineType: 'context' | 'addition' | 'deletion' | undefined
    let additionLines = 0
    let deletionLines = 0

    for (const line of hunk.lines) {
      if (line.op === 'noeof') {
        if (!current) continue
        if (current.type === 'context') {
          current.noEOFCR = true
        } else if (lastLineType === 'deletion') {
          current.noEOFCRDeletions = true
          stripLastNewline(current.deletions)
        } else if (lastLineType === 'addition') {
          current.noEOFCRAdditions = true
          stripLastNewline(current.additions)
        }
        continue
      }

      const text = `${line.text}\n`
      if (line.op === 'add') {
        if (!current || current.type !== 'change') {
          current = createChangeContent()
          hunkContent.push(current)
        }
        current.additions.push(text)
        additionLines += 1
        lastLineType = 'addition'
      } else if (line.op === 'del') {
        if (!current || current.type !== 'change') {
          current = createChangeContent()
          hunkContent.push(current)
        }
        current.deletions.push(text)
        deletionLines += 1
        lastLineType = 'deletion'
      } else {
        if (!current || current.type !== 'context') {
          current = createContextContent()
          hunkContent.push(current)
        }
        current.lines.push(text)
        lastLineType = 'context'
      }
    }

    const hunkData: Hunk = {
      collapsedBefore: Math.max(hunk.newStart - 1 - lastHunkEnd, 0),
      splitLineCount: 0,
      splitLineStart: 0,
      unifiedLineCount: 0,
      unifiedLineStart: 0,
      additionCount: hunk.newLines,
      additionStart: hunk.newStart,
      additionLines,
      deletionCount: hunk.oldLines,
      deletionStart: hunk.oldStart,
      deletionLines,
      hunkContent,
      hunkContext: undefined,
      hunkSpecs: `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`,
    }
    lastHunkEnd = hunk.newStart + hunk.newLines - 1

    for (const content of hunkContent) {
      if (content.type === 'context') {
        hunkData.splitLineCount += content.lines.length
        hunkData.unifiedLineCount += content.lines.length
      } else {
        hunkData.splitLineCount += Math.max(content.additions.length, content.deletions.length)
        hunkData.unifiedLineCount += content.deletions.length + content.additions.length
      }
    }
    hunkData.splitLineStart = file.splitLineCount
    hunkData.unifiedLineStart = file.unifiedLineCount
    file.splitLineCount += hunkData.splitLineCount
    file.unifiedLineCount += hunkData.unifiedLineCount

    file.hunks.push(hunkData)
  }

  return file
}

function createChangeContent(): ChangeContent {
  return {
    type: 'change',
    additions: [],
    deletions: [],
    noEOFCRAdditions: false,
    noEOFCRDeletions: false,
  }
}

function createContextContent(): ContextContent {
  return {
    type: 'context',
    lines: [],
    noEOFCR: false,
  }
}

function stripLastNewline(lines: string[]): void {
  const lastIndex = lines.length - 1
  if (lastIndex >= 0) {
    lines[lastIndex] = lines[lastIndex].replace(/\n$|\r\n$/, '')
  }
}
