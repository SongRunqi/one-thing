# 工具执行 UI 结构重构 — 最终方案（A′）

日期：2026-07-04（按用户反馈调整后的定稿方向）
状态：**方案 A′ 已实施**（2026-07-04，8 步全部落地；遗留：完成 600ms 自动折叠受 NestedCollapse 非受控状态限制记为 follow-up，15 主题对比度自动化以 token 链顺序断言的轻量版落地）；方案 B 已否决；方案 C 归档为可选补充（文末附录）
前置：2026-07-03 已完成终端极简视觉层改造（去 chip、左竖轨、token 链修复）。

## 用户调整决定（2026-07-04）

1. **不要状态圆点**。状态改由两件事表达：执行中**工具名文字的"流逝"动画**（渐变扫光）+ 毫秒级计时器。
2. **每个工具一个精心挑选的 icon**，放在工具名左侧（原圆点的位置），用图形直接区分工具种类。
3. 主参数、统计（+N -M 等）维持原方案 A 设计不动。
4. **结果区必须充分 flex**：窗口大小随用户喜好调整，任何窗口尺寸下不允许内容溢出、不允许看不到。
5. **edit 失败紧凑化**：不再把 file_path/old_string/new_string 拆成三个松散参数块（现在收缩态显示 error、展开更庞大，占大半屏）；相关信息合并、密度提高。
6. **分组按"同一批并行调用"**（模型一次回复的 tool_calls array = 一个 group），不再按"连续同类命令"分组。
7. 方案 B（终端转录）丢弃；倾向方案 A。

---

## 一、问题清单 → 代码根因

| # | 问题 | 根因（代码位置） |
|---|------|------|
| 1 | 命令显示不全 | `StepsPanel.vue` `.node-target-name { nowrap + ellipsis }`，单行截断，全文只在 tooltip |
| 2 | 看不到参数 | `tool-activity-view.ts` 把整个 toolCall 压缩成一个 `target` 字符串，其余参数全部丢弃 |
| 3 | 动词规则混乱 | 三套动词体系并存：`tool-display.ts` `TOOL_VERBS`（20+ 工具×三时态）+ `tool-ui-registry.ts` `CATEGORY_VERBS`（7 类×3）+ 失败态动词重组（"Edit failed:"）。看到 "Ran/Matched/Called" 无法反推工具 |
| 4 | bash result UI 奇怪 | `ToolResultRenderer.vue` 行分类渲染：命令在输出区**重复出现**，结尾追加 "⚡ Done in Xs" 行 |
| 5 | read 有分页面板 | `READ_LINES_PER_PAGE = 8` + more 按钮 |
| 6 | edit error 占大半屏 | `ToolStepDetails.vue` 失败时同屏三块：errorSummary + old/new 两个完整 `<pre>` + error details，无高度上限，信息松散 |
| 7 | edit 成功有多余提示行 | `.detail-note-row`（"Successfully edited …"）与标题行信息重复 → **删除** |
| 8 | 分组不合理 | 连续同 category ≥2 就建组，组头无信息量，徒增缩进 |

## 二、目标（验收标准）

1. 一眼知道是什么工具在执行（**icon + 工具名**双通道）
2. 一眼看到参数（主参数完整可见，其余一步展开）
3. 直接看到 result（不重复、不奇怪、不越权占屏）
4. 执行时间毫秒级连续递增
5. 统一布局：所有工具同一行解剖
6. 清晰明了
7. 状态过渡丝滑连续；**任何窗口尺寸下不溢出**

---

## 三、最终方案 A′ 规范

### 3.1 行解剖

```
<icon> ToolName(主参数)  [+12 -4]                    1.284s
  ⎿ 结果区（统一缩进块，responsive 高度）
```

示例（执行中 Bash 的工具名带扫光动画，此处无法静态表示）：

```
▤ Bash(cd ~/data/work/lenovo-scripts && ls *.lua)     1.28s
  ⎿ answeraleg.lua
    apipost.lua
    … +14 lines

▧ Read(src/main/index.ts:1-120)                       0.4s
  ⎿ 120 lines

✎ Edit(StepsPanel.vue)  +12 -4                        0.9s

▤ Bash(bun run lint:ci)                               2.1s
  ⎿ ESLint found 2 problems in StepsPanel.vue          ← 红色首行常驻
```

### 3.2 工具 icon 选型（lucide-vue-next，已是依赖）

统一规格：13px、stroke 1.75、静态色 = 行文字的 faint 层（`--activity-title-fg`）。

| 工具 | icon | 理由 |
|------|------|------|
| bash | `Terminal` | 终端原型符号，小尺寸下辨识度最高 |
| read | `FileText` | 带文字行的文件 = 读内容 |
| write | `FilePlus2` | 文件+号 = 新建/写入 |
| edit | `FilePen` | 文件+笔 = 修改 |
| grep | `TextSearch` | 文字+放大镜 = 内容搜索 |
| glob / find | `FolderSearch` | 目录+放大镜 = 路径匹配 |
| ls | `FolderOpen` | 打开目录 |
| web_search | `Globe` | 全球网络 |
| web_open | `ExternalLink` | 打开外部页面 |
| web_find | `ScanSearch` | 页内查找 |
| calculator | `Calculator` | 同名 |
| variable | `Variable` | 同名 |
| todo / todo_plan | `ListTodo` | 同名 |
| time | `Clock` | 时间 |
| project_dirs | `FolderCog` | 目录管理 |
| MCP 工具 | `Plug` | 外部插件/服务器 |
| task / agent | `Bot` | 子代理 |
| skill | `Sparkles` | 技能 |
| fart（彩蛋） | `Wind` | :) |
| 未知工具 | `Wrench` | 通用工具兜底 |

实现：`tool-ui-registry.ts` 增加 `TOOL_ICONS: Record<string, Component>` + `getToolIcon(toolName)`，与 alias 表共用规范化逻辑。新增 `ToolIcon.vue`（替换 ToolStatusDot 的槽位，保留 14px 定宽槽对齐机制）。

### 3.3 状态表达（无圆点版）

| 状态 | 表达 |
|------|------|
| queued / pending | 整行 55% 透明度，icon 静态 |
| streaming-input（参数流入中） | 工具名+参数**扫光动画**（见下），计时开始 |
| executing | 工具名**扫光动画** + 计时器 80ms 递增；icon 提为 accent 色 |
| awaiting-confirmation | icon 变 warning 色 + 行尾 mono 小字 `待确认`（慢闪 2s） |
| completed | 全静态，计时冻结常驻行尾，icon 回 faint 色 |
| failed / rejected | icon 变 danger 色 + errorSummary 红色首行常驻（已有） |
| cancelled | 55% 透明度 + 行尾 `已取消` |

**流逝动画**：复用 `CollapsePanel.vue` 已有的 `.is-running .collapse-panel-title-text` 渐变扫光实现——`linear-gradient(90deg, muted 40%, bright 50%, muted 60%)` + `background-clip: text` + `background-position` 无限扫动（周期 ~2s）。迁移为 StepsPanel 标题元素上的 `.is-flowing` 类，扫光色从 `--activity-row-fg` 到 `--activity-hover-fg`。`prefers-reduced-motion` 下退化为静态 accent 着色。

删除 `ToolStatusDot.vue`（7-03 刚建，沉没成本忽略；其 14px 定宽槽和状态 class 命名由 ToolIcon 继承）。

### 3.4 标题：工具名 + 主参数（沿用原 A，不变）

- 废三套动词表，标题 = `ToolName(主参数)`，工具名 mono 中权重，参数 mono 常规。
- 主参数**单行截断**（2026-07-04 修订：原 2 行 clamp 方案导致长 bash 命令行高不一、与其他单行工具行节奏冲突，且 CSS 换行不认 shell 语义断点，观感差）。所有行等高；被截断的命令**保证**在展开区完整可读——bash 的 command 参数无条件全文放入展开参数区，且 bash 行始终可展开（即使没有输出）。
- 命名表：bash→完整命令；read→`路径:行区间`；edit/write→文件名 + 行尾 `+N -M`；grep→`"pattern", 范围`；glob→pattern；web_search→`"query"`；mcp→`server.tool(arg)`；未知→原始 toolName。
- 实现：`tool-display.ts` 重写为 `buildToolTitle(toolCall): { icon, name, args, statsSuffix }`；`tool-activity-view.ts` 增加 `toolLabel / primaryArg / fullArgs` 结构化字段。

### 3.5 结果区（⎿ 区）：responsive 优先

**尺寸规范（核心调整）**：
- 高度：`max-height: clamp(96px, 26vh, 280px)`——小窗口自动收窄，大窗口最多 280px；内部滚动。
- 宽度：所有层级 `min-width: 0`；文本默认 `pre-wrap`（bash 输出、错误文本永不横向溢出）；代码/diff 需保格式的场景在**自己的容器内** `overflow-x: auto`，绝不撑破消息列。
- 窄容器适配：StepsPanel 根已有 `container-type: inline-size`，加容器查询——容器 < 480px 时缩进从 20px 收到 10px、结果区左移，保证窄窗口下内容宽度优先。
- 展开的参数区/错误区同样受 `clamp` 高度约束。

**各工具结果内容**：
- bash：只显示 stdout/stderr（**删除输出区重复的命令行和 "Done in" 行**）；默认尾部 6 行 + `… +N lines` 文本行点击展开全部（无按钮面板）。
- read：摘要 `⎿ 120 lines`，点击展开为单一滚动区（**删除 8 行分页 + more 按钮**）。
- edit/write 成功：默认折叠，仅标题行 `+N -M`；点击展开 diff 预览（现有 ToolDiffPreview）。**删除 detail-note-row 成功提示行**。
- web_search：沿用 WebSearchResultRenderer（本轮不动，只受高度 clamp 约束）。

### 3.6 edit 失败：合并紧凑块

现状三块松散参数 → 合并为**一个"意图 diff"块**：old_string 各行渲染为 `-` 红、new_string 各行渲染为 `+` 绿，拼成一个紧凑 diff（复用 ToolDiffPreview 的行样式，无行号 gutter），语义 = "AI 想做但没做成的修改"。

- 收缩态（默认）：仅标题行 + errorSummary 红色一行（如 `No matching text found for old_string`）。**收缩态不再渲染任何参数块**。
- 展开态：错误全文（`max-height: clamp(64px, 15vh, 120px)`）+ 意图 diff 块（`max-height: clamp(96px, 20vh, 160px)`）。两块合计最坏 ~280px，不再占大半屏。
- file_path 不单独成块（已在标题里）。

### 3.7 分组：按并行批次（turnIndex）

数据支撑：`src/shared/ipc/chat.ts` `Step.turnIndex` 已存在——同一轮模型生成里并行发起的 tool_calls 共享同一 turnIndex。

- **分组键 = turnIndex**：同一批并行调用 = 一个 group；批内只有 1 条时**渲染为普通单行，无任何组 chrome**（根治问题 8）。
- 顺序串行的调用（每轮一条）永远不会被分组——即使是连续 5 条 bash。
- 组头：前 3 个工具的 icon 叠排 + `N tools`（异构批次不再硬凑 "Run N commands" 这类动词短语）+ 批次计时（批内最长耗时）。
- 组行为：任一成员执行中 → 默认展开；全部成功 → 完成 600ms 后自动折叠为组头一行；含失败 → 保持展开。
- 兜底：turnIndex 缺失的旧会话数据回退为全部平铺（不分组）。

### 3.8 计时（2026-07-04 调整：精度封顶 0.1ms）

**数据层（小协议增项）**：现状 `ToolCall.startTime/endTime` 是 `Date.now()` 整数毫秒，天然不含亚毫秒信息。工具执行层（`tool-execution.ts`）改用 `performance.now()` 记录高精度时长，`ToolCall` 增加可选字段 `durationMs?: number`（浮点，如 `843.27`）；旧会话数据回退 `endTime - startTime`（整数 ms，显示时小数位补 0 不装精度——回退值显示为 `843ms` 而非 `843.0ms`）。

**显示格式**（粒度上限 0.1ms，不再往下）：

| 时长 | 格式 | 示例 |
|------|------|------|
| < 1s | 毫秒 + 1 位小数（0.1ms 粒度） | `843.2ms` |
| 1s – 60s | 秒 + 3 位小数（1ms 粒度） | `1.284s` |
| ≥ 60s | 分秒 | `1m03.2s` |

秒级以上不带满 0.1ms（会变成 `1.2843s` 四位小数的读数噪音）；0.1ms 是精度上限而非全程强制。若希望秒级也满精度，改一行格式函数即可。

**刷新机制**：执行中 80ms tick 更新（tick 是刷新频率，不是显示精度），`tabular-nums` 防数字宽度抖动；完成后以 `durationMs` 高精度终值**冻结常驻**行尾。单一 `durationNow` ref 驱动所有执行中行。

### 3.9 过渡动画（沿用原 A，替换圆点相关项）

- 展开/折叠：`grid-template-rows: 0fr↔1fr` + 0.22s ease-out（替代瞬间跳变）。
- 流式增长：容器不动画，新行 60ms 淡入 + 自动跟随滚动。
- executing→completed：扫光动画 0.3s 淡出停止 → 计时数字定格 →（若为自动展开的详情）600ms 后自动折叠。
- icon 状态变色：0.15s color transition。
- 全部尊重 `prefers-reduced-motion`。

### 3.10 色彩与主题适配 QA（2026-07-04 新增）

本方案新增的每一个颜色都必须走 `--ui-*` 语义 token + fallback 链，并通过下面三道验证——教训来自 7-03 发现的事故：`--ui-tool-text-muted-fg` 链路顺序错误导致 15 个主题专门定义的工具参数色被静默遮蔽了近一个月。

**A. 本方案的颜色 token 清单**（新增/依赖的全部前景色）：

| 用途 | token 链 |
|------|---------|
| icon 静态 | `--activity-title-fg` → `--ui-tool-text-faint-fg` → `--text-tool-label` |
| icon 执行中 | `--ui-tool-accent-fg` → `--color-primary` |
| icon 待确认 | `--ui-status-warning-fg` |
| icon 失败 | `--ui-tool-danger-text-fg` |
| 扫光渐变（暗端→亮端） | `--activity-row-fg` → `--activity-hover-fg`（**不硬编码白/亮色**，用 color-mix 基于当前主题前景生成，避免浅色主题扫光不可见、暗色主题过曝） |
| 意图 diff 红/绿 | `--ui-tool-danger-text-fg` / `--ui-tool-success-text-fg` + 4% 底色 wash |
| errorSummary | `--ui-tool-danger-text-fg` |
| 计时/meta | `--ui-text-faint-fg` |

**B. 链路完整性测试**：扩展 `src/renderer/styles/__tests__/ui-token-vars.test.ts`——对上表每个 token 断言：① 在 `variables.css` 中有定义；② fallback 链的每一环存在；③ 主题专有色（`--text-tool-*`）排在 neutral 通用色**之前**（防再次遮蔽）。

**C. 对比度自动验证**：新增 vitest 遍历全部内置主题 JSON（15 个），解析每个 token 链的最终色值，与该主题聊天背景（`--ui-surface-chat-bg`）计算 WCAG 对比度，断言：正文级前景（标题、参数、结果文本）≥ 4.5:1；辅助级（icon 静态、meta、计时）≥ 3:1。实现参考仓库已有先例 `packages/onething-runtime/src/themes/__tests__/builtin-theme-contrast.test.ts` 和 resolver 的 `readableAgainst` 钳制逻辑。

**D. 视觉抽查**：预览 harness 在 one-dark、tokyo-night、github-light、solarized-light 四主题各截一轮（覆盖暗/亮 × 高/低对比组合）；重点看：扫光动画在浅色主题下是否可见、意图 diff 的 4% wash 在暗色下是否成脏色、icon faint 色是否淹没。

---

## 四、改动面与落地顺序

涉及文件：`tool-display.ts`（标题重写）、`tool-ui-registry.ts`（icon 表）、`tool-activity-view.ts`（结构化参数）、新建 `ToolIcon.vue`（删 `ToolStatusDot.vue`）、`StepsPanel.vue`（模板/分组/计时/扫光）、`ToolResultRenderer.vue`（bash/read 简化）、`ToolStepDetails.vue`（edit 失败紧凑块、删 note-row）、`ToolDiffPreview.vue`（行样式复用导出）。不动：数据层事件协议、WebSearchResultRenderer 内核。

建议 commit 顺序（每步独立可验证：vitest + TMP/tool-ui-preview harness 截图）：

1. 命名层：`buildToolTitle` + 删三套动词表（问题 3）
2. icon 体系：TOOL_ICONS + ToolIcon.vue 替换 ToolStatusDot + 状态表达迁移（含扫光动画）
3. 标题 2 行 clamp + 完整参数展开区（问题 1、2）
4. 结果区 responsive 规范 + bash/read 简化（问题 4、5 + flex 要求）
5. edit 失败紧凑块 + 删成功 note（问题 6、7）
6. turnIndex 批次分组（问题 8）
7. 计时：`durationMs` 协议字段（performance.now）+ 80ms tick + 0.1ms 格式 + 常驻；grid-rows 过渡 + 自动折叠（目标 4、7）
8. 色彩 QA：token 链完整性断言 + 15 主题对比度测试 + 四主题截图抽查（§3.10）

---

## 附录：已否决/归档方案

- **方案 B「终端转录」（已否决，2026-07-04）**：全部工具伪命令化为 `$ cmd` transcript。否决原因：非 console 工具伪装成命令有认知成本，长命令全文 wrap 占屏，diff 嵌入风格冲突。其"命令全文可见"的优点已吸收为 A′ 的可选设置项（bash 标题 clamp 2 行 vs 全文）。
- **方案 C「行内极简 + Inspector」（归档备选）**：行内一行、详情进右侧 ChatInspectorPanel（`CATEGORY_INSPECTOR_TABS` 已有映射）。不作为主形态（看 result 多一次点击），但保留为 A′ 的补充入口：标题行 hover 显示 ↗ 按钮跳转 Inspector 查看全量输出/diff——大结果的"第二屏"。
