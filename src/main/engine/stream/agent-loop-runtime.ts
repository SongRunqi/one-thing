import * as store from '../../store.js'
import { v4 as uuidv4 } from 'uuid'
import { getSkillsForSession } from '../../ipc/skills.js'
import { getMCPRouterToolDefinition } from '../../mcp/index.js'
import * as modelRegistry from '../../providers/model-registry.js'
import {
  createAgentProviderFromRuntime,
  isAgentProviderRuntimeSupported,
} from '../../agent-loop/providers/factory.js'
import { resolveAIToolName } from '../../agent-loop/tool-names.js'
import {
  agentMessagesFromHistory,
  type AgentHistoryMessage,
} from '../../agent-loop/messages.js'
import {
  agentProviderCanRunTurn,
  agentToolDefinitionsFromSourceTools,
  agentToolsFromToolDefinitions,
  agentSupportsTools,
  buildAgentLoopRuntime,
  type AgentLoopOptions,
  type AgentLoopResult,
  type AgentMessage,
  type AgentModelCapabilities,
  type AgentProviderStreamChunk,
  type AgentSkillContext,
  resolveAgentModelCapabilities,
  streamAgentLoopProviderChunks,
} from '../../agent-loop/index.js'
import {
  getEnabledToolsAsync,
  initializeAsyncTools,
  setInitContext,
} from '../../tools/index.js'
import type { ChatMessage, ChatSession, SkillDefinition } from '../../../shared/ipc.js'
import { toJsonObject, toJsonValue } from '../../../shared/json.js'
import { buildHistoryMessages, type HistoryMessage } from './message-helpers.js'
import type { StreamContext, StreamProviderConfig } from './stream-processor.js'
import { buildPrompt } from '../prompt/index.js'
import { buildContextVariablesPromptText } from '../../variables/index.js'
import { buildProjectDirsPromptVars } from '../../project-dirs/index.js'
import { executeToolDirectly } from './tool-execution.js'
import {
  compactSessionContext,
  getContextCompactReason,
  shouldSkipAutoCompactForProviderUsageMismatch,
  type ContextCompactResult,
} from '../context-compact.js'
import { getEventBus } from '../../events/index.js'
import { resolvePromptReferences } from '../../prompts/resolver.js'
import type { PendingMessage } from './message-queue.js'
import type { IPCEmitter } from './ipc-emitter.js'

export type BuildAgentLoopStreamRuntimeResult =
  | {
      supported: false
      reason: string
    }
  | {
      supported: true
      runtime: AgentLoopOptions
      systemPrompt: string
      enabledSkills: SkillDefinition[]
      toolNames: string[]
      mcpToolNames: string[]
      hasTools: boolean
      supportsTools: boolean
      modelContextLength: number
      reservedOutputTokens: number
    }

export interface BuildAgentLoopStreamRuntimeOptions {
  emitter?: IPCEmitter
}

function configWithApiKey(config: StreamProviderConfig): StreamProviderConfig & { apiKey: string } {
  return {
    ...config,
    apiKey: config.apiKey ?? '',
  }
}

function normalizeDeepSeekReasoningEffort(value: unknown): 'high' | 'max' | undefined {
  return value === 'max' ? 'max' : value === 'high' ? 'high' : undefined
}

function getAgentLoopThinkingOptions(ctx: StreamContext): {
  thinking?: 'enabled' | 'disabled'
  reasoningEffort?: 'high' | 'max'
} {
  if (ctx.providerId !== 'deepseek') return {}
  const model = ctx.providerConfig.model
  const enabled = ctx.providerConfig.thinkingByModel?.[model]
  if (enabled === false) return { thinking: 'disabled' }
  if (enabled !== true) return {}

  return {
    thinking: 'enabled',
    reasoningEffort: normalizeDeepSeekReasoningEffort(ctx.providerConfig.thinkingEffortByModel?.[model]) ?? 'high',
  }
}

function shouldEmitActiveMemoryLoading(ctx: StreamContext): boolean {
  const soulMemory = ctx.settings.general?.soulMemory
  return soulMemory?.enabled !== false && soulMemory?.activeMemory?.enabled !== false
}

export interface AgentLoopContextBudget {
  modelContextLength: number
  reservedOutputTokens: number
  thresholdPercent: number
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

function positiveTokenLimit(value: number | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : undefined
}

export function getAgentLoopContextBlockReason(options: {
  turn: number
  providerId: string
  compactEnabled: boolean
  session?: ChatSession
  budget: AgentLoopContextBudget
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
  })
  if (reason !== 'hard-limit') return undefined

  return buildAgentLoopContextHardLimitError(
    options.session.contextSize ?? options.session.lastInputTokens ?? 0,
    options.budget.reservedOutputTokens,
    options.budget.modelContextLength,
  )
}

export function getAgentLoopTransientTail(messages: AgentMessage[]): AgentMessage[] {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index]
    if (message.role === 'assistant' && (message.toolCalls?.length ?? 0) > 0) {
      return messages.slice(index).map(item => ({ ...item }))
    }
  }
  return []
}

async function emitAgentLoopContextCompactResult(
  ctx: StreamContext,
  result: ContextCompactResult,
): Promise<void> {
  try {
    const eventBus = getEventBus()
    await eventBus.emit(ctx.sessionId, {
      type: 'context:compact-completed',
      success: result.success,
      skipped: result.skipped,
      summary: result.summary,
      error: result.error,
    })
    if (result.success && !result.skipped) {
      await eventBus.emit(ctx.sessionId, {
        type: 'context:size-updated',
        contextSize: result.retainedContextSize ?? 0,
      })
    }
  } catch (error) {
    console.error('[AgentLoopRuntime] context compact event emit error:', error)
  }
}

export async function maybeCompactAgentLoopContext(options: {
  ctx: StreamContext
  turn: number
  messages: AgentMessage[]
  budget: AgentLoopContextBudget
  rebuildMessages: () => Promise<AgentMessage[]>
}): Promise<AgentMessage[] | undefined> {
  if (options.turn <= 1) return undefined
  if (options.ctx.providerId === 'acp') return undefined
  if (options.ctx.settings.chat?.contextCompactEnabled === false) return undefined

  const compactSettings = options.ctx.settings.chat
  const configuredKeepTurns = compactSettings?.contextCompactKeepRecentTurns ?? 6
  let keepRecentTurns = configuredKeepTurns
  let compacted = false

  for (let pass = 1; pass <= configuredKeepTurns; pass++) {
    const session = store.getSession(options.ctx.sessionId)
    if (!session) return undefined

    if (shouldSkipAutoCompactForProviderUsageMismatch({
      providerId: options.ctx.providerId,
      session,
      modelContextLength: options.budget.modelContextLength,
    })) {
      console.warn('[AgentLoopRuntime] Skipping context compact because provider usage exceeds registered model context length:', {
        sessionId: options.ctx.sessionId,
        providerId: options.ctx.providerId,
        model: options.ctx.providerConfig.model,
        contextSize: session.contextSize ?? session.lastInputTokens ?? 0,
        modelContextLength: options.budget.modelContextLength,
      })
      return undefined
    }

    const reason = getContextCompactReason({
      session,
      modelContextLength: options.budget.modelContextLength,
      thresholdPercent: options.budget.thresholdPercent,
      reservedOutputTokens: options.budget.reservedOutputTokens,
    })
    if (!reason) break

    console.log('[AgentLoopRuntime] Context compact triggered before agent turn', {
      sessionId: options.ctx.sessionId,
      model: options.ctx.providerConfig.model,
      turn: options.turn,
      modelContextLength: options.budget.modelContextLength,
      reservedOutputTokens: options.budget.reservedOutputTokens,
      keepRecentTurns,
      pass,
      reason,
    })

    const result = await compactSessionContext({
      sessionId: options.ctx.sessionId,
      providerId: options.ctx.providerId,
      configWithApiKey: configWithApiKey(options.ctx.providerConfig),
      settings: options.ctx.settings,
      keepRecentTurns,
      onMessageCreated: async message => {
        await getEventBus().emit(options.ctx.sessionId, {
          type: 'message:created',
          message,
        })
      },
      onMessageUpdated: async (messageId, updates) => {
        await getEventBus().emit(options.ctx.sessionId, {
          type: 'message:updated',
          messageId,
          updates,
        })
      },
    })
    await emitAgentLoopContextCompactResult(options.ctx, result)

    if (!result.success) {
      if (reason === 'hard-limit') {
        const latestSession = store.getSession(options.ctx.sessionId)
        throw new Error(buildAgentLoopContextHardLimitError(
          latestSession?.contextSize ?? latestSession?.lastInputTokens ?? 0,
          options.budget.reservedOutputTokens,
          options.budget.modelContextLength,
        ))
      }
      return undefined
    }

    if (result.skipped) {
      keepRecentTurns--
      if (keepRecentTurns <= 0) break
      continue
    }

    compacted = true
    if (reason === 'hard-limit') {
      keepRecentTurns--
      if (keepRecentTurns <= 0) break
      continue
    }
    break
  }

  const latestSession = store.getSession(options.ctx.sessionId)
  const finalReason = latestSession ? getContextCompactReason({
    session: latestSession,
    modelContextLength: options.budget.modelContextLength,
    thresholdPercent: options.budget.thresholdPercent,
    reservedOutputTokens: options.budget.reservedOutputTokens,
  }) : null
  if (finalReason === 'hard-limit') {
    throw new Error(buildAgentLoopContextHardLimitError(
      latestSession?.contextSize ?? latestSession?.lastInputTokens ?? 0,
      options.budget.reservedOutputTokens,
      options.budget.modelContextLength,
    ))
  }

  return compacted ? options.rebuildMessages() : undefined
}

async function resolveAgentLoopContextBudget(
  ctx: StreamContext,
  capabilities?: AgentModelCapabilities,
): Promise<AgentLoopContextBudget> {
  let modelContextLength = positiveTokenLimit(capabilities?.maxInputTokens) ?? 128000
  let reservedOutputTokens = ctx.settings.chat?.maxTokens || 4096

  try {
    modelContextLength = positiveTokenLimit(capabilities?.maxInputTokens)
      ?? await modelRegistry.getModelContextLength(ctx.providerConfig.model, ctx.providerId)
    const modelMaxOutputTokens = positiveTokenLimit(capabilities?.maxOutputTokens)
      ?? await modelRegistry.getModelMaxOutputTokens(ctx.providerConfig.model, ctx.providerId)
    const perModelOverride = ctx.providerConfig.maxOutputByModel?.[ctx.providerConfig.model]
    const halfDefault = modelMaxOutputTokens > 0 ? Math.max(1, Math.floor(modelMaxOutputTokens / 2)) : 0
    const requested = perModelOverride ?? (halfDefault > 0 ? halfDefault : reservedOutputTokens)
    reservedOutputTokens = modelMaxOutputTokens > 0 ? Math.min(requested, modelMaxOutputTokens) : requested
  } catch (error) {
    console.warn('[AgentLoopRuntime] Failed to resolve model context budget:', error)
  }

  return {
    modelContextLength,
    reservedOutputTokens,
    thresholdPercent: ctx.settings.chat?.contextCompactThreshold ?? 85,
  }
}

function agentSkillContexts(skills: SkillDefinition[]): AgentSkillContext[] {
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

export function injectPendingAgentLoopMessages(
  ctx: StreamContext,
  messages: AgentMessage[],
  pendingMessages: PendingMessage[],
): AgentMessage[] | undefined {
  if (pendingMessages.length === 0) return undefined

  const session = store.getSession(ctx.sessionId)
  const skillsEnabled = ctx.settings.skills?.enableSkills !== false
  const skillsForRefs = skillsEnabled ? getSkillsForSession(session?.workingDirectory) : []
  const nextMessages = messages.map(message => ({ ...message }))

  for (const pending of pendingMessages) {
    const resolvedPromptRefs = resolvePromptReferences(pending.content, { skills: skillsForRefs })
    nextMessages.push({ role: 'user', content: resolvedPromptRefs.modelContent })

    const userMessage: ChatMessage = {
      id: uuidv4(),
      role: 'user',
      content: resolvedPromptRefs.modelContent,
      timestamp: pending.timestamp,
      contentParts: resolvedPromptRefs.contentParts,
    }
    store.addMessage(ctx.sessionId, userMessage)

    try {
      getEventBus().emit(ctx.sessionId, {
        type: 'message:user-created',
        message: userMessage,
      }).catch(err => console.error('[AgentLoopRuntime] injected message:user-created emit error:', err))
    } catch {
      // Event system may not be initialized in tests or early startup.
    }
  }

  return nextMessages
}

export async function buildAgentLoopRuntimeFromStreamContext(
  ctx: StreamContext,
  historyMessages: HistoryMessage[],
  options: BuildAgentLoopStreamRuntimeOptions = {},
): Promise<BuildAgentLoopStreamRuntimeResult> {
  if (!isAgentProviderRuntimeSupported(ctx.providerId)) {
    return {
      supported: false,
      reason: `Provider ${ctx.providerId} does not expose an AgentProvider runtime yet`,
    }
  }

  const session = store.getSession(ctx.sessionId)
  const sessionWorkingDir = session?.workingDirectory
  const sessionWorkingDirRoots = session?.workingDirectoryRoots
  const skillsEnabled = ctx.settings.skills?.enableSkills !== false
  const enabledSkills = skillsEnabled ? getSkillsForSession(sessionWorkingDir) : []
  const effectiveToolSettings = ctx.toolSettings ?? ctx.settings.tools
  const toolCallsEnabled = effectiveToolSettings?.enableToolCalls !== false

  if (toolCallsEnabled) {
    setInitContext({
      skills: enabledSkills.map(skill => ({
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
      })),
    })
    await initializeAsyncTools()
  }

  const provider = createAgentProviderFromRuntime(ctx.providerId, {
    apiKey: ctx.providerConfig.apiKey,
    baseUrl: ctx.providerConfig.baseUrl,
    model: ctx.providerConfig.model,
    apiType: ctx.providerConfig.apiType,
    oauthToken: ctx.providerConfig.oauthToken,
    authContext: ctx.providerConfig.authContext,
    modelCapabilitiesByModel: ctx.providerConfig.modelCapabilitiesByModel,
    models: ctx.providerConfig.models,
  }, {
    workingDirectory: sessionWorkingDir,
    localSessionId: ctx.sessionId,
  })

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
  const toolLoadingEnabled = Boolean(toolCallsEnabled && supportsTools)
  const allEnabledTools = toolLoadingEnabled
    ? await getEnabledToolsAsync(effectiveToolSettings?.tools)
    : []
  const enabledTools = allEnabledTools.filter(tool => !tool.id.startsWith('mcp:'))
  const mcpRouterTool = toolLoadingEnabled ? getMCPRouterToolDefinition() : null
  const mcpTools = mcpRouterTool && effectiveToolSettings?.tools?.[mcpRouterTool.id]?.enabled !== false
    ? agentToolDefinitionsFromSourceTools([mcpRouterTool])
    : {}
  const hasTools = Boolean(
    toolLoadingEnabled &&
    (enabledTools.length > 0 || Object.keys(mcpTools).length > 0),
  )
  const builtinToolDefinitions = hasTools ? agentToolDefinitionsFromSourceTools(enabledTools) : {}
  const modelToolDefinitions = hasTools ? { ...builtinToolDefinitions, ...mcpTools } : {}
  const projectVars = buildProjectDirsPromptVars(sessionWorkingDir)
  const budget = await resolveAgentLoopContextBudget(ctx, providerCapabilities)
  const buildPromptForHistory = async (nextHistoryMessages: HistoryMessage[]) => buildPrompt({
    sessionId: ctx.sessionId,
    agentId: session?.agentId,
    providerId: ctx.providerId,
    providerConfig: toJsonObject(ctx.providerConfig),
    settings: ctx.settings,
    hasTools,
    skills: enabledSkills,
    workingDirectory: sessionWorkingDir,
    workingDirectoryRoots: sessionWorkingDirRoots,
    contextVariables: await buildContextVariablesPromptText(ctx.sessionId),
    activeProject: projectVars.active,
    knownProjects: projectVars.known,
    toolNames: Object.keys(builtinToolDefinitions),
    mcpToolNames: Object.keys(mcpTools),
    voiceConversation: ctx.voiceConversation,
    speakMode: ctx.speakMode ?? ctx.voiceConversation,
    historyMessages: nextHistoryMessages,
  })
  const showActiveMemoryLoading = Boolean(options.emitter) && shouldEmitActiveMemoryLoading(ctx)
  const promptContextStartedAt = Date.now()

  if (showActiveMemoryLoading) {
    const timeoutMs = ctx.settings.general?.soulMemory?.activeMemory?.timeoutMs ?? 15000
    console.info(
      `[ActiveMemory] agent-loop ui loading-memory session=${ctx.sessionId.slice(0, 8)} timeoutMs=${timeoutMs}`,
    )
    options.emitter?.sendContentPart({ type: 'loading-memory' })
  }

  const requestMessages = await buildPromptForHistory(historyMessages)

  if (showActiveMemoryLoading) {
    console.info(
      `[ActiveMemory] agent-loop ui waiting session=${ctx.sessionId.slice(0, 8)} promptContextDurationMs=${Date.now() - promptContextStartedAt}`,
    )
    options.emitter?.sendContentPart({ type: 'waiting' })
  }

  const rebuildAgentMessagesFromSession = async (messages: AgentMessage[]): Promise<AgentMessage[]> => {
    const latestSession = store.getSession(ctx.sessionId)
    if (!latestSession) return messages

    const rebuiltHistory = buildHistoryMessages(latestSession.messages, latestSession)
    const rebuiltPrompt = await buildPromptForHistory(rebuiltHistory)
    return [
      ...agentMessagesFromHistory(rebuiltPrompt.messages as AgentHistoryMessage[]),
      ...getAgentLoopTransientTail(messages),
    ]
  }

  const thinkingOptions = getAgentLoopThinkingOptions(ctx)
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
      tools: agentToolsFromToolDefinitions(modelToolDefinitions, async (name, args, toolCtx) => {
        const result = await executeToolDirectly(resolveAIToolName(name), args, {
          sessionId: ctx.sessionId,
          messageId: ctx.assistantMessageId,
          toolCallId: toolCtx.toolCallId,
          workingDirectory: sessionWorkingDir,
          workingDirectoryRoots: sessionWorkingDirRoots,
          abortSignal: toolCtx.abortSignal ?? ctx.abortSignal,
          onMetadata: toolCtx.onMetadata
            ? update => toolCtx.onMetadata?.({
                title: update.title,
                metadata: toJsonObject(update.metadata),
              })
            : undefined,
          onPartialResult: toolCtx.onPartialResult
            ? update => toolCtx.onPartialResult?.(update)
            : undefined,
        })
        return { ...result, data: toJsonValue(result.data) }
      }),
      policy: { enabled: hasTools },
    },
    skills: agentSkillContexts(enabledSkills),
    prompt: {
      injectSkills: false,
    },
    beforeTurn: async ({ turn, messages }) => {
      let nextMessages = messages
      const pendingSteering = ctx.steeringQueue?.drain() ?? []
      const injectedMessages = injectPendingAgentLoopMessages(ctx, nextMessages, pendingSteering)
      if (injectedMessages) {
        nextMessages = injectedMessages
      }

      const compactedMessages = await maybeCompactAgentLoopContext({
        ctx,
        turn,
        messages: nextMessages,
        budget,
        rebuildMessages: () => rebuildAgentMessagesFromSession(nextMessages),
      })
      if (compactedMessages) return compactedMessages

      const blockReason = getAgentLoopContextBlockReason({
        turn,
        providerId: ctx.providerId,
        compactEnabled: ctx.settings.chat?.contextCompactEnabled !== false,
        session: store.getSession(ctx.sessionId),
        budget,
      })
      if (blockReason) throw new Error(blockReason)
      if (nextMessages !== messages) return nextMessages
    },
    afterTurn: async ({ messages }) => {
      const steeringMessages = ctx.steeringQueue?.drain() ?? []
      if (steeringMessages.length > 0) {
        return injectPendingAgentLoopMessages(ctx, messages, steeringMessages)
      }

      const followUpMessages = ctx.followUpQueue?.drain() ?? []
      return injectPendingAgentLoopMessages(ctx, messages, followUpMessages)
    },
  })

  return {
    supported: true,
    runtime,
    systemPrompt: requestMessages.systemPrompt,
    enabledSkills,
    toolNames: Object.keys(builtinToolDefinitions),
    mcpToolNames: Object.keys(mcpTools),
    hasTools,
    supportsTools,
    modelContextLength: budget.modelContextLength,
    reservedOutputTokens: budget.reservedOutputTokens,
  }
}

export async function* streamAgentLoopChunksFromStreamContext(
  ctx: StreamContext,
  historyMessages: HistoryMessage[],
): AsyncGenerator<AgentProviderStreamChunk, AgentLoopResult, void> {
  const prepared = await buildAgentLoopRuntimeFromStreamContext(ctx, historyMessages)
  if (!prepared.supported) {
    throw new Error(prepared.reason)
  }

  return yield* streamAgentLoopProviderChunks(prepared.runtime)
}
