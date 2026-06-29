import * as crypto from 'node:crypto'
import * as path from 'node:path'
import type { JsonObject } from '../json.js'

export type PermissionGrantScope = 'session' | 'workspace'

export interface PermissionGrant {
  id: string
  scope: PermissionGrantScope
  type: string
  pattern: string | string[]
  sessionId?: string
  workspaceRoot?: string
  createdAt: number
  updatedAt: number
  createdFrom: {
    messageId: string
    toolCallId?: string
    title: string
  }
  metadata?: JsonObject
  revokedAt?: number
}

export interface PermissionGrantInput {
  scope: PermissionGrantScope
  type: string
  pattern: string | string[]
  sessionId?: string
  workspaceRoot?: string
  createdFrom: PermissionGrant['createdFrom']
  metadata?: JsonObject
}

export interface PermissionGrantMatchInput {
  type: string
  pattern?: string | string[]
  sessionId?: string
  workspaceRoot?: string
}

export interface PermissionGrantStorage {
  loadWorkspaceGrants(): PermissionGrant[]
  saveWorkspaceGrants(grants: PermissionGrant[]): void
}

const memoryWorkspaceGrants: PermissionGrant[] = []
const sessionGrants = new Map<string, PermissionGrant[]>()
let workspaceGrantsCache: PermissionGrant[] | null = null
let storage: PermissionGrantStorage = {
  loadWorkspaceGrants: () => memoryWorkspaceGrants,
  saveWorkspaceGrants: grants => {
    memoryWorkspaceGrants.splice(0, memoryWorkspaceGrants.length, ...grants)
  },
}

export function configurePermissionGrantStorage(nextStorage: PermissionGrantStorage): void {
  storage = nextStorage
  workspaceGrantsCache = null
}

function normalizeRoot(root?: string): string | undefined {
  return root ? path.resolve(root) : undefined
}

function toPatterns(pattern?: string | string[], type?: string): string[] {
  if (pattern === undefined) return type ? [type] : []
  return Array.isArray(pattern) ? pattern : [pattern]
}

function matchWildcard(text: string, pattern: string): boolean {
  if (pattern === text) return true
  if (pattern.endsWith('*')) return text.startsWith(pattern.slice(0, -1))
  if (text.endsWith('*') && path.isAbsolute(text) && path.isAbsolute(pattern)) {
    const dir = text.slice(0, -1).replace(/[\\/]$/, '')
    return path.dirname(pattern) === dir
  }
  return false
}

function grantMatches(grant: PermissionGrant, input: PermissionGrantMatchInput): boolean {
  if (grant.revokedAt) return false
  if (grant.type !== input.type) return false
  if (grant.scope === 'session' && grant.sessionId !== input.sessionId) return false
  if (grant.scope === 'workspace' && normalizeRoot(grant.workspaceRoot) !== normalizeRoot(input.workspaceRoot)) return false

  const requested = toPatterns(input.pattern, input.type)
  const granted = toPatterns(grant.pattern, grant.type)
  return requested.every(key => granted.some(pattern => matchWildcard(key, pattern)))
}

function loadWorkspaceGrants(): PermissionGrant[] {
  if (workspaceGrantsCache) return workspaceGrantsCache
  workspaceGrantsCache = storage.loadWorkspaceGrants()
  return workspaceGrantsCache
}

function saveWorkspaceGrants(): void {
  storage.saveWorkspaceGrants(workspaceGrantsCache ?? [])
}

export function addGrant(input: PermissionGrantInput): PermissionGrant {
  const now = Date.now()
  const grant: PermissionGrant = {
    id: crypto.randomBytes(8).toString('hex'),
    scope: input.scope,
    type: input.type,
    pattern: input.pattern,
    sessionId: input.scope === 'session' ? input.sessionId : undefined,
    workspaceRoot: input.scope === 'workspace' ? normalizeRoot(input.workspaceRoot) : undefined,
    createdAt: now,
    updatedAt: now,
    createdFrom: input.createdFrom,
    metadata: input.metadata,
  }

  if (grant.scope === 'session') {
    if (!grant.sessionId) throw new Error('sessionId is required for session permission grants')
    const grants = sessionGrants.get(grant.sessionId) ?? []
    grants.push(grant)
    sessionGrants.set(grant.sessionId, grants)
  } else {
    if (!grant.workspaceRoot) throw new Error('workspaceRoot is required for workspace permission grants')
    const grants = loadWorkspaceGrants()
    grants.push(grant)
    workspaceGrantsCache = grants
    saveWorkspaceGrants()
  }

  return grant
}

export function matchGrant(input: PermissionGrantMatchInput): PermissionGrant | undefined {
  if (input.sessionId) {
    const sessionMatch = (sessionGrants.get(input.sessionId) ?? []).find(grant => grantMatches(grant, input))
    if (sessionMatch) return sessionMatch
  }

  if (input.workspaceRoot) {
    return loadWorkspaceGrants().find(grant => grantMatches(grant, input))
  }

  return undefined
}

export function revokeGrant(id: string): boolean {
  const now = Date.now()
  for (const [sessionId, grants] of sessionGrants) {
    const grant = grants.find(item => item.id === id)
    if (grant && !grant.revokedAt) {
      grant.revokedAt = now
      grant.updatedAt = now
      sessionGrants.set(sessionId, grants)
      return true
    }
  }

  const grants = loadWorkspaceGrants()
  const grant = grants.find(item => item.id === id)
  if (grant && !grant.revokedAt) {
    grant.revokedAt = now
    grant.updatedAt = now
    saveWorkspaceGrants()
    return true
  }

  return false
}

export function clearSessionGrants(sessionId: string): void {
  sessionGrants.delete(sessionId)
}

export function listSessionGrants(sessionId: string): PermissionGrant[] {
  return [...(sessionGrants.get(sessionId) ?? [])]
}

export function listWorkspaceGrants(workspaceRoot: string): PermissionGrant[] {
  const root = normalizeRoot(workspaceRoot)
  return loadWorkspaceGrants().filter(grant => normalizeRoot(grant.workspaceRoot) === root)
}

export function clearWorkspaceGrants(workspaceRoot: string): void {
  const root = normalizeRoot(workspaceRoot)
  workspaceGrantsCache = loadWorkspaceGrants().filter(grant => normalizeRoot(grant.workspaceRoot) !== root)
  saveWorkspaceGrants()
}

export function resetPermissionGrantsForTests(): void {
  sessionGrants.clear()
  workspaceGrantsCache = []
}
