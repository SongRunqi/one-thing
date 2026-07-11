# 方案 B 详细设计：Provider Adapter 边流边发射 tool-call-done

## 一、设计目标

将 `tool-call-done` 事件从 "SSE stream 结束后批量发射" 改为 "SSE streaming 期间，tool 参数 JSON 一旦完整就立即发射"，从而让 tool 执行**更早开始**，减少整体延迟。

---

## 二、现状分析

### 2.1 当前 tool-call-done 发射时机

文件：`packages/onething-runtime/src/agent-loop/providers/openai-compatible.ts`

```typescript
async function* streamOpenAICompatibleResponse(response, turn, providerId) {
  const toolCalls = new Map<number, ToolCallAccumulator>()

  // 阶段一：SSE streaming 期间
  for await (const chunk of readJsonSseData(response, ...)) {
    // 只 yield: tool-call-start, tool-call-delta, text-delta, reasoning-delta
    // 不 yield tool-call-done
  }

  // 阶段二：stream 结束后，批量 yield 所有 tool-call-done
  for (const [, entry] of [...toolCalls.entries()].sort(([a], [b]) => a - b)) {
    yield toolCallDoneEvent(turn, entry)
  }

  // 阶段三：finish
  yield { type: 'finish', turn, finishReason, usage }
}
```

### 2.2 问题

对于典型的 edit tool 场景（5 个 tool call，第一个执行耗时 15s）：

```
时间线（当前）:
  t=0     SSE 开始
  t=0~2s  模型流式输出 5 个 tool 的参数（start + delta 交替进行）
  t=2s    SSE stream 结束
  t=2s    5 个 tool-call-done 批量发射
  t=2s    onToolCallDone(1) → 开始执行 → 阻塞 for-await 循环
  t=2~17s tool 1 执行中（15s），SSE 连接已关闭但 for-await 循环被阻塞
  t=17s   tool 1 完成 → flush → tools 2-5 逐个快速完成
  t=17s   finish

总耗时: ~17s
tool 1 实际开始执行时间: t=2s
tool 1 参数完整时间: t≈0.5s（第一个 tool 的参数最快完成）
```

**浪费的时间**：tool 1 的参数在 ~0.5s 就完整了，但要等到 ~2s（所有 tool 参数输出完毕 + stream 结束）才开始执行。

---

## 三、方案 B 设计

### 3.1 核心改动：在 stream 期间检测 JSON 完整性并立即发射 done

```typescript
async function* streamOpenAICompatibleResponse(response, turn, providerId) {
  const toolCalls = new Map<number, ToolCallAccumulator>()

  // 阶段一：SSE streaming 期间 —— 新增 tool-call-done 即时发射
  for await (const chunk of readJsonSseData(response, ...)) {
    // ... 处理 text, reasoning ...

    if (delta?.tool_calls) {
      for (const toolCallDelta of delta.tool_calls) {
        const index = toolCallDelta.index
        let entry = toolCalls.get(index)
        if (!entry) {
          entry = { id: '', name: '', arguments: '', started: false, done: false }
          toolCalls.set(index, entry)
        }

        // 更新 ID、name、arguments
        if (toolCallDelta.id) entry.id = toolCallDelta.id
        if (toolCallDelta.function?.name) entry.name += toolCallDelta.function.name
        if (toolCallDelta.function?.arguments) entry.arguments += toolCallDelta.function.arguments

        // start 事件（首次出现名字时）
        if (!entry.started && entry.name) {
          entry.started = true
          yield { type: 'tool-call-start', turn, toolCallId: entry.id, toolName: entry.name }
        }

        // delta 事件
        if (toolCallDelta.function?.arguments && entry.name) {
          yield {
            type: 'tool-call-delta', turn,
            toolCallId: entry.id, toolName: entry.name,
            argumentsDelta: toolCallDelta.function.arguments,
          }
        }

        // ★★★ 新增：JSON 完整时立即发射 done ★★★
        if (!entry.done && entry.name && isCompleteAgentToolArguments(entry.arguments)) {
          entry.done = true
          yield toolCallDoneEvent(turn, entry)
        }
      }
    }

    if (choice?.finish_reason) {
      finishReason = mapFinishReason(choice.finish_reason)
    }
  }

  // 阶段二：stream 结束后 —— 只补发未完成的 tool-call-done（兜底）
  for (const [, entry] of [...toolCalls.entries()].sort(([a], [b]) => a - b)) {
    if (!entry.done) {
      yield toolCallDoneEvent(turn, entry)
    }
  }

  // 阶段三：finish
  yield { type: 'finish', turn, finishReason, usage }
}
```

### 3.2 ToolCallAccumulator 结构变更

```typescript
// 当前
interface ToolCallAccumulator {
  id: string
  name: string
  arguments: string
  started: boolean
}

// 变更后
interface ToolCallAccumulator {
  id: string
  name: string
  arguments: string
  started: boolean
  done: boolean     // ★ 新增：标记 tool-call-done 是否已发射
}
```

### 3.3 复用的基础设施

`isCompleteAgentToolArguments` 已存在于 `packages/core/agent-loop/provider-stream.ts`：

```typescript
export function isCompleteAgentToolArguments(raw: string): boolean {
  const trimmed = raw.trim()
  if (!trimmed) return false
  try {
    const parsed = JSON.parse(trimmed)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
  } catch {
    return false
  }
}
```

该函数已被 `agentEventsToProviderStreamChunks` 用于 tool-call-delta 处理中的 `emitToolInputEndOnCompleteJson` 逻辑。方案 B 在 provider adapter 层复用同样的判断。

---

## 四、修改文件清单

### 4.1 openai-compatible.ts（主要修改）

| 位置 | 改动 |
| ------ | ------ |
| `ToolCallAccumulator` 接口 | 新增 `done: boolean` 字段 |
| `streamOpenAICompatibleResponse` 循环内 | 新增 JSON 完整性检查 + tool-call-done 即时发射 |
| `streamOpenAICompatibleResponse` 循环后 | `tool-call-done` 发射加 `if (!entry.done)` 守卫 |
| import | 新增 `isCompleteAgentToolArguments` from `@onething/core/agent-loop` |
| `toolCallDoneEvent` 内 | `entry.done = true` 已在调用前设置 |

**预估改动量**：~25 行

### 4.2 其他 Provider Adapter（详细分析）

#### Claude（Anthropic）—— **已实现，无需修改**

Claude 的 SSE 事件结构有天然的 `content_block_stop` 事件，当前代码已在其中发射 `tool-call-done`：

```typescript
// claude.ts (当前代码，无需改动)
if (event.type === 'content_block_stop') {
    const entry = toolUses.get(event.index ?? -1)
    if (entry?.started) {
        yield toolCallDoneEvent(turn, entry)
        toolUses.delete(event.index ?? -1)
    }
    continue
}
```

每个 tool_use block 是独立的：start → delta(s) → stop → done。**Claude 已经边流边发射 done，不需要改。**

#### Gemini —— **已实现，无需修改**

Gemini 的 `functionCall` 在 SSE chunk 中一次性给出完整对象（name + args），当前代码立即发射 done：

```typescript
// gemini.ts (当前代码，无需改动)
if (part.functionCall?.name) {
    const args = stringifyArgs(part.functionCall.args)
    const entry = { id: ..., name: ..., arguments: args, started: true, done: true }
    yield { type: 'tool-call-start', ... }
    yield { type: 'tool-call-delta', ... }
    yield toolCallDoneEvent(turn, entry)  // ← 已经在 stream 期间发射
}
```

#### DeepSeek —— **无需修改**

复用 `openai-compatible.ts`，方案 B 改动生效后自动获得新行为。

#### Codex / ACP —— **需单独评估**

需确认其流式事件结构。如果也有类似 `content_block_stop` 或一次性完整 tool 对象的事件，大概率已具备边流边发 done 的能力。

| 文件 | 当前状态 | 方案 B 改动 |
| ------ | ---------- | --------- |
| `openai-compatible.ts` | ❌ stream 后批量 done | ✅ ~25 行 |
| `claude.ts` | ✅ 已有 per-block done | 0 行 |
| `gemini.ts` | ✅ 已有 per-call done | 0 行 |
| `deepseek.ts` | 复用 openai-compatible | 0 行 |
| `codex.ts` | ❓ 待确认 | 0 或 ~15 行 |
| `acp.ts` | ❓ 待确认 | 0 或 ~15 行 |

### 4.3 不需要修改的文件

以下文件不受方案 B 影响：

- `packages/core/agent-loop/runner.ts`：`executeProviderTurn` 的 buffering 机制不变
- `packages/core/agent-loop/provider-stream.ts`：已有的 `isCompleteAgentToolArguments` 被复用
- `packages/core/engine/agent-loop-executor.ts`：chunk 处理路径不变
- 主进程任何文件：tool 执行路径不变

---

## 五、时序分析

### 5.1 方案 B 单独实施后的时序

```
时间线（方案 B）:
  t=0       SSE 开始
  t=0~0.5s  模型输出 tool-call-start(1) + delta(1)，args JSON 完整
  t=0.5s    ★ tool-call-done(1) 立即发射 ★
  t=0.5s    onToolCallDone(1) → 开始执行 → 阻塞 for-await 循环
  t=0.5~1.5s  model 继续输出 tool-call-start(2) + delta(2)...
             但这些 event 在 SSE buffer 中等待消费
             onToolCallDone(2) 的 done event 也在 buffer 中
  t=15.5s   tool 1 完成
  t=15.5s   for-await 恢复 → 处理 SSE buffer 中的 events
  t=15.5~16s tools 2-5 的 start/delta/done 快速处理 → 逐个执行 → 完成
  t=16s     finish

总耗时: ~16s（比当前 ~17s 减少 1s）
tool 1 开始执行: t=0.5s（比当前 t=2s 提前 1.5s）
```

### 5.2 问题：tool 1 执行期间 SSE 事件的 "积压"

tool 1 执行时（t=0.5s 到 t=15.5s），`executeProviderTurn` 的 `for await` 循环被 `onToolCallDone(1)` 阻塞。Provider 的 SSE stream 仍在发送数据，但消费端暂停。

**影响分析**：

1. **SSE 事件积压在内存中**：openai-compatible adapter 的 `for await (const chunk of readJsonSseData(...))` 暂停，HTTP response body 的 ReadableStream 积压在 Node.js 内存中。对于典型场景（模型输出几 KB 的 tool call args），积压数据量很小，不构成问题。

2. **tools 2-5 的 start/delta 不可见**：因为 `executeProviderTurn` 的本地缓冲仍然存在（方案 B 没改这里），tools 2-5 的 start/delta 不会进入 EventQueue，UI 看不到它们。

3. **方案 B 单独无法解决 UI 可见性问题**：这正是方案 A 要解决的。

---

## 六、与方案 A 的组合

（本节仅作备选参考。当前决定只采用方案 B，不实施方案 A。）

如果未来需要解决 tools 2-5 的 UI 可见性问题，可在此基础上加方案 A。但需要注意：方案 B 的提前 done 会提前阻塞 for-await，方案 A 必须改为**非阻塞**的 `scheduleExecution`（即 `handleToolInputEvent` 中不 await `onToolCallDone`，改为 fire-and-forget 到后台执行队列），否则两者冲突。详见 `agent-loop-batch-ui-fix-design.md`。

---

## 七、方案 B 详细实施步骤

### Step 1：修改 ToolCallAccumulator

```typescript
// openai-compatible.ts
interface ToolCallAccumulator {
  id: string
  name: string
  arguments: string
  started: boolean
  done: boolean  // 新增
}
```

### Step 2：修改 streamOpenAICompatibleResponse 循环内

```typescript
// 在 arguments delta 处理后新增
if (!entry.done && entry.name && isCompleteAgentToolArguments(entry.arguments)) {
  entry.done = true
  yield toolCallDoneEvent(turn, entry)
}
```

位置：在 `tool-call-delta` yield 之后、`tool-call-delta` 的 `if` 块之内。

### Step 3：修改 stream 结束后的兜底逻辑

```typescript
// 当前：
for (const [, entry] of [...toolCalls.entries()].sort(...)) {
  yield toolCallDoneEvent(turn, entry)
}

// 修改为：
for (const [, entry] of [...toolCalls.entries()].sort(...)) {
  if (!entry.done) {
    yield toolCallDoneEvent(turn, entry)
  }
}
```

### Step 4：添加 import

```typescript
import { isCompleteAgentToolArguments } from '@onething/core/agent-loop'
```

### Step 5：对其他 adapter 做类似改动

| adapter | 关键差异 | 注意事项 |
| --------- | --------- | --------- |
| `claude.ts` | Anthropic 流式返回 content_block_start/delta/stop。tool_use 的 input_json 可能分多个 delta | 在 content_block_delta 中累积 args，在 content_block_stop 或 JSON 完整时发射 done |
| `gemini.ts` | Gemini 用 `functionCall` 而非 `tool_calls`。args 可能是完整 JSON | 需要在 functionCall 首次出现时检查 JSON 完整性 |
| `codex.ts` | Codex 专有协议，需单独研究 | 确认流式事件结构后改动 |

### Step 6：边界情况处理

| 场景 | 处理方式 |
| ------ | --------- |
| JSON 永远不会完整（stream 中断/截断） | 兜底：stream 结束后的 `!entry.done` 守卫仍会发射 done（即使 JSON 不完整，`toolCallDoneEvent` 会保留不完整的 args） |
| 同一个 tool 的 delta 在 done 之后继续到达 | `!entry.done` 守卫 + `entry.done = true` 确保只发射一次 done |
| JSON 完成在 start 之前（args 先于 name 到达） | 守卫条件 `entry.name` 确保 start 已发射后才发射 done |
| empty args（tool 不需要参数） | `isCompleteAgentToolArguments('')` 返回 false，done 在 stream 结束后兜底发射 |
| 多个 tool 在同一 SSE chunk 中同时完成 JSON | `for (const toolCallDelta of delta.tool_calls)` 循环内依次处理，两个 done 都在当前迭代中被 yield，顺序由 SSE chunk 中的 index 决定 |
| tool 需要 permission 确认时抛出异常 | `AgentLoopPauseForConfirmationError` 中断 for-await 循环 → `runAgentLoop` 返回 `pausedForConfirmation`。SSE 连接可能尚未完全消费，HTTP 连接资源由 `AbortController` 或连接超时释放。和当前行为一致，方案 B 未引入新问题 |

### Step 7： Permission 场景专项分析

方案 B 让 tool-call-done 提前到来，因此 tool 执行和 permission 请求也会提前。这对 permission 流程本身无影响，但需要注意：

**场景：tool 1 提前需要确认**

```
t=0s     SSE 开始
t=0.3s   tool-call-start(1)
t=0.5s   tool-call-done(1) → onToolCallDone → execute → enforcePermission → 需要确认
t=0.5s   AgentLoopPauseForConfirmationError 抛出
         → executeProviderTurn 中止
         → runAgentLoop 返回 pausedForConfirmation: true
         → executeAgentLoopStreamLifecycleWithAdapters 捕获
         → 返回 { pausedForConfirmation: true }
         → StreamEngine 保留 AbortController，等待用户响应
         → UI 弹出权限确认对话框

此时 SSE 连接: 可能还有数据在传输（tools 2-5 的 delta），
但 executeProviderTurn 已退出，剩余数据不被消费。
AbortController 未被 abort，HTTP 连接保持 open 直到：
  a) Server 端超时关闭
  b) 用户确认/拒绝后 handleResumeAfterConfirm 创建新连接
```

**和当前行为对比**：当前 batch done 在 stream 结束后才发射，需要确认时 SSE 连接已经正常结束。方案 B 将其提前到 stream 期间，有可能出现"SSE 连接还在、但 agent loop 已暂停"的状态。这不是错误行为，但建议在 resume 时确保旧连接已被清理。

### Step 8：测试要点

1. **单元测试**（`openai-compatible.test.ts`）：
   - 单个 tool call：args 完整后立即发射 done
   - 多个 tool call：按完成顺序依次发射 done
   - args 不完整：done 在 stream 结束后兜底发射
   - 空 args：done 在 stream 结束后兜底发射

2. **集成测试**（`agent-loop-stream-integration.test.ts`）：
   - 验证 tool-call-done 在 stream 期间到达时，tool 执行立即开始
   - 验证多个 tool 的 done 不重复发射
   - 验证 finish 事件仍在 done 之后到达

3. **Edge case 测试**：
   - SSE 连接中断
   - 超长 JSON args
   - interleaved text + tool_use

---

## 八、风险评估

| 风险 | 严重程度 | 缓解措施 |
| ------ | --------- | --------- |
| SSE stream 期间 tool 执行阻塞消费端，SSE 数据积压内存 | 低 | 典型 tool call args 仅几 KB，即使积压也不影响；大文件场景由后续 tool 处理，不经过 SSE。支持 HTTP/2 的 server 会受 flow control 限制暂停发送 |
| tool-call-done 提前导致和 text-delta 的时序错乱 | 低 | OpenAI 规范要求 text content block 在 tool_use block 之前结束，实际不会交织 |
| 不同 adapter 的 JSON 完整判断逻辑不一致 | 低 | 确认仅 OpenAI-compatible adapter 需要改动。Claude 已有 content_block_stop 天然 done 信号，Gemini 已一次性给完整 args |
| permission 确认时 SSE 连接未释放 | 低 | 和当前行为一致。AbortController 在 pause 时保留，由连接超时或 resume 时新连接替代释放 |
| 方案 B 对 UI 可见性无改善 | — | 这是 scope 限制，不是风险。方案 B 的目标是提前开始执行，不预期解决 UI 可见性 |

---

## 九、结论

方案 B 改动集中在 `openai-compatible.ts` 一个文件（~25 行），Claude 和 Gemini 已具备边流边发 done 的能力无需修改。改动通过提前发射 `tool-call-done` 让第一个 tool 的执行在参数 JSON 完整的瞬间就开始，节省了等待 SSE stream 尾部的时间（通常 1~2s）。
