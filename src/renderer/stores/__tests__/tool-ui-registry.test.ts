import { describe, it, expect } from 'vitest'
import {
  getToolUiCategory,
  getToolDisplayLabel,
  getToolIcon,
  getStatusLabel,
} from '../helpers/tool-ui-registry'

describe('tool-ui-registry', () => {
  it('maps file tool aliases to categories', () => {
    expect(getToolUiCategory('edit')).toBe('edit')
    expect(getToolUiCategory('replace_file_content')).toBe('edit')
    expect(getToolUiCategory('write_to_file')).toBe('write')
    expect(getToolUiCategory('view_file')).toBe('read')
    expect(getToolUiCategory('web_search')).toBe('search')
    expect(getToolUiCategory('web-open')).toBe('search')
    expect(getToolUiCategory('bash')).toBe('console')
    expect(getToolUiCategory('fart')).toBe('fart')
    expect(getToolUiCategory('whatever')).toBe('tool')
  })

  it('labels tools with their display name, aliases included', () => {
    expect(getToolDisplayLabel('edit')).toBe('Edit')
    expect(getToolDisplayLabel('replace_file_content')).toBe('Edit')
    expect(getToolDisplayLabel('bash')).toBe('Bash')
    expect(getToolDisplayLabel('mcp:brave.search')).toBe('brave.search')
    expect(getToolDisplayLabel('whatever_tool')).toBe('whatever_tool')
  })

  it('provides a distinct icon per tool with a category fallback', () => {
    expect(getToolIcon('bash')).toBeTruthy()
    expect(getToolIcon('bash')).not.toBe(getToolIcon('read'))
    expect(getToolIcon('edit')).not.toBe(getToolIcon('write'))
    // MCP tools share the plug icon; unknown tools fall back to the wrench.
    expect(getToolIcon('mcp:brave.search')).toBe(getToolIcon('mcp_search'))
    expect(getToolIcon('totally_unknown')).toBeTruthy()
  })

  it('labels every render status', () => {
    expect(getStatusLabel('awaiting-confirmation')).toBe('Needs approval')
    expect(getStatusLabel('streaming-input')).toBe('Preparing')
  })

})
