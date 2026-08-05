/**
 * MCP Module Entry Point
 *
 * Provides a unified interface for MCP functionality
 */

export type {
  MCPClientFactory,
  MCPClientLike,
} from '@onething/core/mcp'

// Export types
export type {
  MCPTransportType,
  MCPServerConfig,
  MCPConnectionStatus,
  MCPServerState,
  MCPToolInfo,
  MCPResourceInfo,
  MCPPromptInfo,
  MCPToolCallRequest,
  MCPToolCallResult,
  MCPSettings,
} from './types.js'

export { DEFAULT_MCP_SETTINGS } from './types.js'

// Export client
export { MCPClient } from './client.js'

// Export manager
export { MCPManager, configureMCPClientHost } from './manager.js'

// Export bridge functions
export {
  mcpToolToToolDefinition,
  getMCPRouterToolDefinition,
  mcpInputSchemaToZod,
  getMCPToolsForAI,
  registerMCPTools,
  parseMCPToolId,
  isMCPTool,
  executeMCPTool,
  resolveMCPServerIdForToolRef,
  findMCPToolIdByShortName,
} from './bridge.js'
