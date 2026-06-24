/**
 * Tool Execution Module
 * Handles tool detection, execution, and step management
 */

import { v4 as uuidv4 } from 'uuid'
import * as store from '../../store.js'
import type { Step, StepType, SkillDefinition, ToolCall } from '../../../shared/ipc.js'
import { toJsonValue, type JsonObject } from '../../../shared/json.js'
import { analyzeTool, executeTool } from '../../tools/index.js'
import { isMCPTool, executeMCPTool } from '../../mcp/index.js'
import { Permission } from '../../permission/index.js'
import type { ToolExecutionContext, ToolExecutionResult, ToolPartialResultUpdate } from '../../tools/types.js'
import type { StreamContext } from './stream-processor.js'
import { createEventOnlyEmitter } from '../../events/event-only-emitter.js'
import { enforcePermissionPolicy } from '../../tools/core/permission-policy.js'
import { textFromToolResult, toolFailureText, toolResultToStructured, type ToolResultLike } from '../../tools/core/tool-result.js'
import type { ToolEffect } from '../../tools/core/tool-effect.js'

function isPermissionRejectedError(error: Error): error is Permission.RejectedError {
  return error instanceof Permission.RejectedError ||
    error.name === 'PermissionRejectedError'
}

function toolResultObject(value: ToolExecutionResult['data']): ToolResultLike | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as ToolResultLike
    : undefined
}

function streamableToolResult(value: ToolExecutionResult['data']): string | ToolResultLike | undefined {
  if (typeof value === 'string') return value
  return toolResultObject(value)
}

/**
 * Detect if a bash command is reading a skill file and extract skill name
 */
export function detectSkillUsage(toolName: string, args: JsonObject): string | null {
  if (toolName !== 'bash') return null

  const command = typeof args.command === 'string' ? args.command : ''
  if (!command) return null

  // Match patterns like:
  // cat ~/.onething/skills/writing/docs/SKILL.md
  const skillPathMatch = command.match(/(?:cat|less|head|tail|more)\s+.*[/~]\.onething\/skills\/(.+?)\/SKILL\.md/)
  if (skillPathMatch) {
    return skillPathMatch[1].split('/').pop() || skillPathMatch[1]
  }

  return null
}

/**
 * Determine step type from tool name and arguments
 */
export function getStepType(toolName: string, args: JsonObject): StepType {
  if (toolName === 'bash') {
    const command = typeof args.command === 'string' ? args.command : ''
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

function textFromPartialResult(update: ToolPartialResultUpdate): string {
  return textFromToolResult(update) || JSON.stringify(update)
}

/**
 * Generate a human-readable step title from tool name and arguments
 */
export function generateStepTitle(toolName: string, args: JsonObject, skillName?: string | null): string {
  if (skillName) {
    return `Reading ${skillName} skill documentation`
  }

  if (toolName === 'bash') {
    const command = typeof args.command === 'string' ? args.command : ''
    // Show full command (CSS handles wrapping for long commands)
    return `Run: ${command}`
  }

  const lowerName = toolName.toLowerCase()
  const isFile = [
    'read', 'view_file', 'read_file', 'view-file', 'read-file',
    'write', 'write_to_file', 'write_file', 'write-file',
    'edit', 'replace_file_content', 'multi_replace_file_content'
  ].includes(lowerName)

  if (isFile) {
    const rawPath = args.path || args.AbsolutePath || args.TargetFile || args.filePath || ''
    if (rawPath) {
      const normalized = String(rawPath).replace(/\\/g, '/').replace(/\/+$/, '')
      const filename = normalized.split('/').filter(Boolean).pop() || normalized
      if (filename) {
        return `Tool: ${toolName}: ${filename}`
      }
    }
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
  args: JsonObject,
  context: {
    sessionId: string
    messageId: string
    toolCallId?: string
    workingDirectory?: string  // Session's active working directory
    workingDirectoryRoots?: string[] // Additional sandbox roots
    abortSignal?: AbortSignal
    onMetadata?: ToolExecutionContext['onMetadata']
    onPartialResult?: (update: ToolPartialResultUpdate) => void
    // Step event callbacks for sub-agent tools (e.g., CustomAgent)
    onStepStart?: (step: Step) => void
    onStepComplete?: (step: Step) => void
    beforeSideEffect?: () => Promise<void>
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
      const isMCPRouter = toolName === 'mcp_search' || toolName === 'tool_function'
      const isRouterReadOnly = isMCPRouter && args.action !== 'call'
      if (!isRouterReadOnly) {
        const routerResourceName = typeof args.tool === 'string'
          ? args.tool
          : typeof args.function === 'string' ? args.function : undefined
        const resourceName = isMCPRouter && routerResourceName
          ? routerResourceName
          : toolName
        const effects: ToolEffect[] = [{
          kind: 'mcp',
          resources: [resourceName],
          barrier: true,
          metadata: { toolName, arguments: args },
        }]
        await enforcePermissionPolicy({
          sessionId: context.sessionId,
          messageId: context.messageId,
          toolCallId: context.toolCallId,
          toolName,
          effects,
          preview: { title: `Call MCP tool: ${resourceName}`, metadata: { toolName, arguments: args } },
          workspaceRoot: context.workingDirectory,
        })
        await context.beforeSideEffect?.()
      }
      const result = await executeMCPTool(toolName, args, {
        onPartialResult: (text, phase) => {
          context.onPartialResult?.({
            content: [{ type: 'text', text }],
            details: { phase, toolName, functionName: args.function },
          })
        },
      })
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
      workingDirectoryRoots: context.workingDirectoryRoots,
      abortSignal: context.abortSignal,
      onMetadata: context.onMetadata,
      onPartialResult: context.onPartialResult,
      // Forward step callbacks for sub-agent tools (e.g., CustomAgent)
      onStepStart: context.onStepStart,
      onStepComplete: context.onStepComplete,
      beforeSideEffect: context.beforeSideEffect,
    }
    const analysis = await analyzeTool(toolName, args, execContext)
    if (!analysis.success) {
      return { success: false, error: analysis.error || 'Tool analysis failed' }
    }
    if (analysis.preview && context.onMetadata) {
      context.onMetadata({
        title: analysis.preview.title,
        metadata: {
          ...(analysis.preview.metadata ?? {}),
          ...(analysis.preview.path && { path: analysis.preview.path }),
          ...(analysis.preview.diff && { diff: analysis.preview.diff }),
          ...(analysis.preview.additions !== undefined && { additions: analysis.preview.additions }),
          ...(analysis.preview.deletions !== undefined && { deletions: analysis.preview.deletions }),
        },
      })
    }
    await enforcePermissionPolicy({
      sessionId: context.sessionId,
      messageId: context.messageId,
      toolCallId: context.toolCallId,
      toolName,
      effects: analysis.effects ?? [],
      preview: analysis.preview,
      workspaceRoot: context.workingDirectory,
    })
    execContext.approvedAnalysis = {
      effects: analysis.effects ?? [],
      preview: analysis.preview,
    }
    const result = await executeTool(toolName, args, execContext)
    return result
  } catch (error) {
    const caught = error instanceof Error ? error : new Error(String(error))
    if (isPermissionRejectedError(caught)) {
      console.log(`[DirectExec] Permission rejected for tool ${toolName}`)
      return {
        success: false,
        error: toolFailureText({ error: caught.message, rejected: true, rejectionReason: caught.reason }),
        rejected: true,
        rejectionReason: caught.reason,
      }
    }

    console.error(`[DirectExec] Tool execution error:`, caught)
    // Check if error is due to abort signal
    const isAborted = context.abortSignal?.aborted ||
      caught.message.includes('cancelled') ||
      caught.message.includes('aborted')
    return {
      success: false,
      error: caught.message || 'Unknown error during tool execution',
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
  toolCallData: { toolName: string; args: JsonObject },
  allToolCalls: ToolCall[],
  _skills: SkillDefinition[] = [],
  turnIndex?: number,
  existingStepId?: string,
  options: {
    beforeSideEffect?: () => Promise<void>
  } = {},
): Promise<void> {
  const emitter = createEventOnlyEmitter(ctx)

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
    // Use the step ID from the stream processor.
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

  emitter.sendToolExecutionStart(toolCall.id, step.id, toolCallData.toolName, toolCallData.args)

  toolCall.status = 'executing'
  toolCall.startTime = Date.now()

  store.updateMessageToolCalls(ctx.sessionId, ctx.assistantMessageId, allToolCalls)
  // Send executing status to frontend so UI shows "Calling..." with spinner
  emitter.sendToolCall(toolCall)

  // Get session's workingDirectory for sandbox boundary (reuse session from above)
  const workingDirectory = session?.workingDirectory
  const workingDirectoryRoots = session?.workingDirectoryRoots
  let sideEffectStarted = false

  const markSideEffectStarted = async () => {
    await options.beforeSideEffect?.()

    if (sideEffectStarted) return
    sideEffectStarted = true

    toolCall.status = 'executing'
    toolCall.requiresConfirmation = false
    toolCall.startTime = Date.now()
    store.updateMessageToolCalls(ctx.sessionId, ctx.assistantMessageId, allToolCalls)
    emitter.sendToolCall(toolCall)
    emitter.sendStepUpdated(step.id, {
      status: 'running',
      toolCall: { ...toolCall, changes: step.toolCall?.changes },
    })
  }

  // Execute tool directly (no LLM overhead)
  const result = await executeToolDirectly(
    toolCallData.toolName,
    { ...toolCallData.args },
    {
      sessionId: ctx.sessionId,
      messageId: ctx.assistantMessageId,
      toolCallId: toolCall.id,
      workingDirectory,  // Pass session's working directory for sandbox
      workingDirectoryRoots,
      abortSignal: ctx.abortSignal,
      // Tool metadata streaming callback
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
            const changedPath = update.metadata.path as string
            const changesData = {
              diff: update.metadata.diff as string,
              filePath: changedPath,
              additions: (update.metadata.additions as number) || 0,
              deletions: (update.metadata.deletions as number) || 0,
              originalContent: update.metadata.originalContent as string | undefined,
              originalContentHash: update.metadata.originalContentHash as string | undefined,
              afterContentHash: update.metadata.afterContentHash as string | undefined,
              auditId: update.metadata.auditId as string | undefined,
              auditPath: update.metadata.auditPath as string | undefined,
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
      onPartialResult: (update) => {
        emitter.sendToolExecutionUpdate(toolCall.id, step.id, update)
        emitter.sendStepUpdated(step.id, {
          status: 'running',
          partialResult: update,
          partialResultIsPartial: true,
          result: textFromPartialResult(update),
        })
      },
      onStepStart: (subStep: Step) => {
        emitter.sendStepAdded(subStep)
      },
      onStepComplete: (subStep: Step) => {
        emitter.sendStepUpdated(subStep.id, {
          status: subStep.status,
          result: subStep.result,
          error: subStep.error,
        })
      },
      beforeSideEffect: markSideEffectStarted,
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
    const finalError = result.success
      ? undefined
      : toolFailureText({
          error: result.error,
          rejected: result.rejected,
          rejectionReason: result.rejectionReason,
          status: result.aborted ? 'cancelled' : 'failed',
        })
    toolCall.result = toJsonValue(result.data)
    toolCall.error = finalError
    toolCall.rejected = result.rejected || undefined
    toolCall.rejectionReason = result.rejectionReason
    toolCall.requiresConfirmation = false
    // Update step status based on result, include result/error
    const stepStatus = result.aborted ? 'cancelled' : (result.success ? 'completed' : 'failed')
    // Extract title from result.data if available (tools return title in data)
    // Only use if it's a string - avoid [object Object] display for arrays/objects
    const rawTitle = toolResultObject(result.data)?.title
    const finalTitle = (typeof rawTitle === 'string' ? rawTitle : null) || step.title
    const structuredResult = result.success ? toolResultToStructured(streamableToolResult(result.data)) : undefined
    emitter.sendToolExecutionEnd(toolCall.id, step.id, structuredResult, !result.success, finalError)
    emitter.sendStepUpdated(step.id, {
      status: stepStatus,
      title: finalTitle,  // Update title with final result title
      // Preserve step.toolCall.changes (set by onMetadata) when updating
      toolCall: { ...toolCall, changes: step.toolCall?.changes },
      partialResult: structuredResult,
      partialResultIsPartial: false,
      result: typeof result.data === 'string' ? result.data : JSON.stringify(result.data),
      error: finalError,
      rejected: result.rejected || undefined,
      rejectionReason: result.rejectionReason,
    })
  }

  store.updateMessageToolCalls(ctx.sessionId, ctx.assistantMessageId, allToolCalls)
  emitter.sendToolResult(toolCall)
  // TEMP [WaitingGap] diagnostic: when a tool result becomes visible (esp. failed)
  console.info('[WaitingGap] tool settled', { tool: toolCall.toolName, status: toolCall.status, t: Date.now() })
}
