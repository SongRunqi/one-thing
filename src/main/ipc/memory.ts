/**
 * Memory Management IPC Handlers
 *
 * Handles IPC communication for memory file management,
 * including CRUD operations, tags, and import/export.
 */

import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc/channels.js'
import { classifyError } from '../../shared/errors.js'
import {
  listMemoryFiles,
  getMemoryFile,
  updateMemoryFile,
  deleteMemoryFile,
  deleteMemoryFiles,
  getAllTags,
  renameTag,
  deleteTag,
  getMemoryStats,
  rebuildIndex,
  exportMemory,
  exportWithDialog,
  importMemory,
  importWithDialog,
} from '../services/memory-text/index.js'
import type {
  GetFileRequest,
  UpdateFileRequest,
  DeleteFileRequest,
  DeleteFilesRequest,
  ExportRequest,
  ImportRequest,
  RenameTagRequest,
  DeleteTagRequest,
} from '../../shared/ipc/memory.js'

/**
 * Register memory management IPC handlers
 */
export function registerMemoryHandlers(): void {
  // List all memory files
  ipcMain.handle(IPC_CHANNELS.MEMORY_LIST_FILES, async () => {
    try {
      const files = await listMemoryFiles()
      return { success: true, files }
    } catch (error: any) {
      const appError = classifyError(error)
      console.error(`[Memory][${appError.category}] Failed to list memory files:`, error)
      return { success: false, error: appError.message, errorDetails: appError.technicalDetail, errorCategory: appError.category, retryable: appError.retryable, files: [] }
    }
  })

  // Get a single memory file
  ipcMain.handle(IPC_CHANNELS.MEMORY_GET_FILE, async (_, req: GetFileRequest) => {
    try {
      const file = await getMemoryFile(req.path)
      return { success: true, file }
    } catch (error: any) {
      const appError = classifyError(error)
      console.error(`[Memory][${appError.category}] Failed to get memory file:`, error)
      return { success: false, error: appError.message, errorDetails: appError.technicalDetail, errorCategory: appError.category, retryable: appError.retryable, file: null }
    }
  })

  // Update a memory file
  ipcMain.handle(IPC_CHANNELS.MEMORY_UPDATE_FILE, async (_, req: UpdateFileRequest) => {
    try {
      await updateMemoryFile(req.path, req.content, req.metadata)
      return { success: true }
    } catch (error: any) {
      const appError = classifyError(error)
      console.error(`[Memory][${appError.category}] Failed to update memory file:`, error)
      return { success: false, error: appError.message, errorDetails: appError.technicalDetail, errorCategory: appError.category, retryable: appError.retryable }
    }
  })

  // Delete a single memory file
  ipcMain.handle(IPC_CHANNELS.MEMORY_DELETE_FILE, async (_, req: DeleteFileRequest) => {
    try {
      await deleteMemoryFile(req.path)
      return { success: true }
    } catch (error: any) {
      const appError = classifyError(error)
      console.error(`[Memory][${appError.category}] Failed to delete memory file:`, error)
      return { success: false, error: appError.message, errorDetails: appError.technicalDetail, errorCategory: appError.category, retryable: appError.retryable }
    }
  })

  // Delete multiple memory files
  ipcMain.handle(IPC_CHANNELS.MEMORY_DELETE_FILES, async (_, req: DeleteFilesRequest) => {
    try {
      const result = await deleteMemoryFiles(req.paths)
      return { success: true, result }
    } catch (error: any) {
      const appError = classifyError(error)
      console.error(`[Memory][${appError.category}] Failed to delete memory files:`, error)
      return { success: false, error: appError.message, errorDetails: appError.technicalDetail, errorCategory: appError.category, retryable: appError.retryable }
    }
  })

  // Export memory files
  ipcMain.handle(IPC_CHANNELS.MEMORY_EXPORT, async (_, req: ExportRequest) => {
    try {
      const filePath = await exportMemory(req.options)
      return { success: true, filePath }
    } catch (error: any) {
      const appError = classifyError(error)
      console.error(`[Memory][${appError.category}] Failed to export memory:`, error)
      return { success: false, error: appError.message, errorDetails: appError.technicalDetail, errorCategory: appError.category, retryable: appError.retryable }
    }
  })

  // Export with dialog
  ipcMain.handle(IPC_CHANNELS.MEMORY_EXPORT_WITH_DIALOG, async (_, req: ExportRequest) => {
    try {
      const filePath = await exportWithDialog(req.options)
      return { success: true, filePath }
    } catch (error: any) {
      const appError = classifyError(error)
      console.error(`[Memory][${appError.category}] Failed to export memory with dialog:`, error)
      return { success: false, error: appError.message, errorDetails: appError.technicalDetail, errorCategory: appError.category, retryable: appError.retryable }
    }
  })

  // Import memory files
  ipcMain.handle(IPC_CHANNELS.MEMORY_IMPORT, async (_, req: ImportRequest) => {
    try {
      const result = await importMemory(req.filePath)
      return { success: true, result }
    } catch (error: any) {
      const appError = classifyError(error)
      console.error(`[Memory][${appError.category}] Failed to import memory:`, error)
      return { success: false, error: appError.message, errorDetails: appError.technicalDetail, errorCategory: appError.category, retryable: appError.retryable }
    }
  })

  // Import with dialog
  ipcMain.handle(IPC_CHANNELS.MEMORY_IMPORT_WITH_DIALOG, async () => {
    try {
      const result = await importWithDialog()
      return { success: true, result }
    } catch (error: any) {
      const appError = classifyError(error)
      console.error(`[Memory][${appError.category}] Failed to import memory with dialog:`, error)
      return { success: false, error: appError.message, errorDetails: appError.technicalDetail, errorCategory: appError.category, retryable: appError.retryable }
    }
  })

  // Get all tags
  ipcMain.handle(IPC_CHANNELS.MEMORY_GET_TAGS, async () => {
    try {
      const tags = await getAllTags()
      return { success: true, tags }
    } catch (error: any) {
      const appError = classifyError(error)
      console.error(`[Memory][${appError.category}] Failed to get tags:`, error)
      return { success: false, error: appError.message, errorDetails: appError.technicalDetail, errorCategory: appError.category, retryable: appError.retryable, tags: [] }
    }
  })

  // Rename a tag
  ipcMain.handle(IPC_CHANNELS.MEMORY_RENAME_TAG, async (_, req: RenameTagRequest) => {
    try {
      const affected = await renameTag(req.oldTag, req.newTag)
      return { success: true, affected }
    } catch (error: any) {
      const appError = classifyError(error)
      console.error(`[Memory][${appError.category}] Failed to rename tag:`, error)
      return { success: false, error: appError.message, errorDetails: appError.technicalDetail, errorCategory: appError.category, retryable: appError.retryable, affected: 0 }
    }
  })

  // Delete a tag
  ipcMain.handle(IPC_CHANNELS.MEMORY_DELETE_TAG, async (_, req: DeleteTagRequest) => {
    try {
      const affected = await deleteTag(req.tag)
      return { success: true, affected }
    } catch (error: any) {
      const appError = classifyError(error)
      console.error(`[Memory][${appError.category}] Failed to delete tag:`, error)
      return { success: false, error: appError.message, errorDetails: appError.technicalDetail, errorCategory: appError.category, retryable: appError.retryable, affected: 0 }
    }
  })

  // Get memory statistics
  ipcMain.handle(IPC_CHANNELS.MEMORY_GET_STATS, async () => {
    try {
      const stats = await getMemoryStats()
      return { success: true, stats }
    } catch (error: any) {
      const appError = classifyError(error)
      console.error(`[Memory][${appError.category}] Failed to get memory stats:`, error)
      return { success: false, error: appError.message, errorDetails: appError.technicalDetail, errorCategory: appError.category, retryable: appError.retryable }
    }
  })

  // Rebuild the memory index
  ipcMain.handle(IPC_CHANNELS.MEMORY_REBUILD_INDEX, async () => {
    try {
      const stats = await rebuildIndex()
      return { success: true, stats }
    } catch (error: any) {
      const appError = classifyError(error)
      console.error(`[Memory][${appError.category}] Failed to rebuild memory index:`, error)
      return { success: false, error: appError.message, errorDetails: appError.technicalDetail, errorCategory: appError.category, retryable: appError.retryable }
    }
  })

  console.log('[IPC] Memory management handlers registered')
}
