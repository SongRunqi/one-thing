import { describe, expect, it } from 'vitest'
import {
  diffHunksFromUnknown,
  diffHunksHaveChanges,
  parseUnifiedDiffToHunks,
} from '../diff-hunks'

const LUA_DIFF = [
  'Index: f.lua',
  '===================================================================',
  '--- f.lua',
  '+++ f.lua',
  '@@ -1,7 +1,2 @@',
  ' a',
  '--- AR',
  '--- CL',
  '--- CO',
  '--- MX',
  '--- PE',
  ' b',
  '',
].join('\n')

describe('parseUnifiedDiffToHunks', () => {
  it('reads deleted `--`-content lines as deletions, not file headers', () => {
    // The exact ambiguity that truncated the incident diff: `--- AR` inside a
    // hunk body is a deleted `-- AR` line, and only count-based parsing can
    // tell it apart from the `--- f.lua` header above.
    const parsed = parseUnifiedDiffToHunks(LUA_DIFF)
    expect(parsed.fileName).toBe('f.lua')
    expect(parsed.hunks).toHaveLength(1)
    const deletions = parsed.hunks[0].lines.filter(line => line.op === 'del')
    expect(deletions.map(line => line.text)).toEqual([
      '-- AR',
      '-- CL',
      '-- CO',
      '-- MX',
      '-- PE',
    ])
    expect(parsed.hunks[0].lines.filter(line => line.op === 'ctx')).toHaveLength(2)
  })

  it('parses multiple hunks with implicit count of 1', () => {
    const text = [
      '--- f',
      '+++ f',
      '@@ -1 +1 @@',
      '-old',
      '+new',
      '@@ -10,2 +10,2 @@',
      ' keep',
      '-a',
      '+b',
      '',
    ].join('\n')
    const parsed = parseUnifiedDiffToHunks(text)
    expect(parsed.hunks).toHaveLength(2)
    expect(parsed.hunks[0].oldLines).toBe(1)
    expect(parsed.hunks[1].newStart).toBe(10)
    expect(parsed.hunks[1].lines.map(line => line.op)).toEqual(['ctx', 'del', 'add'])
  })

  it('captures no-newline markers as noeof lines', () => {
    const text = [
      '--- f',
      '+++ f',
      '@@ -1,2 +1,2 @@',
      ' x',
      '-no-eol',
      '\\ No newline at end of file',
      '+changed',
      '\\ No newline at end of file',
      '',
    ].join('\n')
    const parsed = parseUnifiedDiffToHunks(text)
    expect(parsed.hunks[0].lines.map(line => line.op)).toEqual([
      'ctx',
      'del',
      'noeof',
      'add',
      'noeof',
    ])
  })

  it('stops a hunk at a legacy truncation marker', () => {
    const text = [
      '--- f',
      '+++ f',
      '@@ -1,100 +1,100 @@',
      ' a',
      '-b',
      '+c',
      '[... diff truncated (42 more lines); full diff kept in the file mutation audit]',
      '',
    ].join('\n')
    const parsed = parseUnifiedDiffToHunks(text)
    expect(parsed.hunks).toHaveLength(1)
    expect(parsed.hunks[0].lines).toHaveLength(3)
  })
})

describe('diffHunksFromUnknown', () => {
  it('accepts a well-formed hunk payload', () => {
    const value = [
      {
        oldStart: 1,
        oldLines: 2,
        newStart: 1,
        newLines: 1,
        lines: [
          { op: 'ctx', text: 'a' },
          { op: 'del', text: 'b' },
        ],
      },
    ]
    expect(diffHunksFromUnknown(value)).toEqual(value)
  })

  it('rejects malformed payloads entirely', () => {
    expect(diffHunksFromUnknown(undefined)).toBeUndefined()
    expect(diffHunksFromUnknown([])).toBeUndefined()
    expect(diffHunksFromUnknown([{ oldStart: 1 }])).toBeUndefined()
    expect(
      diffHunksFromUnknown([
        { oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines: [{ op: 'zap', text: '' }] },
      ]),
    ).toBeUndefined()
  })
})

describe('diffHunksHaveChanges', () => {
  it('detects additions/deletions and ignores pure context', () => {
    expect(diffHunksHaveChanges(undefined)).toBe(false)
    expect(
      diffHunksHaveChanges([
        { oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines: [{ op: 'ctx', text: 'a' }] },
      ]),
    ).toBe(false)
    expect(
      diffHunksHaveChanges([
        { oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines: [{ op: 'add', text: 'a' }] },
      ]),
    ).toBe(true)
  })
})
