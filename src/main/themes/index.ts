/**
 * Theme Manager
 * Central management for themes: loading, caching, resolving, and applying
 */

import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import type { Theme, ThemeMeta, Base46Theme } from '../../shared/ipc/themes.js'
import { resolveTheme, extractPreviewColors } from './resolver.js'
import { generateCSSVariables } from './css-mapper.js'
import { parseBase46Lua, convertBase46ToTheme } from './base46-parser.js'

// Import built-in themes (using 'with' for Node.js 25+ compatibility)
import flexokiTheme from './builtin/flexoki.json' with { type: 'json' }
import draculaTheme from './builtin/dracula.json' with { type: 'json' }
import nordTheme from './builtin/nord.json' with { type: 'json' }
import tokyoNightTheme from './builtin/tokyo-night.json' with { type: 'json' }
import catppuccinTheme from './builtin/catppuccin.json' with { type: 'json' }
// New themes
import catppuccinLatteTheme from './builtin/catppuccin-latte.json' with { type: 'json' }
import solarizedLightTheme from './builtin/solarized-light.json' with { type: 'json' }
import solarizedDarkTheme from './builtin/solarized-dark.json' with { type: 'json' }
import gruvboxLightTheme from './builtin/gruvbox-light.json' with { type: 'json' }
import gruvboxDarkTheme from './builtin/gruvbox-dark.json' with { type: 'json' }
import oneLightTheme from './builtin/one-light.json' with { type: 'json' }
import oneDarkTheme from './builtin/one-dark.json' with { type: 'json' }
import githubLightTheme from './builtin/github-light.json' with { type: 'json' }
import githubDarkTheme from './builtin/github-dark.json' with { type: 'json' }
import rosePineTheme from './builtin/rose-pine.json' with { type: 'json' }

// Theme caches
const builtinThemeMap = new Map<string, Theme>()
const customThemeMap = new Map<string, Theme>()

// Default theme ID
export const DEFAULT_THEME_ID = 'flexoki'

/**
 * Get the themes directory paths
 */
function getThemeDirs(): string[] {
  const userDataPath = app.getPath('userData')
  const homePath = app.getPath('home')

  return [
    // App data themes directory
    path.join(userDataPath, 'themes'),
    // Home config directory
    path.join(homePath, '.config', 'start-electron', 'themes'),
  ]
}

/**
 * Get project-specific themes directory
 */
function getProjectThemeDir(projectPath?: string): string | null {
  if (!projectPath) return null
  return path.join(projectPath, '.start-electron', 'themes')
}

/**
 * Initialize built-in themes
 */
export function initializeThemes(): void {
  console.log('[ThemeManager] Initializing built-in themes...')

  const builtinThemes: Theme[] = [
    flexokiTheme as Theme,
    draculaTheme as Theme,
    nordTheme as Theme,
    tokyoNightTheme as Theme,
    catppuccinTheme as Theme,
    // New themes
    catppuccinLatteTheme as Theme,
    solarizedLightTheme as Theme,
    solarizedDarkTheme as Theme,
    gruvboxLightTheme as Theme,
    gruvboxDarkTheme as Theme,
    oneLightTheme as Theme,
    oneDarkTheme as Theme,
    githubLightTheme as Theme,
    githubDarkTheme as Theme,
    rosePineTheme as Theme,
  ]

  for (const theme of builtinThemes) {
    theme.source = 'builtin'
    builtinThemeMap.set(theme.id, theme)
    console.log(`[ThemeManager] Loaded built-in theme: ${theme.id}`)
  }

  console.log(`[ThemeManager] Initialized ${builtinThemeMap.size} built-in themes`)
}

/**
 * Load a single theme file (JSON or Lua)
 */
function loadThemeFile(filePath: string, source: 'user' | 'project'): Theme | null {
  try {
    const ext = path.extname(filePath).toLowerCase()
    const fileName = path.basename(filePath, ext)

    if (ext === '.json') {
      // JSON theme file
      const content = fs.readFileSync(filePath, 'utf-8')
      const theme = JSON.parse(content) as Theme

      // Validate required fields
      if (!theme.id || !theme.name || !theme.theme) {
        console.warn(`[ThemeManager] Invalid JSON theme file: ${filePath}`)
        return null
      }

      theme.source = source
      theme.filePath = filePath
      return theme

    } else if (ext === '.lua') {
      // Base46 Lua theme file
      const content = fs.readFileSync(filePath, 'utf-8')
      const base46Theme = parseBase46Lua(content)

      if (!base46Theme) {
        console.warn(`[ThemeManager] Failed to parse Base46 theme: ${filePath}`)
        return null
      }

      // Convert Base46 to our theme format
      const theme = convertBase46ToTheme(base46Theme, fileName)
      theme.source = source
      theme.filePath = filePath
      return theme
    }

    return null
  } catch (err) {
    console.error(`[ThemeManager] Failed to load theme file ${filePath}:`, err)
    return null
  }
}

/**
 * Load custom themes from filesystem
 */
export function loadCustomThemes(projectPath?: string): void {
  console.log('[ThemeManager] Loading custom themes...')
  customThemeMap.clear()

  const dirs = [
    ...getThemeDirs(),
    getProjectThemeDir(projectPath),
  ].filter((dir): dir is string => dir !== null)

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      // Create directory if it doesn't exist (for user convenience)
      try {
        fs.mkdirSync(dir, { recursive: true })
        console.log(`[ThemeManager] Created themes directory: ${dir}`)
      } catch {
        continue
      }
    }

    const source = dir.includes('.start-electron') ? 'project' : 'user'

    try {
      const files = fs.readdirSync(dir).filter(
        f => f.endsWith('.json') || f.endsWith('.lua')
      )

      for (const file of files) {
        const filePath = path.join(dir, file)
        const theme = loadThemeFile(filePath, source)

        if (theme) {
          customThemeMap.set(theme.id, theme)
          console.log(`[ThemeManager] Loaded custom theme: ${theme.id} from ${file}`)
        }
      }
    } catch (err) {
      console.error(`[ThemeManager] Failed to read themes directory ${dir}:`, err)
    }
  }

  console.log(`[ThemeManager] Loaded ${customThemeMap.size} custom themes`)
}

/**
 * Detect the color scheme support of a theme
 * Priority: explicit colorScheme > auto-detect from variants > default 'dark'
 */
function detectColorScheme(theme: Theme): 'dark' | 'light' | 'both' {
  // 1. Use explicit colorScheme if declared
  if (theme.colorScheme) {
    return theme.colorScheme
  }

  // 2. Check if bg.app has dark/light variants (most reliable indicator)
  const bgApp = theme.theme.bg?.app
  if (typeof bgApp === 'object' && bgApp !== null && 'dark' in bgApp && 'light' in bgApp) {
    return 'both'
  }

  // 3. Check if the first def value has dark/light variants
  // This catches themes like Flexoki where defs define base colors with variants
  if (theme.defs) {
    const firstDefValue = Object.values(theme.defs)[0]
    if (typeof firstDefValue === 'object' && firstDefValue !== null &&
        'dark' in firstDefValue && 'light' in firstDefValue) {
      return 'both'
    }
  }

  // Default to 'dark' - most themes are dark-first
  return 'dark'
}

/**
 * Get list of all available themes
 */
export function getThemeList(): ThemeMeta[] {
  const themes: ThemeMeta[] = []

  // Built-in themes first
  for (const theme of builtinThemeMap.values()) {
    themes.push({
      id: theme.id,
      name: theme.name,
      author: theme.author,
      type: theme.type,
      source: 'builtin',
      colorScheme: detectColorScheme(theme),
      previewColors: extractPreviewColors(theme),
    })
  }

  // Custom themes (may override built-in)
  for (const theme of customThemeMap.values()) {
    const existingIdx = themes.findIndex(t => t.id === theme.id)
    const meta: ThemeMeta = {
      id: theme.id,
      name: theme.name,
      author: theme.author,
      type: theme.type,
      source: theme.source || 'user',
      colorScheme: detectColorScheme(theme),
      previewColors: extractPreviewColors(theme),
    }

    if (existingIdx >= 0) {
      themes[existingIdx] = meta // Override built-in
    } else {
      themes.push(meta)
    }
  }

  return themes
}

/**
 * Get a specific theme by ID
 */
export function getTheme(id: string): Theme | null {
  // Check custom first (allows overriding built-in)
  if (customThemeMap.has(id)) {
    return customThemeMap.get(id)!
  }
  if (builtinThemeMap.has(id)) {
    return builtinThemeMap.get(id)!
  }
  return null
}

/**
 * Get the background color for a theme (for BrowserWindow backgroundColor)
 * This resolves the theme's bg.app color for the given mode
 */
export function getThemeBackgroundColor(
  themeId: string,
  mode: 'dark' | 'light'
): string {
  const theme = getTheme(themeId) || getTheme(DEFAULT_THEME_ID)
  if (!theme) {
    // Ultimate fallback - Flexoki colors
    return mode === 'light' ? '#FFFCF0' : '#282726'
  }

  // Resolve the background color
  const resolvedColors = resolveTheme(theme, mode)
  const bgColor = resolvedColors['bg.app'] || resolvedColors['bg.sidebar']

  // If still no color, use Flexoki defaults
  if (!bgColor) {
    return mode === 'light' ? '#FFFCF0' : '#282726'
  }

  return bgColor
}

/**
 * Apply a theme and get CSS variables
 */
export function applyTheme(
  themeId: string,
  mode: 'dark' | 'light'
): Record<string, string> {
  const theme = getTheme(themeId)
  if (!theme) {
    console.warn(`[ThemeManager] Theme not found: ${themeId}, using default`)
    const defaultTheme = getTheme(DEFAULT_THEME_ID)
    if (!defaultTheme) {
      throw new Error(`Default theme ${DEFAULT_THEME_ID} not found`)
    }
    return applyThemeInternal(defaultTheme, mode)
  }

  return applyThemeInternal(theme, mode)
}

/**
 * Internal theme application logic
 */
function applyThemeInternal(
  theme: Theme,
  mode: 'dark' | 'light'
): Record<string, string> {
  console.log(`[ThemeManager] Applying theme: ${theme.id} (${mode} mode)`)

  // Resolve all color references
  const resolvedColors = resolveTheme(theme, mode)

  // Map to CSS variables
  const cssVariables = generateCSSVariables(resolvedColors)

  console.log(`[ThemeManager] Generated ${Object.keys(cssVariables).length} CSS variables`)

  return cssVariables
}

/**
 * Get the themes folder path (for "Open Themes Folder" button)
 */
export function getThemesFolderPath(): string {
  const userDataPath = app.getPath('userData')
  const themesPath = path.join(userDataPath, 'themes')

  // Ensure directory exists
  if (!fs.existsSync(themesPath)) {
    fs.mkdirSync(themesPath, { recursive: true })
  }

  return themesPath
}

/**
 * Refresh themes (reload from filesystem)
 */
export function refreshThemes(projectPath?: string): ThemeMeta[] {
  loadCustomThemes(projectPath)
  return getThemeList()
}
