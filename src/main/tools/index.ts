/**
 * Tool System Entry Point
 *
 * Provides a unified interface for the tool system.
 * All tools use the Tool.define() pattern.
 */

// Re-export types
export type {
  ToolDefinition,
  ToolCall,
  ToolParameter,
  ToolExecutionContext,
  ToolExecutionResult,
  AIToolSchema,
} from './types.js'

export { toAIToolSchema } from './types.js'

// Re-export core types and utilities
export { Tool, zodToJsonSchema, isAsyncTool } from './core/tool.js'
export type {
  ToolMetadata,
  ToolContext,
  ToolResult,
  ToolInfo,
  ToolConfig,
  ToolInfoAsync,
  ToolInfoUnion,
  ToolInitResult,
  InitContext,
} from './core/tool.js'

// Re-export replacement utilities
export {
  replace,
  normalizeLineEndings,
  trimDiff,
  REPLACERS,
} from './core/replacers.js'
export type { Replacer } from './core/replacers.js'

// Re-export registry functions
export {
  registerTool,
  unregisterTool,
  getTool,
  getAsyncTool,
  hasTool,
  getAllTools,
  getAllToolsAsync,
  getAllToolInfos,
  getAllAsyncToolInfos,
  getEnabledTools,
  getEnabledToolsAsync,
  getEnabledToolInfos,
  getEnabledAsyncToolInfos,
  getToolsForAI,
  executeTool,
  createToolCall,
  canAutoExecute,
  initializeToolRegistry,
  isInitialized,
  // Async tool support
  setInitContext,
  getInitContext,
  initializeAsyncTools,
} from './registry.js'

// Re-export permission system
export { Permission } from '../permission/index.js'
