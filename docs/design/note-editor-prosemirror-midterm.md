# Todo/Notes 编辑器中期方案:渲染优先重写(Typora 级)

日期:2026-07-12
状态:**P0–P5 全部实施完成(未提交)**。使用方式:设置 → Editor → Notes Engine 开关(或 `settings.general.editor.noteEngine: 'prosemirror'`);默认仍为 codemirror,真机体验后再决定翻转。

## 实施结果摘要

- 代码:`src/renderer/editor/prose/`(schema/markdown-io/input-rules/keymap/editor/node-views/commands/offset-map/ProseNoteEditor.vue/note-editor.css),约 2100 行;`scripts/markdown-roundtrip-audit.ts`。
- 测试:`prose/__tests__/markdown-io.test.ts` 24 用例(canonical 逐字节 fixed-point + 幂等 + frontmatter/数学 flanking/任务/表格管道);全仓受影响套件 207 过;typecheck/lint 干净。
- 浏览器 E2E 已验证:全语法渲染(截图)、打字即渲染(**bold**/任务/围栏 Enter/HR Enter)、勾选框点击→`- [x]` 序列化、undo/redo(真实键盘)、方向键进出内嵌 CM 代码块、native caret 逐字符单调遍历跨块正确、Handle 契约全流程(find 偏移 setSelection/applyCommand/附件 replaceRange/外部共写更新)、**块级 diff:AI 尾部追加时用户选区原地不动**。
- 性能(1200 行中文任务文档):mount 21ms、单键 1.7ms、serialize 4.1ms——远优于预算。
- P0 审计(真实语料):todo-plan 零解析失败/零非幂等,churn 全为良性空行折叠;详见下文 P0 节。

## IME 手测清单(真机放量前必过,macOS 拼音)

- [ ] 段落中文组合输入:候选、上屏、退格删组合
- [ ] 组合中按 Enter / ESC 不破坏文档
- [ ] 组合中触发输入规则边界(打"**測試**"中文引号不误触发)
- [ ] 表格单元格内中文组合
- [ ] 代码块(内嵌 CM)内中文组合与进出
- [ ] frontmatter textarea 中文组合
- [ ] 组合进行时外部更新到达(AI 共写)不打断组合
- [ ] 候选框跟随 caret 位置正确(折行行、表格内)

## 放量策略

默认 `codemirror` 不变;IME 清单全绿 + 一周日常使用无回退项后,把 `DEFAULT_EDITOR_SETTINGS.noteEngine` 翻为 `prosemirror`;CM 引擎保留一个版本周期。

---

以下为原方案(P0 审计结论已并入):

原状态:实施中。**P0 审计已完成,结论 GO**(`scripts/markdown-roundtrip-audit.ts`,bun 直接跑):
核心共写语料(todo-plan 13 文件/memory 19/notes 1)零解析失败、零非幂等,churn 全为良性空行折叠(13.2%/0.3%/0%);
压力语料(repo docs 44 文件)churn 3.8%,类别为转义增加、空行折叠、表格手工列宽对齐丢失、`_`→`*`——无破坏性类别。
审计过程修复 serializer 两个 bug:表格前段落粘连(cell 渲染劫持 state.out 吃掉 flushClose)、cell 内行首 `1.` 误转义(改为独立 cell 内联渲染器)。
前置:`docs/audit/todo-window-markdown-ui-2026-07-12.md`(短期方案已落地:CM6 内行内语法全面原子化,光标行为已收敛到 Typora 语义)

## 0. 目标与非目标

**目标**:todo window 的笔记编辑器换成**渲染优先**架构——DOM 即真相、浏览器原生 caret,markdown 只是打开时 parse、保存时 serialize 的格式。光标类 bug 从"逐个修"变为"结构上不存在"。

**非目标**:
- 聊天 composer 不动(仍是 CM6/TextEditor)。
- 不从零写 contenteditable 引擎(那是 Typora 自己的七年)。
- 不追求 markdown 字节级无损往返(见 §4 的现实策略)。

## 1. 架构决策

### 1.1 选型:裸 ProseMirror,不用 Milkdown

| | 裸 ProseMirror | Milkdown |
|---|---|---|
| 控制力 | 完全(schema/NodeView/serializer 全自定义) | 隔一层插件抽象 |
| 解析器 | prosemirror-markdown 基于 **markdown-it**(本仓库已有依赖,和现有渲染管线同源) | remark(新依赖树) |
| 深度定制成本 | 低(Properties 面板、画线主题、附件管线、内嵌 CM6 都是非标需求) | 每项都要绕过或 fork 插件 |
| 维护面 | prosemirror-* 官方包,极稳定 | 多一层第三方节奏 |

结论:裸 PM。依赖新增:`prosemirror-model/state/view/commands/keymap/history/inputrules/schema-list/tables/markdown/dropcursor/gapcursor`。

### 1.2 真相源翻转后,各责任的去向

| 现在(CM6 源码优先) | 之后(PM 渲染优先) |
|---|---|
| markdown 文本 + 装饰覆盖 | PM 文档树即真相,markdown 是 IO 格式 |
| 光标 = 源码偏移,画点自己算(本周修了三轮的地方) | 浏览器原生 caret,住在真实 DOM 里 |
| atomic ranges + reveal | 不需要;语法概念在文档树里根本不存在 |
| 表格/frontmatter widget + 输入框 | NodeView(同样是输入框,但成为一等公民) |
| 代码块 = 装饰出来的行 | NodeView 内嵌一个 CM6 实例(Typora 同款做法,焦点交接见 §6) |
| findMarkdownMatches 源码偏移 | PM 文档位置(需要适配,见 §5.2) |

### 1.3 共存与回滚

沿用 `settings.storage.sessionFormat` 的先例:新增 `settings.general.editor.noteEngine: 'codemirror'(默认) | 'prosemirror'`。TodoPlanPanel 按 flag 渲染两个实现之一,**两者实现同一个 `MarkdownDocumentEditorHandle` 契约**,面板层近零改动。CM 路线永远是退路,双引擎期间 CM 侧冻结只修 bug。

## 2. 阶段总览

| 阶段 | 交付物 | 退出条件 | 规模 |
|---|---|---|---|
| **P0 往返保真审计** | `scripts/markdown-roundtrip-audit.mjs` + 审计报告 | 真实语料的规范化 churn 率有数,**go/no-go 决策** | 0.5–1 天 |
| **P1 内核** | `src/renderer/editor/prose/` 最小编辑器:schema、parse/serialize、输入规则、history | 独立 harness 页可编辑基础 markdown,往返测试过 golden corpus | 2–3 天 |
| **P2 块能力** | 表格/任务/代码块(内嵌 CM6)/图片附件/frontmatter/数学/emoji 的 NodeView | 与 CM 版功能清单逐项对齐 | 3–5 天 |
| **P3 集成** | `ProseNoteEditor.vue` 实现 Handle 契约 + settings flag | todo window 切 flag 后全功能可用(find/格式命令/粘贴/链接) | 2–3 天 |
| **P4 共写与保真落地** | 外部更新 diff 事务、保存策略、golden corpus 进 CI | AI 共写场景无光标跳动、无 diff 战争 | 1–2 天 |
| **P5 验证与放量** | 光标扫描移植、IME 清单、性能基准、默认切换 | 扫描零异常 + IME 清单全绿 → flag 默认翻转 | 1–2 天 |

合计约 10–16 天工程。P0 是唯一的 no-go 闸门;P1–P2 可与日常使用并行(不碰现有代码路径)。

## 3. 各阶段细节

### P0 往返保真审计(先于一切代码)

最大风险不是技术,是**产品性**的:workspace AI todo 是用户和 agent 共写的文件,渲染优先编辑器保存时会规范化源文本,可能与 agent 的写入产生 diff 战争。

1. 写 `scripts/markdown-roundtrip-audit.mjs`:markdown-it parse → prosemirror-markdown 风格 serialize → diff。
2. 语料:`~/.onething` 下真实笔记 + workspace AI todo 历史 + 本仓库 docs/*.md。
3. 输出:逐文件 churn 行数、规范化类别分布(列表符号统一、缩进、空行、转义、引用式链接、setext→ATX……)。
4. **决策规则**:
   - churn 集中在"良性规范化"(`*`→`-`、尾随空白、围栏语言别名)→ go,serializer 按 agent 的输出风格调参(agent 用 `-`、`- [ ]`、ATX、fenced,天然接近 PM 默认)。
   - churn 含"破坏性"类别(HTML 块丢失、引用式链接展开、缩进代码块变形)且语料中真实存在 → 先做 §4.3 的块级补丁策略设计,或 no-go 留在 CM。

### P1 内核

```
src/renderer/editor/prose/
├── schema.ts          # doc/paragraph/heading/blockquote/lists/task_item/
│                      # code_block/table/image/hr/frontmatter/math_inline
├── markdown-io.ts     # parseMarkdown(text) → Node / serializeMarkdown(doc) → text
│                      # 基于 prosemirror-markdown,扩展 task/table/frontmatter/math tokens
├── input-rules.ts     # **x** → strong、`- ` → 列表、`# ` → 标题、``` → 代码块 …
├── keymap.ts          # 基础键位 + Backspace 解包语义(对齐现有 hiddenSyntaxDeleteHandler)
├── history.ts         # prosemirror-history(NodeView 内编辑并入同一 undo 栈,见 §6)
└── ProseNoteEditor.vue  # P3 才接;P1 用 __harness__ 页面驱动
```

退出验证:golden corpus(P0 语料快照)parse→serialize 幂等率达标进 vitest;基础编辑 + undo + 中文输入手测。

### P2 块能力(每项一个 NodeView,逐项对齐 CM 版)

| 能力 | 实现 | 对齐的现有代码 |
|---|---|---|
| 任务勾选框 | task_item NodeView,checkbox 在 contentDOM 外 | MarkdownTaskWidget(样式复用,对齐问题不再存在——checkbox 与文本同为 DOM 流内元素) |
| 表格 | prosemirror-tables + 画线主题;单元格是真编辑区 | MarkdownTableBlockWidget + 单元格 input(升级:单元格内直接打字、Tab 导航) |
| 代码块 | NodeView 内嵌 CM6(`@codemirror/language` 栈复用 `languages.ts`);外层 PM 只存文本 | 现 fallback 行渲染 + 折叠/Copy 工具条迁移 |
| 图片/附件 | NodeView + 现有 `resolveMarkdownAsset` IPC 缓存管线原样复用 | MarkdownImageWidget/markdown-attachments.ts |
| frontmatter | 文档首节点 NodeView = 现 Properties 面板 | MarkdownFrontMatterWidget |
| 数学 | math_inline node + 现 mathjax 渲染;`$` 输入规则带 flanking(短期方案的 MATH_RE 语义平移) | addMathDecorations |
| emoji | 输入规则 `:name:` → 替换为字符(存文档即 emoji 字符,serialize 不还原 shortcode——审计确认可接受;否则做 emoji node) | markdown-emoji.ts |

### P3 集成(契约适配)

`ProseNoteEditor.vue` 实现 `MarkdownDocumentEditorHandle`(markdown-document.ts:44):

- `focus/getValue/setValue` — 直接映射。
- `applyCommand(MarkdownCommand)` — 17 个命令(markdown-document.ts:20)映射到 PM commands(toggleMark/setBlockType/wrapInList/insertTable…),行为升级为真富文本切换。
- `getSelection/setSelection(from,to)` — **契约语义改为"当前文档文本坐标"**:PM 侧用 `doc.textBetween` 建 文本偏移↔PM 位置 的映射(find bar 的 `findMarkdownMatches(draft, query)` 在 serialize 后的文本上跑,偏移经映射转 PM 选区)。这是集成期最大的一块胶水,单独出测试。
- `setSourceMode/toggleSourceMode` — 源码模式 = 切换回 CM TextEditor 显示 serialize 结果(现成组件,免费)。
- 事件:`update:modelValue`(serialize 防抖,复用面板 260ms 保存)、`keydown/paste/openLink/openImage/cancel` 平移。

TodoPlanPanel.vue 改动:`<component :is="noteEngineComponent">` + settings 读取,其余零改动。

### P4 共写与保真落地

1. **外部更新不再整篇替换**:`applyDocument` 路径(TodoPlanPanel.vue:917 的守卫保留)把新 markdown parse 成 PM 文档,与当前文档做**块级 diff → 最小事务**,选区由 PM mapping 自动保持——比 CM 版的 `setValue({preserveSelection})` 绝对偏移钳制强一代,顺便消掉审计里的 R7。
2. **保存策略**:只有用户产生编辑才 serialize 写盘(现状即如此);打开即看不改不写,agent 的原文永不被动规范化。
3. golden corpus 幂等测试进 CI(vitest,快照对比)。

### P5 验证与放量

1. **光标扫描移植**:本周的四向遍历 + caret 可见 + x 单调 + y 不上跳 + lineWrapping 扫描,固化为 `scripts/editor-caret-sweep.mjs`(Playwright,harness 页),对 PM 版跑通零异常。
2. **IME 清单**(手测,macOS 拼音):普通段落组合、组合中回车/ESC、组合跨 NodeView 边界(表格单元格/代码块入口)、组合中外部更新到达、候选框定位。
3. 性能:1200+ 行文档打开/打字/滚动基准 vs CM 版。
4. flag 默认翻转 `prosemirror`,CM 保留一个版本周期后再评估删除。

## 4. 关键设计:往返保真

### 4.1 原则

- **不追求字节保真,追求"不惊扰"**:未被用户编辑的文档永不重写;被编辑的文档按 canonical 风格输出。
- **canonical 风格 = agent 风格**:serializer 调参对齐 agent 产出(`-` 列表、ATX 标题、fenced code、`- [ ]`),使规范化后的文本与 agent 后续写入天然一致。

### 4.2 已知规范化类别与对策

| 类别 | 对策 |
|---|---|
| 列表符号/缩进风格 | serializer 参数固定,一次性统一,良性 |
| 引用式链接 `[a][1]` | 语料审计定;若存在 → parse 保留为 link node + 序列化展开(有损)或 no-go 项 |
| HTML 块 | schema 加 html_block 原样节点(存原文,不解析) |
| 松散/紧凑列表 | prosemirror-markdown 原生支持 tight 属性,无损 |
| 转义与实体 | golden corpus 盯住 |
| emoji shortcode | 见 P2;serialize 为字符可接受即无事 |

### 4.3 备用:块级补丁(仅当审计触发)

markdown-it token 的 `map`(行区间)在 parse 时挂到块节点 attrs;serialize 时**未被事务触碰的块直接回吐原文行**,只有脏块走 serializer。工程量 +2–3 天,换取近字节级保真。默认不做,审计说话。

## 5. 风险与盲点

| 风险 | 等级 | 缓解 |
|---|---|---|
| 往返规范化 vs agent 共写 | **高** | P0 审计做 go/no-go;canonical=agent 风格;不改不写;备用块级补丁 |
| IME × NodeView 边界(中文用户核心路径) | 高 | PM 对 composition 处理成熟,但 P5 清单必须真机全绿才放量 |
| find/setSelection 文本偏移映射 | 中 | 独立模块 + 单测;find 是低频路径,可接受 O(n) 重建映射 |
| undo 跨 NodeView(表格单元格、内嵌 CM6) | 中 | 单元格编辑走 PM 事务(prosemirror-tables 原生);内嵌 CM6 的 undo 桥接按 Typora 模式(代码块内 CM 自己的 undo,边界处合并)——P2 明确验收 |
| 双引擎期维护 | 中 | CM 侧冻结;bug 只在 flag 默认侧修 |
| 内嵌 CM6 焦点交接(点击/方向键进出代码块) | 中 | gapcursor + arrow 处理是 PM 社区成熟配方,P2 验收项 |
| 主题迁移(画线风/--todo-* 变量) | 低 | NodeView 全部 class 化,复用现有变量 |
| 大文档性能 | 低 | PM 按需渲染;附件解析缓存复用 |

## 6. 明确不迁移的东西

- 聊天 composer、prompt-cards、triggers:留在 CM6/TextEditor。
- `markdown-live-preview.ts`:保留服务于 CM 引擎(退路)与 composer 的只读预览场景;短期方案的不变量测试(106 项)继续守护它。
- 短期方案建立的编辑语义(原子穿越/三条编辑通道/Backspace 解包)是 PM 版的**行为验收标准**——新引擎不得倒退。
