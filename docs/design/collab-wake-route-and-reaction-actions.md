# 房间中途来消息的路由 + 表情进 History 的 XML 动作

状态：A 已实施（2026-08-01）· B 设计，未实施
日期：2026-08-01
前置：`qm-collab-learnings.md`（§1.3 routeWake 路由表 / P1-6）、`multi-agent-collab-im.md`（W8 表情 / W18 执行会话）、`collab-team-v2.md`（§1.1 每群每 agent 一条会话、§5.1 停止语义）、`collab-chatroom-payload.md`（`<ChatRoom>` 载荷形态）

两件互不依赖的事：

- **A｜中途来消息的路由**：有人正在说话时用户又说了一句，该并进去、另起一轮、还是清场。**已落地**，实现细节见 `qm-collab-learnings.md` P1-6，这里只留设计过程与被否掉的方案。
- **B｜表情从 `(👍×2)` 改成 `<react>` 动作元素**：History 里明说「谁、对哪条消息、留了什么表情」。**未实施。**

---

## A · 中途来消息的路由（已实施）

### A.0 现状（改造前）

`handleRoomUserMessage`（`app/collab/queue.ts`）把用户消息决策成 activation 记录推进队列，`processQueue` 用 `runtime.running` 锁住，**一次只驱动一条**。于是用户连发两条时：第二条排在第一条产生的全部激活之后；第一条触发的意愿判定即使结果已无意义，回来后照样入队、照样写表情；用户看不到任何解释——房间只是"卡着"。

### A.1 被否掉的第一版：用户消息 = floor 重置

第一版设计把语义写成「**任何真实用户消息都抢占 floor**」：中止在跑的回合、作废队列、往房间贴一行「小李 的这轮回复被打断了（用户插话）」。

用户否掉了它，两条理由都成立，记在这里因为它们是这份设计真正的产出：

1. **「不是我只要发消息就打断」。** 真实 IM 里连发两条（一句问题 + 一句补充）是最普通的行为，对方是读完两条再回，不是把第一条的回答撕掉重来。把每条消息都当成抢占，是把最常见的用法当成了例外。
2. **那行系统行的措辞是从 agent 视角写的。** 「用户插话」带责备感，而用户只是在正常发消息。再往下一层，为了解释一件机器行为而往对话面里塞一条不是对话的东西，本身就可疑——turn.ts 的断路器早就立过同样的规矩：跳闸说明写进执行会话，*"never into the room — the room shows utterances, and a breaker trip is machinery"*。

### A.2 定案：QM 的路由表

答案在 `qm-collab-learnings.md` §1.3 —— QM 早就把这件事写成了一张显式表，而它的默认值是 **steer（并进当前回合）**，不是抢占。抢占只发生在用户明说「停」的时候。

落地形态、五条规则、以及相对 QM 的那处收窄（N 位同事的房间里，判据是「@ 谁」而不是「在跑的是不是旁听回合」），全部记在 `qm-collab-learnings.md` 的 P1-6 条目里，不在这里重复一遍——两处分家，改一边的那天就会有一边说谎。

### A.3 留在这份文档里的两条结论

- **喊停要清三样东西**，缺一件都留下一个还会开口的角落：在跑的回合（`abortRoomTurn`）、在飞的意愿判定（`runtime.judgements` 里的 AbortController）、队里的对话性激活（floor 世代号换代作废）。任务事件激活豁免——停对话不是停干活，与 `abortCollabRoomTurnForStop` 同口径。
- **floor 世代号必须落盘**。只活在内存里的话，重启后从 0 起算，而 `reconcileRoom` 恢复出来的那批 queued 记录带着旧世代号，会被整批误判成过期——一次重启就把房间里所有待应答的激活静默吃掉。旧 state 缺字段读作 0，旧记录缺 `epoch` 视为豁免。

### A.4 还欠的一件事

被中止的那位**并不知道自己被中止了**。它下一轮读到的是房间投影，而执行会话自己的历史刻意不进模型输入（W18 §4.6），所以「你上一轮的发言在中途被中止」这个事实目前到不了它手里——唯一到得了的通道是下次驱动它时的 drive 行。

现在不做：唯一的 abort 触发点是用户显式喊「停」，而喊停的语义本来就是"别说了"，模型不需要为此解释什么。等到出现第二个 abort 触发点（超时、断路器、别的什么）再补，那时它才真的会造成误解。

---

## B · 表情 → `<react>` 动作元素

### B.0 现状

表情在两处以**纯数量**形态进模型，都不带"谁"：

| 路径 | 位置 | 形态 |
| --- | --- | --- |
| 房间投影 `<History>` | `collab/projection.ts:91` `withImMetadata` / adapter `app/engine/stream/message-helpers.ts:335` | `<say from="…">正文 (👍×2)</say>` |
| 意愿判定窗口 | `collab/willingness.ts:134` | `一天: 正文 (👍×2)` |

数据层是有署名的（`reactions[].by[] = {type:'agent', agentId}`），只是投影把它压成了计数。UI 那侧同病（chip 只有 emoji + 数字），是同一个缺口的两个面。

### B.1 目标形状

```xml
<say from="一天#u1" time="2026-08-01 15:20" ref="a1b2c3d4">这个方案行吗</say>
<react to="a1b2c3d4" from="小李#3f9c" emoji="👍"/>
<react to="a1b2c3d4" from="小王#77ab" emoji="🤔"/>
<say from="小明#5e2d" time="2026-08-01 15:21" ref="b7e9f012">我觉得可以,不过要先……</say>
```

四条取舍：

1. **`<say>` 新增 `ref` 属性** —— 值取 `message.id` 前 8 位，与看板卡片 `#${id.slice(0,8)}`（`willingness.ts:161`）同一约定。这需要给 `CollabMessageLike`（`collab/types.ts:96`）补一个 `id?: string`：纯 spec 目前根本看不到消息 id。
2. **`<react>` 是兄弟节点、紧跟目标之后，同时带 `to`** —— 位置给局部性（模型不用跨 40 行找目标），属性给明确性（用户的要求："表明是对某条消息的回复"）。裁剪以消息为单位：目标被窗口裁掉时，它的 react 一起走。
3. **一个 actor 一个元素，不聚合** —— 聚合就是现状，而现状丢的正是"谁"。
4. **`from` 与信封署名同源**：agent 走 `resolveCollabSpeakerLabel` + `collabAgentHandle`，用户走 `formatCollabUserLabel(userLabel, userHandle)`（`projection.ts:169`）。三处同源那条纪律不能在这里破——模型要能从 History 里直接抄一个 `dm to:` 用得上的 token。

### B.2 self 消息：body 不动，react 照发

W14b 铁律不松：自身消息正文**逐字原样**，一个字不加工。所以现在 self 消息连表情统计都不给。

新形状下这条限制自动解除：`<react>` 在信封**外面**，没有改写任何一个字。于是"我说的话被三个人点了赞"这个当前完全看不见、却最该看见的事实，第一次到得了 agent 手里。这是本方案相对现状的净增益，不是副作用。

### B.3 成本与截断

每个 `<react/>` ≈ 45 字符。按条计费的东西要有闸：

- 每条消息最多列 `COLLAB_REACTION_PROJECTION_MAX = 6` 个具名 react（与既有 `COLLAB_REACTION_SUMMARY_MAX_ENTRIES` 同值同族）。
- 超出的折叠成不具名的一条：`<react to="a1b2c3d4" emoji="👍" count="9"/>`。
- 表情词表本来就锁死 6 个（`collab/reactions.ts:33`），所以常态下一条消息的 react 数 ≈ 反应人数，群不大时远低于闸。

### B.4 判定窗口：补名字，不上 XML

`buildWillingnessWindow` 是逐行文本、成本最敏感的一路（≤8 行 × 200 字）。保持一行式，只把计数换成名字：

```
一天: 这个方案行吗 (👍 小李、小王)
```

于是 formatter 分三支，同住 `collab/reactions.ts`：

| 函数 | 用途 |
| --- | --- |
| `formatCollabReactionSummary`（现有） | 保留，兼容与非投影调用点 |
| `formatCollabReactionNames(reactions, resolve)` | 判定窗口 |
| `buildCollabReactionElements(message, resolve)` | History，返回 `string[]` |

名字解析统一走一个 `resolve(actor) => string` 回调，由调用方注入（`projectRoomHistory` 已有 `agents` + `resolveAgentName`，判定窗口同样有）。退休/已删成员落到既有的「前成员」兜底，不裸露 id。

### B.5 两处实现必须同改

`collab/projection.ts` 是**被测的 spec**，`app/engine/stream/message-helpers.ts:335` 是**生产路径的 adapter**。两个文件的注释里都写着"只改一边 = 测试全绿而真机没变"。本方案涉及：

- `projection.ts` · `withImMetadata` → 拆成「信封 body（不再带表情）」+「随后的 react 元素」
- `message-helpers.ts` · 同名同逻辑的那份
- `willingness.ts:134` · 换 `formatCollabReactionNames`
- `types.ts:96` · `CollabMessageLike.id`

### B.6 验收点

1. 用户消息被两个 agent 点赞 → History 里两条 `<react>`，`to` 指向该消息 ref，`from` 是 `名字#句柄`。
2. self 消息 body 逐字未变，但其后的 react 元素照常出现。
3. 无表情的消息不产生任何 react 元素、不产生空标签。
4. 7 个以上 reactor → 前 6 具名 + 一条 count 折叠。
5. 老转录（消息无 id / 无 reactions）投影不炸、不写 ref。
6. 判定窗口一行内出现名字且总长仍受 200 字截断保护。

---

## C · 附带：UI 也要看得出是谁（P2，可后置）

`SayMessageRow.vue:317-334` 的 chip 只有 emoji + 数字，署名退化成原生 `title` tooltip；`MessageItem.vue:290-334` 里那套带头像的署名浮层（`reaction-attribution`）在房/私聊换壳时没跟过来。投影数据 `buildReactionChips` 早就返回了 `reactors[]`（头像 + 名字），把浮层搬过去即可，无新逻辑。

B 和 C 是同一个缺口的模型面与人面，建议同一批做完，否则"谁点的"只修好一半。

---

## 不做的事

- 不给 agent 加"主动 react 某条历史消息"的工具。表情仍然只有两个来源：人点，和意愿判定的沉默分支。加工具会让表情变成一次独立的模型调用，成本模型完全不同，属于另一个提案。
- 不改 `reply-quote` 的形态。`ChatMessageReplyTo` 已经带 `messageId`，B.1 的 ref 落地后引用行天然可以升级成 `<quote to="…">`，但那是另一件事。

## 落地顺序

A 已落地（2026-08-01），剩 B → C。两者是同一个缺口的模型面与人面，建议同一批做完，否则"谁点的"只修好一半。A 那侧还欠一次真机走查：steer 的注入与迟到兜底都只有单测证据，`steering:consumed` 的真实时序（回合边界 drain）要在真机上看一次。
