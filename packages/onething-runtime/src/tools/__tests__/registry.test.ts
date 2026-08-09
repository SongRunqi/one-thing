import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { Permission } from '@onething/core/permission'
import { Tool } from '../tool.js'
import { createOnethingToolRegistry } from '../registry.js'

function createStaticTool(id: string, overrides: Partial<Tool.Info> = {}): Tool.Info {
  return Tool.define(id, {
    name: overrides.name || `Tool ${id}`,
    description: overrides.description || `Description for ${id}`,
    category: 'builtin',
    parameters: overrides.parameters || z.object({
      input: z.string().describe('Input value'),
    }),
    enabled: overrides.enabled ?? true,
    autoExecute: overrides.autoExecute ?? false,
    permissionGuard: overrides.permissionGuard ?? 'safe',
    executionMode: overrides.executionMode,
    renderKind: overrides.renderKind,
    renderShell: overrides.renderShell,
    analyze: overrides.analyze,
    formatValidationError: overrides.formatValidationError,
    async execute(args: { input?: string }) {
      return {
        title: `Executed ${id}`,
        output: args.input ?? '',
        metadata: {},
      }
    },
    ...overrides,
  })
}

describe('onething runtime tool registry', () => {
  it('registers static and async tools, exposes schemas, analyzes, and executes', async () => {
    const registry = createOnethingToolRegistry({
      createToolCallId: () => 'tool-call-id',
      logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
    })

    registry.registerTool(Tool.define('echo', {
      name: 'Echo',
      description: 'Echo input',
      category: 'builtin',
      parameters: z.object({ text: z.string() }),
      permissionGuard: 'safe',
      analyze(args) {
        return { effects: [{ kind: 'read', resources: [args.text], barrier: false }] }
      },
      async execute(args, ctx) {
        ctx.metadata({ title: 'Echoing', metadata: { text: args.text } })
        return {
          title: 'Echo',
          output: args.text,
          metadata: { text: args.text },
        }
      },
    }))

    registry.registerTool(Tool.define('dynamic', {
      name: 'Dynamic',
      category: 'builtin',
      permissionGuard: 'safe',
    }, async ctx => ({
      description: `Dynamic ${ctx?.workspace?.name ?? 'none'}`,
      parameters: z.object({ count: z.number() }),
      async execute(args: { count: number }) {
        return {
          title: 'Dynamic',
          output: String(args.count),
          metadata: {},
        }
      },
    })))

    registry.setInitContext({ workspace: { id: 'w1', name: 'Workspace' } })

    expect(registry.getAllTools()).toHaveLength(1)
    await expect(registry.getAllToolsAsync()).resolves.toHaveLength(2)
    await expect(registry.getToolsForAI()).resolves.toMatchObject({
      echo: { description: 'Echo input' },
      dynamic: { description: 'Dynamic Workspace' },
    })

    await expect(registry.analyzeTool('echo', { text: 'hello' }, {
      sessionId: 's1',
      messageId: 'm1',
    })).resolves.toMatchObject({
      success: true,
      effects: [{ kind: 'read', resources: ['hello'], barrier: false }],
    })

    const metadata = vi.fn()
    await expect(registry.executeTool('echo', { text: 'hello' }, {
      sessionId: 's1',
      messageId: 'm1',
      onMetadata: metadata,
    })).resolves.toMatchObject({
      success: true,
      data: {
        title: 'Echo',
        output: 'hello',
        metadata: { text: 'hello' },
      },
    })
    expect(metadata).toHaveBeenCalledWith({ title: 'Echoing', metadata: { text: 'hello' } })

    expect(registry.createToolCall('echo', 'Echo', { text: 'hello' })).toMatchObject({
      id: 'tool-call-id',
      toolId: 'echo',
      toolName: 'Echo',
      arguments: { text: 'hello' },
      status: 'pending',
    })
    expect(registry.canAutoExecute('echo', { echo: { enabled: true, autoExecute: true } })).toBe(true)
  })

  it('owns tool definition projection including nested JSON schema', () => {
    const registry = createOnethingToolRegistry({
      logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
    })

    registry.registerTool(createStaticTool('nested-tool', {
      parameters: z.object({
        edits: z.array(z.object({
          oldText: z.string().describe('Exact text to replace'),
          newText: z.string().describe('Replacement text'),
        })).describe('One or more replacements'),
      }),
    }))

    const nested = registry.getAllTools().find(tool => tool.id === 'nested-tool')
    const parameterSchema = nested?.parameterSchema as {
      properties?: Record<string, unknown>
    } | undefined

    expect(nested).toMatchObject({
      id: 'nested-tool',
      name: 'Tool nested-tool',
      description: 'Description for nested-tool',
      enabled: true,
      autoExecute: false,
      category: 'builtin',
    })
    expect(parameterSchema?.properties?.edits).toMatchObject({
      type: 'array',
      items: {
        type: 'object',
        properties: {
          oldText: { type: 'string', description: 'Exact text to replace' },
          newText: { type: 'string', description: 'Replacement text' },
        },
        required: ['oldText', 'newText'],
      },
    })
  })

  it('owns execution mode compatibility and async initialized overrides', async () => {
    const registry = createOnethingToolRegistry({
      logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
    })

    registry.registerTool(createStaticTool('parallel-tool', { executionMode: 'parallel' }))
    registry.registerTool(createStaticTool('sequential-tool', { executionMode: 'sequential' }))
    registry.registerTool(Tool.define(
      'dynamic-tool',
      { name: 'Dynamic', category: 'builtin', permissionGuard: 'safe', executionMode: 'parallel' },
      async () => ({
        description: 'Dynamic initialized',
        parameters: z.object({}),
        executionMode: 'sequential',
        async execute() {
          return { title: 'Dynamic', output: 'done', metadata: {} }
        },
      }),
    ))

    expect(registry.getToolExecutionMode('parallel-tool')).toBe('parallel')
    expect(registry.getToolExecutionMode('sequential-tool')).toBe('sequential')
    expect(registry.getToolExecutionMode('bash')).toBe('sequential')
    expect(registry.getToolExecutionMode('read')).toBe('parallel')
    expect(registry.getToolExecutionMode('mcp:server:tool')).toBe('sequential')

    await registry.getAllToolsAsync()
    expect(registry.getToolExecutionMode('dynamic-tool')).toBe('sequential')
  })

  /**
   * N3:声明必须活到**注入模型的那份定义**上 —— 那是 agent-loop runner
   * 真正读的一跳(`AgentTool.executionMode !== 'parallel'` → 屏障)。
   * `getToolExecutionMode()` 是另一条(今天没有生产消费方的)线,它绿了
   * 不代表调度器看得见。缺省不声明的工具必须保持 undefined:那是"屏障"。
   */
  it('carries executionMode onto the injected tool definitions (N3 scheduling hop)', async () => {
    const registry = createOnethingToolRegistry({
      logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
    })

    registry.registerTool(createStaticTool('plugin:sample:peek', { executionMode: 'parallel' }))
    registry.registerTool(createStaticTool('plugin:sample:cursor', { executionMode: 'sequential' }))
    registry.registerTool(createStaticTool('plugin:sample:plain'))

    const byId = new Map(
      (await registry.getAllToolsAsync()).map(definition => [definition.id, definition]),
    )

    expect(byId.get('plugin:sample:peek')?.executionMode).toBe('parallel')
    expect(byId.get('plugin:sample:cursor')?.executionMode).toBe('sequential')
    expect(byId.get('plugin:sample:plain')?.executionMode).toBeUndefined()
  })

  it('owns permission rejection and ordinary execution error projection', async () => {
    const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() }
    const registry = createOnethingToolRegistry({ logger })

    registry.registerTool(createStaticTool('reject-tool', {
      async execute() {
        throw new Permission.RejectedError('session-1', 'permission-1', 'call-1', undefined, 'No thanks')
      },
    }))
    registry.registerTool(createStaticTool('error-tool', {
      async execute() {
        throw new Error('Boom')
      },
    }))

    await expect(registry.executeTool('reject-tool', { input: 'test' }, {
      sessionId: 'session-1',
      messageId: 'message-1',
    })).resolves.toMatchObject({
      success: false,
      rejected: true,
      rejectionReason: 'No thanks',
      error: expect.stringContaining('No thanks'),
    })

    await expect(registry.executeTool('error-tool', { input: 'test' }, {
      sessionId: 'session-1',
      messageId: 'message-1',
    })).resolves.toMatchObject({
      success: false,
      error: 'Boom',
    })
    expect(logger.error).toHaveBeenCalledWith(
      '[ToolRegistry] Tool "error-tool" execution error:',
      expect.any(Error),
    )
  })

  it('owns injectable tool filtering and auto-execute permission gates', async () => {
    const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() }
    const registry = createOnethingToolRegistry({ logger })

    registry.registerTool(createStaticTool('safe-auto-tool', {
      autoExecute: true,
      permissionGuard: 'safe',
    }))
    registry.registerTool(createStaticTool('ungarded-tool', {
      autoExecute: true,
      permissionGuard: undefined,
    }))
    registry.registerTool(createStaticTool('permission-gated-tool', {
      autoExecute: false,
      permissionGuard: 'permission-gated',
    }))
    registry.registerTool(Tool.define(
      'async-auto-tool',
      { name: 'Async', category: 'builtin', autoExecute: true, permissionGuard: 'safe' },
      async () => ({
        description: 'Async',
        parameters: z.object({}),
        async execute() {
          return { title: 'Async', output: '', metadata: {} }
        },
      }),
    ))

    expect(registry.canAutoExecute('safe-auto-tool')).toBe(true)
    expect(registry.canAutoExecute('ungarded-tool')).toBe(false)
    expect(registry.canAutoExecute('permission-gated-tool', {
      'permission-gated-tool': { enabled: true, autoExecute: true },
    })).toBe(true)
    expect(registry.canAutoExecute('async-auto-tool')).toBe(true)
    expect(registry.canAutoExecute('missing-tool')).toBe(false)

    const injectable = await registry.getEnabledToolsAsync()
    expect(injectable.some(tool => tool.id === 'safe-auto-tool')).toBe(true)
    expect(injectable.some(tool => tool.id === 'ungarded-tool')).toBe(false)
    expect(logger.warn).toHaveBeenCalledWith(
      '[ToolRegistry] Refusing autoExecute for tool without safe permission guard: ungarded-tool',
    )
    expect(logger.warn).toHaveBeenCalledWith(
      '[ToolRegistry] Skipping tool without injectable permission guard: ungarded-tool',
    )
  })
  it('validates rewritten args against the tool\'s own zod without analyzing or executing (N4)', async () => {
    const registry = createOnethingToolRegistry({
      createToolCallId: () => 'tool-call-id',
      logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
    })
    const analyze = vi.fn()
    const execute = vi.fn()
    registry.registerTool(Tool.define('validated', {
      name: 'Validated',
      description: 'schema-only probe',
      category: 'builtin',
      parameters: z.object({ command: z.string() }),
      permissionGuard: 'safe',
      analyze,
      execute,
    }))

    await expect(registry.validateToolArgs('validated', { command: 'ls' }))
      .resolves.toEqual({ ok: true })

    const rejected = await registry.validateToolArgs('validated', { nope: 1 })
    expect(rejected.ok).toBe(false)
    if (rejected.ok) throw new Error('unreachable')
    expect(rejected.message).toContain('Invalid arguments')

    // 只校验:analyze 可能读文件 / 算 diff,拿它当校验器等于把工具跑了半个。
    expect(analyze).not.toHaveBeenCalled()
    expect(execute).not.toHaveBeenCalled()

    // 认不出的工具名不在这里判死(MCP / 外部 agent 的校验在别人家)。
    await expect(registry.validateToolArgs('mcp__server__search', { q: 'x' }))
      .resolves.toEqual({ ok: true })
  })
})
