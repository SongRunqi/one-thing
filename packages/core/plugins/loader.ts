import fs from 'fs'
import os from 'os'
import path from 'path'
import type {
  CorePluginDefinition,
  PluginManifest,
  PluginSettings,
  PluginSource,
} from './types.js'

export const DEFAULT_PLUGIN_ENTRY = 'plugin-entry.js'

export interface CorePluginLoaderPathOptions {
  homeDir?: string
  storePath?: string
  defaultStoreDirName?: string
}

export interface CoreBuiltinPluginSpec<TEntry = unknown> {
  id: string
  manifest: PluginManifest
  entry: TEntry
  enabled: boolean
}

export function createBuiltinPluginDefinitions<TEntry = unknown>(
  specs: Array<CoreBuiltinPluginSpec<TEntry>>,
): Array<CorePluginDefinition<TEntry>> {
  return specs.map(spec => ({
    id: spec.id,
    source: 'builtin',
    manifest: spec.manifest,
    dirPath: `builtin://${spec.id}`,
    entryPath: `builtin://${spec.id}/${DEFAULT_PLUGIN_ENTRY}`,
    entry: spec.entry,
    enabled: spec.enabled,
    needsInstall: false,
  }))
}

export function getCorePluginStorePath(options: CorePluginLoaderPathOptions = {}): string {
  return options.storePath || path.join(options.homeDir || os.homedir(), options.defaultStoreDirName ?? '.headless-core')
}

export function getCorePluginsDir(options: CorePluginLoaderPathOptions = {}): string {
  return path.join(getCorePluginStorePath(options), 'plugins')
}

export function getCorePluginSettingsPath(options: CorePluginLoaderPathOptions = {}): string {
  return path.join(getCorePluginStorePath(options), 'plugin-settings.json')
}

export function ensureCorePluginsDir(
  pluginsDir: string,
  logger: Pick<CorePluginLoaderLogger, 'log'> = console,
): void {
  if (!fs.existsSync(pluginsDir)) {
    fs.mkdirSync(pluginsDir, { recursive: true })
    logger.log?.(`[PluginLoader] Created plugins directory: ${pluginsDir}`)
  }
}

export function readPluginSettingsFile(settingsPath: string): PluginSettings {
  if (!fs.existsSync(settingsPath)) return {}

  try {
    return JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) as PluginSettings
  } catch (error) {
    console.error('[PluginLoader] Failed to read plugin settings:', error)
    return {}
  }
}

export function writePluginSettingsFile(settingsPath: string, settings: PluginSettings): void {
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true })
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8')
}

export function getPluginEnabledFromSettings(
  settings: PluginSettings,
  pluginId: string,
  fallback = true,
): boolean {
  return settings.enabled?.[pluginId] ?? fallback
}

export function setPluginEnabledInSettings(
  settings: PluginSettings,
  pluginId: string,
  enabled: boolean,
): PluginSettings {
  return {
    ...settings,
    enabled: {
      ...settings.enabled,
      [pluginId]: enabled,
    },
  }
}

export interface CorePluginSettingsStorageAdapters {
  readSettings(): PluginSettings
  writeSettings(settings: PluginSettings): void
}

export function getPluginEnabledWithAdapters(
  pluginId: string,
  fallback: boolean,
  adapters: Pick<CorePluginSettingsStorageAdapters, 'readSettings'>,
): boolean {
  return getPluginEnabledFromSettings(adapters.readSettings(), pluginId, fallback)
}

export function setPluginEnabledWithAdapters(
  pluginId: string,
  enabled: boolean,
  adapters: CorePluginSettingsStorageAdapters,
): PluginSettings {
  const nextSettings = setPluginEnabledInSettings(adapters.readSettings(), pluginId, enabled)
  adapters.writeSettings(nextSettings)
  return nextSettings
}

export function checkPluginNeedsInstall(dirPath: string): boolean {
  const pkgPath = path.join(dirPath, 'package.json')
  if (!fs.existsSync(pkgPath)) return false

  const nodeModulesPath = path.join(dirPath, 'node_modules')
  if (!fs.existsSync(nodeModulesPath)) return true

  try {
    const entries = fs.readdirSync(nodeModulesPath)
    if (entries.length === 0) return true
  } catch {
    return true
  }

  try {
    const pkgStat = fs.statSync(pkgPath)
    const nmStat = fs.statSync(nodeModulesPath)
    if (pkgStat.mtimeMs > nmStat.mtimeMs + 5000) return true
  } catch {
    return false
  }

  return false
}

export function parsePluginDirectory<TEntry = unknown>(input: {
  id: string
  dirPath: string
  enabled: boolean
  source?: PluginSource
  defaultEntry?: string
}): CorePluginDefinition<TEntry> | null {
  const manifestPath = path.join(input.dirPath, 'plugin.json')
  let manifest: CorePluginDefinition<TEntry>['manifest'] | null = null

  if (fs.existsSync(manifestPath)) {
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
    } catch (error) {
      console.error(`[PluginLoader] Invalid plugin.json in ${input.dirPath}:`, error)
    }
  }

  if (!manifest) {
    manifest = { name: input.id, version: '0.0.0' }
  }

  const entryFile = manifest.entry || input.defaultEntry || DEFAULT_PLUGIN_ENTRY
  const entryPath = path.join(input.dirPath, entryFile)

  if (!fs.existsSync(entryPath)) {
    console.warn(`[PluginLoader] Plugin "${input.id}" has no entry file at ${entryPath}`)
    return null
  }

  return {
    id: input.id,
    source: input.source,
    manifest,
    dirPath: input.dirPath,
    entryPath,
    enabled: input.enabled,
    needsInstall: checkPluginNeedsInstall(input.dirPath),
  }
}

export function scanPluginDirectories<TEntry = unknown>(input: {
  pluginsDir: string
  seenIds?: Set<string>
  getEnabled: (pluginId: string) => boolean
}): CorePluginDefinition<TEntry>[] {
  if (!fs.existsSync(input.pluginsDir)) {
    return []
  }

  const plugins: CorePluginDefinition<TEntry>[] = []
  const seen = input.seenIds ?? new Set<string>()
  const entries = fs.readdirSync(input.pluginsDir, { withFileTypes: true })

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue
    if (seen.has(entry.name)) {
      console.warn(`[PluginLoader] Skipping user plugin "${entry.name}" because a built-in plugin with the same id exists`)
      continue
    }
    const dirPath = path.join(input.pluginsDir, entry.name)
    const definition = parsePluginDirectory<TEntry>({
      id: entry.name,
      dirPath,
      enabled: input.getEnabled(entry.name),
      source: 'user',
    })
    if (definition) {
      plugins.push(definition)
      seen.add(definition.id)
    }
  }

  return plugins
}

export function scanCorePlugins<TEntry = unknown>(input: {
  builtinPlugins: Array<CorePluginDefinition<TEntry>>
  pluginsDir: string
  getEnabled: (pluginId: string) => boolean
}): Array<CorePluginDefinition<TEntry>> {
  const seen = new Set(input.builtinPlugins.map(plugin => plugin.id))
  return [
    ...input.builtinPlugins,
    ...scanPluginDirectories<TEntry>({
      pluginsDir: input.pluginsDir,
      seenIds: seen,
      getEnabled: input.getEnabled,
    }),
  ]
}

export interface CorePluginLoaderLogger {
  log?(...args: unknown[]): void
  warn?(...args: unknown[]): void
  error?(...args: unknown[]): void
}

export interface CorePluginDependencyInstallAdapters {
  exists(path: string): boolean
  runInstall(dirPath: string): void
  logger?: CorePluginLoaderLogger
}

export interface CorePluginEntryModule<TEntry = unknown> {
  default?: TEntry | unknown
}

export interface LoadCorePluginEntryAdapters<TEntry = unknown> {
  installDependencies(dirPath: string): string | null
  importEntry(entryPath: string): Promise<CorePluginEntryModule<TEntry>>
  isEntry?: (value: unknown) => value is TEntry
  logger?: CorePluginLoaderLogger
}

function pluginLoaderErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object') {
    const stderr = 'stderr' in error ? (error as { stderr?: unknown }).stderr : undefined
    if (stderr && typeof (stderr as { toString?: unknown }).toString === 'function') {
      const message = (stderr as { toString(): string }).toString()
      if (message) return message
    }

    const message = 'message' in error ? (error as { message?: unknown }).message : undefined
    if (typeof message === 'string' && message) return message
  }

  return fallback
}

export function installCorePluginDependencies(
  dirPath: string,
  adapters: CorePluginDependencyInstallAdapters,
): string | null {
  const pkgPath = path.join(dirPath, 'package.json')
  if (!adapters.exists(pkgPath)) return 'No package.json found'

  const logger = adapters.logger ?? console
  try {
    logger.log?.(`[PluginLoader] Running npm install in ${dirPath}...`)
    adapters.runInstall(dirPath)
    logger.log?.(`[PluginLoader] npm install complete for ${path.basename(dirPath)}`)
    return null
  } catch (error) {
    const message = pluginLoaderErrorMessage(error, 'npm install failed')
    logger.error?.(`[PluginLoader] npm install failed for ${path.basename(dirPath)}:`, message)
    return message
  }
}

export async function loadCorePluginEntry<TEntry = unknown>(
  definition: CorePluginDefinition<TEntry>,
  adapters: LoadCorePluginEntryAdapters<TEntry>,
): Promise<TEntry | null> {
  if (definition.entry) {
    return definition.entry
  }

  const logger = adapters.logger ?? console

  if (definition.needsInstall) {
    logger.log?.(`[PluginLoader] Installing deps for plugin "${definition.id}"...`)
    const installError = adapters.installDependencies(definition.dirPath)
    if (installError) {
      logger.error?.(`[PluginLoader] Dep install failed for "${definition.id}": ${installError}`)
    } else {
      definition.needsInstall = false
    }
  }

  try {
    const mod = await adapters.importEntry(definition.entryPath)
    const entry = mod.default
    const isEntry = adapters.isEntry ?? ((value: unknown): value is TEntry => typeof value === 'function')
    if (isEntry(entry)) {
      return entry
    }

    logger.warn?.(`[PluginLoader] Plugin "${definition.id}" entry does not export a default function`)
    return null
  } catch (error) {
    logger.error?.(`[PluginLoader] Failed to load plugin "${definition.id}":`, error)
    return null
  }
}
