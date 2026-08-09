# 插件 UI 锚点与表达力:落地路线与验收(2026-08)

> 承接三份设计文档:
> [`plugin-ui-anchors-audit-2026-08.md`](./plugin-ui-anchors-audit-2026-08.md)(接入点盘点)、
> [`plugin-ui-anchors-2026-08.md`](./plugin-ui-anchors-2026-08.md)(锚点系统设计)、
> [`plugin-ui-expression-layers-2026-08.md`](./plugin-ui-expression-layers-2026-08.md)(表达力分层)。
> 本文给出排期、每期的落地清单与验收判据,并记录与 R0–R7 战役的衔接。

---

## 1. 排期总览

```
R5.x-a 锚点地基(本期)      ── UI_ANCHORS 常量 + manifest contributes.uiSlots + api.registerUiSlot
R5.x-b 描述树 v2(本期)     ── 新节点/控件 + refreshIntervalMs + 协议版本升 2
R5.x-c 渲染与接入(本期)    ── UiSlotHost/UiSlotBlock + PluginPanelHost 共享内核 + composer.above / chat.status-bar 挂点
R5.x-d 验收(本期)          ── plan-status demo + 拆除快照 + 协议违规测试 + 全量回归
      ↓
二期  主题 token 覆盖 + 受限动画原语(L2)
H 线  webview 逃生舱(L3,与 backend 子进程 ext host 同批)
```

**为什么本期同时做 a/b/c**:描述树 v2 的节点是锚点块的内容基础(plan 状态
条要 progress/badge),锚点协议是 v2 的载体 —— 两者互为依据,分开排期
会互相等待。但**实施顺序仍按 a→b→c**,每步可独立提交。

---

## 2. R5.x-a:锚点地基

### 落地清单

1. **core**:新文件 `packages/core/plugins/ui-anchor.ts` ——
   `UiAnchorId` 品牌类型、`UI_ANCHORS` 常量、`UI_ANCHOR_CAPACITY` 表
   (见设计文档 §3.1,第一版两个锚点:composer.above / chat.status-bar)。
2. **core**:`types.ts` 增加 `PluginContributionUiSlot` 与
   `PluginContributes.uiSlots?: PluginContributionUiSlot[]`
   (不叫 `contributes.ui` —— 与既有 `contributes.settings.ui` 区分)。
3. **core**:loader 的 manifest 校验 —— **未知锚点名不拒绝加载**:丢弃该条
   contribution,清单投影标记 `unsupported`(设置页可见),不计熔断;
   `contributes.uiSlots` 解析与透出。
4. **core**:api-builder 增加 `registerUiSlot`(与 registerWorkspacePanel
   同构:声明匹配校验 → 重复拒绝 → 挂请求通道 `ui:render:<anchor>:<id>` /
   `ui:action:<anchor>:<id>`);`registerRequestHandler` 的保留前缀检查
   从 `panel:` 扩为 `panel:` + `ui:`。render/onAction 的 ctx 在面板 ctx
   之上增加 `anchor` 与 `sessionId: string | null`(v1 就带,见设计文档 §4.2)。
5. **core**:通道守卫 `describePluginPanelResultProblem` 扩展 `ui:` 前缀。
6. **core**:**policy.ts 接线 `ui:` 家族(容易漏,漏了熔断语义就错)** ——
   `classifyPluginScope` 在通配 `request:` **之前**增加
   `request:ui:render:` / `request:ui:action:` → `ui-request`;
   `describePluginSurface` 把同一锚点块的 render/action 折叠为
   `ui:<anchor>:<id>` 单 surface(该函数在热路径上,沿用预编译 RegExp
   模块级常量模式,不现编正则)。
7. **app 层**(onething-runtime):api 转发 + `declaredUiSlots` 注入 +
   `emitPanelRefresh` 支持 `ui:` 前缀 panelId;**清单投影按全局规范顺序
   产出**(`enabledAt`,平局 pluginId 字典序 —— 排列/截断/主题冲突三处
   共用这一个出处)。
8. **renderer**:`ui-anchor-registry.ts`(锚点块清单,吃插件清单投影 +
   `onething:plugins-changed` 刷新路径,与 `setPluginWorkspacePanels` 同源)。

### 验收

- 协议测试:**未知锚点** → 丢弃该 contribution 并标记 `unsupported`,插件
  照常加载、不计熔断;**未声明 id / 重复注册 / `ui:` 抢占** → 拒绝且计
  `registration` 熔断。
- **熔断分类与 surface 折叠**:`request:ui:*` 归入 `ui-request` 家族;
  同块 render 连败降级后 action 被短路;一次 render 成功整块恢复。
- `UI_ANCHOR_CAPACITY` 键集合 == `UI_ANCHORS` 产出集合(类型 + 运行时断言)。

---

## 3. R5.x-b:描述树 v2

### 落地清单

1. **core/panel.ts**:`PLUGIN_PANEL_PROTOCOL_VERSION` 升 2;
   `PANEL_NODE_TYPES` 增加 table/tabs/progress/spinner/badge/image/link/code/divider;
   `FORM_CONTROLS` 增加 textarea/slider/checkbox-group/radio/date/color;
   `validateNode` 增加对应分支(字段校验与深度一致);**image/link 的 url
   scheme 白名单**(image 仅 `data:`/`https:`,link 仅 `https:`/`mailto:`,
   见表达力文档 §2.4);
   `PluginPanelTree` 增加树级 `refreshIntervalMs`(上限 1000ms,过限拒绝)。
2. **renderer/PluginPanelNode.vue**:对应 v-else-if 渲染分支(全部宿主原语,
   零插件代码);`refreshIntervalMs` 由 PluginPanelHost 消费(块可见时
   定时重拉,不可见不轮询,卸载清 timer)。
3. **plugin-panel-types.ts**(renderer 侧协议镜像)同步。
4. **测试**:每个新节点/控件的渲染快照 + 校验器正反例;
   `refreshIntervalMs` 的轮询/上限/可见性语义。

### 验收

- 新节点/控件全部有渲染测试;校验器对非法值(缺字段、类型错)全拒;
  **URL scheme 反例全拒**(`javascript:` / `http:` / 协议相对 `//`)。
- 既有 v1 树(version 1)在 v2 宿主上照常渲染(向后兼容测试)。
- 深度上限与扫描深度随新节点复核(嵌套节点加深时 PANEL_TREE_SCAN_DEPTH
  重新核算)。

---

## 4. R5.x-c:渲染与接入

### 落地清单

1. **PluginPanelHost 拆共享内核**:把"一个可寻址插件 UI 块"的渲染逻辑
   (loading/error/degraded/tree 四态、latest-wins render token、trailing
   debounce、请求通道调用、refresh 合流)抽成可复用内核(如
   `usePluginUiBlock` composable + `PluginUiBlockShell` 组件),
   PluginPanelHost 与新的 UiSlotBlock 各包一层壳。
   **工作区面板零行为变化**(既有测试全绿是硬要求)。
2. **UiSlotHost.vue**(新):按 anchor 收集块清单 → 按 manifest 顺序排列 →
   容量裁剪(maxBlocks 截断 + maxHeight 滚动)→ 渲染 UiSlotBlock。
3. **挂点**:`InputBox.vue` composer-stack 顶部挂
   `<UiSlotHost anchor="composer.above">`;`ChatPanel.vue` MessageList 之下
   挂 `<UiSlotHost anchor="chat.status-bar">`。
4. **render ctx 带 anchor 与 sessionId**:插件 render 时知道自己在哪个锚点
   (返回"单行友好"或"整页友好"的树),也知道当前会话
   (`sessionId: string | null`);**宿主在会话切换时对本锚点全部块重拉**
   (返回不依赖 sessionId 的树即全局块)。
5. **排列/截断/去重**:跨插件按全局规范顺序(清单投影产出,renderer 不二次
   发明);加载失败的块不计入 maxBlocks(折叠聚合指示);主窗 + 浮层两个
   UiSlotHost 实例的 render 结果按 `(pluginId, anchor, id)` 去重,不重复打
   请求通道。

### 验收

- 既有 PluginPanelHost 测试全绿(重构无回归)。
- UiSlotHost 挂点测试:块渲染、容量截断、卸载清 DOM、锚点已满提示、
  **失败块不占容量**。
- **顺序确定性**:同一插件集合两次加载,块排列与截断结果逐字节一致。
- **会话切换重拉**:切换会话后 render ctx 的 sessionId 更新且块重渲染。
- 主窗 + 浮层聊天面都挂 composer.above;辅助窗口不挂(已拍板)。

---

## 5. R5.x-d:plan-status demo 与收尾

### demo 插件(sample-plugins/plan-status/)

- manifest:`contributes.uiSlots: [{ anchor: 'composer.above', id: 'plan-status', label: 'Plan 执行状态' }]`
- entry:订阅 main 进程会话事件(`message:assistant-created` /
  `step:updated` / `stream:start` / `stream:end`,log-monitor 已实证订阅面),
  维护"当前执行状态"内存态;`registerUiSlot` 的 render 返回描述树:
  - 空闲:badge "idle" + 短文案
  - 流式中:progress(indeterminate) + "执行中"
  - 步骤:badge(步骤 n/m) + 当前工具名
  - 完成:badge(success) + 用时
  - 状态变化调 `ctx.refresh()`
- 宿主零改动(锚点协议已就位)。

### 拆除与回归

- 拆除快照测试:禁用/卸载 plan-status 后,renderer 锚点注册表空、
  DOM 无残留、IPC 无在飞请求(与 R5 拆除测试同构)。
- 全量回归纳入口径:policy 分类/surface 折叠、顺序确定性、未知锚点降级、
  URL scheme 反例。
- 全量:typecheck(node+web)、lint、vitest、boundary 守卫零新增越界。
- 文档:插件指南更新 —— "你能在输入框旁边放东西,不能进输入框里面";
  表达力决策表(见表达力文档 §6)进 CLAUDE.md 插件条目。

---

## 6. 二期与 H 线的衔接

> **2026-08-09 拍板**:二期(B 期,L2)与 webview(C 期,L3)开工,排序
> A(legacy 清零)→ B → C。**webview 与 backend 子进程 ext host 解耦**:
> webview 的插件代码仍在 main 进程(与描述树同一执行模型),iframe 内只有
> 插件目录静态文件,隔离靠独立 origin + CSP + postMessage —— 与插件逻辑代码
> 在哪个进程无关。原"同一波安全面加固"的绑定是排期偏好而非技术前置,
> ext host 留在 H 线终局(redesign §7 已同步此差异)。

| 期 | 内容 | 前置 | 状态 |
| --- | --- | --- | --- |
| A 期 | legacy 目录插件清零(retirement-plan 文档) | P1–P3 | 执行中 |
| B 期 | L2 主题 token 覆盖(contributes.theme)+ 受限动画原语 | R5.x 全量落地 ✓ | **已落地(2026-08-09)** |
| C 期 | L3 webview 逃生舱(**不含 ext host**) | R1 软隔离 ✓ + B 期 ✓ | **已落地(2026-08-09)** |
| H 线 | backend 子进程 ext host(权限声明强制、RPC 化 API) | 宪法第 1、2 条持续生效 | 终局,不排期 |

### 6.1 B 期落地清单(L2)

**B1 `contributes.theme` —— 主题 token 覆盖**

1. **core/types.ts**:`PluginContributes.theme?: { overrides: Record<string, string> }`。
   manifest 校验:键必须 ∈ `CSS_VAR_MAP` 键集合(既有 token 白名单,不许新增
   token);**值必须过颜色字面量白名单**(见 B1 安全面)。非法条目丢弃并在
   清单投影标记(与未知锚点同规:降级不拒载,不计熔断)。
2. **注入点(main 侧)**:主题 CSS 变量生成之后、IPC 下发之前 —— 在
   `generateCSSVariables`(`packages/onething-runtime/src/themes/css-mapper.ts`)
   的调用侧叠加插件覆盖层。renderer 的 `applyThemeVariables` 零改动
   (它只是消费下发的变量表)。
3. **冲突语义**:覆盖是全局的;多插件覆盖同一 token 按**全局规范顺序后者胜**
   (`enabledAt`,平局 pluginId 字典序 —— 与锚点排列同一出处,不另发明)。
   设置页插件卡片显示该插件的覆盖清单与"是否被更后者压过"。
4. **生效/撤除时机**:enable/install 即时生效,disable/uninstall 即时撤除
   (插件目录变化事件 → 主题重推,复用 `onething:plugins-changed` 一族);
   主题切换时覆盖保留(覆盖挂在"当前主题产出"之上)。**进拆除快照测试**
   (禁用后 `:root` 变量回到主题原值)。
5. **披露**:装前确认页出现 `overrides theme colors (<token 清单>)`。
6. **多宿主**:方案 A 口径,desktop only;server 清单投影透传声明但不消费。

**B1 安全面(表达力文档没写,此处补上)**:token 值是插件伸进 `:root` 的
字符串。虽然 `setProperty` 不会逃出属性值语法,但任意值仍可携带
`url(...)`(远程加载/追踪)与 `var(...)`(递归引用制造求值异常)。
白名单只放行颜色字面量:`#hex(3/4/6/8 位)`、`rgb()/rgba()`、`hsl()/hsla()`、
`oklch()/oklab()`、CSS 命名色;正则钉死,反例测试至少覆盖
`url(`、`var(`、`;`、`}`、`expression(`、空串、超长串(>128 字符拒绝)。

**B2 受限动画原语(全部宿主侧,插件零声明零代码)**

1. 核对 `progress` indeterminate 态已有宿主 CSS 动画(v2 落地时应已带);
2. `tabs` 切换、`list` 项进出场接宿主既有 Transition(与内置面板同套,
   过 `ui:gate` 的 transition-literal 规则 —— 用既有 token 不写字面量);
3. badge tone 变化的过渡(颜色过渡即可,不做位移动画);
4. 指南写明:**完全自定义动画 = webview(C 期后)**,描述树里没有也不会有。

**B 期验收**:manifest 正反例(未知 token/非法值全拒且不拒载)、覆盖叠加与
后者胜顺序确定性、disable 撤除快照、主题切换保留覆盖、装前披露文案、
双端 typecheck + 全量测试 + boundary/ui 双闸无新红。

### 6.1.1 B 期落地实录(2026-08-09)与规格差异

代码位置(分层裁决):

| 环节 | 落点 |
| --- | --- |
| 值白名单 + 条目上限 + 形状校验 | `packages/core/plugins/theme-contribution.ts`、`loader.ts`(`validatePluginContributes`) |
| 全局规范顺序(唯一出处) | `packages/core/plugins/canonical-order.ts` |
| 键白名单 + 冲突裁决 + token→CSS 变量展开 | `packages/onething-runtime/src/plugins/theme-overrides.ts`(产品层,吃 `CSS_VAR_MAP` 本体) |
| 清单投影(逐条裁决可见) | `packages/onething-runtime/src/plugins/plugin-list.ts` |
| 装配接线(从插件管理器收集) | `packages/onething-runtime/src/app/plugins/theme-overrides.ts` |
| 合成点(覆盖进主题计算) | `packages/onething-runtime/src/themes/{index,resolver}.ts` 的 `tokenOverrides` 参数 |
| 宿主接线 | `apps/electron/src/main/ipc/themes.ts` 把 `getPluginThemeOverrideTokenValues()` 当参数递进 `applyTheme` |
| 重推 | `packages/renderer/stores/themes.ts` 监听 `onething:plugins-changed` |

renderer 的 `applyThemeVariables` **一行未改** —— 它只消费下发的表。

与 §6.1 的逐条差异:

1. **值白名单不拒载,只丢条目。** §6.1 第 1 条写"值必须过颜色字面量白名单"、
   同一句又写"非法条目丢弃并在清单投影标记(降级不拒载)";两者只能取一。
   取后者:白名单**判据**住在 core(`isPluginThemeColorValue`,反例测试逐条),
   但**执行**是按条丢弃 + 投影标记。理由:B1 第 6 条要求非法条目"标记可见",
   而拒载的插件根本不会进清单,标不出来。拒载只留给形状错(theme 不是对象 /
   overrides 缺失 / 值不是字符串 / 条目 > 32)。
2. **键合法性判在产品层而不是"装配层"。** 任务书写"键合法性在装配层过滤"。
   实际落在产品层的 `plugins/theme-overrides.ts`:那里已经能同时吃到 core 的
   判据与 `CSS_VAR_MAP`,而清单投影(`plugin-list.ts`,uiSlots 的 `unsupported`
   也在那里判)本来就是产品层。装配层只剩"从管理器取清单"这一件事。
   分层方向没有被破:产品层 → 产品层。
3. **没有缓存,因而没有缓存失效。** 任务书要求"目录变化时缓存失效"。
   唯一数据源是插件管理器的内存清单(`getPlugins()`),enable/disable/
   install/uninstall 一改它就变;合成只发生在 applyTheme 这种低频调用上,
   重算是几十条 manifest 的遍历。再加一层缓存等于给自己造一个需要失效的副本。
4. **规范顺序的定义写实。** §6.1 与锚点文档都写"`enabledAt`,平局 pluginId
   字典序"。仓库里**没有 enabledAt** —— 启用状态是布尔开关(`settings.plugins`),
   盘上没有启用时刻,现有实现(renderer 的 `setPluginUiSlots`)一直就是纯
   pluginId 字典序。B 期沿用同一语义并把它提成 core 的唯一出处
   (`comparePluginCanonicalOrder`),不为一个 UI 排序引入一份需要迁移的新状态。
5. **停用插件多一档状态 `inactive`。** §6.1 只说了 active/shadowed/invalid。
   实际需要第四档:停用的插件声明仍要在卡片上可见,但既不参与合成也不参与
   冲突裁决(否则关掉插件 A 会改变插件 B 的呈现状态)。
6. **装前披露只落在市场确认页与已装卡片两处。** 任务书提到"Install 表单确认";
   Install 表单收的是包名/本地路径,装之前**没有 manifest 可读**,与
   `leaves persistent content` 的既有落点完全一致(同样只有这两处)。
7. **B2 tabs 的过渡分两层**:页签条本身是 CSS 过渡(颜色 + 下划线),页签
   **内容**用 `<Transition mode="out-in">`(只做透明度)。不做位移:描述树
   内容高度不可预知,位移会把整块面板抖起来。`progress` indeterminate 的宿主
   动画 R5.x-b 已带,本期核对无需补。
8. **合成点从 IPC 响应侧前移到主题计算之内(2026-08-09 真机走查发现)。**
   初版按"主题模块零改动"的口径,把覆盖 spread 在 `applyTheme` 返回的
   `cssVariables` 上。真机上装了 `{ primary, accent }` 的品牌插件后界面几乎看不出
   变化 —— 因为覆盖表只展开了 `CSS_VAR_MAP` 列出的**原始变量**,而:
   `resolveThemeUI` 派生的整个 `--ui-*` 语义层、`generateCSSVariables` 现算的
   `-rgb` 三元组、`applyThemeColorSemantics` 现算的 primary 色阶,全部在**生成期**
   从 `resolvedColors` 派生;renderer 上可见的 UI 消费 `--ui-accent*` 一族 526 处、
   消费原始 `--accent`/`--color-primary` 仅约 50 处。事后盖原始变量 = 派生层整片
   留在旧色上,实测只有 3 条变量会变。
   改法:覆盖以**参数**(`tokenOverrides`)递进 `applyTheme` → `resolveTheme`,
   分三处落位 —— ① 顶层(无点)token 先进 `defs`/flat 表,主题里按名字引用的取值
   (`bg.btn.primary: "accent"`)才跟着走;② 语义派生前写进 `resolvedColors`,
   色阶/ui 层/-rgb 全部按覆盖色重算;③ 语义派生后再写一次,保证"声明什么、
   `:root` 上就是什么"(内部加工如 danger 向红偏移不得改写出口值)。
   同一组覆盖实测变色变量 3 → 38(其中 `--ui-*` 20 条)。
   产品层 themes **仍不认识插件**:它只收一张 token → 颜色字面量的表。
   宿主侧的事后 spread(`applyPluginThemeOverrides` / `composeThemeVariables-
   WithPluginOverrides`)一并删除 —— 留着会形成"原始变量来自覆盖、派生变量来自
   重派生"的双源。方案 A 口径不变:server 不消费,不传该参数。

### 6.2 C 期落地清单(L3 webview,配方展开见表达力文档 §4)

1. **C1 自定义协议**:`onething-plugin://<pluginId>/<path>`,
   `protocol.handle` 只服务该插件家目录下 `dist/`(或 manifest 声明的静态根)
   内文件;privileged + supportFetchAPI;防目录穿越(规范化后必须仍在根内)、
   防 symlink 逃逸(realpath 复核);MIME 按扩展名白名单(html/js/css/图片/
   字体),其余 415。顺带放行 v2 `image.url` 引用插件自有资源。
2. **C2 iframe 容器**:sandbox iframe(`allow-scripts` 单开,无
   `allow-same-origin` 之外的能力)+ CSP 响应头
   `default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'`;
   宿主注入一次性 token(postMessage 首帧握手),消息无 token 即弃;
   容器复用 UiSlotBlock/PanelHost 的四态壳。
3. **C3 声明面**:`contributes.panels[].view: 'webview'` + `entry`(静态根内
   HTML 相对路径)。**锚点块第一版不开 webview**(32px 单行塞 iframe 无正经
   场景,面板先行)。装前确认页披露 `runs sandboxed UI code`。
4. **C4 通信**:iframe→host `{token, type:'invoke', actionId, payload}` 走既有
   `panel:action:<panelId>` 通道(30s 预算/abort/熔断全继承);host→iframe
   `{type:'init', data}`(render 通道退化为初始化数据)+ `{type:'push', event}`
   事件桥。payload 过 `describeNonSerializable` 同规校验。
5. **C5 验收**:demo 插件(描述树做不了的东西,如 canvas 图表)、CSP/穿越/
   token 冒充反例、拆除快照(卸载后协议不再服务该 id)、真机走查。

### 6.3 C 期落地实录(2026-08-09)与规格差异

代码位置(分层裁决):

| 环节 | 落点 |
| --- | --- |
| 判据(路径规范化 / MIME 白名单 / CSP 串 / entry-root 校验 / 消息名) | `packages/core/plugins/webview.ts` |
| 面板 init 的 action 名与通道守卫 | `packages/core/plugins/panel.ts`(`PLUGIN_PANEL_INIT_ACTION`、`describePluginPanelResultProblem`) |
| 熔断家族与 surface 折叠 | `packages/core/plugins/policy.ts` |
| manifest 形状校验(panels.view/entry、webviewRoot、uiSlots.view 拒载) | `packages/core/plugins/loader.ts` |
| 注册面(形态 → action 名) | `packages/core/plugins/api-builder.ts`(`declaredWebviewPanelIds`) |
| 声明筛选(非法 webview 面板不进 declaredPanelIds) | `packages/onething-runtime/src/app/plugins/loader.ts` |
| 静态根解析(供给线) | `packages/onething-runtime/src/app/plugins/webview.ts` |
| 清单投影(逐条判决可见) | `packages/onething-runtime/src/plugins/plugin-list.ts` |
| 协议 handler(IO / realpath / 响应头) | `apps/electron/src/plugins/protocol.ts` |
| scheme 登记(ready 之前)+ handler 挂载(ready 之中) | `apps/electron/src/app/bootstrap.ts` |
| iframe 容器与通信桥 | `packages/renderer/components/plugins/PluginWebviewFrame.vue` |
| 四态壳复用 | `PluginPanelHost.vue` + `usePluginUiBlock`(新增 `invoke` 的返回值) |

与 §6.2 的逐条差异:

1. **静态根是代码区,不是家目录。** §6.2 第 1 条写"只服务该插件家目录下 `dist/`"
   是错的:`plugins/<id>/` 是**数据区**(config.json / kv.json / storage/),
   把它端到一个 origin 上等于把用户数据交给 iframe 里的脚本。落地的根是
   **`dirPath` + `contributes.webviewRoot`**(缺省 `webview/`;npm 形态的 dirPath
   即 `plugins/node_modules/<pkg>/`,内置插件同理),realpath 复核之后仍须落在根内。
2. **CSP 实测:`'self'` 与 host-source 两种写法都放行,两条都写。**
   开工时的担心是 opaque origin(`sandbox="allow-scripts"` 无 `allow-same-origin`)
   下 `script-src 'self'` 匹配不到任何 URL。**在 Electron 里真跑了一遍**(四档对照:
   `'self'` / `onething-plugin://<id>` / 两者 / `'none'`,iframe 内脚本能否
   `parent.postMessage` 作为判据):
   - `'self'` → **放行**;`host-source` → 放行;两者 → 放行;`'none'` → **被挡**
     (对照组证明 CSP 确实挂上了,不是没生效)。
     原因:Chromium 计算 `'self'` 用的是 policy 的 self-origin(= **响应 URL** 的
     origin),不是文档那个 opaque origin。
   - 同一次实测另外两个结论:iframe → parent 的 `event.origin` 是字符串 `"null"`
     (所以宿主校验靠 `event.source === iframe.contentWindow` + 一次性 token,
     不靠 origin);`connect-src 'none'` 下 `fetch` 直接 TypeError(页面不出网)。

   发出去的 CSP 因此是 `script-src 'self' onething-plugin://<pluginId>`:
   host-source 是不依赖上述实现细节的那一条,`'self'` 是零成本的第二保险。

   **父页 CSP 是真的会挡住整个 iframe 的那一层,而且规格没提。**
   `apps/electron/src/window/session-security.ts` 里 session 级的 CSP 原本写着
   `frame-src 'none'` —— 第二轮实测(把这张真表挂上 `onHeadersReceived`,再从
   `file://` 的父页挂 sandbox iframe)对照结果:
   `frame-src 'none'` → iframe 根本不加载(子页脚本从未运行);
   `frame-src onething-plugin:` → 正常加载且脚本运行。**父页的拦截发生在子文档的
   CSP 之前**,子文档的 CSP 再严也没机会生效。同一次实测也确认:两份 CSP
   (session 级 + 协议响应级)叠加不会把插件页面的脚本挡掉。
   落地只放**scheme**不放 host —— 谁能被服务的判定在协议 handler 那一侧,
   不在这行字符串里。
3. **webview 面板的 render 换了 action 名:`panel:init:<id>`。** §6.2 第 4 条说
   "render 通道退化为初始化数据"。同一个 action 名承载两份返回值语义,会逼着
   通道守卫反查"这个面板是哪一种"——那份反查一旦漂移,"未校验的树过线"与
   "初始化数据被当成树拒收"两种事故都会出现。换个名字,守卫按前缀判定即可。
   **surface 不因此分叉**:`panel:init` / `panel:action` 仍折成 `panel:<id>`,
   家族仍是 `ui-request`。
4. **注册语义:render 返回初始化数据,校验退回"纯数据"守卫。** 插件侧写法不变
   (还是 `registerWorkspacePanel({ id, render, onAction })`),`onAction` 原样保留
   并继续走 `panel:action:<panelId>`(30s 预算 / abort / 熔断 /
   `describeNonSerializable` 全继承)。init 的返回值只过
   `describeNonSerializable`(函数成员照样当场拒 —— 闭包过不了结构化克隆),
   不套描述树形状。
5. **纯静态面板(零代码)合法,靠 `requestActions` 判定而不是错误文案反查。**
   声明先于代码:manifest 有 view+entry 就够,插件可以完全不调
   `registerWorkspacePanel`。renderer 据清单投影里的 `requestActions` 是否含
   `panel:init:<id>` 决定要不要去拉初始化数据 —— 不去解析"has no request handler"
   那句错误文案(字符串反查会漂)。
6. **加载失败的判据是握手,不是 `iframe.onerror`。** 协议 404 返回的是宿主自己的
   纯文本错误页:iframe 的 `load` 照常触发、`error` 不触发,而 opaque origin 的
   document 宿主读不到 —— 没有别的信号。于是**页面必须在 10s 内回一条带 token 的
   消息**(`ready`,或任何一条 invoke),超时走四态壳的 error 态并给 Reload。
   这条契约写进了作者指南(附可拷贝的 vanilla JS)。加载失败**不计插件熔断**
   (它是宿主/文件问题);`onAction` 失败照旧计账。
7. **`refresh` 复用既有 panel-refresh 通知链,且不重载 iframe。** 插件调
   `ctx.refresh()` → 既有 `plugin:notification` 的 `panel-refresh` 轨 → 宿主重拉
   init → `postMessage({type:'refresh', token, data})`。重载会把页面里的滚动位置与
   输入状态全丢掉,而这是一次数据更新,不是一次导航。
8. **非法 webview 声明 = 丢弃该 panel + 投影标记,不拒载**(与未知锚点同规);
   **`uiSlots[].view` = 拒载**。两者的区别是"这个宿主还没有"与"任何宿主都不会有":
   前者是版本偏斜(降级),后者是作者在要一个永远不存在的能力(当场说清)。
   非法面板同时被踢出 `declaredPanelIds` —— 留着它等于"清单说没有、注册却成功",
   而那个面板永远画不出来。
9. **`image.url` 放行 `onething-plugin:`,`link.url` 不放行。** 点开链接会导航,
   而这个 scheme 下的页面只该出现在 sandbox iframe 里。
10. **demo 插件不在本仓库做**(市场插件仓另立,walkthrough 阶段处理);
    验收用的是测试内的 fixture 与逐条对抗测试。

C5 对抗测试落点:`packages/core/plugins/__tests__/webview.test.ts`(判据)、
`packages/core/plugins/__tests__/webview-panel-channel.test.ts`(注册/通道/熔断)、
`apps/electron/src/plugins/__tests__/protocol.test.ts`(协议五闸 + 拆除快照)、
`packages/renderer/components/plugins/__tests__/PluginWebviewFrame.test.ts`
(init→invoke→result→refresh 全链 + token 闸 + 卸载无泄漏)。

---

## 7. 风险与对策

| 风险 | 对策 |
| --- | --- |
| policy.ts 漏接 `ui:` 家族 → 熔断落错家族、render/action 降级不成对 | R5.x-a 清单第 6 条显式接线 + 折叠验收测试(见 §2) |
| PluginPanelHost 重构引入面板回归 | 共享内核抽取先行提交,既有测试全绿才继续;拆除测试双面覆盖 |
| composer.above 与既有 composer-anchor 视觉冲突 | 挂点位于 composer-dock 之上、anchor 之下;容量 3 块 / 32px 硬限 |
| 描述树 v2 四处同步漂移(类型/校验/渲染/测试) | 每个节点一个测试文件钉住三处;校验器测试反查渲染分支存在 |
| 锚点块轮询打爆请求通道 | refreshIntervalMs 硬上限 1Hz + 仅可见时轮询 + 既有 200ms 合流 |
| 多窗口广播重复渲染 | 沿用 R5 的 IPCBridge 通知类多窗口广播 + renderer 侧 latest-wins |

---

## 8. 一句话

锚点系统把"插件 UI 能出现在哪"从"只有独立面板"扩成"宿主 UI 的固定位置",
描述树 v2 把"一块 UI 能多复杂"往前推一档,webview 在 H 线接住剩余需求;
三件事共用同一套协议、渲染器与通道 —— 窄腰不被加宽,只是腰上多挂了几件
家具。
