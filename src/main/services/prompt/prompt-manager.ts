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
import type { TemplateName, TemplateVariables, OSType } from './types.js'

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
  private templatesPath: string
  private initialized: boolean
  private readonly isDev: boolean

  constructor() {
    // Create isolated Handlebars instance
    this.handlebars = Handlebars.create()
    this.templateCache = new Map()
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
      // Development: resources/templates relative to project root
      const projectRoot = path.resolve(app.getAppPath(), '..', '..')
      this.templatesPath = path.join(projectRoot, 'resources', 'templates')
    } else {
      // Production: process.resourcesPath contains copied resources
      this.templatesPath = path.join(process.resourcesPath, 'templates')
    }

    // Register custom helpers
    registerHelpers(this.handlebars)

    // Register partials
    await this.registerPartials()

    this.initialized = true
    console.log(`[PromptManager] Initialized with templates at: ${this.templatesPath}`)
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

        const content = fs.readFileSync(fullPath, 'utf-8')
        this.handlebars.registerPartial(partialName, content)
        console.log(`[PromptManager] Registered partial: ${partialName}`)
      }
    }
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
      return template(variables).trim()
    } catch (error) {
      console.error(`[PromptManager] Failed to render template ${templateName}:`, error)
      throw error
    }
  }

  /**
   * Render a partial directly (for testing/debugging)
   */
  renderPartial(partialName: string, variables: Record<string, unknown> = {}): string {
    const partial = this.handlebars.partials[partialName]
    if (!partial) {
      throw new Error(`Partial not found: ${partialName}`)
    }

    if (typeof partial === 'function') {
      return (partial as Handlebars.TemplateDelegate)(variables)
    }

    // Compile string partial
    const template = this.handlebars.compile(partial as string, { noEscape: true })
    return template(variables)
  }

  /**
   * Clear the template cache (useful for hot reloading in dev)
   */
  clearCache(): void {
    this.templateCache.clear()
    console.log('[PromptManager] Template cache cleared')
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

    // Re-register
    await this.registerPartials()
    console.log('[PromptManager] Partials reloaded')
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
