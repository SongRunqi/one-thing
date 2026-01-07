/**
 * CustomAgent Tool
 *
 * Exposes all available CustomAgents as a single tool that can be invoked by the main LLM.
 * Uses async initialization to dynamically build the tool description based on available agents.
 *
 * Similar to SkillTool, this tool:
 * - Uses dynamic initialization to get the list of available agents
 * - Builds parameters schema with enum of agent names
 * - Executes agents in isolated contexts
 */

import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
import { BrowserWindow } from 'electron'
import { Tool, type InitContext, type ToolContext, type ToolResult } from '../core/tool.js'
import {
  loadCustomAgents,
  executeCustomAgent,
  type PermissionDecision,
  type PermissionToolCall,
} from '../../services/custom-agent/index.js'
import { getAllCustomAgents } from '../../stores/custom-agents.js'
import type { CustomAgent, CustomAgentResult, CustomAgentStep } from '../../../shared/ipc/custom-agents.js'
import type { Step, StepType } from '../../../shared/ipc/index.js'
import { IPC_CHANNELS } from '../../../shared/ipc/channels.js'

/**
 * Pending permission request info
 */
interface PendingPermissionRequest {
  resolve: (decision: PermissionDecision) => void
  reject: (error: Error) => void
  sessionId: string
  messageId: string
  toolCall: PermissionToolCall
  createdAt: number
}

/**
 * Map of pending permission requests by request ID
 */
const pendingPermissionRequests = new Map<string, PendingPermissionRequest>()

/**
 * Respond to a pending permission request
 * Called by IPC handler when user makes a decision
 */
export function respondToPermissionRequest(
  requestId: string,
  decision: PermissionDecision
): boolean {
  const pending = pendingPermissionRequests.get(requestId)
  if (!pending) {
    console.warn(`[CustomAgent] Permission request not found: ${requestId}`)
    return false
  }

  console.log(`[CustomAgent] Permission response received: ${requestId} -> ${decision}`)
  pending.resolve(decision)
  pendingPermissionRequests.delete(requestId)
  return true
}

/**
 * Get all pending permission requests for a session
 */
export function getPendingPermissionRequests(sessionId: string): Array<{
  id: string
  toolCall: PermissionToolCall
  createdAt: number
}> {
  const results: Array<{ id: string; toolCall: PermissionToolCall; createdAt: number }> = []
  for (const [id, request] of pendingPermissionRequests) {
    if (request.sessionId === sessionId) {
      results.push({
        id,
        toolCall: request.toolCall,
        createdAt: request.createdAt,
      })
    }
  }
  return results
}

/**
 * Tool metadata for UI display
 */
interface CustomAgentToolMetadata {
  agentId?: string
  agentName?: string
  success?: boolean
  toolCallCount?: number
  executionTimeMs?: number
  [key: string]: unknown
}

/**
 * Build dynamic description based on available agents
 */
function buildDescription(agents: CustomAgent[]): string {
  if (agents.length === 0) {
    return `Invoke a custom agent to perform a specialized task. No custom agents are currently available.

To add custom agents, create JSON files in:
- ~/.claude/agents/ (user-level)
- .claude/agents/ (project-level)`
  }

  const agentList = agents
    .map(a => `- **${a.name}**: ${a.description}`)
    .join('\n')

  return `Invoke a custom agent to perform a specialized task.

## Available Agents

${agentList}

## When to Use

Use this tool when:
- The user explicitly asks to use a custom agent
- The task matches an agent's specialty
- You need to delegate a complex task to a specialized agent

The agent will execute in an isolated context and return the results.`
}

/**
 * Format the result for the main LLM
 * Only returns essential content to save context
 */
function formatResult(
  agent: CustomAgent,
  result: CustomAgentResult
): string {
  // On failure, include error info
  if (!result.success && result.errors.length > 0) {
    return `[Agent ${agent.name} failed]\n${result.errors.join('\n')}\n\n${result.output}`
  }
  // On success, just return the output (agent's final response)
  return result.output
}

/**
 * Generate a step title from CustomAgentStep
 */
function generateStepTitle(agentStep: CustomAgentStep): string {
  const args = agentStep.arguments
  const toolName = agentStep.toolName

  // Generate descriptive titles based on tool type and arguments
  switch (toolName) {
    case 'glob':
      return `Finding files: ${args.pattern || 'unknown pattern'}`
    case 'grep':
      return `Searching: ${args.pattern || 'unknown pattern'}`
    case 'read':
      return `Reading: ${args.file_path || args.path || 'file'}`
    case 'write':
      return `Writing: ${args.file_path || args.path || 'file'}`
    case 'edit':
      return `Editing: ${args.file_path || args.path || 'file'}`
    case 'bash':
      const cmd = String(args.command || '').substring(0, 50)
      return `Running: ${cmd}${cmd.length >= 50 ? '...' : ''}`
    default:
      return `${toolName}`
  }
}

/**
 * Convert CustomAgentStep to Step for UI display
 */
function convertCustomAgentStepToStep(agentStep: CustomAgentStep): Step {
  // Map tool names to step types
  const stepType: StepType =
    agentStep.toolName === 'bash' ? 'command'
    : agentStep.toolName === 'read' ? 'file-read'
    : (agentStep.toolName === 'write' || agentStep.toolName === 'edit') ? 'file-write'
    : 'tool-call'

  // Map status (including awaiting-confirmation for permission requests)
  const status: Step['status'] =
    agentStep.status === 'running' ? 'running'
    : agentStep.status === 'success' ? 'completed'
    : agentStep.status === 'failed' ? 'failed'
    : agentStep.status === 'awaiting-confirmation' ? 'awaiting-confirmation'
    : 'pending'

  // Map step status to toolCall status
  const toolCallStatus: 'pending' | 'executing' | 'completed' | 'failed' | 'cancelled' | 'input-streaming' =
    status === 'running' ? 'executing'
    : status === 'completed' ? 'completed'
    : status === 'failed' ? 'failed'
    : status === 'awaiting-confirmation' ? 'pending'
    : 'pending'

  // Generate step ID (use toolCallId if available for consistency)
  const stepId = agentStep.toolCallId || uuidv4()

  return {
    id: stepId,
    type: stepType,
    title: generateStepTitle(agentStep),
    status,
    timestamp: agentStep.timestamp,
    thinking: agentStep.thinking,
    result: agentStep.result?.output,
    error: agentStep.result?.error,
    // Link to tool call ID (for permission request matching)
    toolCallId: agentStep.toolCallId,
    // Full tool call object (needed for StepsPanel confirm/reject buttons)
    toolCall: {
      id: agentStep.toolCallId || stepId,
      toolId: agentStep.toolName,
      toolName: agentStep.toolName,
      arguments: agentStep.arguments,
      status: toolCallStatus,
      timestamp: agentStep.timestamp,
      // Permission-related fields (will be set by frontend when needed)
      requiresConfirmation: status === 'awaiting-confirmation',
    },
  }
}

/**
 * CustomAgentTool - async tool with dynamic initialization
 */
export const CustomAgentTool = Tool.define(
  'custom-agent',
  {
    name: 'Custom Agent',
    category: 'builtin',
    autoExecute: false, // Requires confirmation as it can execute arbitrary tools
  },
  async (ctx?: InitContext) => {
    // Get working directory from context
    const workingDirectory = ctx?.workingDirectory as string | undefined

    // Get agent enabled settings from context
    const agentSettings = (ctx as any)?.agentSettings as Record<string, { enabled: boolean }> | undefined

    // Load available CustomAgents from both disk and store
    // Disk: ~/.claude/agents/*.json and .claude/agents/*.json
    // Store: agents created via UI (stored in backend store)
    const fileAgents = loadCustomAgents(workingDirectory)
    const storeAgents = getAllCustomAgents(workingDirectory)

    // Merge: store agents override file agents with same id
    const agentMap = new Map<string, CustomAgent>()
    for (const agent of fileAgents) {
      agentMap.set(agent.id, agent)
    }
    for (const agent of storeAgents) {
      agentMap.set(agent.id, agent)
    }
    const allAgents = Array.from(agentMap.values())

    // Filter out disabled agents (default to enabled if not set)
    const agents = allAgents.filter(agent => {
      const isEnabled = agentSettings?.[agent.id]?.enabled ?? true
      return isEnabled
    })

    // Build agent names for enum validation
    const agentNames = agents.map(a => a.name)

    // Create parameters schema
    const parameters = z.object({
      agent: agentNames.length > 0
        ? z.enum(agentNames as [string, ...string[]]).describe('Name of the custom agent to invoke')
        : z.string().describe('Name of the custom agent to invoke'),
      task: z.string().describe('The task to delegate to the agent'),
    })

    return {
      description: buildDescription(agents),
      parameters,

      async execute(
        args: { agent: string; task: string },
        toolCtx: ToolContext<CustomAgentToolMetadata>
      ): Promise<ToolResult<CustomAgentToolMetadata>> {
        const { agent: agentName, task } = args

        // Find the agent
        const agent = agents.find(a => a.name === agentName)

        if (!agent) {
          return {
            title: `Agent not found: ${agentName}`,
            output: `Error: Custom agent "${agentName}" not found. Available agents: ${agentNames.join(', ') || 'none'}`,
            metadata: {
              agentName,
              success: false,
            },
          }
        }

        // Update metadata with agent info
        toolCtx.metadata({
          title: `Running ${agent.name}`,
          metadata: {
            agentId: agent.id,
            agentName: agent.name,
          },
        })

        // Get provider config from context (we need to pass this through)
        // For now, we'll use a placeholder - this will be updated when we integrate with the main system
        const providerConfig = (ctx as any)?.providerConfig || {
          apiKey: '',
          baseUrl: '',
          model: '',
        }

        const providerId = (ctx as any)?.providerId || 'anthropic'

        // Execute the agent with step forwarding
        const result = await executeCustomAgent(
          agent,
          {
            task,
            sessionId: toolCtx.sessionId,
            messageId: toolCtx.messageId,
            workingDirectory: toolCtx.workingDirectory,
            abortSignal: toolCtx.abortSignal,
          },
          {
            providerId,
            providerConfig,
          },
          {
            // Forward step events to UI for visualization in StepsPanel
            onStepStart: (agentStep) => {
              const step = convertCustomAgentStepToStep(agentStep)
              toolCtx.onStepStart?.(step)
            },
            onStepComplete: (agentStep) => {
              const step = convertCustomAgentStepToStep(agentStep)
              toolCtx.onStepComplete?.(step)
            },
            onProgress: (message) => {
              toolCtx.metadata({
                title: message,
              })
            },
            // Handle permission requests for dangerous operations (e.g., bash commands)
            onPermissionRequired: async (stepId, toolCall) => {
              const requestId = uuidv4()

              console.log(`[CustomAgent] Permission required for ${toolCall.toolName}, request ID: ${requestId}`)

              // Create a Promise that will be resolved when user responds
              const decision = await new Promise<PermissionDecision>((resolve, reject) => {
                // Store the pending request
                pendingPermissionRequests.set(requestId, {
                  resolve,
                  reject,
                  sessionId: toolCtx.sessionId,
                  messageId: toolCtx.messageId,
                  toolCall,
                  createdAt: Date.now(),
                })

                // Notify frontend via IPC
                const windows = BrowserWindow.getAllWindows()
                for (const win of windows) {
                  win.webContents.send(IPC_CHANNELS.CUSTOM_AGENT_PERMISSION_REQUEST, {
                    requestId,
                    sessionId: toolCtx.sessionId,
                    messageId: toolCtx.messageId,
                    stepId,
                    toolCall,
                  })
                }
              })

              return decision
            },
          }
        )

        return {
          title: `${agent.name}: ${result.success ? 'Completed' : 'Failed'}`,
          output: formatResult(agent, result),
          metadata: {
            agentId: agent.id,
            agentName: agent.name,
            success: result.success,
            toolCallCount: result.toolCallCount,
            executionTimeMs: result.executionTimeMs,
          },
        }
      },
    }
  }
)
