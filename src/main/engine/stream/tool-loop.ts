/**
 * Tool Loop Module
 * Handles tool loop execution and streaming generation
 */

import * as store from '../../store.js'
import type { SkillDefinition, ToolCall, ChatMessage, ContentPart } from '../../../shared/ipc.js'
import type { AIMessageContent, ToolChatMessage } from '../../providers/index.js'
import {
  streamChatResponseWithTools,
  convertToolDefinitionsForAI,
} from '../../providers/index.js'
import {
  getEnabledToolsAsync,
  setInitContext,
  initializeAsyncTools,
} from '../../tools/index.js'
import { getMCPToolsForAI } from '../../mcp/index.js'
import { getSkillsForSession } from '../../ipc/skills.js'
import { updateSessionUsage } from '../../ipc/sessions.js'
import { triggerManager, type TriggerContext } from '../triggers/index.js'
import { runAfterAssistantResponseHooks } from '../../plugins/lifecycle.js'
import * as modelRegistry from '../../providers/model-registry.js'
import { compactSessionContext, getContextCompactReason, type ContextCompactResult } from '../context-compact.js'

import { v4 as uuidv4 } from 'uuid'
import type { StreamContext, StreamProcessor } from './stream-processor.js'
import { createStreamProcessor } from './stream-processor.js'
import { type IPCEmitter } from './ipc-emitter.js'
import type { StreamChunkWithTools } from '../../providers/index.js'
import { createEventOnlyEmitter } from '../../events/event-only-emitter.js'
import { getEventBus } from '../../events/index.js'
import { saveMediaImage } from '../../ipc/media.js'
import { sendUIMessageFinish } from './stream-helpers.js'
import { buildHistoryMessages, sanitizeToolResultForAI, type HistoryMessage } from './message-helpers.js'
import { getTextFromContent } from './message-helpers.js'
import { buildPromptContext, buildRequestMessages } from '../prompt/index.js'
import type { PromptSegment } from '../prompt/types.js'
import { getProviderApiType } from './provider-helpers.js'
import { executeToolAndUpdate } from './tool-execution.js'
import { OrderedSideEffectQueue, needsOrderedSideEffectGate } from './tool-execution-order.js'
import { logRequestStart, logRequestEnd, logTurnStart, logTurnEnd, logContinuationMessages, logMessageBodyShape } from './chat-logger.js'
import { buildContextVariablesPromptText } from '../../variables/index.js'
import { buildProjectDirsPromptVars } from '../../project-dirs/index.js'
import { type PendingMessageQueue, type PendingMessage } from './message-queue.js'
import { getAIToolName } from '../../providers/tool-name-alias.js'
import { IPC_CHANNELS } from '../../../shared/ipc.js'
import { resolvePromptReferences } from '../../prompts/resolver.js'

// Gate per-chunk stream logs behind env flag. Running JSON.stringify on every
// text/tool-input delta noticeably slows streaming, so default off.
const DEBUG_STREAM = process.env.DEBUG_STREAM === '1' || process.env.DEBUG_STREAM === 'true'
const CODEX_NATIVE_IMAGE_GENERATION_TOOL = 'image_generation'

function shouldEmitActiveMemoryLoading(ctx: StreamContext): boolean {
  const soulMemory = ctx.settings.general?.soulMemory
  return soulMemory?.enabled !== false && soulMemory?.activeMemory?.enabled !== false
}

/**
 * Stream result indicating why the stream ended
 */
export interface StreamResult {
  pausedForConfirmation: boolean  // Stream paused waiting for tool confirmation
  ctx?: StreamContext
  processor?: StreamProcessor
}

/**
 * State for a single turn in the tool loop
 */
interface TurnState {
  toolCalls: ToolCall[]
  content: { value: string }
  reasoning: { value: string }
  orderedParts: ContentPart[]
  finishReason: string
  usage?: { inputTokens: number; outputTokens: number; totalTokens: number }
}

interface ToolExecutionJob {
  toolCall: ToolCall
  promise: Promise<void>
  settled: boolean
}

interface ToolLoopCompactOptions {
  ctx: StreamContext
  processor: StreamProcessor
  conversationMessages: ToolChatMessage[]
  modelContextLength: number
  reservedOutputTokens: number
  toolsForAI: Record<string, any>
  codexNativeTools: string[]
  enabledSkills: SkillDefinition[]
}

/**
 * Create initial state for a new turn
 */
function createTurnState(): TurnState {
  return {
    toolCalls: [],
    content: { value: '' },
    reasoning: { value: '' },
    orderedParts: [],
    finishReason: 'unknown',
    usage: undefined,
  }
}

function appendOrderedPart(parts: ContentPart[], part: ContentPart): void {
  const last = parts[parts.length - 1]
  if (part.type === 'text' && last?.type === 'text' && last.turnIndex === part.turnIndex) {
    last.content += part.content
    return
  }
  if (part.type === 'reasoning' && last?.type === 'reasoning' && last.turnIndex === part.turnIndex) {
    last.content += part.content
    return
  }
  parts.push(part)
}

function getTurnCodexEncryptedReasoning(turnState: TurnState): string[] {
  return turnState.orderedParts
    .filter((part): part is Extract<ContentPart, { type: 'provider-data' }> =>
      part.type === 'provider-data' &&
      part.provider === 'codex' &&
      typeof part.encryptedReasoning === 'string' &&
      part.encryptedReasoning.length > 0,
    )
    .map((part) => part.encryptedReasoning as string)
}

function providerUsesCodexOAuth(ctx: StreamContext): boolean {
  const providerConfig = ctx.providerConfig as any
  return providerConfig.authContext?.kind === 'oauth' ||
    typeof providerConfig.oauthToken?.accessToken === 'string'
}

async function getCodexNativeToolsForTurn(
  ctx: StreamContext,
  supportsTools: boolean,
): Promise<string[]> {
  if (ctx.providerId !== 'codex') return []
  if (!ctx.toolSettings?.enableToolCalls) return []
  if (!supportsTools) return []
  if (!providerUsesCodexOAuth(ctx)) return []

  const modelInfo = await modelRegistry.getModelById(ctx.providerConfig.model, ctx.providerId)
  const codexMetadata = modelInfo?.providerMetadata?.codex as Record<string, unknown> | undefined
  const nativeTools = Array.isArray(codexMetadata?.nativeTools)
    ? codexMetadata.nativeTools.filter((tool): tool is string => typeof tool === 'string')
    : undefined

  if (nativeTools) {
    return nativeTools.includes(CODEX_NATIVE_IMAGE_GENERATION_TOOL)
      ? [CODEX_NATIVE_IMAGE_GENERATION_TOOL]
      : []
  }

  const inputModalities = modelInfo?.architecture?.input_modalities
  return !modelInfo || inputModalities?.includes('image')
    ? [CODEX_NATIVE_IMAGE_GENERATION_TOOL]
    : []
}

function getLatestUserPrompt(messages: ToolChatMessage[]): string {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index]
    if (message.role !== 'user') continue
    const text = getTextFromContent(message.content).trim()
    if (text) return text
  }
  return 'Codex image generation'
}

function buildGeneratedImageMarkdown(mediaId: string, revisedPrompt?: string): string {
  const imageUrl = `media://${mediaId}.png`
  const promptText = revisedPrompt?.trim()
  return `${promptText ? `**Revised prompt:** ${promptText}\n\n` : ''}![Generated Image|mediaId:${mediaId}](${imageUrl})`
}

/**
 * Persist content parts to store after turn completion
 * Also handles IPC sending for turns WITHOUT tool calls (tool call turns send IPC earlier)
 */
function persistTurnContentParts(
  ctx: StreamContext,
  emitter: IPCEmitter,
  turnState: TurnState,
  turnIndex: number
): void {
  // Add contentParts for this turn to enable proper interleaving of text and steps
  // Note: IPC messages for content_part are sent earlier (before tool execution) for proper ordering
  // Here we only persist to store and send IPC for turns WITHOUT tool calls
  for (const part of turnState.orderedParts) {
    store.addMessageContentPart(ctx.sessionId, ctx.assistantMessageId, part)
    // Only send IPC if no tool calls (otherwise already sent before tool execution).
    // Text/reasoning deltas already updated the live renderer; these low-frequency
    // parts are mainly persisted ordering anchors.
    if (turnState.toolCalls.length === 0 && part.type !== 'provider-data') {
      emitter.sendContentPart(part)
    }
  }

  if (turnState.toolCalls.length > 0) {
    store.addMessageContentPart(ctx.sessionId, ctx.assistantMessageId, {
      type: 'data-steps',
      turnIndex,
    })
    // IPC already sent before tool execution, no need to send again
  }
}

/**
 * Build continuation messages for the next turn
 */
function buildContinuationMessages(
  turnState: TurnState,
  conversationMessages: ToolChatMessage[],
  turnIndex: number
): void {
  const assistantMsg: {
    role: 'assistant'
    content: string
    toolCalls: Array<{ toolCallId: string; toolName: string; args: Record<string, any> }>
    reasoningContent?: string
    codexEncryptedReasoning?: string[]
  } = {
    role: 'assistant' as const,
    content: turnState.content.value,
    toolCalls: turnState.toolCalls.map(tc => ({
      toolCallId: tc.id,
      toolName: getAIToolName(tc.toolId),
      args: tc.arguments,
    })),
  }
  if (turnState.reasoning.value) {
    assistantMsg.reasoningContent = turnState.reasoning.value
  }
  const codexEncryptedReasoning = getTurnCodexEncryptedReasoning(turnState)
  if (codexEncryptedReasoning.length > 0) {
    assistantMsg.codexEncryptedReasoning = codexEncryptedReasoning
  }
  conversationMessages.push(assistantMsg)

  const toolResultMsg = {
    role: 'tool' as const,
    content: turnState.toolCalls.map(tc => ({
      type: 'tool-result' as const,
      toolCallId: tc.id,
      toolName: getAIToolName(tc.toolId),
      result: tc.status === 'completed' ? sanitizeToolResultForAI(tc.result) : { error: tc.error },
    })),
  }
  conversationMessages.push(toolResultMsg)

  // Log what we're sending for the next turn
  logContinuationMessages(
    turnIndex,
    turnState.content.value,
    assistantMsg.toolCalls,
    toolResultMsg.content.map(tr => ({
      toolCallId: tr.toolCallId,
      toolName: tr.toolName,
      result: tr.result,
    }))
  )
}

/**
 * Append an assistant-only turn before injected user guidance.
 * Tool-call turns use buildContinuationMessages() because they need paired
 * tool result messages; plain text turns still need to be visible to the next
 * LLM call when the user steers or queues a follow-up mid-stream.
 */
function appendAssistantTurnMessage(
  turnState: TurnState,
  conversationMessages: ToolChatMessage[],
): void {
  if (!turnState.content.value && !turnState.reasoning.value) return

  const assistantMsg: {
    role: 'assistant'
    content: string
    reasoningContent?: string
    codexEncryptedReasoning?: string[]
  } = {
    role: 'assistant' as const,
    content: turnState.content.value,
  }
  if (turnState.reasoning.value) {
    assistantMsg.reasoningContent = turnState.reasoning.value
  }
  const codexEncryptedReasoning = getTurnCodexEncryptedReasoning(turnState)
  if (codexEncryptedReasoning.length > 0) {
    assistantMsg.codexEncryptedReasoning = codexEncryptedReasoning
  }
  conversationMessages.push(assistantMsg)
}

async function markAssistantTurnComplete(
  ctx: StreamContext,
  processor: StreamProcessor,
): Promise<void> {
  await processor.finalize()
  try {
    const eventBus = getEventBus()
    await eventBus.emit(ctx.sessionId, {
      type: 'message:updated',
      messageId: ctx.assistantMessageId,
      updates: { isStreaming: false },
    })
  } catch (err) {
    console.error('[ToolLoop] message:updated emit error:', err)
  }
}

async function createNextAssistantTurn(
  ctx: StreamContext,
): Promise<{ ctx: StreamContext; processor: StreamProcessor; emitter: IPCEmitter }> {
  const assistantMessageId = uuidv4()
  const assistantMessage: ChatMessage = {
    id: assistantMessageId,
    role: 'assistant',
    model: ctx.providerConfig.model,
    content: '',
    timestamp: Date.now(),
    isStreaming: true,
    thinkingStartTime: Date.now(),
    toolCalls: [],
    contentParts: [],
  }

  store.addMessage(ctx.sessionId, assistantMessage)

  ctx.assistantMessageId = assistantMessageId

  try {
    const eventBus = getEventBus()
    await eventBus.emit(ctx.sessionId, {
      type: 'message:assistant-created',
      message: assistantMessage,
    })
    await eventBus.emit(ctx.sessionId, {
      type: 'stream:start',
      messageId: assistantMessageId,
      assistantMessageId,
      model: ctx.providerConfig.model,
    })
  } catch (err) {
    console.error('[ToolLoop] assistant turn emit error:', err)
  }

  const nextProcessor = createStreamProcessor(ctx)
  return {
    ctx,
    processor: nextProcessor,
    emitter: createEventOnlyEmitter(ctx),
  }
}

async function emitContextCompactResult(
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
  } catch (err) {
    console.error('[ToolLoop] context compact event emit error:', err)
  }
}

async function rebuildConversationMessagesFromSession(options: {
  ctx: StreamContext
  conversationMessages: ToolChatMessage[]
  toolsForAI: Record<string, any>
  codexNativeTools: string[]
  enabledSkills: SkillDefinition[]
}): Promise<{ systemPrompt: string; systemPromptSegments: PromptSegment[] }> {
  const session = store.getSession(options.ctx.sessionId)
  if (!session) {
    return { systemPrompt: '', systemPromptSegments: [] }
  }

  const historyMessages = buildHistoryMessages(session.messages, session)
  const projectVars = buildProjectDirsPromptVars(session.workingDirectory)
  const toolNames = Object.keys(options.toolsForAI).filter(name => !name.startsWith('mcp_'))
  const mcpToolNames = Object.keys(options.toolsForAI).filter(name => name.startsWith('mcp_'))
  const promptContext = await buildPromptContext({
    previousState: session.promptContext ?? undefined,
    sessionId: options.ctx.sessionId,
    agentId: session.agentId,
    providerId: options.ctx.providerId,
    providerConfig: options.ctx.providerConfig as unknown as Record<string, unknown>,
    settings: options.ctx.settings,
    hasTools: Object.keys(options.toolsForAI).length > 0 || options.codexNativeTools.length > 0,
    skills: options.enabledSkills,
    workingDirectory: session.workingDirectory,
    workingDirectoryRoots: session.workingDirectoryRoots,
    contextVariables: await buildContextVariablesPromptText(options.ctx.sessionId),
    activeProject: projectVars.active,
    knownProjects: projectVars.known,
    toolNames: [...toolNames, ...options.codexNativeTools],
    mcpToolNames,
    voiceConversation: options.ctx.voiceConversation,
    speakMode: options.ctx.speakMode ?? options.ctx.voiceConversation,
  })
  store.updateSessionPromptContext(options.ctx.sessionId, promptContext.state)

  const requestMessages = buildRequestMessages({
    providerId: options.ctx.providerId,
    promptContext: promptContext.state,
    emittedFragments: promptContext.emittedFragments,
    historyMessages,
  })

  options.conversationMessages.splice(
    0,
    options.conversationMessages.length,
    ...(requestMessages.messages as ToolChatMessage[]),
  )

  return {
    systemPrompt: requestMessages.systemPrompt,
    systemPromptSegments: requestMessages.systemPromptSegments,
  }
}

async function maybeCompactToolLoopContext(options: ToolLoopCompactOptions): Promise<{
  compacted: boolean
  systemPrompt?: string
  systemPromptSegments?: PromptSegment[]
  blockedError?: string
}> {
  if (options.ctx.settings.chat?.contextCompactEnabled === false) return { compacted: false }

  const compactSettings = options.ctx.settings.chat
  const configuredKeepTurns = compactSettings?.contextCompactKeepRecentTurns ?? 6
  let keepRecentTurns = configuredKeepTurns
  let compactedResult: ContextCompactResult | null = null

  for (let pass = 1; pass <= configuredKeepTurns; pass++) {
    const session = store.getSession(options.ctx.sessionId)
    if (!session) return { compacted: false }

    const reason = getContextCompactReason({
      session,
      modelContextLength: options.modelContextLength,
      thresholdPercent: compactSettings?.contextCompactThreshold ?? 85,
      reservedOutputTokens: options.reservedOutputTokens,
    })
    if (!reason) break

    console.log('[ToolLoop] Context compact triggered between tool turns', {
      sessionId: options.ctx.sessionId,
      model: options.ctx.providerConfig.model,
      modelContextLength: options.modelContextLength,
      reservedOutputTokens: options.reservedOutputTokens,
      keepRecentTurns,
      pass,
      reason,
    })

    const result = await compactSessionContext({
      sessionId: options.ctx.sessionId,
      providerId: options.ctx.providerId,
      configWithApiKey: options.ctx.providerConfig as any,
      settings: options.ctx.settings,
      keepRecentTurns,
      onMessageCreated: async message => {
        await getEventBus().emit(options.ctx.sessionId, {
          type: 'message:user-created',
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

    if (!result.success) {
      await emitContextCompactResult(options.ctx, result)
      console.warn('[ToolLoop] Context compact failed during tool loop:', result.error)
      return { compacted: false }
    }

    if (result.skipped) {
      await emitContextCompactResult(options.ctx, result)
      keepRecentTurns--
      if (keepRecentTurns <= 0) break
      continue
    }

    compactedResult = result
    if (reason === 'hard-limit') {
      keepRecentTurns--
      if (keepRecentTurns <= 0) break
      continue
    }
    break
  }

  if (!compactedResult) {
    const latestSession = store.getSession(options.ctx.sessionId)
    const finalReason = latestSession ? getContextCompactReason({
      session: latestSession,
      modelContextLength: options.modelContextLength,
      thresholdPercent: compactSettings?.contextCompactThreshold ?? 85,
      reservedOutputTokens: options.reservedOutputTokens,
    }) : null
    if (latestSession && finalReason === 'hard-limit') {
      return {
        compacted: false,
        blockedError: buildContextHardLimitError(
          latestSession.contextSize ?? latestSession.lastInputTokens ?? 0,
          options.reservedOutputTokens,
          options.modelContextLength,
        ),
      }
    }
    return { compacted: false }
  }

  await markAssistantTurnComplete(options.ctx, options.processor)
  store.updateSessionContextSize(options.ctx.sessionId, 0)
  await emitContextCompactResult(options.ctx, { ...compactedResult, retainedContextSize: 0 })

  const finalSession = store.getSession(options.ctx.sessionId)
  const finalReason = finalSession ? getContextCompactReason({
    session: finalSession,
    modelContextLength: options.modelContextLength,
    thresholdPercent: compactSettings?.contextCompactThreshold ?? 85,
    reservedOutputTokens: options.reservedOutputTokens,
  }) : null
  if (finalSession && finalReason === 'hard-limit') {
    return {
      compacted: true,
      blockedError: buildContextHardLimitError(
        finalSession.contextSize ?? finalSession.lastInputTokens ?? 0,
        options.reservedOutputTokens,
        options.modelContextLength,
      ),
    }
  }

  const rebuilt = await rebuildConversationMessagesFromSession({
    ctx: options.ctx,
    conversationMessages: options.conversationMessages,
    toolsForAI: options.toolsForAI,
    codexNativeTools: options.codexNativeTools,
    enabledSkills: options.enabledSkills,
  })

  return {
    compacted: true,
    systemPrompt: rebuilt.systemPrompt,
    systemPromptSegments: rebuilt.systemPromptSegments,
  }
}

function buildContextHardLimitError(
  inputTokens: number,
  reservedOutputTokens: number,
  modelContextLength: number,
): string {
  return [
    'Context is still too large after compacting during the tool loop.',
    `Last known provider input ${inputTokens.toLocaleString()} + reserved output ${reservedOutputTokens.toLocaleString()} exceeds model context ${modelContextLength.toLocaleString()}.`,
    'Reduce the latest message/tool context or lower max output tokens before retrying.',
  ].join(' ')
}

/**
 * Unified stream execution function
 * Handles both tool-enabled and simple streaming in a single code path
 *
 * When tools is empty {}, the loop naturally exits after the first turn
 * When tools are provided, the loop continues until no more tool calls
 */
export async function runStream(
  ctx: StreamContext,
  conversationMessages: ToolChatMessage[],
  systemPrompt: string,
  toolsForAI: Record<string, any>,  // Can be {} for no-tools mode
  codexNativeTools: string[] = [],
  processor: StreamProcessor,
  enabledSkills: SkillDefinition[],
  steeringQueue?: PendingMessageQueue,
  followUpQueue?: PendingMessageQueue,
  systemPromptSegments?: PromptSegment[],
  onWriterChanged?: (writer: { ctx: StreamContext; processor: StreamProcessor; emitter: IPCEmitter }) => void,
): Promise<StreamResult> {
  const MAX_TOOL_TURNS = 100
  let currentTurn = 0
  let assistantTurn = 0
  const apiType = getProviderApiType(ctx.settings, ctx.providerId)
  const activeCodexNativeTools = codexNativeTools.length > 0
    ? codexNativeTools
    : await getCodexNativeToolsForTurn(
        ctx,
        await modelRegistry.modelSupportsTools(ctx.providerConfig.model, ctx.providerId),
      )
  let emitter = createEventOnlyEmitter(ctx)

  // Get model context length for logging
  let modelContextLength = 128000
  try {
    modelContextLength = await modelRegistry.getModelContextLength(ctx.providerConfig.model, ctx.providerId)
  } catch (error) {
    console.warn('[ToolLoop] Failed to get model context length:', error)
  }

  // ── Double-loop: inner = tool calls + steering, outer = follow-up ──
  // Check for queued messages at start (may have been queued before stream began)
  let pendingSteering: PendingMessage[] = steeringQueue?.drain() || []
  let needsAssistantAfterCompact = false

  while (currentTurn < MAX_TOOL_TURNS) {
    let hasMoreToolCalls = true
    let lastSettledTurn: TurnState | undefined
    let lastTurnInConversation = false

    // ── Inner loop: process tool calls and inject steering messages ──
    while (hasMoreToolCalls || pendingSteering.length > 0) {
      // 1. Inject pending steering messages before the next LLM call
      if (pendingSteering.length > 0) {
        if (currentTurn > 0) {
          if (!needsAssistantAfterCompact) {
            await markAssistantTurnComplete(ctx, processor)
          }
          injectPendingMessages(ctx, conversationMessages, emitter, pendingSteering)
          const next = await createNextAssistantTurn(ctx)
          ctx = next.ctx
          processor = next.processor
          emitter = next.emitter
          onWriterChanged?.(next)
          assistantTurn = 0
          needsAssistantAfterCompact = false
        } else {
          injectPendingMessages(ctx, conversationMessages, emitter, pendingSteering)
        }
        pendingSteering = []
      }

      if (needsAssistantAfterCompact) {
        const next = await createNextAssistantTurn(ctx)
        ctx = next.ctx
        processor = next.processor
        emitter = next.emitter
        onWriterChanged?.(next)
        assistantTurn = 0
        needsAssistantAfterCompact = false
      }

      currentTurn++
      assistantTurn++
      const turn = createTurnState()
      const executedToolCallIds = new Set<string>()
      const toolExecutionJobs: ToolExecutionJob[] = []
      const sideEffectQueue = new OrderedSideEffectQueue()
      let sentToolContentParts = false

      logTurnStart(currentTurn)

      // Send continuation at the START of each turn (except first) to show waiting indicator
      if (assistantTurn > 1) {
        emitter.sendContinuation(currentTurn)
      }

    // Resolve max output tokens with per-model precedence:
    //   1. User's per-model override (settings.providers[id].maxOutputByModel[model])
    //   2. Half the model's own limit from models.dev — leaves room for input context
    //      while still allowing reasonable replies. User can opt into the full limit
    //      explicitly via the per-model setting.
    //   3. Global chat.maxTokens setting (only when models.dev has no data).
    // The resolved value is always hard-capped at the model's actual limit so the
    // request never exceeds what the API will accept.
    const modelMaxOutputTokens = await modelRegistry.getModelMaxOutputTokens(ctx.providerConfig.model, ctx.providerId)
    const perModelOverride = ctx.providerConfig.maxOutputByModel?.[ctx.providerConfig.model]
    const globalMax = ctx.settings.chat?.maxTokens || 4096
    const halfDefault = modelMaxOutputTokens > 0
      ? Math.max(1, Math.floor(modelMaxOutputTokens / 2))
      : 0
    const requested = perModelOverride ?? (halfDefault > 0 ? halfDefault : globalMax)
    const effectiveMaxTokens = modelMaxOutputTokens > 0
      ? Math.min(requested, modelMaxOutputTokens)
      : requested

    // Resolve temperature with per-model precedence:
    //   1. providerConfig.temperatureByModel[model]
    //   2. providerConfig.temperature (legacy per-provider)
    //   3. settings.ai.temperature (global default)
    // Models that don't accept the temperature parameter (per models.dev) get
    // `undefined` so the SDK skips it entirely — required for reasoning models
    // that reject the field.
    const model = ctx.providerConfig.model
    const supportsTemp = await modelRegistry.modelSupportsTemperature(model, ctx.providerId)
    const perModelTemp = ctx.providerConfig.temperatureByModel?.[model]
    const resolvedTemp = perModelTemp
      ?? ctx.providerConfig.temperature
      ?? ctx.settings.ai.temperature
    const temperature = supportsTemp ? resolvedTemp : undefined

    // Native per-model thinking toggle (DeepSeek v4 series and friends).
    // `undefined` means "leave it to the provider's default"; only forward
    // when the user has explicitly opted in or out via ThinkToggle.
    const thinkingPref = ctx.providerConfig.thinkingByModel?.[model]
    const lowerModel = model.toLowerCase()
    const isDeepSeekThinkingModel =
      ctx.providerId === 'deepseek' &&
      (thinkingPref === true ||
        lowerModel.includes('reasoner') ||
        lowerModel.includes('thinking') ||
        /(^|[^a-z])v4/.test(lowerModel))
    const isCodexThinkingModel =
      ctx.providerId === 'codex' &&
      (thinkingPref === true ||
        lowerModel.startsWith('gpt-5') ||
        lowerModel.includes('codex') ||
        lowerModel.includes('reasoning') ||
        await modelRegistry.modelSupportsReasoning(model, ctx.providerId))
    const effectiveThinking =
      thinkingPref === undefined
        ? isCodexThinkingModel || isDeepSeekThinkingModel
          ? true
          : undefined
        : thinkingPref
    const thinkingEffort =
      ctx.providerId === 'deepseek' && effectiveThinking !== false && isDeepSeekThinkingModel
        ? ctx.providerConfig.thinkingEffortByModel?.[model] ?? 'high'
        : ctx.providerId === 'codex' && effectiveThinking !== false && isCodexThinkingModel
          ? ctx.providerConfig.thinkingEffortByModel?.[model] ?? 'medium'
          : undefined
    const configuredServiceTier = ctx.providerId === 'codex'
      ? ctx.providerConfig.serviceTierByModel?.[model]?.trim()
      : undefined
    const serviceTier = configuredServiceTier && configuredServiceTier.toLowerCase() !== 'auto'
      ? configuredServiceTier
      : undefined
    const snapshotThinking =
      effectiveThinking === undefined
        ? undefined
        : effectiveThinking
          ? 'enabled'
          : 'disabled'

    // Emit a pre-flight snapshot for the Inspector panel. Captures intent
    // (messages, tools, thinking, sampling params) without touching the
    // wire body — kept small so the renderer ring buffer stays cheap.
    try {
      const eventBus = getEventBus()
      const snapshotMessages = conversationMessages.map((m) => {
        if (m.role === 'tool') {
          const first = (m.content as any[])?.[0]
          const resultStr = (() => {
            try {
              return JSON.stringify(first?.result ?? '')
            } catch {
              return String(first?.result ?? '')
            }
          })()
          return {
            role: 'tool' as const,
            contentPreview: resultStr.slice(0, 200),
            content: resultStr,
            contentLength: resultStr.length,
            hasReasoning: false,
            toolCallId: first?.toolCallId,
            toolName: first?.toolName,
          }
        }
        const text = typeof m.content === 'string'
          ? m.content
          : Array.isArray(m.content)
            ? m.content
                .filter((p: any) => p.type === 'text')
                .map((p: any) => p.text)
                .join('')
            : String(m.content ?? '')
        const base = {
          role: m.role,
          contentPreview: text.slice(0, 200),
          content: text,
          contentLength: text.length,
          sourceSegments:
            (m as any).sourceSegments ??
            (m.role === 'system' && systemPromptSegments
              ? systemPromptSegments
              : undefined),
          hasReasoning: m.role === 'assistant' && !!(m as any).reasoningContent,
          reasoningLength:
            m.role === 'assistant' && (m as any).reasoningContent
              ? ((m as any).reasoningContent as string).length
              : undefined,
        } as const
        if (m.role === 'assistant' && (m as any).toolCalls?.length) {
          return {
            ...base,
            toolCalls: (m as any).toolCalls.map((tc: any) => ({
              id: tc.toolCallId,
              name: tc.toolName,
              argsLength: (() => {
                try {
                  return JSON.stringify(tc.args ?? {}).length
                } catch {
                  return 0
                }
              })(),
            })),
          }
        }
        return base
      })

      eventBus
        .emit(ctx.sessionId, {
          type: 'request:snapshot',
          snapshot: {
            timestamp: Date.now(),
            providerId: ctx.providerId,
            model,
            turn: currentTurn,
            messages: snapshotMessages,
            tools: [
              ...Object.entries(toolsForAI).map(([name, def]) => ({
                name,
                description: (def as any)?.description,
              })),
              ...activeCodexNativeTools.map((name) => ({
                name,
                description: name === CODEX_NATIVE_IMAGE_GENERATION_TOOL
                  ? 'Codex native image generation'
                  : undefined,
              })),
            ],
            thinking: snapshotThinking,
            thinkingEffort,
            serviceTier,
            temperature,
            maxTokens: effectiveMaxTokens,
          },
        })
        .catch((err) =>
          console.error('[ToolLoop] request:snapshot emit error:', err),
        )
    } catch {
      // Event system not initialized — ignore.
    }

    logMessageBodyShape('[ToolLoop] provider request body before stream', conversationMessages as Array<Record<string, any>>, {
      sessionId: ctx.sessionId,
      providerId: ctx.providerId,
      model,
      turn: currentTurn,
      systemPromptChars: systemPrompt.length,
      maxTokens: effectiveMaxTokens,
      hasSummary: Boolean(store.getSession(ctx.sessionId)?.summary),
      summaryUpToMessageId: store.getSession(ctx.sessionId)?.summaryUpToMessageId,
    })

    const stream = streamChatResponseWithTools(
      ctx.providerId,
      {
        apiKey: ctx.providerConfig.apiKey ?? '',
        baseUrl: ctx.providerConfig.baseUrl,
        model,
        apiType,
        oauthToken: (ctx.providerConfig as any).oauthToken,
        authContext: (ctx.providerConfig as any).authContext,
      },
      conversationMessages,
      toolsForAI,
      {
        temperature,
        maxTokens: effectiveMaxTokens,
        abortSignal: ctx.abortSignal,
        thinking: effectiveThinking,
        thinkingEffort,
        serviceTier,
        codexNativeTools: activeCodexNativeTools,
        debugSessionId: ctx.sessionId,
        debugTurn: currentTurn,
      }
    )

    let turnUsage: { inputTokens: number; outputTokens: number; totalTokens: number } | undefined

    const sendToolContentPartsOnce = (): void => {
      if (sentToolContentParts) return
      sentToolContentParts = true
      for (const part of turn.orderedParts) {
        if (part.type === 'provider-data') continue
        if (part.type === 'text') {
          console.log(`[Stream] Sending content_part: text (${part.content.length} chars) before first tool`)
        }
        emitter.sendContentPart(part)
      }
      console.log(`[Stream] Sending content_part: data-steps turn=${currentTurn}`)
      emitter.sendContentPart({ type: 'data-steps', turnIndex: currentTurn })
    }

    const startToolExecution = (
      toolCall: ToolCall,
      toolCallData: { toolName: string; args: Record<string, any> },
      existingStepId?: string,
    ): void => {
      if (executedToolCallIds.has(toolCall.id)) return

      sendToolContentPartsOnce()
      turn.toolCalls.push(toolCall)
      executedToolCallIds.add(toolCall.id)

      const gate = needsOrderedSideEffectGate(toolCallData.toolName)
        ? sideEffectQueue.createGate()
        : undefined

      const job: ToolExecutionJob = {
        toolCall,
        settled: false,
        promise: Promise.resolve(),
      }

      job.promise = (async () => {
        try {
          await executeToolAndUpdate(ctx, toolCall, toolCallData, processor.toolCalls, enabledSkills, currentTurn, existingStepId, {
            beforeSideEffect: gate?.beforeSideEffect,
          })
        } catch (err) {
          console.error('[ToolLoop] tool execution job error:', err)
        } finally {
          gate?.release()
          job.settled = true
        }
      })()

      toolExecutionJobs.push(job)
    }

    const handleCodexProviderData = async (chunk: StreamChunkWithTools): Promise<void> => {
      const data = chunk.providerData
      if (!data || data.provider !== 'codex') return

      if (data.type === 'encrypted-reasoning') {
        appendOrderedPart(turn.orderedParts, {
          type: 'provider-data',
          provider: 'codex',
          encryptedReasoning: data.encryptedContent,
          turnIndex: currentTurn,
        })
        return
      }

      if (data.type === 'image-generation-start') {
        console.log(`[Codex] Image generation started: ${data.callId}`)
        emitter.sendContentPart({
          type: 'image-loading',
          turnIndex: currentTurn,
          label: 'Generating image',
        })
        return
      }

      if (data.type !== 'image-generation-result') return

      const mediaItem = await saveMediaImage({
        base64: data.result,
        prompt: getLatestUserPrompt(conversationMessages),
        revisedPrompt: data.revisedPrompt,
        model,
        sessionId: ctx.sessionId,
        messageId: ctx.assistantMessageId,
      })

      const markdown = buildGeneratedImageMarkdown(mediaItem.id, data.revisedPrompt)
      const prefix = turn.content.value && !turn.content.value.endsWith('\n') ? '\n\n' : ''
      const content = `${prefix}${markdown}`
      const displayContent = processor.handleTextChunk(content, turn.content, currentTurn)
      if (displayContent) appendOrderedPart(turn.orderedParts, { type: 'text', content: displayContent, turnIndex: currentTurn })

      if (!ctx.sender.isDestroyed()) {
        ctx.sender.send(IPC_CHANNELS.IMAGE_GENERATED, {
          id: mediaItem.id,
          mediaId: mediaItem.id,
          filePath: mediaItem.filePath,
          prompt: mediaItem.prompt,
          revisedPrompt: mediaItem.revisedPrompt,
          model: mediaItem.model,
          sessionId: ctx.sessionId,
          messageId: ctx.assistantMessageId,
          createdAt: mediaItem.createdAt,
        })
      }
    }

    const processToolChunk = (chunk: StreamChunkWithTools): void => {
      if (chunk.type === 'tool-input-start' && chunk.toolInputStart) {
        const toolCallId = chunk.toolInputStart.toolCallId
        processor.handleToolInputStart(
          toolCallId,
          chunk.toolInputStart.toolName,
          currentTurn  // Pass turnIndex for proper contentParts ordering
        )
        return
      }

      if (chunk.type === 'tool-input-delta' && chunk.toolInputDelta) {
        processor.handleToolInputDelta(
          chunk.toolInputDelta.toolCallId,
          chunk.toolInputDelta.argsTextDelta
        )
        return
      }

      if (chunk.type === 'tool-call' && chunk.toolCall) {
        const toolCallId = chunk.toolCall.toolCallId
        if (executedToolCallIds.has(toolCallId)) {
          return
        }

        // Get the step ID before handleToolCallChunk (which may clear the buffer)
        const existingStepId = processor.getStepIdForToolCall(toolCallId)

        const toolCall = processor.handleToolCallChunk(chunk.toolCall)

        // Always execute tools - the tool will decide if it needs confirmation
        // by returning requiresConfirmation: true (e.g., bash for dangerous commands)
        // Pass the resolved toolId for execution, include skills for Tool Agent
        startToolExecution(toolCall, {
          toolName: toolCall.toolId,
          args: chunk.toolCall.args
        }, existingStepId)
        return
      }

      if (chunk.type === 'tool-input-end' && chunk.toolInputEnd) {
        const toolCallId = chunk.toolInputEnd.toolCallId
        if (executedToolCallIds.has(toolCallId)) {
          return
        }

        const existingStepId = processor.getStepIdForToolCall(toolCallId)
        const toolCall = processor.handleToolInputEnd(toolCallId)
        if (!toolCall) {
          return
        }

        startToolExecution(toolCall, {
          toolName: toolCall.toolId,
          args: toolCall.arguments,
        }, existingStepId)
        return
      }
    }

    for await (const chunk of stream) {
        // Log raw stream chunks (gated: each token passing through JSON.stringify slows streaming)
        if (DEBUG_STREAM) {
          if (chunk.type === 'text') {
            console.log(`[Stream] text: "${chunk.text}"`)
          } else if (chunk.type === 'reasoning') {
            console.log(`[Stream] reasoning: "${chunk.reasoning?.substring(0, 50)}..."`)
          } else if (chunk.type === 'tool-call') {
            console.log(`[Stream] tool-call:`, chunk.toolCall?.toolName, JSON.stringify(chunk.toolCall?.args)?.substring(0, 100))
          } else if (chunk.type === 'tool-input-start') {
            console.log(`[Stream] tool-input-start:`, chunk.toolInputStart?.toolName, chunk.toolInputStart?.toolCallId)
          } else if (chunk.type === 'tool-input-delta') {
            console.log(`[Stream] tool-input-delta:`, chunk.toolInputDelta?.argsTextDelta)
          } else if (chunk.type === 'provider-data') {
            console.log('[Stream] provider-data: codex encrypted reasoning redacted')
          } else {
            console.log(`[Stream] ${chunk.type}:`, JSON.stringify(chunk).substring(0, 150))
          }
        }

        if (chunk.type === 'text' && chunk.text) {
          const displayContent = processor.handleTextChunk(chunk.text, turn.content, currentTurn)
          if (displayContent) appendOrderedPart(turn.orderedParts, { type: 'text', content: displayContent, turnIndex: currentTurn })
        }

        if (chunk.type === 'reasoning' && chunk.reasoning) {
          const hasVisibleTurnActivity =
            turn.content.value.length > 0 ||
            turn.toolCalls.length > 0 ||
            sentToolContentParts ||
            turn.orderedParts.some(part => part.type !== 'provider-data')
          const placement =
            currentTurn === 1 &&
            processor.accumulatedContent.length === 0 &&
            !hasVisibleTurnActivity
              ? 'top'
              : 'inline'
          processor.handleReasoningChunk(chunk.reasoning, turn.reasoning, currentTurn, placement)
          if (placement === 'inline') {
            appendOrderedPart(turn.orderedParts, { type: 'reasoning', content: chunk.reasoning, turnIndex: currentTurn })
          }
        }

        if (chunk.type === 'provider-data' && chunk.providerData?.provider === 'codex') {
          await handleCodexProviderData(chunk)
        }

        if (chunk.type === 'tool-input-start' || chunk.type === 'tool-input-delta' || chunk.type === 'tool-input-end' || chunk.type === 'tool-call') {
          processToolChunk(chunk)
        }

        // AI SDK v6 flow: tool-input-start -> tool-input-delta* -> tool-input-end -> tool-call.
        // We execute at tool-input-end so permission is requested per completed tool input;
        // the later tool-call chunk for the same id is ignored as a duplicate.

        // Capture usage data and finishReason from finish chunk
        if (chunk.type === 'finish') {
          // Capture finishReason for loop control (OpenCode style)
          turn.finishReason = chunk.finishReason || 'unknown'

          if (chunk.usage) {
            turnUsage = chunk.usage
            turn.usage = chunk.usage
            // Accumulate usage to context for final reporting
            ctx.accumulatedUsage = ctx.accumulatedUsage || { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
            ctx.accumulatedUsage.inputTokens += chunk.usage.inputTokens
            ctx.accumulatedUsage.outputTokens += chunk.usage.outputTokens
            ctx.accumulatedUsage.totalTokens += chunk.usage.totalTokens
            // Track last turn's usage for context size (NOT accumulated)
            ctx.lastTurnUsage = chunk.usage
            logTurnEnd(currentTurn, chunk.usage, turn.toolCalls.length)

            // Send real-time context size update to frontend
            // Context size = input tokens only (context window limit applies to input)
            emitter.sendContextSizeUpdate(chunk.usage.inputTokens)
          }
	        }
	      }

    if (toolExecutionJobs.length > 0) {
      await Promise.allSettled(toolExecutionJobs.map(job => job.promise))
    }

	    // Update all steps in this turn with the turn's usage data
    if (turnUsage && turn.toolCalls.length > 0) {
      const updatedStepIds = store.updateStepsUsageByTurn(
        ctx.sessionId,
        ctx.assistantMessageId,
        currentTurn,
        turnUsage
      )
      // Notify frontend about the usage updates for each step
      // Note: store already updated by updateStepsUsageByTurn, we emit directly
      // to EventBus because sendStepUpdated would double-update the store
      try {
        const eventBus = getEventBus()
        for (const stepId of updatedStepIds) {
          eventBus.emit(ctx.sessionId, {
            type: 'step:updated',
            stepId,
            updates: { usage: turnUsage },
          }).catch(err => console.error('[ToolLoop] step:updated emit error:', err))
        }
      } catch {
        // Event system not initialized — ignore
      }
      console.log(`[Backend] Updated ${updatedStepIds.length} steps with turn ${currentTurn} usage`)
    }

    // Persist content parts to store (and send IPC for non-tool-call turns)
    persistTurnContentParts(ctx, emitter, turn, currentTurn)

    lastSettledTurn = turn
    lastTurnInConversation = false

    // If any tool requires confirmation, stop the loop and signal pause
    if (turn.toolCalls.some(tc => tc.requiresConfirmation)) {
      console.log(`[Backend] Tool requires user confirmation, pausing loop`)
      return { pausedForConfirmation: true, ctx, processor }
    }

    let appendedContinuation = false

    // Determine if we have more tool calls for the inner loop
    if (turn.toolCalls.length === 0) {
      // No tool calls this turn - inner loop will settle

      // Check if output was truncated due to max token limit
      if (turn.finishReason === 'length') {
        const truncationMessage = '\n\n⚠️ Response was truncated due to max token limit. Please type "continue" to resume.'
        const existingContent = turn.content.value || ''
        const fullContent = existingContent + truncationMessage
        store.updateMessageContent(ctx.sessionId, ctx.assistantMessageId, fullContent)
        emitter.sendTextChunk(truncationMessage)
      }

      console.log(`[Backend] No tool calls in turn ${currentTurn}, finishReason: ${turn.finishReason}`)
      hasMoreToolCalls = false
    } else if (!turn.toolCalls.every(tc => tc.status === 'completed' || tc.status === 'failed')) {
      console.log(`[Backend] Not all tools auto-executed in turn ${currentTurn}`)
      hasMoreToolCalls = false
    } else {
      // All tools executed successfully — build continuation for next inner loop iteration
      hasMoreToolCalls = true
      const compacted = await maybeCompactToolLoopContext({
        ctx,
        processor,
        conversationMessages,
        modelContextLength,
        reservedOutputTokens: effectiveMaxTokens,
        toolsForAI,
        codexNativeTools: activeCodexNativeTools,
        enabledSkills,
      })

      if (compacted.blockedError) {
        throw new Error(compacted.blockedError)
      } else if (compacted.compacted) {
        if (compacted.systemPrompt !== undefined) systemPrompt = compacted.systemPrompt
        if (compacted.systemPromptSegments !== undefined) systemPromptSegments = compacted.systemPromptSegments
        needsAssistantAfterCompact = true
        appendedContinuation = true
        lastTurnInConversation = true
      } else {
        buildContinuationMessages(turn, conversationMessages, currentTurn)
        appendedContinuation = true
        lastTurnInConversation = true
      }
    }

    // After turn settles, drain steering queue for the next inner loop iteration
    const nextSteering = steeringQueue?.drain() || []
    if (nextSteering.length > 0) {
      if (!appendedContinuation) {
        appendAssistantTurnMessage(turn, conversationMessages)
        lastTurnInConversation = true
      }
      pendingSteering = nextSteering
    }
  } // end inner while (hasMoreToolCalls || pendingSteering)

  // ── Inner loop settled. Check for follow-up messages. ──
  const followUpMessages = followUpQueue?.drain() || []
  if (followUpMessages.length > 0) {
    console.log(`[ToolLoop] Injecting ${followUpMessages.length} follow-up message(s) after turn ${currentTurn}`)
    if (lastSettledTurn && !lastTurnInConversation) {
      appendAssistantTurnMessage(lastSettledTurn, conversationMessages)
    }
    // Process as steering on the next outer-loop iteration
    pendingSteering = followUpMessages
    continue
  }

  // No more follow-up, truly exit
  break
  } // end outer while

  if (currentTurn >= MAX_TOOL_TURNS) {
    console.log(`[Backend] Reached max tool turns (${MAX_TOOL_TURNS})`)
  }

  return { pausedForConfirmation: false, ctx, processor }
}

/**
 * Inject pending messages into the conversation.
 * Persists to store as user messages and emits events for UI.
 */
function injectPendingMessages(
  ctx: StreamContext,
  conversationMessages: ToolChatMessage[],
  emitter: IPCEmitter,
  messages: PendingMessage[],
): void {
  const session = store.getSession(ctx.sessionId)
  const skillsEnabled = ctx.settings.skills?.enableSkills !== false
  const skillsForRefs = skillsEnabled ? getSkillsForSession(session?.workingDirectory) : []

  for (const msg of messages) {
    console.log(`[ToolLoop] Steering: "${msg.content.slice(0, 80)}${msg.content.length > 80 ? '...' : ''}" (source=${msg.source})`)
    const resolvedPromptRefs = resolvePromptReferences(msg.content, { skills: skillsForRefs })

    // Push into LLM conversation as a user message
    conversationMessages.push({ role: 'user', content: resolvedPromptRefs.modelContent })

    // Persist as a user message in the store
    const userMsg: ChatMessage = {
      id: uuidv4(),
      role: 'user',
      content: resolvedPromptRefs.modelContent,
      timestamp: msg.timestamp,
      contentParts: resolvedPromptRefs.contentParts,
    }
    store.addMessage(ctx.sessionId, userMsg)

    // Emit event for UI
    try {
      const eventBus = getEventBus()
      eventBus.emit(ctx.sessionId, {
        type: 'message:user-created',
        message: userMsg,
      }).catch(err => console.error('[ToolLoop] message:user-created emit error:', err))
    } catch {
      // Event system not initialized — ignore
    }
  }
}

/**
 * Core streaming execution function
 * Handles both tool-enabled and simple streaming
 * Tool calls are routed through Tool Agent for execution
 */
export interface StreamGenerationResult {
  pausedForConfirmation: boolean
}

export async function executeStreamGeneration(
  ctx: StreamContext,
  historyMessages: HistoryMessage[],
  sessionName?: string
): Promise<StreamGenerationResult> {
  const processor = createStreamProcessor(ctx)
  const emitter = createEventOnlyEmitter(ctx)
  let activeCtx = ctx
  let activeProcessor = processor
  let activeEmitter = emitter

  try {
    console.log('[Backend] Starting streaming for message:', ctx.assistantMessageId)

    // Emit stream:start event to EventBus (triggers Session auto-vivification)
    try {
      const eventBus = getEventBus()
      eventBus.emit(ctx.sessionId, {
        type: 'stream:start',
        messageId: ctx.assistantMessageId,
        assistantMessageId: ctx.assistantMessageId,
        model: ctx.providerConfig.model,
      }).catch(err => console.error('[ToolLoop] stream:start emit error:', err))
    } catch {
      // Event system not initialized — ignore
    }

    // Get session info
    const session = store.getSession(ctx.sessionId)

    // Get enabled skills based on session's workingDirectory
    const skillsSettings = ctx.settings.skills
    const skillsEnabled = skillsSettings?.enableSkills !== false
    const sessionWorkingDir = session?.workingDirectory
    const sessionWorkingDirRoots = session?.workingDirectoryRoots
    const enabledSkills = skillsEnabled ? getSkillsForSession(sessionWorkingDir) : []

    if (sessionWorkingDir) {
      console.log(`[Chat] Loading skills for session working directory: ${sessionWorkingDir}`)
    }

    // Set init context for async tools (like SkillTool)
    if (ctx.toolSettings?.enableToolCalls) {
      setInitContext({
        skills: enabledSkills.map(s => ({
          id: s.id,
          name: s.name,
          description: s.description,
          source: s.source,
          path: s.path,
          directoryPath: s.directoryPath,
          enabled: s.enabled,
          instructions: s.instructions,
          files: s.files?.map(f => ({ name: f.name, path: f.path, type: f.type as 'markdown' | 'script' | 'template' | 'other' })),
        })),
      })
      await initializeAsyncTools()
    }

    // Get enabled tools
    const allEnabledTools = ctx.toolSettings?.enableToolCalls ? await getEnabledToolsAsync(ctx.toolSettings.tools) : []
    const enabledTools = allEnabledTools.filter(t => !t.id.startsWith('mcp:'))
    const mcpTools = ctx.toolSettings?.enableToolCalls ? getMCPToolsForAI(ctx.toolSettings.tools) : {}

    // Check if the current model supports tools
    const supportsTools = await modelRegistry.modelSupportsTools(ctx.providerConfig.model, ctx.providerId)
    if (!supportsTools) {
      console.log(`[Chat] Model ${ctx.providerConfig.model} does not support tools, skipping tool calls`)
    }

    const codexNativeTools = await getCodexNativeToolsForTurn(ctx, supportsTools)
    const hasTools = supportsTools && (
      enabledTools.length > 0 ||
      Object.keys(mcpTools).length > 0 ||
      codexNativeTools.length > 0
    )

    // Build lightweight user context (low token, high value)
    const userProfile = ctx.settings.general?.userProfile

    // Format lightweight context (~30-50 tokens)
    const contextParts: string[] = []
    if (userProfile?.name) {
      contextParts.push(`User: ${userProfile.name}`)
    }
    if (userProfile?.timezone) {
      contextParts.push(`Timezone: ${userProfile.timezone}`)
    }
    if (userProfile?.language) {
      contextParts.push(`Language: ${userProfile.language}`)
    }
    // Add current time (always useful)
    contextParts.push(`Current time: ${new Date().toLocaleString('zh-CN', { 
      timeZone: userProfile?.timezone || 'Asia/Shanghai',
      dateStyle: 'full',
      timeStyle: 'short'
    })}`)
    if (userProfile?.customInfo) {
      contextParts.push(`Note: ${userProfile.customInfo}`)
    }
    
    const userContextPrompt = contextParts.length > 0 ? contextParts.join('\n') : undefined

    let pausedForConfirmation = false
    const requestStartTime = Date.now()

    // Build tools (can be empty {} for no-tools mode)
    const builtinToolsForAI = hasTools ? convertToolDefinitionsForAI(enabledTools) : {}
    const toolsForAI = hasTools ? { ...builtinToolsForAI, ...mcpTools } : {}

    const projectVars = buildProjectDirsPromptVars(sessionWorkingDir)
    const contextVariables = await buildContextVariablesPromptText(ctx.sessionId)
    const showActiveMemoryLoading = shouldEmitActiveMemoryLoading(ctx)
    const promptContextStartedAt = Date.now()

    if (showActiveMemoryLoading) {
      const timeoutMs = ctx.settings.general?.soulMemory?.activeMemory?.timeoutMs ?? 15000
      console.info(
        `[ActiveMemory] ui loading-memory session=${ctx.sessionId.slice(0, 8)} timeoutMs=${timeoutMs}`,
      )
      emitter.sendContentPart({ type: 'loading-memory' })
    }

    const promptContext = await buildPromptContext({
      previousState: session?.promptContext ?? undefined,
      sessionId: ctx.sessionId,
      agentId: session?.agentId,
      providerId: ctx.providerId,
      providerConfig: ctx.providerConfig as unknown as Record<string, unknown>,
      settings: ctx.settings,
      hasTools,
      skills: enabledSkills,
      workingDirectory: sessionWorkingDir,
      workingDirectoryRoots: sessionWorkingDirRoots,
      contextVariables,
      activeProject: projectVars.active,
      knownProjects: projectVars.known,
      toolNames: [...Object.keys(builtinToolsForAI), ...codexNativeTools],
      mcpToolNames: Object.keys(mcpTools),
      voiceConversation: ctx.voiceConversation,
      speakMode: ctx.speakMode ?? ctx.voiceConversation,
    })

    if (showActiveMemoryLoading) {
      console.info(
        `[ActiveMemory] ui waiting session=${ctx.sessionId.slice(0, 8)} promptContextDurationMs=${Date.now() - promptContextStartedAt}`,
      )
      emitter.sendContentPart({ type: 'waiting' })
    }

    store.updateSessionPromptContext(ctx.sessionId, promptContext.state)
    const requestMessages = buildRequestMessages({
      providerId: ctx.providerId,
      promptContext: promptContext.state,
      emittedFragments: promptContext.emittedFragments,
      historyMessages,
    })
    const { systemPrompt, systemPromptSegments } = requestMessages

    // Log request start with structured format
    // logRequestStart({
    //   provider: ctx.providerId,
    //   model: ctx.providerConfig.model,
    //   systemPromptLength: systemPrompt.length,
    //   systemPrompt,
    //   messages: historyMessages,
    //   tools: toolsForAI,
    //   skills: enabledSkills,
    //   hasTools,
    // })

    const conversationMessages = requestMessages.messages as ToolChatMessage[]

    // Unified stream execution - works for both tools and no-tools modes
    // When toolsForAI is {}, the stream loop naturally exits after first turn
    const result = await runStream(
      ctx,
      conversationMessages,
      systemPrompt,
      toolsForAI,
      codexNativeTools,
      processor,
      enabledSkills,
      ctx.steeringQueue,
      ctx.followUpQueue,
      systemPromptSegments,
      (writer) => {
        activeCtx = writer.ctx
        activeProcessor = writer.processor
        activeEmitter = writer.emitter
      },
    )
    pausedForConfirmation = result.pausedForConfirmation
    const finalCtx = result.ctx || activeCtx
    const finalProcessor = result.processor || activeProcessor

    // Log request end with structured format
    const requestDurationMs = Date.now() - requestStartTime
    const requestDuration = requestDurationMs / 1000
    logRequestEnd(requestDuration, finalCtx.accumulatedUsage, finalCtx.lastTurnUsage)

    // Add duration to usage for speed calculation in UI
    if (finalCtx.accumulatedUsage) {
      finalCtx.accumulatedUsage.durationMs = requestDurationMs
    }

    // Only finalize and run post-processing if not paused for tool confirmation
    if (!pausedForConfirmation) {
      await finalProcessor.finalize()
      const updatedSession = store.getSession(finalCtx.sessionId)
      activeEmitter.sendStreamComplete({
        sessionName: updatedSession?.name || sessionName,
        usage: finalCtx.accumulatedUsage,
        lastTurnUsage: finalCtx.lastTurnUsage,  // For correct context size calculation
      })
      // TODO(Phase 3): Migrate UI_MESSAGE_STREAM to event system — separate protocol for AI SDK 6.x clients
      sendUIMessageFinish(finalCtx.sender, finalCtx.sessionId, finalCtx.assistantMessageId, 'stop', finalCtx.accumulatedUsage)
      // Save usage to message for future token subtraction on edit/regenerate
      if (finalCtx.accumulatedUsage) {
        store.updateMessageUsage(finalCtx.sessionId, finalCtx.assistantMessageId, finalCtx.accumulatedUsage)
        // Update session usage cache (pass lastTurnUsage for correct context size)
        updateSessionUsage(finalCtx.sessionId, finalCtx.accumulatedUsage, finalCtx.lastTurnUsage)
      }
      console.log('[Backend] Streaming complete, total usage:', finalCtx.accumulatedUsage)

      // Run post-response triggers asynchronously
      // Get the last user message from history
      const lastUserMessageObj = historyMessages
        .filter(m => m.role === 'user')
        .pop()

      if (lastUserMessageObj && finalProcessor.accumulatedContent) {
        const lastUserMessageText = getTextFromContent(lastUserMessageObj.content)


        const updatedSessionForTriggers = store.getSession(finalCtx.sessionId)
        if (updatedSessionForTriggers) {
          const triggerContext: TriggerContext = {
            sessionId: finalCtx.sessionId,
            session: updatedSessionForTriggers,
            messages: updatedSessionForTriggers.messages,
            lastUserMessage: lastUserMessageText,
            lastAssistantMessage: finalProcessor.accumulatedContent,
            providerId: finalCtx.providerId,
            providerConfig: finalCtx.providerConfig,
          }

          // Run triggers asynchronously - don't await
          triggerManager.runPostResponse(triggerContext)
            .catch(err => console.error('[Backend] Trigger execution failed:', err))

          runAfterAssistantResponseHooks({
            ...triggerContext,
            assistantMessageId: finalCtx.assistantMessageId,
            settings: finalCtx.settings,
          }).catch(err => console.error('[Backend] Plugin after-response hook failed:', err))
        }
      }
    } else {
      console.log('[Backend] Stream paused for tool confirmation, not sending complete')
    }

    return { pausedForConfirmation }

  } catch (error: any) {
    const isAborted = error.name === 'AbortError' || ctx.abortSignal.aborted

    if (isAborted) {
      console.log('[Backend] Stream aborted by user')
      await activeProcessor.finalize()
      activeEmitter.sendStreamAborted('User cancelled')
    } else {
      console.error('[Backend] Streaming error:', error)

      // Import extractErrorDetails for error handling
      const { extractErrorDetails } = await import('./provider-helpers.js')

      // Keep the assistant message with any content already generated
      // Just mark it with error details instead of deleting
      await activeProcessor.finalize()

      const errorDetailsStr = extractErrorDetails(error) ?? ''
      const errorContent = error.message || 'Streaming error'
      const providerInputTokens = parseProviderInputTokens(`${errorContent}\n${errorDetailsStr}`)
      if (providerInputTokens) {
        activeEmitter.sendContextSizeUpdate(providerInputTokens)
      }

      // Update the assistant message with error details
      store.updateMessageError(activeCtx.sessionId, activeCtx.assistantMessageId, errorDetailsStr)

      // Send error event to frontend (message is preserved, error is added)
      activeEmitter.sendStreamError({
        error: errorContent,
        errorDetails: errorDetailsStr,
        preserved: true,  // Flag to indicate message content is preserved
      })

      // Also send stream complete to properly finalize the UI state
      activeEmitter.sendStreamComplete({
        sessionName: store.getSession(activeCtx.sessionId)?.name,
        error: errorContent,
      })
    }

    // On error, stream is not paused - it's terminated
    return { pausedForConfirmation: false }
  }
}

function parseProviderInputTokens(text: string): number | null {
  const match = text.match(/requested\s+\d+\s+tokens\s+\((\d+)\s+in the messages/i)
  if (!match) return null
  const value = Number(match[1])
  return Number.isFinite(value) && value > 0 ? value : null
}
