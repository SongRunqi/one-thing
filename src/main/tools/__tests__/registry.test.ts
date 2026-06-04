import { describe, it, expect, vi, beforeEach } from 'vitest'
import { z } from 'zod'

// Mock uuid
vi.mock('uuid', () => ({
  v4: vi.fn(() => 'mock-uuid-1234'),
}))

// Mock the builtin tools import (used by initializeToolRegistry)
vi.mock('../builtin/index.js', () => ({
  registerBuiltinTools: vi.fn(),
}))

import {
  registerTool,
  unregisterTool,
  getTool,
  getToolAsync,
  hasTool,
  getAllTools,
  getEnabledTools,
  getEnabledToolsAsync,
  executeTool,
  createToolCall,
  canAutoExecute,
  getToolExecutionMode,
} from '../registry'

import { Tool } from '../core/tool'
import type { ToolExecutionContext } from '../types'
import { Permission } from '../../permission/index'

// Helper to create a static tool
function createStaticTool(id: string, overrides: Partial<any> = {}) {
  return Tool.define(id, {
    name: overrides.name || `Tool ${id}`,
    description: overrides.description || `Description for ${id}`,
    category: 'builtin',
    parameters: z.object({
      input: z.string().describe('Input value'),
    }),
    enabled: overrides.enabled ?? true,
    autoExecute: overrides.autoExecute ?? false,
    permissionGuard: overrides.permissionGuard ?? 'safe',
    async execute(args, _ctx) {
      return {
        title: `Executed ${id}`,
        output: args.input,
        metadata: {},
      }
    },
    ...overrides,
  })
}

describe('Tool Registry', () => {
  beforeEach(() => {
    for (const id of ['test-tool', 'tool-a', 'tool-b', 'tool-c', 'async-tool', 'disabled-tool', 'auto-tool', 'reject-tool', 'error-tool', 'nested-tool', 'non-existent']) {
      unregisterTool(id)
    }
    vi.clearAllMocks()
  })

  // ─── registerTool / getTool / hasTool ─────────────────────────────

  describe('Static tool registration', () => {
    it('should register and retrieve a static tool', () => {
      const tool = createStaticTool('test-tool')

      registerTool(tool)

      expect(hasTool('test-tool')).toBe(true)
      expect(getTool('test-tool')).toBeDefined()
      expect(getTool('test-tool')!.id).toBe('test-tool')
    })

    it('should register an async tool', () => {
      const asyncTool = Tool.define(
        'async-tool',
        { name: 'Async Tool', category: 'builtin' },
        async () => ({
          description: 'Dynamic description',
          parameters: z.object({ query: z.string() }),
          async execute(args: any, _ctx: any) {
            return { title: 'Done', output: args.query, metadata: {} }
          },
        })
      )

      registerTool(asyncTool)

      expect(hasTool('async-tool')).toBe(true)
      expect(getToolAsync('async-tool')).toBeDefined()
      // Should NOT be in static registry
      expect(getTool('async-tool')).toBeUndefined()
    })
  })

  describe('getToolExecutionMode()', () => {
    it('uses tool-declared executionMode with compatibility fallback', () => {
      registerTool(createStaticTool('parallel-tool', { executionMode: 'parallel' }))
      registerTool(createStaticTool('sequential-tool', { executionMode: 'sequential' }))

      expect(getToolExecutionMode('parallel-tool')).toBe('parallel')
      expect(getToolExecutionMode('sequential-tool')).toBe('sequential')
      expect(getToolExecutionMode('bash')).toBe('sequential')
      expect(getToolExecutionMode('read')).toBe('parallel')
      expect(getToolExecutionMode('mcp:server:tool')).toBe('sequential')

      unregisterTool('parallel-tool')
      unregisterTool('sequential-tool')
    })
  })

  // ─── unregisterTool ──────────────────────────────────────────────

  describe('unregisterTool()', () => {
    it('should unregister a tool', () => {
      registerTool(createStaticTool('test-tool'))
      expect(hasTool('test-tool')).toBe(true)

      const removed = unregisterTool('test-tool')
      expect(removed).toBe(true)
      expect(hasTool('test-tool')).toBe(false)
    })

    it('should return false for non-existent tool', () => {
      const removed = unregisterTool('non-existent')
      expect(removed).toBe(false)
    })
  })

  // ─── getAllTools ──────────────────────────────────────────────────

  describe('getAllTools()', () => {
    it('should return all static tools', () => {
      registerTool(createStaticTool('tool-a'))
      registerTool(createStaticTool('tool-b'))

      const all = getAllTools()
      const ids = all.map(t => t.id)
      expect(ids).toContain('tool-a')
      expect(ids).toContain('tool-b')
    })

    it('preserves nested parameter JSON schema for model-facing tools', () => {
      registerTool(createStaticTool('nested-tool', {
        parameters: z.object({
          edits: z.array(z.object({
            oldText: z.string().describe('Exact text to replace'),
            newText: z.string().describe('Replacement text'),
          })).describe('One or more replacements'),
        }),
      }))

      const nested = getAllTools().find(t => t.id === 'nested-tool')

      expect(nested?.parameterSchema?.properties?.edits).toMatchObject({
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

    it('should not include async tools', () => {
      const asyncTool = Tool.define(
        'async-tool',
        { name: 'Async', category: 'builtin' },
        async () => ({
          description: 'desc',
          parameters: z.object({}),
          async execute() {
            return { title: '', output: '', metadata: {} }
          },
        })
      )
      registerTool(asyncTool)

      const all = getAllTools()
      const ids = all.map(t => t.id)
      expect(ids).not.toContain('async-tool')
    })
  })

  // ─── getEnabledTools ─────────────────────────────────────────────

  describe('getEnabledTools()', () => {
    it('should only return enabled tools', () => {
      registerTool(createStaticTool('tool-a', { enabled: true }))
      registerTool(createStaticTool('disabled-tool', { enabled: false }))

      const enabled = getEnabledTools()
      const ids = enabled.map(t => t.id)
      expect(ids).toContain('tool-a')
      expect(ids).not.toContain('disabled-tool')
    })
  })

  // ─── executeTool ─────────────────────────────────────────────────

  describe('executeTool()', () => {
    const mockContext: ToolExecutionContext = {
      sessionId: 'session-1',
      messageId: 'msg-1',
      toolCallId: 'call-1',
    }

    it('should execute a static tool successfully', async () => {
      registerTool(createStaticTool('test-tool'))

      const result = await executeTool('test-tool', { input: 'test-value' }, mockContext)

      expect(result.success).toBe(true)
      expect(result.data).toMatchObject({
        title: 'Executed test-tool',
        output: 'test-value',
      })
    })

    it('should return validation error for invalid args', async () => {
      registerTool(createStaticTool('test-tool'))

      const result = await executeTool('test-tool', { wrong_param: 'test' }, mockContext)

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })

    it('should return error for non-existent tool', async () => {
      const result = await executeTool('non-existent', {}, mockContext)

      expect(result.success).toBe(false)
      expect(result.error).toContain('not found')
    })

    it('should mark permission rejection separately from execution errors', async () => {
      registerTool(createStaticTool('reject-tool', {
        async execute() {
          throw new Permission.RejectedError('session-1', 'perm-1', 'call-1', undefined, 'No thanks')
        },
      }))

      const result = await executeTool('reject-tool', { input: 'test' }, mockContext)

      expect(result.success).toBe(false)
      expect(result.rejected).toBe(true)
      expect(result.rejectionReason).toBe('No thanks')
      expect(result.error).toContain('No thanks')
    })

    it('should keep ordinary execution errors as non-rejected failures', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      registerTool(createStaticTool('error-tool', {
        async execute() {
          throw new Error('Boom')
        },
      }))

      const result = await executeTool('error-tool', { input: 'test' }, mockContext)

      expect(result.success).toBe(false)
      expect(result.rejected).toBeUndefined()
      expect(result.error).toBe('Boom')
      errorSpy.mockRestore()
    })
  })

  // ─── createToolCall ──────────────────────────────────────────────

  describe('createToolCall()', () => {
    it('should create a tool call with correct fields', () => {
      const toolCall = createToolCall('bash', 'Bash', { command: 'ls' })

      expect(toolCall.id).toBe('mock-uuid-1234')
      expect(toolCall.toolId).toBe('bash')
      expect(toolCall.toolName).toBe('Bash')
      expect(toolCall.arguments).toEqual({ command: 'ls' })
      expect(toolCall.status).toBe('pending')
      expect(toolCall.timestamp).toBeTypeOf('number')
    })
  })

  // ─── canAutoExecute ──────────────────────────────────────────────

  describe('canAutoExecute()', () => {
    it('should return tool default without settings', () => {
      registerTool(createStaticTool('auto-tool', { autoExecute: true }))
      expect(canAutoExecute('auto-tool')).toBe(true)
    })

    it('should return false for tool with autoExecute=false', () => {
      registerTool(createStaticTool('test-tool', { autoExecute: false }))
      expect(canAutoExecute('test-tool')).toBe(false)
    })

    it('should respect user settings over tool defaults', () => {
      registerTool(createStaticTool('test-tool', { autoExecute: false }))

      const settings = { 'test-tool': { enabled: true, autoExecute: true } }
      expect(canAutoExecute('test-tool', settings)).toBe(true)
    })

    it('should refuse autoExecute when the tool has no dangerous permission guard', () => {
      registerTool(createStaticTool('test-tool', { autoExecute: true, permissionGuard: undefined }))
      expect(canAutoExecute('test-tool')).toBe(false)
    })

    it('should allow autoExecute for permission-gated tools when settings request it', () => {
      registerTool(createStaticTool('test-tool', { autoExecute: false, permissionGuard: 'permission-gated' }))

      const settings = { 'test-tool': { enabled: true, autoExecute: true } }
      expect(canAutoExecute('test-tool', settings)).toBe(true)
    })

    it('should check async tools', () => {
      const asyncTool = Tool.define(
        'async-tool',
        { name: 'Async', category: 'builtin', autoExecute: true, permissionGuard: 'safe' },
        async () => ({
          description: 'desc',
          parameters: z.object({}),
          async execute() {
            return { title: '', output: '', metadata: {} }
          },
        })
      )
      registerTool(asyncTool)

      expect(canAutoExecute('async-tool')).toBe(true)
    })

    it('should return false for non-existent tool', () => {
      expect(canAutoExecute('non-existent')).toBe(false)
    })
  })

  describe('permission guard injection gate', () => {
    it('should not inject enabled tools without a permission guard', async () => {
      registerTool(createStaticTool('test-tool', { permissionGuard: undefined }))

      const tools = await getEnabledToolsAsync()
      expect(tools.some(t => t.id === 'test-tool')).toBe(false)
    })
  })

  // ─── ToolDefinition conversion ───────────────────────────────────

  describe('ToolDefinition conversion', () => {
    it('should convert tool parameters to ToolDefinition format in getAllTools', () => {
      registerTool(createStaticTool('test-tool'))

      const all = getAllTools()
      const tool = all.find(t => t.id === 'test-tool')!

      expect(tool).toBeDefined()
      expect(tool.name).toBe('Tool test-tool')
      expect(tool.description).toBe('Description for test-tool')
      expect(tool.enabled).toBe(true)
      expect(tool.autoExecute).toBe(false)
      expect(tool.parameters.length).toBeGreaterThan(0)
      expect(tool.parameters[0].name).toBe('input')
      expect(tool.parameters[0].type).toBe('string')
    })
  })
})
