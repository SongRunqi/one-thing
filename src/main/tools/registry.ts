/**
 * Tool Registry
 *
 * Central registry for managing tools. Supports:
 * - Built-in tools (loaded automatically)
 * - Custom tools (can be registered at runtime)
 * - Tool execution with permission checks
 */

import type {
  ToolDefinition,
  ToolCall,
  RegisteredTool,
  ToolHandler,
  ToolExecutionContext,
  ToolExecutionResult,
  AIToolSchema,
} from './types.js'
import { toAIToolSchema } from './types.js'
import { v4 as uuidv4 } from 'uuid'

// Tool registry storage
const toolRegistry: Map<string, RegisteredTool> = new Map()

// Track if registry has been initialized
let initialized = false

/**
 * Register a tool with its handler
 */
export function registerTool(definition: ToolDefinition, handler: ToolHandler): void {
  if (toolRegistry.has(definition.id)) {
    console.warn(`Tool "${definition.id}" is already registered. Overwriting.`)
  }

  toolRegistry.set(definition.id, {
    definition,
    handler,
  })

  console.log(`[ToolRegistry] Registered tool: ${definition.id}`)
}

/**
 * Unregister a tool
 */
export function unregisterTool(toolId: string): boolean {
  const removed = toolRegistry.delete(toolId)
  if (removed) {
    console.log(`[ToolRegistry] Unregistered tool: ${toolId}`)
  }
  return removed
}

/**
 * Get a registered tool by ID
 */
export function getTool(toolId: string): RegisteredTool | undefined {
  return toolRegistry.get(toolId)
}

/**
 * Get all registered tools
 */
export function getAllTools(): ToolDefinition[] {
  return Array.from(toolRegistry.values()).map(t => t.definition)
}

/**
 * Get enabled tools only
 */
export function getEnabledTools(): ToolDefinition[] {
  return getAllTools().filter(t => t.enabled)
}

/**
 * Get tools formatted for AI SDK
 * Returns a record of tool schemas keyed by tool name
 */
export function getToolsForAI(toolSettings?: Record<string, { enabled: boolean; autoExecute: boolean }>): Record<string, AIToolSchema> {
  const result: Record<string, AIToolSchema> = {}

  for (const tool of getAllTools()) {
    // Check if tool is enabled (either by default or by user settings)
    const settings = toolSettings?.[tool.id]
    const isEnabled = settings?.enabled ?? tool.enabled

    if (isEnabled) {
      result[tool.id] = toAIToolSchema(tool)
    }
  }

  return result
}

/**
 * Execute a tool by ID
 */
export async function executeTool(
  toolId: string,
  args: Record<string, any>,
  context: ToolExecutionContext
): Promise<ToolExecutionResult> {
  const registeredTool = toolRegistry.get(toolId)

  if (!registeredTool) {
    return {
      success: false,
      error: `Tool "${toolId}" not found`,
    }
  }

  try {
    console.log(`[ToolRegistry] Executing tool: ${toolId}`, args)
    const result = await registeredTool.handler(args, context)
    console.log(`[ToolRegistry] Tool "${toolId}" completed:`, result.success ? 'success' : 'failed')
    return result
  } catch (error: any) {
    console.error(`[ToolRegistry] Tool "${toolId}" execution error:`, error)
    return {
      success: false,
      error: error.message || 'Unknown error during tool execution',
    }
  }
}

/**
 * Create a ToolCall object
 */
export function createToolCall(
  toolId: string,
  toolName: string,
  args: Record<string, any>
): ToolCall {
  return {
    id: uuidv4(),
    toolId,
    toolName,
    arguments: args,
    status: 'pending',
    timestamp: Date.now(),
  }
}

/**
 * Check if a tool can be auto-executed based on settings
 */
export function canAutoExecute(
  toolId: string,
  toolSettings?: Record<string, { enabled: boolean; autoExecute: boolean }>
): boolean {
  const registeredTool = toolRegistry.get(toolId)
  if (!registeredTool) return false

  const settings = toolSettings?.[toolId]
  return settings?.autoExecute ?? registeredTool.definition.autoExecute
}

/**
 * Initialize the registry with built-in tools
 */
export async function initializeToolRegistry(): Promise<void> {
  if (initialized) {
    console.log('[ToolRegistry] Already initialized')
    return
  }

  console.log('[ToolRegistry] Initializing...')

  // Import and register built-in tools
  const { registerBuiltinTools } = await import('./builtin/index.js')
  registerBuiltinTools()

  initialized = true
  console.log(`[ToolRegistry] Initialized with ${toolRegistry.size} tools`)
}

/**
 * Check if registry is initialized
 */
export function isInitialized(): boolean {
  return initialized
}
