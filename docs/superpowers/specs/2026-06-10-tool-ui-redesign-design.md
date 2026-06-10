# Tool UI 调整方案

**日期**: 2026-06-10
**状态**: 设计稿，待确认
**关联文档**: `docs/superpowers/plans/2026-06-10-tool-ui-refactor.md`（代码层重构 plan，问题编号 P1–P16 出自该文档）

## 现状一句话

当前有两套视觉体系（流式阶段的旧卡片 `ToolStepItem` ↔ 落地后的时间线 `StepsPanel`），行上的信息有三处冗余（动词时态、status label、error tag 在说同一件事），关键操作（打开文件、审批）要么是假的（P5）要么藏在屏幕另一端（P6）。

## 设计原则（4 条）

1. **一个工具调用 = 一个原位演化的行。** 从 streaming → running → done/failed，同一个 DOM 节点只换状态不换体系，永不跳变。
2. **三层信息密度。** 扫一眼（行）→ 展开（inline 详情）→ 深查（Inspector）。每层只补充上一层没有的信息，不复读。
3. **状态只说一遍。** 用「图标形态 + 动词时态」表达状态，删掉重复的 status 文字和 error tag。
4. **审批统一在输入框。** 审批操作只在输入框上方的 permission panel；时间线行只做等待状态的标识（⚠ + warning 色），不承载操作。

---

## 1. 统一行解剖（所有工具、所有阶段同一布局）

```
┌──────────────────────────────────────────────────────────────┐
│ [icon] Edited  tool-step-view.ts      +148 −187 · 1.2s  ↗  ⌄ │
│   │      │           │                      │           │   │ │
│   │      │           └ 可点=open-file       └ meta 槽    │   └ 展开
│   │      └ 动词（时态=进度）   （hover 显示完整路径）      └ 打开 Inspector
│   └ 分类图标，状态用颜色/形态表达
└──────────────────────────────────────────────────────────────┘
```

相对现状的具体改动：

- **行尾增加 `↗`（open in Inspector）小按钮**，按 registry 的 `getInspectorTab`（已实现于 `tool-ui-registry.ts`，commit f82c946）决定打开哪个 tab。这把旧卡片「点行=跳 Inspector」和时间线「点行=展开」两种冲突行为（P3）收敛成显式的两个入口：**点行主体=展开，点 ↗=深查**。
- **target 文件名真正可点**（P5 的产品答案）：`file-link` 配色保留，点击触发 open-file；read 工具也是打开文件本身，不再隐式映射到 diff tab。
- **meta 槽去重**：现在 `getActivityMetaText` 在非 Done 时追加 "Running"/"Preparing"，而动词已经是 "Editing" 进行时——同义反复。改为 meta 只放 `stats · duration`，状态完全交给图标+动词。
- **preview 不再夹带 stats**：`tool-preview.ts` 的 edit 分支会生成 `"a.ts (+1 -2)"`，导致 `StepsPanel` 需要 `isDuplicateDiffMeta` 这种字符串归一化 hack 去重。根治：preview 永远只是目标，stats 永远走 meta 槽，hack 直接删除。

## 2. 状态视觉表（9 态收敛为 6 种视觉形态）

| 状态 | 图标 | 动词 | 行级附加 |
|---|---|---|---|
| queued / pending | 暗色空心点 | base（Edit） | 无 |
| streaming-input / executing | spinner（accent 色） | run（Editing…） | duration 每秒走表 |
| awaiting-confirmation | ⚠ warning | base（原形=尚未执行） | 无（审批统一在输入框上方的 permission panel） |
| completed | ✓（弱化，faint） | done（Edited） | stats |
| failed | ✕ 红 | "Edit failed:" | 常显失败摘要块（含 Next 建议） |
| rejected | ⊘ 橙 | "Rejected edit:" | 一行 "Permission was rejected" |
| cancelled | − 灰 | "Cancelled edit" | 无 |

**动效规范**：只保留 spinner 和 150ms 的颜色过渡。旧卡片的 `tool-pulse-glow` / `tool-warning-pulse` 呼吸动画随旧体系一起删除——常驻脉冲在多工具场景下是噪音。

## 3. 流式阶段：同行原位演化（替代双体系，修 P1/P2）

- tool call 一出现（input-streaming）就渲染**时间线行**：spinner + "Editing …"，path 从 streamingArgs 流出后目标名渐现（`formatToolCallPreview` 已有这能力）。
- write/edit 在 streaming 期间**默认展开**，下方是已有的 streaming diff 视图（自动滚底、220px 上限）；完成时自动折叠为 `+N −M`，但**用户手动展开过则保持展开**。
- 完成/失败时图标和动词原位切换，无任何容器/布局变化。

## 4. 分组 = 同一布局的退化形态（消灭 1→2 跳变，修 P9）

单条和组内行使用**完全相同的 row 组件**。组只是「汇总头 + 缩进的相同行」：

```
▸ 3 edits   +201 −45 · 4.1s   [1 failed]     ← 汇总头（折叠态）

▾ 3 edits   +201 −45 · 4.1s
  │ [✓] Edited  tool-preview.ts      +12 −4 · 0.8s   ↗ ⌄
  │ [✕] Edit failed: app.ts                          ↗ ⌄
  │     ┌ No match found for oldText · Next: 调整目标文本后重试 ┐
  │ [✓] Edited  chat.ts              +189 −41 · 2.1s  ↗ ⌄
```

- 同类第 2 条到来时，第 1 条的 DOM、展开状态、样式**全部不变**，只在上方插入汇总头——视觉零跳变（配合单一 expandedMap）。
- 折叠的组头**常显** `N failed` 红 badge（修 P8：失败不再被折叠吞掉）；含 failed/awaiting 的组保持自动展开（现有默认规则保留）。
- 组汇总文案降噪：`Edited 3 files` → `3 edits`（动词信息已在行上，头部只要计数+聚合 stats）。

## 5. 审批：统一在输入框（修 P6 的最终决定）

审批操作**只在输入框上方的 permission panel**（Allow / Session / Workspace / Reject / Reject with instruction + 键盘 Enter/D），时间线行**不承载任何审批操作**。

- 时间线行只做状态标识：⚠ 图标 + base 动词（"Edit a.ts"）+ warning 色调，表达「这行在等输入框那边的决定」。
- 时间线与 panel 用同一 warning 色系建立视觉关联，无需按钮或滚动联动。
- 随之而来的清理：`StepsPanel` / `MessageBubble` / `MessageItem` 上整条 confirm/reject emit 死链（P6）直接删除，不复活。

## 6. 展开层 vs Inspector 的分工契约

| | inline 展开 | Inspector |
|---|---|---|
| 定位 | 快速验证「它做了什么」 | 深查「完整证据」 |
| 内容 | 内容本身：diff、终端盒（命令+输出一体）、文件内容、失败 edit 的 oldText 引用块 | 全量 diff、browser 预览、原始参数 JSON、原始 request/response |
| 入口 | 点行主体 | 行尾 ↗（tab 由 registry 决定） |

失败信息同时收敛（修 P14）：**行级失败摘要块是唯一摘要**；展开层不再重复一遍不同措辞的摘要，只补充增量信息（失败参数 JSON、原始错误全文，沿用现有 details 折叠）。

## 7. 微交互规范（hover / 展开动画 / 反馈）

交互性的目标：**每一个可点的东西在 hover 时都有明确回应，每一次状态变化都有连续的视觉过渡，且全部可被打断**。

### 7.1 Hover 层级

| 元素 | 默认 | hover |
|---|---|---|
| 行（has-details） | 透明底 | 背景轻染（ink 3%）+ 文字提亮一档；**只用颜色，不用字重** |
| target 文件名（file-link） | accent 混色 | 纯 accent + underline，cursor: pointer |
| 行尾 `↗` / `⌄` 按钮 | 隐藏（opacity 0） | 行 hover 时渐显（opacity 1, 120ms）；按钮自身 hover 再提亮 + 轻背景 |
| 组汇总头 | 同行 | 同行规则 + chevron 提亮 |

**修复现有 jitter bug**：现在 hover 把 `font-weight` 从 500 改到 560（`StepsPanel.vue:692` 组头、`:831-834` 行内），字重变化导致文字宽度变化，整行内容在 hover 瞬间横向抖动。规范：**hover 永远不改 font-weight / font-size / padding**，只动 color / background / opacity / transform。

行尾按钮 reveal-on-hover 的理由：安静态下时间线只有「动词 + 目标 + meta」，操作图标不参与信息扫描；指针意图出现时操作才出现。触屏/键盘可达性由 focus-visible 兜底（见 7.4）。

### 7.2 展开 / 收起动画

**现有方案的问题**：`max-height: 0 → 900px` 过渡（`StepsPanel.vue:936-944`）有两个固有缺陷——展开时实际内容若只有 200px，动画在前 1/4 时间就放完了（末段视觉加速、突兀停止）；收起时从 900 → 内容实际高度这段是空滞，肉眼看到「先卡一下再收」。内容超过 900px 还会被截断。

**新方案**：Electron 自带新版 Chromium，直接用原生 auto 高度过渡：

```css
.activity-inline-details {
  interpolate-size: allow-keywords;   /* Chromium 129+，Electron 可用 */
  height: 0;
  overflow: clip;
  transition: height 0.22s cubic-bezier(0.25, 1, 0.5, 1), opacity 0.16s ease;
}
.activity-inline-details.open {
  height: auto;                        /* 真实高度，时序精确 */
}
```

参数：展开 220ms `cubic-bezier(0.25,1,0.5,1)`（快入缓出），收起 180ms；内容同步做 opacity 0→1 + translateY(-4px)→0 的入场。CSS transition 天然**可中断可反向**——用户连点展开/收起不会出现动画排队或跳帧。

配套行为：
- 展开后若详情底部超出视口，`scrollIntoView({ block: 'nearest', behavior: 'smooth' })` 跟进一次。
- streaming 自动展开 / 完成自动折叠（第 3 节）走同一动画，速度一致，用户感知不到「自动」和「手动」是两种机制。
- chevron 旋转（-90°→0）与高度动画同时长同曲线，作为进度镜像。

### 7.3 点击反馈

- 行 active（按下瞬间）：背景再加深一档，**无过渡**（即时反馈），松开后 150ms 淡回。
- `↗`/`⌄` 按钮 active：`transform: scale(0.96)`，80ms。
- 点击 target 打开文件：按钮短暂高亮一次（accent 背景 8% 闪烁 300ms）作为「已触发」确认，因为 open-file 的结果发生在窗口外。

### 7.4 键盘焦点（修现有可达性问题）

现状 `.group-header:focus, .operation-row:focus { outline: none }`（`StepsPanel.vue:631-633`）把键盘焦点指示完全杀掉了，但行又设了 `tabindex` 和 Enter/Space 处理——键盘用户能操作却看不见焦点在哪。改为：

```css
.operation-row:focus-visible,
.group-header:focus-visible {
  outline: 1.5px solid var(--ui-accent-primary-fg);
  outline-offset: -1.5px;
}
```

鼠标点击不出 ring（`:focus-visible` 语义），键盘 Tab 到时有清晰指示。行尾按钮进入 Tab 序列；reveal-on-hover 的按钮在 `:focus-visible` 时同样强制显形。

注意：当前代码里 `.row-review-btn:hover, .row-review-btn:focus-visible { outline: none }` 把 focus-visible 和 hover 合写并杀掉 outline，正是这条规范要禁止的反模式（该按钮按第 5 节决定整体移除，连带消掉）。

### 7.5 状态切换动画

- 图标形态切换（spinner → ✓ / ✕）：120ms cross-fade + scale 0.85→1，一次性。
- 颜色过渡统一 150ms（第 2 节已定）。
- 失败摘要块出现：与展开动画同曲线的高度入场，不闪现。

### 7.6 性能约束

动画只允许 `transform` / `opacity` / `color` / `background-color`（+ 7.2 的 height via interpolate-size，单元素低频）。禁止 box-shadow 逐帧动画（旧卡片的 pulse 即此类）；hover 渐显的行尾按钮用 opacity 而非 display 切换，避免布局抖动。

## 8. 展开区内容协调性（修「展开后不协调」）

展开区现在是 4 种容器风格、5 种滚动高度、2 种宽度行为的拼贴。根源 + 规范如下。

### 8.1 根源：样式语境错位

`ToolStepDetails.vue` 的样式是为**已删除的 ToolStepItem 卡片**设计的（24px 横向 padding、border-top 分隔线、独立卡片假设），现在唯一宿主是 StepsPanel 的 inline 展开区，靠 6 条 `:deep()` 覆盖补丁强行改造（`StepsPanel.vue` 中 `:deep(.detail-section){padding:6px 0}`、`:deep(.args-toggle)`、`:deep(.terminal-card)` 等）。两层样式互相打架是所有不协调的结构根源。

**规范**：ToolStepDetails 按 inline 语境重写自身样式（横向 padding 归零、由父级控制缩进），删除 StepsPanel 全部 `:deep()` 补丁。组件只有一个宿主，就只设计一种语境。

### 8.2 容器风格统一为一种「内容框」

现状并排出现：terminal-card（边框+header 标题栏）、diff-preview（边框+6px 圆角+58% 底）、裸 `pre`（无边框纯填充+8px 圆角）、thinking/summary/error（左侧色条+4px 圆角）、bash-output / read-output（又一套）。

**规范**：
- **一种内容框**：`1px` 边框（border 色 38% 混合）+ `6px` 圆角 + subtle 底——即现 diff-preview 的方案，推广到 args、result、read 输出。
- header 标题栏只保留给 args（"arguments.json" / "bash" 有信息量）；其余内容框无 header。
- thinking / summary / error 保留左侧语义色条，但圆角与内容框统一为 6px。
- 间距只用 4px / 8px 两档（现状 3/4/5/6/7/8px 混用）。

### 8.3 滚动高度统一 token

现状：`pre` 280px / diff 220px（live 时 clamp(148px,24vh,220px)）/ result `min(240px,34vh)` 或 `clamp(132px,28vh,220px)` / error-details 140px / error-params 220px——同一个展开区五种框高。

**规范**：一个 token `--tool-pane-max: clamp(148px, 28vh, 240px)`，所有可滚内容框引用；error-details 这类次要内容用 `calc(var(--tool-pane-max) * 0.6)`。

### 8.4 运行中 → 完成不换渲染器

现状：bash 运行中 `liveOutput` 用裸 `pre`（`...` + 尾 8 行），完成瞬间切到 ToolResultRenderer 的 bash-line 结构（分行着色 + Zap 图标）——展开区在完成那一刻整体重排，和行级「不跳变」原则矛盾。

**规范**：运行中就用 ToolResultRenderer 渲染 partialResult（该组件已支持 `is-partial`），`liveOutput` 裸 `pre` 分支删除。完成时只是数据从 partial 变 final，DOM 结构不变。

### 8.5 展开区宽度固定

现状：单条模式 `.operation-list.single { width: fit-content }`，展开内容宽 `calc(100% - 34px)` ——**diff/结果框的宽度由行标题文本长短决定**，短命令展开出窄框、长命令展开出宽框；分组模式则固定 560px。

**规范**：展开区宽度统一为 `--activity-body-width`（min(560px, 可用宽)），与行标题宽度解耦。行头仍可 fit-content，展开层从容器拿宽度。

**实现注意**：「可用宽」必须用容器查询单位（timeline 根设 `container-type: inline-size`，宽度取 `100cqw`），不能用 `100vw`——视口单位在窄消息列（如开着 Inspector 时）会导致展开区溢出容器。

### 8.6 inline 不渲染原始参数（Arguments/Command 区移除）

`</>` 折叠行 + `arguments.json` 标题 + 原始 JSON 是「调试器视角」，且信息全部重复：bash 的命令同时出现在行标题、Command 区、终端盒首行（3 次）；edit/write 的 JSON 与 diff 同义；bash 失败的 Error 参数盒把命令说第 4 次。

**规范**：
- inline 展开层**不渲染任何原始参数 JSON**（Arguments/Command 区、Error 参数盒全部移除），原始参数是 Inspector（行尾 ↗）的职责。
- 失败 edit 是参数唯一有信息量的场景，改为**语义化呈现**：渲染 `edits[].oldText` 为代码引用块（mono、红色左条、faint 标签 "Text not found in file"），不带 JSON 包装。
- bash 终端盒保持「命令 + 输出」一体（盒首行 `> command`），行标题保留截断版命令作扫描线索。
- Error 区只剩 Details 原文折叠，且仅当原文与行级摘要不同、确有增量信息时显示。
- 只有参数没有任何可展示内容的行（如尚无输出的工具）不再可展开——参数看 Inspector。

### 8.7 文案与信息去重

- `successNote` 对 write 工具也输出 "Edited path · 1 replacement"（write 没有 replacement 概念）：edit 保留 replacements 信息，write 改为 "Wrote path"或直接不显示。
- 成功场景下 note 与行级 meta 的 `+N −M` 信息重叠，note 只在 attempted/failed 场景保留增量价值。

## 9. 保留不动的部分

- 时间线整体的「安静」气质（透明底、hover 才亮）、`ToolDiffPreview` 的 diff 视觉（sticky 行号槽、绿/红 gutter 主信号）、bash/read/web-search 的结果渲染器——这些已经是产品级质感，方案只动信息结构和交互，不动这些视觉语言。
- `FartCallItem` 彩蛋独立保留。

## 10. 实施状态与剩余工作

代码层重构 plan（`2026-06-10-tool-ui-refactor.md`）的 Task 1–6 已落地：

- `f82c946` Task 1：tool-ui-registry
- `c0c0ab8` Task 2–6：统一渲染路径（删 ToolCallItem/ToolStepItem）、单一 expandedMap、handleTargetClick(open-file)、时长 ticking、失败文案单源、ToolActivityDetails memoize

本设计稿在此基础上的**剩余工作清单**：

1. **移除 Review 按钮**（c0c0ab8 按旧 plan 加了 `row-review-btn` + `scrollToPermissionPanel`）——按第 5 节决定，审批统一输入框，行内不承载操作。
2. **行尾 ↗ Inspector 按钮**（消费 registry 的 `getInspectorTab`，第 1 节）+ 行尾按钮 reveal-on-hover（7.1）。
3. **微交互修复**（第 7 节）：hover 去 font-weight 变化、展开动画改 `interpolate-size` 方案、`:focus-visible` ring（删 `outline: none`）、图标切换 cross-fade。
4. **meta/preview 去重**（第 1 节）：meta 去 status 文字、preview 去内嵌 stats、删 `isDuplicateDiffMeta`。
5. **分组结构**（第 4 节）：汇总头 + 同构行、组头 failed badge、汇总文案降噪。
6. **展开区协调性**（第 8 节）：ToolStepDetails inline 化重写、统一内容框/高度 token/宽度、live→done 同渲染器、successNote 文案修正。
