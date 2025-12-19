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
import { getMCPToolsForAI, isMCPTool, executeMCPTool } from '../mcp/index.js'

// Store active AbortController for stream cancellation
let activeStreamAbortController: AbortController | null = null

// System prompt to control tool usage behavior
const TOOL_BEHAVIOR_SYSTEM_PROMPT = `You are a helpful assistant. You have access to tools, but you should ONLY use them when the user's request specifically requires their functionality.

Important guidelines:
- DO NOT mention your available tools or capabilities unless the user explicitly asks what you can do
- DO NOT offer to use tools proactively - wait for the user to make a request that requires them
- For casual conversation (greetings, general questions, etc.), respond naturally without referring to tools
- Only call a tool when the user's message clearly requires that tool's specific functionality
- If unsure whether a tool is needed, prefer responding conversationally first`

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

  // 中止当前流式请求
  ipcMain.handle(IPC_CHANNELS.ABORT_STREAM, async () => {
    if (activeStreamAbortController) {
      console.log('[Backend] Aborting active stream')
      activeStreamAbortController.abort()
      activeStreamAbortController = null
      return { success: true }
    }
    return { success: false, error: 'No active stream to abort' }
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
    const historyMessages = session?.messages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })) || []

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

    // Get settings and call AI
    const settings = store.getSettings()
    const providerId = settings.ai.provider
    const providerConfig = getProviderConfig(settings)
    const toolSettings = settings.tools

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

    // Create assistant message with empty content initially
    const assistantMessageId = uuidv4()
    const assistantMessage: ChatMessage = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      isStreaming: true,
      toolCalls: [],
    }

    // Add empty assistant message to store
    store.addMessage(sessionId, assistantMessage)

    // Get the updated session with truncated messages
    const session = store.getSession(sessionId)

    // Send initial response with message ID
    const initialResponse = {
      success: true,
      messageId: assistantMessageId,
      sessionName: session?.name,
    }

    // Start streaming in background
    process.nextTick(async () => {
      try {
        console.log('[Backend] Starting streaming for edit-resend, message:', assistantMessageId)

        // Get enabled tools if tool calls are enabled
        const enabledTools = toolSettings?.enableToolCalls ? getEnabledTools() : []
        const mcpTools = toolSettings?.enableToolCalls ? getMCPToolsForAI() : {}
        const mcpToolCount = Object.keys(mcpTools).length
        const hasTools = enabledTools.length > 0 || mcpToolCount > 0

        const apiType = getProviderApiType(settings, providerId)

        let accumulatedContent = ''
        let accumulatedReasoning = ''
        const toolCalls: ToolCall[] = []

        // Build conversation messages from session history
        const historyMessages = session?.messages
          .filter(m => m.role === 'user' || m.role === 'assistant')
          .map(m => ({
            role: m.role as 'user' | 'assistant',
            content: m.content,
          })) || []

        if (hasTools) {
          const builtinToolsForAI = convertToolDefinitionsForAI(enabledTools)
          const toolsForAI = { ...builtinToolsForAI, ...mcpTools }

          const MAX_TOOL_TURNS = 5
          let currentTurn = 0

          const conversationMessages: ToolChatMessage[] = [
            { role: 'system', content: TOOL_BEHAVIOR_SYSTEM_PROMPT },
            ...historyMessages,
          ]

          while (currentTurn < MAX_TOOL_TURNS) {
            currentTurn++
            const toolCallsThisTurn: ToolCall[] = []
            let turnContent = ''
            let turnReasoning = ''

            const stream = streamChatResponseWithTools(
              providerId,
              {
                apiKey: providerConfig.apiKey,
                baseUrl: providerConfig.baseUrl,
                model: providerConfig.model,
                apiType,
              },
              conversationMessages,
              toolsForAI,
              { temperature: settings.ai.temperature }
            )

            for await (const chunk of stream) {
              if (chunk.type === 'text' && chunk.text) {
                accumulatedContent += chunk.text
                turnContent += chunk.text
                store.updateMessageContent(sessionId, assistantMessageId, accumulatedContent)
                sender.send(IPC_CHANNELS.STREAM_CHUNK, {
                  type: 'text',
                  content: chunk.text,
                  messageId: assistantMessageId,
                })
              }

              if (chunk.type === 'reasoning' && chunk.reasoning) {
                accumulatedReasoning += chunk.reasoning
                turnReasoning += chunk.reasoning
                store.updateMessageReasoning(sessionId, assistantMessageId, accumulatedReasoning)
                sender.send(IPC_CHANNELS.STREAM_CHUNK, {
                  type: 'reasoning',
                  content: '',
                  messageId: assistantMessageId,
                  reasoning: chunk.reasoning,
                })
              }

              if (chunk.type === 'tool-call' && chunk.toolCall) {
                const toolCall = createToolCall(
                  chunk.toolCall.toolName,
                  chunk.toolCall.toolName,
                  chunk.toolCall.args
                )
                toolCall.id = chunk.toolCall.toolCallId
                toolCalls.push(toolCall)
                toolCallsThisTurn.push(toolCall)

                store.updateMessageToolCalls(sessionId, assistantMessageId, toolCalls)
                sender.send(IPC_CHANNELS.STREAM_CHUNK, {
                  type: 'tool_call',
                  content: '',
                  messageId: assistantMessageId,
                  toolCall,
                })

                const shouldAutoExecute = isMCPTool(chunk.toolCall.toolName) || canAutoExecute(chunk.toolCall.toolName, toolSettings?.tools)

                if (shouldAutoExecute) {
                  toolCall.status = 'executing'
                  store.updateMessageToolCalls(sessionId, assistantMessageId, toolCalls)

                  let result: { success: boolean; data?: any; error?: string }

                  if (isMCPTool(chunk.toolCall.toolName)) {
                    const mcpResult = await executeMCPTool(chunk.toolCall.toolName, chunk.toolCall.args)
                    result = {
                      success: mcpResult.success,
                      data: mcpResult.content,
                      error: mcpResult.error,
                    }
                  } else {
                    result = await executeTool(
                      chunk.toolCall.toolName,
                      chunk.toolCall.args,
                      { sessionId, messageId: assistantMessageId }
                    )
                  }

                  toolCall.status = result.success ? 'completed' : 'failed'
                  toolCall.result = result.data
                  toolCall.error = result.error
                  store.updateMessageToolCalls(sessionId, assistantMessageId, toolCalls)

                  sender.send(IPC_CHANNELS.STREAM_CHUNK, {
                    type: 'tool_result',
                    content: '',
                    messageId: assistantMessageId,
                    toolCall,
                  })
                }
              }
            }

            if (toolCallsThisTurn.length === 0) break

            const allExecuted = toolCallsThisTurn.every(tc => tc.status === 'completed' || tc.status === 'failed')
            if (!allExecuted) break

            const assistantMsg: {
              role: 'assistant'
              content: string
              toolCalls: Array<{ toolCallId: string; toolName: string; args: Record<string, any> }>
              reasoningContent?: string
            } = {
              role: 'assistant' as const,
              content: turnContent,
              toolCalls: toolCallsThisTurn.map(tc => ({
                toolCallId: tc.id,
                toolName: tc.toolName,
                args: tc.arguments,
              })),
            }
            if (turnReasoning) {
              assistantMsg.reasoningContent = turnReasoning
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

            sender.send(IPC_CHANNELS.STREAM_CHUNK, {
              type: 'continuation',
              content: '',
              messageId: assistantMessageId,
            })
          }
        } else {
          // No tools, simple streaming
          const stream = streamChatResponseWithReasoning(
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

          for await (const chunk of stream) {
            if (chunk.text) {
              accumulatedContent += chunk.text
              store.updateMessageContent(sessionId, assistantMessageId, accumulatedContent)
              sender.send(IPC_CHANNELS.STREAM_CHUNK, {
                type: 'text',
                content: chunk.text,
                messageId: assistantMessageId,
              })
            }

            if (chunk.reasoning) {
              accumulatedReasoning += chunk.reasoning
              store.updateMessageReasoning(sessionId, assistantMessageId, accumulatedReasoning)
              sender.send(IPC_CHANNELS.STREAM_CHUNK, {
                type: 'reasoning',
                content: '',
                messageId: assistantMessageId,
                reasoning: chunk.reasoning,
              })
            }
          }
        }

        // Mark as complete
        store.updateMessageStreaming(sessionId, assistantMessageId, false)
        sender.send(IPC_CHANNELS.STREAM_COMPLETE, {
          messageId: assistantMessageId,
          sessionName: session?.name,
        })
      } catch (error: any) {
        console.error('[Backend] Streaming error:', error)
        sender.send(IPC_CHANNELS.STREAM_ERROR, {
          messageId: assistantMessageId,
          error: error.message || 'Streaming error',
          errorDetails: extractErrorDetails(error),
        })
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
    const historyMessages = session?.messages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })) || []

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
    const toolSettings = settings.tools

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

    // Create assistant message with empty content initially
    const assistantMessageId = uuidv4()
    const assistantMessage: ChatMessage = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      isStreaming: true,
      toolCalls: [],
    }

    // Add empty assistant message to store
    store.addMessage(sessionId, assistantMessage)

    // Send initial response with message ID and user message
    const initialResponse = {
      success: true,
      userMessage,
      messageId: assistantMessageId,
      sessionName: session?.name,
    }

    // Start streaming in background - use process.nextTick to ensure frontend listeners are set up
    process.nextTick(async () => {
      // Create abort controller for this stream
      activeStreamAbortController = new AbortController()
      const abortSignal = activeStreamAbortController.signal

      try {
        console.log('[Backend] Starting streaming for message:', assistantMessageId)
        console.log('[Backend] Provider:', providerId, 'Model:', providerConfig.model)

        // Get enabled tools if tool calls are enabled
        const enabledTools = toolSettings?.enableToolCalls ? getEnabledTools() : []

        // Get MCP tools (already in AI SDK format)
        const mcpTools = toolSettings?.enableToolCalls ? getMCPToolsForAI() : {}
        const mcpToolCount = Object.keys(mcpTools).length

        const hasTools = enabledTools.length > 0 || mcpToolCount > 0

        console.log(`[Backend] Tools enabled: ${hasTools}, Built-in tools: ${enabledTools.length}, MCP tools: ${mcpToolCount}`)

        // Use AI SDK to generate streaming response
        const apiType = getProviderApiType(settings, providerId)

        // Build conversation history from session messages (including the just-added user message)
        const sessionForHistory = store.getSession(sessionId)
        const historyMessages = sessionForHistory?.messages
          .filter(m => m.role === 'user' || m.role === 'assistant')
          .map(m => ({
            role: m.role as 'user' | 'assistant',
            content: m.content,
          })) || []

        let accumulatedContent = ''
        let accumulatedReasoning = ''
        let chunkCount = 0
        const toolCalls: ToolCall[] = []

        if (hasTools) {
          // Use tool-enabled streaming with auto-continue after tool execution
          // Combine built-in tools and MCP tools
          const builtinToolsForAI = convertToolDefinitionsForAI(enabledTools)
          const toolsForAI = { ...builtinToolsForAI, ...mcpTools }

          // Maximum number of tool turns to prevent infinite loops
          const MAX_TOOL_TURNS = 100
          let currentTurn = 0

          // Build conversation messages (will be extended with tool results)
          // Include system prompt and full conversation history
          const conversationMessages: ToolChatMessage[] = [
            { role: 'system', content: TOOL_BEHAVIOR_SYSTEM_PROMPT },
            ...historyMessages,
          ]

          // Loop until no more tool calls or max turns reached
          while (currentTurn < MAX_TOOL_TURNS) {
            currentTurn++
            const toolCallsThisTurn: ToolCall[] = []
            let turnContent = ''
            let turnReasoning = ''  // Track reasoning content for this turn (needed for DeepSeek Reasoner)

            console.log(`[Backend] Starting tool turn ${currentTurn}`)

            const stream = streamChatResponseWithTools(
              providerId,
              {
                apiKey: providerConfig.apiKey,
                baseUrl: providerConfig.baseUrl,
                model: providerConfig.model,
                apiType,
              },
              conversationMessages,
              toolsForAI,
              { temperature: settings.ai.temperature, abortSignal }
            )

            // Process stream chunks with tool support
            for await (const chunk of stream) {
              chunkCount++

              if (chunk.type === 'text' && chunk.text) {
                accumulatedContent += chunk.text
                turnContent += chunk.text
                console.log(`[Backend] Text chunk ${chunkCount}:`, chunk.text.substring(0, 50) + (chunk.text.length > 50 ? '...' : ''))

                // Update message in store with accumulated content
                store.updateMessageContent(sessionId, assistantMessageId, accumulatedContent)

                // Send text chunk via event
                sender.send(IPC_CHANNELS.STREAM_CHUNK, {
                  type: 'text',
                  content: chunk.text,
                  messageId: assistantMessageId,
                })
              }

              if (chunk.type === 'reasoning' && chunk.reasoning) {
                accumulatedReasoning += chunk.reasoning
                turnReasoning += chunk.reasoning  // Also track for this turn (needed for DeepSeek Reasoner continuation)
                console.log(`[Backend] Reasoning chunk ${chunkCount}:`, chunk.reasoning.substring(0, 50) + (chunk.reasoning.length > 50 ? '...' : ''))

                // Update reasoning in store
                store.updateMessageReasoning(sessionId, assistantMessageId, accumulatedReasoning)

                // Send reasoning chunk via event
                sender.send(IPC_CHANNELS.STREAM_CHUNK, {
                  type: 'reasoning',
                  content: '',
                  messageId: assistantMessageId,
                  reasoning: chunk.reasoning,
                })
              }

              if (chunk.type === 'tool-call' && chunk.toolCall) {
                console.log(`[Backend] Tool call chunk:`, chunk.toolCall)

                // Create a ToolCall object
                const toolCall = createToolCall(
                  chunk.toolCall.toolName,
                  chunk.toolCall.toolName,
                  chunk.toolCall.args
                )
                toolCall.id = chunk.toolCall.toolCallId // Use the ID from AI SDK
                toolCalls.push(toolCall)
                toolCallsThisTurn.push(toolCall)

                // Update message with tool calls
                store.updateMessageToolCalls(sessionId, assistantMessageId, toolCalls)

                // Send tool call event
                sender.send(IPC_CHANNELS.STREAM_CHUNK, {
                  type: 'tool_call',
                  content: '',
                  messageId: assistantMessageId,
                  toolCall,
                })

                // Check if we should auto-execute this tool
                // For MCP tools, always auto-execute (they are external tools)
                const shouldAutoExecute = isMCPTool(chunk.toolCall.toolName) || canAutoExecute(chunk.toolCall.toolName, toolSettings?.tools)

                if (shouldAutoExecute) {
                  console.log(`[Backend] Auto-executing tool: ${chunk.toolCall.toolName}`)

                  // Update tool status to executing
                  toolCall.status = 'executing'
                  store.updateMessageToolCalls(sessionId, assistantMessageId, toolCalls)

                  let result: { success: boolean; data?: any; error?: string }

                  // Execute the tool (MCP or built-in)
                  if (isMCPTool(chunk.toolCall.toolName)) {
                    // Execute MCP tool
                    const mcpResult = await executeMCPTool(chunk.toolCall.toolName, chunk.toolCall.args)
                    result = {
                      success: mcpResult.success,
                      data: mcpResult.content,
                      error: mcpResult.error,
                    }
                  } else {
                    // Execute built-in tool
                    result = await executeTool(
                      chunk.toolCall.toolName,
                      chunk.toolCall.args,
                      { sessionId, messageId: assistantMessageId }
                    )
                  }

                  // Update tool with result
                  toolCall.status = result.success ? 'completed' : 'failed'
                  toolCall.result = result.data
                  toolCall.error = result.error
                  store.updateMessageToolCalls(sessionId, assistantMessageId, toolCalls)

                  // Send tool result event
                  sender.send(IPC_CHANNELS.STREAM_CHUNK, {
                    type: 'tool_result',
                    content: '',
                    messageId: assistantMessageId,
                    toolCall,
                  })
                }
              }
            }

            // If no tool calls this turn, we're done
            if (toolCallsThisTurn.length === 0) {
              console.log(`[Backend] No tool calls in turn ${currentTurn}, ending loop`)
              break
            }

            // Check if all tools were auto-executed
            const allExecuted = toolCallsThisTurn.every(tc => tc.status === 'completed' || tc.status === 'failed')
            if (!allExecuted) {
              console.log(`[Backend] Not all tools auto-executed, ending loop`)
              break
            }

            // Build continuation messages with tool results
            console.log(`[Backend] Building continuation with ${toolCallsThisTurn.length} tool results`)
            console.log(`[Backend] Turn content length: ${turnContent.length}`)
            console.log(`[Backend] Turn reasoning length: ${turnReasoning.length}`)

            // Add assistant message with tool calls (include reasoningContent for DeepSeek Reasoner)
            const assistantMsg: {
              role: 'assistant'
              content: string
              toolCalls: Array<{ toolCallId: string; toolName: string; args: Record<string, any> }>
              reasoningContent?: string
            } = {
              role: 'assistant' as const,
              content: turnContent,
              toolCalls: toolCallsThisTurn.map(tc => ({
                toolCallId: tc.id,
                toolName: tc.toolName,
                args: tc.arguments,
              })),
            }
            // Include reasoning content if present (required for DeepSeek Reasoner tool calls)
            if (turnReasoning) {
              assistantMsg.reasoningContent = turnReasoning
            }
            console.log(`[Backend] Assistant message:`, JSON.stringify(assistantMsg, null, 2))
            conversationMessages.push(assistantMsg)

            // Add tool result message
            const toolResultMsg = {
              role: 'tool' as const,
              content: toolCallsThisTurn.map(tc => ({
                type: 'tool-result' as const,
                toolCallId: tc.id,
                toolName: tc.toolName,
                result: tc.status === 'completed' ? tc.result : { error: tc.error },
              })),
            }
            console.log(`[Backend] Tool result message:`, JSON.stringify(toolResultMsg, null, 2))
            conversationMessages.push(toolResultMsg)

            console.log(`[Backend] Total messages in conversation: ${conversationMessages.length}`)

            // Notify frontend that AI is continuing
            sender.send(IPC_CHANNELS.STREAM_CHUNK, {
              type: 'continuation',
              content: '',
              messageId: assistantMessageId,
            })

            console.log(`[Backend] Continuing to next turn...`)
          }

          if (currentTurn >= MAX_TOOL_TURNS) {
            console.log(`[Backend] Reached max tool turns (${MAX_TOOL_TURNS})`)
          }
        } else {
          // Use regular streaming without tools
          const stream = streamChatResponseWithReasoning(
            providerId,
            {
              apiKey: providerConfig.apiKey,
              baseUrl: providerConfig.baseUrl,
              model: providerConfig.model,
              apiType,
            },
            historyMessages,
            { temperature: settings.ai.temperature, abortSignal }
          )

          // Process stream chunks
          for await (const chunk of stream) {
            chunkCount++
            if (chunk.text) {
              accumulatedContent += chunk.text
              console.log(`[Backend] Text chunk ${chunkCount}:`, chunk.text.substring(0, 50) + (chunk.text.length > 50 ? '...' : ''))

              // Update message in store with accumulated content
              store.updateMessageContent(sessionId, assistantMessageId, accumulatedContent)

              // Send text chunk via event
              sender.send(IPC_CHANNELS.STREAM_CHUNK, {
                type: 'text',
                content: chunk.text,
                messageId: assistantMessageId,
              })
            }

            if (chunk.reasoning) {
              accumulatedReasoning = chunk.reasoning
              console.log(`[Backend] Reasoning chunk ${chunkCount}:`, chunk.reasoning.substring(0, 50) + (chunk.reasoning.length > 50 ? '...' : ''))

              // Update reasoning in store
              store.updateMessageReasoning(sessionId, assistantMessageId, accumulatedReasoning)

              // Send reasoning chunk via event
              sender.send(IPC_CHANNELS.STREAM_CHUNK, {
                type: 'reasoning',
                content: '',
                messageId: assistantMessageId,
                reasoning: chunk.reasoning,
              })
            }
          }
        }

        console.log(`[Backend] Streaming complete. Total chunks: ${chunkCount}, Final content length: ${accumulatedContent.length}`)

        // Stream complete - finalize message
        store.updateMessageStreaming(sessionId, assistantMessageId, false)

        // Get updated session name if it was renamed
        const updatedSession = store.getSession(sessionId)
        const sessionName = updatedSession?.name

        // Send completion event
        sender.send(IPC_CHANNELS.STREAM_COMPLETE, {
          messageId: assistantMessageId,
          sessionName,
        })
        console.log('[Backend] Sent completion event')

      } catch (error: any) {
        // Check if this is an abort error
        const isAborted = error.name === 'AbortError' || abortSignal.aborted

        if (isAborted) {
          console.log('[Backend] Stream aborted by user')

          // Finalize the message with current content (mark as stopped)
          store.updateMessageStreaming(sessionId, assistantMessageId, false)

          // Send completion event (not error) to gracefully end the stream
          sender.send(IPC_CHANNELS.STREAM_COMPLETE, {
            messageId: assistantMessageId,
            sessionName: store.getSession(sessionId)?.name,
            aborted: true,
          })
        } else {
          console.error('[Backend] Error in streaming background task:', error)

          // Send error event
          sender.send(IPC_CHANNELS.STREAM_ERROR, {
            messageId: assistantMessageId,
            error: error.message || 'Failed to stream message',
            errorDetails: extractErrorDetails(error),
          })
          console.log('[Backend] Sent error event')
        }
      } finally {
        // Clear the active abort controller
        activeStreamAbortController = null
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
