# 群聊架构收敛 · 真机走查清单

日期：2026-08-03。状态：**待执行**（清单已就绪，走查未开始）。
范围：`experiment/castlabs-electron` 的 `2bb5dfe2..6605e94c`（C0–C4 六个提交）。
方案：`docs/design/collab-architecture-consolidation-2026-08.md`（§4 各期细节、§6 实施勘误）。

> **⚠️ 部分条目已过期（2026-08-03，Collab v3 落地后）**：C1–C4 里**调度面**的条目（W1 接力 / W2 状态条 / W3 waves / W7 steer / W8 喊停三样 / W9 链闸 / W10 pair 房重启 / W15 三面一致）已被 v3 的 actor 运行时取代——v2 调度链在 `652c0a15` 整层删除，那几条描述的代码路径不复存在，**以 `docs/audit/collab-v3-walkthrough-2026-08-03.md` 为准**（对照表在该文 §4.3）。renderer / 审批 / 转义 / 建房校验类条目（W5 W6 W11 W12 W13 W14 W16 W17 W18）**仍然有效**，照走。

---

## 0. 为什么需要这份清单

C0–C4 的全部验证停留在**单测层**：6521 个测试全绿、typecheck 干净、boundary 无新红。而本仓历史上的失效模式集中在单测照不到的三个盲区——**IPC 边界的逐字段手抄**、**事件的真实时序**、**scoped CSS 的静默截断**。这三类里没有一类会被 vitest 拦下来。

更具体的前科：

- `maxConcurrentTurns` 在桌面端从并行化那天起就没生效过（budgets 中转逐字段抄漏一格，类型有、app 层认、UI 一填就静默丢），单测全绿了几个月；
- 「判定 3 人 → 都没接话」这个缺口，是用户在真机上贴出来的，两轮对抗审查都没看见；
- 常驻状态条显示「空闲」而回合正在跑（`turn.ts:702-706` 记录的那次回归），事件账与快照账两本账，测试各自都对。

C1–C4 改动的正是这三类东西：链闸的**并发时序**、boot 重放与 live 的**跨重启一致性**、IPC 的**整体透传**、renderer 的**单一账本与冷启动补水**。所以「测试绿」在这里不构成结论。

**boundary:gate 目前不构成护栏**：C3 期发现该脚本的 ANSI 解析空转（永远读不到 `[boundary] failed:` 行，于是永远「无新红」）。C5 另有代理在修；在修复落地前，boundary 状态以手工核对为准（C3 手工核对：27 红 / 基线 28，1 治愈 0 新增）。

---

## 1. 前置与约定

### 1.1 环境

```bash
bun run build       # UI 走查前必须重 build —— dev 与 build 产物在 scoped CSS 上表现不同，
                    # 这一条踩过（IM 化 W1/W2）
bun run dev         # 或分泳道：dev:electron / dev:web
```

- **provider 请求 dump 是本清单里多条「提示词是否真的进去了」的唯一硬证据**：默认开启（`ONETHING_DUMP_PROVIDER_REQUESTS !== '0'`），落在 `~/.onething/log/provider-requests/`。凡预期里写「dump 里应出现 X」的条目，都是查这里。
- **只读，不改状态**：走查全程不点会持久化的控件做「试试看」；确需查看 `~/.onething` 下的会话文件，先停 server（`ONETHING_STORE_PATH` 被 server 独占时读写会打架）。

### 1.2 需要预备的场景

| 代号 | 场景 | 用在哪几条 |
| --- | --- | --- |
| R3 | 一间 3 人以上的群房（含 PM），预算可改 | W1 W2 W3 W9 W15 W16 W17 |
| RP | 一间 agent↔agent pair 房（无人类在场） | W10 |
| RD | 一间用户↔agent 私聊房 | W4 W5 W13 |
| RW | 一张 board 卡派生出的 work 会话 | W14 W18 |
| A-retired | 一位已退休的 agent | W12 |

### 1.3 回滚锚点怎么用

每条给两级锚点：**提交级**（`git revert <sha>`，整期退回）与**文件级**（改动落在哪几个文件，可只回退单点）。六个提交：

| 期 | sha | 主题 |
| --- | --- | --- |
| C0 | `2bb5dfe2` | 文档销账（无代码） |
| C1 | `f2d699dc` | 止血：链闸/清零可重放/转义/退役名/收养回流 |
| C2 | `d2fce90b` | 单一 owner 收敛（投影/工具面/句柄/成员/墓碑/死代码） |
| C3 | `6b2c59ab` | 规则下沉 app 层（建房/指针/dm 守卫/IPC/work 身份/venue 门） |
| C4a | `9c43b0f5` | 状态同步协议（活动快照/typing/config 推送） |
| C4b | `6605e94c` | renderer 写路径收 store + pendingAsks 单账本 |

C2 是纯收敛期（删平行实现、无行为意图），它的回归面被 C1/C3/C4 的条目**顺带覆盖**（投影/句柄/成员映射都在每一条群聊走查里被读到），故不单列条目；若某条走查出现「投影内容不对」「@ 谁认不出来」「花名册里名字不对」，第一嫌疑就是 C2（`d2fce90b`）。

---

## 2. 收敛前就欠、收敛后仍欠的三条线

这三条线在 C0 之前就是「单测全绿、真机零接触」，收敛没有改变这个事实，只是把它们推到了 C5。清单来源是各自文档里已经写好的走查段落，此处摘编并补上回滚锚点。

### W1 · 接力（顺序响应模式）

来源：`docs/audit/collab-scheduling-2026-08-02-review-brief.md` §2.1。

**操作**

1. R3 房间设置 → 响应模式选「顺序」，成员次序设为 甲 → 乙 → 丙；
2. 发一条谁都能接的话（如「大家说说明天的安排」）；
3. 观察一整圈；
4. 第二轮：发一条只 @ 乙的话；
5. 第三轮：让甲在发言里 @ 自己（可用一条引导消息促成）。

**预期**

- 一次只有一位在说，说完下一位才起——**批间严格串行**；
- 甲这轮没话说（判定沉默）时，乙**立刻**发牌，不等甲；列表是次序不是插槽；
- 任一时刻房里只有**一根棒子**：不出现两位同时在说的接力；
- 单人环不永动：只剩一位可发言时不会一路跑到撞链闸；
- 全员无话时静静收尾，**不**往房里贴「我按住了」之类的机器话。

**验证的是** 收敛前欠的第一条线（`f46295be` 调度三件套）；C1 之后 `speaking-order` 的接力判定改读统一占用视图（`f2d699dc`），所以「一根棒子」这条同时是 C1 的回归面。

**失败回滚** 优先怀疑 C1：`git revert f2d699dc`；文件级看 `packages/onething-runtime/src/collab/chain.ts`、`src/app/collab/turn.ts` / `queue.ts` 的过闸即占（`floorHolds`）。若接力次序本身错乱（与 C1 无关），锚点是 `f46295be` 的 `src/collab/speaking-order.ts`。

---

### W2 · 协调器状态条

来源：review-brief §2.2。

**操作**

1. 打开 R3 的右栏工作台，盯住线程格顶部的状态条；
2. 发一条会激活多人的消息，全程不动别的；
3. 把某项预算配成「不限」；
4. 制造一次判定失败（断网几秒 / 把某位 agent 的 provider key 改错）。

**预期**

- 「在跑 / 排队 / 判定中 / 闸」四格随链路推进变化，且**不落后**于房里实际发生的事；
- 「不限」的闸显示为 `0`（不是 `Infinity`、不是空白、不是 `null`）；
- 停下来之后状态条停在「停下来了」那一帧——节流窗口不吞最后一帧；
- 判定失败在面板上**分得开**（`unparsable` / `timeout` / `error` 各自可辨），不被折进「不说」。

**验证的是** 第一条线（`f46295be` 的 `inspector.ts` / `coordinator-status.ts`）。

**失败回滚** `f46295be` 的 `packages/onething-runtime/src/app/collab/inspector.ts` + `packages/renderer/components/workbench/coordinator-status.ts`。注意状态条现在与 C4a 的活动快照同管道广播（`9c43b0f5`），若症状是「整条不更新」而非「某一格不对」，先怀疑 C4a。

---

### W3 · waves 编排

来源：review-brief §2.3。

**操作**

1. R3 响应模式选「智能」（`auto` **没有**翻默认，必须手动选）；
2. 发一条点名两人、但话题牵扯到第三人的消息；
3. 中途（编排调用返回前，约 2–12s 窗口）点停止；
4. 把响应模式清空（未配 = 并行老路），重复步骤 2。

**预期**

- 被 @ 的人**一定**在第一批里（代码强制补入，不靠模型注意力）；
- 一批全部落地才发下一批，批内并行且受 `maxConcurrentTurns` 约束；
- 步骤 3 的停止**当场生效**：编排不再推进下一批，不出现「喊完停又冒出一批」；
- 步骤 4 的行为与改动前**逐字一致**（这是这次改动最重要的安全网）。

**验证的是** 第一条线（`f46295be` 的 `plan.ts` / `planner.ts` / `plan-runner.ts`）。C1 让 `plan-runner` 不再绕过 `resolveCollabChainCap`（`f2d699dc`），所以「批内条数」同时受 W9 约束。

**失败回滚** `f46295be`；若症状是批内条数超发，走 W9 的锚点（C1）。

---

### W4 · 狼人杀发牌（send_message 合并 + wake）

来源：`docs/design/collab-send-channel-and-wake.md` §6。

**操作**（原文六步，逐步走）

1. 上帝在 R3 游戏群的回合内调
   `send_message({ to:'小明#3f9c', content:'你是狼人。用 variable set scope=agent 记下身份。', wake:true })`
   —— `wakeRoom` 缺省应命中当前游戏群；
2. 小明的 RD 回合：读牌、写状态板；
3. 回合 settle → 游戏群出现「上帝：@小明 我在私聊里给你发了消息 —— 看完后请回到这里回应。」；
4. 小明在群房被 @ 激活，状态板已有身份，答「收到」；**不泄露牌面**；
5. 上帝对 N 名玩家重复，收齐后开局；
6. 观察 poke 噪音水平（N 张牌 = N 条 poke，幂等窗只挡同目标重复）。

**预期** 六步逐条成立；步骤 3 的 poke 文案是固定模板（不可自定义）；步骤 6 的噪音水平是要**记数**的观测项——它决定要不要做合并窗（`§7 开放问题 2`）。

**验证的是** 第二条线（`f46295be` 的 send_message 统一 + wake-followup）。

**失败回滚** `f46295be` 的 `packages/onething-runtime/src/app/collab/{say-tool,dm-tool,wake-followup}.ts`。注意 C3 把四处手写场子门收编成 `venue.ts`（`6b2c59ab`），若症状是「工具在不该可用的地方可用/不可用」，先怀疑 C3。

---

### W5 · wake 的反向验证

来源：send-channel §6 第 6 条。

**操作**

1. 把 RD 冻结，再从群里对该成员发 `wake:true` 的私聊；
2. 调 `send_message({ to:'用户', wake:true })`；
3. 观察打字灯：某成员在群房回合里调私聊档（带 `to`）时，盯住**群房**的打字指示。

**预期**

- 1 → poke 走 **120s 超时路径**照发（不因目标房冻结而丢），失败留痕落在状态条 `blocked` 那一格，detail 写明「唤醒未送达：…」；
- 2 → **拒绝**（矩阵之外补的那条纪律：说清楚而不是静默忽略）；
- 3 → 群房打字灯**不亮**；流式 provider 下允许在参数流的几秒里亮一下随即熄灭（已接受的残留，不是新缺陷）。

**验证的是** 第二条线（`f46295be`）+ C1 的退役名归一（`f2d699dc` 的 `isCollabSendCall`：旧名 `say` 的发言也要点亮打字灯、也要计进断路器的 say 格）。

**失败回滚** C1 单点：`packages/onething-runtime/src/collab/typing.ts` + `circuit-breaker.ts`（`f2d699dc`）；wake 本体在 `f46295be`。

---

### W6 · legacy `dm` 的降级出口

来源：send-channel §9.4。

**操作** 用旧转录风格构造一次 `dm({ to, message })` 调用（可让模型照抄一条旧转录），观察一轮。

**预期**

- 一轮 `COLLAB_SAY_REFUSED_EMPTY`（**逐字**这句，不是一坨 zod issue）；
- **无消息落库、无私聊房被创建**；
- 模型下一轮以 `send_message({ to, content })` 重发成功；
- 模型视野里（请求 tools 参数、提示词工具清单）有且只有**一个**发送工具——查 dump 确认。

**验证的是** 第二条线（`f46295be` 的 R1 收缩）。

**失败回滚** `f46295be` 的 `packages/onething-runtime/src/tools/builtin/say.ts`（`formatValidationError`）+ `app/collab/say-tool.ts`（退役名注册）。

---

### W7 · 中途来消息默认 steer

来源：`docs/design/collab-wake-route-and-reaction-actions.md` §A（「落地顺序」段自述 `steering:consumed` 的真实时序只有单测证据）。

**操作**

1. 在 R3 发一句问题，等某位开始说（状态条显示在跑）；
2. **不等他说完**，立刻补一句补充说明；
3. 观察这一轮的输出与 dump。

**预期**

- 第二条**并进当前回合**（steer），不中止、不作废、不往房里贴「被打断了」之类的系统行；
- 该 agent 的回复读得到两条（dump 里 drive 之后应能看到 steering 注入的那一条）；
- **`steering:consumed` 的落点**：注入在回合边界被 drain，而不是漏到下一轮重复注入——这是这条走查的核心，也是唯一没有真机证据的一格。

**验证的是** 第三条线（wake/steer 时序，`f46295be` 之前既有）。

**失败回滚** `packages/onething-runtime/src/app/collab/steer.ts` + `queue.ts` 的 wake 路由段。C1/C4 未触及 steer 本体；若表现为「第二条被整条吞掉」，怀疑 C1 的过闸即占把第二条挡在了闸外（`f2d699dc`）。

---

### W8 · 喊停清三样 + floor 世代号跨重启

来源：wake-route §A.3。

**操作**

1. R3 起一轮多人激活，队里还压着人、还有判定在飞时点**停止**；
2. 观察房间与状态条；
3. 立刻退出应用、重启、打开同一间房。

**预期**

- 停止清掉**三样**：在跑的回合、在飞的意愿判定、队里的对话性激活；任务事件激活**豁免**（停对话不是停干活）；
- 停止之后没有任何「后到的」发言冒出来；
- 重启后：上一轮那批 queued 记录**不会**被整批误判成过期静默吃掉（floor 世代号落盘生效），也不会突然全部复活开口。

**验证的是** 第三条线；同时是 C1 A2 的邻接面（boot 重放与 live 同口径，`f2d699dc`）。

**失败回滚** `f2d699dc` 的 `packages/onething-runtime/src/collab/chain.ts` / `classify.ts`；floor 世代号本体在更早的提交（`room-runtime.ts` 的 `state.json` 落盘）。

---

## 3. C1–C4 的新增回归面

### W9 · 链闸并发不超发（C1 A1）

**操作**

1. R3 房间设置：`maxChain` 设为 **2**，`maxConcurrentTurns` 设为 **4**；
2. 发一条一次点名四个人的消息（`@甲 @乙 @丙 @丁 都说一句`）；
3. 数真正开口的人数；
4. 重复三次（这是并发时序问题，一次不复现不等于修好了）。

**预期** 恰好 **2** 位开口，其余两位被闸挡下（状态条 `gates` 那一格看得见）。旧公式在此处**恰好复现 4/2 超发**——四位全开口就是回归。

**验证的是** C1 A1（`f2d699dc`）：`roomOccupancy(inFlight ∪ activeTurns ∪ floorHolds)` 统一占用视图 + `collabChainGateAllows` 单公式收编五处判定；**过闸即占 `floorHolds`** 是防同批互不可见的关键（旧代码闸读 `activeTurns` 但登记在锁内，同批的回合在预算 await 后同时过闸）。

**失败回滚** `git revert f2d699dc`（会一并退掉 A2/A6/B6/B7）；文件级：`packages/onething-runtime/src/collab/chain.ts`（`collabChainGateAllows`）+ `src/app/collab/{turn,queue,plan-runner}.ts` 的调用点 + `src/collab/activation.ts`。

---

### W10 · pair 房重启不冻死（C1 A2）

**操作**

1. 让 RP（agent↔agent，无人类）跑到链闸顶格（连续几轮直到没人再开口）；
2. 从群里对其中一位发一次 `wake` poke（或跨房 dm 注入）——这会清零链计数；
3. **确认清零生效**（RP 里有人重新开口）；
4. **完全退出应用**，重启，打开 RP，再驱动一次。

**预期** 重启后 RP **仍能开口**。旧代码 boot 重算只认人类消息，无人类的房重算值 ≥ live 值，必然顶格冻死，只能等下一次跨房注入——重启后一句话都出不来就是回归。

**验证的是** C1 A2（`f2d699dc`）：wake poke / dm 注入的清零**物化为转录标记** `collabChainReset`，`classify.isCollabChainResetMessage` 单点判定，`chain.ts` 的 boot 重算认它作清零边界，与 live 同口径。旧转录（无标记）行为不变——这一点顺带验证：一间 C1 之前就存在的老房，重启后行为应与升级前一致。

**失败回滚** 文件级：`packages/onething-runtime/src/collab/{chain,classify,types}.ts` + `src/app/collab/{wake-followup,dm-tool,say-tool,queue}.ts` 的 `chainReset` 参数链 + `packages/shared/ipc/chat.ts` 的 `collabChainReset` 字段（`f2d699dc`）。

---

### W11 · 收养事实回声（C1 A6）

**操作**

1. 制造一次「写而未发」回合：让某位 agent 在回合里写完整的收尾正文但一次 `send_message` 都不调（真机上这本来就会自发生，也可用一条容易诱发的提问促成）；
2. 确认框架**代发**了那段正文进群（消息署该 agent 的名）；
3. 让同一位 agent 在**下一轮**被驱动（发一句 @ 他的话）；
4. 查 dump（`~/.onething/log/provider-requests/`）里这一轮的 drive user 消息。

**预期**

- drive 的**最末尾**出现收养回声块（`<adopted_echo id="…" at="…">`），正文逐字为
  「Your last turn ended with a finished reply written at your desk and no send. The system delivered that text to the chat for you — those words are already there, under your name.」；
- 回声**只出现一次**：再下一轮的 drive 里没有它（取走即清）；
- 该 agent 的下一轮**不重复发一遍**上一轮那段话——这是这条走查真正要看的行为（重复发言正是旧 nudge 的根因）。

**验证的是** C1 A6（`f2d699dc`）：执行会话 meta 记 `adoptedEchoMessageId`/`adoptedEchoAt`，下一轮 drive 尾部随取随清；同时 `roster.ts` 撤回了「nothing sends on its own」的绝对化陈述（收养发生时那是失实断言）。

**失败回滚** 文件级：`packages/onething-runtime/src/app/collab/agent-session.ts`（`noteCollabAdoptedEcho` / `takeCollabAdoptedEcho`）+ `src/app/collab/turn.ts` 的 drive 组装 + `src/collab/projection.ts` 的 `formatCollabAdoptedEcho` + `src/collab/roster.ts`（`f2d699dc`）。

---

### W12 · 建房拒收退休 agent（C3 A5）

**操作**

1. 新建群房，成员里勾上 A-retired；
2. 另起一间已存在的房，在设置里把 A-retired **新增**进名册。

**预期** 两条路给**逐字相同**的拒绝：`Agent is retired: <名字>`。C3 之前创建路径只查 `agentExists`（放行退休的人），更新路径拒——同一个问题两个答案。

**验证的是** C3（`6b2c59ab`）：`ensureCollabGroupRoom` 落 app 层 `room-create.ts`，校验 + 失败回滚原子性，创建路径补退休拒收，Electron / daemon 两宿主改透传。顺带看：建房失败时**不留半张房**（两步写 + 失败回滚），且建房不再抢走当前会话指针（`createSessionWithoutFocus` 变体）——建完房当前打开的会话不应被莫名换掉。

**失败回滚** 文件级：`packages/onething-runtime/src/app/collab/room-create.ts` + `apps/electron/src/main/ipc/sessions.ts` 的透传（`6b2c59ab`）。

---

### W13 · 私聊房名册不可编辑（C3 B3）

**操作**

1. 打开 RD 的房间设置——UI 层名册应为只读（P1b 有意封堵，第一道防线）；
2. 绕过 UI，从 CLI daemon（`bin/onething.mjs`）对同一间 dm 房下一次带成员 patch 的 room-update。

**预期** app 层 `setCollabRoomConfig` **拒绝** dm 房名册编辑（第二道防线）；私聊不会被静默改成群（形态一翻，免判 / 链闸 / 提示词全跟着翻）。

**验证的是** C3 B3（`6b2c59ab`）：dm 守卫下沉 app 层；同期 `ensureUserDmRoom` 的修复分支补 `formerMembers` 留痕（被挤者的检索权限不再凭空消失）。

**失败回滚** 文件级：`packages/onething-runtime/src/app/collab/room-runtime.ts`（`setCollabRoomConfig` 守卫）+ `user-dm-room.ts`（`6b2c59ab`）。

---

### W14 · work 会话知道自己在干活（C3 A3）

**操作**

1. 在 R3 里 board start 一张卡，派生 RW；
2. 查 dump 里 RW 第一轮的 **system prompt**；
3. 让 RW 跑长（多轮工具调用直到触发上下文压缩），压缩后再问它「你现在在做什么」；
4. 看 board start 的回执文案。

**预期**

- system prompt 里有 `<where_you_are>` 的 work 分支 + 卡框架（`<card>`，meta 带 `taskTitle`），**不再**只寄生在一条会被压缩摘要化的 briefing user 消息里；
- 压缩之后它**仍然**答得出自己在做哪张卡（这正是 C3 之前的失效形态：任务框架随 briefing 一起被压没）；
- work rules 里**没有**「指派不是开工令，先问清楚」「重活先 board start」这两条自相矛盾的话（在已经是工作会话的地方照做 = 回群聊天或调一个必被拒的 start）；
- 「no turn limit」措辞对齐现实（`maxTurns` + 30min 墙钟）；
- board start 回执里有「工作会话已在后台开启」这类说明。

**验证的是** C3 A3（`6b2c59ab`）：`collabWorkOverrides` 追加进 system prompt。

**失败回滚** 文件级：`packages/onething-runtime/src/app/engine/prompt/system-prompt.ts` 的 work 分支 + `src/collab/agent-rules.ts`（`6b2c59ab`）。

---

### W15 · 三面一致 + 窗口重载不丢（C4 A4）

**操作**

1. 在 R3 起一轮，同时开着三个面：房间里的**停止按钮**、房间设置对话框的**「将中止正在进行的发言」**提示、左栏「进行中」里这间房的**在忙**标记；
2. 三面同时看一轮的起与落；
3. 回合**正在跑**时 `Cmd+R` 重载窗口；
4. 重载完成后立刻再看三面。

**预期**

- 三面**同时**亮、**同时**灭——它们读同一个 selector（`isRoomTurnActive` → 快照的 `speaking`）；C4 之前停止按钮读 `collab:turn-active` 事件账、设置页读 coordinator 快照账、在忙从看板 doing 卡现算，同一个问题三个答案；
- 重载后停止按钮**照旧亮着**（冷启动补水：每房一次 `coordinator-get`，在 `loadSessions` 之后全房 hydrate）。C4 之前窗口重载即丢账，按钮变灰而回合还在跑；
- 乱序快照被丢弃：不出现「亮了又灭又亮」的抖动（`seq` 只在广播发号，GET 带上次广播号）。

**验证的是** C4a（`9c43b0f5`）：`CollabCoordinatorState` 扩 `speaking`/`typing`/`at`/`seq`；renderer 单一账本，`roomTurnAgents` 独立账退役。

**失败回滚** 文件级：`packages/renderer/stores/collabBoard.ts`（快照账本 + hydrate）+ `packages/onething-runtime/src/app/collab/{coordinator,room-runtime}.ts` 的广播（`9c43b0f5`）。

---

### W16 · 打字灯起落（C4 A4）

**操作**

1. R3 里让某位开口，盯住成员的打字指示；
2. 让一轮**异常收尾**（点停止 / 拔网线 / 让工具报错）；
3. 一位 agent 说完后，静置 70 秒。

**预期**

- 参数一开始流就亮，回合收尾就灭；
- 异常收尾**也灭**——四处灭灯生产点已收进 `emitCollabTyping` 单一漏斗，不再有「某条路径忘了灭」的角落；
- 静置超过 60s TTL 后，任何残留的灯自行熄灭（TTL 挂在快照时间戳上，不是 renderer 自己记的时间）；
- renderer 侧不再做 ± 记账（旧模型自证「cannot be right even in principle」）。

**验证的是** C4a（`9c43b0f5`）的 typing 漏斗 + C1 B7 的退役名（`f2d699dc`，旧名 `say` 也要点亮）。

**失败回滚** 文件级：`packages/onething-runtime/src/app/collab/typing-observer.ts` + `src/collab/typing.ts` + `packages/renderer/stores/collabBoard.ts` 的 typing 段（`9c43b0f5`）。

---

### W17 · 房间配置改动即时同步到所有面板（C4 A4）

**操作**

1. 同时打开：房间设置对话框、右栏工作台线程格、左栏该房的行；
2. 在设置里依次改：**成员**、**预算**（`maxChain` / `maxConcurrentTurns` / 日成本）、**响应模式**、**冻结开关**；
3. 每改一项就保存，**不做任何刷新动作**（不切走再切回、不重载窗口）；
4. 另开一间新群（走建房路径），看它出现在列表里的时机。

**预期**

- 每一项保存后，三个面**当场**跟着变——不需要手动刷新。C4 之前靠 7 处散在五个文件里的手动全量 `loadSessions()` 收敛，新加一个写入口就漏一处；
- 五个写入口（`setCollabRoomConfig` / budgets / frozen / 建房 / dm 修复分支）都发 `session:collab-updated` 全量小快照事件，sessions store 就地合并**一行**；
- 步骤 4 的新房**立刻**出现且可 `openSession`（建房仍走全量重拉，见 §4.3——这是有意保留的三处之一）。

**验证的是** C4a（`9c43b0f5`）的 config 推送 + C4b（`6605e94c`）的写路径收进 store（七个组件/composable 改调 store action，回填约定内聚在 action 里）。

**失败回滚** 文件级：`packages/shared/events/session-events.ts`（事件类型）+ `packages/onething-runtime/src/app/collab/room-runtime.ts:625` 附近的发射 + `packages/renderer/{services/ipc-hub.ts,stores/sessions.ts}`（`9c43b0f5` / `6605e94c`）。

---

### W18 · 审批卡四场景（C4-5）

**操作**（四场景各走一遍；RW 里跑一个需要审批的工具最容易复现）

1. **出现**：触发一次权限请求，看卡片举起的时机；
2. **晋升**：制造一次排队态（同房再触发一次审批，前一条未答）→ 看等待态换成可按的卡；
3. **消失**：答一次（允许/拒绝）→ 看卡当场撤掉，且 decision 带来的状态推进（工具继续/中止）没有丢；
4. **切会话补水**：在有未答审批的情况下切到别的会话再切回来（或重载窗口），此时**一条事件都不会重放**。

**预期**

- 1 → 一条 `permission:request` 之后卡片就在，不等 debounce；
- 2 → `queued → actionable` 晋升，等待态不会一直挂着；
- 3 → settle 当场撤卡（`decision` 当场转达，不等 debounce）；迟到的反查**不许把卡贴回去**（generation 号防迟到）；
- 4 → 冷开场无事件，卡片照样在（唯一账本 = reconcile 模型，全量 `PermissionInfo`；徽标与卡片是同一账本的两个断面）；
- 反查读失败时账本**原样留着**，不被当成空队列清空。

**验证的是** C4b（`6605e94c`）：`chat.applyPendingPermissionSnapshot` 为「账本 × 消息」纯函数不留旧快照；ipc-hub 的三事件 ± 直调全部退役收进 `notePermissionEvent`。

**失败回滚** 文件级：`packages/renderer/stores/{collabBoard,chat}.ts` 的 pendingAsks 段 + `packages/renderer/services/ipc-hub.ts`（`6605e94c`）。对拍用例在 `packages/renderer/stores/__tests__/collab-pending-permissions.test.ts`（四个等价场景 + 两条时序防御）。

---

## 4. 已知观感点与待裁决项（**不是 bug，不要当缺陷报**）

走查时一定会撞到这三样，此处如实标注它们的性质，免得被当回归重查一遍。

### 4.1 停止按钮在回合收尾时多亮片刻——**有意行为**

`speaking` 是**占用视图的超集**（`inFlight ∪ activeTurns ∪ floorHolds`），而不是「正在生成」的精确集合。于是一个回合真正说完之后、`inFlight` / `floorHolds` 释放之前，停止按钮会多亮一小会儿。

这是刻意的：**宁可多亮不可早灭**——按钮灭了而回合还在跑，是 C4 之前那次真机回归的形态（常驻条 10–40s 显示空闲）。若产品上要求精确到「正在生成」，一行的事：把 renderer 那个 selector 从 `speaking` 换成快照的 `activeTurns`。裁决权在产品，不在这次走查。

### 4.2 `send_message` 的显式 `room` 参数不过场子门——**待产品裁决**

C3 的 venue 门是**等价重构**：把四处手写的 if 合并成一张声明式表（`COLLAB_TOOL_VENUES`）+ app 层统一判定，收紧侧安全（认不出的 kind 一律算 `chat` → 拒），四个工具的判定结果逐一不变。**因此它保留了原有口径**：`send_message` 带显式 `room` 指向别的群时，走的仍是原来那条不过场子门的路。

这不是漏门，是「等价重构不顺手改语义」的纪律。要不要收紧（显式 `room` 也过门）是产品裁决项，已记在 C3 提交的「已知」里，本次走查**不判它对错**，只记录真机上是否出现过困扰。

### 4.3 三处保留的 `loadSessions()`——**有意保留**

C4a 删掉了 7 处手动全量重拉里的 4 处，留了 3 处，各有一条事件盖不住的动机（注释写在代码里）：

| 保留处 | 动机 |
| --- | --- |
| `sessions.ts` · `createCollabRoom` | `session:collab-updated` 是「改一行」，建房要的是「加一行」——新房还不在列表里，而调用方下一句就要 `openSession` 它；事件驱动的补拉是异步的，盖不住这个同一拍的顺序要求 |
| `sessions.ts` · `clearCollabRoomHistory` | 清空动的是**转录**不是配置：列表行上的最后一句、消息数、时间戳全变，那条事件只带 room 快照，盖不住 |
| `components/agents/use-agent-dm.ts` | 同建房：新建一间 dm 房是「加一行」 |

观感上这三处会有一次全量列表重拉（列表可能闪一下 / 有一拍延迟）。**契约已从「组件记得刷」变成「action 保证可见」**——三处都收在 store action 里，不再散在组件。若走查中发现**第四处**需要手动刷新才更新的写路径，那才是真回归（说明某个写入口漏发 `session:collab-updated`）。

---

## 5. 结果记录

走查时按此表逐条落，**「部分」与「未走」也要落**——空着与通过分不开，是这类清单最常见的失效方式。

| # | 项 | 结果（通过 / 失败 / 部分 / 未走） | 现象与证据（截图 / dump 路径 / 日志行） |
| --- | --- | --- | --- |
| W1 | 接力 | | |
| W2 | 状态条 | | |
| W3 | waves 编排 | | |
| W4 | 狼人杀发牌 | | |
| W5 | wake 反向验证 | | |
| W6 | legacy dm 降级 | | |
| W7 | 中途来消息 steer | | |
| W8 | 喊停三样 + 世代号 | | |
| W9 | 链闸不超发 | | |
| W10 | pair 房重启 | | |
| W11 | 收养回声 | | |
| W12 | 建房拒退休 | | |
| W13 | 私聊名册不可编辑 | | |
| W14 | work 会话身份 | | |
| W15 | 三面一致 + 重载 | | |
| W16 | 打字灯起落 | | |
| W17 | 配置即时同步 | | |
| W18 | 审批卡四场景 | | |

走查之外、C5 还欠的一件事（不在本表）：读 `unsent` 计量分桶（`turn.ts` 把完成回合里 ≥40 字未发正文记为 `kind='unsent'` 的 schedule note，inspector 可见），按 **drive 类型 × 模型 × thinking 是否开启** 交叉，裁决「写而未发」在 W11 的收养回声落地后是否还需要下一轮补救。路线见 `docs/audit/collab-prompt-rules-map-2026-08-02.md` §8。
