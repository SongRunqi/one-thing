/**
 * GitHub Copilot Provider Definition
 *
 * Uses OAuth Device Flow authentication with GitHub Copilot subscription.
 * Requires two-step token exchange: GitHub OAuth -> Copilot completion token.
 */

import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import type { ProviderDefinition } from '../types.js'
import type { ModelInfo } from '../../../shared/ipc.js'

// Cache for Copilot completion tokens
interface CopilotToken {
  token: string
  expiresAt: number
}

const copilotTokenCache: Map<string, CopilotToken> = new Map()

// Cache for Copilot models
interface CopilotModelsCache {
  models: ModelInfo[]
  cachedAt: number
}

let copilotModelsCache: CopilotModelsCache | null = null
const MODELS_CACHE_TTL = 10 * 60 * 1000 // 10 minutes

/**
 * Exchange GitHub OAuth token for Copilot completion token
 */
async function getCopilotCompletionToken(githubAccessToken: string): Promise<string> {
  // Check cache first
  const cached = copilotTokenCache.get(githubAccessToken)
  if (cached && cached.expiresAt > Date.now() + 60000) { // 1 minute buffer
    return cached.token
  }

  // Request new Copilot token
  const response = await fetch('https://api.github.com/copilot_internal/v2/token', {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${githubAccessToken}`,
      'Accept': 'application/json',
      'User-Agent': '0neThing/1.0',
      'Editor-Version': 'vscode/1.85.1',
      'Editor-Plugin-Version': 'copilot-chat/0.29.1',
    },
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Failed to get Copilot token: ${response.status} ${error}`)
  }

  const data = await response.json()

  // Cache the token
  copilotTokenCache.set(githubAccessToken, {
    token: data.token,
    expiresAt: Date.now() + (data.expires_in || 1800) * 1000, // Default 30 minutes
  })

  return data.token
}

/**
 * Fetch available models from GitHub Copilot API
 * Uses the Copilot completion token to authenticate
 */
export async function fetchCopilotModels(githubAccessToken: string): Promise<ModelInfo[]> {
  // Check cache first
  if (copilotModelsCache && Date.now() - copilotModelsCache.cachedAt < MODELS_CACHE_TTL) {
    return copilotModelsCache.models
  }

  try {
    // First, get the Copilot completion token
    const copilotToken = await getCopilotCompletionToken(githubAccessToken)

    // Fetch models from Copilot API
    const response = await fetch('https://api.githubcopilot.com/models', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${copilotToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Copilot-Integration-Id': 'vscode-chat',
        'Editor-Version': 'vscode/1.85.1',
        'Editor-Plugin-Version': 'copilot-chat/0.29.1',
        'User-Agent': '0neThing/1.0',
      },
    })

    if (!response.ok) {
      const error = await response.text()
      console.error(`[Copilot] Failed to fetch models: ${response.status} ${error}`)
      throw new Error(`Failed to fetch Copilot models: ${response.status}`)
    }

    const data = await response.json()

    // Parse OpenAI-compatible response format
    const models: ModelInfo[] = (data.data || []).map((m: any) => ({
      id: m.id,
      name: m.id, // Copilot uses id as name
      description: m.description || getModelDescription(m.id),
      // Additional capabilities info if available
      type: 'chat' as const,
    }))

    // Cache the results
    copilotModelsCache = {
      models,
      cachedAt: Date.now(),
    }

    console.log(`[Copilot] Fetched ${models.length} models from API`)
    return models
  } catch (error) {
    console.error('[Copilot] Failed to fetch models:', error)
    throw error
  }
}

/**
 * Get a friendly description for known Copilot models
 */
function getModelDescription(modelId: string): string {
  const descriptions: Record<string, string> = {
    'gpt-4o': 'Most capable OpenAI model',
    'gpt-4o-mini': 'Fast and affordable',
    'gpt-4.1': 'Latest GPT-4 update',
    'gpt-4-turbo': 'GPT-4 Turbo with vision',
    'o1': 'Deep reasoning model',
    'o1-mini': 'Reasoning, cost-effective',
    'o1-preview': 'Reasoning preview',
    'o3': 'Advanced reasoning',
    'o3-mini': 'Advanced reasoning, fast',
    'o4-mini': 'Latest reasoning, fast',
    'claude-3.5-sonnet': 'Anthropic Claude 3.5 Sonnet',
    'claude-3.7-sonnet': 'Anthropic Claude 3.7 Sonnet',
    'claude-sonnet-4': 'Anthropic Claude Sonnet 4',
    'gemini-1.5-pro': 'Google Gemini 1.5 Pro',
    'gemini-2.0-flash': 'Google Gemini 2.0 Flash',
    'gemini-2.0-flash-001': 'Google Gemini 2.0 Flash',
  }
  return descriptions[modelId] || 'GitHub Copilot model'
}

/**
 * Detect model capabilities based on model ID
 */
export interface ModelCapabilities {
  hasVision: boolean        // Can accept image input
  hasImageGeneration: boolean // Can generate images
  hasTools: boolean         // Supports function calling
  hasReasoning: boolean     // Is a reasoning model (o1, o3, etc.)
  contextLength: number     // Context window size
}

export function detectModelCapabilities(modelId: string): ModelCapabilities {
  const id = modelId.toLowerCase()

  // Vision models (can accept image input)
  const visionModels = [
    'gpt-4o', 'gpt-4-turbo', 'gpt-4-vision', 'gpt-4.1',
    'claude-3', 'claude-3.5', 'claude-3.7', 'claude-sonnet-4', 'claude-opus',
    'gemini-1.5', 'gemini-2', 'gemini-pro-vision',
  ]
  const hasVision = visionModels.some(v => id.includes(v.toLowerCase()))

  // Image generation models
  const imageGenModels = ['dall-e', 'dalle', 'gpt-image', 'imagen']
  const hasImageGeneration = imageGenModels.some(v => id.includes(v.toLowerCase()))

  // Tool/function calling support
  const noToolsModels = ['o1-preview', 'o1-mini'] // Some o1 variants don't support tools
  const hasTools = !noToolsModels.some(v => id.includes(v.toLowerCase())) &&
                   !hasImageGeneration // Image gen models don't use tools

  // Reasoning models
  const reasoningIndicators = ['o1', 'o3', 'o4', 'deepseek-r1', 'reasoner']
  const hasReasoning = reasoningIndicators.some(v => id.includes(v.toLowerCase()))

  // Context length estimation based on model
  let contextLength = 128000 // Default
  if (id.includes('gpt-4o')) contextLength = 128000
  else if (id.includes('gpt-4-turbo')) contextLength = 128000
  else if (id.includes('gpt-4.1')) contextLength = 1000000 // 1M context
  else if (id.includes('claude-3.5') || id.includes('claude-3.7')) contextLength = 200000
  else if (id.includes('claude-sonnet-4') || id.includes('claude-opus')) contextLength = 200000
  else if (id.includes('gemini-1.5-pro')) contextLength = 2000000 // 2M context
  else if (id.includes('gemini-2')) contextLength = 1000000
  else if (id.includes('o1') || id.includes('o3')) contextLength = 200000

  return {
    hasVision,
    hasImageGeneration,
    hasTools,
    hasReasoning,
    contextLength,
  }
}

/**
 * Clear the models cache (useful when token changes)
 */
export function clearCopilotModelsCache(): void {
  copilotModelsCache = null
}

const githubCopilotProvider: ProviderDefinition = {
  id: 'github-copilot',

  info: {
    id: 'github-copilot',
    name: 'GitHub Copilot',
    description: 'Use GitHub Copilot with your subscription via OAuth Device Flow',
    defaultBaseUrl: 'https://api.individual.githubcopilot.com',
    defaultModel: 'gpt-4o',
    icon: 'github',
    supportsCustomBaseUrl: false,
    requiresApiKey: false,
    requiresOAuth: true,
    oauthFlow: 'device',
    // Models: GitHub Copilot provides its own model list
  },

  create: ({ apiKey, oauthToken }) => {
    // Get GitHub access token from either:
    // 1. oauthToken.accessToken (from registry async path)
    // 2. apiKey (from chat.ts which fetches OAuth token and passes it as apiKey)
    const githubToken = oauthToken?.accessToken || apiKey || ''

    if (!githubToken) {
      throw new Error('Not logged in to GitHub Copilot. Please login first.')
    }

    // We need to handle async token exchange
    // For simplicity, we'll create provider with a placeholder and handle refresh in chat
    // In production, we'd want a more sophisticated approach

    // Create a wrapper that will get the real token when needed
    const provider = createOpenAICompatible({
      name: 'github-copilot',
      apiKey: githubToken, // Will be replaced with Copilot token in headers
      baseURL: 'https://api.individual.githubcopilot.com',
      headers: {
        'Editor-Version': 'vscode/1.85.1',
        'Editor-Plugin-Version': 'copilot-chat/0.29.1',
        'Copilot-Integration-Id': 'vscode-chat',
        'User-Agent': '0neThing/1.0',
        'OpenAI-Intent': 'conversation-panel',
      },
    })

    return {
      createModel: (modelId: string) => provider(modelId),
    }
  },
}

export default githubCopilotProvider
