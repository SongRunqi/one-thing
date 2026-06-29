import { describe, expect, it, vi } from 'vitest'
import { CoreSoulMemoryActiveMemoryRuntime } from '../../plugins/index.js'
import { runMemoryActiveMemoryRecall } from '../active-memory.js'
import type {
  ResolvedSoulMemorySettings,
  SearchHit,
} from '../types.js'

function makeSettings(overrides: Partial<ResolvedSoulMemorySettings> = {}): ResolvedSoulMemorySettings {
  return {
    enabled: true,
    activeMemory: {
      enabled: true,
      queryMode: 'message',
      promptStyle: 'balanced',
      timeoutMs: 1000,
      cacheTtlMs: 1000,
      maxSummaryChars: 1000,
      recentUserTurns: 3,
      recentAssistantTurns: 3,
      recentUserChars: 1000,
      recentAssistantChars: 1000,
      circuitBreakerMaxTimeouts: 3,
      circuitBreakerCooldownMs: 1000,
    },
    search: {
      maxResults: 2,
    },
    ...overrides,
  } as ResolvedSoulMemorySettings
}

function makeHit(content: string): SearchHit {
  return {
    id: 'memory-1',
    path: 'MEMORY.md',
    kind: 'memory',
    chunkIndex: 0,
    startLine: 1,
    endLine: 1,
    content,
    score: 0.9,
  }
}

describe('runtime active memory recall', () => {
  it('uses search hits directly when no filter provider is available', async () => {
    const search = vi.fn(() => [
      makeHit('Gateway should call the onething runtime instead of owning an AgentEngine.'),
    ])
    const generateFilter = vi.fn()

    const result = await runMemoryActiveMemoryRecall({
      sessionId: 'session-active-1',
      agentId: 'default',
      messages: [
        { role: 'user', content: 'How should gateway connect to onething?' },
      ],
      settings: makeSettings(),
      runtime: new CoreSoulMemoryActiveMemoryRuntime(),
      search,
      resolveProvider: () => null,
      providerId: () => undefined,
      providerModel: () => undefined,
      generateFilter,
      logger: {},
    })

    expect(search).toHaveBeenCalledWith(expect.objectContaining({ limit: 2 }))
    expect(generateFilter).not.toHaveBeenCalled()
    expect(result).toContain('Gateway should call the onething runtime')
  })

  it('does not search when active memory is disabled', async () => {
    const search = vi.fn(() => [makeHit('unused')])

    const result = await runMemoryActiveMemoryRecall({
      sessionId: 'session-active-disabled',
      agentId: 'default',
      messages: [
        { role: 'user', content: 'Will this search?' },
      ],
      settings: makeSettings({ enabled: false }),
      runtime: new CoreSoulMemoryActiveMemoryRuntime(),
      search,
      resolveProvider: () => null,
      providerId: () => undefined,
      providerModel: () => undefined,
      generateFilter: () => 'unused',
      logger: {},
    })

    expect(result).toBeNull()
    expect(search).not.toHaveBeenCalled()
  })
})
