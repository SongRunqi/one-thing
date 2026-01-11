import { registerChatHandlers } from './chat.js'
import { registerSessionHandlers } from './sessions.js'
import { registerSettingsHandlers } from './settings.js'
import { registerModelsHandlers } from './models.js'
import { registerProvidersHandlers } from './providers.js'
import { registerToolHandlers } from './tools.js'
import { registerMCPHandlers, initializeMCP, shutdownMCP } from './mcp.js'
import { registerSkillHandlers, initializeSkills } from './skills.js'
import { registerCustomAgentHandlers, initializeCustomAgents } from './custom-agents.js'
import { registerWorkspaceHandlers } from './workspaces.js'
import { registerUserProfileHandlers } from './user-profile.js'
import { registerAgentMemoryHandlers } from './agent-memory.js'
import { registerShellHandlers } from './shell.js'
import { registerMediaHandlers } from './media.js'
import { registerPermissionHandlers } from './permission.js'
import { registerOAuthHandlers, cleanupOAuth } from './oauth.js'
import { registerThemeHandlers, initializeThemeSystem } from './themes.js'
import { registerFilesHandlers } from './files.js'
import { registerFileTreeHandlers } from './file-tree.js'
import { registerPluginHandlers } from './plugins.js'

export function initializeIPC() {
  registerChatHandlers()
  registerSessionHandlers()
  registerSettingsHandlers()
  registerModelsHandlers()
  registerProvidersHandlers()
  registerToolHandlers()
  registerMCPHandlers()
  registerSkillHandlers()
  registerCustomAgentHandlers()
  registerWorkspaceHandlers()
  registerUserProfileHandlers()
  registerAgentMemoryHandlers()
  registerShellHandlers()
  registerMediaHandlers()
  registerPermissionHandlers()
  registerOAuthHandlers()
  registerThemeHandlers()
  registerFilesHandlers()
  registerFileTreeHandlers()
  registerPluginHandlers()
}

export { initializeMCP, shutdownMCP, initializeSkills, initializeCustomAgents, cleanupOAuth, initializeThemeSystem }
