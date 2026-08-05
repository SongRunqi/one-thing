export { createAcpConnector } from './acp-connector.js'
export type { AcpConnectorOptions } from './acp-connector.js'
export {
  CLAUDE_CODE_AGENT_CONNECTOR_ID,
  createClaudeCodeConnector,
} from './claude-code-connector.js'
export type {
  ClaudeCodeConnectorOptions,
  ClaudeCodeQueryFn,
  ClaudeCodeQueryOptions,
  ClaudeCodeSdkMessage,
} from './claude-code-connector.js'
export {
  activeHostToolContextCount,
  bindHostToolContext,
  clearHostToolContexts,
  createHostMcpServer,
  filterHostToolSurface,
  HOST_MCP_SERVER_NAME,
  HOST_MCP_TOOL_CANDIDATES,
  HOST_MCP_TOOL_PREFIX,
  HOST_MCP_TURN_GONE,
  hostMcpToolName,
  isHostMcpToolName,
  resolveHostToolContext,
  resolveHostToolSurface,
  stripHostMcpToolPrefix,
  toHostMcpToolDefinition,
} from './host-mcp/index.js'
export type {
  CreateHostMcpServerOptions,
  CreateSdkMcpServerFn,
  HostMcpCallResult,
  HostMcpInjection,
  HostMcpServer,
  HostMcpSurfaceResolver,
  HostMcpToolDefinition,
  HostToolSurfaceInput,
  HostToolTurnContext,
} from './host-mcp/index.js'
export type {
  ExternalAgentCapabilities,
  ExternalAgentConnector,
  ExternalAgentEvent,
  ExternalAgentMcpAttribution,
  ExternalAgentPermissionAsk,
  ExternalAgentPermissionBridgeKind,
  ExternalAgentPermissionHandler,
  ExternalAgentSessionLink,
  ExternalAgentTurnRequest,
} from './types.js'
