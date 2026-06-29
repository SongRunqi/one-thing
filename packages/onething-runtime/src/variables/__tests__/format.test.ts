import * as os from 'node:os'
import { describe, expect, it } from 'vitest'
import { formatVariablesForPrompt } from '../format.js'
import type { ContextVariable } from '../types.js'

function v(partial: Partial<ContextVariable> & { name: string; value: string }): ContextVariable {
  return { ...partial }
}

describe('formatVariablesForPrompt', () => {
  it('renders one line per variable with descriptions and skips empty values', () => {
    expect(formatVariablesForPrompt([
      v({ name: 'a', value: '1', description: 'first' }),
      v({ name: 'empty', value: '' }),
      v({ name: 'b', value: '2' }),
    ])).toBe('- a: 1 (first)\n- b: 2')
  })

  it('renders ordered workdir values with collapsed extra roots', () => {
    const home = os.homedir()
    const out = formatVariablesForPrompt([
      v({
        name: 'workdir',
        value: `${home}/project`,
        values: [`${home}/project`, `${home}/.onething/skills/iva`],
      }),
    ])
    expect(out).toBe('- workdir: ~/project (current cwd; values[0])\n  - extra root: ~/.onething/skills/iva')
  })

  it('folds multiline values and truncates with the existing ellipsis', () => {
    expect(formatVariablesForPrompt([
      v({ name: 'note', value: 'line1\nline2\nline3' }),
      v({ name: 'long', value: 'x'.repeat(20) }),
    ], { maxValueLength: 10 })).toBe('- note: line1 (+2 …\n- long: xxxxxxxxxx…')
  })
})
