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
| C 期 | L3 webview 逃生舱(**不含 ext host**) | R1 软隔离 ✓ + B 期 ✓ | 排队 |
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
| 宿主合成 | `apps/electron/src/main/ipc/themes.ts` 的 `applyTheme` 响应侧 |
| 重推 | `packages/renderer/stores/themes.ts` 监听 `onething:plugins-changed` |

`packages/onething-runtime/src/themes/*` 与 renderer 的 `applyThemeVariables`
**一行未改** —— 覆盖是叠在主题产出之上的一层,不是主题系统的功能。

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
