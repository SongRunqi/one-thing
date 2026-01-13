# 文本记忆系统 (Text-Based Memory System)

本文档介绍 0neThing 应用的文本记忆系统，这是一个基于 Markdown 文件的轻量级记忆存储方案。

## 概述

### 设计理念

对于当前的 LLM 来说，**记忆的本质只是把相关文本放入提示词**。基于这一认知，我们采用了一个极简的设计方案：

- **不依赖数据库**：使用纯文本 Markdown 文件存储
- **无向量嵌入**：通过关键词匹配检索相关内容
- **用户可编辑**：用户可以直接编辑 `.md` 文件管理自己的记忆
- **跨平台兼容**：统一存储在用户目录下

### 与旧系统对比

| 特性 | 旧系统 (SQLite + Vector) | 新系统 (Text-Based) |
|------|--------------------------|---------------------|
| 存储方式 | SQLite 数据库 + 向量 | Markdown 文件 |
| 检索方式 | 向量相似度搜索 | 关键词匹配 |
| 记忆衰减 | 自动衰减算法 | 无衰减，用户手动管理 |
| 用户可编辑 | 否 | 是 |
| 复杂度 | 高 | 低 |
| 依赖 | Embedding API | 无外部依赖 |

---

## 目录结构

记忆文件存储在用户目录下的 `.0nething/memory/` 文件夹中：

```
~/.0nething/memory/              # 记忆根目录
├── _core/                       # 核心记忆（每次对话必定加载）
│   ├── profile.md              # 用户基本信息
│   └── preferences.md          # 用户偏好设置
│
├── topics/                      # 主题记忆（按需加载）
│   ├── vue.md                  # Vue 相关知识
│   ├── electron.md             # Electron 相关
│   ├── typescript.md           # TypeScript 相关
│   └── projects/               # 项目子目录
│       ├── my-app.md
│       └── work-project.md
│
└── agents/                      # Agent 专属记忆
    └── {agentId}/              # 每个 Agent 独立目录
        ├── relationship.md     # 与用户的关系状态
        └── topics/             # Agent 专属主题
            └── ...
```

### 跨平台路径

| 操作系统 | 路径 |
|----------|------|
| macOS | `/Users/<username>/.0nething/memory/` |
| Linux | `/home/<username>/.0nething/memory/` |
| Windows | `C:\Users\<username>\.0nething\memory\` |

---

## 文件格式

### Markdown 结构

所有记忆文件采用统一的 Markdown 格式，以 `## Heading` 作为段落分隔符：

```markdown
# 文件标题

## Section 1
- Point 1
- Point 2

## Section 2
Content here...

## Section 3
More content...
```

### `_core/profile.md` 示例

```markdown
# User Profile

## Basic Info
- Name: John
- Location: Shanghai
- Timezone: UTC+8

## Background
- Software Engineer with 5 years experience
- Specializes in frontend development
- Currently working at a startup
```

### `_core/preferences.md` 示例

```markdown
# User Preferences

## Communication Style
- Prefers concise, direct answers
- Likes code examples
- Speaks Mandarin and English

## Technical Preferences
- Uses TypeScript over JavaScript
- Prefers Vue over React
- Uses VS Code as IDE
```

### `agents/{agentId}/relationship.md` 示例

```markdown
# Agent Relationship

## Basic Status
- Trust Level: 75/100
- Familiarity: 60/100
- Total Interactions: 42

## Current Mood
- Status: happy
- Notes: User completed a big project recently

## Memory Points
- User likes brief responses
- Often works late at night
- Prefers practical examples
```

---

## 架构图

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Text Memory System                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   User Message                                                           │
│        │                                                                 │
│        ▼                                                                 │
│   ┌──────────────────┐                                                  │
│   │  Keyword Extractor │  ─────── 提取: ["Vue", "组件", "性能"]          │
│   └────────┬─────────┘                                                  │
│            │                                                             │
│            ▼                                                             │
│   ┌──────────────────┐     ┌──────────────────┐                        │
│   │  Memory Retriever │────▶│   Text Storage   │                        │
│   └────────┬─────────┘     │                  │                        │
│            │               │  ~/.0nething/    │                        │
│            │               │    memory/       │                        │
│            │               └──────────────────┘                        │
│            │                                                             │
│   ┌────────┴─────────┐                                                  │
│   │                  │                                                   │
│   ▼                  ▼                                                   │
│ ┌──────────┐   ┌───────────┐                                           │
│ │  _core/  │   │  topics/  │   ← 文件名匹配 + 内容搜索                   │
│ │ 必定加载  │   │  按需加载  │                                           │
│ └──────────┘   └───────────┘                                           │
│                                                                          │
│                     │                                                    │
│                     ▼                                                    │
│            ┌──────────────────┐                                         │
│            │  Format Prompt   │  ─────── 格式化为系统提示词              │
│            └────────┬─────────┘                                         │
│                     │                                                    │
│                     ▼                                                    │
│             Inject to LLM                                                │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 数据流

### 读取记忆（对话开始时）

```
1. 用户发送消息
       │
       ▼
2. 加载核心记忆 (_core/*.md)
   → 读取 profile.md, preferences.md
   → 始终注入到 prompt
       │
       ▼
3. 加载 Agent 关系（如果有 agentId）
   → agents/{agentId}/relationship.md
       │
       ▼
4. 提取关键词
   → 用户消息: "帮我优化 Vue 组件的性能"
   → 关键词: ["vue", "组件", "性能", "优化"]
       │
       ▼
5. 搜索共享主题 (topics/)
   a. 文件名匹配: vue.md ✓
   b. 内容匹配: 搜索包含关键词的段落
       │
       ▼
6. 搜索 Agent 专属主题
   → agents/{agentId}/topics/*.md
       │
       ▼
7. 提取匹配段落
   → 按 ## 分隔，返回匹配的 section
       │
       ▼
8. 格式化并注入 prompt
   → <user_memory>...</user_memory>
```

### 写入记忆（对话结束后）

```
1. 对话完成
       │
       ▼
2. Text Memory Update Trigger 触发
   → 检查是否需要提取记忆
   → 跳过: 简单问候、技术问答
       │
       ▼
3. LLM 分析对话内容
   → 使用 MEMORY_EXTRACTION_PROMPT
   → 返回 JSON 格式的提取结果
       │
       ▼
4. 解析提取结果
   {
     "shouldRemember": true,
     "profile": { "section": "Skills", "content": "Learning Rust" },
     "topic": { "name": "rust", "section": "Learning", "content": "..." }
   }
       │
       ▼
5. 写入对应文件
   → updateUserProfile() → _core/profile.md
   → createTopicFile() → topics/rust.md
   → addAgentMemoryPoint() → agents/{id}/relationship.md
```

---

## 核心模块

### 1. TextMemoryStorage (`text-memory-storage.ts`)

核心存储类，管理文件的读写操作。

```typescript
class TextMemoryStorage {
  // 初始化目录结构
  async initialize(): Promise<void>

  // 加载核心记忆
  async loadCoreMemory(): Promise<string | undefined>

  // 加载 Agent 关系
  async loadAgentRelationship(agentId: string): Promise<string | undefined>

  // 搜索主题文件
  async searchTopics(keywords: string[], agentId?: string): Promise<MemorySection[]>

  // 写入文件
  async writeMemoryFile(relativePath: string, content: string): Promise<void>

  // 追加到指定 section
  async appendToSection(relativePath: string, section: string, content: string): Promise<void>

  // 更新 Agent 关系
  async updateAgentRelationship(agentId: string, updates: Partial<AgentRelationship>): Promise<void>
}
```

### 2. MemoryRetriever (`memory-retriever.ts`)

检索逻辑，负责关键词提取和内容匹配。

```typescript
// 提取关键词（简单规则，不依赖 LLM）
function extractKeywords(text: string): string[]

// 加载对话所需的所有记忆
async function loadMemoryForChat(
  userMessage: string,
  agentId?: string
): Promise<{
  coreMemory?: string
  agentRelationship?: string
  topicMemory?: string
}>

// 格式化为 prompt
function formatMemoryPrompt(
  coreMemory?: string,
  agentRelationship?: string,
  topicMemory?: string
): string | undefined
```

### 3. MemoryWriter (`memory-writer.ts`)

写入逻辑，负责更新记忆文件。

```typescript
// 更新用户档案
async function updateUserProfile(section: string, content: string): Promise<void>

// 更新用户偏好
async function updateUserPreferences(section: string, content: string): Promise<void>

// 创建主题文件
async function createTopicFile(topic: string, content: string): Promise<void>

// 添加 Agent 记忆点
async function addAgentMemoryPoint(agentId: string, memory: string): Promise<void>

// 列出现有主题
async function listExistingTopics(agentId?: string): Promise<string[]>
```

### 4. TextMemoryUpdateTrigger (`text-memory-update.ts`)

对话结束后的记忆提取触发器。

```typescript
const textMemoryUpdateTrigger: Trigger = {
  id: 'text-memory-update',
  name: 'Text Memory Update',
  priority: 5,

  // 判断是否触发
  async shouldTrigger(ctx: TriggerContext): Promise<boolean>,

  // 执行记忆提取
  async execute(ctx: TriggerContext): Promise<void>
}
```

---

## 关键词提取算法

采用简单的规则提取，不依赖 LLM：

```typescript
function extractKeywords(text: string): string[] {
  // 1. 转小写
  // 2. 分词（空格、标点）
  // 3. 过滤停用词
  // 4. 过滤短词 (< 2 字符)
  // 5. 去重

  const STOP_WORDS = [
    'the', 'a', 'an', 'is', 'are', 'was', 'were',
    'i', 'you', 'he', 'she', 'it', 'we', 'they',
    'this', 'that', 'these', 'those',
    'what', 'how', 'why', 'when', 'where',
    // 中文停用词
    '的', '是', '在', '了', '有', '和', '与',
    '我', '你', '他', '她', '它', '们',
    '这', '那', '什么', '怎么', '为什么',
    // ...
  ]
}
```

### 匹配流程

```
用户消息: "帮我优化 Vue 组件的性能"
            │
            ▼
       分词 + 过滤
            │
            ▼
    关键词: ["vue", "组件", "性能", "优化"]
            │
     ┌──────┴──────┐
     │             │
     ▼             ▼
文件名匹配      内容匹配
 vue.md ✓     搜索每个 .md 文件
               的内容是否包含关键词
     │             │
     └──────┬──────┘
            │
            ▼
      返回匹配的 sections
```

---

## 配置

### 记忆功能开关

在设置中可以启用/禁用记忆功能：

```typescript
// src/main/stores/settings.ts
settings.embedding.memoryEnabled = true  // 或 false
```

### Trigger 优先级

```typescript
// src/main/services/triggers/text-memory-update.ts
priority: 5  // 较早执行
```

### 消息长度阈值

```typescript
// 跳过过短的对话
const MIN_USER_MESSAGE_LENGTH = 10
const MIN_ASSISTANT_MESSAGE_LENGTH = 30
```

---

## 文件结构

```
src/main/services/memory-text/
├── index.ts                    # 模块导出
├── text-memory-storage.ts      # 核心存储类
├── memory-retriever.ts         # 检索逻辑
└── memory-writer.ts            # 写入逻辑

src/main/services/triggers/
└── text-memory-update.ts       # 记忆提取触发器

src/main/ipc/chat/
└── memory-helpers.ts           # Chat 集成 helper 函数
```

---

## UI 集成

### "Extracting memory" 状态

在加载记忆时，前端显示流水动画：

```vue
<!-- MessageThinking.vue -->
<div v-if="loadingMemory && isStreaming && !hasContent && !reasoning"
     class="thinking-status">
  <span class="thinking-text flowing">Extracting memory</span>
</div>
```

### ContentPart 类型

```typescript
// src/shared/ipc/chat.ts
export type ContentPart =
  | { type: 'text'; content: string }
  | { type: 'tool-call'; toolCalls: ToolCall[] }
  | { type: 'waiting' }
  | { type: 'loading-memory' }  // 新增
  | { type: 'data-steps'; turnIndex: number }
```

---

## 使用示例

### 手动编辑记忆文件

用户可以直接编辑 `~/.0nething/memory/` 下的文件：

```bash
# 编辑用户档案
vim ~/.0nething/memory/_core/profile.md

# 添加新的主题文件
echo "# Python

## 偏好
- 使用 Python 3.10+
- 喜欢使用 type hints
- 偏好 poetry 管理依赖
" > ~/.0nething/memory/topics/python.md
```

### 程序化访问

```typescript
import {
  getTextMemoryStorage,
  loadMemoryForChat,
  formatMemoryPrompt
} from './services/memory-text'

// 加载记忆
const memory = await loadMemoryForChat(
  "帮我写一个 Vue 组件",
  "agent-123"
)

// 格式化为 prompt
const memoryPrompt = formatMemoryPrompt(
  memory.coreMemory,
  memory.agentRelationship,
  memory.topicMemory
)

// 注入到系统提示词
const systemPrompt = `
You are a helpful assistant.

${memoryPrompt ? `<user_memory>\n${memoryPrompt}\n</user_memory>` : ''}
`
```

### 更新记忆

```typescript
import {
  updateUserProfile,
  createTopicFile,
  addAgentMemoryPoint
} from './services/memory-text'

// 更新用户档案
await updateUserProfile('Skills', '- Learning Rust programming')

// 创建新主题
await createTopicFile('rust', `## Learning Progress
- Started learning Rust
- Interested in systems programming
`)

// 添加 Agent 记忆点
await addAgentMemoryPoint('agent-123', 'User prefers detailed explanations')
```

---

## 初始化流程

应用启动时自动初始化：

```typescript
// src/main/index.ts
app.on('ready', async () => {
  // ... 其他初始化

  // 初始化文本记忆系统
  await initializeTextMemory()
  // 输出: [TextMemory] Initialized at: /Users/xxx/.0nething/memory
})
```

初始化过程：
1. 创建目录结构 (`_core/`, `topics/`, `agents/`)
2. 生成默认的 `profile.md` 和 `preferences.md`
3. 日志输出初始化路径

---

## 最佳实践

### 1. 文件组织

- **核心信息**放在 `_core/`：用户的基本信息、通用偏好
- **专业知识**放在 `topics/`：技术栈、项目、领域知识
- **关系状态**放在 `agents/{id}/`：每个 Agent 独立维护

### 2. Section 命名

使用清晰、描述性的 `## Heading`：
- ✅ `## Technical Skills`
- ✅ `## Communication Preferences`
- ❌ `## Notes`
- ❌ `## Misc`

### 3. 内容格式

使用列表格式便于解析和更新：
```markdown
## Skills
- TypeScript: Advanced
- Vue.js: Advanced
- Rust: Learning
```

### 4. Agent 记忆

- 每个 Agent 保持独立的记忆空间
- `relationship.md` 记录关系状态和互动历史
- 可以为 Agent 创建专属的 `topics/` 子目录

---

## 限制与注意事项

1. **无自动衰减**：旧记忆不会自动删除，需要用户手动清理
2. **关键词匹配限制**：相比向量搜索，可能错过语义相关但词汇不同的内容
3. **文件冲突**：多实例同时写入可能产生冲突（暂不支持）
4. **大文件性能**：单个文件过大可能影响加载速度，建议拆分

---

## 后续扩展计划

- [ ] LLM 辅助关键词提取（更智能的匹配）
- [ ] 自动归档过期内容
- [ ] Memory 版本控制 (git 集成)
- [ ] Web UI 记忆编辑器
- [ ] 从旧 SQLite 数据迁移工具
