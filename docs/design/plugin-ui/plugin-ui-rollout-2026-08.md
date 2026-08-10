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
| D 期 | 触发式锚点(`message.actions` / `composer.actions`,锚点分类学 v2 §9) | R5.x 全量 ✓ + E 期带系统 ✓ | **已落地(2026-08-09,§6.4)** |
| F 期 | `composer.above` 的抽屉形态(展开/半收/全收,anchors §9.3.1) | D 期 ✓ + E 期 S 带 ✓ | **已落地(2026-08-09,§6.5)** |
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

### 6.4 D 期落地实录(2026-08-09)与规格差异

**表达力战役的最后一期**:锚点分类学 v2(anchors §9)的 trigger 协议落地。
一句话:**协议零新增,新增的只有 renderer 侧两个挂点 + 一个弹层壳** ——
§9.3 第 5 条原样兑现。

代码位置:

| 环节 | 落点 |
| --- | --- |
| 锚点表(kind 轴 + 两个 trigger 锚点)与 `uiAnchorKind` / `isTriggerUiAnchor` | `packages/core/plugins/ui-anchor.ts` |
| 容量镜像(含 kind) | `packages/renderer/workspace/ui-anchor-registry.ts` |
| 挂点内核(清单、容量折叠、开合、置灰记忆、拆除自关) | `packages/renderer/components/plugins/usePluginTriggerEntries.ts` |
| 共享弹层壳 | `packages/renderer/components/plugins/PluginTriggerPopover.vue` |
| 四态汇报出口(块 → 挂点) | `packages/renderer/components/plugins/UiSlotBlock.vue`(新增 `state` emit) |
| 挂点 1:消息 ⋯ 菜单 | `packages/renderer/components/chat/message/MessageActions.vue` |
| 挂点 2:输入框工具条 | `packages/renderer/components/chat/InputBox.vue`(`.toolbar-right`,附件按钮之前) |
| 验收 | `packages/renderer/components/plugins/__tests__/ui-trigger.test.ts` + 既有 `ui-slots.test.ts` / `ui-anchor-registry.test.ts` 扩写 |

与 §9.3 / §9.5 的逐条差异:

1. **弹层壳没有做成"入口 + 弹层"一个组件,而是拆成"内核 composable +
   弹层组件",挂点自己画入口。** 原因是实测出来的浮层嵌套事实:浮层内核
   (`composables/floating/useFloatingLayer`)判外点只问"这次 pointerdown 落没落
   在我自己身上",**没有嵌套层栈**。若把弹层长在 ⋯ 菜单的 Dropdown 插槽里,
   点弹层 = 菜单的"外点" → 菜单关闭 → 插槽内容卸载 → 弹层被连根带走。
   落地形态因此是:入口画在菜单里,**弹层挂在 Dropdown 之外**,点入口时
   先关菜单再开弹层,弹层锚到 ⋯ 按钮(这条消息上不会消失的宿主元素)。
   这不是对 §9.3 的偏离,是它第 3 条"遵守浮层决策树"的具体兑现方式。
2. **弹层内容直接复用 `UiSlotBlock`**,不另写一层四态壳 —— 四态、
   latest-wins、请求通道、refresh 合流、可见性轮询全部原样继承。
   代价是错误/降级态沿用块的"小字一行"形态(它本是给 24px 带设计的),
   在 280px 弹层里偏素;够用,不值得为它开第二套壳。
3. **"打开即 render、关闭即销毁"是 Popover 内核白送的**:它的插槽内容
   本就 `v-if="open"`,块随之挂载/卸载,通知订阅一并退订。没有写一行
   生命周期代码,拆除快照测试直接验订阅数归零。
4. **降级置灰的记忆活在挂点上,不在弹层里**(弹层关掉块就没了)。块每次
   拉取落定都往上报一次四态(`state` emit),挂点按 `pluginId:slotId` 记
   一份 paused 集合。**为什么不是"只在变化时报"**:每次打开都是新实例
   (初值 false),一个曾经降级、后来恢复的块不会产生 true→false 的变化,
   入口就会永远灰着 —— 所以报的是"每次落定后的当前态"。
5. **加载失败的插件不在 trigger 锚点上折叠成聚合指示**(常显块的
   `UiSlotHost` 会画一行 "N plugin blocks not running")。菜单与工具条不是
   解释插件问题的地方,失败项直接不出现;容量折叠只报个数("+N 个插件项
   已折叠" / 工具条上一枚 "+N")。详情仍在设置页。
6. **菜单里的置灰用文字后缀("已暂停")而不是 Tooltip**,工具条上的置灰用
   Tooltip(`<label> — 该插件项已暂停`)。菜单项的 label 本就看得见,再挂
   Tooltip 会把整行包进一层 wrapper 并影响行布局;工具条上只有图标,Tooltip
   是它唯一能说话的地方(也是 §9.3 第 4 条要求的那句说明的落点)。
7. **kind 进了容量表并被镜像**(`UI_ANCHOR_CAPACITY_MIRROR` 现在带 kind),
   镜像一致性测试的正则同步改写,并加了一条"五个锚点一个不少"的键集合断言 ——
   §9.4 的"五处"里最容易漏的就是这处镜像。
8. **`maxHeight` 在 trigger 锚点上换了含义**(弹层内容最大高度 320,不是入口
   高度)—— §9.2 的容量列只写了"3 项,超出折叠",没有给高度;镜像需要一个
   数字,就地补上并在两处注释里写明含义。
9. **样本插件按规格双住**:`tps-meter` 1.0.3 footer 徽标保留 + `message.actions`
   的 "Token usage" 明细表;`plan-status` 1.1.0 `composer.above` 状态条保留 +
   `composer.actions` 的 "Plan detail" 整树(状态行 + 步骤清单)。两个 tarball
   已构建,**未安装**(真机走查时用户自行安装)。

---

### 6.5 F 期落地实录(2026-08-09)与规格差异

**真机反馈驱动的一期**:plan-status 的常显整行"一直挂着"。落地的是
anchors §9.3.1 的抽屉 —— **不是新 kind,是 `block` 在 `composer.above` 上的
能力扩展**:同一条通道、同一套熔断账、同一份清单与容量裁决,多的只有宿主
画的两枚钮和一个宿主持有的三态。

代码位置:

| 环节 | 落点 |
| --- | --- |
| 容量表加 `drawer` / `expandedMaxHeight` + 四个抽屉判据(`supportsUiDrawer` / `isEffectiveUiDrawerSlot` / `isIgnoredUiDrawerDeclaration` / `uiDrawerExpandedMaxHeight`)+ ctx 的 `drawerState` | `packages/core/plugins/ui-anchor.ts` |
| manifest 字段 `contributes.uiSlots[].drawer` | `packages/core/plugins/types.ts` |
| 形状校验(必须是布尔;任何锚点上都不拒载) | `packages/core/plugins/loader.ts` |
| `drawerState` 随 payload 过线进 ctx(只认会渲染的两档) | `packages/core/plugins/api-builder.ts` |
| 投影裁决 `drawer` / `drawerIgnored` | `packages/onething-runtime/src/plugins/plugin-list.ts` |
| **三态状态机**(读/切/恢复/持久/拆除清态)+ 容量镜像 + 全收清单 | `packages/renderer/workspace/ui-anchor-registry.ts` |
| 抽屉壳 + 两枚开合钮 + 全收 chip(S 带) | `packages/renderer/components/plugins/UiSlotHost.vue` |
| 块侧:`drawerState` 进 render payload,切档即重拉 | `packages/renderer/components/plugins/UiSlotBlock.vue` |
| 清单透传 `drawer` | `packages/renderer/services/ipc-hub.ts` |
| 验收 | `packages/renderer/workspace/__tests__/ui-drawer-state.test.ts`(状态机 10 例)、`packages/renderer/components/plugins/__tests__/ui-drawer.test.ts`(挂点 6 例)、`ui-slots.test.ts` / `ui-anchor-registry.test.ts` 扩写 |

与 §9.3.1 的逐条差异:

1. **三态住在 `ui-anchor-registry`(renderer 全局注册表),不在组件里。**
   抽屉壳(composer.above 挂点)与全收 chip(S 带的 chipShell 挂点)是**两个
   组件实例**,同一份档若各存一份,收进 S 带的那一刻两边就会各说各话。
   注册表本来就是"块清单的单一事实源",档挂在同一处是最省的一致性。
2. **全收 chip 落在既有的 chipShell 挂点里,没有新组件。** `UiSlotHost`
   多一个职责:`chipShell` 为真时,除了本锚点的块,再画全收抽屉的 chip。
   S 带上因此可能出现"不属于 chat.status-bar 的 chip" —— 这是刻意的:
   S 带的语义就是"退了位的东西还剩一个入口"。
3. **全收 chip 不吃 `chat.status-bar` 的 8 块容量。** 它是
   `composer.above` 的住户,数量天然被那边的 `maxBlocks: 3` 兜住(最多 3 枚)。
   把它算进 status-bar 的容量会让"收起一个抽屉"挤掉一个真正的状态块 ——
   两个锚点的容量账不该互相污染。§9.3.1 第 6 条"占 S 带一枚 chip 位"说的是
   **视觉上的一枚位**,不是容量账上的一格。
4. **chip 的壳是 `StatusChip` 静态壳,可点的是壳里的一枚 button。**
   StatusChip 的可展开分支要求 `flyout` 插槽(它是"chip + 浮层"的组合),
   而全收 chip 点了不是开浮层,是**把块放回原位** —— 没有浮层可挂。
   反馈因此画在内层 button 上(hover 变色 + `:focus-visible` 描边),
   不去和 StatusChip 的 `.is-static:hover` 抢特异性。
5. **展开档的高度过渡做在块的 `max-height` 上**(`--duration-normal` +
   `--ease-default`,`prefers-reduced-motion` 直切)。不做位移动画 ——
   输入区一带的位移跳变要 FLIP 才不难看(判例 `project_composer_sidebar_glide`),
   而抽屉长高是**原地**的,邻座跟着抖才是错的。
6. **`drawerState` 只认 `'expanded' | 'peek'`。** 未知值(含 `'collapsed'`)
   在 core 侧读成"不带这个字段" —— 老插件、老宿主、未来新档三种偏斜下,
   插件看到的 ctx 永远是它认得的形状(与 `lifetime` 未知值降级同规)。
7. **拆除清态挂在 `setPluginUiSlots` 上**,不另开生命周期钩子:插件
   禁用/卸载 = 投影重推 = 这一条从清单里消失,档(内存 + localStorage)随之
   清掉。装回来是默认的半收,不是"莫名其妙已经收着"。
8. **`localStorage` 的可用性判据卡在方法上而不是全局上**:Node 22 起
   `globalThis.localStorage` 恒存在(未开 `--localstorage-file` 时方法全是
   undefined),只看 `typeof` 会把空壳当成能用的存储,真机之外的每个测试
   环境都会当场 TypeError。
9. **样本插件 plan-status 1.2.0**:`composer.above` 那条声明 `"drawer": true`,
   render 按 `ctx.drawerState` 返回两档树 —— peek 是原来的单行摘要(**老形态
   一字不变**),expanded 是 stack(状态行 + 最近 6 步 + "还有更早 N 步")。
   tarball 已构建,**未安装**(真机走查时用户自行安装)。

**F2(todo-plan 整合)按用户指示搁置。** 抽屉展开档一度要接宿主的 todo-plan
子系统(把真正的计划树画进来)。用户拍板:**先重整 todo-plan 子系统的命名与
语义**,再谈谁来消费它 —— 在那之前抽屉的数据源只有流事件
(`stream:*` / `step:updated`),插件里也登记了这条决定(plugin-entry 文件头)。
待 todo-plan 重整落地后另立一期。

### 6.6 H3 落地实录(2026-08-10)与规格差异

**H3 = 插件皮肤包**:token 表达不了的"形",以枚举档位开放。设计与分工见
表达力文档 §3.3.6。这里只记落地清单、与原规格的差异,以及一条挖出来的旧缺陷。

#### 落地清单(五处代码 + 两处文档,与 L2 逐层对位)

| 层 | L2(B 期) | H3 |
| --- | --- | --- |
| core 判据 | `theme-contribution.ts` 颜色白名单 | `theme-contribution.ts` 只加一个 `PLUGIN_SKIN_MAX_ENTRIES`(**不需要值白名单**) |
| core 形状闸 | `loader.ts` overrides 形状 | `loader.ts` skin 形状(对象 / 值是字符串 / ≤16 条) |
| 产品层裁决 | `plugins/theme-overrides.ts` | `plugins/skin.ts`(旋钮白名单 = `SKIN_TIER_VALUES` 本身) |
| 值表 | `themes/css-mapper.ts` `CSS_VAR_MAP` | `themes/skin.ts` `SKIN_TIER_VALUES` / `SKIN_VAR_MAP` |
| 装配接线 | `app/plugins/theme-overrides.ts` | `app/plugins/skin.ts` |
| 宿主注入 | `ipc/themes.ts` → `applyTheme(…, tokenOverrides)` | 同一处 → `applyTheme(…, tokenOverrides, skinTiers)` |
| 目录投影 | `plugin-list.ts` `contributes.theme` | `plugin-list.ts` `contributes.skin` |
| 设置页 | `themeOverrideNote` | `skinNote`(卡片四态 + 装前确认页) |

#### 第一批旋钮:只有一个

| 旋钮 | 档位 → 值 | 作用面 |
| --- | --- | --- |
| `bubbleRadius` | `sharp`→`0` / `standard`→**`null`** / `soft`→`10px` / `round`→`18px` | `.bubble.user`(MessageBubble.vue)、`.message.is-room-agent :deep(.bubble.assistant)`(MessageItem.vue) |

**与规格的差异 ①:作用面比预期窄一处。** 原定"用户气泡 + 助手消息容器"。现状盘点
发现普通 `.bubble.assistant` **不是气泡** —— `padding: 0`、无边框、背景透明
(源码注释:"AI messages: remove bubble styling"),圆角在它身上不圆任何东西。
真正吃这个旋钮的第二处是**群聊里的 agent 框**(`.is-room-agent`),它的注释
本来就写着"read straight off `.bubble.user`"。作用面因此是 2 处而不是 2 类,
并由 `skin-bubble-radius.test.ts` 逐条钉死(含"assistant 不在作用面"这条反向断言)。

**顺带发现**:`.bubble` 基类上的 `border-radius: 18px` 是**死值** —— role 只可能是
`user` / `assistant`,两个变体都把它覆盖掉了。没有动它(不属于本期),但
`round` 档取 `18px` 正是让这个"曾经的气泡形"重新可达。

**差异 ②:缺省档不写变量。** `standard` 的值是 `null` 而不是 `4px`。现状值
(`var(--radius-xs, 4px)`)只存在于组件 CSS 的兜底里那一份,`SKIN_TIER_VALUES`
里禁止出现它的副本 —— 于是"现状不许出现第二份"从一条纪律变成一条**测试**
(`standard tier is the app baseline`,含"任何一档都不许写 `--radius-xs`")。

#### 差异 ③:`codeTheme` 旋钮**没有做**,并且不应该做

原定第二组旋钮是"代码块高亮主题档位,枚举现有资产"。盘完之后这条路是断的:

1. **没有资产可枚举。** 仓里 shiki 的用法是 `createCssVariablesTheme`
   (`diff-theme.ts`),即**刻意删掉**了 bundled 主题 —— 文件头写得很清楚:
   github-dark/light 是"a second source of colour truth",不跟着 base46 主题走。
   开一个 `codeTheme` 档位 = 把刚被删掉的第二套真相请回来。
2. **它是颜色,颜色不进 H3。** 三条渲染路(hljs → `--hljs-*` / StreamingCodeBlock
   → `--syntax-*` / diff → `--hg-syntax-*`)的颜色**全都已经是主题 token**:
   `CSS_VAR_MAP` 里有 `syntax.*` 11 条、`text.code.*` 12 条。按 §3.3.6 的分工,
   它属于 `overrides`。

**但是**——照着"确认两条渲染路都吃到"去验的时候,挖出一条既有缺陷:

> **`syntax.*` / `text.code.*` 是 L2 的死键。** 实测(`applyTheme('flexoki','dark',
> undefined, {'syntax.keyword':'#ff00ff'})`)产出与不给覆盖时**逐字节相同** ——
> 一个变量都没变。`text.code.keyword` 同样。

根因:代码色变量由 `generateCSSVariables` 从 **`resolvedHighlights`** 发出,而
插件覆盖写进的是 **`resolvedColors`**;`resolveThemeHighlights` 不读这些键,随后
高亮层把同名变量原样盖回去。后果是**静默说谎**:插件声明合法、设置页显示
`active`、屏幕上什么都没变 —— 比报错难查得多。

**H3 期内没有修**,因为修它要先拍两个板,都不属于 H3:

1. `syntax.*` 与 `text.code.*` 映射到同一批变量,**谁是正主**?
2. 插件给的颜色要不要继续过 `ensureHighlightContrast`(它会为了对比度改写颜色,
   也就是"插件说的不算")?

#### 已修(2026-08-10):两个板都拍了

**裁决 ①:权威族是 `syntax.*`,`text.code.*` 是它的合法别名。**
理由是"哪一族有解析结构":`syntax.*` **就是** `SemanticHighlightToken` 本身 ——
与 `resolveThemeHighlights` 的原生输出、与它发出的 `--hg-syntax-*` 变量一一对应,
21 条全员在册。`text.code.*` 没有对应的解析结构,它只是同一批变量在
`CSS_VAR_MAP` 里的另一条路(12 个键指向其中 11 个 token,`inline` / `block`
双双指 `syntax.plain` —— 高亮层只有一个"正文码色")。两族写同一批变量,
正主只能是有结构的那一族。别名**仍然合法**,覆盖解析期归一到权威键,
目录投影带 `canonicalToken`,设置页可以照直说 "alias of syntax.…"。

**裁决 ②:插件代码色照过 `ensureHighlightContrast`。** 覆盖进的是高亮解析的
**输入层**(在护栏之前),对比度护栏等派生照常重跑 —— 476b653d 判例:覆盖先于派生。
护栏改写了插件给的值不是错误(实测 `#ff00ff` → `#F661F0`),主题自己写的
代码色走的是同一道护栏,覆盖没有豁免权,因此也不需要投影告警。

**根因其实有两半,原记录只写了后一半:**

| 半 | 症状 | 修法 |
| --- | --- | --- |
| 死在门口 | `syntax.*` **根本不在 `CSS_VAR_MAP` 里**(它在 `HIGHLIGHT_LEGACY_FG_VAR_MAP`),白名单只认 `CSS_VAR_MAP` → 权威族被 `sanitizeThemeTokenOverrides` 整族筛掉 | 白名单改成 `isThemeTokenOverridable` = `CSS_VAR_MAP` ∪ 代码色权威族 |
| 死在出口 | `text.code.*` 进得来,但只写进 `resolvedColors`,高亮层随后把同名变量原样盖回去 | `pickHighlightTokenOverrides` 挑出代码色并归一,作为**参数**进 `resolveThemeHighlights`,落在 `ensureHighlightContrast` 之前 |

落点(5 个文件):

| 层 | 文件 | 改动 |
| --- | --- | --- |
| 值表 / 归一表 | `themes/css-mapper.ts` | 新增 `HIGHLIGHT_TOKEN_ALIASES` + `canonicalHighlightToken` / `isHighlightAliasToken` / `isThemeTokenOverridable` / `themeTokenCssVariables` / `pickHighlightTokenOverrides` |
| 解析输入层 | `themes/resolver.ts` | `resolveThemeHighlights` 收第 5 个参数 `highlightOverrides`,在护栏**之前**落位 |
| 合成点 | `themes/index.ts` | `sanitizeThemeTokenOverrides` 改用新白名单;`applyThemeInternal` 把挑出来的代码色递给 `resolveThemeHighlights` |
| 裁决层 | `plugins/theme-overrides.ts` | 冲突按**权威键**比;别名先写权威后写(同插件两族撞车 → 权威胜);条目新增 `canonicalToken` / `shadowedByToken`;CSS 变量展开改走 `themeTokenCssVariables` |
| 测试 | `themes/__tests__/code-color-overrides.test.ts`(新)+ `app/plugins/__tests__/theme-overrides.test.ts` §9 | 见下 |

零回归的证明方式:修复前后各把**全部内置主题 × 双模式**的 `applyTheme` 产出
dump 成 JSON(1,021,201 字节)逐字节比对 —— 完全相同。不给覆盖时这条路一个
分支都不会走。

新增测试(9 + 5 条):变量真的变了(`--hg-syntax-*-fg` / `--text-code-*` /
`--hljs-*` / `--syntax-*` 四组名字逐条点名,聊天代码块与 diff UI 两条渲染路
共用的名字都覆盖到)、11 条可覆盖 token 逐条能动、护栏确实重跑(与码块底色
同色的覆盖被修掉、鲜色也被重算)、别名族产出与权威族**逐字节相同**、
`inline`/`block` 都归 `syntax.plain`、两族撞车权威胜(与书写顺序无关)、
跨插件冲突按权威键比、宿主链路(插件清单 → 裁决 → applyTheme)走通且停用即撤除。

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
