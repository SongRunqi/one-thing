/**
 * File-based Storage Implementation
 *
 * 使用 JSON 文件存储数据，适合本地桌面应用
 * 未来可以创建 SQLiteStorage 等实现来替换
 */

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
import {
  getUserProfilePath,
  getAgentMemoryPath,
  readJsonFile,
  writeJsonFile,
  ensureStoreDirs,
} from '../stores/paths.js'

// ============================================
// File-based User Profile Storage
// ============================================

export class FileUserProfileStorage implements IUserProfileStorage {
  private profilePath: string

  constructor() {
    this.profilePath = getUserProfilePath()
  }

  private loadProfile(): UserProfile {
    const defaultProfile: UserProfile = {
      id: uuidv4(),
      facts: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    return readJsonFile<UserProfile>(this.profilePath, defaultProfile)
  }

  private saveProfile(profile: UserProfile): void {
    profile.updatedAt = Date.now()
    writeJsonFile(this.profilePath, profile)
  }

  async getProfile(): Promise<UserProfile> {
    return this.loadProfile()
  }

  async addFact(
    content: string,
    category: UserFactCategory,
    confidence = 80,
    sourceAgentId?: string
  ): Promise<UserFact> {
    const profile = this.loadProfile()

    const fact: UserFact = {
      id: uuidv4(),
      content,
      category,
      confidence,
      sources: sourceAgentId ? [sourceAgentId] : [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }

    profile.facts.push(fact)
    this.saveProfile(profile)

    return fact
  }

  async updateFact(
    factId: string,
    updates: {
      content?: string
      category?: UserFactCategory
      confidence?: number
    }
  ): Promise<UserFact | null> {
    const profile = this.loadProfile()
    const factIndex = profile.facts.findIndex(f => f.id === factId)

    if (factIndex === -1) return null

    const fact = profile.facts[factIndex]

    if (updates.content !== undefined) fact.content = updates.content
    if (updates.category !== undefined) fact.category = updates.category
    if (updates.confidence !== undefined) fact.confidence = updates.confidence
    fact.updatedAt = Date.now()

    this.saveProfile(profile)
    return fact
  }

  async deleteFact(factId: string): Promise<boolean> {
    const profile = this.loadProfile()
    const initialLength = profile.facts.length
    profile.facts = profile.facts.filter(f => f.id !== factId)

    if (profile.facts.length < initialLength) {
      this.saveProfile(profile)
      return true
    }
    return false
  }

  async getFactsByCategory(category: UserFactCategory): Promise<UserFact[]> {
    const profile = this.loadProfile()
    return profile.facts.filter(f => f.category === category)
  }

  async searchFacts(query: string): Promise<UserFact[]> {
    const profile = this.loadProfile()
    const lowerQuery = query.toLowerCase()
    return profile.facts.filter(f =>
      f.content.toLowerCase().includes(lowerQuery)
    )
  }
}

// ============================================
// File-based Agent Memory Storage (Phase 3)
// ============================================

export class FileAgentMemoryStorage implements IAgentMemoryStorage {
  private getMemoryPath(agentId: string): string {
    return getAgentMemoryPath(agentId)
  }

  private loadRelationshipSync(agentId: string): AgentUserRelationship | null {
    const path = this.getMemoryPath(agentId)
    const data = readJsonFile<AgentUserRelationship | null>(path, null)
    return data
  }

  private saveRelationshipSync(relationship: AgentUserRelationship): void {
    const path = this.getMemoryPath(relationship.agentId)
    writeJsonFile(path, relationship)
  }

  private createDefaultRelationship(agentId: string): AgentUserRelationship {
    return {
      agentId,
      relationship: {
        trustLevel: 50,
        familiarity: 0,
        lastInteraction: Date.now(),
        totalInteractions: 0,
      },
      agentFeelings: {
        currentMood: 'neutral',
        notes: '',
      },
      observations: [],
      domainMemory: {},
    }
  }

  async getRelationship(agentId: string): Promise<AgentUserRelationship | null> {
    return this.loadRelationshipSync(agentId)
  }

  async saveRelationship(relationship: AgentUserRelationship): Promise<void> {
    this.saveRelationshipSync(relationship)
  }

  async addMemory(
    agentId: string,
    memory: Omit<AgentMemory, 'id'>
  ): Promise<AgentMemory> {
    let relationship = this.loadRelationshipSync(agentId)
    if (!relationship) {
      relationship = this.createDefaultRelationship(agentId)
    }

    const newMemory: AgentMemory = {
      ...memory,
      id: uuidv4(),
    }

    relationship.observations.push(newMemory)
    this.saveRelationshipSync(relationship)

    return newMemory
  }

  async recallMemory(agentId: string, memoryId: string): Promise<AgentMemory | null> {
    const relationship = this.loadRelationshipSync(agentId)
    if (!relationship) return null

    const memory = relationship.observations.find(m => m.id === memoryId)
    if (!memory) return null

    // 强化记忆
    memory.lastRecalledAt = Date.now()
    memory.recallCount += 1
    memory.strength = Math.min(100, memory.strength + 5)

    // 可能提升鲜明度
    if (memory.vividness === 'fragment' && memory.recallCount > 3) {
      memory.vividness = 'hazy'
    } else if (memory.vividness === 'hazy' && memory.recallCount > 5) {
      memory.vividness = 'clear'
    }

    this.saveRelationshipSync(relationship)
    return memory
  }

  async getActiveMemories(agentId: string, limit = 10): Promise<AgentMemory[]> {
    const relationship = this.loadRelationshipSync(agentId)
    if (!relationship) return []

    // 按强度排序，过滤掉已消散的记忆
    return relationship.observations
      .filter(m => m.strength > 10)
      .sort((a, b) => b.strength - a.strength)
      .slice(0, limit)
  }

  async decayMemories(agentId: string): Promise<void> {
    const relationship = this.loadRelationshipSync(agentId)
    if (!relationship) return

    const now = Date.now()
    const dayMs = 24 * 60 * 60 * 1000

    for (const memory of relationship.observations) {
      const daysSinceRecall = (now - memory.lastRecalledAt) / dayMs

      // 基础衰减：每天衰减 2-5 点，情感权重高的衰减慢
      const decayRate = Math.max(2, 5 - memory.emotionalWeight * 0.03)
      const decay = decayRate * daysSinceRecall

      memory.strength = Math.max(0, memory.strength - decay)

      // 更新鲜明度
      if (memory.strength < 20) {
        memory.vividness = 'fragment'
      } else if (memory.strength < 50) {
        memory.vividness = 'hazy'
      } else if (memory.strength < 80) {
        memory.vividness = 'clear'
      }
    }

    // 移除完全消散的记忆
    relationship.observations = relationship.observations.filter(
      m => m.strength > 0
    )

    this.saveRelationshipSync(relationship)
  }

  async recordInteraction(agentId: string): Promise<AgentUserRelationship> {
    let relationship = this.loadRelationshipSync(agentId)
    if (!relationship) {
      relationship = this.createDefaultRelationship(agentId)
    }

    // Update interaction stats
    relationship.relationship.lastInteraction = Date.now()
    relationship.relationship.totalInteractions += 1

    // Increase familiarity slightly with each interaction
    relationship.relationship.familiarity = Math.min(
      100,
      relationship.relationship.familiarity + 0.5
    )

    this.saveRelationshipSync(relationship)
    return relationship
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
    let relationship = this.loadRelationshipSync(agentId)
    if (!relationship) {
      relationship = this.createDefaultRelationship(agentId)
    }

    if (updates.trustLevel !== undefined) {
      relationship.relationship.trustLevel = Math.max(0, Math.min(100, updates.trustLevel))
    }
    if (updates.familiarity !== undefined) {
      relationship.relationship.familiarity = Math.max(0, Math.min(100, updates.familiarity))
    }
    if (updates.mood !== undefined) {
      relationship.agentFeelings.currentMood = updates.mood
    }
    if (updates.moodNotes !== undefined) {
      relationship.agentFeelings.notes = updates.moodNotes
    }

    this.saveRelationshipSync(relationship)
    return relationship
  }

  async markSuperseded(oldMemoryId: string, newMemoryId: string): Promise<void> {
    // File storage doesn't support superseding, just log
    console.log(`[FileStorage] markSuperseded not implemented: ${oldMemoryId} -> ${newMemoryId}`)
  }

  async deleteMemory(memoryId: string): Promise<boolean> {
    // File storage doesn't support individual memory deletion
    console.log(`[FileStorage] deleteMemory not implemented: ${memoryId}`)
    return false
  }
}

// ============================================
// File Storage Provider
// ============================================

export class FileStorageProvider implements IStorageProvider {
  userProfile: IUserProfileStorage
  agentMemory: IAgentMemoryStorage

  constructor() {
    this.userProfile = new FileUserProfileStorage()
    this.agentMemory = new FileAgentMemoryStorage()
  }

  async initialize(): Promise<void> {
    // 确保所有目录存在
    ensureStoreDirs()
  }

  async close(): Promise<void> {
    // 文件存储不需要关闭连接
  }
}
