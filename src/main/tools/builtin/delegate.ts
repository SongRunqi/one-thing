/**
 * Built-in Tool: Delegate
 *
 * Delegates tasks to the Tool Agent for autonomous execution.
 * This is the core tool for the Tool Agent delegation architecture.
 *
 * When called, this tool:
 * 1. Creates a new Tool Agent context
 * 2. Executes the task autonomously using available tools
 * 3. Returns a structured result with summary and details
 */

import { v4 as uuidv4 } from 'uuid'
import type { ToolDefinition, ToolHandler } from '../types.js'
import type { Step, StepType } from '../../../shared/ipc.js'
import { executeToolAgent, type ToolAgentContext, type DelegationRequest, type ToolAgentStep } from '../../services/tool-agent/index.js'

/**
 * Format tool result for display in UI
 */
function formatToolResult(result: unknown, toolName: string): string {
  if (!result) return ''

  // For bash commands, extract stdout/stderr
  if (toolName === 'bash' && typeof result === 'object' && result !== null) {
    const bashResult = result as { stdout?: string; stderr?: string; exitCode?: number }
    let formatted = ''

    if (bashResult.stdout) {
      formatted += bashResult.stdout
    }
    if (bashResult.stderr) {
      if (formatted) formatted += '\n'
      formatted += `[stderr] ${bashResult.stderr}`
    }
    if (!formatted && bashResult.exitCode !== undefined) {
      formatted = `Exit code: ${bashResult.exitCode}`
    }

    return formatted || '(no output)'
  }

  // For other results, try to stringify nicely
  if (typeof result === 'string') {
    return result
  }

  try {
    return JSON.stringify(result, null, 2)
  } catch {
    return String(result)
  }
}

/**
 * Convert ToolAgentStep to Step format for UI display
 */
function convertAgentStepToStep(agentStep: ToolAgentStep): Step {
  // Determine step type based on tool name
  let stepType: StepType = 'tool-call'
  if (agentStep.toolName === 'bash') {
    stepType = 'command'
  } else if (agentStep.toolName.includes('read') || agentStep.toolName.includes('cat')) {
    stepType = 'file-read'
  } else if (agentStep.toolName.includes('write') || agentStep.toolName.includes('edit')) {
    stepType = 'file-write'
  }

  // Generate title based on tool and arguments
  let title = agentStep.toolName
  if (agentStep.toolName === 'bash' && agentStep.arguments.command) {
    const cmd = String(agentStep.arguments.command)
    title = cmd.length > 50 ? cmd.substring(0, 50) + '...' : cmd
  }

  return {
    id: uuidv4(),
    type: stepType,
    title,
    status: agentStep.status === 'success' ? 'completed' : 'failed',
    timestamp: agentStep.timestamp,
    thinking: agentStep.thinking,  // AI's reasoning before this step
    result: formatToolResult(agentStep.result, agentStep.toolName),
    summary: agentStep.summary,    // AI's analysis after getting the result
    error: agentStep.error,
  }
}

export const definition: ToolDefinition = {
  id: 'delegate',
  name: 'Delegate',
  description: 'Delegate a task to the Tool Agent for autonomous execution. Use this when you need to run commands, read/write files, or use other tools. The Tool Agent will execute the task and return a summary of the results.',
  parameters: [
    {
      name: 'task',
      type: 'string',
      description: 'Clear description of what needs to be done',
      required: true,
    },
    {
      name: 'context',
      type: 'string',
      description: 'Any relevant context (file paths, previous results, constraints, etc.)',
      required: false,
    },
    {
      name: 'expectedOutcome',
      type: 'string',
      description: 'What result you expect from this task',
      required: false,
    },
  ],
  enabled: true,
  autoExecute: true,  // Auto-execute; Tool Agent handles confirmation internally
  category: 'builtin',
  icon: 'bot',
}

export const handler: ToolHandler = async (args, context) => {
  try {
    const { task, context: taskContext, expectedOutcome } = args

    if (!task || typeof task !== 'string') {
      return {
        success: false,
        error: 'Task is required and must be a string',
      }
    }

    // Check if we have the extended context for Tool Agent
    if (!context.providerId || !context.providerConfig) {
      return {
        success: false,
        error: 'Delegate tool requires provider configuration. This tool can only be used in delegation mode.',
      }
    }

    console.log(`[Delegate] Starting delegation: ${task.substring(0, 50)}...`)

    // Build the delegation request
    const delegationRequest: DelegationRequest = {
      task,
      context: taskContext || '',
      expectedOutcome: expectedOutcome || '',
      sessionId: context.sessionId,
      messageId: context.messageId,
    }

    // Build the Tool Agent context
    const toolAgentContext: ToolAgentContext = {
      sessionId: context.sessionId,
      messageId: context.messageId,
      providerId: context.providerId,
      providerConfig: context.providerConfig,
      toolSettings: context.toolSettings,
      abortSignal: context.abortSignal,
      skills: context.skills,  // Pass skills for Tool Agent awareness
    }

    // Track step IDs for updates
    const stepIdMap = new Map<string, string>()  // agentStep key -> step.id

    // Execute the Tool Agent with step forwarding
    const result = await executeToolAgent(delegationRequest, toolAgentContext, {
      onStepStart: (agentStep) => {
        // Convert and forward to UI
        const step = convertAgentStepToStep(agentStep)
        step.status = 'running'  // Override to running for start
        stepIdMap.set(`${agentStep.toolName}:${agentStep.timestamp}`, step.id)
        context.onStepStart?.(step)
      },
      onStepComplete: (agentStep) => {
        // Convert and forward completion
        const step = convertAgentStepToStep(agentStep)
        // Use the same ID we assigned on start
        const existingId = stepIdMap.get(`${agentStep.toolName}:${agentStep.timestamp}`)
        if (existingId) {
          step.id = existingId
        }
        context.onStepComplete?.(step)
      },
      onStepSummary: (agentStep) => {
        // Update step with summary (AI's analysis after getting result)
        const step = convertAgentStepToStep(agentStep)
        const existingId = stepIdMap.get(`${agentStep.toolName}:${agentStep.timestamp}`)
        if (existingId) {
          step.id = existingId
        }
        // Send as update to add summary to existing step
        context.onStepComplete?.(step)
      },
      onProgress: (message) => {
        console.log(`[Delegate] Progress: ${message}`)
      },
      onError: (error) => {
        console.error(`[Delegate] Error: ${error}`)
      },
    })

    console.log(`[Delegate] Completed: success=${result.success}, toolCalls=${result.toolCallCount}`)

    // Format the result for the main LLM
    let resultSummary = `## Task Execution Result\n\n`
    resultSummary += `**Status:** ${result.success ? 'Success' : 'Failed'}\n\n`
    resultSummary += `**Summary:**\n${result.summary}\n`

    if (result.filesModified && result.filesModified.length > 0) {
      resultSummary += `\n**Files Modified:**\n${result.filesModified.map(f => `- ${f}`).join('\n')}\n`
    }

    if (result.errors && result.errors.length > 0) {
      resultSummary += `\n**Errors:**\n${result.errors.map(e => `- ${e}`).join('\n')}\n`
    }

    resultSummary += `\n**Tool Calls:** ${result.toolCallCount}\n`
    resultSummary += `**Execution Time:** ${(result.executionTimeMs / 1000).toFixed(1)}s\n`

    return {
      success: result.success,
      data: resultSummary,
      // Include structured data for Step rendering
      delegateResult: {
        success: result.success,
        summary: result.summary,
        toolCallCount: result.toolCallCount,
        filesModified: result.filesModified,
        errors: result.errors,
        executionTimeMs: result.executionTimeMs,
      },
    }
  } catch (error: any) {
    console.error('[Delegate] Execution error:', error)
    return {
      success: false,
      error: error.message || 'Failed to execute delegation',
    }
  }
}
