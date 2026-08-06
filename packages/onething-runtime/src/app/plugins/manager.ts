/**
 * Plugin Manager — main-process adapter around the headless core manager.
 */

import {
  CorePluginBootstrapper,
  CorePluginManager,
  type CorePluginInfo,
  type CorePluginManagerHost,
} from '@onething/core/plugins'
import { createPluginAPI, disposePlugin, type PluginState } from './api.js'
import {
  archiveCorePluginData,
  findCorePluginDataOrphans,
} from '@onething/core/plugins'
import {
  scanPlugins,
  loadPluginEntry,
  clearPluginSettingsKeys,
  ensurePluginDirs,
  getPluginDataRoot,
  loadPersistedPluginHealth,
  persistPluginHealth,
  readPluginConfig,
  removePluginSourceDir,
  setPluginEnabled,
  writePluginConfig,
} from './loader.js'
import { configurePluginConfigHost, invalidatePluginConfigCache } from './config.js'
import { configurePluginConfigBroadcast } from './config-access.js'
import {
  clearPluginRuntimeHealth,
  configurePluginHealthHost,
  getPluginRuntimeHealth,
  reportPluginRuntimeFailure,
  reportPluginRuntimeSuccess,
  restorePluginRuntimeHealth,
} from './health.js'
import type { PluginAPI, PluginDefinition, PluginEntry, PluginCommandDefinition } from './types.js'

export interface PluginManagerContext {
  eventBus: any
  streamEngine: any
}

export type PluginInfo = CorePluginInfo<PluginEntry, PluginDefinition>

function createHost(): CorePluginManagerHost<
  PluginDefinition,
  PluginEntry,
  PluginAPI,
  PluginState,
  PluginCommandDefinition,
  PluginManagerContext
> {
  return {
    ensurePluginDirs,
    scanPlugins,
    loadPluginEntry: (definition, reloadToken) => loadPluginEntry(definition, reloadToken),
    createPluginAPI(pluginId, context) {
      return createPluginAPI(pluginId, context.eventBus, context.streamEngine)
    },
    disposePlugin,
    setPluginEnabled,
    getPluginHealth: getPluginRuntimeHealth,
    // 请求通道的失败/成功进 R1 的熔断账(scope = `request:<action>`)。
    // 少了这条线,R3/R5 的 UI 轮询一个必败 action 会无限连败而插件永远 Active。
    onRequestFailure: reportPluginRuntimeFailure,
    onRequestSuccess: reportPluginRuntimeSuccess,
    // ── R4:数据目录与卸载 ──
    archivePluginData: pluginId => archiveCorePluginData(getPluginDataRoot(), pluginId),
    removePluginSource: definition => removePluginSourceDir(definition.dirPath, definition.id),
    clearPluginSettings: pluginId => {
      clearPluginSettingsKeys(pluginId)
      // 配置缓存跟着盘上的事实走,否则卸载后重装会读到上一世的值。
      invalidatePluginConfigCache(pluginId)
      clearPluginRuntimeHealth(pluginId)
    },
    archiveOrphanPluginData: knownPluginIds => {
      const dataRoot = getPluginDataRoot()
      const archived: string[] = []
      for (const orphan of findCorePluginDataOrphans(dataRoot, knownPluginIds)) {
        const result = archiveCorePluginData(dataRoot, orphan.pluginId)
        if (result.archived) {
          archived.push(orphan.pluginId)
          console.warn(
            `[PluginManager] "${orphan.pluginId}" has plugin data but is no longer installed `
            + `(${orphan.kind}); archived to ${result.archivePath}`,
          )
        } else if (result.error) {
          console.error(`[PluginManager] Failed to archive orphaned data for "${orphan.pluginId}": ${result.error}`)
        }
      }
      return archived
    },
  }
}

export class PluginManager extends CorePluginManager<
  PluginAPI,
  PluginEntry,
  PluginCommandDefinition,
  PluginState,
  PluginDefinition,
  PluginManagerContext
> {
  constructor() {
    super(createHost())
  }

  /** Call after EventBus and StreamEngine are initialized */
  async initialize(context: PluginManagerContext): Promise<void>
  async initialize(eventBus: any, streamEngine: any): Promise<void>
  async initialize(eventBusOrContext: any, streamEngine?: any): Promise<void> {
    const context = streamEngine === undefined
      ? eventBusOrContext as PluginManagerContext
      : { eventBus: eventBusOrContext, streamEngine }

    // 熔断器要能真的禁用插件并通知用户 —— core 不认识 EventBus,这条线只能在
    // 这里接上(late-bound host port,与 configure*Host 同构)。
    configurePluginHealthHost({
      disablePlugin: pluginId => this.disablePlugin(pluginId),
      notify: (pluginId, message) => {
        context.eventBus?.emitGlobal?.({
          type: 'plugin:notification',
          pluginId,
          message,
          level: 'error',
        })
      },
      persistHealth: persistPluginHealth,
      loadPersistedHealth: loadPersistedPluginHealth,
    })
    // 配置的 schema 单源是 manifest —— 这里把"去哪儿读 manifest / 去哪儿读写盘"
    // 两件宿主事实接给 config 层,它才不必认识 loader 或 manager。
    configurePluginConfigHost({
      getSettingsContribution: pluginId => this.getPlugins()
        .find(info => info.definition.id === pluginId)
        ?.definition.manifest.contributes?.settings,
      readConfig: readPluginConfig,
      writeConfig: writePluginConfig,
    })
    configurePluginConfigBroadcast(pluginId => {
      context.eventBus?.emitGlobal?.({
        type: 'plugin:notification',
        pluginId,
        message: `plugin-config-changed:${pluginId}`,
        level: 'info',
        kind: 'config-changed',
      })
    })
    // 回灌必须在扫描/加载之前:上一轮被熔断禁用的插件,这次启动要带着原因出现。
    restorePluginRuntimeHealth()

    await super.initialize(context)
  }
}

const pluginBootstrapper = new CorePluginBootstrapper<PluginManager, PluginManagerContext>({
  ensurePluginDirs,
  createManager: () => new PluginManager(),
  initializeManager: (manager, context) => manager.initialize(context),
  logger: console,
})

/**
 * Bootstrap the plugin system.
 * Must be called after EventBus and StreamEngine are initialized.
 * Idempotent — subsequent calls are no-ops.
 */
export async function bootstrapPluginSystem(
  eventBus: any,
  streamEngine: any,
): Promise<PluginManager> {
  return pluginBootstrapper.bootstrap({ eventBus, streamEngine })
}

/** Get the singleton manager (null before bootstrap) */
export function getPluginManager(): PluginManager | null {
  return pluginBootstrapper.getManager()
}
