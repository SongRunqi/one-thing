/**
 * Text-Based Memory System
 *
 * A simple, file-based memory system using Markdown files.
 * Replaces the complex SQLite + embedding-based system.
 *
 * Directory structure:
 *   ~/.0nething/memory/
 *   ├── _core/              - Always loaded (profile, preferences)
 *   ├── topics/             - Shared topic memories (on-demand)
 *   └── agents/{id}/        - Per-agent memories
 *
 * File format:
 *   Uses YAML Frontmatter for metadata (compatible with Obsidian, Jekyll, etc.)
 */

// Storage
export {
  TextMemoryStorage,
  getTextMemoryStorage,
  initializeTextMemory,
  parseMemoryFile,
  generateMemoryFile,
  type MemorySection,
  type MemorySectionWithMeta,
  type AgentRelationship,
  type MemoryFileMetadata,
  type ParsedMemoryFile,
  type WriteMemoryOptions,
} from './text-memory-storage.js'

// Retriever
export {
  extractKeywords,
  extractKeywordsWithAI,
  loadCoreMemory,
  loadAgentMemory,
  retrieveRelevantMemory,
  retrieveRelevantMemoryWithFiles,
  loadMemoryForChat,
  formatMemoryPrompt,
  type ProviderConfig,
  type RetrievedFile,
  type RetrievalResult,
} from './memory-retriever.js'

// Writer
export {
  applyMemoryUpdate,
  applyMemoryUpdates,
  createTopicFile,
  addMemoryPoint,
  updateUserProfile,
  updateUserPreferences,
  updateAgentRelationship,
  addAgentMemoryPoint,
  recordAgentInteraction,
  listExistingTopics,
  type MemoryUpdate,
} from './memory-writer.js'

// Index
export {
  MemoryIndexManager,
  getMemoryIndexManager,
  type MemoryIndex,
  type FileIndexEntry,
  type IndexStats,
} from './memory-index.js'

// Feedback
export {
  recordMemoryFeedback,
  getMemoryFeedbackStats,
  type FeedbackType,
} from './memory-feedback.js'

// Manager (file lifecycle)
export {
  listMemoryFiles,
  getMemoryFile,
  updateMemoryFile,
  deleteMemoryFile,
  deleteMemoryFiles,
  getAllTags,
  renameTag,
  deleteTag,
  getMemoryStats,
  rebuildIndex,
  type MemoryFileInfo,
  type TagInfo,
  type MemoryStats,
  type BatchDeleteResult,
} from './memory-manager.js'

// Export/Import
export {
  exportMemory,
  exportWithDialog,
  importMemory,
  importWithDialog,
  type ExportOptions,
  type ImportResult,
} from './memory-export.js'
