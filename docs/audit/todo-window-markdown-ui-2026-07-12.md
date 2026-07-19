# Todo Window Markdown UI / 渲染问题调查报告

日期:2026-07-12
范围:Todo / Notes 独立窗口(及共用的聊天内卡片)的 Markdown 编辑与渲染链路。

> **修复状态(2026-07-12 同日落地,未提交)**:
> 已修复 —— R1(reveal 撤销行级 fold-hidden,含围栏行)、R2(数学/emoji/删除线统一豁免行内代码)、R3(MATH_RE 加 flanking)、R4(fold key 去位置化)、R5(围栏状态机:记 marker 字符+长度,闭合须匹配;表格 widget 也不再进围栏内)、R6(frontmatter 闭合遇空行即止)、R11(表格 input.size 按显示宽计 CJK×2)、R17(死 CSS 三组已删);
> C1(Command Panel 补 pin-note + 容器查询阈值 360→240)、C2(创建前 clamp 到可见屏幕)、C3(transparent-window-root 仅 mac)、C4(find/switcher 互关)、C5(resize/move 存盘 250ms 防抖 + 直接保存取消挂起)、C6(--ui-surface-note-bg 补 var fallback)、C7/C8/C9(死规则/死参数/no-op 规则已删)、C10(popover/find bar 改画线风:去投影、1px 强墨线,顺带消除阴影裁剪)。
> 未修(低优先级或有意保留):R7-R10、R12-R16、R18、R19、C11、C12。回归测试:markdown-live-preview.test.ts +9 用例、window-state.test.ts +4 用例。
>
> **追加修复(2026-07-12,用户上手后反馈,真实浏览器实测校准)**:
> 1. **勾选框与文本不对齐**——`.md-live-task-checkbox` 定位从 `top: 50%`(1em slot 的一半,实测比文本中心低 2.45px)改为实测校准的 `top: 0.365em`(em 随字号等比;15/18/21px 下残差 <0.35px)。
> 2. **光标在渲染 UI 附近移动异常**——新增 `EditorView.atomicRanges`(`buildMarkdownAtomicRanges`,从装饰集派生):隐藏行组(表格尾行/frontmatter/折叠代码/围栏行,含前后换行合并成组)与整行 widget(任务 marker、表格块、Properties、折叠摘要)成为原子单位,方向键一步跨越,不再出现 6 步不可见停留、逐行撑开布局、整表塌成原文行等问题。reveal 语义保留:选区覆盖(shift+方向/Cmd+A)仍显原文可编辑;revealed 的行自动失去 atomic(与 R1 的 markdownHiddenLineClass 联动)。行内语法(加粗/链接/emoji/数学)保持逐字 reveal 不变。附带行为变化:marker 后 Backspace 一键去掉整个 `- [ ] `(Notion 式);隐藏行组后 Backspace 删除整组(标准 CM atomic 语义,可 undo)。
>
> **第二轮修正(用户实测截图:光标浮在表格 widget 右边缘、按键"光标不动但 head 在动")**:第一版 atomic 的边界停靠点仍落在被 widget 整行替换的行上(表格块行首/行尾),caret 只能按 widget 几何画在边缘,且相邻原子共享边界产生一串视觉静止的停靠位。根因修正:① 全行 widget(表格块、Properties、折叠摘要、水平线 HorizontalRuleWidget)同样外扩 ±1;② 所有区间**按真重叠合并**成孤岛(相邻隐藏/widget 行经 ±1 外扩天然重叠 1 字符会合并;两个块之间仅"相触"的空行位置保留为停靠点,否则空行会不可达)。效果:整个表格/frontmatter/折叠块/HR 是一个孤岛,光标只停在相邻真实文本上。真浏览器全语法扫描(frontmatter/标题/粗斜删/行内码/数学/emoji/链接/引用/列表/任务/HR/表格/围栏码)左右上下四向遍历:**不可见 caret 异常 0 个**;剩 4 个行内 reveal 回流的像素巧合属设计固有(Obsidian 同)。编辑路径保留:点击/选区进表格 reveal 原文、单元格 input、Cmd+A。回归测试 +2(跨表一步直达、块间空行可达),共 105 用例过。
>
> **第三轮修正(用户实测:`- [ ] |` 处按左"光标不动且变大"、左右顺序颠倒)**:根因在 caret 的**画点**而非停靠点——`markdownWidgetCaretRect` 取边只看 `side` 基本忽略 `pos`,光标在 widget 末端(pos>0, side<0)画到左缘、起点某些 side 组合画到右缘,视觉上前后颠倒;高度用整行 line-height(21px)比正文 caret(17.5px)高 → "变大"。修复:取边严格随 `pos`(0=左缘、>0=右缘,side 仅对零长 widget 破平);高度改 fontSize×1.2 匹配正文。另修 `CodeBlockTopbarWidget` 缺 coordsAt → CM 默认把全宽工具条 rect 压平取右缘,代码块首行行首 caret 飞到 x=544 → 补 coordsAt 锚到工具条左缘下方。验证:复刻用户按键序列全部正确(左→框左缘、再左→上行尾、右→框左、再右→文本头,x 严格单调 46<74,高度 18≈17.5);全语法扫描以"caret x 随位置单调"强校验,排除 reveal 回流后**取边错误 0 个**。单测 +1(markdownWidgetCaretRect 四种 pos/side 组合),共 106 过。
>
> **第四轮修正(用户截图:折行任务行的 caret 卡在两视觉行中间的左缘)**:`markdownWidgetCaretRect` 垂直定位按整个 `.cm-line` 块居中,折行时行块是多行高 → caret 落在行与行之间。修复:垂直锚定改用 **widget 自身 rect**(勾选框就在它所在的视觉行内),行块居中仅作兜底;fallback 光标路径同理改用相邻字符 rect 定行。连带发现并修复:上一轮给 CodeBlockTopbarWidget 写的 coordsAt 锚错了行(以为代码文本在工具条下方,实际两者同带)→ 改为锚定"工具条之外第一个文本字符"的 rect,从左右两个方向进入代码块首行 caret 位置一致。验证(开 lineWrapping、320px 窄容器复刻截图):折行任务行行首 caret 落在勾选框所在的第一视觉行、第二视觉行位置正确;全语法折行左扫排除 reveal 回流后异常 0。注意:live-preview 的 caret 验证必须开 `EditorView.lineWrapping`,否则折行路径全部测不到。
>
> **第五轮(2026-07-12,用户决策:走"Typora 短期方案"——行内语法全面原子化)**:所有经 `addLivePreviewReplace` 产生的替换装饰统一打 `markdownAtomic: true` 标记(唯一出口,一处打标全覆盖),`buildMarkdownAtomicRanges` 由 widget 白名单改为按标记收集 → **全部隐藏语法**(强调/删除线/标题井号/引用尖括号/列表序号/链接括号+URL/数学 `$`/emoji/图片)对光标移动原子化,一步跨越。效果实测:全程方向键移动**零 reveal**(行内闪烁/回流彻底消失);打完 `**hi**` 即渲染;shift+方向选中即显源码(编辑路径);Backspace 智能解包(hiddenSyntaxDeleteHandler 先行,原子删除兜底);内边界打字正确落在格式内。全语法双向扫描 0 异常;剩余 8 个"同像素双停靠点"是隐藏定界符前/后两个不同输入目标(格式内/外),语义必需,Typora 同。编辑模型至此收敛为:**渲染态只读穿越 + 选区/点击/widget 三条编辑通道**。测试 106 过(3 个旧"逐字符穿越"规格测试更新为原子语义)。
方法:两路并行审计——① Markdown live-preview 渲染逻辑(在真实 CodeMirror 6 + happy-dom 环境下用临时 vitest 用例逐条复现,标 ✅ 的均已实测确认);② 窗口/面板 CSS 布局链路(逐条对照源码核实)。

## 涉及链路

```
apps/electron/src/window/todo-plan-window.ts      # BrowserWindow(macOS native panel)
  → src/renderer/components/TodoPlanWindow.vue     # standalone 包装(100vw/vh、22px 圆角)
    → src/renderer/components/chat/TodoPlanPanel.vue  # 面板本体(header/切换器/find bar/footer)
      → src/renderer/editor/MarkdownDocumentEditor.vue → TextEditor.vue  # CodeMirror 宿主
        → src/renderer/editor/markdown-live-preview.ts (3776 行)         # live-preview 核心
```

---

## 一、渲染逻辑缺陷(markdown-live-preview.ts 及配套)

### 高严重度

#### R1. reveal 源码与 `height:0` 行装饰冲突——被隐藏的行 revealed 后仍不可见 ✅

- 位置:`markdown-live-preview.ts:1913`(表格 hidden 行)、`:1765`(frontmatter 内容行)、`:1965`(折叠代码块内部行);样式 `:3100`(`.md-live-fold-hidden { height: 0 !important }`)。
- 这些行**无条件**推入 `md-live-fold-hidden` 行装饰;而 `addLivePreviewReplace`(`:1331`)在光标/选区进入时只把 replace 换成 `md-live-source-revealed` mark,**行级 height:0 不会撤销**。
- 复现:文档含表格时 Cmd+A——实测表格第 2、3 行(分隔行、数据行)同时带 revealed mark 和 `md-live-fold-hidden`;或用方向键逐字符走进表格第二行,此时行文本被"揭示"但行高为 0:**光标消失、输入落进不可见的行里**。frontmatter、折叠代码块同理。
- 修复方向:reveal 命中时同步撤销该行的 fold-hidden 行装饰。

#### R2. 行内 fallback 装饰不排除行内代码 span ✅

- 位置:`addMathDecorations:2097`、`addEmojiDecorations:2185`、`addInlineFallbackDecorations:2112`(删除线/下划线)对整行正则匹配;只有 `addObsidianLinkDecorations:2130` 调用了 `collectInlineCodeRanges` 做排除。
- 复现:`` run `echo :rocket: $PATH and $HOME ~~x~~` now `` 实测渲染成 `run echo 🚀 PATH and HOME x now`——反引号内的 shortcode 变 emoji、`$PATH…$HOME` 被当数学公式吞掉 `$`、`~~x~~` 被划线。开发笔记里反引号包 `$VAR` / `:emoji:` 极常见。
- 现有测试(`__tests__` 中 `:1261` 附近)只覆盖了围栏代码,没覆盖行内代码。
- 修复方向:三个 fallback 装饰统一先走 `collectInlineCodeRanges` 排除。

#### R3. MATH_RE 把美元金额/环境变量误判成公式 ✅

- 位置:`markdown-live-preview.ts:142`(`(?<!\\)(\${1,2})([^$\n]+?)\1`)+ `:2097`。
- 复现:`Price is $5 and $10 today` 实测 `5 and ` 被渲染成 `.md-live-math`、两个 `$` 被隐藏。一行内出现两个 `$` 即触发,完全没有 flanking 约束(如 `$` 后须紧跟非空白、闭合 `$` 前须非空白)。
- 严重度:中高——记账/价格类笔记必炸。

### 中严重度

#### R4. 代码块折叠键含绝对偏移——在折叠块上方打字会使其自动展开 ✅

- 位置:`:1931` `markdownFoldKey('code', startLine.from, …)`,key 格式 `code:{from}:{hash}`(`:2403`)。上方插入字符 → `startLine.from` 变化 → 新 key 不在 fold 集合 → 折叠自动展开。
- 实测:折叠后在文档头部输入两个字符,`.md-live-fold-summary` 从 1 变 0。对比图片/资产折叠键用 `from:0 + rawSource` 哈希(`:2407`),稳定不受影响。
- 修复方向:fold key 改内容签名,或在 StateField.update 里 map 位置。

#### R5. fallback 围栏扫描器与语法树对嵌套围栏判定不一致——代码块内出现任务复选框 ✅

- 位置:`FENCE_RE:130`(`^\s*(```|~~~)`,不区分围栏长度/开闭)被 `addLineFallbackDecorations:1690-1716`、`isLineInFencedCodeContent:2798`、`isOpeningFenceLine:2622` 当简单开关用;Lezer 按围栏长度正确嵌套,两者会失配。
- 复现:4 反引号围栏内示范 3 反引号代码块 + 任务列表——实测外层代码块**内部**渲染出任务复选框 widget,内层围栏行还触发了多余的 Copy 工具条。同类:`> ```js` 引用内围栏不匹配 FENCE_RE,代码内容照常被上数学/emoji 装饰。
- 触发场景:技术笔记里贴 markdown 示例。

#### R6. 文档以 `---` 分隔线开头时,正文被吞进 frontmatter 面板 ✅

- 位置:`collectMarkdownFrontMatterBlock:1721-1748`——第 1 行是 `---` 就贪婪扫描到**任意**后续 `---`/`...` 行作闭合,无空行阻断、无距离限制。
- 复现:`---\n\nSection one text\n\n---\n…` 实测前 5 行全部塌缩成一个 Properties 控件,中间正文"消失"。
- 修复方向:闭合搜索遇空行即止(YAML frontmatter 不允许空行隔断的简化规则),或限定首行 `---` 后紧跟 `key:` 形态才进入 frontmatter 模式。

#### R7. 外部更新走全文替换 + 绝对偏移钳制(机制缺陷,被上层守卫缓解)

- 位置:`TextEditor.vue:270-291`(setValue)、`:457-463`(modelValue watcher)。外部内容整篇 `{from:0, to:length}` 替换,选区只按 `Math.min(pos, length)` 钳制,不做 change mapping:外部版本在光标前有增删时光标错位;`anchor/head` 写死丢失反向选区;落在 IME 组合期间会打断组合。
- 缓解:`TodoPlanPanel.vue:917-935` 的 `hasLocalDraftChanges` 守卫 + `internalUpdate` flag + `getValue()===value` 短路,常规打字 + 260ms 保存回显不会丢字。只有服务端返回规范化后的不同内容、或外部推送恰好在 draft 与快照相等的间隙到达时才触发。

#### R8. 性能:每次按键、每次移动光标都全量重建装饰

- 位置:`MarkdownLivePreviewPlugin.update:1276-1291` 对 `docChanged || selectionSet || viewportChanged` 一律 `buildMarkdownDecorations`。≤1200 行(`FULL_SCAN_LINE_LIMIT:160`)每次全文 `syntaxTree.iterate` + 每行约 10 个正则 + 表格全扫 + `Decoration.set` 排序。
- 另外:`scheduleEmptyCodeBlockNormalization` → `findAdjacentEmptyFencedCodeBlockAtSelection:2712-2727` 每次 doc/selection 变化 O(全部行);>1200 行文档 Cmd+A 后 selection 全并入 scanRanges(`:1504-1507`)退化回全文扫;`EmptyMarkdownWidget`/`EmptyStructureCaretWidget`/`HorizontalRuleWidget` 无 `eq()`,每次重建都重造 DOM。
- 对 CJK 输入法用户:每次组合更新都触发一轮全量重建。

#### R9. 图片异步加载不通知编辑器重新测量

- 位置:`MarkdownImageWidget.applyResolved:397-418`——promise 完成后 `replaceChildren()` 换成 `<img>`(max-height 360px,无占位尺寸),无 `view.requestMeasure()`、无 `onload` 钩子。CM 行高缓存过期 → 图片加载完成瞬间布局跳动、光标坐标/滚动锚定短暂错误。

#### R10. `MarkdownImageWidget.eq` 不比较 options(与 FileWidget 不一致)

- 位置:`:363-369`(image)vs `:472-477`(file)。切换笔记 → `documentPath` 变化 → 新 `resolveAsset` 闭包;若新旧文档相同位置有相同 `rawSource` 的相对路径图片,widget 被 `eq` 判等复用 → **显示上一篇笔记目录解析出的旧图**。

#### R11. CJK 表格单元格宽度按 UTF-16 length 计算

- 位置:`:1089/:1099/:1112` `input.size = max(6, min(48, len+1))`;`.md-live-table-cell` 网格列宽 `minmax(6ch, max-content)`(`:3383`)。中文字符显示宽约 2ch 但按 1 计 → 中文单元格列宽约为所需一半,编辑时文本在 input 里滚动裁剪。对中文用户是日常可见问题。

### 低严重度

- **R12** 长文档(>1200 行)表格扫描 margin 仅 ±2 行(`collectMarkdownTableLineStates:1780-1783`):表格起始行在扫描范围上边界外时整组丢弃(`:1811` `separatorIndex !== 1`),滚动中同一张表在"块渲染/逐行渲染"间跳变。
- **R13** 表格组整组丢弃不回溯(`:1811`):`|a| |b| |---| |c|` 中后三行本可成表,整组被弃。
- **R14** 无分隔行的单行 `| … |` 也渲染为表格 row widget ✅(`TABLE_ROW_RE:141` + `:243`):粘贴的 shell 管道、`|重要|` 被误伤(设计取舍)。
- **R15** `parseLinkParts:2365` 用 `indexOf(')')`:不支持 URL 内平衡括号(`![a](b(1).png)` 截断)与 title 语法(`![a](b.png "t")`)。
- **R16** Setext 标题无样式(树遍历只认 `ATXHeading1-6`,`:1584`);`ORDERED_LIST_RE:137` 只认 `\d+\.` 而 `existingOrderedListMarkerSplit:2578` 认 `\d+[.)]`,自相矛盾。
- **R17** 死 CSS:`.md-live-codeblock-fence-toolbar`(`:3251`)、`.md-live-list-marker`/`.md-live-quote-marker`/`.md-live-fence-marker`(`:3084`)、`.md-live-fold-summary-line`(`:3148`,实际输出的是 `md-live-codeblock-fold-summary-line`)均从未被输出。
- **R18** `settings.syntaxHighlighting=false` 时 markdown parser 整个不加载(`extensions.ts:260-269`):树装饰全灭、正则 fallback 仍活 → "半残"预览。语言解析不应与高亮开关捆绑。
- **R19** 表格 input / frontmatter textarea 的进行中编辑可因并发 doc 变化重建 DOM 而丢失(widget `eq` 依赖 `from/to/signature`,`:1061-1065`;Chrome 移除元素不触发 blur → `commit:1096` 不执行)。

---

## 二、窗口 / 面板 CSS 布局问题

### 中严重度

#### C1. 卡片模式下切换器里的 Pin/删除按钮永久不可达

- 位置:`src/renderer/components/chat/todo-popover.css:21`(`.todo-popover { container-type: inline-size }`)+ `TodoPlanPanel.vue:1841-1859`(`@container (max-width: 360px)` 时 `display: none` 掉 `.note-option-actions`)。
- 卡片宽 280px(`:1408`)→ popover 宽 ≈254px,**恒小于 360** → 卡片模式下 Pin/Delete 按钮永远隐藏。删除还能走 Command Panel,但 `todoActions`(`:645-735`)里**没有 pin-note action** → 卡片模式下"置顶笔记"完全没有入口。standalone 最小宽 320 时同样消失。
- 修复方向:给 Command Panel 补 pin-note action,或放宽容器查询阈值。

#### C2. 窗口位置恢复无"是否在屏幕内"校验

- 位置:`apps/electron/src/window/window-state.ts:62-63`(`sanitizeElectronWindowState` 只校验 finite)→ `todo-plan-window.ts:31-32` 直接把 x/y 传给 BrowserWindow。
- 症状:拔掉外接显示器后,快捷键"打开了"Todo 窗口但整个窗口在屏幕外,什么都看不到。
- 修复方向:创建前用 `screen.getDisplayMatching` 校验/clamp。

#### C3. 非 mac 平台三重不一致(仅 Win/Linux)

- 位置:`todo-plan-window.ts:40-42`(非 mac 不透明 + `titleBarStyle: 'default'`)vs `src/renderer/main.ts:15-17`(**只判断 hash 不判断平台**,照样给根层加 `transparent-window-root` → `main.css:47-50` 根层透明)。
- 症状:22px 圆角四角外露出颜色不匹配(原生 backgroundColor ≈ bg-app,面板画的是 elevated 92% + note 8% 混色)的直角背景;原生标题栏 + 页面内 30px drag header 双标题。

#### C4. find bar 与切换器不互斥,可同时打开且被遮盖

- 位置:`TodoPlanPanel.vue` `openSwitcher()`(`:984-995`)与 `openFind()`(`:1059-1068`)互不关闭对方(只有 `openActionPanel:1035` 两个都关)。
- 症状:⌘F 后再 ⌘P,find bar(z-index 4)被 switcher popover(z-index 6)完全遮住但仍处于 open 状态;关掉 switcher 后 find bar "凭空还在"。
- 修复:两个 open 函数各补一行互关。

#### C5. resize/move 每个事件同步读盘+写盘

- 位置:`apps/electron/src/window/index.ts` onResize/onMove 无节流调 `saveTodoPlanWindowState`,而 `window-state.ts:136-153` 每次先读 JSON 再写 JSON。拖动/缩放期间每 tick 两次磁盘 IO,可能造成拖动卡顿。只缺 debounce,其余(hide 前存 stableBounds、native frame 同步 guard)都做对了。

### 低严重度

- **C6** `--ui-surface-note-bg` 裸用无 fallback(`TodoPlanWindow.vue:14`、`TodoPlanPanel.vue:1399`):内置主题有兜底链(`variables.css:410` → warning-bg → flexoki),但自定义主题注入空/非法值时整个 `color-mix()` 失效 → 背景回退透明,standalone 窗口因根层透明**整窗变透明玻璃只剩文字**。库内其它用法(`VoiceSettingsTab.vue:1434` 等)都写了 fallback,建议对齐。
- **C7** `TodoPlanWindow.vue:38-40` `:deep(.todo-plan-panel.collapsed)` 是死规则:standalone 下 `collapsed` 恒 false(初始 `props.standalone ? false : …`,`TodoPlanPanel.vue:575`;所有置 true 路径都有 `isStandalone` guard)。可删。
- **C8** 传给编辑器的 `min-height=120 / max-height=100000` 是死参数:`markdown-document` profile 下被 `TextEditor.vue:515-531`(强制 `height:100%`、`max-height:none`)和 `extensions.ts:298` 全部中和。无可见 bug,但会误导维护者。
- **C9** 死类名/死状态类:`TodoPlanPanel.vue:5-14` 绑定的 `pinned / find-open / switcher-open / action-panel-open / format-buffer-open` 无任何对应样式;`.popover-open`(`:1443`)是 no-op;`:266` `class="markdown-editor"` 全库无引用;`.todo-plan-panel.collapsed:hover`(`:1460`)因 mouseenter 立即展开而基本不可见。
- **C10** 浮层阴影被面板 `overflow: hidden` + 22px 圆角切成直线(popover 阴影 0 12px 48px,距边缘仅 12px)。
- **C11** `--todo-popover-top: clamp(58px, 12vh, 88px)`(`:1410`)按主窗口视口算:220px 高的最小卡片配 88px top,弹层内容区仅剩约 74px,能用但很挤。
- **C12** 编辑器 `[data-surface="todo-notes"]` padding `0 0 0 18px`(`MarkdownDocumentEditor.vue:372-374`):首行贴 header、末行贴 footer,视觉偏挤(设计取舍)。

### 核实过没有问题的部分

- `panel-body { height: calc(100% - 68px) }` 在所有模式(卡片/standalone/find 开/格式条开)下数学精确,无双滚动条、无内容裁剪。
- scoped CSS 链路是通的:面板 scoped 样式不引用 `cm-*`;CodeMirror DOM 由 `TextEditor.vue:511-531` 用 `:deep()` 正确覆盖,live-preview 样式经 `EditorView.theme` 运行时注入,无 NestedCollapseGroup 式死规则。
- macOS 圆角/透明链路正确(`transparent: isMac` + `transparent-window-root` + 根层透明)。
- 拖拽区域正确:drag 在 header,no-drag 覆盖所有交互层,浮层不与 30px header 重叠;traffic 灯位几何充足。
- 显隐链路(showInactive/moveTop、native panel 回退、hide 前存 stableBounds)设计正确,无白闪风险。

---

## 三、渲染逻辑做得好的部分(已有防护)

- **范围安全**:`Decoration.set(ranges, true)` 统一排序;`from>=to` 保护;零长度位置改用 widget;`Math.min(…, doc.length)` 钳制到位——未发现会抛 RangeError 的无效区间。
- **光标体系**:自定义 cursor layer + 所有 widget 实现 `coordsAt` + 多级 fallback;widget 内输入框聚焦时主光标正确隐藏。
- **IME**:所有 keydown 处理均检查 `isComposing`,有专门测试。
- **异步资产**:解析缓存带 TTL + 条目上限 + 失败清缓存;widget 漂移后源码编辑有 posAtDOM + 最近匹配双重兜底。
- **抖动控制**:image/table/frontmatter widget 的 `eq` 用内容签名;折叠操作有同步 + microtask + rAF 三次滚动锚定恢复。
- **视口限扫**:>1200 行走 visibleRanges + selection ±80 行合并,有测试。
- **外部更新守卫**:`internalUpdate` flag、`getValue()===value` 短路、"update in progress" 捕获重放、面板层 `hasLocalDraftChanges` 守卫——常规打字 + 260ms 保存回显不丢字。
- **位置数学**:全部基于 UTF-16 偏移,与 CM6 一致,无码点/字素混用。
- **测试覆盖**:60+ 用例,覆盖光标穿越隐藏源码、reveal、折叠、表格编辑回写、feature 开关、长文档限扫。

---

## 四、修复优先级建议(按性价比)

| # | 问题 | 一句话修法 |
|---|------|-----------|
| 1 | R1 reveal 后行高仍为 0(输入落进不可见行) | reveal 命中时同步撤销该行 fold-hidden 行装饰 |
| 2 | R2 行内代码里的 emoji/数学/删除线误染 | 三个 fallback 装饰统一走 `collectInlineCodeRanges` 排除 |
| 3 | R3 美元金额误判为公式 | MATH_RE 加 flanking 约束 |
| 4 | C1 卡片模式 pin/delete 不可达 | Command Panel 补 pin-note action 或放宽容器查询阈值 |
| 5 | C2 拔显示器后窗口离屏 | 创建前 `screen.getDisplayMatching` clamp |
| 6 | R4 折叠块上方打字自动展开 | fold key 改内容签名或 map 位置 |
| 7 | R6 `---` 开头正文被吞进 frontmatter | 闭合搜索遇空行即止 |
| 8 | C4 find bar 与 switcher 互相遮盖 | 两个 open 函数互关 |
| 9 | R5 嵌套围栏内误渲染 | FENCE_RE 记录围栏长度与开闭状态 |
| 10 | C5 拖动窗口每 tick 读写盘 | 存盘加 debounce |
| 11 | R11 中文表格单元格宽度减半 | size 按显示宽(CJK 计 2)估算 |
| 12 | 死代码清理(R17、C7-C9)+ C6 fallback + C3 平台判断 | 逐条删/补 |
