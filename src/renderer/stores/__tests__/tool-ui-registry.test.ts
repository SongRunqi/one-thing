import { describe, it, expect } from 'vitest'
import {
  getToolUiCategory,
  getCategoryVerbs,
  getStatusLabel,
  getInspectorTab,
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

  it('provides one verb set per category', () => {
    expect(getCategoryVerbs('edit')).toEqual({ base: 'Edit', run: 'Editing', done: 'Edited' })
    expect(getCategoryVerbs('console')).toEqual({ base: 'Run', run: 'Running', done: 'Ran' })
    expect(getCategoryVerbs('tool')).toEqual({ base: 'Call', run: 'Calling', done: 'Called' })
  })

  it('labels every render status', () => {
    expect(getStatusLabel('awaiting-confirmation')).toBe('Needs approval')
    expect(getStatusLabel('streaming-input')).toBe('Preparing')
  })

  it('maps tools to their inspector tab', () => {
    expect(getInspectorTab('web_search')).toBe('browser')
    expect(getInspectorTab('edit')).toBe('diff')
    expect(getInspectorTab('read')).toBe('diff')
    expect(getInspectorTab('bash')).toBe('console')
  })
})
