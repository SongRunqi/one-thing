import { describe, expect, it } from 'vitest'
import {
  applyExactEditsToNormalizedContent,
  detectLineEnding,
  normalizeToLF,
  previewExactEdits,
  restoreLineEndings,
  stripBom,
} from '../edit-engine.js'

describe('runtime edit-engine', () => {
  it('applies multiple disjoint edits against the original content', () => {
    const result = applyExactEditsToNormalizedContent(
      'one A\ntwo B\nthree C\n',
      [
        { oldText: 'one A', newText: 'one X' },
        { oldText: 'three C', newText: 'three Z' },
      ],
      'file.txt',
    )

    expect(result.newContent).toBe('one X\ntwo B\nthree Z\n')
  })

  it('requires exact non-empty oldText and rejects no-op replacements', () => {
    expect(() => applyExactEditsToNormalizedContent(
      'same\nsame\n',
      [{ oldText: 'same', newText: 'other' }],
      'file.txt',
    )).toThrow(/Found 2 occurrences/)

    expect(() => applyExactEditsToNormalizedContent(
      'hello\n',
      [{ oldText: 'missing', newText: 'other' }],
      'file.txt',
    )).toThrow(/Could not find/)

    expect(() => applyExactEditsToNormalizedContent(
      'hello\n',
      [{ oldText: '', newText: 'other' }],
      'file.txt',
    )).toThrow(/oldText must not be empty/)

    expect(() => applyExactEditsToNormalizedContent(
      'hello\n',
      [{ oldText: 'hello', newText: 'hello' }],
      'file.txt',
    )).toThrow(/No changes made/)
  })

  it('applies a unique whole-line match when only indentation differs', () => {
    const result = applyExactEditsToNormalizedContent(
      [
        'function outer() {',
        '  if (ready) {',
        '    return compute(value)',
        '  }',
        '}',
        '',
      ].join('\n'),
      [{
        oldText: [
          'if (ready) {',
          '  return compute(value)',
          '}',
        ].join('\n'),
        newText: [
          'if (ready) {',
          '  return computeNext(value)',
          '}',
        ].join('\n'),
      }],
      'file.ts',
    )

    expect(result.newContent).toBe([
      'function outer() {',
      '  if (ready) {',
      '    return computeNext(value)',
      '  }',
      '}',
      '',
    ].join('\n'))
  })

  it('rejects ambiguous indentation-insensitive matches', () => {
    expect(() => applyExactEditsToNormalizedContent(
      [
        '  return value',
        '    return value',
        '',
      ].join('\n'),
      [{ oldText: 'return value', newText: 'return nextValue' }],
      'file.ts',
    )).toThrow(/Found 2 occurrences/)
  })

  it('rejects overlapping edits', () => {
    expect(() => applyExactEditsToNormalizedContent(
      'abcdef\n',
      [
        { oldText: 'abc', newText: 'ABC' },
        { oldText: 'bcd', newText: 'BCD' },
      ],
      'file.txt',
    )).toThrow(/overlap/)
  })

  it('normalizes line endings and emits a diff preview', () => {
    expect(detectLineEnding('a\r\nb\r\n')).toBe('\r\n')
    expect(normalizeToLF('a\r\nb\rc')).toBe('a\nb\nc')
    expect(restoreLineEndings('a\nb\n', '\r\n')).toBe('a\r\nb\r\n')

    const raw = '\uFEFFconst x = 1\r\n'
    expect(stripBom(raw)).toEqual({ bom: '\uFEFF', text: 'const x = 1\r\n' })

    const preview = previewExactEdits(
      raw,
      [{ oldText: 'const x = 1', newText: 'const x = 2' }],
      'file.ts',
    )

    expect(preview.finalContent).toBe('\uFEFFconst x = 2\r\n')
    expect(preview.diff).toContain('const x = 2')
  })
})
