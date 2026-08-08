import fs from 'fs'
import os from 'os'
import path from 'path'
import { pathToFileURL } from 'url'
import { writeJsonFile } from '../storage/json-file.js'
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

/**
 * 读 plugin-settings。
 *
 * parse 失败时**把坏文件挪走再返回空**,而不是直接拿 `{}` 当结果继续用:
 * 这个文件现在装着启停位、熔断原因和用户手工配的插件配置(R3),而下一次任意
 * 写入(比如熔断落一条 health)都会以读到的东西为基底整份重写 —— 让 `{}` 成为
 * 基底,等于一次半截 JSON 就把用户的全部配置静默蒸发掉。备份成
 * `.corrupt-<时间戳>` 至少留得下现场。
 */
export function readPluginSettingsFile(settingsPath: string): PluginSettings {
  if (!fs.existsSync(settingsPath)) return {}

  let raw: string
  try {
    raw = fs.readFileSync(settingsPath, 'utf-8')
  } catch (error) {
    console.error('[PluginLoader] Failed to read plugin settings:', error)
    return {}
  }

  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('plugin settings must be a JSON object')
    }
    return parsed as PluginSettings
  } catch (error) {
    const backupPath = `${settingsPath}.corrupt-${Date.now()}`
    try {
      fs.renameSync(settingsPath, backupPath)
      console.error(
        `[PluginLoader] plugin-settings.json is unreadable; moved it to ${backupPath} `
        + 'so the next write starts from a clean file instead of overwriting it:',
        error,
      )
    } catch (renameError) {
      console.error('[PluginLoader] Failed to quarantine the corrupt plugin settings file:', renameError)
    }
    return {}
  }
}

/**
 * 写 plugin-settings —— 走原子写(tmp + rename)。
 *
 * 裸 writeFileSync 在写到一半掉电/被杀时留下半截 JSON;配上上面那个"读不出来
 * 就当空"的旧行为,就是用户配置静默蒸发的完整配方。
 */
export function writePluginSettingsFile(settingsPath: string, settings: PluginSettings): void {
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true })
  writeJsonFile(settingsPath, settings)
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

export function getPluginConfigFromSettings(
  settings: PluginSettings,
  pluginId: string,
): Record<string, unknown> {
  return settings.config?.[pluginId] ?? {}
}

export function setPluginConfigInSettings(
  settings: PluginSettings,
  pluginId: string,
  config: Record<string, unknown> | null,
): PluginSettings {
  const next = { ...settings.config }
  if (config && Object.keys(config).length > 0) next[pluginId] = config
  else delete next[pluginId]

  if (Object.keys(next).length === 0) {
    const { config: _dropped, ...rest } = settings
    return rest
  }
  return { ...settings, config: next }
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

/**
 * 宿主版本未知(没配)时一律放行 —— 拿不到版本不是拒绝加载的理由。
 *
 * 但那也意味着这道闸此刻是**关着的**:插件声明了 minAppVersion 而我们无从比对。
 * 静默放行会让人以为闸在工作,所以吼一声。
 */
export function checkPluginMinAppVersion(
  manifest: Pick<PluginManifest, 'minAppVersion'>,
  appVersion?: string,
  logger: Pick<CorePluginLoaderLogger, 'warn'> = console,
): string | null {
  const required = manifest.minAppVersion?.trim()
  if (!required) return null
  if (!appVersion) {
    logger.warn?.(
      `[PluginLoader] Plugin declares minAppVersion "${required}" but the host version is not configured; `
      + 'the version gate is inactive (call configurePluginAppVersion at boot).',
    )
    return null
  }
  if (compareCoreSemver(appVersion, required) >= 0) return null
  return `requires app >= ${required} (current ${appVersion})`
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

const JSON_SCHEMA_TYPES = new Set([
  'object', 'array', 'string', 'number', 'integer', 'boolean', 'null',
])

/**
 * settings.schema 的最低形状校验。
 *
 * 不做完整的 JSON Schema 元校验(那要引依赖,core 是零依赖层),但要挡住
 * `{"type": 42}` 这种一眼就坏的东西 —— R3 的设置页会拿它去渲染表单,
 * 到那时候才炸就是在错误的层报错。
 */
function validateSettingsSchemaShape(schema: Record<string, unknown>): string | null {
  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type]
    for (const type of types) {
      if (typeof type !== 'string' || !JSON_SCHEMA_TYPES.has(type)) {
        return `contributes.settings.schema.type must be one of ${[...JSON_SCHEMA_TYPES].join('/')}`
      }
    }
  }

  if (schema.properties !== undefined) {
    if (!isPlainRecord(schema.properties)) {
      return 'contributes.settings.schema.properties must be an object'
    }
    for (const [key, value] of Object.entries(schema.properties)) {
      if (!isPlainRecord(value)) {
        return `contributes.settings.schema.properties.${key} must be an object`
      }
    }
  }

  if (schema.required !== undefined) {
    if (!Array.isArray(schema.required) || schema.required.some(item => typeof item !== 'string')) {
      return 'contributes.settings.schema.required must be an array of strings'
    }
  }

  return null
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

  // uiSlots(R5.x)只校验**形状**。锚点是否存在于宿主清单不在这里判:
  // 未知锚点 = 丢弃该条并标记 unsupported(投影层的职责),不是加载期错误 ——
  // 多宿主与版本偏斜下"宿主不认识这个锚点"不是代码错误。
  const uiSlots = raw.uiSlots
  if (uiSlots !== undefined) {
    if (!Array.isArray(uiSlots)) return 'contributes.uiSlots must be an array'
    for (const [index, slot] of uiSlots.entries()) {
      if (!isPlainRecord(slot) || typeof slot.anchor !== 'string' || !slot.anchor.trim()) {
        return `contributes.uiSlots[${index}].anchor must be a non-empty string`
      }
      if (typeof slot.id !== 'string' || !slot.id.trim()) {
        return `contributes.uiSlots[${index}].id must be a non-empty string`
      }
      if (typeof slot.label !== 'string' || !slot.label.trim()) {
        return `contributes.uiSlots[${index}].label must be a non-empty string`
      }
    }
  }

  const settings = raw.settings
  if (settings !== undefined) {
    if (!isPlainRecord(settings)) return 'contributes.settings must be an object'
    if (settings.schema !== undefined) {
      if (!isPlainRecord(settings.schema)) {
        return 'contributes.settings.schema must be a JSON Schema object'
      }
      const schemaError = validateSettingsSchemaShape(settings.schema)
      if (schemaError) return schemaError
    }
    if (settings.ui !== undefined) {
      if (!isPlainRecord(settings.ui)) return 'contributes.settings.ui must be an object'
      for (const [key, hint] of Object.entries(settings.ui)) {
        if (!isPlainRecord(hint)) return `contributes.settings.ui.${key} must be an object`
        for (const field of ['label', 'hint', 'control'] as const) {
          if (hint[field] !== undefined && typeof hint[field] !== 'string') {
            return `contributes.settings.ui.${key}.${field} must be a string`
          }
        }
      }
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
  /**
   * 是否探测 needsInstall(默认 true = 现状)。
   *
   * npm 形态插件必须传 false:tarball 在 install 时已 bundle 全部依赖,
   * 包里**没有** node_modules 才是常态 —— 拿目录探测法去判,npm 插件
   * 会永远背着 needsInstall 的假账(§5.3:加载期缺依赖 = 包没打好,
   * 按加载失败记账,不再现装)。
   */
  needsInstallCheck?: boolean
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
    needsInstall: input.needsInstallCheck === false ? false : checkPluginNeedsInstall(input.dirPath),
    loadBlockedReason: versionError
      ?? (contributesError ? `invalid plugin.json: ${contributesError}` : undefined),
  }
}

/**
 * 一轮扫描的**可信度**。
 *
 * `existsSync`/`readdirSync` 失败与"目录里确实没有插件"在返回值上长得一模一样,
 * 而这两件事的下游后果天差地别:后者只是没插件,前者会让孤儿归档把
 * plugin-data 下的所有目录当成无主数据搬走。所以扫描必须自己说清楚
 * "我这轮读得可不可信"。
 */
export interface CorePluginScanTrust {
  trusted: boolean
  reason?: string
  /** 源目录下实际存在的条目名(含 symlink)—— 所有权判定用它,不是用能否加载。 */
  presentEntryNames: string[]
}

export function scanPluginSourceEntries(pluginsDir: string): CorePluginScanTrust {
  let stat: fs.Stats
  try {
    stat = fs.statSync(pluginsDir)
  } catch (error) {
    const code = (error as { code?: string }).code
    // ENOENT 是"还没建过插件目录",是可信的空;其余(EACCES/EIO/…)不可信。
    if (code === 'ENOENT') return { trusted: true, presentEntryNames: [] }
    return { trusted: false, reason: `cannot stat ${pluginsDir} (${code ?? 'unknown'})`, presentEntryNames: [] }
  }
  if (!stat.isDirectory()) {
    return { trusted: false, reason: `${pluginsDir} is not a directory`, presentEntryNames: [] }
  }

  try {
    return {
      trusted: true,
      presentEntryNames: fs.readdirSync(pluginsDir, { withFileTypes: true })
        // **含 symlink**:dirent.isDirectory() 对符号链接是 false,而
        // `ln -s sample-plugins/x ~/.onething/plugins/x` 正是 README 教的装法 ——
        // 漏掉它等于每轮 refresh 都把它的数据判成孤儿。
        .filter(entry => !entry.name.startsWith('.') && entry.name !== 'node_modules')
        .map(entry => entry.name),
    }
  } catch (error) {
    const code = (error as { code?: string }).code
    return { trusted: false, reason: `cannot read ${pluginsDir} (${code ?? 'unknown'})`, presentEntryNames: [] }
  }
}

export function scanPluginDirectories<TEntry = unknown>(input: {
  pluginsDir: string
  seenIds?: Set<string>
  getEnabled: (pluginId: string) => boolean
  appVersion?: string
}): CorePluginDefinition<TEntry>[] {
  let entries: fs.Dirent[]
  try {
    if (!fs.statSync(input.pluginsDir).isDirectory()) return []
    entries = fs.readdirSync(input.pluginsDir, { withFileTypes: true })
  } catch {
    return []
  }

  const plugins: CorePluginDefinition<TEntry>[] = []
  const seen = input.seenIds ?? new Set<string>()

  for (const entry of entries) {
    // symlink 装法的目录 dirent.isDirectory() 为 false —— 用 statSync 跟随链接判。
    if (!entry.isDirectory()) {
      if (!entry.isSymbolicLink()) continue
      try {
        if (!fs.statSync(path.join(input.pluginsDir, entry.name)).isDirectory()) continue
      } catch {
        continue
      }
    }
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

/** 扫描语义:directory = 遍历插件根(现状);npm-ledger = 以 plugins/package.json 的 dependencies 为账。 */
export type CorePluginScanMode = 'directory' | 'npm-ledger'

/**
 * pluginId = 包名去 scope(单 scope):`@org/foo` → `foo`,无 scope 原样。
 *
 * 同 id 冲突(两个 scope 装了同名包)由扫描方拒绝后到者 —— 这里只做
 * 机械去前缀,不做仲裁。
 */
export function unscopedPluginIdFromPackageName(name: string): string {
  const match = /^@[^/]+\/(.+)$/.exec(name)
  return match ? match[1] : name
}

/**
 * 一轮账读的**可信度**。
 *
 * 与 CorePluginScanTrust 同理:`plugins/package.json` 读失败/坏 JSON 与
 * “确实没装任何 npm 插件”必须区分 —— 拿空账当真,下游会把全部 npm 插件
 * 的家目录判成孤儿。读失败 = 空账 + warn + 什么都不删。
 */
export interface CorePluginLedgerRead {
  trusted: boolean
  reason?: string
  /** dependencies 的 [包名, spec] 对;只有值为 string 的条目才算账。 */
  entries: Array<{ name: string; spec: string }>
}

export function readPluginLedger(pluginsDir: string): CorePluginLedgerRead {
  const ledgerPath = path.join(pluginsDir, 'package.json')
  let raw: string
  try {
    raw = fs.readFileSync(ledgerPath, 'utf-8')
  } catch (error) {
    const code = (error as { code?: string }).code
    // ENOENT = 还没初始化过脚手架,是可信的空账。
    if (code === 'ENOENT') return { trusted: true, entries: [] }
    return { trusted: false, reason: `cannot read plugin ledger ${ledgerPath} (${code ?? 'unknown'})`, entries: [] }
  }

  try {
    const pkg = JSON.parse(raw) as { dependencies?: unknown }
    const deps = pkg.dependencies
    if (!deps || typeof deps !== 'object' || Array.isArray(deps)) {
      return { trusted: true, entries: [] }
    }
    return {
      trusted: true,
      entries: Object.entries(deps as Record<string, unknown>)
        .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
        .map(([name, spec]) => ({ name, spec })),
    }
  } catch (error) {
    return {
      trusted: false,
      reason: `corrupt plugin ledger ${ledgerPath}: ${error instanceof Error ? error.message : String(error)}`,
      entries: [],
    }
  }
}

/** 已装版本以 node_modules/<dep>/package.json 为准 —— 比解析 dependencies 里的 URL 可靠。 */
function readInstalledPackageVersion(dirPath: string): string | null {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(dirPath, 'package.json'), 'utf-8')) as { version?: unknown }
    return typeof pkg.version === 'string' && pkg.version ? pkg.version : null
  } catch {
    return null
  }
}

/**
 * npm-ledger 扫描:以 `plugins/package.json` 的 dependencies 为账,
 * 逐个 resolve `node_modules/<dep>/plugin.json`。
 *
 * - dep 存在但包里没有 plugin.json = 它不是 onething 插件,跳过(普通依赖
 *   与插件可以共存于同一棵 node_modules);
 * - npm 形态永不探测 needsInstall(§5.3):加载期缺依赖 = 包没打好,
 *   按加载失败记账,不再现装。
 */
export function scanPluginLedgerDirectories<TEntry = unknown>(input: {
  pluginsDir: string
  seenIds?: Set<string>
  getEnabled: (pluginId: string) => boolean
  appVersion?: string
}): CorePluginDefinition<TEntry>[] {
  const ledger = readPluginLedger(input.pluginsDir)
  if (!ledger.trusted) {
    console.warn(`[PluginLoader] ${ledger.reason}; skipping npm-ledger scan this round (nothing is removed).`)
    return []
  }

  const plugins: CorePluginDefinition<TEntry>[] = []
  const seen = input.seenIds ?? new Set<string>()
  const nodeModulesDir = path.join(input.pluginsDir, 'node_modules')

  for (const dep of ledger.entries) {
    const dirPath = path.join(nodeModulesDir, dep.name)
    if (!fs.existsSync(path.join(dirPath, 'plugin.json'))) continue

    const id = unscopedPluginIdFromPackageName(dep.name)
    if (seen.has(id)) {
      console.warn(
        `[PluginLoader] Skipping npm plugin "${dep.name}": plugin id "${id}" is already taken `
        + '(two packages resolve to the same plugin id — later one loses)',
      )
      continue
    }
    const definition = parsePluginDirectory<TEntry>({
      id,
      dirPath,
      enabled: input.getEnabled(id),
      source: 'user',
      appVersion: input.appVersion,
      needsInstallCheck: false,
    })
    if (!definition) continue
    const installedVersion = readInstalledPackageVersion(dirPath)
    if (installedVersion) {
      definition.manifest = { ...definition.manifest, version: installedVersion }
    }
    plugins.push(definition)
    seen.add(definition.id)
  }

  return plugins
}

/**
 * legacy 兼容扫描:插件根下**有 plugin.json 且不在账里**的目录。
 *
 * 判别顺序(§5.4):有 plugin.json = legacy 代码目录(其数据仍在
 * plugin-data/<id>/,不搬);没有 = 纯数据家目录(P1-1),跳过。
 * legacy 形态保留 needsInstall 探测与首载安装机器,直到清零。
 */
export function scanLegacyPluginDirectories<TEntry = unknown>(input: {
  pluginsDir: string
  seenIds?: Set<string>
  getEnabled: (pluginId: string) => boolean
  appVersion?: string
}): CorePluginDefinition<TEntry>[] {
  let entries: fs.Dirent[]
  try {
    if (!fs.statSync(input.pluginsDir).isDirectory()) return []
    entries = fs.readdirSync(input.pluginsDir, { withFileTypes: true })
  } catch {
    return []
  }

  const plugins: CorePluginDefinition<TEntry>[] = []
  const seen = input.seenIds ?? new Set<string>()

  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue
    if (!entry.isDirectory()) {
      if (!entry.isSymbolicLink()) continue
      try {
        if (!fs.statSync(path.join(input.pluginsDir, entry.name)).isDirectory()) continue
      } catch {
        continue
      }
    }
    const dirPath = path.join(input.pluginsDir, entry.name)
    // 无 plugin.json = 纯数据家目录,不是插件。
    if (!fs.existsSync(path.join(dirPath, 'plugin.json'))) continue
    if (seen.has(entry.name)) {
      console.warn(`[PluginLoader] Skipping legacy plugin "${entry.name}": its id is already taken`)
      continue
    }
    const definition = parsePluginDirectory<TEntry>({
      id: entry.name,
      dirPath,
      enabled: input.getEnabled(entry.name),
      source: 'user',
      appVersion: input.appVersion,
    })
    if (definition) {
      definition.legacy = true
      console.warn(
        `[PluginLoader] Plugin "${entry.name}" is a legacy directory plugin `
        + '(reinstall it in npm form to get the update channel)',
      )
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
  /**
   * 扫描语义(默认 'directory',现状不变)。
   *
   * 'npm-ledger' = 以 plugins/package.json 为账扫 npm 插件,再补一轮
   * legacy 兼容扫描;desktop 传它,server 等只投影的宿主保持默认。
   */
  scanMode?: CorePluginScanMode
}): Array<CorePluginDefinition<TEntry>> {
  const seen = new Set(input.builtinPlugins.map(plugin => plugin.id))
  if (input.scanMode === 'npm-ledger') {
    return [
      ...input.builtinPlugins,
      ...scanPluginLedgerDirectories<TEntry>({
        pluginsDir: input.pluginsDir,
        seenIds: seen,
        getEnabled: input.getEnabled,
        appVersion: input.appVersion,
      }),
      ...scanLegacyPluginDirectories<TEntry>({
        pluginsDir: input.pluginsDir,
        seenIds: seen,
        getEnabled: input.getEnabled,
        appVersion: input.appVersion,
      }),
    ]
  }
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
