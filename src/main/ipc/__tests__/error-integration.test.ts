/**
 * Error Handling Integration Tests
 * REQ-007: End-to-end error classification through wrapIPCHandler
 *
 * Tests the full chain: Error thrown → classifyError → wrapIPCHandler → IPCErrorResponse
 * Verifies that all fields (success, error, errorDetails, errorCategory, retryable)
 * are correctly populated for different error scenarios.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { wrapIPCHandler, type IPCErrorResponse } from '../error-wrapper'
import { classifyError, ErrorCategory } from '@shared/errors'

// Suppress console.error from wrapIPCHandler during tests
beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('Error handling full chain: throw → classifyError → IPCErrorResponse', () => {
  // ── Network error ─────────────────────────────────────────────────────

  describe('网络错误全链路', () => {
    it('ECONNREFUSED → response has all fields correctly populated', async () => {
      const handler = vi.fn().mockRejectedValue(
        new Error('connect ECONNREFUSED 127.0.0.1:443')
      )
      const wrapped = wrapIPCHandler(handler)
      const result = await wrapped() as IPCErrorResponse

      // Verify all fields exist and are correct
      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
      expect(typeof result.error).toBe('string')
      expect(result.error.length).toBeGreaterThan(0)
      expect(result.errorDetails).toBe('connect ECONNREFUSED 127.0.0.1:443')
      expect(result.errorCategory).toBe(ErrorCategory.NETWORK)
      expect(result.retryable).toBe(true)

      // Verify the user-friendly message from classifyError appears in the error field
      const classified = classifyError(new Error('connect ECONNREFUSED 127.0.0.1:443'))
      expect(result.error).toBe(classified.message)
    })

    it('ETIMEDOUT → network, retryable, user-friendly message', async () => {
      const handler = vi.fn().mockRejectedValue(
        new Error('connect ETIMEDOUT 1.2.3.4:443')
      )
      const wrapped = wrapIPCHandler(handler)
      const result = await wrapped() as IPCErrorResponse

      expect(result.success).toBe(false)
      expect(result.errorCategory).toBe(ErrorCategory.NETWORK)
      expect(result.retryable).toBe(true)
      expect(result.errorDetails).toBe('connect ETIMEDOUT 1.2.3.4:443')

      // User-friendly message should match classifyError output
      const classified = classifyError(new Error('connect ETIMEDOUT 1.2.3.4:443'))
      expect(result.error).toBe(classified.message)
    })
  })

  // ── Rate limit (429) ──────────────────────────────────────────────────

  describe('限流错误全链路', () => {
    it('429 Too Many Requests → quota, retryable: true', async () => {
      const handler = vi.fn().mockRejectedValue(
        new Error('Error 429: Too many requests')
      )
      const wrapped = wrapIPCHandler(handler)
      const result = await wrapped() as IPCErrorResponse

      expect(result.success).toBe(false)
      expect(result.errorCategory).toBe(ErrorCategory.QUOTA)
      expect(result.retryable).toBe(true)
      expect(result.errorDetails).toBe('Error 429: Too many requests')

      const classified = classifyError(new Error('Error 429: Too many requests'))
      expect(result.error).toBe(classified.message)
    })

    it('rate_limit_exceeded → quota, retryable: true', async () => {
      const handler = vi.fn().mockRejectedValue(
        new Error('rate_limit_exceeded')
      )
      const wrapped = wrapIPCHandler(handler)
      const result = await wrapped() as IPCErrorResponse

      expect(result.success).toBe(false)
      expect(result.errorCategory).toBe(ErrorCategory.QUOTA)
      expect(result.retryable).toBe(true)
    })

    it('status 429 on Error object → quota via status fallback', async () => {
      const err = Object.assign(new Error('slow down'), { status: 429 })
      const handler = vi.fn().mockRejectedValue(err)
      const wrapped = wrapIPCHandler(handler)
      const result = await wrapped() as IPCErrorResponse

      expect(result.success).toBe(false)
      expect(result.errorCategory).toBe(ErrorCategory.QUOTA)
      expect(result.retryable).toBe(true)
    })
  })

  // ── Auth / API key error ──────────────────────────────────────────────

  describe('认证错误全链路', () => {
    it('invalid api_key → auth, retryable: false', async () => {
      const handler = vi.fn().mockRejectedValue(
        new Error('invalid api_key provided')
      )
      const wrapped = wrapIPCHandler(handler)
      const result = await wrapped() as IPCErrorResponse

      expect(result.success).toBe(false)
      expect(result.errorCategory).toBe(ErrorCategory.AUTH)
      expect(result.retryable).toBe(false)
      expect(result.errorDetails).toBe('invalid api_key provided')

      const classified = classifyError(new Error('invalid api_key provided'))
      expect(result.error).toBe(classified.message)
    })

    it('401 status code → auth via status fallback', async () => {
      const err = Object.assign(new Error('request failed'), { status: 401 })
      const handler = vi.fn().mockRejectedValue(err)
      const wrapped = wrapIPCHandler(handler)
      const result = await wrapped() as IPCErrorResponse

      expect(result.success).toBe(false)
      expect(result.errorCategory).toBe(ErrorCategory.AUTH)
      expect(result.retryable).toBe(false)
    })

    it('authentication_error → auth, not retryable', async () => {
      const handler = vi.fn().mockRejectedValue(
        new Error('authentication_error: invalid x-api-key')
      )
      const wrapped = wrapIPCHandler(handler)
      const result = await wrapped() as IPCErrorResponse

      expect(result.success).toBe(false)
      expect(result.errorCategory).toBe(ErrorCategory.AUTH)
      expect(result.retryable).toBe(false)
    })
  })

  // ── Context length ────────────────────────────────────────────────────

  describe('上下文长度错误全链路', () => {
    it('context_length_exceeded → context, not retryable', async () => {
      const handler = vi.fn().mockRejectedValue(
        new Error('context_length_exceeded')
      )
      const wrapped = wrapIPCHandler(handler)
      const result = await wrapped() as IPCErrorResponse

      expect(result.success).toBe(false)
      expect(result.errorCategory).toBe(ErrorCategory.CONTEXT)
      expect(result.retryable).toBe(false)
    })
  })

  // ── Provider errors ───────────────────────────────────────────────────

  describe('Provider 错误全链路', () => {
    it('model not found → provider, not retryable', async () => {
      const handler = vi.fn().mockRejectedValue(
        new Error('model gpt-5 not found')
      )
      const wrapped = wrapIPCHandler(handler)
      const result = await wrapped() as IPCErrorResponse

      expect(result.success).toBe(false)
      expect(result.errorCategory).toBe(ErrorCategory.PROVIDER)
      expect(result.retryable).toBe(false)
    })

    it('server overloaded → provider, retryable', async () => {
      const handler = vi.fn().mockRejectedValue(
        new Error('The server is overloaded')
      )
      const wrapped = wrapIPCHandler(handler)
      const result = await wrapped() as IPCErrorResponse

      expect(result.success).toBe(false)
      expect(result.errorCategory).toBe(ErrorCategory.PROVIDER)
      expect(result.retryable).toBe(true)
    })

    it('500 status code → provider via status fallback', async () => {
      const err = Object.assign(new Error('internal server error'), { status: 500 })
      const handler = vi.fn().mockRejectedValue(err)
      const wrapped = wrapIPCHandler(handler)
      const result = await wrapped() as IPCErrorResponse

      expect(result.success).toBe(false)
      expect(result.errorCategory).toBe(ErrorCategory.PROVIDER)
      expect(result.retryable).toBe(true)
    })
  })

  // ── Unknown / fallback ────────────────────────────────────────────────

  describe('未知错误全链路', () => {
    it('unknown error → internal, retryable: false, fallback message', async () => {
      const handler = vi.fn().mockRejectedValue(
        new Error('something completely unexpected')
      )
      const wrapped = wrapIPCHandler(handler)
      const result = await wrapped() as IPCErrorResponse

      expect(result.success).toBe(false)
      expect(result.errorCategory).toBe(ErrorCategory.INTERNAL)
      expect(result.retryable).toBe(false)
      expect(result.errorDetails).toBe('something completely unexpected')

      // Verify fallback user-friendly message
      const classified = classifyError(new Error('something completely unexpected'))
      expect(result.error).toBe(classified.message)
    })
  })

  // ── Nested error cause ────────────────────────────────────────────────

  describe('嵌套 cause 错误全链路', () => {
    it('error with nested cause containing ECONNREFUSED → network', async () => {
      const cause = new Error('ECONNREFUSED 127.0.0.1:443')
      const err = Object.assign(new Error('fetch failed'), { cause })
      const handler = vi.fn().mockRejectedValue(err)
      const wrapped = wrapIPCHandler(handler)
      const result = await wrapped() as IPCErrorResponse

      expect(result.success).toBe(false)
      expect(result.errorCategory).toBe(ErrorCategory.NETWORK)
      expect(result.retryable).toBe(true)
    })
  })

  // ── Handler arguments forwarded ───────────────────────────────────────

  describe('Handler 参数透传', () => {
    it('IPC event and args are forwarded to the handler before error', async () => {
      const handler = vi.fn().mockImplementation(async (_event: any, data: any) => {
        if (data.sessionId === 'bad-session') {
          throw new Error('rate_limit_exceeded')
        }
        return { success: true }
      })
      const wrapped = wrapIPCHandler(handler)

      // Error path: arguments still forwarded
      const errorResult = await wrapped('event', { sessionId: 'bad-session' }) as IPCErrorResponse
      expect(errorResult.success).toBe(false)
      expect(errorResult.errorCategory).toBe(ErrorCategory.QUOTA)
      expect(handler).toHaveBeenCalledWith('event', { sessionId: 'bad-session' })

      // Success path: normal passthrough
      const successResult = await wrapped('event', { sessionId: 'good-session' })
      expect(successResult).toEqual({ success: true })
    })
  })

  // ── Consistency: wrapIPCHandler output matches classifyError ──────────

  describe('wrapIPCHandler 与 classifyError 一致性', () => {
    const errorCases = [
      { name: 'network', error: new Error('Failed to fetch') },
      { name: 'auth', error: new Error('invalid api_key') },
      { name: 'quota', error: new Error('rate_limit_exceeded') },
      { name: 'context', error: new Error('context_length_exceeded') },
      { name: 'provider', error: new Error('model not found') },
      { name: 'internal', error: new Error('random unknown error xyz') },
    ]

    for (const { name, error } of errorCases) {
      it(`${name}: IPCErrorResponse.error matches classifyError().message`, async () => {
        const classified = classifyError(error)
        const handler = vi.fn().mockRejectedValue(error)
        const wrapped = wrapIPCHandler(handler)
        const result = await wrapped() as IPCErrorResponse

        expect(result.error).toBe(classified.message)
        expect(result.errorCategory).toBe(classified.category)
        expect(result.retryable).toBe(classified.retryable)
      })
    }
  })
})
