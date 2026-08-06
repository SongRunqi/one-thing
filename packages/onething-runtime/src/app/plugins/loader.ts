/**
 * Plugin Loader — scans and loads plugins from disk.
 *
 * User plugins live under ~/.onething/plugins/{plugin-id}/.
 * Built-in plugins are statically bundled with the app.
 * Each plugin has a package.json with its own dependencies.
 * On install/first-load, `npm install` is run inside the plugin directory.
 */

import { spawn } from 'child_process'
import { getOnethingStorePath } from '@onething/runtime/storage'
import { pathExists } from '@onething/core/storage'
import {
  createBuiltinPluginDefinitions,
  ensureCorePluginsDir,
  getCorePluginSettingsPath,
  getCorePluginsDir,
  getPluginEnabledWithAdapters,
  installCorePluginDependenciesAsync,
  loadCorePluginEntry,
  readPluginSettingsFile,
  scanCorePlugins,
  setPluginEnabledWithAdapters,
  writePluginSettingsFile,
} from '@onething/core/plugins'
import {
  clearPluginRuntimeHealth,
  markPluginInstalling,
  markPluginLoadError,
  reportPluginRuntimeSuccess,
} from './health.js'
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
  // 显式启用 = 一次清账:熔断状态与失败计数不跨越它,否则重新启用的插件会带着
  // 上一次的红态复活。
  if (enabled) clearPluginRuntimeHealth(pluginId)
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

export const PLUGIN_NPM_INSTALL_TIMEOUT_MS = 120_000

/**
 * Run `npm install` in the plugin directory — **异步**。
 *
 * 之前是 execSync(timeout 120s):一个带 package.json 的新插件能把整个主进程
 * 连同全部 IPC 冻住整整两分钟。spawn 之后事件循环继续转,期间插件状态是
 * installing(设置页可见)。
 */
export function installPluginDeps(dirPath: string, pluginId?: string): Promise<string | null> {
  return installCorePluginDependenciesAsync(dirPath, {
    exists: pathExists,
    runInstall(pluginDir) {
      return new Promise<void>((resolve, reject) => {
        const child = spawn('npm', ['install', '--no-audit', '--no-fund', '--loglevel=error'], {
          cwd: pluginDir,
          stdio: ['ignore', 'pipe', 'pipe'],
        })
        let stderr = ''
        let settled = false
        const timer = setTimeout(() => {
          settled = true
          child.kill('SIGKILL')
          reject(new Error(`npm install timed out after ${PLUGIN_NPM_INSTALL_TIMEOUT_MS}ms`))
        }, PLUGIN_NPM_INSTALL_TIMEOUT_MS)
        timer.unref?.()

        child.stderr?.on('data', chunk => {
          stderr += String(chunk)
        })
        child.on('error', error => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          reject(error)
        })
        child.on('close', code => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          if (code === 0) resolve()
          else reject(new Error(stderr.trim() || `npm install exited with code ${code}`))
        })
      })
    },
    logger: console,
    onInstallStart() {
      if (pluginId) markPluginInstalling(pluginId)
    },
    onInstallEnd(_dirPath, error) {
      if (!pluginId) return
      if (error) markPluginLoadError(pluginId, 'npm-install', error)
      else reportPluginRuntimeSuccess(pluginId)
    },
  })
}

/** Load a plugin's entry module dynamically */
export async function loadPluginEntry(def: PluginDefinition): Promise<PluginEntry | null> {
  return loadCorePluginEntry(def, {
    installDependencies: dirPath => installPluginDeps(dirPath, def.id),
    importEntry: entryPath => import(entryPath),
    logger: console,
  })
}

/** Create the plugin directories if they don't exist */
export function ensurePluginDirs(): void {
  ensureCorePluginsDir(getPluginsDir(), console)
}
