# 群聊 agent 响应判定逻辑

对照代码写成的参考文档（2026-07-30，P0 批次落地后）。描述一条消息落进群聊之后，谁会说话、谁不说话、说不出来时发生什么。提示词内容见 `docs/reference/collab-prompt-assembly.md`。

每条论断带 `文件:函数`（不带行号，防漂移）。目录约定：`collab/*` = `packages/onething-runtime/src/collab/`（纯逻辑），`app/collab/*` = `packages/onething-runtime/src/app/collab/`（装配与运行）。

---

## 1. 总览

```
用户在群里发消息
  └─ app/collab/ingress.ts:handleCollabRoomSendMessage   只落库,不起流
       └─ EventBus 'message:user-created'
            └─ app/collab/coordinator.ts 订阅 → queue.ts:handleRoomUserMessage
                 ├─ collab/activation.ts:decideCollabActivations   @ 短路
                 └─ queue.ts:electWillingSpeakers                  无 @ 走意愿选举
                      └─ queue.ts:enqueue → processQueue（每房间串行）
                           └─ turn.ts:driveActivation → runActivationTurn
                                ├─ 在 agent-exec-<agentId>-<roomId> 里起流
                                ├─ 模型调 say → app/collab/say-tool.ts 落库进群
                                └─ 收尾:记链长 → 级联(@ + 二次选举) → 推水位
```

关键不对称：**用户消息开一轮判定；agent 自己的 `say` 不重开判定**。协调器只订阅 `message:user-created` 且 `message.role !== 'user'` 直接 return（`coordinator.ts:initializeCollabCoordinator`），而 `say` 写入的是 `role: 'assistant'` 消息。agent 说话引发的后续激活，全部由**回合收尾**主动发起（`turn.ts:runActivationTurn` 末段），不走入口。

---

## 2. 入口分流

`app/collab/ingress.ts:handleCollabRoomSendMessage`：房间会话的 `command:send-message` 被拦下，消息落库 + 广播，**不起流**。原因写在文件头：引擎对每条 send-message 无条件起流，在房间里会以「上一个发言者」的错误 persona 出流，并与协调器互相 supersede-abort。

- drive 命令凭**凭证**而非字符串跳过这道门：`command.source === 'collab' && app/collab/drive-guard.ts:isTrustedCollabDrive(command)`。只声明 `source: 'collab'` 而没有本进程 token 的命令，一律按普通入站消息处理。
- 入站 `@` 在这里定型：`resolveInboundMentions` = composer picker 选中的 id（按 roster 重新校验、label 重新盖章）∪ 正文里 `@名字` 的名字扫描（`collab/mentions.ts:normalizeCollabMentions` / `buildCollabMentions` / `mergeCollabMentions`）。`mentions` 为空时**整个字段不写**，这是老转录仍走名字扫描回落的开关。
- 协调器可驱动的会话只有两类：`kind === 'room'`（pre-W18 形态）与 `kind === 'agent'`（执行会话），见 `ingress.ts:isCollabCoordinatorDrivenSession`。

`queue.ts:handleRoomUserMessage` 拿到消息后先把 `chainCount` 归零、`chainNoticePosted` 复位——**人说话就重开链闸**。`steering:consumed` 事件同样归零（`coordinator.ts`）。

---

## 3. 激活决策

`collab/activation.ts:decideCollabActivations`，纯函数，三条短路：

1. **frozen 全灭**。房间被总闸暂停时返回空激活。若消息里点了名（成员过滤后仍有人），额外带 `blockedByFrozen: true`，`queue.ts:handleRoomUserMessage` 据此贴一次系统行 `房间已暂停,@ 暂时无人应答——恢复后再说一声`（每次冻结只贴一次，`runtime.frozenNoticePosted` 闩锁，解冻时复位）。
2. **`@` 短路**。`collab/mentions.ts:resolveCollabMentionIds` 解析出的 id 经两道过滤——必须是当前房间成员、不能是消息作者自己——命中即全部以 `reason: 'mention'` 激活，**不付意愿判定的钱**。id 优先于名字：消息带 `mentions` 字段时按 id 决定（改名不失效、重名不扩大），没有字段才走名字扫描。
3. **agent 作者 + 撞链闸**。作者是 agent 且 `chainCount >= resolveCollabChainCap('mention', maxChain)` 时返回空激活，并在有人被点名时带 `blockedByChain: true`。

无 `@` 时函数返回**空激活**——没有「默认应答人」，位置不再决定谁说话（`CollabActivationReason` 注释：*the old 'default-responder' path is gone — nobody answers by position*）。剩下的人由协调器逐个问意愿。

激活理由共四种：`mention` / `self-elected` / `task-event` / `schedule`。

---

## 4. 意愿判定的运行细节

`app/collab/willingness-runner.ts`。候选筛选与门在 `queue.ts:electWillingSpeakers`，模型调用在 `judgeWillingness` → `judgeOne`。

- **一次判定 = 一次小上下文调用**：`system` = persona + 情况说明（+ PM 一行），`user` = ≤8 条尾窗 + JSON 问题（见提示词文档 §7）。
- **`temperature: 0`**、**`maxTokens: 64`**（`WILLINGNESS_MAX_TOKENS`）——回复是一个极小的 JSON 对象。
- **`thinking: false`**，理由写在调用点注释里：继承 provider 的 thinking 配置时，推理模型会把 64 token 预算和 8 秒 deadline 全烧在链式思考上，于是**每个成员都读成静默**（真机实测「全员静默即此因」）。
- **8 秒超时即静默**：`WILLINGNESS_TIMEOUT_MS = 8_000`，同时挂 `AbortController` 与 `withDeadline` 双层；超时 / 抛错 / 解析不出 → 一律 `{ respond: false, react: null }`。失败模式选静默的理由：*a missed reply costs the user one @; a spurious reply costs tokens and noise*。
- **>8 人只问 PM**：`WILLINGNESS_MAX_PARALLEL = 8`，候选数超过它时 `candidates.filter(c => c.id === pmAgentId)`——极端房间不做全员扇出。PM 不存在则一个都不问。
- **provider 解析与 drive 一致**：agent 的 model 绑定优先，否则房间会话的有效配置（`app/engine/stream/provider-helpers.ts:getEffectiveProviderConfig`）。缺 config / model / auth 任一即静默。
- **计费独立**：`debugPurpose: 'collab-willingness'`，`onUsage: app/usage/bill-side-line.ts:billCollabWillingnessUsage`，在用量面板里单独可见。
- **宽松 JSON 解析**：`collab/willingness.ts:parseWillingnessReply`。剥 code fence；`/['"]?respond['"]?\s*[::=]\s*['"]?(true|false)\b(?!\s*[|｜/])/i` 抓键值；退化到裸 `true`（去标点后比较）。**负向 lookahead 是刻意的**：把指令原样回抄（`{"respond": true|false}`）的模型没有作答，不能读成 `true`。凡不是可识别的 yes 一律 NO。
- **表情是同一次判定的免费一半**：`react` 只在 `respond === false` 时生效（runner 在返回值里就清掉说话者的 react，`electWillingSpeakers` 写入时再挡一次）。表情按 `collab/reactions.ts:normalizeCollabReactionEmoji` 归一，不在调色板里的直接丢弃。表情贴在**触发这轮判定的那条消息**上，add-only、广播 `message:updated`——协调器不监听该事件，所以表情不会开出新一轮判定。
- **门的顺序**：`electWillingSpeakers` 先看 frozen、再筛冷却候选、再看预算，最后调模型；调用返回后**重新**检查 frozen（判定要几秒，用户可能中途拉了闸）。

---

## 5. 冷却与链闸

### 5.1 self-elect 冷却

`collab/cooldown.ts:filterCollabSelfElectCandidates`，`COLLAB_SELF_ELECT_COOLDOWN = 2`。

自己的发言还落在最近 2 条**对话**消息里的成员，不参加意愿选举——**连判定都不付钱**。窗口按 `isCollabConversationMessage` 口径数（`role` 必须是 user/assistant 且通过投影口径），所以系统行、drive、思考记录都不算「群里往前走了一步」。只作用于 self-election：`@` 在 §3 就短路了，任务事件由工作流水线入队，两者都到不了这道筛子——**点名必须能应**。

代码里三套可见性口径，各自命名、各自有测试：

| 口径 | 函数 | 回答的问题 |
| --- | --- | --- |
| visible | `collab/reply-quote.ts:isCollabVisibleRoomMessage` | 屏幕上是否占一行 |
| projected | `collab/cooldown.ts:isCollabProjectedRoomMessage` | 模型是否读到 |
| conversation | `collab/cooldown.ts:isCollabConversationMessage` | 是否有人真的说了话 |

### 5.2 链闸

`collab/activation.ts:resolveCollabChainCap(reason, maxChain)`：

- `task-event` → `Infinity`（豁免）。工作流水线自己有界（单卡打回 ≤2、并发上限），中途冻结一次交付评审会卡住真活。
- 其余（`mention` / `self-elected` / `schedule`）→ 共用房间那一格 `maxChain`。W21 曾给主动接话单开一道固定 4 条的暗闸，已撤：*一个可配置的闸,配置了就要算数*。

房间上限：`app/collab/room-runtime.ts:maxChainFor`——没配过 → `collab/types.ts:COLLAB_DEFAULT_MAX_CHAIN`（32）；配 `0` → `Infinity`（关闭）；正数原样生效，不再夹隐形天花板；负数按没配处理。

`chainCount` 的单位是**一条发言**：一个回合 `say` 三条就 +3（`turn.ts` 收尾段），冷启动重算用同一口径（`collab/chain.ts:computeCollabChainCount`），保证 live 与 replay 同一个数。

### 5.3 撞闸时怎么处置（`turn.ts:driveActivation`）

drive 时**复查**链闸（排队期间可能已超射），按理由分两种处置：

- `self-elected` → **直接丢弃**（`record.stage = 'failed'`，返回 `'done'`）。它是对某一条消息的一时冲动，park 下来只会在用户重开房间时以过期的形态冒出来；而且串行队列的队首被 park 会挡住后面的 `@` 与任务事件。
- `mention` / `schedule` → **park**（返回 `'requeue-wait'`，队列 break，等人类发言重启），并贴一次系统行 `他们连着聊了 N 条,我先按住了——你说一句话,讨论就继续`（`runtime.chainNoticePosted` 闩锁）。

### 5.4 预算闸

`app/collab/budget.ts:isRoomOverBudget`。默认日预算 `COLLAB_DEFAULT_DAILY_COST_USD = 5`（`0` = 不限额），结果缓存 60 秒（`BUDGET_CACHE_MS`）。超预算的 drive 返回 `'requeue-budget'`，`queue.ts:processQueue` 据此按 `msUntilNextBudgetDay() + 60_000` 排一个跨日重启定时器（keyed，一房一个），让系统行里那句「明天自动恢复」成真。一切激活（含 `task-event`）都受预算闸约束。

---

## 6. 回合执行与收尾

`app/collab/turn.ts`。

### 6.1 前置（`driveActivation`）

顺序即语义：房间存在且未冻结 → 成员名单现读（排队期间被移出群的人不再拿麦）→ 预算闸 → 链闸 → agent 存在 → 等引擎绑定 sender（`waitForEngineBound`，最多 5 分钟、1 秒一轮询，teardown 闩锁可立即放弃；超时返回 `'requeue-retry'`，60 秒后重踢）→ 取 `collabAgentSessionId(agentId, roomSessionId)` → 进 **per(agent×房间) 锁**（`withAgentSessionLock`，key 就是执行会话 id）。

锁内三件事同窗同拆：`runtime.activeTurn` 指针（`abortRoomTurn` 的靶）、typing 观察者（`typing-observer.ts:observeCollabSayTyping`）、回合断路器。

### 6.2 驱动与等待

`waitForRoomTurn` 订阅执行会话的 `stream:complete|error|aborted`，`TURN_START_TIMEOUT_MS = 20_000`（没看到 `stream:start` 即超时）、`TURN_TOTAL_TIMEOUT_MS = 10 * 60_000`。**先订阅后驱动**（P2-7：总线同步派发，先驱后订会漏掉瞬时结束的流）。任何 `'timeout'` 都紧跟一次 `engine.abort(agentSessionId)`——等待结束不等于流结束，只有 abort 才是。

### 6.3 harvest

`harvestTurnMessages`，两条转录各取一半，都以 drive 时刻 `driveStartTs` 为下界：

- **房间**里该 agent 的消息：`isCollabSayMessage` → `says`（正序）；`isCollabHarvestMessage` 跳过（协调器代笔的收割贴不算这一轮的产出）；两者都不是且不是思考记录 → `legacySpeech`（pre-W18 形态，那时流本身就是发言）。
- **执行会话**里：最新的 assistant 消息作为 `turnMessage`（nudge 引用它的正文当证据），并把窗口内**每一条** assistant 消息的 say 调用次数累加成 `sayCallCount`（`collab/say.ts:countCollabSayToolCalls`）。累加而非只看最后一条，是 todo2 P0-2 修掉的真实 bug：早轮调过 say、末轮只写散文的回合，会被窄版读成「从没伸手拿过 say」而白驱一轮。

### 6.4 收尾三分支

- **有发言**（`says` 非空，或 pre-W18 的 `legacySpeech` 且不是 `[pass]`）：
  `chainCount += speech.length` → 收集 mentions（`says` 走 `unionTurnMentions` 读回 say 写入时盖的 id；legacy 走 `attachCollabMentions` 现盖）→ 只给**第一条**发言补 `replyTo`（`attachCollabReplyTo`，已带快照的不动）→ 推水位到最后一条发言 → 落盘。
  `outcome === 'complete'` 时才级联：
  1. 把整轮发言**当作一条消息**判 `@`（第二条里点的人和第一条里点的人一样算被点到），撞闸就贴按住系统行，其余 `cascade.enqueue`；
  2. 若 `chainCount < resolveCollabChainCap('self-elected', maxChain)`，再付一轮意愿选举（排除刚被 `@` 的人和作者自己），当选者以 `self-elected` 入队。
- **静默**（有 `turnMessage` 或 legacy 记录但没有发言）：**不计链、不级联、不贴任何行**——IM 房间里沉默是合法状态。但触发消息**算消耗**：水位推进到 `record.sourceMessageId` 指向的**房间**消息（P2-3：水位必须是房间里的 id；任务事件本来就没有房间锚点，此时水位干脆不动，靠 state 记录 + drive 上的 `collabSourceMessageId` 两级去重）。
- **什么都没落盘**：`outcome !== 'complete'` 时贴系统行 `<名字> 未能应答(响应超时 | 已被中止 | 模型调用失败)`。

### 6.5 nudge

`collab/say.ts:shouldNudgeCollabSay`，每 activation 一次（`record.nudged` 随记录落盘，重启也不补第二次）。五个**早退**条件，每个含义不同：

| 条件 | 为什么不 nudge |
| --- | --- |
| `saidCount > 0` | 它说了话，没什么要提醒的 |
| `!isThinkingRecord` | pre-W14b 转录（无 marker），那时流本身就是发言，当时也没有 say 可调 |
| `thinkingText` 为空 | 它什么都没写。空手的沉默是决定，不是丢件 |
| `sayCallCount > 0` | 它**伸手拿过** say 而话没落地（冻结/超预算/已不是成员/内容空）。墙下一轮还在，再撞一次没意义 |
| `alreadyNudged` | 一次就够，第二次是催 |

`turn.ts` 侧还要求 `outcome === 'complete'`，且 nudge 前**重读**门（房间仍开、还是成员、没超预算）。nudge 轮同样可以合法地以沉默结束，那个沉默就是答案——文案是事实陈述，不是命令发言。

2026-07-30 起 nudge 是「写了正文没发出去」的**首要**结构应答（此前排在强制首调 say 之后），对所有 provider 一视同仁。

### 6.6 断路器

`turn.ts:observeCollabTurnCircuitBreaker` + `collab/circuit-breaker.ts:createCollabTurnCircuitBreaker`。

- 两个上限：总工具调用 `COLLAB_TURN_MAX_TOOL_CALLS = 40`、单轮 say `COLLAB_TURN_MAX_SAY_CALLS = 20`，均可由房间设置覆盖（`budgets.maxTurnToolCalls` / `maxTurnSayCalls`，`0` = 关闭）。两个都关就**根本不订阅**。
- 上限在**回合开始时读一次**——中途改设置属于下一轮。
- 计数点是 `tool:execution-start`，按 `toolCallId` 去重；**没有 id 的调用照样计数**（P2-15：结构性兜底不能因为发射端漏盖 id 而静默关闭）。
- 上限是最大值不是阈值：正好打满不跳闸，**再下一次**才跳（真机验收：正常连发不能误伤）。
- 跳闸时先把说明写进**执行会话**（`collab/circuit-breaker.ts:formatCollabTurnBreakerNote`，如 `(回合断路器:这一轮发言 21 条,超过单轮上限 20 条,已中止本轮。)`），再 `engine.abort`。房间里只展示发言，断路器是机械。abort 走引擎常规通道，所以下游行为与用户按停一致：`waitForRoomTurn` 结在 `stream:aborted`，已落地的 `say` 仍然算发言。

---

## 7. say 落地链路与幂等

`app/collab/say-tool.ts:speakIntoCollabRoom`，顺序即契约：

1. **定房间**（`resolveSayContext` → `collab/say.ts:resolveCollabSayRoomSessionId`）：显式 `room` 参数 → 会话绑定的房间（执行会话的目标房间 / 工作会话的父房间）→ 会话自己就是房间（pre-W18）。都没有 → `COLLAB_SAY_REFUSED_NO_ROOM`。
2. **正文归一**（`collab/say.ts:normalizeCollabSayContent`）：空 → `COLLAB_SAY_REFUSED_EMPTY`；否则先按 `COLLAB_SAY_MAX_CHARS = 4000` 截断、**再**转义（顺序刻意：先转义后截断会把 `&lt;` 砍成半截实体）。
3. **三道门**：目标不是房间 → `UNKNOWN_ROOM`（显式指了个不存在的）或 `NO_ROOM`；冻结 → `FROZEN`；成员名单现读、已被移出 → `NOT_MEMBER`；超预算 → `BUDGET`。这些是群聊第一批**真实送达失败**语义——文案说「未送达」，agent 自己拿着话筒被告知。
4. **mentions / replyTo 定型**：`collab/say.ts:resolveCollabSayMentions` = 显式 id（按 roster 白名单过滤 + 重新盖 label，防冒名）∪ 正文 `@名字` 扫描；`replyTo` 解析成快照（`buildCollabReplyToSnapshot`），指不到的 id 静默丢弃而不是拒发。
5. **幂等窗口**（todo2 P0-2，2026-07-30）：指纹 = `(目标房间, 发言 agent, 归一化正文, 已解析的 mentions, replyTo)`，JSON 序列化而非分隔符拼接（正文是自由文本，任何分隔符都可能撞车）。窗口 `SAY_IDEMPOTENCE_WINDOW_MS = 5_000`，每次查询顺手清过期项。命中时**不落库、不发事件**，直接返回上一次的 `messageId` 且语义是**成功**——那句话确实在群里，返回同一个 id 还让后续 `replyTo` 能正确引用它。选 5 秒而非永久：群里过一会儿再说一遍同样的话是合法的（催一下、重复结论），同回合重复几乎都在毫秒到秒级。
6. **写入**：`role: 'assistant'`、`source: 'collab-say'`、带 `agentId`，落库后广播 `message:user-created`（与协调器自己的贴文同一通道，房间 UI 与 SSE 镜像无需新事件）。空 `mentions` 数组不写键——那是老转录名字回落的开关。

配套的入队去重在 `queue.ts:isAlreadyQueued`：同一 `(agentId, reason, sourceMessageId, driveLabel)` 只排一次队。两处刻意收窄——只在有 `sourceMessageId` 时去重（任务事件按构造没有房间消息，两张卡落在同一人头上是两件事），且只看**还在队里**的记录（不看 `state.activations` 历史，否则同一条消息隔一会儿再把人拉起来会被永久拒之门外）。全是重复时仍然踢一次泵：队首可能刚从链闸/预算闸下解冻。

---

## 8. 附录：设置的快照与实时

### 8.1 回合开始读一次（快照）

- **Agent 能力档案**：`app/engine/stream/agent-loop-executor.ts:executeAgentLoopStreamGeneration` 在每次 run 的唯一入口做 `ctx.agentProfile = resolveAgentProfileForSession(ctx.sessionId)`，下游全部读这份快照。理由写在 `agents/profile.ts` 头注释：*a mid-turn edit cannot produce a half-new/half-old combination（新提示词 + 旧白名单）*。快照内容 = persona、工具面、permissionMode、maxTurns、model 绑定。
- **回合断路器上限**：`turn.ts:observeCollabTurnCircuitBreaker` 在回合窗口打开时读 `room.budgets`，中途改设置属于下一轮。
- **链闸上限 / 预算上限**：在 drive 时读（`maxChainFor(session)` / `isRoomOverBudget`），预算结果另有 60 秒缓存；改预算会立刻清缓存并重踢队列（`coordinator.ts:setCollabRoomBudgets`）。

### 8.2 spawn 时抄写（真快照，之后各过各的）

**工作会话**（`app/collab/worker.ts`，卡被 `board start` 开工时创建）：

- `permissionMode` **继承房间**：`if (roomSession?.permissionMode) store.updateSessionPermissionMode(workSessionId, ...)`。理由：设成自动放行的房间（headless 自测、受信项目）不该让 worker 卡在没人应答的审批上。
- `model` **抄 agent 绑定**：`store.updateSessionModel(workSessionId, providerId, modelId, { pinned: false })`——`pinned: false` 是关键，这不是用户选的，不能日后读回成「用户另有选择」。
- 工作目录 = 群 folder（`ensureCollabRoomFolder`）。
- 之后房间改这两项，已存在的工作会话不会跟着变。

**执行会话**（`app/collab/agent-session.ts:ensureCollabAgentSession`）：

- **刻意不继承房间的 `permissionMode`**（注释明写）：工作会话继承是因为那是「正经开工的活」被授权过；一个只是来聊天的回合绝不该悄悄带上全自动放行的写权限。常驻会话只走 agent 自己声明的模式 + 严格者胜复合。
- `collab.roomSessionId` **创建时写一次，之后永不改写**——房间已经编进会话 id，归属成了 id 自身的属性。
- 工作目录只在**还没设过**时写一次。

### 8.3 每次现读（实时）

- **Agent 档案本体**：`getAgent()` 走进程内缓存的 `agents.json`，`resolveAgentProfileForSession` 每回合现取——改 agent 的 persona / 工具 / 模型绑定，下一个回合生效。
- **权限模式**：`app/engine/stream-engine.ts:getPermissionMode` 在**每次 `Permission.ask`** 时合成（backend.ts 里接的回调），不读回合快照——注释原文 *permissions go strict-and-fresh*。合成规则 `agents/profile.ts:composeAgentPermissionMode`：agent 声明的模式与 session/settings 模式取**严格者**；未声明模式的 agent 不参与（工作会话继承来的自动放行因此仍然成立）；不认识的模式按最严处理（fail closed）。严格度表 `AGENT_PERMISSION_MODE_STRICTNESS = ['normal', 'auto-accept-edits', 'dangerously-allow-all']`。
- **房间成员名单**：没有任何地方缓存。意愿选举（`roomMembers`）、`@` 判定、drive 时守卫、`say` 落地前的成员检查，全部 `store.getSession()` 现读——`coordinator.ts:setCollabRoomConfig` 写完，下一轮就已经排除被移出的人；`say` 也会在写入前再拦一次「已被移出群的人不能把话说完」。
- **frozen / 预算 / 上限**：现读，且在耗时操作（意愿判定几秒、一个回合几分钟）**前后各读一次**——`electWillingSpeakers` 调用后重查 frozen，nudge 前重查房间与预算。
- **模型 pin**：`turn.ts` 在 drive 前现读 `store.getSession(agentSessionId)?.modelPinned`；为 true 时整组 model/thinking 覆盖不下发，让引擎解析会话自己的配置（P1-4）。

### 8.4 变更生效时机小结

| 改什么 | 何时生效 |
| --- | --- |
| agent persona / 工具 / 绑定 | 下一个回合（回合开始快照） |
| agent / 会话 permissionMode | 下一次权限询问（实时合成） |
| 房间成员、PM | 立刻（下一次现读） |
| frozen 总闸 | 立刻：队列清空并全部标 failed、中止在跑的回合、冻结所有工作流 |
| 日预算 / maxChain | 立刻（清缓存 + 重踢队列） |
| 回合断路器上限 | 下一个回合 |
| 已存在工作会话的 permissionMode / model | 不变（spawn 时的快照） |
