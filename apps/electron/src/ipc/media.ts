import { ipcMain } from 'electron'

export interface ElectronIpcMainLike {
  handle<TArgs extends unknown[]>(
    channel: string,
    listener: (event: unknown, ...args: TArgs) => unknown,
  ): void
}

export interface ElectronMediaIpcChannels {
  listAssets: string
  hideAsset: string
  rebuildLibrary: string
  getGallery: string
  saveImage: string
  loadAll: string
  delete: string
  clearAll: string
  openPreview: string
  getPreview: string
  openGallery: string
  readImageBase64: string
}

export interface ElectronMediaGalleryRequest {
  assetId: string
  query?: unknown
}

export interface ElectronMediaSaveImageRequest {
  url?: string
  base64?: string
  prompt: string
  revisedPrompt?: string
  model: string
  sessionId: string
  messageId: string
}

export interface ElectronImagePreviewRequest {
  src: string
  alt?: string
}

export interface ElectronImageGalleryRequest {
  mediaId: string
}

export interface RegisterElectronMediaIpcHandlersOptions {
  channels: ElectronMediaIpcChannels
  listAssets(query?: unknown): unknown
  hideAsset(id: string): unknown
  rebuildLibrary(): unknown
  getGallery(request: ElectronMediaGalleryRequest): unknown
  saveImage(request: ElectronMediaSaveImageRequest): unknown
  loadAll(): unknown
  delete(id: string): unknown
  clearAll(): unknown
  openPreview(request: ElectronImagePreviewRequest): unknown
  getPreview(previewId: string): unknown
  openGallery(request: ElectronImageGalleryRequest): unknown
  readImageBase64(filePath: string): unknown
  ipcMain?: ElectronIpcMainLike
}

export function registerElectronMediaIpcHandlers(
  options: RegisterElectronMediaIpcHandlersOptions,
): void {
  const host = options.ipcMain ?? ipcMain

  host.handle(options.channels.listAssets, (_event, query?: unknown) => {
    return options.listAssets(query)
  })

  host.handle(options.channels.hideAsset, (_event, id: string) => {
    return options.hideAsset(id)
  })

  host.handle(options.channels.rebuildLibrary, () => {
    return options.rebuildLibrary()
  })

  host.handle(options.channels.getGallery, (_event, request: ElectronMediaGalleryRequest) => {
    return options.getGallery(request)
  })

  host.handle(options.channels.saveImage, (_event, request: ElectronMediaSaveImageRequest) => {
    return options.saveImage(request)
  })

  host.handle(options.channels.loadAll, () => {
    return options.loadAll()
  })

  host.handle(options.channels.delete, (_event, id: string) => {
    return options.delete(id)
  })

  host.handle(options.channels.clearAll, () => {
    return options.clearAll()
  })

  host.handle(options.channels.openPreview, (_event, request: ElectronImagePreviewRequest) => {
    return options.openPreview(request)
  })

  host.handle(options.channels.getPreview, (_event, previewId: string) => {
    return options.getPreview(previewId)
  })

  host.handle(options.channels.openGallery, (_event, request: ElectronImageGalleryRequest) => {
    return options.openGallery(request)
  })

  host.handle(options.channels.readImageBase64, (_event, filePath: string) => {
    return options.readImageBase64(filePath)
  })
}
