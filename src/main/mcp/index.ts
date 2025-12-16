/**
 * MCP Module Entry Point
 *
 * Provides a unified interface for MCP functionality
 */

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
export { MCPManager } from './manager.js'

// Export bridge functions
export {
  mcpToolToToolDefinition,
  mcpInputSchemaToZod,
  getMCPToolsForAI,
  registerMCPTools,
  parseMCPToolId,
  isMCPTool,
  executeMCPTool,
} from './bridge.js'
