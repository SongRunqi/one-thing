# Tool UI 重构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 tool 调用的显示组件收敛为一套产品级、可控的 UI 体系：单一渲染路径、单一数据源、一致的交互契约。

**Architecture:** 以 `ToolActivityView` 为唯一行级视图模型、`StepsPanel` 为唯一时间线渲染器；新增 `tool-ui-registry.ts` 作为「工具 → 分类/动词/标签/渲染方式」的唯一登记表；删除 `ToolCallItem`/`ToolStepItem` 旧卡片体系。

**Tech Stack:** Vue 3 + TypeScript + Pinia + Vitest（现有栈，无新依赖）

---

## 第一部分：问题清单（审查结论）

以下编号在任务中引用为 P1…P16。

### A. 双渲染体系（结构性问题）

- **P1 两套并行的 tool 行 UI。** `MessageBubble.vue:231-263` 对「还没有 step 的 streaming tool call」走 `ToolCallItem → ToolStepItem`（带状态圆环图标、脉冲动画的卡片），对「有 step 的」走 `StepsPanel`（动词+目标的分组时间线）。同一个工具调用在流式过程中会**从一种视觉体系跳变到另一种**。两套体系的字体、布局、点击行为全部不同。
- **P2 合成 Step 的脆弱适配层。** `ToolCallItem.vue:36-59` 手工伪造一个 `Step` 喂给 `buildToolStepView`；`tool-step-view.ts:76-131` 的 `buildSyntheticToolCall` 用字符串启发式解析 step title（`"read "`、`"Tool:"` 前缀等）反推工具名和参数。

### B. 交互契约不一致 / 虚假可供性

- **P3 点击行为不一致。** `ToolStepItem.onMainClick`（`ToolStepItem.vue:116-129`）点击行 → 打开右侧 Inspector 到某个 tab；`StepsPanel` 的行点击 → 原地展开详情。长得一样的行，行为完全不同。
- **P4 死契约 + 死样式。** `ToolStepItem` 声明了 `expanded` prop、`toggle-expand`/`confirm`/`reject` emits，但模板里既没有详情区也没有确认按钮；`.confirm-buttons`/`.btn-reject`/`.expand-icon`/`.tool-step-details`/`.diff-meta*` 约 200 行 CSS 全部是死代码。
- **P5 open-file 是视觉谎言。** `StepsPanel` 声明 `open-file` emit 但模板从不 emit；`canOpenFile` 的行给文件名加了 `file-link` 配色和完整路径 title，暗示「可点开文件」，实际点击只是切换展开。`MessageBubble` 往上接好的 `@open-file` 整条链路收不到任何事件。
- **P6 confirm/reject emit 链路废弃但未删。** `StepsPanel`/`ToolCallItem`/`MessageBubble` 逐层声明并转发 confirm/reject，但时间线上没有任何按钮触发它们。真正的审批 UI 在 `ChatPanel.vue:32-90` 的 permission panel + 键盘快捷键。时间线行显示 "needs approval:" 却没有任何就地操作入口，与 panel 也没有视觉关联。
- **P7 重复点击处理器。** `StepsPanel.vue:50-59`（及 grouped 分支 173-181）`node-target` 上有 `@click.stop` 调 `toggleActivityExpanded`，和外层行的 `@click` 是同一个动作——stop 之后再做同样的事，纯冗余。
- **P8 失败信息显示不一致。** 单条视图 `errorSummary` 永远显示（`StepsPanel.vue:79-88`）；分组视图里只有展开后才显示（`:200` 有 `&& isGroupActivityExpanded`）。折叠的分组里失败被吞掉，只能从 group 标题的 "N failed" 推断。
- **P9 展开状态在分组形态变化时丢失/变义。** 三个独立的展开 map（`groupExpandedMap` / `expandedActivitiesMap` / `expandedGroupActivitiesMap`）。流式过程中同类工具从 1 个变 2 个时，渲染从 single 分支切到 grouped 分支：默认展开规则从 `activity.defaultExpanded` 变成「一律收起」，用户手动展开的状态也换了存储 map，直接丢失。
- **P10 运行时长不走表。** `StepsPanel.vue:269` `durationNow = ref(Date.now())` 从未更新（没有 interval），executing 中的工具时长冻结在组件挂载那一刻。

### C. 逻辑重复、散落（「难管理」的根源）

- **P11 工具名 → 分类映射至少 4 份且已漂移。** `tool-display.getFileToolCategory`、`StepsPanel.getToolCategory`（多了 search/web 名单）、`ToolStepItem.onMainClick`（又一份 web 名单 + tab 映射）、`tool-preview.formatArgsSummary` 的 switch 分支。新增一个工具要改 4+ 个文件。
- **P12 动词表两套。** `tool-display.ts` 的 `TOOL_VERBS` 体系（"Read/Reading/Read"）与 `StepsPanel` 的 `getGroupVerb/getCompletedGroupVerb/getBaseGroupVerb`（"Read/Reading/Read" 另写一遍）并存，失败措辞也不同（`buildToolVerb` 产出 "Failed read"，`getSingleActivityVerb` 产出 "Read failed:"）。
- **P13 状态标签两份逐字相同的拷贝。** `tool-activity-view.buildStatusLabel` 与 `StepsPanel.getStatusLabel` 完全相同的 switch。
- **P14 失败文案/下一步动作两套且措辞分叉。** `tool-activity-view.buildErrorSummary/buildNextAction`（行级）与 `ToolStepDetails.vue` 的 `errorSummary/errorNextAction` computed（详情级）逻辑重复、文案不同。展开一个失败的工具会同时看到两段不同口径的失败描述。
- **P15 stats 字符串往返。** `buildStats` 把 additions/deletions 格式化成 `"+a -d"` 字符串，`getGroupStats` 再用正则把自己的显示格式解析回数字求和。
- **P16 视图模型层的性能/状态问题。** ① `buildDetailedToolStepView(activity)` 直接写在模板里，展开项在流式期间每次 re-render 都重建（内部含多次 `JSON.parse`）；② `getDiffFromStep` 对同一 step.result 在 `buildToolStepView`/`buildToolActivityView`/`buildStats` 中重复 parse 3 次；③ `tool-step-view.ts:68` 模块级 `streamingContentCache` 全局可变状态，没有按 session 清理，也是测试间状态污染的隐患（全量测试与单文件测试结果不一致已实际发生过一次）。

### 非目标

- ❌ 不重做视觉风格（保留现 StepsPanel 的时间线设计语言）。
- ❌ 不动主进程 tool 协议 / Step、ToolCall 类型。
- ❌ 不动 ChatInspectorPanel 内部（只修与时间线的联动入口）。
- ❌ FartCallItem 保持原样（自成一体的彩蛋组件）。

---

## 第二部分：目标文件结构

```
src/renderer/stores/helpers/
  tool-ui-registry.ts        # ★新增：工具→{category, verbs, inspectorTab} 唯一登记表 + 状态标签
  tool-status.ts             # 不变
  tool-preview.ts            # 行预览文本（改为从 registry 取名单）
  tool-step-view.ts          # 详情视图模型（瘦身：path 名单等收口 registry；cache 可清理）
  tool-activity-view.ts      # ★唯一行级视图模型（stats 数字化、错误文案唯一来源）
  tool-display.ts            # 只剩 buildToolPermissionTitle 等权限标题（动词表迁入 registry）

src/renderer/components/chat/
  StepsPanel.vue             # ★唯一时间线渲染器（交互契约统一，文案逻辑全部来自 helpers）
  ToolActivityDetails.vue    # ★新增：薄包装，memoize 详情视图模型（修 P16①）
  ToolStepDetails.vue        # 复用行级失败文案（修 P14）
  ToolResultRenderer.vue     # 不变（已有 renderKind dispatch）
  ToolCallItem.vue           # ★删除
  ToolStepItem.vue           # ★删除
  message/MessageBubble.vue  # streaming tool call 也走 StepsPanel（修 P1）
```

---

## Task 1: 建立 `tool-ui-registry.ts` —— 分类/动词/标签唯一数据源（修 P11/P12/P13）

**Files:**
- Create: `src/renderer/stores/helpers/tool-ui-registry.ts`
- Create: `src/renderer/stores/__tests__/tool-ui-registry.test.ts`
- Modify: `src/renderer/stores/helpers/tool-display.ts`（动词表迁出，re-export 保兼容）
- Modify: `src/renderer/components/chat/StepsPanel.vue`（删本地 getToolCategory/动词函数/getStatusLabel，改 import）

- [ ] **Step 1: 写失败测试**

```ts
// src/renderer/stores/__tests__/tool-ui-registry.test.ts
import { describe, it, expect } from 'vitest'
import {
  getToolUiCategory,
  getCategoryVerbs,
  getStatusLabel,
  getInspectorTab,
} from '../helpers/tool-ui-registry'

describe('tool-ui-registry', () => {
  it('maps file tool aliases to categories', () => {
    expect(getToolUiCategory('edit')).toBe('edit')
    expect(getToolUiCategory('replace_file_content')).toBe('edit')
    expect(getToolUiCategory('write_to_file')).toBe('write')
    expect(getToolUiCategory('view_file')).toBe('read')
    expect(getToolUiCategory('web_search')).toBe('search')
    expect(getToolUiCategory('web-open')).toBe('search')
    expect(getToolUiCategory('bash')).toBe('console')
    expect(getToolUiCategory('fart')).toBe('fart')
    expect(getToolUiCategory('whatever')).toBe('tool')
  })

  it('provides one verb set per category', () => {
    expect(getCategoryVerbs('edit')).toEqual({ base: 'Edit', run: 'Editing', done: 'Edited' })
    expect(getCategoryVerbs('console')).toEqual({ base: 'Run', run: 'Running', done: 'Ran' })
    expect(getCategoryVerbs('tool')).toEqual({ base: 'Call', run: 'Calling', done: 'Called' })
  })

  it('labels every render status', () => {
    expect(getStatusLabel('awaiting-confirmation')).toBe('Needs approval')
    expect(getStatusLabel('streaming-input')).toBe('Preparing')
  })

  it('maps tools to their inspector tab', () => {
    expect(getInspectorTab('web_search')).toBe('browser')
    expect(getInspectorTab('edit')).toBe('diff')
    expect(getInspectorTab('read')).toBe('diff')
    expect(getInspectorTab('bash')).toBe('console')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/renderer/stores/__tests__/tool-ui-registry.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 registry**

```ts
// src/renderer/stores/helpers/tool-ui-registry.ts
/**
 * Single source of truth for how each tool is presented in the UI:
 * category (icon/grouping), verbs, status labels, inspector tab.
 * Adding a new tool's UI treatment means editing THIS file only.
 */
import type { ToolRenderStatus } from './tool-status'

export type ToolUiCategory = 'read' | 'write' | 'edit' | 'search' | 'console' | 'fart' | 'tool'

export interface CategoryVerbs {
  base: string   // imperative: Edit / Run / Read
  run: string    // progressive: Editing / Running
  done: string   // past: Edited / Ran
}

const CATEGORY_ALIASES: Record<string, ToolUiCategory> = {
  read: 'read', read_file: 'read', 'read-file': 'read', readfile: 'read',
  view_file: 'read', 'view-file': 'read', viewfile: 'read',
  write: 'write', write_file: 'write', 'write-file': 'write', writefile: 'write',
  write_to_file: 'write', 'write-to-file': 'write', writetofile: 'write',
  create_file: 'write', 'create-file': 'write', createfile: 'write',
  edit: 'edit', edit_file: 'edit', 'edit-file': 'edit', editfile: 'edit',
  replace_file_content: 'edit', multi_replace_file_content: 'edit',
  web_search: 'search', 'web-search': 'search', websearch: 'search',
  web_open: 'search', 'web-open': 'search', webopen: 'search',
  web_find: 'search', 'web-find': 'search', webfind: 'search',
  bash: 'console',
  fart: 'fart',
}

const CATEGORY_VERBS: Record<ToolUiCategory, CategoryVerbs> = {
  read: { base: 'Read', run: 'Reading', done: 'Read' },
  write: { base: 'Write', run: 'Writing', done: 'Wrote' },
  edit: { base: 'Edit', run: 'Editing', done: 'Edited' },
  search: { base: 'Search', run: 'Searching', done: 'Searched' },
  console: { base: 'Run', run: 'Running', done: 'Ran' },
  fart: { base: 'Summon', run: 'Summoning', done: 'Summoned' },
  tool: { base: 'Call', run: 'Calling', done: 'Called' },
}

const STATUS_LABELS: Record<ToolRenderStatus, string> = {
  queued: 'Queued',
  pending: 'Pending',
  'streaming-input': 'Preparing',
  executing: 'Running',
  'awaiting-confirmation': 'Needs approval',
  completed: 'Done',
  failed: 'Failed',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
}

export type InspectorTab = 'context' | 'request' | 'browser' | 'diff' | 'console'

const CATEGORY_INSPECTOR_TABS: Record<ToolUiCategory, InspectorTab> = {
  search: 'browser',
  edit: 'diff',
  write: 'diff',
  read: 'diff',
  console: 'console',
  fart: 'console',
  tool: 'console',
}

export function getToolUiCategory(toolName: string | undefined): ToolUiCategory {
  if (!toolName) return 'tool'
  return CATEGORY_ALIASES[toolName.trim().toLowerCase()] ?? 'tool'
}

export function getCategoryVerbs(category: ToolUiCategory): CategoryVerbs {
  return CATEGORY_VERBS[category]
}

export function getStatusLabel(status: ToolRenderStatus): string {
  return STATUS_LABELS[status] ?? 'Pending'
}

export function getInspectorTab(toolName: string | undefined): InspectorTab {
  return CATEGORY_INSPECTOR_TABS[getToolUiCategory(toolName)]
}

/** Category for read/write/edit file tools, null otherwise (legacy helper shape). */
export function getFileToolCategory(toolName: string | undefined): 'read' | 'write' | 'edit' | null {
  const cat = getToolUiCategory(toolName)
  return cat === 'read' || cat === 'write' || cat === 'edit' ? cat : null
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run src/renderer/stores/__tests__/tool-ui-registry.test.ts`
Expected: PASS

- [ ] **Step 5: 收口消费方（行为零变化）**

1. `tool-display.ts`：删除本地 `getFileToolCategory` 实现，改为 `export { getFileToolCategory } from './tool-ui-registry'`（其余 import 不变）。
2. `StepsPanel.vue`：删除 `getToolCategory`（line 280-291）、`getStatusLabel`（389-402）、`getGroupVerb/getCompletedGroupVerb/getBaseGroupVerb`（493-529）本地实现，改用：

```ts
import { getToolUiCategory, getCategoryVerbs, getStatusLabel } from '@/stores/helpers/tool-ui-registry'

// getToolCategory(name)        → getToolUiCategory(name)
// getBaseGroupVerb(group)      → getCategoryVerbs(group.category).base
// getCompletedGroupVerb(group) → getCategoryVerbs(group.category).done
// getGroupVerb 运行分支         → getCategoryVerbs(group.category).run
```

3. 顺手删除 `StepsPanel.vue` 死函数 `getOperationText`（模板未引用）。

- [ ] **Step 6: 回归**

Run: `npx vitest run src/renderer/ && bun run typecheck`
Expected: 全部 PASS（449 个 renderer 测试基线）。`stream-end-stability.test.ts` 锁住的文案（"Edit failed: app.ts" 等）不应有任何变化。

- [ ] **Step 7: Commit**

```bash
git add src/renderer/stores/helpers/tool-ui-registry.ts src/renderer/stores/__tests__/tool-ui-registry.test.ts src/renderer/stores/helpers/tool-display.ts src/renderer/components/chat/StepsPanel.vue
git commit -m "refactor(tool-ui): single registry for tool category/verbs/labels"
```

---

## Task 2: ToolActivityView 数字化 stats + 修运行时长 + 失败文案唯一来源（修 P10/P13/P15 及 P14 的前半）

**Files:**
- Modify: `src/renderer/stores/helpers/tool-activity-view.ts`
- Modify: `src/renderer/stores/__tests__/tool-activity-view.test.ts`
- Modify: `src/renderer/components/chat/StepsPanel.vue`

- [ ] **Step 1: 写失败测试（数字 stats）**

在 `tool-activity-view.test.ts` 增加：

```ts
it('exposes numeric additions/deletions for group aggregation', () => {
  const step = makeStep({
    toolCall: makeToolCall({
      toolName: 'edit',
      changes: { filePath: '/a.ts', diff: 'x', additions: 3, deletions: 1 },
    }),
  })
  const view = buildToolActivityView(step)
  expect(view.additions).toBe(3)
  expect(view.deletions).toBe(1)
  expect(view.stats).toBe('+3 -1')
})
```

（`makeStep`/`makeToolCall` 用该测试文件里既有的工厂函数。）

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/renderer/stores/__tests__/tool-activity-view.test.ts`
Expected: FAIL（`additions` undefined）

- [ ] **Step 3: 实现**

`tool-activity-view.ts`：

```ts
export interface ToolActivityView {
  // ...现有字段...
  additions: number      // 新增
  deletions: number      // 新增
}
```

`buildStats` 改为返回 `{ additions, deletions, text }`，`buildToolActivityView` 填 `additions`/`deletions`/`stats` 三个字段；`statusLabel` 字段的取值改为调用 registry 的 `getStatusLabel`，删除本地 `buildStatusLabel`。（运行中时长的实时计算不需要新字段：`StepsPanel.getActivityDurationMs` 已直接读 `activity.toolCall.startTime/endTime`，ticking 由下一步的 `durationNow` interval 驱动。）

- [ ] **Step 4: StepsPanel 消费数字 stats + 修时长 ticking**

1. `getGroupStats` 删除正则解析，改为：

```ts
function getGroupStats(group: StepGroup): string {
  let additions = 0, deletions = 0
  for (const activity of group.activities) {
    additions += activity.additions
    deletions += activity.deletions
  }
  return additions || deletions ? `+${additions} -${deletions}` : ''
}
```

2. 修 P10：组件挂载时若存在运行中的 activity，启动 1s interval 刷新 `durationNow`；全部结束后清除：

```ts
const hasRunning = computed(() =>
  activities.value.some(a => a.status === 'executing' || a.status === 'streaming-input'))

let durationTimer: ReturnType<typeof setInterval> | null = null
watch(hasRunning, (running) => {
  if (running && !durationTimer) {
    durationTimer = setInterval(() => { durationNow.value = Date.now() }, 1000)
  } else if (!running && durationTimer) {
    clearInterval(durationTimer)
    durationTimer = null
  }
}, { immediate: true })
onUnmounted(() => { if (durationTimer) clearInterval(durationTimer) })
```

- [ ] **Step 5: 回归 + Commit**

Run: `npx vitest run src/renderer/ && bun run typecheck`
Expected: PASS

```bash
git add src/renderer/stores/helpers/tool-activity-view.ts src/renderer/stores/__tests__/tool-activity-view.test.ts src/renderer/components/chat/StepsPanel.vue
git commit -m "refactor(tool-ui): numeric stats, live duration ticking, registry labels"
```

---

## Task 3: 统一渲染路径 —— streaming tool call 也走 StepsPanel，删除双体系（修 P1/P2/P3/P4）

**Files:**
- Modify: `src/renderer/stores/helpers/tool-step-view.ts`（新增 `stepFromToolCall` 适配器）
- Modify: `src/renderer/stores/__tests__/tool-step-view.test.ts`
- Modify: `src/renderer/components/chat/message/MessageBubble.vue`
- Delete: `src/renderer/components/chat/ToolCallItem.vue`
- Delete: `src/renderer/components/chat/ToolStepItem.vue`

- [ ] **Step 1: 写失败测试（适配器）**

在 `tool-step-view.test.ts` 增加：

```ts
import { stepFromToolCall } from '../helpers/tool-step-view'

describe('stepFromToolCall', () => {
  it('wraps a streaming tool call as a renderable step', () => {
    const toolCall = {
      id: 'tc1', toolId: 'edit', toolName: 'edit',
      arguments: {}, status: 'input-streaming' as const,
      streamingArgs: '{"path": "/a.ts"', timestamp: 1,
    }
    const step = stepFromToolCall(toolCall)
    expect(step.id).toBe('tc1')
    expect(step.toolCall).toBe(toolCall)
    expect(step.status).toBe('running')
  })

  it('maps terminal tool call statuses to step statuses', () => {
    const done = stepFromToolCall({ id: 'a', toolId: 'bash', toolName: 'bash', arguments: {}, status: 'completed', timestamp: 1 })
    expect(done.status).toBe('completed')
    const failed = stepFromToolCall({ id: 'b', toolId: 'bash', toolName: 'bash', arguments: {}, status: 'failed', timestamp: 1 })
    expect(failed.status).toBe('failed')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/renderer/stores/__tests__/tool-step-view.test.ts`
Expected: FAIL（`stepFromToolCall` 不存在）

- [ ] **Step 3: 实现适配器（逻辑从 ToolCallItem.vue:36-59 原样搬入并加类型）**

```ts
// tool-step-view.ts
/** Wrap a bare ToolCall (no Step yet, e.g. while input is streaming) as a Step
 *  so the unified timeline can render it. */
export function stepFromToolCall(toolCall: ToolCall): Step {
  return {
    id: toolCall.id,
    type: toolCall.toolName?.toLowerCase() === 'bash' ? 'command' : 'tool-call',
    title: toolCall.toolName || 'tool',
    status: toolCall.status === 'completed' ? 'completed'
      : toolCall.status === 'failed' ? 'failed'
        : toolCall.status === 'cancelled' ? 'cancelled'
          : 'running',
    timestamp: toolCall.timestamp,
    toolCallId: toolCall.id,
    toolCall,
    result: typeof toolCall.result === 'string'
      ? toolCall.result
      : toolCall.result === undefined ? undefined : JSON.stringify(toolCall.result),
    error: toolCall.error,
  }
}
```

- [ ] **Step 4: MessageBubble 切换到统一路径**

`MessageBubble.vue:231-254` 整段 `<template v-else-if="part.type === 'tool-call' ...">` 替换为：

```vue
<StepsPanel
  v-else-if="part.type === 'tool-call' && streamingOnlySteps(part.toolCalls).length > 0"
  :steps="streamingOnlySteps(part.toolCalls)"
  :session-id="sessionId"
  @open-file="(filePath) => emit('openFile', filePath)"
/>
```

script 增加（替换 `getToolCallsWithoutSteps` 的消费方式，函数本体保留复用）：

```ts
import { stepFromToolCall } from '@/stores/helpers/tool-step-view'

function streamingOnlySteps(toolCalls: ToolCall[]): Step[] {
  const source = hasSteps ? getToolCallsWithoutSteps(toolCalls) : toolCalls
  return source.map(stepFromToolCall)
}
```

删除 `import ToolCallItem`。注意：`hasSteps` 在现文件中是 computed，引用方式按现有代码（`hasSteps.value` 或模板内直接用）保持一致。

- [ ] **Step 5: 删除旧组件**

```bash
git rm src/renderer/components/chat/ToolCallItem.vue src/renderer/components/chat/ToolStepItem.vue
```

然后全局搜索确认无残留引用：`grep -rn "ToolCallItem\|ToolStepItem" src/ --include="*.vue" --include="*.ts"`，预期只剩 `tool-status.ts`/`tool-preview.ts` 顶部注释里的提及——把这两处注释一并更新（指向 StepsPanel）。

- [ ] **Step 6: 回归**

Run: `npx vitest run src/renderer/ && bun run typecheck`
Expected: PASS。重点人工核对 `stream-end-stability.test.ts`（其中有依赖 steps/tool-call 切换行为的用例，若有用例直接断言 ToolCallItem 的 DOM，需要把断言改到 StepsPanel 的等价 DOM 上——改断言前先确认新 DOM 行为符合用例意图）。

- [ ] **Step 7: Commit**

```bash
git add -A src/renderer
git commit -m "refactor(tool-ui): single render path, drop ToolCallItem/ToolStepItem"
```

---

## Task 4: StepsPanel 交互契约统一（修 P5/P6/P7/P8/P9）

**Files:**
- Modify: `src/renderer/components/chat/StepsPanel.vue`
- Modify: `src/renderer/components/chat/__tests__/`（沿用 stream-end-stability 或新建 `StepsPanel.interaction.test.ts`）

交互契约（实现目标，逐条对应问题）：

| 手势 | 行为 |
|---|---|
| 点击行（任意处） | 切换展开详情（有 hasDetails 时） |
| 点击 file-link 目标名 | `emit('open-file', activity.filePath)`，不再触发展开（修 P5） |
| 失败摘要 | 单条与分组**都**常显（不依赖展开）（修 P8） |
| needs-approval 行 | 行尾显示 `Review` 按钮 → 滚动/聚焦到 ChatPanel permission panel（通过 `chatStore` 现有的 pending permission 状态，不复活死 emit 链）（修 P6） |
| 展开状态 | 单一 `expandedMap`，default 一律 `activity.defaultExpanded`，与分组形态无关（修 P9） |

- [ ] **Step 1: 写失败测试**

新建 `src/renderer/components/chat/__tests__/StepsPanel.interaction.test.ts`（mount 用法参考 `stream-end-stability.test.ts` 的现有 setup——同样需要 pinia stub）：

```ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { createTestingPinia } from '@pinia/testing'
import StepsPanel from '../StepsPanel.vue'

function fileStep(id: string, status = 'completed') {
  return {
    id, type: 'tool-call', title: `edit: /repo/src/${id}.ts`, status,
    timestamp: 1, toolCallId: id,
    toolCall: {
      id, toolId: 'edit', toolName: 'edit', status,
      arguments: { path: `/repo/src/${id}.ts` }, timestamp: 1,
      changes: { filePath: `/repo/src/${id}.ts`, diff: '@@ -1 +1 @@\n-a\n+b\n', additions: 1, deletions: 1 },
    },
  }
}

function mountPanel(steps: any[]) {
  return mount(StepsPanel, {
    props: { steps },
    global: { plugins: [createTestingPinia({ stubActions: true })] },
  })
}

describe('StepsPanel interaction contract', () => {
  it('emits open-file when clicking a file-link target name', async () => {
    const wrapper = mountPanel([fileStep('a')])
    await wrapper.find('.node-target-name.file-link').trigger('click')
    expect(wrapper.emitted('open-file')?.[0]).toEqual(['/repo/src/a.ts'])
    // 点击文件名不应切换展开
    expect(wrapper.find('.activity-inline-details').exists()).toBe(false)
  })

  it('keeps an activity expanded when its group grows from 1 to 2', async () => {
    const wrapper = mountPanel([fileStep('a')])
    await wrapper.find('.operation-row').trigger('click')
    expect(wrapper.find('.activity-inline-details').exists()).toBe(true)
    await wrapper.setProps({ steps: [fileStep('a'), fileStep('b')] })
    // 同类第二个工具到来后切到分组渲染，第一个的展开状态必须保留
    expect(wrapper.find('.activity-inline-details').exists()).toBe(true)
  })

  it('always shows failure summary inside a collapsed-row group', () => {
    const failed = { ...fileStep('c', 'failed'), error: 'No match found' }
    failed.toolCall.status = 'failed'
    const wrapper = mountPanel([fileStep('a'), failed])
    expect(wrapper.find('.operation-failure').exists()).toBe(true)
    expect(wrapper.find('.operation-failure').text()).toContain('No match found')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/renderer/components/chat/__tests__/StepsPanel.interaction.test.ts`
Expected: FAIL（open-file 无 emit；展开状态丢失；分组失败摘要默认隐藏）

- [ ] **Step 3: 实现**

`StepsPanel.vue` 改动点：

1. **展开状态合并**：删 `expandedActivitiesMap` / `expandedGroupActivitiesMap` 两个 map，统一为：

```ts
const expandedMap = ref<Record<string, boolean>>({})

function isActivityExpanded(activity: ToolActivityView): boolean {
  return expandedMap.value[activity.id] ?? activity.defaultExpanded
}
function toggleActivityExpanded(activity: ToolActivityView) {
  if (!activity.hasDetails) return
  expandedMap.value[activity.id] = !isActivityExpanded(activity)
}
```

模板中 grouped 分支的 `isGroupActivityExpanded`/`toggleGroupActivityExpanded` 全部替换为上面两个函数；`collapseGroupActivities` 删除（group 折叠/展开不再清空子项状态）。

2. **open-file**：两个分支的 `node-target-name` 改成：

```vue
<span
  class="node-target-name"
  :class="{ 'file-link': activity.canOpenFile }"
  @click.stop="activity.canOpenFile ? $emit('open-file', activity.filePath) : toggleActivityExpanded(activity)"
>{{ getActivityTargetText(activity) }}</span>
```

同时删除外层 `node-target` span 上冗余的 `@click.stop="toggle..."`（P7）。

3. **失败摘要常显**：grouped 分支 `v-if="activity.errorSummary && isGroupActivityExpanded(activity)"` 改为 `v-if="activity.errorSummary"`。

4. **needs-approval 入口**：在两个分支的 `operation-row` 行尾（chevron 之前）加：

```vue
<button
  v-if="activity.isAwaitingConfirmation"
  class="row-review-btn"
  type="button"
  @click.stop="scrollToPermissionPanel"
>Review</button>
```

```ts
function scrollToPermissionPanel() {
  document.querySelector('.session-permission-panel')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
}
```

（不复活 confirm/reject emit 链；审批动作收敛在 ChatPanel permission panel 一处。）

5. **删除死契约**：`defineEmits` 只留 `'open-file'`；`MessageBubble.vue`/`MessageItem.vue` 中对 StepsPanel 的 `@confirm`/`@reject` 绑定删除。

6. `.row-review-btn` 样式：复用 `--ui-status-warning-fg` 色系，11px、圆角 4px、透明底 + warning 边框（与 needs-approval 行的视觉语言一致）。

- [ ] **Step 4: 跑测试确认通过 + 全量回归**

Run: `npx vitest run src/renderer/ && bun run typecheck`
Expected: PASS。`stream-end-stability.test.ts` 中若有断言「分组失败摘要需展开才显示」的用例，更新为常显断言（这是本任务的预期行为变化，改动要在 commit message 里说明）。

- [ ] **Step 5: Commit**

```bash
git add -A src/renderer
git commit -m "fix(tool-ui): unified expand state, real open-file, always-visible failures, approval entry"
```

---

## Task 5: 失败文案单一来源（修 P14 后半）

**Files:**
- Modify: `src/renderer/stores/helpers/tool-activity-view.ts`（导出 `buildErrorSummary`/`buildNextAction`）
- Modify: `src/renderer/components/chat/ToolStepDetails.vue`

- [ ] **Step 1: 导出行级文案函数**

`tool-activity-view.ts` 中 `buildErrorSummary` 与 `buildNextAction` 加 `export`（签名已含 step/toolCall/toolName/filePath/status，足够详情层复用）。

- [ ] **Step 2: ToolStepDetails 复用**

删除 `ToolStepDetails.vue:199-225` 的 `errorSummary`/`errorNextAction` computed 本体，改为：

```ts
import { buildErrorSummary, buildNextAction } from '@/stores/helpers/tool-activity-view'

const errorSummary = computed(() => buildErrorSummary(
  props.view.step, props.view.toolCall, props.view.toolName, props.view.filePath, props.view.status,
))
const errorNextAction = computed(() => buildNextAction(props.view.toolName, props.view.status))
```

保留 `failureParametersJson` / `compactError` / `error-details`（这些是详情层独有的增量信息）。`errorFileName`、`failureReason` 若只剩这两个 computed 在用则一并删除。

- [ ] **Step 3: 回归 + Commit**

Run: `npx vitest run src/renderer/ && bun run typecheck`
Expected: PASS（详情层失败文案措辞会与行级统一——若有快照/断言锁旧文案，按新文案更新）。

```bash
git add -A src/renderer
git commit -m "refactor(tool-ui): single source for failure summary and next-action copy"
```

---

## Task 6: 详情视图 memoize + 模块级缓存治理（修 P16）

**Files:**
- Create: `src/renderer/components/chat/ToolActivityDetails.vue`
- Modify: `src/renderer/components/chat/StepsPanel.vue`
- Modify: `src/renderer/stores/helpers/tool-step-view.ts`

- [ ] **Step 1: 新建薄包装组件**

```vue
<!-- src/renderer/components/chat/ToolActivityDetails.vue -->
<template>
  <ToolStepDetails
    :view="detailView"
    :wrap="true"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { ToolActivityView } from '@/stores/helpers/tool-activity-view'
import { buildDetailedToolStepView } from '@/stores/helpers/tool-activity-view'
import ToolStepDetails from './ToolStepDetails.vue'

const props = defineProps<{ activity: ToolActivityView }>()

// computed 缓存：只有 activity 引用变化（store 更新该 step）才重建，
// 替代模板里每次 re-render 都跑 buildDetailedToolStepView + 多次 JSON.parse
const detailView = computed(() => buildDetailedToolStepView(props.activity))
</script>
```

- [ ] **Step 2: StepsPanel 两处展开详情替换**

`StepsPanel.vue` 两个分支里的：

```vue
<ToolStepDetails :view="buildDetailedToolStepView(activity)" :wrap="true" />
```

替换为：

```vue
<ToolActivityDetails :activity="activity" />
```

并删除 `buildDetailedToolStepView` 的 import 与外层 `details-content-wrapper` 不变。

- [ ] **Step 3: streamingContentCache 治理**

`tool-step-view.ts`：导出清理函数并在测试 setup 可调用；同时把 cache 限制逻辑保持不变：

```ts
export function clearStreamingContentCache(): void {
  streamingContentCache.clear()
}
```

在 `src/renderer/stores/__tests__/tool-step-view.test.ts` 与 `stream-end-stability.test.ts` 的 `beforeEach` 中调用，消除跨用例污染源。

- [ ] **Step 4: 回归 + Commit**

Run: `npx vitest run src/renderer/ && bun run typecheck`
Expected: PASS

```bash
git add -A src/renderer
git commit -m "perf(tool-ui): memoize expanded detail views, clearable streaming cache"
```

---

## Task 7: 收尾清理 + 全量验证

**Files:**
- Modify: `src/renderer/stores/helpers/tool-display.ts`（评估 TOOL_VERBS 残留）
- Modify: 各文件零散死代码

- [ ] **Step 1: 死代码清扫**

依次确认并删除：
1. `tool-display.ts` 的 `TOOL_VERBS` 中已被 registry category 动词覆盖、且无个性化动词的条目不动——**只有当 `buildToolVerb` 在 Task 3 之后无调用方时**整个函数及表才删（用 `grep -rn "buildToolVerb" src/` 验证；`buildToolPermissionTitle` 仍被 ChatPanel 使用，保留）。
2. `StepsPanel.vue`：`mergeStatuses` 若 group.status 仍用则保留；确认 `getStatusLabel` 本地版已删。
3. 全局 `grep -rn "toggle-expand\|expandedGroupActivitiesMap\|collapseGroupActivities" src/renderer` 应零结果。

- [ ] **Step 2: 全量回归**

Run: `bun run typecheck && bun run test`
Expected: 主进程 + renderer 全部 PASS（todo-plan-window 在全量下偶发超时为已知 flaky，单独重跑确认）。

- [ ] **Step 3: 手动验证清单（bun run dev）**

1. 发一条触发多次 edit 的消息：流式期间工具行**不再发生卡片→时间线的视觉跳变**；同类工具从 1 变 2 时已展开的详情不丢。
2. 点击文件名 → 触发 open-file（编辑器/预览打开）；点击行其他区域 → 展开详情。
3. 触发一个需要审批的 bash：行内出现 Review 按钮，点击滚动到 permission panel；Allow/Reject 后行状态正确流转。
4. 制造一次失败 edit（oldText 不匹配）：折叠的分组里也能直接看到失败摘要；展开后详情里的失败文案与行级一致（不再两套措辞）。
5. 运行一个 >5s 的 bash：时长每秒走表。

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore(tool-ui): remove dead verb tables and legacy emit chains"
```

---

## 执行顺序与风险

- 任务 1→2→3 是依赖链（registry → 视图模型 → 渲染路径统一）；4、5 依赖 3；6、7 收尾。
- 最大风险在 Task 3（MessageBubble 渲染分支）和 Task 4（stream-end-stability 测试断言更新）。两个任务的原则：**先确认现有测试用例的意图，行为变化必须是本计划点名的（P5/P6/P8/P9），其余输出保持字节级一致**。
- 当前工作区有未提交的 WIP（web-search renderer、tool-display 新增等），执行本计划前建议先把现有 WIP 提交成独立 commit，保证每个任务的 diff 干净可回滚。
