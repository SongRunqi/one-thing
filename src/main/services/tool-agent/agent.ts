/**
 * Tool Agent Executor
 *
 * Executes delegated tasks autonomously using available tools.
 * Runs in a separate context with minimal conversation history for token efficiency.
 */

import { v4 as uuidv4 } from 'uuid'
import type { ToolAgentContext, ToolAgentResult, ToolAgentStep, DelegationRequest, ToolAgentSettings } from './types.js'
import { buildToolAgentSystemPrompt, buildToolAgentUserPrompt } from './prompts.js'
import {
  streamChatResponseWithTools,
  convertToolDefinitionsForAI,
  type ToolChatMessage,
} from '../../providers/index.js'
import {
  getEnabledTools,
  getEnabledToolsAsync,
  executeTool,
} from '../../tools/index.js'
import { getMCPToolsForAI, isMCPTool, executeMCPTool, findMCPToolIdByShortName } from '../../mcp/index.js'

// Debug flag for verbose logging (set to true for debugging)
const DEBUG_TOOL_AGENT = false

// Default settings for Tool Agent
const DEFAULT_SETTINGS: Required<ToolAgentSettings> = {
  autoConfirmDangerous: true,  // Tool Agent auto-confirms dangerous commands by default
  maxToolCalls: 50,            // Max tool calls per delegation
  timeoutMs: 300000,           // 5 minutes timeout
  providerId: '',              // Empty means use same provider as main LLM
  model: '',                   // Empty means use same model as main LLM
}

/**
 * Event emitter interface for Tool Agent progress updates
 */
export interface ToolAgentEvents {
  onStepStart?: (step: ToolAgentStep) => void
  onStepComplete?: (step: ToolAgentStep) => void
  onStepSummary?: (step: ToolAgentStep) => void  // Called when summary is added to a completed step
  onTextChunk?: (text: string) => void
  onProgress?: (message: string) => void
  onError?: (error: string) => void
}

/**
 * Execute a delegated task using the Tool Agent
 *
 * This function:
 * 1. Creates a minimal context with just the task description
 * 2. Runs an autonomous tool loop until completion
 * 3. Returns a structured result for the main LLM
 */
export async function executeToolAgent(
  request: DelegationRequest,
  context: ToolAgentContext,
  events?: ToolAgentEvents
): Promise<ToolAgentResult> {
  const startTime = Date.now()
  const steps: ToolAgentStep[] = []
  const filesModified: string[] = []
  const errors: string[] = []

  // Merge settings with defaults
  const settings: Required<ToolAgentSettings> = {
    ...DEFAULT_SETTINGS,
    ...context.toolSettings?.toolAgentSettings,
  }

  // Get all enabled tools for the Tool Agent
  // Use async version to include tools with dynamic descriptions
  const allEnabledTools = await getEnabledToolsAsync()
  const enabledTools = allEnabledTools.filter(t => !t.id.startsWith('mcp:'))
  const mcpTools = getMCPToolsForAI()
  const builtinToolsForAI = convertToolDefinitionsForAI(enabledTools)
  const toolsForAI = { ...builtinToolsForAI, ...mcpTools }

  const hasTools = Object.keys(toolsForAI).length > 0
  if (!hasTools) {
    return {
      success: false,
      summary: 'No tools available for execution',
      details: 'The Tool Agent has no enabled tools to execute the task.',
      filesModified: [],
      errors: ['No tools available'],
      toolCallCount: 0,
      executionTimeMs: Date.now() - startTime,
    }
  }

  // Build the conversation for Tool Agent (minimal context)
  const userPrompt = buildToolAgentUserPrompt(
    request.task,
    request.context,
    request.expectedOutcome
  )

  // Build system prompt with skills awareness
  const systemPrompt = buildToolAgentSystemPrompt(context.skills)

  const conversationMessages: ToolChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ]

  // Get model configuration
  const modelId = settings.model || context.providerConfig.model

  let accumulatedContent = ''
  let toolCallCount = 0
  let currentTurn = 0
  const MAX_TURNS = Math.ceil(settings.maxToolCalls / 5) // Assume ~5 tool calls per turn max

  // Track last step from previous turn for summary capture
  let lastStepFromPrevTurn: ToolAgentStep | null = null

  events?.onProgress?.(`Starting Tool Agent execution for task: ${request.task.substring(0, 50)}...`)

  try {
    // Tool loop - run until no more tool calls or max iterations reached
    while (currentTurn < MAX_TURNS && toolCallCount < settings.maxToolCalls) {
      currentTurn++
      const toolCallsThisTurn: Array<{
        id: string
        toolId: string
        toolName: string
        args: Record<string, unknown>
        result?: unknown
        error?: string
        status: 'success' | 'failed'
      }> = []

      let turnContent = ''
      let turnReasoning = ''

      console.log(`[ToolAgent] Starting turn ${currentTurn}`)

      // Stream the AI response
      const stream = streamChatResponseWithTools(
        context.providerId,
        {
          apiKey: context.providerConfig.apiKey,
          baseUrl: context.providerConfig.baseUrl,
          model: modelId,
        },
        conversationMessages,
        toolsForAI,
        { abortSignal: context.abortSignal }
      )

      for await (const chunk of stream) {
        // Check abort signal
        if (context.abortSignal?.aborted) {
          throw new Error('Tool Agent execution aborted')
        }

        if (chunk.type === 'text' && chunk.text) {
          turnContent += chunk.text
          accumulatedContent += chunk.text
          events?.onTextChunk?.(chunk.text)
          if (DEBUG_TOOL_AGENT) {
            console.log(`[ToolAgent] Text chunk: "${chunk.text.substring(0, 100)}${chunk.text.length > 100 ? '...' : ''}"`)
          }
        }

        if (chunk.type === 'reasoning' && chunk.reasoning) {
          turnReasoning += chunk.reasoning
          if (DEBUG_TOOL_AGENT) {
            console.log(`[ToolAgent] Reasoning chunk: "${chunk.reasoning.substring(0, 100)}..."`)
          }
        }

        if (chunk.type === 'tool-call' && chunk.toolCall) {
          const { toolCallId, toolName, args } = chunk.toolCall

          // Resolve tool ID (AI may return short names)
          let resolvedToolId = toolName
          if (!isMCPTool(toolName)) {
            const fullId = findMCPToolIdByShortName(toolName, args)
            if (fullId) {
              resolvedToolId = fullId
            }
          }

          toolCallCount++

          // Capture any text output before this tool call
          const textBeforeToolCall = turnContent.trim()

          // If this is the first tool call in this turn AND we have text AND we have a previous step,
          // treat the text as the summary of the previous step
          if (toolCallsThisTurn.length === 0 && textBeforeToolCall && lastStepFromPrevTurn) {
            lastStepFromPrevTurn.summary = textBeforeToolCall
            console.log(`[ToolAgent] Summary for previous step: "${textBeforeToolCall.substring(0, 100)}${textBeforeToolCall.length > 100 ? '...' : ''}"`)
            events?.onStepSummary?.(lastStepFromPrevTurn)
            // Clear the text since it's now the summary
            turnContent = ''
          }

          // Capture remaining text as "thinking" for this step
          const thinkingText = turnContent.trim()

          console.log(`[ToolAgent] Tool call #${toolCallCount}: ${resolvedToolId}`)
          console.log(`[ToolAgent]   Args: ${JSON.stringify(args).substring(0, 200)}`)
          if (thinkingText) {
            console.log(`[ToolAgent]   Thinking: "${thinkingText.substring(0, 100)}${thinkingText.length > 100 ? '...' : ''}"`)
          }

          // Create step for tracking
          const step: ToolAgentStep = {
            toolName: resolvedToolId,
            arguments: args,
            result: null,
            status: 'success',
            timestamp: Date.now(),
            thinking: thinkingText || undefined,  // AI's reasoning before this tool call
          }

          // Reset turn content after capturing thinking
          turnContent = ''

          events?.onStepStart?.(step)
          events?.onProgress?.(`Executing tool: ${toolName}`)

          // Execute the tool (auto-execute all for Tool Agent, including dangerous ones)
          let result: { success: boolean; data?: any; error?: string }

          // For bash commands, add confirmed: true when autoConfirmDangerous is enabled
          let executionArgs = args
          if (resolvedToolId === 'bash' && settings.autoConfirmDangerous) {
            executionArgs = { ...args, confirmed: true }
          }

          try {
            if (isMCPTool(resolvedToolId)) {
              const mcpResult = await executeMCPTool(resolvedToolId, executionArgs)
              result = {
                success: mcpResult.success,
                data: mcpResult.content,
                error: mcpResult.error,
              }
            } else {
              result = await executeTool(
                resolvedToolId,
                executionArgs,
                {
                  sessionId: request.sessionId,
                  messageId: request.messageId,
                }
              )
            }
          } catch (err: any) {
            result = {
              success: false,
              error: err.message || 'Tool execution failed',
            }
          }

          // Update step with result
          step.result = result.data
          step.status = result.success ? 'success' : 'failed'
          step.error = result.error

          const resultPreview = result.data
            ? (typeof result.data === 'string'
                ? result.data.substring(0, 150)
                : JSON.stringify(result.data).substring(0, 150))
            : '(no data)'
          console.log(`[ToolAgent]   Result: ${result.success ? 'success' : 'failed'} - ${resultPreview}${resultPreview.length >= 150 ? '...' : ''}`)

          if (result.error) {
            console.log(`[ToolAgent]   Error: ${result.error}`)
            errors.push(`${toolName}: ${result.error}`)
          }

          // Track file modifications from bash commands
          if (toolName === 'bash') {
            const command = (args as any).command as string
            if (command) {
              // Simple heuristic to detect file modifications
              const writePatterns = [
                /^\s*(echo|printf|cat)\s+.*>/,
                /^\s*(mv|cp|mkdir|rm|touch|chmod|chown)\s+/,
                /^\s*tee\s+/,
                />\s*\S+/,
              ]
              if (writePatterns.some(p => p.test(command))) {
                // Extract file paths (simplified)
                const parts = command.split(/\s+/)
                for (const part of parts) {
                  if (part.startsWith('/') || part.startsWith('~') || part.startsWith('./')) {
                    filesModified.push(part.replace(/^['"]|['"]$/g, ''))
                  }
                }
              }
            }
          }

          steps.push(step)
          events?.onStepComplete?.(step)

          // Store for conversation continuation
          toolCallsThisTurn.push({
            id: toolCallId,
            toolId: resolvedToolId,
            toolName,
            args,
            result: result.data,
            error: result.error,
            status: result.success ? 'success' : 'failed',
          })
        }
      }

      // If no tool calls this turn, we're done
      if (toolCallsThisTurn.length === 0) {
        console.log(`[ToolAgent] No tool calls in turn ${currentTurn}, ending loop`)
        // The final text output is the summary of the last step
        const finalSummary = turnContent.trim()
        if (finalSummary && lastStepFromPrevTurn) {
          lastStepFromPrevTurn.summary = finalSummary
          console.log(`[ToolAgent] Final summary for last step: "${finalSummary.substring(0, 100)}${finalSummary.length > 100 ? '...' : ''}"`)
          events?.onStepSummary?.(lastStepFromPrevTurn)
        }
        break
      }

      // Update lastStepFromPrevTurn with the last step from this turn
      if (steps.length > 0) {
        lastStepFromPrevTurn = steps[steps.length - 1]
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
        ...(turnReasoning && { reasoningContent: turnReasoning }),
      }
      conversationMessages.push(assistantMsg)

      const toolResultMsg: ToolChatMessage = {
        role: 'tool',
        content: toolCallsThisTurn.map(tc => ({
          type: 'tool-result' as const,
          toolCallId: tc.id,
          toolName: tc.toolName,
          result: tc.status === 'success' ? tc.result : { error: tc.error },
        })),
      }
      conversationMessages.push(toolResultMsg)
    }

    // Build summary from accumulated content
    const summary = accumulatedContent.trim() || 'Task completed without output.'

    // Determine success based on errors
    const hasErrors = errors.length > 0
    const allFailed = steps.length > 0 && steps.every(s => s.status === 'failed')

    events?.onProgress?.(`Tool Agent completed: ${toolCallCount} tool calls, ${errors.length} errors`)

    return {
      success: !allFailed,
      summary,
      details: buildDetails(steps),
      filesModified: [...new Set(filesModified)], // Deduplicate
      errors,
      toolCallCount,
      executionTimeMs: Date.now() - startTime,
    }

  } catch (error: any) {
    const isAborted = error.name === 'AbortError' || context.abortSignal?.aborted
    const errorMessage = isAborted ? 'Execution aborted by user' : (error.message || 'Unknown error')

    events?.onError?.(errorMessage)

    return {
      success: false,
      summary: `Tool Agent execution failed: ${errorMessage}`,
      details: buildDetails(steps),
      filesModified: [...new Set(filesModified)],
      errors: [...errors, errorMessage],
      toolCallCount,
      executionTimeMs: Date.now() - startTime,
    }
  }
}

/**
 * Build detailed execution log from steps
 */
function buildDetails(steps: ToolAgentStep[]): string {
  if (steps.length === 0) {
    return 'No tool calls executed.'
  }

  const lines = steps.map((step, index) => {
    const status = step.status === 'success' ? '✓' : '✗'
    const resultPreview = step.result
      ? (typeof step.result === 'string'
          ? step.result.substring(0, 200)
          : JSON.stringify(step.result).substring(0, 200))
      : step.error || 'No output'

    return `${index + 1}. [${status}] ${step.toolName}\n   Args: ${JSON.stringify(step.arguments).substring(0, 100)}...\n   Result: ${resultPreview}${resultPreview.length >= 200 ? '...' : ''}`
  })

  return lines.join('\n\n')
}

// NOTE: executeToolViaAgent has been removed
// Simple tool calls are now executed directly via executeToolDirectly in chat.ts
// Complex delegations still use executeToolAgent above
