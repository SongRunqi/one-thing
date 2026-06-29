import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CoreMCPBridgeRuntime,
  MCP_ROUTER_TOOL_ID,
  type MCPServerState,
  type MCPToolInfo,
} from '@onething/core/mcp'

const tools: MCPToolInfo[] = [
  {
    serverId: 'server-a',
    name: 'query',
    description: 'Search things',
    inputSchema: {
      type: 'object',
      properties: {
        q: { type: 'string', description: 'Search query' },
      },
      required: ['q'],
    },
  },
]

let enabled = true
let callTool = vi.fn()

function states(): MCPServerState[] {
  return [
    {
      config: {
        id: 'server-a',
        name: 'Search',
        transport: 'stdio',
        enabled: true,
      },
      status: 'connected',
      tools,
      resources: [],
      prompts: [],
    },
  ]
}

function createRuntime(): CoreMCPBridgeRuntime {
  return new CoreMCPBridgeRuntime({
    isEnabled: () => enabled,
    getAllTools: () => tools,
    getServerState: serverId => states().find(state => state.config.id === serverId),
    getServerStates: () => states(),
    callTool,
  })
}

beforeEach(() => {
  enabled = true
  callTool = vi.fn()
})

describe('CoreMCPBridgeRuntime', () => {
  it('plans catalog writes and exposes the router tool from core state', () => {
    const runtime = createRuntime()

    const catalog = runtime.planToolsCatalogWrite({ generatedAt: '2026-06-25T00:00:00.000Z' })
    expect(catalog).toMatchObject({ action: 'write', toolCount: 1 })
    expect(catalog.action === 'write' ? catalog.content : '').toContain('## Server: Search (server-a)')

    expect(runtime.getMCPRouterToolDefinition()).toMatchObject({
      id: MCP_ROUTER_TOOL_ID,
      source: 'mcp',
      executionMode: 'sequential',
    })

    runtime.markToolsCatalogGenerated(true)
    expect(runtime.isToolsCatalogGenerated()).toBe(true)
  })

  it('writes tools catalog through core host adapters', () => {
    const runtime = createRuntime()
    const writes: Array<{ path: string; content: string }> = []
    const logs: unknown[][] = []

    const result = runtime.writeToolsCatalogWithAdapters({
      generatedAt: '2026-06-25T00:00:00.000Z',
      getCatalogPath: () => '/tmp/mcp-tools.md',
      writeFile: (path, content) => {
        writes.push({ path, content })
      },
      logger: { log: (...args) => logs.push(args) },
    })

    expect(result).toMatchObject({
      status: 'written',
      path: '/tmp/mcp-tools.md',
      toolCount: 1,
    })
    expect(runtime.isToolsCatalogGenerated()).toBe(true)
    expect(writes).toHaveLength(1)
    expect(writes[0].content).toContain('# MCP Tools Catalog')
    expect(logs[0]?.[0]).toContain('[MCPBridge] Tools catalog generated:')
  })

  it('keeps catalog state in core for skipped and failed writes', () => {
    const runtime = createRuntime()
    runtime.markToolsCatalogGenerated(true)
    enabled = false

    expect(runtime.writeToolsCatalogWithAdapters({
      getCatalogPath: () => '/tmp/mcp-tools.md',
      writeFile: () => {
        throw new Error('should not write')
      },
    })).toMatchObject({ status: 'skipped' })
    expect(runtime.isToolsCatalogGenerated()).toBe(false)

    enabled = true
    const errors: unknown[][] = []
    expect(runtime.writeToolsCatalogWithAdapters({
      getCatalogPath: () => '/tmp/mcp-tools.md',
      writeFile: () => {
        throw new Error('disk full')
      },
      logger: { error: (...args) => errors.push(args) },
    })).toMatchObject({ status: 'error' })
    expect(runtime.isToolsCatalogGenerated()).toBe(false)
    expect(errors[0]?.[0]).toBe('[MCPBridge] Failed to write tools catalog:')
  })

  it('builds model-facing router tools and remembers MCP tool ids', () => {
    const runtime = createRuntime()

    const result = runtime.buildToolsForAI()

    expect(Object.keys(result.tools)).toEqual([MCP_ROUTER_TOOL_ID])
    expect(runtime.parseMCPToolId('mcp_Search_query')).toEqual({
      serverId: 'server-a',
      toolName: 'query',
    })
    expect(runtime.findMCPToolIdByShortName('query')).toBe('mcp_Search_query')
  })

  it('executes routed MCP calls through host adapters', async () => {
    const runtime = createRuntime()
    runtime.buildToolsForAI()
    callTool.mockResolvedValue({
      success: true,
      content: [{ type: 'text', text: 'ok' }],
    })

    const result = await runtime.executeMCPTool(MCP_ROUTER_TOOL_ID, {
      action: 'call',
      tool: 'query',
      arguments: { q: 'hello' },
    })

    expect(result).toEqual({
      success: true,
      content: [{ type: 'text', text: 'ok' }],
      isError: undefined,
    })
    expect(callTool).toHaveBeenCalledWith('server-a', 'query', { q: 'hello' })
  })
})
