import { registerChatHandlers } from './chat'
import { registerSessionHandlers } from './sessions'
import { registerSettingsHandlers } from './settings'

export function initializeIPC() {
  registerChatHandlers()
  registerSessionHandlers()
  registerSettingsHandlers()
}
