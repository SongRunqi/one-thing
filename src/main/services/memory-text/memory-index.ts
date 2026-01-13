/**
 * Memory Index Manager
 *
 * Provides fast search and overview capabilities for the text-based memory system.
 * Uses a JSON index file for quick lookups without scanning all markdown files.
 *
 * Features:
 * - Tag-based search
 * - Keyword search with inverted index
 * - Related file discovery
 * - Statistics and overview (tag cloud, recent files, most accessed)
 * - Incremental updates
 */

import { app } from 'electron'
import * as fs from 'fs/promises'
import * as path from 'path'
import * as crypto from 'crypto'
import { parseMemoryFile, type MemoryFileMetadata } from './text-memory-storage.js'
import { STOP_WORDS } from './utils/keyword-utils.js'

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Main index structure
 */
export interface MemoryIndex {
  version: number              // Index format version
  lastUpdated: string          // ISO 8601 timestamp
  checksum: string             // Checksum for detecting changes
  files: Record<string, FileIndexEntry>   // Path -> File entry
  tags: Record<string, string[]>          // Tag -> File paths
  keywords: Record<string, string[]>      // Keyword -> File paths
  stats: IndexStats
}

/**
 * Index entry for a single file
 */
export interface FileIndexEntry {
  path: string                 // Relative path
  title: string                // File title (first # heading)
  metadata: {
    created: string
    updated: string
    source?: string
    tags?: string[]
    importance?: number
    accessCount?: number
  }
  sections: string[]           // All ## headings
  contentHash: string          // Content hash for change detection
}

/**
 * Index statistics
 */
export interface IndexStats {
  totalFiles: number
  totalSections: number
  totalTags: number
  tagCloud: Array<{ tag: string; count: number }>  // Sorted by frequency
  recentlyUpdated: string[]    // Most recently updated file paths
  mostAccessed: string[]       // Most accessed file paths
}

const INDEX_VERSION = 1
const INDEX_FILENAME = '_index.json'

// ============================================================================
// Memory Index Manager
// ============================================================================

export class MemoryIndexManager {
  private baseDir: string
  private index: MemoryIndex | null = null

  constructor(baseDir: string) {
    this.baseDir = baseDir
  }

  /**
   * Get index file path
   */
  private get indexPath(): string {
    return path.join(this.baseDir, INDEX_FILENAME)
  }

  /**
   * Load index from disk (if exists)
   */
  async loadIndex(): Promise<MemoryIndex | null> {
    try {
      const content = await fs.readFile(this.indexPath, 'utf-8')
      this.index = JSON.parse(content) as MemoryIndex
      console.log(`[MemoryIndex] Loaded index with ${this.index.stats.totalFiles} files`)
      return this.index
    } catch (error) {
      console.log('[MemoryIndex] No existing index found')
      return null
    }
  }

  /**
   * Save index to disk
   */
  async saveIndex(): Promise<void> {
    if (!this.index) return
    this.index.lastUpdated = new Date().toISOString()
    await fs.writeFile(
      this.indexPath,
      JSON.stringify(this.index, null, 2),
      'utf-8'
    )
    console.log('[MemoryIndex] Index saved')
  }

  /**
   * Build full index by scanning all files
   */
  async buildFullIndex(): Promise<MemoryIndex> {
    console.log('[MemoryIndex] Building full index...')
    const startTime = Date.now()

    const files: Record<string, FileIndexEntry> = {}
    const tags: Record<string, string[]> = {}
    const keywords: Record<string, string[]> = {}

    // Recursively scan all .md files
    const mdFiles = await this.scanMarkdownFiles(this.baseDir)

    for (const filePath of mdFiles) {
      const relativePath = path.relative(this.baseDir, filePath)
      if (relativePath === INDEX_FILENAME) continue  // Skip index file

      const entry = await this.buildFileIndex(relativePath)
      if (entry) {
        files[relativePath] = entry

        // Build tag index
        for (const tag of entry.metadata.tags || []) {
          const tagLower = tag.toLowerCase()
          if (!tags[tagLower]) tags[tagLower] = []
          tags[tagLower].push(relativePath)
        }

        // Build keyword index
        const fileKeywords = this.extractKeywordsFromEntry(entry)
        for (const keyword of fileKeywords) {
          if (!keywords[keyword]) keywords[keyword] = []
          if (!keywords[keyword].includes(relativePath)) {
            keywords[keyword].push(relativePath)
          }
        }
      }
    }

    // Compute statistics
    const stats = this.computeStats(files, tags)

    this.index = {
      version: INDEX_VERSION,
      lastUpdated: new Date().toISOString(),
      checksum: this.computeChecksum(files),
      files,
      tags,
      keywords,
      stats,
    }

    await this.saveIndex()

    const duration = Date.now() - startTime
    console.log(`[MemoryIndex] Index built in ${duration}ms: ${stats.totalFiles} files, ${stats.totalTags} tags`)

    return this.index
  }

  /**
   * Build index entry for a single file
   */
  async buildFileIndex(relativePath: string): Promise<FileIndexEntry | null> {
    const fullPath = path.join(this.baseDir, relativePath)
    try {
      const content = await fs.readFile(fullPath, 'utf-8')
      const parsed = parseMemoryFile(content)

      // Extract title (first # heading)
      const titleMatch = parsed.content.match(/^#\s+(.+)$/m)
      const title = titleMatch ? titleMatch[1].trim() : path.basename(relativePath, '.md')

      // Extract all ## headings
      const sections: string[] = []
      const sectionRegex = /^##\s+(.+)$/gm
      let match
      while ((match = sectionRegex.exec(parsed.content)) !== null) {
        sections.push(match[1].trim())
      }

      return {
        path: relativePath,
        title,
        metadata: {
          created: parsed.metadata.created,
          updated: parsed.metadata.updated,
          source: parsed.metadata.source,
          tags: parsed.metadata.tags,
          importance: parsed.metadata.importance,
          accessCount: parsed.metadata.accessCount,
        },
        sections,
        contentHash: this.hashContent(content),
      }
    } catch (error) {
      console.warn(`[MemoryIndex] Failed to index file ${relativePath}:`, error)
      return null
    }
  }

  /**
   * Update index for a single file (incremental)
   */
  async updateFileIndex(relativePath: string): Promise<void> {
    if (!this.index) await this.loadIndex()
    if (!this.index) {
      // No index exists, build full index
      await this.buildFullIndex()
      return
    }

    const entry = await this.buildFileIndex(relativePath)
    if (!entry) {
      // File doesn't exist, remove from index
      await this.removeFileIndex(relativePath)
      return
    }

    const oldEntry = this.index.files[relativePath]

    // Check if content actually changed
    if (oldEntry && oldEntry.contentHash === entry.contentHash) {
      return  // No change, skip update
    }

    // Update file index
    this.index.files[relativePath] = entry

    // Update tag index
    if (oldEntry?.metadata.tags) {
      for (const tag of oldEntry.metadata.tags) {
        const tagLower = tag.toLowerCase()
        const idx = this.index.tags[tagLower]?.indexOf(relativePath)
        if (idx !== undefined && idx >= 0) {
          this.index.tags[tagLower].splice(idx, 1)
          if (this.index.tags[tagLower].length === 0) {
            delete this.index.tags[tagLower]
          }
        }
      }
    }
    for (const tag of entry.metadata.tags || []) {
      const tagLower = tag.toLowerCase()
      if (!this.index.tags[tagLower]) this.index.tags[tagLower] = []
      if (!this.index.tags[tagLower].includes(relativePath)) {
        this.index.tags[tagLower].push(relativePath)
      }
    }

    // Update keyword index
    if (oldEntry) {
      const oldKeywords = this.extractKeywordsFromEntry(oldEntry)
      for (const keyword of oldKeywords) {
        const idx = this.index.keywords[keyword]?.indexOf(relativePath)
        if (idx !== undefined && idx >= 0) {
          this.index.keywords[keyword].splice(idx, 1)
          if (this.index.keywords[keyword].length === 0) {
            delete this.index.keywords[keyword]
          }
        }
      }
    }
    const newKeywords = this.extractKeywordsFromEntry(entry)
    for (const keyword of newKeywords) {
      if (!this.index.keywords[keyword]) this.index.keywords[keyword] = []
      if (!this.index.keywords[keyword].includes(relativePath)) {
        this.index.keywords[keyword].push(relativePath)
      }
    }

    // Recompute statistics
    this.index.stats = this.computeStats(this.index.files, this.index.tags)
    this.index.checksum = this.computeChecksum(this.index.files)

    await this.saveIndex()
  }

  /**
   * Remove file from index
   */
  async removeFileIndex(relativePath: string): Promise<void> {
    if (!this.index) return

    const entry = this.index.files[relativePath]
    if (!entry) return

    // Remove tag references
    for (const tag of entry.metadata.tags || []) {
      const tagLower = tag.toLowerCase()
      const idx = this.index.tags[tagLower]?.indexOf(relativePath)
      if (idx !== undefined && idx >= 0) {
        this.index.tags[tagLower].splice(idx, 1)
        if (this.index.tags[tagLower].length === 0) {
          delete this.index.tags[tagLower]
        }
      }
    }

    // Remove keyword references
    for (const keyword of Object.keys(this.index.keywords)) {
      const idx = this.index.keywords[keyword]?.indexOf(relativePath)
      if (idx !== undefined && idx >= 0) {
        this.index.keywords[keyword].splice(idx, 1)
        if (this.index.keywords[keyword].length === 0) {
          delete this.index.keywords[keyword]
        }
      }
    }

    delete this.index.files[relativePath]
    this.index.stats = this.computeStats(this.index.files, this.index.tags)
    this.index.checksum = this.computeChecksum(this.index.files)

    await this.saveIndex()
  }

  // ============================================================================
  // Query Methods
  // ============================================================================

  /**
   * Search files by tag
   */
  searchByTag(tag: string): FileIndexEntry[] {
    if (!this.index) return []
    const paths = this.index.tags[tag.toLowerCase()] || []
    return paths.map(p => this.index!.files[p]).filter(Boolean)
  }

  /**
   * Search files by multiple tags
   */
  searchByTags(tags: string[], mode: 'AND' | 'OR' = 'OR'): FileIndexEntry[] {
    if (!this.index || tags.length === 0) return []

    const results = new Map<string, FileIndexEntry>()

    if (mode === 'OR') {
      // Any tag matches
      for (const tag of tags) {
        for (const entry of this.searchByTag(tag)) {
          results.set(entry.path, entry)
        }
      }
    } else {
      // All tags must match
      const first = this.searchByTag(tags[0])
      for (const entry of first) {
        const hasAllTags = tags.every(tag =>
          entry.metadata.tags?.some(t => t.toLowerCase() === tag.toLowerCase())
        )
        if (hasAllTags) {
          results.set(entry.path, entry)
        }
      }
    }

    return Array.from(results.values())
  }

  /**
   * Search files by keyword
   */
  searchByKeyword(keyword: string): FileIndexEntry[] {
    if (!this.index) return []
    const lowerKeyword = keyword.toLowerCase()

    // 1. Exact match in keyword index
    const exactMatches = this.index.keywords[lowerKeyword] || []

    // 2. Fuzzy match (prefix matching)
    const fuzzyMatches: string[] = []
    for (const [k, paths] of Object.entries(this.index.keywords)) {
      if (k.startsWith(lowerKeyword) && k !== lowerKeyword) {
        fuzzyMatches.push(...paths)
      }
    }

    // 3. Tag match
    const tagMatches = this.index.tags[lowerKeyword] || []

    // Merge and deduplicate
    const allPaths = [...new Set([...exactMatches, ...fuzzyMatches, ...tagMatches])]
    return allPaths.map(p => this.index!.files[p]).filter(Boolean)
  }

  /**
   * Find related files based on shared tags
   */
  findRelatedFiles(relativePath: string, limit: number = 5): FileIndexEntry[] {
    if (!this.index) return []

    const entry = this.index.files[relativePath]
    if (!entry || !entry.metadata.tags?.length) return []

    // Calculate shared tag count for each file
    const scores = new Map<string, number>()

    for (const tag of entry.metadata.tags) {
      const tagLower = tag.toLowerCase()
      const relatedPaths = this.index.tags[tagLower] || []
      for (const p of relatedPaths) {
        if (p !== relativePath) {
          scores.set(p, (scores.get(p) || 0) + 1)
        }
      }
    }

    // Sort by shared tag count
    return Array.from(scores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([p]) => this.index!.files[p])
      .filter(Boolean)
  }

  /**
   * Get file entry by path
   */
  getFileEntry(relativePath: string): FileIndexEntry | null {
    return this.index?.files[relativePath] || null
  }

  /**
   * Get all files
   */
  getAllFiles(): FileIndexEntry[] {
    if (!this.index) return []
    return Object.values(this.index.files)
  }

  /**
   * Get tag cloud data
   */
  getTagCloud(): Array<{ tag: string; count: number }> {
    return this.index?.stats.tagCloud || []
  }

  /**
   * Get statistics
   */
  getStats(): IndexStats | null {
    return this.index?.stats || null
  }

  /**
   * Get recently updated files
   */
  getRecentFiles(limit: number = 10): FileIndexEntry[] {
    if (!this.index) return []

    return Object.values(this.index.files)
      .sort((a, b) =>
        new Date(b.metadata.updated).getTime() - new Date(a.metadata.updated).getTime()
      )
      .slice(0, limit)
  }

  /**
   * Get most accessed files
   */
  getMostAccessedFiles(limit: number = 10): FileIndexEntry[] {
    if (!this.index) return []

    return Object.values(this.index.files)
      .filter(f => (f.metadata.accessCount || 0) > 0)
      .sort((a, b) =>
        (b.metadata.accessCount || 0) - (a.metadata.accessCount || 0)
      )
      .slice(0, limit)
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  /**
   * Recursively scan markdown files
   */
  private async scanMarkdownFiles(dir: string): Promise<string[]> {
    const results: string[] = []
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true })

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name)
        // Skip hidden files and index file
        if (entry.name.startsWith('.') || entry.name === INDEX_FILENAME) continue

        if (entry.isDirectory()) {
          results.push(...await this.scanMarkdownFiles(fullPath))
        } else if (entry.name.endsWith('.md')) {
          results.push(fullPath)
        }
      }
    } catch (error) {
      // Directory may not exist or not accessible
    }

    return results
  }

  /**
   * Extract keywords from index entry
   */
  private extractKeywordsFromEntry(entry: FileIndexEntry): string[] {
    const keywords: string[] = []

    // From title
    const titleWords = entry.title.toLowerCase().match(/[a-z0-9]+|[\u4e00-\u9fa5]+/g) || []
    keywords.push(...titleWords)

    // From section headings
    for (const section of entry.sections) {
      const sectionWords = section.toLowerCase().match(/[a-z0-9]+|[\u4e00-\u9fa5]+/g) || []
      keywords.push(...sectionWords)
    }

    // Filter stop words and short words
    return [...new Set(keywords)].filter(k => k.length >= 2 && !STOP_WORDS.has(k))
  }

  /**
   * Compute content hash (MD5)
   */
  private hashContent(content: string): string {
    return crypto.createHash('md5').update(content).digest('hex').slice(0, 16)
  }

  /**
   * Compute index checksum
   */
  private computeChecksum(files: Record<string, FileIndexEntry>): string {
    const hashes = Object.values(files).map(f => f.contentHash).sort().join('')
    return crypto.createHash('md5').update(hashes).digest('hex').slice(0, 16)
  }

  /**
   * Compute statistics
   */
  private computeStats(
    files: Record<string, FileIndexEntry>,
    tags: Record<string, string[]>
  ): IndexStats {
    const fileList = Object.values(files)

    // Tag cloud (top 20)
    const tagCloud = Object.entries(tags)
      .map(([tag, paths]) => ({ tag, count: paths.length }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20)

    // Recently updated (top 10)
    const recentlyUpdated = fileList
      .sort((a, b) =>
        new Date(b.metadata.updated).getTime() - new Date(a.metadata.updated).getTime()
      )
      .slice(0, 10)
      .map(f => f.path)

    // Most accessed (top 10)
    const mostAccessed = fileList
      .filter(f => (f.metadata.accessCount || 0) > 0)
      .sort((a, b) =>
        (b.metadata.accessCount || 0) - (a.metadata.accessCount || 0)
      )
      .slice(0, 10)
      .map(f => f.path)

    return {
      totalFiles: fileList.length,
      totalSections: fileList.reduce((sum, f) => sum + f.sections.length, 0),
      totalTags: Object.keys(tags).length,
      tagCloud,
      recentlyUpdated,
      mostAccessed,
    }
  }

  /**
   * Check if index needs rebuild
   */
  async needsRebuild(): Promise<boolean> {
    if (!this.index) return true

    // Version mismatch
    if (this.index.version !== INDEX_VERSION) {
      console.log('[MemoryIndex] Version mismatch, rebuild needed')
      return true
    }

    // Check file count (simple heuristic)
    const mdFiles = await this.scanMarkdownFiles(this.baseDir)
    const currentCount = mdFiles.filter(f => !f.endsWith(INDEX_FILENAME)).length
    if (currentCount !== this.index.stats.totalFiles) {
      console.log(`[MemoryIndex] File count mismatch (${currentCount} vs ${this.index.stats.totalFiles}), rebuild needed`)
      return true
    }

    return false
  }
}

// ============================================================================
// Singleton
// ============================================================================

// Store instances per baseDir
const indexManagers = new Map<string, MemoryIndexManager>()

export function getMemoryIndexManager(baseDir?: string): MemoryIndexManager {
  const defaultBaseDir = path.join(app.getPath('home'), '.0nething', 'memory')
  const actualBaseDir = baseDir || defaultBaseDir

  if (!indexManagers.has(actualBaseDir)) {
    indexManagers.set(actualBaseDir, new MemoryIndexManager(actualBaseDir))
  }

  return indexManagers.get(actualBaseDir)!
}
