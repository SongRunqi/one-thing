/**
 * MCP Manager
 *
 * Manages multiple MCP server connections and provides a unified interface
 */

import { MCPClient } from './client.js'
import type {
  MCPServerConfig,
  MCPServerState,
  MCPToolInfo,
  MCPResourceInfo,
  MCPPromptInfo,
  MCPToolCallResult,
  MCPSettings,
  DEFAULT_MCP_SETTINGS,
} from './types.js'

/**
 * MCP Manager singleton
 */
class MCPManagerClass {
  private clients: Map<string, MCPClient> = new Map()
  private settings: MCPSettings = { enabled: true, servers: [] }
  private initialized = false

  /**
   * Initialize the manager with settings
   */
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

    // Connect to all enabled servers
    const enabledServers = settings.servers.filter(s => s.enabled)
    console.log(`[MCPManager] Connecting to ${enabledServers.length} servers...`)

    await Promise.allSettled(
      enabledServers.map(config => this.connectServer(config))
    )

    this.initialized = true
    console.log('[MCPManager] Initialization complete')
  }

  /**
   * Update settings and reconnect as needed
   */
  async updateSettings(settings: MCPSettings): Promise<void> {
    const oldSettings = this.settings
    this.settings = settings

    // If MCP was disabled, disconnect all
    if (!settings.enabled) {
      await this.disconnectAll()
      return
    }

    // If MCP was just enabled, connect all enabled servers
    if (!oldSettings.enabled && settings.enabled) {
      const enabledServers = settings.servers.filter(s => s.enabled)
      await Promise.allSettled(
        enabledServers.map(config => this.connectServer(config))
      )
      return
    }

    // Compare server configs and update accordingly
    const newServerIds = new Set(settings.servers.map(s => s.id))
    const oldServerIds = new Set(oldSettings.servers.map(s => s.id))

    // Disconnect removed servers
    for (const id of oldServerIds) {
      if (!newServerIds.has(id)) {
        await this.disconnectServer(id)
      }
    }

    // Update or connect servers
    for (const config of settings.servers) {
      const client = this.clients.get(config.id)

      if (!client) {
        // New server
        if (config.enabled) {
          await this.connectServer(config)
        }
      } else {
        // Existing server - check if config changed
        const oldConfig = oldSettings.servers.find(s => s.id === config.id)
        const configChanged = JSON.stringify(oldConfig) !== JSON.stringify(config)

        if (configChanged) {
          await client.updateConfig(config)
        }
      }
    }
  }

  /**
   * Connect to a server
   */
  async connectServer(config: MCPServerConfig): Promise<void> {
    // Disconnect existing client if any
    if (this.clients.has(config.id)) {
      await this.disconnectServer(config.id)
    }

    const client = new MCPClient(config)
    this.clients.set(config.id, client)

    try {
      await client.connect()
    } catch (error) {
      console.error(`[MCPManager] Failed to connect server ${config.id}:`, error)
      // Keep the client for status reporting, even if connection failed
    }
  }

  /**
   * Disconnect a server
   */
  async disconnectServer(serverId: string): Promise<void> {
    const client = this.clients.get(serverId)
    if (client) {
      await client.disconnect()
      this.clients.delete(serverId)
    }
  }

  /**
   * Disconnect all servers
   */
  async disconnectAll(): Promise<void> {
    await Promise.allSettled(
      Array.from(this.clients.keys()).map(id => this.disconnectServer(id))
    )
  }

  /**
   * Get all server states
   */
  getServerStates(): MCPServerState[] {
    return Array.from(this.clients.values()).map(client => client.state)
  }

  /**
   * Get a specific server state
   */
  getServerState(serverId: string): MCPServerState | undefined {
    return this.clients.get(serverId)?.state
  }

  /**
   * Get all available tools from all connected servers
   */
  getAllTools(): MCPToolInfo[] {
    const tools: MCPToolInfo[] = []
    for (const client of this.clients.values()) {
      if (client.status === 'connected') {
        tools.push(...client.state.tools)
      }
    }
    return tools
  }

  /**
   * Get all available resources from all connected servers
   */
  getAllResources(): MCPResourceInfo[] {
    const resources: MCPResourceInfo[] = []
    for (const client of this.clients.values()) {
      if (client.status === 'connected') {
        resources.push(...client.state.resources)
      }
    }
    return resources
  }

  /**
   * Get all available prompts from all connected servers
   */
  getAllPrompts(): MCPPromptInfo[] {
    const prompts: MCPPromptInfo[] = []
    for (const client of this.clients.values()) {
      if (client.status === 'connected') {
        prompts.push(...client.state.prompts)
      }
    }
    return prompts
  }

  /**
   * Call a tool on a specific server
   */
  async callTool(serverId: string, toolName: string, args: Record<string, any>): Promise<MCPToolCallResult> {
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

  /**
   * Find and call a tool by name (searches all servers)
   */
  async callToolByName(toolName: string, args: Record<string, any>): Promise<MCPToolCallResult> {
    // Find which server has this tool
    for (const client of this.clients.values()) {
      if (client.status !== 'connected') continue

      const tool = client.state.tools.find(t => t.name === toolName)
      if (tool) {
        return client.callTool(toolName, args)
      }
    }

    return {
      success: false,
      error: `Tool "${toolName}" not found on any connected server`,
    }
  }

  /**
   * Read a resource
   */
  async readResource(serverId: string, uri: string): Promise<{ success: boolean; content?: any; error?: string }> {
    const client = this.clients.get(serverId)
    if (!client) {
      return {
        success: false,
        error: `Server "${serverId}" not found`,
      }
    }

    return client.readResource(uri)
  }

  /**
   * Get a prompt
   */
  async getPrompt(serverId: string, name: string, args?: Record<string, string>): Promise<{ success: boolean; messages?: any[]; error?: string }> {
    const client = this.clients.get(serverId)
    if (!client) {
      return {
        success: false,
        error: `Server "${serverId}" not found`,
      }
    }

    return client.getPrompt(name, args)
  }

  /**
   * Refresh capabilities for a specific server
   */
  async refreshServer(serverId: string): Promise<void> {
    const client = this.clients.get(serverId)
    if (client && client.status === 'connected') {
      await client.refreshCapabilities()
    }
  }

  /**
   * Reconnect a specific server
   */
  async reconnectServer(serverId: string): Promise<void> {
    const client = this.clients.get(serverId)
    if (client) {
      await client.disconnect()
      await client.connect()
    }
  }

  /**
   * Check if MCP is enabled
   */
  get isEnabled(): boolean {
    return this.settings.enabled
  }

  /**
   * Get current settings
   */
  getSettings(): MCPSettings {
    return { ...this.settings }
  }

  /**
   * Cleanup on shutdown
   */
  async shutdown(): Promise<void> {
    console.log('[MCPManager] Shutting down...')
    await this.disconnectAll()
    this.initialized = false
    console.log('[MCPManager] Shutdown complete')
  }
}

// Export singleton instance
export const MCPManager = new MCPManagerClass()
