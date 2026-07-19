import * as os from 'node:os'
import { describe, expect, it } from 'vitest'
import { formatVariablesForPrompt, splitVariablesForPrompt } from '../format.js'
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

  it('skips workdir entirely (rendered by the prompt builder, never twice)', () => {
    const home = os.homedir()
    const out = formatVariablesForPrompt([
      v({
        name: 'workdir',
        value: `${home}/project`,
        values: [`${home}/project`, `${home}/.onething/skills/iva`],
      }),
      v({ name: 'a', value: '1' }),
    ])
    expect(out).toBe('- a: 1')
  })

  it('folds multiline values and truncates with the existing ellipsis', () => {
    expect(formatVariablesForPrompt([
      v({ name: 'note', value: 'line1\nline2\nline3' }),
      v({ name: 'long', value: 'x'.repeat(20) }),
    ], { maxValueLength: 10 })).toBe('- note: line1 (+2 …\n- long: xxxxxxxxxx…')
  })
})

describe('splitVariablesForPrompt', () => {
  it('routes variables to channels by volatility, defaulting to static', () => {
    const { systemText, turnText } = splitVariablesForPrompt([
      v({ name: 'stable', value: 's' }),
      v({ name: 'explicit_static', value: 'e', volatility: 'static' }),
      v({ name: 'datetime', value: '2026-07-10 09:00 +08:00', volatility: 'turn' }),
      v({ name: 'session_stats', value: '42 messages', volatility: 'on-demand' }),
    ])
    expect(systemText).toBe('- stable: s\n- explicit_static: e')
    expect(turnText).toBe('- datetime: 2026-07-10 09:00 +08:00')
  })

  it('formatVariablesForPrompt only emits the static channel', () => {
    expect(formatVariablesForPrompt([
      v({ name: 'datetime', value: 'now', volatility: 'turn' }),
      v({ name: 'hidden', value: 'x', volatility: 'on-demand' }),
    ])).toBe('')
  })

  it('marks static variables unchanged for 14+ days as stale (constant marker)', () => {
    const DAY = 24 * 60 * 60 * 1000
    const now = 100 * DAY
    const { systemText, turnText } = splitVariablesForPrompt([
      v({ name: 'fresh', value: 'a', updatedAt: now - DAY }),
      v({ name: 'old', value: 'b', updatedAt: now - 15 * DAY }),
      v({ name: 'no_timestamp', value: 'c' }),
      v({ name: 'old_turn', value: 'd', volatility: 'turn', updatedAt: now - 15 * DAY }),
    ], { now })
    expect(systemText).toBe([
      '- fresh: a',
      '- old: b [stale: unchanged for 14+ days — update or delete if no longer true]',
      '- no_timestamp: c',
    ].join('\n'))
    // Turn channel is recomputed every turn — never marked stale.
    expect(turnText).toBe('- old_turn: d')
  })
})
