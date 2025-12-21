import { ipcMain, BrowserWindow } from 'electron'
import * as store from '../store.js'
import type { ChatMessage, AppSettings, ProviderConfig, CustomProviderConfig } from '../../shared/ipc.js'
import { IPC_CHANNELS } from '../../shared/ipc.js'
import { v4 as uuidv4 } from 'uuid'
import {
  generateChatResponseWithReasoning,
  generateChatTitle,
  isProviderSupported,
  streamChatResponseWithReasoning,
  streamChatResponseWithTools,
  convertToolDefinitionsForAI,
  type ToolChatMessage,
} from '../providers/index.js'
import {
  getEnabledTools,
  executeTool,
  canAutoExecute,
  createToolCall,
} from '../tools/index.js'
import type { ToolCall, ToolSettings } from '../../shared/ipc.js'
import { getMCPToolsForAI, isMCPTool, executeMCPTool, parseMCPToolId, findMCPToolIdByShortName, MCPManager } from '../mcp/index.js'
import { getLoadedSkills } from './skills.js'
import { buildSkillsAwarenessPrompt, buildSkillsDirectPrompt } from '../skills/prompt-builder.js'
import type { SkillDefinition } from '../../shared/ipc.js'

// Helper function to build history messages from session messages
// Includes reasoningContent for assistant messages (required by DeepSeek Reasoner)
// Filters out streaming messages (empty assistant messages being generated)
function buildHistoryMessages(messages: ChatMessage[]): Array<{
  role: 'user' | 'assistant'
  content: string
  reasoningContent?: string
}> {
  return messages
    .filter(m => {
      // Only include user and assistant messages
      if (m.role !== 'user' && m.role !== 'assistant') return false
      // Exclude streaming messages (current message being generated)
      if (m.isStreaming) return false
      return true
    })
    .map(m => {
      const msg: { role: 'user' | 'assistant'; content: string; reasoningContent?: string } = {
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }
      // Include reasoning content for assistant messages (needed for DeepSeek Reasoner)
      if (m.role === 'assistant' && m.reasoning) {
        msg.reasoningContent = m.reasoning
      }
      return msg
    })
}

// Store active AbortControllers per session for stream cancellation
// Key: sessionId, Value: AbortController
const activeStreams = new Map<string, AbortController>()

// Base system prompt to control tool usage behavior
const BASE_SYSTEM_PROMPT = `You are a helpful assistant. You have access to tools, but you should ONLY use them when the user's request specifically requires their functionality.

Important guidelines:
- DO NOT mention your available tools or capabilities unless the user explicitly asks what you can do
- DO NOT offer to use tools proactively - wait for the user to make a request that requires them
- For casual conversation (greetings, general questions, etc.), respond naturally without referring to tools
- Only call a tool when the user's message clearly requires that tool's specific functionality
- If unsure whether a tool is needed, prefer responding conversationally first`

/**
 * Build dynamic system prompt with optional skills awareness
 */
function buildSystemPrompt(options: {
  hasTools: boolean
  skills: SkillDefinition[]
}): string {
  const { hasTools, skills } = options
  let prompt = BASE_SYSTEM_PROMPT

  // Add skills awareness when tools are enabled
  if (skills.length > 0) {
    if (hasTools) {
      // Tools enabled - add awareness prompt (Claude can use Bash to read SKILL.md)
      prompt += '\n\n' + buildSkillsAwarenessPrompt(skills)
    } else {
      // Tools disabled - include abbreviated instructions directly
      prompt += '\n\n' + buildSkillsDirectPrompt(skills)
    }
  }

  return prompt
}

// Extract detailed error information from API responses
function extractErrorDetails(error: any): string | undefined {
  // AI SDK wraps errors with additional context
  if (error.cause) {
    return extractErrorDetails(error.cause)
  }

  // For API errors with response data
  if (error.data) {
    const data = error.data

    // OpenAI error format: { error: { message: "...", type: "...", code: "..." } }
    if (data.error?.message) {
      const err = data.error
      let details = err.message
      if (err.type) details += ` (type: ${err.type})`
      if (err.code) details += ` (code: ${err.code})`
      return details
    }

    // Claude/Anthropic error format
    if (data.type === 'error' && data.error) {
      const err = data.error
      return `${err.type}: ${err.message}`
    }

    if (data.message) {
      return data.message
    }

    if (typeof data === 'string') {
      return data
    }

    try {
      return JSON.stringify(data, null, 2)
    } catch {
      return undefined
    }
  }

  // Return message or stack trace
  return error.message || error.stack
}

// Helper to get current provider config
function getProviderConfig(settings: AppSettings): ProviderConfig | undefined {
  return settings.ai.providers[settings.ai.provider]
}

// Helper to get custom provider config by ID
function getCustomProviderConfig(settings: AppSettings, providerId: string): CustomProviderConfig | undefined {
  return settings.ai.customProviders?.find(p => p.id === providerId)
}

// Helper to get apiType for a provider
function getProviderApiType(settings: AppSettings, providerId: string): 'openai' | 'anthropic' | undefined {
  if (providerId.startsWith('custom-')) {
    const customProvider = getCustomProviderConfig(settings, providerId)
    return customProvider?.apiType
  }
  return undefined
}

// ============================================
// Shared Streaming Infrastructure
// ============================================

/**
 * Context for streaming operations
 */
interface StreamContext {
  sender: Electron.WebContents
  sessionId: string
  assistantMessageId: string
  abortSignal: AbortSignal
  settings: AppSettings
  providerConfig: ProviderConfig
  providerId: string
  toolSettings: ToolSettings | undefined
}

/**
 * Stream processor that handles chunk accumulation and event sending
 */
interface StreamProcessor {
  accumulatedContent: string
  accumulatedReasoning: string
  toolCalls: ToolCall[]
  handleTextChunk(text: string, turnContent?: { value: string }): void
  handleReasoningChunk(reasoning: string, turnReasoning?: { value: string }): void
  handleToolCallChunk(toolCallData: {
    toolCallId: string
    toolName: string
    args: Record<string, any>
  }): ToolCall
  finalize(): void
}

/**
 * Create a stream processor for handling chunks
 */
function createStreamProcessor(ctx: StreamContext): StreamProcessor {
  let accumulatedContent = ''
  let accumulatedReasoning = ''
  const toolCalls: ToolCall[] = []

  return {
    get accumulatedContent() { return accumulatedContent },
    get accumulatedReasoning() { return accumulatedReasoning },
    get toolCalls() { return toolCalls },

    handleTextChunk(text: string, turnContent?: { value: string }) {
      accumulatedContent += text
      if (turnContent) turnContent.value += text
      store.updateMessageContent(ctx.sessionId, ctx.assistantMessageId, accumulatedContent)
      ctx.sender.send(IPC_CHANNELS.STREAM_CHUNK, {
        type: 'text',
        content: text,
        messageId: ctx.assistantMessageId,
        sessionId: ctx.sessionId,
      })
    },

    handleReasoningChunk(reasoning: string, turnReasoning?: { value: string }) {
      accumulatedReasoning += reasoning
      if (turnReasoning) turnReasoning.value += reasoning
      store.updateMessageReasoning(ctx.sessionId, ctx.assistantMessageId, accumulatedReasoning)
      ctx.sender.send(IPC_CHANNELS.STREAM_CHUNK, {
        type: 'reasoning',
        content: '',
        messageId: ctx.assistantMessageId,
        sessionId: ctx.sessionId,
        reasoning,
      })
    },

    handleToolCallChunk(toolCallData: {
      toolCallId: string
      toolName: string
      args: Record<string, any>
    }): ToolCall {
      // Resolve tool ID - AI models may return short names like "get-library-docs"
      // instead of full IDs like "mcp_serverId_get-library-docs"
      let toolId = toolCallData.toolName
      let displayName = toolCallData.toolName
      let isMcp = false

      if (isMCPTool(toolCallData.toolName)) {
        // Already a full MCP tool ID
        toolId = toolCallData.toolName
        isMcp = true
      } else {
        // Try to find full MCP tool ID from short name or server name
        const fullId = findMCPToolIdByShortName(toolCallData.toolName, toolCallData.args)
        if (fullId) {
          console.log(`[Backend] Resolved short tool name "${toolCallData.toolName}" to full ID "${fullId}"`)
          toolId = fullId
          isMcp = true
        }
      }

      // For MCP tools, show the MCP server's display name
      // For regular tools, show the tool name
      if (isMcp) {
        const parsed = parseMCPToolId(toolId)
        if (parsed) {
          // Get the server's display name from MCPManager
          const serverState = MCPManager.getServerState(parsed.serverId)
          displayName = serverState?.config.name || parsed.serverId
        }
      }

      const toolCall = createToolCall(
        toolId,        // toolId: use full ID for execution
        displayName,   // toolName: use readable name for display
        toolCallData.args
      )
      toolCall.id = toolCallData.toolCallId
      toolCalls.push(toolCall)

      store.updateMessageToolCalls(ctx.sessionId, ctx.assistantMessageId, toolCalls)
      ctx.sender.send(IPC_CHANNELS.STREAM_CHUNK, {
        type: 'tool_call',
        content: '',
        messageId: ctx.assistantMessageId,
        sessionId: ctx.sessionId,
        toolCall,
      })

      return toolCall
    },

    finalize() {
      store.updateMessageStreaming(ctx.sessionId, ctx.assistantMessageId, false)
    },
  }
}

/**
 * Execute a tool (MCP or built-in) and update tool call status
 */
async function executeToolAndUpdate(
  ctx: StreamContext,
  toolCall: ToolCall,
  toolCallData: { toolName: string; args: Record<string, any> },
  allToolCalls: ToolCall[]
): Promise<void> {
  toolCall.status = 'executing'
  toolCall.startTime = Date.now()
  store.updateMessageToolCalls(ctx.sessionId, ctx.assistantMessageId, allToolCalls)

  // Send executing status to frontend so UI shows "Calling..." with spinner
  ctx.sender.send(IPC_CHANNELS.STREAM_CHUNK, {
    type: 'tool_call',
    content: '',
    messageId: ctx.assistantMessageId,
    sessionId: ctx.sessionId,
    toolCall,
  })

  let result: {
    success: boolean
    data?: any
    error?: string
    requiresConfirmation?: boolean
    commandType?: 'read-only' | 'dangerous' | 'forbidden'
  }

  if (isMCPTool(toolCallData.toolName)) {
    const mcpResult = await executeMCPTool(toolCallData.toolName, toolCallData.args)
    result = {
      success: mcpResult.success,
      data: mcpResult.content,
      error: mcpResult.error,
    }
  } else {
    result = await executeTool(
      toolCallData.toolName,
      toolCallData.args,
      { sessionId: ctx.sessionId, messageId: ctx.assistantMessageId }
    )
  }

  toolCall.endTime = Date.now()

  if (result.requiresConfirmation) {
    toolCall.status = 'pending'
    toolCall.requiresConfirmation = true
    toolCall.commandType = result.commandType
    toolCall.error = result.error
  } else {
    toolCall.status = result.success ? 'completed' : 'failed'
    toolCall.result = result.data
    toolCall.error = result.error
  }

  store.updateMessageToolCalls(ctx.sessionId, ctx.assistantMessageId, allToolCalls)
  ctx.sender.send(IPC_CHANNELS.STREAM_CHUNK, {
    type: 'tool_result',
    content: '',
    messageId: ctx.assistantMessageId,
    sessionId: ctx.sessionId,
    toolCall,
  })
}

/**
 * Run the tool loop for streaming with tools
 */
async function runToolLoop(
  ctx: StreamContext,
  conversationMessages: ToolChatMessage[],
  toolsForAI: Record<string, any>,
  processor: StreamProcessor,
  enabledSkills: SkillDefinition[]
): Promise<void> {
  const MAX_TOOL_TURNS = 100
  let currentTurn = 0
  const apiType = getProviderApiType(ctx.settings, ctx.providerId)

  while (currentTurn < MAX_TOOL_TURNS) {
    currentTurn++
    const toolCallsThisTurn: ToolCall[] = []
    const turnContent = { value: '' }
    const turnReasoning = { value: '' }

    console.log(`[Backend] Starting tool turn ${currentTurn}`)

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

        // Use resolved toolId (from handleToolCallChunk) for checking,
        // as AI models may return short names that we've resolved to full IDs
        const shouldAutoExecute = isMCPTool(toolCall.toolId) ||
          canAutoExecute(toolCall.toolId, ctx.toolSettings?.tools)

        if (shouldAutoExecute) {
          // Pass the resolved toolId for execution
          await executeToolAndUpdate(ctx, toolCall, {
            toolName: toolCall.toolId,
            args: chunk.toolCall.args
          }, processor.toolCalls)
        }
      }
    }

    // If any tool requires confirmation, stop the loop
    if (toolCallsThisTurn.some(tc => tc.requiresConfirmation)) {
      console.log(`[Backend] Tool requires user confirmation, pausing loop`)
      break
    }

    // If no tool calls this turn, we're done
    if (toolCallsThisTurn.length === 0) {
      console.log(`[Backend] No tool calls in turn ${currentTurn}, ending loop`)
      break
    }

    // Check if all tools were auto-executed
    if (!toolCallsThisTurn.every(tc => tc.status === 'completed' || tc.status === 'failed')) {
      console.log(`[Backend] Not all tools auto-executed, ending loop`)
      break
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

    ctx.sender.send(IPC_CHANNELS.STREAM_CHUNK, {
      type: 'continuation',
      content: '',
      messageId: ctx.assistantMessageId,
      sessionId: ctx.sessionId,
    })
  }

  if (currentTurn >= MAX_TOOL_TURNS) {
    console.log(`[Backend] Reached max tool turns (${MAX_TOOL_TURNS})`)
  }
}

/**
 * Run simple streaming without tools
 */
async function runSimpleStream(
  ctx: StreamContext,
  historyMessages: Array<{ role: 'user' | 'assistant'; content: string; reasoningContent?: string }>,
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
    historyMessages,
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
 */
async function executeStreamGeneration(
  ctx: StreamContext,
  historyMessages: Array<{ role: 'user' | 'assistant'; content: string; reasoningContent?: string }>,
  sessionName?: string
): Promise<void> {
  const processor = createStreamProcessor(ctx)

  try {
    console.log('[Backend] Starting streaming for message:', ctx.assistantMessageId)

    // Get enabled tools (filter out MCP tools since they're handled separately with sanitized names)
    const allEnabledTools = ctx.toolSettings?.enableToolCalls ? getEnabledTools() : []
    const enabledTools = allEnabledTools.filter(t => !t.id.startsWith('mcp:'))
    const mcpTools = ctx.toolSettings?.enableToolCalls ? getMCPToolsForAI() : {}
    const hasTools = enabledTools.length > 0 || Object.keys(mcpTools).length > 0

    // Get enabled skills
    const skillsSettings = ctx.settings.skills
    const skillsEnabled = skillsSettings?.enableSkills !== false
    const enabledSkills = skillsEnabled ? getLoadedSkills().filter(s => s.enabled) : []

    const systemPrompt = buildSystemPrompt({ hasTools, skills: enabledSkills })

    if (hasTools) {
      const builtinToolsForAI = convertToolDefinitionsForAI(enabledTools)
      const toolsForAI = { ...builtinToolsForAI, ...mcpTools }

      const conversationMessages: ToolChatMessage[] = [
        { role: 'system', content: systemPrompt },
        ...historyMessages,
      ]

      await runToolLoop(ctx, conversationMessages, toolsForAI, processor, enabledSkills)
    } else {
      await runSimpleStream(ctx, historyMessages, processor)
    }

    // Stream complete
    processor.finalize()
    const updatedSession = store.getSession(ctx.sessionId)
    ctx.sender.send(IPC_CHANNELS.STREAM_COMPLETE, {
      messageId: ctx.assistantMessageId,
      sessionId: ctx.sessionId,
      sessionName: updatedSession?.name || sessionName,
    })
    console.log('[Backend] Streaming complete')

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
      ctx.sender.send(IPC_CHANNELS.STREAM_ERROR, {
        messageId: ctx.assistantMessageId,
        sessionId: ctx.sessionId,
        error: error.message || 'Streaming error',
        errorDetails: extractErrorDetails(error),
      })
    }
  }
}

// ============================================
// End of Shared Streaming Infrastructure
// ============================================

export function registerChatHandlers() {
  // 发送消息（非流式）
  ipcMain.handle(IPC_CHANNELS.SEND_MESSAGE, async (_event, { sessionId, message }) => {
    return handleSendMessage(sessionId, message)
  })

  // 发送消息（流式）- 使用事件发射器
  ipcMain.handle(IPC_CHANNELS.SEND_MESSAGE_STREAM, async (event, { sessionId, message }) => {
    return handleSendMessageStream(event.sender, sessionId, message)
  })

  // 获取聊天历史
  ipcMain.handle(IPC_CHANNELS.GET_CHAT_HISTORY, async (_event, { sessionId }) => {
    const session = store.getSession(sessionId)
    if (!session) {
      return { success: false, error: 'Session not found' }
    }
    return { success: true, messages: session.messages }
  })

  // 编辑消息并重新发送
  ipcMain.handle(IPC_CHANNELS.EDIT_AND_RESEND, async (_event, { sessionId, messageId, newContent }) => {
    return handleEditAndResend(sessionId, messageId, newContent)
  })

  // 编辑消息并重新发送（流式）
  ipcMain.handle(IPC_CHANNELS.EDIT_AND_RESEND_STREAM, async (event, { sessionId, messageId, newContent }) => {
    return handleEditAndResendStream(event.sender, sessionId, messageId, newContent)
  })

  // 生成聊天标题
  ipcMain.handle(IPC_CHANNELS.GENERATE_TITLE, async (_event, { message }) => {
    return handleGenerateTitle(message)
  })

  // 更新消息的 contentParts
  ipcMain.handle(IPC_CHANNELS.UPDATE_CONTENT_PARTS, async (_event, { sessionId, messageId, contentParts }) => {
    const updated = store.updateMessageContentParts(sessionId, messageId, contentParts)
    return { success: updated }
  })

  // 更新消息的 thinkingTime（用于持久化thinking时长）
  ipcMain.handle(IPC_CHANNELS.UPDATE_MESSAGE_THINKING_TIME, async (_event, { sessionId, messageId, thinkingTime }) => {
    const updated = store.updateMessageThinkingTime(sessionId, messageId, thinkingTime)
    return { success: updated }
  })

  // 中止当前流式请求 (支持指定 sessionId)
  ipcMain.handle(IPC_CHANNELS.ABORT_STREAM, async (_event, { sessionId } = {}) => {
    if (sessionId) {
      // Abort specific session's stream
      const controller = activeStreams.get(sessionId)
      if (controller) {
        console.log(`[Backend] Aborting stream for session: ${sessionId}`)
        controller.abort()
        activeStreams.delete(sessionId)
        return { success: true }
      }
      return { success: false, error: 'No active stream for this session' }
    } else {
      // Abort all streams (backwards compatibility)
      if (activeStreams.size > 0) {
        console.log(`[Backend] Aborting all active streams (${activeStreams.size})`)
        for (const [sid, controller] of activeStreams) {
          controller.abort()
        }
        activeStreams.clear()
        return { success: true }
      }
      return { success: false, error: 'No active streams to abort' }
    }
  })

  // Get active streaming sessions
  ipcMain.handle(IPC_CHANNELS.GET_ACTIVE_STREAMS, async () => {
    return {
      success: true,
      sessionIds: Array.from(activeStreams.keys())
    }
  })
}

// Edit a user message and resend to get new AI response
async function handleEditAndResend(sessionId: string, messageId: string, newContent: string) {
  try {
    // Update the message and truncate messages after it
    const updated = store.updateMessageAndTruncate(sessionId, messageId, newContent)
    if (!updated) {
      return { success: false, error: 'Message not found' }
    }

    // Get settings and call AI
    const settings = store.getSettings()
    const providerId = settings.ai.provider
    const providerConfig = getProviderConfig(settings)

    if (!providerConfig || !providerConfig.apiKey) {
      return {
        success: false,
        error: 'API Key not configured. Please configure your AI settings.',
      }
    }

    if (!isProviderSupported(providerId)) {
      return {
        success: false,
        error: `Unsupported provider: ${providerId}`,
      }
    }

    // Get the updated session with truncated messages to build history
    const session = store.getSession(sessionId)
    const historyMessages = buildHistoryMessages(session?.messages || [])

    // Use AI SDK to generate response
    const apiType = getProviderApiType(settings, providerId)
    const response = await generateChatResponseWithReasoning(
      providerId,
      {
        apiKey: providerConfig.apiKey,
        baseUrl: providerConfig.baseUrl,
        model: providerConfig.model,
        apiType,
      },
      historyMessages,
      { temperature: settings.ai.temperature }
    )

    const assistantMessage: ChatMessage = {
      id: uuidv4(),
      role: 'assistant',
      model: providerConfig.model,
      content: response.text,
      timestamp: Date.now(),
      reasoning: response.reasoning,
    }

    // Save assistant message
    store.addMessage(sessionId, assistantMessage)

    return {
      success: true,
      assistantMessage,
    }
  } catch (error: any) {
    console.error('Error editing and resending message:', error)
    return {
      success: false,
      error: error.message || 'Failed to edit and resend message',
      errorDetails: extractErrorDetails(error),
    }
  }
}

// Handle streaming edit and resend (similar to handleSendMessageStream but for edits)
async function handleEditAndResendStream(sender: Electron.WebContents, sessionId: string, messageId: string, newContent: string) {
  try {
    // Update the message and truncate messages after it
    const updated = store.updateMessageAndTruncate(sessionId, messageId, newContent)
    if (!updated) {
      return { success: false, error: 'Message not found' }
    }

    // Get settings and validate
    const settings = store.getSettings()
    const providerId = settings.ai.provider
    const providerConfig = getProviderConfig(settings)

    if (!providerConfig || !providerConfig.apiKey) {
      return {
        success: false,
        error: 'API Key not configured. Please configure your AI settings.',
      }
    }

    if (!isProviderSupported(providerId)) {
      return {
        success: false,
        error: `Unsupported provider: ${providerId}`,
      }
    }

    // Create assistant message
    const assistantMessageId = uuidv4()
    const assistantMessage: ChatMessage = {
      id: assistantMessageId,
      role: 'assistant',
      model: providerConfig.model,
      content: '',
      timestamp: Date.now(),
      isStreaming: true,
      thinkingStartTime: Date.now(),
      toolCalls: [],
    }
    store.addMessage(sessionId, assistantMessage)

    // Get session and build history
    const session = store.getSession(sessionId)
    const historyMessages = buildHistoryMessages(session?.messages || [])

    const initialResponse = {
      success: true,
      messageId: assistantMessageId,
      sessionName: session?.name,
    }

    // Start streaming in background using shared infrastructure
    process.nextTick(async () => {
      const abortController = new AbortController()
      activeStreams.set(sessionId, abortController)

      const ctx: StreamContext = {
        sender,
        sessionId,
        assistantMessageId,
        abortSignal: abortController.signal,
        settings,
        providerConfig,
        providerId,
        toolSettings: settings.tools,
      }

      try {
        await executeStreamGeneration(ctx, historyMessages, session?.name)
      } finally {
        activeStreams.delete(sessionId)
      }
    })

    return initialResponse
  } catch (error: any) {
    console.error('Error in edit and resend stream:', error)
    return {
      success: false,
      error: error.message || 'Failed to edit and resend message',
      errorDetails: extractErrorDetails(error),
    }
  }
}

// Generate a short title from message content
function generateTitleFromMessage(content: string, maxLength: number = 30): string {
  // Remove extra whitespace and newlines
  const cleaned = content.replace(/\s+/g, ' ').trim()

  if (cleaned.length <= maxLength) {
    return cleaned
  }

  // Truncate and add ellipsis
  return cleaned.slice(0, maxLength).trim() + '...'
}

async function handleSendMessage(sessionId: string, messageContent: string) {
  try {
    // Get session to check if this is the first user message
    const session = store.getSession(sessionId)
    const isFirstUserMessage = session && session.messages.filter(m => m.role === 'user').length === 0

    // For branch sessions, check if this is the first NEW user message (after inherited messages)
    const isBranchFirstMessage = session?.parentSessionId && session.messages.length > 0 &&
      !session.messages.some(m => m.role === 'user' && m.timestamp > session.createdAt)

    // Save user message - use same ID format as frontend
    const userMessage: ChatMessage = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: messageContent,
      timestamp: Date.now(),
    }
    console.log('[Backend] Created user message with id:', userMessage.id)

    store.addMessage(sessionId, userMessage)

    // Auto-rename session based on first user message
    if (isFirstUserMessage || isBranchFirstMessage) {
      const newTitle = generateTitleFromMessage(messageContent)
      store.renameSession(sessionId, newTitle)
    }

    // Get settings and call AI
    const settings = store.getSettings()
    const providerId = settings.ai.provider
    const providerConfig = getProviderConfig(settings)

    if (!providerConfig || !providerConfig.apiKey) {
      return {
        success: false,
        error: 'API Key not configured. Please configure your AI settings.',
      }
    }

    if (!isProviderSupported(providerId)) {
      return {
        success: false,
        error: `Unsupported provider: ${providerId}`,
      }
    }

    // Build conversation history from session messages
    const historyMessages = buildHistoryMessages(session?.messages || [])

    // Use AI SDK to generate response
    const apiType = getProviderApiType(settings, providerId)
    const response = await generateChatResponseWithReasoning(
      providerId,
      {
        apiKey: providerConfig.apiKey,
        baseUrl: providerConfig.baseUrl,
        model: providerConfig.model,
        apiType,
      },
      historyMessages,
      { temperature: settings.ai.temperature }
    )

    const assistantMessage: ChatMessage = {
      id: uuidv4(),
      role: 'assistant',
      model: providerConfig.model,
      content: response.text,
      timestamp: Date.now(),
      reasoning: response.reasoning,
    }

    // Save assistant message
    store.addMessage(sessionId, assistantMessage)

    // Get updated session name if it was renamed
    const updatedSession = store.getSession(sessionId)
    const sessionName = updatedSession?.name

    return {
      success: true,
      userMessage,
      assistantMessage,
      sessionName, // Include updated session name for UI update
    }
  } catch (error: any) {
    console.error('Error sending message:', error)
    return {
      success: false,
      error: error.message || 'Failed to send message',
      errorDetails: extractErrorDetails(error),
    }
  }
}

// Generate chat title using AI SDK
async function handleGenerateTitle(userMessage: string) {
  try {
    const settings = store.getSettings()
    const providerId = settings.ai.provider
    const providerConfig = getProviderConfig(settings)

    if (!providerConfig.apiKey || !isProviderSupported(providerId)) {
      // Fallback to simple truncation
      return {
        success: true,
        title: userMessage.slice(0, 30) + (userMessage.length > 30 ? '...' : ''),
      }
    }

    const apiType = getProviderApiType(settings, providerId)
    const title = await generateChatTitle(
      providerId,
      {
        apiKey: providerConfig.apiKey,
        baseUrl: providerConfig.baseUrl,
        model: providerConfig.model,
        apiType,
      },
      userMessage
    )

    return { success: true, title }
  } catch (error: any) {
    console.error('Error generating title:', error)
    // Fallback to simple truncation
    return {
      success: true,
      title: userMessage.slice(0, 30) + (userMessage.length > 30 ? '...' : ''),
    }
  }
}

// Handle streaming message with event emitter
async function handleSendMessageStream(sender: Electron.WebContents, sessionId: string, messageContent: string) {
  try {
    // Get session to check if this is the first user message
    const session = store.getSession(sessionId)
    const isFirstUserMessage = session && session.messages.filter(m => m.role === 'user').length === 0

    // For branch sessions, check if this is the first NEW user message (after inherited messages)
    const isBranchFirstMessage = session?.parentSessionId && session.messages.length > 0 &&
      !session.messages.some(m => m.role === 'user' && m.timestamp > session.createdAt)

    // Save user message
    const userMessage: ChatMessage = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: messageContent,
      timestamp: Date.now(),
    }
    console.log('[Backend] Created user message with id:', userMessage.id)
    store.addMessage(sessionId, userMessage)

    // Auto-rename session based on first user message
    if (isFirstUserMessage || isBranchFirstMessage) {
      const newTitle = generateTitleFromMessage(messageContent)
      store.renameSession(sessionId, newTitle)
    }

    // Get settings and validate
    const settings = store.getSettings()
    const providerId = settings.ai.provider
    const providerConfig = getProviderConfig(settings)

    if (!providerConfig || !providerConfig.apiKey) {
      return {
        success: false,
        error: 'API Key not configured. Please configure your AI settings.',
      }
    }

    if (!isProviderSupported(providerId)) {
      return {
        success: false,
        error: `Unsupported provider: ${providerId}`,
      }
    }

    // Create assistant message
    const assistantMessageId = uuidv4()
    const assistantMessage: ChatMessage = {
      id: assistantMessageId,
      role: 'assistant',
      model: providerConfig.model,
      content: '',
      timestamp: Date.now(),
      isStreaming: true,
      thinkingStartTime: Date.now(),
      toolCalls: [],
    }
    store.addMessage(sessionId, assistantMessage)

    const initialResponse = {
      success: true,
      userMessage,
      messageId: assistantMessageId,
      sessionName: session?.name,
    }

    // Start streaming in background using shared infrastructure
    process.nextTick(async () => {
      const abortController = new AbortController()
      activeStreams.set(sessionId, abortController)

      // Build history from updated session (includes user message)
      const sessionForHistory = store.getSession(sessionId)
      const historyMessages = buildHistoryMessages(sessionForHistory?.messages || [])

      const ctx: StreamContext = {
        sender,
        sessionId,
        assistantMessageId,
        abortSignal: abortController.signal,
        settings,
        providerConfig,
        providerId,
        toolSettings: settings.tools,
      }

      try {
        await executeStreamGeneration(ctx, historyMessages, session?.name)
      } finally {
        activeStreams.delete(sessionId)
      }
    })

    return initialResponse

  } catch (error: any) {
    console.error('Error starting stream:', error)
    return {
      success: false,
      error: error.message || 'Failed to start streaming',
      errorDetails: extractErrorDetails(error),
    }
  }
}
