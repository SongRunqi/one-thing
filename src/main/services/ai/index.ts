/**
 * AI Services
 *
 * This module provides AI-related services including:
 * - Model registry (fetching and caching model information)
 * - Token counting utilities
 */

// Model registry
export {
  getModelsForProvider,
  getAllModels,
  searchModels,
  getModelById,
  modelSupportsTools,
  modelSupportsReasoning,
  modelSupportsReasoningSync,
  modelSupportsImageGeneration,
  forceRefresh,
  getCacheStatus,
  getModelDisplayName,
  getModelNameAliases,
  getEmbeddingModelsForProvider,
  getAllEmbeddingModels,
  getEmbeddingDimension,
  type EmbeddingModelInfo,
} from './model-registry.js'

// Token counter utilities
export {
  countMessagesAfter,
} from './token-counter.js'

// Context compacting
export {
  shouldCompact,
  executeCompacting,
  getCompactThreshold,
  COMPACTING_CONFIG,
} from './context-compacting.js'
