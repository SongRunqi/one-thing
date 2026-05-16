/**
 * Media IPC Handlers
 *
 * Handles saving and loading generated images
 */

import { ipcMain } from 'electron'
import fs from 'fs'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'
import { getMediaImagesDir } from '../stores/paths.js'
import { getSessions } from '../stores/index.js'
import { openImagePreviewWindow } from '../window.js'
import { mediaAssetToLegacyImage, mediaLibraryService } from '../media/media-library-service.js'
import { IPC_CHANNELS } from '../../shared/ipc.js'
import type { MediaAsset, MediaQuery } from '../../shared/ipc.js'

export interface MediaItem {
  id: string
  type: 'image'
  filePath: string
  prompt: string
  revisedPrompt?: string
  model: string
  createdAt: number
  sessionId: string
  messageId: string
}

interface ImagePreviewRecord {
  src: string
  alt?: string
  createdAt: number
}

const imagePreviewRecords = new Map<string, ImagePreviewRecord>()
const IMAGE_PREVIEW_TTL_MS = 10 * 60 * 1000
const MAX_IMAGE_PREVIEW_RECORDS = 20

function pruneImagePreviewRecords(): void {
  const now = Date.now()
  for (const [id, record] of imagePreviewRecords) {
    if (now - record.createdAt > IMAGE_PREVIEW_TTL_MS) {
      imagePreviewRecords.delete(id)
    }
  }

  while (imagePreviewRecords.size > MAX_IMAGE_PREVIEW_RECORDS) {
    const oldestId = imagePreviewRecords.keys().next().value
    if (!oldestId) break
    imagePreviewRecords.delete(oldestId)
  }
}

function createImagePreviewRecord(src: string, alt?: string): string {
  pruneImagePreviewRecords()
  const previewId = uuidv4()
  imagePreviewRecords.set(previewId, {
    src,
    alt,
    createdAt: Date.now(),
  })
  return previewId
}

/**
 * Save an image to media storage (can be called directly from main process)
 * Returns the saved MediaItem with id and filePath
 */
export async function saveMediaImage(data: {
  url?: string
  base64?: string
  prompt: string
  revisedPrompt?: string
  model: string
  sessionId: string
  messageId: string
}): Promise<MediaItem> {
  const asset = await mediaLibraryService.ingestGeneratedImage(data)
  return mediaAssetToLegacyImage(asset)
}

export function registerMediaHandlers() {
  ipcMain.handle(IPC_CHANNELS.LIST_MEDIA_ASSETS, async (_, query?: MediaQuery): Promise<MediaAsset[]> => {
    return mediaLibraryService.listAssets(query || {})
  })

  ipcMain.handle(IPC_CHANNELS.HIDE_MEDIA_ASSET, async (_, id: string): Promise<{ success: boolean }> => {
    return { success: mediaLibraryService.hideAsset(id) }
  })

  ipcMain.handle(IPC_CHANNELS.REBUILD_MEDIA_LIBRARY, async (): Promise<{
    success: boolean
    added: number
    skipped: number
    error?: string
  }> => {
    try {
      const result = mediaLibraryService.rebuildFromSessions(getSessions())
      return { success: true, ...result }
    } catch (error) {
      return {
        success: false,
        added: 0,
        skipped: 0,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  })

  ipcMain.handle(IPC_CHANNELS.GET_MEDIA_GALLERY, async (_, data: {
    assetId: string
    query?: MediaQuery
  }) => {
    return mediaLibraryService.getGallery(data.assetId, data.query || {})
  })

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
    return mediaLibraryService
      .listAssets({ kind: 'image' })
      .filter(asset => asset.filePath && fs.existsSync(asset.filePath))
      .map(mediaAssetToLegacyImage)
  })

  // Delete a media item
  ipcMain.handle('media:delete', async (_, id: string): Promise<boolean> => {
    return mediaLibraryService.hideAsset(id)
  })

  // Clear all media
  ipcMain.handle('media:clear-all', async (): Promise<void> => {
    mediaLibraryService.hideAllAssets()
  })

  // Open image preview window (single image - for non-media images like attachments)
  ipcMain.handle(IPC_CHANNELS.OPEN_IMAGE_PREVIEW, async (_, data: {
    src: string
    alt?: string
  }) => {
    const previewId = createImagePreviewRecord(data.src, data.alt)
    console.log('[Media IPC] Opening image preview window:', {
      previewId,
      alt: data.alt,
      srcPrefix: data.src.substring(0, 50),
      srcLength: data.src.length,
    })
    openImagePreviewWindow({ mode: 'single', previewId, alt: data.alt })
    return { success: true }
  })

  ipcMain.handle(IPC_CHANNELS.GET_IMAGE_PREVIEW, async (_, previewId: string): Promise<{
    success: boolean
    src?: string
    alt?: string
    error?: string
  }> => {
    pruneImagePreviewRecords()
    const record = imagePreviewRecords.get(previewId)
    if (!record) {
      return { success: false, error: 'Image preview expired or was not found' }
    }
    return {
      success: true,
      src: record.src,
      alt: record.alt,
    }
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
      const buffer = fs.readFileSync(filePath)
      const ext = path.extname(filePath).toLowerCase()
      let mimeType = 'image/png'
      if (ext === '.jpg' || ext === '.jpeg') {
        mimeType = 'image/jpeg'
      } else if (ext === '.gif') {
        mimeType = 'image/gif'
      } else if (ext === '.webp') {
        mimeType = 'image/webp'
      }
      return `data:${mimeType};base64,${buffer.toString('base64')}`
    } catch (error) {
      console.error('[Media IPC] Failed to read image:', filePath, error)
      throw error
    }
  })
}
