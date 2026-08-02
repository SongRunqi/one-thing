# `history` 统一历史搜索 —— 交接文档

交接人：上一轮实施者
日期：2026-08-02
状态：**已实施、已验收、未提交**（见 §10）
读者：接手这块代码的任何 AI 或工程师

**配套文档**：`docs/design/collab-history-search.md` 是**实施方案**（做什么、怎么做、
为什么这么做，含术语表）。**这一份是交接**（做完之后长什么样、哪里会咬人、下一步是什么）。
两份不重复：方案讲设计，交接讲现场。第一次接手请先读方案的 §0、§3、§5，再回来读这份。

---

## 1. 一句话

一个叫 `history` 的工具，让一位 AI 同事检索**它在场过的所有房**（群聊 + 私聊）的完整聊天记录；
它**看不到自己不在场的任何对话**。它取代并删除了原来那个只能查当前房折叠段的 `room_history`。

---

## 2. 起因：一次真实的事故

2026-08-01，用户在 `cumo` 群里玩狼人杀，让 Iris 当上帝。Iris 用 `dm` 给四个人各私发了一张身份牌。
之后在群回合里被问「收到 dm 了吗」，收件人全部回答「没收到」；重启后 Iris 自己也说
「我不知道每个人的身份牌了」。

牌就躺在各自的私聊房里。**问题不是丢了数据，是那一轮读不到别的房。**

调查后确认这不是"重启导致"，而是结构性的：一个 agent 在每间房有一条独立的执行会话
（`agent-exec-<agentId>-<roomSessionId>`），房与房之间彼此不可见。产品随后拍板三条：

1. **取消默认隔离** —— agent 对自己在场的所有房有统一的可检索历史；
2. **看不到别人之间的对话**；
3. 搜索**放在 Electron 主进程**，不引入 apps/server。

这份工作就是这三条的落地。

---

## 3. 现在的形态

```
模型调用 history(q?, who?, where?, since?, until?, limit?, cursor?)
      │
      ├─ tools/builtin/history.ts        纯层：参数契约 + 面向模型的文案（空结果五态、截断标记）
      │                                  零 I/O，靠注入的 adapters.search
      │
      └─ app/collab/history-tool.ts      app 层：授权、读盘、过滤、排序、分页、渲染
             │
             ├─ 我是谁      session.agentId **且** session.kind ∈ {room, agent, work}  ← §4.2
             ├─ 我能进哪些房 collabRoomVisibleUntil(meta.room, agentId)   ← collab/visibility.ts
             ├─ 读转录      fs.readFileSync(<store>/sessions/<roomId>/messages.jsonl) + scanJsonlLog
             │              （**不走 store.getSession()**，理由见 §7.2）
             ├─ 过滤        授权窗口 → isCollabRoomFact → 有正文 → since/until → who → q
             ├─ 排序        compareHits 三元组全序：时间戳 → roomId → messageId
             └─ 渲染        wrapCollabMessageEnvelope（与房间投影同一份），额外注入 room="房名"
```

返回的每一行长这样，与模型在房间上下文里读到的形状**逐字同构**：

```
<say room="Bram ⇄ Iris" from="Iris#eba0c4b7" time="2026-08-02 01:39">🃏 你的身份：**狼人** …</say>
```

同构是有意的：模型不该为了"查历史"再学一套引用格式。

---

## 4. 授权模型（这一节不可退让）

```
visibleUntil(room, agentId) =
    room.memberAgentIds 含 agentId    → +∞                 当前成员，全部可见
    room.formerMembers 里有 agentId   → 最后一次 removedAt   只到离开那一刻
    都不在                             → undefined           这间房对我不存在
```

实现：`packages/onething-runtime/src/collab/visibility.ts`（纯函数，零 I/O，11 个用例钉住）。

四条设计取舍，改动前请先理解：

- **当前成员看得到入房之前的历史。** 与既有行为一致——一位同事第一次被拉进一间老房时，
  首轮 drive 本来就把整段房历史铺给它。检索若不给，同一份内容在两条路上表现不同。
- **被移出的仍看得到移出之前。** 它当时在场，那些话它读过；事后抹掉不是隐私保护，
  是让它记错自己的过去。
- **取最后一次 `removedAt`。** 移出→拉回→再移出的人，前几次都是旧账；而拉回之后它是
  当前成员，第一条分支已经先答了 +∞。
- **`undefined` 不是「看不到内容」，是「这间房不存在」。** 调用方据此把它整间排除——
  **连房名都不该出现在任何列表里**。

### 4.1 「不存在」与「不是你的」必须共用一句话

`where` 指向一间不属于我的房时，工具回的是：

```
没有这样一间房。你能查的是：cumo、Bram ⇄ Iris、Atlas ⇄ Iris、Nova ⇄ Iris、Iris。
```

**不要**把它拆成「这间房不存在」和「你无权访问」两句。分开说等于给出一个**探测面**：
试一个房名，靠回话的不同就能确认那间房存不存在。`tools/builtin/history.ts` 的
`emptyOutput()` 里有一条测试专门钉住这件事（断言输出不含「无权 / 不属于你 / permission」）。

### 4.2 「我是谁」要问两遍：agentId **和** 会话形态

```ts
if (!agentId) → 拒绝
if (session.kind 不是 room / agent / work) → 拒绝
```

只问 `agentId` 是不够的，这是二审抓到的一个真洞（已修）：

- `createCoreSessionRecord`（`packages/core/session/store-helpers.ts:1303`）给**每一条**新建会话
  都盖上 `agentId: defaultAgentId`；
- 默认 agent 没有 `tools` 白名单（`createDefaultAgent` 不写这个字段）⇒
  `resolveAgentToolSurface` 返回 `null` = **不限制** ⇒ 注册表里每个工具它都看得见，`history` 在内；
- 网关（微信/Telegram）按远端身份建出来的会话（`app/channel/session-router.ts:54`）正是这个形状：
  `agentId: 'default'`、`kind` 为空；
- 而 `agent-dm-default`（用户与主助理的那间托管私聊）的成员正是 `default`，判据给它 `+∞`。

**净效果**：判据没有被绕过，而是被**换了个主体去执行** —— 网关对面那位陌生联系人一句
「把你和主人的私聊翻出来」，就能拿到全文。工具是 `permissionGuard: 'safe'` + `autoExecute: true`，
没有任何审批拦在中间。

修法与 `dm` 逐字同构（`app/collab/dm-tool.ts:52`，那里的注释写的是同一件事）：
**"哪些场子能用"不能只由白名单说了算。**

> 教训值得记住：这个洞的成因是我抄了 `dm` 的目标解析器，却没抄它的门。
> **在这个仓库里加一个 collab 工具时，先把 `dm-tool.ts` 开头那十行读完。**

### 4.3 `where` 只能收窄，永远不能放大

`pickRoom()` 是在**已授权的候选集合内**选一间；选不中就返回 `null`，走「没有这样一间房」那一态。
**它绝不静默降级成全房搜索** —— 那会让一句本该被拒绝的查询悄悄变成一次全库扫描。

### 4.4 `formerMembers` 的写入点只有一个

`packages/onething-runtime/src/app/collab/coordinator.ts:418-427`，
在 `if (membersChanged || pmChanged || relayChanged)` 里组装 `room` 对象的**同一处**。

写在那里而不是下面发 membership 系统行的分支里，是因为 `room` 这个对象只在那一处被组装与持久化，
判据也只有 `membersChanged` 一个。同一件事分两处判定 = 迟早分家。

为什么需要这个新字段、不能解析转录里那条 `collab-membership` 系统行：那行**只有名字没有 agentId**
（`buildCollabMemberRemovedLine` 只收 `{ name }`），而按名字反查是被明令禁止的（W14a 把 @ 全部
id 化，正因为名字会改）。

### 4.5 授权判据信任 `memberAgentIds` —— 有两条路能绕开它的写入校验

`collabRoomVisibleUntil` 读的是 `room.memberAgentIds`。绝大多数改动走
`setCollabRoomConfig`（校验 + 群公告 + `formerMembers`），但 **`ensureUserDmRoom` /
`ensureAgentDmRoom` 在"形态不符"时直接覆盖名册**，没有校验、没有公告、不写 `formerMembers`：

```
packages/onething-runtime/src/app/collab/agent-dm-room.ts:81-86
packages/onething-runtime/src/app/collab/user-dm-room.ts:58-68
调用点：app/collab/dm-tool.ts:92（`to` 由模型填）
```

两个方向，都只在"有人手工编辑过一间派生 dm 房的名册"之后才可达：

- **收窄**（失败闭合，只是丢窗口）：被无声移出的人没有 `formerMembers` 记录，
  连它当时读过的那段也永久查不回。
- **放宽**（真问题）：A 调一次 `dm to:"B"` → `ensureAgentDmRoom(A,B)` 把名册改回 `[A,B]`
  → A 的判据从 `removedAt` 跳回 `+∞`。**这是一条模型可自助扩权的路径**，且无审计痕迹。

**未修**（二审评为 low：房 id 由 (A,B) 派生，A 只能把自己加回它自己的那间 DM，
且前置状态需要人工制造）。要修的话方向是：那两处 repair 也走 `formerMembers` 追加，
并且拒绝在 repair 里**新增**成员。

---

## 5. 动了哪些文件

### 新增

| 文件 | 是什么 |
| --- | --- |
| `packages/onething-runtime/src/collab/visibility.ts` | 授权判据（纯层）：`collabRoomVisibleUntil` / `isCollabMessageVisible` |
| `packages/onething-runtime/src/tools/builtin/history.ts` | 工具契约与面向模型的文案（纯层，`HISTORY_MAX_LIMIT = 30`） |
| `packages/onething-runtime/src/app/collab/history-tool.ts` | app 接线：授权、直接读盘、过滤、游标、渲染 |
| `packages/onething-runtime/src/collab/__tests__/visibility.test.ts` | 11 例 |
| `packages/onething-runtime/src/tools/__tests__/history.test.ts` | 15 例（文案与契约） |
| `packages/onething-runtime/src/app/collab/__tests__/history-tool.test.ts` | 22 例（授权为主） |

### 修改

| 文件 | 改了什么 |
| --- | --- |
| `packages/shared/ipc/chat.ts:153` | `RoomConfig` 新增 `formerMembers?: Array<{agentId, removedAt}>` |
| `app/collab/coordinator.ts:418` | 成员被移出时追加 `formerMembers` 记录 |
| `app/collab/history-tool.ts` `matchesWho` | 认 `COLLAB_USER_CONSTANT_WORDS`（`用户`/`user`），见 §7.5 |
| `collab/tool-surface.ts` | `COLLAB_ROOM_TOOLS` 里 `'room_history'` → `'history'`，文件头注释重写 |
| `app/collab/turn.ts` | `buildDriveRoomContext` 改为接收 `now`，传 `driveStartTs`（见 §7.6） |
| `tools/index.ts` | barrel 换成 `./builtin/history.js` |
| `collab/{classify,digest,history-window}.ts` | 仅注释：指向已删文件的说明改为"已退役"叙述 |
| 四份测试夹具 | `agents/__tests__/profile.test.ts`、`collab/__tests__/{agent-pair-dm,dm,say}.test.ts` 里的工具清单 |

### 删除（`room_history` 退役）

```
packages/onething-runtime/src/tools/builtin/room-history.ts
packages/onething-runtime/src/tools/__tests__/room-history.test.ts
packages/onething-runtime/src/app/collab/room-history-tool.ts
packages/onething-runtime/src/app/collab/__tests__/room-history-tool.test.ts
```

源码里仍能 grep 到 5 处 `room_history`，**全部是「前身 / 取代 / 退役」的叙述性注释**，无一处是活的接线。
它们是有意留的：一个只说"现在这样"的注释，读者无从判断哪些是决定、哪些是巧合。

> ⚠️ 注意区分 `room_history`（已退役的**工具**）与 `projectRoomHistory`（房间投影的**纯函数**，
> 在 `collab/projection.ts`，健在且是核心）。名字像，是两回事。grep 时别一起删了。

### 注册点（漏一个 = 工具存在但模型看不见）

| 位置 | 内容 |
| --- | --- |
| `app/tools/builtin/index.ts:21,45` | `import { HistoryTool }` + 注册（desktop full 档） |
| `app/tools/builtin/headless.ts:11,27` | 同上（headless 档） |
| `collab/tool-surface.ts` | `COLLAB_ROOM_TOOLS = ['say','board','dm','history']` —— 房会话的工具面 |
| `tools/index.ts:29` | `export * from './builtin/history.js'` |

`onething.aliases.ts` **不需要新条目**：两个新文件都落在已登记的前缀下
（`@onething/runtime/tools`、`@onething/runtime/collab`、`@onething/app`）。
但请记住这条仓库特性——**缺 alias 条目只在 build/run 时炸，typecheck 永远绿**（tsconfig 的
通配符接受任何子路径）。将来新开一个顶层家族时会踩到。

---

## 6. 被否决的方案（连同理由，别重新提一遍）

讨论中真实出现过、并被明确否决的四条：

| 方案 | 为什么否决 |
| --- | --- |
| **给 agent `bash`，让它自己 grep 转录文件** | ① 授权整个失效——同一棵树下有 `oauth-tokens.json` 和别人的私聊；② 读到的是内部 JSONL，会把协调器的机械行（drive、thinking record）当成有人说的话；③ 成本不可控，而工具结果在这套系统里**永久累积**；④ 房 id 是 uuid，模型压根拼不出路径 |
| **中文分词 / 倒排索引** | 几百条小语料上 OR 匹配过召回严重（「身份」会把「确认一下你的身份」排到「身份牌」前面）；且 CLAUDE.md 明写跨会话搜索/索引归 apps/server，不进 Electron 主进程。**解法是范围兜底，不是分词**（§7.4） |
| **`room_history` 与 `history` 并存** | 两个历史工具 = 两套分页语义、两套上限、两套空结果文案、两套引用习惯。这个仓库刚为"一条规则三份实现"付过代价 |
| **通过 `store.getSession()` 读转录** | 见 §7.2。这是最容易被后来者"顺手清理"掉的一条，请务必读完那一节 |

---

## 7. 已知边界与陷阱

### 7.1 `formerMembers` 只对**将来**的移出生效

这个字段是这次新加的，**没有迁移**。在它上线之前被移出的成员，房里没有它的记录 ⇒
`collabRoomVisibleUntil` 返回 `undefined` ⇒ 那间房对它**整间不可见**。

方向是**少给不是多给**，所以这是安全的失败方向，但要知道它存在：
用户可能反馈「某个 agent 查不到它以前待过的群」。这不是 bug，是没有历史数据。
真要补，只能靠人工回填，因为转录里那条移出系统行不带 agentId（§4.4）。

### 7.2 **必须直接读盘** —— 别"清理"成 `store.getSession()`

```
packages/onething-runtime/src/sessions/session-repository.ts:148
  new LRUCache(options.cacheSize ?? 10)
```

会话仓库的 LRU **只有 10 个槽**。一次跨房检索要读 5–20 间房（每间 200–350 KB），
走 `store.getSession()` 会把整个热集顶出去——**包括正在流式追加的那条执行会话**。
该仓库 07-11 审计已记过一次 LRU 丢写事故。

`history-tool.ts` 的 `readRoomMessages()` 因此直接 `fs.readFileSync` + `scanJsonlLog`，
完全绕开缓存。**只有**读不到 `messages.jsonl` 时（遗留的整份 JSON 会话，惰性迁移中）才退回
`store.getSession`。这条退路今天几乎不会走到（当前所有房都已是 jsonl 形态），但删掉它会让
迁移期的老会话整间查不到。

文件头注释里写了这条纪律。改动前请先读那段。

### 7.3 工具结果在这套系统里**永久累积**

架构重构之后（`collab-agent-view-v3.md`），执行会话就是模型读的那份聊天记录，
**工具结果不是"这一轮用完就丢"**，它会一直躺在历史里被每一轮重新读到。

所以上限是硬的，而且**每一处截断都必须留下可见标记**：

| 常量 | 值 | 位置 |
| --- | --- | --- |
| `HISTORY_MAX_LIMIT` | 30 | `tools/builtin/history.ts:70` |
| `HISTORY_DEFAULT_LIMIT` | 10 | `tools/builtin/history.ts:71` |
| `HISTORY_MAX_ROOMS` | 10 | `app/collab/history-tool.ts:41` |
| `HISTORY_MAX_BYTES` | 8 MB | `app/collab/history-tool.ts:43` |
| `HISTORY_LINE_MAX_CHARS` | 300 | `app/collab/history-tool.ts:45` |
| `HISTORY_FALLBACK_LIMIT` | 10 | `app/collab/history-tool.ts:47` |

`skippedRooms` / `fellBackToRange` / `nextCursor` 三个字段就是为"说出截断"而存在的，
`noticeLines()` 负责渲染它们。**静默丢弃读起来和"什么都没发生"一模一样** ——
这是这套机制里最脏的失败形态。

**`skippedRooms` 必须在扫描之后算。** 上限有两种（房数、字节数），这个数就要覆盖两种：

```ts
const skippedRooms = ranged.length - scannedRooms   // ✅ 两种上限都算进来
// const skippedRooms = ranged.length - toScan.length   ❌ 字节上限丢掉的房不留标记
```

不变式：**扫过的 + 报出没扫的 = 我能进的全部房数**。测试里就是这么断言的。

> 已知未覆盖：`HISTORY_LINE_MAX_CHARS`（单条 300 字裁切，见 `clip()`）目前**没有可见标记**，
> 也没有测试钉住。裁切用的是 `…` 结尾，肉眼可辨但机器不可辨。见 §9 待办。

### 7.4 中文子串匹配几乎必空 —— 兜底是设计，不是补丁

`q` 是纯子串、无分词。真机实测：

| 查询 | 命中 |
| --- | --- |
| `狼人` | 16 |
| `预言家` | 18 |
| `身份牌已私发四人`（模型爱这么传） | **0** |

所以关键词 0 命中时**不返回空**，而是**只放宽 `q` 这一维**（`who`/`where`/`since` 全部保留），
返回该范围内最近 N 条并明说「没有匹配到关键词」。

理由：模型填错的几乎总是关键词，它填对的范围已经足够窄；**让一个坏关键词把一个好范围清零，
是这里最贵的失败**。反过来，范围本身为空时**不兜底** —— 那是真的没有，说"没有"才是对的。

### 7.5 「用户」是常量词，不是显示名

`matchesWho()` 先认 `COLLAB_USER_CONSTANT_WORDS`（`['用户','user']`，来自 `collab/identity.ts`，
与 `dm to:"用户"` 用的是**同一份表**），再退回配置的显示名。

这是写测试时抓到的一处实现没兑现契约：工具描述里写明「用 `who:"用户"` 指人类」，
但原实现只按配置的显示名匹配 —— 用户一旦改过名，那句描述就是假的，而模型照着描述填，查回来是空。
**新增用户身份的写法时，改那份表，不要在这里开第二份清单。**

### 7.6 `now` 在一个回合里只取一次

`app/collab/turn.ts:859` 的 `driveStartTs` 现在同时供给三处：
`buildDriveRoomContext(…, now)`、其内部的 `planCollabHistoryWindow`、`buildDriveElsewhere` 的 `until`。

原因：折叠切点是**按天**算的。同一个回合里多次现取 `Date.now()`，跨过午夜就会跳一天 ——
前缀全部 miss，而且模型第一遍读到的正文第二遍消失。

该文件里剩下的 `Date.now()` 都是**正确的活值**，别顺手一起冻了：
`:112,:120` 是引擎绑定的超时轮询，`:641` 是未读闸（发生在 drive 之前，且它读的 `unread` 不依赖 `now`），
`:682` 是 activeTurn 的 `startedAt`，`:911` 是消息 `receivedAt`。

### 7.7 游标存**值**，不存下标

```
cursor = "<timestamp>:<roomId>:<messageId>|<fingerprint>"
```

- **必须三元组**：信封时间精度到分钟，跨房时单一时间戳**不构成全序**；两间房里同一分钟的两条消息
  谁在前必须有确定答案，否则翻页会跳页或重页。
- **定位方式是「找第一条严格更早的命中」**（`compareKeys(keyOf(hit), anchor) < 0`），
  **不是**「找到锚点那条再往后一格」。
- **指纹不符直接拒绝**；**读不懂也直接拒绝**，不退回"当第一页"。
- **方向恒定：更早。**

第二条是修出来的，值得说清楚。原实现按下标定位（`findIndex(hit => hit.id === anchor.id)`），
锚点找不到时 `from` 落到 `pool.length` 返回空页，而纯层把空页渲染成
「这个范围里没有任何消息」——**一个带确定性的否定，可消息明明还在**。

而锚点消失**不是理论边角**：候选房按 `updatedAt` 取前 `HISTORY_MAX_ROOMS`(10) 间，
真机有 22 间房 —— 两页之间任何一间房来一条新消息，就可能把锚点所在的房挤出扫描集；
兜底模式在页间翻转（新消息恰好命中 `q`）也落进同一个坑。

游标里的 `at` 当时已经解析出来却从未使用，修法就是把它用起来：拿三元组跟全序比大小，
锚点那条在不在都不影响答案。

**「翻到尽头」有自己的一句话**（`endOfRange`）。带游标翻完了 ≠ 这个范围里从来没有过——
共用一句话就是让模型把一次成功的翻页读成一个否定答案。

### 7.8 `history` 与折叠 / 每日摘要现在是**两套独立机制**

旧的 `room_history` 只查"折叠段"，靠 `collectCollabFoldedFacts` 取可查集合。
**新工具查整份转录，与折叠完全无关。**

不要把那条旧规则搬回来：它会让同一句查询在两间房里表现不同（取决于各自的折叠配置），
而那正是现在要用三段文案去解释的东西。

`collectCollabFoldedFacts`（`collab/history-window.ts`）现在剩两个消费者：
`app/collab/digest-runner.ts:90`（每日摘要）与 `app/collab/turn.ts:512`（drive 的折叠日期行）。
它的文件头注释这一轮已同步更新。

---

## 8. 验收记录

### 自动化

- 全量 `npx vitest run`：**806 文件 / 6331 例全绿**（1 skipped 是 voice live 测试，本来就 skip）
- 改动文件 `npx eslint`：干净
- `npx tsc --noEmit -p tsconfig.node.json`：无新错（仅剩基线里那条 `electron.vite.config.ts` TS6307）
- `bun run boundary:gate`：无新红（26 known failures；另有 **2 条基线自愈**，可以考虑重录基线）

四份测试各守什么：

| 文件 | 例数 | 挂了意味着 |
| --- | --- | --- |
| `collab/__tests__/visibility.test.ts` | 11 | 授权判据本身错了 —— 最严重 |
| `tools/__tests__/history.test.ts` | 15 | 面向模型的文案退化（五态合并、截断变静默、参数描述被改坏） |
| `app/collab/__tests__/history-tool.test.ts` | 22 | 接线错了；其中授权那组挂了 = 泄漏 |
| `app/collab/__tests__/coordinator-membership.test.ts` | 12 | 移出成员没被记进 `formerMembers` |

### 真机走查（只读，对真实 `~/.onething`）

方式：对真实存储跑一遍 `searchCollabHistory`（真实 `messages.jsonl`、真实 `agents.json`、
真实房元数据；不启动 Electron，不写任何文件）。查询者是 Iris，也就是 §2 那次事故的当事人。

| 指标 | 值 |
| --- | --- |
| 扫到的房 | 5（cumo、Iris⇄用户、Bram ⇄ Iris、Atlas ⇄ Iris、Nova ⇄ Iris） |
| 因上限跳过 | 0 |
| 命中总数 | 450 |
| 本页返回 | 30 |
| 结果字符数 | 4,070（约一次 drive 的 1/5） |
| 耗时 | 8 ms |

三条性质：

1. **查得到自己的私聊。** `where:"Bram"` 只回 `Bram ⇄ Iris`，第一条就是当初那张牌
   `🃏 你的身份：**狼人**` —— §2 的事故在这条路径上不再成立。
2. **查不到别人之间的私聊。** 该存储里有三间 Iris 不在场的双人私聊（`Bram ⇄ Nova`、
   `Bram ⇄ Atlas`、`Nova ⇄ Atlas`）：全房检索里一条都没有；显式 `where:"Bram ⇄ Nova"`
   走「没有这样一间房」，且附带的可查房名清单里也不出现。
3. **结果里没有 drive / 思考记录。** 30 行全部是 `<say room=…>` 开头，无 `<turn agent=…>`。

走查脚本依赖个人存储，跑完已删；等价的固定用例留在 `history-tool.test.ts` 里。
**要复现**：临时在 `app/collab/__tests__/` 下建一个 test，mock 掉 `../../store.js` 的
`getSessionsList`/`getSession`（读真实 `sessions/*/meta.json`）与 `../../agents/index.js`
（读真实 `agents.json`，注意它的根是对象、agent 数组在 `.agents`），其余走真实代码路径。
**读完即删**，不要留在仓库里。

---

## 9. 还没做的（建议的下一步，按价值排）

| # | 事项 | 为什么 | 规模 |
| --- | --- | --- | --- |
| 1 | **`clip()` 的裁切留可见标记** | 单条超 300 字被截成 `…`，机器不可辨；违反"每处截断都要说出来"这条自定纪律。加一个 `truncated` 计数并在 `noticeLines` 里渲染 | 小 |
| 2 | **`until` 过滤 / 系统行 `who:"系统"` 补测** | 实现里有，`history-tool.test.ts` 只覆盖了 `since` 和名字 | 小 |
| 3 | **遗留 JSON 会话的兜底路径补测** | `readRoomMessages` 的 catch 分支目前只在单测里被间接走到（mock 掉了 `getSessionsDir`），没有正面用例 | 小 |
| 4 | **重录 boundary 基线** | 有 2 条基线失败已自愈，基线可以再收紧一格 | 小 |
| 5 | **`~/.onething` 读盘面没有结构性阻拦** | 方案 §2 写着"给 agent bash 去 grep 转录 → 授权整个失效"，但 `checkCoreFileAccess`（`tools/sandbox.ts:120-134`）是**空实现**，越界只体现为一次权限弹窗。`permissionMode: 'dangerously-allow-all'` 下，任一 agent 回合都能 `read ~/.onething/sessions/<别人的房>/messages.jsonl` 跳过整套判据。这条**先于本特性存在**，但本特性的边界只在它被关住时才成立 | 大 |
| 6 | **被移出者仍能读到房的当前元数据** | `candidateRooms` 用的是**当前**的 `meta.name` 与 `updatedAt`：一个 T 时刻被踢出的同事，之后仍能看出这间房被改成了什么名字、以及它相对其他房的活跃新旧。消息本身被挡住，泄的是元数据。没有便宜的正确修法（我们不存"离开时的房名"） | 中 |
| 7 | **真机 UI 走查** | §8 的走查绕开了 Electron。起 `bun run dev`、在群里让 agent 真的调一次 `history`，确认工具在模型手里能用（注册链全通）、结果渲染正常 | 中 |

第 7 条是**唯一还缺的验收维度**：代码路径已被真实数据验证，但"模型在一个真实回合里调得到它"
只由注册点的静态核对（§5）保证，没有跑过。

### 已修（原列在这里，2026-08-02 二审后收口）

一次多 agent 审计对着这份实现跑了一遍，抓到两条真 bug 与三处偏离，都已修并补测：

| 问题 | 修法 |
| --- | --- |
| **游标锚点丢失时返回撒谎的空页** | 改为按全序定位「第一条严格更早的命中」；见 §7.7 |
| **字节上限截断静默** | `skippedRooms` 挪到扫描后算；见 §7.3 |
| `scannedRooms` 只进 metadata，模型看不见 | 与 `skippedRooms` 合并成一行渲染进 output |
| 畸形游标被静默当第一页 | 与指纹不符同一待遇：明确报错 |
| 空页分支硬编码 `total: 0` 盖掉真实命中数 | 改为 `result.total ?? 0`；并补一句「一共 N 条，你已经全部翻过」 |

两条真 bug 的测试都**先在回退版上验证会红**，再切回修复版转绿——否则那种测试什么也没钉住。

---

## 10. ⚠️ 这棵树的状态

```
分支：experiment/castlabs-electron
最近提交：de183c65  feat(agents+sidebar): Agent 空间进右栏 + 左栏改图标 rail
未提交：194 个修改 + 116 个未跟踪文件
```

**本轮的全部改动都还没提交**，而且它们**混在一大堆同样未提交的前序工作里**
（协作系统的 P1/P2/P3、v3 架构重构、Agent 域模型、IM 外壳重构……）。

给接手者两条硬提醒：

1. **不要用 `git stash` 做二分排查。** 上一轮我为了确认某个测试失败是不是自己引入的，
   stash 了几个文件，结果连带把用户未提交的工作也卷走了（已 `git stash pop` 还原并验证内容
   与测试全绿，无损失）。在这棵树上，任何会移动工作区的 git 操作都要先确认影响面。
2. **提交时按主题拆。** 这一轮的改动是自洽的一组（§5 的清单），可以单独成一个 commit；
   但 `git add -A` 会把另外一百多个文件一起带走。

---

## 11. 相关文档

| 文档 | 讲什么 |
| --- | --- |
| `docs/design/collab-history-search.md` | **本工作的实施方案**（设计、分期、陷阱、术语表、实测数字） |
| `docs/design/collab-agent-view-v3.md` | drive / 执行会话架构。**碰 `turn.ts` 前必读** —— 「进 drive 的块只能是事件，不能是状态」这条纪律的由来 |
| `docs/design/collab-agent-view-p5.md` | `isCollabRoomFact` 收敛的由来（同一条判定曾写三遍、三份答案不同） |
| `docs/design/collab-agent-view.md` | 更早的 P0–P4：游标 / 折叠 / 摘要 / `room_history`（已退役） |
| `packages/onething-runtime/src/collab/classify.ts` | 一条房间消息「算不算数」的**唯一**判据，文件头有完整的 kind 表 |
| `packages/onething-runtime/src/collab/turn-log.ts` | 「事件不是状态」的实现样本 |

---

## 12. 接手第一件事

按这个顺序读，约 30 分钟：

1. `collab/visibility.ts` —— 55 行，授权的全部
2. `tools/builtin/history.ts` 的文件头 + `emptyOutput()` —— 面向模型的契约与它的三条纪律
3. `app/collab/history-tool.ts` 的文件头 —— 四条实现纪律，每条都对应一次踩过的坑
4. 跑 `npx vitest run packages/onething-runtime/src/app/collab/__tests__/history-tool.test.ts` —— 22 例，
   授权那组的用例名就是这套系统的安全边界

然后再看 §9 的待办。

**改这块代码时，唯一不能弄错的是 §4。** 多给一条，就是一位同事读到了它不该读的对话 ——
这是这个方案里唯一不可逆的失败；其余的（游标、截断、兜底）错了会难看，授权错了会出事。
