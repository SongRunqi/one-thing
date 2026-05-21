import { ipcMain } from 'electron'
import {
  IPC_CHANNELS,
  type MarkdownResolveAssetRequest,
  type MarkdownResolveAssetResponse,
  type MarkdownSaveAttachmentsRequest,
  type MarkdownSaveAttachmentsResponse,
} from '../../shared/ipc.js'
import { resolveMarkdownAsset, saveMarkdownAttachments } from '../markdown/asset-service.js'

export function registerMarkdownHandlers(): void {
  ipcMain.handle(
    IPC_CHANNELS.MARKDOWN_RESOLVE_ASSET,
    async (_event, request: MarkdownResolveAssetRequest): Promise<MarkdownResolveAssetResponse> => {
      try {
        return { success: true, asset: await resolveMarkdownAsset(request) }
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to resolve Markdown asset',
        }
      }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.MARKDOWN_SAVE_ATTACHMENTS,
    async (_event, request: MarkdownSaveAttachmentsRequest): Promise<MarkdownSaveAttachmentsResponse> => {
      try {
        return await saveMarkdownAttachments(request)
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to save Markdown attachments',
          code: 'INTERNAL',
        }
      }
    },
  )
}
