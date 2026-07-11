# Agent Loop 调查文档

## 总体架构

本项目的 agent loop 是 **turn-based（基于回合）** 的，在一个 streaming 生命周期内可以有多个 turn。每 turn 模型输出可能包含文本、reasoning 以及若干 tool call。Tool call 被逐个串行执行；如果任何一个 tool 需要用户确认（permission），整个 agent loop 就会暂停等待用户确认后恢复。

核心代码分布在三个包中：

| 包 | 路径 | 职责 |
| --- | ------ | ------ |
| `@onething/core` | `packages/core/agent-loop/` | Agent loop 核心引擎（语言无关） |
| `@onething/core` | `packages/core/engine/` | Stream engine、chunk 处理 adapter |
| `onething-runtime` | `packages/onething-runtime/src/` | 主进程与 core 的桥接层 |
| 主进程 | `src/main/engine/stream/` | 实际 tool 执行、权限检查、IPC 通信 |

---

## 一、整体流程概览

```
用户发送消息
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│ StreamEngine.handleSendMessage()                            │
│   → 创建 user message、assistant message                    │
│   → resolveProvider() 获取 provider config + API key         │
│   → executeMessageStream()                                  │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│ executeMessageStream() (stream-executor.ts)                 │
│   → 判断是否图片生成 → 是则走 image stream                   │
│   → 否则走 agent loop stream                               │
│   → executeAgentLoopStreamGeneration()                      │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│ executeAgentLoopStreamGeneration()                          │
│   (src/main/engine/stream/agent-loop-executor.ts)           │
│   1. buildAgentLoopRuntimeFromStreamContext()               │
│      → 构建 tool definitions、provider、skills、prompt       │
│   2. streamAgentLoopProviderChunks(runtime)                 │
│      → 启动 runAgentLoop() 并转换为 Chunk stream            │
│   3. 消费 chunks: applyAgentLoopStreamChunk()               │
│      → 处理每个 chunk（text/reasoning/tool/...）             │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
            ┌───────────────────────┐
            │   runAgentLoop()      │  ← core agent loop
            │   (runner.ts)         │
            │                      │
            │  for turn = 1..max:  │
            │    ① executeProvider │
            │       Turn()         │
            │    ② 收集 tool calls │
            │    ③ 逐个执行 tools  │
            │    ④ 若有 tool call  │
            │       → 继续循环    │
            │    ⑤ 若无 tool call  │
            │       → 返回结果    │
            └───────────────────────┘
```

---

## 二、Tool Call 数组接收机制（核心问题）

### 2.1 关键结论：逐个串行处理，不等待完整数组

**Tool call 不是等整个数组到达后再统一检查权限、批量执行，而是每收到一个 tool-call-done 事件就立刻执行该 tool。**

### 2.2 Provider 输出层：Stream Events 到 Chunks

Provider（如 OpenAI）的 SSE 事件流经过 `agentEventsToProviderStreamChunks()` 转换为统一的 chunk 类型。

对于 **streaming provider**：

- `tool-call-start`：工具调用开始（带 toolCallId, toolName）
- `tool-call-delta`：工具参数流式增量（JSON delta）
- `tool-call-done`：工具调用结束（完整的 AgentToolCall 对象）

对于 **runnable（非流式）provider**：

- 整个 turn 先运行完，然后通过 `emitMissingAgentTurnStreamEvents()` 把完整的 tool calls 一次性合成事件发出

### 2.3 Runner 层：executeProviderTurn() 的串行化机制

这是 tool call 串行化的核心位置，在 `packages/core/agent-loop/runner.ts` 的 `executeProviderTurn()` 函数中：

```
                                 stream events
                                      │
                       ┌──────────────┼──────────────┐
                       │              │              │
                  text-delta    tool-call-*     finish
                       │              │              │
                       ▼              ▼              │
                content += delta  handleToolInput  pendingFinish
                                  Event()           Event
                                      │
                          ┌───────────┴───────────┐
                          │  activeToolCallId?    │
                          │                       │
                     null │               !== null │
                          ▼                       ▼
                  设为 active           id 相同？
                                          │
                                    相同  │   不同
                                          │    │
                                          ▼    ▼
                                   立刻处理   缓冲到
                                   + 发射    bufferedTool
                                             Events
```

核心代码逻辑（`runner.ts:executeProviderTurn` 中的 `handleToolInputEvent`）：

```typescript
const handleToolInputEvent = async (event: AgentToolInputStreamEvent) => {
  const id = toolInputEventId(event)

  if (!activeToolCallId) {
    // 这是第一个 tool call event，立即设为活跃
    activeToolCallId = id
  }

  if (activeToolCallId !== id) {
    // 不同 tool call 的事件 → 缓冲起来，等当前活跃的完成
    rememberBufferedToolEvent(event)
    return
  }

  // 当前活跃 tool call 的事件 → 立即处理
  await collectAndEmit(event)

  if (event.type === 'tool-call-done') {
    // 当前 tool call 完成 → 清空活跃，flush 下一个缓冲的
    activeToolCallId = null
    await flushBufferedToolEvents()
  }
}
```

`collectAndEmit` 对于 `tool-call-done` 事件会调用 `onToolCallDone`：

```typescript
case 'tool-call-done':
  toolCalls.push(event.toolCall)
  await onToolCallDone(event.toolCall)  // ← 立即执行 tool
  break
```

### 2.4 Tool 执行：onToolCallDone 回调

`onToolCallDone` 在 `runAgentLoop()` 中定义：

```typescript
onToolCallDone: async (toolCall) => {
  // 1. 调用 tool.execute(args, context) → executeToolDirectly()
  const result = await executeAgentToolCall({ options, toolMap, turn, toolCall })

  allToolResults.push({ toolCall, result })
  options.onEvent?.({ type: 'tool-result', turn, toolCall, result })

  // 2. 检查是否需要确认
  if (result.requiresConfirmation) {
    throw new AgentLoopPauseForConfirmationError(toolCall, result)
  }

  // 3. 将 tool result 作为 tool message 加入待发送列表
  pendingToolMessages.push({
    role: 'tool',
    toolCallId: toolCall.id,
    content: agentToolResultToMessageContentForCapabilities(result, capabilities),
  })
}
```

关键点：

- **每个 tool call 执行完后立刻检查 `requiresConfirmation`**
- 如果需要确认，立即抛异常暂停整个 agent loop
- 不需要确认的 tool result 收集到 `pendingToolMessages`
- **在当前 turn 的所有 tool calls 执行完后**，`pendingToolMessages` 才被 push 到 messages 数组

### 2.5 完整示例：模型返回 3 个 tool calls 的时序

假设模型返回 `[read_file, edit_file, grep]`：

```
时间线：

t0: stream 开始
t1: tool-call-start(id=1, read_file)   → activeToolCallId = "1"
t2: tool-call-delta(id=1, '{"path":...}')
t3: tool-call-start(id=2, edit_file)   → id != active, BUFFERED
t4: tool-call-delta(id=1, '...')
t5: tool-call-done(id=1)               → 执行 read_file ✅
                                        → active = null, flush buffer
t6: tool-call-start(id=2, edit_file)   → activeToolCallId = "2"
t7: tool-call-start(id=3, grep)        → id != active, BUFFERED
t8: tool-call-delta(id=2, '{"path":...}')
t9: tool-call-done(id=2)               → 执行 edit_file
                                        → 需要用户确认！抛异常 ❌
                                        → Agent Loop 暂停
                                        ↓
                              (等待用户确认/拒绝后 resume)
                                        ↓
t10: (resume) tool-call-start(id=3)    → activeToolCallId = "3"
t11: tool-call-delta(id=3, ...)
t12: tool-call-done(id=3)              → 执行 grep ✅
t13: finish event
```

---

## 三、权限检查流程

### 3.1 权限检查发生在 tool 执行内部

权限检查不在 agent loop 层面，而在每个 tool 的 `execute()` 函数内部，由 `enforcePermissionPolicy` 处理。

调用链：

```
onToolCallDone(toolCall)
  → executeAgentToolCall()
    → tool.execute(args, context)
      → executeToolDirectly()     (src/main/engine/stream/tool-execution.ts)
        → executeOnethingDirectTool()  (onething-runtime)
          → enforcePermission: enforcePermissionPolicy
            → 如果不需要确认：直接执行
            → 如果需要确认：返回 { requiresConfirmation: true }
```

### 3.2 权限确认流程

1. Tool 返回 `{ requiresConfirmation: true }`
2. 这导致 `settleAgentLoopToolCallResult` 设置 `toolCall.status = 'pending'`
3. `onToolCallDone` 检测到 `result.requiresConfirmation`，抛出 `AgentLoopPauseForConfirmationError`
4. `runAgentLoop` 的 try-catch 捕获此异常
5. `executeAgentLoopStreamLifecycleWithAdapters` 捕获，返回 `{ pausedForConfirmation: true }`
6. Stream engine 保留 AbortController（不清理），等待用户响应
7. 用户确认/拒绝后 → `handleResumeAfterConfirm` → 重新启动 agent loop
8. Resume 时使用 `buildResumeAfterToolConfirmation` 构建历史消息，从暂停处继续

---

## 四、Agent Loop 的 Turn 循环

```typescript
// runAgentLoop() 的核心循环 (runner.ts)
for (let turn = 1; ; turn++) {
  // ① 可选：beforeTurn hook（context compact、steering messages 注入）
  const replacementMessages = await options.beforeTurn?.({...})
  if (replacementMessages) messages = replacementMessages

  options.onEvent?.({ type: 'turn-start', turn })

  // ② 调用 provider 获取本 turn 的输出
  const agentTurn = await executeProviderTurn({
    request: { model, messages, tools, ... },
    provider,
    onToolCallDone: async (toolCall) => {
      // ③ 每个 tool call 立即执行
      const result = await executeAgentToolCall({...})
      if (result.requiresConfirmation) throw AgentLoopPauseForConfirmationError(...)
      pendingToolMessages.push({ role: 'tool', ... })
    },
  })

  // ④ 将 assistant message + tool results 加入对话历史
  messages.push(agentTurn.message)
  messages.push(...pendingToolMessages)

  // ⑤ 判断是否继续循环
  const toolCalls = agentTurn.message.toolCalls ?? []
  if (toolCalls.length === 0) {
    // 无 tool call → 对话结束
    return { messages, text, finishReason, ... }
  }
  // 有 tool call → 继续下一 turn（模型看到 tool results 后可能再生成 tool calls）
}
```

---

## 五、Tool 执行调度器（ToolExecutionScheduler）

在 `packages/core/agent-loop/tool-execution-scheduler.ts` 中定义的 `ToolExecutionScheduler` 用于 **main process 端的旧代码路径**（`CoreToolOrchestrator`），而非 agent loop 内部。

Agent loop 内部的 tool 执行是 **串行的**（由 `executeProviderTurn` 的 buffering 机制保证），不需要额外调度器。

但在 main process 的旧路径（非 agent loop 流程）中，`ToolExecutionScheduler` 工作机制如下：

- **Non-barrier jobs**（如 read、grep 等只读工具）：可以并发执行
- **Barrier jobs**（如 edit、write、bash 等修改性工具）：等待前面所有 job 完成后独占执行，后续 job 等待它完成

判定 barrier 的逻辑在 `needsOrderedSideEffectGate`：

```typescript
export function needsOrderedSideEffectGate(toolName: string): boolean {
  const normalized = toolName.toLowerCase()
  return normalized === 'edit'
    || normalized === 'write'
    || normalized === 'bash'
    || normalized === 'variable'
    || normalized === 'tool_function'
    || normalized.startsWith('mcp:')
    || normalized.startsWith('mcp_')
}
```

---

## 六、关键文件索引

| 文件 | 说明 |
| ------ | ------ |
| `packages/core/agent-loop/runner.ts` | **核心 agent loop**：`runAgentLoop()` 和 `executeProviderTurn()` |
| `packages/core/agent-loop/stream.ts` | Stream 工具类（EventQueue、abort 处理、turn 收集） |
| `packages/core/agent-loop/provider-stream.ts` | Provider event → Provider stream chunk 转换 |
| `packages/core/agent-loop/bridge.ts` | `streamAgentLoopProviderChunks()`：连接 runner 和 chunk 流 |
| `packages/core/agent-loop/tool-execution-scheduler.ts` | Tool 执行调度器（旧路径使用） |
| `packages/core/agent-loop/tool-execution-order.ts` | Side-effect gate（编辑类工具序列化） |
| `packages/core/agent-loop/errors.ts` | `AgentLoopPauseForConfirmationError` |
| `packages/core/engine/agent-loop-executor.ts` | Chunk 处理 adapter、stream lifecycle |
| `packages/core/engine/tool-orchestration.ts` | `CoreToolOrchestrator`（旧路径 tool 编排） |
| `packages/core/engine/stream-executor.ts` | 统一的 stream 入口路由 |
| `packages/core/engine/core-stream-engine.ts` | `CoreStreamEngine`：消息处理、steering、compact |
| `packages/onething-runtime/src/stream-processor.ts` | Stream processor 创建 |
| `packages/onething-runtime/src/agent-loop/stream-runtime.ts` | Agent loop runtime 构建、provider 适配 |
| `src/main/engine/stream/agent-loop-executor.ts` | 主进程 agent loop 执行器（绑定 store/emitter） |
| `src/main/engine/stream/agent-loop-runtime.ts` | 主进程 agent loop runtime 构建 |
| `src/main/engine/stream/tool-execution.ts` | 主进程 tool 执行（`executeToolDirectly`） |
| `src/main/engine/stream/tool-orchestrator.ts` | 主进程 tool 编排器（旧路径） |
| `src/main/engine/stream/stream-processor.ts` | Stream context、processor 类型定义 |
| `src/main/engine/stream-engine.ts` | `StreamEngine`：主进程 stream engine |

---

## 七、UI 延迟现象分析（你观察到的 15s 问题）

### 7.1 现象复述

你观察到的现象：

1. 第一个 edit tool 的 step 在 UI 中渲染（参数已完整接收，step 显示 running/executing）
2. 然后陷入约 15 秒的等待，UI 上没有任何变化
3. 15 秒后，剩余 4 个 edit tool 的 step 几乎同时出现并立即完成

你进一步确认：从 UI 角度看，第一个 tool 一直在等待（参数已收到但未真正开始工作），**直到所有 tool call 都被接收到之后，才开始一个一个执行**。

### 7.2 双重根因

这个现象由 **两层机制叠加** 导致：

**第一层：Provider Adapter 将 tool-call-done 批量推迟到 stream 结束后才发射**

```typescript
// packages/onething-runtime/src/agent-loop/providers/openai-compatible.ts
async function* streamOpenAICompatibleResponse(...) {
  // ① SSE streaming 期间：只 yield tool-call-start 和 tool-call-delta
  for await (const chunk of readJsonSseData(...)) {
    // ... yield tool-call-start, tool-call-delta, text-delta ...
  }

  // ② SSE stream 结束后：批量 yield 所有 tool-call-done（按 index 排序）
  for (const [, entry] of [...toolCalls.entries()].sort(([a], [b]) => a - b)) {
    yield toolCallDoneEvent(turn, entry)  // ← 所有 tool-call-done 一次性输出
  }

  // ③ 最后才是 finish
  yield { type: 'finish', turn, finishReason, usage }
}
```

**第二层：executeProviderTurn 的本地缓冲**

在 `runner.ts:executeProviderTurn()` 中，`handleToolInputEvent` 只允许当前活跃 tool call 的事件通过；不同 tool call 的 start/delta 事件被缓冲到**本地 Map**，不推送到 EventQueue。

### 7.3 完整时序追踪

假设模型在一次 turn 中输出 5 个 edit tool call。OpenAI SSE 的 tool_calls delta 是 interleaved 的（不同 index 的 arguments delta 交替出现）：

```
Provider Adapter 实际 yield 的事件流:
  ——— SSE streaming 期间 ———
  tool-call-start(id=1)   ← index=0 首次出现
  tool-call-delta(id=1)    ← index=0 arguments
  tool-call-start(id=2)    ← index=1 首次出现（interleaved！）
  tool-call-delta(id=2)    ← index=1 arguments
  tool-call-delta(id=1)    ← index=0 继续
  tool-call-start(id=3)    ← index=2 首次出现
  tool-call-delta(id=3)
  ...
  tool-call-start(id=5)
  tool-call-delta(id=5)
  ——— SSE stream 结束 ———
  tool-call-done(id=1)  ← 批量 yield，全部一起
  tool-call-done(id=2)
  tool-call-done(id=3)
  tool-call-done(id=4)
  tool-call-done(id=5)
  finish
```

`executeProviderTurn` 的 `for await` 循环处理这些事件：

| 步骤 | 来自 Provider Adapter 的事件 | activeToolCallId | 发生了什么 | Queue（EventQueue）收到什么 | UI 看到什么 |
| ------ | --------------------------- | ------------------ | ----------- | --------------------------- | ------------ |
| 1 | tool-call-start(1) | null→"1" | collectAndEmit → onEvent | tool-input-start(1) | Step 1 占位 |
| 2 | tool-call-delta(1)... | "1" | 参数完整 → 自动触发 tool-input-end | tool-input-delta(1), tool-input-end(1) | **Step 1 → running/executing** |
| 3 | **tool-call-start(2)** | "1" | **BUFFERED** (id="2"≠active) | **无** | **无** |
| 4 | **tool-call-delta(2)...** | "1" | **BUFFERED** | **无** | **无** |
| 5 | **tool-call-start(3)** | "1" | **BUFFERED** | **无** | **无** |
| ... | ... | "1" | **tools 3-5 全部 BUFFERED** | **无** | **无** |
| N+1 | tool-call-done(1) | "1" | onToolCallDone(1) → **await execute**(15s) | **无**（for-await 循环阻塞） | **Step 1 仍在 running** |
| N+2 | (15s 后) tool 1 完成 | "1"→null | 发射 tool-result(1), flush 缓冲 | tool-result(1) | Step 1 → completed |
| N+3 | flush → tool-call-start(2) | null→"2" | 缓冲的 start 事件被 emit | tool-input-start(2) | **Step 2 出现** |
| N+4 | flush → tool-call-delta(2) | "2" | → tool-input-end(2) | Step 2 → running |
| N+5 | 流中的 tool-call-done(2) | "2" | onToolCallDone(2) → execute(快) | tool-call(2), tool-result(2) | Step 2 → completed |
| N+6 | flush → tool-call-start(3) | null→"3" | ... | ... | **Step 3 出现** |
| ... | ... | ... | tools 3-5 逐个 flush + execute(快) | ... | 快速 completed |

### 7.4 为什么看起来 "所有 tool 都接收到以后才开始执行"

你的描述是正确的——原因如下：

1. **Provider Adapter 把 tool-call-done 批量推迟**：SSE stream 期间只发射 start/delta，stream 结束后一次性发射所有 done。这意味着**在执行任何 tool 之前，所有 tool 的参数（start/delta）已经全部被 provider 发出了**。

2. **executeProviderTurn 把非活跃 tool 的 start/delta 缓冲了**：tool 1 的 start/delta 进入 EventQueue → UI 可见；tools 2-5 的 start/delta 被缓冲在本地 Map → UI 不可见。所以你只看到 tool 1 的 step。

3. **tool-call-done(1) 触发执行，阻塞了整个 for-await 循环**：tool 1 开始执行（15s），期间 tools 2-5 的 tool-call-done 事件在 provider adapter 的 generator 中等待被消费，tools 2-5 的 start/delta 在 executeProviderTurn 的本地 Map 中等待被 flush。

4. **tool 1 完成后，flush + 消费剩余的 tool-call-done**：tools 2-5 的 step 出现（从 flush）→ tool-call-done 被消费 → 开始执行 → 快速完成。

所以从你的角度看：**第一步看到 tool 1 的 step（参数已齐，running），然后 15s 无动静，接着 tools 2-5 同时出现并完成**。这和你描述的 "所有 tool 都接收后才开始一个一个执行" 是一致的——只是 tool 1 实际上在收到自己的 done 后立即开始执行了，但 tools 2-5 的 **UI step** 被隐藏了。

### 7.5 与其他 Provider 的差异

上述 `tool-call-done` 批量推迟行为是 OpenAI-compatible adapter 的实现方式。其他 provider adapter（Claude、Gemini 等）可能有不同的行为：

- 部分 adapter 可能边流边发射 `tool-call-done`
- 但 `executeProviderTurn` 的串行化机制在所有路径上都存在

### 7.6 与旧路径（CoreToolOrchestrator）的对比

`CoreToolOrchestrator`（旧路径，当前未被 agent loop 使用）也有类似的隐藏/显示机制：

- Barrier tool 前，后续 tool call 被 `unpublishToolCall`（隐藏）
- 执行完成后 `publishToolCall`（显示）
- 也会造成批量出现的视觉效果

## 八、总结

1. **Agent loop 是 turn-based**：模型可能多次调用工具，每次调用后模型看到结果再决定下一步
2. **Tool call 逐个串行处理，但不是在 model 输出后立即开始**：有两层机制
   - **Provider Adapter 层**：OpenAI-compatible adapter 在 SSE stream 结束后批量发射所有 `tool-call-done`，stream 期间只发射 `start`/`delta`
   - **executeProviderTurn 层**：只让当前活跃 tool call 的事件进入 EventQueue，其余缓冲在本地 Map
3. **这导致了 UI 上的 "批量出现" 现象**：第一个 tool 的 step 可见但正在执行，其他 tool 的 step 被隐藏；当第一个 tool 执行完毕后，其余 tool 的 step 才出现并快速完成
4. **可以用 `tool-call-done` 事件作为执行触发点**：但需要注意，这些 done 事件是批量到达的，第一个 done 的执行会阻塞后续 done 的消费
5. **权限检查在 tool 执行内部**：由 `enforcePermissionPolicy` 处理，如果返回 `requiresConfirmation`，agent loop 立即暂停
6. **暂停后可以恢复**：通过 `handleResumeAfterConfirm` 重新启动 agent loop，从暂停的 tool 处继续
7. **pendingToolMessages 批量追加**：当前 turn 所有 tool results 在全部执行完后一次性 push 到对话历史
8. **ToolExecutionScheduler（旧路径）未被 agent loop 使用**：agent loop 内部通过 buffering 机制实现串行化
