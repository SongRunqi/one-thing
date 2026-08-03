# Collab v3：Actor 运行时（大版本 break）

日期：2026-08-03。状态：**设计定稿，未实施**。
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
