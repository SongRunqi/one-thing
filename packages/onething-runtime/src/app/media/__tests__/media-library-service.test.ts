import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MediaLibraryService } from '../media-library-service.js'
import type { ChatSession, MessageAttachment } from '@shared/ipc.js'

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

  /**
   * A pasted image has no path of its own, yet its bytes are written here on
   * every send. Handing that path back to the attachment is the whole reason
   * the model can now `read` a file the user just pasted.
   */
  describe('ingestMessageAttachments backfills the on-disk path', () => {
    it('gives a pasted attachment the stored copy it now has', () => {
      const pasted = attachment()
      expect(pasted.filePath).toBeUndefined()

      const added = service.ingestMessageAttachments('session-1', 'message-1', 'user', [pasted])

      expect(added).toBe(1)
      expect(pasted.filePath).toBeTruthy()
      expect(path.dirname(pasted.filePath!)).toBe(imagesDir)
      expect(fs.existsSync(pasted.filePath!)).toBe(true)
      expect(fs.readFileSync(pasted.filePath!).toString()).toBe('same-image')
    })

    it('never overwrites the path the user already gave us', () => {
      const dropped = attachment({ filePath: '/Users/me/Desktop/original.png' })

      service.ingestMessageAttachments('session-1', 'message-1', 'user', [dropped])

      expect(dropped.filePath).toBe('/Users/me/Desktop/original.png')
    })

    it('backfills each of several attachments, documents included', () => {
      const image = attachment()
      const doc = attachment({
        id: 'pdf-1',
        fileName: 'brief.pdf',
        mimeType: 'application/pdf',
        mediaType: 'document',
        base64Data: Buffer.from('pdf-bytes').toString('base64'),
      })

      service.ingestMessageAttachments('session-1', 'message-1', 'user', [image, doc])

      expect(path.dirname(image.filePath!)).toBe(imagesDir)
      expect(path.dirname(doc.filePath!)).toBe(filesDir)
      expect(fs.existsSync(doc.filePath!)).toBe(true)
    })

    it('still resolves a path when the bytes dedupe onto an existing asset', () => {
      const first = attachment()
      service.ingestMessageAttachments('session-1', 'message-1', 'user', [first])

      const second = attachment({ id: 'att-2' })
      service.ingestMessageAttachments('session-1', 'message-2', 'user', [second])

      expect(second.filePath).toBe(first.filePath)
      expect(fs.existsSync(second.filePath!)).toBe(true)
    })

    it('leaves an attachment with no bytes alone', () => {
      const empty = attachment({ base64Data: undefined })

      service.ingestMessageAttachments('session-1', 'message-1', 'user', [empty])

      expect(empty.filePath).toBeUndefined()
    })
  })
})
