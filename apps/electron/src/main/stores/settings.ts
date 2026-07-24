import type { AppSettings } from '@shared/ipc.js'
import { createDefaultSettings, mergeWithDefaults } from '@shared/defaults/settings.js'
import { createOnethingSettingsRepository } from '@onething/runtime/settings'
import { getSettingsPath } from './paths.js'

const settingsRepository = createOnethingSettingsRepository<AppSettings>({
  filePath: getSettingsPath,
  defaultValue: createDefaultSettings,
  normalize: value => mergeWithDefaults(value as Partial<AppSettings>),
  logger: console,
})

// ============================================================================
// Async Initialization (Recommended for startup)
// ============================================================================

/**
 * Initialize settings asynchronously at startup
 * This should be called once during app initialization before any getSettings() calls
 *
 * @returns Promise<AppSettings> - The loaded settings
 */
export function initializeSettings(): Promise<AppSettings> {
  return settingsRepository.initialize()
}

/**
 * Check if settings have been initialized
 */
export function isSettingsInitialized(): boolean {
  return settingsRepository.isInitialized()
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
  return settingsRepository.get()
}

// ============================================================================
// Save Operations
// ============================================================================

/**
 * Save settings asynchronously (recommended)
 * Updates both disk and memory cache
 */
export async function saveSettingsAsync(settings: AppSettings): Promise<void> {
  await settingsRepository.saveAsync(settings)
}

/**
 * Save settings synchronously (for backward compatibility)
 * Updates both disk and memory cache
 */
export function saveSettings(settings: AppSettings): void {
  settingsRepository.save(settings)
}

// ============================================================================
// Cache Management
// ============================================================================

/**
 * Invalidate settings cache (for hot reload or external modification)
 * Next getSettings() call will reload from disk
 */
export function invalidateSettingsCache(): void {
  settingsRepository.invalidate()
}

/**
 * Update settings in memory without saving to disk
 * Useful for temporary overrides
 */
export function updateSettingsInMemory(settings: AppSettings): void {
  settingsRepository.updateInMemory(settings)
}
