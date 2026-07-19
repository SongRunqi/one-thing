# 外部 Agent 接入方案(Claude Code / Codex / pi)

> 状态:方案已确认;**P0 已实施**(2026-07-18),P1 起待实施
> 日期:2026-07-18

## 实施进度

- ✅ **P0 全部落地**(见 §8 表):
  - core:`AgentToolCall.externallyExecuted` 标记 + `AgentTurnStreamEvent` 扩宽(tool-metadata/tool-partial-result/tool-result)+ runner pass-through(不执行/不回灌/不续轮/防伪造)——`packages/core/agent-loop/{types,stream,runner}.ts`
  - ACP 映射:`tool_call`/`tool_call_update` → 结构化工具事件(tracker 含 finish 前终态兜底、cancelled→aborted)——`packages/onething-runtime/src/agent-loop/providers/acp.ts`
  - 权限桥:`ACPPermissionBridge` 可注入接口(manager `setPermissionBridge` 晚绑定,promptContexts 归因)+ Electron 侧 `registerACPPermissionBridge` 接 `Permission.ask`;server/无桥场景保留旧 permissionMode 行为——`packages/onething-runtime/src/acp/{types,client,manager}.ts`、`src/main/acp/permission-bridge.ts`
  - Connector 契约:`@onething/runtime/external-agents`(types + AcpConnector;子路径已登记 package.json + electron.vite/server vite/vitest 三份 alias 表,web 不需要)
  - 测试:runner pass-through 2 例、ACP 夹具回放 2 例、权限桥 4 例、AcpConnector 2 例;engine 零改动(chunk 管线天然吃外部事件)
- ✅ **P1 Claude Code connector 已实施**(2026-07-18,路线 A:SDK 作协议驱动 + `pathToClaudeCodeExecutable` 指向本机已装 CLI,复用订阅登录):
  - `ClaudeCodeConnector`(`external-agents/claude-code-connector.ts`):SDKMessage → 归一事件全映射(stream_event 三段式工具流、thinking、assistant 兜底回填、user tool_result 配对、result→finish + cost 走 provider-data、未结算工具终态兜底、subagent 嵌套事件过滤);`canUseTool` → `ExternalAgentPermissionHandler`(无 handler / 抛错 / 拒绝一律 deny,fail-closed);resume 用持久化的 `ExternalAgentSessionLink`;per-session AbortController 支撑 interrupt
  - 通用 `createExternalAgentProvider` 包装器(connector → AgentProvider,session-established 时回调持久化 link)
  - factory 注册 `claude-code-agent`(经 `externalAgentConnectors` 注入,跳过 capability 台账包装,与 acp 同待遇)
  - Electron 接线 `src/main/external-agents/`:CLI 探测(~/.local/bin → /usr/local → homebrew → which)、权限桥接 `Permission.ask`、SessionLink 持久化(模块自有 `<store>/external-agents/session-links.json`,不动会话存储层——与 §3.2 "写进 meta.json" 的偏差,原因:避免动 JSONL 仓储格式)、dispose 挂 shutdownACP
  - 配置面:`AIProvider.ClaudeCodeAgent`、defaults(enabled:false)、`claudeCodeAgentBuiltinProvider`(仅 base 列表,web 不含)
  - 依赖:`@anthropic-ai/claude-agent-sdk@0.3.214`(根 package.json;打包须排除其平台二进制 optionalDependencies——P5 打包项)
  - 测试:connector 夹具回放 4 例(全映射/权限矩阵/嵌套过滤+兜底/resume+interrupt)
  - **待办(P1 收尾)**:设置页探测/启用卡、真机验证(选 provider 开聊、权限卡、重启后 resume)
- ⏳ P2 Codex、P3 pi、P4 互调、P5 打磨 待实施
> 目标:让 onething 能以第一方体验接入 Claude Code、OpenAI Codex、pi 等终端 agent —— 在应用内直接对话使用,数据流(流式文本 / 思考 / 工具步骤 / 权限审批)完整封装进现有事件体系,并支持 agent 互相调用。

---

## 0. 结论速览(TL;DR)

1. **切入点不是从零建**:代码库里已经存在一条完整的外部 agent 通道 —— ACP(Agent Client Protocol)集成(provider id `'acp'`,`packages/onething-runtime/src/acp/`,Electron 与 headless server 双宿主)。本方案 = **泛化这条缝隙 + 修复两个保真缺口 + 补上互调能力**。
2. **统一抽象层选在 `AgentProvider.streamTurn`**(`packages/core/agent-loop/types.ts`):它天然与 Vercel AI SDK 解耦,事件词汇与三家 agent 的原生协议可一一映射。**但有一个必须先解决的核心耦合**:当前 `AgentTurnStreamEvent` 不含工具结果类事件,且 runner 收到 `tool-call-done` 会在本地查表执行工具并回灌续轮——对"工具已由外部执行完"的 agent,这会造成副作用重复执行。P0 须在 core 引入 **externally-executed 工具事件**(provider 直接产出工具结果,runner 只转发不执行、不回灌)。
3. **传输层做成可插拔的 Connector**:每个 agent 用其官方嵌入协议——
   - Claude Code → `@anthropic-ai/claude-agent-sdk`(in-process,`canUseTool` 回调桥权限)
   - Codex → `codex app-server`(常驻子进程,JSON-RPC over stdio,双向审批 RPC)
   - pi → `pi --mode rpc`(常驻子进程,JSONL over stdio,`extension_ui` 子协议桥交互)
   - 其他任何 ACP 兼容 agent → 现有 ACP 通道兜底
4. **两个必须修的现存缺口**(即使不加新 agent 也值得修):
   - ACP 的 `tool_call` 事件目前被压平成 `reasoning-delta` 文本 → 改为映射成结构化 `tool-call-*` 事件,外部 agent 的工具步骤才能以 `Step`/`tool-call` content part 形态渲染与持久化;
   - `ACPClient.requestPermission` 目前按配置自动放行/拒绝,未接应用权限 UI → 桥入 `Permission.ask`,外部 agent 的审批以普通权限卡渲染。
5. **agent 互调走"应用中介"模型**:app 的 AI 通过内置 `agent` 工具调用外部 agent;外部 agent 通过 onething 暴露的 MCP server 反向调用 app 工具及其他 agent。所有跨 agent 调用都流经 app = 统一权限卡口 + 完整可观测。

---

## 1. 三家 Agent 的程序化接入面(调研结论)

### 1.1 Claude Code(`@anthropic-ai/claude-agent-sdk`,v2.1.211+)

官方文档:code.claude.com/docs/en/agent-sdk/

- **形态**:TypeScript SDK,`query({ prompt, options })` 返回 `AsyncIterable<SDKMessage>`;SDK 内部自带并驱动 Claude Code CLI 原生二进制(本质是 CLI 的进程包装,但对宿主呈现为 in-process API)。Electron main(Node)可直接使用。
- **消息类型**:`system/init`(带 `session_id`、tools、mcp_servers、model)→ `assistant`(content blocks:`text` / `tool_use{id,name,input}`)→ `user`(`tool_result{tool_use_id,content}`)→ `result`(`subtype: success|error_*`、`usage`、`total_cost_usd`、`num_turns`)。
- **增量流**:`options.includePartialMessages: true` 时产出 `stream_event`(Anthropic 原生 `content_block_delta`:`text_delta` / `input_json_delta`,thinking 亦有 delta)。
- **权限桥(核心)**:`options.canUseTool(toolName, input, {signal, suggestions})` → 返回 `{behavior:'allow', updatedInput?, updatedPermissions?}` 或 `{behavior:'deny', message, interrupt?}`。六步评估链:PreToolUse hook → disallowedTools → ask 规则 → permissionMode(`default|acceptEdits|plan|dontAsk|bypassPermissions|auto`)→ allowedTools 自动放行(不回调)→ `canUseTool`。
- **会话**:`system/init` 捕获 `session_id`;`options.resume: id` 续、`fork: id` 分叉、`continue: true` 接最近;多轮可用 async generator 作 `prompt`(streaming input)。会话文件默认在 `~/.claude`,可用 `sessionStore` 适配器接管持久化。
- **自定义工具注入**:`mcpServers` 支持 stdio/http/sse 外部 server,也支持 **SDK 进程内 MCP server**(`createSdkMcpServer`/custom tools),工具名 `mcp__<server>__<tool>`,`allowedTools: ["mcp__onething__*"]` 放行。
- **中断**:`AbortController` signal;permissionMode 每次 `query()` 固定,改模式需新 query/fork。
- **认证与合规**:走 `ANTHROPIC_API_KEY` 或用户本机已有的 Claude 订阅登录(`~/.claude`)。注意:Anthropic 政策不允许**面向第三方分发的产品**代理 claude.ai 登录;onething 作为用户个人的本地宿主、复用用户自己的登录属个人使用场景,但若未来对外分发需切到 API key 模式并在设置页明示。

### 1.2 OpenAI Codex

官方文档:developers.openai.com/codex(noninteractive / sdk / app-server / mcp)

三条通道,推荐 **app-server**(官方 SDK 的底座,定位就是"给第三方 app 嵌入"):

| 通道 | 形态 | 判定 |
|------|------|------|
| `codex exec --json` (+ `exec resume <id>`) | 一次性子进程,stdout JSONL(`thread.started/turn.*/item.*`) | 无交互审批(须预设 sandbox/approval),不适合对话式 UI |
| `@openai/codex-sdk` | TS 库:`codex.startThread()`/`thread.run()`/`resumeThread(id)` | 简洁,但事件与审批面不如直连 app-server 完整 |
| **`codex app-server`** | 常驻子进程,双向 JSON-RPC 2.0(stdio JSONL;亦支持 ws/unix socket) | **推荐** |

app-server 协议要点:

- **握手**:`initialize`(`clientInfo{name,title,version}` + `capabilities`,`clientInfo.name` 进 OpenAI 合规日志)→ `initialized` 通知。
- **线程**:`thread/start { model, cwd, approvalPolicy, sandbox, personality }` → `thread.id`;`thread/resume`、`thread/fork`(可带 `lastTurnId` 截断)、`thread/loaded/list`。
- **事件流**(server→client 通知):`turn/started` → `item/started` → `item/agentMessage/delta`(增量文本)→ `item/completed` → `turn/completed`(带 usage)/`turn/failed`。item 类型:`agentMessage`、`reasoning`、`commandExecution`(command/cwd/status)、`fileChange`(changes)、`mcpToolCall`、`webSearch`、plan 更新 —— 与 onething 的 Step 模型逐类对应。
- **审批(server→client 双向 RPC)**:`item/commandExecution/requestApproval`(itemId/threadId/turnId、reason、command、cwd、availableDecisions)、`item/fileChange/requestApproval`(changes、grantRoot)、`tool/requestUserInput`、MCP `mcpServer/elicitation/request`(accept/decline/cancel);客户端答复后收 `serverRequest/resolved`,item 以 `completed|failed|declined` 收尾。
- **中断**:`turn/interrupt { threadId, turnId }` → turn `status:"interrupted"`。
- **认证**:`account/login/start`(chatgpt OAuth / apiKey)+ `account/updated` 通知;默认复用本机 `codex login` 凭据。
- 每线程独立 `approvalPolicy`(untrusted/on-request/never)与 `sandbox`(read-only/workspace-write/danger-full-access)。

### 1.3 pi(badlogic/pi-mono,`@earendil-works/pi-coding-agent`)

- **形态**:推荐 `pi --mode rpc`(常驻子进程,JSONL over stdin/stdout,官方为嵌入设计)。备选:`createAgentSession()` 直接内嵌 Node 进程(官方对 Node 宿主的推荐,但与 Electron main 同进程有崩溃/依赖耦合风险,列为备选)。
- **命令(stdin)**:`prompt`(可带 images)、`steer`(运行中插话)、`follow_up`(排队后续)、`abort`、`get_state`、`get_messages`、`set_model`、`cycle_thinking_level`、`switch_session`、`get_session_stats`、`get_commands`(扩展命令/模板/skills);响应统一 `{type:"response", command, success, data}`。
- **流式事件(stdout)**:`message_update.assistantMessageEvent` delta 齐全:`text_start/text_delta/text_end`、`thinking_start/thinking_delta/thinking_end`、`toolcall_start/toolcall_delta/toolcall_end`、`done(stop|length|toolUse)`、`error(aborted|error)`;工具执行另有 `tool_execution_start/update/end`(`toolCallId/toolName/args`,update 流式吐输出);还有 `compaction_start/end`、`queue_update`。
- **交互桥**:扩展的 `select/confirm/input/editor` 对话在 stdout 发 `extension_ui_request` 并阻塞,client 以相同 `id` 回 `extension_ui_response`;权限门即扩展 + confirm → 可直接桥到 onething 权限 UI。`notify/setStatus/setWidget` 为 fire-and-forget。
- **会话**:JSONL 会话文件,`--session <path|id>`、`--fork`、`--session-dir <dir>`(可指到 onething 数据目录)、`--no-session`、`--name`。
- **模型/认证**:多 provider(Anthropic/OpenAI/Google/自定义 `models.json`),API key 环境变量或 `/login`;`--tools/--exclude-tools` 裁剪工具面;扩展系统(`pi.registerTool` 等)是反向注入 onething 工具的通道之一(另一条为 MCP)。

### 1.4 共性归纳

三家协议在语义上同构,均可无损映射到统一事件模型:

| 语义 | Claude Code | Codex app-server | pi RPC |
|------|-------------|------------------|--------|
| 会话标识 | `session_id`(init 消息) | `thread.id` | session 文件/id |
| 续会话 / 分叉 | `resume` / `fork` | `thread/resume` / `thread/fork` | `--session` / `--fork` |
| 文本增量 | `stream_event: text_delta` | `item/agentMessage/delta` | `text_delta` |
| 思考增量 | thinking delta | `reasoning` item | `thinking_delta` |
| 工具调用开始 | `tool_use` block / `input_json_delta` | `item/started`(commandExecution 等) | `toolcall_start` + `tool_execution_start` |
| 工具结果 | `user: tool_result` | `item/completed` | `tool_execution_end` |
| 轮次收尾 + 用量 | `result`(usage、cost) | `turn/completed`(usage) | `done` + `get_session_stats` |
| 权限审批 | `canUseTool` 回调 | `requestApproval` 双向 RPC | 扩展 confirm → `extension_ui_request` |
| 中断 | AbortController | `turn/interrupt` | `abort` |
| 运行中插话 | streaming input(排队) | 新 user turn | `steer` / `follow_up` |
| 注入宿主工具 | MCP(含进程内 SDK server) | MCP server 配置 | MCP / 扩展 registerTool |

---

## 2. 现有架构与切入点

### 2.1 已有的 ACP 通道(本方案的地基)

- **执行层缝隙**:`AgentProvider { id, capabilities, streamTurn?, runTurn? }`(`packages/core/agent-loop/types.ts`);`runAgentLoop`(`packages/core/agent-loop/runner.ts`)只认这个接口,完全不关心背后是 HTTP LLM 还是子进程 CLI。
- **事件词汇(核对后的准确表述)**:provider 可产出的 `AgentTurnStreamEvent` 是 7 个:`reasoning-delta / text-delta / tool-call-start / tool-call-delta / tool-call-done / provider-data / finish`(types.ts:279-288 的 Extract 联合)。`tool-metadata / tool-partial-result / tool-result / turn-start / turn-end` 属于更宽的 `AgentStreamEvent`,由 **runner 在本地执行工具后**经 `onEvent` 发出(runner.ts:416,475)。
- **核心耦合(P0 必须解决)**:runner 收到 `tool-call-done` 后会在本地 toolMap 查找并执行同名工具(runner.ts:392-424),再把 tool 消息回灌 provider 续轮(runner.ts:477-478)。对外部 agent,工具是它**自己已经执行完**的——直接产 `tool-call-done` 会导致:查不到工具 → 错误结果回灌;查到同名工具(如 bash)→ **副作用真实重复执行**。因此 P0 须扩展 core:允许 provider 产出带 `externallyExecuted` 标记的工具事件(含结果),runner 对其 pass-through(不执行、不回灌、不因此续轮),engine 的 Step 状态机相应走到终态。
- **路由**:`resolveOnethingProviderRuntimeRoute`(`packages/onething-runtime/src/providers/agent-runtime-route.ts`)返回 `{kind:'acp'|'deepseek'|'agent'|'unsupported'}`;`provider-routing.ts` 按 kind 分发;`agent-loop/providers/factory.ts` 对 `'acp'` 返回 `createACPAgentProvider`。
- **进程层**:`packages/onething-runtime/src/acp/client.ts`(spawn + stdio web streams + `@agentclientprotocol/sdk` `ClientSideConnection` + 背压队列 + stderr tail + 空闲清理)、`manager.ts`(`ACPManager`:initialize/streamPrompt/cancelSession/shutdown,per-agent client map)。
- **双宿主**:Electron 接线在 `src/main/acp/`;headless server 有 `ServerSafeACPManager`(`apps/server/src/runtime.ts`)+ `/api/acp/*` 端点 —— 协议在 runtime 包、spawn 接线在各宿主,这个拆分是现成范式。
- **配置与 UI**:`ACPAgentConfig { id, name, command, args, env, cwd, model, permissionMode, mcpServers, ... }`(`src/shared/ipc/acp.ts`);设置页 `ConnectionsSection.vue` ACP 分支;每个 ACP agent 以 `'acp'` provider 下的一个"模型"出现在 ModelSelector。
- **会话映射**:`ACPSessionRecord { localSessionId, acpSessionId, cwd, ... }`(client.ts)。

### 2.2 两个保真缺口(P0 修复对象)

1. **工具步骤被压平**:ACP 的 `tool_call`/`tool_call_update` 通知目前被映射成一条 `reasoning-delta`("ACP tool activity updated."),导致外部 agent 的工具活动既不能渲染成 `Step`/工具卡,也不能结构化持久化。
2. **权限自动决策**:`ACPClient.requestPermission`(client.ts:479)按 `config.permissionMode('allow'|'reject')` 自动放行或拒绝,不经过应用的 `Permission.ask` → 用户在 UI 上看不到、也批不了外部 agent 的敏感操作。

### 2.3 为什么统一层选 `AgentProvider` 而不是别处

- 备选一"新建平行引擎":会分叉事件模型、持久化与权限管线(`AgentEngine` 只是 echo 级试验品),否决。
- 备选二"只走 ACP,全部靠社区 ACP 适配器":一套协议覆盖面最广,但保真受制于第三方适配器(审批语义、thinking 档位、fork、steer 等各家原生能力在 ACP 里有损),且 pi 无官方 ACP 适配器。
- **选定**:统一层留在 `AgentProvider`/`AgentTurnStreamEvent`(引擎、持久化、权限、UI 全部免费复用),传输层按 agent 用原生协议,ACP 作为通用兜底。三家原生协议语义同构(§1.4),映射无损。

---

## 3. 统一抽象设计

### 3.1 分层

```
┌─ 渲染层(现有,零改动理念)──────────────────────────────┐
│  MessageList / StepsPanel / 权限卡  ← SessionEvent 驱动      │
└──────────────────────────────────────────────────────────────┘
┌─ 引擎层(现有 + P0 一次性扩展)─────────────────────────┐
│  StreamEngine / runAgentLoop  ← AgentProvider.streamTurn     │
│  P0:externally-executed 工具事件 + runner pass-through       │
└──────────────────────────────────────────────────────────────┘
┌─ 归一层(新增,packages/onething-runtime/src/external-agents)┐
│  ExternalAgentProvider(implements AgentProvider)             │
│    · 事件映射:native → AgentTurnStreamEvent                 │
│    · 权限映射:native approval → Permission.ask               │
│    · 会话映射:ExternalAgentSessionLink                      │
└──────────────────────────────────────────────────────────────┘
┌─ 连接层(新增,每 agent 一个 Connector)────────────────┐
│  ClaudeCodeConnector(Agent SDK, in-process)                  │
│  CodexConnector(app-server 子进程, JSON-RPC/stdio)           │
│  PiConnector(pi --mode rpc 子进程, JSONL/stdio)              │
│  AcpConnector(现有 ACPClient 重构收编,通用兜底)            │
└──────────────────────────────────────────────────────────────┘
┌─ 进程层(宿主相关,Electron src/main / apps/server)────┐
│  spawn 接线、生命周期、崩溃重启、退出清理                     │
└──────────────────────────────────────────────────────────────┘
```

### 3.2 Connector 接口(核心新类型)

```ts
// packages/onething-runtime/src/external-agents/types.ts
export interface ExternalAgentConnector {
  readonly id: string                        // 'claude-code' | 'codex' | 'pi' | 'acp:<agentId>'
  readonly capabilities: ExternalAgentCapabilities
  ensureSession(link: SessionLinkRequest): Promise<ExternalAgentSessionLink>
  streamTurn(req: ExternalTurnRequest): AsyncIterable<ExternalAgentEvent>
  interrupt(link: ExternalAgentSessionLink): Promise<void>
  steer?(link: ExternalAgentSessionLink, text: string): Promise<void>   // pi steer / claude streaming input
  dispose(): Promise<void>
}

export interface ExternalAgentCapabilities {
  streamingText: boolean; thinking: boolean; toolSteps: boolean
  permissionBridge: 'callback' | 'rpc' | 'stdio-dialog' | 'none'
  resume: boolean; fork: boolean; steer: boolean
  imagesIn: boolean; mcpInjection: 'in-process' | 'config' | 'none'
  // 并发语义:一个 connector 进程能否同时服务多个 onething 会话
  concurrentSessions: 'multiplexed' | 'per-process'
}

export interface ExternalAgentSessionLink {
  localSessionId: string
  connectorId: string
  externalSessionId: string      // claude session_id / codex thread.id / pi session id
  cwd: string
  createdAt: number; lastUsedAt: number
}
```

- `ExternalAgentEvent` 复用 `AgentTurnStreamEvent` 联合体 + P0 新增的 externally-executed 工具事件,外加 `permission-request`、`session-established`、`agent-status` 三个 connector 级事件(由归一层消费,不出归一层)。
- `ExternalAgentSessionLink` **持久化到会话 meta.json**(现有 `ACPSessionRecord` 只在内存),应用重启后可 `resume` 外部会话,消息历史无须重放给 agent —— 外部 agent 自己持有上下文,onething 持久化的转写仅用于本地渲染与检索。**落盘时机:turn 开始即写**(而非 turn 结束),崩溃后 resume 不丢链接;重启进入该会话时,把半截 assistant 消息按现有流收尾兜底标记 interrupted,并提示"外部会话可能领先于本地转写"。
- **并发模型(各家不同,须在 connector 内封装)**:Codex app-server 原生多线程并发(multiplexed);Claude Agent SDK 每次 query 独立子进程(per-process,天然并发);pi 一个 RPC 进程同一时刻只有一个活跃会话(`switch_session` 模型)→ PiConnector 采用 **per-session 进程池**(每个活跃 onething 会话一个 pi 进程,空闲回收),`steer`/`interrupt` 一律绑定 SessionLink 而非"当前会话"。

### 3.3 注册与路由(最小侵入)

- `agent-runtime-route.ts` 增加 `kind: 'external-agent'`(`'acp'` 保留并逐步归并);`factory.ts` 对该 kind 返回 `createExternalAgentProvider(connectorRegistry, ...)`。
- 配置模型:沿用 `ProviderConfig` + 新 `ExternalAgentConfig`(superset of 现有 `ACPAgentConfig`:command 探测路径、默认 cwd、permission 策略、模型档位、MCP 注入开关)。
- **UI 呈现**:沿用 `ProviderFamily` 卡片范式 —— Claude Code 并入 claude family、Codex 并入 openai/codex family、pi 独立卡;ModelSelector 里外部 agent 作为可选"模型"出现(现有 ACP 已是此形态),带 agent 徽标区分"经由本机 CLI"。

---

## 4. 数据流映射(完整封装)

### 4.1 事件映射表(native → `AgentTurnStreamEvent` → `SessionEvent`)

| 语义 | Claude Code | Codex app-server | pi RPC | 归一事件 | 到达 UI 的形态 |
|------|-------------|------------------|--------|-----------|----------------|
| 会话建立 | `system/init.session_id` | `thread/started` | 启动响应 | `provider-data` + SessionLink 落盘 | — |
| 文本增量 | `text_delta` | `item/agentMessage/delta` | `text_delta` | `text-delta` | `content:part(text)` 增量 |
| 思考增量 | thinking delta | `reasoning` item delta | `thinking_delta` | `reasoning-delta` | thinking 折叠区 |
| 工具调用形成 | `input_json_delta` → `tool_use` block | `item/started`(command/fileChange/mcp) | `toolcall_start/delta/end` | `tool-call-delta` → `tool-call-done` | `step:added`(type `tool-call`/`command`/`file-write`,status running) |
| 工具执行进度 | —(SDK 内执行) | item 进度 | `tool_execution_update` | `tool-partial-result` | `tool:execution-update`(流式输出) |
| 工具结果 | `user: tool_result` | `item/completed` | `tool_execution_end` | `tool-result` | `step:updated`(completed/failed + result) |
| 轮收尾 | `result`(usage/cost) | `turn/completed`(usage) | `done` | `finish`(usage) | `stream:complete`;usage 记入 token 账本 |
| 错误 | `result.subtype: error_*` | `turn/failed` | `error` | `finish(error)` | `stream:error` / ErrorCard |

说明:表中 `tool-partial-result`/`tool-result` 指 P0 新增的 **externally-executed 工具事件**(带标记、由 provider 直接产出),与本地工具执行管线发出的同名事件在 engine 侧显式区分,避免渲染层把外部步骤当本地工具卡的"执行中"状态机走(等一个永远不来的本地结果)。

映射的落点:外部 agent 的一轮 = onething 一条 assistant `ChatMessage`,工具活动进 `steps[]` + `tool-call` content part,`provider`/`model` 字段记 connector id + agent 模型 → **持久化与回放与内建 provider 完全同构,渲染层零新增概念**。

**turn 语义**:外部 agent 一次 `streamTurn` 内部含多轮"模型↔工具"往返,而 runner 视角只有 1 个 turn(`turnIndex` 全为 0,usage 按 turn 共享——chat.ts:50,82)。方案:connector 在每个外部工具边界**合成递增 turnIndex**,使 steps 面板按轮分组与 usage 归属保持现有假设;文本与工具卡的穿插顺序以事件到达序为准。

### 4.2 Step 类型映射细则

- Codex `commandExecution` → `Step{type:'command', title: command, description: cwd}`;`fileChange` → `type:'file-write'`(diff 塞 `toolCall.args`,复用现有 diff UI);`mcpToolCall`/`webSearch` → `type:'tool-call'`。
- pi `toolName`(bash/read/edit/...)按名称映射到对应 StepType,兜底 `tool-call`。
- Claude Code `tool_use.name`(Bash/Read/Edit/Write/...)同上;`mcp__*` 前缀 → `tool-call` 并显示 server 名。

### 4.3 输入方向

- 用户消息(含图片附件)→ connector:`prompt`(pi 支持 images;Claude streaming input 支持 content blocks;Codex `sendUserTurn` 文本为主,图片能力按版本探测后按能力位裁剪)。
- 运行中用户再输入 → capabilities.steer 为真则 `steer`(pi)/streaming input(Claude);否则按现有"排队为下一轮"处理。
- 中断按钮 → `interrupt()`(AbortController / `turn/interrupt` / `abort`),UI 复用现有 stream:aborted 链路。

---

## 5. 权限与交互桥

### 5.1 原则

**外部 agent 的自带审批一律降级为"问宿主",由 onething 的权限系统统一决策**。绝不默认 `bypassPermissions`/`danger-full-access`/自动 allow。

### 5.2 各家接法

| Agent | 机制 | 接法 |
|-------|------|------|
| Claude Code | `canUseTool` 回调 | 回调内 `await Permission.ask({type:'external-agent-tool', title: toolName, metadata:{input}, sessionId, ...})`;allow → `{behavior:'allow'}`(可透传 updatedInput),reject → `{behavior:'deny', message}`。permissionMode 固定 `default` |
| Codex | `requestApproval` 双向 RPC | JSON-RPC server 请求挂起 → `Permission.ask`(command/cwd/reason/changes 进 metadata,渲染命令卡/diff 卡)→ 决策映射到 `availableDecisions`;approvalPolicy 固定 `on-request`,sandbox 默认 `workspace-write` |
| pi | 扩展 confirm → `extension_ui_request` | 随 connector 附带一个内置 pi 扩展(permission gate),其 confirm 对话经 RPC 到 connector → `Permission.ask`;`extension_ui_response` 回决策 |

- **桥做成可注入接口(双宿主关键)**:connector 不直接调 `Permission.ask`,而是依赖注入的 `ExternalPermissionBridge`;`streamTurn` 请求携带 `localSessionId/messageId` 穿透到桥(`Permission.ask` 必填这两项,当前 ACPClient 拿不到——这是现状挂起风险的根源之一)。Electron 宿主注入 `Permission.ask` 实现;apps/server 宿主注入策略式实现(默认保留现 permissionMode 自动决策,或路由 gateway `targetChannel` 走远程审批),避免 server 场景请求因无应答者永久挂起。
- 复用 `Permission` 状态机全部现成能力:合并等价请求、串行 promptOrder、`permission:request/queued/settled` 事件、`targetChannel` 路由(Electron IPC / gateway 远程审批 1/2/3 都自动获得——**微信/Telegram 上也能批外部 agent 的命令**)。
- `Permission.Response` 语义映射:`once` → 单次放行;`session` → connector 侧记忆(Claude `updatedPermissions`、Codex 决策 `approved_for_session` 类决策、pi 扩展内存);`workdir` → 写 onething 自己的 grants,由归一层在 ask 前先查(三家一致的前置放行层,避免依赖各家持久化差异)。
- pi 的非权限对话(`select/input/editor`)与 `notify/setStatus`:P0 只接 confirm(权限)与 notify(toast),其余按能力降级返回默认值,后续再考虑通用对话卡。

### 5.3 安全边界

- cwd 白名单:外部 agent 只允许在会话绑定的工作目录(及显式添加的目录)内工作;spawn 前校验。
- 凭据:一律复用用户本机 CLI 登录态(`~/.claude`、`codex login`、pi `/login`),onething 不存任何 agent 的 API key;设置页只做"检测到/未登录"状态展示与引导命令。
- 子进程环境变量按需最小化传递(沿用 `login-shell-env.ts` 取 PATH)。

---

## 6. Agent 互调

### 6.1 App AI → 外部 agent:内置 `agent` 工具

```
createExternalAgentTool(): AgentTool
  args: { agent: 'claude-code'|'codex'|'pi', prompt, cwd?, sessionRef?: 'new'|'continue' }
  permissionGuard: 'permission-gated'
  execute: connector.streamTurn(...) → ctx.onPartialResult 流式转写
```

> 注意:不能用 `permissionGuard: 'external'`——核对发现该枚举值语义与直觉相反:它不在可注入/自动执行集合内,`planToolPermissionGuardInjection` 会直接跳过该工具、不注入给模型(permission-guards.ts:17-48,有测试锁定)。用 `'permission-gated'`,每次调用出权限卡。

- 主对话里 app 的 AI(任意内建 provider)可把任务委派给外部 agent,工具卡内实时显示外部 agent 的步骤摘要;子会话作为 `ExternalAgentSessionLink` 挂在当前会话 meta,支持"继续上次委派"。
- 外部 agent 在工具内触发的权限请求照走 §5 桥 → 出现在同一会话的权限卡流里(带"来自 codex"署名)。

### 6.2 外部 agent → App 工具:MCP 注入

onething 暴露一个 MCP server(新增 `packages/onething-runtime/src/external-agents/mcp-server.ts`):

- **Claude Code**:用 SDK 进程内 MCP server(`createSdkMcpServer`)零子进程注入,`allowedTools: ["mcp__onething__*"]`。
- **Codex / pi / ACP**:以 stdio MCP server 形式注入各自配置(`mcpServers` 字段三家皆支持);入口命令复用现有 daemon 基建(`src/main/cli/daemon-client.ts` 的 unix-socket 协议,MCP 入口进程做薄转发,连到运行中的 onething)。
- 暴露的工具集(可配置):**默认只有 `send_notification` + `run_agent` 两件**(2026-07-18 用户确认)。`memory_search/memory_save` 暂缓——记忆系统待用户集中梳理后再决定是否开放;`practice_log/music_control` 等留作设置页可选项。以及——

### 6.3 外部 ↔ 外部:`run_agent` 中介工具

MCP server 里再暴露一个 `run_agent { agent, prompt, cwd }` 工具 → 任何被注入的外部 agent 都能调用其他 agent(claude-code 让 codex 去 review,pi 让 claude-code 写实现)。调用链始终经过 onething:

```
codex ──mcp──▶ onething run_agent ──connector──▶ claude-code
                     │(Permission.ask:是否允许 codex 调用 claude-code?)
                     └(转写、步骤、用量全部落在发起会话的 steps 里)
```

- 防环:调用链深度上限(默认 2)+ 同一 (agent, cwd) 在链上出现即拒;`run_agent` 默认 `ask` 权限。
- **调用者归因(防环与署名的前提)**:MCP 协议本身不携带"这次调用来自哪个 agent"。方案:**按 agent 会话签发独立 MCP 凭据**——注入 MCP 配置时带唯一 env token,onething 侧以 token 关联调用链状态(深度、环检测)与权限卡署名("来自 codex")。此机制作为接口约定在 P0 定稿、P4 实现并列入交付判据。

---

## 7. 可用性设计

- **零配置接入**:设置页 "Agents" 分区自动探测本机 CLI(`which claude / codex / pi` + 版本 + 登录态),一键启用;未安装则给安装命令。探测逻辑放 connector 的 `probe()` 静态方法。
- **会话体验**:外部 agent 会话与普通会话同构——同一会话列表、同一消息 UI、tab、检索;新建会话时选了外部 agent 即要求绑定 cwd(目录选择器,记忆最近项目)。中断/重试/编辑重发按能力位降级(如不支持编辑重发则提示 fork)。
- **状态可见**:connector 子进程状态(starting/ready/busy/crashed)进现有"运行时状态面板"(variable 体系);崩溃自动重启一次并以 ErrorCard 呈现 stderr tail。
- **用量记账**:`finish.usage`(Claude 有 cost_usd,Codex/pi 有 tokens)记入现有 token 账本,按 connector 维度聚合展示。字段兼容性:`AgentUsage` 与 `OnethingUsageRecordInput` 当前无 cost 字段(costUSD 由 pricing 估算)→ 账本入口增加可选 `costUSD`(provider 实报优先于估算),并按登录态标注 `subscription/api` 计费来源。
- **headless 对齐**:归一层与 connector 全部在 `packages/onething-runtime`(Electron-free);Electron 与 apps/server 各自只做 spawn 接线(沿用 ACP 的双宿主拆分),web 端经 server 获得同等能力。
- **进程生命周期**:app 退出时 `dispose()` 全部子进程(挂 before-quit);空闲超时回收(沿用 ACPManager cleanup timer);dev 模式注意泳道清理不误杀(见 `scripts/dev-unified.mjs` 现有约定)。

---

## 8. 分期落地计划

| 期 | 内容 | 交付判据 |
|----|------|----------|
| **P0 地基修复(改动面进 core,中等偏大)** | ① core 事件模型扩展:`AgentTurnStreamEvent` 增加 externally-executed 工具事件(types.ts)+ runner pass-through 分支(不执行/不回灌/不续轮)+ engine Step 状态机映射(agent-loop-executor.ts);② ACP `tool_call` → 结构化工具事件(acp.ts);③ `requestPermission` → 可注入 `ExternalPermissionBridge`(Electron 接 `Permission.ask`,server 注入策略式实现);④ 抽出 `ExternalAgentConnector` 接口(含 `concurrentSessions` 并发语义与 MCP 归因 token 约定),现有 ACPClient 重构为 `AcpConnector` | 现有 ACP agent 的工具步骤以 Step 卡渲染并到达 completed/failed 终态(录制 JSONL 夹具回放验证);权限走应用权限卡且 server 路径不挂起;既有测试全绿 |
| **P1 Claude Code** | `ClaudeCodeConnector`(Agent SDK):流式/thinking/steps、canUseTool 桥、resume/fork、SessionLink 持久化、CLI 探测 + 设置卡 | 应用内与 Claude Code 完整对话,批权限,重启后续会话 |
| **P2 Codex** | `CodexConnector`(app-server):JSON-RPC 客户端、事件/审批映射、turn/interrupt、登录态检测 | 同上判据;命令/diff 审批卡可用 |
| **P3 pi** | `PiConnector`(RPC):delta/工具事件映射、steer/follow_up、permission-gate 扩展 + extension_ui 桥 | 同上判据;运行中可插话 |
| **P4 互调** | `agent` 内置工具 + onething MCP server(`run_agent` + 精选工具)注入三家 | app AI 可委派外部 agent;外部 agent 可互调且全链路出权限卡 |
| **P5 打磨** | ProviderFamily 卡片、cwd 选择器记忆、用量面板、崩溃恢复、headless server 端点、gateway 远程审批实测 | 真机验收清单过 |

P1–P3 相互独立,顺序可按需调整,但**三者都依赖 P0 对 core 事件模型与 Connector 并发语义的定稿**;P4 依赖 P0 定稿的 MCP 归因 token 约定。每期含 vitest 单测(协议映射用录制的 JSONL 夹具回放,禁真 spawn —— 记取 radio.test.ts mock 失效写穿真实目录的教训,夹具目录一律用 tmp)。

---

## 9. 风险与开放问题

| 风险 | 应对 |
|------|------|
| 三家协议均在快速演进(Codex app-server 有 experimental 面;Agent SDK 版本节奏快) | connector 内做版本探测 + 能力位降级;协议映射集中在单文件便于跟进;pin CLI 最低版本 |
| Claude 订阅登录的分发合规(不得代理 claude.ai 登录给第三方) | 个人使用复用本机登录;若未来分发,设置页强制 API key 模式并明示计费 |
| 双权限系统叠加造成审批疲劳 | 外部 agent 侧固定为"全问宿主",疲劳治理只在 onething 一侧做(once/session/workdir 记忆 + 未来档位) |
| 子进程僵尸/泄漏(常驻 app-server、pi rpc) | 统一由 connector registry 持有,before-quit dispose + 空闲回收 + 崩溃重启上限 |
| 外部 agent 的会话文件与 onething 转写双份存储,可能漂移 | 明确 onething 转写只作渲染/检索快照,真源在外部会话(resume 靠 SessionLink),不做双向同步 |
| `run_agent` 互调的失控风险(深链、递归、并发费用) | 深度上限 + 环检测 + 默认 ask 权限 + 用量记账可见 |
| Windows(stdio JSONL/编码/路径) | P1–P3 先 mac 验收,Windows 列入 P5 专项 |

**开放问题(2026-07-18 用户确认进展):**

1. ~~外部 agent 是否出现在主 ModelSelector?~~ **已确认:并列出现,带徽标。**
2. ~~MCP 注入的默认工具集?~~ **已确认:默认 `send_notification` + `run_agent` 两件;记忆查写暂缓(记忆系统待集中梳理),其余留设置页可选。**
3. P1 先做 Claude Code 还是 Codex?(方案默认:Claude Code——SDK 形态实现成本最低;认证已确认可复用本机 `~/.claude` 订阅登录。SDK 路线代价与缓解:CLI 二进制不捆绑、配置指向本机已装 `claude`;pin 版本防 breaking change;connector 层补 hang 超时兜底;订阅额度与终端共享)

---

## 附:Review 记录(2026-07-18)

**自审修订:**

- 修订 1:初稿曾考虑"全走 ACP 适配器"路线,因 pi 无官方适配器、审批语义有损而改为"原生 connector + ACP 兜底"。
- 修订 2:Codex 图片输入、`sendUserTurn` 细节文档面未完全确认,已改为"能力位探测 + 降级",不作硬承诺。
- 修订 3:`ExternalAgentSessionLink` 必须持久化(现有 ACPSessionRecord 仅内存),已在 §3.2 标注。

**独立评审(对照代码逐条核验,10 条意见,已全部吸收进正文):**

- [blocker] runner 对 `tool-call-done` 会本地二次执行并回灌续轮 → P0 增加 externally-executed 工具事件 + runner pass-through(§2.1、P0①)。
- [major] `AgentTurnStreamEvent` 词汇表述错误(实为 7 个,`tool-result` 等属 runner 侧 `AgentStreamEvent`)→ §2.1 已更正。
- [major] `permissionGuard:'external'` 语义相反(会被跳过不注入)→ 改用 `'permission-gated'`(§6.1)。
- [major] 权限桥直连 `Permission.ask` 会挂起 server 路径且缺 messageId 上下文 → 改为可注入 `ExternalPermissionBridge`(§5.2)。
- [major] connector 并发模型未定义(pi 单进程单活跃会话)→ capabilities 增 `concurrentSessions`,pi 走进程池(§3.2)。
- [major] MCP 通道无调用者归因,防环/署名无从落地 → 按 agent 会话签发 MCP token(§6.3)。
- [minor] turn 语义坍缩 → connector 合成递增 turnIndex(§4.1)。
- [minor] 账本无 costUSD 字段 → 入口增可选字段,实报优先(§7)。
- [minor] SessionLink 落盘时机 → turn 开始即写 + 半轮 interrupted 兜底(§3.2)。
- [minor] P0 判据补"夹具回放下 Step 到达终态"(§8)。

评审同时确认:方案与 CLAUDE.md 架构约定无冲突(不在 Electron main 加数据库、归一层在 runtime 包、渲染层不绕 platformApi);§2 其余代码事实声称全部核实属实。
