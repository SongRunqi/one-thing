/**
 * Base46 Theme Parser
 * Parses NvChad Base46 Lua theme files and converts them to our JSON format
 */

import type { Base46Theme, Base46Base30, Base46Base16, Theme, ThemeDefs } from '../../shared/ipc/themes.js'

/**
 * Extract a Lua table from theme content
 * Handles patterns like: M.base_30 = { key = "value", ... }
 */
function extractLuaTable(content: string, tableName: string): Record<string, string> {
  const result: Record<string, string> = {}

  // Match patterns like: M.base_30 = { ... }
  const tableRegex = new RegExp(`M\\.${tableName}\\s*=\\s*\\{([^}]+)\\}`, 's')
  const match = content.match(tableRegex)

  if (!match) return result

  const tableContent = match[1]

  // Match key-value pairs: key = "value" or key = "#hex"
  const kvRegex = /(\w+)\s*=\s*["']([^"']+)["']/g
  let kvMatch

  while ((kvMatch = kvRegex.exec(tableContent)) !== null) {
    const [, key, value] = kvMatch
    result[key] = value
  }

  return result
}

/**
 * Extract a single Lua value
 * Handles patterns like: M.type = "dark"
 */
function extractLuaValue(content: string, key: string): string | null {
  const regex = new RegExp(`M\\.${key}\\s*=\\s*["']([^"']+)["']`)
  const match = content.match(regex)
  return match ? match[1] : null
}

/**
 * Parse a Base46 Lua theme file
 */
export function parseBase46Lua(content: string): Base46Theme | null {
  try {
    const base30 = extractLuaTable(content, 'base_30')
    const base16 = extractLuaTable(content, 'base_16')
    const type = extractLuaValue(content, 'type') as 'dark' | 'light' | null

    // Validate we got at least some colors
    if (Object.keys(base30).length === 0 && Object.keys(base16).length === 0) {
      console.warn('[Base46Parser] No colors found in theme file')
      return null
    }

    return {
      type: type || 'dark',
      base_30: base30 as Partial<Base46Base30>,
      base_16: base16 as Partial<Base46Base16>,
    }
  } catch (err) {
    console.error('[Base46Parser] Failed to parse Lua content:', err)
    return null
  }
}

/**
 * Convert kebab-case or snake_case to camelCase
 */
function toCamelCase(str: string): string {
  return str.replace(/[-_](\w)/g, (_, c) => c.toUpperCase())
}

/**
 * Convert string to kebab-case (for theme ID)
 */
function toKebabCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase()
}

/**
 * Convert Base46 theme to our JSON theme format
 */
export function convertBase46ToTheme(base46: Base46Theme, fileName: string): Theme {
  const b30 = base46.base_30
  const b16 = base46.base_16

  // Create a display name from filename
  const displayName = fileName
    .split(/[-_]/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')

  // Detect color scheme: use explicit type from Lua, or detect from background color
  const bgColor = b30.black || b30.darker_black || b16.base00 || '#1E1E2E'
  const colorScheme = base46.type || detectColorSchemeFromBg(bgColor)

  // Build defs from all Base46 colors
  const defs: ThemeDefs = {}

  // Add base_30 colors to defs
  for (const [key, value] of Object.entries(b30)) {
    defs[key] = value
  }

  // Add base_16 colors to defs
  for (const [key, value] of Object.entries(b16)) {
    defs[key] = value
  }

  // Map Base46 colors to our theme structure
  const theme: Theme = {
    id: toKebabCase(fileName),
    name: displayName,
    author: 'NvChad',
    version: '1.0.0',
    type: 'full',
    colorScheme, // Auto-detected from Lua M.type or background luminance

    defs,

    theme: {
      // Accent - use blue or base0D (functions/links)
      accent: b30.blue || b16.base0D || '#4385BE',
      accentMain: b30.blue || b16.base0D || '#4385BE',
      accentSub: b30.nord_blue || b30.baby_pink || b16.base0C || '#8BE9FD',
      accentRgb: hexToRgb(b30.blue || b16.base0D || '#4385BE'),

      bg: {
        app: b30.darker_black || b30.black || b16.base00 || '#282726',
        sidebar: b30.black || b16.base00 || '#282726',
        chat: b30.one_bg || b16.base01 || '#343331',
        panel: b30.one_bg || b16.base01 || '#343331',
        elevated: b30.one_bg2 || b16.base02 || '#403E3C',
        floating: b30.one_bg3 || b16.base03 || '#575653',
        message: {
          user: b30.one_bg2 || b16.base02 || '#403E3C',
          userSolid: b30.one_bg2 || b16.base02 || '#403E3C',
          ai: 'transparent',
          system: b30.one_bg || b16.base01 || '#343331',
          error: `rgba(${hexToRgb(b30.red || b16.base08 || '#FF5555')}, 0.12)`,
          hover: 'rgba(255, 255, 255, 0.03)',
        },
        toolCall: b30.one_bg || b16.base01 || '#343331',
        toolCallHover: b30.one_bg2 || b16.base02 || '#403E3C',
        toolResult: b30.one_bg || b16.base01 || '#343331',
        input: b30.one_bg || b16.base01 || '#343331',
        inputFocus: b30.one_bg2 || b16.base02 || '#403E3C',
        btn: {
          primary: b30.blue || b16.base0D || '#4385BE',
          primaryHover: b30.nord_blue || b16.base0C || '#8BE9FD',
          secondary: b30.grey || b16.base03 || '#575653',
          secondaryHover: b30.grey_fg || b16.base04 || '#6F6E69',
          ghost: 'transparent',
          ghostHover: b30.one_bg2 || b16.base02 || '#403E3C',
          danger: b30.red || b16.base08 || '#FF5555',
          dangerHover: b30.baby_pink || b16.base09 || '#FFB86C',
        },
        code: {
          inline: b30.one_bg2 || b16.base02 || '#403E3C',
          block: b30.darker_black || b16.base00 || '#282726',
          header: b30.one_bg2 || b16.base02 || '#403E3C',
        },
        menu: b30.one_bg2 || b16.base02 || '#403E3C',
        menuItemHover: b30.one_bg3 || b16.base03 || '#575653',
        tooltip: b30.light_grey || b16.base07 || '#F2F0E5',
        modal: b30.one_bg || b16.base01 || '#343331',
        selected: `rgba(${hexToRgb(b30.blue || b16.base0D || '#4385BE')}, 0.15)`,
        selectedHover: `rgba(${hexToRgb(b30.blue || b16.base0D || '#4385BE')}, 0.2)`,
        highlight: `rgba(${hexToRgb(b30.yellow || b16.base0A || '#F1FA8C')}, 0.2)`,
        hover: 'rgba(255, 255, 255, 0.04)',
        active: 'rgba(255, 255, 255, 0.08)',
      },

      text: {
        primary: b30.white || b16.base05 || '#F2F0E5',
        secondary: b30.light_grey || b16.base06 || '#E6E4D9',
        muted: b30.grey_fg || b16.base04 || '#878580',
        faint: b30.grey || b16.base03 || '#6F6E69',
        error: b30.red || b16.base08 || '#FF5555',
        warning: b30.orange || b16.base09 || '#FFB86C',
        success: b30.green || b16.base0B || '#50FA7B',
        info: b30.cyan || b16.base0C || '#8BE9FD',
        link: b30.cyan || b16.base0C || '#8BE9FD',
        linkHover: b30.teal || b16.base0C || '#8BE9FD',
        user: {
          primary: b30.white || b16.base05 || '#F2F0E5',
          secondary: b30.light_grey || b16.base06 || '#E6E4D9',
        },
        ai: {
          primary: b30.light_grey || b16.base06 || '#E6E4D9',
          secondary: b30.grey_fg2 || b16.base04 || '#878580',
          thinking: b30.grey || b16.base03 || '#6F6E69',
        },
        tool: {
          name: b30.purple || b16.base0E || '#BD93F9',
          args: b30.grey || b16.base03 || '#6F6E69',
          result: b30.grey_fg || b16.base04 || '#878580',
          error: b30.red || b16.base08 || '#FF5555',
        },
        sidebar: {
          title: b30.white || b16.base05 || '#F2F0E5',
          item: b30.grey_fg || b16.base04 || '#878580',
          itemActive: b30.blue || b16.base0D || '#4385BE',
          itemHover: b30.white || b16.base05 || '#F2F0E5',
          muted: b30.grey || b16.base03 || '#6F6E69',
        },
        input: b30.white || b16.base05 || '#F2F0E5',
        inputPlaceholder: b30.grey || b16.base03 || '#6F6E69',
        btn: {
          primary: b30.black || b16.base00 || '#282726',
          secondary: b30.light_grey || b16.base06 || '#E6E4D9',
          ghost: b30.grey_fg || b16.base04 || '#878580',
          danger: b30.black || b16.base00 || '#282726',
        },
        code: {
          inline: b30.pink || b16.base0E || '#FF79C6',
          block: b30.light_grey || b16.base06 || '#E6E4D9',
          comment: b30.grey || b16.base03 || '#6272A4',
          keyword: b30.purple || b16.base0E || '#BD93F9',
          string: b30.green || b16.base0B || '#50FA7B',
          number: b30.orange || b16.base09 || '#FFB86C',
          function: b30.blue || b16.base0D || '#8BE9FD',
          variable: b30.cyan || b16.base08 || '#F8F8F2',
          operator: b30.grey_fg || b16.base04 || '#878580',
          type: b30.teal || b16.base0C || '#4ec9b0',
          property: b30.nord_blue || b16.base0C || '#9cdcfe',
          punctuation: b30.grey_fg || b16.base05 || '#d4d4d4',
        },
        menu: {
          item: b30.grey_fg || b16.base04 || '#878580',
          itemHover: b30.white || b16.base05 || '#F2F0E5',
          itemActive: b30.blue || b16.base0D || '#4385BE',
          header: b30.grey || b16.base03 || '#6F6E69',
        },
        label: b30.grey_fg || b16.base04 || '#878580',
        helper: b30.grey || b16.base03 || '#6F6E69',
      },

      border: {
        default: b30.line || b30.grey || b16.base02 || '#44475A',
        subtle: b30.one_bg2 || b16.base01 || '#343331',
        strong: b30.grey_fg || b16.base03 || '#575653',
        accent: b30.blue || b16.base0D || '#4385BE',
        error: b30.red || b16.base08 || '#FF5555',
        success: b30.green || b16.base0B || '#50FA7B',
        warning: b30.orange || b16.base09 || '#FFB86C',
        input: b30.line || b30.grey || b16.base02 || '#44475A',
        inputFocus: b30.blue || b16.base0D || '#4385BE',
        inputError: b30.red || b16.base08 || '#FF5555',
        message: b30.one_bg2 || b16.base01 || '#343331',
        messageUser: b30.grey || b16.base02 || '#44475A',
        code: b30.grey || b16.base02 || '#44475A',
        divider: b30.line || b30.one_bg2 || b16.base01 || '#343331',
      },

      shadow: {
        xs: '0 1px 2px rgba(0, 0, 0, 0.2)',
        sm: '0 2px 4px rgba(0, 0, 0, 0.25)',
        md: '0 4px 12px rgba(0, 0, 0, 0.3)',
        lg: '0 8px 24px rgba(0, 0, 0, 0.35)',
        xl: '0 16px 48px rgba(0, 0, 0, 0.4)',
        inner: 'inset 0 2px 4px rgba(0, 0, 0, 0.15)',
        glow: {
          accent: `0 0 20px rgba(${hexToRgb(b30.blue || b16.base0D || '#4385BE')}, 0.2)`,
          error: `0 0 20px rgba(${hexToRgb(b30.red || b16.base08 || '#FF5555')}, 0.2)`,
        },
        elevated: '0 8px 32px rgba(0, 0, 0, 0.4)',
        floating: '0 12px 48px rgba(0, 0, 0, 0.5)',
      },

      effects: {
        gradientUserBubble: `linear-gradient(135deg, ${b30.one_bg2 || b16.base02 || '#403E3C'} 0%, ${b30.one_bg || b16.base01 || '#343331'} 100%)`,
        gradientAiBubble: 'linear-gradient(135deg, transparent 0%, transparent 100%)',
        gradientAccent: `linear-gradient(135deg, ${b30.blue || b16.base0D || '#4385BE'} 0%, ${b30.nord_blue || b16.base0C || '#8BE9FD'} 100%)`,
        overlayHover: 'rgba(255, 255, 255, 0.04)',
        overlayActive: 'rgba(255, 255, 255, 0.08)',
        overlayDisabled: 'rgba(0, 0, 0, 0.5)',
        blurBackdrop: '24px',
      },

      // Diff colors for code diff views
      diff: {
        addBg: `rgba(${hexToRgb(b30.green || b16.base0B || '#50FA7B')}, 0.15)`,
        addText: b30.vibrant_green || b30.green || b16.base0B || '#50FA7B',
        delBg: `rgba(${hexToRgb(b30.red || b16.base08 || '#FF5555')}, 0.15)`,
        delText: b30.baby_pink || b30.red || b16.base08 || '#FF5555',
        hunkBg: `rgba(${hexToRgb(b30.grey || b16.base03 || '#6F6E69')}, 0.1)`,
        hunkText: b30.grey || b16.base03 || '#6F6E69',
      },

      // Semantic colors (aligned with Base46 color scheme)
      color: {
        danger: b30.red || b16.base08 || '#FF5555',
        dangerLight: `rgba(${hexToRgb(b30.red || b16.base08 || '#FF5555')}, 0.15)`,
        warning: b30.orange || b30.yellow || b16.base09 || '#FFB86C',
        warningLight: `rgba(${hexToRgb(b30.orange || b30.yellow || b16.base09 || '#FFB86C')}, 0.15)`,
        success: b30.green || b16.base0B || '#50FA7B',
        successLight: `rgba(${hexToRgb(b30.green || b16.base0B || '#50FA7B')}, 0.15)`,
        info: b30.cyan || b16.base0C || '#8BE9FD',
        infoLight: `rgba(${hexToRgb(b30.cyan || b16.base0C || '#8BE9FD')}, 0.15)`,
      },
    },
  }

  return theme
}

/**
 * Convert hex color to RGB values string
 */
function hexToRgb(hex: string): string {
  // Remove # if present
  hex = hex.replace('#', '')

  // Handle 3-char hex
  if (hex.length === 3) {
    hex = hex.split('').map(c => c + c).join('')
  }

  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)

  return `${r}, ${g}, ${b}`
}

/**
 * Calculate relative luminance of a hex color (WCAG standard)
 * Returns value 0-1, where 0 is black and 1 is white
 */
function getLuminance(hex: string): number {
  // Remove # if present
  hex = hex.replace('#', '')

  // Handle 3-char hex
  if (hex.length === 3) {
    hex = hex.split('').map(c => c + c).join('')
  }

  const r = parseInt(hex.slice(0, 2), 16) / 255
  const g = parseInt(hex.slice(2, 4), 16) / 255
  const b = parseInt(hex.slice(4, 6), 16) / 255

  // sRGB to linear RGB conversion
  const toLinear = (c: number) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)

  // Relative luminance formula (WCAG 2.1)
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
}

/**
 * Detect if a theme is light or dark based on background color luminance
 */
function detectColorSchemeFromBg(bgColor: string): 'dark' | 'light' {
  const luminance = getLuminance(bgColor)
  // Threshold: > 0.5 is considered light
  return luminance > 0.5 ? 'light' : 'dark'
}
