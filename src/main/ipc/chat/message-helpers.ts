/**
 * Message Helpers Module
 * Handles message building, history construction, and system prompt generation
 */

import * as os from 'os'
import type { ChatMessage, SkillDefinition, BuiltinAgentMode, SessionPlan } from '../../../shared/ipc.js'
import type { AIMessageContent } from '../../providers/index.js'
import { loadOsPrompt } from '../../prompts/os-prompt.js'
import { getBuiltinAgent } from '../../agents/builtin-agents.js'
// Note: buildSkillToolPrompt removed - skills are now only in Skill tool description to avoid duplication

// Base system prompt to control tool usage behavior
export const BASE_SYSTEM_PROMPT_WITH_TOOLS = `
You are a helpful assistant. Your name is "贝贝".
`

// Base system prompt for models without tool support
export const BASE_SYSTEM_PROMPT_NO_TOOLS = `
You are a helpful assistant.
`

// Planning workflow guidance
const PLANNING_GUIDANCE = `
## Task Planning (IMPORTANT)

**You MUST use the 'plan' tool for ANY task that involves multiple steps.** This helps track progress and keeps the user informed.

### When to Create a Plan (ALWAYS do this for):
- ANY task with 2 or more steps
- User asks to implement/add/create a feature
- User provides multiple requirements
- Tasks involving file modifications
- Bug fixes that require investigation

### How to Use the Plan Tool
1. **Before starting work**: Call \`plan({ todos: [...] })\` to create a task list
2. **When starting a task**: Update the plan to mark one item as 'in_progress'
3. **After completing a task**: Update the plan to mark it as 'completed'
4. **Always include ALL items** (completed + in_progress + pending) when updating

### Task Format
- content: Imperative form ("Add user authentication")
- activeForm: Present continuous ("Adding user authentication")
- status: 'pending' | 'in_progress' | 'completed'

### Example
User asks: "Add a login feature"
Your response:
1. First, call plan() to create the task list
2. Then start working on the first task

\`\`\`json
{
  "todos": [
    { "content": "Create user model", "status": "in_progress", "activeForm": "Creating user model" },
    { "content": "Add auth middleware", "status": "pending", "activeForm": "Adding auth middleware" },
    { "content": "Implement login API", "status": "pending", "activeForm": "Implementing login API" }
  ]
}
\`\`\`

**Remember: Use the plan tool proactively. Don't wait for the user to ask for a plan.**
`

// Tool usage guidance - controls how tools are selected and executed
const TOOL_USAGE_GUIDANCE = `
## Tool Usage

### Selection Priority

**File Operations - Use specialized tools:**
| Operation | ❌ Avoid | ✅ Use |
|-----------|----------|--------|
| Read file | cat, head, tail, less | read |
| Write file | echo >, cat <<EOF | write |
| Edit file | sed, awk | edit |
| Search content | grep, rg | grep |
| Find files | find, ls | glob |

**Bash is ONLY for:**
- System commands (git, npm, docker, etc.)
- Running scripts and builds
- Commands without a specialized tool equivalent

### Execution Strategy

**Batch independent calls:** Return multiple tool calls in ONE response to save round-trips.
\`\`\`
✅ Need to read 3 files? → Return read("a.ts"), read("b.ts"), read("c.ts") together
   (executed sequentially, but only 1 LLM turn)
❌ Wrong: Return read("a.ts"), wait for result, return read("b.ts"), wait...
   (wastes 3 LLM turns)
\`\`\`

**Separate dependent calls:** When result of one call is needed for another, use separate responses.
\`\`\`
Response 1: glob("*.config.ts") → returns ["vite.config.ts"]
Response 2: read("vite.config.ts") ← uses result from response 1
\`\`\`

### Parameter Rules
- **Never guess** file paths, function names, or any values
- **Never use placeholders** like "<path>" or "TODO"
- **Use exact values** from user input or previous tool results
- **Omit optional params** - don't set them to null/undefined

### Before Modifying Files
1. **Always read first** - Understand current state before changes
2. **Use edit for changes** - Prefer edit() over write() for existing files
3. **Verify paths exist** - Use glob() if unsure about file location
`

/**
 * Build plan context prompt for injection into system prompt
 * Shows current plan status so AI can continue working on it
 */
function buildPlanContextPrompt(plan: SessionPlan | undefined): string {
  if (!plan?.items.length) return ''

  const items = plan.items.map((item, idx) => {
    const icon = item.status === 'completed' ? '[x]'
      : item.status === 'in_progress' ? '[>]'
      : '[ ]'
    return `${icon} ${idx + 1}. ${item.content}`
  }).join('\n')

  const completed = plan.items.filter(i => i.status === 'completed').length
  const total = plan.items.length

  return `
## Current Plan (${completed}/${total} completed)

${items}

Continue working on the plan. Update task status using the 'plan' tool when you complete a task or start a new one.
`
}

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
 * History message type for AI conversation
 * Supports user, assistant (with optional tool calls), and tool result messages
 */
export type HistoryMessage =
  | { role: 'user'; content: AIMessageContent }
  | {
      role: 'assistant'
      content: AIMessageContent
      reasoningContent?: string
      toolCalls?: Array<{ toolCallId: string; toolName: string; args: Record<string, unknown> }>
    }
  | {
      role: 'tool'
      content: Array<{ type: 'tool-result'; toolCallId: string; toolName: string; result: unknown }>
    }

/**
 * Build history messages from session messages
 * Includes reasoningContent for assistant messages (required by DeepSeek Reasoner)
 * Includes tool calls and tool results for multi-turn tool context preservation
 * Filters out streaming messages (empty assistant messages being generated)
 * When session has a summary, uses [summary] + [recent messages] to reduce context window usage
 */
export function buildHistoryMessages(
  messages: ChatMessage[],
  session?: { summary?: string; summaryUpToMessageId?: string }
): HistoryMessage[] {
  // If session has a summary, use it to reduce context
  if (session?.summary && session?.summaryUpToMessageId) {
    const summaryIndex = messages.findIndex(m => m.id === session.summaryUpToMessageId)

    if (summaryIndex !== -1) {
      // Get messages after the summary point
      const recentMessages = messages.slice(summaryIndex + 1)

      // Build the history with summary + recent messages
      const result: HistoryMessage[] = []

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

      // Add recent messages with tool call context
      for (const m of recentMessages) {
        if (m.role !== 'user' && m.role !== 'assistant') continue
        if (m.isStreaming) continue
        // Skip messages with empty content (causes API error)
        if (!m.content && (!m.attachments || m.attachments.length === 0)) continue

        if (m.role === 'user') {
          result.push({
            role: 'user',
            content: buildMessageContent(m),
          })
        } else {
          // Assistant message
          const assistantMsg: HistoryMessage & { role: 'assistant' } = {
            role: 'assistant',
            content: buildMessageContent(m),
          }

          if (m.reasoning) {
            assistantMsg.reasoningContent = m.reasoning
          }

          // Include completed/failed tool calls
          const completedToolCalls = m.toolCalls?.filter(
            tc => tc.status === 'completed' || tc.status === 'failed'
          )

          if (completedToolCalls && completedToolCalls.length > 0) {
            assistantMsg.toolCalls = completedToolCalls.map(tc => ({
              toolCallId: tc.id,
              toolName: tc.toolName,
              args: tc.arguments,
            }))
          }

          result.push(assistantMsg)

          // Add tool result message
          if (completedToolCalls && completedToolCalls.length > 0) {
            result.push({
              role: 'tool',
              content: completedToolCalls.map(tc => ({
                type: 'tool-result' as const,
                toolCallId: tc.id,
                toolName: tc.toolName,
                result: tc.status === 'completed' ? tc.result : { error: tc.error },
              })),
            })
          }
        }
      }

      console.log(`[buildHistoryMessages] Using summary + ${recentMessages.length} recent messages`)
      return result
    }
  }

  // No summary - use full history
  const result: HistoryMessage[] = []

  for (const m of messages) {
    // Only include user and assistant messages
    if (m.role !== 'user' && m.role !== 'assistant') continue
    // Exclude streaming messages (current message being generated)
    if (m.isStreaming) continue
    // Exclude messages with empty content (causes API error)
    if (!m.content && (!m.attachments || m.attachments.length === 0)) continue

    if (m.role === 'user') {
      result.push({
        role: 'user',
        content: buildMessageContent(m),
      })
    } else {
      // Assistant message
      const assistantMsg: HistoryMessage & { role: 'assistant' } = {
        role: 'assistant',
        content: buildMessageContent(m),
      }

      // Include reasoning content for assistant messages (needed for DeepSeek Reasoner)
      if (m.reasoning) {
        assistantMsg.reasoningContent = m.reasoning
      }

      // Include completed/failed tool calls for context preservation across turns
      const completedToolCalls = m.toolCalls?.filter(
        tc => tc.status === 'completed' || tc.status === 'failed'
      )

      if (completedToolCalls && completedToolCalls.length > 0) {
        assistantMsg.toolCalls = completedToolCalls.map(tc => ({
          toolCallId: tc.id,
          toolName: tc.toolName,
          args: tc.arguments,
        }))
      }

      result.push(assistantMsg)

      // Add tool result message after assistant message with tool calls
      if (completedToolCalls && completedToolCalls.length > 0) {
        result.push({
          role: 'tool',
          content: completedToolCalls.map(tc => ({
            type: 'tool-result' as const,
            toolCallId: tc.id,
            toolName: tc.toolName,
            result: tc.status === 'completed' ? tc.result : { error: tc.error },
          })),
        })
      }
    }
  }

  return result
}

/**
 * Filter history messages for non-tool-aware APIs
 * Removes tool messages and extracts only user/assistant messages
 * Used for APIs like generateChatResponseWithReasoning that don't support tool messages
 */
export function filterHistoryForNonToolAPI(
  messages: HistoryMessage[]
): Array<{ role: 'user' | 'assistant'; content: AIMessageContent; reasoningContent?: string }> {
  return messages
    .filter((m): m is HistoryMessage & { role: 'user' | 'assistant' } =>
      m.role === 'user' || m.role === 'assistant'
    )
    .map(m => {
      if (m.role === 'user') {
        return { role: 'user' as const, content: m.content }
      }
      const result: { role: 'assistant'; content: AIMessageContent; reasoningContent?: string } = {
        role: 'assistant',
        content: m.content,
      }
      if (m.reasoningContent) {
        result.reasoningContent = m.reasoningContent
      }
      return result
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
  builtinMode?: BuiltinAgentMode  // Ask mode / Build mode
  sessionPlan?: SessionPlan  // Current session plan for context injection
}): string {
  const { hasTools, skills, workspaceSystemPrompt, userProfilePrompt, agentMemoryPrompt, workingDirectory, builtinMode, sessionPlan } = options
  // Use appropriate base prompt based on tool support
  let prompt = hasTools ? BASE_SYSTEM_PROMPT_WITH_TOOLS : BASE_SYSTEM_PROMPT_NO_TOOLS

  // Inject builtin agent mode-specific prompt (Plan mode restrictions)
  if (builtinMode && builtinMode !== 'build') {
    const builtinAgent = getBuiltinAgent(builtinMode)
    if (builtinAgent.systemPromptAddition) {
      prompt = builtinAgent.systemPromptAddition + prompt
    }
  }

  // Prepend workspace/agent system prompt if provided (for character/persona)
  if (workspaceSystemPrompt && workspaceSystemPrompt.trim()) {
    prompt = workspaceSystemPrompt.trim() + '\n\n' + prompt
  }

  // Add working directory information for file operations
  // This helps the model use correct paths instead of hallucinating
  // ALWAYS inject baseDir (~) so the model knows the user's home directory
  const baseDir = os.homedir()
  if (workingDirectory) {
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
  } else {
    // Even without workingDirectory, always include baseDir for reference
    prompt += `
# Base Directory
Base directory: ${baseDir} (referred to as ~)
`
  }

  // Add OS-specific prompt if available
  const osPrompt = loadOsPrompt()
  if (osPrompt) {
    prompt += `\n\n# Operating System Context\n${osPrompt}`
  }

  // Add planning and tool usage guidance when tools are available
  if (hasTools) {
    prompt += '\n' + PLANNING_GUIDANCE
    prompt += '\n' + TOOL_USAGE_GUIDANCE
  }

  // Add current plan context if available
  const planContext = buildPlanContextPrompt(sessionPlan)
  if (planContext) {
    prompt += '\n' + planContext
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

  // Skills information is now included in the Skill tool's description
  // No need to duplicate in system prompt (was causing ~2x token usage)

  return prompt
}
