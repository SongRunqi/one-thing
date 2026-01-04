/**
 * Tool Registry
 *
 * Central registry for managing tools. Supports:
 * - Built-in tools (loaded automatically)
 * - Custom tools (can be registered at runtime)
 * - Tool execution with permission checks
 *
 * Supports two formats:
 * - Legacy: { definition, handler } objects
 * - V2: Tool.Info objects (via Tool.define())
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
import type { ToolInfo, ToolContext, ToolInfoAsync, ToolInfoUnion, InitContext } from './core/tool.js'
import { zodToJsonSchema, isAsyncTool, Tool } from './core/tool.js'

// Legacy tool registry storage
const toolRegistry: Map<string, RegisteredTool> = new Map()

// V2 tool registry storage (Tool.define() static tools)
const toolRegistryV2: Map<string, ToolInfo> = new Map()

// V2 async tool registry storage (Tool.define() with init function)
const toolRegistryV2Async: Map<string, ToolInfoAsync> = new Map()

// Track if registry has been initialized
let initialized = false

// Current init context for async tools
let currentInitContext: InitContext | undefined

/**
 * Register a tool with its handler (legacy format)
 */
export function registerTool(definition: ToolDefinition, handler: ToolHandler): void {
  if (toolRegistry.has(definition.id) || toolRegistryV2.has(definition.id)) {
    console.warn(`Tool "${definition.id}" is already registered. Overwriting.`)
  }

  toolRegistry.set(definition.id, {
    definition,
    handler,
  })

  console.log(`[ToolRegistry] Registered tool: ${definition.id}`)
}

/**
 * Register a V2 tool (Tool.define() format - both static and async)
 */
export function registerToolV2<T extends ToolInfoUnion>(tool: T): void {
  if (toolRegistry.has(tool.id) || toolRegistryV2.has(tool.id) || toolRegistryV2Async.has(tool.id)) {
    console.warn(`Tool "${tool.id}" is already registered. Overwriting.`)
  }

  if (isAsyncTool(tool)) {
    toolRegistryV2Async.set(tool.id, tool)
    console.log(`[ToolRegistry] Registered V2 async tool: ${tool.id}`)
  } else {
    toolRegistryV2.set(tool.id, tool as ToolInfo)
    console.log(`[ToolRegistry] Registered V2 tool: ${tool.id}`)
  }
}

/**
 * Unregister a tool (from any registry)
 */
export function unregisterTool(toolId: string): boolean {
  const removedLegacy = toolRegistry.delete(toolId)
  const removedV2 = toolRegistryV2.delete(toolId)
  const removedV2Async = toolRegistryV2Async.delete(toolId)
  const removed = removedLegacy || removedV2 || removedV2Async
  if (removed) {
    console.log(`[ToolRegistry] Unregistered tool: ${toolId}`)
  }
  return removed
}

/**
 * Get a registered legacy tool by ID
 */
export function getTool(toolId: string): RegisteredTool | undefined {
  return toolRegistry.get(toolId)
}

/**
 * Get a registered V2 tool by ID (static only)
 */
export function getToolV2(toolId: string): ToolInfo | undefined {
  return toolRegistryV2.get(toolId)
}

/**
 * Get a registered V2 async tool by ID
 */
export function getToolV2Async(toolId: string): ToolInfoAsync | undefined {
  return toolRegistryV2Async.get(toolId)
}

/**
 * Check if a tool exists (in any registry)
 */
export function hasTool(toolId: string): boolean {
  return toolRegistry.has(toolId) || toolRegistryV2.has(toolId) || toolRegistryV2Async.has(toolId)
}

/**
 * Convert V2 tool to legacy ToolDefinition format
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
 * Get all registered tools (both legacy and V2 static)
 * Note: Does NOT include async tools - use getAllToolsAsync() for that
 */
export function getAllTools(): ToolDefinition[] {
  const legacyTools = Array.from(toolRegistry.values()).map(t => t.definition)
  const v2Tools = Array.from(toolRegistryV2.values()).map(toolInfoToDefinition)
  return [...legacyTools, ...v2Tools]
}

/**
 * Convert async tool init result to legacy ToolDefinition format
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
  const legacyTools = Array.from(toolRegistry.values()).map(t => t.definition)
  const v2Tools = Array.from(toolRegistryV2.values()).map(toolInfoToDefinition)

  // Initialize and convert async tools
  const asyncTools: ToolDefinition[] = []
  for (const tool of toolRegistryV2Async.values()) {
    if (!tool._initialized) {
      await Tool.initialize(tool, currentInitContext)
    }
    const def = asyncToolToDefinition(tool)
    if (def) {
      asyncTools.push(def)
    }
  }

  return [...legacyTools, ...v2Tools, ...asyncTools]
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
 * Get all registered V2 tools (static only)
 */
export function getAllToolsV2(): ToolInfo[] {
  return Array.from(toolRegistryV2.values())
}

/**
 * Get all registered V2 async tools
 */
export function getAllToolsV2Async(): ToolInfoAsync[] {
  return Array.from(toolRegistryV2Async.values())
}

/**
 * Get enabled legacy tools only
 */
export function getEnabledTools(): ToolDefinition[] {
  return getAllTools().filter(t => t.enabled)
}

/**
 * Get enabled V2 tools only (static)
 */
export function getEnabledToolsV2(): ToolInfo[] {
  return getAllToolsV2().filter(t => t.enabled !== false)
}

/**
 * Get enabled V2 async tools only
 */
export function getEnabledToolsV2Async(): ToolInfoAsync[] {
  return getAllToolsV2Async().filter(t => t.enabled !== false)
}

/**
 * Set the init context for async tools
 * This should be called before getToolsForAI when the context changes
 */
export function setInitContext(ctx: InitContext | undefined): void {
  currentInitContext = ctx
  // Reset all async tool initializations when context changes
  for (const tool of toolRegistryV2Async.values()) {
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
  for (const tool of toolRegistryV2Async.values()) {
    if (!tool._initialized) {
      await Tool.initialize(tool, initContext)
      console.log(`[ToolRegistry] Initialized async tool: ${tool.id}`)
    }
  }
}

/**
 * Get tools formatted for AI SDK
 * Returns a record of tool schemas keyed by tool name
 * Includes legacy, V2 static, and V2 async tools
 * Note: Async tools must be initialized first via initializeAsyncTools()
 */
export async function getToolsForAI(toolSettings?: Record<string, { enabled: boolean; autoExecute: boolean }>): Promise<Record<string, AIToolSchema>> {
  const result: Record<string, AIToolSchema> = {}

  // Add legacy tools
  for (const tool of getAllTools()) {
    const settings = toolSettings?.[tool.id]
    const isEnabled = settings?.enabled ?? tool.enabled

    if (isEnabled) {
      result[tool.id] = toAIToolSchema(tool)
    }
  }

  // Add V2 static tools
  for (const tool of getAllToolsV2()) {
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

  // Add V2 async tools (must be initialized first)
  for (const tool of getAllToolsV2Async()) {
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
 * Execute a tool by ID (supports legacy, V2 static, and V2 async tools)
 */
export async function executeTool(
  toolId: string,
  args: Record<string, any>,
  context: ToolExecutionContext
): Promise<ToolExecutionResult> {
  // Try legacy tool first
  const legacyTool = toolRegistry.get(toolId)
  if (legacyTool) {
    try {
      console.log(`[ToolRegistry] Executing legacy tool: ${toolId}`, args)
      const result = await legacyTool.handler(args, context)
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

  // Try V2 static tool
  const v2Tool = toolRegistryV2.get(toolId)
  if (v2Tool) {
    try {
      console.log(`[ToolRegistry] Executing V2 tool: ${toolId}`, args)

      // Validate args with Zod schema
      const parseResult = v2Tool.parameters.safeParse(args)
      if (!parseResult.success) {
        const errorMessage = v2Tool.formatValidationError
          ? v2Tool.formatValidationError(parseResult.error)
          : `Invalid arguments: ${parseResult.error.message}`
        return {
          success: false,
          error: errorMessage,
        }
      }

      // Create V2 context with metadata callback
      const v2Context: ToolContext = {
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
      }

      const result = await v2Tool.execute(parseResult.data, v2Context)
      console.log(`[ToolRegistry] V2 Tool "${toolId}" completed:`, result.title)

      // Convert V2 result to legacy format
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
      console.error(`[ToolRegistry] V2 Tool "${toolId}" execution error:`, error)
      return {
        success: false,
        error: error.message || 'Unknown error during tool execution',
      }
    }
  }

  // Try V2 async tool
  const v2AsyncTool = toolRegistryV2Async.get(toolId)
  if (v2AsyncTool) {
    try {
      console.log(`[ToolRegistry] Executing V2 async tool: ${toolId}`, args)

      // Ensure tool is initialized
      if (!v2AsyncTool._initialized) {
        await Tool.initialize(v2AsyncTool, currentInitContext)
      }
      const initResult = v2AsyncTool._initialized!

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

      // Create V2 context with metadata callback
      const v2Context: ToolContext = {
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
      }

      const result = await initResult.execute(parseResult.data, v2Context)
      console.log(`[ToolRegistry] V2 Async Tool "${toolId}" completed:`, result.title)

      // Convert V2 result to legacy format
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
      console.error(`[ToolRegistry] V2 Async Tool "${toolId}" execution error:`, error)
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

  // Check legacy tool
  const legacyTool = toolRegistry.get(toolId)
  if (legacyTool) {
    return settings?.autoExecute ?? legacyTool.definition.autoExecute
  }

  // Check V2 static tool
  const v2Tool = toolRegistryV2.get(toolId)
  if (v2Tool) {
    return settings?.autoExecute ?? v2Tool.autoExecute ?? false
  }

  // Check V2 async tool
  const v2AsyncTool = toolRegistryV2Async.get(toolId)
  if (v2AsyncTool) {
    return settings?.autoExecute ?? v2AsyncTool.autoExecute ?? false
  }

  return false
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

  // Import and register legacy built-in tools
  const { registerBuiltinTools } = await import('./builtin/index.js')
  registerBuiltinTools()

  // Import and register V2 built-in tools (both static and async)
  const { registerBuiltinToolsV2 } = await import('./builtin/index.js')
  registerBuiltinToolsV2()

  initialized = true
  const totalTools = toolRegistry.size + toolRegistryV2.size + toolRegistryV2Async.size
  console.log(`[ToolRegistry] Initialized with ${totalTools} tools (${toolRegistry.size} legacy, ${toolRegistryV2.size} V2 static, ${toolRegistryV2Async.size} V2 async)`)
}

/**
 * Check if registry is initialized
 */
export function isInitialized(): boolean {
  return initialized
}
