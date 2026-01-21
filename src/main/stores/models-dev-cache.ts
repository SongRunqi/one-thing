/**
 * Models.dev Cache Persistence
 *
 * Persists model registry data to disk to avoid network requests on every startup.
 * Cache is loaded on app start and only refreshed when:
 * 1. User manually triggers refresh in settings
 * 2. Cache file doesn't exist
 *
 * This significantly improves startup performance by eliminating the 2+ second
 * network request to models.dev API on every app launch.
 */

import { readJsonFile, writeJsonFile, getStorePath } from './paths.js'
import path from 'path'

// Cache version - increment when cache format changes
const CACHE_VERSION = 1

// Default cache TTL: 7 days (in milliseconds)
// Cache can be used beyond this, but will be marked as stale
const DEFAULT_CACHE_TTL = 7 * 24 * 60 * 60 * 1000

interface ModelsDevCacheData {
  version: number
  lastFetched: number
  // Raw Models.dev API response (for capability lookups)
  modelsDevData: Record<string, unknown> | null
  // Processed models by provider
  modelsByProvider: Record<string, unknown[]>
  // All models flattened
  allModels: unknown[]
}

function getCachePath(): string {
  return path.join(getStorePath(), 'models-dev-cache.json')
}

/**
 * Load models cache from disk
 * Returns null if cache doesn't exist or is incompatible version
 */
export function loadModelsDevCache(): ModelsDevCacheData | null {
  const cachePath = getCachePath()
  const data = readJsonFile<ModelsDevCacheData | null>(cachePath, null)

  // Check version compatibility
  if (!data || data.version !== CACHE_VERSION) {
    console.log('[ModelsDevCache] No valid cache found or version mismatch')
    return null
  }

  console.log(`[ModelsDevCache] Loaded cache with ${data.allModels.length} models (fetched: ${new Date(data.lastFetched).toLocaleDateString()})`)
  return data
}

/**
 * Save models cache to disk
 */
export function saveModelsDevCache(
  modelsDevData: Record<string, unknown> | null,
  modelsByProvider: Record<string, unknown[]>,
  allModels: unknown[]
): void {
  const cachePath = getCachePath()
  const data: ModelsDevCacheData = {
    version: CACHE_VERSION,
    lastFetched: Date.now(),
    modelsDevData,
    modelsByProvider,
    allModels,
  }

  writeJsonFile(cachePath, data)
  console.log(`[ModelsDevCache] Saved cache with ${allModels.length} models`)
}

/**
 * Check if cache is stale (older than TTL)
 * Note: Stale cache can still be used, this is just informational
 */
export function isCacheStale(data: ModelsDevCacheData | null, ttlMs: number = DEFAULT_CACHE_TTL): boolean {
  if (!data || !data.lastFetched) return true
  return Date.now() - data.lastFetched > ttlMs
}

/**
 * Check if cache exists and is usable (regardless of staleness)
 */
export function hasCacheData(data: ModelsDevCacheData | null): boolean {
  return !!(data && data.allModels && data.allModels.length > 0)
}

/**
 * Get cache age in human-readable format
 */
export function getCacheAge(data: ModelsDevCacheData | null): string {
  if (!data || !data.lastFetched) return 'never'

  const ageMs = Date.now() - data.lastFetched
  const hours = Math.floor(ageMs / (60 * 60 * 1000))
  const days = Math.floor(hours / 24)

  if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`
  if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`
  return 'just now'
}
