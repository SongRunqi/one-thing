# Agent 持续性修复方案（对标 pi-mono）

> 背景：同一模型（deepseek-v4-pro）、同一任务，pi 能长时间自主工作，onething 有时一轮就结束。
> 本方案基于三轮代码分析 + `~/.onething/` 落盘运行数据实证，2026-07-22。

## 0. 实证结论（方案为什么长这样）

来自 `~/.onething/sessions/` + `evals/traces/` + `log/` 的证据：

| 会话 | 形态 | 结果 |
|---|---|---|
| 2dd98642（07-22，修复主题色，**有 goal**） | 3 个 run，35/47/41 轮 | 全部正常跑完，goal complete |
| 950b26b1（lenovo-scripts，**无 goal**） | ~50 个 run，最长 72 轮 | 模型肯调工具时无 goal 也能长跑 |
| 0eb980e9（07-21，"NA服务器重启后检查vc和java服务状态"，**无 goal**） | 2 个 run，各 **1 轮、0 工具调用**，finishReason `stop` | 典型的"一轮草草结束" |

结论：**循环机制本身没问题**（有工具调用就继续，chat 路径 maxTurns=100，`stream-runtime.ts:824`）。
一轮结束的直接原因是**模型第一轮就不调工具、直接文字作答**——这是 prompt 框架问题：
`default-system.md` 是问答框架（"请你帮助用户解决(解答)…疑惑和问题"），所有 agentic
指令（disposition 协议等）只挂在 goal 专用提示上，没建 goal 就一句都不出现。

次要但真实的风险（日志实证）：最近 12 天里 8 天出现 `stream:error`（api.deepseek.com
fetch 失败等），无 goal 的 run 遇到即当场死亡——loop 级没有任何重试。

对比 pi 的关键机制（`pi-mono/packages/agent/src/agent-loop.ts` 等）：
- 无轮数上限，唯一自然停止 = 模型回复不含工具调用
- 一切错误（工具报错 / API 抖动 / 输出截断）都转成消息喂回模型或退避重试，循环不死
- 自动 compaction 生成 Goal/Progress/Next Steps 检查点重新注入，目标在长跑中不丢
- 模型**没有"宣布完成"的按钮**；onething 的 goal 工具有 `complete`，给了模型提前退出的出口

---

## P0 — 根因修复（决定"一轮就停"）

### P0-1 System prompt 行动导向化 【S，收益最大】

**文件**：`packages/onething-runtime/src/prompts/content/default-system.md`

现状（问答框架）：

> 你是onething，一个人工智能助手，请你帮助用户解决(解答)他(她)遇到的疑惑和问题。

改为行动框架（草案，可再打磨）：

```markdown
<System>
你是 onething，一个运行在 agent 工作台中的智能助手。你可以读写文件、执行命令、
搜索网络。对于需要"做事"的请求，直接用工具执行并根据结果继续行动，直到任务真正
完成，而不是给出建议或计划就结束；只有纯知识问答才直接回答。

工作方式：
- 行动 → 观察结果 → 下一步行动。工具结果（包括报错）是你继续工作的依据，不是结束的理由。
- 声称完成之前，用工具验证（跑一下、读一下、查一下）。
- 遇到必须由用户决定的事才停下来询问；能自己查证的信息不要问用户。
</System>
```

注意保留现有的 guideline 合并、`<project_context>` 注入等管线（`buildOnethingSystemPrompt`），只改身份与工作方式段。

**验收**：用 0eb980e9 的任务原文回放（无 goal、普通消息），模型第一轮应发起工具调用而不是文字作答。

### P0-2 Loop 级瞬态错误重试 【M】

**文件**：`packages/core/agent-loop/runner.ts`（`executeProviderTurn` 调用处，~L407-465）+ 新建 `packages/core/agent-loop/retry.ts`

现状：provider 流错误经 `throwPrioritizedTurnError`（runner.ts:322）直接抛出终止 run；
codex.ts:655 算出的 `isRetryable` **没有任何消费者**（死代码）。goal 层的 3 次重试只对
有 goal 的会话生效，且以整个 run 为粒度（重新起 run，丢掉当轮进度）。

方案（对标 pi `agent-session.ts:2615` + `packages/ai/src/utils/retry.ts`）：
1. 新增可重试分类器：`overloaded`、`rate limit`、429/500/502/503/504、网络/socket 错误、
   `fetch failed`、流提前中断、超时 → 可重试；`insufficient_quota`/`billing`/配额类 → 不可重试；
   上下文溢出 → 不重试，交给 compaction 层。
2. 在 turn 粒度重试：同一轮内退避 2s/4s/8s 共 3 次，`abortSignal` 可中断 sleep，
   成功一轮即重置计数。重试时该轮的错误不进入消息历史。
3. 发 `auto-retry` 流事件供 UI 显示"重试中 (n/3)"。
4. goal 层 run 级重试保留为外层兜底（两层语义不同，不冲突）。
5. 顺手删除或接入 codex 的 `isRetryable` 死标志。

---

## P1 — 消除静默终止路径（provider 层实 bug）

核心循环的续跑判定只看 `toolCalls`（runner.ts:521-523），provider 丢了调用 = 静默一轮结束。

### P1-1 codex.ts：流中断丢工具调用 + finishReason 谎报 【M，实 bug】

- `tool-call-done` 只在 `response.output_item.done` 时发出（codex.ts:1321-1327），
  **流结束时没有 flush** 未完成的累积器（openai-compatible/deepseek/claude 都有 flush）。
  网络中断或服务端 `response.incomplete` → 0 个 toolCalls，但 `toolCallsEmitted` 在 start
  时已置 true，finish 强制 finishReason='tool_calls'（codex.ts:1081, 1403-1408）→ 静默一轮结束。
- `mapCodexFinishReason`（codex.ts:829-842）不认识线上的下划线形式
  `max_output_tokens`/`content_filter` → 截断被映射成 'unknown'。

修复：仿照 openai-compatible.ts:451-455 在流终止时 flush；finish reason 映射补下划线变体；
0 个 toolCalls 时不得报 'tool_calls'。

### P1-2 openai-compatible / deepseek：early-done 截断参数 【S】

`isCompleteAgentToolArguments` 判定首个可解析前缀即标记 done（openai-compatible.ts:435-442，
deepseek.ts:325-332），此后的参数增量继续累积但**不再重发 done**——网关先发 `{}` 再发真参数
时，工具以空参数执行。修复：去掉 early-done，只在流结束/新调用开始时发 done（UI 的流式
展示走 delta 事件，不受影响）。

### P1-3 gemini：MALFORMED_FUNCTION_CALL 静默死亡 【S】

gemini.ts:369-370 把 MALFORMED_FUNCTION_CALL 映射成 finishReason 'error'，无异常、无反馈
→ 一轮结束。修复：转成合成的 error tool result 喂回模型（"你的函数调用格式错误，请重发"），
让模型自我纠正（对标 pi 的 failToolCallsFromTruncatedMessage 思路）。

### P1-4 通用安全网：宣称 tool_calls 却无有效调用 → nudge 一次 【S】

在 runner.ts:521 的分支加保护：`finishReason === 'tool_calls' && continuationToolCalls.length === 0`
时，注入一条 user 消息（"你声明了工具调用但没有产生有效调用，请重新发出完整调用"）再跑一轮，
同一 run 内最多触发 2 次。这条兜底能罩住所有 provider 侧的丢调用 bug。

### P1-5 空 assistant 消息跳过 post-response hooks 【S，实 bug】

`agent-loop-executor.ts:2265`：`if (!input.session || !input.lastAssistantMessage) return null`
——max_turns 切断且最后一轮无尾部文本时，goal 跨 run 续命触发器被静默跳过。
修复：lastAssistantMessage 为空时回退到最后一条消息（或合成占位），保证 trigger 管线执行。

---

## P2 — 长跑健壮性

### P2-1 工具输出截断 【M】

现状：工具输出原文进上下文（无上限），长跑时把 compaction 逼到 hard-limit 抛错
（`agent-loop-runtime.ts:1013-1194` 的 'Context is still too large…' 会变成 stream error）。
对标 pi（`truncate.ts`：2000 行 / 50KB 双限，先到先截；全量落临时文件并把路径告知模型）：
在 `packages/onething-runtime/src/tools/builtin/` 加共享 truncate 工具，bash 尾部截断
（保留报错/结果）、read 头部截断、超限落 `~/.onething/tmp/` 并在结果尾部附 `Full output: <path>`。

### P2-2 goal complete 提高门槛 【S】

模型有 `goal complete` 这个提前退出按钮（pi 没有等价物）。改动：
- `complete` 增加必填 `evidence` 参数（逐条对应目标要求的验证证据）；
- 首次 `complete` 调用不直接生效，注入一条自检提示（"逐条核对目标要求，用工具验证后再次
  确认"），第二次 `complete` 才落地。会话内每 goal 只强制自检一次，避免死循环。

### P2-3 max_turns 切断的可感知性 【S】

现状：第 100 轮静默截断，模型不知道、也没有收尾机会（runner.ts:554-562 直接 return）。
改动：`turn === maxTurns - 1` 时经 beforeTurn 注入"还剩最后一轮，请收尾并总结状态"；
配合 P1-5 保证有 goal 时跨 run 续命必然接手。

### P2-4 无人值守权限确认降级 【M】

现状：'normal' 权限模式下第一个非只读 bash / 文件写入会挂起在无超时的 Permission.ask 上；
前台会话有 UI 可点，后台/未打开的会话**静默悬挂**（代码注释自证：radio 曾"twelve searches
deep 冻结在文件写确认上"）。radio 路径已有 ask→deny 降级，goal 运行没有。
改动：把 radio 的降级机制推广到所有无人值守 run（goal drive、后台会话）：超时（如 120s）
自动 deny 并把拒绝原因作为 tool result 喂回模型，run 不悬挂。

---

## 明确不做

- **不去掉 maxTurns=100**：pi 无上限，但 onething 有跨 run 续命兜底（修好 P1-5 后成立），
  上限是失控保护，保留。
- **不做"任务型消息自动建 goal"**：实证表明无 goal 也能长跑（950b26b1），P0-1 修完后
  goal 只是跨 run 兜底 + 预算/断路器的载体，维持用户显式创建的产品语义。

## 实施顺序与验证

1. P0-1 → 回放 0eb980e9 任务，验证第一轮出工具调用（改动只有一个 md 文件，先行合入）。
2. P1-1/P1-2/P1-3/P1-4 → provider 单测：模拟流中断/`{}` 前缀/malformed，断言不出现
   "0 调用 + tool_calls"组合（测试放 `packages/onething-runtime/src/agent-loop/providers/__tests__/`、
   `packages/core/agent-loop/runner.test.ts`）。
3. P0-2 → 单测：注入 429/网络错误序列，断言同轮重试与退避；断网 chaos 手测（拔网线 10s）。
4. P1-5、P2-* 按序。每步跑 `npm run check` + 相关 workspace 测试。

## 遗留疑点（不阻塞本方案）

- 设置里 `toolCallModel = deepseek-v4-flash`：provider 请求 dump 显示 flash 在 run 结束时刻
  被调用过（疑似标题/TOC 生成）。若任何主循环路径实际路由到 flash，模型能力差异也会影响
  坚持度，值得确认路由逻辑。
- 与 pi 对比的那次运行具体是哪个 session 未实锤（0eb980e9 形态最吻合）。
