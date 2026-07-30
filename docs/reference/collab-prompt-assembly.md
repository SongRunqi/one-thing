# 群聊 agent 提示词组装

对照代码写成的参考文档（2026-07-30，P0 批次落地后）。描述群聊（`kind === 'room'`）里一个 agent 被激活时，送进 provider 的 system / history / user 分别由谁拼出来、每段原文在哪个文件。

不含设计论证，只陈述现状；每条论断带 `文件:函数`（不带行号，防漂移）。

---

## 1. 一句话总览

一个房间回合的请求由三部分组成：

| 部分 | 内容 | 出处 |
| --- | --- | --- |
| `system` | persona 原文 → 情况说明 → 通用规则 → `Current date` | `app/engine/prompt/system-prompt.ts:collabRoomOverrides` → `collab/roster.ts:buildCollabRoomSystemPrompt` → `prompts/builder.ts:core` |
| history | 目标房间的 IM 投影（别人的话包在 `<msg from="…">` 信封里） | `app/engine/stream/message-helpers.ts:projectRoomMessagesForModel` |
| 工具 | `say` + `board` 两个 tools schema，说明写在工具 description 里 | `collab/tool-surface.ts:COLLAB_ROOM_TOOLS`、`tools/builtin/say.ts` |

产品提示词的 13 个 developer 段全部关掉；工具说明不进 system。

回合从 2026-07-30 起在 agent 自己的执行会话（`agent-exec-<agentId>-<roomId>`，`collab/agent-session.ts:collabAgentSessionId`）里跑，但读的仍然是房间。

---

## 2. 房间回合 system 的四段

装配入口：`app/engine/prompt/system-prompt.ts:collabRoomOverrides`。它在 `coreOptions` 里覆写 `baseSystemPrompt`，同时把 `toolGuidelines` 清空、把产品段列进 `disabledSections`。

`baseSystemPrompt` 本身由 `collab/roster.ts:buildCollabRoomSystemPrompt` 拼，顺序固定，段间 `\n\n`：

### 2.1 persona 原文（一字不动）

```ts
const persona = options.personaPrompt.trim() || `你是${options.self.name}。`
```

`personaPrompt` 来自 `agent.systemPrompt`（`collabRoomOverrides` 里 `selfAgent.systemPrompt || \`你是${selfAgent.name}。\``）。没有前缀、没有 `# Agent:` 帽子、没有改写。空 persona 才回落到一句 `你是<名字>。`

### 2.2 情况说明（括注式事实块）

`collab/roster.ts:buildCollabRoomContext`。整块用 `(情况说明:…)` 包住，逐行都是**事实陈述**，不含「你应该…」：

1. `(情况说明:你在群聊「<群名>」里,群成员:<用户、名字(职务)、…>。` —— 成员列表把用户排在最前，其他成员按 `name(title)`（无 title 则只有 name）拼，`self` 被排除。
2. `其他人的消息会以「名字: 内容」的形式转发给你。`
3. `发言用 say 工具:调用 say 才会把内容发进群里,一轮可以调用多次…不调用 say 就是保持沉默,群里不会出现任何来自你的消息;你这一轮说的其他内容都只是你的思考过程,群里看不到。`
4. `在消息里写「@名字」也可以让那位成员看到并回应(系统会自动带上该成员的 id,改名后依然有效)。`
5. `群里配有共享任务看板,用 board 工具查看/建卡/指派/评审。…要让 TA 动手执行,必须在看板上建卡并指派给 TA…`
6. `除 say 和 board 外你在群里没有其他工具,也无法直接读取文件或访问网络——想要动手做的事,建卡指派给合适的成员。)`

再拼一行可选的自身任务事实（`collab/roster.ts:formatCollabSelfTaskFacts`，看板数据由 `app/collab/board-store.ts:getCollabSelfTaskFacts` 提供）：

```
(你名下的任务:#a1b2c3d4「标题」——你正在工作会话里执行;#…「…」——你的执行受阻。以看板上的状态为准。)
```

名下没有在飞的卡时这一行整条不出现（`facts.length === 0` 返回 `''`）。

### 2.3 通用规则（只有真回合才有）

`collab/agent-rules.ts:buildCollabCommonRules`，由 `buildCollabRoomSystemPrompt` 的 `includeCommonRules` 开关控制；`collabRoomOverrides` 传 `true`，意愿判定不传（见 §7）。六条，每条都对应一道机械防线：

- 标签白名单只有 `<card id="…"/>` 与 `<file path="…"/>`（落库转义兜底：`collab/inline-tags.ts:sanitizeCollabInlineMarkup`）；
- 两种标签会被验真，指不存在的东西只渲染成点不动的文字；
- 卡状态永远用 `board` 的 `list` 现查，不信历史消息里的快照；
- `<msg from="…">` 是系统加的信封，自己发言时不要写；
- 轻重活分界：要动多个文件或跑很久的，先 `board start` 开工作会话；
- 汇报礼仪：关键节点 `say` 一句；完工先 `say` 再 `board complete`；产出写当前工作目录（即群 folder）。

工作台会话看到的是另一份更短的 `collab/agent-rules.ts:buildCollabWorkRules`（三条）。

### 2.4 `Current date`

`prompts/builder.ts:core` 在 `baseSystemPrompt` 之后无条件追加：

```
<baseSystemPrompt>

Current date: <formatDate(now)>
```

`toolGuidelines` 被 `collabRoomOverrides` 清成 `[]`，所以 `Tool Guidelines:` 那一段不出现。

---

## 3. 13 个产品 developer 段全关

`app/engine/prompt/system-prompt.ts:collabRoomOverrides` 的 `disabledSections`：

```
agent, voice, runtime-context, context-update-convention, workdir,
active-project, known-projects, skills, os, todo, agents-md,
context-variables, plugins
```

这正好是 `prompts/builder.ts:buildRuntimeSystemPrompt` 里 `sections` 数组的全部条目（12 个静态段 + `plugins`）。`plugins` 在列表里，意味着 soul-memory 插件段也不会漏进 persona。

`agent` 段被关的原因写在同一处：persona 已经**是** system 本身，再来一个 `# Agent: <名字>` 段就是同一段文本进两遍。

生效条件（任一不满足就整个 override 返回 `null`，回落成普通产品提示词）：

- 会话是 `kind === 'room'`，或 `kind === 'agent'` 且 `collab.roomSessionId` 指向一个真房间；
- `session.agentId` 能解析出 agent（`app/agents/index.ts:getAgent`）；
- 房间成员列表解析出至少一人。

---

## 4. 工具说明走 tools schema，不进 system

房间回合的工具面恒等于 `['say', 'board']`（`collab/tool-surface.ts:resolveCollabToolAllowlist`，`kind === 'room' | 'agent'` 分支）。2026-07-30 收紧：这是**整个**工具面，与 agent 自己的白名单无关——配了就无视，没配也不再回落到「不限制」。同一条规则在 `agents/profile.ts:AGENT_TOOL_GRANTS` 里以 `collab-room` / `mode: 'replace'` 再表述一遍，两份必须一致。

工具怎么用，写在工具自己的 schema 里，不在 system：

- `tools/builtin/say.ts` 的 `description`：「Speak in the room. This is the ONLY way anything you produce reaches the other members…」，并明确 `Not calling it at all is silence, and silence is a normal outcome`；
- 参数说明也在 schema：`content` / `mentions`（roster 里的 agent id）/ `replyTo`（被引消息 id）/ `room`（显式目标房间，一般留空）；
- 失败语义同样由工具返回文本承担（`collab/say.ts:COLLAB_SAY_REFUSED_*`）。

所以「怎么发言」这件事在三处说，且口径一致：情况说明（事实）、say 工具描述（契约）、nudge 文案（失手兜底）。

---

## 5. 「persona 原文即 system 不可包装」铁律

出处四处，措辞不同、方向一致：

- `collab/roster.ts:buildCollabRoomContext` 头注释：*the agent's OWN prompt is the entire identity — verbatim, untouched. This note only states the situation… No rules, no role-play framing, no behavioral instructions*；
- `collab/roster.ts:formatCollabSelfTaskFacts` 注释：*只陈述,不指挥（persona 原文 + 情况说明的铁律）：没有"你应该…",没有角色扮演口径*；
- `collab/agent-rules.ts` 头注释划分工，正是这条铁律的边界：情况说明陈述「这个场子是什么样」，通用规则陈述「怎么用手上的东西」——*混在一起写,情况说明"只陈述不指挥"的铁律就没了边界*；
- `collab/willingness.ts` 头注释：*Prompt discipline is the same red line as the room turn (roster.ts): the persona is used VERBATIM*；
- 设计原文 `docs/design/multi-agent-collab.md`（实施状态段，2026-07-27 真机反馈修正②）：用户原话「**角色的 system prompt 就该是他的 agent 提示词本身,不加任何包装与行为规则,只可附加房间成员等情况说明**」；同段记录了 v3 定稿删掉的东西（规则块、具身宣言、沉默铁律、`[pass]` 指令）与「防冒充/防旁白/静默全部改由结构保证」的替代方案。

推论：想调群聊行为，先看能不能加一道机械防线；实在只能靠措辞时，调节杆是**情况说明的措辞**，而不是往 persona 前后加规则块。

---

## 6. 每回合的 drive user 消息

`app/collab/turn.ts:runActivationTurn` 里的 `emitDrive`。首轮文案：

```
(<agent.name> · <reasonLabel>)
(你的发言通过 say 工具送出,可多次;说完直接结束。)
```

`reasonLabel` = `collab/activation.ts:formatCollabActivationLabel(record.reason, record.driveLabel)`，取值：

| 来源 | 文案 |
| --- | --- |
| `COLLAB_ACTIVATION_LABELS.mention` | `被 @ 激活` |
| `COLLAB_ACTIVATION_LABELS['self-elected']` | `主动接话` |
| `COLLAB_ACTIVATION_LABELS['task-event']` | `任务事件` |
| `COLLAB_ACTIVATION_LABELS.schedule` | `定时触发` |
| `record.driveLabel` 覆盖（task-event 专用） | `任务交付待评审` / `任务受阻待处置` / `任务已指派待开工`（`collab/activation.ts:COLLAB_DRIVE_LABEL_*`） |

第二轮（W14d nudge，最多一次）复用同一个 `emitDrive`，文案是 `collab/say.ts:COLLAB_SAY_NUDGE_TEXT`：

```
(你刚才写的内容没有发进群里——群里只能看到你用 say 工具发出的消息。要说就调用 say;确实不想说就什么都不用做。)
```

drive 命令上刻意**没有** `initialToolChoice`（`turn.ts:emitDrive` 内长注释）：W22 曾把回合首调强制成 `say`，2026-07-30 移除——被 @ 却确实没自己的事的 agent 会被迫发一条「我这轮不说了」的废话。现在沉默 = 什么都不调。

drive 还携带：`channel`（房间 connector）、`source: 'collab'`、`collabDriveToken`（`app/collab/drive-guard.ts`）、`collabSourceMessageId`（W23 幂等账本）、`usageSource: 'collab-room'`、`suppressTitleGeneration`，以及 agent 的 model/thinking 绑定（会话被用户 pin 过时整组丢弃，P1-4）。

**注意 drive 文本不进模型请求。** `app/engine/stream/message-helpers.ts:projectRoomMessagesForModel` 在 `kind === 'agent'` 分支里把执行会话自己的转录整段丢掉，改投影目标房间；`core/engine/stream-executor.ts` 的文本路只用 `historyMessages`（`messageContent` 只喂图片特殊路）。`app/engine/stream/__tests__/room-projection.test.ts` 明确断言 `expect(text).not.toContain('被 @ 激活')`。turn.ts 里「it sits at the end of the context」的注释与此不符，属于注释未跟上 W18 迁移。drive 现存的作用是：触发一次流、记账（usage / 幂等戳）、以及在执行会话转录里留一条可审计的记录。

---

## 7. 意愿判定的另一套 prompt

`collab/willingness.ts:buildWillingnessPrompt`。同一个 `buildCollabRoomSystemPrompt`，但四处不同：

1. **不含通用规则** —— 不传 `includeCommonRules`。理由写在 `roster.ts:BuildCollabRoomSystemPromptOptions` 注释里：判定是一次 yes/no，不产生 `say`、不写标签、不读看板，每一行规则都是纯成本。
2. **PM 附加一行** —— `pmAgentId === self.id` 时，system 末尾追加 `collab/willingness.ts:COLLAB_WILLINGNESS_PM_FACT`：`(你是本群的负责人。)`
3. **尾窗 ≤ 8 条** —— `buildWillingnessWindow`，`COLLAB_WILLINGNESS_RECENT_LIMIT = 8`，每条按 `COLLAB_WILLINGNESS_LINE_LIMIT = 200` 码点截断（`collab/truncate.ts:truncateAtCodePoint`）。可见性口径与房间投影共用 `collab/cooldown.ts:isCollabProjectedRoomMessage`：drive、`[pass]`、思考记录、未标记系统噪声全部排除；被标记的 collab 系统行（任务生命周期、成员变更）以 `系统: …` 进窗（`collab/system-lines.ts:formatCollabProjectedSystemLine`）。窗口行是**裸的 `名字: 内容`**，不套 `<msg>` 信封（信封只在房间投影里，`collab/projection.ts:wrapCollabMessageEnvelope`）；引用行 `> 作者: 摘录` 与表情统计 `(👍×2)` 挂在同一条 entry 上，不单占一格。
4. **唯一的指令在 user 消息里** —— `collab/willingness.ts:COLLAB_WILLINGNESS_QUESTION` 原文：

```
最新这条消息之后,你会开口说话吗?只输出 JSON: {"respond": true|false, "react": "👍"|null}(不说话时也可以只点个表情,可选:👍 ❤️ 😂 🎉 🤔 👀;不想点就填 null)
```

表情候选来自 `collab/reactions.ts:COLLAB_REACTION_EMOJIS`。`user` = 窗口行 `\n\n` + 这一句。

回复解析与运行参数见 `docs/reference/collab-response-logic.md` §4。

---

## 8. 附录：角色卡存到哪

- **角色卡本体：`~/.onething/agents.json`**（`storage/paths.ts:getOnethingAgentsPath`）。persona 原文就是每个 agent 的 `systemPrompt` 字段（`agents/store.ts`，缺省 `''`）。读取走进程内缓存（`agents/store.ts`，`getAgent`），外部手改文件后需要 invalidate 缓存才生效。
- **`~/.onething/agents/` 目录不是角色卡**（`storage/paths.ts:getOnethingAgentsDir`）。它是 soul-memory 的**每 agent 记忆工作区**根目录：`app/memory/workspace.ts` 把它作为 `agentsDir` 传给 `plugins/soul-memory.ts:planSoulMemoryWorkspacePaths`，按 `agentsDir/<agentId>` 分配该 agent 的 memory 目录；apps/server 走同一个函数（`apps/server/src/runtime.ts`）。
- 房间回合看不到 memory 段：`plugins` 与 `agents-md` 都在 §3 的关闭列表里。
- 群聊自己的落盘物在 `~/.onething/collab/<roomSessionId>/`（`state.json` / `board.json` / `activity.jsonl`，`app/collab/room-runtime.ts:statePath`），群 folder 由 `app/collab/room-folder.ts:ensureCollabRoomFolder` 分配并作为执行会话与工作会话的 cwd。
