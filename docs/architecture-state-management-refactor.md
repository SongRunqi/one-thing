# 状态管理架构重构计划

> 文档创建时间: 2026-01-14
> 状态: 问题分析完成，待实施

## 概述

本文档记录了当前系统状态管理存在的架构问题，以及渐进式重构的改进方向。

---

## 一、问题诊断

### 1.1 核心问题：无状态的"有状态"系统

系统在概念上是有状态的（有会话概念），但在实现上几乎是无状态的（每次操作都重新读取所有数据）。

```
当前架构的问题：

┌─────────────────────────────────────────────────────────────────┐
│  Main Process 把自己当作 REST API 在用                          │
│                                                                  │
│  每个 IPC 调用都是：                                            │
│    1. 从磁盘读数据                                              │
│    2. 处理                                                       │
│    3. 返回结果                                                   │
│    4. 忘记一切 ← 没有内存中的"当前状态"                         │
│                                                                  │
│  但这是桌面应用，不是 Web 服务！                                │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 具体问题清单

#### 问题 A：Settings 无内存缓存

**位置**: `src/main/stores/settings.ts:250-257`

```typescript
// 当前实现：每次都读文件 + 迁移
export function getSettings(): AppSettings {
  const settings = readJsonFile(getSettingsPath(), defaultSettings)
  return migrateSettings(settings)  // 同步，包含 15+ 个字段检查
}
```

**影响**:
- `getSettings()` 在整个应用中被调用 **28 次**
- 仅 `chat.ts` 中就调用了 **7 次**
- 每次消息处理都重复读取和迁移

#### 问题 B：Session 无内存缓存

**位置**: `src/main/stores/sessions.ts:169-181`

```typescript
// 当前实现：每次都读 JSON 文件
export function getSession(sessionId: string): ChatSession | undefined {
  const sessionPath = getSessionPath(sessionId)
  const session = readJsonFile<ChatSession | null>(sessionPath, null)
  // ...
  return sanitizeSession(session)
}
```

**影响**:
- `getSession()` 在 `tool-loop.ts` 中被调用 **15+ 次**
- 每条消息处理可能触发 20+ 次文件读取
- 切换会话时，同一个 session 被读取 **2 次**（见下文）

#### 问题 C：Skills 每次重新加载

**位置**: `src/main/ipc/skills.ts:247-264`, `src/main/skills/loader.ts:463-500`

```typescript
// 当前实现：每次都遍历文件系统
export function getSkillsForSession(workingDirectory?: string): SkillDefinition[] {
  const allSkills = loadAllSkills(workingDirectory)  // 遍历多个目录
  // ...
}
```

**调用位置**:
- `src/main/ipc/chat/tool-loop.ts:624` - 每条消息都调用
- `src/main/ipc/chat.ts:748` - 聊天处理时调用

#### 问题 D：Model Capabilities 每次检查

**位置**:
- `src/main/ipc/chat/stream-executor.ts:82-85`
- `src/main/providers/index.ts:638-657`

```typescript
// stream-executor.ts:82 - 每次发送消息都检查
const supportsImageGen = await modelRegistry.modelSupportsImageGeneration(
  configWithApiKey.model,
  providerId
)

// providers/index.ts:641-657 - 每次流调用都检查
const isReasoning = isReasoningModel(config.model, providerId)
    // → 调用 modelSupportsReasoningSync()
    // → 查询缓存 + 遍历 providers + 字符串匹配

const isDeepSeekReasoner = isReasoning && config.model.toLowerCase().includes('deepseek')
    // → 字符串 toLowerCase() + includes()

const needsSystemMerge = requiresSystemMergeFromRegistry(providerId)
    // → 查询 registry
```

**影响**:
- `isReasoningModel()` 在 `providers/index.ts` 中被调用 **7 次**（行 290, 330, 368, 479, 641, 1025）
- 每次流调用都做字符串操作和缓存查询
- 这些都是"模型固有属性"，在选择模型时就确定了

**问题**: 这些检查的结果只取决于 `modelId` 和 `providerId`，在会话期间不会变化，应该在选择模型时计算一次。

#### 问题 F：Provider 实例每次创建

**位置**: `src/main/providers/index.ts:631-639`, `src/main/ipc/chat/tool-loop.ts:369`

```typescript
// providers/index.ts:638 - 每次流调用都创建新实例
export async function* streamChatResponseWithTools(...) {
  const provider = createProvider(providerId, config)  // 每次都创建！
  const model = wrapWithDevTools(provider.createModel(config.model))
  // ...
}

// tool-loop.ts:369 - 在 while 循环内调用
while (currentTurn < MAX_TOOL_TURNS) {
  stream = streamChatResponseWithTools(...)  // 每轮都创建新 provider！
}
```

**影响**:
- 每条消息至少创建 1 个 Provider 实例
- 如果有 tool 调用，每轮都创建新实例（5 轮 = 5 个实例）
- Provider 创建涉及 HTTP 客户端配置、headers 设置等

**调用链**:
```
streamChatResponseWithTools()
  → createProvider()
    → createProviderInstance()
      → definition.create(config)  // 每次都执行
```

#### 问题 E：切换 Session 时数据重复请求

**数据流分析**:

```
用户点击切换 Session
         │
         ▼
前端: sessionsStore.switchSession(sessionId)
         │
         │ IPC: SWITCH_SESSION
         ▼
后端: store.getSession(sessionId)  ──────────► 读 JSON 文件 #1
         │
         │ 返回完整 session（包含 messages）
         ▼
前端: 收到 response.session
         │
         │ 但没有使用 response.session.messages！
         │ 而是调用 chatStore.loadMessages(sessionId)
         ▼
前端: window.electronAPI.getSession(sessionId)
         │
         │ IPC: GET_SESSION
         ▼
后端: store.getSession(sessionId)  ──────────► 读 JSON 文件 #2（重复！）
```

**代码位置**:
- 前端: `src/renderer/stores/sessions.ts:114-148`
- 后端: `src/main/ipc/sessions.ts:58-76`

### 1.3 数据所有权不清晰

```
┌─────────────────────────────────────────────────────────────────┐
│  谁拥有 Session 数据？                                          │
│                                                                  │
│  sessionsStore                    chatStore                     │
│  ├── sessions[]                   ├── sessionMessages Map       │
│  │   └── 包含 messages            │   └── 也是 messages         │
│  └── currentSessionId             └── activeStreams Map         │
│                                                                  │
│  两个 Store 都持有 messages，但来源相同，独立请求，独立更新     │
└─────────────────────────────────────────────────────────────────┘
```

### 1.4 没有"会话生命周期"概念

```
理想的会话生命周期：

  创建 ──► 激活 ──► 活跃中 ──► 休眠 ──► 关闭/归档
           │         │
           │         └── 内存中保持完整状态，不需要反复读磁盘
           │
           └── 一次性加载所有需要的数据
               (model capabilities, skills, tools...)

当前的"生命周期"：

  创建 ──► ???（没有激活概念）
           │
           └── 每次操作都当作"第一次见面"
               重新读文件、重新检查能力、重新加载 skills
```

---

## 二、根本原因分析

### 2.1 架构模式错配

当前系统是按 **"Web 应用 + REST API"** 的思维模式设计的：

- 前端（Renderer）像浏览器一样，发请求、拿数据、渲染
- 后端（Main Process）像服务器一样，无状态、处理请求、返回结果
- 数据（JSON 文件）像数据库一样，每次操作都查询

但 Electron 桌面应用的特点是：
- **单用户** —— 不需要考虑并发、多租户
- **长连接** —— 进程一直活着，不像 HTTP 请求完就断
- **本地资源** —— 内存便宜，可以缓存很多东西

**Web 的"无状态"是为了水平扩展，桌面应用不需要这个！**

### 2.2 技术债务累积

| 阶段 | 决策 | 后果 |
|------|------|------|
| 早期 | "先让它跑起来" | 功能实现了 |
| 中期 | "加个功能" x N | 到处都在调 `getSession()` |
| 现在 | 性能问题显现 | 需要系统性重构 |

---

## 三、现有的缓存机制

系统中并非完全没有缓存，以下是已实现的缓存：

| 缓存类型 | 位置 | 策略 | 过期时间 |
|--------|------|------|--------|
| **模型列表** | `services/ai/model-registry.ts:50-97` | 内存 Map | ∞ (无期限) |
| **工作空间权限** | `permission/workspace-permissions.ts:33-72` | 内存 Map | ∞ (无期限) |
| **MCP 客户端连接** | `mcp/manager.ts:22-25` | 内存 Map | ∞ (无期限) |

**问题**: 最热的路径（settings, session）恰好没有缓存。

---

## 四、改进方向

### 4.1 目标架构：Session Runtime

引入 **"会话运行时 (Session Runtime)"** 的概念：

```
┌─────────────────────────────────────────────────────────────────┐
│  新架构：有状态的 Main Process                                  │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  SessionRuntimeManager                                   │    │
│  │                                                          │    │
│  │  activeRuntime: SessionRuntime | null                   │    │
│  │                                                          │    │
│  │  ┌───────────────────────────────────────────────────┐  │    │
│  │  │  SessionRuntime (当前活跃会话)                     │  │    │
│  │  │                                                    │  │    │
│  │  │  session: ChatSession      ← 内存中，不反复读     │  │    │
│  │  │  messages: ChatMessage[]   ← 内存中               │  │    │
│  │  │  modelCaps: ModelCaps      ← 激活时解析一次       │  │    │
│  │  │  skills: Skill[]           ← 激活时加载一次       │  │    │
│  │  │  tools: Tool[]             ← 激活时解析一次       │  │    │
│  │  │                                                    │  │    │
│  │  │  // 方法                                          │  │    │
│  │  │  addMessage(msg)           ← 内存操作 + 异步持久化│  │    │
│  │  │  updateMessage(id, ...)    ← 内存操作 + 异步持久化│  │    │
│  │  └───────────────────────────────────────────────────┘  │    │
│  │                                                          │    │
│  │  // 生命周期                                            │    │
│  │  activate(sessionId)  ← 从磁盘加载，构建 Runtime       │    │
│  │  deactivate()         ← 持久化，释放内存               │    │
│  │  suspend()            ← 可选：后台会话的轻量状态       │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

### 4.2 前端 Store 简化

```
┌─────────────────────────────────────────────────────────────────┐
│  当前：两个 Store 重叠管理                                      │
│                                                                  │
│  sessionsStore          chatStore                               │
│  └── sessions[]         └── sessionMessages Map                 │
│      └── messages           └── messages (重复!)               │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│  改进后：清晰的职责分离                                         │
│                                                                  │
│  sessionsStore                chatStore                         │
│  └── sessionMetas[]           └── currentMessages              │
│      └── 只有元数据               └── 当前会话的消息            │
│         (id, name, date)          └── 来自后端的 Runtime        │
│         不含 messages                                           │
│                                                                  │
│  数据流：                                                       │
│  后端 Runtime ──(IPC event)──► chatStore.currentMessages       │
│  单向数据流，没有重复请求                                       │
└─────────────────────────────────────────────────────────────────┘
```

---

## 五、渐进式重构计划

### 阶段 1：快速修复（低风险，高回报）

#### 1.1 Settings 内存缓存

**文件**: `src/main/stores/settings.ts`

```typescript
// 新增内存缓存
let cachedSettings: AppSettings | null = null

export function getSettings(): AppSettings {
  if (cachedSettings) return cachedSettings

  const settings = readJsonFile(getSettingsPath(), defaultSettings)
  cachedSettings = migrateSettings(settings)
  return cachedSettings
}

export function saveSettings(settings: AppSettings): void {
  writeJsonFile(getSettingsPath(), settings)
  cachedSettings = settings  // 更新缓存
}

// 提供显式刷新方法（用于热重载场景）
export function invalidateSettingsCache(): void {
  cachedSettings = null
}
```

**预期收益**: 减少 ~70% 的文件 I/O（特别是消息流处理路径）

#### 1.2 Session 内存缓存

**文件**: `src/main/stores/sessions.ts`

```typescript
// 新增内存缓存
const sessionCache = new Map<string, { session: ChatSession; loadedAt: number }>()

export function getSession(sessionId: string): ChatSession | undefined {
  const cached = sessionCache.get(sessionId)
  if (cached) return cached.session

  const session = readSessionFromDisk(sessionId)
  if (session) {
    sessionCache.set(sessionId, { session, loadedAt: Date.now() })
  }
  return session
}

// 写操作时同步更新缓存
export function updateSession(sessionId: string, updates: Partial<ChatSession>): void {
  const session = getSession(sessionId)
  if (!session) return

  Object.assign(session, updates)
  writeSessionToDisk(sessionId, session)
  // 缓存已经是引用，自动更新
}

// 显式失效（切换会话、删除会话时）
export function invalidateSessionCache(sessionId: string): void {
  sessionCache.delete(sessionId)
}
```

#### 1.3 修复切换 Session 的重复请求

**文件**: `src/renderer/stores/sessions.ts`

```typescript
async function switchSession(sessionId: string) {
  const response = await window.electronAPI.switchSession(sessionId)
  if (response.success && response.session) {
    // ...

    // 直接传递 messages，不需要再请求
    chatStore.setMessagesFromSession(sessionId, response.session.messages || [])

    // 不再需要这个调用
    // await chatStore.loadMessages(sessionId)
  }
}
```

### 阶段 2：会话级上下文（中等复杂度）

#### 2.1 创建 SessionRuntime

**新文件**: `src/main/stores/session-runtime.ts`

```typescript
interface SessionRuntime {
  sessionId: string
  session: ChatSession
  modelCapabilities: {
    supportsImageGen: boolean
    supportsTools: boolean
    maxTokens: number
  }
  enabledSkills: SkillDefinition[]
  enabledTools: Tool[]
}

const activeRuntimes = new Map<string, SessionRuntime>()

export async function activateSession(sessionId: string): Promise<SessionRuntime> {
  const existing = activeRuntimes.get(sessionId)
  if (existing) return existing

  // 一次性加载所有需要的数据
  const session = getSession(sessionId)
  const settings = getSettings()
  const modelCaps = await resolveModelCapabilities(session, settings)
  const skills = loadSkillsForSession(session.workingDirectory)

  const runtime: SessionRuntime = {
    sessionId,
    session,
    modelCapabilities: modelCaps,
    enabledSkills: skills,
    enabledTools: resolveTools(settings)
  }

  activeRuntimes.set(sessionId, runtime)
  return runtime
}

export function deactivateSession(sessionId: string): void {
  activeRuntimes.delete(sessionId)
}

export function getActiveRuntime(sessionId: string): SessionRuntime | undefined {
  return activeRuntimes.get(sessionId)
}
```

#### 2.2 重构 StreamExecutor

**文件**: `src/main/ipc/chat/stream-executor.ts`

```typescript
// 改进后：使用 Runtime
export async function executeMessageStream(
  params: StreamExecutionParams,
  abortController?: AbortController
): Promise<StreamExecutionResult> {
  const { sessionId } = params

  // 获取或创建 Runtime（不再每次读文件）
  const runtime = await activateSession(sessionId)

  // 直接使用缓存的能力信息
  if (runtime.modelCapabilities.supportsImageGen) {
    return processImageGeneration(params, runtime)
  }

  return executeTextStream(params, runtime)
}
```

### 阶段 3：架构优化（长期）

- [ ] 将 `StreamContext` 升级为从 `SessionRuntime` 派生
- [ ] 统一状态变更的事件流
- [ ] 引入状态机管理会话生命周期
- [ ] 前端 Store 职责重新划分

---

## 六、优先级矩阵

| 优先级 | 任务 | 影响范围 | 改动复杂度 | 预期收益 |
|--------|------|----------|------------|----------|
| 🔴 P0 | Settings 内存缓存 | 全局 | 低 | 立竿见影 |
| 🔴 P0 | Session 内存缓存 | 消息处理 | 中 | 立竿见影 |
| 🟡 P1 | 修复切换 Session 重复请求 | 切换流程 | 低 | 减少 50% IPC |
| 🟡 P1 | Skills 缓存 | 消息处理 | 中 | 明显改善 |
| 🟡 P1 | Model Capabilities 缓存 | 消息处理 | 低 | 小幅改善 |
| 🟡 P1 | Provider 实例缓存 | 消息处理 | 中 | 减少对象创建 |
| 🟢 P2 | 建立 SessionRuntime | 架构层面 | 高 | 长期收益 |
| 🟢 P2 | 前端 Store 重构 | 前端架构 | 高 | 代码清晰度 |

---

## 七、相关文件索引

### Main Process

| 文件 | 关键行号 | 说明 |
|------|--------|------|
| `src/main/stores/settings.ts` | 250-257 | Settings 读写 |
| `src/main/stores/settings.ts` | 96-248 | Settings 迁移逻辑 |
| `src/main/stores/sessions.ts` | 169-181 | getSession 实现 |
| `src/main/stores/sessions.ts` | 184-231 | createSession 实现 |
| `src/main/ipc/sessions.ts` | 58-76 | SWITCH_SESSION handler |
| `src/main/ipc/chat.ts` | 87-400 | 消息处理主逻辑 |
| `src/main/ipc/chat/stream-executor.ts` | 59-149 | 流执行入口 |
| `src/main/ipc/chat/tool-loop.ts` | 614-630 | Skills 加载位置 |
| `src/main/ipc/skills.ts` | 247-264 | getSkillsForSession |
| `src/main/skills/loader.ts` | 463-500 | loadAllSkills |

### Renderer Process

| 文件 | 关键行号 | 说明 |
|------|--------|------|
| `src/renderer/stores/sessions.ts` | 114-148 | switchSession |
| `src/renderer/stores/chat.ts` | 818-850 | loadMessages |

---

## 八、验证方法

### 添加性能监控日志

在重构前后，可以添加以下日志来量化改进：

```typescript
// src/main/stores/sessions.ts
export function getSession(sessionId: string): ChatSession | undefined {
  const start = performance.now()
  // ... 实现 ...
  console.log(`[Perf] getSession(${sessionId}) took ${performance.now() - start}ms`)
  return session
}
```

### 关键指标

- 单条消息处理的文件 I/O 次数
- 切换会话的总耗时
- 内存使用量变化

---

## 九、风险评估

| 风险 | 可能性 | 影响 | 缓解措施 |
|------|--------|------|----------|
| 缓存与磁盘不一致 | 中 | 高 | 明确缓存失效时机 |
| 内存占用增加 | 低 | 低 | 限制缓存大小/LRU |
| 多窗口数据同步 | 低 | 中 | 事件广播机制 |

---

## 十、参考资料

- 现有架构文档: `docs/ARCHITECTURE.md`
- 存储系统文档: `docs/storage.md`
- Main Process Stores: `docs/main-stores.md`
- Renderer Stores: `docs/renderer-stores.md`
