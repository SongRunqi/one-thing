# MCP 系统架构

本文档详细描述 MCP (Model Context Protocol) 系统的实现细节和架构设计。

## 目录

1. [概述](#概述)
2. [核心文件](#核心文件)
3. [数据结构](#数据结构)
4. [传输方式](#传输方式)
5. [MCP Client](#mcp-client)
6. [MCP Manager](#mcp-manager)
7. [Tool 集成](#tool-集成)
8. [IPC 接口](#ipc-接口)
9. [预设配置](#预设配置)
10. [完整流程](#完整流程)

---

## 概述

MCP (Model Context Protocol) 系统实现了与外部 MCP 服务器的连接和通信，支持工具、资源和提示的动态发现和执行。

### 核心特性

- **双传输方式**: 支持 stdio 和 SSE
- **服务器管理**: 连接、断开、刷新生命周期
- **工具集成**: MCP 工具自动注册到 Tool Registry
- **资源访问**: 支持 MCP 资源读取
- **提示获取**: 支持 MCP 提示模板

---

## 核心文件

| 文件路径 | 功能 |
|---------|------|
| `src/main/mcp/types.ts` | MCP 类型定义 |
| `src/main/mcp/client.ts` | MCP 客户端实现 |
| `src/main/mcp/manager.ts` | MCP 管理器（单例） |
| `src/main/mcp/bridge.ts` | Tool 集成桥接 |
| `src/main/ipc/mcp.ts` | IPC handlers |

### 目录结构

```
src/main/mcp/
├── types.ts                     # MCP 类型定义
├── client.ts                    # MCPClient 类
├── manager.ts                   # MCPManager 单例
├── bridge.ts                    # Tool 集成桥接
└── index.ts                     # 导出
```

---

## 数据结构

### MCPServerConfig

```typescript
// src/main/mcp/types.ts

type MCPTransportType = 'stdio' | 'sse'

interface MCPServerConfig {
  id: string                          // 唯一标识符
  name: string                        // 显示名称
  transport: MCPTransportType         // 传输方式
  enabled: boolean                    // 是否启用

  // stdio 选项
  command?: string                    // 执行命令
  args?: string[]                     // 命令参数
  env?: Record<string, string>        // 环境变量
  cwd?: string                        // 工作目录

  // SSE 选项
  url?: string                        // 服务器 URL
  headers?: Record<string, string>    // HTTP 头
}
```

### MCPServerState

```typescript
interface MCPServerState {
  config: MCPServerConfig
  status: 'disconnected' | 'connecting' | 'connected' | 'error'
  error?: string
  tools: MCPToolInfo[]
  resources: MCPResourceInfo[]
  prompts: MCPPromptInfo[]
  connectedAt?: number
}
```

### MCP 能力类型

```typescript
interface MCPToolInfo {
  name: string
  description?: string
  inputSchema: {
    type: 'object'
    properties?: Record<string, any>
    required?: string[]
  }
  serverId: string
}

interface MCPResourceInfo {
  uri: string
  name: string
  description?: string
  mimeType?: string
  serverId: string
}

interface MCPPromptInfo {
  name: string
  description?: string
  arguments?: Array<{
    name: string
    description?: string
    required?: boolean
  }>
  serverId: string
}
```

---

## 传输方式

### stdio 传输

通过标准输入输出与 MCP 服务器通信，适用于本地进程。

```typescript
// 配置示例
{
  id: 'filesystem',
  name: 'File System',
  transport: 'stdio',
  enabled: true,
  command: 'npx',
  args: ['-y', '@modelcontextprotocol/server-filesystem', '/path/to/allowed'],
  env: { NODE_ENV: 'production' },
  cwd: '/home/user'
}
```

### SSE 传输

通过 Server-Sent Events 与远程 MCP 服务器通信。

```typescript
// 配置示例
{
  id: 'remote-server',
  name: 'Remote MCP Server',
  transport: 'sse',
  enabled: true,
  url: 'https://mcp.example.com/sse',
  headers: {
    'Authorization': 'Bearer token'
  }
}
```

---

## MCP Client

### 类定义

```typescript
// src/main/mcp/client.ts

class MCPClient {
  private config: MCPServerConfig
  private client: Client | null = null
  private transport: Transport | null = null
  private state: MCPServerState

  constructor(config: MCPServerConfig)

  // 连接管理
  async connect(): Promise<void>
  async disconnect(): Promise<void>
  async updateConfig(config: MCPServerConfig): Promise<void>

  // 能力刷新
  async refreshCapabilities(): Promise<void>

  // 工具调用
  async callTool(toolName: string, args: Record<string, any>): Promise<any>

  // 资源读取
  async readResource(uri: string): Promise<any>

  // 提示获取
  async getPrompt(name: string, args?: Record<string, any>): Promise<any>

  // 状态查询
  getState(): MCPServerState
}
```

### 连接流程

```typescript
async connect(): Promise<void> {
  this.state.status = 'connecting'

  try {
    // 1. 创建 transport
    if (this.config.transport === 'stdio') {
      this.transport = new StdioClientTransport({
        command: this.config.command!,
        args: this.config.args,
        env: this.config.env,
        cwd: this.config.cwd,
      })
    } else {
      this.transport = new SSEClientTransport(
        new URL(this.config.url!),
        { headers: this.config.headers }
      )
    }

    // 2. 创建 Client (@modelcontextprotocol/sdk)
    this.client = new Client({
      name: 'start-electron',
      version: '1.0.0',
    })

    // 3. 连接（带超时）
    const timeout = this.config.transport === 'stdio' ? 30000 : 60000
    await Promise.race([
      this.client.connect(this.transport),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Connection timeout')), timeout)
      )
    ])

    // 4. 刷新能力
    await this.refreshCapabilities()

    this.state.status = 'connected'
    this.state.connectedAt = Date.now()
  } catch (error) {
    this.state.status = 'error'
    this.state.error = error.message
    throw error
  }
}
```

### 能力刷新

```typescript
async refreshCapabilities(): Promise<void> {
  if (!this.client) return

  // 获取工具
  const toolsResult = await this.client.listTools()
  this.state.tools = toolsResult.tools.map(tool => ({
    ...tool,
    serverId: this.config.id,
  }))

  // 获取资源
  const resourcesResult = await this.client.listResources()
  this.state.resources = resourcesResult.resources.map(resource => ({
    ...resource,
    serverId: this.config.id,
  }))

  // 获取提示
  const promptsResult = await this.client.listPrompts()
  this.state.prompts = promptsResult.prompts.map(prompt => ({
    ...prompt,
    serverId: this.config.id,
  }))
}
```

### 工具调用

```typescript
async callTool(toolName: string, args: Record<string, any>): Promise<any> {
  if (!this.client || this.state.status !== 'connected') {
    throw new Error('Not connected')
  }

  const result = await this.client.callTool({
    name: toolName,
    arguments: args,
  })

  return result
}
```

---

## MCP Manager

### 单例模式

```typescript
// src/main/mcp/manager.ts

class MCPManagerClass {
  private clients: Map<string, MCPClient> = new Map()
  private settings: MCPSettings | null = null
  private initialized: boolean = false

  // 初始化
  async initialize(settings: MCPSettings): Promise<void>

  // 设置更新
  async updateSettings(settings: MCPSettings): Promise<void>

  // 服务器管理
  async connectServer(config: MCPServerConfig): Promise<void>
  async disconnectServer(serverId: string): Promise<void>
  async disconnectAll(): Promise<void>
  async refreshServer(serverId: string): Promise<void>
  async reconnectServer(serverId: string): Promise<void>

  // 状态查询
  getServerStates(): MCPServerState[]
  getAllTools(): MCPToolInfo[]
  getAllResources(): MCPResourceInfo[]
  getAllPrompts(): MCPPromptInfo[]

  // 工具/资源/提示操作
  async callTool(serverId: string, toolName: string, args: Record<string, any>): Promise<any>
  async callToolByName(toolName: string, args: Record<string, any>): Promise<any>
  async readResource(serverId: string, uri: string): Promise<any>
  async getPrompt(serverId: string, name: string, args?: Record<string, any>): Promise<any>

  // 关闭
  async shutdown(): Promise<void>
}

export const MCPManager = new MCPManagerClass()
```

### 初始化流程

```typescript
async initialize(settings: MCPSettings): Promise<void> {
  if (this.initialized) return

  this.settings = settings

  if (!settings.enabled) {
    this.initialized = true
    return
  }

  // 连接所有启用的服务器
  for (const config of settings.servers) {
    if (config.enabled) {
      try {
        await this.connectServer(config)
      } catch (error) {
        console.error(`Failed to connect to ${config.name}:`, error)
      }
    }
  }

  this.initialized = true
}
```

### 按名称调用工具

```typescript
async callToolByName(toolName: string, args: Record<string, any>): Promise<any> {
  // 查找包含该工具的服务器
  for (const [serverId, client] of this.clients) {
    const state = client.getState()
    const tool = state.tools.find(t => t.name === toolName)
    if (tool) {
      return await client.callTool(toolName, args)
    }
  }

  throw new Error(`Tool not found: ${toolName}`)
}
```

---

## Tool 集成

### Bridge 模块

```typescript
// src/main/mcp/bridge.ts

// MCP 工具转换为 ToolDefinition
export function mcpToolToToolDefinition(mcpTool: MCPToolInfo): ToolDefinition {
  return {
    id: `mcp:${mcpTool.serverId}:${mcpTool.name}`,
    name: mcpTool.name,
    description: mcpTool.description || '',
    parameters: convertInputSchemaToParameters(mcpTool.inputSchema),
    enabled: true,
    autoExecute: true,
    category: 'custom',
    source: 'mcp',
    serverId: mcpTool.serverId,
  }
}

// JSON Schema 转 Zod
export function mcpInputSchemaToZod(inputSchema: any): z.ZodObject<any> {
  const shape: Record<string, z.ZodType> = {}

  for (const [key, prop] of Object.entries(inputSchema.properties || {})) {
    shape[key] = jsonSchemaPropertyToZod(prop)
  }

  return z.object(shape)
}

// 获取 AI SDK 格式的 MCP 工具
export function getMCPToolsForAI(): Record<string, ToolSchema> {
  const tools: Record<string, ToolSchema> = {}

  for (const tool of MCPManager.getAllTools()) {
    // 清理工具名（AI SDK 格式）
    const sanitizedName = `mcp_${tool.serverId}_${tool.name}`.replace(/[^a-zA-Z0-9_]/g, '_')

    tools[sanitizedName] = {
      description: tool.description,
      parameters: mcpInputSchemaToZod(tool.inputSchema),
    }
  }

  return tools
}
```

### 工具注册

```typescript
// 注册 MCP 工具到全局 registry
export async function registerMCPTools(): Promise<void> {
  const mcpTools = MCPManager.getAllTools()

  for (const mcpTool of mcpTools) {
    const definition = mcpToolToToolDefinition(mcpTool)

    // 创建 handler
    const handler = async (args: Record<string, any>) => {
      return await MCPManager.callTool(mcpTool.serverId, mcpTool.name, args)
    }

    registerTool(definition, handler)
  }

  console.log(`[MCP Bridge] Registered ${mcpTools.length} MCP tools`)
}
```

### 工具 ID 解析

```typescript
// 解析 MCP 工具 ID
export function parseMCPToolId(toolId: string): { serverId: string; toolName: string } | null {
  const match = toolId.match(/^mcp:([^:]+):(.+)$/)
  if (!match) return null

  return {
    serverId: match[1],
    toolName: match[2],
  }
}

// 检查是否为 MCP 工具
export function isMCPTool(toolId: string): boolean {
  return toolId.startsWith('mcp:')
}

// 执行 MCP 工具
export async function executeMCPTool(
  toolId: string,
  args: Record<string, any>
): Promise<any> {
  const parsed = parseMCPToolId(toolId)
  if (!parsed) {
    throw new Error(`Invalid MCP tool ID: ${toolId}`)
  }

  return await MCPManager.callTool(parsed.serverId, parsed.toolName, args)
}
```

---

## IPC 接口

### IPC 通道

| 通道 | 请求类型 | 功能 |
|------|---------|------|
| `MCP_GET_SERVERS` | 无 | 获取所有服务器状态 |
| `MCP_ADD_SERVER` | MCPAddServerRequest | 添加新服务器 |
| `MCP_UPDATE_SERVER` | MCPUpdateServerRequest | 更新服务器配置 |
| `MCP_REMOVE_SERVER` | MCPRemoveServerRequest | 删除服务器 |
| `MCP_CONNECT_SERVER` | MCPConnectServerRequest | 连接服务器 |
| `MCP_DISCONNECT_SERVER` | MCPDisconnectServerRequest | 断开连接 |
| `MCP_REFRESH_SERVER` | MCPRefreshServerRequest | 刷新服务器 |
| `MCP_GET_TOOLS` | 无 | 获取所有工具 |
| `MCP_CALL_TOOL` | MCPCallToolRequest | 调用工具 |
| `MCP_GET_RESOURCES` | 无 | 获取所有资源 |
| `MCP_READ_RESOURCE` | MCPReadResourceRequest | 读取资源 |
| `MCP_GET_PROMPTS` | 无 | 获取所有提示 |
| `MCP_GET_PROMPT` | MCPGetPromptRequest | 获取特定提示 |

### Handler 实现示例

```typescript
// src/main/ipc/mcp.ts

// 获取服务器状态
ipcMain.handle(IPC_CHANNELS.MCP_GET_SERVERS, async () => {
  return {
    success: true,
    servers: MCPManager.getServerStates()
  }
})

// 连接服务器
ipcMain.handle(IPC_CHANNELS.MCP_CONNECT_SERVER, async (_, request) => {
  try {
    await MCPManager.connectServer(request.config)
    await registerMCPTools()  // 重新注册工具
    return { success: true }
  } catch (error) {
    return { success: false, error: error.message }
  }
})

// 调用工具
ipcMain.handle(IPC_CHANNELS.MCP_CALL_TOOL, async (_, request) => {
  try {
    const result = await MCPManager.callTool(
      request.serverId,
      request.toolName,
      request.arguments
    )
    return { success: true, result }
  } catch (error) {
    return { success: false, error: error.message }
  }
})

// 读取资源
ipcMain.handle(IPC_CHANNELS.MCP_READ_RESOURCE, async (_, request) => {
  try {
    const result = await MCPManager.readResource(request.serverId, request.uri)
    return { success: true, result }
  } catch (error) {
    return { success: false, error: error.message }
  }
})
```

---

## 预设配置

### 常见 MCP 服务器预设

```typescript
// src/renderer/data/mcpPresets.ts

const MCP_PRESETS = [
  {
    id: 'filesystem',
    name: 'File System',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem'],
    description: '读写文件和目录',
  },
  {
    id: 'github',
    name: 'GitHub',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-github'],
    description: '仓库、PR、Issue 管理',
  },
  {
    id: 'puppeteer',
    name: 'Puppeteer',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-puppeteer'],
    description: '网页自动化和爬虫',
  },
  {
    id: 'postgres',
    name: 'PostgreSQL',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-postgres'],
    description: '数据库查询',
  },
  {
    id: 'sqlite',
    name: 'SQLite',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-sqlite'],
    description: '本地数据库',
  },
  {
    id: 'brave-search',
    name: 'Brave Search',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@anthropic/server-brave-search'],
    description: 'Web 搜索',
  },
  {
    id: 'fetch',
    name: 'Fetch',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-fetch'],
    description: '获取和解析网页内容',
  },
  {
    id: 'memory',
    name: 'Memory',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-memory'],
    description: '持久化记忆',
  },
  {
    id: 'sequential-thinking',
    name: 'Sequential Thinking',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-sequential-thinking'],
    description: '步骤推理',
  },
]
```

---

## 完整流程

### 应用启动流程

```
启动 (main.ts)
  ├─→ 加载 MCP 设置
  │   └─→ getSettings().mcp
  │
  ├─→ 初始化 MCP Manager
  │   └─→ MCPManager.initialize(mcpSettings)
  │       ├─→ 检查 enabled 状态
  │       └─→ 为每个启用的服务器：
  │           └─→ connectServer(config)
  │               ├─→ 创建 MCPClient
  │               ├─→ client.connect()
  │               │   ├─→ 创建 transport
  │               │   ├─→ 创建 Client
  │               │   ├─→ 连接
  │               │   └─→ refreshCapabilities()
  │               └─→ clients.set(id, client)
  │
  ├─→ 注册 MCP 工具
  │   └─→ registerMCPTools()
  │       ├─→ MCPManager.getAllTools()
  │       ├─→ 转换为 ToolDefinition
  │       └─→ registerTool(definition, handler)
  │
  └─→ 系统就绪
      └─→ MCP 工具可与内置工具无缝混用
```

### 工具执行流程

```
Tool.execute(MCP tool)
  ├─→ registry.executeTool(toolId, args)
  ├─→ isMCPTool(toolId) → true
  ├─→ parseMCPToolId(toolId)
  │   └─→ { serverId, toolName }
  ├─→ executeMCPTool(toolId, args)
  │   └─→ MCPManager.callTool(serverId, toolName, args)
  │       └─→ client.callTool(toolName, args)
  │           └─→ this.client.callTool({ name, arguments })
  └─→ return result
```

### 服务器管理流程

```
添加服务器:
  User → UI → IPC: MCP_ADD_SERVER
    → MCPManager.connectServer(config)
    → registerMCPTools()
    → 返回成功

更新服务器:
  User → UI → IPC: MCP_UPDATE_SERVER
    → client.updateConfig(config)
    → client.disconnect()
    → client.connect()
    → registerMCPTools()

删除服务器:
  User → UI → IPC: MCP_REMOVE_SERVER
    → MCPManager.disconnectServer(serverId)
    → clients.delete(serverId)
    → 更新设置
```

---

## 配置存储

### MCP 设置

```typescript
// 存储在 AppSettings.mcp

interface MCPSettings {
  enabled: boolean
  servers: MCPServerConfig[]
}
```

### 持久化路径

```
AppData/
├── settings.json
│   └── mcp:
│       ├── enabled: true
│       └── servers: [...]
```

---

## 扩展点

### 添加新传输方式

1. 在 `types.ts` 中扩展 `MCPTransportType`
2. 在 `MCPClient.connect()` 中添加新的 transport 创建逻辑
3. 更新 UI 配置表单

### 自定义工具转换

1. 修改 `mcpToolToToolDefinition()` 添加自定义逻辑
2. 扩展 `ToolDefinition` 接口支持新字段
3. 在执行时处理自定义字段

### 添加新能力类型

MCP 协议支持扩展新的能力类型：

1. 在 `MCPServerState` 中添加新的能力数组
2. 在 `refreshCapabilities()` 中调用新的 list 方法
3. 创建相应的执行方法

---

## 错误处理

### 连接错误

```typescript
try {
  await MCPManager.connectServer(config)
} catch (error) {
  if (error.message.includes('timeout')) {
    // 连接超时
  } else if (error.message.includes('ENOENT')) {
    // 命令不存在
  } else if (error.message.includes('ECONNREFUSED')) {
    // SSE 服务器拒绝连接
  }
}
```

### 工具调用错误

```typescript
try {
  const result = await MCPManager.callTool(serverId, toolName, args)
} catch (error) {
  if (error.message.includes('Not connected')) {
    // 服务器未连接
    await MCPManager.reconnectServer(serverId)
  } else if (error.message.includes('Tool not found')) {
    // 工具不存在
    await MCPManager.refreshServer(serverId)
  }
}
```

### 自动重连

```typescript
// 可选实现：定期检查连接状态
setInterval(async () => {
  for (const [serverId, client] of MCPManager.clients) {
    const state = client.getState()
    if (state.status === 'error') {
      try {
        await MCPManager.reconnectServer(serverId)
      } catch (error) {
        console.error(`Reconnect failed for ${serverId}`)
      }
    }
  }
}, 60000)  // 每分钟检查
```
