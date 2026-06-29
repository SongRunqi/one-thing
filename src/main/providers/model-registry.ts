/**
 * Model Registry Service
 *
 * Electron main owns host adapters here: settings persistence, bound fetch, and
 * provider-direct fallback hooks. Model metadata conversion/query logic lives in
 * @onething/runtime/providers.
 */

import type { OpenRouterModel } from '../../shared/ipc.js'
import {
  fetchOnethingModelsDevData,
  getAllOnethingModels,
  getOnethingModelById,
  getOnethingModelCacheStatus,
  getOnethingModelContextLength,
  getOnethingModelDisplayName,
  getOnethingModelMaxOutputTokens,
  getOnethingModelNameAliases,
  getOnethingModelsForProvider,
  onethingModelSupportsImageGeneration,
  onethingModelSupportsReasoning,
  onethingModelSupportsReasoningSync,
  onethingModelSupportsTemperature,
  onethingModelSupportsTools,
  refreshAllOnethingProviderModels,
  refreshOnethingProviderModels,
  saveOnethingProviderModels,
  searchOnethingModels,
  type OnethingModelRegistryQueryOptions,
  type OnethingModelsDevResponse,
  type OnethingOpenRouterModel,
  type OnethingProviderModelConfigs,
} from '@onething/runtime/providers'
import { getSettings, saveSettings } from '../stores/settings.js'
import { createRequiredAppFetch } from './bound-fetch.js'
import { getCodexFallbackModel, getCodexFallbackModels } from './builtin/codex.js'
import { detectModelCapabilities } from './builtin/github-copilot.js'

function getProviderConfigs(): OnethingProviderModelConfigs | undefined {
  return getSettings()?.ai?.providers as OnethingProviderModelConfigs | undefined
}

function getProviderDirectFallbackModel(modelId: string, providerId?: string): OpenRouterModel | undefined {
  if (providerId === 'codex') {
    return getCodexFallbackModel(modelId)
  }

  if (providerId === 'github-copilot') {
    const caps = detectModelCapabilities(modelId)
    const inputModalities = ['text']
    const outputModalities = ['text']
    const supportedParams: string[] = []
    if (caps.hasVision) inputModalities.push('image')
    if (caps.hasImageGeneration) outputModalities.push('image')
    if (caps.hasTools) supportedParams.push('tools')
    if (caps.hasReasoning) supportedParams.push('reasoning')

    return {
      id: modelId,
      name: modelId,
      description: '',
      context_length: caps.contextLength,
      architecture: {
        modality: caps.hasImageGeneration ? 'image' : 'text',
        input_modalities: inputModalities,
        output_modalities: outputModalities,
        tokenizer: 'unknown',
      },
      pricing: { prompt: '0', completion: '0', request: '0', image: '0' },
      top_provider: {
        context_length: caps.contextLength,
        max_completion_tokens: 16384,
        is_moderated: false,
      },
      supported_parameters: supportedParams,
    }
  }

  return undefined
}

function getProviderFallbackModels(providerId: string): OpenRouterModel[] {
  return providerId === 'codex' ? getCodexFallbackModels() : []
}

function queryOptions(): OnethingModelRegistryQueryOptions {
  return {
    getFallbackModel: getProviderDirectFallbackModel as OnethingModelRegistryQueryOptions['getFallbackModel'],
    getFallbackModelsForProvider: getProviderFallbackModels as OnethingModelRegistryQueryOptions['getFallbackModelsForProvider'],
  }
}

export function saveProviderModels(providerId: string, models: OpenRouterModel[]): void {
  saveOnethingProviderModels(providerId, models as OnethingOpenRouterModel[], {
    getSettings,
    saveSettings,
    logger: console,
  })
}

async function fetchModelsDevData(): Promise<OnethingModelsDevResponse> {
  console.log('[ModelRegistry] Fetching from models.dev...')

  const data = await fetchOnethingModelsDevData(createRequiredAppFetch({ policy: 'default' }), {
    headers: { 'User-Agent': 'onething-electron/1.0' },
    signal: AbortSignal.timeout(15000),
  })

  const providerCount = Object.keys(data).length
  const modelCount = Object.values(data).reduce((sum, provider) => sum + Object.keys(provider.models).length, 0)
  console.log(`[ModelRegistry] Fetched ${modelCount} models from ${providerCount} providers`)
  return data
}

/**
 * Refresh models for a specific provider only.
 * Fetches from models.dev and stores results under settings.ai.providers[providerId].models.
 */
export async function refreshProviderModels(providerId: string): Promise<void> {
  await refreshOnethingProviderModels(providerId, {
    getSettings,
    saveSettings,
    fetchModelsDevData,
    logger: console,
  })
}

/**
 * Refresh models for all configured providers.
 */
export async function refreshAllProviders(): Promise<void> {
  await refreshAllOnethingProviderModels({
    getSettings,
    saveSettings,
    fetchModelsDevData,
    logger: console,
  })
}

export const forceRefresh = refreshAllProviders

export async function getModelsForProvider(providerId: string): Promise<OpenRouterModel[]> {
  return getOnethingModelsForProvider(
    getProviderConfigs(),
    providerId,
    queryOptions(),
  ) as OpenRouterModel[]
}

export async function getAllModels(): Promise<OpenRouterModel[]> {
  return getAllOnethingModels(getProviderConfigs()) as OpenRouterModel[]
}

export async function searchModels(query: string, providerId?: string): Promise<OpenRouterModel[]> {
  return searchOnethingModels(
    getProviderConfigs(),
    query,
    providerId,
    queryOptions(),
  ) as OpenRouterModel[]
}

export async function getModelById(modelId: string, providerId?: string): Promise<OpenRouterModel | undefined> {
  return getOnethingModelById(
    getProviderConfigs(),
    modelId,
    providerId,
    queryOptions(),
  ) as OpenRouterModel | undefined
}

export async function getModelContextLength(modelId: string, providerId?: string): Promise<number> {
  return getOnethingModelContextLength(getProviderConfigs(), modelId, providerId, queryOptions())
}

export async function getModelMaxOutputTokens(modelId: string, providerId?: string): Promise<number> {
  return getOnethingModelMaxOutputTokens(getProviderConfigs(), modelId, providerId, queryOptions())
}

export async function modelSupportsTools(modelId: string, providerId?: string): Promise<boolean> {
  return onethingModelSupportsTools(getProviderConfigs(), modelId, providerId)
}

export async function modelSupportsTemperature(modelId: string, providerId?: string): Promise<boolean> {
  return onethingModelSupportsTemperature(getProviderConfigs(), modelId, providerId)
}

export async function modelSupportsReasoning(modelId: string, providerId?: string): Promise<boolean> {
  return onethingModelSupportsReasoning(getProviderConfigs(), modelId, providerId)
}

export function modelSupportsReasoningSync(modelId: string, providerId?: string): boolean {
  return onethingModelSupportsReasoningSync(getProviderConfigs(), modelId, providerId)
}

export async function modelSupportsImageGeneration(modelId: string, providerId?: string): Promise<boolean> {
  return onethingModelSupportsImageGeneration(getProviderConfigs(), modelId, providerId)
}

export function getCacheStatus(): { lastFetched: number; modelCount: number; isStale: boolean } {
  return getOnethingModelCacheStatus(getProviderConfigs())
}

export function getModelDisplayName(modelId: string): string {
  return getOnethingModelDisplayName(modelId)
}

export function getModelNameAliases(): Record<string, string> {
  return getOnethingModelNameAliases()
}
