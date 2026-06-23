import { describe, expect, it } from 'vitest'
import {
  createAgentProviderFromRuntime,
  getSupportedAgentProviderRuntimeIds,
  isAgentProviderRuntimeSupported,
  registerAgentProviderRuntime,
} from '../providers/factory.js'

describe('agent provider runtime factory', () => {
  it('creates supported agent providers from runtime config', () => {
    const deepseek = createAgentProviderFromRuntime('deepseek', {
      apiKey: 'key',
      baseUrl: 'https://example.test',
    }, {
      fetchImpl: async () => new Response('') as any,
    })
    const acp = createAgentProviderFromRuntime('acp', {}, {
      workingDirectory: '/tmp/work',
      localSessionId: 'session-1',
    })
    const codex = createAgentProviderFromRuntime('codex', {
      apiKey: 'access-token',
      baseUrl: 'https://chatgpt.test/backend-api/codex',
    }, {
      fetchImpl: async () => new Response('') as any,
    })
    const openai = createAgentProviderFromRuntime('openai', {
      apiKey: 'key',
      baseUrl: 'https://openai.test/v1',
    }, {
      fetchImpl: async () => new Response('') as any,
    })
    const kimi = createAgentProviderFromRuntime('kimi', {
      apiKey: 'key',
      baseUrl: 'https://kimi.test/v1',
    }, {
      fetchImpl: async () => new Response('') as any,
    })

    expect(isAgentProviderRuntimeSupported('deepseek')).toBe(true)
    expect(isAgentProviderRuntimeSupported('acp')).toBe(true)
    expect(isAgentProviderRuntimeSupported('codex')).toBe(true)
    expect(isAgentProviderRuntimeSupported('openai')).toBe(true)
    expect(isAgentProviderRuntimeSupported('kimi')).toBe(true)
    expect(isAgentProviderRuntimeSupported('zhipu')).toBe(true)
    expect(isAgentProviderRuntimeSupported('openrouter')).toBe(true)
    expect(getSupportedAgentProviderRuntimeIds()).toEqual(expect.arrayContaining([
      'deepseek',
      'codex',
      'openai',
      'openrouter',
      'kimi',
      'zhipu',
      'acp',
    ]))
    expect(deepseek?.id).toBe('deepseek')
    expect(codex?.id).toBe('codex')
    expect(openai?.id).toBe('openai')
    expect(kimi?.id).toBe('kimi')
    expect(acp?.id).toBe('acp')
    expect(createAgentProviderFromRuntime('claude', {})).toBeUndefined()
  })

  it('allows additional provider runtimes to register without changing the factory', () => {
    const unregister = registerAgentProviderRuntime('custom-agent', config => ({
      id: `custom-agent:${config.model ?? 'default'}`,
      capabilities: {
        capabilities: ['text-input', 'text-output'],
        inputModalities: ['text'],
        outputModalities: ['text'],
      },
    }))

    try {
      expect(isAgentProviderRuntimeSupported('custom-agent')).toBe(true)
      expect(createAgentProviderFromRuntime('custom-agent', { model: 'm1' })?.id)
        .toBe('custom-agent:m1')
      expect(() => registerAgentProviderRuntime('custom-agent', () => ({ id: 'duplicate' })))
        .toThrow('Agent provider runtime already registered: custom-agent')
    } finally {
      unregister()
    }

    expect(isAgentProviderRuntimeSupported('custom-agent')).toBe(false)
  })
})
