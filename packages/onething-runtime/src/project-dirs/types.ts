export type ProjectId = string

export interface ProjectIndexEntry {
  id: string
  path: string
  lastUsedAt: number
}

export interface ProjectIndex {
  projects: ProjectIndexEntry[]
}

export interface Project {
  id: string
  path: string
  description: string
  addedAt: number
  lastUsedAt: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isValidIndexEntry(value: unknown): value is ProjectIndexEntry {
  return isRecord(value)
    && typeof value.id === 'string'
    && value.id.length > 0
    && typeof value.path === 'string'
    && value.path.length > 0
    && typeof value.lastUsedAt === 'number'
}

export function parseProjectIndex(value: unknown): ProjectIndex | null {
  if (!isRecord(value) || !Array.isArray(value.projects)) return null
  const projects = value.projects.filter(isValidIndexEntry)
  return projects.length === value.projects.length ? { projects } : null
}

export function parseProject(value: unknown): Project | null {
  if (!isRecord(value)) return null
  if (typeof value.id !== 'string' || !value.id) return null
  if (typeof value.path !== 'string' || !value.path) return null
  if (typeof value.description !== 'string') return null
  if (typeof value.addedAt !== 'number') return null
  if (typeof value.lastUsedAt !== 'number') return null
  return {
    id: value.id,
    path: value.path,
    description: value.description,
    addedAt: value.addedAt,
    lastUsedAt: value.lastUsedAt,
  }
}
