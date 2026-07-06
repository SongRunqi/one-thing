import {
  getContextCompactReason,
  shouldSkipAutoCompactForProviderUsageMismatch,
  type CoreCompactSession,
} from './context-compact.js'
import {
  buildContextUsageSnapshot,
} from './context-usage.js'
import type {
  CoreBuildPromptOptions,
  CorePromptRequestMessage,
} from './system-prompt.js'
import {
  agentToolDefinitionsFromSourceTools,
  agentToolsFromToolDefinitions,
  type AgentModelToolDefinition,
  type AgentSourceToolDefinition,
} from '../agent-loop/tools.js'
import { resolveAIToolName } from '../agent-loop/tool-names.js'
import type { AgentTool } from '../agent-loop/types.js'
import { toJsonObject, toJsonValue, type JsonObject } from '../json.js'

export interface CoreAgentLoopContextBudget {
  modelContextLength: number
  reservedOutputTokens: number
  thresholdPercent: number
}

export interface CoreAgentLoopProviderConfig {
  model: string
  maxOutputByModel?: Record<string, number | undefined>
}

export interface CoreAgentLoopProviderRuntimeConfigLike extends CoreAgentLoopProviderConfig {
  apiKey?: unknown
  baseUrl?: unknown
  zhipuApiMode?: unknown
  apiType?: unknown
  oauthToken?: unknown
  authContext?: unknown
  modelCapabilitiesByModel?: unknown
  models?: unknown
}

export type CoreAgentLoopProviderRuntimeConfigFor<TProviderConfig extends CoreAgentLoopProviderRuntimeConfigLike> =
  Pick<TProviderConfig,
    | 'apiKey'
    | 'baseUrl'
    | 'zhipuApiMode'
    | 'model'
    | 'apiType'
    | 'oauthToken'
    | 'authContext'
    | 'modelCapabilitiesByModel'
    | 'models'
  >

export interface CoreAgentLoopRuntimeSessionLike {
  workingDirectory?: string
  workingDirectoryRoots?: string[]
  agentId?: string
}

export interface CoreAgentLoopRuntimeToolSettingsLike extends CoreAgentLoopToolSettings {
  enableToolCalls?: boolean
}

export interface CoreAgentLoopRuntimeSettingsLike<TToolSettings extends CoreAgentLoopRuntimeToolSettingsLike | undefined> {
  skills?: {
    enableSkills?: boolean
  }
  tools?: TToolSettings
}

export interface CoreAgentLoopRuntimeContextLike<
  TProviderConfig extends CoreAgentLoopProviderRuntimeConfigLike,
  TSettings extends CoreAgentLoopRuntimeSettingsLike<TToolSettings>,
  TToolSettings extends CoreAgentLoopRuntimeToolSettingsLike | undefined,
> {
  sessionId: string
  providerConfig: TProviderConfig
  settings: TSettings
  toolSettings?: TToolSettings
}

export interface CoreAgentLoopProviderHostContext {
  workingDirectory?: string
  localSessionId: string
}

export interface CoreAgentLoopRuntimePreparationPlan<
  TProviderConfig extends CoreAgentLoopProviderRuntimeConfigLike,
  TToolSettings extends CoreAgentLoopRuntimeToolSettingsLike | undefined,
> {
  sessionWorkingDir?: string
  sessionWorkingDirRoots?: string[]
  agentId?: string
  skillsEnabled: boolean
  effectiveToolSettings?: TToolSettings
  toolCallsEnabled: boolean
  providerRuntimeConfig: CoreAgentLoopProviderRuntimeConfigFor<TProviderConfig>
  providerHostContext: CoreAgentLoopProviderHostContext
}

export interface CoreAgentLoopPromptRuntimeContextLike<
  TProviderConfig extends CoreBuildPromptOptions['providerConfig'],
  TSettings = unknown,
> {
  sessionId: string
  providerId: string
  providerConfig: TProviderConfig
  settings: TSettings
  voiceConversation?: boolean
  speakMode?: boolean
}

export interface CoreAgentLoopPromptBuildInput<
  TProviderConfig extends CoreBuildPromptOptions['providerConfig'] = CoreBuildPromptOptions['providerConfig'],
  TSettings = unknown,
> {
  ctx: CoreAgentLoopPromptRuntimeContextLike<TProviderConfig, TSettings>
  agentId?: string
  hasTools: boolean
  skills: CoreBuildPromptOptions['skills']
  workingDirectory?: string
  workingDirectoryRoots?: string[]
  contextVariables?: string
  activeProject?: CoreBuildPromptOptions['activeProject']
  knownProjects?: CoreBuildPromptOptions['knownProjects']
  toolNames?: string[]
  mcpToolNames?: string[]
  historyMessages: CorePromptRequestMessage[]
}

export interface CoreAgentLoopModelLimits {
  maxInputTokens?: number
  maxOutputTokens?: number
}

export interface ResolveAgentLoopContextBudgetOptions {
  capabilities?: CoreAgentLoopModelLimits
  providerId: string
  providerConfig: CoreAgentLoopProviderConfig
  chatMaxTokens?: number
  contextCompactThreshold?: number
  resolveModelContextLength?: (model: string, providerId: string) => number | undefined | Promise<number | undefined>
  resolveModelMaxOutputTokens?: (model: string, providerId: string) => number | undefined | Promise<number | undefined>
}

export interface CoreAgentLoopContextBudgetResolution {
  budget: CoreAgentLoopContextBudget
  error?: unknown
}

export interface CoreAgentLoopThinkingContext {
  providerId: string
  providerConfig: CoreAgentLoopProviderConfig
}

export interface CoreAgentLoopActiveMemorySettings {
  general?: {
    soulMemory?: {
      enabled?: boolean
      activeMemory?: {
        enabled?: boolean
        timeoutMs?: number
      }
    }
  }
}

export type CoreAgentLoopActiveMemoryLoadingPlan =
  | {
      shouldShow: false
      timeoutMs: number
    }
  | {
      shouldShow: true
      timeoutMs: number
      startPart: { type: 'loading-memory' }
      waitingPart: { type: 'waiting' }
    }

export interface CoreAgentLoopMessage {
  role: string
  content?: unknown
  toolCalls?: unknown[]
}

export interface CoreResolvedPendingAgentLoopMessage<TContentParts = unknown> {
  id: string
  modelContent: string
  timestamp: number
  contentParts?: TContentParts
  persisted?: boolean
  origin?: unknown
}

export interface CorePendingAgentLoopInputMessage {
  content: string
  timestamp: number
  source?: string
  id?: string
  modelContent?: string
  contentParts?: unknown
  persisted?: boolean
  origin?: unknown
}

export interface CorePendingAgentLoopPromptResolution<TContentParts = unknown> {
  modelContent: string
  contentParts?: TContentParts
}

export interface CorePendingAgentLoopRuntimeMessage {
  role: 'user'
  content: string
}

export interface CorePendingAgentLoopChatMessage<TContentParts = unknown> {
  id: string
  role: 'user'
  content: string
  timestamp: number
  contentParts?: TContentParts
  persisted?: boolean
  origin?: unknown
}

export interface CorePendingAgentLoopInjectionResult<
  TMessage extends CoreAgentLoopMessage = CoreAgentLoopMessage,
  TContentParts = unknown,
> {
  messages: Array<TMessage | CorePendingAgentLoopRuntimeMessage>
  chatMessages: Array<CorePendingAgentLoopChatMessage<TContentParts>>
}

export type CoreAgentLoopTurnMessages<TMessage extends CoreAgentLoopMessage = CoreAgentLoopMessage> =
  Array<TMessage | CorePendingAgentLoopRuntimeMessage>

export interface CoreAgentLoopPendingMessageAdapters<TContentParts = unknown> {
  createPendingMessageId(): string
  resolvePromptReferences(content: string): CorePendingAgentLoopPromptResolution<TContentParts>
  persistInjectedChatMessage(message: CorePendingAgentLoopChatMessage<TContentParts>): void | Promise<void>
}

export interface CoreAgentLoopTurnQueueAdapters {
  drainSteeringMessages?: () => CorePendingAgentLoopInputMessage[]
  drainFollowUpMessages?: () => CorePendingAgentLoopInputMessage[]
}

export interface CoreAgentLoopProviderConfigWithOptionalKey {
  apiKey?: string
}

export type CoreAgentLoopSkillSource = 'user' | 'project' | 'plugin' | 'builtin'

export interface CoreAgentLoopSkillLike {
  id: string
  name: string
  description: string
  source: CoreAgentLoopSkillSource
  category?: string
  tags?: string[]
  relatedSkills?: string[]
  platforms?: string[]
  conditions?: {
    fallbackForToolsets?: string[]
    requiresToolsets?: string[]
    fallbackForTools?: string[]
    requiresTools?: string[]
  }
  path: string
  directoryPath: string
  rootPath?: string
  relativePath?: string
  enabled: boolean
  instructions: string
  runtimeContext?: string
  disableModelInvocation?: boolean
  files?: Array<{ name: string; path: string; type: string }>
}

export interface CoreAgentLoopSkillContext {
  name: string
  description?: string
  instructions?: string
  source?: string
  location?: string
  disableModelInvocation?: boolean
}

export interface CoreAgentLoopInitSkillSnapshot {
  id: string
  name: string
  description: string
  source: CoreAgentLoopSkillSource
  category?: string
  tags?: string[]
  relatedSkills?: string[]
  conditions?: CoreAgentLoopSkillLike['conditions']
  disableModelInvocation?: boolean
  platforms?: string[]
  path: string
  directoryPath: string
  rootPath?: string
  relativePath?: string
  enabled: boolean
  instructions: string
  runtimeContext?: string
  files?: Array<{ name: string; path: string; type: string }>
}

export interface CoreAgentLoopToolSettings {
  tools?: Record<string, { enabled?: boolean } | undefined>
}

export interface CoreAgentLoopToolPlan<TTool extends AgentSourceToolDefinition = AgentSourceToolDefinition> {
  enabledTools: TTool[]
  builtinToolDefinitions: Record<string, AgentModelToolDefinition>
  mcpToolDefinitions: Record<string, AgentModelToolDefinition>
  modelToolDefinitions: Record<string, AgentModelToolDefinition>
  hasTools: boolean
  toolNames: string[]
  mcpToolNames: string[]
}

export interface CoreAgentLoopDirectToolRuntimeContext {
  sessionId: string
  messageId: string
  workingDirectory?: string
  workingDirectoryRoots?: string[]
  abortSignal?: AbortSignal
}

export interface CoreAgentLoopDirectToolMetadataUpdate {
  title?: string
  metadata?: unknown
}

export interface CoreAgentLoopDirectToolResultLike {
  success: boolean
  data?: unknown
  error?: string
  requiresConfirmation?: boolean
  commandType?: 'read-only' | 'dangerous' | 'forbidden'
  aborted?: boolean
  rejected?: boolean
  rejectionReason?: string
}

export interface CoreAgentLoopDirectToolExecutionContext<TPartialResultUpdate = unknown> {
  sessionId: string
  messageId: string
  toolCallId: string
  workingDirectory?: string
  workingDirectoryRoots?: string[]
  abortSignal?: AbortSignal
  onMetadata?: (update: CoreAgentLoopDirectToolMetadataUpdate) => void
  onPartialResult?: (update: TPartialResultUpdate) => void
}

export interface BuildAgentLoopDirectToolsWithAdaptersOptions<
  TResult extends CoreAgentLoopDirectToolResultLike,
  TPartialResultUpdate = unknown,
> {
  definitions: Record<string, AgentModelToolDefinition>
  context: CoreAgentLoopDirectToolRuntimeContext
  executeToolDirectly: (
    toolName: string,
    args: JsonObject,
    context: CoreAgentLoopDirectToolExecutionContext<TPartialResultUpdate>,
  ) => Promise<TResult>
}

export type CoreAgentLoopCompactReason = 'threshold' | 'hard-limit'

export interface CoreAgentLoopCompactState {
  configuredKeepTurns: number
  keepRecentTurns: number
  pass: number
  compacted: boolean
}

export type CoreAgentLoopCompactPassPlan =
  | { kind: 'stop'; state: CoreAgentLoopCompactState }
  | { kind: 'skip-provider-usage-mismatch'; state: CoreAgentLoopCompactState }
  | {
      kind: 'compact'
      state: CoreAgentLoopCompactState
      reason: CoreAgentLoopCompactReason
      keepRecentTurns: number
      pass: number
    }

export type CoreAgentLoopCompactResultPlan =
  | { kind: 'retry'; state: CoreAgentLoopCompactState }
  | { kind: 'stop'; state: CoreAgentLoopCompactState }
  | { kind: 'hard-limit-failure'; state: CoreAgentLoopCompactState }

export type CoreAgentLoopCompactFinalPlan =
  | { kind: 'none' }
  | { kind: 'rebuild' }
  | { kind: 'hard-limit'; inputTokens: number }

export interface CoreAgentLoopCompactResultLike {
  success: boolean
  skipped?: boolean
  summary?: string
  error?: string
  retainedContextSize?: number
}

export type CoreAgentLoopCompactEventPlan =
  | {
      type: 'context:compact-completed'
      success: boolean
      skipped?: boolean
      summary?: string
      error?: string
    }
  | {
      type: 'context:size-updated'
      contextSize: number
    }

export interface CoreAgentLoopCompactSessionLike extends CoreCompactSession {
  contextSize?: number
  lastInputTokens?: number
}

export interface CoreAgentLoopCompactionContext<TSettings, TProviderConfig extends object> {
  sessionId: string
  providerId: string
  providerConfig: TProviderConfig
  settings: TSettings
}

export interface CoreAgentLoopCompactLogger {
  log?: (...args: unknown[]) => void
  warn?: (...args: unknown[]) => void
  error?: (...args: unknown[]) => void
}

export interface CoreAgentLoopCompactionAdapters<
  TSettings,
  TProviderConfig extends object,
  TSession extends CoreAgentLoopCompactSessionLike,
  TMessage,
  TCompactResult extends CoreAgentLoopCompactResultLike = CoreAgentLoopCompactResultLike,
> {
  getSession(sessionId: string): TSession | null | undefined
  compactSessionContext(input: {
    sessionId: string
    providerId: string
    configWithApiKey: TProviderConfig & { apiKey: string }
    settings: TSettings
    keepRecentTurns: number
    onMessageCreated: (message: unknown) => Promise<void>
    onMessageUpdated: (messageId: string, updates: unknown) => Promise<void>
  }): Promise<TCompactResult>
  emitEvent(sessionId: string, event: CoreAgentLoopCompactEventPlan | { type: 'message:created'; message: unknown } | { type: 'message:updated'; messageId: string; updates: unknown }): Promise<void>
  rebuildMessages(): Promise<TMessage[]>
  shouldSkipProviderUsageMismatch?: (input: {
    providerId: string
    session: TSession
    modelContextLength: number
    inputTokens?: number
  }) => boolean
  logger?: CoreAgentLoopCompactLogger
}

export interface MaybeCompactAgentLoopContextOptions<
  TSettings,
  TProviderConfig extends object,
  TSession extends CoreAgentLoopCompactSessionLike,
  TMessage,
  TCompactResult extends CoreAgentLoopCompactResultLike = CoreAgentLoopCompactResultLike,
> {
  ctx: CoreAgentLoopCompactionContext<TSettings, TProviderConfig>
  turn: number
  messages: TMessage[]
  budget: CoreAgentLoopContextBudget
  compactEnabled: boolean
  keepRecentTurns: number
  adapters: CoreAgentLoopCompactionAdapters<TSettings, TProviderConfig, TSession, TMessage, TCompactResult>
}

export type CoreAgentLoopTurnCompactionAdapters<
  TSettings,
  TProviderConfig extends object,
  TSession extends CoreAgentLoopCompactSessionLike,
  TMessage,
  TCompactResult extends CoreAgentLoopCompactResultLike = CoreAgentLoopCompactResultLike,
> = Omit<CoreAgentLoopCompactionAdapters<TSettings, TProviderConfig, TSession, TMessage, TCompactResult>, 'rebuildMessages'>

export interface RunAgentLoopBeforeTurnWithAdaptersOptions<
  TSettings,
  TProviderConfig extends object,
  TSession extends CoreAgentLoopCompactSessionLike,
  TMessage extends CoreAgentLoopMessage,
  TContentParts = unknown,
  TCompactResult extends CoreAgentLoopCompactResultLike = CoreAgentLoopCompactResultLike,
> {
  ctx: CoreAgentLoopCompactionContext<TSettings, TProviderConfig>
  turn: number
  messages: TMessage[]
  budget: CoreAgentLoopContextBudget
  compactEnabled: boolean
  keepRecentTurns: number
  rebuildMessages(messages: CoreAgentLoopTurnMessages<TMessage>): Promise<TMessage[]>
  adapters:
    & CoreAgentLoopPendingMessageAdapters<TContentParts>
    & CoreAgentLoopTurnQueueAdapters
    & CoreAgentLoopTurnCompactionAdapters<TSettings, TProviderConfig, TSession, TMessage, TCompactResult>
}

export interface RunAgentLoopAfterTurnWithAdaptersOptions<
  TMessage extends CoreAgentLoopMessage,
  TContentParts = unknown,
> {
  messages: TMessage[]
  adapters: CoreAgentLoopPendingMessageAdapters<TContentParts> & CoreAgentLoopTurnQueueAdapters
}

export function configWithApiKey<TConfig extends object>(
  config: TConfig,
): TConfig & { apiKey: string } {
  return {
    ...config,
    apiKey: (config as { apiKey?: string }).apiKey ?? '',
  }
}

export function agentLoopSkillContexts<TSkill extends CoreAgentLoopSkillLike>(
  skills: TSkill[],
): CoreAgentLoopSkillContext[] {
  return skills
    .filter(skill => skill.enabled !== false && !skill.disableModelInvocation)
    .map(skill => ({
      name: skill.name,
      description: skill.description,
      instructions: skill.instructions,
      source: skill.path,
      location: skill.path,
      disableModelInvocation: skill.disableModelInvocation,
    }))
}

export function agentLoopInitSkills<TSkill extends CoreAgentLoopSkillLike>(
  skills: TSkill[],
): CoreAgentLoopInitSkillSnapshot[] {
  return skills.map(skill => ({
    id: skill.id,
    name: skill.name,
    description: skill.description,
    source: skill.source,
    category: skill.category,
    tags: skill.tags,
    relatedSkills: skill.relatedSkills,
    conditions: skill.conditions,
    disableModelInvocation: skill.disableModelInvocation,
    platforms: skill.platforms,
    path: skill.path,
    directoryPath: skill.directoryPath,
    rootPath: skill.rootPath,
    relativePath: skill.relativePath,
    enabled: skill.enabled,
    instructions: skill.instructions,
    runtimeContext: skill.runtimeContext,
    files: skill.files?.map(file => ({ name: file.name, path: file.path, type: file.type })),
  }))
}

export function planAgentLoopRuntimePreparation<
  TProviderConfig extends CoreAgentLoopProviderRuntimeConfigLike,
  TSettings extends CoreAgentLoopRuntimeSettingsLike<TToolSettings>,
  TToolSettings extends CoreAgentLoopRuntimeToolSettingsLike | undefined,
>(input: {
  ctx: CoreAgentLoopRuntimeContextLike<TProviderConfig, TSettings, TToolSettings>
  session?: CoreAgentLoopRuntimeSessionLike | null
}): CoreAgentLoopRuntimePreparationPlan<TProviderConfig, TToolSettings> {
  const sessionWorkingDir = input.session?.workingDirectory
  const sessionWorkingDirRoots = input.session?.workingDirectoryRoots
  const effectiveToolSettings = input.ctx.toolSettings ?? input.ctx.settings.tools

  return {
    sessionWorkingDir,
    sessionWorkingDirRoots,
    agentId: input.session?.agentId,
    skillsEnabled: input.ctx.settings.skills?.enableSkills !== false,
    effectiveToolSettings,
    toolCallsEnabled: effectiveToolSettings?.enableToolCalls !== false,
    providerRuntimeConfig: {
      apiKey: input.ctx.providerConfig.apiKey,
      baseUrl: input.ctx.providerConfig.baseUrl,
      zhipuApiMode: input.ctx.providerConfig.zhipuApiMode,
      model: input.ctx.providerConfig.model,
      apiType: input.ctx.providerConfig.apiType,
      oauthToken: input.ctx.providerConfig.oauthToken,
      authContext: input.ctx.providerConfig.authContext,
      modelCapabilitiesByModel: input.ctx.providerConfig.modelCapabilitiesByModel,
      models: input.ctx.providerConfig.models,
    } as CoreAgentLoopProviderRuntimeConfigFor<TProviderConfig>,
    providerHostContext: {
      workingDirectory: sessionWorkingDir,
      localSessionId: input.ctx.sessionId,
    },
  }
}

export function planAgentLoopPromptBuildOptions<
  TProviderConfig extends CoreBuildPromptOptions['providerConfig'],
  TSettings,
>(input: CoreAgentLoopPromptBuildInput<TProviderConfig, TSettings>): CoreBuildPromptOptions {
  return {
    sessionId: input.ctx.sessionId,
    agentId: input.agentId,
    providerId: input.ctx.providerId,
    model: typeof input.ctx.providerConfig?.model === 'string'
      ? input.ctx.providerConfig.model
      : undefined,
    providerConfig: input.ctx.providerConfig,
    settings: input.ctx.settings,
    hasTools: input.hasTools,
    skills: input.skills,
    workingDirectory: input.workingDirectory,
    workingDirectoryRoots: input.workingDirectoryRoots,
    contextVariables: input.contextVariables,
    activeProject: input.activeProject,
    knownProjects: input.knownProjects,
    toolNames: input.toolNames,
    mcpToolNames: input.mcpToolNames,
    voiceConversation: input.ctx.voiceConversation,
    speakMode: input.ctx.speakMode ?? input.ctx.voiceConversation,
    historyMessages: input.historyMessages,
  }
}

export function planAgentLoopTools<TTool extends AgentSourceToolDefinition>(input: {
  toolLoadingEnabled: boolean
  allEnabledTools: TTool[]
  mcpRouterTool?: AgentSourceToolDefinition | null
  toolSettings?: CoreAgentLoopToolSettings
}): CoreAgentLoopToolPlan<TTool> {
  const enabledTools = input.toolLoadingEnabled
    ? input.allEnabledTools.filter(tool => !tool.id.startsWith('mcp:'))
    : []
  const mcpRouterToolEnabled = Boolean(
    input.toolLoadingEnabled &&
    input.mcpRouterTool &&
    input.toolSettings?.tools?.[input.mcpRouterTool.id]?.enabled !== false,
  )
  const mcpToolDefinitions = mcpRouterToolEnabled && input.mcpRouterTool
    ? agentToolDefinitionsFromSourceTools([input.mcpRouterTool])
    : {}
  const hasTools = Boolean(
    input.toolLoadingEnabled &&
    (enabledTools.length > 0 || Object.keys(mcpToolDefinitions).length > 0),
  )
  const builtinToolDefinitions = hasTools ? agentToolDefinitionsFromSourceTools(enabledTools) : {}
  const modelToolDefinitions = hasTools ? { ...builtinToolDefinitions, ...mcpToolDefinitions } : {}

  return {
    enabledTools,
    builtinToolDefinitions,
    mcpToolDefinitions,
    modelToolDefinitions,
    hasTools,
    toolNames: Object.keys(builtinToolDefinitions),
    mcpToolNames: Object.keys(mcpToolDefinitions),
  }
}

export function buildAgentLoopDirectToolsWithAdapters<
  TResult extends CoreAgentLoopDirectToolResultLike,
  TPartialResultUpdate = unknown,
>(
  options: BuildAgentLoopDirectToolsWithAdaptersOptions<TResult, TPartialResultUpdate>,
): AgentTool[] {
  return agentToolsFromToolDefinitions(options.definitions, async (name, args, toolCtx) => {
    const result = await options.executeToolDirectly(resolveAIToolName(name), args, {
      sessionId: options.context.sessionId,
      messageId: options.context.messageId,
      toolCallId: toolCtx.toolCallId,
      workingDirectory: options.context.workingDirectory,
      workingDirectoryRoots: options.context.workingDirectoryRoots,
      abortSignal: toolCtx.abortSignal ?? options.context.abortSignal,
      onMetadata: toolCtx.onMetadata
        ? update => toolCtx.onMetadata?.({
            title: update.title,
            metadata: toJsonObject(update.metadata),
          })
        : undefined,
      onPartialResult: toolCtx.onPartialResult
        ? update => toolCtx.onPartialResult?.(update as Parameters<NonNullable<typeof toolCtx.onPartialResult>>[0])
        : undefined,
    })

    return {
      ...result,
      data: toJsonValue(result.data),
    }
  })
}

export function shouldEmitActiveMemoryLoading(ctx: { settings: CoreAgentLoopActiveMemorySettings }): boolean {
  const soulMemory = ctx.settings.general?.soulMemory
  return soulMemory?.enabled !== false && soulMemory?.activeMemory?.enabled !== false
}

export function planAgentLoopActiveMemoryLoading(input: {
  hasEmitter: boolean
  settings: CoreAgentLoopActiveMemorySettings
}): CoreAgentLoopActiveMemoryLoadingPlan {
  const timeoutMs = input.settings.general?.soulMemory?.activeMemory?.timeoutMs ?? 15000
  const shouldShow = input.hasEmitter && shouldEmitActiveMemoryLoading({ settings: input.settings })
  if (!shouldShow) {
    return {
      shouldShow: false,
      timeoutMs,
    }
  }
  return {
    shouldShow: true,
    timeoutMs,
    startPart: { type: 'loading-memory' },
    waitingPart: { type: 'waiting' },
  }
}

export function shouldStartAgentLoopContextCompact(options: {
  turn: number
  providerId: string
  compactEnabled: boolean
}): boolean {
  if (options.turn <= 1) return false
  if (options.providerId === 'acp') return false
  if (!options.compactEnabled) return false
  return true
}

export function createAgentLoopCompactState(configuredKeepTurns: number): CoreAgentLoopCompactState {
  const normalizedKeepTurns = Math.max(0, Math.floor(configuredKeepTurns || 0))
  return {
    configuredKeepTurns: normalizedKeepTurns,
    keepRecentTurns: normalizedKeepTurns,
    pass: 1,
    compacted: false,
  }
}

export function buildAgentLoopContextHardLimitError(
  inputTokens: number,
  reservedOutputTokens: number,
  modelContextLength: number,
): string {
  return [
    'Context is still too large before the next agent-loop provider turn.',
    `Last known provider input ${inputTokens.toLocaleString()} + reserved output ${reservedOutputTokens.toLocaleString()} exceeds model context ${modelContextLength.toLocaleString()}.`,
    'Reduce the latest message/tool context or lower max output tokens before retrying.',
  ].join(' ')
}

export function positiveTokenLimit(value: number | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : undefined
}

export function resolveAgentLoopContextBudgetValues(input: {
  capabilities?: CoreAgentLoopModelLimits
  registeredModelContextLength?: number
  registeredModelMaxOutputTokens?: number
  providerConfig: CoreAgentLoopProviderConfig
  chatMaxTokens?: number
  contextCompactThreshold?: number
}): CoreAgentLoopContextBudget {
  const modelContextLength = positiveTokenLimit(input.capabilities?.maxInputTokens)
    ?? positiveTokenLimit(input.registeredModelContextLength)
    ?? 128000
  const modelMaxOutputTokens = positiveTokenLimit(input.capabilities?.maxOutputTokens)
    ?? positiveTokenLimit(input.registeredModelMaxOutputTokens)
    ?? 0
  const configuredMaxTokens = input.chatMaxTokens || 4096
  const perModelOverride = input.providerConfig.maxOutputByModel?.[input.providerConfig.model]
  const halfDefault = modelMaxOutputTokens > 0 ? Math.max(1, Math.floor(modelMaxOutputTokens / 2)) : 0
  const requested = perModelOverride ?? (halfDefault > 0 ? halfDefault : configuredMaxTokens)
  const reservedOutputTokens = modelMaxOutputTokens > 0
    ? Math.min(requested, modelMaxOutputTokens)
    : requested

  return {
    modelContextLength,
    reservedOutputTokens,
    thresholdPercent: input.contextCompactThreshold ?? 85,
  }
}

export async function resolveAgentLoopContextBudgetWithRegistry(
  options: ResolveAgentLoopContextBudgetOptions,
): Promise<CoreAgentLoopContextBudgetResolution> {
  const fallbackBudget: CoreAgentLoopContextBudget = {
    modelContextLength: positiveTokenLimit(options.capabilities?.maxInputTokens) ?? 128000,
    reservedOutputTokens: options.chatMaxTokens || 4096,
    thresholdPercent: options.contextCompactThreshold ?? 85,
  }

  try {
    const registeredModelContextLength = positiveTokenLimit(options.capabilities?.maxInputTokens)
      ?? positiveTokenLimit(await options.resolveModelContextLength?.(
        options.providerConfig.model,
        options.providerId,
      ))
    const registeredModelMaxOutputTokens = positiveTokenLimit(options.capabilities?.maxOutputTokens)
      ?? positiveTokenLimit(await options.resolveModelMaxOutputTokens?.(
        options.providerConfig.model,
        options.providerId,
      ))

    return {
      budget: resolveAgentLoopContextBudgetValues({
        capabilities: options.capabilities,
        registeredModelContextLength,
        registeredModelMaxOutputTokens,
        providerConfig: options.providerConfig,
        chatMaxTokens: options.chatMaxTokens,
        contextCompactThreshold: options.contextCompactThreshold,
      }),
    }
  } catch (error) {
    return { budget: fallbackBudget, error }
  }
}

export function getAgentLoopContextBlockReason(options: {
  turn: number
  providerId: string
  compactEnabled: boolean
  session?: CoreCompactSession
  budget: CoreAgentLoopContextBudget
  inputTokens?: number
}): string | undefined {
  if (options.turn <= 1) return undefined
  if (options.providerId === 'acp') return undefined
  if (!options.compactEnabled) return undefined
  if (!options.session) return undefined
  if (shouldSkipAutoCompactForProviderUsageMismatch({
    providerId: options.providerId,
    session: options.session,
    modelContextLength: options.budget.modelContextLength,
  })) return undefined

  const reason = getContextCompactReason({
    session: options.session,
    modelContextLength: options.budget.modelContextLength,
    thresholdPercent: options.budget.thresholdPercent,
    reservedOutputTokens: options.budget.reservedOutputTokens,
    inputTokens: options.inputTokens,
  })
  if (reason !== 'hard-limit') return undefined

  return buildAgentLoopContextHardLimitError(
    options.inputTokens ?? options.session.contextSize ?? options.session.lastInputTokens ?? 0,
    options.budget.reservedOutputTokens,
    options.budget.modelContextLength,
  )
}

export function planAgentLoopContextCompactPass(options: {
  state: CoreAgentLoopCompactState
  session?: CoreCompactSession
  providerId: string
  budget: CoreAgentLoopContextBudget
  providerUsageMismatch?: boolean
  inputTokens?: number
}): CoreAgentLoopCompactPassPlan {
  if (options.state.configuredKeepTurns <= 0) {
    return { kind: 'stop', state: options.state }
  }
  if (options.state.pass > options.state.configuredKeepTurns) {
    return { kind: 'stop', state: options.state }
  }
  if (!options.session) {
    return { kind: 'stop', state: options.state }
  }
  if (options.providerUsageMismatch) {
    return { kind: 'skip-provider-usage-mismatch', state: options.state }
  }

  const reason = getContextCompactReason({
    session: options.session,
    modelContextLength: options.budget.modelContextLength,
    thresholdPercent: options.budget.thresholdPercent,
    reservedOutputTokens: options.budget.reservedOutputTokens,
    inputTokens: options.inputTokens,
  })
  if (!reason) {
    return { kind: 'stop', state: options.state }
  }

  return {
    kind: 'compact',
    state: options.state,
    reason,
    keepRecentTurns: options.state.keepRecentTurns,
    pass: options.state.pass,
  }
}

function nextAgentLoopCompactState(
  state: CoreAgentLoopCompactState,
  patch: Partial<CoreAgentLoopCompactState> = {},
): CoreAgentLoopCompactState {
  return {
    ...state,
    ...patch,
  }
}

export function applyAgentLoopContextCompactResult(options: {
  state: CoreAgentLoopCompactState
  reason: CoreAgentLoopCompactReason
  success: boolean
  skipped?: boolean
}): CoreAgentLoopCompactResultPlan {
  if (!options.success) {
    return {
      kind: options.reason === 'hard-limit' ? 'hard-limit-failure' : 'stop',
      state: options.state,
    }
  }

  if (options.skipped) {
    const state = nextAgentLoopCompactState(options.state, {
      keepRecentTurns: options.state.keepRecentTurns - 1,
      pass: options.state.pass + 1,
    })
    return state.keepRecentTurns <= 0 || state.pass > state.configuredKeepTurns
      ? { kind: 'stop', state }
      : { kind: 'retry', state }
  }

  const compactedState = nextAgentLoopCompactState(options.state, { compacted: true })
  if (options.reason === 'hard-limit') {
    const state = nextAgentLoopCompactState(compactedState, {
      keepRecentTurns: compactedState.keepRecentTurns - 1,
      pass: compactedState.pass + 1,
    })
    return state.keepRecentTurns <= 0 || state.pass > state.configuredKeepTurns
      ? { kind: 'stop', state }
      : { kind: 'retry', state }
  }

  return { kind: 'stop', state: compactedState }
}

export function planAgentLoopContextCompactFinal(options: {
  state: CoreAgentLoopCompactState
  session?: CoreCompactSession | null
  budget: CoreAgentLoopContextBudget
  inputTokens?: number
}): CoreAgentLoopCompactFinalPlan {
  if (options.session) {
    const finalReason = getContextCompactReason({
      session: options.session,
      modelContextLength: options.budget.modelContextLength,
      thresholdPercent: options.budget.thresholdPercent,
      reservedOutputTokens: options.budget.reservedOutputTokens,
      inputTokens: options.inputTokens,
    })
    if (finalReason === 'hard-limit') {
      return {
        kind: 'hard-limit',
        inputTokens: options.inputTokens ?? options.session.contextSize ?? options.session.lastInputTokens ?? 0,
      }
    }
  }

  return options.state.compacted ? { kind: 'rebuild' } : { kind: 'none' }
}

export function buildAgentLoopContextCompactEventPlan(
  result: CoreAgentLoopCompactResultLike,
): CoreAgentLoopCompactEventPlan[] {
  const events: CoreAgentLoopCompactEventPlan[] = [{
    type: 'context:compact-completed',
    success: result.success,
    skipped: result.skipped,
    summary: result.summary,
    error: result.error,
  }]
  if (result.success && !result.skipped) {
    events.push({
      type: 'context:size-updated',
      contextSize: result.retainedContextSize ?? 0,
    })
  }
  return events
}

export async function maybeCompactAgentLoopContextWithAdapters<
  TSettings,
  TProviderConfig extends object,
  TSession extends CoreAgentLoopCompactSessionLike,
  TMessage,
  TCompactResult extends CoreAgentLoopCompactResultLike = CoreAgentLoopCompactResultLike,
>(
  options: MaybeCompactAgentLoopContextOptions<TSettings, TProviderConfig, TSession, TMessage, TCompactResult>,
): Promise<TMessage[] | undefined> {
  const { ctx, adapters } = options
  const logger = adapters.logger ?? console

  if (!shouldStartAgentLoopContextCompact({
    turn: options.turn,
    providerId: ctx.providerId,
    compactEnabled: options.compactEnabled,
  })) return undefined

  let compactState = createAgentLoopCompactState(options.keepRecentTurns)

  while (true) {
    const session = adapters.getSession(ctx.sessionId)
    const usage = session
      ? buildContextUsageSnapshot({
          session,
          historyMessages: !compactState.compacted && options.messages.length > 0
            ? options.messages as unknown[]
            : undefined,
          modelContextLength: options.budget.modelContextLength,
          thresholdPercent: options.budget.thresholdPercent,
          reservedOutputTokens: options.budget.reservedOutputTokens,
          providerId: ctx.providerId,
          model: (ctx.providerConfig as { model?: string }).model,
        })
      : undefined
    if (
      session &&
      usage &&
      (session.contextSize !== usage.visibleInputTokens ||
        session.lastInputTokens !== usage.visibleInputTokens)
    ) {
      await adapters.emitEvent(ctx.sessionId, {
        type: 'context:size-updated',
        contextSize: usage.visibleInputTokens,
      })
    }
    const providerUsageMismatch = session
      ? adapters.shouldSkipProviderUsageMismatch?.({
          providerId: ctx.providerId,
          session,
          modelContextLength: options.budget.modelContextLength,
          inputTokens: usage?.visibleInputTokens,
        }) ?? false
      : false
    const passPlan = planAgentLoopContextCompactPass({
      state: compactState,
      session: session ?? undefined,
      providerId: ctx.providerId,
      budget: options.budget,
      providerUsageMismatch,
      inputTokens: usage?.visibleInputTokens,
    })

    if (passPlan.kind === 'stop') break

    if (passPlan.kind === 'skip-provider-usage-mismatch') {
      logger.warn?.('[AgentLoopRuntime] Skipping context compact because provider usage exceeds registered model context length:', {
        sessionId: ctx.sessionId,
        providerId: ctx.providerId,
        model: (ctx.providerConfig as { model?: unknown }).model,
        contextSize: usage?.visibleInputTokens ?? session?.contextSize ?? session?.lastInputTokens ?? 0,
        modelContextLength: options.budget.modelContextLength,
        source: usage?.source,
      })
      return undefined
    }

    logger.log?.('[ContextUsage] decision', {
      sessionId: ctx.sessionId,
      providerId: ctx.providerId,
      model: (ctx.providerConfig as { model?: unknown }).model,
      visibleInputTokens: usage?.visibleInputTokens,
      effectiveInputTokens: usage?.effectiveInputTokens,
      providerInputTokens: usage?.providerInputTokens,
      requestEstimatedInputTokens: usage?.requestEstimatedInputTokens,
      modelContextLength: usage?.modelContextLength ?? options.budget.modelContextLength,
      reservedOutputTokens: usage?.reservedOutputTokens ?? options.budget.reservedOutputTokens,
      thresholdPercent: usage?.thresholdPercent ?? options.budget.thresholdPercent,
      reason: passPlan.reason,
      source: usage?.source,
      historyMessageCount: usage?.details.historyMessageCount,
      summaryUsed: usage?.details.summaryUsed,
      turn: options.turn,
    })
    logger.log?.('[AgentLoopRuntime] Context compact triggered before agent turn', {
      sessionId: ctx.sessionId,
      model: (ctx.providerConfig as { model?: unknown }).model,
      turn: options.turn,
      modelContextLength: options.budget.modelContextLength,
      reservedOutputTokens: options.budget.reservedOutputTokens,
      keepRecentTurns: passPlan.keepRecentTurns,
      pass: passPlan.pass,
      reason: passPlan.reason,
    })

    const result = await adapters.compactSessionContext({
      sessionId: ctx.sessionId,
      providerId: ctx.providerId,
      configWithApiKey: configWithApiKey(ctx.providerConfig),
      settings: ctx.settings,
      keepRecentTurns: passPlan.keepRecentTurns,
      onMessageCreated: message => adapters.emitEvent(ctx.sessionId, {
        type: 'message:created',
        message,
      }),
      onMessageUpdated: (messageId, updates) => adapters.emitEvent(ctx.sessionId, {
        type: 'message:updated',
        messageId,
        updates,
      }),
    })

    try {
      for (const event of buildAgentLoopContextCompactEventPlan(result)) {
        await adapters.emitEvent(ctx.sessionId, event)
      }
    } catch (error) {
      logger.error?.('[AgentLoopRuntime] context compact event emit error:', error)
    }

    const resultPlan = applyAgentLoopContextCompactResult({
      state: compactState,
      reason: passPlan.reason,
      success: result.success,
      skipped: result.skipped,
    })
    compactState = resultPlan.state

    if (resultPlan.kind === 'hard-limit-failure') {
      const latestSession = adapters.getSession(ctx.sessionId)
      throw new Error(buildAgentLoopContextHardLimitError(
        latestSession?.contextSize ?? latestSession?.lastInputTokens ?? 0,
        options.budget.reservedOutputTokens,
        options.budget.modelContextLength,
      ))
    }
    if (!result.success) return undefined

    if (resultPlan.kind === 'retry') continue
    break
  }

  const latestSession = adapters.getSession(ctx.sessionId)
  const finalUsage = latestSession
    ? buildContextUsageSnapshot({
        session: latestSession,
        historyMessages: !compactState.compacted && options.messages.length > 0
          ? options.messages as unknown[]
          : undefined,
        modelContextLength: options.budget.modelContextLength,
        thresholdPercent: options.budget.thresholdPercent,
        reservedOutputTokens: options.budget.reservedOutputTokens,
        providerId: ctx.providerId,
        model: (ctx.providerConfig as { model?: string }).model,
      })
    : undefined
  const finalPlan = planAgentLoopContextCompactFinal({
    state: compactState,
    session: latestSession ?? undefined,
    budget: options.budget,
    inputTokens: finalUsage?.visibleInputTokens,
  })
  if (finalPlan.kind === 'hard-limit') {
    throw new Error(buildAgentLoopContextHardLimitError(
      finalUsage?.visibleInputTokens ?? finalPlan.inputTokens,
      options.budget.reservedOutputTokens,
      options.budget.modelContextLength,
    ))
  }

  return finalPlan.kind === 'rebuild' ? adapters.rebuildMessages() : undefined
}

export function getAgentLoopTransientTail<TMessage extends CoreAgentLoopMessage>(messages: TMessage[]): TMessage[] {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index]
    if (message.role === 'assistant' && (message.toolCalls?.length ?? 0) > 0) {
      return messages.slice(index).map(item => ({ ...item }))
    }
  }
  return []
}

export function buildPendingAgentLoopMessageInjections<
  TMessage extends CoreAgentLoopMessage,
  TContentParts = unknown,
>(
  messages: TMessage[],
  pendingMessages: Array<CoreResolvedPendingAgentLoopMessage<TContentParts>>,
): CorePendingAgentLoopInjectionResult<TMessage, TContentParts> | undefined {
  if (pendingMessages.length === 0) return undefined

  const nextMessages: Array<TMessage | CorePendingAgentLoopRuntimeMessage> = messages.map(message => ({ ...message }))
  const chatMessages: Array<CorePendingAgentLoopChatMessage<TContentParts>> = []

  for (const pending of pendingMessages) {
    nextMessages.push({ role: 'user', content: pending.modelContent })
    chatMessages.push({
      id: pending.id,
      role: 'user',
      content: pending.modelContent,
      timestamp: pending.timestamp,
      contentParts: pending.contentParts,
      ...(pending.origin !== undefined ? { origin: pending.origin } : {}),
      ...(pending.persisted ? { persisted: true } : {}),
    })
  }

  return {
    messages: nextMessages,
    chatMessages,
  }
}

export async function injectPendingAgentLoopMessagesWithAdapters<
  TMessage extends CoreAgentLoopMessage,
  TContentParts = unknown,
>(options: {
  messages: TMessage[]
  pendingMessages: CorePendingAgentLoopInputMessage[]
  adapters: CoreAgentLoopPendingMessageAdapters<TContentParts>
}): Promise<CoreAgentLoopTurnMessages<TMessage> | undefined> {
  const resolvedPendingMessages = resolvePendingAgentLoopMessages<TContentParts>(
    options.pendingMessages,
    {
      createId: options.adapters.createPendingMessageId,
      resolvePromptReferences: options.adapters.resolvePromptReferences,
    },
  )
  const injection = buildPendingAgentLoopMessageInjections<TMessage, TContentParts>(
    options.messages,
    resolvedPendingMessages,
  )
  if (!injection) return undefined

  for (const chatMessage of injection.chatMessages) {
    if (chatMessage.persisted) continue
    await options.adapters.persistInjectedChatMessage({
      id: chatMessage.id,
      role: chatMessage.role,
      content: chatMessage.content,
      timestamp: chatMessage.timestamp,
      contentParts: chatMessage.contentParts,
      ...(chatMessage.origin !== undefined ? { origin: chatMessage.origin } : {}),
    })
  }

  return injection.messages
}

export function resolvePendingAgentLoopMessages<TContentParts = unknown>(
  pendingMessages: CorePendingAgentLoopInputMessage[],
  options: {
    resolvePromptReferences: (content: string) => CorePendingAgentLoopPromptResolution<TContentParts>
    createId: () => string
  },
): CoreResolvedPendingAgentLoopMessage<TContentParts>[] {
  return pendingMessages.map(pending => {
    if (typeof pending.modelContent === 'string') {
      return {
        id: pending.id ?? options.createId(),
        modelContent: pending.modelContent,
        timestamp: pending.timestamp,
        contentParts: pending.contentParts as TContentParts | undefined,
        ...(pending.origin !== undefined ? { origin: pending.origin } : {}),
        ...(pending.persisted ? { persisted: true } : {}),
      }
    }

    const resolvedPromptRefs = options.resolvePromptReferences(pending.content)
    return {
      id: pending.id ?? options.createId(),
      modelContent: resolvedPromptRefs.modelContent,
      timestamp: pending.timestamp,
      contentParts: resolvedPromptRefs.contentParts,
      ...(pending.origin !== undefined ? { origin: pending.origin } : {}),
      ...(pending.persisted ? { persisted: true } : {}),
    }
  })
}

export async function runAgentLoopBeforeTurnWithAdapters<
  TSettings,
  TProviderConfig extends object,
  TSession extends CoreAgentLoopCompactSessionLike,
  TMessage extends CoreAgentLoopMessage,
  TContentParts = unknown,
  TCompactResult extends CoreAgentLoopCompactResultLike = CoreAgentLoopCompactResultLike,
>(
  options: RunAgentLoopBeforeTurnWithAdaptersOptions<
    TSettings,
    TProviderConfig,
    TSession,
    TMessage,
    TContentParts,
    TCompactResult
  >,
): Promise<CoreAgentLoopTurnMessages<TMessage> | undefined> {
  let nextMessages: CoreAgentLoopTurnMessages<TMessage> = options.messages
  const pendingSteeringMessages = options.adapters.drainSteeringMessages?.() ?? []
  const injectedMessages = await injectPendingAgentLoopMessagesWithAdapters({
    messages: nextMessages as TMessage[],
    pendingMessages: pendingSteeringMessages,
    adapters: options.adapters,
  })
  if (injectedMessages) {
    nextMessages = injectedMessages
  }

  const compactAdapters: CoreAgentLoopCompactionAdapters<
    TSettings,
    TProviderConfig,
    TSession,
    TMessage,
    TCompactResult
  > = {
    getSession: options.adapters.getSession,
    compactSessionContext: options.adapters.compactSessionContext,
    emitEvent: options.adapters.emitEvent,
    shouldSkipProviderUsageMismatch: options.adapters.shouldSkipProviderUsageMismatch,
    logger: options.adapters.logger,
    rebuildMessages: () => options.rebuildMessages(nextMessages),
  }
  const compactedMessages = await maybeCompactAgentLoopContextWithAdapters({
    ctx: options.ctx,
    turn: options.turn,
    messages: nextMessages as TMessage[],
    budget: options.budget,
    compactEnabled: options.compactEnabled,
    keepRecentTurns: options.keepRecentTurns,
    adapters: compactAdapters,
  })
  if (compactedMessages) return compactedMessages

  const blockSession = options.adapters.getSession(options.ctx.sessionId) ?? undefined
  const blockUsage = blockSession
    ? buildContextUsageSnapshot({
        session: blockSession,
        historyMessages: nextMessages as unknown[],
        modelContextLength: options.budget.modelContextLength,
        thresholdPercent: options.budget.thresholdPercent,
        reservedOutputTokens: options.budget.reservedOutputTokens,
        providerId: options.ctx.providerId,
        model: (options.ctx.providerConfig as { model?: string }).model,
      })
    : undefined
  const blockReason = getAgentLoopContextBlockReason({
    turn: options.turn,
    providerId: options.ctx.providerId,
    compactEnabled: options.compactEnabled,
    session: blockSession,
    budget: options.budget,
    inputTokens: blockUsage?.visibleInputTokens,
  })
  if (blockReason) throw new Error(blockReason)
  return nextMessages === options.messages ? undefined : nextMessages
}

export async function runAgentLoopAfterTurnWithAdapters<
  TMessage extends CoreAgentLoopMessage,
  TContentParts = unknown,
>(
  options: RunAgentLoopAfterTurnWithAdaptersOptions<TMessage, TContentParts>,
): Promise<CoreAgentLoopTurnMessages<TMessage> | undefined> {
  const steeringMessages = options.adapters.drainSteeringMessages?.() ?? []
  if (steeringMessages.length > 0) {
    return injectPendingAgentLoopMessagesWithAdapters({
      messages: options.messages,
      pendingMessages: steeringMessages,
      adapters: options.adapters,
    })
  }

  const followUpMessages = options.adapters.drainFollowUpMessages?.() ?? []
  return injectPendingAgentLoopMessagesWithAdapters({
    messages: options.messages,
    pendingMessages: followUpMessages,
    adapters: options.adapters,
  })
}
