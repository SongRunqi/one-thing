export type MediaKind = 'image' | 'video' | 'audio' | 'document' | 'file'

export type MediaSource = 'user-upload' | 'ai-generated' | 'tool-output' | 'external'

export type MediaUsageTag = 'persona-avatar' | 'video-character' | 'chat-reference'

export interface MediaAssetLink {
  sessionId?: string
  messageId?: string
  attachmentId?: string
  role?: 'user' | 'assistant' | 'system' | 'error'
}

export interface MediaAssetMetadata {
  prompt?: string
  revisedPrompt?: string
  model?: string
  usageTags?: MediaUsageTag[]
  originalUrl?: string
}

export interface MediaAsset {
  id: string
  kind: MediaKind
  source: MediaSource
  mimeType: string
  size: number
  fileName: string
  filePath?: string
  thumbnailPath?: string
  width?: number
  height?: number
  contentHash?: string
  links: MediaAssetLink[]
  metadata?: MediaAssetMetadata
  createdAt: number
  updatedAt?: number
  libraryHiddenAt?: number
}

export interface MediaQuery {
  kind?: MediaKind
  source?: MediaSource
  search?: string
  includeHidden?: boolean
}

export interface MediaGalleryResponse {
  images: MediaAsset[]
  currentIndex: number
}

export interface MediaRebuildResponse {
  success: boolean
  added: number
  skipped: number
  error?: string
}
