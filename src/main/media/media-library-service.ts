import fs from 'fs'
import path from 'path'
import http from 'http'
import https from 'https'
import crypto from 'crypto'
import { v4 as uuidv4 } from 'uuid'
import {
  getMediaFilesDir,
  getMediaImagesDir,
  getMediaIndexPath,
  readJsonFile,
  writeJsonFile,
} from '../stores/paths.js'
import type {
  ChatSession,
  MediaAsset,
  MediaAssetLink,
  MediaKind,
  MediaQuery,
  MediaSource,
  MessageAttachment,
} from '../../shared/ipc.js'

interface LegacyMediaItem {
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

interface MediaLibraryIndex {
  version: 2
  assets: MediaAsset[]
}

interface MediaLibraryPaths {
  indexPath: string
  imagesDir: string
  filesDir: string
}

interface IngestAttachmentInput {
  sessionId: string
  messageId: string
  role: 'user' | 'assistant' | 'system' | 'error'
  attachment: MessageAttachment
}

interface IngestGeneratedImageInput {
  url?: string
  base64?: string
  prompt: string
  revisedPrompt?: string
  model: string
  sessionId: string
  messageId: string
}

function defaultPaths(): MediaLibraryPaths {
  return {
    indexPath: getMediaIndexPath(),
    imagesDir: getMediaImagesDir(),
    filesDir: getMediaFilesDir(),
  }
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

function mimeToExtension(mimeType: string, fallbackName?: string): string {
  const existing = fallbackName ? path.extname(fallbackName) : ''
  if (existing) return existing

  const normalized = mimeType.toLowerCase()
  if (normalized === 'image/jpeg') return '.jpg'
  if (normalized === 'image/png') return '.png'
  if (normalized === 'image/webp') return '.webp'
  if (normalized === 'image/gif') return '.gif'
  if (normalized === 'application/pdf') return '.pdf'
  if (normalized === 'text/plain') return '.txt'
  if (normalized === 'audio/mpeg') return '.mp3'
  if (normalized === 'video/mp4') return '.mp4'
  return '.bin'
}

function kindFromAttachment(attachment: MessageAttachment): MediaKind {
  if (attachment.mediaType === 'image') return 'image'
  if (attachment.mediaType === 'audio') return 'audio'
  if (attachment.mediaType === 'video') return 'video'
  if (attachment.mediaType === 'document') return 'document'

  const mimeType = attachment.mimeType.toLowerCase()
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType.startsWith('audio/')) return 'audio'
  if (mimeType.startsWith('video/')) return 'video'
  if (mimeType === 'application/pdf' || mimeType.startsWith('text/')) return 'document'
  return 'file'
}

function base64ToBuffer(base64Data: string): Buffer {
  const base64Content = base64Data.replace(/^data:[^;]+;base64,/, '')
  return Buffer.from(base64Content, 'base64')
}

function hashBuffer(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

function linkKey(link: MediaAssetLink): string {
  return [
    link.sessionId || '',
    link.messageId || '',
    link.attachmentId || '',
    link.role || '',
  ].join(':')
}

function mergeLink(asset: MediaAsset, link: MediaAssetLink): boolean {
  const existing = new Set(asset.links.map(linkKey))
  if (existing.has(linkKey(link))) return false
  asset.links.push(link)
  asset.updatedAt = Date.now()
  return true
}

function isLegacyIndex(value: unknown): value is { items: LegacyMediaItem[] } {
  return Boolean(value && typeof value === 'object' && Array.isArray((value as { items?: unknown }).items))
}

function isMediaLibraryIndex(value: unknown): value is MediaLibraryIndex {
  return Boolean(value && typeof value === 'object' && Array.isArray((value as { assets?: unknown }).assets))
}

async function downloadToBuffer(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http
    protocol.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        const redirectUrl = response.headers.location
        if (redirectUrl) {
          downloadToBuffer(redirectUrl).then(resolve).catch(reject)
          return
        }
      }

      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download: ${response.statusCode}`))
        response.resume()
        return
      }

      const chunks: Buffer[] = []
      response.on('data', chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
      response.on('end', () => resolve(Buffer.concat(chunks)))
    }).on('error', reject)
  })
}

export function mediaAssetToLegacyImage(asset: MediaAsset): LegacyMediaItem {
  const primaryLink = asset.links[0] || {}
  return {
    id: asset.id,
    type: 'image',
    filePath: asset.filePath || '',
    prompt: asset.metadata?.prompt || asset.fileName,
    revisedPrompt: asset.metadata?.revisedPrompt,
    model: asset.metadata?.model || (asset.source === 'user-upload' ? 'user-upload' : ''),
    createdAt: asset.createdAt,
    sessionId: primaryLink.sessionId || '',
    messageId: primaryLink.messageId || '',
  }
}

export class MediaLibraryService {
  private paths: MediaLibraryPaths

  constructor(paths: MediaLibraryPaths = defaultPaths()) {
    this.paths = paths
  }

  listAssets(query: MediaQuery = {}): MediaAsset[] {
    const index = this.loadIndex()
    const search = query.search?.trim().toLowerCase()
    return index.assets
      .filter(asset => query.includeHidden || !asset.libraryHiddenAt)
      .filter(asset => !query.kind || asset.kind === query.kind)
      .filter(asset => !query.source || asset.source === query.source)
      .filter(asset => {
        if (!search) return true
        return [
          asset.fileName,
          asset.mimeType,
          asset.source,
          asset.metadata?.prompt,
          asset.metadata?.revisedPrompt,
          asset.metadata?.model,
        ].some(value => value?.toLowerCase().includes(search))
      })
      .sort((a, b) => b.createdAt - a.createdAt)
  }

  getAsset(id: string, includeHidden = true): MediaAsset | undefined {
    const asset = this.loadIndex().assets.find(item => item.id === id)
    if (!asset) return undefined
    if (!includeHidden && asset.libraryHiddenAt) return undefined
    return asset
  }

  hideAsset(id: string): boolean {
    const index = this.loadIndex()
    const asset = index.assets.find(item => item.id === id)
    if (!asset) return false
    asset.libraryHiddenAt = Date.now()
    asset.updatedAt = Date.now()
    this.saveIndex(index)
    return true
  }

  hideAllAssets(): void {
    const index = this.loadIndex()
    const now = Date.now()
    for (const asset of index.assets) {
      asset.libraryHiddenAt = asset.libraryHiddenAt || now
      asset.updatedAt = now
    }
    this.saveIndex(index)
  }

  getGallery(assetId: string, query: MediaQuery = {}): { images: MediaAsset[]; currentIndex: number } {
    const images = this.listAssets({ ...query, kind: 'image' })
    let currentIndex = images.findIndex(asset => asset.id === assetId)

    if (currentIndex === -1) {
      const target = this.getAsset(assetId, true)
      if (target?.kind === 'image') {
        images.unshift(target)
        currentIndex = 0
      }
    }

    return {
      images,
      currentIndex: Math.max(currentIndex, 0),
    }
  }

  ingestAttachment(input: IngestAttachmentInput): MediaAsset | undefined {
    const attachment = input.attachment
    const kind = kindFromAttachment(attachment)
    const source: MediaSource = input.role === 'user' ? 'user-upload' : 'external'
    const link: MediaAssetLink = {
      sessionId: input.sessionId,
      messageId: input.messageId,
      attachmentId: attachment.id,
      role: input.role,
    }

    if (!attachment.base64Data) {
      return this.upsertMetadataOnlyAsset({
        kind,
        source,
        fileName: attachment.fileName,
        mimeType: attachment.mimeType,
        size: attachment.size,
        width: attachment.width,
        height: attachment.height,
        link,
      })
    }

    const buffer = base64ToBuffer(attachment.base64Data)
    const contentHash = hashBuffer(buffer)
    const existing = this.findByHash(kind, source, contentHash)
    if (existing) {
      const index = this.loadIndex()
      const asset = index.assets.find(item => item.id === existing.id)
      if (!asset) return existing
      mergeLink(asset, link)
      this.saveIndex(index)
      return asset
    }

    const asset = this.createStoredAsset({
      kind,
      source,
      buffer,
      mimeType: attachment.mimeType,
      fileName: attachment.fileName,
      width: attachment.width,
      height: attachment.height,
      link,
      contentHash,
    })
    return asset
  }

  async ingestGeneratedImage(input: IngestGeneratedImageInput): Promise<MediaAsset> {
    if (!input.base64 && !input.url) {
      throw new Error('No image data provided')
    }
    const buffer = input.base64
      ? base64ToBuffer(input.base64)
      : await downloadToBuffer(input.url!)
    const contentHash = hashBuffer(buffer)
    const existing = this.findByHash('image', 'ai-generated', contentHash)
    const link: MediaAssetLink = {
      sessionId: input.sessionId,
      messageId: input.messageId,
      role: 'assistant',
    }

    if (existing) {
      const index = this.loadIndex()
      const asset = index.assets.find(item => item.id === existing.id)
      if (asset) {
        mergeLink(asset, link)
        asset.metadata = {
          ...asset.metadata,
          prompt: asset.metadata?.prompt || input.prompt,
          revisedPrompt: asset.metadata?.revisedPrompt || input.revisedPrompt,
          model: asset.metadata?.model || input.model,
          originalUrl: asset.metadata?.originalUrl || input.url,
        }
        this.saveIndex(index)
        return asset
      }
    }

    return this.createStoredAsset({
      kind: 'image',
      source: 'ai-generated',
      buffer,
      mimeType: 'image/png',
      fileName: undefined,
      link,
      contentHash,
      metadata: {
        prompt: input.prompt,
        revisedPrompt: input.revisedPrompt,
        model: input.model,
        originalUrl: input.url,
      },
    })
  }

  ingestMessageAttachments(sessionId: string, messageId: string, role: 'user' | 'assistant' | 'system' | 'error', attachments?: MessageAttachment[]): number {
    let added = 0
    for (const attachment of attachments ?? []) {
      try {
        const asset = this.ingestAttachment({ sessionId, messageId, role, attachment })
        if (asset) {
          attachment.mediaAssetId = asset.id
          added += 1
        }
      } catch (error) {
        console.warn('[MediaLibrary] Failed to ingest attachment:', {
          sessionId,
          messageId,
          attachmentId: attachment.id,
          fileName: attachment.fileName,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }
    return added
  }

  rebuildFromSessions(sessions: ChatSession[]): { added: number; skipped: number } {
    let added = 0
    let skipped = 0

    for (const session of sessions) {
      for (const message of session.messages) {
        for (const attachment of message.attachments ?? []) {
          try {
            const before = this.loadIndex().assets.length
            const asset = this.ingestAttachment({
              sessionId: session.id,
              messageId: message.id,
              role: message.role,
              attachment,
            })
            if (!asset) {
              skipped += 1
              continue
            }
            const after = this.loadIndex().assets.length
            if (after > before) added += 1
            else skipped += 1
          } catch (error) {
            console.warn('[MediaLibrary] Failed to backfill attachment:', {
              sessionId: session.id,
              messageId: message.id,
              attachmentId: attachment.id,
              fileName: attachment.fileName,
              error: error instanceof Error ? error.message : String(error),
            })
            skipped += 1
          }
        }
      }
    }

    return { added, skipped }
  }

  private upsertMetadataOnlyAsset(input: {
    kind: MediaKind
    source: MediaSource
    fileName: string
    mimeType: string
    size: number
    width?: number
    height?: number
    link: MediaAssetLink
  }): MediaAsset {
    const index = this.loadIndex()
    const existing = index.assets.find(asset =>
      asset.source === input.source &&
      asset.kind === input.kind &&
      asset.fileName === input.fileName &&
      asset.size === input.size &&
      asset.links.some(link => linkKey(link) === linkKey(input.link))
    )

    if (existing) return existing

    const now = Date.now()
    const asset: MediaAsset = {
      id: uuidv4(),
      kind: input.kind,
      source: input.source,
      mimeType: input.mimeType,
      size: input.size,
      fileName: input.fileName,
      width: input.width,
      height: input.height,
      links: [input.link],
      createdAt: now,
      updatedAt: now,
    }
    index.assets.unshift(asset)
    this.saveIndex(index)
    return asset
  }

  private createStoredAsset(input: {
    kind: MediaKind
    source: MediaSource
    buffer: Buffer
    mimeType: string
    fileName?: string
    width?: number
    height?: number
    link: MediaAssetLink
    contentHash: string
    metadata?: MediaAsset['metadata']
  }): MediaAsset {
    const index = this.loadIndex()
    const id = uuidv4()
    const extension = mimeToExtension(input.mimeType, input.fileName)
    const fileName = input.fileName || `${id}${extension}`
    const storageDir = input.kind === 'image' ? this.paths.imagesDir : this.paths.filesDir
    ensureDir(storageDir)
    const storedFileName = `${id}${extension}`
    const filePath = path.join(storageDir, storedFileName)
    fs.writeFileSync(filePath, input.buffer)

    const now = Date.now()
    const asset: MediaAsset = {
      id,
      kind: input.kind,
      source: input.source,
      mimeType: input.mimeType,
      size: input.buffer.byteLength,
      fileName,
      filePath,
      width: input.width,
      height: input.height,
      contentHash: input.contentHash,
      links: [input.link],
      metadata: input.metadata,
      createdAt: now,
      updatedAt: now,
    }

    index.assets.unshift(asset)
    this.saveIndex(index)
    return asset
  }

  private findByHash(kind: MediaKind, source: MediaSource, contentHash: string): MediaAsset | undefined {
    return this.loadIndex().assets.find(asset =>
      asset.kind === kind &&
      asset.source === source &&
      asset.contentHash === contentHash
    )
  }

  private loadIndex(): MediaLibraryIndex {
    ensureDir(path.dirname(this.paths.indexPath))
    ensureDir(this.paths.imagesDir)
    ensureDir(this.paths.filesDir)

    const raw = readJsonFile<unknown>(this.paths.indexPath, { version: 2, assets: [] })
    if (isMediaLibraryIndex(raw)) {
      return {
        version: 2,
        assets: raw.assets.map(asset => ({
          ...asset,
          links: Array.isArray(asset.links) ? asset.links : [],
        })),
      }
    }

    if (isLegacyIndex(raw)) {
      const migrated = this.migrateLegacyIndex(raw.items)
      this.saveIndex(migrated)
      return migrated
    }

    return { version: 2, assets: [] }
  }

  private saveIndex(index: MediaLibraryIndex): void {
    writeJsonFile(this.paths.indexPath, {
      version: 2,
      assets: index.assets,
    })
  }

  private migrateLegacyIndex(items: LegacyMediaItem[]): MediaLibraryIndex {
    const assets: MediaAsset[] = []
    const now = Date.now()

    for (const item of items) {
      const fileName = path.basename(item.filePath || `${item.id}.png`)
      const stat = item.filePath && fs.existsSync(item.filePath) ? fs.statSync(item.filePath) : undefined
      const contentHash = item.filePath && fs.existsSync(item.filePath)
        ? hashBuffer(fs.readFileSync(item.filePath))
        : undefined

      assets.push({
        id: item.id,
        kind: 'image',
        source: 'ai-generated',
        mimeType: 'image/png',
        size: stat?.size || 0,
        fileName,
        filePath: item.filePath,
        contentHash,
        links: [{
          sessionId: item.sessionId,
          messageId: item.messageId,
          role: 'assistant',
        }],
        metadata: {
          prompt: item.prompt,
          revisedPrompt: item.revisedPrompt,
          model: item.model,
        },
        createdAt: item.createdAt || now,
        updatedAt: now,
      })
    }

    return { version: 2, assets }
  }
}

export const mediaLibraryService = new MediaLibraryService()
