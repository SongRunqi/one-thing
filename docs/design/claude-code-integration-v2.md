# Claude Code 接入 v2：把外部 agent 变成一等同事

日期：2026-08-05。状态：**设计定稿，未实施**。
起因：真机走查 F3——Iris（`providerId: 'claude-code-agent'`）在群聊回合里调用 SDK 的 `AskUserQuestion`，挂 2 分 11 秒无人应答、UI 渲染成 `[object Object]`、界面上没有任何停止按钮可以停掉它。
基线：外部 agent 通路 P0/P1 已实施（`external-agents-integration.md`），Actor v3 是唯一协作运行时，D8 观测体系已落地。

---

## 0. 诊断：症状是四个 bug，病是一个

侦察逐条钉死了十个缺口（证据见 §9 附表）。但把它们摆在一起看，会发现它们**不是十个独立的洞，是同一个结构选择的十个断面**：

> **外部 agent 今天是「provider 槽里的一个异类」，而不是「系统里的一个同事」。**

`external-agents/provider.ts:50` 那一行 `supportsTools: false` 是整件事的源头。它一置，`agent-loop/stream-runtime.ts:682-699` 整条工具装载短路，于是：

- 没有工具面 → **venue 门、工具白名单、permissionGuard 全部失效**（不是被绕过，是那条路径根本没走到）；
- 没有 `send_message` → **发言权不归我们**，Iris 在群里说话全靠收养兜底搬运正文（降级冒充设计）；
- 工具在 CLI 进程里执行 → 审批只剩 `canUseTool` 一根独木桥，而这根桥**没接 callId**（卡渲染不出）、**没走策略门**（无超时兜底）；
- 回合不在我们的工具循环里 → **观测面看不见它**（scheduler-log 无外部事件、agent 快照无 waitingOn）；
- SDK 自带交互工具（`AskUserQuestion`）**在我们这儿没有对应概念** → 无处落地，只能挂着。

**所以正确的修法不是补十个补丁，是重新定义外部 agent 在架构中的位置。** 本方案给出这个定义，以及它蕴含的全部改造。

## 0.1 设计原则（宪法）

1. **同事平权**：外部 agent 与本地 agent 在群里遵守**同一套规则**——同一道 venue 门、同一条审批链、同一颗停止按钮、同一个观测面、同一个发言权协议。差别只在「思考在哪里发生」，不在「守什么规矩」。
2. **发言权归房间，永不外包**：`send_message`（speak 动词）是房间租约的兑现方式。任何 agent——本地或外部——都必须持牌经此发言。收养兜底是兜底，不是通路。
3. **需要人回答的事，要么有一等落点，要么当场拒绝**：不允许任何调用挂着等一个不会来的答案。
4. **每一条等待都有 deadline**：沿用既有纪律（120s 无人值守、30min 软提醒、10min 回合墙钟），外部通路不设例外。
5. **能力差异是声明出来的，不是猜出来的**：外部 agent 支持什么（steer？中断？MCP 归因？）由 connector 声明，运行时按声明降级，不靠 try/catch 试探。

---

## 1. 目标架构：三层重构

```
┌── 协作层（Actor v3）──────────────────────────────────────────┐
│  AgentActor 心智循环 —— 不知道也不关心思考在哪里发生            │
│      │ MindPort.runConversationalTurn(lease, drive)           │
├──────┴────────────────────────────────────────────────────────┤
│  ② 执行器抽象（新）AgentExecutor                               │
│     local（引擎+我们的工具循环） │ external（SDK/ACP 连接器）    │
│     —— 两侧对上层呈现同一个契约：回合、工具事件、审批、中断      │
├───────────────────────────────────────────────────────────────┤
│  ① 宿主工具面（新）HostToolSurface                             │
│     协作工具（send_message/board/history/notebook）以 MCP 形式  │
│     注入外部 SDK；SDK 自带工具经 venue 门过滤                   │
│  ③ 交互协议（新）InteractionRegistry                           │
│     agent 提问 → 用户应答 → 结果回流（与 Permission 并列的一等） │
└───────────────────────────────────────────────────────────────┘
```

三块新东西，每块解决一类结构问题：

| 新建 | 解决 | 消灭的补丁 |
| --- | --- | --- |
| **① 宿主工具面（MCP 注入）** | 发言权归房间、venue 门对外生效、审批走正规链 | 收养兜底冒充通路、canUseTool 独木桥、工具面失效 |
| **② AgentExecutor 抽象** | 本地/外部对上层同构，观测/停止/能力声明统一 | provider 槽里的 if-else、supportsTools 短路、interrupt 无人调 |
| **③ InteractionRegistry** | 「提问」成为一等概念 | AskUserQuestion 无处落地、无限等待 |

---

## 2. ① 宿主工具面：把发言权拿回来（核心改造）

**问题的根**：SDK 管自己的工具是对的（Read/Write/Bash 在它的沙箱里跑，我们不该插手），但**协作工具不是它的**——`send_message` 是房间租约的兑现动作，`board` 是我们的看板，`history` 会读到我们的私聊。这些必须由宿主提供、由宿主执行、由宿主审批。

**做法：宿主 MCP 服务器**。Agent SDK 原生支持 MCP（`mcpServers` 选项），我们把协作工具面包成一个进程内 MCP 服务器注入进去：

```
packages/onething-runtime/src/external-agents/host-mcp/
  server.ts        # 进程内 MCP server（SDK 侧看到的就是标准 MCP 工具）
  tools.ts         # 把 send_message/board/history/notebook 的既有执行器包成 MCP handler
  context.ts       # 每次 streamTurn 绑定当前 (agentId, roomSessionId, leaseId)
```

- **工具集由 venue 门决定**：`resolveAgentToolSurface(kind, dm, …)` 的结果直接决定注入哪几个——**venue 门第一次对外部 agent 真正生效**，且是同一个函数（不是平行实现）。
- **执行走既有执行器**：`speakThroughCollabLease`（持牌校验、防冒名、幂等窗、转义、typing 信号）一个不落。外部 agent 的发言从此**与本地 agent 走同一条落库路径**——收养兜底退回它该在的位置（真·兜底）。
- **审批走正规链**：宿主工具的审批天然经 `enforcePermissionPolicy`（因为就是我们的执行器），不需要 canUseTool 那根桥。
- **SDK 自带工具仍走 `canUseTool`**，但那条桥现在只负责「SDK 自己的工具」，职责清晰：过 venue 门（协作房里 `ExitPlanMode` 这类无落点的直接 deny 带可操作文案）、带 callId、走策略门。

**收益**：G8（工具面失效）、G1/G2（审批链）、发言权外包、venue 门失效——四件事被同一个结构解决。

## 3. ② AgentExecutor：让上层不再知道「思考在哪」

今天的形态：外部 agent 是 provider 层的一个特例，导致每一层都要认它（`external-agent-providers.ts` 的 Set 判定散在压缩、鉴权、工具装载三处）。

**新抽象**（`packages/onething-runtime/src/agents/executor/`）：

```ts
interface AgentExecutor {
  readonly kind: 'local' | 'external'
  readonly capabilities: {           // 声明式，不靠试探
    hostTools: boolean               // 能不能接宿主工具（MCP）
    steer: boolean                   // 能不能中途注入
    interrupt: boolean               // 有没有比 abort 更强的中断
    contextWindow: 'ours' | 'theirs' // 上下文谁管（压缩策略据此分流）
    persona: 'system' | 'prepend'    // persona 怎么进
  }
  runTurn(req: AgentTurnRequest): AsyncIterable<AgentTurnEvent>
  interrupt(sessionId: string): Promise<void>
  dispose(sessionId: string): Promise<void>
}
```

- `local` 实现 = 现有引擎+工具循环；`external` 实现 = 包 connector（claude-code / acp / 未来的 codex）。
- **散落的三处 Set 判定收敛为一次能力查询**：压缩看 `contextWindow`、工具装载看 `hostTools`、鉴权看 executor kind。
- **`interrupt`/`dispose` 进契约即有调用者**（今天生产零调用）：停止链、运行时 shutdown 各自调。
- **agent 域模型的 `executor` 字段接线**（`agents/store.ts:46-51` 定义了语义但未接线，`agent-domain-model.md` M7 明写「本期只定义不接线」）——本方案兑现它：agent 配置里选执行器，而不是靠 providerId 反推。

**收益**：G8/G9/G10 结构性解决；未来接 Codex/Gemini CLI 只是加一个 executor 实现，不再是往 provider 层塞第三个特例。

## 4. ③ InteractionRegistry：把「提问」变成一等概念

**为什么不复用 Permission**：Permission 语义是「允许/拒绝一个动作」（返回 `once/session/workdir/reject`）；提问语义是「从 N 个选项里选，或自由输入」（返回结构化答案）。合并会把两个概念的生命周期、UI、超时策略绑死——正是这个仓库反复吃亏的「合并两个边界」（v3 §0.1 宪法）。

`packages/core/interaction/`（core 层，零依赖）：

```ts
interface InteractionRequest {
  id: string; sessionId: string; toolCallId?: string
  origin: 'external-agent' | 'host-tool'
  questions: Array<{
    id: string; header?: string; question: string; multiSelect?: boolean
    options: Array<{ label: string; description?: string; preview?: string }>
    allowFreeText?: boolean
  }>
  deadlineAt: number                          // 硬性，必有
}
interface InteractionAnswer {
  id: string
  answers: Record<string, { selected: string[]; freeText?: string }>
  outcome: 'answered' | 'declined' | 'timeout' | 'aborted'
}
```

- **Registry 自结算超时**（不依赖 UI 在场）；channel 亲和与会话清理纪律沿用 Permission 的既有实现。
- **协议形状照 SDK 的 `AskUserQuestionInput` 设计**（`sdk-tools.d.ts:847-900`），映射零损耗；同时接 SDK 的 `onUserDialog`/`userDialogKinds`（今天完全没接，注释明确「absence = fail closed」——这就是静默的另一半原因）。
- **UI**：消息流内的一等卡片（与审批卡同视觉语言）：问题 + 选项（带 description/preview）+「其他」自由输入 + 倒计时。renderer 侧 reconcile 单账本（C4 纪律）。
- **协作房策略**：提问期间**持牌不放**（确实还在这一轮）但回合墙钟照走；房间转录落一行「Iris 正在等你回答」；**pair 房（无人类）直接 declined** 带文案——这是原则 3 的落地。
- **本地工具也能用**：`interaction` 不是外部专属——将来本地 agent 想问用户「A 还是 B」，用同一个机制（今天只能靠发消息+等回复，无结构、无超时）。

## 5. 停止三级（G3/G4）

| 级别 | 语义 | 现状 | 本方案 |
| --- | --- | --- | --- |
| 房级 | 停这间房全部对话 | ✅ `stopCollabV3RoomFloor` | 复活房面按钮 |
| **人级** | **停这个人这一轮** | ❌ 不可达 | **新增** `collab:room-revoke-lease`（leaseId + epoch 前置，仿看板 `expectedRev`）：撤牌 + abort 执行会话 + `executor.interrupt()` + settle 该会话 pending interaction/permission |
| 卡级 | 停这张工作卡 | ✅ `stopCollabV3TaskWork` | 不动 |

**房面按钮复活**：`RoomSurface.vue:102` 的 `allow-stop-action={false}` 是 **v2 时代的真机结论**（注释原文「按下去停不掉任何东西」），v3 停止链已实测全程可达（侦察 B4）——翻为 true，显示条件走既有 `isRoomTurnActive`（外部 agent 持牌时满足）。
**人级三入口**：成员条/成员页「停下 TA」、调度页租约表行「撤牌」（兑现 O2 待办）、状态条「现在」行的「停」改为人级（今天是房级全撤，语义不精确）。

## 6. 观测与渲染

- **外部回合进 scheduler-log**：`external-turn-start/end`、`external-tool-call(name, decision)`、`interaction-open/answered/timeout`——「刚才为什么卡住」可查（今天外部回合在时间轴上是一片空白）。
- **agent 快照加 `waitingOn?: { kind: 'interaction'|'permission'; since }`**：大脑面板与成员徽标显示「等你回答」而非笼统「生成中」。
- **未知工具 preview 修复**（G5）：`tool-preview.ts:216-217` 的 `String(第一个值)` 改结构化摘要；`AskUserQuestion` 给专用 preview（第一题题干）。

---

## 7. 分期（严格按依赖排序，每期独立可交付）

| 期 | 主题 | 内容 | 量级 |
| --- | --- | --- | --- |
| **E0** | 契约与骨架 | `AgentExecutor` 接口 + capabilities 声明；local/external 两实现骨架；三处 Set 判定收敛为能力查询；agent 域模型 `executor` 字段接线 | 2-2.5 天 |
| **E1** | 交互协议内核 | `core/interaction` registry + 契约 + 事件 + 超时自结算 + IPC 五步走 + channel 亲和 | 1.5-2 天 |
| **E2** | 交互 UI | 一等卡片 + renderer reconcile 账 + 倒计时 + 协作房系统行 + pair 房 declined | 1.5-2 天 |
| **E3** | 宿主工具面 | 进程内 MCP server + 协作工具包装 + venue 门决定工具集 + 经既有执行器落库（**发言权收回**） | 2.5-3 天 |
| **E4** | 外部通路重接 | connector 改吃 executor 契约；callId 透传；canUseTool 只管 SDK 工具且过 venue 门+策略门；`onUserDialog` 接 interaction；persona 进 system prompt | 2 天 |
| **E5** | 停止三级 | `collab:room-revoke-lease` 通道 + 人级三入口 + 房面按钮复活 + interrupt/dispose 接线 | 1-1.5 天 |
| **E6** | 观测与验收 | scheduler-log 外部事件 + waitingOn 快照 + preview 修复 + 走查清单（F3 复验：提问能答、能停、能查） | 1-1.5 天 |

**依赖**：E0 是地基（E3/E4/E5 都消费它）；E1→E2→E4 串行（协议→UI→映射）；E3 依赖 E0；E5 依赖 E0。合计约 12-15 天量级。

**⚠️ 关于止血**：E0-E6 期间那个卡死场景仍然存在。若要在第一期就消掉症状，可把 callId 透传 + 策略门 + 房面按钮三条**提到 E0 一起做**（它们在最终形态里也保留，不是丢弃的临时补丁）——但这是顺带，不是主线。

## 8. 保留与推翻

**保留**：外部 agent 走 Agent SDK（不改回 ACP）；SDK 管自己的工具（Read/Write/Bash 在它沙箱里）；Permission 的二值语义不被污染；协作房三道闸对外部 agent 同样生效；`docs/design/external-agents-integration.md` 的 P0/P1 成果。
**推翻**：`supportsTools: false` 导致协作工具一并消失（→ 宿主 MCP 注入）；外部 agent 是 provider 层特例（→ executor 抽象）；发言靠收养兜底（→ 持牌经 send_message）；「需要人回答的工具可以挂着」（→ 有落点或拒绝）；`RoomSurface` 停止按钮无用（v2 结论，v3 已失效）。

## 9. 附：侦察证据表（十个缺口的原始定位）

| # | 缺口 | 证据 |
| --- | --- | --- |
| G1 | 外部 ask 不带 `callId` → 卡从未上屏 | `app/external-agents/index.ts:109`（对照 ACP `app/acp/permission-bridge.ts:53` 传了）；SDK 已给 `toolUseID`（`sdk.d.ts:241-245`），`claude-code-connector.ts:456` 只解构 `{ signal }`；消费端 `stores/chat.ts:996-1006` 匹配不到即永久缓存 |
| G2 | 外部 ask 绕开策略门 → 无超时兜底 | `app/external-agents/index.ts:106` 直调 `Permission.ask`；策略门 `app/tools/core/permission-policy.ts:145-160`（含 120s 拒绝桥 `:70-95`、30min 软提醒 `:112-143`） |
| G3 | 房面无停止按钮 | `RoomSurface.vue:102` + 注释 `:92-96`；`InputBox.vue:962`；唯一入口 `CoordinatorStatusBar.vue:80-87`（hover） |
| G4 | 人级停止不可达 | 无 revoke-lease 通道（`shared/ipc/channels.ts:484-514`）；O2 待办 `RoomSchedulePanel.vue:181-191` |
| G5 | `[object Object]` | `stores/helpers/tool-preview.ts:216-217`（详情面 `ToolStepDetails.vue:295-305` 正常） |
| G6 | AskUserQuestion 无落点 | 全仓源码零命中；语义对照 `sdk-tools.d.ts:847-900` vs `core/permission/index.ts:404-504` |
| G7 | `onUserDialog`/`userDialogKinds` 未接 | `sdk.d.ts:1287-1289, 1529-1544`（absence = fail closed）；`claude-code-connector.ts:446-478` 未声明 |
| G8 | 工具面结构性失效 | `external-agents/provider.ts:50` → `agent-loop/stream-runtime.ts:682-699`；伴生：发言靠 `engine-mind-port.ts:274-277` 收养 |
| G9 | 上下文只给最后一条 user 文本 | `external-agents/provider.ts:24-32,54`（persona 丢失） |
| G10 | `interrupt()`/`dispose()` 零调用 | grep `.interrupt(` 只命中定义 |

---

## 10. 实施勘误

方案是 2026-08-04 写的,实施跨了五个提交。这一节记**方案与落地之间的每一处不同** ——
不是为了认错,是因为下一个读这份文档的人会拿它当地图,而地图上没标的那几条岔路
正是他会走错的地方。

### 10.1 逐期提交号

| 期 | 提交 | 状态 |
| --- | --- | --- |
| E0 契约与骨架 | `a7d66eea` | 已落地 |
| E1 交互协议内核 | `32a64a40` | 已落地 |
| **E2 交互 UI** | — | **未做**(唯一未完成期,见 §10.3) |
| E3 宿主工具面 | `6a71aa23` | 已落地 |
| E4 外部通路重接 | `fe578380` | 已落地 |
| E5 停止三级 | `a11f312c` | 已落地 |
| E6 观测与验收 | 本次 | 已落地 |

依赖链上 E2 被跳过了一环:方案写的是 `E1→E2→E4` 串行(协议→UI→映射)。真跑下来
**E4 不依赖 E2** —— 映射依赖的是 E1 的协议,不是它的呈现。E2 缺席的代价因此不是
「E4 做不了」,而是「提问没有可点的卡」(§10.3)。

### 10.2 与方案的偏离

**E4 · 三处 SDK API 名/形状纠正**(已在该期提交里逐条记过,这里汇总。方案按记忆写的
名字与 `sdk.d.ts` 实际不符,一律以 d.ts 为准):

1. `userDialogKinds` → **`supportedDialogKinds`**。方案写的那个名字在 d.ts 上根本
   不存在。给错名字 = 那张声明表没递出去,而 d.ts 明写「absence = 不能显示,CLI
   就地失败关闭」;
2. persona 的两个字段 → **`{type:'preset', preset:'claude_code', append}`**。方案写的
   两个是 SDK 的**内部**字段。更要紧的是形状:裸字符串会把 Claude Code 自己那份操作
   说明整个替掉 —— persona 到位了,Read/Write/Bash 却不会用了;
3. `AskUserQuestion` 的**回填形状**:d.ts 里 answers 以问题**原文**为键、多选逗号
   连接(我们内部用 `questionId` 主键 + `selected: string[]`,那是刻意的,见
   `core/interaction/types.ts`——但递回 SDK 的那一份必须按它的形状回填)。

教训是同一条:**SDK 的形状要从 d.ts 读,不从记忆写**。这三处任何一处写错都不会在
typecheck 里红(选项对象是结构化的、可选的),只会在真机上静默地什么都不发生。

**E4 · 一处路由实况澄清**(方案里没写清,复验时容易读错):房内的外部回合跑在
`kind:'agent'` 的执行会话上,所以**审批**走的是 30 分钟协作软提醒桥(房里有人在看,
不自动拒),120 秒自动拒绝只适用于非协作的系统驱动回合。而**提问**那条链的 120 秒是
`Interaction` 内核自己挂的表(`DEFAULT_INTERACTION_TIMEOUT_MS`),**无条件生效** ——
两条等待链的超时不是同一套机制,别把它们混着讲。

**E3 · `supportsTools` 仍然是 `false`**,方案里那句「翻真」没有做。这不是遗漏,是
判断变了:这一位答的是「**引擎的工具循环**要不要为这个 provider 装载工具」,答案
仍然是不要 —— 外部 agent 的工具在它自己的循环里执行,引擎再装一份只会把同一批工具
发两遍,然后等一个永远不会回到我们这条循环里的结果。**协作工具不走这条路**:它们经
进程内 MCP 直接注入 SDK,由 connector 的 `hostToolSurface` 每轮解析、由我们自己的
执行器执行。所以 §0 那条「工具面结构性失效」的诊断已经不成立 —— 工具面回来了,只是
它接在 connector 上,不接在 provider 的这一位上。这一位要翻真得等 `AgentExecutor`
抽象接管「工具装载看 `hostTools`」、引擎不再从 provider 推断任何东西的那一天。
(注释原文在 `external-agents/provider.ts:70-85`。)

**E5 · 三个入口全做了**,没有削减:房面停止按钮、协调器状态条、调度页租约表的单张
撤牌。方案写的是「人级三入口」,落地一个不少。

**E6 · 多做了两处**,都是为了让复验步骤真的可操作:

- **诊断 CLI 的渲染**(`inspect-rules.ts`):新三类若不给渲染分支会落到
  `JSON.stringify` 兜底 —— 读得出来但没法读。顺带补了 `collabInspectRowAgentId`
  的三支,否则 `--agent <id>` 会把这个人整段外部回合过滤掉。
- **`waitingOn` 的 UI 消费**:方案 §6 只写了快照那一半。落地时发现
  `components/agents/*` 与 `chat/room-member-strip.ts` 不在并行施工范围内(并行方动的是
  `RoomSurface.vue` / `Sidebar.vue` / workspace 那一片),于是把大脑面板与成员条徽标
  一起接了 —— 两处都新增一个**排在最前**的 `waiting` 态:它与「在生成」在真机上同时
  成立,但只有它需要用户动手。

**E6 · 一处比方案更严**:方案 §6 写的 `interaction` 行带 `questionCount`。落地时
`origin` 与 `questionCount` 做成了**只有 `open` 相才有** —— 结算事件载的是答案,它
身上根本没有这两格,补一个猜出来的值就是往诊断账里写假话。后四相靠 `triggeredBy`
指回 `open` 那一行,这正是因果引用存在的理由。

### 10.3 唯一未完成的一期:E2(交互 UI)

**没做什么**:一等提问卡片、renderer 的 reconcile 账、倒计时、协作房里的提问系统行、
pair 房的 `declined` 呈现。

**为什么**:renderer 外壳拆除(shellMode / workspace 树 / TabBar 退役)正在并行施工,
它动的恰好是卡片要落脚的那一片。在一棵正在被拆的树上接新枝,冲突的代价高于收益。

**此刻的实际行为**(复验时会看到的):提问**发得出去**(后端起 interaction、卡片
事件上了总线),但**没有面在画它**。于是每一次提问都走到 deadline:内核到点自结算成
`timeout`,理由(「无人应答,提问已超时结算。请按你自己的判断选一条最稳妥的路继续,
并在回答里说明你替用户做了哪个假设」)作为工具结果回到模型,模型继续往下走。

**这不是 F3 那个 bug 的复发**,区别是结构性的:F3 是**无限**挂起(没有落点、没有
deadline、没有卡片);现在是**有界**等待(有落点、有 deadline、理由回得到模型),
只是那一界目前是 120 秒而不是用户点一下。E2 补上之后这条路才算走完。

**E2 的前置全部就绪**:协议(`core/interaction`)、事件(`interaction:requested` /
`interaction:settled`)、IPC 面(`getPendingInteractionsForIpc` /
`respondInteractionForIpc`)、通道亲和、补水口都在位。E2 只剩呈现。
