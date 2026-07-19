# 工具并发化·开放问题清单

> 来源：`tool-system-concurrency-audit-2026-07-16.md` §9 盲点排查（2026-07-17）。
> 并发化主体改造与阻塞级修复已落地（见审计文档附录）；本清单是**尚未处理**的残留问题，按影响排序。处理完一项就更新状态。

## OI-1 模型不知道工具会并行执行 【高·提示词】

- **状态**：✅ 已修复（2026-07-18 用户拍板实施）
- **修法**：`tool-guidelines.md` 新增一条：「同回复内的工具调用并行执行；独立调用应打包同发（如一次读多个文件）；有依赖的调用（如写完文件再运行）放到拿到结果后的下一条回复」。14 个 prompt 快照随之更新（golden ×7 + budget + baseline）。
- **问题**：全部 prompt 内容（`packages/onething-runtime/src/prompts/content/*.md`）零提及并发语义。模型按串行假设发依赖序列（同回合 write 文件 → bash 运行它；mkdir → 写入），全并行下同回合内必然竞态。这是全并行决策下最大的残留风险——文件层防护（FileReadTracker/路径互斥）只覆盖 edit/write 互相之间，bash 是黑盒。
- **建议修法**：`tool-guidelines.md` 增加一条：「同一回合发出的多个工具调用会**并行执行**，仅把相互独立的调用放进同一回合；有先后依赖的操作分回合发出」。
- **代价**：牵动 12 个 prompt 快照（golden ×7 + baseline ×5），改完 `-u` 更新即可。

## OI-2 MCP 同 server 并发无防护 【中】

- **状态**：✅ 已修复（2026-07-18）
- **修法**：`CoreMCPClientRuntime.callTool` 加实例级串行队列（`packages/core/mcp/client-runtime.ts`）——runtime 每 server 一实例，故**同 server 工具调用一次一个、不同 server 并行**；失败不阻塞后继（错误吞入队列尾）；per-call 超时从实际执行时起算，不含排队等待。读路径（readResource/getPrompt）保持不排队。两个宿主（`src/main/mcp/client.ts`、`apps/server/src/mcp-client.ts`）均委托此 runtime，生产全覆盖。测试：`packages/core/mcp/__tests__/client-runtime-serialization.test.ts`（顺序执行 + 失败不阻塞 2 案）。

## OI-3 无并发上限 + 无 doom-loop 去重 【中】

- **状态**：✅ 已修复（2026-07-17）
- **修法**：runner 加 FIFO 信号量 `createConcurrencyGate`（`maxConcurrentTools` 选项，默认 8，**per-stream 作用域**——不同 session/流各自独立，不共享池子）；签名去重逻辑从 CoreToolOrchestrator 下移到 `packages/core/agent-loop/tool-signature.ts`（engine 保持再导出），runner 的 `onToolCallDone` 在执行前按「工具名+稳定序列化参数」计数（**跨 turn、per-stream**，阈值 4），命中即返回错误结果而不执行，模型收到反馈。参数解析失败的调用也参与签名（原文兜底）。测试：runner.test.ts 新增 cap=1 串行断言 + 第 4 次同签名拦截断言。

## OI-4 UI 缺「排队中」表达 + steps 分组交错 【低·UX】

- **状态**：✅ 已修复/核销（2026-07-17）
- **a) 排队等待态——已实现**：新增两个权限生命周期事件（`src/shared/events/session-events.ts`）：
  - `permission:queued`：ask 注册但排在会话权限队列后面（或被合并成 follower）时发出，带 toolCallId。renderer 将对应 step 置 `awaiting-confirmation`、toolCall 标 `permissionQueued`——显示「Waiting for approval」徽标但**不出确认卡**（不设 `requiresConfirmation`）。
  - `permission:settled`：任一 pending 结算（本地/远程/grant 自动放行/清理）时发出，带头部+全部 follower 的 toolCallIds 与 decision。renderer 据此清卡/清等待态（allowed 时 step 回 running）——顺带补上了审计 3.1d 缺失的 resolved 通知，**远程（gateway）批准后本地卡片也能即时撤掉**。apps/server 镜像同步在 settled 时清理。升级路径：queued 的 ask 轮到队首时正常走 `permission:request` 变成可响应卡。
- **b) steps 分组交错——核销（前提失效）**：真实渲染路径 `buildToolActivityViews`（StepsPanel）是对 `message.steps` 的 1:1 映射，step 在 tool-call-start 到达时按**模型声明序**加入、并发只原地改状态不重排。相邻合并逻辑 `steps-panel-runs.ts` 全仓无生产调用方（图纸方案遗留死代码），不构成实际问题。
- 测试：core `ask-serialization.test.ts` 新增 queued/settled 事件断言；renderer `chat-permission.test.ts` 新增排队态/升级/结算 3 案。gateway 未接 settled（其 `onPermissionRequest` 适配面窄，跨渠道撤销提示留作后续）。

## OI-5 provider adapter 的 done 发射时机 【低·收益】

- **状态**：✅ 已核销（2026-07-17 核对，无需改动）
- **结论**：审计引用的「批量推迟」描述已过时（来自旧版调查文档）。逐家核对现状：openai-compatible 与 deepseek 均已在参数 JSON 完整可解析时即发 `tool-call-done`（流末仅兜底未完成项）；claude 在 `content_block_stop` 逐块发；gemini/codex 随流逐个发；acp 不适用（外部 agent 自带工具执行）。全部 adapter 已支持边流边执行。

---

## 2026-07-18 复查轮（两路 fresh-eyes 审查）发现与修复

已修复：
- **F1【高】并发闸超限竞态**：旧实现「唤醒不移交槽位 + 醒后不复查」在特定微任务时序下可跑出 limit+1 并发（审查 agent 用模拟脚本稳定复现）。改为标准**槽位移交**信号量：释放方把槽直接交给队首 waiter（active 保持计数），后来者无法插队。`runner.ts createConcurrencyGate`。
- **F2【高·安全】权限合并放大 "once"**：等价键只含 (type, pattern, workdir, owner)，而 bash pattern 是 `rm *` 类前缀、MCP resources 只有工具名——并发下两条**不同**命令会被合并，批「仅此一次」放行了未展示的那条。等价键已纳入 `metadata`（含 bash 完整 command、MCP arguments），只合并逐字相同的请求。`permission/index.ts equivalenceKey`；新增不同 command 不合并的测试。
- **F3【高】doom-loop 误杀合法轮询**：跨 loop 无差别计数会拦掉 `BashOutput` 这类按设计同参轮询的第 4 次调用（生产 maxTurns=100）。改为**失败感知**：同签名**连续失败 3 次**才拦第 4 次，成功即清零——轮询永不累计，真死循环（反复重试同一失败调用）仍被拦。`runner.ts`；测试改写 + 新增轮询不拦截用例。
- F4【中】`addUsage` 补齐并行改动期间 types 新增的 cacheRead/cacheWrite/reasoning tokens 可选字段求和。
- F5【低】provider 重复发同 id `tool-call-done` 的守卫（忽略重复，防双执行/结果覆盖）。
- `Permission.initialize` 重复调用先退订旧 `command:permission-respond` 订阅（防泄漏）。
- renderer abort 清理循环（`cancelPendingPermissionsForAbort`）补清 `permissionQueued` 并把 queued-only toolCall 纳入取消范围。

已核查无问题：类型两侧一致、EventBus/IPCBridge 无白名单丢弃、**gateway 适配器首行按类型过滤新事件安全**、server 镜像/持久化对新事件安全、web 构建无 Electron 依赖、无事件风暴、tool-signature 搬移无循环依赖、MCP 队列失败不断链、bash 日志宽限充分、resume 过滤与既有语义一致。

残留（低危，留档）：
- **【既有缺口】apps/server 从不调 `Permission.initialize`**——headless 端 core Permission 无总线，工具真触发 ask 会永挂（"三套引擎装配"问题的一部分）；本次的 settled 镜像接线在 server 侧因此暂为死代码。修复需设计 server 的 channel/mode resolver 装配。
- abort 后被放弃的 turn 里在途工具仍会发 tool-result 事件（引擎 finalize 有兜底，僵尸写风险未逐口验证）；gate 排队者不监听 abort（醒后立即抛，无死锁，仅延迟）。
- renderer 刷新窗口内 queued 徽标不可恢复（getPending 只回 emitted；退化为无徽标，卡片链路不受影响）。

已修复归档（详见审计文档附录与 §9）：runner 全并行改造、权限 ask 串行+合并、resume 非终态过滤、bash 日志清理宽限、**apps/server 中止/删除 5 处不清 core pending 导致的整会话权限死锁**。
