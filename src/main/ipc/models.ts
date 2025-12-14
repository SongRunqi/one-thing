import { ipcMain } from 'electron'
import {
  IPC_CHANNELS,
  AIProvider,
  FetchModelsRequest,
  FetchModelsResponse,
  GetCachedModelsRequest,
  GetCachedModelsResponse,
  ModelInfo,
} from '../../shared/ipc.js'
import { getCachedModels, setCachedModels } from '../store.js'

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
  return (data.data || [])
    .filter((m: any) => m.id.includes('gpt') || m.id.includes('text'))
    .map((m: any) => ({
      id: m.id,
      name: m.id,
      createdAt: m.created ? new Date(m.created * 1000).toISOString() : undefined,
    }))
    .sort((a: ModelInfo, b: ModelInfo) => a.id.localeCompare(b.id))
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
    default:
      return 'https://api.example.com/v1'
  }
}

async function handleFetchModels(
  _event: Electron.IpcMainInvokeEvent,
  request: FetchModelsRequest
): Promise<FetchModelsResponse> {
  const { provider, apiKey, baseUrl, forceRefresh } = request

  // Check cache first if not forcing refresh
  if (!forceRefresh) {
    const cached = getCachedModels(provider)
    if (cached && cached.models.length > 0) {
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

    switch (provider) {
      case AIProvider.OpenAI:
        models = await fetchOpenAIModels(apiKey, url)
        break
      case AIProvider.Claude:
        models = await fetchClaudeModels(apiKey, url)
        break
      case AIProvider.DeepSeek:
      case AIProvider.Kimi:
      case AIProvider.Zhipu:
        // These providers use OpenAI-compatible API
        models = await fetchCustomModels(apiKey, url)
        break
      case AIProvider.Custom:
        models = await fetchCustomModels(apiKey, url)
        break
    }

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
function getFallbackModels(provider: AIProvider): ModelInfo[] | null {
  switch (provider) {
    case AIProvider.Claude:
      return CLAUDE_FALLBACK_MODELS
    case AIProvider.DeepSeek:
      return DEEPSEEK_FALLBACK_MODELS
    case AIProvider.Kimi:
      return KIMI_FALLBACK_MODELS
    case AIProvider.Zhipu:
      return ZHIPU_FALLBACK_MODELS
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

export function registerModelsHandlers() {
  ipcMain.handle(IPC_CHANNELS.FETCH_MODELS, handleFetchModels)
  ipcMain.handle(IPC_CHANNELS.GET_CACHED_MODELS, handleGetCachedModels)
}
