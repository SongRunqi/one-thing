export type SoulMemoryEmbeddingProviderKind =
  | 'openai'
  | 'openrouter'
  | 'gemini'
  | 'custom'
  | 'ollama'
  | 'unknown'

export interface SoulMemoryEmbeddingProviderLike {
  apiKey?: string
  baseUrl?: string
  model?: string
}

export interface SoulMemoryEmbeddingCustomProviderLike extends SoulMemoryEmbeddingProviderLike {
  id: string
  name?: string
  apiType?: string
}

export interface SoulMemoryEmbeddingProviderDefault {
  providerKind: Exclude<SoulMemoryEmbeddingProviderKind, 'unknown'>
  label: string
  defaultModel: string
  defaultBaseUrl: string
  apiKeyHint: string
}

export interface SoulMemoryEmbeddingTarget {
  requestedProviderId: string
  providerKind: SoulMemoryEmbeddingProviderKind
  providerId: string
  providerLabel: string
  model: string
  baseUrl: string
  apiKeyHint: string
  available: boolean
  reason?: string
  isAuto: boolean
  customProvider?: SoulMemoryEmbeddingCustomProviderLike
}

export const OPENAI_EMBEDDING_DEFAULT_MODEL = 'text-embedding-3-small'
export const OPENROUTER_EMBEDDING_DEFAULT_MODEL = 'openai/text-embedding-3-small'
export const GEMINI_EMBEDDING_DEFAULT_MODEL = 'gemini-embedding-001'
export const OLLAMA_EMBEDDING_DEFAULT_MODEL = 'nomic-embed-text'

export const OPENAI_EMBEDDING_DEFAULT_BASE_URL = 'https://api.openai.com/v1'
export const OPENROUTER_EMBEDDING_DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1'
export const GEMINI_EMBEDDING_DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta'
export const OLLAMA_EMBEDDING_DEFAULT_BASE_URL = 'http://127.0.0.1:11434/v1'

export const SOUL_MEMORY_EMBEDDING_AUTO_ORDER = ['openai', 'gemini', 'custom'] as const

export const SOUL_MEMORY_EMBEDDING_PROVIDER_DEFAULTS: Record<
  Exclude<SoulMemoryEmbeddingProviderKind, 'unknown'>,
  SoulMemoryEmbeddingProviderDefault
> = {
  openai: {
    providerKind: 'openai',
    label: 'OpenAI',
    defaultModel: OPENAI_EMBEDDING_DEFAULT_MODEL,
    defaultBaseUrl: OPENAI_EMBEDDING_DEFAULT_BASE_URL,
    apiKeyHint: 'Embedding API key, then OpenAI provider key',
  },
  openrouter: {
    providerKind: 'openrouter',
    label: 'OpenRouter',
    defaultModel: OPENROUTER_EMBEDDING_DEFAULT_MODEL,
    defaultBaseUrl: OPENROUTER_EMBEDDING_DEFAULT_BASE_URL,
    apiKeyHint: 'Embedding API key, then OpenRouter provider key',
  },
  gemini: {
    providerKind: 'gemini',
    label: 'Gemini',
    defaultModel: GEMINI_EMBEDDING_DEFAULT_MODEL,
    defaultBaseUrl: GEMINI_EMBEDDING_DEFAULT_BASE_URL,
    apiKeyHint: 'Embedding API key, then Gemini provider key',
  },
  custom: {
    providerKind: 'custom',
    label: 'Custom OpenAI-compatible',
    defaultModel: OPENAI_EMBEDDING_DEFAULT_MODEL,
    defaultBaseUrl: '',
    apiKeyHint: 'Embedding API key, then selected custom provider key',
  },
  ollama: {
    providerKind: 'ollama',
    label: 'Ollama-style',
    defaultModel: OLLAMA_EMBEDDING_DEFAULT_MODEL,
    defaultBaseUrl: OLLAMA_EMBEDDING_DEFAULT_BASE_URL,
    apiKeyHint: 'No API key required by default',
  },
}

function optionalString(value?: string): string | undefined {
  const trimmed = value?.trim()
  return trimmed || undefined
}

function providerKindForId(providerId: string): SoulMemoryEmbeddingProviderKind {
  if (
    providerId === 'openai' ||
    providerId === 'openrouter' ||
    providerId === 'gemini' ||
    providerId === 'custom' ||
    providerId === 'ollama'
  ) {
    return providerId
  }
  return 'unknown'
}

export function getSoulMemoryEmbeddingProviderDefault(
  providerId?: string,
): SoulMemoryEmbeddingProviderDefault {
  const kind = providerKindForId(providerId || 'openai')
  if (kind === 'unknown') return SOUL_MEMORY_EMBEDDING_PROVIDER_DEFAULTS.custom
  return SOUL_MEMORY_EMBEDDING_PROVIDER_DEFAULTS[kind]
}

export function findOpenAICompatibleCustomEmbeddingProvider(
  customProviders?: SoulMemoryEmbeddingCustomProviderLike[],
  customProviderId?: string,
): SoulMemoryEmbeddingCustomProviderLike | undefined {
  const providers = customProviders || []
  if (customProviderId) {
    return providers.find(provider => provider.id === customProviderId && provider.apiType === 'openai')
  }
  return (
    providers.find(provider => provider.apiType === 'openai' && optionalString(provider.baseUrl)) ||
    providers.find(provider => provider.apiType === 'openai')
  )
}

interface ResolveEmbeddingTargetOptions {
  providerId?: string
  customProviderId?: string
  apiKey?: string
  model?: string
  baseUrl?: string
  providers?: Record<string, SoulMemoryEmbeddingProviderLike | undefined>
  customProviders?: SoulMemoryEmbeddingCustomProviderLike[]
}

function resolveConcreteTarget(
  options: ResolveEmbeddingTargetOptions & {
    requestedProviderId: string
    providerId: string
    isAuto: boolean
  },
): SoulMemoryEmbeddingTarget {
  const rawProviderKind = providerKindForId(options.providerId)
  const providerKind: Exclude<SoulMemoryEmbeddingProviderKind, 'unknown'> =
    rawProviderKind === 'unknown' ? 'custom' : rawProviderKind
  const defaults = getSoulMemoryEmbeddingProviderDefault(providerKind)
  const providerConfig = options.providers?.[options.providerId]
  const customProvider =
    providerKind === 'custom'
      ? findOpenAICompatibleCustomEmbeddingProvider(
          options.customProviders,
          options.providerId === 'custom' ? options.customProviderId : options.providerId,
        )
      : undefined
  const model =
    optionalString(options.model) ||
    (providerKind === 'custom' ? optionalString(customProvider?.model) : undefined) ||
    defaults.defaultModel
  const baseUrl =
    optionalString(options.baseUrl) ||
    (providerKind === 'custom' ? optionalString(customProvider?.baseUrl) : undefined) ||
    optionalString(providerConfig?.baseUrl) ||
    defaults.defaultBaseUrl
  const providerLabel =
    providerKind === 'custom' && customProvider
      ? customProvider.name || customProvider.id
      : defaults.label
  const hasApiKey = Boolean(optionalString(options.apiKey) || optionalString(providerConfig?.apiKey))
  const available =
    providerKind === 'ollama' ||
    (providerKind === 'custom'
      ? Boolean(baseUrl)
      : hasApiKey)
  const apiKeyHint = options.isAuto
    ? providerKind === 'custom'
      ? 'Selected custom provider key when required'
      : `${defaults.label} provider key`
    : defaults.apiKeyHint

  return {
    requestedProviderId: options.requestedProviderId,
    providerKind,
    providerId: providerKind === 'custom' ? customProvider?.id || options.providerId : providerKind,
    providerLabel: options.isAuto ? `Auto -> ${providerLabel}` : providerLabel,
    model,
    baseUrl,
    apiKeyHint,
    available,
    ...(available ? {} : { reason: `No ${providerLabel} embedding credentials or endpoint configured.` }),
    isAuto: options.isAuto,
    ...(customProvider ? { customProvider } : {}),
  }
}

export function resolveSoulMemoryEmbeddingTarget(
  options: ResolveEmbeddingTargetOptions,
): SoulMemoryEmbeddingTarget {
  const requestedProviderId = options.providerId || 'auto'
  if (requestedProviderId !== 'auto') {
    return resolveConcreteTarget({
      ...options,
      requestedProviderId,
      providerId: requestedProviderId,
      isAuto: false,
    })
  }

  const openai = options.providers?.openai
  if (optionalString(openai?.apiKey)) {
    return resolveConcreteTarget({
      ...options,
      requestedProviderId,
      providerId: 'openai',
      isAuto: true,
    })
  }

  const gemini = options.providers?.gemini
  if (optionalString(gemini?.apiKey)) {
    return resolveConcreteTarget({
      ...options,
      requestedProviderId,
      providerId: 'gemini',
      isAuto: true,
    })
  }

  const customProvider = findOpenAICompatibleCustomEmbeddingProvider(
    options.customProviders,
    options.customProviderId,
  )
  if (customProvider && optionalString(customProvider.baseUrl)) {
    return resolveConcreteTarget({
      ...options,
      requestedProviderId,
      providerId: customProvider.id,
      isAuto: true,
    })
  }

  return {
    ...resolveConcreteTarget({
      ...options,
      requestedProviderId,
      providerId: 'openai',
      isAuto: true,
    }),
    available: false,
    reason: 'Auto needs an OpenAI key, a Gemini key, or an OpenAI-compatible custom provider base URL.',
  }
}
