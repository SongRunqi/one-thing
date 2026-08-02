# 群聊调度三件套 · 审查交接书

日期：2026-08-02
状态：全部已实施，**未提交、未真机验证**
给谁：接手 review 的另一个 session

---

## 0. 你要审的是什么

一次会话里连着落地的三个功能，共同改写了「**一条用户消息进房间之后，谁开口、按什么次序**」这条链：

| # | 功能 | 设计文档 |
| --- | --- | --- |
| 1 | **顺序/并行响应模式 + 接力** | `docs/design/collab-speaking-order.md` |
| 2 | **协调器状态条**（右栏线程格顶部） | `docs/design/collab-coordinator-inspector.md` |
| 3 | **waves 编排** —— 一次模型调用产出「谁说、什么次序」 | `docs/design/collab-coordinator-plan.md` |

三份文档都写了「为什么这么做」和「被否掉的方案」，**先读文档再读代码**，否则很多收窄看起来像随意的。

### 不在范围内

同一时间窗里 `docs/design/collab-agent-view-v3.md` 那条线（V1/V2/V4'/V6：执行会话读自己的历史、drive 带未读、`<elsewhere>` 事件块）是**另一个 session** 做的，落在 `message-helpers.ts` / `projection.ts` / `turn-log.ts` / `roster.ts`。两条线在 `turn.ts` 的 drive 构造附近碰头但不改同一段。

`git status` 里大量 `M` 的测试文件属于那条线（它们补的是 `store.getSettings` mock），**不是本次改动**。

---

## 1. 改动面

### 新文件（我写的）

```
packages/onething-runtime/src/collab/
  speaking-order.ts              纯规则:接力环 / 强制顺序合成 / 终止判定
  plan.ts                        纯规则:编排提示词 / 解析 / 规范化 / 推进
  __tests__/speaking-order.test.ts   (29)
  __tests__/plan.test.ts             (54)

packages/onething-runtime/src/app/collab/
  inspector.ts                   状态条快照 + 环形缓冲 + 节流广播
  planner.ts                     仲裁者调用(一次 generateChatResponse)
  plan-runner.ts                 编排执行器:安装 / 推进 / 终止 / @ 提批
  __tests__/inspector.test.ts        (13)
  __tests__/coordinator-relay.test.ts (18)
  __tests__/coordinator-plan.test.ts  (18)

packages/renderer/components/workbench/
  coordinator-status.ts          状态条纯逻辑
  CoordinatorStatusBar.vue       状态条呈现
  __tests__/coordinator-status.test.ts (35)
```

### 改过的（我改的那部分）

```
runtime/collab/     index.ts activation.ts willingness.ts types.ts
runtime/app/collab/ queue.ts turn.ts room-runtime.ts coordinator.ts
                    willingness-runner.ts budget.ts index.ts
runtime/app/usage/  bill-side-line.ts        runtime/usage/types.ts
runtime/providers/  agent-turn.ts            ← 顺手修的旧 bug,见 §5
shared/ipc/         chat.ts collab.ts index.ts channels.ts
shared/events/      session-events.ts
apps/electron/      main/ipc/collab.ts preload/bridge.ts
renderer/           types/index.ts platform/web.ts stores/collabBoard.ts
                    components/chat/{room-settings-form.ts,RoomSettingsDialog.vue}
                    components/workbench/RoomThreadsWorkbench.vue
```

---

## 2. 三个功能，各自的不变量

审查时请把这些当作**必须成立**的断言去找反例。每一条后面都有一次真实事故或一条验真过的缺陷。

### 2.1 接力（`speaking-order.ts`）

- **列表是次序，不是插槽**：环上第一位这轮没被选中时，第二位立刻发牌，**绝不等他**。
- **一根棒子**：同一间房任一时刻最多一条 outstanding 的 relay 激活。两头都要守 —— 传棒侧（`turn.ts`）与起棒侧（`queue.ts`），只守一头就会出现两根棒子同时跑。
- **@ 抢棒不认自己**：一个人在发言里 @ 了自己，棒子不能原地不动。
- **单人环不是接力**：`waves.length <= 1 && cycle` 会永动到撞链闸。
- **静默排在圈数之前**：全员没话说时静静收尾，不该宣布「我按住了」——他们既没轮满也没被按住。

### 2.2 状态条（`inspector.ts` / `coordinator-status.ts`）

- **不新增一份账**：在跑读 `activeTurns`、排队读 `queue`、判定读 `judgements`、闸读 `chainCount`/预算缓存。唯一新增的数据是「刚才」那条**进程内环形缓冲**（≤32 条，不落盘）。
- **不限的闸序列化成 `0` 而不是 `Infinity`** —— 后者过不了 JSON，到界面上是个静默的谎。
- **广播按秒节流但不丢最后一帧**：窗口里的多次推送攒成尾发，最后那次通常正是"停下来了"。
- **失败必须分得开**：判定的 `outcome` 有六种（`yes/no/unparsable/timeout/unresolved/aborted/error`）。把失败折进"不说"是这块面板存在的理由所要反对的事。

### 2.3 waves 编排（`plan.ts` / `planner.ts` / `plan-runner.ts`）

- **一间房一份在飞的编排**（`planTicket` 排队号 + `planId` 身份）。
- **epoch 在发起那一刻取，不是回来那一刻** —— 编排调用 2–12s，期间用户可能喊了停。
- **批推进只认本批的 `planId` 记录** —— 否则一条任务事件跑完就能把编排推进一批。
- **批间严格串行、批内并行**：一批全部落地才发下一批（这是"后说的人读得到前面的话"的唯一保证），批内受 `maxConcurrentTurns` 约束。
- **被 @ 的人一定在编排里**：代码强制补进第一批，不靠模型注意力。
- **`waves: []` 是有效答案（读懂了的沉默），解析失败才降级** —— 但「排了人却一个都认不出」算失败。
- **降级路径不退役**：编排要不到就回落 N 路意愿判定，行为与改动前一模一样。

---

## 3. 已经审过什么（**不要重复**）

跑过两轮对抗审查（多视角找 → 逐条独立验真、默认判伪）：

| 轮 | 初查 | 验真存活 | 已修 |
| --- | --- | --- | --- |
| waves 落地后 | 22 | 21（7 high） | 13 |
| 仲裁者上下文落地后 | 19 | 16（7 high） | 15 |

**修掉的代表性缺陷**（细节在两份设计文档与代码注释里）：

- 喊停停不掉在飞的编排（epoch 在 await 之后才读）
- 并发两条消息 → 两份编排同时装上，第一批是并集
- 游标写在**全量转录**、读在**投影子集** → 找不到就静默"整段历史全给"
- 「落后 N 条」与 `<history>` 两把尺子（一个数原始消息、一个印投影行）
- 编排调用没过预算闸
- `getCollabSelfTaskFacts` 每位成员一次全盘读盘（注释里却写着"零 I/O"）
- 人类消息里的 `</history>` 未转义 —— 一条真能打出来的注入路径
- 模型排了人但一个都认不出 → 被当合法沉默，整条消息静默吞掉

**未修的**（判定为下游症状或既有问题）：waves 之前就存在的链长闸批内预占问题、句柄抄错行的静默换人（既有容错的固有取舍）、roster 占 user 段配比（等真机）。

---

## 4. 建议你重点看这几处

按我自己的不放心程度排序：

1. **`queue.ts` 的 `processQueue`** —— 批推进那一段（`tasks.size === 0` 的分支）。它同时管着编排推进、park、重入，是整个改动里最密的一块。前一轮审查在这里抓到两条 high。
2. **`plan.ts` 的 `buildCollabPlanWindow`** —— 三层边界（未读并集起点 / backdrop 下限 / 预算上限 + 折叠头）。我在修审查缺陷时**自己引入过一次回归**（游标在末尾时退化成整段给），说明这段的边界很容易写错。
3. **`turn.ts` 的回合收尾** —— `livePlanTurn` 的判据、`turnClean`、@ 提批。它与 v3 那条线的改动在同一个函数里。
4. **降级路径**：`responseMode` 未配 = 并行（老路）。请确认**缺省行为与改动前逐字一致** —— 这是这次改动最重要的安全网。
5. **真机行为**：见 §6，一次都没跑过。

---

## 5. 顺手修的两个旧 bug（不在原计划里）

1. **`maxConcurrentTurns` 在桌面端从来没生效过** —— `apps/electron/src/main/ipc/collab.ts` 的 budgets 中转逐字段抄，从并行化那天起就漏了这一格。类型有、app 层认、UI 一填就静默丢。
2. **所有旁路模型调用整类不记账** —— `providers/agent-turn.ts` 的 `generateWithOnethingDeepSeekAgent` 返回值漏了 `usage`（兄弟函数一直带着），于是走 deepseek generate 的判定/标题/摘要在用量账本上一条记录都没有。真机核对：`~/.onething/usage/usage-2026-08.jsonl` 里 420 条全是 `collab-room`，`collab-willingness` 零条。

两条都补了测试。**这类"逐字段抄，漏一层就静默丢"在这个仓库里反复出现**——我自己在 `enqueue` 里也栽了一次（漏抄 `planId`，编排永远推不动且不报错）。审查时值得专门扫一遍。

---

## 6. 已知未做

1. **真机走查 —— 零。** 三个功能全部只有测试背书，一次没起过 dev。**上一次真机接触（用户贴出「判定 3 人 → 都没接话」）当场照出了一个两轮审查都没看见的缺口**，所以这一条不是形式主义。
2. **`auto` 没有翻默认**（刻意，见 plan 文档 §5bis 一）。要试得在房间设置里手动选「智能」。
3. **`collab-speaking-order.md` P2 未做**：其中 `<speaking_order>` 那半条已被 waves 架空，建议标为"被后续设计取代"；**冷却过滤跑在 persona 之前**（让"主持人/记录员"类角色被结构静默）那半条仍是真欠账。
4. **agent 缺一个短参与规则字段**：现在 `description` 临时顶着"调度时该怎么用这个人"这个位置，而真机上在用的四位同事 `description` 全空 —— 花名册只能退回取 persona 开头节选。

---

## 7. 跑起来

```bash
bun run typecheck            # 干净
bun run test                 # 6318 passed / 0 failed (2026-08-02)
bun run boundary:gate        # 26 known, none new
bun run lint                 # 改动文件零警告
```

**测试可能出现的假红**：跑全量时如果撞上另一个 session 正在改 `collab/index.ts` 或它导出的模块，所有 barrel 消费者会集体炸掉（本次遇到过一次 106 红）。**单独重跑受影响的文件确认**，别急着修。

---

## 8. 快速上手：一条消息的完整链路

```
用户消息 → ingress(只落库,不起流) → bus 'message:user-created'
  → queue.handleRoomUserMessage
      ├─ wake 路由(drop/abort/steer/engage)
      ├─ 链闸与编排计数归零
      ├─ decideCollabActivations(冻结门 / @ 短路 / dm 免判)
      └─ isCollabPlanRoom ?
           ├─ 是 → 预算闸 → 领 planTicket → 记 epoch
           │        → resolveCollabPlan(强制顺序本地合成 / auto 问协调器)
           │        → 回来比对 ticket+epoch → 装上 plan → 发 waves[0]
           └─ 否 → N 路意愿判定(老路)
  → processQueue 发牌(并发上限;批内并行)
      → 一批全部落地 → stepCollabPlan → 发下一批 → … → 终止
  → turn.driveActivation(冻结/预算/链闸/退休门/未读闸 → agent 锁 → drive)
      → 引擎起流 → 模型调 `say` 才有人听见
      → 收尾:记 waveSpoke / @ 提批 / turnClean
```

状态条（`inspector.ts`）在这条链的十来个点上记一笔 `noteCollabSchedule`，节流广播给右栏。
