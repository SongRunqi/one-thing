# 插件 UI 接入点调研审计(2026-08)

> 对象:onething 宿主 UI 的全部可注入位置盘点。
> 起因:插件系统 R0–R7 收官后,"插件 UI 只能贡献独立工作区面板"成为表达力的
> 结构性瓶颈 —— 用户实测反馈:想在输入框上方、状态栏、侧栏等宿主 UI 的固定
> 位置嵌入插件 UI(例如一个显示当前执行状态的 plan 插件),**没有位置可去**。
> 本文档是对宿主 UI 的**全量扫描**:每个候选锚点的位置、容量、语义、限制,
> 以及"哪些位置有意不开放"的红线。设计方案见
> [`plugin-ui-anchors-2026-08.md`](./plugin-ui-anchors-2026-08.md)。

---

## 0. 结论先行

宿主 UI 中**存在 9 类可注入位置**,按价值与成本分三档:

| 档 | 锚点 | 价值 | 成本 |
| --- | --- | --- | --- |
| **A 档(先做)** | `composer.above`(输入框上方)、`chat.status-bar`(状态栏) | 高:用户明确要的 plan 状态条、全局状态 | 低:纯 renderer 侧挂点 + 复用描述树渲染器 |
| **B 档(二期)** | `composer.dock`(输入框 dock 区)、`sidebar.menu`(侧栏菜单)、`chat.header`(聊天头)、`workbench.tab`(右侧工作台) | 中:输入辅助、导航、会话上下文 | 中:涉及组件内部结构 |
| **C 档(设计预留)** | `message.actions`(消息操作)、`markdown.block`(消息正文内嵌)、`settings.tab`(设置页 tab) | 低-中:侵入性强 | 高:需要新的渲染通道 |

**核心限制结论(本审计的事实基础)**:

1. **UI 不执行插件代码**是宪法级红线(R5 裁决),任何锚点内容都必须是
   **纯数据描述树**(或 H 线后的 webview iframe),插件不能塞 Vue 组件。
2. **描述树渲染器已存在且可复用**(`PluginPanelNode.vue`):7 种节点 + 5 种
   控件,渲染完全由宿主完成。锚点块 = 同一棵树的另一个挂载点,**零新渲染代码**。
3. **数据流通道已存在且可复用**(R2 请求通道):`ui:render:<anchor>:<id>` /
   `ui:action:<anchor>:<id>` 自动继承 30s 预算、abort、progress、熔断账。
4. **插件→UI 的推送面已存在**(`plugin:notification` + `panel-refresh`):
   锚点块刷新复用 `refresh()` 语义,不另开轨道。
5. **多宿主差异是硬限制**:server 端插件是 noop 目录(方案 A),锚点块在
   web 端不渲染或显示"仅桌面可用"态。

---

## 1. 宿主 UI 形态全景

主窗口渲染树(从 `App.vue` 模板逐层展开):

```
App.vue
├── Sidebar(两处:停靠态 / 浮层态)
│   ├── SidebarHeader(44px 拖拽行 + 交通灯保留位)
│   ├── sidebar-split
│   │   ├── sidebar-rail(纯图标导航,类别入口 + ⋯ 工作区面板 + 新建 + 设置)
│   │   └── 类别面板
│   └── ⋯ 工作区面板菜单(ContextMenu,吃 useWorkspaceNavEntries)
│
├── SplitterPanel.app-shell-main-region
│   └── app-content
│       ├── Splitter
│       │   ├── SplitterPanel.app-main-region
│       │   │   └── Container.app-main-region
│       │   │       └── workspace-view-stack
│       │   │           ├── ChatContainer.workspace-view-chat(v-show chat)
│       │   │           │   └── ChatWindow → ChatPanel
│       │   │           │       ├── MessageList
│       │   │           │       ├── BackgroundJobsStatusBar
│       │   │           │       ├── GoalStatusBar
│       │   │           │       └── InputBox(composer)
│       │   │           │           ├── composer-stack
│       │   │           │           │   ├── composer-dock(QueuePanel/QuotedContext/AttachmentRow)
│       │   │           │           │   └── composer-anchor(MusicStatusBar + 帧标签 + 语音取消)
│       │   │           │           └── composer(input-area + toolbar)
│       │   │           └── MediaPanel.workspace-view-panel(v-show 工作区面板)
│       │   │               ├── 面板导航条(吃注册表:内置 + 插件面板)
│       │   │               └── 各面板内容(media/agents/tasks/music/practice/archive/插件面板)
│       │   └── SplitterPanel.app-right-sidebar-region(右侧工作台)
│       │       └── RightWorkbenchPanel(workbench tabs:goal/threads/editor…)
│       ├── VoiceOverlay
│       └── VoiceCallPanel
│
└── EvalsWorkbench(全屏覆盖,设置窗口也可见)
```

辅助窗口(hash 路由分支,`App.vue:271-283`):

| hash | 窗口 | 插件相关 UI |
| --- | --- | --- |
| `#/settings` | 设置窗 | **PluginsSettingsTab(唯一现存的插件 UI 消费者)** |
| `#/search` | 搜索窗 | 无 |
| `#/todo-plan` | 计划窗 | 无 |
| `#/voice-runtime` | 语音运行窗 | 无 |
| `#/image-preview` | 图片预览窗 | 无 |

其他形态:`RoomSurface`(协作房,替代 ChatPanel 分支)、`RightWorkbenchPanel`
(右侧工作台,tab 化)、`EditorWorkbench`(编辑器工作台)。

---

## 2. 锚点候选逐项盘点

### A-1. `composer.above` —— 输入框上方 【A 档,用户明确需求】

**位置**:`InputBox.vue` 的 `composer-stack` 顶部(composer-dock 之上)。
当前结构:`composer-stack` 内已有 `composer-dock`(队列/引用/附件)与
`composer-anchor`(MusicStatusBar + 语音/命令帧标签)。

**语义**:输入框上方的横条区,承载"当前会话的补充状态"。用户场景:
plan 插件在此显示"执行中 · 步骤 3/5 · 当前工具 xxx"。

**容量约束**:横向空间有限(与消息列表同宽),建议**最多 3 个块**,
纵向堆叠;每块建议限制为单行描述树(`row` 根节点)。

**数据流**:插件在 main 进程订阅 `step:updated` / `content:part` 会话事件
(log-monitor 已实证),状态变化调 `ctx.refresh()`,宿主重拉
`ui:render:composer.above:<id>`。

**限制**:

- 高度受限:单块 32px 以内,否则挤压消息列表。
- InputBox 有多处实例(主窗 / 浮层 / 辅助窗口),需决定"锚点挂在哪一处"
  (建议:主窗聊天面 + 浮层侧栏聊天面,辅助窗口不挂)。
- 语音录制态 / 命令模式态下 composer-anchor 已占位,锚点块需避开
  `composer-anchor` 的语义(它承载的是**帧状态**,插件块是**内容状态**)。

### A-2. `chat.status-bar` —— 状态栏 【A 档】

**位置**:目前**没有全局状态栏**。既有的"状态栏"其实是三处各自为政的组件:
`ChatPanel` 内的 `BackgroundJobsStatusBar` + `GoalStatusBar`(消息列表下方、
输入框上方)、`InputBox` 内的 `MusicStatusBar`(composer-anchor 内)、
`RoomSurface` 内的 `BackgroundJobsStatusBar`。

**语义**:全局性的、与具体会话无关的状态(后台任务、目标进度、音乐播放)。

**容量约束**:现有先例都是**单组件占一行**,无多块并排的先例。若做锚点,
建议定义为"聊天面底部状态条"(`ChatPanel` 内、MessageList 之下),横向排列
多个块,每块限 icon + 短文本。

**限制**:

- 没有现成的"状态栏容器"——锚点需要**新建容器组件**。
- 三个既有状态栏各自有专属语义(目标/后台任务/音乐),**不并入**插件锚点
  (它们有自己的交互逻辑,降级到描述树会损失 UX —— 与 R5"不重写内置产品
  面板"的裁决同构)。
- 多窗口:状态栏挂在主窗聊天面;辅助窗口不挂。

### B-1. `composer.dock` —— 输入框 dock 区 【B 档】

**位置**:`InputBox.vue` 的 `composer-dock`(TransitionGroup 内,现承载
QueuePanel/QuotedContext/AttachmentRow)。

**语义**:随草稿旅行的上下文块(引用、附件、排队消息)。插件块若放这里,
语义是"与本次输入相关的上下文"。

**限制**:

- `composer-dock` 是 `TransitionGroup`,现有个块按条件 v-if 挂载 ——
  插件块需接入同一套显隐逻辑,否则在无引用/无附件时凭空多一行。
- 与 `composer.above` 在视觉上几乎同位置(都在输入框上方),**二者择一先做**
  即可覆盖用户场景;建议先做 `composer.above`。

### B-2. `sidebar.menu` —— 侧栏菜单 【B 档,已有半成品】

**位置**:侧栏「⋯」菜单(Sidebar.vue,吃 `useWorkspaceNavEntries()`)。

**现状**:工作区面板(含插件面板)已在此菜单中 —— 这是**已实现**的锚点。
用户实测反馈"菜单里只有四个选项"是已提交版本(`inSidebarMenu` 过滤)的
行为,工作区未提交改动已修复(菜单 = 全部 inPanelNav + 插件面板)。

**限制**:菜单项 = 打开面板,不是嵌入 UI 块 —— 它解决"入口"问题,不解决
"嵌入式状态显示"问题。插件要在这里显示动态状态(徽标、进度),需要扩展
菜单项形状(加 badge 字段),属于二期。

### B-3. `chat.header` —— 聊天头部 【B 档】

**位置**:`ChatWindow` 顶部的标题栏区(会话名、模型选择、操作按钮)。

**语义**:会话级上下文操作。

**限制**:空间极小(标题 + 按钮行),只适合 icon 级入口;与面板入口语义重叠
(插件面板已有 ⋯ 菜单入口),价值有限。**建议 C 档或不做**。

### B-4. `workbench.tab` —— 右侧工作台 【B 档】

**位置**:`RightWorkbenchPanel` 的 tab 栏。

**语义**:右侧工作台的 tab 化入口 —— 插件面板可作为一个 tab 出现在右侧,
而不是占据主工作区。

**限制**:RightWorkbenchPanel 的 tab 类型是编译期联合(`tab.type`),
新增 tab 类型需要宿主改动 —— 与"新增面板不改宿主"的 R5 目标冲突。
**建议不做**,插件面板继续走主工作区 MediaPanel 路线。

### C-1. `message.actions` —— 消息操作 【C 档】

**位置**:消息气泡的操作行(复制/重试/编辑等)。

**限制**:消息级操作与权限系统耦合;描述树渲染器不擅长"贴在气泡上的
小按钮"形态。价值有(如翻译、标记),但成本高。**设计预留,不排期**。

### C-2. `markdown.block` —— 消息正文内嵌 【C 档】

**位置**:消息正文 markdown 流中。

**限制**:内容渲染通道(MessageMarkdown)与描述树渲染器是两套系统;
在 markdown 中嵌入插件块需要自定义语法 + 渲染钩子,且与消息存储/回放
耦合(历史消息里的插件块如何回放?插件已卸载怎么办?)。**明确不做**,
记录在案 —— 这是"插件残留进会话历史"的典型案例(拆除测试的数据侧判据
会因此复杂化)。

### C-3. `settings.tab` —— 设置页 tab 【C 档】

**位置**:设置窗的 tab 列表。

**现状**:插件配置已在 PluginsSettingsTab 内渲染(R3,manifest schema 驱动,
不执行插件代码)。这是"设置页内嵌插件 UI"的**已实现形态**。

**限制**:插件若要贡献**独立设置 tab**(而不是在插件列表里配),需要扩展
设置窗 tab 注册机制。价值低(插件配置已有归口),**不做**。

---

## 3. 红线清单:有意不开放的位置

| 位置 | 原因 |
| --- | --- |
| 消息正文内嵌(`markdown.block`) | 与消息存储/回放/拆除语义耦合,插件残留进历史 |
| 替换 InputBox 本体 | 接管输入状态 = 插件代码获得宿主核心交互控制权,违反宪法第 1 条 |
| 替换 MessageList / 消息气泡本体 | 同上,且消息渲染是性能敏感路径 |
| 注入全局 CSS | 违反"过线皆可序列化";样式只能通过主题 token 面(见 §4) |
| 侧栏 rail 图标区 | 纯图标导航,空间语义固定;插件面板入口已走 ⋯ 菜单 |
| 设置窗独立 tab | 插件配置已有归口(PluginsSettingsTab) |

---

## 4. 样式与主题:插件的样式定制面

**现状**:

- 主题系统:JSON 主题 → 语义 token → 130+ CSS 变量 —— `CSS_VAR_MAP` 在
  `packages/onething-runtime/src/themes/css-mapper.ts`;renderer 侧
  `applyThemeVariables` 把变量写到 `:root`(`packages/renderer/stores/themes.ts`)。
  (勘误:本文档初版引用 `onething-runtime/src/themes/themes.ts:239-243`,
  该文件不存在。)
- 描述树渲染器全部使用 `--ui-*` CSS 变量,没有内联样式 —— 主题切换时
  插件面板自动跟随。

**插件的样式定制路径**(三条,按开放顺序):

1. **跟随主题(默认,零成本)**:描述树块用宿主 token,主题切换自动跟随。
   这是宪法第 2 条的自然结果 —— 插件给数据,宿主给样式。
2. **主题 token 覆盖(二期)**:manifest `contributes.theme` 声明对现有
   token 的覆盖(如 `accent` 换成插件品牌色)。**只允许覆盖,不允许新增
   token** —— 新增 = 全局 CSS 注入的变体,红线。
3. **webview 逃生舱(H 线)**:iframe 内完全自定义样式。这是"动画完全
   自定义"的唯一路径(见表达力文档)。

**动画**:描述树**不可表达动画**(纯数据,宿主渲染)。选择:

- 宿主给描述树节点加受限动画原语(`progress` 节点的 indeterminate 态、
  `list` 的进入动画)—— 低成本,覆盖常见场景;
- 完全自定义动画 → webview。

---

## 5. 多宿主差异(硬限制)

| 宿主 | 插件执行 | 锚点块渲染 |
| --- | --- | --- |
| Electron 桌面 | ✅ 真执行 | ✅ 渲染 |
| apps/server | ❌ noopEntry 目录假象 | ❌ 不渲染(方案 A 501/投影降级) |
| CLI daemon | ❌ 零引用 | ❌ 无 UI |
| gateway | ❌ | ❌ 纯文本渠道 |

web 端 `onPluginNotification: () => () => {}`(web.ts,有意降级)。锚点协议
保持 host-neutral(与 R2 请求通道同构),但**只有 Electron 接线** ——
这写在设计文档方案 A 里,锚点系统不改变这个决策。

---

## 6. 审计方法与可复现命令

```
# 宿主 UI 树
grep -n '<template>\|</template>\|<ChatWindow\|<MediaPanel' packages/renderer/App.vue
# 输入框结构
sed -n '15,110p' packages/renderer/components/chat/InputBox.vue
# 描述树渲染器能力
grep -n "v-else-if=\"node.type" packages/renderer/components/plugins/PluginPanelNode.vue
# 面板注册表(单一事实源)
sed -n '1,200p' packages/renderer/workspace/panel-registry.ts
# 请求通道
sed -n '1,120p' packages/core/plugins/request-channel.ts
# 插件 API 面
sed -n '110,310p' packages/core/plugins/types.ts
# 多宿主差异
sed -n '920,1030p' apps/server/src/runtime.ts
```

---

## 7. 与现有文档的关系

- 本审计是 [`plugin-ui-anchors-2026-08.md`](./plugin-ui-anchors-2026-08.md)
  (锚点系统设计)的事实基础。
- 表达力分层(描述树 v2 / webview)见
  [`plugin-ui-expression-layers-2026-08.md`](./plugin-ui-expression-layers-2026-08.md)。
- 落地排期与验收见
  [`plugin-ui-rollout-2026-08.md`](./plugin-ui-rollout-2026-08.md)。
- 宪法(六条)与 R0–R7 战役记录见
  [`plugin-system-redesign-2026-08.md`](../plugin-system-redesign-2026-08.md)。
