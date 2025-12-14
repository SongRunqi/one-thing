import { registerChatHandlers } from './chat.js'
import { registerSessionHandlers } from './sessions.js'
import { registerSettingsHandlers } from './settings.js'
import { registerModelsHandlers } from './models.js'

export function initializeIPC() {
  registerChatHandlers()
  registerSessionHandlers()
  registerSettingsHandlers()
  registerModelsHandlers()
}
