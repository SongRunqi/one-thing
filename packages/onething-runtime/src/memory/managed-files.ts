import { createReadStream } from 'node:fs'
import { open } from 'node:fs/promises'
import { createInterface } from 'node:readline'
import {
  readTextFileAsync,
  statPath,
  writeTextFileAtomic,
} from '@onething/core/storage'
import {
  listSoulMemoryManagedFilesWithAdapters as coreListSoulMemoryManagedFilesWithAdapters,
  readSoulMemoryManagedFileWithAdapters as coreReadSoulMemoryManagedFileWithAdapters,
  saveSoulMemoryManagedFileWithAdapters as coreSaveSoulMemoryManagedFileWithAdapters,
  type CoreSoulMemoryFileExcerpt,
  type CoreSoulMemoryManagedFile,
  type CoreSoulMemoryResolvedPath,
} from '../plugins/index.js'
import type { MemoryWorkspace } from './types.js'
import {
  joinPaths,
  listDirectoryEntries,
  relativePath as relativePathOf,
} from '@onething/core/storage'
import { getSoulMemoryDailyDateFromFileName } from '../plugins/index.js'

interface DailyMemoryFileCandidate {
  absolutePath: string
  relativePath: string
  kind: 'memory' | 'daily'
  date?: string
}

async function listDailyMemoryFiles(workspace: MemoryWorkspace): Promise<DailyMemoryFileCandidate[]> {
  const files: DailyMemoryFileCandidate[] = []
  const rootMemoryStat = await statPath(workspace.memoryPath)
  if (rootMemoryStat?.isFile()) {
    files.push({
      absolutePath: workspace.memoryPath,
      relativePath: 'MEMORY.md',
      kind: 'memory',
    })
  }

  async function walk(dir: string): Promise<void> {
    let entries: Awaited<ReturnType<typeof listDirectoryEntries>>
    try {
      entries = await listDirectoryEntries(dir)
    } catch {
      return
    }
    for (const entry of entries) {
      const absolutePath = joinPaths(dir, entry.name)
      if (entry.isDirectory) {
        if (entry.name.startsWith('.')) continue
        await walk(absolutePath)
        continue
      }
      if (!entry.isFile || !entry.name.toLowerCase().endsWith('.md')) continue
      const date = getSoulMemoryDailyDateFromFileName(entry.name)
      files.push({
        absolutePath,
        relativePath: relativePathOf(workspace.root, absolutePath),
        kind: 'daily',
        ...(date ? { date } : {}),
      })
    }
  }

  await walk(workspace.memoryDir)
  return files
}

async function readTextFilePrefix(filePath: string, maxBytes: number): Promise<string> {
  if (maxBytes <= 0) return ''
  const file = await open(filePath, 'r')
  try {
    const buffer = Buffer.alloc(maxBytes)
    const { bytesRead } = await file.read(buffer, 0, buffer.length, 0)
    return buffer.subarray(0, bytesRead).toString('utf-8')
  } finally {
    await file.close()
  }
}

async function countTextFileLines(filePath: string): Promise<number> {
  let lineCount = 0
  const input = createReadStream(filePath, { encoding: 'utf8' })
  const lines = createInterface({ input, crlfDelay: Infinity })
  try {
    for await (const _line of lines) {
      lineCount += 1
    }
    return lineCount
  } finally {
    lines.close()
    input.destroy()
  }
}

export async function listManagedMemoryFiles(
  workspace: MemoryWorkspace,
): Promise<CoreSoulMemoryManagedFile[]> {
  const indexedFiles = await listDailyMemoryFiles(workspace)
  return coreListSoulMemoryManagedFilesWithAdapters({
    soulPath: workspace.soulPath,
    userPath: workspace.userPath,
    memoryPath: workspace.memoryPath,
    dreamsPath: workspace.dreamsPath,
    indexedFiles,
    statFile: absolutePath => statPath(absolutePath),
    countLines: absolutePath => countTextFileLines(absolutePath),
    readFile: absolutePath => readTextFileAsync(absolutePath),
    readPreviewFile: (absolutePath, _candidate, maxChars) => readTextFilePrefix(absolutePath, maxChars),
  })
}

export async function readManagedMemoryFile(options: {
  workspace: MemoryWorkspace
  path: string
  startLine?: number
  endLine?: number
  lines?: number
  full?: boolean
}): Promise<CoreSoulMemoryFileExcerpt> {
  return coreReadSoulMemoryManagedFileWithAdapters({
    root: options.workspace.root,
    inputPath: options.path,
    startLine: options.startLine,
    endLine: options.endLine,
    lines: options.lines,
    full: options.full,
    defaultLines: options.workspace.settings.read.defaultLines,
    maxLines: options.workspace.settings.read.maxLines,
    readFile: absolutePath => readTextFileAsync(absolutePath),
  })
}

export async function saveManagedMemoryFile(options: {
  workspace: MemoryWorkspace
  path: string
  content: string
}): Promise<CoreSoulMemoryManagedFile> {
  return coreSaveSoulMemoryManagedFileWithAdapters({
    root: options.workspace.root,
    inputPath: options.path,
    content: options.content,
    writeFile: (absolutePath, content) => writeTextFileAtomic(absolutePath, content),
    statFile: absolutePath => statPath(absolutePath),
    readFile: absolutePath => readTextFileAsync(absolutePath),
  })
}
