/**
 * Plugin Loader — scans and loads plugins from disk.
 *
 * User plugins live under ~/.onething/plugins/{plugin-id}/.
 * Built-in plugins are statically bundled with the app.
 * Each plugin has a package.json with its own dependencies.
 * On install/first-load, `npm install` is run inside the plugin directory.
 */

import { execSync } from 'child_process'
import { getOnethingStorePath } from '@onething/runtime/storage'
import { pathExists } from '@onething/core/storage'
import {
  createBuiltinPluginDefinitions,
  ensureCorePluginsDir,
  getCorePluginSettingsPath,
  getCorePluginsDir,
  getPluginEnabledWithAdapters,
  installCorePluginDependencies,
  loadCorePluginEntry,
  readPluginSettingsFile,
  scanCorePlugins,
  setPluginEnabledWithAdapters,
  writePluginSettingsFile,
} from '@onething/core/plugins'
import type { PluginDefinition, PluginEntry, PluginSettings } from './types.js'
import logMonitorPlugin, { logMonitorManifest } from './builtin/log-monitor.js'
import noteSkillsPlugin, { noteSkillsManifest } from './builtin/note-skills.js'
import soulMemoryPlugin, { soulMemoryManifest } from './builtin/soul-memory.js'

function getPluginsDir(): string {
  return getCorePluginsDir({ storePath: getOnethingStorePath() })
}

function getPluginSettingsPath(): string {
  return getCorePluginSettingsPath({ storePath: getOnethingStorePath() })
}

function readPluginSettings(): PluginSettings {
  return readPluginSettingsFile(getPluginSettingsPath())
}

function writePluginSettings(settings: PluginSettings): void {
  writePluginSettingsFile(getPluginSettingsPath(), settings)
}

export function getPluginEnabled(pluginId: string, fallback = true): boolean {
  return getPluginEnabledWithAdapters(pluginId, fallback, {
    readSettings: readPluginSettings,
  })
}

export function setPluginEnabled(pluginId: string, enabled: boolean): void {
  setPluginEnabledWithAdapters(pluginId, enabled, {
    readSettings: readPluginSettings,
    writeSettings: writePluginSettings,
  })
}

function getBuiltinPlugins(): PluginDefinition[] {
  return createBuiltinPluginDefinitions<PluginEntry>([
    {
      id: 'log-monitor',
      manifest: logMonitorManifest,
      entry: logMonitorPlugin,
      enabled: getPluginEnabled('log-monitor'),
    },
    {
      id: 'note-skills',
      manifest: noteSkillsManifest,
      entry: noteSkillsPlugin,
      enabled: getPluginEnabled('note-skills'),
    },
    {
      id: 'soul-memory',
      manifest: soulMemoryManifest,
      entry: soulMemoryPlugin,
      enabled: getPluginEnabled('soul-memory'),
    },
  ]) as PluginDefinition[]
}

/** Scan built-in and user plugin directories and return plugin definitions. */
export function scanPlugins(): PluginDefinition[] {
  return scanCorePlugins<PluginEntry>({
    builtinPlugins: getBuiltinPlugins(),
    pluginsDir: getPluginsDir(),
    getEnabled: pluginId => getPluginEnabled(pluginId),
  }) as PluginDefinition[]
}

/**
 * Run `npm install` in the plugin directory.
 * Uses --prefix so it works without cd-ing.
 * Returns null on success, error message on failure.
 */
export function installPluginDeps(dirPath: string): string | null {
  return installCorePluginDependencies(dirPath, {
    exists: pathExists,
    runInstall(pluginDir) {
      execSync('npm install --no-audit --no-fund --loglevel=error', {
        cwd: pluginDir,
        timeout: 120_000,
        stdio: 'pipe',
      })
    },
    logger: console,
  })
}

/** Load a plugin's entry module dynamically */
export async function loadPluginEntry(def: PluginDefinition): Promise<PluginEntry | null> {
  return loadCorePluginEntry(def, {
    installDependencies: installPluginDeps,
    importEntry: entryPath => import(entryPath),
    logger: console,
  })
}

/** Create the plugin directories if they don't exist */
export function ensurePluginDirs(): void {
  ensureCorePluginsDir(getPluginsDir(), console)
}
