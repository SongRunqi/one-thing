/**
 * Theme Color Resolver
 * Recursively resolves color references from defs and theme properties
 */

import type { ColorValue, ThemeDefs, Theme, ThemeColors } from '../../shared/ipc/themes.js'

type ResolvedColorValue = string | { dark: string; light: string }

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
    value === 'transparent' ||
    value === 'inherit' ||
    value === 'currentColor' ||
    value === 'none'
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
  const defs = theme.defs || {}

  // Flatten the theme colors to dot-notation
  const flatColors = flattenObject(theme.theme as unknown as Record<string, any>)

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

  return resolved
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
} {
  const defs = theme.defs || {}

  function resolveSimple(value: ColorValue | undefined): string {
    if (!value) return '#888888'

    if (typeof value === 'string') {
      if (value.startsWith('#')) return value
      if (value.startsWith('rgb')) return value
      // Try to resolve from defs
      if (defs[value]) return resolveSimple(defs[value])
      return '#888888'
    }

    if (typeof value === 'object' && 'dark' in value) {
      return resolveSimple(value.dark)
    }

    return '#888888'
  }

  return {
    bg: resolveSimple(theme.theme.bg?.app),
    sidebar: resolveSimple(theme.theme.bg?.sidebar),
    accent: resolveSimple(theme.theme.accent),
    text: resolveSimple(theme.theme.text?.primary),
  }
}
