import { embedMany } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import type { AppSettings, ProviderConfig } from '../../shared/ipc.js'
import { AIProvider } from '../../shared/ipc.js'
import { resolveSoulMemoryEmbeddingTarget } from '../../shared/embeddings/defaults.js'
import { createBoundFetch } from '../providers/bound-fetch.js'

export interface EmbeddingRequest {
  settings: AppSettings
  values: string[]
}

export interface EmbeddingResult {
  vectors: number[][]
  providerId: string
  model: string
}

interface ResolvedEmbeddingProvider {
  providerId: string
  model: string
  provider: any
}

function configForProvider(settings: AppSettings, providerId: string): ProviderConfig | undefined {
  if (providerId === 'custom') {
    return settings.ai.providers[AIProvider.Custom]
  }
  return settings.ai.providers[providerId]
}

function normalizedOptional(value?: string): string | undefined {
  const trimmed = value?.trim()
  return trimmed || undefined
}

function firstOpenAICompatibleCustom(settings: AppSettings, customProviderId?: string) {
  const providers = settings.ai.customProviders || []
  if (customProviderId) {
    return providers.find(provider => provider.id === customProviderId)
  }
  return providers.find(provider => provider.apiType === 'openai' && provider.baseUrl)
}

function resolveEmbeddingTarget(settings: AppSettings) {
  const embeddingSettings = settings.general.soulMemory?.embeddings
  return resolveSoulMemoryEmbeddingTarget({
    providerId: embeddingSettings?.providerId,
    customProviderId: embeddingSettings?.customProviderId,
    apiKey: embeddingSettings?.apiKey,
    model: embeddingSettings?.model,
    baseUrl: embeddingSettings?.baseUrl,
    providers: settings.ai.providers,
    customProviders: settings.ai.customProviders,
  })
}

function createEmbeddingModel(provider: any, model: string): any {
  if (typeof provider.embeddingModel === 'function') {
    return provider.embeddingModel(model)
  }
  if (typeof provider.embedding === 'function') {
    return provider.embedding(model)
  }
  throw new Error('Embedding provider does not expose an embedding model factory')
}

function resolveConfiguredProvider(settings: AppSettings): ResolvedEmbeddingProvider | null {
  const embeddingSettings = settings.general.soulMemory?.embeddings
  const providerId = embeddingSettings?.providerId || 'auto'
  const fetch = createBoundFetch()

  if (providerId === 'auto') return null
  const target = resolveEmbeddingTarget(settings)

  if (providerId === 'openai') {
    const config = configForProvider(settings, AIProvider.OpenAI)
    const apiKey = normalizedOptional(embeddingSettings?.apiKey) || normalizedOptional(config?.apiKey)
    if (!apiKey) throw new Error('OpenAI embedding API key is not configured')
    const provider = createOpenAI({
      apiKey,
      baseURL: target.baseUrl,
      fetch,
    })
    const model = target.model
    return { providerId: 'openai', model, provider: createEmbeddingModel(provider, model) }
  }

  if (providerId === 'openrouter') {
    const config = configForProvider(settings, AIProvider.OpenRouter)
    const apiKey = normalizedOptional(embeddingSettings?.apiKey) || normalizedOptional(config?.apiKey)
    if (!apiKey) throw new Error('OpenRouter embedding API key is not configured')
    const provider = createOpenAICompatible({
      name: 'openrouter',
      apiKey,
      baseURL: target.baseUrl,
      fetch,
    })
    const model = target.model
    return { providerId: 'openrouter', model, provider: createEmbeddingModel(provider, model) }
  }

  if (providerId === 'gemini') {
    const config = configForProvider(settings, AIProvider.Gemini)
    const apiKey = normalizedOptional(embeddingSettings?.apiKey) || normalizedOptional(config?.apiKey)
    if (!apiKey) throw new Error('Gemini embedding API key is not configured')
    const provider = createGoogleGenerativeAI({
      apiKey,
      baseURL: target.baseUrl,
      fetch,
    })
    const model = target.model
    return { providerId: 'gemini', model, provider: createEmbeddingModel(provider, model) }
  }

  if (providerId === 'custom') {
    const custom = target.customProvider || firstOpenAICompatibleCustom(settings, embeddingSettings?.customProviderId)
    const baseURL = normalizedOptional(target.baseUrl)
    if (!baseURL) throw new Error('Custom OpenAI-compatible embedding provider is not configured')
    const provider = createOpenAICompatible({
      name: custom?.id || 'custom',
      apiKey: normalizedOptional(embeddingSettings?.apiKey) || normalizedOptional(custom?.apiKey) || '',
      baseURL,
      fetch,
    })
    const model = target.model
    return { providerId: custom?.id || 'custom', model, provider: createEmbeddingModel(provider, model) }
  }

  if (providerId === 'ollama') {
    const baseURL = target.baseUrl
    const provider = createOpenAICompatible({
      name: 'ollama',
      apiKey: normalizedOptional(embeddingSettings?.apiKey) || 'ollama',
      baseURL,
      fetch,
    })
    const model = target.model
    return { providerId: 'ollama', model, provider: createEmbeddingModel(provider, model) }
  }

  const custom = target.customProvider || firstOpenAICompatibleCustom(settings, providerId)
  if (target.baseUrl) {
    const provider = createOpenAICompatible({
      name: custom?.id || providerId,
      apiKey: normalizedOptional(embeddingSettings?.apiKey) || normalizedOptional(custom?.apiKey) || '',
      baseURL: target.baseUrl,
      fetch,
    })
    const model = target.model
    return { providerId: custom?.id || providerId, model, provider: createEmbeddingModel(provider, model) }
  }

  throw new Error(`Unknown embedding provider: ${providerId}`)
}

function resolveAutoProvider(settings: AppSettings): ResolvedEmbeddingProvider {
  const embeddingSettings = settings.general.soulMemory?.embeddings
  const fetch = createBoundFetch()
  const target = resolveEmbeddingTarget(settings)
  if (!target.available) throw new Error('No embedding provider is available')

  const openai = configForProvider(settings, AIProvider.OpenAI)
  if (target.providerKind === 'openai' && openai?.apiKey) {
    const provider = createOpenAI({
      apiKey: openai.apiKey,
      baseURL: target.baseUrl,
      fetch,
    })
    const model = target.model
    return { providerId: 'openai', model, provider: createEmbeddingModel(provider, model) }
  }

  const gemini = configForProvider(settings, AIProvider.Gemini)
  if (target.providerKind === 'gemini' && gemini?.apiKey) {
    const provider = createGoogleGenerativeAI({
      apiKey: gemini.apiKey,
      baseURL: target.baseUrl,
      fetch,
    })
    const model = target.model
    return { providerId: 'gemini', model, provider: createEmbeddingModel(provider, model) }
  }

  const custom = target.customProvider || firstOpenAICompatibleCustom(settings, embeddingSettings?.customProviderId)
  const customBaseUrl = normalizedOptional(target.baseUrl)
  if (customBaseUrl) {
    const provider = createOpenAICompatible({
      name: custom?.id || 'custom',
      apiKey: normalizedOptional(embeddingSettings?.apiKey) || normalizedOptional(custom?.apiKey) || '',
      baseURL: customBaseUrl,
      fetch,
    })
    const model = target.model
    return { providerId: custom?.id || 'custom', model, provider: createEmbeddingModel(provider, model) }
  }

  throw new Error('No embedding provider is available')
}

function resolveEmbeddingProviderOptions(settings: AppSettings, resolved: ResolvedEmbeddingProvider): any {
  const dimensions = settings.general.soulMemory?.embeddings?.dimensions || 0
  if (!Number.isFinite(dimensions) || dimensions <= 0 || resolved.providerId === 'gemini') return undefined
  return {
    openai: { dimensions },
    'openai-compatible': { dimensions },
    [resolved.providerId]: { dimensions },
  }
}

export async function embedTexts(request: EmbeddingRequest): Promise<EmbeddingResult> {
  const values = request.values.map(value => value.trim()).filter(Boolean)
  if (values.length === 0) {
    return { vectors: [], providerId: 'none', model: 'none' }
  }

  const configured = resolveConfiguredProvider(request.settings)
  const resolved = configured || resolveAutoProvider(request.settings)
  const result = await embedMany({
    model: resolved.provider,
    values,
    providerOptions: resolveEmbeddingProviderOptions(request.settings, resolved),
  })

  return {
    vectors: result.embeddings.map(vector => Array.from(vector)),
    providerId: resolved.providerId,
    model: resolved.model,
  }
}
