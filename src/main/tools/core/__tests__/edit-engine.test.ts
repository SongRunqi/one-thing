import { describe, expect, it } from 'vitest'
import {
  applyExactEditsToNormalizedContent,
  detectLineEnding,
  normalizeToLF,
  previewExactEdits,
  restoreLineEndings,
  stripBom,
} from '../edit-engine'

describe('edit-engine', () => {
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

  it('requires oldText to be present exactly once', () => {
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
  })

  it('rejects empty oldText and no-op replacements', () => {
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

  it('normalizes and restores line endings', () => {
    expect(detectLineEnding('a\r\nb\r\n')).toBe('\r\n')
    expect(normalizeToLF('a\r\nb\rc')).toBe('a\nb\nc')
    expect(restoreLineEndings('a\nb\n', '\r\n')).toBe('a\r\nb\r\n')
  })

  it('strips and restores BOM in preview final content', () => {
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
