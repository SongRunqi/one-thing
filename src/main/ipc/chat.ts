import { ipcMain, BrowserWindow } from 'electron'
import * as os from 'os'
import * as store from '../store.js'
import type { ChatMessage, AppSettings, ProviderConfig, CustomProviderConfig, UserFact, AgentUserRelationship, AgentMood, AgentMemory, Step, StepType, ContentPart, MessageAttachment } from '../../shared/ipc.js'
import { IPC_CHANNELS } from '../../shared/ipc.js'
import type { UIMessage, UIMessagePart, UIMessageChunk, UIMessageStreamData, TextUIPart, ReasoningUIPart, ToolUIPart, ToolUIState } from '../../shared/ipc.js'
import { v4 as uuidv4 } from 'uuid'
import { experimental_generateImage as aiGenerateImage, generateText } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import {
  generateChatResponseWithReasoning,
  generateChatTitle,
  isProviderSupported,
  streamChatResponseWithReasoning,
  streamChatResponseWithTools,
  convertToolDefinitionsForAI,
  requiresOAuth,
  type ToolChatMessage,
  type AIMessageContent,
} from '../providers/index.js'
import { oauthManager } from '../services/oauth-manager.js'
import {
  getEnabledToolsAsync,
  executeTool,
  createToolCall,
  setInitContext,
  initializeAsyncTools,
} from '../tools/index.js'
import type { ToolCall, ToolSettings } from '../../shared/ipc.js'
import { getMCPToolsForAI, isMCPTool, executeMCPTool, parseMCPToolId, findMCPToolIdByShortName, MCPManager } from '../mcp/index.js'
import { getSkillsForSession } from './skills.js'
import { updateSessionUsage } from './sessions.js'
import { buildSkillToolPrompt } from '../skills/prompt-builder.js'
import type { SkillDefinition } from '../../shared/ipc.js'
import { getStorage } from '../storage/index.js'
import type { IStorageProvider } from '../storage/interfaces.js'
import { triggerManager, type TriggerContext } from '../services/triggers/index.js'
import { memoryExtractionTrigger } from '../services/triggers/memory-extraction.js'
import { contextCompactingTrigger } from '../services/triggers/context-compacting.js'
import type { ToolExecutionContext, ToolExecutionResult } from '../tools/types.js'
import { getTool } from '../tools/index.js'
import { Permission } from '../permission/index.js'
import * as modelRegistry from '../services/model-registry.js'

// Register triggers on module load
triggerManager.register(memoryExtractionTrigger)
triggerManager.register(contextCompactingTrigger)

// ============================================================================
// Logging Helpers

// Format messages for logging without full base64 data
function formatMessagesForLog(messages: unknown[]): unknown[] {
  return messages.map(msg => {
    const m = msg as Record<string, unknown>
    if (Array.isArray(m.content)) {
      return {
        ...m,
        content: m.content.map((part: Record<string, unknown>) => {
          if (part.type === 'image' && typeof part.image === 'string') {
            const imgStr = part.image as string
            return {
              ...part,
              image: imgStr.substring(0, 50) + `... (${imgStr.length} chars)`,
            }
          }
          return part
        }),
      }
    }
    return m
  })
}

// ============================================================================
// UIMessage Streaming Helpers
// ============================================================================

/**
 * Send a UIMessage part chunk to the renderer
 */
function sendUIMessagePart(
  sender: Electron.WebContents,
  sessionId: string,
  messageId: string,
  part: UIMessagePart,
  partIndex?: number
) {
  const data: UIMessageStreamData = {
    sessionId,
    messageId,
    chunk: {
      type: 'part',
      messageId,
      part,
      partIndex,
    },
  }
  sender.send(IPC_CHANNELS.UI_MESSAGE_STREAM, data)
}

/**
 * Send a UIMessage finish chunk to the renderer
 */
function sendUIMessageFinish(
  sender: Electron.WebContents,
  sessionId: string,
  messageId: string,
  finishReason: 'stop' | 'length' | 'tool-calls' | 'content-filter' | 'error' | 'other' = 'stop',
  usage?: { inputTokens: number; outputTokens: number; totalTokens: number }
) {
  const data: UIMessageStreamData = {
    sessionId,
    messageId,
    chunk: {
      type: 'finish',
      messageId,
      finishReason,
      usage,
    },
  }
  sender.send(IPC_CHANNELS.UI_MESSAGE_STREAM, data)
}

/**
 * Send a text delta as UIMessage part
 */
function sendUITextDelta(
  sender: Electron.WebContents,
  sessionId: string,
  messageId: string,
  text: string,
  partIndex?: number,
  state: 'streaming' | 'done' = 'streaming'
) {
  const part: TextUIPart = {
    type: 'text',
    text,
    state,
  }
  sendUIMessagePart(sender, sessionId, messageId, part, partIndex)
}

/**
 * Send a reasoning delta as UIMessage part
 */
function sendUIReasoningDelta(
  sender: Electron.WebContents,
  sessionId: string,
  messageId: string,
  text: string,
  partIndex?: number,
  state: 'streaming' | 'done' = 'streaming'
) {
  const part: ReasoningUIPart = {
    type: 'reasoning',
    text,
    state,
  }
  sendUIMessagePart(sender, sessionId, messageId, part, partIndex)
}

/**
 * Send a tool call as UIMessage part
 */
function sendUIToolCall(
  sender: Electron.WebContents,
  sessionId: string,
  messageId: string,
  toolCallId: string,
  toolName: string,
  state: ToolUIState,
  input?: Record<string, unknown>,
  output?: unknown,
  errorText?: string,
  partIndex?: number
) {
  const part: ToolUIPart = {
    type: `tool-${toolName}`,
    toolCallId,
    toolName,
    state,
    input,
    output,
    errorText,
  }
  sendUIMessagePart(sender, sessionId, messageId, part, partIndex)
}

// Normalize model ID for API call (for OpenAI image models)
function normalizeImageModelId(modelId: string): string {
  const normalized = modelId.toLowerCase().replace(/[\s-]+/g, '')
  if (normalized.includes('dalle3')) return 'dall-e-3'
  if (normalized.includes('dalle2')) return 'dall-e-2'
  // chatgpt-image-latest should use gpt-image-1 (the API-accessible version)
  if (normalized.includes('chatgptimage')) return 'gpt-image-1'
  // gpt-image models use their original ID
  return modelId
}

// Image generation using AI SDK
interface ImageGenerationResult {
  success: boolean
  imageUrl?: string
  imageBase64?: string
  revisedPrompt?: string
  error?: string
}

async function generateImage(
  apiKey: string,
  baseUrl: string,
  model: string,
  prompt: string,
  options: { size?: string; quality?: string; style?: string } = {}
): Promise<ImageGenerationResult> {
  try {
    // Create OpenAI provider with custom settings
    const openai = createOpenAI({
      apiKey,
      baseURL: baseUrl || 'https://api.openai.com/v1',
    })

    // Build provider options based on model
    const providerOptions: Record<string, any> = {}
    if (model === 'dall-e-3') {
      providerOptions.openai = {
        style: options.style || 'vivid',
        quality: options.quality || 'standard',
      }
    } else if (model.includes('gpt-image')) {
      providerOptions.openai = {
        quality: options.quality || 'auto',
      }
    }

    // Generate image using AI SDK
    const result = await aiGenerateImage({
      model: openai.image(model),
      prompt,
      size: (options.size || '1024x1024') as `${number}x${number}`,
      providerOptions: Object.keys(providerOptions).length > 0 ? providerOptions : undefined,
    })

    // Get the first image
    const image = result.image

    return {
      success: true,
      imageBase64: image.base64,
      revisedPrompt: (result as any).providerMetadata?.openai?.revisedPrompt,
    }
  } catch (error: any) {
    console.error('[Image Generation] Error:', error)
    return {
      success: false,
      error: error.message || 'Failed to generate image',
    }
  }
}

// Gemini image generation using generateText with files response
// Gemini 2.5 Flash Image uses generateText and returns images in result.files
async function generateGeminiImage(
  apiKey: string,
  model: string,
  prompt: string
): Promise<ImageGenerationResult> {
  try {
    console.log(`[Gemini Image] Generating image with model: ${model}`)
    const google = createGoogleGenerativeAI({ apiKey })

    const result = await generateText({
      model: google(model),
      prompt,
    })

    console.log(`[Gemini Image] Response received, files: ${result.files?.length ?? 0}`)

    // Extract image from result.files
    if (result.files && result.files.length > 0) {
      for (const file of result.files) {
        if (file.mediaType?.startsWith('image/')) {
          console.log(`[Gemini Image] Found image: ${file.mediaType}`)
          return {
            success: true,
            imageBase64: file.base64,
          }
        }
      }
    }

    // No image in files - check if model returned text instead
    if (result.text) {
      console.log(`[Gemini Image] No image generated, got text: ${result.text.substring(0, 100)}...`)
      return {
        success: false,
        error: `Model returned text instead of image: ${result.text.substring(0, 200)}`,
      }
    }

    return {
      success: false,
      error: 'No image generated',
    }
  } catch (error: any) {
    console.error('[Gemini Image] Error:', error)
    return {
      success: false,
      error: error.message || 'Failed to generate image',
    }
  }
}

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

// Helper function to retrieve relevant agent memories using semantic search
async function retrieveRelevantAgentMemories(
  storage: IStorageProvider,
  agentId: string,
  userMessage: string,
  limit = 5,
  minSimilarity = 0.3
): Promise<AgentMemory[]> {
  try {
    const memories = await storage.agentMemory.hybridRetrieveMemories(
      agentId,
      userMessage,
      limit,
      { minSimilarity }
    )
    return memories
  } catch (error) {
    console.error('[Chat] Failed to retrieve agent memories:', error)
    return []
  }
}

// Helper function to format agent memories into a readable prompt
function formatAgentMemoryPrompt(
  relationship: AgentUserRelationship,
  relevantMemories?: AgentMemory[]
): string | undefined {
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

  // Use provided relevant memories, or fallback to strength-based filtering
  const activeMemories = relevantMemories && relevantMemories.length > 0
    ? relevantMemories
    : relationship.observations
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

// Helper function to extract text content from AIMessageContent
function getTextFromContent(content: AIMessageContent): string {
  if (typeof content === 'string') {
    return content
  }
  // Extract text from array content
  return content
    .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
    .map(part => part.text)
    .join('\n')
}

// Helper function to convert message with attachments to multimodal format
function buildMessageContent(message: ChatMessage): AIMessageContent {
  // If no attachments, return simple string content
  if (!message.attachments || message.attachments.length === 0) {
    return message.content
  }

  // Build multimodal content array
  const contentParts: Exclude<AIMessageContent, string> = []

  // Add text content first (if any)
  if (message.content) {
    contentParts.push({ type: 'text', text: message.content })
  }

  // Add attachments
  for (const attachment of message.attachments) {
    if (attachment.mediaType === 'image' && attachment.base64Data) {
      // Use Data URL format for better compatibility across providers
      const dataUrl = `data:${attachment.mimeType};base64,${attachment.base64Data}`
      console.log('[Chat] Adding image attachment:', {
        mimeType: attachment.mimeType,
        base64Length: attachment.base64Data.length,
        dataUrlPrefix: dataUrl.substring(0, 50) + '...',
      })
      contentParts.push({
        type: 'image',
        image: dataUrl,
        // mediaType is auto-detected from Data URL by AI SDK
      })
    } else if (attachment.base64Data) {
      // For non-image files, add as file type
      contentParts.push({
        type: 'file',
        data: attachment.base64Data,
        mediaType: attachment.mimeType,  // AI SDK 5.x uses 'mediaType'
      })
    }
  }

  return contentParts.length > 0 ? contentParts : message.content
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
  content: AIMessageContent
  reasoningContent?: string
}> {
  // If session has a summary, use it to reduce context
  if (session?.summary && session?.summaryUpToMessageId) {
    const summaryIndex = messages.findIndex(m => m.id === session.summaryUpToMessageId)

    if (summaryIndex !== -1) {
      // Get messages after the summary point
      const recentMessages = messages.slice(summaryIndex + 1)

      // Build the history with summary + recent messages
      const result: Array<{ role: 'user' | 'assistant'; content: AIMessageContent; reasoningContent?: string }> = []

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
        // Skip messages with empty content (causes API error)
        if (!m.content && (!m.attachments || m.attachments.length === 0)) continue

        const msg: { role: 'user' | 'assistant'; content: AIMessageContent; reasoningContent?: string } = {
          role: m.role as 'user' | 'assistant',
          content: buildMessageContent(m),
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
      // Exclude messages with empty content (causes API error)
      if (!m.content && (!m.attachments || m.attachments.length === 0)) return false
      return true
    })
    .map(m => {
      const msg: { role: 'user' | 'assistant'; content: AIMessageContent; reasoningContent?: string } = {
        role: m.role as 'user' | 'assistant',
        content: buildMessageContent(m),
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
const BASE_SYSTEM_PROMPT_WITH_TOOLS = `
You are a helpful assistant. Your name is "贝贝".
`
// Base system prompt for models without tool support
const BASE_SYSTEM_PROMPT_NO_TOOLS = `
You are a helpful assistant.
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
  providerId?: string
  workingDirectory?: string
}): string {
  const { hasTools, skills, workspaceSystemPrompt, userProfilePrompt, agentMemoryPrompt, providerId, workingDirectory } = options
  // Use appropriate base prompt based on tool support
  let prompt = hasTools ? BASE_SYSTEM_PROMPT_WITH_TOOLS : BASE_SYSTEM_PROMPT_NO_TOOLS

  // Prepend workspace/agent system prompt if provided (for character/persona)
  if (workspaceSystemPrompt && workspaceSystemPrompt.trim()) {
    prompt = workspaceSystemPrompt.trim() + '\n\n' + prompt
  }

  // Add working directory information for file operations
  // This helps the model use correct paths instead of hallucinating
  if (workingDirectory && hasTools) {
    const baseDir = os.homedir()
    // Display path with ~ for readability, but also show the full path
    const displayPath = workingDirectory.startsWith(baseDir)
      ? workingDirectory.replace(baseDir, '~')
      : workingDirectory
    prompt += `
# Working Directory
Base directory: ${baseDir} (referred to as ~)
Current working directory: ${displayPath} (${workingDirectory})

IMPORTANT: When using file tools (read, edit, write, glob, grep), always use absolute paths within this working directory. Do NOT hallucinate or guess paths from other projects or users.
`
  }

  // Note: Claude Code OAuth header is handled by claude-code.ts createOAuthFetch
  // which properly formats the system prompt with the required header

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

  // Add skills awareness only when tools are enabled
  // Models without tool support cannot use skills (no bash, no tool calls)
  if (skills.length > 0 && hasTools) {
    prompt += '\n\n' + buildSkillToolPrompt(skills)
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

/**
 * Get the API key for a provider, handling OAuth providers
 * For OAuth providers, returns the OAuth access token
 * For regular providers, returns the configured API key
 */
async function getApiKeyForProvider(providerId: string, providerConfig: ProviderConfig | undefined): Promise<string | null> {
  // Check if this is an OAuth provider
  if (requiresOAuth(providerId)) {
    try {
      const token = await oauthManager.refreshTokenIfNeeded(providerId)
      return token.accessToken
    } catch (error) {
      console.error(`Failed to get OAuth token for ${providerId}:`, error)
      return null
    }
  }

  // Regular provider - use API key from config
  return providerConfig?.apiKey || null
}

/**
 * Check if a provider has valid credentials (API key or OAuth token)
 */
async function hasValidCredentials(providerId: string, providerConfig: ProviderConfig | undefined): Promise<boolean> {
  const apiKey = await getApiKeyForProvider(providerId, providerConfig)
  return !!apiKey
}

// Get effective provider and model for a session (session-level overrides global)
function getEffectiveProviderConfig(
  settings: AppSettings,
  sessionId: string
): { providerId: string; providerConfig: ProviderConfig | undefined; model: string } {
  const session = store.getSession(sessionId)

  // If session has saved provider/model, use those
  if (session?.lastProvider && session?.lastModel) {
    const providerId = session.lastProvider
    const providerConfig = settings.ai.providers[providerId]

    if (providerConfig) {
      // Return a modified config with the session's model
      return {
        providerId,
        providerConfig: {
          ...providerConfig,
          model: session.lastModel,
        },
        model: session.lastModel,
      }
    }
  }

  // Fall back to global settings
  const providerId = settings.ai.provider
  const providerConfig = settings.ai.providers[providerId]
  return {
    providerId,
    providerConfig,
    model: providerConfig?.model || '',
  }
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
  // Accumulated token usage across all turns
  accumulatedUsage?: { inputTokens: number; outputTokens: number; totalTokens: number }
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
    // Show full command (CSS handles wrapping for long commands)
    return `执行命令: ${command}`
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
  context: {
    sessionId: string
    messageId: string
    toolCallId?: string
    workingDirectory?: string  // Session's working directory (sandbox boundary)
    abortSignal?: AbortSignal
    onMetadata?: (update: { title?: string; metadata?: Record<string, unknown> }) => void
  }
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
      toolCallId: context.toolCallId,
      workingDirectory: context.workingDirectory,
      abortSignal: context.abortSignal,
      onMetadata: context.onMetadata,
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

  // Get session's workingDirectory for sandbox boundary
  const session = store.getSession(ctx.sessionId)
  const workingDirectory = session?.workingDirectory

  // Execute tool directly (no LLM overhead)
  result = await executeToolDirectly(
    toolCallData.toolName,
    toolCallData.args,
    {
      sessionId: ctx.sessionId,
      messageId: ctx.assistantMessageId,
      toolCallId: toolCall.id,
      workingDirectory,  // Pass session's working directory for sandbox
      abortSignal: ctx.abortSignal,
      // V2 tool metadata streaming callback
      onMetadata: (update) => {
        // Update step with real-time metadata
        const metadataUpdates: Partial<Step> = {}
        if (update.title) {
          metadataUpdates.title = update.title
        }
        if (update.metadata) {
          // Store metadata in step for later use
          metadataUpdates.result = typeof update.metadata.output === 'string'
            ? update.metadata.output
            : JSON.stringify(update.metadata)
        }
        // Only send update if there are changes
        if (Object.keys(metadataUpdates).length > 0) {
          store.updateMessageStep(ctx.sessionId, ctx.assistantMessageId, step.id, metadataUpdates)
          ctx.sender.send(IPC_CHANNELS.STEP_UPDATED, {
            sessionId: ctx.sessionId,
            messageId: ctx.assistantMessageId,
            stepId: step.id,
            updates: metadataUpdates,
          })
        }
      },
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
    // Extract title from result.data if available (V2 tools return title in data)
    const finalTitle = result.data?.title || step.title
    const stepUpdates: Partial<Step> = {
      status: stepStatus,
      title: finalTitle,  // Update title with final result title
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
async function runSimpleStream(
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
async function executeStreamGeneration(
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

      // Remove the failed assistant message from storage
      store.deleteMessage(ctx.sessionId, ctx.assistantMessageId)

      // Add an error message to the session (persisted)
      const errorMessage: ChatMessage = {
        id: `error-${Date.now()}`,
        role: 'error',
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

// ============================================
// End of Shared Streaming Infrastructure
// ============================================

export function registerChatHandlers() {
  // 发送消息（非流式）
  ipcMain.handle(IPC_CHANNELS.SEND_MESSAGE, async (_event, { sessionId, message }) => {
    return handleSendMessage(sessionId, message)
  })

  // 发送消息（流式）- 使用事件发射器
  ipcMain.handle(IPC_CHANNELS.SEND_MESSAGE_STREAM, async (event, { sessionId, message, attachments }) => {
    return handleSendMessageStream(event.sender, sessionId, message, attachments)
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
        // Clear any pending permission requests for this session
        Permission.clearSession(sessionId)
        return { success: true }
      }
      // Even if no active stream, still clear pending permissions
      Permission.clearSession(sessionId)
      return { success: false, error: 'No active stream for this session' }
    } else {
      // Abort all streams (backwards compatibility)
      if (activeStreams.size > 0) {
        console.log(`[Backend] Aborting all active streams (${activeStreams.size})`)
        for (const [sid, controller] of activeStreams) {
          controller.abort()
          // Clear any pending permission requests for each session
          Permission.clearSession(sid)
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

    // Get API key (handles OAuth providers)
    const apiKey = await getApiKeyForProvider(providerId, providerConfig)
    if (!apiKey) {
      const isOAuth = requiresOAuth(providerId)
      return {
        success: false,
        error: isOAuth
          ? `Not logged in to ${providerId}. Please login in settings.`
          : 'API Key not configured. Please configure your AI settings.',
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

    // Use AI SDK to generate response (use OAuth token as apiKey)
    const apiType = getProviderApiType(settings, providerId)
    const response = await generateChatResponseWithReasoning(
      providerId,
      {
        apiKey,  // Use the apiKey we got (OAuth token or regular API key)
        baseUrl: providerConfig?.baseUrl,
        model: providerConfig?.model || '',
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

    // Get settings and validate (use session-level model if available)
    const settings = store.getSettings()
    const { providerId, providerConfig, model: effectiveModel } = getEffectiveProviderConfig(settings, sessionId)

    // Get API key (handles OAuth providers)
    const apiKey = await getApiKeyForProvider(providerId, providerConfig)
    if (!apiKey) {
      const isOAuth = requiresOAuth(providerId)
      return {
        success: false,
        error: isOAuth
          ? `Not logged in to ${providerId}. Please login in settings.`
          : 'API Key not configured. Please configure your AI settings.',
      }
    }

    // Create config with the API key (for OAuth providers, this is the OAuth token)
    const configWithApiKey = {
      ...providerConfig,
      apiKey,
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
      model: effectiveModel,
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
        providerConfig: configWithApiKey,
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

    // Get API key (handles OAuth providers)
    const apiKey = await getApiKeyForProvider(providerId, providerConfig)
    if (!apiKey) {
      const isOAuth = requiresOAuth(providerId)
      return {
        success: false,
        error: isOAuth
          ? `Not logged in to ${providerId}. Please login in settings.`
          : 'API Key not configured. Please configure your AI settings.',
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
        apiKey,
        baseUrl: providerConfig?.baseUrl,
        model: providerConfig?.model || '',
        apiType,
      },
      historyMessages,
      { temperature: settings.ai.temperature }
    )

    const assistantMessage: ChatMessage = {
      id: uuidv4(),
      role: 'assistant',
      model: providerConfig?.model || '',
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

    // Get API key (handles OAuth providers)
    const apiKey = await getApiKeyForProvider(providerId, providerConfig)
    if (!apiKey || !isProviderSupported(providerId)) {
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
        apiKey,
        baseUrl: providerConfig?.baseUrl,
        model: providerConfig?.model || '',
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
async function handleSendMessageStream(sender: Electron.WebContents, sessionId: string, messageContent: string, attachments?: MessageAttachment[]) {
  try {
    // Get session to check if this is the first user message
    const session = store.getSession(sessionId)
    const isFirstUserMessage = session && session.messages.filter(m => m.role === 'user').length === 0

    // For branch sessions, check if this is the first NEW user message (after inherited messages)
    const isBranchFirstMessage = session?.parentSessionId && session.messages.length > 0 &&
      !session.messages.some(m => m.role === 'user' && m.timestamp > session.createdAt)

    // Save user message (with attachments if provided)
    const userMessage: ChatMessage = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: messageContent,
      timestamp: Date.now(),
      attachments: attachments, // Include file/image attachments
    }
    console.log('[Backend] Created user message with id:', userMessage.id, 'attachments:', attachments?.length || 0)
    store.addMessage(sessionId, userMessage)

    // Auto-rename session based on first user message
    if (isFirstUserMessage || isBranchFirstMessage) {
      const newTitle = generateTitleFromMessage(messageContent)
      store.renameSession(sessionId, newTitle)
    }

    // Get settings and validate (use session-level model if available)
    const settings = store.getSettings()
    const { providerId, providerConfig, model: effectiveModel } = getEffectiveProviderConfig(settings, sessionId)

    // Get API key (handles OAuth providers)
    const apiKey = await getApiKeyForProvider(providerId, providerConfig)
    if (!apiKey) {
      const isOAuth = requiresOAuth(providerId)
      return {
        success: false,
        error: isOAuth
          ? `Not logged in to ${providerId}. Please login in settings.`
          : 'API Key not configured. Please configure your AI settings.',
      }
    }

    // Create config with the API key (for OAuth providers, this is the OAuth token)
    const configWithApiKey = {
      ...providerConfig,
      apiKey,
    }

    if (!isProviderSupported(providerId)) {
      return {
        success: false,
        error: `Unsupported provider: ${providerId}`,
      }
    }

    console.log(`[Backend] Using provider: ${providerId}, model: ${effectiveModel}`)

    // Create assistant message
    const assistantMessageId = uuidv4()
    const assistantMessage: ChatMessage = {
      id: assistantMessageId,
      role: 'assistant',
      model: effectiveModel,
      content: '',
      timestamp: Date.now(),
      isStreaming: true,
      thinkingStartTime: Date.now(),
      toolCalls: [],
    }
    store.addMessage(sessionId, assistantMessage)

    // Get updated session name (may have been renamed above)
    const updatedSessionForName = store.getSession(sessionId)
    const initialResponse = {
      success: true,
      userMessage,
      messageId: assistantMessageId,
      sessionName: updatedSessionForName?.name,
    }

    // Start streaming in background using shared infrastructure
    process.nextTick(async () => {
      const abortController = new AbortController()
      activeStreams.set(sessionId, abortController)

      try {
        // Check if this is an image generation model using Models.dev capability
        const supportsImageGen = await modelRegistry.modelSupportsImageGeneration(configWithApiKey.model, providerId)

        if (supportsImageGen) {
          console.log(`[Backend] Detected image generation model: ${configWithApiKey.model} (provider: ${providerId})`)

          // For image generation, we don't need history - just the prompt
          const prompt = messageContent

          // Send a "thinking" message to show progress
          sender.send(IPC_CHANNELS.STREAM_CHUNK, {
            type: 'text',
            content: '正在生成图片...\n\n',
            messageId: assistantMessageId,
            sessionId,
          })
          store.updateMessageContent(sessionId, assistantMessageId, '正在生成图片...\n\n')

          let result: ImageGenerationResult
          let modelForDisplay: string

          // Use provider ID to determine which image generation API to use
          if (providerId === 'gemini') {
            // Gemini image generation (uses generateText with files output)
            console.log(`[Backend] Using Gemini image generation`)
            modelForDisplay = configWithApiKey.model
            result = await generateGeminiImage(
              configWithApiKey.apiKey,
              configWithApiKey.model,
              prompt
            )
          } else {
            // OpenAI-compatible image generation (DALL-E, etc.)
            const normalizedModel = normalizeImageModelId(configWithApiKey.model)
            console.log(`[Backend] Using OpenAI image generation: ${normalizedModel}`)
            modelForDisplay = normalizedModel
            result = await generateImage(
              configWithApiKey.apiKey,
              configWithApiKey.baseUrl || 'https://api.openai.com/v1',
              normalizedModel,
              prompt
            )
          }

          if (result.success && result.imageBase64) {
            // Format the response with markdown image and revised prompt info
            let responseContent = ''

            if (result.revisedPrompt && result.revisedPrompt !== prompt) {
              responseContent += `**优化后的提示词:** ${result.revisedPrompt}\n\n`
            }

            // Use base64 data URL for displaying the image
            const imageDataUrl = `data:image/png;base64,${result.imageBase64}`
            responseContent += `![Generated Image](${imageDataUrl})`

            // Update message with image
            store.updateMessageContent(sessionId, assistantMessageId, responseContent)
            store.updateMessageStreaming(sessionId, assistantMessageId, false)

            // Send complete content to frontend
            sender.send(IPC_CHANNELS.STREAM_CHUNK, {
              type: 'text',
              content: responseContent,
              messageId: assistantMessageId,
              sessionId,
              replace: true, // Signal frontend to replace content
            })

            // Notify frontend about the generated image for Media Panel
            // Send base64 data for saving to disk
            sender.send(IPC_CHANNELS.IMAGE_GENERATED, {
              id: `img-${Date.now()}`,
              base64: result.imageBase64,
              prompt: prompt,
              revisedPrompt: result.revisedPrompt,
              model: modelForDisplay,
              sessionId,
              messageId: assistantMessageId,
              createdAt: Date.now(),
            })

            sender.send(IPC_CHANNELS.STREAM_COMPLETE, {
              messageId: assistantMessageId,
              sessionId,
              sessionName: updatedSessionForName?.name,
            })
            console.log('[Backend] Image generation complete')
          } else {
            // Handle error
            const errorContent = `图片生成失败: ${result.error || '未知错误'}`
            store.updateMessageContent(sessionId, assistantMessageId, errorContent)
            store.updateMessageStreaming(sessionId, assistantMessageId, false)

            sender.send(IPC_CHANNELS.STREAM_ERROR, {
              messageId: assistantMessageId,
              sessionId,
              error: result.error || 'Image generation failed',
            })
          }
        } else {
          // Normal text streaming
          // Build history from updated session (includes user message)
          const sessionForHistory = store.getSession(sessionId)
          const historyMessages = buildHistoryMessages(sessionForHistory?.messages || [], sessionForHistory)

          const ctx: StreamContext = {
            sender,
            sessionId,
            assistantMessageId,
            abortSignal: abortController.signal,
            settings,
            providerConfig: configWithApiKey,
            providerId,
            toolSettings: settings.tools,
          }

          await executeStreamGeneration(ctx, historyMessages, session?.name)
        }
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

    // Get settings and validate (use session-level model if available)
    const settings = store.getSettings()
    const { providerId, providerConfig } = getEffectiveProviderConfig(settings, sessionId)

    // Get API key (handles OAuth providers)
    const apiKey = await getApiKeyForProvider(providerId, providerConfig)
    if (!apiKey) {
      const isOAuth = requiresOAuth(providerId)
      return {
        success: false,
        error: isOAuth
          ? `Not logged in to ${providerId}. Please login in settings.`
          : 'API Key not configured',
      }
    }

    // Create config with the API key (for OAuth providers, this is the OAuth token)
    const configWithApiKey = {
      ...providerConfig,
      apiKey,
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

    // Load skills first (before tools, as SkillTool needs them in InitContext)
    const skillsSettings = settings.skills
    const skillsEnabled = skillsSettings?.enableSkills !== false
    const enabledSkills = skillsEnabled ? getSkillsForSession(session.workingDirectory) : []

    // Get agent for permission context
    const currentAgent = session.agentId ? store.getAgent(session.agentId) : undefined

    // Set init context for async tools (like SkillTool)
    if (settings.tools?.enableToolCalls) {
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
      await initializeAsyncTools()
    }

    // Add system prompt
    // Use async version to include tools with dynamic descriptions
    const allEnabledTools = settings.tools?.enableToolCalls ? await getEnabledToolsAsync() : []
    const enabledTools = allEnabledTools.filter(t => !t.id.startsWith('mcp:'))
    const mcpTools = settings.tools?.enableToolCalls ? getMCPToolsForAI() : {}

    // Check if the current model supports tools using Models.dev tool_call field
    const supportsTools = await modelRegistry.modelSupportsTools(providerConfig.model, providerId)
    if (!supportsTools) {
      console.log(`[Chat] Model ${providerConfig.model} does not support tools, skipping tool calls`)
    }

    const hasTools = supportsTools && (enabledTools.length > 0 || Object.keys(mcpTools).length > 0)

    // Load user profile (shared) and agent memory (per-agent) for system prompt
    let userProfilePrompt: string | undefined
    let agentMemoryPrompt: string | undefined
    const agentId = session.agentId

    // Get the last user message for retrieval-based memory injection
    const lastUserMsgContent = historyWithoutCurrent
      .filter(m => m.role === 'user')
      .pop()?.content
    const lastUserMsg = lastUserMsgContent ? getTextFromContent(lastUserMsgContent) : ''

    // Check if memory is enabled in settings
    const memorySettings = store.getSettings()
    const memoryEnabled = memorySettings.embedding?.memoryEnabled !== false

    // Retrieve relevant user facts based on conversation context (semantic search)
    if (memoryEnabled) {
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
    }

    // Load agent-specific memory only for agent sessions
    if (agentId && memoryEnabled) {
      try {
        const storage = getStorage()
        const agentRelationship = await storage.agentMemory.getRelationship(agentId)
        if (agentRelationship) {
          // Use semantic search to retrieve context-relevant memories
          const relevantMemories = await retrieveRelevantAgentMemories(
            storage, agentId, lastUserMsg, 5, 0.3
          )
          if (relevantMemories.length > 0) {
            console.log(`[Chat] Retrieved ${relevantMemories.length} relevant agent memories for resume context`)
          }
          agentMemoryPrompt = formatAgentMemoryPrompt(agentRelationship, relevantMemories)
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
      providerId,
      workingDirectory: session.workingDirectory,
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

    // Send continuation chunk immediately to show waiting indicator
    sender.send(IPC_CHANNELS.STREAM_CHUNK, {
      type: 'continuation',
      content: '',
      messageId,
      sessionId,
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
        providerConfig: configWithApiKey,
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

        // Log request start
        const requestStartTime = Date.now()
        console.log('[Chat] ===== Resume Request Start =====')
        console.log('[Chat] Time:', new Date(requestStartTime).toISOString())
        console.log('[Chat] Provider:', providerId)
        console.log('[Chat] Model:', configWithApiKey.model)
        console.log('[Chat] System Prompt:', systemPrompt)
        console.log('[Chat] Messages:', JSON.stringify(formatMessagesForLog(conversationMessages), null, 2))

        // Build tools for AI
        const builtinToolsForAI = convertToolDefinitionsForAI(enabledTools)
        const toolsForAI = { ...builtinToolsForAI, ...mcpTools }

        // Continue the tool loop
        const result = await runToolLoop(ctx, conversationMessages, toolsForAI, processor, enabledSkills)

        // Log request end
        const requestEndTime = Date.now()
        const requestDuration = (requestEndTime - requestStartTime) / 1000
        console.log('[Chat] ===== Resume Request End =====')
        console.log('[Chat] End Time:', new Date(requestEndTime).toISOString())
        console.log('[Chat] Duration:', requestDuration.toFixed(2), 'seconds')

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

          // Remove the failed assistant message from storage
          store.deleteMessage(sessionId, messageId)

          // Add an error message to the session (persisted)
          const errorMessage: ChatMessage = {
            id: `error-${Date.now()}`,
            role: 'error',
            content: error.message || 'Streaming error',
            timestamp: Date.now(),
            errorDetails: extractErrorDetails(error),
          }
          store.addMessage(sessionId, errorMessage)

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
