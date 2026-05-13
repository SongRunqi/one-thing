import type { AppSettings } from '../../shared/ipc.js'
import { getSettingsPath, readJsonFile, writeJsonFile } from './paths.js'
import { createDefaultSettings, mergeWithDefaults } from '../../shared/defaults/settings.js'
import * as fs from 'fs'

// ============================================================================
// Settings Singleton State
// ============================================================================

// Single instance - initialized once at startup
let settingsInstance: AppSettings | null = null
let initPromise: Promise<AppSettings> | null = null

// ============================================================================
// Async Initialization (Recommended for startup)
// ============================================================================

/**
 * Initialize settings asynchronously at startup
 * This should be called once during app initialization before any getSettings() calls
 *
 * @returns Promise<AppSettings> - The loaded settings
 */
export async function initializeSettings(): Promise<AppSettings> {
  // Return existing instance if already initialized
  if (settingsInstance !== null) {
    console.log('[Settings] Already initialized, returning cached instance')
    return settingsInstance
  }

  // Return pending promise if initialization is in progress
  if (initPromise !== null) {
    console.log('[Settings] Initialization in progress, waiting...')
    return initPromise
  }

  console.log('[Settings] Starting async initialization...')

  // Create initialization promise
  initPromise = (async () => {
    const settingsPath = getSettingsPath()

    try {
      // Use async file read
      const data = await fs.promises.readFile(settingsPath, 'utf-8')
      const parsed = JSON.parse(data)
      settingsInstance = mergeWithDefaults(parsed)
      console.log('[Settings] Loaded from disk successfully')
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        // File doesn't exist - use defaults
        console.log('[Settings] No settings file found, using defaults')
        settingsInstance = createDefaultSettings()
        await saveSettingsAsync(settingsInstance)
      } else {
        // Parse error or other - use defaults but log the error
        console.error('[Settings] Error loading settings, using defaults:', error.message)
        settingsInstance = createDefaultSettings()
        await saveSettingsAsync(settingsInstance)
      }
    }

    return settingsInstance
  })()

  return initPromise
}

/**
 * Check if settings have been initialized
 */
export function isSettingsInitialized(): boolean {
  return settingsInstance !== null
}

// ============================================================================
// Sync Getters (Hot path - after initialization)
// ============================================================================

/**
 * Get settings synchronously (for hot path after initialization)
 * Falls back to sync read if not yet initialized (backward compatibility)
 *
 * @returns AppSettings
 */
export function getSettings(): AppSettings {
  // Return cached instance if available
  if (settingsInstance !== null) {
    return settingsInstance
  }

  // Fallback: sync read for backward compatibility
  // This should rarely happen if initializeSettings() is called at startup
  console.warn('[Settings] getSettings() called before initialization, using sync fallback')
  const defaults = createDefaultSettings()
  const settings = readJsonFile(getSettingsPath(), defaults)
  settingsInstance = mergeWithDefaults(settings)
  return settingsInstance
}

// ============================================================================
// Save Operations
// ============================================================================

/**
 * Save settings asynchronously (recommended)
 * Updates both disk and memory cache
 */
export async function saveSettingsAsync(settings: AppSettings): Promise<void> {
  const settingsPath = getSettingsPath()
  const normalized = mergeWithDefaults(settings)
  await fs.promises.writeFile(settingsPath, JSON.stringify(normalized, null, 2), 'utf-8')
  settingsInstance = normalized
  console.log('[Settings] Saved to disk asynchronously')
}

/**
 * Save settings synchronously (for backward compatibility)
 * Updates both disk and memory cache
 */
export function saveSettings(settings: AppSettings): void {
  const normalized = mergeWithDefaults(settings)
  writeJsonFile(getSettingsPath(), normalized)
  settingsInstance = normalized
}

// ============================================================================
// Cache Management
// ============================================================================

/**
 * Invalidate settings cache (for hot reload or external modification)
 * Next getSettings() call will reload from disk
 */
export function invalidateSettingsCache(): void {
  settingsInstance = null
  initPromise = null
  console.log('[Settings] Cache invalidated')
}

/**
 * Update settings in memory without saving to disk
 * Useful for temporary overrides
 */
export function updateSettingsInMemory(settings: AppSettings): void {
  settingsInstance = settings
}

