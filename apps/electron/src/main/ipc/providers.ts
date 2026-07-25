import {
  registerElectronProvidersIpcHandlers,
  type ElectronProviderEnvStatusRequest,
  type ElectronProviderUsageRequest,
} from '@onething/electron-host/ipc/providers'
import {
  getOnethingProviderUsage,
  inspectOnethingProviderEnvStatusForIpc,
  listOnethingProvidersForIpc,
} from '@onething/runtime/providers'
import { AIProvider, IPC_CHANNELS } from '@shared/ipc.js'
import type {
  GetProviderEnvStatusRequest,
  GetProviderEnvStatusResponse,
  ProviderUsageRequest,
  ProviderUsageResponse,
} from '@shared/ipc.js'
import { authService } from '@onething/app/auth/auth-service.js'
import { fetchCodexUsage } from '@onething/app/providers/builtin/codex.js'
import { getAvailableProviders } from '@onething/app/providers/index.js'
import { getProviderEnvStatus } from '@onething/app/providers/env.js'

function providerUsageRequest(
  requestOrEvent: ProviderUsageRequest | unknown,
  request?: ProviderUsageRequest,
): ProviderUsageRequest {
  return (request ?? requestOrEvent) as ProviderUsageRequest
}

function providerEnvStatusRequest(
  requestOrEvent: GetProviderEnvStatusRequest | unknown,
  request?: GetProviderEnvStatusRequest,
): GetProviderEnvStatusRequest {
  return (request ?? requestOrEvent) as GetProviderEnvStatusRequest
}

export async function handleGetProviderUsage(
  requestOrEvent: ProviderUsageRequest | unknown,
  maybeRequest?: ProviderUsageRequest,
): Promise<ProviderUsageResponse> {
  const request = providerUsageRequest(requestOrEvent, maybeRequest)
  return getOnethingProviderUsage({
    providerId: request.providerId,
    codexProviderIds: ['codex', AIProvider.Codex],
    canonicalCodexProviderId: AIProvider.Codex,
    refreshTokenIfNeeded: providerId => authService.refreshTokenIfNeeded(providerId),
    fetchCodexUsage,
  }) as Promise<ProviderUsageResponse>
}

export async function handleGetProviderEnvStatus(
  requestOrEvent: GetProviderEnvStatusRequest | unknown,
  maybeRequest?: GetProviderEnvStatusRequest,
): Promise<GetProviderEnvStatusResponse> {
  const request = providerEnvStatusRequest(requestOrEvent, maybeRequest)
  return inspectOnethingProviderEnvStatusForIpc({
    providerId: request.providerId,
    getProviderEnvStatus,
    logger: console,
  }) as Promise<GetProviderEnvStatusResponse>
}

export function registerProvidersHandlers() {
  registerElectronProvidersIpcHandlers({
    channels: {
      list: IPC_CHANNELS.GET_PROVIDERS,
      usage: IPC_CHANNELS.GET_PROVIDER_USAGE,
      envStatus: IPC_CHANNELS.GET_PROVIDER_ENV_STATUS,
    },
    listProviders: () => {
      return listOnethingProvidersForIpc({
        getAvailableProviders,
        logger: console,
      })
    },
    getUsage: (request: ElectronProviderUsageRequest) => {
      return handleGetProviderUsage(request)
    },
    getEnvStatus: (request: ElectronProviderEnvStatusRequest) => {
      return handleGetProviderEnvStatus(request)
    },
  })
}
