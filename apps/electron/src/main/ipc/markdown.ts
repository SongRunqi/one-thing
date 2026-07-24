import {
  registerElectronMarkdownIpcHandlers,
  type ElectronMarkdownResolveAssetRequest,
  type ElectronMarkdownSaveAttachmentsRequest,
} from '@onething/electron-host/ipc/markdown'
import {
  resolveOnethingMarkdownAssetForIpc,
  saveOnethingMarkdownAttachmentsForIpc,
} from '@onething/runtime/markdown'
import {
  IPC_CHANNELS,
} from '@shared/ipc.js'
import { resolveMarkdownAsset, saveMarkdownAttachments } from '../markdown/asset-service.js'

export function registerMarkdownHandlers(): void {
  registerElectronMarkdownIpcHandlers({
    channels: {
      resolveAsset: IPC_CHANNELS.MARKDOWN_RESOLVE_ASSET,
      saveAttachments: IPC_CHANNELS.MARKDOWN_SAVE_ATTACHMENTS,
    },
    resolveAsset: (request: ElectronMarkdownResolveAssetRequest) => {
      return resolveOnethingMarkdownAssetForIpc({ request, resolveAsset: resolveMarkdownAsset })
    },
    saveAttachments: (request: ElectronMarkdownSaveAttachmentsRequest) => {
      return saveOnethingMarkdownAttachmentsForIpc({ request, saveAttachments: saveMarkdownAttachments })
    },
  })
}
