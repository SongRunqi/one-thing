# 协调器状态条 —— 把调度过程变成看得见的东西

状态：**已实施**（2026-08-02）· §8 三件亦已落地
日期：2026-08-02
视觉稿：`docs/design/im-redesign/coordinator-inspector.html`
前置：`collab-speaking-order.md`（并行/接力两种模式）、`qm-collab-learnings.md`（P2-8 判定账本 / §3 弱项 5「判定不可诊断」）、`im-redesign/right-panel.html`（右栏背台的分段器与视觉语汇）

房间里最贵、最不可见的一步是**调度**：一条消息进来之后，谁被问了、谁答了不说、谁排在队里、卡在哪道闸上——全部发生在用户看不见的地方。今天能看见的只有结果（有人说话 / 没人说话），而「刚才为什么没人理我」只能猜。

这份设计把协调器的运行时状态画进右栏的**线程**格。

---

## 1. 为什么放在「线程」，而不是新开一格

线程格回答的问题是「这间房正在发生什么」——执行会话列表、谁在跑、跑了多久。协调器是那件事的**发动机**：它决定了列表里为什么是这几条、为什么现在没有新的。

分开放要付两次代价：右栏的固定三格是 `right-panel.html` 立下的结构纪律（等宽、无 ✕、标题永不变），加第四格就把那条纪律破了；而且用户会在两个视图之间来回对照——「协调器说 Iris 排队了，那她的线程呢」。

放在同一面，**这个对照变成一次点击**：状态里的「阿般正在说」直接下钻到阿般的执行会话，与下面列表里的那一行是同一个靶子。

---

## 2. 形态

```
┌─────────────────────────────┐
│ ● 阿般 正在说      顺序·6棒 ⌄│  ← 常驻条(32px,永远在)
├─────────────────────────────┤
│ 现在                         │
│ ▶ 阿般   轮到发言      0:12  │  ← 悬停时计时换成「停」
│ ○ 小李   被 @ 激活     0:04  │
│ 接力                         │
│ 阿般 › 小李 › Iris › 老丁    │  ← 持棒者上墨加粗
│ 第 6 棒 · 第 2 圈      不限圈│
│ 闸                           │
│ 连续发言 ▁▁▃▁▁▁▁▁     7/32  │
│ 今日花费 ▃▃▃▃▃▃▁▁  $4.21/5  │  ← 逼近上限转橙
│ 刚才                         │
│ 0:12  传棒 → 阿般            │
│ 0:31  老丁 说了 1 句          │
│ 0:48  Iris 没说话            │
│ 1:02  收到你的消息            │
├─────────────────────────────┤
│ 正在跑                       │  ← 既有的线程列表,一个像素不动
│ (头像) 阿般  服务房间对话 12s │
└─────────────────────────────┘
```

**常驻条永远在。** 空闲也是状态——「现在没人在动」正是用户来这一格要确认的事。一行说清此刻卡在哪儿：`空闲` / `N 人在判断要不要接话` / `阿般 正在说` / `已按住 · 连聊 32 条` / `已暂停 · 队列已清空`。右端恒为模式（并行 / 顺序）加一个关键数字。

**撞闸与暂停把动作直接放在条上**（`恢复`），不必展开——那两种状态用户唯一想做的事就是解开它。

四段展开体，按「此刻 → 规则 → 历史」排：

| 段 | 内容 | 数据来源（全部现成） |
| --- | --- | --- |
| 现在 | 在跑的回合、排队的激活、在飞的意愿判定 | `runtime.activeTurns` / `runtime.queue` / `runtime.judgements` |
| 接力 | 环、持棒者、第几棒第几圈（**仅顺序模式**） | `buildCollabRelayRing` + `state.relayBatons` |
| 闸 | 连续发言、同时发言、今日花费 | `state.chainCount` + `maxChainFor` / `maxConcurrentTurnsFor` / 用量账本 |
| 刚才 | 最近 8 条调度事件 | 新增：进程内环形缓冲（§4） |

---

## 3. 三条设计纪律

### 一、不新增一份账

在跑读 `runtime.activeTurns`，排队读 `runtime.queue`，判定在飞读 `runtime.judgements.size`，闸读 `chainCount` / 预算账本 / `relayBatons`。协调器已经握着全部真相，这一面只是把它画出来。

任何"为了显示而记的第二本账"都会先于真相腐烂——这条在这个仓库里有案底（W7 之后的三个 workbench 纯逻辑文件，头注释里都写着同一句）。

### 二、计数只在这一面出现

右栏其余各处的纪律是**只说有没有，不说几个**（分段器的状态点、侧栏未读点）。理由是系统只知道"有没有"，编个数字比不显示更糟。

这一面是**唯一的例外**，而且是刻意的：`7/32`、`第 6 棒`、`$4.21/5` 恰恰是用户来这儿要看的东西，它们也都是系统真正知道的精确值。但一律 tabular mono、右对齐——它们是仪表读数，不是文案。

### 三、每一行都能点进去

- 正在说的那位 → 下钻到它的执行会话（复用线程列表既有的 `openThread`）
- 悬停在跑的行 → 「停」（复用 `abortRoomTurn`，与房头停止按钮同一个入口）
- 悬停排队的行 → 「撤」（丢弃这条激活）
- 撞闸的那一格 → 打开房间设置的对应格子

一个只能看不能动的状态面板，第二天就没人看了。

---

## 4. 「刚才」：一条进程内的调度事件流

这是本设计**唯一新增的数据**，也是最有价值的一格：「3 分钟前判定 4 人 → 都没接话」就是"刚才为什么没人理我"的答案。

- **形态**：每间房一个定长环形缓冲（≤32 条），只活在内存里，**不落盘**。落盘账本是 `qm-collab-learnings` 的 P2-8，那件事的目的是换判定算法时能对照效果，与"让用户看见"不是同一件事，不必绑在一起做。
- **事件**（都是调度动作，不是消息）：`收到消息` / `判定 N 人` / `判定 N 人 → M 人接话` / `起棒 → X` / `传棒 → X` / `X 说了 N 句` / `X 没说话` / `按住(链/预算/圈数)` / `喊停清场`。
- **广播**：跟着状态快照一起走（§5），不单独开一条通道。

进程重启后这一格是空的，而且**应该**是空的——它说的是"刚才"，而重启之后没有刚才。

---

## 5. 数据通道

逐字照抄看板那条已经跑通的链路（`collab:board-changed` + `COLLAB_BOARD_GET`），不发明新形态：

```ts
// packages/shared/ipc/collab.ts
interface CollabCoordinatorState {
  roomSessionId: string
  mode: 'parallel' | 'serial'
  frozen: boolean
  turns: Array<{ agentId: string; reason: CollabActivationReason; startedAt: number }>
  queue: Array<{ id: string; agentId: string; reason: CollabActivationReason }>
  /** 在飞的意愿判定轮数(并行模式);0 = 没有 */
  judging: number
  gates: {
    chain: { count: number; max: number }          // max 0 = 不限
    concurrency: { active: number; max: number }
    budget: { spentTodayUSD: number; capUSD: number }
  }
  /** 仅顺序模式 */
  relay: { ring: string[]; holder: string; batons: number; loops: number } | null
  log: Array<{ at: number; kind: string; agentId?: string; count?: number }>
}
```

- **冷启动**：`COLLAB_COORDINATOR_GET`（IPC）
- **实时**：`collab:coordinator-changed` 会话事件，带完整快照（它很小，且省掉了增量合并这一整类 bug——与看板同一条理由）
- **节流**：状态每秒最多广播一次；「跑了多久」那种连续量由渲染层自己走秒（线程列表已经有一个 60s 的 `now` tick，这里换成 1s 的），后端不为计时广播

写在哪：`app/collab/inspector.ts`（快照组装 + 环形缓冲 + 节流广播），协调器各处在状态变化点调一次 `noteCollabSchedule(...)`。

---

## 6. 落点

| 层 | 文件 |
| --- | --- |
| 契约 | `packages/shared/ipc/collab.ts`（状态类型 + 请求/响应）、`channels.ts`、`events/session-events.ts` |
| 装配 | `app/collab/inspector.ts`（新）；`queue.ts` / `turn.ts` / `coordinator.ts` 的状态变化点各加一行 `note*` |
| IPC | `apps/electron/src/main/ipc/collab.ts` → preload → `renderer/types` |
| 纯逻辑 | `renderer/components/workbench/coordinator-status.ts`（新）：快照 → 常驻条那一句、四段的行、闸的百分比与告警阈值 |
| 呈现 | `renderer/components/workbench/CoordinatorStatusBar.vue`（新），挂在 `RoomThreadsWorkbench` 的列表层顶部 |
| store | `stores/collabBoard.ts` 已经在订阅会话事件，加一个分支即可（不新开 store） |

**只在列表层显示**：下钻到某条线程详情时状态条收起——那一层是一个会话的内部，不是房间的调度。

---

## 7. 明确不做

- **不落盘**。见 §4。
- **不做第四个分段格**。见 §1。
- **不显示每位成员的判定明细**（"阿般说了 no"）。判定回复是一个 64 token 的 JSON，把它逐条摊开会让这一面从"状态"变成"日志"，而且那是 P2-8 落盘账本该做的事。这里只给聚合：`判定 4 人 → 1 人接话`。
- **不给"手动指定下一位发言"的按钮**。它听起来顺手，但那是给用户一根凌驾于调度之上的杆子——顺序模式的次序表才是表达这件事的地方，两处都能定就会有两处打架。

---

## 8. 让判定说出「为什么没人接话」（2026-08-02 真机发现 → **当天落地**）

真机第一条消息就把这一面的缺口照出来了。面板给的是：

```
判定 3 人 → 都没接话
```

而这句话**答不了它自己提的问题**。`judgeOne`（`app/collab/willingness-runner.ts`）把所有失败模式塌缩成同一个 `SILENT`：provider/model 解析不出来、鉴权拿不到、8s 死线到了、回复解析不了、模型真答了 `false` —— 五种情况在界面上一模一样。而「它们不想说」和「这条链断了」是两件完全不同的事，一件不用管，一件必须修。

§7 里写的「不显示每位成员的判定明细」这一条要收窄：**聚合计数没问题，把失败折进"不说"不行。**

三件一起做（同一块代码），**全部已实施**：

1. ✅ **判定返回理由**。`judgeOne` 的返回值从 `CollabWillingnessVerdict` 扩成带 `outcome: 'yes' | 'no' | 'timeout' | 'unresolved' | 'unparsable' | 'aborted'`；`judged` 日志条带上分布，面板印成 `判定 3 人 → 都没接话（2 超时 · 1 说不）`。
2. ✅ **候选面进快照**。`electWillingSpeakers` 开轮时把候选 id 记进 runtime（`judgements` 现在只是一组 `AbortController`，不带候选），`judgingAgentIds` 才填得上。**在此之前 `buildCoordinatorBar` 里那句「N 人在判断要不要接话」是够不着的死分支**（它的兜底「正在判断谁接话」才是实际会出现的那句），连带那条测试也测的是一个生产中不会发生的状态。
3. ✅ **补上判定计费**。查到的根因是 `generateWithOnethingDeepSeekAgent` 的返回值漏了 `usage`（兄弟函数 `runOnethingUtilityAgentTurn` 一直带着），于是走 deepseek generate 那条路的**所有旁路调用**（判定、标题、摘要）整类从账本消失。补一行 `usage: turn.usage` 修好。**这也推翻了当时的一个推断**：判定其实一直在跑，只是不记账。原文如下 —— `~/.onething/usage/usage-2026-08.jsonl` 里 420 条记录全是 `collab-room`，`collab-willingness` **一条都没有** —— 从这个标签存在至今。要么调用根本没发出去，要么 `onUsage` 在这条链路上没触发；前者是功能 bug，后者是账目 bug。第 1 条落地之后它会自己说出是哪个。无论哪种，「今日花费」那道闸一直在漏算判定开销。
