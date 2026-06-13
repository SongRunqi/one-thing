# Tool UI 成熟化三套方案

日期：2026-06-10

本文基于 [TOOL_UI_AUDIT.md](./TOOL_UI_AUDIT.md) 的截图和代码审计，设计三套不同投入级别的 Tool UI 成熟化方案。三套方案不是互斥的：方案一适合作为近期基础改造，方案二适合作为中期统一体验，方案三适合作为面向重度开发工作流的高阶形态。

## 共同目标

无论选择哪套方案，都应该满足这些底线：

- 折叠态不再只显示 title：至少要能看到结果量级、最新流式状态或关键摘要。
- 流式输出要分清两类：参数流式生成和执行结果流式输出。
- `edit` / `write` / `read` / `bash` 要有一等体验，而不是落到普通文本面板。
- Batch/group 要展示真实耗时语义：区分 wall-clock duration 和子任务 duration sum。
- Hover 只改变字体/icon 颜色，不用大块背景，不改变字体大小、位置、布局。
- 展开箭头和文本靠左贴合，不能让文本在左、箭头跑到最右。
- Permission 等待态、执行态、完成态、失败态要是同一套视觉语言。
- 长命令不能完整塞进 title；但必须有稳定入口查看完整命令。
- 所有 panel 使用主题系统 token，避免 diff/edit/write 像外挂组件。

## 方案一：成熟 Timeline 增强版

### 定位

这是最稳的渐进方案。保留当前 `StepsPanel.vue` 的 timeline 结构和 inline details，只把信息层级、hover、arrow、summary、duration 做成熟。它适合快速改善当前体验，风险最小。

### 视觉结构

折叠态从“一行 title”升级为“主行 + 微摘要”：

```text
⌄  Edited StepsPanel.vue     +2 -1 · 860ms
   replacement applied · click to view diff

◌  Running make run          00:07
   [3/6] Linking onething

⚠  Edit StepsPanel.vue
   needs approval · preview diff available
```

展开态仍在消息内部展示：

```text
⌄  Edited StepsPanel.vue     +2 -1 · 860ms
   ┌───────────────────────────────┐
   │ diff / result / read / bash    │
   └───────────────────────────────┘
```

### 信息规则

每个 tool row 新增两个派生字段：

- `inlineMetric`：稳定短指标，例如 `+2 -1`、`14 lines`、`12 matches`、`3 results`。
- `inlineLiveSummary`：流式或完成摘要，例如最后一行 bash 输出、read 的首行、grep 第一条命中。

建议的数据形态：

```ts
interface ToolActivityView {
  inlineMetric?: string
  inlineLiveSummary?: string
  fullCommandAvailable?: boolean
  durationKind?: 'wall' | 'sum' | 'single'
}
```

### 各工具表现

| Tool | 折叠态显示 | 展开态显示 |
|---|---|---|
| `bash` | 命令短名 + 运行时长 + 最新 stdout/stderr 行 | 完整命令、线性日志、退出状态 |
| `read` | 文件名 + `N lines read` + 第一行或范围 | 文件内容，默认可以显示更多行 |
| `edit` | 文件名 + `+N -M` + replacement count | diff panel |
| `write` | 文件名 + `+N -M` 或 bytes/lines | write preview / diff |
| `grep` | pattern + `N matches` + 第一条命中 | 命中列表 |
| `glob/find/ls` | `N files` / `N entries` | 列表 |
| `web_search` | query + `N results` + fetch phase | web result renderer |
| `web_open/web_find` | host + page/match count | page/find result |
| `variable/todo_plan/time/project_dirs/skill/MCP` | action + target + short result metric | structured or generic result |

### 流式输出规则

1. 参数流式：
   - `edit/write` 继续保持现在的 synthetic diff。
   - `bash` 在命令参数未完整时显示 `Preparing command`；路径/命令可解析后显示短命令。
   - 其他工具显示 `Preparing <target>`，不要把未完成 JSON 尾巴塞进 row。

2. 执行结果流式：
   - Row 展示最新一条安全摘要。
   - Details 展示完整 partial result。
   - Bash row 每秒更新 duration，latest line 跟随 partial result 更新。

3. 完成后：
   - Row 保留最后摘要，不退回只有 title。
   - Details 保留完整结果。

### Batch/group 规则

当前 group duration 是子项求和。方案一改成：

- `wallDuration = max(endTime) - min(startTime)`，作为默认显示。
- `sumDuration` 仅在 tooltip/inspector 里显示。
- group row 增加状态摘要：
  - `3 edits · +5 -3 · 2.4s`
  - `4 commands · latest: Linking onething · 12s`

展开 group 后只展开子 row，不自动展开每个子详情。

### 交互细节

- Group hover：只让 chevron、summary text、meta 颜色变亮。
- Operation hover：同样只变 text/icon 颜色；只有 inspector/file open 小按钮保留局部 hover 背景。
- Arrow：group arrow 保持在左；operation row 的 details chevron 移到文本左侧或文本后紧邻位置。
- 点击：点击文字区域展开；点击文件名仍可 open file，但要保留视觉区分。
- 键盘：Enter/Space 保持展开；focus ring 保留。

### 需要改的文件

- `src/renderer/stores/helpers/tool-activity-view.ts`
- `src/renderer/stores/helpers/tool-step-view.ts`
- `src/renderer/components/chat/StepsPanel.vue`
- `src/renderer/components/chat/ToolResultRenderer.vue`
- `src/renderer/components/chat/ToolDiffPreview.vue`
- `src/renderer/components/chat/ToolStepDetails.vue`

### 成本与风险

- 成本：中低。
- 风险：主要是 row 文案和 layout regression。
- 优点：最快改善当前痛点，不改变信息架构。
- 缺点：仍然受限于消息内 inline details，复杂 tool workflow 会变长。

### 验收标准

- 折叠态 read 能看到 `N lines read`。
- 折叠态 bash running 能看到最新输出行和线性递增时间。
- edit/write 参数流式时仍能看到 diff preview。
- group hover 无背景块，文字/icon 变亮。
- operation arrow 不再跑到最右。

## 方案二：统一 Tool Card + Inspector 方案

### 定位

这是中期推荐方案。它把 tool row 抽象成统一的 `ToolCard`，消息内只显示成熟摘要；复杂内容进入 inline preview 或右侧 Inspector。它适合让所有 tool 变得一致，并解决 permission panel、diff panel、web result panel 风格割裂的问题。

### 信息架构

每个 tool call 有四层：

```text
Tool Row        始终在消息流里：状态、目标、摘要、duration
Inline Preview 轻量展开：最多 6-12 行，可快速确认
Inspector      完整详情：参数、结果、diff、日志、metadata
Permission Bar 操作决策：和 row 共享标题、状态、preview
```

### 视觉结构

消息内：

```text
┌ ToolCard compact ─────────────────────────────┐
│ ✓ Read StepsPanel.vue      18 lines · 420ms   │
│   120: const activeDiff = computed(...)       │
└───────────────────────────────────────────────┘

┌ ToolCard expanded preview ────────────────────┐
│ ⌄ Wrote audit.md           +42 -0 · 1.2s      │
│ ┌ diff preview, max 12 rows                   │
│ └ Open full diff in Inspector                 │
└───────────────────────────────────────────────┘
```

右侧 Inspector：

```text
┌ Tool Inspector ───────────────────────────────┐
│ Header: Wrote audit.md · completed · 1.2s     │
│ Tabs: Result | Args | Diff | Logs | Metadata  │
│ Full content                                  │
└───────────────────────────────────────────────┘
```

### 核心组件

新增或重构：

- `ToolCard.vue`
- `ToolCardHeader.vue`
- `ToolInlinePreview.vue`
- `ToolPermissionPanel.vue`
- `ToolInspectorContent.vue`
- `ToolSurface.vue`

`StepsPanel.vue` 负责 group 和排序，单个 tool 交给 `ToolCard`。

### 统一渲染协议

为每个 tool 构建统一 `ToolPresentation`：

```ts
interface ToolPresentation {
  id: string
  kind: 'file' | 'command' | 'search' | 'web' | 'state' | 'custom'
  status: ToolRenderStatus
  title: string
  target: string
  subtitle?: string
  metric?: string
  liveSummary?: string
  preview?: ToolPreviewBlock
  inspectorTabs: ToolInspectorTab[]
  actions: ToolAction[]
}
```

Preview block：

```ts
type ToolPreviewBlock =
  | { type: 'diff'; diff: ToolDiffData; maxRows?: number }
  | { type: 'log'; lines: string[]; latestLine?: string }
  | { type: 'read'; path: string; lines: string[]; totalLines: number }
  | { type: 'list'; items: string[]; total: number }
  | { type: 'web'; results: WebResultSummary[] }
  | { type: 'text'; text: string }
```

### Permission 体验

现在 permission action panel 在 composer 上方，和 timeline row 分离。方案二把它统一成 `ToolPermissionPanel`：

```text
⚠ Needs approval
Edit StepsPanel.vue
+2 -1 · preview diff
[Allow] [Session] [Workspace] [Reject] [Reject with instruction]
```

关键点：

- 和 row 使用同一个 `ToolPresentation.title/target/preview`。
- 对 `edit/write` 提供 inline diff preview。
- 对 `bash` 提供完整命令折叠块。
- permission panel 的 style 使用 `ToolSurface`，不再是单独 warning card。

### 各状态表现

| State | Tool row | Inline preview | Inspector |
|---|---|---|---|
| input-streaming | `Preparing` + partial target | edit/write 显示 streaming diff | Args tab 显示 partial args |
| awaiting permission | warning + needs approval | diff/command preview | Args/Diff 可查 |
| executing | spinner + duration + live summary | log/result tail | Logs 实时追加 |
| completed | check + metric + summary | compact final preview | full result |
| failed | error icon + reason | error snippet | full error + args/result |

### Batch/group 设计

Group 也是 `ToolCard`：

```text
⌄ 3 edits     +5 -3 · 2.4s wall · all completed
  ✓ StepsPanel.vue        +2 -1 · 860ms
  ✓ ToolResultRenderer.vue +1 -1 · 1.2s
  ✓ ToolDiffPreview.vue   +2 -1 · 1.4s
```

Group Inspector：

- Summary tab：每个 child 的状态/耗时/metric。
- Changes tab：聚合 diff。
- Timeline tab：真实开始/结束时间轴。

### Hover / click 设计

- Card hover 不整块铺背景；只在标题、chevron、action icon 上变亮。
- Action icon hover 可以有 20x20 局部背景。
- Card 选中态可以用左侧 2px rail 或 focus ring，避免大面积背景。
- 展开动画只作用于 preview 高度，header 不移动。

### 成本与风险

- 成本：中高。
- 风险：组件拆分和状态协议需要仔细迁移。
- 优点：长期一致性最好，permission/inspector/inline preview 能统一。
- 缺点：需要更多设计和测试投入。

### 实施阶段

1. 新建 `ToolPresentation` builder，不替换 UI，只跑单测。
2. 用 `ToolCard` 替换单个 operation row。
3. 把 read/bash/generic result 接入 inline preview。
4. 把 edit/write diff preview 接入 `ToolSurface`。
5. 把 permission panel 接入同一 presentation。
6. 重构 inspector tabs，复用 presentation tabs。

### 验收标准

- 每个 tool 的 row、permission panel、inspector title 一致。
- read/bash/web/search 在折叠态有结果摘要。
- permission panel 能直接看 edit/write diff 和 bash full command。
- group duration 显示 wall-clock，Inspector 可看子项 sum。
- 所有 panel 使用统一 `ToolSurface` token。

## 方案三：Tool Workbench / Run Console 方案

### 定位

这是最成熟、也最重的方案。它把工具调用从“消息里的小组件”升级为“可观察、可回放、可管理的运行工作台”。适合 onething 发展为复杂 agent desktop app：长任务、批量工具、并发命令、文件修改、web 搜索、后台 job 都能统一查看。

### 核心概念

消息流只展示简洁 narrative：

```text
Ran 4 tools · 2 files changed · 1 command still running
```

工具详情进入一个 Workbench：

```text
┌ Tool Workbench ──────────────────────────────────────────┐
│ Run #124 · 4 tools · 2.4s wall · 5.8s total              │
├ Timeline ────────────────────────────────────────────────┤
│ 0.0s edit StepsPanel.vue         +2 -1 completed          │
│ 0.4s bash make run               streaming                │
│ 1.2s read ToolResultRenderer.vue  88 lines completed       │
├ Detail ──────────────────────────────────────────────────┤
│ selected tool full log/diff/result/args                  │
└───────────────────────────────────────────────────────────┘
```

### 三栏结构

1. 左：Run list
   - 当前会话的每次 assistant turn / tool run。
   - 显示状态、工具数、文件改动数、耗时。

2. 中：Tool timeline
   - 子工具按真实 start/end 排列。
   - 支持 batch、parallel、sequential。
   - 支持过滤 failed/running/file changes/commands。

3. 右：Detail panel
   - diff/log/read/web/args/result。
   - 支持 sticky selection。
   - 支持复制、打开文件、打开 inspector、重试、展开完整日志。

### 消息内展示

消息内不再承担所有细节，只显示高度浓缩的 run summary：

```text
Tools
✓ 6 completed · 1 failed · 2 files changed · 14.2s
View run
```

对于很重要的工具仍可 inline：

- permission waiting
- failed
- destructive edit/write
- long-running bash

### 状态模型

需要把 tool execution 组织成 run：

```ts
interface ToolRun {
  id: string
  sessionId: string
  assistantMessageId: string
  status: 'running' | 'awaiting-permission' | 'completed' | 'failed' | 'cancelled'
  startedAt: number
  endedAt?: number
  wallDurationMs?: number
  sumDurationMs?: number
  tools: ToolPresentation[]
  aggregate: {
    completed: number
    failed: number
    running: number
    awaitingPermission: number
    filesChanged: number
    additions: number
    deletions: number
  }
}
```

### 流式表现

Run Console 是最适合解决线性输出的地方：

- Bash log 按行追加，不截断主数据，只在视图层虚拟滚动。
- Row 只显示 latest line。
- Detail panel 显示完整 log，可暂停 auto-scroll。
- Duration 显示 wall-clock，并提供每个 tool 的 own duration。
- Batch 可以展示并发条带：

```text
0s        2s        4s        6s
edit      ███
read       ██
bash       █████████████ still running
web                    ███
```

### Permission 设计

Permission 变成 run-level blocker：

```text
Run paused: 1 permission required
Edit src/main/engine/tool.ts
+12 -4
[Preview diff] [Allow once] [Allow workspace] [Reject]
```

消息内也显示同一个 blocker，但 Workbench 是主决策区。这样用户在复杂 batch 中知道“整个 run 为什么停住”。

### File changes 设计

把 `edit/write` 从普通 result 面板提升成 “Changes” 一级：

- run summary 显示 `2 files changed · +42 -8`。
- Workbench 有 Changes tab。
- 每个文件有 grouped diff。
- 支持查看 staged/unstaged 状态或 audit path。

### Hover / click 设计

Workbench 里 hover 更像开发工具：

- Timeline item hover：只让文字和左 rail 变亮。
- 选中态：左 rail + subtle outline，不铺整行背景。
- Chevron 和 label 靠左。
- 详情切换不移动 timeline 布局。

### 成本与风险

- 成本：高。
- 风险：需要新增 run-level store、UI、持久化或重建逻辑。
- 优点：最成熟，能承载长命令、并发 batch、复杂文件修改、后台任务。
- 缺点：短期不适合直接全量替换，容易超出当前改 UI 的范围。

### 实施阶段

1. 先不改消息 UI，新增 `ToolRun` 派生 store，从现有 message.steps/toolCalls 重建 run。
2. 在 Inspector 里增加 `Run` tab，显示 run timeline。
3. 为 bash log 增加虚拟滚动 detail view。
4. 为 file changes 增加 aggregate Changes view。
5. 消息内 `StepsPanel` 简化成 run summary + critical inline tools。
6. 最后再考虑独立 Workbench 面板。

### 验收标准

- 一个 assistant turn 的所有 tools 能聚合成一个 run。
- 可以看到 wall-clock timeline 和每个 tool duration。
- Bash 长输出按行流式追加，详情面板不卡顿。
- Batch 并发/串行状态可区分。
- Permission 阻塞能在 run 层清晰表达。
- 文件改动可按 run 聚合查看。

## 三套方案对比

| 维度 | 方案一：Timeline 增强 | 方案二：Tool Card + Inspector | 方案三：Workbench |
|---|---|---|---|
| 投入 | 中低 | 中高 | 高 |
| 风险 | 低 | 中 | 高 |
| 对现有架构影响 | 小 | 中 | 大 |
| 折叠态信息 | 明显改善 | 系统化改善 | 由 run summary 承担 |
| 流式结果 | Row tail + details | Row + preview + inspector | 专业 log/timeline |
| Batch | 改 duration 和摘要 | group card + inspector | run timeline |
| Permission | 对齐 panel 文案/preview | 统一 permission card | run-level blocker |
| 适合阶段 | 近期 | 中期 | 长期 |

## 推荐路线

建议采用组合路线：

1. 近期先做方案一。
   - 解决最明显痛点：折叠态没内容、hover 不成熟、箭头位置、duration 语义。
   - 可以直接用当前截图 harness 做回归。

2. 中期演进到方案二。
   - 引入 `ToolPresentation` 和 `ToolCard`。
   - 把 permission、inline preview、inspector 统一。

3. 长期按需建设方案三。
   - 当长任务、后台任务、并发 batch、复杂文件改动变多时，再做 Workbench。
   - 不建议一开始就全量做方案三。

## 第一阶段落地清单

如果马上进入实现，建议先切下面这些任务：

1. `ToolActivityView` 增加 `inlineMetric`、`inlineLiveSummary`、`durationKind`。
2. `StepsPanel.vue` 调整 row layout：chevron 靠左，action icon 不占据最右主视觉。
3. 去掉 `.group-header:hover` / `.operation-row.has-details:hover` 的整块 background。
4. 为 `bash` running row 显示 latest output line。
5. 为 `read/search/list/web` completed row 显示结果数量。
6. group duration 改 wall-clock，sum duration 进 tooltip/inspector。
7. diff/read/bash/generic panel 抽出共享 `ToolSurface` 样式。
8. 更新 `docs/tool-ui-audit` harness，新增 row live summary 截图用例。

