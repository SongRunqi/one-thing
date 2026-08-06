# 历史重建（buildHistoryMessages）

> 存储形状 → 请求形状的唯一翻译层。
> 梳理日期：2026-08-06。代码引用为当时的行号。

---

## 0. 一句话定位

`buildHistoryMessages` 把**存储/UI 形状的会话消息**（`ChatMessage[]`）翻译成
**provider 要的对话数组**（`CoreHistoryMessage[]`）。它是这条转换的唯一入口——
所有 host（Electron / server / CLI daemon）、所有触发路径（发送 / 重试 / 编辑重发 /
权限恢复 / 压缩探测）都走它。

它不是一个"格式化函数"。它同时承担三个责任：

1. **轮次保真** —— 一条 assistant 消息里可能压着整个 run 的十几轮，要拆回原始序列
2. **配对合法性** —— `tool_call` 与 `tool_result` 必须 1:1，orphan 会让 provider 直接 400
3. **载荷预算** —— 重建出的请求体不能比当初的实时请求大一个数量级

---

## 1. 两种形状的落差

这是理解整个模块的前提。

### 存储侧：`ChatMessage`

「一条消息 = UI 上一个气泡」。一条 assistant 消息承载整个 run：

```ts
// packages/core/engine/history.ts:85 CoreHistoryChatMessage
{
  id, role, content,          // content 是合并渲染后的全文
  reasoning,
  isStreaming,
  contentParts: [             // 每个 part 带 turnIndex（第几次 completion）
    { type: 'text',      content: '…', turnIndex: 1 },
    { type: 'reasoning', content: '…', turnIndex: 1 },
    { type: 'provider-data', providerData: {…} },
  ],
  toolCalls: [                // 平铺，不分轮
    { id, toolId, toolName, arguments, status, result, error },
  ],
  steps: [ { toolCallId, turnIndex } ],   // 调用 → 轮次的映射
}
```

### 请求侧：`CoreHistoryMessage`

「一条消息 = 一次 API 交互单元」。`assistant(content + tool_calls)` 后面**必须**
紧跟对应的 `tool(results)`，一轮一对，顺序不能错：

```ts
// packages/core/engine/history.ts:23 CoreHistoryMessage
| { role: 'user',      content }
| { role: 'assistant', content, reasoningContent?, providerData?, toolCalls? }
| { role: 'tool',      content: Array<{ type:'tool-result', toolCallId, toolName, result }> }
```

所以本体是 **1 条 ChatMessage → N 条 API 消息的展开**。

---

## 2. 调用点全集

| # | 位置 | 场景 | 备注 |
|---|------|------|------|
| 1 | `core/engine/core-stream-engine.ts:630` | `handleSendMessage` | 主路径：普通发送 |
| 2 | `core-stream-engine.ts:771` | `handleEditAndResend` | 编辑某条后重发 |
| 3 | `core-stream-engine.ts:850` | `handleRetryMessage` | 重试某条 assistant |
| 4 | `core-stream-engine.ts:942` | `handleResumeAfterConfirm` | 权限确认后恢复（见 §8） |
| 5 | `core-stream-engine.ts:1191` / `:1296` | `maybeCompactBeforeSend` 探测循环 | 只为估 token，产物即弃 |
| 6 | `runtime/agent-loop/stream-runtime.ts:770` | run 内自动压缩后的重建 | 见 §9 已知问题 |

第 5 条值得注意：压缩探测循环最多跑 `configuredKeepTurns`（默认 6）遍，
**每遍都完整重建一次历史**（`:1188` 的 `for (let pass = 1; pass <= configuredKeepTurns; pass++)`），
只为拿 `buildContextUsageSnapshot` 的 token 估值。加上循环外的最终一次，
一个回合最多 7 次全量重建。

---

## 3. 分层与文件地图

```
apps/*                          host
  │
  │ runtime.history.buildMessages(session.messages, session)
  ▼
packages/onething-runtime/src/app/engine/stream/message-helpers.ts:95
  buildHistoryMessages()                            ← onething 包装层（3 道前置加工）
  │   ├─ projectRoomMessagesForModel()    :195      群聊房投影
  │   ├─ collapseSupersededGoalDrives()   :467      goal 续推折叠
  │   └─ prepareUserMessageForModel()     :493      署名 + <context-update>
  ▼
packages/onething-runtime/src/sessions/history-messages.ts:63
  buildOnethingHistoryMessages()                    ← 注入 onething 的 4 个适配器
  ▼
packages/core/engine/history.ts:671
  buildHistoryMessages()                            ← 本体
  │   ├─ appendHistoryMessage()           :553      单条展开
  │   ├─ splitAssistantMessageIntoTurnGroups() :510 轮次重放
  │   ├─ completedHistoryToolCalls()      :464      工具配对过滤
  │   ├─ buildHistoryToolResultContent()  :371      预算（宽）
  │   ├─ buildCompactedToolResultContent():347      预算（紧）
  │   └─ sanitizeToolResultForAI()        :193      载荷瘦身
  ▼
packages/core/engine/message-content.ts:196
  buildMessageContent()                             ← 附件 → 多模态 parts
```

### onething 层注入的 4 个适配器

`sessions/history-messages.ts:68-74`：

| 适配器 | 作用 |
|--------|------|
| `buildMessageContent` | 附件转多模态（`core/engine/message-content.ts:196`） |
| `getAIToolName` | 工具 id → 模型面名字（`core/agent-loop/tool-names.ts:68`） |
| `failureResultForAI` | 失败调用的结果形状 |
| `providerDataFromContentPart` | 加密 reasoning 等 provider 私有载荷的还原 |

---

## 4. 主流程

### 4.1 onething 包装层的 3 道前置加工

`message-helpers.ts:118-123`，顺序不可换：

```ts
buildOnethingHistoryMessages(
  collapseSupersededGoalDrives(
    projectRoomMessagesForModel(messages, session),
  ).map(prepareUserMessageForModel),
  session, { …callbacks },
)
```

**① `projectRoomMessagesForModel`（:195）** — 群聊房投影
`session.kind !== 'room'` 直接原样返回（:232），普通会话零成本穿过。
房会话把整间房塌成**一条 user 消息**（`<ChatRoom><Members>…<History>…`）。
> 这是遗留分支，C2-1 已冻结：W18 之后房回合跑在执行会话里，生产投影走纯层的
> `walkCollabRoomProjection`。今天只有 pre-W18 的旧转录理论上够得着。

**② `collapseSupersededGoalDrives`（:467）** — goal 续推折叠
goal 续推以 user 消息落盘，模板高度重复。只保留最新一条全文，更早的塌成
`(automatic goal continuation — superseded by a later one)`，并清掉其 `contextUpdate`。
角色保持不变（provider 要求 user/assistant 交替）。

**③ `prepareUserMessageForModel`（:493）** — 两件事叠加

- `labelUserMessageForModel`（:497）：`message.origin.actor` 存在时，
  content 前面加 `${speaker} said:\n`。来源是网关（微信/Telegram）的多用户消息。
- `appendContextUpdateForModel`（:515）：把持久化的 `contextUpdate` 字段
  渲染成 `<context-update>` 尾块。
  **每次重建都从存储字段现渲染，字节保证一致** —— 这是变量状态不打穿
  system 前缀的关键（见 §7 不变量 3）。

### 4.2 core 本体的处理

`core/engine/history.ts:671`。第一件事是**分叉**：

```
session.summary && session.summaryUpToMessageId ?
  ├─ anchor 找得到  → 压缩路径（:682）
  └─ anchor 找不到  → onMissingSummaryAnchor 告警，退回全量路径（:740）
非压缩 → 全量路径（:746）
```

两条路径的差异只有三点：起始的两条假消息、遍历范围、工具结果预算档位。

---

## 5. 压缩路径（`:682`）

```ts
result = [
  { role: 'user',      content: `[Conversation History Summary]\n${summary}\n\nPlease continue…` },
  { role: 'assistant', content: 'Understood. I have reviewed the previous conversation context…' },
  ...anchor 之后的消息展开
]
```

造一个**假回合**把摘要塞进去，而不是塞进 system —— 因为 system 段必须字节稳定
（§7 不变量 3）。

`:700` 有一条重要注释，记录了一个被推翻的方案：

> Deliberately NO budget trimming here. A full→degraded→dropped selection was
> tried and removed: degraded mode shrinks assistant messages but not user
> messages, so a fat user message could be dropped while its assistant reply
> survived — consecutive assistant turns that providers misread.

即：**压缩后的尾巴整体发送，不做消息级裁剪**，只保留 per-tool-result 的预算。
理由是消息级裁剪会打破 user/assistant 交替。

---

## 6. 单条消息的展开（`appendHistoryMessage:553`）

### 6.1 过滤三连（`:750-756`，两条路径共用）

```ts
if (message.role !== 'user' && message.role !== 'assistant') continue;  // system/error 是显示态
if (message.isStreaming) continue;                                       // ← 见 §9 P0
if (!hasHistoryMessageContent(message, providerData)) continue;
```

`hasHistoryMessageContent`（`:474`）的判定：`content || providerData.length ||
toolCalls.length || attachments.length` 任一非空。

> ⚠️ 注意它用的是 `message.toolCalls?.length`（**全部**调用），而下游 append 用的是
> `completedHistoryToolCalls`（**终态**调用）。一条只有 pending 调用的 assistant 消息
> 会通过此检查，但展开时 toolCalls 为空 → 产出一条 `content: ''` 的裸 assistant 消息。
> 见 §9 P4。

### 6.2 user 消息（`:565`）

直接 `buildMessageContent(message)`，见 §6.6。

### 6.3 assistant：轮次重放（`:578`）

**优先走重放路径**，条件是 `providerData.length === 0`。

`splitAssistantMessageIntoTurnGroups(:510)` 用两份 turnIndex 数据分组：

- `contentParts[].turnIndex` → text / reasoning
- `steps[].turnIndex`（按 `toolCallId` 建索引）→ tool calls

**三个"不猜"的退出点**，任一命中就返回 `undefined` 退回折叠路径：

| 行 | 条件 | 含义 |
|----|------|------|
| `:528` | 某个 text/reasoning part 没有 `turnIndex` | 老消息（turnIndex 出现之前持久化的） |
| `:541` | 某个 tool call 在 steps 里找不到 turnIndex | 数据不完整 |
| `:548` | `message.content` 非空但所有 group 都没有 text | parts 不权威，message.content 才是 |

分组成功且 `> 1` 组时，按 turnIndex 升序重放：

```
assistant(turn1 texts + turn1 toolCalls)
tool(turn1 results)
assistant(turn2 texts + turn2 toolCalls)
tool(turn2 results)
…
```

`:585` 的预算处理有个细节：**先对整条消息的全部工具结果做一遍预算**，
再按轮分发（`budgetedResults` Map）。这样重放路径与折叠路径的字节语义完全一致——
总预算的消耗顺序不会因为拆分而改变。

代码注释直接点了动机：
> instead of one merged monologue with every tool call batched at the end

**带 `providerData` 的消息强制走折叠路径**（`:578` 的条件）：providerData
（加密 reasoning 等）是消息级的，拆不开。

### 6.4 assistant：折叠路径（`:630`）

一条 assistant（`content` 是合并全文，`toolCalls` 全部堆在尾部）+ 一条 tool。

`reasoningContent` 来自 `getMessageReasoningContent(:441)`：
`message.reasoning` + 所有 `type: 'reasoning'` 的 parts，**去重后**用 `\n\n` 拼接。

### 6.5 工具配对（`completedHistoryToolCalls:464`）

进入 `assistant.toolCalls` 的状态白名单：

```ts
'completed' | 'failed' | 'cancelled' | 'input-streaming'
```

> **更正一个常见误解**：不是只有 `completed`。`input-streaming`（参数还在流式）
> 也在白名单里 —— 它会被重放成"有调用 + 有失败结果"的配对。

被排除的（pending / queued / executing 等非终态）**两侧同时消失**，
所以配对永远 1:1。这条规则是防 orphan `tool_call` 的唯一防线 ——
有调用无结果，provider 直接 400。

结果侧（`buildBudgetedToolResultContent:305`）：

```ts
status === 'completed' ? sanitizeToolResultForAI(toolCall.result)
                       : failureResultForAI(toolCall)   // 默认 { error, status: 'failed' }
```

工具名走 `getAIToolName(toolCall.toolId || toolCall.toolName)`
（`core/agent-loop/tool-names.ts:68`）：非法字符替换 + 去重哈希，
且 alias 表是进程级持久的，同一个工具在整个会话里名字稳定。

> 退役工具名表（`tool-names.ts:48 retiredToolNames`）是**另一张表**，
> 只在 runner 派发 miss 时查（`runner.ts:312`），
> 不进请求的 tools 参数、不进提示词、也不进历史重建。

### 6.6 附件 → 多模态（`message-content.ts:196`）

无 attachments 时直接返回 `message.content` 字符串（快路径）。
有则展开成 parts 数组：

| 类型 | 处理 | 行 |
|------|------|-----|
| image（非 SVG） | `data:` URL → `{type:'image'}` | `:224` |
| SVG | 走文本内联路径（provider 拒绝 SVG 图片载荷） | `:224` 的条件 |
| audio / video | `data:` URL → `{type:'audio'/'video'}` | `:243` / `:251` |
| 文本类 | `tryInlineTextAttachment` 内联，占用总预算 | `:260` |
| 其余二进制 | `{type:'file', data, mediaType, filename, path?}` | `:267` |
| 无 base64Data | web-element pick 的摘录标签，或跳过 | `:213` |

web-element pick（内嵌浏览器拾取）的 provenance + 摘录**单独作为一个 text part
放在图片之前**（`:226` 的注释）：非视觉模型会丢掉图片 part，但保留这段文本，
于是仍能拿到来源 URL 和摘录。

---

## 7. 预算体系

全部常量在 `core/engine/history.ts:9-21` 和 `message-content.ts:84-85`：

| 常量 | 值 | 作用域 |
|------|-----|--------|
| `HISTORY_STRING_HARD_CAP_CHARS` | 64,000 | 任何单个字符串的硬顶，超出加 `…[truncated N chars]` |
| `HISTORY_TOOL_RESULT_BUDGET_CHARS` | 200,000 | 非压缩路径：单个工具结果 |
| `HISTORY_TOOL_RESULTS_TOTAL_BUDGET_CHARS` | 600,000 | 非压缩路径：一条消息内工具结果总和 |
| `COMPACTED_HISTORY_TOOL_RESULT_BUDGET_CHARS` | 24,000 | 压缩路径：单个工具结果 |
| `COMPACTED_HISTORY_TOOL_RESULTS_TOTAL_BUDGET_CHARS` | 80,000 | 压缩路径：总和 |
| `COMPACTED_HISTORY_RETAINED_PAYLOAD_BUDGET_CHARS` | 300,000 | 仅用于日志（不再实际裁剪，见 §5） |
| `ATTACHMENT_INLINE_CONTENT_MAX_CHARS` | 2,000 | 工具结果里附件 content/data 的内联上限 |
| `INLINE_TEXT_ATTACHMENT_MAX_CHARS` | 64,000 | 单个文本附件内联上限 |
| `INLINE_TEXT_ATTACHMENT_TOTAL_CHARS` | 192,000 | 一条消息内文本附件内联总额 |

### 三级降级（`buildBudgetedToolResultContent:305`）

```
sanitizeToolResultForAI(result)                    ① 剥离
  ↓ jsonLength > perResultChars
compactedToolResultPlaceholder(sanitized)          ② 单结果超预算 → 占位（带 preview）
  ↓ 累计 > totalChars
compactedToolResultPlaceholder(sanitized, false)   ③ 总额超预算 → 占位（无 preview）
```

**① 剥离**（`sanitizeToolResultForAI:193`）：

- 丢弃 `originalContent` / `originalContentHash`
- 附件的 `content`/`data` 超 2000 字 → `[Image: image/png data omitted: 123456 chars]`
- 长字符串硬顶截断

`:154` 的注释点明了一条关键设计：这个占位符的**措辞是照抄实时循环**的
（`agentToolMessageContentToText → summarizeMediaData`），
> so a rebuilt history shows the model the exact text it saw during the original turn.

**②③ 占位**（`compactedToolResultPlaceholder:253`）保留：
`{ truncated: true, reason, originalChars, title(≤500), error(≤1000), outputPreview(≤2000) }`。
第三级把 `includePreview` 关掉，只留 title。

---

## 8. resume 特殊路径（权限确认后恢复）

`handleResumeAfterConfirm`（`core-stream-engine.ts:912`）不能用普通重建 ——
它要恢复的是一条**中途暂停**的 assistant 消息。

```
core-stream-engine.ts:941  historyMessages = buildMessages(...)       全量重建
core-stream-engine.ts:942  historyWithoutCurrent = 去掉尾部 assistant  ← 把暂停那条摘出来
core-stream-engine.ts:973  buildResumeAfterToolConfirmation(historyWithoutCurrent, assistantMessage)
  → app/engine/stream/resume-history.ts:11
  → core/engine/history.ts:819
```

`buildResumeHistoryAfterToolConfirmation(:819)` 手工拼接尾部一对：

```ts
[...historyWithoutCurrent,
 { role: 'assistant', content, toolCalls: [终态调用] },
 { role: 'tool',      content: buildHistoryToolResultContent(终态调用) }]
```

过滤用的是 `RESUME_TERMINAL_TOOL_CALL_STATUSES`（`:812`），
和 `completedHistoryToolCalls` 同一个四元组。`:823` 的注释说明了为什么：

> Non-terminal siblings (pending/queued/executing) must not be reported as
> failed `{error: null}` results — drop them from both sides so the pairing
> stays 1:1 and the model never sees fabricated outcomes.

即：一次权限暂停时，同批还有别的调用处于 pending。它们既不能报成功
（没跑过）也不能报失败（会撒谎），只能**两侧一起删掉**。

---

## 9. 不变量（改这块代码前必须先读）

**① tool_call 与 tool_result 永远 1:1。**
任何裁剪、过滤、投影都必须两侧同时做。破坏它 = provider 400。
落点：`completedHistoryToolCalls:464`、`RESUME_TERMINAL_TOOL_CALL_STATUSES:812`、
群聊投影里"丢整条消息而不是丢 toolCalls"（`message-helpers.ts:350`）。

**② 重建的字节必须等于当初实时循环产出的字节。**
这是 `agentToolMessageContentFromHistoryResult`（`core/agent-loop/tool-results.ts:312`）
存在的全部理由，注释自称：
> the single convergence point that keeps rebuilt histories identical to what
> the model saw during the original turn

占位符措辞照抄实时循环（`history.ts:154`）也是同一条约束的落点。

**③ system 段只放常量字节。**
变量值、运行时状态一律走 user 消息尾部的 `<context-update>` 块
（`message-helpers.ts:515`），摘要走假回合（`history.ts:682`）。
理由见 `prompts/builder.ts:137` 的注释：变量进 system 会打穿 prompt cache 前缀。

**④ user/assistant 必须交替。**
消息级裁剪已被证明会破坏它（`history.ts:700` 记录的推翻过程）。

**⑤ 缺数据就退回旧行为，绝不猜。**
`splitAssistantMessageIntoTurnGroups` 的三个退出点是这条的落点。

---

## 10. 生命周期：每回合重建，回合内复用

一个常见误解是「维护一份长驻的 messages[] + systemPrompt + tools[]」。
实际的作用域是**一个 run**（一次用户发送触发的完整工具循环），不是 session：

| 层级 | 是否缓存 |
|------|----------|
| session 级 | **无**。存的只有 `ChatMessage[]`（存储形状） |
| 回合级（一次发送） | **全部重建**：history + prompt + tools + agentProfile |
| run 内（工具轮次） | **复用**：`AgentLoopOptions{messages,tools}`，runner 在数组上 append |

不做 session 级缓存的三条理由：

1. **历史不是 append-only** —— 编辑重发、删除、重试、分支、压缩，任一操作让缓存整体失效
2. **请求形状是投影不是存储** —— 同一条 tool result，非压缩路径按 200K 裁、
   压缩路径按 24K + 80K 总额裁。同一份存储、不同回合投影出不同字节
3. **多 host 共用同一份 store**（electron / server / cli daemon），进程内缓存会分叉

代价（未计量）：

- 每回合 O(n) 全量遍历 + 对每个 tool result 递归 sanitize + 全量 JSON 序列化
- `buildPrompt` 每回合同步磁盘 IO：`prompts/builder.ts:370-395` 的
  `loadAgentsMdInstructions` 从项目根到工作目录逐级
  `existsSync + statSync + readFileSync`，**无缓存**
- 压缩探测循环最多把上面这些再乘 7（§2 第 5 条）

---

## 11. 已知问题

### P0 — 自动压缩会静默吞掉本 run 中间轮的工具上下文

三段代码单看都合理，凑一起漏了：

- `history.ts:753` `if (message.isStreaming) continue` ——
  本 run 的 assistant 消息全程 `isStreaming: true`，
  **从 store 重建的历史里本 run 一条都没有**
- `stream-runtime.ts:764 rebuildAgentMessagesFromSession` =
  重建历史 + `getAgentLoopTransientTail(messages)` 补尾巴
- `core/engine/agent-loop-runtime.ts:1224 getAgentLoopTransientTail`
  只从**最后一个**带 toolCalls 的 assistant 起切片

场景：run 内跑了 `A1(tools)→T1→A2(tools)→T2→A3(tools)→T3`，
第 4 轮 `beforeTurn` 触发自动压缩 → 重建结果 = `压缩历史 + [A3, T3]`。
**A1/T1/A2/T2 消失**，且不在 summary 里 ——
`context-compact.ts:201 selectCompactPlan` 只摘要 `keepRecentTurns`（默认 6）
个用户回合之前的老消息，当前 run 必定落在保留区。

设计意图是「丢流式尾巴、用 tail 补回，避免 orphan tool_result」——
orphan 防住了，代价是只补最后一组。

触发条件：单 run ≥2 轮工具 + 中途压缩。而压缩正是被工具结果撑爆才触发的，
两个条件强正相关。症状：模型突然只记得自己做的最后一件事。

**修的方向**：tail 的锚点应是「本 run 的起点」而非「最后一个工具轮」。

### P1 — maxTurns 边界上，追加消息被落盘但永不发送

`runner.ts:731` afterTurn → `agent-loop-runtime.ts:1427 drainFollowUpMessages`
（drain 即清空）→ `persistInjectedChatMessage` 落盘并 emit `message:user-created`
→ 返回 replacement → `runner.ts:750 continue` → `turn++` →
若刚才正是 `turn === maxTurns`，for 循环直接退出。

用户追发的消息已出现在 UI、已写进会话，但请求从未发出。
goal continuation 同理（`beginContinuation` 已记账）。

触发窗口窄（maxTurns 默认 100，`agents/profile.ts:117`），但发生时静默无错。

### P2 — eval 快照里 request 和 response 不是同一轮

`app/engine/stream/agent-loop-executor.ts:216` 的 `rawRequest` 取
`prepared.runtime.messages` = **第 1 轮**的数组
（`runner.ts:486` 拷了新数组，后续 push 不回写）；
同一对象的 `rawResponse` 取整个 run 累积的内容。工具轮次越多越配不上。

逐轮真相在 `onTurnTrace`（`stream-runtime.ts:946`）和
`~/.onething/log/provider-requests/`（`app/providers/request-dump.ts`）。

### P3 — 循环内注入的两条 user 消息从不落盘

`runner.ts:553 FINAL_TURN_NOTICE`、`:727 NO_VALID_TOOL_CALL_NUDGE`
直接 push 进内存数组。下一回合重建时它们不存在，
转录里就出现「模型凭空写了段收尾总结」「凭空重发一次工具调用」。
它们也会在 P0 那次重建里一起蒸发。

### P4 — `hasHistoryMessageContent` 与 `completedHistoryToolCalls` 口径不一致

前者（`:474`）用**全部** toolCalls 判定"有内容"，后者（`:464`）只取终态。
一条只有 pending 调用的 assistant 消息因此会通过过滤、
但展开成一条 `content: ''` 的裸 assistant 消息进请求。

### P5 — 压缩探测的重复重建

`core-stream-engine.ts:1188` 的 `for (pass = 1; pass <= configuredKeepTurns; pass++)`
每遍都完整重建一次历史，只为估 token。默认 6 遍 + 最终 1 遍。
长会话下这是纯浪费。

---

## 12. 相关文档

- `docs/design/session-storage-jsonl.md` — 存储侧形状与 JSONL 驱动
- `docs/design/prompt-content-separation.md` — system prompt 组装
- `docs/design/collab-chatroom-payload.md` — 群聊房投影载荷
- `docs/design/prompt-evaluation.md` — L1 逐轮追踪与 trace
- `CLAUDE.md` — 三层架构与 `createOnethingBackend` 装配
