import { registerChatHandlers } from './chat.js'
import { registerSessionHandlers } from './sessions.js'
import { registerSettingsHandlers } from './settings.js'
import { registerSettingsIOHandlers } from './settings-io.js'
import { registerModelsHandlers } from './models.js'
import { registerProvidersHandlers } from './providers.js'
import { registerToolHandlers } from './tools.js'
import { registerMCPHandlers, initializeMCP, shutdownMCP } from './mcp.js'
import { registerSkillHandlers, initializeSkills } from './skills.js'
import { registerCustomAgentHandlers, initializeCustomAgents } from './custom-agents.js'
import { registerWorkspaceHandlers } from './workspaces.js'
import { registerUserProfileHandlers } from './user-profile.js'
import { registerAgentMemoryHandlers } from './agent-memory.js'
import { registerMemoryFeedbackHandlers } from './memory-feedback.js'
import { registerMemoryHandlers } from './memory.js'
import { registerShellHandlers } from './shell.js'
import { registerMediaHandlers } from './media.js'
import { registerPermissionHandlers } from './permission.js'
import { registerOAuthHandlers, cleanupOAuth } from './oauth.js'
import { registerThemeHandlers, initializeThemeSystem } from './themes.js'
import { registerFilesHandlers } from './files.js'
import { registerFileTreeHandlers } from './file-tree.js'
import { registerPluginHandlers } from './plugins.js'
import { registerUpdaterHandlers } from './updater.js'

export function initializeIPC() {
  registerChatHandlers()
  registerSessionHandlers()
  registerSettingsHandlers()
  registerSettingsIOHandlers()
  registerModelsHandlers()
  registerProvidersHandlers()
  registerToolHandlers()
  registerMCPHandlers()
  registerSkillHandlers()
  registerCustomAgentHandlers()
  registerWorkspaceHandlers()
  registerUserProfileHandlers()
  registerAgentMemoryHandlers()
  registerMemoryFeedbackHandlers()
  registerMemoryHandlers()
  registerShellHandlers()
  registerMediaHandlers()
  registerPermissionHandlers()
  registerOAuthHandlers()
  registerThemeHandlers()
  registerFilesHandlers()
  registerFileTreeHandlers()
  registerPluginHandlers()
  registerUpdaterHandlers()
}

export { initializeMCP, shutdownMCP, initializeSkills, initializeCustomAgents, cleanupOAuth, initializeThemeSystem }
