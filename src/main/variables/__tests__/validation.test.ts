import { describe, expect, it } from 'vitest'
import {
  assertNotReserved,
  assertValidName,
  assertValidValue,
  findDuplicateNames,
  isReservedName,
} from '../validation.js'
import { VARIABLE_LIMITS, VariableError } from '../types.js'

describe('assertValidName', () => {
  it.each(['a', 'A', '_x', 'foo', 'foo_bar', 'foo123', 'a'.repeat(64)])(
    'accepts %s',
    (name) => {
      expect(() => assertValidName(name)).not.toThrow()
    },
  )

  it.each([
    ['', 'empty'],
    [' ', 'whitespace'],
    ['1foo', 'leading digit'],
    ['foo bar', 'space inside'],
    ['foo-bar', 'hyphen'],
    ['foo.bar', 'dot'],
    ['工作目录', 'non-ASCII'],
    ['a'.repeat(65), 'over length'],
  ])('rejects %s (%s)', (name) => {
    expect(() => assertValidName(name)).toThrowError(VariableError)
  })

  it('throws INVALID_NAME for non-string input', () => {
    try {
      assertValidName(undefined as unknown as string)
      throw new Error('expected throw')
    } catch (err) {
      expect(err).toBeInstanceOf(VariableError)
      expect((err as VariableError).code).toBe('INVALID_NAME')
    }
  })
})

describe('assertValidValue', () => {
  it('accepts empty string', () => {
    expect(() => assertValidValue('')).not.toThrow()
  })

  it('accepts large but in-budget value', () => {
    expect(() => assertValidValue('a'.repeat(VARIABLE_LIMITS.MAX_VALUE_BYTES))).not.toThrow()
  })

  it('rejects values over the byte cap', () => {
    expect(() =>
      assertValidValue('a'.repeat(VARIABLE_LIMITS.MAX_VALUE_BYTES + 1)),
    ).toThrowError(VariableError)
  })

  it('rejects values over the byte cap when measured in UTF-8 bytes (not chars)', () => {
    // Each "中" is 3 UTF-8 bytes — half the char count, full byte cap.
    const justOver = '中'.repeat(Math.ceil(VARIABLE_LIMITS.MAX_VALUE_BYTES / 3) + 1)
    try {
      assertValidValue(justOver)
      throw new Error('expected throw')
    } catch (err) {
      expect(err).toBeInstanceOf(VariableError)
      expect((err as VariableError).code).toBe('INVALID_VALUE')
    }
  })

  it('rejects non-string value', () => {
    expect(() => assertValidValue(42 as unknown as string)).toThrowError(VariableError)
  })
})

describe('reserved names', () => {
  it.each(['workdir', 'cwd', 'home', 'ai_note_dir', 'user_note_dir', 'work_note_dir'])(
    '%s is reserved',
    (name) => {
      expect(isReservedName(name)).toBe(true)
      expect(() => assertNotReserved(name)).toThrowError(VariableError)
    },
  )

  it('non-reserved names pass', () => {
    expect(isReservedName('my_var')).toBe(false)
    expect(() => assertNotReserved('my_var')).not.toThrow()
  })

  it('reserved check is case-sensitive (WORKDIR is fine)', () => {
    expect(isReservedName('WORKDIR')).toBe(false)
    expect(() => assertNotReserved('WORKDIR')).not.toThrow()
  })
})

describe('findDuplicateNames', () => {
  it('returns [] when unique', () => {
    expect(findDuplicateNames(['a', 'b', 'c'])).toEqual([])
  })

  it('lists each duplicate once', () => {
    expect(findDuplicateNames(['a', 'b', 'a', 'c', 'b', 'a']).sort()).toEqual(['a', 'b'])
  })
})
