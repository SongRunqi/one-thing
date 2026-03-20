/**
 * SQLite Storage with Vector Search Support
 *
 * Uses better-sqlite3 + sqlite-vec for:
 * - Persistent storage of memories and user facts
 * - Vector embeddings for semantic search
 * - Memory linking (knowledge graph)
 */

import Database from 'better-sqlite3'
import * as sqliteVec from 'sqlite-vec'
import { v4 as uuidv4 } from 'uuid'
import type {
  UserProfile,
  UserFact,
  UserFactCategory,
  AgentMemory,
  AgentMemoryCategory,
  AgentUserRelationship,
  AgentMood,
} from '../../shared/ipc.js'
import type {
  IUserProfileStorage,
  IAgentMemoryStorage,
  IStorageProvider,
} from './interfaces.js'
import { getDatabasePath, ensureStoreDirs } from '../stores/paths.js'
import {
  getEmbeddingService,
  DEFAULT_EMBEDDING_DIM,
  cosineSimilarity,
} from '../services/memory/embedding-service.js'

// Memory link relationship types
export type MemoryLinkRelationship = 'similar' | 'contradicts' | 'updates' | 'related'

// Memory link structure for knowledge graph
export interface MemoryLink {
  id: string
  sourceId: string
  targetId: string
  relationship: MemoryLinkRelationship
  similarity: number
  createdAt: number
}

// Extended memory with embedding
export interface MemoryWithEmbedding extends AgentMemory {
  embedding?: number[]
}

// ============================================
// SQLite User Profile Storage
// ============================================

export class SQLiteUserProfileStorage implements IUserProfileStorage {
  private db: Database.Database

  constructor(db: Database.Database) {
    this.db = db
  }

  async getProfile(): Promise<UserProfile> {
    const profileRow = this.db.prepare(`
      SELECT id, created_at, updated_at FROM user_profile LIMIT 1
    `).get() as { id: string; created_at: number; updated_at: number } | undefined

    if (!profileRow) {
      // Create default profile
      const id = uuidv4()
      const now = Date.now()
      this.db.prepare(`
        INSERT INTO user_profile (id, created_at, updated_at)
        VALUES (?, ?, ?)
      `).run(id, now, now)

      return {
        id,
        facts: [],
        createdAt: now,
        updatedAt: now,
      }
    }

    // Get facts
    const facts = this.db.prepare(`
      SELECT * FROM user_facts ORDER BY created_at DESC
    `).all() as any[]

    return {
      id: profileRow.id,
      facts: facts.map(f => ({
        id: f.id,
        content: f.content,
        category: f.category as UserFactCategory,
        confidence: f.confidence,
        sources: JSON.parse(f.sources || '[]'),
        createdAt: f.created_at,
        updatedAt: f.updated_at,
        embedding: deserializeEmbedding(f.embedding),
      })),
      createdAt: profileRow.created_at,
      updatedAt: profileRow.updated_at,
    }
  }

  async addFact(
    content: string,
    category: UserFactCategory,
    confidence = 80,
    sourceAgentId?: string
  ): Promise<UserFact> {
    const id = uuidv4()
    const now = Date.now()
    const sources = sourceAgentId ? [sourceAgentId] : []

    // Generate embedding for semantic search
    // If embedding fails, cancel the storage operation (per user requirement)
    let embedding: number[]
    try {
      const embeddingService = getEmbeddingService()
      const result = await embeddingService.embed(content)
      embedding = result.embedding
    } catch (error) {
      console.error('[SQLiteStorage] Failed to generate embedding for fact, cancelling storage:', error)
      throw new Error('Embedding failed, memory storage cancelled')
    }

    this.db.prepare(`
      INSERT INTO user_facts (id, content, category, confidence, sources, embedding, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      content,
      category,
      confidence,
      JSON.stringify(sources),
      serializeEmbedding(embedding),
      now,
      now
    )

    // Update profile timestamp
    this.db.prepare(`UPDATE user_profile SET updated_at = ?`).run(now)

    return {
      id,
      content,
      category,
      confidence,
      sources,
      createdAt: now,
      updatedAt: now,
    }
  }

  async updateFact(
    factId: string,
    updates: {
      content?: string
      category?: UserFactCategory
      confidence?: number
    }
  ): Promise<UserFact | null> {
    const existing = this.db.prepare(`
      SELECT * FROM user_facts WHERE id = ?
    `).get(factId) as any

    if (!existing) return null

    const now = Date.now()
    const newContent = updates.content ?? existing.content
    const newCategory = updates.category ?? existing.category
    const newConfidence = updates.confidence ?? existing.confidence

    // Re-generate embedding if content changed
    // If embedding fails, cancel the update operation (per user requirement)
    let embedding = existing.embedding
    if (updates.content && updates.content !== existing.content) {
      try {
        const embeddingService = getEmbeddingService()
        const result = await embeddingService.embed(updates.content)
        embedding = serializeEmbedding(result.embedding)
      } catch (error) {
        console.error('[SQLiteStorage] Failed to update fact embedding, cancelling update:', error)
        throw new Error('Embedding failed, memory update cancelled')
      }
    }

    this.db.prepare(`
      UPDATE user_facts
      SET content = ?, category = ?, confidence = ?, embedding = ?, updated_at = ?
      WHERE id = ?
    `).run(newContent, newCategory, newConfidence, embedding, now, factId)

    return {
      id: factId,
      content: newContent,
      category: newCategory,
      confidence: newConfidence,
      sources: JSON.parse(existing.sources || '[]'),
      createdAt: existing.created_at,
      updatedAt: now,
    }
  }

  async deleteFact(factId: string): Promise<boolean> {
    const result = this.db.prepare(`DELETE FROM user_facts WHERE id = ?`).run(factId)
    return result.changes > 0
  }

  async getFactsByCategory(category: UserFactCategory): Promise<UserFact[]> {
    const rows = this.db.prepare(`
      SELECT * FROM user_facts WHERE category = ? ORDER BY created_at DESC
    `).all(category) as any[]

    return rows.map(f => ({
      id: f.id,
      content: f.content,
      category: f.category as UserFactCategory,
      confidence: f.confidence,
      sources: JSON.parse(f.sources || '[]'),
      createdAt: f.created_at,
      updatedAt: f.updated_at,
      embedding: deserializeEmbedding(f.embedding),
    }))
  }

  async searchFacts(query: string): Promise<UserFact[]> {
    // Try semantic search first with category expansion enabled
    // This helps retrieve related facts (e.g., birthday + birth year when asking about age)
    try {
      const embeddingService = getEmbeddingService()
      const queryResult = await embeddingService.embed(query)
      console.log(`[SQLiteStorage] Searching facts with category expansion for: "${query.slice(0, 50)}..."`)
      return this.searchFactsBySimilarity(queryResult.embedding, 10, 0.3, {
        expandByCategory: true,  // Include related facts from same category
        maxExpansion: 5,         // Up to 5 additional facts from matched categories
      })
    } catch {
      // Fallback to keyword search
      const rows = this.db.prepare(`
        SELECT * FROM user_facts
        WHERE content LIKE ?
        ORDER BY created_at DESC
      `).all(`%${query}%`) as any[]

      return rows.map(f => ({
        id: f.id,
        content: f.content,
        category: f.category as UserFactCategory,
        confidence: f.confidence,
        sources: JSON.parse(f.sources || '[]'),
        createdAt: f.created_at,
        updatedAt: f.updated_at,
      }))
    }
  }

  /**
   * Search facts by embedding similarity
   * With optional category expansion to include related facts from the same category
   */
  async searchFactsBySimilarity(
    queryEmbedding: number[],
    limit = 10,
    minSimilarity = 0.3,
    options?: {
      expandByCategory?: boolean  // Also include facts from matched categories
      maxExpansion?: number       // Max additional facts to include from category expansion
    }
  ): Promise<UserFact[]> {
    const { expandByCategory = false, maxExpansion = 5 } = options || {}

    // Get all facts with embeddings
    const rows = this.db.prepare(`
      SELECT * FROM user_facts WHERE embedding IS NOT NULL
    `).all() as any[]

    // Calculate similarity scores (handle dimension mismatches gracefully)
    const scored = rows.map(f => {
      const embedding = deserializeEmbedding(f.embedding)
      let similarity = 0
      if (embedding) {
        try {
          similarity = cosineSimilarity(queryEmbedding, embedding)
        } catch (e) {
          // Dimension mismatch - skip this fact
        }
      }
      return { fact: f, similarity }
    })

    // Filter and sort by similarity
    const similarFacts = scored
      .filter(item => item.similarity >= minSimilarity)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit)

    const resultFacts = similarFacts.map(item => ({
      id: item.fact.id,
      content: item.fact.content,
      category: item.fact.category as UserFactCategory,
      confidence: item.fact.confidence,
      sources: JSON.parse(item.fact.sources || '[]'),
      createdAt: item.fact.created_at,
      updatedAt: item.fact.updated_at,
    }))

    // Category expansion: if we found similar facts, also include other facts from the same categories
    if (expandByCategory && resultFacts.length > 0) {
      const matchedCategories = new Set(resultFacts.map(f => f.category))
      const matchedIds = new Set(resultFacts.map(f => f.id))

      // Get additional facts from the same categories
      const categoryFacts = rows
        .filter(f => matchedCategories.has(f.category as UserFactCategory) && !matchedIds.has(f.id))
        .sort((a, b) => b.confidence - a.confidence)  // Sort by confidence for category facts
        .slice(0, maxExpansion)
        .map(f => ({
          id: f.id,
          content: f.content,
          category: f.category as UserFactCategory,
          confidence: f.confidence,
          sources: JSON.parse(f.sources || '[]'),
          createdAt: f.created_at,
          updatedAt: f.updated_at,
        }))

      if (categoryFacts.length > 0) {
        console.log(`[SQLiteStorage] Category expansion: added ${categoryFacts.length} facts from categories [${[...matchedCategories].join(', ')}]`)
        return [...resultFacts, ...categoryFacts]
      }
    }

    return resultFacts
  }
}

// ============================================
// SQLite Agent Memory Storage
// ============================================

export class SQLiteAgentMemoryStorage implements IAgentMemoryStorage {
  private db: Database.Database

  constructor(db: Database.Database) {
    this.db = db
  }

  async getRelationship(agentId: string): Promise<AgentUserRelationship | null> {
    const row = this.db.prepare(`
      SELECT * FROM agent_relationships WHERE agent_id = ?
    `).get(agentId) as any

    if (!row) return null

    // Get memories
    const memories = await this.getActiveMemories(agentId, 1000)

    return {
      agentId: row.agent_id,
      relationship: {
        trustLevel: row.trust_level,
        familiarity: row.familiarity,
        lastInteraction: row.last_interaction,
        totalInteractions: row.total_interactions,
      },
      agentFeelings: {
        currentMood: row.current_mood as AgentMood,
        notes: row.mood_notes,
      },
      observations: memories,
      domainMemory: JSON.parse(row.domain_memory || '{}'),
    }
  }

  async saveRelationship(relationship: AgentUserRelationship): Promise<void> {
    this.db.prepare(`
      INSERT OR REPLACE INTO agent_relationships (
        agent_id, trust_level, familiarity, last_interaction, total_interactions,
        current_mood, mood_notes, domain_memory
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      relationship.agentId,
      relationship.relationship.trustLevel,
      relationship.relationship.familiarity,
      relationship.relationship.lastInteraction,
      relationship.relationship.totalInteractions,
      relationship.agentFeelings.currentMood,
      relationship.agentFeelings.notes,
      JSON.stringify(relationship.domainMemory)
    )
  }

  async addMemory(
    agentId: string,
    memory: Omit<AgentMemory, 'id'>
  ): Promise<AgentMemory> {
    const id = uuidv4()

    // Ensure relationship exists
    const existingRel = this.db.prepare(`
      SELECT agent_id FROM agent_relationships WHERE agent_id = ?
    `).get(agentId)

    if (!existingRel) {
      this.db.prepare(`
        INSERT INTO agent_relationships (
          agent_id, trust_level, familiarity, last_interaction, total_interactions,
          current_mood, mood_notes, domain_memory
        ) VALUES (?, 50, 0, ?, 0, 'neutral', '', '{}')
      `).run(agentId, Date.now())
    }

    // Generate embedding
    // If embedding fails, cancel the storage operation (per user requirement)
    let embedding: number[]
    try {
      const embeddingService = getEmbeddingService()
      const result = await embeddingService.embed(memory.content)
      embedding = result.embedding
    } catch (error) {
      console.error('[SQLiteStorage] Failed to generate memory embedding, cancelling storage:', error)
      throw new Error('Embedding failed, memory storage cancelled')
    }

    const newMemory: AgentMemory = {
      ...memory,
      id,
    }

    this.db.prepare(`
      INSERT INTO agent_memories (
        id, agent_id, content, category, strength, emotional_weight,
        created_at, last_recalled_at, recall_count, linked_memories, vividness,
        embedding, superseded_by, superseded_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      agentId,
      memory.content,
      memory.category,
      memory.strength,
      memory.emotionalWeight,
      memory.createdAt,
      memory.lastRecalledAt,
      memory.recallCount,
      JSON.stringify(memory.linkedMemories),
      memory.vividness,
      serializeEmbedding(embedding),
      null,
      null
    )

    return newMemory
  }

  async recallMemory(agentId: string, memoryId: string): Promise<AgentMemory | null> {
    const row = this.db.prepare(`
      SELECT * FROM agent_memories WHERE id = ? AND agent_id = ?
    `).get(memoryId, agentId) as any

    if (!row) return null

    // Strengthen memory
    const now = Date.now()
    const newRecallCount = row.recall_count + 1
    let newStrength = Math.min(100, row.strength + 5)
    let newVividness = row.vividness

    // Upgrade vividness based on recall count
    if (newVividness === 'fragment' && newRecallCount > 3) {
      newVividness = 'hazy'
    } else if (newVividness === 'hazy' && newRecallCount > 5) {
      newVividness = 'clear'
    }

    this.db.prepare(`
      UPDATE agent_memories
      SET last_recalled_at = ?, recall_count = ?, strength = ?, vividness = ?
      WHERE id = ?
    `).run(now, newRecallCount, newStrength, newVividness, memoryId)

    return {
      id: row.id,
      content: row.content,
      category: row.category as AgentMemoryCategory,
      strength: newStrength,
      emotionalWeight: row.emotional_weight,
      createdAt: row.created_at,
      lastRecalledAt: now,
      recallCount: newRecallCount,
      linkedMemories: JSON.parse(row.linked_memories || '[]'),
      vividness: newVividness,
    }
  }

  async getActiveMemories(agentId: string, limit = 10): Promise<AgentMemory[]> {
    const rows = this.db.prepare(`
      SELECT * FROM agent_memories
      WHERE agent_id = ? AND strength > 10 AND superseded_by IS NULL
      ORDER BY strength DESC
      LIMIT ?
    `).all(agentId, limit) as any[]

    return rows.map(row => ({
      id: row.id,
      content: row.content,
      category: row.category as AgentMemoryCategory,
      strength: row.strength,
      emotionalWeight: row.emotional_weight,
      createdAt: row.created_at,
      lastRecalledAt: row.last_recalled_at,
      recallCount: row.recall_count,
      linkedMemories: JSON.parse(row.linked_memories || '[]'),
      vividness: row.vividness,
      embedding: deserializeEmbedding(row.embedding),
    }))
  }

  /**
   * Semantic search for memories
   */
  async searchMemoriesBySimilarity(
    agentId: string,
    queryEmbedding: number[],
    limit = 10,
    minSimilarity = 0.3
  ): Promise<Array<AgentMemory & { similarity: number }>> {
    // Get all memories with embeddings for this agent
    const rows = this.db.prepare(`
      SELECT * FROM agent_memories
      WHERE agent_id = ? AND embedding IS NOT NULL AND superseded_by IS NULL
    `).all(agentId) as any[]

    // Calculate similarity scores (handle dimension mismatches gracefully)
    const scored = rows.map(row => {
      const embedding = deserializeEmbedding(row.embedding)
      let similarity = 0
      if (embedding) {
        try {
          similarity = cosineSimilarity(queryEmbedding, embedding)
        } catch (e) {
          // Dimension mismatch - skip this memory
        }
      }
      return { row, similarity }
    })

    // Filter, sort, and return
    return scored
      .filter(item => item.similarity >= minSimilarity)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit)
      .map(item => ({
        id: item.row.id,
        content: item.row.content,
        category: item.row.category as AgentMemoryCategory,
        strength: item.row.strength,
        emotionalWeight: item.row.emotional_weight,
        createdAt: item.row.created_at,
        lastRecalledAt: item.row.last_recalled_at,
        recallCount: item.row.recall_count,
        linkedMemories: JSON.parse(item.row.linked_memories || '[]'),
        vividness: item.row.vividness,
        similarity: item.similarity,
      }))
  }

  /**
   * Hybrid retrieval: combines semantic similarity with strength
   */
  async hybridRetrieveMemories(
    agentId: string,
    query: string,
    limit = 10,
    options: {
      similarityWeight?: number  // Weight for semantic similarity (default 0.6)
      strengthWeight?: number    // Weight for memory strength (default 0.4)
      minSimilarity?: number     // Minimum similarity threshold (default 0.3)
    } = {}
  ): Promise<Array<AgentMemory & { hybridScore: number; similarity: number }>> {
    const {
      similarityWeight = 0.6,
      strengthWeight = 0.4,
      minSimilarity = 0.3,
    } = options

    // Get query embedding
    const embeddingService = getEmbeddingService()
    const queryResult = await embeddingService.embed(query)

    // Get all memories with embeddings
    const rows = this.db.prepare(`
      SELECT * FROM agent_memories
      WHERE agent_id = ? AND embedding IS NOT NULL AND superseded_by IS NULL
    `).all(agentId) as any[]

    // Calculate hybrid scores (handle dimension mismatches gracefully)
    const scored = rows.map(row => {
      const embedding = deserializeEmbedding(row.embedding)
      let similarity = 0
      if (embedding) {
        try {
          similarity = cosineSimilarity(queryResult.embedding, embedding)
        } catch (e) {
          // Dimension mismatch - skip this memory
        }
      }
      const normalizedStrength = row.strength / 100

      const hybridScore = (similarity * similarityWeight) + (normalizedStrength * strengthWeight)

      return { row, similarity, hybridScore }
    })

    // Filter and sort
    return scored
      .filter(item => item.similarity >= minSimilarity)
      .sort((a, b) => b.hybridScore - a.hybridScore)
      .slice(0, limit)
      .map(item => ({
        id: item.row.id,
        content: item.row.content,
        category: item.row.category as AgentMemoryCategory,
        strength: item.row.strength,
        emotionalWeight: item.row.emotional_weight,
        createdAt: item.row.created_at,
        lastRecalledAt: item.row.last_recalled_at,
        recallCount: item.row.recall_count,
        linkedMemories: JSON.parse(item.row.linked_memories || '[]'),
        vividness: item.row.vividness,
        hybridScore: item.hybridScore,
        similarity: item.similarity,
      }))
  }

  async decayMemories(agentId: string): Promise<void> {
    const now = Date.now()
    const dayMs = 24 * 60 * 60 * 1000

    // Get all memories for this agent
    const memories = this.db.prepare(`
      SELECT id, strength, emotional_weight, last_recalled_at, vividness
      FROM agent_memories
      WHERE agent_id = ? AND superseded_by IS NULL
    `).all(agentId) as any[]

    const updateStmt = this.db.prepare(`
      UPDATE agent_memories
      SET strength = ?, vividness = ?
      WHERE id = ?
    `)

    const deleteStmt = this.db.prepare(`
      DELETE FROM agent_memories WHERE id = ?
    `)

    for (const memory of memories) {
      const daysSinceRecall = (now - memory.last_recalled_at) / dayMs

      // Base decay: 2-5 points per day, slower for high emotional weight
      const decayRate = Math.max(2, 5 - memory.emotional_weight * 0.03)
      const decay = decayRate * daysSinceRecall

      const newStrength = Math.max(0, memory.strength - decay)

      // Update vividness based on strength
      let newVividness = memory.vividness
      if (newStrength < 20) {
        newVividness = 'fragment'
      } else if (newStrength < 50) {
        newVividness = 'hazy'
      } else if (newStrength < 80) {
        newVividness = 'clear'
      }

      if (newStrength <= 0) {
        // Remove completely decayed memories
        deleteStmt.run(memory.id)
      } else {
        updateStmt.run(newStrength, newVividness, memory.id)
      }
    }
  }

  async recordInteraction(agentId: string): Promise<AgentUserRelationship> {
    const existing = this.db.prepare(`
      SELECT * FROM agent_relationships WHERE agent_id = ?
    `).get(agentId) as any

    const now = Date.now()

    if (!existing) {
      // Create new relationship
      this.db.prepare(`
        INSERT INTO agent_relationships (
          agent_id, trust_level, familiarity, last_interaction, total_interactions,
          current_mood, mood_notes, domain_memory
        ) VALUES (?, 50, 0.5, ?, 1, 'neutral', '', '{}')
      `).run(agentId, now)

      return {
        agentId,
        relationship: {
          trustLevel: 50,
          familiarity: 0.5,
          lastInteraction: now,
          totalInteractions: 1,
        },
        agentFeelings: {
          currentMood: 'neutral',
          notes: '',
        },
        observations: [],
        domainMemory: {},
      }
    }

    // Update existing relationship
    const newFamiliarity = Math.min(100, existing.familiarity + 0.5)
    const newTotalInteractions = existing.total_interactions + 1

    this.db.prepare(`
      UPDATE agent_relationships
      SET last_interaction = ?, total_interactions = ?, familiarity = ?
      WHERE agent_id = ?
    `).run(now, newTotalInteractions, newFamiliarity, agentId)

    const memories = await this.getActiveMemories(agentId, 1000)

    return {
      agentId,
      relationship: {
        trustLevel: existing.trust_level,
        familiarity: newFamiliarity,
        lastInteraction: now,
        totalInteractions: newTotalInteractions,
      },
      agentFeelings: {
        currentMood: existing.current_mood as AgentMood,
        notes: existing.mood_notes,
      },
      observations: memories,
      domainMemory: JSON.parse(existing.domain_memory || '{}'),
    }
  }

  async updateRelationship(
    agentId: string,
    updates: {
      trustLevel?: number
      familiarity?: number
      mood?: AgentMood
      moodNotes?: string
    }
  ): Promise<AgentUserRelationship | null> {
    let existing = this.db.prepare(`
      SELECT * FROM agent_relationships WHERE agent_id = ?
    `).get(agentId) as any

    if (!existing) {
      // Create default relationship
      await this.recordInteraction(agentId)
      existing = this.db.prepare(`
        SELECT * FROM agent_relationships WHERE agent_id = ?
      `).get(agentId) as any
    }

    const newTrustLevel = updates.trustLevel ?? existing.trust_level
    const newFamiliarity = updates.familiarity ?? existing.familiarity
    const newMood = updates.mood ?? existing.current_mood
    const newMoodNotes = updates.moodNotes ?? existing.mood_notes

    this.db.prepare(`
      UPDATE agent_relationships
      SET trust_level = ?, familiarity = ?, current_mood = ?, mood_notes = ?
      WHERE agent_id = ?
    `).run(
      Math.max(0, Math.min(100, newTrustLevel)),
      Math.max(0, Math.min(100, newFamiliarity)),
      newMood,
      newMoodNotes,
      agentId
    )

    const memories = await this.getActiveMemories(agentId, 1000)

    return {
      agentId,
      relationship: {
        trustLevel: newTrustLevel,
        familiarity: newFamiliarity,
        lastInteraction: existing.last_interaction,
        totalInteractions: existing.total_interactions,
      },
      agentFeelings: {
        currentMood: newMood as AgentMood,
        notes: newMoodNotes,
      },
      observations: memories,
      domainMemory: JSON.parse(existing.domain_memory || '{}'),
    }
  }

  // ============================================
  // Memory Linking (Knowledge Graph)
  // ============================================

  /**
   * Add a link between two memories
   */
  async addMemoryLink(
    sourceId: string,
    targetId: string,
    relationship: MemoryLinkRelationship,
    similarity: number
  ): Promise<MemoryLink> {
    const id = uuidv4()
    const now = Date.now()

    this.db.prepare(`
      INSERT INTO memory_links (id, source_id, target_id, relationship, similarity, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, sourceId, targetId, relationship, similarity, now)

    // Update linkedMemories array on source memory
    const source = this.db.prepare(`SELECT linked_memories FROM agent_memories WHERE id = ?`).get(sourceId) as any
    if (source) {
      const linkedMemories = JSON.parse(source.linked_memories || '[]')
      if (!linkedMemories.includes(targetId)) {
        linkedMemories.push(targetId)
        this.db.prepare(`UPDATE agent_memories SET linked_memories = ? WHERE id = ?`)
          .run(JSON.stringify(linkedMemories), sourceId)
      }
    }

    return { id, sourceId, targetId, relationship, similarity, createdAt: now }
  }

  /**
   * Get all links for a memory
   */
  async getMemoryLinks(memoryId: string): Promise<MemoryLink[]> {
    const rows = this.db.prepare(`
      SELECT * FROM memory_links
      WHERE source_id = ? OR target_id = ?
      ORDER BY similarity DESC
    `).all(memoryId, memoryId) as any[]

    return rows.map(row => ({
      id: row.id,
      sourceId: row.source_id,
      targetId: row.target_id,
      relationship: row.relationship as MemoryLinkRelationship,
      similarity: row.similarity,
      createdAt: row.created_at,
    }))
  }

  /**
   * Find related memories via links (multi-hop)
   */
  async findRelatedMemories(
    memoryId: string,
    maxHops = 2
  ): Promise<Array<{ memory: AgentMemory; distance: number }>> {
    const visited = new Set<string>([memoryId])
    const result: Array<{ memory: AgentMemory; distance: number }> = []

    let currentLayer = [memoryId]

    for (let hop = 1; hop <= maxHops; hop++) {
      const nextLayer: string[] = []

      for (const id of currentLayer) {
        const links = await this.getMemoryLinks(id)

        for (const link of links) {
          const linkedId = link.sourceId === id ? link.targetId : link.sourceId

          if (!visited.has(linkedId)) {
            visited.add(linkedId)
            nextLayer.push(linkedId)

            // Get the memory
            const row = this.db.prepare(`
              SELECT * FROM agent_memories WHERE id = ? AND superseded_by IS NULL
            `).get(linkedId) as any

            if (row) {
              result.push({
                memory: {
                  id: row.id,
                  content: row.content,
                  category: row.category as AgentMemoryCategory,
                  strength: row.strength,
                  emotionalWeight: row.emotional_weight,
                  createdAt: row.created_at,
                  lastRecalledAt: row.last_recalled_at,
                  recallCount: row.recall_count,
                  linkedMemories: JSON.parse(row.linked_memories || '[]'),
                  vividness: row.vividness,
                },
                distance: hop,
              })
            }
          }
        }
      }

      currentLayer = nextLayer
    }

    return result
  }

  /**
   * Mark a memory as superseded by another
   */
  async markSuperseded(oldMemoryId: string, newMemoryId: string): Promise<void> {
    this.db.prepare(`
      UPDATE agent_memories
      SET superseded_by = ?, superseded_at = ?
      WHERE id = ?
    `).run(newMemoryId, Date.now(), oldMemoryId)
  }

  /**
   * Delete a memory and its links
   */
  async deleteMemory(memoryId: string): Promise<boolean> {
    // Delete links
    this.db.prepare(`DELETE FROM memory_links WHERE source_id = ? OR target_id = ?`)
      .run(memoryId, memoryId)

    // Delete memory
    const result = this.db.prepare(`DELETE FROM agent_memories WHERE id = ?`).run(memoryId)
    return result.changes > 0
  }
}

// ============================================
// SQLite Storage Provider
// ============================================

export class SQLiteStorageProvider implements IStorageProvider {
  private db: Database.Database | null = null
  userProfile!: IUserProfileStorage
  agentMemory!: SQLiteAgentMemoryStorage

  async initialize(): Promise<void> {
    ensureStoreDirs()

    const dbPath = getDatabasePath()
    this.db = new Database(dbPath)

    // Load sqlite-vec extension
    try {
      sqliteVec.load(this.db)
      console.log('[SQLiteStorage] sqlite-vec extension loaded')
    } catch (error) {
      console.warn('[SQLiteStorage] sqlite-vec not available, vector search disabled:', error)
    }

    // Enable WAL mode for better performance
    this.db.pragma('journal_mode = WAL')

    // Create tables
    this.createTables()

    // Initialize storage implementations
    this.userProfile = new SQLiteUserProfileStorage(this.db)
    this.agentMemory = new SQLiteAgentMemoryStorage(this.db)

    console.log('[SQLiteStorage] Database initialized at', dbPath)
  }

  private createTables(): void {
    if (!this.db) throw new Error('Database not initialized')

    // User profile table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS user_profile (
        id TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `)

    // User facts table with embedding
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS user_facts (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        category TEXT NOT NULL,
        confidence INTEGER NOT NULL DEFAULT 80,
        sources TEXT DEFAULT '[]',
        embedding BLOB,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `)

    // Agent relationships table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS agent_relationships (
        agent_id TEXT PRIMARY KEY,
        trust_level INTEGER NOT NULL DEFAULT 50,
        familiarity REAL NOT NULL DEFAULT 0,
        last_interaction INTEGER NOT NULL,
        total_interactions INTEGER NOT NULL DEFAULT 0,
        current_mood TEXT NOT NULL DEFAULT 'neutral',
        mood_notes TEXT DEFAULT '',
        domain_memory TEXT DEFAULT '{}'
      )
    `)

    // Agent memories table with embedding
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS agent_memories (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        content TEXT NOT NULL,
        category TEXT NOT NULL,
        strength REAL NOT NULL DEFAULT 100,
        emotional_weight REAL NOT NULL DEFAULT 5,
        created_at INTEGER NOT NULL,
        last_recalled_at INTEGER NOT NULL,
        recall_count INTEGER NOT NULL DEFAULT 0,
        linked_memories TEXT DEFAULT '[]',
        vividness TEXT NOT NULL DEFAULT 'vivid',
        embedding BLOB,
        superseded_by TEXT,
        superseded_at INTEGER,
        FOREIGN KEY (agent_id) REFERENCES agent_relationships(agent_id)
      )
    `)

    // Memory links table for knowledge graph
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS memory_links (
        id TEXT PRIMARY KEY,
        source_id TEXT NOT NULL,
        target_id TEXT NOT NULL,
        relationship TEXT NOT NULL,
        similarity REAL NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (source_id) REFERENCES agent_memories(id),
        FOREIGN KEY (target_id) REFERENCES agent_memories(id)
      )
    `)

    // Create indexes
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_user_facts_category ON user_facts(category);
      CREATE INDEX IF NOT EXISTS idx_agent_memories_agent ON agent_memories(agent_id);
      CREATE INDEX IF NOT EXISTS idx_agent_memories_strength ON agent_memories(agent_id, strength);
      CREATE INDEX IF NOT EXISTS idx_memory_links_source ON memory_links(source_id);
      CREATE INDEX IF NOT EXISTS idx_memory_links_target ON memory_links(target_id);
    `)
  }

  async close(): Promise<void> {
    if (this.db) {
      this.db.close()
      this.db = null
    }
  }

  /**
   * Get raw database instance (for advanced operations)
   */
  getDatabase(): Database.Database {
    if (!this.db) throw new Error('Database not initialized')
    return this.db
  }
}

// ============================================
// Helper Functions
// ============================================

/**
 * Serialize embedding array to buffer for storage
 */
function serializeEmbedding(embedding: number[]): Buffer {
  const buffer = Buffer.alloc(embedding.length * 4)
  for (let i = 0; i < embedding.length; i++) {
    buffer.writeFloatLE(embedding[i], i * 4)
  }
  return buffer
}

/**
 * Deserialize embedding from buffer
 */
function deserializeEmbedding(buffer: Buffer | null | undefined): number[] | undefined {
  if (!buffer) return undefined
  const embedding: number[] = []
  for (let i = 0; i < buffer.length; i += 4) {
    embedding.push(buffer.readFloatLE(i))
  }
  return embedding
}
