/**
 * Memory Services
 *
 * This module provides all memory-related services including:
 * - Embedding generation and similarity search
 * - Memory management (add/update/delete)
 * - Memory extraction from conversations
 * - Memory linking and graph building
 * - Memory decay scheduling
 * - Conflict resolution
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

// Memory manager
export {
  processUserFact,
  processAgentMemory,
  type MemoryOperation,
  type MemoryDecision,
} from './memory-manager.js'

// Memory extractor
export {
  extractMemoriesFromConversation,
  extractAndSaveMemories,
  extractAndSaveUserFactsOnly,
} from './memory-extractor.js'

// Memory linker
export {
  linkNewMemory,
  buildMemoryGraph,
  findRelatedMemoriesViaGraph,
  getMemoryGraphStats,
  type MemoryLinkResult,
  type LinkingStats,
} from './memory-linker.js'

// Memory scheduler
export {
  getMemoryScheduler,
  startMemoryScheduler,
  stopMemoryScheduler,
  forceMemoryDecay,
  getSchedulerStats,
  MemoryScheduler,
  type MemorySchedulerConfig,
  type DecayResult,
  type SchedulerStats,
} from './memory-scheduler.js'

// Conflict resolver
export {
  detectMemoryConflict,
  detectFactConflict,
  resolveMemoryConflict,
  resolveFactConflict,
  addMemoryWithConflictResolution,
  type ConflictResolution,
  type ConflictType,
  type ConflictResult,
  type ResolvedConflict,
} from './conflict-resolver.js'
