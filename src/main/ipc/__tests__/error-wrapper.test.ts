/**
 * IPC Error Wrapper Tests
 * REQ-007: Tests for wrapIPCHandler() higher-order function
 */

import { describe, it, expect, vi } from 'vitest'
import { wrapIPCHandler, type IPCErrorResponse } from '../error-wrapper'
import { ErrorCategory } from '@shared/errors'

describe('wrapIPCHandler', () => {
  // ── Success passthrough ─────────────────────────────────────────────────

  describe('正常返回透传', () => {
    it('passes through the handler return value unchanged', async () => {
      const handler = vi.fn().mockResolvedValue({ success: true, data: [1, 2, 3] })
      const wrapped = wrapIPCHandler(handler)

      const result = await wrapped('arg1', 'arg2')

      expect(result).toEqual({ success: true, data: [1, 2, 3] })
      expect(handler).toHaveBeenCalledWith('arg1', 'arg2')
    })

    it('passes through undefined return', async () => {
      const handler = vi.fn().mockResolvedValue(undefined)
      const wrapped = wrapIPCHandler(handler)

      const result = await wrapped()

      expect(result).toBeUndefined()
    })

    it('passes through null return', async () => {
      const handler = vi.fn().mockResolvedValue(null)
      const wrapped = wrapIPCHandler(handler)

      const result = await wrapped()

      expect(result).toBeNull()
    })
  })

  // ── Error handling ──────────────────────────────────────────────────────

  describe('Error 对象抛出', () => {
    it('catches Error and returns IPCErrorResponse with classification', async () => {
      const handler = vi.fn().mockRejectedValue(new Error('ECONNREFUSED 127.0.0.1:443'))
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const wrapped = wrapIPCHandler(handler)

      const result = await wrapped() as IPCErrorResponse

      expect(result.success).toBe(false)
      expect(result.errorCategory).toBe(ErrorCategory.NETWORK)
      expect(result.retryable).toBe(true)
      expect(result.errorDetails).toBe('ECONNREFUSED 127.0.0.1:443')
      expect(result.error).toBeDefined() // user-friendly message
      expect(typeof result.error).toBe('string')

      consoleSpy.mockRestore()
    })

    it('catches auth error and returns non-retryable response', async () => {
      const handler = vi.fn().mockRejectedValue(new Error('invalid api_key'))
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const wrapped = wrapIPCHandler(handler)

      const result = await wrapped() as IPCErrorResponse

      expect(result.success).toBe(false)
      expect(result.errorCategory).toBe(ErrorCategory.AUTH)
      expect(result.retryable).toBe(false)

      consoleSpy.mockRestore()
    })
  })

  describe('string 抛出', () => {
    it('catches thrown string and classifies it', async () => {
      const handler = vi.fn().mockRejectedValue('rate_limit_exceeded')
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const wrapped = wrapIPCHandler(handler)

      const result = await wrapped() as IPCErrorResponse

      expect(result.success).toBe(false)
      expect(result.errorCategory).toBe(ErrorCategory.QUOTA)
      expect(result.retryable).toBe(true)
      expect(result.errorDetails).toBe('rate_limit_exceeded')

      consoleSpy.mockRestore()
    })
  })

  describe('unknown 抛出', () => {
    it('catches unknown value and falls back to internal', async () => {
      const handler = vi.fn().mockRejectedValue(12345)
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const wrapped = wrapIPCHandler(handler)

      const result = await wrapped() as IPCErrorResponse

      expect(result.success).toBe(false)
      expect(result.errorCategory).toBe(ErrorCategory.INTERNAL)
      expect(result.retryable).toBe(false)
      expect(result.errorDetails).toBe('12345')

      consoleSpy.mockRestore()
    })

    it('catches null throw and falls back to internal', async () => {
      const handler = vi.fn().mockRejectedValue(null)
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const wrapped = wrapIPCHandler(handler)

      const result = await wrapped() as IPCErrorResponse

      expect(result.success).toBe(false)
      expect(result.errorCategory).toBe(ErrorCategory.INTERNAL)

      consoleSpy.mockRestore()
    })
  })

  // ── Logging ─────────────────────────────────────────────────────────────

  describe('错误日志', () => {
    it('logs error with category prefix', async () => {
      const handler = vi.fn().mockRejectedValue(new Error('insufficient_quota'))
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const wrapped = wrapIPCHandler(handler)

      await wrapped()

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[IPC]')
      )
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[quota]')
      )

      consoleSpy.mockRestore()
    })
  })

  // ── Arguments forwarding ────────────────────────────────────────────────

  describe('参数转发', () => {
    it('forwards all arguments to the wrapped handler', async () => {
      const handler = vi.fn().mockResolvedValue('ok')
      const wrapped = wrapIPCHandler(handler)

      await wrapped('event', { sessionId: 's1' }, 'extra')

      expect(handler).toHaveBeenCalledWith('event', { sessionId: 's1' }, 'extra')
    })
  })
})
