/**
 * Text-Based Memory Storage
 *
 * Manages memory files stored as Markdown in ~/.0nething/memory/
 * Cross-platform paths:
 *   - macOS/Linux: ~/.0nething/memory/
 *   - Windows: C:\Users\<user>\.0nething\memory\
 *
 * Structure:
 *   _core/           - Always loaded (profile, preferences)
 *   topics/          - Shared topic memories (on-demand)
 *   agents/{id}/     - Per-agent memories
 *
 * File Format:
 *   Uses YAML Frontmatter for metadata (compatible with Obsidian, Jekyll, etc.)
 */

import { app } from 'electron'
import * as fs from 'fs/promises'
import * as path from 'path'
import * as yaml from 'yaml'
import { getMemoryIndexManager } from './memory-index.js'
import type {
  MemoryFileMetadata,
  ParsedMemoryFile,
  MemorySection,
  MemorySectionWithMeta,
  AgentRelationship,
  WriteMemoryOptions,
} from './types.js'

// Re-export types for backwards compatibility
export type {
  MemoryFileMetadata,
  ParsedMemoryFile,
  MemorySection,
  MemorySectionWithMeta,
  AgentRelationship,
  WriteMemoryOptions,
}

// ============================================================================
// YAML Frontmatter Parsing
// ============================================================================

/**
 * Parse a Markdown file with YAML Frontmatter
 */
export function parseMemoryFile(fileContent: string): ParsedMemoryFile {
  const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/
  const match = fileContent.match(frontmatterRegex)

  if (match) {
    try {
      const yamlContent = match[1]
      const markdownContent = match[2]
      const metadata = yaml.parse(yamlContent) as MemoryFileMetadata
      return { metadata, content: markdownContent }
    } catch (error) {
      console.warn('[TextMemory] Failed to parse YAML frontmatter:', error)
    }
  }

  // No frontmatter or parse error, return default metadata
  const now = new Date().toISOString()
  return {
    metadata: { created: now, updated: now },
    content: fileContent
  }
}

/**
 * Generate a Markdown file with YAML Frontmatter
 */
export function generateMemoryFile(metadata: MemoryFileMetadata, content: string): string {
  // Clean up undefined values from metadata
  const cleanMetadata = Object.fromEntries(
    Object.entries(metadata).filter(([_, v]) => v !== undefined)
  )
  const yamlStr = yaml.stringify(cleanMetadata)
  return `---\n${yamlStr}---\n${content}`
}

export class TextMemoryStorage {
  private baseDir: string

  constructor(baseDir?: string) {
    // Default to ~/.0nething/memory/ (cross-platform via app.getPath('home'))
    this.baseDir = baseDir || path.join(app.getPath('home'), '.0nething', 'memory')
  }

  /**
   * Initialize the memory directory structure
   */
  async initialize(): Promise<void> {
    const dirs = [
      this.baseDir,
      path.join(this.baseDir, '_core'),
      path.join(this.baseDir, 'topics'),
      path.join(this.baseDir, 'agents'),
    ]

    for (const dir of dirs) {
      await fs.mkdir(dir, { recursive: true })
    }

    // Create default files if they don't exist
    await this.ensureDefaultFiles()
  }

  /**
   * Create default memory files if they don't exist
   */
  private async ensureDefaultFiles(): Promise<void> {
    const now = new Date().toISOString()
    const profilePath = path.join(this.baseDir, '_core', 'profile.md')
    const preferencesPath = path.join(this.baseDir, '_core', 'preferences.md')

    try {
      await fs.access(profilePath)
    } catch {
      const content = generateMemoryFile(
        {
          created: now,
          updated: now,
          source: 'system',
          version: 1,
          tags: ['profile', 'core'],
          importance: 5,
        },
        `# User Profile

## Basic Info
<!-- Add your basic information here -->

## Background
<!-- Add your background here -->
`
      )
      await fs.writeFile(profilePath, content)
    }

    try {
      await fs.access(preferencesPath)
    } catch {
      const content = generateMemoryFile(
        {
          created: now,
          updated: now,
          source: 'system',
          version: 1,
          tags: ['preferences', 'core'],
          importance: 5,
        },
        `# User Preferences

## Communication Style
<!-- How you prefer AI to communicate -->

## Technical Preferences
<!-- Your technical preferences -->
`
      )
      await fs.writeFile(preferencesPath, content)
    }
  }

  /**
   * Load all files from _core/ directory
   */
  async loadCoreMemory(): Promise<string | undefined> {
    const coreDir = path.join(this.baseDir, '_core')

    try {
      const files = await fs.readdir(coreDir)
      const mdFiles = files.filter(f => f.endsWith('.md'))

      if (mdFiles.length === 0) return undefined

      const contents: string[] = []
      for (const file of mdFiles) {
        const filePath = path.join(coreDir, file)
        const content = await fs.readFile(filePath, 'utf-8')
        if (content.trim()) {
          contents.push(content.trim())
        }
      }

      return contents.length > 0 ? contents.join('\n\n---\n\n') : undefined
    } catch (error) {
      console.error('[TextMemory] Failed to load core memory:', error)
      return undefined
    }
  }

  /**
   * Load agent relationship file
   */
  async loadAgentRelationship(agentId: string): Promise<string | undefined> {
    const relationshipPath = path.join(
      this.baseDir, 'agents', agentId, 'relationship.md'
    )

    try {
      const content = await fs.readFile(relationshipPath, 'utf-8')
      return content.trim() || undefined
    } catch {
      return undefined
    }
  }

  /**
   * Search topics directory for matching files
   */
  async searchTopics(
    keywords: string[],
    agentId?: string
  ): Promise<MemorySection[]> {
    const results: MemorySection[] = []
    const lowerKeywords = keywords.map(k => k.toLowerCase())

    // Search shared topics
    const sharedTopicsDir = path.join(this.baseDir, 'topics')
    const sharedResults = await this.searchDirectory(sharedTopicsDir, lowerKeywords)
    results.push(...sharedResults)

    // Search agent-specific topics if agentId provided
    if (agentId) {
      const agentTopicsDir = path.join(this.baseDir, 'agents', agentId, 'topics')
      try {
        const agentResults = await this.searchDirectory(agentTopicsDir, lowerKeywords)
        results.push(...agentResults)
      } catch {
        // Agent topics directory may not exist
      }
    }

    return results
  }

  /**
   * Search a directory for matching markdown files
   */
  private async searchDirectory(
    dirPath: string,
    keywords: string[]
  ): Promise<MemorySection[]> {
    const results: MemorySection[] = []

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true })

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name)

        if (entry.isDirectory()) {
          // Recursively search subdirectories
          const subResults = await this.searchDirectory(fullPath, keywords)
          results.push(...subResults)
        } else if (entry.name.endsWith('.md')) {
          // Check filename match
          const fileNameLower = entry.name.toLowerCase().replace('.md', '')
          const fileNameMatch = keywords.some(k => fileNameLower.includes(k))

          const content = await fs.readFile(fullPath, 'utf-8')

          if (fileNameMatch) {
            // If filename matches, include all sections
            const sections = this.parseSections(content, fullPath)
            results.push(...sections)
          } else {
            // Search content for matching sections
            const matchingSections = this.findMatchingSections(content, keywords, fullPath)
            results.push(...matchingSections)
          }
        }
      }
    } catch (error) {
      // Directory may not exist
    }

    return results
  }

  /**
   * Parse markdown content into sections (split by ## headings)
   */
  private parseSections(content: string, filePath: string): MemorySection[] {
    const sections: MemorySection[] = []
    const lines = content.split('\n')

    let currentHeading = ''
    let currentContent: string[] = []

    for (const line of lines) {
      if (line.startsWith('## ')) {
        // Save previous section
        if (currentHeading && currentContent.length > 0) {
          sections.push({
            heading: currentHeading,
            content: currentContent.join('\n').trim(),
            file: filePath,
          })
        }
        currentHeading = line.substring(3).trim()
        currentContent = []
      } else if (currentHeading) {
        currentContent.push(line)
      }
    }

    // Save last section
    if (currentHeading && currentContent.length > 0) {
      sections.push({
        heading: currentHeading,
        content: currentContent.join('\n').trim(),
        file: filePath,
      })
    }

    return sections
  }

  /**
   * Find sections that contain matching keywords
   */
  private findMatchingSections(
    content: string,
    keywords: string[],
    filePath: string
  ): MemorySection[] {
    const sections = this.parseSections(content, filePath)

    return sections.filter(section => {
      const lowerContent = (section.heading + ' ' + section.content).toLowerCase()
      return keywords.some(keyword => lowerContent.includes(keyword))
    })
  }

  /**
   * Write content to a memory file (auto-maintains metadata)
   */
  async writeMemoryFile(
    relativePath: string,
    content: string,
    options?: WriteMemoryOptions
  ): Promise<void> {
    const fullPath = path.join(this.baseDir, relativePath)
    const dir = path.dirname(fullPath)
    await fs.mkdir(dir, { recursive: true })

    const now = new Date().toISOString()
    let metadata: MemoryFileMetadata

    // Try to read existing file's metadata
    try {
      const existing = await fs.readFile(fullPath, 'utf-8')
      const parsed = parseMemoryFile(existing)
      metadata = {
        ...parsed.metadata,
        updated: now,
        version: (parsed.metadata.version || 0) + 1,
      }
      // Merge in new options (don't override with undefined)
      if (options?.source) metadata.source = options.source
      if (options?.sourceId) metadata.sourceId = options.sourceId
      if (options?.tags) metadata.tags = options.tags
      if (options?.author) metadata.author = options.author
      if (options?.importance) metadata.importance = options.importance
    } catch {
      // New file
      metadata = {
        created: now,
        updated: now,
        version: 1,
        source: options?.source || 'manual',
        sourceId: options?.sourceId,
        tags: options?.tags,
        author: options?.author,
        importance: options?.importance,
      }
    }

    const fileContent = generateMemoryFile(metadata, content)
    await fs.writeFile(fullPath, fileContent, 'utf-8')

    // Update index after writing
    const indexManager = getMemoryIndexManager(this.baseDir)
    await indexManager.updateFileIndex(relativePath)
  }

  /**
   * Write raw content without metadata processing
   * (for backward compatibility with existing code)
   */
  async writeMemoryFileRaw(
    relativePath: string,
    content: string
  ): Promise<void> {
    const fullPath = path.join(this.baseDir, relativePath)
    const dir = path.dirname(fullPath)
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(fullPath, content, 'utf-8')

    // Update index after writing
    const indexManager = getMemoryIndexManager(this.baseDir)
    await indexManager.updateFileIndex(relativePath)
  }

  /**
   * Read a memory file and optionally update access stats
   */
  async readMemoryFile(
    relativePath: string,
    updateAccessStats: boolean = false
  ): Promise<ParsedMemoryFile | null> {
    const fullPath = path.join(this.baseDir, relativePath)

    try {
      const content = await fs.readFile(fullPath, 'utf-8')
      const parsed = parseMemoryFile(content)

      // Optionally update access statistics
      if (updateAccessStats) {
        const now = new Date().toISOString()
        const updatedMetadata: MemoryFileMetadata = {
          ...parsed.metadata,
          lastAccessed: now,
          accessCount: (parsed.metadata.accessCount || 0) + 1
        }
        // Async update, don't block read
        this.updateMetadataOnly(relativePath, updatedMetadata).catch(() => {})
      }

      return parsed
    } catch {
      return null
    }
  }

  /**
   * Update only metadata without changing content
   */
  private async updateMetadataOnly(
    relativePath: string,
    metadata: MemoryFileMetadata
  ): Promise<void> {
    const fullPath = path.join(this.baseDir, relativePath)
    try {
      const content = await fs.readFile(fullPath, 'utf-8')
      const parsed = parseMemoryFile(content)
      const fileContent = generateMemoryFile(metadata, parsed.content)
      await fs.writeFile(fullPath, fileContent, 'utf-8')
    } catch (error) {
      console.warn('[TextMemory] Failed to update metadata:', error)
    }
  }

  /**
   * Replace entire content of a specific section in a file
   */
  async replaceSection(
    relativePath: string,
    sectionHeading: string,
    newContent: string,
    options?: WriteMemoryOptions
  ): Promise<void> {
    const fullPath = path.join(this.baseDir, relativePath)

    let existingContent = ''
    try {
      existingContent = await fs.readFile(fullPath, 'utf-8')
    } catch {
      // File doesn't exist, create with section
      const newFile = `# ${path.basename(relativePath, '.md')}\n\n## ${sectionHeading}\n${newContent}\n`
      await this.writeMemoryFile(relativePath, newFile, options)
      return
    }

    // Parse existing file to preserve metadata
    const parsed = parseMemoryFile(existingContent)
    const lines = parsed.content.split('\n')
    const result: string[] = []
    let foundSection = false
    let inTargetSection = false
    let skipUntilNextSection = false

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      if (line.startsWith('## ')) {
        if (line.substring(3).trim() === sectionHeading) {
          foundSection = true
          inTargetSection = true
          skipUntilNextSection = true
          result.push(line)
          // Add new content right after section heading
          result.push(newContent)
        } else {
          inTargetSection = false
          skipUntilNextSection = false
          result.push(line)
        }
      } else if (!skipUntilNextSection) {
        result.push(line)
      }
    }

    // If section not found, append new section
    if (!foundSection) {
      result.push('')
      result.push(`## ${sectionHeading}`)
      result.push(newContent)
    }

    await this.writeMemoryFile(relativePath, result.join('\n'), options)
  }

  /**
   * Append content to a specific section in a file
   * - Deduplicates: won't add if exact content already exists in section
   */
  async appendToSection(
    relativePath: string,
    sectionHeading: string,
    newContent: string,
    options?: WriteMemoryOptions
  ): Promise<void> {
    const fullPath = path.join(this.baseDir, relativePath)

    let existingContent = ''
    try {
      existingContent = await fs.readFile(fullPath, 'utf-8')
    } catch {
      // File doesn't exist, create with section
      const newFile = `# ${path.basename(relativePath, '.md')}\n\n## ${sectionHeading}\n${newContent}\n`
      await this.writeMemoryFile(relativePath, newFile, options)
      return
    }

    // Parse existing file to preserve metadata
    const parsed = parseMemoryFile(existingContent)
    const lines = parsed.content.split('\n')
    const result: string[] = []
    let foundSection = false
    let inTargetSection = false
    let sectionContent: string[] = []

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      if (line.startsWith('## ')) {
        if (line.substring(3).trim() === sectionHeading) {
          foundSection = true
          inTargetSection = true
          sectionContent = []
          result.push(line)
        } else {
          if (inTargetSection) {
            // Check for duplicate before appending
            const normalizedNew = this.normalizeContent(newContent)
            const isDuplicate = sectionContent.some(
              existingLine => this.normalizeContent(existingLine) === normalizedNew
            )
            if (!isDuplicate) {
              result.push(newContent)
            } else {
              console.log(`[TextMemory] Skipping duplicate content in ${relativePath}/${sectionHeading}`)
            }
            inTargetSection = false
          }
          result.push(line)
        }
      } else {
        if (inTargetSection && line.trim()) {
          sectionContent.push(line)
        }
        result.push(line)
      }
    }

    // If still in target section at end of file
    if (inTargetSection) {
      const normalizedNew = this.normalizeContent(newContent)
      const isDuplicate = sectionContent.some(
        existingLine => this.normalizeContent(existingLine) === normalizedNew
      )
      if (!isDuplicate) {
        result.push(newContent)
      } else {
        console.log(`[TextMemory] Skipping duplicate content in ${relativePath}/${sectionHeading}`)
      }
    }

    // If section not found, append new section
    if (!foundSection) {
      result.push('')
      result.push(`## ${sectionHeading}`)
      result.push(newContent)
    }

    await this.writeMemoryFile(relativePath, result.join('\n'), options)
  }

  /**
   * Normalize content for comparison (strip markdown formatting, whitespace)
   */
  private normalizeContent(content: string): string {
    return content
      .replace(/^[\s\-•*]+/, '')  // Remove leading dashes, bullets, whitespace
      .replace(/\s+/g, ' ')        // Normalize whitespace
      .trim()
      .toLowerCase()
  }

  /**
   * Create or update agent relationship file
   */
  async updateAgentRelationship(
    agentId: string,
    updates: Partial<AgentRelationship>
  ): Promise<void> {
    const relativePath = `agents/${agentId}/relationship.md`
    const fullPath = path.join(this.baseDir, relativePath)

    let content = ''
    try {
      content = await fs.readFile(fullPath, 'utf-8')
    } catch {
      // Create new relationship file
      content = `# Agent Relationship

## Basic Status
- Trust Level: ${updates.trustLevel ?? 50}/100
- Familiarity: ${updates.familiarity ?? 30}/100
- Total Interactions: ${updates.totalInteractions ?? 0}

## Current Mood
- Status: ${updates.currentMood ?? 'neutral'}
${updates.moodNotes ? `- Notes: ${updates.moodNotes}` : ''}

## Memory Points
${(updates.memories ?? []).map(m => `- ${m}`).join('\n')}
`
      await this.writeMemoryFile(relativePath, content)
      return
    }

    // Update existing content (simple key-value replacement)
    if (updates.trustLevel !== undefined) {
      content = content.replace(
        /Trust Level: \d+/,
        `Trust Level: ${updates.trustLevel}`
      )
    }
    if (updates.familiarity !== undefined) {
      content = content.replace(
        /Familiarity: \d+/,
        `Familiarity: ${updates.familiarity}`
      )
    }
    if (updates.totalInteractions !== undefined) {
      content = content.replace(
        /Total Interactions: \d+/,
        `Total Interactions: ${updates.totalInteractions}`
      )
    }
    if (updates.currentMood !== undefined) {
      content = content.replace(
        /Status: \w+/,
        `Status: ${updates.currentMood}`
      )
    }

    await this.writeMemoryFile(relativePath, content)
  }

  /**
   * Record an interaction with an agent
   */
  async recordInteraction(agentId: string): Promise<void> {
    const relativePath = `agents/${agentId}/relationship.md`
    const fullPath = path.join(this.baseDir, relativePath)

    try {
      let content = await fs.readFile(fullPath, 'utf-8')
      const match = content.match(/Total Interactions: (\d+)/)
      if (match) {
        const current = parseInt(match[1], 10)
        content = content.replace(
          /Total Interactions: \d+/,
          `Total Interactions: ${current + 1}`
        )
        await this.writeMemoryFile(relativePath, content)
      }
    } catch {
      // Create new relationship file with first interaction
      await this.updateAgentRelationship(agentId, { totalInteractions: 1 })
    }
  }

  /**
   * List all topic files
   */
  async listTopicFiles(): Promise<string[]> {
    const topicsDir = path.join(this.baseDir, 'topics')
    const files: string[] = []

    try {
      const entries = await fs.readdir(topicsDir, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith('.md')) {
          files.push(entry.name)
        }
      }
    } catch {
      // Directory may not exist
    }

    return files
  }

  /**
   * Get the base directory path
   */
  getBaseDir(): string {
    return this.baseDir
  }

  /**
   * Search topics with metadata for enhanced sorting
   */
  async searchTopicsWithMetadata(
    keywords: string[],
    agentId?: string
  ): Promise<MemorySectionWithMeta[]> {
    const results = await this.searchTopics(keywords, agentId)

    // Add metadata to each result
    const resultsWithMeta = await Promise.all(
      results.map(async (section) => {
        const relativePath = path.relative(this.baseDir, section.file)
        const parsed = await this.readMemoryFile(relativePath, false)
        return {
          ...section,
          metadata: parsed?.metadata
        } as MemorySectionWithMeta
      })
    )

    // Sort by importance and access frequency
    return resultsWithMeta.sort((a, b) => {
      const scoreA = (a.metadata?.importance || 3) * 10 + (a.metadata?.accessCount || 0)
      const scoreB = (b.metadata?.importance || 3) * 10 + (b.metadata?.accessCount || 0)
      return scoreB - scoreA
    })
  }

  /**
   * Get metadata for a specific file
   */
  async getFileMetadata(relativePath: string): Promise<MemoryFileMetadata | null> {
    const parsed = await this.readMemoryFile(relativePath, false)
    return parsed?.metadata || null
  }

  /**
   * Update metadata for a specific file
   */
  async updateFileMetadata(
    relativePath: string,
    updates: Partial<MemoryFileMetadata>
  ): Promise<void> {
    const parsed = await this.readMemoryFile(relativePath, false)
    if (!parsed) return

    const now = new Date().toISOString()
    const newMetadata: MemoryFileMetadata = {
      ...parsed.metadata,
      ...updates,
      updated: now,
    }

    await this.updateMetadataOnly(relativePath, newMetadata)
  }
}

// Singleton instance
let storageInstance: TextMemoryStorage | null = null

export function getTextMemoryStorage(): TextMemoryStorage {
  if (!storageInstance) {
    storageInstance = new TextMemoryStorage()
  }
  return storageInstance
}

export async function initializeTextMemory(): Promise<void> {
  const storage = getTextMemoryStorage()
  await storage.initialize()

  // Initialize index
  const indexManager = getMemoryIndexManager(storage.getBaseDir())
  await indexManager.loadIndex()

  if (await indexManager.needsRebuild()) {
    console.log('[TextMemory] Building index...')
    await indexManager.buildFullIndex()
    console.log('[TextMemory] Index built successfully')
  } else {
    console.log('[TextMemory] Index loaded from cache')
  }

  console.log('[TextMemory] Initialized at:', storage.getBaseDir())
}
