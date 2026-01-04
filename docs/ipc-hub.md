# IPC Hub 文档

## 概述

IPC Hub 是渲染进程中的全局 IPC 事件监听器中心。它在应用启动时注册所有 IPC 监听器，确保：

1. **无竞态条件**：监听器在任何 IPC 调用之前注册
2. **单一状态源**：所有事件路由到中央 Store
3. **零清理负担**：无需每次发送消息时设置/清理监听器

## 文件位置

```
src/renderer/services/ipc-hub.ts
```

## 设计动机

### 问题：传统方式的监听器管理

```typescript
// ❌ 传统方式：每次发送消息都要设置监听器
async function sendMessage() {
  // 设置监听器
  window.electronAPI.onStreamChunk((chunk) => handleChunk(chunk))
  window.electronAPI.onStreamComplete((data) => handleComplete(data))

  // 发送消息
  await window.electronAPI.sendMessageStream(...)

  // 需要手动清理监听器...
}
```

**问题**：
- 监听器可能在事件到达前未注册（竞态条件）
- 多次调用会注册多个监听器（内存泄漏）
- 需要手动管理监听器生命周期

### 解决方案：全局 IPC Hub

```typescript
// ✅ IPC Hub 方式：应用启动时一次性注册
function initializeIPCHub() {
  const chatStore = useChatStore()

  window.electronAPI.onStreamChunk((chunk) => {
    chatStore.handleStreamChunk(chunk)
  })

  window.electronAPI.onStreamComplete((data) => {
    chatStore.handleStreamComplete(data)
  })
  // ...
}
```

## 实现

```typescript
// src/renderer/services/ipc-hub.ts

import { useChatStore } from '@/stores/chat'

let initialized = false

export function initializeIPCHub() {
  if (initialized) {
    console.log('[IPC Hub] Already initialized, skipping')
    return
  }
  initialized = true

  const chatStore = useChatStore()

  // 流式响应块
  window.electronAPI.onStreamChunk((chunk) => {
    chatStore.handleStreamChunk(chunk)
  })

  // 流完成（包含 usage 数据）
  window.electronAPI.onStreamComplete((data) => {
    chatStore.handleStreamComplete(data)
  })

  // 流错误
  window.electronAPI.onStreamError((data) => {
    chatStore.handleStreamError(data)
  })

  // Step 事件（工具调用步骤）
  window.electronAPI.onStepAdded((data) => {
    chatStore.handleStepAdded(data)
  })

  window.electronAPI.onStepUpdated((data) => {
    chatStore.handleStepUpdated(data)
  })

  // Skill 激活
  window.electronAPI.onSkillActivated((data) => {
    chatStore.handleSkillActivated(data)
  })

  console.log('[IPC Hub] All listeners registered')
}
```

## 初始化时机

在 `src/renderer/main.ts` 中，Pinia 初始化后立即调用：

```typescript
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { initializeIPCHub } from './services/ipc-hub'
import App from './App.vue'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)

// Initialize IPC Hub after Pinia is set up, before component mounts
initializeIPCHub()

app.mount('#app')
```

**时序**：
```
Pinia 创建 → IPC Hub 初始化 → 组件挂载 → 用户交互
```

## 事件流

### 消息发送流程

```
┌─────────────────────────────────────────────────────────────────┐
│                      Renderer Process                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Component                Chat Store              IPC Hub        │
│      │                        │                      │           │
│      │  sendMessage()         │                      │           │
│      │───────────────────────>│                      │           │
│      │                        │                      │           │
│      │                        │ electronAPI          │           │
│      │                        │ .sendMessageStream() │           │
│      │                        │─────────────────────────────────>│
│      │                        │                      │    IPC    │
└──────┼────────────────────────┼──────────────────────┼───────────┘
       │                        │                      │
       │                        │                      │
┌──────┼────────────────────────┼──────────────────────┼───────────┐
│      │                        │                      │           │
│      │               Main Process                    │           │
│      │                        │                      │           │
│      │               IPC Handler                     │           │
│      │                   │                           │           │
│      │                   │  stream chunks           │           │
│      │                   │ ─────────────────────────>│           │
│      │                   │                           │           │
└──────┼───────────────────┼───────────────────────────┼───────────┘
       │                   │                           │
       │                   │                           │
┌──────┼───────────────────┼───────────────────────────┼───────────┐
│      │                        │                      │           │
│      │                        │  handleStreamChunk() │           │
│      │                        │<─────────────────────│           │
│      │                        │                      │           │
│      │  UI Update (reactive)  │                      │           │
│      │<───────────────────────│                      │           │
│      │                        │                      │           │
└──────────────────────────────────────────────────────────────────┘
```

### 事件类型

| 事件 | 方向 | 处理器 | 用途 |
|------|------|--------|------|
| `stream-chunk` | Main → Renderer | `handleStreamChunk` | 流式文本块 |
| `stream-complete` | Main → Renderer | `handleStreamComplete` | 流完成 + usage |
| `stream-error` | Main → Renderer | `handleStreamError` | 流错误 |
| `step-added` | Main → Renderer | `handleStepAdded` | 新增工具调用步骤 |
| `step-updated` | Main → Renderer | `handleStepUpdated` | 步骤状态更新 |
| `skill-activated` | Main → Renderer | `handleSkillActivated` | Skill 被激活 |

## Chat Store 事件处理器

IPC Hub 将事件委托给 `chatStore` 的处理器：

```typescript
// src/renderer/stores/chat.ts

export const useChatStore = defineStore('chat', () => {
  // ... 状态定义 ...

  // ============ Event Handlers (Called by IPC Hub) ============

  function handleStreamChunk(chunk: StreamChunk) {
    const { sessionId, messageId, content, reasoning } = chunk
    const state = sessionStates.get(sessionId)
    if (!state) return

    // 更新消息内容
    const message = state.messages.value.find(m => m.id === messageId)
    if (message) {
      message.content += content
      if (reasoning) {
        message.reasoning = (message.reasoning || '') + reasoning
      }
    }
  }

  function handleStreamComplete(data: StreamComplete) {
    const { sessionId, messageId, usage } = data
    const state = sessionStates.get(sessionId)
    if (!state) return

    state.isGenerating.value = false

    // 更新 usage
    const message = state.messages.value.find(m => m.id === messageId)
    if (message) {
      message.usage = usage
      message.isStreaming = false
    }
  }

  function handleStreamError(data: StreamError) {
    const { sessionId, error, errorDetails } = data
    const state = sessionStates.get(sessionId)
    if (!state) return

    state.isGenerating.value = false
    state.error.value = error
    state.errorDetails.value = errorDetails
  }

  // ... 更多处理器 ...

  return {
    // ... 其他导出 ...

    // Event handlers (called by IPC Hub)
    handleStreamChunk,
    handleStreamComplete,
    handleStreamError,
    handleStepAdded,
    handleStepUpdated,
    handleSkillActivated,
  }
})
```

## 设计原则

### 1. 单例初始化

```typescript
let initialized = false

export function initializeIPCHub() {
  if (initialized) {
    console.log('[IPC Hub] Already initialized, skipping')
    return
  }
  initialized = true
  // ...
}
```

确保监听器只注册一次。

### 2. Store 作为中央状态

所有事件都路由到 Pinia Store，而非直接操作组件状态：
- 状态变更可预测
- 支持时间旅行调试
- 多组件共享状态

### 3. 事件处理器命名约定

```typescript
// 主进程发送的事件：onXxx
window.electronAPI.onStreamChunk(...)

// Store 中的处理器：handleXxx
chatStore.handleStreamChunk(...)
```

## 扩展 IPC Hub

添加新的 IPC 事件监听：

```typescript
// 1. 在 preload/index.ts 中暴露新的监听器
contextBridge.exposeInMainWorld('electronAPI', {
  // ...
  onNewEvent: (callback) => ipcRenderer.on('new-event', (_, data) => callback(data)),
})

// 2. 在 IPC Hub 中注册监听
export function initializeIPCHub() {
  // ...
  window.electronAPI.onNewEvent((data) => {
    someStore.handleNewEvent(data)
  })
}

// 3. 在 Store 中实现处理器
function handleNewEvent(data: NewEventData) {
  // 处理逻辑
}
```

## 相关文档

- [IPC Types](./ipc-types.md) - IPC 类型定义
- [IPC Handlers](./ipc-handlers.md) - 主进程 IPC 处理器
- [Renderer Stores](./renderer-stores.md) - Pinia Store 详解
- [Chat 架构](./architecture-chat.md) - 聊天系统架构
