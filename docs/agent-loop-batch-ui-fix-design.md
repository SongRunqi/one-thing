# Agent Loop Tool Call 批量 UI 体验优化方案

## 问题回顾

当前 agent loop 在模型一次返回多个 tool call 时，UI 体验存在明显的"断层"：

1. 第一个 tool call 的 step 出现在 UI（参数流式接收完成，显示 running/executing）
2. **其余 tool call 的 step 完全不出现**
3. 第一个 tool 执行完毕（可能耗时数秒到数十秒）
4. 其余 tool call 的 step 突然同时出现并快速完成

### 根因

两层机制叠加：

| 层次 | 机制 | 影响 |
|------|------|------|
| Provider Adapter (`openai-compatible.ts`) | `tool-call-done` 事件在 SSE stream **完全结束后**才批量发射 | 所有 tool 的参数在 stream 期间已完全接收，但执行触发被推迟 |
| executeProviderTurn (`runner.ts`) | `handleToolInputEvent` 对**非活跃 tool call** 的 start/delta 事件缓冲在本地 Map，不推送到 EventQueue | UI 完全不知道 tools 2-N 的存在 |

具体代码位置：

- `packages/onething-runtime/src/agent-loop/providers/openai-compatible.ts` → `streamOpenAICompatibleResponse()`
- `packages/core/agent-loop/runner.ts` → `executeProviderTurn()` → `handleToolInputEvent()`

---

## 设计目标

1. **Tool call step 即时可见**：模型输出 tool-call-start 时，UI 立即显示 placeholder step
2. **参数流式更新**：tool-call-delta 实时推送到 UI，参数边接收边显示
3. **执行保持串行**：tool 的实际执行（文件 I/O、权限检查等）仍需逐个串行，保证数据一致性
4. **对现有 chunk 处理路径最小改动**：不改变 tool-result、permission 等后续流程

---

## 方案 A（推荐）：分离事件转发与执行调度

### 核心思路

将 `handleToolInputEvent` 的职责拆分为二：

- **事件转发**：所有 tool-call-start/delta/done 事件**无条件**推送到 EventQueue → UI 可见
- **执行调度**：`onToolCallDone` 回调串行化，只允许一个 tool 在执行

### 代码变更点

**文件：`packages/core/agent-loop/runner.ts` → `executeProviderTurn()`**

变更前（当前）：

```typescript
const handleToolInputEvent = async (event: AgentToolInputStreamEvent): Promise<void> => {
  const id = toolInputEventId(event)
  if (!activeToolCallId) {
    activeToolCallId = id
  }

  if (activeToolCallId !== id) {
    rememberBufferedToolEvent(event)  // 缓冲到本地 Map，不推送到 queue
    return                              // UI 看不到！
  }

  await collectAndEmit(event)           // 推送到 queue + 执行 tool
  if (event.type === 'tool-call-done') {
    activeToolCallId = null
    await flushBufferedToolEvents()
  }
}
```

变更后（建议）：

```typescript
const pendingExecutions: Array<{
  toolCall: AgentToolCall
  resolve: () => void
}> = []
let executionInProgress = false

const scheduleExecution = async (toolCall: AgentToolCall): Promise<void> => {
  if (!executionInProgress) {
    executionInProgress = true
    try {
      await onToolCallDone(toolCall)
    } finally {
      executionInProgress = false
      // 执行下一个排队的 tool call
      const next = pendingExecutions.shift()
      if (next) {
        next.resolve()
      }
    }
  } else {
    // 排队等待
    await new Promise<void>(resolve => {
      pendingExecutions.push({ toolCall, resolve })
    })
  }
}

const handleToolInputEvent = async (event: AgentToolInputStreamEvent): Promise<void> => {
  // ① 无条件转发到 EventQueue → UI 可见
  if (event.type === 'tool-call-done') {
    toolCalls.push(event.toolCall)
  }
  request.onEvent?.(event)

  // ② 对 tool-call-done：调度执行（串行）
  if (event.type === 'tool-call-done') {
    await scheduleExecution(event.toolCall)
  }
}
```

**移除的旧代码**：

- `bufferedToolEvents` Map
- `bufferedToolOrder` 数组
- `activeToolCallId` 变量
- `rememberBufferedToolEvent()` 函数
- `flushBufferedToolEvents()` 函数

### 流程图

```
Provider Adapter:  start(1) delta(1) start(2) delta(2) start(3) ...  | done(1) done(2) done(3) finish
                          │                │                │              │       │       │
                          ▼                ▼                ▼              ▼       ▼       ▼
executeProviderTurn:  ┌─────────────────────────────────────────────────────────────────────┐
                      │ handleToolInputEvent:                                               │
                      │   ① request.onEvent(event) → Queue → Chunks → UI 实时显示           │
                      │   ② if tool-call-done → scheduleExecution(toolCall)                 │
                      └─────────────────────────────────────────────────────────────────────┘
                                                                    │
                                                          ┌─────────┴─────────┐
                                                          │ scheduleExecution  │
                                                          │  (串行执行队列)     │
                                                          │                   │
                                                          │ done(1) → execute  │
                                                          │   ↓ 15s           │
                                                          │ done(2) → execute  │
                                                          │ done(3) → execute  │
                                                          └───────────────────┘

EventQueue → Chunks → UI:
  tool-input-start(1) → Step 1 占位
  tool-input-delta(1) → 参数流式更新
  tool-input-end(1)   → Step 1 running
  tool-input-start(2) → Step 2 占位      ← 现在可见！
  tool-input-delta(2) → 参数流式更新      ← 现在可见！
  tool-input-end(2)   → Step 2 running   ← 现在可见！
  tool-input-start(3) → Step 3 占位      ← 现在可见！
  ...
  tool-result(1)      → Step 1 completed
  tool-result(2)      → Step 2 completed
  tool-result(3)      → Step 3 completed
```

### 排队状态与 UI 表现

方案 A 中，`scheduleExecution` 确保了串行执行，但 `request.onEvent` 已将事件全部转发。这天然产生了一个"排队态"：tools 2-N 的 step 已在 UI 可见，但实际执行尚未开始。

#### 状态流转

```
Tool Call 生命周期（方案 A 后）:

  tool-call-start 到达
       │
       ▼
  ┌──────────┐
  │  占位    │  Step 出现，参数正在接收
  └────┬─────┘
       │ tool-call-delta → 参数流式接收
       │ tool-input-end (JSON 完整)
       ▼
  ┌──────────┐
  │ queued   │  Step 显示排队中，等待前面 tool 执行完毕
  └────┬─────┘
       │ scheduleExecution 出队
       │ onToolCallDone 被调用
       ▼
  ┌──────────┐
  │ running  │  正在执行（文件 I/O、权限检查等）
  └────┬─────┘
       │ tool.execute() 返回
       │ tool-result 事件
       ▼
  ┌──────────┐
  │completed │  执行成功
  │ /failed  │  执行失败
  │ /cancelled│ 用户取消
  └──────────┘
```

#### queued 状态的判定时机

`scheduleExecution` 是设置 queued 状态的关键节点：

```typescript
const scheduleExecution = async (toolCall: AgentToolCall): Promise<void> => {
  if (!executionInProgress) {
    executionInProgress = true
    // ★ 出队后、执行前，状态已是 running（由 tool-call fallback chunk 设置）
    try {
      await onToolCallDone(toolCall)
    } finally {
      executionInProgress = false
      const next = pendingExecutions.shift()
      if (next) {
        next.resolve()
      }
    }
  } else {
    // ★ 进入排队：tool-call-done 已转发到 queue，chunk 处理后 step 为 running
    // 但实际执行尚未开始 → UI 应显示 queued
    await new Promise<void>(resolve => {
      pendingExecutions.push({ toolCall, resolve })
    })
  }
}
```

**问题**：当前 chunk 处理逻辑中，`tool-call` fallback 或 `tool-input-end` 都会把 step 设置为 `running`，不会区分 `queued`。如果希望 UI 展示准确的状态，需要引入 `queued` 状态。

#### 两种设计选择

**选项 1：不引入 queued 状态（最简单）**

保持 step 状态为 `running`，用户在 UI 上看到多个 step 都显示 running，但通过 step 的排列顺序（从上到下）知道哪个正在执行。

```
UI 显示:
  Step 1: [running ⏳] ← 正在执行
  Step 2: [running]    ← 等待中（实际在排队）
  Step 3: [running]    ← 等待中
  Step 4: [running]    ← 等待中
  Step 5: [running]    ← 等待中
```

- 优点：零额外改动
- 缺点：用户无法区分"正在执行"和"排队等待"

**选项 2：引入 queued 状态（推荐）**

在 step/tool call 状态中新增 `queued` 值，在 `scheduleExecution` 排队时设置。

涉及改动：

1. `runner.ts`：`scheduleExecution` 中，非首个 tool call 进入排队时，通过 `onEvent` 发射一个 tool-metadata 事件标记 `queued` 状态
2. `stream-processor.ts` / `agent-loop-executor.ts`：处理 queued 状态更新 step
3. UI 层：渲染 `queued` 状态的 step（灰色/半透明 running 图标）

```
UI 显示:
  Step 1: [running ⏳]    ← 正在执行
  Step 2: [queued ⌛]     ← 排队中
  Step 3: [queued ⌛]     ← 排队中
  Step 4: [queued ⌛]     ← 排队中
  Step 5: [queued ⌛]     ← 排队中

  → Step 1 完成 →

  Step 1: [completed ✅]
  Step 2: [running ⏳]    ← 出队，开始执行
  Step 3: [queued ⌛]
  Step 4: [queued ⌛]
  Step 5: [queued ⌛]
```

#### 权限请求在排队场景中的表现

当 tool 1 需要用户确认权限时：

```
t=1s   Step 1: [running] → 权限弹窗出现
        Steps 2-5: [queued]（可见但排队中）

       用户在弹窗中选择"允许"

       如果 tool 1 是 edit（barrier）：
         → tool 1 执行完毕
         → tool 2 出队 → 如需权限，再次弹窗
         → tool 3 出队 → ...

       用户感知：弹窗逐个出现，每次弹窗时能看到下面还有 N 个 tool 在排队
```

如果用户希望"一次确认所有同类型 tool"（批量权限），则需要额外设计权限批处理机制，不在本次方案范围内。

#### scheduleExecution 的完整实现（含 abort 和 queued 信号）

```typescript
const pendingExecutions: Array<{
  toolCall: AgentToolCall
  resolve: () => void
}> = []
let executionInProgress = false

const scheduleExecution = async (toolCall: AgentToolCall): Promise<void> => {
  // Abort 检查：如果已取消，清空队列
  if (options.abortSignal?.aborted || request.abortSignal?.aborted) {
    pendingExecutions.length = 0
    throw createAgentAbortError()
  }

  if (!executionInProgress) {
    executionInProgress = true
    try {
      await onToolCallDone(toolCall)
    } finally {
      executionInProgress = false
      const next = pendingExecutions.shift()
      if (next) {
        // 出队前可选：发射 queued→running 信号
        // options.onEvent?.({ type: 'tool-metadata', turn, toolCall: next.toolCall,
        //   update: { metadata: { queued: false } } })
        next.resolve()
      }
    }
  } else {
    // 进入排队：可选发射 queued 信号
    // options.onEvent?.({ type: 'tool-metadata', turn, toolCall,
    //   update: { metadata: { queued: true } } })
    await new Promise<void>(resolve => {
      pendingExecutions.push({ toolCall, resolve })
    })
  }
}
```

### 优点

1. **最小改动**：只改 `runner.ts` 一个文件中的 `executeProviderTurn` 函数
2. **UI 体验显著改善**：用户能看到所有 tool call 的 step，不再有"突然出现"的困惑
3. **执行语义不变**：tool 仍然是串行执行，文件 I/O 顺序有保证
4. **Chunk 处理路径不变**：`agentEventsToProviderStreamChunks`、`applyAgentLoopStreamChunk` 等完全不受影响
5. **兼容现有 stream 结束后的批量 done 行为**：provider adapter 不需要改

### 注意事项

1. **`tool-call-done` 与 `tool-input-end` 的时序**：当前 provider adapter 在 stream 后批量发射 done。方案 A 不改这个行为，所以 tool-input-end（在 stream 期间触发）会先于 tool-call-done 到达 queue。`agentEventsToProviderStreamChunks` 中已有的 `entry.ended` 检查会正确处理：如果 tool-input-end 已发射，tool-call-done 会被 skip。

2. **执行状态与 UI 状态的对应**：forward tool-call-done 到 queue 后，如果 tool-input-end 尚未发射（罕见情况），会触发 `tool-call` fallback chunk，设置 step 状态为 running。如果 tool-input-end 已发射（正常情况），tool-call-done 被 skip，step 保持 running 状态。无论哪种情况，UI 都能正确反映 "正在执行中"。

3. **Abort 处理**：需要在 `scheduleExecution` 中检查 `abortSignal`，如果已 abort，清空 `pendingExecutions` 队列。

---

## 方案 B（备选）：Provider Adapter 边流边发射 tool-call-done

### 核心思路

修改 provider adapter，使 `tool-call-done` **在 stream 期间** 发射（当 JSON 参数完整时），而不是等 stream 结束。

```typescript
// 当前（openai-compatible.ts）
if (argumentsDelta && entry.name) {
  yield { type: 'tool-call-delta', ... }
  // ← 这里不检查 JSON 完整性，不发射 done
}
// ... stream 结束后 ...
for (const [entry] of toolCalls) {
  yield toolCallDoneEvent(turn, entry)
}

// 修改后
if (argumentsDelta && entry.name) {
  entry.arguments += argumentsDelta
  yield { type: 'tool-call-delta', ... }

  // 新增：JSON 完整时立即发射 done
  if (!entry.done && isCompleteAgentToolArguments(entry.arguments)) {
    entry.done = true
    yield toolCallDoneEvent(turn, entry)
  }
}
// stream 结束后：只发射 JSON 不完整的兜底 done
for (const [entry] of toolCalls) {
  if (!entry.done) {
    yield toolCallDoneEvent(turn, entry)
  }
}
```

### 优点

- 可以从根源上改善时序：tool-call-done 边流边发，执行更早开始

### 缺点

1. **影响范围大**：需要修改所有 provider adapter（openai-compatible、claude、gemini 等）
2. **时序复杂化**：stream 期间 tool-call-done 与 text-delta 交错，可能导致 tool 执行与文本输出竞态
3. **仍需方案 A 的 UI 转发改进**：即使 done 提前发射，executeProviderTurn 的缓冲仍然会隐藏 tools 2-N 的 start/delta
4. **不能完全解决问题**：如果 model 在输出 tool-call-done 前还在输出文本（tool_use 和 text 混合输出），`executeProviderTurn` 的 `for await` 仍会被 `onToolCallDone` 阻塞

---

## 方案 C（不推荐）：在 executeProviderTurn 层面改成并发执行

允许所有 tool 并发执行（移除串行化），完全消除排队延迟。

### 为什么不推荐

- **数据一致性风险**：多个 edit tool 同时修改同一文件会导致冲突
- **文件系统竞态**：read 和 edit 并发时可能读到中间状态
- **现有 barrier 机制失效**：`ToolExecutionScheduler` 设计就是为了防止这类问题
- **权限提示混乱**：多个 tool 同时需要确认时 UI 难以处理

---

## 推荐实施方案

采用 **方案 A**，具体改动只涉及一个文件：

- **文件**：`packages/core/agent-loop/runner.ts`
- **函数**：`executeProviderTurn()`
- **改动量**：约 80 行删除 + 50 行新增
- **测试**：需补充 `executeProviderTurn` 中事件转发和串行执行的单元测试

### 实施步骤

1. 在 `executeProviderTurn` 中添加 `pendingExecutions` 队列和 `scheduleExecution` 函数
2. 修改 `handleToolInputEvent`：移除本地缓冲逻辑，无条件转发事件，tool-call-done 通过 scheduleExecution 调度
3. 删除 `bufferedToolEvents`、`bufferedToolOrder`、`activeToolCallId`、`rememberBufferedToolEvent`、`flushBufferedToolEvents`
4. 保留 `collectAndEmit` 中的 `request.onEvent?.(event)` 调用，但将其移到 `handleToolInputEvent` 顶部以确保所有事件都被转发
5. 处理 abort 场景：在 scheduleExecution 回调中检查 abort signal
6. 编写单元测试验证：
   - 多个 tool-call-start 事件都被转发到 onEvent
   - tool-call-done 事件按顺序串行执行
   - abort 后队列被清空
   - finish 事件的 pendingFinishEvent 处理不受影响
7. 集成测试验证 UI 表现

---

## 附录：改动前后对比

### 改动前

```
用户看到:
  t=0s   Step 1 出现 (running)
  t=0~15s  [空白，无变化]
  t=15s  Step 1 completed, Step 2-5 同时出现并 completed
```

### 改动后（不引入 queued）

```
用户看到:
  t=0s    Step 1 出现 (running)，Step 2 占位出现，Step 3 占位出现...
  t=0~1s  Step 1-5 的参数依次流式更新完毕
  t=1s    Step 1-5 全部显示 running
  t=1~15s Step 1 running... Step 2-5 也显示 running（排队中，用户看不到区分）
  t=15s   Step 1 completed → Step 2 completed → Step 3 completed → ...
```

### 改动后（引入 queued 状态）

```
用户看到:
  t=0s    Step 1 出现，Step 2 占位出现，Step 3 占位出现...
  t=0~1s  Step 1-5 的参数依次流式更新完毕
  t=1s    Step 1: [running]   ← 正在执行
          Step 2: [queued]    ← 排队中
          Step 3: [queued]    ← 排队中
          Step 4: [queued]    ← 排队中
          Step 5: [queued]    ← 排队中
  t=1~15s 用户能看到：1 个在执行，4 个在排队
  t=15s   Step 1 [completed] → Step 2 [running] → Step 2 [completed]
          → Step 3 [running] → Step 3 [completed] → ...
```

### 相关测试文件

```
packages/core/agent-loop/runner.test.ts
packages/core/engine/__tests__/core-agent-loop-executor.test.ts
src/main/engine/__tests__/core-stream-engine.test.ts
```
