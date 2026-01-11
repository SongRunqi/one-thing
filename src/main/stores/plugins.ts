/**
 * Plugin Configuration Store
 *
 * Persists plugin configurations to the filesystem.
 * Uses JSON file storage similar to other stores in the app.
 */

import * as fs from 'fs'
import * as path from 'path'
import { app } from 'electron'
import type { PluginConfig } from '../plugins/types.js'

const STORE_FILENAME = 'plugins.json'

/**
 * Get the store file path
 */
function getStorePath(): string {
  return path.join(app.getPath('userData'), 'data', STORE_FILENAME)
}

/**
 * Ensure the data directory exists
 */
function ensureDataDir(): void {
  const dataDir = path.dirname(getStorePath())
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true })
  }
}

/**
 * Load plugins data from file
 */
function loadPluginsData(): { plugins: PluginConfig[] } {
  const storePath = getStorePath()

  if (!fs.existsSync(storePath)) {
    return { plugins: [] }
  }

  try {
    const data = fs.readFileSync(storePath, 'utf-8')
    return JSON.parse(data)
  } catch (error) {
    console.error('[PluginStore] Failed to load plugins data:', error)
    return { plugins: [] }
  }
}

/**
 * Save plugins data to file
 */
function savePluginsData(data: { plugins: PluginConfig[] }): void {
  ensureDataDir()
  const storePath = getStorePath()

  try {
    fs.writeFileSync(storePath, JSON.stringify(data, null, 2), 'utf-8')
  } catch (error) {
    console.error('[PluginStore] Failed to save plugins data:', error)
  }
}

/**
 * Get all plugin configurations
 */
export function getPluginConfigs(): PluginConfig[] {
  const data = loadPluginsData()
  return data.plugins
}

/**
 * Get a single plugin configuration by ID
 */
export function getPluginConfig(pluginId: string): PluginConfig | undefined {
  const plugins = getPluginConfigs()
  return plugins.find(p => p.id === pluginId)
}

/**
 * Save a plugin configuration (create or update)
 */
export function savePluginConfig(config: PluginConfig): void {
  const data = loadPluginsData()
  const index = data.plugins.findIndex(p => p.id === config.id)

  if (index >= 0) {
    data.plugins[index] = config
  } else {
    data.plugins.push(config)
  }

  savePluginsData(data)
}

/**
 * Remove a plugin configuration
 */
export function removePluginConfig(pluginId: string): void {
  const data = loadPluginsData()
  data.plugins = data.plugins.filter(p => p.id !== pluginId)
  savePluginsData(data)
}

/**
 * Update plugin enabled status
 */
export function setPluginEnabled(pluginId: string, enabled: boolean): void {
  const config = getPluginConfig(pluginId)
  if (config) {
    config.enabled = enabled
    savePluginConfig(config)
  }
}

/**
 * Update plugin-specific configuration
 */
export function updatePluginSettings(pluginId: string, settings: Record<string, unknown>): void {
  const config = getPluginConfig(pluginId)
  if (config) {
    config.config = { ...config.config, ...settings }
    savePluginConfig(config)
  }
}

/**
 * Get enabled plugins only
 */
export function getEnabledPluginConfigs(): PluginConfig[] {
  return getPluginConfigs().filter(p => p.enabled)
}

/**
 * Plugin store interface for PluginLoader
 */
export const pluginStore = {
  getPluginConfigs,
  getPluginConfig,
  savePluginConfig,
  removePluginConfig,
  setPluginEnabled,
  updatePluginSettings,
  getEnabledPluginConfigs,
}

export default pluginStore
