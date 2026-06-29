import { registerElectronSessionIpcHandlers } from '@onething/electron-host/ipc/sessions'
import { v4 as uuidv4 } from 'uuid'
import fs from 'node:fs/promises'
import {
  activateOnethingSessionForIpc,
  addOnethingSystemMessageForIpc,
  createOnethingBranchSessionForIpc,
  createOnethingSessionForIpc,
  deleteOnethingSessionForIpc,
  getOnethingSessionForIpc,
  getOnethingSessionMessagesForIpc,
  getOnethingSessionMessagesPageForIpc,
  getOnethingSessionTokenUsageForIpc,
  listOnethingSessionsForIpc,
  listOnethingSessionUserMarkersForIpc,
  removeOnethingMessageForIpc,
  removeOnethingSystemMarkerMessageForIpc,
  renameOnethingSessionForIpc,
  switchOnethingSessionForIpc,
  updateOnethingSessionAgent,
  updateOnethingSessionArchivedForIpc,
  updateOnethingSessionModel,
  updateOnethingSessionPinForIpc,
  updateOnethingSessionPermissionMode,
  updateOnethingSessionWorkingDirectory,
} from '@onething/runtime/sessions'
import { IPC_CHANNELS } from '../../shared/ipc.js'
import type { ChatMessage, ChatSession, GetSessionMessagesPageRequest } from '../../shared/ipc.js'
import * as store from '../store.js'
import { DEFAULT_AGENT_ID, agentExists } from '../agents/index.js'
import type { PermissionMode } from '../../shared/ipc.js'
import { workdirGateway } from '../variables/gateways.js'
import {
  clearSessionUsage,
  getSessionUsage,
  updateSessionUsage,
} from '../session/usage.js'

export { clearSessionUsage, getSessionUsage, updateSessionUsage } from '../session/usage.js'

export function registerSessionHandlers() {
  registerElectronSessionIpcHandlers({
    handlers: [
      {
        channel: IPC_CHANNELS.GET_SESSIONS,
        handle: async () => listOnethingSessionsForIpc({
          listSessions: () => store.getSessionsList(),
          logger: console,
        }),
      },
      {
        channel: IPC_CHANNELS.GET_SESSIONS_LIST,
        handle: async () => listOnethingSessionsForIpc({
          listSessions: () => store.getSessionsList(),
          logger: console,
        }),
      },
      {
        channel: IPC_CHANNELS.ACTIVATE_SESSION,
        handle: async (request) => {
          const { sessionId } = request as { sessionId: string }
          return activateOnethingSessionForIpc({
            sessionId,
            getSessionDetails: id => store.getSessionDetails(id),
            setCurrentSessionId: id => store.setCurrentSessionId(id),
            logger: console,
          })
        },
      },
      {
        channel: IPC_CHANNELS.GET_SESSION_MESSAGES,
        handle: async (request) => {
          const { sessionId } = request as { sessionId: string }
          return getOnethingSessionMessagesForIpc({
            sessionId,
            getSessionMessages: id => store.getSessionMessages(id),
            logger: console,
          })
        },
      },
      {
        channel: IPC_CHANNELS.GET_SESSION_MESSAGES_PAGE,
        handle: async (request) => {
          const typedRequest = request as GetSessionMessagesPageRequest
          const start = performance.now()
          const response = await getOnethingSessionMessagesPageForIpc({
            request: typedRequest,
            getSessionMessagesPage: nextRequest =>
              store.getSessionMessagesPage(nextRequest as GetSessionMessagesPageRequest),
            logger: console,
          })
          if (response.success) {
            console.info('[Perf][SessionPage][ipc]', {
              sessionId: typedRequest.sessionId,
              totalMs: Math.round(performance.now() - start),
              messages: response.messages?.length ?? 0,
              success: true,
            })
          } else {
            console.info('[Perf][SessionPage][ipc]', {
              sessionId: typedRequest.sessionId,
              totalMs: Math.round(performance.now() - start),
              failed: true,
            })
          }
          return response
        },
      },
      {
        channel: IPC_CHANNELS.GET_SESSION_USER_MARKERS,
        handle: async (request) => {
          const { sessionId } = request as { sessionId: string }
          return listOnethingSessionUserMarkersForIpc({
            sessionId,
            getSessionUserMessageMarkers: id => store.getSessionUserMessageMarkers(id),
            logger: console,
          })
        },
      },
      {
        channel: IPC_CHANNELS.CREATE_SESSION,
        handle: async (request) => {
          const { name } = request as { name?: string }
          return createOnethingSessionForIpc({
            sessionId: uuidv4(),
            name,
            createSession: (id, nextName) => store.createSession(id, nextName),
            logger: console,
          })
        },
      },
      {
        channel: IPC_CHANNELS.SWITCH_SESSION,
        handle: async (request) => {
          const { sessionId } = request as { sessionId: string }
          return switchOnethingSessionForIpc({
            sessionId,
            getSession: id => store.getSession(id),
            setCurrentSessionId: id => store.setCurrentSessionId(id),
            logger: console,
          })
        },
      },
      {
        channel: IPC_CHANNELS.GET_SESSION,
        handle: async (request) => {
          const { sessionId } = request as { sessionId: string }
          return getOnethingSessionForIpc({
            sessionId,
            getSession: id => store.getSession(id),
            logger: console,
          })
        },
      },
      {
        channel: IPC_CHANNELS.DELETE_SESSION,
        handle: async (request) => {
          const { sessionId } = request as { sessionId: string }
          return deleteOnethingSessionForIpc({
            sessionId,
            deleteSession: id => store.deleteSession(id),
            logger: console,
          })
        },
      },
      {
        channel: IPC_CHANNELS.RENAME_SESSION,
        handle: async (request) => {
          const { sessionId, newName } = request as { sessionId: string; newName: string }
          return renameOnethingSessionForIpc({
            sessionId,
            newName,
            renameSession: (id, nextName) => store.renameSession(id, nextName),
            logger: console,
          })
        },
      },
      {
        channel: IPC_CHANNELS.UPDATE_SESSION_PIN,
        handle: async (request) => {
          const { sessionId, isPinned } = request as { sessionId: string; isPinned: boolean }
          return updateOnethingSessionPinForIpc({
            sessionId,
            isPinned,
            updateSessionPin: (id, nextPinned) => store.updateSessionPin(id, nextPinned),
            logger: console,
          })
        },
      },
      {
        channel: IPC_CHANNELS.UPDATE_SESSION_ARCHIVED,
        handle: async (request) => {
          const { sessionId, isArchived, archivedAt } = request as {
            sessionId: string
            isArchived: boolean
            archivedAt?: number
          }
          return updateOnethingSessionArchivedForIpc({
            sessionId,
            isArchived,
            archivedAt,
            updateSessionArchived: (id, nextArchived, nextArchivedAt) =>
              store.updateSessionArchived(id, nextArchived, nextArchivedAt),
            logger: console,
          })
        },
      },
      {
        channel: IPC_CHANNELS.UPDATE_SESSION_WORKING_DIRECTORY,
        handle: async (request) => {
          const { sessionId, workingDirectory } = request as { sessionId: string; workingDirectory: string | null }
          return updateOnethingSessionWorkingDirectory({
            sessionId,
            workingDirectory,
            isDirectory: async path => (await fs.stat(path)).isDirectory(),
            writeWorkingDirectory: (id, nextWorkingDirectory) =>
              workdirGateway.write(id, nextWorkingDirectory),
          })
        },
      },
      {
        channel: IPC_CHANNELS.UPDATE_SESSION_MODEL,
        handle: async (request) => {
          const { sessionId, provider, model } = request as { sessionId: string; provider: string; model: string }
          return updateOnethingSessionModel({
            sessionId,
            provider,
            model,
            updateSessionModel: (id, nextProvider, nextModel) =>
              store.updateSessionModel(id, nextProvider, nextModel),
          })
        },
      },
      {
        channel: IPC_CHANNELS.UPDATE_SESSION_AGENT,
        handle: async (request) => {
          const { sessionId, agentId } = request as { sessionId: string; agentId?: string }
          return updateOnethingSessionAgent({
            sessionId,
            agentId,
            defaultAgentId: DEFAULT_AGENT_ID,
            agentExists,
            updateSessionAgent: (id, nextAgentId) =>
              store.updateSessionAgent(id, nextAgentId),
          })
        },
      },
      {
        channel: IPC_CHANNELS.UPDATE_SESSION_PERMISSION_MODE,
        handle: async (request) => {
          const { sessionId, permissionMode } = request as { sessionId: string; permissionMode: PermissionMode }
          return updateOnethingSessionPermissionMode<PermissionMode>({
            sessionId,
            permissionMode,
            allowedPermissionModes: ['normal', 'auto-accept-edits', 'dangerously-allow-all'],
            updateSessionPermissionMode: (id, nextPermissionMode) =>
              store.updateSessionPermissionMode(id, nextPermissionMode),
          })
        },
      },
      {
        channel: IPC_CHANNELS.CREATE_BRANCH,
        handle: async (request) => {
          const { parentSessionId, branchFromMessageId } = request as {
            parentSessionId: string
            branchFromMessageId: string
          }
          return createOnethingBranchSessionForIpc<ChatSession, ChatMessage, ChatSession>({
            parentSessionId,
            branchFromMessageId,
            adapters: {
              createId: uuidv4,
              getSession: id => store.getSession(id),
              createBranchSession: input => store.createBranchSession(
                input.branchId,
                input.branchName,
                input.parentSessionId,
                input.branchFromMessageId,
                input.inheritedMessages
              ),
            },
            logger: console,
          })
        },
      },
      {
        channel: IPC_CHANNELS.GET_SESSION_TOKEN_USAGE,
        handle: async (sessionId) => getOnethingSessionTokenUsageForIpc({
          sessionId: sessionId as string,
          getSessionTokenUsage: id => store.getSessionTokenUsage(id),
          logger: console,
        }),
      },
      {
        channel: 'add-system-message',
        handle: async (request) => {
          const { sessionId, message } = request as { sessionId: string; message: ChatMessage }
          return addOnethingSystemMessageForIpc({
            sessionId,
            message,
            addMessage: (id, nextMessage) => store.addMessage(id, nextMessage),
            logger: console,
          })
        },
      },
      {
        channel: 'remove-files-changed-message',
        handle: async (request) => {
          const { sessionId } = request as { sessionId: string }
          return removeOnethingSystemMarkerMessageForIpc({
            sessionId,
            markerType: 'files-changed',
            getSession: id => store.getSession(id),
            deleteMessage: (id, messageId) => store.deleteMessage(id, messageId),
            logger: console,
          })
        },
      },
      {
        channel: 'remove-git-status-message',
        handle: async (request) => {
          const { sessionId } = request as { sessionId: string }
          return removeOnethingSystemMarkerMessageForIpc({
            sessionId,
            markerType: 'git-status',
            getSession: id => store.getSession(id),
            deleteMessage: (id, messageId) => store.deleteMessage(id, messageId),
            logger: console,
          })
        },
      },
      {
        channel: 'remove-message',
        handle: async (request) => {
          const { sessionId, messageId } = request as { sessionId: string; messageId: string }
          return removeOnethingMessageForIpc({
            sessionId,
            messageId,
            deleteMessage: (id, nextMessageId) => store.deleteMessage(id, nextMessageId),
            logger: console,
          })
        },
      },
    ],
  })
}
