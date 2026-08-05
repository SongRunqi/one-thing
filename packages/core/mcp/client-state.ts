import {
  toJsonSchemaObject,
  toJsonValue,
  type JsonArray,
  type JsonObject,
  type JsonValue,
} from '../json.js'
import { normalizeMCPContent } from './content.js'
import type {
  MCPConnectionStatus,
  MCPPromptInfo,
  MCPResourceInfo,
  MCPServerConfig,
  MCPServerState,
  MCPToolCallResult,
  MCPToolInfo,
  MCPTransportType,
} from './types.js'

export interface CoreMCPLogger {
  log?: (...args: unknown[]) => void
  warn?: (...args: unknown[]) => void
  error?: (...args: unknown[]) => void
}

export interface RawMCPTool {
  name?: unknown
  description?: unknown
  inputSchema?: unknown
}

export interface RawMCPResource {
  uri?: unknown
  name?: unknown
  description?: unknown
  mimeType?: unknown
}

export interface RawMCPPrompt {
  name?: unknown
  description?: unknown
  arguments?: unknown
}

export interface RawMCPToolCallResult {
  content?: unknown
  isError?: unknown
}

export type CoreMCPTransportPlan =
  | {
      transport: 'stdio'
      command: string
      args: string[]
      env?: Record<string, string>
      cwd?: string
      timeoutMs: number
      logMessage: string
    }
  | {
      transport: 'sse'
      url: string
      headers?: Record<string, string>
      timeoutMs: number
      logMessage: string
    }

export interface CoreMCPClientOperations {
  listTools(): Promise<{ tools?: unknown }>
  listResources(): Promise<{ resources?: unknown }>
  listPrompts(): Promise<{ prompts?: unknown }>
  callTool(input: { name: string; arguments: JsonObject }): Promise<unknown>
  readResource(input: { uri: string }): Promise<{ contents?: unknown }>
  getPrompt(input: { name: string; arguments?: Record<string, string> }): Promise<{ messages?: unknown }>
}

export interface CoreMCPRefreshCapabilitiesResult {
  tools: MCPToolInfo[]
  resources: MCPResourceInfo[]
  prompts: MCPPromptInfo[]
}

export interface CoreMCPConnectAdapters<TClient, TTransport> {
  createTransport(plan: CoreMCPTransportPlan): TTransport | Promise<TTransport>
  createClient(): TClient
  connectClient(client: TClient, transport: TTransport): Promise<void>
  refreshCapabilities(serverId: string, client: TClient, logger?: CoreMCPLogger): Promise<CoreMCPRefreshCapabilitiesResult>
  onStateChange?: (state: MCPServerState) => void
  logger?: CoreMCPLogger
  now?: () => number
}

export interface ConnectMCPClientWithAdaptersOptions<TClient, TTransport> {
  state: MCPServerState
  client: TClient | null
  transport: TTransport | null
  baseEnv: Record<string, string | undefined>
  adapters: CoreMCPConnectAdapters<TClient, TTransport>
}

export interface ConnectMCPClientResult<TClient, TTransport> {
  state: MCPServerState
  client: TClient | null
  transport: TTransport | null
  alreadyConnected: boolean
}

export interface DisconnectMCPClientAdapters<TClient, TTransport> {
  closeClient(client: TClient): Promise<void>
  closeTransport(transport: TTransport): Promise<void>
  logger?: CoreMCPLogger
}

export interface DisconnectMCPClientWithAdaptersOptions<TClient, TTransport> {
  state: MCPServerState
  client: TClient | null
  transport: TTransport | null
  adapters: DisconnectMCPClientAdapters<TClient, TTransport>
}

export interface DisconnectMCPClientResult {
  state: MCPServerState
  client: null
  transport: null
}

export interface UpdateMCPClientConfigAdapters<TClient, TTransport>
  extends CoreMCPConnectAdapters<TClient, TTransport>,
    DisconnectMCPClientAdapters<TClient, TTransport> {}

export interface UpdateMCPClientConfigWithAdaptersOptions<TClient, TTransport> {
  state: MCPServerState
  client: TClient | null
  transport: TTransport | null
  config: MCPServerConfig
  baseEnv: Record<string, string | undefined>
  adapters: UpdateMCPClientConfigAdapters<TClient, TTransport>
}

export interface UpdateMCPClientConfigResult<TClient, TTransport> {
  state: MCPServerState
  client: TClient | null
  transport: TTransport | null
  wasConnected: boolean
  reconnected: boolean
}

export function mcpClientNotConnectedResult<TResult extends { success: boolean; error?: string }>(
  error = 'Client not connected',
): TResult {
  return {
    success: false,
    error,
  } as TResult
}

export async function runMCPConnectedClientOperation<TClient, TResult extends { success: boolean; error?: string }>(
  client: TClient | null,
  operation: (client: TClient) => Promise<TResult>,
  notConnectedResult: TResult = mcpClientNotConnectedResult<TResult>(),
): Promise<TResult> {
  if (!client) return notConnectedResult
  return operation(client)
}

export function createMCPServerState(config: MCPServerConfig): MCPServerState {
  return {
    config,
    status: 'disconnected',
    tools: [],
    resources: [],
    prompts: [],
  }
}

export function setMCPServerStatus(
  state: MCPServerState,
  status: MCPConnectionStatus,
  options: { error?: string; connectedAt?: number } = {},
): MCPServerState {
  return {
    ...state,
    status,
    error: options.error,
    connectedAt: options.connectedAt,
  }
}

export function markMCPServerConnected(
  state: MCPServerState,
  connectedAt: number = Date.now(),
): MCPServerState {
  return {
    ...state,
    status: 'connected',
    error: undefined,
    connectedAt,
  }
}

export function markMCPServerDisconnected(state: MCPServerState): MCPServerState {
  return {
    ...state,
    status: 'disconnected',
    error: undefined,
    tools: [],
    resources: [],
    prompts: [],
    connectedAt: undefined,
  }
}

export function markMCPServerError(state: MCPServerState, error: unknown): MCPServerState {
  return {
    ...state,
    status: 'error',
    error: errorMessage(error, 'Unknown connection error'),
  }
}

export function mcpConnectTimeoutMs(transport: MCPTransportType): number {
  return transport === 'sse' ? 30000 : 60000
}

export function mcpConnectionTimeoutMessage(timeoutMs: number): string {
  return `Connection timeout after ${timeoutMs / 1000}s`
}

export function mcpToolCallTimeoutMessage(toolName: string, timeoutMs: number): string {
  return `MCP tool call "${toolName}" timed out after ${timeoutMs / 1000}s`
}

export function mcpTimeoutMessage(action: string, timeoutMs: number): string {
  return `${action} timed out after ${timeoutMs / 1000}s`
}

export function errorMessage(error: unknown, fallback = 'Unknown error'): string {
  return error instanceof Error ? error.message : String(error ?? fallback)
}

export function filterStringEnvironment(
  env: Record<string, string | undefined>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(env).filter((entry): entry is [string, string] => entry[1] !== undefined),
  )
}

/**
 * Host variables an MCP child process may inherit.
 *
 * Deliberately tiny and secret-free. The transport SDK already supplies its own
 * safe base (HOME/PATH/SHELL/TERM/USER on POSIX); these are the ones whose
 * absence fails invisibly — a stdio server behind a corporate proxy silently
 * cannot reach the network, with no error that points at the env.
 *
 * Anything else a server needs is declared per-server in its `env` config.
 */
export const MCP_INHERITED_ENV_VARS = [
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'ALL_PROXY',
  'NO_PROXY',
  'http_proxy',
  'https_proxy',
  'all_proxy',
  'no_proxy',
  'LANG',
  'LC_ALL',
] as const

export function inheritableMCPEnvironment(
  baseEnv: Record<string, string | undefined>,
): Record<string, string> {
  const inherited: Record<string, string> = {}
  for (const key of MCP_INHERITED_ENV_VARS) {
    const value = baseEnv[key]
    if (value !== undefined) inherited[key] = value
  }
  return inherited
}

/**
 * NEVER spread the host environment wholesale here. Doing so handed every
 * third-party MCP child process the full `process.env` — provider API keys,
 * OAuth tokens, ONETHING_* config — and it did so only when the user happened
 * to set one unrelated custom variable, which made the leak both total and
 * invisible.
 */
export function mergeMCPEnvironment(
  baseEnv: Record<string, string | undefined>,
  customEnv?: Record<string, string>,
): Record<string, string> {
  return {
    ...inheritableMCPEnvironment(baseEnv),
    ...customEnv,
  }
}

export function buildMCPTransportPlan(
  config: MCPServerConfig,
  baseEnv: Record<string, string | undefined>,
): CoreMCPTransportPlan {
  const timeoutMs = mcpConnectTimeoutMs(config.transport)

  if (config.transport === 'stdio') {
    const { command, args = [], env, cwd } = config
    if (!command) {
      throw new Error('Command is required for stdio transport')
    }
    return {
      transport: 'stdio',
      command,
      args,
      env: mergeMCPEnvironment(baseEnv, env),
      cwd,
      timeoutMs,
      logMessage: `Connecting via stdio: ${command} ${args.join(' ')}`,
    }
  }

  const { url, headers } = config
  if (!url) {
    throw new Error('URL is required for SSE transport')
  }
  return {
    transport: 'sse',
    url,
    headers,
    timeoutMs,
    logMessage: `Connecting via SSE: ${url}`,
  }
}

export async function connectMCPClientWithAdapters<TClient, TTransport>(
  options: ConnectMCPClientWithAdaptersOptions<TClient, TTransport>,
): Promise<ConnectMCPClientResult<TClient, TTransport>> {
  const { adapters } = options
  const logger = adapters.logger ?? console
  const serverId = options.state.config.id

  if (options.state.status === 'connected') {
    logger.log?.(`[MCP:${serverId}] Already connected`)
    return {
      state: options.state,
      client: options.client,
      transport: options.transport,
      alreadyConnected: true,
    }
  }

  let state = setMCPServerStatus(options.state, 'connecting')
  adapters.onStateChange?.(state)

  try {
    const plan = buildMCPTransportPlan(state.config, options.baseEnv)
    logger.log?.(`[MCP:${serverId}] ${plan.logMessage}`)

    const transport = await adapters.createTransport(plan)
    const client = adapters.createClient()
    await withMCPTimeout(
      adapters.connectClient(client, transport),
      plan.timeoutMs,
      mcpConnectionTimeoutMessage(plan.timeoutMs),
    )

    const capabilities = await adapters.refreshCapabilities(serverId, client, logger)
    state = markMCPServerConnected({
      ...state,
      tools: capabilities.tools,
      resources: capabilities.resources,
      prompts: capabilities.prompts,
    }, (adapters.now ?? Date.now)())
    adapters.onStateChange?.(state)

    logger.log?.(`[MCP:${serverId}] Connected successfully`)
    logger.log?.(`[MCP:${serverId}] Tools: ${state.tools.length}, Resources: ${state.resources.length}, Prompts: ${state.prompts.length}`)
    return {
      state,
      client,
      transport,
      alreadyConnected: false,
    }
  } catch (error) {
    state = markMCPServerError(state, error)
    adapters.onStateChange?.(state)
    logger.error?.(`[MCP:${serverId}] Connection failed:`, error)
    throw error
  }
}

export async function disconnectMCPClientWithAdapters<TClient, TTransport>(
  options: DisconnectMCPClientWithAdaptersOptions<TClient, TTransport>,
): Promise<DisconnectMCPClientResult> {
  const logger = options.adapters.logger ?? console
  const serverId = options.state.config.id

  if (options.client) {
    try {
      await options.adapters.closeClient(options.client)
    } catch (error) {
      logger.warn?.(`[MCP:${serverId}] Error during disconnect:`, error)
    }
  }

  if (options.transport) {
    try {
      await options.adapters.closeTransport(options.transport)
    } catch (error) {
      logger.warn?.(`[MCP:${serverId}] Error closing transport:`, error)
    }
  }

  const state = markMCPServerDisconnected(options.state)
  logger.log?.(`[MCP:${serverId}] Disconnected`)
  return {
    state,
    client: null,
    transport: null,
  }
}

export async function updateMCPClientConfigWithAdapters<TClient, TTransport>(
  options: UpdateMCPClientConfigWithAdaptersOptions<TClient, TTransport>,
): Promise<UpdateMCPClientConfigResult<TClient, TTransport>> {
  const wasConnected = options.state.status === 'connected'
  // Converge to the state the config asks for, not to the one we happen to be
  // in. Mirroring the current state meant a client that existed but was not
  // connected never reconnected: toggling a server off and back on, or fixing a
  // wrong command after a failed connect, left it disconnected/red until the
  // user manually hit reconnect (the manager keeps the client in its map after
  // a disconnect, so the "no client yet -> connect" path did not catch it).
  const shouldConnect = options.config.enabled
  let state = options.state
  let client = options.client
  let transport = options.transport

  if (wasConnected) {
    const disconnected = await disconnectMCPClientWithAdapters({
      state,
      client,
      transport,
      adapters: options.adapters,
    })
    state = disconnected.state
    client = disconnected.client
    transport = disconnected.transport
  }

  state = {
    ...state,
    config: options.config,
  }

  if (shouldConnect) {
    try {
      const connected = await connectMCPClientWithAdapters({
        state,
        client,
        transport,
        baseEnv: options.baseEnv,
        adapters: options.adapters,
      })
      return {
        state: connected.state,
        client: connected.client,
        transport: connected.transport,
        wasConnected,
        reconnected: !connected.alreadyConnected,
      }
    } catch (error) {
      // A failed reconnect must not fail the config update itself — the new
      // config is already persisted by the caller, so throwing here would
      // report "save failed" for a save that actually happened. Surface it as
      // server state instead; connectMCPClientWithAdapters has already pushed
      // the error through onStateChange.
      return {
        state: markMCPServerError(state, error),
        client: null,
        transport: null,
        wasConnected,
        reconnected: false,
      }
    }
  }

  return {
    state,
    client,
    transport,
    wasConnected,
    reconnected: false,
  }
}

export function normalizeMCPToolInfos(serverId: string, tools: unknown): MCPToolInfo[] {
  if (!Array.isArray(tools)) return []
  return tools.flatMap(tool => {
    const normalized = normalizeMCPToolInfo(serverId, tool)
    return normalized ? [normalized] : []
  })
}

export function normalizeMCPToolInfo(serverId: string, tool: RawMCPTool | unknown): MCPToolInfo | null {
  if (!tool || typeof tool !== 'object') return null
  const raw = tool as RawMCPTool
  if (typeof raw.name !== 'string' || !raw.name.trim()) return null

  return {
    name: raw.name,
    description: typeof raw.description === 'string' ? raw.description : undefined,
    inputSchema: { ...toJsonSchemaObject(raw.inputSchema || { type: 'object' }), type: 'object' },
    serverId,
  }
}

export function normalizeMCPResourceInfos(serverId: string, resources: unknown): MCPResourceInfo[] {
  if (!Array.isArray(resources)) return []
  return resources.flatMap(resource => {
    const normalized = normalizeMCPResourceInfo(serverId, resource)
    return normalized ? [normalized] : []
  })
}

export function normalizeMCPResourceInfo(serverId: string, resource: RawMCPResource | unknown): MCPResourceInfo | null {
  if (!resource || typeof resource !== 'object') return null
  const raw = resource as RawMCPResource
  if (raw.uri === undefined) return null

  return {
    uri: String(raw.uri),
    name: typeof raw.name === 'string' ? raw.name : String(raw.uri),
    description: typeof raw.description === 'string' ? raw.description : undefined,
    mimeType: typeof raw.mimeType === 'string' ? raw.mimeType : undefined,
    serverId,
  }
}

export function normalizeMCPPromptInfos(serverId: string, prompts: unknown): MCPPromptInfo[] {
  if (!Array.isArray(prompts)) return []
  return prompts.flatMap(prompt => {
    const normalized = normalizeMCPPromptInfo(serverId, prompt)
    return normalized ? [normalized] : []
  })
}

export function normalizeMCPPromptInfo(serverId: string, prompt: RawMCPPrompt | unknown): MCPPromptInfo | null {
  if (!prompt || typeof prompt !== 'object') return null
  const raw = prompt as RawMCPPrompt
  if (typeof raw.name !== 'string' || !raw.name.trim()) return null

  return {
    name: raw.name,
    description: typeof raw.description === 'string' ? raw.description : undefined,
    arguments: normalizeMCPPromptArguments(raw.arguments),
    serverId,
  }
}

export function normalizeMCPPromptArguments(args: unknown): MCPPromptInfo['arguments'] {
  if (!Array.isArray(args)) return undefined
  return args.flatMap(arg => {
    if (!arg || typeof arg !== 'object') return []
    const record = arg as { name?: unknown; description?: unknown; required?: unknown }
    if (typeof record.name !== 'string' || !record.name.trim()) return []
    return [{
      name: record.name,
      description: typeof record.description === 'string' ? record.description : undefined,
      required: record.required === true,
    }]
  })
}

export function normalizeMCPToolCallSuccessResult(raw: RawMCPToolCallResult | unknown): MCPToolCallResult {
  const record = raw && typeof raw === 'object'
    ? raw as RawMCPToolCallResult
    : {}
  return {
    success: true,
    content: normalizeMCPContent(Array.isArray(record.content)
      ? record.content.filter((item): item is object => item !== null && typeof item === 'object')
      : undefined),
    isError: record.isError === true,
  }
}

export function normalizeMCPResourceReadContent(contents: unknown): JsonValue | undefined {
  return toJsonValue(contents)
}

export function normalizeMCPPromptMessages(messages: unknown): JsonArray | undefined {
  const value = toJsonValue(messages)
  return Array.isArray(value) ? value : undefined
}

export async function refreshMCPClientCapabilities(
  serverId: string,
  client: Pick<CoreMCPClientOperations, 'listTools' | 'listResources' | 'listPrompts'>,
  logger?: CoreMCPLogger,
): Promise<CoreMCPRefreshCapabilitiesResult> {
  let tools: MCPToolInfo[] = []
  let resources: MCPResourceInfo[] = []
  let prompts: MCPPromptInfo[] = []

  try {
    const toolsResult = await client.listTools()
    tools = normalizeMCPToolInfos(serverId, toolsResult.tools)
  } catch (error) {
    logger?.warn?.(`[MCP:${serverId}] Failed to list tools:`, error)
  }

  try {
    const resourcesResult = await client.listResources()
    resources = normalizeMCPResourceInfos(serverId, resourcesResult.resources)
  } catch (error) {
    logger?.warn?.(`[MCP:${serverId}] Failed to list resources:`, error)
  }

  try {
    const promptsResult = await client.listPrompts()
    prompts = normalizeMCPPromptInfos(serverId, promptsResult.prompts)
  } catch (error) {
    logger?.warn?.(`[MCP:${serverId}] Failed to list prompts:`, error)
  }

  return { tools, resources, prompts }
}

export async function withMCPTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export async function callMCPToolWithTimeout(
  client: Pick<CoreMCPClientOperations, 'callTool'>,
  toolName: string,
  args: JsonObject,
  timeoutMs: number,
): Promise<MCPToolCallResult> {
  try {
    const result = await withMCPTimeout(
      client.callTool({
        name: toolName,
        arguments: args,
      }),
      timeoutMs,
      mcpToolCallTimeoutMessage(toolName, timeoutMs),
    )
    return normalizeMCPToolCallSuccessResult(result)
  } catch (error) {
    return {
      success: false,
      error: errorMessage(error),
    }
  }
}

export async function readMCPResource(
  client: Pick<CoreMCPClientOperations, 'readResource'>,
  uri: string,
): Promise<{ success: boolean; content?: JsonValue; error?: string }> {
  try {
    const result = await client.readResource({ uri })
    return {
      success: true,
      content: normalizeMCPResourceReadContent(result.contents),
    }
  } catch (error) {
    return {
      success: false,
      error: errorMessage(error),
    }
  }
}

export async function getMCPPromptMessages(
  client: Pick<CoreMCPClientOperations, 'getPrompt'>,
  name: string,
  args?: Record<string, string>,
): Promise<{ success: boolean; messages?: JsonArray; error?: string }> {
  try {
    const result = await client.getPrompt({ name, arguments: args })
    return {
      success: true,
      messages: normalizeMCPPromptMessages(result.messages),
    }
  } catch (error) {
    return {
      success: false,
      error: errorMessage(error),
    }
  }
}
