/**
 * Tool Loop Module
 * Handles tool loop execution and streaming generation
 */

import * as store from '../../store.js'
import { IPC_CHANNELS } from '../../../shared/ipc.js'
import type { SkillDefinition, ToolCall } from '../../../shared/ipc.js'
import type { AIMessageContent, ToolChatMessage } from '../../providers/index.js'
import {
  streamChatResponseWithReasoning,
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
import { formatMessagesForLog, buildSystemPrompt } from './message-helpers.js'
import {
  formatUserProfilePrompt,
  retrieveRelevantFacts,
  retrieveRelevantAgentMemories,
  formatAgentMemoryPrompt,
  getTextFromContent,
} from './memory-helpers.js'
import { getProviderApiType } from './provider-helpers.js'
import { executeToolAndUpdate } from './tool-execution.js'

/**
 * Tool loop result indicating why the loop ended
 */
export interface ToolLoopResult {
  pausedForConfirmation: boolean  // Loop paused waiting for tool confirmation
}

/**
 * Run the tool loop for streaming with tools
 */
export async function runToolLoop(
  ctx: StreamContext,
  conversationMessages: ToolChatMessage[],
  toolsForAI: Record<string, any>,
  processor: StreamProcessor,
  enabledSkills: SkillDefinition[]
): Promise<ToolLoopResult> {
  const MAX_TOOL_TURNS = 100
  let currentTurn = 0
  const apiType = getProviderApiType(ctx.settings, ctx.providerId)

  while (currentTurn < MAX_TOOL_TURNS) {
    currentTurn++
    const toolCallsThisTurn: ToolCall[] = []
    const turnContent = { value: '' }
    const turnReasoning = { value: '' }

    console.log(`[Backend] Starting tool turn ${currentTurn}`)

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
      { temperature: ctx.settings.ai.temperature, abortSignal: ctx.abortSignal }
    )

    let turnUsage: { inputTokens: number; outputTokens: number; totalTokens: number } | undefined

    for await (const chunk of stream) {
      if (chunk.type === 'text' && chunk.text) {
        processor.handleTextChunk(chunk.text, turnContent)
      }

      if (chunk.type === 'reasoning' && chunk.reasoning) {
        processor.handleReasoningChunk(chunk.reasoning, turnReasoning)
      }

      if (chunk.type === 'tool-call' && chunk.toolCall) {
        const toolCall = processor.handleToolCallChunk(chunk.toolCall)
        toolCallsThisTurn.push(toolCall)

        // Always execute tools - the tool will decide if it needs confirmation
        // by returning requiresConfirmation: true (e.g., bash for dangerous commands)
        // Pass the resolved toolId for execution, include skills for Tool Agent
        await executeToolAndUpdate(ctx, toolCall, {
          toolName: toolCall.toolId,
          args: chunk.toolCall.args
        }, processor.toolCalls, enabledSkills, currentTurn)
      }

      // Capture usage data from finish chunk
      if (chunk.type === 'finish' && chunk.usage) {
        turnUsage = chunk.usage
        // Accumulate usage to context for final reporting
        ctx.accumulatedUsage = ctx.accumulatedUsage || { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
        ctx.accumulatedUsage.inputTokens += chunk.usage.inputTokens
        ctx.accumulatedUsage.outputTokens += chunk.usage.outputTokens
        ctx.accumulatedUsage.totalTokens += chunk.usage.totalTokens
        console.log(`[Backend] Turn ${currentTurn} usage:`, chunk.usage, `Total accumulated:`, ctx.accumulatedUsage)
      }
    }

    // Add contentParts for this turn to enable proper interleaving of text and steps
    // Only add if there's actual content (text or tool calls)
    if (turnContent.value) {
      store.addMessageContentPart(ctx.sessionId, ctx.assistantMessageId, {
        type: 'text',
        content: turnContent.value,
      })
      ctx.sender.send(IPC_CHANNELS.STREAM_CHUNK, {
        type: 'content_part',
        content: '',
        messageId: ctx.assistantMessageId,
        sessionId: ctx.sessionId,
        contentPart: { type: 'text', content: turnContent.value },
      })
    }

    if (toolCallsThisTurn.length > 0) {
      store.addMessageContentPart(ctx.sessionId, ctx.assistantMessageId, {
        type: 'data-steps',
        turnIndex: currentTurn,
      })
      ctx.sender.send(IPC_CHANNELS.STREAM_CHUNK, {
        type: 'content_part',
        content: '',
        messageId: ctx.assistantMessageId,
        sessionId: ctx.sessionId,
        contentPart: { type: 'data-steps', turnIndex: currentTurn },
      })
    }

    // If any tool requires confirmation, stop the loop and signal pause
    if (toolCallsThisTurn.some(tc => tc.requiresConfirmation)) {
      console.log(`[Backend] Tool requires user confirmation, pausing loop`)
      return { pausedForConfirmation: true }
    }

    // If no tool calls this turn, we're done
    if (toolCallsThisTurn.length === 0) {
      console.log(`[Backend] No tool calls in turn ${currentTurn}, ending loop`)
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
    // Continuation is now sent at the START of the next turn (line 1234-1240)
    // This ensures waiting is displayed BEFORE the LLM call starts
  }

  if (currentTurn >= MAX_TOOL_TURNS) {
    console.log(`[Backend] Reached max tool turns (${MAX_TOOL_TURNS})`)
  }

  return { pausedForConfirmation: false }
}

/**
 * Run simple streaming without tools
 */
export async function runSimpleStream(
  ctx: StreamContext,
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: AIMessageContent; reasoningContent?: string }>,
  processor: StreamProcessor
): Promise<void> {
  const apiType = getProviderApiType(ctx.settings, ctx.providerId)

  const stream = streamChatResponseWithReasoning(
    ctx.providerId,
    {
      apiKey: ctx.providerConfig.apiKey,
      baseUrl: ctx.providerConfig.baseUrl,
      model: ctx.providerConfig.model,
      apiType,
    },
    messages,
    { temperature: ctx.settings.ai.temperature, abortSignal: ctx.abortSignal }
  )

  for await (const chunk of stream) {
    if (chunk.text) {
      processor.handleTextChunk(chunk.text)
    }
    if (chunk.reasoning) {
      processor.handleReasoningChunk(chunk.reasoning)
    }
  }
}

/**
 * Core streaming execution function
 * Handles both tool-enabled and simple streaming
 * Tool calls are routed through Tool Agent for execution
 */
export async function executeStreamGeneration(
  ctx: StreamContext,
  historyMessages: Array<{ role: 'user' | 'assistant'; content: AIMessageContent; reasoningContent?: string }>,
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
    const allEnabledTools = ctx.toolSettings?.enableToolCalls ? await getEnabledToolsAsync() : []
    const enabledTools = allEnabledTools.filter(t => !t.id.startsWith('mcp:'))
    const mcpTools = ctx.toolSettings?.enableToolCalls ? getMCPToolsForAI() : {}

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
    })

    let pausedForConfirmation = false

    // Log request start
    const requestStartTime = Date.now()
    console.log('[Chat] ===== Request Start =====')
    console.log('[Chat] Time:', new Date(requestStartTime).toISOString())
    console.log('[Chat] Provider:', ctx.providerId)
    console.log('[Chat] Model:', ctx.providerConfig.model)
    console.log('[Chat] System Prompt:', systemPrompt)
    console.log('[Chat] Messages:', JSON.stringify(formatMessagesForLog(historyMessages), null, 2))

    if (hasTools) {
      // Main LLM sees all tools, Tool Agent handles execution
      const builtinToolsForAI = convertToolDefinitionsForAI(enabledTools)
      const toolsForAI = { ...builtinToolsForAI, ...mcpTools }

      const conversationMessages: ToolChatMessage[] = [
        { role: 'system', content: systemPrompt },
        ...historyMessages,
      ]

      const result = await runToolLoop(ctx, conversationMessages, toolsForAI, processor, enabledSkills)
      pausedForConfirmation = result.pausedForConfirmation
    } else {
      // No tools: Simple streaming
      const conversationMessages = [
        { role: 'system' as const, content: systemPrompt },
        ...historyMessages,
      ]
      await runSimpleStream(ctx, conversationMessages, processor)
    }

    // Log request end
    const requestEndTime = Date.now()
    const requestDuration = (requestEndTime - requestStartTime) / 1000
    console.log('[Chat] ===== Request End =====')
    console.log('[Chat] End Time:', new Date(requestEndTime).toISOString())
    console.log('[Chat] Duration:', requestDuration.toFixed(2), 'seconds')

    // Only finalize and run post-processing if not paused for tool confirmation
    if (!pausedForConfirmation) {
      processor.finalize()
      const updatedSession = store.getSession(ctx.sessionId)
      ctx.sender.send(IPC_CHANNELS.STREAM_COMPLETE, {
        messageId: ctx.assistantMessageId,
        sessionId: ctx.sessionId,
        sessionName: updatedSession?.name || sessionName,
        usage: ctx.accumulatedUsage,
      })
      // Also send UIMessage finish chunk with usage for new clients
      sendUIMessageFinish(ctx.sender, ctx.sessionId, ctx.assistantMessageId, 'stop', ctx.accumulatedUsage)
      // Save usage to message for future token subtraction on edit/regenerate
      if (ctx.accumulatedUsage) {
        store.updateMessageUsage(ctx.sessionId, ctx.assistantMessageId, ctx.accumulatedUsage)
        // Update session usage cache
        updateSessionUsage(ctx.sessionId, ctx.accumulatedUsage)
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

      // Remove the failed assistant message from storage
      store.deleteMessage(ctx.sessionId, ctx.assistantMessageId)

      // Add an error message to the session (persisted)
      const errorMessage = {
        id: `error-${Date.now()}`,
        role: 'error' as const,
        content: error.message || 'Streaming error',
        timestamp: Date.now(),
        errorDetails: extractErrorDetails(error),
      }
      store.addMessage(ctx.sessionId, errorMessage)

      ctx.sender.send(IPC_CHANNELS.STREAM_ERROR, {
        messageId: ctx.assistantMessageId,
        sessionId: ctx.sessionId,
        error: error.message || 'Streaming error',
        errorDetails: extractErrorDetails(error),
      })
    }
  }
}
