/**
 * Providers Module
 * AI Provider and model-related type definitions for IPC communication
 */

// Provider IDs - can be extended by adding new providers
export type AIProviderId = 'openai' | 'claude' | 'deepseek' | 'kimi' | 'zhipu' | 'gemini' | 'custom' | string

// Legacy enum for backwards compatibility
export enum AIProvider {
  OpenAI = 'openai',
  Claude = 'claude',
  DeepSeek = 'deepseek',
  Kimi = 'kimi',
  Zhipu = 'zhipu',
  OpenRouter = 'openrouter',
  Gemini = 'gemini',
  ClaudeCode = 'claude-code',
  GitHubCopilot = 'github-copilot',
  Custom = 'custom',
}

// OAuth flow types
export type OAuthFlowType = 'authorization-code' | 'device'

// OAuth token structure
export interface OAuthToken {
  accessToken: string
  refreshToken?: string
  expiresAt: number        // Timestamp in milliseconds
  tokenType: string        // e.g., 'Bearer'
  scope?: string           // OAuth scopes
}

/**
 * OpenRouter Model Definition (直接使用 OpenRouter API 字段)
 */
export interface OpenRouterModel {
  id: string
  name: string
  description?: string
  context_length: number
  architecture: {
    modality: string
    input_modalities: string[]  // 'text', 'image', 'file', 'audio', 'video'
    output_modalities: string[] // 'text', 'image', 'embeddings'
    tokenizer: string
  }
  pricing: {
    prompt: string
    completion: string
    request: string
    image: string
  }
  top_provider: {
    context_length: number
    max_completion_tokens: number
    is_moderated: boolean
  }
  supported_parameters: string[]  // 'temperature', 'tools', 'reasoning', 'response_format', etc.
}

// Provider metadata for UI display
export interface ProviderInfo {
  id: string
  name: string
  description: string
  defaultBaseUrl: string
  defaultModel: string
  icon: string
  supportsCustomBaseUrl: boolean
  requiresApiKey: boolean
  // OAuth-specific fields
  requiresOAuth?: boolean            // Whether this provider uses OAuth instead of API key
  oauthFlow?: OAuthFlowType          // Type of OAuth flow (PKCE or Device)
  // Model definitions (from OpenRouter API)
  models?: OpenRouterModel[]
}

// Per-provider configuration
export interface ProviderConfig {
  apiKey?: string           // Optional for OAuth providers
  baseUrl?: string
  model: string             // Currently active model
  selectedModels: string[]  // List of models user has selected/enabled for quick switching
  enabled?: boolean         // Whether this provider is shown in the chat model selector
  // OAuth-specific fields (used when provider.requiresOAuth = true)
  authType?: 'apiKey' | 'oauth'  // Authentication method
  oauthToken?: OAuthToken        // Stored OAuth token (encrypted in storage)
}

// User-defined custom provider
export interface CustomProviderConfig extends ProviderConfig {
  id: string  // Unique ID for the custom provider
  name: string  // User-defined display name
  description?: string  // Optional description
  apiType: 'openai' | 'anthropic'  // API compatibility type
}

export interface AISettings {
  provider: string  // Can be built-in provider or custom provider ID
  temperature: number
  // Per-provider configurations (built-in providers)
  providers: {
    [AIProvider.OpenAI]: ProviderConfig
    [AIProvider.Claude]: ProviderConfig
    [AIProvider.Custom]: ProviderConfig
    [key: string]: ProviderConfig  // Allow dynamic provider keys
  }
  // User-defined custom providers
  customProviders?: CustomProviderConfig[]
}

// Models related types
export type ModelType = 'chat' | 'image' | 'embedding' | 'audio' | 'tts' | 'other'

export interface ModelInfo {
  id: string
  name: string
  description?: string
  createdAt?: string
  type?: ModelType
}

// Embedding model with dimension info (from Models.dev registry)
export interface EmbeddingModelInfo {
  id: string
  name: string
  dimension: number
  isConfigurable: boolean  // true if dimension can be customized
  providerId: string       // Our provider ID (openai, gemini, zhipu, etc.)
}

export interface CachedModels {
  provider: AIProvider
  models: ModelInfo[]
  cachedAt: number
}

export interface FetchModelsRequest {
  provider: AIProvider
  apiKey: string
  baseUrl?: string
  forceRefresh?: boolean
}

export interface FetchModelsResponse {
  success: boolean
  models?: ModelInfo[]
  fromCache?: boolean
  error?: string
}

export interface GetCachedModelsRequest {
  provider: AIProvider
}

export interface GetCachedModelsResponse {
  success: boolean
  models?: ModelInfo[]
  cachedAt?: number
  error?: string
}

// Providers related types
export interface GetProvidersResponse {
  success: boolean
  providers?: ProviderInfo[]
  error?: string
}
