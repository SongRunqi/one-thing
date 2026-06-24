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
import type { ToolExecutionMode, ToolInfo, ToolContext, ToolInfoAsync, ToolInfoUnion, InitContext } from './core/tool.js'
import type { ToolEffect, ToolPreview } from './core/tool-effect.js'
import { zodToJsonSchema, isAsyncTool, Tool } from './core/tool.js'
import { Permission } from '../permission/index.js'
import { toolFailureText } from './core/tool-result.js'
import { toJsonSchemaObject, type JsonObject } from '../../shared/json.js'

// Static tool registry (Tool.define() tools)
const toolRegistry: Map<string, ToolInfo> = new Map()

// Async tool registry (Tool.define() with init function)
const toolRegistryAsync: Map<string, ToolInfoAsync> = new Map()

// Track if registry has been initialized
let initialized = false

// Current init context for async tools
let currentInitContext: InitContext | undefined

type ToolMetadataPayload = NonNullable<Parameters<NonNullable<ToolExecutionContext['onMetadata']>>[0]['metadata']>
type ToolParameterDefinition = ToolDefinition['parameters'][number]
type ToolParameterType = ToolParameterDefinition['type']

function isPermissionRejectedError(error: object | undefined): error is Permission.RejectedError {
  return error instanceof Permission.RejectedError ||
    (error instanceof Error && error.name === 'PermissionRejectedError')
}

function caughtErrorMessage(error: object | undefined, fallback: string): string {
  if (error instanceof Error && error.message) return error.message
  if (error && 'message' in error && typeof error.message === 'string' && error.message) {
    return error.message
  }
  return fallback
}

function toolParameterType(value: string | undefined): ToolParameterType {
  return value === 'string' ||
    value === 'number' ||
    value === 'boolean' ||
    value === 'object' ||
    value === 'array'
    ? value
    : 'string'
}

function schemaObject(value: object | undefined): {
  type?: string
  description?: string
  enum?: string[]
} {
  const type = value && 'type' in value && typeof value.type === 'string'
    ? value.type
    : undefined
  const description = value && 'description' in value && typeof value.description === 'string'
    ? value.description
    : undefined
  const enumValues = value && 'enum' in value && Array.isArray(value.enum)
    ? value.enum.filter((item): item is string => typeof item === 'string')
    : undefined

  return {
    type,
    description,
    enum: enumValues && enumValues.length > 0 ? enumValues : undefined,
  }
}

function toolParameterFromSchema(
  name: string,
  prop: object | undefined,
  required: boolean
): ToolParameterDefinition {
  const schema = schemaObject(prop)
  return {
    name,
    type: toolParameterType(schema.type),
    description: schema.description ?? '',
    required,
    enum: schema.enum,
  }
}

function aiSchemaProperties(properties: ReturnType<typeof zodToJsonSchema>['properties']): AIToolSchema['parameters']['properties'] {
  const result: AIToolSchema['parameters']['properties'] = {}
  for (const [name, prop] of Object.entries(properties)) {
    const propObject = prop && typeof prop === 'object' && !Array.isArray(prop)
      ? prop
      : undefined
    const schema = schemaObject(propObject)
    result[name] = {
      type: toolParameterType(schema.type),
      description: schema.description ?? '',
      enum: schema.enum,
    }
  }
  return result
}

export interface ToolAnalysisResult {
  success: boolean
  effects?: ToolEffect[]
  preview?: ToolPreview
  error?: string
}

function toToolContext(context: ToolExecutionContext): ToolContext {
  return {
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
          metadata: update.metadata as ToolMetadataPayload,
        })
      }
    },
    updateResult: (update) => {
      context.onPartialResult?.(update)
    },
    onStepStart: context.onStepStart,
    onStepComplete: context.onStepComplete,
    beforeSideEffect: context.beforeSideEffect,
    approvedAnalysis: context.approvedAnalysis,
  }
}

function toToolExecutionError(error: object | undefined): ToolExecutionResult {
  if (isPermissionRejectedError(error)) {
    return {
      success: false,
      error: toolFailureText({ error: error.message, rejected: true, rejectionReason: error.reason }),
      rejected: true,
      rejectionReason: error.reason,
    }
  }

  return { success: false, error: caughtErrorMessage(error, 'Unknown error during tool execution') }
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

export function getToolExecutionMode(toolId: string): ToolExecutionMode {
  const normalized = toolId.toLowerCase()
  if (normalized === 'tool_function' || normalized.startsWith('mcp:') || normalized.startsWith('mcp_')) return 'sequential'

  const staticTool = toolRegistry.get(toolId)
  if (staticTool?.executionMode) return staticTool.executionMode

  const asyncTool = toolRegistryAsync.get(toolId)
  if (asyncTool?._initialized?.executionMode) return asyncTool._initialized.executionMode
  if (asyncTool?.executionMode) return asyncTool.executionMode

  // Compatibility fallback while built-ins migrate to tool-declared executionMode.
  return normalized === 'edit'
    || normalized === 'write'
    || normalized === 'bash'
    || normalized === 'variable'
    ? 'sequential'
    : 'parallel'
}

/**
 * Convert ToolInfo to ToolDefinition format (for external APIs)
 */
function toolInfoToDefinition(tool: ToolInfo): ToolDefinition {
  const jsonSchema = zodToJsonSchema(tool.parameters)
  const parameters: ToolDefinition['parameters'] = []

  for (const [name, prop] of Object.entries(jsonSchema.properties)) {
    const propObject = prop && typeof prop === 'object' && !Array.isArray(prop)
      ? prop
      : undefined
    parameters.push(toolParameterFromSchema(name, propObject, jsonSchema.required.includes(name)))
  }

  return {
    id: tool.id,
    name: tool.name,
    description: tool.description,
    parameters,
    parameterSchema: toJsonSchemaObject(jsonSchema),
    enabled: tool.enabled ?? true,
    autoExecute: tool.autoExecute ?? false,
    permissionGuard: tool.permissionGuard,
    executionMode: tool.executionMode,
    renderKind: tool.renderKind,
    renderShell: tool.renderShell,
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
    const propObject = prop && typeof prop === 'object' && !Array.isArray(prop)
      ? prop
      : undefined
    parameters.push(toolParameterFromSchema(name, propObject, jsonSchema.required.includes(name)))
  }

  return {
    id: tool.id,
    name: tool.name,
    description: initResult.description,
    parameters,
    parameterSchema: toJsonSchemaObject(jsonSchema),
    enabled: tool.enabled ?? true,
    autoExecute: tool.autoExecute ?? false,
    permissionGuard: tool.permissionGuard,
    executionMode: initResult.executionMode ?? tool.executionMode,
    renderKind: initResult.renderKind ?? tool.renderKind,
    renderShell: initResult.renderShell ?? tool.renderShell,
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
 * Get tools formatted for provider execution.
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
          properties: aiSchemaProperties(jsonSchema.properties),
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
          properties: aiSchemaProperties(jsonSchema.properties),
          required: jsonSchema.required,
        },
      }
    }
  }

  return result
}

/**
 * Analyze a tool call by ID without executing side effects.
 */
export async function analyzeTool(
  toolId: string,
  args: JsonObject,
  context: ToolExecutionContext
): Promise<ToolAnalysisResult> {
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
      if (!staticTool.analyze) return { success: true, effects: [] }
      const result = await staticTool.analyze(parseResult.data, toToolContext(context))
      return { success: true, effects: result.effects, preview: result.preview }
    } catch (error) {
      const errorObject = error && typeof error === 'object' ? error : undefined
      return { success: false, error: caughtErrorMessage(errorObject, 'Unknown error during tool analysis') }
    }
  }

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
      if (!initResult.analyze) return { success: true, effects: [] }
      const result = await initResult.analyze(parseResult.data, toToolContext(context))
      return { success: true, effects: result.effects, preview: result.preview }
    } catch (error) {
      const errorObject = error && typeof error === 'object' ? error : undefined
      return { success: false, error: caughtErrorMessage(errorObject, 'Unknown error during tool analysis') }
    }
  }

  return { success: false, error: `Tool not found: ${toolId}` }
}

/**
 * Execute a tool by ID
 */
export async function executeTool(
  toolId: string,
  args: JsonObject,
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
              metadata: update.metadata as ToolMetadataPayload,
            })
          }
        },
        updateResult: (update) => {
          context.onPartialResult?.(update)
        },
        onStepStart: context.onStepStart,
        onStepComplete: context.onStepComplete,
        beforeSideEffect: context.beforeSideEffect,
        approvedAnalysis: context.approvedAnalysis,
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
    } catch (error) {
      const errorObject = error && typeof error === 'object' ? error : undefined
      if (isPermissionRejectedError(errorObject)) {
        console.log(`[ToolRegistry] Tool "${toolId}" permission rejected`)
      } else {
        console.error(`[ToolRegistry] Tool "${toolId}" execution error:`, error)
      }
      return toToolExecutionError(errorObject)
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
              metadata: update.metadata as ToolMetadataPayload,
            })
          }
        },
        updateResult: (update) => {
          context.onPartialResult?.(update)
        },
        onStepStart: context.onStepStart,
        onStepComplete: context.onStepComplete,
        beforeSideEffect: context.beforeSideEffect,
        approvedAnalysis: context.approvedAnalysis,
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
    } catch (error) {
      const errorObject = error && typeof error === 'object' ? error : undefined
      if (isPermissionRejectedError(errorObject)) {
        console.log(`[ToolRegistry] Async Tool "${toolId}" permission rejected`)
      } else {
        console.error(`[ToolRegistry] Async Tool "${toolId}" execution error:`, error)
      }
      return toToolExecutionError(errorObject)
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
  args: JsonObject
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
