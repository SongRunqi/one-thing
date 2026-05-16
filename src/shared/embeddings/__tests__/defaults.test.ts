import { describe, expect, it } from 'vitest'
import {
  GEMINI_EMBEDDING_DEFAULT_BASE_URL,
  GEMINI_EMBEDDING_DEFAULT_MODEL,
  OPENAI_EMBEDDING_DEFAULT_BASE_URL,
  OPENAI_EMBEDDING_DEFAULT_MODEL,
  OPENROUTER_EMBEDDING_DEFAULT_BASE_URL,
  OPENROUTER_EMBEDDING_DEFAULT_MODEL,
  resolveSoulMemoryEmbeddingTarget,
} from '../defaults.js'

describe('soul-memory embedding defaults', () => {
  it('uses explicit OpenAI defaults when no overrides are set', () => {
    const target = resolveSoulMemoryEmbeddingTarget({
      providerId: 'openai',
      providers: {
        openai: { apiKey: 'sk-test' },
      },
    })

    expect(target.providerKind).toBe('openai')
    expect(target.model).toBe(OPENAI_EMBEDDING_DEFAULT_MODEL)
    expect(target.baseUrl).toBe(OPENAI_EMBEDDING_DEFAULT_BASE_URL)
    expect(target.available).toBe(true)
  })

  it('uses an embedding model default for OpenRouter instead of the chat model', () => {
    const target = resolveSoulMemoryEmbeddingTarget({
      providerId: 'openrouter',
      providers: {
        openrouter: { apiKey: 'sk-or', model: 'openai/gpt-4o' },
      },
    })

    expect(target.model).toBe(OPENROUTER_EMBEDDING_DEFAULT_MODEL)
    expect(target.baseUrl).toBe(OPENROUTER_EMBEDDING_DEFAULT_BASE_URL)
  })

  it('auto-resolves to Gemini with the current Gemini embedding default', () => {
    const target = resolveSoulMemoryEmbeddingTarget({
      providerId: 'auto',
      providers: {
        gemini: { apiKey: 'gemini-key' },
      },
    })

    expect(target.providerKind).toBe('gemini')
    expect(target.model).toBe(GEMINI_EMBEDDING_DEFAULT_MODEL)
    expect(target.baseUrl).toBe(GEMINI_EMBEDDING_DEFAULT_BASE_URL)
  })

  it('auto-resolves to a configured OpenAI-compatible custom provider', () => {
    const target = resolveSoulMemoryEmbeddingTarget({
      providerId: 'auto',
      customProviders: [
        {
          id: 'local',
          name: 'Local Embeddings',
          apiType: 'openai',
          baseUrl: 'http://127.0.0.1:11434/v1',
          model: 'nomic-embed-text',
        },
      ],
    })

    expect(target.providerKind).toBe('custom')
    expect(target.providerId).toBe('local')
    expect(target.model).toBe('nomic-embed-text')
    expect(target.baseUrl).toBe('http://127.0.0.1:11434/v1')
  })
})
