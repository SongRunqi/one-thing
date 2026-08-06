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
  decidePluginOrphanArchive,
  findCorePluginDataOrphans,
  restoreCorePluginDataArchive,
  scanPluginSourceEntries,
} from '@onething/core/plugins'
import {
  scanPlugins,
  loadPluginEntry,
  clearPluginSettingsKeys,
  ensurePluginDirs,
  getPluginDataRoot,
  getPluginsDir,
  invalidateDeclaredPanelIdsCache,
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
    // 面板声明由 createPluginAPI 自己现查清单 —— 这里不再中转一遍。
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
    removePluginSource: (definition) => {
      // 源目录没了,清单也就变了 —— 面板声明缓存必须跟着失效。
      invalidateDeclaredPanelIdsCache()
      return removePluginSourceDir(definition.dirPath, definition.id)
    },
    clearPluginSettings: pluginId => {
      clearPluginSettingsKeys(pluginId)
      // 配置缓存跟着盘上的事实走,否则卸载后重装会读到上一世的值。
      invalidatePluginConfigCache(pluginId)
      clearPluginRuntimeHealth(pluginId)
    },
    restorePluginDataArchive: (pluginId, archivePath) =>
      restoreCorePluginDataArchive(getPluginDataRoot(), pluginId, archivePath),
    getPluginSourceScan: () => scanPluginSourceEntries(getPluginsDir()),
    archiveOrphanPluginData: ({ knownPluginIds, scanTrusted, userPluginCount }) => {
      const dataRoot = getPluginDataRoot()
      const orphans = findCorePluginDataOrphans(dataRoot, knownPluginIds)

      // 自动归档的安全闸:扫描不可信 / 一个用户插件都没有 / 候选超阈值,
      // 一律不动手,改为请人来看。误归档一次就是把用户的数据从插件脚下搬走。
      const decision = decidePluginOrphanArchive({ orphans, scanTrusted, userPluginCount })
      if (!decision.proceed) {
        console.warn(
          `[PluginManager] Refusing to auto-archive ${orphans.length} orphan plugin data candidate(s) `
          + `(${orphans.map(orphan => orphan.pluginId).join(', ')}): ${decision.reason}. `
          + 'Nothing was moved; please check the plugins directory manually.',
        )
        return []
      }

      const archived: string[] = []
      for (const orphan of orphans) {
        const result = archiveCorePluginData(dataRoot, orphan.pluginId)
        if (result.archived) {
          archived.push(orphan.pluginId)
          // 孤儿的 plugin-settings 三键也是它的足迹 —— 数据搬走了键还留着,
          // 下一个同名插件装上来会继承一具前世的启停位与配置。
          clearPluginSettingsKeys(orphan.pluginId)
          invalidatePluginConfigCache(orphan.pluginId)
          clearPluginRuntimeHealth(orphan.pluginId)
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
  /** 目录变了要广播,而 core 不认识 EventBus —— initialize 时接上。 */
  private eventBus: { emitGlobal?(event: unknown): void } | null = null

  constructor() {
    super(createHost())
  }

  /**
   * 目录变更的机械信号。
   *
   * 插件系统是 post-window 非阻塞装配的,renderer 在 boot 时拉的那一次很可能拉了个
   * 空清单;而设置窗启停插件之后,主窗那份 nav 也不会自己更新(两个独立
   * BrowserWindow)。两个症状同一个成因:**目录变了没人说一声**。
   * 一条信号盖住两处 —— bootstrap 完成、启用、停用、刷新,统一发它。
   */
  private emitCatalogChanged(pluginId: string): void {
    this.eventBus?.emitGlobal?.({
      type: 'plugin:notification',
      pluginId,
      message: `plugin-catalog-changed:${pluginId}`,
      level: 'info',
      kind: 'catalog-changed',
    })
  }

  async enablePlugin(pluginId: string): Promise<void> {
    await super.enablePlugin(pluginId)
    this.emitCatalogChanged(pluginId)
  }

  async disablePlugin(pluginId: string): Promise<void> {
    await super.disablePlugin(pluginId)
    this.emitCatalogChanged(pluginId)
  }

  async refreshPlugins(): Promise<void> {
    // 刷新就是"重新看盘上有什么" —— 缓存的清单先作废。
    invalidateDeclaredPanelIdsCache()
    await super.refreshPlugins()
    this.emitCatalogChanged('*')
  }

  /** Call after EventBus and StreamEngine are initialized */
  async initialize(context: PluginManagerContext): Promise<void>
  async initialize(eventBus: any, streamEngine: any): Promise<void>
  async initialize(eventBusOrContext: any, streamEngine?: any): Promise<void> {
    const context = streamEngine === undefined
      ? eventBusOrContext as PluginManagerContext
      : { eventBus: eventBusOrContext, streamEngine }
    this.eventBus = context.eventBus ?? null

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
    // 装配完成才是 renderer 能看到真实清单的时刻 —— boot 时那一次拉的多半是空的。
    this.emitCatalogChanged('*')
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
