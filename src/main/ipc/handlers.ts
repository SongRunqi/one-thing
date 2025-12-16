import { registerChatHandlers } from './chat.js'
import { registerSessionHandlers } from './sessions.js'
import { registerSettingsHandlers } from './settings.js'
import { registerModelsHandlers } from './models.js'
import { registerProvidersHandlers } from './providers.js'
import { registerToolHandlers } from './tools.js'
import { registerMCPHandlers, initializeMCP, shutdownMCP } from './mcp.js'

export function initializeIPC() {
  registerChatHandlers()
  registerSessionHandlers()
  registerSettingsHandlers()
  registerModelsHandlers()
  registerProvidersHandlers()
  registerToolHandlers()
  registerMCPHandlers()
}

export { initializeMCP, shutdownMCP }
