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
  // ISO-ish date string from models.dev (e.g. "2025-11-18"). Used to sort the
  // model list newest-first in settings. Absent for custom-added or provider-direct
  // entries — those sort to the end.
  last_updated?: string
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
  // Outbound network interface binding — IPv4/IPv6 address of the NIC to source requests from.
  // Empty/undefined = let the OS pick the default route.
  localAddress?: string
  // Per-provider sampling temperature. Undefined = inherit AISettings.temperature (global default).
  // Used only as a fallback when a per-model override isn't set (see temperatureByModel).
  temperature?: number
  // Per-model temperature overrides. Keys are model IDs (e.g. "gpt-4o").
  // Resolution order at request time:
  //   1. temperatureByModel[model]
  //   2. ProviderConfig.temperature
  //   3. AISettings.temperature
  // Models whose models.dev metadata says `temperature: false` ignore this entirely
  // — the backend skips sending the parameter so reasoning models don't reject it.
  temperatureByModel?: Record<string, number>
  // Per-model max output token overrides. Keys are model IDs (e.g. "deepseek-chat").
  // Missing entries fall back to models.dev's `limit.output`, then to the global
  // chat.maxTokens setting. Values are always capped to the model's hard limit at
  // runtime so users can't accidentally request more than the API allows.
  maxOutputByModel?: Record<string, number>
  // Per-model native-thinking toggle. Keys are model IDs (e.g. "deepseek-v4-pro").
  //   true  = explicitly enable thinking
  //   false = explicitly disable thinking
  //   missing = use the model's default
  // Currently consumed by the DeepSeek provider for v4-series models that
  // expose thinking as a request flag rather than a separate model id.
  thinkingByModel?: Record<string, boolean>
  // Per-model capability overrides. Keys are model IDs.
  // Each capability is tri-state: `true` / `false` force the answer,
  // `undefined` means "fall back to models.dev metadata, then name patterns".
  // Lets users teach the app about hand-added models that aren't in
  // models.dev yet (e.g. private deployments, just-released models).
  modelCapabilitiesByModel?: Record<string, ModelCapabilityOverride>
}

export interface ModelCapabilityOverride {
  tools?: boolean        // function / tool calling
  vision?: boolean       // accepts image input
  reasoning?: boolean    // supports thinking / reasoning mode
  imageOutput?: boolean  // generates images
  audio?: boolean        // accepts / emits audio
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

// Network interface info for localAddress selector
export interface NetworkInterfaceInfo {
  name: string        // Interface name, e.g. "en0", "utun6"
  address: string     // IP address (used as localAddress value)
  family: 'IPv4' | 'IPv6'
  internal: boolean
}

export interface GetNetworkInterfacesResponse {
  success: boolean
  interfaces?: NetworkInterfaceInfo[]
  error?: string
}
