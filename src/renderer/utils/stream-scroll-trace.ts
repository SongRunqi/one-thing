/**
 * Dev-only frame-level trace for diagnosing streaming scroll jitter.
 *
 * Enable:  localStorage.setItem('debug:stream-scroll', '1')
 * Disable: localStorage.removeItem('debug:stream-scroll')
 *
 * When enabled, records per-frame snapshots of scroll geometry, virtualizer
 * state, DOM heights, and the trigger source. On anomaly (isFollowing but
 * distanceToBottom > threshold), dumps the last N frames to console.table.
 */

export interface TraceFrame {
  frameId: number
  ts: number
  trigger: string
  scrollTop: number
  scrollHeight: number
  clientHeight: number
  distanceToBottom: number
  virtualizerTotalSize: number | null
  lastMessageHeight: number | null
  lastCodeBlockHeight: number | null
  streamTextLen: number | null
  codeBlockLines: number | null
  isFollowing: boolean
  extra?: string
}

const RING_SIZE = 40
const ANOMALY_THRESHOLD = 2

let enabled: boolean | null = null
let globalFrameId = 0
let rafFrameId = 0
let lastRafTs = 0

const ring: TraceFrame[] = []
let ringIdx = 0

function isEnabled(): boolean {
  if (enabled === null) {
    try {
      enabled = localStorage.getItem('debug:stream-scroll') === '1'
    } catch {
      enabled = false
    }
  }
  return enabled
}

export function refreshEnabled(): void {
  enabled = null
}

function tickFrame(): void {
  if (rafFrameId) return
  rafFrameId = requestAnimationFrame((ts) => {
    rafFrameId = 0
    if (ts !== lastRafTs) {
      globalFrameId++
      lastRafTs = ts
    }
  })
}

function pushFrame(frame: TraceFrame): void {
  if (ring.length < RING_SIZE) {
    ring.push(frame)
  } else {
    ring[ringIdx % RING_SIZE] = frame
  }
  ringIdx++
}

function getOrderedFrames(): TraceFrame[] {
  if (ring.length < RING_SIZE) return [...ring]
  const start = ringIdx % RING_SIZE
  return [...ring.slice(start), ...ring.slice(0, start)]
}

export function traceEvent(
  trigger: string,
  getScrollEl: () => HTMLElement | null,
  opts: {
    isFollowing: boolean
    virtualizerTotalSize?: number | null
    lastMessageHeight?: number | null
    lastCodeBlockHeight?: number | null
    streamTextLen?: number | null
    codeBlockLines?: number | null
    extra?: string
  },
): void {
  if (!isEnabled()) return
  tickFrame()

  const el = getScrollEl()
  const scrollTop = el?.scrollTop ?? 0
  const scrollHeight = el?.scrollHeight ?? 0
  const clientHeight = el?.clientHeight ?? 0
  const distanceToBottom = scrollHeight - scrollTop - clientHeight

  const frame: TraceFrame = {
    frameId: globalFrameId,
    ts: performance.now(),
    trigger,
    scrollTop: Math.round(scrollTop),
    scrollHeight: Math.round(scrollHeight),
    clientHeight: Math.round(clientHeight),
    distanceToBottom: Math.round(distanceToBottom),
    virtualizerTotalSize: opts.virtualizerTotalSize ?? null,
    lastMessageHeight: opts.lastMessageHeight ?? null,
    lastCodeBlockHeight: opts.lastCodeBlockHeight ?? null,
    streamTextLen: opts.streamTextLen ?? null,
    codeBlockLines: opts.codeBlockLines ?? null,
    isFollowing: opts.isFollowing,
    extra: opts.extra,
  }

  pushFrame(frame)

  if (opts.isFollowing && Math.abs(distanceToBottom) > ANOMALY_THRESHOLD) {
    console.warn(
      `[stream-scroll] anomaly: distanceToBottom=${Math.round(distanceToBottom)} trigger=${trigger} frame=${globalFrameId}`,
    )
    console.table(getOrderedFrames())
  }
}

export function traceLog(trigger: string, msg: string): void {
  if (!isEnabled()) return
  tickFrame()
  console.log(`[stream-scroll] f${globalFrameId} ${trigger}: ${msg}`)
}

export function dumpTrace(): TraceFrame[] {
  return getOrderedFrames()
}

if (typeof window !== 'undefined') {
  ;(window as any).__streamScrollTrace = { dumpTrace, refreshEnabled }
}
