# 群聊协作:规则与提示词全景 + 执行会话感知诊断

日期:2026-08-02 · 基线:`experiment/castlabs-electron` 工作区(含大量未提交的 send_message 改造)
方法:五路并行深读(turn 拼装 / 工具面 / 调度 / 工作会话链路 / 变量与基础提示词),全部逐字核对源码。

---

## 0. 诊断结论(TL;DR)

> 2026-08-02 用户澄清后修订:**症状不是泛化的「不调用工具」,而是「写而未发」——agent 在自己的执行会话里把回复写成正文,却不调 send_message,群里什么都没出现;并且该问题在 `buildWhereYouAre` 改写之前更严重。** 那次改写是治疗尝试,不是病因;初版报告把因果写反了,此节已重写。

按证据强度排:

1. **结构性根因:执行会话的形状就是一场聊天,「输出=回复」的先验极强。** 驱动以 user 消息进入,内容是聊天信封(`<message from=…>`),模型的补全槽紧跟其后——训练数据里这个形状的下一步就是"写回复"。关键实证在 roster.ts:104-106 的注释里:**「四层劝导都在场时真机照样复发,说明失效的不是服从性而是隐喻」**——旧版提示词含明确负事实(「你这一轮说的其他内容都只是你的思考过程,群里看不到」)照样失败。**靠措辞劝导治写而未发,这条路已被真机否决。**

2. **结构性对抗手段已全部拆除,现在只剩提示词在扛。** 时间线:W22 强制首调 say(2026-07-30 撤——沉默必须合法)→ W14d 写而未发补救 nudge(重复发言根因,连根拆)→ 驱动尾注 `<turn>` 块(2026-08-02 删——念经裁撤)。每次拆除都有正当理由,但净效果是:唯一常驻的机制说明只剩 `<Notification desc=…>` 尾注一处。

3. **覆盖洞:desc 尾注恰好在最危险的回合缺席。** `<Notification desc="你收到了群聊消息,你现在在你自己的会话中，所有的内容都不会发到对应的群聊或者agent，发消息使用 send_message tool">` 只在有未读消息(或 relay 的 scheduled)时出现;**零未读 drive——任务事件激活、接力波——连一个字的机制说明都没有**(turn.ts:1006、1032-1037)。而 desc 的存在理由正是「机制说明离决策点越远越容易被跳过」(projection.ts 注释)。另外 system 说「你在一个聊天室中」、desc 说「你在你自己的会话中」,两处对「我在哪」给出相反答案。

4. **当前 `buildWhereYouAre` 一行(roster.ts:116-124)没帮上忙,但不是病因。** 「你在一个聊天室中」保留的正是写而未发先验对应的框架名词(在聊天里,写=说);注释里设计的「工位+推送通知+发送按钮」隐喻没有写进输出(place/audience 参数被忽略,三种场地同一行)。换隐喻的方向与注释里的实证结论一致——只是输出文本尚未兑现它。

**工作会话(kind='work')侧的平行发现**(与本症状独立,仍成立):briefing 尾部规则自相矛盾——`buildCollabWorkRules`(`collab/agent-rules.ts:92-108`)在已经开工的工作会话 recency 最强位写着「Being assigned a card is not an order to begin: ask first」和「`board` start first」,照做=回群问问题或调必被拒的 start;work 的系统提示词零工作身份(collabRoomOverrides 只认 room/agent,`app/engine/prompt/system-prompt.ts:85-88`),任务框架只在一条会老去的 briefing user 消息里,续做刻意不重述(`worker.ts:293-295`)。

**次级问题**(§7 全表):DM 的「Everything you normally have works here」被注释(roster.ts:245-246);三处提示词承诺「no turn limit」但代码强制 maxTurns(默认 100)+30 分钟墙钟;白名单 agent 在协作回合丢 `variable` 工具但 STATE_BOARD_FACT 仍宣称它存在;`board start` 回执不提工作会话已派生。

---

## 1. 会话类型与术语

| kind | 名称 | id 形态 | 系统提示词 | 谁驱动 | 工具面(并集下限) |
|---|---|---|---|---|---|
| `room` | 群聊房本体 | 房间 sessionId | ——(房只存消息,不跑模型) | — | — |
| `agent` | **执行会话**(Team v2 §1,「[执行] X」) | `agent-exec-<agentId>-<roomId>` | persona + 聊天室 `<workspace>`(collabRoomOverrides) | turn.ts 驱动(mention/自荐/接力/任务事件) | own ∪ {send_message, board, history};无白名单=全量 |
| `work` | **工作会话/工作台**(board start 派生) | randomUUID,「[任务] …」 | **完整产品提示词**(无任何协作段) | worker.ts 一条 briefing user 消息 | own ∪ {board, send_message}(注意:无 history);无白名单=全量 |
| dm 房 | 托管私聊(用户↔agent)/ agent 互聊 | 单成员房 | persona + `<chat with=…>` 变体 | 同 turn.ts | 同 room(独立 'collab-dm' grant,防未来收紧误伤) |

术语碰撞:用户口中的「执行会话」可能指 kind='agent'(设计上就是聊天面)也可能指 kind='work'(设计上该干活但身份只在一条 user 消息里)。**两种都会表现出「像群聊参与者、不干活」**,机理不同(§7)。

关键指针:`session.collab.roomSessionId` 创建时写一次、永不改写;say/board 都靠它把 work/agent 会话的输出路由回父房(`collab/say.ts:257-269`、`app/collab/board-tool.ts:20-32`)。

---

## 2. 系统提示词拼装链路

```
turn.ts 驱动回合(kind='agent'/dm)
  └─ app/engine/prompt/system-prompt.ts:111-166  collabRoomOverrides
       baseSystemPrompt = buildCollabRoomSystemPrompt(...)   ← packages/onething-runtime/src/collab/roster.ts
         = persona 原文(XML 外,铁律)
           + <workspace>
               <IMPORTANT_RULES>(buildWhereYouAre — 见 §0.1)
               <room|chat>(花名册 + 信封说明)
               <messaging>(send_message 机制)
               <board> + <your_tools>(judgement 时略)
               <rules>(buildCollabCommonRules)
             </workspace>
       toolGuidelines: []
       disabledSections: [agent, voice, runtime-context, workdir, active-project,
                          known-projects, skills, os, todo, agents-md, plugins]
       —— 只有 context-variables / context-update-convention 存活(P3 解禁)

worker.ts 工作会话(kind='work')
  └─ collabRoomOverrides 不命中 → 完整产品提示词
       default-system.md(你是 onething…)+ Tool Guidelines + # Agent: persona
       + workdir/os/skills/todo/plugins 全套
     任务框架只在 briefing(user 消息)里:buildBriefing + buildCollabWorkRules
     (worker.ts:313-314 自述:「这份 briefing 是通用规则唯一够得着工作台的入口」)

willingness 判定(旁路)
  └─ collab/willingness.ts:174 直接调 buildCollabRoomSystemPrompt(judgement:true)
     —— 无 board/your_tools/rules、无工具、thinking:false、64 token、8s
```

每回合的驱动(drive)是一条合成 user 消息:`roomContext + <elsewhere>`,自 2026-08-02 起**不带任何指令文本**(`turn.ts:1021-1037`);`<Notification desc="你收到了群聊消息,你现在在你自己的会话中，所有的内容都不会发到对应的群聊或者agent，发消息使用 send_message tool">` 是唯一的机制尾注,且**零未读的 drive 连它都没有**。

---

## 3. 各会话类型的模型输入(逐字要点)

### 3.1 群聊回合(kind='agent',经 collabRoomOverrides)

系统提示词 = persona 原文 + `<workspace>`:

```
<IMPORTANT_RULES>
你在一个聊天室中，你只能通过 send_message让他/他们看到你的消息
</IMPORTANT_RULES>
<room name="…">
Who is in it, written the way you address them:
- 用户名#句柄(用户)
- 名字#句柄(职位)…
What they say is delivered to you as `<message from="名字#句柄">` lines.
Anything that arrived since your last turn comes in a `<Notification>` block at the very end — that block is the reason this turn is happening… Everything above it you have already read.
A `<Folded count=…/>` line means older messages exist but are not shown…
</room>
<messaging>
`send_message` delivers one message. One call is one message — call it as many times as you have things to say…
To address someone, write `@name#handle` in the text…
`to` sends the message to ONE person's private chat with you…
With `to`, `wake: true` also posts an @ in this chat once they have read it…
`replyTo` takes a message id and quotes that message.
Not sending anything is fine — with nothing to reply to, reply to nothing.
</messaging>
<board>
The room shares a task board; the `board` tool lists, creates, assigns and reviews cards.
@-ing someone only asks them to speak. To get something actually done by them, put a card on the board and assign it: they pick it up in their own work session with full tools (reading and writing files, running commands) and deliver back to the room themselves.
</board>
<your_tools>
Everything you normally have works here too. Light work — look something up, read a file — just do it, then send it.
Sizeable work belongs on the board, not inside a room turn.
You have a state board here too: the variables shown in this session, readable and writable with the `variable` tool. Unlike this conversation, it is re-sent in full every turn — nothing on it gets summarised away.
</your_tools>
<rules>
- Two inline tags exist and no others: `<card id="…"/>` … `<file path="…"/>` …
- Both are verified when they render… Point only at things that exist.
- Read a card's status live with `board` list…
- Light versus heavy: look something up, answer a question, make a small edit — just do it. Many files, or long-running work — `board` start first: that gives you a work session with no turn limit, where the context survives. No card for it yet, `start` makes one.
- Being assigned a card is not an order to begin: ask first if anything is unclear, and `block` the card with a reason if you cannot do it.
- To settle a detail with one colleague, use `send_message` with `to`… Bring the conclusion back to the room with a plain `send_message`.
- When something needs the user personally … `send_message` with `to: 用户` … do not stop and wait for a reply.
- A private chat is a place to talk, not a place to work: anything hands-on goes back to the room as a card.
- Do not fill air. With nothing new to add, stop — 「收到」 and 「辛苦了」 do not need a message of their own.
</rules>
```

来源:roster.ts:347-398(room)、139-170(messaging)、379-395+15-22(board/your_tools)、agent-rules.ts:48-83(rules)。
Drive(user 消息)= 首轮全量历史 / 之后只有未读 `<Notification>` 块(带 desc 尾注)+ 可选 `<elsewhere>`;任务事件以 `<message from="系统">` 聊天行出现:

> `「${title}」已指派给 ${assignee}。${assignee} 可以先在群里问清楚,确认后用 board 的 start 开工(taskId: …);做不了就 block 并说明原因。`(system-lines.ts:209-221)

### 3.2 托管私聊 / agent 互聊(变体差异)

- 用户 DM:`<chat with="用户"> A one-on-one conversation — just the two of you. What 用户 asks for here is your work to do, on their behalf.`;`<your_tools>` 只剩 board start 一句——**「Everything you normally have works here… just do it」被注释掉了**(roster.ts:245-246)。
- 互聊(pair-DM):`<chat with="同事(职位)"> … ${用户} can see this conversation and may step in… It was opened on its own: 对方 cannot see the context you are coming from — spell it out.`;`<your_tools>`:「Everything you normally have works here. This is a place to talk: anything hands-on goes back to the room as a card.」
- `<messaging>` 私聊版无 @/wake 两行;`<rules>` 用户 DM 版把「private chat is a place to talk」换成「work that is yours gets a card and gets done right here」。

### 3.3 工作会话(kind='work')

系统提示词 = **完整产品提示词**(与桌面普通聊天无差别):

```
<System>
你是 onething，一个运行在 agent 工作台中的智能助手。…
对于需要"做事"的请求，直接用工具执行并根据结果继续行动，直到任务真正完成…
工作方式:行动 → 观察结果 → 下一步行动。… 声称完成之前，用工具验证…
</System>
Tool Guidelines:
- 使用edit来修改文件，禁止使用bash工具来修改文件；使用write来重写或创建文件；
# Agent: <名字>
<persona 原文——通常按群聊同事口吻写>
# Work Directory(cwd=房间文件夹)+ OS + Skills + Todo + …
```

任务框架 100% 在唯一一条 briefing user 消息里(worker.ts:278-318):

```
你被指派了群聊「X」看板上的任务,请在这个工作会话里完成它。
  (续做版:这个任务此前的执行被中断了,现在继续。你的工作历史就在本会话里——先盘点已经做到哪一步(别重复已完成的写入),再往下做。)
任务 #id(当前 rev N)/ 标题 / 详情 / [被打回 N 次提示]
看板现状: <digest>
群聊最近的讨论: <最近 12 条 IM 行>
完成后先用 send_message 把关键结论发进群里(顺手 @ 负责人),再调用 board { action:"complete", taskId, summary } 作为你的最后一个动作,任务进入评审。
工作过程中随时可以用 send_message 在群里发一条…;无法继续时用 board { action:"block", … }。
<workspace>
<where_you_are>
This work session runs in the background. Everything you produce here — prose, reasoning, tool calls and their results — stays here. The only thing that reaches the room is a message you send with the `send_message` tool.
</where_you_are>
<rules>
- …(与群聊 rules 前五条逐字相同,含:)
- Light versus heavy: … `board` start first: that gives you a work session with no turn limit…
- Being assigned a card is not an order to begin: ask first if anything is unclear, and `block` the card…
</rules>
</workspace>
```

**注意最后两条规则在工作会话语境下自相矛盾**(§0.3)。运行边界(代码):并发 2/房、4 全局;30s 起流、30min 墙钟;maxTurns = agent.maxTurns ?? settings.chat.maxTurns ?? 100;执行证据机器采集(board 工具不算数,交付回执可能打「无执行记录」)。

### 3.4 旁路小调用

- **willingness 判定**:room 系统提示词瘦身版(judgement:true,无 board/tools/rules)+ 8 行 `名字: 内容` 窗口 + 「After that last message, will you speak up? Reply with JSON only: {"respond": true|false, "react": …}」;PM 额外 `<you_are_the_lead>`;在飞卡片以 `<your_cards>` 注入。thinking:false 强制、temp 0、64 token、8s,超时/解析失败=沉默。
- **编排器(planner/arbiter)**:独立 system(COLLAB_PLAN_SYSTEM,plan.ts:92-145)——「You are the coordinator of a group chat. You do not speak in the room yourself. Your only job: decide who speaks this round…」输出 `{"waves":[[…]],"cycle":…,"why":…}`;规范化代码强制(≤8 波、≤6 人/波、@ 强插首波);`why` 明确不给发言者看。失败降级为 N 路意愿判定。
- **日摘要**:「You compress one day of a group chat into a note…≤200 字…If the day holds nothing worth carrying forward, reply with exactly: (无)」。

---

## 4. 工具面

### 4.1 白名单规则(代码强制,collab/tool-surface.ts + agents/profile.ts)

- **一律并集(union),从不替换**:room/agent/dm → own ∪ {send_message, board, history};work → own ∪ {board, send_message}(**无 history**)。
- **无白名单 = null = 全量工具**。默认 agent 没有白名单 ⇒ 聊天回合与工作会话的工具面**完全相同**——模型无法从工具列表推断自己在哪种会话。
- `variable` 不在任何并集下限里 ⇒ 有白名单且未列 `variable` 的 agent 在所有协作回合丢它,但 roster 的 STATE_BOARD_FACT 照样宣称它存在(三重矛盾:段落被 builder 门控消失 / 事实句撒谎 / `<context-update>` 叫你 get 却 get 不了)。
- kind 映射:room→'collab-room',**agent→'collab-room'(刻意同群聊)**,work→'collab-work',单成员 dm→'collab-dm';2026-07-30 曾收紧为 replace,当日应用户要求撤销。
- 退役名 `say`/`dm` 只在 dispatch 层兜底(core tool-names.ts),模型永远看不到。
- 三个协作工具全部 autoExecute:true + permissionGuard:'safe',无权限门。
- 场地门在代码不在白名单:dm 通道与 history 都拒绝 kind ∉ {room, agent, work}。

### 4.2 send_message(tools/builtin/say.ts:130-145)

描述开头:「Send a message to the chat, or privately to one person. **Exactly like pressing send in a chat app**: only the text passed as "content" gets delivered. Nothing written anywhere else is visible to anyone.」+ 一次一条/markdown/@句柄/replyTo/暂停或超预算会失败;`to` 私聊(NOTHING is carried over / 用户可见 / **A private chat is for talking. Work that actually changes things goes back to the group as a board card**)/ `wake` 读后回群 @ 一声。
路由纯规则:显式 channel 优先;有 to→dm,无 to→room。房间执行器门序:空 content → 房存在 → 冻结 → 仍是成员 → 日预算;5 秒幂等窗。内容截断 4000 字;mentions 对活跃花名册白名单化(防冒名);replyTo 查不到就静默丢弃。
成功回执:room=「已发出(消息 id: …)。可以再发一条,或者就此打住。」;dm=「已发给 X;TA 不一定在线…不用等,先继续手头的事。」
拒绝文案(节选):「send_message 只能在群聊里(或群聊派生的工作会话里)使用…」「消息未送达:这个群聊已被暂停(总闸)…」「…今天的预算已经用完…」「你已经不在这个群聊的成员名单里了」;通道类:「to 是私聊的参数…」「要发给谁?…」「wake 是私聊的参数…」。

### 4.3 board(tools/builtin/board.ts:57-68)

列宽:backlog → todo → doing → review → done + blocked。动作:list(先读拿 rev)/ create(描述要完整到"无需再问就能执行";带 assignee=通知)/ **start**(「START WORKING on a task, right now, in your own work session (full tools, no turn limit)」;无 taskId 先建卡;只能 start 无主卡或自己的卡;也是中断续做入口)/ assign(「Assigning is a notification, not a launch」)/ move(review/blocked/done 移回 todo=真重跑)/ comment / **complete**(assignee 在工作会话里交付,「Call this exactly once, as your final action」)/ block(两次受阻停自动重试)。全部状态写带 expectedRev,过期拒绝。
reducer 拒绝文案:「Task is doing — only a todo/backlog card can be started」「…you cannot start someone else's card」「start requires an assignee…」「only the assignee completes it」等。
**start 成功回执只有「start ok: #id「标题」[doing] revN」+ digest——只字不提工作会话已派生**(派生是 task-started 事件在 worker.ts 的异步副作用)。
digest 以第一人称标注自己:「@你(小研)」(W10)。

### 4.4 history(tools/builtin/history.ts)

「Search the chat history of any room you are in…Scope is fixed by who you are…」;参数 q(纯子串,一两个关键词)/who/where/since/until/limit(≤30)/cursor(只向更旧翻页)。授权由数据推导(成员窗口),where 只能选不能扩;硬帽 10 房/8MB/300 字每行,一切截断显式声明。空态文案齐备(「你还没有加入任何房间…」「已经翻到最早的一条了…」等)。**work 会话的并集下限没有 history**——白名单 agent 在工作会话里查不了群历史。

### 4.5 variable(tools/builtin/variable.ts:274-280)

「Manage context variables - a named board of state that outlives this turn. Use this freely and proactively…state=true is the difference between "on the board" and "in front of you"…」四 scope(session/agent/project/global),五类型 + 集合增删。
注入两通道:① `<context-variables>` 常量段(仅当工具面含 variable);② `<context-update>` 尾块贴在每条 user 消息后(state=true 全值、state=false 仅名+描述;字节相等去重;workdir 不进)。
agent 自我状态变量(variables/providers/agent-self.ts):my_cards(「#id「标题」doing; …」,desc 第三人称提工作会话)、my_rooms、my_dms——**没有任何变量陈述「你现在在哪种会话」**。

---

## 5. 调度规则(全部代码强制)

- **意愿判定**:候选者逐个 8s/64token/thinking:false;>8 人只判 PM;自荐冷却=自己的发言在最近 2 条对话内则免判跳过;@ 点名与任务事件**绕过判定**直接入队。
- **链闸**:群默认连续 32 条 agent 消息(pair-DM 6;0=无限);唯一复位=真人发言(或跨房 wake poke);超限自荐丢弃、点名停靠并发一条「我先按住了」。
- **预算**:房间日预算默认 $5,按会话集合求和(房 + 工作会话 + 各成员执行会话);超限挡判定/编排/驱动,午夜+60s 重踢。
- **并发**:每房同时 6 回合(强制串行房=1),同一 agent 绝不并行发言;工作会话另计(2/房、4 全局)。
- **队列**:(agentId, reason, sourceMessageId, driveLabel) 去重;会话中新消息默认 steer 进所有在飞回合(10 分钟未消费则回退 engage);用户「停」类词表 → bump floorEpoch,过期记录出队即废。
- **编排(plan)**:仅 responseMode auto/serial;serial 本地合成免模型;auto 调 arbiter(12s/300token,失败降级意愿判定);波推进只在泵静默边界;续排仅在 exhausted 且有人真发过言之后。
- **任务事件链路**:task-assigned/requeued **只发系统行 + 激活聊天回合**;task-started(board start)才 spawnWork;work→chat 单向回流(进度以 task-event 激活房间),**没有任何调度路径自动把 agent 送进工作会话**。
- 转机后重建:driving/streaming→failed(防双计费);chainCount 从转录重算;未消费的最新用户消息重新决策。

---

## 6. 变量系统与协作会话的交互

- `<context-update>` 尾块对 room 驱动、work briefing、普通聊天一视同仁(core handleSendMessage 统一贴附);内容与会话类型无关。
- 协作回合特批保留 context-variables / context-update-convention 两段(P3 解禁:此前群房模型握着 variable 工具却看不到值)。
- **会话身份不在变量里**:grep 全 runtime,`你在` 只有 roster.ts:121 一处到达模型。若要让 agent 稳定知道自己在哪,变量通道(state=true,每回合全量重发、永不被压缩)其实是现成的载体——见 §8。

---

## 7. 嫌疑清单(按优先级)

| # | 嫌疑 | 位置 | 机理 |
|---|---|---|---|
| 1 | 写而未发的结构根因:聊天形状先验;措辞劝导已实证失效 | roster.ts:104-106 注释、turn.ts | 四层劝导在场真机照样复发;结构对抗(forced say / nudge / 驱动尾注)已全拆,常驻机制说明仅剩 desc 尾注一处 |
| 2 | work briefing 尾规则自相矛盾 | agent-rules.ts:92-108 + worker.ts:316 | recency 最强位写着「指派不是开工令,先问清楚」「重活先 board start」——在已经是工作会话的地方;照做=回群聊天或调必拒的 start |
| 3 | kind='agent' 执行会话=聊天面(设计如此) | system-prompt.ts:85-145 + roster.ts | 指派仅通知;不 board start 就永无工作会话;提示词主动推走工作 |
| 4 | work 系统提示词零工作身份 | system-prompt.ts:85-88、worker.ts:313-314 | 任务框架只在一条 user 消息;续做刻意不重述;压缩后丢光;persona 是群聊口吻 |
| 5 | DM「你的工具都能用」被注释 | roster.ts:245-246 | 托管私聊(替你干活的场)从未被告知工具可用 → 默认纯聊 |
| 6 | 场地陈述互相矛盾 | roster.ts:121 vs projection.ts:232-233 | system 说「你在聊天室中」,Notification desc 说「你在你自己的会话中」;聊天室版符合训练先验,胜出 |
| 7 | 零未读 drive 无任何机制文本 | turn.ts:1006,1032-1037 | 任务事件/接力激活最需要说明的回合,反而连 desc 尾注都没有 |
| 8 | 「no turn limit」承诺 vs maxTurns=100+30min 墙钟 | board.ts:61、agent-rules.ts:60/103、roster.ts:247 vs profile.ts:93、worker.ts:55 | 用户配小 maxTurns 时工作会话几轮即停,外观=「聊了两句啥也没干」 |
| 9 | board start 回执不提派生 | board.ts:164-171 | 调用者无从知道该停手,继续在群里叙事 |
| 10 | 白名单 agent 的 variable 三重矛盾 / work 无 history | tool-surface.ts:46-49 | 工作面自身不一致,侵蚀 workspace 描述可信度 |
| 11 | send_message 回执邀请收尾 | collab/say.ts:277 | 「可以再发一条,或者就此打住」在工作会话里=许可停止 |

**已排除**:briefing 不会被投影裁掉(message-helpers.ts:247 对 kind≠room 直通);drive token 不拦 work(ingress.ts:103-106);判定 thinking:false 只限意愿判定;空白名单在 store 归一化为不限制。

---

## 8. 下一步建议(未实施,供决策)

> **落地状态勘验(2026-08-03 核实)。** 本节标题的「未实施」写于 2026-08-02;此后建议 2 已完整落地,与之配套的「场地陈述统一」由**清空 desc** 兑现(与建议 1 的方向相反,见下)。逐条状态标在各条末尾。

**先诊断后开方**——写而未发已有现成计量:`turn.ts:1279-1294` 把完成回合里 ≥40 字未发正文记为 kind='unsent' 的 schedule note(inspector 可见)。把这些记录按 **drive 类型(是否零未读/任务事件/接力波)× 模型 × thinking 是否开启** 交叉,能直接裁决主通路在哪:

1. **补零未读 drive 的机制说明**(最小改动、可单测):任务事件/接力波的 drive 目前一个字的机制文本都没有(§0.3);若 unsent 集中在这类回合,把 desc(或专用一句)补到 `emitWhenEmpty` 路径即可见效。
   - ⚠️ **未按本条实施,代码走了相反方向(2026-08-03 核实)**:`desc` 不但没补到 `emitWhenEmpty` 路径,反而被**整体清空**——`collab/projection.ts:232-233` 现为 `export const COLLAB_NOTIFICATION_DESC = ''`(属性本身仍逐块输出,见 `:269` 的 ` desc="…"`,值是空串)。于是「零未读 drive 一个字机制文本都没有」这条现状扩大成了「**所有** drive 都没有机制尾注」,机制说明整体收敛到 system prompt 的 `<where_you_are>` 一处(即建议 2)。§0.2/§0.3、§3.1、§7 第 6/7 条里引用 desc 原文的段落**均已过时**,以此为准。
2. **兑现工位隐喻**:`buildWhereYouAre` 真正用上 place/audience,把「你在一个聊天室中」换成工位事实(你在自己的会话/工位,带房名;写在这里的不会自动发出;`send_message` 是发送按钮;你的全部工具照常可用),并与 desc 措辞统一(现在两处对「我在哪」答案相反)。注意:措辞单独起效概率有限——四层劝导在场时真机已复发过——作为 1/3 的配套。
   - ✅ **已实施(2026-08-03 核实)**:`collab/roster.ts:116-129`,`buildWhereYouAre(options: { place: string; audience: string })` 两个参数都真正进了输出——「You are at your own desk, working as yourself. What happens in ${place} is delivered to you here, like notifications.」/「This desk is not a chat input box. Text written here stays here: what you write is a note to yourself…」/「\`send_message\` is the send button that carries words to ${audience} — there is no other send button, and nothing sends on its own.」文件头注释(`:101-115`)记着「隐喻决定行为」的裁决,并注明这段是**全篇唯一**一次陈述该机制(通用规则块、驱动尾注、say 描述三份重复已删)。
   - ✅ **场地陈述统一——已实施(2026-08-03 核实)**:§7 第 6 条记录的矛盾(system 说「你在一个聊天室中」vs `Notification desc` 说「你在你自己的会话中」)已消失,但收敛方向与本条设想的相反——**不是把 desc 措辞对齐 system,而是把 desc 清空**(`projection.ts:232-233`),同时 system 侧那句「你在一个聊天室中」被工位事实取代。现在只有一处在回答「我在哪」,矛盾在结构上消失。
   - ⚠️ 本条注释里那句「你的全部工具照常可用」**没有**写进最终输出;`roster.ts:120-125` 的注释解释了取舍:措辞层劝导已被真机实证只降频不归零,服从率交给结构保证(收养式兜底,`app/collab/turn.ts`),这段「只负责把图画对」。
3. **轻结构回补——事实回声,不是 nudge**:harvest 检出未发正文后,下一次 drive 带一行事实「你上一轮写了 N 字正文,没有人看到」。不指挥补发(避免旧 nudge 的重复发言根因),只让模型在上下文内亲眼看到机制,自行纠正。
   - ✅ **收养事实回声已实施(C1, `f2d699dc`)**:执行会话 meta 记 `adoptedEchoMessageId`/`adoptedEchoAt`(`app/collab/agent-session.ts` 的 `noteCollabAdoptedEcho` / `takeCollabAdoptedEcho`,随取随清),下一轮 drive **最末尾**追加 `<adopted_echo>` 块(`collab/projection.ts` 的 `formatCollabAdoptedEcho`)。**措辞与本条设想不同**:本条写的是「没有人看到」,而实际口径是「已代发进群,那些字已经在那儿了,署你的名」——因为 `turn.ts` 的收养式兜底本来就把零 say 回合的收尾正文代发了出去,说「没有人看到」是失实。仍然**不指挥补发**(本条的核心纪律保留),只陈述那段话的下落;配套地 `collab/roster.ts` 撤回了「nothing sends on its own」的绝对化陈述(收养发生时那是假话)。真机走查见 `collab-consolidation-walkthrough-2026-08-03.md` W11(要看的行为是**下一轮不重复发一遍**)。
4. **确认真实回合的 thinking**:drive/work 只在 agent.model.thinking 显式配置时携带 thinking;推理模型不带 thinking 跑,机制服从明显更差,值得对照实验。
5. **工作会话侧(平行修复)**:work 版 `buildCollabWorkRules` 删掉自相矛盾两条(「指派不是开工令」「重活先 board start」),改为「你已在这张卡的工作会话里——直接开工;完成 complete,受阻 block」;work 系统提示词补工作身份(hooks 或 state=true 变量,每回合可见不怕压缩);恢复 DM 被注释的「Everything you normally have works here」行;「no turn limit」措辞对齐现实;board start 回执补一句「工作会话已在后台开启」。
