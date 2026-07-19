# 工具系统并发化前置审计（2026-07-16）

> 目标：工具执行从同步串行改为并发执行。本文档是动手前的全链路调查——梳理现状架构、找出并发化会激活的问题与既有漏洞、给出修复优先级与改造路线。
>
> 调查方式：五路并行审计（核心执行管线 / agent-loop 调度器 / 权限系统 / 共享状态与副作用消费方 / history 配对），关键事实分歧已人工复核裁定。
>
> 相关既有文档：`docs/agent-loop-investigation.md`（串行机制与 UI 15s 延迟分析）、`docs/design/read-before-edit-guard.md`（FileReadTracker）、`docs/audit/system-audit-2026-07-11.md`。

---

## 0. 执行摘要

1. **并发基础设施已存在但空转**。`ToolExecutionScheduler`（barrier/segment 并发模型）、`isBarrierEffect`、各内置工具 `analyze()` 里的 `barrier` 声明、`resolveCoreToolExecutionMode` 全部已实现——但生产链路根本没走这套。生产工具执行是 `packages/core/agent-loop/runner.ts` 的**严格串行**（stream 消费循环内逐个 `await`）。
2. **仓库里有两条独立的工具执行链路**，语义已漂移：
   - **链路 A（生产）**：agent-loop runner。串行，无 barrier 概念，无 doom-loop 检测，无失败丢尾。
   - **链路 B（空转）**：`CoreToolOrchestrator` + `ToolExecutionScheduler`。支持并发，但包装类 `ToolOrchestrator`（`src/main/engine/stream/tool-orchestrator.ts:35`）**全仓只有自己的测试在实例化**，且即便启用，`isBarrierTool` 未传 → `?? true` → 全 barrier 伪串行。
3. **并发化的真正战场在 runner.ts**，不是调度器文件。三处阻塞级串行假设：`activeToolCallId` 输入流缓冲、tool 消息 push 顺序 = 执行顺序、任一工具需确认/中止即抛错打断整个 loop。
4. **权限系统与 resume 路径是并发化最大的隐蔽雷区**：整个权限 UX（单卡、键盘快捷键、网关 FIFO）和 `buildResumeHistoryAfterToolConfirmation` 都隐式假设「同一时刻最多一个工具在等确认、确认时兄弟工具均已终态」。并发直接摧毁这两个假设。
5. **利好**：会话持久化（per-session 串行写队列）、edit/write 的 read-before-edit 防护（hash 校验 + 按路径互斥队列）、history 的 tool_call/tool_result **按 id 同源 1:1 配对**、UI 结算层按 toolCallId 键控——这些对并发天然友好，无需改动。

### 必须在并发化前修复的问题（阻塞级）

| # | 问题 | 位置 |
| --- | --- | --- |
| P0-1 | runner 串行三件套：输入流缓冲 / push 顺序 / 首个抛错语义 | `runner.ts:195-240, 353-407` |
| P0-2 | resume-after-confirm 不做 status 过滤，未完成兄弟工具被谎报 `{error:null}` 并丢结果 | `history.ts:740-766` |
| P0-3 | barrier 分类必须覆盖「所有可能弹权限框的工具」——Read 的 `sensitive_file_read`/`external_directory` 效果不在现有串行名单内 | `tool-effect.ts:13-14` vs `tool-execution-order.ts:37-46` |
| P0-4 | tool 消息顺序：并发完成后需按 toolCall 声明序回填，不能沿用完成序 push | `runner.ts:362, 370, 406-407` |

---

## 1. 现状架构：两条链路的事实裁定

### 1.1 链路 A —— agent-loop runner（生产）

调用链：`CoreStreamEngine` → `runtime.streams.*`（`core-stream-engine.ts:509/646/727/843`）→ `packages/onething-runtime/src/agent-loop/stream-runtime.ts:970` → `runAgentLoop()`（`packages/core/agent-loop/runner.ts`）。

串行化由**两层机制**保证（详见 `docs/agent-loop-investigation.md` §2/§7）：

1. **Provider adapter 层**：openai-compatible adapter 在 SSE 流结束后才批量 yield 所有 `tool-call-done`（流期间只发 start/delta）。
2. **runner 层**：`executeProviderTurn` 用单一 `activeToolCallId` 强制同一时刻只处理一个 tool call 的输入流（`runner.ts:224-240`），非活跃 tool 的事件缓冲在本地 Map（`:207-222` flush）；`tool-call-done` 分支里 `await onToolCallDone(event.toolCall)`（`:195-198`）——**工具执行阻塞在 stream 消费循环内**，下一个 tool 的事件必须等当前工具执行完。

执行与结果收集（`runner.ts` `onToolCallDone`，`:353-380`）：

- `executeAgentToolCall` → runtime 侧 `direct-tool-execution.ts`（onething-runtime 版，`:99` 有 `beforeSideEffect` 参数但 **A 链路没喂**）。
- `allToolResults.push`（`:362`）、`pendingToolMessages.push`（`:370`）——push 顺序 = 执行顺序（串行下恰好 = 声明顺序）。
- 任一工具 `aborted` → 抛 abort error；`requiresConfirmation` → 抛 `AgentLoopPauseForConfirmationError` **直接打断整个 loop**（`:364-369`）。
- turn 结束：`messages.push(assistant)` 后 `push(...pendingToolMessages)`（`:406-407`）。
- `maxTurns` 是外层 turn 循环（`:281/:316/:447-455`），与工具并发正交。

**A 链路没有**：barrier 概念、`beforeSideEffect` 接线（`AgentToolExecutionContext` 无此字段，`types.ts:131-139`；`agent-loop-runtime.ts:681-698` 构造 AgentTool 时未传）、doom-loop 签名去重、失败丢尾清理。副作用顺序正确性 **100% 依赖串行执行本身，无任何 gate 兜底**。

### 1.2 链路 B —— CoreToolOrchestrator（已实现，空转）

- `packages/core/engine/tool-orchestration.ts:409` `CoreToolOrchestrator`：job/barrier 模型，`start()` 每 tool call 同步入队（`:442-485`），交给 `ToolExecutionScheduler.enqueue(fn, { barrier })`。
- `packages/core/agent-loop/tool-execution-scheduler.ts:20-54`：非 barrier job 同 segment 内并发；barrier job `Promise.allSettled(priorJobs)` 后独占。
- **事实裁定**（人工复核）：`new CoreToolOrchestrator` 只出现在 `src/main/engine/stream/tool-orchestrator.ts:54`（包装类 `ToolOrchestrator`），而 `ToolOrchestrator` 全仓**仅被 `src/main/engine/__tests__/tool-orchestrator.test.ts` 实例化**——生产无消费者。
- 即便启用：`tool-orchestration.ts:450` `isBarrier = this.options.isBarrierTool?.(...) ?? true`，且全仓**从未有人传过 `isBarrierTool`** → 全 barrier → 伪串行。**这套并发能力从未在任何配置下真正打开过，缺乏实战验证。**
- B 链路独有、A 链路缺失的语义：doom-loop 检测（`:388-404, 459`）、失败后丢弃排队尾部（`stoppedByFailedToolCallId` + `discardQueuedTailAfter`，`:499-505, 564-582`）、`beforeSideEffect` 接线（`:1024`）、queued 状态发布/隐藏（`:527-539`）。

### 1.3 已备好但未接线的并发素材

| 素材 | 位置 | 状态 |
| --- | --- | --- |
| `isBarrierEffect`（file_edit/file_write/bash/mcp/capability_change → barrier） | `packages/core/tools/tool-effect.ts:40-48` | 已实现，无消费者 |
| 各内置工具 `analyze()` 的 `barrier` 声明（bash=true `bash.ts:174/188/203/219`；edit=true `edit.ts:200`；write=true `write.ts:175`；read=false `read.ts:278`；grep/glob/find/ls=false） | `packages/onething-runtime/src/tools/builtin/` | 已声明，无消费者 |
| `resolveCoreToolExecutionMode`（'parallel'\|'sequential'）+ `SEQUENTIAL_TOOL_ID_FALLBACKS` | `registry.ts:571-585, :246` | 已实现，算出来没人用（IPC `src/shared/ipc/tools.ts:49` 也带 `executionMode?`） |
| `OrderedSideEffectQueue` / `needsOrderedSideEffectGate` | `agent-loop/tool-execution-order.ts:11-46` | **死代码**（被 scheduler 取代，`createGate` 全仓无调用）；其工具名单仍有参考价值 |
| `packages/core/tools/tool-loop.ts` `executeToolCalls` | `tool-loop.ts:9-16` | **死代码**（纯 for-await 串行，无生产消费者，语义与真实路径不同，易误导） |

### 1.4 重复实现清单（改造时须防「只改一份」）

- `packages/core/engine/direct-tool-execution.ts`（服务 B，`beforeSideEffect` 在 `:164`）vs `packages/onething-runtime/src/tools/direct-tool-execution.ts`（服务 A，`:99`）——两份平行实现。
- 链路 A/B 本身即是两份平行的工具编排实现。

---

## 2. 阻塞级问题（并发化前必须解决）

### 2.1 runner 的三处串行假设（并发化核心改造点）

**位置**：`packages/core/agent-loop/runner.ts`

1. **输入流强制串行**（`:195-198, 207-240`）：`activeToolCallId` 缓冲 + `tool-call-done` 分支内 `await` 工具执行。并发化必须解耦「接收 tool call 输入」与「执行工具」。`runner.test.ts:88-122` 明确锁死此串行语义（"does not stream the next tool call until the current tool execution settles"），改造时测试须重写。
2. **消息顺序 = push 顺序**（`:362, 370, 406-407`）：并发下完成顺序 ≠ 声明顺序。多数 provider 要求 tool 消息与 assistant `toolCalls` 配对完整；虽然 history 重建路径按 id 配对（见 §5），但 runner 循环内的 in-flight `messages` 数组直接喂 provider，**必须改为按 toolCall 声明序预分配槽位、完成后回填**。
3. **「首个即中断」语义**（`:364-369`）：任一工具 abort/需确认即抛错打断 loop。并发下抛错时兄弟工具可能已产生副作用且仍在途——需要改为「收敛全部 settle（或至少全部到达安全点）后再决策」，并定义在途工具的处置（等待/取消/结果保留）。`runner.test.ts:124-148` 锁死「确认时不启动后续工具」，同样须重写。

### 2.2 resume-after-confirm 谎报未完成兄弟工具（数据正确性）

**位置**：`packages/core/engine/history.ts:740-766`（`buildResumeHistoryAfterToolConfirmation`）；调用点 `core-stream-engine.ts:841`；主进程包装 `src/main/engine/stream/resume-history.ts:11`

- 该路径对 `assistantMessage.toolCalls` **不做 status 过滤**（`:744`），全部工具无条件出 tool_use + tool-result 双侧；非 completed 一律合成 `{ error: toolCall.error ?? null }`（`:762`）= **`{error: null}`**。
- 串行世界：确认时兄弟工具几乎必然已终态，边角极少触发。**并发世界**：barrier 工具等确认时，先行的非 barrier 兄弟可能仍 `executing` → resume 历史把它们**谎报为失败**，真实结果被丢弃，模型可能重复执行。
- 修法方向：resume 前等待兄弟工具终态化（等价于 `waitForAll`），或对未完成工具生成「仍在进行」占位而非 `{error:null}`。

### 2.3 barrier 分类必须覆盖所有「可能弹权限框」的工具

**位置**：`packages/core/tools/tool-effect.ts:13-14` vs `packages/core/agent-loop/tool-execution-order.ts:37-46`

- Read 工具会产生 `external_directory` 与 `sensitive_file_read` 两种效果，二者**会走 `permission.ask()` 弹框**（`permission-policy.ts` 的 `promptEffects` 只排除 `kind==='read'`）。
- 但 Read 在所有既有串行名单（`needsOrderedSideEffectGate`、`SEQUENTIAL_TOOL_ID_FALLBACKS`、工具自身 `barrier:false` 声明）里都是**可并发**的。
- 若 barrier 判定简单沿用这些名单，多个并发 Read 命中敏感路径时会**同时弹多个权限框**，进而激活 §3 的全部权限系统隐患。
- 修法方向：「任何可能 ask 的效果」强制 barrier，或在 `ask()` 层做全局串行化/合并（见 §3.2）。注意权限判定发生在工具执行内部（`enforcePermissionPolicy`），调用前无法静态预知是否弹框——所以要么按「可能弹框」保守归类，要么在 ask 层解决。

---

## 3. 高危问题

### 3.1 权限系统：并发多框的连锁反应

权限请求-响应的基础机制**本身是安全的**：`ask()` 每请求 `randomUUID()`，`respond()` 按 `session.pending.get(requestId)` 精确匹配；通道亲和校验（2026-07-11「冒批」修复）在并发下依然成立；gateway 每 (channel,userId) FIFO 队列、reply 只作用于 `queue[0]`（`permission-coordinator.ts:70-124`），无歧义。**但以下四点在并发多框时暴露：**

| # | 问题 | 位置 | 等级 |
| --- | --- | --- | --- |
| 3.1a | **无事前合并**：两个并发工具触发同一权限 → 各自 `ask()` → renderer 挂两张卡。事后去重（`respond()` 内遍历 pending 自动 resolve）只对 `session`/`workdir` 生效、对 `once` 不生效，且该循环在串行模型下是死代码，并发化后**首次真正生效、未经实战验证** | `core/permission/index.ts` respond 去重循环（约 :250-300） | 高 |
| 3.1b | **core 自动放行不通知 gateway**：`watch()` 只订阅 `onPermissionRequest`，不订阅 resolved/cancel。core 侧 dedup 自动 resolve 的 pending 在 gateway 队列里成为**幽灵项**——用户会收到已失效的审批提示，回复后 core 返回 "No pending request"，队列阻塞至回复或 60s TTL | `packages/gateway/src/core/permission-coordinator.ts:46-68` | 高 |
| 3.1c | **键盘快捷键恒批第一张卡**：`currentPendingPermission` 取全消息列表中**第一个** `requiresConfirmation` 的 toolCall，Enter/Esc 布尔驱动不带 requestId。多卡并发时按 Enter 可能批错卡（鼠标点击安全） | `ChatPanel.vue:200-206` + `usePermissionShortcuts.ts` | 高 |
| 3.1d | **无 `permission:resolved` 事件**：自动放行后 renderer 无撤卡通知（依赖后续 tool-result 间接更新，有窗口期）、gateway 无同步信号（即 3.1b 根因） | 全仓无该事件 emit | 中（3.1b 的根因） |

另：renderer 本身**支持**多卡并存（`chat.ts` `applyPermissionRequest` 按 toolCall 挂 `permissionId`，无全局单例队列）——UI 数据层不阻碍并发，问题集中在快捷键与撤卡通知。

### 3.2 history 中间态重建：静默丢结果

**位置**：`packages/core/engine/history.ts:513-524`（`completedHistoryToolCalls` status 白名单：completed/failed/cancelled/input-streaming）

- history 正确性依赖读取时各 toolCall 已终态。若在部分并发兄弟仍 `executing` 时重建历史（中途 abort、另一轮请求组装、快照持久化），这些工具被**双侧同时剔除**——配对仍合法（不会 400），但**工具真实跑了、结果没进历史**，模型看不到。
- 叠加共享数组整份写回（§3.3）会加剧：并发写回可能把已完成工具的 status 覆盖回中间态。

### 3.3 若启用链路 B：共享可变状态竞态清单

以下仅在接入 `CoreToolOrchestrator` 时相关（均在 `packages/core/engine/tool-orchestration.ts`）：

| 状态 | 位置 | 风险 |
| --- | --- | --- |
| `this.toolCalls`/`turnToolCalls` 与 processor 共享**同一数组引用**，`publishToolCall` `.some()` 查重后 push，执行前后整份 `updateMessageToolCalls(…, allToolCalls)` 写回（last-writer-wins） | `:413-414, :527-539, :922, :1055` | 高：并发写回覆盖中间态、顺序错乱、UI 抖动。应改为快照/增量 |
| `stoppedByFailedToolCallId` + `discardQueuedTailAfter`：「失败后丢弃其后排队工具」的 tail 边界由**完成时序**决定，乱序完成时误丢/漏丢 | `:421, :499-505, :564-582`（`queuedTailToolCallIdsAfter` `findIndex`+`slice` `:182`） | 高 |
| `discardedToolCallIds`、`executedToolCallIds`、`jobs[]`/`settled`、`toolSignatureCounts` | `:417-420` | 中：依赖「从单一同步点入队」的不变量 |
| `ToolExecutionScheduler` barrier 快照：`enqueue` 同步读 `currentSegmentJobs` 并整体替换 Set；若从异步回调入队，正在运行的 job 可能不被 barrier 等待 | `tool-execution-scheduler.ts:33-52` | 中：需保持「同步入队」不变量并加测试 |

### 3.4 A 链路缺失语义补齐（若选择在 runner 内并发化）

B 有而 A 没有的：doom-loop 签名去重、失败丢尾 + artifact 清理、queued 状态 UI 表达、`beforeSideEffect` 接线。并发化 A 时需决定逐项补齐或明确放弃，否则相对 B 是语义回退。

---

## 4. 中危问题

| # | 问题 | 位置 |
| --- | --- | --- |
| 4.1 | **并发 bash 的后台日志误删**：每次 `exec` 开头 `cleanupBackgroundJobLogs()` 删除不在保留集内的 `background-*.log`；而 job 注册发生在进程退出后。并发 bash 时 B 的 cleanup 可能删掉 A 刚创建未注册的日志。现被 bash 串行掩盖 | `bash-executor.ts:259, 313-323` + `background-jobs.ts:97-129` |
| 4.2 | **abort 粒度**：AbortController 按 session 一个（`stream-processor.ts:43` `activeStreams`），所有工具共用 `ctx.abortSignal`（`tool-execution.ts:123`）；abort 检查是轮询式（`direct-tool-execution.ts:143/149/175`），长耗时段（MCP 调用）不可打断。并发下无法「只取消一个工具」，且「取消后仍有工具在跑」被放大。需 per-tool linked AbortController |
| 4.3 | **`input-streaming` 入 history 白名单**（`history.ts:522`）：参数残缺的工具会以不完整 `args` 生成 tool_use + `{error:null}` 结果，严格 provider 可能 schema 校验失败。并发 + abort 放大残缺数量 |
| 4.4 | **MCP client 无本地串行队列**：`callTool` 直接透传底层 Client（`client-runtime.ts:109-126`），靠请求 id 多路复用。当前 MCP call 归 barrier 掩盖了对有状态/stdio server 的并发风险；将来若放开 MCP 并发需逐 server 评估 |
| 4.5 | **事件交错**：event-bus per-session seq 反映 emit 实时顺序；并发工具事件按调度交错。事件均带 `stepId`/`toolCallId`，键控消费者安全；顺序敏感消费者需逐个复核。UI 需要「多个同时 running」的表达（A 链路无 queued 状态） |
| 4.6 | **权限错通道响应静默忽略**：通道亲和校验失败只 warn + return，请求继续挂起，无用户反馈（`core/permission/index.ts` 约 :108-128） |
| 4.7 | **`buildMessageContent` 同源性待核验**：assistant content 由 runtime 注入的 `buildMessageContent(message)` 生成（`history.ts:562`）。若其从原始 provider content parts 重建 tool_use 而未按 `completedHistoryToolCalls` 同源过滤，content 内 tool_use 与 tool-result 会失配 → 400。**未证实，需下一步核验** |

---

## 5. 利好面：已并发友好、无需改动的部分

| 领域 | 结论 | 依据 |
| --- | --- | --- |
| **history 配对** | tool_use 与 tool-result 来自**同一个过滤数组的同一次 map**，按 `toolCallId` 配对，非 index 隐式配对。并发完成顺序不影响配对正确性，不会产生 orphan → 400。discard 的工具已从数组移除，双侧都不含。`result===undefined` 有 `sanitize→null` 兜底 | `history.ts:575-597, :352-393, :196-200` |
| **会话持久化** | 整文件覆盖写 + `AsyncSaveQueue` 每 session 严格串行 + `getLatest` 取内存快照——并发落盘不交错不丢写。跨进程 `index.json` 有文件锁。JSONL 写同样过 per-session 队列 | `src/main/stores/sessions.ts:65-66`、`async-save-queue.ts:117-142`、`file-mutex.ts:123` |
| **edit/write 防护** | `FileReadTracker` 按 session+path 记 sha256、盘上 hash 不符强制重读；「读校验+写」整体包在按路径的 `withFileMutationQueue` 内 + hash 重校验循环。TOCTOU 双重关闭 | `file-read-tracker.ts:35-120`、`edit.ts:260, 337-383`、`write.ts:236, 317-343`、`file-mutation-queue.ts:13-38` |
| **bash 环境隔离** | 无 `process.chdir`；cwd 每次作为 spawn 参数传入；`getShellEnv()` 每次返回新对象。并发 bash 不经 cwd/env 互相干扰 | `bash-executor.ts:105-110, 256-332` |
| **UI 结算层** | agent-loop-executor 全部按 `toolCallId` + `stepIdsByToolCallId: Map` 定位，不假设顺序；step 匹配按 id 非 index；tool-step-view 按 step 独立取值，多 running 可共存 | `agent-loop-executor.ts:563-610`、`tool-step-view.ts:214-235, 407-420` |
| **grants 写入** | `addGrant`/`saveWorkspaceGrants`/`respond` 全同步函数，JS 单线程下原子，无 data race（**前提**：`writeJsonFile` 保持同步；若改 `writeJsonFileAsync` 会引入丢写竞态） | `permission-grants.ts` 约 :141-175 |
| **MCP 只读动作** | search/find/list/describe 不产 effect → 可并发，只读安全；`call` 归 barrier | `tool-orchestration.ts:693, 706-723`、`tool-effect.ts:41-47` |

---

## 6. 低危 / 顺手项

- **`tool-loop.ts` 与 `tool-execution-order.ts` 死代码**：标注 deprecated 或删除，避免误导（前者语义与真实路径不同尤其危险）。
- **steps 面板相邻分组**：`buildStepActivityRuns` 把相邻同类 step 合并成 run（`steps-panel-runs.ts:34-48`），并发交错打乱分组，纯视觉。
- **usage 账本**：`flush()` 与定时器可能并发两次 `flushNow`，同月文件 `appendFile` 大缓冲下 OS 层交错；且账本记录来自 LLM 调用非工具执行，工具并发不加剧（`ledger.ts:86-89, 143-159`）。
- **gateway 60s stale-reply TTL**：并发队列抖动时窗口内仍可能错配 stale reply（`permission-coordinator.ts:13`）。
- **`publishToolCall` O(n²) 线性查重**（B 链路，`tool-orchestration.ts:527`）。
- **`isBarrierTool` 缺省 `?? true`**：实现遗漏分支返回 undefined 会静默退回串行，难察觉——接线后建议改为显式必传或加断言。

---

## 7. 改造路线建议

### 7.1 架构决策：在哪里做并发

两个选项：

- **方案一（推荐）：在 runner（链路 A）内引入并发，复用 `ToolExecutionScheduler` 与 `isBarrierEffect`**。理由：A 是生产链路且下游（executor/UI/持久化）已按 id 键控、并发友好；B 从未在任何配置下真正打开过并发，本身带着 §3.3 一整页共享状态竞态，接入等于同时引入两套问题。改造要点 = §2.1 三件套 + 补齐 §3.4 缺失语义 + `beforeSideEffect` 接线。
- **方案二：把 B 接到生产**。工作量看似小（传 `isBarrierTool` 即可打开），实则要先修完 §3.3 全部竞态、对齐 A/B 语义漂移，还要把 runner 的输入流缓冲拆掉——绕不开 §2.1。不推荐。

无论哪个方案，**保留唯一实现、删除另一条链路**，终结双实现漂移（含两份 `direct-tool-execution.ts`）。

### 7.2 barrier 分类基准

以 `isBarrierEffect`（`tool-effect.ts:40-48`）+ 工具 `analyze()` 声明为准：edit/write/bash/mcp-call/capability_change/variable 保持 barrier；只放开 read/grep/glob/find/ls 等只读工具。**额外规则**：任何可能产生 prompt 效果（`sensitive_file_read`/`external_directory`）的调用须 barrier 化或在 ask 层串行合并（§2.3）。

### 7.3 修复顺序

1. **P0（并发开关打开前）**：§2.1 runner 三件套、§2.2 resume 过滤、§2.3 权限-barrier 覆盖、消息槽位回填。
2. **P1（同一批落地）**：权限事前合并 + `permission:resolved` 事件 + gateway 撤卡订阅（§3.1a/b/d）、快捷键绑 requestId（§3.1c）、失败丢尾语义定义（并发下 tail 边界改为「声明序在失败者之后且尚未开始执行」而非完成时序）、§3.2 中间态重建防护（重建前 waitForAll 或对非终态显式占位）。
3. **P2**：bash 日志清理竞争（§4.1）、per-tool AbortController（§4.2）、`input-streaming` args 校验（§4.3）、核验 `buildMessageContent`（§4.7）、UI 多 running/queued 状态表达。
4. **P3**：死代码清理、视觉分组、账本 flush、O(n²) 查重。

### 7.4 测试

- `runner.test.ts:88-148` 两个 case 锁死串行语义，须重写为「并发但消息按声明序 / barrier 保证副作用顺序 / 多工具同时 pending 确认」的断言。
- 新增：并发 N 个 read + 1 个 edit 的顺序断言；并发双敏感 read 的权限合并断言；确认暂停时兄弟工具在途的 resume 正确性断言；并发 bash 后台日志保留断言。
- B 链路若弃用，`src/main/engine/__tests__/tool-orchestrator.test.ts` 随之删除。

---

## 8. 关键文件索引

| 文件 | 角色 |
| --- | --- |
| `packages/core/agent-loop/runner.ts` | **生产串行执行核心**（改造主战场） |
| `packages/core/agent-loop/tool-execution-scheduler.ts` | barrier 并发调度器（可复用） |
| `packages/core/agent-loop/tool-execution-order.ts` | 旧副作用 gate（死代码，名单有参考价值） |
| `packages/core/engine/tool-orchestration.ts` | 链路 B 编排器（空转；共享状态集中地） |
| `src/main/engine/stream/tool-orchestrator.ts` | B 的主进程包装（仅测试使用） |
| `packages/core/engine/history.ts` | tool_call/tool_result 配对（:513 白名单、:740 resume 缺陷） |
| `packages/core/engine/agent-loop-executor.ts` | 结算层（按 toolCallId 键控，并发友好） |
| `packages/core/tools/tool-effect.ts` | `isBarrierEffect` + prompt 效果定义 |
| `packages/core/permission/index.ts` | ask/respond、事后去重循环 |
| `packages/gateway/src/core/permission-coordinator.ts` | 网关 FIFO 审批（缺 resolved 订阅） |
| `packages/onething-runtime/src/tools/direct-tool-execution.ts` | A 链路底层执行（`beforeSideEffect` 未接） |
| `packages/onething-runtime/src/tools/bash-executor.ts` + `background-jobs.ts` | bash 执行与后台日志（清理竞争） |
| `packages/onething-runtime/src/tools/file-read-tracker.ts` / `file-mutation-queue.ts` | read-before-edit 防护（并发安全） |
| `src/renderer/components/chat/ChatPanel.vue` + `usePermissionShortcuts.ts` | 权限快捷键（第一张卡缺陷） |
| `src/renderer/stores/helpers/steps-panel-runs.ts` | steps 相邻分组（视觉交错） |

## 附：实施状态（2026-07-17）

用户决策变更：**不做 barrier 分类，所有工具一律并行**（§7.2 的分类方案作废，`ToolExecutionScheduler` 未接入）。文件级安全由既有 FileReadTracker + `withFileMutationQueue` 兜底。已落地：

1. **runner 全并行**（`runner.ts`）：删除 `activeToolCallId` 输入流缓冲；`tool-call-done` 到达即启动执行、不阻塞流消费；turn 末 `Promise.all` 收敛后按 abort > streamError > pause > 其他 的优先级统一抛错（P0-1/P0-3）。
2. **消息声明序回填**：tool 消息与 `allToolResults` 在 turn 末按 `agentTurn.message.toolCalls` 声明序从 `resultsByToolCallId` 回填，完成序不再影响 provider 请求（P0-2）。
3. **resume 过滤**（`history.ts`）：`buildResumeHistoryAfterToolConfirmation` 剔除非终态工具，不再谎报 `{error:null}`。另经查证 `requiresConfirmation: true` 全仓无生产者——暂停/恢复实为死路径，权限是 ask() 内联阻塞（修正 §2.2 的前提描述）（P0-4）。
4. **权限 ask 层串行 + 合并**（`permission/index.ts`）：pending 立即注册但 `permission:request` 按会话队列只发队首；等价 ask（type+pattern+workdir+owner）合并为 follower 共享结果。副作用：§3.1a（事前合并）、§3.1b（网关幽灵——未发射的 pending 被 grant 自动放行时从未到达网关/UI）、§3.1c（单会话同刻只有一张卡）一并消解（P0-5）。
5. **bash 日志清理竞态**（`background-jobs.ts`）：cleanup 跳过创建不满 60s 的日志（§4.1）。
6. **测试**：`runner.test.ts` 重写为并发语义 3 例；新增 `permission/__tests__/ask-serialization.test.ts` 5 例；`src/main/permission` 旧断言更新。改动关联 55 文件 259 用例 + gateway 76 用例全绿，typecheck（node+web）通过。其余 10 个失败套件（todo 窗口/快捷键/prompt 快照等）为分支既有 WIP，与本次无关。

## 9. 待核验项（2026-07-17 盲点排查后更新）

已核销：
1. ~~`buildMessageContent` 同源过滤~~ — 已核验：`message-content.ts` 只产 text/image/file/audio/video part，**不含 tool_use**，tool_use 仅来自 `completedToolCalls`，无失配 400 风险。
2. ~~apps/server 是否覆盖~~ — 已核验：server 的 `pendingPermissions` 只是事件镜像，底层 ask/pending 走 core `Permission`，串行化改造对 headless 生效。**但发现并已修复**：server 的中止/删除路径（`startSessionStream` 预中止、`command:abort`、adapter `abort` 单会话/全量、会话删除、`permissions.clearSession` 适配器）全部只清镜像、从不调 core `Permission.clearSession`——串行化后僵尸 pending 会永久占据队首、阻塞该会话后续所有权限请求（整会话权限死锁）。已统一接入 `clearSessionPermissions` helper（5 处）。

仍开放（按影响排序，**可追踪清单见 `tool-concurrency-open-issues.md`，编号 OI-1…OI-5**）：
1. **模型不知道工具会并行执行**：prompt 内容（tool-guidelines.md 等）零提及并发语义。模型常按串行假设发依赖序列（write→bash 运行、mkdir→写入），全并行下同回合内竞态。建议在 tool-guidelines.md 明示「同一回合的工具调用并行执行；相互依赖的操作分回合发出」（改动会牵动 12 个 prompt 快照）。
2. **MCP 同 server 并发**：`client-runtime.callTool` 无本地队列，靠 SDK 请求 id 多路复用；stdio/有状态 server 风险现已激活。可选修法：router 层 per-server 串行队列。
3. **无并发上限**：一回合 N 个 tool call 即 N 个并发执行（bash 进程/MCP 调用），无 cap；doom-loop 签名去重在生产链路也始终缺失。
4. **UI「排队中」表达缺失**：ask 未发射（排在权限队列后面）的工具显示为 executing；steps 相邻分组在并发交错下视觉错乱（`steps-panel-runs.ts`）。
5. provider adapter `tool-call-done` 发射时机逐家核对未完成：openai-compatible 批量推迟至 SSE 结束（并行收益仅在执行段），其余 adapter 未核对。
