import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc.js'
import { registerChatHandlers } from './chat.js'
import { registerSessionHandlers } from './sessions.js'
import { registerSettingsHandlers } from './settings.js'
import { registerModelsHandlers } from './models.js'
import { registerProvidersHandlers } from './providers.js'
import { registerToolHandlers } from './tools.js'
import { registerMCPHandlers, initializeMCP, shutdownMCP } from './mcp.js'
import { registerSkillHandlers, initializeSkills } from './skills.js'
import { registerShellHandlers } from './shell.js'
import { registerMediaHandlers } from './media.js'
import { registerPermissionHandlers } from './permission.js'
import { registerOAuthHandlers, cleanupOAuth } from './oauth.js'
import { registerThemeHandlers, initializeThemeSystem } from './themes.js'

export function initializeIPC() {
  registerChatHandlers()
  registerSessionHandlers()
  registerSettingsHandlers()
  registerModelsHandlers()
  registerProvidersHandlers()
  registerToolHandlers()
  registerMCPHandlers()
  registerSkillHandlers()
  registerShellHandlers()
  registerMediaHandlers()
  registerPermissionHandlers()
  registerOAuthHandlers()
  registerThemeHandlers()
  registerCommandHandler()
}

/**
 * Register the unified session:command handler.
 * Routes renderer commands through EventBus for processing by
 * subscribed systems (Permission, StreamEngine, etc.).
 */
function registerCommandHandler() {
  ipcMain.handle(IPC_CHANNELS.SESSION_COMMAND, async (_event, { sessionId, command }) => {
    try {
      const { getEventBus } = await import('../events/index.js')
      const eventBus = getEventBus()
      const result = await eventBus.emit(sessionId, command)
      return { success: true, result }
    } catch (error: any) {
      console.error('[IPC] session:command handler error:', error)
      return { success: false, error: error.message || 'Failed to handle command' }
    }
  })
  console.log('[IPC] session:command handler registered')
}

export { initializeMCP, shutdownMCP, initializeSkills, cleanupOAuth, initializeThemeSystem }
