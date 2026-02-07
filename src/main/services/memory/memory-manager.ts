/**
 * Memory Manager Service
 *
 * Manages memory operations using a Mem0-style approach:
 * 1. Use embedding similarity to find related memories (fast, cheap)
 * 2. Use LLM to decide operation: ADD, UPDATE, DELETE, or NOOP
 *
 * This avoids duplicate memories and handles contradictions intelligently.
 */

import { generateChatResponse } from '../../providers/index.js'
import { getStorage } from '../../storage/index.js'
import { getEmbeddingService, cosineSimilarity } from './embedding-service.js'
import type { ProviderConfig, UserFact, UserFactCategory, AgentMemory, MemoryVividness } from '../../../shared/ipc.js'

// Memory operation types (Mem0 style)
export type MemoryOperation = 'ADD' | 'UPDATE' | 'DELETE' | 'NOOP'

export interface MemoryDecision {
  operation: MemoryOperation
  reason: string
  targetId?: string  // ID of existing memory to update/delete
  mergedContent?: string  // For UPDATE: merged content
}

// Similarity threshold for finding related memories
// Lowered from 0.6 to 0.4 to catch related but semantically different facts
// (e.g., "出生于2000年" and "生日是11月28日")
const SIMILARITY_THRESHOLD = 0.4

// Even lower threshold for same-category facts
const SAME_CATEGORY_THRESHOLD = 0.25

// LLM prompt for memory decision (based on Mem0 style)
// Reference: https://docs.mem0.ai/open-source/features/custom-update-memory-prompt
const MEMORY_DECISION_PROMPT = `You are a smart memory manager. Decide what operation to perform based on new information and existing memories.

## New Information
{newContent}

## Existing Related Memories
{existingMemories}

## Operations

1. **ADD**: New information contains completely new content not in any existing memory
2. **UPDATE**: New information enriches or complements existing memory. Keep the version with more details.
   - Example: Existing "likes basketball" + New "likes playing basketball with friends" → UPDATE to "likes playing basketball with friends"
   - Example: Existing "born in 2000" + New "birthday is November 28 (lunar calendar)" → UPDATE to "born in 2000, birthday is November 28 (lunar calendar)"
3. **DELETE**: New information directly contradicts existing memory
   - Example: Existing "likes spicy food" + New "doesn't eat spicy food" → DELETE old memory
4. **NOOP**: New information is already contained in existing memory, or expresses the same meaning

## Important Rules
- For UPDATE: Preserve ALL original information and ADD new details
- Do NOT infer or add information not explicitly mentioned
- Keep the merged content in the SAME LANGUAGE as the input

Return JSON only:
{"operation":"ADD/UPDATE/DELETE/NOOP","reason":"brief reason","targetId":"memory ID if UPDATE/DELETE","mergedContent":"full merged content if UPDATE"}`

/**
 * Find memories similar to the new content using embedding
 * Now also considers same-category facts with a lower threshold
 */
async function findSimilarMemories(
  content: string,
  existingMemories: Array<{ id: string; content: string; category?: string; embedding?: number[] }>,
  targetCategory?: string
): Promise<Array<{ id: string; content: string; similarity: number }>> {
  const embeddingService = getEmbeddingService()
  const contentPreview = content.length > 50 ? content.slice(0, 50) + '...' : content

  console.log(`[MemoryManager] Finding similar memories for: "${contentPreview}"`)
  console.log(`[MemoryManager] Comparing against ${existingMemories.length} existing memories, targetCategory=${targetCategory || 'none'}`)

  let newEmbedding: number[]
  try {
    const result = await embeddingService.embed(content)
    newEmbedding = result.embedding
    console.log(`[MemoryManager] New content embedded: source=${result.source}, dims=${newEmbedding.length}`)
  } catch (error) {
    console.error('[MemoryManager] Failed to embed new content:', error)
    return []
  }

  const similar: Array<{ id: string; content: string; similarity: number }> = []

  for (const memory of existingMemories) {
    let existingEmbedding: number[]

    if (memory.embedding) {
      existingEmbedding = memory.embedding
    } else {
      try {
        const result = await embeddingService.embed(memory.content)
        existingEmbedding = result.embedding
      } catch {
        continue
      }
    }

    let similarity = 0
    try {
      similarity = cosineSimilarity(newEmbedding, existingEmbedding)
    } catch (e) {
      console.warn('[MemoryManager] Embedding dimension mismatch, treating as 0 similarity')
      continue
    }

    // Use lower threshold for same-category facts (they're more likely to be related)
    const isSameCategory = targetCategory && memory.category === targetCategory
    const threshold = isSameCategory ? SAME_CATEGORY_THRESHOLD : SIMILARITY_THRESHOLD

    if (similarity >= threshold) {
      const memoryPreview = memory.content.length > 40 ? memory.content.slice(0, 40) + '...' : memory.content
      const thresholdNote = isSameCategory ? ' (same category)' : ''
      console.log(`[MemoryManager] Found similar memory: similarity=${(similarity * 100).toFixed(1)}%, "${memoryPreview}"${thresholdNote}`)
      similar.push({
        id: memory.id,
        content: memory.content,
        similarity,
      })
    }
  }

  console.log(`[MemoryManager] Found ${similar.length} similar memories (thresholds: default=${SIMILARITY_THRESHOLD * 100}%, same-category=${SAME_CATEGORY_THRESHOLD * 100}%)`)

  // Sort by similarity descending
  return similar.sort((a, b) => b.similarity - a.similarity)
}

/**
 * Use LLM to decide memory operation
 */
async function decideMemoryOperation(
  providerId: string,
  providerConfig: ProviderConfig,
  newContent: string,
  similarMemories: Array<{ id: string; content: string; similarity: number }>
): Promise<MemoryDecision> {
  // Format existing memories for prompt
  const memoriesText = similarMemories.length > 0
    ? similarMemories.map((m, i) => `[ID: ${m.id}] ${m.content} (相似度: ${(m.similarity * 100).toFixed(0)}%)`).join('\n')
    : '(无相关记忆)'

  const prompt = MEMORY_DECISION_PROMPT
    .replace('{newContent}', newContent)
    .replace('{existingMemories}', memoriesText)

  try {
    const response = await generateChatResponse(
      providerId,
      {
        apiKey: providerConfig.apiKey ?? '',
        baseUrl: providerConfig.baseUrl,
        model: providerConfig.model ?? '',
      },
      [{ role: 'user', content: prompt }],
      { temperature: 0.1, maxTokens: 800 }  // Increased for UPDATE operations with long mergedContent
    )

    console.log(`[MemoryManager] LLM raw response: ${response.slice(0, 200)}...`)

    // Parse JSON response - try multiple patterns
    let jsonMatch = response.match(/\{[\s\S]*?\}/)

    // If no match, try to find JSON in code blocks
    if (!jsonMatch) {
      const codeBlockMatch = response.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/)
      if (codeBlockMatch) {
        jsonMatch = [codeBlockMatch[1]]
      }
    }

    if (!jsonMatch) {
      console.warn('[MemoryManager] No JSON found in LLM response, defaulting to ADD')
      console.warn('[MemoryManager] Full response:', response)
      return { operation: 'ADD', reason: 'LLM response parsing failed' }
    }

    const decision = JSON.parse(jsonMatch[0]) as MemoryDecision

    // Validate operation
    if (!['ADD', 'UPDATE', 'DELETE', 'NOOP'].includes(decision.operation)) {
      return { operation: 'ADD', reason: 'Invalid operation, defaulting to ADD' }
    }

    return decision
  } catch (error) {
    console.error('[MemoryManager] LLM decision failed:', error)
    return { operation: 'ADD', reason: 'LLM call failed, defaulting to ADD' }
  }
}

/**
 * Process a new user fact with intelligent memory management
 */
export async function processUserFact(
  providerId: string,
  providerConfig: ProviderConfig,
  newFact: {
    content: string
    category: UserFactCategory
    confidence: number
  },
  sourceAgentId?: string
): Promise<{
  action: 'added' | 'updated' | 'deleted_and_added' | 'skipped'
  factId?: string
  decision: MemoryDecision
}> {
  const storage = getStorage()

  // Step 1: Get existing facts with category info
  const profile = await storage.userProfile.getProfile()
  const existingFacts = profile.facts.map(f => ({
    id: f.id,
    content: f.content,
    category: f.category,  // Include category for same-category matching
    embedding: f.embedding,  // Include embedding to avoid re-embedding
  }))

  // Step 2: Find similar facts using embedding (with category awareness)
  const similarFacts = await findSimilarMemories(newFact.content, existingFacts, newFact.category)

  // Step 3: If no similar facts, directly ADD (no LLM call needed)
  if (similarFacts.length === 0) {
    const fact = await storage.userProfile.addFact(
      newFact.content,
      newFact.category,
      newFact.confidence,
      sourceAgentId
    )
    console.log('[MemoryManager] No similar facts, added directly:', newFact.content.slice(0, 50))
    return {
      action: 'added',
      factId: fact.id,
      decision: { operation: 'ADD', reason: 'No similar facts found' }
    }
  }

  // Step 4: Use LLM to decide operation
  const decision = await decideMemoryOperation(
    providerId,
    providerConfig,
    newFact.content,
    similarFacts
  )

  console.log('[MemoryManager] LLM decision:', decision.operation, '-', decision.reason)

  // Step 5: Execute decision
  switch (decision.operation) {
    case 'ADD': {
      const fact = await storage.userProfile.addFact(
        newFact.content,
        newFact.category,
        newFact.confidence,
        sourceAgentId
      )
      return { action: 'added', factId: fact.id, decision }
    }

    case 'UPDATE': {
      if (decision.targetId && decision.mergedContent) {
        const updatedFact = await storage.userProfile.updateFact(decision.targetId, {
          content: decision.mergedContent,
          confidence: Math.max(newFact.confidence, 80),
        })
        return { action: 'updated', factId: updatedFact?.id, decision }
      }
      // Fallback to ADD if no target
      const fact = await storage.userProfile.addFact(
        newFact.content,
        newFact.category,
        newFact.confidence,
        sourceAgentId
      )
      return { action: 'added', factId: fact.id, decision }
    }

    case 'DELETE': {
      // Delete old fact and add new one
      if (decision.targetId) {
        await storage.userProfile.deleteFact(decision.targetId)
      }
      const fact = await storage.userProfile.addFact(
        newFact.content,
        newFact.category,
        newFact.confidence,
        sourceAgentId
      )
      return { action: 'deleted_and_added', factId: fact.id, decision }
    }

    case 'NOOP':
    default: {
      return { action: 'skipped', decision }
    }
  }
}

/**
 * Process a new agent memory with intelligent memory management
 */
export async function processAgentMemory(
  providerId: string,
  providerConfig: ProviderConfig,
  agentId: string,
  newMemory: {
    content: string
    category: string
    emotionalWeight: number
  }
): Promise<{
  action: 'added' | 'updated' | 'deleted_and_added' | 'skipped'
  memoryId?: string
  decision: MemoryDecision
}> {
  const storage = getStorage()

  // Step 1: Get existing memories for this agent with category info
  const existingMemories = await storage.agentMemory.getActiveMemories(agentId, 100)
  const memoriesForSearch = existingMemories.map(m => ({
    id: m.id,
    content: m.content,
    category: m.category,  // Include category for same-category matching
    embedding: m.embedding,  // Include embedding to avoid re-embedding
  }))

  // Step 2: Find similar memories using embedding (with category awareness)
  const similarMemories = await findSimilarMemories(newMemory.content, memoriesForSearch, newMemory.category)

  // Step 3: If no similar memories, directly ADD
  if (similarMemories.length === 0) {
    const now = Date.now()
    const memory = await storage.agentMemory.addMemory(agentId, {
      content: newMemory.content,
      category: newMemory.category as any,
      strength: 100,
      emotionalWeight: newMemory.emotionalWeight,
      createdAt: now,
      lastRecalledAt: now,
      recallCount: 0,
      linkedMemories: [],
      vividness: 'vivid' as MemoryVividness,
    })
    console.log('[MemoryManager] No similar memories, added directly:', newMemory.content.slice(0, 50))
    return {
      action: 'added',
      memoryId: memory.id,
      decision: { operation: 'ADD', reason: 'No similar memories found' }
    }
  }

  // Step 4: Use LLM to decide operation
  const decision = await decideMemoryOperation(
    providerId,
    providerConfig,
    newMemory.content,
    similarMemories
  )

  console.log('[MemoryManager] LLM decision for agent memory:', decision.operation, '-', decision.reason)

  // Step 5: Execute decision
  const now = Date.now()

  switch (decision.operation) {
    case 'ADD': {
      const memory = await storage.agentMemory.addMemory(agentId, {
        content: newMemory.content,
        category: newMemory.category as any,
        strength: 100,
        emotionalWeight: newMemory.emotionalWeight,
        createdAt: now,
        lastRecalledAt: now,
        recallCount: 0,
        linkedMemories: [],
        vividness: 'vivid' as MemoryVividness,
      })
      return { action: 'added', memoryId: memory.id, decision }
    }

    case 'UPDATE': {
      if (decision.targetId && decision.mergedContent) {
        // Mark old as superseded, add new merged memory
        const newMemoryObj = await storage.agentMemory.addMemory(agentId, {
          content: decision.mergedContent,
          category: newMemory.category as any,
          strength: 100,
          emotionalWeight: newMemory.emotionalWeight,
          createdAt: now,
          lastRecalledAt: now,
          recallCount: 0,
          linkedMemories: [],
          vividness: 'vivid' as MemoryVividness,
        })
        await storage.agentMemory.markSuperseded(decision.targetId, newMemoryObj.id)
        return { action: 'updated', memoryId: newMemoryObj.id, decision }
      }
      // Fallback to ADD
      const memory = await storage.agentMemory.addMemory(agentId, {
        content: newMemory.content,
        category: newMemory.category as any,
        strength: 100,
        emotionalWeight: newMemory.emotionalWeight,
        createdAt: now,
        lastRecalledAt: now,
        recallCount: 0,
        linkedMemories: [],
        vividness: 'vivid' as MemoryVividness,
      })
      return { action: 'added', memoryId: memory.id, decision }
    }

    case 'DELETE': {
      // Mark old as superseded, add new
      if (decision.targetId) {
        const newMemoryObj = await storage.agentMemory.addMemory(agentId, {
          content: newMemory.content,
          category: newMemory.category as any,
          strength: 100,
          emotionalWeight: newMemory.emotionalWeight,
          createdAt: now,
          lastRecalledAt: now,
          recallCount: 0,
          linkedMemories: [],
          vividness: 'vivid' as MemoryVividness,
        })
        await storage.agentMemory.markSuperseded(decision.targetId, newMemoryObj.id)
        return { action: 'deleted_and_added', memoryId: newMemoryObj.id, decision }
      }
      // Fallback to ADD
      const memory = await storage.agentMemory.addMemory(agentId, {
        content: newMemory.content,
        category: newMemory.category as any,
        strength: 100,
        emotionalWeight: newMemory.emotionalWeight,
        createdAt: now,
        lastRecalledAt: now,
        recallCount: 0,
        linkedMemories: [],
        vividness: 'vivid' as MemoryVividness,
      })
      return { action: 'added', memoryId: memory.id, decision }
    }

    case 'NOOP':
    default: {
      return { action: 'skipped', decision }
    }
  }
}
