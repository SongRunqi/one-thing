import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  resolveAgentLoopStreamRoute,
  shouldUseAgentLoopStream,
} from '../agent-loop-selection.js'

describe('agent loop stream selection', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('keeps the route inactive by default even for supported providers', () => {
    const route = resolveAgentLoopStreamRoute({ providerId: 'deepseek' })

    expect(route.enabled).toBe(false)
    expect(route.enabledBy).toBe('off')
    expect(route.providerSupported).toBe(true)
    expect(route.active).toBe(false)
    expect(route.supportedProviderIds).toEqual(expect.arrayContaining(['deepseek', 'acp']))
    expect(shouldUseAgentLoopStream({ providerId: 'deepseek' })).toBe(false)
  })

  it('activates supported providers when enabled from settings', () => {
    const route = resolveAgentLoopStreamRoute({
      providerId: 'deepseek',
      settings: { chat: { agentLoopStream: true } },
    })

    expect(route.enabled).toBe(true)
    expect(route.enabledBy).toBe('settings')
    expect(route.providerSupported).toBe(true)
    expect(route.active).toBe(true)
    expect(shouldUseAgentLoopStream({
      providerId: 'deepseek',
      settings: { chat: { agentLoopStream: true } },
    })).toBe(true)
  })

  it('allows the environment flag to activate supported providers', () => {
    vi.stubEnv('ONETHING_AGENT_LOOP_STREAM', '1')

    const route = resolveAgentLoopStreamRoute({ providerId: 'acp' })

    expect(route.enabled).toBe(true)
    expect(route.enabledBy).toBe('env')
    expect(route.providerSupported).toBe(true)
    expect(route.active).toBe(true)
  })

  it('does not activate unsupported providers even when enabled', () => {
    const route = resolveAgentLoopStreamRoute({
      providerId: 'openai',
      settings: { chat: { agentLoopStream: true } },
    })

    expect(route.enabled).toBe(true)
    expect(route.enabledBy).toBe('settings')
    expect(route.providerSupported).toBe(false)
    expect(route.active).toBe(false)
    expect(shouldUseAgentLoopStream({
      providerId: 'openai',
      settings: { chat: { agentLoopStream: true } },
    })).toBe(false)
  })
})
