/**
 * Tool Execution Module
 * Handles tool detection, execution, and step management
 */

import { v4 as uuidv4 } from 'uuid'
import * as store from '../../store.js'
import { IPC_CHANNELS } from '../../../shared/ipc.js'
import type { Step, StepType, SkillDefinition, ToolCall } from '../../../shared/ipc.js'
import { executeTool } from '../../tools/index.js'
import { isMCPTool, executeMCPTool } from '../../mcp/index.js'
import type { ToolExecutionContext, ToolExecutionResult } from '../../tools/types.js'
import type { StreamContext } from './stream-processor.js'

/**
 * Detect if a bash command is reading a skill file and extract skill name
 */
export function detectSkillUsage(toolName: string, args: Record<string, any>): string | null {
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
export function getStepType(toolName: string, args: Record<string, any>): StepType {
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
export function generateStepTitle(toolName: string, args: Record<string, any>, skillName?: string | null): string {
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
export async function executeToolDirectly(
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
export function createStep(
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

/**
 * Execute a tool (MCP or built-in) and update tool call status
 */
export async function executeToolAndUpdate(
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
