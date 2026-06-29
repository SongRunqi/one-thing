import type {
  JsonArray,
  JsonObject,
  JsonValue,
} from '../json.js'
import type {
  MCPConnectionStatus,
  MCPPromptInfo,
  MCPResourceInfo,
  MCPServerConfig,
  MCPServerState,
  MCPSettings,
  MCPToolCallResult,
  MCPToolInfo,
} from './types.js'

export interface MCPClientLike {
  readonly state: MCPServerState
  readonly status: MCPConnectionStatus
  connect(): Promise<void>
  disconnect(): Promise<void>
  updateConfig(config: MCPServerConfig): Promise<void>
  callTool(toolName: string, args: JsonObject): Promise<MCPToolCallResult>
  readResource(uri: string): Promise<{ success: boolean; content?: JsonValue; error?: string }>
  getPrompt(name: string, args?: Record<string, string>): Promise<{ success: boolean; messages?: JsonArray; error?: string }>
  refreshCapabilities(): Promise<void>
}

export type MCPClientFactory<TClient extends MCPClientLike> = (config: MCPServerConfig) => TClient

export class HeadlessMCPManager<TClient extends MCPClientLike = MCPClientLike> {
  protected clients: Map<string, TClient> = new Map()
  protected settings: MCPSettings = { enabled: true, servers: [] }
  protected initialized = false

  constructor(private readonly createClient: MCPClientFactory<TClient>) {}

  async initialize(settings: MCPSettings): Promise<void> {
    if (this.initialized) {
      console.log('[MCPManager] Already initialized, updating settings')
      await this.updateSettings(settings)
      return
    }

    console.log('[MCPManager] Initializing...')
    this.settings = settings

    if (!settings.enabled) {
      console.log('[MCPManager] MCP is disabled')
      this.initialized = true
      return
    }

    const enabledServers = settings.servers.filter(server => server.enabled)
    console.log(`[MCPManager] Connecting to ${enabledServers.length} servers...`)

    await Promise.allSettled(
      enabledServers.map(config => this.connectServer(config)),
    )

    this.initialized = true
    console.log('[MCPManager] Initialization complete')
  }

  async updateSettings(settings: MCPSettings): Promise<void> {
    const oldSettings = this.settings
    this.settings = settings

    if (!settings.enabled) {
      await this.disconnectAll()
      return
    }

    if (!oldSettings.enabled && settings.enabled) {
      const enabledServers = settings.servers.filter(server => server.enabled)
      await Promise.allSettled(
        enabledServers.map(config => this.connectServer(config)),
      )
      return
    }

    const newServerIds = new Set(settings.servers.map(server => server.id))
    const oldServerIds = new Set(oldSettings.servers.map(server => server.id))

    for (const id of oldServerIds) {
      if (!newServerIds.has(id)) {
        await this.removeServer(id)
      }
    }

    for (const config of settings.servers) {
      const client = this.clients.get(config.id)

      if (!client) {
        if (config.enabled) {
          await this.connectServer(config)
        }
      } else {
        const oldConfig = oldSettings.servers.find(server => server.id === config.id)
        const configChanged = JSON.stringify(oldConfig) !== JSON.stringify(config)

        if (configChanged) {
          await client.updateConfig(config)
        }
      }
    }
  }

  async connectServer(config: MCPServerConfig): Promise<void> {
    if (this.clients.has(config.id)) {
      await this.disconnectServer(config.id)
    }

    const client = this.createClient(config)
    this.clients.set(config.id, client)

    try {
      await client.connect()
    } catch (error) {
      console.error(`[MCPManager] Failed to connect server ${config.id}:`, error)
    }
  }

  async disconnectServer(serverId: string): Promise<void> {
    const client = this.clients.get(serverId)
    if (client) {
      await client.disconnect()
    }
  }

  async removeServer(serverId: string): Promise<void> {
    const client = this.clients.get(serverId)
    if (client) {
      await client.disconnect()
      this.clients.delete(serverId)
    }
  }

  async disconnectAll(): Promise<void> {
    await Promise.allSettled(
      Array.from(this.clients.keys()).map(id => this.disconnectServer(id)),
    )
  }

  getServerStates(): MCPServerState[] {
    return Array.from(this.clients.values()).map(client => client.state)
  }

  getServerState(serverId: string): MCPServerState | undefined {
    return this.clients.get(serverId)?.state
  }

  getAllTools(): MCPToolInfo[] {
    const tools: MCPToolInfo[] = []
    for (const client of this.clients.values()) {
      if (client.status === 'connected') {
        tools.push(...client.state.tools)
      }
    }
    return tools
  }

  getAllResources(): MCPResourceInfo[] {
    const resources: MCPResourceInfo[] = []
    for (const client of this.clients.values()) {
      if (client.status === 'connected') {
        resources.push(...client.state.resources)
      }
    }
    return resources
  }

  getAllPrompts(): MCPPromptInfo[] {
    const prompts: MCPPromptInfo[] = []
    for (const client of this.clients.values()) {
      if (client.status === 'connected') {
        prompts.push(...client.state.prompts)
      }
    }
    return prompts
  }

  async callTool(serverId: string, toolName: string, args: JsonObject): Promise<MCPToolCallResult> {
    const client = this.clients.get(serverId)
    if (!client) {
      return {
        success: false,
        error: `Server "${serverId}" not found`,
      }
    }

    if (client.status !== 'connected') {
      return {
        success: false,
        error: `Server "${serverId}" is not connected`,
      }
    }

    return client.callTool(toolName, args)
  }

  async callToolByName(toolName: string, args: JsonObject): Promise<MCPToolCallResult> {
    for (const client of this.clients.values()) {
      if (client.status !== 'connected') continue

      const tool = client.state.tools.find(item => item.name === toolName)
      if (tool) {
        return client.callTool(toolName, args)
      }
    }

    return {
      success: false,
      error: `Tool "${toolName}" not found on any connected server`,
    }
  }

  async readResource(serverId: string, uri: string): Promise<{ success: boolean; content?: JsonValue; error?: string }> {
    const client = this.clients.get(serverId)
    if (!client) {
      return {
        success: false,
        error: `Server "${serverId}" not found`,
      }
    }

    return client.readResource(uri)
  }

  async getPrompt(serverId: string, name: string, args?: Record<string, string>): Promise<{ success: boolean; messages?: JsonArray; error?: string }> {
    const client = this.clients.get(serverId)
    if (!client) {
      return {
        success: false,
        error: `Server "${serverId}" not found`,
      }
    }

    return client.getPrompt(name, args)
  }

  async refreshServer(serverId: string): Promise<void> {
    const client = this.clients.get(serverId)
    if (client && client.status === 'connected') {
      await client.refreshCapabilities()
    }
  }

  async reconnectServer(serverId: string): Promise<void> {
    const client = this.clients.get(serverId)
    if (client) {
      await client.disconnect()
      await client.connect()
    }
  }

  get isEnabled(): boolean {
    return this.settings.enabled
  }

  getSettings(): MCPSettings {
    return { ...this.settings }
  }

  async shutdown(): Promise<void> {
    console.log('[MCPManager] Shutting down...')
    await this.disconnectAll()
    this.initialized = false
    console.log('[MCPManager] Shutdown complete')
  }
}
