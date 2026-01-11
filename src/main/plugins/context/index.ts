/**
 * Plugin Input Factory
 *
 * Creates the PluginInput object that gets passed to plugin init functions.
 * Contains all the context and utilities a plugin needs to operate.
 */

import { app } from 'electron'
import type { PluginInput, PluginConfig, PluginLogger, ElectronContext } from '../types.js'
import { createShellHelper } from './shell.js'

/**
 * Create a logger for a specific plugin
 * @param pluginId - The plugin ID for log prefixing
 */
function createPluginLogger(pluginId: string): PluginLogger {
  const prefix = `[Plugin:${pluginId}]`

  return {
    info(message: string, ...args: unknown[]): void {
      console.log(prefix, message, ...args)
    },
    warn(message: string, ...args: unknown[]): void {
      console.warn(prefix, message, ...args)
    },
    error(message: string, ...args: unknown[]): void {
      console.error(prefix, message, ...args)
    },
    debug(message: string, ...args: unknown[]): void {
      if (process.env.NODE_ENV === 'development') {
        console.debug(prefix, message, ...args)
      }
    },
  }
}

/**
 * Get Electron context information
 */
function getElectronContext(): ElectronContext {
  return {
    version: app.getVersion(),
    platform: process.platform,
    isDev: process.env.NODE_ENV === 'development',
    userDataPath: app.getPath('userData'),
    resourcesPath: process.resourcesPath || app.getAppPath(),
  }
}

/**
 * Create PluginInput for a plugin
 *
 * @param config - The plugin configuration
 * @param options - Additional options
 */
export function createPluginInput(
  config: PluginConfig,
  options?: {
    directory?: string
    project?: string
  },
): PluginInput {
  const directory = options?.directory || process.cwd()

  return {
    electron: getElectronContext(),
    directory,
    project: options?.project,
    $shell: createShellHelper(directory),
    logger: createPluginLogger(config.id),
    config: config.config || {},
  }
}

/**
 * Update session context in PluginInput
 * (Called when session changes)
 */
export function updatePluginInputSession(
  input: PluginInput,
  session: {
    id: string
    workingDirectory?: string
    agentId?: string
    providerId?: string
    model?: string
  },
): PluginInput {
  return {
    ...input,
    session: {
      id: session.id,
      workingDirectory: session.workingDirectory,
      agentId: session.agentId,
      providerId: session.providerId,
      model: session.model,
    },
    // Update shell helper with session's working directory
    $shell: createShellHelper(session.workingDirectory || input.directory),
  }
}

export { createShellHelper }
