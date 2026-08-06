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
  scanPlugins,
  loadPluginEntry,
  ensurePluginDirs,
  loadPersistedPluginHealth,
  persistPluginHealth,
  setPluginEnabled,
} from './loader.js'
import {
  configurePluginHealthHost,
  getPluginRuntimeHealth,
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
