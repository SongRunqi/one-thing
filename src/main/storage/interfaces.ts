/**
 * Storage Abstraction Layer
 *
 * 设计理念：
 * - 定义清晰的存储接口，与具体实现解耦
 * - 当前使用文件存储，未来可轻松切换到 SQLite、PostgreSQL 等
 * - 每个数据域有独立的存储接口
 */

import type {
  UserProfile,
  UserFact,
  UserFactCategory,
  AgentMemory,
  AgentMemoryCategory,
  AgentUserRelationship,
  AgentMood,
} from '../../shared/ipc.js'

// Re-export types for convenience
export type { AgentMemory, AgentUserRelationship }

// ============================================
// User Profile Storage Interface
// ============================================

export interface IUserProfileStorage {
  /**
   * 获取用户画像
   */
  getProfile(): Promise<UserProfile>

  /**
   * 添加一个事实
   */
  addFact(
    content: string,
    category: UserFactCategory,
    confidence?: number,
    sourceAgentId?: string
  ): Promise<UserFact>

  /**
   * 更新一个事实
   */
  updateFact(
    factId: string,
    updates: {
      content?: string
      category?: UserFactCategory
      confidence?: number
    }
  ): Promise<UserFact | null>

  /**
   * 删除一个事实
   */
  deleteFact(factId: string): Promise<boolean>

  /**
   * 按类别获取事实
   */
  getFactsByCategory(category: UserFactCategory): Promise<UserFact[]>

  /**
   * 搜索事实（用于 AI 提取相关信息）
   */
  searchFacts(query: string): Promise<UserFact[]>
}

// ============================================
// Agent Memory Storage Interface (Phase 3)
// ============================================

export interface IAgentMemoryStorage {
  /**
   * 获取 Agent 与用户的关系数据
   */
  getRelationship(agentId: string): Promise<AgentUserRelationship | null>

  /**
   * 创建或更新关系数据
   */
  saveRelationship(relationship: AgentUserRelationship): Promise<void>

  /**
   * 添加一条记忆
   */
  addMemory(agentId: string, memory: Omit<AgentMemory, 'id'>): Promise<AgentMemory>

  /**
   * 更新记忆强度（每次回忆时调用）
   */
  recallMemory(agentId: string, memoryId: string): Promise<AgentMemory | null>

  /**
   * 获取活跃记忆（按强度排序）
   */
  getActiveMemories(agentId: string, limit?: number): Promise<AgentMemory[]>

  /**
   * 执行记忆衰减（定期调用）
   */
  decayMemories(agentId: string): Promise<void>

  /**
   * 记录一次交互（更新关系统计）
   */
  recordInteraction(agentId: string): Promise<AgentUserRelationship>

  /**
   * 更新关系状态
   */
  updateRelationship(
    agentId: string,
    updates: {
      trustLevel?: number
      familiarity?: number
      mood?: AgentMood
      moodNotes?: string
    }
  ): Promise<AgentUserRelationship | null>

  /**
   * 标记记忆为已被取代（用于冲突解决）
   */
  markSuperseded(oldMemoryId: string, newMemoryId: string): Promise<void>

  /**
   * 删除记忆
   */
  deleteMemory(memoryId: string): Promise<boolean>

  /**
   * 混合检索记忆（语义相似度 + 记忆强度）
   */
  hybridRetrieveMemories(
    agentId: string,
    query: string,
    limit?: number,
    options?: {
      similarityWeight?: number
      strengthWeight?: number
      minSimilarity?: number
    }
  ): Promise<AgentMemory[]>
}

// ============================================
// Storage Factory Interface
// ============================================

export interface IStorageProvider {
  userProfile: IUserProfileStorage
  agentMemory: IAgentMemoryStorage

  /**
   * 初始化存储（创建目录、数据库连接等）
   */
  initialize(): Promise<void>

  /**
   * 关闭存储（清理连接等）
   */
  close(): Promise<void>
}

// ============================================
// Storage Configuration
// ============================================

export type StorageType = 'file' | 'sqlite' | 'postgres'

export interface StorageConfig {
  type: StorageType
  // 文件存储配置
  dataDir?: string
  // 数据库配置（未来使用）
  database?: {
    host?: string
    port?: number
    name?: string
    user?: string
    password?: string
  }
}
