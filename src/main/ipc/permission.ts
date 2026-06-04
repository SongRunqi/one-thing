/**
 * Permission IPC Handlers
 *
 * Handles IPC communication for permission-related operations.
 *
 * Note: Permission responses now flow through the unified command channel
 * (SESSION_COMMAND → EventBus → Permission subscription) with channel
 * affinity validation.
 */

import { ipcMain } from 'electron'
import { Permission } from '../permission/index.js'
import * as PermissionGrants from '../permission/permission-grants.js'
import { IPC_CHANNELS } from '../../shared/ipc.js'

/**
 * Register all permission-related IPC handlers
 */
export function registerPermissionHandlers(): void {
  // Permission responses go through SESSION_COMMAND → EventBus →
  // Permission.initialize() subscription, which validates channel affinity.

  // Get pending permissions for a session (used for session switch recovery)
  ipcMain.handle(IPC_CHANNELS.PERMISSION_GET_PENDING, async (_event, sessionId: string) => {
    try {
      const pending = Permission.getPending(sessionId)
      return { success: true, pending }
    } catch (error: any) {
      console.error('[Permission IPC] Error getting pending permissions:', error)
      return {
        success: false,
        error: error.message || 'Failed to get pending permissions',
      }
    }
  })

  ipcMain.handle(IPC_CHANNELS.PERMISSION_LIST_GRANTS, async (_event, request: { sessionId?: string; workspaceRoot?: string }) => {
    try {
      return {
        success: true,
        sessionGrants: request.sessionId ? PermissionGrants.listSessionGrants(request.sessionId) : [],
        workspaceGrants: request.workspaceRoot ? PermissionGrants.listWorkspaceGrants(request.workspaceRoot) : [],
      }
    } catch (error: any) {
      console.error('[Permission IPC] Error listing grants:', error)
      return { success: false, error: error.message || 'Failed to list permission grants' }
    }
  })

  ipcMain.handle(IPC_CHANNELS.PERMISSION_REVOKE_GRANT, async (_event, request: { id: string }) => {
    try {
      return { success: PermissionGrants.revokeGrant(request.id) }
    } catch (error: any) {
      console.error('[Permission IPC] Error revoking grant:', error)
      return { success: false, error: error.message || 'Failed to revoke permission grant' }
    }
  })

  ipcMain.handle(IPC_CHANNELS.PERMISSION_CLEAR_SESSION_GRANTS, async (_event, request: { sessionId: string }) => {
    try {
      PermissionGrants.clearSessionGrants(request.sessionId)
      return { success: true }
    } catch (error: any) {
      console.error('[Permission IPC] Error clearing session grants:', error)
      return { success: false, error: error.message || 'Failed to clear session grants' }
    }
  })

  ipcMain.handle(IPC_CHANNELS.PERMISSION_CLEAR_WORKSPACE_GRANTS, async (_event, request: { workspaceRoot: string }) => {
    try {
      PermissionGrants.clearWorkspaceGrants(request.workspaceRoot)
      return { success: true }
    } catch (error: any) {
      console.error('[Permission IPC] Error clearing workspace grants:', error)
      return { success: false, error: error.message || 'Failed to clear workspace grants' }
    }
  })

  // Clear session permissions
  ipcMain.handle(IPC_CHANNELS.PERMISSION_CLEAR_SESSION, async (_event, sessionId: string) => {
    try {
      Permission.clearSession(sessionId)
      return { success: true }
    } catch (error: any) {
      console.error('[Permission IPC] Error clearing session:', error)
      return {
        success: false,
        error: error.message || 'Failed to clear session',
      }
    }
  })

  console.log('[Permission IPC] Handlers registered')
}
