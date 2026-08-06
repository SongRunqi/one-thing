import type { CorePluginDefinition } from './types.js'
import {
  CORE_PLUGIN_ENTRY_TIMEOUT_MS,
  CORE_PLUGIN_INSTALL_TIMEOUT_MS,
  runWithPluginTimeout,
  type CorePluginRuntimeHealth,
} from './runtime-guard.js'

export interface CorePluginInfo<
  TEntry = unknown,
  TDefinition extends CorePluginDefinition<TEntry> = CorePluginDefinition<TEntry>,
> {
  definition: TDefinition
  loaded: boolean
  commands: string[]
  error?: string
  /** 运行期健康(加载后才产生的失败:钩子超时、事件 handler 抛错、熔断)。 */
  health?: CorePluginRuntimeHealth
}

export interface CorePluginStateLike<TCommand = unknown> {
  commands: Map<string, TCommand>
}

export interface CorePluginManagerLogger {
  log(message: string): void
  error(message: string, error?: unknown): void
}

export interface CorePluginBootstrapperOptions<TManager, TContext> {
  ensurePluginDirs?(): void
  createManager(): TManager
  initializeManager(manager: TManager, context: TContext): Promise<void>
  logger?: Pick<CorePluginManagerLogger, 'error'>
}

export interface CorePluginManagerHost<
  TDefinition extends CorePluginDefinition<TEntry>,
  TEntry,
  TApi,
  TState extends CorePluginStateLike<TCommand>,
  TCommand,
  TContext,
> {
  ensurePluginDirs(): void
  scanPlugins(): TDefinition[]
  loadPluginEntry(definition: TDefinition): Promise<TEntry | null>
  createPluginAPI(pluginId: string, context: TContext): { api: TApi; state: TState }
  disposePlugin(state: TState): void
  setPluginEnabled(pluginId: string, enabled: boolean): void
  /** 运行期健康(app 层持有);getPlugins() 只是把它贴到插件信息上。 */
  getPluginHealth?(pluginId: string): CorePluginRuntimeHealth | undefined
}

export interface CorePluginManagerOptions {
  /** entry(api) 的超时预算;<=0 关闭。 */
  entryTimeoutMs?: number
}

export class CorePluginManager<
  TApi = unknown,
  TEntry extends ((api: TApi) => void | Promise<void>) = (api: TApi) => void | Promise<void>,
  TCommand = unknown,
  TState extends CorePluginStateLike<TCommand> = CorePluginStateLike<TCommand>,
  TDefinition extends CorePluginDefinition<TEntry> = CorePluginDefinition<TEntry>,
  TContext = unknown,
> {
  private plugins = new Map<string, CorePluginInfo<TEntry, TDefinition>>()
  private pluginStates = new Map<string, TState>()
  private context: TContext | null = null
  private refreshInFlight: Promise<void> | null = null
  private generation = 0

  constructor(
    private readonly host: CorePluginManagerHost<TDefinition, TEntry, TApi, TState, TCommand, TContext>,
    private readonly logger: CorePluginManagerLogger = console,
    private readonly options: CorePluginManagerOptions = {},
  ) {}

  async initialize(context: TContext): Promise<void> {
    this.context = context
    await this.refreshPlugins()
  }

  async disablePlugin(pluginId: string): Promise<void> {
    const state = this.pluginStates.get(pluginId)
    if (state) {
      this.host.disposePlugin(state)
      this.pluginStates.delete(pluginId)
    }

    const info = this.plugins.get(pluginId)
    if (info) {
      info.definition.enabled = false
      info.loaded = false
      info.commands = []
      info.error = undefined
    }

    this.host.setPluginEnabled(pluginId, false)
    this.logger.log(`[PluginManager] Disabled plugin: ${pluginId}`)
  }

  async enablePlugin(pluginId: string): Promise<void> {
    const info = this.plugins.get(pluginId)
    if (!info) return
    if (info.loaded) await this.disablePlugin(pluginId)
    info.definition.enabled = true
    this.host.setPluginEnabled(pluginId, true)
    await this.loadPlugin(info.definition)
  }

  /**
   * 逐插件隔离加载。
   *
   * 原先是 `for (…) await loadPlugin(def)`:一个 entry 挂住,排在它后面的插件
   * 全部装不上,连带把明文排在 plugin bootstrap 之后的 skills 一起卡死。现在
   * 每个插件各跑各的(各自带 entry 超时),一个坏插件只坏自己。
   *
   * 先按扫描顺序占位再并行加载 —— Map 的插入序即 UI 的展示序,不能被竞速打乱。
   */
  async refreshPlugins(): Promise<void> {
    // 单飞。
    //
    // 一轮 refresh 里带 npm install 的插件会占住最长 120s 的窗口;这段时间里
    // 再来一次 refresh(设置页的 Refresh 按钮、启用某插件)就会对同一个目录并发
    // 跑 npm install,而旧那一轮迟到的 loadPlugin 还会把 state 写进新一轮的表 ——
    // 事件订阅从此双份。第二个调用者直接复用在飞的那一次。
    if (this.refreshInFlight) return this.refreshInFlight

    this.refreshInFlight = this.doRefreshPlugins().finally(() => {
      this.refreshInFlight = null
    })
    return this.refreshInFlight
  }

  private async doRefreshPlugins(): Promise<void> {
    this.disposeAll()
    this.plugins.clear()
    // 代次推进:这一轮之前发出的 loadPlugin 迟到回来时会看到代次已变,自行退场。
    const generation = ++this.generation

    this.host.ensurePluginDirs()
    const definitions = this.host.scanPlugins()

    this.logger.log(`[PluginManager] Found ${definitions.length} plugin(s)`)

    for (const def of definitions) {
      this.plugins.set(def.id, { definition: def, loaded: false, commands: [] })
    }

    await Promise.all(definitions.map(def => this.loadPlugin(def, generation)))
  }

  getPlugins(): Array<CorePluginInfo<TEntry, TDefinition>> {
    return Array.from(this.plugins.values()).map(info => {
      const health = this.host.getPluginHealth?.(info.definition.id)
      return health ? { ...info, health } : info
    })
  }

  getPluginCommands(): Map<string, TCommand> {
    const all = new Map<string, TCommand>()
    for (const state of this.pluginStates.values()) {
      for (const [name, command] of state.commands) {
        all.set(name, command)
      }
    }
    return all
  }

  getCommandHandler(commandName: string): TCommand | undefined {
    for (const state of this.pluginStates.values()) {
      if (state.commands.has(commandName)) {
        return state.commands.get(commandName)
      }
    }
    return undefined
  }

  shutdown(): void {
    this.disposeAll()
    this.plugins.clear()
  }

  protected getPluginState(pluginId: string): TState | undefined {
    return this.pluginStates.get(pluginId)
  }

  protected setPluginInfo(pluginId: string, info: CorePluginInfo<TEntry, TDefinition>): void {
    this.plugins.set(pluginId, info)
  }

  private async loadPlugin(def: TDefinition, generation = this.generation): Promise<void> {
    /** 旧一轮迟到的加载不许写进新一轮的表。 */
    const stale = (): boolean => {
      if (generation === this.generation) return false
      this.logger.log(`[PluginManager] Dropping stale load of "${def.id}" (generation ${generation} → ${this.generation})`)
      return true
    }

    if (!def.enabled) {
      this.plugins.set(def.id, {
        definition: def,
        loaded: false,
        commands: [],
      })
      return
    }

    this.logger.log(`[PluginManager] Loading plugin: ${def.id}`)

    const entryTimeoutMs = this.options.entryTimeoutMs ?? CORE_PLUGIN_ENTRY_TIMEOUT_MS
    let entry: TEntry | null = null
    try {
      // **模块加载也要进预算。**
      //
      // 只包 entry(api) 是不够的:插件模块顶层写一句 `await new Promise(()=>{})`,
      // 挂住的是 `import()` 本身,refreshPlugins 的 Promise.all 于是永不 settle,
      // bootstrapPluginSystem 挂死,排在它后面的 skills 永不初始化 —— 正是这一期
      // 声称治好的那个病。
      //
      // 需要装依赖时预算里加上 npm install 那一段(它自己另有 120s 的 SIGKILL),
      // 免得把一次合法的安装误杀成超时。
      const loadBudgetMs = def.needsInstall
        ? CORE_PLUGIN_INSTALL_TIMEOUT_MS + entryTimeoutMs
        : entryTimeoutMs
      entry = await runWithPluginTimeout(
        `load:${def.id}`,
        loadBudgetMs,
        () => this.host.loadPluginEntry(def),
      )
    } catch (error) {
      if (stale()) return
      this.logger.error(`[PluginManager] Plugin "${def.id}" module load failed:`, error)
      this.plugins.set(def.id, {
        definition: def,
        loaded: false,
        commands: [],
        error: error instanceof Error ? error.message : 'Failed to load entry module',
      })
      return
    }

    if (stale()) return

    if (!entry) {
      this.plugins.set(def.id, {
        definition: def,
        loaded: false,
        commands: [],
        error: 'Failed to load entry module',
      })
      return
    }

    if (!this.context) {
      this.plugins.set(def.id, {
        definition: def,
        loaded: false,
        commands: [],
        error: 'Plugin manager is not initialized',
      })
      return
    }

    const { api, state } = this.host.createPluginAPI(def.id, this.context)
    try {
      // entry(api) 无超时是"一个坏插件卡住整队"的最后一环。超时不取消插件那一
      // 侧的工作,但宿主不再等它 —— 晚到的注册由 state 的 disposed 闸拦住。
      await runWithPluginTimeout(
        `entry:${def.id}`,
        entryTimeoutMs,
        () => entry!(api),
      )

      if (stale()) {
        this.host.disposePlugin(state)
        return
      }

      this.pluginStates.set(def.id, state)
      this.plugins.set(def.id, {
        definition: def,
        loaded: true,
        commands: Array.from(state.commands.keys()),
      })

      this.logger.log(`[PluginManager] Plugin "${def.id}" loaded successfully (${state.commands.size} commands)`)
    } catch (error) {
      this.logger.error(`[PluginManager] Plugin "${def.id}" failed:`, error)
      // 装到一半的注册要收掉,否则失败的插件仍在工具表/事件总线上留着半截足迹。
      // dispose 同时落下 disposed 闩:超时后恢复的 entry 再注册也进不来了。
      try {
        this.host.disposePlugin(state)
      } catch (disposeError) {
        this.logger.error(`[PluginManager] Error disposing half-loaded plugin "${def.id}":`, disposeError)
      }
      if (stale()) return
      this.plugins.set(def.id, {
        definition: def,
        loaded: false,
        commands: [],
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }

  private disposeAll(): void {
    for (const [id, state] of this.pluginStates) {
      try {
        this.host.disposePlugin(state)
      } catch (error) {
        this.logger.error(`[PluginManager] Error disposing plugin "${id}":`, error)
      }
    }
    this.pluginStates.clear()
  }
}

export class CorePluginBootstrapper<TManager, TContext> {
  private bootstrapped = false
  private manager: TManager | null = null

  constructor(private readonly options: CorePluginBootstrapperOptions<TManager, TContext>) {}

  async bootstrap(context: TContext): Promise<TManager> {
    if (this.bootstrapped && this.manager) {
      return this.manager
    }

    this.options.ensurePluginDirs?.()
    const manager = this.options.createManager()
    this.manager = manager
    this.bootstrapped = true

    try {
      await this.options.initializeManager(manager, context)
    } catch (error) {
      this.options.logger?.error?.('[PluginManager] Bootstrap failed:', error)
    }

    return manager
  }

  getManager(): TManager | null {
    return this.manager
  }

  isBootstrapped(): boolean {
    return this.bootstrapped
  }

  resetForTests(): void {
    this.bootstrapped = false
    this.manager = null
  }
}
