import * as fsSync from 'node:fs'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import type { OnethingTodoPlanStore, TodoPlanChangedPayload } from './store.js'

export interface OnethingTodoPlanWatcherOptions {
  store: OnethingTodoPlanStore
  notifyChanged: (payload: TodoPlanChangedPayload) => void
  onError?: (error: unknown) => void
}

// Coalesce the burst of events a single save produces (editors commonly write,
// truncate and rename), and give the file a moment to settle before we read it.
const DEBOUNCE_MS = 120

/**
 * Watches the todo store on disk and broadcasts what changed.
 *
 * The AI edits its todo with the ordinary write/edit tools, which know nothing
 * about the todo store, so nothing would tell the UI to refresh without this.
 * It also means a todo edited by hand, in the user's own editor, updates the
 * panel the same way the AI's edits do.
 */
export class OnethingTodoPlanWatcher {
  private watcher: fsSync.FSWatcher | null = null
  private pending: ReturnType<typeof setTimeout> | null = null
  private readonly changedPaths = new Set<string>()
  private watchedDirectory = ''

  constructor(private readonly options: OnethingTodoPlanWatcherOptions) {}

  async start(): Promise<void> {
    const directory = this.options.store.getDirectory()
    if (this.watcher && this.watchedDirectory === directory) return
    this.stop()

    try {
      await fs.mkdir(directory, { recursive: true })
      this.watcher = fsSync.watch(directory, { recursive: true, persistent: false }, (_event, filename) => {
        if (!filename) return
        this.changedPaths.add(path.resolve(directory, filename.toString()))
        this.schedule()
      })
      this.watchedDirectory = directory
      this.watcher.on('error', error => this.options.onError?.(error))
    } catch (error) {
      this.options.onError?.(error)
    }
  }

  stop(): void {
    if (this.pending) {
      clearTimeout(this.pending)
      this.pending = null
    }
    this.watcher?.close()
    this.watcher = null
    this.watchedDirectory = ''
    this.changedPaths.clear()
  }

  private schedule(): void {
    if (this.pending) clearTimeout(this.pending)
    this.pending = setTimeout(() => {
      this.pending = null
      const paths = [...this.changedPaths]
      this.changedPaths.clear()
      for (const payload of this.classify(paths)) this.options.notifyChanged(payload)
    }, DEBOUNCE_MS)
  }

  private classify(paths: string[]): TodoPlanChangedPayload[] {
    const directory = this.watchedDirectory
    const payloads: TodoPlanChangedPayload[] = []
    const seenSessions = new Set<string>()
    let sawUserNote = false

    for (const changed of paths) {
      // A write we made ourselves already went out through notifyChanged.
      if (this.options.store.wasSelfWrite(changed)) continue

      const relative = path.relative(directory, changed)
      if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) continue
      const segments = relative.split(path.sep)

      if (segments[0] === 'user-notes' && segments.length === 2 && segments[1].toLowerCase().endsWith('.md')) {
        sawUserNote = true
        continue
      }

      // sessions/<sessionId>/ai-todo.md — the session id is the directory name.
      if (segments[0] === 'sessions' && segments.length === 3 && segments[2] === 'ai-todo.md') {
        const sessionId = segments[1]
        if (sessionId && !seenSessions.has(sessionId)) {
          seenSessions.add(sessionId)
          payloads.push({ scope: 'session-ai-todo', sessionId })
        }
      }
    }

    // User notes are global, so one refresh covers every panel.
    if (sawUserNote) payloads.push({ scope: 'global-user' })
    return payloads
  }
}
