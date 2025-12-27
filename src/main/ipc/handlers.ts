import { registerChatHandlers } from './chat.js'
import { registerSessionHandlers } from './sessions.js'
import { registerSettingsHandlers } from './settings.js'
import { registerModelsHandlers } from './models.js'
import { registerProvidersHandlers } from './providers.js'
import { registerToolHandlers } from './tools.js'
import { registerMCPHandlers, initializeMCP, shutdownMCP } from './mcp.js'
import { registerSkillHandlers, initializeSkills } from './skills.js'
import { registerWorkspaceHandlers } from './workspaces.js'
import { registerAgentHandlers } from './agents.js'
import { registerUserProfileHandlers } from './user-profile.js'
import { registerAgentMemoryHandlers } from './agent-memory.js'
import { registerShellHandlers } from './shell.js'
import { registerMediaHandlers } from './media.js'
import { registerPermissionHandlers } from './permission.js'
import { registerOAuthHandlers, cleanupOAuth } from './oauth.js'

export function initializeIPC() {
  registerChatHandlers()
  registerSessionHandlers()
  registerSettingsHandlers()
  registerModelsHandlers()
  registerProvidersHandlers()
  registerToolHandlers()
  registerMCPHandlers()
  registerSkillHandlers()
  registerWorkspaceHandlers()
  registerAgentHandlers()
  registerUserProfileHandlers()
  registerAgentMemoryHandlers()
  registerShellHandlers()
  registerMediaHandlers()
  registerPermissionHandlers()
  registerOAuthHandlers()
}

export { initializeMCP, shutdownMCP, initializeSkills, cleanupOAuth }
