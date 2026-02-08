/**
 * Error type definitions
 * Extracted to break circular dependency between errors.ts and error-messages.ts
 */

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
