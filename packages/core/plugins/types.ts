import type { CorePluginRequestHandler } from './request-channel.js'

/**
 * 声明先于代码(设计文档 §4.2 宪法第 3 条)。
 *
 * `contributes` 是插件的**静态存在感**:宿主只读清单就能知道它会贡献什么,
 * 一行插件代码都不必执行。R2 只建类型与解析/校验/透出管道 —— 消费者在
 * R3(settings)与 R5(panels)。今天先立住形状,后面几期才不用回头改协议。
 *
 * 全段必须 JSON-可序列化(宪法第 2 条):它就住在 plugin.json 里。
 */
export interface PluginContributionCommand {
  name: string
  description?: string
  usage?: string
}

export interface PluginContributionPanel {
  id: string
  label: string
  icon?: string
}

/** 呈现提示:不给则由 schema 推导控件。 */
export interface PluginContributionSettingsUiHint {
  label?: string
  hint?: string
  /** 覆盖由 schema 推导出的控件;超出宿主控件集的值会被拒。 */
  control?: string
}

export interface PluginContributionSettings {
  title?: string
  /**
   * JSON Schema(不是 zod)—— 过线皆 JSON Schema,zod 只是插件侧书写糖。
   *
   * **它是这个插件配置的唯一事实源**(R3 裁决):没有运行期 registerSettings。
   * 宿主只读清单就能渲染配置区、校验、填默认值,一行插件代码都不执行 ——
   * 于是**未启用的插件也能配**。
   */
  schema?: Record<string, unknown>
  ui?: Record<string, PluginContributionSettingsUiHint>
}

export interface PluginContributionActivation {
  /** 懒激活的触发条件;R2 只解析不消费。 */
  events?: string[]
}

export interface PluginContributes {
  commands?: PluginContributionCommand[]
  panels?: PluginContributionPanel[]
  settings?: PluginContributionSettings
  permissions?: string[]
  activation?: PluginContributionActivation
}

export interface PluginManifest {
  name: string
  version: string
  description?: string
  entry?: string
  author?: string
  /** 语义化版本下界;低于它的宿主拒绝加载(R2 起真正生效)。 */
  minAppVersion?: string
  contributes?: PluginContributes
}

export type PluginSource = 'builtin' | 'user'

export interface CorePluginDefinition<TEntry = unknown> {
  id: string
  source?: PluginSource
  manifest: PluginManifest
  dirPath: string
  entryPath: string
  entry?: TEntry
  enabled: boolean
  needsInstall?: boolean
  error?: string
  /**
   * 扫描期就判定的"不该加载"原因:非法 contributes、minAppVersion 不满足。
   * 置位后 manager 直接把插件放进 error 态,**不执行任何插件代码** ——
   * 声明层的问题不该等到运行期才发作。
   */
  loadBlockedReason?: string
}

/**
 * 落盘的运行期健康。
 *
 * 只存"为什么"这一半:enabled:false 本来就持久化,但原因纯在内存里,重启之后
 * 插件就变成了"无因禁用"——用户看到一个自己没关过的开关是关的,没有任何解释。
 * 连败计数不落盘:它是本次进程的观察,跨重启累加没有意义。
 */
export interface PersistedPluginHealth {
  status: 'degraded' | 'disabled'
  lastError?: string
  lastErrorScope?: string
  lastErrorAt?: number
  disabledReason?: string
}

export interface PluginSettings {
  enabled?: Record<string, boolean>
  health?: Record<string, PersistedPluginHealth>
  /**
   * 插件自有配置,与 enabled/health 平级住在同一个 plugin-settings 文件里。
   *
   * 存的是**原始值**;读取路径做校验 + 默认值填充,写入路径做校验 + 剥未知键。
   * 存量非法值回退默认并 warn(zod .catch 语义)—— 不发明迁移框架。
   */
  config?: Record<string, Record<string, unknown>>
}

export interface CorePluginStoreData {
  [key: string]: unknown
}

export type PluginPermissionGuard =
  | 'safe'
  | 'sandboxed'
  | 'internal-check'
  | 'permission-gated'
  | 'external'

export interface CorePluginToolContext<TMetadata = unknown> {
  sessionId: string
  messageId: string
  toolCallId: string
  workingDirectory?: string
  abortSignal?: AbortSignal
  metadata(input: { title?: string; metadata?: Partial<TMetadata> }): void
}

export interface CorePluginToolResult<TMetadata = unknown> {
  title: string
  output: string
  metadata: TMetadata
}

export interface CorePluginToolDefinition<
  TParameters = unknown,
  TArgs = unknown,
  TContext = CorePluginToolContext,
  TResult = CorePluginToolResult,
> {
  name: string
  description: string
  parameters: TParameters
  execute(args: TArgs, ctx: TContext): Promise<TResult>
  permissionGuard?: PluginPermissionGuard
}

export interface CorePluginCommandContext {
  sessionId: string
  cwd?: string
  steer(content: string): void
  followUp(content: string): void
  notify(message: string, level?: 'info' | 'warn' | 'error'): void
  exec(command: string, args?: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }>
}

export interface CorePluginCommandDefinition<TContext = CorePluginCommandContext> {
  name: string
  description?: string
  usage?: string
  handler(args: string, ctx: TContext): Promise<void>
}

export interface CorePluginSchedulerAPI<
  TTaskRegistration,
  TTaskHandle,
  TTaskSnapshot,
  TRunOptions,
  TRunRecord,
> {
  register(task: TTaskRegistration): TTaskHandle
  getStatus(id: string): TTaskSnapshot | undefined
  list(): TTaskSnapshot[]
  refresh(id: string): TTaskSnapshot | undefined
  runNow(id: string, options?: TRunOptions): Promise<TRunRecord>
  setEnabled(id: string, enabled: boolean): TTaskSnapshot | undefined
}

export type CorePluginEventHandler = (envelope: {
  sessionId: string
  sequence: number
  timestamp: number
  event: { type: string; [key: string]: unknown }
}) => Promise<void> | void

export interface CorePluginStore {
  get<T = unknown>(key: string): T | undefined
  set<T = unknown>(key: string, value: T): void
  delete(key: string): void
  keys(): string[]
}

export interface MinimalCorePluginUI {
  notify(message: string, level?: 'info' | 'warn' | 'error'): void
}

export interface CorePluginAPI<
  TTool,
  TEventHandler,
  TCommandOptions,
  TPromptContextProvider,
  TBeforeContextCompactHook,
  TAfterAssistantResponseHook,
  TSkillRootProvider,
  TStore,
  TScheduler,
  TUI = MinimalCorePluginUI,
  TRequestHandler = CorePluginRequestHandler,
> {
  readonly id: string
  registerTool(tool: TTool): void
  on(eventType: string, handler: TEventHandler): () => void
  steer(sessionId: string, content: string): void
  followUp(sessionId: string, content: string): void
  registerCommand(name: string, options: TCommandOptions): void
  registerPromptContextProvider(id: string, provider: TPromptContextProvider): void
  beforeContextCompact(id: string, hook: TBeforeContextCompactHook): void
  afterAssistantResponse(id: string, hook: TAfterAssistantResponseHook): void
  registerSkillRoot(provider: TSkillRootProvider): void
  /**
   * 统一请求通道:UI 侧 `platformApi.pluginRequest(pluginId, action, payload)`
   * 落到这里。payload 与返回值都必须 JSON-可序列化(宪法第 2 条),
   * 它们过的是一条将来会变成 RPC 的边界。
   */
  registerRequestHandler(action: string, handler: TRequestHandler): void
  /** 插件自定义事件。投递名 = `plugin:<pluginId>:<name>`。 */
  events: {
    emit(eventName: string, payload?: unknown): void
  }
  /**
   * 插件自有配置的**访问面**(R3 裁决:不是注册面)。
   *
   * schema 的唯一事实源是 manifest 的 `contributes.settings.schema`;
   * 这里拿到的是宿主已校验、已填默认值的**冻结快照**(而不是活引用 ——
   * 同步跨进程读取在 H 线硬隔离后不可能成立,快照语义现在就定死)。
   */
  settings: {
    get<T = Record<string, unknown>>(): T
    onChange(callback: (config: Record<string, unknown>) => void): () => void
  }
  onDispose(callback: () => void): void
  store: TStore
  scheduler: TScheduler
  ui: TUI
}

export type CorePluginEntry<TAPI> = (api: TAPI) => void | Promise<void>
