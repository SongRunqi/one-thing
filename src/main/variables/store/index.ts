/**
 * VariablesStore — owns global *scalar* variable state in
 * `variables.json`. Today that's the two note directories; future
 * scalars are added by extending the schema and exposing get/set
 * accessors here.
 *
 * Per-session variables (workdir, custom session vars) live in the
 * owning session.json — see SessionStoreProvider / WorkdirGateway.
 *
 * Project directories live in their own module — see
 * `src/main/project-dirs/`. The variables subsystem holds no
 * collection-shaped data anymore.
 */

import { loadFromDisk, saveToDisk } from './persistence.js'
import { createDefaultVariablesFile, type VariablesFile } from './schema.js'

class VariablesStore {
  private state: VariablesFile = createDefaultVariablesFile()
  private initialized = false
  private listeners = new Set<() => void>()

  /** Lazy load on first access. Idempotent. */
  initialize(): void {
    if (this.initialized) return
    this.initialized = true
    this.state = loadFromDisk()
  }

  // ── Note directories ────────────────────────────────

  getAiNoteDir(): string {
    this.initialize()
    return this.state.ai_note_dir
  }
  setAiNoteDir(value: string): void {
    this.state = { ...this.state, ai_note_dir: value }
    this.persistAndNotify()
  }

  getUserNoteDir(): string {
    this.initialize()
    return this.state.user_note_dir
  }
  setUserNoteDir(value: string): void {
    this.state = { ...this.state, user_note_dir: value }
    this.persistAndNotify()
  }

  // ── Subscription ────────────────────────────────────

  subscribe(callback: () => void): () => void {
    this.listeners.add(callback)
    return () => this.listeners.delete(callback)
  }

  // ── Test helpers ────────────────────────────────────

  hydrateForTests(state: VariablesFile): void {
    this.state = state
    this.initialized = true
  }

  resetForTests(): void {
    this.state = createDefaultVariablesFile()
    this.initialized = false
    this.listeners.clear()
  }

  // ── internals ───────────────────────────────────────

  private persistAndNotify(): void {
    saveToDisk(this.state)
    for (const cb of this.listeners) {
      try { cb() } catch (err) {
        console.error('[variables.store] listener error:', err)
      }
    }
  }
}

let singleton: VariablesStore | null = null

export function getVariablesStore(): VariablesStore {
  if (!singleton) singleton = new VariablesStore()
  return singleton
}

export function resetVariablesStoreForTests(): VariablesStore {
  singleton = new VariablesStore()
  return singleton
}
