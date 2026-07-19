# /goal — 会话级长期目标系统设计

> 2026-07-12 起草。参考 codex 的 goal 扩展(`codex-rs/ext/goal/`),映射到 onething 现有基础设施。
>
> **实施状态(2026-07-12)**:Phase 1 已全部落地(含修订项:maxTurns 回归修复、
> 跨 run trigger、默认 token 上限),typecheck + 相关测试(330)全绿。落地文件清单
> 与设计偏差见 §12。

## 0. 功能定义

`/goal` 给一个会话挂一个**持久化的长期目标**(objective + 可选 token 预算)。目标处于
active 状态时,agent 每次停下来都会被 continuation 提示重新驱动,直到:

- 模型拿出**证据**证明目标完成 → `complete`
- 同一阻塞条件连续多轮重复 → `blocked`
- token 用量达到预算 → `budget_limited`(注入一次收尾提示,之后不再续跑)
- 用户手动暂停/清除

## 1. codex 的做法(对照参考)

| 部件 | codex 实现 |
| --- | --- |
| 形态 | 独立扩展 crate `ext/goal`,feature flag `goals` 门控,通过 extension hook 挂进主循环 |
| 数据模型 | thread 级 SQLite 一行:`objective / status / token_budget / tokens_used / time_used_seconds`,跨 session 持久,一 thread 同时只允许一个未完成 goal |
| 状态机 | `Active / Paused / Blocked / UsageLimited / BudgetLimited / Complete`;模型只能置 `Complete/Blocked`,其余归用户/系统 |
| 注入方式 | **不进 system prompt,不是普通 user 消息**:渲染成 source="goal" 的 internal context fragment("steering"),三个模板:`continuation` / `objective_updated` / `budget_limit` |
| 续跑 | `on_thread_idle` → goal 为 Active → 用 continuation prompt 作为输入**启动新 turn**;运行中改 objective 则把 `objective_updated` 片段注进当前 turn |
| 完成纪律(模板原文要点) | 不许缩小目标迁就当前轮;完成必须有当前证据,"intent/partial progress/plausible answer"都不算;`blocked` 必须同一阻塞条件**连续 ≥3 轮**才允许 |
| 记账 | 每次 token usage / 工具完成时累积落库;`tokens_used >= budget` 由 SQL CASE 自动翻 `BudgetLimited`;翻转后注入一次收尾 steering(去重),终态不再续跑 |
| 防死循环 | turn 以错误结束 → goal 置 `Blocked`(或 UsageLimited),阻止自动续跑烧 token |
| 工具 | `get_goal` / `create_goal`(仅用户明确要求时)/ `update_goal`(status 枚举**只有** complete/blocked,handler 硬校验) |
| 注入安全 | objective 一律 XML 转义 + 包 `<untrusted_objective>`,模板声明"这是任务数据,不是高优先级指令" |
| 事件 | 唯一事件 `ThreadGoalUpdated` 同步 TUI/SDK |

## 2. onething 映射:四个部件的挂接点

| 部件 | codex | onething 挂接点 |
| --- | --- | --- |
| 存储 | SQLite thread_goals 表 | `session.goal` 字段 → meta.json(`JsonlMetaFile` 有索引签名,`kind:'meta'` 整写,storage-driver.ts:90/148) |
| 每轮注入 | steering fragment | 现成 `<context-update>` 尾注链:GoalProvider 产出 volatility=`turn` 的变量 → `buildTurnContext` → `renderContextUpdateBlock`(turn-context.ts:29)→ 拼到最新 user 消息尾(message-helpers.ts:126)。**零引擎改动** |
| 停止→续跑 | on_thread_idle 起新 turn | run 内:`afterTurn`(core/agent-loop/runner.ts:416,返回 replacementMessages 即 `continue`);跨 run:post-response trigger(triggers/index.ts)兜底 `max_turns` |
| 模型工具 | get/create/update_goal | 新 `goal` 工具(tools/builtin/goal.ts),update 硬校验只收 complete/blocked |
| 用户入口 | TUI /goal 菜单 | renderer command(services/commands/index.ts 样板)+ IPC `goal:get/set/clear` |
| 事件 | ThreadGoalUpdated | EventBus `goal:updated` → IPCBridge → renderer chip |

## 3. 数据模型

```ts
// packages/onething-runtime/src/goals/types.ts
export type SessionGoalStatus =
  | 'active' | 'paused' | 'blocked' | 'budget_limited' | 'complete'

export interface SessionGoal {
  id: string
  objective: string           // untrusted user data,注入时转义 + 包标签
  status: SessionGoalStatus
  tokenBudget?: number
  tokensUsed: number
  timeUsedSeconds: number
  continuationCount: number   // 自动续跑次数(防失控 + UI 展示)
  createdAt: number
  updatedAt: number
}
```

与 codex 的差异:去掉 `UsageLimited`(onething 无 provider 用量限额语义,出错统一走
`blocked`);加 `continuationCount` 做续跑硬上限。会话级(= codex 的 thread 级),随
meta.json 持久,一会话同时只允许一个未完成 goal。

状态转换权限(与 codex 相同):

- 模型(goal 工具):`active → complete | blocked`,仅此两个。
- 系统:`active → budget_limited`(记账翻转)、`active → blocked`(错误熔断)。
- 用户(/goal 命令):create / edit objective / pause / resume / clear / 改预算。

## 4. 注入设计(复用 context-update 通道)

新增 `GoalProvider`(`packages/onething-runtime/src/variables/providers/goal.ts`,仿
session-store provider),claims 保留名 `goal`(加入 `RESERVED_NAMES`,variables/types.ts:83),
`list()` 返回一个 volatility=`turn` 的变量,渲染:

```
<goal status="active" tokens_used="12400" token_budget="100000" remaining="87600">
  <untrusted_objective>{escaped objective}</untrusted_objective>
</goal>
```

goal 非 active 或不存在时不产出 → 不占字节。走 turn 通道意味着永不进 prompt-cache 前缀,
objective 改动不炸缓存 —— 与 variable v2 的分层设计一致。

**注意**:`resolveTurnContextUpdateText` 有 append-only 去重(前一条相同则跳过),goal 文本
含 tokens_used 会每轮变化,天然不会被去重吞掉;但也因此每轮都是新字节 —— 可以把用量数字
按千位取整降低噪声。

## 5. 续跑机制(两层)

### 5a. run 内续跑:afterTurn goal adapter(主路径)

`stream-runtime.ts:812` 的 `afterTurn` 已经在跑 steering/follow-up adapter 链
(`runAgentLoopAfterTurnWithAdapters`,agent-loop-runtime.ts:1370)。加一个 goal 环节:

```
模型产出无 tool call 的最终回复
  → afterTurn: steering / follow-up 都为空时,查 session goal
  → status === 'active' 且 continuationCount < 上限
  → 记账(见 §6)后仍是 active
  → 注入 continuation 合成 user 消息,continuationCount++,loop 继续
  → 否则返回 undefined,run 正常结束
```

continuation 消息模板(移植 codex continuation.md 的三条纪律,放
`packages/onething-runtime/src/prompts/content/goal-continuation.md`,走现有 `?raw` 内容分离):

- 目标跨轮持续,**不许把目标缩小成本轮能完成的子集**;
- 完成判定只认**当前证据**,意图/部分进展/"看起来合理的答案"都不算;若证据不足,继续干活而不是标记完成;
- `blocked` 只有当**同一阻塞条件连续 ≥3 次续跑**仍在时才允许;难/慢/不确定/想要澄清都不是 blocked。
- 目标达成时调用 `goal` 工具置 `complete`(保住记账收尾)。

模板变量:objective(转义)、tokens_used、token_budget、remaining、continuationCount。

### 5b. 跨 run 兜底:post-response trigger(Phase 2)

run 以 `max_turns` 结束而 goal 仍 active 时,afterTurn 已无法续。注册一个
`createGoalContinuationTrigger()`(src/main/engine/triggers/index.ts),`shouldTrigger` 判
finishReason=max_turns && goal active && 冷却计数未超,`execute` 里 emit 一条合成
send-message 命令重新驱动(参考 scheduler `agent-task-runner.ts` 的 StreamHost 写法)。
MVP 可以先不做:max_turns 停下时 UI 提示"目标未完成,已达轮次上限",让用户点继续。

### 5c. 防死循环(必须与 5a 同期落地)

1. `continuationCount` 硬上限(默认 10,settings 可调);超限 goal 置 `paused` + UI 提示。
2. run 以**错误**结束 → goal 置 `blocked`(codex 的熔断,防 compaction 错误之类无限重启烧 token)。
3. `budget_limited` / `complete` / `blocked` / `paused` 一律不续。
4. 用户在续跑期间发新消息 → 正常插队(现有 pending/turn-queue 通道优先于 goal 环节)。

## 6. 记账与预算

- 挂接点:`onTurnTrace`(stream-runtime.ts:824 附近)已拿到每轮 `usage` —— 累加到
  `goal.tokensUsed`;`timeUsedSeconds` 用 run 起止墙钟。写入走 session store(`kind:'meta'`)。
- 预算判定收口在一个纯函数(仿 codex `status_after_budget_limit`):
  `active && tokensUsed >= tokenBudget → budget_limited`。
- 翻转成 `budget_limited` 时:**注入一次收尾 steering**(现成 `drainSteeringMessages` 通道,
  模板 goal-budget-limit.md:"不要开新的实质工作,总结进展/剩余项/给用户明确下一步"),
  每个 goal 只注一次(记 `budgetLimitReported` 标志)。之后不再续跑。
- Plan/只读类 agent 模式若将来存在,不记账(codex 对 Plan 模式的处理)。

## 7. 模型工具:`goal`

`packages/onething-runtime/src/tools/builtin/goal.ts`,单工具多 action(与 variable 工具风格一致):

```
goal(action: 'get')                          → 返回 goal + remaining
goal(action: 'update', status: 'complete' | 'blocked', reason?)
```

- `update` handler 硬校验 status 枚举,其余值报错("pause/resume/预算由用户控制")。
- 工具描述写明 codex 的纪律:complete 需目标真正达成且无剩余必做项;blocked 需同一阻塞
  条件连续 ≥3 轮。
- **不给模型 create**(codex 也基本禁止模型自发建 goal);创建走用户 /goal 命令。
- 工具可见性:仅当 session 存在未完成 goal 时注册进 tool plan(避免常驻占 schema 字节)。

## 8. 用户入口与 UI

- **command**:`src/renderer/services/commands/index.ts` 注册(样板照 compact):
  - `/goal <objective>` 创建(已存在未完成 goal 时报错提示先处理)
  - `/goal` 无参 → 展示当前 goal(objective/状态/用量/剩余预算)
  - `/goal pause | resume | clear`
  - `/goal budget <n>` 设/改 token 预算
- **IPC**:channels.ts 加 `goal:get/set/clear`;`src/shared/ipc/goal.ts` 类型;
  `src/main/ipc/goal.ts` handler;preload create-api 暴露。
- **事件**:EventBus 新事件 `goal:updated`(session-events.ts)→ IPCBridge → renderer。
- **UI**:聊天顶部/InputBox 上方一个 goal chip:objective 摘要 + 状态色 + 用量进度;
  会话恢复时若 goal 为 paused/blocked/budget_limited,提示可 resume。画线风,后做。

## 9. 分期

**Phase 1(MVP,一次可交付)**
1. `goals/types.ts` + session meta 持久化 + 纯函数状态机(含 budget 翻转)— 单测友好
2. IPC + `/goal` command(create/view/clear/pause/resume/budget)
3. GoalProvider turn 注入
4. afterTurn goal adapter + continuation 模板 + 防死循环三件套(计数上限/错误熔断/终态不续)
5. `goal` 工具(get/update)
6. `goal:updated` 事件 + 最简 chip

**Phase 2**
- 记账精细化(工具粒度累积、时间预算展示)、gateway/web 侧展示、resume 提示完善。

> 分期修订(见 §11 风险):跨 run trigger 从 Phase 2 提到 Phase 1(maxTurns 会掐死
> run 内续跑,跨 run 才是长目标的主路径);默认全局 token 上限进 Phase 1;
> gateway 会话 Phase 1 直接禁用 goal。**前置依赖:先修 2026-07-11 审计的
> maxTurns 无界循环回归。**

## 10. 与 codex 的取舍差异汇总

- 注入用现成 `<context-update>` 通道而非独立 fragment 类型 —— 语义等价(非 system、非真实
  user 消息、cache 安全),零引擎改动。
- 续跑主路径在 **run 内**(afterTurn `continue`)而非"idle 后起新 turn" —— onething 的
  run/turn 边界与 codex 不同,afterTurn 是现成且最干净的钩子;跨 run 由 trigger 兜底。
- 状态机少一个 `UsageLimited`,多一个 `continuationCount` 硬上限(codex 靠错误熔断 +
  预算,onething 再加一层显式次数保险)。
- 记账粒度先按轮(onTurnTrace),不做 codex 的 per-tool-finish 粒度。

## 11. 风险清单(2026-07-12 评审补充,按严重度排序)

1. **maxTurns 掐死 run 内续跑**:afterTurn 的 `continue` 仍消耗同一 run 的 maxTurns
   额度(默认 8),且 tool-call 轮同样计数 → 长目标几轮即撞 `max_turns`。跨 run
   trigger 是真主路径,提进 Phase 1。**前置**:2026-07-11 审计发现 maxTurns 迁移
   回归为无界循环,必须先修——回归 + 自动续跑叠加 = 两层保险同时失效。
2. **permission 挂起假死**:无人值守续跑碰到未预授权的 permission:request 会无限
   等待(goal 显示 active 实际停摆)。策略:续跑轮 permission 超时(默认 5min)→
   goal 置 `paused` + 通知;或创建 goal 时引导先授权工作目录。
3. **合成消息污染聊天记录**(已验证,2026-07-12):
   - 管道可直接复用:`followUpQueue` 的文档语义就是"agent 自然停止后才注入"
     (`packages/core/engine/message-queue.ts:2-5`),与 goal continuation 完全对口;
     goal 运行时向该队列 enqueue 即可,不用动 afterTurn 链结构。
   - 但**没有隐藏消息惯例**:注入消息以 `role:'user'` 进对话
     (agent-loop-runtime.ts:1209),非 `persisted` 则走 `persistInjectedChatMessage`
     → `store.addMessage`(src/main/engine/stream/agent-loop-runtime.ts:167)真实落库,
     并 emit `message:user-created`(stream-runtime.ts:418)→ renderer 渲染成普通
     user 气泡;renderer 无任何按 origin/source 的过滤。
   - **不要用 `persisted:true` 骗过落库来隐藏**:不落库则重启后历史重建丢失
     continuation 消息,模型视角对话漂移,L1 追踪/原样重发也对不上。
   - 正确做法:照常持久化,给 ChatMessage 加 `source:'goal'`(或 `hidden` 标记),
     renderer 折叠渲染。展示先例:context-compact 用 `role:'system'` + JSON content
     `{type:'context-compact',...}` 由 MessageSystem.vue 特判成面板
     (timeline.ts:286 还有陈旧状态清理),goal continuation 可仿此渲染成一条
     细线/小面板("⟳ 目标续跑 · 第 N 次")。工作量:renderer 一处特判 + 类型字段,
     可控。
4. **停止/重启语义,宁停勿跑**:① 用户 stop 中止流 → goal 置 `paused`;② app 重启
   打开带 active goal 的会话**绝不自动续跑**,只弹 resume 提示;③ gateway
   (微信/Telegram)会话 Phase 1 禁用 goal(远程审批冒批 + 自动续跑风险叠加)。
5. **预算不可选**:continuationCount 只数"停下被推起"的次数;模型一直调工具不停时
   afterTurn 不触发、计数不动,唯一约束是 token 预算和 maxTurns。→ 必须有默认
   全局 token 上限(settings 可调),撤回 §9 "MVP 可不带预算"的说法。
6. **记账写放大 + 竞态**:每轮写 tokensUsed 回 meta.json 是整文件重写,且 goal 有
   三个写入方(loop 记账 / 模型工具 / 用户 IPC)。收口主进程单写者 + 攒批落盘
   (每 N 轮或状态变化时)。参考刚修完的 index.json 跨进程锁教训。
7. **长 run 次生膨胀**:L1 逐轮追踪全量落盘,一晚上单会话可上百 MB,而
   sanitizeAllSessionsOnStartup 全量读(302MB 已占 1.4s 启动)→ goal 长会话需要
   trace 轮转/上限。beforeTurn 压缩在长 run 高频触发,压缩出错必须计入"错误结束"
   走熔断置 `blocked`(codex 熔断的原始动机就是 compaction 错误循环)。

## 12. 实施记录(2026-07-12)

### 落地文件

| 部件 | 文件 |
| --- | --- |
| 前置修复 | `packages/core/agent-loop/runner.ts:316` maxTurns 回归(审计 1.1,一行) |
| 状态机/渲染 | `packages/onething-runtime/src/goals/`(types/state/render/index + content/*.md + 23 单测) |
| 持久化 | `session-repository.ts` `updateSessionGoal`(kind:'meta')、`src/main/stores/sessions.ts` + store 桶 |
| GoalManager | `src/main/goals/index.ts`(单写者;记账攒批:状态翻转/续跑/run 结束才落盘) |
| 引擎钩子 | `stream-runtime.ts`:`OnethingAgentLoopGoalHooks`(afterTurn 续跑注入 + onTurnTrace 记账/预算 steering);`src/main/goals/runtime-hooks.ts`(实现 + EventBus 熔断:error→blocked、abort→paused、complete→flush) |
| 跨 run trigger | `src/main/engine/triggers/goal-continuation.ts`(post-response 仅成功路径;emit send-message,origin.source='goal') |
| turn 注入 | `variables/providers/goal.ts` + bootstrap/gateways 注册;`goal` 入 RESERVED_NAMES |
| 工具 | `packages/onething-runtime/src/tools/builtin/goal.ts`(get/update 硬校验)+ `src/main/tools/builtin/goal.ts` |
| IPC/命令 | channels `goal:get/set`、`shared/ipc/goal.ts`、`src/main/ipc/goal.ts`、preload bridge、`/goal` command(view/create/pause/resume/clear/budget) |
| 事件/UI | `session:goal-updated` → ipc-hub → sessions store;`GoalStatusBar.vue`(ChatPanel composer 上方);`GoalContinuationLine.vue`(MessageItem 按 origin.source==='goal' 折叠) |
| 设置 | `ChatSettings.goalContinuationLimit`(默认 10)/ `goalDefaultTokenBudget`(默认 1,000,000) |

### 与设计的偏差

1. **goal 工具常驻注册**,未做 per-session tool plan 门控(§7 原设想);无 goal 时
   get 返回 "No goal is set"。单工具 schema 字节可忽略,门控需动 toolPlan,不值。
2. **续跑消息的模型侧字节**即渲染后的 continuation 模板全文,以 user 消息持久化
   (含跨 run 的 send-message 路径),UI 折叠;没有做 codex 式 internal fragment。
3. **时间记账**为轮间墙钟差(上限 1h/轮),非工具粒度。
4. gateway 禁用通过"goal 只能从 renderer /goal 创建"实现,未加显式 transport 检查。

### 验证

- typecheck node+web 全绿;涉及套件 330 测试全过;electron 生产构建通过
  (vite alias + `?raw` 解析验证)。全量 vitest 有 41 个失败,已用 stash 对照确认
  均为分支既有(todo-plan-window/global-shortcuts/media/ui-token-vars/InputBox
  context meter),与 goal 无关。
- 真机端到端(设 goal → 撞 maxTurns → trigger 续跑 → 工具 complete)未跑,
  需真实模型调用;建议首次真机验证用小预算(`/goal budget 20000`)。
