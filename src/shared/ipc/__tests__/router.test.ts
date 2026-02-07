import { describe, it, expect } from 'vitest'
import { defineRouter, getChannelName } from '../router'

describe('IPC Router', () => {
  describe('getChannelName()', () => {
    it('should convert camelCase method to kebab-case channel', () => {
      expect(getChannelName('memory-feedback', 'getStats')).toBe('memory-feedback:get-stats')
    })

    it('should keep lowercase method names unchanged', () => {
      expect(getChannelName('memory-feedback', 'record')).toBe('memory-feedback:record')
    })

    it('should handle multiple uppercase letters', () => {
      expect(getChannelName('sessions', 'getTokenUsage')).toBe('sessions:get-token-usage')
    })

    it('should handle single-word methods', () => {
      expect(getChannelName('oauth', 'start')).toBe('oauth:start')
    })
  })

  describe('defineRouter()', () => {
    type TestRoutes = {
      getAll: { input: void; output: string[] }
      create: { input: { name: string }; output: { id: string } }
      deleteById: { input: { id: string }; output: void }
    }

    const router = defineRouter<TestRoutes>('test-domain', ['getAll', 'create', 'deleteById'])

    it('should set the domain name', () => {
      expect(router.domain).toBe('test-domain')
    })

    it('should generate correct channel names', () => {
      expect(router.channels.getAll).toBe('test-domain:get-all')
      expect(router.channels.create).toBe('test-domain:create')
      expect(router.channels.deleteById).toBe('test-domain:delete-by-id')
    })

    it('should store method names', () => {
      expect(router.methods).toEqual(['getAll', 'create', 'deleteById'])
    })

    it('should freeze the returned object', () => {
      expect(Object.isFrozen(router)).toBe(true)
      expect(Object.isFrozen(router.channels)).toBe(true)
      expect(Object.isFrozen(router.methods)).toBe(true)
    })
  })

  describe('backward compatibility', () => {
    it('should generate channels matching existing IPC_CHANNELS for memory-feedback', () => {
      type MemoryFeedbackRoutes = {
        record: { input: { filePath: string; feedbackType: string }; output: { success: boolean } }
        getStats: { input: { filePath: string }; output: { success: boolean } }
      }
      const router = defineRouter<MemoryFeedbackRoutes>('memory-feedback', ['record', 'getStats'])

      // These must match the values in channels.ts
      expect(router.channels.record).toBe('memory-feedback:record')
      expect(router.channels.getStats).toBe('memory-feedback:get-stats')
    })
  })
})
