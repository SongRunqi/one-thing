# Tool Call & Permission System Architecture Plan

## 背景

当前工具系统暴露出的问题不只是单个 `edit` / `read` 的 bug，而是 tool call、权限、调度、状态同步之间缺少统一架构。

用户真实遇到过的痛点包括：

1. **连续 tool call 执行顺序不可靠**
   - AI 先调用 `edit`。
   - `edit` 请求权限并等待用户确认。
   - 流式输出仍继续，后续 `read` 等工具已经执行。
   - 这会导致后续工具越过前面 pending 的修改操作，读到旧状态或产生不一致行为。

2. **权限体验不符合预期**
   - 当前系统里很多操作都会请求权限，使用起来很打断。
   - 用户希望 read-only 工具默认不问。
   - 用户希望有类似 Claude Code 的 Auto Accept Edits 模式。
   - 用户也希望有类似 Codex / Claude Code 的 Dangerously Allow All 模式。

3. **持久授权/always allow 会带来不可控问题**
   - 用户曾经为了减少打断点击 always allow。
   - 后续发现工具行为异常时，想收回权限却不方便。
   - 因此不希望设计复杂的 permission center / scope / 持久授权系统。

4. **edit 工具可靠性需要重新审视**
   - 用户曾遇到过一次 edit 实际只想改十几行，却覆盖/修改了 1000 多行。
   - 这说明文件修改系统不能只靠权限控制，还需要更可靠的修改机制、dry-run、可验证 apply、可回滚能力。

本计划目标是设计一个架构优秀、状态清晰、权限可控、体验顺滑的 tool call permission system。

## 当前实现状态

已落地：

- ToolExecutionScheduler：barrier 工具会阻塞其后的工具执行。
- ToolOrchestrator 初版：tool-loop 通过 Orchestrator 调度工具，reject barrier 后丢弃后续 queued tools。
- Session-level Permission Mode：Normal / Auto Accept Edits / Dangerously Allow All。
- InputBox 模式切换：点击按钮或 `Shift+Tab` 切换当前 session 的 permission mode。
- 集中权限 UI：pending permission 显示在 InputBox 上方的 Session Permission Panel。
- 前端主路径移除了 allow session / allow workdir / always allow。
- Edit tool 已迁移为 Pi 风格多 replacement 参数：`{ path, edits: [{ oldText, newText }] }`。
- Edit engine 已支持 exact unique matching、overlap 检测、preview/apply 共用逻辑、BOM 和 line ending 保留、permission 后 revalidation。
- File mutation queue 已接入 edit/write，同一文件的 read-preview-permission-write plan 会串行执行，不同文件可并行。
- Bash classifier 已抽出第一阶段轻量实现：逐段分类组合命令，支持 allow/ask/deny 聚合与 pattern 生成。
- PermissionPolicy 已接管 read/edit/write/bash/MCP 的 allow / ask / deny 决策；具体工具内部不再直接调用 Permission.ask。
- write 已接入 file mutation queue / revalidation，并已迁移到 Pi 风格 schema：`{ path, content }`；旧 path alias 已移除。

仍待完成：

- undo/audit snapshot 的后端记录、apply-undo、rollback IPC 与 diff card rollback action 已完成第一阶段。
- structured bash policy 已有轻量 classifier 第一阶段；bash executor 已接入 Pi 风格的 bounded output accumulator、full-output temp file、throttled metadata update、process-tree kill。tree-sitter-bash 仍待实现。
- File mutation audit snapshot 已接入 edit/write：成功修改后记录 before/after content、hash、diff、metadata；后端 apply-undo 已支持按 after-hash revalidation 恢复/删除文件；rollbackFile({ auditPath }) IPC 已可用；完成态 edit/write diff card 已有 rollback action。
- Sensitive file read policy 第一阶段已接入 read：`.env`、私钥/证书等需要 permission，`.env.example` / `.env.sample` 等模板允许。
- Doom loop detection 第一阶段已接入 Orchestrator：同一 turn 中第 4 次重复 `toolName + normalized args` 会直接返回 diagnostic failure，避免无限重复执行。
- 旧 directory-permissions backend fallback 已移除；Permission.ask 仅作为 PermissionPolicy 的事件等待/响应机制。

---

## 总体目标

新的系统需要同时解决两类问题：

1. **Tool Call Orchestration**
   - 管理工具调用生命周期。
   - 保证连续工具调用不会越过 pending 的前置工具执行。
   - 让后端成为工具状态的唯一真实来源。

2. **Permission Mode System**
   - 用简单明确的模式切换取代复杂授权管理。
   - 不设计 permission center。
   - 不设计 permission scope。
   - 不保留 always allow / workspace allow 这类长期授权心智。

---

## 非目标

明确不做：

1. **不做 Permission Center**
   - 不维护复杂的授权列表。
   - 不要求用户管理一堆目录、命令、pattern 的 allow/revoke。

2. **不做 Permission Scope**
   - 不设计 once / session / workspace / always 等 scope。
   - 用户想减少打断时，通过模式切换解决，而不是发长期授权。

3. **不让前端猜工具状态**
   - 前端不再自己把工具标记成 awaiting-confirmation。
   - 所有状态由 main process 产生事件驱动。

4. **不让工具内部隐式卡住权限状态**
   - 当前 `Permission.ask()` 藏在工具内部，外层只看到 Promise 卡住。
   - 新系统里权限状态应由 Orchestrator 管理。

---

## 权限模式设计

权限系统只保留模式，不保留长期授权 scope。

```ts
type PermissionMode =
  | 'normal'
  | 'auto-accept-edits'
  | 'dangerously-allow-all'
```

Permission Mode 是 **session-level runtime state**：

- 每个 session 可以有自己的当前模式。
- 可以有全局默认模式，但切换模式不产生任何长期授权记录。
- 它不是 permission scope；不会产生 once/session/workspace/always grant。
- UI 入口应该放在 InputBox 附近，而不是 Settings 里作为主要入口。
- 快捷键：`Shift+Tab` 在当前 session 的 Permission Mode 之间循环切换。

### 1. Normal Mode

默认安全模式。

行为：

```text
read / grep / glob / list     自动执行
edit / write                  每次 ask
bash                          read-only bash 自动；其他 bash ask
mcp                           每次 ask
外部目录写入                  ask
```

核心原则：

- read-only 不打断。
- 修改类操作都询问。
- 没有 always allow。
- 没有 workspace allow。

### 2. Auto Accept Edits Mode

类似 Claude Code 的 auto accept edits。

行为：

```text
read-only                     自动执行
edit / write                  自动执行
bash                          read-only bash 自动；其他 bash ask
mcp                           ask
外部目录访问/写入             ask，具体规则后续确认
```

核心原则：

- 适用于“我正在让 AI 改代码，不想每个 edit/write 都点确认”。
- `write` 在这个模式下也应自动执行；否则用户离开屏幕后很容易卡在创建/覆盖文件确认上，Auto Accept Edits 的体验意义会大幅降低。
- `write` 的可靠性风险应通过 reliable write/edit engine、preview、revalidation、undo/audit 解决，而不是在 Auto Accept Edits 下频繁阻塞。
- 用户想停掉时，直接切回 Normal。
- 不产生持久授权，因此不存在“收不回 always allow”的问题。

### 3. Dangerously Allow All Mode

类似 Codex / Claude Code 的 YOLO 模式。

行为：

```text
read / edit / write / bash / mcp  默认自动执行
```

核心原则：

- 这是一个明确的当前 session 执行模式。
- UI 必须明显提示当前处于危险模式。
- 是否保留极少数 hard block 需要后续讨论，例如 `rm -rf /`、格式化磁盘等。

---

## Tool Call 状态机

后端统一管理工具状态。

建议状态：

```ts
type ToolCallStatus =
  | 'input-streaming'
  | 'queued'
  | 'awaiting-permission'
  | 'running'
  | 'completed'
  | 'failed'
  | 'rejected'
  | 'cancelled'
```

状态含义：

```text
input-streaming       模型仍在流式输出工具参数
queued                工具已完整发现，等待调度器执行
awaiting-permission   工具需要用户确认
running               工具正在执行
completed             工具成功完成
failed                工具执行失败
rejected              用户拒绝权限
cancelled             session / stream abort 导致取消
```

合法流转示意：

```text
input-streaming
  → queued
  → awaiting-permission
  → running
  → completed / failed

input-streaming
  → queued
  → running
  → completed / failed

awaiting-permission
  → rejected

queued / awaiting-permission / running
  → cancelled
```

---

## Streaming Tool Input

当前 tool call 参数是流式产生的，例如模型调用 edit 时，`path`、`oldText`、`newText` / `edits` 可能是一段一段 delta 输出。

新系统必须把 **tool input streaming** 和 **tool execution** 明确分开。

### 阶段划分

```text
tool-input-start
  → input-streaming
  → tool-input-delta...
  → tool-input-end
  → args-parse / validate
  → preview / analyze
  → queued / awaiting-permission / running
```

核心规则：

1. tool 参数没完整之前，绝不执行工具。
2. tool 参数没完整之前，不进入 permission ask。
3. permission panel 只能展示完整、解析成功、preview 完成后的 tool。
4. 流式参数期间，UI 只显示“正在准备工具调用 / preparing edit”，不要展示半截 diff。
5. `tool-input-delta` 只更新临时 buffer，不应该每个 delta 都触发昂贵的持久化和完整 UI 重渲染。

### Args Buffer

Orchestrator 应维护 session/message/toolCall 级别的 args buffer：

```ts
interface ToolInputBuffer {
  toolCallId: string
  toolName: string
  rawText: string
  status: 'streaming' | 'complete' | 'parse-error'
}
```

当 `tool-input-end` 到达后：

```text
rawText → parse JSON → normalize args → validate schema → analyze/preview
```

如果 parse / validate 失败：

```text
toolCall.status = failed
返回 tool result 给模型，让模型重新生成工具调用
```

### UI 行为

流式参数期间：

```text
Preparing edit: src/foo.ts...   // 如果已经能从 partial args 中安全提取 path
```

参数完整并 preview 完成后：

```text
Edit file: src/foo.ts
[diff preview]
Approve / Reject / Reject with instruction
```

对于 edit/write 这类参数可能很大的工具，UI 不应该主要展示 raw JSON 参数，而应该展示语义化 preview：

```text
file path
summary
diff / patch
first changed line
queued/running status
```

---

## Tool Orchestrator

新增一个 Tool Orchestrator 作为工具系统唯一 owner。

职责：

1. 接收从 provider stream 发现的 tool call。
2. 创建/更新工具状态。
3. 把工具交给 scheduler。
4. 根据 permission mode 决定是否 ask。
5. 执行工具。
6. 广播状态变化。
7. 处理 abort / reject / completion。

概念接口：

```ts
class ToolOrchestrator {
  onToolInputStart(...): void
  onToolInputDelta(...): void
  onToolInputEnd(...): Promise<void>
  onToolDiscovered(call: ToolCallInput): Promise<void>

  respondPermission(requestId: string, decision: 'approve' | 'reject'): Promise<void>
  abortSession(sessionId: string): Promise<void>
}
```

`tool-loop.ts` 不应再直接执行工具，而是：

```ts
orchestrator.onToolDiscovered(toolCall)
```

---

## Tool Scheduler

Scheduler 负责连续 tool call 的执行顺序。

核心规则：

```text
1. 工具按照模型输出顺序进入队列。
2. 工具可以被流式发现，但不能绕过 scheduler 执行。
3. read-only 工具可以并发，但不能越过前面的 pending barrier。
4. edit / write / bash / mcp 暂时按 barrier 处理。
5. awaiting-permission 的 barrier 会阻塞后续工具。
6. 被 reject 的工具会产生 tool result，之后由模型决定如何继续。
7. 如果被 reject 的是 barrier tool，默认取消当前 turn 中它后面的 queued tools，避免后续工具基于一个未发生的修改继续执行。
```

用户遇到的问题应变成：

```text
AI 输出 edit
→ edit queued
→ edit awaiting-permission
→ AI 后续输出 read
→ read queued，但不执行
→ 用户批准 edit
→ edit running → completed
→ read running → completed
```

也就是说：后续 tool call 可以进入队列，但不能越过前面 pending 的 barrier 执行。

---

## Tool Effect Analyzer

工具执行前需要分析其行为类型。

初始版本可以保守设计：

```ts
type ToolEffectKind = 'read' | 'write' | 'execute' | 'opaque'

interface ToolEffect {
  kind: ToolEffectKind
  resources: string[]
  barrier: boolean
}
```

初始规则：

```text
read       read(file)       barrier: false
grep       read(dir)        barrier: false
glob       read(dir)        barrier: false
edit       write(file)      barrier: true
write      write(file)      barrier: true
bash       execute/opaque   barrier: true
mcp:*      opaque           barrier: true
```

后续可优化：

- safe bash 是否允许自动执行。
- 同文件资源锁。
- 多文件 patch 的资源集合。
- MCP 是否按工具声明细分。

---

## Tool Definition Interface

为了让权限不再散落在每个 tool 内部，新工具接口应拆成 analyze / preview / execute 三阶段。

概念接口：

```ts
interface ToolDefinition {
  analyze(args, ctx): Promise<ToolEffect>
  preview?(args, ctx): Promise<ToolPreview>
  execute(args, ctx): Promise<ToolResult>
}
```

语义：

```text
analyze  决定工具 effect、resources、barrier、是否需要 permission policy 处理
preview  生成 permission panel 可展示的 diff / command / args / patch
execute  真正执行工具；不应再自己弹 permission ask
```

例如 edit：

```text
analyze  → write(file), barrier true
preview  → diff / patch
execute  → revalidate 后写文件
```

---

## Permission Policy Engine

Permission Policy Engine 根据当前 mode 和 tool effect 决策。

决策结果：

```ts
type PermissionDecision =
  | { action: 'allow' }
  | { action: 'ask'; reason: string }
  | { action: 'deny'; reason: string }
```

示意规则：

```text
Normal:
  read-only        allow
  edit/write       ask
  read-only bash   allow
  other bash/mcp   ask

Auto Accept Edits:
  read-only        allow
  edit/write       allow
  read-only bash   allow
  other bash/mcp   ask

Dangerously Allow All:
  everything       allow
```

### Bash policy

去掉 allow once/session/workspace 后，bash 不再通过“记住某个命令 pattern”减少打断。

初始策略：

```text
read-only bash      自动执行
其他 bash           Normal / Auto Accept Edits 下 ask
所有 bash           Dangerously Allow All 下自动执行
```

这意味着：

- 普通安全使用时，修改性或执行性 bash 仍然需要确认。
- 如果用户希望离开屏幕后不被 bash 卡住，应显式切换到 Dangerously Allow All。
- 后续可以讨论是否把一部分 project-local dev commands（如 test/build）归为可自动执行，但这应是 command classifier 的规则，不是用户长期授权 scope。

注意：

- 这里不产生持久授权。
- 用户批准一次权限后，只释放当前 pending tool call。
- 不提供 allow session / allow workspace / always allow。

---

## Permission UI / Session Permission Panel

权限确认不应该散落在每一个 tool card 里面。

新的交互应该是 **session 级别的统一 permission panel**，位置建议在 InputBox 上方，或者作为输入区附近的全局 pending tool panel。

它不是 Permission Center：

- 不管理历史授权。
- 不展示长期 allow list。
- 不做 revoke 管理。

它只是当前 session / 当前 response 中 pending tool calls 的统一处理区。

### 模式切换

模式切换是当前 session 的运行时状态，主入口放在 InputBox 附近：

```text
Mode: Normal ▼
```

选项：

```text
Normal
Auto Accept Edits
Dangerously Allow All
```

快捷键：

```text
Shift+Tab  循环切换当前 session 的 Permission Mode
```

Settings 可以保留全局默认值，但不应作为日常切换的主要入口。

### Pending Tool Permission Panel

当有工具需要确认时，在统一 panel 中显示：

```text
AI wants to run 1 tool

Edit file: src/main/foo.ts
[diff preview / command preview / mcp args preview]

Approve   Reject
```

如果有多个 pending tool，可以显示队列：

```text
Pending tools
1. Edit file: foo.ts        awaiting approval
2. Read file: bar.ts        queued behind edit
3. Bash: npm test           queued
```

用户在这里统一处理，而不是到每个 tool card 里找按钮。

### Reject with Instruction / Ask AI to Rewrite

除了单纯 Reject，还需要支持“带反馈拒绝”：

```text
Reject and tell AI...
[ 输入框：不要这样改，请用更小的 patch / 先解释计划 / 重新生成方案 ]
```

语义：

```text
用户拒绝当前 tool call
→ 当前 tool result 记录 rejected + user instruction
→ tool loop 把 rejection result 返回给模型
→ 模型根据用户反馈重新规划 / 重新生成工具调用
```

这比单纯 deny 更有用，因为用户很多时候不是要终止任务，而是要 AI 换一种做法。

### 按钮集合

基础按钮：

```text
Approve
Reject
Reject with instruction
```

对于 barrier tool，Reject 默认还会取消当前 turn 中排在它后面的 queued tools，并把 rejection result 返回给模型重新规划。

不显示：

```text
Allow once
Allow session
Allow workspace
Always allow
```

因为系统不再设计 permission scope。

---

## 后端是唯一真实状态源

当前前端会在收到 permission request 后自己修改：

```ts
toolCall.requiresConfirmation = true
step.status = 'awaiting-confirmation'
```

新系统要避免这种状态分裂。

期望方式：

```text
main process 更新 tool call status
→ EventBus 发 tool-call updated / step updated
→ renderer 只渲染状态
```

前端只负责：

```text
用户点击 approve / reject
→ emit command
```

不负责推断工具状态。

---

## Edit / Write 可靠性方向

这是单独但相关的重要问题。

用户曾遇到 edit 意外覆盖大量代码，因此文件修改系统需要重新设计。

### 参考方向：Pi Coding Agent 的 edit tool

用户明确希望参考 Pi 的 edit tool 实现：

```text
/Users/yitiansong/data/code/pi-mono/packages/coding-agent/src/core/tools/edit.ts
/Users/yitiansong/data/code/pi-mono/packages/coding-agent/src/core/tools/edit-diff.ts
/Users/yitiansong/data/code/pi-mono/packages/coding-agent/src/core/tools/write.ts
/Users/yitiansong/data/code/pi-mono/packages/coding-agent/src/core/tools/file-mutation-queue.ts
```

目标不是 1:1 复制，而是吸收它在可靠性上的设计。

Pi edit tool 中值得借鉴的点：

1. **多 edit 一次调用**
   - `edits: [{ oldText, newText }]`。
   - 支持一个文件内多个 disjoint replacements。
   - 每个 `oldText` 都匹配原始文件，而不是前一个 edit 应用后的中间文件。

2. **严格唯一匹配**
   - `oldText` 必须存在。
   - `oldText` 必须唯一。
   - 多个 edit 不能 overlap。
   - `oldText` 不能为空。
   - replacement 后如果没有实际变化，要报错。

3. **预览和执行共享同一套 diff/apply 逻辑**
   - preview 使用 `computeEditsDiff`。
   - execute 使用同一套 `applyEditsToNormalizedContent`。
   - 避免“预览看起来可以，真正执行走另一套逻辑”的不一致。

4. **换行和 BOM 处理**
   - strip BOM。
   - 统一 normalize 到 LF 做匹配。
   - 写回时恢复原文件 line ending。

5. **文件级 mutation queue**
   - 同一文件的 mutation 串行。
   - 不同文件可以并行。
   - abort 时不提前释放 queue，避免 in-flight FS operation 仍在完成。

6. **diff details**
   - 返回 display diff。
   - 返回 unified patch。
   - 返回 first changed line，方便 UI 跳转。

7. **prompt 约束清晰**
   - 要求 precise edit。
   - oldText 精确匹配。
   - 不要用大段 unchanged context 连接远距离修改。
   - 多处修改放到一个 edit call 的多个 edits 里。

8. **write 工具保持简单可靠**
   - Pi write 只负责创建或完整覆盖文件。
   - schema 是 `path` + `content`。
   - 自动创建父目录。
   - 通过 file mutation queue 串行化同一文件写入。
   - 不把局部修改塞进 write；局部修改交给 edit。

当前 `edit` / `write` 已采用这套核心形态，file mutation queue 也已落地；undo/audit 仍需要继续补齐。

### 当前方向记录

1. **edit 必须可 dry-run** ✅ 已完成核心实现
   - 在真正写文件之前生成准确 diff。
   - preview 和 execute 共享同一套 patch/apply 逻辑。
   - permission approval 后、execute 前会 revalidate；如果文件内容已变化，会重新生成 preview 并按需重新进入 permission flow，或失败让 AI 重新 read。
   - apply 前通过 original content hash 验证。

2. **edit 应支持多 replacement** ✅ 已完成核心实现
   - 一个工具调用可以修改同一文件多个不重叠区域。
   - 每个 edit 都以原始文件为匹配基准。
   - overlap / duplicate / not found 直接失败。
   - 暴露给模型的参数已改为：`path` + `edits: [{ oldText, newText }]`。
   - 不再支持通过 edit 创建/整文件替换；此类操作交给 write。

3. **write 应参考 Pi 的简单可靠设计** ✅ 已完成核心实现
   - 当前 write 已迁移为 `{ path, content }`，与 edit API 风格统一。
   - write 的职责保持单一：创建文件或完整覆盖文件。
   - 自动创建父目录。
   - write 也应进入与 edit 共享的 mutation queue / revalidation / audit 流程。
   - 对已有文件 overwrite 应继续提供 diff preview 和 permission metadata。
   - 对新文件 create 应记录 undo snapshot，以便删除回滚。

4. **同一文件 mutation 必须串行** ✅ 已完成核心实现
   - 已引入文件级 mutation queue。
   - edit/write 的 read-preview-permission-write plan 已按目标文件串行。
   - 不同文件仍可并行。
   - 后续需要继续完善 abort/audit 语义，但 queue 不会在 operation settle 前释放。

5. **修改必须可回滚** 🟡 后端核心能力第一阶段已完成
   - 每次 edit/write 成功后记录 undo/audit snapshot。
   - 已记录 before hash / after hash / diff / original content / after content / metadata。
   - apply-undo 已支持在当前文件仍匹配 after-hash 时恢复原内容；create 的 undo 会删除文件。
   - rollback IPC 已支持 `rollbackFile({ auditPath })`。
   - 完成态 edit/write diff card 在有 audit metadata 时显示 rollback action。
   - 后续可继续完善 rollback 成功后的事件刷新、toast 和历史状态标记。

6. **大改本身不等于错误**
   - 如果用户要求大规模重构，改 1000 行是合理的。
   - 系统不应单纯因为 diff 大就认为无效。
   - 真正要防的是工具实现 bug 导致的非预期修改。

7. **edit 风险分类不是核心防线**
   - 大删除不再作为 hard block。
   - 当前实现只把明显大删除标记为 `file_destructive_edit` 进入权限模式判断。
   - 核心防线是 patch engine 的机械可靠性：exact match、唯一匹配、overlap 检测、revalidation。

8. **fuzzy matching 暂不保留** ✅ 当前决策
   - 当前实现采用 exact matching。
   - 如果 edit 失败，应 read 最新文件后重新生成精确 edit。
   - 未来如果需要 fuzzy，也应只作为 suggestion / repair 辅助，不能让 preview 和 execute 走不同路径。

---

## 参考方向：OpenCode Permission System

用户提供了 OpenCode 权限系统整理文档：

```text
/Users/yitiansong/data/code/opencode/packages/docs/permission-system.md
/Users/yitiansong/data/code/opencode/packages/docs/permission-system-code-map.md
```

OpenCode 的设计对我们有参考价值，但不应完整照搬。

### OpenCode 值得借鉴的点

1. **权限决策值简单**
   - OpenCode 核心权限值是：`ask | allow | deny`。
   - 这一点和我们的 Permission Policy Engine 很契合。

2. **工具暴露过滤 + 执行前检查两道防线**
   - OpenCode 会根据权限决定哪些工具暴露给模型。
   - 工具执行前仍会再次检查。
   - 我们也可以保留这个思路：
     - 如果某类工具在当前模式下永远不可用，可以不暴露给模型。
     - 但即使暴露了，执行仍必须经过 Orchestrator / Policy。

3. **bash 解析值得参考**
   - OpenCode 用 tree-sitter 解析 shell 命令，而不是只看整条字符串。
   - 对管道、组合命令里的每个 command 节点分别检查。
   - 这对我们的 read-only bash classifier 很有价值。
   - 当前已先落地轻量 parser 第一阶段，接口保留后续替换 tree-sitter-bash 的空间。

4. **external_directory 是独立保护项**
   - OpenCode 把工作目录外访问作为独立权限类型。
   - read / write / edit / bash 文件操作都会触发 external directory 检查。
   - 我们也应该把 external directory 作为 ToolEffect / Policy 的一部分，而不是散落在各工具内部。

5. **敏感文件保护**
   - OpenCode read 默认阻止 `.env` 等敏感文件，但允许 `.env.example` / `.env.sample`。
   - 这可以纳入我们的 read tool policy / safety rule。

6. **doom loop 检查**
   - OpenCode 在 session processor 层检查最近多次相同 tool call 参数，防止模型循环调用同一工具。
   - 我们可以把 doom loop 放到 Orchestrator / Scheduler 层，而不是具体工具里。
   - 当前第一阶段已在 Orchestrator 内按当前 turn 检测重复 `toolName + normalized args`，第 4 次重复会失败并返回 diagnostic error。

7. **Permission pending 状态事件化**
   - OpenCode 有 pending permission 请求和 permission updated/replied 事件。
   - 我们也需要 pending tool permission 事件，但 UI 形态会是 session permission panel。

8. **RejectedError / rejected metadata**
   - OpenCode 会把 rejected permission 的 metadata 写回 tool part。
   - 我们也应把 reject reason / user instruction 作为 tool result 返回给模型，支持重新规划。

### 不照搬 OpenCode 的点

1. **不照搬 always**
   - OpenCode 支持 `once | always | reject`。
   - 我们已经明确不做 allow once/session/workspace/always。
   - 用户要减少打断，通过切换 Permission Mode，而不是创建授权记录。

2. **不把 ask 放在每个 tool.execute 内部**
   - OpenCode 的敏感工具在 execute 内部调用 `Permission.ask()`。
   - 我们的目标是把权限统一放到 Orchestrator / Permission Policy Engine。
   - Tool 本身只提供 analyze / preview / execute。

3. **不以配置规则作为主要用户交互模型**
   - OpenCode 支持 config / agent permission override / env permission。
   - 我们桌面端优先做 session-level mode，降低用户心智负担。
   - 未来可以有高级配置，但不能破坏默认的简单模型。

4. **不做复杂 bash allow pattern 记忆**
   - OpenCode always 会记住类似 `git status *` 的 session pattern。
   - 我们暂时不做这种 session approved pattern。
   - bash 的自动执行应来自 classifier，而不是用户审批后的 pattern 记忆。

### 对我们架构的具体启发

需要补入后续实现设计：

1. ToolEffect 应包含 external directory 信息：

```ts
interface ToolEffect {
  kind: ToolEffectKind
  resources: string[]
  barrier: boolean
  external?: boolean
  sensitive?: boolean
}
```

2. bash analyze 阶段应做结构化解析：

```text
command string
→ parse shell AST
→ extract command nodes
→ classify each command
→ aggregate effect / permission requirement
```

3. Orchestrator / Scheduler 应加入 doom loop detection：

```text
如果最近 N 次相同 toolName + normalized args 重复出现
→ ask / deny / return diagnostic tool result
```

4. Tool exposure filtering 可以作为优化层：

```text
当前 session mode / agent config 如果明确 deny 某工具
→ 不暴露给模型
```

但执行前 Orchestrator 仍是最终防线。

---

## 与现有系统的主要冲突点

当前实现里存在这些需要迁移的点：

1. `tool-loop.ts` 在发现工具后直接启动执行 job。
2. 多个工具 job 会并发执行。
3. `Permission.ask()` 藏在工具内部，外层不知道工具已进入 awaiting-permission。
4. 前端收到 `permission:request` 后会自己补 UI 状态。
5. 旧的 `requiresConfirmation` / `resumeAfterToolConfirm` / legacy execute flow 仍然存在。
6. directory/workspace always allow 逻辑会带来长期授权和撤销问题。

---

## 分阶段迁移计划

### Phase 1: 引入 Tool Orchestrator 壳

目标：先不大改工具实现，把直接执行工具的逻辑从 `tool-loop.ts` 移入 Orchestrator。

- `tool-loop.ts` 只负责发现 tool call。
- Orchestrator 负责创建状态、调度、执行。
- 保持现有工具接口尽量可用。

### Phase 2: 引入 Scheduler / Barrier

目标：解决连续 tool call 抢跑问题。

- 按模型输出顺序排队。
- edit/write/bash/mcp 作为 barrier。
- read-only 不允许越过 pending barrier。

### Phase 3: 统一 ToolCall 状态

目标：后端成为真实状态源。

- 引入 `queued` / `awaiting-permission` / `running` 等状态。
- 前端不再自行设置 awaiting-confirmation。
- 所有 UI 状态来自后端事件。

### Phase 4: 重构 Permission Mode

目标：移除复杂 scope。

- 加入三种模式：Normal / Auto Accept Edits / Dangerously Allow All。
- 去掉 allow once/session/workspace/always 的 UI。
- 普通模式 read-only 自动，其余 ask。

### Phase 5: 清理旧权限流

目标：删除或收敛 legacy flow。

- 移除前端 fallback `executeTool(... confirmed: true)`。
- 收敛 `requiresConfirmation` 语义。
- 删除或禁用长期 always allow 入口。

### Phase 6: 重新设计 edit/write engine

目标：解决文件修改可靠性。

- dry-run。
- exact apply。
- hash verification。
- undo snapshot。
- 重新评估 fuzzy replacement。

---

## 关键测试场景

需要覆盖：

1. `edit` 等权限时，后续 `read` 只能 queued，不能执行。
2. 用户 approve 后，前面的 edit 完成，再执行 read。
3. 用户 reject edit 后，read 是否继续取决于 tool result / 模型后续逻辑。
4. Normal 模式下 read/read-only bash 自动执行，edit/write/other bash/mcp ask。
5. Auto Accept Edits 模式下 edit/write/read-only bash 自动执行，other bash/mcp ask。
6. Dangerously Allow All 模式下工具默认自动执行。
7. abort session 时，queued / awaiting-permission / running 工具都正确取消。
8. 前端刷新/重放事件后，工具状态仍一致。
9. edit/write 成功后可生成 undo snapshot。
10. exact apply 失败时不写文件。
11. reject barrier tool 后，当前 turn 中排在它后面的 queued tools 被取消。
12. tool-input-delta 流式参数期间不触发执行或 permission ask；只有 tool-input-end 后 parse/validate/preview 成功才进入调度。
13. permission preview 后文件变化，approve 时必须 revalidate，不能写入旧 preview 对应的结果。
14. read `.env` 等敏感文件时按 policy 阻止或 ask，`.env.example` / `.env.sample` 等模板文件允许。✅ read 第一阶段已实现 ask 策略。
15. external directory 访问在 read/write/edit/bash 文件操作中统一进入 policy，而不是散落在工具内部。
16. doom loop 检测能识别重复 toolName + normalized args，并给出 ask/deny/diagnostic 行为。✅ 当前 turn 内第 4 次重复返回 diagnostic failure。

---

## 当前共识摘要

目前已经形成的方向：

1. 要设计新的 tool call permission system，而不是局部修 bug。
2. tool call 执行必须有统一 Orchestrator。
3. 连续工具调用必须经过 Scheduler。
4. pending permission 的 barrier 工具必须阻塞后续工具执行。
5. 普通模式下 read-only / read-only bash 自动执行，edit/write/other bash/mcp ask。
6. 需要 Auto Accept Edits 模式。
7. 需要 Dangerously Allow All 模式。
8. 不需要 Permission Center。
9. 不需要 Permission Scope。
10. 不需要 always allow / workspace allow 这类长期授权心智。
11. 权限确认入口应是 session 级别统一 panel，而不是散落在每个 tool card。
12. Reject 应支持带用户反馈，让 AI 重新规划 / 重新生成工具调用。
13. edit/write 可靠性需要单独升级，包括 dry-run、exact apply、undo。

---

## 未定问题

以下问题需要后续继续讨论：

1. read-only bash classifier 的具体边界，以及是否把 project-local dev commands（如 test/build）纳入自动执行。
2. bash 是否引入 tree-sitter shell parser，还是先用轻量 parser。
3. Dangerously Allow All 是否仍保留 hard block。
4. 外部目录访问在 Auto Accept Edits 下是否 ask。
5. edit 是否保留 fuzzy replacement，还是 exact-only。
6. write / replace file 是否要拆成独立工具。
7. undo UI 放在哪里，支持到什么粒度。
8. 旧的 directory permission storage 如何迁移或废弃。
9. doom loop 检测默认是 ask、deny，还是返回 diagnostic tool result 让模型自我修正。
