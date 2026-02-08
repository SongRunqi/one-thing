/**
 * Error Pattern Matching Table
 * REQ-007: Maps error patterns to user-friendly messages
 *
 * Patterns are tested in order — first match wins.
 * More specific patterns should come before generic ones.
 */

import { ErrorCategory } from './errors.js'

export interface ErrorPattern {
  pattern: RegExp
  category: ErrorCategory
  userMessage: string
  retryable: boolean
}

export const FALLBACK_MESSAGE = '操作失败，请重试'

export const ERROR_PATTERNS: ErrorPattern[] = [
  // ── Network / Connection ──────────────────────────────────────────────
  {
    pattern: /ECONNREFUSED.*11434/,
    category: ErrorCategory.NETWORK,
    userMessage: 'Ollama 服务未启动，请先启动 Ollama',
    retryable: true,
  },
  {
    pattern: /ECONNREFUSED/i,
    category: ErrorCategory.NETWORK,
    userMessage: '无法连接到服务，请检查服务是否已启动',
    retryable: true,
  },
  {
    pattern: /ETIMEDOUT|ESOCKETTIMEDOUT|request.*timed?\s*out/i,
    category: ErrorCategory.NETWORK,
    userMessage: '请求超时，请检查网络连接后重试',
    retryable: true,
  },
  {
    pattern: /ENOTFOUND/i,
    category: ErrorCategory.NETWORK,
    userMessage: '无法解析服务地址，请检查网络或代理设置',
    retryable: true,
  },
  {
    pattern: /Failed to fetch|fetch failed|network\s*error/i,
    category: ErrorCategory.NETWORK,
    userMessage: '网络连接失败，请检查网络',
    retryable: true,
  },
  {
    pattern: /ECONNRESET|EPIPE|socket hang up/i,
    category: ErrorCategory.NETWORK,
    userMessage: '连接被中断，请重试',
    retryable: true,
  },
  {
    pattern: /ERR_PROXY|proxy/i,
    category: ErrorCategory.NETWORK,
    userMessage: '代理连接失败，请检查代理设置',
    retryable: true,
  },

  // ── Auth / API Key ────────────────────────────────────────────────────
  {
    pattern: /invalid.*api[_\s]?key|api[_\s]?key.*invalid/i,
    category: ErrorCategory.AUTH,
    userMessage: 'API 密钥无效，请在设置中检查',
    retryable: false,
  },
  {
    pattern: /unauthorized|401/i,
    category: ErrorCategory.AUTH,
    userMessage: '认证失败，请检查 API 密钥或重新登录',
    retryable: false,
  },
  {
    pattern: /forbidden|403/i,
    category: ErrorCategory.AUTH,
    userMessage: '没有访问权限，请检查 API 密钥的权限',
    retryable: false,
  },
  {
    pattern: /authentication_error/i,
    category: ErrorCategory.AUTH,
    userMessage: '认证失败，请检查 API 密钥',
    retryable: false,
  },

  // ── Quota / Rate Limit ────────────────────────────────────────────────
  {
    pattern: /insufficient_quota|billing|payment/i,
    category: ErrorCategory.QUOTA,
    userMessage: 'API 余额不足，请检查账户余额',
    retryable: false,
  },
  {
    pattern: /429|rate[_\s]?limit|too many requests/i,
    category: ErrorCategory.QUOTA,
    userMessage: '请求太频繁，请稍后再试',
    retryable: true,
  },
  {
    pattern: /resource[_\s]?exhausted/i,
    category: ErrorCategory.QUOTA,
    userMessage: 'API 资源已用尽，请稍后再试',
    retryable: true,
  },

  // ── Context Length ────────────────────────────────────────────────────
  {
    pattern: /context[_\s]?length[_\s]?exceeded|maximum.*context/i,
    category: ErrorCategory.CONTEXT,
    userMessage: '对话太长，建议新建对话或清理历史',
    retryable: false,
  },
  {
    pattern: /max[_\s]?tokens|token[_\s]?limit|too many tokens/i,
    category: ErrorCategory.CONTEXT,
    userMessage: '消息太长，请缩短内容后重试',
    retryable: false,
  },
  {
    pattern: /prompt.*too\s*long|input.*too\s*long/i,
    category: ErrorCategory.CONTEXT,
    userMessage: '输入内容过长，请缩短后重试',
    retryable: false,
  },

  // ── Provider / Model ──────────────────────────────────────────────────
  {
    pattern: /model.*not\s*found|model.*does\s*not\s*exist|invalid.*model/i,
    category: ErrorCategory.PROVIDER,
    userMessage: '模型不存在或不可用，请在设置中选择其他模型',
    retryable: false,
  },
  {
    pattern: /overloaded|capacity|server.*busy/i,
    category: ErrorCategory.PROVIDER,
    userMessage: 'AI 服务繁忙，请稍后再试',
    retryable: true,
  },
  {
    pattern: /5\d{2}\s|internal\s*server\s*error|server\s*error/i,
    category: ErrorCategory.PROVIDER,
    userMessage: 'AI 服务暂时不可用，请稍后再试',
    retryable: true,
  },
  {
    pattern: /Unexpected token.*in JSON|JSON\.parse|invalid json/i,
    category: ErrorCategory.PROVIDER,
    userMessage: '收到无效的响应数据，可能是代理或网关问题',
    retryable: true,
  },
  {
    pattern: /content[_\s]?filter|content[_\s]?policy|safety/i,
    category: ErrorCategory.PROVIDER,
    userMessage: '内容被安全策略过滤，请调整输入后重试',
    retryable: false,
  },

  // ── Validation ────────────────────────────────────────────────────────
  {
    pattern: /validation.*error|invalid.*parameter|invalid.*argument/i,
    category: ErrorCategory.VALIDATION,
    userMessage: '请求参数有误，请检查输入',
    retryable: false,
  },

  // ── Internal / Serialization ──────────────────────────────────────────
  {
    pattern: /could not be cloned|DataCloneError/i,
    category: ErrorCategory.INTERNAL,
    userMessage: '内部通信错误，请重试',
    retryable: true,
  },
]
