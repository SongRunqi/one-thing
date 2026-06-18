/**
 * CSS Variable Mapper
 * Maps semantic theme properties to existing 130+ CSS variable names
 * Ensures backward compatibility with existing components
 */

import type { SemanticHighlightToken, SemanticUIToken } from '../../shared/ipc/themes.js'
import {
  SEMANTIC_HIGHLIGHT_TOKENS,
  SEMANTIC_UI_TOKENS,
  THEME_NEUTRAL_COLOR_TOKENS,
} from './resolver.js'
import type { ResolvedHighlightStyle, ResolvedUIStyle, ThemeNeutralColorToken } from './resolver.js'

/**
 * Maps theme property paths to CSS variable names
 * Each theme property can map to multiple CSS variables for compatibility
 */
export const CSS_VAR_MAP: Record<string, string[]> = {
  // ============================================
  // Accent Colors
  // ============================================
  'primary': ['--color-primary', '--primary'],
  'primaryHover': ['--color-primary-hover'],
  'primaryBg': ['--color-primary-bg'],
  'primaryBgHover': ['--color-primary-bg-hover'],
  'primaryBorder': ['--color-primary-border'],
  'primaryText': ['--color-primary-text'],
  'primaryLight': ['--color-primary-light'],
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
  // --editor-caret follows text.input (not accent) so editors keep a high-contrast
  // insertion cursor across full themes and Markdown live-preview surfaces.
  'text.input': ['--text-input', '--editor-caret'],
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
  'color.dangerBg': ['--color-danger-bg'],
  'color.dangerBgHover': ['--color-danger-bg-hover'],
  'color.dangerBorder': ['--color-danger-border'],
  'color.dangerText': ['--color-danger-text'],
  'color.dangerLight': ['--color-danger-light'],
  'color.warning': ['--color-warning'],
  'color.warningBg': ['--color-warning-bg'],
  'color.warningBgHover': ['--color-warning-bg-hover'],
  'color.warningBorder': ['--color-warning-border'],
  'color.warningText': ['--color-warning-text'],
  'color.warningLight': ['--color-warning-light'],
  'color.success': ['--color-success'],
  'color.successBg': ['--color-success-bg'],
  'color.successBgHover': ['--color-success-bg-hover'],
  'color.successBorder': ['--color-success-border'],
  'color.successText': ['--color-success-text'],
  'color.successLight': ['--color-success-light'],
  'color.info': ['--color-info'],
  'color.infoBg': ['--color-info-bg'],
  'color.infoBgHover': ['--color-info-bg-hover'],
  'color.infoBorder': ['--color-info-border'],
  'color.infoText': ['--color-info-text'],
  'color.infoLight': ['--color-info-light'],

  // ============================================
  // Neutral Color Semantics
  // ============================================
  'neutral.primaryText': ['--color-neutral-primary-text', '--neutral-primary-text', '--text-color-primary'],
  'neutral.regularText': ['--color-neutral-regular-text', '--neutral-regular-text', '--text-color-regular'],
  'neutral.secondaryText': ['--color-neutral-secondary-text', '--neutral-secondary-text', '--text-color-secondary'],
  'neutral.placeholderText': ['--color-neutral-placeholder-text', '--neutral-placeholder-text', '--text-color-placeholder'],
  'neutral.disabledText': ['--color-neutral-disabled-text', '--neutral-disabled-text', '--text-color-disabled'],
  'neutral.darkerBorder': ['--color-neutral-darker-border', '--neutral-darker-border', '--border-color-darker'],
  'neutral.darkBorder': ['--color-neutral-dark-border', '--neutral-dark-border', '--border-color-dark'],
  'neutral.baseBorder': ['--color-neutral-base-border', '--neutral-base-border', '--border-color-base'],
  'neutral.lightBorder': ['--color-neutral-light-border', '--neutral-light-border', '--border-color-light'],
  'neutral.lighterBorder': ['--color-neutral-lighter-border', '--neutral-lighter-border', '--border-color-lighter'],
  'neutral.extraLightBorder': ['--color-neutral-extra-light-border', '--neutral-extra-light-border', '--border-color-extra-light'],
  'neutral.darkerFill': ['--color-neutral-darker-fill', '--neutral-darker-fill', '--fill-color-darker'],
  'neutral.darkFill': ['--color-neutral-dark-fill', '--neutral-dark-fill', '--fill-color-dark'],
  'neutral.baseFill': ['--color-neutral-base-fill', '--neutral-base-fill', '--fill-color-base'],
  'neutral.lightFill': ['--color-neutral-light-fill', '--neutral-light-fill', '--fill-color-light'],
  'neutral.lighterFill': ['--color-neutral-lighter-fill', '--neutral-lighter-fill', '--fill-color-lighter'],
  'neutral.extraLightFill': ['--color-neutral-extra-light-fill', '--neutral-extra-light-fill', '--fill-color-extra-light'],
  'neutral.blankFill': ['--color-neutral-blank-fill', '--neutral-blank-fill', '--fill-color-blank'],
  'neutral.basicBlack': ['--color-neutral-basic-black', '--neutral-basic-black', '--color-black'],
  'neutral.basicWhite': ['--color-neutral-basic-white', '--neutral-basic-white', '--color-white'],
  'neutral.transparent': ['--color-neutral-transparent', '--neutral-transparent', '--color-transparent'],
  'neutral.pageBackground': ['--color-neutral-page-background', '--neutral-page-background', '--bg-color-page'],
  'neutral.baseBackground': ['--color-neutral-base-background', '--neutral-base-background', '--bg-color-base'],
  'neutral.overlayBackground': ['--color-neutral-overlay-background', '--neutral-overlay-background', '--bg-color-overlay'],

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

const HIGHLIGHT_LEGACY_FG_VAR_MAP: Partial<Record<SemanticHighlightToken, string[]>> = {
  'syntax.plain': ['--text-code-inline', '--text-code-block'],
  'syntax.comment': ['--text-code-comment', '--hljs-comment', '--syntax-comment'],
  'syntax.keyword': ['--text-code-keyword', '--hljs-keyword', '--syntax-keyword'],
  'syntax.string': ['--text-code-string', '--hljs-string', '--syntax-string'],
  'syntax.number': ['--text-code-number', '--hljs-number', '--syntax-number'],
  'syntax.function': ['--text-code-function', '--hljs-function', '--syntax-func'],
  'syntax.variable': ['--text-code-variable', '--hljs-variable'],
  'syntax.property': ['--text-code-property', '--hljs-property'],
  'syntax.type': ['--text-code-type', '--hljs-type'],
  'syntax.operator': ['--text-code-operator', '--hljs-operator'],
  'syntax.punctuation': ['--text-code-punctuation', '--hljs-punctuation', '--syntax-punct'],
}

type UIStyleField = keyof ResolvedUIStyle

const UI_LEGACY_VAR_MAP: Partial<Record<SemanticUIToken, Partial<Record<UIStyleField, string[]>>>> = {
  'ui.accent.primary': {
    fg: ['--accent', '--accent-main'],
  },
  'ui.accent.subtle': {
    fg: ['--accent-sub'],
  },
  'ui.surface.app': {
    bg: ['--bg-app', '--bg'],
  },
  'ui.surface.sidebar': {
    bg: ['--bg-sidebar', '--panel-2'],
  },
  'ui.surface.chat': {
    bg: ['--bg-chat', '--chat-canvas'],
  },
  'ui.surface.panel': {
    bg: ['--bg-panel', '--panel'],
  },
  'ui.surface.elevated': {
    bg: ['--bg-elevated'],
    shadow: ['--shadow-elevated'],
  },
  'ui.surface.floating': {
    bg: ['--bg-floating'],
    shadow: ['--shadow-floating'],
  },
  'ui.surface.overlay': {
    bg: ['--bg-modal-overlay'],
  },
  'ui.surface.menu': {
    bg: ['--bg-menu'],
  },
  'ui.surface.menuHover': {
    bg: ['--bg-menu-item-hover'],
  },
  'ui.surface.input': {
    bg: ['--bg-input'],
    border: ['--border-input'],
  },
  'ui.surface.inputFocus': {
    bg: ['--bg-input-focus'],
    border: ['--border-input-focus'],
  },
  'ui.surface.codeInline': {
    bg: ['--bg-code-inline'],
  },
  'ui.surface.codeBlock': {
    bg: ['--bg-code-block'],
    border: ['--border-code'],
  },
  'ui.surface.codeHeader': {
    bg: ['--bg-code-header'],
  },
  'ui.surface.tooltip': {
    bg: ['--bg-tooltip'],
    fg: ['--text-tooltip'],
  },
  'ui.surface.modal': {
    bg: ['--bg-modal'],
    fg: ['--text-modal-body'],
  },
  'ui.surface.note': {
    bg: ['--bg-note'],
    fg: ['--text-note'],
    border: ['--border-note'],
  },
  'ui.text.primary': {
    fg: ['--text-primary', '--text'],
  },
  'ui.text.secondary': {
    fg: ['--text-secondary'],
  },
  'ui.text.muted': {
    fg: ['--text-muted', '--muted'],
  },
  'ui.text.faint': {
    fg: ['--text-faint'],
  },
  'ui.text.placeholder': {
    fg: ['--text-input-placeholder'],
  },
  'ui.text.disabled': {
    fg: ['--text-input-disabled', '--text-btn-disabled'],
  },
  'ui.text.link': {
    fg: ['--text-link'],
  },
  'ui.text.linkHover': {
    fg: ['--text-link-hover'],
  },
  'ui.border.default': {
    border: ['--border-default', '--border'],
  },
  'ui.border.subtle': {
    border: ['--border-subtle'],
  },
  'ui.border.strong': {
    border: ['--border-strong'],
  },
  'ui.border.divider': {
    border: ['--border-divider'],
  },
  'ui.border.focus': {
    border: ['--border-input-focus'],
  },
  'ui.border.selected': {
    border: ['--border-accent'],
  },
  'ui.action.primary': {
    bg: ['--bg-btn-primary'],
    fg: ['--text-btn-primary'],
    border: ['--border-accent'],
  },
  'ui.action.primaryHover': {
    bg: ['--bg-btn-primary-hover'],
  },
  'ui.action.secondary': {
    bg: ['--bg-btn-secondary'],
    fg: ['--text-btn-secondary'],
  },
  'ui.action.secondaryHover': {
    bg: ['--bg-btn-secondary-hover'],
  },
  'ui.action.ghost': {
    bg: ['--bg-btn-ghost'],
    fg: ['--text-btn-ghost'],
  },
  'ui.action.ghostHover': {
    bg: ['--bg-btn-ghost-hover'],
  },
  'ui.action.danger': {
    bg: ['--bg-btn-danger'],
    fg: ['--text-btn-danger'],
    border: ['--border-error'],
  },
  'ui.action.dangerHover': {
    bg: ['--bg-btn-danger-hover'],
  },
  'ui.action.disabled': {
    bg: ['--bg-input-disabled'],
    fg: ['--text-btn-disabled', '--text-input-disabled'],
  },
  'ui.state.hover': {
    bg: ['--bg-hover', '--hover', '--overlay-hover'],
  },
  'ui.state.active': {
    bg: ['--bg-active', '--active', '--overlay-active'],
  },
  'ui.state.selected': {
    bg: ['--bg-selected', '--session-highlight'],
  },
  'ui.state.selectedHover': {
    bg: ['--bg-selected-hover'],
  },
  'ui.state.highlight': {
    bg: ['--bg-highlight'],
  },
  'ui.state.disabled': {
    bg: ['--bg-input-disabled', '--overlay-disabled'],
    fg: ['--text-input-disabled', '--text-btn-disabled'],
  },
  'ui.sidebar.surface': {
    bg: ['--sidebar-bg'],
  },
  'ui.sidebar.item': {
    fg: ['--text-sidebar-item'],
  },
  'ui.sidebar.itemHover': {
    fg: ['--text-sidebar-item-hover'],
  },
  'ui.sidebar.itemActive': {
    fg: ['--text-sidebar-item-active'],
    bg: ['--session-highlight'],
    border: ['--border-accent'],
  },
  'ui.sidebar.itemMuted': {
    fg: ['--text-sidebar-muted', '--text-sidebar-count'],
  },
  'ui.sidebar.header': {
    fg: ['--text-sidebar-title'],
  },
  'ui.sidebar.action': {
    fg: ['--sidebar-action-fg'],
  },
  'ui.sidebar.actionHover': {
    fg: ['--sidebar-action-hover-fg'],
    bg: ['--sidebar-action-hover-bg'],
  },
  'ui.sidebar.border': {
    border: ['--border-sidebar'],
  },
  'ui.category.1.icon': {
    fg: ['--ui-category-1-icon'],
  },
  'ui.category.1.badgeBg': {
    bg: ['--ui-category-1-badge-bg'],
  },
  'ui.category.1.badgeText': {
    fg: ['--ui-category-1-badge-text'],
  },
  'ui.category.2.icon': {
    fg: ['--ui-category-2-icon'],
  },
  'ui.category.2.badgeBg': {
    bg: ['--ui-category-2-badge-bg'],
  },
  'ui.category.2.badgeText': {
    fg: ['--ui-category-2-badge-text'],
  },
  'ui.category.3.icon': {
    fg: ['--ui-category-3-icon'],
  },
  'ui.category.3.badgeBg': {
    bg: ['--ui-category-3-badge-bg'],
  },
  'ui.category.3.badgeText': {
    fg: ['--ui-category-3-badge-text'],
  },
  'ui.category.4.icon': {
    fg: ['--ui-category-4-icon'],
  },
  'ui.category.4.badgeBg': {
    bg: ['--ui-category-4-badge-bg'],
  },
  'ui.category.4.badgeText': {
    fg: ['--ui-category-4-badge-text'],
  },
  'ui.category.5.icon': {
    fg: ['--ui-category-5-icon'],
  },
  'ui.category.5.badgeBg': {
    bg: ['--ui-category-5-badge-bg'],
  },
  'ui.category.5.badgeText': {
    fg: ['--ui-category-5-badge-text'],
  },
  'ui.category.6.icon': {
    fg: ['--ui-category-6-icon'],
  },
  'ui.category.6.badgeBg': {
    bg: ['--ui-category-6-badge-bg'],
  },
  'ui.category.6.badgeText': {
    fg: ['--ui-category-6-badge-text'],
  },
  'ui.category.7.icon': {
    fg: ['--ui-category-7-icon'],
  },
  'ui.category.7.badgeBg': {
    bg: ['--ui-category-7-badge-bg'],
  },
  'ui.category.7.badgeText': {
    fg: ['--ui-category-7-badge-text'],
  },
  'ui.tabBar.surface': {
    bg: ['--tab-bar-bg'],
  },
  'ui.tabBar.divider': {
    border: ['--tab-bar-divider'],
  },
  'ui.tabBar.item': {
    fg: ['--tab-item-fg'],
  },
  'ui.tabBar.itemHover': {
    fg: ['--tab-item-hover-fg'],
    bg: ['--tab-item-hover-bg'],
  },
  'ui.tabBar.itemActive': {
    fg: ['--tab-item-active-fg'],
    bg: ['--tab-item-active-bg'],
  },
  'ui.tabBar.action': {
    fg: ['--tab-action-fg'],
  },
  'ui.tabBar.actionHover': {
    fg: ['--tab-action-hover-fg'],
    bg: ['--tab-action-hover-bg'],
    border: ['--tab-action-hover-border'],
  },
  'ui.tabBar.danger': {
    fg: ['--tab-danger-fg'],
    bg: ['--tab-danger-bg'],
  },
  'ui.status.danger': {
    fg: ['--text-error'],
    bg: ['--color-danger-light'],
    border: ['--border-error'],
  },
  'ui.status.warning': {
    fg: ['--text-warning'],
    bg: ['--color-warning-light'],
    border: ['--border-warning'],
  },
  'ui.status.success': {
    fg: ['--text-success'],
    bg: ['--color-success-light'],
    border: ['--border-success'],
  },
  'ui.status.info': {
    fg: ['--text-info'],
    bg: ['--color-info-light'],
    border: ['--border-info'],
  },
  'ui.message.user': {
    bg: ['--bg-message-user', '--user-bubble', '--gradient-user-bubble'],
    fg: ['--text-user-primary'],
    border: ['--border-message-user', '--user-bubble-border'],
  },
  'ui.message.userSolid': {
    bg: ['--bg-message-user-solid'],
  },
  'ui.message.assistant': {
    bg: ['--bg-message-ai'],
    fg: ['--text-ai-primary', '--ai-text'],
    border: ['--border-message'],
  },
  'ui.message.system': {
    bg: ['--bg-message-system'],
    fg: ['--text-system'],
  },
  'ui.message.error': {
    bg: ['--bg-message-error'],
    fg: ['--text-error'],
    border: ['--border-error'],
  },
  'ui.message.hover': {
    bg: ['--bg-message-hover'],
  },
  'ui.message.thinking': {
    fg: ['--text-ai-thinking'],
  },
  'ui.tool.surface': {
    bg: ['--bg-tool-call', '--tool-surface'],
    border: ['--tool-border'],
  },
  'ui.tool.surfaceHover': {
    bg: ['--bg-tool-call-hover'],
  },
  'ui.tool.surfaceSubtle': {
    bg: ['--tool-surface-sub'],
  },
  'ui.tool.result': {
    bg: ['--bg-tool-result'],
    fg: ['--text-tool-result'],
  },
  'ui.tool.error': {
    bg: ['--bg-tool-error'],
    fg: ['--text-tool-error'],
  },
  'ui.tool.success': {
    bg: ['--bg-tool-success'],
  },
  'ui.tool.text': {
    fg: ['--tool-ink', '--text-tool-name'],
  },
  'ui.tool.textMuted': {
    fg: ['--tool-soft', '--text-tool-args'],
  },
  'ui.tool.textFaint': {
    fg: ['--tool-faint', '--text-tool-label'],
  },
  'ui.tool.accent': {
    fg: ['--tool-accent'],
  },
  'ui.tool.accentOn': {
    fg: ['--tool-accent-on'],
  },
  'ui.tool.successText': {
    fg: ['--tool-ok', '--tool-add-bar'],
  },
  'ui.tool.dangerText': {
    fg: ['--tool-del-bar'],
  },
  'ui.tool.border': {
    border: ['--tool-border'],
  },
  'ui.editor.text': {
    fg: ['--text-input'],
    bg: ['--bg-input'],
    border: ['--border-input'],
  },
  'ui.editor.placeholder': {
    fg: ['--text-input-placeholder'],
  },
  'ui.editor.caret': {
    fg: ['--editor-caret'],
  },
}

function highlightVarName(token: SemanticHighlightToken, suffix: string): string {
  return `--hg-${token.replace(/\./g, '-')}-${suffix}`
}

function camelToKebab(value: string): string {
  return value.replace(/[A-Z]/g, match => `-${match.toLowerCase()}`)
}

function uiVarName(token: SemanticUIToken, suffix: UIStyleField): string {
  return `--${camelToKebab(token).replace(/\./g, '-')}-${suffix}`
}

function neutralRgbVarName(token: ThemeNeutralColorToken): string {
  return `--color-neutral-${camelToKebab(token)}-rgb`
}

function getFontStyleParts(fontStyle: string | undefined): {
  fontStyle: string
  fontWeight: string
  textDecoration: string
} {
  const value = fontStyle || 'normal'
  return {
    fontStyle: value.includes('italic') ? 'italic' : 'normal',
    fontWeight: value.includes('bold') ? '700' : '400',
    textDecoration: value.includes('underline') ? 'underline' : 'none',
  }
}

function addHighlightCSSVariables(
  result: Record<string, string>,
  resolvedHighlights: Record<SemanticHighlightToken, ResolvedHighlightStyle>
): void {
  for (const [token, style] of Object.entries(resolvedHighlights) as Array<[SemanticHighlightToken, ResolvedHighlightStyle]>) {
    const fontStyleParts = getFontStyleParts(style.fontStyle)

    if (style.fg) {
      result[highlightVarName(token, 'fg')] = style.fg
      const legacyVars = HIGHLIGHT_LEGACY_FG_VAR_MAP[token] || []
      for (const cssVar of legacyVars) {
        result[cssVar] = style.fg
      }
    }

    result[highlightVarName(token, 'bg')] = style.bg || 'transparent'
    result[highlightVarName(token, 'font-style')] = fontStyleParts.fontStyle
    result[highlightVarName(token, 'font-weight')] = fontStyleParts.fontWeight
    result[highlightVarName(token, 'text-decoration')] = fontStyleParts.textDecoration
  }
}

function addUICSSVariables(
  result: Record<string, string>,
  resolvedUI: Record<SemanticUIToken, ResolvedUIStyle>
): void {
  for (const [token, style] of Object.entries(resolvedUI) as Array<[SemanticUIToken, ResolvedUIStyle]>) {
    for (const field of ['fg', 'bg', 'border', 'ring', 'shadow'] as UIStyleField[]) {
      const value = style[field]
      if (!value) continue

      result[uiVarName(token, field)] = value

      const legacyVars = UI_LEGACY_VAR_MAP[token]?.[field] || []
      for (const cssVar of legacyVars) {
        result[cssVar] = value
      }
    }
  }
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
  resolvedTheme: Record<string, string>,
  resolvedHighlights?: Record<SemanticHighlightToken, ResolvedHighlightStyle>,
  resolvedUI?: Record<SemanticUIToken, ResolvedUIStyle>
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

  if (resolvedHighlights) {
    addHighlightCSSVariables(result, resolvedHighlights)
  }

  if (resolvedUI) {
    addUICSSVariables(result, resolvedUI)
  }

  // Generate RGB triplet variables for transparency patterns
  // These are used in rgba(var(--bg-rgb), opacity) patterns
  const bgAppColor = result['--bg-app'] || resolvedTheme['bg.app']
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
  const sidebarColor = result['--bg-sidebar'] || resolvedTheme['bg.sidebar']
  if (sidebarColor) {
    const sidebarRgb = hexToRgbTriplet(sidebarColor)
    if (sidebarRgb) {
      result['--sidebar-rgb'] = sidebarRgb
    }
  }

  // Generate RGB triplets for semantic colors (danger, warning, success, info)
  // These enable rgba(var(--color-*-rgb), opacity) patterns in components
  const semanticColorPaths: [string, string][] = [
    ['primary', '--color-primary-rgb'],
    ['primary', '--primary-rgb'],
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

  for (const token of THEME_NEUTRAL_COLOR_TOKENS) {
    const color = resolvedTheme[`neutral.${token}`]
    if (!color) continue

    const rgb = hexToRgbTriplet(color)
    if (rgb) result[neutralRgbVarName(token)] = rgb
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
  for (const token of SEMANTIC_HIGHLIGHT_TOKENS) {
    allVars.add(highlightVarName(token, 'fg'))
    allVars.add(highlightVarName(token, 'bg'))
    allVars.add(highlightVarName(token, 'font-style'))
    allVars.add(highlightVarName(token, 'font-weight'))
    allVars.add(highlightVarName(token, 'text-decoration'))
  }
  for (const token of SEMANTIC_UI_TOKENS) {
    for (const field of ['fg', 'bg', 'border', 'ring', 'shadow'] as UIStyleField[]) {
      allVars.add(uiVarName(token, field))
    }
    for (const varsByField of Object.values(UI_LEGACY_VAR_MAP[token] || {})) {
      for (const varName of varsByField || []) {
        allVars.add(varName)
      }
    }
  }
  allVars.add('--color-primary-rgb')
  allVars.add('--primary-rgb')
  for (const token of THEME_NEUTRAL_COLOR_TOKENS) {
    allVars.add(neutralRgbVarName(token))
  }
  return Array.from(allVars)
}
