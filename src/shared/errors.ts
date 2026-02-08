/**
 * Unified Error Classification System
 * REQ-007: Provides structured error categorization and user-friendly messages
 */

import { ERROR_PATTERNS, FALLBACK_MESSAGE } from './error-messages.js'

/**
 * Error categories for classifying different types of errors
 */
export enum ErrorCategory {
  NETWORK = 'network',       // 网络/连接问题 (ECONNREFUSED, ETIMEDOUT, Failed to fetch)
  AUTH = 'auth',              // 认证/密钥问题 (401, invalid_api_key)
  QUOTA = 'quota',            // 配额/限制 (429, insufficient_quota)
  CONTEXT = 'context',        // 上下文长度 (context_length_exceeded)
  PROVIDER = 'provider',      // Provider 特定错误 (模型不存在等)
  VALIDATION = 'validation',  // 输入验证错误
  INTERNAL = 'internal',      // 内部错误 (不应暴露给用户)
}

/**
 * Structured application error
 */
export interface AppError {
  category: ErrorCategory
  message: string           // 用户友好的消息
  technicalDetail?: string  // 原始错误信息（调试用）
  retryable: boolean        // 是否可重试
  statusCode?: number       // HTTP 状态码（如有）
}

/**
 * Extract the error message string from an unknown error value
 */
function extractMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  if (typeof error === 'string') {
    return error
  }
  try {
    return String(error)
  } catch {
    return 'Unknown error'
  }
}

/**
 * Extract HTTP status code from error objects (AI SDK, Axios, etc.)
 */
function extractStatusCode(error: unknown): number | undefined {
  if (error == null || typeof error !== 'object') return undefined
  const e = error as Record<string, unknown>

  // AI SDK / fetch errors
  if (typeof e.status === 'number') return e.status
  if (typeof e.statusCode === 'number') return e.statusCode

  // Nested response object
  if (e.response && typeof e.response === 'object') {
    const resp = e.response as Record<string, unknown>
    if (typeof resp.status === 'number') return resp.status
  }

  return undefined
}

/**
 * Build a full searchable string from an error for pattern matching.
 * Includes the message, nested cause, data payload, etc.
 */
function buildSearchString(error: unknown): string {
  const parts: string[] = []

  parts.push(extractMessage(error))

  if (error != null && typeof error === 'object') {
    const e = error as Record<string, unknown>

    // AI SDK wraps errors in `cause`
    if (e.cause) {
      parts.push(extractMessage(e.cause))
      if (typeof e.cause === 'object' && e.cause !== null) {
        const cause = e.cause as Record<string, unknown>
        if (cause.data) parts.push(JSON.stringify(cause.data))
      }
    }

    // error.data (API response body)
    if (e.data) {
      try {
        parts.push(typeof e.data === 'string' ? e.data : JSON.stringify(e.data))
      } catch { /* ignore */ }
    }

    // error.code (e.g. ECONNREFUSED)
    if (typeof e.code === 'string') {
      parts.push(e.code)
    }
  }

  return parts.join(' ')
}

/**
 * Classify an unknown error into an AppError with user-friendly message
 */
export function classifyError(error: unknown): AppError {
  const searchString = buildSearchString(error)
  const statusCode = extractStatusCode(error)
  const technicalDetail = extractMessage(error)

  // Try to match against known error patterns
  for (const { pattern, category, userMessage, retryable } of ERROR_PATTERNS) {
    if (pattern.test(searchString)) {
      return {
        category,
        message: userMessage,
        technicalDetail,
        retryable,
        statusCode,
      }
    }
  }

  // Status-code based fallback classification
  if (statusCode) {
    if (statusCode === 401 || statusCode === 403) {
      return {
        category: ErrorCategory.AUTH,
        message: 'API 密钥无效或已过期，请在设置中检查',
        technicalDetail,
        retryable: false,
        statusCode,
      }
    }
    if (statusCode === 429) {
      return {
        category: ErrorCategory.QUOTA,
        message: '请求太频繁，请稍后再试',
        technicalDetail,
        retryable: true,
        statusCode,
      }
    }
    if (statusCode >= 500) {
      return {
        category: ErrorCategory.PROVIDER,
        message: 'AI 服务暂时不可用，请稍后再试',
        technicalDetail,
        retryable: true,
        statusCode,
      }
    }
  }

  // Fallback
  return {
    category: ErrorCategory.INTERNAL,
    message: FALLBACK_MESSAGE,
    technicalDetail,
    retryable: false,
    statusCode,
  }
}
