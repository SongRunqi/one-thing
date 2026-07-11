import { describe, expect, it } from 'vitest'
import {
  buildFontLoadSpecs,
  FONT_REGISTRY,
} from '../fonts'

describe('buildFontLoadSpecs', () => {
  it('returns specs for default UI fonts when called with no arguments', () => {
    const specs = buildFontLoadSpecs()
    // DEFAULT_FONT_EN = 'public-sans' (webfont, weights [400,500,600])
    // DEFAULT_FONT_ZH = 'noto-sans-sc' (webfont, weights [400,500,600])
    expect(specs.length).toBe(6)
    expect(specs.filter(s => s.spec.includes('Public Sans'))).toHaveLength(3)
    expect(specs.filter(s => s.spec.includes('Noto Sans SC'))).toHaveLength(3)
  })

  it('expands weights for webfont entries', () => {
    // When only enId is given, zhId defaults to DEFAULT_FONT_ZH (noto-sans-sc, 3 weights)
    const specs = buildFontLoadSpecs('lxgw-wenkai')
    // lxgw-wenkai: webfont, weights [400, 700] → 2
    // noto-sans-sc (default zh): weights [400, 500, 600] → 3
    expect(specs.length).toBe(5)
    const lxgwSpecs = specs.filter(s => s.spec.includes('LXGW WenKai'))
    expect(lxgwSpecs).toHaveLength(2)
    expect(lxgwSpecs[0].spec).toBe('400 14px \'LXGW WenKai\'')
    expect(lxgwSpecs[1].spec).toBe('700 14px \'LXGW WenKai\'')
  })

  it('uses single weight for lxgw-wenkai-screen', () => {
    // undefined en falls back to DEFAULT_FONT_EN (public-sans, 3 weights)
    const specs = buildFontLoadSpecs(undefined, 'lxgw-wenkai-screen')
    // public-sans: 3 + lxgw-wenkai-screen: 1 = 4
    expect(specs.length).toBe(4)
    const lxgwScreenSpecs = specs.filter(s => s.spec.includes('LXGW WenKai Screen'))
    expect(lxgwScreenSpecs).toHaveLength(1)
    expect(lxgwScreenSpecs[0].spec).toBe('400 14px \'LXGW WenKai Screen\'')
  })

  it('returns only default fallback specs for system fonts (non-webfont)', () => {
    // system-ui is not a webfont, but zh defaults to noto-sans-sc
    expect(buildFontLoadSpecs('system-ui')).toHaveLength(3)
    expect(buildFontLoadSpecs('system-cjk')).toHaveLength(3)
    // Both system → no webfonts, zero specs
    expect(buildFontLoadSpecs('system-ui', 'system-cjk')).toHaveLength(0)
  })

  it('silently skips unknown font IDs without crashing', () => {
    // Unknown enId → getFontById returns undefined → skipped
    // zhId defaults to DEFAULT_FONT_ZH (noto-sans-sc, 3 weights)
    const specs = buildFontLoadSpecs('nonexistent-font-id')
    expect(specs.length).toBe(3)
    expect(specs.every(s => s.spec.includes('Noto Sans SC'))).toBe(true)
  })

  it('silently skips unknown ZH ID and still loads default EN', () => {
    // enId defaults to DEFAULT_FONT_EN (public-sans, 3 weights)
    // Unknown zhId → getFontById returns undefined → skipped
    const specs = buildFontLoadSpecs(undefined, 'nonexistent-zh')
    expect(specs.length).toBe(3)
    expect(specs.every(s => s.spec.includes('Public Sans'))).toBe(true)
  })

  it('provides CJK sample for Chinese fonts and Latin sample for English fonts', () => {
    const specs = buildFontLoadSpecs('public-sans', 'lxgw-wenkai')
    for (const { spec, sample } of specs) {
      if (spec.includes('Public Sans')) {
        expect(sample).toBe('The quick brown fox jumps over the lazy dog')
      } else if (spec.includes('LXGW WenKai')) {
        // CJK sample should contain Chinese characters
        expect(sample).toMatch(/[\u4e00-\u9fff]/)
      }
    }
  })

  it('does not deduplicate (caller\'s responsibility)', () => {
    // Passing the same ID for both en and zh duplicates the same font specs.
    // Deduplication is handled by the caller (preloadCriticalFonts in main.ts)
    const specs = buildFontLoadSpecs('public-sans', 'public-sans')
    expect(specs.length).toBe(6)
  })

  it('handles georgia correctly (system font, no webfont)', () => {
    // georgia is not a webfont, but zh defaults to noto-sans-sc (webfont, 3 weights)
    const specs = buildFontLoadSpecs('georgia')
    expect(specs.length).toBe(3) // only noto-sans-sc default
    expect(specs.every(s => s.spec.includes('Noto Sans SC'))).toBe(true)
  })

  it('does not produce spec for undefined en when zh is specified', () => {
    const specs = buildFontLoadSpecs(undefined, 'lxgw-wenkai-screen')
    // Should fallback to DEFAULT_FONT_EN (public-sans) for EN
    expect(specs.filter(s => s.spec.includes('Public Sans'))).toHaveLength(3)
    expect(specs.filter(s => s.spec.includes('LXGW WenKai Screen'))).toHaveLength(1)
    expect(specs.length).toBe(4)
  })

  it('all registered webfont entries have at least one weight', () => {
    for (const font of FONT_REGISTRY) {
      if (font.webfont) {
        expect(font.weights).toBeDefined()
        expect(font.weights!.length).toBeGreaterThan(0)
      }
    }
  })

  it('georgia is present in the registry', () => {
    const georgia = FONT_REGISTRY.find(f => f.id === 'georgia')
    expect(georgia).toBeDefined()
    expect(georgia!.family).toBe('Georgia')
    expect(georgia!.category).toBe('serif')
    expect(georgia!.lang).toBe('en')
  })
})
