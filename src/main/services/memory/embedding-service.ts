/**
 * Embedding Service
 *
 * Provides text embeddings for semantic search and memory linking.
 * Supports multiple providers:
 * 1. OpenAI API (text-embedding-3-small, etc.)
 * 2. Zhipu AI (embedding-3, etc.)
 * 3. Gemini (text-embedding-004)
 * 4. Local @xenova/transformers (all-MiniLM-L6-v2)
 */

import { getSettings } from '../../stores/index.js'
import type { EmbeddingSettings, EmbeddingProviderType } from '../../../shared/ipc.js'

// Default embedding dimensions
export const DEFAULT_EMBEDDING_DIM = 384

export interface EmbeddingResult {
  embedding: number[]
  source: 'api' | 'local'
  model: string
  provider: EmbeddingProviderType
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
    model: 'text-embedding-3-small',
    dimensions: 384,
    local: {
      model: 'all-MiniLM-L6-v2',
    },
  }
}

/**
 * Get API key for a provider from AI settings
 */
function getProviderApiKey(providerId: string): string | undefined {
  const settings = getSettings()
  const embeddingSettings = getEmbeddingSettings()

  // Check for override first
  if (embeddingSettings.apiKeyOverride) {
    return embeddingSettings.apiKeyOverride
  }

  // Check legacy openai settings
  if (providerId === 'openai' && embeddingSettings.openai?.apiKey) {
    return embeddingSettings.openai.apiKey
  }

  // Get from AI provider config
  const providerConfig = settings.ai.providers?.[providerId]
  return providerConfig?.apiKey
}

/**
 * Get base URL for a provider from AI settings
 */
function getProviderBaseUrl(providerId: string, defaultUrl: string): string {
  const settings = getSettings()
  const embeddingSettings = getEmbeddingSettings()

  // Check for override first
  if (embeddingSettings.baseUrlOverride?.trim()) {
    return embeddingSettings.baseUrlOverride.trim()
  }

  // Check legacy openai settings
  if (providerId === 'openai' && embeddingSettings.openai?.baseUrl?.trim()) {
    return embeddingSettings.openai.baseUrl.trim()
  }

  // Get from AI provider config
  const providerConfig = settings.ai.providers?.[providerId]
  return providerConfig?.baseUrl?.trim() || defaultUrl
}

/**
 * Hybrid Embedding Service
 * Supports multiple providers with fallback to local model
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
    const embeddingSettings = getEmbeddingSettings()
    const provider = embeddingSettings.provider

    if (provider === 'local') {
      return this.localModelReady
    }

    // For API providers, check if we have an API key or local fallback is ready
    const hasApiKey = !!getProviderApiKey(provider)
    return hasApiKey || this.localModelReady
  }

  /**
   * Get the embedding dimension
   */
  getDimension(): number {
    const embeddingSettings = getEmbeddingSettings()
    return embeddingSettings.dimensions || DEFAULT_EMBEDDING_DIM
  }

  /**
   * Generate embedding for a single text
   */
  async embed(text: string): Promise<EmbeddingResult> {
    const embeddingSettings = getEmbeddingSettings()
    const provider = embeddingSettings.provider
    const textPreview = text.length > 50 ? text.slice(0, 50) + '...' : text

    console.log(`[EmbeddingService] Embedding request: provider=${provider}, text="${textPreview}"`)

    // Route to appropriate provider
    switch (provider) {
      case 'openai':
        return this.tryWithFallback(text, () => this.openaiEmbed(text))

      case 'zhipu':
        return this.tryWithFallback(text, () => this.zhipuEmbed(text))

      case 'gemini':
        return this.tryWithFallback(text, () => this.geminiEmbed(text))

      case 'local':
      default:
        return this.localEmbed(text)
    }
  }

  /**
   * Try API embedding with fallback to local
   */
  private async tryWithFallback(
    text: string,
    apiFn: () => Promise<EmbeddingResult | null>
  ): Promise<EmbeddingResult> {
    const apiResult = await apiFn()
    if (apiResult) {
      console.log(`[EmbeddingService] API embedding success: provider=${apiResult.provider}, model=${apiResult.model}, dims=${apiResult.embedding.length}`)
      return apiResult
    }

    // Fallback to local if API fails
    console.log('[EmbeddingService] API failed, falling back to local model')
    return this.localEmbed(text)
  }

  /**
   * Generate embeddings for multiple texts
   */
  async embedBatch(texts: string[]): Promise<EmbeddingResult[]> {
    const embeddingSettings = getEmbeddingSettings()
    const provider = embeddingSettings.provider

    // For local, process sequentially
    if (provider === 'local') {
      return Promise.all(texts.map(text => this.localEmbed(text)))
    }

    // For API providers, try batch API
    let batchResults: EmbeddingResult[] | null = null

    switch (provider) {
      case 'openai':
        batchResults = await this.openaiEmbedBatch(texts)
        break
      case 'zhipu':
        // Zhipu doesn't support batch, process individually
        break
      case 'gemini':
        // Gemini doesn't support batch, process individually
        break
    }

    if (batchResults) {
      return batchResults
    }

    // Fallback to individual processing with local fallback
    console.log('[EmbeddingService] Batch API failed or not supported, processing individually')
    return Promise.all(texts.map(text => this.embed(text)))
  }

  /**
   * OpenAI embedding
   */
  private async openaiEmbed(text: string): Promise<EmbeddingResult | null> {
    const embeddingSettings = getEmbeddingSettings()
    const apiKey = getProviderApiKey('openai')

    if (!apiKey) {
      console.log('[EmbeddingService] No API key available for OpenAI embedding')
      return null
    }

    const baseUrl = getProviderBaseUrl('openai', 'https://api.openai.com/v1')
    const model = embeddingSettings.model || embeddingSettings.openai?.model || 'text-embedding-3-small'
    const dimensions = embeddingSettings.dimensions || embeddingSettings.openai?.dimensions || DEFAULT_EMBEDDING_DIM

    console.log(`[EmbeddingService] OpenAI API: baseUrl=${baseUrl}, model=${model}, dims=${dimensions}`)

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
        console.warn('[EmbeddingService] OpenAI API request failed:', response.status)
        return null
      }

      const data = await response.json()
      const embedding = data.data[0].embedding as number[]

      return {
        embedding,
        source: 'api',
        model,
        provider: 'openai',
      }
    } catch (error) {
      console.warn('[EmbeddingService] OpenAI API embedding failed:', error)
      return null
    }
  }

  /**
   * OpenAI batch embedding
   */
  private async openaiEmbedBatch(texts: string[]): Promise<EmbeddingResult[] | null> {
    const embeddingSettings = getEmbeddingSettings()
    const apiKey = getProviderApiKey('openai')

    if (!apiKey) {
      return null
    }

    const baseUrl = getProviderBaseUrl('openai', 'https://api.openai.com/v1')
    const model = embeddingSettings.model || embeddingSettings.openai?.model || 'text-embedding-3-small'
    const dimensions = embeddingSettings.dimensions || embeddingSettings.openai?.dimensions || DEFAULT_EMBEDDING_DIM

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
        return null
      }

      const data = await response.json()

      return data.data.map((item: any) => ({
        embedding: item.embedding as number[],
        source: 'api' as const,
        model,
        provider: 'openai' as const,
      }))
    } catch (error) {
      console.warn('[EmbeddingService] OpenAI batch API failed:', error)
      return null
    }
  }

  /**
   * Zhipu AI embedding
   * API: https://open.bigmodel.cn/api/paas/v4/embeddings
   */
  private async zhipuEmbed(text: string): Promise<EmbeddingResult | null> {
    const embeddingSettings = getEmbeddingSettings()
    const apiKey = getProviderApiKey('zhipu')

    if (!apiKey) {
      console.log('[EmbeddingService] No API key available for Zhipu embedding')
      return null
    }

    const baseUrl = getProviderBaseUrl('zhipu', 'https://open.bigmodel.cn/api/paas/v4')
    const model = embeddingSettings.model || 'embedding-3'

    console.log(`[EmbeddingService] Zhipu API: baseUrl=${baseUrl}, model=${model}`)

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
        }),
      })

      if (!response.ok) {
        console.warn('[EmbeddingService] Zhipu API request failed:', response.status)
        return null
      }

      const data = await response.json()
      const embedding = data.data[0].embedding as number[]

      return {
        embedding,
        source: 'api',
        model,
        provider: 'zhipu',
      }
    } catch (error) {
      console.warn('[EmbeddingService] Zhipu API embedding failed:', error)
      return null
    }
  }

  /**
   * Gemini embedding
   * API: https://generativelanguage.googleapis.com/v1beta/models/{model}:embedContent
   */
  private async geminiEmbed(text: string): Promise<EmbeddingResult | null> {
    const embeddingSettings = getEmbeddingSettings()
    const apiKey = getProviderApiKey('gemini')

    if (!apiKey) {
      console.log('[EmbeddingService] No API key available for Gemini embedding')
      return null
    }

    const model = embeddingSettings.model || 'text-embedding-004'
    const baseUrl = getProviderBaseUrl('gemini', 'https://generativelanguage.googleapis.com/v1beta')

    console.log(`[EmbeddingService] Gemini API: baseUrl=${baseUrl}, model=${model}`)

    try {
      const response = await fetch(`${baseUrl}/models/${model}:embedContent?key=${apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content: {
            parts: [{ text }],
          },
        }),
      })

      if (!response.ok) {
        console.warn('[EmbeddingService] Gemini API request failed:', response.status)
        return null
      }

      const data = await response.json()
      const embedding = data.embedding.values as number[]

      return {
        embedding,
        source: 'api',
        model,
        provider: 'gemini',
      }
    } catch (error) {
      console.warn('[EmbeddingService] Gemini API embedding failed:', error)
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
      provider: 'local',
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
