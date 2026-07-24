import { describe, expect, it } from 'vitest'

import {
  SEARCH_CATEGORIES,
  isSearchCategory,
  type SearchCategory,
} from '../search'

describe('search IPC category facade', () => {
  it('re-exports the runtime-owned search category protocol', () => {
    const category: SearchCategory = 'prompts'

    expect(SEARCH_CATEGORIES).toContain(category)
    expect(isSearchCategory(category)).toBe(true)
    expect(isSearchCategory('unknown')).toBe(false)
  })
})
