# 群聊/私聊/状态架构审查与收敛方案

日期：2026-08-03。状态：**设计，未实施**。
审查方法：21 个子代理三阶段审查（6 路并行深读 → 汇总去重 14 条 → 逐条对抗验证），基线为 experiment/castlabs-electron 当前工作树（含大量未提交的调度修复）。所有结论均经过「怀疑者立场」二次核实，未经核实的原始发现不进本文。

---

## 0. 结论速览

1. **骨架是对的，不需要重写。** Team v2 世界模型（人/地方/活，会话是幕后介质）、纯逻辑层与装配层的两层分工、classify 单点、「账先于转录」三状态面、drive/harvest 回合协议——经逐条验证全部成立且在生产运行。本方案是**收敛**方案，不是重构方案。
2. **真正的病是「收敛未完成」**：几乎每个横切关切（占用计数、投影、工具面、句柄匹配、状态广播、建房规则）都存在 2~5 份平行实现或口径，靠注释与人肉纪律同步。其中两处已被验证为**现行行为缺陷**（链长闸并行超发、pair 房重启冻死），其余是持续收税的结构债。
3. **一个反直觉的实况：代码跑在文档前面。** 对抗验证推翻了多条来自近期审计文档的「未修」断言——desc 尾注矛盾、场地陈述矛盾、maxConcurrentTurns 抄漏、07-28 审计长尾——这些在当前工作树里**都已修复**，失真的是文档状态头。因此本方案把「文档销账」列为第一期，避免下一个 session 照着过期文档重做已做的事。

---

## 1. 现状架构梳理

### 1.1 领域模型：一切皆 session，但语义分四族

| 会话族 | kind | id 形态 | 创建方式 | 说明 |
| --- | --- | --- | --- | --- |
| 群聊房 | `room` | UUID | Electron IPC 宿主内联组装 | 纯消息流，不跑模型 |
| 用户↔agent 私聊房 | `room` + `room.dm` + 单成员 | `agent-dm-<agentId>`（派生） | app 层 `ensureUserDmRoom` 幂等 | 私聊就是单成员房 |
| agent↔agent pair 房 | `room` + `room.dm` + 双成员 | 派生 | app 层 ensure | 无人类在场 |
| 执行会话 | `agent` | `agent-exec-<agentId>-<roomId>` | app 层 ensure | 每(agent×房)一条常驻，回合真正跑的地方 |
| 工作台会话 | `work` | 派生 | board start 派生 | 30min 墙钟、无断路器 |

- 房间形态由 `room.dm` + 成员数判定（`src/collab/dm.ts` 纯函数，renderer 复用同一函数）。
- 所有派生 id 由 `src/agents/identity.ts` 唯一构造，禁反解，归属读结构化字段。
- 消息与普通会话同格式持久化，区别仅 `source` 标记（collab/say/task 系统行）+ `mentions`/`replyTo` 字段。

### 1.2 调度链路：一条用户消息的一生

```
用户消息 → ingress（只落库不 stream）→ bus: message:user-created
→ coordinator（生命周期+订阅）→ queue.handleRoomUserMessage
→ wake 路由纯函数（drop / abort换代 / steer广播注入在飞回合 / engage）
→ engage：@短路+DM免判（activation.ts）
   ├─ 编排房：planner 一次调用出 waves（serial 由 speaking-order 本地合成），plan-runner 推进
   └─ 普通房：mention 直接入队 + willingness-runner 每人 8s 小调用选自荐者（cooldown 先筛）
→ enqueue 双重去重 → processQueue 并行发牌（maxConcurrentTurns 上限，同 agent 不并行）
→ turn.driveActivation：冻结/成员/预算/链闸/退休/未读 六道门 → per(agent×房)锁
→ emitDrive（合成 user 消息进执行会话，带 drive-guard 令牌、来源戳、模型绑定）
→ waitForRoomTurn（断路器同窗观察）→ 收割（房间捞 say、执行会话捞 turnMessage）
→ 计链、@级联/意愿级联、静默或 adopt-unsent 收养 → 编排批边界推进
```

- 运行态归属：`room-runtime.ts` 持有 rooms Map（queue/inFlight/activeTurns/planTicket/预算缓存/epoch）；落盘 `<store>/collab/<roomId>/state.json`（watermark、chainCount、activations 尾 50、floorEpoch、plan），同步原子写、先于 300ms 节流的转录；boot 由 reconcile 双级去重重放。
- `worker.ts` 独立持有看板工作台（并发 2/房、4/全局，硬编码），经 WorkerHost 接口注入共享基元（waitForTurn、roomChannel、预算闸）。

### 1.3 状态面：谁产生、谁消费

- **presence**（在场四栏）：纯函数 `computeAgentPresence`，app 层与 renderer 双侧现算，永不落库。✅ 单点。
- **typing**：纯 tracker（观察 send_message 参数流）+ typing-observer 接线 → `collab:typing` → renderer 60s TTL。灭灯有 4 个生产点 + TTL，无回合令牌。
- **回合在跑**：`collab:turn-active` 事件账（停止按钮读）与 `collab:coordinator-changed` 快照账（设置页读）**两本账**；「在忙/空闲」renderer 另从看板 doing 卡现算——四个口径互不聚合。
- **用户已读水位**：renderer 独有（session-read-marks 纯规则 + sessions store，持久化 app-state.json），群/私聊同一机制。✅ 一致。
- **agent 已读游标**：执行会话 meta 的 `collab.seenMessageId`，按房间消息**下标**只进不退，harvest 推进；与用户水位是两套无关系统（合理——语义不同）。

### 1.4 IPC / renderer / web

- 控制面 12 条 `collab:*` invoke 通道，全是薄透传进 `@onething/app/collab`；**例外是建房**——骑在 sessions 域 CREATE_SESSION 上，业务校验内联在 Electron 壳层。
- 命令流复用 `session:command`（ingress 分支），事件流复用 `session:event` 信封（4 个 typed 快照事件）。
- renderer 四 store 分工：agents（名册+身份投影）、sessions（会话列表+dm 形态真源）、collabBoard（看板镜像+typing+turnAgents+coordinator 快照+pendingAsks，唯一事件订阅点）、chat（折叠态）。**写路径不经 store**：7+ 个组件直调 platformApi，靠手动全量 `loadSessions()` 收敛。
- web/server：12/12 通道 stub，server 拒绝建房——**有文档记录的分期债**（desktop 先行），非疏漏；agents CRUD 已有完整 parity 证明分层机器是通的。

### 1.5 工具面与提示词注入

- 发送面已统一为 `send_message` 单工具；say/dm 旧名走 core 退役表在**派发层**归一。
- per-turn 工具白名单由 `agents/profile.ts` 按 kind 发 union grant（`collab/tool-surface.ts` 的同名规则生产已死，仅测试引用）。
- 注入面 6 处：room/agent system prompt 整体替换（collabRoomOverrides）、drive user 消息（首轮全量铺底/增量只带未读）、执行会话自身历史、意愿判定裸调用、work briefing、摘要生成。
- 提示词哲学（已拍板）：措辞只陈述事实，服从率交给结构闸（断路器、链长闸、幂等窗、收养兜底、unsent 度量）。

---

## 2. 验证后问题清单

⚠️ 下表全部经过对抗验证，「验证修正」列记录与原始发现的出入。行号为 2026-08-03 工作树快照，实施时以语义定位为准。

### P1（五条）

| # | 问题 | 验证结论与证据 |
| --- | --- | --- |
| **A1** | **链长闸并行超发（fail-open）**：闸读 `activeTurns`（turn.ts:578）但登记在锁内（:696），同批发牌的回合在预算 await 后同时过闸互不可见，最多超发 concurrency-1 条——与 :574-577 注释自述的不变量直接矛盾 | CONFIRMED。另：链闸五处判定三种公式（turn.ts:579 / queue.ts:607 / turn.ts:1274 / activation.ts:219 / plan-runner.ts:241），但只有 turn.ts:579 是强制点，其余是省调用预筛——「无单一权威」言过其实，收敛仍值得做 |
| **A2** | **pair 房重启冻死（fail-closed）**：wake poke（wake-followup.ts:162）与 dm 注入（dm-tool.ts:220）清零 chainCount 只在 live 侧，boot 重算（chain.ts:40-46）只认人类消息——无人类的 agent⇄agent 房重启后重算值≥live 值，必然顶格冻死，只能等下次跨房注入 | CONFIRMED。chain.ts:17-20 自述「两数必须一致否则重启悄悄挪闸」的硬约束已被打破 |
| **A3** | **回合能力面与提示词形态无单点 owner**：tool-surface.ts 死实现靠注释与 profile.ts 对齐（对拍测试只盖 kind:'agent' 一格）；agent-loop-runtime.ts:154-164 第三条 fallback 口径只传 kind（当前不可达，潜伏分叉）；union/replace 三份文档与代码互相矛盾；**work 会话零 system prompt 身份**（system-prompt.ts:85-88 只认 room/agent），任务框架寄在一条会被压缩摘要化的 briefing user 消息里，且 briefing 尾部规则在 work 语境自相矛盾（ask-first / board-start 必被拒）；venue 门四工具各手写（history-tool.ts:66-83 自证漏门即网关拉取私聊全文） | CONFIRMED P1。同型装配已两次酿成真机事故（幽灵成员、工具噪声） |
| **A4** | **运行时状态与房间配置的跨进程同步无统一协议**：活动状态四口径互不聚合；turn-active 两本账且 roomTurnAgents 无冷启动补水（窗口重载丢停止按钮账，**比原发现更重**）；typing 灭灯四生产点无回合令牌（对照 setRoomTurnActive 有「关窗只认开窗人」防护，不对称）；config 变更零会话列表级事件，靠 **7 处**（原发现只找到 4 处）手动全量 loadSessions | CONFIRMED P1。已发生一次真机回归（turn.ts:702-706 记录的常驻条 10-40s 显示空闲），collabBoard.ts:55-61 自己已书面论证「±事件记账 cannot be right even in principle」但另两路信号仍在用 |
| **A5** | **建房业务校验只存在于 Electron 壳层**：app 层没有建房函数，只有更新口 setCollabRoomConfig；创建/更新两本规则书**已漂移**（创建只查 agentExists，更新拒退休新增）；create+updateSessionCollab 两步非原子且不查返回值；「createSession 抢 current 指针→手动还原」舞蹈 4 处复读 | PARTIAL 维持 P1。「collab 唯一绕开 IPC 工厂树」不成立（evals/practice/music 等约 9 个域同样绕行）；web/server 缺失是有记录的分期债 |

另一条维持 P1 的行为矛盾：

| # | 问题 | 验证结论 |
| --- | --- | --- |
| **A6** | **收养式兜底不回流**：turn.ts:1085-1119 把零 say 回合的收尾正文代发进群，但被收养消息因「自己的消息永不进未读」（history-window.ts:231）+「增量 drive 只带未读」永不回流作者输入；roster.ts:128 却向模型绝对化陈述「nothing sends on its own」——收养回合里这是失实断言，存在跨回合重复发言风险 | PARTIAL P1。「下一轮必重发」是推演非实证；审计 §8.3 已把「事实回声」登记为待办。⚠️ 原发现引用的三条支撑（desc 尾注缺席、场地矛盾、零未读 drive 无机制说明）**均已过时**——当前工作树已修 |

### P2（九条，真实但降级）

| # | 问题 | 验证修正 |
| --- | --- | --- |
| B1 | **投影遗留分支方向倒置**：纯层 walk 已是 W18 后唯一生产实现，message-helpers 的 kind='room' 适配分支近死代码，但 projection.ts:507-511 注释仍宣称「生产投影是 adapter、本模块是 tested spec」——方向说反；「逐字同构」注释守护的折叠/未读分支生产不可达；纯层积累 3 个孤儿入口；设计文档仍按「双投影同改」计税 | 原 P0「被测的 spec 不是生产代码」被推翻：镜像测试存在（room-projection.test.ts:406-471 逐字节对拍），真机链路就是纯层 walk |
| B2 | **IPC handler 手抄残余**：budgets/room-update 处理器仍逐字段手抄（collab.ts:83-93、:108-116），零测试覆盖该中转层；同文件 BOARD_ACT 已示范「整体携带不解构」的正解 | 头号 bug（maxConcurrentTurns 抄漏）**已在工作树修复**；preload/renderer 已收敛到共享 Patch 类型——「四层手抄」是历史状态，残余一层 |
| B3 | **dm 房形态守卫层次错位**：防线存在但收在 UI 层（RoomSettingsDialog 对 dm 房名册只读，P1b 有意封堵）；app 层 setCollabRoomConfig 与 daemon RPC 无 dm 守卫，patch 可让私聊静默变群（免判/链闸/提示词全翻转）；ensureUserDmRoom 修复分支回写不记 formerMembers，被挤者检索权限凭空消失 | 原「无 owner 无防线」夸大；触发需非 UI 写者，面窄 |
| B4 | **调度核心两块巨型手工体**：runActivationTurn 569 行（实际代码 281 行，注释过半）、handleRoomUserMessage 239 行，并发正确性靠逐 await 手工守卫（epoch/ticket），历史上每加一个 await 开过一次洞 | 降 P2：守卫有测试钉住、并发是有文档的设计决策、已知洞四审全关。重构候选而非缺陷 |
| B5 | **turn/worker 平行小块**：逐字重复的只有 4 小块约 40 行（模型绑定 spread、僵尸 abort、drive 信封骨架、says 收割循环），其一已发生并修复过单侧漂移 | 原「整机双实现」夸大：waitForTurn/typing 观察器/预算闸已经过 WorkerHost 共享 |
| B6 | **转义防线声明全称、覆盖偏称**：sanitize 唯一生产调用点是 say 路径；**digest summary 未转义直拼 `<Day>`**（digest.ts:110，模型可控 sink，且围栏收窄赖以成立的论据在摘要这一跳失效）；board 卡标题只 trim 就进仲裁 `<state>`；projection.ts:128-130 的「没有人能伪造信封」注释失真 | 「网关远端用户通道」不成立（channel 消息进不了 room 会话）；无代码级授权绕过，可利用者仅房内 agent。修法便宜 |
| B7 | **退役名 say 对细粒度观察器双盲**：事件流带模型原始工具名，typing.ts:124 与 circuit-breaker.ts:200 严格匹配 send_message——旧名 say 的发言照常送达但打字灯不亮、say 计数（上限 20）漏计 | 「熔断不可见」夸大：总量闸（40）无条件计数兜底；dm 旧名因 zod strip 根本不送达（有测试守护）。一行量级修复 |
| B8 | **身份/域模型结构熵**：句柄「名字#句柄」三份匹配实现（handles.ts 正典 / dm-target 手写 / history-tool includes）；collabIdentityAnswersTo 死代码；域类型双实现 + as cast 无类型 pin；成员映射 5+3 处复刻（description 已漂移）；墓碑 ≥6 处两种文案（「已注销」vs「前成员」，UI 面与模型面各有文档依据）；纯层 CollabRoomConfig 死镜像类型缺 6 字段 | 「静默换人」缺实据：正典解析器对歧义一律明确拒绝，分歧多有文档说明。结构熵而非活缺陷 |
| B9 | **文档状态系统性过期（方向与原发现相反）**：team-v2 标「未实施」实已落地；multi-agent-collab-im 把已拆除的 nudge 标「✅已实施」；pair 链闸解锁三文档三说法而代码已修（dm-tool.ts:209）；07-28 审计长尾**几乎全部已修**（代码注释直引审计编号）但文档无销账批注，team-v2 §10「尚未修复」清单反成新失真源 | 原「带病未修」被代码证据推翻。真缺口=文档卫生：过期状态头 + 无销账批注，会误导平行 session 重做/误判 |

### 确认零真机走查的三条线（非 P 级，进 C5）

调度三件套、send_message 合并、wake/steer 时序——单测全绿、真机零接触；本仓失效模式历史上集中在单测盲区（IPC 边界、事件真实时序）。workbench 外壳的真机走查**已做过**（commit 7d371ab7），原发现计入它是错的。

---

## 3. 方案分期总览

原则：先止血（行为正确性），再收敛（删平行实现），再下沉（宿主无关化），再统一协议（状态同步），最后补真机验证。每期独立可交付、可单独提交。

| 期 | 主题 | 解决的问题 | 量级 |
| --- | --- | --- | --- |
| **C0** | 文档销账与基线固化 | B9 + 未提交修复入库 | 半天 |
| **C1** | 止血：行为缺陷与失实陈述 | A1 A2 A6 B6 B7 | 1~2 天 |
| **C2** | 单一 owner 收敛：删平行实现 | A3(工具面) B1 B5 B8 + 死代码 | 2~3 天 |
| **C3** | 规则下沉 app 层 | A5 B2 B3 + A3(work 身份/venue 门) | 2~3 天 |
| **C4** | 状态同步协议统一 | A4 + renderer 写路径 | 2 天 |
| **C5** | 真机走查与收尾 | 三条零真机线 + unsent 读数 | 1 天 |

**刻意不入本方案**（已有归属或另行裁决，避免重新推翻已定决策）：

- 双调度脑（意愿判定 vs waves 编排）收敛与 QM P0 三件套（旁听总闸、群规落点、判定成批）——qm-collab-learnings 已有路线，属功能演进；建议单独定收敛时间表。
- steer 广播复制 N 份进在飞回合——文档已指认真解是抢麦判定，属已定方向的已知中间态。
- web/server collab parity——有记录的分期债，量大独立成线；**C3 的下沉是它的前置**，做完 C3 后 server 只需薄路由。
- 房间内容双写进执行会话（N+1 副本）——provider 前缀缓存论证成立，有意权衡；仅约定「触及房历史的新操作必须实现扇出」（今天只有 clear 做了）。
- budget 谓词副作用拆分、未读窗口重复计算、两套并发闸并轨——API 卫生/性能项，随 C2/C3 顺手或单独小 PR。

---

## 4. 各期细节

### C0 文档销账与基线固化（半天）

1. 未提交的调度修复先提交（本次审查多条「已修」结论只存在于工作树；树不落库，审查结论随时失效）。
2. 状态头勘误：
   - collab-team-v2.md:3 「设计定稿，未实施」→ 已实施（注实施时点与代码锚点）；§2.1 补 union/replace 终态勘误（终态 union，07-30 replace 当日撤销）；§10「尚未修复」清单逐条对代码销账（P1-1→board.ts guardAgentTransition、P1-2→board.ts 幂等早退、P2-2→room-runtime.ts:356 等）。
   - collab-turn-protocol-and-identity.md:5 整份「设计未实施」→ A/B/C 全部已实施；§C 补「dm 注入清链已落地（dm-tool.ts:209）」。
   - multi-agent-collab-im.md：W14d nudge「✅已实施」→「已拆除」；头部声明本文件为历史台账，当前形态以 collab-prompt-rules-map §1-§5 为准。
   - agent-im-dm.md:189 union/replace 冲突「原样保留未裁决」→ 裁决为 union。
3. 约定「实施勘误」段为唯一状态真源（send-channel、agent-domain-model 已示范该格式），新文档一律带「代码时点」注记。
4. collab-send-channel-and-wake.md §9.3 的 7 处已知红测试：改断言或 skip 并落 owner（防再次出现 106 红假基线事故）。

### C1 止血（1~2 天）

1. **占用视图与链闸单点**（修 A1）：
   - 新增 `roomOccupancy(runtime)`：`inFlight ∪ activeTurns` 的统一视图（inFlight 出队即入，作为预占依据）。
   - 新增 `chainGateAllows(runtime, session, reason)` 单点（内含 resolveCollabChainCap 分档 + 占用预占），五处判定全部改走它；`isAgentSpeaking`、planner 的 collectMemberState 同步改走占用视图。
   - 验收：并发发牌 N 条、闸设 k<N 时恰好放行 k 条的测试（现状会全放）。
2. **live/重放对齐**（修 A2）：wake poke 与 dm 注入的清零**物化为转录事件**——落一条可被 chain.ts 识别的系统行（如 `source:'collab'` + `chainReset` 标记），boot 重算认它；live 侧照旧清零。备选（更彻底但改动大）：chainCount 完全改为「从最近清零点重算」，删 live 增量副本——留到 C2 评估。
   - 验收：pair 房经 poke 清零后重启，重算 chainCount 与 live 一致；无人类房不再冻死。
3. **注入 sink 补转义**（修 B6）：digest.ts:110 对 summary 走 escapeCollabPlanText 同款转义；board 卡标题同办；projection.ts:128-130 注释改为偏称表述（「say 正文（围栏外）已转义；人类消息、摘要、卡标题不在这条防线内」）。
4. **退役名归一**（修 B7）：抽 `isCollabSendCall(name)`（内含 resolveRetiredAgentToolName），typing.ts 与 circuit-breaker.ts 的 say 计数改走它。
5. **收养回流与措辞对齐**（修 A6）：
   - 收养发生时向执行会话追加一条轻量事实回声（下一轮 drive 可见：「你上回合的收尾正文已代发进群」+消息 id）；实现上可复用 drive 组装的 Notification 面，不新开注入点。
   - roster.ts:128 的绝对化陈述改为条件准确（保留「send_message 是唯一发送按钮」，删「nothing sends on its own」或改为「你写下但未发送的完整收尾会被代发并通知你」）。
   - 保留 unsent 计量，C5 读数决定是否需要下一轮补救。

### C2 单一 owner 收敛（2~3 天）

1. **投影方向反转**（B1）：projection.ts:507-511 方向注释改正（纯层 walk 是生产，adapter 是遗留）；message-helpers 的 kind='room' 分支显式标记 legacy 并冻结（或直接删除——先 grep 确认 room 会话直通流量为零）；删 3 个孤儿入口（projectRoomHistory、collectCollabProjectedLines、mergeCollabProjectedRows）；撤销设计文档里「双投影同改」的税注记。
2. **工具面单点**（A3 前半）：删 tool-surface.ts 的 resolveCollabToolAllowlist（常量表保留），测试搬到 agents/profile.ts；对拍测试从 kind:'agent' 一格扩到 dm/work；agent-loop-runtime.ts fallback 补齐 sessionDm/settings 或断言 agentProfile 快照必达（当前不可达，趁没分叉先封）。
3. **句柄匹配收口**（B8）：dm-target.matchesUser 与 history-tool.matchesWho 改复用 handles.ts 的解析（用户作为一等条目进同一梯子）；collabIdentityAnswersTo 要么成为实现要么删除。
4. **成员映射与墓碑**（B8）：5+3 处「在册∩在职→CollabAgentLike」统一走 room-runtime 导出版（description/前成员占位做成参数）；墓碑文案裁决——UI 面「已注销」、模型面「前成员」若为有意双口径，收敛为一个带 audience 参数的函数，不再各写字面量。
5. **turn/worker 四小块共享**（B5）：模型绑定 spread、僵尸 abort、drive 信封骨架抽为小基元（driveEnvelope/abandonZombieStream），says 收割循环共用 turn 版超集。
6. **死代码清理**：纯层 CollabRoomConfig 死类型、getCollabAgentSessionRoom、session-commands 死字段、`desc=""` 空属性渲染、agent-session 双名 shim（挑 agents/identity.ts 为属主名，shim 标 deprecated 并立清理项）。

### C3 规则下沉 app 层（2~3 天）

1. **建房单函数**（A5）：新增 app 层 `ensureCollabGroupRoom(name, roomConfig)`——成员过滤、agentExists、**退休检查（创建路径今天缺）**、PM 在册、budgets 归一、原子写（createSession 一步带 kind/room 或写后校验返回值）。Electron sessions.ts 与 CLI daemon 改为透传。这是 web/server parity 的前置。
2. **createSession 不动 current 指针的变体**：删 4 处「抢指针→手动还原」舞蹈。
3. **dm 守卫下沉**（B3）：setCollabRoomConfig 拒绝 dm 房成员编辑（UI 层防线保留为第二道）；ensureUserDmRoom 修复分支改走留痕移人（记 formerMembers），保住被挤者的检索权限账。
4. **IPC 透传纪律**（B2）：budgets/room-update 处理器改 `const { roomSessionId, ...patch } = request` 整体透传（BOARD_ACT 同款）；补一条 keyof 穷尽性测试盯住 shared Patch 类型 ↔ handler 的对应。
5. **work 会话身份**（A3 后半）：system-prompt collabRoomOverrides 补 work 分支（工作身份 + 卡框架常驻 system，不再寄生于会老去的 briefing）；briefing 删自相矛盾两条（ask-first / board-start）；「no turn limit」措辞对齐现实（maxTurns+30min 墙钟）；board start 回执补「工作会话已在后台开启」。
6. **venue 门统一**（A3）：工具声明 venue（room/work/dm/main）进 profile 层注册表，派发前统一校验，替代 say/board/dm/history 四处手写门；重点回归 history-tool 的网关面（漏门=陌生人拉私聊全文）。

### C4 状态同步协议（2 天）

1. **活动快照统一**（A4）：coordinator 快照扩为房间活动快照（现有 mode/frozen/turns/queue/gates/plan + speaking 成员集 + typing 成员集）；`collab:turn-active` 与 `collab:typing` 降级为快照携带字段（或保留为低延迟触发器，但 renderer 账本只从快照派生）；停止按钮与设置页 hasLiveTurn 读同一账本；load() 冷启动补水补齐 roomTurnAgents（今天窗口重载即丢）。
2. **typing 灭灯协议**：并入快照后自动解决四处灭灯与乱序问题；若保留独立事件，事件带 turnId 令牌、renderer 按令牌关灯（对齐 setRoomTurnActive 的「关窗只认开窗人」）。
3. **config 变更推送**：新增 `session:collab-updated` 事件（携 room 快照），sessions store 增量合并；删 7 处手动 loadSessions。
4. **renderer 写路径收进 store**：board act/stop、react、room config 变更收为 collabBoard/sessions store action（回填约定内聚其中），组件只调 store。
5. **pendingAsks 收敛**：chat store 的 prompt 状态改从 collabBoard 的 reconcile 账派生，退役 ipc-hub 的 ± 事件累积路径。

### C5 真机走查与收尾（1 天）

1. 集中补三条线的真机走查（各文档已写好清单）：调度三件套（scheduling-review-brief）、send_message 合并 + wake（send-channel §6 狼人杀走查）、steer 时序（steering:consumed 真实时序）。
2. 读 unsent 计量分桶（prompt-rules-map §8 路线），裁决「写而未发」在 C1 收养回流落地后是否还需数据门控的补救轮。
3. C1-C4 各期回归项汇总走查一遍（链闸超发、pair 房重启、typing/停止按钮一致性、dm 房不可变形）。

---

## 5. 附：已拍板决策清单（本方案不推翻）

来自设计文档考古，列出以防后续 session 重新设计：

- persona 原文即 system，不包装。
- 说话即行动：turn 正文=私人笔记，send_message 唯一发送工具；hidden 别名机制已被 R1 明确否决，dm/say 走退役名表。
- 沉默在判定层表达，回合内无沉默按钮（stay_silent 退役）。
- 结构对抗优于措辞（W22）；nudge/强制首调/<turn> 尾注三代措辞对抗均已拆除，现行结构面=收养兜底+unsent 度量。
- @ 只是社交信号；assign=通知≠开工；接力收棒权在配置不在模型。
- 房间消息整条落地不流式（W11）；typing=say 参数流出的物理信号（W19）。
- 用户消息默认 steer 不抢占（floor 重置方案被用户否决）。
- evidence 永远代码采集（防谎报双轨）。
- 识别面（identity-directory 含退休）与授权面（房间成员表）分家是刻意设计。
- 房间内容双写进执行会话是有意权衡（provider 前缀缓存）。
- 判定/编排双轨是有意过渡（speaking-order 自述「缺省不翻」），收敛另行裁决。
