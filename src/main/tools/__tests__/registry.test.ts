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
  getAsyncTool,
  hasTool,
  getAllTools,
  getEnabledTools,
  executeTool,
  createToolCall,
  canAutoExecute,
  initializeToolRegistry,
  isInitialized,
} from '../registry'

import { Tool } from '../core/tool'
import type { ToolExecutionContext } from '../types'

// Helper to create a static tool
function createTestTool(id: string, overrides: Partial<any> = {}) {
  return Tool.define(id, {
    name: overrides.name || `Tool ${id}`,
    description: overrides.description || `Description for ${id}`,
    category: 'builtin',
    parameters: z.object({
      input: z.string().describe('Input value'),
    }),
    enabled: overrides.enabled ?? true,
    autoExecute: overrides.autoExecute ?? false,
    async execute(args, ctx) {
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
    // Clean the registry between tests
    for (const id of ['test-tool', 'tool-a', 'tool-b', 'tool-c', 'my-tool', 'async-tool', 'disabled-tool', 'auto-tool', 'non-existent']) {
      unregisterTool(id)
    }
    vi.clearAllMocks()
  })

  // ─── registerTool ────────────────────────────────────────────────

  describe('Tool registration', () => {
    it('should register and retrieve a static tool', () => {
      const tool = createTestTool('my-tool')

      registerTool(tool)

      expect(hasTool('my-tool')).toBe(true)
      expect(getTool('my-tool')).toBeDefined()
      expect(getTool('my-tool')!.id).toBe('my-tool')
    })

    it('should register an async tool', () => {
      const asyncTool = Tool.define(
        'async-tool',
        { name: 'Async Tool', category: 'builtin' },
        async () => ({
          description: 'Dynamic description',
          parameters: z.object({ query: z.string() }),
          async execute(args: any, ctx: any) {
            return { title: 'Done', output: args.query, metadata: {} }
          },
        })
      )

      registerTool(asyncTool)

      expect(hasTool('async-tool')).toBe(true)
      expect(getAsyncTool('async-tool')).toBeDefined()
      // Should NOT be in static registry
      expect(getTool('async-tool')).toBeUndefined()
    })
  })

  // ─── unregisterTool ──────────────────────────────────────────────

  describe('unregisterTool()', () => {
    it('should unregister a tool', () => {
      registerTool(createTestTool('my-tool'))

      const removed = unregisterTool('my-tool')
      expect(removed).toBe(true)
      expect(hasTool('my-tool')).toBe(false)
    })

    it('should return false for non-existent tool', () => {
      const removed = unregisterTool('non-existent')
      expect(removed).toBe(false)
    })
  })

  // ─── getAllTools ──────────────────────────────────────────────────

  describe('getAllTools()', () => {
    it('should return all static tools', () => {
      registerTool(createTestTool('tool-a'))
      registerTool(createTestTool('tool-b'))

      const all = getAllTools()
      const ids = all.map(t => t.id)
      expect(ids).toContain('tool-a')
      expect(ids).toContain('tool-b')
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
      registerTool(createTestTool('tool-a', { enabled: true }))
      registerTool(createTestTool('disabled-tool', { enabled: false }))

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
      registerTool(createTestTool('my-tool'))

      const result = await executeTool('my-tool', { input: 'test-value' }, mockContext)

      expect(result.success).toBe(true)
      expect(result.data).toMatchObject({
        title: 'Executed my-tool',
        output: 'test-value',
      })
    })

    it('should return validation error for invalid tool args', async () => {
      registerTool(createTestTool('my-tool'))

      const result = await executeTool('my-tool', { wrong_param: 'test' }, mockContext)

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })

    it('should return error for non-existent tool', async () => {
      const result = await executeTool('non-existent', {}, mockContext)

      expect(result.success).toBe(false)
      expect(result.error).toContain('not found')
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
    it('should return false for tool without autoExecute', () => {
      registerTool(createTestTool('my-tool'))

      expect(canAutoExecute('my-tool')).toBe(false)
    })

    it('should respect user settings over tool defaults', () => {
      registerTool(createTestTool('my-tool', { autoExecute: false }))

      const settings = { 'my-tool': { enabled: true, autoExecute: true } }
      expect(canAutoExecute('my-tool', settings)).toBe(true)
    })

    it('should return false for non-existent tool', () => {
      expect(canAutoExecute('non-existent')).toBe(false)
    })

    it('should check async tools', () => {
      const asyncTool = Tool.define(
        'async-tool',
        { name: 'Async', category: 'builtin', autoExecute: true },
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
  })

  // ─── ToolInfo to ToolDefinition conversion ────────────────────

  describe('ToolInfo to ToolDefinition conversion', () => {
    it('should convert tool parameters to ToolDefinition format in getAllTools', () => {
      registerTool(createTestTool('my-tool'))

      const all = getAllTools()
      const tool = all.find(t => t.id === 'my-tool')!

      expect(tool).toBeDefined()
      expect(tool.name).toBe('Tool my-tool')
      expect(tool.description).toBe('Description for my-tool')
      expect(tool.enabled).toBe(true)
      expect(tool.autoExecute).toBe(false)
      expect(tool.parameters.length).toBeGreaterThan(0)
      expect(tool.parameters[0].name).toBe('input')
      expect(tool.parameters[0].type).toBe('string')
    })
  })
})
