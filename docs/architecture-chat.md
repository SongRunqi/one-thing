# Chat 系统架构

本文档详细描述 Chat 系统的实现细节和架构设计。

## 目录

1. [概述](#概述)
2. [核心文件](#核心文件)
3. [数据结构](#数据结构)
4. [多轮对话架构](#多轮对话架构)
5. [流式处理](#流式处理)
6. [Provider 交互](#provider-交互)
7. [Tool Loop 流程](#tool-loop-流程)
8. [完整流程示例](#完整流程示例)

---

## 概述

Chat 系统是应用的核心模块，负责处理用户与 AI 的多轮对话。系统采用 **流式优先** 设计，支持多个 AI 提供商，并集成了工具调用能力。

### 核心特性

- **多轮对话**: 支持上下文连续的多轮对话
- **流式响应**: 实时显示 AI 生成的文本
- **多 Provider**: 支持 Claude、OpenAI、DeepSeek、Gemini 等
- **工具集成**: 支持最多 100 轮的工具调用循环
- **Per-session 状态**: 每个会话独立管理状态

---

## 核心文件

| 文件路径 | 行数 | 功能 |
|---------|------|------|
| `src/main/ipc/chat.ts` | ~2681 | 核心 Chat IPC 处理器 |
| `src/main/providers/index.ts` | ~1146 | Provider 注册和流 API |
| `src/main/providers/registry.ts` | - | Provider 工厂注册表 |
| `src/renderer/stores/chat.ts` | ~833 | Chat 状态管理 (Pinia) |
| `src/renderer/services/ipc-hub.ts` | - | 全局 IPC 事件中心 |
| `src/shared/ipc.ts` | - | IPC 通道和类型定义 |

---

## 数据结构

### ChatMessage

```typescript
// src/shared/ipc.ts
export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'error'
  content: string
  timestamp: number
  isStreaming?: boolean
  reasoning?: string                    // 推理过程（DeepSeek 等）
  toolCalls?: ToolCall[]                // 工具调用（向后兼容）
  contentParts?: ContentPart[]          // 内容部分（新架构）
  steps?: Step[]                        // AI 推理步骤
  skillUsed?: string                    // 使用的技能名称
  attachments?: MessageAttachment[]     // 文件/图像附件
}
```

### ChatSession

```typescript
export interface ChatSession {
  id: string
  name: string
  messages: ChatMessage[]
  totalInputTokens?: number             // 累计输入 token
  totalOutputTokens?: number            // 累计输出 token
  workspaceId?: string                  // 工作区关联
  agentId?: string                      // Agent 关联
  workingDirectory?: string             // 沙箱目录
  lastProvider?: string                 // 上次使用的 Provider
  lastModel?: string                    // 上次使用的模型
  createdAt: number
  updatedAt: number
}
```

### ContentPart

```typescript
export type ContentPart =
  | { type: 'text'; content: string }
  | { type: 'tool-call'; toolCalls: ToolCall[] }
  | { type: 'waiting' }                 // 等待 AI 继续
  | { type: 'data-steps'; turnIndex: number }  // 步骤占位符
```

### ToolCall

```typescript
export interface ToolCall {
  id: string
  toolId: string                        // 完整 ID（用于执行）
  toolName: string                      // 显示名称（用于 UI）
  arguments: Record<string, any>
  status: 'pending' | 'executing' | 'completed' | 'failed'
  result?: any
  error?: string
  requiresConfirmation?: boolean
  commandType?: 'read-only' | 'dangerous' | 'forbidden'
  startTime?: number
  endTime?: number
}
```

---

## 多轮对话架构

### 前端状态管理

```typescript
// src/renderer/stores/chat.ts

// Per-session 状态结构（使用 Map 索引）
const sessionMessages = ref<Map<string, ChatMessage[]>>(new Map())
const sessionLoading = ref<Map<string, boolean>>(new Map())
const sessionGenerating = ref<Map<string, boolean>>(new Map())
const sessionError = ref<Map<string, string | null>>(new Map())
const sessionUsageMap = ref<Map<string, TokenUsage>>(new Map())
const activeStreams = ref<Map<string, string>>(new Map())  // sessionId -> messageId
```

### 关键函数

| 函数 | 功能 |
|------|------|
| `getSessionState(sessionId)` | 返回特定会话的响应式状态视图 |
| `loadMessages(sessionId)` | 从后端加载会话消息 |
| `loadSessionUsage(sessionId)` | 加载会话的 Token 使用统计 |
| `sendMessage(sessionId, content, attachments)` | 发送消息并流式获取响应 |
| `handleStreamChunk(chunk)` | 处理流式块 |
| `handleStreamComplete(data)` | 处理流式完成 |

---

## 流式处理

### IPC 通道

```typescript
// src/shared/ipc.ts
STREAM_CHUNK: 'chat:stream-chunk'        // 流式块
STREAM_COMPLETE: 'chat:stream-complete'  // 完成
STREAM_ERROR: 'chat:stream-error'        // 错误
STEP_ADDED: 'chat:step-added'            // 步骤添加
STEP_UPDATED: 'chat:step-updated'        // 步骤更新
SKILL_ACTIVATED: 'chat:skill-activated'  // 技能激活
```

### 前端 IPC Hub

```typescript
// src/renderer/services/ipc-hub.ts
export function initializeIPCHub() {
  const chatStore = useChatStore()

  window.electronAPI.onStreamChunk((chunk) => {
    chatStore.handleStreamChunk(chunk)  // 处理文本/推理/工具调用块
  })

  window.electronAPI.onStreamComplete((data) => {
    chatStore.handleStreamComplete(data)  // 更新 usage，清除生成状态
  })

  window.electronAPI.onStreamError((data) => {
    chatStore.handleStreamError(data)  // 添加错误消息
  })

  window.electronAPI.onStepAdded((data) => {
    chatStore.handleStepAdded(data)  // 步骤跟踪
  })
}
```

### 后端流处理器

```typescript
// src/main/ipc/chat.ts

interface StreamProcessor {
  accumulatedContent: string
  accumulatedReasoning: string
  toolCalls: ToolCall[]

  handleTextChunk(text: string): void
  handleReasoningChunk(reasoning: string): void
  handleToolCallChunk(toolCallData): ToolCall
  finalize(): void
}
```

---

## Provider 交互

### Provider 定义

```typescript
// src/main/providers/types.ts
export interface ProviderDefinition {
  id: string
  info: ProviderInfo
  create: ProviderCreator               // 工厂函数
  requiresSystemMerge?: boolean
}

export interface ProviderInstance {
  createModel(modelId: string): LanguageModel  // Vercel AI SDK
}
```

### 支持的 Provider

| Provider | 文件 | 默认模型 |
|----------|------|---------|
| Claude | `claude.ts` | claude-sonnet-4-20250514 |
| OpenAI | `openai.ts` | gpt-4o |
| DeepSeek | `deepseek.ts` | deepseek-chat |
| Gemini | `gemini.ts` | gemini-pro |
| Kimi | `kimi.ts` | moonshot-v1-8k |
| Zhipu | `zhipu.ts` | glm-4 |
| OpenRouter | `openrouter.ts` | - |
| Claude Code | `claude-code.ts` | - |
| GitHub Copilot | `github-copilot.ts` | - |

### Provider 实现示例

```typescript
// src/main/providers/builtin/claude.ts
const claudeProvider: ProviderDefinition = {
  id: 'claude',
  info: {
    id: 'claude',
    name: 'Claude',
    defaultModel: 'claude-sonnet-4-20250514',
    defaultBaseUrl: 'https://api.anthropic.com/v1',
    icon: 'claude',
    supportsCustomBaseUrl: true,
    requiresApiKey: true,
  },
  create: ({ apiKey, baseUrl }) => {
    const provider = createAnthropic({
      apiKey,
      baseURL: baseUrl || 'https://api.anthropic.com/v1',
    })
    return {
      createModel: (modelId: string) => provider(modelId),
    }
  },
}
```

---

## Tool Loop 流程

### 核心函数

```typescript
// src/main/ipc/chat.ts

// 主执行入口 (line ~2130)
async function handleSendMessageStream()

// 执行流式生成 (line ~1424)
async function executeStreamGeneration()

// 工具循环 (line ~1225)
async function runToolLoop()

// 创建流处理器 (line ~838)
function createStreamProcessor()
```

### Tool Loop 流程图

```
Turn 1: 调用 AI 获取工具调用
  ├─ 接收 text chunks → 累积内容
  ├─ 接收 reasoning chunks → 累积推理
  ├─ 接收 tool-call chunks → 解析工具调用
  ├─ executeToolAndUpdate() 执行每个工具
  │  ├─ 创建 Step 用于 UI 显示
  │  ├─ 检测技能使用（Skill Detection）
  │  ├─ 执行工具: executeToolDirectly()
  │  │  └─ 支持权限确认（requiresConfirmation）
  │  └─ 更新工具状态和结果
  └─ 检查是否需要用户确认
      └─ 如需要，暂停循环

Turn N: AI 继续（如果有工具结果）
  ├─ 添加工具结果消息到对话
  └─ 重复上述步骤，直到：
      - AI 不再调用工具
      - 达到 MAX_TOOL_TURNS (100)
      - 需要用户确认
```

### Tool 执行处理

```typescript
// src/main/ipc/chat.ts (line ~1069)
async function executeToolAndUpdate(
  ctx: StreamContext,
  toolCall: ToolCall,
  toolCallData: { toolName: string; args: Record<string, any> },
  allToolCalls: ToolCall[],
  enabledSkills: SkillDefinition[] = [],
  turnIndex?: number
): Promise<void> {
  // 1. 检测技能使用
  const skillName = detectSkillUsage(toolCallData.toolName, toolCallData.args)

  // 2. 创建步骤用于 UI 显示
  const step = createStep(toolCall, skillName, turnIndex)
  ctx.sender.send(IPC_CHANNELS.STEP_ADDED, { step })

  // 3. 执行工具
  const result = await executeToolDirectly(
    toolCallData.toolName,
    toolCallData.args,
    {
      sessionId: ctx.sessionId,
      messageId: ctx.assistantMessageId,
      toolCallId: toolCall.id,
      workingDirectory: session?.workingDirectory,  // 沙箱
      abortSignal: ctx.abortSignal,
      onMetadata: (update) => {
        // V2 工具元数据流式回调
        ctx.sender.send(IPC_CHANNELS.STEP_UPDATED, { updates })
      },
    }
  )

  // 4. 更新状态
  toolCall.status = result.success ? 'completed' : 'failed'
  toolCall.result = result.data
  toolCall.error = result.error

  // 5. 发送更新到前端
  ctx.sender.send(IPC_CHANNELS.STREAM_CHUNK, {
    type: 'tool_result',
    toolCall,
  })
}
```

---

## 完整流程示例

### 消息发送流程

```
用户输入 "Hello"
  ↓
[前端] InputBox.vue 触发 useChatSession.sendMessage()
  ↓
[Pinia Store] useChatStore.sendMessage(sessionId, "Hello")
  ├─ 创建临时用户消息 {id: "temp-xxx", role: "user", content: "Hello"}
  ├─ 添加到 sessionMessages
  ├─ 设置 sessionLoading = true, sessionGenerating = true
  └─ 调用 IPC: window.electronAPI.sendMessageStream(sessionId, "Hello")
      ↓
[主进程] handleSendMessageStream() (chat.ts)
  ├─ 获取会话信息
  ├─ 验证 Provider 和 Model
  ├─ 构建消息历史:
  │  └─ buildHistoryMessages(): 构建对话历史(含内容部分)
  ├─ 构建系统提示:
  │  └─ buildSystemPrompt()
  │     ├─ 工作区/Agent 系统提示
  │     ├─ 用户档案 (semantic search)
  │     ├─ Agent 内存
  │     └─ 技能提示
  ├─ 创建流处理器 createStreamProcessor()
  ├─ 生成会话标题（第一条消息）
  └─ executeStreamGeneration()
      ├─ 确定 Model 是否支持工具
      ├─ 如支持工具: runToolLoop()
      │  └─ 多轮工具调用循环
      └─ 否则: runSimpleStream()
         └─ 简单流式生成
          ↓
[主进程] 流式响应处理
  ├─ 接收流 chunks → 累积内容
  ├─ 发送 IPC_CHANNELS.STREAM_CHUNK
  │  ├─ type: 'text' → 文本内容
  │  ├─ type: 'reasoning' → 推理过程
  │  ├─ type: 'tool_call' → 工具调用
  │  └─ type: 'tool_result' → 工具结果
  └─ 最后发送 IPC_CHANNELS.STREAM_COMPLETE
     └─ 包含 usage: {inputTokens, outputTokens, totalTokens}
      ↓
[前端] IPC Hub 监听器触发
  ├─ onStreamChunk() → chatStore.handleStreamChunk()
  │  ├─ 查找消息
  │  ├─ 更新 contentParts
  │  ├─ 触发 reactivity
  │  └─ 前端实时显示流式更新
  └─ onStreamComplete() → chatStore.handleStreamComplete()
     ├─ 更新 usage 统计
     ├─ 移除 "waiting" 指示符
     ├─ 保存 contentParts 到后端
     └─ 清除 isStreaming/isGenerating 状态
```

### Provider 数据流

```
executeStreamGeneration()
  ├─ getEffectiveProviderConfig()
  │  └─ 合并会话级配置(优先级高) + 全局配置
  ├─ getApiKeyForProvider()
  │  ├─ 如是 OAuth 提供商: oauthManager.refreshTokenIfNeeded()
  │  └─ 否则: 使用 config 中的 apiKey
  └─ streamChatResponseWithTools()
      ├─ createProvider(providerId, config)
      │  └─ 调用 provider.create({ apiKey, baseUrl })
      │     └─ 创建 LanguageModel 实例 (Vercel AI SDK)
      ├─ 转换消息为 AI SDK 格式:
      │  ├─ 系统消息处理
      │  ├─ 用户消息转换 (multimodal support)
      │  ├─ 助手消息转换 (含 reasoning_content)
      │  └─ 工具结果消息转换
      ├─ 转换工具定义为 Zod schemas
      └─ 调用 model.doStream()
         └─ Vercel AI SDK 处理 API 调用
            ├─ text-delta chunks
            ├─ reasoning-delta chunks
            ├─ tool-call chunks
            └─ finish chunk (usage data)
```

---

## 设计特点

### 流式设计优势
- **低延迟**: 不等待完整响应，实时显示文本
- **用户体验**: 即时反馈，长文本快速呈现
- **Token 追踪**: 每个 chunk 包含 usage 数据

### 工具执行策略
- **自动执行**: 工具默认自动执行（除非需要确认）
- **权限检查**: 危险命令需用户确认
- **沙箱隔离**: 通过 `workingDirectory` 限制文件访问范围
- **最多 100 轮**: 防止无限循环

### 状态管理特点
- **Per-session 状态**: 每个会话独立状态，支持多标签页
- **中央 IPC Hub**: 所有事件路由到单一 store
- **Pinia store**: Reactive 响应式，自动 UI 更新
- **ContentParts 设计**: 支持序列化显示文本和工具调用

### 多轮对话管理
- **历史重建**: `buildHistoryMessages()` 每次都重建完整历史
- **Token 累计**: `sessionUsageMap` 跨多轮累计 token 使用
- **消息修改**: 支持编辑并重新生成（删除后续消息）
- **分支功能**: 可从任意消息创建分支对话

---

## 扩展点

### 新 Provider 集成

1. 创建 `src/main/providers/builtin/newprovider.ts`
2. 实现 `ProviderDefinition` 接口
3. 导出到 `src/main/providers/builtin/index.ts`
4. 自动注册（无需其他修改）

### 新工具集成

1. 实现工具定义 (parameters, execute 函数)
2. 在 `src/main/tools/builtin/` 中注册
3. 添加权限检查（如需）
4. 自动包含在工具列表中
