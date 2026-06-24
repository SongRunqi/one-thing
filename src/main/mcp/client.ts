/**
 * MCP Client Wrapper
 *
 * Wraps the MCP SDK client for easier integration
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import type {
  MCPServerConfig,
  MCPServerState,
  MCPToolInfo,
  MCPResourceInfo,
  MCPPromptInfo,
  MCPToolCallResult,
  MCPConnectionStatus,
} from './types.js'
import { toJsonSchemaObject, toJsonValue, type JsonArray, type JsonObject, type JsonValue } from '../../shared/json.js'

function normalizeMCPContent(content: object[] | undefined): MCPToolCallResult['content'] {
  if (!Array.isArray(content)) return undefined
  return content.map(item => {
    const record = toJsonValue(item)
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      return { type: 'text', text: String(record ?? '') }
    }
    const type = typeof record.type === 'string' ? record.type : 'text'
    if (type === 'image') {
      return {
        type: 'image',
        data: typeof record.data === 'string' ? record.data : undefined,
        mimeType: typeof record.mimeType === 'string' ? record.mimeType : undefined,
      }
    }
    if (type === 'resource') {
      return {
        type: 'resource',
        text: typeof record.text === 'string' ? record.text : undefined,
        data: typeof record.data === 'string' ? record.data : undefined,
        mimeType: typeof record.mimeType === 'string' ? record.mimeType : undefined,
      }
    }
    return {
      type: 'text',
      text: typeof record.text === 'string' ? record.text : JSON.stringify(record),
    }
  })
}

/**
 * MCP Client wrapper class
 */
export class MCPClient {
  private client: Client | null = null
  private transport: StdioClientTransport | SSEClientTransport | null = null
  private _state: MCPServerState

  constructor(config: MCPServerConfig) {
    this._state = {
      config,
      status: 'disconnected',
      tools: [],
      resources: [],
      prompts: [],
    }
  }

  /**
   * Get current state
   */
  get state(): MCPServerState {
    return { ...this._state }
  }

  /**
   * Get server ID
   */
  get id(): string {
    return this._state.config.id
  }

  /**
   * Get connection status
   */
  get status(): MCPConnectionStatus {
    return this._state.status
  }

  /**
   * Connect to the MCP server
   */
  async connect(): Promise<void> {
    if (this._state.status === 'connected') {
      console.log(`[MCP:${this.id}] Already connected`)
      return
    }

    this._state.status = 'connecting'
    this._state.error = undefined

    try {
      // Create transport based on config
      if (this._state.config.transport === 'stdio') {
        await this.connectStdio()
      } else {
        await this.connectSSE()
      }

      // Create and connect client
      this.client = new Client(
        {
          name: 'one-thing',
          version: '1.0.0',
        },
        {
          capabilities: {},
        }
      )

      // Add connection timeout (30 seconds for SSE, 60 seconds for stdio)
      const timeoutMs = this._state.config.transport === 'sse' ? 30000 : 60000
      const connectPromise = this.client.connect(this.transport!)
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`Connection timeout after ${timeoutMs / 1000}s`)), timeoutMs)
      })

      await Promise.race([connectPromise, timeoutPromise])

      // Fetch available capabilities
      await this.refreshCapabilities()

      this._state.status = 'connected'
      this._state.connectedAt = Date.now()

      console.log(`[MCP:${this.id}] Connected successfully`)
      console.log(`[MCP:${this.id}] Tools: ${this._state.tools.length}, Resources: ${this._state.resources.length}, Prompts: ${this._state.prompts.length}`)
    } catch (error) {
      this._state.status = 'error'
      this._state.error = error instanceof Error ? error.message : String(error ?? 'Unknown connection error')
      console.error(`[MCP:${this.id}] Connection failed:`, error)
      throw error
    }
  }

  /**
   * Connect using stdio transport
   */
  private async connectStdio(): Promise<void> {
    const { command, args = [], env, cwd } = this._state.config

    if (!command) {
      throw new Error('Command is required for stdio transport')
    }

    console.log(`[MCP:${this.id}] Connecting via stdio: ${command} ${args.join(' ')}`)

    // Filter out undefined values from process.env and merge with custom env
    const filteredProcessEnv = Object.fromEntries(
      Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)
    )
    this.transport = new StdioClientTransport({
      command,
      args,
      env: env ? { ...filteredProcessEnv, ...env } : undefined,
      cwd,
    })
  }

  /**
   * Connect using SSE transport
   */
  private async connectSSE(): Promise<void> {
    const { url, headers } = this._state.config

    if (!url) {
      throw new Error('URL is required for SSE transport')
    }

    console.log(`[MCP:${this.id}] Connecting via SSE: ${url}`)

    this.transport = new SSEClientTransport(new URL(url), {
      requestInit: headers ? { headers } : undefined,
    })
  }

  /**
   * Refresh capabilities (tools, resources, prompts)
   */
  async refreshCapabilities(): Promise<void> {
    if (!this.client) {
      throw new Error('Client not connected')
    }

    // Fetch tools
    try {
      const toolsResult = await this.client.listTools()
      this._state.tools = (toolsResult.tools || []).map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: { ...toJsonSchemaObject(tool.inputSchema || { type: 'object' }), type: 'object' },
        serverId: this.id,
      }))
    } catch (error) {
      console.warn(`[MCP:${this.id}] Failed to list tools:`, error)
      this._state.tools = []
    }

    // Fetch resources
    try {
      const resourcesResult = await this.client.listResources()
      this._state.resources = (resourcesResult.resources || []).map((resource) => ({
        uri: String(resource.uri),
        name: resource.name,
        description: resource.description,
        mimeType: resource.mimeType,
        serverId: this.id,
      }))
    } catch (error) {
      console.warn(`[MCP:${this.id}] Failed to list resources:`, error)
      this._state.resources = []
    }

    // Fetch prompts
    try {
      const promptsResult = await this.client.listPrompts()
      this._state.prompts = (promptsResult.prompts || []).map((prompt) => ({
        name: prompt.name,
        description: prompt.description,
        arguments: prompt.arguments,
        serverId: this.id,
      }))
    } catch (error) {
      console.warn(`[MCP:${this.id}] Failed to list prompts:`, error)
      this._state.prompts = []
    }
  }

  /**
   * Call a tool
   */
  async callTool(toolName: string, args: JsonObject, options?: { timeoutMs?: number }): Promise<MCPToolCallResult> {
    if (!this.client) {
      return {
        success: false,
        error: 'Client not connected',
      }
    }

    const timeoutMs = options?.timeoutMs ?? 60000 // Default 60s timeout

    try {
      console.log(`[MCP:${this.id}] Calling tool: ${toolName}`, args)

      const callPromise = this.client.callTool({
        name: toolName,
        arguments: args,
      })
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`MCP tool call "${toolName}" timed out after ${timeoutMs / 1000}s`)), timeoutMs)
      })

      const result = await Promise.race([callPromise, timeoutPromise])

      console.log(`[MCP:${this.id}] Tool result:`, result)

      return {
        success: true,
        content: normalizeMCPContent(Array.isArray(result.content)
          ? result.content.filter((item): item is object => item !== null && typeof item === 'object')
          : undefined),
        isError: result.isError === true,
      }
    } catch (error) {
      console.error(`[MCP:${this.id}] Tool call failed:`, error)
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error ?? 'Unknown error'),
      }
    }
  }

   /**
   * Read a resource
   */
  async readResource(uri: string): Promise<{ success: boolean; content?: JsonValue; error?: string }> {
    if (!this.client) {
      return {
        success: false,
        error: 'Client not connected',
      }
    }

    try {
      const result = await this.client.readResource({ uri })
      return {
        success: true,
        content: toJsonValue(result.contents),
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error ?? 'Unknown error'),
      }
    }
  }

   /**
   * Get a prompt
   */
  async getPrompt(name: string, args?: Record<string, string>): Promise<{ success: boolean; messages?: JsonArray; error?: string }> {
    if (!this.client) {
      return {
        success: false,
        error: 'Client not connected',
      }
    }

    try {
      const result = await this.client.getPrompt({ name, arguments: args })
      const messages = toJsonValue(result.messages)
      return {
        success: true,
        messages: Array.isArray(messages) ? messages : undefined,
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error ?? 'Unknown error'),
      }
    }
  }

  /**
   * Disconnect from the server
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      try {
        await this.client.close()
      } catch (error) {
        console.warn(`[MCP:${this.id}] Error during disconnect:`, error)
      }
      this.client = null
    }

    if (this.transport) {
      try {
        await this.transport.close()
      } catch (error) {
        console.warn(`[MCP:${this.id}] Error closing transport:`, error)
      }
      this.transport = null
    }

    this._state.status = 'disconnected'
    this._state.tools = []
    this._state.resources = []
    this._state.prompts = []
    this._state.connectedAt = undefined

    console.log(`[MCP:${this.id}] Disconnected`)
  }

  /**
   * Update configuration (reconnect if needed)
   */
  async updateConfig(config: MCPServerConfig): Promise<void> {
    const wasConnected = this._state.status === 'connected'

    if (wasConnected) {
      await this.disconnect()
    }

    this._state.config = config

    if (wasConnected && config.enabled) {
      await this.connect()
    }
  }
}
