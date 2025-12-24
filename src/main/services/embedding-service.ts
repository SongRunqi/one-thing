/**
 * Embedding Service
 *
 * Provides text embeddings for semantic search and memory linking.
 * Uses a hybrid approach based on user settings:
 * 1. Primary: OpenAI API (configurable model and dimensions)
 * 2. Fallback: Local @xenova/transformers (all-MiniLM-L6-v2, 384 dims)
 */

import { getSettings } from '../stores/index.js'
import type { EmbeddingSettings } from '../../shared/ipc.js'

// Default embedding dimensions
export const OPENAI_EMBEDDING_DIM = 1536
export const LOCAL_EMBEDDING_DIM = 384

// Default to local dimension for storage efficiency
export const EMBEDDING_DIM = LOCAL_EMBEDDING_DIM

export interface EmbeddingResult {
  embedding: number[]
  source: 'api' | 'local'
  model: string
}

export interface EmbeddingService {
  embed(text: string): Promise<EmbeddingResult>
  embedBatch(texts: string[]): Promise<EmbeddingResult[]>
  getDimension(): number
  isReady(): boolean
}

// Singleton instance
let embeddingServiceInstance: HybridEmbeddingService | null = null

/**
 * Get the embedding service singleton
 */
export function getEmbeddingService(): EmbeddingService {
  if (!embeddingServiceInstance) {
    embeddingServiceInstance = new HybridEmbeddingService()
  }
  return embeddingServiceInstance
}

/**
 * Get current embedding settings from app settings
 */
function getEmbeddingSettings(): EmbeddingSettings {
  const settings = getSettings()
  return settings.embedding || {
    provider: 'openai',
    openai: {
      model: 'text-embedding-3-small',
      dimensions: 384,
    },
    local: {
      model: 'all-MiniLM-L6-v2',
    },
  }
}

/**
 * Hybrid Embedding Service
 * Tries API first, falls back to local model
 */
class HybridEmbeddingService implements EmbeddingService {
  private localPipeline: any = null
  private localModelLoading = false
  private localModelReady = false

  constructor() {
    // Pre-load local model in background
    this.initLocalModel()
  }

  /**
   * Initialize the local embedding model
   */
  private async initLocalModel(): Promise<void> {
    if (this.localModelLoading || this.localModelReady) return

    this.localModelLoading = true

    try {
      // Dynamic import to avoid blocking startup
      const { pipeline } = await import('@xenova/transformers')

      console.log('[EmbeddingService] Loading local embedding model...')

      // Load the all-MiniLM-L6-v2 model
      // This model produces 384-dimensional embeddings
      this.localPipeline = await pipeline(
        'feature-extraction',
        'Xenova/all-MiniLM-L6-v2'
      )

      this.localModelReady = true
      console.log('[EmbeddingService] Local embedding model loaded successfully')
    } catch (error) {
      console.error('[EmbeddingService] Failed to load local embedding model:', error)
    } finally {
      this.localModelLoading = false
    }
  }

  /**
   * Check if the service is ready
   */
  isReady(): boolean {
    const settings = getSettings()
    const embeddingSettings = getEmbeddingSettings()

    if (embeddingSettings.provider === 'openai') {
      // For OpenAI, check if we have an API key (embedding-specific or general OpenAI key)
      const hasApiKey = !!(embeddingSettings.openai?.apiKey || settings.ai.providers.openai?.apiKey)
      // Service is ready if we have API key OR local model is ready (as fallback)
      return hasApiKey || this.localModelReady
    }

    // For local provider, check if local model is ready
    return this.localModelReady
  }

  /**
   * Get the embedding dimension
   */
  getDimension(): number {
    return EMBEDDING_DIM
  }

  /**
   * Generate embedding for a single text
   */
  async embed(text: string): Promise<EmbeddingResult> {
    const embeddingSettings = getEmbeddingSettings()
    const textPreview = text.length > 50 ? text.slice(0, 50) + '...' : text

    console.log(`[EmbeddingService] Embedding request: provider=${embeddingSettings.provider}, text="${textPreview}"`)

    // If user prefers OpenAI, try API first
    if (embeddingSettings.provider === 'openai') {
      const apiResult = await this.tryApiEmbed(text)
      if (apiResult) {
        console.log(`[EmbeddingService] OpenAI embedding success: model=${apiResult.model}, dims=${apiResult.embedding.length}`)
        return apiResult
      }
      // Fallback to local if API fails
      console.log('[EmbeddingService] OpenAI API failed, falling back to local model')
      return this.localEmbed(text)
    }

    // If user prefers local, use local directly
    console.log('[EmbeddingService] Using local model')
    return this.localEmbed(text)
  }

  /**
   * Generate embeddings for multiple texts
   */
  async embedBatch(texts: string[]): Promise<EmbeddingResult[]> {
    const embeddingSettings = getEmbeddingSettings()

    // If user prefers OpenAI, try API first
    if (embeddingSettings.provider === 'openai') {
      const apiResults = await this.tryApiEmbedBatch(texts)
      if (apiResults) return apiResults
      // Fallback to local if API fails
      console.log('[EmbeddingService] OpenAI batch API failed, falling back to local model')
    }

    // Local batch processing
    return Promise.all(texts.map(text => this.localEmbed(text)))
  }

  /**
   * Try to get embedding from OpenAI API
   */
  private async tryApiEmbed(text: string): Promise<EmbeddingResult | null> {
    const settings = getSettings()
    const embeddingSettings = getEmbeddingSettings()
    const openaiEmbedSettings = embeddingSettings.openai

    // Get API key: use embedding-specific key if set, otherwise use OpenAI provider key
    const apiKey = openaiEmbedSettings?.apiKey || settings.ai.providers.openai?.apiKey
    if (!apiKey) {
      console.log('[EmbeddingService] No API key available for OpenAI embedding')
      return null
    }

    // Get base URL: use embedding-specific URL if set, otherwise use OpenAI provider URL or default
    // Note: empty string '' should fallback to default, so we use || instead of ??
    const embeddingBaseUrl = openaiEmbedSettings?.baseUrl?.trim()
    const providerBaseUrl = settings.ai.providers.openai?.baseUrl?.trim()
    const baseUrl = embeddingBaseUrl || providerBaseUrl || 'https://api.openai.com/v1'

    // Get model and dimensions from settings
    const model = openaiEmbedSettings?.model || 'text-embedding-3-small'
    const dimensions = openaiEmbedSettings?.dimensions || EMBEDDING_DIM

    console.log(`[EmbeddingService] OpenAI API config: baseUrl=${baseUrl}, model=${model}, dims=${dimensions}`)

    try {
      const response = await fetch(`${baseUrl}/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          input: text,
          model,
          dimensions,
        }),
      })

      if (!response.ok) {
        console.warn('[EmbeddingService] API request failed:', response.status)
        return null
      }

      const data = await response.json()
      const embedding = data.data[0].embedding as number[]

      return {
        embedding,
        source: 'api',
        model,
      }
    } catch (error) {
      console.warn('[EmbeddingService] API embedding failed:', error)
      return null
    }
  }

  /**
   * Try to get batch embeddings from OpenAI API
   */
  private async tryApiEmbedBatch(texts: string[]): Promise<EmbeddingResult[] | null> {
    const settings = getSettings()
    const embeddingSettings = getEmbeddingSettings()
    const openaiEmbedSettings = embeddingSettings.openai

    // Get API key: use embedding-specific key if set, otherwise use OpenAI provider key
    const apiKey = openaiEmbedSettings?.apiKey || settings.ai.providers.openai?.apiKey
    if (!apiKey) {
      console.log('[EmbeddingService] No API key available for OpenAI batch embedding')
      return null
    }

    // Get base URL: use embedding-specific URL if set, otherwise use OpenAI provider URL or default
    // Note: empty string '' should fallback to default, so we use || instead of ??
    const embeddingBaseUrl = openaiEmbedSettings?.baseUrl?.trim()
    const providerBaseUrl = settings.ai.providers.openai?.baseUrl?.trim()
    const baseUrl = embeddingBaseUrl || providerBaseUrl || 'https://api.openai.com/v1'

    // Get model and dimensions from settings
    const model = openaiEmbedSettings?.model || 'text-embedding-3-small'
    const dimensions = openaiEmbedSettings?.dimensions || EMBEDDING_DIM

    console.log(`[EmbeddingService] OpenAI batch API config: baseUrl=${baseUrl}, model=${model}, dims=${dimensions}, count=${texts.length}`)

    try {
      const response = await fetch(`${baseUrl}/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          input: texts,
          model,
          dimensions,
        }),
      })

      if (!response.ok) {
        console.warn('[EmbeddingService] Batch API request failed:', response.status)
        return null
      }

      const data = await response.json()

      return data.data.map((item: any) => ({
        embedding: item.embedding as number[],
        source: 'api' as const,
        model,
      }))
    } catch (error) {
      console.warn('[EmbeddingService] Batch API embedding failed:', error)
      return null
    }
  }

  /**
   * Generate embedding using local model
   */
  private async localEmbed(text: string): Promise<EmbeddingResult> {
    // Wait for local model to be ready
    if (!this.localModelReady) {
      await this.initLocalModel()

      // If still not ready, throw error
      if (!this.localModelReady) {
        throw new Error('Local embedding model not available')
      }
    }

    // Generate embedding
    const output = await this.localPipeline(text, {
      pooling: 'mean',
      normalize: true,
    })

    // Convert to regular array
    const embedding = Array.from(output.data) as number[]

    return {
      embedding,
      source: 'local',
      model: 'all-MiniLM-L6-v2',
    }
  }
}

/**
 * Calculate cosine similarity between two embeddings
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Embedding dimensions don't match: ${a.length} vs ${b.length}`)
  }

  let dotProduct = 0
  let normA = 0
  let normB = 0

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }

  if (normA === 0 || normB === 0) return 0

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
}

/**
 * Find top K similar items from a list
 */
export function findTopKSimilar<T>(
  queryEmbedding: number[],
  items: Array<{ embedding: number[]; data: T }>,
  k: number,
  minSimilarity = 0
): Array<{ data: T; similarity: number }> {
  const scored = items.map(item => ({
    data: item.data,
    similarity: cosineSimilarity(queryEmbedding, item.embedding),
  }))

  return scored
    .filter(item => item.similarity >= minSimilarity)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, k)
}
