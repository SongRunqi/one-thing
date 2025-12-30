/**
 * Memory Conflict Resolver
 *
 * Detects and resolves conflicts when adding new memories.
 * Handles cases like:
 * - Direct contradictions ("likes coffee" vs "hates coffee")
 * - Partial updates ("works at CompanyA" -> "works at CompanyB")
 * - Duplicate information
 */

import type { AgentMemory, UserFact } from '../../../shared/ipc.js'
import { getSQLiteStorage } from '../../storage/index.js'
import { getEmbeddingService, cosineSimilarity } from './embedding-service.js'

// Similarity threshold for potential conflicts
const CONFLICT_SIMILARITY_THRESHOLD = 0.8

// Resolution strategies
export type ConflictResolution = 'keep_new' | 'keep_old' | 'merge' | 'ask_user' | 'none'

export type ConflictType = 'direct_contradiction' | 'partial_update' | 'duplicate' | 'none'

export interface ConflictResult {
  hasConflict: boolean
  conflictType: ConflictType
  conflictingItems: Array<AgentMemory | UserFact>
  resolution: ConflictResolution
  confidence: number  // 0-1, how confident we are in the conflict detection
  reason: string
}

export interface ResolvedConflict {
  action: 'created' | 'updated' | 'superseded' | 'skipped' | 'merged'
  newItemId?: string
  supersededIds?: string[]
  mergedContent?: string
}

// Contradiction indicators
const CONTRADICTION_PATTERNS = {
  negation: [
    // English negation pairs
    { positive: /\b(like|love|enjoy)\b/i, negative: /\b(hate|dislike|don't like|don't enjoy)\b/i },
    { positive: /\b(is|am|are)\b/i, negative: /\b(isn't|is not|am not|aren't|are not)\b/i },
    { positive: /\b(can|able)\b/i, negative: /\b(can't|cannot|unable)\b/i },
    { positive: /\b(want|prefer)\b/i, negative: /\b(don't want|don't prefer|refuse)\b/i },
    { positive: /\b(always|usually)\b/i, negative: /\b(never|rarely|seldom)\b/i },
    // Chinese negation pairs
    { positive: /喜欢/, negative: /不喜欢|讨厌|厌恶/ },
    { positive: /是/, negative: /不是|并非/ },
    { positive: /想要/, negative: /不想|不要/ },
    { positive: /经常|总是/, negative: /从不|很少|几乎不/ },
  ],

  // Topics that commonly get updated
  updateTopics: [
    /\b(work|job|company|employer)\b/i,
    /\b(live|home|address|location)\b/i,
    /\b(age|birthday|born)\b/i,
    /\b(status|relationship|married|single)\b/i,
    /工作|公司|职位/,
    /住|地址|位置/,
    /年龄|生日/,
    /状态|关系/,
  ],
}

/**
 * Detect conflicts with existing memories
 */
export async function detectMemoryConflict(
  agentId: string,
  newContent: string,
  existingMemories: AgentMemory[]
): Promise<ConflictResult> {
  if (existingMemories.length === 0) {
    return {
      hasConflict: false,
      conflictType: 'none',
      conflictingItems: [],
      resolution: 'none',
      confidence: 1.0,
      reason: 'No existing memories to compare',
    }
  }

  const embeddingService = getEmbeddingService()

  // Generate embedding for new content
  let newEmbedding: number[]
  try {
    const result = await embeddingService.embed(newContent)
    newEmbedding = result.embedding
  } catch (error) {
    console.error('[ConflictResolver] Failed to embed new content:', error)
    return {
      hasConflict: false,
      conflictType: 'none',
      conflictingItems: [],
      resolution: 'none',
      confidence: 0.3,
      reason: 'Failed to generate embedding',
    }
  }

  const conflictingItems: AgentMemory[] = []
  let highestSimilarity = 0
  let mostSimilarMemory: AgentMemory | null = null

  // Find similar existing memories
  for (const memory of existingMemories) {
    try {
      const existingResult = await embeddingService.embed(memory.content)
      const similarity = cosineSimilarity(newEmbedding, existingResult.embedding)

      if (similarity >= CONFLICT_SIMILARITY_THRESHOLD) {
        conflictingItems.push(memory)

        if (similarity > highestSimilarity) {
          highestSimilarity = similarity
          mostSimilarMemory = memory
        }
      }
    } catch {
      continue
    }
  }

  if (conflictingItems.length === 0) {
    return {
      hasConflict: false,
      conflictType: 'none',
      conflictingItems: [],
      resolution: 'none',
      confidence: 0.9,
      reason: 'No similar memories found',
    }
  }

  // Analyze the type of conflict
  const conflictAnalysis = analyzeConflictType(newContent, mostSimilarMemory!.content)

  return {
    hasConflict: true,
    conflictType: conflictAnalysis.type,
    conflictingItems,
    resolution: conflictAnalysis.suggestedResolution,
    confidence: conflictAnalysis.confidence,
    reason: conflictAnalysis.reason,
  }
}

/**
 * Detect conflicts with existing user facts
 */
export async function detectFactConflict(
  newContent: string,
  existingFacts: UserFact[]
): Promise<ConflictResult> {
  if (existingFacts.length === 0) {
    return {
      hasConflict: false,
      conflictType: 'none',
      conflictingItems: [],
      resolution: 'none',
      confidence: 1.0,
      reason: 'No existing facts to compare',
    }
  }

  const embeddingService = getEmbeddingService()

  let newEmbedding: number[]
  try {
    const result = await embeddingService.embed(newContent)
    newEmbedding = result.embedding
  } catch (error) {
    return {
      hasConflict: false,
      conflictType: 'none',
      conflictingItems: [],
      resolution: 'none',
      confidence: 0.3,
      reason: 'Failed to generate embedding',
    }
  }

  const conflictingItems: UserFact[] = []
  let highestSimilarity = 0
  let mostSimilarFact: UserFact | null = null

  for (const fact of existingFacts) {
    try {
      const existingResult = await embeddingService.embed(fact.content)
      const similarity = cosineSimilarity(newEmbedding, existingResult.embedding)

      if (similarity >= CONFLICT_SIMILARITY_THRESHOLD) {
        conflictingItems.push(fact)

        if (similarity > highestSimilarity) {
          highestSimilarity = similarity
          mostSimilarFact = fact
        }
      }
    } catch {
      continue
    }
  }

  if (conflictingItems.length === 0) {
    return {
      hasConflict: false,
      conflictType: 'none',
      conflictingItems: [],
      resolution: 'none',
      confidence: 0.9,
      reason: 'No similar facts found',
    }
  }

  const conflictAnalysis = analyzeConflictType(newContent, mostSimilarFact!.content)

  return {
    hasConflict: true,
    conflictType: conflictAnalysis.type,
    conflictingItems,
    resolution: conflictAnalysis.suggestedResolution,
    confidence: conflictAnalysis.confidence,
    reason: conflictAnalysis.reason,
  }
}

/**
 * Analyze the type of conflict between two pieces of content
 */
function analyzeConflictType(
  newContent: string,
  existingContent: string
): {
  type: ConflictType
  suggestedResolution: ConflictResolution
  confidence: number
  reason: string
} {
  const newLower = newContent.toLowerCase()
  const existingLower = existingContent.toLowerCase()

  // Check for exact duplicate
  if (newLower === existingLower) {
    return {
      type: 'duplicate',
      suggestedResolution: 'keep_old',
      confidence: 1.0,
      reason: 'Exact duplicate content',
    }
  }

  // Check for near-duplicate (very high similarity)
  const words1 = new Set(newLower.split(/\s+/))
  const words2 = new Set(existingLower.split(/\s+/))
  const intersection = new Set([...words1].filter(x => words2.has(x)))
  const union = new Set([...words1, ...words2])
  const jaccardSimilarity = intersection.size / union.size

  if (jaccardSimilarity > 0.9) {
    return {
      type: 'duplicate',
      suggestedResolution: 'keep_new',
      confidence: 0.85,
      reason: 'Near-duplicate content',
    }
  }

  // Check for direct contradiction
  for (const pattern of CONTRADICTION_PATTERNS.negation) {
    const newHasPositive = pattern.positive.test(newContent)
    const newHasNegative = pattern.negative.test(newContent)
    const existingHasPositive = pattern.positive.test(existingContent)
    const existingHasNegative = pattern.negative.test(existingContent)

    // Contradiction: one has positive, other has negative for same topic
    if ((newHasPositive && existingHasNegative) || (newHasNegative && existingHasPositive)) {
      return {
        type: 'direct_contradiction',
        suggestedResolution: 'keep_new',
        confidence: 0.75,
        reason: 'Detected opposing sentiment/statement',
      }
    }
  }

  // Check for update patterns (same topic, different values)
  for (const topicPattern of CONTRADICTION_PATTERNS.updateTopics) {
    if (topicPattern.test(newContent) && topicPattern.test(existingContent)) {
      // Same topic mentioned in both - likely an update
      return {
        type: 'partial_update',
        suggestedResolution: 'keep_new',
        confidence: 0.7,
        reason: 'Same topic with potentially updated information',
      }
    }
  }

  // Default: consider it a partial update if very similar
  return {
    type: 'partial_update',
    suggestedResolution: 'keep_new',
    confidence: 0.5,
    reason: 'Similar content that may be an update',
  }
}

/**
 * Resolve a memory conflict
 */
export async function resolveMemoryConflict(
  agentId: string,
  newMemory: Omit<AgentMemory, 'id'>,
  conflict: ConflictResult
): Promise<ResolvedConflict> {
  const storage = getSQLiteStorage()
  if (!storage) {
    throw new Error('SQLite storage not available')
  }

  switch (conflict.resolution) {
    case 'keep_new': {
      // Mark old memories as superseded, add new one
      const addedMemory = await storage.agentMemory.addMemory(agentId, newMemory)

      const supersededIds: string[] = []
      for (const oldItem of conflict.conflictingItems) {
        if ('vividness' in oldItem) {  // It's a memory
          await storage.agentMemory.markSuperseded(oldItem.id, addedMemory.id)
          supersededIds.push(oldItem.id)
        }
      }

      return {
        action: 'superseded',
        newItemId: addedMemory.id,
        supersededIds,
      }
    }

    case 'keep_old': {
      // Don't add the new memory
      return {
        action: 'skipped',
      }
    }

    case 'merge': {
      // Merge old and new content (simple concatenation for now)
      const oldContent = conflict.conflictingItems[0]?.content || ''
      const mergedContent = `${oldContent}\n\n[Updated]: ${newMemory.content}`

      const addedMemory = await storage.agentMemory.addMemory(agentId, {
        ...newMemory,
        content: mergedContent,
        strength: Math.max(newMemory.strength, (conflict.conflictingItems[0] as AgentMemory)?.strength || 0),
      })

      // Mark old as superseded
      const supersededIds: string[] = []
      for (const oldItem of conflict.conflictingItems) {
        if ('vividness' in oldItem) {
          await storage.agentMemory.markSuperseded(oldItem.id, addedMemory.id)
          supersededIds.push(oldItem.id)
        }
      }

      return {
        action: 'merged',
        newItemId: addedMemory.id,
        supersededIds,
        mergedContent,
      }
    }

    case 'none':
    default: {
      // No conflict, just add normally
      const addedMemory = await storage.agentMemory.addMemory(agentId, newMemory)

      return {
        action: 'created',
        newItemId: addedMemory.id,
      }
    }
  }
}

/**
 * Resolve a user fact conflict
 */
export async function resolveFactConflict(
  newFact: { content: string; category: string; confidence: number },
  conflict: ConflictResult
): Promise<ResolvedConflict> {
  const storage = getSQLiteStorage()
  if (!storage) {
    throw new Error('SQLite storage not available')
  }

  switch (conflict.resolution) {
    case 'keep_new': {
      // Update old fact with new content
      const oldFact = conflict.conflictingItems[0] as UserFact
      if (oldFact) {
        const updatedFact = await storage.userProfile.updateFact(oldFact.id, {
          content: newFact.content,
          confidence: newFact.confidence,
        })

        return {
          action: 'updated',
          newItemId: updatedFact?.id,
        }
      }

      // If no old fact, add new one
      const addedFact = await storage.userProfile.addFact(
        newFact.content,
        newFact.category as any,
        newFact.confidence
      )

      return {
        action: 'created',
        newItemId: addedFact.id,
      }
    }

    case 'keep_old': {
      return {
        action: 'skipped',
      }
    }

    case 'merge': {
      const oldFact = conflict.conflictingItems[0] as UserFact
      const mergedContent = `${oldFact?.content || ''} (also: ${newFact.content})`

      if (oldFact) {
        const updatedFact = await storage.userProfile.updateFact(oldFact.id, {
          content: mergedContent,
          confidence: Math.max(newFact.confidence, oldFact.confidence),
        })

        return {
          action: 'merged',
          newItemId: updatedFact?.id,
          mergedContent,
        }
      }

      const addedFact = await storage.userProfile.addFact(
        mergedContent,
        newFact.category as any,
        newFact.confidence
      )

      return {
        action: 'created',
        newItemId: addedFact.id,
      }
    }

    case 'none':
    default: {
      const addedFact = await storage.userProfile.addFact(
        newFact.content,
        newFact.category as any,
        newFact.confidence
      )

      return {
        action: 'created',
        newItemId: addedFact.id,
      }
    }
  }
}

/**
 * Add memory with automatic conflict detection and resolution
 */
export async function addMemoryWithConflictResolution(
  agentId: string,
  memory: Omit<AgentMemory, 'id'>
): Promise<{
  memory: AgentMemory | null
  conflict: ConflictResult
  resolution: ResolvedConflict
}> {
  const storage = getSQLiteStorage()
  if (!storage) {
    throw new Error('SQLite storage not available')
  }

  // Get existing memories
  const existingMemories = await storage.agentMemory.getActiveMemories(agentId, 100)

  // Detect conflicts
  const conflict = await detectMemoryConflict(agentId, memory.content, existingMemories)

  // Resolve conflict
  const resolution = await resolveMemoryConflict(agentId, memory, conflict)

  // Get the final memory if one was created/updated
  let finalMemory: AgentMemory | null = null
  if (resolution.newItemId) {
    // Recall to get the full memory object
    finalMemory = await storage.agentMemory.recallMemory(agentId, resolution.newItemId)
  }

  return {
    memory: finalMemory,
    conflict,
    resolution,
  }
}
