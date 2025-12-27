/**
 * Permission System
 *
 * Handles permission requests for tool execution.
 * Based on OpenCode's permission system design.
 *
 * Flow:
 * 1. Tool calls Permission.ask() before dangerous operations
 * 2. System checks if pattern is already approved
 * 3. If not, emits event and waits for user response
 * 4. User can respond with: once, always, reject
 */

import { BrowserWindow } from 'electron'
import { v4 as uuidv4 } from 'uuid'
import { IPC_CHANNELS } from '../../shared/ipc.js'

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
  }

  /**
   * User response types
   */
  export type Response = 'once' | 'always' | 'reject'

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
  }): Promise<void> {
    const session = getSession(input.sessionId)

    // Check if already approved
    const keys = toKeys(input.pattern, input.type)
    if (isCovered(keys, session.approved)) {
      console.log('[Permission] Already approved:', keys)
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
    response: Response
  }): boolean {
    const session = getSession(input.sessionId)
    const pending = session.pending.get(input.permissionId)

    if (!pending) {
      console.warn('[Permission] No pending request:', input.permissionId)
      return false
    }

    console.log('[Permission] Response:', input.permissionId, input.response)

    session.pending.delete(input.permissionId)

    if (input.response === 'reject') {
      pending.reject(new RejectedError(
        input.sessionId,
        input.permissionId,
        pending.info.callId,
        pending.info.metadata
      ))
      return true
    }

    // Grant permission
    pending.resolve()

    // If 'always', approve the pattern for future requests
    if (input.response === 'always') {
      const keys = toKeys(pending.info.pattern, pending.info.type)
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
      super(
        reason ??
        'The user rejected permission to use this tool. You may try again with different parameters.'
      )
      this.name = 'PermissionRejectedError'
    }
  }
}
