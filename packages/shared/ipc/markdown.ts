export type MarkdownAssetKind = 'external' | 'missing' | 'file' | 'image'

export interface MarkdownAssetResolution {
  kind: MarkdownAssetKind
  rawTarget: string
  href?: string
  absolutePath?: string
  dataUrl?: string
  mimeType?: string
  fileName?: string
  error?: string
}

export interface MarkdownResolveAssetRequest {
  documentPath: string
  workspaceRoot?: string
  rawTarget: string
}

export interface MarkdownResolveAssetResponse {
  success: boolean
  asset?: MarkdownAssetResolution
  error?: string
}

export interface MarkdownAttachmentInput {
  fileName: string
  mimeType: string
  base64Data: string
}

export interface SavedMarkdownAttachment {
  fileName: string
  absolutePath: string
  linkText: string
  mimeType: string
}

export interface MarkdownSaveAttachmentsRequest {
  documentPath: string
  workspaceRoot?: string
  files: MarkdownAttachmentInput[]
}

export interface MarkdownSaveAttachmentsResponse {
  success: boolean
  insertText?: string
  attachments?: SavedMarkdownAttachment[]
  error?: string
  code?: string
}
