/**
 * Working Directory Permission Storage
 *
 * Handles persistent storage of working-directory-level permissions.
 * Permissions are stored per working directory, allowing permanent
 * approval of patterns within a specific working directory.
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
 * Working directory permissions data structure
 */
interface WorkingDirectoryPermissionsData {
  workingDirectory: string
  permissions: StoredPermission[]
  updatedAt: number
}

// In-memory cache of working directory permissions
const cache = new Map<string, Map<string, boolean>>()

/**
 * Get a stable hash for a working directory path
 */
function getWorkingDirectoryHash(workingDirectory: string): string {
  // Normalize path and create hash
  const normalized = path.normalize(workingDirectory).toLowerCase()
  return crypto.createHash('md5').update(normalized).digest('hex').substring(0, 12)
}

/**
 * Get the storage path for a working directory's permissions
 */
function getStoragePath(workingDirectory: string): string {
  const hash = getWorkingDirectoryHash(workingDirectory)
  return path.join(getPermissionsDir(), `workdir-${hash}.json`)
}

function getLegacyStoragePath(workingDirectory: string): string {
  const hash = getWorkingDirectoryHash(workingDirectory)
  return path.join(getPermissionsDir(), `workspace-${hash}.json`)
}

/**
 * Load permissions for a working directory from disk
 */
function loadWorkingDirectoryPermissions(workingDirectory: string): Map<string, boolean> {
  const cached = cache.get(workingDirectory)
  if (cached) return cached

  const storagePath = getStoragePath(workingDirectory)
  const legacyStoragePath = getLegacyStoragePath(workingDirectory)
  const data = readJsonFile<WorkingDirectoryPermissionsData | null>(
    storagePath,
    readJsonFile<WorkingDirectoryPermissionsData | null>(legacyStoragePath, null),
  )

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
 * Save permissions for a working directory to disk
 */
function saveWorkingDirectoryPermissions(workingDirectory: string, permissions: Map<string, boolean>): void {
  ensureDir(getPermissionsDir())

  const storedPermissions: StoredPermission[] = []
  for (const [pattern] of permissions) {
    storedPermissions.push({
      pattern,
      type: 'approved',
      approvedAt: Date.now(),
    })
  }

  const data: WorkingDirectoryPermissionsData = {
    workingDirectory,
    permissions: storedPermissions,
    updatedAt: Date.now(),
  }

  const storagePath = getStoragePath(workingDirectory)
  writeJsonFile(storagePath, data)
}

/**
 * Check if a pattern is approved for a working directory
 */
export function isApprovedInWorkingDirectory(workingDirectory: string, pattern: string): boolean {
  if (!workingDirectory) return false

  const permissions = loadWorkingDirectoryPermissions(workingDirectory)

  // Direct match
  if (permissions.has(pattern)) return true

  // Wildcard matching
  for (const [approvedPattern] of permissions) {
    if (matchWildcard(pattern, approvedPattern)) return true
  }

  return false
}

/**
 * Check if all patterns are approved for a working directory
 */
export function areAllApprovedInWorkingDirectory(workingDirectory: string, patterns: string[]): boolean {
  if (!workingDirectory) return false

  const permissions = loadWorkingDirectoryPermissions(workingDirectory)

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
 * Approve a pattern in a working directory
 */
export function approveInWorkingDirectory(workingDirectory: string, pattern: string | string[]): void {
  if (!workingDirectory) {
    console.warn('[DirectoryPermissions] Cannot approve without workingDirectory')
    return
  }

  const permissions = loadWorkingDirectoryPermissions(workingDirectory)
  const patterns = Array.isArray(pattern) ? pattern : [pattern]

  for (const p of patterns) {
    permissions.set(p, true)
  }

  cache.set(workingDirectory, permissions)
  saveWorkingDirectoryPermissions(workingDirectory, permissions)

  console.log('[DirectoryPermissions] Approved patterns in working directory:', patterns, workingDirectory)
}

/**
 * Remove a pattern approval from a working directory
 */
export function revokeInWorkingDirectory(workingDirectory: string, pattern: string): void {
  if (!workingDirectory) return

  const permissions = loadWorkingDirectoryPermissions(workingDirectory)
  permissions.delete(pattern)

  cache.set(workingDirectory, permissions)
  saveWorkingDirectoryPermissions(workingDirectory, permissions)

  console.log('[DirectoryPermissions] Revoked pattern in working directory:', pattern, workingDirectory)
}

/**
 * Get all approved patterns for a working directory
 */
export function getApprovedPatterns(workingDirectory: string): string[] {
  if (!workingDirectory) return []

  const permissions = loadWorkingDirectoryPermissions(workingDirectory)
  return Array.from(permissions.keys())
}

/**
 * Clear all permissions for a working directory
 */
export function clearWorkingDirectoryPermissions(workingDirectory: string): void {
  if (!workingDirectory) return

  cache.delete(workingDirectory)

  const storagePath = getStoragePath(workingDirectory)
  // Write empty permissions
  const data: WorkingDirectoryPermissionsData = {
    workingDirectory,
    permissions: [],
    updatedAt: Date.now(),
  }
  writeJsonFile(storagePath, data)

  console.log('[DirectoryPermissions] Cleared all permissions for working directory:', workingDirectory)
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
