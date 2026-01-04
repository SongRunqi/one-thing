/**
 * Tool Loop Module
 * Handles tool loop execution and streaming generation
 */

import * as store from '../../store.js'
import { IPC_CHANNELS } from '../../../shared/ipc.js'
import type { SkillDefinition, ToolCall } from '../../../shared/ipc.js'
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
import { triggerManager, type TriggerContext } from '../../services/triggers/index.js'
import * as modelRegistry from '../../services/ai/model-registry.js'

import type { StreamContext, StreamProcessor } from './stream-processor.js'
import { createStreamProcessor } from './stream-processor.js'
import { sendUIMessageFinish } from './stream-helpers.js'
import { formatMessagesForLog, buildSystemPrompt, type HistoryMessage } from './message-helpers.js'
import {
  formatUserProfilePrompt,
  retrieveRelevantFacts,
  retrieveRelevantAgentMemories,
  formatAgentMemoryPrompt,
  getTextFromContent,
} from './memory-helpers.js'
import { getProviderApiType } from './provider-helpers.js'
import { executeToolAndUpdate } from './tool-execution.js'
import { logRequestStart, logRequestEnd, logTurnStart, logTurnEnd, logContinuationMessages } from './chat-logger.js'

/**
 * Stream result indicating why the stream ended
 */
export interface StreamResult {
  pausedForConfirmation: boolean  // Stream paused waiting for tool confirmation
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
  toolsForAI: Record<string, any>,  // Can be {} for no-tools mode
  processor: StreamProcessor,
  enabledSkills: SkillDefinition[]
): Promise<StreamResult> {
  const MAX_TOOL_TURNS = 100
  let currentTurn = 0
  const apiType = getProviderApiType(ctx.settings, ctx.providerId)

  while (currentTurn < MAX_TOOL_TURNS) {
    currentTurn++
    const toolCallsThisTurn: ToolCall[] = []
    const turnContent = { value: '' }
    const turnReasoning = { value: '' }
    let lastFinishReason: string = 'unknown'  // Track AI's finish reason for loop control

    logTurnStart(currentTurn)

    // Send continuation at the START of each turn (except first) to show waiting indicator
    // This ensures waiting is displayed BEFORE the LLM call starts
    if (currentTurn > 1) {
      ctx.sender.send(IPC_CHANNELS.STREAM_CHUNK, {
        type: 'continuation',
        content: '',
        messageId: ctx.assistantMessageId,
        sessionId: ctx.sessionId,
      })
    }

    const stream = streamChatResponseWithTools(
      ctx.providerId,
      {
        apiKey: ctx.providerConfig.apiKey,
        baseUrl: ctx.providerConfig.baseUrl,
        model: ctx.providerConfig.model,
        apiType,
      },
      conversationMessages,
      toolsForAI,
      {
        temperature: ctx.settings.ai.temperature,
        maxTokens: ctx.settings.chat?.maxTokens,
        abortSignal: ctx.abortSignal,
      }
    )

    let turnUsage: { inputTokens: number; outputTokens: number; totalTokens: number } | undefined

    for await (const chunk of stream) {
      if (chunk.type === 'text' && chunk.text) {
        processor.handleTextChunk(chunk.text, turnContent)
      }

      if (chunk.type === 'reasoning' && chunk.reasoning) {
        processor.handleReasoningChunk(chunk.reasoning, turnReasoning)
      }

      // Handle streaming tool input chunks (AI SDK v6)
      // These provide real-time visibility into tool arguments as they're generated
      if (chunk.type === 'tool-input-start' && chunk.toolInputStart) {
        processor.handleToolInputStart(
          chunk.toolInputStart.toolCallId,
          chunk.toolInputStart.toolName
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

        // Send data-steps placeholder BEFORE executing the first tool of this turn
        // This ensures proper ordering: text -> data-steps -> STEP_ADDED events
        if (toolCallsThisTurn.length === 0) {
          // First tool call of this turn - send text content_part first (if any)
          if (turnContent.value) {
            ctx.sender.send(IPC_CHANNELS.STREAM_CHUNK, {
              type: 'content_part',
              content: '',
              messageId: ctx.assistantMessageId,
              sessionId: ctx.sessionId,
              contentPart: { type: 'text', content: turnContent.value },
            })
          }
          // Then send data-steps placeholder
          ctx.sender.send(IPC_CHANNELS.STREAM_CHUNK, {
            type: 'content_part',
            content: '',
            messageId: ctx.assistantMessageId,
            sessionId: ctx.sessionId,
            contentPart: { type: 'data-steps', turnIndex: currentTurn },
          })
        }

        toolCallsThisTurn.push(toolCall)

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
        lastFinishReason = chunk.finishReason || 'unknown'

        if (chunk.usage) {
          turnUsage = chunk.usage
          // Accumulate usage to context for final reporting
          ctx.accumulatedUsage = ctx.accumulatedUsage || { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
          ctx.accumulatedUsage.inputTokens += chunk.usage.inputTokens
          ctx.accumulatedUsage.outputTokens += chunk.usage.outputTokens
          ctx.accumulatedUsage.totalTokens += chunk.usage.totalTokens
          // Track last turn's usage for context size (NOT accumulated)
          ctx.lastTurnUsage = chunk.usage
          logTurnEnd(currentTurn, chunk.usage, toolCallsThisTurn.length)

          // Send real-time context size update to frontend
          // Context size = input tokens only (context window limit applies to input)
          const currentContextSize = chunk.usage.inputTokens
          ctx.sender.send(IPC_CHANNELS.CONTEXT_SIZE_UPDATED, {
            sessionId: ctx.sessionId,
            contextSize: currentContextSize,
          })
        }
      }
    }

    // Update all steps in this turn with the turn's usage data
    if (turnUsage && toolCallsThisTurn.length > 0) {
      const updatedStepIds = store.updateStepsUsageByTurn(
        ctx.sessionId,
        ctx.assistantMessageId,
        currentTurn,
        turnUsage
      )
      // Notify frontend about the usage updates for each step
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

    // Add contentParts for this turn to enable proper interleaving of text and steps
    // Note: IPC messages for content_part are sent earlier (before tool execution) for proper ordering
    // Here we only persist to store and send IPC for turns WITHOUT tool calls
    if (turnContent.value) {
      store.addMessageContentPart(ctx.sessionId, ctx.assistantMessageId, {
        type: 'text',
        content: turnContent.value,
      })
      // Only send IPC if no tool calls (otherwise already sent before tool execution)
      if (toolCallsThisTurn.length === 0) {
        ctx.sender.send(IPC_CHANNELS.STREAM_CHUNK, {
          type: 'content_part',
          content: '',
          messageId: ctx.assistantMessageId,
          sessionId: ctx.sessionId,
          contentPart: { type: 'text', content: turnContent.value },
        })
      }
    }

    if (toolCallsThisTurn.length > 0) {
      store.addMessageContentPart(ctx.sessionId, ctx.assistantMessageId, {
        type: 'data-steps',
        turnIndex: currentTurn,
      })
      // IPC already sent before tool execution, no need to send again
    }

    // If any tool requires confirmation, stop the loop and signal pause
    if (toolCallsThisTurn.some(tc => tc.requiresConfirmation)) {
      console.log(`[Backend] Tool requires user confirmation, pausing loop`)
      return { pausedForConfirmation: true }
    }

    // Loop control based on finishReason (OpenCode style)
    // AI decides when to stop - we trust the finishReason signal
    if (toolCallsThisTurn.length === 0) {
      // No tool calls this turn - check finishReason to determine if we should exit
      // "tool-calls" means AI intended to call tools (but didn't) - unusual, treat as stop
      // "unknown" means uncertain - treat as stop
      // "stop" means AI decided to stop - respect it

      // Check if output was truncated due to max token limit
      // When finishReason is 'length', the AI's response was cut off mid-generation
      // Tool call JSON may be incomplete and unparseable, resulting in no tool calls
      if (lastFinishReason === 'length') {
        const truncationMessage = '\n\n⚠️ Response was truncated due to max token limit. Please type "continue" to resume.'

        // Append truncation message to existing content (don't replace!)
        const existingContent = turnContent.value || ''
        const fullContent = existingContent + truncationMessage

        // Update store with combined content
        store.updateMessageContent(ctx.sessionId, ctx.assistantMessageId, fullContent)

        // Send the truncation message to UI (append, not replace)
        ctx.sender.send(IPC_CHANNELS.STREAM_CHUNK, {
          type: 'text',
          content: truncationMessage,
          messageId: ctx.assistantMessageId,
          sessionId: ctx.sessionId,
          // No replace: true - this appends to existing content
        })
      }

      console.log(`[Backend] No tool calls in turn ${currentTurn}, finishReason: ${lastFinishReason}, ending loop`)
      return { pausedForConfirmation: false }
    }

    // Check if all tools were auto-executed
    if (!toolCallsThisTurn.every(tc => tc.status === 'completed' || tc.status === 'failed')) {
      console.log(`[Backend] Not all tools auto-executed, ending loop`)
      return { pausedForConfirmation: false }
    }

    // Build continuation messages
    const assistantMsg: {
      role: 'assistant'
      content: string
      toolCalls: Array<{ toolCallId: string; toolName: string; args: Record<string, any> }>
      reasoningContent?: string
    } = {
      role: 'assistant' as const,
      content: turnContent.value,
      toolCalls: toolCallsThisTurn.map(tc => ({
        toolCallId: tc.id,
        toolName: tc.toolName,
        args: tc.arguments,
      })),
    }
    if (turnReasoning.value) {
      assistantMsg.reasoningContent = turnReasoning.value
    }
    conversationMessages.push(assistantMsg)

    const toolResultMsg = {
      role: 'tool' as const,
      content: toolCallsThisTurn.map(tc => ({
        type: 'tool-result' as const,
        toolCallId: tc.id,
        toolName: tc.toolName,
        result: tc.status === 'completed' ? tc.result : { error: tc.error },
      })),
    }
    conversationMessages.push(toolResultMsg)

    // Log what we're sending for the next turn
    logContinuationMessages(
      currentTurn,
      turnContent.value,
      assistantMsg.toolCalls,
      toolResultMsg.content.map(tr => ({
        toolCallId: tr.toolCallId,
        toolName: tr.toolName,
        result: tr.result,
      }))
    )
    // Continuation is now sent at the START of the next turn (line 1234-1240)
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
export async function executeStreamGeneration(
  ctx: StreamContext,
  historyMessages: HistoryMessage[],
  sessionName?: string
): Promise<void> {
  const processor = createStreamProcessor(ctx)

  try {
    console.log('[Backend] Starting streaming for message:', ctx.assistantMessageId)

    // Get session and agent info first (needed for tool init context)
    const session = store.getSession(ctx.sessionId)
    let currentAgent: ReturnType<typeof store.getAgent> | undefined
    if (session?.agentId) {
      currentAgent = store.getAgent(session.agentId)
    }

    // Get enabled skills based on session's workingDirectory (needed for tool init context and system prompt)
    // This uses upward traversal to find project skills
    const skillsSettings = ctx.settings.skills
    const skillsEnabled = skillsSettings?.enableSkills !== false
    const sessionWorkingDir = session?.workingDirectory
    const enabledSkills = skillsEnabled ? getSkillsForSession(sessionWorkingDir) : []

    if (sessionWorkingDir) {
      console.log(`[Chat] Loading skills for session working directory: ${sessionWorkingDir}`)
    }

    // Set init context for async tools (like SkillTool)
    // This provides agent permissions and available skills to tools that need them
    if (ctx.toolSettings?.enableToolCalls) {
      setInitContext({
        agent: currentAgent ? {
          id: currentAgent.id,
          name: currentAgent.name,
          permissions: currentAgent.permissions,
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
      })
      // Initialize async tools with the new context
      await initializeAsyncTools()
    }

    // Get enabled tools (filter out MCP tools since they're handled separately with sanitized names)
    // Use async version to include tools with dynamic descriptions
    // Pass toolSettings.tools to filter based on user's per-tool enabled settings
    const allEnabledTools = ctx.toolSettings?.enableToolCalls ? await getEnabledToolsAsync(ctx.toolSettings.tools) : []
    const enabledTools = allEnabledTools.filter(t => !t.id.startsWith('mcp:'))
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
      const agent = store.getAgent(session.agentId)
      if (agent?.systemPrompt) {
        characterSystemPrompt = agent.systemPrompt
      }
    }

    // Fallback to workspace system prompt if no agent prompt (for migration/backwards compatibility)
    if (!characterSystemPrompt && session?.workspaceId) {
      const workspace = store.getWorkspace(session.workspaceId)
      if (workspace?.systemPrompt) {
        characterSystemPrompt = workspace.systemPrompt
      }
    }

    // Get user profile (shared) and agent memory (per-agent) for personalization
    let userProfilePrompt: string | undefined
    let agentMemoryPrompt: string | undefined
    let agentIdForInteraction: string | undefined

    // Get the last user message for retrieval-based memory injection
    const lastUserMessageContent = historyMessages
      .filter(m => m.role === 'user')
      .pop()?.content
    const lastUserMessage = lastUserMessageContent ? getTextFromContent(lastUserMessageContent) : ''

    // Check if memory is enabled in settings
    const memorySettings = store.getSettings()
    const memoryEnabled = memorySettings.embedding?.memoryEnabled !== false

    // Retrieve relevant user facts based on conversation context (semantic search)
    if (memoryEnabled) {
      try {
        const storage = getStorage()
        const relevantFacts = await retrieveRelevantFacts(storage, lastUserMessage, 10, 0.3)
        userProfilePrompt = formatUserProfilePrompt(relevantFacts)
        if (relevantFacts.length > 0) {
          console.log(`[Chat] Retrieved ${relevantFacts.length} relevant facts for context`)
        }
      } catch (error) {
        console.error('Failed to retrieve relevant facts:', error)
      }
    }

    // Load agent-specific memory only for agent sessions
    if (session?.agentId) {
      agentIdForInteraction = session.agentId
      if (memoryEnabled) {
        try {
          const storage = getStorage()
          const relationship = await storage.agentMemory.getRelationship(session.agentId)
          if (relationship) {
            // Use semantic search to retrieve context-relevant memories
            const relevantMemories = await retrieveRelevantAgentMemories(
              storage, session.agentId, lastUserMessage, 5, 0.3
            )
            if (relevantMemories.length > 0) {
              console.log(`[Chat] Retrieved ${relevantMemories.length} relevant agent memories for context`)
            }
            agentMemoryPrompt = formatAgentMemoryPrompt(relationship, relevantMemories)
          }
        } catch (error) {
          console.error('Failed to load agent memory:', error)
        }
      }
    }

    const systemPrompt = buildSystemPrompt({
      hasTools,
      skills: enabledSkills,
      workspaceSystemPrompt: characterSystemPrompt,
      userProfilePrompt,
      agentMemoryPrompt,
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
    const result = await runStream(ctx, conversationMessages, toolsForAI, processor, enabledSkills)
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
      const updatedSession = store.getSession(ctx.sessionId)
      ctx.sender.send(IPC_CHANNELS.STREAM_COMPLETE, {
        messageId: ctx.assistantMessageId,
        sessionId: ctx.sessionId,
        sessionName: updatedSession?.name || sessionName,
        usage: ctx.accumulatedUsage,
        lastTurnUsage: ctx.lastTurnUsage,  // For correct context size calculation
      })
      // Also send UIMessage finish chunk with usage for new clients
      sendUIMessageFinish(ctx.sender, ctx.sessionId, ctx.assistantMessageId, 'stop', ctx.accumulatedUsage)
      // Save usage to message for future token subtraction on edit/regenerate
      if (ctx.accumulatedUsage) {
        store.updateMessageUsage(ctx.sessionId, ctx.assistantMessageId, ctx.accumulatedUsage)
        // Update session usage cache (pass lastTurnUsage for correct context size)
        updateSessionUsage(ctx.sessionId, ctx.accumulatedUsage, ctx.lastTurnUsage)
      }
      console.log('[Backend] Streaming complete, total usage:', ctx.accumulatedUsage)

      // Record interaction for agent sessions (update relationship stats)
      if (agentIdForInteraction) {
        try {
          const storage = getStorage()
          await storage.agentMemory.recordInteraction(agentIdForInteraction)
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
        const updatedSessionForTriggers = store.getSession(ctx.sessionId)
        if (updatedSessionForTriggers) {
          const triggerContext: TriggerContext = {
            sessionId: ctx.sessionId,
            session: updatedSessionForTriggers,
            messages: updatedSessionForTriggers.messages,
            lastUserMessage: getTextFromContent(lastUserMessageObj.content),
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

  } catch (error: any) {
    const isAborted = error.name === 'AbortError' || ctx.abortSignal.aborted

    if (isAborted) {
      console.log('[Backend] Stream aborted by user')
      processor.finalize()
      ctx.sender.send(IPC_CHANNELS.STREAM_COMPLETE, {
        messageId: ctx.assistantMessageId,
        sessionId: ctx.sessionId,
        sessionName: store.getSession(ctx.sessionId)?.name,
        aborted: true,
      })
    } else {
      console.error('[Backend] Streaming error:', error)

      // Import extractErrorDetails for error handling
      const { extractErrorDetails } = await import('./provider-helpers.js')

      // Keep the assistant message with any content already generated
      // Just mark it with error details instead of deleting
      processor.finalize()

      const errorDetailsStr = extractErrorDetails(error)
      const errorContent = error.message || 'Streaming error'

      // Update the assistant message with error details
      store.updateMessageError(ctx.sessionId, ctx.assistantMessageId, errorDetailsStr)

      // Send error event to frontend (message is preserved, error is added)
      ctx.sender.send(IPC_CHANNELS.STREAM_ERROR, {
        messageId: ctx.assistantMessageId,
        sessionId: ctx.sessionId,
        error: errorContent,
        errorDetails: errorDetailsStr,
        preserved: true,  // Flag to indicate message content is preserved
      })

      // Also send stream complete to properly finalize the UI state
      ctx.sender.send(IPC_CHANNELS.STREAM_COMPLETE, {
        messageId: ctx.assistantMessageId,
        sessionId: ctx.sessionId,
        sessionName: store.getSession(ctx.sessionId)?.name,
        error: errorContent,
      })
    }
  }
}
