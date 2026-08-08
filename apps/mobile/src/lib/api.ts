import type { ChatMessage, SessionMeta } from '@shared/ipc/chat.js'

/** Where the onething-server lives and how we authenticate to it. */
export interface ServerTarget {
  host: string
  port: number
  token: string
}

/** Mirrors GET /api/capabilities (packages/core/runtime-facade.ts RuntimeHostCapabilities). */
export interface Capabilities {
  localFileSystem: boolean
  workspaceFileSystem: boolean
  nativeWindowControls: boolean
  shellTools: boolean
  clipboardWrite: boolean
  desktopWindows: boolean
  globalMenuEvents: boolean
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export function baseUrlOf(target: ServerTarget): string {
  return `http://${target.host}:${target.port}`
}

async function request<T>(target: ServerTarget, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(baseUrlOf(target) + path, {
    ...init,
    headers: {
      authorization: `Bearer ${target.token}`,
      ...(init?.body ? { 'content-type': 'application/json' } : undefined),
      ...init?.headers,
    },
  })
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new ApiError(response.status, text || response.statusText)
  }
  return (await response.json()) as T
}

export interface SessionListResult {
  success: boolean
  sessions: SessionMeta[]
}

export interface CreateSessionResult {
  success: boolean
  session?: SessionMeta
  error?: string
}

/** GET /api/capabilities — doubles as the auth/connectivity probe on pairing. */
export function checkAuth(target: ServerTarget): Promise<Capabilities> {
  return request<Capabilities>(target, '/api/capabilities')
}

export function listSessions(target: ServerTarget): Promise<SessionListResult> {
  return request<SessionListResult>(target, '/api/sessions')
}

export function createSession(target: ServerTarget, name: string): Promise<CreateSessionResult> {
  return request<CreateSessionResult>(target, '/api/sessions', {
    method: 'POST',
    body: JSON.stringify({ name }),
  })
}

// ── Chat (M2) ───────────────────────────────────

/** Mirrors GetSessionMessagesPageResponse (packages/shared/ipc/chat.ts). */
export interface MessagePageResult {
  success: boolean
  messages?: ChatMessage[]
  nextCursor?: string | null
  backwardsCursor?: string | null
  hasMoreBefore?: boolean
  hasMoreAfter?: boolean
}

/** POST /api/session-messages/page — cursor=null loads the latest page. */
export function getMessagePage(
  target: ServerTarget,
  sessionId: string,
  cursor?: string | null,
  limit = 50,
): Promise<MessagePageResult> {
  return request<MessagePageResult>(target, '/api/session-messages/page', {
    method: 'POST',
    body: JSON.stringify({ sessionId, cursor: cursor ?? null, limit }),
  })
}

export interface CommandResult {
  success: boolean
  error?: string
}

/** POST /api/sessions/:id/commands with command:send-message. */
export function sendMessage(target: ServerTarget, sessionId: string, content: string): Promise<CommandResult> {
  return request<CommandResult>(target, `/api/sessions/${encodeURIComponent(sessionId)}/commands`, {
    method: 'POST',
    body: JSON.stringify({ type: 'command:send-message', channel: 'api', content }),
  })
}

/** POST /api/streams/abort. */
export function abortStream(target: ServerTarget, sessionId: string): Promise<CommandResult> {
  return request<CommandResult>(target, '/api/streams/abort', {
    method: 'POST',
    body: JSON.stringify({ sessionId }),
  })
}
