import { ipcMain } from 'electron'
import { IPC_CHANNELS, AIProvider } from '../../shared/ipc.js'
import type { OpenRouterModel } from '../../shared/ipc.js'
import * as modelRegistry from '../providers/model-registry.js'
import { authService } from '../auth/auth-service.js'
import { fetchCopilotModels, detectModelCapabilities } from '../providers/builtin/github-copilot.js'
import { fetchCodexModels, getCodexFallbackModels } from '../providers/builtin/codex.js'
import { getSettings } from '../stores/settings.js'

// === GitHub Copilot Models Handler (still fetches from Copilot API) ===

async function fetchGitHubCopilotModelsRaw(): Promise<{ id: string; name: string; description?: string }[]> {
  const token = await authService.getToken('github-copilot')
  if (!token?.accessToken) {
    throw new Error('Not logged in to GitHub Copilot')
  }
  return await fetchCopilotModels(token.accessToken)
}

async function fetchCodexModelsRaw(): Promise<OpenRouterModel[]> {
  const token = await authService.refreshTokenIfNeeded('codex')
  return fetchCodexModels(token)
}

function mergeModelsById(...groups: OpenRouterModel[][]): OpenRouterModel[] {
  const merged = new Map<string, OpenRouterModel>()
  for (const group of groups) {
    for (const model of group) {
      if (!merged.has(model.id)) {
        merged.set(model.id, model)
      }
    }
  }
  return Array.from(merged.values())
}

function getConfiguredCodexModelIds(): string[] {
  const config = getSettings()?.ai?.providers?.codex
  return Array.from(new Set([
    ...(config?.selectedModels ?? []),
    ...(config?.model ? [config.model] : []),
  ].filter(Boolean)))
}

function getConfiguredCodexFallbackModels(): OpenRouterModel[] {
  const modelIds = getConfiguredCodexModelIds()
  return modelIds.length > 0 ? getCodexFallbackModels(modelIds) : []
}

function getACPAgentModels(): OpenRouterModel[] {
  const agents = getSettings()?.acp?.agents ?? []
  return agents.map(agent => ({
    id: agent.id,
    name: agent.name || agent.id,
    description: agent.description || `ACP agent command: ${[agent.command, ...(agent.args ?? [])].filter(Boolean).join(' ')}`,
    context_length: 128000,
    architecture: {
      modality: 'text',
      input_modalities: ['text'],
      output_modalities: ['text'],
      tokenizer: 'external',
    },
    pricing: { prompt: '0', completion: '0', request: '0', image: '0' },
    top_provider: { context_length: 128000, max_completion_tokens: 16384, is_moderated: false },
    supported_parameters: [],
    providerMetadata: {
      acp: {
        command: agent.command,
        enabled: agent.enabled,
        status: 'local-agent',
      },
    },
  }))
}

async function getCachedCodexModelsWithFallbacks(includeDefaultFallback = false): Promise<OpenRouterModel[]> {
  const regModels = await modelRegistry.getModelsForProvider('codex')
  const groups = [regModels, getConfiguredCodexFallbackModels()]
  if (includeDefaultFallback) {
    groups.push(getCodexFallbackModels())
  }
  return mergeModelsById(...groups)
}

// === Model Registry Handlers (read from settings.json) ===

export async function handleGetModelsWithCapabilities(
  _event: Electron.IpcMainInvokeEvent,
  request: { providerId: string; forceRefresh?: boolean }
): Promise<{ success: boolean; models?: OpenRouterModel[]; error?: string }> {
  try {
    // Special handling for GitHub Copilot - fetch live from Copilot API
    if (request.providerId === 'github-copilot' || request.providerId === AIProvider.GitHubCopilot) {
      try {
        const copilotModels = await fetchGitHubCopilotModelsRaw()
        const models: OpenRouterModel[] = copilotModels.map(m => {
          const caps = detectModelCapabilities(m.id)
          const inputModalities = ['text']
          const outputModalities = ['text']
          const supportedParams: string[] = []
          if (caps.hasVision) inputModalities.push('image')
          if (caps.hasImageGeneration) outputModalities.push('image')
          if (caps.hasTools) supportedParams.push('tools')
          if (caps.hasReasoning) supportedParams.push('reasoning')

          return {
            id: m.id,
            name: m.name || m.id,
            description: m.description || '',
            context_length: caps.contextLength,
            architecture: {
              modality: caps.hasImageGeneration ? 'image' : 'text',
              input_modalities: inputModalities,
              output_modalities: outputModalities,
              tokenizer: 'unknown',
            },
            pricing: { prompt: '0', completion: '0', request: '0', image: '0' },
            top_provider: { context_length: caps.contextLength, max_completion_tokens: 16384, is_moderated: false },
            supported_parameters: supportedParams,
          }
        })
        return { success: true, models }
      } catch (error: any) {
        console.warn('[Models] Failed to fetch Copilot models:', error.message)
        // Fallback: read from settings.json modelRegistry (if GitHub Copilot was cached there)
        const regModels = await modelRegistry.getModelsForProvider('github-copilot')
        if (regModels.length > 0) {
          return { success: true, models: regModels }
        }
        return { success: false, error: 'No models available. Please refresh the model registry.' }
      }
    }

    if (request.providerId === 'codex' || request.providerId === AIProvider.Codex) {
      if (!request.forceRefresh) {
        return {
          success: true,
          models: await getCachedCodexModelsWithFallbacks(),
        }
      }

      try {
        const models = await fetchCodexModelsRaw()
        modelRegistry.saveProviderModels('codex', models)
        return {
          success: true,
          models: mergeModelsById(models, getConfiguredCodexFallbackModels()),
        }
      } catch (error: any) {
        console.warn('[Models] Failed to fetch Codex models, using fallback:', error.message)
        return {
          success: true,
          models: await getCachedCodexModelsWithFallbacks(true),
        }
      }
    }

    if (request.providerId === 'acp' || request.providerId === AIProvider.ACP) {
      return {
        success: true,
        models: getACPAgentModels(),
      }
    }

    const models = await modelRegistry.getModelsForProvider(request.providerId)
    return { success: true, models }
  } catch (error: any) {
    console.error('[Models] Failed to get models with capabilities:', error)
    return { success: false, error: error.message }
  }
}

async function handleGetAllModels(
  _event: Electron.IpcMainInvokeEvent
): Promise<{ success: boolean; models?: OpenRouterModel[]; error?: string }> {
  try {
    const models = await modelRegistry.getAllModels()
    return { success: true, models }
  } catch (error: any) {
    console.error('[Models] Failed to get all models:', error)
    return { success: false, error: error.message }
  }
}

async function handleSearchModels(
  _event: Electron.IpcMainInvokeEvent,
  request: { query: string; providerId?: string }
): Promise<{ success: boolean; models?: OpenRouterModel[]; error?: string }> {
  try {
    const models = await modelRegistry.searchModels(request.query, request.providerId)
    return { success: true, models }
  } catch (error: any) {
    console.error('[Models] Failed to search models:', error)
    return { success: false, error: error.message }
  }
}

async function handleRefreshModelRegistry(
  _event: Electron.IpcMainInvokeEvent
): Promise<{ success: boolean; error?: string }> {
  try {
    await modelRegistry.forceRefresh()
    return { success: true }
  } catch (error: any) {
    console.error('[Models] Failed to refresh model registry:', error)
    return { success: false, error: error.message }
  }
}

async function handleGetModelNameAliases(
  _event: Electron.IpcMainInvokeEvent
): Promise<{ success: boolean; aliases?: Record<string, string>; error?: string }> {
  try {
    const aliases = modelRegistry.getModelNameAliases()
    return { success: true, aliases }
  } catch (error: any) {
    console.error('[Models] Failed to get model name aliases:', error)
    return { success: false, error: error.message }
  }
}

async function handleGetModelDisplayName(
  _event: Electron.IpcMainInvokeEvent,
  request: { modelId: string }
): Promise<{ success: boolean; displayName?: string; error?: string }> {
  try {
    const displayName = modelRegistry.getModelDisplayName(request.modelId)
    return { success: true, displayName }
  } catch (error: any) {
    console.error('[Models] Failed to get model display name:', error)
    return { success: false, error: error.message }
  }
}

export function registerModelsHandlers() {
  ipcMain.handle(IPC_CHANNELS.GET_MODELS_WITH_CAPABILITIES, handleGetModelsWithCapabilities)
  ipcMain.handle(IPC_CHANNELS.GET_ALL_MODELS, handleGetAllModels)
  ipcMain.handle(IPC_CHANNELS.SEARCH_MODELS, handleSearchModels)
  ipcMain.handle(IPC_CHANNELS.REFRESH_MODEL_REGISTRY, handleRefreshModelRegistry)
  ipcMain.handle(IPC_CHANNELS.GET_MODEL_NAME_ALIASES, handleGetModelNameAliases)
  ipcMain.handle(IPC_CHANNELS.GET_MODEL_DISPLAY_NAME, handleGetModelDisplayName)
}
