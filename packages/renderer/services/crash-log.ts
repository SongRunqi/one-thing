/**
 * Renderer crash log: a localStorage-backed ring buffer of every captured
 * error, plus the global hooks that feed it.
 *
 * Why: ErrorBoundary used to display only the *last* captured error, but a
 * Vue unmount crash over a broken subtree is typically a secondary error
 * that masks the primary one (e.g. the 2026-07 "reading 'exposed'" crash).
 * This log keeps the whole sequence in order and survives the crash
 * screen's "Refresh Page" (location.reload), so the root cause is still
 * readable after recovery.
 *
 * Reading it: `window.__onethingCrashLog.dump()` in DevTools, or the COPY
 * LOG button on the crash screen. Every entry is also emitted as a single
 * formatted console line — on desktop the console-capture bridge mirrors
 * that into the app log file, stack and component chain included.
 */
import type { App, ComponentPublicInstance } from 'vue'

export type CrashLogSource =
  | 'error-boundary'
  | 'vue-error-handler'
  | 'vue-warn'
  | 'window-error'
  | 'unhandled-rejection'

export interface CrashLogEntry {
  ts: string
  seq: number
  source: CrashLogSource
  message: string
  stack?: string
  /** Root-most first, e.g. "App > ChatContainer > PanelTree > ChatWindow". */
  componentChain?: string
  /** Vue's error info string (which hook/phase the error came from). */
  info?: string
}

const STORAGE_KEY = 'onething:crash-log:v1'
const MAX_ENTRIES = 40
const MAX_TEXT_LENGTH = 4000

function storageArea(): Storage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

function readEntries(): CrashLogEntry[] {
  const storage = storageArea()
  if (!storage) return []
  try {
    const raw = storage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeEntries(entries: CrashLogEntry[]): void {
  const storage = storageArea()
  if (!storage) return
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(entries))
  } catch {
    // Quota/serialization failure — the console line already went out.
  }
}

function truncate(text: string): string {
  return text.length > MAX_TEXT_LENGTH ? `${text.slice(0, MAX_TEXT_LENGTH)}… [truncated]` : text
}

export function componentChainOf(instance?: ComponentPublicInstance | null): string | undefined {
  if (!instance) return undefined
  const names: string[] = []
  let current: ComponentPublicInstance | null = instance
  while (current && names.length < 40) {
    const options = current.$options as { name?: string; __name?: string } | undefined
    names.push(options?.name || options?.__name || 'Anonymous')
    current = current.$parent
  }
  return names.reverse().join(' > ')
}

function formatEntry(entry: CrashLogEntry): string {
  const lines = [`[crash-log] #${entry.seq} ${entry.source}: ${entry.message}`]
  if (entry.componentChain) lines.push(`  components: ${entry.componentChain}`)
  if (entry.info) lines.push(`  info: ${entry.info}`)
  if (entry.stack) lines.push(entry.stack)
  return lines.join('\n')
}

export interface RecordCrashOptions {
  instance?: ComponentPublicInstance | null
  info?: string
}

export function recordCrash(source: CrashLogSource, err: unknown, options: RecordCrashOptions = {}): CrashLogEntry {
  const asError = err instanceof Error ? err : null
  const entries = readEntries()
  // A warn that fires on every render (e.g. a prop warning) must not flush
  // real errors out of the ring buffer — persist each warn text only once.
  if (source === 'vue-warn') {
    const message = truncate(asError?.message || String(err))
    const existing = entries.find(e => e.source === 'vue-warn' && e.message === message)
    if (existing) {
      try {
        console.warn(formatEntry(existing))
      } catch {
        // Never let logging make a crash worse.
      }
      return existing
    }
  }
  const entry: CrashLogEntry = {
    ts: new Date().toISOString(),
    seq: (entries[entries.length - 1]?.seq ?? 0) + 1,
    source,
    message: truncate(asError?.message || String(err)),
    ...(asError?.stack ? { stack: truncate(asError.stack) } : {}),
    ...(options.instance ? { componentChain: componentChainOf(options.instance) } : {}),
    ...(options.info ? { info: options.info } : {}),
  }
  entries.push(entry)
  writeEntries(entries.slice(-MAX_ENTRIES))

  // One self-contained line per entry so the desktop console-capture bridge
  // (which only sees the formatted message string) persists the full trace.
  try {
    if (source === 'vue-warn') console.warn(formatEntry(entry))
    else console.error(formatEntry(entry))
  } catch {
    // Never let logging make a crash worse.
  }
  return entry
}

export function getCrashLogEntries(): CrashLogEntry[] {
  return readEntries()
}

export function dumpCrashLog(): string {
  const entries = readEntries()
  if (entries.length === 0) return '[crash-log] empty'
  return entries.map(entry => `${entry.ts}\n${formatEntry(entry)}`).join('\n\n')
}

export function clearCrashLog(): void {
  const storage = storageArea()
  try {
    storage?.removeItem(STORAGE_KEY)
  } catch {
    // Ignore — nothing actionable.
  }
}

/**
 * Wire the global capture points. Errors inside Vue render/lifecycle that no
 * ErrorBoundary swallows land in `app.config.errorHandler`; errors in plain
 * async callbacks (IPC/event handlers awaiting store calls) never enter Vue
 * at all and only surface as unhandled rejections — that channel is exactly
 * where a "primary" error tends to hide when the crash screen shows only a
 * secondary unmount TypeError.
 */
export function installGlobalCrashCapture(app: App): void {
  app.config.errorHandler = (err, instance, info) => {
    recordCrash('vue-error-handler', err, { instance, info })
  }
  app.config.warnHandler = (msg, instance, trace) => {
    // warnHandler replaces Vue's own console output, so re-emit via the
    // crash log's single-line format (console.warn inside recordCrash).
    recordCrash('vue-warn', msg, {
      instance,
      ...(trace ? { info: trace.trim() } : {}),
    })
  }

  if (typeof window === 'undefined') return

  window.addEventListener('error', (event) => {
    // Benign, loops forever in some layouts — not worth ring-buffer space.
    if (typeof event.message === 'string' && event.message.includes('ResizeObserver loop')) return
    recordCrash('window-error', event.error ?? event.message, {
      info: event.filename ? `${event.filename}:${event.lineno}:${event.colno}` : undefined,
    })
  })
  window.addEventListener('unhandledrejection', (event) => {
    recordCrash('unhandled-rejection', event.reason)
  })

  const globalHandle = {
    entries: getCrashLogEntries,
    dump: dumpCrashLog,
    clear: clearCrashLog,
  }
  ;(window as Window & { __onethingCrashLog?: typeof globalHandle }).__onethingCrashLog = globalHandle

  const prior = readEntries()
  if (prior.length > 0) {
    console.info(
      `[crash-log] ${prior.length} entr${prior.length === 1 ? 'y' : 'ies'} from previous runs — window.__onethingCrashLog.dump() to read, .clear() to reset`,
    )
  }
}
