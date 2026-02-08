# REQ-009: UI 完全迁移到 UIMessage

> 状态: 进行中 | 创建: 2026-02-08 | PM: Qiqi

## 1. 背景

REQ-005 将后端存储迁移到了 UIMessage 格式，但前端渲染仍然读 `sessionMessages`（ChatMessage 格式）。
目前有一个 `syncStreamToSessionMessages` bridge 临时同步数据，这是技术债。

## 2. 目标

前端组件全部从 `sessionMessages`（ChatMessage）迁移到 `sessionUIMessages`（UIMessage），删除 sync bridge。

## 3. 影响范围

### 核心组件（必须改）
- `useChatSession.ts` — messages 从 getSessionState 改为 getSessionUIMessages
- `MessageList.vue` — props.messages 类型从 ChatMessage[] 改为 UIMessage[]
- `MessageItem.vue` — 渲染逻辑从 message.content/reasoning/toolCalls 改为 message.parts
- `ChatWindow.vue` — panelMessages 类型
- `ChatHeader.vue` — token 计算

### 辅助组件
- `MessageBubble.vue` — 从 message.content 改为读 text parts
- `DocumentsTab.vue` — 从 sessionMessages 改为 sessionUIMessages
- `useInputHistory.ts` — 同上
- `ArchivedChatsContent.vue` — session.messages

### 可删除
- `syncStreamToSessionMessages` bridge（chat.ts 中）
- `rebuildContentParts` 函数（不再需要）
- `contentParts` 相关类型和逻辑

## 4. 迁移策略

### Phase 1: Composable + 数据源切换
- `useChatSession.ts` 返回 UIMessage[] 而非 ChatMessage[]
- 保持 ChatMessage 的加载逻辑（loadMessages），但输出转换为 UIMessage

### Phase 2: 组件逐个迁移
- MessageItem.vue → 从 parts 渲染
- MessageList.vue → 接受 UIMessage[]
- MessageBubble.vue → 读 text parts

### Phase 3: 清理
- 删除 syncStreamToSessionMessages
- 删除 rebuildContentParts
- 清理无用的 ChatMessage 引用

## 5. 验收标准
1. [ ] 前端不再直接读 sessionMessages
2. [ ] syncStreamToSessionMessages 已删除
3. [ ] 248 单元测试 + 9 E2E 测试通过
