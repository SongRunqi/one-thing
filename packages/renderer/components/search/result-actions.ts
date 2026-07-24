import type { SearchResult } from '@shared/ipc/search'

export type SearchResultAction =
  | { type: 'create-prompt'; title: string }
  | { type: 'execute'; actionId: string }

export function resolveSearchResultAction(item: SearchResult): SearchResultAction | null {
  if (item.type === 'prompt' && item.actionId?.startsWith('create-prompt:')) {
    const title = decodeURIComponent(item.actionId.slice('create-prompt:'.length))
    return { type: 'create-prompt', title }
  }

  if (item.actionId) return { type: 'execute', actionId: item.actionId }
  if ((item.type === 'file' || item.type === 'daily') && item.filePath) {
    return { type: 'execute', actionId: `open-file:${item.filePath}` }
  }
  if (item.type === 'message' && item.sessionId && item.messageId) {
    return { type: 'execute', actionId: `jump-message:${item.sessionId}:${item.messageId}` }
  }
  if (item.sessionId) return { type: 'execute', actionId: `switch-session:${item.sessionId}` }

  return null
}
