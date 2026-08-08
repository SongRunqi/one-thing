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

## 6. 二期与 H 线的衔接(不在本期)

| 期 | 内容 | 前置 | 触发条件 |
| --- | --- | --- | --- |
| 二期 | L2 主题 token 覆盖(contributes.theme)+ 受限动画原语 | R5.x 全量落地 | 出现真实品牌化/动效需求 |
| H 线 | L3 webview 逃生舱 + backend 子进程 ext host | R5.x + R0–R7 全量;宪法第 1、2 条持续生效 | 第三方生态或"必须 webview 才能表达的插件"真实需求 |

**H 线 webview 的配方已冻结**(表达力文档 §4):独立 origin 自定义协议 +
CSP + postMessage-only + ui.\* token 注入 + 复用请求通道。届时锚点块与
面板统一支持 `view: 'descriptor' | 'webview'`,协议层(描述树/通道)不动。

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
