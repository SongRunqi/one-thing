/**
 * Media IPC Handlers
 *
 * Handles saving and loading generated images
 */

import { ipcMain } from 'electron'
import fs from 'fs'
import path from 'path'
import https from 'https'
import http from 'http'
import { v4 as uuidv4 } from 'uuid'
import {
  getMediaImagesDir,
  getMediaIndexPath,
  readJsonFile,
  writeJsonFile,
} from '../stores/paths.js'
import { openImagePreviewWindow } from '../window.js'
import { IPC_CHANNELS } from '../../shared/ipc.js'

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

interface MediaIndex {
  items: MediaItem[]
}

function loadMediaIndex(): MediaIndex {
  return readJsonFile<MediaIndex>(getMediaIndexPath(), { items: [] })
}

function saveMediaIndex(index: MediaIndex): void {
  writeJsonFile(getMediaIndexPath(), index)
}

async function downloadImage(url: string, filePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http
    const file = fs.createWriteStream(filePath)

    protocol.get(url, (response) => {
      // Handle redirects
      if (response.statusCode === 301 || response.statusCode === 302) {
        const redirectUrl = response.headers.location
        if (redirectUrl) {
          file.close()
          fs.unlinkSync(filePath)
          downloadImage(redirectUrl, filePath).then(resolve).catch(reject)
          return
        }
      }

      if (response.statusCode !== 200) {
        file.close()
        fs.unlinkSync(filePath)
        reject(new Error(`Failed to download: ${response.statusCode}`))
        return
      }

      response.pipe(file)
      file.on('finish', () => {
        file.close()
        resolve()
      })
    }).on('error', (err) => {
      file.close()
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath)
      }
      reject(err)
    })
  })
}

async function saveBase64Image(base64Data: string, filePath: string): Promise<void> {
  // Remove data URL prefix if present
  const base64Content = base64Data.replace(/^data:image\/\w+;base64,/, '')
  const buffer = Buffer.from(base64Content, 'base64')
  fs.writeFileSync(filePath, buffer)
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
  const id = uuidv4()
  const filename = `${id}.png`
  const filePath = path.join(getMediaImagesDir(), filename)

  // Download or save the image
  if (data.url) {
    await downloadImage(data.url, filePath)
  } else if (data.base64) {
    await saveBase64Image(data.base64, filePath)
  } else {
    throw new Error('No image data provided')
  }

  // Create media item
  const item: MediaItem = {
    id,
    type: 'image',
    filePath,
    prompt: data.prompt,
    revisedPrompt: data.revisedPrompt,
    model: data.model,
    createdAt: Date.now(),
    sessionId: data.sessionId,
    messageId: data.messageId,
  }

  // Save to index
  const index = loadMediaIndex()
  index.items.unshift(item)
  saveMediaIndex(index)

  return item
}

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
    const index = loadMediaIndex()
    // Filter out items whose files no longer exist
    const validItems = index.items.filter(item => fs.existsSync(item.filePath))

    // Update index if some items were removed
    if (validItems.length !== index.items.length) {
      index.items = validItems
      saveMediaIndex(index)
    }

    return validItems
  })

  // Delete a media item
  ipcMain.handle('media:delete', async (_, id: string): Promise<boolean> => {
    const index = loadMediaIndex()
    const item = index.items.find(i => i.id === id)

    if (!item) return false

    // Delete file
    if (fs.existsSync(item.filePath)) {
      fs.unlinkSync(item.filePath)
    }

    // Update index
    index.items = index.items.filter(i => i.id !== id)
    saveMediaIndex(index)

    return true
  })

  // Clear all media
  ipcMain.handle('media:clear-all', async (): Promise<void> => {
    const index = loadMediaIndex()

    // Delete all files
    for (const item of index.items) {
      if (fs.existsSync(item.filePath)) {
        fs.unlinkSync(item.filePath)
      }
    }

    // Clear index
    saveMediaIndex({ items: [] })
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
