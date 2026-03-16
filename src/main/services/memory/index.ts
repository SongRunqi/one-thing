/**
 * Memory Services
 *
 * This module provides embedding-related services for the memory system.
 */

// Embedding service
export {
  getEmbeddingService,
  cosineSimilarity,
  findTopKSimilar,
  DEFAULT_EMBEDDING_DIM,
  type EmbeddingService,
  type EmbeddingResult,
} from './embedding-service.js'
