import { randomUUID } from 'node:crypto'
import type { JsonObject } from '../json.js'
import * as PermissionGrants from './permission-grants.js'

export const DEFAULT_PERMISSION_REJECTED_MESSAGE = 'The user rejected permission for this tool.'

export function formatPermissionRejectedMessage(reason?: string): string {
  const trimmedReason = typeof reason === 'string' ? reason.trim() : ''
  return trimmedReason
    ? `${DEFAULT_PERMISSION_REJECTED_MESSAGE} Reason: ${trimmedReason}`
    : DEFAULT_PERMISSION_REJECTED_MESSAGE
}

export interface PermissionCommandEnvelope<TCommand = unknown> {
  sessionId: string
  event: TCommand
}

export interface PermissionEventBusLike {
  onAnySession(
    eventType: string,
    handler: (envelope: PermissionCommandEnvelope) => void,
    label?: string
  ): () => void
  emit(sessionId: string, event: {
    type: 'permission:request'
    requestId: string
    targetChannel: string
    toolCallId: string
    messageId: string
    permissionType: string
    title: string
    pattern?: string | string[]
    metadata: JsonObject
    userId?: string
    workspaceId?: string
  }): Promise<unknown>
}

export interface PermissionRespondCommandLike {
  requestId: string
  decision: Permission.Response
  channel?: string
  rejectReason?: string
}

export namespace Permission {
  export interface Info {
    id: string
    type: string
    pattern?: string | string[]
    sessionId: string
    messageId: string
    callId?: string
    title: string
    metadata: JsonObject
    createdAt: number
    workingDirectory?: string
    targetChannel?: string
    userId?: string
    workspaceId?: string
  }

  export type Response = 'once' | 'session' | 'workdir' | 'reject'
  export type Mode = 'normal' | 'auto-accept-edits' | 'dangerously-allow-all'

  interface SessionState {
    pending: Map<string, {
      info: Info
      resolve: () => void
      reject: (error: Error) => void
    }>
  }

  const sessions = new Map<string, SessionState>()
  let eventBus: PermissionEventBusLike | null = null
  let channelResolver: ((sessionId: string) => string) | null = null
  let modeResolver: ((sessionId: string) => Mode) | null = null
  let unsubPermissionRespond: (() => void) | null = null

  function getSession(sessionId: string): SessionState {
    let session = sessions.get(sessionId)
    if (!session) {
      session = { pending: new Map() }
      sessions.set(sessionId, session)
    }
    return session
  }

  export function initialize(
    bus: PermissionEventBusLike,
    resolver: (sessionId: string) => string,
    permissionModeResolver?: (sessionId: string) => Mode,
  ): void {
    eventBus = bus
    channelResolver = resolver
    modeResolver = permissionModeResolver ?? null

    unsubPermissionRespond = bus.onAnySession(
      'command:permission-respond',
      (envelope) => {
        const cmd = envelope.event as PermissionRespondCommandLike
        const sessionId = envelope.sessionId
        const responseChannel = cmd.channel || 'ipc'

        const session = getSession(sessionId)
        const pending = session.pending.get(cmd.requestId)
        if (!pending) {
          console.warn('[Permission] No pending request for respond:', cmd.requestId)
          return
        }

        const expectedChannel = pending.info.targetChannel || 'ipc'
        if (expectedChannel !== responseChannel) {
          console.warn(
            `[Permission] Response from wrong channel: expected '${expectedChannel}', got '${responseChannel}'. Ignoring.`,
          )
          return
        }

        respond({
          sessionId,
          permissionId: cmd.requestId,
          response: cmd.decision,
          rejectReason: cmd.rejectReason,
        })
      },
      'Permission',
    )

    console.log('[Permission] Initialized with EventBus')
  }

  export function shutdown(): void {
    if (unsubPermissionRespond) {
      unsubPermissionRespond()
      unsubPermissionRespond = null
    }
    eventBus = null
    channelResolver = null
    modeResolver = null
    console.log('[Permission] Shut down')
  }

  export function getPending(sessionId: string): Info[] {
    const session = getSession(sessionId)
    return Array.from(session.pending.values()).map(p => p.info)
  }

  export function getMode(sessionId: string): Mode {
    return modeResolver ? modeResolver(sessionId) : 'normal'
  }

  export async function ask(input: {
    type: Info['type']
    title: Info['title']
    pattern?: Info['pattern']
    callId?: Info['callId']
    sessionId: Info['sessionId']
    messageId: Info['messageId']
    metadata: Info['metadata']
    workingDirectory?: string
    userId?: string
    workspaceId?: string
  }): Promise<void> {
    const session = getSession(input.sessionId)
    const targetChannel = channelResolver ? channelResolver(input.sessionId) : 'ipc'
    const info: Info = {
      id: randomUUID(),
      type: input.type,
      pattern: input.pattern,
      sessionId: input.sessionId,
      messageId: input.messageId,
      callId: input.callId,
      title: input.title,
      metadata: input.metadata,
      createdAt: Date.now(),
      workingDirectory: input.workingDirectory,
      targetChannel,
      userId: input.userId,
      workspaceId: input.workspaceId,
    }

    console.log('[Permission] Asking permission:', info.id, info.type, info.pattern, 'targetChannel:', targetChannel)

    return new Promise<void>((resolve, reject) => {
      session.pending.set(info.id, { info, resolve, reject })

      if (eventBus) {
        eventBus.emit(input.sessionId, {
          type: 'permission:request',
          requestId: info.id,
          targetChannel,
          toolCallId: info.callId || '',
          messageId: info.messageId,
          permissionType: info.type,
          title: info.title,
          pattern: info.pattern,
          metadata: info.metadata,
          userId: info.userId,
          workspaceId: info.workspaceId,
        }).catch(err => console.error('[Permission] EventBus emit error:', err))
      } else {
        console.warn('[Permission] EventBus not initialized, permission request will hang')
      }
    })
  }

  export function respond(input: {
    sessionId: string
    permissionId: string
    response: Response
    rejectReason?: string
  }): boolean {
    const session = getSession(input.sessionId)
    const pending = session.pending.get(input.permissionId)

    if (!pending) {
      console.warn('[Permission] No pending request:', input.permissionId)
      return false
    }

    const response = input.response

    console.log('[Permission] Response:', input.permissionId, response)
    session.pending.delete(input.permissionId)

    if (response === 'reject') {
      pending.reject(new RejectedError(
        input.sessionId,
        input.permissionId,
        pending.info.callId,
        pending.info.metadata,
        input.rejectReason,
      ))
      return true
    }

    pending.resolve()

    if (response === 'workdir' && pending.info.workingDirectory) {
      PermissionGrants.addGrant({
        scope: 'workspace',
        type: pending.info.type,
        pattern: pending.info.pattern ?? pending.info.type,
        workspaceRoot: pending.info.workingDirectory,
        userId: pending.info.userId,
        workspaceId: pending.info.workspaceId,
        createdFrom: {
          messageId: pending.info.messageId,
          toolCallId: pending.info.callId,
          title: pending.info.title,
        },
        metadata: pending.info.metadata,
      })
      for (const [id, other] of session.pending) {
        if (other.info.workingDirectory === pending.info.workingDirectory) {
          const otherGrant = PermissionGrants.matchGrant({
            type: other.info.type,
            pattern: other.info.pattern,
            sessionId: input.sessionId,
            workspaceRoot: other.info.workingDirectory,
            userId: other.info.userId,
            workspaceId: other.info.workspaceId,
          })
          if (otherGrant) {
            session.pending.delete(id)
            other.resolve()
          }
        }
      }
    }

    if (response === 'session') {
      PermissionGrants.addGrant({
        scope: 'session',
        type: pending.info.type,
        pattern: pending.info.pattern ?? pending.info.type,
        sessionId: input.sessionId,
        userId: pending.info.userId,
        workspaceId: pending.info.workspaceId,
        createdFrom: {
          messageId: pending.info.messageId,
          toolCallId: pending.info.callId,
          title: pending.info.title,
        },
        metadata: pending.info.metadata,
      })
      for (const [id, other] of session.pending) {
        const otherGrant = PermissionGrants.matchGrant({
          type: other.info.type,
          pattern: other.info.pattern,
          sessionId: input.sessionId,
          workspaceRoot: other.info.workingDirectory,
          userId: other.info.userId,
          workspaceId: other.info.workspaceId,
        })
        if (otherGrant) {
          session.pending.delete(id)
          other.resolve()
        }
      }
    }

    return true
  }

  export function clearSession(sessionId: string): void {
    const session = sessions.get(sessionId)
    if (!session) return

    for (const [, pending] of session.pending) {
      pending.reject(new RejectedError(
        sessionId,
        pending.info.id,
        pending.info.callId,
        pending.info.metadata,
        'Session cleared',
      ))
    }

    sessions.delete(sessionId)
  }

  export class RejectedError extends Error {
    constructor(
      public readonly sessionId: string,
      public readonly permissionId: string,
      public readonly toolCallId?: string,
      public readonly metadata?: JsonObject,
      public readonly reason?: string,
    ) {
      super(formatPermissionRejectedMessage(reason))
      this.name = 'PermissionRejectedError'
    }
  }
}

export * from './permission-grants.js'
export * from './permission-policy.js'
