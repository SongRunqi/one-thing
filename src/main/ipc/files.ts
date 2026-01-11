/**
 * Files IPC Handlers
 * Provides file listing functionality for @ file search in chat input
 * and file rollback functionality for /files command
 */

import * as path from 'path'
import * as fs from 'fs/promises'
import * as os from 'os'
import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc.js'
import { listFiles } from '../utils/ripgrep.js'

// Types for file listing
export interface ListFilesRequest {
  cwd: string
  query?: string
  limit?: number
}

export interface ListFilesResponse {
  success: boolean
  files: string[]
  error?: string
}

// Types for file rollback
export interface RollbackRequest {
  filePath: string
  originalContent: string
  isNew: boolean
}

export interface RollbackResponse {
  success: boolean
  error?: string
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
  error?: string
}

export interface ListDirsResponse {
  success: boolean
  dirs: string[]     // Full paths to directories
  basePath: string   // Expanded base path
  error?: string
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

      if (!cwd) {
        return { success: false, files: [], error: 'Working directory is required' }
      }

      // cwd is already expanded by getSession (passed from frontend session.workingDirectory)

      try {
        const files: string[] = []
        const lowerQuery = query.toLowerCase()

        // Collect files from async generator
        for await (const file of listFiles({ cwd, hidden: false })) {
          // Fuzzy match: check if query is contained in file path (case-insensitive)
          if (!query || file.toLowerCase().includes(lowerQuery)) {
            // Return absolute path by joining cwd with relative path
            const absolutePath = path.join(cwd, file)
            files.push(absolutePath)

            // Stop collecting once we reach the limit
            if (files.length >= limit) {
              break
            }
          }
        }

        return { success: true, files }
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
      const { filePath, originalContent, isNew } = request

      if (!filePath) {
        return { success: false, error: 'File path is required' }
      }

      try {
        if (isNew) {
          // File was newly created - delete it to rollback
          console.log(`[Files IPC] Rollback: Deleting new file ${filePath}`)
          await fs.unlink(filePath)
        } else {
          // File existed before - restore original content
          console.log(`[Files IPC] Rollback: Restoring ${filePath}`)
          await fs.writeFile(filePath, originalContent, 'utf-8')
        }

        return { success: true }
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

        if (stats.size > maxSize) {
          return {
            success: false,
            error: `File is too large (${Math.round(stats.size / 1024)}KB). Maximum size is ${Math.round(maxSize / 1024)}KB.`,
            size: stats.size,
          }
        }

        // Read the file content
        const content = await fs.readFile(filePath, 'utf-8')

        return {
          success: true,
          content,
          encoding: 'utf-8',
          size: stats.size,
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
}
