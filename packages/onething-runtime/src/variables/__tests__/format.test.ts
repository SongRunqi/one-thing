import * as os from 'node:os'
import { describe, expect, it } from 'vitest'
import { formatVariablesForPrompt, splitVariablesForPrompt } from '../format.js'
import type { ContextVariable } from '../types.js'

function v(partial: Partial<ContextVariable> & { name: string; value: string }): ContextVariable {
  return { ...partial }
}

describe('formatVariablesForPrompt', () => {
  it('renders one <var> element per variable with descriptions and skips empty values', () => {
    expect(formatVariablesForPrompt([
      v({ name: 'a', value: '1', description: 'first' }),
      v({ name: 'empty', value: '' }),
      v({ name: 'b', value: '2' }),
    ])).toBe('<var name="a" desc="first">1</var>\n<var name="b">2</var>')
  })

  it('renders type and non-session scope as attributes', () => {
    expect(formatVariablesForPrompt([
      v({ name: 'budget', value: '1.5', type: 'number', scope: 'session' }),
      v({ name: 'tags', value: '["x"]', type: 'set', scope: 'agent', description: 'labels' }),
      v({ name: 'plain', value: 'text', type: 'string', scope: 'global' }),
    ])).toBe([
      '<var name="budget" type="number">1.5</var>',
      '<var name="tags" type="set" scope="agent" desc="labels">["x"]</var>',
      '<var name="plain" scope="global">text</var>',
    ].join('\n'))
  })

  it('escapes XML special characters in attributes and content', () => {
    expect(formatVariablesForPrompt([
      v({ name: 'q', value: 'a < b & c', description: 'says "hi" & <bye>' }),
    ])).toBe('<var name="q" desc="says &quot;hi&quot; &amp; &lt;bye>">a &lt; b &amp; c</var>')
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
    expect(out).toBe('<var name="a">1</var>')
  })

  it('folds multiline values and truncates with the existing ellipsis', () => {
    expect(formatVariablesForPrompt([
      v({ name: 'note', value: 'line1\nline2\nline3' }),
      v({ name: 'long', value: 'x'.repeat(20) }),
    ], { maxValueLength: 10 })).toBe(
      '<var name="note">line1 (+2 …</var>\n<var name="long">xxxxxxxxxx…</var>',
    )
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
    expect(systemText).toBe('<var name="stable">s</var>\n<var name="explicit_static">e</var>')
    expect(turnText).toBe('<var name="datetime">2026-07-10 09:00 +08:00</var>')
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
      '<var name="fresh">a</var>',
      '<var name="old" stale="unchanged for 14+ days — update or delete if no longer true">b</var>',
      '<var name="no_timestamp">c</var>',
    ].join('\n'))
    // Turn channel is recomputed every turn — never marked stale.
    expect(turnText).toBe('<var name="old_turn">d</var>')
  })
})
