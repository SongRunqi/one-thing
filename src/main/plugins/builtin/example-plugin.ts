/**
 * Example Plugin
 *
 * This is an example plugin demonstrating the plugin system capabilities.
 * It shows how to implement various hooks and interact with the app.
 *
 * To use this as a template:
 * 1. Copy this file to ~/.0neThing/plugins/local/my-plugin/index.ts
 * 2. Modify the meta and hooks to suit your needs
 * 3. The plugin will be automatically discovered and loaded
 */

import type { PluginDefinition, PluginInput, Hooks } from '../types.js'

/**
 * Example plugin that logs events and demonstrates hook usage
 */
const examplePlugin: PluginDefinition = {
  meta: {
    id: 'example-plugin',
    name: 'Example Plugin',
    version: '1.0.0',
    description: 'An example plugin demonstrating the plugin system',
    author: '0neThing',
  },

  init: async (input: PluginInput): Promise<Hooks> => {
    const { logger, electron, directory } = input

    logger.info('Example plugin initialized!')
    logger.info(`Running on ${electron.platform}, version ${electron.version}`)
    logger.info(`Working directory: ${directory}`)

    return {
      // Lifecycle hooks
      'app:init': async () => {
        logger.info('App initialized - example plugin ready')
      },

      'app:quit': async () => {
        logger.info('App quitting - cleaning up example plugin')
      },

      // Message hooks
      'message:post': async ({ userMessage, assistantMessage, usage }) => {
        logger.debug(`Message exchange completed`)
        logger.debug(`User: ${userMessage.substring(0, 50)}...`)
        logger.debug(`Assistant: ${assistantMessage.substring(0, 50)}...`)
        if (usage) {
          logger.debug(`Tokens: ${usage.inputTokens} in, ${usage.outputTokens} out`)
        }
      },

      // Tool hooks
      'tool:pre': async ({ toolName, args }) => {
        logger.debug(`Tool about to execute: ${toolName}`)
        // Return unchanged args - could modify here if needed
        return { value: { args } }
      },

      'tool:post': async ({ toolName, result }) => {
        logger.debug(`Tool completed: ${toolName}, success: ${result.success}`)
        // Return unchanged result - could modify here if needed
        return { value: { result } }
      },

      // Session hooks
      'session:create': async ({ sessionId, name }) => {
        logger.info(`New session created: ${name} (${sessionId})`)
      },

      'session:switch': async ({ fromSessionId, toSessionId }) => {
        logger.info(`Session switched from ${fromSessionId || 'none'} to ${toSessionId}`)
      },
    }
  },
}

export default examplePlugin
