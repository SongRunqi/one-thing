/**
 * Tool System Entry Point
 *
 * Provides a unified interface for the tool system.
 * Supports both legacy tools and V2 tools (Tool.define() pattern).
 */

// Re-export legacy types
export type {
  ToolDefinition,
  ToolCall,
  ToolParameter,
  ToolExecutionContext,
  ToolExecutionResult,
  ToolHandler,
  RegisteredTool,
  AIToolSchema,
} from './types.js'

export { toAIToolSchema } from './types.js'

// Re-export V2 types and utilities
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
  registerToolV2,
  unregisterTool,
  getTool,
  getToolV2,
  getToolV2Async,
  hasTool,
  getAllTools,
  getAllToolsAsync,
  getAllToolsV2,
  getAllToolsV2Async,
  getEnabledTools,
  getEnabledToolsAsync,
  getEnabledToolsV2,
  getEnabledToolsV2Async,
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
