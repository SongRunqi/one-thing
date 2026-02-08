import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc.js'
import { classifyError } from '../../shared/errors.js'
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
      const appError = classifyError(error)
      console.error(`[Providers][${appError.category}] Error getting providers:`, error)
      return {
        success: false,
        error: appError.message,
        errorDetails: appError.technicalDetail,
        errorCategory: appError.category,
        retryable: appError.retryable,
      }
    }
  })
}
