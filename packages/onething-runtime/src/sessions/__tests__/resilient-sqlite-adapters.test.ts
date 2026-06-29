import { describe, expect, it, vi } from 'vitest'
import { createOnethingResilientSessionSqliteAdapters } from '../resilient-sqlite-adapters.js'

interface TestSession {
  id: string
}

interface TestMessage {
  id: string
}

interface TestMeta {
  id: string
  name: string
  createdAt: number
  updatedAt: number
}

interface TestDetails extends TestMeta {
  messageCount?: number
}

interface TestMarker {
  id: string
  seq: number
  timestamp: number
  preview: string
}

describe('createOnethingResilientSessionSqliteAdapters', () => {
  it('returns JSON fallback values without touching SQLite when disabled', () => {
    const getSessionDetails = vi.fn(() => ({ id: 's1', name: 'SQLite', createdAt: 1, updatedAt: 2 }))
    const syncMessage = vi.fn()
    const adapters = createOnethingResilientSessionSqliteAdapters<
      TestSession,
      TestMessage,
      TestMeta,
      TestDetails,
      TestMarker
    >({
      adapters: {
        getSessionDetails,
        isSessionReady: () => true,
        syncMessage,
      },
      isEnabled: () => false,
    })

    expect(adapters.getSessionDetails?.('s1')).toBeUndefined()
    expect(adapters.isSessionReady?.('s1')).toBe(false)
    adapters.syncMessage?.('s1', { id: 'm1' }, 1)
    expect(getSessionDetails).not.toHaveBeenCalled()
    expect(syncMessage).not.toHaveBeenCalled()
    expect(adapters.isDisabled()).toBe(false)
  })

  it('disables all following SQLite operations after the first failure', () => {
    const error = new Error('native sqlite unavailable')
    const getMessagesPage = vi.fn(() => {
      throw error
    })
    const syncFullSession = vi.fn()
    const onDisable = vi.fn()

    const adapters = createOnethingResilientSessionSqliteAdapters<
      TestSession,
      TestMessage,
      TestMeta,
      TestDetails,
      TestMarker
    >({
      adapters: {
        getMessagesPage,
        syncFullSession,
      },
      onDisable,
    })

    expect(adapters.getMessagesPage?.({ sessionId: 's1', anchor: 'tail', limit: 10 })).toBeUndefined()
    expect(adapters.isDisabled()).toBe(true)
    expect(onDisable).toHaveBeenCalledWith('message page load', error)

    adapters.syncFullSession?.({ id: 's1' })
    expect(syncFullSession).not.toHaveBeenCalled()

    adapters.resetDisabled()
    adapters.syncFullSession?.({ id: 's1' })
    expect(syncFullSession).toHaveBeenCalledWith({ id: 's1' })
  })
})
