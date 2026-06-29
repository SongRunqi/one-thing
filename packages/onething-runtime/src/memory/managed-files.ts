import {
  readTextFileAsync,
  statPath,
  writeTextFileAtomic,
} from '@onething/core/storage'
import type { MemoryWorkspace } from './types.js'
import { listMemoryIndexFiles } from './indexer.js'
import {
  listSoulMemoryManagedFilesWithAdapters as coreListSoulMemoryManagedFilesWithAdapters,
  readSoulMemoryManagedFileWithAdapters as coreReadSoulMemoryManagedFileWithAdapters,
  saveSoulMemoryManagedFileWithAdapters as coreSaveSoulMemoryManagedFileWithAdapters,
  type CoreSoulMemoryFileExcerpt,
  type CoreSoulMemoryManagedFile,
  type CoreSoulMemoryResolvedPath,
} from '../plugins/index.js'

export async function listManagedMemoryFiles(
  workspace: MemoryWorkspace,
): Promise<CoreSoulMemoryManagedFile[]> {
  const indexedFiles = await listMemoryIndexFiles(workspace)
  return coreListSoulMemoryManagedFilesWithAdapters({
    soulPath: workspace.soulPath,
    userPath: workspace.userPath,
    memoryPath: workspace.memoryPath,
    dreamsPath: workspace.dreamsPath,
    indexedFiles,
    statFile: absolutePath => statPath(absolutePath),
    readFile: absolutePath => readTextFileAsync(absolutePath),
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
  onIndexableWrite?: (target: CoreSoulMemoryResolvedPath) => void | Promise<void>
}): Promise<CoreSoulMemoryManagedFile> {
  return coreSaveSoulMemoryManagedFileWithAdapters({
    root: options.workspace.root,
    inputPath: options.path,
    content: options.content,
    writeFile: (absolutePath, content) => writeTextFileAtomic(absolutePath, content),
    statFile: absolutePath => statPath(absolutePath),
    readFile: absolutePath => readTextFileAsync(absolutePath),
    onIndexableWrite: options.onIndexableWrite,
  })
}
