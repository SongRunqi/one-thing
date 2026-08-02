# Agent 自我状态:走变量系统 + 注入预算化

> **修订 R1(2026-08-01,用户定调)**:本文 P0/P1 定的三档 volatility + 全局预算
> **被推翻**,改为下面这一套。P2/P3 的内容(自我状态三变量、群聊解禁)不变。
> 修订的理由是一处真错:原方案把 `my_cards` 一并纳入预算截断,
> 意味着 agent 可能**看不见自己的卡**——那恰好把丙的目的抵消掉了。
> 详见 §R。

> 2026-08-01。承接 `docs/audit/agent-form-2026-08-01.md` 的结论(选丙:连续的是自我状态)。
> 用户定调两条:①用**变量系统(agent scope)**承载自我状态;②变量注入**改为固定数量**,
> 溢出部分由模型用变量工具自己读。

---

## 0. 方案要旨

**不新造 `<myself>` 段。** agent 的自我状态就是 `scope: 'agent'` 的变量——这条链路已经完整实现,
只是从没被用过(`~/.onething/variables.json` 的 `agent_variables` 当前是 `{}`)。

自我状态分两层,对应变量系统里两种已有的写入范式:

| 层 | 谁写 | 变量系统里的先例 |
|---|---|---|
| **事实层** | 系统(只读 provider,每回合现算) | `background_jobs` / `goal` / `music` |
| **判断层** | agent 自己(`variable set scope=agent`) | 工具描述已经在鼓励:「anything you record is in front of you every turn afterwards」 |

**四期,顺序不能换**(后一期依赖前一期):

| 期 | 内容 | 为什么必须在前 |
|---|---|---|
| **P0** | 注入预算化 + 确定性排序 | 群聊解禁前必须先封住膨胀口;今天注入**无任何条数/长度上限**,理论最坏 6 万 token |
| **P1** | 变量工具补 `get` / `keys`,复活 `on-demand` | 没有精确读,截断就是**纯信息丢失**——模型没有任何办法把被截掉的捞回来 |
| **P2** | agent 自我状态两层落地 | 依赖 P1 的 scope 读法 |
| **P3** | 群聊解禁变量通道 | 依赖 P0 的预算,否则群聊 prompt 直接膨胀 |

---

## 1. 为什么是变量,而不是新造一个提示词段

三条,都是这次调查给的实证:

1. **positioning 早就对上了。** 你此前定过「variable = 运行时状态面板,不是偏好存储」。
   agent 的自我状态(我手上有什么卡、我在哪些房、我最近判断了什么)**就是运行时状态**,
   没有比这更贴的容器。

2. **agent scope 已经建好且零消费。** `agent_variables[agentId]` → `KeyedStoreProvider`
   → `agentStoreGateway.resolveKey = session.agentId` → registry 路由 → 工具 `scope` 参数
   → UI 四分组。**全链路就位**。新造一个 `<myself>` 段等于在旁边平行造第二套状态系统。

3. **`<your_cards>` 本来就该是一个变量。** 它今天是 `roster.ts` 里一段手写的提示词拼接,
   存在的唯一理由是「房间侧 agent 对自己在飞的任务零感知」——这正是 `background_jobs`
   那类 provider 解决的问题形状。把它迁成变量,是把一块补丁归位成器官。

---

## 2. P0:注入预算化(前置)

### 2.1 今天的实况

| 项 | 现状 |
|---|---|
| 变量**条数**上限 | ❌ 无 |
| section **总长度**上限 | ❌ 无 |
| 单变量**值长** | ✅ 512 字符 + 只取首行(`format.ts:13,70-74`) |
| 写入侧配额 | ✅ 4KB/值、64 个/provider ⇒ **理论上限 256 个变量** |
| 实测当前注入 | 831 字符 / ~210 token(全是内置 note dirs,用户自己一个变量都没有) |
| 理论最坏 | ~22 万字符 / **~6 万 token,中间没有任何一处截断** |

顺带一个反差:`variable` 工具自身的 schema 文本(description 901 + 参数 describe 1290 =
2191 字符 ≈ 550 token)**比变量数据本身还大 2 倍**,而且每个请求都随 tools 发送。

### 2.2 改法

唯一渲染出口是 `variables/format.ts:55-92` 的 `renderLines`,改这一处两个通道同时受益。

```ts
// format.ts DEFAULT_OPTIONS 新增
maxCount: number        // 进 prompt 的条数上限
maxTotalChars: number   // 该通道渲染文本的总字符预算
```

溢出后**不静默丢弃**,尾部补一行常量提示:

```
<var-overflow count="17">Use variable(action="keys") to see what else is here, variable(action="get", name=…) to read one.</var-overflow>
```

### 2.3 ⚠️ 排序纪律:**绝不能按 updatedAt 排序**

这是本期最容易做错的地方。

`registry.ts:84-103` 的注释已经写死了口径:「同一组变量必须永远渲染成同样的字节,
否则白白打穿 prompt-cache」。而 static 通道正压在 Claude 的 **system 前缀断点最后一格**
(`builder.ts:137-139`),**改一个字节 = 整个 system + tools 前缀全部 cache miss**。

所以:

- **static 通道**:按 `name` 字典序(与 registry 现有 chunk 内排序同源),预算内取前 N。
  只要变量集合不变,bytes 就不变。**按最近更新排序会让顺序随每次写抖动,等于每写一次变量
  就炸一次前缀。**
- **turn 通道**:走 `<context-update>`,永不进前缀,预算可宽松些,但仍需上限。
  排序同样用 name(去重判定是逐字相等,顺序抖动会让去重失效、每回合都重新注入一块)。

同理,溢出提示里的 `count` 是个会变的数字——它本身也会打穿前缀。**取舍**:接受它
(集合大小的变化本来就该让前缀失效一次),但**绝不能**在提示里放"最近更新时间"这类每回合都变的东西。

### 2.4 预算取值

建议 static 通道 `maxCount: 12` / `maxTotalChars: 2000`,turn 通道 `maxCount: 8` / `maxTotalChars: 1500`。
配置从 settings 读(有默认值,不暴露到设置 UI——技术参数走默认值,这是既有纪律)。

---

## 3. P1:让"自己去读"这件事真的可行

### 3.1 今天读不了

`variable` 工具的 action 只有 `list | set | append | remove | delete`:

- ❌ **不能按 name 精确读**——没有 `get`;`name` 参数只对写操作生效,`list` 分支直接忽略它
- ❌ **不能只列 key**——`renderForOutput` 无投影,`list` 永远返回全量快照

也就是说:**今天做截断 = 纯信息丢失。** 必须先补读法。

### 3.2 补两个 action

```
get   { name }            → 单个变量,值不截断(工具输出不进缓存前缀,可以完整给)
keys  { scope? }          → 只列 name + type + scope + desc,不带值
```

`keys` 是关键:它让模型知道**有什么可读**而不必付出读全量的代价。溢出提示里指的就是它。

### 3.3 复活 `on-demand`

`volatility: 'on-demand'` 在类型/schema/IPC 里都定义了,但**没有任何 provider 产生它**,
工具的 zod 参数也只开放 `['static','turn']`——**今天是个死枚举值**。

它的语义恰好是本方案需要的第三档:**不进任何 prompt 通道,只能工具读**。两个用途:

1. 用户/agent 显式给大值、低频用的变量打上这一档
2. P0 溢出的那些变量,在概念上就是 on-demand

改动:工具 zod 参数开放第三个值,`format.ts:115` 的过滤已经支持。

### 3.4 文案要跟着改

`prompts/content/context-variables-intro.md` 当前宣称 *"its list action shows untruncated values"*
——一旦开始截断,这句就是**假话**。改成说清三件事:这里只显示前 N;完整清单用 `keys`;
读某一个用 `get`。

(这与近两天的主线一致:提示词里不能有假话。)

---

## 4. P2:agent 自我状态两层

### 4.1 事实层 —— 一个只读 provider

照 `background-jobs.ts` 的形状写(30 行):`list()` 现算、`readonly: true`、
`volatility: 'turn'`(它每回合都可能变,不该进缓存前缀)、`claims()` 匹配名字、
名字进 `RESERVED_NAMES`、在 `bootstrap.ts` 注册。

产出三个变量(少而精,每条都占预算):

| 变量 | 内容 | 取代 |
|---|---|---|
| `my_cards` | 我名下在飞的卡:`#a1b2c3d4「标题」doing` | `roster.ts` 里手写的 `<your_cards>` |
| `my_rooms` | 我在哪些房 + 各自最近活动的**粗粒度**时间 | 无(新) |
| `my_dms` | 我开着哪些私聊 | 无(新) |

数据源全部是现成的:`computeAgentPresence(agentId, sessions)` 已经吐
`{ dmRoomId, roomSessionIds, execSessionIds, workSessionIds }`,看板走 `getCollabSelfTaskFacts`。
**不新增任何存储**——与「在场面永不落库」那条铁律一致,仍然是每次现算的推导视图。

### 4.2 ⚠️ 值里绝不能放每回合都变的数字

`background-jobs` / `music` 两个 provider 的注释都反复强调过这条:值里带活动时长、
播放进度这类每 tick 都变的数字,**turn 通道的去重就失效了,每回合都会注入一块新的**。

所以 `my_rooms` 里的"最近活动"必须是粗粒度——照 `datetime` provider 的做法
(它故意做**小时粒度**,让连续回合字节相同)。写「今天」「昨天」「3 天前」,
**不要**写「3 分钟前」。

### 4.3 判断层 —— agent 自己写

不需要新机制。`variable(action="set", scope="agent", …)` 已经能写进
`agent_variables[<当前 agentId>]`,而工具描述本来就在鼓励这件事:

> Use this freely and proactively: anything you record is in front of you every turn afterwards,
> with no re-discovery.

要做的只有一件:在群房的 `<workspace>` 里补一句事实,告诉它这个场子里也有这块板
(今天群房里模型**看不到任何变量的值,却握着变量工具**——工具在,数据不在)。

### 4.4 `<your_cards>` 的迁移

`roster.ts` 的 `formatCollabSelfTaskFacts` + `system-prompt.ts` 的 `taskFacts` 参数一并删除,
内容改由 `my_cards` 变量承载。好处:一处产出、两条通道自动受益、UI 面板里用户也看得见
(今天 `<your_cards>` 只有模型看得见)。

---

## 5. P3:群聊解禁变量通道

### 5.1 今天断在哪

`app/engine/prompt/system-prompt.ts:147-161` 的 `disabledSections` 里同时有:

```
'context-variables',          // 变量值进不来
'context-update-convention',  // 连 turn 通道的说明文案也没了
```

结果:**群房里模型看不到任何变量的值,但仍握着 `variable` 工具**,而该工具唯一的读法
是全量 `list`。这个组合最糟——既没有被动可见性,主动读的代价又最高。

### 5.2 为什么可以解禁

禁用整批产品段的理由写在注释里:*"soul-memory rules must not leak into personas"*——
防的是**产品说明文案**污染 persona。

而 `<context-variables>` 不是产品说明,**它是运行时状态板**,正是群聊里最该有的东西。
配合 P0 的预算(static ≤ 12 条 / 2000 字符),膨胀风险是封住的。

`context-update-convention` 同理解禁——否则 turn 通道的块进来了,却没有任何文案
告诉模型那是什么。

### 5.3 顺带:soul-memory 也许能一起解禁(待验证)

审计里说 capture/review 被 `isCollabSession` 整体短路,理由是:

> soul-memory's after-response capture resolves `session.agentId` **at hook time** —
> the coordinator flips it per activation, so X's turn could be written into Y's workspace.

但**协调器翻的是房间会话的 `agentId`**(`turn.ts:624 updateSessionAgent(roomSessionId, …)`),
而 W18 之后回合跑在**执行会话**里,执行会话的 `agentId` 是
`ensureCollabAgentSession` 创建时写死并每次强制对齐的(`if (session.agentId !== agentId) …`)。

**这条注释很可能写于 W18 之前(那时流跑在房间会话上),风险已经消失。**

不在本方案范围内,但值得单独验一次——如果成立,agent 的记忆层(判断层的持久化形态)
也能在协作场景里活过来。**验证方式**:在 `afterAssistantResponse` 钩子里打一行日志,
记录 `sessionId` / `session.kind` / `session.agentId`,跑一轮群聊看 agentId 是否稳定。

---

## 6. 顺带必须修的一个真 bug

`onething.sqlite` 的 `session_variables` 表结构是 `(session_id, name, value, description, updated_at)`
——**缺 `type` / `scope` / `volatility` 三列**。

后果:session 变量一旦经过那条落盘路径就丢 volatility,**本该走 turn 通道的会退回 static 默认值**,
直接打脸整个缓存设计。本方案重度依赖 volatility 分档,这个洞必须先堵。

---

## 7. 改动清单

| 期 | 文件 | 改什么 |
|---|---|---|
| P0 | `variables/format.ts` | `renderLines` 加 `maxCount`/`maxTotalChars`;溢出提示行;确定性排序(name 字典序) |
| P0 | `variables/format.ts` `DEFAULT_OPTIONS` | 两个通道各自的预算默认值 |
| P0 | `app/variables/index.ts:334-342` | `buildVariablePromptSections` 透传预算 |
| P1 | `tools/builtin/variable.ts` | action 加 `get`/`keys`;`renderForOutput` 加投影;volatility zod 开放 `on-demand` |
| P1 | `prompts/content/context-variables-intro.md` | 改文案(截断 + 两个新读法) |
| P2 | `variables/providers/agent-self.ts`(新) | 只读 provider,产出 `my_cards`/`my_rooms`/`my_dms` |
| P2 | `variables/types.ts` `RESERVED_NAMES` | 加三个名字 |
| P2 | `variables/bootstrap.ts` | 注册 provider |
| P2 | `app/variables/gateways.ts` | 自我状态的 cache-backed 读函数(presence + board) |
| P2 | `collab/roster.ts` + `app/engine/prompt/system-prompt.ts` | 删 `formatCollabSelfTaskFacts` 与 `taskFacts` |
| P3 | `app/engine/prompt/system-prompt.ts:147-161` | 移除 `context-variables`、`context-update-convention` |
| P3 | `collab/roster.ts` `<workspace>` | 补一句"这里也有状态板"的事实 |
| 修 bug | session 变量 sqlite schema | 补 `type`/`scope`/`volatility` 三列 + 迁移 |

---

## 8. 待你拍板

**一、预算取值。** 我给的是 static 12 条 / 2000 字符、turn 8 条 / 1500 字符。
参照系:今天实测注入 831 字符,而 `variable` 工具自身的 schema 就占 2191 字符。
这个量级你认可吗?

**二、事实层就这三个变量吗?** `my_cards` / `my_rooms` / `my_dms`。
候选还有 `my_goal`(但 `goal` 变量已存在,可能重复)、`my_recent_says`(我最近在各房说了什么——
信息量大但会挤爆预算)。我倾向先只做这三个,真机看不够再加。

**三、判断层要不要给引导?** agent 自己写的自我状态,是完全靠它自觉(工具描述已经在鼓励),
还是在群房 `<workspace>` 里补一句更具体的引导(比如"聊出结论后记进 agent 变量,
下次你还记得")?我倾向**只陈述事实,不指挥**——这是 roster.ts 的既有铁律,
而且 W22 的教训是措辞层的督促往往产生废话行为。

---

# §R 修订 R1:一个 `state` 标志,取代三档 volatility

## R.1 推翻了什么

| 原方案 | R1 |
|---|---|
| `volatility: 'static' \| 'turn' \| 'on-demand'` 三档 | **`state: boolean` 一个标志** |
| static 进 system prompt、turn 进 `<context-update>`、on-demand 都不进 | **state 进 `<context-update>`,非 state 一律不进** |
| 所有变量共享一份预算,超出即截断 | **state 不受任何预算约束**;非 state 根本不注入,预算无处可施 |
| `<context-variables>` 段装变量值 | 该段退化成一句**常量指路**(见 R.4) |

## R.2 为什么

**一、原方案有一处真错。** 把 `my_cards` 纳入预算截断 = agent 可能看不见自己在飞的卡。
而 `<your_cards>` 当初存在的全部理由,就是「房间侧 agent 对自己的任务零感知,
被 @ 时只能凭想象作答,于是『已交付,文件写好了』这种纯编造被说得斩钉截铁」。
让状态层可被截断,等于把这个事故留了个后门。**状态必须一直在眼前,这是它的定义。**

**二、三档 volatility 名不副实。** 它名义上分的是"变得快不快",实际决定的是
"进不进缓存前缀"。而 `on-demand` 从落地那天起就是**死枚举**——没有任何 provider 产出它,
工具的 zod 也不开放它。一个三档模型里有一档从未存在过,说明这个维度本来就不该有三档。

**三、真正要回答的问题只有一个**:这个变量**要不要一直在模型眼前**。
- 要 → `state: true`,每回合都在
- 不要 → 工具读(`keys` 看有什么、`get` 读一个)

这个二分同时把"变得快不快"消解掉了:凡是要一直看见的,就别放进缓存前缀;
凡是不用一直看见的,压根不占位置。

## R.3 `state` 的语义

> **`state: true` = 模型需要一直知道的当前状况。**

判据是**"要不要一直在眼前"**,不是"变得快不快"。所以稳定但必须知道的东西
(笔记目录)同样是 state;而变得很快但没人需要盯着的东西不是。

内置变量的归属:

| 变量 | state | 理由 |
|---|---|---|
| `my_cards` / `my_rooms` / `my_dms` | ✅ | 自我状态层,丙的本体 |
| `background_jobs` / `goal` / `git_branch` / `datetime` | ✅ | 当前状况,原本就是 turn 档 |
| `music` | ✅ | 同上 |
| `ai_note_dir` / `user_note_dir` / `work_note_dir` | ✅ | 稳定,但模型每次写笔记都要用——「一直要知道」 |
| 用户/agent 自建变量 | 默认 ❌ | 显式写 `state: true` 才进 context |

`workdir` 不变:它一直由独立的 `# Work Directory` 段渲染,不走变量注入。

## R.4 落到请求里的形状

**唯一数据通道 = `<context-update>` 尾部块。** 一个 state 变量都没有时,整块不出现。

```
<context-update>
<var name="my_cards">#a1b2c3d4「登录页改版」doing</var>
<var name="my_rooms">「官网改版组」今天</var>
</context-update>
```

**system prompt 的 `<context-variables>` 段退化成一句常量**(不再装任何值):

> There is a state board in this session. Current state arrives in `<context-update>` blocks below.
> Everything else on the board is read with `variable(action="keys")` and `variable(action="get", name=…)`.

这一句是**常量**,所以 system 前缀**永远不再因为变量而失效**——这是 R1 顺带拿到的最大收益。
原方案里 static 通道压在前缀最后一格,改一个字节就打穿整个 system + tools 缓存;
R1 之后这个风险从"每写一次变量"降到"零"。

## R.5 预算怎么办

- **state:不设上限。** 它是一块状态板,不是数据仓库;要一直知道就得全给。
  真长到离谱是产品问题(该收敛状态),不是靠截断掩盖的问题。
- **非 state:不注入,预算无处可施。** `renderLines` 的 `maxCount`/`maxTotalChars`
  与 `<var-overflow>` 提示行**一并删除**。
- **单值仍然截断**:`maxValueLength: 512` + 多行只取首行保留——那是防单个变量炸场,与预算是两回事。

## R.6 迁移

`volatility` 字段从类型、schema、IPC、工具参数、UI 全面移除,换成 `state`。落盘数据的映射:

| 旧值 | 新值 |
|---|---|
| `'turn'` | `state: true` |
| `'static'`(内置 note dirs) | `state: true`(R.3 的判据) |
| `'static'`(用户自建) | `state: false` —— **行为变化**:它们此前在 system prompt 里,现在要工具读 |
| `'on-demand'` | `state: false`(本来就不进 prompt,行为不变) |

最后一行的**行为变化要明说**:用户此前建的普通变量会从"每回合都在眼前"变成"要自己去读"。
考虑到实测数据里**用户自建变量总共 3 个**(且都在一个 project 下),影响面极小;
而想要旧行为的,显式加 `state: true` 即可。

## R.7 改动清单(相对已落地的 P0-P3)

| 文件 | 改什么 |
|---|---|
| `variables/types.ts` | 删 `VariableVolatility` 与 `volatility` 字段,加 `state?: boolean` |
| `variables/format.ts` | 删预算/溢出行;`splitVariablesForPrompt` 改为「state → 尾部块 / 其余 → 不渲染」 |
| `variables/schema.ts` | 落盘字段 `volatility` → `state`;读时做 R.6 的映射(旧文件不重写,读到即转换) |
| `variables/providers/*.ts` | 六个内置 provider 的 `volatility:'turn'` → `state:true`;notes provider 补 `state:true` |
| `variables/providers/agent-self.ts` | 三个变量 `volatility:'turn'` → `state:true` |
| `tools/builtin/variable.ts` | 参数 `volatility` → `state: boolean`;描述改写 |
| `prompts/builder.ts` | `context-variables` 段改成常量指路(R.4) |
| `prompts/content/context-variables-intro.md` | 重写成 R.4 那句 |
| `app/variables/index.ts` | 去掉预算透传;`trackStaticSectionChange` 遥测删除(前缀不再因变量变动) |
| `core/session/store-helpers.ts` | 白名单里 `volatility` → `state` |
| `shared/ipc/variables.ts` + preload + `VariablesPanel.vue` | 字段换名,UI 的 volatility 展示改成 state 标记 |
