# 回合框架重构(收件箱/发送)与身份修复

日期:2026-08-02(v2,依用户裁决重写 A 节:否决强制 say/pass 终止协议,
改为框架与命名重构;强制协议降级为数据门控的最后手段)
状态:**已实施**(原状态行为「设计,未实施」,2026-08-03 逐条核实后改写)
前情:`docs/design/collab-room-clear-and-mention-all.md`(已实施)、四轮审查、
`collab-agent-view-v3.md` §6 决定 2(未实施)。

> **实施勘验(2026-08-03)。** A 节重构三件套 + C 节链闸解锁均已在代码中落地:
>
> 1. **① 工具改名 `say` → `send_message`**:`packages/onething-runtime/src/collab/say.ts:288`
>    `export const COLLAB_SEND_MESSAGE_TOOL_NAME = 'send_message'`;旧名按 A.3 保留为
>    **静默别名** `COLLAB_SEND_MESSAGE_LEGACY_TOOL_NAME = 'say'`(同文件 `:298`),别名注册在
>    `packages/onething-runtime/src/app/collab/say-tool.ts:352-357`
>    (`registerCollabSendMessageLegacyAlias()`,`dm` 退役名并排),**刻意不进**
>    `COLLAB_ROOM_TOOLS`(`collab/tool-surface.ts`,注释逐字解释「进来就等于进请求的
>    tools 参数,模型会看见两个同义工具」)。工具定义体在
>    `packages/onething-runtime/src/tools/builtin/say.ts:151`;打字观察器与断路器已改按新名认信号
>    (`collab/typing.ts:124`、`collab/circuit-breaker.ts:200`)。
> 2. **② `<turn>` 块整个删除**:`packages/onething-runtime/src/app/collab/turn.ts:1021-1037`
>    原地留了一段墓碑注释(「这里曾有一个 `<turn agent=… reason=…>` 尾注块 … 2026-08-02
>    整块删除」),drive 现在只有 `roomContext + <elsewhere>`,零未读时出自闭合
>    `count="0"` 块兜底 drive 非空。
> 3. **③ 情况说明换工位隐喻**:`packages/onething-runtime/src/collab/roster.ts:116-129`
>    的 `buildWhereYouAre({ place, audience })` —— "You are at your own desk…delivered to you
>    here, like notifications" / "This desk is not a chat input box" / "`send_message` is the
>    send button"。文件头注释(`:101-115`)记着「隐喻决定行为」的裁决与四层劝导裁撤。
>
> **两处与本文不符,以代码为准:**
>
> - **块名不是 `<NewMessages>` 而是 `<Notification>`**:`packages/onething-runtime/src/collab/projection.ts:219`
>   `COLLAB_NOTIFICATION_TAG = 'Notification'`,渲染函数是 `formatCollabNotificationBlock`
>   (`:246`)。A.2 ② 里的 `<NewMessages count=… seen_until=… scheduled=…>` 样例请按
>   `<Notification …>` 读;属性名 `count` / `seen_until` / `scheduled` 与本文一致,另有
>   `elided` 与 `desc`。
> - **块上多了一个 `desc` 属性,但当前值是空串**:`projection.ts:232-233`
>   `COLLAB_NOTIFICATION_DESC = ''`(属性本身仍逐块输出,见 `:269`)。它是 08-02 之后
>   加回来的一句固定机制说明,后又被清空——即 A.2 ② 的「没有任何指令性尾注」在
>   当前代码里是**通过清空取值**而不是删除属性来兑现的。

## 0. 要根治的三个真机症状

| # | 症状(全部 2026-08-02 真机实锤) | 根因 |
| - | --- | --- |
| S1 | **写而未发顽固复发**:四层提示词在场,Nova 仍以 turn text 收尾;长文型成员高发 | **隐喻与机制打架**(见 A.1) |
| S2 | **幽灵成员**:Nova 把 `songyitian` 与「用户」数成两个人 | 花名册悬空(`rosterInPayload: true` 指向 v3 V2 已删除的载荷) |
| S3 | **狼人杀夜间流程卡死**:pair 私聊房链闸冻结后无人能解 | 解冻真源=人类消息,而 agent⇄agent 房没有人类 |

---

## A. 回合框架重构:从「轮到发言」到「收件箱 + 发送」(S1)

### A.1 诊断(2026-08-02 用户裁决):主锅是 `<turn>` 块的舞台框架

现行文本自己在制造这个失败:

```
<turn agent="Nova" reason="轮到发言">
The coordinator scheduled you this round — the room is waiting on you.
Your turn. Nothing here reaches the room on its own — `say` is what sends. …
</turn>
```

「Your turn / the room is waiting on you / 轮到**发言**」是**舞台框架**:把模型
请上台、告诉它听众在等 —— 模型读完这段,接下来写的 content 在它的心智模型里
**就是它的发言**。同时工具叫 `say`(言说动作),又强化"我的声音=say"。然后
我们再用四层提示词劝它"你的发言其实不算发言" —— 隐喻说 A,机制要 B,模型
跟着隐喻走。这解释了为什么劝导全部失效:错的不是模型的服从性,是我们的框架。

反证也对得上:模型在海量 bot/agent 训练数据里见过的正是 `send_message` 式
API —— "要让消息出现在聊天里就调 send"是它熟练的既有行为。框架对了,训练
习惯为我们工作;框架错了,训练习惯和我们对抗。

### A.2 重构三件套

**① 工具改名:`say` → `send_message`,定位从"说话"改成"发送消息的应用操作"。**

```
send_message — Send a message to the chat.
Exactly like pressing send in a chat app: only the text passed as "content"
gets delivered. Nothing written anywhere else is visible to anyone.
- One call = one message bubble; send a few short messages the way people do.
- markdown in "content" renders fine (lists, tables, code).
- @名字#句柄 addresses someone (handle from the roster); replyTo quotes a message.
- If the room is paused or out of budget the send FAILS and tells you so.
```

参数不变(content/mentions/replyTo/room),回执文案「已发出(消息 id: …)」
天然契合(顺带修掉私聊里"已发进群里"的错配)。

**② `<turn>` 块整个删除:drive 只是数据(2026-08-02 用户裁决第二刀)。**

真实的聊天应用推送消息,不会在每条通知后附一张使用说明卡。drive 从此只有:

```
<NewMessages count="5" seen_until="…" scheduled="coordinator">
<say from="…" rel="…">…</say>
…
</NewMessages>

<elsewhere>…(有才出现)</elsewhere>
```

**没有任何指令性尾注。** 机制("这里是私人工位、发消息用 send_message")在
system prompt 说一次;每回合重复它是念经,且占着 recency 最强的位置 ——
一旦措辞有偏(「Your turn / the room is waiting」已被真机证明有偏),伤害
被放大到每一轮。删掉指令块,这个风险点结构性消失。

原 `<turn>` 块的三项职能各归其位:

| 原职能 | 去处 |
| --- | --- |
| "say 才送达"机制说明 | system prompt(`<where_you_are>`,一次) |
| 激活理由(被 @ / 点将 / 任务事件) | **数据属性**:`<NewMessages scheduled="coordinator">` / rel 标签已有的 mentions-you;不再是一句对模型的话 |
| 保证 drive 非空(零未读的点将回合) | `<NewMessages count="0" seen_until="…" scheduled="coordinator"/>` 自闭合 —— "你被点到了但没有新消息"同样是数据 |

已核对的无依赖:转录/投影按 `source` 识别 drive 消息,不认 `<turn>` 文本;
`turn-log.ts` 的 `<turn>` 是**输出**格式(历史视图渲染),与 drive 入参无关。

**③ 情况说明全面换隐喻:工位与推送,不是后台会话与发言权。**

`<where_you_are>` 重写(要点):

```
You are at your own desk, in a private workspace. The chat 「cumo」 runs
elsewhere; its new messages are delivered to you here, like notifications.
This workspace is not a chat input box: prose you write here is a note to
yourself, and no one else ever reads it.
The one way to put a message in the chat is `send_message` — there is no
other send button, and nothing sends on its own.
(persistent-history / several-places-at-once 两段保留,措辞随隐喻微调)
```

`<speaking>` 段更名 `<messaging>`;全部 speak/speaking/silence 词汇换成
send/reply/不回复("Not sending anything is fine — with nothing to reply to,
reply to nothing.")。「turn text」这个自造术语随之**退役**:新框架下它就叫
"你工位上的笔记",不需要专门的行话去解释一个反直觉的机制。`<rules>` 收尾
检查、`<speaking>` 负例、say 描述负例这**四层劝导文本整体裁撤**,由框架一致
性替代 —— 一致性审计指出的"念经"问题连根解决。

### A.3 改名的工程面

- 工具 id `say` → `send_message`:注册表、`COLLAB_SAY_TOOL_NAME`(typing
  观察器按工具名认打字信号)、tool-surface union、worker 简报文案、全部测试;
- **持久化不动**:消息 source `'collab-say'` 是落盘约定,保持原值(执行器写
  source,与工具名解耦);历史转录零迁移;
- **旧名静默别名**:执行会话历史里满是 `say` 调用范例,模型会模仿 —— `say`
  保留为指向同一执行器的隐藏别名(不进工具列表、不进提示词),模仿旧历史的
  调用照常送达,不产生"unknown tool"教育成本;别名进新框架灰度期,稳定后拆;
- 状态条/渲染:SayMessageRow 等 UI 认 source,不认工具名,零改动。

### A.3bis 一个要测的开放风险

删掉"你被点到了"这句**话**之后,未被 @ 的编排点将回合只剩 `scheduled`
**属性**当信号 —— 模型对属性的响应弱于对指令的响应,点将回合的沉默率可能
回升。对策仍是度量先行:unsent/silent 按激活理由分桶统计(状态条数据已够),
若 relay 桶的沉默显著高于 mention 桶,再考虑把 scheduled 升格为一行**事实**
(非指令):"The coordinator picked you for this round." —— 一句陈述,
不带任何"该做什么"。升格与否由数据决定,不预设。

### A.4 验证与升级路径(数据说话,不预设强制)

`unsent` 度量(已上线:「写了话但没发送」)就是这次重构的实验读数:

1. 框架重构上线 → 清一间房做干净基线 → 观察 unsent 频率;
2. 若仍有残余:A.6 带门单次补救(仅 complete+零发送+实质正文时追加一轮,
   工具面只留 send_message,附言"上一轮的内容没有发送");
3. **强制终止协议(required + 终止工具)只有在 1、2 的数据都不达标时才重新
   上桌** —— 用户已否决其作为首选;届时它的评审基线是本方案的实测残余率。

### A.5 风险

| 风险 | 对策 |
| --- | --- |
| 旧会话历史里的 say 范例带偏新回合 | 静默别名接住(A.3);建议配合危险区清空拿干净基线 |
| send_message 语义在私聊房(「chat」非「room」)的措辞 | 描述用 "the chat" 中性词,不说 room(顺带修 P2-8) |
| 改名波及面大(测试/文案) | 一次机械替换 + 全量测试;source 解耦使风险集中在进程内符号 |

---

## B. 花名册与身份修复(S2,即 v3 §6 决定 2 的实施)

(与 v1 不变)

1. `app/engine/prompt/system-prompt.ts:133`:`rosterInPayload: true → false`
   —— 成员列表与用户行已在调用点手边,零新数据搬运;
2. `roster.ts` 配套:`buildRelayLine` false 分支改 drive 信封形态措辞;
   `buildViewLines` 从开关上拆下(视野说明是 drive 属性,常开);
   「`<History>` is what you have already read」改 drive 形态;
3. 工具描述里 "roster" 指称随花名册回归自动恢复为真;
4. `turn.ts:1004` 过时注释(「V1 特判还在」)清除。

时效:system prompt 每次 drive 现建,改名/进出房下一回合生效。
归属:v3 线欠账,实施前确认该 session 不再活跃于相关文件。

---

## C. pair 私聊房链闸解锁(S3)

**状态:已实施(2026-08-03 核实)。**

(与 v1 不变)跨房 dm 注入 = 外部输入 → 重置该 pair 房链长;房内乒乓照旧
被 6 条闸拦;冻结文案改实话(「连续对话到上限,有新话题进来会继续」)。
多人临时 DM 群(狼群互认)是新形态,本方案不设计,记账。

> **实施勘验(2026-08-03)。** 落在 `packages/onething-runtime/src/app/collab/dm-tool.ts:207-222`:
> 消息经 `speakIntoCollabRoom` 真正落库成功之后(拒绝路径原样透传、不清零),取该 pair 房的
> runtime 执行 `runtime.state.chainCount = 0` + `runtime.chainNoticePosted = false` +
> `persistRoomState(...)`。注释逐字写明本文 C 的论证:「链闸解冻此前**只**认一条人类消息
> (queue.ts 的 ingress 那一处),而 agent ⇄ agent 的房里没有人类」,以及边界——房内回合的
> 乒乓走 `turn.ts` 的级联、不经这条路,6 条闸照拦。清零之后紧接 `enqueue(...)` 激活对方(D5)。
> 注:这条路径现由合并后的 `send_message`(带 `to` 参数)驱动,不再是独立的 `dm` 工具面,
> 见 `docs/design/collab-send-channel-and-wake.md`。

---

## D. 文案 P1 批(一致性审计遗留;部分被 A 吸收)

- 判定调用薄版情况说明(裁 `<your_tools>`/STATE_BOARD_FACT/`<board>`);
  判定按房形态转发 dm/dmPair;
- ~~say 回执分版~~(被 A.2 ① 吸收:「已发出」);
- 群版「重活」口径统一;
- ~~`<turn>` footer 地名~~(被 A.2 ② 吸收);
- plan.ts 花名册来源措辞。

---

## 分期总览

| 期 | 内容 | 依赖 | 量 |
| -- | ---- | ---- | -- |
| P0-a | B 花名册修复(幽灵成员止血,也是 A 的语境基础) | 确认 v3 线状态 | 0.5-1 天 |
| P0-b | A 框架重构(改名+别名+inbox 块+情况说明重写+劝导文本裁撤+测试) | B 先行为佳 | 1-1.5 天 |
| P1 | C dm 链闸解锁 | — | 0.5 天 |
| P1 | D 剩余文案批 | B | 0.5 天 |
| 观察 | unsent 基线对比;不达标 → A.6 补救 → (数据门控)重议强制协议 | A | — |

次序:**B → A → C → D**。全部落地后:模型面没有「turn text」这个行话、没有
四层劝导、没有舞台隐喻 —— 只有一个熟悉的东西:带收件箱和发送按钮的聊天应用。
