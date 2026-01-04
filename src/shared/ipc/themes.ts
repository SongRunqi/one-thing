/**
 * Theme System Type Definitions
 * Supports JSON themes, color references, dark/light variants, and Base46 import
 */

// ============================================
// Color Value Types
// ============================================

/**
 * Color value can be:
 * - Hex color: "#282A36"
 * - RGB/RGBA: "rgb(255, 255, 255)" or "rgba(255, 255, 255, 0.5)"
 * - Reference to defs: "purple" (resolves from defs section)
 * - Reference to theme colors: "accent" (resolves from other theme properties)
 * - Mode variants: { dark: "#000", light: "#fff" }
 * - CSS values: "transparent", "inherit", gradients, shadows
 * - Flexoki palette reference: "fx-blue-300" (maps to var(--fx-blue-300))
 */
export type ColorValue = string | { dark: string; light: string }

/**
 * Theme color definitions - reusable color aliases
 */
export interface ThemeDefs {
  [key: string]: ColorValue
}

// ============================================
// Theme Color Structure
// ============================================

export interface ThemeBgColors {
  app: ColorValue
  sidebar: ColorValue
  chat: ColorValue
  panel: ColorValue
  elevated: ColorValue
  floating: ColorValue
  message?: {
    user?: ColorValue
    userSolid?: ColorValue
    ai?: ColorValue
    system?: ColorValue
    error?: ColorValue
    hover?: ColorValue
  }
  toolCall?: ColorValue
  toolCallHover?: ColorValue
  toolResult?: ColorValue
  input?: ColorValue
  inputFocus?: ColorValue
  btn?: {
    primary?: ColorValue
    primaryHover?: ColorValue
    secondary?: ColorValue
    secondaryHover?: ColorValue
    ghost?: ColorValue
    ghostHover?: ColorValue
    danger?: ColorValue
    dangerHover?: ColorValue
  }
  code?: {
    inline?: ColorValue
    block?: ColorValue
    header?: ColorValue
  }
  menu?: ColorValue
  menuItemHover?: ColorValue
  tooltip?: ColorValue
  modal?: ColorValue
  selected?: ColorValue
  selectedHover?: ColorValue
  highlight?: ColorValue
  hover?: ColorValue
  active?: ColorValue
}

export interface ThemeTextColors {
  primary: ColorValue
  secondary?: ColorValue
  muted?: ColorValue
  faint?: ColorValue
  error?: ColorValue
  warning?: ColorValue
  success?: ColorValue
  info?: ColorValue
  link?: ColorValue
  linkHover?: ColorValue
  user?: {
    primary?: ColorValue
    secondary?: ColorValue
  }
  ai?: {
    primary?: ColorValue
    secondary?: ColorValue
    thinking?: ColorValue
  }
  tool?: {
    name?: ColorValue
    args?: ColorValue
    result?: ColorValue
    error?: ColorValue
  }
  sidebar?: {
    title?: ColorValue
    item?: ColorValue
    itemActive?: ColorValue
    itemHover?: ColorValue
    muted?: ColorValue
  }
  input?: ColorValue
  inputPlaceholder?: ColorValue
  btn?: {
    primary?: ColorValue
    secondary?: ColorValue
    ghost?: ColorValue
    danger?: ColorValue
  }
  code?: {
    inline?: ColorValue
    block?: ColorValue
    comment?: ColorValue
    keyword?: ColorValue
    string?: ColorValue
    number?: ColorValue
    function?: ColorValue
    variable?: ColorValue
    operator?: ColorValue
    type?: ColorValue         // Type names (class, interface)
    property?: ColorValue     // Object properties, attributes
    punctuation?: ColorValue  // Brackets, semicolons
  }
  menu?: {
    item?: ColorValue
    itemHover?: ColorValue
    itemActive?: ColorValue
    header?: ColorValue
  }
  label?: ColorValue
  helper?: ColorValue
}

export interface ThemeBorderColors {
  default: ColorValue
  subtle?: ColorValue
  strong?: ColorValue
  accent?: ColorValue
  error?: ColorValue
  success?: ColorValue
  warning?: ColorValue
  input?: ColorValue
  inputFocus?: ColorValue
  inputError?: ColorValue
  message?: ColorValue
  messageUser?: ColorValue
  code?: ColorValue
  divider?: ColorValue
}

export interface ThemeShadows {
  xs?: ColorValue
  sm?: ColorValue
  md?: ColorValue
  lg?: ColorValue
  xl?: ColorValue
  inner?: ColorValue
  glow?: {
    accent?: ColorValue
    error?: ColorValue
  }
  elevated?: ColorValue
  floating?: ColorValue
}

export interface ThemeEffects {
  gradientUserBubble?: ColorValue
  gradientAiBubble?: ColorValue
  gradientAccent?: ColorValue
  overlayHover?: ColorValue
  overlayActive?: ColorValue
  overlayDisabled?: ColorValue
  blurBackdrop?: ColorValue
}

/**
 * Complete theme color structure
 */
/**
 * Diff colors for code diff views (StepsPanel, etc.)
 */
export interface ThemeDiffColors {
  addBg?: ColorValue      // Background for added lines
  addText?: ColorValue    // Text color for added lines
  delBg?: ColorValue      // Background for deleted lines
  delText?: ColorValue    // Text color for deleted lines
  hunkBg?: ColorValue     // Background for hunk headers
  hunkText?: ColorValue   // Text color for hunk headers
}

/**
 * Semantic status colors (aligned with Base46)
 * Maps to: red=danger, orange/yellow=warning, green=success, cyan=info
 */
export interface ThemeSemanticColors {
  danger?: ColorValue      // Base46: red / base08 - errors, deletions
  dangerLight?: ColorValue // Transparent variant for backgrounds
  warning?: ColorValue     // Base46: orange|yellow / base09 - warnings
  warningLight?: ColorValue
  success?: ColorValue     // Base46: green / base0B - success, additions
  successLight?: ColorValue
  info?: ColorValue        // Base46: cyan / base0C - info, links
  infoLight?: ColorValue
}

export interface ThemeColors {
  accent: ColorValue
  accentMain?: ColorValue
  accentSub?: ColorValue
  accentRgb?: ColorValue  // RGB triplet (e.g., "67, 133, 190")

  bg: ThemeBgColors
  text: ThemeTextColors
  border: ThemeBorderColors
  shadow?: ThemeShadows
  effects?: ThemeEffects
  diff?: ThemeDiffColors  // Diff view colors
  color?: ThemeSemanticColors  // Semantic status colors
}

// ============================================
// Theme Definition
// ============================================

/**
 * Complete theme structure
 */
export interface Theme {
  $schema?: string
  id: string                              // Unique identifier (kebab-case)
  name: string                            // Display name
  author?: string
  version?: string
  type: 'full' | 'accent'                 // full = complete theme, accent = only accent colors
  source?: 'builtin' | 'user' | 'project' // Where the theme comes from
  filePath?: string                       // Path for custom themes
  colorScheme?: 'dark' | 'light' | 'both' // Explicit color scheme declaration

  defs: ThemeDefs
  theme: ThemeColors
}

/**
 * Theme metadata for listing (without full theme data)
 */
export interface ThemeMeta {
  id: string
  name: string
  author?: string
  type: 'full' | 'accent'
  source: 'builtin' | 'user' | 'project'
  /** Color scheme support: 'dark' = dark only, 'light' = light only, 'both' = has dark/light variants */
  colorScheme: 'dark' | 'light' | 'both'
  previewColors?: {
    bg: string        // Background color for preview card
    sidebar: string   // Sidebar color
    accent: string    // Accent color
    text: string      // Text color
  }
}

// ============================================
// Base46 Types (NvChad theme format)
// ============================================

/**
 * Base46 base_30 UI colors
 */
export interface Base46Base30 {
  black: string
  darker_black: string
  black2: string
  one_bg: string
  one_bg2: string
  one_bg3: string
  grey: string
  grey_fg: string
  grey_fg2: string
  light_grey: string
  white: string
  red: string
  baby_pink: string
  pink: string
  line: string
  green: string
  vibrant_green: string
  nord_blue: string
  blue: string
  yellow: string
  sun: string
  purple: string
  dark_purple: string
  teal: string
  orange: string
  cyan: string
  statusline_bg: string
  lightbg: string
  pmenu_bg: string
  folder_bg: string
}

/**
 * Base46 base_16 syntax colors (base16 scheme)
 */
export interface Base46Base16 {
  base00: string  // Background
  base01: string  // Lighter Background (status bars)
  base02: string  // Selection Background
  base03: string  // Comments, Invisibles
  base04: string  // Dark Foreground (status bars)
  base05: string  // Default Foreground
  base06: string  // Light Foreground
  base07: string  // Light Background
  base08: string  // Variables, Errors
  base09: string  // Integers, Booleans, Constants
  base0A: string  // Classes, Markup Bold
  base0B: string  // Strings, Inherited Class
  base0C: string  // Support, Regular Expressions
  base0D: string  // Functions, Methods
  base0E: string  // Keywords, Storage
  base0F: string  // Deprecated, Embedded Language
}

/**
 * Base46 theme structure
 */
export interface Base46Theme {
  type: 'dark' | 'light'
  base_30: Partial<Base46Base30>
  base_16: Partial<Base46Base16>
}

// ============================================
// IPC Response Types
// ============================================

export interface GetThemesResponse {
  success: boolean
  themes?: ThemeMeta[]
  error?: string
}

export interface GetThemeResponse {
  success: boolean
  theme?: Theme
  error?: string
}

export interface ApplyThemeResponse {
  success: boolean
  cssVariables?: Record<string, string>
  error?: string
}

export interface RefreshThemesResponse {
  success: boolean
  themes?: ThemeMeta[]
  error?: string
}
