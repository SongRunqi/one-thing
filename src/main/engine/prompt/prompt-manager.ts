/**
 * Prompt Manager
 *
 * Centralized template-based prompt management using Handlebars.
 * Supports variable interpolation, conditionals, and partials.
 */

import Handlebars from 'handlebars'
import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import { registerHelpers } from './helpers.js'
import type { TemplateName, TemplateVariables, OSType, PromptSegment } from './types.js'

// Sentinels used to mark which partial each rendered chunk came from.
// Control characters that should never appear in legitimate template content.
const SRC_OPEN = '\u0001__SRC__'
const SRC_CLOSE_TAG = '__\u0002'
const SRC_END = '\u0001__/SRC__\u0002'
// eslint-disable-next-line no-control-regex -- intentional: matches the sentinel control chars above
const SENTINEL_RE = /\u0001__SRC__([^\u0002]+)__\u0002|\u0001__\/SRC__\u0002/g

/**
 * Cache entry for compiled templates
 */
interface TemplateCacheEntry {
  template: Handlebars.TemplateDelegate
  mtime: number
}

/**
 * PromptManager class
 * Manages Handlebars templates for system prompts
 */
class PromptManager {
  private handlebars: typeof Handlebars
  private templateCache: Map<string, TemplateCacheEntry>
  private partialMtimes: Map<string, number>
  private templatesPath: string
  private initialized: boolean
  private readonly isDev: boolean
  private _partialNames: string[] = []

  constructor() {
    // Create isolated Handlebars instance
    this.handlebars = Handlebars.create()
    this.templateCache = new Map()
    this.partialMtimes = new Map()
    this.initialized = false
    this.isDev = !app.isPackaged
    this.templatesPath = ''
  }

  /**
   * Initialize the PromptManager
   * Must be called after app is ready
   */
  async initialize(): Promise<void> {
    if (this.initialized) return

    // Set templates path based on environment
    if (this.isDev) {
      // Development: use process.cwd() which is the project root when using electron-vite
      this.templatesPath = path.join(process.cwd(), 'resources', 'templates')
    } else {
      // Production: process.resourcesPath contains copied resources
      this.templatesPath = path.join(process.resourcesPath, 'templates')
    }

    // Register custom helpers
    registerHelpers(this.handlebars)

    // Register partials
    await this.registerPartials()

    this.initialized = true
    console.log(`[PromptManager] Initialized with ${this._partialNames.length} partials [${this._partialNames.join(', ')}]`)
  }

  /**
   * Register all partials from the partials directory
   */
  private async registerPartials(): Promise<void> {
    const partialsDir = path.join(this.templatesPath, 'partials')

    if (!fs.existsSync(partialsDir)) {
      console.warn(`[PromptManager] Partials directory not found: ${partialsDir}`)
      return
    }

    await this.registerPartialsRecursive(partialsDir, '')
  }

  /**
   * Recursively register partials from a directory
   */
  private async registerPartialsRecursive(dir: string, prefix: string): Promise<void> {
    const entries = fs.readdirSync(dir, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)

      if (entry.isDirectory()) {
        const newPrefix = prefix ? `${prefix}/${entry.name}` : entry.name
        await this.registerPartialsRecursive(fullPath, newPrefix)
      } else if (entry.name.endsWith('.hbs')) {
        const partialName = prefix
          ? `${prefix}/${entry.name.replace('.hbs', '')}`
          : entry.name.replace('.hbs', '')

        this.registerPartialFromFile(partialName, fullPath)
        this._partialNames.push(partialName)
      }
    }
  }

  private registerPartialFromFile(partialName: string, fullPath: string): void {
    const content = fs.readFileSync(fullPath, 'utf-8')
    const stats = fs.statSync(fullPath)
    // Wrap with sentinels so the rendered output preserves the source
    // attribution for each chunk. Stripped before being sent to the LLM.
    const wrapped = `${SRC_OPEN}partials/${partialName}${SRC_CLOSE_TAG}${content}${SRC_END}`
    this.handlebars.registerPartial(partialName, wrapped)
    this.partialMtimes.set(partialName, stats.mtimeMs)
  }

  private getPartialPath(partialName: string): string {
    return path.join(this.templatesPath, 'partials', `${partialName}.hbs`)
  }

  private refreshPartialIfChanged(partialName: string): void {
    if (!this.isDev) return

    const fullPath = this.getPartialPath(partialName)
    if (!fs.existsSync(fullPath)) return

    const stats = fs.statSync(fullPath)
    if (this.partialMtimes.get(partialName) === stats.mtimeMs) return

    this.registerPartialFromFile(partialName, fullPath)
  }

  /**
   * Get or compile a template
   */
  private getTemplate(templatePath: string): Handlebars.TemplateDelegate {
    const fullPath = path.join(this.templatesPath, templatePath + '.hbs')

    // Check if file exists
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Template not found: ${fullPath}`)
    }

    const stats = fs.statSync(fullPath)
    const cached = this.templateCache.get(templatePath)

    // Return cached template if still valid (same mtime)
    // In dev mode, always check mtime for hot reload support
    if (cached && (!this.isDev || cached.mtime === stats.mtimeMs)) {
      return cached.template
    }

    // Compile and cache
    const source = fs.readFileSync(fullPath, 'utf-8')
    const template = this.handlebars.compile(source, {
      noEscape: true, // Don't escape HTML entities (we want raw output)
      strict: false, // Allow missing variables
    })

    this.templateCache.set(templatePath, {
      template,
      mtime: stats.mtimeMs,
    })

    return template
  }

  /**
   * Render a template with variables
   */
  render<T extends TemplateVariables>(templateName: TemplateName, variables: T): string {
    if (!this.initialized) {
      throw new Error('[PromptManager] Not initialized. Call initialize() first.')
    }

    try {
      const template = this.getTemplate(templateName)
      return stripSentinels(template(variables)).trim()
    } catch (error) {
      console.error(`[PromptManager] Failed to render template ${templateName}:`, error)
      throw error
    }
  }

  /**
   * Render a template and return the clean text plus per-source segments.
   * Each segment is attributed to a `.hbs` template path (relative to
   * resources/templates, no extension). Useful for the inspector UI.
   */
  renderWithSegments<T extends TemplateVariables>(
    templateName: TemplateName,
    variables: T,
  ): { text: string; segments: PromptSegment[] } {
    if (!this.initialized) {
      throw new Error('[PromptManager] Not initialized. Call initialize() first.')
    }

    const template = this.getTemplate(templateName)
    const raw = template(variables)
    const segments = parseSegments(raw, templateName)
    for (const seg of segments) {
      seg.absolutePath = path.join(this.templatesPath, seg.source + '.hbs')
    }
    const text = stripSentinels(raw).trim()
    return { text, segments }
  }

  /**
   * Render a partial directly (for testing/debugging)
   */
  renderPartial(partialName: string, variables: Record<string, unknown> = {}): string {
    this.refreshPartialIfChanged(partialName)
    const partial = this.handlebars.partials[partialName]
    if (!partial) {
      throw new Error(`Partial not found: ${partialName}`)
    }

    if (typeof partial === 'function') {
      return stripSentinels((partial as Handlebars.TemplateDelegate)(variables)).trim()
    }

    // Compile string partial
    const template = this.handlebars.compile(partial as string, { noEscape: true })
    return stripSentinels(template(variables)).trim()
  }

  /**
   * Clear the template cache (useful for hot reloading in dev)
   */
  clearCache(): void {
    this.templateCache.clear()
  }

  /**
   * Reload all partials (useful for hot reloading in dev)
   */
  async reloadPartials(): Promise<void> {
    // Clear existing partials
    const partialNames = Object.keys(this.handlebars.partials)
    for (const name of partialNames) {
      delete this.handlebars.partials[name]
    }
    this.partialMtimes.clear()

    // Re-register
    this._partialNames = []
    await this.registerPartials()
  }

  /**
   * Get the templates directory path (for debugging)
   */
  getTemplatesPath(): string {
    return this.templatesPath
  }

  /**
   * Check if initialized
   */
  isInitialized(): boolean {
    return this.initialized
  }

  /**
   * Detect current OS type
   */
  static detectOSType(): OSType {
    switch (process.platform) {
      case 'darwin':
        return 'macos'
      case 'win32':
        return 'windows'
      default:
        return 'linux'
    }
  }
}


function stripSentinels(s: string): string {
  return s.replace(SENTINEL_RE, '')
}

/**
 * Parse sentinel-marked rendered output into ordered segments.
 * Each text chunk is attributed to the innermost open partial; chunks
 * outside any partial belong to the top-level template (rootSource).
 * Adjacent chunks with the same source are merged.
 */
function parseSegments(raw: string, rootSource: string): PromptSegment[] {
  const segments: PromptSegment[] = []
  const stack: string[] = [rootSource]
  let cursor = 0

  const push = (source: string, content: string) => {
    if (!content) return
    const last = segments[segments.length - 1]
    if (last && last.source === source) {
      last.content += content
    } else {
      segments.push({ source, content })
    }
  }

  SENTINEL_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = SENTINEL_RE.exec(raw)) !== null) {
    if (m.index > cursor) {
      push(stack[stack.length - 1] ?? rootSource, raw.slice(cursor, m.index))
    }
    if (m[1] !== undefined) {
      stack.push(m[1])
    } else {
      stack.pop()
    }
    cursor = m.index + m[0].length
  }
  if (cursor < raw.length) {
    push(stack[stack.length - 1] ?? rootSource, raw.slice(cursor))
  }

  if (segments.length > 0) {
    segments[0].content = segments[0].content.replace(/^\s+/, '')
    const lastIdx = segments.length - 1
    segments[lastIdx].content = segments[lastIdx].content.replace(/\s+$/, '')
  }
  // Drop whitespace-only segments — they're glue between partials in the
  // parent template and shouldn't show up as their own row in the inspector.
  return segments.filter((s) => s.content.trim().length > 0)
}

// ============================================================================
// Singleton Export
// ============================================================================

let promptManagerInstance: PromptManager | null = null

/**
 * Get the PromptManager singleton
 */
export function getPromptManager(): PromptManager {
  if (!promptManagerInstance) {
    promptManagerInstance = new PromptManager()
  }
  return promptManagerInstance
}

/**
 * Initialize the PromptManager (call after app ready)
 */
export async function initializePromptManager(): Promise<void> {
  const manager = getPromptManager()
  await manager.initialize()
}

// Re-export PromptManager class for type usage
export { PromptManager }
