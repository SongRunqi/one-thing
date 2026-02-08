/**
 * Error Classification Tests
 * REQ-007: Tests for classifyError() and ERROR_PATTERNS
 */

import { describe, it, expect } from 'vitest'
import { classifyError, ErrorCategory } from '../errors'
import { FALLBACK_MESSAGE } from '../error-messages'

describe('classifyError', () => {
  // ── Network Errors ──────────────────────────────────────────────────────

  describe('网络错误 (network)', () => {
    it('ECONNREFUSED → network, retryable', () => {
      const err = new Error('connect ECONNREFUSED 127.0.0.1:443')
      const result = classifyError(err)
      expect(result.category).toBe(ErrorCategory.NETWORK)
      expect(result.retryable).toBe(true)
    })

    it('ECONNREFUSED with port 11434 → Ollama specific message', () => {
      const err = new Error('connect ECONNREFUSED 127.0.0.1:11434')
      const result = classifyError(err)
      expect(result.category).toBe(ErrorCategory.NETWORK)
      expect(result.retryable).toBe(true)
      expect(result.message).toContain('Ollama')
    })

    it('ETIMEDOUT → network, retryable', () => {
      const err = new Error('connect ETIMEDOUT 1.2.3.4:443')
      const result = classifyError(err)
      expect(result.category).toBe(ErrorCategory.NETWORK)
      expect(result.retryable).toBe(true)
    })

    it('Failed to fetch → network, retryable', () => {
      const err = new Error('Failed to fetch')
      const result = classifyError(err)
      expect(result.category).toBe(ErrorCategory.NETWORK)
      expect(result.retryable).toBe(true)
    })

    it('ENOTFOUND → network', () => {
      const err = new Error('getaddrinfo ENOTFOUND api.openai.com')
      const result = classifyError(err)
      expect(result.category).toBe(ErrorCategory.NETWORK)
      expect(result.retryable).toBe(true)
    })

    it('ECONNRESET → network', () => {
      const err = new Error('read ECONNRESET')
      const result = classifyError(err)
      expect(result.category).toBe(ErrorCategory.NETWORK)
      expect(result.retryable).toBe(true)
    })

    it('socket hang up → network', () => {
      const err = new Error('socket hang up')
      const result = classifyError(err)
      expect(result.category).toBe(ErrorCategory.NETWORK)
      expect(result.retryable).toBe(true)
    })

    it('ERR_PROXY → network', () => {
      const err = new Error('ERR_PROXY_CONNECTION_FAILED')
      const result = classifyError(err)
      expect(result.category).toBe(ErrorCategory.NETWORK)
      expect(result.retryable).toBe(true)
    })
  })

  // ── Auth Errors ─────────────────────────────────────────────────────────

  describe('认证错误 (auth)', () => {
    it('invalid API key → auth, not retryable', () => {
      const err = new Error('invalid api_key provided')
      const result = classifyError(err)
      expect(result.category).toBe(ErrorCategory.AUTH)
      expect(result.retryable).toBe(false)
    })

    it('401 in message → auth', () => {
      const err = new Error('Request failed with status 401')
      const result = classifyError(err)
      expect(result.category).toBe(ErrorCategory.AUTH)
      expect(result.retryable).toBe(false)
    })

    it('authentication_error → auth', () => {
      const err = new Error('authentication_error: invalid x-api-key')
      const result = classifyError(err)
      expect(result.category).toBe(ErrorCategory.AUTH)
      expect(result.retryable).toBe(false)
    })

    it('status code 401 (no text match) → auth via status fallback', () => {
      const err = Object.assign(new Error('something went wrong'), { status: 401 })
      // The "401" text is NOT in the message, but pattern /unauthorized|401/ won't match.
      // However, the message "something went wrong" won't match auth patterns either.
      // So this should fall through to status-code fallback.
      const result = classifyError(err)
      expect(result.category).toBe(ErrorCategory.AUTH)
      expect(result.retryable).toBe(false)
    })

    it('status code 403 → auth via status fallback', () => {
      const err = Object.assign(new Error('access denied'), { status: 403 })
      // "forbidden|403" pattern matches "403" but "access denied" does not match.
      // Falls through to status-code fallback.
      const result = classifyError(err)
      expect(result.category).toBe(ErrorCategory.AUTH)
      expect(result.retryable).toBe(false)
    })
  })

  // ── Quota / Rate Limit ──────────────────────────────────────────────────

  describe('配额/限流 (quota)', () => {
    it('429 status in message → quota, retryable', () => {
      const err = new Error('Error 429: Too many requests')
      const result = classifyError(err)
      expect(result.category).toBe(ErrorCategory.QUOTA)
      expect(result.retryable).toBe(true)
    })

    it('rate_limit → quota, retryable', () => {
      const err = new Error('rate_limit_exceeded')
      const result = classifyError(err)
      expect(result.category).toBe(ErrorCategory.QUOTA)
      expect(result.retryable).toBe(true)
    })

    it('insufficient_quota → quota, NOT retryable', () => {
      const err = new Error('insufficient_quota')
      const result = classifyError(err)
      expect(result.category).toBe(ErrorCategory.QUOTA)
      expect(result.retryable).toBe(false)
    })

    it('resource_exhausted → quota, retryable', () => {
      const err = new Error('RESOURCE_EXHAUSTED: quota exceeded')
      const result = classifyError(err)
      expect(result.category).toBe(ErrorCategory.QUOTA)
      expect(result.retryable).toBe(true)
    })

    it('status code 429 (no text match) → quota via status fallback', () => {
      const err = Object.assign(new Error('slow down please'), { status: 429 })
      const result = classifyError(err)
      expect(result.category).toBe(ErrorCategory.QUOTA)
      expect(result.retryable).toBe(true)
    })
  })

  // ── Context Length ──────────────────────────────────────────────────────

  describe('上下文长度 (context)', () => {
    it('context_length_exceeded → context', () => {
      const err = new Error('context_length_exceeded')
      const result = classifyError(err)
      expect(result.category).toBe(ErrorCategory.CONTEXT)
      expect(result.retryable).toBe(false)
    })

    it('max_tokens → context', () => {
      const err = new Error('max_tokens limit reached')
      const result = classifyError(err)
      expect(result.category).toBe(ErrorCategory.CONTEXT)
      expect(result.retryable).toBe(false)
    })

    it('prompt too long → context', () => {
      const err = new Error('prompt is too long for this model')
      const result = classifyError(err)
      expect(result.category).toBe(ErrorCategory.CONTEXT)
      expect(result.retryable).toBe(false)
    })
  })

  // ── Provider Errors ─────────────────────────────────────────────────────

  describe('Provider 错误 (provider)', () => {
    it('model not found → provider', () => {
      const err = new Error('model gpt-5 not found')
      const result = classifyError(err)
      expect(result.category).toBe(ErrorCategory.PROVIDER)
      expect(result.retryable).toBe(false)
    })

    it('overloaded → provider, retryable', () => {
      const err = new Error('The server is overloaded')
      const result = classifyError(err)
      expect(result.category).toBe(ErrorCategory.PROVIDER)
      expect(result.retryable).toBe(true)
    })

    it('500 status code → provider via status fallback', () => {
      const err = Object.assign(new Error('oops'), { status: 500 })
      const result = classifyError(err)
      expect(result.category).toBe(ErrorCategory.PROVIDER)
      expect(result.retryable).toBe(true)
    })

    it('502 status code → provider via status fallback', () => {
      const err = Object.assign(new Error('bad gateway'), { status: 502 })
      const result = classifyError(err)
      expect(result.category).toBe(ErrorCategory.PROVIDER)
      expect(result.retryable).toBe(true)
    })

    it('content_filter → provider, not retryable', () => {
      const err = new Error('content_filter triggered')
      const result = classifyError(err)
      expect(result.category).toBe(ErrorCategory.PROVIDER)
      expect(result.retryable).toBe(false)
    })

    it('JSON parse error → provider, retryable', () => {
      const err = new Error('Unexpected token < in JSON at position 0')
      const result = classifyError(err)
      expect(result.category).toBe(ErrorCategory.PROVIDER)
      expect(result.retryable).toBe(true)
    })
  })

  // ── Validation Errors ───────────────────────────────────────────────────

  describe('验证错误 (validation)', () => {
    it('validation error → validation', () => {
      const err = new Error('validation error: field is required')
      const result = classifyError(err)
      expect(result.category).toBe(ErrorCategory.VALIDATION)
      expect(result.retryable).toBe(false)
    })

    it('invalid parameter → validation', () => {
      const err = new Error('invalid parameter: temperature must be between 0 and 2')
      const result = classifyError(err)
      expect(result.category).toBe(ErrorCategory.VALIDATION)
      expect(result.retryable).toBe(false)
    })
  })

  // ── Fallback / Unknown ──────────────────────────────────────────────────

  describe('兜底 / 未知错误 (internal)', () => {
    it('unknown error → internal, fallback message', () => {
      const err = new Error('something completely unexpected happened')
      const result = classifyError(err)
      expect(result.category).toBe(ErrorCategory.INTERNAL)
      expect(result.message).toBe(FALLBACK_MESSAGE)
      expect(result.retryable).toBe(false)
    })

    it('preserves technicalDetail from Error message', () => {
      const err = new Error('detailed technical info here')
      const result = classifyError(err)
      expect(result.technicalDetail).toBe('detailed technical info here')
    })
  })

  // ── Input Type Handling ─────────────────────────────────────────────────

  describe('不同输入类型', () => {
    it('string input → classifies correctly', () => {
      const result = classifyError('ECONNREFUSED 127.0.0.1:443')
      expect(result.category).toBe(ErrorCategory.NETWORK)
      expect(result.technicalDetail).toBe('ECONNREFUSED 127.0.0.1:443')
    })

    it('Error object → classifies correctly', () => {
      const result = classifyError(new Error('insufficient_quota'))
      expect(result.category).toBe(ErrorCategory.QUOTA)
    })

    it('null → internal fallback', () => {
      const result = classifyError(null)
      expect(result.category).toBe(ErrorCategory.INTERNAL)
      expect(result.message).toBe(FALLBACK_MESSAGE)
    })

    it('undefined → internal fallback', () => {
      const result = classifyError(undefined)
      expect(result.category).toBe(ErrorCategory.INTERNAL)
      expect(result.message).toBe(FALLBACK_MESSAGE)
    })

    it('number → internal fallback', () => {
      const result = classifyError(42)
      expect(result.category).toBe(ErrorCategory.INTERNAL)
    })

    it('object with status code → extracts statusCode', () => {
      const err = Object.assign(new Error('server error'), { status: 503 })
      const result = classifyError(err)
      expect(result.statusCode).toBe(503)
    })

    it('object with nested response.status → extracts statusCode', () => {
      const err = Object.assign(new Error('request failed'), {
        response: { status: 502 },
      })
      const result = classifyError(err)
      expect(result.statusCode).toBe(502)
    })

    it('object with cause → searches cause message', () => {
      const cause = new Error('ECONNREFUSED 127.0.0.1:443')
      const err = Object.assign(new Error('fetch failed'), { cause })
      const result = classifyError(err)
      expect(result.category).toBe(ErrorCategory.NETWORK)
    })

    it('object with code property → uses code in search', () => {
      const err = Object.assign(new Error('connect failed'), { code: 'ECONNREFUSED' })
      const result = classifyError(err)
      expect(result.category).toBe(ErrorCategory.NETWORK)
    })
  })
})
