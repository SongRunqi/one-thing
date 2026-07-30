import { describe, expect, it } from 'vitest'
import { applyTriggerReplacement, parseEditorTrigger } from '../triggers'

describe('editor trigger parsing', () => {
  it('parses slash command triggers', () => {
    expect(parseEditorTrigger('/com')).toEqual({
      type: 'command',
      query: 'com',
      from: 0,
      to: 4,
    })
  })

  it('does not parse slash commands after other text', () => {
    expect(parseEditorTrigger('hello /com')).toBeNull()
  })

  it('parses /cd path triggers', () => {
    expect(parseEditorTrigger('/cd ~/work')).toEqual({
      type: 'path',
      query: '~/work',
      from: 0,
      to: 10,
    })
  })

  it('keeps spaces and non-ascii characters in /cd path queries', () => {
    expect(parseEditorTrigger('/cd ~/工作 docs/My Project')).toEqual({
      type: 'path',
      query: '~/工作 docs/My Project',
      from: 0,
      to: 24,
    })
  })

  it('uses the cursor position as the replacement boundary for path triggers', () => {
    const value = '/cd ~/work trailing text'
    const cursor = '/cd ~/work'.length

    expect(parseEditorTrigger(value, cursor)).toEqual({
      type: 'path',
      query: '~/work',
      from: 0,
      to: cursor,
    })
  })

  it('parses explicit file search triggers', () => {
    expect(parseEditorTrigger('open @files src/main')).toEqual({
      type: 'file',
      query: 'src/main',
      from: 5,
      to: 20,
      explicit: true,
    })
  })

  it('parses explicit @files triggers in the middle of a line', () => {
    const value = 'compare old @files src/router and new'
    const cursor = 'compare old @files src/router'.length

    expect(parseEditorTrigger(value, cursor)).toEqual({
      type: 'file',
      query: 'src/router',
      from: 12,
      to: cursor,
      explicit: true,
    })
  })

  it('parses explicit @prompts triggers in the middle of a line', () => {
    const value = 'use @prompts refactor before sending'
    const cursor = 'use @prompts refactor'.length

    expect(parseEditorTrigger(value, cursor)).toEqual({
      type: 'prompt',
      query: 'refactor',
      from: 4,
      to: cursor,
      explicit: true,
    })
  })

  it('parses explicit @skills triggers in the middle of a line', () => {
    const value = 'use @skills note before sending'
    const cursor = 'use @skills note'.length

    expect(parseEditorTrigger(value, cursor)).toEqual({
      type: 'skill',
      query: 'note',
      from: 4,
      to: cursor,
      explicit: true,
    })
  })

  it('parses explicit @page triggers in the middle of a line', () => {
    const value = 'summarize @page docs before sending'
    const cursor = 'summarize @page docs'.length

    expect(parseEditorTrigger(value, cursor)).toEqual({
      type: 'page',
      query: 'docs',
      from: 10,
      to: cursor,
      explicit: true,
    })
  })

  it('parses a bare @page keyword without a query', () => {
    expect(parseEditorTrigger('look at @page')).toEqual({
      type: 'page',
      query: '',
      from: 8,
      to: 13,
      explicit: true,
    })
  })

  it('degrades @page to a bare file query when the page trigger is disabled', () => {
    expect(parseEditorTrigger('look at @page', undefined, { pageTrigger: false })).toEqual({
      type: 'file',
      query: 'page',
      from: 8,
      to: 13,
      explicit: false,
    })
  })

  it('keeps @pag (incomplete keyword) as a file search query', () => {
    expect(parseEditorTrigger('look at @pag')).toEqual({
      type: 'file',
      query: 'pag',
      from: 8,
      to: 12,
      explicit: false,
    })
  })

  it('parses @downloads as a regular file search query', () => {
    expect(parseEditorTrigger('attach @downloads')).toEqual({
      type: 'file',
      query: 'downloads',
      from: 7,
      to: 17,
      explicit: false,
    })
  })

  it('parses backward-compatible @path triggers', () => {
    expect(parseEditorTrigger('inspect @src/app')).toEqual({
      type: 'file',
      query: 'src/app',
      from: 8,
      to: 16,
      explicit: false,
    })
  })

  it('uses cursor-local file triggers when multiple triggers are present', () => {
    const value = 'read @first then @second'
    const cursor = 'read @first'.length

    expect(parseEditorTrigger(value, cursor)).toEqual({
      type: 'file',
      query: 'first',
      from: 5,
      to: cursor,
      explicit: false,
    })
  })

  it('does not parse slash commands when the cursor is before non-whitespace trailing content', () => {
    const value = '/com then keep typing'
    expect(parseEditorTrigger(value, 4)).toBeNull()
  })

  it('parses triggers at the cursor in the middle of a multi-line value', () => {
    const value = 'first line\nopen @files src\nlast line'
    const cursor = 'first line\nopen @files src'.length
    expect(parseEditorTrigger(value, cursor)).toEqual({
      type: 'file',
      query: 'src',
      from: 16,
      to: 26,
      explicit: true,
    })
  })

  it('applies replacements using parser ranges', () => {
    const value = 'open @files src'
    const trigger = parseEditorTrigger(value)
    expect(trigger).not.toBeNull()
    expect(applyTriggerReplacement(value, trigger!, '@/tmp/project/src/index.ts ')).toBe('open @/tmp/project/src/index.ts ')
  })

  it('applies prompt replacements using parser ranges', () => {
    const value = 'use @prompts review'
    const trigger = parseEditorTrigger(value)
    expect(trigger).not.toBeNull()
    expect(applyTriggerReplacement(value, trigger!, '{{prompt:p1}} ')).toBe('use {{prompt:p1}} ')
  })

  it('routes bare @ to room members when memberTrigger is on, keeping @files explicit', () => {
    expect(parseEditorTrigger('问一下 @小', undefined, { memberTrigger: true })).toEqual({
      type: 'member',
      query: '小',
      from: 4,
      to: 6,
      explicit: false,
    })
    // Ordinary sessions keep the bare-@ file query.
    expect(parseEditorTrigger('问一下 @小')?.type).toBe('file')
    // Files stay reachable in rooms via the explicit keyword.
    expect(parseEditorTrigger('open @files src', undefined, { memberTrigger: true })?.type).toBe('file')
  })

  it('replaces a member trigger with the exact mention text', () => {
    const value = '问一下 @小'
    const trigger = parseEditorTrigger(value, undefined, { memberTrigger: true })
    expect(trigger).not.toBeNull()
    expect(applyTriggerReplacement(value, trigger!, '@小李 ')).toBe('问一下 @小李 ')
  })
})
