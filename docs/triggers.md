# 触发器系统 (Triggers)

## 概述

触发器系统是一个用于运行 **后响应钩子 (Post-Response Hooks)** 的框架。触发器在 AI 响应完成后异步运行，不阻塞用户体验。

主要用途：
- 记忆提取（从对话中提取用户事实和 Agent 记忆）
- 上下文压缩（自动总结过长的对话历史）
- 智能分析（判断对话是否值得提取记忆）

## 目录结构

```
src/main/services/triggers/
├── index.ts                  # TriggerManager + 类型定义
├── memory-extraction.ts      # 记忆提取触发器
├── smart-extraction.ts       # 智能提取判断
└── context-compacting.ts     # 上下文压缩触发器
```

## 核心概念

### Trigger 接口

```typescript
interface Trigger {
  id: string        // 唯一标识符
  name: string      // 显示名称
  priority: number  // 执行优先级（数字越小越先执行）

  // 判断是否应该触发
  shouldTrigger: (ctx: TriggerContext) => Promise<boolean>

  // 执行触发器逻辑
  execute: (ctx: TriggerContext) => Promise<void>
}
```

### TriggerContext

触发器执行时的上下文信息：

```typescript
interface TriggerContext {
  sessionId: string              // 会话 ID
  session: ChatSession           // 完整会话对象
  messages: ChatMessage[]        // 所有消息
  lastUserMessage: string        // 最后一条用户消息
  lastAssistantMessage: string   // 最后一条助手消息
  providerId: string             // AI Provider ID
  providerConfig: ProviderConfig // Provider 配置
  agentId?: string               // Agent ID（如果有）
}
```

### TriggerManager

管理和执行触发器的单例类：

```typescript
class TriggerManager {
  // 注册触发器
  register(trigger: Trigger): void

  // 注销触发器
  unregister(triggerId: string): void

  // 启用/禁用所有触发器
  setEnabled(enabled: boolean): void

  // 获取所有已注册触发器
  getTriggers(): Trigger[]

  // 运行所有符合条件的触发器
  runPostResponse(ctx: TriggerContext): Promise<void>
}

// 单例导出
export const triggerManager = new TriggerManager()
```

## 执行流程

```
AI 响应完成
      │
      ▼
┌─────────────────────────────────┐
│  triggerManager.runPostResponse │
│       (构建 TriggerContext)      │
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│    遍历触发器（按 priority 排序）│
└────────────┬────────────────────┘
             │
    ┌────────┴────────┐
    ▼                 ▼
Trigger 1         Trigger 2
    │                 │
    ▼                 ▼
shouldTrigger()   shouldTrigger()
    │                 │
┌───┴───┐        ┌───┴───┐
│ true  │        │ false │
└───┬───┘        └───────┘
    │                 
    ▼
execute()
    │
    ▼
(完成，继续下一个)
```

**关键特性**：
1. 触发器按 `priority` 排序执行（小数优先）
2. 每个触发器独立执行，一个失败不影响其他
3. 错误被捕获并记录，不会中断流程

## 内置触发器

### 1. Memory Extraction Trigger

**ID**: `memory-extraction`
**Priority**: 5
**文件**: `memory-extraction.ts`

从对话中提取并保存记忆。

```typescript
const memoryExtractionTrigger: Trigger = {
  id: 'memory-extraction',
  name: 'Memory Extraction',
  priority: 5,

  async shouldTrigger(ctx) {
    // 1. 检查设置中是否启用记忆
    if (!settings.embedding?.memoryEnabled) return false

    // 2. 检查消息长度（过短跳过）
    if (ctx.lastUserMessage.length < 4) return false
    if (ctx.lastAssistantMessage.length < 20) return false

    // 3. 智能判断：使用 LLM 分类对话类型
    const classification = await shouldExtractMemory(
      ctx.lastUserMessage,
      ctx.lastAssistantMessage
    )
    return classification.shouldExtract
  },

  async execute(ctx) {
    if (ctx.agentId) {
      // Agent 模式：提取 UserFacts + AgentMemory
      await extractAndSaveMemories(...)
    } else {
      // 非 Agent 模式：仅提取 UserFacts
      await extractAndSaveUserFactsOnly(...)
    }
  }
}
```

### 2. Smart Extraction

**文件**: `smart-extraction.ts`

判断对话是否值得提取记忆的智能分类器：

```typescript
interface ExtractionClassification {
  shouldExtract: boolean
  reason: string
  confidence: number
}

async function shouldExtractMemory(
  userMessage: string,
  assistantMessage: string
): Promise<ExtractionClassification>
```

**分类逻辑**：

| 对话类型 | 是否提取 | 示例 |
|----------|----------|------|
| 个人信息分享 | ✅ 是 | "我是程序员，今年25岁" |
| 偏好表达 | ✅ 是 | "我喜欢用 TypeScript" |
| 深度讨论 | ✅ 是 | 技术架构讨论 |
| 简单问答 | ❌ 否 | "今天星期几？" |
| 闲聊 | ❌ 否 | "你好" |
| 命令式对话 | ❌ 否 | "帮我写个函数" |

### 3. Context Compacting Trigger

**ID**: `context-compacting`
**Priority**: 10
**文件**: `context-compacting.ts`

当对话历史过长时自动生成摘要。

```typescript
const contextCompactingTrigger: Trigger = {
  id: 'context-compacting',
  name: 'Context Compacting',
  priority: 10,

  async shouldTrigger(ctx) {
    // 检查消息数量或 Token 数量是否超过阈值
    return ctx.messages.length > 50 || estimatedTokens > 100000
  },

  async execute(ctx) {
    // 使用 LLM 生成对话摘要
    const summary = await generateSummary(ctx.messages)

    // 保存摘要到会话
    await updateSessionSummary(ctx.sessionId, summary)
  }
}
```

## 触发器注册

在应用启动时注册触发器：

```typescript
// src/main/index.ts

import { triggerManager } from './services/triggers'
import { memoryExtractionTrigger } from './services/triggers/memory-extraction'
import { contextCompactingTrigger } from './services/triggers/context-compacting'

// 注册内置触发器
triggerManager.register(memoryExtractionTrigger)
triggerManager.register(contextCompactingTrigger)
```

## 调用触发器

在聊天响应完成后调用：

```typescript
// src/main/ipc/chat.ts

async function handleMessageStream(event, request) {
  // ... 处理流式响应 ...

  // 响应完成后运行触发器
  await triggerManager.runPostResponse({
    sessionId: request.sessionId,
    session: await getSession(request.sessionId),
    messages: session.messages,
    lastUserMessage: request.content,
    lastAssistantMessage: assistantContent,
    providerId: request.provider,
    providerConfig: getProviderConfig(request.provider),
    agentId: session.agentId,
  })
}
```

## 创建自定义触发器

```typescript
// my-custom-trigger.ts

import type { Trigger, TriggerContext } from '../services/triggers'

export const myCustomTrigger: Trigger = {
  id: 'my-custom-trigger',
  name: 'My Custom Trigger',
  priority: 20,

  async shouldTrigger(ctx: TriggerContext): Promise<boolean> {
    // 自定义条件
    return ctx.lastUserMessage.includes('special keyword')
  },

  async execute(ctx: TriggerContext): Promise<void> {
    // 自定义逻辑
    console.log('Custom trigger executed!')
    // 做一些事情...
  }
}

// 注册
triggerManager.register(myCustomTrigger)
```

## 错误处理

触发器执行时的错误被隔离处理：

```typescript
async runPostResponse(ctx: TriggerContext): Promise<void> {
  for (const trigger of this.triggers) {
    try {
      const shouldRun = await trigger.shouldTrigger(ctx)
      if (shouldRun) {
        await trigger.execute(ctx)
      }
    } catch (error) {
      // 错误被隔离，不影响其他触发器
      console.error(`[TriggerManager] Trigger ${trigger.name} failed:`, error)
    }
  }
}
```

## 调试

触发器执行时会输出日志：

```
[TriggerManager] Running 2 triggers for session abc123
[TriggerManager] Executing trigger: Memory Extraction
[MemoryExtraction] Will extract: Personal info shared (confidence: 0.85)
[TriggerManager] Completed trigger: Memory Extraction
[TriggerManager] Executing trigger: Context Compacting
[TriggerManager] Completed trigger: Context Compacting
```

## 相关文档

- [Memory Service](./memory-service.md) - 记忆服务
- [IPC Handlers](./ipc-handlers.md) - 聊天 IPC 处理器
- [Architecture Chat](./architecture-chat.md) - 聊天系统架构
