# Sprint 3 技术债分析报告

> 生成时间: 2026-02-08 | 分支: dev

---

## 1. 消息系统现状分析

### 1.1 消息类型清单

| 类型 | 定义位置 | 用途 |
|------|----------|------|
| `ChatMessage` | `src/shared/ipc/chat.ts:80` | 旧消息格式，含 `role:'error'`、`content` 字符串、`toolCalls`、`contentParts`、`steps` 等扁平字段 |
| `UIMessage` | `src/shared/ipc/ui-message.ts:170` | 新消息格式（AI SDK 5.x），`parts: UIMessagePart[]` + `metadata` |
| `UIMessagePart` (union) | `src/shared/ipc/ui-message.ts:126` | `TextUIPart \| ReasoningUIPart \| ToolUIPart \| FileUIPart \| StepStartUIPart \| StepsDataUIPart \| ErrorDataUIPart` |
| `ContentPart` | `src/shared/ipc/chat.ts:23` | 旧的内容分段类型（`text \| tool-call \| waiting \| loading-memory \| retrieved-memories \| data-steps`） |
| `HistoryMessage` | `src/main/ipc/chat/message-helpers.ts` | 发送给 AI SDK 的历史消息格式 |
| `StreamSendMessageResponse` | `src/renderer/types/index.ts:325` | 流式发送响应，返回 `ChatMessage` 格式的 `userMessage` |
| `ChatSessionWithUIMessages` | `src/main/migrations/migrate-to-uimessage.ts:30` | 迁移用扩展类型，含 `uiMessages?: UIMessage[]` |

### 1.2 消息数据流

```
用户输入
  │
  ▼
前端 ChatStore.sendMessage()
  │ 构建 ChatMessage (role:'user', content: string)
  │
  ▼ IPC: sendMessageStream
后端 ipc/chat.ts
  │ store.addMessage(ChatMessage)  ← 持久化为 ChatMessage
  │ buildMessageContent(ChatMessage) → AIMessageContent (multimodal)
  │ buildHistory() → HistoryMessage[]
  │
  ▼ AI SDK streamText()
stream-processor.ts
  │ 解析 AI SDK delta → 发送 IPC 事件
  │   onStreamChunk (type: 'text'|'reasoning'|'tool_call'|...)
  │   onUIMessageStream (UIMessageStreamData)  ← 新流
  │   onStreamComplete
  │   onStreamError
  │
  ▼ IPC 事件到前端
前端 ipc-hub.ts → ChatStore
  │ handleStreamChunk → 更新 ChatMessage (旧路径)
  │
前端 UIMessagesStore (新路径)
  │ handleUIMessageChunk → 更新 UIMessage.parts
  │
  ▼ 存储
后端 store.addMessage / updateMessageContent
  │ 始终以 ChatMessage 格式存储到磁盘
  │
  ▼ 显示
前端 MessageItem.vue
  │ 接收 ChatMessage，部分组件也用 UIMessage
  │ chatMessageToUIMessage() 转换后渲染
```

### 1.3 类型转换位置

| 转换 | 位置 | 必要性 |
|------|------|--------|
| `ChatMessage → UIMessage` | `src/shared/message-converters.ts:34` (`chatMessageToUIMessage`) | **冗余** - 如果统一用 UIMessage 存储则不需要 |
| `UIMessage → ChatMessage` | `src/shared/message-converters.ts:175` (`uiMessageToChatMessage`) | **冗余** - 仅为向后兼容 |
| `ToolCall → ToolUIPart` | `src/shared/message-converters.ts:147` (`toolCallToUIPart`) | 冗余（同上） |
| `ToolUIPart → ToolCall` | `src/shared/message-converters.ts:308` (`uiPartToToolCall`) | 冗余（同上） |
| `MessageAttachment → FileUIPart` | `src/shared/message-converters.ts:162` | 冗余 |
| `FileUIPart → MessageAttachment` | `src/shared/message-converters.ts:341` | 冗余，且**丢失数据**（`size: 0`） |
| `ChatMessage → AIMessageContent` | `src/main/ipc/chat/message-helpers.ts:40` (`buildMessageContent`) | **必要** - AI SDK 需要特定格式 |

### 1.4 已知问题和隐患

1. **双重消息系统并行运行**
   - `ChatStore`（`src/renderer/stores/chat.ts`）和 `UIMessagesStore`（`src/renderer/stores/ui-messages.ts`）同时管理消息状态
   - `ipc-hub.ts` 将流事件分发给 `ChatStore`，但 `UIMessagesStore` 也有独立的 `handleUIMessageChunk` 逻辑
   - 两个 store 可能状态不同步

2. **`role: 'error'` 不是合法的 AI SDK role**
   - `ChatMessage.role` 包含 `'error'`（`src/shared/ipc/chat.ts:83`）
   - 转换时硬编码为 `'assistant'`（`message-converters.ts:146`），通过 `metadata.isError` 标记
   - 前端仍然直接检查 `message.role === 'error'`（`MessageItem.vue:18`）

3. **`ContentPart` 和 `UIMessagePart` 功能重叠**
   - `ContentPart` 有 6 种类型，`UIMessagePart` 有 7 种类型，概念重叠但结构不同
   - 两者分别在不同代码路径使用，增加理解成本

4. **`FileUIPart → MessageAttachment` 转换丢失 `size`**
   - `filePartToAttachment()` 设置 `size: 0`（`message-converters.ts:370`）
   - 下游依赖 size 的逻辑会出错

5. **流式事件双轨**
   - 旧流：`onStreamChunk`（7 种 chunk type），定义在 `ElectronAPI`（`renderer/types/index.ts:340-354`）
   - 新流：`onUIMessageStream`（`UIMessageStreamData`），定义在 `renderer/types/index.ts:361`
   - 两条流同时发送，浪费带宽且增加复杂度

### 1.5 影响范围

- **前端**: `stores/chat.ts`(897行), `stores/ui-messages.ts`(300+行), `services/ipc-hub.ts`, 所有 Message 相关组件
- **后端**: `ipc/chat/` 全部 8 个文件, `stores/sessions.ts`(1223行), `migrations/`
- **共享**: `shared/message-converters.ts`(580行), `shared/ipc/chat.ts`, `shared/ipc/ui-message.ts`

### 1.6 建议方案

**目标**: 统一到 UIMessage 格式，废弃 ChatMessage

1. **Phase 1**: 存储层迁移 - 磁盘文件改为存储 UIMessage[]，加载时不再需要 `chatMessageToUIMessage()`
2. **Phase 2**: 废弃旧流 - 移除 `onStreamChunk` 系列事件，统一用 `onUIMessageStream`
3. **Phase 3**: 合并 Store - 将 `UIMessagesStore` 的逻辑合并到 `ChatStore`，移除双 store
4. **Phase 4**: 清理 - 移除 `ContentPart` 类型、`message-converters.ts` 中的双向转换函数

**风险**: 高。消息是核心数据，需要完善的迁移脚本和回滚机制。

---

## 2. Store 循环依赖分析

### 2.1 依赖图

```
src/main/stores/ 内部依赖:

paths.ts          ← 基础模块，无内部依赖
  ↑
app-state.ts      ← 依赖 paths
  ↑
settings.ts       ← 依赖 paths
  ↑
models-cache.ts   ← 依赖 paths
  ↑
lru-cache.ts      ← 无依赖（纯数据结构）
  ↑
workspaces.ts     ← 依赖 paths, app-state, tools/core/sandbox
  ↑
sessions.ts       ← 依赖 paths, app-state, workspaces, settings, tools/core/sandbox, lru-cache
  ↑
custom-agents.ts  ← 依赖 paths
  ↑
plugins.ts        ← 依赖 electron (app)
  ↑
index.ts          ← 聚合导出 + 迁移逻辑
```

### 2.2 跨层依赖问题

**stores ↔ tools 双向依赖**（不是直接循环，但违反分层原则）：

```
stores/sessions.ts  ──import──→ tools/core/sandbox.ts (expandPath)
stores/workspaces.ts ──import──→ tools/core/sandbox.ts (expandPath)
                                        │
tools/core/sandbox.ts ──import──→ stores/settings.ts (getSettings)
tools/builtin/plan.ts ──import──→ stores/sessions.ts (updateSessionPlan, getSession)
tools/builtin/bash.ts ──import──→ stores/settings.ts (getSettings)
tools/builtin/custom-agent.ts ──import──→ stores/custom-agents.ts
```

虽然没有形成直接的 A→B→A 循环（Node.js 的模块解析可以处理菱形依赖），但这构成了 **架构层级违反**：

- `stores`（数据层）不应依赖 `tools`（业务逻辑层）
- `expandPath` 是一个纯工具函数，不应放在 `tools/core/sandbox.ts` 里

### 2.3 `store.ts` 门面模式的问题

`src/main/store.ts` 作为门面重新导出 `stores/index.ts` 的所有内容。14 个文件通过 `import * as store from '../../store.js'` 使用它。这导致：

- 任何对 `stores/` 的修改都可能触发大范围重编译
- 不清楚每个消费者实际依赖哪些函数
- `store.ts` 导出了 60+ 个函数，接口过于庞大

### 2.4 具体位置

| 依赖方 | 被依赖方 | 具体 import |
|--------|----------|------------|
| `stores/sessions.ts:22` | `tools/core/sandbox.ts` | `expandPath` |
| `stores/workspaces.ts:14` | `tools/core/sandbox.ts` | `expandPath` |
| `tools/core/sandbox.ts:11` | `stores/settings.ts` | `getSettings` |
| `tools/builtin/plan.ts:15` | `stores/sessions.ts` | `updateSessionPlan, getSession` |

### 2.5 建议方案

1. **提取 `expandPath` 到共享工具模块**
   - 创建 `src/main/utils/path-utils.ts`
   - 将 `expandPath` 从 `tools/core/sandbox.ts` 移出
   - 消除 stores → tools 的依赖

2. **拆分 `store.ts` 门面**
   - 让消费者直接 import 具体的 store 模块
   - 例如 `import { getSession } from '../stores/sessions.js'` 而非 `import * as store`

3. **依赖注入 settings**
   - `sandbox.ts` 的 `expandPath` 需要 `getSettings()` 来获取 home 目录
   - 改为参数传入，而非直接 import

**风险**: 低。主要是重构 import 路径，不涉及逻辑变更。

---

## 3. 错误处理现状分析

### 3.1 统计概览

| 指标 | 数量 |
|------|------|
| 后端 `try` 语句总数 | 759 |
| 后端 `catch` 语句总数 | 367 |
| IPC handler 中的 `catch` | 142 |
| IPC chat 模块中的 `catch` | 20 |
| `console.error` 调用（IPC 层） | ~100+ |

### 3.2 IPC 错误返回格式

后端 IPC handler 统一使用 `{ success: boolean; error?: string; errorDetails?: string }` 模式，但实现不一致：

**Pattern A: `error.message` 直接暴露**（大多数 handler）
```typescript
// src/main/ipc/workspaces.ts:23
catch (error: any) {
  return { success: false, error: error.message || 'Failed to create workspace' }
}
```

**Pattern B: `instanceof Error` 检查**（OAuth 相关）
```typescript
// src/main/ipc/oauth.ts:185
catch (error) {
  return { success: false, error: error instanceof Error ? error.message : 'OAuth start failed' }
}
```

**Pattern C: 无 catch，错误未处理**
- 部分 handler 没有 try/catch，异常直接抛出到 Electron IPC 层
- Electron 会将其转为 `Error: An object could not be cloned` 或静默失败

**Pattern D: 流式错误**
```typescript
// 通过 IPC 事件发送
sender.send(IPC_CHANNELS.STREAM_ERROR, { error: string, errorDetails?: string })
```

### 3.3 前端错误展示方式

| 方式 | 位置 | 使用场景 |
|------|------|----------|
| **内联错误消息** | `MessageItem.vue:18` (`role === 'error'`) | 流式聊天错误 |
| **errorDetails 折叠展示** | `MessageItem.vue:82` | 详细错误信息 |
| **Toast 通知** | `SettingsFooter.vue:54` | 设置保存成功 |
| **Toast 通知** | `GitStatusPanel.vue:709` | Git 操作结果 |
| **内联 .error-message** | 多个设置面板 (6+ 处) | 表单验证错误 |
| **`data-error` UIMessagePart** | `ui-message.ts:115` | UIMessage 格式的错误 |
| **`sessionError` 状态** | `chat.ts:91-95` | 每个 session 的错误状态（Map） |

### 3.4 不一致问题

1. **错误消息暴露技术细节**
   - `error.message` 直接返回给前端，用户可能看到：
     - `"ECONNREFUSED"`, `"ETIMEDOUT"` 等网络错误
     - `"Cannot read properties of undefined"` 等 JS 错误
     - Provider 的原始英文错误信息

2. **流式 vs 请求-响应 错误处理不同**
   - 请求-响应：返回 `{ success: false, error: "..." }`，前端需手动检查
   - 流式：通过 `onStreamError` 事件，自动创建 `role: 'error'` 消息
   - 两条路径的错误展示体验不一致

3. **无全局错误边界**
   - 没有统一的错误处理中间件
   - 每个 IPC handler 各自 try/catch，格式因人而异
   - 没有错误分类（网络错误 vs 认证错误 vs 业务错误）

4. **错误不可重试**
   - 流式错误后没有重试按钮
   - 网络断开后没有重连提示

5. **console.error 作为主要日志**
   - 所有后端错误仅 `console.error()` 输出
   - 无结构化日志、无错误追踪、无聚合

### 3.5 用户可能看到的不友好信息

```
"Request failed with status code 429"         ← API 限流
"ECONNREFUSED 127.0.0.1:11434"                ← Ollama 未启动
"Unexpected token < in JSON at position 0"     ← 代理服务器返回 HTML
"context_length_exceeded"                       ← 上下文超长（原始 API 错误）
"insufficient_quota"                            ← OpenAI 余额不足
"Failed to fetch"                               ← 网络断开
"An object could not be cloned"                 ← Electron IPC 序列化失败
```

### 3.6 建议方案

1. **创建错误分类系统**
   ```typescript
   // src/shared/errors.ts
   enum ErrorCategory {
     NETWORK = 'network',      // 网络/连接问题
     AUTH = 'auth',             // 认证/密钥问题
     QUOTA = 'quota',          // 配额/限制
     CONTEXT = 'context',      // 上下文长度
     PROVIDER = 'provider',    // Provider 特定错误
     INTERNAL = 'internal',    // 内部错误
   }
   ```

2. **统一 IPC 错误中间件**
   - 在 IPC handler 注册层面加 try/catch wrapper
   - 自动分类错误、生成用户友好消息
   - 保留 `errorDetails` 用于调试

3. **错误本地化**
   - 将常见 API 错误映射为中文用户友好提示
   - 例如 `429 → "请求太频繁，请稍后再试"`

4. **添加重试机制**
   - 网络错误显示重试按钮
   - 限流错误自动等待后重试

**风险**: 中等。需要修改所有 IPC handler，但可以渐进式迁移。

---

## 4. 综合风险评估

| 技术债 | 紧急度 | 复杂度 | 建议优先级 |
|--------|--------|--------|-----------|
| 消息系统双轨 | 高（每次新功能都要改两处） | 高（核心数据路径） | P0 - 需要专项重构 |
| Store 跨层依赖 | 低（目前未造成运行时问题） | 低（仅 import 重构） | P2 - 顺手修 |
| 错误处理不一致 | 中（影响用户体验） | 中（需要逐模块修改） | P1 - 可渐进改善 |

### 依赖关系

- 消息系统重构应在 Store 依赖清理之后（因为消息重构会涉及 store 层）
- 错误处理改善可以独立进行
- 建议顺序：Store 清理 → 错误处理框架 → 消息系统统一
