/**
 * Files IPC Handlers
 * Provides file listing functionality for @ file search in chat input
 * and file rollback functionality for /files command
 */

import * as path from 'path'
import * as fs from 'fs/promises'
import * as os from 'os'
import { ipcMain, shell } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc.js'
import { listFiles } from '../utils/ripgrep.js'
import { getVariablesStore } from '../variables/store/index.js'
import { applyFileMutationUndo } from '../tools/core/file-mutation-audit.js'
import { getDownloadsDirectory } from '../tools/core/sandbox.js'

export interface ListFilesRequest {
  cwd?: string
  query?: string
  limit?: number
}

export type FileSearchEntryType = 'file' | 'directory'
export type FileSearchEntrySource = 'workdir' | 'downloads' | 'note'

export interface FileSearchEntry {
  path: string
  type: FileSearchEntryType
  source?: FileSearchEntrySource
  label?: string
}

export interface ListFilesResponse {
  success: boolean
  files: string[]
  entries?: FileSearchEntry[]
  error?: string
}

// Types for file rollback
export interface RollbackRequest {
  // Preferred new rollback path: apply a recorded mutation audit snapshot.
  auditPath?: string
  // Legacy rollback path retained for older UI callers.
  filePath?: string
  originalContent?: string
  isNew?: boolean
}

export interface RollbackResponse {
  success: boolean
  error?: string
  auditId?: string
  filePath?: string
  restoredExists?: boolean
}

// Types for directory listing (for /cd path completion)
export interface ListDirsRequest {
  basePath: string   // Base path to list directories from (can contain ~)
  query?: string     // Partial path being typed for filtering
  limit?: number
}

// Types for file content reading (for file preview)
export interface FileReadRequest {
  path: string
  maxSize?: number  // Default: 1MB (1048576 bytes)
}

export interface FileReadResponse {
  success: boolean
  content?: string
  encoding?: string
  size?: number
  mtimeMs?: number
  isBinary?: boolean
  error?: string
}

export interface FileSaveRequest {
  path: string
  content: string
  expectedMtimeMs?: number
}

export interface FileSaveResponse {
  success: boolean
  mtimeMs?: number
  error?: string
  conflict?: boolean
}

export interface DirectoryEntry {
  name: string
  path: string
  type: 'file' | 'directory'
  size?: number
  mtimeMs?: number
}

export interface ListDirectoryResponse {
  success: boolean
  entries?: DirectoryEntry[]
  error?: string
}

export interface FileStatResponse {
  success: boolean
  type?: 'file' | 'directory'
  size?: number
  mtimeMs?: number
  error?: string
}

export interface ListDirsResponse {
  success: boolean
  dirs: string[]     // Full paths to directories
  basePath: string   // Expanded base path
  error?: string
}

function expandPath(p: string): string {
  if (p.startsWith('~')) return p.replace('~', os.homedir())
  return p
}

function looksBinary(buffer: Buffer): boolean {
  const sampleLength = Math.min(buffer.length, 8000)
  for (let i = 0; i < sampleLength; i++) {
    if (buffer[i] === 0) return true
  }
  return false
}

interface FileSearchRoot {
  path: string
  source: FileSearchEntrySource
  label: string
}

function getNoteRootLabel(name: 'ai_note_dir' | 'user_note_dir' | 'work_note_dir'): string {
  if (name === 'ai_note_dir') return 'AI notes'
  if (name === 'work_note_dir') return 'Work notes'
  return 'Personal notes'
}

function getFileSearchRoots(cwd: string | undefined): FileSearchRoot[] {
  const roots: FileSearchRoot[] = []
  const seen = new Set<string>()

  function add(p: string | undefined | null, source: FileSearchEntrySource, label: string) {
    if (!p) return
    const resolved = path.resolve(expandPath(p))
    if (seen.has(resolved)) return
    seen.add(resolved)
    roots.push({ path: resolved, source, label })
  }

  add(cwd, 'workdir', 'Workspace')

  const variablesStore = getVariablesStore()
  const noteRoots = [
    ['ai_note_dir', variablesStore.getAiNoteDir()],
    ['user_note_dir', variablesStore.getUserNoteDir()],
    ['work_note_dir', variablesStore.getWorkNoteDir()],
  ] as const
  for (const [name, value] of noteRoots) {
    add(value, 'note', getNoteRootLabel(name))
  }
  add(getDownloadsDirectory(), 'downloads', 'Downloads')

  return roots
}

function entryMatchesQuery(entry: FileSearchEntry, lowerQuery: string): boolean {
  if (!lowerQuery) return true
  return [
    entry.path,
    path.basename(entry.path),
    entry.label || '',
    entry.source || '',
  ].some(value => value.toLowerCase().includes(lowerQuery))
}

/**
 * Register file-related IPC handlers
 */
export function registerFilesHandlers() {
  // List files in a directory with optional fuzzy matching
  ipcMain.handle(
    IPC_CHANNELS.FILES_LIST,
    async (_event, request: ListFilesRequest): Promise<ListFilesResponse> => {
      const { cwd, query = '', limit = 50 } = request

      try {
        const files: string[] = []
        const entries: FileSearchEntry[] = []
        const lowerQuery = query.toLowerCase()
        const searchRoots = getFileSearchRoots(cwd)
        const seen = new Set<string>()

        if (searchRoots.length === 0) {
          return { success: true, files: [], entries: [] }
        }

        for (const root of searchRoots) {
          const rootEntry: FileSearchEntry = {
            path: root.path,
            type: 'directory',
            source: root.source,
            label: root.label,
          }
          if (entryMatchesQuery(rootEntry, lowerQuery) && !seen.has(root.path)) {
            seen.add(root.path)
            entries.push(rootEntry)
          }
        }

        for (const root of searchRoots) {
          try {
            // Collect files from async generator
            for await (const file of listFiles({ cwd: root.path, hidden: false, noIgnore: true })) {
              // Fuzzy match: check if query is contained in file path (case-insensitive)
              if (!query || file.toLowerCase().includes(lowerQuery)) {
                // Return absolute path by joining cwd with relative path
                const absolutePath = path.join(root.path, file)
                if (!seen.has(absolutePath)) {
                  seen.add(absolutePath)
                  files.push(absolutePath)
                  entries.push({
                    path: absolutePath,
                    type: 'file',
                    source: root.source,
                  })
                }

                // Stop collecting once we reach the limit
                if (entries.length >= limit) {
                  break
                }
              }
            }
          } catch {
            // A configured note/work directory may have been moved or deleted.
            // Skip it and keep returning matches from the remaining roots.
          }

          if (entries.length >= limit) break
        }

        return {
          success: true,
          files,
          entries: entries.slice(0, limit),
        }
      } catch (error) {
        console.error('[Files IPC] Failed to list files:', error)
        return {
          success: false,
          files: [],
          error: error instanceof Error ? error.message : 'Failed to list files',
        }
      }
    }
  )

  // Rollback a file to its original content
  ipcMain.handle(
    IPC_CHANNELS.FILE_ROLLBACK,
    async (_event, request: RollbackRequest): Promise<RollbackResponse> => {
      const { auditPath, filePath, originalContent, isNew } = request

      try {
        if (auditPath) {
          console.log(`[Files IPC] Rollback: Applying audit snapshot ${auditPath}`)
          const result = await applyFileMutationUndo(auditPath)
          return {
            success: true,
            auditId: result.auditId,
            filePath: result.filePath,
            restoredExists: result.restoredExists,
          }
        }

        if (!filePath) {
          return { success: false, error: 'File path or audit path is required' }
        }

        // Legacy rollback path. Prefer auditPath so rollback can revalidate hashes.
        if (isNew) {
          console.log(`[Files IPC] Rollback: Deleting new file ${filePath}`)
          await fs.unlink(filePath)
        } else {
          console.log(`[Files IPC] Rollback: Restoring ${filePath}`)
          await fs.writeFile(filePath, originalContent ?? '', 'utf-8')
        }

        return { success: true, filePath, restoredExists: !isNew }
      } catch (error) {
        console.error('[Files IPC] Failed to rollback file:', error)
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to rollback file',
        }
      }
    }
  )

  // List directories for /cd path completion
  ipcMain.handle(
    IPC_CHANNELS.DIRS_LIST,
    async (_event, request: ListDirsRequest): Promise<ListDirsResponse> => {
      const { basePath, query = '', limit = 50 } = request

      if (!basePath) {
        return { success: false, dirs: [], basePath: '', error: 'Base path is required' }
      }

      try {
        // Expand ~ to home directory
        let expandedPath = basePath
        if (expandedPath.startsWith('~')) {
          expandedPath = expandedPath.replace('~', os.homedir())
        }

        // Determine the directory to list and the filter prefix
        let dirToList: string
        let filterPrefix: string

        // Check if the path ends with / or is a directory
        const pathStat = await fs.stat(expandedPath).catch(() => null)

        if (pathStat?.isDirectory()) {
          // Path is a directory - list its contents
          dirToList = expandedPath
          filterPrefix = query.toLowerCase()
        } else {
          // Path might be partial - list parent directory and filter
          dirToList = path.dirname(expandedPath)
          filterPrefix = path.basename(expandedPath).toLowerCase()
        }

        // Check if directory exists
        const dirStat = await fs.stat(dirToList).catch(() => null)
        if (!dirStat?.isDirectory()) {
          return { success: true, dirs: [], basePath: expandedPath }
        }

        // Read directory contents
        const entries = await fs.readdir(dirToList, { withFileTypes: true })

        // Filter only directories and apply query filter
        const dirs: string[] = []
        for (const entry of entries) {
          // Skip hidden directories unless query starts with .
          if (entry.name.startsWith('.') && !filterPrefix.startsWith('.')) {
            continue
          }

          if (entry.isDirectory()) {
            // Apply filter
            if (!filterPrefix || entry.name.toLowerCase().startsWith(filterPrefix)) {
              dirs.push(path.join(dirToList, entry.name))

              if (dirs.length >= limit) {
                break
              }
            }
          }
        }

        // Sort alphabetically
        dirs.sort((a, b) => path.basename(a).localeCompare(path.basename(b)))

        return { success: true, dirs, basePath: expandedPath }
      } catch (error) {
        console.error('[Files IPC] Failed to list directories:', error)
        return {
          success: false,
          dirs: [],
          basePath: '',
          error: error instanceof Error ? error.message : 'Failed to list directories',
        }
      }
    }
  )

  // Read file content for preview
  ipcMain.handle(
    IPC_CHANNELS.FILE_READ_CONTENT,
    async (_event, request: FileReadRequest): Promise<FileReadResponse> => {
      const { path: filePath, maxSize = 1048576 } = request // Default 1MB

      if (!filePath) {
        return { success: false, error: 'File path is required' }
      }

      try {
        // Check if file exists and get its size
        const stats = await fs.stat(filePath)

        if (!stats.isFile()) {
          return { success: false, error: 'Path is not a file' }
        }

        // Read up to maxSize bytes (truncate large files instead of refusing)
        const fileHandle = await fs.open(filePath, 'r')
        try {
          const buf = Buffer.alloc(Math.min(stats.size, maxSize))
          const { bytesRead } = await fileHandle.read(buf, 0, buf.length, 0)
          const contentBuffer = buf.subarray(0, bytesRead)
          const isBinary = looksBinary(contentBuffer)
          const content = isBinary ? '' : contentBuffer.toString('utf-8')

          return {
            success: true,
            content,
            encoding: 'utf-8',
            size: stats.size,
            mtimeMs: stats.mtimeMs,
            isBinary,
          }
        } finally {
          await fileHandle.close()
        }
      } catch (error) {
        console.error('[Files IPC] Failed to read file content:', error)

        // Check for specific error types
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          return { success: false, error: 'File not found' }
        }
        if ((error as NodeJS.ErrnoException).code === 'EACCES') {
          return { success: false, error: 'Permission denied' }
        }

        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to read file',
        }
      }
    }
  )

  // Save file content
  ipcMain.handle(
    IPC_CHANNELS.FILE_SAVE_CONTENT,
    async (_event, request: FileSaveRequest): Promise<FileSaveResponse> => {
      const { path: filePath, content, expectedMtimeMs } = request

      if (!filePath) {
        return { success: false, error: 'File path is required' }
      }

      try {
        if (expectedMtimeMs !== undefined) {
          const stats = await fs.stat(filePath)
          if (Math.abs(stats.mtimeMs - expectedMtimeMs) > 1) {
            return {
              success: false,
              conflict: true,
              error: 'File changed on disk. Review before saving again.',
            }
          }
        }
        await fs.writeFile(filePath, content, 'utf-8')
        const stats = await fs.stat(filePath)
        return { success: true, mtimeMs: stats.mtimeMs }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EACCES') {
          return { success: false, error: 'Permission denied' }
        }
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to save file',
        }
      }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.FILE_LIST_DIRECTORY,
    async (_event, request: { path: string }): Promise<ListDirectoryResponse> => {
      const dirPath = request.path
      if (!dirPath) return { success: false, error: 'Directory path is required' }

      try {
        const entries = await fs.readdir(dirPath, { withFileTypes: true })
        const result: DirectoryEntry[] = []

        for (const entry of entries) {
          if (entry.name === 'node_modules' || entry.name === '.git') continue
          const entryPath = path.join(dirPath, entry.name)
          const stats = await fs.stat(entryPath).catch(() => null)
          result.push({
            name: entry.name,
            path: entryPath,
            type: entry.isDirectory() ? 'directory' : 'file',
            size: stats?.size,
            mtimeMs: stats?.mtimeMs,
          })
        }

        result.sort((a, b) => {
          if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
          return a.name.localeCompare(b.name)
        })

        return { success: true, entries: result }
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Failed to list directory' }
      }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.FILE_CREATE,
    async (_event, request: { path: string; content?: string }): Promise<{ success: boolean; error?: string }> => {
      try {
        await fs.writeFile(request.path, request.content ?? '', { flag: 'wx' })
        return { success: true }
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Failed to create file' }
      }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.FILE_CREATE_DIRECTORY,
    async (_event, request: { path: string }): Promise<{ success: boolean; error?: string }> => {
      try {
        await fs.mkdir(request.path, { recursive: false })
        return { success: true }
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Failed to create directory' }
      }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.FILE_RENAME,
    async (_event, request: { oldPath: string; newPath: string }): Promise<{ success: boolean; error?: string }> => {
      try {
        await fs.rename(request.oldPath, request.newPath)
        return { success: true }
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Failed to rename path' }
      }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.FILE_DELETE,
    async (_event, request: { path: string }): Promise<{ success: boolean; error?: string }> => {
      try {
        await fs.rm(request.path, { recursive: true, force: false })
        return { success: true }
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Failed to delete path' }
      }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.FILE_STAT,
    async (_event, request: { path: string }): Promise<FileStatResponse> => {
      try {
        const stats = await fs.stat(request.path)
        return {
          success: true,
          type: stats.isDirectory() ? 'directory' : 'file',
          size: stats.size,
          mtimeMs: stats.mtimeMs,
        }
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Failed to stat path' }
      }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.FILE_REVEAL,
    async (_event, request: { path: string }): Promise<{ success: boolean; error?: string }> => {
      const targetPath = request.path
      if (!targetPath) return { success: false, error: 'Path is required' }

      try {
        await fs.stat(targetPath)
        shell.showItemInFolder(targetPath)
        return { success: true }
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to reveal path',
        }
      }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.FILE_WATCH_START,
    async (_event, request: { root: string }): Promise<{ success: boolean; error?: string }> => {
      const root = request.root
      if (!root) return { success: false, error: 'Workspace root is required' }
      // Disabled for V1: recursive fs.watch can overwhelm the app on large workspaces.
      // Keep the IPC shape stable and reintroduce this with throttled, non-recursive
      // watching once the workbench core is stable.
      return { success: true }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.FILE_WATCH_STOP,
    async (_event, request: { root: string }): Promise<{ success: boolean }> => {
      void request
      return { success: true }
    }
  )
}
