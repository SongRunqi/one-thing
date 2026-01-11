/**
 * Plugin IPC Types
 *
 * Type definitions for plugin-related IPC communication
 * between main and renderer processes.
 */

/**
 * Plugin source types
 */
export type PluginSource = 'npm' | 'local' | 'builtin'

/**
 * Plugin status
 */
export type PluginStatus = 'loaded' | 'error' | 'disabled'

/**
 * Plugin info for UI display
 */
export interface PluginInfo {
  /** Plugin ID */
  id: string
  /** Display name */
  name: string
  /** Version */
  version: string
  /** Description */
  description?: string
  /** Author */
  author?: string
  /** Repository URL */
  repository?: string
  /** Source type */
  source: PluginSource
  /** Whether enabled */
  enabled: boolean
  /** Current status */
  status: PluginStatus
  /** Error message if status is 'error' */
  error?: string
  /** Installation timestamp */
  installedAt?: number
  /** Load timestamp */
  loadedAt?: number
  /** Registered hooks */
  hooks?: string[]
  /** Plugin-specific configuration */
  config?: Record<string, unknown>
}

// ============================================
// Request/Response Types
// ============================================

/**
 * Get all plugins response
 */
export interface GetPluginsResponse {
  success: boolean
  plugins?: PluginInfo[]
  error?: string
}

/**
 * Get single plugin response
 */
export interface GetPluginResponse {
  success: boolean
  plugin?: PluginInfo
  error?: string
}

/**
 * Install plugin request
 */
export interface InstallPluginRequest {
  /** Source type */
  source: 'npm' | 'local'
  /** NPM package name (for npm source) */
  packageName?: string
  /** Local path (for local source) */
  localPath?: string
}

/**
 * Install plugin response
 */
export interface InstallPluginResponse {
  success: boolean
  plugin?: {
    id: string
    name: string
    version: string
  }
  error?: string
}

/**
 * Uninstall plugin response
 */
export interface UninstallPluginResponse {
  success: boolean
  error?: string
}

/**
 * Enable/disable plugin response
 */
export interface TogglePluginResponse {
  success: boolean
  error?: string
}

/**
 * Reload plugin response
 */
export interface ReloadPluginResponse {
  success: boolean
  error?: string
}

/**
 * Update plugin config request
 */
export interface UpdatePluginConfigRequest {
  pluginId: string
  config: Record<string, unknown>
}

/**
 * Update plugin config response
 */
export interface UpdatePluginConfigResponse {
  success: boolean
  error?: string
}

/**
 * Plugin directories info
 */
export interface PluginDirectoriesInfo {
  /** Main plugins directory */
  pluginsPath: string
  /** NPM cache path */
  npmCachePath: string
  /** Local plugins path */
  localPluginsPath: string
}

// ============================================
// IPC Channel Definitions
// ============================================

/**
 * Plugin IPC channels
 */
export const PLUGIN_CHANNELS = {
  GET_ALL: 'plugins:get-all',
  GET: 'plugins:get',
  INSTALL: 'plugins:install',
  UNINSTALL: 'plugins:uninstall',
  ENABLE: 'plugins:enable',
  DISABLE: 'plugins:disable',
  RELOAD: 'plugins:reload',
  UPDATE_CONFIG: 'plugins:update-config',
  GET_DIRECTORIES: 'plugins:get-directories',
  OPEN_DIRECTORY: 'plugins:open-directory',
} as const

export type PluginChannel = typeof PLUGIN_CHANNELS[keyof typeof PLUGIN_CHANNELS]
