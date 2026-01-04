# 记忆服务 (Memory Service)

## 概述

记忆服务提供 AI 对话的长期记忆能力，包括：
- **用户事实 (UserFacts)**：关于用户的事实性信息
- **Agent 记忆 (AgentMemory)**：Agent 与用户交互的记忆
- **向量检索**：基于语义相似度的记忆召回

## 目录结构

```
src/main/services/memory/
├── index.ts               # 统一导出
├── embedding-service.ts   # 向量嵌入服务
├── memory-manager.ts      # 记忆管理（Mem0 风格）
├── memory-extractor.ts    # 记忆提取
├── memory-linker.ts       # 记忆关联
├── memory-scheduler.ts    # 记忆衰减调度
└── conflict-resolver.ts   # 冲突解决
```

## 核心模块

### 1. Embedding Service

提供文本向量化能力，支持多个 Provider：

```typescript
interface EmbeddingResult {
  embedding: number[]
  source: 'api' | 'local'
  model: string
  provider: EmbeddingProviderType  // 'openai' | 'zhipu' | 'gemini' | 'local'
}

interface EmbeddingService {
  embed(text: string): Promise<EmbeddingResult>
  embedBatch(texts: string[]): Promise<EmbeddingResult[]>
  getDimension(): number
  isReady(): boolean
}
```

**支持的 Provider**：

| Provider | 模型 | 维度 | 特点 |
|----------|------|------|------|
| OpenAI | text-embedding-3-small | 384-3072 | 可配置维度 |
| Zhipu | embedding-3 | 2048 | 中文优化 |
| Gemini | text-embedding-004 | 768 | 多语言 |
| Local | all-MiniLM-L6-v2 | 384 | 离线可用 |

**Fallback 机制**：
```
API Provider (配置的) → Local Model (兜底)
```

**使用示例**：

```typescript
import { getEmbeddingService, cosineSimilarity } from './services/memory'

const embeddingService = getEmbeddingService()
const result = await embeddingService.embed('用户喜欢编程')

// 相似度计算
const similarity = cosineSimilarity(embedding1, embedding2)
```

---

### 2. Memory Manager

采用 **Mem0 风格** 的智能记忆管理：

```typescript
type MemoryOperation = 'ADD' | 'UPDATE' | 'DELETE' | 'NOOP'

interface MemoryDecision {
  operation: MemoryOperation
  reason: string
  targetId?: string      // UPDATE/DELETE 时的目标 ID
  mergedContent?: string // UPDATE 时的合并内容
}
```

**工作流程**：

```
新信息输入
    │
    ▼
┌─────────────────────┐
│  向量相似度搜索      │
│  找到相关记忆        │
└──────────┬──────────┘
           │
           ▼
    ┌──────────────┐
    │ 有相关记忆?   │
    └──────┬───────┘
           │
     ╔═════╧═════╗
     ▼           ▼
   无相关      有相关
     │           │
     ▼           ▼
  直接 ADD    LLM 决策
               │
     ┌─────────┼─────────┬─────────┐
     ▼         ▼         ▼         ▼
   ADD      UPDATE    DELETE     NOOP
   新增       合并      替换      跳过
```

**决策 Prompt**（参考 Mem0）：

```
You are a smart memory manager. Decide what operation to perform:

## New Information
{newContent}

## Existing Related Memories
{existingMemories}

## Operations
1. ADD: New information is completely new
2. UPDATE: Enriches existing memory (merge and keep more details)
3. DELETE: Directly contradicts existing memory
4. NOOP: Already contained in existing memory

Return JSON: {"operation":"...", "reason":"...", "targetId":"...", "mergedContent":"..."}
```

**API**：

```typescript
// 处理用户事实
async function processUserFact(
  providerId: string,
  providerConfig: ProviderConfig,
  newFact: { content: string; category: UserFactCategory; confidence: number },
  sourceAgentId?: string
): Promise<{
  action: 'added' | 'updated' | 'deleted_and_added' | 'skipped'
  factId?: string
  decision: MemoryDecision
}>

// 处理 Agent 记忆
async function processAgentMemory(
  providerId: string,
  providerConfig: ProviderConfig,
  agentId: string,
  newMemory: { content: string; category: string; emotionalWeight: number }
): Promise<{
  action: 'added' | 'updated' | 'deleted_and_added' | 'skipped'
  memoryId?: string
  decision: MemoryDecision
}>
```

---

### 3. Memory Extractor

从对话中自动提取记忆：

```typescript
// 提取并保存所有记忆（用户事实 + Agent 记忆）
async function extractAndSaveMemories(
  providerId: string,
  providerConfig: ProviderConfig,
  userMessage: string,
  assistantMessage: string,
  agentId: string
): Promise<void>

// 仅提取用户事实（非 Agent 模式）
async function extractAndSaveUserFactsOnly(
  providerId: string,
  providerConfig: ProviderConfig,
  userMessage: string,
  assistantMessage: string
): Promise<void>
```

**提取类型**：

| 类型 | 示例 | 存储位置 |
|------|------|----------|
| 用户偏好 | "用户喜欢深色模式" | UserFacts |
| 个人信息 | "用户是软件工程师" | UserFacts |
| 交互记忆 | "讨论了 Vue 项目架构" | AgentMemory |
| 情感记忆 | "用户对进度满意" | AgentMemory |

---

### 4. Memory Scheduler

管理记忆衰减和维护：

```typescript
interface MemorySchedulerConfig {
  decayInterval: number    // 衰减检查间隔（毫秒）
  decayThreshold: number   // 强度低于此值时标记为 faded
  decayRate: number        // 每次衰减的强度减少量
}

class MemoryScheduler {
  start(): void
  stop(): void
  forceDecay(): Promise<DecayResult>
  getStats(): SchedulerStats
}
```

**记忆生命周期**：

```
vivid (鲜明) ──衰减──> fading (模糊) ──衰减──> faded (消退)
     │                    │                    │
  strength: 80-100    strength: 40-79     strength: <40
```

---

### 5. Conflict Resolver

处理记忆冲突：

```typescript
interface ConflictResult {
  hasConflict: boolean
  conflictType?: 'contradiction' | 'update' | 'duplicate'
  conflictingMemoryId?: string
  resolution?: ConflictResolution
}

type ConflictResolution = 'keep_new' | 'keep_old' | 'merge' | 'ask_user'

// 检测冲突
async function detectMemoryConflict(
  newContent: string,
  existingMemories: Array<{ id: string; content: string }>
): Promise<ConflictResult>

// 带冲突解决的添加
async function addMemoryWithConflictResolution(
  agentId: string,
  newMemory: AgentMemory,
  resolution?: ConflictResolution
): Promise<{ memoryId: string; conflictResolved?: boolean }>
```

## 数据流

```
┌─────────────────────────────────────────────────────────────┐
│                     对话完成                                 │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              Memory Extraction Trigger                       │
│         (判断是否需要提取：消息长度、内容类型等)              │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    Memory Extractor                          │
│              LLM 分析对话，提取事实和记忆                    │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    Memory Manager                            │
│           向量检索相似记忆 → LLM 决策操作                    │
└───────────────────────────┬─────────────────────────────────┘
                            │
            ┌───────────────┼───────────────┐
            ▼               ▼               ▼
     ┌──────────┐    ┌──────────┐    ┌──────────┐
     │   ADD    │    │  UPDATE  │    │  DELETE  │
     └────┬─────┘    └────┬─────┘    └────┬─────┘
          │               │               │
          ▼               ▼               ▼
┌─────────────────────────────────────────────────────────────┐
│                   SQLite + sqlite-vec                        │
│              存储记忆内容 + 向量嵌入                         │
└─────────────────────────────────────────────────────────────┘
```

## 配置

在 `settings.embedding` 中配置：

```typescript
interface EmbeddingSettings {
  provider: 'openai' | 'zhipu' | 'gemini' | 'local'
  model?: string
  dimensions?: number
  memoryEnabled?: boolean  // 是否启用记忆提取
  apiKeyOverride?: string  // 独立 API Key
  baseUrlOverride?: string // 独立 Base URL
}
```

## 性能考量

### 1. 向量维度选择

| 维度 | 内存占用 | 检索速度 | 精度 |
|------|----------|----------|------|
| 384 | 最低 | 最快 | 足够 |
| 768 | 中等 | 中等 | 更好 |
| 1536+ | 较高 | 较慢 | 最佳 |

推荐使用 **384 维度**（text-embedding-3-small 支持）。

### 2. 批量操作

```typescript
// 批量向量化
const results = await embeddingService.embedBatch(texts)

// 比循环单个 embed 更高效
```

### 3. 本地模型预加载

本地模型在应用启动时后台加载，首次 embed 可能需要等待。

## 相关文档

- [Storage 存储层](./storage.md) - SQLite 存储实现
- [Triggers 触发器](./triggers.md) - 记忆提取触发器
- [Memory System](./memory-system.md) - 完整记忆系统设计
