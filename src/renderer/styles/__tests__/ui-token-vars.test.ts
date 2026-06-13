import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { describe, expect, it } from 'vitest'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const rendererDir = path.resolve(dirname, '..', '..')
const componentStyleRoots = ['components', 'editor']
const componentStyleFiles = ['styles/components.css']
const styleFileExtensions = new Set(['.vue', '.ts', '.css'])
const legacyColorVars = new Set([
  '--accent',
  '--accent-hover',
  '--accent-main',
  '--accent-sub',
  '--accent-light',
  '--accent-rgb',
  '--bg',
  '--panel',
  '--panel-2',
  '--chat-canvas',
  '--muted',
  '--hover',
  '--active',
  '--bg-app',
  '--bg-sidebar',
  '--bg-chat',
  '--bg-panel',
  '--bg-elevated',
  '--bg-floating',
  '--bg-primary',
  '--bg-secondary',
  '--bg-tertiary',
  '--bg-muted',
  '--bg-hover',
  '--bg-sunken',
  '--bg-active',
  '--bg-selected',
  '--bg-selected-hover',
  '--bg-input',
  '--bg-input-focus',
  '--bg-input-disabled',
  '--input-bg',
  '--button-bg',
  '--border',
  '--border-default',
  '--border-subtle',
  '--border-strong',
  '--border-primary',
  '--border-secondary',
  '--border-color',
  '--text',
  '--text-primary',
  '--text-secondary',
  '--text-muted',
  '--text-faint',
  '--text-sidebar-item',
  '--text-sidebar-item-hover',
  '--text-sidebar-item-active',
  '--danger',
  '--error',
  '--warning',
  '--success',
  '--color-danger',
  '--color-warning',
  '--color-success',
  '--color-info',
  '--danger-color',
  '--success-color',
  '--accent-color',
  '--hover-bg',
  '--text-code-inline',
  '--text-code-block',
  '--text-code-comment',
  '--text-code-keyword',
  '--text-code-string',
  '--text-code-number',
  '--text-code-function',
  '--text-code-variable',
  '--text-code-operator',
  '--text-code-type',
  '--text-code-property',
  '--text-code-punctuation',
  '--syntax-string',
])

function readRendererFile(relativePath: string): string {
  return fs.readFileSync(path.join(rendererDir, relativePath), 'utf8')
}

function listStyleFiles(dir: string, files: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const absolutePath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      listStyleFiles(absolutePath, files)
    } else if (styleFileExtensions.has(path.extname(entry.name))) {
      files.push(absolutePath)
    }
  }
  return files
}

function findMatchingParen(text: string, openParen: number): number {
  let depth = 0
  let quote: string | null = null
  for (let i = openParen; i < text.length; i++) {
    const char = text[i]
    if (quote) {
      if (char === quote && text[i - 1] !== '\\') quote = null
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      continue
    }
    if (char === '(') depth += 1
    if (char === ')') {
      depth -= 1
      if (depth === 0) return i
    }
  }
  return -1
}

function firstVarName(inner: string): string | null {
  return inner.match(/^\s*(--[\w-]+)/)?.[1] || null
}

function lineNumber(text: string, offset: number): number {
  return text.slice(0, offset).split('\n').length
}

function isSemanticVarName(name: string | null): boolean {
  return !!name && (
    /^--ui-/.test(name) ||
    /^--hg-/.test(name) ||
    /^--diff-/.test(name) ||
    /^--color-primary/.test(name) ||
    /^--color-neutral-/.test(name) ||
    /^--text-color-/.test(name) ||
    /^--border-color-/.test(name) ||
    /^--fill-color-/.test(name) ||
    /^--bg-color-/.test(name)
  )
}

function isInsideSemanticVar(text: string, offset: number): boolean {
  let searchFrom = offset
  while (true) {
    const start = text.lastIndexOf('var(', searchFrom)
    if (start === -1) return false
    const close = findMatchingParen(text, start + 3)
    if (close >= offset) {
      const name = firstVarName(text.slice(start + 4, close))
      if (isSemanticVarName(name)) return true
    }
    searchFrom = start - 1
  }
}

function collectDirectLegacyColorUsage(): string[] {
  const reports: string[] = []
  const files = [
    ...componentStyleRoots.flatMap((root) => listStyleFiles(path.join(rendererDir, root))),
    ...componentStyleFiles.map((file) => path.join(rendererDir, file)),
  ]

  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8')
    let cursor = 0
    while (true) {
      const start = text.indexOf('var(', cursor)
      if (start === -1) break
      const close = findMatchingParen(text, start + 3)
      if (close === -1) break
      const name = firstVarName(text.slice(start + 4, close))
      if (name && legacyColorVars.has(name) && !isInsideSemanticVar(text, start + 2)) {
        reports.push(`${path.relative(rendererDir, file)}:${lineNumber(text, start)} direct ${name}`)
      }
      cursor = close + 1
    }

    const hexPattern = /#[0-9a-fA-F]{3,8}\b/g
    let match: RegExpExecArray | null
    while ((match = hexPattern.exec(text))) {
      if (isInsideSemanticVar(text, match.index)) continue
      const lineStart = text.lastIndexOf('\n', match.index) + 1
      const lineEnd = text.indexOf('\n', match.index)
      const line = text.slice(lineStart, lineEnd === -1 ? text.length : lineEnd)
      if (line.includes('previewColors')) continue
      reports.push(`${path.relative(rendererDir, file)}:${lineNumber(text, match.index)} direct ${match[0]}`)
    }
  }

  return reports
}

describe('renderer UI semantic variables', () => {
  it('defines UI semantic tokens and routes tool chrome aliases through them', () => {
    const variables = readRendererFile('styles/variables.css')

    expect(variables).toContain('--ui-action-primary-bg')
    expect(variables).toContain('--ui-status-danger-fg')
    expect(variables).toContain('--ui-surface-note-bg')
    expect(variables).toContain('--color-primary')
    expect(variables).toContain('--color-neutral-primary-text')
    expect(variables).toContain('--text-color-regular')
    expect(variables).toContain('--border-color-extra-light')
    expect(variables).toContain('--fill-color-blank')
    expect(variables).toContain('--bg-color-overlay')
    expect(variables).toContain('--ui-surface-tooltip-border')
    expect(variables).toContain('--ui-surface-tooltip-shadow')
    expect(variables).toContain('--ui-surface-chat-panel-shadow')
    expect(variables).toContain('--ui-surface-composer-shadow')
    expect(variables).toContain('--ui-surface-code-inline-fg')
    expect(variables).toContain('--ui-surface-code-block-shadow')
    expect(variables).toContain('--ui-surface-preview-light-bg')
    expect(variables).toContain('--ui-sidebar-item-active-bg')
    expect(variables).toContain('--ui-tab-bar-item-active-bg')
    expect(variables).toContain('--ui-message-user-shadow')
    expect(variables).toContain('--ui-content-media-shadow')
    expect(variables).toContain('--ui-action-primary-shadow')
    expect(variables).toContain('--ui-tool-surface-bg')
    expect(variables).toContain('--ui-editor-caret-fg')
    expect(variables).toContain('--tool-surface: var(--ui-tool-surface-bg')
    expect(variables).toContain('--tool-ink: var(--ui-tool-text-fg')
    expect(variables).toContain('--tool-del-bar: var(--ui-tool-danger-text-fg')
  })

  it('routes high-value UI surfaces directly through UI semantic tokens', () => {
    const stepsPanel = readRendererFile('components/chat/StepsPanel.vue')
    const toolResultRenderer = readRendererFile('components/chat/ToolResultRenderer.vue')
    const toolStepDetails = readRendererFile('components/chat/ToolStepDetails.vue')
    const toolDiffPreview = readRendererFile('components/chat/ToolDiffPreview.vue')
    const messageBubble = readRendererFile('components/chat/message/MessageBubble.vue')
    const inputBox = readRendererFile('components/chat/InputBox.vue')
    const chatWindow = readRendererFile('components/chat/ChatWindow.vue')
    const chatContainer = readRendererFile('components/ChatContainer.vue')
    const settingsPage = readRendererFile('components/SettingsPage.vue')
    const sidebar = readRendererFile('components/sidebar/Sidebar.vue')
    const sessionItem = readRendererFile('components/sidebar/SessionItem.vue')
    const sessionContextMenu = readRendererFile('components/sidebar/SessionContextMenu.vue')
    const todoPlanWindow = readRendererFile('components/TodoPlanWindow.vue')
    const todoPlanPanel = readRendererFile('components/chat/TodoPlanPanel.vue')
    const todoNotesActionPanel = readRendererFile('components/chat/TodoNotesActionPanel.vue')
    const todoPopover = readRendererFile('components/chat/todo-popover.css')
    const tabBar = readRendererFile('components/chat/TabBar.vue')
    const tabItem = readRendererFile('components/chat/TabItem.vue')
    const tooltip = readRendererFile('components/common/Tooltip.vue')
    const editorExtensions = readRendererFile('editor/extensions.ts')
    const markdownStyles = readRendererFile('styles/markdown.css')

    expect(stepsPanel).toContain('var(--ui-tool-danger-text-fg')
    expect(toolResultRenderer).toContain('var(--ui-tool-surface-subtle-bg')
    expect(toolStepDetails).toContain('var(--ui-tool-surface-subtle-bg')
    expect(toolDiffPreview).toContain('var(--ui-tool-surface-subtle-bg')
    expect(messageBubble).toContain('var(--ui-message-user-bg')
    expect(messageBubble).toContain('var(--ui-message-user-shadow')
    expect(messageBubble).toContain('md-inline-code-scope')
    expect(inputBox).toContain('var(--ui-action-primary-bg')
    expect(inputBox).toContain('--ui-surface-composer-shadow')
    expect(inputBox).toContain('var(--ui-status-success-fg')
    expect(chatWindow).toContain('var(--ui-surface-chat-bg')
    expect(chatWindow).toContain('--ui-surface-chat-panel-shadow')
    expect(chatContainer).toContain('var(--ui-surface-chat-bg')
    const settingsPaperDefs = settingsPage.match(/--settings-paper:\s*var\(--ui-surface-[^)]+/g) ?? []
    const settingsSidebarDefs = settingsPage.match(/--settings-paper-2:\s*var\(--ui-sidebar-surface-bg/g) ?? []
    const settingsPanelDefs = settingsPage.match(/--settings-paper-3:\s*var\(--ui-surface-panel-bg/g) ?? []
    expect(settingsPaperDefs).toHaveLength(3)
    expect(settingsPaperDefs.every(def => def.includes('--ui-surface-chat-bg'))).toBe(true)
    expect(settingsSidebarDefs).toHaveLength(3)
    expect(settingsPanelDefs).toHaveLength(3)
    expect(sidebar).toContain('--ui-sidebar-surface-bg')
    expect(sessionItem).toContain('var(--ui-sidebar-item-active-bg')
    expect(sessionContextMenu).toContain('var(--ui-surface-menu-bg')
    expect(sessionContextMenu).toContain('var(--ui-surface-menu-hover-bg')
    expect(sessionContextMenu).toContain('var(--ui-surface-tooltip-shadow')
    expect(sessionContextMenu).toContain('var(--ui-status-danger-fg')
    expect(todoPlanWindow).toContain('var(--ui-surface-elevated-bg')
    expect(todoPlanPanel).toContain('var(--ui-surface-elevated-bg')
    expect(todoPlanPanel).toContain('var(--ui-border-default-border')
    expect(todoPlanPanel).toContain('var(--ui-status-danger-fg')
    expect(todoPlanPanel).toContain('--todo-popover-content-height')
    expect(todoPlanPanel).toContain('--todo-popover-height')
    expect(todoPlanPanel).not.toContain('--todo-popover-max-height')
    expect(todoPlanPanel).not.toContain('--todo-switcher-popover-max-height')
    expect(todoPlanPanel).not.toContain('--todo-action-popover-max-height')
    expect(todoPopover).toContain('var(--todo-popover-search-height')
    expect(todoPopover).toContain('var(--todo-popover-height')
    expect(todoNotesActionPanel).toContain('var(--todo-action-row-min-height')
    expect(tabBar).toContain('var(--ui-tab-bar-surface-bg')
    expect(tabItem).toContain('var(--ui-tab-bar-item-active-border')
    expect(tooltip).toContain('var(--ui-surface-tooltip-bg')
    expect(tooltip).toContain('var(--ui-surface-tooltip-fg')
    expect(editorExtensions).toContain('var(--ui-editor-caret-fg')
    expect(markdownStyles).toContain('--md-inline-code-bg')
    expect(markdownStyles).toContain('var(--ui-content-media-shadow')
  })

  it('keeps component colors routed through UI, highlight, or diff semantic variables', () => {
    expect(collectDirectLegacyColorUsage()).toEqual([])
  })

  it('keeps the todo window startup surface on semantic color fallbacks', () => {
    const html = fs.readFileSync(path.resolve(rendererDir, '..', '..', 'index.html'), 'utf8')
    const todoPlanWindow = readRendererFile('components/TodoPlanWindow.vue')
    const todoPlanPanel = readRendererFile('components/chat/TodoPlanPanel.vue')
    const todoNotesActionPanel = readRendererFile('components/chat/TodoNotesActionPanel.vue')
    const todoPopover = readRendererFile('components/chat/todo-popover.css')

    expect(html).not.toContain('#282726')
    expect(html).toContain('var(--ui-surface-app-bg')
    expect(todoPlanWindow).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/)
    expect(todoPlanPanel).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/)
    expect(todoNotesActionPanel).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/)
    expect(todoPopover).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/)
    expect(todoPlanPanel).toContain('padding: 0 0 0 18px')
    expect(todoPlanPanel).not.toContain('flush')
    expect(todoPlanPanel).toContain('overflow: hidden;')
    expect(todoPlanPanel).toContain('popover-open')
    expect(todoPlanPanel).not.toContain('surface-chat-floating-card.action-panel-open')
  })
})
