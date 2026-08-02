# MCP 接入现状（截至 2026-08-01）

> 调查基线：分支 `experiment/castlabs-electron`，`@modelcontextprotocol/sdk` 声明 `^1.25.0`、实装 1.25.1。
> 注意：`@modelcontextprotocol/sdk` 是**旧单包线**（最高支持协议 `2025-11-25`）。
> 官方已于 2026-07-27 发布 v2 新包线 `@modelcontextprotocol/client` / `core` / `server`（2.0.0，完整支持 2026-07-28）。
> 本文只描述**现在代码里真实存在的东西**，不含规划。升级方向见 [mcp-upgrade-2026-07-28.md](./mcp-upgrade-2026-07-28.md)。

---

## 0. 一句话结论

我们只做 **MCP Client（host）**，不实现 MCP Server；协议面停在 2024/2025 的老形态：
**只用 stdio + 已废弃的 HTTP+SSE 两种传输、零鉴权、零通知订阅、零 Tasks/Sampling/Roots/Elicitation**，
且所有 MCP 工具对模型只暴露成**一个路由工具 `mcp_search`**。

---

## 1. 代码分布（三层 + 两个宿主）

| 层 | 路径 | 职责 | 是否碰 SDK |
| --- | --- | --- | --- |
| 骨架 | `packages/core/mcp/` | 纯逻辑：状态机、路由、工具 id、schema 转换、内容归一 | **否**（adapters 注入 `TClient`/`TTransport`） |
| 产品 | `packages/onething-runtime/src/mcp/` | 编排：增删改/连断刷、能力投影、IPC 结果与错误包装 | 否 |
| 装配 | `packages/onething-runtime/src/app/mcp/` | `MCPClient`（SDK 落点 1）、`MCPManager` 单例、`bridge.ts` 工具桥 | **是** |
| 宿主 · 桌面 | `apps/electron/src/main/ipc/mcp.ts` + `apps/electron/src/ipc/mcp.ts` + `packages/shared/ipc/mcp.ts` | 17 个 IPC 通道 | 否 |
| 宿主 · 服务端 | `apps/server/src/mcp-client.ts`（SDK 落点 2）+ `apps/server/src/http.ts` | `/api/mcp/*` 14 条 REST | **是** |
| 前端 | `packages/renderer/components/settings/mcp/` + `packages/renderer/data/mcpPresets.ts` | 设置页：列表 / 编辑 / 导入 / 预设 | 否 |

`packages/core` 被 boundary checker 禁止 import MCP SDK，因此 core 用 adapters 模式把 `Client`/`Transport` 当泛型参数注入
（`packages/core/mcp/client-state.ts:83` `CoreMCPConnectAdapters`），SDK 只在 app 装配层和 apps/server 各出现一次。

### 文件清单（core，共 ~2380 行）

```
packages/core/mcp/
├── types.ts            (86)   MCPServerConfig / MCPServerState / MCPToolInfo …
├── client-state.ts     (644)  连接/断开/更新配置的纯函数 + 归一化 + 超时
├── client-runtime.ts   (179)  CoreMCPClientRuntime：把上面的纯函数包成有状态对象
├── manager.ts          (271)  HeadlessMCPManager：Map<serverId, client> + 全量投影
├── router.ts           (576)  mcp_search 路由工具 + 模糊搜索 + catalog markdown 生成
├── tool-id-registry.ts (210)  工具 id 生成/解析/短名回查
├── tool-definition.ts  (210)  MCP inputSchema → 内部 ToolDefinition
├── bridge-runtime.ts   (179)  CoreMCPBridgeRuntime：桥接工具注册表
└── content.ts          (32)   工具结果内容归一
```

---

## 2. 实际使用的协议面

### 2.1 用到的 RPC（全部）

| 方法 | 调用点 | 时机 |
| --- | --- | --- |
| `initialize` | SDK `client.connect()` 内部 | 每次连接 |
| `tools/list` | `refreshMCPClientCapabilities` (`client-state.ts:534`) | 连接成功后 + 手动 refresh |
| `resources/list` | 同上 | 同上 |
| `prompts/list` | 同上 | 同上 |
| `tools/call` | `callMCPToolWithTimeout` (`client-state.ts:585`) | 模型经 `mcp_search` action=call |
| `resources/read` | `readMCPResource` (`client-state.ts:609`) | 仅 IPC/HTTP 手动调用，**模型无法触发** |
| `prompts/get` | `getMCPPromptMessages` (`client-state.ts:627`) | 同上 |

### 2.2 完全没有实现的协议面

- **通知**：`notifications/tools/list_changed`、`resources/updated`、`progress`、`message`、`cancelled` —
  全仓 `grep setNotificationHandler` 为 **0 命中**。服务端工具变了我们完全不知情。
- **订阅**：`resources/subscribe` / `unsubscribe` 从未调用。
- **客户端能力**：`Sampling`、`Roots`、`Elicitation` 全部未实现。构造 Client 时能力声明是空对象：
  ```ts
  // packages/onething-runtime/src/app/mcp/client.ts:52
  createClient: () => new Client({ name: 'one-thing', version: '1.0.0' }, { capabilities: {} })
  ```
  客户端名/版本是**硬编码字符串**，与 app 真实版本无关（apps/server 那份叫 `onething-web-server`）。
- **Tasks / MCP Apps / Skills over MCP** 等扩展：零接入。
- **结构化输出**：`outputSchema` / `structuredContent` 不读不传；`completion/complete`、resource templates、
  `annotations`、`_meta` 一律忽略。
- **进度与取消**：无 `progressToken`，无 `notifications/cancelled`。超时只是本地 `Promise.race` 丢弃结果，
  服务端那次调用仍在跑（`withMCPTimeout`, `client-state.ts:567`）。

### 2.3 内容类型支持

`normalizeMCPContent` (`packages/core/mcp/content.ts`) 只认三型：

- `text` → 原样
- `image` → `{ data, mimeType }`
- `resource` → `{ text, data, mimeType }`
- **其他一律降级成 text + `JSON.stringify`**（`audio`、`resource_link`、embedded resource 的完整结构都会被压扁）

---

## 3. 传输与鉴权

### 3.1 传输：只有两种，且远程那种已被规范废弃

```ts
// packages/core/mcp/types.ts:3
export type MCPTransportType = 'stdio' | 'sse'
```

- `stdio` → `StdioClientTransport`
- `sse` → `SSEClientTransport`（即 **HTTP+SSE 老传输**，自协议版本 `2025-03-26` 起就已 deprecated，
  2026-07-28 正式进入 Deprecated 生命周期状态）

**Streamable HTTP 从未接入**：SDK 里 `client/streamableHttp.js` 存在，全仓零引用
（`grep StreamableHTTP` 只命中 core 引擎里一个同名无关函数 `streamableToolResult`）。

UI 上 SSE 被写成 "HTTP endpoint"（`MCPServerDialog.vue:125`），
用户看到的是"HTTP 端点"，实际连的是老 SSE 通道。

### 3.2 鉴权：只有静态 header

```ts
// packages/onething-runtime/src/app/mcp/client.ts:44
return new SSEClientTransport(new URL(plan.url), {
  requestInit: plan.headers ? { headers: plan.headers } : undefined,
})
```

- 用户在设置页手填 headers（如 `Authorization: Bearer xxx`），明文存进 `settings.mcp.servers[].headers`。
- **没有 `authProvider`** → SDK 的 OAuth 能力（`client/auth.js`：DCR、PKCE、token 刷新、
  401 + `WWW-Authenticate` challenge 处理）全部未启用。SDK 在 401 时会尝试走 authProvider，我们没给，直接失败。
- 结论：**任何需要 OAuth 的远程 MCP server（Claude connectors 目录里的绝大多数）我们接不了。**

---

## 4. 生命周期

### 4.1 启动

- 桌面：`apps/electron/src/app/main-process.ts:216` → `initializeMCP()`（`main/ipc/mcp.ts:204`），
  **非阻塞**，失败只打日志。
- 服务端 / CLI daemon：`createOnethingBackend({ mcpAcp: true })` → `backend.ts:187`
  ```ts
  await MCPManager.initialize(settings.mcp || { enabled: true, servers: [] })
  await registerMCPTools()
  ```
- `HeadlessMCPManager.initialize` 对所有 `enabled` server 并发 `Promise.allSettled` 连接，
  单个失败只 `console.error`（`manager.ts:118`），不进 UI 告警、不重试。

### 4.2 超时常量

| 场景 | 值 | 位置 |
| --- | --- | --- |
| stdio 连接 | 60s | `client-state.ts:221` |
| sse 连接 | 30s | 同上 |
| 工具调用 | 60s（可 per-call 覆盖） | `client-runtime.ts:57` |

### 4.3 并发模型

同一 server 的工具调用**严格串行**（`client-runtime.ts` 的 `toolCallQueue`，注释说明 stdio 传输不耐受交错请求）；
不同 server 之间并行。读路径（`readResource`/`getPrompt`）不排队。
core 工具注册表把 mcp 工具 id 的 executionMode 也判成 `sequential`。

### 4.4 断线与刷新

- **没有自动重连**，没有 backoff、没有健康检查。stdio 子进程挂了就一直是 `error` 态，等用户去设置页点"重连"。
- **能力只在连接时抓一次**；之后要么用户手动 refresh，要么整个进程重启。
  由于 2.2 说的无 `listChanged` 订阅，长会话中工具表必然漂移。

---

## 5. 模型侧暴露方式（这是我们最"非主流"的一处设计）

### 5.1 单路由工具

```ts
// packages/core/mcp/tool-id-registry.ts:4
export const MCP_ROUTER_TOOL_ID = 'mcp_search'
export const LEGACY_MCP_ROUTER_TOOL_ID = 'tool_function'
```

`buildMCPToolsForAI` (`router.ts:86`) **不会**把 N 个 MCP 工具逐个塞进模型的 tools 列表，
而是只给一个 `mcp_search`，参数：

| action | 行为 |
| --- | --- |
| `search` / `find` | 模糊搜索工具（自研评分：完全匹配 100 / 前缀 80 / 包含 60 / 首字母缩写 45 / 序列匹配 20+） |
| `list` | 列全部 |
| `describe` | 打印单个工具的 inputSchema |
| `call` | 真正执行 |

同时把**全量工具文档**写成 markdown catalog 落盘（`buildMCPToolsCatalog`, `router.ts:353`；
路径 `getMCPToolsCatalogPath()`），供模型按需读取。

**权衡**：省 prompt token（100 个 MCP 工具不占 system tools 位），代价是每次用工具多一跳
（search → call），且工具发现质量取决于自研模糊匹配。

### 5.2 工具 id 与回查

- 规范 id：`mcp_<serverName>_<toolName>`；同名冲突再插 `serverId`。
- 解析走三级 fallback（`tool-id-registry.ts:parseToolId`）：sanitized→original map → `mcp:` 前缀切分 → `mcp_` 前缀切分。
- 还有一个 `findToolIdByShortName`：模型给了短名或干脆给了 server 名时，
  会**按参数名交集打分猜测**是哪个工具（`findToolByParameters`）。这是补模型行为的兜底，也是潜在误路由源。

### 5.3 权限

MCP 工具走 `permissionGuard: 'permission-gated'`，权限授予类型为 `'mcp'`，pattern 形如 `mcp:<serverId>`
（`packages/core/tools/registry.ts:577`、`permission-grants` 测试）。

---

## 6. 配置与 UI

- 配置存 `settings.mcp: { enabled: boolean, servers: MCPServerConfig[] }`（`DEFAULT_MCP_SETTINGS` 默认 `enabled: true`）。
- 设置页：`MCPSettingsPanel / MCPServerList / MCPServerItem / MCPServerDialog / MCPImportDialog`（共约 90KB Vue）。
- `MCPImportDialog` 支持从 `claude_desktop_config.json` 一类文件导入（走 `mcp:read-config-file` IPC），
  判定规则是**有 `url` 就当 sse，否则 stdio**（`useMCPServers.ts:290`）。
- 预设 `mcpPresets.ts`：6 个内置 server，**全部是 stdio**。

---

## 7. 类型重复（改传输类型要动三处）

同一组 MCP 类型在仓库里存在三份平行定义：

1. `packages/core/mcp/types.ts` — 引擎真源
2. `packages/shared/ipc/mcp.ts` — IPC 契约（字段逐字复制）
3. `packages/renderer/components/settings/mcp/useMCPServers.ts:14` / `mcpPresets.ts:24` — 前端局部再写一遍

`MCPTransportType = 'stdio' | 'sse'` 出现 4 次。任何传输扩展都必须同步修改，且**没有测试钉住这层一致性**。

---

## 8. 现状风险清单

| # | 风险 | 严重度 | 依据 |
| --- | --- | --- | --- |
| R1 | 唯一的远程传输 SSE 已被规范正式废弃，未来 server 只提供 Streamable HTTP 时全部连不上 | **高** | `types.ts:3`；spec 2026-07-28 Deprecations #2 |
| R2 | 无 OAuth → 接不了需要认证的远程 server | **高** | `client.ts:44` 无 authProvider |
| R3 | 无 `listChanged` 订阅 + 无自动重连 → 长会话工具表漂移、断线要人工救 | 中 | 零 `setNotificationHandler`；`manager.ts` 无 reconnect |
| R4 | 超时后不发 `cancelled`，服务端继续执行（stdio 场景可能留下孤儿进程/副作用） | 中 | `withMCPTimeout` |
| R5 | 内容类型窄（无 audio / resource_link / structuredContent），信息在归一层被压成字符串 | 中 | `content.ts` |
| R6 | 客户端身份硬编码 `one-thing@1.0.0`，服务端侧观测/风控无法区分版本 | 低 | `client.ts:52` |
| R7 | 类型四处重复无一致性测试 | 低 | 见 §7 |
| R8 | 单路由工具 + 自研模糊匹配 + 按参数猜工具，误路由不可观测 | 低-中 | `router.ts` / `tool-id-registry.ts` |

---

## 9. 一张图

```
模型
 └─ 唯一工具 mcp_search(action=search|find|list|describe|call)
      │
      ▼
CoreMCPBridgeRuntime  (packages/core/mcp/bridge-runtime.ts)
 ├─ 工具 id 生成/解析 (tool-id-registry)
 ├─ catalog markdown 落盘 (router.buildMCPToolsCatalog)
 └─ executeMCPTool ──▶ MCPManager (单例, app/mcp/manager.ts)
                          │  Map<serverId, MCPClient>
                          ▼
                    CoreMCPClientRuntime (core/mcp/client-runtime.ts)
                          │  adapters 注入
                          ▼
                    @modelcontextprotocol/sdk Client
                          │
                 ┌────────┴────────┐
              stdio              SSE(已废弃)
         StdioClientTransport   SSEClientTransport
                                 headers 静态注入, 无 OAuth
```
