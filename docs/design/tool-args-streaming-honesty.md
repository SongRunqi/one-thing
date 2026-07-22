# 工具参数流式呈现真实化（Tool-Args Streaming Honesty）

> **实施状态（2026-07-20）**：P0-P3 + P5 已全部落地，全量测试 3848/3851 绿（余 2 例为本分支 TabBar/Sidebar 改版遗留的 ui-token 失败、1 例 file-mutex 偶发）。P4 未实施（按计划后置）。与设计的偏差见文末「实施偏差记录」。

> 背景事故：edit 卡片显示 RUNNING、参数预览"看着已经齐全"、角标 `~+3 / −2`，实际上工具尚未执行——模型（deepseek-v4-pro, reasoning_effort=max）还在生成参数尾部（第 2、3 处 edit + 排在 JSON 末尾的 path）。整轮 17s 里绝大部分是生成时间，执行本身毫秒级。
>
> 定案原则：**卡片上的每个元素都必须可追溯到一个真实发生的事件**。凡是推测、预估、未定的内容——要么不显示，要么显式标注为"未完成"。不接受任何"看着齐全、实际还在接收"的状态。

---

## 0. 现状问题清单（真实性缺口盘点）

| # | 缺口 | 位置 |
| --- | --- | --- |
| G1 | `RUNNING` 徽标合并了四个真实阶段：接收中 / 参数已齐待执行 / 等待授权（`ask()` 在执行内部阻塞，无独立状态）/ 执行中 | `ToolStepDetails.vue:181-182`（`streaming-input` 与 `executing` 同渲染）；权限等待期无任何状态事件 |
| G2 | 预览把部分参数渲染成"已定稿文档"：容错提取 + 正常排版，无游标、无未完成标记 | `tool-step-view.ts:562-597`（`getStreamingContentSource`/`extractStreamingStringValue`）、`:357-380`（`parseStreamingPreviewLines`） |
| G3 | `~+N / −M` 预估行数 = 假 diff | `tool-step-view.ts:321-334`（`getStreamingChangeStats`）、`ToolStepDetails.vue:193-201` |
| G4 | 标题文件名来自对部分参数的容错提取；path 在 JSON 尾部时长期缺失或提取到半截路径 | `tool-step-view.ts:277-313`（`getToolFilePath`） |
| G5 | 同轮第 2..n 个工具的 start/delta 被 runner 的 `activeToolCallId` 缓冲，UI 完全不可见——另一种"看到的 ≠ 实际的" | `packages/core/agent-loop/runner.ts:207-240`；`docs/agent-loop-investigation.md` §7 |
| G6 | `tool-call-done` 的流末兜底：参数始终解析不完整时，"接收中"会静默挂到 SSE 流结束 | `openai-compatible.ts:451-455`、`deepseek.ts:341-343` 等各 adapter 尾部循环 |
| G7 | UI 状态翻转点靠前端自己猜（参数解析完整性），而不是后端事件；`tool-input-end` 是隐式合成的 | `packages/core/engine/stream-processor.ts` 输入流状态机 |

---

## 1. 目标状态机（唯一事实来源）

工具卡片状态由**后端事件**驱动，每个翻转点对应一个真实事件，前端不做任何推断：

```
tool-input-start ──► RECEIVING（接收中，呼吸动画 + 游标 + 字节计数）
tool-input-end   ──► RECEIVED（参数完整；若在排队则显示 QUEUED）
tool-execution-phase{waiting-permission}
                 ──► WAITING APPROVAL（与现有 awaiting-confirmation 语义合并呈现）
tool-execution-phase{executing} / tool-execution-start
                 ──► RUNNING（真正执行中）
tool-result      ──► OK / FAILED / REJECTED / CANCELLED
```

图中状态名是**呈现层标签**；wire 状态值不改名（见 Phase 1）。`QUEUED` 徽标在 P4 前不可见（P0-P3 的串行 runner 下 `received → executing` 零间隙），归属 P4 交付。

配套阶段时间戳（step 上新增）：`startedAt`（input-start）/ `receivedAt`（input-end）/ `execStartAt` / `endTime`。
卡片可展示真实分段耗时：`接收 12.3s · 执行 0.1s`——把"等待的是谁"显性化。

**删除项**：`~+N/−M` 预估行数整体移除（`getStreamingChangeStats` 及调用点、`isFigGainPredicted`）。行数只在真实 diff 落地后显示，无波浪号语义。

---

## 2. 分期总览

| Phase | 内容 | 层 | 依赖 |
| --- | --- | --- | --- |
| 0 | 事件契约统一：全部注册 adapter 强契约（名单按 factory 盘点）+ 显式 `tool-input-end` + `tool-execution-phase` 事件 + 多宿主管道清单 | core/agent-loop、adapters、runner、ipc-bridge、apps/server | 无 |
| 1 | 状态模型拆分：`receiving / received / waiting-approval / executing` + 阶段时间戳 + 重建语义 | shared types、core stream-processor、chat store | P0 |
| 2 | 增量结构化参数解析器：字段三态（closed / open / absent），O(delta) 推进 | core（renderer 可共用） | 无（可并行） |
| 3 | 卡片呈现改造：徽标分相、游标、字节计数、字段占位、删假 diff | tool-step-view、ToolStepDetails、StepsPanel | P1+P2 |
| 4 | 同轮多工具可见性：解除 UI 事件抑制（执行仍串行），后续工具以 RECEIVING/QUEUED 卡呈现；**QUEUED 徽标首次可见于此期** | runner | P1；风险独立评估 |
| 5 | 围栏测试：adapter 契约、解析器 property 测试、"诚实性"断言 | 测试 | P0-P3 |

P0-P3 构成闭环（单工具卡完全诚实）；P4 解决多工具"突然冒出"，可后置。

---

## 3. 分期细节

### Phase 0 — 事件契约（adapter + runner）

1. **adapter 统一强契约**——对象以 `providers/factory.ts` 实际注册名单盘点后写死（当前独立实现：claude / openai-compatible / deepseek / gemini / codex；openai-compatible 的派生配置不单独计数，但共享同一套契约测试夹具）：
   - `tool-call-start`：工具 id+name 可知即发；
   - `tool-call-delta`：实时透传，**禁止批量缓冲**；
   - `tool-call-done`：参数 JSON 完整可解析的瞬间发（`isCompleteAgentToolArguments` 早发已存在于 openai-compatible/deepseek，补齐到全部 adapter 并加围栏测试）；
   - done 事件附 `finalizedBy: 'parse' | 'stream-end'`——流末兜底路径打标，下游可对 `stream-end` 落败的参数给出准确错误呈现（G6）。
2. **runner 显式发 `tool-input-end`**：在消费 `tool-call-done` 时立即向 EventQueue 发带 `receivedAt` 时间戳的 input-end，UI 状态翻转点从"前端解析推断"改为"后端事件"（G7）。
3. **新增 `tool-execution-phase` 事件**：`{ toolCallId, phase: 'waiting-permission' | 'executing', at }`。由执行链路在 `enforcePermissionPolicy` 进入 `ask()` 前、及真正开始执行副作用时发出（G1 中权限等待期显性化）。
4. **多宿主事件管道清单**——新增事件（`tool:input-end`、`tool-execution-phase`）必经五处，缺一处即在对应宿主静默缺失：
   - `src/shared/events/session-events.ts` 类型定义（现词汇表只有 `tool:input-start` / `tool:execution-start`，两个事件都是全新的）；
   - 发射端：runner / 执行链路 → stream-runtime → engine emitter；
   - `src/main/bridges/ipc-bridge.ts` 路由 + EventBus ring buffer 重放（断线重连 / 切会话回放必须携带新事件）；
   - renderer `chat.ts` 消费（与 `pendingToolInputDeltas` 合帧路径协同：input-end 到达时先冲洗未应用的 delta 再翻状态，防止游标残留）；
   - **apps/server 事件转发（headless/web 宿主）**——三套装配历史上最易漏的一处。验收标准：web 端与 electron 端的状态翻转序列一致。

### Phase 1 — 状态模型

1. `ToolCall.status` 扩展——**wire 值不改名**：`input-streaming` 保留原名（非测试代码 18 处引用 + 流重放/持久化残留，改名是无收益兼容债）；仅新增 `received`（参数完整、尚未执行）与 `waiting-approval`（由 phase 事件驱动）；`executing` 保留。`RECEIVING`/`QUEUED` 等只是呈现层标签，wire→标签映射收敛在 view 层一处（`tool-step-view.ts`）。shared 类型、core stream-processor、chat store（`chat.ts:642` streamingArgs 累积处）、持久化 timeline 同步**新增值**。
2. **重建语义**：timeline 重建 / 应用重启时，残留 `receiving`/`received` 的孤儿卡一律落 `cancelled`（扩展现有流收尾兜底），不允许诚实状态在重建后变成谎言。
3. 阶段时间戳持久化到 step，历史回看也能看到分段耗时。

### Phase 2 — 增量结构化参数解析器（呈现真实化的核心）

放 `packages/core`（renderer 与将来 headless 共用），替换现在的正则容错提取：

```ts
interface StreamingFieldState {
  path: string            // 'edits[1].newText'、'path'
  state: 'closed' | 'open' | 'absent'
  value: string           // 已收到的解码内容（open 时为前缀）
}
interface StreamingArgsView {
  fields: StreamingFieldState[]
  openField: string | null      // 当前正在流入的字段，游标挂载点
  charsReceived: number
  parseError?: string           // finalizedBy=stream-end 落败时回填
}
```

- **增量推进**：解析器保存内部栈状态（在哪个对象/数组/字符串里、转义态），每次只消费新增字节，O(delta)，不随参数总长退化（大参数高频 delta 下的性能约束）。
- **三态判定**：字段值的闭合引号/括号已到 = `closed`；键已出现值未闭合 = `open`；schema 必填但键未出现 = `absent`。
- **schema 来源**：工具 registry 已有 JSON schema，required 字段清单直接取用，驱动 `absent` 占位。

### Phase 3 — 卡片呈现

1. **徽标分相**（`figStatus`）：`RECEIVING`（live 呼吸）/ `WAITING APPROVAL`（与现有 NEEDS APPROVAL 语义合并）/ `RUNNING` / `OK` / `FAILED`…。`RUNNING` 从此只意味着"工具代码正在跑"。`QUEUED` 徽标不在本期——每个徽标必须在其首次可见的 phase 交付并可测，串行 runner 下该状态 P4 前不存在。
2. **RECEIVING 期的诚实呈现**：
   - `closed` 字段正常排版；`open` 字段末尾挂**流式游标**（组件化：复用聊天正文的流式光标组件，不新造）；
   - `absent` 必填字段渲染占位行：`path ─ 等待中`；标题在 path 闭合前显示工具名，**不显示半截文件名**（G4）；
   - 角标区替换假 diff 为真实计数：`接收中 · 1,167 字符 · 8.2s`（delta 驱动实时跳动）；
   - 数据静默 > 3s 追加提示 `Ns 未收到数据`——上游卡顿同样显性化，与模型慢速可区分地如实呈现。
3. **翻转瞬间**：input-end 到达 → 游标消失、占位消失、字节计数定格、徽标翻 `RUNNING`（P4 后同轮排队场景为 `QUEUED`）。用户看到的翻转点 = 真实接收完成点。
4. **删除**：`getStreamingChangeStats`、`isFigGainPredicted`、`~` 前缀渲染，及对应测试。

### Phase 3.5 — edit 卡片专属呈现规范

edit 的参数本质是"未来的 diff"，是最容易被误读成定稿的工具，单独定规范。核心：**草稿态与定稿态是两个视觉形态，不可混淆**。

**草稿态（RECEIVING，按解析器三态逐字段渲染）**：

```
01 edit                                   RECEIVING · 843 字符 · 6.2s
┌ EDIT · RECEIVING ────────────────────────────────────────────┐
│ path ─ 等待中                                                 │   ← absent 占位（path 常在 JSON 尾部）
│                                                               │
│ 替换 1                                                        │   ← edits[0] 两个字符串均已闭合
│   FIND     | Athens | English_UK | Idea | …                   │
│   REPLACE  | Athens | English_UK | Idea | NewService…         │
│                                                               │
│ 替换 2 · 接收中                                               │   ← edits[1].oldText 仍是 open
│   FIND     iva_config_insert("LA", '*', '*', 'Other'▌         │   ← 游标挂在真实字节末尾
│                                                               │
│ ⋯ 数组未闭合，可能还有后续替换                                  │   ← edits 的 ] 未到达
└──────────────────────────────────────────────────────────────┘
```

规则：

1. **视觉基调**：草稿态整体降调渲染（虚线框/淡墨，沿用画线风的"未定稿"语言），无 diff 着色、无行数角标。定稿 diff 的着色与 `+N/−M` 是执行完成后独占的视觉资产。
2. **逐条目三态**：`edits[i]` 的 FIND 段在 `oldText` 闭合后才以定稿排版出现；`REPLACE` 标签在 `newText` 键出现后才出现；当前 open 的字符串末尾挂流式游标（复用聊天正文光标组件）。解析器不假设 oldText/newText 顺序。
3. **数组未闭合必须显性**：`edits` 的 `]` 未到达时，恒显尾行「⋯ 数组未闭合，可能还有后续替换」。这是本次事故的直接对症——用户看到一段完整替换就以为齐了，实际后面还有两处在流。
4. **path 占位**：`path`/`file_path` 未闭合时显示 `path ─ 等待中`，标题只显示 `edit` 不显示文件名；闭合瞬间标题落文件名。
5. **单串形式**（`old_string`/`new_string`）按同规则视作一条替换渲染。
6. **长内容截断**是纯呈现层的 clamp（保留现有折叠交互），右上角字符计数始终是权威真值，不因截断失真。

**翻转（tool-input-end）**：游标、占位行、"数组未闭合"尾行全部消失，条目计数定格（「3 处替换 · 已接收」），徽标翻 `RUNNING`（P4 后同轮排队场景为 `QUEUED`）。

**定稿态（执行成功）**：草稿整体被真实 diff 视图替换（现有 `view.diff` 渲染链），着色 + 准确 `+3 / −2` 此刻才出现。失败/拒绝保留草稿内容 + 错误块，便于对照模型原始参数排错。

### Phase 4 — 同轮多工具可见性（独立风险评估后实施）

- runner 的 `activeToolCallId` 缓冲**只解除 UI 事件抑制**：兄弟工具的 start/delta 照发 EventQueue，卡片以 `RECEIVING`→`RECEIVED`+`QUEUED` 呈现；**执行仍严格串行，时序语义不动**。
- 风险清单（来自 `docs/audit/tool-system-concurrency-audit-2026-07-16.md`）：权限 UX 单卡假设、`buildResumeHistoryAfterToolConfirmation` 的兄弟工具终态假设、`runner.test.ts:88-148` 锁死的串行语义需重写。若暂不做，同轮后续工具依旧"执行完前一个才冒出"，但每张卡自身已诚实。

### 适用范围矩阵（哪些工具卡在契约内）

本设计不覆盖所有工具卡。不在契约内的卡**禁止渲染草稿态元素**（伪造 RECEIVING 同样违反诚实原则）：

| 工具卡类别 | 字节级 delta | 草稿态（三态解析） | 状态机分相 | 说明 |
| --- | --- | --- | --- | --- |
| 内置工具（edit / write / bash / read…） | ✅ | ✅（edit/write 走 Phase 3.5 结构化排版，其余走 generic 字段渲染） | ✅ 完整 | 完整契约 |
| MCP 工具 | ✅ | generic 渲染：字段三态 + 游标 + 计数，无专属排版；required 清单取自 MCP schema，**无 schema 时仅游标 + 计数、无 absent 占位** | ✅ 完整 | schema 质量参差是常态，不做启发式猜测 |
| codex 原生工具（整包参数路径） | 可能一次性到达 | RECEIVING 一闪而过或不出现 | ✅ 完整 | 正常现象（盲点 §4-4） |
| 外部 agent 工具卡（ACP `externallyExecuted`） | ❌ 无字节流 | ❌ 不适用 | 部分：仅 RUNNING / 终态（沿用 ACP 结构化事件映射） | 不得伪造 RECEIVING；分段耗时仅显执行段 |
| 无参数流的生成类（图像生成等） | — | — | 执行分相适用 | 权限/执行阶段事件照常 |

### Phase 5 — 围栏测试

1. **adapter 契约测试**：按 Phase 0 盘点名单逐家喂固定 SSE 夹具 → 断言事件序列：done 紧跟参数完整点、delta 无批量、兜底路径带 `finalizedBy: 'stream-end'`。
2. **解析器 property 测试**：同一份参数在任意字节切分点增量喂入，最终视图 ≡ 一次性解析；任意前缀下三态判定正确。
3. **诚实性断言（本设计的核心围栏）**：对任意事件前缀重放，view 中渲染为"定稿"的内容必须是真实已收字节的投影；`status === 'receiving'` 时视图必含游标或计数元素；矩阵外的卡不含任何草稿态元素。防止未来改动悄悄退回"部分当定稿"。
4. **将碎测试清单**（动手前先改判例，防"改一处漏一处"）：
   - **P3 落地即碎**：`src/renderer/stores/__tests__/tool-step-view.test.ts`、`steps-panel-runs.test.ts`、`tool-activity-view.test.ts` 中锁死 `getStreamingChangeStats` 预估行数与现有 streaming preview"定稿式"渲染行为的断言；`ToolStepDetails` 相关快照。
   - **P0 可能碎**：各 adapter 现有流测试对事件顺序的宽松断言（应收紧为契约断言，而非放宽通过）。
   - **P4 落地必碎**（并发审计已标记）：`packages/core/agent-loop/__tests__/runner.test.ts:88-122`（串行输入流缓冲）、`:124-148`（确认时不启动后续工具）——按新语义重写，不是删除。

---

## 4. 已知盲点与边界（如实声明）

1. **无法显示进度百分比**。流式协议不预告参数总长，能承诺的只有"仍在接收 + 已收多少 + 耗时"，永远给不出"还剩多少"。
2. **诚实化不等于变快**。这轮 17s 的本体是模型生成速度（effort=max + 大段中文参数）。缩短实际等待是另一条线，且都是概率性优化，不属于本设计的一致性保证：
   - schema 字段顺序引导：path 放 properties 首位，模型大概率先吐 path → 标题早出；
   - 提示词约束大参数工具：多处修改拆多次小 edit 调用；
   - 笔记编辑场景降低 reasoning effort 档位。
3. **游标 ≠ 模型正在写这个字段**。上游 relay 卡顿与模型慢速在客户端不可区分，只能用「Ns 未收到数据」如实呈现，不能断言原因。
4. **codex 原生工具可能整包给参数**（`codex.ts` emitFunctionCall 的非流式路径）：RECEIVING 一闪而过、卡片直接 QUEUED，是正常现象而非 bug。
5. **流末兜底消除不了**（G6 只能显性化）：参数始终无法解析完整时，RECEIVING 挂到流结束、以解析错误落败——这个尾巴只能被看见，不能被避免。
6. **Phase 4 有真实改造风险**，故独立分期；P0-P3 先行闭环。

### 4.1 edit 卡片呈现（Phase 3.5）的专属盲点

1. **草稿态"定稿排版" ≠ 会执行成功**：字段闭合只保证接收完整，FIND 能否匹配要执行才知道（实锤：2026-07-20 日志中 `Could not find edits[14]` 整轮失败）。草稿承诺的是传输层真实，不是结果预告；草稿降调的视觉语言同时承担这层提示。
2. **快速四连翻**：edit 执行毫秒级，RECEIVING→QUEUED→RUNNING→OK 可在 100ms 内连翻。定案：**终态立即上屏，中间态允许合并跳过**（跳过≠伪造，事件均真实发生）；不引入"最小驻留"——那会让 UI 落后真实状态，违反本设计原则。
3. **转义边界**：open 字符串的解码前缀可能停在 `\n`/`\uXXXX` 半截，解析器须扣住不完整转义不输出；半行内容渲染防抖沿用流式表格围栏状态机经验。
4. **「数组未闭合」须泛化为「对象未闭合」**：单串形式无数组；顶层 `}` 未到前"可能还有更多字段"恒为真。absent 占位只表达"schema 约定该来"，不保证会来（模型可能吐非 schema 字段或漏必填）。
5. **每 delta 重排的抖动**：解析 O(delta)，但 clamp 高度变化在虚拟滚动里会抖；rAF 合帧 + 草稿区固定高度策略（复用离屏 clamp / deferredMarkdownHydration 经验）。
6. **历史数据降级**：旧 step 无阶段时间戳/接收快照，回看时草稿态不出现、分段耗时缺失——正确行为，但禁止渲染「接收 0.0s」类假数字；失败卡保留的大段草稿参数计入 clamp 渲染预算。

---

## 5. 实施偏差记录（2026-07-20 落地时定案）

实现与设计原文的差异，均为等效或更收敛的做法：

1. **`finalizedBy` 实现在共享 chunk 层**（`packages/core/agent-loop/provider-stream.ts`），不是逐家 adapter：该层已对全部 provider 做「参数 JSON 完整即发 tool-input-end」的归一（`emitToolInputEndOnCompleteJson` 默认开），单点打标覆盖所有 adapter。取值为 `'parse' | 'provider-done'`（`provider-done` 统一涵盖流末批量与整包参数两种非流式判定路径）。
2. **`tool:input-end` 由 stream-processor 发射**：`handleToolCallComplete`（新方法，parse 路径经 `handleToolInputEnd`、fallback 路径经 executor 调用，两路收敛单点）盖 `receivedAt`/`argsFinalizedBy` 并置 `status='received'`。阶段时间戳落在 **ToolCall** 上（`receivedAt`；执行起点沿用既有 `startTime`），不在 step 上另存——step.toolCall 镜像即持久化。
3. **`tool-execution-phase` 事件取消**：核查发现权限等待期已有真实事件覆盖——`permission:request` 到达时 renderer 的 `applyPermissionRequest` 将卡片置为 `awaiting-confirmation` 呈现态（NEEDS APPROVAL）。G1 的「权限等待伪装 RUNNING」缺口由既有机制闭合，无需新事件与新 wire 状态；`waiting-approval` 从状态机中移除。
4. **wire 状态仅新增 `received`**；解析失败（G6）落地为：input-end 解析失败时占位卡直接置 `failed` 并发 `tool:call`，不再静默挂 RECEIVING。
5. **absent 占位未走 schema 驱动**：file 工具的 path 必填硬编码（`pathPending`），generic/MCP 卡按矩阵约定只呈现「已到字段三态 + 游标 + 计数」。
6. **孤儿卡清理顺带扩容**：timeline sanitize 原本只清 `executing/pending`，现将 `input-streaming/received/queued` 一并落 `cancelled`（修复既有缺口：受击溃的 receiving 卡曾能在重启后永久假活）。
7. **渲染护栏**：open 字段超 4000 字符只渲染尾部并显式标注「前 N 字符已收（省略显示）」；接收时钟以 toolCall.timestamp（input-start）为零点，静默 >3s 显示「Ns 未收到数据」。
8. **围栏测试落点**：chunk 层契约（含「done 必须紧跟补齐字节、先于后续事件」断言）在 `src/main/agent-loop/__tests__/provider-stream.test.ts`；解析器 property（任意切分点等价）在 `packages/core/engine/__tests__/streaming-args.test.ts`；诚实性围栏（任意前缀投影）在 `src/renderer/stores/__tests__/tool-args-honesty-fence.test.ts`。
