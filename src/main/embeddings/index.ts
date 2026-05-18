import { embedMany } from 'ai'
import crypto from 'node:crypto'
import { createOpenAI } from '@ai-sdk/openai'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import type { AppSettings, ProviderConfig } from '../../shared/ipc.js'
import { AIProvider } from '../../shared/ipc.js'
import { resolveSoulMemoryEmbeddingTarget } from '../../shared/embeddings/defaults.js'
import { createBoundFetch } from '../providers/bound-fetch.js'
import {
  configureMemoryDiagnosticsLogger,
  createMemoryDiagnosticsFetch,
  logMemoryDiagnostic,
  sanitizeUrlForMemoryLog,
} from '../memory/diagnostics-logger.js'

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
  baseUrl?: string
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

function embeddingFetch(runId: string, providerId: string, model: string): typeof fetch {
  return createMemoryDiagnosticsFetch(createBoundFetch(), {
    subsystem: 'embedding',
    operation: 'provider-http',
    runId,
    providerId,
    model,
  })
}

function resolveConfiguredProvider(settings: AppSettings, runId: string): ResolvedEmbeddingProvider | null {
  const embeddingSettings = settings.general.soulMemory?.embeddings
  const providerId = embeddingSettings?.providerId || 'auto'

  if (providerId === 'auto') return null
  const target = resolveEmbeddingTarget(settings)

  if (providerId === 'openai') {
    const config = configForProvider(settings, AIProvider.OpenAI)
    const apiKey = normalizedOptional(embeddingSettings?.apiKey) || normalizedOptional(config?.apiKey)
    if (!apiKey) throw new Error('OpenAI embedding API key is not configured')
    const provider = createOpenAI({
      apiKey,
      baseURL: target.baseUrl,
      fetch: embeddingFetch(runId, 'openai', target.model),
    })
    const model = target.model
    return { providerId: 'openai', model, provider: createEmbeddingModel(provider, model), baseUrl: target.baseUrl }
  }

  if (providerId === 'openrouter') {
    const config = configForProvider(settings, AIProvider.OpenRouter)
    const apiKey = normalizedOptional(embeddingSettings?.apiKey) || normalizedOptional(config?.apiKey)
    if (!apiKey) throw new Error('OpenRouter embedding API key is not configured')
    const provider = createOpenAICompatible({
      name: 'openrouter',
      apiKey,
      baseURL: target.baseUrl,
      fetch: embeddingFetch(runId, 'openrouter', target.model),
    })
    const model = target.model
    return { providerId: 'openrouter', model, provider: createEmbeddingModel(provider, model), baseUrl: target.baseUrl }
  }

  if (providerId === 'gemini') {
    const config = configForProvider(settings, AIProvider.Gemini)
    const apiKey = normalizedOptional(embeddingSettings?.apiKey) || normalizedOptional(config?.apiKey)
    if (!apiKey) throw new Error('Gemini embedding API key is not configured')
    const provider = createGoogleGenerativeAI({
      apiKey,
      baseURL: target.baseUrl,
      fetch: embeddingFetch(runId, 'gemini', target.model),
    })
    const model = target.model
    return { providerId: 'gemini', model, provider: createEmbeddingModel(provider, model), baseUrl: target.baseUrl }
  }

  if (providerId === 'custom') {
    const custom = target.customProvider || firstOpenAICompatibleCustom(settings, embeddingSettings?.customProviderId)
    const baseURL = normalizedOptional(target.baseUrl)
    if (!baseURL) throw new Error('Custom OpenAI-compatible embedding provider is not configured')
    const provider = createOpenAICompatible({
      name: custom?.id || 'custom',
      apiKey: normalizedOptional(embeddingSettings?.apiKey) || normalizedOptional(custom?.apiKey) || '',
      baseURL,
      fetch: embeddingFetch(runId, custom?.id || 'custom', target.model),
    })
    const model = target.model
    return { providerId: custom?.id || 'custom', model, provider: createEmbeddingModel(provider, model), baseUrl: target.baseUrl }
  }

  if (providerId === 'ollama') {
    const baseURL = target.baseUrl
    const provider = createOpenAICompatible({
      name: 'ollama',
      apiKey: normalizedOptional(embeddingSettings?.apiKey) || 'ollama',
      baseURL,
      fetch: embeddingFetch(runId, 'ollama', target.model),
    })
    const model = target.model
    return { providerId: 'ollama', model, provider: createEmbeddingModel(provider, model), baseUrl: target.baseUrl }
  }

  const custom = target.customProvider || firstOpenAICompatibleCustom(settings, providerId)
  if (target.baseUrl) {
    const provider = createOpenAICompatible({
      name: custom?.id || providerId,
      apiKey: normalizedOptional(embeddingSettings?.apiKey) || normalizedOptional(custom?.apiKey) || '',
      baseURL: target.baseUrl,
      fetch: embeddingFetch(runId, custom?.id || providerId, target.model),
    })
    const model = target.model
    return { providerId: custom?.id || providerId, model, provider: createEmbeddingModel(provider, model), baseUrl: target.baseUrl }
  }

  throw new Error(`Unknown embedding provider: ${providerId}`)
}

function resolveAutoProvider(settings: AppSettings, runId: string): ResolvedEmbeddingProvider {
  const embeddingSettings = settings.general.soulMemory?.embeddings
  const target = resolveEmbeddingTarget(settings)
  if (!target.available) throw new Error('No embedding provider is available')

  const openai = configForProvider(settings, AIProvider.OpenAI)
  if (target.providerKind === 'openai' && openai?.apiKey) {
    const provider = createOpenAI({
      apiKey: openai.apiKey,
      baseURL: target.baseUrl,
      fetch: embeddingFetch(runId, 'openai', target.model),
    })
    const model = target.model
    return { providerId: 'openai', model, provider: createEmbeddingModel(provider, model), baseUrl: target.baseUrl }
  }

  const gemini = configForProvider(settings, AIProvider.Gemini)
  if (target.providerKind === 'gemini' && gemini?.apiKey) {
    const provider = createGoogleGenerativeAI({
      apiKey: gemini.apiKey,
      baseURL: target.baseUrl,
      fetch: embeddingFetch(runId, 'gemini', target.model),
    })
    const model = target.model
    return { providerId: 'gemini', model, provider: createEmbeddingModel(provider, model), baseUrl: target.baseUrl }
  }

  const custom = target.customProvider || firstOpenAICompatibleCustom(settings, embeddingSettings?.customProviderId)
  const customBaseUrl = normalizedOptional(target.baseUrl)
  if (customBaseUrl) {
    const provider = createOpenAICompatible({
      name: custom?.id || 'custom',
      apiKey: normalizedOptional(embeddingSettings?.apiKey) || normalizedOptional(custom?.apiKey) || '',
      baseURL: customBaseUrl,
      fetch: embeddingFetch(runId, custom?.id || 'custom', target.model),
    })
    const model = target.model
    return { providerId: custom?.id || 'custom', model, provider: createEmbeddingModel(provider, model), baseUrl: target.baseUrl }
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
  configureMemoryDiagnosticsLogger(request.settings.general.soulMemory?.logging)
  const runId = crypto.randomUUID()
  const startedAt = Date.now()
  const values = request.values.map(value => value.trim()).filter(Boolean)
  if (values.length === 0) {
    logMemoryDiagnostic({
      subsystem: 'embedding',
      operation: 'embed-texts',
      stage: 'validate',
      status: 'skipped',
      runId,
      summary: 'No non-empty embedding inputs.',
      metadata: { inputCount: request.values.length },
    })
    return { vectors: [], providerId: 'none', model: 'none' }
  }

  try {
    logMemoryDiagnostic({
      subsystem: 'embedding',
      operation: 'embed-texts',
      stage: 'resolve',
      status: 'started',
      runId,
      request: {
        inputCount: values.length,
        totalChars: values.reduce((sum, value) => sum + value.length, 0),
        configuredProvider: request.settings.general.soulMemory?.embeddings?.providerId || 'auto',
      },
    })
    const configured = resolveConfiguredProvider(request.settings, runId)
    const resolved = configured || resolveAutoProvider(request.settings, runId)
    logMemoryDiagnostic({
      subsystem: 'embedding',
      operation: 'embed-texts',
      stage: 'resolve',
      status: 'ok',
      runId,
      response: {
        providerId: resolved.providerId,
        model: resolved.model,
        baseUrl: resolved.baseUrl ? sanitizeUrlForMemoryLog(resolved.baseUrl) : '',
        mode: configured ? 'configured' : 'auto',
      },
    })
    logMemoryDiagnostic({
      subsystem: 'embedding',
      operation: 'embed-texts',
      stage: 'sdk-request',
      status: 'started',
      runId,
      request: {
        inputCount: values.length,
        providerId: resolved.providerId,
        model: resolved.model,
        dimensions: request.settings.general.soulMemory?.embeddings?.dimensions || 0,
      },
    })
    const result = await embedMany({
      model: resolved.provider,
      values,
      providerOptions: resolveEmbeddingProviderOptions(request.settings, resolved),
    })

    const vectors = result.embeddings.map(vector => Array.from(vector))
    logMemoryDiagnostic({
      subsystem: 'embedding',
      operation: 'embed-texts',
      stage: 'sdk-response',
      status: 'ok',
      durationMs: Date.now() - startedAt,
      runId,
      response: {
        providerId: resolved.providerId,
        model: resolved.model,
        inputCount: values.length,
        vectorCount: vectors.length,
        dimensions: vectors[0]?.length || 0,
      },
    })
    return {
      vectors,
      providerId: resolved.providerId,
      model: resolved.model,
    }
  } catch (error) {
    logMemoryDiagnostic({
      subsystem: 'embedding',
      operation: 'embed-texts',
      stage: 'sdk-response',
      status: 'error',
      durationMs: Date.now() - startedAt,
      runId,
      error,
      metadata: { inputCount: values.length },
    })
    throw error
  }
}
