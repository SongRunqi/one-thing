/**
 * Plugin Manager — orchestrates plugin lifecycle.
 *
 * Scans ~/.onething/plugins/, loads each entry, wires up API, and
 * manages enable/disable/reload. Uses lazy initialization: plugins
 * are loaded when EventBus and StreamEngine are available.
 */

import { createPluginAPI, disposePlugin, type PluginState } from './api.js'
import { scanPlugins, loadPluginEntry, ensurePluginDirs, setPluginEnabled } from './loader.js'
import type { PluginDefinition, PluginCommandDefinition } from './types.js'

let bootstrapped = false
let manager: PluginManager | null = null

export interface PluginInfo {
  definition: PluginDefinition
  loaded: boolean
  commands: string[]
  error?: string
}

export class PluginManager {
  private plugins = new Map<string, PluginInfo>()
  private pluginStates = new Map<string, PluginState>()
  private eventBus: any = null
  private streamEngine: any = null

  /** Call after EventBus and StreamEngine are initialized */
  async initialize(eventBus: any, streamEngine: any): Promise<void> {
    this.eventBus = eventBus
    this.streamEngine = streamEngine

    await this.refreshPlugins()
  }

  private async loadPlugin(def: PluginDefinition): Promise<void> {
    if (!def.enabled) {
      this.plugins.set(def.id, {
        definition: def,
        loaded: false,
        commands: [],
      })
      return
    }

    console.log(`[PluginManager] Loading plugin: ${def.id}`)

    const entry = await loadPluginEntry(def)
    if (!entry) {
      this.plugins.set(def.id, {
        definition: def,
        loaded: false,
        commands: [],
        error: 'Failed to load entry module',
      })
      return
    }

    try {
      const { api, state } = createPluginAPI(def.id, this.eventBus, this.streamEngine)
      await entry(api)

      this.pluginStates.set(def.id, state)
      this.plugins.set(def.id, {
        definition: def,
        loaded: true,
        commands: Array.from(state.commands.keys()),
      })

      console.log(`[PluginManager] Plugin "${def.id}" loaded successfully (${state.commands.size} commands)`)
    } catch (err: any) {
      console.error(`[PluginManager] Plugin "${def.id}" failed:`, err)
      this.plugins.set(def.id, {
        definition: def,
        loaded: false,
        commands: [],
        error: err.message || 'Unknown error',
      })
    }
  }

  /** Disable and unload a plugin */
  async disablePlugin(pluginId: string): Promise<void> {
    const state = this.pluginStates.get(pluginId)
    if (state) {
      disposePlugin(state)
      this.pluginStates.delete(pluginId)
    }
    const info = this.plugins.get(pluginId)
    if (info) {
      info.definition.enabled = false
      info.loaded = false
      info.commands = []
      info.error = undefined
    }
    setPluginEnabled(pluginId, false)
    console.log(`[PluginManager] Disabled plugin: ${pluginId}`)
  }

  /** Enable or reload a plugin */
  async enablePlugin(pluginId: string): Promise<void> {
    const info = this.plugins.get(pluginId)
    if (!info) return
    if (info.loaded) await this.disablePlugin(pluginId)
    info.definition.enabled = true
    setPluginEnabled(pluginId, true)
    await this.loadPlugin(info.definition)
  }

  /** Rescan plugin definitions and reload according to persisted enabled state. */
  async refreshPlugins(): Promise<void> {
    for (const [id, state] of this.pluginStates) {
      try {
        disposePlugin(state)
      } catch (err) {
        console.error(`[PluginManager] Error disposing plugin "${id}":`, err)
      }
    }
    this.pluginStates.clear()
    this.plugins.clear()

    ensurePluginDirs()
    const definitions = scanPlugins()

    console.log(`[PluginManager] Found ${definitions.length} plugin(s)`)

    for (const def of definitions) {
      await this.loadPlugin(def)
    }
  }

  /** Get all plugin info */
  getPlugins(): PluginInfo[] {
    return Array.from(this.plugins.values())
  }

  /** Get commands from all loaded plugins */
  getPluginCommands(): Map<string, PluginCommandDefinition> {
    const all = new Map<string, PluginCommandDefinition>()
    for (const state of this.pluginStates.values()) {
      for (const [name, cmd] of state.commands) {
        all.set(name, cmd)
      }
    }
    return all
  }

  /** Get a plugin's command handler */
  getCommandHandler(commandName: string): PluginCommandDefinition | undefined {
    for (const state of this.pluginStates.values()) {
      if (state.commands.has(commandName)) {
        return state.commands.get(commandName)
      }
    }
    return undefined
  }

  /** Shutdown: dispose all plugins */
  shutdown(): void {
    for (const [id, state] of this.pluginStates) {
      try {
        disposePlugin(state)
      } catch (err) {
        console.error(`[PluginManager] Error disposing plugin "${id}":`, err)
      }
    }
    this.pluginStates.clear()
    this.plugins.clear()
  }
}

/**
 * Bootstrap the plugin system.
 * Must be called after EventBus and StreamEngine are initialized.
 * Idempotent — subsequent calls are no-ops.
 */
export async function bootstrapPluginSystem(
  eventBus: any,
  streamEngine: any,
): Promise<PluginManager> {
  if (bootstrapped) return manager!

  ensurePluginDirs()
  manager = new PluginManager()
  bootstrapped = true

  // Defer initialization so EventBus and StreamEngine are ready
  try {
    await manager.initialize(eventBus, streamEngine)
  } catch (err) {
    console.error('[PluginManager] Bootstrap failed:', err)
  }

  return manager
}

/** Get the singleton manager (null before bootstrap) */
export function getPluginManager(): PluginManager | null {
  return manager
}
