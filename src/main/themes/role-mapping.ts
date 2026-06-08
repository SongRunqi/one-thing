export type ThemeColorScheme = 'dark' | 'light'

export interface ParsedColor {
  red: number
  green: number
  blue: number
  alpha: number
}

export interface ThemeSurfaceRoleInput {
  colorScheme: ThemeColorScheme
  app?: string
  sidebar?: string
  chat?: string
  panel?: string
  elevated?: string
  floating?: string
  primaryText?: string
}

export interface ThemeSurfaceRoles {
  appBg: string
  sidebarBg: string
  chatBg: string
  panelBg: string
  tabBarBg: string
  elevatedBg: string
  floatingBg: string
}

export function firstDefinedColor(...candidates: Array<string | undefined>): string | undefined {
  return candidates.find(color => typeof color === 'string' && color.length > 0)
}

export function parseCssColor(value: string | undefined): ParsedColor | null {
  if (!value) return null

  const trimmed = value.trim()
  if (trimmed === 'transparent') {
    return { red: 0, green: 0, blue: 0, alpha: 0 }
  }

  const shortHexMatch = /^#([0-9a-f]{3})$/i.exec(trimmed)
  if (shortHexMatch) {
    const [, hex] = shortHexMatch
    return {
      red: Number.parseInt(hex[0] + hex[0], 16),
      green: Number.parseInt(hex[1] + hex[1], 16),
      blue: Number.parseInt(hex[2] + hex[2], 16),
      alpha: 1,
    }
  }

  const hexMatch = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(trimmed)
  if (hexMatch) {
    const [, hex, alphaHex] = hexMatch
    const numericValue = Number.parseInt(hex, 16)
    return {
      red: (numericValue >> 16) & 255,
      green: (numericValue >> 8) & 255,
      blue: numericValue & 255,
      alpha: alphaHex ? Number.parseInt(alphaHex, 16) / 255 : 1,
    }
  }

  const rgbMatch = /^rgba?\((.+)\)$/i.exec(trimmed)
  if (rgbMatch) {
    const body = rgbMatch[1].replace(/\s*\/\s*/g, ', ')
    const parts = body.includes(',')
      ? body.split(',').map(part => part.trim())
      : body.split(/\s+/)
    if (parts.length < 3) return null

    return {
      red: Number.parseFloat(parts[0]),
      green: Number.parseFloat(parts[1]),
      blue: Number.parseFloat(parts[2]),
      alpha: parts[3] === undefined ? 1 : Number.parseFloat(parts[3]),
    }
  }

  return null
}

export function compositeColor(foreground: ParsedColor, background: ParsedColor): ParsedColor {
  const alpha = foreground.alpha + background.alpha * (1 - foreground.alpha)
  if (alpha === 0) return { red: 0, green: 0, blue: 0, alpha: 0 }

  return {
    red: ((foreground.red * foreground.alpha) + (background.red * background.alpha * (1 - foreground.alpha))) / alpha,
    green: ((foreground.green * foreground.alpha) + (background.green * background.alpha * (1 - foreground.alpha))) / alpha,
    blue: ((foreground.blue * foreground.alpha) + (background.blue * background.alpha * (1 - foreground.alpha))) / alpha,
    alpha,
  }
}

export function resolveColorOverBackground(value: string | undefined, background: string | undefined): ParsedColor | null {
  const color = parseCssColor(value)
  const backgroundColor = parseCssColor(background)
  if (!color || !backgroundColor) return null
  return color.alpha < 1 ? compositeColor(color, backgroundColor) : color
}

export function colorToRgbString(color: ParsedColor | null): string | undefined {
  if (!color) return undefined
  return `rgb(${Math.round(color.red)}, ${Math.round(color.green)}, ${Math.round(color.blue)})`
}

export function colorToHex(color: ParsedColor): string {
  return `#${[color.red, color.green, color.blue]
    .map(channel => Math.round(channel).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()}`
}

export function relativeLuminance(color: ParsedColor): number {
  const [red, green, blue] = [color.red, color.green, color.blue].map(channel => {
    const normalized = channel / 255
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4
  })

  return (0.2126 * red) + (0.7152 * green) + (0.0722 * blue)
}

export function contrastRatio(foreground: ParsedColor, background: ParsedColor): number {
  const lighter = Math.max(relativeLuminance(foreground), relativeLuminance(background))
  const darker = Math.min(relativeLuminance(foreground), relativeLuminance(background))
  return (lighter + 0.05) / (darker + 0.05)
}

export function colorDistance(first: ParsedColor, second: ParsedColor): number {
  return Math.abs(first.red - second.red)
    + Math.abs(first.green - second.green)
    + Math.abs(first.blue - second.blue)
}

export function colorMeetsContrast(
  foreground: string | undefined,
  background: string | undefined,
  minContrast: number
): foreground is string {
  const foregroundColor = resolveColorOverBackground(foreground, background)
  const backgroundColor = parseCssColor(background)
  return Boolean(foregroundColor && backgroundColor && contrastRatio(foregroundColor, backgroundColor) >= minContrast)
}

export function readableAgainst(
  background: string | undefined,
  candidates: Array<string | undefined>,
  fallback: string | undefined,
  minimumContrast: number
): string | undefined {
  const backgroundColor = parseCssColor(background)
  if (!backgroundColor) {
    return candidates.find(Boolean) || fallback
  }

  let bestValue: string | undefined
  let bestContrast = -1

  for (const candidate of candidates) {
    const candidateColor = resolveColorOverBackground(candidate, background)
    if (!candidate || !candidateColor) continue

    const contrast = contrastRatio(candidateColor, backgroundColor)
    if (contrast >= minimumContrast) return candidate
    if (contrast > bestContrast) {
      bestContrast = contrast
      bestValue = candidate
    }
  }

  return bestValue || fallback || candidates.find(Boolean)
}

export function mixCssColors(
  foreground: string | undefined,
  background: string | undefined,
  foregroundWeight: number
): string | undefined {
  const foregroundColor = parseCssColor(foreground)
  const backgroundColor = parseCssColor(background)
  if (!foregroundColor || !backgroundColor) return undefined

  const weight = Math.min(1, Math.max(0, foregroundWeight))
  return colorToHex({
    red: (foregroundColor.red * weight) + (backgroundColor.red * (1 - weight)),
    green: (foregroundColor.green * weight) + (backgroundColor.green * (1 - weight)),
    blue: (foregroundColor.blue * weight) + (backgroundColor.blue * (1 - weight)),
    alpha: 1,
  })
}

export function rgbaFromCssColor(value: string | undefined, alpha: number, fallbackRgb = '67, 133, 190'): string {
  const color = parseCssColor(value)
  if (!color) return `rgba(${fallbackRgb}, ${alpha})`
  return `rgba(${Math.round(color.red)}, ${Math.round(color.green)}, ${Math.round(color.blue)}, ${alpha})`
}

export function neutralOverlay(colorScheme: ThemeColorScheme, alpha: number): string {
  return colorScheme === 'dark'
    ? `rgba(255, 255, 255, ${alpha})`
    : `rgba(0, 0, 0, ${alpha})`
}

export function readableColor(
  background: string,
  candidates: Array<string | undefined>,
  fallback: string,
  minContrast = 4.5,
  preferredWeight = 0.72
): string {
  for (const candidate of candidates) {
    if (colorMeetsContrast(candidate, background, minContrast)) return candidate
  }

  const base = firstDefinedColor(...candidates) || fallback
  for (let weight = preferredWeight; weight <= 1; weight += 0.04) {
    const mixed = mixCssColors(base, background, weight)
    if (colorMeetsContrast(mixed, background, minContrast)) return mixed
  }

  return fallback
}

function surfaceDistance(first: string | undefined, second: string | undefined): number | null {
  const firstColor = parseCssColor(first)
  const secondColor = parseCssColor(second)
  if (!firstColor || !secondColor) return null
  return colorDistance(firstColor, secondColor)
}

function surfaceLuminance(value: string | undefined): number | null {
  const color = parseCssColor(value)
  return color ? relativeLuminance(color) : null
}

function isDistinctSurface(
  candidate: string | undefined,
  base: string,
  minDistance: number
): candidate is string {
  if (!candidate) return false
  if (candidate === base) return false

  const distance = surfaceDistance(candidate, base)
  return distance === null || distance >= minDistance
}

function deriveRaisedSurface(
  base: string,
  primaryText: string,
  strength: number
): string {
  return mixCssColors(primaryText, base, strength) || base
}

function ensureDistinctSurface(
  current: string,
  base: string,
  candidates: Array<string | undefined>,
  primaryText: string,
  strength: number,
  minDistance = 8
): string {
  if (isDistinctSurface(current, base, minDistance)) return current

  for (const candidate of candidates) {
    if (isDistinctSurface(candidate, base, minDistance)) return candidate
  }

  const mixed = deriveRaisedSurface(base, primaryText, strength)
  return isDistinctSurface(mixed, base, minDistance) ? mixed : current
}

function isDistinctFromSurfaces(
  candidate: string | undefined,
  bases: string[],
  minDistance: number
): candidate is string {
  return bases.every(base => isDistinctSurface(candidate, base, minDistance))
}

function ensureDistinctSurfaceFromMany(
  current: string,
  bases: string[],
  candidates: Array<string | undefined>,
  primaryText: string,
  strength: number,
  minDistance = 6
): string {
  if (isDistinctFromSurfaces(current, bases, minDistance)) return current

  for (const candidate of candidates) {
    if (isDistinctFromSurfaces(candidate, bases, minDistance)) return candidate
  }

  const mixed = deriveRaisedSurface(current, primaryText, strength)
  return isDistinctFromSurfaces(mixed, bases, minDistance) ? mixed : current
}

function ensureSubtleSurfaceFromMany(
  current: string,
  bases: string[],
  primaryText: string,
  strength: number,
  minDistance = 4
): string {
  if (isDistinctFromSurfaces(current, bases, minDistance)) return current

  const mixed = deriveRaisedSurface(current, primaryText, strength)
  return isDistinctFromSurfaces(mixed, bases, minDistance) ? mixed : current
}

function isLightSurfaceBelow(
  candidate: string | undefined,
  base: string,
  minDistance: number,
  minLuminanceDelta = 0.006
): candidate is string {
  if (!isDistinctSurface(candidate, base, minDistance)) return false
  const candidateLuminance = surfaceLuminance(candidate)
  const baseLuminance = surfaceLuminance(base)
  if (candidateLuminance === null || baseLuminance === null) return true
  return candidateLuminance < baseLuminance - minLuminanceDelta
}

function isLightSurfaceAbove(
  candidate: string | undefined,
  base: string,
  minDistance: number,
  minLuminanceDelta = 0.006
): candidate is string {
  if (!isDistinctSurface(candidate, base, minDistance)) return false
  const candidateLuminance = surfaceLuminance(candidate)
  const baseLuminance = surfaceLuminance(base)
  if (candidateLuminance === null || baseLuminance === null) return true
  return candidateLuminance > baseLuminance + minLuminanceDelta
}

function ensureLightSidebarBelowChat(
  sidebar: string,
  chat: string,
  primaryText: string,
  minDistance = 4
): string {
  if (isLightSurfaceBelow(sidebar, chat, minDistance)) return sidebar

  const derived = deriveRaisedSurface(chat, primaryText, 0.035)
  return isLightSurfaceBelow(derived, chat, minDistance) ? derived : sidebar
}

function ensureLightChatAboveSidebar(
  chat: string,
  sidebar: string,
  minDistance = 4
): string {
  if (isLightSurfaceAbove(chat, sidebar, minDistance)) return chat

  const lifted = mixCssColors('#FFFFFF', chat, 0.04) || chat
  return isLightSurfaceAbove(lifted, sidebar, minDistance) ? lifted : chat
}

export function deriveSurfaceRoles(input: ThemeSurfaceRoleInput): ThemeSurfaceRoles {
  const defaultBg = input.colorScheme === 'dark' ? '#101010' : '#FFFFFF'
  const defaultText = input.colorScheme === 'dark' ? '#F9FAFB' : '#111827'
  const primaryText = firstDefinedColor(input.primaryText, defaultText) || defaultText

  const appBg = firstDefinedColor(input.app, input.chat, defaultBg) || defaultBg
  let sidebarBg = input.colorScheme === 'dark'
    ? appBg
    : ensureDistinctSurface(
      firstDefinedColor(input.sidebar, input.panel, input.elevated, appBg) || appBg,
      firstDefinedColor(input.chat, input.app, appBg) || appBg,
      [input.sidebar, input.panel, input.elevated, input.floating],
      primaryText,
      0.045,
      4
    )

  let chatBg = input.colorScheme === 'dark'
    ? firstDefinedColor(input.panel, input.sidebar, input.elevated, input.chat, appBg) || appBg
    : firstDefinedColor(input.chat, input.app, input.panel, input.sidebar, appBg) || appBg

  if (input.colorScheme === 'light') {
    sidebarBg = ensureLightSidebarBelowChat(sidebarBg, chatBg, primaryText)
    chatBg = ensureLightChatAboveSidebar(chatBg, sidebarBg)
  }

  chatBg = ensureDistinctSurface(
    chatBg,
    sidebarBg,
    input.colorScheme === 'dark'
      ? [input.panel, input.sidebar, input.elevated, input.floating]
      : [input.chat, input.app, input.panel, input.elevated],
    primaryText,
    input.colorScheme === 'dark' ? 0.08 : 0.055
  )

  let panelBg = firstDefinedColor(input.panel, chatBg, input.elevated, sidebarBg, appBg) || chatBg
  panelBg = input.colorScheme === 'dark'
    ? ensureDistinctSurface(
      panelBg,
      appBg,
      [input.panel, chatBg, input.elevated, input.floating],
      primaryText,
      0.08
    )
    : ensureSubtleSurfaceFromMany(
      panelBg,
      [chatBg],
      primaryText,
      0.018,
      4
    )

  let elevatedBg = firstDefinedColor(input.elevated, input.floating, panelBg) || panelBg
  elevatedBg = input.colorScheme === 'dark'
    ? ensureDistinctSurface(
      elevatedBg,
      panelBg,
      [input.elevated, input.floating],
      primaryText,
      0.075,
      6
    )
    : ensureSubtleSurfaceFromMany(
      firstDefinedColor(panelBg, input.elevated, input.floating) || panelBg,
      [chatBg, panelBg],
      primaryText,
      0.032,
      4
    )

  let floatingBg = firstDefinedColor(input.floating, elevatedBg, panelBg) || elevatedBg
  floatingBg = input.colorScheme === 'dark'
    ? ensureDistinctSurface(
      floatingBg,
      elevatedBg,
      [input.floating],
      primaryText,
      0.1,
      6
    )
    : ensureSubtleSurfaceFromMany(
      elevatedBg,
      [chatBg, panelBg, elevatedBg],
      primaryText,
      0.048,
      4
    )

  const tabBarBg = chatBg

  return {
    appBg,
    sidebarBg,
    chatBg,
    panelBg,
    tabBarBg,
    elevatedBg,
    floatingBg,
  }
}
