/**
 * Permission System
 *
 * Handles permission requests for tool execution.
 * Based on OpenCode's permission system design.
 *
 * Flow:
 * 1. Tool calls Permission.ask() before dangerous operations
 * 2. System checks if pattern is already approved (workspace → session)
 * 3. If not, emits event and waits for user response
 * 4. User can respond with: once, session, workspace, reject
 *
 * Permission Levels:
 * - once: Allow this single operation only (本次)
 * - session: Allow for the duration of this session (本会话)
 * - workspace: Permanently allow in this workspace (本工作区)
 * - reject: Deny the operation with optional reason
 */

import { BrowserWindow } from 'electron'
import { v4 as uuidv4 } from 'uuid'
import { IPC_CHANNELS } from '../../shared/ipc.js'
import * as WorkspacePermissions from './workspace-permissions.js'

export namespace Permission {
  /**
   * Permission request info
   */
  export interface Info {
    id: string
    type: string
    pattern?: string | string[]
    sessionId: string
    messageId: string
    callId?: string
    title: string
    metadata: Record<string, unknown>
    createdAt: number
    /** Working directory for workspace-level permissions */
    workingDirectory?: string
  }

  /**
   * User response types:
   * - 'once': Allow this single operation only
   * - 'session': Allow for the duration of this session
   * - 'workspace': Permanently allow in this workspace
   * - 'reject': Deny the operation
   */
  export type Response = 'once' | 'session' | 'workspace' | 'reject'

  /** Legacy response type for backwards compatibility */
  export type LegacyResponse = 'once' | 'always' | 'reject'

  /**
   * Permission state per session
   */
  interface SessionState {
    pending: Map<string, {
      info: Info
      resolve: () => void
      reject: (error: Error) => void
    }>
    approved: Map<string, boolean>
  }

  // Session permission state
  const sessions = new Map<string, SessionState>()

  function getSession(sessionId: string): SessionState {
    let session = sessions.get(sessionId)
    if (!session) {
      session = {
        pending: new Map(),
        approved: new Map(),
      }
      sessions.set(sessionId, session)
    }
    return session
  }

  /**
   * Convert pattern to keys for matching
   */
  function toKeys(pattern: Info['pattern'], type: string): string[] {
    if (pattern === undefined) return [type]
    return Array.isArray(pattern) ? pattern : [pattern]
  }

  /**
   * Check if keys are covered by approved patterns
   */
  function isCovered(keys: string[], approved: Map<string, boolean>): boolean {
    return keys.every(key => {
      for (const [pattern] of approved) {
        if (matchWildcard(key, pattern)) return true
      }
      return false
    })
  }

  /**
   * Simple wildcard matching (supports * at end)
   */
  function matchWildcard(text: string, pattern: string): boolean {
    if (pattern === text) return true
    if (pattern.endsWith('*')) {
      const prefix = pattern.slice(0, -1)
      return text.startsWith(prefix)
    }
    return false
  }

  /**
   * Get all pending permission requests for a session
   */
  export function getPending(sessionId: string): Info[] {
    const session = getSession(sessionId)
    return Array.from(session.pending.values()).map(p => p.info)
  }

  /**
   * Request permission for an operation
   *
   * @returns Promise that resolves when permission is granted, rejects when denied
   */
  export async function ask(input: {
    type: Info['type']
    title: Info['title']
    pattern?: Info['pattern']
    callId?: Info['callId']
    sessionId: Info['sessionId']
    messageId: Info['messageId']
    metadata: Info['metadata']
    /** Working directory for workspace-level permissions */
    workingDirectory?: string
  }): Promise<void> {
    const session = getSession(input.sessionId)
    const keys = toKeys(input.pattern, input.type)

    // Check if approved at workspace level first (persistent)
    if (input.workingDirectory) {
      if (WorkspacePermissions.areAllApprovedInWorkspace(input.workingDirectory, keys)) {
        console.log('[Permission] Already approved at workspace level:', keys)
        return
      }
    }

    // Check if approved at session level (in-memory)
    if (isCovered(keys, session.approved)) {
      console.log('[Permission] Already approved at session level:', keys)
      return
    }

    // Create permission request
    const info: Info = {
      id: uuidv4(),
      type: input.type,
      pattern: input.pattern,
      sessionId: input.sessionId,
      messageId: input.messageId,
      callId: input.callId,
      title: input.title,
      metadata: input.metadata,
      createdAt: Date.now(),
      workingDirectory: input.workingDirectory,
    }

    console.log('[Permission] Asking permission:', info.id, info.type, info.pattern)

    // Emit to frontend and wait for response
    return new Promise<void>((resolve, reject) => {
      session.pending.set(info.id, { info, resolve, reject })

      // Notify frontend
      const windows = BrowserWindow.getAllWindows()
      for (const win of windows) {
        win.webContents.send(IPC_CHANNELS.PERMISSION_REQUEST, info)
      }
    })
  }

  /**
   * Respond to a permission request
   */
  export function respond(input: {
    sessionId: string
    permissionId: string
    response: Response | LegacyResponse
    /** Optional reason for rejection */
    rejectReason?: string
  }): boolean {
    const session = getSession(input.sessionId)
    const pending = session.pending.get(input.permissionId)

    if (!pending) {
      console.warn('[Permission] No pending request:', input.permissionId)
      return false
    }

    // Normalize legacy 'always' to 'session'
    const response: Response = input.response === 'always' ? 'session' : input.response as Response

    console.log('[Permission] Response:', input.permissionId, response)

    session.pending.delete(input.permissionId)

    if (response === 'reject') {
      pending.reject(new RejectedError(
        input.sessionId,
        input.permissionId,
        pending.info.callId,
        pending.info.metadata,
        input.rejectReason
      ))
      return true
    }

    // Grant permission
    pending.resolve()

    const keys = toKeys(pending.info.pattern, pending.info.type)

    // Handle 'workspace' response - persist to workspace storage
    if (response === 'workspace' && pending.info.workingDirectory) {
      WorkspacePermissions.approveInWorkspace(pending.info.workingDirectory, keys)

      // Auto-approve any other pending requests that match (in this workspace)
      for (const [id, other] of session.pending) {
        if (other.info.workingDirectory === pending.info.workingDirectory) {
          const otherKeys = toKeys(other.info.pattern, other.info.type)
          if (WorkspacePermissions.areAllApprovedInWorkspace(pending.info.workingDirectory, otherKeys)) {
            session.pending.delete(id)
            other.resolve()
          }
        }
      }
    }

    // Handle 'session' response - store in session memory
    if (response === 'session') {
      for (const key of keys) {
        session.approved.set(key, true)
      }

      // Auto-approve any other pending requests that match
      for (const [id, other] of session.pending) {
        const otherKeys = toKeys(other.info.pattern, other.info.type)
        if (isCovered(otherKeys, session.approved)) {
          session.pending.delete(id)
          other.resolve()
        }
      }
    }

    return true
  }

  /**
   * Clear all pending permissions for a session (e.g., on abort)
   */
  export function clearSession(sessionId: string): void {
    const session = sessions.get(sessionId)
    if (!session) return

    for (const [, pending] of session.pending) {
      pending.reject(new RejectedError(
        sessionId,
        pending.info.id,
        pending.info.callId,
        pending.info.metadata,
        'Session cleared'
      ))
    }

    sessions.delete(sessionId)
  }

  /**
   * Error thrown when permission is rejected
   */
  export class RejectedError extends Error {
    constructor(
      public readonly sessionId: string,
      public readonly permissionId: string,
      public readonly toolCallId?: string,
      public readonly metadata?: Record<string, unknown>,
      reason?: string
    ) {
      // If user provided a reason, include it directly; otherwise use default message
      const message = reason
        ? `User rejected this operation: ${reason}`
        : 'The user rejected permission to use this tool. You may try again with different parameters.'
      super(message)
      this.name = 'PermissionRejectedError'
    }
  }
}
