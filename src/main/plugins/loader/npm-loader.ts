/**
 * NPM Plugin Loader
 *
 * Loads plugins from NPM packages.
 * Installs packages to a local cache directory and loads them.
 */

import * as fs from 'fs'
import * as path from 'path'
import { spawn } from 'child_process'
import { pathToFileURL } from 'url'
import type { PluginDefinition } from '../types.js'

/**
 * Parse NPM package specifier
 * Supports: package-name, package-name@version, @scope/package-name@version
 */
export function parsePackageSpecifier(specifier: string): {
  name: string
  version?: string
  scope?: string
} {
  // Handle scoped packages
  if (specifier.startsWith('@')) {
    const match = specifier.match(/^(@[^/]+\/[^@]+)(?:@(.+))?$/)
    if (!match) {
      throw new Error(`Invalid scoped package specifier: ${specifier}`)
    }
    const [, fullName, version] = match
    const [scope, name] = fullName.split('/')
    return { name, scope, version }
  }

  // Handle unscoped packages
  const lastAtIndex = specifier.lastIndexOf('@')
  if (lastAtIndex > 0) {
    return {
      name: specifier.substring(0, lastAtIndex),
      version: specifier.substring(lastAtIndex + 1),
    }
  }

  return { name: specifier }
}

/**
 * Get the installation directory for a package
 */
function getPackageDir(cachePath: string, packageName: string, scope?: string): string {
  if (scope) {
    return path.join(cachePath, 'node_modules', scope, packageName)
  }
  return path.join(cachePath, 'node_modules', packageName)
}

/**
 * Check if a package is already installed
 */
function isPackageInstalled(
  cachePath: string,
  packageName: string,
  version?: string,
  scope?: string,
): boolean {
  const packageDir = getPackageDir(cachePath, packageName, scope)
  const packageJsonPath = path.join(packageDir, 'package.json')

  if (!fs.existsSync(packageJsonPath)) {
    return false
  }

  if (!version) {
    return true
  }

  try {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'))
    return packageJson.version === version
  } catch {
    return false
  }
}

/**
 * Install an NPM package to the cache directory
 */
async function installPackage(
  cachePath: string,
  specifier: string,
): Promise<void> {
  // Ensure cache directory exists with package.json
  if (!fs.existsSync(cachePath)) {
    fs.mkdirSync(cachePath, { recursive: true })
  }

  const packageJsonPath = path.join(cachePath, 'package.json')
  if (!fs.existsSync(packageJsonPath)) {
    fs.writeFileSync(
      packageJsonPath,
      JSON.stringify({ name: 'plugin-cache', private: true }, null, 2),
    )
  }

  return new Promise((resolve, reject) => {
    const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
    const child = spawn(npm, ['install', specifier, '--save'], {
      cwd: cachePath,
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    let stderr = ''
    child.stderr?.on('data', (data) => {
      stderr += data.toString()
    })

    child.on('close', (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`npm install failed: ${stderr}`))
      }
    })

    child.on('error', (error) => {
      reject(new Error(`npm install error: ${error.message}`))
    })
  })
}

/**
 * Load a plugin from an NPM package
 *
 * @param packageSpecifier - NPM package specifier (e.g., "my-plugin@1.0.0")
 * @param cachePath - Path to the NPM cache directory
 * @returns Plugin definition
 */
export async function loadNpmPlugin(
  packageSpecifier: string,
  cachePath: string,
): Promise<PluginDefinition> {
  const { name, version, scope } = parsePackageSpecifier(packageSpecifier)
  const fullName = scope ? `${scope}/${name}` : name

  // Check if already installed
  if (!isPackageInstalled(cachePath, name, version, scope)) {
    console.log(`[NpmLoader] Installing plugin: ${packageSpecifier}`)
    await installPackage(cachePath, packageSpecifier)
  }

  const packageDir = getPackageDir(cachePath, name, scope)
  const packageJsonPath = path.join(packageDir, 'package.json')

  if (!fs.existsSync(packageJsonPath)) {
    throw new Error(`Package not found after installation: ${fullName}`)
  }

  // Read package.json to find entry point
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'))
  const main = packageJson.main || 'index.js'
  const entryPoint = path.join(packageDir, main)

  if (!fs.existsSync(entryPoint)) {
    throw new Error(`Entry point not found: ${entryPoint}`)
  }

  // Convert to file URL for ESM import
  const fileUrl = pathToFileURL(entryPoint).href

  try {
    const module = await import(fileUrl)

    // Support both default export and named export patterns
    const definition = module.default || module

    if (definition.meta && definition.init) {
      return definition as PluginDefinition
    }

    // If the module exports multiple items, look for a plugin definition
    for (const [, value] of Object.entries(module)) {
      if (value && typeof value === 'object' && 'meta' in value && 'init' in value) {
        return value as PluginDefinition
      }
    }

    throw new Error('No valid plugin definition found in module')
  } catch (error: any) {
    throw new Error(`Failed to load plugin from ${fullName}: ${error.message}`)
  }
}

/**
 * Uninstall an NPM package from the cache
 */
export async function uninstallNpmPlugin(
  packageName: string,
  cachePath: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
    const child = spawn(npm, ['uninstall', packageName], {
      cwd: cachePath,
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    let stderr = ''
    child.stderr?.on('data', (data) => {
      stderr += data.toString()
    })

    child.on('close', (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`npm uninstall failed: ${stderr}`))
      }
    })

    child.on('error', (error) => {
      reject(new Error(`npm uninstall error: ${error.message}`))
    })
  })
}

/**
 * List installed NPM plugins
 */
export function listInstalledNpmPlugins(cachePath: string): string[] {
  const nodeModulesPath = path.join(cachePath, 'node_modules')
  if (!fs.existsSync(nodeModulesPath)) {
    return []
  }

  const packages: string[] = []
  const entries = fs.readdirSync(nodeModulesPath, { withFileTypes: true })

  for (const entry of entries) {
    if (!entry.isDirectory()) continue

    // Handle scoped packages
    if (entry.name.startsWith('@')) {
      const scopePath = path.join(nodeModulesPath, entry.name)
      const scopedEntries = fs.readdirSync(scopePath, { withFileTypes: true })
      for (const scopedEntry of scopedEntries) {
        if (scopedEntry.isDirectory()) {
          packages.push(`${entry.name}/${scopedEntry.name}`)
        }
      }
    } else if (!entry.name.startsWith('.')) {
      packages.push(entry.name)
    }
  }

  return packages
}
