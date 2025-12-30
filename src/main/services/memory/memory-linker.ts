/**
 * Memory Linker Service
 *
 * Automatically links related memories to build a knowledge graph.
 * Relationships:
 * - similar: Very similar content (>0.85 similarity)
 * - related: Related topics (0.6-0.85 similarity)
 * - updates: New info that updates old info
 * - contradicts: Contradictory information
 */

import type { AgentMemory } from '../../../shared/ipc.js'
import { getSQLiteStorage, type MemoryLinkRelationship } from '../../storage/index.js'
import {
  getEmbeddingService,
  cosineSimilarity,
  type EmbeddingResult,
} from './embedding-service.js'

// Similarity thresholds
const VERY_SIMILAR_THRESHOLD = 0.85
const RELATED_THRESHOLD = 0.6

// Maximum memories to compare against
const MAX_COMPARISON_MEMORIES = 100

export interface MemoryLinkResult {
  sourceId: string
  targetId: string
  relationship: MemoryLinkRelationship
  similarity: number
}

export interface LinkingStats {
  memoriesProcessed: number
  linksCreated: number
  similarLinks: number
  relatedLinks: number
  updatesLinks: number
  contradictsLinks: number
}

/**
 * Find and create links for a newly added memory
 */
export async function linkNewMemory(
  agentId: string,
  newMemory: AgentMemory
): Promise<MemoryLinkResult[]> {
  const storage = getSQLiteStorage()
  if (!storage) {
    console.warn('[MemoryLinker] SQLite storage not available')
    return []
  }

  const embeddingService = getEmbeddingService()

  // Generate embedding for new memory
  let newEmbedding: number[]
  try {
    const result = await embeddingService.embed(newMemory.content)
    newEmbedding = result.embedding
  } catch (error) {
    console.error('[MemoryLinker] Failed to embed new memory:', error)
    return []
  }

  // Get existing memories for comparison
  const existingMemories = await storage.agentMemory.getActiveMemories(agentId, MAX_COMPARISON_MEMORIES)

  // Filter out the new memory itself
  const comparableMemories = existingMemories.filter(m => m.id !== newMemory.id)

  if (comparableMemories.length === 0) {
    return []
  }

  const links: MemoryLinkResult[] = []

  // Compare with each existing memory
  for (const existing of comparableMemories) {
    // Get embedding for existing memory
    let existingEmbedding: number[]
    try {
      // For memories without embeddings, generate them on the fly
      const result = await embeddingService.embed(existing.content)
      existingEmbedding = result.embedding
    } catch {
      continue
    }

    let similarity = 0
    try {
      similarity = cosineSimilarity(newEmbedding, existingEmbedding)
    } catch (e) {
      console.warn('[MemoryLinker] Embedding dimension mismatch, skipping comparison')
      continue
    }

    if (similarity >= VERY_SIMILAR_THRESHOLD) {
      // Very similar - might be update or duplicate
      const relationship = await classifyHighSimilarityRelationship(
        newMemory.content,
        existing.content
      )

      links.push({
        sourceId: newMemory.id,
        targetId: existing.id,
        relationship,
        similarity,
      })

      // Create the link in storage
      await storage.agentMemory.addMemoryLink(
        newMemory.id,
        existing.id,
        relationship,
        similarity
      )
    } else if (similarity >= RELATED_THRESHOLD) {
      // Related topic
      links.push({
        sourceId: newMemory.id,
        targetId: existing.id,
        relationship: 'related',
        similarity,
      })

      // Create the link in storage
      await storage.agentMemory.addMemoryLink(
        newMemory.id,
        existing.id,
        'related',
        similarity
      )
    }
  }

  if (links.length > 0) {
    console.log(`[MemoryLinker] Created ${links.length} links for memory ${newMemory.id}`)
  }

  return links
}

/**
 * Classify the relationship between two highly similar memories
 */
async function classifyHighSimilarityRelationship(
  newContent: string,
  existingContent: string
): Promise<MemoryLinkRelationship> {
  // Simple heuristic-based classification
  // In the future, this could use LLM classification

  const newLower = newContent.toLowerCase()
  const existingLower = existingContent.toLowerCase()

  // Check for contradiction indicators
  const contradictionPatterns = [
    /不(再|是|喜欢|想)/,  // Chinese: no longer, not
    /changed.*mind/i,
    /no longer/i,
    /stopped/i,
    /quit/i,
    /don't.*anymore/i,
    /hate.*now/i,
    /dislike.*now/i,
  ]

  const hasContradiction = contradictionPatterns.some(
    pattern => pattern.test(newLower) || pattern.test(existingLower)
  )

  if (hasContradiction) {
    // Check if they're about the same topic but with opposite sentiment
    // This is a simplified check - production would use NLI or LLM
    return 'contradicts'
  }

  // Check for update indicators
  const updatePatterns = [
    /now/i,
    /recently/i,
    /started/i,
    /began/i,
    /新/,  // Chinese: new
    /最近/,  // Chinese: recently
    /开始/,  // Chinese: started
  ]

  const isUpdate = updatePatterns.some(pattern => pattern.test(newLower))

  if (isUpdate) {
    return 'updates'
  }

  // Default to similar
  return 'similar'
}

/**
 * Build links for all existing memories in an agent's memory
 * Use this for initial setup or rebuilding the graph
 */
export async function buildMemoryGraph(agentId: string): Promise<LinkingStats> {
  const storage = getSQLiteStorage()
  if (!storage) {
    throw new Error('SQLite storage not available')
  }

  const stats: LinkingStats = {
    memoriesProcessed: 0,
    linksCreated: 0,
    similarLinks: 0,
    relatedLinks: 0,
    updatesLinks: 0,
    contradictsLinks: 0,
  }

  const embeddingService = getEmbeddingService()

  // Get all active memories
  const memories = await storage.agentMemory.getActiveMemories(agentId, 1000)

  if (memories.length < 2) {
    return stats
  }

  console.log(`[MemoryLinker] Building graph for ${memories.length} memories`)

  // Generate embeddings for all memories
  const memoryEmbeddings: Map<string, number[]> = new Map()

  for (const memory of memories) {
    try {
      const result = await embeddingService.embed(memory.content)
      memoryEmbeddings.set(memory.id, result.embedding)
    } catch (error) {
      console.warn(`[MemoryLinker] Failed to embed memory ${memory.id}:`, error)
    }
  }

  // Compare all pairs
  for (let i = 0; i < memories.length; i++) {
    const memory1 = memories[i]
    const embedding1 = memoryEmbeddings.get(memory1.id)
    if (!embedding1) continue

    stats.memoriesProcessed++

    for (let j = i + 1; j < memories.length; j++) {
      const memory2 = memories[j]
      const embedding2 = memoryEmbeddings.get(memory2.id)
      if (!embedding2) continue

      let similarity = 0
      try {
        similarity = cosineSimilarity(embedding1, embedding2)
      } catch (e) {
        console.warn('[MemoryLinker] Embedding dimension mismatch in graph building, skipping pair')
        continue
      }

      let relationship: MemoryLinkRelationship | null = null

      if (similarity >= VERY_SIMILAR_THRESHOLD) {
        relationship = await classifyHighSimilarityRelationship(
          memory1.content,
          memory2.content
        )
      } else if (similarity >= RELATED_THRESHOLD) {
        relationship = 'related'
      }

      if (relationship) {
        await storage.agentMemory.addMemoryLink(
          memory1.id,
          memory2.id,
          relationship,
          similarity
        )

        stats.linksCreated++

        switch (relationship) {
          case 'similar':
            stats.similarLinks++
            break
          case 'related':
            stats.relatedLinks++
            break
          case 'updates':
            stats.updatesLinks++
            break
          case 'contradicts':
            stats.contradictsLinks++
            break
        }
      }
    }
  }

  console.log(`[MemoryLinker] Graph built: ${stats.linksCreated} links created`)
  return stats
}

/**
 * Find memories related to a query using the knowledge graph
 */
export async function findRelatedMemoriesViaGraph(
  agentId: string,
  query: string,
  options: {
    limit?: number
    includeHops?: number  // Number of graph hops to traverse
    minSimilarity?: number
  } = {}
): Promise<Array<AgentMemory & { relevanceScore: number; distance: number }>> {
  const storage = getSQLiteStorage()
  if (!storage) {
    throw new Error('SQLite storage not available')
  }

  const { limit = 10, includeHops = 1, minSimilarity = 0.5 } = options

  // First, get directly similar memories via vector search
  const directMatches = await storage.agentMemory.hybridRetrieveMemories(
    agentId,
    query,
    Math.ceil(limit / 2),
    { minSimilarity }
  )

  // Map to track already included memories
  const includedIds = new Set(directMatches.map(m => m.id))

  // Results with scoring
  const results: Array<AgentMemory & { relevanceScore: number; distance: number }> = []

  // Add direct matches
  for (const match of directMatches) {
    results.push({
      ...match,
      relevanceScore: match.hybridScore,
      distance: 0,
    })
  }

  // Traverse graph for additional related memories
  if (includeHops > 0) {
    for (const directMatch of directMatches) {
      const relatedViaGraph = await storage.agentMemory.findRelatedMemories(
        directMatch.id,
        includeHops
      )

      for (const { memory, distance } of relatedViaGraph) {
        if (!includedIds.has(memory.id)) {
          includedIds.add(memory.id)

          // Calculate relevance score based on distance
          // Closer memories are more relevant
          const relevanceScore = directMatch.hybridScore * Math.pow(0.8, distance)

          results.push({
            ...memory,
            relevanceScore,
            distance,
          })
        }
      }
    }
  }

  // Sort by relevance and limit
  return results
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, limit)
}

/**
 * Get memory graph statistics for an agent
 */
export async function getMemoryGraphStats(agentId: string): Promise<{
  totalMemories: number
  totalLinks: number
  avgLinksPerMemory: number
  linksByType: Record<MemoryLinkRelationship, number>
}> {
  const storage = getSQLiteStorage()
  if (!storage) {
    throw new Error('SQLite storage not available')
  }

  const memories = await storage.agentMemory.getActiveMemories(agentId, 1000)
  const totalMemories = memories.length

  let totalLinks = 0
  const linksByType: Record<MemoryLinkRelationship, number> = {
    similar: 0,
    related: 0,
    updates: 0,
    contradicts: 0,
  }

  for (const memory of memories) {
    const links = await storage.agentMemory.getMemoryLinks(memory.id)
    totalLinks += links.length

    for (const link of links) {
      linksByType[link.relationship]++
    }
  }

  // Divide by 2 because each link is counted twice (once for each connected memory)
  const actualTotalLinks = Math.floor(totalLinks / 2)

  return {
    totalMemories,
    totalLinks: actualTotalLinks,
    avgLinksPerMemory: totalMemories > 0 ? actualTotalLinks / totalMemories : 0,
    linksByType: {
      similar: Math.floor(linksByType.similar / 2),
      related: Math.floor(linksByType.related / 2),
      updates: Math.floor(linksByType.updates / 2),
      contradicts: Math.floor(linksByType.contradicts / 2),
    },
  }
}
