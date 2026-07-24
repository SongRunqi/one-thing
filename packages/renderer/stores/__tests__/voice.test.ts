// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { VoiceEvent, VoiceLatencyMilestone } from '@/types'

describe('voice store', () => {
  beforeEach(() => {
    vi.resetModules()
    setActivePinia(createPinia())
  })

  it('keeps streaming latency milestones for UI/debug surfaces', async () => {
    vi.doMock('../sessions', () => ({
      useSessionsStore: () => ({ currentSessionId: 'session-1' }),
    }))
    let voiceEventHandler: ((event: VoiceEvent) => void) | null = null
    ;(window as any).electronAPI = {
      voiceGetState: vi.fn(async () => ({
        success: true,
        state: {
          status: 'idle',
          enabled: true,
          runtimeReady: true,
          updatedAt: 1,
        },
      })),
      onVoiceEvent: vi.fn((handler: (event: VoiceEvent) => void) => {
        voiceEventHandler = handler
        return vi.fn()
      }),
      onSessionEvent: vi.fn(() => vi.fn()),
      voiceStart: vi.fn(),
      voiceStop: vi.fn(),
    }

    const { useVoiceStore } = await import('../voice')
    const store = useVoiceStore()
    await store.initialize()
    const emitVoiceEvent = voiceEventHandler as unknown as (event: VoiceEvent) => void

    const milestone: VoiceLatencyMilestone = {
      name: 'tts-first-audio-chunk',
      at: 1000,
      elapsedMs: 120,
      requestId: 'tts-1',
      provider: 'openrouter-tts',
      model: 'openai/gpt-4o-mini-tts-2025-12-15',
    }
    emitVoiceEvent({ type: 'latency-milestone', milestone })

    expect(store.lastMilestone).toEqual(milestone)
    expect(store.milestones).toEqual([milestone])

    emitVoiceEvent({
      type: 'state',
      state: {
        ...store.state,
        lastMilestone: milestone,
      },
    })
    expect(store.milestones).toEqual([milestone])
  })
})
