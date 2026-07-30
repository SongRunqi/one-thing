# 群聊系统修复路线 — 结构性债务优先

> 状态:路线定稿,交由 Opus 5 分单实现;主导/评审:Fable 5。日期:2026-07-28。
> 依据:`docs/audit/collab-room-system-audit-2026-07-28.md`(2 P0 / 4 P1 / 20 P2 / 6 P3,全部未修)。
> 总方针(用户指令):**优先处理结构性债务**——每一单以"收敛一条债"为纲,把审计发现作为该债的验收用例顺路关掉,而不是逐条打补丁。

## 0. 路线总览(先看全景再看分单)

| 单 | 一句话 | 收敛的债 | 关掉的发现 | 依赖 |
| --- | --- | --- | --- | --- |
| R0 | abort 语义收敛:`abortRoomTurn()` 单点 + 冻结/超时全修 | 债1(abort 散落三种 session) | P0-1、P0-2、P2-1、P2-5、P3-冻结双噪 | 无,**最先做** |
| R1 | board 状态机迁移表收口 | 债(守卫按 action 分散) | P1-1、P1-2 | 无,可与 R0 并行 |
| R2 | coordinator 拆模块 + 不变量落码 | 债2(1538 行神模块) | P2-2、P2-3、P2-4、P2-6、P2-7 | R0 之后 |
| R3 | 消息分类学收敛 + 驱动令牌 | 债4(stringly-typed source) | P2-8 | R2 之后 |
| R4 | 口径整顿:投影双实现合一 + 冷却语义独立 | 债3、债5(双实现/三口径) | P2-12、P2-13、P2-16 | R2 之后 |
| R5 | 生命周期:定时器入册 + 删房清理钩子 | 债6(尽力而为的生命周期) | P2-10(P2-6 已在 R2) | R2 之后 |
| R6 | 渲染层刹车反馈 + 审批账本对账 | —(P1 批次) | P1-3、P1-4、P2-9、P2-18、P2-19、P2-20 | 独立,可随时并行 |
| R7 | 杂项批次(纯函数小修) | — | P2-11、P2-14、P2-15、P2-17、P3×3 | 最后 |

推荐执行序:**R0 → R1 → R6(并行窗口)→ R2 → R3 → R4 → R5 → R7**。R0/R1/R6 互不相交可穿插;R2 是一次大搬迁,必须单独成单、行为零变化;R3/R4/R5 都动 R2 拆出来的文件,严格排后。

每单纪律:改动后 `bun run test`(collab 相关套件必须全绿)+ `bun run typecheck` + `bun run boundary:gate`;每单独立可验收、独立可回滚;不顺手做单外的"优化"。

---

## R0 abort 语义收敛(债1 + P0 双雄)

**问题**:W18 把回合搬进 agent 执行会话,"停止"没跟着搬。冻结 abort 打在不承载流的 room 会话上(no-op);回合超时不 abort 留僵尸流(worker.ts:363 修过同款,coordinator 漏了)。

**改动**:

1. `coordinator.ts` 的 `RoomRuntime` 增加 `activeTurn?: { agentSessionId: string; agentId: string }`:
   - `runActivationTurn` 进入 agent 锁、开始驱动前置位;`finally` 清空。
2. 新导出 `abortRoomTurn(roomSessionId)`(先放 coordinator.ts,R2 会搬去 turn.ts):
   - abort `runtime.activeTurn.agentSessionId`(若有);
   - abort roomSessionId(pre-W18 兜底,保留);
   - 不管 work 会话——那是 `freezeRoomWork` 的职责,调用方各自组合。
3. `setCollabRoomFrozen(frozen=true)` 改为:
   - 队列清空前,**把 queue 里每条 record 的 state 记录标 `failed`**(修 P2-1:冻结丢弃的激活重启后不再复活),再 `persistRoomState`;
   - `abortRoomTurn(roomSessionId)` + `freezeRoomWork(roomSessionId)`;
   - 系统行文案不变(现在它是真话了)。
4. 回合超时真 abort:`runActivationTurn` 里**两处** `waitForRoomTurn`(首轮 :875、nudge 轮 :925)之后,`if (outcome === 'timeout') getStreamEngineSafe()?.abort(agentSessionId)`——完全镜像 worker.ts:363 的写法与注释意图。
5. 冻结场景的 worker 收尾降噪(P3):`harvestWork` 最后的「执行中断…可重新指派」行,在 `roomFrozen(roomSessionId)` 时不发(冻结自己已经贴了总告示)。
6. 解冻救回 doing 卡(P2-5):`resumeRoomWork` 的筛选从 `status === 'todo'` 放宽为 `(status === 'todo' || status === 'doing') && assigneeAgentId && !activeByTask.has(task.id)`——与 boot 侧 `reconcileRoomBoard` 的处置对称,doing 卡不再搁浅到下次重启。

**验收**:
- 新增 coordinator 测试:冻结时对 activeTurn 的执行会话调了 abort(mock engine 断言);超时 outcome 后调了 abort;冻结后 state 里无 `queued` 残留,重启 reconcile 不复活。
- worker 测试:冻结→解冻后 doing 卡被重新 schedule;冻结场景不再发中断行。
- 真机验收(主导者):房间回合流式中拉总闸 → provider dump 里该请求被掐断,不再烧满 10 分钟。

## R1 board 状态机迁移表收口(P1-1 + P1-2)

**问题**:`complete` 精心设防(assignee 断言 + 状态守卫),语义重叠的 `move`/`block` 裸奔——agent 可 `move doing→done` 绕评审环;`block` 非幂等,重复调用每次 `haltedCount+1`,两次烧光 `COLLAB_MAX_HALTS=2`。

**改动**(全部在 `packages/onething-runtime/src/collab/board.ts`,守卫从「按 action 分散写」改成集中裁决):

1. 新增内部函数 `guardAgentTransition(current, action, actor)`,在 switch 之前统一裁决,**只约束 `actor.type === 'agent'`(用户永远自由——W9b 既有原则:user 可以推动任何卡)**:
   - `move → done`:仅允许从 `review`,且 `actor.agentId !== current.assigneeAgentId`(评审者关卡;执行者自关自己的卡必须走 complete→review)。违规返回 reducer 风格错误文本,指引改用 `complete`。
   - `block`:仅允许从 `doing`/`todo`(review/done 卡不许被 agent 拉回 blocked)。
2. `block` 幂等(对两种 actor 都生效):`current.status === 'blocked'` 时早退——**不 bump haltedCount**;若带了新 `reason` 则只更新 `blockReason`(镜像 `move` 在 :256 的同状态守卫)。
3. `complete` 保持原样;`move` 的其余迁移(含 done→todo 重开、review→todo 打回)保持原样。

**验收**:board.test.ts 补迁移矩阵:agent-assignee move doing→done 拒;agent-PM move review→done 允;agent move review→blocked 拒;user move doing→done 允;重复 block 不涨 haltedCount、reason 可更新;既有全部用例不动仍绿。注意 `system-lines` 的「无执行记录」章保留——它现在是第二道防线而非唯一防线。

## R2 coordinator 拆模块 + 不变量落码(债2)

**问题**:1538 行神模块,调度/预算/链闸/harvest/配置/typing 兜底全在一处;`runtime.state` 被并发协程裸写,watermark 单调性靠人肉。

**改动**(行为零变化的搬迁 + 四个不变量落码,分两个 commit 更稳:先搬迁后不变量):

1. **拆文件**(全在 `packages/onething-runtime/src/app/collab/`,coordinator.ts 目标 <600 行,只留事件接线、初始化/关停、配置 API):
   - `room-runtime.ts` — `RoomRuntime`、state 文件读写(`loadRoomState`/`persistRoomState`)、`roomRuntime()`、`advanceWatermark`、`rooms` Map;
   - `budget.ts` — `budgetDayKey`/`readCollabRoomSpentTodayUSD`/`getCollabRoomSpend`/`isRoomOverBudget`;
   - `turn.ts` — `driveActivation`/`runActivationTurn`/`harvestTurnMessages`/`waitForRoomTurn`/`withAgentSessionLock`/`abortRoomTurn`(R0 产物)/断路器 observer;
   - `queue.ts` — `enqueue`/`processQueue`/`handleRoomUserMessage`/`electWillingSpeakers`/`reconcileRoom`。
   循环依赖用 host 接口打断(worker.ts 的 `WorkerHost` 已有先例)。
2. **watermark 单调性**(P2-2):`advanceWatermark` 拒绝倒退——`message.timestamp < state.lastProcessedAt` 时不动。并发 `handleRoomUserMessage` 保持并发(串行化会让 B 的判定等 A 的 8s 轮,不值),单调守卫已消除倒退的实害(崩溃后重复判定)。
3. **静默回合的 watermark 锚点**(P2-3):`runActivationTurn` 静默分支的 `consumed = … ?? turnMessage!` 改为:**只有拿到房间消息锚**(sourceMessageId 找得到,或 legacySpeech)才推进 watermark;拿不到就不推进——去重本来就有两级账本兜着(state 记录 + 执行会话里的 `collabSourceMessageId` 戳,W23),不需要一个指向别的会话的假锚。task-event 激活无 source 属正常路径,不推进是正确语义。
4. **预算恢复真自动**(P2-4):`driveActivation` 因超预算返回 `requeue-wait` 时,注册一枚「跨天 kick」定时器(`msUntilNextBudgetDay + 60s`,入 R2.5 的定时器登记册,同房间去重)到期 `processQueue`。「明天自动恢复」的系统行从此是真话。
5. **定时器登记册**(P2-6):模块级 `const pendingTimers = new Set<NodeJS.Timeout>()`;coordinator 系所有 `setTimeout`(requeue-retry 60s、上条跨天 kick)创建即 `unref?.()` 并入册,回调自删;`shutdownCollabCoordinator` 全 clear。`waitForEngineBound` 加模块级 `shuttingDown` 标志检查,shutdown 时下一个 1s 轮询立即退出。
6. **先订阅后驱动**(P2-7):`runActivationTurn` 把 `waitForRoomTurn(agentSessionId)` 的 promise 在 `emitDrive` **之前**建好再 await(:789 的 externally-driven 分支已是先例),两处(首轮 + nudge 轮)都改。

**验收**:全部既有 coordinator-* 测试零改动通过(搬迁不许动行为);新增:watermark 倒退拒绝、静默 task-event 回合不推 watermark、超预算 park 后模拟跨天 kick 队列恢复、shutdown 后无活定时器(`vi.useFakeTimers` 推进断言不再触发)。

## R3 消息分类学收敛 + 驱动令牌(债4 + P2-8)

**问题**:六个标记(collab/collab-harvest/collab-say/collab-turn/collab-task/collab-membership)× `source`/`origin.source` 双字段,每个谓词读双份,已有误读事故前科;ingress 防线信任字符串 `source:'collab'`,可被伪造直接流式驱动 room 会话。

**改动**:

1. `packages/onething-runtime/src/collab/` 新增 `classify.ts`:`classifyCollabRoomMessage(message): 'drive' | 'say' | 'harvest' | 'thinking' | 'task-line' | 'membership-line' | 'operational-line' | 'plain'` ——双字段的读取逻辑只写这一份。既有谓词(`isCollabDriveMessage` 等)**保留导出名**、改为委托 classifier(调用方零改动);新增标记今后只改 classifier。
2. 驱动令牌(P2-8):coordinator 每次进程启动生成 `randomUUID()` 令牌,通过新的 `configureCollabDriveGuard(token)`(app 层 setter,`stream-engine.ts` 消费)注入;coordinator 的 `emitDrive` 与 worker 的 spawn 命令带上 `collabDriveToken` 字段;`stream-engine.ts:85` 的门改为 `source === 'collab' && token 匹配` 才放行 room/exec 流式驱动。server HTTP 转发的整命令不可能带对令牌——防御纵深闭合,且不改 CLAUDE.md 的「命令 WHOLE 转发」原则(server 转发的照样整转,只是过不了门)。

**验收**:classifier 单测覆盖六标记 × 双字段矩阵 + 事故回归(引擎复制 drive 信封的 origin.source 误读场景);伪造 `source:'collab'` 无令牌的命令被 ingress 拒;全部既有测试绿。

## R4 口径整顿:投影双实现合一 + 冷却语义独立(债3、债5)

**问题**:projection.ts 是"tested spec",生产真身在 `app/engine/stream/message-helpers.ts`,双实现共同盲区已发生(两份都只合并 user 侧,agent 连发 say 产出相邻 assistant,严格交替 provider 会 400);冷却窗口复用"模型投影口径"判断"对话是否推进",系统行冲掉发言冷却。

**改动**:

1. **合并逻辑单源**(P2-13 + 债3):把「相邻块合并」抽成 `src/collab/projection.ts` 导出的纯函数(输入投影行序列,输出合并后序列),**补 assistant 侧合并**:同 agentId 相邻 assistant 块并为一条(`\n\n` 连接);`message-helpers.ts` 改为 import 该纯函数,删除自己那份。依赖方向合法(app → runtime)。spec 与生产从"约定对齐"变"同一份代码"。
2. **冷却独立口径**(P2-12 + 债5):`cooldown.ts` 不再用 `isCollabProjectedRoomMessage` 填窗口;新增 `isCollabConversationMessage(message)`(= 投影口径**减去**全部系统行)——K_cd 窗口只数真实发言,协调器贴任务事实行不再把 agent 的 say 顶出窗口。三口径各归其位:投影口径(模型看什么)、可见口径(渲染什么)、对话口径(冷却数什么),各自命名各自测试。
3. **roster 回退**(P2-16):`willingness.ts`/`projection.ts` 的 `speakerLabel` 在 roster 未命中时不再返回裸 `agentId`:纯函数签名加可选 `resolveAgentName?(agentId): string | undefined`,app 层接线传全局 `getAgent`(离场成员仍能解析出名字);全局也未命中才退 `'前成员'`。裸 id 永不进模型窗口。

**验收**:projection 测试补 assistant 相邻合并矩阵(同 agent 连发 / 不同 agent 交替 / say+系统行夹层);message-helpers 既有测试改跑同一纯函数后仍绿;cooldown 测试补「系统行不占窗口」;投影输出全量断言无 `agent-` 前缀裸 id。

## R5 生命周期:删房清理钩子(债6 + P2-10)

**问题**:`rooms`/`agentSessionLocks`/`writeQueues` 三张 Map 只增不减;删房间无人清 `<store>/collab/<roomId>/` 目录;`clearCollabBoardBroadcast` 导出了没人调。

**改动**:

1. 找到 app 层会话删除的收口点(`app/stores/sessions` 的 delete 路径),挂 collab 清理钩子:被删会话 `kind === 'room'` 时调用新的 `disposeCollabRoom(roomSessionId)` —— `rooms.delete`、`clearCollabBoardBroadcast`、board-store `writeQueues` 表项删除、`pendingByRoom.delete`、递归删除 `<store>/collab/<roomSessionId>/` 目录。钩子经 host 接口/事件注入,不许 stores 直接 import collab(注意方向)。
2. `agentSessionLocks` 自清:`withAgentSessionLock` 释放时,若 map 中该键的尾 promise 就是本次的 `held`(无排队者),`delete` 该键。

**验收**:删房后三张 Map 无表项、collab 目录不存在;并发持锁下删键不影响排队者(测试:两个排队 turn 交错后 map 为空)。

## R6 渲染层刹车反馈 + 审批账本对账(P1-3、P1-4 批次)

**问题**:pendingAsks 只做事件增量记账、无冷启动水合且运行期账本天生不可靠(core 只对队首 emit request,clamp 掩盖负数,`permission:timeout` 是死分支);冻结/预算/表情三处吞掉 `success:false` 零反馈;board GET 无序竞态;反应 actor 渲染层自报。

**改动**:

1. **账本改对账制**(P1-3 + P2-9):`pendingAsks` 从「±1 记账」改为「向真源取数」——
   - 冷启动/看板打开:`collabBoard.load()` 对 board 上活跃任务的 work 会话逐个调既有 `PERMISSION_GET_PENDING`(通道已存在,`apps/electron/src/main/ipc/permission.ts:52`,带 promptState 全景),重建计数;
   - 运行期:收到 `permission:request`/`permission:settled` 事件后,对该 sessionId **重新取数**(200ms debounce)替换计数,不再 ±1;
   - 删除 `permission:timeout` 分支(全仓无人 emit,死代码)与 `Math.max(0,…)` clamp(对账制下不需要)。
2. **刹车反馈**(P1-4):`CollabBoardPanel.vue` 的 `toggleFrozen`/`commitBudget` 消费返回值:异常或 `success:false` 时在面板贴一行画线风错误(11px 墨灰痕迹行,复用 ErrorNote 族,禁大卡);成功才 `loadSessions()`。对齐 `RoomSettingsDialog.vue:266-270` 的既有做法。
3. **board 快照防乱序**(P2-18):`CollabBoard` 加单调 `seq: number`(board-store 每次 commit 自增,随快照持久化);`collab:board-changed` 广播与 `COLLAB_BOARD_GET` 响应都带;renderer store 只接受 `seq` 更大的快照。shared 类型同步(`packages/shared/ipc/collab.ts` 与 `src/collab/types.ts` 双份都加——双份是记录在案的已知债,本单不消它)。
4. **反应通道收口**(P2-19 + P2-20):主进程 handler(`apps/electron/src/main/ipc/collab.ts:83-94`)把 actor 钉死为 `{ type: 'user' }`(忽略请求里的 actor 字段,契约注释对齐 board act 的措辞);`MessageList.vue` 的 `handleReact` 消费响应,失败走既有错误痕迹行。

**验收**:重载窗口后徽标恢复(测试:mock getPending 返回非空 → hasPendingAsk 真);冻结失败有可见反馈且 UI 不静默回弹;乱序快照(旧 seq 后到)被丢弃;renderer 伪造 agent actor 的反应落库为 user。

## R7 杂项批次(纯函数小修,一单收尾)

1. **mention 重绘最长匹配**(P2-11):`mentions.ts:217-224` 的 `labels.find(startsWith)` 改为与解析端(:34-47 `claimedLength`)同款 longest-wins 消歧;测试:小李/小李工 改名矩阵。
2. **code-point 安全截断**(P2-14):`src/collab` 新增 `truncateAtCodePoint(text, max)`(surrogate 对边界回退一位),替换四处 `String.slice` 截断(say.ts:286、willingness.ts:76-78、reply-quote.ts:39-42、system-lines.ts:139-146);测试:emoji/扩展区汉字骑缝。
3. **断路器失效模式翻转**(P2-15):`circuit-breaker.ts:127-129` 无 toolCallId 的 execution-start 改为**计数但不去重**(失效向"多计"倾斜,自称结构性兜底的组件不许静默不计)。
4. **冻结吞 @ 出信号**(P2-17):`activation.ts` frozen 早退改为返回 `blockedByFrozen: true`(仅当确有 mention 被吞时);coordinator 在 `handleRoomUserMessage` 对此贴一行系统行「房间已暂停,@ 暂时无人应答——恢复后再说一声」(每冻结期一次,复用 chainNoticePosted 同款闩)。
5. **本地日预算**(P3):`budgetDayKey`/`dayStart` 从 UTC 改本地时区(`new Date()` 本地 year-month-day),「今天」与用户的今天对齐;注意 R2.4 的跨天 kick 同步用本地日界。
6. **spawnWork catch 收窄**(P3):`worker.ts` 把 `harvestWork` 移出 spawn 的 try(或 harvest 单独 try/catch 只记日志)——harvest 阶段抛错不再把已进 review 的卡误退回 todo。

**验收**:各点单测 + 全量 `bun run test` 绿;R7 完成后跑一次 `bun run boundary` 全查(非 gate)确认无新增红。

---

## 非目标(本路线明确不做)

- **web/server 端群聊**:维持"干净的整体缺席";审计第 7 条债(server 侧 kind 过滤、SSE collab 事件消费)留待真做 server 群聊时一并设计。
- **`CollabBoardAction` 双份类型合一**:shared 侧注释已认账、失效模式可控,收益不抵 churn。
- **`chainNoticePosted` 持久化**:重启重贴一行提示,无害。
- **coordinator 之外的引擎层重构**:R3 的令牌门是对 `stream-engine.ts` 的最小侵入,不许顺势重构 ingress。

## 给执行者(Opus 5)的三条铁律

1. **一单一 commit(R2 允许两个:搬迁/不变量),单外发现新问题记录到审计文档追加节,不顺手修**。
2. **R2 搬迁 commit 的验收标准是"既有测试零改动通过"**——任何测试需要改动都说明搬迁动了行为,打回。
3. **所有用户可见文案与 UI 反馈遵守画线风宪法**(multi-agent-collab-im.md §3.6):错误是痕迹行不是卡片;系统行禁大卡;新样式全走 `--ui-*` token。
