import { describe, expect, it } from 'vitest'
import type { ToolCall } from '@/types'
import {
  buildToolActivityTarget,
  buildToolPermissionTitle,
  buildToolVerb,
} from '../helpers/tool-display'
import type { ToolRenderStatus } from '../helpers/tool-status'

function tc(toolName: string, args: Record<string, unknown> = {}): ToolCall {
  return {
    id: `tc-${toolName}`,
    toolId: toolName,
    toolName,
    arguments: args,
    status: 'pending',
    timestamp: 0,
  }
}

const knownToolSamples: Array<{ toolName: string; args?: Record<string, unknown> }> = [
  { toolName: 'bash', args: { command: 'echo hi' } },
  { toolName: 'read', args: { path: 'src/main.ts' } },
  { toolName: 'grep', args: { pattern: 'needle' } },
  { toolName: 'glob', args: { pattern: '**/*.ts' } },
  { toolName: 'find', args: { pattern: '**/*.vue' } },
  { toolName: 'ls', args: { path: 'src' } },
  { toolName: 'write', args: { path: 'src/new.ts' } },
  { toolName: 'edit', args: { path: 'src/app.ts' } },
  { toolName: 'web_search', args: { query: 'current weather' } },
  { toolName: 'calculator', args: { expression: '2 + 2' } },
  { toolName: 'get_current_time', args: { timezone: 'UTC' } },
  { toolName: 'fart' },
  { toolName: 'variable', args: { action: 'set', name: 'workdir', value: '/tmp/project' } },
  { toolName: 'todo_plan', args: { action: 'update', title: 'Ship it' } },
  { toolName: 'time', args: { action: 'convert', timezone: 'UTC' } },
  { toolName: 'project_dirs', args: { action: 'update', path: '/tmp/project' } },
  { toolName: 'skill', args: { action: 'load', name: 'code-review' } },
  { toolName: 'mcp_search', args: { action: 'call', tool: 'brave_web_search' } },
  { toolName: 'mcp_old_tool', args: { query: 'legacy' } },
]

const statuses: ToolRenderStatus[] = ['awaiting-confirmation', 'executing', 'completed']

describe('tool display mappings', () => {
  it('maps every known tool away from generic use labels', () => {
    for (const sample of knownToolSamples) {
      const toolCall = tc(sample.toolName, sample.args)
      for (const status of statuses) {
        expect(buildToolVerb(sample.toolName, status, toolCall), `${sample.toolName}:${status}`)
          .not.toMatch(/^Us(e|ing|ed)$/)
      }
      expect(buildToolPermissionTitle(toolCall), sample.toolName).not.toMatch(/^Use\b/)
    }
  })

  it('uses action-specific labels for skill and MCP router tools', () => {
    expect(buildToolVerb('skill', 'executing', tc('skill', { action: 'search', query: 'crv' }))).toBe('Searching')
    expect(buildToolVerb('skill', 'completed', tc('skill', { action: 'find', query: 'crv' }))).toBe('Found')
    expect(buildToolVerb('skill', 'completed', tc('skill', { action: 'load', name: 'code-review' }))).toBe('Loaded')
    expect(buildToolActivityTarget('skill', tc('skill', { action: 'load', name: 'code-review' }))).toBe('code-review')

    expect(buildToolVerb('mcp_search', 'executing', tc('mcp_search', { action: 'search', query: 'brave' }))).toBe('Searching')
    expect(buildToolVerb('mcp_search', 'completed', tc('mcp_search', { action: 'find', query: 'brave' }))).toBe('Found')
    expect(buildToolVerb('mcp_search', 'completed', tc('mcp_search', { action: 'describe', tool: 'brave_web_search' }))).toBe('Inspected')
    expect(buildToolVerb('mcp_search', 'awaiting-confirmation', tc('mcp_search', { action: 'call', tool: 'brave_web_search' }))).toBe('Call')
    expect(buildToolPermissionTitle(tc('mcp_search', { action: 'call', tool: 'brave_web_search' }))).toBe('Call brave_web_search')
    expect(buildToolVerb('tool_function', 'executing', tc('tool_function', { action: 'search', query: 'brave' }))).toBe('Searching')
  })

  it('uses action-specific labels for multi-action built-in tools', () => {
    expect(buildToolVerb('variable', 'awaiting-confirmation', tc('variable', { action: 'append', name: 'workdir' }))).toBe('Add')
    expect(buildToolVerb('todo_plan', 'executing', tc('todo_plan', { action: 'delete', id: 'todo-1' }))).toBe('Deleting')
    expect(buildToolVerb('time', 'completed', tc('time', { action: 'diff' }))).toBe('Compared')
    expect(buildToolVerb('project_dirs', 'executing', tc('project_dirs', { action: 'remove', path: '/tmp/project' }))).toBe('Removing')
  })

  it('falls back to call labels for unknown dynamic tools', () => {
    const dynamicTool = tc('custom_runtime_tool')
    expect(buildToolVerb(dynamicTool.toolName, 'executing', dynamicTool)).toBe('Calling')
    expect(buildToolVerb(dynamicTool.toolName, 'completed', dynamicTool)).toBe('Called')
    expect(buildToolPermissionTitle(dynamicTool)).toBe('Call custom_runtime_tool')
  })
})
