import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { describe, expect, it } from 'vitest'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const rendererDir = path.resolve(dirname, '..', '..')
const componentStyleRoots = ['components', 'editor']
const styleFileExtensions = new Set(['.vue', '.ts', '.css'])
const legacyColorVars = new Set([
  '--accent',
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
  return !!name && (/^--ui-/.test(name) || /^--hg-/.test(name) || /^--diff-/.test(name))
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
  const files = componentStyleRoots.flatMap((root) => listStyleFiles(path.join(rendererDir, root)))

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
    expect(variables).toContain('--ui-surface-preview-light-bg')
    expect(variables).toContain('--ui-sidebar-item-active-bg')
    expect(variables).toContain('--ui-tab-bar-item-active-bg')
    expect(variables).toContain('--ui-tool-surface-bg')
    expect(variables).toContain('--ui-editor-caret-fg')
    expect(variables).toContain('--tool-surface: var(--ui-tool-surface-bg')
    expect(variables).toContain('--tool-ink: var(--ui-tool-text-fg')
    expect(variables).toContain('--tool-del-bar: var(--ui-tool-danger-text-fg')
  })

  it('routes high-value UI surfaces directly through UI semantic tokens', () => {
    const stepsPanel = readRendererFile('components/chat/StepsPanel.vue')
    const toolDiffPreview = readRendererFile('components/chat/ToolDiffPreview.vue')
    const messageBubble = readRendererFile('components/chat/message/MessageBubble.vue')
    const inputBox = readRendererFile('components/chat/InputBox.vue')
    const sidebar = readRendererFile('components/sidebar/Sidebar.vue')
    const sessionItem = readRendererFile('components/sidebar/SessionItem.vue')
    const tabBar = readRendererFile('components/chat/TabBar.vue')
    const tabItem = readRendererFile('components/chat/TabItem.vue')
    const editorExtensions = readRendererFile('editor/extensions.ts')

    expect(stepsPanel).toContain('var(--ui-tool-surface-bg')
    expect(stepsPanel).toContain('var(--ui-tool-danger-text-fg')
    expect(toolDiffPreview).toContain('var(--ui-tool-surface-subtle-bg')
    expect(messageBubble).toContain('var(--ui-message-user-bg')
    expect(inputBox).toContain('var(--ui-action-primary-bg')
    expect(inputBox).toContain('var(--ui-status-success-fg')
    expect(sidebar).toContain('--ui-sidebar-surface-bg')
    expect(sessionItem).toContain('var(--ui-sidebar-item-active-bg')
    expect(tabBar).toContain('var(--ui-tab-bar-surface-bg')
    expect(tabItem).toContain('var(--ui-tab-bar-item-active-border')
    expect(editorExtensions).toContain('var(--ui-editor-caret-fg')
  })

  it('keeps component colors routed through UI, highlight, or diff semantic variables', () => {
    expect(collectDirectLegacyColorUsage()).toEqual([])
  })
})
