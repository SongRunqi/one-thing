/**
 * CSS Variable Mapper
 * Maps semantic theme properties to existing 130+ CSS variable names
 * Ensures backward compatibility with existing components
 */

/**
 * Maps theme property paths to CSS variable names
 * Each theme property can map to multiple CSS variables for compatibility
 */
export const CSS_VAR_MAP: Record<string, string[]> = {
  // ============================================
  // Accent Colors
  // ============================================
  'accent': ['--accent', '--accent-main'],
  'accentMain': ['--accent-main'],
  'accentSub': ['--accent-sub'],
  'accentLight': ['--accent-light'],  // Used by buttons and gradients
  'accentRgb': ['--accent-rgb'],

  // ============================================
  // Background Colors
  // ============================================
  'bg.app': ['--bg-app', '--bg'],
  'bg.sidebar': ['--bg-sidebar', '--panel-2'],
  'bg.chat': ['--bg-chat', '--chat-canvas'],
  'bg.panel': ['--bg-panel', '--panel'],
  'bg.elevated': ['--bg-elevated'],
  'bg.floating': ['--bg-floating'],

  // Message Backgrounds
  'bg.message.user': ['--bg-message-user', '--user-bubble', '--gradient-user-bubble'],
  'bg.message.userSolid': ['--bg-message-user-solid'],
  'bg.message.ai': ['--bg-message-ai'],
  'bg.message.system': ['--bg-message-system'],
  'bg.message.error': ['--bg-message-error'],
  'bg.message.hover': ['--bg-message-hover'],

  // Tool Call Backgrounds
  'bg.toolCall': ['--bg-tool-call'],
  'bg.toolCallHover': ['--bg-tool-call-hover'],
  'bg.toolResult': ['--bg-tool-result'],
  'bg.toolError': ['--bg-tool-error'],
  'bg.toolSuccess': ['--bg-tool-success'],

  // Input Backgrounds
  'bg.input': ['--bg-input'],
  'bg.inputFocus': ['--bg-input-focus'],
  'bg.inputDisabled': ['--bg-input-disabled'],

  // Button Backgrounds
  'bg.btn.primary': ['--bg-btn-primary'],
  'bg.btn.primaryHover': ['--bg-btn-primary-hover'],
  'bg.btn.secondary': ['--bg-btn-secondary'],
  'bg.btn.secondaryHover': ['--bg-btn-secondary-hover'],
  'bg.btn.ghost': ['--bg-btn-ghost'],
  'bg.btn.ghostHover': ['--bg-btn-ghost-hover'],
  'bg.btn.danger': ['--bg-btn-danger'],
  'bg.btn.dangerHover': ['--bg-btn-danger-hover'],

  // Code Backgrounds
  'bg.code.inline': ['--bg-code-inline'],
  'bg.code.block': ['--bg-code-block'],
  'bg.code.header': ['--bg-code-header'],

  // Menu & Popup Backgrounds
  'bg.menu': ['--bg-menu'],
  'bg.menuItemHover': ['--bg-menu-item-hover'],
  'bg.menuItemActive': ['--bg-menu-item-active'],
  'bg.tooltip': ['--bg-tooltip'],
  'bg.modal': ['--bg-modal'],
  'bg.modalOverlay': ['--bg-modal-overlay'],

  // Selection & Highlight
  'bg.selected': ['--bg-selected', '--session-highlight'],
  'bg.selectedHover': ['--bg-selected-hover'],
  'bg.highlight': ['--bg-highlight'],
  'bg.hover': ['--bg-hover', '--hover', '--overlay-hover'],
  'bg.active': ['--bg-active', '--active', '--overlay-active'],

  // ============================================
  // Text Colors
  // ============================================
  'text.primary': ['--text-primary', '--text'],
  'text.secondary': ['--text-secondary'],
  'text.muted': ['--text-muted', '--muted'],
  'text.faint': ['--text-faint'],
  'text.error': ['--text-error'],
  'text.warning': ['--text-warning'],
  'text.success': ['--text-success'],

  // Message Text
  'text.user.primary': ['--text-user-primary'],
  'text.user.secondary': ['--text-user-secondary'],
  'text.ai.primary': ['--text-ai-primary', '--ai-text'],
  'text.ai.secondary': ['--text-ai-secondary'],
  'text.ai.thinking': ['--text-ai-thinking'],
  'text.system': ['--text-system'],

  // Status Text
  'text.llmWaiting': ['--text-llm-waiting'],
  'text.toolCalling': ['--text-tool-calling'],
  'text.toolWaiting': ['--text-tool-waiting'],
  'text.streaming': ['--text-streaming'],
  'text.timestamp': ['--text-timestamp'],
  'text.timestampHover': ['--text-timestamp-hover'],

  // Tool Call Text
  'text.tool.name': ['--text-tool-name'],
  'text.tool.args': ['--text-tool-args'],
  'text.tool.result': ['--text-tool-result'],
  'text.tool.error': ['--text-tool-error'],
  'text.tool.label': ['--text-tool-label'],

  // Sidebar Text
  'text.sidebar.title': ['--text-sidebar-title'],
  'text.sidebar.item': ['--text-sidebar-item'],
  'text.sidebar.itemActive': ['--text-sidebar-item-active'],
  'text.sidebar.itemHover': ['--text-sidebar-item-hover'],
  'text.sidebar.muted': ['--text-sidebar-muted'],
  'text.sidebar.count': ['--text-sidebar-count'],

  // Input Text
  'text.input': ['--text-input'],
  'text.inputPlaceholder': ['--text-input-placeholder'],
  'text.inputDisabled': ['--text-input-disabled'],

  // Code Text (also maps to --hljs-* for highlight.js integration)
  'text.code.inline': ['--text-code-inline'],
  'text.code.block': ['--text-code-block'],
  'text.code.comment': ['--text-code-comment', '--hljs-comment'],
  'text.code.keyword': ['--text-code-keyword', '--hljs-keyword'],
  'text.code.string': ['--text-code-string', '--hljs-string'],
  'text.code.number': ['--text-code-number', '--hljs-number'],
  'text.code.function': ['--text-code-function', '--hljs-function'],
  'text.code.variable': ['--text-code-variable', '--hljs-variable'],
  'text.code.operator': ['--text-code-operator', '--hljs-operator'],
  'text.code.type': ['--text-code-type', '--hljs-type'],
  'text.code.property': ['--text-code-property', '--hljs-property'],
  'text.code.punctuation': ['--text-code-punctuation', '--hljs-punctuation'],

  // Link Text
  'text.link': ['--text-link'],
  'text.linkHover': ['--text-link-hover'],
  'text.linkVisited': ['--text-link-visited'],
  'text.linkExternal': ['--text-link-external'],

  // Button Text
  'text.btn.primary': ['--text-btn-primary'],
  'text.btn.secondary': ['--text-btn-secondary'],
  'text.btn.ghost': ['--text-btn-ghost'],
  'text.btn.danger': ['--text-btn-danger'],
  'text.btn.disabled': ['--text-btn-disabled'],

  // Form Text
  'text.label': ['--text-label'],
  'text.helper': ['--text-helper'],
  'text.validationError': ['--text-validation-error'],
  'text.validationSuccess': ['--text-validation-success'],

  // Menu Text
  'text.menu.item': ['--text-menu-item'],
  'text.menu.itemHover': ['--text-menu-item-hover'],
  'text.menu.itemActive': ['--text-menu-item-active'],
  'text.menu.header': ['--text-menu-header'],
  'text.tooltip': ['--text-tooltip'],
  'text.modalTitle': ['--text-modal-title'],
  'text.modalBody': ['--text-modal-body'],

  // ============================================
  // Border Colors
  // ============================================
  'border.default': ['--border-default', '--border'],
  'border.subtle': ['--border-subtle'],
  'border.strong': ['--border-strong'],
  'border.accent': ['--border-accent'],
  'border.error': ['--border-error'],
  'border.success': ['--border-success'],
  'border.warning': ['--border-warning'],
  'border.input': ['--border-input'],
  'border.inputFocus': ['--border-input-focus'],
  'border.inputError': ['--border-input-error'],
  'border.message': ['--border-message'],
  'border.messageUser': ['--border-message-user', '--user-bubble-border'],
  'border.code': ['--border-code'],
  'border.divider': ['--border-divider'],

  // ============================================
  // Shadows
  // ============================================
  'shadow.xs': ['--shadow-xs'],
  'shadow.sm': ['--shadow-sm'],
  'shadow.md': ['--shadow-md'],
  'shadow.lg': ['--shadow-lg', '--shadow'],
  'shadow.xl': ['--shadow-xl'],
  'shadow.inner': ['--shadow-inner'],
  'shadow.glow.accent': ['--shadow-glow-accent', '--shadow-glow'],
  'shadow.glow.error': ['--shadow-glow-error'],
  'shadow.elevated': ['--shadow-elevated'],
  'shadow.floating': ['--shadow-floating'],

  // ============================================
  // Effects
  // ============================================
  'effects.gradientUserBubble': ['--gradient-user-bubble'],
  'effects.gradientAiBubble': ['--gradient-ai-bubble'],
  'effects.gradientAccent': ['--gradient-accent'],
  'effects.overlayHover': ['--overlay-hover'],
  'effects.overlayActive': ['--overlay-active'],
  'effects.overlayDisabled': ['--overlay-disabled'],
  'effects.blurBackdrop': ['--blur-backdrop'],

  // ============================================
  // Semantic Colors
  // ============================================
  'color.danger': ['--color-danger', '--danger'],
  'color.dangerLight': ['--color-danger-light'],
  'color.warning': ['--color-warning'],
  'color.warningLight': ['--color-warning-light'],
  'color.success': ['--color-success'],
  'color.successLight': ['--color-success-light'],
  'color.info': ['--color-info'],
  'color.infoLight': ['--color-info-light'],

  // ============================================
  // Diff Colors (for code diff views)
  // ============================================
  'diff.addBg': ['--diff-add-bg'],
  'diff.addText': ['--diff-add-text'],
  'diff.delBg': ['--diff-del-bg'],
  'diff.delText': ['--diff-del-text'],
  'diff.hunkBg': ['--diff-hunk-bg'],
  'diff.hunkText': ['--diff-hunk-text'],
}

/**
 * Extract RGB components from a hex color
 * @param hex - Hex color like "#282726"
 * @returns RGB triplet like "40, 39, 38" or null if invalid
 */
function hexToRgbTriplet(hex: string): string | null {
  if (!hex || !hex.startsWith('#')) return null

  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!result) return null

  const r = parseInt(result[1], 16)
  const g = parseInt(result[2], 16)
  const b = parseInt(result[3], 16)

  return `${r}, ${g}, ${b}`
}

/**
 * Generate CSS variables string from resolved theme
 * @param resolvedTheme - Map of theme property path -> resolved color value
 * @returns CSS variable declarations as a string
 */
export function generateCSSVariables(
  resolvedTheme: Record<string, string>
): Record<string, string> {
  const result: Record<string, string> = {}

  for (const [themePath, value] of Object.entries(resolvedTheme)) {
    const cssVars = CSS_VAR_MAP[themePath]
    if (cssVars) {
      for (const cssVar of cssVars) {
        result[cssVar] = value
      }
    }
  }

  // Generate RGB triplet variables for transparency patterns
  // These are used in rgba(var(--bg-rgb), opacity) patterns
  const bgAppColor = resolvedTheme['bg.app']
  if (bgAppColor) {
    const bgRgb = hexToRgbTriplet(bgAppColor)
    if (bgRgb) {
      result['--bg-rgb'] = bgRgb
    }
  }

  // Use theme's accentRgb if defined, otherwise extract from hex
  if (!result['--accent-rgb']) {
    const accentColor = resolvedTheme['accent']
    if (accentColor) {
      const accentRgb = hexToRgbTriplet(accentColor)
      if (accentRgb) {
        result['--accent-rgb'] = accentRgb
      }
    }
  }

  // Also generate for specific colors that need RGB triplets
  const sidebarColor = resolvedTheme['bg.sidebar']
  if (sidebarColor) {
    const sidebarRgb = hexToRgbTriplet(sidebarColor)
    if (sidebarRgb) {
      result['--sidebar-rgb'] = sidebarRgb
    }
  }

  // Generate RGB triplets for semantic colors (danger, warning, success, info)
  // These enable rgba(var(--color-*-rgb), opacity) patterns in components
  const semanticColorPaths: [string, string][] = [
    ['color.danger', '--color-danger-rgb'],
    ['color.warning', '--color-warning-rgb'],
    ['color.success', '--color-success-rgb'],
    ['color.info', '--color-info-rgb'],
    ['text.error', '--text-error-rgb'],
    ['text.warning', '--text-warning-rgb'],
    ['text.success', '--text-success-rgb'],
  ]

  for (const [path, cssVar] of semanticColorPaths) {
    const color = resolvedTheme[path]
    if (color) {
      const rgb = hexToRgbTriplet(color)
      if (rgb) result[cssVar] = rgb
    }
  }

  return result
}

/**
 * Generate CSS style string from CSS variables
 */
export function generateCSSStyleString(
  cssVariables: Record<string, string>
): string {
  return Object.entries(cssVariables)
    .map(([varName, value]) => `${varName}: ${value};`)
    .join('\n')
}

/**
 * Get all CSS variable names that the theme system controls
 */
export function getAllCSSVariableNames(): string[] {
  const allVars = new Set<string>()
  for (const vars of Object.values(CSS_VAR_MAP)) {
    for (const varName of vars) {
      allVars.add(varName)
    }
  }
  return Array.from(allVars)
}
