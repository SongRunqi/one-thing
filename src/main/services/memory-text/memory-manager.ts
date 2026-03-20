/**
 * Memory Manager
 *
 * Provides file lifecycle management for the text-based memory system.
 * Handles listing, reading, updating, and deleting memory files.
 */

import * as fs from 'fs/promises'
import * as path from 'path'
import { getTextMemoryStorage, parseMemoryFile, generateMemoryFile } from './text-memory-storage.js'
import { getMemoryIndexManager, type FileIndexEntry, type IndexStats } from './memory-index.js'
import type { MemoryFileMetadata, ParsedMemoryFile } from './types.js'

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Memory file info for listing
 */
export interface MemoryFileInfo {
  path: string                    // Relative path in memory directory
  title: string                   // File title (first # heading)
  metadata: MemoryFileMetadata
  sections: string[]              // All ## headings
}

/**
 * Tag info with usage count
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
 * Result of batch delete operation
 */
export interface BatchDeleteResult {
  success: string[]
  failed: Array<{ path: string; error: string }>
}

// ============================================================================
// File Management Functions
// ============================================================================

/**
 * List all memory files with their metadata
 */
export async function listMemoryFiles(): Promise<MemoryFileInfo[]> {
  const storage = getTextMemoryStorage()
  const indexManager = getMemoryIndexManager(storage.getBaseDir())

  // Try to use index for fast listing
  const index = await indexManager.loadIndex()

  if (index && index.stats.totalFiles > 0) {
    // Use index data
    return Object.values(index.files).map((entry: FileIndexEntry) => ({
      path: entry.path,
      title: entry.title,
      metadata: {
        created: entry.metadata.created,
        updated: entry.metadata.updated,
        source: entry.metadata.source as MemoryFileMetadata['source'],
        tags: entry.metadata.tags,
        importance: entry.metadata.importance,
        accessCount: entry.metadata.accessCount,
      },
      sections: entry.sections,
    }))
  }

  // Fallback: scan files directly
  return await scanMemoryFiles(storage.getBaseDir())
}

/**
 * Scan memory directory for files (fallback when no index)
 */
async function scanMemoryFiles(baseDir: string): Promise<MemoryFileInfo[]> {
  const files: MemoryFileInfo[] = []

  async function scanDir(dirPath: string, relativePath: string = '') {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true })

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name)
        const relPath = relativePath ? `${relativePath}/${entry.name}` : entry.name

        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          await scanDir(fullPath, relPath)
        } else if (entry.isFile() && entry.name.endsWith('.md') && !entry.name.startsWith('_')) {
          try {
            const content = await fs.readFile(fullPath, 'utf-8')
            const parsed = parseMemoryFile(content)
            const title = extractTitle(parsed.content) || entry.name.replace('.md', '')
            const sections = extractSections(parsed.content)

            files.push({
              path: relPath,
              title,
              metadata: parsed.metadata,
              sections,
            })
          } catch (error) {
            console.warn(`[MemoryManager] Failed to read file ${relPath}:`, error)
          }
        }
      }
    } catch (error) {
      // Directory may not exist
    }
  }

  await scanDir(baseDir)
  return files
}

/**
 * Extract title from markdown content (first # heading)
 */
function extractTitle(content: string): string | undefined {
  const match = content.match(/^#\s+(.+)$/m)
  return match ? match[1].trim() : undefined
}

/**
 * Extract section headings from markdown content (## headings)
 */
function extractSections(content: string): string[] {
  const matches = content.matchAll(/^##\s+(.+)$/gm)
  return Array.from(matches, m => m[1].trim())
}

/**
 * Get a single memory file with full content
 */
export async function getMemoryFile(relativePath: string): Promise<ParsedMemoryFile | null> {
  const storage = getTextMemoryStorage()
  const fullPath = path.join(storage.getBaseDir(), relativePath)

  try {
    const content = await fs.readFile(fullPath, 'utf-8')
    return parseMemoryFile(content)
  } catch (error) {
    console.error(`[MemoryManager] Failed to read file ${relativePath}:`, error)
    return null
  }
}

/**
 * Update a memory file's content and/or metadata
 */
export async function updateMemoryFile(
  relativePath: string,
  content: string,
  metadataUpdates?: Partial<MemoryFileMetadata>
): Promise<void> {
  const storage = getTextMemoryStorage()
  const fullPath = path.join(storage.getBaseDir(), relativePath)

  // Read existing file
  let existingMetadata: MemoryFileMetadata
  try {
    const existingContent = await fs.readFile(fullPath, 'utf-8')
    const parsed = parseMemoryFile(existingContent)
    existingMetadata = parsed.metadata
  } catch {
    // New file, create default metadata
    const now = new Date().toISOString()
    existingMetadata = { created: now, updated: now }
  }

  // Merge metadata
  const newMetadata: MemoryFileMetadata = {
    ...existingMetadata,
    ...metadataUpdates,
    updated: new Date().toISOString(),
    version: (existingMetadata.version || 0) + 1,
  }

  // Generate and write file
  const fileContent = generateMemoryFile(newMetadata, content)

  // Ensure directory exists
  const dir = path.dirname(fullPath)
  await fs.mkdir(dir, { recursive: true })

  await fs.writeFile(fullPath, fileContent, 'utf-8')

  // Update index
  const indexManager = getMemoryIndexManager(storage.getBaseDir())
  await indexManager.updateFileIndex(relativePath)

  console.log(`[MemoryManager] Updated file: ${relativePath}`)
}

/**
 * Delete a single memory file
 */
export async function deleteMemoryFile(relativePath: string): Promise<void> {
  const storage = getTextMemoryStorage()
  const fullPath = path.join(storage.getBaseDir(), relativePath)

  // Delete the actual file
  await fs.unlink(fullPath)

  // Remove from index
  const indexManager = getMemoryIndexManager(storage.getBaseDir())
  await indexManager.removeFileIndex(relativePath)

  console.log(`[MemoryManager] Deleted file: ${relativePath}`)
}

/**
 * Delete multiple memory files
 */
export async function deleteMemoryFiles(relativePaths: string[]): Promise<BatchDeleteResult> {
  const result: BatchDeleteResult = {
    success: [],
    failed: [],
  }

  for (const relativePath of relativePaths) {
    try {
      await deleteMemoryFile(relativePath)
      result.success.push(relativePath)
    } catch (error) {
      result.failed.push({
        path: relativePath,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  console.log(`[MemoryManager] Batch delete: ${result.success.length} success, ${result.failed.length} failed`)
  return result
}

// ============================================================================
// Tag Management Functions
// ============================================================================

/**
 * Get all tags with usage info
 */
export async function getAllTags(): Promise<TagInfo[]> {
  const storage = getTextMemoryStorage()
  const indexManager = getMemoryIndexManager(storage.getBaseDir())

  const index = await indexManager.loadIndex()
  if (!index) {
    return []
  }

  // Convert index.tags to TagInfo array
  return Object.entries(index.tags).map(([tag, files]) => ({
    tag,
    count: files.length,
    files,
  })).sort((a, b) => b.count - a.count)  // Sort by count descending
}

/**
 * Rename a tag across all files
 * Returns the number of files affected
 */
export async function renameTag(oldTag: string, newTag: string): Promise<number> {
  const storage = getTextMemoryStorage()
  const indexManager = getMemoryIndexManager(storage.getBaseDir())

  const index = await indexManager.loadIndex()
  if (!index || !index.tags[oldTag]) {
    return 0
  }

  const affectedFiles = index.tags[oldTag]
  let count = 0

  for (const relativePath of affectedFiles) {
    try {
      const fullPath = path.join(storage.getBaseDir(), relativePath)
      const content = await fs.readFile(fullPath, 'utf-8')
      const parsed = parseMemoryFile(content)

      // Update tags
      if (parsed.metadata.tags) {
        const tagIndex = parsed.metadata.tags.indexOf(oldTag)
        if (tagIndex !== -1) {
          parsed.metadata.tags[tagIndex] = newTag
          parsed.metadata.updated = new Date().toISOString()

          // Write back
          const newContent = generateMemoryFile(parsed.metadata, parsed.content)
          await fs.writeFile(fullPath, newContent, 'utf-8')
          count++
        }
      }
    } catch (error) {
      console.warn(`[MemoryManager] Failed to rename tag in ${relativePath}:`, error)
    }
  }

  // Rebuild index
  await indexManager.buildFullIndex()

  console.log(`[MemoryManager] Renamed tag "${oldTag}" to "${newTag}" in ${count} files`)
  return count
}

/**
 * Delete a tag from all files
 * Returns the number of files affected
 */
export async function deleteTag(tag: string): Promise<number> {
  const storage = getTextMemoryStorage()
  const indexManager = getMemoryIndexManager(storage.getBaseDir())

  const index = await indexManager.loadIndex()
  if (!index || !index.tags[tag]) {
    return 0
  }

  const affectedFiles = index.tags[tag]
  let count = 0

  for (const relativePath of affectedFiles) {
    try {
      const fullPath = path.join(storage.getBaseDir(), relativePath)
      const content = await fs.readFile(fullPath, 'utf-8')
      const parsed = parseMemoryFile(content)

      // Remove tag
      if (parsed.metadata.tags) {
        const tagIndex = parsed.metadata.tags.indexOf(tag)
        if (tagIndex !== -1) {
          parsed.metadata.tags.splice(tagIndex, 1)
          parsed.metadata.updated = new Date().toISOString()

          // Write back
          const newContent = generateMemoryFile(parsed.metadata, parsed.content)
          await fs.writeFile(fullPath, newContent, 'utf-8')
          count++
        }
      }
    } catch (error) {
      console.warn(`[MemoryManager] Failed to delete tag from ${relativePath}:`, error)
    }
  }

  // Rebuild index
  await indexManager.buildFullIndex()

  console.log(`[MemoryManager] Deleted tag "${tag}" from ${count} files`)
  return count
}

// ============================================================================
// Statistics Functions
// ============================================================================

/**
 * Get memory statistics
 */
export async function getMemoryStats(): Promise<MemoryStats> {
  const storage = getTextMemoryStorage()
  const indexManager = getMemoryIndexManager(storage.getBaseDir())

  const index = await indexManager.loadIndex()

  if (index) {
    // Calculate total size
    let totalSizeBytes = 0
    let oldestFile: { path: string; created: string } | undefined
    let newestFile: { path: string; created: string } | undefined

    for (const entry of Object.values(index.files)) {
      try {
        const fullPath = path.join(storage.getBaseDir(), entry.path)
        const stat = await fs.stat(fullPath)
        totalSizeBytes += stat.size

        // Track oldest and newest
        if (!oldestFile || entry.metadata.created < oldestFile.created) {
          oldestFile = { path: entry.path, created: entry.metadata.created }
        }
        if (!newestFile || entry.metadata.created > newestFile.created) {
          newestFile = { path: entry.path, created: entry.metadata.created }
        }
      } catch {
        // File may have been deleted
      }
    }

    return {
      totalFiles: index.stats.totalFiles,
      totalSections: index.stats.totalSections,
      totalTags: index.stats.totalTags,
      tagCloud: index.stats.tagCloud,
      recentlyUpdated: index.stats.recentlyUpdated,
      mostAccessed: index.stats.mostAccessed,
      totalSizeBytes,
      oldestFile,
      newestFile,
    }
  }

  // No index available
  return {
    totalFiles: 0,
    totalSections: 0,
    totalTags: 0,
    tagCloud: [],
    recentlyUpdated: [],
    mostAccessed: [],
    totalSizeBytes: 0,
  }
}

/**
 * Rebuild the memory index
 */
export async function rebuildIndex(): Promise<IndexStats> {
  const storage = getTextMemoryStorage()
  const indexManager = getMemoryIndexManager(storage.getBaseDir())

  const index = await indexManager.buildFullIndex()
  console.log(`[MemoryManager] Rebuilt index with ${index.stats.totalFiles} files`)

  return index.stats
}
