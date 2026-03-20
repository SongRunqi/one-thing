/**
 * Template Hot Reload Watcher
 *
 * Watches template files for changes and triggers recompilation.
 * Only active in development mode.
 */

import { watch, type FSWatcher } from 'fs'
import path from 'path'
import { app } from 'electron'
import { getPromptManager } from './prompt-manager.js'

let watcher: FSWatcher | null = null
let debounceTimer: NodeJS.Timeout | null = null

/**
 * Start watching template files for changes
 * Only works in development mode
 */
export function startTemplateWatcher(): void {
  // Only watch in development
  if (app.isPackaged) {
    console.log('[TemplateWatcher] Skipping in production mode')
    return
  }

  const pm = getPromptManager()
  if (!pm.isInitialized()) {
    console.warn('[TemplateWatcher] PromptManager not initialized, skipping watcher setup')
    return
  }

  const templatesPath = pm.getTemplatesPath()

  try {
    // Use recursive watching
    watcher = watch(templatesPath, { recursive: true }, (eventType, filename) => {
      if (!filename || !filename.endsWith('.hbs')) return

      // Debounce rapid changes
      if (debounceTimer) {
        clearTimeout(debounceTimer)
      }

      debounceTimer = setTimeout(async () => {
        console.log(`[TemplateWatcher] File changed: ${filename}`)

        // Check if it's a partial (in partials/ directory)
        const isPartial = filename.startsWith('partials')

        if (isPartial) {
          // Reload all partials
          await pm.reloadPartials()
        }

        // Clear template cache to force recompilation
        pm.clearCache()

        console.log('[TemplateWatcher] Templates reloaded')
      }, 100) // 100ms debounce
    })

    console.log(`[TemplateWatcher] Watching templates at: ${templatesPath}`)
  } catch (error) {
    console.error('[TemplateWatcher] Failed to start watcher:', error)
  }
}

/**
 * Stop watching template files
 */
export function stopTemplateWatcher(): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }

  if (watcher) {
    watcher.close()
    watcher = null
    console.log('[TemplateWatcher] Stopped watching templates')
  }
}
