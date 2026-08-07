/**
 * Plugin Loader — scans and loads plugins from disk.
 *
 * User plugins live under ~/.onething/plugins/{plugin-id}/.
 * Built-in plugins are statically bundled with the app.
 * Each plugin has a package.json with its own dependencies.
 * On install/first-load, `npm install` is run inside the plugin directory.
 */

import fs from 'fs'
import path from 'path'
import { pluginScope } from '@onething/core/plugins'
import { spawn } from 'child_process'
import { getOnethingPluginDataDir, getOnethingStorePath } from '@onething/runtime/storage'
import { pathExists } from '@onething/core/storage'
import {
  createBuiltinPluginDefinitions,
  ensureCorePluginsDir,
  getCorePluginSettingsPath,
  getCorePluginDataFootprint,
  getCorePluginsDir,
  getPluginConfigFromSettings,
  PLUGIN_SETTINGS_KEYS,
  getPluginEnabledWithAdapters,
  buildPluginEntryImportSpecifier,
  installCorePluginDependenciesAsync,
  listPluginHealthFromSettings,
  loadCorePluginEntry,
  readPluginSettingsFile,
  scanCorePlugins,
  setPluginConfigInSettings,
  setPluginEnabledWithAdapters,
  setPluginHealthInSettings,
  writePluginSettingsFile,
} from '@onething/core/plugins'
import type { CorePluginDataFootprint, PersistedPluginHealth } from '@onething/core/plugins'
import { getPluginAppVersion } from './app-version.js'
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

export function getPluginsDir(): string {
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

/** 把"为什么被禁"写进 plugin-settings(与 enabled 位同一个文件,同生共死)。 */
export function persistPluginHealth(pluginId: string, health: PersistedPluginHealth | null): void {
  writePluginSettings(setPluginHealthInSettings(readPluginSettings(), pluginId, health))
}

export function loadPersistedPluginHealth(): Array<{ pluginId: string; health: PersistedPluginHealth }> {
  return listPluginHealthFromSettings(readPluginSettings())
}

/** plugin-data 的根目录 —— 插件数据作用域是**全局 per-plugin**(R4 拍板)。 */
export function getPluginDataRoot(): string {
  return getOnethingPluginDataDir({ storePath: getOnethingStorePath() })
}

/**
 * 删除用户插件的源目录。
 *
 * 只删 `<store>/plugins/<id>/` 下的东西,且要求 dirPath 真的落在插件根里 ——
 * 一个手写坏了的 definition 不该把 rm -rf 指到别处。
 */
export function removePluginSourceDir(dirPath: string, pluginId: string): { removed: boolean; error?: string } {
  const pluginsDir = getPluginsDir()
  const expected = path.join(pluginsDir, pluginId)
  const resolved = path.resolve(dirPath)
  if (resolved !== path.resolve(expected)) {
    return { removed: false, error: `Refusing to remove "${resolved}": it is not ${expected}` }
  }
  if (!fs.existsSync(resolved)) return { removed: true }
  try {
    fs.rmSync(resolved, { recursive: true, force: true })
    return { removed: true }
  } catch (error) {
    return { removed: false, error: error instanceof Error ? error.message : String(error) }
  }
}

/**
 * 清掉 plugin-settings 里该插件的三键(PLUGIN_SETTINGS_KEYS)。
 * 名单与足迹共用一份常量 —— 加第四个键时不会只改一边。
 */
export function clearPluginSettingsKeys(pluginId: string): void {
  const settings = readPluginSettings()
  const enabled = { ...settings.enabled }
  delete enabled[pluginId]
  let next: PluginSettings = Object.keys(enabled).length > 0
    ? { ...settings, enabled }
    : (({ enabled: _dropped, ...rest }) => rest)(settings)
  next = setPluginConfigInSettings(next, pluginId, null)
  next = setPluginHealthInSettings(next, pluginId, null)
  writePluginSettings(next)
}

/** 这个插件在 plugin-settings 里实际占着哪几个键。 */
export function listPluginSettingsKeys(pluginId: string): string[] {
  const settings = readPluginSettings() as unknown as Record<string, Record<string, unknown> | undefined>
  return PLUGIN_SETTINGS_KEYS.filter(key => settings[key]?.[pluginId] !== undefined)
}

/** 一个插件的全部落盘足迹(宪法第 6 条数据侧)。 */
export function getPluginFootprint(pluginId: string): CorePluginDataFootprint {
  return getCorePluginDataFootprint(getPluginDataRoot(), pluginId, {
    settingsKeys: listPluginSettingsKeys(pluginId),
  })
}

/** 插件自有配置的原始值(未校验);校验与默认值填充在 config.ts。 */
export function readPluginConfig(pluginId: string): Record<string, unknown> {
  return getPluginConfigFromSettings(readPluginSettings(), pluginId)
}

export function writePluginConfig(pluginId: string, config: Record<string, unknown> | null): void {
  writePluginSettings(setPluginConfigInSettings(readPluginSettings(), pluginId, config))
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
/**
 * 某个插件在 manifest 里声明过的面板 id(R5)。
 *
 * 事实源是清单,不是活状态:面板注册发生在 entry 执行期间,那时插件还没进
 * pluginStates,只能从扫描结果里取。放在 loader 是因为 `scanPlugins` 在这里 ——
 * 让每个造 api 的地方各自去查清单,迟早会有一条路忘了查,然后把合法的注册
 * 判成"未声明"。
 *
 * **短 TTL 缓存**:`scanPlugins()` 会读一遍插件目录,而 createPluginAPI 是
 * per-plugin 调用的 —— N 个插件就是 N 次全盘扫描(启动期的 O(n²))。
 * 一次装配/一次刷新都发生在同一瞬间,一个很短的窗口就足以把它压回 O(n),
 * 又短到不会让"刚装上的插件"读到过期清单。
 */
const DECLARED_PANEL_IDS_TTL_MS = 1000
let declaredPanelIdsCache: { at: number; byPlugin: Map<string, string[]> } | null = null

export function getDeclaredPanelIds(pluginId: string): string[] {
  const now = Date.now()
  if (!declaredPanelIdsCache || now - declaredPanelIdsCache.at >= DECLARED_PANEL_IDS_TTL_MS) {
    const byPlugin = new Map<string, string[]>()
    for (const definition of scanPlugins()) {
      byPlugin.set(definition.id, definition.manifest.contributes?.panels?.map(panel => panel.id) ?? [])
    }
    declaredPanelIdsCache = { at: now, byPlugin }
  }
  return declaredPanelIdsCache.byPlugin.get(pluginId) ?? []
}

/**
 * 目录内容变了之后清缓存 —— 不等 TTL 自然过期。
 *
 * 接线的是 `refreshPlugins`(重扫目录)与卸载(删源目录)。**没有独立的"安装"
 * 入口**:装一个插件 = 往 plugins 目录里放一个目录,它进入系统的唯一路径就是
 * 下一次 refresh;`installPluginDeps` 跑的是 npm install,不动 manifest,
 * 因此与这份缓存无关。(R5 提交信息里"装/卸/刷新时失效"的"装"是措辞不准,
 * 此处按实际接线如实记录。)
 */
export function invalidateDeclaredPanelIdsCache(): void {
  declaredPanelIdsCache = null
}

export function scanPlugins(): PluginDefinition[] {
  return scanCorePlugins<PluginEntry>({
    builtinPlugins: getBuiltinPlugins(),
    pluginsDir: getPluginsDir(),
    getEnabled: pluginId => getPluginEnabled(pluginId),
    appVersion: getPluginAppVersion(),
  }) as PluginDefinition[]
}

export const PLUGIN_NPM_INSTALL_TIMEOUT_MS = 120_000

/**
 * Windows 上 `npm` 是 npm.cmd,而 spawn 不过 shell —— 直接 spawn('npm') 必 ENOENT。
 * 原来的 execSync 之所以能跑,是因为它走 shell 解析。仓库里其他 spawn 点
 * (tools/bash-executor.ts)也都带这条 win32 分支。
 */
const NPM_BIN = process.platform === 'win32' ? 'npm.cmd' : 'npm'

/**
 * 同一个插件目录的安装只跑一次。
 *
 * 安装窗口最长 120s,期间来第二次 refresh 就会对同一目录并发跑 npm install
 * (两个 npm 抢同一棵 node_modules,坏掉的方式很难看)。按 dirPath 复用在飞的
 * 那一次。
 */
const inFlightInstalls = new Map<string, Promise<string | null>>()

/**
 * Run `npm install` in the plugin directory — **异步**。
 *
 * 之前是 execSync(timeout 120s):一个带 package.json 的新插件能把整个主进程
 * 连同全部 IPC 冻住整整两分钟。spawn 之后事件循环继续转,期间插件状态是
 * installing(设置页可见)。
 */
export function installPluginDeps(dirPath: string, pluginId?: string): Promise<string | null> {
  const running = inFlightInstalls.get(dirPath)
  if (running) return running

  const install = installCorePluginDependenciesAsync(dirPath, {
    exists: pathExists,
    runInstall(pluginDir) {
      return new Promise<void>((resolve, reject) => {
        const child = spawn(NPM_BIN, ['install', '--no-audit', '--no-fund', '--loglevel=error'], {
          cwd: pluginDir,
          // stdout 没有消费者:留成 'pipe' 的话,一个话多的 postinstall 写满
          // 64KB 管道缓冲就会把 npm 自己阻塞住,最后被 120s SIGKILL 误判成超时。
          // stderr 要留着做失败原因,所以它必须被读走(下面的 'data' 监听)。
          stdio: ['ignore', 'ignore', 'pipe'],
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
          // 只留尾部:失败原因在末尾,而无上限的累加本身就是一个内存洞。
          stderr = (stderr + String(chunk)).slice(-8_000)
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
      if (error) markPluginLoadError(pluginId, pluginScope.install(), error)
      else reportPluginRuntimeSuccess(pluginId, pluginScope.install())
    },
  }).finally(() => {
    inFlightInstalls.delete(dirPath)
  })

  inFlightInstalls.set(dirPath, install)
  return install
}

/**
 * Load a plugin's entry module dynamically.
 *
 * `reloadToken` 走 ESM cache-buster:裸 import 会命中模块缓存,改一行插件代码
 * 就得重启整个 app。manager 每次 enable 递增它,于是 disable→enable 拿到的是
 * **新模块**。
 */
export async function loadPluginEntry(
  def: PluginDefinition,
  reloadToken?: string | number,
): Promise<PluginEntry | null> {
  return loadCorePluginEntry(def, {
    installDependencies: dirPath => installPluginDeps(dirPath, def.id),
    importEntry: entryPath => import(buildPluginEntryImportSpecifier(entryPath, reloadToken)),
    logger: console,
  })
}

/** Create the plugin directories if they don't exist */
export function ensurePluginDirs(): void {
  ensureCorePluginsDir(getPluginsDir(), console)
}
