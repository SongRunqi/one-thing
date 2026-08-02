# 房回合就是一条普通会话（v3）

状态：**设计已定，未实施**
日期：2026-08-01 起草（追加式收件箱）/ 2026-08-02 **重写定案**（普通会话 + drive 带未读）
前置：`collab-agent-view.md`（P0–P4：游标 / 折叠 / 摘要 / room_history）、
`collab-agent-view-p5.md`（三家同源 + 行动流水 + 三处提示词事实 —— 本篇是它的根治版）、
`collab-team-v2.md` §1.1（一房一 agent 一条常驻会话）、
`collab-chatroom-payload.md`（要被拆掉的那个载荷）。

> **2026-08-02 的重写说明**：初稿是"追加式收件箱"——房消息落库时 fan-out 抄进每位成员的
> 会话文件。那个方案能成，但把"模型读到什么"和"磁盘上存什么"绑死了，因此背上存储 ×N、
> 写放大、历史冻结三笔账。定案的方案更简单：**房消息跟着 drive 写进来一次，执行会话
> 就是一条普通会话**。三笔账全部消失，`compact 怎么做` 这个未决也一并消解——它变成
> 每条普通会话都在用的那个 compaction，没有 collab 专有的东西要发明。

---

## 1. 病根

2026-08-01 真机，cumo 房。用户让 Iris 当上帝玩狼人杀，它用 `dm` 给四人私发身份牌，
群里只说「身份已发」。十四分钟后用户说「继续，喊天黑」：

```
18:04:55  Iris  「好！身份牌不变，还是上一轮 dm 发的那副…🌙 天黑请闭眼」   ← 硬撑
18:06:26  Iris  「身份牌我 dm 发出去了…但我没有把分配记录保存下来 😅」    ← 承认
```

那一轮的**完整模型输入**（`evals/traces/…/a86d3057-…/round-1.json`）：

```
roles: [system, user]        ← 一共两条消息
system: 4,877 字
user:  70,018 字  = 整间房的全量投影 + <turn> drive
```

牌没丢——四条 dm 都在各自的私聊房里躺着。丢的是**它知道自己发过牌这件事**。

根因是一段特判，`app/engine/stream/message-helpers.ts:258`：

```ts
if (session?.kind === "agent") {                      // 执行会话
  const projected = projectRoomMessagesForModel(room.messages, …)  // ① 整间房重投影
  const drive = latestCollabDriveMessage(messages)                 // ② 自己的历史整份丢弃
  return mergeProjectedChatRows([...projected, { ...drive }])      //    只捞最后一条 drive
}
```

它造出一个**能行动却看不见自己行动史**的 agent：自己**说过**的每句话逐字都在（W14b），
自己**做过**的任何一件事都不在。这个不对称是幻觉的温床，而且幻觉形状可预测——
模型必然把「我说过我发了牌」当成「我知道牌是什么」。

P5 是止血（行动流水给凭据、三处提示词把"我会忘"这个事实告诉它），不是根治。

---

## 2. 方案

**删掉那段特判，让执行会话落到 `return messages`——和普通聊天会话走同一条路。**

于是唯一要回答的问题变成：房间的新消息怎么进到这条会话里？

**答案：写进 drive。** drive 本来就是一条真实的 user 消息（协调器写、落盘、位于上下文
末尾），现在让它同时携带「自上次以来房里的新消息」。

```
system:     人设 + 情况说明 + 规则
user:       <msg from="songyitian#666666">继续，喊天黑</msg>
            <turn reason="被 @ 激活"/>              ← 一条真实消息，写一次
assistant:  「好，先记下来」+ tool_call variable / dm×4 / say
tool:       Variable set / 已发给 Bram / …
user:       <msg from="Nova">收到</msg>
            <msg from="Bram">收到</msg>
            <turn reason="被 @ 激活"/>
assistant:  「四人齐了，天黑请闭眼」…
```

这条路**已经跑过**：steer（中途来消息）就是把房里的话直接注进执行会话的，
08-01 18:04 那条就是实物。形态可行，不是推演。

### 三条推论

1. **投影的产物从"每轮重算的临时快照"变成"写一次的一条真实消息"**。
   渲染完全复用现成的：`planCollabHistoryWindow` 算未读、`<msg from>` 信封渲染。
   变的只是产物写去哪。
2. **下游全是普通会话的路**：`buildHistoryMessages`、工具结果预算、compaction、
   provider 适配，一律不需要为 collab 开分支。
3. **`compact 怎么做` 这个未决消解了**。它就是每条普通会话都在用的那个
   （`core/engine/context-compact.ts`），没有房级摘要要重新挂载、没有新机制要发明。

### 首轮铺底

一个 agent 在某间房的**第一条 drive** 要带上已有的房间历史（否则它没有任何上下文）。
之后每次只带增量。存量房与新房走同一条路径，没有数据迁移、没有回填脚本。

---

## 3. 隔离保持，以及它留下的三个缺口

一个 agent 有 N 条执行会话（群房一条、和每个人的私聊各一条）。**它们仍然彼此隔离**。

### 为什么不合成一条"统一意识流"

- **泄密**。私聊内容与群聊内容混在同一段历史里，模型随时可能把私聊的话 `say` 进群。
  狼人杀里这是致命的：上帝的身份表和群发言在同一个上下文里，一次措辞失误就明牌。
- 违反 `collab-team-v2 §1.1` 的「一房一 agent 一条常驻会话」，那条隔离本就为此而立。
- 成本按房数叠加。

### 隔离的代价：三个缺口

| | 缺什么 | 谁的视角 | 定案做法 |
| --- | --- | --- | --- |
| ② | **我在别的房做过什么** | 发送方（Iris 在 cumo 里不记得自己私发过牌） | `turn-log` **收窄**成跨房版 |
| ③ | **别人在私聊里找过我** | 接收方（Bram 在 cumo 里不知道有未读私聊） | `<unread_dms>` push |
| ④ | 上面两条的**内容** | 双方 | 给 `dm` 加读能力（pull） |

**② 的本质**不是"读不到别人的私聊"，是"读不到自己在别处做过的事"。人在两个窗口之间
会记得自己，隔离的 agent 不会。

**这里修正 P5 文档的一条**：那边写着"v3 落地后 `turn-log.ts` 退役"。**说错了一半。**
行动流水现在扫的是本会话历史，本房那一维确实由真实历史承担了，该退；但**跨房那一维
本方案没有覆盖**。所以它不退役，而是收窄——从"补丁"变成"一个真实维度的唯一表达"：

```xml
<your_recent_turns_elsewhere>
  <turn at="17:52" room="Iris ⇄ Bram"><dm to="Bram#0739d3ab"/></turn>
  <turn at="17:52" room="Iris ⇄ Nova"><dm to="Nova#63ac3aff"/></turn>
</your_recent_turns_elsewhere>
```

本房的事由真实历史说，别处的事由它说，两者不重叠。仍然**只给凭据不给内容**，不泄密。

**③ 必须是 push，不能只给 pull**。狼人杀现场两次证明模型不会主动查：Atlas / Nova /
Bram 三个人被问到脸上还是答"没收到"，而牌就躺在他们各自的私聊房里。

```xml
<unread_dms from="Iris#eba0c4b7" count="1" at="17:52"/>
```

**④ 内容仍归 pull**：`dm` 加一个读的动作，规则整套照抄 `room_history`——房作用域从会话
推（不接受参数）、结果有上限、keyset 游标、空结果三态、输出复用 `<msg from>` 信封。

---

## 4. 分期

| 期 | 内容 | 量 | 可独立验收 |
| --- | --- | --- | --- |
| **V1 ✅** | **drive 带未读**：`driveActivation` 写 drive 时把未读房消息拼进去（渲染复用 `planCollabHistoryWindow` + `<msg from>`）；首轮铺底 | 1 天 | 是——特判还在，行为不变，只是 drive 变长了，可以直接去磁盘看那条消息对不对 |
| **V2 ✅** | **删特判**：`message-helpers.ts:258` 那段连同 `mergeProjectedChatRows` 那次调用一起删；执行会话落到 `return messages` | 半天 | 是——模型这时才改读自己的历史 |
| **V3 ⚠️→V4'** | `turn-log` 收窄成跨房版（缺口 ②）——**形状写错了，被 V4' 重做** | 半天 | 是 |
| **V4' ✅** | **`<elsewhere>` 事件块**：合并缺口 ②③，事件不是状态 | 1 天 | 是 |
| ~~V5~~ | **不做**。改成 `room_history` 的房级开关（默认关），单独立项 | — | — |
| **V6 ✅** | **拆脚手架**：`<where_you_are>` 那半句已删（`#turn-drive` 随 V2 一起没了） | 半天 | — |

**V1 与 V2 必须分开**，理由只有一条：出问题要分得清是**写得不对**还是**读得不对**。
捆进一个 commit 就分不清了。

**V1 之后房间行为一个字不变**——drive 里已经有房间内容，但模型读的还是老投影。
这是这条路上唯一一个零风险的观察点，别跳过。

### V1 落地记录（2026-08-02）

渲染没有新写一份：把 `projectRoomHistory` 的**走一遍**与**载荷组装**拆开
（`walkCollabRoomProjection` / `collectCollabProjectedLines`），载荷与 drive 共用同一份行。
两份渲染迟早分家，而分家的形态就是 P5 §2 那五个缺口。

真机数据（cumo 房，08-01 18:06 那一刻）：

```
首轮铺底   23,326 字符   一次性，含 <Folded count="198"/> + 整段可见历史
增量        1,850 字符   15 条未读，带 rel="mentions-you|quotes-you|bystander"
```

对比现在**每一轮**都要重发的 19,010 字符全量投影——V2 落地后，稳态每轮只剩增量那一段。

一处顺带修的测试债：drive 现在要渲染用户署名（`<msg from="songyitian#666666">`），
于是新依赖了 `store.getSettings()`。22 个 collab 测试的 store mock 缺这个导出，
一并补上了——**不是产品 bug，是夹具没跟上新依赖**。

### V2 落地记录（2026-08-02）

删掉 101 行特判，连带四样立刻变成死代码的东西一起清了：`mergeProjectedChatRows`、
`latestCollabDriveMessage`、以及 `buildCollabTurnLog` / `planCollabHistoryWindow`
两个 import。**`#turn-drive` 那个不可命中的 id 随特判一起消失**——它本来排在 V6，
因为它活在被删的那段里，提前兑现了。

`room-projection.test.ts` 的 `execution session (W18)` 那一组按预告整体重写（7 → 4 例），
守的契约正好反过来：执行会话**原样透传**、房间内容由 drive 携带、与同内容的 chat 会话
**逐字同解**、compaction 锚点正常命中自己的历史。

**成本曲线变了，要认下来**：从前每回合固定 19,010 字符（重投影，不随时间涨）；
现在是"首轮 23,326 + 每轮增量"的累积式，靠 compaction 收口。稳态更省，但**峰值由
compaction 阈值决定而不再由折叠决定**——这正是把压缩交还给普通会话的代价与好处。

**turn-log 暂时缺席**：它原本注入在被删的那段里。本房那一维已由真实历史承担，
跨房那一维要等 V3 把它以跨房版注入 drive。这中间的窗口是刻意的（V1/V2 只做一件事）。

### V3 + V6 落地记录（2026-08-02）

**V3**：`turn-log` 收窄成 `buildCollabCrossRoomTurnLog`，标签改成
`<your_recent_turns_elsewhere>`，每个回合多一个 `room` 属性——少了它，
「我 dm 过 Bram」与「我在和 Bram 的私聊里 dm 过他」读起来一样，而这两句在
狼人杀里差着一整局。多间房的回合**按时间归并成一条时间线**，不按房分组：
模型要判断的是"我最近都干了什么"，不是一张按房间分组的报表。

app 侧只扫元数据（`getSessionsList`，不含 messages），按 `updatedAt` 取最近 5 间
再加载转录——一个 agent 可能挂着十几间房，每条 drive 全量加载是白花的钱。

真机（Iris 的四间私聊执行会话）：**539 字符**，五个回合归并成一条时间线。
而且两个维度确实不重叠——发牌那四次 `dm` 是从 **cumo 回合**发的，V2 之后它们在
cumo 那条会话的真实历史里（带完整参数）；这里列的是 Iris **在私聊房内**做的事。

### V4' 落地记录（2026-08-02）—— 兼 V3 的更正

**先记一条纪律，它是这一期的全部根据：**

> **进 drive 的块只能是「事件」，不能是「状态」。**
> `emitDrive` 走 `command:send-message` ⇒ drive 是一条**真实落盘的消息**；V2 之后模型
> 读整条执行会话历史 ⇒ **写进 drive 的东西会永久留在上下文里，写几次就有几份**。

V3 初版把跨房块写成了**滚动快照**（每条 drive 重发「我最近的 5 个回合」）。实测代价
（Iris 在 cumo，47 条 drive）：

```
同一个事件最多被写入 23 次 · 平均 9.3 份副本 · 转录里累积 17,270 字符（占末轮上下文 12.1%）
```

而这恰好是 `turn-log.ts` **自己反对过**的形状（"三组一模一样的 `dm ×4` 并排"）。
V1 的房间内容写成了增量（正确），V3 写成了快照（错误）——同一条纪律，一个通过一个没通过。

**改成事件之后（同一份真实数据）：**

| | 改前 | 改后 |
| --- | --- | --- |
| 转录里累积的块 | 17,270 字符 | **1,763**（Bram 样本） |
| 同一事件副本 | 最多 23 份 | **恒 1 份**（真机全量核对） |
| 输出块的 drive 占比 | 100% | **19%**（其余整块不输出） |
| 能看见的房（Bram） | 4 | **5** |
| Bram 可见的私信事件 | 0 | **13** |

**五处改动**

1. **滚动快照 → 增量**。窗口 =（上一条 drive，现在]。**不新增游标**——上一条 drive 的
   时刻本来就在历史里。附带一条免费的正确性：某轮 abort、模型没读到那份事件块，
   它仍落在历史里，下一轮照样读得到。
2. **枚举源：执行会话 → 房成员**。执行会话只在那间房第一次被驱动时才建
   （`ensureCollabAgentSession`，唯一非测试调用点在 `turn.ts`），所以"从没被驱动过的房"
   整间不可见——实测漏掉的正是**用户和这位同事的私聊**。元数据先按 `updatedAt` 筛，
   窗口内没动静的房连 load 都省。
3. **沉默回合也是事件**（`<turn … silent="yes"/>`）。初版无工具调用就整轮消失，
   而「我被拉进那间房、看完没说话」正是收件人用来说"我看过了"的那条事实。
4. **新增 `<got>`**（缺口 ③ 的正确形态）。同一人同一房在一个窗口里连发 → 合成一行带
   `count`（信封时间到分钟为止，不合并会出现两三条一模一样的行，真机实测 ×3）。
   `count` 是**事件计数**不是待办数：块带 `since`，说的是"这个窗口里来了 3 条"，
   一个过去窗口的计数永远不会过期——与被否决的 `unread="3"`（状态，会变、会成为一条
   格式正确的谎话）是两回事。
5. **认知边界那句事实**进 `<where_you_are>`（零边际成本，进前缀缓存）：
   > You are in several places at once — each with its own separate conversation.
   > This one shows you only what happened here; what you did or received elsewhere
   > is not in front of you unless something told you about it.

   事故的病根不是 Bram 缺信息，是它**断言**「没收到」——系统给了它一个房间形状的世界，
   它就照着整个世界作了报告。这句话把「没收到」变成「我这间房里没有，可能在私聊里」。

**事故复现**（Bram 17:55 那个 cumo 回合，280 字符）：

```xml
<elsewhere since="2026-08-01 17:51">
<got room="Bram ⇄ Iris" at="2026-08-01 17:52" from="Iris#eba0c4b7"/>   ← 牌就是这条
<got room="Bram ⇄ Nova" at="2026-08-01 17:54" from="Nova#63ac3aff"/>
<turn room="Bram ⇄ Nova" at="2026-08-01 17:54"><dm to="Iris"/><say count="1"/></turn>
</elsewhere>
```

当时它什么都看不到，于是答了"没收到"。

**V5 判决：不做。** 跨房 pull 就是被否决过的「合房」，只是改成按需；而模型不主动 pull
（两次真机实证），期望值是"99% 的回合躺着不动，1% 的回合把牌拉进群"。替代方案是把
`room_history` 的房作用域做成**房级开关、默认关**——让隔离的放松成为一次显式的产品
决定，而不是实施表格里的一行。单独立项。

**V6**：`<where_you_are>` 里那半句 "and is not read back to you" 已删——V2 之后它是
**假话**，而提示词里一句假话比没有这句话更坏（模型会据此以为必须把什么都塞进
状态板）。同期删掉 "Each turn is built fresh from …: recent days in full, older days
folded behind a one-line summary"（那描述的是已经不存在的快照），换成：

> This session is your own continuous history: it is all still here next turn.
> New messages from {place} arrive with each turn, and when the history grows long
> its older part is replaced by a summary.

`STATE_BOARD_FACT` 也跟着改：它不再是"唯一能原样跨过一个回合的东西"（整条历史
都留着了），改成那条**仍然为真**的区别——历史长了会被摘要压掉，而状态板每一轮
整份重发。`#turn-drive` 那个 id hack 随 V2 一起消失，V6 无需再动。

---

## 5. 退役清单

| 退役 | 期 | 理由 |
| --- | --- | --- |
| `kind === 'agent'` 特判（约 60 行） | V2 | 病根本身 |
| `<where_you_are>` 的 "…and is not read back to you" | V6 | **不再为真**。提示词里一句假话比没有这句话更坏——模型会据此做错误的取舍 |
| `#turn-drive` 那个不可命中的 id | V6 | 它存在只为防止 compaction anchor 切掉房投影；没有房投影之后，anchor 命中自己的历史正是它该干的事 |
| `buildCollabChatRoomPayload` / `<ChatRoom>` 载荷 | V2 后可评估 | 房间侧（UI/房会话自身）是否还需要，单独判断，不在本期强拆 |

**不退役**：`turn-log`（收窄，见 §3）、`isCollabRoomFact`（决定哪些房消息进 drive，
比现在更重要）、`planCollabHistoryWindow` 的未读一半、`room_history`（改成翻被 compact
掉的那段）、P1 折叠 / P2 摘要（房间侧与 UI 侧仍在用，模型侧交给普通 compaction）。

---

## 6. 两个已定的细节

1. **长期沉默的成员** —— **沿用现成的 `unreadMax = 50`**（超出的折成 `elided="N"`，
   并入历史而不是丢掉）。一个 agent 三天没被驱动，下一条 drive 里的未读会很大，
   这道闸本来就是为它设的，不另起一套。
2. **房名与花名册 → 进 system prompt**（用户定，2026-08-02）。

### 关于花名册这条决定

花名册不是装饰，它是模型唯一的通讯录：`@Nova#63ac3aff` 的句柄、`dm to:"Bram#0739d3ab"`
的那个 token、`self="true"`（认出 History 里哪几条是自己说的唯一线索）都只能从它抄。

这条决定等于**把 `collab-chatroom-payload.md` 决定 2 翻回来**——花名册原本就在
system prompt 里，是为了「不与载荷重复」+「成员一变动就打掉前缀缓存」才搬进载荷的。
现在载荷要拆掉，"重复"那半个理由消失，只剩缓存那半个；而成员变动的频率远低于消息
（cumo 房 350 条消息 / 5 天，零次成员变动），这笔缓存代价可以付。

**落地成本几乎为零**：`rosterInPayload` 这个开关和它的两支文案都还在
（`roster.ts`），翻回 `false` 即可。

**但有一处必须跟着改**：`buildRelayLine` 的 `false` 分支现在写的是
「What they say reaches you as \`name: text\`」——那描述的是判定窗口的形状，不是新形态。
新形态下消息跟着 drive 到达、裹在 `<msg from="名字#句柄">` 信封里，这句话要换成
对应的说法。**一句关于载荷形状的假话比没有这句话贵得多**（那个文件自己的原话）。

---

## 7. 被否掉的方案

- **追加式收件箱（fan-out）**——本文档初稿。房消息落库时抄进每位成员的会话文件。
  能成，但把"模型读到什么"和"磁盘存什么"绑死：存储 ×N、每条消息写 N 个文件、
  副本可能与房间不一致、而且历史**写入即定格**（@ 重绘、表情统计、退休成员署名全部
  冻结）。定案方案里这四条都不存在。
- **请求时归并**（不抄，按游标把房消息与自己的轮次 merge-sort）——比 fan-out 好，
  但仍然要维护一个归并器和它的排序不变量（必须用房间写入序而非时间戳，否则一条迟到的
  旧消息会插进中间、打掉整段前缀缓存）。而"消息跟着 drive 写进来一次"根本不需要归并。
- **把一个 agent 的所有房间合成一条会话**——泄密，见 §3。
- **为群聊单独发明一套 compaction**——不需要。执行会话变成普通会话之后，
  普通 compaction 就是答案（这也是"compact 还没想好"这个 blocker 消失的原因）。
- **只做"自我历史回来"、不动房消息入口**（曾作为"A 方案"提出）——它能让狼人杀闭环，
  但留着投影不删，等于把两套上下文管理并存下去，而 P5 的五个缺口全部源自平行实现。

---

## 8. 验收

- **狼人杀重跑**：发牌那一轮之后的下一轮，模型能从自己的历史里读到 `dm` 那次调用的
  完整参数（**牌面本身**，不是凭据）。这是 P5-4 做不到的那一截。
- **私聊同构**：Iris⇄Bram 那间房里，Bram 上一轮的工具调用在下一轮读得到。
- **跨房**：Iris 在 cumo 回合里看得到「我在私聊里 dm 过谁」（②），Bram 在 cumo 回合里
  看得到「有一条未读私聊」（③），需要原文时查得到（④）。
- **成本**：每回合 input token 对比现在折叠后的 19,010 字符；compaction 触发频次。
- **回归**：`room-projection.test.ts` 那一组要整体重写——它守的是被删掉的那个分支。

---

## 9. 不解决的

- **并发抢麦**。同刻起跑的两个回合读到同一份未读，仍会说出意思几乎一样的话
  （`collab-agent-view.md` §9 / `qm-collab-learnings.md` P0-2）。接力模式下不存在，
  并行模式下仍在。
- **两个 agent 之间的记忆共享**。各自的思考与工具流量互不可见——这是**正确语义**，
  不是缺陷，别修。共享的部分是 say 进房的话，本来就共享。
- **`collab-agent-view.md` P4 的两条 ⏸**（判定层吃未读窗口、agent@agent 取消 @ 短路）。
  接力落地后它们只对并行房有意义，优先级已降。
