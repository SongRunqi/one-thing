import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  embedOnethingTexts,
  type OnethingEmbeddingAppSettingsLike,
} from '../index.js'

function settingsWithEmbeddings(
  embeddings: NonNullable<NonNullable<OnethingEmbeddingAppSettingsLike['general']['soulMemory']>['embeddings']>,
): OnethingEmbeddingAppSettingsLike {
  return {
    ai: {
      providers: {
        openai: {
          apiKey: 'openai-key',
          baseUrl: 'https://openai.test/v1/',
        },
        gemini: {
          apiKey: 'gemini-key',
          baseUrl: 'https://gemini.test/v1beta',
        },
        openrouter: {
          apiKey: 'openrouter-key',
          baseUrl: 'https://openrouter.test/api/v1',
        },
      },
      customProviders: [],
    },
    general: {
      soulMemory: {
        embeddings,
        logging: undefined,
      },
    },
  }
}

describe('onething runtime embeddings', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
  })

  it('embeds OpenAI-compatible inputs through the REST API', async () => {
    const settings = settingsWithEmbeddings({
      providerId: 'openai',
      model: 'text-embedding-3-small',
      dimensions: 3,
    })
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      data: [
        { index: 1, embedding: [4, 5, 6] },
        { index: 0, embedding: [1, 2, 3] },
      ],
    }), { status: 200 }))

    const result = await embedOnethingTexts({
      settings,
      values: [' first ', '', 'second'],
    }, {
      createFetch: () => fetchMock as unknown as typeof fetch,
    })

    expect(result).toEqual({
      vectors: [[1, 2, 3], [4, 5, 6]],
      providerId: 'openai',
      model: 'text-embedding-3-small',
    })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://openai.test/v1/embeddings')
    expect(init.headers.Authorization).toBe('Bearer openai-key')
    expect(JSON.parse(init.body)).toEqual({
      model: 'text-embedding-3-small',
      input: ['first', 'second'],
      dimensions: 3,
    })
  })

  it('embeds Gemini inputs through batchEmbedContents', async () => {
    const settings = settingsWithEmbeddings({
      providerId: 'gemini',
      model: 'gemini-embedding-001',
      dimensions: 768,
    })
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      embeddings: [
        { values: [0.1, 0.2] },
        { values: [0.3, 0.4] },
      ],
    }), { status: 200 }))

    const result = await embedOnethingTexts({
      settings,
      values: ['alpha', 'beta'],
    }, {
      createFetch: () => fetchMock as unknown as typeof fetch,
    })

    expect(result).toEqual({
      vectors: [[0.1, 0.2], [0.3, 0.4]],
      providerId: 'gemini',
      model: 'gemini-embedding-001',
    })
    const [url, init] = fetchMock.mock.calls[0]
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
    }]
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      data: [{ embedding: [9, 8, 7] }],
    }), { status: 200 }))

    const result = await embedOnethingTexts({
      settings,
      values: ['custom text'],
    }, {
      createFetch: () => fetchMock as unknown as typeof fetch,
    })

    expect(result).toEqual({
      vectors: [[9, 8, 7]],
      providerId: 'custom-embed',
      model: 'custom-embedding',
    })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://custom.test/v1/embeddings')
    expect(init.headers.Authorization).toBe('Bearer custom-key')
  })
})
