/**
 * MCP Tool Bridge
 *
 * Bridges MCP tools to the existing tool system, allowing them to be used
 * seamlessly with the Vercel AI SDK
 */

import { MCPManager } from './manager.js'
import type { MCPToolInfo, MCPToolCallResult } from './types.js'
import type { ToolDefinition, ToolParameter } from '../tools/types.js'
import { registerTool, unregisterTool, getAllTools } from '../tools/registry.js'
import { z } from 'zod'

/**
 * Convert MCP tool to internal ToolDefinition format
 */
export function mcpToolToToolDefinition(mcpTool: MCPToolInfo): ToolDefinition {
  const parameters: ToolParameter[] = []

  // Convert JSON Schema properties to ToolParameter array
  if (mcpTool.inputSchema.properties) {
    const required = mcpTool.inputSchema.required || []

    for (const [name, schema] of Object.entries(mcpTool.inputSchema.properties)) {
      const prop = schema as any
      parameters.push({
        name,
        type: mapJsonSchemaType(prop.type),
        description: prop.description || '',
        required: required.includes(name),
        enum: prop.enum,
        default: prop.default,
      })
    }
  }

  return {
    id: `mcp:${mcpTool.serverId}:${mcpTool.name}`,
    name: mcpTool.name,
    description: mcpTool.description || `MCP tool: ${mcpTool.name}`,
    parameters,
    enabled: true,
    autoExecute: true, // MCP tools are auto-executed by default
    category: 'custom', // MCP tools are treated as custom tools
    icon: 'mcp',
  }
}

/**
 * Map JSON Schema type to ToolParameter type
 */
function mapJsonSchemaType(jsonType: string | string[] | undefined): ToolParameter['type'] {
  if (Array.isArray(jsonType)) {
    // Handle union types - pick the first non-null type
    const nonNull = jsonType.find(t => t !== 'null')
    return mapJsonSchemaType(nonNull)
  }

  switch (jsonType) {
    case 'string':
      return 'string'
    case 'number':
    case 'integer':
      return 'number'
    case 'boolean':
      return 'boolean'
    case 'array':
      return 'array'
    case 'object':
    default:
      return 'object'
  }
}

/**
 * Create a Zod schema from MCP tool input schema
 */
export function mcpInputSchemaToZod(inputSchema: MCPToolInfo['inputSchema']): z.ZodObject<any> {
  const shape: Record<string, z.ZodTypeAny> = {}

  if (inputSchema.properties) {
    const required = inputSchema.required || []

    for (const [name, propSchema] of Object.entries(inputSchema.properties)) {
      const prop = propSchema as any
      let zodType = jsonSchemaTypeToZod(prop)

      // Add description
      if (prop.description) {
        zodType = zodType.describe(prop.description)
      }

      // Make optional if not required
      if (!required.includes(name)) {
        zodType = zodType.optional()
      }

      shape[name] = zodType
    }
  }

  return z.object(shape)
}

/**
 * Convert JSON Schema type to Zod type
 */
function jsonSchemaTypeToZod(prop: any): z.ZodTypeAny {
  const type = Array.isArray(prop.type)
    ? prop.type.find((t: string) => t !== 'null') || 'string'
    : prop.type || 'string'

  switch (type) {
    case 'string':
      if (prop.enum) {
        return z.enum(prop.enum as [string, ...string[]])
      }
      return z.string()

    case 'number':
    case 'integer':
      return z.number()

    case 'boolean':
      return z.boolean()

    case 'array':
      if (prop.items) {
        return z.array(jsonSchemaTypeToZod(prop.items))
      }
      return z.array(z.any())

    case 'object':
      if (prop.properties) {
        const nestedShape: Record<string, z.ZodTypeAny> = {}
        const nestedRequired = prop.required || []

        for (const [name, nestedProp] of Object.entries(prop.properties)) {
          let nestedZod = jsonSchemaTypeToZod(nestedProp)
          if (!nestedRequired.includes(name)) {
            nestedZod = nestedZod.optional()
          }
          nestedShape[name] = nestedZod
        }
        return z.object(nestedShape)
      }
      return z.record(z.string(), z.any())

    default:
      return z.any()
  }
}

/**
 * Get MCP tools formatted for Vercel AI SDK (same format as convertToolDefinitionsForAI)
 * Returns a record of tool definitions matching the format expected by streamChatResponseWithTools
 */
export function getMCPToolsForAI(): Record<string, { description: string; parameters: Array<{ name: string; type: string; description: string; required?: boolean; enum?: string[] }> }> {
  const result: Record<string, any> = {}

  if (!MCPManager.isEnabled) {
    return result
  }

  const mcpTools = MCPManager.getAllTools()

  for (const mcpTool of mcpTools) {
    const toolId = `mcp_${mcpTool.serverId}_${mcpTool.name}`

    // Convert JSON Schema properties to parameter array format
    const parameters: Array<{ name: string; type: string; description: string; required?: boolean; enum?: string[] }> = []

    if (mcpTool.inputSchema.properties) {
      const required = mcpTool.inputSchema.required || []

      for (const [name, prop] of Object.entries(mcpTool.inputSchema.properties)) {
        const propSchema = prop as any
        parameters.push({
          name,
          type: mapJsonSchemaType(propSchema.type) as string,
          description: propSchema.description || '',
          required: required.includes(name),
          enum: propSchema.enum,
        })
      }
    }

    result[toolId] = {
      description: mcpTool.description || `MCP tool: ${mcpTool.name}`,
      parameters,
    }
  }

  return result
}

/**
 * Register all MCP tools with the tool registry
 * This allows them to be managed alongside built-in tools
 */
export async function registerMCPTools(): Promise<void> {
  // First, unregister any existing MCP tools
  const existingTools = getAllTools()
  for (const tool of existingTools) {
    if (tool.id.startsWith('mcp:')) {
      unregisterTool(tool.id)
    }
  }

  if (!MCPManager.isEnabled) {
    return
  }

  const mcpTools = MCPManager.getAllTools()

  for (const mcpTool of mcpTools) {
    const definition = mcpToolToToolDefinition(mcpTool)

    // Create handler that calls MCP
    const handler = async (args: Record<string, any>) => {
      const result = await MCPManager.callTool(mcpTool.serverId, mcpTool.name, args)

      if (!result.success) {
        return {
          success: false,
          error: result.error,
        }
      }

      // Convert content to string
      let data: any = result.content
      if (Array.isArray(result.content)) {
        data = result.content
          .map((c: any) => {
            if (c.type === 'text') return c.text
            return JSON.stringify(c)
          })
          .join('\n')
      }

      return {
        success: true,
        data,
      }
    }

    registerTool(definition, handler)
  }

  console.log(`[MCPBridge] Registered ${mcpTools.length} MCP tools`)
}

/**
 * Parse MCP tool ID to extract server ID and tool name
 */
export function parseMCPToolId(toolId: string): { serverId: string; toolName: string } | null {
  // Handle both formats: "mcp:serverId:toolName" and "mcp_serverId_toolName"
  if (toolId.startsWith('mcp:')) {
    const parts = toolId.slice(4).split(':')
    if (parts.length >= 2) {
      return {
        serverId: parts[0],
        toolName: parts.slice(1).join(':'),
      }
    }
  }

  if (toolId.startsWith('mcp_')) {
    const parts = toolId.slice(4).split('_')
    if (parts.length >= 2) {
      return {
        serverId: parts[0],
        toolName: parts.slice(1).join('_'),
      }
    }
  }

  return null
}

/**
 * Check if a tool ID is an MCP tool
 */
export function isMCPTool(toolId: string): boolean {
  return toolId.startsWith('mcp:') || toolId.startsWith('mcp_')
}

/**
 * Execute an MCP tool by its full tool ID
 */
export async function executeMCPTool(toolId: string, args: Record<string, any>): Promise<MCPToolCallResult> {
  const parsed = parseMCPToolId(toolId)

  if (!parsed) {
    return {
      success: false,
      error: `Invalid MCP tool ID: ${toolId}`,
    }
  }

  return MCPManager.callTool(parsed.serverId, parsed.toolName, args)
}
