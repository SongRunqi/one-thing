/**
 * Workspace Permission Storage
 *
 * Handles persistent storage of workspace-level permissions.
 * Permissions are stored per working directory, allowing permanent
 * approval of patterns within a specific workspace.
 */

import path from 'path'
import crypto from 'crypto'
import { getPermissionsDir, readJsonFile, writeJsonFile, ensureDir } from '../stores/paths.js'

/**
 * Stored permission entry
 */
interface StoredPermission {
  pattern: string
  type: string
  approvedAt: number
  /** Original title for reference */
  title?: string
}

/**
 * Workspace permissions data structure
 */
interface WorkspacePermissionsData {
  workingDirectory: string
  permissions: StoredPermission[]
  updatedAt: number
}

// In-memory cache of workspace permissions
const cache = new Map<string, Map<string, boolean>>()

/**
 * Get a stable hash for a working directory path
 */
function getWorkspaceHash(workingDirectory: string): string {
  // Normalize path and create hash
  const normalized = path.normalize(workingDirectory).toLowerCase()
  return crypto.createHash('md5').update(normalized).digest('hex').substring(0, 12)
}

/**
 * Get the storage path for a workspace's permissions
 */
function getStoragePath(workingDirectory: string): string {
  const hash = getWorkspaceHash(workingDirectory)
  return path.join(getPermissionsDir(), `workspace-${hash}.json`)
}

/**
 * Load permissions for a workspace from disk
 */
function loadWorkspacePermissions(workingDirectory: string): Map<string, boolean> {
  const cached = cache.get(workingDirectory)
  if (cached) return cached

  const storagePath = getStoragePath(workingDirectory)
  const data = readJsonFile<WorkspacePermissionsData | null>(storagePath, null)

  const permissions = new Map<string, boolean>()
  if (data?.permissions) {
    for (const perm of data.permissions) {
      permissions.set(perm.pattern, true)
    }
  }

  cache.set(workingDirectory, permissions)
  return permissions
}

/**
 * Save permissions for a workspace to disk
 */
function saveWorkspacePermissions(workingDirectory: string, permissions: Map<string, boolean>): void {
  ensureDir(getPermissionsDir())

  const storedPermissions: StoredPermission[] = []
  for (const [pattern] of permissions) {
    storedPermissions.push({
      pattern,
      type: 'approved',
      approvedAt: Date.now(),
    })
  }

  const data: WorkspacePermissionsData = {
    workingDirectory,
    permissions: storedPermissions,
    updatedAt: Date.now(),
  }

  const storagePath = getStoragePath(workingDirectory)
  writeJsonFile(storagePath, data)
}

/**
 * Check if a pattern is approved for a workspace
 */
export function isApprovedInWorkspace(workingDirectory: string, pattern: string): boolean {
  if (!workingDirectory) return false

  const permissions = loadWorkspacePermissions(workingDirectory)

  // Direct match
  if (permissions.has(pattern)) return true

  // Wildcard matching
  for (const [approvedPattern] of permissions) {
    if (matchWildcard(pattern, approvedPattern)) return true
  }

  return false
}

/**
 * Check if all patterns are approved for a workspace
 */
export function areAllApprovedInWorkspace(workingDirectory: string, patterns: string[]): boolean {
  if (!workingDirectory) return false

  const permissions = loadWorkspacePermissions(workingDirectory)

  return patterns.every(pattern => {
    // Direct match
    if (permissions.has(pattern)) return true

    // Wildcard matching
    for (const [approvedPattern] of permissions) {
      if (matchWildcard(pattern, approvedPattern)) return true
    }

    return false
  })
}

/**
 * Approve a pattern in a workspace
 */
export function approveInWorkspace(workingDirectory: string, pattern: string | string[]): void {
  if (!workingDirectory) {
    console.warn('[WorkspacePermissions] Cannot approve without workingDirectory')
    return
  }

  const permissions = loadWorkspacePermissions(workingDirectory)
  const patterns = Array.isArray(pattern) ? pattern : [pattern]

  for (const p of patterns) {
    permissions.set(p, true)
  }

  cache.set(workingDirectory, permissions)
  saveWorkspacePermissions(workingDirectory, permissions)

  console.log('[WorkspacePermissions] Approved patterns in workspace:', patterns, workingDirectory)
}

/**
 * Remove a pattern approval from a workspace
 */
export function revokeInWorkspace(workingDirectory: string, pattern: string): void {
  if (!workingDirectory) return

  const permissions = loadWorkspacePermissions(workingDirectory)
  permissions.delete(pattern)

  cache.set(workingDirectory, permissions)
  saveWorkspacePermissions(workingDirectory, permissions)

  console.log('[WorkspacePermissions] Revoked pattern in workspace:', pattern, workingDirectory)
}

/**
 * Get all approved patterns for a workspace
 */
export function getApprovedPatterns(workingDirectory: string): string[] {
  if (!workingDirectory) return []

  const permissions = loadWorkspacePermissions(workingDirectory)
  return Array.from(permissions.keys())
}

/**
 * Clear all permissions for a workspace
 */
export function clearWorkspacePermissions(workingDirectory: string): void {
  if (!workingDirectory) return

  cache.delete(workingDirectory)

  const storagePath = getStoragePath(workingDirectory)
  // Write empty permissions
  const data: WorkspacePermissionsData = {
    workingDirectory,
    permissions: [],
    updatedAt: Date.now(),
  }
  writeJsonFile(storagePath, data)

  console.log('[WorkspacePermissions] Cleared all permissions for workspace:', workingDirectory)
}

/**
 * Clear the in-memory cache (useful for testing)
 */
export function clearCache(): void {
  cache.clear()
}

/**
 * Simple wildcard matching (supports * at end)
 */
function matchWildcard(text: string, pattern: string): boolean {
  if (pattern === text) return true
  if (pattern.endsWith('*')) {
    const prefix = pattern.slice(0, -1)
    return text.startsWith(prefix)
  }
  return false
}
