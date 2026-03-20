/**
 * Custom Agent Executor
 *
 * Executes CustomAgents in an isolated context with their custom tools.
 * Runs a tool loop similar to ToolAgent but with custom tools only.
 */

import type { ProviderConfig } from '../../../shared/ipc/providers.js'
import type {
  CustomAgent,
  CustomAgentResult,
  CustomAgentStep,
  CustomToolResult,
} from '../../../shared/ipc/custom-agents.js'
import {
  streamChatResponseWithTools,
  type ToolChatMessage,
} from '../../providers/index.js'
import {
  buildCustomAgentSystemPrompt,
  convertCustomToolsForAI,
  getCustomToolById,
  getBuiltinToolsById,
  isBuiltinTool,
} from './tool-builder.js'
import { executeCustomTool } from './custom-tool-executor.js'
import { executeTool } from '../../tools/index.js'

/**
 * Debug flag for verbose logging
 */
const DEBUG_CUSTOM_AGENT = true

/**
 * Permission decision type for onPermissionRequired callback
 */
export type PermissionDecision = 'allow' | 'always' | 'reject'

/**
 * Tool call info passed to onPermissionRequired callback
 */
export interface PermissionToolCall {
  id: string
  toolName: string
  arguments: Record<string, unknown>
  commandType?: 'read-only' | 'dangerous' | 'forbidden'
  error?: string  // The permission error message
}

/**
 * Event emitter interface for CustomAgent progress updates
 */
export interface CustomAgentEvents {
  onStepStart?: (step: CustomAgentStep) => void
  onStepComplete?: (step: CustomAgentStep) => void
  onTextChunk?: (text: string) => void
  onProgress?: (message: string) => void
  onError?: (error: string) => void
  /**
   * Called when a tool requires user permission (e.g., dangerous bash commands)
   * The callback should return a Promise that resolves to the user's decision
   * @param stepId - ID of the step awaiting confirmation
   * @param toolCall - Details of the tool call requiring permission
   * @returns Promise<PermissionDecision> - 'allow' (once), 'always' (whitelist), or 'reject'
   */
  onPermissionRequired?: (stepId: string, toolCall: PermissionToolCall) => Promise<PermissionDecision>
}

/**
 * Request to execute a CustomAgent
 */
export interface CustomAgentRequest {
  /** The task to perform */
  task: string
  /** Session ID for tool execution context */
  sessionId: string
  /** Message ID for tool execution context */
  messageId: string
  /** Working directory for file operations */
  workingDirectory?: string
  /** Abort signal for cancellation */
  abortSignal?: AbortSignal
}

/**
 * Context for CustomAgent execution
 */
export interface CustomAgentContext {
  providerId: string
  providerConfig: ProviderConfig
}

/**
 * Execute a CustomAgent with the given task
 *
 * This function:
 * 1. Creates an isolated context with only the agent's custom tools
 * 2. Runs an autonomous tool loop until completion
 * 3. Returns a structured result for the main LLM
 */
export async function executeCustomAgent(
  agent: CustomAgent,
  request: CustomAgentRequest,
  context: CustomAgentContext,
  events?: CustomAgentEvents
): Promise<CustomAgentResult> {
  const startTime = Date.now()
  const steps: CustomAgentStep[] = []
  const errors: string[] = []

  // Get settings from agent
  const maxToolCalls = agent.maxToolCalls ?? 20
  const timeoutMs = agent.timeoutMs ?? 120000

  // Build custom tools for AI
  let toolsForAI = convertCustomToolsForAI(agent.customTools)

  // Merge built-in tools if enabled and tools are specified
  if (agent.allowBuiltinTools && agent.allowedBuiltinTools?.length) {
    // Load only the specified builtin tools (ignores global enabled settings)
    const builtinTools = await getBuiltinToolsById(
      agent.allowedBuiltinTools,
      { workingDirectory: request.workingDirectory, sessionId: request.sessionId }
    )

    // Merge: custom tools take precedence over builtin tools
    toolsForAI = { ...builtinTools, ...toolsForAI }

    if (DEBUG_CUSTOM_AGENT) {
      console.log(`[CustomAgent] Added ${Object.keys(builtinTools).length} built-in tools:`, agent.allowedBuiltinTools)
    }
  }

  // Check if any tools are available
  const toolCount = Object.keys(toolsForAI).length
  if (toolCount === 0) {
    return {
      success: false,
      summary: 'No tools available for this agent',
      output: 'The CustomAgent has no tools defined and no built-in tools are enabled.',
      steps: [],
      toolCallCount: 0,
      executionTimeMs: Date.now() - startTime,
      errors: ['No tools defined'],
    }
  }

  // Build system prompt
  const systemPrompt = buildCustomAgentSystemPrompt(agent)

  // Build user prompt with the task
  const userPrompt = `## Task

${request.task}

Please complete this task using the available tools. When done, provide a summary of what was accomplished.`

  // Initialize conversation
  const conversationMessages: ToolChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ]

  let accumulatedContent = ''
  let toolCallCount = 0
  let currentTurn = 0
  const MAX_TURNS = Math.ceil(maxToolCalls / 3) // Assume ~3 tool calls per turn

  events?.onProgress?.(`Starting CustomAgent "${agent.name}" for task: ${request.task.substring(0, 50)}...`)

  if (DEBUG_CUSTOM_AGENT) {
    console.log(`[CustomAgent] Starting execution of "${agent.name}"`)
    console.log(`[CustomAgent] Task: ${request.task}`)
    console.log(`[CustomAgent] Available tools:`, Object.keys(toolsForAI))
  }

  // Set up timeout
  const timeoutController = new AbortController()
  const timeoutId = setTimeout(() => {
    timeoutController.abort()
  }, timeoutMs)

  // Combine abort signals
  const combinedSignal = request.abortSignal
    ? AbortSignal.any([request.abortSignal, timeoutController.signal])
    : timeoutController.signal

  try {
    // Tool loop - run until no more tool calls or max iterations reached
    while (currentTurn < MAX_TURNS && toolCallCount < maxToolCalls) {
      currentTurn++

      const toolCallsThisTurn: Array<{
        id: string
        toolName: string
        args: Record<string, unknown>
        result?: CustomToolResult
      }> = []

      let turnContent = ''

      if (DEBUG_CUSTOM_AGENT) {
        console.log(`[CustomAgent] Starting turn ${currentTurn}`)
      }

      // Stream the AI response
      const stream = streamChatResponseWithTools(
        context.providerId,
        {
          apiKey: context.providerConfig.apiKey ?? '',
          baseUrl: context.providerConfig.baseUrl,
          model: context.providerConfig.model ?? '',
        },
        conversationMessages,
        toolsForAI,
        { abortSignal: combinedSignal }
      )

      for await (const chunk of stream) {
        // Check abort signal
        if (combinedSignal.aborted) {
          throw new Error('CustomAgent execution aborted')
        }

        if (chunk.type === 'text' && chunk.text) {
          turnContent += chunk.text
          accumulatedContent += chunk.text
          events?.onTextChunk?.(chunk.text)
        }

        if (chunk.type === 'tool-call' && chunk.toolCall) {
          const { toolCallId, toolName, args } = chunk.toolCall

          toolCallCount++

          if (DEBUG_CUSTOM_AGENT) {
            console.log(`[CustomAgent] Tool call #${toolCallCount}: ${toolName}`)
            console.log(`[CustomAgent]   Args:`, JSON.stringify(args).substring(0, 200))
          }

          // Find the custom tool
          const customTool = getCustomToolById(agent, toolName)

          // Check if this is a built-in tool (not a custom tool)
          if (!customTool && await isBuiltinTool(toolName)) {
            // Execute built-in tool using the system's executeTool function
            const step: CustomAgentStep = {
              toolName,
              arguments: args,
              result: null,
              status: 'running',
              timestamp: Date.now(),
              thinking: turnContent.trim() || undefined,
              toolCallId,  // Save the AI provider's tool call ID for frontend linking
            }
            turnContent = ''
            events?.onStepStart?.(step)
            events?.onProgress?.(`Executing built-in tool: ${toolName}`)

            try {
              let builtinResult = await executeTool(toolName, args, {
                sessionId: request.sessionId,
                messageId: request.messageId,
                workingDirectory: request.workingDirectory,
                abortSignal: combinedSignal,
              })

              // Check if this tool requires user permission
              if (builtinResult.requiresConfirmation) {
                if (DEBUG_CUSTOM_AGENT) {
                  console.log(`[CustomAgent] Tool ${toolName} requires permission confirmation`)
                  console.log(`[CustomAgent]   Command type: ${builtinResult.commandType}`)
                }

                // Update step status to awaiting-confirmation
                step.status = 'awaiting-confirmation'
                steps.push(step)
                events?.onStepComplete?.(step)

                // If we have a permission callback, ask for user decision
                if (events?.onPermissionRequired) {
                  events?.onProgress?.(`Waiting for permission: ${toolName}`)

                  const decision = await events.onPermissionRequired(step.toolName + '-' + toolCallId, {
                    id: toolCallId,
                    toolName,
                    arguments: args,
                    commandType: builtinResult.commandType,
                    error: builtinResult.error,
                  })

                  if (DEBUG_CUSTOM_AGENT) {
                    console.log(`[CustomAgent] Permission decision: ${decision}`)
                  }

                  if (decision === 'reject') {
                    // User rejected - mark as failed
                    const result: CustomToolResult = {
                      success: false,
                      output: '',
                      error: 'User rejected the command',
                    }
                    step.result = result
                    step.status = 'failed'
                    events?.onStepComplete?.(step)
                    errors.push(`${toolName}: User rejected the command`)
                    toolCallsThisTurn.push({
                      id: toolCallId,
                      toolName,
                      args,
                      result,
                    })
                    continue
                  }

                  // User approved - re-execute with confirmed: true
                  events?.onProgress?.(`Permission granted, executing: ${toolName}`)
                  step.status = 'running'
                  events?.onStepComplete?.(step)

                  builtinResult = await executeTool(toolName, { ...args, confirmed: true }, {
                    sessionId: request.sessionId,
                    messageId: request.messageId,
                    workingDirectory: request.workingDirectory,
                    abortSignal: combinedSignal,
                  })
                } else {
                  // No permission callback - treat as failed
                  const result: CustomToolResult = {
                    success: false,
                    output: '',
                    error: builtinResult.error || 'Permission required but no handler available',
                  }
                  step.result = result
                  step.status = 'failed'
                  events?.onStepComplete?.(step)
                  errors.push(`${toolName}: ${result.error}`)
                  toolCallsThisTurn.push({
                    id: toolCallId,
                    toolName,
                    args,
                    result,
                  })
                  continue
                }
              }

              // Convert data to string output (data could be various types)
              const outputStr = builtinResult.data
                ? (typeof builtinResult.data === 'string'
                    ? builtinResult.data
                    : JSON.stringify(builtinResult.data))
                : ''

              const result: CustomToolResult = {
                success: builtinResult.success !== false && !builtinResult.error,
                output: outputStr,
                error: builtinResult.error,
              }

              if (DEBUG_CUSTOM_AGENT) {
                const preview = result.output.substring(0, 150)
                console.log(`[CustomAgent]   Builtin result: ${result.success ? 'success' : 'failed'} - ${preview}${preview.length >= 150 ? '...' : ''}`)
              }

              step.result = result
              step.status = result.success ? 'success' : 'failed'

              if (result.error) {
                errors.push(`${toolName}: ${result.error}`)
              }

              // Only push step if not already pushed (permission flow already pushed it)
              if (!steps.includes(step)) {
                steps.push(step)
              }
              events?.onStepComplete?.(step)

              toolCallsThisTurn.push({
                id: toolCallId,
                toolName,
                args,
                result,
              })
            } catch (err: any) {
              const result: CustomToolResult = {
                success: false,
                output: '',
                error: err.message || 'Built-in tool execution failed',
              }
              console.error(`[CustomAgent] Built-in tool error:`, err.message)
              step.result = result
              step.status = 'failed'
              steps.push(step)
              events?.onStepComplete?.(step)
              errors.push(`${toolName}: ${err.message}`)
              toolCallsThisTurn.push({
                id: toolCallId,
                toolName,
                args,
                result,
              })
            }
            continue
          }

          if (!customTool) {
            const errorMsg = `Unknown tool: ${toolName}`
            console.error(`[CustomAgent] ${errorMsg}`)
            errors.push(errorMsg)

            toolCallsThisTurn.push({
              id: toolCallId,
              toolName,
              args,
              result: {
                success: false,
                output: '',
                error: errorMsg,
              },
            })
            continue
          }

          // Create step for tracking (for custom tools)
          const step: CustomAgentStep = {
            toolName,
            arguments: args,
            result: null,
            status: 'running',
            timestamp: Date.now(),
            thinking: turnContent.trim() || undefined,
            toolCallId,  // Save the AI provider's tool call ID for frontend linking
          }

          // Reset turn content after capturing thinking
          turnContent = ''

          events?.onStepStart?.(step)
          events?.onProgress?.(`Executing tool: ${customTool.name}`)

          // Execute the custom tool
          const result = await executeCustomTool(customTool, args, {
            sessionId: request.sessionId,
            messageId: request.messageId,
            workingDirectory: request.workingDirectory,
            abortSignal: combinedSignal,
          })

          // Update step with result
          step.result = result
          step.status = result.success ? 'success' : 'failed'

          if (DEBUG_CUSTOM_AGENT) {
            const preview = result.output.substring(0, 150)
            console.log(`[CustomAgent]   Result: ${result.success ? 'success' : 'failed'} - ${preview}${preview.length >= 150 ? '...' : ''}`)
          }

          if (result.error) {
            errors.push(`${toolName}: ${result.error}`)
          }

          steps.push(step)
          events?.onStepComplete?.(step)

          toolCallsThisTurn.push({
            id: toolCallId,
            toolName,
            args,
            result,
          })
        }
      }

      // If no tool calls this turn, we're done
      if (toolCallsThisTurn.length === 0) {
        if (DEBUG_CUSTOM_AGENT) {
          console.log(`[CustomAgent] No tool calls in turn ${currentTurn}, ending loop`)
        }
        break
      }

      // Build continuation messages for next turn
      const assistantMsg: ToolChatMessage = {
        role: 'assistant',
        content: turnContent,
        toolCalls: toolCallsThisTurn.map(tc => ({
          toolCallId: tc.id,
          toolName: tc.toolName,
          args: tc.args,
        })),
      }
      conversationMessages.push(assistantMsg)

      const toolResultMsg: ToolChatMessage = {
        role: 'tool',
        content: toolCallsThisTurn.map(tc => ({
          type: 'tool-result' as const,
          toolCallId: tc.id,
          toolName: tc.toolName,
          result: tc.result?.success
            ? tc.result.output
            : { error: tc.result?.error || 'Unknown error' },
        })),
      }
      conversationMessages.push(toolResultMsg)
    }

    clearTimeout(timeoutId)

    // Build summary
    const summary = accumulatedContent.trim() || 'Task completed.'

    // Determine success
    const allFailed = steps.length > 0 && steps.every(s => s.status === 'failed')
    const success = !allFailed

    events?.onProgress?.(`CustomAgent "${agent.name}" completed: ${toolCallCount} tool calls, ${errors.length} errors`)

    return {
      success,
      summary,
      output: buildDetailedOutput(agent, request.task, steps, summary),
      steps,
      toolCallCount,
      executionTimeMs: Date.now() - startTime,
      errors,
    }

  } catch (error: any) {
    clearTimeout(timeoutId)

    const isAborted = error.name === 'AbortError' || combinedSignal.aborted
    const isTimeout = timeoutController.signal.aborted && !request.abortSignal?.aborted
    const errorMessage = isTimeout
      ? 'Execution timed out'
      : isAborted
        ? 'Execution aborted by user'
        : (error.message || 'Unknown error')

    events?.onError?.(errorMessage)

    return {
      success: false,
      summary: `CustomAgent execution failed: ${errorMessage}`,
      output: `Error: ${errorMessage}`,
      steps,
      toolCallCount,
      executionTimeMs: Date.now() - startTime,
      errors: [...errors, errorMessage],
    }
  }
}

/**
 * Build output for the main LLM
 * Only returns the agent's final response (summary) to save context
 */
function buildDetailedOutput(
  _agent: CustomAgent,
  _task: string,
  _steps: CustomAgentStep[],
  summary: string
): string {
  // Only return the agent's final response
  // Steps and intermediate results are visible in UI but not sent to main LLM
  return summary
}
