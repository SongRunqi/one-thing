import type { JsonArray, JsonObject, JsonValue } from '../json.js'
import {
  callMCPToolWithTimeout,
  connectMCPClientWithAdapters,
  createMCPServerState,
  disconnectMCPClientWithAdapters,
  getMCPPromptMessages,
  readMCPResource,
  refreshMCPClientCapabilities,
  runMCPConnectedClientOperation,
  updateMCPClientConfigWithAdapters,
  type CoreMCPLogger,
  type CoreMCPClientOperations,
  type CoreMCPRefreshCapabilitiesResult,
  type UpdateMCPClientConfigAdapters,
} from './client-state.js'
import type {
  MCPConnectionStatus,
  MCPServerConfig,
  MCPServerState,
  MCPToolCallResult,
} from './types.js'

export interface CoreMCPClientRuntimeAdapters<TClient extends CoreMCPClientOperations, TTransport>
  extends UpdateMCPClientConfigAdapters<TClient, TTransport> {}

export interface CoreMCPClientRuntimeOptions<TClient extends CoreMCPClientOperations, TTransport> {
  config: MCPServerConfig
  adapters: CoreMCPClientRuntimeAdapters<TClient, TTransport>
  getBaseEnv?: () => Record<string, string | undefined>
  toolCallTimeoutMs?: number
  logger?: CoreMCPLogger
}

export class CoreMCPClientRuntime<TClient extends CoreMCPClientOperations, TTransport> {
  private client: TClient | null = null
  private transport: TTransport | null = null
  private _state: MCPServerState
  private readonly adapters: CoreMCPClientRuntimeAdapters<TClient, TTransport>
  private readonly getBaseEnv: () => Record<string, string | undefined>
  private readonly toolCallTimeoutMs: number

  constructor(options: CoreMCPClientRuntimeOptions<TClient, TTransport>) {
    this._state = createMCPServerState(options.config)
    this.adapters = {
      ...options.adapters,
      logger: options.adapters.logger ?? options.logger,
      onStateChange: state => {
        this._state = state
        options.adapters.onStateChange?.(state)
      },
    }
    this.getBaseEnv = options.getBaseEnv ?? (() => ({}))
    this.toolCallTimeoutMs = options.toolCallTimeoutMs ?? 60000
  }

  get state(): MCPServerState {
    return { ...this._state }
  }

  get id(): string {
    return this._state.config.id
  }

  get status(): MCPConnectionStatus {
    return this._state.status
  }

  get currentClient(): TClient | null {
    return this.client
  }

  get currentTransport(): TTransport | null {
    return this.transport
  }

  async connect(): Promise<void> {
    const result = await connectMCPClientWithAdapters({
      state: this._state,
      client: this.client,
      transport: this.transport,
      baseEnv: this.getBaseEnv(),
      adapters: this.adapters,
    })
    this._state = result.state
    this.client = result.client
    this.transport = result.transport
  }

  async refreshCapabilities(): Promise<CoreMCPRefreshCapabilitiesResult> {
    if (!this.client) {
      throw new Error('Client not connected')
    }

    const capabilities = await refreshMCPClientCapabilities(
      this.id,
      this.client,
      this.adapters.logger,
    )
    this._state = {
      ...this._state,
      tools: capabilities.tools,
      resources: capabilities.resources,
      prompts: capabilities.prompts,
    }
    return capabilities
  }

  async callTool(
    toolName: string,
    args: JsonObject,
    options: { timeoutMs?: number } = {},
  ): Promise<MCPToolCallResult> {
    const timeoutMs = options.timeoutMs ?? this.toolCallTimeoutMs
    const logger = this.adapters.logger

    return runMCPConnectedClientOperation(this.client, async client => {
      logger?.log?.(`[MCP:${this.id}] Calling tool: ${toolName}`, args)
      const result = await callMCPToolWithTimeout(client, toolName, args, timeoutMs)
      logger?.log?.(`[MCP:${this.id}] Tool result:`, result)
      if (!result.success) {
        logger?.error?.(`[MCP:${this.id}] Tool call failed:`, result.error)
      }
      return result
    })
  }

  async readResource(uri: string): Promise<{ success: boolean; content?: JsonValue; error?: string }> {
    return runMCPConnectedClientOperation(this.client, client => readMCPResource(client, uri))
  }

  async getPrompt(name: string, args?: Record<string, string>): Promise<{ success: boolean; messages?: JsonArray; error?: string }> {
    return runMCPConnectedClientOperation(this.client, client => getMCPPromptMessages(client, name, args))
  }

  async disconnect(): Promise<void> {
    const result = await disconnectMCPClientWithAdapters({
      state: this._state,
      client: this.client,
      transport: this.transport,
      adapters: this.adapters,
    })
    this._state = result.state
    this.client = result.client
    this.transport = result.transport
  }

  async updateConfig(config: MCPServerConfig): Promise<void> {
    const result = await updateMCPClientConfigWithAdapters({
      state: this._state,
      client: this.client,
      transport: this.transport,
      config,
      baseEnv: this.getBaseEnv(),
      adapters: this.adapters,
    })
    this._state = result.state
    this.client = result.client
    this.transport = result.transport
  }
}
