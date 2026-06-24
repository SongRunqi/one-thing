import crypto from 'node:crypto'
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
  kind: 'openai-compatible' | 'gemini'
  apiKey: string
  baseUrl: string
}

interface OpenAIEmbeddingResponse {
  data?: Array<{
    embedding?: number[]
    index?: number
  }>
  embedding?: number[]
  error?: {
    message?: string
  }
}

interface OpenAIEmbeddingRequest {
  model: string
  input: string[]
  dimensions?: number
}

interface GeminiEmbeddingResponse {
  embeddings?: Array<{
    values?: number[]
  }>
  embedding?: {
    values?: number[]
  }
  error?: {
    message?: string
  }
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

function embeddingFetch(runId: string, providerId: string, model: string): typeof fetch {
  return createMemoryDiagnosticsFetch(createBoundFetch(), {
    subsystem: 'embedding',
    operation: 'provider-http',
    runId,
    providerId,
    model,
  })
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/$/, '')
}

async function responseError(response: Response, fallback: string): Promise<string> {
  const text = await response.text().catch(() => '')
  if (!text) return fallback
  try {
    const parsed = JSON.parse(text) as { error?: { message?: string } }
    return parsed.error?.message || text
  } catch {
    return text
  }
}

function openAICompatibleEmbeddingProvider(options: {
  providerId: string
  model: string
  apiKey?: string
  baseUrl: string
}): ResolvedEmbeddingProvider {
  return {
    providerId: options.providerId,
    model: options.model,
    kind: 'openai-compatible',
    apiKey: options.apiKey || '',
    baseUrl: options.baseUrl,
  }
}

function geminiEmbeddingProvider(options: {
  providerId: string
  model: string
  apiKey: string
  baseUrl: string
}): ResolvedEmbeddingProvider {
  return {
    providerId: options.providerId,
    model: options.model,
    kind: 'gemini',
    apiKey: options.apiKey,
    baseUrl: options.baseUrl,
  }
}

function resolveConfiguredProvider(settings: AppSettings): ResolvedEmbeddingProvider | null {
  const embeddingSettings = settings.general.soulMemory?.embeddings
  const providerId = embeddingSettings?.providerId || 'auto'

  if (providerId === 'auto') return null
  const target = resolveEmbeddingTarget(settings)

  if (providerId === 'openai') {
    const config = configForProvider(settings, AIProvider.OpenAI)
    const apiKey = normalizedOptional(embeddingSettings?.apiKey) || normalizedOptional(config?.apiKey)
    if (!apiKey) throw new Error('OpenAI embedding API key is not configured')
    const model = target.model
    return openAICompatibleEmbeddingProvider({ providerId: 'openai', model, apiKey, baseUrl: target.baseUrl })
  }

  if (providerId === 'openrouter') {
    const config = configForProvider(settings, AIProvider.OpenRouter)
    const apiKey = normalizedOptional(embeddingSettings?.apiKey) || normalizedOptional(config?.apiKey)
    if (!apiKey) throw new Error('OpenRouter embedding API key is not configured')
    const model = target.model
    return openAICompatibleEmbeddingProvider({ providerId: 'openrouter', model, apiKey, baseUrl: target.baseUrl })
  }

  if (providerId === 'gemini') {
    const config = configForProvider(settings, AIProvider.Gemini)
    const apiKey = normalizedOptional(embeddingSettings?.apiKey) || normalizedOptional(config?.apiKey)
    if (!apiKey) throw new Error('Gemini embedding API key is not configured')
    const model = target.model
    return geminiEmbeddingProvider({ providerId: 'gemini', model, apiKey, baseUrl: target.baseUrl })
  }

  if (providerId === 'custom') {
    const custom = target.customProvider || firstOpenAICompatibleCustom(settings, embeddingSettings?.customProviderId)
    const baseURL = normalizedOptional(target.baseUrl)
    if (!baseURL) throw new Error('Custom OpenAI-compatible embedding provider is not configured')
    const model = target.model
    return openAICompatibleEmbeddingProvider({
      providerId: custom?.id || 'custom',
      model,
      apiKey: normalizedOptional(embeddingSettings?.apiKey) || normalizedOptional(custom?.apiKey) || '',
      baseUrl: baseURL,
    })
  }

  if (providerId === 'ollama') {
    const baseURL = target.baseUrl
    const model = target.model
    return openAICompatibleEmbeddingProvider({
      providerId: 'ollama',
      model,
      apiKey: normalizedOptional(embeddingSettings?.apiKey) || 'ollama',
      baseUrl: baseURL,
    })
  }

  const custom = target.customProvider || firstOpenAICompatibleCustom(settings, providerId)
  if (target.baseUrl) {
    const model = target.model
    return openAICompatibleEmbeddingProvider({
      providerId: custom?.id || providerId,
      model,
      apiKey: normalizedOptional(embeddingSettings?.apiKey) || normalizedOptional(custom?.apiKey) || '',
      baseUrl: target.baseUrl,
    })
  }

  throw new Error(`Unknown embedding provider: ${providerId}`)
}

function resolveAutoProvider(settings: AppSettings): ResolvedEmbeddingProvider {
  const embeddingSettings = settings.general.soulMemory?.embeddings
  const target = resolveEmbeddingTarget(settings)
  if (!target.available) throw new Error('No embedding provider is available')

  const openai = configForProvider(settings, AIProvider.OpenAI)
  if (target.providerKind === 'openai' && openai?.apiKey) {
    const model = target.model
    return openAICompatibleEmbeddingProvider({
      providerId: 'openai',
      model,
      apiKey: openai.apiKey,
      baseUrl: target.baseUrl,
    })
  }

  const gemini = configForProvider(settings, AIProvider.Gemini)
  if (target.providerKind === 'gemini' && gemini?.apiKey) {
    const model = target.model
    return geminiEmbeddingProvider({
      providerId: 'gemini',
      model,
      apiKey: gemini.apiKey,
      baseUrl: target.baseUrl,
    })
  }

  const custom = target.customProvider || firstOpenAICompatibleCustom(settings, embeddingSettings?.customProviderId)
  const customBaseUrl = normalizedOptional(target.baseUrl)
  if (customBaseUrl) {
    const model = target.model
    return openAICompatibleEmbeddingProvider({
      providerId: custom?.id || 'custom',
      model,
      apiKey: normalizedOptional(embeddingSettings?.apiKey) || normalizedOptional(custom?.apiKey) || '',
      baseUrl: customBaseUrl,
    })
  }

  throw new Error('No embedding provider is available')
}

function resolveEmbeddingDimensions(settings: AppSettings, resolved: ResolvedEmbeddingProvider): number | undefined {
  const dimensions = settings.general.soulMemory?.embeddings?.dimensions || 0
  if (!Number.isFinite(dimensions) || dimensions <= 0 || resolved.kind === 'gemini') return undefined
  return Math.floor(dimensions)
}

function vectorsFromOpenAIResponse(payload: OpenAIEmbeddingResponse): number[][] {
  if (payload.error?.message) throw new Error(payload.error.message)
  if (payload.embedding) return [payload.embedding]

  const entries = payload.data
  if (!entries?.length) throw new Error('Embedding provider returned no vectors')

  return [...entries]
    .sort((left, right) => (left.index ?? 0) - (right.index ?? 0))
    .map(entry => {
      if (!Array.isArray(entry.embedding)) {
        throw new Error('Embedding provider returned an invalid vector')
      }
      return entry.embedding
    })
}

function vectorsFromGeminiResponse(payload: GeminiEmbeddingResponse): number[][] {
  if (payload.error?.message) throw new Error(payload.error.message)
  if (payload.embedding?.values) return [payload.embedding.values]

  const embeddings = payload.embeddings
  if (!embeddings?.length) throw new Error('Gemini embedding provider returned no vectors')

  return embeddings.map(entry => {
    if (!Array.isArray(entry.values)) {
      throw new Error('Gemini embedding provider returned an invalid vector')
    }
    return entry.values
  })
}

async function embedOpenAICompatible(options: {
  resolved: ResolvedEmbeddingProvider
  values: string[]
  runId: string
  dimensions?: number
}): Promise<number[][]> {
  const { resolved, values, runId, dimensions } = options
  const body: OpenAIEmbeddingRequest = {
    model: resolved.model,
    input: values,
  }
  if (dimensions !== undefined) body.dimensions = dimensions

  const response = await embeddingFetch(runId, resolved.providerId, resolved.model)(
    `${normalizeBaseUrl(resolved.baseUrl)}/embeddings`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(resolved.apiKey ? { Authorization: `Bearer ${resolved.apiKey}` } : {}),
      },
      body: JSON.stringify(body),
    },
  )
  if (!response.ok) {
    throw new Error(await responseError(response, `Embedding provider API error: ${response.status}`))
  }

  return vectorsFromOpenAIResponse(await response.json() as OpenAIEmbeddingResponse)
}

async function embedGemini(options: {
  resolved: ResolvedEmbeddingProvider
  values: string[]
  runId: string
}): Promise<number[][]> {
  const { resolved, values, runId } = options
  const response = await embeddingFetch(runId, resolved.providerId, resolved.model)(
    `${normalizeBaseUrl(resolved.baseUrl)}/models/${encodeURIComponent(resolved.model)}:batchEmbedContents`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': resolved.apiKey,
      },
      body: JSON.stringify({
        requests: values.map(value => ({
          model: `models/${resolved.model}`,
          content: {
            parts: [{ text: value }],
          },
        })),
      }),
    },
  )
  if (!response.ok) {
    throw new Error(await responseError(response, `Gemini embedding API error: ${response.status}`))
  }

  return vectorsFromGeminiResponse(await response.json() as GeminiEmbeddingResponse)
}

async function embedWithNativeProvider(options: {
  resolved: ResolvedEmbeddingProvider
  values: string[]
  runId: string
  dimensions?: number
}): Promise<number[][]> {
  if (options.resolved.kind === 'gemini') {
    return embedGemini({
      resolved: options.resolved,
      values: options.values,
      runId: options.runId,
    })
  }

  return embedOpenAICompatible(options)
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
    const configured = resolveConfiguredProvider(request.settings)
    const resolved = configured || resolveAutoProvider(request.settings)
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
      stage: 'native-request',
      status: 'started',
      runId,
      request: {
        inputCount: values.length,
        providerId: resolved.providerId,
        model: resolved.model,
        dimensions: resolveEmbeddingDimensions(request.settings, resolved) || 0,
      },
    })
    const vectors = await embedWithNativeProvider({
      resolved,
      values,
      runId,
      dimensions: resolveEmbeddingDimensions(request.settings, resolved),
    })
    logMemoryDiagnostic({
      subsystem: 'embedding',
      operation: 'embed-texts',
      stage: 'native-response',
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
      stage: 'native-response',
      status: 'error',
      durationMs: Date.now() - startedAt,
      runId,
      error,
      metadata: { inputCount: values.length },
    })
    throw error
  }
}
