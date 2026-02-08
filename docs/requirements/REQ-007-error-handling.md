# REQ-007: 统一错误处理

> 状态: 已分析 | 创建: 2026-02-08 | 更新: 2026-02-08 | PM: Qiqi

## 1. 背景

项目后端有 **759 个 try 语句、367 个 catch 块**，其中 IPC 层有 142 个 catch。错误处理方式不统一，用户经常看到原始技术错误信息（如 `ECONNREFUSED`、`context_length_exceeded`）。没有全局错误分类、没有结构化日志、没有重试机制。

## 2. 现状问题

### 2.1 统计概览

| 指标 | 数量 |
|------|------|
| 后端 `try` 语句 | 759 |
| 后端 `catch` 块 | 367 |
| IPC handler 中的 `catch` | 142 |
| IPC chat 模块中的 `catch` | 20 |
| `console.error` 调用（IPC 层） | ~100+ |

### 2.2 IPC 错误返回格式不一致

当前有 3 种 pattern 并存：

**Pattern A — 直接暴露 error.message**（大多数 handler）:
```typescript
// src/main/ipc/workspaces.ts:23
catch (error: any) {
  return { success: false, error: error.message || 'Failed to create workspace' }
}
```

**Pattern B — instanceof 检查**（OAuth 相关）:
```typescript
// src/main/ipc/oauth.ts:185
catch (error) {
  return { success: false, error: error instanceof Error ? error.message : 'OAuth start failed' }
}
```

**Pattern C — 无 catch**:
- 部分 handler 没有 try/catch，异常直接抛到 Electron IPC 层
- Electron 会返回 `"An object could not be cloned"` 或静默失败

### 2.3 流式 vs 请求-响应错误处理割裂

| 模式 | 实现方式 | 前端处理 |
|------|----------|----------|
| 请求-响应 | 返回 `{ success: false, error: "..." }` | 前端手动检查 `if (!result.success)` |
| 流式 | 通过 `onStreamError` 事件 | 自动创建 `role: 'error'` 消息 |

两条路径的错误展示体验不一致。

### 2.4 前端错误展示方式混乱

| 方式 | 位置 | 场景 |
|------|------|------|
| 内联错误消息 | `MessageItem.vue:18` (`role === 'error'`) | 流式聊天错误 |
| errorDetails 折叠 | `MessageItem.vue:82` | 详细错误 |
| Toast 通知 | `SettingsFooter.vue:54`, `GitStatusPanel.vue:709` | 设置/Git 操作 |
| 内联 .error-message | 6+ 处设置面板 | 表单验证 |
| ErrorDataUIPart | `ui-message.ts:115` | UIMessage 格式错误 |
| sessionError Map | `chat.ts:91-95` | 每 session 错误状态 |

### 2.5 用户可见的不友好信息示例

| 用户看到的 | 实际含义 |
|-----------|----------|
| `Request failed with status code 429` | API 限流，请稍后再试 |
| `ECONNREFUSED 127.0.0.1:11434` | Ollama 未启动 |
| `Unexpected token < in JSON at position 0` | 代理服务器返回了 HTML 而非 JSON |
| `context_length_exceeded` | 对话太长，需要清理上下文 |
| `insufficient_quota` | OpenAI 余额不足 |
| `Failed to fetch` | 网络断开 |
| `An object could not be cloned` | Electron IPC 序列化失败（内部错误） |

### 2.6 缺失能力

- ❌ 无全局错误边界 / 中间件
- ❌ 无错误分类（网络 vs 认证 vs 业务）
- ❌ 无重试机制（流式错误后无重试按钮、网络断开无重连提示）
- ❌ 无结构化日志（仅 `console.error()`）

## 3. 重构方案

### 3.1 创建错误分类系统

**新建** `src/shared/errors.ts`:

```typescript
enum ErrorCategory {
  NETWORK = 'network',       // 网络/连接问题 (ECONNREFUSED, ETIMEDOUT, Failed to fetch)
  AUTH = 'auth',              // 认证/密钥问题 (401, invalid_api_key)
  QUOTA = 'quota',            // 配额/限制 (429, insufficient_quota)
  CONTEXT = 'context',        // 上下文长度 (context_length_exceeded)
  PROVIDER = 'provider',      // Provider 特定错误 (模型不存在等)
  VALIDATION = 'validation',  // 输入验证错误
  INTERNAL = 'internal',      // 内部错误 (不应暴露给用户)
}

interface AppError {
  category: ErrorCategory
  message: string           // 用户友好的消息
  technicalDetail?: string  // 原始错误信息（调试用）
  retryable: boolean        // 是否可重试
  statusCode?: number       // HTTP 状态码（如有）
}
```

### 3.2 错误消息映射表

```typescript
// src/shared/error-messages.ts
const ERROR_PATTERNS: Array<{ pattern: RegExp; category: ErrorCategory; userMessage: string }> = [
  { pattern: /ECONNREFUSED.*11434/, category: 'network', userMessage: 'Ollama 服务未启动，请先启动 Ollama' },
  { pattern: /429|rate.?limit/i, category: 'quota', userMessage: '请求太频繁，请稍后再试' },
  { pattern: /insufficient_quota/i, category: 'quota', userMessage: 'API 余额不足，请检查账户' },
  { pattern: /context_length_exceeded/i, category: 'context', userMessage: '对话太长，建议新建对话或清理历史' },
  { pattern: /401|invalid.*key|unauthorized/i, category: 'auth', userMessage: 'API 密钥无效，请在设置中检查' },
  { pattern: /Failed to fetch|ETIMEDOUT|ENOTFOUND/i, category: 'network', userMessage: '网络连接失败，请检查网络' },
  // ...更多模式
]
```

### 3.3 统一 IPC 错误中间件

```typescript
// src/main/ipc/error-wrapper.ts
function wrapIPCHandler<T>(handler: (...args: any[]) => Promise<T>) {
  return async (...args: any[]) => {
    try {
      return await handler(...args)
    } catch (error) {
      const appError = classifyError(error)
      console.error(`[${appError.category}] ${appError.technicalDetail}`)
      return { success: false, error: appError.message, errorDetails: appError.technicalDetail, category: appError.category, retryable: appError.retryable }
    }
  }
}
```

### 3.4 IPC 错误返回格式标准化

```typescript
// 所有 IPC handler 统一返回格式
interface IPCResponse<T = any> {
  success: boolean
  data?: T
  error?: string           // 用户友好消息
  errorDetails?: string    // 技术细节（仅开发模式展示）
  errorCategory?: ErrorCategory
  retryable?: boolean
}
```

### 3.5 前端错误展示规范

| 错误来源 | 展示方式 | 组件 |
|----------|----------|------|
| 流式聊天错误 | 内联消息 + 重试按钮（retryable=true 时） | `ErrorMessage.vue` |
| 设置操作失败 | Toast 通知 | 统一 Toast 组件 |
| 网络断开 | 顶部 Banner | `NetworkStatus.vue` |
| 表单验证 | 内联字段错误 | 保持现状 |

### 3.6 重试机制

- 流式错误消息增加「重试」按钮（当 `retryable: true`）
- 限流错误（429）根据 `Retry-After` header 自动等待
- 网络错误显示重连状态指示器

## 4. 渐进式迁移计划

### Phase 1: 基础设施（~2h）
- 创建 `src/shared/errors.ts`（错误分类 + AppError 类型）
- 创建 `src/shared/error-messages.ts`（错误模式匹配表）
- 创建 `src/main/ipc/error-wrapper.ts`（IPC 中间件）

### Phase 2: IPC chat 模块迁移（~2h）
- 将 `src/main/ipc/chat/` 的 20 个 catch 块迁移到 `wrapIPCHandler`
- 这是用户最常遇到错误的路径，优先处理

### Phase 3: 其余 IPC 模块迁移（~3h）
- 将剩余 122 个 IPC catch 块逐模块迁移
- `ipc/workspaces.ts`、`ipc/oauth.ts`、`ipc/settings.ts` 等

### Phase 4: 前端错误展示统一（~2h）
- 创建 `ErrorMessage.vue` 组件（含重试按钮）
- 统一 Toast 通知样式
- 替代 `role: 'error'`（配合 REQ-005）

## 5. 验收标准

1. [ ] `src/shared/errors.ts` 定义了 ErrorCategory 和 AppError 接口
2. [ ] IPC chat 模块的 20 个 catch 块使用 `wrapIPCHandler` 或 `classifyError`
3. [ ] 用户不再看到原始技术错误（如 `ECONNREFUSED`、`context_length_exceeded`）
4. [ ] 限流错误（429）显示友好提示且标记为 retryable
5. [ ] 流式错误消息有重试按钮
6. [ ] IPC 返回格式统一包含 `errorCategory` 和 `retryable` 字段

## 6. 风险与缓解

| 风险 | 级别 | 缓解措施 |
|------|------|----------|
| 错误模式匹配遗漏，显示 fallback 消息 | **中** | fallback 消息设为 "操作失败，请重试"；持续补充模式 |
| wrapIPCHandler 改变返回值结构 | **中** | 前端统一检查 `success` 字段，与现有 pattern 兼容 |
| 142 个 catch 块迁移工作量大 | **低** | 分阶段迁移，先 chat 模块，其余渐进 |
| 过度吞没错误信息影响调试 | **低** | `errorDetails` 保留原始信息；开发模式下完整展示 |

## 7. 预估

总计 ~9h，建议 Phase 1-2 作为一个 PR（核心能力 + 最重要路径），Phase 3-4 后续跟进。

**优先级**: P1 — 可独立于 REQ-005 和 REQ-006 进行。
