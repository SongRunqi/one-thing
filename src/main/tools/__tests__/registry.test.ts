import { describe, it, expect, vi, beforeEach } from 'vitest'
import { z } from 'zod'

// Mock uuid
vi.mock('uuid', () => ({
  v4: vi.fn(() => 'mock-uuid-1234'),
}))

// Mock the builtin tools import (used by initializeToolRegistry)
vi.mock('../builtin/index.js', () => ({
  registerBuiltinTools: vi.fn(),
  registerBuiltinToolsV2: vi.fn(),
}))

import {
  registerTool,
  registerToolV2,
  unregisterTool,
  getTool,
  getToolV2,
  getToolV2Async,
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
import type { ToolDefinition, ToolHandler, ToolExecutionContext } from '../types'

// Helper to create a minimal legacy tool definition
function createLegacyToolDef(overrides: Partial<ToolDefinition> = {}): ToolDefinition {
  return {
    id: 'test-tool',
    name: 'Test Tool',
    description: 'A test tool',
    parameters: [],
    enabled: true,
    autoExecute: false,
    category: 'builtin',
    ...overrides,
  }
}

// Helper to create a minimal legacy tool handler
function createHandler(result?: any): ToolHandler {
  return vi.fn(async () => result ?? { success: true, data: { output: 'ok' } })
}

// Helper to create a V2 static tool
function createV2Tool(id: string, overrides: Partial<any> = {}) {
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
    // We need to clean the registry between tests.
    // Unregister all tools we might have created
    for (const id of ['test-tool', 'tool-a', 'tool-b', 'tool-c', 'v2-tool', 'v2-async-tool', 'disabled-tool', 'auto-tool', 'non-existent']) {
      unregisterTool(id)
    }
    vi.clearAllMocks()
  })

  // ─── registerTool / getTool / hasTool ─────────────────────────────

  describe('Legacy tool registration', () => {
    it('should register and retrieve a legacy tool', () => {
      const def = createLegacyToolDef()
      const handler = createHandler()

      registerTool(def, handler)

      expect(hasTool('test-tool')).toBe(true)
      const tool = getTool('test-tool')
      expect(tool).toBeDefined()
      expect(tool!.definition).toEqual(def)
    })

    it('should overwrite existing tool with same id', () => {
      const def1 = createLegacyToolDef({ description: 'First' })
      const def2 = createLegacyToolDef({ description: 'Second' })

      registerTool(def1, createHandler())
      registerTool(def2, createHandler())

      const tool = getTool('test-tool')
      expect(tool!.definition.description).toBe('Second')
    })
  })

  // ─── registerToolV2 ──────────────────────────────────────────────

  describe('V2 tool registration', () => {
    it('should register and retrieve a V2 static tool', () => {
      const v2Tool = createV2Tool('v2-tool')

      registerToolV2(v2Tool)

      expect(hasTool('v2-tool')).toBe(true)
      expect(getToolV2('v2-tool')).toBeDefined()
      expect(getToolV2('v2-tool')!.id).toBe('v2-tool')
    })

    it('should register a V2 async tool', () => {
      const asyncTool = Tool.define(
        'v2-async-tool',
        { name: 'Async Tool', category: 'builtin' },
        async () => ({
          description: 'Dynamic description',
          parameters: z.object({ query: z.string() }),
          async execute(args: any, ctx: any) {
            return { title: 'Done', output: args.query, metadata: {} }
          },
        })
      )

      registerToolV2(asyncTool)

      expect(hasTool('v2-async-tool')).toBe(true)
      expect(getToolV2Async('v2-async-tool')).toBeDefined()
      // Should NOT be in static registry
      expect(getToolV2('v2-async-tool')).toBeUndefined()
    })
  })

  // ─── unregisterTool ──────────────────────────────────────────────

  describe('unregisterTool()', () => {
    it('should unregister a legacy tool', () => {
      registerTool(createLegacyToolDef(), createHandler())
      expect(hasTool('test-tool')).toBe(true)

      const removed = unregisterTool('test-tool')
      expect(removed).toBe(true)
      expect(hasTool('test-tool')).toBe(false)
    })

    it('should unregister a V2 tool', () => {
      registerToolV2(createV2Tool('v2-tool'))

      const removed = unregisterTool('v2-tool')
      expect(removed).toBe(true)
      expect(hasTool('v2-tool')).toBe(false)
    })

    it('should return false for non-existent tool', () => {
      const removed = unregisterTool('non-existent')
      expect(removed).toBe(false)
    })
  })

  // ─── getAllTools ──────────────────────────────────────────────────

  describe('getAllTools()', () => {
    it('should return all legacy and V2 static tools', () => {
      registerTool(createLegacyToolDef({ id: 'tool-a' }), createHandler())
      registerToolV2(createV2Tool('tool-b'))

      const all = getAllTools()
      const ids = all.map(t => t.id)
      expect(ids).toContain('tool-a')
      expect(ids).toContain('tool-b')
    })

    it('should not include async tools', () => {
      const asyncTool = Tool.define(
        'v2-async-tool',
        { name: 'Async', category: 'builtin' },
        async () => ({
          description: 'desc',
          parameters: z.object({}),
          async execute() {
            return { title: '', output: '', metadata: {} }
          },
        })
      )
      registerToolV2(asyncTool)

      const all = getAllTools()
      const ids = all.map(t => t.id)
      expect(ids).not.toContain('v2-async-tool')
    })
  })

  // ─── getEnabledTools ─────────────────────────────────────────────

  describe('getEnabledTools()', () => {
    it('should only return enabled tools', () => {
      registerTool(createLegacyToolDef({ id: 'tool-a', enabled: true }), createHandler())
      registerTool(createLegacyToolDef({ id: 'disabled-tool', enabled: false }), createHandler())

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

    it('should execute a legacy tool successfully', async () => {
      const handler = createHandler({ success: true, data: { output: 'hello' } })
      registerTool(createLegacyToolDef(), handler)

      const result = await executeTool('test-tool', { input: 'test' }, mockContext)

      expect(result.success).toBe(true)
      expect(result.data).toEqual({ output: 'hello' })
      expect(handler).toHaveBeenCalledWith({ input: 'test' }, mockContext)
    })

    it('should handle legacy tool execution error', async () => {
      const handler = vi.fn(async () => {
        throw new Error('Tool crashed')
      })
      registerTool(createLegacyToolDef(), handler)

      const result = await executeTool('test-tool', {}, mockContext)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Tool crashed')
    })

    it('should execute a V2 static tool successfully', async () => {
      registerToolV2(createV2Tool('v2-tool'))

      const result = await executeTool('v2-tool', { input: 'test-value' }, mockContext)

      expect(result.success).toBe(true)
      expect(result.data).toMatchObject({
        title: 'Executed v2-tool',
        output: 'test-value',
      })
    })

    it('should return validation error for invalid V2 tool args', async () => {
      registerToolV2(createV2Tool('v2-tool'))

      const result = await executeTool('v2-tool', { wrong_param: 'test' }, mockContext)

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
    it('should return tool default for legacy tool without settings', () => {
      registerTool(createLegacyToolDef({ id: 'auto-tool', autoExecute: true }), createHandler())

      expect(canAutoExecute('auto-tool')).toBe(true)
    })

    it('should return false for legacy tool with autoExecute=false', () => {
      registerTool(createLegacyToolDef({ autoExecute: false }), createHandler())

      expect(canAutoExecute('test-tool')).toBe(false)
    })

    it('should respect user settings over tool defaults', () => {
      registerTool(createLegacyToolDef({ autoExecute: false }), createHandler())

      const settings = { 'test-tool': { enabled: true, autoExecute: true } }
      expect(canAutoExecute('test-tool', settings)).toBe(true)
    })

    it('should return false for V2 tool without autoExecute', () => {
      registerToolV2(createV2Tool('v2-tool'))

      expect(canAutoExecute('v2-tool')).toBe(false)
    })

    it('should return false for non-existent tool', () => {
      expect(canAutoExecute('non-existent')).toBe(false)
    })

    it('should check V2 async tools', () => {
      const asyncTool = Tool.define(
        'v2-async-tool',
        { name: 'Async', category: 'builtin', autoExecute: true },
        async () => ({
          description: 'desc',
          parameters: z.object({}),
          async execute() {
            return { title: '', output: '', metadata: {} }
          },
        })
      )
      registerToolV2(asyncTool)

      expect(canAutoExecute('v2-async-tool')).toBe(true)
    })
  })

  // ─── V2 tool conversion to legacy format ─────────────────────────

  describe('V2 to legacy ToolDefinition conversion', () => {
    it('should convert V2 tool parameters to legacy format in getAllTools', () => {
      registerToolV2(createV2Tool('v2-tool'))

      const all = getAllTools()
      const tool = all.find(t => t.id === 'v2-tool')!

      expect(tool).toBeDefined()
      expect(tool.name).toBe('Tool v2-tool')
      expect(tool.description).toBe('Description for v2-tool')
      expect(tool.enabled).toBe(true)
      expect(tool.autoExecute).toBe(false)
      expect(tool.parameters.length).toBeGreaterThan(0)
      expect(tool.parameters[0].name).toBe('input')
      expect(tool.parameters[0].type).toBe('string')
    })
  })
})
