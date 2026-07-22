/**
 * Permission IPC Handlers
 *
 * Handles IPC communication for permission-related operations.
 *
 * Note: Permission responses now flow through the unified command channel
 * (SESSION_COMMAND → EventBus → Permission subscription) with channel
 * affinity validation.
 */

import {
  registerElectronPermissionIpcHandlers,
  type ElectronPermissionClearSessionGrantsRequest,
  type ElectronPermissionClearWorkspaceGrantsRequest,
  type ElectronPermissionListGrantsRequest,
  type ElectronPermissionRevokeGrantRequest,
  type ElectronPermissionSessionId,
} from '@onething/electron-host/ipc/permission'
import {
  clearOnethingPermissionSessionForIpc,
  clearOnethingSessionPermissionGrantsForIpc,
  clearOnethingWorkspacePermissionGrantsForIpc,
  getOnethingPendingPermissionsForIpc,
  listOnethingPermissionGrantsForIpc,
  revokeOnethingPermissionGrantForIpc,
} from '@onething/runtime/permissions'
import { Permission } from '../permission/index.js'
import * as PermissionGrants from '../permission/permission-grants.js'
import { IPC_CHANNELS } from '../../shared/ipc.js'

/**
 * Register all permission-related IPC handlers
 */
export function registerPermissionHandlers(): void {
  // Permission responses go through SESSION_COMMAND → EventBus →
  // Permission.initialize() subscription, which validates channel affinity.

  registerElectronPermissionIpcHandlers({
    channels: {
      getPending: IPC_CHANNELS.PERMISSION_GET_PENDING,
      clearSession: IPC_CHANNELS.PERMISSION_CLEAR_SESSION,
      listGrants: IPC_CHANNELS.PERMISSION_LIST_GRANTS,
      revokeGrant: IPC_CHANNELS.PERMISSION_REVOKE_GRANT,
      clearSessionGrants: IPC_CHANNELS.PERMISSION_CLEAR_SESSION_GRANTS,
      clearWorkspaceGrants: IPC_CHANNELS.PERMISSION_CLEAR_WORKSPACE_GRANTS,
    },
    getPending: (sessionId: ElectronPermissionSessionId) => {
      return getOnethingPendingPermissionsForIpc({
        sessionId,
        // Full picture including queued prompts/followers (promptState-labeled)
        // so the renderer can rebuild per-tool-call waiting states on reload.
        getPending: Permission.getPendingPrompts,
        logger: console,
      })
    },
    listGrants: (request: ElectronPermissionListGrantsRequest) => {
      return listOnethingPermissionGrantsForIpc({
        sessionId: request.sessionId,
        workspaceRoot: request.workspaceRoot,
        userId: request.userId,
        workspaceId: request.workspaceId,
        listSessionGrants: PermissionGrants.listSessionGrants,
        listWorkspaceGrants: PermissionGrants.listWorkspaceGrants,
        logger: console,
      })
    },
    revokeGrant: (request: ElectronPermissionRevokeGrantRequest) => {
      return revokeOnethingPermissionGrantForIpc({
        id: request.id,
        revokeGrant: PermissionGrants.revokeGrant,
        logger: console,
      })
    },
    clearSessionGrants: (request: ElectronPermissionClearSessionGrantsRequest) => {
      return clearOnethingSessionPermissionGrantsForIpc({
        sessionId: request.sessionId,
        clearSessionGrants: PermissionGrants.clearSessionGrants,
        logger: console,
      })
    },
    clearWorkspaceGrants: (request: ElectronPermissionClearWorkspaceGrantsRequest) => {
      return clearOnethingWorkspacePermissionGrantsForIpc({
        workspaceRoot: request.workspaceRoot,
        userId: request.userId,
        workspaceId: request.workspaceId,
        clearWorkspaceGrants: PermissionGrants.clearWorkspaceGrants,
        logger: console,
      })
    },
    clearSession: (sessionId: ElectronPermissionSessionId) => {
      return clearOnethingPermissionSessionForIpc({
        sessionId,
        clearSession: Permission.clearSession,
        logger: console,
      })
    },
  })

  console.log('[Permission IPC] Handlers registered')
}
