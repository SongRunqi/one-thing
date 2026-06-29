import { describe, expect, it } from 'vitest'
import {
  HeadlessToolRegistry,
  analyzeCoreToolWithAdapters,
  canCoreToolAutoExecute,
  collectCoreProviderToolSchemasWithAdapters,
  collectCoreToolDefinitionsWithAdapters,
  createCoreToolCall,
  coreProviderToolSchemaFromJsonSchema,
  coreProviderToolSchemaFromParameters,
  coreToolAnalysisSuccessResult,
  coreToolContextFromHost,
  coreToolDefinitionFromJsonSchema,
  coreToolExecutionSuccessResult,
  coreToolValidationFailureMessage,
  executeCoreToolWithAdapters,
  extractCoreErrorMessage,
  filterCoreEnabledTools,
  filterCoreInjectableTools,
  isCoreToolInjectable,
  normalizeCoreToolParameterType,
  planCoreToolAutoExecute,
  resolveCoreToolExecutionMode,
} from '../index.js'

interface TestStaticTool {
  id: string
  description: string
}

interface TestAsyncTool {
  id: string
  initName: string
}

describe('core headless tool registry', () => {
  it('stores static and async tools plus registry lifecycle state without host dependencies', () => {
    const registry = new HeadlessToolRegistry<TestStaticTool, TestAsyncTool, { cwd: string }>()

    expect(registry.registerStatic({ id: 'read', description: 'Read files' })).toEqual({
      id: 'read',
      kind: 'static',
      alreadyRegistered: false,
    })
    expect(registry.registerAsync({ id: 'mcp_search', initName: 'MCP Search' })).toEqual({
      id: 'mcp_search',
      kind: 'async',
      alreadyRegistered: false,
    })
    expect(registry.registerStatic({ id: 'read', description: 'Read files again' })).toMatchObject({
      alreadyRegistered: true,
    })

    expect(registry.getStatic('read')?.description).toBe('Read files again')
    expect(registry.getAsync('mcp_search')?.initName).toBe('MCP Search')
    expect(registry.has('read')).toBe(true)
    expect(registry.listStatic().map(tool => tool.id)).toEqual(['read'])
    expect(registry.listAsync().map(tool => tool.id)).toEqual(['mcp_search'])
    expect(registry.listIds()).toEqual(['read', 'mcp_search'])

    registry.setInitContext({ cwd: '/repo' })
    expect(registry.getInitContext()).toEqual({ cwd: '/repo' })
    expect(registry.isInitialized()).toBe(false)
    registry.markInitialized()
    expect(registry.isInitialized()).toBe(true)

    expect(registry.unregister('read')).toBe(true)
    expect(registry.unregister('missing')).toBe(false)
    registry.reset()
    expect(registry.listIds()).toEqual([])
    expect(registry.isInitialized()).toBe(false)
    expect(registry.getInitContext()).toBeUndefined()
  })

  it('resolves tool execution mode from core-only scheduling rules', () => {
    expect(resolveCoreToolExecutionMode({ toolId: 'tool_function' })).toBe('sequential')
    expect(resolveCoreToolExecutionMode({ toolId: 'mcp:server:search' })).toBe('sequential')
    expect(resolveCoreToolExecutionMode({ toolId: 'mcp_server_search' })).toBe('sequential')
    expect(resolveCoreToolExecutionMode({ toolId: 'bash' })).toBe('sequential')
    expect(resolveCoreToolExecutionMode({ toolId: 'read' })).toBe('parallel')
    expect(resolveCoreToolExecutionMode({
      toolId: 'declared-static',
      staticTool: { executionMode: 'sequential' },
    })).toBe('sequential')
    expect(resolveCoreToolExecutionMode({
      toolId: 'declared-async',
      asyncTool: { executionMode: 'parallel', _initialized: { executionMode: 'sequential' } },
    })).toBe('sequential')
  })

  it('filters enabled and injectable tools using user settings and guard plans', () => {
    const tools = [
      { id: 'read', enabled: true, permissionGuard: 'safe' as const },
      { id: 'write', enabled: false, permissionGuard: 'permission-gated' as const },
      { id: 'external', enabled: true, permissionGuard: 'external' as const },
      { id: 'legacy', enabled: true },
    ]
    const warnings: string[] = []

    expect(filterCoreEnabledTools(tools).map(tool => tool.id)).toEqual(['read', 'external', 'legacy'])
    expect(filterCoreEnabledTools(tools, {
      write: { enabled: true, autoExecute: false },
      read: { enabled: false, autoExecute: false },
    }).map(tool => tool.id)).toEqual(['write', 'external', 'legacy'])
    expect(filterCoreInjectableTools(tools, {
      write: { enabled: true, autoExecute: false },
      read: { enabled: false, autoExecute: false },
    }, message => warnings.push(message)).map(tool => tool.id)).toEqual(['write'])
    expect(warnings).toEqual([
      '[ToolRegistry] Skipping tool without injectable permission guard: external',
      '[ToolRegistry] Skipping tool without injectable permission guard: legacy',
    ])
    expect(isCoreToolInjectable({ id: 'calc', permissionGuard: 'safe' })).toBe(true)
  })

  it('plans auto execution only when requested and locally guarded', () => {
    const safeTool = { id: 'calc', autoExecute: false, permissionGuard: 'safe' as const }
    const externalTool = { id: 'remote', autoExecute: true, permissionGuard: 'external' as const }
    const warnings: string[] = []

    expect(planCoreToolAutoExecute(undefined)).toEqual({ allowed: false, requested: false })
    expect(canCoreToolAutoExecute(safeTool)).toBe(false)
    expect(canCoreToolAutoExecute(safeTool, { enabled: true, autoExecute: true })).toBe(true)
    expect(canCoreToolAutoExecute(externalTool, undefined, message => warnings.push(message))).toBe(false)
    expect(warnings).toEqual([
      '[ToolRegistry] Refusing autoExecute for tool without safe permission guard: remote',
    ])
  })

  it('creates pending tool calls with caller-provided id and timestamp', () => {
    expect(createCoreToolCall({
      id: 'call-1',
      toolId: 'bash',
      toolName: 'Bash',
      args: { command: 'pwd' },
      timestamp: 123,
    })).toEqual({
      id: 'call-1',
      toolId: 'bash',
      toolName: 'Bash',
      arguments: { command: 'pwd' },
      status: 'pending',
      timestamp: 123,
    })
  })

  it('maps JSON schemas into host-facing tool definitions without main registry helpers', () => {
    const jsonSchema = {
      properties: {
        path: { type: 'string', description: 'File path' },
        mode: { type: 'mystery', description: 'Mode', enum: ['fast', 1, 'safe'] },
      },
      required: ['path'],
    }

    expect(normalizeCoreToolParameterType('mystery')).toBe('string')
    expect(coreToolDefinitionFromJsonSchema({
      id: 'read',
      name: 'read',
      description: 'Read files',
      jsonSchema,
      enabled: true,
      autoExecute: false,
      permissionGuard: 'safe',
      category: 'builtin',
    })).toMatchObject({
      id: 'read',
      name: 'read',
      parameterSchema: jsonSchema,
      parameters: [
        { name: 'path', type: 'string', description: 'File path', required: true },
        { name: 'mode', type: 'string', description: 'Mode', required: false, enum: ['fast', 'safe'] },
      ],
    })

    expect(coreProviderToolSchemaFromJsonSchema({
      description: 'Read files',
      jsonSchema,
    })).toEqual({
      description: 'Read files',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path' },
          mode: { type: 'string', description: 'Mode', enum: ['fast', 'safe'] },
        },
        required: ['path'],
      },
    })

    expect(coreProviderToolSchemaFromParameters({
      description: 'Legacy read files',
      parameters: [
        { name: 'path', type: 'string', description: 'File path', required: true },
        { name: 'limit', type: 'number', description: 'Max lines' },
        { name: 'mode', type: 'string', description: 'Mode', enum: ['fast', 'safe'] },
      ],
    })).toEqual({
      description: 'Legacy read files',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path' },
          limit: { type: 'number', description: 'Max lines' },
          mode: { type: 'string', description: 'Mode', enum: ['fast', 'safe'] },
        },
        required: ['path'],
      },
    })

    expect(extractCoreErrorMessage({ message: 'boom' }, 'fallback')).toBe('boom')
    expect(extractCoreErrorMessage({}, 'fallback')).toBe('fallback')
  })

  it('maps host tool execution context and success results in core', () => {
    const metadataUpdates: unknown[] = []
    const partialUpdates: unknown[] = []
    const runtimeContext = coreToolContextFromHost({
      sessionId: 'session-1',
      messageId: 'message-1',
      toolCallId: 'call-1',
      workingDirectory: '/repo',
      workingDirectoryRoots: ['/repo', '/tmp'],
      abortSignal: { aborted: false },
      approvedAnalysis: { effects: ['read'] },
      onMetadata: update => metadataUpdates.push(update),
      onPartialResult: update => partialUpdates.push(update),
    })

    runtimeContext.metadata({ title: 'Reading', metadata: { path: 'README.md' } })
    runtimeContext.updateResult?.({ content: [{ type: 'text', text: 'partial' }] })

    expect(runtimeContext).toMatchObject({
      sessionId: 'session-1',
      messageId: 'message-1',
      toolCallId: 'call-1',
      workingDirectory: '/repo',
      workingDirectoryRoots: ['/repo', '/tmp'],
      abortSignal: { aborted: false },
      approvedAnalysis: { effects: ['read'] },
    })
    expect(metadataUpdates).toEqual([
      { title: 'Reading', metadata: { path: 'README.md' } },
    ])
    expect(partialUpdates).toEqual([
      { content: [{ type: 'text', text: 'partial' }] },
    ])

    expect(coreToolAnalysisSuccessResult({
      effects: ['read'],
      preview: { title: 'Preview' },
    })).toEqual({
      success: true,
      effects: ['read'],
      preview: { title: 'Preview' },
    })
    expect(coreToolAnalysisSuccessResult()).toEqual({
      success: true,
      effects: [],
      preview: undefined,
    })
    expect(coreToolExecutionSuccessResult({
      title: 'Done',
      output: 'ok',
      metadata: { lines: 1 },
      attachments: [{ type: 'file', path: '/tmp/a.txt' }],
    })).toEqual({
      success: true,
      data: {
        title: 'Done',
        output: 'ok',
        metadata: { lines: 1 },
        attachments: [{ type: 'file', path: '/tmp/a.txt' }],
      },
    })
  })

  it('runs analyze and execute workflows through core adapters', async () => {
    const validationError = new Error('missing path')

    expect(coreToolValidationFailureMessage(validationError)).toBe('Invalid arguments: missing path')
    expect(coreToolValidationFailureMessage(validationError, error => `bad:${error.message}`)).toBe('bad:missing path')

    await expect(analyzeCoreToolWithAdapters({
      parseArgs: () => ({ success: false, error: validationError }),
      createContext: () => ({ sessionId: 's1' }),
    })).resolves.toEqual({
      success: false,
      error: 'Invalid arguments: missing path',
    })

    await expect(analyzeCoreToolWithAdapters({
      parseArgs: () => ({ success: true, data: { path: 'README.md' } }),
      createContext: () => ({ sessionId: 's1' }),
    })).resolves.toEqual({
      success: true,
      effects: [],
      preview: undefined,
    })

    await expect(analyzeCoreToolWithAdapters({
      parseArgs: () => ({ success: true, data: { path: 'README.md' } }),
      createContext: () => ({ sessionId: 's1' }),
      analyze: (args, context) => ({
        effects: [{ kind: 'read', path: args.path, sessionId: context.sessionId }],
        preview: { title: 'Read README.md' },
      }),
    })).resolves.toEqual({
      success: true,
      effects: [{ kind: 'read', path: 'README.md', sessionId: 's1' }],
      preview: { title: 'Read README.md' },
    })

    await expect(executeCoreToolWithAdapters({
      parseArgs: () => ({ success: true, data: { expression: '1+1' } }),
      createContext: () => ({ sessionId: 's1' }),
      execute: (args, context) => ({
        title: 'Calculated',
        output: `${context.sessionId}:${args.expression}=2`,
        metadata: { value: 2 },
      }),
      handleExecutionError: error => ({
        success: false,
        error: extractCoreErrorMessage(error, 'failed'),
      }),
    })).resolves.toEqual({
      success: true,
      data: {
        title: 'Calculated',
        output: 's1:1+1=2',
        metadata: { value: 2 },
        attachments: undefined,
      },
    })

    const calls: string[] = []
    await expect(executeCoreToolWithAdapters({
      parseArgs: () => ({ success: true, data: {} }),
      createContext: () => ({}),
      execute: () => {
        throw new Error('boom')
      },
      onExecutionError: error => calls.push(extractCoreErrorMessage(error, 'missing')),
      handleExecutionError: error => ({
        success: false,
        error: extractCoreErrorMessage(error, 'failed'),
      }),
    })).resolves.toEqual({
      success: false,
      error: 'boom',
    })
    expect(calls).toEqual(['boom'])
  })

  it('collects tool definitions and provider schemas through core adapters', async () => {
    const staticTools = [
      { id: 'read', description: 'Read files', permissionGuard: 'safe' as const },
    ]
    const asyncTools = [
      { id: 'mcp_search', description: 'Search MCP', permissionGuard: 'permission-gated' as const, initialized: false },
      { id: 'external', description: 'External tool', permissionGuard: 'external' as const, initialized: false },
    ]
    const initialized: string[] = []

    await expect(collectCoreToolDefinitionsWithAdapters({
      staticTools,
      asyncTools,
      initContext: { cwd: '/repo' },
      isAsyncInitialized: tool => tool.initialized,
      initializeAsyncTool(tool, context) {
        initialized.push(`${tool.id}:${context?.cwd}`)
        tool.initialized = true
      },
      staticToolToDefinition: tool => ({ id: tool.id, description: tool.description, kind: 'static' }),
      asyncToolToDefinition: tool => tool.initialized
        ? { id: tool.id, description: tool.description, kind: 'async' }
        : null,
    })).resolves.toEqual([
      { id: 'read', description: 'Read files', kind: 'static' },
      { id: 'mcp_search', description: 'Search MCP', kind: 'async' },
      { id: 'external', description: 'External tool', kind: 'async' },
    ])
    expect(initialized).toEqual(['mcp_search:/repo', 'external:/repo'])

    asyncTools.forEach(tool => {
      tool.initialized = false
    })
    initialized.length = 0
    const warnings: string[] = []

    await expect(collectCoreProviderToolSchemasWithAdapters({
      staticTools,
      asyncTools,
      settingsById: {
        read: { enabled: true, autoExecute: false },
        external: { enabled: true, autoExecute: false },
      },
      initContext: { cwd: '/repo' },
      isAsyncInitialized: tool => tool.initialized,
      initializeAsyncTool(tool, context) {
        initialized.push(`${tool.id}:${context?.cwd}`)
        tool.initialized = true
      },
      staticToolToSchema: tool => ({ description: tool.description }),
      asyncToolToSchema: tool => tool.initialized ? { description: tool.description } : null,
      onBlocked: message => warnings.push(message),
    })).resolves.toEqual({
      read: { description: 'Read files' },
      mcp_search: { description: 'Search MCP' },
    })
    expect(initialized).toEqual(['mcp_search:/repo'])
    expect(warnings).toEqual([
      '[ToolRegistry] Skipping tool without injectable permission guard: external',
    ])
  })
})
