import { describe, expect, it, vi } from 'vitest'
import type { AgentProvider } from '@onething/core/agent-loop'
import {
  createOnethingDeepSeekAgentRuntimeProvider,
  createOnethingUtilityAgentProvider,
  isOnethingACPProviderRuntime,
  isOnethingDeepSeekProviderRuntime,
  resolveOnethingProviderRuntimeRoute,
} from '../agent-runtime-route.js'

const fakeProvider = { id: 'fake' } as AgentProvider

describe('onething provider runtime route', () => {
  it('classifies reserved ACP and DeepSeek provider runtimes', () => {
    expect(isOnethingACPProviderRuntime('acp')).toBe(true)
    expect(isOnethingACPProviderRuntime('openai')).toBe(false)
    expect(isOnethingDeepSeekProviderRuntime('deepseek')).toBe(true)
    expect(isOnethingDeepSeekProviderRuntime('custom-openai')).toBe(false)
  })

  it('creates only utility providers for non-reserved ids', () => {
    const createAgentProvider = vi.fn(() => fakeProvider)

    expect(createOnethingUtilityAgentProvider('acp', { model: 'local' }, { createAgentProvider })).toBeUndefined()
    expect(createOnethingUtilityAgentProvider('deepseek', { model: 'deepseek-chat' }, { createAgentProvider })).toBeUndefined()
    expect(createOnethingUtilityAgentProvider('openai', {
      apiKey: 'key',
      baseUrl: 'https://api.test',
      model: 'gpt-test',
    }, { createAgentProvider })).toBe(fakeProvider)

    expect(createAgentProvider).toHaveBeenCalledTimes(1)
    expect(createAgentProvider).toHaveBeenCalledWith('openai', {
      apiKey: 'key',
      baseUrl: 'https://api.test',
      model: 'gpt-test',
      apiType: undefined,
      oauthToken: undefined,
      authContext: undefined,
      modelCapabilitiesByModel: undefined,
      models: undefined,
    })
  })

  it('resolves route kinds and fails fast when DeepSeek runtime is missing', () => {
    const createAgentProvider = vi.fn((providerId: string) => providerId === 'openai' ? fakeProvider : undefined)
    const adapters = { createAgentProvider }

    expect(resolveOnethingProviderRuntimeRoute('acp', { model: 'local' }, adapters)).toEqual({ kind: 'acp' })
    expect(resolveOnethingProviderRuntimeRoute('deepseek', { model: 'deepseek-chat' }, adapters)).toEqual({ kind: 'deepseek' })
    expect(resolveOnethingProviderRuntimeRoute('openai', { model: 'gpt-test' }, adapters)).toEqual({
      kind: 'agent',
      provider: fakeProvider,
    })
    expect(resolveOnethingProviderRuntimeRoute('missing', { model: 'none' }, adapters)).toEqual({ kind: 'unsupported' })

    expect(() => createOnethingDeepSeekAgentRuntimeProvider({ model: 'deepseek-chat' }, adapters))
      .toThrow('DeepSeek AgentProvider runtime is not registered')
  })
})
