/**
 * Model Registry Service
 *
 * Fetches model metadata from models.dev API for configured providers only.
 * Stores capabilities & pricing directly under settings.ai.providers[providerId].models.
 *
 * No automatic fetch on startup — user explicitly triggers refresh per provider.
 */

import type { OpenRouterModel } from '../../shared/ipc.js'
import type { ModelCapabilityOverride, ProviderConfig, ModelCapabilityEntry } from '../../shared/ipc/providers.js'
import { getSettings, saveSettings } from '../stores/settings.js'
import { createRequiredAppFetch } from './bound-fetch.js'
import { getCodexFallbackModels } from './builtin/codex.js'

// ============================================================================
// Constants
// ============================================================================

const MODELS_DEV_API = 'https://models.dev/api.json'

/** Maps models.dev provider keys -> our provider IDs */
const PROVIDER_MAPPING: Record<string, string> = {
  'openai': 'openai',
  'anthropic': 'claude',
  'google': 'gemini',
  'deepseek': 'deepseek',
  'mistral': 'mistral',
  'meta': 'llama',
  'cohere': 'cohere',
  'qwen': 'qwen',
  'zhipuai': 'zhipu',
  'moonshotai': 'kimi',
  'xai': 'grok',
}

const CLAUDE_CODE_MODEL_PATTERNS = [
  'claude-sonnet', 'claude-haiku', 'claude-opus',
  'claude-3-5', 'claude-3.5', 'claude-3.7', 'claude-4',
]

const MODEL_NAME_ALIASES: Record<string, string> = {
  'gemini-2.5-flash-image': 'Nano-Banana',
  'gemini-2.5-flash-image-preview': 'Nano-Banana Preview',
}

// ============================================================================
// models.dev raw types
// ============================================================================

interface ModelsDevModel {
  id: string
  name: string
  family?: string
  release_date?: string
  last_updated?: string
  reasoning?: boolean
  temperature?: boolean
  tool_call?: boolean
  cost?: { input?: number; output?: number; cache_read?: number; cache_write?: number }
  limit?: { context?: number; output?: number }
  modalities?: { input?: string[]; output?: string[] }
}

interface ModelsDevProvider {
  id: string
  name: string
  models: Record<string, ModelsDevModel>
}

type ModelsDevResponse = Record<string, ModelsDevProvider>

// ============================================================================
// Settings helpers
// ============================================================================

function getProviderConfig(providerId: string): ProviderConfig | undefined {
  return getSettings()?.ai?.providers?.[providerId] as ProviderConfig | undefined
}

function getProviderModels(providerId: string): Record<string, ModelCapabilityEntry> | undefined {
  return getProviderConfig(providerId)?.models
}

function getModelEntry(modelId: string): ModelCapabilityEntry | undefined {
  // Search across all providers
  const providers = getSettings()?.ai?.providers
  if (!providers) return undefined
  for (const pid of Object.keys(providers)) {
    const models = (providers[pid] as ProviderConfig)?.models
    if (models?.[modelId]) return models[modelId]
  }
  return undefined
}

function getCapabilityOverride(
  modelId: string,
  providerId: string | undefined,
  key: keyof ModelCapabilityOverride,
): boolean | undefined {
  if (!providerId) return undefined
  return getProviderConfig(providerId)?.modelCapabilitiesByModel?.[modelId]?.[key]
}

// ============================================================================
// Convert: models.dev raw -> ModelCapabilityEntry
// ============================================================================

function toCapabilityEntry(model: ModelsDevModel, providerId: string): ModelCapabilityEntry {
  const inputMods = model.modalities?.input || ['text']
  const outputMods = model.modalities?.output || ['text']

  return {
    id: model.id,
    name: MODEL_NAME_ALIASES[model.id] || model.name,
    provider: providerId,
    contextLength: model.limit?.context || 128000,
    maxOutputTokens: model.limit?.output || 4096,
    supportsTools: model.tool_call === true,
    supportsVision: inputMods.includes('image'),
    supportsReasoning: model.reasoning === true,
    supportsImageOutput: outputMods.includes('image'),
    supportsTemperature: model.temperature !== false,
    inputModalities: inputMods,
    outputModalities: outputMods,
    pricing: {
      input: model.cost?.input ?? 0,
      output: model.cost?.output ?? 0,
      cacheRead: model.cost?.cache_read ?? 0,
      cacheWrite: model.cost?.cache_write ?? 0,
    },
    lastUpdated: model.last_updated || model.release_date,
  }
}

function openRouterModelToCapabilityEntry(model: OpenRouterModel, providerId: string): ModelCapabilityEntry {
  const inputModalities = model.architecture?.input_modalities || ['text']
  const outputModalities = model.architecture?.output_modalities || ['text']
  const supportedParameters = model.supported_parameters || []

  return {
    id: model.id,
    name: model.name || model.id,
    provider: providerId,
    contextLength: model.context_length || model.top_provider?.context_length || 128000,
    maxOutputTokens: model.top_provider?.max_completion_tokens || 4096,
    supportsTools: supportedParameters.includes('tools'),
    supportsVision: inputModalities.includes('image'),
    supportsReasoning: supportedParameters.includes('reasoning'),
    supportsImageOutput: outputModalities.includes('image'),
    supportsTemperature: supportedParameters.includes('temperature'),
    inputModalities,
    outputModalities,
    pricing: {
      input: Number(model.pricing?.prompt ?? 0) || 0,
      output: Number(model.pricing?.completion ?? 0) || 0,
      cacheRead: 0,
      cacheWrite: 0,
    },
    lastUpdated: model.last_updated,
    providerMetadata: model.providerMetadata,
  }
}

// ============================================================================
// Convert: ModelCapabilityEntry -> OpenRouterModel (for runtime API)
// ============================================================================

function toOpenRouterModel(entry: ModelCapabilityEntry): OpenRouterModel {
  const supportedParams: string[] = []
  if (entry.supportsTemperature) supportedParams.push('temperature')
  if (entry.supportsTools) supportedParams.push('tools')
  if (entry.supportsReasoning) supportedParams.push('reasoning')

  return {
    id: entry.id,
    name: entry.name,
    context_length: entry.contextLength,
    architecture: {
      modality: entry.supportsVision ? 'multimodal' : 'text',
      input_modalities: entry.inputModalities,
      output_modalities: entry.outputModalities,
      tokenizer: 'unknown',
    },
    pricing: {
      prompt: String(entry.pricing.input),
      completion: String(entry.pricing.output),
      request: '0',
      image: '0',
    },
    top_provider: {
      context_length: entry.contextLength,
      max_completion_tokens: entry.maxOutputTokens,
      is_moderated: false,
    },
    supported_parameters: supportedParams,
    last_updated: entry.lastUpdated,
    providerMetadata: entry.providerMetadata,
  }
}

export function saveProviderModels(providerId: string, models: OpenRouterModel[]): void {
  const settings = getSettings()
  const providerConfig = (settings.ai.providers[providerId] || {}) as ProviderConfig
  const entries: Record<string, ModelCapabilityEntry> = {}

  for (const model of models) {
    entries[model.id] = openRouterModelToCapabilityEntry(model, providerId)
  }

  providerConfig.models = entries
  providerConfig.modelsLastFetched = Date.now()
  settings.ai.providers[providerId] = providerConfig
  saveSettings(settings)
  console.log(`[ModelRegistry] Saved ${Object.keys(entries).length} provider-direct models for ${providerId}`)
}

function sortModels(models: OpenRouterModel[]): OpenRouterModel[] {
  return [...models].sort((a, b) => {
    const ad = a.last_updated || ''
    const bd = b.last_updated || ''
    if (ad && !bd) return -1
    if (!ad && bd) return 1
    if (!ad && !bd) return a.id.localeCompare(b.id)
    return bd.localeCompare(ad)
  })
}

// ============================================================================
// Fetch & Refresh — per provider
// ============================================================================

async function fetchModelsDevData(): Promise<ModelsDevResponse> {
  console.log('[ModelRegistry] Fetching from models.dev...')

  const response = await createRequiredAppFetch()(MODELS_DEV_API, {
    headers: { 'Accept': 'application/json', 'User-Agent': 'onething-electron/1.0' },
    signal: AbortSignal.timeout(15000),
  })

  if (!response.ok) throw new Error(`models.dev API error: ${response.status}`)

  const data: ModelsDevResponse = await response.json()
  const pc = Object.keys(data).length
  const mc = Object.values(data).reduce((s, p) => s + Object.keys(p.models).length, 0)
  console.log(`[ModelRegistry] Fetched ${mc} models from ${pc} providers`)
  return data
}

/**
 * Refresh models for a specific provider only.
 * Fetches from models.dev and stores results under settings.ai.providers[providerId].models.
 */
export async function refreshProviderModels(providerId: string): Promise<void> {
  console.log(`[ModelRegistry] Refreshing models for provider: ${providerId}`)

  if (providerId === 'codex') {
    console.log('[ModelRegistry] Codex models are loaded from the authenticated Codex backend')
    return
  }

  const data = await fetchModelsDevData()

  // Find the models.dev key for this provider
  const devProviderId = Object.entries(PROVIDER_MAPPING).find(([, v]) => v === providerId)?.[0] || providerId
  const devProvider = data[devProviderId]

  if (!devProvider) {
    console.warn(`[ModelRegistry] No models.dev data found for provider: ${providerId} (dev key: ${devProviderId})`)
    return
  }

  const models: Record<string, ModelCapabilityEntry> = {}
  for (const [modelId, model] of Object.entries(devProvider.models)) {
    models[modelId] = toCapabilityEntry(model, providerId)
  }

  // Store under provider config
  const settings = getSettings()
  const providerConfig = (settings.ai.providers[providerId] || {}) as ProviderConfig
  providerConfig.models = models
  providerConfig.modelsLastFetched = Date.now()
  settings.ai.providers[providerId] = providerConfig

  saveSettings(settings)
  console.log(`[ModelRegistry] Saved ${Object.keys(models).length} models for provider ${providerId}`)
}

/**
 * Refresh models for all configured providers.
 */
export async function refreshAllProviders(): Promise<void> {
  const settings = getSettings()
  const providers = settings?.ai?.providers
  if (!providers) return

  const providerIds = Object.keys(providers).filter(pid => {
    // Skip 'custom' and empty/invalid providers
    if (pid === 'custom') return false
    if (pid === 'codex') return false
    return true
  })

  console.log(`[ModelRegistry] Refreshing models for ${providerIds.length} providers: ${providerIds.join(', ')}`)

  const data = await fetchModelsDevData()

  for (const providerId of providerIds) {
    const devProviderId = Object.entries(PROVIDER_MAPPING).find(([, v]) => v === providerId)?.[0] || providerId
    const devProvider = data[devProviderId]

    if (!devProvider) {
      console.warn(`[ModelRegistry] No models.dev data for provider: ${providerId}`)
      continue
    }

    const models: Record<string, ModelCapabilityEntry> = {}
    for (const [modelId, model] of Object.entries(devProvider.models)) {
      models[modelId] = toCapabilityEntry(model, providerId)
    }

    const providerConfig = (providers[providerId] || {}) as ProviderConfig
    providerConfig.models = models
    providerConfig.modelsLastFetched = Date.now()
    settings.ai.providers[providerId] = providerConfig

    console.log(`[ModelRegistry]   ${providerId}: ${Object.keys(models).length} models`)
  }

  saveSettings(settings)
  console.log('[ModelRegistry] All providers refreshed')
}

// Legacy alias
export const forceRefresh = refreshAllProviders

// ============================================================================
// Public API — Data Queries (returns OpenRouterModel[] for compatibility)
// ============================================================================

export async function getModelsForProvider(providerId: string): Promise<OpenRouterModel[]> {
  const models = getProviderModels(providerId)
  if (!models) {
    return providerId === 'codex' ? getCodexFallbackModels() : []
  }

  let entries = Object.values(models)

  if (providerId === 'claude-code') {
    entries = entries.filter(e => {
      const lower = e.id.toLowerCase()
      return CLAUDE_CODE_MODEL_PATTERNS.some(p => lower.includes(p))
    })
  }

  return sortModels(entries.map(toOpenRouterModel))
}

export async function getAllModels(): Promise<OpenRouterModel[]> {
  const providers = getSettings()?.ai?.providers
  if (!providers) return []

  const all: OpenRouterModel[] = []
  for (const pid of Object.keys(providers)) {
    const models = (providers[pid] as ProviderConfig)?.models
    if (models) {
      for (const entry of Object.values(models)) {
        all.push(toOpenRouterModel(entry))
      }
    }
  }
  return sortModels(all)
}

export async function searchModels(query: string, providerId?: string): Promise<OpenRouterModel[]> {
  const models = providerId ? await getModelsForProvider(providerId) : await getAllModels()
  const lower = query.toLowerCase()
  return models.filter(m =>
    m.id.toLowerCase().includes(lower) ||
    m.name.toLowerCase().includes(lower) ||
    m.description?.toLowerCase().includes(lower)
  )
}

export async function getModelById(modelId: string): Promise<OpenRouterModel | undefined> {
  const entry = getModelEntry(modelId)
  return entry ? toOpenRouterModel(entry) : undefined
}

export async function getModelMaxOutputTokens(modelId: string): Promise<number> {
  return getModelEntry(modelId)?.maxOutputTokens || 4096
}

// ============================================================================
// Public API — Capability Checks
// ============================================================================

export async function modelSupportsTools(modelId: string, providerId?: string): Promise<boolean> {
  const override = getCapabilityOverride(modelId, providerId, 'tools')
  if (override !== undefined) return override

  const entry = getModelEntry(modelId)
  if (entry) return entry.supportsTools

  const lower = modelId.toLowerCase()
  if (['image', 'vision-preview', 'dall-e', 'imagen', 'ocr', 'embedding', 'asr'].some(p => lower.includes(p))) return false
  return true
}

export async function modelSupportsTemperature(modelId: string, _providerId?: string): Promise<boolean> {
  const entry = getModelEntry(modelId)
  if (entry) return entry.supportsTemperature
  return true
}

export async function modelSupportsReasoning(modelId: string, providerId?: string): Promise<boolean> {
  const override = getCapabilityOverride(modelId, providerId, 'reasoning')
  if (override !== undefined) return override

  const entry = getModelEntry(modelId)
  if (entry) return entry.supportsReasoning

  const lower = modelId.toLowerCase()
  return ['reasoner', 'o1', 'o3', 'thinking'].some(p => lower.includes(p))
}

export function modelSupportsReasoningSync(modelId: string, providerId?: string): boolean {
  const override = getCapabilityOverride(modelId, providerId, 'reasoning')
  if (override !== undefined) return override

  const entry = getModelEntry(modelId)
  if (entry) return entry.supportsReasoning

  const lower = modelId.toLowerCase()
  if (lower.includes('gpt-5.2-chat') || lower.includes('gpt-5.2-instant')) return false
  if (['reasoner', 'o1-', 'o3-', '-o1', '-o3', 'thinking'].some(p => lower.includes(p))) return true
  return false
}

export async function modelSupportsImageGeneration(modelId: string, providerId?: string): Promise<boolean> {
  const override = getCapabilityOverride(modelId, providerId, 'imageOutput')
  if (override !== undefined) return override

  const lower = modelId.toLowerCase()
  if (lower.includes('gemini') && lower.includes('image')) return true
  if (['dall-e', 'dalle', 'imagen', 'gpt-image', 'flux', 'stable-diffusion', 'midjourney'].some(p => lower.includes(p))) return true

  const entry = getModelEntry(modelId)
  if (entry) return entry.supportsImageOutput

  return false
}

// ============================================================================
// Public API — Utility
// ============================================================================

export function getCacheStatus(): { lastFetched: number; modelCount: number; isStale: boolean } {
  const providers = getSettings()?.ai?.providers
  let total = 0
  let latest = 0
  if (providers) {
    for (const pid of Object.keys(providers)) {
      const cfg = providers[pid] as ProviderConfig
      const count = cfg?.models ? Object.keys(cfg.models).length : 0
      total += count
      if (cfg?.modelsLastFetched && cfg.modelsLastFetched > latest) latest = cfg.modelsLastFetched
    }
  }
  return { lastFetched: latest, modelCount: total, isStale: total === 0 }
}

export function getModelDisplayName(modelId: string): string {
  return MODEL_NAME_ALIASES[modelId] || modelId
}

export function getModelNameAliases(): Record<string, string> {
  return { ...MODEL_NAME_ALIASES }
}
