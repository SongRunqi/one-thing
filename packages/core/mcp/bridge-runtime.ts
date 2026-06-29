import type { JsonObject } from '../json.js'
import {
  buildMCPToolsForAI,
  executeMCPBridgeTool,
  getMCPFunctionRefs as getCoreMCPFunctionRefs,
  getMCPRouterDefinition,
  planMCPToolRegistration,
  planMCPToolsCatalogWrite,
  type MCPFunctionRef,
  type MCPModelFacingToolDefinition,
  type MCPRegisteredToolLike,
  type MCPToolsCatalogOptions,
  type MCPToolsCatalogWritePlan,
  type MCPToolsForAIResult,
  type MCPRouterToolSetting,
  type MCPToolRegistrationPlan,
} from './router.js'
import { isMCPToolId, CoreMCPToolIdRegistry } from './tool-id-registry.js'
import { mcpRouterToCoreToolDefinition, mcpToolToCoreToolDefinition, type CoreMCPToolDefinition } from './tool-definition.js'
import type { MCPServerState, MCPToolCallResult, MCPToolInfo } from './types.js'

export interface CoreMCPBridgeRuntimeHost {
  isEnabled(): boolean
  getAllTools(): MCPToolInfo[]
  getServerState(serverId: string): Pick<MCPServerState, 'config'> | undefined
  getServerStates(): Array<Pick<MCPServerState, 'config' | 'tools'>>
  callTool(serverId: string, toolName: string, args: JsonObject): Promise<MCPToolCallResult>
}

export interface WriteMCPToolsCatalogWithAdaptersOptions
  extends Omit<MCPToolsCatalogOptions, 'getServerName'> {
  getCatalogPath(): string
  writeFile(path: string, content: string): void
  logger?: {
    log?: (...args: unknown[]) => void
    error?: (...args: unknown[]) => void
  }
}

export type WriteMCPToolsCatalogWithAdaptersResult =
  | { status: 'skipped'; plan: MCPToolsCatalogWritePlan }
  | { status: 'written'; path: string; toolCount: number; plan: MCPToolsCatalogWritePlan }
  | { status: 'error'; error: unknown; plan: MCPToolsCatalogWritePlan }

export class CoreMCPBridgeRuntime {
  private toolsCatalogGenerated = false
  private readonly mcpToolIdRegistry = new CoreMCPToolIdRegistry<MCPToolInfo>()

  constructor(private readonly host: CoreMCPBridgeRuntimeHost) {}

  isToolsCatalogGenerated(): boolean {
    return this.toolsCatalogGenerated
  }

  markToolsCatalogGenerated(generated: boolean): void {
    this.toolsCatalogGenerated = generated
  }

  getServerName(serverId: string): string | undefined {
    const serverName = this.host.getServerState(serverId)?.config.name?.trim()
    return serverName || undefined
  }

  getServerDisplayName(serverId: string): string {
    return this.getServerName(serverId) || serverId
  }

  getMCPFunctionRefs(mcpTools: MCPToolInfo[] = this.host.getAllTools()): MCPFunctionRef[] {
    return getCoreMCPFunctionRefs(mcpTools, serverId => this.getServerDisplayName(serverId))
  }

  mcpToolToToolDefinition(mcpTool: MCPToolInfo): CoreMCPToolDefinition {
    return mcpToolToCoreToolDefinition(mcpTool)
  }

  getMCPRouterToolDefinition(): CoreMCPToolDefinition | null {
    if (!this.host.isEnabled() || this.host.getAllTools().length === 0) {
      return null
    }

    return mcpRouterToCoreToolDefinition(getMCPRouterDefinition())
  }

  planToolsCatalogWrite(options: Omit<MCPToolsCatalogOptions, 'getServerName'> = {}): MCPToolsCatalogWritePlan {
    return planMCPToolsCatalogWrite({
      ...options,
      enabled: this.host.isEnabled(),
      mcpTools: this.host.getAllTools(),
      getServerName: serverId => this.getServerName(serverId),
    })
  }

  writeToolsCatalogWithAdapters(
    options: WriteMCPToolsCatalogWithAdaptersOptions,
  ): WriteMCPToolsCatalogWithAdaptersResult {
    const plan = this.planToolsCatalogWrite(options)

    if (plan.action === 'skip') {
      this.markToolsCatalogGenerated(false)
      return { status: 'skipped', plan }
    }

    try {
      const catalogPath = options.getCatalogPath()
      options.writeFile(catalogPath, plan.content)
      this.markToolsCatalogGenerated(true)
      options.logger?.log?.(`[MCPBridge] Tools catalog generated: ${catalogPath} (${plan.toolCount} tools)`)
      return {
        status: 'written',
        path: catalogPath,
        toolCount: plan.toolCount,
        plan,
      }
    } catch (error) {
      options.logger?.error?.('[MCPBridge] Failed to write tools catalog:', error)
      this.markToolsCatalogGenerated(false)
      return { status: 'error', error, plan }
    }
  }

  buildToolsForAI(
    toolsSettings?: Record<string, MCPRouterToolSetting>,
    routerDefinition?: MCPModelFacingToolDefinition,
  ): MCPToolsForAIResult {
    const mcpTools = this.host.getAllTools()
    const result = buildMCPToolsForAI({
      enabled: this.host.isEnabled(),
      mcpTools,
      toolsSettings,
      routerDefinition,
    })

    if (result.shouldRememberTools) {
      this.mcpToolIdRegistry.rememberTools(mcpTools, serverId => this.getServerName(serverId))
    }

    return result
  }

  planToolRegistration(existingTools: MCPRegisteredToolLike[]): MCPToolRegistrationPlan {
    return planMCPToolRegistration({
      enabled: this.host.isEnabled(),
      existingTools,
      mcpTools: this.host.getAllTools(),
    })
  }

  parseMCPToolId(toolId: string): { serverId: string; toolName: string } | null {
    return this.mcpToolIdRegistry.parseToolId(toolId, {
      tools: this.host.getAllTools(),
      getServerName: serverId => this.getServerName(serverId),
    })
  }

  isMCPTool(toolId: string): boolean {
    return isMCPToolId(toolId)
  }

  findMCPToolIdByShortName(shortName: string, args?: JsonObject): string | null {
    return this.mcpToolIdRegistry.findToolIdByShortName(shortName, args, {
      tools: this.host.getAllTools(),
      serverStates: this.host.getServerStates(),
      getServerName: serverId => this.getServerName(serverId),
    })
  }

  async executeMCPTool(
    toolId: string,
    args: JsonObject,
    options: { onPartialResult?: (text: string, phase: string) => void } = {},
  ): Promise<MCPToolCallResult> {
    return executeMCPBridgeTool(toolId, args, {
      refs: this.getMCPFunctionRefs(),
      parseToolId: id => this.parseMCPToolId(id),
      callTool: (serverId, toolName, toolArgs) => this.host.callTool(serverId, toolName, toolArgs),
      onPartialResult: options.onPartialResult,
    })
  }
}
