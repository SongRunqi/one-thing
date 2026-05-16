import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MediaLibraryService } from '../media-library-service.js'
import type { ChatSession, MessageAttachment } from '../../../shared/ipc.js'

let tempDir: string
let service: MediaLibraryService
let indexPath: string
let imagesDir: string
let filesDir: string

function attachment(overrides: Partial<MessageAttachment> = {}): MessageAttachment {
  return {
    id: 'att-1',
    fileName: 'upload.png',
    mimeType: 'image/png',
    size: 4,
    mediaType: 'image',
    base64Data: Buffer.from('same-image').toString('base64'),
    ...overrides,
  }
}

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'media-library-'))
  imagesDir = path.join(tempDir, 'images')
  filesDir = path.join(tempDir, 'files')
  indexPath = path.join(tempDir, 'index.json')
  fs.mkdirSync(imagesDir, { recursive: true })
  fs.mkdirSync(filesDir, { recursive: true })
  service = new MediaLibraryService({ indexPath, imagesDir, filesDir })
})

afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true })
})

describe('MediaLibraryService', () => {
  it('migrates legacy generated image index entries', () => {
    const filePath = path.join(imagesDir, 'legacy.png')
    fs.writeFileSync(filePath, Buffer.from('legacy-image'))
    fs.writeFileSync(indexPath, JSON.stringify({
      items: [{
        id: 'legacy-1',
        type: 'image',
        filePath,
        prompt: 'draw a quiet room',
        revisedPrompt: 'draw a quiet warm room',
        model: 'gpt-image-1',
        createdAt: 123,
        sessionId: 'session-1',
        messageId: 'message-1',
      }],
    }))

    const assets = service.listAssets({ kind: 'image' })

    expect(assets).toHaveLength(1)
    expect(assets[0]).toMatchObject({
      id: 'legacy-1',
      kind: 'image',
      source: 'ai-generated',
      filePath,
      metadata: {
        prompt: 'draw a quiet room',
        revisedPrompt: 'draw a quiet warm room',
        model: 'gpt-image-1',
      },
    })
  })

  it('backfills uploaded image attachments and deduplicates by hash', () => {
    const shared = attachment()
    const session = {
      id: 'session-1',
      name: 'Session',
      createdAt: 1,
      updatedAt: 1,
      messages: [
        { id: 'message-1', role: 'user', content: '', timestamp: 1, attachments: [shared] },
        { id: 'message-2', role: 'user', content: '', timestamp: 2, attachments: [{ ...shared, id: 'att-2' }] },
      ],
    } as ChatSession

    const result = service.rebuildFromSessions([session])
    const assets = service.listAssets({ kind: 'image', source: 'user-upload' })

    expect(result).toEqual({ added: 1, skipped: 1 })
    expect(assets).toHaveLength(1)
    expect(assets[0].links).toHaveLength(2)
    expect(fs.existsSync(assets[0].filePath!)).toBe(true)
  })

  it('hides assets from the library without deleting stored files', () => {
    const asset = service.ingestAttachment({
      sessionId: 'session-1',
      messageId: 'message-1',
      role: 'user',
      attachment: attachment(),
    })!

    expect(service.hideAsset(asset.id)).toBe(true)

    expect(service.listAssets({ kind: 'image' })).toHaveLength(0)
    expect(service.listAssets({ kind: 'image', includeHidden: true })).toHaveLength(1)
    expect(fs.existsSync(asset.filePath!)).toBe(true)
  })

  it('keeps non-image attachments out of image queries', () => {
    service.ingestAttachment({
      sessionId: 'session-1',
      messageId: 'message-1',
      role: 'user',
      attachment: attachment(),
    })
    service.ingestAttachment({
      sessionId: 'session-1',
      messageId: 'message-1',
      role: 'user',
      attachment: attachment({
        id: 'pdf-1',
        fileName: 'brief.pdf',
        mimeType: 'application/pdf',
        mediaType: 'document',
        base64Data: Buffer.from('pdf').toString('base64'),
      }),
    })

    expect(service.listAssets({ kind: 'image' })).toHaveLength(1)
    expect(service.listAssets({ kind: 'document' })).toHaveLength(1)
  })
})
