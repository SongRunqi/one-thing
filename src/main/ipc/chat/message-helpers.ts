/**
 * Message Helpers Module
 * Handles message building, history construction, and system prompt generation
 */

import * as os from 'os'
import type { ChatMessage, SkillDefinition } from '../../../shared/ipc.js'
import type { AIMessageContent } from '../../providers/index.js'
import { buildSkillToolPrompt } from '../../skills/prompt-builder.js'

// Base system prompt to control tool usage behavior
export const BASE_SYSTEM_PROMPT_WITH_TOOLS = `
You are a helpful assistant. Your name is "贝贝".
`

// Base system prompt for models without tool support
export const BASE_SYSTEM_PROMPT_NO_TOOLS = `
You are a helpful assistant.
`

/**
 * Format messages for logging without full base64 data
 */
export function formatMessagesForLog(messages: unknown[]): unknown[] {
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

/**
 * Convert message with attachments to multimodal format
 */
export function buildMessageContent(message: ChatMessage): AIMessageContent {
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

/**
 * Build history messages from session messages
 * Includes reasoningContent for assistant messages (required by DeepSeek Reasoner)
 * Filters out streaming messages (empty assistant messages being generated)
 * When session has a summary, uses [summary] + [recent messages] to reduce context window usage
 */
export function buildHistoryMessages(
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

/**
 * Build dynamic system prompt with optional skills awareness and workspace character
 */
export function buildSystemPrompt(options: {
  hasTools: boolean
  skills: SkillDefinition[]
  workspaceSystemPrompt?: string
  userProfilePrompt?: string
  agentMemoryPrompt?: string
  providerId?: string
  workingDirectory?: string
}): string {
  const { hasTools, skills, workspaceSystemPrompt, userProfilePrompt, agentMemoryPrompt, workingDirectory } = options
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
