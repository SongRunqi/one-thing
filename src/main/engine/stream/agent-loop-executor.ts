import * as store from '../../store.js'
import { v4 as uuidv4 } from 'uuid'
import { IPC_CHANNELS, type ContentPart, type ToolCall, type ToolPartialResult, type ToolResult } from '../../../shared/ipc.js'
import { getEventBus } from '../../events/index.js'
import { createEventOnlyEmitter } from '../../events/event-only-emitter.js'
import {
  isAgentLoopPauseForConfirmationError,
  streamAgentLoopProviderChunks,
  type AgentProviderData,
  type AgentProviderStreamChunk,
  type AgentToolResult,
} from '../../agent-loop/index.js'
import type { HistoryMessage } from './message-helpers.js'
import { getTextFromContent } from './message-helpers.js'
import type { StreamContext, StreamProcessor } from './stream-processor.js'
import { createStreamProcessor } from './stream-processor.js'
import type { IPCEmitter } from './ipc-emitter.js'
import {
  buildAgentLoopRuntimeFromStreamContext,
  type BuildAgentLoopStreamRuntimeResult,
} from './agent-loop-runtime.js'
import { sendUIMessageFinish } from './stream-helpers.js'
import { updateSessionUsage } from '../../ipc/sessions.js'
import { saveMediaImage } from '../../ipc/media.js'
import { triggerManager, type TriggerContext } from '../triggers/index.js'
import { runAfterAssistantResponseHooks } from '../../plugins/lifecycle.js'
import type { ChatMessage } from '../../../shared/ipc.js'

export { shouldUseAgentLoopStream } from './agent-loop-selection.js'

export interface AgentLoopExecutorTurnState {
  toolCalls: ToolCall[]
  content: { value: string }
  reasoning: { value: string }
  orderedParts: ContentPart[]
  hasSentToolParts: boolean
}

export interface AgentLoopExecutorState {
  ctx: StreamContext
  processor: StreamProcessor
  emitter: IPCEmitter
  turnIndex: number
  turn: AgentLoopExecutorTurnState
  stepIdsByToolCallId: Map<string, string>
  accumulatedUsage?: { inputTokens: number; outputTokens: number; totalTokens: number; durationMs?: number }
  lastTurnUsage?: { inputTokens: number; outputTokens: number }
  toolIterations: number
  skillManageCalled: boolean
  latestUserPrompt?: string
  createNewAssistantOnNextTurnStart?: boolean
}

export interface AgentLoopStreamGenerationResult {
  pausedForConfirmation: boolean
}

export interface ExecuteAgentLoopStreamGenerationOptions {
  initialContent?: {
    content?: string
    reasoning?: string
  }
}

function createTurnState(): AgentLoopExecutorTurnState {
  return {
    toolCalls: [],
    content: { value: '' },
    reasoning: { value: '' },
    orderedParts: [],
    hasSentToolParts: false,
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

function resultText(result: AgentToolResult): string {
  if (result.error) return result.error
  if (result.content) return result.content
  if (result.data == null) return ''
  if (typeof result.data === 'string') return result.data
  try {
    return JSON.stringify(result.data)
  } catch {
    return String(result.data)
  }
}

function structuredToolResult(result: AgentToolResult): ToolResult {
  return {
    content: [{ type: 'text', text: resultText(result) }],
    details: result.data && typeof result.data === 'object'
      ? result.data as Record<string, unknown>
      : undefined,
  }
}

function textFromPartialResult(update: unknown): string {
  if (!update || typeof update !== 'object') return String(update ?? '')
  const content = (update as { content?: Array<{ type?: string; text?: string }> }).content
  if (Array.isArray(content)) {
    const text = content
      .filter(part => part.type === 'text' && typeof part.text === 'string')
      .map(part => part.text)
      .join('')
    if (text) return text
  }
  try {
    return JSON.stringify(update)
  } catch {
    return String(update)
  }
}

function changesFromMetadata(metadata: Record<string, unknown> | undefined): ToolCall['changes'] | undefined {
  if (!metadata?.diff || !metadata.path) return undefined
  return {
    diff: String(metadata.diff),
    filePath: String(metadata.path),
    additions: Number(metadata.additions) || 0,
    deletions: Number(metadata.deletions) || 0,
    originalContent: typeof metadata.originalContent === 'string' ? metadata.originalContent : undefined,
    originalContentHash: typeof metadata.originalContentHash === 'string' ? metadata.originalContentHash : undefined,
    afterContentHash: typeof metadata.afterContentHash === 'string' ? metadata.afterContentHash : undefined,
    auditId: typeof metadata.auditId === 'string' ? metadata.auditId : undefined,
    auditPath: typeof metadata.auditPath === 'string' ? metadata.auditPath : undefined,
  }
}

function sendToolContentPartsOnce(state: AgentLoopExecutorState): void {
  if (state.turn.hasSentToolParts) return
  state.turn.hasSentToolParts = true

  for (const part of state.turn.orderedParts) {
    if (part.type === 'provider-data') continue
    state.emitter.sendContentPart(part)
  }
  state.emitter.sendContentPart({ type: 'data-steps', turnIndex: state.turnIndex })
}

function persistTurnContentParts(state: AgentLoopExecutorState): void {
  for (const part of state.turn.orderedParts) {
    store.addMessageContentPart(state.ctx.sessionId, state.ctx.assistantMessageId, part)
    if (state.turn.toolCalls.length === 0 && part.type !== 'provider-data') {
      state.emitter.sendContentPart(part)
    }
  }

  if (state.turn.toolCalls.length > 0) {
    store.addMessageContentPart(state.ctx.sessionId, state.ctx.assistantMessageId, {
      type: 'data-steps',
      turnIndex: state.turnIndex,
    })
  }
}

function rememberStepId(state: AgentLoopExecutorState, toolCallId: string): string | undefined {
  const stepId = state.processor.getStepIdForToolCall(toolCallId)
  if (stepId) state.stepIdsByToolCallId.set(toolCallId, stepId)
  return stepId
}

function markToolExecutionStarted(
  state: AgentLoopExecutorState,
  toolCall: ToolCall,
  stepId: string | undefined,
): void {
  toolCall.status = 'executing'
  toolCall.startTime = toolCall.startTime ?? Date.now()
  store.updateMessageToolCalls(state.ctx.sessionId, state.ctx.assistantMessageId, state.processor.toolCalls)
  state.emitter.sendToolCall(toolCall)

  if (stepId) {
    state.emitter.sendToolExecutionStart(toolCall.id, stepId, toolCall.toolId, toolCall.arguments)
    state.emitter.sendStepUpdated(stepId, {
      status: 'running',
      toolCall: { ...toolCall },
    })
  }
}

function handleToolInputEnd(state: AgentLoopExecutorState, toolCallId: string): void {
  const stepId = rememberStepId(state, toolCallId)
  const toolCall = state.processor.handleToolInputEnd(toolCallId)
  if (!toolCall) return

  if (!state.turn.toolCalls.some(existing => existing.id === toolCall.id)) {
    state.turn.toolCalls.push(toolCall)
  }
  markToolExecutionStarted(state, toolCall, stepId)
}

function handleToolCallFallback(
  state: AgentLoopExecutorState,
  toolCall: NonNullable<Extract<AgentProviderStreamChunk, { type: 'tool-call' }>['toolCall']>,
): void {
  if (!state.processor.toolCalls.some(existing => existing.id === toolCall.toolCallId)) {
    state.processor.handleToolInputStart(toolCall.toolCallId, toolCall.toolName, state.turnIndex)
    rememberStepId(state, toolCall.toolCallId)
  }
  const created = state.processor.handleToolCallChunk({
    toolCallId: toolCall.toolCallId,
    toolName: toolCall.toolName,
    args: toolCall.args,
  })
  if (!state.turn.toolCalls.some(existing => existing.id === created.id)) {
    state.turn.toolCalls.push(created)
  }
  markToolExecutionStarted(state, created, state.stepIdsByToolCallId.get(created.id))
}

function settleToolResult(
  state: AgentLoopExecutorState,
  toolCallId: string,
  result: AgentToolResult,
): void {
  const toolCall = state.processor.toolCalls.find(existing => existing.id === toolCallId)
  if (!toolCall) return

  const executionData = result.data && typeof result.data === 'object'
    ? result.data as { rejected?: boolean; rejectionReason?: string; aborted?: boolean }
    : {}
  const commandType = result.commandType
    ?? (result.data && typeof result.data === 'object' ? (result.data as { commandType?: ToolCall['commandType'] }).commandType : undefined)
  toolCall.endTime = Date.now()
  if (result.requiresConfirmation) {
    toolCall.status = 'pending'
    toolCall.requiresConfirmation = true
    toolCall.commandType = commandType
    toolCall.error = result.error
    state.toolIterations += 1
    if (toolCall.toolId === 'skill_manage' || toolCall.toolName === 'skill_manage') {
      state.skillManageCalled = true
    }

    store.updateMessageToolCalls(state.ctx.sessionId, state.ctx.assistantMessageId, state.processor.toolCalls)
    state.emitter.sendToolResult(toolCall)

    const stepId = state.stepIdsByToolCallId.get(toolCallId)
    if (stepId) {
      state.emitter.sendStepUpdated(stepId, {
        status: 'awaiting-confirmation',
        toolCall: { ...toolCall },
        error: result.error,
      })
    }
    return
  }

  toolCall.status = result.error
    ? executionData.aborted ? 'cancelled' : 'failed'
    : 'completed'
  toolCall.result = result.data ?? result.content
  toolCall.error = result.error
  toolCall.rejected = executionData.rejected || undefined
  toolCall.rejectionReason = executionData.rejectionReason
  toolCall.requiresConfirmation = false
  state.toolIterations += 1
  if (toolCall.toolId === 'skill_manage' || toolCall.toolName === 'skill_manage') {
    state.skillManageCalled = true
  }

  store.updateMessageToolCalls(state.ctx.sessionId, state.ctx.assistantMessageId, state.processor.toolCalls)
  state.emitter.sendToolResult(toolCall)

  const stepId = state.stepIdsByToolCallId.get(toolCallId)
  if (!stepId) return

  const structured = structuredToolResult(result)
  state.emitter.sendToolExecutionEnd(
    toolCall.id,
    stepId,
    result.error ? undefined : structured,
    Boolean(result.error),
    result.error,
  )
  state.emitter.sendStepUpdated(stepId, {
    status: toolCall.status === 'completed' ? 'completed' : toolCall.status,
    toolCall: { ...toolCall },
    partialResult: result.error ? undefined : structured,
    partialResultIsPartial: false,
    result: resultText(result),
    error: result.error,
    rejected: toolCall.rejected,
    rejectionReason: toolCall.rejectionReason,
  })
}

function applyToolMetadata(
  state: AgentLoopExecutorState,
  toolCallId: string,
  update: NonNullable<Extract<AgentProviderStreamChunk, { type: 'tool-metadata' }>['toolMetadata']>['update'],
): void {
  const stepId = state.stepIdsByToolCallId.get(toolCallId)
  if (!stepId) return

  const toolCall = state.processor.toolCalls.find(existing => existing.id === toolCallId)
  const metadataUpdates: Record<string, unknown> = {}
  if (update.title && typeof update.title === 'string') {
    metadataUpdates.title = update.title
  }
  if (update.metadata) {
    if (typeof update.metadata.output === 'string') {
      metadataUpdates.result = update.metadata.output
    } else if (Object.keys(update.metadata).length > 0) {
      metadataUpdates.result = JSON.stringify(update.metadata)
    }

    const changes = changesFromMetadata(update.metadata)
    if (changes && toolCall) {
      toolCall.changes = changes
      metadataUpdates.toolCall = { ...toolCall }
    }
  }

  if (Object.keys(metadataUpdates).length > 0) {
    state.emitter.sendStepUpdated(stepId, metadataUpdates)
  }
}

function applyToolPartialResult(
  state: AgentLoopExecutorState,
  toolCallId: string,
  update: NonNullable<Extract<AgentProviderStreamChunk, { type: 'tool-partial-result' }>['toolPartialResult']>['update'],
): void {
  const stepId = state.stepIdsByToolCallId.get(toolCallId)
  if (!stepId) return

  const partialResult = update as ToolPartialResult
  state.emitter.sendToolExecutionUpdate(toolCallId, stepId, partialResult)
  state.emitter.sendStepUpdated(stepId, {
    status: 'running',
    partialResult,
    partialResultIsPartial: true,
    result: textFromPartialResult(update),
  })
}

async function finishCurrentAssistantWriter(state: AgentLoopExecutorState): Promise<void> {
  await state.processor.finalize()
  try {
    await getEventBus().emit(state.ctx.sessionId, {
      type: 'message:updated',
      messageId: state.ctx.assistantMessageId,
      updates: { isStreaming: false },
    })
  } catch {
    // Event system may not be initialized in tests.
  }
}

async function createNextAssistantWriter(state: AgentLoopExecutorState): Promise<void> {
  await finishCurrentAssistantWriter(state)

  const assistantMessageId = uuidv4()
  const assistantMessage: ChatMessage = {
    id: assistantMessageId,
    role: 'assistant',
    model: state.ctx.providerConfig.model,
    provider: state.ctx.providerId,
    content: '',
    timestamp: Date.now(),
    isStreaming: true,
    thinkingStartTime: Date.now(),
    toolCalls: [],
    contentParts: [],
  }

  store.addMessage(state.ctx.sessionId, assistantMessage)
  state.ctx.assistantMessageId = assistantMessageId
  state.processor = createStreamProcessor(state.ctx)
  state.emitter = createEventOnlyEmitter(state.ctx)
  state.turn = createTurnState()
  state.stepIdsByToolCallId.clear()

  try {
    const eventBus = getEventBus()
    await eventBus.emit(state.ctx.sessionId, {
      type: 'message:assistant-created',
      message: assistantMessage,
    })
    await eventBus.emit(state.ctx.sessionId, {
      type: 'stream:start',
      messageId: assistantMessageId,
      assistantMessageId,
      model: state.ctx.providerConfig.model,
    })
  } catch {
    // Event system may not be initialized in tests.
  }
}

function buildGeneratedImageMarkdown(mediaId: string, revisedPrompt?: string): string {
  const imageUrl = `media://${mediaId}.png`
  const promptText = revisedPrompt?.trim()
  return `${promptText ? `**Revised prompt:** ${promptText}\n\n` : ''}![Generated Image|mediaId:${mediaId}](${imageUrl})`
}

async function applyProviderData(
  state: AgentLoopExecutorState,
  providerData: AgentProviderData,
): Promise<void> {
  if (providerData.provider !== 'codex') return

  if (providerData.type === 'encrypted-reasoning') {
    appendOrderedPart(state.turn.orderedParts, {
      type: 'provider-data',
      provider: 'codex',
      encryptedReasoning: providerData.encryptedContent,
      turnIndex: state.turnIndex,
    })
    return
  }

  if (providerData.type === 'image-generation-start') {
    state.emitter.sendContentPart({
      type: 'image-loading',
      turnIndex: state.turnIndex,
      label: 'Generating image',
    })
    return
  }

  const mediaItem = await saveMediaImage({
    base64: providerData.result,
    prompt: state.latestUserPrompt?.trim() || 'Codex image generation',
    revisedPrompt: providerData.revisedPrompt,
    model: state.ctx.providerConfig.model,
    sessionId: state.ctx.sessionId,
    messageId: state.ctx.assistantMessageId,
  })

  const markdown = buildGeneratedImageMarkdown(mediaItem.id, providerData.revisedPrompt)
  const prefix = state.turn.content.value && !state.turn.content.value.endsWith('\n') ? '\n\n' : ''
  const displayContent = state.processor.handleTextChunk(`${prefix}${markdown}`, state.turn.content, state.turnIndex)
  if (displayContent) {
    appendOrderedPart(state.turn.orderedParts, {
      type: 'text',
      content: displayContent,
      turnIndex: state.turnIndex,
    })
  }

  if (!state.ctx.sender.isDestroyed()) {
    state.ctx.sender.send(IPC_CHANNELS.IMAGE_GENERATED, {
      id: mediaItem.id,
      mediaId: mediaItem.id,
      filePath: mediaItem.filePath,
      prompt: mediaItem.prompt,
      revisedPrompt: mediaItem.revisedPrompt,
      model: mediaItem.model,
      sessionId: state.ctx.sessionId,
      messageId: state.ctx.assistantMessageId,
      createdAt: mediaItem.createdAt,
    })
  }
}

function enabledToolNames(prepared: Extract<BuildAgentLoopStreamRuntimeResult, { supported: true }>): string[] {
  return [
    ...prepared.toolNames,
    ...prepared.mcpToolNames,
  ]
}

function lastUserMessageText(historyMessages: HistoryMessage[]): string {
  for (let index = historyMessages.length - 1; index >= 0; index--) {
    const message = historyMessages[index]
    if (message.role !== 'user') continue
    return getTextFromContent(message.content)
  }
  return ''
}

export function runAgentLoopPostResponseHooks(options: {
  state: AgentLoopExecutorState
  prepared: Extract<BuildAgentLoopStreamRuntimeResult, { supported: true }>
  historyMessages: HistoryMessage[]
}): void {
  const updatedSession = store.getSession(options.state.ctx.sessionId)
  const lastAssistantMessage = options.state.processor.accumulatedContent
  if (!updatedSession || !lastAssistantMessage) return

  const triggerContext: TriggerContext = {
    sessionId: options.state.ctx.sessionId,
    session: updatedSession,
    messages: updatedSession.messages,
    lastUserMessage: lastUserMessageText(options.historyMessages),
    lastAssistantMessage,
    providerId: options.state.ctx.providerId,
    providerConfig: options.state.ctx.providerConfig,
    settings: options.state.ctx.settings,
    toolIterations: options.state.toolIterations,
    skillManageCalled: options.state.skillManageCalled,
    enabledToolNames: enabledToolNames(options.prepared),
  }

  triggerManager.runPostResponse(triggerContext)
    .catch(err => console.error('[AgentLoopExecutor] Trigger execution failed:', err))

  runAfterAssistantResponseHooks({
    ...triggerContext,
    assistantMessageId: options.state.ctx.assistantMessageId,
  }).catch(err => console.error('[AgentLoopExecutor] Plugin after-response hook failed:', err))
}

export async function completeAgentLoopStream(
  state: AgentLoopExecutorState,
  sessionName?: string,
): Promise<void> {
  await state.processor.finalize()
  const updatedSession = store.getSession(state.ctx.sessionId)
  state.emitter.sendStreamComplete({
    sessionName: updatedSession?.name || sessionName,
    usage: state.accumulatedUsage,
    lastTurnUsage: state.lastTurnUsage,
  })
  sendUIMessageFinish(state.ctx.sender, state.ctx.sessionId, state.ctx.assistantMessageId, 'stop', state.accumulatedUsage)
}

export async function applyAgentLoopStreamChunk(
  state: AgentLoopExecutorState,
  chunk: AgentProviderStreamChunk,
): Promise<void> {
  if (chunk.type === 'turn-start' && chunk.turnStart) {
    state.turnIndex = chunk.turnStart.turn
    if (chunk.turnStart.turn > 1 && state.createNewAssistantOnNextTurnStart) {
      state.createNewAssistantOnNextTurnStart = false
      await createNextAssistantWriter(state)
      state.turnIndex = chunk.turnStart.turn
    }
    return
  }

  if (chunk.type === 'text' && chunk.text) {
    const displayContent = state.processor.handleTextChunk(chunk.text, state.turn.content, state.turnIndex)
    if (displayContent) {
      appendOrderedPart(state.turn.orderedParts, {
        type: 'text',
        content: displayContent,
        turnIndex: state.turnIndex,
      })
    }
    return
  }

  if (chunk.type === 'reasoning' && chunk.reasoning) {
    const hasVisibleTurnActivity =
      state.turn.content.value.length > 0 ||
      state.turn.toolCalls.length > 0 ||
      state.turn.hasSentToolParts ||
      state.turn.orderedParts.some(part => part.type !== 'provider-data')
    const placement =
      state.turnIndex === 1 &&
      state.processor.accumulatedContent.length === 0 &&
      !hasVisibleTurnActivity
        ? 'top'
        : 'inline'
    state.processor.handleReasoningChunk(chunk.reasoning, state.turn.reasoning, state.turnIndex, placement)
    if (placement === 'inline') {
      appendOrderedPart(state.turn.orderedParts, {
        type: 'reasoning',
        content: chunk.reasoning,
        turnIndex: state.turnIndex,
      })
    }
    return
  }

  if (chunk.type === 'tool-input-start' && chunk.toolInputStart) {
    sendToolContentPartsOnce(state)
    state.processor.handleToolInputStart(
      chunk.toolInputStart.toolCallId,
      chunk.toolInputStart.toolName,
      state.turnIndex,
    )
    rememberStepId(state, chunk.toolInputStart.toolCallId)
    return
  }

  if (chunk.type === 'tool-input-delta' && chunk.toolInputDelta) {
    state.processor.handleToolInputDelta(
      chunk.toolInputDelta.toolCallId,
      chunk.toolInputDelta.argsTextDelta,
    )
    return
  }

  if (chunk.type === 'tool-input-end' && chunk.toolInputEnd) {
    handleToolInputEnd(state, chunk.toolInputEnd.toolCallId)
    return
  }

  if (chunk.type === 'tool-call' && chunk.toolCall) {
    sendToolContentPartsOnce(state)
    handleToolCallFallback(state, chunk.toolCall)
    return
  }

  if (chunk.type === 'tool-result' && chunk.toolResult) {
    settleToolResult(state, chunk.toolResult.toolCallId, chunk.toolResult.result)
    return
  }

  if (chunk.type === 'tool-metadata' && chunk.toolMetadata) {
    applyToolMetadata(state, chunk.toolMetadata.toolCallId, chunk.toolMetadata.update)
    return
  }

  if (chunk.type === 'tool-partial-result' && chunk.toolPartialResult) {
    applyToolPartialResult(state, chunk.toolPartialResult.toolCallId, chunk.toolPartialResult.update)
    return
  }

  if (chunk.type === 'provider-data' && chunk.providerData) {
    await applyProviderData(state, chunk.providerData)
    return
  }

  if (chunk.type === 'finish') {
    if (chunk.usage) {
      state.accumulatedUsage = state.accumulatedUsage ?? { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
      state.accumulatedUsage.inputTokens += chunk.usage.inputTokens
      state.accumulatedUsage.outputTokens += chunk.usage.outputTokens
      state.accumulatedUsage.totalTokens += chunk.usage.totalTokens
      state.lastTurnUsage = chunk.usage
      state.ctx.accumulatedUsage = state.accumulatedUsage
      state.ctx.lastTurnUsage = chunk.usage
      state.emitter.sendContextSizeUpdate(chunk.usage.inputTokens)
    }

    persistTurnContentParts(state)
    if (chunk.finishReason === 'tool-calls') {
      state.createNewAssistantOnNextTurnStart = false
      state.turnIndex += 1
      state.turn = createTurnState()
      state.emitter.sendContinuation(state.turnIndex)
    } else {
      state.createNewAssistantOnNextTurnStart = true
    }
  }
}

export async function executeAgentLoopStreamGeneration(
  ctx: StreamContext,
  historyMessages: HistoryMessage[],
  sessionName?: string,
  options: ExecuteAgentLoopStreamGenerationOptions = {},
): Promise<AgentLoopStreamGenerationResult> {
  const processor = createStreamProcessor(ctx, options.initialContent)
  const emitter = createEventOnlyEmitter(ctx)
  const requestStartTime = Date.now()
  const state: AgentLoopExecutorState = {
    ctx,
    processor,
    emitter,
    turnIndex: 1,
    turn: createTurnState(),
    stepIdsByToolCallId: new Map(),
    toolIterations: 0,
    skillManageCalled: false,
    latestUserPrompt: lastUserMessageText(historyMessages),
  }

  try {
    const prepared = await buildAgentLoopRuntimeFromStreamContext(ctx, historyMessages, { emitter })
    if (!prepared.supported) {
      throw new Error(prepared.reason)
    }

    try {
      await getEventBus().emit(ctx.sessionId, {
        type: 'stream:start',
        messageId: ctx.assistantMessageId,
        assistantMessageId: ctx.assistantMessageId,
        model: ctx.providerConfig.model,
      })
    } catch {
      // Event system not initialized.
    }

    for await (const chunk of streamAgentLoopProviderChunks(prepared.runtime)) {
      await applyAgentLoopStreamChunk(state, chunk)
    }

    const durationMs = Date.now() - requestStartTime
    if (state.accumulatedUsage) {
      state.accumulatedUsage.durationMs = durationMs
      store.updateMessageUsage(ctx.sessionId, ctx.assistantMessageId, state.accumulatedUsage)
      updateSessionUsage(ctx.sessionId, state.accumulatedUsage, state.lastTurnUsage)
    }

    await completeAgentLoopStream(state, sessionName)
    runAgentLoopPostResponseHooks({
      state,
      prepared,
      historyMessages,
    })
    return { pausedForConfirmation: false }
  } catch (error: any) {
    if (isAgentLoopPauseForConfirmationError(error)) {
      return { pausedForConfirmation: true }
    }

    const isAborted = error.name === 'AbortError' || ctx.abortSignal.aborted
    await state.processor.finalize()

    if (isAborted) {
      state.emitter.sendStreamAborted('User cancelled')
      return { pausedForConfirmation: false }
    }

    const errorContent = error.message || 'Agent loop streaming error'
    store.updateMessageError(state.ctx.sessionId, state.ctx.assistantMessageId, errorContent)
    state.emitter.sendStreamError({
      error: errorContent,
      preserved: true,
    })
    state.emitter.sendStreamComplete({
      sessionName: store.getSession(state.ctx.sessionId)?.name,
      error: errorContent,
    })
    return { pausedForConfirmation: false }
  }
}
