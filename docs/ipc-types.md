# IPC 类型定义

## 概述

`src/shared/ipc/` 目录包含所有 Electron IPC 通信的类型定义。这些类型在 Main Process 和 Renderer Process 之间共享，确保类型安全的进程间通信。

## 设计理念

1. **模块化**: 按功能域拆分类型文件
2. **类型安全**: 完整的 TypeScript 类型定义
3. **请求/响应配对**: 每个 IPC 调用都有明确的请求和响应类型
4. **向后兼容**: 通过统一导出保持兼容性

## 目录结构

```
src/shared/ipc/
├── index.ts           # 统一导出
├── channels.ts        # IPC 通道常量
├── chat.ts            # 聊天相关类型
├── providers.ts       # AI 提供商类型
├── settings.ts        # 设置类型
├── agents.ts          # Agent 类型
├── agent-memory.ts    # Agent 记忆类型
├── user-profile.ts    # 用户画像类型
├── workspaces.ts      # 工作区类型
├── tools.ts           # 工具类型
├── skills.ts          # Skills 类型
├── mcp.ts             # MCP 协议类型
├── oauth.ts           # OAuth 类型
├── permissions.ts     # 权限类型
└── ui-message.ts      # UIMessage 类型（AI SDK 5.x）
```

## IPC 通道常量

`channels.ts` 定义了所有 IPC 通道名称：

```typescript
export const IPC_CHANNELS = {
  // Chat
  SEND_MESSAGE: 'chat:send-message',
  SEND_MESSAGE_STREAM: 'chat:send-message-stream',
  GET_CHAT_HISTORY: 'chat:get-history',
  ABORT_STREAM: 'chat:abort-stream',

  // Session
  GET_SESSIONS: 'sessions:get-all',
  CREATE_SESSION: 'sessions:create',
  SWITCH_SESSION: 'sessions:switch',
  DELETE_SESSION: 'sessions:delete',

  // Settings
  GET_SETTINGS: 'settings:get',
  SAVE_SETTINGS: 'settings:save',

  // Tools
  GET_TOOLS: 'tools:get-all',
  EXECUTE_TOOL: 'tools:execute',

  // MCP
  MCP_GET_SERVERS: 'mcp:get-servers',
  MCP_CALL_TOOL: 'mcp:call-tool',

  // ... 更多通道
} as const
```

## 核心类型

### Chat 类型 (chat.ts)

```typescript
// 消息内容部分
type ContentPart =
  | { type: 'text'; content: string }
  | { type: 'tool-call'; toolCalls: ToolCall[] }
  | { type: 'waiting' }
  | { type: 'data-steps'; turnIndex: number }

// 消息附件
interface MessageAttachment {
  id: string
  name: string
  mediaType: AttachmentMediaType
  size: number
  data: string  // base64
}

// 聊天消息
interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system' | 'error'
  content: string
  timestamp: number
  attachments?: MessageAttachment[]
  toolCalls?: ToolCall[]
  reasoning?: string
  contentParts?: ContentPart[]
  steps?: Step[]
  usage?: TokenUsage
}

// 聊天会话
interface ChatSession {
  id: string
  name: string
  messages: ChatMessage[]
  createdAt: number
  updatedAt: number
  isPinned?: boolean
  isArchived?: boolean
  workspaceId?: string
  agentId?: string
  lastProvider?: string
  lastModel?: string
  workingDirectory?: string
}
```

### Provider 类型 (providers.ts)

```typescript
// AI 提供商枚举
enum AIProvider {
  OpenAI = 'openai',
  Claude = 'claude',
  DeepSeek = 'deepseek',
  // ...
}

// 提供商配置
interface ProviderConfig {
  id: string
  enabled: boolean
  apiKey: string
  baseUrl?: string
  models: string[]
}

// AI 设置
interface AISettings {
  provider: AIProviderId
  model: string
  temperature: number
  customProviders?: CustomProviderConfig[]
}
```

### Tool 类型 (tools.ts)

```typescript
// 工具参数
interface ToolParameter {
  name: string
  type: 'string' | 'number' | 'boolean' | 'object' | 'array'
  description: string
  required?: boolean
  enum?: string[]
}

// 工具定义
interface ToolDefinition {
  id: string
  name: string
  description: string
  parameters: ToolParameter[]
}

// 工具调用
interface ToolCall {
  id: string
  name: string
  input: Record<string, any>
  output?: any
  status: 'pending' | 'running' | 'completed' | 'error'
  error?: string
}
```

### UIMessage 类型 (ui-message.ts)

AI SDK 5.x 兼容的消息格式：

```typescript
// 工具 UI 状态
type ToolUIState = 'partial-call' | 'call' | 'waiting' | 'result'

// 消息部分类型
type UIMessagePart =
  | TextUIPart
  | ReasoningUIPart
  | FileUIPart
  | ToolUIPart
  | StepsDataUIPart
  | ErrorDataUIPart

// UI 消息
interface UIMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  parts: UIMessagePart[]
  createdAt?: Date
  metadata?: MessageMetadata
}

// 流式数据块
interface UIMessageChunk {
  type: 'part' | 'finish' | 'error'
  sessionId: string
  messageId: string
  // ...
}
```

### Agent 类型 (agents.ts)

```typescript
// Agent 权限
interface AgentPermissions {
  allowedTools: string[]
  disallowedPaths: string[]
  skillPermissions: Record<string, SkillPermission>
}

// Agent 定义
interface Agent {
  id: string
  name: string
  description: string
  avatar: AgentAvatar
  systemPrompt: string
  voice?: AgentVoice
  permissions: AgentPermissions
  createdAt: number
  updatedAt: number
  isPinned?: boolean
}
```

### Settings 类型 (settings.ts)

```typescript
// 主题设置
type ColorTheme = 'blue' | 'purple' | 'green' | 'orange'
type BaseTheme = 'light' | 'dark' | 'system'

// 快捷键
interface KeyboardShortcut {
  key: string
  modifiers: string[]
}

// 应用设置
interface AppSettings {
  general: GeneralSettings
  ai: AISettings
  chat: ChatSettings
  shortcuts: ShortcutSettings
  tools: ToolSettings
  mcp: MCPSettings
  skills: SkillSettings
  embedding: EmbeddingSettings
}
```

## 请求/响应模式

每个 IPC 调用都遵循统一的请求/响应模式：

```typescript
// 请求类型
interface SendMessageRequest {
  sessionId: string
  content: string
  attachments?: MessageAttachment[]
}

// 响应类型
interface SendMessageResponse {
  success: boolean
  error?: string
  errorDetails?: string
  messageId?: string
  userMessage?: ChatMessage
  sessionName?: string
}
```

## 工具状态映射

`tool-state-mapping.ts` 提供工具状态转换工具：

```typescript
// 旧状态到新状态的映射
const LEGACY_TO_UI_STATE: Record<LegacyToolStatus, ToolUIState> = {
  'pending': 'partial-call',
  'running': 'call',
  'waiting_confirm': 'waiting',
  'completed': 'result',
  'error': 'result',
}

// 状态检查工具
isToolInProgress(state: ToolUIState): boolean
isToolFinished(state: ToolUIState): boolean
isToolSuccess(state: ToolUIState): boolean
isToolError(state: ToolUIState): boolean
```

## 类型守卫

`ui-message.ts` 提供类型守卫函数：

```typescript
function isTextUIPart(part: UIMessagePart): part is TextUIPart
function isReasoningUIPart(part: UIMessagePart): part is ReasoningUIPart
function isToolUIPart(part: UIMessagePart): part is ToolUIPart
function isFileUIPart(part: UIMessagePart): part is FileUIPart
function isStepUIPart(part: UIMessagePart): part is StepsDataUIPart
function isErrorUIPart(part: UIMessagePart): part is ErrorDataUIPart
```

## 使用示例

### 在 Main Process 中

```typescript
import { ipcMain } from 'electron'
import { IPC_CHANNELS, SendMessageRequest, SendMessageResponse } from '../../shared/ipc.js'

ipcMain.handle(IPC_CHANNELS.SEND_MESSAGE, async (event, request: SendMessageRequest) => {
  // 处理请求
  const response: SendMessageResponse = {
    success: true,
    messageId: 'xxx',
  }
  return response
})
```

### 在 Renderer Process 中

```typescript
import type { SendMessageResponse, ChatMessage } from '@/shared/ipc'

const response: SendMessageResponse = await window.electronAPI.sendMessage(
  sessionId,
  content,
  attachments
)

if (response.success) {
  const message: ChatMessage = response.userMessage!
}
```

## 版本兼容

- `index.ts` 统一导出所有类型，保持向后兼容
- 旧代码可以继续使用 `import { ... } from '../shared/ipc.js'`
- 新代码可以从具体模块导入以获得更好的 tree-shaking

## 相关文档

- [整体架构](./ARCHITECTURE.md)
- [IPC 处理器](./ipc-handlers.md)
- [Electron IPC](./electron-ipc.md)
