/**
 * ProjectsStore — public API for the project-dirs subsystem.
 *
 * Owns the on-disk shape under `~/.onething/project-dirs/` and exposes
 * a small, intention-revealing API:
 *
 *   list()                         → ProjectIndexEntry[]   (lightweight)
 *   get(path)                      → Project | null        (full record)
 *   add(input)                     → Project               (create or refresh)
 *   touch(path, fallbackDescription) → Project              (auto-link from workdir)
 *   update(path, patch)            → Project | null
 *   remove(path)                   → boolean
 *   subscribe(cb)                  → unsubscribe
 *
 * Per-record reads are on-demand. List ops use the in-memory index
 * cache built at boot (and kept in sync as we mutate). No throttled
 * saves: writes are infrequent enough that direct sync I/O is the
 * right call, and the simpler control flow makes future iteration
 * (reflections, activity logs) cheap to add.
 */

import { projectIdFromPath } from './id.js'
import {
  deleteProject,
  loadIndex,
  loadProject,
  saveIndex,
  saveProject,
} from './persistence.js'
import type { Project, ProjectIndex, ProjectIndexEntry } from '../types.js'

class ProjectsStore {
  private index: ProjectIndex = { projects: [] }
  private initialized = false
  private listeners = new Set<() => void>()

  /**
   * Lazy load on first access. Idempotent — `bootstrap` calls into
   * `list()` to warm the cache, and subsequent calls hit the cache
   * directly.
   */
  initialize(): void {
    if (this.initialized) return
    this.initialized = true
    this.index = loadIndex()
  }

  list(): ProjectIndexEntry[] {
    this.initialize()
    // Defensive copy — callers shouldn't mutate the cache.
    return [...this.index.projects]
      .sort((a, b) => b.lastUsedAt - a.lastUsedAt)
      .map((e) => ({ ...e }))
  }

  get(path: string): Project | null {
    this.initialize()
    const entry = this.findIndexEntry(path)
    if (!entry) return null
    return loadProject(entry.id)
  }

  /**
   * Create the project if it doesn't exist, otherwise refresh
   * lastUsedAt and (if `description` provided) override description.
   * Returns the resulting full record.
   */
  add(input: { path: string; description?: string }): Project {
    this.initialize()
    const trimmedPath = input.path.trim()
    if (!trimmedPath) {
      throw new Error('project requires a non-empty path')
    }
    const now = Date.now()
    const id = projectIdFromPath(trimmedPath)
    const existing = loadProject(id)

    let project: Project
    if (existing) {
      project = {
        ...existing,
        path: trimmedPath,
        description: input.description ?? existing.description,
        lastUsedAt: now,
      }
    } else {
      project = {
        id,
        path: trimmedPath,
        description: input.description ?? '',
        addedAt: now,
        lastUsedAt: now,
      }
    }
    saveProject(project)
    this.upsertIndexEntry({ id: project.id, path: project.path, lastUsedAt: project.lastUsedAt })
    this.notify()
    return project
  }

  /**
   * Workdir auto-link hook. If the path is already known, refreshes
   * `lastUsedAt` only; description is preserved (it belongs to the
   * user / explicit edits). If not known, creates with
   * `fallbackDescription`.
   */
  touch(path: string, fallbackDescription = ''): Project {
    this.initialize()
    const id = projectIdFromPath(path.trim())
    const existing = loadProject(id)
    if (existing) {
      // Existing project: bump lastUsedAt, leave description alone.
      return this.add({ path })
    }
    return this.add({ path, description: fallbackDescription })
  }

  update(path: string, patch: { description: string }): Project | null {
    this.initialize()
    const entry = this.findIndexEntry(path)
    if (!entry) return null
    const existing = loadProject(entry.id)
    if (!existing) return null
    const next: Project = { ...existing, description: patch.description }
    saveProject(next)
    // Index unchanged — description doesn't live there.
    this.notify()
    return next
  }

  remove(path: string): boolean {
    this.initialize()
    const entry = this.findIndexEntry(path)
    if (!entry) return false
    deleteProject(entry.id)
    this.index = {
      projects: this.index.projects.filter((p) => p.id !== entry.id),
    }
    saveIndex(this.index)
    this.notify()
    return true
  }

  subscribe(cb: () => void): () => void {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  /** Test helper — drop in-memory state without touching disk. */
  resetForTests(): void {
    this.index = { projects: [] }
    this.initialized = false
    this.listeners.clear()
  }

  // ── internals ──────────────────────────────────────

  private findIndexEntry(path: string): ProjectIndexEntry | undefined {
    const id = projectIdFromPath(path.trim())
    return this.index.projects.find((p) => p.id === id)
  }

  private upsertIndexEntry(entry: ProjectIndexEntry): void {
    const idx = this.index.projects.findIndex((p) => p.id === entry.id)
    if (idx >= 0) {
      this.index = {
        projects: this.index.projects.map((p, i) => (i === idx ? entry : p)),
      }
    } else {
      this.index = { projects: [...this.index.projects, entry] }
    }
    saveIndex(this.index)
  }

  private notify(): void {
    for (const cb of this.listeners) {
      try { cb() } catch (err) {
        console.error('[project-dirs] listener error:', err)
      }
    }
  }
}

let singleton: ProjectsStore | null = null

export function getProjectsStore(): ProjectsStore {
  if (!singleton) singleton = new ProjectsStore()
  return singleton
}

/** Tests only. */
export function resetProjectsStoreForTests(): ProjectsStore {
  singleton = new ProjectsStore()
  return singleton
}
