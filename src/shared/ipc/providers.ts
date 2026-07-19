/**
 * Providers Module
 * AI Provider and model-related type definitions for IPC communication
 */

import type { JsonObject } from '../json.js'

// Provider IDs - can be extended by adding new providers
export type AIProviderId = 'openai' | 'claude' | 'deepseek' | 'kimi' | 'zhipu' | 'gemini' | 'codex' | 'acp' | 'custom' | string

export type ThinkingEffort = 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'

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
  Codex = 'codex',
  ACP = 'acp',
  /** Locally installed Claude Code CLI driven as an in-app agent. */
  ClaudeCodeAgent = 'claude-code-agent',
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
  idToken?: string
  accountId?: string
  email?: string
  planType?: string
  isFedrampAccount?: boolean
  providerMetadata?: JsonObject
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
  providerMetadata?: JsonObject
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

export type ZhipuApiMode = 'standard' | 'coding-plan'

// Per-provider configuration
export interface ProviderConfig {
  apiKey?: string           // Optional for OAuth providers
  baseUrl?: string
  zhipuApiMode?: ZhipuApiMode
  model: string             // Currently active model
  selectedModels: string[]  // List of models user has selected/enabled for quick switching
  enabled?: boolean         // Whether this provider is shown in the chat model selector
  // OAuth-specific fields (used when provider.requiresOAuth = true)
  authType?: 'apiKey' | 'oauth'  // Authentication method
  oauthToken?: OAuthToken        // Stored OAuth token (encrypted in storage)
  // Per-provider sampling temperature. Undefined = inherit AISettings.temperature (global default).
  // Used only as a fallback when a per-model override isn't set (see temperatureByModel).
  temperature?: number
  // Per-model temperature overrides. Keys are model IDs (e.g. "gpt-4o").
  temperatureByModel?: Record<string, number>
  // Per-model max output token overrides. Keys are model IDs (e.g. "deepseek-chat").
  maxOutputByModel?: Record<string, number>
  // Per-model native-thinking toggle. Keys are model IDs (e.g. "deepseek-v4-pro").
  thinkingByModel?: Record<string, boolean>
  // Per-model thinking effort. Codex supports minimal/low/medium/high/xhigh;
  // DeepSeek keeps high/max. Codex maps max to high at the provider boundary.
  thinkingEffortByModel?: Record<string, ThinkingEffort>
  // Per-model service tier. Codex uses this for speed controls; missing = Auto/default.
  serviceTierByModel?: Record<string, string>
  // Per-model capability overrides. Keys are model IDs.
  modelCapabilitiesByModel?: Record<string, ModelCapabilityOverride>
  // Model metadata from models.dev. Keyed by modelId.
  // Populated when user refreshes models for this provider.
  models?: Record<string, ModelCapabilityEntry>
  // Timestamp of last model fetch for this provider
  modelsLastFetched?: number
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

/**
 * Per-model capability & pricing info stored in settings.json.
 * Populated from models.dev API when user refreshes model registry.
 */
export interface ModelCapabilityEntry {
  id: string
  name: string
  provider: string
  /** Max context window (input tokens) */
  contextLength: number
  /** Max output tokens per request */
  maxOutputTokens: number
  supportsTools: boolean
  supportsVision: boolean
  supportsReasoning: boolean
  supportsImageOutput: boolean
  supportsTemperature: boolean
  inputModalities: string[]
  outputModalities: string[]
  /** Pricing in USD per 1M tokens */
  pricing: {
    input: number
    output: number
    cacheRead: number
    cacheWrite: number
  }
  /** Release date from models.dev (ISO format) */
  lastUpdated?: string
  /** Provider-specific metadata such as Codex reasoning levels and service tiers. */
  providerMetadata?: JsonObject
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

// Providers related types
export interface GetProvidersResponse {
  success: boolean
  providers?: ProviderInfo[]
  error?: string
}

export interface CodexUsageWindow {
  usedPercent: number
  windowSeconds?: number
  resetAfterSeconds?: number
  resetAt?: number
}

export interface CodexUsageCredits {
  hasCredits: boolean
  unlimited: boolean
  balance?: string
}

export interface CodexUsageLimit {
  id: string
  name?: string
  primary?: CodexUsageWindow
  secondary?: CodexUsageWindow
  rateLimitReachedType?: string
}

export interface CodexProviderUsage {
  planType?: string
  credits?: CodexUsageCredits
  limits: CodexUsageLimit[]
}

export interface ProviderUsageRequest {
  providerId: string
}

export interface ProviderUsageResponse {
  success: boolean
  providerId: string
  capturedAt?: number
  account?: {
    id?: string
    email?: string
    planType?: string
    isFedramp?: boolean
  }
  usage?: CodexProviderUsage
  unsupported?: boolean
  error?: string
}

export interface ProviderEnvVarCandidate {
  name: string
  isSet: boolean
}

export interface ProviderEnvStatus {
  providerId: string
  detectedEnvVar?: string
  resolvedEnvVar?: string
  keyPreview?: string
  candidates: ProviderEnvVarCandidate[]
}

export interface GetProviderEnvStatusRequest {
  providerId: string
}

export interface GetProviderEnvStatusResponse {
  success: boolean
  status?: ProviderEnvStatus
  error?: string
}
