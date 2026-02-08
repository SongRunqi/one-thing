/**
 * Tool Loop Module
 * Handles tool loop execution and streaming generation
 */

import {
  getSession,
  addMessageContentPart,
  updateStepsUsageByTurn,
  updateMessageContent,
  updateMessageUsage,
  updateMessageError,
} from '../../stores/sessions.js'
import { getWorkspace } from '../../stores/workspaces.js'
import { IPC_CHANNELS } from '../../../shared/ipc.js'
import type { SkillDefinition, ToolCall, ChatMessage } from '../../../shared/ipc.js'
import { hookManager } from '../../plugins/hooks/index.js'
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
import { getSkillsForSession } from '../skills.js'
import { updateSessionUsage } from '../sessions.js'
import { getStorage } from '../../storage/index.js'
import { getCustomAgentById } from '../../services/custom-agent/index.js'
import { triggerManager, type TriggerContext } from '../../services/triggers/index.js'
import * as modelRegistry from '../../services/ai/model-registry.js'
import { shouldCompact, executeCompacting, type CompactingContext } from '../../services/ai/context-compacting.js'

import type { StreamContext, StreamProcessor } from './stream-processor.js'
import { createStreamProcessor } from './stream-processor.js'
import { createIPCEmitter, type IPCEmitter } from './ipc-emitter.js'
import { sendUITextDelta } from './stream-helpers.js'
import { formatMessagesForLog, buildSystemPrompt, buildHistoryMessages, type HistoryMessage } from './message-helpers.js'
import {
  getTextFromContent,
  textRecordAgentInteraction,
} from './memory-helpers.js'
import { getProviderApiType } from './provider-helpers.js'
import { classifyError } from '../../../shared/errors.js'
import { executeToolAndUpdate } from './tool-execution.js'
import { logRequestStart, logRequestEnd, logTurnStart, logTurnEnd, logContinuationMessages } from './chat-logger.js'

/**
 * Stream result indicating why the stream ended
 */
export interface StreamResult {
  pausedForConfirmation: boolean  // Stream paused waiting for tool confirmation
}

/**
 * State for a single turn in the tool loop
 */
interface TurnState {
  toolCalls: ToolCall[]
  content: { value: string }
  reasoning: { value: string }
  finishReason: string
  usage?: { inputTokens: number; outputTokens: number; totalTokens: number }
}

/**
 * Create initial state for a new turn
 */
function createTurnState(): TurnState {
  return {
    toolCalls: [],
    content: { value: '' },
    reasoning: { value: '' },
    finishReason: 'unknown',
    usage: undefined,
  }
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
  if (turnState.content.value) {
    addMessageContentPart(ctx.sessionId, ctx.assistantMessageId, {
      type: 'text',
      content: turnState.content.value,
    })
    // Note: UIMessage stream handles text content delivery, no legacy IPC needed
  }

  if (turnState.toolCalls.length > 0) {
    addMessageContentPart(ctx.sessionId, ctx.assistantMessageId, {
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
  } = {
    role: 'assistant' as const,
    content: turnState.content.value,
    toolCalls: turnState.toolCalls.map(tc => ({
      toolCallId: tc.id,
      toolName: tc.toolName,
      args: tc.arguments,
    })),
  }
  if (turnState.reasoning.value) {
    assistantMsg.reasoningContent = turnState.reasoning.value
  }
  conversationMessages.push(assistantMsg)

  const toolResultMsg = {
    role: 'tool' as const,
    content: turnState.toolCalls.map(tc => ({
      type: 'tool-result' as const,
      toolCallId: tc.id,
      toolName: tc.toolName,
      result: tc.status === 'completed' ? tc.result : { error: tc.error },
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
 * Check and trigger context compacting if threshold is reached
 * Returns true if compacting was performed
 */
async function checkAndTriggerCompacting(
  ctx: StreamContext,
  emitter: IPCEmitter,
  inputTokens: number,
  modelContextLength: number
): Promise<boolean> {
  // Skip if context length is unknown or too small
  if (modelContextLength <= 0) {
    return false
  }

  // Check if we should compact
  if (!shouldCompact(inputTokens, modelContextLength)) {
    return false
  }

  console.log(`[ToolLoop] Context usage ${((inputTokens / modelContextLength) * 100).toFixed(1)}% reached threshold, triggering compacting`)

  return await performCompacting(ctx, emitter)
}

/**
 * Execute compacting and notify frontend
 * Returns true if compacting was successful
 */
async function performCompacting(
  ctx: StreamContext,
  emitter: IPCEmitter
): Promise<boolean> {
  // Notify frontend that compacting started
  emitter.sendCompactStarted()

  try {
    // Get session and its messages for compacting
    const session = getSession(ctx.sessionId)
    if (!session) {
      console.warn('[ToolLoop] Session not found for compacting:', ctx.sessionId)
      emitter.sendCompactCompleted({ success: false, error: 'Session not found' })
      return false
    }
    const messages = session.messages as ChatMessage[]

    // Build compacting context
    const compactingCtx: CompactingContext = {
      sessionId: ctx.sessionId,
      messages,
      providerId: ctx.providerId,
      providerConfig: {
        apiKey: ctx.providerConfig.apiKey ?? '',
        baseUrl: ctx.providerConfig.baseUrl,
        model: ctx.providerConfig.model ?? '',
      },
    }

    // Execute compacting
    const result = await executeCompacting(compactingCtx)

    // Notify frontend with summary
    emitter.sendCompactCompleted({ success: result.success, error: result.error, summary: result.summary })

    if (result.success) {
      console.log('[ToolLoop] Context compacting completed successfully')
      return true
    } else {
      console.warn('[ToolLoop] Context compacting failed:', result.error)
      return false
    }
  } catch (error) {
    console.error('[ToolLoop] Context compacting error:', error)
    emitter.sendCompactCompleted({ success: false, error: String(error) })
    return false
  }
}

/**
 * Rebuild conversation messages after compacting
 */
function rebuildConversationMessages(
  ctx: StreamContext,
  systemPrompt: string,
  conversationMessages: ToolChatMessage[]
): void {
  const updatedSession = getSession(ctx.sessionId)
  if (updatedSession) {
    const compactedHistory = buildHistoryMessages(
      updatedSession.messages as ChatMessage[],
      {
        id: updatedSession.id,
        summary: updatedSession.summary,
        summaryUpToMessageId: updatedSession.summaryUpToMessageId,
      }
    )

    // Clear and rebuild conversationMessages
    conversationMessages.length = 0
    conversationMessages.push({ role: 'system', content: systemPrompt })
    conversationMessages.push(...compactedHistory)

    console.log(`[ToolLoop] Rebuilt conversation with ${compactedHistory.length} messages after compacting`)
  }
}

/**
 * Check if an error is a "prompt too long" error
 */
function isPromptTooLongError(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase()
    return msg.includes('prompt is too long') ||
           msg.includes('context_length_exceeded') ||
           msg.includes('maximum context length') ||
           msg.includes('too many tokens') ||
           msg.includes('request too large')
  }
  return false
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
  systemPrompt: string,  // System prompt for rebuilding after compacting
  toolsForAI: Record<string, any>,  // Can be {} for no-tools mode
  processor: StreamProcessor,
  enabledSkills: SkillDefinition[]
): Promise<StreamResult> {
  const MAX_TOOL_TURNS = 100
  let currentTurn = 0
  const apiType = getProviderApiType(ctx.settings, ctx.providerId)
  const emitter = createIPCEmitter(ctx)

  // Get model context length for compacting check
  let modelContextLength = 128000  // Default fallback
  try {
    const modelInfo = await modelRegistry.getModelById(ctx.providerConfig.model)
    if (modelInfo?.context_length) {
      modelContextLength = modelInfo.context_length
    }
  } catch (error) {
    console.warn('[ToolLoop] Failed to get model context length:', error)
  }

  while (currentTurn < MAX_TOOL_TURNS) {
    currentTurn++
    const turn = createTurnState()

    logTurnStart(currentTurn)

    // ============================================================
    // Checkpoint 1: Pre-request compacting check
    // Check session.contextSize before sending API request
    // ============================================================
    const session = getSession(ctx.sessionId)
    if (session?.contextSize && shouldCompact(session.contextSize, modelContextLength)) {
      console.log(`[ToolLoop] Pre-request compacting: contextSize=${session.contextSize}, threshold=${Math.floor(modelContextLength * 0.85)}`)
      const compacted = await performCompacting(ctx, emitter)
      if (compacted) {
        rebuildConversationMessages(ctx, systemPrompt, conversationMessages)
      }
    }

    // Note: continuation indicators are handled by UIMessage stream parts

    // Get model's actual max output tokens and cap user setting
    // This prevents errors when switching between models with different output limits
    const modelMaxOutputTokens = await modelRegistry.getModelMaxOutputTokens(ctx.providerConfig.model)
    const userMaxTokens = ctx.settings.chat?.maxTokens || 4096
    let effectiveMaxTokens = Math.min(userMaxTokens, modelMaxOutputTokens)

    // Get temperature and other params with plugin hook support
    let temperature = ctx.settings.ai.temperature
    let model = ctx.providerConfig.model

    // Execute params:pre hooks (can modify model, temperature, maxTokens)
    if (hookManager.hasHooks('params:pre')) {
      const paramsResult = await hookManager.executeChain('params:pre', {
        providerId: ctx.providerId,
        model,
        temperature,
        maxTokens: effectiveMaxTokens,
        topP: (ctx.settings.ai as unknown as Record<string, unknown>).topP as number | undefined,
      })

      // Apply modifications from plugin
      const paramsValue = paramsResult.value as { model?: string; temperature?: number; maxTokens?: number }
      if (paramsValue) {
        model = paramsValue.model ?? model
        temperature = paramsValue.temperature ?? temperature
        effectiveMaxTokens = paramsValue.maxTokens ?? effectiveMaxTokens
      }
    }

    // ============================================================
    // Checkpoint 3: Error recovery wrapper
    // Catch "prompt too long" errors and retry after compacting
    // ============================================================
    let stream: AsyncIterable<any>
    try {
      stream = streamChatResponseWithTools(
        ctx.providerId,
        {
          apiKey: ctx.providerConfig.apiKey ?? '',
          baseUrl: ctx.providerConfig.baseUrl,
          model,
          apiType,
        },
        conversationMessages,
        toolsForAI,
        {
          temperature,
          maxTokens: effectiveMaxTokens,
          abortSignal: ctx.abortSignal,
        }
      )
    } catch (error) {
      // Check if error is "prompt too long" and attempt recovery
      if (isPromptTooLongError(error)) {
        console.log('[ToolLoop] Prompt too long error on stream creation, attempting compacting recovery')
        const compacted = await performCompacting(ctx, emitter)
        if (compacted) {
          rebuildConversationMessages(ctx, systemPrompt, conversationMessages)
          // Retry this turn
          currentTurn--
          continue
        }
      }
      // Re-throw if not recoverable
      throw error
    }

    let turnUsage: { inputTokens: number; outputTokens: number; totalTokens: number } | undefined

    // Wrap stream iteration in try-catch for error recovery
    try {
      for await (const chunk of stream) {
        if (chunk.type === 'text' && chunk.text) {
          processor.handleTextChunk(chunk.text, turn.content)
        }

        if (chunk.type === 'reasoning' && chunk.reasoning) {
          processor.handleReasoningChunk(chunk.reasoning, turn.reasoning)
        }

        // Handle streaming tool input chunks (AI SDK v6)
        // These provide real-time visibility into tool arguments as they're generated
        if (chunk.type === 'tool-input-start' && chunk.toolInputStart) {
          processor.handleToolInputStart(
            chunk.toolInputStart.toolCallId,
            chunk.toolInputStart.toolName,
            currentTurn  // Pass turnIndex for proper contentParts ordering
          )
        }

        if (chunk.type === 'tool-input-delta' && chunk.toolInputDelta) {
          processor.handleToolInputDelta(
            chunk.toolInputDelta.toolCallId,
            chunk.toolInputDelta.argsTextDelta
          )
        }

        // Note: tool-input-end is not used - the 'tool-call' chunk contains the final parsed args
        // AI SDK v6 flow: tool-call-streaming-start -> tool-call-delta* -> tool-call

        if (chunk.type === 'tool-call' && chunk.toolCall) {
          // Get the step ID before handleToolCallChunk (which may clear the buffer)
          const existingStepId = processor.getStepIdForToolCall(chunk.toolCall.toolCallId)

          const toolCall = processor.handleToolCallChunk(chunk.toolCall)

          // Note: content ordering is handled by UIMessage stream parts and Step events

          turn.toolCalls.push(toolCall)

          // Always execute tools - the tool will decide if it needs confirmation
          // by returning requiresConfirmation: true (e.g., bash for dangerous commands)
          // Pass the resolved toolId for execution, include skills for Tool Agent
          await executeToolAndUpdate(ctx, toolCall, {
            toolName: toolCall.toolId,
            args: chunk.toolCall.args
          }, processor.toolCalls, enabledSkills, currentTurn, existingStepId)
        }

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
    } catch (error) {
      // Check if error is "prompt too long" during streaming and attempt recovery
      if (isPromptTooLongError(error)) {
        console.log('[ToolLoop] Prompt too long error during streaming, attempting compacting recovery')
        const compacted = await performCompacting(ctx, emitter)
        if (compacted) {
          rebuildConversationMessages(ctx, systemPrompt, conversationMessages)
          // Retry this turn
          currentTurn--
          continue
        }
      }
      // Re-throw if not recoverable
      throw error
    }

    // Update all steps in this turn with the turn's usage data
    if (turnUsage && turn.toolCalls.length > 0) {
      const updatedStepIds = updateStepsUsageByTurn(
        ctx.sessionId,
        ctx.assistantMessageId,
        currentTurn,
        turnUsage
      )
      // Notify frontend about the usage updates for each step
      // Note: store already updated by updateStepsUsageByTurn, we use direct IPC send
      // because sendStepUpdated would double-update the store
      for (const stepId of updatedStepIds) {
        ctx.sender.send(IPC_CHANNELS.STEP_UPDATED, {
          sessionId: ctx.sessionId,
          messageId: ctx.assistantMessageId,
          stepId,
          updates: { usage: turnUsage },
        })
      }
      console.log(`[Backend] Updated ${updatedStepIds.length} steps with turn ${currentTurn} usage`)
    }

    // Persist content parts to store (and send IPC for non-tool-call turns)
    persistTurnContentParts(ctx, emitter, turn, currentTurn)

    // ============================================================
    // Checkpoint 2: Post-turn compacting check
    // Check actual inputTokens after turn completion
    // Removed toolCalls condition - pure text conversations also need compacting
    // ============================================================
    if (turnUsage && currentTurn < MAX_TOOL_TURNS) {
      const compacted = await checkAndTriggerCompacting(ctx, emitter, turnUsage.inputTokens, modelContextLength)

      if (compacted) {
        rebuildConversationMessages(ctx, systemPrompt, conversationMessages)
      }
    }

    // If any tool requires confirmation, stop the loop and signal pause
    if (turn.toolCalls.some(tc => tc.requiresConfirmation)) {
      console.log(`[Backend] Tool requires user confirmation, pausing loop`)
      return { pausedForConfirmation: true }
    }

    // Loop control based on finishReason (OpenCode style)
    // AI decides when to stop - we trust the finishReason signal
    if (turn.toolCalls.length === 0) {
      // No tool calls this turn - check finishReason to determine if we should exit
      // "tool-calls" means AI intended to call tools (but didn't) - unusual, treat as stop
      // "unknown" means uncertain - treat as stop
      // "stop" means AI decided to stop - respect it

      // Check if output was truncated due to max token limit
      // When finishReason is 'length', the AI's response was cut off mid-generation
      // Tool call JSON may be incomplete and unparseable, resulting in no tool calls
      if (turn.finishReason === 'length') {
        const truncationMessage = '\n\n⚠️ Response was truncated due to max token limit. Please type "continue" to resume.'

        // Append truncation message to existing content (don't replace!)
        const existingContent = turn.content.value || ''
        const fullContent = existingContent + truncationMessage

        // Update store with combined content
        updateMessageContent(ctx.sessionId, ctx.assistantMessageId, fullContent)

        // Send the truncation message to UI via UIMessage stream
        sendUITextDelta(ctx.sender, ctx.sessionId, ctx.assistantMessageId, truncationMessage)
      }

      console.log(`[Backend] No tool calls in turn ${currentTurn}, finishReason: ${turn.finishReason}, ending loop`)
      return { pausedForConfirmation: false }
    }

    // Check if all tools were auto-executed
    if (!turn.toolCalls.every(tc => tc.status === 'completed' || tc.status === 'failed')) {
      console.log(`[Backend] Not all tools auto-executed, ending loop`)
      return { pausedForConfirmation: false }
    }

    // Build and append continuation messages for the next turn
    buildContinuationMessages(turn, conversationMessages, currentTurn)
    // Continuation IPC is sent at the START of the next turn
    // This ensures waiting is displayed BEFORE the LLM call starts
  }

  if (currentTurn >= MAX_TOOL_TURNS) {
    console.log(`[Backend] Reached max tool turns (${MAX_TOOL_TURNS})`)
  }

  return { pausedForConfirmation: false }
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
  const emitter = createIPCEmitter(ctx)

  try {
    console.log('[Backend] Starting streaming for message:', ctx.assistantMessageId)

    // Get session and agent info first (needed for tool init context)
    const session = getSession(ctx.sessionId)
    const currentAgent = session?.agentId
      ? getCustomAgentById(session.agentId, session.workingDirectory)
      : undefined

    // Get enabled skills based on session's workingDirectory (needed for tool init context and system prompt)
    // This uses upward traversal to find project skills
    const skillsSettings = ctx.settings.skills
    const skillsEnabled = skillsSettings?.enableSkills !== false
    const sessionWorkingDir = session?.workingDirectory
    const enabledSkills = skillsEnabled ? getSkillsForSession(sessionWorkingDir) : []

    if (sessionWorkingDir) {
      console.log(`[Chat] Loading skills for session working directory: ${sessionWorkingDir}`)
    }

    // Set init context for async tools (like SkillTool, CustomAgentTool)
    // This provides agent permissions, available skills, working directory, and provider config
    if (ctx.toolSettings?.enableToolCalls) {
      setInitContext({
        agent: currentAgent ? {
          id: currentAgent.id,
          name: currentAgent.name,
          permissions: undefined, // CustomAgents use allowBuiltinTools/allowedBuiltinTools instead
        } : undefined,
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
        // For CustomAgentTool: working directory and provider config
        workingDirectory: sessionWorkingDir,
        providerId: ctx.providerId,
        providerConfig: {
          apiKey: ctx.providerConfig.apiKey ?? '',
          baseUrl: ctx.providerConfig.baseUrl,
          model: ctx.providerConfig.model ?? '',
        },
        // For CustomAgentTool: agent enabled settings
        agentSettings: ctx.toolSettings?.agents,
      })
      // Initialize async tools with the new context
      await initializeAsyncTools()
    }

    // Get enabled tools (filter out MCP tools since they're handled separately with sanitized names)
    // Use async version to include tools with dynamic descriptions
    // Pass toolSettings.tools to filter based on user's per-tool enabled settings
    const allEnabledTools = ctx.toolSettings?.enableToolCalls ? await getEnabledToolsAsync(ctx.toolSettings.tools) : []
    
    // Check if memory is enabled in settings - if disabled, filter out memory tool
    const memoryEnabled = ctx.settings.embedding?.memoryEnabled !== false
    const enabledTools = allEnabledTools.filter(t => {
      // Filter out MCP tools (handled separately)
      if (t.id.startsWith('mcp:')) return false
      // Filter out memory tool if memory is disabled
      if (t.id === 'memory' && !memoryEnabled) {
        console.log('[Chat] Memory tool disabled because memoryEnabled=false')
        return false
      }
      return true
    })
    const mcpTools = ctx.toolSettings?.enableToolCalls ? getMCPToolsForAI(ctx.toolSettings.tools) : {}

    // Check if the current model supports tools using Models.dev tool_call field
    const supportsTools = await modelRegistry.modelSupportsTools(ctx.providerConfig.model, ctx.providerId)
    if (!supportsTools) {
      console.log(`[Chat] Model ${ctx.providerConfig.model} does not support tools, skipping tool calls`)
    }

    const hasTools = supportsTools && (enabledTools.length > 0 || Object.keys(mcpTools).length > 0)

    // Get system prompt from agent (preferred) or workspace (fallback)
    let characterSystemPrompt: string | undefined

    // First, try to get system prompt from agent
    if (session?.agentId) {
      const agent = getCustomAgentById(session.agentId, session.workingDirectory)
      if (agent?.systemPrompt) {
        characterSystemPrompt = agent.systemPrompt
      }
    }

    // Fallback to workspace system prompt if no agent prompt (for migration/backwards compatibility)
    if (!characterSystemPrompt && session?.workspaceId) {
      const workspace = getWorkspace(session.workspaceId)
      if (workspace?.systemPrompt) {
        characterSystemPrompt = workspace.systemPrompt
      }
    }

    // Build lightweight user context (low token, high value)
    // Detailed memory is accessed via Memory tool on-demand
    const userProfile = ctx.settings.general?.userProfile
    const agentIdForInteraction = session?.agentId
    
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

    const systemPrompt = buildSystemPrompt({
      hasTools,
      skills: enabledSkills,
      workspaceSystemPrompt: characterSystemPrompt,
      userProfilePrompt: userContextPrompt,  // Lightweight user context (~30-50 tokens)
      providerId: ctx.providerId,
      workingDirectory: sessionWorkingDir,
      builtinMode: session?.builtinMode,
      sessionPlan: session?.plan,
    })

    let pausedForConfirmation = false
    const requestStartTime = Date.now()

    // Build tools (can be empty {} for no-tools mode)
    const builtinToolsForAI = hasTools ? convertToolDefinitionsForAI(enabledTools) : {}
    const toolsForAI = hasTools ? { ...builtinToolsForAI, ...mcpTools } : {}

    // Log request start with structured format
    logRequestStart({
      provider: ctx.providerId,
      model: ctx.providerConfig.model,
      systemPromptLength: systemPrompt.length,
      systemPrompt,
      messages: historyMessages,
      tools: toolsForAI,
      skills: enabledSkills,
      hasTools,
    })

    // Build conversation messages with system prompt
    const conversationMessages: ToolChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...historyMessages,
    ]

    // Unified stream execution - works for both tools and no-tools modes
    // When toolsForAI is {}, the stream loop naturally exits after first turn
    const result = await runStream(ctx, conversationMessages, systemPrompt, toolsForAI, processor, enabledSkills)
    pausedForConfirmation = result.pausedForConfirmation

    // Log request end with structured format
    const requestDurationMs = Date.now() - requestStartTime
    const requestDuration = requestDurationMs / 1000
    logRequestEnd(requestDuration, ctx.accumulatedUsage, ctx.lastTurnUsage)

    // Add duration to usage for speed calculation in UI
    if (ctx.accumulatedUsage) {
      ctx.accumulatedUsage.durationMs = requestDurationMs
    }

    // Only finalize and run post-processing if not paused for tool confirmation
    if (!pausedForConfirmation) {
      processor.finalize()
      const updatedSession = getSession(ctx.sessionId)
      emitter.sendStreamComplete({
        sessionName: updatedSession?.name || sessionName,
        usage: ctx.accumulatedUsage,
        lastTurnUsage: ctx.lastTurnUsage,  // For correct context size calculation
      })
      // Save usage to message for future token subtraction on edit/regenerate
      if (ctx.accumulatedUsage) {
        updateMessageUsage(ctx.sessionId, ctx.assistantMessageId, ctx.accumulatedUsage)
        // Update session usage cache (pass lastTurnUsage for correct context size)
        updateSessionUsage(ctx.sessionId, ctx.accumulatedUsage, ctx.lastTurnUsage)
      }
      console.log('[Backend] Streaming complete, total usage:', ctx.accumulatedUsage)

      // Record interaction for agent sessions (update relationship stats)
      if (agentIdForInteraction) {
        try {
          // Use text-based memory system
          await textRecordAgentInteraction(agentIdForInteraction)
          console.log('[Backend] Recorded interaction for agent:', agentIdForInteraction)
        } catch (error) {
          console.error('Failed to record agent interaction:', error)
        }
      }

      // Run post-response triggers asynchronously (memory extraction, context compacting, etc.)
      // Get the last user message from history
      const lastUserMessageObj = historyMessages
        .filter(m => m.role === 'user')
        .pop()

      if (lastUserMessageObj && processor.accumulatedContent) {
        const lastUserMessageText = getTextFromContent(lastUserMessageObj.content)

        // Execute message:post hooks (event type, fire-and-forget)
        if (hookManager.hasHooks('message:post')) {
          hookManager.executeAll('message:post', {
            sessionId: ctx.sessionId,
            userMessage: lastUserMessageText,
            assistantMessage: processor.accumulatedContent,
            usage: ctx.accumulatedUsage ? {
              inputTokens: ctx.accumulatedUsage.inputTokens,
              outputTokens: ctx.accumulatedUsage.outputTokens,
              totalTokens: ctx.accumulatedUsage.totalTokens,
            } : undefined,
          }).catch(err => console.error('[Backend] message:post hook failed:', err))
        }

        const updatedSessionForTriggers = getSession(ctx.sessionId)
        if (updatedSessionForTriggers) {
          const triggerContext: TriggerContext = {
            sessionId: ctx.sessionId,
            session: updatedSessionForTriggers,
            messages: updatedSessionForTriggers.messages,
            lastUserMessage: lastUserMessageText,
            lastAssistantMessage: processor.accumulatedContent,
            providerId: ctx.providerId,
            providerConfig: ctx.providerConfig,
            agentId: agentIdForInteraction,
          }

          // Run triggers asynchronously - don't await
          triggerManager.runPostResponse(triggerContext)
            .catch(err => console.error('[Backend] Trigger execution failed:', err))
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
      processor.finalize()
      emitter.sendStreamComplete({
        sessionName: getSession(ctx.sessionId)?.name,
        aborted: true,
      })
    } else {
      const appError = classifyError(error)
      console.error(`[Backend][${appError.category}] Streaming error:`, error)

      // Keep the assistant message with any content already generated
      // Just mark it with error details instead of deleting
      processor.finalize()

      const errorDetailsStr = appError.technicalDetail ?? ''

      // Update the assistant message with error details
      updateMessageError(ctx.sessionId, ctx.assistantMessageId, errorDetailsStr)

      // Send error event to frontend (message is preserved, error is added)
      emitter.sendStreamError({
        error: appError.message,
        errorDetails: errorDetailsStr,
        preserved: true,  // Flag to indicate message content is preserved
      })

      // Also send stream complete to properly finalize the UI state
      emitter.sendStreamComplete({
        sessionName: getSession(ctx.sessionId)?.name,
        error: appError.message,
      })
    }

    // On error, stream is not paused - it's terminated
    return { pausedForConfirmation: false }
  }
}
