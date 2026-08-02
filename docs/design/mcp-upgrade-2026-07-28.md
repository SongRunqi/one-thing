# MCP 2026-07-28 升级方向

> 参考：
> - Anthropic 公告 <https://claude.com/blog/bringing-mcp-2026-07-28-to-claude>
> - 规范变更 <https://modelcontextprotocol.io/specification/2026-07-28/changelog>
> - TS SDK 仓库 <https://github.com/modelcontextprotocol/typescript-sdk>
>
> 现状基线见 [mcp-current-state-2026-08-01.md](./mcp-current-state-2026-08-01.md)。

---

## 0. 结论先行

**这是 MCP 迄今最大的破坏性改版：核心变成无状态。**
`initialize`/`notifications/initialized` 握手被删除，`Mcp-Session-Id` 被删除，
每个请求自带协议版本与能力（放 `_meta`）。服务端从此可跑在 serverless / edge 上。

**TypeScript SDK 已经就绪 —— 不需要等。**
官方在 2026-07-27 同日发了**两条线**，很容易看错：

| 包 | 最新版 | 发布时间 | 协议支持 |
| --- | --- | --- | --- |
| `@modelcontextprotocol/sdk`（旧单包，**我们现在用的**） | 1.30.0 | 2026-07-27 17:54 UTC | 最高 `2025-11-25` |
| `@modelcontextprotocol/client` / `core` / `server` …（**v2 新包线**） | **2.0.0** | 2026-07-27 23:55 UTC | **完整实现 2026-07-28** |

v2 把 SDK 拆成了 monorepo scoped 包：`client` / `core` / `server` / `server-legacy` / `middleware` / `codemod`。
实测 `@modelcontextprotocol/client@2.0.0` 的运行时 `.mjs` 里已含
`server/discover`、`subscriptions/listen`、`tasks/get`、`_meta` 信封校验、
协议版本 pin、以及 `versionNegotiation: { mode: 'auto' | 'legacy' }` 的双模协商。

> 易踩的坑：v2 的 `core` 里仍有 `LATEST_PROTOCOL_VERSION = "2025-11-25"`
> —— 那是**旧协商路径的兼容常量**，不是能力上限。只看这个常量会误判成"SDK 没跟上"。

**因此升级路线是"迁移到 v2 客户端"，而不是"等 SDK"。**

---

## 1. 规范变更清单 × 对我们的影响

### 1.1 Major changes（7 条）

| # | 变更 | 我们受影响吗 |
| --- | --- | --- |
| 1 | 删除协议级 session 与 `Mcp-Session-Id`；list 端点不再随连接变化；跨调用状态改由 server 铸造 handle 走普通工具参数 | **几乎无痛**。我们从不读写 session id（全仓零命中），也不假设 list 结果随连接变化 |
| 2 | 无状态化：删 `initialize` 握手，改为每请求携带 `io.modelcontextprotocol/protocolVersion` + `clientCapabilities`，身份走 `clientInfo`/`serverInfo`，版本不匹配返回 `UnsupportedProtocolVersionError` | **受影响但由 SDK 承担**。我们要做的是把硬编码的 `one-thing@1.0.0` 换成真实身份，并让能力声明不再是空 `{}` |
| 3 | 新增 `server/discover`（服务端 MUST 实现），客户端可先探测版本/能力/身份，也可当 STDIO 兼容性探针 | **新能力**：v2 客户端已提供，可用于"添加 server"时的真实预检 |
| 4 | 删除 HTTP GET 端点与 `resources/subscribe`/`unsubscribe`，统一成 `subscriptions/listen`（单条长连 POST 流，按类型订阅 `toolsListChanged` / `promptsListChanged` / `resourcesListChanged` / `resourceSubscriptions`） | **强相关**：正好补上现状 R3（工具表漂移） |
| 5 | 删除 `ping`、`logging/setLevel`、`notifications/roots/list_changed`；日志级别改为按请求放 `_meta` 的 `io.modelcontextprotocol/logLevel` | 三个都没用，**零影响** |
| 6 | 实验性 Tasks 移出核心成为扩展 `io.modelcontextprotocol/tasks`：`tasks/result`（阻塞）→ `tasks/get` 轮询 + `tasks/update` 回传输入，删 `tasks/list`，允许服务端**不经 opt-in 直接返回 task handle** | **需要防御**：即使不做 Tasks，服务端也可能返回 handle。现在我们会把它当普通结果压成字符串 |
| 7 | 引入 **MRTR（Multi Round-Trip Requests）**，取代服务端发起请求（`roots/list`、`sampling/*`）的旧路子 | 我们本来就没实现 server→client 请求，**零影响** |

### 1.2 Minor changes（挑相关的）

| 变更 | 对我们的意义 |
| --- | --- |
| `ClientCapabilities`/`ServerCapabilities` 新增 `extensions` | 接 Tasks / MCP Apps 的开关从这里协商 |
| `tools/list` SHOULD 返回确定性顺序 | 我们的 catalog 与 tools 拼装应稳定排序，**直接影响 prompt cache 命中率** |
| Streamable HTTP POST 必带 `Mcp-Method`、`Mcp-Name` 头；支持 `x-mcp-header` 从工具参数注入自定义头 | 传输迁移的必做项；`x-mcp-header` 是**新注入面**，要白名单 |
| 新增 `CacheableResult`：list/read 类结果带 `ttlMs` + `cacheScope`（`public`/`private`） | 让"能力刷新"从"连接时抓一次"变成有依据的 TTL 缓存 |
| resource not found 错误码 `-32002` → `-32602` | 错误分类若有硬编码需同步 |
| 错误码分配策略：`-32000..-32019` 实现自定义，`-32020..-32099` 归规范 | 我们没有自定义错误码，注意别新占 |
| OAuth：授权响应 SHOULD 带 `iss`，客户端 **MUST** 校验；DCR 须指定 `application_type`；凭据必须按 issuer 存储、换 AS 必须重新注册 | 做 OAuth 时的硬性约束（v2 客户端已内建 `iss` 校验） |
| `inputSchema`/`outputSchema` 放宽到任意 JSON Schema 2020-12，`structuredContent` 放宽到任意 JSON，新增 `$ref` 解析要求 | **我们的 schema→zod 转换会更容易沉默降级**（见 P2-3） |
| 删除 `notifications/elicitation/complete` 与 `elicitationId`；改由 MRTR 重试原请求获知结果 | 未来做 elicitation 按新模式设计 |

### 1.3 Deprecations（12 个月弃用窗口）

| 被弃用 | 我们的处境 |
| --- | --- |
| **Roots / Sampling / Logging** | 全都没实现 —— **意外站在了正确的一边**，今后也不要实现 |
| **HTTP+SSE 传输** 正式列 Deprecated | **我们唯一的远程传输**。最紧迫的一条 |
| `includeContext` 的 `"thisServer"` / `"allServers"` | 未用 |
| **OAuth 2.0 DCR（RFC7591）** 作为注册机制被弃用，改推 **Client ID Metadata Documents** | 我们还没做 OAuth —— **可以直接按新方式做，不必先欠 DCR 的债** |

### 1.4 Claude 侧同步动作

MCP Apps（会话内交互 UI）、Enterprise-managed auth（IdP 一次授权）、connector 可观测性面板、
MCP tunnels（内网 server 免公网暴露）；connectors 目录已有 950+ server。

**对我们的含义**：目录里那 950+ server 是最大的现成生态，门票是 **Streamable HTTP + OAuth**
—— 正好是我们两块最大的空白。

---

## 2. 差距矩阵

| 能力 | 现状 | 目标 | 谁来做 |
| --- | --- | --- | --- |
| 远程传输 | HTTP+SSE（已废弃） | Streamable HTTP | v2 已提供 `StreamableHTTPClientTransport` |
| 鉴权 | 静态 header | OAuth + Client ID Metadata Documents，凭据按 issuer 存 | v2 已内建 PKCE / `iss` 校验 / DCR 回退 |
| 版本协商 | SDK 内部 initialize | 每请求 `_meta` + `server/discover` 预检 | v2 `versionNegotiation` |
| 能力变更感知 | 无 | `subscriptions/listen` | v2 已提供 |
| 列表缓存 | 连接时抓一次 | `ttlMs` / `cacheScope` 驱动 | 我们写策略 |
| 长任务 | 60s 超时丢弃 | Tasks 扩展轮询 | v2 有 `tasks/get`；我们决定做到哪层 |
| 客户端身份 | 硬编码 `one-thing@1.0.0` | 真实 name/version + 能力声明 | 我们改 |
| 结构化结果 | 压成 text | `structuredContent` 任意 JSON | 我们改归一层 |
| 断线自愈 | 手动 | 重连 + backoff | 我们写 |
| Roots/Sampling/Logging | 未实现 | 已弃用，不要实现 | ✅ 天然对齐 |
| Session 依赖 | 无 | 无状态 | ✅ 天然对齐 |

---

## 3. 分期路线

### P0 — 迁移到 v2 客户端（一切的前置）

**P0-1 依赖替换**
- `@modelcontextprotocol/sdk@^1.25.0` → `@modelcontextprotocol/client@^2.0.0`（+ 传递依赖 `core@2.0.0`）。
- zod 无摩擦：v2 要求 `zod ^4.2.0`，我们正好是 `^4.2.0`（实装 4.2.1）。
- 官方提供 `@modelcontextprotocol/codemod` 辅助迁移，以及 `server-legacy` 兼容包（我们不做 server，用不到）。
- 影响面只有**两个文件**——这是我们 adapters 架构的红利：
  `packages/onething-runtime/src/app/mcp/client.ts`、`apps/server/src/mcp-client.ts`。
  `packages/core/mcp/` 因为从不 import SDK，理论上零改动（只需确认 `CoreMCPClientOperations` 的方法签名仍对得上）。
- **验收**：现有 stdio + SSE server 全部照常连通，`bun run test` 不回归。

**P0-2 协商模式选型**
v2 提供 `versionNegotiation: { mode: 'auto' | 'legacy' }`。
建议 `auto`（新服务端走 2026-07-28，老服务端自动回落），并把协商结果落进 `MCPServerState` 供 UI 显示
"此服务器协议版本：2026-07-28 / 2025-11-25（旧）"。

**P0-3 类型收敛（与 P0-1 并行做）**
`'stdio' | 'sse'` 在仓库里重复 4 处且无一致性测试
（`core/mcp/types.ts:3`、`shared/ipc/mcp.ts:8`、`useMCPServers.ts:14`、`mcpPresets.ts:24`）。
下一步要加 `http` 传输，不先收敛必漏。

### P1 — 传输与鉴权（补上两块最大空白）

**P1-1 Streamable HTTP**
- 传输类型扩到 `'stdio' | 'sse' | 'http'`；`CoreMCPTransportPlan`（`core/mcp/client-state.ts:50`）加分支；
  两个 SDK 落点各接 `StreamableHTTPClientTransport`。
- UI：`MCPServerDialog.vue` 传输选择从两个变三个；把现在误导性的 "SSE / HTTP endpoint" 文案改对，
  SSE 明确标注"旧版（将废弃）"。
- 导入判定升级：`useMCPServers.ts:290` 现在是"有 url 就 sse"，应改为"有 url 默认 http，
  显式 `type: 'sse'` 才 sse"。
- **验收**：能连上一个只提供 Streamable HTTP 的 server 并成功 `tools/call`。

**P1-2 OAuth**
- 用 v2 客户端的 auth 能力；注册机制**直接做 Client ID Metadata Documents**，DCR 只作兼容回退。
- 硬性约束：校验授权响应 `iss`；凭据**按 issuer 分键存储**，换授权服务器必须重新注册。
- token 不进 `settings.json` 明文，走独立凭据存储
  （可参考 `packages/onething-runtime/src/app/providers/auth/oauth-manager.ts` 那条线）。
- UI：server 卡片需要"登录 / 已连接为 X / 重新授权"三态。
- **验收**：连上一个需要 OAuth 的公开 connector，token 过期自动刷新且无需重配。

**P1-3 连接自愈与身份**
- `HeadlessMCPManager` 加重连（指数退避 + 上限），连接失败进 UI 而不只是 `console.error`（`manager.ts:118`）。
- 客户端身份换成真实 app name + version（`client.ts:52`），喂给新协议的 `clientInfo`。
- 工具调用超时后向服务端发取消，补现状 R4（现在超时只是本地丢弃，服务端还在跑）。

### P2 — 新协议能力落地

**P2-1 `subscriptions/listen`**
订阅 `toolsListChanged` / `promptsListChanged` / `resourcesListChanged`，
从根上解决工具表漂移（现状 R3）。这是我们第一次引入 server→client 推送通道，
需同时设计**断流重订阅**。

**P2-2 `server/discover` 预检**
"添加 server"时先探测版本/能力/身份，替代现在"连上去才知道行不行"；
处理 `UnsupportedProtocolVersionError`，UI 给"此服务器要求协议 X"。

**P2-3 缓存、顺序与保真**
- `CacheableResult` 的 `ttlMs`/`cacheScope` 接管能力刷新策略。
- `getAllTools()`（`manager.ts:141`）目前按 Map 插入序拼装，随连接顺序抖动 →
  按 `(serverId, toolName)` 稳定排序。**投入极小、直接提 prompt cache 命中率**。
- `normalizeMCPContent`（`content.ts`）补 `audio`、`resource_link`，embedded resource 别压扁；
  `structuredContent` 透传。
- schema→zod（`app/mcp/bridge.ts`）：规范放宽到任意 JSON Schema 2020-12 + `$ref` 后，
  现有转换沉默降级的面会变大 —— 不支持的 schema 要明确标注，别静默丢字段。
- 错误码对齐（resource not found 认 `-32602`）。

**P2-4 Tasks 防御**
即便不实现 Tasks，也要能识别服务端**不请自来的 task handle**，
给出可读错误而不是把 handle 压成字符串塞给模型。做完防御再评估是否实现 `tasks/get` 轮询。

**P2-5 Streamable HTTP 规范头**
必带 `Mcp-Method` / `Mcp-Name`；评估 `x-mcp-header`（工具参数注入头）——**新注入面，需白名单**。

### P3 — 生态扩展（需产品决策）

- **Tasks 完整实现**：长任务不再受 60s 超时约束，与我们已有的 `run_in_background`/bash_output 心智相近，值得做。
- **MCP Apps**：会话内渲染交互 UI。收益高但需渲染沙箱 + 安全模型，**建议单开设计**。
- **Skills over MCP**：与我们已有 skills 体系概念重叠，先想清定位。
- **明确不做**：Roots、Sampling、Logging（已弃用，12 个月后移除）。

---

## 4. 优先级

| 期 | 内容 | 紧迫性 | 前置 |
| --- | --- | --- | --- |
| P0-3 | 类型收敛 + 一致性测试 | 先做 | 无 |
| P0-1/2 | 迁到 `@modelcontextprotocol/client@2.0.0` + 协商模式 | **高**（一切的地基，且只动两个文件） | 无 |
| P1-1 | Streamable HTTP | **高**——SSE 已判死刑 | P0 |
| P1-2 | OAuth（Client ID Metadata Documents） | **高**——950+ connector 的门票 | P0 |
| P1-3 | 重连 / 真实身份 / 取消 | 中 | P0 |
| P2-3 | tools 确定性排序 | 中（投入极小，收益直接） | P0 |
| P2-1/2/4/5 | 订阅 / 预检 / Tasks 防御 / 规范头 | 中 | P1 |
| P3 | Tasks 完整 / MCP Apps / Skills over MCP | 低（产品决策） | P2 |

**关键判断**：P0 迁移的成本远低于直觉 —— 因为 `packages/core/mcp/` 用 adapters 模式把 SDK 隔在外面，
SDK 只在两个文件里出现。这次架构分层的收益在这里兑现了。

---

## 5. 待拍板的决策点

1. **单路由工具 `mcp_search` 是否保留？**
   规范正往"工具平铺 + 确定性顺序 + 客户端缓存 + prompt cache 命中"的方向优化，前提是工具直接进 tools 列表。
   我们的 router 省 token 但绕开了这条路径，且多一跳。
   建议：保留 router 作为大规模场景的降级，支持"少于 N 个工具时直接平铺"的混合模式。

2. **协商模式选 `auto` 还是显式分档？** 建议 `auto` + UI 显示实际协商结果。

3. **Tasks 做到哪一层？** 只做防御识别，还是完整轮询（`tasks/get` + `tasks/update`）？

4. **MCP Apps 要不要？** Claude 侧主推，但对我们意味着一套新的渲染沙箱与安全模型。

5. **OAuth 凭据存哪？** 复用 provider OAuth 的存储线还是 MCP 单开？涉及多 profile 隔离。
