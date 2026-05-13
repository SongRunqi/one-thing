import { describe, expect, it } from 'vitest'
import {
  isSelectionOnFirstLine,
  isSelectionOnLastLine,
} from '../useInputHistory'

describe('input history cursor helpers', () => {
  it('treats empty input as both first and last line', () => {
    expect(isSelectionOnFirstLine('', 0)).toBe(true)
    expect(isSelectionOnLastLine('', 0)).toBe(true)
  })

  it('detects selections on the first line', () => {
    const value = 'one\ntwo\nthree'

    expect(isSelectionOnFirstLine(value, 2)).toBe(true)
    expect(isSelectionOnFirstLine(value, 3)).toBe(true)
    expect(isSelectionOnFirstLine(value, 5)).toBe(false)
  })

  it('detects selections on the last line', () => {
    const value = 'one\ntwo\nthree'

    expect(isSelectionOnLastLine(value, 5)).toBe(false)
    expect(isSelectionOnLastLine(value, 8)).toBe(true)
    expect(isSelectionOnLastLine(value, value.length)).toBe(true)
  })

  it('treats a selection anchor on the middle line as neither first nor last', () => {
    const value = 'one\ntwo\nthree'
    const selectionAnchor = value.indexOf('two') + 1

    expect(isSelectionOnFirstLine(value, selectionAnchor)).toBe(false)
    expect(isSelectionOnLastLine(value, selectionAnchor)).toBe(false)
  })

  it('handles multiline boundaries around newline characters', () => {
    const value = 'one\ntwo'

    expect(isSelectionOnFirstLine(value, value.indexOf('\n'))).toBe(true)
    expect(isSelectionOnLastLine(value, value.indexOf('\n'))).toBe(false)
    expect(isSelectionOnFirstLine(value, value.indexOf('\n') + 1)).toBe(false)
    expect(isSelectionOnLastLine(value, value.indexOf('\n') + 1)).toBe(true)
  })
})
