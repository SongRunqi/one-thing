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
  MCPToolCallResult,
  MCPConnectionStatus,
} from './types.js'
import {
  CoreMCPClientRuntime,
  refreshMCPClientCapabilities,
} from '@onething/core/mcp'
import type { JsonArray, JsonObject, JsonValue } from '@onething/core'

type MCPTransport = StdioClientTransport | SSEClientTransport

/**
 * MCP Client wrapper class
 */
export class MCPClient {
  private readonly runtime: CoreMCPClientRuntime<Client, MCPTransport>

  constructor(config: MCPServerConfig) {
    this.runtime = new CoreMCPClientRuntime<Client, MCPTransport>({
      config,
      getBaseEnv: () => process.env,
      adapters: {
        createTransport: (plan) => {
          if (plan.transport === 'stdio') {
            return new StdioClientTransport({
              command: plan.command,
              args: plan.args,
              env: plan.env,
              cwd: plan.cwd,
            })
          }
          return new SSEClientTransport(new URL(plan.url), {
            requestInit: plan.headers ? { headers: plan.headers } : undefined,
          })
        },
        createClient: () => new Client(
          {
            name: 'one-thing',
            version: '1.0.0',
          },
          {
            capabilities: {},
          },
        ),
        connectClient: (client, transport) => client.connect(transport),
        refreshCapabilities: (serverId, client, logger) => refreshMCPClientCapabilities(serverId, client, logger),
        closeClient: client => client.close(),
        closeTransport: transport => transport.close(),
        // The SDK reports a dead connection on both objects: `onclose` when the
        // stream ends cleanly (stdio child exited), `onerror` when it dies
        // mid-flight. Core only needs to hear it once.
        observeDisconnect: (client, transport, onDisconnect) => {
          let reported = false
          const report = () => {
            if (reported) return
            reported = true
            onDisconnect()
          }
          client.onclose = report
          transport.onclose = report
          transport.onerror = report
        },
        logger: console,
      },
    })
  }

  /**
   * Get current state
   */
  get state(): MCPServerState {
    return this.runtime.state
  }

  /**
   * Get server ID
   */
  get id(): string {
    return this.runtime.id
  }

  /**
   * Get connection status
   */
  get status(): MCPConnectionStatus {
    return this.runtime.status
  }

  /**
   * Connect to the MCP server
   */
  async connect(): Promise<void> {
    await this.runtime.connect()
  }

  /**
   * Refresh capabilities (tools, resources, prompts)
   */
  async refreshCapabilities(): Promise<void> {
    await this.runtime.refreshCapabilities()
  }

  /**
   * Call a tool
   */
  async callTool(toolName: string, args: JsonObject, options?: { timeoutMs?: number }): Promise<MCPToolCallResult> {
    return this.runtime.callTool(toolName, args, options)
  }

   /**
   * Read a resource
   */
  async readResource(uri: string): Promise<{ success: boolean; content?: JsonValue; error?: string }> {
    return this.runtime.readResource(uri)
  }

   /**
   * Get a prompt
   */
  async getPrompt(name: string, args?: Record<string, string>): Promise<{ success: boolean; messages?: JsonArray; error?: string }> {
    return this.runtime.getPrompt(name, args)
  }

  /**
   * Disconnect from the server
   */
  async disconnect(): Promise<void> {
    await this.runtime.disconnect()
  }

  /**
   * Update configuration (reconnect if needed)
   */
  async updateConfig(config: MCPServerConfig): Promise<void> {
    await this.runtime.updateConfig(config)
  }
}
