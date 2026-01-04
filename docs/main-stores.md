# 主进程状态管理 (Main Stores)

## 概述

主进程使用基于 JSON 文件的轻量级状态管理系统，而非依赖第三方状态管理库。所有数据存储在 `userData/data/` 目录下，采用模块化设计。

## 目录结构

```
src/main/stores/
├── index.ts           # 统一导出 + 迁移逻辑
├── paths.ts           # 路径管理 + 文件操作工具
├── app-state.ts       # 应用运行状态
├── settings.ts        # 用户设置
├── sessions.ts        # 聊天会话
├── workspaces.ts      # 工作空间
├── agents.ts          # Agent 管理
└── models-cache.ts    # 模型缓存
```

## 核心模块

### 1. paths.ts - 路径管理

提供所有存储路径和文件操作工具：

```typescript
// 路径函数
getStorePath()           // userData/data/
getSettingsPath()        // userData/data/settings.json
getSessionsDir()         // userData/data/sessions/
getWorkspacesDir()       // userData/data/workspaces/
getAgentsDir()           // userData/data/agents/
getDatabasePath()        // userData/data/memory.db (SQLite)

// 文件操作工具
readJsonFile<T>(path, defaultValue): T   // 安全读取 JSON
writeJsonFile<T>(path, data): void       // 安全写入 JSON
deleteJsonFile(path): boolean            // 安全删除文件
ensureStoreDirs(): void                  // 确保所有目录存在
```

### 2. app-state.ts - 应用状态

管理运行时状态，不包含业务数据：

```typescript
interface AppState {
  currentSessionId: string       // 当前会话 ID
  currentWorkspaceId: string | null  // 当前工作空间（null = 默认模式）
  pinnedAgentIds: string[]       // 置顶的 Agent ID 列表
}

// API
getCurrentSessionId(): string
setCurrentSessionId(id: string): void
getCurrentWorkspaceId(): string | null
setCurrentWorkspaceId(id: string | null): void
getPinnedAgentIds(): string[]
pinAgent(agentId: string): string[]
unpinAgent(agentId: string): string[]
```

### 3. settings.ts - 用户设置

管理所有用户可配置的设置：

```typescript
interface AppSettings {
  ai: {
    provider: AIProvider
    temperature: number
    providers: Record<AIProvider, ProviderConfig>
  }
  theme: 'light' | 'dark'
  general: {
    animationSpeed: number
    sendShortcut: 'enter' | 'ctrl-enter' | 'cmd-enter'
    colorTheme: string
    baseTheme: string
  }
  tools: {
    enableToolCalls: boolean
    tools: Record<string, ToolSettings>
    bash: BashSettings
  }
  embedding: EmbeddingSettings
}

// API
getSettings(): AppSettings
saveSettings(settings: AppSettings): void
```

**特性**：
- 自动迁移旧版设置格式
- 缺失字段自动补充默认值
- 支持多 AI Provider 独立配置

### 4. sessions.ts - 会话管理

管理聊天会话，采用 **索引 + 独立文件** 的设计：

```
sessions/
├── index.json          # 会话元数据索引（用于快速列表）
├── {sessionId}.json    # 完整会话数据
└── ...
```

```typescript
interface SessionMeta {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  parentSessionId?: string    // 分支父会话
  branchFromMessageId?: string
  isPinned?: boolean
  isArchived?: boolean
  workspaceId?: string
  agentId?: string
}

// 会话操作
getSessions(): ChatSession[]
getSession(id): ChatSession | undefined
createSession(id, name, workspaceId?, agentId?): ChatSession
createBranchSession(id, name, parentId, branchFromMsgId, msgs): ChatSession
deleteSession(id): DeleteSessionResult  // 级联删除子会话
renameSession(id, name): void
updateSessionPin(id, isPinned): void
updateSessionArchived(id, isArchived): void

// 消息操作
addMessage(sessionId, message): void
deleteMessage(sessionId, messageId): boolean
updateMessageContent(sessionId, messageId, content): boolean
updateMessageAndTruncate(sessionId, messageId, newContent): boolean  // 编辑+截断

// Step 操作（工具调用步骤）
addMessageStep(sessionId, messageId, step): boolean
updateMessageStep(sessionId, messageId, stepId, updates): boolean
```

**特性**：
- **启动时清理**：`sanitizeSession()` 清理中断状态
- **级联删除**：删除会话时自动删除所有分支
- **Token 统计**：累计会话 Token 使用量
- **分支支持**：从任意消息创建分支会话

### 5. workspaces.ts - 工作空间

管理工作空间（项目隔离）：

```typescript
interface Workspace {
  id: string
  name: string
  avatar: WorkspaceAvatar  // { type: 'emoji' | 'image', value: string }
  workingDirectory?: string
  createdAt: number
  updatedAt: number
}

// API
getWorkspaces(): Workspace[]
getWorkspace(id): Workspace | undefined
createWorkspace(id, name, avatar, workingDir?): Workspace
updateWorkspace(id, updates): Workspace | undefined
deleteWorkspace(id): boolean
switchWorkspace(id | null): boolean
uploadWorkspaceAvatar(id, imageData, mimeType): string | null
```

### 6. agents.ts - Agent 管理

管理自定义 Agent：

```typescript
interface Agent {
  id: string
  name: string
  avatar: AgentAvatar
  systemPrompt: string
  tagline?: string
  personality?: string[]
  primaryColor?: string
  createdAt: number
  updatedAt: number
}

// API
getAgents(): Agent[]
getAgent(id): Agent | undefined
createAgent(id, name, avatar, systemPrompt, options?): Agent
updateAgent(id, updates): Agent | undefined
deleteAgent(id): boolean
uploadAgentAvatar(id, imageData, mimeType): string | null
```

## 数据流示意

```
┌─────────────────────────────────────────────────────────────────┐
│                        IPC Handler                               │
│                  (chat.ts / sessions.ts)                         │
└───────────────────────────────┬─────────────────────────────────┘
                                │ 调用
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                       Main Stores                                │
│   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│   │   settings   │  │   sessions   │  │    agents    │         │
│   └──────┬───────┘  └──────┬───────┘  └──────┬───────┘         │
│          │                 │                 │                   │
│          └─────────────────┼─────────────────┘                   │
│                            │                                     │
│                            ▼                                     │
│                    ┌───────────────┐                             │
│                    │  paths.ts     │                             │
│                    │ readJsonFile  │                             │
│                    │ writeJsonFile │                             │
│                    └───────┬───────┘                             │
└────────────────────────────┼────────────────────────────────────┘
                             │
                             ▼
                    ┌───────────────┐
                    │  File System  │
                    │  (JSON 文件)  │
                    └───────────────┘
```

## 初始化流程

```typescript
// src/main/stores/index.ts
export function initializeStores(): void {
  // 1. 确保所有目录存在
  ensureStoreDirs()

  // 2. 检查并执行旧版迁移
  const migrationMarker = path.join(getStorePath(), '.migrated')
  if (!fs.existsSync(migrationMarker)) {
    // 从 electron-store 迁移到文件系统
    migrateFromOldStore()
    fs.writeFileSync(migrationMarker, new Date().toISOString())
  }
}
```

## 设计原则

### 1. 简单优先

使用 JSON 文件而非数据库（会话数据），原因：
- 易于调试（可直接查看/编辑文件）
- 无需复杂迁移
- 对会话数据规模足够

### 2. 索引分离

对会话等大量数据，采用 **索引 + 独立文件** 模式：
- 列表加载只需读取索引
- 单个会话独立文件，避免大文件读写

### 3. 原子操作

每次写入都是完整的 JSON 文件替换，避免部分写入导致的数据损坏。

### 4. 默认值兜底

所有 `readJsonFile` 调用都提供默认值，确保数据缺失时不会崩溃。

## 相关文档

- [Storage 存储层](./storage.md) - SQLite 向量存储
- [Renderer Stores](./renderer-stores.md) - 渲染进程状态管理
- [IPC Handlers](./ipc-handlers.md) - IPC 处理器
