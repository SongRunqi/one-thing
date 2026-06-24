import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AIProvider, type AppSettings } from '../../../shared/ipc.js'
import { createDefaultSettings } from '../../../shared/defaults/settings.js'

const { fetchHolder, aiSdkMocks } = vi.hoisted(() => ({
  fetchHolder: {
    current: vi.fn(),
  },
  aiSdkMocks: {
    embedMany: vi.fn(() => {
      throw new Error('AI SDK embedMany should not be called')
    }),
    createOpenAI: vi.fn(() => {
      throw new Error('@ai-sdk/openai should not be called')
    }),
    createOpenAICompatible: vi.fn(() => {
      throw new Error('@ai-sdk/openai-compatible should not be called')
    }),
    createGoogleGenerativeAI: vi.fn(() => {
      throw new Error('@ai-sdk/google should not be called')
    }),
  },
}))

vi.mock('ai', () => ({
  embedMany: aiSdkMocks.embedMany,
}))

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: aiSdkMocks.createOpenAI,
}))

vi.mock('@ai-sdk/openai-compatible', () => ({
  createOpenAICompatible: aiSdkMocks.createOpenAICompatible,
}))

vi.mock('@ai-sdk/google', () => ({
  createGoogleGenerativeAI: aiSdkMocks.createGoogleGenerativeAI,
}))

vi.mock('../../providers/bound-fetch.js', () => ({
  createBoundFetch: () => fetchHolder.current,
}))

vi.mock('../../memory/diagnostics-logger.js', () => ({
  configureMemoryDiagnosticsLogger: vi.fn(),
  createMemoryDiagnosticsFetch: (fetchImpl: typeof globalThis.fetch) => fetchImpl,
  logMemoryDiagnostic: vi.fn(),
  sanitizeUrlForMemoryLog: (url: string) => url,
}))

import { embedTexts } from '../index.js'

function settingsWithEmbeddings(patch: NonNullable<AppSettings['general']['soulMemory']>['embeddings']): AppSettings {
  const settings = createDefaultSettings()
  settings.general.soulMemory = {
    ...settings.general.soulMemory,
    embeddings: {
      ...settings.general.soulMemory?.embeddings,
      ...patch,
    },
  }
  return settings
}

describe('native embeddings', () => {
  beforeEach(() => {
    fetchHolder.current = vi.fn()
    vi.clearAllMocks()
  })

  it('embeds OpenAI-compatible inputs through the REST API without the AI SDK', async () => {
    const settings = settingsWithEmbeddings({
      providerId: 'openai',
      model: 'text-embedding-3-small',
      dimensions: 3,
    })
    settings.ai.providers[AIProvider.OpenAI].apiKey = 'openai-key'
    settings.ai.providers[AIProvider.OpenAI].baseUrl = 'https://openai.test/v1/'

    fetchHolder.current.mockResolvedValueOnce(new Response(JSON.stringify({
      data: [
        { index: 1, embedding: [4, 5, 6] },
        { index: 0, embedding: [1, 2, 3] },
      ],
    }), { status: 200 }))

    const result = await embedTexts({
      settings,
      values: [' first ', '', 'second'],
    })

    expect(result).toEqual({
      vectors: [[1, 2, 3], [4, 5, 6]],
      providerId: 'openai',
      model: 'text-embedding-3-small',
    })
    expect(aiSdkMocks.embedMany).not.toHaveBeenCalled()
    expect(aiSdkMocks.createOpenAI).not.toHaveBeenCalled()
    expect(fetchHolder.current).toHaveBeenCalledTimes(1)

    const [url, init] = fetchHolder.current.mock.calls[0]
    expect(url).toBe('https://openai.test/v1/embeddings')
    expect(init.headers.Authorization).toBe('Bearer openai-key')
    expect(JSON.parse(init.body)).toEqual({
      model: 'text-embedding-3-small',
      input: ['first', 'second'],
      dimensions: 3,
    })
  })

  it('embeds Gemini inputs through batchEmbedContents without the AI SDK', async () => {
    const settings = settingsWithEmbeddings({
      providerId: 'gemini',
      model: 'gemini-embedding-001',
      dimensions: 768,
    })
    settings.ai.providers[AIProvider.Gemini].apiKey = 'gemini-key'
    settings.ai.providers[AIProvider.Gemini].baseUrl = 'https://gemini.test/v1beta'

    fetchHolder.current.mockResolvedValueOnce(new Response(JSON.stringify({
      embeddings: [
        { values: [0.1, 0.2] },
        { values: [0.3, 0.4] },
      ],
    }), { status: 200 }))

    const result = await embedTexts({
      settings,
      values: ['alpha', 'beta'],
    })

    expect(result).toEqual({
      vectors: [[0.1, 0.2], [0.3, 0.4]],
      providerId: 'gemini',
      model: 'gemini-embedding-001',
    })
    expect(aiSdkMocks.embedMany).not.toHaveBeenCalled()
    expect(aiSdkMocks.createGoogleGenerativeAI).not.toHaveBeenCalled()
    expect(fetchHolder.current).toHaveBeenCalledTimes(1)

    const [url, init] = fetchHolder.current.mock.calls[0]
    expect(url).toBe('https://gemini.test/v1beta/models/gemini-embedding-001:batchEmbedContents')
    expect(init.headers['x-goog-api-key']).toBe('gemini-key')
    expect(JSON.parse(init.body)).toEqual({
      requests: [
        {
          model: 'models/gemini-embedding-001',
          content: { parts: [{ text: 'alpha' }] },
        },
        {
          model: 'models/gemini-embedding-001',
          content: { parts: [{ text: 'beta' }] },
        },
      ],
    })
  })

  it('embeds custom OpenAI-compatible providers through their configured endpoint', async () => {
    const settings = settingsWithEmbeddings({
      providerId: 'custom',
      customProviderId: 'custom-embed',
      model: 'custom-embedding',
    })
    settings.ai.customProviders = [{
      id: 'custom-embed',
      name: 'Custom Embed',
      apiType: 'openai',
      apiKey: 'custom-key',
      baseUrl: 'https://custom.test/v1',
      model: 'custom-embedding',
      selectedModels: ['custom-embedding'],
    }]

    fetchHolder.current.mockResolvedValueOnce(new Response(JSON.stringify({
      data: [{ embedding: [9, 8, 7] }],
    }), { status: 200 }))

    const result = await embedTexts({
      settings,
      values: ['custom text'],
    })

    expect(result).toEqual({
      vectors: [[9, 8, 7]],
      providerId: 'custom-embed',
      model: 'custom-embedding',
    })
    expect(aiSdkMocks.createOpenAICompatible).not.toHaveBeenCalled()

    const [url, init] = fetchHolder.current.mock.calls[0]
    expect(url).toBe('https://custom.test/v1/embeddings')
    expect(init.headers.Authorization).toBe('Bearer custom-key')
  })
})
