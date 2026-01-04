# Storage 存储层

## 概述

Storage 模块是 0neThing 的数据持久化层，支持 **SQLite** 和 **File** 两种存储后端。默认使用 SQLite，支持向量搜索（通过 sqlite-vec 扩展）。

## 设计理念

1. **接口抽象**: 定义清晰的存储接口，与具体实现解耦
2. **可扩展**: 未来可轻松切换到 PostgreSQL 等其他数据库
3. **向量支持**: 内置向量存储，支持语义搜索
4. **数据域分离**: 每个数据域有独立的存储接口

## 目录结构

```
src/main/storage/
├── index.ts           # 入口文件，导出统一 API
├── interfaces.ts      # 接口定义
├── sqlite-storage.ts  # SQLite 实现（带向量支持）
└── file-storage.ts    # 文件存储实现（备选）
```

## 核心接口

### IStorageProvider

存储提供者的主接口：

```typescript
interface IStorageProvider {
  userProfile: IUserProfileStorage   // 用户画像存储
  agentMemory: IAgentMemoryStorage   // Agent 记忆存储

  initialize(): Promise<void>        // 初始化
  close(): Promise<void>             // 关闭连接
}
```

### IUserProfileStorage

用户画像存储接口：

```typescript
interface IUserProfileStorage {
  // 获取用户画像
  getProfile(): Promise<UserProfile>

  // 事实管理
  addFact(content: string, category: UserFactCategory, confidence?: number, sourceAgentId?: string): Promise<UserFact>
  updateFact(factId: string, updates: Partial<UserFact>): Promise<UserFact | null>
  deleteFact(factId: string): Promise<boolean>

  // 查询
  getFactsByCategory(category: UserFactCategory): Promise<UserFact[]>
  searchFacts(query: string): Promise<UserFact[]>
}
```

### IAgentMemoryStorage

Agent 记忆存储接口：

```typescript
interface IAgentMemoryStorage {
  // 关系管理
  getRelationship(agentId: string): Promise<AgentUserRelationship | null>
  saveRelationship(relationship: AgentUserRelationship): Promise<void>
  updateRelationship(agentId: string, updates: RelationshipUpdates): Promise<AgentUserRelationship | null>
  recordInteraction(agentId: string): Promise<AgentUserRelationship>

  // 记忆管理
  addMemory(agentId: string, memory: Omit<AgentMemory, 'id'>): Promise<AgentMemory>
  recallMemory(agentId: string, memoryId: string): Promise<AgentMemory | null>
  getActiveMemories(agentId: string, limit?: number): Promise<AgentMemory[]>
  deleteMemory(memoryId: string): Promise<boolean>
  markSuperseded(oldMemoryId: string, newMemoryId: string): Promise<void>

  // 记忆衰减
  decayMemories(agentId: string): Promise<void>

  // 混合检索
  hybridRetrieveMemories(agentId: string, query: string, limit?: number, options?: HybridOptions): Promise<AgentMemory[]>
}
```

## API 参考

### 初始化

```typescript
import { initializeStorage, getStorage, closeStorage } from './storage'

// 初始化（默认使用 SQLite）
await initializeStorage('sqlite')

// 获取存储实例
const storage = getStorage()

// 关闭连接
await closeStorage()
```

### 用户画像操作

```typescript
const storage = getStorage()

// 获取用户画像
const profile = await storage.userProfile.getProfile()

// 添加事实
const fact = await storage.userProfile.addFact(
  '用户喜欢编程',
  'preference',
  85,
  'assistant-1'
)

// 搜索事实（语义搜索）
const facts = await storage.userProfile.searchFacts('编程偏好')
```

### Agent 记忆操作

```typescript
const storage = getStorage()

// 添加记忆
const memory = await storage.agentMemory.addMemory('agent-1', {
  content: '用户今天心情不错',
  category: 'observation',
  strength: 80,
  emotionalWeight: 60,
  createdAt: Date.now(),
  lastRecalledAt: Date.now(),
  recallCount: 0,
  linkedMemories: [],
  vividness: 'vivid',
})

// 混合检索（语义 + 强度）
const memories = await storage.agentMemory.hybridRetrieveMemories(
  'agent-1',
  '用户的情绪状态',
  10,
  { similarityWeight: 0.6, strengthWeight: 0.4 }
)

// 记忆衰减
await storage.agentMemory.decayMemories('agent-1')
```

## SQLite 表结构

### user_profile

```sql
CREATE TABLE user_profile (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
)
```

### user_facts

```sql
CREATE TABLE user_facts (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  category TEXT NOT NULL,
  confidence INTEGER NOT NULL DEFAULT 80,
  sources TEXT DEFAULT '[]',
  embedding BLOB,                    -- 向量嵌入
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
)
```

### agent_relationships

```sql
CREATE TABLE agent_relationships (
  agent_id TEXT PRIMARY KEY,
  trust_level INTEGER NOT NULL DEFAULT 50,
  familiarity REAL NOT NULL DEFAULT 0,
  last_interaction INTEGER NOT NULL,
  total_interactions INTEGER NOT NULL DEFAULT 0,
  current_mood TEXT NOT NULL DEFAULT 'neutral',
  mood_notes TEXT DEFAULT '',
  domain_memory TEXT DEFAULT '{}'
)
```

### agent_memories

```sql
CREATE TABLE agent_memories (
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
  embedding BLOB,                    -- 向量嵌入
  superseded_by TEXT,                -- 被取代的新记忆 ID
  superseded_at INTEGER,
  FOREIGN KEY (agent_id) REFERENCES agent_relationships(agent_id)
)
```

### memory_links

知识图谱的边：

```sql
CREATE TABLE memory_links (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  relationship TEXT NOT NULL,        -- 'similar' | 'contradicts' | 'updates' | 'related'
  similarity REAL NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (source_id) REFERENCES agent_memories(id),
  FOREIGN KEY (target_id) REFERENCES agent_memories(id)
)
```

## 向量搜索

### Embedding 生成

存储时自动生成向量嵌入：

```typescript
// 添加事实时自动生成 embedding
const fact = await storage.userProfile.addFact('用户喜欢咖啡', 'preference')
// 内部调用 EmbeddingService.embed() 生成向量
```

### 语义搜索

```typescript
// 按相似度搜索
const facts = await sqliteStorage.userProfile.searchFactsBySimilarity(
  queryEmbedding,
  10,      // limit
  0.3,     // minSimilarity
  { expandByCategory: true }  // 扩展同类别的其他事实
)
```

### 混合检索

结合语义相似度和记忆强度：

```typescript
const memories = await storage.agentMemory.hybridRetrieveMemories(
  agentId,
  query,
  10,
  {
    similarityWeight: 0.6,  // 语义权重
    strengthWeight: 0.4,    // 强度权重
    minSimilarity: 0.3,     // 最小相似度阈值
  }
)
```

## 记忆生命周期

### 1. 创建

- 自动生成 embedding
- 初始强度 100
- 初始鲜明度 'vivid'

### 2. 回忆

- 强度 +5（最高 100）
- 回忆次数 +1
- 根据回忆次数升级鲜明度

### 3. 衰减

- 每天衰减 2-5 点（情感权重高的衰减慢）
- 强度降到 0 时删除
- 鲜明度随强度降级：vivid → clear → hazy → fragment

### 4. 取代

- 新记忆可以取代旧记忆
- 旧记忆标记 `superseded_by`
- 被取代的记忆不参与检索

## 知识图谱

### 记忆链接

```typescript
// 添加记忆链接
await sqliteStorage.agentMemory.addMemoryLink(
  sourceId,
  targetId,
  'similar',  // 'similar' | 'contradicts' | 'updates' | 'related'
  0.85        // 相似度
)

// 获取链接
const links = await sqliteStorage.agentMemory.getMemoryLinks(memoryId)

// 多跳查找相关记忆
const related = await sqliteStorage.agentMemory.findRelatedMemories(
  memoryId,
  2  // maxHops
)
```

## 存储位置

数据文件位于用户数据目录：

```
macOS: ~/Library/Application Support/0neThing/
Windows: %APPDATA%/0neThing/
Linux: ~/.config/0neThing/

目录结构:
├── storage.db           # SQLite 数据库
├── sessions/            # 会话数据（File 存储）
└── avatars/             # 头像文件
```

## 性能优化

### WAL 模式

SQLite 使用 WAL 模式提升并发性能：

```typescript
this.db.pragma('journal_mode = WAL')
```

### 索引

创建关键字段索引：

```sql
CREATE INDEX idx_user_facts_category ON user_facts(category);
CREATE INDEX idx_agent_memories_agent ON agent_memories(agent_id);
CREATE INDEX idx_agent_memories_strength ON agent_memories(agent_id, strength);
CREATE INDEX idx_memory_links_source ON memory_links(source_id);
CREATE INDEX idx_memory_links_target ON memory_links(target_id);
```

## 依赖关系

```
storage/
    ├── 依赖 → better-sqlite3 (SQLite 驱动)
    ├── 依赖 → sqlite-vec (向量扩展)
    ├── 依赖 → uuid (ID 生成)
    ├── 依赖 → services/memory/embedding-service (向量生成)
    └── 被依赖 ← ipc/handlers, services/memory
```

## 相关文档

- [整体架构](./ARCHITECTURE.md)
- [Memory 系统](./memory-system.md)
- [IPC 处理器](./ipc-handlers.md)
