# 当前系统 Tool System 实现

## 架构概述

当前系统 (start-electron) 的 Tool 系统采用 **双注册机制**，同时支持 Legacy 和 V2 两种工具格式。

## 核心文件

| 文件 | 说明 |
|------|------|
| `src/main/tools/core/tool.ts` | Tool.define() 核心定义 |
| `src/main/tools/core/replacers.ts` | 9 种替换策略 |
| `src/main/tools/core/sandbox.ts` | Sandbox 边界检查 |
| `src/main/tools/registry.ts` | 工具注册与执行 |
| `src/main/tools/builtin/*.ts` | 内置工具实现 |

---

## Tool 定义模式

### Tool.define() 接口

```typescript
// 文件: src/main/tools/core/tool.ts

export namespace Tool {
  export interface Info<P extends z.ZodType, M extends Metadata> {
    id: string                    // 唯一工具标识符
    name: string                  // 人类可读名称
    description: string           // LLM 描述
    category: 'builtin' | 'custom' | 'mcp'
    parameters: P                 // Zod 参数 schema
    enabled?: boolean             // 是否启用
    autoExecute?: boolean         // 是否可自动执行
    execute(args: z.infer<P>, ctx: Context<M>): Promise<Result<M>>
    formatValidationError?(error: z.ZodError): string
  }
}
```

### 执行上下文

```typescript
export interface ToolContext<M extends ToolMetadata> {
  sessionId: string           // 会话标识符
  messageId: string           // 消息标识符
  workingDirectory?: string   // Sandbox 边界 (Session 级)
  abortSignal?: AbortSignal   // 取消信号
  metadata(input: { title?: string; metadata?: Partial<M> }): void
}
```

### 执行结果

```typescript
export interface ToolResult<M extends ToolMetadata> {
  title: string                // 执行标题
  output: string               // 主要输出 (给 LLM)
  metadata: M                  // UI 元数据
  attachments?: Array<{        // 可选附件
    type: 'file' | 'image'
    path: string
    content?: string
  }>
}
```

---

## 工具注册机制

### 双注册表

```typescript
// 文件: src/main/tools/registry.ts

// Legacy 工具 (definition + handler)
const toolRegistry: Map<string, RegisteredTool> = new Map()

// V2 工具 (Tool.define())
const toolRegistryV2: Map<string, ToolInfo> = new Map()
```

### 注册 API

```typescript
// Legacy 注册
registerTool(definition: ToolDefinition, handler: ToolHandler): void

// V2 注册
registerToolV2<T extends ToolInfo>(tool: T): void
```

### 初始化流程

```typescript
export async function initializeToolRegistry(): Promise<void> {
  // 1. 导入 Legacy 内置工具
  const { registerBuiltinTools } = await import('./builtin/index.js')
  registerBuiltinTools()

  // 2. 导入 V2 内置工具
  const { registerBuiltinToolsV2 } = await import('./builtin/index.js')
  registerBuiltinToolsV2()
}
```

---

## 工具执行流程

### 完整执行序列

```
1. chat.ts:executeToolAndUpdate
   - 从 session 获取 workingDirectory
   ↓
2. registry.ts:executeTool(toolId, args, context)
   ↓
3. 查找工具 (先 Legacy, 后 V2)
   ↓
4. Zod 参数验证
   - 失败: 返回 formatValidationError() 或默认错误
   ↓
5. 创建 V2 Context
   {
     sessionId, messageId, workingDirectory,
     abortSignal, metadata: (update) => {...}
   }
   ↓
6. 工具执行 v2Tool.execute(args, ctx)
   - checkFileAccess() 边界检查
   - ctx.metadata() 实时更新 UI
   ↓
7. 结果转换为统一格式
   {
     success: true,
     data: { title, output, metadata, attachments }
   }
```

### 执行上下文传递

```typescript
// chat.ts:executeToolAndUpdate (line 852-863)
const session = getSession(sessionId)
const workingDirectory = session?.workingDirectory

await executeToolDirectly(
  toolCall.id,
  toolCall.toolId,
  toolCall.arguments,
  messageId,
  sessionId,
  {
    workingDirectory,
    onMetadata: (update) => { ... }
  }
)
```

---

## Sandbox 系统

### Session 级边界

每个 Session 有独立的 `workingDirectory`，作为文件访问的 Sandbox 边界。

```typescript
// 文件: src/main/tools/core/sandbox.ts

export function getSandboxBoundary(workingDirectory?: string): string {
  return workingDirectory || process.cwd()
}

export function isPathContained(boundary: string, targetPath: string): boolean {
  const normalizedBoundary = path.resolve(boundary)
  const normalizedTarget = path.resolve(targetPath)
  return normalizedTarget.startsWith(normalizedBoundary + path.sep) ||
         normalizedTarget === normalizedBoundary
}
```

### 边界检查

```typescript
export async function checkFileAccess(
  filePath: string,
  ctx: { sessionId: string; messageId: string; workingDirectory?: string },
  operation: string
): Promise<string> {
  const absolutePath = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(getSandboxBoundary(ctx.workingDirectory), filePath)

  const boundary = getSandboxBoundary(ctx.workingDirectory)

  // 边界外访问 -> 请求权限
  if (!isPathContained(boundary, absolutePath)) {
    await Permission.ask({
      type: 'external_directory',
      pattern: [path.dirname(absolutePath), absolutePath],
      sessionId: ctx.sessionId,
      messageId: ctx.messageId,
      title: `${operation}: ${path.basename(absolutePath)}`,
      metadata: { filePath: absolutePath, boundary, operation },
    })
  }

  return absolutePath
}
```

---

## 内置工具列表

### V2 工具 (Tool.define())

| 工具 | 文件 | 说明 |
|------|------|------|
| `bash` | `bash-v2.ts` | Shell 命令执行 |
| `read` | `read.ts` | 文件读取 |
| `write` | `write.ts` | 文件写入 |
| `edit` | `edit.ts` | 智能编辑 (9 种策略) |
| `glob` | `glob.ts` | 文件模式匹配 |
| `grep` | `grep.ts` | 内容搜索 |

### Legacy 工具 (保留兼容)

| 工具 | 说明 |
|------|------|
| MCP 工具 | 通过 MCP 协议加载 |
| 图片生成 | DALL-E 等 |

---

## 工具实现示例

### Read Tool

```typescript
// 文件: src/main/tools/builtin/read.ts

const ReadParameters = z.object({
  file_path: z.string().describe('The absolute path to the file to read'),
  offset: z.number().optional().describe('Line number to start reading from'),
  limit: z.number().optional().describe('Number of lines to read'),
})

export const ReadTool = Tool.define<typeof ReadParameters, ReadMetadata>('read', {
  name: 'Read',
  description: 'Reads a file from the local filesystem...',
  category: 'builtin',
  enabled: true,
  autoExecute: true,  // 只读操作可自动执行

  parameters: ReadParameters,

  async execute(args, ctx) {
    const { file_path, offset = 1, limit = 2000 } = args

    // 1. Sandbox 边界检查
    const resolvedPath = await checkFileAccess(file_path, ctx, 'Read file')

    // 2. 实时元数据更新
    ctx.metadata({
      title: `Reading ${path.basename(resolvedPath)}`,
      metadata: { filePath: resolvedPath, ... },
    })

    // 3. 读取文件
    const content = await fs.readFile(resolvedPath, 'utf-8')

    // 4. 格式化输出
    return {
      title: `Read ${path.basename(resolvedPath)}`,
      output: formattedContent,
      metadata: { ... },
    }
  },

  formatValidationError(error) {
    return `Invalid read parameters:\n${...}`
  },
})
```

---

## 9 种替换策略

Edit 工具使用智能回退链进行模糊匹配：

```typescript
// 文件: src/main/tools/core/replacers.ts

export const replacers: Replacer[] = [
  simpleReplacer,              // 1. 精确匹配
  lineTrimmedReplacer,         // 2. 行尾空白处理
  blockAnchorReplacer,         // 3. Levenshtein 距离匹配
  whitespaceNormalizedReplacer,// 4. 空白标准化
  indentationFlexibleReplacer, // 5. 缩进灵活匹配
  escapeNormalizedReplacer,    // 6. 转义标准化
  trimmedBoundaryReplacer,     // 7. 边界裁剪
  contextAwareReplacer,        // 8. 上下文感知
  multiOccurrenceReplacer,     // 9. 多次出现处理
]

export function replace(content: string, oldStr: string, newStr: string): ReplaceResult {
  for (const replacer of replacers) {
    const result = replacer.replace(content, oldStr, newStr, false)
    if (result.matched) return result
  }
  return { matched: false, ... }
}
```

---

## Permission 系统

### 权限请求流程

```typescript
// 文件: src/main/permission/index.ts

await Permission.ask({
  type: 'external_directory',  // 权限类型
  pattern: [dir, path.join(dir, '*')],
  sessionId: ctx.sessionId,
  messageId: ctx.messageId,
  title: 'Access external directory',
  metadata: { ... },
})
```

### 权限类型

| 类型 | 说明 |
|------|------|
| `external_directory` | 访问 workingDirectory 外的目录 |
| `bash` | 执行危险命令 |
| `edit` | 修改文件 (预留) |

---

## AI SDK 集成

### 工具 Schema 生成

```typescript
// 文件: src/main/tools/registry.ts

export function getToolsForAI(toolSettings?): Record<string, AIToolSchema> {
  const result: Record<string, AIToolSchema> = {}

  // V2 工具转换
  for (const tool of getAllToolsV2()) {
    if (isEnabled) {
      const jsonSchema = zodToJsonSchema(tool.parameters)
      result[tool.id] = {
        description: tool.description,
        parameters: {
          type: 'object',
          properties: jsonSchema.properties,
          required: jsonSchema.required,
        },
      }
    }
  }

  return result
}
```

### Zod → JSON Schema

```typescript
// 使用 Zod 4 native toJSONSchema()
export function zodToJsonSchema(schema: z.ZodType) {
  const jsonSchema = schema.toJSONSchema()
  return {
    type: 'object',
    properties: jsonSchema.properties,
    required: jsonSchema.required,
  }
}
```

---

## 实时元数据流

### 前端更新机制

```
工具执行
  ↓
ctx.metadata({ title, metadata })
  ↓
context.onMetadata(update)  // registry.ts
  ↓
IPC: STEP_UPDATED
  ↓
前端 Step 组件更新
```

### chat.ts 集成

```typescript
// chat.ts:executeToolAndUpdate
await executeToolDirectly(..., {
  workingDirectory,
  onMetadata: (update) => {
    // 通过 IPC 发送实时更新
    webContents.send(IPC_CHANNELS.STEP_UPDATED, {
      sessionId,
      messageId,
      stepId: toolCall.id,
      updates: {
        title: update.title,
        metadata: update.metadata,
      },
    })
  },
})
```

---

## 设计模式总结

1. **双注册机制** - 兼容 Legacy 工具，支持渐进式迁移
2. **Tool.define()** - 统一的工具定义接口，类型安全
3. **Zod 验证** - 参数验证和 JSON Schema 生成
4. **9 种替换策略** - Edit 工具智能模糊匹配
5. **Session Sandbox** - 以 workingDirectory 为边界的文件访问控制
6. **Permission.ask()** - 边界外访问的权限请求机制
7. **实时元数据流** - ctx.metadata() → IPC → 前端 Step 更新
8. **自定义错误格式** - formatValidationError() 友好错误提示
