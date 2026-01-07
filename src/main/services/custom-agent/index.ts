/**
 * Custom Agent Service
 *
 * Provides CustomAgent loading, execution, and management.
 */

// Loader
export {
  loadCustomAgents,
  getCustomAgentByName,
  getCustomAgentById,
  refreshCustomAgents,
  ensureAgentsDirectories,
  getUserAgentsPath,
  getProjectAgentsPath,
} from './loader.js'

// Tool Builder
export {
  buildToolParametersSchema,
  buildToolsForAI,
  convertCustomToolsForAI,
  buildCustomToolsPromptSection,
  buildCustomAgentSystemPrompt,
  getCustomToolById,
  // Built-in tools support
  getAvailableBuiltinToolsInfo,
  getBuiltinToolsById,
  isBuiltinTool,
} from './tool-builder.js'

// Custom Tool Executor
export {
  executeCustomTool,
  interpolateTemplate,
  escapeShellArg,
} from './custom-tool-executor.js'

// Agent Executor
export {
  executeCustomAgent,
  type CustomAgentEvents,
  type CustomAgentRequest,
  type CustomAgentContext,
  type PermissionDecision,
  type PermissionToolCall,
} from './executor.js'
