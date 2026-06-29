export interface PluginManifest {
  name: string
  version: string
  description?: string
  entry?: string
  author?: string
  minAppVersion?: string
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
}

export interface PluginSettings {
  enabled?: Record<string, boolean>
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
  onDispose(callback: () => void): void
  store: TStore
  scheduler: TScheduler
  ui: TUI
}

export type CorePluginEntry<TAPI> = (api: TAPI) => void | Promise<void>
