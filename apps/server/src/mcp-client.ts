import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import {
  CoreMCPClientRuntime,
  refreshMCPClientCapabilities,
  type MCPClientLike,
  type MCPConnectionStatus,
  type MCPServerConfig,
  type MCPServerState,
  type MCPToolCallResult,
} from '@onething/core/mcp'
import type { JsonArray, JsonObject, JsonValue } from '@onething/core'

type ServerMCPTransport = SSEClientTransport | StdioClientTransport

export interface ServerMCPClientOptions {
  allowStdio?: boolean
}

export class ServerMCPClient implements MCPClientLike {
  private readonly runtime: CoreMCPClientRuntime<Client, ServerMCPTransport>

  constructor(config: MCPServerConfig, options: ServerMCPClientOptions = {}) {
    this.runtime = new CoreMCPClientRuntime<Client, ServerMCPTransport>({
      config,
      getBaseEnv: () => process.env,
      adapters: {
        createTransport: (plan) => {
          if (plan.transport === 'stdio') {
            if (!options.allowStdio) {
              throw new Error('MCP stdio transport is disabled in the web server runtime.')
            }
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
            name: 'onething-web-server',
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
        logger: console,
      },
    })
  }

  get state(): MCPServerState {
    return this.runtime.state
  }

  get status(): MCPConnectionStatus {
    return this.runtime.status
  }

  async connect(): Promise<void> {
    await this.runtime.connect()
  }

  async disconnect(): Promise<void> {
    await this.runtime.disconnect()
  }

  async updateConfig(config: MCPServerConfig): Promise<void> {
    await this.runtime.updateConfig(config)
  }

  async callTool(toolName: string, args: JsonObject): Promise<MCPToolCallResult> {
    return this.runtime.callTool(toolName, args)
  }

  async readResource(uri: string): Promise<{ success: boolean; content?: JsonValue; error?: string }> {
    return this.runtime.readResource(uri)
  }

  async getPrompt(name: string, args?: Record<string, string>): Promise<{ success: boolean; messages?: JsonArray; error?: string }> {
    return this.runtime.getPrompt(name, args)
  }

  async refreshCapabilities(): Promise<void> {
    await this.runtime.refreshCapabilities()
  }
}
