# 房间的响应模式：并行 / 顺序（接力）+ 显式发言次序

状态：**已实施**（2026-08-02）
日期：2026-08-01（设计）/ 2026-08-02（落地）
前置：`qm-collab-learnings.md`（§1.3 路由表 / P0-2 抢麦判定 / §3 弱项对照）、`multi-agent-collab-im.md`（§2 意愿判定 / §6.4 pass / W21 冷却）、`collab-wake-route-and-reaction-actions.md`（A 喊停清三样）、`collab-agent-view.md`（P4 未读闸与按人折叠）

一间房里"谁先说"目前是**入队顺序**的副产品：@ 的按消息里的书写顺序，自选发言的按 `memberAgentIds` 数组顺序，然后并行发牌（上限 6）。这份设计给房间加两个参数——**响应模式**与**发言次序列表**——让"依次发言"成为一个可依赖的机制。

**核心结论先行：顺序模式的语义是「接力」，不是「给这一轮愿意说话的人排个序」。** 这个区别是整份文档的重心，理由见 §1。

---

## 0. 现状

三段，分别在三个文件里：

| 段 | 位置 | 干什么 |
| --- | --- | --- |
| 谁**必须**说 | `collab/activation.ts:169` `decideCollabActivations` | 冻结门 / @ 短路 / dm 免判 / 链长闸 |
| 谁**想**说 | `app/collab/queue.ts:76` `electWillingSpeakers` → `app/collab/willingness-runner.ts:190` | 冷却过滤后每人一次判定（8s 死线、64 token、`thinking:false`），失败一律沉默 |
| 谁**先**说 | `app/collab/queue.ts:320` `processQueue` | **FIFO**，并行发牌，上限 `maxConcurrentTurns`（默认 6，`room-runtime.ts:267`） |

两条已经存在、本设计要建立在其上的事实：

- **串行发言今天就能跑**：`maxConcurrentTurns: 1` 即严格串行（`queue.ts:359` 起一条就 `Promise.race` 等它跑完）。
- **串行时后说的人读得到先说的人**：`say` 落进房间转录后，下一位的 `planCollabHistoryWindow` 会把它算进未读（`turn.ts:465`）。并行时两条回合读同一份房间快照，谁都看不见对方那句话（`queue.ts:315` 的注释已写明这个代价）。

---

## 1. 验收用例：四人房，"按顺序从 1 数到 10"

这个用例是本设计的验收标准，也是它推翻上一版方案的原因。

### 1.1 现状怎么跑

1. 用户消息无 @ → 买 4 次意愿判定 → 假设 4 人都答 yes → 队列 `[A,B,C,D]`
2. 串行下 A 说「1」→ **回合收尾再买一轮判定**（`turn.ts:979`）→ B/C/D 重判 → `foldIntoQueued` 折进已有记录
3. B 说「2」… D 说「4」→ 队列空
4. 之后只剩级联判定这一条路：冷却过滤（`cooldown.ts:117`，K_cd=2）放行 A、B，再判一次

**能不能数到 10，取决于连续约 30 次独立 yes/no 判定全部答对。** 任何一个 no 都让计数静默停住，而且不会有任何东西解释为什么。冷却过滤恰好让它**看起来**像轮转——那是巧合，不是机制。

### 1.2 "排序"方案（本文档第一版）也做不到

第一版的形态是「判定选出愿意说话的人，再按列表排序」。它排的是**一轮之内**的次序，而"数到 10"是**跨十轮的接力**；那一版还刻意规定了"级联出来的人进下一轮"，使列表次序跨轮不保证。方案与用例对不上，整体作废。

### 1.3 接力怎么跑

棒子从 A 起 → A 读到用户消息，说「1」→ 棒传 B → B 读到 A 的「1」，说「2」→ … D 说「4」→ 回到 A 说「5」→ … 到「10」之后再轮到谁，他无话可说就直接结束回合（不调 `say`，现成的合法沉默路径，`turn.ts:998`）→ **连续一圈无人开口 = 停**。

确定性的环，零判定调用。

---

## 2. 数据形状

```ts
// packages/shared/ipc/chat.ts · RoomConfig
interface RoomConfig {
  // …
  /** 响应模式。缺省 = 'parallel'（现状零回归） */
  responseMode?: 'parallel' | 'serial'
  /** 顺序模式下的接力次序（agent id）。只在 responseMode === 'serial' 时读 */
  speakOrder?: string[]
  /**
   * 一趟接力最多跑几圈。缺省见 §3⑤；**0 = 不限**（与本仓库其它闸同一套约定，
   * 靠"一圈静默"与链闸收尾）。
   *
   * 单位是**圈**（1 圈 = 环长次发言机会），但内部按**棒数**计
   * （上限 = relayLoops × 环长）——@ 抢棒会绕回，按"圈"数边界会失准。
   */
  relayLoops?: number
}
```

```ts
// packages/onething-runtime/src/collab/activation.ts
type CollabActivationReason = 'mention' | 'self-elected' | 'task-event' | 'schedule' | 'relay'
COLLAB_ACTIVATION_LABELS.relay = '轮到发言'
```

`'relay'` 是本期唯一的新激活理由。它在 `resolveCollabChainCap`（`activation.ts:36`）里与 mention/self-elected 同档——走房间那一格 `maxChain`，不豁免。

**顺序模式不复用 `maxConcurrentTurns`。** 设计中先提过"顺序 = 把并发上限填 1"，收回：既然要一个显式模式开关，让人去猜"填 1 等于顺序"是把机制当接口用。落地形态是 `responseMode === 'serial'` 时并发上限**恒为 1**、`maxConcurrentTurns` 被忽略、UI 上那一格隐藏。

---

## 3. 接力语义

### ① 起棒

- 用户消息 **@ 了人** → 从列表里**最靠前的那位被 @ 者**起棒（守住"点名必须能应"）
- 没 @ → 从**列表首位**起棒
- 顺序模式下**不买意愿判定**：`handleRoomUserMessage` 跳过 `electWillingSpeakers`（`queue.ts:526`），直接入队一条 `reason: 'relay'`

### ② 传棒

回合收尾（`turn.ts` 的 cascade 处）把棒交给列表里的**下一位**（环形），入队一条新的 `'relay'`。顺序模式下这里同样**不买判定**，`electWillingSpeakers` 整段跳过。

### ③ @ 抢棒

发言里 @ 了别人（`turn.ts:932` 已经解析好 mentions）→ 下一棒交给**被 @ 的那位**，之后从他的位置继续按列表传。这保持"点名必须能应"，并让接力环在对话真的需要时能拐弯。

**已知副作用：抢棒会绕回。** 环 A→B→C→D，C 持棒时 @ 了 A，A 说完下一位是 B，而 B 刚说过。在"数到 10"里这恰好是对的（B 接着数下一个），别的场景可能形成回环。不为它加机制——⑤ 的圈数上限与链闸各兜一层，而按棒数计的实现让绕回不影响终止判断。

### ④ 列表内外

- 不在 `speakOrder` 里的成员 → **排到末尾**，按名册序。列表定义的是已列出者的相对次序，不是准入名单；新拉进房的人不改列表也能进环。
- 列表里已退休 / 已离房的 id → **读时忽略，不清理**。与 `memberAgentIds` 保留退休成员同一纪律（`coordinator.ts:304`）：数据不动，他被拉回来时次序还在。
- `speakOrder` 为空 / 未配 → 直接用名册序。顺序模式因此**开箱可用**，列表是可选的精调。

### ⑤ 终止（先命中者生效）

**"谁有权收棒"在配置阶段就回答了，不在运行时问模型。** 这是本设计的一条红线：任何交给模型自觉的收棒信号，都把接力好不容易换来的确定性又还回去了（被否掉的方案见 §7）。

1. **圈数用完** —— `relayBatons ≥ relayLoops × 环长` → 停，并贴一行系统行：
   「他们轮了 N 圈，我先按住了——你说一句话就继续」。措辞与链闸那一行同款（`turn.ts:955`），因为它是同一类事实：机器按住了一段还能继续的对话，用户有权知道以及怎么解开。`relayLoops === 0` → Infinity，这一条不参与。

   > **缺省取 0 = 不限**（2026-08-02 落地时定）。另一个候选是 1（每人各说一次就停），零空转、最省，但它会让 §1 那个验收用例在默认配置下只数到 4。选顺序模式的动机是"让他们把一件事走完"，而不是"每人表个态"——后者并行模式已经覆盖了。代价写在 §4：每趟接力固定多空转一圈。要改只有一处：`collabRelayLoopsFor` 的回落值。
2. **连续一圈无人开口** —— `relayPassStreak ≥ 环长` → 停，**不贴系统行**。这是自然收尾（"数到 10 之后没人还有话说"），不是机器按住了什么，没什么要向用户解释的。计数器任何一次 `say` 归零。
   > 阈值是**环长**而不是更小的数，是为了保证**每人至少有一次机会**：四人房里一个只有 D 懂的问题，若 A、B 连着沉默就停，D 永远开不了口。走满一圈正是顺序模式的语义。
3. **链长闸** `maxChain`（默认 `COLLAB_DEFAULT_MAX_CHAIN = 32`，`types.ts:130`）—— 现成，无人类输入时的全房总闸。与 1 独立：链闸跨模式、管的是"讨论最多走多长"；圈数是接力专属。谁更严谁先命中，不合并成一格。
4. **用户喊停** —— floor 世代号换代，现成机制（`room-runtime.ts:311`），棒子掉地。
5. **冻结 / 预算 / 引擎未绑** —— 现成的全房闸，`processQueue` 照旧停发。

**计数的生命周期**：一趟接力 = 一次起棒到终止。`relayBatons` 与 `relayPassStreak` 在**新的真实用户消息**到来时归零——与链闸重置同一个触发点（`queue.ts:435` 那一行），也是同一条理由：人开口了，讨论就重新开始计。两个计数都落在 `state.json`（跟 `chainCount` 一格），只活在内存里的话，一次重启会让 `reconcileRoom` 重排的 relay 记录带着归零的计数继续跑，最坏多空转一圈。那个文件本来每次就同步写，落盘成本为零。

### ⑤bis 一根棒子（自审补，2026-08-02）

**同一间房在任一时刻最多有一条 outstanding 的 relay 激活。** 这条不变量在设计里是隐含的，落地时漏了，自审时被一个测试抓出来。

失效路径：A 正在说话，用户写「@Iris 你也看看」。路由判 `engage`（点名必须能应，Iris 没在说话），于是队里多了一条 relay；而 A 收尾时**也**会传棒 —— 环上就有了两根棒子。症状是 `a, c, b, d, a, c…` 这样的交错双序列：发言速率翻倍、次序乱掉，而两根各自算圈数，谁都不觉得自己越界。

两头都要守，只守一头都不成立：

- **传棒侧**（`turn.ts`）：队里或 `inFlight` 里已有别的 relay 就不传（按 id 排除自己——自己要到 `driveActivation` 的 finally 才离开 `inFlight`）。计数照常推进：这一棒确实跑过了，而那是同一趟。
- **起棒侧**（`queue.ts`）：队里已有一条**还没起跑**的 relay 时不新增，而是**改派**它——锚点前移、持棒人换成新消息点到的那位。改派而不是丢弃，是因为「点名必须能应」：新消息点了谁，下一个开口的就该是谁。

### ⑥ 不进环的东西

- **任务事件 / 定时**（`task-event`、`schedule`）：工作流在汇报，不是一轮对话，该尽快到负责人手上。照旧走现有路径，不排队等棒子。与它们豁免链长闸（`activation.ts:36`）、豁免 floor 作废（`room-runtime.ts:80`）同一条口径。
- **私聊房**（单成员 / 双成员 dm）：走免判合成 mention 的既有路径，`responseMode` 不适用。
- **并行模式**：一行不改。

### ⑦ 未读闸对 `'relay'` 豁免

`turn.ts:458` 的未读闸只认 `mention` / `self-elected`，新理由自动落在豁免侧——这是刻意的，不是巧合：**"轮到你了"不是"去看看"**。一位轮到棒子但确实无话可说的同事，应该由它自己在回合里选择沉默（那也是终止条件 ⑤.1 的输入），而不是被闸在门外拦掉——被拦掉的话棒子就断在那里了。

---

## 4. 接力的代价，明说

**一圈里没话说的人也各花一次全上下文回合。** 四人房数完 10 之后要再空转一圈（4 次回合调用）才停。这是接力换来确定性的价钱，不掩饰。

三条缓解，两条是配置、一条是措辞，都不加机制：

- **圈数上限 `relayLoops`**（⑤.1）：知道这趟该跑多久的场景直接填，一棒都不空转。
- 终止条件 ⑤.2 把空转封在**一圈**，不是无限。
- drive 行明确告诉被驱动者「轮到你了；如果没有你要补的内容，直接结束回合，不要客套」——客套正是把空转一圈变成再数一轮的东西。

反过来，接力省掉了并行模式每条消息 N 次的意愿判定调用。**总账上顺序模式比并行模式更便宜**，只是钱花在别处。

---

## 5. 被删除的设计：轮次失效闸（K 人闸）

第一版有一节「本轮已说 K 人后，同轮剩余的自选发言作废」，动机是**陈旧激活**。

说清楚这里"陈旧"的是什么：**不是身份，是时点**。房间 id 与执行会话 id 全程不变（每群每 agent 一条常驻会话，collab-team-v2 §1.1），变的是 `session.messages`。D 的那句"我要说话"是对判定那一刻的转录做的决定，而它真正开口时，前面三位已经各说了一句——**决定和执行之间隔着别人说的话**。未读闸（`turn.ts:458`）挡不住它（前几位刚说的话恰恰算未读），按人折叠（`queue.ts:201`）也挡不住（它只管同一个人的多条激活）。

**接力模式下这个问题不存在**——没有"提前判定、稍后执行"的间隙，轮到谁才把谁拉起来，他一次性读到最新的转录再决定说什么。并行模式保持现状，也不需要它。

整节删除。这是形态改对之后自然消失的一个补丁，记在这里是因为它值得一句提醒：**当一个闸的存在理由是另一处设计的时序缺陷时，先看那处设计能不能改掉。**

---

## 6. 落点与分期

### P1 · 接力模式（核心）

**纯规则（新文件）** `packages/onething-runtime/src/collab/speaking-order.ts`

```ts
/** 接力环:列表 → 在册过滤 → 列表外按名册序补到末尾（③④） */
export function buildCollabRelayRing(options: {
  speakOrder?: readonly string[]
  members: readonly CollabAgentLike[]   // 已按在职过滤(roomMembers)
}): string[]

/** 起棒(①):@ 到的人里列表最靠前的那位,没有则环首 */
export function pickCollabRelayStarter(
  ring: readonly string[],
  mentionedAgentIds?: readonly string[],
): string | undefined

/** 传棒(②③):@ 抢棒优先,否则环形下一位 */
export function pickCollabRelayNext(
  ring: readonly string[],
  currentAgentId: string,
  mentionedAgentIds?: readonly string[],
): string | undefined
```

零 I/O、零依赖。本期的全部判断逻辑落在这三个函数里，测试也全落这里。

再加一个**终止判定**，同样是纯函数——传棒与否的全部条件收在一处，装配层只负责喂事实、把算好的计数存回去：

```ts
export function shouldPassCollabRelayBaton(options: {
  outcome: 'complete' | 'incomplete'  // 中止/超时/失败都是 incomplete
  spoke: boolean                      // 这一棒有没有产生 say
  batons: number                      // 这一棒**之前**的计数
  passStreak: number
  ringLength: number
  relayLoops: number                  // 0 = 不限
}): {
  pass: boolean
  reason?: 'turn-incomplete' | 'ring-too-short' | 'silent-lap' | 'loops-exhausted'
  batons: number                      // 这一棒之后的计数,调用方存回 state
  passStreak: number
}
```

两处落地时的收窄：

- **计数由它算，不由调用方算**。原本想让装配层先更新计数再来问，那样 `spoke` 与 `passStreak` 就是同一件事的两种说法，早晚有一处先改。现在counter 与决定同源。
- **`reason` 不是装饰**：`'loops-exhausted'` 要贴系统行，其余三种都不贴（⑤）。`'ring-too-short'` 是落地时补的第四种——一个人的环不是接力，传给自己只会让同一位对着自己的上一句话再说一遍。
- **检查次序：静默排在圈数之前**。用户配了 3 圈、第 2 圈全员没话说时该静静收尾，而不是宣布「他们轮了 3 圈，我先按住了」——他们既没轮满，也没有什么被按住。

**类型**
- `packages/shared/ipc/chat.ts:140` 加 `responseMode` / `speakOrder` / `relayLoops`
- `collab/activation.ts:7` 加 `'relay'` + 标签 + `resolveCollabChainCap` 走房间那一格
- `CollabRoomStateFile`（`room-runtime.ts:96`）加 `relayBatons` / `relayPassStreak`，跟 `chainCount` 一格落盘（⑤ 末段）
- `CollabRoomConfigPatch`（`coordinator.ts:257`）与 `setCollabRoomConfig` 加校验：`speakOrder` 元素为非空字符串、去重、**不校验是否在册**（④）；`relayLoops` 有限、≥0、取整——与 `setCollabRoomBudgets`（`coordinator.ts:397`）那族数值闸同一套写法

**装配**
- `app/collab/queue.ts:526` `handleRoomUserMessage`：顺序模式 → 跳过 `electWillingSpeakers`，入队起棒者；在链闸归零那一行（`queue.ts:435`）旁边把两个接力计数一并归零
- `app/collab/turn.ts:979` cascade：顺序模式 → 跳过 `electWillingSpeakers`，先问 `shouldPassCollabRelayBaton`，`pass` 为真则按 ②③ 入队下一棒，`reason === 'loops-exhausted'` 时 `postSystemLine`
- `app/collab/room-runtime.ts`：`maxConcurrentTurnsFor` 在顺序模式下恒返回 1
- 喊停 / 冻结路径无需改动：棒子活在队列里，floor 换代与 `runtime.queue.length = 0` 已经把它清掉

### P2 · Drive 行带次序

顺序模式下 drive 行明说轮次与环位（`activation.ts:65` 的标签体系已有 override 通道）：

```
轮到发言 · 本房按顺序发言,次序:阿般 → 你 → Iris → 老丁
```

不加这一条，被驱动者不知道自己在一个环里，也就不知道"接着上一位往下"——它会当成一次普通的被点名。§4 那句"没有要补的就直接结束回合"也写在这里。

> 注：想法②「按角色身份/提示词判断」在**并行模式**下已经成立（persona 原文进 system、title/description 进花名册、PM 有专属 fact，`willingness.ts:171`）。顺序模式免判定，②在那里退化成"环的次序就是角色分工"。并行模式判定侧还剩两个真缺口——**冷却过滤跑在 persona 之前**（`cooldown.ts:117`，让"主持人"类角色被结构静默）与**房间级群规缺失**（`qm-collab-learnings.md` P0-1）——不在本期，另开。

### P3 · UI

`packages/renderer/components/chat/RoomSettingsDialog.vue`：

- 「响应模式」下拉：并行 / 顺序
- 并行 → 露出「同时发言上限」
- 顺序 → 露出成员次序列表（每行 **上移 / 下移** 两个小按钮）+ 一格「轮次」（`relayLoops`，标注 0 = 不限）

用箭头不用拖拽：渲染层没有可复用的列表拖拽排序组件（现有 `draggable` 只在页签 `TabItem.vue` 和附件缩略图 `AttachmentThumb.vue` 上），为一个设置项造一个不划算，而箭头在这种 3–8 行的短列表上更准。参数跟着模式显隐，不并排摆几个数字框。

---

## 7. 被否掉与被收回的方案

- **排序方案**（判定选人 → 按列表排序）——作废，见 §1.2。它连本设计的验收用例都跑不过。
- **四种排序模式枚举**（`'roster' | 'pm-first' | 'pm-last' | 'explicit'`）——收回。显式列表把这件事一次说完，还多表达了"三个人里只固定前两位"这种排法。
- **顺序判定**（逐个判、提前退出）——出局。它让第 2 个人知道"第 1 个人要说话"，但不知道他要**说什么**；真机上的重复发言是内容撞车不是意图撞车。代价却是 5 人房最坏 5×8s 无人开口。接力从根上绕开了它：顺序模式压根不判定。
- **顺序 = `maxConcurrentTurns: 1`**——收回，见 §2。
- **让持棒者显式收棒**（`say` 加 `handoff: 'next' | 'stop'`，或一个轻量收棒信号）——出局。它把"这趟接力跑多久"的决定权交回给模型的自觉，而这份设计的全部价值就是不这么做：一次该收没收、或该传没传，接力就退回成"碰运气"。**收棒权改在配置阶段用 `relayLoops` 表达**（用户决定，2026-08-01）——那正是回答"这间房要跑多久"的地方，而且是确定性的。工具面不变，也顺带守住了 `tool-surface.ts` 的收敛纪律。
- **抢麦判定（batch，O(1)）**——本期不做。记一笔冲突：一个仲裁者调用装不下 N 份 persona 原文，装了就退化成一次贵调用；若日后做，需要给每位同事一份**短的参与规则**（≤3 行）与长 persona 分家。它属于**并行模式**的成本优化，与接力正交。

---

## 8. 测试

- `packages/onething-runtime/src/collab/__tests__/speaking-order.test.ts`（纯规则）
  - 环的构造：列表次序生效；列表外成员排尾按名册序；退休 / 已离房 id 被忽略且不影响其余次序（④）
  - 空列表 → 退化为名册序（④）
  - 起棒：@ 到多人时取列表最靠前者；无 @ 取环首（①）
  - 传棒：环形回绕；@ 抢棒优先于环序（②③）
  - 当前持棒者已离房 → 下一棒仍能算出（不因一个失效 id 断环）
  - 终止判定 `shouldPassCollabRelayBaton`：圈数用完 / 一圈静默 / 回合非 complete 各自的 `reason`；`relayLoops === 0` 时圈数一条不参与；`say` 出现时 streak 归零；**@ 抢棒绕回不影响棒数计**（③）
- `packages/onething-runtime/src/app/collab/__tests__/coordinator-relay.test.ts`
  - **数到 10 的集成用例**：四人房、一条用户消息、断言发言者序列为 A,B,C,D,A,B,C,D,A,B（§1.3）
  - 顺序模式下 `electWillingSpeakers` **一次都不被调用**
  - 圈数用完 → 停 + 系统行（⑤.1）；连续一圈无 `say` → 停且**不贴系统行**（⑤.2）
  - 链长闸命中 → 停（⑤.3）；用户喊停 → 棒子作废（⑤.4）
  - 新的用户消息把 `relayBatons` / `relayPassStreak` 归零，接力重新开始计
  - 任务事件不进环（⑥）；并行模式行为逐字不变
- `packages/renderer/components/chat/__tests__/room-settings-form.test.ts`
  - 次序表读出来始终完整；`orderRoomSpeakers` 丢掉已离房 id 且保住其余次序
  - 次序相等是**序列**相等（只换顺序也算改动），名册相等仍是集合相等
  - 并行模式不写次序与轮次；顺序模式不写同时发言上限——一次无关的保存不该钉死一格不生效的配置
- 回归：`collab/` 与 `app/collab/` 两棵树 925 例全绿（2026-08-02），含
  `coordinator-wake-route` / `coordinator-abort` / `coordinator-unread-gate`——本期动了入队时机与 cascade，这三处压在同一条链上。

---

## 9. 已知边界（自审记录，未修）

两条都真实存在、都判为不值得为它加机制，记在这里免得下次当成新发现：

1. **持棒者在"入队 → 起跑"之间退休/离房 → 这趟接力静默停住。** `driveActivation` 的退休门（`turn.ts` 那条「查无此人,或者这个人已经退休」）在回合窗口**之前**就 `return`，够不到传棒那段代码，所以棒子掉在地上。窗口很窄（几百毫秒，或一次重启后对账出来的旧记录撞上刚被移出名册的人），后果是"房间不再接话，直到你再说一句" —— 群房里沉默本来就是合法状态，而用户的下一条消息会重新起棒。要修的话得让第三处也认识 relay，不划算。
2. **一条消息同时 @ 了正在说话的人和另一个人时，起棒者可能就是那位正在说话的。** 路由判 `engage`（有人没在说话），而起棒取的是"环上最靠前的被 @ 者"—— 可能正是当前这位。结果是他说完立刻再接一棒回答新消息，被 @ 的另一位要等环转过去。不算错（他确实被点名了），只是服务次序不如直觉。让起棒避开"正在说话的人"要把运行时状态喂进纯函数，为一个多 @ 的边角场景不值当。

---

## 10. 落地时顺手修的一处旧漏

`apps/electron/src/main/ipc/collab.ts` 的 budgets 中转把字段一个个抄进
`setCollabRoomBudgets`，而 `maxConcurrentTurns` 从并行化那天起就没被抄上——类型里有、
app 层认、UI 一填就静默丢。**「同时发言上限」在桌面端从来没生效过。**

`CollabRoomBudgetsPatch` 的注释早就警告过这种漂移（"four layers each carried their own
copy of this shape"），而修法正是它自己说的那个：本期把 `CollabRoomUpdatePatch` 也提成
共享类型，preload 与 renderer 各自手抄的那两份形状一并删掉。中转层仍要逐字段翻译
（request → patch 本来就是一次翻译），但形状只剩一份。
