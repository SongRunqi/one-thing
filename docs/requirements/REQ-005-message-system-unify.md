# REQ-005: 统一消息系统

> 状态: 已分析 | 创建: 2026-02-08 | 更新: 2026-02-08 | PM: Qiqi

## 1. 背景

当前项目存在 **ChatMessage / UIMessage 双轨并行** 的历史包袱。ChatMessage 是早期自定义格式，UIMessage 是 AI SDK 5.x 引入的新格式。两者在存储、传输、渲染三个层面同时存在，导致大量转换代码和状态不同步风险。

## 2. 现状问题

### 2.1 消息类型双轨

| 类型 | 定义位置 | 说明 |
|------|----------|------|
| `ChatMessage` | `src/shared/ipc/chat.ts:80` | 旧格式：扁平结构，含 `role:'error'`、`content` 字符串、`toolCalls`、`contentParts`、`steps` |
| `UIMessage` | `src/shared/ipc/ui-message.ts:170` | 新格式（AI SDK 5.x）：`parts: UIMessagePart[]` + `metadata` |
| `ContentPart` (6 种) | `src/shared/ipc/chat.ts:23` | 旧内容分段：`text | tool-call | waiting | loading-memory | retrieved-memories | data-steps` |
| `UIMessagePart` (7 种) | `src/shared/ipc/ui-message.ts:126` | 新内容分段：`TextUIPart | ReasoningUIPart | ToolUIPart | FileUIPart | StepStartUIPart | StepsDataUIPart | ErrorDataUIPart` |

`ContentPart` 和 `UIMessagePart` 概念重叠但结构不同，分别在不同代码路径使用。

### 2.2 580 行转换代码

`src/shared/message-converters.ts`（580 行）承担双向转换，包含 6 个转换函数：

| 转换函数 | 行号 | 必要性 |
|----------|------|--------|
| `chatMessageToUIMessage` | `:34` | **冗余** — 统一后不需要 |
| `uiMessageToChatMessage` | `:175` | **冗余** — 仅为向后兼容 |
| `toolCallToUIPart` | `:147` | 冗余 |
| `uiPartToToolCall` | `:308` | 冗余 |
| `attachmentToFilePart` | `:162` | 冗余 |
| `filePartToAttachment` | `:341` | 冗余，且**丢失数据**（`size: 0`，行 `:370`） |

`filePartToAttachment()` 硬编码 `size: 0`，下游依赖 size 的逻辑会出错。

### 2.3 两个前端 Store 同时管理状态

| Store | 位置 | 规模 |
|-------|------|------|
| `ChatStore` | `src/renderer/stores/chat.ts` | 897 行 |
| `UIMessagesStore` | `src/renderer/stores/ui-messages.ts` | 300+ 行 |

- `ipc-hub.ts` 将流事件分发给 `ChatStore`
- `UIMessagesStore` 有独立的 `handleUIMessageChunk` 逻辑
- 两个 Store 可能状态不同步

### 2.4 流式事件两条通道

| 通道 | 定义位置 | 内容 |
|------|----------|------|
| 旧流 `onStreamChunk` | `src/renderer/types/index.ts:340-354` | 7 种 chunk type |
| 新流 `onUIMessageStream` | `src/renderer/types/index.ts:361` | `UIMessageStreamData` |

两条流同时发送，浪费带宽且增加复杂度。

### 2.5 `role: 'error'` 非法角色

- `ChatMessage.role` 包含 `'error'`（`src/shared/ipc/chat.ts:83`），不是合法的 AI SDK role
- 转换时硬编码为 `'assistant'`（`message-converters.ts:146`），通过 `metadata.isError` 标记
- 前端仍然直接检查 `message.role === 'error'`（`MessageItem.vue:18`）

## 3. 数据流现状

```
用户输入
  │
  ▼
ChatStore.sendMessage() → 构建 ChatMessage (role:'user', content: string)
  │
  ▼ IPC: sendMessageStream
后端 ipc/chat.ts
  │ store.addMessage(ChatMessage)  ← 磁盘始终存储 ChatMessage
  │ buildMessageContent(ChatMessage) → AIMessageContent
  │ buildHistory() → HistoryMessage[]
  │
  ▼ AI SDK streamText()
stream-processor.ts
  │ onStreamChunk (旧流) ─→ ChatStore.handleStreamChunk → 更新 ChatMessage
  │ onUIMessageStream (新流) ─→ UIMessagesStore.handleUIMessageChunk → 更新 UIMessage.parts
  │
  ▼ 渲染
MessageItem.vue ← 接收 ChatMessage，调用 chatMessageToUIMessage() 转换后渲染
```

## 4. 重构方案

**目标**: 统一到 UIMessage 格式，废弃 ChatMessage。

### Phase 1: 存储层迁移（~3h）

**内容**:
- 修改 `src/main/stores/sessions.ts`（1223 行）的持久化逻辑，改为存储 `UIMessage[]`
- 编写迁移脚本，将磁盘上的 ChatMessage 数据转换为 UIMessage 格式
- 参考已有的 `src/main/migrations/migrate-to-uimessage.ts`（含 `ChatSessionWithUIMessages` 类型，行 `:30`）
- 加载时不再需要 `chatMessageToUIMessage()`

**影响范围**: `stores/sessions.ts`、`migrations/` 目录、所有 session 数据文件

**回滚策略**: 迁移脚本保留原始文件备份（`.bak`），回滚时恢复即可。保留 `uiMessageToChatMessage()` 直到 Phase 4。

### Phase 2: 废弃旧流（~2h）

**内容**:
- 后端 `stream-processor.ts` 移除 `onStreamChunk` 系列事件，仅发送 `onUIMessageStream`
- 前端 `ipc-hub.ts` 移除旧流事件监听
- 错误通过 `ErrorDataUIPart`（`ui-message.ts:115`）传递，替代 `role: 'error'`

**影响范围**: `stream-processor.ts`、`ipc-hub.ts`、`renderer/types/index.ts`（删除 7 个旧 chunk type 定义）

**回滚策略**: 旧流代码注释保留，通过 feature flag 切换新旧流。

### Phase 3: 合并 Store（~3h）

**内容**:
- 将 `UIMessagesStore`（300+ 行）的逻辑合并到 `ChatStore`（897 行）
- `ChatStore` 内部统一使用 UIMessage 格式
- 移除 `UIMessagesStore`

**影响范围**: `stores/chat.ts`、`stores/ui-messages.ts`、所有引用 UIMessagesStore 的组件

**回滚策略**: Git 分支级回滚。

### Phase 4: 清理（~2h）

**内容**:
- 删除 `src/shared/message-converters.ts` 中的双向转换函数（约 500 行）
- 删除 `ContentPart` 类型定义（`src/shared/ipc/chat.ts:23`）
- 删除 `ChatMessage` 中的 `role: 'error'`
- 仅保留 `buildMessageContent()`（`src/main/ipc/chat/message-helpers.ts:40`），这是 AI SDK 必需的

**影响范围**: `message-converters.ts`、`shared/ipc/chat.ts`、`MessageItem.vue`

**回滚策略**: 代码已无运行时依赖，可安全删除。

## 5. 验收标准

1. [ ] 磁盘上新创建的 session 以 UIMessage 格式存储
2. [ ] 旧 session 数据能正确迁移加载，消息内容无丢失
3. [ ] 流式聊天（文本、推理、工具调用、文件）正常工作
4. [ ] 错误消息通过 `ErrorDataUIPart` 显示，不再使用 `role: 'error'`
5. [ ] `message-converters.ts` 从 580 行缩减到 <100 行（仅保留 `buildMessageContent`）
6. [ ] `UIMessagesStore` 已删除，仅 `ChatStore` 管理消息状态
7. [ ] 所有流式事件通过单一 `onUIMessageStream` 通道
8. [ ] 附件的 `size` 字段在转换中不再丢失
9. [ ] 现有自动化测试全部通过

## 6. 风险与缓解

| 风险 | 级别 | 缓解措施 |
|------|------|----------|
| 旧 session 数据迁移失败 | **高** | 迁移前自动备份；迁移脚本逐条处理，失败跳过并记录 |
| 流切换期间消息丢失 | **高** | Phase 2 先双发（新旧流并行），验证无误后再移除旧流 |
| 合并 Store 引入状态 bug | **中** | 编写 Store 单元测试覆盖核心路径（发送、接收、流式更新） |
| `buildMessageContent` 行为变化 | **中** | 该函数输入从 ChatMessage 改为 UIMessage，需确保 AI SDK 输入格式不变 |
| 第三方插件依赖 ChatMessage 格式 | **低** | 当前无外部插件系统，不涉及 |

## 7. 预估

总计 ~10h，建议按 Phase 分 4 个 PR 提交。
