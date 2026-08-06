import fs from 'fs'
import os from 'os'
import path from 'path'
import { pathToFileURL } from 'url'
import type {
  CorePluginDefinition,
  PersistedPluginHealth,
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

export function getPluginHealthFromSettings(
  settings: PluginSettings,
  pluginId: string,
): PersistedPluginHealth | undefined {
  return settings.health?.[pluginId]
}

export function listPluginHealthFromSettings(
  settings: PluginSettings,
): Array<{ pluginId: string; health: PersistedPluginHealth }> {
  return Object.entries(settings.health ?? {}).map(([pluginId, health]) => ({ pluginId, health }))
}

export function setPluginHealthInSettings(
  settings: PluginSettings,
  pluginId: string,
  health: PersistedPluginHealth | null,
): PluginSettings {
  const next = { ...settings.health }
  if (health) next[pluginId] = health
  else delete next[pluginId]

  if (Object.keys(next).length === 0) {
    const { health: _dropped, ...rest } = settings
    return rest
  }
  return { ...settings, health: next }
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

/**
 * 轻量 semver 比较(不引依赖 —— core 是零依赖层)。
 *
 * 只认 `major.minor.patch` 前缀,预发布后缀(`-beta.1`)被忽略:minAppVersion
 * 想表达的是"宿主至少要有这个能力面",预发布次序不值得为它引一个依赖。
 * 返回 <0 / 0 / >0。
 */
export function compareCoreSemver(a: string, b: string): number {
  const parse = (value: string): number[] => {
    const core = String(value).trim().replace(/^[vV]/, '').split(/[-+]/)[0]
    const parts = core.split('.').map(part => Number.parseInt(part, 10))
    return [parts[0] || 0, parts[1] || 0, parts[2] || 0]
  }
  const left = parse(a)
  const right = parse(b)
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index]
  }
  return 0
}

/** 宿主版本未知(没配)时一律放行 —— 拿不到版本不是拒绝加载的理由。 */
export function checkPluginMinAppVersion(
  manifest: Pick<PluginManifest, 'minAppVersion'>,
  appVersion?: string,
): string | null {
  const required = manifest.minAppVersion?.trim()
  if (!required || !appVersion) return null
  if (compareCoreSemver(appVersion, required) >= 0) return null
  return `requires app >= ${required} (current ${appVersion})`
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

/**
 * contributes 段校验。
 *
 * 返回错误字符串而不是抛 —— 非法声明让插件进 error 态,不能把整轮扫描带崩
 * (一个手写坏了的 plugin.json 不该让其余插件全部消失)。
 */
export function validatePluginContributes(raw: unknown): string | null {
  if (raw === undefined || raw === null) return null
  if (!isPlainRecord(raw)) return 'contributes must be an object'

  const commands = raw.commands
  if (commands !== undefined) {
    if (!Array.isArray(commands)) return 'contributes.commands must be an array'
    for (const [index, command] of commands.entries()) {
      if (!isPlainRecord(command) || typeof command.name !== 'string' || !command.name.trim()) {
        return `contributes.commands[${index}].name must be a non-empty string`
      }
    }
  }

  const panels = raw.panels
  if (panels !== undefined) {
    if (!Array.isArray(panels)) return 'contributes.panels must be an array'
    for (const [index, panel] of panels.entries()) {
      if (!isPlainRecord(panel) || typeof panel.id !== 'string' || !panel.id.trim()) {
        return `contributes.panels[${index}].id must be a non-empty string`
      }
      if (typeof panel.label !== 'string' || !panel.label.trim()) {
        return `contributes.panels[${index}].label must be a non-empty string`
      }
    }
  }

  const settings = raw.settings
  if (settings !== undefined) {
    if (!isPlainRecord(settings)) return 'contributes.settings must be an object'
    if (settings.schema !== undefined && !isPlainRecord(settings.schema)) {
      return 'contributes.settings.schema must be a JSON Schema object'
    }
  }

  const permissions = raw.permissions
  if (permissions !== undefined) {
    if (!Array.isArray(permissions) || permissions.some(item => typeof item !== 'string')) {
      return 'contributes.permissions must be an array of strings'
    }
  }

  const activation = raw.activation
  if (activation !== undefined) {
    if (!isPlainRecord(activation)) return 'contributes.activation must be an object'
    if (activation.events !== undefined
      && (!Array.isArray(activation.events) || activation.events.some(item => typeof item !== 'string'))) {
      return 'contributes.activation.events must be an array of strings'
    }
  }

  return null
}

export function parsePluginDirectory<TEntry = unknown>(input: {
  id: string
  dirPath: string
  enabled: boolean
  source?: PluginSource
  defaultEntry?: string
  /** 宿主版本;用于 minAppVersion 判定。省略 = 跳过判定。 */
  appVersion?: string
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

  // 声明层的两道闸,都在扫描期判完:非法 contributes 与宿主版本不够。
  // 判定结果只标记,不抛 —— 一个坏 plugin.json 不该让整轮扫描消失。
  const contributesError = validatePluginContributes((manifest as { contributes?: unknown }).contributes)
  if (contributesError) {
    console.warn(`[PluginLoader] Plugin "${input.id}" has invalid contributes: ${contributesError}`)
    manifest = { ...manifest, contributes: undefined }
  }
  const versionError = checkPluginMinAppVersion(manifest, input.appVersion)

  return {
    id: input.id,
    source: input.source,
    manifest,
    dirPath: input.dirPath,
    entryPath,
    enabled: input.enabled,
    needsInstall: checkPluginNeedsInstall(input.dirPath),
    loadBlockedReason: versionError
      ?? (contributesError ? `invalid plugin.json: ${contributesError}` : undefined),
  }
}

export function scanPluginDirectories<TEntry = unknown>(input: {
  pluginsDir: string
  seenIds?: Set<string>
  getEnabled: (pluginId: string) => boolean
  appVersion?: string
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
      appVersion: input.appVersion,
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
  /** 宿主版本 —— 只对用户插件生效:内置插件与 app 同一份构建,永远匹配。 */
  appVersion?: string
}): Array<CorePluginDefinition<TEntry>> {
  const seen = new Set(input.builtinPlugins.map(plugin => plugin.id))
  return [
    ...input.builtinPlugins,
    ...scanPluginDirectories<TEntry>({
      pluginsDir: input.pluginsDir,
      seenIds: seen,
      getEnabled: input.getEnabled,
      appVersion: input.appVersion,
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

export interface CorePluginDependencyInstallAsyncAdapters {
  exists(path: string): boolean
  runInstall(dirPath: string): Promise<void>
  logger?: CorePluginLoaderLogger
  onInstallStart?(dirPath: string): void
  onInstallEnd?(dirPath: string, error: string | null): void
}

/**
 * 热重载:给 ESM 说明符加 cache-buster。
 *
 * 裸 `import(entryPath)` 会命中 ESM 模块缓存 —— 改一行插件代码要重启整个 app,
 * 那是平台开发体验的地板以下(对照 VS Code 的 F5 Extension Development Host)。
 * 加一个 query 就得到新的模块记录;顺带把绝对路径转成 file:// URL,
 * 这也是 Windows 上 `import('C:\\...')` 唯一能工作的形式。
 */
export function buildPluginEntryImportSpecifier(entryPath: string, reloadToken?: string | number): string {
  const isUrl = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(entryPath)
  let specifier = entryPath
  if (!isUrl && path.isAbsolute(entryPath)) {
    specifier = pathToFileURL(entryPath).href
  }
  if (reloadToken === undefined || reloadToken === null || reloadToken === '') return specifier
  return `${specifier}${specifier.includes('?') ? '&' : '?'}v=${encodeURIComponent(String(reloadToken))}`
}

export interface CorePluginEntryModule<TEntry = unknown> {
  default?: TEntry | unknown
}

export interface LoadCorePluginEntryAdapters<TEntry = unknown> {
  /** 允许返回 Promise:npm install 是分钟级操作,同步跑会冻住整个宿主进程。 */
  installDependencies(dirPath: string): string | null | Promise<string | null>
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

/**
 * 异步版依赖安装。
 *
 * 同步版(execSync)会把整个主进程连同全部 IPC 冻住最长两分钟 —— 那是"宿主被
 * 插件拖垮"最直白的一种形态。
 */
export async function installCorePluginDependenciesAsync(
  dirPath: string,
  adapters: CorePluginDependencyInstallAsyncAdapters,
): Promise<string | null> {
  const pkgPath = path.join(dirPath, 'package.json')
  if (!adapters.exists(pkgPath)) return 'No package.json found'

  const logger = adapters.logger ?? console
  adapters.onInstallStart?.(dirPath)
  try {
    logger.log?.(`[PluginLoader] Running npm install in ${dirPath}...`)
    await adapters.runInstall(dirPath)
    logger.log?.(`[PluginLoader] npm install complete for ${path.basename(dirPath)}`)
    adapters.onInstallEnd?.(dirPath, null)
    return null
  } catch (error) {
    const message = pluginLoaderErrorMessage(error, 'npm install failed')
    logger.error?.(`[PluginLoader] npm install failed for ${path.basename(dirPath)}:`, message)
    adapters.onInstallEnd?.(dirPath, message)
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
    const installError = await adapters.installDependencies(definition.dirPath)
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
