import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc.js'
import { getAvailableProviders } from '../providers/index.js'

export function registerProvidersHandlers() {
  // Get all available providers
  ipcMain.handle(IPC_CHANNELS.GET_PROVIDERS, async () => {
    try {
      const providers = getAvailableProviders()
      return {
        success: true,
        providers,
      }
    } catch (error: any) {
      console.error('Error getting providers:', error)
      return {
        success: false,
        error: error.message || 'Failed to get providers',
      }
    }
  })
}
