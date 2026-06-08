import { describe, expect, it } from 'vitest'
import { getScrollTopForSearchResult } from '../result-scroll'

describe('Search Everywhere result scrolling', () => {
  it('keeps the current scroll when the selected item is already visible', () => {
    expect(getScrollTopForSearchResult({
      currentScrollTop: 100,
      containerHeight: 240,
      itemTop: 150,
      itemHeight: 32,
    })).toBe(100)
  })

  it('scrolls upward when the selected item is above the viewport', () => {
    expect(getScrollTopForSearchResult({
      currentScrollTop: 100,
      containerHeight: 240,
      itemTop: 80,
      itemHeight: 32,
    })).toBe(76)
  })

  it('scrolls downward when the selected item is below the viewport', () => {
    expect(getScrollTopForSearchResult({
      currentScrollTop: 100,
      containerHeight: 240,
      itemTop: 330,
      itemHeight: 32,
    })).toBe(126)
  })

  it('does not jump while layout metrics are unavailable', () => {
    expect(getScrollTopForSearchResult({
      currentScrollTop: 100,
      containerHeight: 0,
      itemTop: 330,
      itemHeight: 32,
    })).toBe(100)
  })
})
