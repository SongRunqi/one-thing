/**
 * Plugin Loader — scans and loads plugins from disk.
 *
 * User plugins live under ~/.onething/plugins/{plugin-id}/.
 * Built-in plugins are statically bundled with the app.
 * Each plugin has a package.json with its own dependencies.
 * On install/first-load, `npm install` is run inside the plugin directory.
 */

import * as fs from 'fs'
import * as path from 'path'
import { execSync } from 'child_process'
import type { PluginDefinition, PluginManifest, PluginEntry } from './types.js'
import logMonitorPlugin, { logMonitorManifest } from './builtin/log-monitor.js'
import noteSkillsPlugin, { noteSkillsManifest } from './builtin/note-skills.js'
import soulMemoryPlugin, { soulMemoryManifest } from './builtin/soul-memory.js'

const DEFAULT_ENTRY = 'plugin-entry.js'

function getPluginsDir(): string {
  const home = process.env.HOME || '~'
  return path.join(home, '.onething', 'plugins')
}

function getPluginSettingsPath(): string {
  const home = process.env.HOME || '~'
  return path.join(home, '.onething', 'plugin-settings.json')
}

interface PluginSettings {
  enabled?: Record<string, boolean>
}

function readPluginSettings(): PluginSettings {
  const settingsPath = getPluginSettingsPath()
  if (!fs.existsSync(settingsPath)) return {}

  try {
    return JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) as PluginSettings
  } catch (err) {
    console.error('[PluginLoader] Failed to read plugin settings:', err)
    return {}
  }
}

function writePluginSettings(settings: PluginSettings): void {
  const settingsPath = getPluginSettingsPath()
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true })
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8')
}

export function getPluginEnabled(pluginId: string, fallback = true): boolean {
  const settings = readPluginSettings()
  return settings.enabled?.[pluginId] ?? fallback
}

export function setPluginEnabled(pluginId: string, enabled: boolean): void {
  const settings = readPluginSettings()
  settings.enabled = settings.enabled || {}
  settings.enabled[pluginId] = enabled
  writePluginSettings(settings)
}

function getBuiltinPlugins(): PluginDefinition[] {
  return [
    {
      id: 'log-monitor',
      source: 'builtin',
      manifest: logMonitorManifest,
      dirPath: 'builtin://log-monitor',
      entryPath: 'builtin://log-monitor/plugin-entry',
      entry: logMonitorPlugin,
      enabled: getPluginEnabled('log-monitor'),
      needsInstall: false,
    },
    {
      id: 'note-skills',
      source: 'builtin',
      manifest: noteSkillsManifest,
      dirPath: 'builtin://note-skills',
      entryPath: 'builtin://note-skills/plugin-entry',
      entry: noteSkillsPlugin,
      enabled: getPluginEnabled('note-skills'),
      needsInstall: false,
    },
    {
      id: 'soul-memory',
      source: 'builtin',
      manifest: soulMemoryManifest,
      dirPath: 'builtin://soul-memory',
      entryPath: 'builtin://soul-memory/plugin-entry',
      entry: soulMemoryPlugin,
      enabled: getPluginEnabled('soul-memory'),
      needsInstall: false,
    },
  ]
}

/** Scan built-in and user plugin directories and return plugin definitions. */
export function scanPlugins(): PluginDefinition[] {
  const plugins = getBuiltinPlugins()
  const seen = new Set(plugins.map((plugin) => plugin.id))
  const pluginsDir = getPluginsDir()
  if (!fs.existsSync(pluginsDir)) {
    return plugins
  }

  const entries = fs.readdirSync(pluginsDir, { withFileTypes: true })

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    // Skip hidden dirs and the shared node_modules (shouldn't exist but be safe)
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue
    if (seen.has(entry.name)) {
      console.warn(`[PluginLoader] Skipping user plugin "${entry.name}" because a built-in plugin with the same id exists`)
      continue
    }
    const dirPath = path.join(pluginsDir, entry.name)
    const def = parsePlugin(entry.name, dirPath)
    if (def) {
      def.source = 'user'
      plugins.push(def)
      seen.add(def.id)
    }
  }

  return plugins
}

function parsePlugin(id: string, dirPath: string): PluginDefinition | null {
  // Try plugin.json first
  const manifestPath = path.join(dirPath, 'plugin.json')
  let manifest: PluginManifest | null = null

  if (fs.existsSync(manifestPath)) {
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
    } catch (err) {
      console.error(`[PluginLoader] Invalid plugin.json in ${dirPath}:`, err)
    }
  }

  if (!manifest) {
    manifest = { name: id, version: '0.0.0' }
  }

  const entryFile = manifest.entry || DEFAULT_ENTRY
  const entryPath = path.join(dirPath, entryFile)

  if (!fs.existsSync(entryPath)) {
    console.warn(`[PluginLoader] Plugin "${id}" has no entry file at ${entryPath}`)
    return null
  }

  const needsInstall = checkNeedsInstall(dirPath)

  return {
    id,
    manifest,
    dirPath,
    entryPath,
    enabled: getPluginEnabled(id),
    needsInstall,
  }
}

/**
 * Check if a plugin needs `npm install`.
 * Returns true if package.json exists but node_modules is missing or stale.
 */
function checkNeedsInstall(dirPath: string): boolean {
  const pkgPath = path.join(dirPath, 'package.json')
  if (!fs.existsSync(pkgPath)) return false

  const nodeModulesPath = path.join(dirPath, 'node_modules')
  if (!fs.existsSync(nodeModulesPath)) return true

  // Quick check: does node_modules have at least one subdir?
  try {
    const entries = fs.readdirSync(nodeModulesPath)
    if (entries.length === 0) return true
  } catch {
    return true
  }

  // Check if package.json changed since last install
  try {
    const pkgStat = fs.statSync(pkgPath)
    const nmStat = fs.statSync(nodeModulesPath)
    if (pkgStat.mtimeMs > nmStat.mtimeMs + 5000) return true
  } catch {
    // can't stat, assume ok
  }

  return false
}

/**
 * Run `npm install` in the plugin directory.
 * Uses --prefix so it works without cd-ing.
 * Returns null on success, error message on failure.
 */
export function installPluginDeps(dirPath: string): string | null {
  const pkgPath = path.join(dirPath, 'package.json')
  if (!fs.existsSync(pkgPath)) return 'No package.json found'

  try {
    console.log(`[PluginLoader] Running npm install in ${dirPath}...`)
    execSync('npm install --no-audit --no-fund --loglevel=error', {
      cwd: dirPath,
      timeout: 120_000,
      stdio: 'pipe',
    })
    console.log(`[PluginLoader] npm install complete for ${path.basename(dirPath)}`)
    return null
  } catch (err: any) {
    const msg = err.stderr?.toString() || err.message || 'npm install failed'
    console.error(`[PluginLoader] npm install failed for ${path.basename(dirPath)}:`, msg)
    return msg
  }
}

/** Load a plugin's entry module dynamically */
export async function loadPluginEntry(def: PluginDefinition): Promise<PluginEntry | null> {
  if (def.entry) {
    return def.entry
  }

  // Auto-install dependencies if needed
  if (def.needsInstall) {
    console.log(`[PluginLoader] Installing deps for plugin "${def.id}"...`)
    const installErr = installPluginDeps(def.dirPath)
    if (installErr) {
      console.error(`[PluginLoader] Dep install failed for "${def.id}": ${installErr}`)
      // Don't block — try loading anyway (maybe it works without deps)
    } else {
      def.needsInstall = false
    }
  }

  try {
    const mod = await import(def.entryPath)
    if (typeof mod.default === 'function') {
      return mod.default as PluginEntry
    }
    console.warn(`[PluginLoader] Plugin "${def.id}" entry does not export a default function`)
    return null
  } catch (err) {
    console.error(`[PluginLoader] Failed to load plugin "${def.id}":`, err)
    return null
  }
}

/** Create the plugin directories if they don't exist */
export function ensurePluginDirs(): void {
  const pluginsDir = getPluginsDir()
  if (!fs.existsSync(pluginsDir)) {
    fs.mkdirSync(pluginsDir, { recursive: true })
    console.log(`[PluginLoader] Created plugins directory: ${pluginsDir}`)
  }
}
