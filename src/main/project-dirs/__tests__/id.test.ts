import { describe, expect, it } from 'vitest'
import { projectIdFromPath } from '../store/id.js'

describe('projectIdFromPath', () => {
  it('returns 16 hex characters', () => {
    const id = projectIdFromPath('/foo/bar')
    expect(id).toMatch(/^[0-9a-f]{16}$/)
  })

  it('is stable for the same input', () => {
    expect(projectIdFromPath('/foo')).toBe(projectIdFromPath('/foo'))
  })

  it('differs for different inputs', () => {
    expect(projectIdFromPath('/foo')).not.toBe(projectIdFromPath('/bar'))
  })

  it('normalizes trailing slashes', () => {
    expect(projectIdFromPath('/foo/')).toBe(projectIdFromPath('/foo'))
    expect(projectIdFromPath('/foo///')).toBe(projectIdFromPath('/foo'))
  })

  it('does NOT expand ~ — the literal is hashed', () => {
    // Stability across machines depends on storing the same literal,
    // so ~/foo and /Users/x/foo must hash differently.
    expect(projectIdFromPath('~/foo')).not.toBe(projectIdFromPath('/Users/x/foo'))
  })
})
