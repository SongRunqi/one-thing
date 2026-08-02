# Agent 的形态:一次实地调查

> 2026-08-01。三路代码调查 + 真实磁盘核对。
> 目的:在决定「agent 的连续性边界该画在哪」之前,先把**它现在实际是什么**说清楚。

---

## 0. 一句话结论

系统把 agent 声称为**同事**(`agent-domain-model.md` 的标题就是「从『提示词预设』到『同事』」),
per-agent 的记忆工作区也确实建起来了、目录解析也确实是对的——

**但 agent 越是在「当同事」,它就越不是它自己。**

一个 agent 在**单聊**里有 SOUL.md、有记忆沉淀、有连续的自我演化;一旦进入**群聊**,
记忆读不到(提示词段被整段禁用)、也写不回去(capture/review 被整体短路)。
协作场景恰恰是"同事"这个概念唯一成立的地方,而那里的 agent 是一个**每轮从零开始的一次性应答器**。

这不是"忘了接线"。第 3 节会说明:**记忆写入之所以被关掉,恰恰是因为 agent 没有稳定的身份锚点**——
形态问题直接导致了功能被迫下线。

> **更正**:我在上一轮对话里说过「agent 没有任何跨房连续性」。这是错的。
> 连续性的**容器**存在(`~/.onething/agents/<agentId>/`),而且磁盘上确实在长。
> 断的是**它与协作场景之间的两根线**。这个更正让结论更强,不是更弱。

---

## 1. 一个 agent 由什么构成

### 1.1 配置:`~/.onething/agents.json` 里的一行

唯一真源。`{ version: 1, agents: [] }`,进程内单例缓存,写时 `withFileLockSync` 跨进程锁 + 原子写。

`AgentDefinition`(`packages/shared/ipc/agents.ts:37-75`)17 个字段,分四面:

| 面 | 字段 |
|---|---|
| 身份 | `id` `name` `title` `avatar` `avatarImage` `color` `description` `kind` `status` |
| 心智 | `systemPrompt`(persona 原文) `model`(provider/model/thinking) `executor` |
| 能力 | `tools`(白名单) `toolGrants`(能力包) `permissionMode` `maxTurns` |
| 元 | `isDefault` `createdAt` `updatedAt` |

### 1.2 真实磁盘:大部分字段从未被写过

实测 `~/.onething/agents.json`(26KB,11 个 agent)的字段直方图:

```
id:11  name:11  systemPrompt:11  createdAt:11  updatedAt:11
isDefault:1  tools:1  title:3  description:3  avatar:2  avatarImage:1
kind:0  status:0  executor:0  model:0  toolGrants:0  permissionMode:0  maxTurns:0
```

**11 个可选字段里有 7 个一次都没写过。** `kind` / `status` 全靠 `?? 'colleague'` / `?? 'active'`
缺省解析兜底;`executor` 更是**全仓零消费点**——只有类型定义、存储归一和一个投影函数读它,
没有任何代码据它分支(注释三处写着「M7,前瞻」「A0 只定义语义,不接线」)。

也就是说:**今天一个 agent 实际上就是「一个名字 + 一段 persona」**,其余都是留白。

### 1.3 状态:`~/.onething/agents/<agentId>/` —— 与配置同名但性质相反

这是本次调查最重要的发现之一,也是一个**认知陷阱**:

| | `agents.json` | `agents/` 目录 |
|---|---|---|
| 是什么 | 角色卡(配置) | soul-memory 的 per-agent 记忆工作区(状态) |
| 内容 | persona、能力、身份 | `SOUL.md` `USER.md` `MEMORY.md` `DREAMS.md` `daily/*.md` `plugin-data/soul-memory.sqlite` |
| 谁写 | 用户在设置页改 | `soul_update` / `memory` 工具 + 后台 review runner |
| 生命周期 | 删 agent 即删这一行 | **不联动**——硬删 agent 会留下孤儿目录 |

磁盘实证(10/10 个非 default agent 的目录名精确等于其 id):

| agentId | SOUL.md | daily/ | plugin-data |
|---|---|---|---|
| `agent-f8ef6446-…`(Life coach) | **2202 B**(真实演化过) | 1 篇 | sqlite **249 KB** |
| `agent-63120fdb-…`(english polish) | **2197 B** | — | — |
| `radio-dj` | 11 B(模板) | **7 篇**,07-16 ~ 07-28 | — |
| 其余 8 个(含三个 test agent) | 11 B(模板占位) | — | — |

**这块状态是真的在长的**——只不过只在单聊路径上长(见 §3)。另有两个孤儿目录
`onething/` `local-owner/`,不对应任何 agentId,正是"生命周期不联动"的产物。

### 1.4 明确设计为「不落库」的:在场面

`agent-domain-model.md` §2 铁律 1,逐字:

> **在场面永不落库。** agent 记录里不出现 roomIds/sessionIds 列表——归属存在房与会话上,
> agent 侧只有推导视图。**存两边必分叉**,这是 sessions 双仓储教训的同款。

实现是纯函数 `computeAgentPresence(agentId, sessions)`(`agents/presence.ts:69`),每次现算。
配套纪律(`agents/identity.ts:10-25`):派生 id(`agent-exec-` / `agent-dm-` / `agent-dm-room-`)
**只有构造,没有解析**——永不提供反函数,因为 agentId 自身可含横线,
「猜对了是巧合,猜错了是把两个 agent 的历史合成一个人」。

这条纪律是对的。但它也意味着:**「这个 agent 现在在哪、正在做什么」在系统里没有一个可读的地方**,
只有一个每次重算的推导。

---

## 2. 一个 agent 同时活在四个场所,而且四个"我"都不一样

这是形态问题最直观的证据。同一个 `agent-f8ef6446`,在四种会话里被装配成四个不同的东西:

| | 普通 chat | **群房回合** `kind:'agent'` | 用户私聊房 | 工作会话 `kind:'work'` |
|---|---|---|---|---|
| **persona 怎么放** | 包进 `agent` 段,当"系统提供的资料" | **system prompt 开头原文**(铁律:包进标签就变味) | 同群房 | 同普通 chat(包进 `agent` 段) |
| **看得见自己的 SOUL.md** | ✅ 注入 | ❌ **0 字节** | ❌ | ✅ 注入 |
| **对话沉淀回记忆** | ✅ capture + review | ❌ **整体短路** | ❌ | ❌ |
| **模型输入的历史** | 本会话真实交替 | 房投影(单块 `<ChatRoom>`)+ 本轮 drive | 同群房 | **本会话自身完整转录**(含上次 thinking / tool call) |
| **看得见上一轮自己干了什么** | ✅ | ❌ | ❌ | ✅ |
| **工具面** | 自己的白名单 | + `say`/`board`/`dm` | + 同左(`collab-dm` 格) | + `board`/`say` |
| **产品提示词段** | 全 12 段在 | **全 12 段禁用** | 同群房 | 全 12 段在 |
| **权限等待** | 120s 自动拒绝 | 交互式等待 + 30 分钟软提醒 | 同群房 | 同群房 |

读这张表最省事的方式是横着读**「工作会话」那一列和「群房回合」那一列**:

- 工作会话:persona 是"资料",但**有记忆、有自己上一轮的完整现场**;
- 群房回合:persona 是"本体",但**没记忆、没有自己上一轮的任何东西**。

**同一个 agent,在工作台里能看见自己的 SOUL.md,在群聊里看不见。**
它在工作台里记得自己上次做到哪,在群聊里不记得自己上一句说过什么(除了房里那条 `say`)。

---

## 3. 记忆链路的三层断裂 —— 以及为什么它是形态问题而不是接线问题

### 3.1 第一层:读不到

soul-memory 通过 **prompt-context provider** 注入(`app/plugins/builtin/soul-memory.ts:1047-1071`),
产出两条 developer 片段(memory 规则 + SOUL.md 全文),
但它们**没有自己的段名**——被统一打成 `["plugins", content]`(`prompts/builder.ts:146`)。

而群房回合的 `collabRoomOverrides` 禁用清单第 13 项正是 `'plugins'`
(`app/engine/prompt/system-prompt.ts:160`)。注释写着意图:

> every product developer section (plugins included — soul-memory rules must not leak into personas) is disabled.

于是:**群房回合的模型请求里 SOUL.md 是 0 字节。**
(`MEMORY.md` / `USER.md` / `daily notes` 更是任何会话都不注入,只能靠 `memory_get` 工具主动取。)

一个额外的浪费:`collectPlugins` 在 builder.ts:107 是**无条件先跑**的,过滤发生在 :149。
所以群房每一回合仍然会 `ensureWorkspace()`、读一次 SOUL.md、构造好片段,**然后原样丢掉**。

### 3.2 第二层:写不进

`afterAssistantResponse` 钩子是 capture(写 daily note)和 review(演化 SOUL.md/DREAMS.md)
的唯一自动触发点,而它对所有 collab 会话被整体短路
(`app/engine/stream/agent-loop-executor.ts:307-310` + `:63-66`):

```ts
runAfterAssistantResponse: (context) => {
  if (isCollabSession(options.state.ctx.sessionId)) return Promise.resolve();
  return runAfterAssistantResponseHooks(context);
},
// isCollabSession: kind === 'room' || 'work' || 'agent'
```

**群聊、私聊、工作台产生的一切对话,完全不会沉淀进任何 agent 的记忆。**

### 3.3 第三层(最深):关掉它的理由,正是形态问题本身

短路那行代码的注释(`agent-loop-executor.ts:294-300`):

> soul-memory's after-response capture resolves `session.agentId` **at hook time** —
> the coordinator flips it per activation, so **X's turn could be written into Y's
> private memory workspace**.

翻译:协调器每次激活都在改会话上的 `agentId`(`turn.ts:624 store.updateSessionAgent`),
而记忆钩子在触发时才去读它——于是小李的回合可能被写进小王的私人记忆里。

**这不是"忘了接线",是"接不上"。** 记忆需要一个稳定的身份锚点,而当前形态下
agent 的身份是**会话上一个被反复改写的字段**。功能因此被迫下线。

这条注释是整份调查里最有价值的一句:它证明了形态问题不是抽象的架构洁癖,
它已经吃掉了一个真实的、本来能用的功能。

---

## 4. 一轮群房回合,模型到底看见什么

(`kind:'agent'` 执行会话,最常见的一轮)

**看见:**

1. `system` = persona 原文(标签外)+ 一块 `<workspace>`:
   `<where_you_are>` 后台执行事实 / `<room name>` 一句指路 / `<speaking>` say 与 @ 机制 /
   `<board>` / `<your_tools>` / `<your_cards>` 自己在手的卡 / `<rules>` 通用规则
2. 一条 `user` 消息 = 整块 `<ChatRoom id name><Members>…</Members><History>…</History></ChatRoom>`
   ——房间侧**一个 assistant 轮都没有**
3. 末尾一条裸 `user` 消息 = 本轮 drive:`<turn agent reason>Your turn. …`

**看不见:**

- 自己执行会话里**上一轮及更早的一切**:thinking 正文、tool call、tool result、旧 drive
- 自己的 SOUL.md / MEMORY.md / daily notes(§3.1)
- 别人的 thinking 记录
- operational 系统行(链长、预算、冻结、未能应答、断路器 note)
- 12 个产品提示词段(skills / os / workdir / todo / agents-md / plugins / …)

`message-helpers.ts:198-203` 把这件事说得很直白:

> The execution session's own transcript is an execution **LOG** and is deliberately
> not input this round ("agent 连续自我记忆" is **a later, separate evolution**).

**那个被推迟的 evolution,就是本文在讨论的东西。**

顺带一提:执行会话的转录**存了,但几乎没人读**。除了 W23 的 drive 戳记去重扫描
(只读 `collabSourceMessageId`,只在 boot、只在快路径 miss 时)、一个"有没有 assistant 记录"的
存在性探针,以及人类 debug 用的 UI 标签页——**它对模型和系统都是死数据**。

---

## 5. 这两天追的每一个症状,都是这个形态的影子

| 症状 | 追到底是什么 |
|---|---|
| **dm 该不该带群消息** | 如果小李是一个人,这问题不存在——它本来就在群里。我上一轮提的"引用转发"是在两个失忆体之间搬字节 |
| **私聊/群聊分不清、用户私聊 ≠ agent 私聊** | 没有一个"小李"站在这些场子之上,每间房只好各自从零解释"你在哪、你是谁" |
| **`<your_cards>` 段落存在** | 注释原文:「房间侧的 agent 对自己正在飞的任务**零感知**,被 @ 时只能凭想象作答,于是『已交付,文件写好了』这种纯编造被说得斩钉截铁」——这是撞过同一堵墙后打的**第一块补丁** |
| **dm 工具要求"背景自己写进消息"** | 对面是另一个失忆体,只能靠发送方自觉复述 |
| **判定说了 `respond:true` 却没 say** | 判定实例与驱动实例是两次独立调用,承诺不跨越 |
| **W23 要去扫转录做去重** | 回合之间没有连续状态可查,只能回头扫日志 |
| **capture/review 被整体关掉** | §3.3:身份锚点不稳 |

**七个症状,一个根。** 而且已经打了至少三块补丁(`<your_cards>`、dm 自述背景、死房兜底行),
每一块都只覆盖一个洞。

---

## 6. 形态设计的三条路

### 甲、什么都不连续(现状形态的诚实版)

承认 agent 是**纯函数**:persona + 工具面,房间是唯一的记忆。

- **代价**:它永远成不了"同事";每个症状继续单独打补丁;
  `agents/` 目录那块已经在长的记忆继续只在单聊路径生效——一个只对一半场景有效的功能
- **好处**:便宜、可并发、边界干净、无需任何改动

### 乙、连续的是转录

一个 agent 一条不断增长的上下文,所有房间的事件汇进去。dm 的上下文问题自动消失。

- **三个硬代价**:
  1. 同一 agent 在两间房被同时激活必须**串行**——今天是并行的(锁粒度已经从 per-agent 降到 per(agent×房),这一步要退回去)
  2. 上下文是所有房间之和,每轮全量重放
  3. 群 G 的内容会自动出现在它于群 H 的回合里

### 丙、连续的是**自我状态**(我的建议)

房间投影**按房给,不变**;另加一层薄的、被策展的"我":
我是谁、我手上有什么卡、我最近在别处做了什么、我有哪些开着的私聊。

```
persona(system,原文)
<workspace>…</workspace>      ← 场子事实,已有
<myself>…</myself>            ← 新:连续性住在这里
<ChatRoom …>…</ChatRoom>      ← 这间房,已有
```

**选丙的三个理由,都是这次调查给的:**

1. **一个人不等于他的全部转录。** 人类同事记得"我在产品组跟一天聊过登录页排期",
   不记得那场对话的逐字稿。丙对应的是记忆,乙对应的是录音。

2. **丙不是从零造,是把一条已经铺好、两端断开的路接上。**
   - per-agent 记忆工作区:**已存在**,磁盘上在长
   - agentId → 工作区的解析:**已正确**(执行会话的 `session.agentId` 就是被激活的 agent)
   - `<your_cards>`:**已经是 `<myself>` 的第一节椎骨**——它存在的理由就是"房间侧 agent 对自己零感知"

   缺的只有三件:(a) 让它进群房回合;(b) 让群房回合写得回去;(c) 解决 §3.3 的身份锚点问题。

3. **它保留了当前架构的全部优点**:房投影不变、并发不变、上下文规模不变、
   房间边界不变(不会把群 G 的内容漏进群 H)。

---

## 7. 两个待你拍板的问题(现在有证据了)

### 问题一:并发怎么处理?

丙里房投影不变,所以**并发天然还在**。但 `<myself>` 若要反映"我刚在别处做了什么",
两个并行回合看到的自我状态就可能不一致。

- **读时快照(最终一致)**:每轮开始时读一次,回合内不变。便宜,与现有 profile 快照同款纪律
  (`profile.ts` 注释:「装配层在回合开始时解析一次并把快照往下传,于是回合中途的编辑
  不会产生半新半旧的组合」)
- **同 agent 全局串行**:强一致,但要把锁粒度从 per(agent×房) 退回 per-agent,
  丢掉 collab-team-v2 §1.1 刚拿到的并发

我的倾向:**读时快照**。理由是它与仓库既有的一致性口径同源,而且"我最近在别处做了什么"
这类信息本来就没有强一致的必要——人也不是实时知道自己在另一个房间说了什么。

### 问题二:`<myself>` 里装什么、谁来写?

- **系统按事实拼装**:在飞的卡(`<your_cards>` 已经在做)、最近 N 个房各一行摘要、
  开着的 dm、当前 goal。可靠、机械、零额外模型调用,但只能装"事实",装不了"我怎么想的"
- **agent 自己维护一份笔记**:就是 SOUL.md / MEMORY.md 那套。更像人,能装判断和倾向,
  但要解决 §3.3 的身份锚点问题,而且每次演化要多花一次模型调用
- **两层都要**:事实层系统拼,判断层走已有的 soul-memory,只是把两根断线接上

我的倾向:**两层都要**,但分期——先接事实层(低风险、立刻消除 §5 表里的大半症状),
再处理 soul-memory 的身份锚点(需要先把 `session.agentId` 被反复改写这件事解决掉)。

---

## 附:关键证据索引

| 结论 | 证据 |
|---|---|
| agent 定义唯一真源 | `~/.onething/agents.json`;`packages/onething-runtime/src/agents/store.ts:343` |
| 7/11 可选字段从未写过 | 实测字段直方图(§1.2) |
| `executor` 零消费点 | 全仓 grep,只有类型/归一/投影 |
| per-agent 记忆工作区 | `plugins/soul-memory.ts:2769-2784 resolveSoulMemoryRootPath` |
| 记忆读不到(群房) | `app/engine/prompt/system-prompt.ts:160` 禁 `plugins` 段;`prompts/builder.ts:146,149` |
| 记忆写不进(群房) | `app/engine/stream/agent-loop-executor.ts:307-310`、`:63-66` |
| 关掉的理由是身份流动 | `agent-loop-executor.ts:294-300` 注释 |
| 执行会话转录不进输入 | `app/engine/stream/message-helpers.ts:198-203` |
| 在场面永不落库 | `docs/design/agent-domain-model.md` §2 铁律 1;`agents/presence.ts:69` |
| 工具面跟着回合走 | `agents/profile.ts:60-70` `GRANTS_BY_SESSION_KIND` |
| persona 在群房是原文、在 chat 是"资料" | `collab/roster.ts:369-374` vs `prompts/builder.ts:112-116` |
