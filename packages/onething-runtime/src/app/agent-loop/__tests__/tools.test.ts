import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  agentModelToolsFromDefinitions,
  agentToolDefinitionsFromSourceTools,
  agentToolsFromRegistry,
  agentToolsFromToolDefinitions,
} from '../tools.js'
import { resolveAIToolName } from '@onething/core/agent-loop'
import { resolveAIToolName as resolveProviderAIToolName } from '../../providers/tool-name-alias.js'
import type { ToolSettings } from '@shared/ipc/tools.js'
import type { AgentJsonObject, AgentToolExecutionContext } from '@onething/core/agent-loop'

interface SeenToolExecution {
  toolName: string
  args: AgentJsonObject
  ctx: AgentToolExecutionContext
}

const registryMocks = vi.hoisted(() => ({
  executeTool: vi.fn(),
  getEnabledToolsAsync: vi.fn(),
  initializeToolRegistry: vi.fn(),
  setInitContext: vi.fn(),
}))

vi.mock('../../tools/registry.js', () => registryMocks)

describe('agent loop registry tool adapter', () => {
  const disabledToolSettings: ToolSettings = {
    enableToolCalls: false,
    tools: {},
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does not expose registry tools when global tool calls are disabled', async () => {
    const tools = await agentToolsFromRegistry({
      executionContext: {
        sessionId: 'base-session',
        messageId: 'base-message',
      },
      toolSettings: disabledToolSettings,
    })

    expect(tools).toEqual([])
    expect(registryMocks.initializeToolRegistry).toHaveBeenCalled()
    expect(registryMocks.getEnabledToolsAsync).not.toHaveBeenCalled()
  })

  it('forwards per-call execution context and streaming callbacks to registry tools', async () => {
    const abortSignal = new AbortController().signal
    const onMetadata = vi.fn()
    const onPartialResult = vi.fn()

    registryMocks.getEnabledToolsAsync.mockResolvedValue([{
      id: 'lookup',
      name: 'Lookup',
      enabled: true,
      autoExecute: false,
      description: 'Lookup data',
      parameters: [{
        name: 'query',
        type: 'string',
        description: 'Query',
        required: true,
      }],
      parameterSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
    }])
    registryMocks.executeTool.mockImplementation(async (_name, _args, ctx) => {
      ctx.onMetadata?.({ title: 'Preview', metadata: { path: '/tmp/a.txt' } })
      ctx.onPartialResult?.({ content: [{ type: 'text', text: 'halfway' }] })
      return { success: true, data: { output: 'done' } }
    })

    const tools = await agentToolsFromRegistry({
      executionContext: {
        sessionId: 'base-session',
        messageId: 'base-message',
        workingDirectory: '/base',
        abortSignal: new AbortController().signal,
      },
    })

    const result = await tools[0].execute(
      { query: 'moon' },
      {
        sessionId: 'agent-session',
        messageId: 'agent-message',
        toolCallId: 'call_1',
        workingDirectory: '/turn',
        abortSignal,
        onMetadata,
        onPartialResult,
      },
    )

    expect(registryMocks.executeTool).toHaveBeenCalledWith(
      'lookup',
      { query: 'moon' },
      expect.objectContaining({
        sessionId: 'agent-session',
        messageId: 'agent-message',
        toolCallId: 'call_1',
        workingDirectory: '/turn',
        abortSignal,
      }),
    )
    expect(onMetadata).toHaveBeenCalledWith({ title: 'Preview', metadata: { path: '/tmp/a.txt' } })
    expect(onPartialResult).toHaveBeenCalledWith({ content: [{ type: 'text', text: 'halfway' }] })
    expect(result).toEqual({ content: 'done', data: { output: 'done' } })
  })

  it('executes registry tools by original source id after model-name normalization', async () => {
    registryMocks.getEnabledToolsAsync.mockResolvedValue([{
      id: 'mcp:weather/current',
      description: 'Lookup weather',
      enabled: true,
      autoExecute: false,
      parameters: [{
        name: 'location',
        type: 'string',
        description: 'Location',
        required: true,
      }],
    }])
    registryMocks.executeTool.mockResolvedValue({ success: true, data: { output: 'sunny' } })

    const tools = await agentToolsFromRegistry({
      executionContext: {
        sessionId: 'base-session',
        messageId: 'base-message',
      },
    })

    expect(tools[0].name).toBe('mcp-weather-current')
    await tools[0].execute(
      { location: 'Shanghai' },
      { sessionId: 'agent-session', messageId: 'agent-message', toolCallId: 'call_1' },
    )

    expect(registryMocks.executeTool).toHaveBeenCalledWith(
      'mcp:weather/current',
      { location: 'Shanghai' },
      expect.objectContaining({
        sessionId: 'agent-session',
        messageId: 'agent-message',
        toolCallId: 'call_1',
      }),
    )
  })

  it('filters registry tools by source id or model-safe name', async () => {
    registryMocks.getEnabledToolsAsync.mockResolvedValue([
      {
        id: 'mcp:weather/current',
        description: 'Lookup weather',
        enabled: true,
        autoExecute: false,
        parameters: [],
      },
      {
        id: 'read',
        description: 'Read file',
        enabled: true,
        autoExecute: false,
        parameters: [],
      },
    ])

    const bySourceId = await agentToolsFromRegistry({
      executionContext: {
        sessionId: 'base-session',
        messageId: 'base-message',
      },
      selectedToolNames: ['mcp:weather/current'],
    })
    const byModelName = await agentToolsFromRegistry({
      executionContext: {
        sessionId: 'base-session',
        messageId: 'base-message',
      },
      selectedToolNames: ['mcp-weather-current'],
    })

    expect(bySourceId.map(tool => tool.name)).toEqual(['mcp-weather-current'])
    expect(byModelName.map(tool => tool.name)).toEqual(['mcp-weather-current'])
  })

  it('converts source tool definitions into executable agent tools without the provider facade', async () => {
    const definitions = agentToolDefinitionsFromSourceTools([{
      id: 'mcp:weather/current',
      description: 'Read current weather',
      parameters: [{
        name: 'location',
        type: 'string',
        description: 'Location name',
        required: true,
      }],
    }])
    const seen: SeenToolExecution[] = []
    const tools = agentToolsFromToolDefinitions(definitions, async (toolName, args, ctx) => {
      seen.push({ toolName, args, ctx })
      return { success: true, data: { output: 'sunny' } }
    })

    expect(Object.keys(definitions)).toEqual(['mcp-weather-current'])
    expect(resolveAIToolName('mcp-weather-current')).toBe('mcp:weather/current')
    expect(resolveProviderAIToolName('mcp-weather-current')).toBe('mcp:weather/current')
    expect(tools).toHaveLength(1)
    expect(tools[0]).toMatchObject({
      name: 'mcp-weather-current',
      description: 'Read current weather',
      parameters: {
        type: 'object',
        properties: {
          location: {
            type: 'string',
            description: 'Location name',
          },
        },
        required: ['location'],
      },
    })

    const result = await tools[0].execute(
      { location: 'Shanghai' },
      { sessionId: 's1', messageId: 'm1', toolCallId: 'call_1' },
    )

    expect(result).toEqual({ content: 'sunny', data: { output: 'sunny' } })
    expect(seen).toEqual([{
      toolName: 'mcp-weather-current',
      args: { location: 'Shanghai' },
      ctx: { sessionId: 's1', messageId: 'm1', toolCallId: 'call_1' },
    }])
  })

  it('converts model tool definitions into declaration-only agent tools', async () => {
    const tools = agentModelToolsFromDefinitions({
      search_docs: {
        description: 'Search docs',
        parameters: [{
          name: 'query',
          type: 'string',
          description: 'Search query',
          required: true,
        }],
      },
      submit_patch: {
        description: 'Submit patch',
        parameters: [],
        parameterSchema: {
          type: 'object',
          properties: {
            patch: { type: 'string' },
          },
          required: ['patch'],
        },
      },
    })

    expect(tools).toHaveLength(2)
    expect(tools[0]).toMatchObject({
      name: 'search_docs',
      description: 'Search docs',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search query',
          },
        },
        required: ['query'],
      },
    })
    expect(tools[1].parameters).toEqual({
      type: 'object',
      properties: {
        patch: { type: 'string' },
      },
      required: ['patch'],
    })
    await expect(tools[0].execute({}, {
      sessionId: 's1',
      messageId: 'm1',
      toolCallId: 'call_1',
    })).resolves.toEqual({ content: '' })
  })
})
