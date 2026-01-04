# Renderer Stores (前端状态管理)

## 概述

`src/renderer/stores/` 目录包含所有 Pinia stores，负责前端状态管理。这些 stores 管理 UI 状态、与后端通信、处理流式数据等。

## 设计理念

1. **Per-Session 状态**: 聊天相关状态按 sessionId 索引
2. **响应式**: 充分利用 Vue 3 的响应式系统
3. **IPC 集成**: 通过 IPC Hub 与主进程通信
4. **关注分离**: 每个 store 专注于一个功能域

## 目录结构

```
src/renderer/stores/
├── chat.ts           # 聊天状态（核心）
├── sessions.ts       # 会话管理
├── settings.ts       # 应用设置
├── agents.ts         # Agent 管理
├── agent-memory.ts   # Agent 记忆
├── user-profile.ts   # 用户画像
├── workspaces.ts     # 工作区
├── media.ts          # 媒体预览
└── ui-messages.ts    # UIMessage 格式（AI SDK 5.x）
```

## Store 详解

### chat.ts - 聊天 Store

最核心的 store，管理所有会话的聊天状态：

```typescript
export const useChatStore = defineStore('chat', () => {
  // Per-session 状态 Maps
  const sessionMessages = ref<Map<string, ChatMessage[]>>(new Map())
  const sessionLoading = ref<Map<string, boolean>>(new Map())
  const sessionGenerating = ref<Map<string, boolean>>(new Map())
  const sessionError = ref<Map<string, string | null>>(new Map())
  const sessionUsageMap = ref<Map<string, TokenUsage>>(new Map())
  const activeStreams = ref<Map<string, string>>(new Map())

  // Getters
  function getSessionState(sessionId: string) { ... }
  function isSessionGenerating(sessionId: string): boolean { ... }

  // Event Handlers (由 IPC Hub 调用)
  function handleStreamChunk(chunk: StreamChunk) { ... }
  function handleStreamComplete(data: StreamCompleteData) { ... }
  function handleStreamError(data: StreamErrorData) { ... }
  function handleStepAdded(data: StepData) { ... }

  // Actions
  async function sendMessage(sessionId: string, content: string, attachments?: MessageAttachment[]) { ... }
  async function editAndResend(sessionId: string, messageId: string, newContent: string) { ... }
  async function stopGeneration(sessionId?: string) { ... }

  return { ... }
})
```

**关键特性:**

- 使用 `Map` 存储 per-session 状态
- 通过 `triggerRef` 确保响应式更新
- 事件处理器由全局 IPC Hub 调用

### sessions.ts - 会话 Store

管理所有会话的元数据：

```typescript
export const useSessionsStore = defineStore('sessions', () => {
  const sessions = ref<ChatSession[]>([])
  const currentSessionId = ref<string>('')
  const isLoading = ref(false)

  // Computed
  const currentSession = computed(() =>
    sessions.value.find(s => s.id === currentSessionId.value)
  )
  const filteredSessions = computed(() => {
    // 按工作区过滤，排除已归档
  })
  const archivedSessions = computed(() => { ... })

  // Actions
  async function loadSessions() { ... }
  async function createSession(name: string, agentId?: string) { ... }
  async function switchSession(sessionId: string) { ... }
  async function deleteSession(sessionId: string) { ... }
  async function archiveSession(sessionId: string) { ... }
  async function createBranch(parentSessionId: string, branchFromMessageId: string) { ... }

  return { ... }
})
```

**关键特性:**

- 按工作区过滤会话
- 支持归档/恢复
- 支持会话分支

### settings.ts - 设置 Store

管理应用设置：

```typescript
export const useSettingsStore = defineStore('settings', () => {
  // 状态
  const settings = ref<AppSettings | null>(null)
  const isLoading = ref(false)
  const providerConfigs = ref<Map<string, ProviderConfig>>(new Map())
  const cachedModels = ref<Map<string, OpenRouterModel[]>>(new Map())

  // Computed
  const currentProvider = computed(() => settings.value?.ai.provider)
  const currentModel = computed(() => settings.value?.ai.model)
  const availableModels = computed(() => { ... })

  // Actions
  async function loadSettings() { ... }
  async function saveSettings() { ... }
  async function updateAIProvider(provider: AIProviderId) { ... }
  async function updateModel(model: string, provider?: AIProviderId) { ... }
  async function fetchModels(providerId: string) { ... }

  return { ... }
})
```

**关键特性:**

- 懒加载模型列表
- 缓存提供商配置
- 响应式同步全局设置

### agents.ts - Agent Store

管理自定义 Agent：

```typescript
export const useAgentsStore = defineStore('agents', () => {
  const agents = ref<Agent[]>([])
  const isLoading = ref(false)

  // Computed
  const pinnedAgents = computed(() =>
    agents.value.filter(a => a.isPinned)
  )
  const defaultAgent = computed(() =>
    agents.value.find(a => a.id === 'default')
  )

  // Actions
  async function loadAgents() { ... }
  async function createAgent(agent: Omit<Agent, 'id' | 'createdAt' | 'updatedAt'>) { ... }
  async function updateAgent(id: string, updates: Partial<Agent>) { ... }
  async function deleteAgent(id: string) { ... }
  async function uploadAvatar(id: string, file: File) { ... }

  return { ... }
})
```

### workspaces.ts - 工作区 Store

管理工作区（项目隔离）：

```typescript
export const useWorkspacesStore = defineStore('workspaces', () => {
  const workspaces = ref<Workspace[]>([])
  const currentWorkspaceId = ref<string | null>(null)

  // Computed
  const currentWorkspace = computed(() =>
    workspaces.value.find(w => w.id === currentWorkspaceId.value)
  )

  // Actions
  async function loadWorkspaces() { ... }
  async function createWorkspace(name: string, description?: string) { ... }
  async function switchWorkspace(workspaceId: string | null) { ... }
  async function deleteWorkspace(workspaceId: string) { ... }

  return { ... }
})
```

### agent-memory.ts - Agent 记忆 Store

管理 Agent 与用户的关系和记忆：

```typescript
export const useAgentMemoryStore = defineStore('agent-memory', () => {
  const relationships = ref<Map<string, AgentUserRelationship>>(new Map())
  const isLoading = ref(false)

  // Actions
  async function loadRelationship(agentId: string) { ... }
  async function addMemory(agentId: string, memory: Omit<AgentMemory, 'id'>) { ... }
  async function deleteMemory(memoryId: string) { ... }
  async function updateRelationship(agentId: string, updates: RelationshipUpdates) { ... }

  return { ... }
})
```

### user-profile.ts - 用户画像 Store

管理用户的全局画像：

```typescript
export const useUserProfileStore = defineStore('user-profile', () => {
  const profile = ref<UserProfile | null>(null)
  const isLoading = ref(false)

  // Actions
  async function loadProfile() { ... }
  async function addFact(content: string, category: UserFactCategory) { ... }
  async function updateFact(factId: string, updates: Partial<UserFact>) { ... }
  async function deleteFact(factId: string) { ... }

  return { ... }
})
```

## IPC Hub 集成

`src/renderer/services/ipc-hub.ts` 负责全局 IPC 事件监听：

```typescript
// ipc-hub.ts
export function initializeIPCHub() {
  const chatStore = useChatStore()

  // 监听流式事件
  window.electronAPI.onStreamChunk((chunk) => {
    chatStore.handleStreamChunk(chunk)
  })

  window.electronAPI.onStreamComplete((data) => {
    chatStore.handleStreamComplete(data)
  })

  window.electronAPI.onStreamError((data) => {
    chatStore.handleStreamError(data)
  })

  // 监听步骤事件
  window.electronAPI.onStepAdded((data) => {
    chatStore.handleStepAdded(data)
  })

  // ... 更多事件监听
}
```

## 使用示例

### 在组件中使用

```vue
<script setup lang="ts">
import { useChatStore } from '@/stores/chat'
import { useSessionsStore } from '@/stores/sessions'

const chatStore = useChatStore()
const sessionsStore = useSessionsStore()

// 获取当前会话状态
const { messages, isGenerating, error } = chatStore.getSessionState(
  sessionsStore.currentSessionId
)

// 发送消息
async function handleSend(content: string) {
  await chatStore.sendMessage(sessionsStore.currentSessionId, content)
}

// 停止生成
function handleStop() {
  chatStore.stopGeneration(sessionsStore.currentSessionId)
}
</script>
```

### 在 Composable 中使用

```typescript
// composables/useChatSession.ts
export function useChatSession(sessionId: ComputedRef<string>) {
  const chatStore = useChatStore()

  const state = computed(() => chatStore.getSessionState(sessionId.value))

  return {
    messages: computed(() => state.value.messages.value),
    isGenerating: computed(() => state.value.isGenerating.value),
    error: computed(() => state.value.error.value),
    sendMessage: (content: string) => chatStore.sendMessage(sessionId.value, content),
    stopGeneration: () => chatStore.stopGeneration(sessionId.value),
  }
}
```

## 响应式注意事项

### triggerRef 使用

当修改 Map 内部数据时，需要手动触发响应式：

```typescript
// 修改 Map 后触发更新
sessionMessages.value.set(sessionId, newMessages)
triggerRef(sessionMessages)
```

### 深度响应式

使用展开运算符创建新引用触发更新：

```typescript
// 更新消息列表
const messages = getSessionMessagesRef(sessionId)
messages.push(newMessage)
setSessionMessages(sessionId, [...messages])  // 创建新数组
```

## 依赖关系

```
renderer/stores/
    ├── chat.ts
    │   └── 被 → sessions.ts 调用 (loadMessages)
    ├── sessions.ts
    │   ├── 依赖 → chat.ts (loadMessages)
    │   ├── 依赖 → workspaces.ts (过滤)
    │   └── 依赖 → settings.ts (模型同步)
    ├── settings.ts
    │   └── 被 → 多个 store 依赖
    ├── workspaces.ts
    │   └── 被 → sessions.ts 依赖
    └── agents.ts / user-profile.ts / agent-memory.ts
        └── 相对独立
```

## 相关文档

- [整体架构](./ARCHITECTURE.md)
- [IPC 类型定义](./ipc-types.md)
- [Chat 架构](./architecture-chat.md)
