# Tool 系统架构

本文档详细描述 Tool 系统的实现细节和架构设计。

## 目录

1. [概述](#概述)
2. [核心文件](#核心文件)
3. [Tool 定义方式](#tool-定义方式)
4. [Tool Registry](#tool-registry)
5. [内置工具](#内置工具)
6. [Tool 执行流程](#tool-执行流程)
7. [Tool Agent](#tool-agent)
8. [权限和沙箱](#权限和沙箱)
9. [数据结构](#数据结构)

---

## 概述

Tool 系统是应用的工具执行框架，支持内置工具、MCP 工具和自定义工具的统一管理和执行。

### 核心特性

- **V2 格式**: 统一的 `Tool.define()` 模式
- **Zod 验证**: 参数使用 Zod schema 验证
- **异步初始化**: 支持动态参数的异步工具
- **权限控制**: Bash 命令分类和沙箱边界
- **Tool Agent**: 复杂任务的委托执行

---

## 核心文件

| 文件路径 | 功能 |
|---------|------|
| `src/main/tools/core/tool.ts` | Tool.define() 实现、工具基类 |
| `src/main/tools/registry.ts` | Tool 注册表管理 |
| `src/main/tools/types.ts` | Tool 类型定义 |
| `src/main/tools/builtin/index.ts` | 内置工具注册 |
| `src/main/tools/builtin/*.ts` | 各内置工具实现 |
| `src/main/services/tool-agent/agent.ts` | Tool Agent 实现 |
| `src/main/ipc/tools.ts` | Tool IPC handlers |

### 目录结构

```
src/main/tools/
├── types.ts                     # Tool 类型定义
├── registry.ts                  # Tool 注册表管理
├── index.ts                     # Tool 系统导出
├── core/
│   ├── tool.ts                  # Tool.define() 实现
│   ├── sandbox.ts               # 沙箱边界检查
│   └── replacers.ts             # 文本替换工具
└── builtin/
    ├── index.ts                 # 内置工具注册
    ├── bash-v2.ts               # Bash 工具
    ├── read.ts                  # Read 工具
    ├── write.ts                 # Write 工具
    ├── edit.ts                  # Edit 工具
    ├── glob.ts                  # Glob 工具
    ├── grep.ts                  # Grep 工具
    └── skill.ts                 # Skill 工具（异步）
```

---

## Tool 定义方式

### V2 格式概述

Tool 系统使用统一的 V2 格式（`Tool.define()` 模式），支持两种类型：

### 静态 Tool（同步）

```typescript
// src/main/tools/core/tool.ts

export interface ToolInfo<P extends z.ZodType, M extends ToolMetadata> {
  id: string
  name: string
  description: string
  category: 'builtin' | 'custom' | 'mcp'
  parameters: P                          // Zod schema
  enabled?: boolean
  autoExecute?: boolean
  execute(args: z.infer<P>, ctx: ToolContext<M>): Promise<ToolResult<M>>
  formatValidationError?(error: z.ZodError): string
}

// 定义方式
const readTool = Tool.define('read', {
  name: 'Read File',
  description: 'Read contents of a file',
  category: 'builtin',
  parameters: z.object({
    file_path: z.string().describe('File path to read'),
  }),
  async execute(args, ctx) {
    ctx.metadata({ title: `Reading ${args.file_path}` })
    return { title: '...', output: '...', metadata: {} }
  }
})
```

### 异步 Tool（动态初始化）

```typescript
export interface ToolInfoAsync<P extends z.ZodType, M extends ToolMetadata> {
  id: string
  name: string
  category: 'builtin' | 'custom' | 'mcp'
  enabled?: boolean
  autoExecute?: boolean
  init: (ctx?: InitContext) => Promise<ToolInitResult<P, M>>
  _initialized?: ToolInitResult<P, M>
}

// 定义方式
const skillTool = Tool.define('skill', {
  name: 'Skill',
  category: 'builtin',
}, async (ctx?: InitContext) => {
  // 动态初始化
  const skills = ctx?.skills ?? []
  return {
    description: `Load a skill. Available: ${skills.map(s => s.name).join(', ')}`,
    parameters: z.object({ skill: z.enum([...]) }),
    async execute(args, toolCtx) { ... }
  }
})
```

### ToolContext

```typescript
export interface ToolContext<M extends ToolMetadata = ToolMetadata> {
  sessionId: string
  messageId: string
  toolCallId?: string
  workingDirectory?: string              // 沙箱边界
  abortSignal?: AbortSignal
  metadata: (update: Partial<M> & { title?: string }) => void  // 实时更新
}
```

### ToolResult

```typescript
export interface ToolResult<M extends ToolMetadata = ToolMetadata> {
  title: string                          // 短标题
  output: string                         // 主要输出
  metadata: M                            // 额外元数据
}
```

---

## Tool Registry

### 注册表存储

```typescript
// src/main/tools/registry.ts

const toolRegistry: Map<string, RegisteredTool> = new Map()          // Legacy 工具
const toolRegistryV2: Map<string, ToolInfo> = new Map()              // V2 静态工具
const toolRegistryV2Async: Map<string, ToolInfoAsync> = new Map()    // V2 异步工具
```

### 关键 API

| 函数 | 说明 |
|------|------|
| `registerTool()` | 注册 legacy 工具 |
| `registerToolV2()` | 注册 V2 工具（自动检测同步/异步） |
| `unregisterTool()` | 注销工具 |
| `executeTool()` | 执行任何格式的工具 |
| `getAllToolsAsync()` | 获取所有工具含异步初始化 |
| `getToolsForAI()` | 获取 AI SDK 格式的工具定义 |
| `initializeToolRegistry()` | 初始化所有工具 |

### 初始化流程

```typescript
export async function initializeToolRegistry(): Promise<void> {
  const { registerBuiltinTools, registerBuiltinToolsV2 } =
    await import('./builtin/index.js')

  registerBuiltinTools()      // Legacy（实际是 no-op）
  registerBuiltinToolsV2()    // 注册所有内置工具

  const totalTools = toolRegistry.size + toolRegistryV2.size + toolRegistryV2Async.size
  console.log(`[ToolRegistry] Initialized with ${totalTools} tools`)
}
```

---

## 内置工具

| Tool ID | 文件 | 类型 | 说明 |
|---------|------|------|------|
| `bash` | `bash-v2.ts` | 静态 | 执行 bash 命令，含权限控制 |
| `read` | `read.ts` | 静态 | 读文件内容，支持行偏移 |
| `write` | `write.ts` | 静态 | 写文件内容 |
| `edit` | `edit.ts` | 静态 | 编辑文件内容 |
| `glob` | `glob.ts` | 静态 | 文件模式匹配 |
| `grep` | `grep.ts` | 静态 | 代码搜索（ripgrep） |
| `skill` | `skill.ts` | **异步** | 加载技能，动态描述 |

### 工具示例：Glob

```typescript
// src/main/tools/builtin/glob.ts

export const GlobTool = Tool.define<typeof GlobParameters, GlobMetadata>('glob', {
  name: 'Glob',
  description: 'Fast file pattern matching tool...',
  category: 'builtin',
  enabled: true,
  autoExecute: true,  // 只读操作，安全自动执行

  parameters: z.object({
    pattern: z.string().describe('Glob pattern like "**/*.ts"'),
    path: z.string().optional().describe('Search directory'),
  }),

  async execute(args, ctx) {
    const { pattern } = args
    let searchPath = args.path || process.cwd()

    // 实时更新元数据
    ctx.metadata({
      title: `Searching: ${pattern}`,
      metadata: { pattern, searchPath, count: 0 }
    })

    const files: Array<{ path: string; mtime: number }> = []

    for await (const file of Ripgrep.files({
      cwd: searchPath,
      glob: [pattern]
    })) {
      if (files.length >= DEFAULT_LIMIT) break
      const fullPath = path.resolve(searchPath, file)
      const stats = await fs.stat(fullPath)
      files.push({ path: fullPath, mtime: stats.mtime.getTime() })
    }

    // 按修改时间排序
    files.sort((a, b) => b.mtime - a.mtime)

    return {
      title: `Found ${files.length} files`,
      output: files.map(f => f.path).join('\n'),
      metadata: {
        pattern,
        searchPath,
        count: files.length,
        truncated: files.length >= DEFAULT_LIMIT
      }
    }
  }
})
```

---

## Tool 执行流程

### 执行入口

```typescript
// src/main/ipc/tools.ts

ipcMain.handle(IPC_CHANNELS.EXECUTE_TOOL, async (_event, request) => {
  const { toolId, arguments: args, messageId, sessionId } = request

  const context: ToolExecutionContext = {
    sessionId,
    messageId,
  }

  const result = await executeTool(toolId, args, context)
  return { success: result.success, result: result.data, error: result.error }
})
```

### ToolExecutionContext

```typescript
// src/main/tools/types.ts

export interface ToolExecutionContext {
  sessionId: string
  messageId: string
  toolCallId?: string
  workingDirectory?: string              // 沙箱边界
  providerId?: string
  providerConfig?: ProviderConfig
  toolSettings?: ToolSettings
  abortSignal?: AbortSignal
  skills?: SkillDefinition[]
  onStepStart?: (step: Step) => void
  onStepComplete?: (step: Step) => void
  onMetadata?: (update: ToolMetadataUpdate) => void  // 实时流式回调
}
```

### 执行流程

```typescript
// src/main/tools/registry.ts - executeTool()

async function executeTool(toolId, args, context) {
  // 分支 1: Legacy Tool
  const legacyTool = toolRegistry.get(toolId)
  if (legacyTool) {
    return await legacyTool.handler(args, context)
  }

  // 分支 2: V2 静态 Tool
  const v2Tool = toolRegistryV2.get(toolId)
  if (v2Tool) {
    // 1. Zod 验证参数
    const parseResult = v2Tool.parameters.safeParse(args)
    if (!parseResult.success) return { success: false, error: '...' }

    // 2. 创建 ToolContext
    const v2Context: ToolContext = {
      sessionId: context.sessionId,
      messageId: context.messageId,
      toolCallId: context.toolCallId,
      workingDirectory: context.workingDirectory,
      abortSignal: context.abortSignal,
      metadata: (update) => {
        context.onMetadata?.({ title: update.title, metadata: update.metadata })
      }
    }

    // 3. 执行
    const result = await v2Tool.execute(parseResult.data, v2Context)

    // 4. 转换结果
    return {
      success: true,
      data: { title: result.title, output: result.output, metadata: result.metadata }
    }
  }

  // 分支 3: V2 异步 Tool
  const v2AsyncTool = toolRegistryV2Async.get(toolId)
  if (v2AsyncTool) {
    // 1. 初始化（如未初始化）
    if (!v2AsyncTool._initialized) {
      await Tool.initialize(v2AsyncTool, currentInitContext)
    }
    const initResult = v2AsyncTool._initialized!

    // 2-4. 与静态 tool 相同
  }
}
```

### 直接执行

```typescript
// src/main/ipc/chat.ts

async function executeToolDirectly(
  toolName: string,
  args: Record<string, any>,
  context: {
    sessionId: string
    messageId: string
    toolCallId?: string
    workingDirectory?: string
    abortSignal?: AbortSignal
    onMetadata?: (update) => void
  }
): Promise<ToolExecutionResult> {
  // 1. 检查是否为 MCP tool
  if (isMCPTool(toolName)) {
    const result = await executeMCPTool(toolName, args)
    return { success: true, data: result }
  }

  // 2. 执行内置工具
  return await executeTool(toolName, args, context)
}
```

---

## Tool Agent

### 概述

Tool Agent 是一个独立的 LLM 执行上下文，用于处理复杂的多步任务委托。

### 类型定义

```typescript
// src/main/services/tool-agent/types.ts

// 委托请求
export interface DelegationRequest {
  task: string                           // 要执行的任务
  context: string                        // 任务上下文
  expectedOutcome: string                // 预期结果
  sessionId: string
  messageId: string
}

// 执行结果
export interface ToolAgentResult {
  success: boolean
  summary: string                        // AI 的总结
  details: string                        // 执行日志
  filesModified: string[]                // 修改的文件列表
  errors: string[]                       // 错误列表
  toolCallCount: number                  // 工具调用次数
  executionTimeMs: number                // 执行时间
}

// 单个步骤
export interface ToolAgentStep {
  toolName: string
  arguments: Record<string, unknown>
  result: unknown
  status: 'success' | 'failed'
  timestamp: number
  error?: string
  thinking?: string                      // 执行前的推理
  summary?: string                       // 执行后的分析
}
```

### 执行流程

```typescript
// src/main/services/tool-agent/agent.ts

export async function executeToolAgent(
  request: DelegationRequest,
  context: ToolAgentContext,
  events?: ToolAgentEvents
): Promise<ToolAgentResult> {
  const startTime = Date.now()
  const steps: ToolAgentStep[] = []

  // 1. 获取所有可用工具
  const allEnabledTools = await getEnabledToolsAsync()
  const enabledTools = allEnabledTools.filter(t => !t.id.startsWith('mcp:'))
  const mcpTools = getMCPToolsForAI()
  const toolsForAI = { ...builtinToolsForAI, ...mcpTools }

  // 2. 构建 LLM 提示
  const systemPrompt = buildToolAgentSystemPrompt(context.skills)
  const userPrompt = buildToolAgentUserPrompt(request.task, request.context, request.expectedOutcome)

  // 3. Tool 循环
  while (currentTurn < MAX_TURNS && toolCallCount < settings.maxToolCalls) {
    currentTurn++

    // 3.1 流式获取 LLM 响应
    const stream = streamChatResponseWithTools(...)

    for await (const chunk of stream) {
      // 3.2 处理 text/reasoning/tool-call chunks
      if (chunk.type === 'tool-call' && chunk.toolCall) {
        // 3.3 执行工具（自动确认危险命令）
        const result = await executeTool(
          chunk.toolCall.toolName,
          { ...args, confirmed: true },
          context
        )

        steps.push({ toolName, arguments: args, result, status })
        events?.onStepComplete?.(step)
      }
    }

    // 3.4 没有工具调用，结束循环
    if (toolCallsThisTurn.length === 0) break
  }

  // 4. 返回结果
  return {
    success: !allFailed,
    summary: accumulatedContent.trim(),
    details: buildDetails(steps),
    filesModified: [...new Set(filesModified)],
    errors,
    toolCallCount,
    executionTimeMs: Date.now() - startTime
  }
}
```

### Tool Agent Events

```typescript
export interface ToolAgentEvents {
  onStepStart?: (step: ToolAgentStep) => void
  onStepComplete?: (step: ToolAgentStep) => void
  onStepSummary?: (step: ToolAgentStep) => void
  onTextChunk?: (text: string) => void
  onProgress?: (message: string) => void
  onError?: (error: string) => void
}
```

---

## 权限和沙箱

### Bash 命令分类

```typescript
// src/main/tools/builtin/bash-v2.ts

// 只读命令 - 自动执行
READ_ONLY_COMMANDS = { 'cat', 'ls', 'pwd', 'grep', 'find', ... }

// Git 只读
GIT_READ_ONLY = { 'status', 'log', 'diff', 'branch', ... }

// 危险命令 - 需要确认
DANGEROUS_COMMANDS = { 'rm', 'mv', 'cp', 'mkdir', 'chmod', ... }

// Git 写入
GIT_WRITE = { 'add', 'commit', 'push', 'merge', ... }

// 禁止命令 - 总是拒绝
FORBIDDEN_COMMANDS = { 'sudo', 'shutdown', 'reboot', 'mkfs', ... }

function classifyCommand(command: string): 'allow' | 'ask' | 'deny'
```

### 沙箱边界检查

```typescript
// src/main/tools/core/sandbox.ts

// Sandbox 边界优先级：
// 1. context.workingDirectory (session 工作目录)
// 2. settings.tools.bash.defaultWorkingDirectory
// 3. process.cwd()

export function getSandboxBoundary(workingDirectory?: string): string

// 检查文件是否在边界内
export function isPathContained(boundary: string, targetPath: string): boolean

// 在边界外时请求权限
export async function checkFileAccess(
  filePath: string,
  ctx: { sessionId, messageId, toolCallId, workingDirectory },
  operation: string
): Promise<string>
```

### 权限集成示例

```typescript
// Bash 工具中的权限检查
const classification = classifyCommand(command)

if (classification === 'deny') {
  return { success: false, error: 'Command is forbidden' }
}

if (classification === 'ask') {
  const permission = await Permission.ask({
    type: 'bash_command',
    pattern: getCommandPattern(command),
    sessionId, messageId, callId: toolCallId,
    title: `Execute: ${command}`,
  })

  if (permission !== 'allow') {
    return { success: false, error: 'Command rejected by user' }
  }
}

// 执行命令...
```

---

## 数据结构

### ToolDefinition

```typescript
// src/shared/ipc.ts

export interface ToolDefinition {
  id: string
  name: string
  description: string
  parameters: ToolParameter[]
  enabled: boolean
  autoExecute: boolean
  category: 'builtin' | 'custom'
  icon?: string
  source?: 'builtin' | 'mcp'
  serverId?: string                      // MCP 工具的服务器 ID
  serverName?: string
}
```

### ToolParameter

```typescript
export interface ToolParameter {
  name: string
  type: 'string' | 'number' | 'boolean' | 'object' | 'array'
  description: string
  required: boolean
  enum?: string[]
}
```

### ToolSettings

```typescript
export interface ToolSettings {
  enableToolCalls: boolean
  tools: Record<string, { enabled: boolean; autoExecute: boolean }>
  bash?: BashToolSettings
  toolAgentSettings?: ToolAgentSettings
}

export interface BashToolSettings {
  enableSandbox: boolean
  defaultWorkingDirectory?: string
  allowedDirectories: string[]
  confirmDangerousCommands: boolean
  dangerousCommandWhitelist: string[]
}

export interface ToolAgentSettings {
  autoConfirmDangerous?: boolean
  maxToolCalls?: number
  timeoutMs?: number
  providerId?: string
  model?: string
}
```

### Step

```typescript
export interface Step {
  id: string
  type: StepType
  title: string
  description?: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'awaiting-confirmation'
  timestamp: number
  turnIndex?: number
  toolCallId?: string
  toolCall?: ToolCall
  thinking?: string
  result?: string
  summary?: string
  error?: string
  toolAgentResult?: {
    success: boolean
    summary: string
    toolCallCount: number
    filesModified?: string[]
    errors?: string[]
  }
}

export type StepType =
  | 'bash' | 'bash-confirm'
  | 'read' | 'write' | 'edit'
  | 'glob' | 'grep'
  | 'skill'
  | 'delegate'
  | 'tool_call'
```

---

## 流程总结

### Simple Tool Call Flow

```
Tool.execute(toolId, args)
  ├─ registry.executeTool(toolId, args, context)
  │   ├─ Legacy tool handler
  │   ├─ V2 static tool execute()
  │   └─ V2 async tool execute()
  └─ return ToolExecutionResult
```

### Tool Agent Delegation Flow

```
executeToolAgent(request, context, events)
  ├─ getAllEnabledTools()
  ├─ buildToolAgentSystemPrompt()
  ├─ buildToolAgentUserPrompt()
  └─ Tool Loop:
      ├─ streamChatResponseWithTools()
      ├─ for each tool-call:
      │   ├─ Tool.initialize() if async
      │   ├─ executeTool()
      │   ├─ onStepComplete() event
      │   └─ Add to conversation
      └─ Return ToolAgentResult
```

### Tool Registry Lookup

```
executeTool(toolId)
  ├─ toolRegistry.get(toolId)        // Legacy
  ├─ toolRegistryV2.get(toolId)      // V2 static
  └─ toolRegistryV2Async.get(toolId) // V2 async
      └─ if not initialized:
          └─ Tool.initialize(tool, context)
```
