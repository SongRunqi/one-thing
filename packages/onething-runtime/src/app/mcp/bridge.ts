/**
 * MCP Tool Bridge
 *
 * Bridges MCP tools to the existing tool system, allowing them to be used
 * seamlessly with the provider runtime
 */

import { MCPManager } from './manager.js'
import type { MCPToolInfo, MCPToolCallResult } from './types.js'
import type { ToolDefinition } from '../tools/types.js'
import { unregisterTool, getAllTools } from '../tools/registry.js'
import { getMCPToolsCatalogPath } from '../stores/paths.js'
import { z } from 'zod'
import { type JsonObject, type JsonValue } from '@onething/core'
import {
  CoreMCPBridgeRuntime,
  MCP_ROUTER_TOOL_ID,
  planMCPInputSchemaValidation,
  type CoreMCPJsonSchemaValidationPlan,
  type MCPModelFacingToolDefinition as ModelFacingToolDefinition,
} from '@onething/core/mcp'
import { pathExists, writeTextFile } from '@onething/core/storage'

const coreMCPBridgeRuntime = new CoreMCPBridgeRuntime({
  isEnabled: () => MCPManager.isEnabled,
  getAllTools: () => MCPManager.getAllTools(),
  getServerState: serverId => MCPManager.getServerState(serverId),
  getServerStates: () => MCPManager.getServerStates(),
  callTool: (serverId, toolName, args) => MCPManager.callTool(serverId, toolName, args),
})

export function mcpToolToToolDefinition(mcpTool: MCPToolInfo): ToolDefinition {
  return coreMCPBridgeRuntime.mcpToolToToolDefinition(mcpTool) as ToolDefinition
}

export function getMCPRouterToolDefinition(): ToolDefinition | null {
  return coreMCPBridgeRuntime.getMCPRouterToolDefinition() as ToolDefinition | null
}

/**
 * Create a Zod schema from MCP tool input schema
 */
export function mcpInputSchemaToZod(inputSchema: MCPToolInfo['inputSchema']): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const shape: Record<string, z.ZodTypeAny> = {}

  for (const [name, plan] of Object.entries(planMCPInputSchemaValidation(inputSchema))) {
    shape[name] = validationPlanToZod(plan)
  }

  return z.object(shape)
}

/**
 * Convert a core JSON Schema validation plan to a Zod type.
 */
function validationPlanToZod(plan: CoreMCPJsonSchemaValidationPlan, applyOptional = true): z.ZodTypeAny {
  let zodType: z.ZodTypeAny

  switch (plan.kind) {
    case 'string':
      {
        if (plan.enumValues) {
          zodType = z.enum(plan.enumValues as [string, ...string[]])
        } else {
          zodType = z.string()
        }
        break
      }
    case 'number':
      zodType = z.number()
      break
    case 'boolean':
      zodType = z.boolean()
      break
    case 'array':
      zodType = plan.items
        ? z.array(validationPlanToZod(plan.items, false))
        : z.array(z.custom<JsonValue>())
      break
    case 'object':
      if (plan.properties) {
        const nestedShape: Record<string, z.ZodTypeAny> = {}
        for (const [name, nestedPlan] of Object.entries(plan.properties)) {
          nestedShape[name] = validationPlanToZod(nestedPlan)
        }
        zodType = z.object(nestedShape)
      } else {
        zodType = z.record(z.string(), z.custom<JsonValue>())
      }
      break
    default:
      zodType = z.custom<JsonValue>()
      break
  }

  if (plan.description) {
    zodType = zodType.describe(plan.description)
  }
  if (applyOptional && !plan.required) {
    zodType = zodType.optional()
  }
  return zodType
}

/**
 * Generate the MCP tools catalog file
 * This file contains full documentation for all available MCP tools
 * AI can reference this file to understand tool capabilities in detail
 */
export function generateToolsCatalog(): void {
  coreMCPBridgeRuntime.writeToolsCatalogWithAdapters({
    getCatalogPath: getMCPToolsCatalogPath,
    writeFile: writeTextFile,
    logger: console,
  })
}

/**
 * Get the path to the tools catalog file (if it exists)
 */
export function getToolsCatalogPath(): string | null {
  if (!coreMCPBridgeRuntime.isToolsCatalogGenerated()) return null
  const path = getMCPToolsCatalogPath()
  return pathExists(path) ? path : null
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
  useCondensed: boolean = coreMCPBridgeRuntime.isToolsCatalogGenerated()
): Record<string, ModelFacingToolDefinition> {
  void useCondensed
  const plan = coreMCPBridgeRuntime.buildToolsForAI(toolsSettings)

  if (plan.skipReason === 'router-disabled') {
    console.log(`[MCPBridge] Skipping disabled MCP router tool: ${MCP_ROUTER_TOOL_ID}`)
    return plan.tools
  }

  return plan.tools
}

/**
 * Register all MCP tools with the tool registry
 * This allows them to be managed alongside built-in tools
 */
export async function registerMCPTools(): Promise<void> {
  const existingTools = getAllTools()
  const plan = coreMCPBridgeRuntime.planToolRegistration(existingTools)

  for (const toolId of plan.toolIdsToUnregister) {
    unregisterTool(toolId)
  }

  if (!plan.shouldGenerateCatalog) {
    return
  }

  // The connected tool set just changed — refresh the tool-id mapping that
  // parseMCPToolId/findMCPToolIdByShortName resolve against.
  coreMCPBridgeRuntime.rememberToolIds()

  // Generate the tools catalog file for AI reference
  generateToolsCatalog()

  if (plan.logMessage) {
    console.log(plan.logMessage)
  }
}

/**
 * Parse MCP tool ID to extract server ID and tool name
 * Uses the sanitized-to-original mapping when available
 */
export function parseMCPToolId(toolId: string): { serverId: string; toolName: string } | null {
  return coreMCPBridgeRuntime.parseMCPToolId(toolId)
}

/**
 * Check if a tool ID is an MCP tool
 */
export function isMCPTool(toolId: string): boolean {
  return coreMCPBridgeRuntime.isMCPTool(toolId)
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
  return coreMCPBridgeRuntime.findMCPToolIdByShortName(shortName, args)
}

/**
 * Resolve which MCP server owns a router-facing tool reference.
 * Permission grants are keyed per server so they cannot carry across servers.
 */
export function resolveMCPServerIdForToolRef(toolRef: string): string | undefined {
  return coreMCPBridgeRuntime.resolveServerIdForToolRef(toolRef)
}

/**
 * Execute an MCP tool by its full tool ID
 */
export async function executeMCPTool(
  toolId: string,
  args: JsonObject,
  options: { onPartialResult?: (text: string, phase: string) => void } = {},
): Promise<MCPToolCallResult> {
  return coreMCPBridgeRuntime.executeMCPTool(toolId, args, options)
}
