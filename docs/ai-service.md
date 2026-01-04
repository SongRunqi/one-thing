# AI 服务 (AI Service)

## 概述

AI 服务提供模型信息查询和 Token 计算功能，主要包括：
- **Model Registry**：从 Models.dev API 获取模型元数据
- **Token Counter**：消息 Token 估算

## 目录结构

```
src/main/services/ai/
├── index.ts           # 统一导出
├── model-registry.ts  # 模型注册表
└── token-counter.ts   # Token 计数器
```

## Model Registry

### 数据源

使用 [Models.dev](https://models.dev) API 作为模型元数据来源：

```
https://models.dev/api.json
```

Models.dev 提供以下模型信息：
- 模型 ID 和名称
- 上下文长度限制
- 输入/输出模态（text, image, audio）
- 能力标志（tool_call, reasoning, attachment）
- 定价信息

### 缓存策略

```typescript
interface ModelCache {
  models: Map<string, OpenRouterModel[]>  // provider -> models
  allModels: OpenRouterModel[]
  modelsDevData: ModelsDevResponse | null  // 原始数据用于能力查询
  lastFetched: number
}

// 缓存永不过期，仅手动刷新
const CACHE_TTL = Infinity
```

### Provider 映射

```typescript
const PROVIDER_MAPPING: Record<string, string> = {
  'openai': 'openai',
  'anthropic': 'claude',
  'google': 'gemini',
  'deepseek': 'deepseek',
  'mistral': 'mistral',
  'meta': 'llama',
  'cohere': 'cohere',
  'qwen': 'qwen',
  'zhipuai': 'zhipu',
  'moonshotai': 'kimi',
  'xai': 'grok',
}
```

### API 参考

#### 模型查询

```typescript
// 获取指定 Provider 的模型列表
async function getModelsForProvider(providerId: string): Promise<OpenRouterModel[]>

// 获取所有模型
async function getAllModels(): Promise<OpenRouterModel[]>

// 搜索模型
async function searchModels(query: string, providerId?: string): Promise<OpenRouterModel[]>

// 根据 ID 获取模型
async function getModelById(modelId: string): Promise<OpenRouterModel | undefined>
```

#### 能力检测

```typescript
// 检测模型是否支持工具调用
async function modelSupportsTools(modelId: string, providerId?: string): Promise<boolean>

// 检测模型是否为推理模型（如 DeepSeek-R1, o1, o3）
async function modelSupportsReasoning(modelId: string, providerId?: string): Promise<boolean>

// 同步版本（用于流式处理）
function modelSupportsReasoningSync(modelId: string, providerId?: string): boolean

// 检测模型是否支持图像生成
async function modelSupportsImageGeneration(modelId: string, providerId?: string): Promise<boolean>
```

#### Embedding 模型

```typescript
interface EmbeddingModelInfo {
  id: string
  name: string
  dimension: number        // 向量维度
  isConfigurable: boolean  // 是否可配置维度
  providerId: string
}

// 获取指定 Provider 的 Embedding 模型
async function getEmbeddingModelsForProvider(providerId: string): Promise<EmbeddingModelInfo[]>

// 获取所有 Embedding 模型
async function getAllEmbeddingModels(): Promise<EmbeddingModelInfo[]>

// 获取模型维度
async function getEmbeddingDimension(modelId: string): Promise<number | null>
```

#### 缓存管理

```typescript
// 强制刷新缓存
async function forceRefresh(): Promise<void>

// 获取缓存状态
function getCacheStatus(): {
  lastFetched: number
  modelCount: number
  isStale: boolean
}
```

### 模型能力检测流程

```
modelSupportsTools(modelId)
        │
        ▼
┌───────────────────────┐
│ 查找 Models.dev 数据   │
│ (优先使用 providerId)  │
└───────────┬───────────┘
            │
    ┌───────┴───────┐
    │               │
  找到            未找到
    │               │
    ▼               ▼
返回 tool_call   检查 supported_parameters
    值                  │
                  ┌─────┴─────┐
                  │           │
               有 tools     无
                  │           │
                  ▼           ▼
               返回 true   名称模式匹配
                              │
                        ┌─────┴─────┐
                        │           │
                    匹配 no-tool   默认
                        │           │
                        ▼           ▼
                     false       true
```

### 模型名称别名

支持为模型配置友好名称：

```typescript
const MODEL_NAME_ALIASES: Record<string, string> = {
  'gemini-2.5-flash-image': 'Nano-Banana',
  'gemini-2.5-flash-image-preview': 'Nano-Banana Preview',
}

// 获取显示名称
function getModelDisplayName(modelId: string): string
```

## Token Counter

### Token 估算

由于不同模型使用不同的 tokenizer，这里使用简单的估算规则：

```typescript
// 估算单段文本的 Token 数
function estimateTokens(text: string): number {
  // 英文：约 4 字符 = 1 token
  // 中文：约 2 字符 = 1 token
  const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length
  const otherChars = text.length - chineseChars
  return Math.ceil(chineseChars / 2 + otherChars / 4)
}
```

### 消息 Token 计算

```typescript
interface MessageTokens {
  inputTokens: number   // 上下文 tokens
  outputTokens: number  // 预估输出 tokens
}

// 计算单条消息的 Token
function calculateMessageTokens(message: ChatMessage): MessageTokens

// 计算整个会话的 Token
function calculateSessionTokens(messages: ChatMessage[]): {
  totalInputTokens: number
  totalOutputTokens: number
  messageCount: number
}

// 计算指定消息之后的消息数量
function countMessagesAfter(messages: ChatMessage[], messageId: string): number
```

### 使用示例

```typescript
import { estimateTokens, calculateSessionTokens } from './services/ai'

// 估算单段文本
const tokens = estimateTokens('Hello, 你好世界！')
// 约 7 tokens (Hello, = 2, 你好世界！= 5)

// 计算会话 Token
const sessionTokens = calculateSessionTokens(session.messages)
console.log(`总输入: ${sessionTokens.totalInputTokens}`)
console.log(`总输出: ${sessionTokens.totalOutputTokens}`)
```

## 数据结构

### OpenRouterModel

```typescript
interface OpenRouterModel {
  id: string
  name: string
  description?: string
  context_length: number
  architecture: {
    modality: 'text' | 'multimodal'
    input_modalities: string[]   // ['text', 'image']
    output_modalities: string[]  // ['text', 'image']
    tokenizer: string
  }
  pricing: {
    prompt: string      // 每百万 token 价格
    completion: string
    request: string
    image: string
  }
  top_provider: {
    context_length: number
    max_completion_tokens: number
    is_moderated: boolean
  }
  supported_parameters?: string[]  // ['temperature', 'tools', 'reasoning']
}
```

## 性能优化

### 1. 懒加载

模型数据在首次请求时加载，不阻塞应用启动。

### 2. 缓存共享

所有模型查询共享同一个缓存实例，避免重复请求。

### 3. 同步接口

对于流式处理等场景，提供同步接口（如 `modelSupportsReasoningSync`），使用已有缓存数据。

## 相关文档

- [Providers 系统](./providers.md) - AI Provider 实现
- [Memory Service](./memory-service.md) - Embedding 模型使用
