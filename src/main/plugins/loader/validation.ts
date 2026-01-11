/**
 * Plugin Validation
 *
 * Validates plugin definitions to ensure they meet requirements
 * before being loaded into the system.
 */

import type { PluginDefinition, PluginMetadata } from '../types.js'

/**
 * Validation error with details
 */
export class PluginValidationError extends Error {
  constructor(
    message: string,
    public readonly pluginId?: string,
    public readonly field?: string,
  ) {
    super(message)
    this.name = 'PluginValidationError'
  }
}

/**
 * Validate plugin ID format
 * - Must be lowercase
 * - Can contain letters, numbers, and hyphens
 * - Must start with a letter
 * - Length: 2-50 characters
 */
function validatePluginId(id: string): void {
  if (!id || typeof id !== 'string') {
    throw new PluginValidationError('Plugin ID is required', undefined, 'id')
  }

  if (id.length < 2 || id.length > 50) {
    throw new PluginValidationError('Plugin ID must be 2-50 characters', id, 'id')
  }

  if (!/^[a-z][a-z0-9-]*$/.test(id)) {
    throw new PluginValidationError(
      'Plugin ID must be lowercase, start with a letter, and contain only letters, numbers, and hyphens',
      id,
      'id',
    )
  }
}

/**
 * Validate plugin version (semver-like)
 */
function validateVersion(version: string, pluginId: string): void {
  if (!version || typeof version !== 'string') {
    throw new PluginValidationError('Plugin version is required', pluginId, 'version')
  }

  // Basic semver validation (x.y.z with optional pre-release)
  if (!/^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?$/.test(version)) {
    throw new PluginValidationError(
      'Plugin version must be semver format (e.g., 1.0.0)',
      pluginId,
      'version',
    )
  }
}

/**
 * Validate plugin metadata
 */
function validateMetadata(meta: PluginMetadata): void {
  validatePluginId(meta.id)

  if (!meta.name || typeof meta.name !== 'string') {
    throw new PluginValidationError('Plugin name is required', meta.id, 'name')
  }

  if (meta.name.length > 100) {
    throw new PluginValidationError('Plugin name must be 100 characters or less', meta.id, 'name')
  }

  validateVersion(meta.version, meta.id)

  if (meta.description && meta.description.length > 500) {
    throw new PluginValidationError(
      'Plugin description must be 500 characters or less',
      meta.id,
      'description',
    )
  }
}

/**
 * Validate the init function
 */
function validateInit(init: unknown, pluginId: string): void {
  if (typeof init !== 'function') {
    throw new PluginValidationError('Plugin init must be a function', pluginId, 'init')
  }
}

/**
 * Validate a complete plugin definition
 * @param definition - The plugin definition to validate
 * @throws PluginValidationError if validation fails
 */
export function validatePlugin(definition: unknown): asserts definition is PluginDefinition {
  if (!definition || typeof definition !== 'object') {
    throw new PluginValidationError('Plugin definition must be an object')
  }

  const def = definition as Record<string, unknown>

  if (!def.meta || typeof def.meta !== 'object') {
    throw new PluginValidationError('Plugin must have a meta object')
  }

  validateMetadata(def.meta as PluginMetadata)
  validateInit(def.init, (def.meta as PluginMetadata).id)
}

/**
 * Validate hooks returned by plugin init
 * @param hooks - The hooks object to validate
 * @param pluginId - The plugin ID for error messages
 */
export function validateHooks(hooks: unknown, pluginId: string): void {
  if (!hooks || typeof hooks !== 'object') {
    throw new PluginValidationError('Plugin init must return a hooks object', pluginId, 'hooks')
  }

  const validHookNames = new Set([
    'app:init',
    'app:quit',
    'config:change',
    'message:pre',
    'message:post',
    'params:pre',
    'tool:pre',
    'tool:post',
    'tool:register',
    'permission:check',
    'session:create',
    'session:switch',
    'event:custom',
  ])

  for (const [key, value] of Object.entries(hooks as Record<string, unknown>)) {
    if (!validHookNames.has(key)) {
      console.warn(`[PluginValidation] Unknown hook "${key}" in plugin ${pluginId}, ignoring`)
      continue
    }

    if (value !== undefined && typeof value !== 'function') {
      throw new PluginValidationError(
        `Hook "${key}" must be a function`,
        pluginId,
        `hooks.${key}`,
      )
    }
  }
}

/**
 * Safe validation that returns result instead of throwing
 */
export function safeValidatePlugin(definition: unknown): {
  valid: boolean
  error?: string
  pluginId?: string
} {
  try {
    validatePlugin(definition)
    return { valid: true }
  } catch (error) {
    if (error instanceof PluginValidationError) {
      return {
        valid: false,
        error: error.message,
        pluginId: error.pluginId,
      }
    }
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Unknown validation error',
    }
  }
}
