/**
 * Memory Retriever
 *
 * Handles keyword extraction and memory retrieval logic.
 * Supports both rule-based and AI-powered keyword extraction.
 */

import { getTextMemoryStorage, MemorySection, type MemorySectionWithMeta } from './text-memory-storage.js'
import { getMemoryIndexManager, type FileIndexEntry } from './memory-index.js'
import { getPromptManager } from '../prompt/prompt-manager.js'
import { generateChatResponseWithReasoning } from '../../providers/index.js'
import type { KeywordExtractionVariables } from '../prompt/types.js'

// Re-export keyword extraction from shared utils for backward compatibility
export { extractKeywords } from './utils/keyword-utils.js'
import { extractKeywords } from './utils/keyword-utils.js'

/**
 * Provider configuration for AI-powered features
 */
export interface ProviderConfig {
  providerId: string
  apiKey: string
  model: string
  baseUrl?: string
}

/**
 * Extract keywords using AI (LLM-powered)
 * Falls back to rule-based extraction on failure
 */
export async function extractKeywordsWithAI(
  message: string,
  providerConfig: ProviderConfig
): Promise<string[]> {
  try {
    const promptManager = getPromptManager()

    // Check if PromptManager is initialized
    if (!promptManager.isInitialized()) {
      console.warn('[MemoryRetriever] PromptManager not initialized, falling back to rule-based extraction')
      return extractKeywords(message)
    }

    // Render the prompt using the template
    const prompt = promptManager.render('memory/keyword-extraction', {
      message,
    } as KeywordExtractionVariables)

    // Call the LLM
    const response = await generateChatResponseWithReasoning(
      providerConfig.providerId,
      {
        apiKey: providerConfig.apiKey,
        model: providerConfig.model,
        baseUrl: providerConfig.baseUrl,
      },
      [{ role: 'user', content: prompt }],
      { maxTokens: 200, temperature: 0.3 }
    )

    // Parse the JSON array from response
    const text = response.text.trim()

    // Try to extract JSON array from the response
    const jsonMatch = text.match(/\[[\s\S]*?\]/)
    if (!jsonMatch) {
      console.warn('[MemoryRetriever] AI response is not a valid JSON array:', text)
      return extractKeywords(message)
    }

    const keywords = JSON.parse(jsonMatch[0])

    if (!Array.isArray(keywords)) {
      console.warn('[MemoryRetriever] AI response is not an array:', keywords)
      return extractKeywords(message)
    }

    // Filter out empty strings and ensure all items are strings
    const validKeywords = keywords
      .filter((k): k is string => typeof k === 'string' && k.trim().length > 0)
      .map(k => k.trim().toLowerCase())

    console.log('[MemoryRetriever] AI extracted keywords:', validKeywords)
    return validKeywords

  } catch (error) {
    console.warn('[MemoryRetriever] AI keyword extraction failed, falling back to rule-based:', error)
    return extractKeywords(message)
  }
}

/**
 * Retrieved file info for feedback UI
 * Matches RetrievedMemory type in shared/ipc/chat.ts
 */
export interface RetrievedFile {
  path: string          // Relative path in memory directory
  title: string         // File title
  score: number         // Relevance score (0-100)
  matchType: 'tag' | 'keyword' | 'related'  // How it was matched
}

/**
 * Load core memory (always loaded)
 */
export async function loadCoreMemory(): Promise<string | undefined> {
  const storage = getTextMemoryStorage()
  return storage.loadCoreMemory()
}

/**
 * Load agent relationship memory
 */
export async function loadAgentMemory(agentId: string): Promise<string | undefined> {
  const storage = getTextMemoryStorage()
  return storage.loadAgentRelationship(agentId)
}

/**
 * Scored file entry for ranking
 */
interface ScoredFile {
  entry: FileIndexEntry
  score: number
  matchType: 'tag' | 'keyword' | 'related'
  matchedTerms: string[]
}

/**
 * Result of memory retrieval including content and file info for feedback UI
 */
export interface RetrievalResult {
  content: string | undefined
  retrievedFiles: RetrievedFile[]
}

/**
 * Retrieve relevant memory based on user message using index system
 * Returns both formatted content and file metadata for feedback UI
 *
 * @param userMessage - The user's message to extract keywords from
 * @param agentId - Optional agent ID for agent-specific memories
 * @param providerConfig - Optional provider config for AI-powered keyword extraction
 */
export async function retrieveRelevantMemoryWithFiles(
  userMessage: string,
  agentId?: string,
  providerConfig?: ProviderConfig
): Promise<RetrievalResult> {
  // Use AI extraction if provider config is available, otherwise use rule-based
  const keywords = providerConfig
    ? await extractKeywordsWithAI(userMessage, providerConfig)
    : extractKeywords(userMessage)

  if (keywords.length === 0) {
    console.log('[MemoryRetriever] No keywords extracted from message')
    return { content: undefined, retrievedFiles: [] }
  }

  console.log('[MemoryRetriever] Extracted keywords:', keywords)

  // Try index-based retrieval first (fast path)
  try {
    const storage = getTextMemoryStorage()
    const indexManager = getMemoryIndexManager(storage.getBaseDir())

    // Check if index is available
    const index = await indexManager.loadIndex()
    if (index && index.stats.totalFiles > 0) {
      console.log('[MemoryRetriever] Using index-based retrieval')
      const { sections, files } = await retrieveWithIndexAndFiles(indexManager, keywords, agentId)

      if (sections.length > 0) {
        console.log(`[MemoryRetriever] Found ${sections.length} sections via index`)
        return {
          content: formatSections(sections),
          retrievedFiles: files
        }
      }
    }
  } catch (error) {
    console.warn('[MemoryRetriever] Index retrieval failed, falling back to file scan:', error)
  }

  // Fallback to file scanning (slow path)
  console.log('[MemoryRetriever] Using file scan fallback')
  const storage = getTextMemoryStorage()
  const sections = await storage.searchTopics(keywords, agentId)

  if (sections.length === 0) {
    console.log('[MemoryRetriever] No matching sections found')
    return { content: undefined, retrievedFiles: [] }
  }

  console.log(`[MemoryRetriever] Found ${sections.length} sections via file scan`)
  // File scan doesn't provide scoring info, so no retrievedFiles
  return {
    content: formatSections(sections),
    retrievedFiles: []
  }
}

/**
 * Retrieve relevant memory (backward compatible version)
 * @deprecated Use retrieveRelevantMemoryWithFiles for feedback UI support
 */
export async function retrieveRelevantMemory(
  userMessage: string,
  agentId?: string
): Promise<string | undefined> {
  const result = await retrieveRelevantMemoryWithFiles(userMessage, agentId)
  return result.content
}

/**
 * Index-based retrieval with smart ranking
 * Returns both sections and file metadata for feedback UI
 */
async function retrieveWithIndexAndFiles(
  indexManager: ReturnType<typeof getMemoryIndexManager>,
  keywords: string[],
  agentId?: string
): Promise<{ sections: MemorySectionWithMeta[]; files: RetrievedFile[] }> {
  const scoredFiles: ScoredFile[] = []
  const seenPaths = new Set<string>()

  // Strategy 1: Tag-based matching (highest priority)
  for (const keyword of keywords) {
    const tagResults = indexManager.searchByTag(keyword)
    for (const entry of tagResults) {
      if (!seenPaths.has(entry.path)) {
        seenPaths.add(entry.path)
        scoredFiles.push({
          entry,
          score: 100, // Base score for tag match
          matchType: 'tag',
          matchedTerms: [keyword]
        })
      } else {
        // File already found, boost its score
        const existing = scoredFiles.find(f => f.entry.path === entry.path)
        if (existing) {
          existing.score += 50
          existing.matchedTerms.push(keyword)
        }
      }
    }
  }

  // Strategy 2: Keyword-based matching (medium priority)
  for (const keyword of keywords) {
    const keywordResults = indexManager.searchByKeyword(keyword)
    for (const entry of keywordResults) {
      if (!seenPaths.has(entry.path)) {
        seenPaths.add(entry.path)
        scoredFiles.push({
          entry,
          score: 50, // Lower base score for keyword match
          matchType: 'keyword',
          matchedTerms: [keyword]
        })
      } else {
        // Already found, boost score
        const existing = scoredFiles.find(f => f.entry.path === entry.path)
        if (existing) {
          existing.score += 25
          if (!existing.matchedTerms.includes(keyword)) {
            existing.matchedTerms.push(keyword)
          }
        }
      }
    }
  }

  // Strategy 3: Related files (if we found something)
  if (scoredFiles.length > 0 && scoredFiles.length < 5) {
    const topFile = scoredFiles[0]
    const relatedFiles = indexManager.findRelatedFiles(topFile.entry.path, 3)
    for (const entry of relatedFiles) {
      if (!seenPaths.has(entry.path)) {
        seenPaths.add(entry.path)
        scoredFiles.push({
          entry,
          score: 20, // Lowest score for related files
          matchType: 'related',
          matchedTerms: []
        })
      }
    }
  }

  // Apply metadata-based scoring
  for (const scoredFile of scoredFiles) {
    const { importance = 3, accessCount = 0 } = scoredFile.entry.metadata

    // Importance boost: 1-5 → 0-20 points
    scoredFile.score += (importance - 1) * 5

    // Access count boost: logarithmic scale
    scoredFile.score += Math.log10(accessCount + 1) * 5
  }

  // Sort by score (descending)
  scoredFiles.sort((a, b) => b.score - a.score)

  // Limit to top 10 files
  const topFiles = scoredFiles.slice(0, 10)

  console.log('[MemoryRetriever] Scored files:', topFiles.map(f => ({
    path: f.entry.path,
    score: f.score.toFixed(1),
    matchType: f.matchType,
    terms: f.matchedTerms
  })))

  // Load sections from top files
  const storage = getTextMemoryStorage()
  const sections: MemorySectionWithMeta[] = []

  for (const { entry } of topFiles) {
    try {
      // Read file content
      const parsed = await storage.readMemoryFile(entry.path, true) // Update access stats
      if (!parsed) continue

      // Parse sections
      const fileSections = parseSectionsFromContent(parsed.content, entry.path)

      // Add metadata to each section
      for (const section of fileSections) {
        sections.push({
          ...section,
          metadata: {
            ...entry.metadata,
            source: entry.metadata.source as 'conversation' | 'manual' | 'import' | 'system'
          }
        })
      }
    } catch (error) {
      console.warn(`[MemoryRetriever] Failed to read file ${entry.path}:`, error)
    }
  }

  // Build file metadata for feedback UI
  // Normalize scores to 0-100 range
  const maxScore = Math.max(...topFiles.map(f => f.score), 1)
  const files: RetrievedFile[] = topFiles.map(({ entry, score, matchType }) => ({
    path: entry.path,
    title: entry.title,
    score: Math.round((score / maxScore) * 100),
    matchType,
  }))

  return { sections, files }
}

/**
 * Parse sections from file content
 */
function parseSectionsFromContent(content: string, filePath: string): MemorySection[] {
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
 * Format memory sections into a readable prompt
 */
function formatSections(sections: MemorySection[]): string {
  // Group by file for better organization
  const byFile = new Map<string, MemorySection[]>()

  for (const section of sections) {
    const fileName = section.file.split('/').pop() || section.file
    if (!byFile.has(fileName)) {
      byFile.set(fileName, [])
    }
    byFile.get(fileName)!.push(section)
  }

  const parts: string[] = []

  for (const [fileName, fileSections] of byFile) {
    const topicName = fileName.replace('.md', '')
    parts.push(`### ${topicName}`)

    for (const section of fileSections) {
      parts.push(`**${section.heading}**`)
      parts.push(section.content)
    }
  }

  return parts.join('\n\n')
}

/**
 * Combined memory loading function
 * Returns formatted memory prompt ready for injection, plus retrieved file info for feedback UI
 *
 * @param userMessage - The user's message to extract keywords from
 * @param agentId - Optional agent ID for agent-specific memories
 * @param providerConfig - Optional provider config for AI-powered keyword extraction
 */
export async function loadMemoryForChat(
  userMessage: string,
  agentId?: string,
  providerConfig?: ProviderConfig
): Promise<{
  coreMemory: string | undefined
  agentMemory: string | undefined
  topicMemory: string | undefined
  retrievedFiles: RetrievedFile[]
}> {
  const [coreMemory, agentMemory, topicResult] = await Promise.all([
    loadCoreMemory(),
    agentId ? loadAgentMemory(agentId) : Promise.resolve(undefined),
    retrieveRelevantMemoryWithFiles(userMessage, agentId, providerConfig),
  ])

  return {
    coreMemory,
    agentMemory,
    topicMemory: topicResult.content,
    retrievedFiles: topicResult.retrievedFiles,
  }
}

/**
 * Format all memory types into a single prompt section
 */
export function formatMemoryPrompt(
  coreMemory: string | undefined,
  agentMemory: string | undefined,
  topicMemory: string | undefined
): string | undefined {
  const parts: string[] = []

  if (coreMemory) {
    parts.push('## User Profile\n' + coreMemory)
  }

  if (agentMemory) {
    parts.push('## Agent Relationship\n' + agentMemory)
  }

  if (topicMemory) {
    parts.push('## Relevant Context\n' + topicMemory)
  }

  return parts.length > 0 ? parts.join('\n\n---\n\n') : undefined
}
