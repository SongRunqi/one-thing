/**
 * Model Registry Service
 *
 * Fetches and caches model information from Models.dev API.
 * Models.dev provides comprehensive model metadata including tool_call support.
 */

import type { OpenRouterModel } from '../../../shared/ipc.js'

// Models.dev API types
interface ModelsDevModel {
  id: string
  name: string
  family?: string
  release_date?: string
  attachment?: boolean
  reasoning?: boolean
  temperature?: boolean
  tool_call?: boolean
  knowledge?: boolean
  cost?: {
    input?: number
    output?: number
    cache_read?: number
    cache_write?: number
  }
  limit?: {
    context?: number
    output?: number
  }
  modalities?: {
    input?: string[]
    output?: string[]
  }
  experimental?: boolean
  status?: string
}

interface ModelsDevProvider {
  id: string
  name: string
  api?: string
  env?: string[]
  npm?: string
  models: Record<string, ModelsDevModel>
}

type ModelsDevResponse = Record<string, ModelsDevProvider>

// Cache for fetched models
interface ModelCache {
  models: Map<string, OpenRouterModel[]>  // provider -> models
  allModels: OpenRouterModel[]
  modelsDevData: ModelsDevResponse | null  // Raw Models.dev data for capability lookup
  lastFetched: number
}

// Cache never expires - only refresh manually or on app restart
const CACHE_TTL = Infinity
const MODELS_DEV_API = 'https://models.dev/api.json'

// Provider ID mapping from Models.dev to our provider IDs
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

// Reverse mapping: our provider ID -> Models.dev provider ID
const REVERSE_PROVIDER_MAPPING: Record<string, string> = Object.entries(PROVIDER_MAPPING)
  .reduce((acc, [k, v]) => ({ ...acc, [v]: k }), {} as Record<string, string>)

// Models that should be available for Claude Code OAuth (Pro/Max tier)
const CLAUDE_CODE_MODEL_PATTERNS = [
  'claude-sonnet',
  'claude-haiku',
  'claude-opus',
  'claude-3-5',
  'claude-3.5',
  'claude-3.7',
  'claude-4',
]

let cache: ModelCache = {
  models: new Map(),
  allModels: [],
  modelsDevData: null,
  lastFetched: 0,
}

// Friendly name aliases for models (more fun names!)
const MODEL_NAME_ALIASES: Record<string, string> = {
  'gemini-2.5-flash-image': 'Nano-Banana',
  'gemini-2.5-flash-image-preview': 'Nano-Banana Preview',
}

/**
 * Convert Models.dev model to OpenRouterModel format
 */
function convertToOpenRouterModel(model: ModelsDevModel, providerId: string): OpenRouterModel {
  const inputModalities = model.modalities?.input || ['text']
  const outputModalities = model.modalities?.output || ['text']

  // Build supported_parameters based on Models.dev fields
  const supported_parameters: string[] = []
  if (model.temperature !== false) supported_parameters.push('temperature')
  if (model.tool_call) supported_parameters.push('tools')
  if (model.reasoning) supported_parameters.push('reasoning')
  if (model.attachment) supported_parameters.push('attachments')

  // Use friendly alias if available
  const displayName = MODEL_NAME_ALIASES[model.id] || model.name

  return {
    id: model.id,
    name: displayName,
    description: model.family ? `${model.family} family` : undefined,
    context_length: model.limit?.context || 128000,
    architecture: {
      modality: inputModalities.includes('image') ? 'multimodal' : 'text',
      input_modalities: inputModalities,
      output_modalities: outputModalities,
      tokenizer: 'unknown',
    },
    pricing: {
      prompt: model.cost?.input ? String(model.cost.input) : '0',
      completion: model.cost?.output ? String(model.cost.output) : '0',
      request: '0',
      image: '0',
    },
    top_provider: {
      context_length: model.limit?.context || 128000,
      max_completion_tokens: model.limit?.output || 4096,
      is_moderated: false,
    },
    supported_parameters,
  }
}

/**
 * Fetch models from Models.dev API
 */
async function fetchFromModelsDev(): Promise<ModelsDevResponse> {
  console.log('[ModelRegistry] Fetching models from Models.dev...')

  const response = await fetch(MODELS_DEV_API, {
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'onething-electron/1.0',
    },
    signal: AbortSignal.timeout(10000),
  })

  if (!response.ok) {
    throw new Error(`Models.dev API error: ${response.status}`)
  }

  const data: ModelsDevResponse = await response.json()
  const providerCount = Object.keys(data).length
  const modelCount = Object.values(data).reduce((sum, p) => sum + Object.keys(p.models).length, 0)
  console.log(`[ModelRegistry] Fetched ${modelCount} models from ${providerCount} providers via Models.dev`)

  return data
}

/**
 * Process Models.dev data into our cache format
 */
function processModelsDevData(data: ModelsDevResponse): {
  models: Map<string, OpenRouterModel[]>
  allModels: OpenRouterModel[]
} {
  const grouped = new Map<string, OpenRouterModel[]>()
  const allModels: OpenRouterModel[] = []

  // Initialize with empty arrays for known providers
  for (const providerId of Object.values(PROVIDER_MAPPING)) {
    grouped.set(providerId, [])
  }
  grouped.set('openrouter', [])

  for (const [modelsDevProviderId, provider] of Object.entries(data)) {
    const ourProviderId = PROVIDER_MAPPING[modelsDevProviderId]

    for (const [modelId, model] of Object.entries(provider.models)) {
      const converted = convertToOpenRouterModel(model, modelsDevProviderId)

      // Add to all models
      allModels.push(converted)

      // Add to openrouter (all models)
      const openrouterModels = grouped.get('openrouter')!
      openrouterModels.push(converted)

      // Add to specific provider if mapped
      if (ourProviderId) {
        const providerModels = grouped.get(ourProviderId) || []
        providerModels.push(converted)
        grouped.set(ourProviderId, providerModels)
      }
    }
  }

  return { models: grouped, allModels }
}

/**
 * Refresh the model cache
 */
async function refreshCache(): Promise<void> {
  try {
    const data = await fetchFromModelsDev()
    const { models, allModels } = processModelsDevData(data)

    cache = {
      models,
      allModels,
      modelsDevData: data,
      lastFetched: Date.now(),
    }
    console.log('[ModelRegistry] Cache refreshed with', allModels.length, 'models')
  } catch (error) {
    console.error('[ModelRegistry] Failed to refresh cache:', error)
    throw error
  }
}

/**
 * Check if cache is stale
 */
function isCacheStale(): boolean {
  return Date.now() - cache.lastFetched > CACHE_TTL
}

/**
 * Get models for a specific provider
 */
export async function getModelsForProvider(providerId: string): Promise<OpenRouterModel[]> {
  // Refresh cache if stale or empty
  if (isCacheStale() || cache.allModels.length === 0) {
    await refreshCache()
  }

  // Special handling for claude-code (limited model set for Pro/Max tier)
  if (providerId === 'claude-code') {
    const claudeModels = cache.models.get('claude') || []
    return claudeModels.filter(m =>
      CLAUDE_CODE_MODEL_PATTERNS.some(pattern => m.id.toLowerCase().includes(pattern))
    )
  }

  return cache.models.get(providerId) || []
}

/**
 * Get all available models
 */
export async function getAllModels(): Promise<OpenRouterModel[]> {
  if (isCacheStale() || cache.allModels.length === 0) {
    await refreshCache()
  }

  return cache.allModels
}

/**
 * Search models by name or ID
 */
export async function searchModels(query: string, providerId?: string): Promise<OpenRouterModel[]> {
  const models = providerId
    ? await getModelsForProvider(providerId)
    : await getAllModels()

  const lowerQuery = query.toLowerCase()
  return models.filter(m =>
    m.id.toLowerCase().includes(lowerQuery) ||
    m.name.toLowerCase().includes(lowerQuery) ||
    m.description?.toLowerCase().includes(lowerQuery)
  )
}

/**
 * Get model by ID
 */
export async function getModelById(modelId: string): Promise<OpenRouterModel | undefined> {
  if (isCacheStale() || cache.allModels.length === 0) {
    await refreshCache()
  }

  // Search in all models
  return cache.allModels.find(m => m.id === modelId)
}

/**
 * Check if a model supports tool calls
 * Uses Models.dev's tool_call field for accurate detection
 */
export async function modelSupportsTools(modelId: string, providerId?: string): Promise<boolean> {
  if (isCacheStale() || cache.modelsDevData === null) {
    await refreshCache()
  }

  // First try to find in Models.dev data directly
  if (cache.modelsDevData) {
    // Try the specific provider first
    if (providerId) {
      const modelsDevProviderId = REVERSE_PROVIDER_MAPPING[providerId] || providerId
      const provider = cache.modelsDevData[modelsDevProviderId]
      if (provider?.models[modelId]) {
        const toolCall = provider.models[modelId].tool_call
        console.log(`[ModelRegistry] Model ${modelId} tool_call=${toolCall} (from ${modelsDevProviderId})`)
        return toolCall === true
      }
    }

    // Search across all providers
    for (const [provId, provider] of Object.entries(cache.modelsDevData)) {
      if (provider.models[modelId]) {
        const toolCall = provider.models[modelId].tool_call
        console.log(`[ModelRegistry] Model ${modelId} tool_call=${toolCall} (from ${provId})`)
        return toolCall === true
      }
    }
  }

  // Fallback: check supported_parameters in converted model
  const model = await getModelById(modelId)
  if (model?.supported_parameters) {
    const hasTools = model.supported_parameters.includes('tools')
    console.log(`[ModelRegistry] Model ${modelId} tools=${hasTools} (from supported_parameters)`)
    return hasTools
  }

  // Final fallback: use name-based detection
  const lowerModelId = modelId.toLowerCase()
  const noToolsPatterns = ['image', 'vision-preview', 'dall-e', 'imagen', 'ocr', 'embedding', 'asr']
  if (noToolsPatterns.some(p => lowerModelId.includes(p))) {
    console.log(`[ModelRegistry] Model ${modelId} detected as non-tool model by name pattern`)
    return false
  }

  // Default: assume supports tools
  console.log(`[ModelRegistry] Model ${modelId} not found, assuming tools support`)
  return true
}

/**
 * Check if a model is a reasoning/thinking model
 * Uses Models.dev's reasoning field for accurate detection
 * Reasoning models (like DeepSeek Reasoner, o1, o3) don't support temperature
 */
export async function modelSupportsReasoning(modelId: string, providerId?: string): Promise<boolean> {
  if (isCacheStale() || cache.modelsDevData === null) {
    await refreshCache()
  }

  // First try to find in Models.dev data directly
  if (cache.modelsDevData) {
    // Try the specific provider first
    if (providerId) {
      const modelsDevProviderId = REVERSE_PROVIDER_MAPPING[providerId] || providerId
      const provider = cache.modelsDevData[modelsDevProviderId]
      if (provider?.models[modelId]) {
        const reasoning = provider.models[modelId].reasoning
        console.log(`[ModelRegistry] Model ${modelId} reasoning=${reasoning} (from ${modelsDevProviderId})`)
        return reasoning === true
      }
    }

    // Search across all providers
    for (const [provId, provider] of Object.entries(cache.modelsDevData)) {
      if (provider.models[modelId]) {
        const reasoning = provider.models[modelId].reasoning
        console.log(`[ModelRegistry] Model ${modelId} reasoning=${reasoning} (from ${provId})`)
        return reasoning === true
      }
    }
  }

  // Fallback: check supported_parameters in converted model
  const model = await getModelById(modelId)
  if (model?.supported_parameters) {
    const hasReasoning = model.supported_parameters.includes('reasoning')
    console.log(`[ModelRegistry] Model ${modelId} reasoning=${hasReasoning} (from supported_parameters)`)
    return hasReasoning
  }

  // Final fallback: use name-based detection for known reasoning models
  const lowerModelId = modelId.toLowerCase()
  const reasoningPatterns = ['reasoner', 'o1', 'o3', 'thinking']
  if (reasoningPatterns.some(p => lowerModelId.includes(p))) {
    console.log(`[ModelRegistry] Model ${modelId} detected as reasoning model by name pattern`)
    return true
  }

  console.log(`[ModelRegistry] Model ${modelId} not found, assuming no reasoning`)
  return false
}

/**
 * Synchronous check if a model is a reasoning model
 * Uses cached data, falls back to name-based detection if cache is not ready
 * This is needed for streaming where we can't await
 */
export function modelSupportsReasoningSync(modelId: string, providerId?: string): boolean {
  // First try cache
  if (cache.modelsDevData) {
    // Try the specific provider first
    if (providerId) {
      const modelsDevProviderId = REVERSE_PROVIDER_MAPPING[providerId] || providerId
      const provider = cache.modelsDevData[modelsDevProviderId]
      if (provider?.models[modelId]) {
        return provider.models[modelId].reasoning === true
      }
    }

    // Search across all providers
    for (const provider of Object.values(cache.modelsDevData)) {
      if (provider.models[modelId]) {
        return provider.models[modelId].reasoning === true
      }
    }
  }

  // Fallback: name-based detection
  const lowerModelId = modelId.toLowerCase()
  const reasoningPatterns = ['reasoner', 'o1-', 'o3-', '-o1', '-o3', 'thinking']
  // Exclude non-reasoning models that might match patterns
  if (lowerModelId.includes('gpt-5.2-chat') || lowerModelId.includes('gpt-5.2-instant')) {
    return false
  }
  return reasoningPatterns.some(p => lowerModelId.includes(p))
}

/**
 * Check if a model supports image generation
 * Uses Models.dev's modalities.output field for accurate detection
 */
export async function modelSupportsImageGeneration(modelId: string, providerId?: string): Promise<boolean> {
  console.log(`[ModelRegistry] Checking image generation support for: ${modelId} (provider: ${providerId})`)
  const lowerModelId = modelId.toLowerCase()

  // FIRST: Check name-based patterns (highest priority for known image models)
  // This ensures we catch image models even if Models.dev data is incomplete
  const imageGenPatterns = ['dall-e', 'dalle', 'imagen', 'gpt-image', 'flux', 'stable-diffusion', 'midjourney']

  // Special case for Gemini image models
  const hasGemini = lowerModelId.includes('gemini')
  const hasImage = lowerModelId.includes('image')
  console.log(`[ModelRegistry] Name check: hasGemini=${hasGemini}, hasImage=${hasImage}`)
  if (hasGemini && hasImage) {
    console.log(`[ModelRegistry] Model ${modelId} detected as Gemini image model by name pattern`)
    return true
  }

  if (imageGenPatterns.some(p => lowerModelId.includes(p))) {
    console.log(`[ModelRegistry] Model ${modelId} detected as image generation model by name pattern`)
    return true
  }

  // SECOND: Try to find in Models.dev data
  if (isCacheStale() || cache.modelsDevData === null) {
    await refreshCache()
  }

  if (cache.modelsDevData) {
    // Try the specific provider first
    if (providerId) {
      const modelsDevProviderId = REVERSE_PROVIDER_MAPPING[providerId] || providerId
      const provider = cache.modelsDevData[modelsDevProviderId]
      if (provider?.models[modelId]) {
        const outputModalities = provider.models[modelId].modalities?.output || []
        const supportsImage = outputModalities.includes('image')
        console.log(`[ModelRegistry] Model ${modelId} image_output=${supportsImage} (modalities: ${outputModalities.join(', ')})`)
        return supportsImage
      }
    }

    // Search across all providers
    for (const [provId, provider] of Object.entries(cache.modelsDevData)) {
      if (provider.models[modelId]) {
        const outputModalities = provider.models[modelId].modalities?.output || []
        const supportsImage = outputModalities.includes('image')
        console.log(`[ModelRegistry] Model ${modelId} image_output=${supportsImage} (from ${provId})`)
        return supportsImage
      }
    }
  }

  console.log(`[ModelRegistry] Model ${modelId} not found in registry, assuming no image generation`)
  return false
}

/**
 * Force refresh the cache
 */
export async function forceRefresh(): Promise<void> {
  await refreshCache()
}

/**
 * Get cache status
 */
export function getCacheStatus(): { lastFetched: number; modelCount: number; isStale: boolean } {
  return {
    lastFetched: cache.lastFetched,
    modelCount: cache.allModels.length,
    isStale: isCacheStale(),
  }
}

/**
 * Get display name for a model ID
 * Uses MODEL_NAME_ALIASES for friendly names
 */
export function getModelDisplayName(modelId: string): string {
  return MODEL_NAME_ALIASES[modelId] || modelId
}

/**
 * Get all model name aliases
 */
export function getModelNameAliases(): Record<string, string> {
  return { ...MODEL_NAME_ALIASES }
}

// Embedding model info with dimension
export interface EmbeddingModelInfo {
  id: string
  name: string
  dimension: number
  isConfigurable: boolean  // true if dimension can be customized
  providerId: string       // Our provider ID (openai, gemini, zhipu, etc.)
}

// Provider ID mapping for embedding models
const EMBEDDING_PROVIDER_MAPPING: Record<string, string> = {
  'openai': 'openai',
  'google': 'gemini',
  'zhipuai': 'zhipu',
}

/**
 * Get embedding models for a specific provider from Models.dev
 * Returns models with dimension info from limit.output field
 */
export async function getEmbeddingModelsForProvider(providerId: string): Promise<EmbeddingModelInfo[]> {
  if (isCacheStale() || cache.modelsDevData === null) {
    await refreshCache()
  }

  if (!cache.modelsDevData) {
    return []
  }

  // Map our provider ID to Models.dev provider ID
  const modelsDevProviderId = REVERSE_PROVIDER_MAPPING[providerId] || providerId
  const provider = cache.modelsDevData[modelsDevProviderId]

  if (!provider) {
    console.log(`[ModelRegistry] Provider ${providerId} (${modelsDevProviderId}) not found in Models.dev`)
    return []
  }

  const embeddingModels: EmbeddingModelInfo[] = []

  for (const [modelId, model] of Object.entries(provider.models)) {
    // Detect embedding models by:
    // 1. Model ID contains 'embed'
    // 2. Output modality doesn't include 'text' (pure embedding models have specific output)
    // 3. limit.output is a reasonable embedding dimension (256-4096)
    const isEmbedding = modelId.toLowerCase().includes('embed')
    const dimension = model.limit?.output

    if (isEmbedding && dimension && dimension >= 256 && dimension <= 8192) {
      // Configurable if model supports custom dimensions (text-embedding-3, gemini-embedding-001)
      const isConfigurable = modelId.includes('text-embedding-3') || modelId === 'gemini-embedding-001'

      embeddingModels.push({
        id: modelId,
        name: model.name || modelId,
        dimension,
        isConfigurable,
        providerId,
      })
    }
  }

  console.log(`[ModelRegistry] Found ${embeddingModels.length} embedding models for ${providerId}`)
  return embeddingModels
}

/**
 * Get all embedding models from all providers
 */
export async function getAllEmbeddingModels(): Promise<EmbeddingModelInfo[]> {
  if (isCacheStale() || cache.modelsDevData === null) {
    await refreshCache()
  }

  if (!cache.modelsDevData) {
    return []
  }

  const allModels: EmbeddingModelInfo[] = []

  for (const [modelsDevProviderId, provider] of Object.entries(cache.modelsDevData)) {
    const ourProviderId = EMBEDDING_PROVIDER_MAPPING[modelsDevProviderId]
    if (!ourProviderId) continue  // Only include mapped providers

    for (const [modelId, model] of Object.entries(provider.models)) {
      const isEmbedding = modelId.toLowerCase().includes('embed')
      const dimension = model.limit?.output

      if (isEmbedding && dimension && dimension >= 256 && dimension <= 8192) {
        const isConfigurable = modelId.includes('text-embedding-3') || modelId === 'gemini-embedding-001'

        allModels.push({
          id: modelId,
          name: model.name || modelId,
          dimension,
          isConfigurable,
          providerId: ourProviderId,
        })
      }
    }
  }

  console.log(`[ModelRegistry] Found ${allModels.length} total embedding models`)
  return allModels
}

/**
 * Get dimension for a specific embedding model
 */
export async function getEmbeddingDimension(modelId: string): Promise<number | null> {
  if (isCacheStale() || cache.modelsDevData === null) {
    await refreshCache()
  }

  if (!cache.modelsDevData) {
    return null
  }

  // Search across all providers
  for (const provider of Object.values(cache.modelsDevData)) {
    const model = provider.models[modelId]
    if (model?.limit?.output) {
      return model.limit.output
    }
  }

  return null
}
