/**
 * Permission IPC Handlers
 *
 * Handles IPC communication for permission-related operations.
 */

import { ipcMain } from 'electron'
import { Permission } from '../permission/index.js'
import { IPC_CHANNELS } from '../../shared/ipc.js'

/**
 * Register all permission-related IPC handlers
 */
export function registerPermissionHandlers(): void {
  // Respond to a permission request
  ipcMain.handle(IPC_CHANNELS.PERMISSION_RESPOND, async (_event, request: {
    sessionId: string
    permissionId: string
    response: Permission.Response
  }) => {
    try {
      const success = Permission.respond(request)
      return { success }
    } catch (error: any) {
      console.error('[Permission IPC] Error responding to permission:', error)
      return {
        success: false,
        error: error.message || 'Failed to respond to permission',
      }
    }
  })

  // Get pending permissions for a session
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
