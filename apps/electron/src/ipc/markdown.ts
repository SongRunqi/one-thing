import { ipcMain } from 'electron'

export interface ElectronIpcMainLike {
  handle<TArgs extends unknown[]>(
    channel: string,
    listener: (event: unknown, ...args: TArgs) => unknown,
  ): void
}

export interface ElectronMarkdownIpcChannels {
  resolveAsset: string
  saveAttachments: string
}

export interface ElectronMarkdownResolveAssetRequest {
  documentPath: string
  workspaceRoot?: string
  rawTarget: string
}

export interface ElectronMarkdownAttachmentInput {
  fileName: string
  mimeType: string
  base64Data: string
}

export interface ElectronMarkdownSaveAttachmentsRequest {
  documentPath: string
  workspaceRoot?: string
  files: ElectronMarkdownAttachmentInput[]
}

export interface RegisterElectronMarkdownIpcHandlersOptions {
  channels: ElectronMarkdownIpcChannels
  resolveAsset(request: ElectronMarkdownResolveAssetRequest): unknown
  saveAttachments(request: ElectronMarkdownSaveAttachmentsRequest): unknown
  ipcMain?: ElectronIpcMainLike
}

export function registerElectronMarkdownIpcHandlers(
  options: RegisterElectronMarkdownIpcHandlersOptions,
): void {
  const host = options.ipcMain ?? ipcMain

  host.handle(options.channels.resolveAsset, (_event, request: ElectronMarkdownResolveAssetRequest) => {
    return options.resolveAsset(request)
  })

  host.handle(options.channels.saveAttachments, (_event, request: ElectronMarkdownSaveAttachmentsRequest) => {
    return options.saveAttachments(request)
  })
}
