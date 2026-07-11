# Eval 系统改进方案

## 问题总览

当前 eval 系统存在五个核心缺陷：

| # | 问题 | 影响 | 严重度 |
| --- | ------ | ------ | -------- |
| 1 | **fixture 中没有 assistant 的完整回复** | 看不到模型到底输出了什么；是文本、是 tool call、还是什么都没做，完全不可知 | 🔴 致命 |
| 2 | **fixture 中没有 prompt/context 快照引用** | 虽然有 `.prompt.json` / `.context.jsonl` 文件，但 fixture 里没有任何指向它们的字段；用户不知道它们存在 | 🔴 致命 |
| 3 | **expect 类型太少** | 只有 `firstToolCall`、`contains`、`notContains` 三种；无法表达"必须有 tool call"、"至少 N 个 tool call"、"输出长度"、"输出结尾"等需求 | 🔴 致命 |
| 4 | **Promote 对话框没有上下文** | 提升 fixture 到 case 时，用户只能看到 fixture JSON，看不到 assistant 的回复、prompt 内容、上下文消息；全靠猜 | 🟡 严重 |
| 5 | **Case YAML 的 notes 是注释** | `sayWillButDont` case 的 `expect.contains` 写的是中文调试说明，被当作字面匹配来执行 | 🟡 严重 |

### 典型失败场景

用户在 `lenovo-scripts` 项目中操作，agent 回复：

> 你说得对，我之前没有真正逐列对比。现在实际做一遍：

然后流就结束了。用户只能看到这行文字，不知道：

- 后面跟了 tool call 吗？还是就这一句话结束了？
- 如果有 tool call，是前端没渲染，还是后端没处理？
- finishReason 是什么？

现在的 fixture 完全无法回答这些问题。

---

## 方案设计

### Phase A：修复 Fixture 上下文（解决 #1、#2、#4 的部分）

#### A1 — 在 fixture 中记录 assistant 的完整回复

**类型定义：**

```typescript
// fixture.ts
export interface EvalAssistantResponse {
  content: string;           // 助手最终文本输出
  toolCalls?: Array<{        // 本轮中做出的所有 tool call
    name: string;
    args?: Record<string, unknown>;
  }>;
  finishReason?: string;     // "stop" | "tool_calls" | "length" | ...
}

export interface EvalFixture {
  // ... 现有字段 ...
  assistantResponse?: EvalAssistantResponse;  // 新增
}
```

**数据来源：**

- **turn-end 路径**（`createTurnEvaluationTrigger`）：`ctx.messages` 中最后一个 assistant message，已有 `content` 和 `toolCalls`
- **downvote 路径**（`recordExplicitDown` IPC）：从 session store 中读取最后一个 assistant message

**涉及文件：**

- `packages/onething-runtime/src/evals/fixture.ts` — 类型 + `createFixture()` 参数
- `packages/onething-runtime/src/evals/turn-evaluator.ts` — `recordTurn()` / `recordExplicitDown()` 参数
- `src/main/engine/triggers/turn-evaluation.ts` — 采集 assistant 响应数据并传入
- `src/main/ipc/evals.ts` — downvote handler 从 session 读取 assistant 响应

#### A2 — 在 fixture 中嵌入 snapshot 引用

**类型定义：**

```typescript
export interface EvalFixture {
  // ... 现有字段 ...
  promptSnapshotRef?: string;     // .prompt.json 文件路径
  contextSnapshotRef?: string;    // .context.jsonl 文件路径
  requestSnapshotRef?: string;    // .request.json 文件路径（API 请求体）
  responseSnapshotRef?: string;   // .response.json 文件路径（API 响应体）
}
```

#### A3 — 激进 snapshot：所有回合保存全部 4 种 snapshot

**现状：** `createTurnEvaluationTrigger` 对每个回合写入 `.prompt.json` 和 `.context.jsonl`。

**改为：** 每个回合无条件保存 4 种 snapshot：

| Snapshot 文件 | 内容 | 数据来源 |
| ------------- | ------ | --------- |
| `.prompt.json` | 系统 prompt 分段（section name + content + hash） | `CorePromptCapture.sections` |
| `.context.jsonl` | 发送给模型的消息历史（capability-transformed 视图） | `CorePromptCapture.requestMessages` |
| `.request.json` | **完整的 API 请求体**：组装后的 system prompt、messages 数组、tool definitions、model 参数 | engine 层组装请求时采集 |
| `.response.json` | **完整的 API 响应体**：assistant text、tool_calls、finish_reason、usage、provider metadata | stream 结束时采集 |

`.request.json` 和 `.response.json` — 引擎层 CorePromptCapture 统一采集

**设计原则：** 不引入新类型，扩展已有的 `CorePromptCapture` (packages/core/engine/triggers.ts)：

```typescript
export interface CorePromptCapture {
  systemPrompt: string;
  sections: CorePromptSection[];
  sectionHashes: Record<string, string>;
  requestMessages?: CoreRequestMessage[];

  // 新增：API 请求/响应的结构化数据，供 eval snapshot 落地
  rawRequest?: {
    model: string;
    systemPrompt: string;
    messages: CoreRequestMessage[];
    tools?: Array<{
      type: "function";
      function: { name: string; description: string; parameters: unknown };
    }>;
    toolChoice?: string;
    temperature?: number;
    maxTokens?: number;
  };
  rawResponse?: {
    content: string;
    toolCalls?: Array<{ id: string; name: string; args: unknown }>;
    finishReason?: string;
    usage?: { inputTokens: number; outputTokens: number; totalTokens: number };
  };
}
```

**数据已在引擎层就绪。** `runAgentLoopPostResponseHooks` (agent-loop-executor.ts) 拥有全部数据：

| 文件 | 数据来源 | 说明 |
| ------ | --------- | ------ |
| `.request.json` | `prepared.runtime.messages` + `prepared.systemPrompt` + `prepared.runtime.tools` | capability-transformed messages、完整 system prompt、tool definitions |
| `.response.json` | `state.processor.accumulatedContent` + `state.turn.toolCalls` + `state.accumulatedUsage` + `finishReason` | 累积文本、tool calls、token 用量、结束原因 |

**采集代码（agent-loop-executor.ts 约 line 158-177）：**

```typescript
const rawRequest = prepared.runtime?.messages ? {
  model: state.ctx.providerConfig.model,
  systemPrompt: prepared.systemPrompt,
  messages: prepared.runtime.messages,
  tools: prepared.runtime.tools,
  toolChoice: prepared.runtime.toolChoice,
  temperature: prepared.runtime.temperature,
  maxTokens: prepared.runtime.maxTokens,
} : undefined;

const rawResponse = {
  content: state.processor.accumulatedContent,
  toolCalls: lastAssistantMsg?.toolCalls?.map(tc => ({
    id: tc.id, name: tc.name, args: tc.arguments
  })),
  finishReason: state.finishReason,
  usage: state.accumulatedUsage,
};

const promptCapture: CorePromptCapture = {
  // ... 已有字段 ...
  rawRequest,
  rawResponse,
};
```

**为什么激进？** 磁盘很便宜，排查问题的时间很贵。不要在该不该保存的问题上纠结——每个回合都全量保存。

#### A4 — Promote 对话框中展示 assistant 回复和 snapshot 链接

在 `EvalsFixturesView.vue` 的 promote dialog 中增加：

- **Response Preview 面板**：显示 `fixture.assistantResponse?.content` 和 tool calls
- **View Prompt Snapshot 按钮**：如果 `fixture.promptSnapshotRef` 存在且文件可读，显示 prompt 分段
- **View Context Snapshot 按钮**：如果 `fixture.contextSnapshotRef` 存在，分页显示上下文消息

**涉及文件：**

- `src/renderer/components/settings/evals/EvalsFixturesView.vue` — UI 改动
- `src/shared/ipc/evals.ts` — 已有 `EVALS_READ_SNAPSHOT` channel，无需新增

---

### Phase B：丰富 Expect 类型（解决 #3）

#### B1 — 新增断言类型

```typescript
// evaluator.ts
export interface EvalExpectation {
  // —— 现有字段 ——
  firstToolCall?: string | { name: string; args?: Record<string, unknown> };
  contains?: string | string[];
  notContains?: string | string[];
  judge?: { rubric: string };
  
  // —— 新增：tool call 相关 ——
  /** true=必须有任何 tool call；false=必须没有任何 tool call */
  hasToolCalls?: boolean;
  /** 最少 tool call 数量 */
  minToolCalls?: number;
  /** 最多 tool call 数量 */
  maxToolCalls?: number;
  /** 精确匹配整个 tool call 序列（name + 可选 args） */
  toolCalls?: Array<{ name: string; args?: Record<string, unknown> }>;
  /** 对指定位置的 tool call 做断言 */
  toolCallAt?: Array<{
    index: number;
    name?: string;
    args?: Record<string, unknown>;
    argContains?: Record<string, string>; // args[key] 包含某值
  }>;

  // —— 新增：输出文本相关 ——
  /** 输出最短长度（字符数） */
  minOutputLength?: number;
  /** 输出最长长度（字符数） */
  maxOutputLength?: number;
  /** 输出必须以某字符串开头 */
  outputStartsWith?: string;
  /** 输出必须以某字符串结尾 */
  outputEndsWith?: string;
  /** 输出必须匹配正则 */
  regex?: string;

  // —— 新增：元信息 ——
  /** 人类可读的注释，不参与自动化检查 */
  notes?: string;
  
  // 兼容旧 output.contains / output.notContains 嵌套写法
  output?: {
    contains?: string;
    notContains?: string;
  };
}
```

#### B2 — 多条件 AND 逻辑

所有 expect 字段之间是 **AND** 关系：任何一个检查失败，整个 case 就失败。
详细检查列表和 skill/MCP 检测实现见 [B1.1 断言检查逻辑伪代码](#b11--断言检查逻辑伪代码)。

#### B3 — 更新 YAML 解析/生成器

`case-file.ts` 的 `parseCaseYaml` 和 `generateCaseYaml` 需要支持所有新增字段的序列化。
详细 YAML 字段映射表见 [B3 — 新增字段的 YAML 映射](#b3--更新-yaml-解析生成器)。

**YAML 解析器扩展：** mini-YAML parser 当前不支持序列（`- key: value`）和嵌套 mapping（2 级以上的缩进）。需要扩展：

- 支持 `- key: value` 序列项解析（识别 ` - ` 前缀）
- 支持嵌套 object 的缩进解析（4-space/6-space nested keys）
- `argContains` 子对象的值做子串匹配而非精确匹配

#### B4 — 修复 `sayWillButDont` case

```yaml
# sayWillButDont - agent 说"做一遍"但没有任何 tool call
id: sayWillButDont
description: >
  Agent 承认需要逐列对比但回复在纯文本后结束，
  没有任何 tool call，这是不应该的。
fixture: 2026-07-09-f1d997eb-e97-bf71bd59-1b3.json
userMessage: "你说得对，我之前没有真正逐列对比。现在实际做一遍："
expect:
  hasToolCalls: true
  minOutputLength: 50
  notes: >
    Agent 说"现在实际做一遍"但实际没有任何 tool call，
    finishReason 应为 "tool_calls" 而非 "stop"。
    minOutputLength 确保回复不只是一句话就结束。
```

### Phase C：改善 Promote UX（解决 #4、#5）

#### C1 — 结构化 Expect Builder

当前 Promote 对话框只有一个下拉框（Expect Type）+ 一个文本框（Expect Value），无法表达多条件。

改为结构化表单，按维度分组：

```
┌────────────────────────────────────────────────────────────┐
│ 📋 创建 Test Case                                           │
│                                                            │
│ Case ID: [_________________]                                │
│ 描述:    [_________________]                                │
│                                                            │
│ 📤 Assistant 回复预览                                       │
│ ┌────────────────────────────────────────────────────────┐ │
│ │ 你说得对，我之前没有真正逐列对比。现在实际做一遍：     │ │
│ │                                                        │ │
│ │ 🔧 Tool Calls (0): 无                                  │ │
│ │ ⚡ finishReason: stop                                  │ │
│ └────────────────────────────────────────────────────────┘ │
│                                                            │
│ ── 🔧 Tool Call 断言 ───────────────────────────────────── │
│ [x] 必须有 tool call                          🎯 自动建议  │
│ [ ] 最少 [1] 个，最多 [10] 个 tool call                    │
│ [ ] 第一个 tool call 必须是: [bash       ▾]               │
│ [ ] 禁止调用: [write     ▾] [edit  ▾] [+添加]              │
│ [ ] 调用次数: [bash ▾] 最少[1] 最多[5]                     │
│ [ ] 任意位置必须调用: [mcp__playwright__navigate ▾]        │
│                                                            │
│ ── 🧩 Skill 断言 ────────────────────────────────────────── │
│ [x] 应使用的 skill: [browser-use    ▾]                    │
│ [ ] 必须使用任何 skill                                     │
│                                                            │
│ ── 🔌 MCP 断言 ─────────────────────────────────────────── │
│ [x] 应使用的 MCP server: [playwright  ▾]                   │
│ [ ] 必须调用任何 MCP 工具                                  │
│                                                            │
│ ── 📝 输出文本断言 ─────────────────────────────────────── │
│ [ ] 输出必须包含: [_________________] [+添加]              │
│ [ ] 输出禁止包含: [_________________] [+添加]              │
│ [ ] 输出最短长度: [200] 字符                               │
│ [ ] 输出以: [对比完成。                    ] 结尾          │
│                                                            │
│ [View Prompt Snapshot]  [View Context Snapshot]            │
│                                                            │
│ [取消]                              [Promote]              │
└────────────────────────────────────────────────────────────┘
```

Skill / MCP 图标旁边的下拉选项从 fixture.context 中自动填充：

- Skill 列表来自 `fixture.context.skills`
- Tool 列表来自 `fixture.context.toolNames`（含 `mcp__*` 工具）

#### C2 — 自动建议 Expect

打开 Promote 对话框时，分析 `fixture.assistantResponse`：

| 检测到的模式 | 自动建议 | 所属维度 |
| ------------- | --------- | --------- |
| `toolCalls` 为空 + user message 暗示需要行动 | 勾选 "必须有 tool call" | Tool Call |
| 有 tool calls | 自动填入 firstToolCall 名称 | Tool Call |
| 回复很短 (< 50 chars) + 无 tool calls | 勾选 "输出最短长度: 100" | Output |
| 回复包含错误关键字（"抱歉"、"我无法"、"错误"） | 勾选 "输出禁止包含: 错误文本" | Output |
| fixture.context 中有 MCP 工具 但 response 无 mcp__ 调用 | 勾选 "必须使用任何 MCP 工具" | MCP |
| fixture.context 中有 skills 但 response 无 SKILL.md 读取 | 勾选 "必须使用任何 skill" | Skill |
| 调用了 `bash` 但参数中没有 SKILL.md | 勾选 "应使用的 skill: [自动匹配]" | Skill |

自动建议用 🎯 图标标注，让用户知道是系统推断的。

#### C3 — Snapshot 查看链接

- **View Prompt Snapshot**：点击后展开显示 `.prompt.json` 中每个 section 的名称和哈希，支持点击展开查看完整内容
- **View Context Snapshot**：分页显示 `.context.jsonl` 中的消息列表，带 role 标签

这两个功能复用已有的 `platformApi.evalsReadSnapshot` IPC（后端已有 `EVALS_READ_SNAPSHOT` handler）。

---

### Phase D：Case YAML 治理（解决 #5）

#### D1 — `notes` 真正成为独立字段

当前 `notes` 是 `#` 注释，parseCaseYaml 会跳过注释行。需要：

1. `CaseDefinition` 增加 `notes?: string`
2. `parseCaseYaml` 收集 `expect` 块下的 `#` 行，合并为 `notes`
3. `generateCaseYaml` 将 `notes` 写回为 `#` 注释

```yaml
expect:
  hasToolCalls: true
  # Agent 说"现在实际做一遍"但实际没有任何 tool call
  # finishReason 应为 "tool_calls" 而非 "stop"
```

#### D2 — 验证 expect key

解析 case YAML 时，如果遇到不认识的 `expect` key，打印 warning（不阻塞运行）：

```
[Evals] Warning: case "sayWillButDont" has unknown expect key:
  "contains_with_typo" — did you mean "contains"?
```

已知 key 白名单：`firstToolCall`, `lastToolCall`, `toolCalls`, `toolCallContains`, `toolCallAt`, `noToolCalls`, `toolCallCount`, `hasToolCalls`, `minToolCalls`, `maxToolCalls`, `skillUsed`, `anySkillUsed`, `allSkillsUsed`, `mcpToolUsed`, `mcpServerUsed`, `mcpToolUsedName`, `contains`, `notContains`, `minOutputLength`, `maxOutputLength`, `outputStartsWith`, `outputEndsWith`, `regex`, `judge`, `notes`, `output`

#### D3 — 修复所有现有 case

逐个审查 `evals/cases/*.yaml`，修复用 `contains` 写注释的 case。

---

## 实施顺序

```
Phase A1 → A2  (fixture 新增 assistantResponse + snapshotRef)  ← 阶段1a
    ↓
Phase A3  (激进 snapshot: 全部回合保存 4 种 snapshot)         ← 阶段1b
    ↓
Phase B1 → B2 → B3  (expect 类型丰富)                          ← 阶段2
    ↓
Phase C1 → C2 → C3  (promote UX 改善)                          ← 阶段3
    ↓
Phase D1 → D2 → D3  (YAML 清理)                                ← 阶段4
```

每个 phase 可独立合入，不阻塞后续 phase。

**优先级划分：**

- 🔴 拔钉子（必须立马做）：A1、A2、A3 — 用户现在看不到问题，先让他能看到
- 🟡 堵漏洞（本周做）：B1-B4 — 丰富断言能力，让 case 真正能发现问题
- 🟢 磨体验（下周做）：C1-C3、D1-D3 — 让系统能用、好用

---

## 涉及文件清单

| 文件 | Phase | 改动内容 |
| ------ | ------- | --------- |
| `packages/onething-runtime/src/evals/fixture.ts` | A1, A2 | 增加 `EvalAssistantResponse` 类型、4 种 snapshot ref 字段、`createFixture` 入参 |
| `packages/onething-runtime/src/evals/turn-evaluator.ts` | A1, A2 | `recordTurn`/`recordExplicitDown` 增加 assistant 响应和 4 种 snapshot ref 入参 |
| `packages/onething-runtime/src/evals/snapshot.ts` | A3 | 新增 `writeRequestSnapshot`、`writeResponseSnapshot`；扩展 `writeCaptureSnapshots` 返回 4 种 ref |
| `packages/core/engine/triggers.ts` | A3 | 扩展 `CorePromptCapture` 增加 `rawRequest` 和 `rawResponse` 字段 |
| `src/main/engine/stream/agent-loop-executor.ts` | A3 | `runAgentLoopPostResponseHooks` 中采集 `rawRequest`/`rawResponse` 并写入 `CorePromptCapture` |
| `src/main/engine/triggers/turn-evaluation.ts` | A1, A2, A3 | 采集 assistant 响应数据；激进保存全部 4 种 snapshot |
| `src/main/ipc/evals.ts` | A1 | downvote handler 从 session 读取 assistant 响应 |
| `src/main/ipc/evals.ts` | A1 | downvote handler 从 session 读取 assistant 响应 |
| `packages/onething-runtime/src/evals/evaluator.ts` | B1, B2 | 全量扩展 `EvalExpectation`（20+ 种断言）、重构 `evaluateHard` 为职责链、实现 skill/MCP 检测 |
| `packages/onething-runtime/src/evals/case-file.ts` | B3, D1, D2 | 扩展 YAML 解析支持序列和嵌套 mapping、notes 解析/生成、expect key 验证白名单 |
| `packages/onething-runtime/src/evals/index.ts` | B1 | 导出新增类型（`EvalExpectation` 扩展字段） |
| `evals/runner/evaluator.mjs` | B1, B2 | CLI 端同步更新，保持与 runtime/evaluator.ts 一致 |
| `src/renderer/components/settings/evals/EvalsFixturesView.vue` | C1, C2, C3 | Promote 对话框重构为结构化表单（Tool/Skill/MCP/Output 四维分组） |
| `src/shared/ipc/evals.ts` | C1 | `EvalsPromoteFixtureRequest.expect` 类型扩展以支持所有新断言 |
| `src/main/ipc/evals.ts` | C1 | `promoteFixture` handler 适配新的 expect 结构 |
| `src/renderer/stores/evals.ts` | C1 | `promoteFixture` 方法签名更新 |
| `evals/cases/sayWillButDont.yaml` | B4 | 用 `hasToolCalls: true` + `minOutputLength` 替代错误的 `contains` |
| 其他 `evals/cases/*.yaml` | D3 | 审查和修复（用 `contains` 写注释的 case、补充 skill/MCP 断言） |

---

## 已知 Bug

### Bug: Start Run 按钮点击无反应

**现象：** 点击 "Start Run" 绿色按钮后没有任何视觉反馈，就像没点一样。

**根因：** 错误消息被藏在 progress 视图里，而 progress 视图在 run 失败后立即消失，导致错误对用户不可见。

**调用链：**

```
handleStartRun()
  → store.startRun(opts)
     → runInProgress = true          // Vue 切到 progress 视图
     → runProgress = null
     → platformApi.evalsRunStart()   // IPC → main process
        → activeRunAbort?            // 上次 run 没清 → {"A run is already in progress"}
        → getRepoDir()?              // 没配 evals repo → {"Evals repo not configured"}
        → resolveEvalsCredentials()? // 没配 key → {"No API key configured for X"}
        → 成功后 fire-and-forget
     → 如果 res.success === false
        → runInProgress = false      // Vue 切回 form 视图
        → runProgress = { type: "error", error: "..." }  // 错误设好了...
```

**模板判断：**

```vue
<!-- progress 视图（v-if="store.runInProgress"）-->
<div v-if="store.runInProgress" class="evals-run-progress">
  <div v-if="store.runProgress?.type === 'error'">
    {{ store.runProgress.error }}  <!-- ← 错误在这里显示 -->
  </div>
</div>

<!-- form 视图（v-else）-->
<div v-else class="evals-run-form">
  <button @click="handleStartRun">Start Run</button>
  <!-- ← 这里没有错误提示！ -->
</div>
```

当 `evalsRunStart` 返回失败时：

1. `runInProgress = true` → progress 视图闪现
2. API 返回 `{ success: false }` → `runInProgress = false` → progress 视图**消失**
3. 错误消息 `runProgress.error` 跟着一起消失了
4. 用户看到的：form 恢复原样，什么都没发生

**影响：** 用户不知道 run 到底为什么失败。具体失败原因可能是：

- "Evals repo not configured"（没在 Settings → Evals 里配 repo 路径）
- "No API key configured for provider xxx"（Settings → Providers 里没配 API key）
- "A run is already in progress"（上次 run 的 `activeRunAbort` 没清理干净，重启 app 可解）

**修复方向：**

1. 在 form 视图里也显示 `runProgress.error`（当 `!runInProgress && runProgress?.type === 'error'`）
2. 或者：保持 `runInProgress` 为 true，让 error 在 progress 视图里持续可见，需要用户手动关闭

---

## Bug: "An object could not be cloned" — IPC 序列化失败

**现象：** 点击 Start Run（或其它 eval 操作）时，DevTools Console 输出 `An object could not be cloned.`

**根因：Vue reactive Proxy 对象被直接传入 Electron IPC。**

Electron 的 `contextBridge` 使用 `structuredClone` 序列化跨进程数据。Vue 3 的 `ref()` / `reactive()` 创建的对象是 JavaScript `Proxy`，而 `structuredClone` **不支持 Proxy 对象**，直接抛错。

**触发路径（EvalsRunsView.vue）：**

```typescript
// runForm 是 ref，内部数据是 reactive Proxy
const runForm = ref({
  caseIds: [] as string[],          // ← checkbox v-model 绑定的 reactive array
  disabledSections: [] as string[], // ← 同上
});

// handleStartRun 中直接传递 reactive 数据到 IPC
async function handleStartRun() {
  await store.startRun({
    caseIds: runForm.value.caseIds.length > 0
      ? runForm.value.caseIds          // ← Proxy Array! structuredClone 无法克隆
      : undefined,
    disabledSections: runForm.value.disabledSections.length > 0
      ? runForm.value.disabledSections // ← Proxy Array!
      : undefined,
  });
}
```

**调用链：**

```
handleStartRun()
  → store.startRun(opts)
     → platformApi.evalsRunStart(opts)
        → electronAPI.evalsRunStart(opts)     // Preload bridge
           → contextBridge 序列化
              → structuredClone(opts)          // 💥 Proxy Array!
```

**触发条件：** 仅当用户勾选了 case checkbox（`caseIds` 非空）或 ablation checkbox（`disabledSections` 非空）时触发。默认状态下两者为空数组，handler 传 `undefined`，不会触发。

**修复方案（推荐方案一 + 方案二双保险）：**

方案一（store 层剥离 Proxy，影响所有 eval IPC 调用）：

```typescript
// evals.ts store → startRun()
async function startRun(opts: {...}) {
  const safe = JSON.parse(JSON.stringify(opts));
  const res = await platformApi.evalsRunStart(safe);
}
```

方案二（组件层展开 reactive array 为 plain array）：

```typescript
// EvalsRunsView.vue → handleStartRun()
const safeCaseIds = runForm.value.caseIds.length > 0
  ? [...runForm.value.caseIds]
  : undefined;
const safeDisabled = runForm.value.disabledSections.length > 0
  ? [...runForm.value.disabledSections]
  : undefined;
await store.startRun({
  caseIds: safeCaseIds,
  disabledSections: safeDisabled,
  ...
});
```

**涉及文件：**

- `src/renderer/stores/evals.ts` → `startRun()` 加 `JSON.parse(JSON.stringify(opts))`
- `src/renderer/components/settings/evals/EvalsRunsView.vue` → `handleStartRun()` 展开 reactive array

---

## Eval Run 详情查看系统 - 设计方案

### 问题

Run 完成后，用户**完全看不到**：

- 每个 case 的通过/失败详情
- 每个 attempt 的 pass/fail reason
- 发送了什么 request（什么 prompt、什么 messages）
- 接收到了什么 response（什么 text、什么 tool_calls、finish_reason）

当前只有两行对比（Comparison table），只显示分数差异。整个 run 的过程是黑盒。

### 数据现状

| 数据 | 现在有吗？ | 在哪？ |
| ------ | ----------- | -------- |
| 每个 case 的 score | ✅ 有 | `results.jsonl` → `EvalRunResultEntry.scores` |
| 每个 attempt 的 pass/fail | ❌ 没有 | progress event 发完就丢了 |
| 每个 attempt 的 reason | ❌ 没有 | 同上 |
| eval run 的 request | ❌ 没有 | `createEvalsModelCaller` 直接 fetch，不写 snapshot |
| eval run 的 response | ❌ 没有 | 同上 |
| case 定义（expect 断言） | ✅ 有 | `evals/cases/*.yaml` |

### 方案设计

#### 1. 持久化 per-case per-attempt 结果

在 `runner.ts` 的 `runEvals` 中，为每个 case 收集全部 attempt 结果，并写入一个 `.run-<ts>.json` 文件：

```typescript
// runner.ts
interface EvalCaseAttemptResult {
  index: number;       // 0-based attempt index
  pass: boolean;
  reason: string;      // 来自 evaluateHard 的 reason
  durationMs?: number; // 单次 attempt 耗时
}

interface EvalRunDetailEntry {
  version: 1;
  ts: string;
  provider: string;
  model: string;
  runs: number;        // k 值
  cases: Record<string, {  // caseId → 详情
    score: number;
    attempts: EvalCaseAttemptResult[];
    // 指向该 case 最后一次 attempt 的 request/response snapshot
    lastRequestRef?: string;
    lastResponseRef?: string;
  }>;
}
```

**写入时机：** run-done 时，和 results.jsonl 一起写入。文件放在 `evals/runs/<ts>.json`。

#### 2. 为 eval run 的每次 model call 写 snapshot

在 `createEvalsModelCaller`（`evals-provider-adapter.ts`）中，每次调用 model 时写入 `.request.json` 和 `.response.json`：

```typescript
export function createEvalsModelCaller(providerId: string, model: string): EvalModelCaller {
  return async (opts) => {
    // 1. Write .request.json
    const requestRef = writeEvalRunRequest({
      caseId: opts.metadata?.caseId,
      attempt: opts.metadata?.attempt,
      model,
      messages: opts.messages,
      tools: opts.tools,
      runDir: getEvalsRunsDir(),
    });

    // 2. Call model
    const response = await fetch(...);

    // 3. Write .response.json
    const responseRef = writeEvalRunResponse({
      caseId: opts.metadata?.caseId,
      attempt: opts.metadata?.attempt,
      content: response.content,
      toolCalls: response.toolCalls,
      finishReason: response.finishReason,
      usage: response.usage,
      runDir: getEvalsRunsDir(),
    });

    return { ...response, requestRef, responseRef };
  };
}
```

**存储目录：** `evals/runs/<run-ts>/<caseId>/attempt-<n>.{request,response}.json`

#### 3. UI：Run Detail 面板

在 `EvalsRunsView.vue` 中，把 Run History 的**点击一行**改为展开详情：

```
┌──────────────────────────────────────────────────────────────┐
│ Run History                                                  │
│                                                              │
│ ▸ 2026-07-09 12:34  deepseek  85%  6 cases × 3 runs         │ <- 点击展开
│   2026-07-09 12:20  deepseek  72%  6 cases × 3 runs         │
│                                                              │
└──────────────────────────────────────────────────────────────┘

展开后：

┌──────────────────────────────────────────────────────────────┐
│ ▼ 2026-07-09 12:34  deepseek  deepseek-v4-pro   Mean: 85%   │
│                                                              │
│ ┌─ Case: sayWillButDont ─────────────── Score: 67% (2/3) ─┐ │
│ │  ⏱ attempt-1  ✗  Expected tool calls but none made      │ │
│ │     📄 Request  📥 Response                               │ │
│ │  ⏱ attempt-2  ✓  All expectations met                   │ │
│ │     📄 Request  📥 Response                               │ │
│ │  ⏱ attempt-3  ✗  Expected tool calls but none made      │ │
│ │     📄 Request  📥 Response                               │ │
│ └──────────────────────────────────────────────────────────┘ │
│                                                              │
│ ┌─ Case: linux-unix-syntax ─────────── Score: 100% (3/3) ─┐ │
│ │  ⏱ attempt-1  ✓  Output contains "date"                 │ │
│ │  ⏱ attempt-2  ✓  Output contains "date"                 │ │
│ │  ⏱ attempt-3  ✓  Output contains "date"                 │ │
│ └──────────────────────────────────────────────────────────┘ │
│                                                              │
│ [Compare with another run]  <- 按钮，点击后选第二个 run      │
└──────────────────────────────────────────────────────────────┘
```

#### 4. UI：Request/Response 查看器

点击 "📄 Request" 或 "📥 Response" 弹出内联查看器：

```
┌─ Request: sayWillButDont / attempt-1 ──────────────────────┐
│                                                              │
│ POST https://api.deepseek.com/chat/completions               │
│                                                              │
│ {                                                            │
│   "model": "deepseek-v4-pro",                               │
│   "messages": [                                              │
│     { "role": "system", "content": "You are..." },          │
│     { "role": "user", "content": "你说得对，我之前没有..." } │
│   ],                                                         │
│   "tools": [...],                                            │
│   "temperature": 0                                           │
│ }                                                            │
│                                                              │
│                                    [Copy JSON] [Close]       │
└──────────────────────────────────────────────────────────────┘
```

#### 5. 改进 Comparison 表

在现有的对比表基础上，增加每行的展开功能，显示 pass/fail reason：

```
Case              Previous   Current   Delta
▸ sayWillButDont    33%       67%     ↑+34%
  │  Previous: attempt-1 ✗ "Expected tool calls..."
  │             attempt-2 ✓ "All expectations met"
  │             attempt-3 ✗ "Expected tool calls..."
  │  Current:  attempt-1 ✓ "All expectations met"
  │            attempt-2 ✓ "All expectations met"  
  │            attempt-3 ✗ "Expected tool calls..."
▸ voice-no-code     67%       33%     ↓-34%
```

### 涉及文件

| 文件 | 改动 |
| ------ | ------ |
| `packages/onething-runtime/src/evals/runner.ts` | 收集 per-case-attempt 结果，写入 `evals/runs/<ts>.json` |
| `src/main/ipc/evals-provider-adapter.ts` | `createEvalsModelCaller` 中每次 call 写 request/response snapshot |
| `evals/runner/model-client.mjs` (CLI 端) | 同步更新，也写 request/response |
| `src/shared/ipc/evals.ts` | 新增 `EvalsReadRunDetail` / `EvalsReadAttemptSnapshot` IPC 类型 |
| `src/main/ipc/evals.ts` | 新增 IPC handler：读取 run detail JSON、读取 attempt snapshot |
| `src/renderer/components/settings/evals/EvalsRunsView.vue` | 重构 Run History：展开单行详情、Request/Response 查看器、改进对比表 |
| `src/renderer/stores/evals.ts` | 新增 `loadRunDetail()` / `loadAttemptSnapshot()` actions |

### 实施顺序

```
1. runner.ts 持久化 per-attempt 结果  ← 数据层
2. evals-provider-adapter.ts 写 snapshot ← 数据层
3. IPC handler 读取 run detail       ← 后端
4. RunsView.vue 重构 UI              ← 前端
5. Comparison 表改进                  ← 收尾
```

---

## UI 设计方案（v2）：Run Detail + Case Detail + Snapshot Viewer

### 设计原则

1. **只用现有 theme token**，不引入任何硬编码颜色
2. **单层展开**：点击一行在下方展开详情，不跳转、不弹新页面
3. **信息分层**：Run → Case → Attempt → Snapshot，逐层下钻
4. **对比依然支持**：在详情展开状态下，点 Compare 按钮选第二个 run
5. **紧凑但不拥挤**：每层只有必要信息，更多细节点进去看

### Theme Token 速查

| 用途 | Token |
| ------ | ------- |
| 页面背景 | `--settings-paper` |
| 卡片/面板背景 | `--settings-paper-3` |
| 主文字 | `--settings-ink` |
| 次要文字 | `--settings-ink-2`, `-3`, `-4` |
| 边框 | `--settings-rule`, `--settings-rule-soft` |
| 强调 | `--settings-accent` |
| 成功 | `--ui-status-success-bg`, `-fg` |
| 失败 | `--ui-status-danger-bg`, `-fg`, `-border` |
| 信息 | `--ui-status-info-bg`, `-fg` |
| 警告 | `--ui-status-warning-fg` |
| 分隔线颜色 | `color-mix(in srgb, var(--settings-accent) 10%, transparent)` （hover 用） |

---

### 层级一：Run History（改动：单行点击展开）

```
┌──────────────────────────────────────────────────────────────┐
│ Run History                                                  │
│                                                              │
│ ▼ 2026-07-09 12:34   ▸▸▸▸▸▸▸▸▸▸▸▸▸▸▸▸▸▸▸ deepseek 85%     │  ← 已展开，三角朝下
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ model: deepseek-v4-pro  3 runs per case  6 cases total   │ │
│ │                                                          │ │
│ │ ┌─ Case: sayWillButDont ───────────── 67% (2/3) ──────┐ │ │
│ │ │  ✗ #1  Expected tool calls but none made             │ │ │
│ │ │     [Request] [Response]                              │ │ │
│ │ │  ✓ #2  All expectations met                          │ │ │
│ │ │     [Request] [Response]                              │ │ │
│ │ │  ✗ #3  Expected tool calls but none made             │ │ │
│ │ │     [Request] [Response]                              │ │ │
│ │ └──────────────────────────────────────────────────────┘ │ │
│ │                                                          │ │
│ │ ┌─ Case: linux-unix-syntax ──────────── 100% (3/3) ───┐ │ │
│ │ │  ✓ #1  Output contains "date"                        │ │ │
│ │ │  ✓ #2  Output contains "date"                        │ │ │
│ │ │  ✓ #3  Output contains "date"                        │ │ │
│ │ └──────────────────────────────────────────────────────┘ │ │
│ │                                                          │ │
│ │ ┌─ Case: voice-no-codeblock ─────────── 33% (1/3) ────┐ │ │
│ │ │  ✗ #1  Output contains forbidden pattern "```"       │ │ │
│ │ │     [Request] [Response]                              │ │ │
│ │ │  ✓ #2  Output avoids forbidden "```"                 │ │ │
│ │ │     [Request] [Response]                              │ │ │
│ │ │  ✗ #3  Output contains forbidden pattern "```"       │ │ │
│ │ │     [Request] [Response]                              │ │ │
│ │ └──────────────────────────────────────────────────────┘ │ │
│ │                                                          │ │
│ │  [Compare with another run]                              │ │
│ └──────────────────────────────────────────────────────────┘ │
│                                                              │
│ ▸ 2026-07-09 12:20   ▸▸▸▸▸▸▸▸▸▸▸ deepseek 72%              │  ← 未展开，三角朝右
│ ▸ 2026-07-08 18:00   ▸▸▸▸▸ deepseek 60%                    │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

**关键交互：**

- 点击 Run 行 → 展开/收起详情（单行 accordion）
- 点击 [Compare with another run] → 该 run 保持展开，同时在下方出现第二个 run 选择提示（点另一行选为 B）
- 对比模式下，详情面板变成左右两栏

---

### 层级二：Request / Response 查看器（内联弹出）

点击 `[Request]` 或 `[Response]` 后，在该 attempt 行下方展开一个语法高亮的 JSON 查看器：

```
  │ │  ✗ #1  Expected tool calls but none made             │ │
  │ │     [Request] [Response]                              │ │
  │ │  ┌──────────────────────────────────────────────────┐│ │
  │ │  │ POST /chat/completions              [Copy] [✕]  ││ │
  │ │  │ ──────────────────────────────────────────────── ││ │
  │ │  │ {                                                ││ │
  │ │  │   "model": "deepseek-v4-pro",                   ││ │
  │ │  │   "messages": [                                  ││ │
  │ │  │     { "role": "system", "content": "..." },     ││ │
  │ │  │     { "role": "user",                            ││ │
  │ │  │       "content": "你说得对，我之前没有..." }      ││ │
  │ │  │   ],                                             ││ │
  │ │  │   "tools": [...],                                ││ │
  │ │  │   "temperature": 0                               ││ │
  │ │  │ }                                                ││ │
  │ │  └──────────────────────────────────────────────────┘│ │
```

**样式要点：**

- 背景 `--settings-paper-3`，左边框 `--settings-accent`（2px）
- 等宽字体 `ui-monospace, SFMono-Regular, monospace`
- 字号 `11px`，行高 `1.5`
- 右上角两个按钮：[Copy JSON] `--settings-accent` 颜色、[✕] `--settings-ink-4`
- 最大高度 `400px`，溢出滚动

---

### 层级三：对比模式（两行选中后）

当选中两个 run 比较时：

```
┌──────────────────────────────────────────────────────────────┐
│ Run History                                                  │
│                                                              │
│ ▸ 2026-07-09 12:34  deepseek  85%   ▸▸▸▸▸▸▸▸  ← A (蓝标)   │
│ ▸ 2026-07-09 12:20  deepseek  72%   ▸▸▸▸▸▸▸▸  ← B (橙标)   │
│ ▸ 2026-07-08 18:00  deepseek  60%                            │
│                                                              │
│ ┌─ Comparing: 12:20 → 12:34 ──────────────────────────────┐ │
│ │                                                          │ │
│ │ Case              A (12:20)   B (12:34)   Δ             │ │
│ │ ─────────────────────────────────────────────────────── │ │
│ │ sayWillButDont      33%         67%      ↑ +34%        │ │
│ │ linux-unix-syntax  100%        100%       → 0          │ │
│ │ voice-no-code       67%         33%      ↓ -34%        │ │
│ │                                                          │ │
│ │ [View case details] [View B case details]               │ │
│ └──────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

点击底部按钮可以在对比表和 case 详情之间切换。

---

### 数据结构（`evals/runs/<run-ts>.json`）

```typescript
interface EvalRunDetail {
  version: 1;
  ts: string;
  provider: string;
  model: string;
  runs: number;
  cases: Record<string, {
    score: number;
    caseId: string;
    attempts: Array<{
      index: number;
      pass: boolean;
      reason: string;
      requestRef?: string;   // 相对路径，如 "sayWillButDont/attempt-1.request.json"
      responseRef?: string;  // 相对路径
    }>;
  }>;
}
```

**文件存放：** `evals/runs/<run-ts>.json`

**Snapshot 文件：** `evals/runs/<run-ts>/<caseId>/attempt-<n>.{request,response}.json`

---

### 精简版（首批实现推荐）

考虑到工作量，可以分两期：

**第一期（解锁核心能力）：**

1. Run Detail 面板（展开单行看 case 列表 + attempt 结果）
2. 数据持久化（runner.ts 写入 `evals/runs/<ts>.json`）
3. Snapshot 写入（每次 model call 写 request/response）
4. JSON 查看器（简单 pre 标签展开）

**第二期（打磨体验）：**

1. 对比模式改进（详情+对比自由切换）
2. JSON 语法高亮
3. Copy JSON 按钮
4. 耗时/日期等辅助信息

---

### 涉及文件（第一期）

| 文件 | 改动 |
| ------ | ------ |
| `packages/onething-runtime/src/evals/runner.ts` | 收集 per-attempt 结果，cas-done 时写入 run detail JSON |
| `packages/onething-runtime/src/evals/model-call.ts` | `EvalModelCallOptions` 加 `metadata` 字段（caseId, attempt） |
| `src/main/ipc/evals-provider-adapter.ts` | `createEvalsModelCaller` 每次 call 写 request/response snapshot |
| `src/shared/ipc/evals.ts` | 新增 `EvalsReadRunDetailRequest/Response` 和 `EvalsReadAttemptSnapshotRequest/Response` |
| `src/main/ipc/evals.ts` | 新增两个 IPC handler：读取 run detail + attempt snapshot |
| `src/renderer/components/settings/evals/EvalsRunsView.vue` | 单行展开，Run Detail 面板，Request/Response 内联查看器 |
| `src/renderer/stores/evals.ts` | 新增 `loadRunDetail()`, `loadAttemptSnapshot()`, `expandedRun` state |

---

## Run Detail 查看系统 - v2 设计（遵守 headless core 原则）

### 架构约束

```
┌──────────────────────────────────────────────────────┐
│  Shared Runtime (packages/onething-runtime)             │
│  - runner.ts: 纯计算，通过 onProgress 回调上报数据    │
│  - evaluator.ts: 纯断言检查                            │
│  - 不写文件、不知道路径、不依赖 Node.js fs            │
├──────────────────────────────────────────────────────┤
│  Adapter 层                                           │
│  - main/ 进程: IPC handler 接收 progress 事件，写文件 │
│  - CLI: run.mjs 入口，写文件                           │
├──────────────────────────────────────────────────────┤
│  Renderer                                             │
│  - 通过 IPC 读取 run detail，展示左右分栏 UI           │
└──────────────────────────────────────────────────────┘
```

### 改动全景

```
层          | 改什么
------------+---------------------------------------------------------
runtime     | EvalRunProgressEvent.run-done 增加 detail 字段
            | EvalModelCallOptions 增加 metadata（caseId, attempt）
            | （不改任何 fs 操作）
------------+---------------------------------------------------------
adapter     | IPC handler runEvalsInBackground 收到 run-done 时
(main)      | 把 detail 写入 evals/runs/<ts>.json
            | 新增 EVALS_READ_RUN_DETAIL IPC handler
            | createEvalsModelCaller 利用 metadata 写 request/response snapshot
------------+---------------------------------------------------------
renderer    | EvalsRunsView 改为左右分栏
            | store: 新增 runDetail state + loadRunDetail action
            | 左侧: Run History 列表（点一行选中）
            | 右侧: 详情面板（case 列表 + attempt 详情 + request/response 查看）
```

### Phase 1: runner 上报 detail（不改 fs，只改回调数据）

**改动：** `EvalRunProgressEvent` 的 `run-done` 事件增加 `detail` 字段。

```typescript
// runner.ts — 不改任何文件写入
export interface EvalRunCaseAttempt {
  index: number;
  pass: boolean;
  reason: string;
}

export interface EvalRunCaseDetail {
  score: number;
  caseId: string;
  attempts: EvalRunCaseAttempt[];
}

// run-done 事件携带完整 detail
options.onProgress?.({
  type: "run-done",
  entry,
  detail: {  // ← 新增
    cases: details, // Record<string, EvalRunCaseDetail>
  },
});
```

**关键点：** runner 只产出数据，通过已有的 `onProgress` 回调传给 adapter。不碰文件系统。

### Phase 2: adapter 持久化

**IPC handler (`src/main/ipc/evals.ts`)** 的 `runEvalsInBackground`：

```typescript
const emitProgress = (event: EvalsRunProgressEvent) => {
  // run-done 事件：持久化 detail
  if (event.type === "run-done" && event.detail) {
    const runsDir = path.join(repoDir, "evals", "runs");
    fs.mkdirSync(runsDir, { recursive: true });
    const detailPath = path.join(runsDir, `${runTs}.json`);
    fs.writeFileSync(detailPath, JSON.stringify({
      version: 1,
      ts: entry.ts,
      provider: entry.provider,
      model: entry.model,
      runs: entry.runs,
      cases: event.detail.cases,
    }), "utf-8");
    // 把 detailRef 写回 entry（内存中）
    entry.detailRef = path.relative(repoDir, detailPath);
  }
  window.webContents.send(IPC_CHANNELS.EVALS_RUN_PROGRESS, event);
};
```

**CLI (`evals/run.mjs`)：** 同样在 onProgress 里持久化。

### Phase 3: IPC 读路径

**新增 channel：** `EVALS_READ_RUN_DETAIL`

**IPC handler：**

```typescript
ipcMain.handle(IPC_CHANNELS.EVALS_READ_RUN_DETAIL, async (_event, request) => {
  const repoDir = getRepoDir();
  const fullPath = path.join(repoDir, request.detailPath);
  if (!fs.existsSync(fullPath)) return { success: false, error: "File not found" };
  const detail = JSON.parse(fs.readFileSync(fullPath, "utf-8"));
  return { success: true, detail };
});
```

### Phase 4: UI 左右分栏

**模板结构：**

```vue
<div class="evals-runs-view">
  <!-- Run form (existing, unchanged) -->
  
  <div class="evals-runs-split">
    <!-- LEFT: Run History list -->
    <div class="evals-runs-list-panel">
      <h3>Run History</h3>
      <div v-for="(entry, idx) in store.results" 
           class="evals-result-row"
           :class="{ selected: selectedRunIdx === idx }"
           @click="selectRun(idx)">
        <span class="evals-result-date">{{ formatDate(entry.ts) }}</span>
        <span class="evals-result-provider">{{ entry.provider }}</span>
        <span class="evals-result-mean">{{ formatPct(entry.mean) }}</span>
        <span class="evals-result-detail">{{ entry.evalSetSize }} cases</span>
      </div>
    </div>
    
    <!-- RIGHT: Run Detail -->
    <div class="evals-runs-detail-panel">
      <template v-if="!selectedRun">
        <div class="evals-empty">Select a run to view details</div>
      </template>
      <template v-else-if="detailLoading">
        <div class="evals-loading">Loading...</div>
      </template>
      <template v-else>
        <!-- Case list -->
        <div v-for="cc in runCases" class="evals-run-case">
          <div class="evals-case-header">
            <span class="evals-case-name">{{ cc.caseId }}</span>
            <span class="evals-case-score">{{ formatPct(cc.score) }}</span>
          </div>
          <!-- Attempts -->
          <div v-for="a in cc.attempts" class="evals-attempt"
               :class="{ pass: a.pass, fail: !a.pass }">
            <span class="evals-attempt-icon">{{ a.pass ? '✓' : '✗' }}</span>
            <span class="evals-attempt-label">#{{ a.index }}</span>
            <span class="evals-attempt-reason">{{ a.reason }}</span>
            <button class="evals-attempt-snapshot-btn" 
                    @click="viewSnapshot(cc.caseId, a.index, 'request')">
              Request
            </button>
            <button class="evals-attempt-snapshot-btn"
                    @click="viewSnapshot(cc.caseId, a.index, 'response')">
              Response
            </button>
            <!-- Inline snapshot viewer -->
            <pre v-if="expandedSnapshot === cc.caseId + '-' + a.index"
                 class="evals-snapshot-json">{{ snapshotContent }}</pre>
          </div>
        </div>
      </template>
    </div>
  </div>
</div>
```

**样式（只用现有 theme token）：**

```
.evals-runs-split {
  display: flex;
  gap: 12px;
  margin-top: 16px;
}
.evals-runs-list-panel {
  width: 280px;
  flex-shrink: 0;
  border: 1px solid var(--settings-rule-soft);
  border-radius: 6px;
  background: var(--settings-paper-3);
  padding: 10px;
  overflow-y: auto;
  max-height: 500px;
}
.evals-runs-detail-panel {
  flex: 1;
  min-width: 0;
  border: 1px solid var(--settings-rule-soft);
  border-radius: 6px;
  background: var(--settings-paper-3);
  padding: 12px;
  overflow-y: auto;
  max-height: 500px;
}

/* Run row */
.evals-result-row {
  padding: 8px 10px;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.evals-result-row:hover {
  background: color-mix(in srgb, var(--settings-accent) 5%, transparent);
}
.evals-result-row.selected {
  background: color-mix(in srgb, var(--settings-accent) 12%, transparent);
  border: 1px solid var(--settings-accent);
}

/* Case card */
.evals-run-case {
  border: 1px solid var(--settings-rule-soft);
  border-radius: 5px;
  padding: 8px;
  margin-bottom: 8px;
  background: var(--settings-paper);
}
.evals-case-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 6px;
}
.evals-case-name { font-size: 13px; font-weight: 600; color: var(--settings-ink); }
.evals-case-score { font-size: 13px; font-weight: 650; color: var(--settings-accent); }

/* Attempt */
.evals-attempt {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 6px;
  font-size: 12px;
  border-radius: 3px;
}
.evals-attempt.pass { color: var(--ui-status-success-fg); }
.evals-attempt.fail { color: var(--ui-status-danger-fg); }
.evals-attempt-reason {
  flex: 1;
  color: var(--settings-ink-3);
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.evals-attempt-snapshot-btn {
  font-size: 10px;
  padding: 1px 6px;
  border: 1px solid var(--settings-rule);
  border-radius: 3px;
  background: var(--settings-paper);
  color: var(--settings-ink-3);
  cursor: pointer;
}

/* Snapshot viewer */
.evals-snapshot-json {
  font-family: ui-monospace, SFMono-Regular, monospace;
  font-size: 11px;
  line-height: 1.5;
  color: var(--settings-ink-2);
  background: var(--settings-paper);
  border: 1px solid var(--settings-rule-soft);
  border-radius: 4px;
  padding: 10px;
  max-height: 300px;
  overflow: auto;
  margin-top: 6px;
}
```

### 数据流（完整的）

```
User clicks Start Run
  → IPC: EVALS_RUN_START
    → main: runEvalsInBackground()
      → runner: runEvals()
        → onProgress({ type: "case-start", caseId })
        → onProgress({ type: "attempt-done", caseId, pass, reason })
        → onProgress({ type: "run-done", entry, detail: { cases: {...} } })  ← NEW
      → main: 收到 run-done →
        1. 写入 evals/runs/<ts>.json（detail 数据）
        2. entry.detailRef = "evals/runs/<ts>.json"
        3. 追加 results.jsonl（含 detailRef）
      → main: webContents.send(EVALS_RUN_PROGRESS, event)  ← 含 detail 数据

User 点击左侧 run → selectRun(idx) →
  → store.loadRunDetail(entry.detailRef) → IPC: EVALS_READ_RUN_DETAIL
  → 右侧渲染 case 列表 + attempt 详情

User 点击 attempt 行的 [Request] → 内联展开 JSON 快照
```

### 涉及文件清单（最终版）

| 文件 | 层 | 改动 |
| ------ | ----- | ------ |
| `packages/onething-runtime/src/evals/runner.ts` | runtime | `EvalRunProgressEvent` run-done 增加 `detail` 字段；收集 per-case-attempt 数据；不改任何 fs 操作 |
| `packages/onething-runtime/src/evals/model-call.ts` | runtime | `EvalModelCallOptions` 加 `metadata` 字段（只加类型，不改逻辑） |
| `src/shared/ipc/evals.ts` | shared | 新增 `EvalRunDetail` / `EvalRunCaseDetail` / `EvalRunCaseAttempt` / `EvalsReadRunDetailRequest/Response` 类型；`EvalRunResultEntry` 加 `detailRef` |
| `src/shared/ipc/channels.ts` | shared | 新增 `EVALS_READ_RUN_DETAIL` channel |
| `src/main/ipc/evals.ts` | adapter | `runEvalsInBackground` 收到 run-done 时持久化 detail JSON；新增 `EVALS_READ_RUN_DETAIL` handler |
| `src/main/ipc/evals-provider-adapter.ts` | adapter | `createEvalsModelCaller` 利用 metadata 写 request/response snapshot 到 `evals/runs/<runTs>/<caseId>/attempt-<n>.{request,response}.json` |
| `src/renderer/stores/evals.ts` | renderer | 新增 `selectedRunIdx`, `runDetail`, `loadRunDetail()`, `viewSnapshot()` |
| `src/renderer/components/settings/evals/EvalsRunsView.vue` | renderer | 重构为左右分栏；左侧 Run History 列表；右侧详情面板（case 列表 + attempt 详情 + request/response 展开） |
