# 群聊两件套:@所有人 补全 + 清空聊天历史

日期:2026-08-02
状态:设计,未实施
背景:同日「智能编排只排 Nova」事故链的两个收口 —— `@所有人` 的后端展开已实施
(`expandCollabAllMentions`,仅用户 ingress),缺发现性;「清空历史」是污染循环
(旧舞台指示洗进转录与执行会话,喂给每次编排)的根治口。

---

## A. @所有人 进 mention 补全(P1,半天)

### 现状

后端已认 `@所有人` / `@全体成员` / `@all` / `@everyone`(ASCII 带词边界),在
`app/collab/ingress.ts` 展开成全体在职成员 mention,走既有点名代码链路(并行
短路激活、编排强制进第一批)。**用户必须凭记忆打出来** —— composer 的 @ 补全
列表里没有它。

### 方案

**A1 picker 候选(核心)**

- 房间 composer 的 @ 触发列表**置顶**一个伪成员行:`所有人 — 提醒全部 N 位成员`。
- 选中插入**纯文本** `@所有人 `:不产生 `{{member:…}}` token、不进 mentions[]。
  展开是 ingress 的事 —— 单一真源,picker 只负责把 token 打出来。这也让手打
  `@所有人` 与 picker 选出的行为逐字一致。
- 文件:`packages/renderer/composables/usePickerOrchestration.ts`(成员候选组装
  处,`agent-member` 那一族)+ 对应 picker 面板组件的行渲染(伪成员无头像,
  给一个固定图形,如 ⊕ 或全员图标)。
- 仅房间(`kind === 'room'` 且非 dm 房)出现;dm 房与普通会话不出现。

**A2 显示 pill(可选 P2)**

`renderCollabMentionText` 目前把 `@所有人` 当普通文本(它不在 candidates 里)。
可给它一个 pill:candidates 并入 `COLLAB_MENTION_ALL_LABELS`,`renderHit` 加
`kind: 'all'`。纯视觉,不做不影响功能。

**刻意不做**:agent `say` 的 `@所有人`。一位成员一句话唤醒全房是链长闸兜不住的
放大器,点名个人已经够用。

### 验收

房里打 `@` → 首行「所有人」;选中发「@所有人 报数」→ 四人全部激活:编排模式
全员进 `<addressed>` 且缺席者被 `normalizeCollabPlan` 强制进第一批;并行模式
全员短路激活。

---

## B. 清空聊天历史(P0,一天)

### 语义(先定,这是本功能的全部难点)

「清空」= 把这间房的**对话记忆**整体归零;**不动**成员、房间设置、用量账本、
成员之间的私聊房(后者自 2026-08-02 起有显式勾选)。

> **2026-08-02 修订:看板改为一并清。** 初版把看板划在"不动"里,真机上是自相
> 矛盾:`getCollabSelfTaskFacts` 把 doing/blocked 卡片当既成事实注入提示词,于是
> 清空后的第一个回合里,同事张口就在谈一段谁都读不到的工作。清的范围是
> `board.json` + `activity.jsonl`(卡片的审计轨,卡片没了它就是孤儿),并在停的
> 那一步用 `forgetCollabRoomWork` 把在跑的执行一起 abort。次序上**看板先于转录**
> ——abort 的收尾第一句就是"这张卡还在不在",卡先没了它就一行都贴不出来。

一间房的对话记忆散在 **七处**,漏任何一处都会留下幽灵:

| # | 存哪 | 清什么 | 漏掉的后果 |
| - | ---- | ------ | ---------- |
| 1 | `sessions/<roomId>/messages.jsonl` | 房间转录全删 | — |
| 2 | 每位成员的执行会话(`collabAgentSessionIdsForScan` 两代 id) | messages 全删 + `collab.seenMessageId` 游标清掉 | **污染循环的另一半**:旧 drive(含历史上注入过的舞台指示)继续躺在成员记忆里,每轮都读到 |
| 3 | `collab/<roomId>/state.json` | 重置为默认形状(chainCount / activations / plan / floorEpoch / watermark) | watermark 指向已删消息;残留 plan 关死级联 |
| 4 | `collab/<roomId>/digests.json` | 整文件删(digest-store 加 `forgetCollabDigests`) | 编排窗口折叠头注入已删内容的摘要 = 幽灵历史 |
| 5 | 进程内运行时 | 与「喊停」同款清场:bump floorEpoch、abort 判定轮 / `planAbort` / 在跑回合、清队列与 inFlight;然后 `forgetCollabInspector`(「刚才」清零) | 在飞回合的收尾往刚清空的会话里写 harvest |
| 6 | `collab/<roomId>/board.json` + `activity.jsonl`(2026-08-02 追加) | 卡片清空(seq 继续 +1,否则渲染层当过期到达丢掉)、审计轨删除;停的那一步先 `forgetCollabRoomWork` abort 在跑的执行 | 同事凭一张幽灵卡宣称自己"正在做 X" |
| 7 | renderer | 广播 session 事件(消息列表清空、看板换成空快照、状态条归零、线程列表刷新) | 界面残影 |

**次序强制:先停(5)后删(6→1-4,看板先于转录)再播(7)。**

刻意不清:`budgetSpentUSD` / `budgetNoticeDay`(钱花了就是花了,预算闸照常)、
成员 agent 本体、房间配置(responseMode 等)。

### 链路(按仓库 IPC 五步走)

1. `packages/shared/ipc/channels.ts`:`COLLAB_ROOM_CLEAR_HISTORY`
2. `packages/shared/ipc/collab.ts`:request/response 类型
3. `apps/electron/src/main/ipc/collab.ts`:handler → coordinator
4. `apps/electron/src/preload/bridge.ts`:暴露 API
5. `packages/renderer/platform/web.ts`:登记进 `WEB_DESKTOP_ONLY_PLATFORM_METHODS`
   (collab 域现状即桌面独占)

**app 层**:`coordinator.ts` 新增 `clearCollabRoomHistory(roomSessionId)`,编排
上表 1-6。需要的新原语:

- store:`clearSessionMessages(sessionId)`(jsonl 驱动清空 messages + meta 计数
  归零。现有 `deleteMessageAndTruncate` 是"从某条起截断",语义不同,不复用);
- digest-store:`forgetCollabDigests(roomSessionId)`;
- 游标清除:`updateSessionCollab(execId, { collab: { seenMessageId: undefined } })`
  (确认白名单不吞该字段)。

**UI 入口**:`RoomSettingsDialog` 底部「危险区」——「清空聊天记录」+ 二次确认。
确认文案必须写明三件事:成员的会话记忆与看板卡片一并清空;房间设置与成员保留;
不可恢复。
有在跑回合时追加一句「将中止正在进行的发言」。

### 保险与边界

- **备份一手**(P0 就做,成本一行):删除前把 `messages.jsonl` 复制为同目录
  `messages.cleared-<ts>.jsonl`。不进任何读取路径,纯留档 —— 与 `legacy-backup`
  同精神。执行会话不备份(它们是派生记忆)。
- boot 幂等:清空后 state 无 activations、无 watermark、messages 空,
  `reconcileRoom` 天然无事可做。
- 并发:清空过程持房间的既有串行入口(coordinator 单线程语义),清场步骤(5)
  保证没有回合与之竞速。

### 测试要点

清空后:房间转录空、每位成员执行会话空且游标空、state.json 为默认形状、
digests 不存在、「刚才」为空、在飞回合被中止且不再写回、看板为空且 seq 更大
(没有看板文件的房不凭空写出一个);房间设置、预算缓存原样;备份文件存在。随后发一条消息,调度从零正常起转。

---

## 分期总览

| 期 | 内容 | 量 |
| -- | ---- | -- |
| B0 | 清空历史全链路(store 原语 + coordinator 编排 + IPC 五件套 + 设置入口 + 备份 + 测试) | 1 天 |
| A1 | @所有人 进 picker 置顶候选 | 半天 |
| P2(可选) | @所有人 pill 渲染;房头菜单第二入口;「保留最近 N 条」变体 | 按需 |

建议次序:B0 → A1(B0 独立可测,且是当前污染房间的救急口)。
