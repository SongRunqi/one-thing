/**
 * Custom Tool Builder
 *
 * Builds Zod schemas and AI-compatible tool definitions from CustomToolDefinition.
 * This allows CustomAgents to expose their tools to the AI in the correct format.
 */

import { z, type ZodTypeAny } from 'zod'
import type {
  CustomAgent,
  CustomToolDefinition,
  CustomToolParameter,
  CustomToolParameterType,
} from '../../../shared/ipc/custom-agents.js'

/**
 * Convert a CustomToolParameterType to a Zod type
 */
function parameterTypeToZod(
  type: CustomToolParameterType,
  description?: string,
  enumValues?: string[]
): ZodTypeAny {
  let zodType: ZodTypeAny

  switch (type) {
    case 'string':
      if (enumValues && enumValues.length > 0) {
        zodType = z.enum(enumValues as [string, ...string[]])
      } else {
        zodType = z.string()
      }
      break
    case 'number':
      zodType = z.number()
      break
    case 'boolean':
      zodType = z.boolean()
      break
    case 'object':
      zodType = z.record(z.string(), z.unknown())
      break
    case 'array':
      zodType = z.array(z.unknown())
      break
    default:
      zodType = z.string()
  }

  if (description) {
    zodType = zodType.describe(description)
  }

  return zodType
}

/**
 * Build a Zod schema from CustomToolParameters
 */
export function buildToolParametersSchema(
  parameters: CustomToolParameter[]
): z.ZodObject<Record<string, ZodTypeAny>> {
  const shape: Record<string, ZodTypeAny> = {}

  for (const param of parameters) {
    let zodType = parameterTypeToZod(param.type, param.description, param.enum)

    // Handle optional parameters
    if (!param.required) {
      zodType = zodType.optional()

      // Handle default value
      if (param.default !== undefined) {
        zodType = zodType.default(param.default)
      }
    }

    shape[param.name] = zodType
  }

  return z.object(shape)
}

/**
 * Tool definition for AI SDK
 */
export interface AIToolDefinition {
  description: string
  parameters: z.ZodObject<Record<string, ZodTypeAny>>
}

/**
 * Build AI-compatible tool definitions from CustomToolDefinitions
 */
export function buildToolsForAI(
  customTools: CustomToolDefinition[]
): Record<string, AIToolDefinition> {
  const tools: Record<string, AIToolDefinition> = {}

  for (const tool of customTools) {
    tools[tool.id] = {
      description: tool.description,
      parameters: buildToolParametersSchema(tool.parameters),
    }
  }

  return tools
}

/**
 * Parameter definition for streamChatResponseWithTools
 */
export interface StreamToolParameter {
  name: string
  type: string
  description: string
  required?: boolean
  enum?: string[]
}

/**
 * Convert tool definitions to the format expected by streamChatResponseWithTools
 *
 * This matches the format in src/main/providers/index.ts
 */
export function convertCustomToolsForAI(
  customTools: CustomToolDefinition[]
): Record<string, { description: string; parameters: StreamToolParameter[] }> {
  const tools: Record<string, { description: string; parameters: StreamToolParameter[] }> = {}

  for (const tool of customTools) {
    tools[tool.id] = {
      description: tool.description,
      parameters: tool.parameters.map(p => ({
        name: p.name,
        type: p.type,
        description: p.description,
        required: p.required,
        enum: p.enum,
      })),
    }
  }

  return tools
}

/**
 * Build a system prompt section describing the available custom tools
 */
export function buildCustomToolsPromptSection(
  customTools: CustomToolDefinition[]
): string {
  if (customTools.length === 0) {
    return ''
  }

  const toolDescriptions = customTools.map(tool => {
    const params = tool.parameters.length > 0
      ? tool.parameters.map(p => {
          const required = p.required ? '(required)' : '(optional)'
          return `    - ${p.name}: ${p.type} ${required} - ${p.description}`
        }).join('\n')
      : '    (no parameters)'

    return `- **${tool.name}** (${tool.id}): ${tool.description}
  Parameters:
${params}`
  }).join('\n\n')

  return `## Available Custom Tools

You have access to the following custom tools:

${toolDescriptions}

Use these tools to complete the assigned task.`
}

/**
 * Build the full system prompt for a CustomAgent
 */
export function buildCustomAgentSystemPrompt(agent: CustomAgent): string {
  const parts: string[] = []

  // 1. Agent's system prompt
  parts.push(agent.systemPrompt)

  // 2. Custom tools description
  const toolsSection = buildCustomToolsPromptSection(agent.customTools)
  if (toolsSection) {
    parts.push(toolsSection)
  }

  // 3. Execution guidelines
  parts.push(`## Execution Guidelines

- You are executing as an isolated agent with limited scope
- Complete the assigned task using only the available tools
- Be concise and focused in your responses
- Report any errors or issues clearly
- Once the task is complete, provide a brief summary of what was done`)

  return parts.join('\n\n')
}

/**
 * Get tool definition by ID
 */
export function getCustomToolById(
  agent: CustomAgent,
  toolId: string
): CustomToolDefinition | undefined {
  return agent.customTools.find(t => t.id === toolId)
}

// ============================================================================
// Built-in Tools Support
// ============================================================================

import {
  getAllToolsAsync,
  initializeAsyncTools,
  setInitContext,
  type ToolDefinition,
  type InitContext,
} from '../../tools/index.js'

/**
 * Tool IDs that should be excluded from CustomAgent usage
 * These are either unsafe (recursive) or not appropriate for agent use
 */
const EXCLUDED_BUILTIN_TOOLS = [
  'custom-agent',  // Prevent recursive agent calls
  'skill',         // Skills should be called directly by main LLM
]

/**
 * Get available built-in tools info for UI display
 * Returns all tools except excluded ones, regardless of global enabled settings
 */
export async function getAvailableBuiltinToolsInfo(): Promise<Array<{
  id: string
  name: string
  description: string
}>> {
  // Initialize async tools to get their dynamic descriptions
  await initializeAsyncTools()

  // Get all tool definitions (not filtered by enabled settings)
  const allTools = await getAllToolsAsync()

  // Filter out excluded tools
  return allTools
    .filter(t => !EXCLUDED_BUILTIN_TOOLS.includes(t.id))
    .map(t => ({
      id: t.id,
      name: t.name,
      description: t.description,
    }))
}

/**
 * Get specific built-in tools by their IDs for agent execution
 * Only loads the tools specified in toolIds, ignoring global enabled settings
 */
export async function getBuiltinToolsById(
  toolIds: string[],
  context?: { workingDirectory?: string; sessionId?: string }
): Promise<Record<string, { description: string; parameters: StreamToolParameter[] }>> {
  // Set init context for async tools
  if (context) {
    setInitContext({
      workingDirectory: context.workingDirectory,
      sessionId: context.sessionId,
    } as InitContext)
  }

  // Initialize async tools to get their dynamic descriptions
  await initializeAsyncTools()

  // Get all tool definitions
  const allTools = await getAllToolsAsync()

  // Only return tools that are in the specified list and not excluded
  const result: Record<string, { description: string; parameters: StreamToolParameter[] }> = {}

  for (const tool of allTools) {
    if (toolIds.includes(tool.id) && !EXCLUDED_BUILTIN_TOOLS.includes(tool.id)) {
      result[tool.id] = {
        description: tool.description,
        parameters: tool.parameters.map(p => ({
          name: p.name,
          type: p.type,
          description: p.description,
          required: p.required,
          enum: p.enum,
        })),
      }
    }
  }

  return result
}

/**
 * Check if a tool ID is a valid built-in tool (not excluded)
 */
export async function isBuiltinTool(toolId: string): Promise<boolean> {
  if (EXCLUDED_BUILTIN_TOOLS.includes(toolId)) {
    return false
  }

  const allTools = await getAllToolsAsync()
  return allTools.some(t => t.id === toolId)
}
