# OpenCode Tool System 实现

## 架构概述

OpenCode 的 Tool 系统采用 **统一注册机制**，所有工具通过 `Tool.define()` 定义，使用 Vercel AI SDK 集成。

## 核心文件

| 文件 | 说明 |
|------|------|
| `/packages/opencode/src/tool/tool.ts` | Tool.define() 核心定义 |
| `/packages/opencode/src/tool/registry.ts` | 工具注册与加载 |
| `/packages/opencode/src/tool/*.ts` | 各工具实现 |

---

## Tool 定义模式

### Tool.define() 接口

```typescript
// 文件: /packages/opencode/src/tool/tool.ts

export namespace Tool {
  export interface Info<Parameters extends z.ZodType, M extends Metadata> {
    id: string
    init: (ctx?: InitContext) => Promise<{
      description: string              // 动态生成描述
      parameters: Parameters           // Zod 参数 schema
      execute(args: z.infer<Parameters>, ctx: Context): Promise<{
        title: string
        metadata: M
        output: string
        attachments?: MessageV2.FilePart[]
      }>
      formatValidationError?(error: z.ZodError): string
    }>
  }
}
```

**关键差异**: OpenCode 使用 `init()` 异步初始化，允许动态生成描述和参数。

### 执行上下文

```typescript
export type Context<M extends Metadata = Metadata> = {
  sessionID: string           // 会话标识符
  messageID: string           // 消息标识符
  agent: string               // Agent 名称
  abort: AbortSignal          // 取消信号
  callID?: string             // 唯一调用标识符
  extra?: { [key: string]: any }
  metadata(input: { title?: string; metadata?: M }): void
}
```

**关键差异**:
- 包含 `agent` 字段用于权限检查
- 包含 `callID` 用于调用追踪
- 没有 `workingDirectory`，使用全局 cwd

---

## 工具注册机制

### 内置工具加载顺序

```typescript
// 文件: /packages/opencode/src/tool/registry.ts

InvalidTool      // 无效工具占位符
BashTool         // Shell 命令执行
ReadTool         // 文件读取
GlobTool         // 文件模式匹配
GrepTool         // 内容搜索
EditTool         // 文件编辑
WriteTool        // 文件写入
TaskTool         // 子任务执行 (Tool Agent)
WebFetchTool     // Web 内容获取
TodoWriteTool    // Todo 写入
TodoReadTool     // Todo 读取
WebSearchTool    // Web 搜索 (Exa API)
CodeSearchTool   // 代码搜索 (Exa API)
SkillTool        // Skill 加载
LspTool          // LSP 操作 (实验性)
BatchTool        // 批量执行 (实验性)
```

### 自定义工具加载

```typescript
// 从配置目录的 tool/ 文件夹加载
const glob = new Bun.Glob("tool/*.{js,ts}")

for (const dir of await Config.directories()) {
  for await (const match of glob.scan({ cwd: dir, absolute: true })) {
    const namespace = path.basename(match, path.extname(match))
    const mod = await import(match)
    for (const [id, def] of Object.entries(mod)) {
      custom.push(fromPlugin(id === "default" ? namespace : `${namespace}_${id}`, def))
    }
  }
}
```

### 基于权限的工具过滤

```typescript
// 根据 Agent 权限禁用工具
| 权限 | 禁用的工具 |
|------|-----------|
| edit = deny | edit, write |
| bash = deny | bash |
| webfetch = deny | webfetch, codesearch, websearch |
| skill = deny | skill |
```

---

## 工具执行流程

### 完整执行序列

```
1. Tool Registry 查找
   ↓
2. Tool 初始化 (Tool.init)
   - 参数 schema 设置
   - 权限初始化（Agent 上下文）
   - 描述生成
   ↓
3. 参数验证 (Zod)
   - 失败: formatValidationError() 或默认错误
   ↓
4. 权限检查
   - 外部目录访问
   - edit/bash/webfetch 权限
   - Skill 访问模式
   ↓
5. 工具执行
   - ctx.metadata() 实时更新
   - 中止信号处理
   ↓
6. 输出格式化
   {
     title: string
     metadata: M
     output: string
     attachments?: FilePart[]
   }
```

---

## 权限系统

### 三级权限模型

```typescript
if (agent.permission.{type} === "ask") {
  // 需要用户确认
  await Permission.ask({
    type: "{type}",
    pattern: [...],
    sessionID: ctx.sessionID,
    messageID: ctx.messageID,
    callID: ctx.callID,
    title: "...",
    metadata: {...}
  })
} else if (agent.permission.{type} === "deny") {
  // 直接拒绝
  throw new Permission.RejectedError(...)
}
// allow = 直接允许
```

### 权限类型

| 类型 | 说明 |
|------|------|
| `edit` | 文件编辑/写入 |
| `bash[pattern]` | 命令执行 (支持通配符) |
| `external_directory` | 工作目录外访问 |
| `webfetch` | Web 操作 |
| `skill[pattern]` | Skill 访问 (支持通配符) |

---

## 内置工具详解

### bash - Shell 命令执行

```typescript
// 文件: /packages/opencode/src/tool/bash.ts

parameters: {
  command: string       // 要执行的命令
  timeout?: number      // 超时时间（毫秒）
  workdir?: string      // 工作目录
  description: string   // 5-10 字的命令描述
}
```

**功能特点**:
- tree-sitter 语法验证
- 危险命令权限检查 (rm, cp, mv, mkdir, touch, chmod, chown)
- 外部目录访问权限控制
- 进程树终止支持
- 输出截断（30,000 字符）
- 默认超时 2 分钟
- 实时输出流

### read - 文件读取

```typescript
parameters: {
  filePath: string        // 绝对或相对路径
  offset?: number         // 起始行号
  limit?: number          // 读取行数（默认 2000）
}
```

**功能特点**:
- 二进制文件检测
- 图片/PDF 支持 (base64 编码附件)
- `.env` 文件阻止（除 .env.sample 等）
- 外部目录权限检查
- LSP 文件预热

### edit - 文件编辑

```typescript
parameters: {
  filePath: string      // 绝对路径
  oldString: string     // 要替换的文本
  newString: string     // 替换后的文本
  replaceAll?: boolean  // 替换所有匹配项
}
```

**9 种替换策略回退链**:
1. SimpleReplacer - 简单替换
2. LineTrimmedReplacer - 行尾空白处理
3. BlockAnchorReplacer - Levenshtein 距离匹配
4. WhitespaceNormalizedReplacer - 空白标准化
5. IndentationFlexibleReplacer - 缩进灵活匹配
6. EscapeNormalizedReplacer - 转义标准化
7. TrimmedBoundaryReplacer - 边界裁剪
8. ContextAwareReplacer - 上下文感知
9. MultiOccurrenceReplacer - 多次出现处理

### task - 子任务执行 (Tool Agent)

```typescript
parameters: {
  description: string        // 3-5 词任务描述
  prompt: string             // 任务指令
  subagent_type: string      // Agent 类型名称
  session_id?: string        // 继续现有任务会话
  command?: string           // 触发命令
}
```

**功能特点**:
- 动态 Agent 选择
- 会话创建/继续
- 实时部分更新
- 禁用工具列表：todowrite, todoread, task, primary_tools
- 子 Agent 结果聚合

### batch - 批量执行

```typescript
parameters: {
  tool_calls: Array<{
    tool: string                    // 工具名称
    parameters: Record<string, any> // 工具参数
  }>
}
```

**约束**:
- 每批最多 10 个工具
- 禁止 batch 本身
- 外部工具不能批量执行

---

## LSP 集成

### 支持的操作

```
goToDefinition | findReferences | hover | documentSymbol |
workspaceSymbol | goToImplementation | prepareCallHierarchy |
incomingCalls | outgoingCalls
```

### lsp 工具

```typescript
parameters: {
  operation: string     // LSP 操作名称
  filePath: string      // 文件路径
  line: number          // 行号（1 开始）
  character: number     // 字符偏移（1 开始）
}
```

---

## Web 工具

### webfetch - Web 内容获取

```typescript
parameters: {
  url: string                           // HTTP(S) URL
  format: "text" | "markdown" | "html"  // 输出格式
  timeout?: number                      // 超时秒数（最大 120）
}
```

**功能**:
- HTML 转 Markdown (Turndown)
- HTML 转纯文本 (HTMLRewriter)
- 响应大小限制：5MB
- 脚本/样式内容移除

### websearch - Web 搜索

```typescript
parameters: {
  query: string
  numResults?: number                     // 默认 8
  livecrawl?: "fallback" | "preferred"
  type?: "auto" | "fast" | "deep"
  contextMaxCharacters?: number
}
```

**集成**: Exa API

---

## AI SDK 集成

### Vercel AI SDK streamText

```typescript
// OpenCode 使用 Vercel AI SDK
import { streamText } from 'ai'

const result = await streamText({
  model: provider(modelId),
  messages: [...],
  tools: toolSchemas,  // 直接传递工具 schema
  onToolCall: async ({ toolCall }) => {
    // 工具执行
  },
})
```

### 工具 Schema 生成

```typescript
// 通过 Tool.init() 获取
const toolInfo = await tool.init(initContext)
const schema = {
  description: toolInfo.description,
  parameters: toolInfo.parameters,  // Zod schema
}
```

---

## 自定义工具开发

### 简单工具

```typescript
// tool/mytool.ts
import { z } from "zod"
import { Tool } from "../tool"

export const MyTool = Tool.define("mytool", {
  description: "执行自定义操作",
  parameters: z.object({
    input: z.string().describe("输入参数"),
    options: z.object({
      verbose: z.boolean().optional()
    }).optional()
  }),
  async execute(params, ctx) {
    const result = await doSomething(params.input)
    ctx.metadata({ title: "处理中..." })
    return {
      title: "操作完成",
      output: result,
      metadata: { processed: true }
    }
  }
})
```

### 异步初始化工具

```typescript
export const AsyncTool = Tool.define("asynctool", async () => {
  // 异步初始化
  const config = await loadConfig()

  return {
    description: `基于配置的工具: ${config.name}`,
    parameters: z.object({
      action: z.enum(config.actions)
    }),
    async execute(params, ctx) { ... }
  }
})
```

---

## 设计模式总结

1. **异步初始化** - `init()` 支持动态配置和描述生成

2. **统一注册** - 只有一种工具格式 (Tool.define)

3. **Agent 权限** - 基于 Agent 配置的三级权限 (ask/allow/deny)

4. **全局 cwd** - 使用 process.cwd() 作为工作目录，无 Session 级边界

5. **Tool Agent** - `task` 工具支持子任务委托

6. **LSP 集成** - 内置 LSP 工具支持代码导航

7. **Web 工具** - 内置 webfetch/websearch/codesearch

8. **批量执行** - `batch` 工具支持并行执行多个工具

9. **事件发布** - 文件变更触发 bus 事件

10. **Exa API** - Web 搜索和代码搜索通过 Exa 服务

---

## 与当前系统的主要差异

| 特性 | OpenCode | 当前系统 (start-electron) |
|------|----------|--------------------------|
| 工具格式 | 统一 Tool.define | 双格式 (Legacy + V2) |
| 初始化 | 异步 `init()` | 同步定义 |
| Sandbox | 全局 cwd | Session 级 workingDirectory |
| 权限 | Agent 级 (ask/allow/deny) | Session 级 Permission.ask() |
| Tool Agent | 内置 TaskTool | 暂未实现 |
| LSP | 内置支持 | 暂未实现 |
| Web 搜索 | Exa API | 暂未实现 |
| 批量执行 | BatchTool | 暂未实现 |
| AI SDK | Vercel AI SDK 原生 | 自定义 streamChat |

---

## 参考文档

完整文档见: `/Users/yitiansong/data/code/opencode/packages/docs/tool-system.mdx`
