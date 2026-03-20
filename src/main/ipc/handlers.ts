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
import { registerFilesHandlers } from './files.js'
import { registerFileTreeHandlers } from './file-tree.js'
import { registerPluginHandlers } from './plugins.js'
import { registerWindowHandlers } from './window.js'

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
  registerFilesHandlers()
  registerFileTreeHandlers()
  registerPluginHandlers()
  registerWindowHandlers()
}

export { initializeMCP, shutdownMCP, initializeSkills, cleanupOAuth, initializeThemeSystem }
