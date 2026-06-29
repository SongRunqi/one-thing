import { projectIdFromPath } from './id.js'
import {
  deleteProject,
  loadIndex,
  loadProject,
  saveIndex,
  saveProject,
} from './persistence.js'
import type { Project, ProjectIndex, ProjectIndexEntry } from './types.js'

export class ProjectsStore {
  private index: ProjectIndex = { projects: [] }
  private initialized = false
  private listeners = new Set<() => void>()

  initialize(): void {
    if (this.initialized) return
    this.initialized = true
    this.index = loadIndex()
  }

  list(): ProjectIndexEntry[] {
    this.initialize()
    return [...this.index.projects]
      .sort((a, b) => b.lastUsedAt - a.lastUsedAt)
      .map(e => ({ ...e }))
  }

  get(path: string): Project | null {
    this.initialize()
    const entry = this.findIndexEntry(path)
    if (!entry) return null
    return loadProject(entry.id)
  }

  add(input: { path: string; description?: string }): Project {
    this.initialize()
    const trimmedPath = input.path.trim()
    if (!trimmedPath) {
      throw new Error('project requires a non-empty path')
    }
    const now = Date.now()
    const id = projectIdFromPath(trimmedPath)
    const existing = loadProject(id)

    const project: Project = existing
      ? {
        ...existing,
        path: trimmedPath,
        description: input.description ?? existing.description,
        lastUsedAt: now,
      }
      : {
        id,
        path: trimmedPath,
        description: input.description ?? '',
        addedAt: now,
        lastUsedAt: now,
      }

    saveProject(project)
    this.upsertIndexEntry({ id: project.id, path: project.path, lastUsedAt: project.lastUsedAt })
    this.notify()
    return project
  }

  touch(path: string, fallbackDescription = ''): Project {
    this.initialize()
    const id = projectIdFromPath(path.trim())
    const existing = loadProject(id)
    if (existing) {
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
    this.notify()
    return next
  }

  remove(path: string): boolean {
    this.initialize()
    const entry = this.findIndexEntry(path)
    if (!entry) return false
    deleteProject(entry.id)
    this.index = {
      projects: this.index.projects.filter(p => p.id !== entry.id),
    }
    saveIndex(this.index)
    this.notify()
    return true
  }

  subscribe(cb: () => void): () => void {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  resetForTests(): void {
    this.index = { projects: [] }
    this.initialized = false
    this.listeners.clear()
  }

  private findIndexEntry(path: string): ProjectIndexEntry | undefined {
    const id = projectIdFromPath(path.trim())
    return this.index.projects.find(p => p.id === id)
  }

  private upsertIndexEntry(entry: ProjectIndexEntry): void {
    const idx = this.index.projects.findIndex(p => p.id === entry.id)
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
      try {
        cb()
      } catch (err) {
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

export function resetProjectsStoreForTests(): ProjectsStore {
  singleton = new ProjectsStore()
  return singleton
}
