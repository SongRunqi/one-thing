/**
 * Media IPC Handlers
 *
 * Thin IPC layer that delegates to media-storage for persistence
 * and handles UI concerns (image preview windows).
 */

import { ipcMain } from 'electron'
import { openImagePreviewWindow } from '../window.js'
import { IPC_CHANNELS } from '../../shared/ipc.js'
import {
  type MediaItem,
  saveMediaImage,
  loadAllMedia,
  deleteMediaItem,
  clearAllMedia,
  readImageAsBase64,
} from '../media/media-storage.js'

export type { MediaItem }
export { saveMediaImage }

export function registerMediaHandlers() {
  // Save a generated image (IPC wrapper for saveMediaImage)
  ipcMain.handle('media:save-image', async (_, data: {
    url?: string
    base64?: string
    prompt: string
    revisedPrompt?: string
    model: string
    sessionId: string
    messageId: string
  }): Promise<MediaItem> => {
    return saveMediaImage(data)
  })

  // Load all media items
  ipcMain.handle('media:load-all', async (): Promise<MediaItem[]> => {
    return loadAllMedia()
  })

  // Delete a media item
  ipcMain.handle('media:delete', async (_, id: string): Promise<boolean> => {
    return deleteMediaItem(id)
  })

  // Clear all media
  ipcMain.handle('media:clear-all', async (): Promise<void> => {
    clearAllMedia()
  })

  // Open image preview window (single image - for non-media images like attachments)
  ipcMain.handle(IPC_CHANNELS.OPEN_IMAGE_PREVIEW, async (_, data: {
    src: string
    alt?: string
  }) => {
    console.log('[Media IPC] Opening image preview window:', { src: data.src.substring(0, 50), alt: data.alt })
    openImagePreviewWindow({ mode: 'single', src: data.src, alt: data.alt })
    return { success: true }
  })

  // Open image gallery window (by mediaId - gallery loads its own data)
  ipcMain.handle(IPC_CHANNELS.OPEN_IMAGE_GALLERY, async (_, data: {
    mediaId: string
  }) => {
    console.log('[Media IPC] Opening image gallery for mediaId:', data.mediaId)
    openImagePreviewWindow({ mode: 'gallery', mediaId: data.mediaId })
    return { success: true }
  })

  // Read image file and return as base64 data URL
  ipcMain.handle('media:read-image-base64', async (_, filePath: string): Promise<string> => {
    try {
      return readImageAsBase64(filePath)
    } catch (error) {
      console.error('[Media IPC] Failed to read image:', filePath, error)
      throw error
    }
  })
}
