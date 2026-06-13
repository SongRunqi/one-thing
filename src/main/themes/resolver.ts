/**
 * Theme Color Resolver
 * Recursively resolves color references from defs and theme properties
 */

import type {
  ColorValue,
  HighlightFontStyle,
  HighlightStyle,
  SemanticHighlightToken,
  SemanticUIToken,
  Theme,
  ThemeDefs,
  ThemeHighlightGroup,
} from '../../shared/ipc/themes.js'
import type { ThemeSurfaceRoles } from './role-mapping.js'
import {
  colorMeetsContrast,
  colorToRgbString,
  deriveSurfaceRoles,
  mixCssColors,
  parseCssColor,
  readableAgainst,
  resolveColorOverBackground,
  rgbaFromCssColor,
} from './role-mapping.js'

type ResolvedColorValue = string | { dark: string; light: string }

export interface ResolvedHighlightStyle {
  fg?: string
  bg?: string
  fontStyle?: HighlightFontStyle
}

export interface ResolvedUIStyle {
  fg?: string
  bg?: string
  border?: string
  ring?: string
  shadow?: string
}

export const SEMANTIC_HIGHLIGHT_TOKENS: SemanticHighlightToken[] = [
  'syntax.plain',
  'syntax.comment',
  'syntax.keyword',
  'syntax.atom',
  'syntax.string',
  'syntax.number',
  'syntax.function',
  'syntax.definition',
  'syntax.variable',
  'syntax.property',
  'syntax.type',
  'syntax.tag',
  'syntax.operator',
  'syntax.punctuation',
  'syntax.invalid',
  'syntax.inserted',
  'syntax.deleted',
  'syntax.heading',
  'syntax.link',
  'syntax.emphasis',
  'syntax.strong',
]

const SEMANTIC_HIGHLIGHT_TOKEN_SET = new Set<string>(SEMANTIC_HIGHLIGHT_TOKENS)

export const SEMANTIC_UI_TOKENS: SemanticUIToken[] = [
  'ui.accent.primary',
  'ui.accent.subtle',
  'ui.surface.app',
  'ui.surface.sidebar',
  'ui.surface.chat',
  'ui.surface.panel',
  'ui.surface.elevated',
  'ui.surface.floating',
  'ui.surface.overlay',
  'ui.surface.menu',
  'ui.surface.menuHover',
  'ui.surface.input',
  'ui.surface.inputFocus',
  'ui.surface.codeInline',
  'ui.surface.codeBlock',
  'ui.surface.codeHeader',
  'ui.surface.tooltip',
  'ui.surface.modal',
  'ui.surface.note',
  'ui.surface.previewLight',
  'ui.surface.previewDark',
  'ui.text.primary',
  'ui.text.secondary',
  'ui.text.muted',
  'ui.text.faint',
  'ui.text.inverse',
  'ui.text.placeholder',
  'ui.text.disabled',
  'ui.text.link',
  'ui.text.linkHover',
  'ui.border.default',
  'ui.border.subtle',
  'ui.border.strong',
  'ui.border.divider',
  'ui.border.focus',
  'ui.border.selected',
  'ui.action.primary',
  'ui.action.primaryHover',
  'ui.action.secondary',
  'ui.action.secondaryHover',
  'ui.action.ghost',
  'ui.action.ghostHover',
  'ui.action.danger',
  'ui.action.dangerHover',
  'ui.action.disabled',
  'ui.state.hover',
  'ui.state.active',
  'ui.state.selected',
  'ui.state.selectedHover',
  'ui.state.highlight',
  'ui.state.focus',
  'ui.state.disabled',
  'ui.sidebar.surface',
  'ui.sidebar.item',
  'ui.sidebar.itemHover',
  'ui.sidebar.itemActive',
  'ui.sidebar.itemMuted',
  'ui.sidebar.header',
  'ui.sidebar.action',
  'ui.sidebar.actionHover',
  'ui.sidebar.border',
  'ui.tabBar.surface',
  'ui.tabBar.divider',
  'ui.tabBar.item',
  'ui.tabBar.itemHover',
  'ui.tabBar.itemActive',
  'ui.tabBar.action',
  'ui.tabBar.actionHover',
  'ui.tabBar.danger',
  'ui.status.danger',
  'ui.status.warning',
  'ui.status.success',
  'ui.status.info',
  'ui.message.user',
  'ui.message.userSolid',
  'ui.message.assistant',
  'ui.message.system',
  'ui.message.error',
  'ui.message.hover',
  'ui.message.thinking',
  'ui.tool.surface',
  'ui.tool.surfaceHover',
  'ui.tool.surfaceSubtle',
  'ui.tool.result',
  'ui.tool.error',
  'ui.tool.success',
  'ui.tool.text',
  'ui.tool.textMuted',
  'ui.tool.textFaint',
  'ui.tool.accent',
  'ui.tool.accentOn',
  'ui.tool.successText',
  'ui.tool.dangerText',
  'ui.tool.border',
  'ui.editor.text',
  'ui.editor.placeholder',
  'ui.editor.caret',
  'ui.editor.selection',
]

const VALID_HIGHLIGHT_FONT_STYLES = new Set<HighlightFontStyle>([
  'normal',
  'italic',
  'bold',
  'underline',
  'bold italic',
  'bold underline',
  'italic underline',
  'bold italic underline',
])

const DEFAULT_HIGHLIGHT_ALIASES: Record<string, SemanticHighlightToken> = {
  Normal: 'syntax.plain',
  Comment: 'syntax.comment',
  '@comment': 'syntax.comment',
  Keyword: 'syntax.keyword',
  Statement: 'syntax.keyword',
  Conditional: 'syntax.keyword',
  Repeat: 'syntax.keyword',
  Include: 'syntax.keyword',
  Exception: 'syntax.keyword',
  '@keyword': 'syntax.keyword',
  '@keyword.function': 'syntax.keyword',
  '@keyword.operator': 'syntax.keyword',
  Boolean: 'syntax.atom',
  Constant: 'syntax.atom',
  '@boolean': 'syntax.atom',
  String: 'syntax.string',
  Character: 'syntax.string',
  '@string': 'syntax.string',
  Number: 'syntax.number',
  Float: 'syntax.number',
  '@number': 'syntax.number',
  Function: 'syntax.function',
  '@function': 'syntax.function',
  '@method': 'syntax.function',
  '@constructor': 'syntax.function',
  Identifier: 'syntax.variable',
  Variable: 'syntax.variable',
  '@variable': 'syntax.variable',
  Property: 'syntax.property',
  '@property': 'syntax.property',
  '@field': 'syntax.property',
  Type: 'syntax.type',
  Typedef: 'syntax.type',
  '@type': 'syntax.type',
  '@class': 'syntax.type',
  Tag: 'syntax.tag',
  '@tag': 'syntax.tag',
  '@tag.attribute': 'syntax.property',
  Operator: 'syntax.operator',
  Delimiter: 'syntax.punctuation',
  '@operator': 'syntax.operator',
  '@punctuation': 'syntax.punctuation',
  Error: 'syntax.invalid',
  DiagnosticError: 'syntax.invalid',
  DiffAdd: 'syntax.inserted',
  DiffDelete: 'syntax.deleted',
  Title: 'syntax.heading',
  Underlined: 'syntax.link',
}

export type ThemeStatusColorToken = 'success' | 'warning' | 'danger' | 'info'

export const THEME_STATUS_COLOR_TOKENS: ThemeStatusColorToken[] = [
  'success',
  'warning',
  'danger',
  'info',
]

export const THEME_NEUTRAL_COLOR_TOKENS = [
  'primaryText',
  'regularText',
  'secondaryText',
  'placeholderText',
  'disabledText',
  'darkerBorder',
  'darkBorder',
  'baseBorder',
  'lightBorder',
  'lighterBorder',
  'extraLightBorder',
  'darkerFill',
  'darkFill',
  'baseFill',
  'lightFill',
  'lighterFill',
  'extraLightFill',
  'blankFill',
  'basicBlack',
  'basicWhite',
  'transparent',
  'pageBackground',
  'baseBackground',
  'overlayBackground',
] as const

export type ThemeNeutralColorToken = typeof THEME_NEUTRAL_COLOR_TOKENS[number]

export interface ResolvedThemeColorSemantics {
  primary: string
  status: Record<ThemeStatusColorToken, string>
  neutral: Record<ThemeNeutralColorToken, string>
}

/**
 * Check if a value is a direct color value (not a reference)
 */
function isDirectColorValue(value: string): boolean {
  return (
    value.startsWith('#') ||
    value.startsWith('rgb') ||
    value.startsWith('hsl') ||
    value.startsWith('var(') ||
    value.startsWith('linear-gradient') ||
    value.startsWith('radial-gradient') ||
    value.startsWith('color-mix') ||
    value === 'transparent' ||
    value === 'inherit' ||
    value === 'currentColor' ||
    value === 'none' ||
    /^\d/.test(value) ||
    value.startsWith('inset ')
  )
}

/**
 * Recursively resolve a color value
 * @param value - The color value to resolve
 * @param defs - Theme color definitions (aliases)
 * @param resolvedMap - Already resolved colors (for reference lookups)
 * @param visited - Visited references (to detect cycles)
 */
export function resolveColorValue(
  value: ColorValue,
  defs: ThemeDefs,
  resolvedMap: Map<string, ResolvedColorValue>,
  visited: Set<string> = new Set()
): ResolvedColorValue {
  // Handle mode variants { dark: "...", light: "..." }
  if (typeof value === 'object' && value !== null && 'dark' in value && 'light' in value) {
    return {
      dark: resolveColorValue(value.dark, defs, resolvedMap, new Set(visited)) as string,
      light: resolveColorValue(value.light, defs, resolvedMap, new Set(visited)) as string,
    }
  }

  // Handle string values
  if (typeof value === 'string') {
    // Check if it's a direct color value
    if (isDirectColorValue(value)) {
      return value
    }

    // Check for Flexoki palette reference (fx-*)
    if (value.startsWith('fx-')) {
      return `var(--${value})`
    }

    // It's a reference - resolve it
    const refName = value

    // Prevent infinite recursion (circular references)
    if (visited.has(refName)) {
      console.warn(`[ThemeResolver] Circular reference detected: ${refName}`)
      return '#ff00ff' // Magenta as error indicator
    }
    visited.add(refName)

    // Check defs first
    if (defs[refName] !== undefined) {
      return resolveColorValue(defs[refName], defs, resolvedMap, visited)
    }

    // Check already resolved theme colors
    if (resolvedMap.has(refName)) {
      return resolvedMap.get(refName)!
    }

    // Unknown reference - return as-is (might be CSS keyword or variable)
    console.warn(`[ThemeResolver] Unknown color reference: ${refName}`)
    return value
  }

  return String(value)
}

/**
 * Flatten a nested object to dot-notation keys
 * { bg: { app: "#fff" } } -> { "bg.app": "#fff" }
 */
function flattenObject(
  obj: Record<string, any>,
  prefix: string = '',
  result: Record<string, ColorValue> = {}
): Record<string, ColorValue> {
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key

    if (value !== null && typeof value === 'object' && !('dark' in value && 'light' in value)) {
      // Nested object (not a mode variant)
      flattenObject(value, fullKey, result)
    } else if (value !== undefined) {
      result[fullKey] = value as ColorValue
    }
  }
  return result
}

const DEFAULT_PRIMARY_COLOR = '#4385BE'

const STATUS_COLOR_DEFAULTS: Record<ThemeStatusColorToken, string> = {
  success: '#10B981',
  warning: '#F59E0B',
  danger: '#EF4444',
  info: '#3B82F6',
}

const STATUS_COLOR_FALLBACK_PATHS: Record<ThemeStatusColorToken, string[]> = {
  success: ['color.success', 'text.success', 'border.success', 'diff.addText'],
  warning: ['color.warning', 'text.warning', 'border.warning'],
  danger: ['color.danger', 'text.error', 'border.error', 'bg.btn.danger', 'diff.delText'],
  info: ['color.info', 'text.info', 'text.link', 'accent'],
}

const STATUS_LIGHT_FALLBACK_PATHS: Record<ThemeStatusColorToken, string[]> = {
  success: ['color.successLight', 'bg.toolSuccess', 'diff.addBg'],
  warning: ['color.warningLight', 'bg.highlight'],
  danger: ['color.dangerLight', 'bg.message.error', 'bg.toolError', 'diff.delBg'],
  info: ['color.infoLight'],
}

const NEUTRAL_COLOR_FALLBACK_PATHS: Record<ThemeNeutralColorToken, string[]> = {
  primaryText: ['neutral.primaryText', 'text.primary'],
  regularText: ['neutral.regularText', 'text.secondary', 'text.primary'],
  secondaryText: ['neutral.secondaryText', 'text.muted', 'text.secondary', 'text.primary'],
  placeholderText: ['neutral.placeholderText', 'text.inputPlaceholder', 'text.faint', 'text.muted'],
  disabledText: ['neutral.disabledText', 'text.inputDisabled', 'text.btn.disabled', 'text.faint', 'text.muted'],
  darkerBorder: ['neutral.darkerBorder', 'border.strong', 'border.default'],
  darkBorder: ['neutral.darkBorder', 'border.strong', 'border.default'],
  baseBorder: ['neutral.baseBorder', 'border.default'],
  lightBorder: ['neutral.lightBorder', 'border.subtle', 'border.default'],
  lighterBorder: ['neutral.lighterBorder', 'border.divider', 'border.subtle', 'border.default'],
  extraLightBorder: ['neutral.extraLightBorder', 'border.divider', 'border.subtle', 'border.default'],
  darkerFill: ['neutral.darkerFill', 'bg.floating', 'bg.elevated', 'bg.panel', 'bg.chat'],
  darkFill: ['neutral.darkFill', 'bg.elevated', 'bg.panel', 'bg.chat'],
  baseFill: ['neutral.baseFill', 'bg.panel', 'bg.chat'],
  lightFill: ['neutral.lightFill', 'bg.chat', 'bg.panel', 'bg.app'],
  lighterFill: ['neutral.lighterFill', 'bg.input', 'bg.chat', 'bg.app'],
  extraLightFill: ['neutral.extraLightFill', 'bg.app', 'bg.chat'],
  blankFill: ['neutral.blankFill'],
  basicBlack: ['neutral.basicBlack'],
  basicWhite: ['neutral.basicWhite'],
  transparent: ['neutral.transparent'],
  pageBackground: ['neutral.pageBackground', 'bg.app'],
  baseBackground: ['neutral.baseBackground', 'bg.chat', 'bg.panel', 'bg.app'],
  overlayBackground: ['neutral.overlayBackground', 'bg.modal', 'bg.floating', 'bg.panel'],
}

const NEUTRAL_COLOR_DEFAULTS: Record<ThemeNeutralColorToken, string> = {
  primaryText: '#F9FAFB',
  regularText: '#E5E7EB',
  secondaryText: '#9CA3AF',
  placeholderText: '#6B7280',
  disabledText: '#4B5563',
  darkerBorder: '#4B5563',
  darkBorder: '#374151',
  baseBorder: '#2F3746',
  lightBorder: '#253041',
  lighterBorder: '#202A39',
  extraLightBorder: '#1B2433',
  darkerFill: '#374151',
  darkFill: '#2F3746',
  baseFill: '#253041',
  lightFill: '#202A39',
  lighterFill: '#1B2433',
  extraLightFill: '#111827',
  blankFill: 'transparent',
  basicBlack: '#000000',
  basicWhite: '#FFFFFF',
  transparent: 'transparent',
  pageBackground: '#111827',
  baseBackground: '#1F2937',
  overlayBackground: '#374151',
}

function firstResolvedThemeValue(
  resolvedTheme: Record<string, string>,
  ...paths: string[]
): string | undefined {
  for (const path of paths) {
    const value = resolvedTheme[path]
    if (value !== undefined && value !== '') return value
  }
  return undefined
}

function deriveTranslucentColor(color: string, alpha: number): string {
  if (parseCssColor(color)) {
    return rgbaFromCssColor(color, alpha)
  }
  return `color-mix(in srgb, ${color} ${Math.round(alpha * 100)}%, transparent)`
}

function applyThemeColorSemantics(resolvedTheme: Record<string, string>): void {
  const primary = firstResolvedThemeValue(
    resolvedTheme,
    'primary',
    'accentMain',
    'accent'
  ) || DEFAULT_PRIMARY_COLOR

  resolvedTheme.primary = primary
  if (!resolvedTheme.accent) resolvedTheme.accent = primary
  if (!resolvedTheme.accentMain) resolvedTheme.accentMain = primary
  if (!resolvedTheme.accentLight) {
    resolvedTheme.accentLight = resolvedTheme.accentSub || primary
  }

  for (const token of THEME_STATUS_COLOR_TOKENS) {
    const colorPath = `color.${token}`
    const lightPath = `color.${token}Light`
    const color = firstResolvedThemeValue(
      resolvedTheme,
      ...STATUS_COLOR_FALLBACK_PATHS[token]
    ) || STATUS_COLOR_DEFAULTS[token]

    resolvedTheme[colorPath] = color
    resolvedTheme[lightPath] = firstResolvedThemeValue(
      resolvedTheme,
      ...STATUS_LIGHT_FALLBACK_PATHS[token]
    ) || deriveTranslucentColor(color, 0.15)
  }

  for (const token of THEME_NEUTRAL_COLOR_TOKENS) {
    const path = `neutral.${token}`
    resolvedTheme[path] = firstResolvedThemeValue(
      resolvedTheme,
      ...NEUTRAL_COLOR_FALLBACK_PATHS[token]
    ) || NEUTRAL_COLOR_DEFAULTS[token]
  }
}

export function resolveThemeColorSemantics(
  resolvedTheme: Record<string, string>
): ResolvedThemeColorSemantics {
  const normalizedTheme = { ...resolvedTheme }
  applyThemeColorSemantics(normalizedTheme)

  return {
    primary: normalizedTheme.primary,
    status: Object.fromEntries(
      THEME_STATUS_COLOR_TOKENS.map(token => [token, normalizedTheme[`color.${token}`]])
    ) as Record<ThemeStatusColorToken, string>,
    neutral: Object.fromEntries(
      THEME_NEUTRAL_COLOR_TOKENS.map(token => [token, normalizedTheme[`neutral.${token}`]])
    ) as Record<ThemeNeutralColorToken, string>,
  }
}

/**
 * Resolve all colors in a theme for a specific mode
 * @param theme - The theme to resolve
 * @param mode - "dark" or "light"
 * @returns Flat map of theme property path -> resolved color string
 */
export function resolveTheme(
  theme: Theme,
  mode: 'dark' | 'light'
): Record<string, string> {
  const resolved: Record<string, string> = {}
  const resolvedMap = new Map<string, ResolvedColorValue>()
  const defs = { ...(theme.defs || {}) }

  // Flatten the theme colors to dot-notation
  const flatColors = flattenObject(theme.theme as unknown as Record<string, any>)
  const explicitPrimary = flatColors.primary
  if (
    explicitPrimary !== undefined &&
    !(typeof explicitPrimary === 'string' && (explicitPrimary === 'accent' || explicitPrimary === 'accentMain'))
  ) {
    defs.primary = explicitPrimary
    defs.accent = explicitPrimary
    defs.accentMain = explicitPrimary
    flatColors.accent = explicitPrimary
    flatColors.accentMain = explicitPrimary
  }

  // Resolve each color
  for (const [path, value] of Object.entries(flatColors)) {
    const resolvedValue = resolveColorValue(value, defs, resolvedMap, new Set())

    let finalValue: string
    if (typeof resolvedValue === 'object' && 'dark' in resolvedValue) {
      finalValue = resolvedValue[mode]
    } else {
      finalValue = resolvedValue
    }

    resolved[path] = finalValue
    resolvedMap.set(path, resolvedValue)

    // Also store by last segment for reference lookups (e.g., "accent" from "theme.accent")
    const lastSegment = path.split('.').pop()
    if (lastSegment && !resolvedMap.has(lastSegment)) {
      resolvedMap.set(lastSegment, resolvedValue)
    }
  }

  // Ensure accentLight is defined (used by buttons and gradients)
  // Falls back to accentSub if not explicitly defined in the theme
  if (!resolved['accentLight']) {
    resolved['accentLight'] = resolved['accentSub'] || resolved['accent'] || '#4385BE'
  }

  applyThemeColorSemantics(resolved)

  return resolved
}

function isSemanticHighlightToken(value: string): value is SemanticHighlightToken {
  return SEMANTIC_HIGHLIGHT_TOKEN_SET.has(value)
}

function isHighlightLink(value: ThemeHighlightGroup): value is { link: string } {
  return typeof value === 'object' && value !== null && 'link' in value
}

function buildResolvedMap(resolvedTheme: Record<string, string>): Map<string, ResolvedColorValue> {
  const resolvedMap = new Map<string, ResolvedColorValue>()
  for (const [path, value] of Object.entries(resolvedTheme)) {
    resolvedMap.set(path, value)
    const lastSegment = path.split('.').pop()
    if (lastSegment && !resolvedMap.has(lastSegment)) {
      resolvedMap.set(lastSegment, value)
    }
  }
  return resolvedMap
}

function selectModeValue(value: ResolvedColorValue, mode: 'dark' | 'light'): string {
  return typeof value === 'object' && 'dark' in value ? value[mode] : value
}

function resolveHighlightColor(
  value: ColorValue | undefined,
  defs: ThemeDefs,
  resolvedMap: Map<string, ResolvedColorValue>,
  mode: 'dark' | 'light'
): string | undefined {
  if (value === undefined) return undefined
  const resolvedValue = resolveColorValue(value, defs, resolvedMap, new Set())
  return selectModeValue(resolvedValue, mode)
}

function normalizeHighlightFontStyle(value: HighlightFontStyle | undefined): HighlightFontStyle | undefined {
  if (!value) return undefined
  if (VALID_HIGHLIGHT_FONT_STYLES.has(value)) return value
  console.warn(`[ThemeResolver] Unknown highlight fontStyle: ${value}`)
  return undefined
}

function resolveHighlightStyle(
  style: HighlightStyle,
  defs: ThemeDefs,
  resolvedMap: Map<string, ResolvedColorValue>,
  mode: 'dark' | 'light'
): ResolvedHighlightStyle {
  return {
    fg: resolveHighlightColor(style.fg, defs, resolvedMap, mode),
    bg: resolveHighlightColor(style.bg, defs, resolvedMap, mode),
    fontStyle: normalizeHighlightFontStyle(style.fontStyle),
  }
}

function mergeHighlightStyle(
  base: ResolvedHighlightStyle,
  override: ResolvedHighlightStyle
): ResolvedHighlightStyle {
  return {
    fg: override.fg ?? base.fg,
    bg: override.bg ?? base.bg,
    fontStyle: override.fontStyle ?? base.fontStyle,
  }
}

function getResolvedThemeValue(
  resolvedTheme: Record<string, string>,
  ...paths: string[]
): string | undefined {
  for (const path of paths) {
    const value = resolvedTheme[path]
    if (value !== undefined) return value
  }
  return undefined
}

function deriveLightSurface(base: string, primaryText: string | undefined, strength: number): string {
  return mixCssColors(primaryText, base, strength) || base
}

function fallbackUIStyle(
  resolvedTheme: Record<string, string>,
  token: SemanticUIToken,
  surfaceRoles: ThemeSurfaceRoles,
  mode: 'dark' | 'light'
): ResolvedUIStyle {
  const get = (...paths: string[]) => getResolvedThemeValue(resolvedTheme, ...paths)

  switch (token) {
    case 'ui.accent.primary':
      return { fg: get('accentMain', 'accent') }
    case 'ui.accent.subtle':
      return { fg: get('accentSub', 'accentLight', 'accent') }
    case 'ui.surface.app':
      return { bg: surfaceRoles.appBg }
    case 'ui.surface.sidebar':
      return { bg: surfaceRoles.sidebarBg }
    case 'ui.surface.chat':
      return { bg: surfaceRoles.chatBg }
    case 'ui.surface.panel':
      return { bg: surfaceRoles.panelBg }
    case 'ui.surface.elevated':
      return {
        bg: surfaceRoles.elevatedBg,
        shadow: get('shadow.elevated', 'shadow.md', 'shadow.sm'),
      }
    case 'ui.surface.floating':
      return {
        bg: surfaceRoles.floatingBg,
        shadow: get('shadow.floating', 'shadow.lg', 'shadow.md'),
      }
    case 'ui.surface.overlay':
      return { bg: get('bg.modalOverlay', 'effects.overlayActive') }
    case 'ui.surface.menu':
      return { bg: get('bg.menu') || surfaceRoles.floatingBg }
    case 'ui.surface.menuHover':
      return {
        bg: mode === 'light'
          ? rgbaFromCssColor(get('accentMain', 'accent'), 0.12)
          : get('bg.menuItemHover', 'bg.hover'),
      }
    case 'ui.surface.input':
      return {
        bg: get('bg.input') || surfaceRoles.panelBg,
        border: get('border.input', 'border.default'),
      }
    case 'ui.surface.inputFocus':
      return {
        bg: get('bg.inputFocus', 'bg.input') || surfaceRoles.elevatedBg,
        border: get('border.inputFocus', 'border.accent', 'accent'),
        ring: get('border.inputFocus', 'border.accent', 'accent'),
      }
    case 'ui.surface.codeInline':
      return {
        bg: get('bg.code.inline') || (surfaceRoles.elevatedBg),
        fg: get('text.code.inline', 'text.primary'),
        border: get('border.code', 'border.subtle'),
      }
    case 'ui.surface.codeBlock':
      return {
        bg: mode === 'light'
          ? deriveLightSurface(surfaceRoles.chatBg, get('text.primary'), 0.035)
          : (get('bg.code.block') || surfaceRoles.panelBg),
        fg: get('text.code.block', 'text.primary'),
        border: get('border.code', 'border.subtle'),
      }
    case 'ui.surface.codeHeader':
      return {
        bg: mode === 'light'
          ? deriveLightSurface(surfaceRoles.chatBg, get('text.primary'), 0.055)
          : (get('bg.code.header') || surfaceRoles.elevatedBg),
      }
    case 'ui.surface.tooltip':
      {
        const bg = get('bg.tooltip') || surfaceRoles.floatingBg
        return {
          bg,
          fg: readableAgainst(bg, [
            get('text.tooltip'),
            get('text.btn.primary'),
            surfaceRoles.appBg,
            surfaceRoles.panelBg,
            get('text.primary'),
            get('text.secondary'),
          ], get('text.primary'), 4.5),
          border: get('border.strong', 'border.default'),
          shadow: get('shadow.floating', 'shadow.lg', 'shadow.md'),
        }
      }
    case 'ui.surface.modal':
      return {
        bg: get('bg.modal') || surfaceRoles.floatingBg,
        fg: get('text.modalBody', 'text.primary'),
        border: get('border.default'),
        shadow: get('shadow.floating', 'shadow.xl', 'shadow.lg'),
      }
    case 'ui.surface.note':
      return {
        bg: get('color.warningLight') || surfaceRoles.elevatedBg,
        fg: get('text.primary'),
        border: get('border.warning', 'border.subtle', 'border.default'),
      }
    case 'ui.surface.previewLight':
      return { bg: '#ffffff', fg: '#111827', border: '#e5e7eb' }
    case 'ui.surface.previewDark':
      return { bg: '#0f1117', fg: '#f9fafb', border: '#1f2937' }
    case 'ui.text.primary':
      return { fg: get('text.primary') }
    case 'ui.text.secondary':
      return { fg: get('text.secondary', 'text.primary') }
    case 'ui.text.muted':
      return { fg: get('text.muted', 'text.secondary', 'text.primary') }
    case 'ui.text.faint':
      return { fg: get('text.faint', 'text.muted', 'text.secondary') }
    case 'ui.text.inverse':
      return { fg: get('text.btn.primary', 'bg.app', 'text.primary') }
    case 'ui.text.placeholder':
      return { fg: get('text.inputPlaceholder', 'text.muted') }
    case 'ui.text.disabled':
      return { fg: get('text.inputDisabled', 'text.btn.disabled', 'text.faint', 'text.muted') }
    case 'ui.text.link':
      return { fg: get('text.link', 'color.info', 'accent') }
    case 'ui.text.linkHover':
      return { fg: get('text.linkHover', 'text.link', 'color.info', 'accent') }
    case 'ui.border.default':
      return { border: get('border.default') }
    case 'ui.border.subtle':
      return { border: get('border.subtle', 'border.default') }
    case 'ui.border.strong':
      return { border: get('border.strong', 'border.default') }
    case 'ui.border.divider':
      return { border: get('border.divider', 'border.subtle', 'border.default') }
    case 'ui.border.focus':
      return { border: get('border.inputFocus', 'border.accent', 'accent'), ring: get('border.inputFocus', 'accent') }
    case 'ui.border.selected':
      return { border: get('border.accent', 'border.inputFocus', 'accent') }
    case 'ui.action.primary':
      return {
        bg: get('bg.btn.primary', 'accent'),
        fg: get('text.btn.primary', 'bg.app'),
        border: get('border.accent', 'accent'),
      }
    case 'ui.action.primaryHover':
      return {
        bg: get('bg.btn.primaryHover', 'accentLight', 'accentSub', 'bg.btn.primary', 'accent'),
        fg: get('text.btn.primary', 'bg.app'),
        border: get('border.accent', 'accent'),
      }
    case 'ui.action.secondary':
      return {
        bg: get('bg.btn.secondary') || surfaceRoles.elevatedBg,
        fg: get('text.btn.secondary', 'text.primary'),
        border: get('border.subtle', 'border.default'),
      }
    case 'ui.action.secondaryHover':
      return {
        bg: get('bg.btn.secondaryHover', 'bg.btn.secondary', 'bg.hover'),
        fg: get('text.btn.secondary', 'text.primary'),
        border: get('border.default', 'border.subtle'),
      }
    case 'ui.action.ghost':
      return {
        bg: get('bg.btn.ghost') || 'transparent',
        fg: get('text.btn.ghost', 'text.primary'),
        border: 'transparent',
      }
    case 'ui.action.ghostHover':
      return {
        bg: get('bg.btn.ghostHover', 'bg.hover'),
        fg: get('text.btn.ghost', 'text.primary'),
        border: 'transparent',
      }
    case 'ui.action.danger':
      return {
        bg: get('bg.btn.danger', 'color.danger'),
        fg: get('text.btn.danger', 'bg.app'),
        border: get('border.error', 'color.danger'),
      }
    case 'ui.action.dangerHover':
      return {
        bg: get('bg.btn.dangerHover', 'bg.btn.danger', 'color.danger'),
        fg: get('text.btn.danger', 'bg.app'),
        border: get('border.error', 'color.danger'),
      }
    case 'ui.action.disabled':
      return {
        bg: get('bg.inputDisabled', 'effects.overlayDisabled', 'bg.hover'),
        fg: get('text.btn.disabled', 'text.inputDisabled', 'text.faint'),
        border: get('border.subtle', 'border.default'),
      }
    case 'ui.state.hover':
      return { bg: get('bg.hover', 'effects.overlayHover') }
    case 'ui.state.active':
      return { bg: get('bg.active', 'effects.overlayActive') }
    case 'ui.state.selected':
      return {
        bg: get('bg.selected'),
        fg: get('text.primary'),
        border: get('border.accent', 'accent'),
      }
    case 'ui.state.selectedHover':
      return {
        bg: get('bg.selectedHover', 'bg.selected'),
        fg: get('text.primary'),
        border: get('border.accent', 'accent'),
      }
    case 'ui.state.highlight':
      return { bg: get('bg.highlight', 'accentSub') }
    case 'ui.state.focus':
      return {
        border: get('border.inputFocus', 'border.accent', 'accent'),
        ring: get('border.inputFocus', 'border.accent', 'accent'),
      }
    case 'ui.state.disabled':
      return {
        bg: get('bg.inputDisabled', 'effects.overlayDisabled'),
        fg: get('text.inputDisabled', 'text.btn.disabled', 'text.faint'),
        border: get('border.subtle', 'border.default'),
      }
    case 'ui.sidebar.surface':
      {
        const bg = surfaceRoles.sidebarBg
        return {
          bg,
          fg: readableAgainst(bg, [
            get('text.sidebar.item'),
            get('text.secondary'),
            get('text.primary'),
          ], get('text.primary'), 4.5),
          border: get('border.divider', 'border.subtle', 'border.default'),
        }
      }
    case 'ui.sidebar.item':
      {
        const bg = surfaceRoles.sidebarBg
        return {
          fg: readableAgainst(bg, [
            get('text.sidebar.item'),
            get('text.secondary'),
            get('text.primary'),
          ], get('text.primary'), 4.5),
        }
      }
    case 'ui.sidebar.itemHover':
      {
        const bg = surfaceRoles.sidebarBg
        return {
          bg: get('bg.hover', 'effects.overlayHover'),
          fg: readableAgainst(bg, [
            get('text.sidebar.itemHover'),
            get('text.primary'),
            get('text.sidebar.item'),
            get('text.secondary'),
          ], get('text.primary'), 4.5),
        }
      }
    case 'ui.sidebar.itemActive':
      {
        const bg = surfaceRoles.sidebarBg
        const activeBg = get('bg.selected')
        const activeSurface = colorToRgbString(resolveColorOverBackground(activeBg, bg)) || activeBg || bg
        return {
          bg: activeBg,
          fg: readableAgainst(activeSurface, [
            get('text.primary'),
            get('text.sidebar.itemActive'),
            get('text.sidebar.itemHover'),
            get('text.secondary'),
          ], get('text.primary'), 4.5),
          border: get('border.accent', 'accent'),
        }
      }
    case 'ui.sidebar.itemMuted':
      {
        const bg = surfaceRoles.sidebarBg
        return {
          fg: readableAgainst(bg, [
            get('text.sidebar.muted'),
            get('text.sidebar.count'),
            get('text.muted'),
            get('text.secondary'),
            get('text.primary'),
          ], get('text.secondary', 'text.primary'), 3.5),
        }
      }
    case 'ui.sidebar.header':
      {
        const bg = surfaceRoles.sidebarBg
        return {
          fg: readableAgainst(bg, [
            get('text.sidebar.title'),
            get('text.faint'),
            get('text.muted'),
            get('text.secondary'),
            get('text.primary'),
          ], get('text.secondary', 'text.primary'), 3.5),
        }
      }
    case 'ui.sidebar.action':
      {
        const bg = surfaceRoles.sidebarBg
        return {
          fg: readableAgainst(bg, [
            get('text.sidebar.item'),
            get('text.secondary'),
            get('text.primary'),
          ], get('text.secondary', 'text.primary'), 3.5),
          bg: 'transparent',
        }
      }
    case 'ui.sidebar.actionHover':
      {
        const bg = surfaceRoles.sidebarBg
        return {
          bg: get('bg.hover', 'effects.overlayHover'),
          fg: readableAgainst(bg, [
            get('text.sidebar.itemHover'),
            get('text.primary'),
            get('text.sidebar.item'),
            get('text.secondary'),
          ], get('text.primary'), 4.5),
        }
      }
    case 'ui.sidebar.border':
      return { border: get('border.divider', 'border.subtle', 'border.default') }
    case 'ui.tabBar.surface':
      return {
        bg: surfaceRoles.tabBarBg,
        border: get('border.divider', 'border.subtle', 'border.default'),
        shadow: 'none',
      }
    case 'ui.tabBar.divider':
      return { border: 'color-mix(in srgb, var(--ui-border-subtle-border, var(--border-subtle, var(--border))) 70%, var(--ui-text-muted-fg, var(--muted)))' }
    case 'ui.tabBar.item':
      {
        const bg = surfaceRoles.tabBarBg
        return {
          fg: readableAgainst(bg, [
            get('text.muted'),
            get('text.secondary'),
            get('text.primary'),
          ], get('text.secondary', 'text.primary'), 3.5),
        }
      }
    case 'ui.tabBar.itemHover':
      {
        const bg = surfaceRoles.tabBarBg
        return {
          bg: get('bg.hover', 'effects.overlayHover'),
          fg: readableAgainst(bg, [
            get('text.primary'),
            get('text.secondary'),
          ], get('text.primary'), 4.5),
        }
      }
    case 'ui.tabBar.itemActive':
      {
        const activeBg = get('bg.selected') || surfaceRoles.elevatedBg
        return {
          bg: activeBg,
          fg: readableAgainst(colorToRgbString(resolveColorOverBackground(activeBg, surfaceRoles.tabBarBg)) || activeBg, [
            get('text.primary'),
            get('text.sidebar.itemActive'),
            get('text.secondary'),
            get('text.btn.secondary'),
            '#F9FAFB',
            '#111827',
          ], get('text.primary'), 4.5),
          border: 'transparent',
        }
      }
    case 'ui.tabBar.action':
      {
        const bg = surfaceRoles.tabBarBg
        return {
          fg: readableAgainst(bg, [
            get('text.muted'),
            get('text.secondary'),
            get('text.primary'),
          ], get('text.secondary', 'text.primary'), 3.5),
        }
      }
    case 'ui.tabBar.actionHover':
      {
        const bg = surfaceRoles.elevatedBg
        return {
          bg,
          fg: readableAgainst(bg, [
            get('text.primary'),
            get('text.secondary'),
          ], get('text.primary'), 4.5),
          border: get('border.subtle', 'border.default'),
        }
      }
    case 'ui.tabBar.danger':
      return {
        bg: 'color-mix(in srgb, var(--ui-status-danger-fg, var(--color-danger)) 15%, transparent)',
        fg: get('text.error', 'color.danger'),
      }
    case 'ui.status.danger':
      return {
        fg: get('text.error', 'color.danger'),
        bg: get('color.dangerLight', 'bg.message.error'),
        border: get('border.error', 'color.danger'),
      }
    case 'ui.status.warning':
      return {
        fg: get('text.warning', 'color.warning'),
        bg: get('color.warningLight'),
        border: get('border.warning', 'color.warning'),
      }
    case 'ui.status.success':
      return {
        fg: get('text.success', 'color.success'),
        bg: get('color.successLight'),
        border: get('border.success', 'color.success'),
      }
    case 'ui.status.info':
      return {
        fg: get('text.info', 'color.info'),
        bg: get('color.infoLight'),
        border: get('border.accent', 'color.info', 'accent'),
      }
    case 'ui.message.user':
      return {
        bg: get('bg.message.user', 'bg.message.userSolid'),
        fg: get('text.user.primary', 'text.primary'),
        border: get('border.messageUser', 'border.message', 'border.subtle'),
      }
    case 'ui.message.userSolid':
      return {
        bg: get('bg.message.userSolid', 'bg.message.user'),
        fg: get('text.user.primary', 'text.primary'),
        border: get('border.messageUser', 'border.message', 'border.subtle'),
      }
    case 'ui.message.assistant':
      {
        const bg = get('bg.message.ai') || 'transparent'
        const surface = bg === 'transparent'
          ? surfaceRoles.chatBg
          : (colorToRgbString(resolveColorOverBackground(bg, surfaceRoles.chatBg)) || surfaceRoles.chatBg)
        return {
          bg,
          fg: readableAgainst(surface, [
            get('text.ai.primary'),
            get('text.primary'),
            get('text.secondary'),
          ], get('text.primary'), 4.5),
          border: get('border.message', 'border.subtle'),
        }
      }
    case 'ui.message.system':
      return {
        bg: get('bg.message.system', 'bg.panel'),
        fg: get('text.system', 'text.secondary', 'text.primary'),
        border: get('border.message', 'border.subtle'),
      }
    case 'ui.message.error':
      return {
        bg: get('bg.message.error', 'color.dangerLight'),
        fg: get('text.error', 'color.danger'),
        border: get('border.error', 'color.danger'),
      }
    case 'ui.message.hover':
      return { bg: get('bg.message.hover', 'bg.hover') }
    case 'ui.message.thinking':
      return { fg: get('text.ai.thinking', 'text.muted') }
    case 'ui.tool.surface':
      return {
        bg: get('bg.toolCall', 'bg.panel'),
        fg: get('text.primary'),
        border: get('border.subtle', 'border.default'),
      }
    case 'ui.tool.surfaceHover':
      return {
        bg: get('bg.toolCallHover', 'bg.toolCall', 'bg.hover'),
        fg: get('text.primary'),
        border: get('border.default', 'border.subtle'),
      }
    case 'ui.tool.surfaceSubtle':
      return {
        bg: 'color-mix(in srgb, var(--ui-tool-text-fg, var(--tool-ink)) 6%, var(--ui-tool-surface-bg, var(--bg-tool-call)))',
      }
    case 'ui.tool.result':
      return {
        bg: get('bg.toolResult', 'bg.toolCall', 'bg.panel'),
        fg: get('text.tool.result', 'text.primary'),
      }
    case 'ui.tool.error':
      return {
        bg: get('bg.toolError', 'color.dangerLight', 'bg.message.error'),
        fg: get('text.tool.error', 'text.error', 'color.danger'),
        border: get('border.error', 'color.danger'),
      }
    case 'ui.tool.success':
      return {
        bg: get('bg.toolSuccess', 'color.successLight'),
        fg: get('text.success', 'color.success'),
        border: get('border.success', 'color.success'),
      }
    case 'ui.tool.text':
      {
        const bg = get('bg.toolCall', 'bg.panel')
        return {
          fg: readableAgainst(bg, [
            get('text.tool.name'),
            get('text.primary'),
            get('text.secondary'),
          ], get('text.primary'), 4.5),
        }
      }
    case 'ui.tool.textMuted':
      {
        const bg = get('bg.toolCall', 'bg.panel')
        return {
          fg: readableAgainst(bg, [
            get('text.tool.args'),
            get('text.muted'),
            get('text.secondary'),
            get('text.primary'),
          ], get('text.secondary', 'text.primary'), 3.5),
        }
      }
    case 'ui.tool.textFaint':
      {
        const bg = get('bg.toolCall', 'bg.panel')
        return {
          fg: readableAgainst(bg, [
            get('text.tool.label'),
            get('text.faint'),
            get('text.muted'),
            get('text.secondary'),
            get('text.primary'),
          ], get('text.secondary', 'text.primary'), 3),
        }
      }
    case 'ui.tool.accent':
      return { fg: get('accent') }
    case 'ui.tool.accentOn':
      return { fg: get('bg.app', 'text.btn.primary') }
    case 'ui.tool.successText':
      return { fg: get('color.success', 'text.success') }
    case 'ui.tool.dangerText':
      return { fg: get('color.danger', 'text.error') }
    case 'ui.tool.border':
      return { border: get('border.subtle', 'border.default') }
    case 'ui.editor.text':
      return {
        fg: get('text.input', 'text.primary'),
        bg: get('bg.input', 'bg.panel'),
        border: get('border.input', 'border.default'),
      }
    case 'ui.editor.placeholder':
      {
        const bg = get('bg.input', 'bg.panel')
        return {
          fg: readableAgainst(bg, [
            get('text.inputPlaceholder'),
            get('text.muted'),
            get('text.secondary'),
            get('text.primary'),
          ], get('text.secondary', 'text.primary'), 3.5),
        }
      }
    case 'ui.editor.caret':
      return { fg: get('text.input', 'text.primary') }
    case 'ui.editor.selection':
      return {
        bg: get('bg.selected'),
        fg: get('text.primary'),
      }
  }
}

function fallbackHighlightStyle(theme: Theme, token: SemanticHighlightToken): HighlightStyle {
  const text = theme.theme.text
  const code = text.code || {}
  const semantic = theme.theme.color || {}

  switch (token) {
    case 'syntax.plain':
      return { fg: code.block || text.primary }
    case 'syntax.comment':
      return { fg: code.comment || text.muted || code.block || text.primary, fontStyle: 'italic' }
    case 'syntax.keyword':
      return { fg: code.keyword || code.block || text.primary }
    case 'syntax.atom':
      return { fg: code.keyword || code.number || code.block || text.primary }
    case 'syntax.string':
      return { fg: code.string || code.block || text.primary }
    case 'syntax.number':
      return { fg: code.number || code.block || text.primary }
    case 'syntax.function':
      return { fg: code.function || code.block || text.primary }
    case 'syntax.definition':
      return { fg: code.function || code.variable || code.block || text.primary }
    case 'syntax.variable':
      return { fg: code.variable || code.block || text.primary }
    case 'syntax.property':
      return { fg: code.property || code.variable || code.block || text.primary }
    case 'syntax.type':
      return { fg: code.type || code.variable || code.block || text.primary }
    case 'syntax.tag':
      return { fg: code.type || code.keyword || code.block || text.primary }
    case 'syntax.operator':
      return { fg: code.operator || code.block || text.primary }
    case 'syntax.punctuation':
      return { fg: code.punctuation || code.operator || code.block || text.primary }
    case 'syntax.invalid':
      return { fg: text.error || semantic.danger || code.block || text.primary }
    case 'syntax.inserted':
      return { fg: text.success || semantic.success || code.string || code.block || text.primary }
    case 'syntax.deleted':
      return { fg: text.error || semantic.danger || code.block || text.primary }
    case 'syntax.heading':
      return { fg: code.function || text.primary, fontStyle: 'bold' }
    case 'syntax.link':
      return { fg: text.link || code.function || text.primary, fontStyle: 'underline' }
    case 'syntax.emphasis':
      return { fg: code.block || text.primary, fontStyle: 'italic' }
    case 'syntax.strong':
      return { fg: code.block || text.primary, fontStyle: 'bold' }
  }
}

function readableSyntaxColor(
  color: string | undefined,
  background: string,
  primaryText: string | undefined,
  minimumContrast: number
): string | undefined {
  if (!color || colorMeetsContrast(color, background, minimumContrast)) return color
  if (!primaryText) return color

  for (let weight = 0.14; weight <= 0.58; weight += 0.04) {
    const mixed = mixCssColors(primaryText, color, weight)
    if (mixed && colorMeetsContrast(mixed, background, minimumContrast)) return mixed
  }

  return color
}

function ensureLightHighlightContrast(
  styles: Map<SemanticHighlightToken, ResolvedHighlightStyle>,
  resolvedTheme: Record<string, string>,
  codeBlockBg: string
): void {
  const primaryText = resolvedTheme['text.primary']
  const minimumByToken: Partial<Record<SemanticHighlightToken, number>> = {
    'syntax.plain': 4.5,
    'syntax.comment': 3.5,
    'syntax.keyword': 4,
    'syntax.atom': 4,
    'syntax.string': 3.5,
    'syntax.number': 4,
    'syntax.function': 4,
    'syntax.definition': 4,
    'syntax.variable': 4,
    'syntax.property': 4,
    'syntax.type': 4,
    'syntax.tag': 4,
    'syntax.operator': 3.5,
    'syntax.punctuation': 3.5,
  }

  for (const [token, minimumContrast] of Object.entries(minimumByToken) as Array<[SemanticHighlightToken, number]>) {
    const style = styles.get(token)
    if (!style?.fg) continue
    styles.set(token, {
      ...style,
      fg: readableSyntaxColor(style.fg, codeBlockBg, primaryText, minimumContrast),
    })
  }
}

/**
 * Resolve app-level highlight groups from a theme. Themes without `highlights`
 * are upgraded from `theme.text.code.*` so old JSON files continue to work.
 */
export function resolveThemeHighlights(
  theme: Theme,
  mode: 'dark' | 'light',
  resolvedTheme: Record<string, string> = resolveTheme(theme, mode)
): Record<SemanticHighlightToken, ResolvedHighlightStyle> {
  const defs = theme.defs || {}
  const resolvedMap = buildResolvedMap(resolvedTheme)
  const styles = new Map<SemanticHighlightToken, ResolvedHighlightStyle>()
  const highlights = theme.highlights
  const groups = highlights?.groups || {}
  const aliases = {
    ...DEFAULT_HIGHLIGHT_ALIASES,
    ...(highlights?.aliases || {}),
  }

  for (const token of SEMANTIC_HIGHLIGHT_TOKENS) {
    styles.set(token, resolveHighlightStyle(fallbackHighlightStyle(theme, token), defs, resolvedMap, mode))
  }

  for (const [token, style] of Object.entries(highlights?.semanticTokens || {})) {
    if (!isSemanticHighlightToken(token)) {
      console.warn(`[ThemeResolver] Unknown semantic highlight token: ${token}`)
      continue
    }
    styles.set(token, mergeHighlightStyle(
      styles.get(token) || {},
      resolveHighlightStyle(style, defs, resolvedMap, mode)
    ))
  }

  const resolveSemanticTarget = (
    name: string,
    visited: Set<string> = new Set()
  ): SemanticHighlightToken | null => {
    if (isSemanticHighlightToken(name)) return name
    if (visited.has(name)) {
      console.warn(`[ThemeResolver] Circular highlight alias detected: ${name}`)
      return null
    }
    visited.add(name)

    const aliasTarget = aliases[name]
    if (aliasTarget) {
      return resolveSemanticTarget(aliasTarget, visited)
    }

    const group = groups[name]
    if (group && isHighlightLink(group)) {
      return resolveSemanticTarget(group.link, visited)
    }

    return null
  }

  const resolveGroupDefinition = (
    name: string,
    visited: Set<string> = new Set()
  ): ResolvedHighlightStyle | null => {
    if (visited.has(name)) {
      console.warn(`[ThemeResolver] Circular highlight group link detected: ${name}`)
      return null
    }
    visited.add(name)

    const group = groups[name]
    if (!group) {
      if (isSemanticHighlightToken(name)) return styles.get(name) || null
      const aliasTarget = aliases[name]
      return aliasTarget ? resolveGroupDefinition(aliasTarget, visited) : null
    }

    if (isHighlightLink(group)) {
      return resolveGroupDefinition(group.link, visited)
    }

    return resolveHighlightStyle(group, defs, resolvedMap, mode)
  }

  for (const token of SEMANTIC_HIGHLIGHT_TOKENS) {
    if (!groups[token]) continue
    const groupStyle = resolveGroupDefinition(token)
    if (groupStyle) {
      styles.set(token, mergeHighlightStyle(styles.get(token) || {}, groupStyle))
    }
  }

  for (const [groupName, targetName] of Object.entries(aliases)) {
    if (!groups[groupName]) continue
    const token = resolveSemanticTarget(targetName)
    if (!token) {
      console.warn(`[ThemeResolver] Unknown highlight alias target: ${groupName} -> ${targetName}`)
      continue
    }
    const groupStyle = resolveGroupDefinition(groupName)
    if (groupStyle) {
      styles.set(token, mergeHighlightStyle(styles.get(token) || {}, groupStyle))
    }
  }

  if (mode === 'light') {
    const surfaceRoles = deriveSurfaceRoles({
      colorScheme: mode,
      app: resolvedTheme['bg.app'],
      sidebar: resolvedTheme['bg.sidebar'],
      chat: resolvedTheme['bg.chat'],
      panel: resolvedTheme['bg.panel'],
      elevated: resolvedTheme['bg.elevated'],
      floating: resolvedTheme['bg.floating'],
      primaryText: resolvedTheme['text.primary'],
    })
    ensureLightHighlightContrast(
      styles,
      resolvedTheme,
      deriveLightSurface(surfaceRoles.chatBg, resolvedTheme['text.primary'], 0.035)
    )
  }

  return Object.fromEntries(
    SEMANTIC_HIGHLIGHT_TOKENS.map(token => [token, styles.get(token) || {}])
  ) as Record<SemanticHighlightToken, ResolvedHighlightStyle>
}

/**
 * Resolve app UI semantic tokens from the shared role mapping. `theme.ui` is
 * intentionally not applied here: product chrome should be derived from the
 * same role contract for every theme instead of per-theme semantic overrides.
 */
export function resolveThemeUI(
  theme: Theme,
  mode: 'dark' | 'light',
  resolvedTheme: Record<string, string> = resolveTheme(theme, mode)
): Record<SemanticUIToken, ResolvedUIStyle> {
  const styles = new Map<SemanticUIToken, ResolvedUIStyle>()
  const surfaceRoles = deriveSurfaceRoles({
    colorScheme: mode,
    app: resolvedTheme['bg.app'],
    sidebar: resolvedTheme['bg.sidebar'],
    chat: resolvedTheme['bg.chat'],
    panel: resolvedTheme['bg.panel'],
    elevated: resolvedTheme['bg.elevated'],
    floating: resolvedTheme['bg.floating'],
    primaryText: resolvedTheme['text.primary'],
  })

  for (const token of SEMANTIC_UI_TOKENS) {
    styles.set(token, fallbackUIStyle(resolvedTheme, token, surfaceRoles, mode))
  }

  return Object.fromEntries(
    SEMANTIC_UI_TOKENS.map(token => [token, styles.get(token) || {}])
  ) as Record<SemanticUIToken, ResolvedUIStyle>
}

/**
 * Extract preview colors from a theme (for theme list thumbnails)
 * Returns colors for the preview card in theme selector
 */
export function extractPreviewColors(theme: Theme): {
  bg: string
  sidebar: string
  accent: string
  text: string
  palette: string[]
} {
  const defs = theme.defs || {}
  const mode = theme.colorScheme === 'light' ? 'light' : 'dark'
  const resolvedTheme = resolveTheme(theme, mode)
  const resolvedUI = resolveThemeUI(theme, mode, resolvedTheme)

  function resolveOptional(value: ColorValue | undefined): string | undefined {
    if (!value) return undefined

    if (typeof value === 'string') {
      if (value.startsWith('#')) return value
      if (value.startsWith('rgb')) return value
      // Try to resolve from defs
      if (defs[value]) return resolveOptional(defs[value])
      return undefined
    }

    if (typeof value === 'object' && 'dark' in value) {
      return resolveOptional(value.dark)
    }

    return undefined
  }

  function resolveSimple(value: ColorValue | undefined): string {
    return resolveOptional(value) || '#888888'
  }

  const palette: string[] = []
  const seen = new Set<string>()
  const pushSwatch = (value: ColorValue | undefined) => {
    const color = resolveOptional(value)
    if (!color || (!color.startsWith('#') && !color.startsWith('rgb'))) return
    const key = color.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    palette.push(color)
  }

  const preferredDefKeys = [
    'nord1',
    'nord2',
    'nord3',
    'nord4',
    'nord8',
    'nord9',
    'nord7',
    'nord14',
    'nord10',
    'nord15',
    'one_bg',
    'one_bg2',
    'one_bg3',
    'grey_fg',
    'white',
    'cyan',
    'blue',
    'nord_blue',
    'green',
    'yellow',
    'purple',
    'red',
    'base01',
    'base02',
    'base03',
    'base05',
    'base0C',
    'base0D',
    'base0B',
    'base0A',
    'base0E',
    'base08',
  ]

  for (const key of preferredDefKeys) {
    pushSwatch(defs[key])
    if (palette.length >= 10) break
  }

  if (palette.length < 6) {
    pushSwatch(theme.theme.bg?.sidebar)
    pushSwatch(theme.theme.bg?.panel)
    pushSwatch(theme.theme.bg?.elevated)
    pushSwatch(theme.theme.text?.primary)
    pushSwatch(theme.theme.accent)
    pushSwatch(theme.theme.text?.info)
    pushSwatch(theme.theme.text?.success)
    pushSwatch(theme.theme.text?.warning)
    pushSwatch(theme.theme.text?.error)
  }

  return {
    bg: resolvedUI['ui.surface.chat'].bg || resolveSimple(theme.theme.bg?.chat),
    sidebar: resolvedUI['ui.sidebar.surface'].bg || resolveSimple(theme.theme.bg?.sidebar),
    accent: resolvedUI['ui.accent.primary'].fg || resolveSimple(theme.theme.accent),
    text: resolvedUI['ui.text.primary'].fg || resolveSimple(theme.theme.text?.primary),
    palette: palette.slice(0, 10),
  }
}
