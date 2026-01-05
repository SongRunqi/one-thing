/**
 * Files IPC Handlers
 * Provides file listing functionality for @ file search in chat input
 * and file rollback functionality for /files command
 */

import * as path from 'path'
import * as fs from 'fs/promises'
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
}
