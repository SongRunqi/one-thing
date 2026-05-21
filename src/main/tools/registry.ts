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
import { v4 as uuidv4 } from 'uuid'
import type { ToolInfo, ToolContext, ToolInfoAsync, ToolInfoUnion, InitContext } from './core/tool.js'
import { zodToJsonSchema, isAsyncTool, Tool } from './core/tool.js'
import { Permission } from '../permission/index.js'

// Static tool registry (Tool.define() tools)
const toolRegistry: Map<string, ToolInfo> = new Map()

// Async tool registry (Tool.define() with init function)
const toolRegistryAsync: Map<string, ToolInfoAsync> = new Map()

// Track if registry has been initialized
let initialized = false

// Current init context for async tools
let currentInitContext: InitContext | undefined

function isPermissionRejectedError(error: unknown): error is Permission.RejectedError {
  return error instanceof Permission.RejectedError ||
    (error instanceof Error && error.name === 'PermissionRejectedError')
}

function toToolExecutionError(error: any): ToolExecutionResult {
  if (isPermissionRejectedError(error)) {
    return {
      success: false,
      error: error.message || 'User rejected this operation',
      rejected: true,
      rejectionReason: error.reason,
    }
  }

  return { success: false, error: error.message || 'Unknown error during tool execution' }
}

/**
 * Register a tool (Tool.define() format - both static and async)
 */
export function registerTool<T extends ToolInfoUnion>(tool: T): void {
  if (toolRegistry.has(tool.id) || toolRegistryAsync.has(tool.id)) {
    console.warn(`Tool "${tool.id}" is already registered. Overwriting.`)
  }

  if (isAsyncTool(tool)) {
    toolRegistryAsync.set(tool.id, tool)
  } else {
    toolRegistry.set(tool.id, tool as ToolInfo)
  }
}

/**
 * Unregister a tool
 */
export function unregisterTool(toolId: string): boolean {
  const removedStatic = toolRegistry.delete(toolId)
  const removedAsync = toolRegistryAsync.delete(toolId)
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
export function getToolAsync(toolId: string): ToolInfoAsync | undefined {
  return toolRegistryAsync.get(toolId)
}

/**
 * Check if a tool exists
 */
export function hasTool(toolId: string): boolean {
  return toolRegistry.has(toolId) || toolRegistryAsync.has(toolId)
}

/**
 * Convert ToolInfo to ToolDefinition format (for external APIs)
 */
function toolInfoToDefinition(tool: ToolInfo): ToolDefinition {
  const jsonSchema = zodToJsonSchema(tool.parameters)
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
    description: tool.description,
    parameters,
    enabled: tool.enabled ?? true,
    autoExecute: tool.autoExecute ?? false,
    permissionGuard: tool.permissionGuard,
    category: tool.category === 'mcp' ? 'custom' : tool.category,
  }
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
    description: initResult.description,
    parameters,
    enabled: tool.enabled ?? true,
    autoExecute: tool.autoExecute ?? false,
    permissionGuard: tool.permissionGuard,
    category: tool.category === 'mcp' ? 'custom' : tool.category,
  }
}

type PermissionGuard = NonNullable<ToolInfo['permissionGuard']>

const INJECTABLE_PERMISSION_GUARDS = new Set<PermissionGuard>([
  'safe',
  'sandboxed',
  'internal-check',
  'permission-gated',
])

const AUTO_EXECUTE_PERMISSION_GUARDS = new Set<PermissionGuard>([
  'safe',
  'sandboxed',
  'internal-check',
  'permission-gated',
])

function hasInjectablePermissionGuard(tool: { permissionGuard?: ToolInfo['permissionGuard']; id: string }): boolean {
  if (tool.permissionGuard && INJECTABLE_PERMISSION_GUARDS.has(tool.permissionGuard)) {
    return true
  }
  console.warn(`[ToolRegistry] Skipping tool without injectable permission guard: ${tool.id}`)
  return false
}

function hasAutoExecutePermissionGuard(tool: { permissionGuard?: ToolInfo['permissionGuard']; id: string }): boolean {
  if (tool.permissionGuard && AUTO_EXECUTE_PERMISSION_GUARDS.has(tool.permissionGuard)) {
    return true
  }
  console.warn(`[ToolRegistry] Refusing autoExecute for tool without safe permission guard: ${tool.id}`)
  return false
}

/**
 * Get all registered static tools as ToolDefinition
 * Note: Does NOT include async tools - use getAllToolsAsync() for that
 */
export function getAllTools(): ToolDefinition[] {
  return Array.from(toolRegistry.values()).map(toolInfoToDefinition)
}

/**
 * Get all registered tools including async tools (async version)
 * Initializes any uninitialized async tools first
 */
export async function getAllToolsAsync(): Promise<ToolDefinition[]> {
  const staticTools = Array.from(toolRegistry.values()).map(toolInfoToDefinition)

  const asyncTools: ToolDefinition[] = []
  for (const tool of toolRegistryAsync.values()) {
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
 */
export async function getEnabledToolsAsync(
  toolSettings?: Record<string, { enabled: boolean; autoExecute: boolean }>
): Promise<ToolDefinition[]> {
  const allTools = await getAllToolsAsync()
  return allTools.filter(t => {
    const settings = toolSettings?.[t.id]
    return (settings?.enabled ?? t.enabled) && hasInjectablePermissionGuard(t)
  })
}

/**
 * Get all static ToolInfo objects
 */
export function getAllStaticTools(): ToolInfo[] {
  return Array.from(toolRegistry.values())
}

/**
 * Get all async ToolInfoAsync objects
 */
export function getAllAsyncTools(): ToolInfoAsync[] {
  return Array.from(toolRegistryAsync.values())
}

/**
 * Get enabled tools only
 */
export function getEnabledTools(): ToolDefinition[] {
  return getAllTools().filter(t => t.enabled)
}

/**
 * Get enabled static ToolInfo objects
 */
export function getEnabledStaticTools(): ToolInfo[] {
  return getAllStaticTools().filter(t => t.enabled !== false)
}

/**
 * Get enabled async ToolInfoAsync objects
 */
export function getEnabledAsyncTools(): ToolInfoAsync[] {
  return getAllAsyncTools().filter(t => t.enabled !== false)
}

/**
 * Set the init context for async tools
 * Should be called before getToolsForAI when the context changes
 */
export function setInitContext(ctx: InitContext | undefined): void {
  currentInitContext = ctx
  for (const tool of toolRegistryAsync.values()) {
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
  for (const tool of toolRegistryAsync.values()) {
    if (!tool._initialized) {
      await Tool.initialize(tool, initContext)
    }
  }
}

/**
 * Get tools formatted for AI SDK
 * Returns a record of tool schemas keyed by tool name
 */
export async function getToolsForAI(toolSettings?: Record<string, { enabled: boolean; autoExecute: boolean }>): Promise<Record<string, AIToolSchema>> {
  const result: Record<string, AIToolSchema> = {}

  // Add static tools
  for (const tool of getAllStaticTools()) {
    const settings = toolSettings?.[tool.id]
    const isEnabled = settings?.enabled ?? tool.enabled !== false

    if (isEnabled && hasInjectablePermissionGuard(tool)) {
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
  for (const tool of getAllAsyncTools()) {
    const settings = toolSettings?.[tool.id]
    const isEnabled = settings?.enabled ?? tool.enabled !== false

    if (isEnabled && hasInjectablePermissionGuard(tool)) {
      if (!tool._initialized) {
        await Tool.initialize(tool, currentInitContext)
      }
      const initResult = tool._initialized!

      const jsonSchema = zodToJsonSchema(initResult.parameters)
      result[tool.id] = {
        description: initResult.description,
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
 * Execute a tool by ID
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
      const parseResult = staticTool.parameters.safeParse(args)
      if (!parseResult.success) {
        const errorMessage = staticTool.formatValidationError
          ? staticTool.formatValidationError(parseResult.error)
          : `Invalid arguments: ${parseResult.error.message}`
        return { success: false, error: errorMessage }
      }

      const toolContext: ToolContext = {
        sessionId: context.sessionId,
        messageId: context.messageId,
        toolCallId: context.toolCallId,
        workingDirectory: context.workingDirectory,
        workingDirectoryRoots: context.workingDirectoryRoots,
        abortSignal: context.abortSignal,
        metadata: (update) => {
          if (context.onMetadata) {
            context.onMetadata({
              title: update.title,
              metadata: update.metadata as Record<string, unknown>,
            })
          }
        },
        onStepStart: context.onStepStart,
        onStepComplete: context.onStepComplete,
        beforeSideEffect: context.beforeSideEffect,
      }

      const result = await staticTool.execute(parseResult.data, toolContext)
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
      if (isPermissionRejectedError(error)) {
        console.log(`[ToolRegistry] Tool "${toolId}" permission rejected`)
      } else {
        console.error(`[ToolRegistry] Tool "${toolId}" execution error:`, error)
      }
      return toToolExecutionError(error)
    }
  }

  // Try async tool
  const asyncTool = toolRegistryAsync.get(toolId)
  if (asyncTool) {
    try {
      if (!asyncTool._initialized) {
        await Tool.initialize(asyncTool, currentInitContext)
      }
      const initResult = asyncTool._initialized!

      const parseResult = initResult.parameters.safeParse(args)
      if (!parseResult.success) {
        const errorMessage = initResult.formatValidationError
          ? initResult.formatValidationError(parseResult.error)
          : `Invalid arguments: ${parseResult.error.message}`
        return { success: false, error: errorMessage }
      }

      const toolContext: ToolContext = {
        sessionId: context.sessionId,
        messageId: context.messageId,
        toolCallId: context.toolCallId,
        workingDirectory: context.workingDirectory,
        workingDirectoryRoots: context.workingDirectoryRoots,
        abortSignal: context.abortSignal,
        metadata: (update) => {
          if (context.onMetadata) {
            context.onMetadata({
              title: update.title,
              metadata: update.metadata as Record<string, unknown>,
            })
          }
        },
        onStepStart: context.onStepStart,
        onStepComplete: context.onStepComplete,
        beforeSideEffect: context.beforeSideEffect,
      }

      const result = await initResult.execute(parseResult.data, toolContext)
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
      if (isPermissionRejectedError(error)) {
        console.log(`[ToolRegistry] Async Tool "${toolId}" permission rejected`)
      } else {
        console.error(`[ToolRegistry] Async Tool "${toolId}" execution error:`, error)
      }
      return toToolExecutionError(error)
    }
  }

  return { success: false, error: `Tool "${toolId}" not found` }
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

  const staticTool = toolRegistry.get(toolId)
  if (staticTool) {
    const requested = settings?.autoExecute ?? staticTool.autoExecute ?? false
    return requested && hasAutoExecutePermissionGuard(staticTool)
  }

  const asyncTool = toolRegistryAsync.get(toolId)
  if (asyncTool) {
    const requested = settings?.autoExecute ?? asyncTool.autoExecute ?? false
    return requested && hasAutoExecutePermissionGuard(asyncTool)
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

  const { registerBuiltinTools } = await import('./builtin/index.js')
  registerBuiltinTools()

  initialized = true
  const allIds = [...toolRegistry.keys(), ...toolRegistryAsync.keys()]
  console.log(`[ToolRegistry] Initialized ${allIds.length} tools [${allIds.join(', ')}]`)
}

/**
 * Check if registry is initialized
 */
export function isInitialized(): boolean {
  return initialized
}
