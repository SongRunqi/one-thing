# Collab v3：Actor 运行时（大版本 break）

日期：2026-08-03。状态：**D0-D7 已实施（D7 真机走查待用户执行）**。实施勘误见 §9；走查清单见 `docs/audit/collab-v3-walkthrough-2026-08-03.md`。
决策来源：用户拍板三项——①彻底 Actor 运行时（连调度一起重造，无中心 coordinator）②现有数据完整迁移③直接替换（不留双轨）。
前置：C0-C5 收敛已落地（`2bb5dfe2..78882a9e`）——本方案大量消费收敛出来的单点，见 §5。

---

## 0. 一句话

**把「agent」从房间的附属品提升为系统的一等主体**：每个 agent 是一个带持久 mailbox 的 actor，全局只有一个心智循环；房间退化为纯消息通道 + 发言权仲裁者；编排/接力/意愿判定全部重造为 actor 之间的协议动词（举手/发牌/让位/换相）。旧的 coordinator/queue/turn/worker 调度链整层删除。

## 0.1 三个边界的重新划分（本方案的宪法）

v2 的教训：可见性、执行、知识三个边界必须**分开治理**，合并任何两个都会出事故。v3 的划分：

| 边界 | 归谁 | v3 形态 |
| --- | --- | --- |
| **可见性**（谁看得到什么消息） | RoomActor 成员表 | 不变——room 是且仅是可见性边界 |
| **执行**（谁在替这个 agent 思考） | AgentActor 心智循环 | **全局唯一**——一个 agent 同一时刻至多一路对话性 LLM 调用（工作子 actor 豁免，见 §2.4） |
| **知识**（这一轮上下文里有什么） | 组装规则 | **分区经历 + 显式笔记**——不是单一交错流（否决理由见 §1.3） |

## 1. 领域模型

### 1.1 Actor 一览

```
UserProxyActor（人类=一个 actor,ingress 即它向房间投递）
      │ post
      ▼
RoomActor（每房一个:转录/成员/发言权/闸账）
      │ broadcast: posted/floor-granted/phase-changed/…
      ▼
AgentActor（每 agent 一个:mailbox+单心智循环+分区经历+笔记）
      │ raise-hand / speak / yield / dm-open / wake
      ▼（重活委托）
WorkerChildActor（每卡一个,短命,结果回投父 mailbox）

RefereeActor（可选,每房或每局:相位控制/发言策略——它只是一个带特权动词的参与者）
```

### 1.2 AgentActor：一个大脑，多本相册，一本笔记

```
agents-v3/<agentId>/
  inbox.jsonl          # 持久 mailbox:全部寻址到我的事件(任何房)
  inbox.cursor         # 消费游标(账,同步原子写)
  notebook.md          # 跨房私人笔记:仅 notebook 工具显式写入,注入有预算上限
  state.json           # 账:两水位/折叠缓冲/举手/租约(不存转录)
```

> **实施勘误（D2，2026-08-03）**：分区经历流不再另建 `rooms/<roomId>.jsonl`——
> **经历流 = 既有的 per-(agent×房) ChatSession**（`agent-exec-<agentId>-<roomId>`，
> id 与格式不变），AgentActor 经 MindPort 只认它的 id。理由：引擎（流式/工具/权限/
> 履历页）全按 ChatSession 工作，保留它 = 引擎零改造 + 经历零迁移；§4 第 2 条随之
> 作废，D5 迁移面缩小为 mailbox 初始化 + 游标映射 + 房间账。

- **单心智循环**：`for await (batch of mailbox)`，严格串行——同一时刻全局至多一路对话性 LLM 调用代表这个 agent。跨房自相矛盾从结构上消失。
- **一次回合的上下文组装**：persona + notebook + 当前房经历流（全量/窗口）+ **mailbox 折叠信封**（其他房在窗口期发生的事，只有信封没有正文——v2 的 elsewhere 块在 v3 是 mailbox 的自然折叠，不再需要独立扫描器）。
- **回合期间**：同房新 posted 事件在工具边界注入（v2 steer 机制保留，但注入目标唯一——不再广播复制）；他房事件只是排队。

### 1.3 为什么不是单一交错心智流（One Mind）

三条一票否决，写死在这里防止将来翻案时漏掉代价：
1. **自泄**：狼人牌永远在上下文里，LLM 做不到可靠的「知道但不说」——v2 真机反复实证「措辞劝导失效」，不能把保密押在提示词纪律上。分区经历使「秘密进哪个上下文」是组装规则的显式决定。
2. **前缀缓存**：多房事件交错进一条流 = 每个回合前缀都变，provider 缓存归零。分区流保住每房的稳定前缀。
3. **可重放**：交错流的重放语义（哪些事件构成了那一轮的输入）无法事后重建；分区流 + mailbox 游标可以。

### 1.4 RoomActor：转录 + 发言权 + 三道闸

- **转录**：沿用 `kind='room'` 的 ChatSession jsonl——**零迁移**，UI 层（消息列表/已读水位/通知）不动。
- **发言权（floor）**：房间发 `floor-granted(lease)`，租约带 epoch——agent 只有持有效租约才能 speak；重启后 agent 先验租约再开口（v2 的 drive-guard/floorEpoch 泛化为租约模型）。并发上限 = 同时在外的租约数（maxConcurrentTurns 语义保留）。
- **三道闸归房间**（单点，无第二本账）：冻结、预算、链闸。链计数只有房间一本账（v2 的 live/重放双实现在 v3 消失——链数就是「上一个清零事件以来发出的租约数」，落在房间账里，重放即重算同一规则）。人类 posted 与跨房注入（带标记）清零，沿用 C1 的 `collabChainReset` 分类。
- **广播**：成员 mailbox 逐一投递（at-least-once + 事件 id 幂等，W23 纪律泛化为全协议）。

### 1.5 RefereeActor：调度即策略，策略即参与者

v2 的 planner/plan-runner/speaking-order/willingness-runner 四个代码路径 → v3 的**发言策略**，由 referee 向房间下发：

| v2 | v3 策略 | 说明 |
| --- | --- | --- |
| 并行+意愿判定（每人一调用，O(N)） | `free` + **批量举手裁决** | 一条消息一次裁决调用给全员排序（qm P0-2 借这次 break 落地，O(N)→O(1)） |
| serial 接力 | `ring` | 免判定确定性环，收棒权在配置（保留已拍板决策） |
| auto waves 编排 | `waves` | referee 一次调用出批次，批内并行批间串行 |
| （无） | `phase` | **换相动词**：夜晚只激活狼房、白天只激活群房——狼人杀这类回合制的裁判第一次有了一等表达 |

@ 提及在任何策略下都是**直通授牌**（社交信号即优先级，保留已拍板决策）。referee 缺席时房间用内置 `free` 策略——普通群不需要显式裁判。

### 1.6 WorkerChildActor：一个大脑，多双手

「一个大脑」只约束**对话性**回合。重活（board start）由 AgentActor 派生子 actor：绑一张卡、独立循环、墙钟/上限沿用 v2 work 会话语义、结果以事件回投父 mailbox（父在下一个对话回合自然「知道自己的活干完了」——v2 收养回声机制的泛化）。assign=通知≠开工的决策保留。

## 2. 协议（动词表）

全部动词都是持久事件（事件 id + 幂等消费）。

```
Room → Agent   : posted(envelope) | floor-granted(lease) | floor-revoked(lease)
                 | phase-changed | membership-changed | card-event
Agent → Room   : raise-hand(why?, urgency?) | speak(lease, content, mentions)
                 | yield(lease) | dm-open(peer) | wake(room, peer)
Referee → Room : set-floor-policy(free|ring|waves|phase, params)
User → Room    : posted（经 UserProxyActor;默认 steer 语义保留:在飞回合工具边界注入）
Agent → self   : note(notebook 增量) | spawn-worker(card) | worker-result
```

发送面：`send_message` 仍是唯一发送工具（speak 的工具面形态），say/dm 退役名表、句柄 codec、转义管线、typing 参数流信号全部沿用（C1/C2 资产）。

## 3. 状态与恢复（三面纪律不变）

| 面 | v3 归属 | 耐久性 |
| --- | --- | --- |
| 流 | 各 actor 内存态（在飞租约、循环状态） | 从不恢复，只重驱 |
| 账 | room/state.json（floor/链/水位/成员）、agent/state.json + inbox.cursor | 同步原子写，先于转录 |
| 转录 | 房间 ChatSession + agent 分区经历流 + inbox.jsonl | 追加写 |

崩溃恢复 = 各 actor 独立自愈：房间重放账、agent 从 inbox.cursor 续消费、未验租约作废重发。**没有全局对账器**——v2 的 reconcile 双级去重被「每 actor 自己的游标 + 租约 epoch」取代。

## 4. 迁移（完整迁移，一次性）

1. **房间转录：零迁移**（格式不变，所有权从 coordinator 改到 RoomActor）。看板 board.json 零迁移。
2. **执行会话 → 分区经历流**：`agent-exec-<agentId>-<roomId>` 的 messages.jsonl 移入 `agents-v3/<agentId>/rooms/<roomId>.jsonl`；`collab.seenMessageId` 游标直接映射为该房经历游标。
3. **房间 state.json**：watermark/chainCount/floorEpoch → 新房间账（floorEpoch 映射为租约代数起点）。
4. **mailbox 初始为空**，未读尾巴由（房水位 − agent 游标）回填 posted 事件。
5. **在飞工作会话**：经 board start 续做机制重新领养（既有恢复路径）。
6. **迁移前全量快照 `~/.onething` → 备份目录**；回滚 = 还原快照 + git revert。迁移器带对账输出（每 agent 每房：迁移条数/游标位/校验和）。

## 5. 复用清单：C0-C5 不是沉没成本

收敛出来的单点恰好是 v3 的建材——这是先收敛再 break 的回报：

| C0-C5 资产 | v3 角色 |
| --- | --- |
| `chainGateAllows`/占用视图 | RoomActor 租约发放规则的内核 |
| `collabChainReset` 消息标记 | 协议清零动词的持久形态（直接沿用） |
| say 管线（转义/句柄/mentions/typing） | speak 动词的实现层 |
| `members.ts`/墓碑/`splitCollabHandleQuery`/identity | 原样复用 |
| venue 门 + `profile.ts` 工具面 | AgentActor 回合工具面（venue 表加 actor 语境） |
| C4 快照协议（seq/单一账本/冷启动补水/`session:collab-updated`） | RoomActor→renderer 的状态面**原样复用**——renderer 几乎不改 |
| 收养回声 | worker-result/未发兜底的泛化先例 |
| jsonl 会话存储/store-lock/EventBus ring buffer | mailbox 与经历流的存储与传输层 |
| 18 条真机走查清单 | v3 验收基线（另加 v3 专属条目） |

**整层删除**：coordinator.ts、queue.ts、turn.ts、worker.ts、planner/plan-runner/willingness-runner/speaking-order（重生为 referee 策略）、wake-followup（mailbox 动词）、steer.ts（心智循环内建）、drive-guard（租约）、reconcile（per-actor 自愈）、elsewhere 扫描器（mailbox 折叠）、agent-session/user-dm-room/agent-dm-room 的 ensure 家族（AgentActor 生命周期吸收）。约 8-9k 行。

## 6. 分期总览（先全景后子期,直接替换=D6 一刀切）

| 期 | 主题 | 交付物 | 量级 |
| --- | --- | --- | --- |
| **D0** | Actor 内核 | mailbox(jsonl+游标+幂等)/租约/actor 基类/协议类型进 shared；金重放测试架（旧房转录喂新运行时） | 3-4 天 |
| **D1** | RoomActor | 转录所有权/发言权租约/三闸单账/广播；C4 快照协议接上 | 3-4 天 |
| **D2** | AgentActor | 心智循环/分区经历/上下文组装(含 mailbox 折叠信封)/notebook 工具/steer 注入 | 4-5 天 |
| **D3** | Referee | free(批量举手裁决=qm P0-2)/ring/waves/phase 四策略；狼人杀换相走通 | 3-4 天 |
| **D4** | Worker 委托 | WorkerChildActor/board 集成/墙钟与上限/结果回投 | 2-3 天 |
| **D5** | 迁移器 | exec→经历流/游标/账映射/快照备份/对账输出 | 2-3 天 |
| **D6** | 切换与删除 | 三宿主接线(electron/server/daemon 同一装配)/旧链整层删除/renderer 收尾/Agent 空间加 mailbox+notebook 可视化 | 3-4 天 |
| **D7** | 验收 | 金重放全绿 + 18 条走查 + v3 专属走查(狼人杀全流程/一脑串行/租约跨重启) + unsent 读数 | 2 天 |

合计约 22-31 天量级（Opus 5 子代理实施口径下预计可压缩，但这是 C0-C5 的 3-4 倍体量）。**顺序有依赖**：D0→D1→D2 严格串行（契约先行），D3/D4 可并行，D5 可与 D3/D4 并行，D6 必须最后。

## 7. 风险与对策

1. **直接替换无双轨**——对策：金重放测试架 D0 先建（旧房真实转录作为输入的行为对照）；D7 走查通过前不删旧代码（D6 的删除排在接线验证之后同一期内分两步提交）。
2. **迁移是单向门**——对策：强制快照备份 + 对账输出；迁移器 dry-run 模式先出报告。
3. **批量举手裁决是新模型行为**——对策：策略可配回 per-agent 判定（策略接口保留 v2 等价实现一个，作为对照与降级）。
4. **serial 心智循环的响应性**——对策：mailbox 带优先级（人类消息>@>普通）；work 走子 actor 不占大脑；长回合可被同房 steer。
5. **协议演进**——所有动词进 shared 类型 + keyof 穷尽测试（C3 纪律沿用）。

## 8. 保留的已拍板决策（v3 不推翻）

persona 原文即 system；说话即行动（speak 唯一发送面）；房间消息整条落地不流式；typing=参数流物理信号；结构对抗优于措辞；@=直通授牌；接力收棒权在配置；assign=通知≠开工；用户消息默认 steer；evidence 代码采集。
**有意推翻的**：中心 coordinator（→actor 协议）；per-(agent×房) 执行线程（→单心智循环+分区经历）；O(N) 意愿判定默认（→批量裁决）；reconcile 全局对账（→per-actor 自愈）。

## 9. 实施勘误（2026-08-03）

D0-D6 全部实施完毕，v3 是唯一运行时。逐期一行 + 与本文偏离的地方。**D7 的文档部分（走查清单 + 本节）已交付，真机走查待用户执行**。

### 9.1 逐期落地

| 期 | sha | 落地摘要 |
| --- | --- | --- |
| D0 | `1d8b1749` | Actor 内核：`DurableMailbox`（jsonl 复用会话 codec + 游标原子写，at-least-once，仅 ACK 入去重窗，seq 在写链内分配防空洞，单消费者强制）/ `FloorLease` 纯函数账本 / `ActorBase` 串行循环 + dead-letter 环；15 动词 discriminated union（穷尽性三重保险：双向类型表 + never switch + 运行时清单）；金重放架（合成 fixture 两份，严禁真实数据入库）+ `scripts/collab-v3-replay.mjs` |
| D1 | `34bd57f5` | RoomActor：纯层 `room-rules.ts`（1050 行全纯）+ 装配 `room-account.ts` 原子写 `collab/<roomId>/actors/room.json`（与 v2 `state.json` 隔离）；租约账 / 链账 / 水位 / 相位 / 举手队列 / 广播检查点；C4 快照协议接上 |
| D2 | `2c347844` | AgentActor：心智循环（起了就放手 + `awaitTurnSlot` 串行）/ 双水位（delivered、read）/ mailbox 折叠信封 / notebook 工具 / MindPort 端口 + 生产适配器（零调用点，待 D6） |
| D3+D4 | `b8eecf40` | Referee 四策略（free / ring / waves / phase）+ 降级链；WorkerChild 每卡一个短命 actor、三端口注入、结果回投父 mailbox |
| D5 | `5a1d1063` | 迁移器：房间账映射 / agent 水位 / 未读回填 / 备份 / marker / `--dry-run` 默认档；真机 CLI 已验（dry-run 零写盘、execute 落账、重跑跳过） |
| D6-a | `fd483d1f` | 生产接线：`initializeCollabV3Runtime`（迁移 marker 门控 → Room/Agent 懒建 + 续播 → 跨房 Referee → 四生产适配器）；v2 coordinator 不再初始化（代码留作 D6-b 对照） |
| D6-b | `652c0a15` | 旧调度链整层删除，**净删 14575 行**，`BREAKING: v2 协作调度 API 不复存在` |

### 9.2 与本文的偏离

1. **D2 · 经历流不另建文件**（§1.2 已回写勘误，此处只作索引）：分区经历流 = 既有的 `agent-exec-<agentId>-<roomId>` ChatSession，id 与格式不变；引擎零改造、经历零迁移；**§4 第 2 条作废**，`agents-v3/` 只放 inbox / 账 / notebook。
2. **D1 · 链闸口径变了**：链数 = 上一清零事件以来**发出的租约数**，计在**发牌时刻**（v2 是按 say 计）。收益是一举消掉 v2 的两个病——不再需要 `floorHolds` 预占、live 与重放共用同一个 fold 公式（清零判据直接复用 C1 的 `collabMessageResetsChain`）。**代价是 `maxChain` 的旧配置在 v3 下明显更宽松**（一个回合里说三句，v2 记 3、v3 记 1）。走查 V19 专门量这个比值。
3. **D3 · 裁决结果骑既有动词**：不新增「裁决结果」动词，结果以 `referee:set-floor-policy` 落地——免动 `agent-actor` 的穷尽 switch。`policy: 'free'` 是刻意的：裁决只是 free 这一档里「这一轮怎么排」的答案，它不改档。
4. **D3 · Referee 不是 `ActorBase`**：`RoomActor.decide()` 必须保持**同步**（金重放与真机走同一行代码是 D1 立下的规矩），而模型调用不可能同步。裁判因此是独立 actor 但不继承 `ActorBase`——它的输入是裁决窗（一张待办）不是信封。保留的 actor 纪律只有一条：同一间房同时至多一次裁决在飞。
5. **D3 · 金重放抓到两个设计 bug**（不是实现 bug）：① 单座位下裁决结果不渐进消费会退化回 `O(1)/句`，白改；② 裸切策略会引发空聊，补 `hasTrigger` 门。
6. **D4 · 限额重基准 2/房 → 2/人**：§1.6 原写「每房 2 只手」，但 **v3 的房间不再是执行边界**（执行边界归 AgentActor），按房限额在 v3 里没有意义。改为 2/人 + 4/全局；全局闸补 `onRelease` 唤醒——测试实锤了一个跨 agent 饿死洞。
7. **D6-a · 举手判据换了**：从「每个 agent 自己启发式判断要不要举手」换成**人人举手交裁判**。原判据在群里**无 `@` 时全员静默**（D2 的启发式在这个场景下集体选择不说话）。
8. **D6-a · 裁决窗 150ms 防抖**：一条消息会引发 N 位成员各举一次手，不防抖则 N 次举手扇出 N 扇裁决窗 = N 次模型调用，批量裁决的收益当场归零。150ms 的选法：比一次 mailbox 往返长一个量级，比人眼的「它怎么不说话」短一个量级（`runtime.ts` 的 `JUDGMENT_DEBOUNCE_MS`）。
9. **D6-a · 拆环靠零 import 端口模块**：`turn-context.ts` / `stop-door.ts`（与 D2 的 `mind-port.ts` 同款纪律）——ingress 直引 runtime 会成 stream-engine 的环，而直连实测会打穿 19 个文件的 mock。
10. **D6-b · 控制面搬家，对外名字零改动**：冻结 / 清史 / 删房 / 成员 / 卡级停止这些**与调度无关**的七个函数搬到 `app/collab/room-config.ts`，`app/collab/index.ts` 用 `as` 保名转发，**IPC 零改动**。删除时交叉核对：无 v3 等价的先补再删（`room-config.test` 13 条）；v2-only 概念随删列名（`floorHolds` / per-agent 判定默认 / 全局 reconcile / judgement 表情）。
11. **D3 · 「裁后留手」被真机推翻（走查 F1）**：`free` 的 `resolved` 分支原本刻意让**没被点名的手继续留在队里**（理由：丢掉它们等于把「这轮你先别说」读成「你以后也别说了」）。这个前提在 D6-a 换掉举手判据（人人机械举手，见第 7 条）之后就不成立了——下一条消息全员会重新举手，留旧手防不住任何东西，只留下**永不清零的排队数**与**掺进新话题裁决窗的旧手**。现语义：裁决是对**这一批候选**的终审，判过而没被点名的手当场放下（空裁决 = 全放下），点名但没座位的照旧渐进兑现，**候选集之外的手不连坐**（窗在飞时才举的手没被判过）。判据由裁判报回（`verdictCandidates`），放手写在账转换层（`room-rules.ts` 的队列结算）而不是 `decide()` 里——`decide` 是纯决策。顺带把这种状态的 `blockedBy` 从兜底的 `seats` 改成 `judging`（座位全空时说「等人让位」是假话）。详见 `docs/audit/collab-v3-walkthrough-2026-08-03.md` §4.4 F1。
12. **D6-b · 两个差点漏掉的静默失效**：删房清理与每日摘要触发点原本挂在 v2 协调器的 `disposeCollabRoom` 上，随它一起删会造成目录泄漏与摘要停摆——已由 v3 接管。另补 `membership-changed` 的**生产者**（D6-a 只有消费侧，同事会继续 @ 已离开的人）与 `hasActiveCollabV3Work`（扫磁盘 workers 账，可跨重启，优于 v2 的进程内表）。

### 9.3 已知缺口（D7 走查的头号待办）

**原记（D6 收官时）**：`ring` / `waves` / `phase` 三档策略在生产上没有设置口——房账新建默认 `free`；换档的唯一动词 `referee:set-floor-policy` 的唯一发出口是 `RefereeActor.setFloorPolicy()` / `.changePhase()`，而这两个方法**在生产代码里零调用点**；`roomHost()` 注入给 RoomActor 的字段里没有 `responseMode`。后果：`responseMode: 'serial'` 的接力房与狼人杀的相位门在 v3 下**不生效**，房间一律跑 `free`。策略规则本身（`floor-policy.ts` 四档 + 单测 + 金重放）是齐的，缺的是**谁来点它**。

**`responseMode` 那一半：已修（本提交）**，真机仍需 V9 确认。补的是**一条纯映射 + 两个生效点**，规则一行没改：

- **映射单点**：`resolveCollabRoomFloorPolicy(room)`（`collab/actors/floor-policy.ts`）。`serial` → `ring`（`speakOrder` 进环序、`relayLoops` 进收棒圈数，两个旋钮的 v2 语义原样沿用）；`auto` → `waves`（编排仍由裁判下发，空编排自己回落 `free` 的批量裁决）；`parallel` / 未配 / 认不出 / 私聊房 → `free`。**未配走 `free` 不走 `auto`**——翻默认是一次独立的产品决定，不由一次接线顺手做掉。
- **生效点①（装配）**：`ensureRoom()` 续播之后、起循环之前调 `CollabRoomActor.syncFloorPolicy()`——冷启动，以及「用户在应用关着的时候改了设置」这条路只有这一次机会。
- **生效点②（改设置）**：`setCollabRoomConfig` 的 `relayChanged` 分支 → `syncCollabV3RoomFloorPolicy(roomId)`。只推已经开着的房，冷房由生效点①补。
- 两处都走 `referee:set-floor-policy` 那条**既有**的换档路（署名 `room-config`），所以 D3 的顶掉语义原样成立：游标清零、还没答的裁决窗作废、按新档立刻重排一次（空房不会因此自己开口——`hasTrigger` 那道门就站在这里）。两道守门：**没变就不动账**（`isSameCollabRoomFloorPolicy`，只比档名 + 环序 + 圈数，裁判现场下发的 `waves` / `activeMembers` 不参与）、**`phase` 不碰**。

**`phase` 那一半仍是缺口**：相位是跨房的（`activeRooms` 一张表下发给多间房），而房间设置是单房的——它没有 v2 对应物，保持裁判专属，`changePhase()` 依旧零生产调用点。走查条目 V13 照原样跑。

### 9.4 测试账本

`6525`（D0 前）→ `6591`（D0，+66）→ `6648`（D1，+57）→ `6749`（D2，+101）→ `6874`（D3+D4，+125）→ `6915`（D5，+41）→ `6925`（D6-a，+10）→ **`6712`（D6-b）**。

末期减少 213 条不是回退：D6-b 删掉 18 个 v2 测试文件（零 v3、零生产引用，反向依赖图实证），删之前先按「无 v3 等价的先补」补齐了 v3 侧的等价覆盖。全程 typecheck 干净、boundary 27 已知红 0 新增；D6 两步各自验过三端构建与 `server:build` 求值无死锁。
