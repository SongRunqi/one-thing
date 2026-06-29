import type {
  GetSessionMessagesPageRequest,
  GetSessionMessagesPageResponse,
} from '../../../shared/ipc.js'
import {
  getMessagesPageFromJsonFilePath,
} from '@onething/core/session'
import { getSessionPath } from '../paths.js'

export function getMessagesPageFromJsonFile(
  request: GetSessionMessagesPageRequest,
): GetSessionMessagesPageResponse | null {
  const sessionPath = getSessionPath(request.sessionId)
  return getMessagesPageFromJsonFilePath(request, sessionPath) as GetSessionMessagesPageResponse | null
}
