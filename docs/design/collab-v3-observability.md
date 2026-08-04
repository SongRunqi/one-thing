# Collab v3 观测体系（D8）：从抓瞎到全知

日期：2026-08-03。状态：**O0-O3 已实施**（O0=`a27fb2a7`、O1=`c16f1e44`、O2+O3=`1d51776f`；真机走查见 `docs/audit/collab-v3-observability-walkthrough-2026-08-03.md` OB1-OB14，待用户执行）。
前置：Actor v3 D0-D7 已落地（`676e20d7..74925b98`）。
动机：v3 把世界改成了 agent 中心（一个大脑、租约、mailbox、子 actor），但观测面还是 v2 遗留的房间中心词汇表——「发言中」实际是「持牌」、「排队中」分不清四种原因、大脑在哪间房忙/邮箱积压/工作卡/死信完全不可见。本方案补全整个观测体系，**不是最小可用**：目标是用户在任何时刻能回答三个现在问题和一个刚才问题。

---

## 0. 目标与反目标

**四个必答问题**（验收标准，缺一即不合格）：

1. **这间房现在怎么了？**——谁持牌（真在生成还是等大脑）、谁举手（卡在哪道闸）、裁决窗在什么状态、三闸读数。
2. **这个人现在在干嘛？**——大脑在哪间房思考/空闲、持有哪些房的牌、邮箱积压多少、手上几张工作卡、最近一次开口是何时。
3. **整个系统在忙什么？**——所有活跃房 × 所有 agent 的一屏总览，在飞 LLM 调用总数（对话+裁决+工作），死信计数。
4. **刚才为什么是那样？**——可回查的调度时间线：这条消息之后谁举了手、裁决给出了什么排序和理由、牌发给了谁、谁被哪道闸拦了、有没有事件处理失败进了死信。

**反目标**：不引数据库（仓库纪律：Electron 主进程无 DB，文件账本即可）；不做指标平台/图表（这是产品内诊断面，不是 Grafana）；不加第二本账（renderer 单一账本纪律沿用 C4——所有 UI 状态从快照派生，事件只是触发器）。

## 1. 信息模型：三视角 + 一时间轴

```
┌─ 房间视角（升级现有）──────────┐  ┌─ Agent 视角（全新）────────────┐
│ 租约表: 持有人/原因/时长/epoch │  │ mind: idle | thinking(roomId)   │
│   └ 每张牌: 生成中? 等大脑?    │  │ heldLeases: [{roomId, since}]   │
│ 举手队列: 原因 + blockedBy     │  │ inbox: {depth, oldestAt, 最近5} │
│ 裁决窗: 防抖/在飞/降级 + 耗时  │  │ workers: [{cardId,status,起始}] │
│ 三闸: 链/并发/预算 读数        │  │ lastSpokeAt / deadLetters 计数  │
│ 相位: 当前相 + 挂起的手        │  └─────────────────────────────────┘
└────────────────────────────────┘
┌─ 系统视角（全新）──────────────────────────────────────────────────┐
│ 活跃房清单×agent 矩阵;在飞 LLM 调用总数(对话/裁决/工作三色);        │
│ 全局工作槽 4 之占用;死信总数;mailbox 积压 top                        │
└────────────────────────────────────────────────────────────────────┘
┌─ 时间轴（全新,落盘可回查）─────────────────────────────────────────┐
│ scheduler-log.jsonl: posted/hand/judge/grant/block/speak/yield/     │
│ degrade/phase/worker/dead-letter …… 每条带因果引用                  │
└────────────────────────────────────────────────────────────────────┘
```

**关键区分（本方案的词汇表修正）**：

| 状态 | 判据 | 今天显示成什么 |
| --- | --- | --- |
| **生成中** | turn-context 登记簿有该 (agent×房) 的在飞回合 | 「发言中」（对） |
| **持牌等大脑** | 持有效租约 但登记簿无在飞回合（floor-granted 还在 mailbox 排队） | 「发言中」（**错，v3 特有状态**） |
| **举手-裁决中** | 在 hands 且 judgment.state=pending | 「排队中」 |
| **举手-等座位** | 裁决已过/直通 但 leases.length ≥ maxConcurrent | 「排队中」 |
| **举手-链闸挂起** | chainCount ≥ cap | 「排队中」 |
| **举手-相位挂起** | phase 策略且本房/本人不在活跃相 | 「排队中」 |

## 2. 数据源盘点

| 数据 | 位置 | 现状 |
| --- | --- | --- |
| 租约表/举手/三闸/裁决窗/相位 | 房间账 `collab/<roomId>/actors/room.json` | ✅ 已进 coordinator 快照，缺 blockedBy 判据与裁决三态 |
| 真·在飞回合 | turn-context 登记簿（engine-mind-port 登记） | ✅ 存在，**零广播** |
| mind 忙闲/当前房 | AgentActor 循环状态 + 登记簿 | 内存态，零广播 |
| mailbox 深度/最旧事件 | `agents-v3/<id>/inbox.jsonl` + cursor | 落盘，零广播零读口 |
| workers 子清单 | agent 账 state.json | ✅ 有读口（hasActiveCollabV3Work），零展示 |
| 裁决过程（候选/排序/理由/耗时/降级） | referee-judge 内部 | 用完即弃——**qm P2-8 的账本落盘一直没做** |
| 死信 | ActorBase dead-letter 环 | 内存环，**无人消费**——事件处理抛错时系统静默变哑，这是「抓瞎」的最大来源 |
| 「刚才」schedule log | inspector 内存环 ≤32 条 | 有 UI，不落盘、重启即失忆 |
| typing | typing-observer（参数流物理信号） | ✅ 保留不动，作为「生成中」的低延迟佐证 |

## 3. 契约设计

### 3.1 新事件：`collab:agent-changed`（agent 快照，全量小快照哲学）

```ts
interface CollabAgentActivitySnapshot {
  agentId: string
  seq: number                    // 每 agent 单调,发射时 +1(C4 纪律)
  at: number
  mind: { state: 'idle' } | { state: 'thinking'; roomSessionId: string; since: number }
  heldLeases: Array<{ roomSessionId: string; leaseId: string; since: number; executing: boolean }>
  inbox: { depth: number; oldestAt?: number }
  workers: Array<{ cardId: string; roomSessionId: string; status: 'running'|'done'|'interrupted'; since: number }>
  lastSpokeAt?: number
  deadLetterCount: number        // 只增计数;详情走时间轴
}
```

发射点（全部现成数据，只加发射）：心智循环取批/回合起止（AgentActor）、租约得失（floor-granted/revoked/yield 消费时）、mailbox append/ack、worker spawn/result、死信入环。节流沿用 C4 双档（活动转变 120ms / 普通 1s，同一待发槽）。GET 补水口：`collab:agent-activity-get`（invoke，冷启动/履历页打开时拉一次）。

### 3.2 房间快照升级（`CollabCoordinatorState` 扩展，向后兼容只加字段）

```ts
turns: Array<{ …现有…; executing: boolean }>          // 持牌是否真在生成(联 turn-context)
queue: Array<{ …现有…; blockedBy: 'judging'|'seats'|'chain'|'phase'|'frozen'|'budget' }>
judgment: { state: 'idle' } | { state: 'debouncing'; opensAt: number }
        | { state: 'inflight'; candidates: string[]; since: number }
        | { state: 'degraded'; reason: string; at: number }   // 降级 FIFO 要亮牌
phase?: { name: string; activeRooms?: string[]; suspendedHands: number }
deadLetterCount: number
```

`blockedBy` 是快照组装时现算的判据（房间账全有素材），不落账——它是解释不是状态。

### 3.3 调度时间轴：`collab/<roomId>/actors/scheduler-log.jsonl`（qm P2-8 落地）

追加写 JSONL，每行一个事件，**带因果引用**（triggeredBy: 消息 id / 裁决 token / 租约 id），类型枚举：

```
posted | hand(agentId, reason) | judge-open(candidates) | judge-verdict(order[], why, elapsedMs, model)
| judge-degraded(reason) | grant(agentId, leaseId, reason) | gate-block(agentId, gate)
| speak(agentId, messageId) | yield(leaseId) | revoke(leaseId, cause) | phase(name)
| worker-spawn(cardId) | worker-result(cardId, outcome) | dead-letter(actor, eventType, error 首行)
```

- 写入点收敛在房间账转换处与 AgentActor 死信处（单点纪律：谁转换状态谁记账）。
- 轮转：按日切文件（`scheduler-log-2026-08-03.jsonl`），保留最近 14 天，启动时清老（与 usage 账本同款做法，不引 DB）。
- 裁决行必须带 `why` 与 `elapsedMs`——「刚才为什么没人理我」从猜变成查，且未来换裁决算法有对照数据（qm 文档当年就指出没有账本就无法对比算法）。
- 死信行带错误首行与事件类型——**事件处理失败从静默变可查**。inspector 的内存「刚才」环保留为 UI 快读，落盘账本是完整版。

### 3.4 死信策略（从环到闭环）

ActorBase 死信环 → 三路出口：①计数进两级快照（agent + 房间）→ UI 红点；②详情进时间轴账本；③进程 console.warn 一次（首错闩锁风格，不刷屏）。死信不自动重放（重放语义由各 actor 幂等层兜，人工诊断后重启自愈）。

## 4. UI 设计

### 4.1 状态条（CoordinatorStatusBar）——改词与细分

- 「发言中 N」→ **「持牌 N · 生成中 M」**（M 从 turns[].executing 数）；M<N 时持牌未执行者名字后缀「（在别处思考）」。
- 「N 人排队中」→ 徽标细分：`裁决中`（含防抖倒计时点）/`等座位`/`链闸`/`相位挂起`/`冻结`/`预算`——hover 显示 blockedBy 明细行。
- 裁决窗三态显示：防抖（虚点）→ 在飞（转圈+候选头像）→ 降级（黄牌「裁决降级：FIFO」）。
- 死信红点：deadLetterCount>0 时状态条尾部红点，点击跳时间轴过滤 dead-letter。

### 4.2 房间后台面板（RoomBackstagePanel）——新增「调度」页

- 租约表：持有人/授牌原因/持有时长/executing 状态/epoch；每行可操作「撤牌」（走既有 revoke）。
- 举手队列：人/原因/卡在哪道闸/举手时长。
- 裁决卡片：当前窗状态 + **最近一次裁决的完整回放**（候选、排序、why、耗时、用的模型）——直接读时间轴尾部的 judge-verdict 行。
- 时间轴视图：scheduler-log 尾部 N 条，按类型着色，triggeredBy 可点击跳转到房间消息。

### 4.3 Agent 空间——新增「大脑」面板（AgentSpace 一个 tab）

- 大脑状态大字：空闲 / 正在「房名」思考（时长）/ 等待中（持 N 张牌）。
- 持牌清单（房名+时长+是否执行中）。
- 邮箱：积压深度 + 最旧事件时间 + 最近 5 条事件类型（不带正文——保密纪律沿用）。
- 工作卡：running/done/interrupted 各卡状态与时长；卡片可点跳看板。
- notebook 尾部窗（已有 notebook 数据，顺带展示）。
- 死信计数 + 跳转。

### 4.4 成员条（RoomMemberStrip）——头像徽标

四态徽标（读 agent 快照派生，单一账本）：🟢 生成中 / 🟡 持牌等大脑 / 🔵 干活中（有 running 卡）/ 无徽标=空闲。替换现在「从看板 doing 卡现算在忙」的旧口径（C4 审查里那个「四口径」问题的最后一块收口）。

### 4.5 系统总览（workbench 新页「调度总览」）

- 上半：活跃房卡片流（每房一行：持牌/举手/裁决态/三闸迷你条）。
- 下半：agent 矩阵（每人一行：大脑状态/持牌数/邮箱深度/工作卡数/死信）。
- 顶部三数字：在飞 LLM 调用总数（对话/裁决/工作三色）、全局工作槽 4 的占用、死信总数。

### 4.6 renderer 数据层

collabBoard store 新增 `agents: Record<agentId, CollabAgentActivitySnapshot>`（seq 去序 + 冷启动 GET 补水 + TTL 陈旧兜底，与 coordinators 完全同款）；全部 UI 从这两本快照账派生，**不新增任何事件±记账**。

## 5. 诊断 CLI：`scripts/collab-v3-inspect.mjs`（只读，bun 运行）

```
bun scripts/collab-v3-inspect.mjs                    # 系统总览(所有房+所有 agent 一屏)
  --room <id|名字>                                   # 单房:账+租约+举手+时间轴尾 20 条
  --agent <id|名字>                                  # 单人:大脑/邮箱/持牌/workers/死信
  --tail <n> [--type judge|grant|dead-letter…]       # 时间轴过滤回放
  --dead-letters                                     # 全部死信详情
  --json                                             # 机器可读(给未来的自动化)
```

读账文件与时间轴，不经进程——**app 挂了也能查**（抓瞎最惨的时刻恰恰是进程不对劲的时刻）。

## 6. 分期总览

| 期 | 主题 | 内容 | 量级 |
| --- | --- | --- | --- |
| **O0** | 契约与账本 | agent 快照类型/房间快照扩字段（shared+keyof 穷尽）、scheduler-log 写入面+轮转、死信三路出口 | 1-1.5 天 |
| **O1** | 发射与补水 | agent 快照发射点全套+双档节流+GET 通道、房间快照 executing/blockedBy/judgment 三态供数 | 1 天 |
| **O2** | UI 四面 | 状态条改词细分、房间后台「调度」页、Agent 空间「大脑」面板、成员条徽标、调度总览页、collabBoard agents 账 | 2-2.5 天 |
| **O3** | CLI 与走查 | inspect CLI、时间轴 UI 视图、走查清单（含「四个必答问题」实测）+ v3 走查 V 系列交叉引用 | 1 天 |

依赖：O0→O1→O2 串行，O3 的 CLI 可与 O2 并行。合计 5-6 天量级。

## 7. 纪律与性能

- 快照节流沿用 C4 双档；agent 快照按 agent 独立节流槽（一个话痨不拖累别人的刷新）。
- 时间轴追加写不 fsync 每行（与转录同级耐久即可——它是诊断不是账；真账仍在 room.json）。
- mailbox depth 读取用游标差（O(1)），不数文件行。
- 保密纪律贯穿：agent 快照与时间轴**永不携带消息正文**（事件类型+id 引用；正文只在房间转录里，按成员表可见性走）。
- web/server：快照事件天然过 SSE；GET 通道进 server 路由随 collab parity 一并（不阻塞本期，desktop 先行）。
