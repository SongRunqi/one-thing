# Agent 拥有权与装配透明化方案

状态:**方案 · O1 部分已实施(未提交)**
进度:见 §9。已落地 = 快照过 allowlist(§4.2 第一处)+ `tools: []` 语义修正(§1.2 坑 ①)。其余全部未动。
日期:2026-08-05
姊妹篇:`docs/design/agent-permission-system-2026-08.md`(权限管「能不能做」,本篇管「有没有」)
关联:`docs/design/agent-domain-model.md`、`docs/design/agent-capability-profile.md`、`docs/design/collab-actor-v3.md`、`docs/design/prompt-content-separation.md`

---

## 0. 一句话

> **装配的正确答案已经存在,但它从不出主进程;而用户唯一能看到的那一面,在说谎。**

`EffectiveAgentProfile` 每回合解析一次(`app/engine/stream/agent-loop-executor.ts:456`),它就是"这一回合装了什么"的权威答案。`grep` 全仓:消费方全在 `src/app/engine/`,**renderer 与 `packages/shared/ipc` 零命中**——没有任何 IPC 通道把它送到 UI。

与此同时,用户能看的 `SystemPromptPanel` 列的是**全局启用工具**,`buildSystemPromptSnapshot`(`prompts/system-prompt-snapshot.ts:429-435`)**完全不应用 agent 白名单 / stance grant / venue**。即:唯一的装配可视面,对任何配了白名单的 agent 都在说谎。

---

## 1. 底账

### 1.1 "拥有"不是一个可以指着看的东西,是四条规则算出来的

| 层 | 位置 | 语义 |
|---|---|---|
| 档位 | `app/tools/builtin/{index,headless,readonly}.ts` | 三选一**替换**(full 19 / headless 11 / readonly 4) |
| agent 白名单 | `agents/profile.ts:253-287` `resolveAgentToolSurface` | 过滤;**`ownTools` 为 null 直接返回 null = 不限制**(`:278`) |
| stance 隐含 grant | 同文件三张表 | **union**(今天四个包全是 union,replace 是死码路径) |
| 场子门(venue) | `collab/tool-surface.ts:128-143` + 各执行器自查 | 执行期二次拒绝,**返回文案不是 error** |

四层散在三个包,**没有一处汇合**。

三张表的完整内容(`agents/profile.ts:49-94`):

```
AGENT_TOOL_GRANTS      collab-room     = [send_message, board, history]   union
                       collab-dm       = 同上                              union
                       collab-work     = [board, send_message]             union
                       collab-notebook = [notebook]                        union
GRANTS_BY_SESSION_KIND    room→collab-room · agent→collab-room · work→collab-work
DM_GRANTS_BY_SESSION_KIND room→collab-dm   · agent→collab-dm
NOTEBOOK_SESSION_KINDS    { agent, work }
```

### 1.2 五条足以误导用户的事实

1. ~~**`tools: []` 会翻转语义**~~ ✅ **已修**(2026-08-05)。`normalizeToolAllowlist`(`agents/store.ts`)把空数组静默归一成 `undefined` = 不限制;UI 侧有 `validateToolAllowlist` 拦(`agent-config-form.ts:56-64`),但 IPC / HTTP 直接写 `[]` 无拦截 —— "一个都不给"变成"全给"。现由 `requireWritableToolAllowlist` 在**存储层**拒绝(读盘路径仍容忍旧数据),`null` 是清空白名单的正式写法。
2. **union grant 只在有 allowlist 时才叠加**。`follow global` 档(`own === null`)直接返回 null 不叠(`profile.ts:274-278`)。所以"没配白名单"与"配了全部工具"在群房里是**两种不同结果**。
3. **UI 只提示了四格里的一格**。`AgentConfigForm.vue:194-196` 说 "Work sessions always add the board tool",而 room / dm / notebook 三格用户无从得知。
4. **headless / readonly 档下 collab grant 静默落空**。解析出注册表里不存在的 id,`planAgentLoopTools` 的 Set 过滤直接丢掉,**无任何告警**(`core/engine/agent-loop-runtime.ts:672`)。
5. **`send_message` 的 room 档根本没走 venue 表**。`say-tool.ts:86-98` 只做房间解析,`room` 参数在 `:264-265` **先于任何 venue 判据被无条件采信**;`collabToolAllowedInSession(_, 'send_message')` 全仓只有 `dm-tool.ts:119` 一处消费。即 `COLLAB_TOOL_VENUES.send_message` 那一行今天只约束私聊/唤醒档。

### 1.3 提示词:12+ 段,用户能编辑的只有 1 段

段序(`prompts/builder.ts:111-147`,顺序即拼接序):

| 块 | 段 | 判据 | 随什么变 |
|---|---|---|---|
| system | baseSystemPrompt · toolGuidelines · Current date | 常驻 | 固定 / 日期 |
| dev | `agent` | `agentSystemPrompt` 非空 | **agent** |
| dev | `voice` | `speakMode ?? voiceConversation` | 输入通道 |
| dev | `runtime-context` | providerId ‖ model | provider/model |
| dev | `context-update-convention` | 常驻 | 固定 |
| dev | `workdir` + Tool Workspace Rules | `workingDirectory` 真 | 会话 |
| dev | `active-project` / `known-projects` | projects store | 全局 |
| dev | `skills` | `hasTools && toolNames.includes('read')` 且过滤后非空 | **agent 绑定** |
| dev | `os` | 常驻,platform 三选一 | 平台 |
| dev | `todo` | `hasTools && todoPlanDirectory && sessionId` | 会话 |
| dev | `agents-md` | git root→workdir 逐级找 `AGENTS.md` | **磁盘**,32KB/文件 |
| dev | `context-variables` | `hasTools && toolNames.includes('variable')` | 工具档 |
| dev | `plugins` × N | 各 provider 非空 | soul-memory(**SOUL.md 全文**)/ channel-identity |

`agent.systemPrompt` 有**三条互斥支路**(`app/engine/prompt/system-prompt.ts:212-226`):

| 支路 | 形态 |
|---|---|
| 普通会话 | 进 D1 段,**被包装** `# Agent: ${name}\n\n${prompt}`(`builder.ts:224-226`) |
| 房/私聊(`kind='room'`,或 `kind='agent'` 且有 `roomSessionId`) | **原文直插且置顶**——整个 `baseSystemPrompt` 被换成 `persona + <workspace>…`(`collab/roster.ts:443-462`),D1 段同时被禁 |
| 工作台(`kind='work'`) | 走 D1 包装,但 persona 先与 `<where_you_are><card>` 拼接(`system-prompt.ts:197-209`) |

**房支路硬编码禁用 11 段**(`system-prompt.ts:150-162`):`agent, voice, runtime-context, workdir, active-project, known-projects, skills, os, todo, agents-md, plugins`。

> 即:**群聊回合没有 skills、没有 memory / SOUL.md、没有 AGENTS.md、没有 OS、没有 workdir、没有 todo** —— 而用户完全不知道自己的 agent 一进群就失去了这些。

### 1.4 用户看得见什么

| 面 | 覆盖 | 问题 |
|---|---|---|
| `SystemPromptPanel` | **仅普通会话** | ① 工具列表**未过 agent allowlist**(`system-prompt-snapshot.ts:429-435`)② `historyMessages: []` ⇒ 无历史、无 `<context-update>`、无 drive ③ 只回 `systemPrompt: string`,**`sections[]` 算好了却没进类型**(`shared/ipc/chat.ts:774-775`)④ codex 分支实际发 1 system + N developer,预览始终展示 join 后的单块 ⑤ `voice` 段永不出现(快照不传 `speakMode`) |
| 房 / 私聊 / 工作台会话 | **零** | `RoomSurface.vue:130-131` 不挂 `ChatSidePanel`。persona 包装、`<where_you_are>`、花名册(含用户自己的句柄行)、`<messaging>`、`<board>`、`<your_tools>`、`<rules>` 七块**没有任何 UI 能看到** |
| willingness 判定回合 | **零** | `collab/willingness.ts:174` 是一次真实模型调用,UI 零呈现 |
| L1 traces | **全覆盖、恒开** | `evals/trace-store.ts:97` 落 `<store>/evals/traces/<sessionId>/<turnId>/round-<n>.json`,含全量 messages + tools schema + 采样参数 + 响应。**无任何 UI 入口 / IPC** |
| prompt capture(带 `sections`) | 部分 | `capture-store.ts:36-38`,环形 200 条 / 256MB。**collab 会话整条跳过**(`agent-loop-executor.ts:301-306`)—— 恰是装配最复杂的那类回合 |
| `dumpAssembledPrompt` | — | `chat-logger.ts:39-53`,**全仓无调用点**(死码) |

### 1.5 配置面缺口(12 项,过半是"只缺表单字段")

| # | 缺口 | 结构 | IPC | 卡在哪 |
|---|---|---|---|---|
| 1 | `description`(进 roster,已被消费) | ✅ | ✅ | 只缺表单字段 |
| 2 | `color`(群聊署名染色,`SayMessageRow.vue:464` 已在用) | ✅ | ✅ | 只缺表单字段 |
| 3 | `toolGrants` | ✅ | ✅ | 主动决定不暴露(`agent-config-form.ts:91-93`) |
| 4 | `kind`(colleague/service) | ✅ | ❌ | IPC 请求体无此字段,update 白名单显式拒 |
| 5 | `executor`(外部连接器) | ✅ | ❌ | 同上;`external-agents/` 有实现无装配入口 |
| 6 | `model.thinking` | ✅ | ✅ | 表单已持有变量,**无控件**(`agent-config-form.ts:19`) |
| 7 | per-agent skills(站在 agent 上选) | — | — | 绑定只在 skill 一侧,方向反了 |
| 8 | per-agent MCP | — | — | **完全不存在**;`grep agentId` 在 `mcp/` 与 `app/mcp/` 零命中 |
| 9 | stance grant 的可见性 | — | — | UI 只提示 work 一格 |
| 10 | 提示词分段开关 | ✅(`builder.ts:109` `disabledSections`) | — | **只在 Evals 实验室开放** |
| 11 | agent 工作目录 / context policy | — | — | 注释承认留在 agents.json |
| 12 | 单个 MCP 工具启停 | — | — | UI 只读(`MCPServerItem.vue:177-194`) |

另有两条隐藏结构:`session.room.context`(historyDays / tail / unreadMax / dailyDigest)在 shared 类型里有字段、**renderer 零引用**,用户改不了也看不到。

---

## 2. 设计原则

1. **装配的答案只有一个,且必须能出主进程。** 今天 `EffectiveAgentProfile` 是对的答案,缺的只是一条通道。
2. **每一项都要能回答"我为什么在这里"。** 透明化不是把清单打印出来,是让清单的**每一行带出处**。
3. **工具共享,资源私有。** 不给工具加 owner 字段。"独有"通过资源隔离实现(notebook 的做法),不通过工具隔离。
4. **姿态是一等概念。** 能力按 `session.kind` 变化这件事已经在发生,只是没有名字。给它名字,它才能被列出、被解释、被配置。
5. **可视面必须与真实回合同构。** 一个"大致正确"的预览比没有预览更坏——它会让人以为自己检查过了。
6. **配置面收敛到一处。** agent 的东西在 agent 页配,不要一半在 Skills 页、一半在 agents.json。

---

## 3. 对象模型

### 3.1 Stance — 姿态

```ts
export type Stance = 'chat' | 'room' | 'dm' | 'work' | 'judgement'

export interface StanceDefinition {
  id: Stance
  label: string
  /** 判据(从 session 推,但呈现为 agent 属性) */
  matches(session: SessionShape): boolean
  /** 这个姿态的工具地板 */
  toolFloor: readonly ToolId[]
  /** 这个姿态禁用的提示词段 */
  disabledSections: readonly SectionId[]
  /** 这个姿态额外注入的东西 */
  injects: readonly InjectionId[]
}
```

五个姿态今天已经全部存在于代码里,只是以 `kind` + `dm` + 三张常量表 + 一张禁用表的形式散着:

| Stance | 判据(现状位置) | 工具地板 | 禁用段 |
|---|---|---|---|
| `chat` | 三表皆 miss(`profile.ts:261-265`) | — | — |
| `room` | `kind='room'` 且非 dm | send_message, board, history | 11 段 |
| `dm` | `kind='room'/'agent'` 且 `isUserDmRoom` | 同上(今日逐字相同,分格为将来分叉) | 11 段 |
| `work` | `kind='work'` | board, send_message, notebook | **一段不禁** |
| `judgement` | willingness 判定回合(`willingness.ts:174`) | 薄档(`<board>`/`<your_tools>` 被裁) | — |

> `kind='agent'`(常驻执行会话)不是第六个姿态——它按所属房是否 dm 落进 `room` 或 `dm`,额外叠 notebook。这一点今天要读三处代码才知道。

### 3.2 AgentAssembly — 装配单

一次回合的完整装配结果,**可序列化、可 IPC、可呈现**:

```ts
export interface AgentAssembly {
  agentId: string
  agentName: string
  stance: Stance
  sessionId: string
  resolvedAt: number

  tools: AssemblyItem<ToolId>[]
  skills: AssemblyItem<SkillId>[]
  mcpServers: AssemblyItem<ServerId>[]
  promptSections: AssemblySection[]
  injections: AssemblyItem<InjectionId>[]     // 变量 / memory / drive / 附件…

  memoryRoot: string | null
  permissionMode: string
  maxTurns: number
  model?: OnethingAgentModelBinding

  /** 来自权限方案 —— 两篇在这里对接 */
  realm?: Realm
}

export interface AssemblyItem<T> {
  id: T
  label: string
  /** ★ 为什么在这里 —— 透明化的核心 */
  origin:
    | { kind: 'agent-allowlist' }
    | { kind: 'stance-grant'; stance: Stance; grant: string }
    | { kind: 'unrestricted'; reason: 'no-allowlist' }
    | { kind: 'global-setting'; key: string }
    | { kind: 'skill-binding'; skillId: string }
    | { kind: 'tier'; tier: 'full' | 'headless' | 'readonly' }
  /** 执行期还会不会被二次拒绝 */
  runtimeGate?: { kind: 'venue'; allowed: boolean; message?: string }
  /** 解析出来但注册表里没有(headless/readonly 档的静默丢弃) */
  unavailable?: boolean
}

export interface AssemblySection {
  id: SectionId
  label: string
  /** 段的真实文本 */
  text: string
  /** 从哪来 */
  source: { kind: 'builtin-content'; file: string }
            | { kind: 'agent-field'; field: 'systemPrompt' }
            | { kind: 'disk'; path: string }        // AGENTS.md / SOUL.md
            | { kind: 'plugin'; pluginId: string }
            | { kind: 'computed' }
  disabledBy?: { kind: 'stance'; stance: Stance } | { kind: 'user-setting' }
}
```

`origin` 那一格是整个方案的重点。它把"四条规则的隐式合成"变成"每一行都能自证"。UI 上就是每个工具旁边一行小字:

> `board` · 群聊姿态自动叠加(collab-room)
> `read` · 你配置的白名单
> `radio` · 未配置白名单,注册表全给

### 3.3 五个所有权轴

| 轴 | 今天怎么表达 | 问题 | 方案 |
|---|---|---|---|
| **tools** | `agent.tools` + `toolGrants` + 三张 stance 表 | 空 = 全部;隐含表不可见;`[]` 经 IPC 翻转 | 装配单带 origin;`[]` 在**存储层**归一改成拒绝(不只 UI 拦) |
| **skills** | 绑定在 **skill 一侧**(目录级 `customDirectories[].agentId` + 单条级 `skills[id].agentId`,后者压过前者) | 方向反了;agent 页看不到自己有哪些 skill;未绑定 = 全 agent 可见 | 绑定**仍存 skill 侧**(避免双写),agent 页加**只读汇总 + 跳转** |
| **mcp** | **完全没有 per-agent** | agent 白名单对 MCP 的粒度是 0 或 1(模型只看到 `mcp_search` 一个 id) | `agent.mcpServers: string[]`,在 router 的 `call` 分支按 server 过滤 |
| **prompts** | 只有 `agent.systemPrompt` | 12+ 段不可见分段、不可关;房支路禁 11 段无声 | 快照返回 `sections[]`;段级开关从 evals 实验室搬到正式面;房姿态的禁用清单显式呈现 |
| **memory** | 按 agentId 隔离(default agent 特殊:可改根、吃 `ai_note_dir`) | 房回合零 memory 但用户不知道 | 装配单显示 `memoryRoot` + 本姿态是否启用 |

### 3.4 "某个 agent 独有的工具" —— 不做,而且不该做

现状没有这个机制(`ToolInfo` 无 owner 字段,`registerTool` 是全局单例),我认为**不应该加**。

理由:`notebook` 是今天唯一做到"私人"的工具,而它靠的**不是可见性隔离**——工具对任何 `agent`/`work` 会话都可见可调,身份从 `session.agentId` 推(`notebook-tool.ts:51`,刻意不从参数收),写入被路由到该 agent 的本子。`history` 同构。

> **工具共享,资源私有。** 这是对的模式,应该推广而不是替换:
> - 工具是**能力**,给谁用是白名单的事(补集自然形成"别人没有")
> - "独有"是**资源**语义,归 `Realm`(见权限方案 §4.3)

给工具加 owner 会产生第二套主体模型,与 `Realm` 打架。

---

## 4. 透明化:三个动作,按杠杆排序

### 4.1 把 `EffectiveAgentProfile` 送出主进程(最小、最高杠杆)

新增 `chat:get-agent-assembly` / `GET /api/sessions/:id/assembly`,返回 `AgentAssembly`。

这一步几乎不需要新逻辑——答案已经在 `agent-loop-executor.ts:456` 算好了,只是没有出口。**建议先做这一条,单独就能消掉一大半"黑盒"感。**

### 4.2 修 `SystemPromptPanel` 的三处失真

| 失真 | 修法 |
|---|---|
| ~~工具列表未过 allowlist~~ ✅ **已修**(2026-08-05) | 快照新增 `getAgentToolAllowlist` 适配器,app 侧接 `resolveAgentProfileForSession` —— 走真回合那条解析(agent 白名单 + kind 隐含 grant + dm 分格)。副作用:`toolNames` 也跟着准了,没有 `read` 的 agent 不会再看到 skills 段 |
| `sections[]` 算好了没进类型(`builder.ts:154-173` → `shared/ipc/chat.ts:774-775`) | 加进 `SystemPromptSnapshot`,UI 按段折叠、每段标来源 |
| 房 / 私聊 / 工作台会话无面板(`RoomSurface.vue:130-131`) | 房面挂同一个面板 |

顺带修:快照不传 `speakMode` ⇒ `voice` 段永不可见;codex 分支的消息切分预览形态不符。

### 4.3 给 L1 traces 开读取入口

`evals/trace-store.ts:97` **恒开、无门控、覆盖每一轮(含 collab)**,含全量 messages + tools schema + 采样参数 + 响应。这是现成的金矿,却没有任何 UI 入口。

接进事故工作台即可(那里已有 `RoundTimeline.vue:69` 展示 requestMessages 的能力),顺带解决 collab 回合无 capture 的问题(`agent-loop-executor.ts:301-306` 整条跳过 trigger)。

---

## 5. 可配置性

### 5.1 配置面的三条规矩

1. **agent 的东西在 agent 页配**。今天 skills 绑定在 Skills 页、工作目录在 agents.json、MCP 完全没有——三处都要在 agent 页至少**可见**(绑定可以仍存原处,但要有只读汇总 + 跳转)。
2. **每个策略都要有开关,开关都在 `settings.permissions.*` / `settings.agents.*` 下**,并且**必须同步登记进 `mergeWithDefaults` 白名单**——既有事故:`storage`/`evals` 曾被静默吞掉,`sessionFormat` 开关是死的。
3. **默认值要能被看见**。"没配 = 全部"这种语义必须在 UI 上写出来(今天 `follow global` / `all tools` 做对了,继续保持)。

### 5.2 建议新增的配置项

```jsonc
// agents.json 单条 agent
{
  "mcpServers": ["filesystem-project", "github"],   // ★ 新增
  "stanceOverrides": {                              // ★ 新增,按姿态微调
    "room": { "disabledSections": [], "extraTools": ["read"] }
  },
  "realm": { … },                                   // 权限方案
  "escalation": "deny"                              // 权限方案(已拍板)
}
```

```jsonc
// settings.json
{
  "agents": {
    "showAssemblyPanel": true,          // 装配面板总开关
    "exposeSectionToggles": true        // 提示词段级开关从 evals 搬到正式面
  },
  "permissions": {
    "crossAgentAccess": "settings-only" // 'settings-only' | 'prompt-allowed' | 'disabled'
  }                                     // ★ 你拍的第 2 条:可以,但可配
}
```

### 5.3 便宜的收口(结构与 IPC 都已就位,只缺表单)

`description` · `color` · `model.thinking` —— 三个字段今天**已被消费**却没有编辑器,用户只能手改 `agents.json`。加三个控件即可。

---

## 6. 分期

| 期 | 名称 | 交付 | 依赖 |
|---|---|---|---|
| **O0** | 装配单出口 | `AgentAssembly` 类型 + IPC/HTTP + `origin` 标注 | — |
| **O1** | 可视面纠错 — **1/3 已落地** | ~~快照过 allowlist~~ ✅、`sections[]` 进类型 ❌、房面挂面板 ❌ | O0 |
| **O2** | Stance 一等化 | `StanceDefinition` 表取代三张常量表 + 禁用表;UI 按姿态呈现 | O0 |
| **O3** | 配置面收口 | agent 页:skills 只读汇总、mcpServers、三个便宜字段、stance 差异提示 | O2 |
| **O4** | per-agent MCP | `agent.mcpServers` + router `call` 分支过滤 | O3 |
| **O5** | 提示词段级开关 | 从 evals 实验室搬到正式面,带姿态维度 | O2 |
| **O6** | trace 入口 | L1 traces 接事故工作台;collab 回合补 capture | O1 |

**O0 单独就有价值**,且几乎零风险(纯新增出口)。

### 与权限方案的关系

两篇共用主体(`Principal`)与同一张脸(agent 页):

```
权限方案 P0 主体贯通  ──┐
                      ├─→ 同一个 Principal
拥有权 O0 装配单出口  ──┘

权限方案 §9 权限面板  ──┐
                      ├─→ 同一个「这位同事是什么」页:
拥有权 O1/O3 装配面板 ──┘   身份 / 姿态 / 工具 / 提示词 / skill / MCP / 领地 / 授权 / 被拒记录
```

建议顺序:**权限 P0 与拥有权 O0 一起做**(都是"把已有答案送出去"),之后两条线并行。

---

## 7. 顺带该清理的死物

| 项 | 位置 | 状态 |
|---|---|---|
| `InitContext.agent.permissions.skill` | `tools/tool.ts:71` | 出自 2025-12-27 的 skill 工具(已在 `ab2348ac` 删除),`agent` 字段**从未被写入过** |
| skill frontmatter `allowed-tools` / `conditions` | `skills/loader.ts:618,623` | 只存只展示,**无执行侧消费者**;而且在当前架构下不可实现(skill 无"激活"时刻) |
| skill frontmatter `prerequisites` / `required_environment_variables` | `loader.ts:614-634` | 解析后**没写进 `SkillDefinition`** |
| `mcp-tools-catalog.md` | `app/mcp/bridge.ts:121` | 每次注册都写盘,`getToolsCatalogPath` **全仓无调用** |
| `mcp_<server>_<tool>` 净化 id 映射 | `tool-id-registry.ts:58-88` | 填表的 `getMCPToolsForAI` 生产无调用者 ⇒ 映射表恒空 |
| MCP `autoExecute: false` | `tool-definition.ts:179,202` | `canAutoExecute` 生产无调用者,惰性字段 |
| `mcp:<server>:<tool>` 逐工具形态 | `bridge.ts:156-174` | 只 unregister 从不 register;`planAgentLoopTools:673` 还显式过滤 |
| `dumpAssembledPrompt` | `chat-logger.ts:39-53` | 全仓无调用点 |
| `resolveAgentToolSurface` 的 replace 分支 | `profile.ts:270-272` | 四个内置包全是 union,replace 无人用 |

---

## 8. 已知缺陷(本方案不修,但需记账)

1. **project skill 进提示词但设置页看不见**:`useSkills.ts:62` 调 `getSkills()` 不传 `workingDirectory` ⇒ `loader.ts:833-835` `projectSkills = []` ⇒ 分组恒空。且 id 是 `project:<相对根路径>` 不含项目路径 ⇒ 不同仓库同名 skill 共用一条禁用设置 ⇒ **实际上无法逐个禁用**。
2. **project skill 向上遍历到 home 且含 home 本身**(`loader.ts:386,405`,调用方 `:788` 不传 `stopAt`);cwd 不在 home 下则一路到 `/`。零确认零提示。
3. **`<context-update>` 无预算**:state 变量不设条数与总量上限(`variables/format.ts:56` 注释明示),是当前唯一无闸的注入通道。
4. **MCP 连接失败无重试无退避无自动重连**(`manager.ts:117-122` 只 `console.error`)⇒ "这个 agent 拥有哪些 MCP"是个随时间漂移的答案。
5. **`setInitContext` 会 reset 所有异步工具且是进程级单例**(`tools/registry.ts:231-236`)⇒ 并发会话 / 不同 agent 互相覆盖,无 per-session 隔离。(今天 19 个内置工具全是静态工具,暂未暴露。)

---

## 9. 实施进度

> 这一节是**实况**,不是计划。改完代码必须回来改这里 —— 一份说着"透明化"却自己过期的文档,正是它批评的那种黑盒。

### 已落地(2026-08-05,未提交)

随姊妹篇的止血批(M0)一起改的两处:

| 内容 | 落点 | 对应 |
|---|---|---|
| 提示词快照过 agent allowlist | `prompts/system-prompt-snapshot.ts` 新增 `getAgentToolAllowlist` 适配器;`app/engine/prompt/system-prompt-snapshot.ts` 接 `resolveAgentProfileForSession` | §4.2 第一处 · O1 1/3 |
| `tools: []` 存储层拒绝 | `agents/store.ts` `requireWritableToolAllowlist`(写路径拒绝,读盘路径仍容忍旧数据) | §1.2 坑 ① |

验证:`bun run typecheck` 干净;`tools`/`agents`/`prompts`/`shared` 定向 335 条全绿;`boundary:gate` 无新增。

### 未动

- **O0 装配单出口**——本篇的地基与最高杠杆项,尚未开工。`EffectiveAgentProfile` 仍然没有 IPC 出口。
- **O1 剩余两条**:`sections[]` 进 `SystemPromptSnapshot` 类型、房/私聊面挂面板。
- **O2–O6 全部**。
- §7 的八处死物一个都没清。

### 一条要记的账

快照现在只列 agent 真正能调的工具,**但没有列出"被过滤掉了什么"**。在 O0 的 `AssemblyItem.origin` 落地之前,用户看到的是一份正确但沉默的清单 —— 知道有什么,不知道为什么没有别的。这是有意的取舍:先不说谎,再说全。
