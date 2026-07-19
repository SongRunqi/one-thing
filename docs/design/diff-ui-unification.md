# Diff UI 统一方案

状态:**P0–P5 已全部实施**(未提交)
日期:2026-07-15

## 实施期推翻的一条核心论断

设计期认定「执行前不存在真 diff」。**这只对一半。** 状态实为三态:

| 状态 | 真 diff | 说明 |
| --- | --- | --- |
| `streaming-input` | **无** | 模型还在吐参数,文件从未被读过 → `ToolContentPreview` |
| `awaiting-confirmation` | **有** | 工具已读文件、`createTwoFilesPatch` 算出 patch,再挂起等审批 → `DiffView` |
| `completed` / `failed` | **有** | → `DiffView` |

证据:`packages/onething-runtime/src/tools/builtin/edit.ts:258-290` 在请求权限**之前**就以 `phase: "preview"` 发出 `plan.diff`;`packages/core/engine/tool-orchestration.ts:825-835` 在 `requiresConfirmation` 时把 `changes`(含该 diff)一并挂到 `awaiting-confirmation` 的 step 上。

后果是好的:**权限审批看到的是真 diff,不是预测**。`getDiffFromStep` 对审批态与落定态一视同仁,故本方案的两分支实现天然覆盖三态,无需改动。

## 一、调查结论

### 1.1 活着的 diff UI 只有一处,死的有四处

| 组件 | 行数 | 状态 |
| --- | --- | --- |
| `chat/ToolStepDetails.vue` → `chat/ToolDiffPreview.vue` | 443 | **活**。聊天流内工具行展开的详情。经 `ProcessRail.vue` → `ToolActivityDetails.vue` 挂载。**全 app 唯一活着的 diff 显示处** |
| `chat/DiffOverlay.vue` → `chat/message/DiffView.vue` | 327 + 929 | **死**。App → ChatContainer → Overlay 接线全通,但 `openDiffOverlay`(`App.vue:331`)无调用方,`showDiffOverlay` 恒为 `false` |
| `chat/ChatInspectorPanel.vue`(含 diff tab,453-523) | 2322 | **死**。无任何文件 import。`components/__tests__/App.container-layout.test.ts:16` **主动断言** App.vue 不得 import 它——是被有意摘掉的(大概率被 `RightWorkbenchPanel` 取代) |
| `common/CollapsePanel.vue` 的 `contentKind === 'diff'` 分支(283-298) | ~50 | **死**。仅 `common/__tests__/CollapsePanel.test.ts:360` 会设成 `'diff'` |

`RightWorkbenchPanel.vue`(右侧分栏,活)的 tab 为 files / file / review / terminal / browser,**无 diff tab**。

残肢:`stores/chat.ts:215` 的 `activeInspectorTab`、`:220` 的 `openInspectorToTab`、`tool-ui-registry` 的 `getInspectorTab`(`stores/__tests__/tool-ui-registry.test.ts:47` 仍在测 `getInspectorTab('edit') === 'diff'`)。

订正一条早期误判:`@pierre/diffs` 位于 `devDependencies`(package.json:112)**不是打包 bug**。renderer lane 未使用 `externalizeDepsPlugin`(仅 main:214 / preload:232 使用),Vite 会将其打入 bundle,位置正确。

### 1.2 关键发现:执行前不存在真 diff

`getDiffFromStep`(`tool-step-view.ts:778`)只从 `step.toolCall.changes.diff` 或 `step.result` 的 JSON `.diff` 取值,**二者均在工具执行完成后才存在**(主进程经 `createTwoFilesPatch` 计算,见 `packages/onething-runtime/src/tools/builtin/edit.ts:119`、`write.ts:112`)。

执行前渲染的是 `parseStreamingDiffLines`(`tool-step-view.ts:355`)**依据模型正在流出的参数现场合成的伪 diff**:

- **Write 路径**(360-370):无条件把每一行标成 `diff-add` / `+`,**从未读取旧文件**。文件已存在时,「全绿新增」是错的。
- **Edit 路径**(373):对参数里的 `old_string` / `new_string` 做 `diffLines`,是真 diff,但 `oldLineNum` / `newLineNum` 均从 1 起算,是**替换块内部偏移,不是文件真实行号**;无上下文行;多替换之间是 `... edit 2 ...` 假分隔符而非真 `@@` hunk 头;且无从得知 `old_string` 能否匹配上——该 edit 完全可能失败。

即:**流式期间的「diff」是从模型参数推测出的预览,不是对真实文件的 diff。它不该长得像 diff。**

### 1.3 两态被静默混同

`ToolStepDetails.vue:189-190`:

```js
const activeDiff = computed(() => props.view.diff || props.view.streamingDiff)
const activeDiffLines = computed(() => props.view.diff ? props.view.diffLines : props.view.streamingDiffLines)
```

同一个 `ToolDiffPreview` 吞下两种保真度的数据,`view.diff` 由 null 变非 null 时静默切换。摘要行(174)同样是 `diff || streamingDiff`。后果:

- 预览态用 `diff-add` 绿底 + 行号,视觉上冒充 ground truth;
- 行号在工具落定瞬间跳变(替换块内偏移 → 文件真实行号)。**代码推断,尚未真机验证。**

### 1.4 @pierre/diffs 不能用于流式,但这不构成障碍

1. `FileDiff.render()` 的记忆化是引用相等(`dist/components/FileDiff.js:180`),流式时每次是新 patch 对象,永不相等 → 每次全量渲染。
2. `RenderedDiffASTCache`(`dist/types.d.ts:230`)是**单槽缓存,按整份 diff 的对象身份**,非 per-hunk。`DiffHunksRenderer.js:142` / `:221` 一旦失效即整份重新 shiki 高亮。
3. `applyHunksToDOM`(`FileDiff.js:317`)`pre.innerHTML = ""` 后整体重建 → O(n²),常数项是 shiki。

包内 `FileStream` 确为流式设计,但它流的是**文件内容,不是 diff**,无 +/- 语义。

**结论:预览态在原理上就喂不进 `FileDiff`**(Write 无旧文件即无 patch;Edit 行号是假的)。但按本方案预览态不再是 diff,真 diff 只在落定后渲染,数据已静止,`FileDiff` 的全部能力(shiki、split/unified、词级 diff、hunk 展开)均可用且无流式性能问题。

## 二、核心判断

该统一的不是渲染器,而是**诚实地区分两态**。两态在**同一个位置**(聊天流的工具行)先后出现:

| | 预览态(流式中) | 落定态(执行后) |
| --- | --- | --- |
| 数据来源 | 模型正在流出的**参数** | **文件系统**真实前后对比 |
| 本质 | 推测性预览,可能落空 | ground truth |
| 表达 | **不装 diff**,只呈现参数 | 真 diff |
| 渲染器 | `ToolContentPreview`(新) | `DiffView` / @pierre/diffs |
| 用途 | **权限审批**:看清它将要做什么 | 事后审阅:它做了什么 |

## 三、目标架构

```
聊天流里的工具行（ToolStepDetails，唯一承载面）
  ├ 流式中 → ToolContentPreview.vue（新）
  │            Write: 「即将写入」的内容,单色,无 +/-,无行号
  │            Edit : 「替换预览」,old→new 成对展示,无文件行号
  └ 有 diff → DiffView.vue（@pierre/diffs）渲染真 patch
```

无 overlay、无 Inspector。**行默认折叠,只有 `awaiting-confirmation` 的 write/edit 自动展开**(要你批准就得让你看见,详见第七节第 1 条)。

`DiffView.vue` 是干净的通用包装:入参为 raw unified diff 字符串 + 显示选项(`diffStyle: 'unified' | 'split'`、`expandUnchanged`、`showToolbar`、`allowCopy` 等,见 138-169),**无任何 git / overlay 耦合**(git 逻辑全在 `DiffOverlay` 内)。它正是「@pierre/diffs 的 diff 能力」的包装层,保留。

## 四、阶段概览

| 阶段 | 目标 | 状态 |
| --- | --- | --- |
| P0 | `DiffView` 内联多实例压测 | **已完成 —— 通过,但查出一个必须先修的泄漏** |
| P0.5 | 修 `DiffView` 的 dom-button 泄漏 | **P2/P3 的前置** |
| P1 | 删死代码:`DiffOverlay` 链路 + `ChatInspectorPanel` + `CollapsePanel` diff 分支 | 待办 |
| P2 | 两态分离:新增 `ToolContentPreview`,预览态不再装 diff | 待办 |
| P3 | 落定态改用 `DiffView` 自动展开;删 `ToolDiffPreview` | 待办 |
| P4 | token 收口到 `--diff-*` 单一族 | 待办 |
| P5 | diff 语法色接入主题系统 | **已完成 —— 查出主题桥接从未生效** |

P1 / P4 互不依赖可并行。P0.5 → P2 → P3 有序。

### P0 压测结论(2026-07-15,已执行)

压测台:`.bench-p0/`(独立 vite,root 挂 N 个 `DiffView`,Playwright + CDP `HeapProfiler.collectGarbage` 强制 GC 后读 `performance.memory`)。`DiffView` 无 store / `platformApi` 依赖,可脱离 app 独立测。

**性能:通过。**

| 指标 | 结果 |
| --- | --- |
| 单实例冷启(含 shiki 首次加载) | 211 ms(一次性) |
| 单实例热态 | 17-18 ms |
| 5 / 10 / 30 / 50 实例 | 63 / 106 / 377 / 605 ms —— **线性**,每实例恒定 ~12 ms,无 O(n²) |
| 滚动 churn(窗口 8,30 轮) | 中位 87 ms / 峰值 122 ms,**30 轮无劣化** |
| DOM | 每实例 ~437 shadow 节点;卸载后 container 与 shadow 节点均归零 |

**内存:查出真泄漏 —— 是我们的 bug,不是库的。**

强制 GC 后堆仍完美线性增长,每实例永久残留 ~52KB:

```
withHeader:    9.3 → 26.9 → 43.2 → 59.3 MB   (960 次挂载,+50MB)
withoutHeader: 59.3 → 59.3 → 59.3 → 59.3 MB  (960 次挂载,+0MB,完全平)
```

三个对照定位根因:

1. 换用**唯一 diff** vs **重复 diff**,数字完全相同 → 与 diff 内容无关,不是 `WorkerPoolManager` 的 LRU 缓存(它是 `LRUMap(totalASTLRUCacheSize ?? 100)`,本就有界)。
2. **裸 `FileDiff`**(绕开 Vue 与 `DiffView`,300 次挂载/卸载)→ 堆恒定 9.6 MB,**库不漏**。
3. **`showFileHeader: false`**(令 `renderHeaderMetadata` 为 `undefined`)→ 泄漏归零。

根因:`DiffView.vue:461` 的 `createHeaderButton` 经 `createDomButton`(`common/dom-button.ts`)用 Vue `render(h(Button), host)` 挂出按钮,**`DiffView` 全文从未调用 `unmount()` 或 `unmountDomButtons()`**。每次挂载造出的按钮组件树永不销毁。`onUnmounted`(599-603)只清了 `fileDiffInstance.cleanUp()` 与 `themeObserver.disconnect()`,漏了按钮。

现状之所以没暴露:`DiffView` 唯一的消费者 `DiffOverlay` 是死的,从未被渲染过。

### P0.5 修泄漏(已完成)

`DiffView.vue` 持有 `headerButtons: MountedDomButton[]`,`createHeaderButton` push;新增 `releaseHeaderButtons()`,在 `renderHeaderMetadata` 开头(库每次重建 header 都会回调它,旧按钮即刻作废)与 `onUnmounted` 各调一次。

**回归验证(Playwright + CDP 强制 GC):**

```
修复前:9.3 → 26.9 → 43.2 → 59.3 MB   (960 次挂载,+50.0MB)
修复后:9.1 → 10.6 → 10.7 → 10.7 MB   (960 次挂载,+1.6MB 后平台化)
```

churn 中位 80.8 ms(修前 87 ms),性能无退化。功能验证:header 两个按钮 title / 图标正常;点击切换后 header 重建,按钮数稳定为 2(不累积)且 title 正确翻转;卸载后 dom-button host、button、`diffs-container` 全部归零。

**订正一条设计期误判**:header 与按钮实际位于 **light DOM**(经 `HEADER_METADATA_SLOT_ID` 投影进 shadow),并非 shadow DOM 内部,故 `unmountDomButtons(root)` 本可够到。此处仍选择显式持引用,因为它不依赖 DOM 查询时机、也能覆盖「库已丢弃旧 header 元素」的情形。

## 五、阶段细节

### P1 删死代码

**DiffOverlay 链路**(工作区级 `git diff` 全屏浮层,从未接线):

- 删 `chat/DiffOverlay.vue`(327 行,含 114-116 的 `git diff` / `git diff --cached` shell 调用)。
- 删 `App.vue`:`DiffOverlayData`(256)、`showDiffOverlay`(327)、`diffOverlayData`(328)、`openDiffOverlay`(331)、`closeDiffOverlay`(336),及模板 148-149、160 的绑定。
- 删 `ChatContainer.vue`:模板 100-107 的 `<DiffOverlay>`、import(120)、`DiffOverlayData`(127)、props(140-141)、emit `close-diff-overlay`(155)。
- 删 `components/__tests__/ChatContainer.search.test.ts:43-46` 的 mock。

**CollapsePanel diff 分支**:

- 删 `common/CollapsePanel.vue`:模板分支(283-298)、`parseDiffLine()`(633)、`RenderedDiffLine` 类型、`renderedDiffLines` computed、`.collapse-panel-diff*` 样式(含 1026/1036 走 `--ui-status-success-bg` / `--ui-status-danger-bg` 的岔路)。
- `common/collapse.ts:8`:`CollapsePanelContentKind` 去掉 `'diff'`。
- `NestedCollapseGroup.vue:155` 透传处同步。
- 删 `common/__tests__/CollapsePanel.test.ts:360` 用例。

**`DiffView.vue` 保留**,P3 要用。

### P2 两态分离

**新增** `chat/ToolContentPreview.vue`:

- 入参 `streamingContent: StreamingToolContent`、`status: ToolRenderStatus`。
- Write:单色渲染内容,**无 `+` 前缀、无绿底、无行号**。
- Edit:每个 replacement 成对展示 old → new;**不显示文件行号**(现在的是假的);多替换用中性分隔。
- 保留 `LIVE_TAIL_LINES = 200` 尾部限流与吸底跟随(`ToolDiffPreview.vue:88-101`)——这部分复杂度本就是伺候流式的,原样迁移。
- `awaiting-confirmation` 态需醒目:它是权限审批的决策依据。

**改** `stores/helpers/tool-step-view.ts`:

- 删 `getStreamingDiff` / `getStreamingDiffStats` 及 `ToolStepView.streamingDiff`、`streamingDiffLines` —— 伪造 `ToolDiffData` 的来源。
- `parseStreamingDiffLines`(355)/ `parseStreamingEditDiffLines`(373)改为产出预览专用结构,**不复用 `ToolDiffLine` 的 `diff-add` / `diff-del` class**,避免再次冒充。
- renderer 侧 `diffLines` from 'diff'(2、389)保留 —— Edit 预览的 old/new 对比仍需要。

### P3 落定态收敛

**改** `chat/ToolStepDetails.vue`:

- 删 `activeDiff` / `activeDiffLines`(189-190)。
- 模板 46-53 按 `view.diff` 显式二分:有 → `<DiffView :diff="view.diff.diff">`;无且有 `streamingContent` → `<ToolContentPreview>`。
- 摘要行(174)`view.diff || view.streamingDiff` 拆开:预览态与落定态需视觉可分。
- **注意 58 行** `v-if="!activeDiff && ..."`:原意是「diff 已讲清楚就不重复显示结果文本」。两态拆开后此条件需重估,否则 edit/write 的 "Successfully edited …" 会重新冒出来。
- `defaultExpanded`(`tool-step-view.ts:230`)需覆盖「执行完自动展开 diff」——现有 `shouldDefaultExpand` 只在 `streaming-input` 时对 write/edit 返回 true,落定态需补。

**删除** `chat/ToolDiffPreview.vue`(443 行):

- 其手搓 `highlightCode` / `KEYWORDS`(68)只认 JS/TS 关键字却无差别套用于所有语言(Python 的 `def`、Go 的 `func`、Rust 的 `fn` 均不高亮),由 @pierre/diffs 的 shiki 取代后此问题一并消失。
- 删 `chat/__tests__/ToolDiffPreview.test.ts`;`styles/__tests__/ui-token-vars.test.ts:394`、`styles/__tests__/highlight-group-vars.test.ts:17` 的引用需同步。
- **不需要** `codeTokenizer` 迁移 —— shiki 覆盖语言更广。`codeTokenizer.ts` 保留给 `StreamingCodeBlock.vue:57`,不动。

**`ChatInspectorPanel.vue:515`** 也引用 `ToolDiffPreview`。该组件已死,处理见第七节。

**`parseDiffWithLineNumbers`(`tool-step-view.ts:838`)与 `ToolDiffLine`**:`DiffView` 直接吃 patch 字符串,不需要结构化行。P3 后若确无消费者则一并删除(含 `stores/__tests__/tool-step-view.test.ts:397` 用例)。`tool-activity-view.ts:91` 的 `getDiffFromStep` 仅取统计,不受影响。

### P4 token 收口

- `styles/variables.css` 的 `--diff-add-bg`(853/1126)、`--diff-del-bg`(855/1128)、`--diff-hunk-bg`(857/1130)为唯一颜色源。
- `DiffView.vue:264-276` 已通过 `getCSSVar()` 读取并经 `unsafeCSS`(312)桥接为 `--diffs-*`,保持。
- P1 删掉 `--ui-status-*` 岔路后,全系统真 diff 颜色只剩一个源,漂移问题消失。
- `ToolContentPreview` **不用** `--diff-*`(它不是 diff),另取中性 token。
- `@pierre/diffs` 的 shiki 主题需与画线风对齐,`registerCustomTheme` 可用。

## 六、解析器现状

删除死代码后剩两个,**职责不同,不应硬合**:

- `parseDiffWithLineNumbers`(`tool-step-view.ts:838`)—— 结构化行,P3 后大概率可删。
- `parseDiffStats`(`chat/composer/queued-message-utils.ts:32`)—— 仅统计 +/-,用于 composer 的排队消息,与工具步骤无关。保留。

原「四个解析器」中,`CollapsePanel.parseDiffLine` 与 @pierre/diffs 的 `parsePatchFiles` 分别在 P1 / P3 后消失。

## 七、实施结果与遗留

### 已完成

- **P0 / P0.5**:压测通过 + dom-button 泄漏修复(见第四节)。压测台 `.bench-p0/` 已删除。
- **P1**:删除 `DiffOverlay.vue`(327)、`ChatInspectorPanel.vue`(2322)、`CollapsePanel` diff 分支(~140)及各处 plumbing,合计约 2880 行。
- **P2**:新增 `ToolContentPreview.vue`;`tool-step-view.ts` 移除 `getStreamingDiff` / `streamingDiff` / `streamingDiffLines`,改产 `streamingPreviewLines: ToolPreviewLine[]`;`getStreamingDiffStats` 更名 `getStreamingChangeStats`(它算的是预测统计,不是 diff)。
- **P3**:`ToolStepDetails` 按 `view.diff` 显式二分;删除 `ToolDiffPreview.vue`(443)及连带的 `ToolDiffLine` / `parseDiffWithLineNumbers` / `getDiffLineClass` / `parseHunkHeader`(每个落定 diff 不再被白解析一遍)。
- **P4**:`--diff-*` 已是真 diff 的唯一颜色源,消费者仅剩 `DiffView`、`hljs-theme.css`、`QueuePanel` 的 +/- 统计;`--ui-status-*` 岔路随 P1 消失。`ToolContentPreview` 使用中性 `--ui-tool-*`。另清理了 `DiffView` 的 7 行 `console.debug`(它已进入热路径)。
- **P5**:新增 `diff-theme.ts`,diff 语法色接入主题系统(详见下节)。

验证:`typecheck:node` / `typecheck:web` 零错误;全量测试对基线**零新增失败**(基线 59 失败 / 11 文件 → 改后 55 / 9)。

### P5:主题桥接从未生效(2026-07-15,已执行)

起因是「diff 的 theme 和 ui 不一样」。查下去发现根因不是语法色配错,而是 **`generateCustomCSS()` 那 30 行主题桥接从写下起就没生效过** —— diff 一直是原味 `github-dark` / `github-light`。两处独立的错:

1. **没有选择器**。`wrapUnsafeCSS()` 把字符串原样塞进 `@layer unsafe { … }`,自己不补选择器,`createUnsafeCSSStyleNode()` 也不补。而原代码给的是裸声明(`--diffs-background: …;`)。裸声明放在 layer 顶层是无效 CSS,**整段被解析器丢弃**。真 Chrome 实测:裸声明解析出 0 条规则、值为 `""`;包上 `:host` 后 1 条规则、值生效。
2. **变量名对不上**。代码写 `--diffs-addition-background`,库里真名是 `--diffs-bg-addition-override`。且必须用 `-override` 后缀 —— 无后缀的名字由库从主题算出后**内联**写在元素上,内联压过样式表规则。

修法分两层,互不重叠:

| 层 | 管什么 | 怎么做 |
| --- | --- | --- |
| `diff-theme.ts` | 文字颜色(前景 + 11 个语法组) | shiki `createCssVariablesTheme`,颜色全是 `var()` 引用 |
| `DiffView` 的 `unsafeCSS` | 面色(增删底、hunk、hover、行号) | 库的 `--diffs-*-override` 钩子 |

三个关键机制:

- **一套主题通吃明暗**。主题的颜色是 `var()` 而非烘焙 hex,明暗由 app 的 token 区分,故 `theme: { dark: 'onething', light: 'onething' }`。实测 `light-dark(var(--a), var(--b))` 两边同 var 时解析正常。
- **切主题不再重渲染**。`updateTheme()` 原本调 `renderDiff()` 重新套用 CSS;现在颜色是活的 `var()`,只需推 `color-scheme`(唯一无法由变量承载的东西)。实测切主题后颜色正确且无重高亮。
- **`ansi-*` / `gitDecoration.*` 是死路**(已在 `diff-theme.ts` 注释记下)。库从 `theme.colors['terminal.ansiGreen']` 推增删基色,看着正是给 diff 上色的入口。但 TextMate 只收字面 hex,`normalizeTheme()` 会把每个 `var()` 换成占位色、真值存进 `colorReplacements`,shiki 着色时再换回来 —— 所以 **token 色活下来了,直接读 `theme.colors` 的人拿到的是占位色**,落到屏幕上是近乎透明的黑(指示条整个看不见、行号无色、词级强调发灰)。故增删基色只能走 CSS 的 `-override`。

一个自找的坑:新代码直接引了 `--bg-hover` / `--text-muted` / `--text-code-*` / `--syntax-string`,**打破了 `ui-token-vars.test.ts` 的架构规则**(`components/` 下颜色必须经 `--ui-` / `--hg-` / `--diff-` 语义层)。已全部改走 `var(--hg-syntax-<组>-fg, var(--text-code-<x>))` —— 与 `--syntax-*` 别名同一条链,只是展开写,因为别名只覆盖 11 组中的 6 组(而 `css-mapper.ts:714` 的 `--hg-${token}-${suffix}` 运行时把 11 组全发了)。

验证(压测台 `.bench-p5/`,已删除):`--hg-syntax-keyword-fg` 改值 → shadow DOM 内 span 颜色瞬时跟随、无重渲染、改回精确复原;明暗两态底色/行号/词级强调各自正确且互不相同;`--diffs-addition-base` 无占位色残留。

### 遗留

1. **展开规则已重定为「只有需要决定时才展开」**(2026-07-15,两轮修正后定案)。

   ```
   awaiting-confirmation + write/edit  → 展开(要你批准,就得让你看见)
   其它一切(含 streaming-input、completed)→ 折叠
   ```

   两条被否决的中间态,记录以免重蹈:

   - **落定态自动展开** —— 用户否决("很烦")。它真正新增的只有「**历史**会话重开时每个 diff 都摊开」:`StepsPanel.vue:337` 传的是 `defaultCollapsed`,而 `CollapsePanel.vue:385` 的 `internalExpanded` 只用它播种初始值、没有 watcher,所以流式期间展开的面板本就会保持展开到完成。该改动波及 8 条跨两个文件的既有测试 —— **测试的抵抗就是信号**,当时该听。
   - **流式态自动展开**(仓库原有行为)—— 用户否决。模型还在吐参数时没有任何决定要做,摊开只是噪音。

   为什么审批态反而要展开:审批面板(`ChatPanel.vue:36-60`)只给出文件名与 `permissionPreview()` 的返回值,而后者对 edit **只返回 `+3 -1` 这样的统计,不含任何改动内容**(`ChatPanel.vue:392-396`)。也就是说,原先你是在**看不见改了什么**的情况下批准一个 edit。行内展开是唯一能看到的地方 —— 而此时 `changes.diff` 已经是**真 patch**(见开头「实施期推翻的一条核心论断」),不是预测。

   连带更新的既有测试:`tool-step-view.test.ts` 3 条、`tool-activity-view.test.ts` 2 条(其中 `keeps permission and failed rows collapsed by default` 更名为 `opens a permission row and keeps failed rows collapsed` —— 失败行仍折叠,其行内摘要已把事情讲完)。

2. **行号跳变**问题随伪 diff 一并消失,无需再验证。
3. `DiffOverlay` 承载的「工作区级 `git diff`」能力随 P1 消失。若日后需要,那是独立功能(数据源是整个工作区,非单次工具调用),不应与本方案混谈。
4. **`stores/chat.ts` 的 request 快照 ring buffer 已确认无任何消费者**(`getRequestSnapshots` 仅在 store 内部与导出面),随 `ChatInspectorPanel` 的 Request tab 一同失去用户。**保留未删** —— 它由 runtime 的 `request:snapshot` 事件喂养,属诊断能力,删除需动事件接线,超出 diff UI 范围。注释已改为如实描述。
5. `ChatContainer.vue` 的 `'FrameRequestCallback' is not defined` 是既有 lint error(改动前即存在),未处理。
