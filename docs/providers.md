# Providers 系统

## 概述

Providers 系统是 0neThing 的 AI 模型调用抽象层，基于 **Vercel AI SDK** 实现。它提供了统一的接口来访问多个 AI 提供商（如 Claude、OpenAI、DeepSeek 等），支持插件式扩展。

## 设计理念

1. **插件化**: 添加新提供商只需创建一个文件并导出
2. **统一接口**: 所有提供商通过相同的 API 调用
3. **类型安全**: 完整的 TypeScript 类型定义
4. **OAuth 支持**: 支持 API Key 和 OAuth 两种认证方式

## 目录结构

```
src/main/providers/
├── index.ts           # 主入口，导出所有 API
├── types.ts           # 类型定义
├── registry.ts        # 提供商注册表
└── builtin/           # 内置提供商
    ├── index.ts       # 导出所有内置提供商
    ├── openai.ts      # OpenAI
    ├── claude.ts      # Claude (Anthropic)
    ├── deepseek.ts    # DeepSeek
    ├── gemini.ts      # Google Gemini
    ├── kimi.ts        # Kimi (Moonshot)
    ├── zhipu.ts       # 智谱 AI
    ├── openrouter.ts  # OpenRouter
    ├── claude-code.ts # Claude Code (OAuth)
    └── github-copilot.ts # GitHub Copilot (OAuth)
```

## 核心概念

### ProviderDefinition

每个提供商需要实现 `ProviderDefinition` 接口：

```typescript
interface ProviderDefinition {
  id: string                    // 唯一标识符
  info: ProviderInfo            // UI 显示信息
  create: ProviderCreator       // 工厂函数
  requiresSystemMerge?: boolean // 是否需要合并 system 消息
}
```

### ProviderInfo

提供商的元数据，用于 UI 展示：

```typescript
interface ProviderInfo {
  id: string
  name: string                   // 显示名称
  description: string            // 描述
  defaultBaseUrl: string         // 默认 API 地址
  defaultModel: string           // 默认模型
  icon: string                   // 图标标识
  supportsCustomBaseUrl: boolean // 是否支持自定义 URL
  requiresApiKey: boolean        // 是否需要 API Key
  requiresOAuth?: boolean        // 是否使用 OAuth
  oauthFlow?: OAuthFlowType      // OAuth 流程类型
}
```

### ProviderInstance

创建后的提供商实例：

```typescript
interface ProviderInstance {
  createModel: (modelId: string) => LanguageModel
}
```

## API 参考

### 查询 API

```typescript
// 获取所有可用提供商
getAvailableProviders(): ProviderInfo[]

// 获取单个提供商信息
getProviderInfo(providerId: string): ProviderInfo | undefined

// 检查提供商是否支持
isProviderSupported(providerId: string): boolean

// 检查是否需要 OAuth
requiresOAuth(providerId: string): boolean
```

### 创建实例

```typescript
// 同步创建（API Key 认证）
createProvider(
  providerId: string,
  config: { apiKey?: string; baseUrl?: string; apiType?: 'openai' | 'anthropic' }
): ProviderInstance

// 异步创建（支持 OAuth）
createProviderAsync(
  providerId: string,
  config: { apiKey?: string; baseUrl?: string; apiType?: 'openai' | 'anthropic' }
): Promise<ProviderInstance>
```

### 聊天 API

```typescript
// 生成响应（非流式）
generateChatResponse(
  providerId: string,
  config: { apiKey: string; baseUrl?: string; model: string },
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
  options?: { temperature?: number; maxTokens?: number }
): Promise<string>

// 流式响应
streamChatResponse(
  providerId: string,
  config: { apiKey: string; baseUrl?: string; model: string },
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
  options?: { temperature?: number; maxTokens?: number }
): AsyncGenerator<{ text: string; reasoning?: string }>

// 带工具的流式响应
streamChatResponseWithTools(
  providerId: string,
  config: ProviderConfig,
  messages: ToolChatMessage[],
  tools: Record<string, ToolDefinition>,
  options?: { temperature?: number; maxTokens?: number; abortSignal?: AbortSignal }
): AsyncGenerator<StreamChunkWithTools>
```

## 内置提供商

| ID | 名称 | 认证方式 | 特殊说明 |
|----|------|----------|----------|
| `openai` | OpenAI | API Key | 标准 OpenAI API |
| `claude` | Claude | API Key | Anthropic API |
| `deepseek` | DeepSeek | API Key | 支持 Reasoning 模型 |
| `gemini` | Gemini | API Key | Google AI |
| `kimi` | Kimi | API Key | Moonshot AI |
| `zhipu` | 智谱 | API Key | 需要 system merge |
| `openrouter` | OpenRouter | API Key | 多模型路由 |
| `claude-code` | Claude Code | OAuth | PKCE 流程 |
| `github-copilot` | GitHub Copilot | OAuth | Device 流程 |

## 添加新提供商

### 步骤 1: 创建提供商文件

在 `src/main/providers/builtin/` 创建新文件，例如 `my-provider.ts`：

```typescript
import { createOpenAI } from '@ai-sdk/openai'
import type { ProviderDefinition } from '../types.js'

const myProvider: ProviderDefinition = {
  id: 'my-provider',

  info: {
    id: 'my-provider',
    name: 'My Provider',
    description: 'My custom AI provider',
    defaultBaseUrl: 'https://api.myprovider.com/v1',
    defaultModel: 'my-model',
    icon: 'my-provider',
    supportsCustomBaseUrl: true,
    requiresApiKey: true,
  },

  create: ({ apiKey, baseUrl }) => {
    const provider = createOpenAI({
      apiKey,
      baseURL: baseUrl || 'https://api.myprovider.com/v1',
    })
    return {
      createModel: (modelId: string) => provider.chat(modelId),
    }
  },
}

export default myProvider
```

### 步骤 2: 导出提供商

在 `src/main/providers/builtin/index.ts` 中添加：

```typescript
import myProvider from './my-provider.js'

export const builtinProviders: ProviderDefinition[] = [
  // ... 其他提供商
  myProvider,
]
```

### 步骤 3: 添加图标（可选）

在前端 `ProviderIcon.vue` 组件中添加对应的图标。

## 自定义提供商

用户可以通过 UI 添加自定义 OpenAI 兼容的提供商。自定义提供商的 ID 以 `custom-` 开头：

```typescript
// 自定义提供商会自动使用 OpenAI 或 Anthropic SDK
createProvider('custom-my-api', {
  apiKey: 'xxx',
  baseUrl: 'https://my-api.com/v1',
  apiType: 'openai'  // 或 'anthropic'
})
```

## Reasoning 模型支持

系统自动检测 Reasoning 模型（如 DeepSeek Reasoner、OpenAI o1）：

```typescript
// 自动禁用 temperature（reasoning 模型不支持）
const isReasoning = isReasoningModel(config.model, providerId)
if (!isReasoning) {
  options.temperature = 0.7
}
```

Reasoning 内容通过 `reasoning` 字段返回：

```typescript
for await (const chunk of streamChatResponseWithReasoning(...)) {
  if (chunk.type === 'text') {
    console.log('Text:', chunk.text)
    console.log('Reasoning:', chunk.reasoning)
  }
}
```

## 错误处理

Provider 层会将 AI SDK 错误转换为标准错误格式：

```typescript
try {
  const response = await generateChatResponse(...)
} catch (error) {
  // error.message: 错误描述
  // error.code: 错误代码（如 'rate_limit_exceeded'）
  // error.data: 原始错误数据
}
```

## 依赖关系

```
providers/
    ├── 依赖 → @ai-sdk/openai, @ai-sdk/anthropic, @ai-sdk/google, etc.
    ├── 依赖 → services/auth/oauth-manager (OAuth 认证)
    └── 依赖 → services/ai/model-registry (模型能力查询)
```

## 相关文档

- [整体架构](./ARCHITECTURE.md)
- [Chat 架构](./architecture-chat.md)
- [IPC 处理器](./ipc-handlers.md)
