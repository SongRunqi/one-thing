import { ipcMain } from 'electron'
import { AIProvider, IPC_CHANNELS } from '../../shared/ipc.js'
import type {
  GetProviderEnvStatusRequest,
  GetProviderEnvStatusResponse,
  ProviderUsageRequest,
  ProviderUsageResponse,
} from '../../shared/ipc.js'
import { authService } from '../auth/auth-service.js'
import { fetchCodexUsage } from '../providers/builtin/codex.js'
import { getAvailableProviders } from '../providers/index.js'
import { getProviderEnvStatus } from '../providers/env.js'

function toUsageAccount(token: Awaited<ReturnType<typeof authService.refreshTokenIfNeeded>>): ProviderUsageResponse['account'] {
  return {
    id: token.accountId,
    email: token.email,
    planType: token.planType,
    isFedramp: token.isFedrampAccount,
  }
}

export async function handleGetProviderUsage(
  _event: Electron.IpcMainInvokeEvent,
  request: ProviderUsageRequest,
): Promise<ProviderUsageResponse> {
  const providerId = request.providerId
  if (providerId !== 'codex' && providerId !== AIProvider.Codex) {
    return { success: true, providerId, unsupported: true }
  }

  try {
    const token = await authService.refreshTokenIfNeeded(AIProvider.Codex)
    const usage = await fetchCodexUsage(token)
    return {
      success: true,
      providerId: AIProvider.Codex,
      capturedAt: Date.now(),
      account: toUsageAccount(token),
      usage,
    }
  } catch (error: any) {
    return {
      success: false,
      providerId: AIProvider.Codex,
      error: error?.message || 'Failed to fetch provider usage',
    }
  }
}

export async function handleGetProviderEnvStatus(
  _event: Electron.IpcMainInvokeEvent,
  request: GetProviderEnvStatusRequest,
): Promise<GetProviderEnvStatusResponse> {
  try {
    return {
      success: true,
      status: getProviderEnvStatus(request.providerId),
    }
  } catch (error: any) {
    return {
      success: false,
      error: error?.message || 'Failed to inspect provider environment variables',
    }
  }
}

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

  ipcMain.handle(IPC_CHANNELS.GET_PROVIDER_USAGE, handleGetProviderUsage)
  ipcMain.handle(IPC_CHANNELS.GET_PROVIDER_ENV_STATUS, handleGetProviderEnvStatus)
}
