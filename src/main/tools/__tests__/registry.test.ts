import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

const mockedBuiltins = {
  registerBuiltinTools: vi.fn(),
}

vi.mock('../builtin/index.js', () => mockedBuiltins)

import { Tool } from '../core/tool.js'
import {
  createToolCall,
  getTool,
  hasTool,
  initializeToolRegistry,
  registerTool,
  unregisterTool,
} from '../registry.js'

describe('tool registry main facade', () => {
  beforeEach(() => {
    unregisterTool('facade-tool')
    vi.clearAllMocks()
  })

  it('delegates registration and lookup to the onething runtime registry', () => {
    registerTool(Tool.define('facade-tool', {
      name: 'Facade Tool',
      description: 'Tool registered through the main facade',
      category: 'builtin',
      parameters: z.object({ input: z.string() }),
      permissionGuard: 'safe',
      async execute(args) {
        return {
          title: 'Facade Tool',
          output: args.input,
          metadata: {},
        }
      },
    }))

    expect(hasTool('facade-tool')).toBe(true)
    expect(getTool('facade-tool')).toMatchObject({
      id: 'facade-tool',
      name: 'Facade Tool',
    })
  })

  it('keeps host-owned tool call id generation at the facade boundary', () => {
    const toolCall = createToolCall('facade-tool', 'Facade Tool', { input: 'hello' })

    expect(toolCall).toMatchObject({
      toolId: 'facade-tool',
      toolName: 'Facade Tool',
      arguments: { input: 'hello' },
      status: 'pending',
    })
    expect(toolCall.id).toBeTypeOf('string')
    expect(toolCall.timestamp).toBeTypeOf('number')
  })

  it('initializes desktop builtins through the host registration callback', async () => {
    await initializeToolRegistry()

    expect(mockedBuiltins.registerBuiltinTools).toHaveBeenCalled()
  })
})
