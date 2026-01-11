/**
 * Local Plugin Loader
 *
 * Loads plugins from local filesystem paths.
 * Supports both single-file plugins and directory plugins with package.json.
 */

import * as fs from 'fs'
import * as path from 'path'
import { pathToFileURL } from 'url'
import type { PluginDefinition } from '../types.js'

/**
 * Check if a path is a valid plugin directory
 */
function isPluginDirectory(dirPath: string): boolean {
  const packageJsonPath = path.join(dirPath, 'package.json')
  const indexPath = path.join(dirPath, 'index.js')
  const indexTsPath = path.join(dirPath, 'index.ts')

  return fs.existsSync(packageJsonPath) || fs.existsSync(indexPath) || fs.existsSync(indexTsPath)
}

/**
 * Get the entry point for a plugin directory
 */
function getEntryPoint(dirPath: string): string {
  const packageJsonPath = path.join(dirPath, 'package.json')

  // Check package.json for main field
  if (fs.existsSync(packageJsonPath)) {
    try {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'))
      if (packageJson.main) {
        return path.join(dirPath, packageJson.main)
      }
    } catch {
      // Ignore parse errors, try default entry points
    }
  }

  // Try default entry points
  const candidates = ['index.js', 'index.mjs', 'index.ts', 'dist/index.js', 'dist/index.mjs']

  for (const candidate of candidates) {
    const candidatePath = path.join(dirPath, candidate)
    if (fs.existsSync(candidatePath)) {
      return candidatePath
    }
  }

  throw new Error(`No entry point found in plugin directory: ${dirPath}`)
}

/**
 * Load a plugin from a local path
 *
 * @param localPath - Path to plugin file or directory
 * @returns Plugin definition
 */
export async function loadLocalPlugin(localPath: string): Promise<PluginDefinition> {
  // Resolve to absolute path
  const absolutePath = path.isAbsolute(localPath) ? localPath : path.resolve(process.cwd(), localPath)

  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Plugin path does not exist: ${absolutePath}`)
  }

  const stats = fs.statSync(absolutePath)
  let entryPoint: string

  if (stats.isDirectory()) {
    if (!isPluginDirectory(absolutePath)) {
      throw new Error(`Invalid plugin directory (no entry point found): ${absolutePath}`)
    }
    entryPoint = getEntryPoint(absolutePath)
  } else if (stats.isFile()) {
    entryPoint = absolutePath
  } else {
    throw new Error(`Invalid plugin path: ${absolutePath}`)
  }

  // Convert to file URL for ESM import
  const fileUrl = pathToFileURL(entryPoint).href

  try {
    // Dynamic import
    const module = await import(fileUrl)

    // Support both default export and named export patterns
    const definition = module.default || module

    // If the module exports a PluginDefinition directly
    if (definition.meta && definition.init) {
      return definition as PluginDefinition
    }

    // If the module exports multiple items, look for a plugin definition
    for (const [key, value] of Object.entries(module)) {
      if (value && typeof value === 'object' && 'meta' in value && 'init' in value) {
        return value as PluginDefinition
      }
    }

    throw new Error('No valid plugin definition found in module')
  } catch (error: any) {
    throw new Error(`Failed to load plugin from ${entryPoint}: ${error.message}`)
  }
}

/**
 * Discover plugins in a directory
 *
 * @param pluginsDir - Directory containing plugins
 * @returns Array of discovered plugin paths
 */
export async function discoverLocalPlugins(pluginsDir: string): Promise<string[]> {
  if (!fs.existsSync(pluginsDir)) {
    return []
  }

  const entries = fs.readdirSync(pluginsDir, { withFileTypes: true })
  const plugins: string[] = []

  for (const entry of entries) {
    const entryPath = path.join(pluginsDir, entry.name)

    if (entry.isDirectory()) {
      // Check if it's a valid plugin directory
      if (isPluginDirectory(entryPath)) {
        plugins.push(entryPath)
      }
    } else if (entry.isFile()) {
      // Accept .js, .mjs, .ts files
      if (/\.(js|mjs|ts)$/.test(entry.name)) {
        plugins.push(entryPath)
      }
    }
  }

  return plugins
}

/**
 * Watch a plugins directory for changes
 * (For hot-reload in development)
 */
export function watchPluginsDirectory(
  pluginsDir: string,
  onChange: (event: 'add' | 'remove' | 'change', pluginPath: string) => void,
): () => void {
  if (!fs.existsSync(pluginsDir)) {
    console.warn(`[LocalLoader] Plugins directory does not exist: ${pluginsDir}`)
    return () => {}
  }

  const watcher = fs.watch(pluginsDir, { recursive: true }, (eventType, filename) => {
    if (!filename) return

    const fullPath = path.join(pluginsDir, filename)

    // Only care about plugin files
    if (!/\.(js|mjs|ts|json)$/.test(filename)) {
      return
    }

    if (eventType === 'rename') {
      if (fs.existsSync(fullPath)) {
        onChange('add', fullPath)
      } else {
        onChange('remove', fullPath)
      }
    } else if (eventType === 'change') {
      onChange('change', fullPath)
    }
  })

  return () => {
    watcher.close()
  }
}
