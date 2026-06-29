import { toJsonSchemaObject, type JsonObject, type JsonSchemaObject } from '../json.js'
import {
  planToolPermissionGuardAutoExecute,
  planToolPermissionGuardInjection,
  type CoreToolPermissionGuardLike,
} from './permission-guards.js'
import type { ToolDefinition } from './types.js'

export interface CoreToolRegistryItem {
  id: string
}

export type CoreToolExecutionMode = 'parallel' | 'sequential'

export interface CoreToolExecutionModeLike {
  executionMode?: CoreToolExecutionMode
  _initialized?: {
    executionMode?: CoreToolExecutionMode
  }
}

export interface CoreToolEnabledLike extends CoreToolRegistryItem {
  enabled?: boolean
}

export interface CoreToolAutoExecuteLike extends CoreToolPermissionGuardLike {
  autoExecute?: boolean
}

export interface CoreToolSettingsLike {
  enabled: boolean
  autoExecute: boolean
}

export type CoreToolParameterType = 'string' | 'number' | 'boolean' | 'object' | 'array'

export interface CoreToolParameterDefinition {
  name: string
  type: CoreToolParameterType
  description: string
  required?: boolean
  enum?: string[]
}

export interface CoreToolJsonSchemaLike {
  properties?: Record<string, unknown>
  required?: string[]
}

export interface CoreProviderToolSchema {
  description: string
  parameters: {
    type: 'object'
    properties: Record<string, JsonSchemaObject & {
      type: string
      description: string
      enum?: string[]
    }>
    required: string[]
  }
}

export interface CoreToolDefinitionFromJsonSchemaInput {
  id: string
  name: string
  description: string
  jsonSchema: CoreToolJsonSchemaLike
  enabled: boolean
  autoExecute: boolean
  permissionGuard?: string
  executionMode?: string
  renderKind?: string
  renderShell?: string
  category: string
}

export interface CoreProviderToolSchemaFromParametersInput {
  description: string
  parameters: CoreToolParameterDefinition[]
}

export interface CoreToolHostExecutionContext<
  TMetadataUpdate = unknown,
  TPartialResult = unknown,
  TStep = unknown,
  TApprovedAnalysis = unknown,
  TAbortSignal = unknown,
> {
  sessionId: string
  messageId: string
  toolCallId?: string
  workingDirectory?: string
  workingDirectoryRoots?: string[]
  abortSignal?: TAbortSignal
  onMetadata?: (update: TMetadataUpdate) => void
  onPartialResult?: (update: TPartialResult) => void
  onStepStart?: (step: TStep) => void
  onStepComplete?: (step: TStep) => void
  beforeSideEffect?: () => Promise<void>
  approvedAnalysis?: TApprovedAnalysis
}

export interface CoreToolRuntimeContext<
  TMetadata extends object = object,
  TPartialResult = unknown,
  TStep = unknown,
  TApprovedAnalysis = unknown,
  TAbortSignal = unknown,
> {
  sessionId: string
  messageId: string
  toolCallId?: string
  workingDirectory?: string
  workingDirectoryRoots?: string[]
  abortSignal?: TAbortSignal
  metadata(input: { title?: string; metadata?: Partial<TMetadata> }): void
  updateResult?(update: TPartialResult): void
  onStepStart?: (step: TStep) => void
  onStepComplete?: (step: TStep) => void
  beforeSideEffect?: () => Promise<void>
  approvedAnalysis?: TApprovedAnalysis
}

export interface CoreToolRuntimeResult<TMetadata = unknown> {
  title: string
  output: string
  metadata: TMetadata
  attachments?: unknown
}

export interface CoreToolExecutionSuccessResult<TMetadata = unknown> {
  success: true
  data: {
    title: string
    output: string
    metadata: TMetadata
    attachments?: unknown
  }
}

export interface CoreToolAnalysisRuntimeResult<TEffect = unknown, TPreview = unknown> {
  effects: TEffect[]
  preview?: TPreview
}

export interface CoreToolAnalysisSuccessResult<TEffect = unknown, TPreview = unknown> {
  success: true
  effects: TEffect[]
  preview?: TPreview
}

export interface CoreToolFailureResult {
  success: false
  error: string
}

export type CoreMaybePromise<T> = T | Promise<T>

export type CoreToolValidationResult<TArgs, TError = unknown> =
  | { success: true; data: TArgs }
  | { success: false; error: TError }

export interface AnalyzeCoreToolWithAdaptersOptions<
  TArgs,
  TContext,
  TEffect = unknown,
  TPreview = unknown,
  TValidationError = unknown,
> {
  parseArgs(): CoreToolValidationResult<TArgs, TValidationError>
  formatValidationError?(error: TValidationError): string
  createContext(): TContext
  analyze?: (args: TArgs, context: TContext) => CoreMaybePromise<CoreToolAnalysisRuntimeResult<TEffect, TPreview>>
  errorFallback?: string
}

export interface ExecuteCoreToolWithAdaptersOptions<
  TArgs,
  TContext,
  TMetadata = unknown,
  TValidationError = unknown,
  TFailure = CoreToolFailureResult,
> {
  parseArgs(): CoreToolValidationResult<TArgs, TValidationError>
  formatValidationError?(error: TValidationError): string
  createContext(): TContext
  execute(args: TArgs, context: TContext): CoreMaybePromise<CoreToolRuntimeResult<TMetadata>>
  validationFailure?(error: string): TFailure
  handleExecutionError(error: object | undefined, rawError: unknown): TFailure
  onExecutionError?(error: object | undefined, rawError: unknown): void
}

export interface CollectCoreToolDefinitionsWithAdaptersOptions<
  TStatic,
  TAsync,
  TDefinition,
  TInitContext = unknown,
> {
  staticTools: readonly TStatic[]
  asyncTools: readonly TAsync[]
  initContext?: TInitContext
  isAsyncInitialized(tool: TAsync): boolean
  initializeAsyncTool(tool: TAsync, context: TInitContext | undefined): CoreMaybePromise<void>
  staticToolToDefinition(tool: TStatic): TDefinition
  asyncToolToDefinition(tool: TAsync): TDefinition | null | undefined
}

export interface CollectCoreProviderToolSchemasWithAdaptersOptions<
  TStatic extends CoreToolEnabledLike & CoreToolPermissionGuardLike,
  TAsync extends CoreToolEnabledLike & CoreToolPermissionGuardLike,
  TSchema,
  TInitContext = unknown,
> {
  staticTools: readonly TStatic[]
  asyncTools: readonly TAsync[]
  settingsById?: Record<string, CoreToolSettingsLike>
  initContext?: TInitContext
  isAsyncInitialized(tool: TAsync): boolean
  initializeAsyncTool(tool: TAsync, context: TInitContext | undefined): CoreMaybePromise<void>
  staticToolToSchema(tool: TStatic): TSchema
  asyncToolToSchema(tool: TAsync): TSchema | null | undefined
  onBlocked?: (message: string, tool: TStatic | TAsync) => void
}

export type CoreToolDecision =
  | { allowed: true; requested?: boolean }
  | { allowed: false; requested?: boolean; message?: string }

export interface CoreToolCallInput {
  id: string
  toolId: string
  toolName: string
  args: JsonObject
  timestamp: number
}

export interface CorePendingToolCall {
  id: string
  toolId: string
  toolName: string
  arguments: JsonObject
  status: 'pending'
  timestamp: number
}

const SEQUENTIAL_TOOL_ID_FALLBACKS = new Set(['edit', 'write', 'bash', 'variable'])

export function extractCoreErrorMessage(error: object | undefined, fallback: string): string {
  if (error instanceof Error && error.message) return error.message
  if (error && 'message' in error && typeof error.message === 'string' && error.message) {
    return error.message
  }
  return fallback
}

export function normalizeCoreToolParameterType(type: string | undefined): CoreToolParameterType {
  return type === 'string' ||
    type === 'number' ||
    type === 'boolean' ||
    type === 'object' ||
    type === 'array'
    ? type
    : 'string'
}

function coreSchemaObject(value: unknown): {
  type?: string
  description?: string
  enum?: string[]
} {
  const object = value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : undefined
  const type = object && 'type' in object && typeof object.type === 'string'
    ? object.type
    : undefined
  const description = object && 'description' in object && typeof object.description === 'string'
    ? object.description
    : undefined
  const enumValues = object && 'enum' in object && Array.isArray(object.enum)
    ? object.enum.filter((item): item is string => typeof item === 'string')
    : undefined

  return {
    type,
    description,
    enum: enumValues && enumValues.length > 0 ? enumValues : undefined,
  }
}

export function coreToolParameterFromSchema(
  name: string,
  prop: unknown,
  required: boolean,
): CoreToolParameterDefinition {
  const schema = coreSchemaObject(prop)
  return {
    name,
    type: normalizeCoreToolParameterType(schema.type),
    description: schema.description ?? '',
    required,
    enum: schema.enum,
  }
}

export function coreToolParametersFromJsonSchema(schema: CoreToolJsonSchemaLike): CoreToolParameterDefinition[] {
  const required = schema.required ?? []
  return Object.entries(schema.properties ?? {}).map(([name, prop]) => (
    coreToolParameterFromSchema(name, prop, required.includes(name))
  ))
}

export function coreProviderToolSchemaProperties(
  properties: CoreToolJsonSchemaLike['properties'],
): CoreProviderToolSchema['parameters']['properties'] {
  const result: CoreProviderToolSchema['parameters']['properties'] = {}
  for (const [name, prop] of Object.entries(properties ?? {})) {
    const schema = coreSchemaObject(prop)
    result[name] = {
      type: normalizeCoreToolParameterType(schema.type),
      description: schema.description ?? '',
      ...(schema.enum ? { enum: schema.enum } : {}),
    }
  }
  return result
}

export function coreProviderToolSchemaFromJsonSchema(input: {
  description: string
  jsonSchema: CoreToolJsonSchemaLike
}): CoreProviderToolSchema {
  return {
    description: input.description,
    parameters: {
      type: 'object',
      properties: coreProviderToolSchemaProperties(input.jsonSchema.properties),
      required: input.jsonSchema.required ?? [],
    },
  }
}

export function coreProviderToolSchemaFromParameters(
  input: CoreProviderToolSchemaFromParametersInput,
): CoreProviderToolSchema {
  const properties: CoreProviderToolSchema['parameters']['properties'] = {}
  const required: string[] = []

  for (const parameter of input.parameters) {
    properties[parameter.name] = {
      type: parameter.type,
      description: parameter.description,
      ...(parameter.enum ? { enum: parameter.enum } : {}),
    }
    if (parameter.required) {
      required.push(parameter.name)
    }
  }

  return {
    description: input.description,
    parameters: {
      type: 'object',
      properties,
      required,
    },
  }
}

export function coreToolDefinitionFromJsonSchema<TInput extends CoreToolDefinitionFromJsonSchemaInput>(
  input: TInput,
): Omit<TInput, 'jsonSchema'> & {
  parameters: CoreToolParameterDefinition[]
  parameterSchema: JsonSchemaObject
} {
  const { jsonSchema, ...definition } = input
  return {
    ...definition,
    parameters: coreToolParametersFromJsonSchema(jsonSchema),
    parameterSchema: toJsonSchemaObject(jsonSchema),
  }
}

export function coreToolContextFromHost<
  TMetadata extends object,
  TPartialResult,
  TStep,
  TApprovedAnalysis,
  TAbortSignal,
>(
  context: CoreToolHostExecutionContext<
    { title?: string; metadata?: Partial<TMetadata> },
    TPartialResult,
    TStep,
    TApprovedAnalysis,
    TAbortSignal
  >,
): CoreToolRuntimeContext<TMetadata, TPartialResult, TStep, TApprovedAnalysis, TAbortSignal> {
  return {
    sessionId: context.sessionId,
    messageId: context.messageId,
    toolCallId: context.toolCallId,
    workingDirectory: context.workingDirectory,
    workingDirectoryRoots: context.workingDirectoryRoots,
    abortSignal: context.abortSignal,
    metadata: update => {
      context.onMetadata?.({
        title: update.title,
        metadata: update.metadata,
      })
    },
    updateResult: update => {
      context.onPartialResult?.(update)
    },
    onStepStart: context.onStepStart,
    onStepComplete: context.onStepComplete,
    beforeSideEffect: context.beforeSideEffect,
    approvedAnalysis: context.approvedAnalysis,
  }
}

export function coreToolExecutionSuccessResult<TMetadata>(
  result: CoreToolRuntimeResult<TMetadata>,
): CoreToolExecutionSuccessResult<TMetadata> {
  return {
    success: true,
    data: {
      title: result.title,
      output: result.output,
      metadata: result.metadata,
      attachments: result.attachments,
    },
  }
}

export function coreToolAnalysisSuccessResult<TEffect, TPreview>(
  result?: CoreToolAnalysisRuntimeResult<TEffect, TPreview>,
): CoreToolAnalysisSuccessResult<TEffect, TPreview> {
  return {
    success: true,
    effects: result?.effects ?? [],
    preview: result?.preview,
  }
}

export function coreToolValidationFailureMessage<TError>(
  error: TError,
  formatValidationError?: (error: TError) => string,
): string {
  return formatValidationError
    ? formatValidationError(error)
    : `Invalid arguments: ${extractCoreErrorMessage(
      error && typeof error === 'object' ? error : undefined,
      String(error),
    )}`
}

export async function analyzeCoreToolWithAdapters<
  TArgs,
  TContext,
  TEffect = unknown,
  TPreview = unknown,
  TValidationError = unknown,
>(
  options: AnalyzeCoreToolWithAdaptersOptions<TArgs, TContext, TEffect, TPreview, TValidationError>,
): Promise<CoreToolAnalysisSuccessResult<TEffect, TPreview> | CoreToolFailureResult> {
  try {
    const parseResult = options.parseArgs()
    if (!parseResult.success) {
      return {
        success: false,
        error: coreToolValidationFailureMessage(parseResult.error, options.formatValidationError),
      }
    }
    if (!options.analyze) return coreToolAnalysisSuccessResult<TEffect, TPreview>()

    const result = await options.analyze(parseResult.data, options.createContext())
    return coreToolAnalysisSuccessResult(result)
  } catch (error) {
    const errorObject = error && typeof error === 'object' ? error : undefined
    return {
      success: false,
      error: extractCoreErrorMessage(errorObject, options.errorFallback ?? 'Unknown error during tool analysis'),
    }
  }
}

export async function executeCoreToolWithAdapters<
  TArgs,
  TContext,
  TMetadata = unknown,
  TValidationError = unknown,
  TFailure = CoreToolFailureResult,
>(
  options: ExecuteCoreToolWithAdaptersOptions<TArgs, TContext, TMetadata, TValidationError, TFailure>,
): Promise<CoreToolExecutionSuccessResult<TMetadata> | TFailure> {
  const validationFailure = options.validationFailure ?? ((error: string) => ({
    success: false,
    error,
  }) as TFailure)

  try {
    const parseResult = options.parseArgs()
    if (!parseResult.success) {
      return validationFailure(
        coreToolValidationFailureMessage(parseResult.error, options.formatValidationError),
      )
    }

    const result = await options.execute(parseResult.data, options.createContext())
    return coreToolExecutionSuccessResult(result)
  } catch (error) {
    const errorObject = error && typeof error === 'object' ? error : undefined
    options.onExecutionError?.(errorObject, error)
    return options.handleExecutionError(errorObject, error)
  }
}

export async function collectCoreToolDefinitionsWithAdapters<
  TStatic,
  TAsync,
  TDefinition,
  TInitContext = unknown,
>(
  options: CollectCoreToolDefinitionsWithAdaptersOptions<TStatic, TAsync, TDefinition, TInitContext>,
): Promise<TDefinition[]> {
  const staticDefinitions = options.staticTools.map(options.staticToolToDefinition)
  const asyncDefinitions: TDefinition[] = []

  for (const tool of options.asyncTools) {
    if (!options.isAsyncInitialized(tool)) {
      await options.initializeAsyncTool(tool, options.initContext)
    }
    const definition = options.asyncToolToDefinition(tool)
    if (definition) {
      asyncDefinitions.push(definition)
    }
  }

  return [...staticDefinitions, ...asyncDefinitions]
}

export async function collectCoreProviderToolSchemasWithAdapters<
  TStatic extends CoreToolEnabledLike & CoreToolPermissionGuardLike,
  TAsync extends CoreToolEnabledLike & CoreToolPermissionGuardLike,
  TSchema,
  TInitContext = unknown,
>(
  options: CollectCoreProviderToolSchemasWithAdaptersOptions<TStatic, TAsync, TSchema, TInitContext>,
): Promise<Record<string, TSchema>> {
  const result: Record<string, TSchema> = {}

  for (const tool of options.staticTools) {
    if (!isCoreToolInjectable(tool, options.settingsById?.[tool.id], message => options.onBlocked?.(message, tool))) continue
    result[tool.id] = options.staticToolToSchema(tool)
  }

  for (const tool of options.asyncTools) {
    if (!isCoreToolInjectable(tool, options.settingsById?.[tool.id], message => options.onBlocked?.(message, tool))) continue
    if (!options.isAsyncInitialized(tool)) {
      await options.initializeAsyncTool(tool, options.initContext)
    }
    const schema = options.asyncToolToSchema(tool)
    if (schema) {
      result[tool.id] = schema
    }
  }

  return result
}

export function resolveCoreToolExecutionMode(input: {
  toolId: string
  staticTool?: CoreToolExecutionModeLike
  asyncTool?: CoreToolExecutionModeLike
}): CoreToolExecutionMode {
  const normalized = input.toolId.toLowerCase()
  if (normalized === 'tool_function' || normalized.startsWith('mcp:') || normalized.startsWith('mcp_')) {
    return 'sequential'
  }

  if (input.staticTool?.executionMode) return input.staticTool.executionMode
  if (input.asyncTool?._initialized?.executionMode) return input.asyncTool._initialized.executionMode
  if (input.asyncTool?.executionMode) return input.asyncTool.executionMode

  return SEQUENTIAL_TOOL_ID_FALLBACKS.has(normalized) ? 'sequential' : 'parallel'
}

export function isCoreToolEnabled(
  tool: CoreToolEnabledLike,
  settings?: CoreToolSettingsLike
): boolean {
  return settings?.enabled ?? tool.enabled !== false
}

export function filterCoreEnabledTools<T extends CoreToolEnabledLike>(
  tools: readonly T[],
  settingsById?: Record<string, CoreToolSettingsLike>
): T[] {
  return tools.filter(tool => isCoreToolEnabled(tool, settingsById?.[tool.id]))
}

export function planCoreToolProviderInjection(
  tool: CoreToolEnabledLike & CoreToolPermissionGuardLike,
  settings?: CoreToolSettingsLike
): CoreToolDecision {
  if (!isCoreToolEnabled(tool, settings)) {
    return { allowed: false }
  }

  const guardPlan = planToolPermissionGuardInjection(tool)
  return guardPlan.allowed ? { allowed: true } : { allowed: false, message: guardPlan.message }
}

export function isCoreToolInjectable(
  tool: CoreToolEnabledLike & CoreToolPermissionGuardLike,
  settings?: CoreToolSettingsLike,
  onBlocked?: (message: string, tool: CoreToolEnabledLike & CoreToolPermissionGuardLike) => void
): boolean {
  const decision = planCoreToolProviderInjection(tool, settings)
  if (!decision.allowed && decision.message) {
    onBlocked?.(decision.message, tool)
  }
  return decision.allowed
}

export function filterCoreInjectableTools<T extends CoreToolEnabledLike & CoreToolPermissionGuardLike>(
  tools: readonly T[],
  settingsById?: Record<string, CoreToolSettingsLike>,
  onBlocked?: (message: string, tool: T) => void
): T[] {
  return tools.filter(tool => isCoreToolInjectable(
    tool,
    settingsById?.[tool.id],
    onBlocked as ((message: string, tool: CoreToolEnabledLike & CoreToolPermissionGuardLike) => void) | undefined
  ))
}

export function planCoreToolAutoExecute(
  tool: CoreToolAutoExecuteLike | undefined,
  settings?: CoreToolSettingsLike
): CoreToolDecision {
  if (!tool) return { allowed: false, requested: false }

  const requested = settings?.autoExecute ?? tool.autoExecute ?? false
  if (!requested) return { allowed: false, requested: false }

  const guardPlan = planToolPermissionGuardAutoExecute(tool)
  return guardPlan.allowed
    ? { allowed: true, requested: true }
    : { allowed: false, requested: true, message: guardPlan.message }
}

export function canCoreToolAutoExecute(
  tool: CoreToolAutoExecuteLike | undefined,
  settings?: CoreToolSettingsLike,
  onBlocked?: (message: string, tool: CoreToolAutoExecuteLike) => void
): boolean {
  const decision = planCoreToolAutoExecute(tool, settings)
  if (!decision.allowed && decision.message && tool) {
    onBlocked?.(decision.message, tool)
  }
  return decision.allowed
}

export function createCoreToolCall(input: CoreToolCallInput): CorePendingToolCall {
  return {
    id: input.id,
    toolId: input.toolId,
    toolName: input.toolName,
    arguments: input.args,
    status: 'pending',
    timestamp: input.timestamp,
  }
}

export type CoreToolRegistryKind = 'static' | 'async'

export interface CoreToolRegistryRegisterResult {
  id: string
  kind: CoreToolRegistryKind
  alreadyRegistered: boolean
}

export class HeadlessToolRegistry<
  TStatic extends CoreToolRegistryItem,
  TAsync extends CoreToolRegistryItem,
  TInitContext = unknown,
> {
  private readonly staticTools = new Map<string, TStatic>()
  private readonly asyncTools = new Map<string, TAsync>()
  private initialized = false
  private initContext: TInitContext | undefined

  registerStatic(tool: TStatic): CoreToolRegistryRegisterResult {
    const alreadyRegistered = this.has(tool.id)
    this.staticTools.set(tool.id, tool)
    return {
      id: tool.id,
      kind: 'static',
      alreadyRegistered,
    }
  }

  registerAsync(tool: TAsync): CoreToolRegistryRegisterResult {
    const alreadyRegistered = this.has(tool.id)
    this.asyncTools.set(tool.id, tool)
    return {
      id: tool.id,
      kind: 'async',
      alreadyRegistered,
    }
  }

  unregister(toolId: string): boolean {
    const removedStatic = this.staticTools.delete(toolId)
    const removedAsync = this.asyncTools.delete(toolId)
    return removedStatic || removedAsync
  }

  getStatic(toolId: string): TStatic | undefined {
    return this.staticTools.get(toolId)
  }

  getAsync(toolId: string): TAsync | undefined {
    return this.asyncTools.get(toolId)
  }

  has(toolId: string): boolean {
    return this.staticTools.has(toolId) || this.asyncTools.has(toolId)
  }

  listStatic(): TStatic[] {
    return Array.from(this.staticTools.values())
  }

  listAsync(): TAsync[] {
    return Array.from(this.asyncTools.values())
  }

  listIds(): string[] {
    return [...this.staticTools.keys(), ...this.asyncTools.keys()]
  }

  setInitContext(context: TInitContext | undefined): void {
    this.initContext = context
  }

  getInitContext(): TInitContext | undefined {
    return this.initContext
  }

  markInitialized(): void {
    this.initialized = true
  }

  isInitialized(): boolean {
    return this.initialized
  }

  reset(): void {
    this.staticTools.clear()
    this.asyncTools.clear()
    this.initialized = false
    this.initContext = undefined
  }
}

export class ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition>()

  register(tool: ToolDefinition): void {
    if (!tool.name.trim()) {
      throw new Error('Tool name is required')
    }
    this.tools.set(tool.name, tool)
  }

  unregister(name: string): void {
    this.tools.delete(name)
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name)
  }

  has(name: string): boolean {
    return this.tools.has(name)
  }

  list(): ToolDefinition[] {
    return [...this.tools.values()]
  }

  clear(): void {
    this.tools.clear()
  }
}
