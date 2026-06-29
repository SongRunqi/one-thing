import type { JsonObject, JsonValue } from '../json.js'
import { toJsonObject } from '../json.js'

export interface CoreErrorDetails {
  message?: string
  stack?: string
  cause?: CoreErrorDetails
  responseBody?: string
  data?: CoreErrorData | string
}

interface CoreErrorData extends JsonObject {
  message?: string
  type?: string
  code?: string | number
  statusCode?: string | number
  responseBody?: string
  requestBodyValues?: JsonValue
  responseHeaders?: JsonValue
  error?: CoreNestedError | string
}

interface CoreNestedError extends JsonObject {
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

export function extractErrorDetails(error: CoreErrorDetails | undefined): string | undefined {
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
