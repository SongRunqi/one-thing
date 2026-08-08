import { AppState, type AppStateStatus } from 'react-native'
import { baseUrlOf, type ServerTarget } from './api'
import { readSseStream, type SseFrame } from './sse'
import type { SessionEventEnvelopeWire, StreamChunkWire } from './chat-reducer'
import { useMessagesStore } from '../stores/messages'

/**
 * EventStreamService — the mobile resilience core.
 *
 * - One SSE connection per subscribed session (`GET /api/sessions/:id/events`).
 * - Tracks the last consumed `sequence` per session; every reconnect resumes
 *   with `?after=<seq>` so the server replays committed events from its ring
 *   buffer (chunks are not replayed — text gaps heal via content:part).
 * - Exponential backoff between reconnects, reset on a successful read.
 * - AppState: iOS suspends SSE in background → force-reconnect all
 *   subscriptions when the app returns to foreground.
 */

const MIN_RETRY_MS = 500
const MAX_RETRY_MS = 15_000

interface Subscription {
  target: ServerTarget
  sessionId: string
  controller: AbortController | null
  lastSeq: number | null
  retryAttempt: number
  retryTimer: ReturnType<typeof setTimeout> | null
  running: boolean
}

const subscriptions = new Map<string, Subscription>()
let appStateInitialized = false

export function initEventStreamAppStateHandler(): void {
  if (appStateInitialized) return
  appStateInitialized = true
  AppState.addEventListener('change', (status: AppStateStatus) => {
    if (status !== 'active') return
    for (const sub of subscriptions.values()) {
      if (sub.running) reconnectNow(sub)
    }
  })
}

export function subscribeSessionEvents(target: ServerTarget, sessionId: string): void {
  initEventStreamAppStateHandler()
  const existing = subscriptions.get(sessionId)
  if (existing) {
    existing.target = target
    if (!existing.running) start(existing)
    return
  }
  const sub: Subscription = {
    target,
    sessionId,
    controller: null,
    lastSeq: null,
    retryAttempt: 0,
    retryTimer: null,
    running: false,
  }
  subscriptions.set(sessionId, sub)
  start(sub)
}

export function unsubscribeSessionEvents(sessionId: string): void {
  const sub = subscriptions.get(sessionId)
  if (!sub) return
  subscriptions.delete(sessionId)
  stop(sub)
}

export function unsubscribeAllSessionEvents(): void {
  for (const sessionId of [...subscriptions.keys()]) unsubscribeSessionEvents(sessionId)
}

function stop(sub: Subscription): void {
  sub.running = false
  if (sub.retryTimer) {
    clearTimeout(sub.retryTimer)
    sub.retryTimer = null
  }
  sub.controller?.abort()
  sub.controller = null
}

function start(sub: Subscription): void {
  sub.running = true
  void connect(sub)
}

function reconnectNow(sub: Subscription): void {
  if (sub.retryTimer) {
    clearTimeout(sub.retryTimer)
    sub.retryTimer = null
  }
  sub.controller?.abort()
  sub.controller = null
  sub.retryAttempt = 0
  void connect(sub)
}

async function connect(sub: Subscription): Promise<void> {
  if (!sub.running) return
  const controller = new AbortController()
  sub.controller = controller
  const after = sub.lastSeq != null ? `?after=${sub.lastSeq}` : ''
  const url = `${baseUrlOf(sub.target)}/api/sessions/${encodeURIComponent(sub.sessionId)}/events${after}`

  try {
    const response = await fetch(url, {
      headers: {
        authorization: `Bearer ${sub.target.token}`,
        accept: 'text/event-stream',
      },
      signal: controller.signal,
    })
    if (!response.ok || !response.body) {
      throw new Error(`SSE connect failed: HTTP ${response.status}`)
    }
    sub.retryAttempt = 0
    await readSseStream(response.body, (frame) => handleFrame(sub, frame), controller.signal)
  } catch {
    if (controller.signal.aborted) return // intentional teardown
  }
  if (sub.running) scheduleReconnect(sub)
}

function scheduleReconnect(sub: Subscription): void {
  const delay = Math.min(MAX_RETRY_MS, MIN_RETRY_MS * 2 ** sub.retryAttempt)
  sub.retryAttempt += 1
  sub.retryTimer = setTimeout(() => {
    sub.retryTimer = null
    void connect(sub)
  }, delay)
}

function handleFrame(sub: Subscription, frame: SseFrame): void {
  if (frame.event === 'session:event') {
    let envelope: SessionEventEnvelopeWire
    try {
      envelope = JSON.parse(frame.data) as SessionEventEnvelopeWire
    } catch {
      return
    }
    if (typeof envelope.sequence === 'number') sub.lastSeq = envelope.sequence
    useMessagesStore.getState().applySessionEvent(sub.sessionId, envelope)
    return
  }
  if (frame.event === 'session:stream') {
    let payload: { chunk?: StreamChunkWire }
    try {
      payload = JSON.parse(frame.data) as { chunk?: StreamChunkWire }
    } catch {
      return
    }
    if (payload.chunk) useMessagesStore.getState().applyStreamChunk(sub.sessionId, payload.chunk)
  }
}
