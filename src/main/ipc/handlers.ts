import { emitCoreSessionCommandForIpc } from '@onething/core/events'
import {
  registerElectronSessionCommandIpcHandler,
  type ElectronSessionCommandRequest,
} from '@onething/electron-host/ipc/session-command'
import { IPC_CHANNELS } from '../../shared/ipc.js'
import { registerChatHandlers } from './chat.js'
import { registerSessionHandlers } from './sessions.js'
import { registerSettingsHandlers } from './settings.js'
import { registerAgentHandlers } from './agents.js'
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
import { registerVariableHandlers } from '../variables/ipc.js'
import { registerProjectDirsHandlers } from '../project-dirs/ipc.js'
import { registerPluginHandlers } from './plugins.js'
import { registerPromptHandlers } from '../prompts/ipc.js'
import { registerMemoryHandlers } from './memory.js'
import { registerSchedulerHandlers } from './scheduler.js'
import { registerFilesHandlers } from './files.js'
import { registerMarkdownHandlers } from './markdown.js'
import { registerSearchHandlers } from '@onething/electron-host/search/ipc'
import { registerAppStateHandlers } from './app-state.js'
import { registerTodoPlanHandlers } from '../todo-plan/ipc.js'
import { registerVoiceHandlers } from '../voice/ipc.js'
import { registerACPHandlers, initializeACP, shutdownACP } from './acp.js'
import { registerGatewayHandlers } from '../gateway/ipc.js'
import { getEventBus } from '../events/index.js'

export function initializeIPC() {
  registerChatHandlers()
  registerSessionHandlers()
  registerSettingsHandlers()
  registerAgentHandlers()
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
  registerVariableHandlers()
  registerProjectDirsHandlers()
  registerPluginHandlers()
  registerPromptHandlers()
  registerMemoryHandlers()
  registerSchedulerHandlers()
  registerFilesHandlers()
  registerMarkdownHandlers()
  registerSearchHandlers()
  registerAppStateHandlers()
  registerTodoPlanHandlers()
  registerVoiceHandlers()
  registerACPHandlers()
  registerGatewayHandlers()
  registerCommandHandler()
}

/**
 * Register the unified session:command handler.
 * Routes renderer commands through EventBus for processing by
 * subscribed systems (Permission, StreamEngine, etc.).
 */
function registerCommandHandler() {
  registerElectronSessionCommandIpcHandler({
    channel: IPC_CHANNELS.SESSION_COMMAND,
    handleCommand: async ({ sessionId, command }: ElectronSessionCommandRequest) => {
      return emitCoreSessionCommandForIpc({
        sessionId,
        command: command as Parameters<ReturnType<typeof getEventBus>['emit']>[1],
        eventBus: getEventBus(),
        logger: console,
      })
    },
  })
  console.log('[IPC] session:command handler registered')
}

export { initializeMCP, shutdownMCP, initializeSkills, cleanupOAuth, initializeThemeSystem, initializeACP, shutdownACP }
