# Collab v3 · 真机验收走查清单

日期：2026-08-03。状态：**待执行**（清单已就绪，走查未开始）。
范围：`experiment/castlabs-electron` 的 `1d8b1749..652c0a15`（D0–D6 七个提交）。
方案：`docs/design/collab-actor-v3.md`（§6 分期、§9 实施勘误）。
前一份清单：`docs/audit/collab-consolidation-walkthrough-2026-08-03.md`（C0–C5，W1–W18）——对照表见 §4.3。

---

## 0. 为什么需要这份清单

**v3 是唯一运行时**。D6-b（`652c0a15`）把 v2 的调度链整层删了（coordinator / queue / turn / worker / planner / plan-runner / willingness-runner / steer 八模块，净删 14575 行），提交信息里那行 `BREAKING: v2 协作调度 API 不复存在` 是字面意思。同一份群聊功能换了一套心脏，而**这套心脏一次真机都没跳过**：

- 全部验证停在**单测**（6712 全绿）、**金重放**（合成 fixture + 真实房转录喂新运行时的动词快照）、**构建层**（typecheck / boundary 27 已知红 0 新增 / 三端构建通过）；
- 金重放的输入是**转录**，它照不到的东西恰好是这次改动最多的部分：磁盘上的两本新账（`actors/room.json`、`agents-v3/<id>/`）、跨进程重启、真实模型的裁决与举手、以及**一趟单向门的迁移**；
- C 清单序言里那三个盲区（IPC 逐字段手抄 / 事件真实时序 / scoped CSS 静默截断）在 v3 上一个都没消失，还多了两个：**持久 mailbox 的 at-least-once 语义**（重复消化 = 重复发言）与**迁移不可逆**。

所以「测试绿 + 重放绿」在这里同样不构成结论。

### 0.1 回滚：v3 没有 v2 可退

这份清单与 C 清单最大的不同——**没有「revert 这一期」这个选项**。D6-b 之后 v2 的代码不存在了，单独 revert `652c0a15` 会得到一个「v2 代码回来了但 backend 装配还是 v3」的中间态（D6-a 的接线在 `fd483d1f`）。真要退，只有整段退：

```bash
# 1. 停掉一切在写 store 的进程（桌面端 / dev server / daemon）
# 2. 代码退到 C5 收尾
git revert --no-commit 652c0a15 fd483d1f 5a1d1063 b8eecf40 2c347844 34bd57f5 1d8b1749
#    或直接检出 78882a9e（C0-C5 收尾）作对照
# 3. 还原数据：迁移改写的东西全在 collab/ 与 agents-v3/ 两处
rm -rf  ~/.onething/collab
cp -R   ~/.onething/backup/collab-v2-<时间戳>/  ~/.onething/collab
rm -rf  ~/.onething/agents-v3
#    marker 在 ~/.onething/collab/v3-migrated.json,随 collab/ 一起被覆盖掉
```

三条纪律：

1. **备份目录是唯一的退路**，迁移器在 `--execute` 时自动生成（`<store>/backup/collab-v2-<时间戳>/`）。走查开始前先确认它在、且里面有东西；
2. **迁移不碰 `sessions/`**（一个字节都不写），所以经历流、房间转录、看板在回滚时不需要还原，也不该被还原；
3. **v2 的账没被删**（`collab/<roomId>/state.json` 原样留着），v3 的账落在 `collab/<roomId>/actors/room.json` 与 `agents-v3/`——退回去时 v2 读的还是它自己那本。

---

## 1. 前置与约定

### 1.1 环境

```bash
bun run build       # UI 走查前必须重 build —— dev 与 build 产物在 scoped CSS 上表现不同
bun run dev         # 或分泳道:dev:electron / dev:web
```

- **provider 请求 dump 是「提示词/信封是否真的进去了」的唯一硬证据**：默认开启（`ONETHING_DUMP_PROVIDER_REQUESTS !== '0'`），落在 `~/.onething/log/provider-requests/`。§4 的保密条目全部查这里——**群回合的请求体里不该出现私聊正文**，这件事只有 dump 能证明。
- **只读，不改状态**：走查全程不点会持久化的控件做「试试看」。要看 `~/.onething` 下的账（`actors/room.json`、`agents-v3/<id>/state.json`、`inbox.jsonl`）**先停 server 再看**——迁移器和运行时都在写这批文件，两个进程同时写，后写的赢。
- **迁移器只能用 bun 跑**：`bun scripts/collab-v3-migrate.mjs`。它直接 import TS 源码、走 tsconfig 的 `@onething/*` 路径别名，**裸 `node` 跑会在第一个 import 就炸**（别名解析不了）。

### 1.2 需要预备的场景

| 代号 | 场景 | 用在哪几条 |
| --- | --- | --- |
| R3 | 一间 3 人以上的群房（含 PM），预算与闸可改 | V5 V7 V8 V19 V20 V22 |
| RS | 一间 `responseMode: 'serial'` 的接力房（配好 `speakOrder`） | V9 |
| RD | 一间用户↔agent 私聊房 | V10 V11 |
| RP | 一间 agent↔agent pair 房（无人类在场） | V23 |
| RW | 一张 board 卡（能派出 work 会话） | V15 V17 |
| RG | 狼人杀两房：一间群房 + 一间狼人私聊房，同一位狼在两边 | V13 V21 |
| A-old | 一台**迁移前**的机器（有历史群聊、有未读） | V1 V2 V3 V4 |

> **A-old 是这份清单里最贵的场景**：它只能被消费一次（marker 落盘后重跑整体跳过）。走查前先把 `~/.onething` 整个拷一份到别处，V1–V4 走完若要重来，就从那份拷贝还原。或者用 `--store ~/.onething-v3-test` 在一份副本上先演练一遍。

### 1.3 回滚锚点怎么用

**提交级只在「整段退」的意义上有效**（见 §0.1）；日常定位用**文件级**。七个提交：

| 期 | sha | 主题 | 主要落点 |
| --- | --- | --- | --- |
| D0 | `1d8b1749` | Actor 内核 | `packages/core/actors/`（mailbox / 租约 / ActorBase）、`runtime/src/collab/actors/protocol.ts`、`replay.ts` |
| D1 | `34bd57f5` | RoomActor | `collab/actors/room-rules.ts`（纯层 1050 行）、`floor-policy.ts`、`app/collab/actors/room-{actor,account}.ts` |
| D2 | `2c347844` | AgentActor | `collab/actors/{mind-rules,envelope-fold,notebook-rules}.ts`、`app/collab/actors/{agent-actor,agent-mailbox,mind-port,engine-mind-port,notebook-*}.ts`、`tools/builtin/notebook.ts` |
| D3+D4 | `b8eecf40` | Referee + WorkerChild | `collab/actors/{referee-rules,worker-rules}.ts`、`app/collab/actors/{referee-actor,referee-judge,worker-child,worker-mind-port}.ts` |
| D5 | `5a1d1063` | 迁移器 | `collab/actors/migrate-rules.ts`、`app/collab/actors/migrate.ts`、`scripts/collab-v3-migrate.mjs` |
| D6-a | `fd483d1f` | 生产接线 | `app/collab/actors/{runtime,turn-context,stop-door}.ts`、`app/collab/{ingress,say-tool,inspector}.ts`、backend 装配 |
| D6-b | `652c0a15` | 旧链删除 | 删 26 文件；控制面七函数搬 `app/collab/room-config.ts`；`app/collab/index.ts` 的 `as` 保名转发 |

**「症状 → 先看哪个文件」速查**：

- 谁都不说话 / 全员静默 → `app/collab/actors/runtime.ts` 的举手判据与 `scheduleJudgment`（D6-a 换过一次判据）
- 说了两遍 / 重复播报 → `DurableMailbox` 去重窗（`packages/core/actors/`）+ `room-rules.ts` 的广播检查点 + D6-a「收尾跳过带 `messageId` 的 say」
- 该说话的人被拒 → `room-rules.ts` 的租约校验（epoch 对不上）→ 优先怀疑迁移的 `floorEpoch`（见 V4）
- 状态条空转 / 与实际不符 → `app/collab/inspector.ts:150` 起的 v3 供数口 + `room-actor.ts:400` 起的快照构造
- 停不下来 / 停了还在跑 → `app/collab/actors/stop-door.ts` + `runtime.ts` 的 `stopCollabV3RoomFloor` / `freezeCollabV3RoomWork`

### 1.4 走查前必读：策略的设置口——`responseMode` 已修，`phase` 仍缺

写这份清单时对着代码核了一遍策略的来路，当时的结论是**三档策略在生产上都没有设置口**：

- 房账新建时策略默认 `free`（`createCollabRoomAccount(roomId)` 不带 `policy`，`room-rules.ts:316` 落 `{ name: 'free' }`）；
- 换档的唯一动词是 `referee:set-floor-policy`，唯一发出口是 `CollabRefereeActor.setFloorPolicy()` / `.changePhase()`；
- **这两个方法在生产代码里零调用点**（`referee-actor.ts` 自身与 `room-replay.ts` 的重放架之外，全仓 grep 无命中）；裁决结果那条 `set-floor-policy` 明确带 `policy: 'free'`（`referee-rules.ts:127`，注释说明「裁决只是 free 这一档里这一轮怎么排」）；
- `roomHost()`（`runtime.ts:1009`）注入给 RoomActor 的字段里**没有 `responseMode`**——v2 里 `responseMode === 'serial'` → 接力那条链随 `speaking-order` 的消费者一起没了，`buildCollabRelayRing` 现在只被 `floor-policy.ts` 的 `ring` 策略 import，而 `ring` 没人点。

**`responseMode` 那一半已修（本提交），真机仍需 V9 确认。** 补的是一条纯映射 + 两个生效点（设计文档 §9.3 有完整记录）：

- **映射**：`resolveCollabRoomFloorPolicy(room)`（`collab/actors/floor-policy.ts`）——`serial` → `ring`（`speakOrder` 进环序、`relayLoops` 进收棒圈数）、`auto` → `waves`、`parallel` / 未配 / 私聊房 → `free`；
- **生效点①**：`ensureRoom()` 续播之后调 `CollabRoomActor.syncFloorPolicy()`（`roomHost()` 因此多了一个 `floorPolicy` 端口）；
- **生效点②**：`setCollabRoomConfig` 改完三件套 → `syncCollabV3RoomFloorPolicy(roomId)`，走的仍是 `referee:set-floor-policy` 那条既有的换档路（署名 `room-config`），所以游标清零 / 陈旧裁决窗作废 / 立刻重排都是 D3 已有的语义。

**`phase` 那一半仍是缺口**：相位是跨房的（`activeRooms` 一张表下发给多间房），而房间设置是单房的——它保持裁判专属，`changePhase()` 依旧零生产调用点。

**所以预期是**：V9（serial 接力）**现在应该真的接上了**——请照条目走一遍**确认**，不生效同样记进 §5 的表（那说明映射或某个生效点漏了一条路径）。V13（狼人杀相位）**预期仍是「策略没生效，房间照 free 跑」**——夜里 @ 不被相位门挡；这不是走查失败，是那一半缺口的既定症状，确认后决定要不要为它补一期。

---

## 2. 首次启动与迁移（V1–V4）

### V1 · dry-run 预览

**操作**

```bash
# 先停掉桌面端 / dev server / daemon
bun scripts/collab-v3-migrate.mjs --dry-run     # 或不带参数,dry-run 是默认档
bun scripts/collab-v3-migrate.mjs --json        # 想给别的工具吃就加 --json
```

**预期**

1. 报告逐房列出：房账映射（watermark / chainCount / floorEpoch）、每位 agent 的水位来源、**未读回填条数**；
2. 末行明确打出 `dry-run:一个字节都没写`；
3. **`~/.onething` 下无任何变化**——`ls -la ~/.onething/backup/`（若目录本就不存在，则确认它没被创建）、`collab/v3-migrated.json` 不存在、`agents-v3/` 不存在；
4. `chainCountApproximate` 标记出现在有链数的房上（诚实标记，不是警告）。

**验证的是** D5（`5a1d1063`）：「CLI `--dry-run` 默认零写盘（测试钉住）」+ 对账报告。

**失败时看哪儿** `scripts/collab-v3-migrate.mjs`（参数解析、`--store` 钉 env 的时序）+ `app/collab/actors/migrate.ts`（`dryRun` 是否真的贯穿到每个写点）。若报错是 `Cannot find module '@onething/...'`——你用了 `node` 而不是 `bun`（见 §1.1）。

---

### V2 · 首次启动触发 marker 门控迁移

**操作** 在 A-old 机器上正常启动桌面端（`bun run dev` 或打包版），等首屏出来。

**预期**

1. `~/.onething/backup/collab-v2-<时间戳>/` 出现，内容是 `collab/**` 的整份拷贝；
2. **`sessions/` 没被备份**（备份目录里不该有它——几百 MB 的会话不该被拖进来）；
3. `~/.onething/collab/v3-migrated.json` 落盘（marker）；
4. `~/.onething/agents-v3/<agentId>/` 出现，每位在职同事一套 `inbox.jsonl` / `inbox.cursor` / `state.json`；
5. `~/.onething/collab/<roomId>/actors/room.json` 出现，**v2 的 `collab/<roomId>/state.json` 原样还在**（绝不删 v2 账）；
6. **再启动一次**：整体跳过，日志明确说「已迁过」，备份目录**不再新增第二份**。

**验证的是** D6-a（`fd483d1f`）的装配顺序：「迁移 marker 门控**先于** actor 开箱」+ D5 的幂等重入。

**失败时看哪儿** `app/collab/actors/runtime.ts` 文件头列的四件事（第 1 件就是迁移）+ `migrate.ts` 的 marker 判据。**危险信号**：备份目录出现两份 = marker 没起作用 = 第二次迁移可能在已迁的账上再迁一遍。

---

### V3 · 迁移后旧房打开正常，未读与水位不乱

**操作**

1. 打开三间历史群房（挑一间有大量历史、一间上次退出时有未读、一间很久没动的）；
2. 看左栏未读角标；
3. 进房，滚到底，退出再进；
4. **关键观测**：进房后**同事不该被「回填的未读」再驱动一次发言**——已经读过的消息不该重新推给它们。

**预期**

1. 转录完整（转录零迁移，一个字都不该少）；
2. 未读角标与迁移前一致或更保守（回填只补**游标之后**的尾巴，上限 `COLLAB_DEFAULT_UNREAD_MAX = 50`，从最旧截断）；
3. 打开房间不触发一轮「补答历史消息」的发言潮；
4. 若要核账：`agents-v3/<id>/state.json` 里的 `read` 水位应等于该 agent 执行会话 meta 里旧的 `collab.seenMessageId` 所指位置。

**验证的是** D5：`seenMessageId` → `read` 水位、未读尾巴确定性回填（事件 id 用 `evt:` 真机命名空间而非 `replay:`）、**写入侧去重**（「去重窗挡不住同批重投」是提交信息里点名的坑）。D5 的真机 dry-run 当时读到的回填量是 **26 条**——如果这台机器的量级相仿而进房后炸出十几条发言，那就是回填被当成新消息消化了。

**失败时看哪儿** `collab/actors/migrate-rules.ts` 的回填段 + `core/actors` 的 `DurableMailbox` 去重窗（仅 ACK 入窗）+ `app/collab/actors/agent-actor.ts` 的双水位（`delivered` / `read` 合一则恒零未读）。

---

### V4 · 迁移后的房，有人能开口（floorEpoch 那个真坑）

**操作** 在一间**迁移过来的**老群房里，正常发一条消息，等回复。

**预期** 有人开口。

**为什么单列一条**：D5 提交信息把它叫「真坑」——v2 的 `floorEpoch` 从 0 起算，v3 的租约从 1 起算，直搬会让**迁移后的每一间房里谁说话都被拒**（租约校验拿到一个 stale epoch）。迁移器的对策是**取大者**。这个失效的表现是「群聊彻底哑了但一切看起来正常」，而它只在迁移过的房上出现——新建房不复现，所以必须在 A-old 上专门走一次。

**验证的是** D5 的 `floorEpoch` 取大者。

**失败时看哪儿** `actors/room.json` 里的 `floorEpoch` 与 v2 `state.json` 里的原值对比；判定逻辑在 `collab/actors/room-rules.ts` 的租约校验 + `migrate-rules.ts` 的映射段。

---

## 3. v3 核心行为（V5–V20）

### V5 · 群聊一问一答全链路（举手 → 裁决窗 → 授牌 → 发言 → 广播）

**操作** 在 R3 里发一条**不 @ 任何人**的普通问题（例：「大家觉得这个方案的风险在哪」），全程盯状态条。

**预期** 五段依次可见：

1. **举手**——房间收到 posted，向每位成员发问；D6-a 的判据是**人人举手交裁判**（不是每个 agent 自己先判要不要说）；
2. **裁决窗**——状态条 `judging` 那格亮起，**150ms 防抖窗**内的多次举手合成**一次**裁决调用（`JUDGMENT_DEBOUNCE_MS = 150`，`runtime.ts:975`）；
3. **授牌**——被裁决选中的人拿到租约，`speaking` 那格出现名字；
4. **发言**——打字灯亮（参数流物理信号），消息整条落地；
5. **广播**——其他成员的 mailbox 收到 posted，转录里出现这条。

**验证的是** D1（`34bd57f5`，房账 / 租约 / 广播）+ D3（`b8eecf40`，free 策略批量裁决）+ D6-a（`fd483d1f`，判据换成「人人举手交裁判」、150ms 防抖窗、举手→裁决的生产接线）。

**失败时看哪儿**
- 全员静默 → 举手判据（D6-a 换过一次，原因正是「D2 的启发式在群里无 @ 时全员静默」）
- 一条消息扇出 N 次裁决 → 150ms 窗没合上（`scheduleJudgment`）
- 授了牌但没人说 → `turn-context.ts` 的发言口注册 / `engine-mind-port.ts` 的 drive
- 说了但转录里没有 → `room-rules.ts` 的广播检查点

---

### V6 · `@` 直通授牌，不经裁决

**操作** 在 R3 里发 `@某人 你怎么看`。

**预期**

1. 被 @ 的人**立刻**拿到牌，`judging` 那格**不亮**（@ 是直通，不进裁决）；
2. 若座位已满，被 @ 的人排在**队首**（不是队尾）；
3. 同一位同事**不双持**——它已经在说话时再 @ 它，不会拿到第二张牌。

**验证的是** D1 的 free 策略优先级：`@ 直通授牌（座位满排队首）> 举手 FIFO`。这是 §8 里「@=直通授牌」那条已拍板决策在 v3 的落点。

**失败时看哪儿** `collab/actors/floor-policy.ts` 的 `free` 档（`:285` 起）+ `room-rules.ts` 的授牌路径。

---

### V7 · 无 `@` 的消息走批量裁决，一窗一调用

**操作** 在 R3（≥4 位同事）里连发两条不 @ 人的消息，间隔 1 秒以内；然后看 dump。

**预期**

1. 状态条上 `judging` 亮一次或两次，**不是 N 次**（N = 成员数）——这是 qm P0-2 那条 `O(N)/条 → O(1)/条`；
2. `~/.onething/log/provider-requests/` 里对应时间窗的裁决请求，**一次请求里带着全部候选**（材料里能看到多位候选的 persona 摘要与举手理由）；
3. 裁决结果被**渐进消费**：座位只有一个时，剩下的次序不会被丢掉重算（金重放抓到过「单座位下不渐进会退化成 O(1)/句」）。

**验证的是** D3 的 free 策略：判定窗按触发事件成键、一窗一调用裁决全部候选、结果渐进消费。

**失败时看哪儿** `collab/actors/referee-rules.ts`（材料怎么拼、答案怎么读）+ `app/collab/actors/referee-{actor,judge}.ts`（`COLLAB_REFEREE_TIMEOUT_MS = 8000`；超时/端口崩/解析失败/无裁判 → **降级裁决**，字节等同 D1 的 FIFO——如果每次都是 FIFO 次序，先怀疑降级链一直在触发）。

---

### V8 · 停止按钮清三样

**操作** R3 里让两三位同事同时在说话，按停止。

**预期** 三样同时清干净：

1. 在飞的**租约**作废（没人还握着牌）；
2. **举手队列**清空（不会停完立刻又冒出一批）；
3. 状态条回到空闲，打字灯全灭。

按完停止**再发一条新消息**：房间正常重新起跑，不残留上一轮的牌。

**验证的是** D1 的「三闩各归其闸」（提交信息：第一版「人类消息清三闩」被测试当场抓到反复播报）+ D6-a 的停止走 `stop-door` + D6-b 的 v2 回落分支删除后 `abortCollabRoomTurnForStop` 只剩 v3 一条实现。

**失败时看哪儿** `app/collab/actors/stop-door.ts`（界面语义）→ `runtime.ts:695` `stopCollabV3RoomFloor`（运行时语义）。**两者刻意分家**，症状是「按了没反应」时先确认是哪一层没动。

---

### V9 · serial 房接力照旧（`responseMode` → `ring`）—— **接线已修（本提交），本条改为确认**

**操作** 在 RS（`responseMode: 'serial'`，配好 `speakOrder`）里发一条消息。**再在房间设置里当场把模式切到「并行」又切回「顺序」**（第二个生效点走这条）。

**蓝图预期** 棒子按 `speakOrder` 依次传：一次一个人开口，说完交棒给下一位，`relayLoops` 到点收棒；**免判定**（接力不是排序，是接力——顺序模式下不该有裁决调用）；`@` 定起棒人。

**现在的实际预期 = 蓝图预期**（§1.4：映射 + 两个生效点已接，单测与金重放钉着「配置驱动与显式换档逐字节相同」）。状态条 `mode` 那格是最快的交叉验证——它读**房账的策略名**（`room-actor.ts`：`policy.name === 'ring' ? 'serial' : policy.name === 'free' ? 'parallel' : 'auto'`），进房应显示 `serial`；切成并行应当场变 `parallel`，切回来当场变回 `serial`（不必重启、不必等下一条消息）。

**记什么**：**状态条 mode 显示值** + **是否有裁决调用**（dump，接力档应为零） + **实际发言次序**三样都记进 §5。任一项与蓝图不符 = 映射或某个生效点漏了一条路径。

**验证的是** D3 的 `ring` 策略（`speaking-order` 的确定性环原样 import，`@` 定起棒，`relayLoops` 收棒）+ 本提交补的两个生效点。

**失败时看哪儿** 按「档没换上」与「档换上了但行为不对」分两路：前者看 `resolveCollabRoomFloorPolicy`（`collab/actors/floor-policy.ts` 末尾）→ `roomHost().floorPolicy` / `ensureRoom()` 里的 `syncFloorPolicy()`（`app/collab/actors/runtime.ts`）→ `setCollabRoomConfig` 的 `relayChanged` 分支（`app/collab/room-config.ts`）；后者看 `floor-policy.ts` 的 `ring` 档本身。

---

### V10 · 私聊免裁决，即时应答

**操作** 在 RD（用户↔agent 私聊房）里发一条消息。

**预期**

1. **秒回起步**——没有裁决窗（私聊只有一位对手，裁决是纯延迟税），dump 里那个时间窗**没有裁决请求**；
2. 打字灯正常起落；
3. 链闸不会在私聊里把人闸死（pair / dm 房是 `pairDm` 那一路）。

**验证的是** D1/D3 的免判路径（`roomHost().pairDm`）+ D6-a 的 dm 送达段隔离（`applyV2DmDelivery` 仅未接线时用，接线后走 v3）。

**失败时看哪儿** `runtime.ts` 的 `roomHost().pairDm` / `agentHost().dm` + `collab/actors/room-rules.ts` 的免判分支。

---

### V11 · 跨房 `send_message`（dm）+ 唤醒

**操作** 在 R3 里让同事 A 用 `send_message` 给不在场的同事 B 发一条（或直接 @ 一位不在这间房的人，触发跨房路径）。

**预期**

1. B **不在 R3 出现**（可见性边界不因一次 dm 而变）；
2. B 的信箱收到，B 在**它自己那间房**里被唤醒并回应；
3. A 的下一轮上下文里，这件事**只有信封没有正文**（mailbox 折叠条目**类型上就没有 `content` 字段**——结构保证，不是参数白名单）；
4. poke 文案是固定模板（不可自定义）。

**验证的是** D2 的 mailbox 折叠信封 + D6-a 的 dm 路由（send_message 统一发送面这件事本身是 `f46295be` 的既有能力，v3 只换了投递层）。

**失败时看哪儿** `collab/actors/envelope-fold.ts` + `app/collab/actors/agent-actor.ts` 的折叠缓冲；跨房投递在 `runtime.ts` 的 `postToAgent` / `memberMailbox`。

---

### V12 · 回合中途来消息：同房注入，他房排队

**操作** 趁某位同事**正在说话**时，在同一间房再发一条消息；另开一场，在**别的房**给它发一条。

**预期**

1. 同房那条在**工具边界注入**进正在进行的回合（steer），同事的回答会带上它——**回合期间循环不聋**；
2. 他房那条**只排队**，不打断当前回合；
3. 注入迟到（回合已经在收尾）→ **推迟到交牌之后再举手**，不会凭空多出一次发言。

**验证的是** D2 的心智循环：「起了就放手 + `awaitTurnSlot` 串行」——「一个大脑」这条宪法就落在这一行；steer 在 v3 是循环内建（v2 的 `steer.ts` 已随 D6-b 删除）。

**失败时看哪儿** `collab/actors/mind-rules.ts` + `app/collab/actors/agent-actor.ts` 的注入段。**危险信号**：同一条消息既注入了、回合后又触发一次新发言（重复发言的经典形态）。

---

### V13 · 狼人杀相位：夜里群房举手挂起 —— **高风险条目，先读 §1.4**

**操作** 在 RG 里走一遍夜/昼切换：把相位切到「夜」（活跃房 = 狼人私聊房），在群房发一条消息；再切回「昼」。

**蓝图预期**

1. 夜里群房**发不出牌**（`activeRooms` 是**硬门**，`@` 也不穿透——夜里 @ 一个人会暴露狼）；
2. 夜里在群房举的手**跨相位存活**（不丢），白天切回来后这些手还在队里；
3. 换相 = 换代，上一相的牌一律作废，广播 + 重新发牌走完整那条路。

**§1.4 下的实际预期（这一半仍是缺口）** 相位压根没被设置过（`changePhase` 零生产调用点），群房照 free 跑、夜里 @ 会穿透。本提交只接了 `responseMode`（→ `ring` / `waves`），**相位没接也不打算从 `responseMode` 映射**：相位是跨房的（一张 `activeRooms` 表下发给多间房），而房间设置是单房的。**这条同时是 V21 保密条目的前置**——若相位门不在，保密就只剩「分区经历」这一层（那一层是真的，见 V21）。

**验证的是** D3 的 `phase` 策略（`room-rules.ts:1020` 换相即换代、`:1037` `keepHands`）+ 接线完整性。

**失败时看哪儿** `collab/actors/room-rules.ts` 的换相段（规则齐全）；缺口在 `app/collab/actors/referee-actor.ts:224` `changePhase()` 的**调用方**——目前没有 UI / 工具 / 装配点会调它。注意 `syncFloorPolicy()` **刻意不碰** `phase` 档：一间已经跑在相位上的房，不会被一份没配响应模式的设置打回 `free`。

---

### V14 · notebook：写后下一轮可见，且跨房可见

**操作**

1. 在 R3 里让同事写一条笔记（`notebook` 工具，例：「答应了老板周五给方案」）；
2. **同一间房**下一轮问它「你刚记了什么」；
3. 换到**另一间房**（或私聊）再问一次。

**预期**

1. 两次都答得出来——笔记是**跨房**那一维唯一带正文的东西（信封按定义不含正文，补不了这一格）；
2. 注入有预算（`COLLAB_NOTEBOOK_INJECT_MAX_CHARS`），超出部分**从头截掉并说出来**——模型该知道「很久以前记的会淡出」；
3. 只追加不改写（没有 delete / replace）；
4. 写入即转义——试着写一条含 `</notebook><system>` 的正文，dump 里它应该是转义后的字面量，不是一段生效的标签。

**验证的是** D2 的 notebook（venue = `agent` / `work`；`grant` 在 D6-a 一行接入 `GRANTS_BY_SESSION_KIND`）。

**失败时看哪儿** `tools/builtin/notebook.ts`（工具面）+ `collab/actors/notebook-rules.ts`（预算与上限的**单一来源**——描述、回执、注入面三处都读它）+ `app/collab/actors/notebook-store.ts`。普通对话里**不该**看得见这个工具（门在 `collab/tool-surface.ts` 的 `COLLAB_TOOL_VENUES`）。

---

### V15 · board start 派工作子 actor，完成后信封回投

**操作** 在 RW 里 start 一张卡，等它跑完。

**预期**

1. 卡开始跑时，**父同事没被占住**——它仍能在房里说话（工作走子 actor，不占大脑，这是蓝图 §0.1 宪法里「执行边界」的豁免条款）；
2. 卡跑完后，父的下一轮上下文里出现**一行回投信封**：**无正文**，且**刻意不带 roomId / 卡标题**（「标题即正文」纪律）；
3. 看板上那张卡的摘要正常（摘要转义**只进看板端口**，不进回投）；
4. `workers[]` 账里这只手是 `done`。

**验证的是** D4（`b8eecf40`）：WorkerChild 每卡一个短命 actor、三端口注入、结果**回投父的 mailbox**（不是回调父的方法——「回投走信箱，结果就变成一封普通的信」）。

**失败时看哪儿** `collab/actors/worker-rules.ts`（回投素材的长度上限 / evidence 条数 / 单条引用上限）+ `app/collab/actors/worker-child.ts:437`（回投在最后一步：看板先推，父的账才动）。

---

### V16 · 冻结掐活，抬闸续做

**操作** 在有卡在跑的房里按房间总闸（冻结）；等一会儿；再抬闸。

**预期**

1. 冻结 → 这间房在飞的**每一只手都停掉**，租约作废；
2. **卡的状态刻意不动**（与 v2 逐字一致：冻结中止的是执行，不是这张卡的归属）；
3. 抬闸 → 被冻结搁浅的卡**重新派出去**（续做，不是从零重跑）；
4. 冻结期间发消息：房间不发牌（`frozen` 是**现读** `session.room.frozen`）。

**验证的是** D6-b 的缺口收口：「冻结掐活/抬闸续做补齐」+ `room-config.test` 里补的「冻结换代撤牌 + 抬闸续做」。

**失败时看哪儿** `app/collab/room-config.ts:224` `setCollabRoomFrozen` → `actors/runtime.ts:805` `freezeCollabV3RoomWork` / `:818` `resumeCollabV3RoomWork`。

---

### V17 · 卡级停止，且跨重启认账

**操作**

1. RW 里 start 一张卡，跑起来后**只停这张卡**（不是停整间房）；
2. 另一场：start 一张卡 → **重启应用** → 看这张卡的状态、再试着停它。

**预期**

1. 只有这张卡停，房里其他活照跑；
2. 重启后「这张卡还有活在跑吗」这个问题**答得出来**——v3 读的是磁盘上的 `workers` 账（可跨重启），比 v2 的进程内表更准；
3. 重启后被中断的手是 `interrupted`，**默认不自动重驱**（孤儿对账的选择是 interrupt，不是重跑）。

**验证的是** D6-b：`hasActiveCollabV3Work` 扫 workers 账（提交信息明说「可跨重启，优于 v2 进程内表」）+ `stopCollabV3TaskWork`；对外名字经 `app/collab/index.ts` 的 `as` 保名转发，**IPC 零改动**。

**失败时看哪儿** `runtime.ts:739` `hasActiveCollabV3Work` / `:773` `stopCollabV3TaskWork` + `app/collab/index.ts:57-58` 的保名转发。

---

### V18 · 成员变更：同事知道「谁来了谁走了」

**操作** 在 R3 里加一位同事、移走一位同事；然后让在场的人说一轮话。

**预期**

1. 在场同事的下一轮上下文里出现一条**成员变更信封**；
2. **不再 @ 已经离开的人**——这是 D6-b 补上的洞（提交信息：「此前同事会继续 @ 已离开的人」）；
3. 新加入的人被认得出来（花名册 / 句柄）。

**验证的是** D6-b 的缺口收口：`membership-changed` **生产者补上**（D6-a 时只有消费侧，动词没人发）。

**失败时看哪儿** `app/collab/room-config.ts:494` `postCollabV3MembershipChanged` → `runtime.ts:856` → `collab/actors/protocol.ts:92` 的动词 → agent 侧的折叠。

---

### V19 · 链闸口径变化专项（**这条要记数**）

**背景**：v2 的链数按 **say 计**，v3 按**租约计**，计在**发牌时刻**。一个回合里同事说三句，v2 记 3、**v3 记 1**。这不是 bug，是 D1 有意的新规则（一举消掉 v2 的两个病：不再需要 `floorHolds` 预占；live 与重放同一 fold 公式）。**后果是：你现有的 `maxChain` 配置在 v3 下明显更宽松。**

**操作**

1. 找一间 `maxChain` 配得比较紧的房（或临时调到一个小值，如 3——注意这是**写状态**，走查完记得改回去；若要严格只读，就用现有配置观察）；
2. 发一条会引发讨论的消息，**不再插话**，让它自己跑；
3. **数两个数**：① 从这条人类消息到自然停下来，一共**发出了几张牌**（≈ 几个回合）；② 一共出现了**几条群消息**（同一位同事一个回合里连说两句算两条）。

**预期**

1. ① 应该 ≤ `maxChain`；② 可能显著大于 `maxChain`；
2. 状态条 `gates.chain` 那格的 `value` 跟的是 ①（租约数）；
3. 下一条人类消息把链数**清零**（清零判据沿用 C1 的 `collabMessageResetsChain` / `collabChainReset` 标记）。

**记什么**：把 ①②的比值记进 §5。**这个比值就是你的 `maxChain` 该被除以多少**——如果一回合平均出 2.5 句，那么原来 `maxChain: 8` 在 v3 下等价于 v2 的 20，多半需要调小。这条是这份清单里唯一一条**结论会直接改配置**的条目。

**验证的是** D1 的链账新规则（提交信息里那行 `⚠️ 口径变化: v2 按 say 计/v3 按租约计,maxChain 语义随变(记入 D7 走查)`——就是这条）。

**失败时看哪儿** `collab/actors/room-rules.ts` 的链账 fold + `app/collab/inspector.ts:188` 的 `gates.chain`（`max` 读房间配置，`value` 读房账）。

---

### V20 · typing / speaking / 在忙 三面一致

**操作**

1. R3 里起一轮对话，同时开着：房间视图、工作台状态条、会话列表；
2. 说话中途**重载窗口**（Cmd+R）；
3. 冷启动直接打开这间房（不经列表）。

**预期**

1. 三处显示同一件事——不该出现「状态条说空闲、房里正在打字」；
2. 重载后状态**不丢**（冷启动补水走 `buildCollabCoordinatorState`）；
3. 迟到的回包不会顶掉更新的一帧（`seq` 单调，比屏幕更旧的包被渲染层丢掉）。

**验证的是** C4 的快照协议在 v3 下**原样沿用**（renderer 几乎没改）+ D6-a 的供数口切换：「调度那几格来自 v3 房账；`seq` / `typing` / 『刚才』仍归 inspector」。

**失败时看哪儿** `app/collab/inspector.ts:150` 起（v3 供数口 + 空闲兜底：「读不到」和「空闲」在界面上必须长得一样）+ `app/collab/actors/room-actor.ts:400` 起的快照构造 + `packages/renderer/stores/collabBoard.ts`。**注意**：若某间房还没有 v3 actor（懒建，第一次被寻址才开箱），快照走的是**空闲兜底**——闸的**上限**照读、读数为 0。这是有意行为，不是 bug。

---

## 4. 保密与回归（V21–V23 + C 清单对照）

### V21 · 狼人牌只在私聊房与 notebook，群发言无泄漏

**操作**（RG 场景，这是**蓝图 §1.3** 那三条一票否决的真机验证面；本节里凡「§1.x」带「蓝图」二字的都指 `collab-actor-v3.md`，不带的指本文）

1. 狼 A 在狼人私聊房里说一句只有狼知道的话（例：「今晚刀 3 号」）；
2. 狼 B **在群房**说一轮话；
3. 查 dump：狼 B 这一轮的 provider 请求体。

**预期**

1. 请求体里**只有信封没有正文**——能看到「狼人房有 1 条新消息」这类折叠条目，**看不到「今晚刀 3 号」**；
2. 群里的发言不含私聊内容（这一层靠**结构**，不是靠提示词纪律——折叠条目类型上就没有 `content` 字段）；
3. 反向：狼 B 在**狼人私聊房**里说话时，正文当然在——分区经历流是按房分的。

**验证的是** D2 的保密不变量（§1.3 落地）：「金重放三连测：狼 B 群回合只见信封不见狼 A 私聊正文；任何心智调用 drive 无他房正文」。**金重放已经证明了代码路径；这条证明真机装配没有绕开它**（dump 是唯一硬证据）。

**失败时看哪儿** `collab/actors/envelope-fold.ts`（折叠条目类型）+ `app/collab/actors/engine-mind-port.ts`（drive 组装：谁往请求里塞了什么）+ `runtime.ts:1170` 附近的 `buildV3RoomContext`。**这条失败是 P0**，比清单里任何一条都严重。

---

### V22 · 一个大脑：同一位同事同一时刻至多一路对话性调用

**操作** 让同一位同事同时被两间房需要：R3 里 @ 它，趁它在说话时在 RD（或另一间群房）也 @ 它。

**预期**

1. 两件事**串行**发生（先答完一边再答另一边），**不是并行两路**；
2. 但它**不聋**——同房的新消息仍能在回合中注入（见 V12）；
3. 与此同时它的 **work 子 actor 可以并行**（V15 已验）——豁免条款只给工作，不给对话。

**验证的是** 蓝图 §0.1 宪法里「执行边界 = AgentActor 心智循环，全局唯一」+ D2 的 `awaitTurnSlot` 串行。

**失败时看哪儿** `app/collab/actors/agent-actor.ts` 的循环（`for await (batch of mailbox)` + `awaitTurnSlot`）。**症状**：同一位同事在两间房同时打字 = 一个大脑变两个 = 跨房自相矛盾会跟着回来。

---

### V23 · 租约与广播跨重启：不冻死、不重播

**操作**

1. RP（agent↔agent pair 房，无人类在场）里让它们聊起来，**中途杀掉应用**（或重启）；
2. 重启后进这间房；
3. 另一场：在**广播扇出的一瞬间**杀掉（多试几次撞时机），重启后看转录。

**预期**

1. 重启后 RP **仍能开口**——无人类的房不会因为重算链数而顶格冻死（这是 C1 A2 那条老病在 v3 下的回归面）；
2. 转录里**没有重复消息**——广播 pending 有检查点，崩溃续播不重复；
3. 续播发生在**起循环之前**（账里那几条在飞广播是上一条命留下的，先补完再收新信，成员看到的次序才与崩溃前一致）。

**验证的是** D1 的广播检查点续播 + D6-a 装配的 `resumeBroadcasts()` 时序（`runtime.ts:426` 附近，注释明写这条纪律）+ D5 的 `chainCount` 保守近似（只低估，下一条人类消息自愈）。

**失败时看哪儿** `app/collab/actors/runtime.ts` 的 `ensureRoom`（续播在 `actor.start()` 之前）+ `room-rules.ts` 的广播检查点 + `core/actors` 的 mailbox 游标原子写（at-least-once + 仅 ACK 入去重窗）。

---

### 4.3 与 C0–C5 走查清单（W1–W18）的对照

`docs/audit/collab-consolidation-walkthrough-2026-08-03.md` 的 18 条里，**调度面的被 v3 取代，其余仍然有效**。若那份清单还没走完，按下表取舍：

| C 条目 | 状态 | 对照 |
| --- | --- | --- |
| W1 接力 | **被取代** | → V9（v2 的 `speaking-order` 消费链已删，重生为 `ring` 策略；设置口已补，见 §1.4） |
| W2 协调器状态条 | **被取代** | → V20 + V5（供数口改读 v3 房账，`seq`/`typing` 仍归 inspector） |
| W3 waves 编排 | **被取代** | → 无独立条目：`waves` 是 D3 的四策略之一。`responseMode: 'auto'` 现在会把房间放到 `waves` 档（§1.4），但**编排本身仍要裁判下发**，而 `setFloorPolicy` 零生产调用点——所以行为上它此刻等同 `free`，随 V9/V13 一并记录 |
| W4 狼人杀发牌（send_message + wake） | **部分适用** | 发送面（`send_message` 统一 + wake 文案）**仍有效**，照走；调度/相位那半 → V13 |
| W5 wake 反向验证 | **仍适用** | `typing.ts` / `circuit-breaker.ts` 未随 v2 调度链删除 |
| W6 legacy `dm` 降级出口 | **仍适用** | `tools/builtin/say.ts` 的 `formatValidationError` 未动 |
| W7 中途来消息默认 steer | **被取代** | → V12（`steer.ts` 已删，steer 是心智循环内建） |
| W8 喊停清三样 + floor 世代号跨重启 | **被取代** | → V8 + V23（三闩改由租约/举手队列/房账承载） |
| W9 链闸并发不超发 | **被取代** | → V19 + V5（口径从「按 say」改为「按租约」，旧的 4/2 复现用例在 v3 下不成立） |
| W10 pair 房重启不冻死 | **被取代** | → V23（清零标记 `collabChainReset` 沿用，重算路径换成房账） |
| W11 收养事实回声 | **仍适用** | `noteCollabAdoptedEcho` / `formatCollabAdoptedEcho` 在 v3 里原样被 `engine-mind-port.ts` 与 `runtime.ts:1170` 消费 |
| W12 建房拒收退休 agent | **仍适用** | `app/collab/room-create.ts` 未动 |
| W13 私聊房名册不可编辑 | **仍适用** | 守卫在 `room-runtime.ts` / `room-config.ts`，未动 |
| W14 work 会话知道自己在干活 | **仍适用** | `system-prompt.ts` 的 work 分支未动；v3 下子 actor 跑的仍是 work 会话，顺带在 V15 复看 |
| W15 三面一致 + 窗口重载不丢 | **被取代** | → V20 |
| W16 打字灯起落 | **仍适用** | typing 账仍归 `inspector.ts`（v3 只换了调度那几格的来源） |
| W17 房间配置即时同步 | **仍适用** | 控制面七函数搬去 `room-config.ts`，**对外名字零改动**；走查面不变 |
| W18 审批卡四场景 | **仍适用** | 纯 renderer + 权限链路，v3 未触及 |

---

## 5. 结果记录

逐条落，**「部分」与「未走」也要落**——空着与通过分不开，是这类清单最常见的失效方式。

| # | 项 | 结果（通过 / 失败 / 部分 / 未走） | 现象与证据（截图 / dump 路径 / 日志行） |
| --- | --- | --- | --- |
| V1 | 迁移 dry-run 零写盘 | | |
| V2 | 首启 marker 门控迁移 | | |
| V3 | 迁移后未读/水位不乱 | | |
| V4 | 迁移后的房有人能开口 | | |
| V5 | 一问一答全链路 | | |
| V6 | `@` 直通授牌 | | |
| V7 | 批量裁决一窗一调用 | | |
| V8 | 停止清三样 | | |
| V9 | serial 接力（见 §1.4） | | mode 显示值＝　　／有无裁决调用＝　　／实际次序＝ |
| V10 | 私聊免裁决 | | |
| V11 | 跨房 dm + 唤醒 | | |
| V12 | 中途来消息：同房注入/他房排队 | | |
| V13 | 狼人杀相位（见 §1.4） | | |
| V14 | notebook 跨轮跨房可见 | | |
| V15 | board start 子 actor + 回投 | | |
| V16 | 冻结掐活 / 抬闸续做 | | |
| V17 | 卡级停止 + 跨重启认账 | | |
| V18 | 成员变更信封 | | |
| V19 | 链闸口径（**记数**） | | 租约数＝　　／消息条数＝　　／比值＝　　→ maxChain 建议值＝ |
| V20 | 三面一致 + 重载不丢 | | |
| V21 | 保密不泄漏（**P0**） | | dump 路径： |
| V22 | 一个大脑串行 | | |
| V23 | 租约/广播跨重启 | | |

### 走查之后要裁决的三件事

1. **§1.4 的策略设置口**——`responseMode` 那一半已修（本提交：映射 + 装配/改设置两个生效点），V9 改为**真机确认**；剩下的裁决只有两条：`phase` 要不要补一期（V13 的结果说了算）、`waves` 的编排下发口（`auto` 档现在站上去了，但没人给编排）要不要跟着做；
2. **`maxChain` 重设**——V19 的比值直接给出新配置；
3. **`unsent` 读数**（C 清单遗留的那件事在 v3 下的形态）：v2 的 `turn.ts` 已删，「写而未发」的收养兜底现在在 `app/collab/actors/engine-mind-port.ts:275` 的 `adoptUnsentProse`。走查里若观察到「同事写了长正文但群里没出现」，记下来——它决定这条老病在 v3 下是好了还是换了个形态。
