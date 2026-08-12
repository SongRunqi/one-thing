import {
  findOnethingObsidianVaultRoot,
  resolveOnethingMarkdownAsset,
  saveOnethingMarkdownAttachments,
  type MarkdownAssetResolution,
  type MarkdownResolveAssetRequest,
  type MarkdownSaveAttachmentsRequest,
  type MarkdownSaveAttachmentsResponse,
  type OnethingMarkdownAssetServiceAdapters,
} from '@onething/runtime/markdown'
import { getSettings } from '../stores/settings.js'
import { getVariablesStore } from '../variables/store/index.js'

function markdownRuntimeAdapters(): OnethingMarkdownAssetServiceAdapters {
  return {
    getEditorSettings: () => getSettings().general.editor || {},
    getNoteRoots: () => {
      const store = getVariablesStore()
      return [store.getUserNoteDir(), store.getWorkNoteDir()]
    },
  }
}

export const findObsidianVaultRoot = findOnethingObsidianVaultRoot

export async function resolveMarkdownAsset(
  request: MarkdownResolveAssetRequest,
): Promise<MarkdownAssetResolution> {
  return resolveOnethingMarkdownAsset(request, markdownRuntimeAdapters())
}

export async function saveMarkdownAttachments(
  request: MarkdownSaveAttachmentsRequest,
): Promise<MarkdownSaveAttachmentsResponse> {
  return saveOnethingMarkdownAttachments(request, markdownRuntimeAdapters())
}
