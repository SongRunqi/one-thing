import { IPC_CHANNELS, AIProvider } from '../../shared/ipc.js'
import type { OpenRouterModel } from '../../shared/ipc.js'
import {
  fetchOnethingGitHubCopilotModelsWithAuth,
  getAllOnethingModelRegistryModelsForIpc,
  getOnethingModelsWithCapabilities,
  getOnethingModelRegistryDisplayNameForIpc,
  getOnethingModelRegistryNameAliasesForIpc,
  refreshOnethingModelRegistryForIpc,
  searchOnethingModelRegistryForIpc,
  type OnethingConfiguredModelSelection,
} from '@onething/runtime/providers'
import {
  registerElectronModelsIpcHandlers,
  type ElectronModelDisplayNameRequest,
  type ElectronModelsSearchRequest,
  type ElectronModelsWithCapabilitiesRequest,
} from '@onething/electron-host/ipc/models'
import * as modelRegistry from '../providers/model-registry.js'
import { authService } from '../auth/auth-service.js'
import { fetchCopilotModels } from '../providers/builtin/github-copilot.js'
import { fetchCodexModels, getCodexFallbackModels } from '../providers/builtin/codex.js'
import { getSettings } from '../stores/settings.js'

// === GitHub Copilot Models Handler (still fetches from Copilot API) ===

async function fetchGitHubCopilotModelsRaw(): Promise<{ id: string; name: string; description?: string }[]> {
  return await fetchOnethingGitHubCopilotModelsWithAuth({
    getToken: providerId => authService.getToken(providerId),
    fetchCopilotModels,
  })
}

async function fetchCodexModelsRaw(): Promise<OpenRouterModel[]> {
  const token = await authService.refreshTokenIfNeeded('codex')
  return fetchCodexModels(token)
}

function modelsWithCapabilitiesRequest(
  requestOrEvent: ElectronModelsWithCapabilitiesRequest | unknown,
  request?: ElectronModelsWithCapabilitiesRequest,
): ElectronModelsWithCapabilitiesRequest {
  return (request ?? requestOrEvent) as ElectronModelsWithCapabilitiesRequest
}

function modelsSearchRequest(
  requestOrEvent: ElectronModelsSearchRequest | unknown,
  request?: ElectronModelsSearchRequest,
): ElectronModelsSearchRequest {
  return (request ?? requestOrEvent) as ElectronModelsSearchRequest
}

function modelDisplayNameRequest(
  requestOrEvent: ElectronModelDisplayNameRequest | unknown,
  request?: ElectronModelDisplayNameRequest,
): ElectronModelDisplayNameRequest {
  return (request ?? requestOrEvent) as ElectronModelDisplayNameRequest
}

// === Model Registry Handlers (read from settings.json) ===

export async function handleGetModelsWithCapabilities(
  requestOrEvent: ElectronModelsWithCapabilitiesRequest | unknown,
  maybeRequest?: ElectronModelsWithCapabilitiesRequest,
): Promise<{ success: boolean; models?: OpenRouterModel[]; error?: string }> {
  const request = modelsWithCapabilitiesRequest(requestOrEvent, maybeRequest)
  return getOnethingModelsWithCapabilities(request, {
    getModelsForProvider: providerId => modelRegistry.getModelsForProvider(providerId) as Promise<OpenRouterModel[]>,
    fetchCopilotModels: fetchGitHubCopilotModelsRaw,
    fetchCodexModels: fetchCodexModelsRaw,
    saveProviderModels: (providerId, models) => modelRegistry.saveProviderModels(providerId, models as OpenRouterModel[]),
    getCodexFallbackModels: modelIds => getCodexFallbackModels(modelIds) as OpenRouterModel[],
    getConfiguredCodexModelSelection: () =>
      getSettings()?.ai?.providers?.codex as OnethingConfiguredModelSelection | undefined,
    getACPAgents: () => getSettings()?.acp?.agents,
    providerIds: {
      githubCopilot: [AIProvider.GitHubCopilot],
      codex: [AIProvider.Codex],
      acp: [AIProvider.ACP],
    },
    logger: console,
  }) as Promise<{ success: boolean; models?: OpenRouterModel[]; error?: string }>
}

async function handleGetAllModels(): Promise<{ success: boolean; models?: OpenRouterModel[]; error?: string }> {
  return getAllOnethingModelRegistryModelsForIpc({
    getAllModels: () => modelRegistry.getAllModels(),
    logger: console,
  })
}

async function handleSearchModels(
  request: ElectronModelsSearchRequest,
): Promise<{ success: boolean; models?: OpenRouterModel[]; error?: string }> {
  return searchOnethingModelRegistryForIpc({
    query: request.query,
    providerId: request.providerId,
    searchModels: (query, providerId) => modelRegistry.searchModels(query, providerId),
    logger: console,
  })
}

async function handleRefreshModelRegistry(): Promise<{ success: boolean; error?: string }> {
  return refreshOnethingModelRegistryForIpc({
    forceRefresh: () => modelRegistry.forceRefresh(),
    logger: console,
  })
}

async function handleGetModelNameAliases(): Promise<{ success: boolean; aliases?: Record<string, string>; error?: string }> {
  return getOnethingModelRegistryNameAliasesForIpc({
    getModelNameAliases: () => modelRegistry.getModelNameAliases(),
    logger: console,
  })
}

async function handleGetModelDisplayName(
  request: ElectronModelDisplayNameRequest,
): Promise<{ success: boolean; displayName?: string; error?: string }> {
  return getOnethingModelRegistryDisplayNameForIpc({
    modelId: request.modelId,
    getModelDisplayName: modelId => modelRegistry.getModelDisplayName(modelId),
    logger: console,
  })
}

export function registerModelsHandlers() {
  registerElectronModelsIpcHandlers({
    channels: {
      getWithCapabilities: IPC_CHANNELS.GET_MODELS_WITH_CAPABILITIES,
      getAll: IPC_CHANNELS.GET_ALL_MODELS,
      search: IPC_CHANNELS.SEARCH_MODELS,
      refreshRegistry: IPC_CHANNELS.REFRESH_MODEL_REGISTRY,
      getNameAliases: IPC_CHANNELS.GET_MODEL_NAME_ALIASES,
      getDisplayName: IPC_CHANNELS.GET_MODEL_DISPLAY_NAME,
    },
    getModelsWithCapabilities: request => handleGetModelsWithCapabilities(request),
    getAllModels: () => handleGetAllModels(),
    searchModels: request => handleSearchModels(modelsSearchRequest(request)),
    refreshModelRegistry: () => handleRefreshModelRegistry(),
    getModelNameAliases: () => handleGetModelNameAliases(),
    getModelDisplayName: request => handleGetModelDisplayName(modelDisplayNameRequest(request)),
  })
}
