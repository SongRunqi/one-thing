/**
 * Tool Execution Module
 * Handles tool detection, execution, and step management
 */

import { v4 as uuidv4 } from 'uuid'
import * as store from '../../store.js'
import type { Step, StepType, SkillDefinition, ToolCall } from '../../../shared/ipc.js'
import { executeTool } from '../../tools/index.js'
import { isMCPTool, executeMCPTool } from '../../mcp/index.js'
import type { ToolExecutionContext, ToolExecutionResult } from '../../tools/types.js'
import type { StreamContext } from './stream-processor.js'
import { checkToolPermission } from '../../agents/builtin-agents.js'
import { createIPCEmitter, type IPCEmitter } from './ipc-emitter.js'

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
    return `Reading ${skillName} skill documentation`
  }

  if (toolName === 'bash') {
    const command = args.command as string || ''
    // Show full command (CSS handles wrapping for long commands)
    return `Run: ${command}`
  }

  // For MCP tools, show a cleaner name
  if (toolName.includes(':')) {
    const parts = toolName.split(':')
    const shortName = parts[parts.length - 1]
    return `Tool: ${shortName}`
  }

  return `Tool: ${toolName}`
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
    // Check if aborted before starting
    if (context.abortSignal?.aborted) {
      return {
        success: false,
        error: 'Execution cancelled by user',
        aborted: true,
      }
    }

    // 1. Check if it's an MCP tool
    if (isMCPTool(toolName)) {
      console.log(`[DirectExec] Executing MCP tool: ${toolName}`)
      // Check abort before MCP call (MCP tools don't support abort internally)
      if (context.abortSignal?.aborted) {
        return { success: false, error: 'Execution cancelled by user', aborted: true }
      }
      const result = await executeMCPTool(toolName, args)
      // Check abort after MCP call in case it was triggered during execution
      if (context.abortSignal?.aborted) {
        return { success: false, error: 'Execution cancelled by user', aborted: true }
      }
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
    // Check if error is due to abort signal
    const isAborted = context.abortSignal?.aborted ||
      error.message?.includes('cancelled') ||
      error.message?.includes('aborted')
    return {
      success: false,
      error: error.message || 'Unknown error during tool execution',
      aborted: isAborted,
    }
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
  turnIndex?: number,
  existingStepId?: string
): Promise<void> {
  const emitter = createIPCEmitter(ctx)

  // Check if aborted before starting
  if (ctx.abortSignal?.aborted) {
    console.log(`[Backend] Tool execution aborted before start: ${toolCallData.toolName}`)
    toolCall.status = 'failed'
    toolCall.error = 'Execution cancelled by user'
    toolCall.endTime = Date.now()
    store.updateMessageToolCalls(ctx.sessionId, ctx.assistantMessageId, allToolCalls)
    emitter.sendToolResult(toolCall)
    return
  }

  // Check if this is reading a skill file
  const skillName = detectSkillUsage(toolCallData.toolName, toolCallData.args)
  if (skillName) {
    console.log(`[Backend] Skill activated: ${skillName}`)
    emitter.sendSkillActivated(skillName)
  }

  // Check if a placeholder step already exists (from streaming input start)
  // Priority: use existingStepId from processor (most reliable), then fallback to store lookup
  const session = store.getSession(ctx.sessionId)
  const message = session?.messages?.find(m => m.id === ctx.assistantMessageId)
  let existingStep: Step | undefined
  
  if (existingStepId) {
    // Use the step ID from the stream processor (passed from tool-loop)
    existingStep = message?.steps?.find(s => s.id === existingStepId)
  }
  if (!existingStep) {
    // Fallback: lookup by toolCallId
    existingStep = message?.steps?.find(s => s.toolCallId === toolCall.id)
  }



  let step: Step
  if (existingStep) {
    // Update existing placeholder step with final info
    step = existingStep
    step.title = generateStepTitle(toolCall.toolName, toolCallData.args, skillName)
    step.toolCall = { ...toolCall }
    step.turnIndex = turnIndex

    // Update in store and notify frontend
    emitter.sendStepUpdated(step.id, {
      title: step.title,
      toolCall: step.toolCall,
      turnIndex: step.turnIndex,
    })

  } else {
    // Create new step (fallback for non-streaming providers)
    step = createStep(toolCall, skillName, turnIndex)
    emitter.sendStepAdded(step)
  }

  toolCall.status = 'executing'
  toolCall.startTime = Date.now()

  store.updateMessageToolCalls(ctx.sessionId, ctx.assistantMessageId, allToolCalls)
  // Send executing status to frontend so UI shows "Calling..." with spinner
  emitter.sendToolCall(toolCall)

  let result: {
    success: boolean
    data?: any
    error?: string
    requiresConfirmation?: boolean
    commandType?: 'read-only' | 'dangerous' | 'forbidden'
    aborted?: boolean
  }

  // Get session's workingDirectory for sandbox boundary (reuse session from above)
  const workingDirectory = session?.workingDirectory
  const builtinMode = session?.builtinMode || 'build'

  // Check tool permission based on builtin mode (Plan mode vs Build mode)
  const permCheck = checkToolPermission(toolCallData.toolName, toolCallData.args, builtinMode)
  if (!permCheck.allowed) {
    console.log(`[Backend] Tool blocked by ${builtinMode} mode:`, toolCallData.toolName, permCheck.reason)
    toolCall.endTime = Date.now()
    toolCall.status = 'failed'
    toolCall.error = permCheck.reason

    // Update step with error
    emitter.sendStepUpdated(step.id, {
      status: 'failed',
      toolCall: { ...toolCall },
      error: permCheck.reason,
    })

    store.updateMessageToolCalls(ctx.sessionId, ctx.assistantMessageId, allToolCalls)
    emitter.sendToolResult(toolCall)
    return
  }

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
        // Only use title if it's a string (avoid [object Object] from arrays)
        if (update.title && typeof update.title === 'string') {
          metadataUpdates.title = update.title
        }
        if (update.metadata) {
          // Store metadata in step for later use
          metadataUpdates.result = typeof update.metadata.output === 'string'
            ? update.metadata.output
            : JSON.stringify(update.metadata)

          // If metadata contains diff info (edit tool), store in toolCall.changes
          if (update.metadata.diff) {
            const changesData = {
              diff: update.metadata.diff as string,
              filePath: update.metadata.filePath as string,
              additions: (update.metadata.additions as number) || 0,
              deletions: (update.metadata.deletions as number) || 0,
              originalContent: update.metadata.originalContent as string | undefined,  // For rollback
            }

            // ★ 关键：同时更新局部 step 对象（因为 store.getSession 返回的是副本）
            if (!step.toolCall) {
              step.toolCall = { ...toolCall }
            }
            step.toolCall.changes = changesData

            metadataUpdates.toolCall = {
              ...step.toolCall,
            }
          }
        }
        // Only send update if there are changes
        if (Object.keys(metadataUpdates).length > 0) {
          emitter.sendStepUpdated(step.id, metadataUpdates)
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
    // Preserve step.toolCall.changes (set by onMetadata before permission request)
    emitter.sendStepUpdated(step.id, {
      status: 'awaiting-confirmation',
      toolCall: { ...toolCall, changes: step.toolCall?.changes },
    })
  } else {
    // Determine status: cancelled if aborted, otherwise completed/failed based on success
    if (result.aborted) {
      toolCall.status = 'cancelled'
    } else {
      toolCall.status = result.success ? 'completed' : 'failed'
    }
    toolCall.result = result.data
    toolCall.error = result.error
    // Update step status based on result, include result/error
    const stepStatus = result.aborted ? 'cancelled' : (result.success ? 'completed' : 'failed')
    // Extract title from result.data if available (V2 tools return title in data)
    // Only use if it's a string - avoid [object Object] display for arrays/objects
    const rawTitle = result.data?.title
    const finalTitle = (typeof rawTitle === 'string' ? rawTitle : null) || step.title
    emitter.sendStepUpdated(step.id, {
      status: stepStatus,
      title: finalTitle,  // Update title with final result title
      // Preserve step.toolCall.changes (set by onMetadata) when updating
      toolCall: { ...toolCall, changes: step.toolCall?.changes },
      result: typeof result.data === 'string' ? result.data : JSON.stringify(result.data),
      error: result.error,
    })
  }

  store.updateMessageToolCalls(ctx.sessionId, ctx.assistantMessageId, allToolCalls)
  emitter.sendToolResult(toolCall)
}
