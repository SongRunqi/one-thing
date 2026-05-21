import * as os from 'os'
import { describe, expect, it } from 'vitest'
import { formatVariablesForPrompt } from '../format.js'
import type { ContextVariable } from '../types.js'

function v(partial: Partial<ContextVariable> & { name: string; value: string }): ContextVariable {
  return { ...partial }
}

describe('formatVariablesForPrompt', () => {
  it('renders one line per variable, with description in parens', () => {
    const out = formatVariablesForPrompt([
      v({ name: 'a', value: '1', description: 'first' }),
      v({ name: 'b', value: '2' }),
    ])
    expect(out).toBe('- a: 1 (first)\n- b: 2')
  })

  it('skips empty values', () => {
    const out = formatVariablesForPrompt([
      v({ name: 'a', value: '' }),
      v({ name: 'b', value: 'x' }),
    ])
    expect(out).toBe('- b: x')
  })

  it('returns empty string when all values are empty', () => {
    const out = formatVariablesForPrompt([v({ name: 'a', value: '' })])
    expect(out).toBe('')
  })

  it('collapses HOME prefix when collapseHome is on (default)', () => {
    const home = os.homedir()
    const out = formatVariablesForPrompt([v({ name: 'workdir', value: `${home}/foo/bar` })])
    expect(out).toBe('- workdir: ~/foo/bar')
  })

  it('does not collapse HOME when option is off', () => {
    const home = os.homedir()
    const out = formatVariablesForPrompt(
      [v({ name: 'workdir', value: `${home}/foo` })],
      { collapseHome: false },
    )
    expect(out).toBe(`- workdir: ${home}/foo`)
  })

  it('renders ordered workdir values with extra roots', () => {
    const home = os.homedir()
    const out = formatVariablesForPrompt([
      v({
        name: 'workdir',
        value: `${home}/project`,
        values: [`${home}/project`, `${home}/.claude/skills/iva`],
      }),
    ])
    expect(out).toBe('- workdir: ~/project (current cwd; values[0])\n  - extra root: ~/.claude/skills/iva')
  })

  it('folds multi-line values to first line + (+N more lines)', () => {
    const out = formatVariablesForPrompt([
      v({ name: 'note', value: 'line1\nline2\nline3' }),
    ])
    expect(out).toBe('- note: line1 (+2 more lines)')
  })

  it('uses singular "line" when only one extra line', () => {
    const out = formatVariablesForPrompt([
      v({ name: 'note', value: 'a\nb' }),
    ])
    expect(out).toBe('- note: a (+1 more line)')
  })

  it('truncates long values with ellipsis', () => {
    const long = 'x'.repeat(600)
    const out = formatVariablesForPrompt(
      [v({ name: 'a', value: long })],
      { maxValueLength: 10 },
    )
    expect(out).toBe('- a: xxxxxxxxxx…')
  })
})
