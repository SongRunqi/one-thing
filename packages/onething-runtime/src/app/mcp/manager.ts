import { MCPClient } from './client.js'
import { HeadlessMCPManager } from '@onething/core/mcp'
import type { MCPClientFactory, MCPClientLike, MCPServerConfig } from '@onething/core/mcp'

/**
 * Host-injected MCP client factory.
 *
 * The engine's MCP bridge (mcp/bridge.ts) is bound to this single manager, so a
 * host that needs a different client (apps/server gates stdio behind
 * ONETHING_SERVER_MCP_STDIO and disables connections entirely by default) must
 * contribute its factory here rather than standing up a second manager — a
 * second manager would connect servers the engine cannot see.
 *
 * Late-bound and consulted per call, like the other configure*Host ports.
 */
let clientHostFactory: MCPClientFactory<MCPClientLike> | null = null

export function configureMCPClientHost(
  factory: MCPClientFactory<MCPClientLike> | null,
): void {
  clientHostFactory = factory
}

class MCPManagerClass extends HeadlessMCPManager<MCPClientLike> {
  constructor() {
    super((config: MCPServerConfig) => clientHostFactory
      ? clientHostFactory(config)
      : new MCPClient(config) as MCPClientLike)
  }
}

export const MCPManager = new MCPManagerClass()
