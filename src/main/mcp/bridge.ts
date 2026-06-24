/**
 * MCP Tool Bridge
 *
 * Bridges MCP tools to the existing tool system, allowing them to be used
 * seamlessly with the provider runtime
 */

import * as fs from 'fs'
import { MCPManager } from './manager.js'
import type { MCPToolInfo, MCPToolCallResult } from './types.js'
import type { ToolDefinition, ToolParameter } from '../tools/types.js'
import { unregisterTool, getAllTools } from '../tools/registry.js'
import { getMCPToolsCatalogPath } from '../stores/paths.js'
import { fuzzyFilter } from '../utils/fuzzy.js'
import { z } from 'zod'
import { toJsonSchemaObject, type JsonObject, type JsonSchemaObject, type JsonValue } from '../../shared/json.js'

/**
 * Tools catalog version - incremented when catalog format changes
 */
let toolsCatalogGenerated = false

/**
 * Mapping from sanitized tool IDs to original MCP tool info
 * This is needed because API requires tool names to match ^[a-zA-Z0-9_-]+
 * but MCP tool names may contain dots and other characters
 */
const sanitizedToOriginalMap = new Map<string, { serverId: string; toolName: string }>()

const MCP_ROUTER_TOOL_ID = 'mcp_search'
const LEGACY_MCP_ROUTER_TOOL_ID = 'tool_function'

function isMCPRouterToolId(toolId: string): boolean {
  return toolId === MCP_ROUTER_TOOL_ID || toolId === LEGACY_MCP_ROUTER_TOOL_ID
}

function schemaStringEnum(schema: JsonSchemaObject): string[] | undefined {
  const values = Array.isArray(schema.enum)
    ? schema.enum.filter((item): item is string => typeof item === 'string')
    : []
  return values.length > 0 ? values : undefined
}

function schemaDescription(schema: JsonSchemaObject): string {
  return typeof schema.description === 'string' ? schema.description : ''
}

function schemaDefault(schema: JsonSchemaObject): ToolParameter['default'] {
  const value = schema.default
  return value === undefined ? undefined : value
}

type ModelFacingToolDefinition = {
  description: string
  parameters: Array<{ name: string; type: string; description: string; required?: boolean; enum?: string[] }>
  parameterSchema?: JsonSchemaObject
}

type MCPFunctionRef = {
  id: string
  serverId: string
  serverName: string
  toolName: string
  description?: string
  inputSchema: MCPToolInfo['inputSchema']
}

/**
 * Sanitize a string to match the API tool name pattern: ^[a-zA-Z0-9_-]+
 * Replaces invalid characters with hyphens
 */
function sanitizeForToolName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '-')
}

function getServerToolNamePrefix(serverId: string): string {
  const serverName = MCPManager.getServerState(serverId)?.config.name?.trim()
  const sanitizedName = serverName ? sanitizeForToolName(serverName) : ''
  return sanitizedName || sanitizeForToolName(serverId)
}

function getMCPToolIds(mcpTools: MCPToolInfo[]): Map<MCPToolInfo, string> {
  const baseIds = new Map<MCPToolInfo, string>()
  const counts = new Map<string, number>()

  for (const tool of mcpTools) {
    const serverPrefix = getServerToolNamePrefix(tool.serverId)
    const toolName = sanitizeForToolName(tool.name)
    const baseId = `mcp_${serverPrefix}_${toolName}`
    baseIds.set(tool, baseId)
    counts.set(baseId, (counts.get(baseId) || 0) + 1)
  }

  const ids = new Map<MCPToolInfo, string>()
  for (const tool of mcpTools) {
    const baseId = baseIds.get(tool)!
    if ((counts.get(baseId) || 0) <= 1) {
      ids.set(tool, baseId)
      continue
    }

    const serverPrefix = getServerToolNamePrefix(tool.serverId)
    const serverId = sanitizeForToolName(tool.serverId)
    const toolName = sanitizeForToolName(tool.name)
    ids.set(tool, `mcp_${serverPrefix}_${serverId}_${toolName}`)
  }

  return ids
}

function getMCPToolId(mcpTool: MCPToolInfo): string {
  return getMCPToolIds([mcpTool]).get(mcpTool)!
}

function getServerDisplayName(serverId: string): string {
  return MCPManager.getServerState(serverId)?.config.name?.trim() || serverId
}

function getMCPFunctionRefs(mcpTools: MCPToolInfo[] = MCPManager.getAllTools()): MCPFunctionRef[] {
  const counts = new Map<string, number>()
  for (const tool of mcpTools) {
    counts.set(tool.name, (counts.get(tool.name) || 0) + 1)
  }

  return mcpTools.map(tool => {
    const serverName = getServerDisplayName(tool.serverId)
    return {
      id: (counts.get(tool.name) || 0) > 1 ? `${serverName}/${tool.name}` : tool.name,
      serverId: tool.serverId,
      serverName,
      toolName: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    }
  })
}

function findMCPFunctionRef(input?: { function?: string; server?: string }): MCPFunctionRef | null {
  const functionName = input?.function?.trim()
  if (!functionName) return null

  const server = input?.server?.trim().toLowerCase()
  const refs = getMCPFunctionRefs()
  const matches = refs.filter(ref => {
    const functionMatches = ref.id === functionName || ref.toolName === functionName
    if (!functionMatches) return false
    if (!server) return true
    return ref.serverId.toLowerCase() === server || ref.serverName.toLowerCase() === server
  })

  if (matches.length === 1) return matches[0]
  return matches.find(ref => ref.id === functionName) || null
}

function listMCPFunctions(query?: string): string {
  const normalizedQuery = query?.trim()
  const allRefs = getMCPFunctionRefs()
  const refs = normalizedQuery
    ? fuzzyFilter(
        allRefs.map(ref => ({
          item: ref,
          text: `${ref.id} ${ref.toolName} ${ref.serverName} ${ref.description || ''}`,
        })),
        normalizedQuery,
      ).map(result => result.item)
    : allRefs.sort((a, b) => a.id.localeCompare(b.id))

  if (refs.length === 0) {
    return normalizedQuery
      ? `No MCP tools matched query "${query}".`
      : 'No MCP tools are currently available.'
  }

  return refs.map(ref => {
    const summary = ref.description ? ` — ${truncateDescription(ref.description, 120)}` : ''
    const server = ref.id === ref.toolName ? '' : ` (${ref.serverName})`
    return `- ${ref.id}${server}${summary}`
  }).join('\n')
}

function describeMCPFunction(ref: MCPFunctionRef): string {
  const lines = [
    `MCP tool: ${ref.id}`,
    `Server: ${ref.serverName}`,
    `Original tool name: ${ref.toolName}`,
    `Description: ${ref.description || 'No description available'}`,
    '',
    'Input schema:',
    JSON.stringify(ref.inputSchema, null, 2),
  ]
  return lines.join('\n')
}

function mcpContentToString(content: MCPToolCallResult['content']): string {
  if (Array.isArray(content)) {
    return content
      .map(item => {
        if (item.type === 'text') return item.text ?? ''
        return JSON.stringify(item)
      })
      .join('\n')
  }
  return content === undefined ? '' : JSON.stringify(content)
}

function getMCPRouterDefinition(): ModelFacingToolDefinition {
  return {
    description: 'Search available MCP tools, inspect a tool schema, or call a selected MCP tool. Use action="search" or action="find" with query text when choosing a tool.',
    parameters: [
      { name: 'action', type: 'string', description: 'One of: search, find, list, describe, call.', required: true, enum: ['search', 'find', 'list', 'describe', 'call'] },
      { name: 'tool', type: 'string', description: 'MCP tool identifier returned by action=search/find/list. Required for describe and call.' },
      { name: 'function', type: 'string', description: 'Legacy alias for tool. Supported for older calls.' },
      { name: 'arguments', type: 'object', description: 'Arguments object for action=call.' },
      { name: 'server', type: 'string', description: 'Optional server name or id to disambiguate duplicate function names.' },
      { name: 'query', type: 'string', description: 'Search text for action=search or action=find. Optional for action=list.' },
    ],
    parameterSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['search', 'find', 'list', 'describe', 'call'],
          description: 'Use "search" or "find" to fuzzy-search MCP tools, "list" to show available tools, "describe" to inspect one tool schema, or "call" to execute one tool.',
        },
        function: {
          type: 'string',
          description: 'Legacy alias for tool. Supported for older calls.',
        },
        tool: {
          type: 'string',
          description: 'MCP tool identifier returned by action=search/find/list. Required for describe and call.',
        },
        arguments: {
          type: 'object',
          description: 'Arguments object for action=call.',
          additionalProperties: true,
        },
        server: {
          type: 'string',
          description: 'Optional server name or id to disambiguate duplicate function names.',
        },
        query: {
          type: 'string',
          description: 'Fuzzy search text for action=search or action=find. Optional for action=list.',
        },
      },
      required: ['action'],
    },
  }
}

/**
 * Convert MCP tool to internal ToolDefinition format
 */
export function mcpToolToToolDefinition(mcpTool: MCPToolInfo): ToolDefinition {
  const parameters: ToolParameter[] = []

  // Convert JSON Schema properties to ToolParameter array
  if (mcpTool.inputSchema.properties) {
    const required = mcpTool.inputSchema.required || []

    for (const [name, schema] of Object.entries(mcpTool.inputSchema.properties)) {
      parameters.push({
        name,
        type: mapJsonSchemaType(schema.type),
        description: schemaDescription(schema),
        required: required.includes(name),
        enum: schemaStringEnum(schema),
        default: schemaDefault(schema),
      })
    }
  }

  return {
    id: `mcp:${mcpTool.serverId}:${mcpTool.name}`,
    name: mcpTool.name,
    description: mcpTool.description || `MCP tool: ${mcpTool.name}`,
    parameters,
    parameterSchema: toJsonSchemaObject(mcpTool.inputSchema),
    enabled: true,
    autoExecute: false, // MCP tools are opaque; execution asks for permission.
    permissionGuard: 'permission-gated',
    category: 'custom', // MCP tools are treated as custom tools
    icon: 'mcp',
  }
}

export function getMCPRouterToolDefinition(): ToolDefinition | null {
  if (!MCPManager.isEnabled || MCPManager.getAllTools().length === 0) {
    return null
  }

  const router = getMCPRouterDefinition()
  return {
    id: MCP_ROUTER_TOOL_ID,
    name: 'MCP Search',
    description: router.description,
    parameters: router.parameters.map(param => ({
      name: param.name,
      type: mapJsonSchemaType(param.type),
      description: param.description,
      required: param.required,
      enum: param.enum,
    })),
    parameterSchema: toJsonSchemaObject(router.parameterSchema),
    enabled: true,
    autoExecute: false,
    permissionGuard: 'permission-gated',
    executionMode: 'sequential',
    renderKind: 'text',
    category: 'custom',
    icon: 'mcp',
    source: 'mcp',
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
export function mcpInputSchemaToZod(inputSchema: MCPToolInfo['inputSchema']): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const shape: Record<string, z.ZodTypeAny> = {}

  if (inputSchema.properties) {
    const required = inputSchema.required || []

    for (const [name, propSchema] of Object.entries(inputSchema.properties)) {
      let zodType = jsonSchemaTypeToZod(propSchema)

      // Add description
      const description = schemaDescription(propSchema)
      if (description) {
        zodType = zodType.describe(description)
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
function jsonSchemaTypeToZod(prop: JsonSchemaObject): z.ZodTypeAny {
  const type = Array.isArray(prop.type)
    ? prop.type.find((t: string) => t !== 'null') || 'string'
    : prop.type || 'string'

  switch (type) {
    case 'string':
      {
        const enumValues = schemaStringEnum(prop)
        if (enumValues) {
          return z.enum(enumValues as [string, ...string[]])
        }
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
      return z.array(z.custom<JsonValue>())

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
      return z.record(z.string(), z.custom<JsonValue>())

    default:
      return z.custom<JsonValue>()
  }
}

/**
 * Generate the MCP tools catalog file
 * This file contains full documentation for all available MCP tools
 * AI can reference this file to understand tool capabilities in detail
 */
export function generateToolsCatalog(): void {
  if (!MCPManager.isEnabled) {
    toolsCatalogGenerated = false
    return
  }

  const mcpTools = MCPManager.getAllTools()
  if (mcpTools.length === 0) {
    toolsCatalogGenerated = false
    return
  }

  const lines: string[] = [
    '# MCP Tools Catalog',
    '',
    `> Auto-generated on ${new Date().toISOString()}`,
    `> Total tools: ${mcpTools.length}`,
    '',
    'This catalog contains detailed documentation for all available MCP tools.',
    'Use the `mcp_search` tool with action=`search`, action=`find`, action=`list`, action=`describe`, or action=`call`.',
    '',
    '---',
    '',
  ]

  const functionRefs = new Map(getMCPFunctionRefs(mcpTools).map(ref => [`${ref.serverId}:${ref.toolName}`, ref]))

  // Group tools by server
  const toolsByServer = new Map<string, MCPToolInfo[]>()
  for (const tool of mcpTools) {
    const existing = toolsByServer.get(tool.serverId) || []
    existing.push(tool)
    toolsByServer.set(tool.serverId, existing)
  }

  for (const [serverId, tools] of toolsByServer.entries()) {
    const serverName = MCPManager.getServerState(serverId)?.config.name
    const title = serverName ? `${serverName} (${serverId})` : serverId
    lines.push(`## Server: ${title}`)
    lines.push('')

    for (const tool of tools) {
      const functionId = functionRefs.get(`${tool.serverId}:${tool.name}`)?.id || tool.name

      lines.push(`### ${tool.name}`)
      lines.push('')
      lines.push(`**Function:** \`${functionId}\``)
      lines.push('')
      lines.push(`**Description:** ${tool.description || 'No description available'}`)
      lines.push('')

      if (tool.inputSchema.properties && Object.keys(tool.inputSchema.properties).length > 0) {
        lines.push('**Parameters:**')
        lines.push('')
        lines.push('| Name | Type | Required | Description |')
        lines.push('|------|------|----------|-------------|')

        const required = tool.inputSchema.required || []
        for (const [name, prop] of Object.entries(tool.inputSchema.properties)) {
          const isRequired = required.includes(name) ? '✓' : ''
          const type = prop.type || 'value'
          const desc = schemaDescription(prop).replace(/\|/g, '\\|').replace(/\n/g, ' ')
          lines.push(`| ${name} | ${type} | ${isRequired} | ${desc} |`)
        }
        lines.push('')
      } else {
        lines.push('**Parameters:** None')
        lines.push('')
      }

      lines.push('---')
      lines.push('')
    }
  }

  // Write the catalog file
  try {
    const catalogPath = getMCPToolsCatalogPath()
    fs.writeFileSync(catalogPath, lines.join('\n'), 'utf-8')
    toolsCatalogGenerated = true
    console.log(`[MCPBridge] Tools catalog generated: ${catalogPath} (${mcpTools.length} tools)`)
  } catch (error) {
    console.error('[MCPBridge] Failed to write tools catalog:', error)
    toolsCatalogGenerated = false
  }
}

/**
 * Get the path to the tools catalog file (if it exists)
 */
export function getToolsCatalogPath(): string | null {
  if (!toolsCatalogGenerated) return null
  const path = getMCPToolsCatalogPath()
  return fs.existsSync(path) ? path : null
}

/**
 * Truncate description to a maximum length, adding ellipsis if needed
 */
function truncateDescription(desc: string, maxLength: number = 100): string {
  if (!desc) return ''
  if (desc.length <= maxLength) return desc
  return desc.slice(0, maxLength - 3) + '...'
}

/**
 * Get MCP tools formatted for provider execution.
 * Returns a record of tool definitions matching the format expected by streamChatResponseWithTools
 *
 * OPTIMIZED: Uses condensed descriptions when tools catalog is available.
 * Full tool documentation is written to a file that AI can reference.
 *
 * @param toolsSettings - Optional per-tool settings to filter disabled tools
 * @param useCondensed - If true, use condensed descriptions (default: true when catalog exists)
 */
export function getMCPToolsForAI(
  toolsSettings?: Record<string, { enabled: boolean; autoExecute: boolean }>,
  useCondensed: boolean = toolsCatalogGenerated
): Record<string, ModelFacingToolDefinition> {
  void useCondensed
  const result: Record<string, ModelFacingToolDefinition> = {}

  if (!MCPManager.isEnabled) {
    return result
  }

  // Clear the mapping before rebuilding
  sanitizedToOriginalMap.clear()

  const mcpTools = MCPManager.getAllTools()
  if (mcpTools.length === 0) return result

  const routerSetting = toolsSettings?.[MCP_ROUTER_TOOL_ID]
  if (routerSetting && !routerSetting.enabled) {
    console.log(`[MCPBridge] Skipping disabled MCP router tool: ${MCP_ROUTER_TOOL_ID}`)
    return result
  }

  const toolIds = getMCPToolIds(mcpTools)
  for (const [tool, toolId] of toolIds) {
    sanitizedToOriginalMap.set(toolId, {
      serverId: tool.serverId,
      toolName: tool.name,
    })
  }

  result[MCP_ROUTER_TOOL_ID] = getMCPRouterDefinition()

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

  // Generate the tools catalog file for AI reference
  generateToolsCatalog()

  console.log(`[MCPBridge] MCP router ready (${mcpTools.length} functions)`)
}

/**
 * Parse MCP tool ID to extract server ID and tool name
 * Uses the sanitized-to-original mapping when available
 */
export function parseMCPToolId(toolId: string): { serverId: string; toolName: string } | null {
  if (isMCPRouterToolId(toolId)) return null

  // First, check the sanitized-to-original mapping
  const mapped = sanitizedToOriginalMap.get(toolId)
  if (mapped) {
    return mapped
  }

  // Handle both formats: "mcp:serverId:toolName" and "mcp_serverName_toolName".
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
    const mcpTools = MCPManager.getAllTools()
    const toolIds = getMCPToolIds(mcpTools)
    for (const tool of mcpTools) {
      if (toolIds.get(tool) === toolId) {
        return {
          serverId: tool.serverId,
          toolName: tool.name,
        }
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
  return isMCPRouterToolId(toolId) || toolId.startsWith('mcp:') || toolId.startsWith('mcp_')
}

/**
 * Find a tool that matches the given input parameters
 * Returns the tool with the most matching parameter names
 */
function findToolByParameters(
  tools: MCPToolInfo[],
  args: JsonObject
): MCPToolInfo | null {
  const argNames = Object.keys(args)

  let bestMatch: MCPToolInfo | null = null
  let bestScore = 0

  for (const tool of tools) {
    if (!tool.inputSchema.properties) continue

    const toolParams = Object.keys(tool.inputSchema.properties)
    // Count matching parameter names
    const matchCount = argNames.filter(name => toolParams.includes(name)).length

    if (matchCount > bestScore) {
      bestScore = matchCount
      bestMatch = tool
    }
  }

  return bestMatch
}

/**
 * Find full MCP tool ID by short tool name or server name
 * This handles cases where AI models return:
 * 1. Short tool names like "get-library-docs"
 * 2. Server names like "context7" (when displaying server name in UI)
 */
export function findMCPToolIdByShortName(
  shortName: string,
  args?: JsonObject
): string | null {
  // Sanitize the input name for comparison
  const sanitizedInput = sanitizeForToolName(shortName)

  // First, try to match by tool name
  for (const [fullId, original] of sanitizedToOriginalMap.entries()) {
    // Check if the original tool name matches
    if (original.toolName === shortName) {
      return fullId
    }
    // Also check sanitized version
    const sanitizedOriginal = sanitizeForToolName(original.toolName)
    if (sanitizedOriginal === sanitizedInput) {
      return fullId
    }
  }

  // If no match by tool name, check if it matches a server name
  // and try to find a matching tool based on input parameters
  if (args && Object.keys(args).length > 0) {
    const serverStates = MCPManager.getServerStates()

    for (const state of serverStates) {
      // Check if the short name matches this server's name
      if (state.config.name === shortName ||
          sanitizeForToolName(state.config.name) === sanitizedInput) {
        // Find the tool in this server that best matches the input parameters
        const matchingTool = findToolByParameters(state.tools, args)
        if (matchingTool) {
          // Return the full tool ID
          const mcpTools = MCPManager.getAllTools()
          const toolIds = getMCPToolIds(mcpTools)
          const matchingMCPTool = mcpTools.find(tool =>
            tool.serverId === matchingTool.serverId && tool.name === matchingTool.name
          )
          if (matchingMCPTool) {
            return toolIds.get(matchingMCPTool) || getMCPToolId(matchingMCPTool)
          }
        }
      }
    }
  }

  return null
}

/**
 * Execute an MCP tool by its full tool ID
 */
export async function executeMCPTool(
  toolId: string,
  args: JsonObject,
  options: { onPartialResult?: (text: string, phase: string) => void } = {},
): Promise<MCPToolCallResult> {
  if (isMCPRouterToolId(toolId)) {
    const action = typeof args.action === 'string' ? args.action : ''

    if (action === 'search' || action === 'find' || action === 'list') {
      const query = typeof args.query === 'string' ? args.query : undefined
      options.onPartialResult?.(query ? 'Searching MCP tools...' : 'Listing MCP tools...', query ? 'searching' : 'listing')
      const text = listMCPFunctions(typeof args.query === 'string' ? args.query : undefined)
      options.onPartialResult?.(text, 'ready')
      return {
        success: true,
        content: [{ type: 'text', text }],
      }
    }

    options.onPartialResult?.('Resolving MCP tool...', 'resolving')
    const ref = findMCPFunctionRef({
      function: typeof args.tool === 'string'
        ? args.tool
        : typeof args.function === 'string'
          ? args.function
          : undefined,
      server: typeof args.server === 'string' ? args.server : undefined,
    })

    if (!ref) {
      return {
        success: false,
        error: 'MCP tool not found or ambiguous. Use action "search" or "find" to get tool identifiers, then retry with the exact tool value.',
      }
    }

    if (action === 'describe') {
      const text = describeMCPFunction(ref)
      options.onPartialResult?.(text, 'ready')
      return {
        success: true,
        content: [{ type: 'text', text }],
      }
    }

    if (action === 'call') {
      const callArgs = args.arguments && typeof args.arguments === 'object' && !Array.isArray(args.arguments)
        ? args.arguments
        : {}
      options.onPartialResult?.(`Calling MCP tool: ${ref.id}...`, 'calling')
      const result = await MCPManager.callTool(ref.serverId, ref.toolName, callArgs)
      if (!result.success) return result
      const text = mcpContentToString(result.content)
      options.onPartialResult?.(text, 'ready')
      return {
        success: true,
        content: [{ type: 'text', text }],
        isError: result.isError,
      }
    }

    return {
      success: false,
      error: 'Invalid action. Use one of: search, find, list, describe, call.',
    }
  }

  const parsed = parseMCPToolId(toolId)

  if (!parsed) {
    return {
      success: false,
      error: `Invalid MCP tool ID: ${toolId}`,
    }
  }

  return MCPManager.callTool(parsed.serverId, parsed.toolName, args)
}
