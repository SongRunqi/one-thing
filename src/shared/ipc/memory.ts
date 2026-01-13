/**
 * Memory Management IPC Types
 *
 * Type definitions for memory file lifecycle management,
 * including CRUD operations, tags, and import/export.
 */

import type { MemoryFileMetadata, ParsedMemoryFile } from '../../main/services/memory-text/types.js'

// ============================================================================
// Memory File Types
// ============================================================================

/**
 * Memory file info for listing (lightweight)
 */
export interface MemoryFileInfo {
  path: string                    // Relative path in memory directory
  title: string                   // File title (first # heading)
  metadata: MemoryFileMetadata
  sections: string[]              // All ## headings
}

/**
 * Tag info with usage statistics
 */
export interface TagInfo {
  tag: string
  count: number                   // Number of files using this tag
  files: string[]                 // File paths using this tag
}

/**
 * Memory statistics
 */
export interface MemoryStats {
  totalFiles: number
  totalSections: number
  totalTags: number
  tagCloud: Array<{ tag: string; count: number }>
  recentlyUpdated: string[]
  mostAccessed: string[]
  totalSizeBytes: number
  oldestFile?: { path: string; created: string }
  newestFile?: { path: string; created: string }
}

/**
 * Batch delete result
 */
export interface BatchDeleteResult {
  success: string[]
  failed: Array<{ path: string; error: string }>
}

// ============================================================================
// Export/Import Types
// ============================================================================

/**
 * Export options
 */
export interface ExportOptions {
  includeMetadata: boolean
  filter?: {
    tags?: string[]
    dateRange?: [string, string]  // ISO 8601 date strings
  }
}

/**
 * Import result
 */
export interface ImportResult {
  imported: number
  skipped: number
  errors: string[]
}

// ============================================================================
// IPC Request/Response Types
// ============================================================================

// List files
export type ListFilesResponse = MemoryFileInfo[]

// Get file
export interface GetFileRequest {
  path: string
}
export type GetFileResponse = ParsedMemoryFile | null

// Update file
export interface UpdateFileRequest {
  path: string
  content: string
  metadata?: Partial<MemoryFileMetadata>
}

// Delete file
export interface DeleteFileRequest {
  path: string
}

// Delete files (batch)
export interface DeleteFilesRequest {
  paths: string[]
}
export type DeleteFilesResponse = BatchDeleteResult

// Export
export interface ExportRequest {
  options: ExportOptions
}
export interface ExportResponse {
  filePath: string
}

// Import
export interface ImportRequest {
  filePath: string
}
export type ImportResponse = ImportResult

// Get tags
export type GetTagsResponse = TagInfo[]

// Rename tag
export interface RenameTagRequest {
  oldTag: string
  newTag: string
}
export interface RenameTagResponse {
  affected: number
}

// Delete tag
export interface DeleteTagRequest {
  tag: string
}
export interface DeleteTagResponse {
  affected: number
}

// Get stats
export type GetStatsResponse = MemoryStats

// Rebuild index
export interface RebuildIndexResponse {
  totalFiles: number
  totalSections: number
  totalTags: number
}

// Re-export types for convenience
export type { MemoryFileMetadata, ParsedMemoryFile }
