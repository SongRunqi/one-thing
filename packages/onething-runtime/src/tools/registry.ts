import { randomUUID } from 'node:crypto'
import type { JsonObject, JsonValue } from '@onething/core'
import {
  HeadlessToolRegistry,
  analyzeCoreToolWithAdapters,
  canCoreToolAutoExecute,
  collectCoreProviderToolSchemasWithAdapters,
  collectCoreToolDefinitionsWithAdapters,
  coreProviderToolSchemaFromJsonSchema,
  coreToolContextFromHost,
  coreToolDefinitionFromJsonSchema,
  executeCoreToolWithAdapters,
  extractCoreErrorMessage,
  filterCoreEnabledTools,
  filterCoreInjectableTools,
  resolveCoreToolExecutionMode,
  type CoreProviderToolSchema,
  type CoreToolParameterDefinition,
} from '@onething/core/tools'
import {
  Tool,
  isAsyncTool,
  zodToJsonSchema,
  type InitContext,
  type ToolContext,
  type ToolExecutionMode,
  type ToolInfo,
  type ToolInfoAsync,
  type ToolInfoUnion,
} from './tool.js'
import type { ToolEffect, ToolPreview } from '@onething/core/tools'

export interface OnethingToolDefinition {
  id: string
  name: string
  description: string
  parameters: CoreToolParameterDefinition[]
  parameterSchema: JsonObject
  enabled: boolean
  autoExecute: boolean
  permissionGuard?: ToolInfo['permissionGuard']
  executionMode?: string
  renderKind?: string
  renderShell?: string
  category: string
}

export interface OnethingToolMetadataUpdate {
  title?: string
  metadata?: JsonObject
}

export interface OnethingToolExecutionContext {
  sessionId: string
  messageId: string
  toolCallId?: string
  workingDirectory?: string
  workingDirectoryRoots?: string[]
  providerId?: string
  providerConfig?: unknown
  toolSettings?: unknown
  abortSignal?: AbortSignal
  skills?: unknown[]
  onStepStart?: (step: unknown) => void
  onStepComplete?: (step: unknown) => void
  onMetadata?: (update: OnethingToolMetadataUpdate) => void
  onPartialResult?: (update: unknown) => void
  beforeSideEffect?: () => Promise<void>
  approvedAnalysis?: { effects: ToolEffect[]; preview?: ToolPreview }
}

export interface OnethingToolExecutionResult {
  success: boolean
  data?: object | JsonValue
  error?: string
  requiresConfirmation?: boolean
  commandType?: 'read-only' | 'dangerous' | 'forbidden'
  aborted?: boolean
  rejected?: boolean
  rejectionReason?: string
}

export interface OnethingToolCall {
  id: string
  toolId: string
  toolName: string
  arguments: JsonObject
  status: 'pending'
  timestamp: number
}

export type OnethingAIToolSchema = CoreProviderToolSchema

export interface OnethingToolAnalysisResult {
  success: boolean
  effects?: ToolEffect[]
  preview?: ToolPreview
  error?: string
}

export interface OnethingToolRuntimeLogger {
  log?(...args: unknown[]): void
  warn?(...args: unknown[]): void
  error?(...args: unknown[]): void
}

export interface OnethingToolRegistryOptions {
  logger?: OnethingToolRuntimeLogger
  createToolCallId?: () => string
}

function isPermissionRejectedError(error: object | undefined): error is Error & { reason?: string } {
  return error instanceof Error && error.name === 'PermissionRejectedError'
}

function toolFailureText(input: { error: string; rejected?: boolean; rejectionReason?: string }): string {
  if (input.rejected) {
    return input.rejectionReason ? `${input.error} Reason: ${input.rejectionReason}` : input.error
  }
  return input.error
}

function toToolExecutionError(error: object | undefined): OnethingToolExecutionResult {
  if (isPermissionRejectedError(error)) {
    return {
      success: false,
      error: toolFailureText({ error: error.message, rejected: true, rejectionReason: error.reason }),
      rejected: true,
      rejectionReason: error.reason,
    }
  }

  return { success: false, error: extractCoreErrorMessage(error, 'Unknown error during tool execution') }
}

export class OnethingToolRegistry {
  private readonly toolRegistry = new HeadlessToolRegistry<ToolInfo, ToolInfoAsync, InitContext>()
  private readonly logger: OnethingToolRuntimeLogger
  private readonly createToolCallId: () => string

  constructor(options: OnethingToolRegistryOptions = {}) {
    this.logger = options.logger ?? console
    this.createToolCallId = options.createToolCallId ?? randomUUID
  }

  registerTool<T extends ToolInfoUnion>(tool: T): void {
    if (this.toolRegistry.has(tool.id)) {
      this.logger.warn?.(`Tool "${tool.id}" is already registered. Overwriting.`)
    }

    if (isAsyncTool(tool)) {
      this.toolRegistry.registerAsync(tool)
    } else {
      this.toolRegistry.registerStatic(tool as ToolInfo)
    }
  }

  unregisterTool(toolId: string): boolean {
    return this.toolRegistry.unregister(toolId)
  }

  getTool(toolId: string): ToolInfo | undefined {
    return this.toolRegistry.getStatic(toolId)
  }

  getToolAsync(toolId: string): ToolInfoAsync | undefined {
    return this.toolRegistry.getAsync(toolId)
  }

  hasTool(toolId: string): boolean {
    return this.toolRegistry.has(toolId)
  }

  getToolExecutionMode(toolId: string): ToolExecutionMode {
    return resolveCoreToolExecutionMode({
      toolId,
      staticTool: this.toolRegistry.getStatic(toolId),
      asyncTool: this.toolRegistry.getAsync(toolId),
    }) as ToolExecutionMode
  }

  getAllTools(): OnethingToolDefinition[] {
    return this.toolRegistry.listStatic().map(tool => this.toolInfoToDefinition(tool))
  }

  async getAllToolsAsync(): Promise<OnethingToolDefinition[]> {
    return collectCoreToolDefinitionsWithAdapters({
      staticTools: this.toolRegistry.listStatic(),
      asyncTools: this.toolRegistry.listAsync(),
      initContext: this.toolRegistry.getInitContext(),
      isAsyncInitialized: tool => Boolean(tool._initialized),
      initializeAsyncTool: async (tool, initContext) => {
        await Tool.initialize(tool, initContext)
      },
      staticToolToDefinition: tool => this.toolInfoToDefinition(tool),
      asyncToolToDefinition: tool => this.asyncToolToDefinition(tool),
    })
  }

  async getEnabledToolsAsync(
    toolSettings?: Record<string, { enabled: boolean; autoExecute: boolean }>,
  ): Promise<OnethingToolDefinition[]> {
    const allTools = await this.getAllToolsAsync()
    return filterCoreInjectableTools(
      allTools,
      toolSettings,
      message => this.logger.warn?.(message),
    ) as OnethingToolDefinition[]
  }

  getAllStaticTools(): ToolInfo[] {
    return this.toolRegistry.listStatic()
  }

  getAllAsyncTools(): ToolInfoAsync[] {
    return this.toolRegistry.listAsync()
  }

  getEnabledTools(): OnethingToolDefinition[] {
    return filterCoreEnabledTools(this.getAllTools())
  }

  getEnabledStaticTools(): ToolInfo[] {
    return filterCoreEnabledTools(this.getAllStaticTools())
  }

  getEnabledAsyncTools(): ToolInfoAsync[] {
    return filterCoreEnabledTools(this.getAllAsyncTools())
  }

  setInitContext(ctx: InitContext | undefined): void {
    this.toolRegistry.setInitContext(ctx)
    for (const tool of this.toolRegistry.listAsync()) {
      Tool.resetInit(tool)
    }
  }

  getInitContext(): InitContext | undefined {
    return this.toolRegistry.getInitContext()
  }

  async initializeAsyncTools(ctx?: InitContext): Promise<void> {
    const initContext = ctx ?? this.toolRegistry.getInitContext()
    for (const tool of this.toolRegistry.listAsync()) {
      if (!tool._initialized) {
        await Tool.initialize(tool, initContext)
      }
    }
  }

  async getToolsForAI(
    toolSettings?: Record<string, { enabled: boolean; autoExecute: boolean }>,
  ): Promise<Record<string, OnethingAIToolSchema>> {
    return collectCoreProviderToolSchemasWithAdapters({
      staticTools: this.getAllStaticTools(),
      asyncTools: this.getAllAsyncTools(),
      settingsById: toolSettings,
      initContext: this.toolRegistry.getInitContext(),
      isAsyncInitialized: tool => Boolean(tool._initialized),
      initializeAsyncTool: async (tool, initContext) => {
        await Tool.initialize(tool, initContext)
      },
      staticToolToSchema(tool) {
        return coreProviderToolSchemaFromJsonSchema({
          description: tool.description,
          jsonSchema: zodToJsonSchema(tool.parameters),
        })
      },
      asyncToolToSchema(tool) {
        if (!tool._initialized) return null
        return coreProviderToolSchemaFromJsonSchema({
          description: tool._initialized.description,
          jsonSchema: zodToJsonSchema(tool._initialized.parameters),
        })
      },
      onBlocked: message => this.logger.warn?.(message),
    })
  }

  async analyzeTool(
    toolId: string,
    args: JsonObject,
    context: OnethingToolExecutionContext,
  ): Promise<OnethingToolAnalysisResult> {
    const staticTool = this.toolRegistry.getStatic(toolId)
    if (staticTool) {
      return analyzeCoreToolWithAdapters({
        parseArgs: () => staticTool.parameters.safeParse(args),
        formatValidationError: error => staticTool.formatValidationError
          ? staticTool.formatValidationError(error)
          : `Invalid arguments: ${error.message}`,
        createContext: () => coreToolContextFromHost(context) as ToolContext,
        analyze: staticTool.analyze
          ? (parsedArgs, toolContext) => staticTool.analyze!(parsedArgs, toolContext)
          : undefined,
        errorFallback: 'Unknown error during tool analysis',
      })
    }

    const asyncTool = this.toolRegistry.getAsync(toolId)
    if (asyncTool) {
      if (!asyncTool._initialized) {
        await Tool.initialize(asyncTool, this.toolRegistry.getInitContext())
      }
      const initResult = asyncTool._initialized!
      return analyzeCoreToolWithAdapters({
        parseArgs: () => initResult.parameters.safeParse(args),
        formatValidationError: error => initResult.formatValidationError
          ? initResult.formatValidationError(error)
          : `Invalid arguments: ${error.message}`,
        createContext: () => coreToolContextFromHost(context) as ToolContext,
        analyze: initResult.analyze
          ? (parsedArgs, toolContext) => initResult.analyze!(parsedArgs, toolContext)
          : undefined,
        errorFallback: 'Unknown error during tool analysis',
      })
    }

    return { success: false, error: `Tool not found: ${toolId}` }
  }

  async executeTool(
    toolId: string,
    args: JsonObject,
    context: OnethingToolExecutionContext,
  ): Promise<OnethingToolExecutionResult> {
    const staticTool = this.toolRegistry.getStatic(toolId)
    if (staticTool) {
      return executeCoreToolWithAdapters({
        parseArgs: () => staticTool.parameters.safeParse(args),
        formatValidationError: error => staticTool.formatValidationError
          ? staticTool.formatValidationError(error)
          : `Invalid arguments: ${error.message}`,
        createContext: () => coreToolContextFromHost(context) as ToolContext,
        execute: (parsedArgs, toolContext) => staticTool.execute(parsedArgs, toolContext),
        onExecutionError: (errorObject, error) => this.logExecutionError(toolId, errorObject, error),
        handleExecutionError: errorObject => toToolExecutionError(errorObject),
      }) as Promise<OnethingToolExecutionResult>
    }

    const asyncTool = this.toolRegistry.getAsync(toolId)
    if (asyncTool) {
      if (!asyncTool._initialized) {
        await Tool.initialize(asyncTool, this.toolRegistry.getInitContext())
      }
      const initResult = asyncTool._initialized!
      return executeCoreToolWithAdapters({
        parseArgs: () => initResult.parameters.safeParse(args),
        formatValidationError: error => initResult.formatValidationError
          ? initResult.formatValidationError(error)
          : `Invalid arguments: ${error.message}`,
        createContext: () => coreToolContextFromHost(context) as ToolContext,
        execute: (parsedArgs, toolContext) => initResult.execute(parsedArgs, toolContext),
        onExecutionError: (errorObject, error) => this.logExecutionError(toolId, errorObject, error, true),
        handleExecutionError: errorObject => toToolExecutionError(errorObject),
      }) as Promise<OnethingToolExecutionResult>
    }

    return { success: false, error: `Tool "${toolId}" not found` }
  }

  createToolCall(toolId: string, toolName: string, args: JsonObject): OnethingToolCall {
    return {
      ...createCoreToolCallShim({
        id: this.createToolCallId(),
        toolId,
        toolName,
        args,
        timestamp: Date.now(),
      }),
      status: 'pending',
    }
  }

  canAutoExecute(
    toolId: string,
    toolSettings?: Record<string, { enabled: boolean; autoExecute: boolean }>,
  ): boolean {
    const settings = toolSettings?.[toolId]
    const staticTool = this.toolRegistry.getStatic(toolId)
    if (staticTool) {
      return canCoreToolAutoExecute(staticTool, settings, message => this.logger.warn?.(message))
    }

    const asyncTool = this.toolRegistry.getAsync(toolId)
    if (asyncTool) {
      return canCoreToolAutoExecute(asyncTool, settings, message => this.logger.warn?.(message))
    }

    return false
  }

  async initializeToolRegistry(registerBuiltins: () => void | Promise<void>, label = 'tools'): Promise<void> {
    if (this.toolRegistry.isInitialized()) return
    await registerBuiltins()
    this.toolRegistry.markInitialized()
    const allIds = this.toolRegistry.listIds()
    this.logger.log?.(`[ToolRegistry] Initialized ${allIds.length} ${label} [${allIds.join(', ')}]`)
  }

  isInitialized(): boolean {
    return this.toolRegistry.isInitialized()
  }

  private toolInfoToDefinition(tool: ToolInfo): OnethingToolDefinition {
    return coreToolDefinitionFromJsonSchema({
      id: tool.id,
      name: tool.name,
      description: tool.description,
      jsonSchema: zodToJsonSchema(tool.parameters),
      enabled: tool.enabled ?? true,
      autoExecute: tool.autoExecute ?? false,
      permissionGuard: tool.permissionGuard,
      executionMode: tool.executionMode,
      renderKind: tool.renderKind,
      renderShell: tool.renderShell,
      category: tool.category === 'mcp' ? 'custom' : tool.category,
    }) as OnethingToolDefinition
  }

  private asyncToolToDefinition(tool: ToolInfoAsync): OnethingToolDefinition | null {
    if (!tool._initialized) return null
    const initResult = tool._initialized
    return coreToolDefinitionFromJsonSchema({
      id: tool.id,
      name: tool.name,
      description: initResult.description,
      jsonSchema: zodToJsonSchema(initResult.parameters),
      enabled: tool.enabled ?? true,
      autoExecute: tool.autoExecute ?? false,
      permissionGuard: tool.permissionGuard,
      executionMode: initResult.executionMode ?? tool.executionMode,
      renderKind: initResult.renderKind ?? tool.renderKind,
      renderShell: initResult.renderShell ?? tool.renderShell,
      category: tool.category === 'mcp' ? 'custom' : tool.category,
    }) as OnethingToolDefinition
  }

  private logExecutionError(toolId: string, errorObject: object | undefined, error: unknown, asyncTool = false): void {
    if (isPermissionRejectedError(errorObject)) {
      this.logger.log?.(`[ToolRegistry] ${asyncTool ? 'Async Tool' : 'Tool'} "${toolId}" permission rejected`)
    } else {
      this.logger.error?.(`[ToolRegistry] ${asyncTool ? 'Async Tool' : 'Tool'} "${toolId}" execution error:`, error)
    }
  }
}

function createCoreToolCallShim(input: {
  id: string
  toolId: string
  toolName: string
  args: JsonObject
  timestamp: number
}): OnethingToolCall {
  return {
    id: input.id,
    toolId: input.toolId,
    toolName: input.toolName,
    arguments: input.args,
    status: 'pending',
    timestamp: input.timestamp,
  }
}

export function createOnethingToolRegistry(options: OnethingToolRegistryOptions = {}): OnethingToolRegistry {
  return new OnethingToolRegistry(options)
}
