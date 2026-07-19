# 设置页 UX / 数据展示审计(2026-07-18)

> **修复记录(同日)**:P0 全部 + P1 大部分已在 `redesign/prompt-assembly` 工作树修复,
> 见文末「修复记录」一节;修复后截图 `assets/settings-2026-07-18/settings-after-*.png`。

范围:`src/renderer/components/SettingsPage.vue` 外壳 + 全部 15 个 tab 组件。
方法:代码逐 tab 盘点(字段 → settings key 映射)+ web 版(:5174)Playwright 真机走查(1280×820)。
截图:`docs/audit/assets/settings-2026-07-18/`。

结论先行:**设置页的问题不是零星样式 bug,而是三层系统性失配** ——
① 外壳(Container)与页面样式两套尺寸系统互相打架,设计稿宽度根本没生效;
② 侧栏导航的「点击 = 切 tab + 切换折叠」二合一交互,叠加一套靠**字符串前缀匹配标题**的锚点机制,而锚点表与真实页面已大面积脱节(15 个 tab 里只有 3 个完全对得上);
③ 同一份数据在多处用不同 UI 重复展示/重复编辑(两个 Models 表、两套用量面板、Voice 同一 key 三对输入框、双设置外壳)。

---

## P0 —— 用户每天都会撞上的问题

### P0-1 Sidebar 实际 280px,设计值 214px 从未生效(即「太宽」的根因)

- `Container.vue:99` 的 prop 默认 `sidebarWidth: 280` 会以**内联样式**写到根元素:`--layout-container-sidebar-width: 280px`(真机确认 inline style 存在)。
- `SettingsPage.vue:1414` 用 scoped CSS 设 `--layout-container-sidebar-width: 214px`,**内联样式优先级更高,恒被压掉**。
- `SettingsPage.vue:1437` 的 `:deep(.settings-sidebar){width:214px}` 也无效:Container 侧栏用 `flex: 0 0 var(--...width-resolved)`(`Container.vue:287`)定尺寸,flex-basis 压过 width。
- 真机测量:`aside` 计算宽度 280px、`flex: 0 0 280px`。**比设计宽 66px**。
- 另有三代死宽度:scoped `.settings-sidebar` 260px(:839)、238px(:1183)、210px(:1357 媒体查询)——这些选择器带 SettingsPage 的 scope 属性,而 `aside` 是 Container 渲染的、不带该属性,**一条都匹配不上**(真机确认计算 padding 来自 :1436 的 `:deep` 规则)。
- 修法提示:要么给 `<Container>` 传 `:sidebar-width="214"`,要么让 Container 只在显式传参时才写内联变量。

### P0-2 导航「点标题 = 切 tab + 切换折叠」二合一,折叠别的组会被强行拽走(真机实锤)

- `SettingsPage.vue:568-578`:AppMenu 的 `open`/`close` 事件处理器**都调用 `selectNavItem`**。
- 实测序列:正在看 Editor → 点 General(想把它的子菜单收起来)→ General 收起了,**但页面被切到 General**,Editor 上下文丢失。
- 推论:想收起任何一组,必须付出「被导航到那一组」的代价;反过来,想只展开看看某组有什么、不离开当前页,也做不到。
- 展开状态因此只增不减(用户不愿付出代价去收),走查十分钟后侧栏积累了 Editor/Providers/Voice/Evals 四组同时展开,侧栏自身出现滚动。chevron(`app-sub-menu-chevron`)不是独立热区,纯装饰。

### P0-3 侧栏子锚点大面积是死链(15 个 tab 只有 3 个完全对得上)

机制:`SettingsPage.vue:588-600` 拿 navItems 里写死的 section 文案,对内容区 h2/h3 的 `textContent.startsWith` 匹配;找不到就**静默滚回顶部**——用户点了没反应,也没有任何提示。

逐 tab 命中情况(✓=完全一致):

| Tab | 声明锚点 | 实际命中 | 问题明细 |
|---|---|---|---|
| General | 7 | 7(顺序错位) | 实际顺序 Typography→Context Compact→**Agent Turns**→Fonts;`Agent Turns`(:135)、`Token Usage`(UsageSettingsPanel)两个真实标题**不在导航里** |
| Editor | 3 | 3 ✓ | — |
| Providers | 2 | 2(有二义) | 展开 provider 后 `ProviderModels.vue:5` 产生**第二个** `Models` h3,锚点二义 |
| Tools | 5 | 条件命中 | `Available Tools`/`Web Search`/`Bash` 三节都挂在 `enableToolCalls` 等条件下(ToolsSettingsTab.vue:143,184,206),关掉工具调用后三个锚点全灭;`Background Bash Jobs` 游离 |
| Network | 1 | 1 ✓ | — |
| Voice | 3 | 1 | `Speech Providers` ≠ 实际标题 `Advanced Speech Providers`(恒不命中);`Advanced Recording` 藏在本地 `showAdvanced` 折叠后(:607),导航展不开它 |
| Music | 4 | 不稳定 | `开放平台凭证` ≠ 实际 `服务凭证`(:231,恒不命中);首节标题是动态 provider label;`运行环境`/`登录` 随向导阶段条件存在;常驻的 `播放器`/`电台编排` 反而不在导航 |
| Channels | 4 | 2 | `Runtime`、`WeChat login` 无对应标题;常驻 `Profiles`(:210)不在导航 |
| Memory | **10** | **3** | `Recall/Profile/Search Index/Embeddings/Daily Notes Context/Compact Flush/Scheduled Memory` 七个是**幻影锚点**(页面只有 Basics/Capture/Review/Diagnostics 四节);常驻 `Review` 不在导航 |
| Shortcuts | 1 | 1 ✓ | — |
| MCP | 2 | 0 | `Servers` ≠ `MCP Servers`(startsWith 反向,不命中);`Configuration` 标题根本不存在 |
| Skills | 2 | 2 ✓ | — |
| Prompts | 1 | 0 | 实际标题 `Prompt Snippets`,不以 `Prompts` 开头 |
| Plugins | 1 | 0 | 实际标题 `Installed Plugins` |
| Evals | 4 | 0(机制不兼容) | 四个视图是**页内按钮 tab**(`EvalsSettingsTab.vue:4-20`),未激活视图不在 DOM,且视图内几乎无 h2/h3;侧栏子项与页内 tab 是**同一套导航做了两遍**,但侧栏那套全是摆设 |

根因:锚点表是手抄的字符串,和组件实现零耦合,改一边不会同步另一边。建议改成「组件自注册 section(id + 标题)」,导航从注册表生成,锚点跳转用 id 而不是文本前缀。

### P0-4 自动保存完全没有可见反馈,却保留了一整套「未保存更改」流程

- 代码里有两个保存指示器,**真机测量都不可见**:
  - 标题栏 `Saving.../Saved`(模板 :28-33)——`:1419` 把整个 `.settings-titlebar` clip 成 1×1;
  - 内容区 `Saving changes.../Changes save automatically`(:130-135)——`.save-state` 计算样式 `display:none`(:1782)。
- 同时保留了矛盾的另一套模型:`hasUnsavedChanges`(每次输入全量 `JSON.stringify` 比对 :469-472)+ `beforeunload` 拦截(:709)+ `UnsavedChangesDialog`(Save/Discard,:249)。自动保存 500ms 防抖(:610)意味着这套对话框只在「改完 0.5 秒内关窗」的窗口期出现——用户偶发撞上会完全困惑:明明说好自动保存,为什么问我要不要保存?
- 建议:二选一。留自动保存就删对话框/beforeunload,并让一个轻量的「已保存」状态真正可见。

---

## P1 —— 数据重复展示 / 重复编辑面

### P1-1 两个「Models」表,两套模型调参 UI

- `ModelLedgerSection.vue`(顶层 Models 总账:默认模型 ★、temperature、max output、能力覆写)与 `ProviderModels.vue`(Connections 里展开某 provider 后的模型表:选择、max output、能力编辑)。
- **max-output 覆写和能力覆写的编辑 UI 各实现一遍**(ModelLedgerSection:192-248 vs ProverModels:203-288),同一份 `settings.ai` 数据两处可改。
- 建议:模型的「调参」只留总账一处;provider 抽屉里只做「勾选哪些模型可用」。

### P1-2 Token 用量两处展示,且一处放错了 tab

- `UsageSettingsPanel`(整段 `Token Usage`)挂在 **General** tab 尾部(GeneralSettingsTab.vue:333)——外观类 tab 里出现计费数据,导航也没有它的锚点。
- `ProviderUsageCard` 在 Providers 的每个连接内(ConnectionsSection.vue:122)又展示一份用量。
- 建议:用量独立成 tab(或并入 Providers),General 只留外观。

### P1-3 Voice:同一个 settings key 出现两处输入框 ×3,API key 双入口

- `voice.doubao.apiKey`(:154 与 :271)、`voice.asr.openrouter.apiKey`(:173 与 :720)、`voice.asr.funasr.url`(:135 与 :738)——**同 key 双输入框**,两处填不同值只有后触发的生效,极易困惑。
- OpenRouter/OpenAI key 与 Providers tab 的全局 key 语义重叠(组件自己也知道:`hasOpenRouterProviderKey` :808),同一凭证两个入口。
- Voice 共暴露 **~31 个控件**,是最超载的 tab(截图 settings-voice.png)。

### P1-4 「选一个 provider + model + think + effort」这组四件套出现了三处

- Tools 的 `Tool Call Model`(ToolsSettingsTab.vue:48-126)、Music 的 `电台编排`(MusicSettingsTab.vue:106-170,同样的 ToolCallModelSettings 形制)、Providers 的默认模型 ★。三处概念重叠,用户无法建立「默认模型到底由谁决定」的心智模型。
- 建议:统一为「全局默认 + 按场景可选覆写」的单一形制组件,且默认收起为「跟随默认」。

### P1-5 列表行的小规模重复

- MCP:工具计数在行内(`MCPServerItem.vue:34`)和展开区(:212)各一份;连接状态色点 + 展开区状态文案两份。
- Skills:计数三处(目录总数/技能总数/每分组);技能描述折叠行与展开区重复;agent 绑定两处入口。
- Plugins:`Active/Disabled` 状态 badge(:87)与 enable 开关(:135)表达同一状态。
- Evals:run mean 分数三处(:172/:220/:252)。

### P1-6 双设置外壳:`SettingsPanel.vue` 是 1254 行死代码

- 全仓库无任何 import(App.vue 只用 SettingsPage)。它复用同一批 tab 组件、另配一套横向 tab 外壳,还硬编码了一份**过期的 provider 默认模型表**(GPT-4/claude-3.5,:546-551)。
- 连带死代码:`SettingsFooter.vue` 只被它使用。
- 之前记忆里「SettingsPanel 浮层要镜像维护一份」的负担,现在其实可以整体删除来解决。

---

## P2 —— 一致性 / 观感 / 技术参数外泄

### P2-1 语言混排

- Music tab 全中文(网易云音乐/播放器/电台编排/服务凭证),其余 14 个 tab 全英文;General 里唯一的 `中文字体` 标签夹在英文里;Evals 里 `🔎事故工作台` 按钮 + emoji 语义标签(📤🔧🔍🧩)混在英文 UI 中(截图 settings-evals.png)。二选一统一。

### P2-2 技术参数外泄(违反「设置只暴露必填项」原则)

- Memory 的 `Diagnostics` 整节 5 个字段(log level/retention/preview chars/http error body)是纯内部日志参数;Prompt cap/Input chars/Timeout 等数值调参 6 处。
- General 的 `Agent Turns`(描述里直接出现 `finishReason 'max_turns'`)、Context Compact 阈值百分比。
- Tools 的 `Permission Mode` 暴露 "Dangerously Allow All"。
- Voice 的 FunASR ws URL、VAD energy threshold、silence ms、model slug 手填。
- Editor 的 `Notes Engine (experimental)`。
- 建议:全部下沉 settings.json/默认值,或收进统一的「Advanced」折叠。

### P2-3 同类控件形制不一致

- 目录选择:General/Memory 有「Choose」按钮,Editor 的两个附件目录是纯手输 input(:111/:124)。
- 空状态四种样式:MCP/Plugins 虚线框、Skills 纯文本、Tools 用 SettingsEmptyState 组件、Evals 裸 div。
- 行原语两套:`SettingRow`(8+ 处使用)vs `SettingsField`(仅 Voice/Prompts 使用),功能重叠,建议合并。
- Evals 里还有原生 `confirm()/alert()`(EvalsCasesView.vue:126,129)和 `<pre>{{JSON.stringify}}` 原始 JSON 直出(三个视图),与全局画线风脱节。

### P2-4 settings 命名空间与 tab 归属割裂

- General tab 的字段横跨 `settings.theme` / `settings.chat.*`(字体、字号、compact、maxTurns)/ `settings.general.*` 三个命名空间;Editor tab 一半写 `general.*` 一半写 `general.editor.*`。重排信息架构时建议一并归位(用户已授权打乱重排)。

### P2-5 外壳残余问题

- 整个侧栏是 `-webkit-app-region: drag`(:1441):Electron 里点侧栏空白处是拖窗口,长期看容易误触(搜索框/导航已单独 no-drag,但行间空隙仍是拖拽区)。
- 搜索只做 tab 级过滤(:433-440,匹配 label/hint/sections 文案),搜不到具体字段;过滤时**当前激活 tab 也会从列表消失**,内容区却还停在该 tab,状态错位。真机:搜 "font" 只剩 General 一项。
- 死 CSS 体量:单个 `<style scoped>` 三层叠加(基础层 766-1143、中间层 1145-1383、IDE refresh 1385-2338),中间层几乎整层死;`.settings-sidebar/.settings-titlebar/.settings-content` 等 scoped 明线选择器因 scope 属性不命中全部失效;`.sidebar-hint` 在 4 处重复 `display:none`;`.save-state` 基础层内自我重复(:932/:939)。DOM 里每个导航项还渲染着永远不可见的 hint 文本。
- Shortcuts 默认表里的 `toggleTodoPlan`(⌘⌥T,:114)有默认值但没有编辑行,是改不了的隐藏快捷键。
- Plugins 的 `samplePluginsPath` 硬编码 `~/data/code/start-electron`(:190)残留。
- Evals 在 web 构建直接显示 "Evals is not supported in the web build",但 tab 仍然完整出现在导航里(应按 host 能力隐藏)。

---

## 重构方向建议(供下一步讨论,本次未改任何代码)

1. **信息架构重排**(已获授权打乱):
   - 「外观」(Mode/Theme/Typography/Fonts)从 General 拆出;Context Compact/Agent Turns 归入「对话/模型行为」;Token Usage 独立;Daily Notes/Todo 与 Memory 的目录语义合并归位。
   - 15 个平铺 tab 按任务分组(外观 / 模型与工具 / 语音与音乐 / 连接与扩展 / 高级),或保留平铺但砍掉子锚点层。
2. **导航模型简化**:单击 = 直达 tab;子锚点要么删掉(多数 tab 只有 1-4 节,价值低),要么改「组件自注册 section id」的目录,滚动定位不再依赖文本前缀。
3. **保存模型二选一**:纯自动保存 + 可见的轻量状态,删除 UnsavedChangesDialog/beforeunload。
4. **删除 SettingsPanel.vue + SettingsFooter.vue**,清掉 SettingsPage 中间层死 CSS(预计可减 500+ 行)。
5. **合并原语**:SettingRow/SettingsField 合一;空态统一;目录选择统一控件。
6. **技术参数下沉** settings.json,每 tab 暴露字段以个位数为目标(Voice 31 → 目标 <10)。

## 修复记录(2026-07-18,已实施并真机验证)

- **P0-1 侧栏宽度**:`SettingsPage.vue` 给 `<Container>` 传 `:sidebar-width="214"`(内联变量是唯一能赢的通道);删除四代死宽度规则。真机实测 214px ✓,平铺/子菜单图标全部对齐 x=46。
- **P0-2 折叠甩 tab**:`handleNavMenuClose` 不再调用 `selectNavItem`。真机验证:在 Editor 页折叠 Memory,停留在 Editor ✓;测试新增守卫断言。
- **P0-3 死锚点**:navItems 全面对齐真实标题(General 补 Agent Turns/修正顺序、Memory 10→4、Channels 修为 Channels/Profiles/Sessions);**单区块 tab 改为平铺条目**(无子菜单):Usage/Network/Voice/Music/Shortcuts/MCP/Prompts/Plugins/Evals(9 个),消灭全部"一个子项复读 tab 名"和幻影锚点。`ProviderModels` 的第二个 "Models" 标题改为 "Available models" 消除二义。真机验证 Memory→Diagnostics 滚动生效 ✓。
- **P0-4 保存反馈**:删除 UnsavedChangesDialog + beforeunload 拦截(纯自动保存模型);保存指示改为「落盘中 Saving… / 完成后 1.6s Saved」,常驻可见(原 display:none 已修)。
- **P1-2 Token Usage**:从 General 拆出为独立 **Usage** tab(位于 Providers 之后),真机渲染正常 ✓。
- **P1-3 Voice 重复输入框**:Advanced Speech Providers 里重复的 OpenRouter API key、FunASR URL 字段删除(主区块按当前 provider 显示唯一入口);Doubao key 因 ASR/TTS 分支互斥保留双入口 + 提示语说明共用。
- **P1-6 双外壳**:删除 `SettingsPanel.vue`(1254 行,不可达)+ `SettingsFooter.vue`;拆除 ChatWindow/PanelTree/ChatContainer/App.vue 的 showSettings/openSettings/closeSettings 全链路(该浮层的触发事件从未被 emit)。
- **P2 死 CSS**:删除中间层样式(~200 行)、scope 不匹配的 `.settings-titlebar/.settings-layout/.settings-sidebar/.settings-content` 明线规则、`.sidebar-heading`/`.sidebar-hint`(连同模板里的隐藏 DOM)、重复 `.save-state`、死的响应式收窄(204/210px 从未生效)。
- 测试:`SettingsPage.test.ts` 新增平铺条目 + Usage tab + 折叠不甩 tab 断言;`ui-token-vars.test.ts` 三层→两层计数更新;全量 3573+ 用例通过,typecheck 除 SchedulerPanelContent(他人在途改动)外干净。

**遗留(待后续)**:两个 Models 表的调参 UI 合并、Tools/Music 的 "provider+model+think+effort" 四件套统一、Music 中文/Evals 中英混排、Memory Diagnostics 等技术参数下沉、Evals 原生 confirm/alert 与 JSON 直出、空态样式统一、SettingRow/SettingsField 合并、整侧栏 drag 区、settings 命名空间归位(信息架构级,建议单开会话)。

## 附:真机测量数据

- viewport 1280×820;sidebar 实测 280px(含 1px 边线),内容列 930px。
- 侧栏导航区高 450px,下方 ~300px 空白(15 项全收起时)。
- 交互复现步骤(甩 tab):Memory 展开 → 点 General(切走)→ 点 Memory = 切回 Memory;在 Editor 页点已展开的 General = 折叠 + 被切到 General。
