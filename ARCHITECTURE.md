All 10 store files have been read. Now let me produce the analysis.

## Pinia Store 分析

### 1. `useChatStore` (chat.ts)

**职责：** 核心聊天状态管理。按 `sessionId` 索引所有聊天相关状态（消息、加载/生成中、错误、token 用量、活跃流）。处理来自 IPC Hub 的流式事件（chunk、complete、error、step、skill），管理消息的发送、编辑重发、重新生成、停止生成等操作。同时管理 UI 展开/折叠状态（Agent 面板、Tool Call 展开）。

**依赖：**
- → `useSessionsStore`（动态 import，流完成时更新 session name）
- → `window.electronAPI`（IPC 通信）

---

### 2. `useSessionsStore` (sessions.ts)

**职责：** 会话列表管理。负责会话的 CRUD（创建、删除、归档、恢复、永久删除、重命名）、会话切换（两步加载：先 activate 再 load messages）、分支创建、置顶、工作目录更新。维护 `currentSessionId` 和按 workspace 过滤的 session 列表。

**依赖：**
- → `useChatStore`（切换会话时设置消息、加载 usage）
- → `useWorkspacesStore`（创建/过滤会话时获取当前 workspaceId）
- → `useSettingsStore`（切换会话时同步 provider/model 配置）
- → `window.electronAPI`

---

### 3. `useSettingsStore` (settings.ts)

**职责：** 全局设置管理。包括 AI provider 配置（API key、model、custom providers）、主题（dark/light/system 切换、颜色主题、base 主题）、发送快捷键、消息密度等。统一管理模型列表（缓存、按需获取、embedding 过滤）。

**依赖：**
- → `useThemeStore`（动态 import，主题变更时调用 `reapplyTheme()`）
- → `window.electronAPI`

---

### 4. `useThemeStore` (themes.ts)

**职责：** JSON 主题系统管理。维护 dark/light 两套主题 ID，管理主题的加载、切换、预览（hover preview → confirm/cancel）、CSS 变量注入、主题缓存。

**依赖：**
- → `useSettingsStore`（读取 `effectiveTheme` 判断 dark/light 模式，保存主题 ID 到 settings）
- → `window.electronAPI`

---

### 5. `useWorkspacesStore` (workspaces.ts)

**职责：** 工作区管理。CRUD 操作（创建、更新、删除、切换），头像上传。维护 `currentWorkspaceId`，提供 `currentWorkspace` 计算属性。

**依赖：**
- → `window.electronAPI`（**无其他 store 依赖，独立**）

---

### 6. `useUIMessagesStore` (ui-messages.ts)

**职责：** AI SDK 5.x `UIMessage` 格式的消息状态管理。作为从旧 `ChatMessage` 格式到新格式的迁移路径。支持 part-level 操作（text、reasoning、tool 等 part 的 upsert/update）、流式处理、session 级别的流状态跟踪。

**依赖：**
- → `window.electronAPI`（**无其他 store 依赖，独立**）
- → `shared/message-converters.js`（格式转换工具函数）

---

### 7. `useCustomAgentsStore` (custom-agents.ts)

**职责：** 自定义 Agent 管理。CRUD 操作、Agent 内自定义 Tool 的增删改、Agent 置顶（pin/unpin）、按来源（user/project）分类。

**依赖：**
- → `useWorkspacesStore`（获取当前工作目录）
- → `window.electronAPI`

---

### 8. `useMediaStore` (media.ts)

**职责：** 生成媒体（图片）管理。加载、保存、删除媒体文件，提供 `media://` 协议 URL 用于图片显示。

**依赖：**
- → `window.electronAPI`（**无其他 store 依赖，独立**）

---

### 9. `useMemoryManagerStore` (memory-manager.ts)

**职责：** 记忆文件管理 UI。提供记忆文件的 CRUD、标签管理（重命名/删除）、搜索/过滤、导入导出、索引重建、统计信息。

**依赖：**
- → `window.electronAPI`（**无其他 store 依赖，独立**）

---

### 10. `useRightSidebarStore` (right-sidebar.ts)

**职责：** 右侧边栏 UI 状态管理。包含三个 Tab（files、git、documents）的状态：文件树（按工作目录缓存、展开/折叠）、文件预览（代码预览、Git diff 预览）、提取文档（Mermaid 等）。管理面板宽度、侧边栏宽度并持久化到 localStorage。

**依赖：**
- → `useSessionsStore`（获取 `currentSession` 的 `workingDirectory` 和 `currentSessionId`）
- → `window.electronAPI`

---

## 依赖关系图

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Store 依赖关系图                              │
│                                                                     │
│   ┌──────────────────┐                                              │
│   │   workspaces     │  ← 独立，无 store 依赖                       │
│   │  (工作区管理)     │                                              │
│   └──────┬───────────┘                                              │
│          │                                                          │
│          │ 被依赖                                                    │
│          ▼                                                          │
│   ┌──────────────────┐         ┌──────────────────┐                 │
│   │  sessions        │────────▶│   chat            │                │
│   │ (会话管理)        │         │ (聊天核心)         │                │
│   └──────┬───────────┘         └────────┬─────────┘                 │
│          │                              │                           │
│          │ 依赖 settings                │ 依赖 sessions             │
│          ▼                              │ (动态 import)             │
│   ┌──────────────────┐                  │                           │
│   │  settings        │◀─────────────────┘                           │
│   │ (全局设置)        │                                              │
│   └──────┬───────────┘                                              │
│          │                                                          │
│          │ 双向依赖（动态 import）                                    │
│          ▼                                                          │
│   ┌──────────────────┐                                              │
│   │   themes         │                                              │
│   │  (主题管理)       │                                              │
│   └──────────────────┘                                              │
│                                                                     │
│   ┌──────────────────┐                                              │
│   │ custom-agents    │──────▶ workspaces                            │
│   │(自定义Agent管理)  │                                              │
│   └──────────────────┘                                              │
│                                                                     │
│   ┌──────────────────┐                                              │
│   │ right-sidebar    │──────▶ sessions                              │
│   │(右侧边栏/文件树)  │                                              │
│   └──────────────────┘                                              │
│                                                                     │
│   ┌──────────────────┐                                              │
│   │  ui-messages     │  ← 独立，无 store 依赖                       │
│   │ (UIMessage格式)   │                                              │
│   └──────────────────┘                                              │
│                                                                     │
│   ┌──────────────────┐                                              │
│   │    media         │  ← 独立，无 store 依赖                       │
│   │  (媒体管理)       │                                              │
│   └──────────────────┘                                              │
│                                                                     │
│   ┌──────────────────┐                                              │
│   │ memory-manager   │  ← 独立，无 store 依赖                       │
│   │ (记忆文件管理)     │                                              │
│   └──────────────────┘                                              │
└─────────────────────────────────────────────────────────────────────┘
```

### 精确依赖边汇总

| 源 Store | 目标 Store | 调用方式 | 用途 |
|---------|-----------|---------|------|
| `sessions` → `chat` | 直接 import | 切换会话时设置消息、加载 usage |
| `sessions` → `workspaces` | 直接 import | 获取 currentWorkspaceId 过滤/创建会话 |
| `sessions` → `settings` | 直接 import | 切换会话时同步 provider/model |
| `chat` → `sessions` | **动态 import** | 流完成/发送成功时更新 session name |
| `settings` → `themes` | **动态 import** | 主题变更时调用 reapplyTheme |
| `themes` → `settings` | 直接 import | 读取 effectiveTheme、保存主题设置 |
| `custom-agents` → `workspaces` | 直接 import | 获取当前工作目录 |
| `right-sidebar` → `sessions` | 直接 import | 获取 workingDirectory 和 sessionId |

### 关键发现

1. **核心枢纽**：`sessions` 是依赖最多的 store（依赖 chat + workspaces + settings），也是被依赖最多的之一。
2. **循环依赖避免**：`chat ↔ sessions` 和 `settings ↔ themes` 使用**动态 import** (`await import(...)`) 打破循环，避免初始化死锁。
3. **独立 store**（4 个）：`workspaces`、`ui-messages`、`media`、`memory-manager` 不依赖任何其他 store，可以独立测试。
4. **ui-messages vs chat**：两套消息系统并存——`chat` 是当前主力（ChatMessage 格式），`ui-messages` 是为 AI SDK 5.x UIMessage 格式准备的迁移层，目前无 store 间依赖。
## 消息发送完整链路分析

以下是从代码中追踪到的完整链路，覆盖 **用户输入 → IPC 桥接 → Main 进程处理 → AI 调用 → 流式响应 → UI 渲染** 全过程。

---

### 第一阶段：用户输入 & 发送

| 步骤 | 文件 | 函数 | 说明 |
|------|------|------|------|
| 1 | `src/renderer/components/chat/InputBox.vue` | `sendMessage()` (L397) | 校验输入，处理 `/files` 等命令，组装消息内容和附件，`emit('sendMessage', fullMessage, attachments)` |
| 2 | `src/renderer/components/chat/ChatWindow.vue` | `handleSendMessage()` (L187) | 监听 `@send-message` 事件，委托给 composable 的 `chatSendMessage()` |
| 3 | `src/renderer/composables/useChatSession.ts` | `sendMessage()` (L57) | 简单封装，调用 `chatStore.sendMessage(sid, content, attachments)` |
| 4 | `src/renderer/stores/chat.ts` | `sendMessage()` (L957) | 创建用户消息对象，加入会话消息列表，设置 loading 状态，调用 `window.electronAPI.sendMessageStream()` (L984) |

---

### 第二阶段：IPC 桥接层

| 步骤 | 文件 | 函数/通道 | 说明 |
|------|------|-----------|------|
| 5 | `src/preload/index.ts` | `sendMessageStream()` (L13) | 调用 `ipcRenderer.invoke(IPC_CHANNELS.SEND_MESSAGE_STREAM, { sessionId, message, attachments })` |
| 6 | `src/shared/ipc/channels.ts` | `SEND_MESSAGE_STREAM = 'chat:send-message-stream'` | IPC 通道常量定义 |

**请求类型定义** (`src/shared/ipc/chat.ts`):
```typescript
interface SendMessageRequest {
  sessionId: string
  message: string
  attachments?: MessageAttachment[]
}
```

---

### 第三阶段：Main 进程处理

| 步骤 | 文件 | 函数 | 说明 |
|------|------|------|------|
| 7 | `src/main/ipc/chat.ts` | `registerChatHandlers()` (L87) | 注册 `ipcMain.handle('chat:send-message-stream', ...)` |
| 8 | `src/main/ipc/chat.ts` | `handleSendMessageStream()` (L556) | 创建用户消息并存储，校验 Provider/API Key，创建空 assistant 消息（`isStreaming: true`），**立即返回** `{ success, messageId, sessionName }`，通过 `process.nextTick()` (L641) 启动后台流式处理 |
| 9 | `src/main/ipc/chat/stream-executor.ts` | `executeMessageStream()` (L59) | 判断消息类型（文本/图片生成），路由到对应处理器 |
| 10 | `src/main/ipc/chat/tool-loop.ts` | `executeStreamGeneration()` (L602) | 加载会话、Agent、Skills，初始化工具，构建系统提示词和历史消息，创建 `StreamProcessor` 和 `IPCEmitter`，调用 `runStream()` |

---

### 第四阶段：AI 流式调用 & 工具循环

| 步骤 | 文件 | 函数 | 说明 |
|------|------|------|------|
| 11 | `src/main/ipc/chat/tool-loop.ts` | `runStream()` (L285) | 核心循环，最多 100 轮 (`MAX_TOOL_TURNS`)。每轮检查上下文压缩，调用 AI Provider，处理流式 chunk，执行工具调用 |
| 12 | `src/main/providers/index.ts` | `streamChatResponseWithTools()` (L631) | 创建 Provider 实例，将工具定义转 Zod Schema，调用 Vercel AI SDK `streamText()`，yield 各类 chunk |

**AI SDK 流式事件类型:**
```
text-delta       → 文本增量
reasoning-delta  → 推理内容
tool-call        → 工具调用
tool-input-start → 工具参数开始流式
tool-input-delta → 工具参数增量
finish           → 完成（含 usage）
```

**工具执行流程 (在 `runStream` 循环内):**
```
tool-call chunk → handleToolCallChunk() → executeToolAndUpdate()
  → ToolRegistry.execute() → 权限检查 → 工具执行
  → 结果写入对话历史 → 继续下一轮循环
```

---

### 第五阶段：流式响应回传

| 步骤 | 文件 | 函数 | IPC 通道 | 说明 |
|------|------|------|----------|------|
| 13 | `src/main/ipc/chat/ipc-emitter.ts` | `createIPCEmitter()` (L105) | — | 创建 IPC 事件发射器，封装所有 `sender.send()` 调用 |
| — | — | `sendTextChunk(text)` | `chat:stream-chunk` | `{ type: 'text', content, messageId, sessionId }` |
| — | — | `sendReasoningChunk(reasoning)` | `chat:stream-chunk` | `{ type: 'reasoning', reasoning, ... }` |
| — | — | `sendToolCall(toolCall)` | `chat:stream-chunk` | `{ type: 'tool_call', toolCall, ... }` |
| — | — | `sendToolResult(toolCall)` | `chat:stream-chunk` | `{ type: 'tool_result', toolCall, ... }` |
| — | — | `sendToolInputDelta(...)` | `chat:stream-chunk` | `{ type: 'tool_input_delta', argsTextDelta, ... }` |
| — | — | `sendStepAdded(step)` | `chat:step-added` | 工具执行步骤开始 |
| — | — | `sendStepUpdated(...)` | `chat:step-updated` | 工具执行步骤完成/更新 |
| — | — | `sendStreamComplete(data)` | `chat:stream-complete` | 流完成，含累计 token usage |
| — | — | `sendStreamError(data)` | `chat:stream-error` | 错误事件 |

---

### 第六阶段：渲染进程接收 & UI 更新

| 步骤 | 文件 | 函数 | 说明 |
|------|------|------|------|
| 14 | `src/preload/index.ts` | `onStreamChunk()` (L24) | 监听 `ipcRenderer.on(STREAM_CHUNK, ...)` |
| 15 | `src/renderer/services/ipc-hub.ts` | `initializeIPCHub()` (L14) | 应用启动时注册全局 IPC 监听器，将事件分发到 chatStore |
| 16 | `src/renderer/stores/chat.ts` | `handleStreamChunk()` (L284) | 根据 chunk 类型更新消息状态：追加文本到 `message.content`，更新 `contentParts[]`，管理 `toolCalls[]`，触发 Vue 响应式更新 |
| 17 | `src/renderer/stores/chat.ts` | `handleStreamComplete()` (L528) | 标记 `isStreaming = false`，更新 token usage，清除 loading 状态 |
| 18 | `src/renderer/stores/chat.ts` | `handleStepAdded()` (L678) | 添加工具执行步骤到消息 |

---

### 第七阶段：Vue 组件渲染

| 层级 | 文件 | 说明 |
|------|------|------|
| `ChatWindow.vue` | `src/renderer/components/chat/ChatWindow.vue` | 使用 `useChatSession()` composable 获取响应式消息列表 |
| → `MessageList.vue` | `src/renderer/components/chat/MessageList.vue` | `<TransitionGroup>` 遍历消息 |
| → → `MessageItem.vue` | `src/renderer/components/chat/MessageItem.vue` | 单条消息容器 |
| → → → `MessageBubble.vue` | `src/renderer/components/chat/message/MessageBubble.vue` | 核心渲染：遍历 `contentParts[]` |

**`contentParts` 类型** (`src/shared/ipc/chat.ts`):
```typescript
type ContentPart =
  | { type: 'text'; content: string }          // Markdown 文本渲染
  | { type: 'tool-call'; toolCalls: ToolCall[] } // 工具调用卡片
  | { type: 'waiting' }                         // 等待指示器
  | { type: 'data-steps'; turnIndex: number }   // 步骤面板
  | { type: 'retrieved-memories'; memories: ... } // 记忆面板
```

**MessageBubble 渲染逻辑 (L67-141):**
- `type: 'text'` → `v-html` 渲染 Markdown
- `type: 'tool-call'` → `<ToolCallGroup>` / `<ToolCallItem>` 组件
- `type: 'waiting'` → "Waiting" 流动动画
- `type: 'data-steps'` → `<StepsPanel>` 内联步骤面板

---

### 完整数据流图

```
┌─────────────── 渲染进程 ───────────────┐
│ InputBox.vue                           │
│   sendMessage()                        │
│     ↓ emit('sendMessage')              │
│ ChatWindow.vue                         │
│   handleSendMessage()                  │
│     ↓                                  │
│ useChatSession.ts                      │
│   sendMessage()                        │
│     ↓                                  │
│ chatStore.sendMessage()                │
│   ↓ window.electronAPI                 │
│     .sendMessageStream()               │
└────────────┬───────────────────────────┘
             │ ipcRenderer.invoke('chat:send-message-stream')
┌────────────┴───────────────────────────┐
│          Preload Bridge                │
│  src/preload/index.ts                  │
└────────────┬───────────────────────────┘
             │ ipcMain.handle
┌────────────┴───────────────────────────┐
│          Main 进程                      │
│ handleSendMessageStream()              │
│   ├─ 创建消息 & 存储                    │
│   ├─ 立即返回 { success, messageId }    │
│   └─ process.nextTick() →              │
│      executeMessageStream()            │
│        ↓                               │
│      executeStreamGeneration()         │
│        ↓                               │
│      runStream() [最多100轮]            │
│        ↓                               │
│      streamChatResponseWithTools()     │
│        ↓ Vercel AI SDK streamText()    │
│      ┌──────────────────┐              │
│      │  AI Provider API │              │
│      └──────┬───────────┘              │
│             ↓ 流式 chunk               │
│      IPCEmitter                        │
│        sender.send(STREAM_CHUNK, ...)  │
│        sender.send(STREAM_COMPLETE,..) │
└────────────┬───────────────────────────┘
             │ ipcRenderer.on('chat:stream-chunk')
┌────────────┴───────────────────────────┐
│          渲染进程                        │
│ ipc-hub.ts → initializeIPCHub()        │
│   ↓                                    │
│ chatStore.handleStreamChunk()          │
│   ├─ 更新 message.content              │
│   ├─ 更新 message.contentParts[]       │
│   └─ 触发 Vue 响应式更新               │
│   ↓                                    │
│ ChatWindow → MessageList               │
│   → MessageItem → MessageBubble        │
│     ├─ text → Markdown v-html          │
│     ├─ tool-call → ToolCallItem        │
│     └─ steps → StepsPanel              │
└────────────────────────────────────────┘
```

---

### 关键 IPC 通道汇总

| 通道名 | 方向 | 用途 |
|--------|------|------|
| `chat:send-message-stream` | 渲染→Main | 发送消息请求（invoke） |
| `chat:stream-chunk` | Main→渲染 | 流式内容块（text/reasoning/tool_call 等） |
| `chat:stream-complete` | Main→渲染 | 流完成，含 token 统计 |
| `chat:stream-error` | Main→渲染 | 流错误 |
| `chat:step-added` | Main→渲染 | 工具执行步骤添加 |
| `chat:step-updated` | Main→渲染 | 工具执行步骤更新 |
| `chat:abort-stream` | 渲染→Main | 中止流（invoke） |
以下是完整的 AI Provider 抽象层分析。

---

# AI Provider 抽象层架构分析

## 一、核心类型定义

**文件**: `src/main/providers/types.ts`

| 接口 | 作用 |
|------|------|
| `ProviderInfo` | Provider 元数据（id, name, icon, defaultModel, 是否需要 API Key/OAuth 等），供 UI 展示 |
| `ProviderConfig` | 用户配置（apiKey, baseUrl, oauthToken） |
| `ProviderInstance` | 运行时实例，核心方法 `createModel(modelId) → LanguageModel` |
| `ProviderCreator` | 工厂函数类型 `(config) → ProviderInstance` |
| `ProviderDefinition` | 完整定义，包含 `id` + `info` + `create` + `requiresSystemMerge?` |

**统一抽象的关键**: 所有 Provider 最终返回 Vercel AI SDK 的 `LanguageModel` 接口，通过这一层实现了完全解耦。

## 二、内置 Provider 实现

**文件**: `src/main/providers/builtin/`

| 文件 | Provider | SDK | 特殊处理 |
|------|----------|-----|----------|
| `openai.ts` | OpenAI | `@ai-sdk/openai` → `createOpenAI` | 标准实现 |
| `claude.ts` | Claude | `@ai-sdk/anthropic` → `createAnthropic` | 标准实现 |
| `deepseek.ts` | DeepSeek | `@ai-sdk/deepseek` | Reasoning 模型支持 |
| `gemini.ts` | Gemini | `@ai-sdk/google` | 图像生成、多模态 |
| `zhipu.ts` | 智谱 | 自定义 `LanguageModelV2` | `requiresSystemMerge=true`，thinking mode |
| `kimi.ts` | Kimi | `@ai-sdk/openai`（兼容接口） | 使用 OpenAI 兼容 |
| `openrouter.ts` | OpenRouter | `@ai-sdk/openai`（兼容接口） | 动态模型列表 |
| `claude-code.ts` | Claude Code | - | OAuth 认证 |
| `github-copilot.ts` | GitHub Copilot | - | OAuth 认证 |

**注册入口**: `src/main/providers/builtin/index.ts` 导出 `builtinProviders: ProviderDefinition[]`

**典型实现模式**（以 OpenAI 为例）:
```typescript
create: ({ apiKey, baseUrl }) => {
  const provider = createOpenAI({ apiKey, baseURL: baseUrl })
  return { createModel: (modelId) => provider(modelId) }
}
```

## 三、Provider 注册表

**文件**: `src/main/providers/registry.ts`

### 核心数据结构

| 变量 | 类型 | 作用 |
|------|------|------|
| `providers` | `Map<string, ProviderDefinition>` | 所有已注册的 Provider 定义 |
| `providerInstanceCache` | `Map<string, { instance, createdAt }>` | 实例缓存（TTL 5 分钟） |

### 核心函数

| 函数 | 作用 |
|------|------|
| `initializeRegistry()` | 注册所有内置 Provider（模块加载时调用） |
| `registerProvider(def)` | 注册单个 Provider |
| `createProviderInstance(id, config)` | 创建/获取缓存实例（同步） |
| `createProviderInstanceAsync(id, config)` | 创建实例，支持 OAuth token 刷新（异步） |
| `createCustomProviderInstance(config)` | 为 `custom-` 前缀的用户自定义 Provider 创建实例 |
| `requiresSystemMerge(id)` | 检查是否需要合并 system 消息到 user 消息 |
| `invalidateProviderCache(id?)` | 清除缓存 |

**自定义 Provider**: ID 以 `custom-` 开头时，根据 `apiType` 字段选择 `createOpenAI` 或 `createAnthropic` SDK。

## 四、统一 API 层

**文件**: `src/main/providers/index.ts`

这是对外暴露的统一入口，模块加载时自动调用 `initializeRegistry()`。

### 核心流式函数

| 函数 | 行号 | 用途 |
|------|------|------|
| `streamChatResponse()` | :281 | 简单文本流（仅 text chunk） |
| `streamChatResponseWithReasoning()` | :321 | 带 reasoning 的文本流（区分推理/非推理模型） |
| `streamChatResponseWithTools()` | :631 | **主力函数** - 带工具调用的流式响应 |
| `streamChatWithUIMessages()` | :1015 | UIMessage 格式的流式响应（AI SDK 5.x 原生格式） |
| `generateChatResponse()` | :267 | 非流式文本生成 |
| `generateChatResponseWithReasoning()` | :470 | 带 reasoning 的非流式生成 |

### 流式 Chunk 类型 (`StreamChunkWithTools`)

```
text | reasoning | tool-call | tool-result | finish
| tool-input-start | tool-input-delta | tool-input-end
```

### 关键辅助函数

| 函数 | 作用 |
|------|------|
| `createProvider(id, config)` | 创建 Provider 实例的便捷封装 |
| `wrapWithDevTools(model)` | 开发模式下包装 DevTools 中间件 |
| `isReasoningModel(modelId, providerId)` | 判断是否为推理模型（禁用 temperature） |
| `createZodSchema(parameters)` | 工具参数转 Zod Schema |
| `convertToolDefinitionsForAI(defs)` | 工具定义格式转换 |
| `convertOurUIMessageToAISDK(msgs)` | UIMessage 格式转换 |

## 五、完整调用链路

```
┌─ Renderer ─────────────────────────────────────────────────────┐
│  chatStore.sendMessage()                                        │
│    → window.electronAPI.sendMessageStream(sessionId, content)  │
└────────────────────────┬───────────────────────────────────────┘
                         │ IPC invoke
┌─ Preload ──────────────┴───────────────────────────────────────┐
│  ipcRenderer.invoke(IPC_CHANNELS.SEND_MESSAGE_STREAM, {...})   │
└────────────────────────┬───────────────────────────────────────┘
                         │
┌─ Main Process ─────────┴───────────────────────────────────────┐
│                                                                 │
│  1. stream-executor.ts: executeMessageStream()                  │
│     ├─ 检查是否为图像生成模型 → processImageGenerationStream() │
│     └─ 文本流 → 构建 StreamContext                              │
│                                                                 │
│  2. tool-loop.ts: executeStreamGeneration()                     │
│     ├─ 加载 Tools / MCP Tools / Skills                          │
│     ├─ 构建 systemPrompt                                       │
│     ├─ 组装 conversationMessages                                │
│     └─ 调用 runStream()                                         │
│                                                                 │
│  3. tool-loop.ts: runStream() — 核心循环                        │
│     ├─ while (turn < 100)                                       │
│     │   ├─ 上下文压缩检查 (shouldCompact)                       │
│     │   ├─ 插件 Hook 处理 (params:pre)                          │
│     │   ├─ 调用 streamChatResponseWithTools()  ← Provider 层    │
│     │   ├─ 遍历 stream chunks:                                  │
│     │   │   ├─ text → processor.handleTextChunk()               │
│     │   │   ├─ reasoning → processor.handleReasoningChunk()     │
│     │   │   ├─ tool-input-start/delta → 实时参数流              │
│     │   │   ├─ tool-call → processor.handleToolCallChunk()      │
│     │   │   │              → executeToolAndUpdate()             │
│     │   │   └─ finish → 记录 usage                              │
│     │   ├─ 无 tool call 且 finishReason=stop → 退出循环         │
│     │   └─ 有 tool call → 追加 assistant+tool 消息 → 继续循环   │
│     └─ 返回 StreamResult                                        │
│                                                                 │
│  4. providers/index.ts: streamChatResponseWithTools()            │
│     ├─ createProvider() → createModel()                          │
│     ├─ wrapWithDevTools()                                       │
│     ├─ 消息格式转换 (ToolChatMessage → AI SDK CoreMessage)      │
│     ├─ System 消息合并 (requiresSystemMerge)                    │
│     ├─ 工具参数转 Zod Schema → inputSchema                      │
│     ├─ Vercel AI SDK streamText() ← 实际 API 调用              │
│     └─ yield chunks (text/reasoning/tool-call/tool-input-*)     │
└─────────────────────────────────────────────────────────────────┘
```

## 六、Streaming 处理机制

### 6.1 三层架构

| 层次 | 文件 | 职责 |
|------|------|------|
| **Provider 层** | `providers/index.ts` | 调用 AI SDK `streamText()`，将 `fullStream` 转为统一的 `StreamChunkWithTools` |
| **Processor 层** | `ipc/chat/stream-processor.ts` | 累积内容、管理 ToolCall 状态、更新 store |
| **Emitter 层** | `ipc/chat/ipc-emitter.ts` | 通过 `sender.send()` 将 IPC 事件推送到 Renderer |

### 6.2 StreamProcessor（`stream-processor.ts`）

**核心状态**:
- `accumulatedContent` — 累积文本
- `accumulatedReasoning` — 累积推理
- `toolCalls: ToolCall[]` — 工具调用列表
- `toolInputBuffers: Map<toolCallId, { toolName, argsText, stepId }>` — 流式工具参数缓冲

**关键方法**:

| 方法 | 作用 |
|------|------|
| `handleTextChunk()` | 累积文本 + 更新 store + IPC 发送 |
| `handleReasoningChunk()` | 累积推理 + 更新 store + IPC 发送 |
| `handleToolInputStart()` | 创建 placeholder ToolCall (status=`input-streaming`) + placeholder Step + IPC |
| `handleToolInputDelta()` | 累积 JSON 参数文本 + 更新 Step + IPC delta |
| `handleToolCallChunk()` | 解析完成的 tool call + 合并到 placeholder 或新建 + IPC |
| `finalize()` | 标记消息停止流式 |

### 6.3 IPCEmitter（`ipc-emitter.ts`）

封装了所有 `ctx.sender.send()` 调用：

| 方法 | IPC Channel |
|------|-------------|
| `sendTextChunk()` | `STREAM_CHUNK` (type=text) |
| `sendReasoningChunk()` | `STREAM_CHUNK` (type=reasoning) |
| `sendContentPart()` | `STREAM_CHUNK` (type=content_part) |
| `sendContinuation()` | `STREAM_CHUNK` (type=continuation) |
| `sendToolCall()` | `STREAM_CHUNK` (type=tool_call) |
| `sendToolInputStart()` | `STREAM_CHUNK` (type=tool_input_start) |
| `sendToolInputDelta()` | `STREAM_CHUNK` (type=tool_input_delta) |
| `sendStepAdded()` | `STEP_ADDED` |
| `sendStepUpdated()` | `STEP_UPDATED` |
| `sendStreamComplete()` | `STREAM_COMPLETE` |
| `sendStreamError()` | `STREAM_ERROR` |
| `sendContextSizeUpdate()` | `CONTEXT_SIZE_UPDATED` |

### 6.4 Tool Loop 循环控制（`tool-loop.ts:runStream()`）

```
最大轮次: MAX_TOOL_TURNS = 100

退出条件:
  1. 无 tool call 且 finishReason != 'length' → 正常结束
  2. finishReason == 'length' → 追加截断提示，结束
  3. tool 需要用户确认 (requiresConfirmation) → 暂停
  4. 达到最大轮次 → 强制结束

每轮执行:
  - 上下文压缩检查 (Pre-request + Post-turn)
  - prompt too long 错误自动恢复（压缩后重试）
  - 插件 Hook (params:pre) 修改 temperature/model/maxTokens
  - Usage 累积和 context size 实时通知
```

## 七、辅助模块

### provider-helpers.ts（`ipc/chat/provider-helpers.ts`）

| 函数 | 作用 |
|------|------|
| `getProviderConfigForChat(sessionId)` | 三级查找：session 缓存 → session.lastProvider → 全局设置 |
| `getApiKeyForProvider(id, config)` | OAuth Provider 取 token，普通 Provider 取 apiKey |
| `getProviderApiType(settings, id)` | 获取自定义 Provider 的 apiType |
| `extractErrorDetails(error)` | 递归解析 AI SDK 错误（OpenAI/Claude 格式兼容） |
| `getEffectiveProviderConfig(settings, sessionId)` | 合并 session 级别和全局设置 |

## 八、架构特点总结

1. **统一接口**: 所有 Provider 归一到 `LanguageModel`（Vercel AI SDK），上层完全不感知具体 Provider
2. **插件式注册**: 新增 Provider 只需在 `builtin/` 创建文件并导出 `ProviderDefinition`
3. **自定义 Provider**: `custom-` 前缀 + `apiType` 支持用户接入任意 OpenAI/Anthropic 兼容 API
4. **实例缓存**: 5 分钟 TTL 避免重复创建，按 `providerId#apiKey#baseUrl` 缓存
5. **流式参数**: `tool-input-start/delta` 实现工具参数的实时流式展示
6. **上下文管理**: 自动检测并压缩上下文，prompt too long 错误自动恢复
7. **三层流式处理**: Provider → Processor → Emitter 职责清晰
根据对代码的深入追踪，以下是完整的 Agent 系统分析报告。

---

# 0neThing Agent 系统全面分析

## 一、配置存储位置与格式

Agent 有**两种存储方式**，运行时合并（同名时 Store 优先于文件）：

### 1. 文件存储（File-based）

| 类型 | 路径 | 说明 |
|------|------|------|
| 用户级 | `~/.0nething/agents/*.json` | 全局可用 |
| 项目级 | `{workingDirectory}/.0nething/agents/*.json` | 仅在对应工作区可用 |

**JSON 文件格式**（`CustomAgentJsonFile`，定义在 `src/shared/ipc/custom-agents.ts`）：

```json
{
  "name": "agent-name",
  "description": "描述",
  "systemPrompt": "系统提示词",
  "avatar": { "type": "emoji", "value": "🤖" },
  "customTools": [
    {
      "id": "tool-id",
      "name": "工具名",
      "description": "工具描述",
      "parameters": [
        { "name": "param", "type": "string", "description": "...", "required": true }
      ],
      "execution": {
        "type": "bash",
        "command": "echo {{param}}",
        "timeout": 30000
      }
    }
  ],
  "allowBuiltinTools": true,
  "allowedBuiltinTools": ["bash", "read", "write"],
  "maxToolCalls": 20,
  "timeoutMs": 120000,
  "enableMemory": true
}
```

**加载器**：`src/main/services/custom-agent/loader.ts`
- `getUserAgentsPath()` → `~/.0nething/agents`
- `getProjectAgentsPath(workingDirectory)` → `{workingDirectory}/.0nething/agents`
- `loadCustomAgents(workingDirectory?)` — 扫描两个目录，项目级同名覆盖用户级
- `deleteFileBasedAgent(agentId)` — 直接删除 JSON 文件

### 2. 程序化存储（Store-based）

| 类型 | 路径 |
|------|------|
| 用户级 | `{storePath}/custom-agents/index.json` |
| 项目级 | `{workingDirectory}/.claude/agents/index.json` |

**管理逻辑**：`src/main/stores/custom-agents.ts`
- `createCustomAgent(config)` — 生成 ID 格式 `custom-agent-{timestamp}-{random}`
- `updateCustomAgent(agentId, updates)`
- `deleteCustomAgent(agentId)`
- `addCustomToolToAgent(agentId, tool)` / `updateCustomToolInAgent()` / `deleteCustomToolFromAgent()`

### 3. 合并策略

`src/main/ipc/custom-agents.ts` → `mergeAgents(fileAgents, storeAgents)`：
- 以 `name` 为键，**Store 中的 Agent 覆盖文件中的同名 Agent**
- 最终列表同时包含两种来源的 Agent

---

## 二、类型定义

核心类型在 `src/shared/ipc/custom-agents.ts`：

```
CustomAgent {
  id: string                    // "source:name" (文件) 或 "custom-agent-xxx" (Store)
  name: string
  description: string
  avatar?: AgentAvatar          // { type: 'emoji'|'icon'|'image', value, icon, gradient }
  systemPrompt: string          // Agent 的系统提示词
  customTools: CustomToolDefinition[]
  allowBuiltinTools?: boolean
  allowedBuiltinTools?: string[]
  maxToolCalls?: number         // 默认 20
  timeoutMs?: number            // 默认 120000
  enableMemory?: boolean        // 默认 true
  source: 'user' | 'project'
}
```

**工具执行类型**（三种）：
- `BashExecution` — 模板化 bash 命令，支持 `{{param}}` 插值
- `HttpExecution` — HTTP 请求（method, url, headers, body）
- `BuiltinExecution` — 委托给内置工具（如 bash, read, write）

---

## 三、加载流程

```
应用启动
  │
  ▼
initializeCustomAgents()                    ← src/main/ipc/custom-agents.ts
  ├── ensureAgentsDirectories()              ← 创建 ~/.0nething/agents 目录
  └── loadCustomAgents()                     ← src/main/services/custom-agent/loader.ts
        ├── 扫描 ~/.0nething/agents/*.json    (用户级)
        ├── 扫描 {cwd}/.0nething/agents/*.json (项目级)
        └── 验证 CustomAgentJsonFile schema（Zod）
  │
  ▼
getCustomAgentsForSession(workingDirectory)   ← IPC 请求时调用
  ├── loadCustomAgents(workingDirectory)       (文件 Agent)
  ├── getAllCustomAgents(workingDirectory)      (Store Agent)
  └── mergeAgents(fileAgents, storeAgents)     (合并，Store 优先)
  │
  ▼
CustomAgentTool 异步初始化                     ← src/main/tools/builtin/custom-agent.ts
  ├── 获取合并后的 Agent 列表
  ├── 按 settings 中的启用状态过滤
  ├── 构建动态 enum 参数（Agent 名称列表）
  └── 生成工具描述（包含可用 Agent 信息）
```

---

## 四、Agent 如何影响对话

### 1. 系统提示词注入

**关键文件**：`src/main/ipc/chat/tool-loop.ts`（约 680-713 行）

```
用户发送消息
  │
  ▼
executeStreamGeneration()
  │
  ├── getCustomAgentById(session.agentId, workingDirectory)
  │     → 获取 Agent 配置
  │
  ├── characterSystemPrompt = agent.systemPrompt
  │     → 提取 Agent 的系统提示词
  │     → 若无 Agent，回退到 workspace 的系统提示词
  │
  ├── buildSystemPrompt({ workspaceSystemPrompt: characterSystemPrompt, ... })
  │     → 构建完整系统提示词
  │
  ├── setInitContext({ agent: { id, name, permissions }, ... })
  │     → 设置工具执行上下文
  │
  └── textLoadMemoryForChat(userMessage, agentId)
        → 加载 Agent 专属记忆
```

### 2. Agent 记忆隔离

**关键文件**：`src/main/ipc/chat/memory-helpers.ts`（约 202-227 行）

```
textLoadMemoryForChat(userMessage, agentId)
  ├── loadCoreMemory()           → 共享的用户画像
  └── loadAgentMemory(agentId)   → Agent 专属记忆（关系、观察）
```

每个 Agent 有独立的记忆空间：
- 核心记忆（共享）：用户偏好、画像
- Agent 记忆（隔离）：`AgentUserRelationship`（信任度、熟悉度、情绪、观察记录）

对话结束后记录交互：`textRecordAgentInteraction(agentId)` — 更新关系统计

### 3. Agent 作为工具被主 LLM 调用

**关键文件**：`src/main/tools/builtin/custom-agent.ts`

当用户使用的是主 LLM（非直接选 Agent），Agent 作为一个**内置工具**暴露：

```
主 LLM 识别到需要委托任务
  │
  ▼
CustomAgentTool.execute({ agent: "agent-name", task: "任务描述" })
  │
  ▼
executeCustomAgent(agent, request, context, events)
  ├── buildCustomAgentSystemPrompt(agent)        ← tool-builder.ts
  │     └── agent.systemPrompt + 工具描述 + 执行指南
  │
  ├── 构建工具集
  │     ├── convertCustomToolsForAI(agent.customTools)  (自定义工具)
  │     └── getBuiltinToolsById(agent.allowedBuiltinTools)  (白名单内置工具)
  │         └── 排除 'custom-agent' 和 'skill' 防止递归
  │
  └── 工具循环（最多 maxToolCalls 轮）
        ├── streamChatResponseWithTools() via Vercel AI SDK
        ├── 工具调用 → executeCustomTool() 或 executeTool()
        ├── 危险操作 → 权限请求 → 前端弹窗确认
        └── 返回 CustomAgentResult
```

---

## 五、UI 创建/编辑流程

### 前端组件结构

```
AgentsContent.vue                  ← Agent 列表/管理页面
  ├── 搜索栏 + 刷新按钮 + 创建按钮
  ├── CustomAgentCard.vue          ← 每个 Agent 的卡片
  │     ├── 头像、名称、描述、工具数量
  │     ├── 启用/禁用切换
  │     ├── 置顶(Pin)按钮
  │     ├── 编辑/删除按钮
  │     └── emit: select, edit, delete, toggle, toggle-pin
  │
  └── CreateAgentPage.vue          ← 创建/编辑页面（统一组件）
        ├── BasicSection.vue       ← 名称、描述、头像、来源
        ├── PromptSection.vue      ← 系统提示词编辑器
        ├── ToolsSection.vue       ← 自定义工具列表（增删改）
        └── SettingsSection.vue    ← 最大调用次数、超时、内置工具白名单
```

### Agent 选择（对话中）

**关键文件**：`src/renderer/components/chat/ChatWindow.vue`

```
ChatHeader → AgentDropdown.vue
  ├── "无 Agent" 选项（清除选择）
  └── Agent 列表（带头像）
       │
       ▼ 选择
selectAgent(agentId)
  └── window.electronAPI.updateSessionAgent(sessionId, agentId)
       └── 更新 session.agentId → 后续消息使用该 Agent 的系统提示词
```

### 创建流程

```
用户点击"创建"
  │
  ▼
CreateAgentPage.vue（无 agent prop = 创建模式）
  ├── 填写表单（名称、描述、头像、提示词、工具、设置）
  ├── 验证必填字段
  └── 提交
       │
       ▼
customAgentsStore.createCustomAgent(config, source)    ← Pinia Store
  └── window.electronAPI.createCustomAgent(config, source)
       └── IPC: CUSTOM_AGENT_CREATE
            └── src/main/ipc/custom-agents.ts 处理
                 └── stores/custom-agents.ts → createCustomAgent()
                      └── 写入 {storePath}/custom-agents/index.json
  │
  ▼
refreshAsyncTools()   ← 刷新工具缓存，使新 Agent 立即可用
```

### 编辑流程

```
用户点击卡片上的编辑按钮
  │
  ▼
CreateAgentPage.vue（有 agent prop = 编辑模式）
  ├── 加载已有数据到表单
  ├── 修改后提交
  └── customAgentsStore.updateCustomAgent(agentId, updates)
       └── window.electronAPI.updateCustomAgent(agentId, updates)
            └── IPC: CUSTOM_AGENT_UPDATE
                 └── 更新 Store 或文件中的 Agent
  │
  ▼
refreshAsyncTools()
```

---

## 六、权限系统（Agent 工具执行）

```
Agent 执行工具 → 检测到危险操作（如 bash 命令）
  │
  ▼
onPermissionRequired 回调                    ← custom-agent.ts
  ├── 生成唯一 requestId
  ├── 存入 pendingPermissionRequests Map（模块级）
  ├── 发送 IPC 事件 CUSTOM_AGENT_PERMISSION_REQUEST → 前端
  └── 返回 Promise，等待用户决定
       │
       ▼
前端显示权限确认对话框
  ├── 允许（一次）
  ├── 始终允许
  └── 拒绝
       │
       ▼
前端调用 respondToCustomAgentPermission(requestId, decision)
  └── IPC: CUSTOM_AGENT_PERMISSION_RESPOND
       └── respondToPermissionRequest(requestId, decision)
            └── resolve 或 reject 之前存储的 Promise
```

---

## 七、关键文件清单

| 模块 | 文件路径 | 核心函数/导出 |
|------|----------|---------------|
| **类型定义** | `src/shared/ipc/custom-agents.ts` | `CustomAgent`, `CustomToolDefinition`, `CustomAgentResult` 等全部类型 |
| **类型定义** | `src/shared/ipc/agents.ts` | `AgentAvatar`, `BuiltinAgent`, `AgentPermissions` |
| **类型定义** | `src/shared/ipc/agent-memory.ts` | `AgentMemory`, `AgentUserRelationship` |
| **IPC 通道** | `src/shared/ipc/channels.ts` | `CUSTOM_AGENT_*`, `AGENT_MEMORY_*` 常量 |
| **文件加载** | `src/main/services/custom-agent/loader.ts` | `loadCustomAgents()`, `getCustomAgentById()`, `getUserAgentsPath()` |
| **工具构建** | `src/main/services/custom-agent/tool-builder.ts` | `buildCustomAgentSystemPrompt()`, `convertCustomToolsForAI()`, `getBuiltinToolsById()` |
| **工具执行** | `src/main/services/custom-agent/custom-tool-executor.ts` | `executeCustomTool()`, `interpolateTemplate()`, `escapeShellArg()` |
| **Agent 执行** | `src/main/services/custom-agent/executor.ts` | `executeCustomAgent()` |
| **IPC 处理** | `src/main/ipc/custom-agents.ts` | `registerCustomAgentHandlers()`, `initializeCustomAgents()`, `mergeAgents()` |
| **记忆 IPC** | `src/main/ipc/agent-memory.ts` | 记忆 CRUD 处理器 |
| **Store 存储** | `src/main/stores/custom-agents.ts` | `createCustomAgent()`, `updateCustomAgent()`, `deleteCustomAgent()` |
| **对话注入** | `src/main/ipc/chat/tool-loop.ts` | 680-713 行：Agent 系统提示词注入，773-783 行：交互记录 |
| **记忆加载** | `src/main/ipc/chat/memory-helpers.ts` | `textLoadMemoryForChat()` — Agent 专属记忆加载 |
| **内置工具** | `src/main/tools/builtin/custom-agent.ts` | `CustomAgentTool` — 将 Agent 暴露为主 LLM 的工具 |
| **前端 Store** | `src/renderer/stores/custom-agents.ts` | Pinia store：`loadCustomAgents()`, `createCustomAgent()` 等 |
| **列表页面** | `src/renderer/components/AgentsContent.vue` | Agent 管理列表 UI |
| **创建/编辑** | `src/renderer/components/agent/CreateAgentPage.vue` | 统一的创建/编辑表单 |
| **卡片组件** | `src/renderer/components/CustomAgentCard.vue` | Agent 卡片展示 |
| **选择下拉** | `src/renderer/components/chat/AgentDropdown.vue` | 对话中的 Agent 选择 |
| **Preload** | `src/preload/index.ts` | 393-477 行：Agent 相关 IPC 桥接 API |

---

## 八、架构总结

```
┌─────────────────────────────────────────────────────────┐
│  存储层                                                  │
│  ┌───────────────┐  ┌──────────────────────┐            │
│  │ JSON 文件      │  │ Store (index.json)   │            │
│  │ ~/.0nething/   │  │ {storePath}/         │            │
│  │ agents/*.json  │  │ custom-agents/       │            │
│  └───────┬───────┘  └──────────┬───────────┘            │
│          └──────────┬──────────┘                         │
│                     ▼                                    │
│           mergeAgents() 合并（Store 优先）                │
└─────────────────────┬───────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────┐
│  服务层 (src/main/services/custom-agent/)                │
│  ├── loader.ts        — 文件加载与验证                    │
│  ├── tool-builder.ts  — 工具 schema 构建、提示词生成      │
│  ├── custom-tool-executor.ts — bash/http/builtin 执行    │
│  └── executor.ts      — Agent 自主执行循环               │
└─────────────────────┬───────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────┐
│  IPC 层                                                  │
│  ├── channels.ts      — 通道常量                         │
│  ├── custom-agents.ts — 类型定义                         │
│  ├── ipc/custom-agents.ts — 处理器注册                   │
│  └── preload/index.ts — 桥接 API                        │
└─────────────────────┬───────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────┐
│  前端层                                                  │
│  ├── stores/custom-agents.ts  — Pinia 状态管理           │
│  ├── AgentsContent.vue        — 列表管理页               │
│  ├── CreateAgentPage.vue      — 创建/编辑表单            │
│  ├── CustomAgentCard.vue      — Agent 卡片               │
│  └── AgentDropdown.vue        — 对话中 Agent 选择        │
└─────────────────────────────────────────────────────────┘
```

**核心设计特点**：
1. **双存储合并** — 文件和 Store 两种来源，运行时合并
2. **隔离执行** — Agent 在独立工具集中运行，防递归
3. **记忆隔离** — 每个 Agent 有独立的关系记忆空间
4. **权限控制** — 危险操作需前端用户确认
5. **Provider 继承** — Agent 不覆盖模型设置，继承当前会话的 Provider
