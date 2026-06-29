import {
  agentMessagesFromHistory,
  agentProviderCanRunTurn,
  agentSupportsTools,
  buildAgentLoopRuntime,
  resolveAgentModelCapabilities,
  streamAgentLoopProviderChunks,
  type AgentHistoryMessage,
  type AgentLoopOptions,
  type AgentLoopResult,
  type AgentMessage,
  type AgentModelCapabilities,
  type AgentOutputModality,
  type AgentProvider,
  type AgentProviderStreamChunk,
  type AgentSkillContext,
  type AgentSourceToolDefinition,
} from '@onething/core/agent-loop'
import {
  agentLoopInitSkills,
  agentLoopSkillContexts,
  buildAgentLoopDirectToolsWithAdapters,
  createCoreId,
  getAgentLoopTransientTail,
  maybeCompactAgentLoopContextWithAdapters,
  planAgentLoopActiveMemoryLoading,
  planAgentLoopPromptBuildOptions,
  planAgentLoopRuntimePreparation,
  planAgentLoopTools,
  resolveAgentLoopContextBudgetWithRegistry,
  runAgentLoopAfterTurnWithAdapters,
  runAgentLoopBeforeTurnWithAdapters,
  type CoreAgentLoopCompactResultLike,
  type CoreAgentLoopCompactSessionLike,
  type CoreAgentLoopContextBudget,
  type CoreAgentLoopDirectToolMetadataUpdate,
  type CoreAgentLoopDirectToolResultLike,
  type CoreAgentLoopInitSkillSnapshot,
  type CoreAgentLoopPendingMessageAdapters,
  type CoreAgentLoopProviderHostContext,
  type CoreAgentLoopProviderRuntimeConfigLike,
  type CoreAgentLoopRuntimeSessionLike,
  type CoreAgentLoopRuntimeSettingsLike,
  type CoreAgentLoopRuntimeToolSettingsLike,
  type CoreAgentLoopSkillLike,
  type CoreAgentLoopToolSettings,
  type CoreBuildPromptOptions,
  type CoreBuildPromptResult,
  type CorePendingAgentLoopChatMessage,
  type CorePendingAgentLoopInputMessage,
  type CorePromptRequestMessage,
} from '@onething/core/engine'
import type { JsonObject } from '@onething/core'
import {
  createAgentProviderFromRuntime,
  getOnethingAgentLoopThinkingOptions,
  isAgentProviderRuntimeSupported,
  type AgentProviderRuntimeConfig,
  type CreateAgentProviderFromRuntimeOptions,
} from './providers/index.js'

export interface OnethingAgentLoopChatSettings {
  maxTokens?: number
  contextCompactThreshold?: number
  contextCompactEnabled?: boolean
  contextCompactKeepRecentTurns?: number
}

export interface OnethingAgentLoopRuntimeSettings<
  TToolSettings extends CoreAgentLoopRuntimeToolSettingsLike | undefined =
    CoreAgentLoopRuntimeToolSettingsLike | undefined,
> extends CoreAgentLoopRuntimeSettingsLike<TToolSettings> {
  chat?: OnethingAgentLoopChatSettings
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

export interface OnethingAgentLoopRuntimeContext<
  TSettings extends OnethingAgentLoopRuntimeSettings<TToolSettings>,
  TProviderConfig extends CoreAgentLoopProviderRuntimeConfigLike,
  TToolSettings extends CoreAgentLoopRuntimeToolSettingsLike | undefined =
    CoreAgentLoopRuntimeToolSettingsLike | undefined,
> {
  sessionId: string
  assistantMessageId: string
  providerId: string
  providerConfig: TProviderConfig
  settings: TSettings
  toolSettings?: TToolSettings
  requestedOutputModalities?: AgentOutputModality[]
  abortSignal?: AbortSignal
  steeringQueue?: OnethingAgentLoopPendingMessageQueue
  followUpQueue?: OnethingAgentLoopPendingMessageQueue
  voiceConversation?: boolean
  speakMode?: boolean
}

export interface OnethingAgentLoopPendingMessageQueue {
  drain(): CorePendingAgentLoopInputMessage[]
}

export interface OnethingAgentLoopProjectPromptVars {
  active?: CoreBuildPromptOptions['activeProject']
  known?: CoreBuildPromptOptions['knownProjects']
}

export interface OnethingAgentLoopLogger {
  log?: (...args: unknown[]) => void
  info?: (...args: unknown[]) => void
  warn?: (...args: unknown[]) => void
  error?: (...args: unknown[]) => void
}

export interface OnethingAgentLoopPromptResult<TPromptMessage extends CorePromptRequestMessage = CorePromptRequestMessage>
  extends Omit<CoreBuildPromptResult, 'messages'> {
  messages: TPromptMessage[]
}

export interface OnethingAgentLoopRuntimeAdapters<
  TSettings extends OnethingAgentLoopRuntimeSettings<TToolSettings>,
  TProviderConfig extends CoreAgentLoopProviderRuntimeConfigLike,
  TToolSettings extends CoreAgentLoopRuntimeToolSettingsLike | undefined,
  TSession extends CoreAgentLoopRuntimeSessionLike & CoreAgentLoopCompactSessionLike,
  TChatMessage,
  THistoryMessage extends CorePromptRequestMessage,
  TPromptMessage extends CorePromptRequestMessage,
  TSkill extends CoreAgentLoopSkillLike,
  TTool extends AgentSourceToolDefinition,
  TContentParts,
  TCompactResult extends CoreAgentLoopCompactResultLike,
  TToolResult extends CoreAgentLoopDirectToolResultLike,
  TPartialToolResult,
> {
  getSession(sessionId: string): TSession | null | undefined
  getSkillsForSession(workingDirectory?: string): TSkill[]
  initializeTools?(skills: TSkill[]): Promise<void> | void
  isProviderSupported?(providerId: string): boolean
  createProvider?(
    providerId: string,
    config: AgentProviderRuntimeConfig,
    hostContext: CoreAgentLoopProviderHostContext,
  ): AgentProvider | undefined
  resolveModelContextLength?(model: string, providerId: string): number | undefined | Promise<number | undefined>
  resolveModelMaxOutputTokens?(model: string, providerId: string): number | undefined | Promise<number | undefined>
  getEnabledTools(toolSettings?: CoreAgentLoopToolSettings['tools']): Promise<TTool[]>
  getMCPRouterToolDefinition?(): TTool | null
  buildContextVariablesPromptText(sessionId: string): Promise<string | undefined> | string | undefined
  buildProjectPromptVars(workingDirectory?: string): OnethingAgentLoopProjectPromptVars
  buildPrompt(options: CoreBuildPromptOptions): Promise<OnethingAgentLoopPromptResult<TPromptMessage>>
  buildHistoryMessages(messages: TChatMessage[], session: TSession): THistoryMessage[]
  resolvePromptReferences(content: string, input: {
    session: TSession | null | undefined
    settings: TSettings
  }): {
    modelContent: string
    contentParts?: TContentParts
  }
  persistInjectedChatMessage(sessionId: string, message: CorePendingAgentLoopChatMessage<TContentParts>): Promise<void> | void
  emitInjectedUserMessage?(sessionId: string, message: CorePendingAgentLoopChatMessage<TContentParts>): Promise<void> | void
  executeToolDirectly(
    toolName: string,
    args: JsonObject,
    context: {
      sessionId: string
      messageId: string
      toolCallId: string
      workingDirectory?: string
      workingDirectoryRoots?: string[]
      abortSignal?: AbortSignal
      onMetadata?: (update: CoreAgentLoopDirectToolMetadataUpdate) => void
      onPartialResult?: (update: TPartialToolResult) => void
    },
  ): Promise<TToolResult>
  compactSessionContext(input: {
    sessionId: string
    providerId: string
    configWithApiKey: TProviderConfig & { apiKey: string }
    settings: TSettings
    keepRecentTurns: number
    onMessageCreated: (message: unknown) => Promise<void>
    onMessageUpdated: (messageId: string, updates: unknown) => Promise<void>
  }): Promise<TCompactResult>
  emitEvent(sessionId: string, event: unknown): Promise<void>
  shouldSkipProviderUsageMismatch?(input: {
    providerId: string
    session: TSession
    modelContextLength: number
  }): boolean
  sendActiveMemoryPart?(part: { type: 'loading-memory' } | { type: 'waiting' }): void
  logger?: OnethingAgentLoopLogger
  createId?(): string
}

export interface OnethingAgentLoopRuntimeHostAdapters<
  TSettings extends OnethingAgentLoopRuntimeSettings<TToolSettings>,
  TProviderConfig extends CoreAgentLoopProviderRuntimeConfigLike,
  TToolSettings extends CoreAgentLoopRuntimeToolSettingsLike | undefined,
  TSession extends CoreAgentLoopRuntimeSessionLike & CoreAgentLoopCompactSessionLike,
  TChatMessage,
  THistoryMessage extends CorePromptRequestMessage,
  TPromptMessage extends CorePromptRequestMessage,
  TSkill extends CoreAgentLoopSkillLike,
  TTool extends AgentSourceToolDefinition,
  TContentParts,
  TCompactResult extends CoreAgentLoopCompactResultLike,
  TToolResult extends CoreAgentLoopDirectToolResultLike,
  TPartialToolResult,
> {
  getSession(sessionId: string): TSession | null | undefined
  getSkillsForSession(workingDirectory?: string): TSkill[]
  initializeTools?(skills: CoreAgentLoopInitSkillSnapshot[]): Promise<void> | void
  isProviderSupported?(providerId: string): boolean
  createProvider?(
    providerId: string,
    config: AgentProviderRuntimeConfig,
    hostContext: CoreAgentLoopProviderHostContext,
  ): AgentProvider | undefined
  resolveModelContextLength?(model: string, providerId: string): number | undefined | Promise<number | undefined>
  resolveModelMaxOutputTokens?(model: string, providerId: string): number | undefined | Promise<number | undefined>
  getEnabledTools(toolSettings?: CoreAgentLoopToolSettings['tools']): Promise<TTool[]>
  getMCPRouterToolDefinition?(): TTool | null
  buildContextVariablesPromptText(sessionId: string): Promise<string | undefined> | string | undefined
  buildProjectPromptVars(workingDirectory?: string): OnethingAgentLoopProjectPromptVars
  buildPrompt(options: CoreBuildPromptOptions): Promise<OnethingAgentLoopPromptResult<TPromptMessage>>
  buildHistoryMessages(messages: TChatMessage[], session: TSession): THistoryMessage[]
  resolvePromptReferences(content: string, input: {
    session: TSession | null | undefined
    settings: TSettings
    skills: TSkill[]
  }): {
    modelContent: string
    contentParts?: TContentParts
  }
  persistInjectedChatMessage(sessionId: string, message: CorePendingAgentLoopChatMessage<TContentParts>): Promise<void> | void
  executeToolDirectly(
    toolName: string,
    args: JsonObject,
    context: {
      sessionId: string
      messageId: string
      toolCallId: string
      workingDirectory?: string
      workingDirectoryRoots?: string[]
      abortSignal?: AbortSignal
      onMetadata?: (update: CoreAgentLoopDirectToolMetadataUpdate) => void
      onPartialResult?: (update: TPartialToolResult) => void
    },
  ): Promise<TToolResult>
  compactSessionContext(input: {
    sessionId: string
    providerId: string
    configWithApiKey: TProviderConfig & { apiKey: string }
    settings: TSettings
    keepRecentTurns: number
    onMessageCreated: (message: unknown) => Promise<void>
    onMessageUpdated: (messageId: string, updates: unknown) => Promise<void>
  }): Promise<TCompactResult>
  emitEvent(sessionId: string, event: unknown): Promise<void>
  shouldSkipProviderUsageMismatch?(input: {
    providerId: string
    session: TSession
    modelContextLength: number
  }): boolean
  sendActiveMemoryPart?(part: { type: 'loading-memory' } | { type: 'waiting' }): void
  logger?: OnethingAgentLoopLogger
  createId?(): string
}

export function createOnethingAgentLoopRuntimeAdapters<
  TSettings extends OnethingAgentLoopRuntimeSettings<TToolSettings>,
  TProviderConfig extends CoreAgentLoopProviderRuntimeConfigLike,
  TToolSettings extends CoreAgentLoopRuntimeToolSettingsLike | undefined,
  TSession extends CoreAgentLoopRuntimeSessionLike & CoreAgentLoopCompactSessionLike,
  TChatMessage,
  THistoryMessage extends CorePromptRequestMessage,
  TPromptMessage extends CorePromptRequestMessage,
  TSkill extends CoreAgentLoopSkillLike,
  TTool extends AgentSourceToolDefinition,
  TContentParts,
  TCompactResult extends CoreAgentLoopCompactResultLike,
  TToolResult extends CoreAgentLoopDirectToolResultLike,
  TPartialToolResult = unknown,
>(
  host: OnethingAgentLoopRuntimeHostAdapters<
    TSettings,
    TProviderConfig,
    TToolSettings,
    TSession,
    TChatMessage,
    THistoryMessage,
    TPromptMessage,
    TSkill,
    TTool,
    TContentParts,
    TCompactResult,
    TToolResult,
    TPartialToolResult
  >,
): OnethingAgentLoopRuntimeAdapters<
  TSettings,
  TProviderConfig,
  TToolSettings,
  TSession,
  TChatMessage,
  THistoryMessage,
  TPromptMessage,
  TSkill,
  TTool,
  TContentParts,
  TCompactResult,
  TToolResult,
  TPartialToolResult
> {
  return {
    getSession: host.getSession,
    getSkillsForSession: host.getSkillsForSession,
    initializeTools: host.initializeTools
      ? skills => host.initializeTools?.(agentLoopInitSkills(skills))
      : undefined,
    isProviderSupported: host.isProviderSupported,
    createProvider: host.createProvider,
    resolveModelContextLength: host.resolveModelContextLength,
    resolveModelMaxOutputTokens: host.resolveModelMaxOutputTokens,
    getEnabledTools: host.getEnabledTools,
    getMCPRouterToolDefinition: host.getMCPRouterToolDefinition,
    buildContextVariablesPromptText: host.buildContextVariablesPromptText,
    buildProjectPromptVars: host.buildProjectPromptVars,
    buildPrompt: host.buildPrompt,
    buildHistoryMessages: host.buildHistoryMessages,
    resolvePromptReferences(content, input) {
      const settingsWithSkills = input.settings as { skills?: { enableSkills?: boolean } }
      const skillsEnabled = settingsWithSkills.skills?.enableSkills !== false
      const skills = skillsEnabled ? host.getSkillsForSession(input.session?.workingDirectory) : []
      return host.resolvePromptReferences(content, {
        session: input.session,
        settings: input.settings,
        skills,
      })
    },
    persistInjectedChatMessage: host.persistInjectedChatMessage,
    async emitInjectedUserMessage(sessionId, message) {
      try {
        await host.emitEvent(sessionId, {
          type: 'message:user-created',
          message,
        })
      } catch (error) {
        host.logger?.error?.('[AgentLoopRuntime] injected message:user-created emit error:', error)
      }
    },
    executeToolDirectly: host.executeToolDirectly,
    compactSessionContext: host.compactSessionContext,
    emitEvent: host.emitEvent,
    shouldSkipProviderUsageMismatch: host.shouldSkipProviderUsageMismatch,
    sendActiveMemoryPart: host.sendActiveMemoryPart,
    logger: host.logger,
    createId: host.createId,
  }
}

export type BuildOnethingAgentLoopStreamRuntimeResult<
  TSkill extends CoreAgentLoopSkillLike = CoreAgentLoopSkillLike,
> =
  | {
      supported: false
      reason: string
    }
  | {
      supported: true
      runtime: AgentLoopOptions
      systemPrompt: string
      enabledSkills: TSkill[]
      toolNames: string[]
      mcpToolNames: string[]
      hasTools: boolean
      supportsTools: boolean
      modelContextLength: number
      reservedOutputTokens: number
    }

export async function maybeCompactOnethingAgentLoopContext<
  TSettings,
  TProviderConfig extends object,
  TSession extends CoreAgentLoopCompactSessionLike,
  TMessage extends AgentMessage,
  TCompactResult extends CoreAgentLoopCompactResultLike = CoreAgentLoopCompactResultLike,
>(options: {
  ctx: {
    sessionId: string
    providerId: string
    providerConfig: TProviderConfig
    settings: TSettings
  }
  turn: number
  messages: TMessage[]
  budget: CoreAgentLoopContextBudget
  compactEnabled: boolean
  keepRecentTurns: number
  rebuildMessages: () => Promise<TMessage[]>
  adapters: {
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
    emitEvent(sessionId: string, event: unknown): Promise<void>
    shouldSkipProviderUsageMismatch?: (input: {
      providerId: string
      session: TSession
      modelContextLength: number
      inputTokens?: number
    }) => boolean
    logger?: OnethingAgentLoopLogger
  }
}): Promise<TMessage[] | undefined> {
  return maybeCompactAgentLoopContextWithAdapters({
    ctx: options.ctx,
    turn: options.turn,
    messages: options.messages,
    budget: options.budget,
    compactEnabled: options.compactEnabled,
    keepRecentTurns: options.keepRecentTurns,
    adapters: {
      getSession: options.adapters.getSession,
      compactSessionContext: options.adapters.compactSessionContext,
      emitEvent: (sessionId, event) => options.adapters.emitEvent(sessionId, event),
      shouldSkipProviderUsageMismatch: options.adapters.shouldSkipProviderUsageMismatch,
      logger: options.adapters.logger,
      rebuildMessages: options.rebuildMessages,
    },
  })
}

export async function buildOnethingAgentLoopStreamRuntime<
  TSettings extends OnethingAgentLoopRuntimeSettings<TToolSettings>,
  TProviderConfig extends CoreAgentLoopProviderRuntimeConfigLike,
  TToolSettings extends CoreAgentLoopRuntimeToolSettingsLike | undefined,
  TSession extends CoreAgentLoopRuntimeSessionLike & CoreAgentLoopCompactSessionLike & { messages: TChatMessage[] },
  TChatMessage,
  THistoryMessage extends CorePromptRequestMessage,
  TPromptMessage extends CorePromptRequestMessage,
  TSkill extends CoreAgentLoopSkillLike,
  TTool extends AgentSourceToolDefinition,
  TContentParts,
  TCompactResult extends CoreAgentLoopCompactResultLike,
  TToolResult extends CoreAgentLoopDirectToolResultLike,
  TPartialToolResult = unknown,
>(
  ctx: OnethingAgentLoopRuntimeContext<TSettings, TProviderConfig, TToolSettings>,
  historyMessages: THistoryMessage[],
  adapters: OnethingAgentLoopRuntimeAdapters<
    TSettings,
    TProviderConfig,
    TToolSettings,
    TSession,
    TChatMessage,
    THistoryMessage,
    TPromptMessage,
    TSkill,
    TTool,
    TContentParts,
    TCompactResult,
    TToolResult,
    TPartialToolResult
  >,
): Promise<BuildOnethingAgentLoopStreamRuntimeResult<TSkill>> {
  const isSupported = adapters.isProviderSupported ?? isAgentProviderRuntimeSupported
  if (!isSupported(ctx.providerId)) {
    return {
      supported: false,
      reason: `Provider ${ctx.providerId} does not expose an AgentProvider runtime yet`,
    }
  }

  const session = adapters.getSession(ctx.sessionId)
  const preparation = planAgentLoopRuntimePreparation({
    ctx,
    session,
  })
  const sessionWorkingDir = preparation.sessionWorkingDir
  const sessionWorkingDirRoots = preparation.sessionWorkingDirRoots
  const enabledSkills = preparation.skillsEnabled ? adapters.getSkillsForSession(sessionWorkingDir) : []
  const effectiveToolSettings = preparation.effectiveToolSettings

  if (preparation.toolCallsEnabled) {
    await adapters.initializeTools?.(enabledSkills)
  }

  const createProvider = adapters.createProvider
    ?? ((providerId, config, hostContext) => createAgentProviderFromRuntime(
      providerId,
      config,
      hostContext as CreateAgentProviderFromRuntimeOptions,
    ))
  const provider = createProvider(
    ctx.providerId,
    preparation.providerRuntimeConfig as AgentProviderRuntimeConfig,
    preparation.providerHostContext,
  )

  if (!provider) {
    return {
      supported: false,
      reason: `Provider ${ctx.providerId} did not create an AgentProvider runtime`,
    }
  }
  if (!agentProviderCanRunTurn(provider)) {
    return {
      supported: false,
      reason: `Provider ${ctx.providerId} AgentProvider runtime does not implement streamTurn or runTurn`,
    }
  }

  const providerCapabilities = await resolveAgentModelCapabilities(provider, ctx.providerConfig.model)
  const supportsTools = agentSupportsTools(providerCapabilities)
  const toolLoadingEnabled = Boolean(preparation.toolCallsEnabled && supportsTools)
  const allEnabledTools = toolLoadingEnabled
    ? await adapters.getEnabledTools(effectiveToolSettings?.tools)
    : []
  const mcpRouterTool = toolLoadingEnabled ? adapters.getMCPRouterToolDefinition?.() ?? null : null
  const toolPlan = planAgentLoopTools({
    toolLoadingEnabled,
    allEnabledTools,
    mcpRouterTool,
    toolSettings: effectiveToolSettings,
  })
  const projectVars = adapters.buildProjectPromptVars(sessionWorkingDir)
  const budget = await resolveOnethingAgentLoopContextBudget(ctx, providerCapabilities, adapters)
  const buildPromptForHistory = async (nextHistoryMessages: THistoryMessage[]) => adapters.buildPrompt(
    planAgentLoopPromptBuildOptions({
      ctx: {
        sessionId: ctx.sessionId,
        providerId: ctx.providerId,
        providerConfig: ctx.providerConfig as unknown as CoreBuildPromptOptions['providerConfig'],
        settings: ctx.settings,
        voiceConversation: ctx.voiceConversation,
        speakMode: ctx.speakMode,
      },
      agentId: preparation.agentId,
      hasTools: toolPlan.hasTools,
      skills: enabledSkills,
      workingDirectory: sessionWorkingDir,
      workingDirectoryRoots: sessionWorkingDirRoots,
      contextVariables: await adapters.buildContextVariablesPromptText(ctx.sessionId),
      activeProject: projectVars.active,
      knownProjects: projectVars.known,
      toolNames: toolPlan.toolNames,
      mcpToolNames: toolPlan.mcpToolNames,
      historyMessages: nextHistoryMessages,
    }),
  )
  const activeMemoryLoading = planAgentLoopActiveMemoryLoading({
    hasEmitter: Boolean(adapters.sendActiveMemoryPart),
    settings: ctx.settings,
  })
  const promptContextStartedAt = Date.now()

  if (activeMemoryLoading.shouldShow) {
    adapters.logger?.info?.(
      `[ActiveMemory] agent-loop ui loading-memory session=${ctx.sessionId.slice(0, 8)} timeoutMs=${activeMemoryLoading.timeoutMs}`,
    )
    adapters.sendActiveMemoryPart?.(activeMemoryLoading.startPart)
  }

  const requestMessages = await buildPromptForHistory(historyMessages)

  if (activeMemoryLoading.shouldShow) {
    adapters.logger?.info?.(
      `[ActiveMemory] agent-loop ui waiting session=${ctx.sessionId.slice(0, 8)} promptContextDurationMs=${Date.now() - promptContextStartedAt}`,
    )
    adapters.sendActiveMemoryPart?.(activeMemoryLoading.waitingPart)
  }

  const rebuildAgentMessagesFromSession = async (messages: AgentMessage[]): Promise<AgentMessage[]> => {
    const latestSession = adapters.getSession(ctx.sessionId)
    if (!latestSession) return messages

    const rebuiltHistory = adapters.buildHistoryMessages(latestSession.messages, latestSession)
    const rebuiltPrompt = await buildPromptForHistory(rebuiltHistory)
    return [
      ...agentMessagesFromHistory(rebuiltPrompt.messages as AgentHistoryMessage[]),
      ...getAgentLoopTransientTail(messages),
    ]
  }

  const pendingMessageAdapters = createPendingAgentLoopMessageAdapters(ctx, adapters)
  const turnQueueAdapters = {
    drainSteeringMessages: (): CorePendingAgentLoopInputMessage[] => ctx.steeringQueue?.drain() ?? [],
    drainFollowUpMessages: (): CorePendingAgentLoopInputMessage[] => ctx.followUpQueue?.drain() ?? [],
  }
  const turnCompactionAdapters = {
    getSession: adapters.getSession,
    compactSessionContext: adapters.compactSessionContext,
    emitEvent: (sessionId: string, event: unknown) => adapters.emitEvent(sessionId, event),
    shouldSkipProviderUsageMismatch: adapters.shouldSkipProviderUsageMismatch,
    logger: adapters.logger,
  }

  const thinkingOptions = getOnethingAgentLoopThinkingOptions(ctx)
  const executeToolDirectlyWithFreshSession = (
    toolName: string,
    args: JsonObject,
    toolContext: {
      sessionId: string
      messageId: string
      toolCallId: string
      workingDirectory?: string
      workingDirectoryRoots?: string[]
      abortSignal?: AbortSignal
      onMetadata?: (update: CoreAgentLoopDirectToolMetadataUpdate) => void
      onPartialResult?: (update: TPartialToolResult) => void
    },
  ) => {
    const latestSession = adapters.getSession(ctx.sessionId)
    return adapters.executeToolDirectly(toolName, args, {
      ...toolContext,
      workingDirectory: latestSession?.workingDirectory ?? toolContext.workingDirectory,
      workingDirectoryRoots: latestSession?.workingDirectoryRoots ?? toolContext.workingDirectoryRoots,
    })
  }

  const runtime = await buildAgentLoopRuntime({
    provider,
    model: ctx.providerConfig.model,
    messages: agentMessagesFromHistory(requestMessages.messages as AgentHistoryMessage[]),
    requestedOutputModalities: ctx.requestedOutputModalities,
    sessionId: ctx.sessionId,
    messageId: ctx.assistantMessageId,
    workingDirectory: sessionWorkingDir,
    abortSignal: ctx.abortSignal,
    maxTokens: budget.reservedOutputTokens,
    thinking: thinkingOptions.thinking,
    reasoningEffort: thinkingOptions.reasoningEffort,
    tools: {
      tools: buildAgentLoopDirectToolsWithAdapters({
        definitions: toolPlan.modelToolDefinitions,
        context: {
          sessionId: ctx.sessionId,
          messageId: ctx.assistantMessageId,
          workingDirectory: sessionWorkingDir,
          workingDirectoryRoots: sessionWorkingDirRoots,
          abortSignal: ctx.abortSignal,
        },
        executeToolDirectly: executeToolDirectlyWithFreshSession,
      }),
      policy: { enabled: toolPlan.hasTools },
    },
    skills: agentLoopSkillContexts(enabledSkills) as AgentSkillContext[],
    prompt: {
      injectSkills: false,
    },
    beforeTurn: async ({ turn, messages }) => {
      const replacementMessages = await runAgentLoopBeforeTurnWithAdapters({
        ctx: compactContext(ctx),
        turn,
        messages,
        budget,
        compactEnabled: ctx.settings.chat?.contextCompactEnabled !== false,
        keepRecentTurns: ctx.settings.chat?.contextCompactKeepRecentTurns ?? 6,
        rebuildMessages: nextMessages => rebuildAgentMessagesFromSession(nextMessages as AgentMessage[]),
        adapters: {
          ...pendingMessageAdapters,
          ...turnQueueAdapters,
          ...turnCompactionAdapters,
        },
      })
      return replacementMessages as AgentMessage[] | undefined
    },
    afterTurn: async ({ messages }) => {
      const replacementMessages = await runAgentLoopAfterTurnWithAdapters({
        messages,
        adapters: {
          ...pendingMessageAdapters,
          ...turnQueueAdapters,
        },
      })
      return replacementMessages as AgentMessage[] | undefined
    },
  })

  return {
    supported: true,
    runtime,
    systemPrompt: requestMessages.systemPrompt,
    enabledSkills,
    toolNames: toolPlan.toolNames,
    mcpToolNames: toolPlan.mcpToolNames,
    hasTools: toolPlan.hasTools,
    supportsTools,
    modelContextLength: budget.modelContextLength,
    reservedOutputTokens: budget.reservedOutputTokens,
  }
}

export async function* streamOnethingAgentLoopChunks<
  TSettings extends OnethingAgentLoopRuntimeSettings<TToolSettings>,
  TProviderConfig extends CoreAgentLoopProviderRuntimeConfigLike,
  TToolSettings extends CoreAgentLoopRuntimeToolSettingsLike | undefined,
  TSession extends CoreAgentLoopRuntimeSessionLike & CoreAgentLoopCompactSessionLike & { messages: TChatMessage[] },
  TChatMessage,
  THistoryMessage extends CorePromptRequestMessage,
  TPromptMessage extends CorePromptRequestMessage,
  TSkill extends CoreAgentLoopSkillLike,
  TTool extends AgentSourceToolDefinition,
  TContentParts,
  TCompactResult extends CoreAgentLoopCompactResultLike,
  TToolResult extends CoreAgentLoopDirectToolResultLike,
  TPartialToolResult = unknown,
>(
  ctx: OnethingAgentLoopRuntimeContext<TSettings, TProviderConfig, TToolSettings>,
  historyMessages: THistoryMessage[],
  adapters: OnethingAgentLoopRuntimeAdapters<
    TSettings,
    TProviderConfig,
    TToolSettings,
    TSession,
    TChatMessage,
    THistoryMessage,
    TPromptMessage,
    TSkill,
    TTool,
    TContentParts,
    TCompactResult,
    TToolResult,
    TPartialToolResult
  >,
): AsyncGenerator<AgentProviderStreamChunk, AgentLoopResult, void> {
  const prepared = await buildOnethingAgentLoopStreamRuntime(ctx, historyMessages, adapters)
  if (!prepared.supported) {
    throw new Error(prepared.reason)
  }

  return yield* streamAgentLoopProviderChunks(prepared.runtime)
}

async function resolveOnethingAgentLoopContextBudget<
  TSettings extends OnethingAgentLoopRuntimeSettings<TToolSettings>,
  TProviderConfig extends CoreAgentLoopProviderRuntimeConfigLike,
  TToolSettings extends CoreAgentLoopRuntimeToolSettingsLike | undefined,
  TSession extends CoreAgentLoopRuntimeSessionLike & CoreAgentLoopCompactSessionLike,
  TChatMessage,
  THistoryMessage extends CorePromptRequestMessage,
  TPromptMessage extends CorePromptRequestMessage,
  TSkill extends CoreAgentLoopSkillLike,
  TTool extends AgentSourceToolDefinition,
  TContentParts,
  TCompactResult extends CoreAgentLoopCompactResultLike,
  TToolResult extends CoreAgentLoopDirectToolResultLike,
  TPartialToolResult,
>(
  ctx: OnethingAgentLoopRuntimeContext<TSettings, TProviderConfig, TToolSettings>,
  capabilities: AgentModelCapabilities | undefined,
  adapters: OnethingAgentLoopRuntimeAdapters<
    TSettings,
    TProviderConfig,
    TToolSettings,
    TSession,
    TChatMessage,
    THistoryMessage,
    TPromptMessage,
    TSkill,
    TTool,
    TContentParts,
    TCompactResult,
    TToolResult,
    TPartialToolResult
  >,
): Promise<CoreAgentLoopContextBudget> {
  const result = await resolveAgentLoopContextBudgetWithRegistry({
    capabilities,
    providerId: ctx.providerId,
    providerConfig: ctx.providerConfig,
    chatMaxTokens: ctx.settings.chat?.maxTokens,
    contextCompactThreshold: ctx.settings.chat?.contextCompactThreshold,
    resolveModelContextLength: adapters.resolveModelContextLength,
    resolveModelMaxOutputTokens: adapters.resolveModelMaxOutputTokens,
  })

  if (result.error) {
    adapters.logger?.warn?.('[AgentLoopRuntime] Failed to resolve model context budget:', result.error)
  }
  return result.budget
}

function createPendingAgentLoopMessageAdapters<
  TSettings extends OnethingAgentLoopRuntimeSettings<TToolSettings>,
  TProviderConfig extends CoreAgentLoopProviderRuntimeConfigLike,
  TToolSettings extends CoreAgentLoopRuntimeToolSettingsLike | undefined,
  TSession extends CoreAgentLoopRuntimeSessionLike & CoreAgentLoopCompactSessionLike,
  TChatMessage,
  THistoryMessage extends CorePromptRequestMessage,
  TPromptMessage extends CorePromptRequestMessage,
  TSkill extends CoreAgentLoopSkillLike,
  TTool extends AgentSourceToolDefinition,
  TContentParts,
  TCompactResult extends CoreAgentLoopCompactResultLike,
  TToolResult extends CoreAgentLoopDirectToolResultLike,
  TPartialToolResult,
>(
  ctx: OnethingAgentLoopRuntimeContext<TSettings, TProviderConfig, TToolSettings>,
  adapters: OnethingAgentLoopRuntimeAdapters<
    TSettings,
    TProviderConfig,
    TToolSettings,
    TSession,
    TChatMessage,
    THistoryMessage,
    TPromptMessage,
    TSkill,
    TTool,
    TContentParts,
    TCompactResult,
    TToolResult,
    TPartialToolResult
  >,
): CoreAgentLoopPendingMessageAdapters<TContentParts> {
  return {
    createPendingMessageId: adapters.createId ?? createCoreId,
    resolvePromptReferences: content => {
      const session = adapters.getSession(ctx.sessionId)
      return adapters.resolvePromptReferences(content, {
        session,
        settings: ctx.settings,
      })
    },
    persistInjectedChatMessage: async injectedMessage => {
      await adapters.persistInjectedChatMessage(ctx.sessionId, injectedMessage)
      await adapters.emitInjectedUserMessage?.(ctx.sessionId, injectedMessage)
    },
  }
}

function compactContext<
  TSettings extends OnethingAgentLoopRuntimeSettings<TToolSettings>,
  TProviderConfig extends CoreAgentLoopProviderRuntimeConfigLike,
  TToolSettings extends CoreAgentLoopRuntimeToolSettingsLike | undefined,
>(ctx: OnethingAgentLoopRuntimeContext<TSettings, TProviderConfig, TToolSettings>) {
  return {
    sessionId: ctx.sessionId,
    providerId: ctx.providerId,
    providerConfig: ctx.providerConfig,
    settings: ctx.settings,
  }
}

export {
  agentLoopInitSkills,
}
export type {
  CoreAgentLoopContextBudget as OnethingAgentLoopContextBudget,
}
