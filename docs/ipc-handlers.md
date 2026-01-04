# IPC 处理器

## 概述

`src/main/ipc/` 目录包含所有 Electron IPC 处理器的实现。这些处理器接收来自 Renderer Process 的请求，执行相应的业务逻辑，并返回响应。

## 设计理念

1. **模块化**: 按功能域拆分处理器文件
2. **统一注册**: 通过 `handlers.ts` 统一初始化
3. **错误处理**: 统一的错误处理和响应格式
4. **异步优先**: 所有处理器都是异步的

## 目录结构

```
src/main/ipc/
├── handlers.ts        # 统一注册入口
├── chat.ts            # 聊天处理器（核心）
├── chat/              # 聊天辅助模块
│   ├── tool-loop.ts   # 工具循环
│   ├── tool-execution.ts
│   ├── stream-processor.ts
│   ├── message-helpers.ts
│   ├── memory-helpers.ts
│   └── provider-helpers.ts
├── sessions.ts        # 会话管理
├── settings.ts        # 设置管理
├── models.ts          # 模型管理
├── providers.ts       # 提供商查询
├── tools.ts           # 工具管理
├── mcp.ts             # MCP 协议
├── skills.ts          # Skills 管理
├── agents.ts          # Agent 管理
├── agent-memory.ts    # Agent 记忆
├── user-profile.ts    # 用户画像
├── workspaces.ts      # 工作区管理
├── oauth.ts           # OAuth 认证
├── permission.ts      # 权限管理
├── media.ts           # 媒体处理
└── shell.ts           # Shell 操作
```

## 初始化

所有处理器通过 `handlers.ts` 统一注册：

```typescript
// src/main/ipc/handlers.ts
export function initializeIPC() {
  registerChatHandlers()
  registerSessionHandlers()
  registerSettingsHandlers()
  registerModelsHandlers()
  registerProvidersHandlers()
  registerToolHandlers()
  registerMCPHandlers()
  registerSkillHandlers()
  registerWorkspaceHandlers()
  registerAgentHandlers()
  registerUserProfileHandlers()
  registerAgentMemoryHandlers()
  registerShellHandlers()
  registerMediaHandlers()
  registerPermissionHandlers()
  registerOAuthHandlers()
}

// 在应用启动时调用
initializeIPC()
```

## 处理器详解

### chat.ts - 聊天处理器

最核心的处理器，处理消息发送和流式响应：

```typescript
// 主要通道
IPC_CHANNELS.SEND_MESSAGE_STREAM      // 流式发送消息
IPC_CHANNELS.EDIT_AND_RESEND_STREAM   // 编辑并重发
IPC_CHANNELS.ABORT_STREAM             // 中止流
IPC_CHANNELS.GENERATE_TITLE           // 生成标题
```

**流式消息流程:**

```
1. 接收用户消息
2. 构建上下文（记忆、用户画像、system prompt）
3. 调用 Provider 的流式 API
4. 处理流式响应（文本、reasoning、tool calls）
5. 工具循环（如果有 tool calls）
6. 发送完成事件
7. 触发后处理（记忆提取等）
```

**辅助模块:**

- `tool-loop.ts`: 处理工具调用循环
- `stream-processor.ts`: 处理流式数据
- `message-helpers.ts`: 消息格式转换
- `memory-helpers.ts`: 记忆检索和注入
- `provider-helpers.ts`: 提供商配置获取

### sessions.ts - 会话管理

```typescript
// 通道
IPC_CHANNELS.GET_SESSIONS       // 获取所有会话
IPC_CHANNELS.CREATE_SESSION     // 创建会话
IPC_CHANNELS.SWITCH_SESSION     // 切换会话
IPC_CHANNELS.DELETE_SESSION     // 删除会话
IPC_CHANNELS.RENAME_SESSION     // 重命名会话
IPC_CHANNELS.CREATE_BRANCH      // 创建分支
IPC_CHANNELS.UPDATE_SESSION_PIN // 固定/取消固定
```

### settings.ts - 设置管理

```typescript
// 通道
IPC_CHANNELS.GET_SETTINGS       // 获取设置
IPC_CHANNELS.SAVE_SETTINGS      // 保存设置
IPC_CHANNELS.SETTINGS_CHANGED   // 设置变更通知（事件）
```

### models.ts - 模型管理

```typescript
// 通道
IPC_CHANNELS.FETCH_MODELS               // 获取模型列表
IPC_CHANNELS.GET_CACHED_MODELS          // 获取缓存的模型
IPC_CHANNELS.GET_MODELS_WITH_CAPABILITIES // 获取带能力信息的模型
IPC_CHANNELS.GET_EMBEDDING_MODELS       // 获取嵌入模型
```

### tools.ts - 工具管理

```typescript
// 通道
IPC_CHANNELS.GET_TOOLS         // 获取所有工具
IPC_CHANNELS.EXECUTE_TOOL      // 执行工具
IPC_CHANNELS.CANCEL_TOOL       // 取消工具执行
```

### mcp.ts - MCP 协议

```typescript
// 通道
IPC_CHANNELS.MCP_GET_SERVERS       // 获取服务器列表
IPC_CHANNELS.MCP_ADD_SERVER        // 添加服务器
IPC_CHANNELS.MCP_REMOVE_SERVER     // 删除服务器
IPC_CHANNELS.MCP_CONNECT_SERVER    // 连接服务器
IPC_CHANNELS.MCP_CALL_TOOL         // 调用 MCP 工具
IPC_CHANNELS.MCP_GET_RESOURCES     // 获取资源
IPC_CHANNELS.MCP_GET_PROMPTS       // 获取提示词
```

### skills.ts - Skills 管理

```typescript
// 通道
IPC_CHANNELS.SKILLS_GET_ALL        // 获取所有 Skills
IPC_CHANNELS.SKILLS_REFRESH        // 刷新 Skills
IPC_CHANNELS.SKILLS_CREATE         // 创建 Skill
IPC_CHANNELS.SKILLS_DELETE         // 删除 Skill
IPC_CHANNELS.SKILLS_TOGGLE_ENABLED // 启用/禁用 Skill
```

### agents.ts - Agent 管理

```typescript
// 通道
IPC_CHANNELS.AGENT_GET_ALL         // 获取所有 Agents
IPC_CHANNELS.AGENT_CREATE          // 创建 Agent
IPC_CHANNELS.AGENT_UPDATE          // 更新 Agent
IPC_CHANNELS.AGENT_DELETE          // 删除 Agent
IPC_CHANNELS.AGENT_UPLOAD_AVATAR   // 上传头像
```

### oauth.ts - OAuth 认证

```typescript
// 通道
IPC_CHANNELS.OAUTH_START           // 开始 OAuth 流程
IPC_CHANNELS.OAUTH_STATUS          // 查询认证状态
IPC_CHANNELS.OAUTH_LOGOUT          // 登出
IPC_CHANNELS.OAUTH_DEVICE_POLL     // 设备码轮询
```

## 处理器模式

### 标准处理器模式

```typescript
import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc.js'

export function registerMyHandlers() {
  // 请求-响应模式
  ipcMain.handle(IPC_CHANNELS.MY_CHANNEL, async (event, arg1, arg2) => {
    try {
      // 业务逻辑
      const result = await doSomething(arg1, arg2)

      return {
        success: true,
        data: result,
      }
    } catch (error) {
      console.error('Error:', error)
      return {
        success: false,
        error: error.message,
      }
    }
  })
}
```

### 事件发送模式

```typescript
import { BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc.js'

// 向渲染进程发送事件
function sendToRenderer(channel: string, data: any) {
  const windows = BrowserWindow.getAllWindows()
  for (const win of windows) {
    win.webContents.send(channel, data)
  }
}

// 在处理过程中发送流式数据
sendToRenderer(IPC_CHANNELS.STREAM_CHUNK, {
  sessionId,
  messageId,
  type: 'text',
  content: chunk,
})
```

### 流式处理模式

```typescript
// chat.ts 中的流式处理
async function handleStreamMessage(event, sessionId, content) {
  const messageId = generateId()

  // 初始响应
  sendToRenderer(IPC_CHANNELS.STREAM_CHUNK, {
    type: 'start',
    sessionId,
    messageId,
  })

  // 流式生成
  for await (const chunk of streamResponse(...)) {
    sendToRenderer(IPC_CHANNELS.STREAM_CHUNK, {
      type: 'text',
      sessionId,
      messageId,
      content: chunk.text,
    })
  }

  // 完成
  sendToRenderer(IPC_CHANNELS.STREAM_COMPLETE, {
    sessionId,
    messageId,
  })

  return { success: true, messageId }
}
```

## 错误处理

所有处理器都遵循统一的错误处理模式：

```typescript
// 标准响应格式
interface IPCResponse<T = any> {
  success: boolean
  data?: T
  error?: string
  errorDetails?: string  // 详细错误信息（如 API 错误响应）
}

// 错误处理
try {
  // 业务逻辑
} catch (error) {
  console.error('[Handler] Error:', error)

  // 区分错误类型
  if (error.code === 'RATE_LIMIT') {
    return { success: false, error: 'Rate limit exceeded' }
  }

  return {
    success: false,
    error: error.message || 'Unknown error',
    errorDetails: error.stack,
  }
}
```

## 事件通道

除了请求-响应通道，还有一些纯事件通道：

```typescript
// 流式事件
IPC_CHANNELS.STREAM_CHUNK           // 流式数据块
IPC_CHANNELS.STREAM_COMPLETE        // 流完成
IPC_CHANNELS.STREAM_ERROR           // 流错误

// 状态变更事件
IPC_CHANNELS.SETTINGS_CHANGED       // 设置变更
IPC_CHANNELS.SYSTEM_THEME_CHANGED   // 系统主题变更
IPC_CHANNELS.OAUTH_TOKEN_REFRESHED  // Token 刷新
IPC_CHANNELS.OAUTH_TOKEN_EXPIRED    // Token 过期

// 权限事件
IPC_CHANNELS.PERMISSION_REQUEST     // 权限请求
```

## 依赖关系

```
ipc/handlers
    ├── 依赖 → providers/ (AI 调用)
    ├── 依赖 → storage/ (数据持久化)
    ├── 依赖 → stores/ (状态管理)
    ├── 依赖 → services/ (业务逻辑)
    ├── 依赖 → tools/ (工具执行)
    ├── 依赖 → mcp/ (MCP 协议)
    └── 依赖 → skills/ (Skills 加载)
```

## 调试技巧

### 日志

所有处理器都有详细的日志输出：

```typescript
console.log('[Chat] Sending message:', sessionId, content.slice(0, 50))
console.log('[Chat] Stream chunk:', chunk.type)
console.error('[Chat] Error:', error)
```

### 开发者工具

在开发模式下，可以在渲染进程的开发者工具中查看 IPC 调用：

```javascript
// 在 Console 中
window.electronAPI.getSettings().then(console.log)
```

## 相关文档

- [整体架构](./ARCHITECTURE.md)
- [IPC 类型定义](./ipc-types.md)
- [Chat 架构](./architecture-chat.md)
- [Tools 架构](./architecture-tools.md)
- [MCP 架构](./architecture-mcp.md)
