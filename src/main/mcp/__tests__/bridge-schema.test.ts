import { describe, expect, it } from 'vitest'
import { mcpToolToToolDefinition } from '../bridge.js'
import type { MCPToolInfo } from '../types.js'

describe('MCP bridge schema conversion', () => {
  it('preserves nested inputSchema on ToolDefinition', () => {
    const tool: MCPToolInfo = {
      serverId: 'server',
      name: 'nested',
      description: 'Nested MCP tool',
      inputSchema: {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            description: 'Nested items',
            items: {
              type: 'object',
              properties: {
                value: { type: 'string', description: 'Value text' },
              },
              required: ['value'],
            },
          },
        },
        required: ['items'],
      },
    }

    const definition = mcpToolToToolDefinition(tool)

    expect(definition.parameterSchema?.properties?.items).toMatchObject({
      type: 'array',
      items: {
        type: 'object',
        properties: {
          value: { type: 'string', description: 'Value text' },
        },
        required: ['value'],
      },
    })
  })
})
