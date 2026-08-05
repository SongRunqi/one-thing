import { describe, expect, it } from 'vitest'
import {
  buildMCPTransportPlan,
  callMCPToolWithTimeout,
  connectMCPClientWithAdapters,
  CoreMCPClientRuntime,
  createMCPServerState,
  disconnectMCPClientWithAdapters,
  errorMessage,
  getMCPPromptMessages,
  markMCPServerConnected,
  markMCPServerDisconnected,
  markMCPServerError,
  mcpClientNotConnectedResult,
  mcpConnectionTimeoutMessage,
  mcpConnectTimeoutMs,
  mcpToolCallTimeoutMessage,
  mergeMCPEnvironment,
  normalizeMCPPromptInfos,
  normalizeMCPPromptMessages,
  normalizeMCPResourceInfos,
  normalizeMCPResourceReadContent,
  normalizeMCPToolCallSuccessResult,
  normalizeMCPToolInfos,
  readMCPResource,
  refreshMCPClientCapabilities,
  runMCPConnectedClientOperation,
  setMCPServerStatus,
  updateMCPClientConfigWithAdapters,
} from '@onething/core/mcp'
import type { MCPServerConfig } from '@onething/core/mcp'

const config: MCPServerConfig = {
  id: 'server-1',
  name: 'Server 1',
  transport: 'stdio',
  enabled: true,
  command: 'node',
}

describe('core MCP client state helpers', () => {
  it('keeps MCP client lifecycle state in core', () => {
    const initial = createMCPServerState(config)
    expect(initial).toMatchObject({
      config,
      status: 'disconnected',
      tools: [],
      resources: [],
      prompts: [],
    })

    const connecting = setMCPServerStatus(initial, 'connecting')
    expect(connecting.status).toBe('connecting')
    expect(connecting.error).toBeUndefined()

    const connected = markMCPServerConnected(connecting, 123)
    expect(connected).toMatchObject({
      status: 'connected',
      connectedAt: 123,
      error: undefined,
    })

    const failed = markMCPServerError(connected, new Error('boom'))
    expect(failed).toMatchObject({
      status: 'error',
      error: 'boom',
    })

    const disconnected = markMCPServerDisconnected({
      ...connected,
      tools: [{
        serverId: 'server-1',
        name: 'search',
        inputSchema: { type: 'object' },
      }],
    })
    expect(disconnected).toMatchObject({
      status: 'disconnected',
      tools: [],
      resources: [],
      prompts: [],
      connectedAt: undefined,
      error: undefined,
    })
  })

  it('normalizes MCP SDK capabilities without SDK imports', () => {
    expect(normalizeMCPToolInfos('server-1', [
      {
        name: 'search',
        description: 'Search docs',
        inputSchema: {
          properties: {
            query: { type: 'string', description: 'Query text' },
          },
          required: ['query'],
        },
      },
      { description: 'missing name' },
    ])).toEqual([{
      serverId: 'server-1',
      name: 'search',
      description: 'Search docs',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Query text' },
        },
        required: ['query'],
      },
    }])

    expect(normalizeMCPResourceInfos('server-1', [
      { uri: new URL('file:///tmp/a.txt'), name: 'A', mimeType: 'text/plain' },
      { name: 'missing uri' },
    ])).toEqual([{
      serverId: 'server-1',
      uri: 'file:///tmp/a.txt',
      name: 'A',
      description: undefined,
      mimeType: 'text/plain',
    }])

    expect(normalizeMCPPromptInfos('server-1', [
      {
        name: 'summarize',
        description: 'Summarize text',
        arguments: [
          { name: 'topic', description: 'Topic', required: true },
          { description: 'missing name' },
        ],
      },
    ])).toEqual([{
      serverId: 'server-1',
      name: 'summarize',
      description: 'Summarize text',
      arguments: [{
        name: 'topic',
        description: 'Topic',
        required: true,
      }],
    }])
  })

  it('normalizes MCP results, prompt messages, resources, env, and timeout messages', () => {
    expect(normalizeMCPToolCallSuccessResult({
      content: [
        { type: 'text', text: 'ok' },
        null,
        { type: 'image', data: 'abc', mimeType: 'image/png' },
      ],
      isError: false,
    })).toEqual({
      success: true,
      content: [
        { type: 'text', text: 'ok' },
        { type: 'image', data: 'abc', mimeType: 'image/png' },
      ],
      isError: false,
    })

    expect(normalizeMCPResourceReadContent([{ uri: 'file:///tmp/a.txt' }])).toEqual([
      { uri: 'file:///tmp/a.txt' },
    ])
    expect(normalizeMCPPromptMessages([{ role: 'user', content: 'hi' }])).toEqual([
      { role: 'user', content: 'hi' },
    ])
    // Host env is NOT inherited wholesale — only the documented allowlist.
    // `A` is not on it, so setting a custom var must not drag it along.
    expect(mergeMCPEnvironment({ A: '1', B: undefined }, { B: '2' })).toEqual({
      B: '2',
    })
    expect(mergeMCPEnvironment({ A: '1' })).toEqual({})
    expect(mergeMCPEnvironment({ A: '1', HTTPS_PROXY: 'http://p:1' }, { B: '2' })).toEqual({
      HTTPS_PROXY: 'http://p:1',
      B: '2',
    })
    expect(mcpConnectTimeoutMs('sse')).toBe(30000)
    expect(mcpConnectTimeoutMs('stdio')).toBe(60000)
    expect(mcpConnectionTimeoutMessage(30000)).toBe('Connection timeout after 30s')
    expect(mcpToolCallTimeoutMessage('search', 60000)).toBe('MCP tool call "search" timed out after 60s')
    expect(errorMessage(null)).toBe('Unknown error')
    expect(mcpClientNotConnectedResult()).toEqual({
      success: false,
      error: 'Client not connected',
    })
  })

  it('runs connected MCP client operations through a core guard', async () => {
    const client = { id: 'client-1' }

    await expect(runMCPConnectedClientOperation(client, async current => ({
      success: true,
      value: current.id,
    }))).resolves.toEqual({
      success: true,
      value: 'client-1',
    })

    await expect(runMCPConnectedClientOperation(null, async () => {
      throw new Error('unreachable')
    })).resolves.toEqual({
      success: false,
      error: 'Client not connected',
    })
  })

  it('converges to the configured target state when updating config', async () => {
    const adapters = () => {
      const connects: string[] = []
      return {
        connects,
        adapters: {
          createTransport: () => ({}),
          createClient: () => ({}),
          connectClient: async () => { connects.push('connect') },
          refreshCapabilities: async () => ({ tools: [], resources: [], prompts: [] }),
          closeClient: async () => {},
          closeTransport: async () => {},
          logger: { log: () => {}, warn: () => {}, error: () => {} },
        },
      }
    }

    // A client that exists but failed to connect must retry once the user
    // fixes the config — previously only an already-connected client relinked,
    // so a corrected command left the server stuck red.
    const failed = adapters()
    const fromError = await updateMCPClientConfigWithAdapters({
      state: markMCPServerError(createMCPServerState(config), new Error('spawn ENOENT')),
      client: null,
      transport: null,
      config: { ...config, command: 'fixed-command' },
      baseEnv: {},
      adapters: failed.adapters,
    })
    expect(failed.connects).toHaveLength(1)
    expect(fromError.state.status).toBe('connected')

    // Toggled off -> the disconnected client must not be reconnected.
    const disabled = adapters()
    const toDisabled = await updateMCPClientConfigWithAdapters({
      state: markMCPServerDisconnected(createMCPServerState(config)),
      client: null,
      transport: null,
      config: { ...config, enabled: false },
      baseEnv: {},
      adapters: disabled.adapters,
    })
    expect(disabled.connects).toHaveLength(0)
    expect(toDisabled.state.status).toBe('disconnected')

    // A failing reconnect must not throw: the caller already persisted the new
    // config, so throwing would report "save failed" for a save that happened.
    const broken = adapters()
    broken.adapters.connectClient = async () => { throw new Error('still broken') }
    const stillBroken = await updateMCPClientConfigWithAdapters({
      state: markMCPServerError(createMCPServerState(config), new Error('spawn ENOENT')),
      client: null,
      transport: null,
      config: { ...config, command: 'also-wrong' },
      baseEnv: {},
      adapters: broken.adapters,
    })
    expect(stillBroken.state.status).toBe('error')
    expect(stillBroken.state.error).toContain('still broken')
  })

  it('builds transport plans without importing MCP SDK transports', () => {
    // PATH is supplied by the transport SDK's own safe default env; the host
    // environment is NOT forwarded wholesale (that leaked provider keys into
    // third-party MCP child processes). Only the documented allowlist rides
    // along — HTTPS_PROXY here — plus the server's own declared env.
    expect(buildMCPTransportPlan({
      ...config,
      args: ['server.js'],
      env: { CUSTOM: 'yes' },
      cwd: '/tmp/project',
    }, {
      PATH: '/bin',
      ANTHROPIC_API_KEY: 'sk-should-not-leak',
      HTTPS_PROXY: 'http://proxy:8080',
      EMPTY: undefined,
    })).toEqual({
      transport: 'stdio',
      command: 'node',
      args: ['server.js'],
      env: {
        HTTPS_PROXY: 'http://proxy:8080',
        CUSTOM: 'yes',
      },
      cwd: '/tmp/project',
      timeoutMs: 60000,
      logMessage: 'Connecting via stdio: node server.js',
    })

    expect(buildMCPTransportPlan({
      id: 'sse',
      name: 'SSE',
      enabled: true,
      transport: 'sse',
      url: 'https://example.test/mcp',
      headers: { Authorization: 'Bearer token' },
    }, {})).toEqual({
      transport: 'sse',
      url: 'https://example.test/mcp',
      headers: { Authorization: 'Bearer token' },
      timeoutMs: 30000,
      logMessage: 'Connecting via SSE: https://example.test/mcp',
    })

    expect(() => buildMCPTransportPlan({
      ...config,
      command: undefined,
    }, {})).toThrow('Command is required for stdio transport')
    expect(() => buildMCPTransportPlan({
      id: 'sse',
      name: 'SSE',
      enabled: true,
      transport: 'sse',
    }, {})).toThrow('URL is required for SSE transport')
  })

  it('refreshes MCP capabilities through an injected client adapter', async () => {
    const warnings: unknown[][] = []
    const result = await refreshMCPClientCapabilities('server-1', {
      async listTools() {
        return { tools: [{ name: 'search', inputSchema: { type: 'object' } }] }
      },
      async listResources() {
        throw new Error('resources unavailable')
      },
      async listPrompts() {
        return { prompts: [{ name: 'summarize' }] }
      },
    }, {
      warn: (...args) => warnings.push(args),
    })

    expect(result).toEqual({
      tools: [{ serverId: 'server-1', name: 'search', description: undefined, inputSchema: { type: 'object' } }],
      resources: [],
      prompts: [{ serverId: 'server-1', name: 'summarize', description: undefined, arguments: undefined }],
    })
    expect(warnings[0][0]).toBe('[MCP:server-1] Failed to list resources:')
  })

  it('connects and disconnects MCP clients through injected SDK adapters', async () => {
    type TestClient = { id: string; closed?: boolean }
    type TestTransport = { kind: string; closed?: boolean }

    const stateChanges: string[] = []
    const logs: unknown[][] = []
    const result = await connectMCPClientWithAdapters<TestClient, TestTransport>({
      state: createMCPServerState({
        ...config,
        args: ['server.js'],
      }),
      client: null,
      transport: null,
      baseEnv: { PATH: '/bin' },
      adapters: {
        createTransport: plan => {
          expect(plan).toMatchObject({
            transport: 'stdio',
            command: 'node',
            args: ['server.js'],
          })
          return { kind: plan.transport }
        },
        createClient: () => ({ id: 'client-1' }),
        connectClient: async (client, transport) => {
          expect(client.id).toBe('client-1')
          expect(transport.kind).toBe('stdio')
        },
        refreshCapabilities: async serverId => {
          expect(serverId).toBe('server-1')
          return {
            tools: [{ serverId, name: 'search', inputSchema: { type: 'object' } }],
            resources: [{ serverId, uri: 'file:///tmp/a.txt', name: 'A' }],
            prompts: [{ serverId, name: 'summarize' }],
          }
        },
        onStateChange: state => stateChanges.push(state.status),
        logger: { log: (...args) => logs.push(args) },
        now: () => 1234,
      },
    })

    expect(result.alreadyConnected).toBe(false)
    expect(result.client).toEqual({ id: 'client-1' })
    expect(result.transport).toEqual({ kind: 'stdio' })
    expect(result.state).toMatchObject({
      status: 'connected',
      connectedAt: 1234,
      tools: [{ serverId: 'server-1', name: 'search', inputSchema: { type: 'object' } }],
      resources: [{ serverId: 'server-1', uri: 'file:///tmp/a.txt', name: 'A' }],
      prompts: [{ serverId: 'server-1', name: 'summarize' }],
    })
    expect(stateChanges).toEqual(['connecting', 'connected'])
    expect(logs.some(args => String(args[0]).includes('Connected successfully'))).toBe(true)

    const disconnectResult = await disconnectMCPClientWithAdapters({
      state: result.state,
      client: result.client,
      transport: result.transport,
      adapters: {
        closeClient: async client => {
          client.closed = true
        },
        closeTransport: async transport => {
          transport.closed = true
        },
        logger: { log: (...args) => logs.push(args) },
      },
    })

    expect(result.client?.closed).toBe(true)
    expect(result.transport?.closed).toBe(true)
    expect(disconnectResult).toEqual({
      state: {
        ...result.state,
        status: 'disconnected',
        error: undefined,
        tools: [],
        resources: [],
        prompts: [],
        connectedAt: undefined,
      },
      client: null,
      transport: null,
    })
  })

  it('updates MCP client config and reconnects through core lifecycle adapters', async () => {
    type TestClient = { id: string; closed?: boolean }
    type TestTransport = { kind: string; closed?: boolean }

    const oldClient: TestClient = { id: 'old-client' }
    const oldTransport: TestTransport = { kind: 'stdio' }
    const connectedState = {
      ...markMCPServerConnected(createMCPServerState(config), 111),
      tools: [{ serverId: 'server-1', name: 'search', inputSchema: { type: 'object' as const } }],
    }

    const updatedConfig: MCPServerConfig = {
      ...config,
      command: 'bun',
      args: ['server.ts'],
    }

    const reconnected = await updateMCPClientConfigWithAdapters<TestClient, TestTransport>({
      state: connectedState,
      client: oldClient,
      transport: oldTransport,
      config: updatedConfig,
      baseEnv: { PATH: '/bin' },
      adapters: {
        createTransport: plan => {
          expect(plan).toMatchObject({
            transport: 'stdio',
            command: 'bun',
            args: ['server.ts'],
          })
          return { kind: plan.transport }
        },
        createClient: () => ({ id: 'new-client' }),
        connectClient: async () => undefined,
        refreshCapabilities: async serverId => ({
          tools: [{ serverId, name: 'next-search', inputSchema: { type: 'object' } }],
          resources: [],
          prompts: [],
        }),
        closeClient: async client => {
          client.closed = true
        },
        closeTransport: async transport => {
          transport.closed = true
        },
        now: () => 222,
      },
    })

    expect(oldClient.closed).toBe(true)
    expect(oldTransport.closed).toBe(true)
    expect(reconnected.wasConnected).toBe(true)
    expect(reconnected.reconnected).toBe(true)
    expect(reconnected.client).toEqual({ id: 'new-client' })
    expect(reconnected.transport).toEqual({ kind: 'stdio' })
    expect(reconnected.state).toMatchObject({
      config: updatedConfig,
      status: 'connected',
      connectedAt: 222,
      tools: [{ serverId: 'server-1', name: 'next-search', inputSchema: { type: 'object' } }],
    })

    const disabledConfig: MCPServerConfig = {
      ...updatedConfig,
      enabled: false,
    }
    const disabled = await updateMCPClientConfigWithAdapters<TestClient, TestTransport>({
      state: reconnected.state,
      client: reconnected.client,
      transport: reconnected.transport,
      config: disabledConfig,
      baseEnv: {},
      adapters: {
        createTransport: () => {
          throw new Error('should not reconnect disabled config')
        },
        createClient: () => {
          throw new Error('should not recreate disabled config')
        },
        connectClient: async () => undefined,
        refreshCapabilities: async () => ({ tools: [], resources: [], prompts: [] }),
        closeClient: async client => {
          client.closed = true
        },
        closeTransport: async transport => {
          transport.closed = true
        },
      },
    })

    expect(disabled.wasConnected).toBe(true)
    expect(disabled.reconnected).toBe(false)
    expect(disabled.client).toBeNull()
    expect(disabled.transport).toBeNull()
    expect(disabled.state).toMatchObject({
      config: disabledConfig,
      status: 'disconnected',
      tools: [],
      resources: [],
      prompts: [],
    })
  })

  it('owns MCP client runtime lifecycle in core while using injected adapters', async () => {
    type TestTransport = { kind: string; closed?: boolean }
    class TestClient {
      closed = false
      constructor(public readonly id: string) {}
      async listTools() {
        return { tools: [{ name: 'search', inputSchema: { type: 'object' } }] }
      }
      async listResources() {
        return { resources: [{ uri: 'file:///tmp/a.txt', name: 'A' }] }
      }
      async listPrompts() {
        return { prompts: [{ name: 'summarize' }] }
      }
      async callTool(input: { name: string; arguments: Record<string, unknown> }) {
        return { content: [{ type: 'text', text: `${input.name}:${input.arguments.query}` }] }
      }
      async readResource(input: { uri: string }) {
        return { contents: [{ uri: input.uri, text: 'hello' }] }
      }
      async getPrompt(input: { name: string; arguments?: Record<string, string> }) {
        return { messages: [{ role: 'user', content: `${input.name}:${input.arguments?.topic}` }] }
      }
    }

    const createdClients: TestClient[] = []
    const createdTransports: TestTransport[] = []
    const transportPlans: Array<{ command?: string; args?: string[] }> = []
    const runtime = new CoreMCPClientRuntime<TestClient, TestTransport>({
      config: {
        ...config,
        args: ['server.js'],
      },
      getBaseEnv: () => ({ PATH: '/bin' }),
      adapters: {
        createTransport: plan => {
          if (plan.transport !== 'stdio') {
            throw new Error('expected stdio transport')
          }
          transportPlans.push({ command: plan.command, args: plan.args })
          const transport = { kind: plan.transport }
          createdTransports.push(transport)
          return transport
        },
        createClient: () => {
          const client = new TestClient(`client-${createdClients.length + 1}`)
          createdClients.push(client)
          return client
        },
        connectClient: async (client, transport) => {
          expect(client.id).toMatch(/^client-/)
          expect(transport.kind).toBe('stdio')
        },
        refreshCapabilities: (serverId, client, logger) => refreshMCPClientCapabilities(serverId, client, logger),
        closeClient: async client => {
          client.closed = true
        },
        closeTransport: async transport => {
          transport.closed = true
        },
        now: () => 123,
      },
    })

    expect(runtime.status).toBe('disconnected')
    await runtime.connect()
    expect(transportPlans[0]).toEqual({ command: 'node', args: ['server.js'] })
    expect(runtime.state).toMatchObject({
      status: 'connected',
      connectedAt: 123,
      tools: [{ serverId: 'server-1', name: 'search', inputSchema: { type: 'object' } }],
    })

    await expect(runtime.callTool('search', { query: 'core' })).resolves.toMatchObject({
      success: true,
      content: [{ type: 'text', text: 'search:core' }],
    })
    await expect(runtime.readResource('file:///tmp/a.txt')).resolves.toMatchObject({
      success: true,
      content: [{ uri: 'file:///tmp/a.txt', text: 'hello' }],
    })
    await expect(runtime.getPrompt('summarize', { topic: 'core' })).resolves.toMatchObject({
      success: true,
      messages: [{ role: 'user', content: 'summarize:core' }],
    })

    await runtime.updateConfig({
      ...config,
      command: 'bun',
      args: ['server.ts'],
    })
    expect(createdClients[0].closed).toBe(true)
    expect(createdTransports[0].closed).toBe(true)
    expect(transportPlans[1]).toEqual({ command: 'bun', args: ['server.ts'] })
    expect(runtime.state.config.command).toBe('bun')
    expect(runtime.status).toBe('connected')

    await runtime.disconnect()
    expect(runtime.status).toBe('disconnected')
    expect(runtime.currentClient).toBeNull()
    expect(runtime.currentTransport).toBeNull()
  })

  it('wraps MCP tool/resource/prompt operations in core', async () => {
    await expect(callMCPToolWithTimeout({
      async callTool(input) {
        expect(input).toEqual({ name: 'search', arguments: { query: 'core' } })
        return { content: [{ type: 'text', text: 'ok' }], isError: false }
      },
    }, 'search', { query: 'core' }, 1000)).resolves.toEqual({
      success: true,
      content: [{ type: 'text', text: 'ok' }],
      isError: false,
    })

    await expect(callMCPToolWithTimeout({
      async callTool() {
        throw new Error('boom')
      },
    }, 'search', {}, 1000)).resolves.toEqual({
      success: false,
      error: 'boom',
    })

    await expect(readMCPResource({
      async readResource(input) {
        expect(input).toEqual({ uri: 'file:///tmp/a.txt' })
        return { contents: [{ text: 'hello' }] }
      },
    }, 'file:///tmp/a.txt')).resolves.toEqual({
      success: true,
      content: [{ text: 'hello' }],
    })

    await expect(getMCPPromptMessages({
      async getPrompt(input) {
        expect(input).toEqual({ name: 'summarize', arguments: { topic: 'core' } })
        return { messages: [{ role: 'user', content: 'hi' }] }
      },
    }, 'summarize', { topic: 'core' })).resolves.toEqual({
      success: true,
      messages: [{ role: 'user', content: 'hi' }],
    })
  })
})
