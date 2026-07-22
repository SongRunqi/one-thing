import { describe, expect, it } from 'vitest'
import {
  applyExactEditsToNormalizedContent,
  detectLineEnding,
  normalizeToLF,
  previewExactEdits,
  restoreLineEndings,
  stripBom,
  findClosestRegionSnippet,
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

  it('replaces every occurrence when replaceAll is set', () => {
    const result = applyExactEditsToNormalizedContent(
      'BEGIN\n  RAISE NOTICE 1;\nEND\nALTER\nBEGIN\n  RAISE NOTICE 1;\nEND\n',
      [{ oldText: '  RAISE NOTICE 1;', newText: '  RAISE NOTICE 2;', replaceAll: true }],
      'file.sql',
    )

    expect(result.newContent).toBe(
      'BEGIN\n  RAISE NOTICE 2;\nEND\nALTER\nBEGIN\n  RAISE NOTICE 2;\nEND\n',
    )
  })

  it('still requires uniqueness when replaceAll is absent or false', () => {
    for (const edit of [
      { oldText: 'same', newText: 'other' },
      { oldText: 'same', newText: 'other', replaceAll: false },
    ]) {
      expect(() => applyExactEditsToNormalizedContent(
        'same\nsame\n',
        [edit],
        'file.txt',
      )).toThrow(/Found 2 occurrences/)
    }
  })

  it('points at replaceAll in the duplicate-match error', () => {
    expect(() => applyExactEditsToNormalizedContent(
      'same\nsame\n',
      [{ oldText: 'same', newText: 'other' }],
      'file.txt',
    )).toThrow(/replaceAll: true/)
  })

  it('mixes a replaceAll edit with a targeted edit in one call', () => {
    const result = applyExactEditsToNormalizedContent(
      'let a = 1\nlet b = 1\nconst tail = 0\n',
      [
        { oldText: '= 1', newText: '= 9', replaceAll: true },
        { oldText: 'const tail = 0', newText: 'const tail = 7' },
      ],
      'file.ts',
    )

    expect(result.newContent).toBe('let a = 9\nlet b = 9\nconst tail = 7\n')
  })

  it('rejects a replaceAll edit that collides with another edit', () => {
    expect(() => applyExactEditsToNormalizedContent(
      'xy\nx\n',
      [
        { oldText: 'x', newText: 'X', replaceAll: true },
        { oldText: 'xy', newText: 'ZZ' },
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

describe('findClosestRegionSnippet', () => {
  const content = [
    'local intentMap = {',
    '  ["6103849"] = "ServiceRequest",',
    '  ["25867044"] = "ServiceRequest",',
    '  ["8071253636"] = "ServiceRequest", -- AR',
    '}',
    'local mappedIntent = intentMap[called] or defaultIntent',
    'return mappedIntent',
  ].join('\n')

  it('returns a line-numbered snippet around the most similar region', () => {
    const snippet = findClosestRegionSnippet(content, '  ["8071253636"] = "ServiceRequest",')
    expect(snippet).toContain('Closest match in the current file')
    expect(snippet).toContain('4→  ["8071253636"] = "ServiceRequest", -- AR')
  })

  it('returns null when nothing in the file resembles the target', () => {
    expect(findClosestRegionSnippet(content, 'völlig unrelated zeug xyzzy plugh')).toBeNull()
  })

  it('is embedded in the not-found error so the model sees current file text', () => {
    expect(() => applyExactEditsToNormalizedContent(
      content,
      [{ oldText: '  ["8071253636"] = "ServiceRequest",\n', newText: 'x' }],
      'nlp_test.lua',
    )).toThrow(/Closest match in the current file/)
  })
})
