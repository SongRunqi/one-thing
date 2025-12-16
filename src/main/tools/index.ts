/**
 * Tool System Entry Point
 *
 * Provides a unified interface for the tool system.
 */

// Re-export types
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

// Re-export registry functions
export {
  registerTool,
  unregisterTool,
  getTool,
  getAllTools,
  getEnabledTools,
  getToolsForAI,
  executeTool,
  createToolCall,
  canAutoExecute,
  initializeToolRegistry,
  isInitialized,
} from './registry.js'
