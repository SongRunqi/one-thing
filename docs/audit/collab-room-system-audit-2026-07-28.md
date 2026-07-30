# 群聊(多 Agent 协作)系统审查 — 2026-07-28

> 范围:`packages/onething-runtime/src/collab/`(核心产品层,20 文件)、`packages/onething-runtime/src/app/collab/`(装配层,13 文件)、渲染层(collabBoard store、Room* 组件、CollabBoardPanel)与传输面(IPC handler / preload / platformApi / apps-server 奇偶校验)。
> 方法:三路并行代理审查(核心层 / 装配层 / 渲染+传输)+ 主导者对 coordinator.ts(1538 行)、worker.ts(736 行)、board.ts 关键段全文通读复核。所有 P0/P1 均经主导者到源码现场二次取证;三路独立发现有三处撞车(水位线回退、预算不自动恢复、定时器泄漏),互为印证。
> 对照设计文档:`docs/design/multi-agent-collab.md`、`docs/design/multi-agent-collab-im.md`(W1–W23 工单)。

## 结论摘要

系统的机制纪律(单驱动、两级幂等账本、watermark 消费才推进、说话即行动)是仓库里少见的高水位,但 **W18「回合搬进 agent 执行会话」这一次搬迁没有把"停止"语义跟着搬过去**——两条 P0 同根:总闸和回合超时仍按旧世界的 session id 打靶,打在早已不承载流的 room 会话上。其余头部问题集中在 board 状态机的守卫不对称(`complete` 设防、`move`/`block` 裸奔)与渲染层"安全刹车零反馈"。

修复优先级建议:
1. **P0 双雄一起修**:收敛一个 `abortRoomTurn(roomSessionId)`,统一枚举 room / agent-exec / work 三类会话;冻结与回合超时都走它。
2. **board 迁移表收口**(P1×2):守卫从「按 action 分散写」改成「按状态迁移表集中裁决」,顺手补 `block` 幂等。
3. **渲染层刹车反馈**(P1×2):`toggleFrozen`/`commitBudget` 消费 success/error;`pendingAsks` 冷启动向 `getPendingPrompts` 对账。

---

## P0 — 止损链路失效

### P0-1 房间总闸(冻结)停不掉正在燃烧的回合流

- 位置:`packages/onething-runtime/src/app/collab/coordinator.ts:1336`
- 场景:成员回合正在 `agent-exec-<agentId>` 执行会话里流式跑(工具循环、全上下文请求),用户拉总闸。`setCollabRoomFrozen` 只 `getStreamEngineSafe()?.abort(roomSessionId)`——room 会话自 W18 起从不承载流(ingress 只持久化),这个 abort 永远是 no-op。`freezeRoomWork` 只中止 work 会话。结果:in-flight 房间回合继续跑满至多 10 分钟(`TURN_TOTAL_TIMEOUT_MS`),`say` 被 frozen 门拒掉所以话不落地,但 token 照烧、权限照问。冻结系统行「进行中的执行已中止」对房间回合是假话。
- 证据:对比 W22 断路器正确地 abort 了执行会话(`coordinator.ts:737` `abort(sessionId)`,sessionId=agentSessionId);而驱动本体是 `getEventBus().emit(agentSessionId, { type: 'command:send-message', … })`(:810)。
- 定级依据:与 923dce85「web 停止按钮真正停掉引擎」同族——安全刹车必须真的刹车。主导者复核实锤。

### P0-2 回合超时不 abort,留下僵尸流;之后落地的 say 完全脱离记账

- 位置:`coordinator.ts:875/925`(两处 `waitForRoomTurn` 之后均无 abort)
- 场景:回合卡在权限 ask(collab 分支是无限期交互等待,`permission-policy.ts` 的 collab 路径无 120s 自动拒)或慢工具,10 分钟后 `waitForRoomTurn` 返回 `'timeout'`,record 标 `failed`、typing/断路器 observer 拆除、agent 锁释放——但流没死。用户 30 分钟后批准权限,回合恢复,后续 `say` 照样写进房间(say 门只查 frozen/budget/roster),但此时**无 chainCount 累计、无 cascade(@ 人不激活)、无 watermark 推进、无 typing 灯**。且该 agent 的下一个激活撞上 `getController(agentSessionId)`(:788)再等一轮,或 emitDrive 触发 supersede-abort 掐死等审批的旧回合。
- 证据:worker 路径明确修过同款——`worker.ts:363-367` `if (outcome === 'timeout') { getStreamEngineSafe()?.abort(workSessionId) }`,注释"Never leave a zombie stream";coordinator 对应位置零 abort。主导者复核实锤。

---

## P1

### P1-1 board `move` 无角色守卫:执行者可 `doing→done` 直接关卡,绕过整条评审环

- 位置:`packages/onething-runtime/src/collab/board.ts:252-281`
- 场景:worker 不调 `complete`(那里有 assignee 断言 + 状态守卫,:300-305),改调 `board move status:'done'` → 事件裁决 `action.status === 'done' ? 'task-done'`,无 summary、无 actor 校验、不进 review;PM 的 task-event 评审激活从未发生。任何成员也可把 `blocked`/`review` 卡直接 move 到 done。这正是 W9b 要堵的「剧场交付」路径的残余缺口——`complete` 侧修了,`move` 侧完全不设防。唯一缓解是 task-done 系统行盖「无执行记录」章(system-lines),但那是事后可读性,不是闸。
- 修复方向:状态迁移表集中裁决 + 对 agent actor 的 done 迁移强制走 `complete`(或至少同样断言 assignee/PM 身份)。主导者复核实锤。

### P1-2 board `block` 非幂等:重复 block 每次 `haltedCount+1`,两次重发就烧光自动处置预算

- 位置:`board.ts:315-321`(对照 `haltPatch` :223-229 每次 `+1`)
- 场景:卡已 `blocked`,模型重试同一 `block` 调用(工具结果超时/含糊后重发,真实模型行为)→ haltedCount 1→2 → `COLLAB_MAX_HALTS=2` 立即命中,房间对该卡永久停止自动处置(计数持久在卡上,跨重启不可逆,只能用户手动推卡)。`block` 对 done/review 卡也无状态守卫,任意状态都能被拉回 blocked 并计一次受阻。
- 证据:`case 'move'` 有同状态早退(:256),`case 'block'` 没有——同一语义两个入口,一个幂等一个不幂等。主导者复核实锤。

### P1-3 pendingAsks 只做事件增量记账、从不冷启动水合,窗口重载后「worker 等审批」徽标永久丢失

- 位置:`packages/renderer/stores/collabBoard.ts:20-29, 58-62`
- 场景:worker 卡在权限审批(collab 里 worker 唯一的阻塞态),用户重载窗口/重启 app。`pendingAsks` 从空开始,只靠此后的 `permission:request`/`permission:settled` 事件增减;`Permission.getPendingPrompts()`(CLAUDE.md 钦定的 pending 真源)在整个 renderer 零调用。看板徽标消失,任务显示「正常执行中」,实际 worker 挂着等人批。
- 关联(P2-9):这套账本运行期也不可靠——core 只对队首 emit `permission:request`,批量 settle 会产生「没 +1 过的 -1」,靠 `Math.max(0,…)` clamp 掩盖;`permission:timeout` 分支是死代码(全仓无人 emit)。根治同一个:改为向 `getPendingPrompts` 对账。主导者复核实锤。

### P1-4 冻结开关与预算提交吞掉异常与 `success:false`,安全刹车失败零反馈

- 位置:`packages/renderer/components/workbench/CollabBoardPanel.vue`(`toggleFrozen`、`commitBudget`,均为 `.catch(() => {})` 且丢弃响应体)
- 场景:用户点「全部暂停」,IPC 失败或返回 `{ success:false }` 时无任何提示,随后 `loadSessions()` 把 UI 刷回真实(未冻结)状态——按钮「点了又弹回来」,用户以为已刹车。对照 `RoomSettingsDialog.vue` 对同一通道是检查 success 并展示 error 的,两个门行为不一致。主导者复核实锤。

---

## P2 — 装配层(coordinator / worker)

### P2-1 冻结清空内存队列但不改 state 记录,重启后被冻结丢弃的激活复活

- `coordinator.ts:1330-1335` + `:1203-1209`。冻结时 `runtime.queue.length = 0`,但 `state.activations` 里这些记录仍是 `'queued'` 并被 persist;解冻不碰队列;重启后 `reconcileRoom` 把所有 `'queued'` 重新入队 → agents 突然回答几天前用户以为已被冻结吞掉的旧消息。

### P2-2 `handleRoomUserMessage` 无按房串行化,并发消息可使 watermark 倒退

- `coordinator.ts:1272-1279` + `:1156-1162`。用户连发 A、B,两次调用并发;B 的 willingness 轮先返回且零激活 → `advanceWatermark(B)`;A 的轮后返回 → watermark 退回 A。崩溃重启后 B 被视为未处理 → 重复付费判定、可能产生迟到回复。`advanceWatermark` 无单调性检查。(三路撞车项:主导者独立发现同款。)

### P2-3 静默回合的 watermark 可能写入非房间消息 id(执行会话的 turnMessage)

- `coordinator.ts:1032-1037`。task-event 激活(无 sourceMessageId)且无 legacySpeech 的静默回合:`consumed = … ?? turnMessage!`——该 id 在房间 transcript 永远 findIndex miss,boot 只能走 `lastProcessedAt` 时间戳回退,而回退会把「回合期间落进房间、处理协程随崩溃而死」的用户消息划进已处理区,永不重驱。注释自己承认 watermark 必须指向房间消息,代码仍以 `?? turnMessage!` 收尾。

### P2-4 预算 parked 的队列没有任何自动重启,系统行却承诺「明天自动恢复」

- `coordinator.ts:632-634 / :1097 / :222`。超预算 `'requeue-wait'` 后,重启队列的只有三处:新用户消息、steering:consumed、setCollabRoomBudgets。跨天后闸自然打开但没人 kick——parked 的交付评审一直挂到用户开口。(撞车项。)

### P2-5 冻结/解冻循环把 `doing` 卡搁浅

- `worker.ts:619-636`。冻结 abort 所有 work 流,harvest 收 aborted 时卡仍 `doing`;解冻 `resumeRoomWork` 只重排 `todo`。doing 卡从此无活 worker、看板显示进行中,直到下次**重启**才被 `reconcileRoomBoard` 转 blocked。与 boot 侧处置不对称。

### P2-6 waitForEngineBound 的 1s 轮询与 requeue-retry 的 60s 定时器均不随 shutdown 取消

- `coordinator.ts:369-377` + `:1098-1100`。两类 timer 不入 `disposers`;CLI daemon(HeadlessBackend `collab:true`)退出时可被拖住最长 ~5-6 分钟;60s 定时器在 `rooms.clear()` 之后还会重建空 runtime 空转。对照 board-store 的广播 timer 做了 `unref` + shutdown 清理,coordinator 漏了。(撞车项。)

### P2-7 waitForRoomTurn 在 emitDrive 之后才订阅,极早失败的流事件可被漏听

- `coordinator.ts:868-875`。provider 快速失败路径的 `stream:error` 可能落在订阅挂上之前 → coordinator 等满 20s start-timeout,错因归类为「响应超时」而非「模型调用失败」。不挂死但污染诊断;`:788-789` 的 externally-driven 分支已示范了先订阅后等的正确形态。

### P2-8 ingress 防线对 `source:'collab'` 是字符串白名单直通

- `packages/onething-runtime/src/app/engine/stream-engine.ts:85`。「只有协调器的驱动可以流式驱动 room」的判别依据只是命令里的字符串 source;server HTTP 转发命令 WHOLE(CLAUDE.md 明文不剥字段),对既有 store 里的 room 会话,伪造成本是一个字段。当前暴露面被「server 拒建 room」缩小,属防御纵深缺口而非现行漏洞。

### P2-9(并入 P1-3)permission 计数账本运行期即不可靠 + `permission:timeout` 死分支

- `collabBoard.ts:60` + `packages/core/permission/index.ts`(`emitNextPrompt` 只发队首)。见 P1-3 关联段。

### P2-10 三张模块级 Map 只增不减,删房间/agent 后残留

- `coordinator.ts:228/585`、`board-store.ts:39`。`rooms`、`agentSessionLocks`、`writeQueues` 仅 shutdown 全清;无「房间删除」钩子通知 collab 层,也无人清 `<store>/collab/<roomId>/` 目录;`clearCollabBoardBroadcast` 导出了却无人在删房路径调用。单机规模无害,长寿进程稳定泄漏。

## P2 — 核心产品层(src/collab)

### P2-11 mention 重绘按可替换前缀匹配,会腐蚀嵌套前缀的成员名

- `mentions.ts:217-224`。成员 小李(改名 小明)与 小李工 并存时,`@小李工` 被 `startsWith` 命中「小李」→ 输出 `@小明工`,投影与意愿窗口读到不存在的名字。解析端(`parseCollabMentions` :34-47)做了 longest-wins 消歧,重绘端丢了这一课。激活走 id 不受影响,损害在模型侧文本。

### P2-12 冷却窗口把投影系统行计为对话推进,任务事件密集时发言冷却被冲掉

- `cooldown.ts:49-56`。协调器连贴两条 `collab-task` 系统行即可把 agent 自己的 say 顶出 K_cd 窗口 → 它立即重新获得自选资格。W21 语义是「被搭话才解除冷却」,系统播报不是搭话。

### P2-13 投影只合并 user 侧相邻块,同 agent 连发多条 say 产出相邻 assistant 消息

- `projection.ts:124-131` vs `:149-152`。连发 say 是 W19 明文特性;严格交替的 provider(本仓手写 deepseek 等)要么 400 要么靠 provider 层兜底。生产真身 `app/engine/stream/message-helpers.ts` 同错(双实现两份同盲区)。

### P2-14 四处截断按 UTF-16 code unit 切,会切断代理对留下孤立 surrogate

- `say.ts:286`、`willingness.ts:76-78`、`reply-quote.ts:39-42`、`system-lines.ts:139-146`。emoji/扩展区汉字处 `String.slice` 产出孤立高位代理,持久化进房间消息;JSON round-trip 变 U+FFFD,部分 provider 对畸形 UTF-8 直接拒收。一个 code-point 安全截断工具即可收口。

### P2-15 断路器对无 toolCallId 的 execution-start 静默失明

- `circuit-breaker.ts:127-129`。`if (!toolCallId || counted.has(toolCallId)) return null` 一律不计数。当前引擎事件均带 id,属防御性缺口;但自称结构性兜底的组件,失效模式应是「多计」而非「静默不计」(无 id 时仍计数、只放弃去重)。

### P2-16 roster 未命中时裸 agentId 泄进模型窗口

- `willingness.ts:63-72`、`projection.ts:83-92`。被移出群的 agent 的历史发言渲染为 `agent-63ac…: 内容`;本层其它路径(mention label 快照等)都为离场成员设计了回退,这里是唯一的口子。

### P2-17 冻结房间静默吞 @:frozen 早退不产生等价 blockedByChain 的信号

- `activation.ts:116`。调用方拿不到「有 mention 被冻结吞掉」的事实,无法贴系统行;链闸路径有 `blockedByChain`、say 侧有 `COLLAB_SAY_REFUSED_FROZEN`,激活侧对称信号缺失。

## P2 — 渲染/传输层

### P2-18 board `load()` 的 GET 响应可覆盖更新的广播快照(无 rev 可比的乱序竞态)

- `collabBoard.ts:66-76`。await 期间一条更新的 `collab:board-changed` 先落进 `boards`,旧 GET 响应到达后无条件覆盖;`CollabBoardGetResponse` 不带序号/rev。若那条广播是最后一次变更,看板停留旧状态直到下一次写。

### P2-19 反应通道的 actor 由渲染层自报,与板操作「actor 钉死主进程侧」的信任模型矛盾

- `packages/shared/ipc/collab.ts:170-175` + `apps/electron/src/main/ipc/collab.ts:83-94`。`CollabMessageReactRequest.actor` 允许 `{type:'agent',agentId}` 且 handler 原样透传;同文件对 board act 明文「renderer must never be able to act AS an agent」。现有 UI 只传 `{type:'user'}`,wire 上的 agent 分支对 IPC 纯多余,钉死即可。

### P2-20 表情回应丢弃响应体,`success:false` 是静默无操作

- `MessageList.vue:322-335`。handler 从不抛、失败以 `{success:false,error}` 返回,调用方整体丢弃——"Message not found"/"Unsupported emoji" 下用户点 chip 无任何反应,违反本系统自己的「refusal 以文字落地」纪律。

---

## P3 / 边缘

- **UTC 预算日**:`coordinator.ts:137-139` `budgetDayKey` 用 `toISOString`,「日预算」按 UTC 切天——北京时间早上 8 点才复位,「今天已花费」与用户的「今天」错位 8 小时。(主导者发现。)
- **spawnWork 的 catch 过宽**:`worker.ts:369-372` catch 覆盖了 `harvestWork`——harvest 阶段抛错(store 读写异常)会把已被 worker 推到 review 的卡误退回 todo 并贴「启动失败」。低概率,但 catch 应收窄到 spawn 阶段。(主导者发现。)
- **冻结双重噪声**:冻结路径 `postSystemLine('房间已全部暂停…')` 之外,每个被 abort 的 worker 的 harvest 还会再贴一条「执行中断…可重新指派」(与 P2-5 同场景),一次刹车 N+1 条系统行。
- **`chainNoticePosted` 不持久化**:重启后同一停摆会重贴「我先按住了」行。
- **`CollabBoardAction` 双份类型定义**(`shared/ipc/collab.ts:69-84` vs `collab/board.ts:85`):shared 侧注释已认账并说明失效模式(漂移→运行期 reducer 报错文本),记录在案不动。
- **RoomMemberStrip 的 `saving` 守卫静默丢弃并发的第二个操作**(`RoomMemberStrip.vue:197-199`):窗口极短,但与组件自己头注的「never a silent no-op」相悖。

---

## 结构性债(不对应单点修复,决定后续演进成本)

1. **abort 语义是最脆的关节**:W18 之后「停止」散落在 room / agent-exec / work 三种 session kind 上,两个止损入口(冻结、超时)打错靶(P0 双雄同根)。建议收敛 `abortRoomTurn(roomSessionId)` 单点。
2. **coordinator 是 1538 行神模块**:调度、预算、链闸、harvest、配置、typing 兜底全在一处;`runtime.state` 被并发协程共享裸写,watermark 单调性等不变量靠人肉维持(P2-2/P2-3 的温床)。
3. **「tested spec + 生产另写一份」双实现**:projection.ts 自声明生产真身在 `message-helpers.ts`、链长 live/replay 双口径靠 W12 约定对齐——纪律防复制错误,不防共同盲区(P2-13 即两份同错)。
4. **消息分类学全押在 stringly-typed 的 `source`/`origin.source` 双字段**:六个标记 × 两个字段,已有引擎复制 drive 信封导致误读的真机事故前科;P2-8 的伪造面也源于此。建议收敛单一 `classifyCollabMessage()` 入口。
5. **三套可见性口径并存**(投影口径 / 可见口径 / renderer 隐藏口径):P2-12 正是「模型口径」被复用到「对话是否推进」这一第三种语义上产生的。
6. **生命周期尽力而为**:定时器不入册、handler 无按房串行化、删房无清理钩子——单用户桌面能活,CLI daemon(collab:true)会放大毛边。
7. **host 面二分天下**:collab 是 desktop + CLI 专属;server 诚实拒绝 room(好过假 room),但 `collab:typing`/`collab:board-changed` 已进 shared 事件类型却从未被 web 消费验证;同 store 先桌面建房、后被 server 服务时,room 会话靠 renderer 约定过滤而非服务端过滤(远期缝)。若未来开 server 群聊,预算账本、boot reconciliation 全量装载、board.json 同步 IO 都需重估。

---

## 已排查为「符合设计/非问题」的疑点(避免重复排查)

- **task-event 豁免链长闸**:multi-agent-collab.md §6.2 有 2026-07-27 真机实测修订明文,由 per-task 打回≤2 + 受阻≤2 + 预算闸兜底,非偏差。
- **权限 120s 自动拒的 collab 分支**:已实现(`permission-policy.ts` `isCollabTurn` 走交互等待 + 30min 软提醒,不进 timeoutAskBridge)。
- **重派 doing 卡双 worker**:`requeueWork` 有 abort-first + enqueuePending,安全。
- **意愿回复解析的回显防御**(负向前瞻):逐字符推演过,不会把提示词回显误判为 true/👍。
- **层次边界**:`src/collab/` 零违规 import;renderer 零处直触 `window.electronAPI`;7 条 collab IPC 通道全部登记于 channels.ts。
- **事件订阅无重复注册/泄漏**(renderer):单次布尔闩 + SSE refcount + typing 60s TTL 读时过期,自洽。
- **reply/reaction 数据流闭环**:reaction 写 → `message:updated` → ipc-bridge 全量转发 → chat store 合并;quote 取用即清、切会话即弃。
- **RoomSettingsDialog 分步保存**:`setCollabRoomConfig` 内部做集合等价 diff,重发同 roster 不重写不重发群公告。
- **web 端可用度**:干净的整体缺席而非半残——方法闸(WEB_DESKTOP_ONLY)+ 能力闸(collabRooms 恒 false)+ 入口隐藏 + server 400 四层一致。
