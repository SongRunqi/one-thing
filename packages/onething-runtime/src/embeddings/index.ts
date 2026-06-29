import crypto from 'node:crypto'
import type { MemoryDiagnosticsFetchContext, MemoryDiagnosticsLogInput } from '../memory/diagnostics-logger.js'
import {
  findOpenAICompatibleCustomEmbeddingProvider,
  resolveSoulMemoryEmbeddingTarget,
  type SoulMemoryEmbeddingCustomProviderLike,
  type SoulMemoryEmbeddingProviderLike,
} from './defaults.js'

export * from './defaults.js'

export interface OnethingEmbeddingSettingsLike {
  providerId?: string
  customProviderId?: string
  apiKey?: string
  model?: string
  baseUrl?: string
  dimensions?: number
}

export interface OnethingEmbeddingAppSettingsLike<TLogging = unknown> {
  ai: {
    providers: Record<string, SoulMemoryEmbeddingProviderLike | undefined>
    customProviders?: SoulMemoryEmbeddingCustomProviderLike[]
  }
  general: {
    soulMemory?: {
      embeddings?: OnethingEmbeddingSettingsLike
      logging?: TLogging
    }
  }
}

export interface OnethingEmbeddingRequest<
  TSettings extends OnethingEmbeddingAppSettingsLike = OnethingEmbeddingAppSettingsLike,
> {
  settings: TSettings
  values: string[]
}

export interface OnethingEmbeddingResult {
  vectors: number[][]
  providerId: string
  model: string
}

export interface OnethingEmbeddingRuntimeAdapters {
  createFetch?: (context: MemoryDiagnosticsFetchContext) => typeof fetch
  configureDiagnostics?: (settings: unknown) => void
  logDiagnostic?: (input: MemoryDiagnosticsLogInput) => unknown
  sanitizeUrl?: (url: string) => string
  createId?: () => string
  now?: () => number
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

function configForProvider(
  settings: OnethingEmbeddingAppSettingsLike,
  providerId: string,
): SoulMemoryEmbeddingProviderLike | undefined {
  if (providerId === 'custom') {
    return settings.ai.providers.custom
  }
  return settings.ai.providers[providerId]
}

function normalizedOptional(value?: string): string | undefined {
  const trimmed = value?.trim()
  return trimmed || undefined
}

function firstOpenAICompatibleCustom(settings: OnethingEmbeddingAppSettingsLike, customProviderId?: string) {
  return findOpenAICompatibleCustomEmbeddingProvider(settings.ai.customProviders, customProviderId)
}

function resolveEmbeddingTarget(settings: OnethingEmbeddingAppSettingsLike) {
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

function embeddingFetch(
  runId: string,
  providerId: string,
  model: string,
  adapters: OnethingEmbeddingRuntimeAdapters,
): typeof fetch {
  return adapters.createFetch?.({
    subsystem: 'embedding',
    operation: 'provider-http',
    runId,
    providerId,
    model,
  }) ?? globalThis.fetch.bind(globalThis)
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

function resolveConfiguredProvider(settings: OnethingEmbeddingAppSettingsLike): ResolvedEmbeddingProvider | null {
  const embeddingSettings = settings.general.soulMemory?.embeddings
  const providerId = embeddingSettings?.providerId || 'auto'

  if (providerId === 'auto') return null
  const target = resolveEmbeddingTarget(settings)

  if (providerId === 'openai') {
    const config = configForProvider(settings, 'openai')
    const apiKey = normalizedOptional(embeddingSettings?.apiKey) || normalizedOptional(config?.apiKey)
    if (!apiKey) throw new Error('OpenAI embedding API key is not configured')
    return openAICompatibleEmbeddingProvider({ providerId: 'openai', model: target.model, apiKey, baseUrl: target.baseUrl })
  }

  if (providerId === 'openrouter') {
    const config = configForProvider(settings, 'openrouter')
    const apiKey = normalizedOptional(embeddingSettings?.apiKey) || normalizedOptional(config?.apiKey)
    if (!apiKey) throw new Error('OpenRouter embedding API key is not configured')
    return openAICompatibleEmbeddingProvider({ providerId: 'openrouter', model: target.model, apiKey, baseUrl: target.baseUrl })
  }

  if (providerId === 'gemini') {
    const config = configForProvider(settings, 'gemini')
    const apiKey = normalizedOptional(embeddingSettings?.apiKey) || normalizedOptional(config?.apiKey)
    if (!apiKey) throw new Error('Gemini embedding API key is not configured')
    return geminiEmbeddingProvider({ providerId: 'gemini', model: target.model, apiKey, baseUrl: target.baseUrl })
  }

  if (providerId === 'custom') {
    const custom = target.customProvider || firstOpenAICompatibleCustom(settings, embeddingSettings?.customProviderId)
    const baseURL = normalizedOptional(target.baseUrl)
    if (!baseURL) throw new Error('Custom OpenAI-compatible embedding provider is not configured')
    return openAICompatibleEmbeddingProvider({
      providerId: custom?.id || 'custom',
      model: target.model,
      apiKey: normalizedOptional(embeddingSettings?.apiKey) || normalizedOptional(custom?.apiKey) || '',
      baseUrl: baseURL,
    })
  }

  if (providerId === 'ollama') {
    return openAICompatibleEmbeddingProvider({
      providerId: 'ollama',
      model: target.model,
      apiKey: normalizedOptional(embeddingSettings?.apiKey) || 'ollama',
      baseUrl: target.baseUrl,
    })
  }

  const custom = target.customProvider || firstOpenAICompatibleCustom(settings, providerId)
  if (target.baseUrl) {
    return openAICompatibleEmbeddingProvider({
      providerId: custom?.id || providerId,
      model: target.model,
      apiKey: normalizedOptional(embeddingSettings?.apiKey) || normalizedOptional(custom?.apiKey) || '',
      baseUrl: target.baseUrl,
    })
  }

  throw new Error(`Unknown embedding provider: ${providerId}`)
}

function resolveAutoProvider(settings: OnethingEmbeddingAppSettingsLike): ResolvedEmbeddingProvider {
  const embeddingSettings = settings.general.soulMemory?.embeddings
  const target = resolveEmbeddingTarget(settings)
  if (!target.available) throw new Error('No embedding provider is available')

  const openai = configForProvider(settings, 'openai')
  if (target.providerKind === 'openai' && openai?.apiKey) {
    return openAICompatibleEmbeddingProvider({
      providerId: 'openai',
      model: target.model,
      apiKey: openai.apiKey,
      baseUrl: target.baseUrl,
    })
  }

  const gemini = configForProvider(settings, 'gemini')
  if (target.providerKind === 'gemini' && gemini?.apiKey) {
    return geminiEmbeddingProvider({
      providerId: 'gemini',
      model: target.model,
      apiKey: gemini.apiKey,
      baseUrl: target.baseUrl,
    })
  }

  const custom = target.customProvider || firstOpenAICompatibleCustom(settings, embeddingSettings?.customProviderId)
  const customBaseUrl = normalizedOptional(target.baseUrl)
  if (customBaseUrl) {
    return openAICompatibleEmbeddingProvider({
      providerId: custom?.id || 'custom',
      model: target.model,
      apiKey: normalizedOptional(embeddingSettings?.apiKey) || normalizedOptional(custom?.apiKey) || '',
      baseUrl: customBaseUrl,
    })
  }

  throw new Error('No embedding provider is available')
}

function resolveEmbeddingDimensions(
  settings: OnethingEmbeddingAppSettingsLike,
  resolved: ResolvedEmbeddingProvider,
): number | undefined {
  const dimensions = settings.general.soulMemory?.embeddings?.dimensions || 0
  if (!Number.isFinite(dimensions) || dimensions <= 0 || resolved.kind === 'gemini') return undefined
  return Math.floor(dimensions)
}

export function vectorsFromOnethingOpenAIEmbeddingResponse(payload: OpenAIEmbeddingResponse): number[][] {
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

export function vectorsFromOnethingGeminiEmbeddingResponse(payload: GeminiEmbeddingResponse): number[][] {
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
  adapters: OnethingEmbeddingRuntimeAdapters
}): Promise<number[][]> {
  const { resolved, values, runId, dimensions, adapters } = options
  const body: OpenAIEmbeddingRequest = {
    model: resolved.model,
    input: values,
  }
  if (dimensions !== undefined) body.dimensions = dimensions

  const response = await embeddingFetch(runId, resolved.providerId, resolved.model, adapters)(
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

  return vectorsFromOnethingOpenAIEmbeddingResponse(await response.json() as OpenAIEmbeddingResponse)
}

async function embedGemini(options: {
  resolved: ResolvedEmbeddingProvider
  values: string[]
  runId: string
  adapters: OnethingEmbeddingRuntimeAdapters
}): Promise<number[][]> {
  const { resolved, values, runId, adapters } = options
  const response = await embeddingFetch(runId, resolved.providerId, resolved.model, adapters)(
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

  return vectorsFromOnethingGeminiEmbeddingResponse(await response.json() as GeminiEmbeddingResponse)
}

async function embedWithNativeProvider(options: {
  resolved: ResolvedEmbeddingProvider
  values: string[]
  runId: string
  dimensions?: number
  adapters: OnethingEmbeddingRuntimeAdapters
}): Promise<number[][]> {
  if (options.resolved.kind === 'gemini') {
    return embedGemini({
      resolved: options.resolved,
      values: options.values,
      runId: options.runId,
      adapters: options.adapters,
    })
  }

  return embedOpenAICompatible(options)
}

export async function embedOnethingTexts<
  TSettings extends OnethingEmbeddingAppSettingsLike = OnethingEmbeddingAppSettingsLike,
>(
  request: OnethingEmbeddingRequest<TSettings>,
  adapters: OnethingEmbeddingRuntimeAdapters = {},
): Promise<OnethingEmbeddingResult> {
  adapters.configureDiagnostics?.(request.settings.general.soulMemory?.logging)
  const runId = adapters.createId?.() || crypto.randomUUID()
  const startedAt = adapters.now?.() ?? Date.now()
  const values = request.values.map(value => value.trim()).filter(Boolean)
  if (values.length === 0) {
    adapters.logDiagnostic?.({
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
    adapters.logDiagnostic?.({
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
    adapters.logDiagnostic?.({
      subsystem: 'embedding',
      operation: 'embed-texts',
      stage: 'resolve',
      status: 'ok',
      runId,
      response: {
        providerId: resolved.providerId,
        model: resolved.model,
        baseUrl: resolved.baseUrl ? adapters.sanitizeUrl?.(resolved.baseUrl) ?? resolved.baseUrl : '',
        mode: configured ? 'configured' : 'auto',
      },
    })
    const dimensions = resolveEmbeddingDimensions(request.settings, resolved)
    adapters.logDiagnostic?.({
      subsystem: 'embedding',
      operation: 'embed-texts',
      stage: 'native-request',
      status: 'started',
      runId,
      request: {
        inputCount: values.length,
        providerId: resolved.providerId,
        model: resolved.model,
        dimensions: dimensions || 0,
      },
    })
    const vectors = await embedWithNativeProvider({
      resolved,
      values,
      runId,
      dimensions,
      adapters,
    })
    adapters.logDiagnostic?.({
      subsystem: 'embedding',
      operation: 'embed-texts',
      stage: 'native-response',
      status: 'ok',
      durationMs: (adapters.now?.() ?? Date.now()) - startedAt,
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
    adapters.logDiagnostic?.({
      subsystem: 'embedding',
      operation: 'embed-texts',
      stage: 'native-response',
      status: 'error',
      durationMs: (adapters.now?.() ?? Date.now()) - startedAt,
      runId,
      error,
      metadata: { inputCount: values.length },
    })
    throw error
  }
}
