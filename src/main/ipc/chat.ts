import { ipcMain, BrowserWindow } from 'electron'
import * as store from '../store.js'
import type { ChatMessage, AppSettings, ProviderConfig, CustomProviderConfig, UserFact, AgentUserRelationship, AgentMood, AgentMemory, Step, StepType, ContentPart } from '../../shared/ipc.js'
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
import { getStorage } from '../storage/index.js'
import { triggerManager, type TriggerContext } from '../services/triggers/index.js'
import { memoryExtractionTrigger } from '../services/triggers/memory-extraction.js'
import { contextCompactingTrigger } from '../services/triggers/context-compacting.js'
import type { ToolExecutionContext, ToolExecutionResult } from '../tools/types.js'
import { getTool } from '../tools/index.js'

// Register triggers on module load
triggerManager.register(memoryExtractionTrigger)
triggerManager.register(contextCompactingTrigger)

// Helper function to format user profile into a readable prompt
function formatUserProfilePrompt(facts: UserFact[]): string | undefined {
  if (!facts || facts.length === 0) return undefined

  const sections: string[] = []

  const groupedFacts: Record<string, UserFact[]> = {
    personal: [],
    preference: [],
    goal: [],
    trait: [],
  }

  for (const fact of facts) {
    groupedFacts[fact.category].push(fact)
  }

  if (groupedFacts.personal.length > 0) {
    sections.push(`## 关于用户\n${groupedFacts.personal.map(f => `- ${f.content}`).join('\n')}`)
  }

  if (groupedFacts.preference.length > 0) {
    sections.push(`## 用户偏好\n${groupedFacts.preference.map(f => `- ${f.content}`).join('\n')}`)
  }

  if (groupedFacts.goal.length > 0) {
    sections.push(`## 用户目标\n${groupedFacts.goal.map(f => `- ${f.content}`).join('\n')}`)
  }

  if (groupedFacts.trait.length > 0) {
    sections.push(`## 用户特点\n${groupedFacts.trait.map(f => `- ${f.content}`).join('\n')}`)
  }

  return sections.length > 0 ? sections.join('\n\n') : undefined
}

/**
 * Retrieve relevant user facts based on conversation context using embedding similarity
 * Instead of loading all facts, only retrieve facts relevant to the current conversation
 */
async function retrieveRelevantFacts(
  storage: any,
  userMessage: string,
  limit = 10,
  minSimilarity = 0.3
): Promise<UserFact[]> {
  const messagePreview = userMessage.length > 50 ? userMessage.slice(0, 50) + '...' : userMessage
  console.log(`[Chat] Retrieving relevant facts for: "${messagePreview}"`)

  try {
    // Use semantic search to find relevant facts
    const relevantFacts = await storage.userProfile.searchFacts(userMessage)
    console.log(`[Chat] Found ${relevantFacts.length} relevant facts via semantic search`)
    return relevantFacts.slice(0, limit)
  } catch (error) {
    console.warn('[Chat] Failed to retrieve relevant facts, falling back to all facts:', error)
    // Fallback: return all facts if semantic search fails
    const profile = await storage.userProfile.getProfile()
    console.log(`[Chat] Fallback: returning all ${profile.facts.length} facts`)
    return profile.facts.slice(0, limit)
  }
}

// Helper function to format agent memories into a readable prompt
function formatAgentMemoryPrompt(relationship: AgentUserRelationship): string | undefined {
  if (!relationship) return undefined

  const sections: string[] = []
  const rel = relationship.relationship

  // Relationship context
  sections.push(`## 与用户的关系
- 信任度: ${rel.trustLevel}/100
- 熟悉度: ${rel.familiarity}/100
- 总互动次数: ${rel.totalInteractions}`)

  // Current mood
  const moodMap: Record<AgentMood, string> = {
    happy: '开心',
    neutral: '平静',
    concerned: '担忧',
    excited: '兴奋',
  }
  const mood = relationship.agentFeelings
  sections.push(`## 当前状态
- 心情: ${moodMap[mood.currentMood]}${mood.notes ? `\n- 备注: ${mood.notes}` : ''}`)

  // Active memories (filter by strength > 10, sort by strength, top 5)
  const activeMemories = relationship.observations
    .filter(m => m.strength > 10)
    .sort((a, b) => b.strength - a.strength)
    .slice(0, 5)

  if (activeMemories.length > 0) {
    const memoryLines = activeMemories.map(m => {
      const vividnessEmoji: Record<string, string> = {
        vivid: '🌟',
        clear: '💭',
        hazy: '🌫️',
        fragment: '❓',
      }
      return `- ${vividnessEmoji[m.vividness] || '💭'} ${m.content}`
    })
    sections.push(`## 关于用户的记忆\n${memoryLines.join('\n')}`)
  }

  return sections.length > 0 ? sections.join('\n\n') : undefined
}

// Helper function to build history messages from session messages
// Includes reasoningContent for assistant messages (required by DeepSeek Reasoner)
// Filters out streaming messages (empty assistant messages being generated)
// When session has a summary, uses [summary] + [recent messages] to reduce context window usage
function buildHistoryMessages(
  messages: ChatMessage[],
  session?: { summary?: string; summaryUpToMessageId?: string }
): Array<{
  role: 'user' | 'assistant'
  content: string
  reasoningContent?: string
}> {
  // If session has a summary, use it to reduce context
  if (session?.summary && session?.summaryUpToMessageId) {
    const summaryIndex = messages.findIndex(m => m.id === session.summaryUpToMessageId)

    if (summaryIndex !== -1) {
      // Get messages after the summary point
      const recentMessages = messages.slice(summaryIndex + 1)

      // Build the history with summary + recent messages
      const result: Array<{ role: 'user' | 'assistant'; content: string; reasoningContent?: string }> = []

      // Add summary as a "user" message (context injection)
      result.push({
        role: 'user',
        content: `[对话历史摘要]\n${session.summary}\n\n请基于以上历史继续对话。`,
      })

      // Add an acknowledgment from assistant
      result.push({
        role: 'assistant',
        content: '好的，我已了解之前的对话内容。请继续。',
      })

      // Add recent messages
      for (const m of recentMessages) {
        if (m.role !== 'user' && m.role !== 'assistant') continue
        if (m.isStreaming) continue

        const msg: { role: 'user' | 'assistant'; content: string; reasoningContent?: string } = {
          role: m.role as 'user' | 'assistant',
          content: m.content,
        }
        if (m.role === 'assistant' && m.reasoning) {
          msg.reasoningContent = m.reasoning
        }
        result.push(msg)
      }

      console.log(`[buildHistoryMessages] Using summary + ${recentMessages.length} recent messages`)
      return result
    }
  }

  // No summary - use full history
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
const BASE_SYSTEM_PROMPT = `
You are a helpful assistant. You have access to tools, but you should ONLY use them when the user's request specifically requires their functionality.
Important guidelines:
- DO NOT mention your available tools or capabilities unless the user explicitly asks what you can do
- DO NOT offer to use tools proactively - wait for the user to make a request that requires them
- For casual conversation (greetings, general questions, etc.), respond naturally without referring to tools
- Only call a tool when the user's message clearly requires that tool's specific functionality
- If unsure whether a tool is needed, prefer responding conversationally first
### Important
Before calling any tool, briefly explain what you're about to do.
Never start your response with a tool call directly. Always output some text first.
After obtaining the tool results, inform the user of the findings and explain the next steps.
`


/**
 * Build dynamic system prompt with optional skills awareness and workspace character
 */
function buildSystemPrompt(options: {
  hasTools: boolean
  skills: SkillDefinition[]
  workspaceSystemPrompt?: string
  userProfilePrompt?: string
  agentMemoryPrompt?: string
}): string {
  const { hasTools, skills, workspaceSystemPrompt, userProfilePrompt, agentMemoryPrompt } = options
  let prompt = BASE_SYSTEM_PROMPT

  // Prepend workspace/agent system prompt if provided (for character/persona)
  if (workspaceSystemPrompt && workspaceSystemPrompt.trim()) {
    prompt = workspaceSystemPrompt.trim() + '\n\n' + prompt
  }

  // Add user profile information if available
  // Using XML tags and strong emphasis based on best practices research
  if (userProfilePrompt && userProfilePrompt.trim()) {
    prompt += `

# User Memory (MUST USE - DO NOT ASK AGAIN)

<user_facts>
${userProfilePrompt.trim()}
</user_facts>

<memory_instructions>
CRITICAL: The facts above are ALREADY KNOWN. You MUST:
1. Use this information directly when answering related questions
2. NEVER ask for information that is already in <user_facts>
3. Combine related facts in your reasoning
</memory_instructions>`
  }

  // Add agent memory information if available
  // This is the agent's private relationship and memories with this user
  if (agentMemoryPrompt && agentMemoryPrompt.trim()) {
    prompt += '\n\n# Your Relationship and Memories with the User\nThe following is your understanding of the user and the state of your relationship. These are your private memories as a character with memory:\n\n' + agentMemoryPrompt.trim()
  }

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
  // Note: skills are passed separately to runToolLoop/executeToolAndUpdate, not stored here
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
function createStreamProcessor(ctx: StreamContext, initialContent?: { content?: string; reasoning?: string }): StreamProcessor {
  let accumulatedContent = initialContent?.content || ''
  let accumulatedReasoning = initialContent?.reasoning || ''
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
/**
 * Detect if a bash command is reading a skill file and extract skill name
 */
function detectSkillUsage(toolName: string, args: Record<string, any>): string | null {
  if (toolName !== 'bash') return null

  const command = args.command as string
  if (!command) return null

  // Match patterns like: cat ~/.claude/skills/agent-plan/SKILL.md
  // or: cat /Users/xxx/.claude/skills/agent-plan/SKILL.md
  const skillPathMatch = command.match(/(?:cat|less|head|tail|more)\s+.*[/~]\.claude\/skills\/([^/]+)\/SKILL\.md/)
  if (skillPathMatch) {
    return skillPathMatch[1]  // Return skill name (e.g., "agent-plan")
  }

  return null
}

/**
 * Determine step type from tool name and arguments
 */
function getStepType(toolName: string, args: Record<string, any>): StepType {
  if (toolName === 'bash') {
    const command = args.command as string || ''
    // Check if it's reading a skill file
    if (command.match(/(?:cat|less|head|tail|more)\s+.*SKILL\.md/)) {
      return 'skill-read'
    }
    // Check if it's reading a file
    if (command.match(/^(cat|less|head|tail|more)\s+/)) {
      return 'file-read'
    }
    // Check if it's writing a file
    if (command.match(/^(echo|printf|tee)\s+.*>/) || command.match(/^(mv|cp|mkdir|touch|rm)\s+/)) {
      return 'file-write'
    }
    return 'command'
  }

  // MCP tools are treated as tool-call
  return 'tool-call'
}

/**
 * Generate a human-readable step title from tool name and arguments
 */
function generateStepTitle(toolName: string, args: Record<string, any>, skillName?: string | null): string {
  if (skillName) {
    return `查看 ${skillName} 技能文档`
  }

  if (toolName === 'bash') {
    const command = args.command as string || ''
    // Truncate long commands
    const shortCommand = command.length > 40 ? command.slice(0, 40) + '...' : command
    return `执行命令: ${shortCommand}`
  }

  // For MCP tools, show a cleaner name
  if (toolName.includes(':')) {
    const parts = toolName.split(':')
    const shortName = parts[parts.length - 1]
    return `调用工具: ${shortName}`
  }

  return `调用工具: ${toolName}`
}

/**
 * Execute a tool directly without going through Tool Agent LLM
 * This is the new direct execution path for simple tool calls
 */
async function executeToolDirectly(
  toolName: string,
  args: Record<string, any>,
  context: { sessionId: string; messageId: string; abortSignal?: AbortSignal }
): Promise<ToolExecutionResult> {
  try {
    // 1. Check if it's an MCP tool
    if (isMCPTool(toolName)) {
      console.log(`[DirectExec] Executing MCP tool: ${toolName}`)
      const result = await executeMCPTool(toolName, args)
      return { success: true, data: result }
    }

    // 2. Execute built-in tool via registry
    console.log(`[DirectExec] Executing built-in tool: ${toolName}`)
    const execContext: ToolExecutionContext = {
      sessionId: context.sessionId,
      messageId: context.messageId,
      abortSignal: context.abortSignal,
    }
    const result = await executeTool(toolName, args, execContext)
    return result
  } catch (error: any) {
    console.error(`[DirectExec] Tool execution error:`, error)
    return { success: false, error: error.message || 'Unknown error during tool execution' }
  }
}

/**
 * Create a new step object with full tool call information
 */
function createStep(
  toolCall: ToolCall,
  skillName?: string | null,
  turnIndex?: number
): Step {
  return {
    id: uuidv4(),
    type: getStepType(toolCall.toolName, toolCall.arguments),
    title: generateStepTitle(toolCall.toolName, toolCall.arguments, skillName),
    status: 'running',
    timestamp: Date.now(),
    turnIndex,  // Which turn this step belongs to (for interleaving with text)
    toolCallId: toolCall.id,
    toolCall: { ...toolCall },  // Include full tool call details
  }
}

async function executeToolAndUpdate(
  ctx: StreamContext,
  toolCall: ToolCall,
  toolCallData: { toolName: string; args: Record<string, any> },
  allToolCalls: ToolCall[],
  _skills: SkillDefinition[] = [],
  turnIndex?: number
): Promise<void> {
  // Check if this is reading a skill file
  const skillName = detectSkillUsage(toolCallData.toolName, toolCallData.args)
  if (skillName) {
    console.log(`[Backend] Skill activated: ${skillName}`)
    // Update message with skill info
    store.updateMessageSkill(ctx.sessionId, ctx.assistantMessageId, skillName)
    // Notify frontend
    ctx.sender.send(IPC_CHANNELS.SKILL_ACTIVATED, {
      sessionId: ctx.sessionId,
      messageId: ctx.assistantMessageId,
      skillName,
    })
  }

  // Create step for UI with turnIndex
  const step = createStep(toolCall, skillName, turnIndex)
  store.addMessageStep(ctx.sessionId, ctx.assistantMessageId, step)
  ctx.sender.send(IPC_CHANNELS.STEP_ADDED, {
    sessionId: ctx.sessionId,
    messageId: ctx.assistantMessageId,
    step,
  })

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

  // Execute tool directly (no LLM overhead)
  result = await executeToolDirectly(
    toolCallData.toolName,
    toolCallData.args,
    {
      sessionId: ctx.sessionId,
      messageId: ctx.assistantMessageId,
      abortSignal: ctx.abortSignal,
    }
  )

  toolCall.endTime = Date.now()

  if (result.requiresConfirmation) {
    toolCall.status = 'pending'
    toolCall.requiresConfirmation = true
    toolCall.commandType = result.commandType
    toolCall.error = result.error
    // Update step to awaiting-confirmation (waiting for user confirmation)
    const stepUpdates: Partial<Step> = {
      status: 'awaiting-confirmation',
      toolCall: { ...toolCall },  // Update toolCall with confirmation info
    }
    store.updateMessageStep(ctx.sessionId, ctx.assistantMessageId, step.id, stepUpdates)
    ctx.sender.send(IPC_CHANNELS.STEP_UPDATED, {
      sessionId: ctx.sessionId,
      messageId: ctx.assistantMessageId,
      stepId: step.id,
      updates: stepUpdates,
    })
  } else {
    toolCall.status = result.success ? 'completed' : 'failed'
    toolCall.result = result.data
    toolCall.error = result.error
    // Update step status based on result, include result/error
    const stepStatus = result.success ? 'completed' : 'failed'
    const stepUpdates: Partial<Step> = {
      status: stepStatus,
      toolCall: { ...toolCall },  // Update toolCall with result
      result: typeof result.data === 'string' ? result.data : JSON.stringify(result.data),
      error: result.error,
    }
    store.updateMessageStep(ctx.sessionId, ctx.assistantMessageId, step.id, stepUpdates)
    ctx.sender.send(IPC_CHANNELS.STEP_UPDATED, {
      sessionId: ctx.sessionId,
      messageId: ctx.assistantMessageId,
      stepId: step.id,
      updates: stepUpdates,
    })
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
 * Tool loop result indicating why the loop ended
 */
interface ToolLoopResult {
  pausedForConfirmation: boolean  // Loop paused waiting for tool confirmation
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
          // Pass the resolved toolId for execution, include skills for Tool Agent
          await executeToolAndUpdate(ctx, toolCall, {
            toolName: toolCall.toolId,
            args: chunk.toolCall.args
          }, processor.toolCalls, enabledSkills, currentTurn)
        }
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
        type: 'steps',
        turnIndex: currentTurn,
      })
      ctx.sender.send(IPC_CHANNELS.STREAM_CHUNK, {
        type: 'content_part',
        content: '',
        messageId: ctx.assistantMessageId,
        sessionId: ctx.sessionId,
        contentPart: { type: 'steps', turnIndex: currentTurn },
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

  return { pausedForConfirmation: false }
}

/**
 * Run simple streaming without tools
 */
async function runSimpleStream(
  ctx: StreamContext,
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string; reasoningContent?: string }>,
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

    // Get system prompt from agent (preferred) or workspace (fallback)
    let characterSystemPrompt: string | undefined
    const session = store.getSession(ctx.sessionId)

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
    const lastUserMessage = historyMessages
      .filter(m => m.role === 'user')
      .pop()?.content || ''

    // Retrieve relevant user facts based on conversation context (semantic search)
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

    // Load agent-specific memory only for agent sessions
    if (session?.agentId) {
      agentIdForInteraction = session.agentId
      try {
        const storage = getStorage()
        const relationship = await storage.agentMemory.getRelationship(session.agentId)
        if (relationship) {
          agentMemoryPrompt = formatAgentMemoryPrompt(relationship)
        }
      } catch (error) {
        console.error('Failed to load agent memory:', error)
      }
    }

    const systemPrompt = buildSystemPrompt({
      hasTools,
      skills: enabledSkills,
      workspaceSystemPrompt: characterSystemPrompt,
      userProfilePrompt,
      agentMemoryPrompt,
    })

    let pausedForConfirmation = false

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

    // Only finalize and run post-processing if not paused for tool confirmation
    if (!pausedForConfirmation) {
      processor.finalize()
      const updatedSession = store.getSession(ctx.sessionId)
      ctx.sender.send(IPC_CHANNELS.STREAM_COMPLETE, {
        messageId: ctx.assistantMessageId,
        sessionId: ctx.sessionId,
        sessionName: updatedSession?.name || sessionName,
      })
      console.log('[Backend] Streaming complete')

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
      const lastUserMessage = historyMessages
        .filter(m => m.role === 'user')
        .pop()

      if (lastUserMessage && processor.accumulatedContent) {
        const updatedSessionForTriggers = store.getSession(ctx.sessionId)
        if (updatedSessionForTriggers) {
          const triggerContext: TriggerContext = {
            sessionId: ctx.sessionId,
            session: updatedSessionForTriggers,
            messages: updatedSessionForTriggers.messages,
            lastUserMessage: lastUserMessage.content,
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

  // Resume streaming after user confirms a tool
  ipcMain.handle(IPC_CHANNELS.RESUME_AFTER_TOOL_CONFIRM, async (event, { sessionId, messageId }) => {
    return handleResumeAfterToolConfirm(event.sender, sessionId, messageId)
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
    const historyMessages = buildHistoryMessages(session?.messages || [], session)

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
    const historyMessages = buildHistoryMessages(session?.messages || [], session)

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
    const historyMessages = buildHistoryMessages(session?.messages || [], session)

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
      const historyMessages = buildHistoryMessages(sessionForHistory?.messages || [], sessionForHistory)

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

// Handle resuming streaming after user confirms a tool
async function handleResumeAfterToolConfirm(sender: Electron.WebContents, sessionId: string, messageId: string) {
  try {
    console.log(`[Backend] Resuming after tool confirm for session: ${sessionId}, message: ${messageId}`)

    // Get session
    const session = store.getSession(sessionId)
    if (!session) {
      return { success: false, error: 'Session not found' }
    }

    // Find the assistant message with tool calls
    const assistantMessage = session.messages.find(m => m.id === messageId)
    if (!assistantMessage || assistantMessage.role !== 'assistant') {
      return { success: false, error: 'Assistant message not found' }
    }

    // Check if there are completed tool calls to process
    const toolCalls = assistantMessage.toolCalls || []
    const completedToolCalls = toolCalls.filter(tc => tc.status === 'completed' || tc.status === 'failed')
    if (completedToolCalls.length === 0) {
      return { success: false, error: 'No completed tool calls to process' }
    }

    // Check if there are still pending tool calls
    const pendingToolCalls = toolCalls.filter(tc => tc.status === 'pending' && tc.requiresConfirmation)
    if (pendingToolCalls.length > 0) {
      console.log(`[Backend] Still have ${pendingToolCalls.length} pending tool calls, not resuming yet`)
      return { success: false, error: 'Still have pending tool calls awaiting confirmation' }
    }

    // Get settings and validate
    const settings = store.getSettings()
    const providerId = settings.ai.provider
    const providerConfig = getProviderConfig(settings)

    if (!providerConfig || !providerConfig.apiKey) {
      return { success: false, error: 'API Key not configured' }
    }

    if (!isProviderSupported(providerId)) {
      return { success: false, error: `Unsupported provider: ${providerId}` }
    }

    // Build conversation messages for continuation
    // We need to include history + assistant message with tool calls + tool results
    const historyMessages = buildHistoryMessages(session.messages, session)

    // Filter out the current assistant message from history (we'll add it with tool calls)
    const historyWithoutCurrent = historyMessages.filter((_, idx) => {
      // Remove the last assistant message if it matches our message
      const msgCount = historyMessages.length
      return idx !== msgCount - 1 || historyMessages[idx].role !== 'assistant'
    })

    // Build tool-aware conversation messages
    const conversationMessages: ToolChatMessage[] = []

    // Add system prompt
    const allEnabledTools = settings.tools?.enableToolCalls ? getEnabledTools() : []
    const enabledTools = allEnabledTools.filter(t => !t.id.startsWith('mcp:'))
    const mcpTools = settings.tools?.enableToolCalls ? getMCPToolsForAI() : {}
    const hasTools = enabledTools.length > 0 || Object.keys(mcpTools).length > 0

    const skillsSettings = settings.skills
    const skillsEnabled = skillsSettings?.enableSkills !== false
    const enabledSkills = skillsEnabled ? getLoadedSkills().filter(s => s.enabled) : []

    // Load user profile (shared) and agent memory (per-agent) for system prompt
    let userProfilePrompt: string | undefined
    let agentMemoryPrompt: string | undefined
    const agentId = session.agentId

    // Get the last user message for retrieval-based memory injection
    const lastUserMsg = historyWithoutCurrent
      .filter(m => m.role === 'user')
      .pop()?.content || ''

    // Retrieve relevant user facts based on conversation context (semantic search)
    try {
      const storage = getStorage()
      const relevantFacts = await retrieveRelevantFacts(storage, lastUserMsg, 10, 0.3)
      if (relevantFacts.length > 0) {
        userProfilePrompt = formatUserProfilePrompt(relevantFacts)
        console.log(`[Chat] Retrieved ${relevantFacts.length} relevant facts for resume context`)
      }
    } catch (error) {
      console.error('Failed to retrieve relevant facts:', error)
    }

    // Load agent-specific memory only for agent sessions
    if (agentId) {
      try {
        const storage = getStorage()
        const agentRelationship = await storage.agentMemory.getRelationship(agentId)
        if (agentRelationship) {
          agentMemoryPrompt = formatAgentMemoryPrompt(agentRelationship)
        }
      } catch (error) {
        console.error('Failed to load agent memory:', error)
      }
    }

    // Get workspace/agent system prompt
    let characterSystemPrompt: string | undefined
    if (session.workspaceId) {
      const workspace = store.getWorkspace(session.workspaceId)
      characterSystemPrompt = workspace?.systemPrompt
    } else if (session.agentId) {
      const agent = store.getAgent(session.agentId)
      characterSystemPrompt = agent?.systemPrompt
    }

    const systemPrompt = buildSystemPrompt({
      hasTools,
      skills: enabledSkills,
      workspaceSystemPrompt: characterSystemPrompt,
      userProfilePrompt,
      agentMemoryPrompt,
    })

    conversationMessages.push({ role: 'system', content: systemPrompt })

    // Add history messages (excluding current assistant message)
    for (const msg of historyWithoutCurrent) {
      conversationMessages.push({
        role: msg.role,
        content: msg.content,
        ...(msg.reasoningContent && { reasoningContent: msg.reasoningContent }),
      })
    }

    // Add the assistant message with tool calls
    conversationMessages.push({
      role: 'assistant',
      content: assistantMessage.content || '',
      toolCalls: toolCalls.map(tc => ({
        toolCallId: tc.id,
        toolName: tc.toolName,
        args: tc.arguments,
      })),
      ...(assistantMessage.reasoning && { reasoningContent: assistantMessage.reasoning }),
    })

    // Add tool results
    conversationMessages.push({
      role: 'tool',
      content: toolCalls.map(tc => ({
        type: 'tool-result' as const,
        toolCallId: tc.id,
        toolName: tc.toolName,
        result: tc.status === 'completed' ? tc.result : { error: tc.error },
      })),
    })

    // Start streaming continuation in background
    process.nextTick(async () => {
      const abortController = new AbortController()
      activeStreams.set(sessionId, abortController)

      const ctx: StreamContext = {
        sender,
        sessionId,
        assistantMessageId: messageId,
        abortSignal: abortController.signal,
        settings,
        providerConfig,
        providerId,
        toolSettings: settings.tools,
      }

      // Initialize processor with existing message content to preserve it
      const processor = createStreamProcessor(ctx, {
        content: assistantMessage.content || '',
        reasoning: assistantMessage.reasoning || '',
      })

      try {
        console.log('[Backend] Continuing tool loop after confirmation')

        // Build tools for AI
        const builtinToolsForAI = convertToolDefinitionsForAI(enabledTools)
        const toolsForAI = { ...builtinToolsForAI, ...mcpTools }

        // Continue the tool loop
        const result = await runToolLoop(ctx, conversationMessages, toolsForAI, processor, enabledSkills)

        // Only finalize and send complete if not paused for another confirmation
        if (!result.pausedForConfirmation) {
          processor.finalize()
          sender.send(IPC_CHANNELS.STREAM_COMPLETE, {
            messageId,
            sessionId,
            sessionName: session.name,
          })
          console.log('[Backend] Resume streaming complete')
        } else {
          console.log('[Backend] Resume paused for another tool confirmation')
        }

      } catch (error: any) {
        const isAborted = error.name === 'AbortError' || abortController.signal.aborted
        if (isAborted) {
          console.log('[Backend] Resume stream aborted by user')
          processor.finalize()
          sender.send(IPC_CHANNELS.STREAM_COMPLETE, {
            messageId,
            sessionId,
            sessionName: session.name,
            aborted: true,
          })
        } else {
          console.error('[Backend] Resume streaming error:', error)
          sender.send(IPC_CHANNELS.STREAM_ERROR, {
            messageId,
            sessionId,
            error: error.message || 'Streaming error',
            errorDetails: extractErrorDetails(error),
          })
        }
      } finally {
        activeStreams.delete(sessionId)
      }
    })

    return { success: true }

  } catch (error: any) {
    console.error('Error resuming after tool confirm:', error)
    return {
      success: false,
      error: error.message || 'Failed to resume streaming',
      errorDetails: extractErrorDetails(error),
    }
  }
}
