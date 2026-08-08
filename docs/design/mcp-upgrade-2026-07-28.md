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

**P0-1 依赖替换** — ✅ 已完成（2026-08-06）
- ~~`@modelcontextprotocol/sdk@^1.25.0`~~ → 已迁到 `@modelcontextprotocol/client@^2.0.0`（实装 2.0.0，传递依赖 `core@2.0.0`）。
- 改动面如预期只有两个 SDK 落点：`packages/onething-runtime/src/app/mcp/client.ts`、`apps/server/src/mcp-client.ts`；
  `packages/core/mcp/` 零改动（adapters 架构兑现）。
- 边界检查同步：`@modelcontextprotocol/client` 加入 core 禁入模式与 main 层禁入模式（`app/mcp/client.ts` 维持白名单放行）。
- **验收已过**：typecheck 干净、全量 7596 例不回归、真机冒烟（假 legacy stdio server）走通 connect → tools/list → tools/call → disconnect。

**P0-2 协商模式选型** — ✅ 已完成（2026-08-06）
按文档建议选 `versionNegotiation: { mode: 'auto' }`（两个 SDK 落点同步）。
协商结果经新增适配口 `CoreMCPConnectAdapters.getNegotiatedProtocolVersion` 落进 `MCPServerState.protocolVersion`（断开时清空），
UI 在 server 卡片上以徽标显示协议版本，旧版服务器（< 2026-07-28）用警示色区分。
冒烟实测：legacy server 回落 initialize 后记录为 `2025-11-25`。

**P0-3 类型收敛（与 P0-1 并行做）** — ✅ 已完成（2026-08-06）
~~`'stdio' | 'sse'` 在仓库里重复 4 处且无一致性测试~~
已收敛为单一真源：`packages/core/mcp/types.ts` 定义，`packages/shared/ipc/mcp.ts` 改为 re-export，
`useMCPServers.ts` / `mcpPresets.ts` 改用 `MCPTransportType`；
新增 `packages/shared/ipc/__tests__/mcp-types.test.ts` 钉住一致性（transport 联合被字面 pin，
扩 `'http'` 时会在此处强制停下）。下一步加 `http` 传输只需从 core 改起。

### P1 — 传输与鉴权（补上两块最大空白）

**P1-1 Streamable HTTP** — ✅ 已完成（2026-08-06）
- 传输类型扩到 `'stdio' | 'sse' | 'http'`（core 单点改，全层自动跟随——P0-3 红利）；
  `CoreMCPTransportPlan` 加 http 分支（与 sse 同形 url/headers），超时归并为 stdio 60s / 远程 30s。
- 两个 SDK 落点各接 `StreamableHTTPClientTransport`（静态 headers 走 `requestInit`，与 SSE 同构）。
- UI：`MCPServerDialog.vue` 传输选择变为三个——**HTTP / SSE / Stdio**；SSE 标注 "Legacy (deprecated)"，
  徽标用警示色 token；http 与 sse 共用同一份 URL 字段区。导入判定反转：有 url 默认 **http**，
  仅显式 `type: 'sse'` 才走旧版。一致性测试的 union pin 同步更新（tripwire 按设计触发了一次）。
- **验收已过**：假 Streamable HTTP-only server 真机冒烟——connect → tools/list → tools/call → disconnect 全通，
  `protocolVersion` 正确记录为 `2025-11-25`（legacy 回落）；全量测试修复 1 例 token 违规后全绿。

**P1-2 OAuth** — ✅ 已完成（2026-08-06）
- 新增 `app/mcp/oauth/` 模块（runtime 侧）：
  - `credential-store.ts`——凭据**按 issuer 分键**的独立 JSON 存储
    （`mcp-oauth-credentials.json`，原子写 + 0600，不进 settings.json）；
  - `provider.ts`——结构实现 v2 SDK `OAuthClientProvider`（PKCE verifier 实例级存活、
    DCR 注册信息按 issuer 持久化、`redirectToAuthorization` 不直接开浏览器而是暂存 URL、
    `invalidateCredentials` 按最近 issuer 限定范围）；SDK 类型一律走本地镜像类型，边界不破。
  - `flow-manager.ts`——回环回调注册（专用端口 51823-51825，与 provider OAuth 的 1455/1457/54545 隔离）、
    **provider 实例跨连接尝试复用**（PKCE verifier 必须从 401 活到回调）、
    `finishAuth` 在**原发起 401 的 transport** 上兑现授权码 → 关旧 transport → `onAuthorized` 重连。
- 两个 SDK 落点（桌面 + web server）的 http/sse transport 均挂 `authProvider`；stdio 不动。
- 注册机制说明：**Client ID Metadata Documents 需要公网可托管的 metadata URL**，桌面/本地 server 形态
  不满足，`clientMetadataUrl` 留空走 **DCR**（SDK 自动回退，代码内有注释说明）。
- `MCPServerState.oauth` 三态面：`required`（带暂存的授权 URL）/ `authorized`（带 issuer）；
  UI 卡片对应 **Log in**（开 URL + 轮询直到翻转）/ **Authorized** / 展开区 **Re-authorize**
  （`mcp:logout-server` IPC + `POST /api/mcp/servers/:id/oauth/logout` REST，双宿主同构）。
- **验收已过**：假 AS（discovery + DCR + authorize/token，真 PKCE S256 校验）+ 假 Bearer MCP server
  真机冒烟 **12/12**——401→暂存 URL→模拟浏览器重定向→回环回调→自动重连→带 token tools/call→
  **吊销 token 后 SDK 自动 refresh_token 换新，无需重配**→logout 后重新要求登录→凭据文件 0600。
  全量测试 7610 绿，boundary 无新增违规。

**P1-3 连接自愈与身份** — ✅ 已完成（2026-08-06）
- **身份**：新增 `app/mcp/identity.ts` 晚绑端口（默认 `{name:'onething', version:'0.0.0'}`——
  workspace 包全是 0.0.0，只有根 package.json 有产品版本）。两个 SDK 落点的 `Client` 实现和
  OAuth `client_name` 统一改用它；Electron 启动时注入 `app.getVersion()`，server 读根 package.json。
  替换掉了硬编码 `one-thing@1.0.0` / `onething-web-server@1.0.0`。
- **超时→真取消**（同时关闭遗留 bug P1-4）：`callMCPToolWithTimeout` 从 Promise.race 本地丢弃
  改为 AbortController——超时 abort 使 SDK 拒绝请求**并通知服务端**（Streamable HTTP 按规范 abort
  每请求流；stdio/SSE 发 `notifications/cancelled`）。串行锁只在请求真正死亡后释放，
  不再放活到还在飞的请求上。`CoreMCPClientOperations.callTool` 签名加可选 `{signal}`。
- 重连半套（指数退避 1s→60s ×10）此前已在 core runtime 就位；连接失败进 UI 也已在
  server-orchestration 就位（`connectServer` 吞错后从 state 读回 error 返回 success:false）。
- **顺手补洞**：review 发现 `apps/server/src/mcp-client.ts` 从未挂上 OAuth provider（P1-2 只接了
  桌面落点）——已对齐 client.ts 接线（authProvider + attachTransport + 身份）。已知限制：
  web server 多 owner 场景下 OAuth 完成后的自动重连只覆盖默认 owner 的共享 manager。
- **验收已过**：6/6 真机冒烟（clientInfo=onething@9.9.9-smoke 出现在 initialize；hang 工具 500ms
  超时收到规范错误消息；服务端观测到挂起请求死亡；下一条调用 2ms 内放行）+ OAuth 冒烟 18/18 回归
  + 全量 7632 绿 + boundary 无新增。

### P2 — 新协议能力落地

**P2-1 `subscriptions/listen`** — ✅ 已完成（2026-08-06）
- 两个 SDK 落点的 `Client` 构造接入 **`ClientOptions.listChanged`**（tools/prompts/resources 三项，
  `autoRefresh: false`）：legacy 时代 SDK 自动注册 `notifications/*/list_changed` 处理器（仅在服务端
  声明能力时），2026-07-28 时代 SDK 每次 connect 自动 `subscriptions/listen` —— 断流重订阅由构造保证
  （每次（重）连都是新 Client）。SDK 默认 300ms 防抖。
- 变更到达 → client 侧 `handleCapabilitiesChanged`：`runtime.refreshCapabilities()` 重读并入 state
  （经 onStateChange 广播）→ 新晚绑端口 `capabilities-changed.ts` 扇出 → 两个宿主 IPC 装配层接到各自的
  `registerTools` 再生成模型侧目录。cycle（bridge←manager←client）用晚绑端口绕开。
- **验收已过**：假 Streamable HTTP server（声明 tools.listChanged + 常驻 GET SSE 流）推送
  `notifications/tools/list_changed` → 6/6 冒烟（tool-b 无重连出现、扇出计数、状态始终 connected）。

**P2-2 `server/discover` 预检** — ✅ 已完成（2026-08-06）
- core 新增 `probeMCPServerWithAdapters`（15s 超时）：一次性 throwaway client 连上候选 server，回报
  协商协议版本 / serverInfo / 能力摘要（含 listChanged 标注）；`UnsupportedProtocolVersionError`
  解析出 `requiredProtocol`，401 识别为 `authRequired`（探针 401 顺带预热了 OAuth 流，接着添加
  不会重复注册）。不落任何存储。
- 双落点：`probeMCPServerConfig`（桌面）/ `probeServerMCPConfig`（web server，stdio 门禁一致）。
  IPC 全链：`mcp:probe-server`（electron 三层）+ `POST /api/mcp/probe`（server，`RuntimeMCPAdapter.probeServer`）。
- UI：`MCPServerDialog` 新增 **Test** 按钮，结果内联——成功显示 `name@version · protocol X · 能力表`；
  失败区分"此服务器要求协议 X"/"需要 OAuth 登录（添加后连接即发起授权）"/原始错误。
- **验收已过**：4/4 冒烟（健康 server 全字段、OAuth server authRequired、死端口可读错误）。

**P2-3 缓存、顺序与保真** — ✅ 已完成（2026-08-06，缓存项评估后决定不引入）
- 确定性排序：早前 bug 修复已落地（`getAllTools` 等经 `sortedByServerAndName`）。
- **内容保真**：`normalizeMCPContent` 重写——`audio` 保留 data/mimeType（agent loop 的
  `mediaPartFromData` 会自动挂成真 audio part）；`resource_link` 保留 uri/name/description；
  `resource` 按规范读**嵌套** resource 对象（blob→data、保留 uri，旧扁平形兼容）；
  `structuredContent` 透传（SEP-2106）。`mcpContentToString` 新类型可读渲染
  （`[audio: mime]` / `[resource_link: name (uri)]` / resource 带 uri）。
- **缓存决策**：`CacheableResult.ttlMs/cacheScope` 评估后**不引入**——P2-1 的推送驱动失效才是
  漂移的正解，再叠一层 TTL 缓存会制造双失效源。SDK 侧 `InMemoryResponseCacheStore` 留作未来
  清单类请求优化，需要时单评。
- **schema 降级显式化**：`planJsonSchemaValidation` 新增 `caveats`——`$ref`/`anyOf`/`oneOf`/
  `allOf`/`not`/union 类型不再静默降级（`$ref`-only schema 现在规划为 passthrough JSON 而非假
  string）；caveat 写进模型侧参数描述（"[schema caveat: … validation is loose]"）。
- **错误码对齐**：`readMCPResource` 把 `-32602` 映射为可读的 "Resource not found: <uri>"。
- **验收已过**：10 例新单测 + 全量回归。

**P2-4 Tasks 防御** — ✅ 已完成（2026-08-06）
- `mcpTaskHandleNotice`：识别两种不请自来的 task handle 载体——结果上的 `task` 对象与
  `_meta["io.modelcontextprotocol/related-task"]`。命中时前置可读告示（taskId + status +
  "accepted-but-unresolved, 不会自动到达"）并标 `isError`，模型不会再把 handle 当成完成态，
  服务端自带内容保留在告示之后。
- 是否实现 `tasks/get` 轮询：属 P3 产品决策，防御已就位可随时后评。

**P2-5 Streamable HTTP 规范头** — ✅ 已完成（2026-08-06，注入面评估后保持关闭）
- `CoreMCPClientOperations.callTool` 选项加 `toolDefinition`；runtime 从 state.tools 查缓存定义
  （name/description/inputSchema）传给 SDK——2026-07-28 Streamable HTTP 连接上 SDK 自动镜像
  `Mcp-Method`/`Mcp-Name`（`Mcp-Param-*`）头并用 outputSchema 校验结果；legacy 连接忽略。
- **`x-mcp-header` 工具参数注入头**：评估后**保持关闭**——那是服务端经 toolDefinition 声明的
  新注入面，要做必须带白名单，当前无需求支撑，不在此开。
- **验收已过**：单测 + P1-3 冒烟回归 6/6。

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

1. **单路由工具 `mcp_search` 是否保留？** — ✅ 已按建议落地混合模式（2026-08-09）
   规范正往"工具平铺 + 确定性顺序 + 客户端缓存 + prompt cache 命中"的方向优化，前提是工具直接进 tools 列表。
   我们的 router 省 token 但绕开了这条路径，且多一跳。
   **落地形态**：`resolveMCPToolExposure`（core/mcp/router.ts）为唯一模式决策点——已连接工具总数
   ≤ `flatToolThreshold`（`MCPSettings.flatToolThreshold`，默认 20，`0` = 永远 router 即旧行为）时，
   每个工具以消毒 id（`mcp_<server>_<tool>`）直接进模型 tools 列表，不暴露 `mcp_search`；超过阈值回退
   单 router。两模式互斥。`planAgentLoopTools` 泛化为 MCP 工具数组（per-tool enabled + agent 白名单
   对每项生效）；stream-runtime / prompt 快照 / 设置页工具列表三处接缝统一走
   `getMCPToolDefinitionsForModel`（每回合实时计算，connect/disconnect/list_changed 后下一回合自动翻转）。
   catalog 文件只在 router 模式生成（flat 工具自描述）；平铺执行复用既有 `mcp_*` id 解析直连。
   **验收**：单测（阈值边界 20/21、阈值 0、互斥、禁用行为）+ 真机冒烟 5/5
   （2 工具平铺无 router、平铺直连执行、21 工具翻回 router-only、阈值 0 钉死 router）。

2. **协商模式选 `auto` 还是显式分档？** — ✅ 已按建议落地（P0-2）：`auto` + UI 显示实际协商结果。

3. **Tasks 做到哪一层？** 只做防御识别，还是完整轮询（`tasks/get` + `tasks/update`）？

4. **MCP Apps 要不要？** Claude 侧主推，但对我们意味着一套新的渲染沙箱与安全模型。

5. **OAuth 凭据存哪？** — ✅ 已落地为 MCP 单开（P1-2）：issuer 键控的独立文件
   `mcp-oauth-credentials.json`（0600、tmp+rename 原子写、与 settings.json 分离），
   含 serverId→issuer 持久绑定；不复用 provider OAuth 存储线。
