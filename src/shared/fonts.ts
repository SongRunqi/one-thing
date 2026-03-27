/**
 * Font Registry
 * Central definition of available fonts for the app.
 * To add a new font:
 *   1. Install the font package (e.g., bun add @fontsource-variable/xxx)
 *   2. Import it in src/renderer/styles/main.css
 *   3. Add an entry here
 */

export interface FontDefinition {
  id: string
  name: string           // Display name in settings UI
  family: string         // CSS font-family value
  category: 'sans-serif' | 'serif' | 'monospace'
  lang: 'en' | 'zh' | 'both'  // Primary language support
  preview?: string       // Preview text for settings UI
}

export const FONT_REGISTRY: FontDefinition[] = [
  // --- Sans-serif ---
  {
    id: 'public-sans',
    name: 'Public Sans',
    family: "'Public Sans Variable'",
    category: 'sans-serif',
    lang: 'en',
    preview: 'The quick brown fox jumps over the lazy dog',
  },
  {
    id: 'noto-sans-sc',
    name: '思源黑体 Noto Sans SC',
    family: "'Noto Sans SC Variable'",
    category: 'sans-serif',
    lang: 'zh',
    preview: '你好世界 Hello World',
  },

  // --- Serif / Kai ---
  {
    id: 'lora',
    name: 'Lora',
    family: "'Lora Variable'",
    category: 'serif',
    lang: 'en',
    preview: 'The quick brown fox jumps over the lazy dog',
  },
  {
    id: 'noto-serif-sc',
    name: '思源宋体 Noto Serif SC',
    family: "'Noto Serif SC Variable'",
    category: 'serif',
    lang: 'zh',
    preview: '你好世界 Hello World',
  },
  {
    id: 'lxgw-wenkai',
    name: '霞鹜文楷 LXGW WenKai',
    family: "'LXGW WenKai'",
    category: 'serif',
    lang: 'zh',
    preview: '你好世界 Hello World',
  },
  {
    id: 'lxgw-wenkai-screen',
    name: '霞鹜文楷屏幕版 WenKai Screen',
    family: "'LXGW WenKai Screen'",
    category: 'serif',
    lang: 'zh',
    preview: '你好世界 Hello World',
  },
]

/** Defaults */
export const DEFAULT_FONT_EN = 'public-sans'
export const DEFAULT_FONT_ZH = 'noto-sans-sc'

/** Get a font definition by ID */
export function getFontById(id: string): FontDefinition | undefined {
  return FONT_REGISTRY.find(f => f.id === id)
}

/** Get fonts filtered by language */
export function getFontsByLang(lang: 'en' | 'zh'): FontDefinition[] {
  return FONT_REGISTRY.filter(f => f.lang === lang || f.lang === 'both')
}

/**
 * Build a CSS font-family string from EN + ZH font IDs.
 * English font goes first (no CJK glyphs), Chinese font as fallback for CJK characters.
 */
export function buildFontFamily(enId?: string, zhId?: string): string {
  const enFont = getFontById(enId || DEFAULT_FONT_EN)
  const zhFont = getFontById(zhId || DEFAULT_FONT_ZH)

  const parts: string[] = []
  if (enFont) parts.push(enFont.family)
  if (zhFont) parts.push(zhFont.family)

  // Determine generic fallback from the fonts' categories
  const hasSerif = enFont?.category === 'serif' || zhFont?.category === 'serif'
  const fallback = hasSerif
    ? "Georgia, Cambria, serif"
    : "ui-sans-serif, system-ui, -apple-system, sans-serif"

  parts.push(fallback)
  return parts.join(', ')
}
