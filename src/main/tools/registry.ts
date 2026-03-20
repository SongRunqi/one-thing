/**
 * Tool Registry
 *
 * Central registry for managing tools. Supports:
 * - Built-in tools (loaded automatically)
 * - Custom tools (can be registered at runtime)
 * - Tool execution with permission checks
 *
 * All tools use the Tool.define() pattern.
 */

import type {
  ToolDefinition,
  ToolCall,
  ToolExecutionContext,
  ToolExecutionResult,
  AIToolSchema,
} from './types.js'
import { toAIToolSchema } from './types.js'
import { v4 as uuidv4 } from 'uuid'
import type { ToolInfo, ToolContext, ToolInfoAsync, ToolInfoUnion, InitContext } from './core/tool.js'
import { zodToJsonSchema, isAsyncTool, Tool } from './core/tool.js'

// Static tool registry (Tool.define() tools)
const toolRegistry: Map<string, ToolInfo> = new Map()

// Async tool registry (Tool.define() with init function)
const asyncToolRegistry: Map<string, ToolInfoAsync> = new Map()

// Track if registry has been initialized
let initialized = false

// Current init context for async tools
let currentInitContext: InitContext | undefined

/**
 * Register a tool (Tool.define() format - both static and async)
 */
export function registerTool<T extends ToolInfoUnion>(tool: T): void {
  if (toolRegistry.has(tool.id) || asyncToolRegistry.has(tool.id)) {
    console.warn(`Tool "${tool.id}" is already registered. Overwriting.`)
  }

  if (isAsyncTool(tool)) {
    asyncToolRegistry.set(tool.id, tool)
  } else {
    toolRegistry.set(tool.id, tool as ToolInfo)
  }
}

/**
 * Unregister a tool
 */
export function unregisterTool(toolId: string): boolean {
  const removedStatic = toolRegistry.delete(toolId)
  const removedAsync = asyncToolRegistry.delete(toolId)
  return removedStatic || removedAsync
}

/**
 * Get a registered static tool by ID
 */
export function getTool(toolId: string): ToolInfo | undefined {
  return toolRegistry.get(toolId)
}

/**
 * Get a registered async tool by ID
 */
export function getAsyncTool(toolId: string): ToolInfoAsync | undefined {
  return asyncToolRegistry.get(toolId)
}

/**
 * Check if a tool exists
 */
export function hasTool(toolId: string): boolean {
  return toolRegistry.has(toolId) || asyncToolRegistry.has(toolId)
}

/**
 * Convert ToolInfo to ToolDefinition format
 */
function toolInfoToDefinition(tool: ToolInfo): ToolDefinition {
  // Extract parameters from Zod schema
  const jsonSchema = zodToJsonSchema(tool.parameters)
  const parameters: ToolDefinition['parameters'] = []

  for (const [name, prop] of Object.entries(jsonSchema.properties)) {
    const propObj = prop as Record<string, unknown>
    const rawType = (propObj.type as string) || 'string'
    // Map JSON Schema types to our supported types
    const type = (['string', 'number', 'boolean', 'object', 'array'].includes(rawType)
      ? rawType
      : 'string') as 'string' | 'number' | 'boolean' | 'object' | 'array'
    parameters.push({
      name,
      type,
      description: (propObj.description as string) || '',
      required: jsonSchema.required.includes(name),
      enum: propObj.enum as string[] | undefined,
    })
  }

  return {
    id: tool.id,
    name: tool.name,
    description: tool.description,
    parameters,
    enabled: tool.enabled ?? true,
    autoExecute: tool.autoExecute ?? false,
    category: tool.category === 'mcp' ? 'custom' : tool.category,
  }
}

/**
 * Get all registered static tools as ToolDefinition[]
 * Note: Does NOT include async tools - use getAllToolsAsync() for that
 */
export function getAllTools(): ToolDefinition[] {
  return Array.from(toolRegistry.values()).map(toolInfoToDefinition)
}

/**
 * Convert async tool init result to ToolDefinition format
 */
function asyncToolToDefinition(tool: ToolInfoAsync): ToolDefinition | null {
  if (!tool._initialized) {
    return null
  }
  const initResult = tool._initialized
  const jsonSchema = zodToJsonSchema(initResult.parameters)
  const parameters: ToolDefinition['parameters'] = []

  for (const [name, prop] of Object.entries(jsonSchema.properties)) {
    const propObj = prop as Record<string, unknown>
    const rawType = (propObj.type as string) || 'string'
    const type = (['string', 'number', 'boolean', 'object', 'array'].includes(rawType)
      ? rawType
      : 'string') as 'string' | 'number' | 'boolean' | 'object' | 'array'
    parameters.push({
      name,
      type,
      description: (propObj.description as string) || '',
      required: jsonSchema.required.includes(name),
      enum: propObj.enum as string[] | undefined,
    })
  }

  return {
    id: tool.id,
    name: tool.name,
    description: initResult.description,  // Dynamic description!
    parameters,
    enabled: tool.enabled ?? true,
    autoExecute: tool.autoExecute ?? false,
    category: tool.category === 'mcp' ? 'custom' : tool.category,
  }
}

/**
 * Get all registered tools including async tools (async version)
 * This initializes any uninitialized async tools first
 */
export async function getAllToolsAsync(): Promise<ToolDefinition[]> {
  const staticTools = Array.from(toolRegistry.values()).map(toolInfoToDefinition)

  // Initialize and convert async tools
  const asyncTools: ToolDefinition[] = []
  for (const tool of asyncToolRegistry.values()) {
    if (!tool._initialized) {
      await Tool.initialize(tool, currentInitContext)
    }
    const def = asyncToolToDefinition(tool)
    if (def) {
      asyncTools.push(def)
    }
  }

  return [...staticTools, ...asyncTools]
}

/**
 * Get enabled tools including async tools (async version)
 * @param toolSettings - Optional per-tool settings from user preferences.
 *                       If provided, uses user settings to determine if tool is enabled.
 *                       If not provided, uses tool's default enabled property.
 */
export async function getEnabledToolsAsync(
  toolSettings?: Record<string, { enabled: boolean; autoExecute: boolean }>
): Promise<ToolDefinition[]> {
  const allTools = await getAllToolsAsync()
  return allTools.filter(t => {
    const settings = toolSettings?.[t.id]
    // User settings take priority, otherwise use tool's default enabled property
    return settings?.enabled ?? t.enabled
  })
}

/**
 * Get all registered static tool infos
 */
export function getAllToolInfos(): ToolInfo[] {
  return Array.from(toolRegistry.values())
}

/**
 * Get all registered async tool infos
 */
export function getAllAsyncToolInfos(): ToolInfoAsync[] {
  return Array.from(asyncToolRegistry.values())
}

/**
 * Get enabled tools only
 */
export function getEnabledTools(): ToolDefinition[] {
  return getAllTools().filter(t => t.enabled)
}

/**
 * Get enabled static tool infos only
 */
export function getEnabledToolInfos(): ToolInfo[] {
  return getAllToolInfos().filter(t => t.enabled !== false)
}

/**
 * Get enabled async tool infos only
 */
export function getEnabledAsyncToolInfos(): ToolInfoAsync[] {
  return getAllAsyncToolInfos().filter(t => t.enabled !== false)
}

/**
 * Set the init context for async tools
 * This should be called before getToolsForAI when the context changes
 */
export function setInitContext(ctx: InitContext | undefined): void {
  currentInitContext = ctx
  // Reset all async tool initializations when context changes
  for (const tool of asyncToolRegistry.values()) {
    Tool.resetInit(tool)
  }
}

/**
 * Get the current init context
 */
export function getInitContext(): InitContext | undefined {
  return currentInitContext
}

/**
 * Initialize all async tools with current context
 */
export async function initializeAsyncTools(ctx?: InitContext): Promise<void> {
  const initContext = ctx ?? currentInitContext
  for (const tool of asyncToolRegistry.values()) {
    if (!tool._initialized) {
      await Tool.initialize(tool, initContext)
    }
  }
}

/**
 * Get tools formatted for AI SDK
 * Returns a record of tool schemas keyed by tool name
 * Includes static and async tools
 * Note: Async tools must be initialized first via initializeAsyncTools()
 */
export async function getToolsForAI(toolSettings?: Record<string, { enabled: boolean; autoExecute: boolean }>): Promise<Record<string, AIToolSchema>> {
  const result: Record<string, AIToolSchema> = {}

  // Add static tools
  for (const tool of getAllToolInfos()) {
    const settings = toolSettings?.[tool.id]
    const isEnabled = settings?.enabled ?? tool.enabled !== false

    if (isEnabled) {
      // Convert Zod schema to AI SDK format
      const jsonSchema = zodToJsonSchema(tool.parameters)
      result[tool.id] = {
        description: tool.description,
        parameters: {
          type: 'object',
          properties: jsonSchema.properties as Record<string, { type: string; description: string; enum?: string[] }>,
          required: jsonSchema.required,
        },
      }
    }
  }

  // Add async tools (must be initialized first)
  for (const tool of getAllAsyncToolInfos()) {
    const settings = toolSettings?.[tool.id]
    const isEnabled = settings?.enabled ?? tool.enabled !== false

    if (isEnabled) {
      // Initialize if not already done
      if (!tool._initialized) {
        await Tool.initialize(tool, currentInitContext)
      }
      const initResult = tool._initialized!

      // Convert Zod schema to AI SDK format
      const jsonSchema = zodToJsonSchema(initResult.parameters)
      result[tool.id] = {
        description: initResult.description,  // Dynamic description!
        parameters: {
          type: 'object',
          properties: jsonSchema.properties as Record<string, { type: string; description: string; enum?: string[] }>,
          required: jsonSchema.required,
        },
      }
    }
  }

  return result
}

/**
 * Execute a tool by ID (supports static and async tools)
 */
export async function executeTool(
  toolId: string,
  args: Record<string, any>,
  context: ToolExecutionContext
): Promise<ToolExecutionResult> {
  // Try static tool
  const staticTool = toolRegistry.get(toolId)
  if (staticTool) {
    try {

      // Validate args with Zod schema
      const parseResult = staticTool.parameters.safeParse(args)
      if (!parseResult.success) {
        const errorMessage = staticTool.formatValidationError
          ? staticTool.formatValidationError(parseResult.error)
          : `Invalid arguments: ${parseResult.error.message}`
        return {
          success: false,
          error: errorMessage,
        }
      }

      // Create context with metadata callback and step callbacks
      const toolCtx: ToolContext = {
        sessionId: context.sessionId,
        messageId: context.messageId,
        toolCallId: context.toolCallId,
        workingDirectory: context.workingDirectory,
        abortSignal: context.abortSignal,
        metadata: (update) => {
          // Forward metadata updates to the execution context callback
          if (context.onMetadata) {
            context.onMetadata({
              title: update.title,
              metadata: update.metadata as Record<string, unknown>,
            })
          }
        },
        // Forward step events to allow sub-agent tools to report progress
        onStepStart: context.onStepStart,
        onStepComplete: context.onStepComplete,
      }

      const result = await staticTool.execute(parseResult.data, toolCtx)

      return {
        success: true,
        data: {
          title: result.title,
          output: result.output,
          metadata: result.metadata,
          attachments: result.attachments,
        },
      }
    } catch (error: any) {
      console.error(`[ToolRegistry] Tool "${toolId}" execution error:`, error)
      return {
        success: false,
        error: error.message || 'Unknown error during tool execution',
      }
    }
  }

  // Try async tool
  const asyncTool = asyncToolRegistry.get(toolId)
  if (asyncTool) {
    try {

      // Ensure tool is initialized
      if (!asyncTool._initialized) {
        await Tool.initialize(asyncTool, currentInitContext)
      }
      const initResult = asyncTool._initialized!

      // Validate args with Zod schema
      const parseResult = initResult.parameters.safeParse(args)
      if (!parseResult.success) {
        const errorMessage = initResult.formatValidationError
          ? initResult.formatValidationError(parseResult.error)
          : `Invalid arguments: ${parseResult.error.message}`
        return {
          success: false,
          error: errorMessage,
        }
      }

      // Create context with metadata callback and step callbacks
      const toolCtx: ToolContext = {
        sessionId: context.sessionId,
        messageId: context.messageId,
        toolCallId: context.toolCallId,
        workingDirectory: context.workingDirectory,
        abortSignal: context.abortSignal,
        metadata: (update) => {
          // Forward metadata updates to the execution context callback
          if (context.onMetadata) {
            context.onMetadata({
              title: update.title,
              metadata: update.metadata as Record<string, unknown>,
            })
          }
        },
        // Forward step events to allow sub-agent tools to report progress
        onStepStart: context.onStepStart,
        onStepComplete: context.onStepComplete,
      }

      const result = await initResult.execute(parseResult.data, toolCtx)

      return {
        success: true,
        data: {
          title: result.title,
          output: result.output,
          metadata: result.metadata,
          attachments: result.attachments,
        },
      }
    } catch (error: any) {
      console.error(`[ToolRegistry] Async Tool "${toolId}" execution error:`, error)
      return {
        success: false,
        error: error.message || 'Unknown error during tool execution',
      }
    }
  }

  return {
    success: false,
    error: `Tool "${toolId}" not found`,
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
  const settings = toolSettings?.[toolId]

  // Check static tool
  const staticTool = toolRegistry.get(toolId)
  if (staticTool) {
    return settings?.autoExecute ?? staticTool.autoExecute ?? false
  }

  // Check async tool
  const asyncTool = asyncToolRegistry.get(toolId)
  if (asyncTool) {
    return settings?.autoExecute ?? asyncTool.autoExecute ?? false
  }

  return false
}

/**
 * Initialize the registry with built-in tools
 */
export async function initializeToolRegistry(): Promise<void> {
  if (initialized) {
    return
  }

  // Import and register built-in tools (both static and async)
  const { registerBuiltinTools } = await import('./builtin/index.js')
  registerBuiltinTools()

  initialized = true
  const allIds = [...toolRegistry.keys(), ...asyncToolRegistry.keys()]
  console.log(`[ToolRegistry] Initialized ${allIds.length} tools [${allIds.join(', ')}]`)
}

/**
 * Check if registry is initialized
 */
export function isInitialized(): boolean {
  return initialized
}
