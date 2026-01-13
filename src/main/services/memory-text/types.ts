/**
 * Type Definitions for Memory Text System
 *
 * Centralized type definitions used across the memory text module.
 * Extracted from text-memory-storage.ts for better organization.
 */

// ============================================================================
// Metadata Types
// ============================================================================

/**
 * Metadata stored in YAML Frontmatter of memory files
 */
export interface MemoryFileMetadata {
  // Required fields
  /** Creation timestamp (ISO 8601) */
  created: string
  /** Last update timestamp (ISO 8601) */
  updated: string

  // Optional fields
  /** How this memory was created */
  source?: 'conversation' | 'manual' | 'import' | 'system'
  /** Related session/conversation ID */
  sourceId?: string
  /** Tags for categorization and retrieval */
  tags?: string[]
  /** Version number, incremented on each update */
  version?: number
  /** Creator: 'user' | 'ai' | agentId */
  author?: string
  /** Importance level: 1 (low) to 5 (high) */
  importance?: number
  /** Last access time (ISO 8601, for hot/cold data) */
  lastAccessed?: string
  /** Access count for usage tracking */
  accessCount?: number

  // User feedback fields (for adaptive retrieval)
  /** Positive feedback count (👍) */
  feedbackPositive?: number
  /** Negative feedback count (👎) */
  feedbackNegative?: number
  /** Last feedback time (ISO 8601) */
  lastFeedbackAt?: string
}

/**
 * Parsed memory file with metadata and content separated
 */
export interface ParsedMemoryFile {
  /** Parsed YAML frontmatter metadata */
  metadata: MemoryFileMetadata
  /** Content after frontmatter */
  content: string
}

// ============================================================================
// Section Types
// ============================================================================

/**
 * A section within a memory file (based on ## headings)
 */
export interface MemorySection {
  /** Section heading (without ## prefix) */
  heading: string
  /** Section content */
  content: string
  /** Source file path */
  file: string
}

/**
 * Memory section with optional metadata attached
 */
export interface MemorySectionWithMeta extends MemorySection {
  /** File-level metadata (when available) */
  metadata?: MemoryFileMetadata
}

// ============================================================================
// Agent Types
// ============================================================================

/**
 * Agent relationship tracking data
 */
export interface AgentRelationship {
  /** Trust level (0-100) */
  trustLevel: number
  /** Familiarity level (0-100) */
  familiarity: number
  /** Total interaction count */
  totalInteractions: number
  /** Current mood descriptor */
  currentMood: string
  /** Additional mood notes */
  moodNotes: string
  /** List of memory IDs associated with this agent */
  memories: string[]
}

// ============================================================================
// Options Types
// ============================================================================

/**
 * Options for writing memory files
 */
export interface WriteMemoryOptions {
  /** Source of the memory */
  source?: 'conversation' | 'manual' | 'import' | 'system'
  /** Related session/conversation ID */
  sourceId?: string
  /** Tags to attach to this memory */
  tags?: string[]
  /** Author identifier */
  author?: string
  /** Initial importance level (1-5) */
  importance?: number
}

// ============================================================================
// Re-export for convenience
// ============================================================================

/** Memory source types */
export type MemorySource = 'conversation' | 'manual' | 'import' | 'system'
