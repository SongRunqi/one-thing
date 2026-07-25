import { MCPClient } from './client.js'
import { HeadlessMCPManager } from '@onething/core/mcp'
import type { MCPClientLike, MCPServerConfig } from '@onething/core/mcp'

class MCPManagerClass extends HeadlessMCPManager<MCPClientLike> {
  constructor() {
    super((config: MCPServerConfig) => new MCPClient(config) as MCPClientLike)
  }
}

export const MCPManager = new MCPManagerClass()
