import { ipcMain } from 'electron'
import {
  IPC_CHANNELS,
  AIProvider,
  FetchModelsRequest,
  FetchModelsResponse,
  GetCachedModelsRequest,
  GetCachedModelsResponse,
  ModelInfo,
  ModelType,
  OpenRouterModel,
} from '../../shared/ipc.js'
import { getCachedModels, setCachedModels } from '../store.js'
import * as modelRegistry from '../services/model-registry.js'
import { oauthManager } from '../services/oauth-manager.js'
import { fetchCopilotModels, detectModelCapabilities } from '../providers/builtin/github-copilot.js'

// Predefined Claude models as fallback
const CLAUDE_FALLBACK_MODELS: ModelInfo[] = [
  { id: 'claude-opus-4-5-20251101', name: 'Claude Opus 4.5', description: 'Most capable, latest flagship' },
  { id: 'claude-sonnet-4-5-20250929', name: 'Claude Sonnet 4.5', description: 'Best balance of speed & intelligence' },
  { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5', description: 'Fastest, cost-effective' },
  { id: 'claude-opus-4-1-20250805', name: 'Claude Opus 4.1', description: 'Previous flagship' },
  { id: 'claude-opus-4-20250514', name: 'Claude Opus 4', description: 'Deep reasoning' },
  { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', description: 'Balanced performance' },
  { id: 'claude-3-7-sonnet-20250219', name: 'Claude 3.7 Sonnet', description: 'Hybrid reasoning' },
  { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', description: 'Fast & efficient' },
  { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku', description: 'Legacy, fast' },
]

// Predefined DeepSeek models as fallback
const DEEPSEEK_FALLBACK_MODELS: ModelInfo[] = [
  { id: 'deepseek-chat', name: 'DeepSeek Chat', description: 'General chat model (DeepSeek-V3)' },
  { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner', description: 'Advanced reasoning model (DeepSeek-R1)' },
]

// Predefined Kimi models as fallback
const KIMI_FALLBACK_MODELS: ModelInfo[] = [
  { id: 'moonshot-v1-8k', name: 'Moonshot v1 8K', description: '8K context window' },
  { id: 'moonshot-v1-32k', name: 'Moonshot v1 32K', description: '32K context window' },
  { id: 'moonshot-v1-128k', name: 'Moonshot v1 128K', description: '128K context window' },
]

// Predefined Zhipu models as fallback
const ZHIPU_FALLBACK_MODELS: ModelInfo[] = [
  { id: 'glm-4-flash', name: 'GLM-4 Flash', description: 'Fast, cost-effective' },
  { id: 'glm-4-plus', name: 'GLM-4 Plus', description: 'Enhanced capabilities' },
  { id: 'glm-4', name: 'GLM-4', description: 'Standard model' },
  { id: 'glm-4-air', name: 'GLM-4 Air', description: 'Lightweight model' },
  { id: 'glm-4-airx', name: 'GLM-4 AirX', description: 'Extended lightweight model' },
  { id: 'glm-4-long', name: 'GLM-4 Long', description: 'Long context support' },
]

// Predefined OpenRouter models as fallback
const OPENROUTER_FALLBACK_MODELS: ModelInfo[] = [
  { id: 'openai/gpt-4o', name: 'GPT-4o', description: 'OpenAI GPT-4o' },
  { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', description: 'OpenAI GPT-4o Mini' },
  { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', description: 'Anthropic Claude 3.5 Sonnet' },
  { id: 'anthropic/claude-3-opus', name: 'Claude 3 Opus', description: 'Anthropic Claude 3 Opus' },
  { id: 'google/gemini-pro-1.5', name: 'Gemini Pro 1.5', description: 'Google Gemini Pro 1.5' },
  { id: 'meta-llama/llama-3.1-70b-instruct', name: 'Llama 3.1 70B', description: 'Meta Llama 3.1 70B Instruct' },
]

// Predefined OpenAI models as fallback (chat models only)
const OPENAI_FALLBACK_MODELS: ModelInfo[] = [
  { id: 'gpt-4o', name: 'GPT-4o', description: 'Most capable GPT-4 model' },
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini', description: 'Fast and affordable' },
  { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', description: 'GPT-4 Turbo with vision' },
  { id: 'gpt-4', name: 'GPT-4', description: 'Most capable GPT-4' },
  { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', description: 'Fast and cost-effective' },
]

// Predefined Gemini models as fallback
const GEMINI_FALLBACK_MODELS: ModelInfo[] = [
  { id: 'gemini-2.0-flash-exp', name: 'Gemini 2.0 Flash', description: 'Latest experimental model' },
  { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', description: 'High-performance model' },
  { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', description: 'Fast and efficient' },
  { id: 'gemini-1.5-flash-8b', name: 'Gemini 1.5 Flash 8B', description: 'Lightweight model' },
  { id: 'gemini-1.0-pro', name: 'Gemini 1.0 Pro', description: 'Stable model' },
]

// Claude Code models (same as Claude API, uses OAuth subscription)
const CLAUDE_CODE_FALLBACK_MODELS: ModelInfo[] = [
  { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', description: 'Latest balanced model' },
  { id: 'claude-opus-4-20250514', name: 'Claude Opus 4', description: 'Most capable model' },
  { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', description: 'Fast & efficient' },
  { id: 'claude-3-7-sonnet-20250219', name: 'Claude 3.7 Sonnet', description: 'Hybrid reasoning' },
  { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', description: 'Previous balanced' },
]

// GitHub Copilot models
const GITHUB_COPILOT_FALLBACK_MODELS: ModelInfo[] = [
  { id: 'gpt-4o', name: 'GPT-4o', description: 'Most capable OpenAI model' },
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini', description: 'Fast and affordable' },
  { id: 'gpt-4.1', name: 'GPT-4.1', description: 'Latest GPT-4 update' },
  { id: 'o3-mini', name: 'o3-mini', description: 'Advanced reasoning, fast' },
  { id: 'o1', name: 'o1', description: 'Deep reasoning model' },
  { id: 'o1-mini', name: 'o1-mini', description: 'Reasoning, cost-effective' },
  { id: 'claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', description: 'Anthropic via Copilot' },
  { id: 'gemini-2.0-flash-001', name: 'Gemini 2.0 Flash', description: 'Google via Copilot' },
]

async function fetchOpenAIModels(apiKey: string, baseUrl: string): Promise<ModelInfo[]> {
  const response = await fetch(`${baseUrl}/models`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  })

  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`)
  }

  const data = await response.json()

  // Detect model type based on ID
  function detectModelType(id: string): ModelType {
    const lowerId = id.toLowerCase()
    if (lowerId.includes('dall-e') || lowerId.includes('gpt-image') || lowerId.includes('chatgpt-image')) return 'image'
    if (lowerId.includes('embedding') || lowerId.includes('text-embedding')) return 'embedding'
    if (lowerId.includes('whisper')) return 'audio'
    if (lowerId.includes('tts')) return 'tts'
    if (lowerId.includes('gpt') || lowerId.includes('o1') || lowerId.includes('o3')) return 'chat'
    return 'other'
  }

  // Filter for relevant models (chat + image + embedding)
  const relevantTypes: ModelType[] = ['chat', 'image', 'embedding']
  const models = (data.data || [])
    .map((m: any) => {
      const type = detectModelType(m.id)
      return {
        id: m.id,
        name: m.id,
        type,
        createdAt: m.created ? new Date(m.created * 1000).toISOString() : undefined,
      }
    })
    .filter((m: ModelInfo) => relevantTypes.includes(m.type!))
    .sort((a: ModelInfo, b: ModelInfo) => {
      // Sort by type first (chat before image), then by id
      if (a.type !== b.type) {
        return a.type === 'chat' ? -1 : 1
      }
      return a.id.localeCompare(b.id)
    })

  return models
}

async function fetchClaudeModels(apiKey: string, baseUrl: string): Promise<ModelInfo[]> {
  const response = await fetch(`${baseUrl}/models`, {
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
  })

  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`)
  }

  const data = await response.json()
  return (data.data || []).map((m: any) => ({
    id: m.id,
    name: m.display_name || m.id,
    createdAt: m.created_at,
  }))
}

async function fetchCustomModels(apiKey: string, baseUrl: string): Promise<ModelInfo[]> {
  const response = await fetch(`${baseUrl}/models`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  })

  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`)
  }

  const data = await response.json()
  return (data.data || []).map((m: any) => ({
    id: m.id,
    name: m.id,
    createdAt: m.created ? new Date(m.created * 1000).toISOString() : undefined,
  }))
}

async function fetchZhipuModels(apiKey: string, baseUrl: string): Promise<ModelInfo[]> {
  const response = await fetch(`${baseUrl}/models`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  })

  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`)
  }

  const data = await response.json()

  // Detect model type based on ID
  function detectZhipuModelType(id: string): ModelType {
    const lowerId = id.toLowerCase()
    if (lowerId.includes('embedding')) return 'embedding'
    if (lowerId.includes('cogview') || lowerId.includes('image')) return 'image'
    if (lowerId.includes('glm') || lowerId.includes('chat')) return 'chat'
    return 'other'
  }

  // Filter for relevant models (chat + image + embedding)
  const relevantTypes: ModelType[] = ['chat', 'image', 'embedding']
  return (data.data || [])
    .map((m: any) => {
      const type = detectZhipuModelType(m.id)
      return {
        id: m.id,
        name: m.id,
        type,
        createdAt: m.created ? new Date(m.created * 1000).toISOString() : undefined,
      }
    })
    .filter((m: ModelInfo) => relevantTypes.includes(m.type!))
    .sort((a: ModelInfo, b: ModelInfo) => {
      // Sort by type first (chat before others), then by id
      if (a.type !== b.type) {
        return a.type === 'chat' ? -1 : 1
      }
      return a.id.localeCompare(b.id)
    })
}

async function fetchOpenRouterModels(apiKey: string): Promise<ModelInfo[]> {
  const response = await fetch('https://openrouter.ai/api/v1/models', {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  })

  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`)
  }

  const data = await response.json()
  return (data.data || []).map((m: any) => ({
    id: m.id,
    name: m.name || m.id,
    description: m.description,
  }))
}

async function fetchGeminiModels(apiKey: string, baseUrl: string): Promise<ModelInfo[]> {
  // Google uses API key as query parameter
  const response = await fetch(`${baseUrl}/models?key=${apiKey}`)

  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`)
  }

  const data = await response.json()

  // Detect model type based on supported methods and name
  function detectGeminiModelType(model: any): ModelType {
    const methods = model.supportedGenerationMethods || []
    const name = (model.name || '').toLowerCase()

    // Image generation models
    if (name.includes('imagen') || methods.includes('generateImage')) {
      return 'image'
    }
    // Embedding models
    if (name.includes('embedding') || methods.includes('embedContent')) {
      return 'embedding'
    }
    // Chat/text models
    if (methods.includes('generateContent')) {
      return 'chat'
    }
    return 'other'
  }

  // Filter for chat, image and embedding models
  const relevantTypes: ModelType[] = ['chat', 'image', 'embedding']

  return (data.models || [])
    .map((m: any) => {
      // Model name format: models/gemini-1.5-pro
      const id = m.name?.replace('models/', '') || m.name
      const type = detectGeminiModelType(m)
      return {
        id,
        name: m.displayName || id,
        description: m.description,
        type,
      }
    })
    .filter((m: ModelInfo) => relevantTypes.includes(m.type!))
    .sort((a: ModelInfo, b: ModelInfo) => {
      // Sort by type first (chat before image), then by id
      if (a.type !== b.type) {
        return a.type === 'chat' ? -1 : 1
      }
      return a.id.localeCompare(b.id)
    })
}

function getDefaultBaseUrl(provider: AIProvider): string {
  switch (provider) {
    case AIProvider.OpenAI:
      return 'https://api.openai.com/v1'
    case AIProvider.Claude:
      return 'https://api.anthropic.com/v1'
    case AIProvider.DeepSeek:
      return 'https://api.deepseek.com/v1'
    case AIProvider.Kimi:
      return 'https://api.moonshot.cn/v1'
    case AIProvider.Zhipu:
      return 'https://open.bigmodel.cn/api/paas/v4'
    case AIProvider.OpenRouter:
      return 'https://openrouter.ai/api/v1'
    case AIProvider.Gemini:
      return 'https://generativelanguage.googleapis.com/v1beta'
    default:
      return 'https://api.example.com/v1'
  }
}

async function handleFetchModels(
  _event: Electron.IpcMainInvokeEvent,
  request: FetchModelsRequest
): Promise<FetchModelsResponse> {
  const { provider, apiKey, baseUrl, forceRefresh } = request

  console.log(`[Models] handleFetchModels: provider=${provider}, hasApiKey=${!!apiKey}, baseUrl=${baseUrl}`)

  // Check cache first if not forcing refresh
  if (!forceRefresh) {
    const cached = getCachedModels(provider)
    if (cached && cached.models.length > 0) {
      console.log(`[Models] Returning ${cached.models.length} cached models for ${provider}`)
      return {
        success: true,
        models: cached.models,
        fromCache: true,
      }
    }
  }

  // Try to fetch from API
  try {
    const url = baseUrl || getDefaultBaseUrl(provider)
    let models: ModelInfo[] = []

    console.log(`[Models] Fetching from API: provider=${provider}, url=${url}`)

    switch (provider) {
      case AIProvider.OpenAI:
        models = await fetchOpenAIModels(apiKey, url)
        break
      case AIProvider.Claude:
        models = await fetchClaudeModels(apiKey, url)
        break
      case AIProvider.DeepSeek:
      case AIProvider.Kimi:
        // These providers use OpenAI-compatible API
        models = await fetchCustomModels(apiKey, url)
        break
      case AIProvider.Zhipu:
        // Zhipu has embedding models, use dedicated function
        models = await fetchZhipuModels(apiKey, url)
        break
      case AIProvider.Custom:
        models = await fetchCustomModels(apiKey, url)
        break
      case AIProvider.OpenRouter:
        models = await fetchOpenRouterModels(apiKey)
        break
      case AIProvider.Gemini:
        models = await fetchGeminiModels(apiKey, url)
        break
    }

    console.log(`[Models] Fetched ${models.length} models for ${provider}`)

    // Log embedding models specifically
    const embeddingModels = models.filter(m => m.type === 'embedding' || m.id.toLowerCase().includes('embedding'))
    console.log(`[Models] Embedding models for ${provider}:`, embeddingModels.map(m => ({ id: m.id, type: m.type })))

    // Cache the results
    if (models.length > 0) {
      setCachedModels(provider, models)
    }

    return {
      success: true,
      models,
      fromCache: false,
    }
  } catch (error: any) {
    // If fetch fails, try to return cached data
    const cached = getCachedModels(provider)
    if (cached && cached.models.length > 0) {
      return {
        success: true,
        models: cached.models,
        fromCache: true,
        error: `Using cached data. Fetch failed: ${error.message}`,
      }
    }

    // Return fallback models for providers that have them
    const fallbackModels = getFallbackModels(provider)
    if (fallbackModels) {
      return {
        success: true,
        models: fallbackModels,
        fromCache: false,
        error: `Using fallback models. Fetch failed: ${error.message}`,
      }
    }

    return {
      success: false,
      error: error.message || 'Failed to fetch models',
    }
  }
}

// Get fallback models for a provider
function getFallbackModels(provider: AIProvider | string): ModelInfo[] | null {
  switch (provider) {
    case AIProvider.OpenAI:
      return OPENAI_FALLBACK_MODELS
    case AIProvider.Claude:
      return CLAUDE_FALLBACK_MODELS
    case AIProvider.DeepSeek:
      return DEEPSEEK_FALLBACK_MODELS
    case AIProvider.Kimi:
      return KIMI_FALLBACK_MODELS
    case AIProvider.Zhipu:
      return ZHIPU_FALLBACK_MODELS
    case AIProvider.OpenRouter:
      return OPENROUTER_FALLBACK_MODELS
    case AIProvider.Gemini:
      return GEMINI_FALLBACK_MODELS
    case AIProvider.ClaudeCode:
    case 'claude-code':
      return CLAUDE_CODE_FALLBACK_MODELS
    case AIProvider.GitHubCopilot:
    case 'github-copilot':
      return GITHUB_COPILOT_FALLBACK_MODELS
    default:
      return null
  }
}

async function handleGetCachedModels(
  _event: Electron.IpcMainInvokeEvent,
  request: GetCachedModelsRequest
): Promise<GetCachedModelsResponse> {
  const { provider } = request
  const cached = getCachedModels(provider)

  if (cached) {
    return {
      success: true,
      models: cached.models,
      cachedAt: cached.cachedAt,
    }
  }

  // Return fallback models for providers that have them
  const fallbackModels = getFallbackModels(provider)
  if (fallbackModels) {
    return {
      success: true,
      models: fallbackModels,
    }
  }

  return {
    success: false,
    error: 'No cached models found',
  }
}

// === GitHub Copilot Models Handler ===

async function fetchGitHubCopilotModels(): Promise<ModelInfo[]> {
  // Get OAuth token for GitHub Copilot
  const token = await oauthManager.getToken('github-copilot')
  if (!token?.accessToken) {
    throw new Error('Not logged in to GitHub Copilot')
  }

  // Fetch models using the OAuth token
  return await fetchCopilotModels(token.accessToken)
}

// === New Model Registry Handlers (OpenRouter-based with capabilities) ===

async function handleGetModelsWithCapabilities(
  _event: Electron.IpcMainInvokeEvent,
  request: { providerId: string }
): Promise<{ success: boolean; models?: OpenRouterModel[]; error?: string }> {
  try {
    // Special handling for GitHub Copilot - fetch from Copilot API
    if (request.providerId === 'github-copilot' || request.providerId === AIProvider.GitHubCopilot) {
      try {
        const copilotModels = await fetchGitHubCopilotModels()
        // Convert ModelInfo to OpenRouterModel format with proper capabilities
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
        console.warn('[Models] Failed to fetch Copilot models from API, using fallback:', error.message)
        // Fall back to predefined models with proper capabilities
        const fallback = GITHUB_COPILOT_FALLBACK_MODELS
        const models: OpenRouterModel[] = fallback.map(m => {
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
        return { success: true, models, error: 'Using fallback models. ' + error.message }
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

// Startup diagnostic: fetch and display embedding models from provider APIs
async function diagnoseEmbeddingModels() {
  console.log('\n=== [Embedding Models Diagnostic] ===')

  // Get settings to check configured providers
  const { getSettings } = await import('../store.js')
  const settings = getSettings()

  const providers = [
    { id: AIProvider.OpenAI, name: 'OpenAI' },
    { id: AIProvider.Gemini, name: 'Gemini' },
    { id: AIProvider.Zhipu, name: 'Zhipu' },
  ]

  for (const provider of providers) {
    const config = settings?.ai?.providers?.[provider.id]
    if (!config?.apiKey) {
      console.log(`[${provider.name}] No API key configured, skipping`)
      continue
    }

    try {
      const baseUrl = config.baseUrl || getDefaultBaseUrl(provider.id)
      let models: ModelInfo[] = []

      switch (provider.id) {
        case AIProvider.OpenAI:
          models = await fetchOpenAIModels(config.apiKey, baseUrl)
          break
        case AIProvider.Gemini:
          models = await fetchGeminiModels(config.apiKey, baseUrl)
          break
        case AIProvider.Zhipu:
          models = await fetchZhipuModels(config.apiKey, baseUrl)
          break
      }

      const embeddingModels = models.filter(m => m.type === 'embedding')
      console.log(`[${provider.name}] Total: ${models.length}, Embedding: ${embeddingModels.length}`)
      // Log all models if no embedding found
      if (embeddingModels.length === 0 && models.length > 0) {
        console.log(`[${provider.name}] All model IDs:`, models.map(m => m.id))
      }
      if (embeddingModels.length > 0) {
        console.log(`[${provider.name}] Embedding models:`)
        embeddingModels.forEach(m => console.log(`  - ${m.id} (type: ${m.type})`))
      }
    } catch (error: any) {
      console.log(`[${provider.name}] Error: ${error.message}`)
    }
  }

  console.log('=== [End Diagnostic] ===\n')
}

// === Embedding Models Handlers (from Models.dev) ===

async function handleGetEmbeddingModels(
  _event: Electron.IpcMainInvokeEvent,
  request: { providerId: string }
): Promise<{ success: boolean; models?: modelRegistry.EmbeddingModelInfo[]; error?: string }> {
  try {
    const models = await modelRegistry.getEmbeddingModelsForProvider(request.providerId)
    return { success: true, models }
  } catch (error: any) {
    console.error('[Models] Failed to get embedding models:', error)
    return { success: false, error: error.message }
  }
}

async function handleGetAllEmbeddingModels(
  _event: Electron.IpcMainInvokeEvent
): Promise<{ success: boolean; models?: modelRegistry.EmbeddingModelInfo[]; error?: string }> {
  try {
    const models = await modelRegistry.getAllEmbeddingModels()
    return { success: true, models }
  } catch (error: any) {
    console.error('[Models] Failed to get all embedding models:', error)
    return { success: false, error: error.message }
  }
}

async function handleGetEmbeddingDimension(
  _event: Electron.IpcMainInvokeEvent,
  request: { modelId: string }
): Promise<{ success: boolean; dimension?: number | null; error?: string }> {
  try {
    const dimension = await modelRegistry.getEmbeddingDimension(request.modelId)
    return { success: true, dimension }
  } catch (error: any) {
    console.error('[Models] Failed to get embedding dimension:', error)
    return { success: false, error: error.message }
  }
}

export function registerModelsHandlers() {
  // Legacy handlers
  ipcMain.handle(IPC_CHANNELS.FETCH_MODELS, handleFetchModels)
  ipcMain.handle(IPC_CHANNELS.GET_CACHED_MODELS, handleGetCachedModels)

  // New model registry handlers (OpenRouter-based)
  ipcMain.handle(IPC_CHANNELS.GET_MODELS_WITH_CAPABILITIES, handleGetModelsWithCapabilities)
  ipcMain.handle(IPC_CHANNELS.GET_ALL_MODELS, handleGetAllModels)
  ipcMain.handle(IPC_CHANNELS.SEARCH_MODELS, handleSearchModels)
  ipcMain.handle(IPC_CHANNELS.REFRESH_MODEL_REGISTRY, handleRefreshModelRegistry)
  ipcMain.handle(IPC_CHANNELS.GET_MODEL_NAME_ALIASES, handleGetModelNameAliases)
  ipcMain.handle(IPC_CHANNELS.GET_MODEL_DISPLAY_NAME, handleGetModelDisplayName)

  // Embedding models handlers (from Models.dev registry)
  ipcMain.handle(IPC_CHANNELS.GET_EMBEDDING_MODELS, handleGetEmbeddingModels)
  ipcMain.handle(IPC_CHANNELS.GET_ALL_EMBEDDING_MODELS, handleGetAllEmbeddingModels)
  ipcMain.handle(IPC_CHANNELS.GET_EMBEDDING_DIMENSION, handleGetEmbeddingDimension)

  // Run diagnostic after a short delay to let settings load
  setTimeout(() => {
    diagnoseEmbeddingModels().catch(e => console.error('[Embedding Diagnostic] Failed:', e))
  }, 3000)
}
