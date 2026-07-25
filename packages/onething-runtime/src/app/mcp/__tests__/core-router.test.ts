import { describe, expect, it } from 'vitest'
import {
  buildMCPToolsCatalog,
  buildMCPToolsForAI,
  describeMCPFunction,
  executeMCPBridgeTool,
  findMCPFunctionRef,
  getMCPFunctionRefs,
  getMCPRouterDefinition,
  listMCPFunctions,
  mcpContentToString,
  planMCPToolRegistration,
  planMCPToolsCatalogWrite,
  resolveMCPRouterAction,
} from '@onething/core/mcp'
import {
  mcpRouterToCoreToolDefinition,
  mcpToolToCoreToolDefinition,
  normalizeMCPContent,
  planMCPInputSchemaValidation,
} from '@onething/core/mcp'
import type { MCPToolInfo } from '@onething/core/mcp'

const tools: MCPToolInfo[] = [
  {
    serverId: 'context7-server',
    name: 'resolve-library-id',
    description: 'Resolve a package name to a Context7 library id.',
    inputSchema: {
      type: 'object',
      required: ['libraryName'],
      properties: {
        libraryName: {
          type: 'string',
          description: 'Package name to resolve.',
        },
      },
    },
  },
  {
    serverId: 'fetch-server',
    name: 'fetch',
    description: 'Fetch a URL.',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'URL to fetch.',
        },
      },
    },
  },
]

const serverName = (serverId: string): string | undefined => ({
  'context7-server': 'context7',
  'fetch-server': 'fetch',
})[serverId]

describe('core MCP router helpers', () => {
  it('builds searchable refs and resolves exact function names', () => {
    const refs = getMCPFunctionRefs(tools, serverName)

    expect(refs.map(ref => ref.id)).toEqual(['resolve-library-id', 'fetch'])
    expect(findMCPFunctionRef(refs, { function: 'fetch' })?.serverId).toBe('fetch-server')
  })

  it('lists, searches, and describes tools', () => {
    const refs = getMCPFunctionRefs(tools, serverName)

    expect(listMCPFunctions(refs, 'context')).toContain('resolve-library-id')
    expect(describeMCPFunction(refs[0])).toContain('Input schema:')
  })

  it('builds provider-facing router schema and catalog markdown', () => {
    const router = getMCPRouterDefinition()
    const catalog = buildMCPToolsCatalog(tools, {
      generatedAt: '2026-06-25T00:00:00.000Z',
      getServerName: serverName,
    })

    expect(router.parameterSchema?.required).toEqual(['action'])
    expect(catalog).toContain('# MCP Tools Catalog')
    expect(catalog).toContain('## Server: context7 (context7-server)')
    expect(catalog).toContain('| libraryName | string |')
  })

  it('plans MCP input schema validation without Zod in core', () => {
    expect(planMCPInputSchemaValidation({
      required: ['query', 'options'],
      properties: {
        query: {
          type: 'string',
          description: 'Search query.',
          enum: ['vue', 'react'],
        },
        limit: {
          type: 'integer',
        },
        options: {
          type: 'object',
          required: ['includeArchived'],
          properties: {
            includeArchived: { type: 'boolean' },
            tags: {
              type: 'array',
              items: { type: 'string' },
            },
          },
        },
      },
    })).toEqual({
      query: {
        kind: 'string',
        description: 'Search query.',
        required: true,
        enumValues: ['vue', 'react'],
      },
      limit: {
        kind: 'number',
        description: undefined,
        required: false,
      },
      options: {
        kind: 'object',
        description: undefined,
        required: true,
        properties: {
          includeArchived: {
            kind: 'boolean',
            description: undefined,
            required: true,
          },
          tags: {
            kind: 'array',
            description: undefined,
            required: false,
            items: {
              kind: 'string',
              description: undefined,
              required: true,
              enumValues: undefined,
            },
          },
        },
      },
    })
  })

  it('plans MCP tools catalog writes in core', () => {
    expect(planMCPToolsCatalogWrite({
      enabled: false,
      mcpTools: tools,
    })).toEqual({
      action: 'skip',
      generated: false,
      reason: 'mcp-disabled',
      toolCount: 2,
    })

    expect(planMCPToolsCatalogWrite({
      enabled: true,
      mcpTools: [],
    })).toEqual({
      action: 'skip',
      generated: false,
      reason: 'no-tools',
      toolCount: 0,
    })

    const plan = planMCPToolsCatalogWrite({
      enabled: true,
      mcpTools: tools,
      generatedAt: '2026-06-25T00:00:00.000Z',
      getServerName: serverName,
    })

    expect(plan).toMatchObject({
      action: 'write',
      generated: true,
      toolCount: 2,
    })
    expect(plan.action === 'write' ? plan.content : '').toContain('## Server: context7 (context7-server)')
  })

  it('plans MCP tool registration side effects in core', () => {
    expect(planMCPToolRegistration({
      enabled: false,
      mcpTools: tools,
      existingTools: [
        { id: 'read' },
        { id: 'mcp:server:old-tool' },
        { id: 'mcp_search' },
      ],
    })).toEqual({
      toolIdsToUnregister: ['mcp:server:old-tool'],
      shouldGenerateCatalog: false,
      shouldExposeRouter: false,
      toolCount: 2,
    })

    expect(planMCPToolRegistration({
      enabled: true,
      mcpTools: tools,
      existingTools: [
        { id: 'mcp:server:old-tool' },
        { id: 'mcp_new_style_tool' },
      ],
    })).toEqual({
      toolIdsToUnregister: ['mcp:server:old-tool'],
      shouldGenerateCatalog: true,
      shouldExposeRouter: true,
      toolCount: 2,
      logMessage: '[MCPBridge] MCP router ready (2 functions)',
    })
  })

  it('plans provider-facing MCP router exposure in core', () => {
    expect(buildMCPToolsForAI({
      enabled: false,
      mcpTools: tools,
    })).toEqual({
      tools: {},
      shouldRememberTools: false,
      skipReason: 'mcp-disabled',
    })

    expect(buildMCPToolsForAI({
      enabled: true,
      mcpTools: [],
    })).toEqual({
      tools: {},
      shouldRememberTools: false,
      skipReason: 'no-tools',
    })

    expect(buildMCPToolsForAI({
      enabled: true,
      mcpTools: tools,
      toolsSettings: {
        mcp_search: { enabled: false },
      },
    })).toEqual({
      tools: {},
      shouldRememberTools: false,
      skipReason: 'router-disabled',
    })

    const plan = buildMCPToolsForAI({
      enabled: true,
      mcpTools: tools,
    })
    expect(plan.shouldRememberTools).toBe(true)
    expect(Object.keys(plan.tools)).toEqual(['mcp_search'])
    expect(plan.tools.mcp_search.parameterSchema?.required).toEqual(['action'])
  })

  it('maps MCP tools and router definitions to app tool definitions in core', () => {
    const nestedTool = mcpToolToCoreToolDefinition({
      serverId: 'server',
      name: 'nested',
      description: 'Nested MCP tool',
      inputSchema: {
        type: 'object',
        properties: {
          mode: {
            type: 'string',
            enum: ['fast', 'safe'],
            default: 'safe',
            description: 'Execution mode.',
          },
          items: {
            type: 'array',
            description: 'Nested items.',
            items: {
              type: 'object',
              properties: {
                value: { type: 'string', description: 'Value text.' },
              },
              required: ['value'],
            },
          },
        },
        required: ['items'],
      },
    })
    const routerTool = mcpRouterToCoreToolDefinition()

    expect(nestedTool.parameters).toContainEqual({
      name: 'mode',
      type: 'string',
      description: 'Execution mode.',
      required: false,
      enum: ['fast', 'safe'],
      default: 'safe',
    })
    expect(nestedTool.parameterSchema?.properties?.items).toMatchObject({
      type: 'array',
      items: {
        type: 'object',
        properties: {
          value: { type: 'string', description: 'Value text.' },
        },
        required: ['value'],
      },
    })
    expect(routerTool.id).toBe('mcp_search')
    expect(routerTool.executionMode).toBe('sequential')
    expect(routerTool.source).toBe('mcp')
  })

  it('formats MCP content for model-visible output', () => {
    expect(mcpContentToString([
      { type: 'text', text: 'hello' },
      { type: 'image', data: 'abc', mimeType: 'image/png' },
    ])).toContain('hello')
  })

  it('normalizes raw MCP SDK content without transport dependencies', () => {
    expect(normalizeMCPContent([
      { type: 'text', text: 'hello' },
      { type: 'image', data: 'abc', mimeType: 'image/png' },
      { type: 'resource', text: 'file', data: 'xyz', mimeType: 'text/plain' },
      { custom: true },
    ])).toEqual([
      { type: 'text', text: 'hello' },
      { type: 'image', data: 'abc', mimeType: 'image/png' },
      { type: 'resource', text: 'file', data: 'xyz', mimeType: 'text/plain' },
      { type: 'text', text: '{"custom":true}' },
    ])

    expect(normalizeMCPContent(undefined)).toBeUndefined()
  })

  it('resolves router actions without invoking transport', () => {
    const refs = getMCPFunctionRefs(tools, serverName)

    expect(resolveMCPRouterAction({ action: 'search', query: 'fetch' }, refs).kind).toBe('handled')

    const call = resolveMCPRouterAction({
      action: 'call',
      tool: 'fetch',
      arguments: { url: 'https://example.com' },
    }, refs)

    expect(call.kind).toBe('call')
    if (call.kind === 'call') {
      expect(call.ref.serverId).toBe('fetch-server')
      expect(call.args).toEqual({ url: 'https://example.com' })
    }
  })

  it('executes MCP bridge router and direct tool paths through core adapters', async () => {
    const refs = getMCPFunctionRefs(tools, serverName)
    const calls: Array<{ serverId: string; toolName: string; args: Record<string, unknown> }> = []
    const partials: Array<{ text: string; phase: string }> = []
    const callTool = async (serverId: string, toolName: string, args: Record<string, unknown>) => {
      calls.push({ serverId, toolName, args })
      return {
        success: true,
        content: [{ type: 'text' as const, text: `called ${serverId}/${toolName}` }],
      }
    }

    const routerResult = await executeMCPBridgeTool('mcp_search', {
      action: 'call',
      tool: 'fetch',
      arguments: { url: 'https://example.com' },
    }, {
      refs,
      parseToolId: () => null,
      callTool,
      onPartialResult: (text, phase) => partials.push({ text, phase }),
    })

    expect(routerResult).toEqual({
      success: true,
      content: [{ type: 'text', text: 'called fetch-server/fetch' }],
      isError: undefined,
    })
    expect(calls[0]).toEqual({
      serverId: 'fetch-server',
      toolName: 'fetch',
      args: { url: 'https://example.com' },
    })
    expect(partials.map(partial => partial.phase)).toContain('ready')

    const directResult = await executeMCPBridgeTool('mcp_fetch_fetch', { url: 'https://example.com' }, {
      refs,
      parseToolId: () => ({ serverId: 'fetch-server', toolName: 'fetch' }),
      callTool,
    })

    expect(directResult.success).toBe(true)
    expect(calls[1]).toEqual({
      serverId: 'fetch-server',
      toolName: 'fetch',
      args: { url: 'https://example.com' },
    })
  })
})
