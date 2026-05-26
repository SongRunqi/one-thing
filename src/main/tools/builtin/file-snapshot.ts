import * as crypto from 'crypto'
import * as fs from 'fs/promises'
import { diffLines } from 'diff'

export interface TextFileSnapshot {
  exists: boolean
  content: string
  hash: string
}

export async function readTextFileSnapshot(filePath: string): Promise<TextFileSnapshot> {
  try {
    const stats = await fs.stat(filePath)
    if (stats.isDirectory()) {
      throw new Error(`Path is a directory, not a file: ${filePath}`)
    }
    const content = await fs.readFile(filePath, 'utf-8')
    return {
      exists: true,
      content,
      hash: hashTextFileSnapshot(true, content),
    }
  } catch (error: any) {
    if (error.code !== 'ENOENT') {
      throw error
    }
    return {
      exists: false,
      content: '',
      hash: hashTextFileSnapshot(false, ''),
    }
  }
}

function hashTextFileSnapshot(exists: boolean, content: string): string {
  return crypto
    .createHash('sha256')
    .update(exists ? 'file\0' : 'missing\0')
    .update(content)
    .digest('hex')
}

export function countLineChanges(oldContent: string, newContent: string): {
  additions: number
  deletions: number
} {
  const changes = diffLines(oldContent, newContent)
  let additions = 0
  let deletions = 0
  for (const change of changes) {
    if (change.added) additions += change.count || 0
    if (change.removed) deletions += change.count || 0
  }
  return { additions, deletions }
}
