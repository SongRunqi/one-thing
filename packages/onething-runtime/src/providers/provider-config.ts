import { toJsonObject, type JsonObject, type JsonValue } from '@onething/core'
import { resolveOnethingProviderBaseUrl } from './zhipu.js'

export interface CoreProviderErrorDetails {
  message?: string
  stack?: string
  cause?: CoreProviderErrorDetails
  responseBody?: string
  data?: CoreProviderErrorData | string
}

interface CoreProviderErrorData extends JsonObject {
  message?: string
  type?: string
  code?: string | number
  statusCode?: string | number
  responseBody?: string
  requestBodyValues?: JsonValue
  responseHeaders?: JsonValue
  error?: CoreProviderNestedError | string
}

interface CoreProviderNestedError extends JsonObject {
  message?: string
  type?: string
  code?: string | number
}

const ZHIPU_ERROR_DESCRIPTIONS: Record<string, string> = {
  '1000': '身份验证失败。请求已带认证信息，但 token 未通过智谱校验；普通 API Key 请使用 Standard 模式，Coding Plan Key 请使用 Coding Plan 模式，并检查设置中是否残留旧 key。',
  '1001': 'Header 中未收到 Authentication 参数。请确认请求使用 Authorization: Bearer <API Key>。',
  '1003': 'Authentication Token 已过期。请在智谱控制台重新生成或获取 API Key。',
  '1005': '账号已开启二次认证保护，需要完成二次认证登录。',
  '1113': '账户已欠费，请充值后重试。',
  '1210': 'API 调用参数有误，请对照智谱接口文档检查请求体。',
  '1211': '模型不存在，请检查模型代码是否正确。',
  '1220': '当前账号或 API Key 无权访问该 API。',
  '1261': 'Prompt 超长，请缩短上下文或开启压缩。',
  '1301': '输入或生成内容可能包含不安全或敏感内容。',
  '1302': '账户已达到速率限制，请降低请求频率。',
  '1305': '模型当前访问量过大，请稍后重试。',
  '1309': 'GLM Coding Plan 套餐已到期，请续订后重试。',
  '1311': '当前订阅套餐暂未开放该模型权限。',
  '1315': '该 API Key 仅限企业编程套餐场景使用，请切换到匹配的 API 模式或更换对应产品类型的 API Key。',
}

function formatKnownProviderError(parsed: JsonObject): string | undefined {
  const nested = parsed.error && typeof parsed.error === 'object' && !Array.isArray(parsed.error)
    ? parsed.error as JsonObject
    : undefined
  const codeValue = nested?.code ?? parsed.code
  const code = typeof codeValue === 'string' || typeof codeValue === 'number'
    ? String(codeValue)
    : undefined
  if (!code) return undefined

  const description = ZHIPU_ERROR_DESCRIPTIONS[code]
  if (!description) return undefined

  const messageValue = nested?.message ?? parsed.message
  const message = typeof messageValue === 'string' ? messageValue.trim() : ''
  return message && !description.startsWith(message)
    ? `${message} (code: ${code}). ${description}`
    : `${description} (code: ${code})`
}

export interface CoreProviderConfigLike {
  model?: string
  selectedModels?: string[]
  baseUrl?: string
  zhipuApiMode?: 'standard' | 'coding-plan'
  temperature?: number
  oauthToken?: unknown
}

export interface CoreCustomProviderConfigLike extends CoreProviderConfigLike {
  id: string
  name?: string
  apiType?: 'openai' | 'anthropic'
}

export interface CoreAISettingsLike<TProvider extends CoreProviderConfigLike = CoreProviderConfigLike> {
  provider: string
  providers: Record<string, TProvider | undefined>
  customProviders?: CoreCustomProviderConfigLike[]
  temperature?: number
}

export interface CoreAppSettingsWithAI<TProvider extends CoreProviderConfigLike = CoreProviderConfigLike> {
  ai: CoreAISettingsLike<TProvider>
}

export interface CoreToolCallModelSettingsLike {
  providerId?: string
  model?: string
  thinking?: boolean
  thinkingEffort?: unknown
}

export interface CoreAppSettingsWithTitleModel<TProvider extends CoreProviderConfigLike = CoreProviderConfigLike>
  extends CoreAppSettingsWithAI<TProvider> {
  tools?: {
    toolCallModel?: CoreToolCallModelSettingsLike
  }
}

export interface CoreSessionProviderSelection {
  lastProvider?: string
  lastModel?: string
}

export interface CoreEffectiveProviderConfig<TProvider extends CoreProviderConfigLike = CoreProviderConfigLike> {
  providerId: string
  providerConfig: TProvider | undefined
  model: string
}

export interface CoreProviderAuthLike {
  kind: string
  apiKey?: string
}

export interface CoreProviderAuthLogger {
  error?: (...args: unknown[]) => void
}

export interface ResolveProviderApiKeyWithAdaptersOptions<TProvider extends CoreProviderConfigLike = CoreProviderConfigLike> {
  providerId: string
  providerConfig: TProvider | undefined
  acpProviderId?: string
  isOAuthProvider: (providerId: string) => boolean
  refreshOAuthToken: (providerId: string) => Promise<{ accessToken: string }>
  resolveApiKey: (providerId: string, providerConfig: TProvider | undefined) => string | null | undefined
  logger?: CoreProviderAuthLogger
}

export interface ResolveProviderAuthWithAdaptersOptions<
  TProvider extends CoreProviderConfigLike = CoreProviderConfigLike,
  TAuth extends CoreProviderAuthLike = CoreProviderAuthLike,
> {
  providerId: string
  providerConfig: TProvider | undefined
  acpProviderId?: string
  isOAuthProvider: (providerId: string) => boolean
  resolveApiKey: (providerId: string, providerConfig: TProvider | undefined) => string | null | undefined
  resolveOAuthAuth: (providerId: string, apiKey?: string) => Promise<TAuth | null>
  createApiKeyAuth?: (apiKey: string) => TAuth
  logger?: CoreProviderAuthLogger
}

export interface CoreResolvedProviderConfigForChat<
  TProvider extends CoreProviderConfigLike = CoreProviderConfigLike,
  TAuth extends CoreProviderAuthLike = CoreProviderAuthLike,
> {
  providerId: string
  model: string
  providerConfig: TProvider | undefined
  authContext: TAuth
  apiKey: string
  baseUrl?: string
  temperature: number
}

export interface ResolveProviderConfigForChatOptions<
  TProvider extends CoreProviderConfigLike = CoreProviderConfigLike,
  TAuth extends CoreProviderAuthLike = CoreProviderAuthLike,
> {
  settings: CoreAppSettingsWithAI<TProvider>
  session?: CoreSessionProviderSelection | null
  resolveAuth: (providerId: string, providerConfig: TProvider | undefined) => TAuth | null | Promise<TAuth | null>
}

export function extractErrorDetails(error: CoreProviderErrorDetails | undefined): string | undefined {
  if (!error) return undefined

  const data = typeof error.data === 'object' && error.data !== null ? error.data : undefined
  const bodyDetails = extractResponseBodyDetails(error.responseBody) ||
    extractResponseBodyDetails(data?.responseBody)
  if (bodyDetails) return bodyDetails

  if (error.cause) {
    return extractErrorDetails(error.cause)
  }

  if (error.data) {
    if (typeof error.data === 'string') return error.data
    const data = error.data
    const knownProviderError = formatKnownProviderError(data)
    if (knownProviderError) return knownProviderError

    if (typeof data.error === 'object' && data.error?.message) {
      const err = data.error
      let details = err.message
      if (err.type) details += ` (type: ${err.type})`
      if (err.code) details += ` (code: ${err.code})`
      return details
    }

    if (data.type === 'error' && typeof data.error === 'object') {
      const err = data.error
      return `${err.type}: ${err.message}`
    }

    if (typeof data.message === 'string') {
      return data.message
    }

    if (data.responseBody) {
      const details = extractResponseBodyDetails(data.responseBody)
      if (details) return details
    }

    if (data.requestBodyValues || data.responseHeaders || data.statusCode) {
      return data.message || `Provider API request failed${data.statusCode ? ` (${data.statusCode})` : ''}`
    }

    try {
      return JSON.stringify(data, null, 2)
    } catch {
      return undefined
    }
  }

  return error.message || error.stack
}

export function extractResponseBodyDetails(body: string | undefined): string | undefined {
  if (typeof body !== 'string' || !body.trim()) return undefined
  try {
    const parsed = toJsonObject(JSON.parse(body) as JsonValue)
    const knownProviderError = formatKnownProviderError(parsed)
    if (knownProviderError) return knownProviderError

    const error = parsed.error
    const message = parsed.detail ||
      (error && typeof error === 'object' && !Array.isArray(error) ? error.message : undefined) ||
      parsed.message ||
      error
    if (typeof message === 'string' && message.trim()) return message.trim()
  } catch {
    // Fall back to compact text below.
  }
  const compact = body.replace(/\s+/g, ' ').trim()
  return compact || undefined
}

export function getProviderConfig<TProvider extends CoreProviderConfigLike>(
  settings: CoreAppSettingsWithAI<TProvider>,
): TProvider | undefined {
  return settings.ai.providers[settings.ai.provider]
}

export async function getProviderApiKeyWithAdapters<TProvider extends CoreProviderConfigLike>(
  options: ResolveProviderApiKeyWithAdaptersOptions<TProvider>,
): Promise<string | null> {
  if (options.providerId === (options.acpProviderId ?? 'acp')) {
    return ''
  }

  if (options.isOAuthProvider(options.providerId)) {
    try {
      const token = await options.refreshOAuthToken(options.providerId)
      return token.accessToken
    } catch (error) {
      options.logger?.error?.(`Failed to get OAuth token for ${options.providerId}:`, error)
      return null
    }
  }

  return options.resolveApiKey(options.providerId, options.providerConfig) ?? null
}

export async function resolveProviderAuthWithAdapters<
  TProvider extends CoreProviderConfigLike,
  TAuth extends CoreProviderAuthLike,
>(
  options: ResolveProviderAuthWithAdaptersOptions<TProvider, TAuth>,
): Promise<TAuth | null> {
  const createApiKeyAuth = options.createApiKeyAuth ?? ((apiKey: string) => ({ kind: 'api-key', apiKey }) as TAuth)

  if (options.providerId === (options.acpProviderId ?? 'acp')) {
    return createApiKeyAuth('')
  }

  if (options.isOAuthProvider(options.providerId)) {
    try {
      return await options.resolveOAuthAuth(
        options.providerId,
        options.resolveApiKey(options.providerId, options.providerConfig) ?? undefined,
      )
    } catch (error) {
      options.logger?.error?.(`Failed to resolve OAuth credentials for ${options.providerId}:`, error)
      return null
    }
  }

  const apiKey = options.resolveApiKey(options.providerId, options.providerConfig) || ''
  return apiKey ? createApiKeyAuth(apiKey) : null
}

export function getEffectiveProviderConfig<TProvider extends CoreProviderConfigLike>(
  settings: CoreAppSettingsWithAI<TProvider>,
  session?: CoreSessionProviderSelection | null,
): CoreEffectiveProviderConfig<TProvider> {
  if (session?.lastProvider && session?.lastModel) {
    const providerId = session.lastProvider
    const providerConfig = settings.ai.providers[providerId]

    if (providerConfig) {
      const effectiveConfig = withResolvedProviderBaseUrl(providerId, {
        ...providerConfig,
        model: session.lastModel,
      })
      return {
        providerId,
        providerConfig: effectiveConfig,
        model: session.lastModel,
      }
    }
  }

  const providerId = settings.ai.provider
  const providerConfig = settings.ai.providers[providerId]
  const effectiveConfig = withResolvedProviderBaseUrl(providerId, providerConfig)
  return {
    providerId,
    providerConfig: effectiveConfig,
    model: effectiveConfig?.model || '',
  }
}

export function withResolvedProviderBaseUrl<TProvider extends CoreProviderConfigLike>(
  providerId: string,
  providerConfig: TProvider | undefined,
): TProvider | undefined {
  if (!providerConfig) return providerConfig
  const baseUrl = resolveOnethingProviderBaseUrl(providerId, providerConfig)
  if (baseUrl === providerConfig.baseUrl) return providerConfig
  return { ...providerConfig, baseUrl }
}

export function getCustomProviderConfig(
  settings: CoreAppSettingsWithAI,
  providerId: string,
): CoreCustomProviderConfigLike | undefined {
  return settings.ai.customProviders?.find(provider => provider.id === providerId)
}

export function getProviderApiType(
  settings: CoreAppSettingsWithAI,
  providerId: string,
): 'openai' | 'anthropic' | undefined {
  if (providerId.startsWith('custom-')) {
    const customProvider = getCustomProviderConfig(settings, providerId)
    return customProvider?.apiType
  }
  return undefined
}

export async function resolveProviderConfigForChat<
  TProvider extends CoreProviderConfigLike,
  TAuth extends CoreProviderAuthLike,
>(
  options: ResolveProviderConfigForChatOptions<TProvider, TAuth>,
): Promise<CoreResolvedProviderConfigForChat<TProvider, TAuth> | null> {
  const settings = options.settings

  if (options.session?.lastProvider && options.session.lastModel) {
    const providerId = options.session.lastProvider
    const providerConfig = settings.ai.providers[providerId]
    const authContext = await options.resolveAuth(providerId, providerConfig)

    if (authContext) {
      const effectiveConfig = withResolvedProviderBaseUrl(providerId, providerConfig)
      return {
        providerId,
        model: options.session.lastModel,
        providerConfig: effectiveConfig,
        authContext,
        apiKey: authContext.kind === 'api-key' ? authContext.apiKey ?? '' : '',
        baseUrl: effectiveConfig?.baseUrl,
        temperature: effectiveConfig?.temperature ?? settings.ai.temperature ?? 0,
      }
    }
  }

  const providerId = settings.ai.provider
  const providerConfig = settings.ai.providers[providerId]
  const authContext = await options.resolveAuth(providerId, providerConfig)

  if (!authContext) return null
  const effectiveConfig = withResolvedProviderBaseUrl(providerId, providerConfig)

  return {
    providerId,
    model: effectiveConfig?.model || '',
    providerConfig: effectiveConfig,
    authContext,
    apiKey: authContext.kind === 'api-key' ? authContext.apiKey ?? '' : '',
    baseUrl: effectiveConfig?.baseUrl,
    temperature: effectiveConfig?.temperature ?? settings.ai.temperature ?? 0,
  }
}

export function formatProviderCredentialsError(
  providerId: string,
  isOAuthProvider: boolean,
): string {
  if (isOAuthProvider) {
    return `Not logged in to ${providerId}. Please login in settings.`
  }
  return 'API Key not configured. Please configure your AI settings.'
}
