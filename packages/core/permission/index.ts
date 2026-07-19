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

export type PermissionBusEvent =
  | {
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
    }
  | {
      type: 'permission:queued'
      requestId: string
      toolCallId: string
      messageId: string
    }
  | {
      type: 'permission:settled'
      requestId: string
      toolCallIds: string[]
      decision: 'allowed' | 'rejected'
    }

export interface PermissionEventBusLike {
  onAnySession(
    eventType: string,
    handler: (envelope: PermissionCommandEnvelope) => void,
    label?: string
  ): () => void
  emit(sessionId: string, event: PermissionBusEvent): Promise<unknown>
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

  interface PendingSettler {
    resolve: () => void
    reject: (error: Error) => void
  }

  interface PendingEntry extends PendingSettler {
    info: Info
    /**
     * Equivalent asks issued while this one is pending share its outcome
     * instead of prompting again.
     */
    followers: PendingSettler[]
    /** Tool call ids of coalesced followers, for the settled event. */
    followerCallIds: string[]
    /** Whether the permission:request event has been sent to the channel. */
    emitted: boolean
  }

  interface SessionState {
    pending: Map<string, PendingEntry>
    /**
     * Ask order. Only the head request is emitted to the UI/gateway; the rest
     * wait so concurrent tools never stack prompts, and a grant landing in the
     * meantime can settle them before they are ever shown.
     */
    promptOrder: string[]
  }

  const sessions = new Map<string, SessionState>()
  let eventBus: PermissionEventBusLike | null = null
  let channelResolver: ((sessionId: string) => string) | null = null
  let modeResolver: ((sessionId: string) => Mode) | null = null
  let unsubPermissionRespond: (() => void) | null = null

  function getSession(sessionId: string): SessionState {
    let session = sessions.get(sessionId)
    if (!session) {
      session = { pending: new Map(), promptOrder: [] }
      sessions.set(sessionId, session)
    }
    return session
  }

  function equivalenceKey(info: Pick<Info, 'type' | 'pattern' | 'workingDirectory' | 'userId' | 'workspaceId' | 'metadata'>): string {
    // metadata carries the concrete request (bash command text, MCP args,
    // file diff…). Including it restricts coalescing to literally identical
    // requests: a bash pattern like `rm *` must NOT merge two different rm
    // commands, or approving the shown one would silently approve the other.
    // Identical construction sites produce identical key order, so plain
    // JSON.stringify is a stable discriminator here.
    return JSON.stringify([
      info.type,
      info.pattern ?? null,
      info.workingDirectory ?? null,
      info.userId ?? null,
      info.workspaceId ?? null,
      info.metadata ?? null,
    ])
  }

  function findEquivalentPending(session: SessionState, info: Info): PendingEntry | undefined {
    const key = equivalenceKey(info)
    for (const entry of session.pending.values()) {
      if (equivalenceKey(entry.info) === key) return entry
    }
    return undefined
  }

  function removePending(session: SessionState, id: string): void {
    session.pending.delete(id)
    const index = session.promptOrder.indexOf(id)
    if (index !== -1) session.promptOrder.splice(index, 1)
  }

  function emitPermissionEvent(sessionId: string, event: PermissionBusEvent): void {
    eventBus?.emit(sessionId, event)
      .catch(err => console.error('[Permission] EventBus emit error:', err))
  }

  function emitSettled(entry: PendingEntry, decision: 'allowed' | 'rejected'): void {
    const toolCallIds = [entry.info.callId, ...entry.followerCallIds]
      .filter((id): id is string => Boolean(id))
    emitPermissionEvent(entry.info.sessionId, {
      type: 'permission:settled',
      requestId: entry.info.id,
      toolCallIds,
      decision,
    })
  }

  function settlePendingResolve(session: SessionState, entry: PendingEntry): void {
    removePending(session, entry.info.id)
    entry.resolve()
    for (const follower of entry.followers) follower.resolve()
    emitSettled(entry, 'allowed')
  }

  function settlePendingReject(session: SessionState, entry: PendingEntry, error: Error): void {
    removePending(session, entry.info.id)
    entry.reject(error)
    for (const follower of entry.followers) follower.reject(error)
    emitSettled(entry, 'rejected')
  }

  function emitNextPrompt(sessionId: string, session: SessionState): void {
    const headId = session.promptOrder[0]
    if (!headId) return
    const entry = session.pending.get(headId)
    if (!entry || entry.emitted) return
    entry.emitted = true

    if (!eventBus) {
      console.warn('[Permission] EventBus not initialized, permission request will hang')
      return
    }
    const info = entry.info
    eventBus.emit(sessionId, {
      type: 'permission:request',
      requestId: info.id,
      targetChannel: info.targetChannel ?? 'ipc',
      toolCallId: info.callId || '',
      messageId: info.messageId,
      permissionType: info.type,
      title: info.title,
      pattern: info.pattern,
      metadata: info.metadata,
      userId: info.userId,
      workspaceId: info.workspaceId,
    }).catch(err => console.error('[Permission] EventBus emit error:', err))
  }

  export function initialize(
    bus: PermissionEventBusLike,
    resolver: (sessionId: string) => string,
    permissionModeResolver?: (sessionId: string) => Mode,
  ): void {
    // Re-initialization must not leak the previous respond subscription.
    unsubPermissionRespond?.()
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
    // Only emitted requests are visible prompts; queued ones surface when they
    // reach the head of the prompt queue.
    return Array.from(session.pending.values())
      .filter(p => p.emitted)
      .map(p => p.info)
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

    const equivalent = findEquivalentPending(session, info)
    if (equivalent) {
      console.log('[Permission] Coalescing permission ask into pending:', equivalent.info.id, info.type, info.pattern)
      return new Promise<void>((resolve, reject) => {
        equivalent.followers.push({ resolve, reject })
        if (info.callId) {
          equivalent.followerCallIds.push(info.callId)
          emitPermissionEvent(input.sessionId, {
            type: 'permission:queued',
            requestId: equivalent.info.id,
            toolCallId: info.callId,
            messageId: info.messageId,
          })
        }
      })
    }

    console.log('[Permission] Asking permission:', info.id, info.type, info.pattern, 'targetChannel:', targetChannel)

    return new Promise<void>((resolve, reject) => {
      const entry: PendingEntry = { info, resolve, reject, followers: [], followerCallIds: [], emitted: false }
      session.pending.set(info.id, entry)
      session.promptOrder.push(info.id)
      emitNextPrompt(input.sessionId, session)
      if (!entry.emitted && info.callId) {
        emitPermissionEvent(input.sessionId, {
          type: 'permission:queued',
          requestId: info.id,
          toolCallId: info.callId,
          messageId: info.messageId,
        })
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

    if (response === 'reject') {
      settlePendingReject(session, pending, new RejectedError(
        input.sessionId,
        input.permissionId,
        pending.info.callId,
        pending.info.metadata,
        input.rejectReason,
      ))
      emitNextPrompt(input.sessionId, session)
      return true
    }

    settlePendingResolve(session, pending)

    if (
      response === 'workdir' &&
      pending.info.workingDirectory &&
      PermissionGrants.isGrantableType(pending.info.type)
    ) {
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
      for (const other of Array.from(session.pending.values())) {
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
            settlePendingResolve(session, other)
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
      for (const other of Array.from(session.pending.values())) {
        const otherGrant = PermissionGrants.matchGrant({
          type: other.info.type,
          pattern: other.info.pattern,
          sessionId: input.sessionId,
          workspaceRoot: other.info.workingDirectory,
          userId: other.info.userId,
          workspaceId: other.info.workspaceId,
        })
        if (otherGrant) {
          settlePendingResolve(session, other)
        }
      }
    }

    emitNextPrompt(input.sessionId, session)
    return true
  }

  export function clearSession(sessionId: string): void {
    const session = sessions.get(sessionId)
    if (!session) return

    for (const pending of Array.from(session.pending.values())) {
      settlePendingReject(session, pending, new RejectedError(
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

export * from './capability-registry.js'
export * from './permission-grants.js'
export * from './permission-policy.js'
