# 插件 UI 锚点系统设计(2026-08)

> 承接 [`plugin-ui-anchors-audit-2026-08.md`](./plugin-ui-anchors-audit-2026-08.md)
> 的接入点盘点。本文给出**锚点系统**的完整设计:锚点清单、manifest/api/渲染
> 三件套、数据流、协议扩展、隔离与熔断继承。
> 表达力分层(描述树 v2 / webview)见
> [`plugin-ui-expression-layers-2026-08.md`](./plugin-ui-expression-layers-2026-08.md);
> 落地排期见 [`plugin-ui-rollout-2026-08.md`](./plugin-ui-rollout-2026-08.md)。

---

## 1. 问题定义

插件系统 R0–R7 收官后,插件 UI 只有**一种存在形态**:独立工作区面板
(manifest `contributes.panels` + `api.registerWorkspacePanel`,R5)。
用户实测反馈暴露的结构性缺口:

> 想在输入框上方自定义一个组件,显示当前执行状态(plan 插件)——**没有位置可去**。
> 改变 inputbox 样式、接管输入状态 UI、动画完全自定义 —— **没有表达路径**。

两个问题必须分开:

1. **注入点稀缺**(结构问题):插件 UI 只能"开一个面板",不能"嵌进宿主 UI
   的固定位置"。→ 本文档解决。
2. **表达力受限**(原语问题):描述树只有 7 节点 + 5 控件,做不了复杂 UI 与
   动画。→ 表达力文档解决。

**锚点系统的目标**:宿主在 UI 中定义一组**具名锚点**(anchor),插件声明
"我要在这个位置放一块 UI"。位置由宿主声明(单一事实源),内容由插件用
**既有描述树协议**表达,交互走**既有请求通道**。三件套全部复用 R2/R5 基建,
不发明新协议、不开新渲染器、不新起超时/熔断体系。

---

## 2. 设计原则(先于一切排期)

1. **锚点清单是宿主编译期常量,插件不能发明锚点**。插件说"我要
   `composer.above`"宿主才知道往哪渲染;插件自造锚点名 = 宿主不知道在哪画。
   (对照:VS Code 的 contribution points 同样是宿主定义集合。)
2. **锚点块 = 描述树**(复用 `PluginPanelNode` 渲染器),与工作区面板
   **同一套协议、同一套校验、同一套通道**。"UI 永不执行插件代码"不因锚点
   而松动 —— 锚点是"渲染位置"的扩展,不是"执行模型"的扩展。
3. **静态存在感走 manifest,行为走 api**(宪法第 3 条):`contributes.uiSlots`
   声明"哪个插件在哪个锚点有一块",`api.registerUiSlot` 只绑
   render/onAction。停用的插件不贡献块;启用但加载失败的插件保留块位并
   显示失败说明(与 R5 §5.5 拍板同构)。
4. **命名空间即契约**:锚点块走 `ui:render:<anchor>:<id>` /
   `ui:action:<anchor>:<id>` 请求通道,`ui:` 是**宿主保留前缀**(与 `panel:`
   同规),插件不得自行注册该前缀下的 handler。
5. **降级与熔断继承,不另起账**:锚点块失败进 `request:<action>` 熔断账,
   严重度走 R7 策略表的 `ui-request` 家族(用户主动触发的失败降级界面,
   不禁用插件)。恢复语义:一次成功即放回。**注意:这不是自动继承 ——
   policy.ts 的分类与 surface 折叠需要显式接线,见 §5 表下注。**

---

## 3. 锚点清单(第一版)

### 3.1 清单与语义

```ts
// packages/core/plugins/ui-anchor.ts(新)
/** 锚点 id 的类型化构造 —— 与 pluginScope 同规:品牌类型,只能由工厂产出。 */
declare const UI_ANCHOR_BRAND: unique symbol
export type UiAnchorId = string & { readonly [UI_ANCHOR_BRAND]: true }

/** 宿主支持的锚点清单 —— 单一事实源。插件不能发明锚点。 */
/** 宿主支持的锚点清单 —— 单一事实源。插件不能发明锚点。
 *  命名约定:`<区域>.<槽位>`,全小写(composer.above / chat.status-bar);
 *  与审计文档的候选清单(composer.dock / sidebar.menu / chat.header …)同规。 */
export const UI_ANCHORS = {
  /** 输入框上方横条(composer-stack 顶部)。单行,最多 3 块。 */
  composerAbove: anchor('composer.above'),
  /** 聊天面底部状态条(ChatPanel 内,MessageList 之下)。横向,每块 icon+短文本。 */
  statusBar: anchor('chat.status-bar'),
} as const

/** 每个锚点的容量语义。 */
export const UI_ANCHOR_CAPACITY: Record<UiAnchorId, UiAnchorCapacity> = {
  'composer.above': { maxBlocks: 3, maxHeight: 32, rootHint: 'row' },
  'chat.status-bar': { maxBlocks: 8, maxHeight: 24, rootHint: 'row' },
}

export interface UiAnchorCapacity {
  /** 该锚点最多容纳几个插件块(跨插件按全局规范顺序截断,插件内按 manifest 声明顺序)。 */
  maxBlocks: number
  /** 单块最大高度(px)。宿主用它做溢出裁剪与滚动。 */
  maxHeight: number
  /** 推荐的描述树根节点形态(提示,不强制)。 */
  rootHint?: 'row' | 'stack' | 'any'
}
```

### 3.2 为什么第一版只开两个锚点

- **composer.above**:用户明确需求(plan 执行状态条),挂点结构清晰
  (composer-stack 顶部),渲染与数据流全部现成。
- **chat.status-bar**:全局状态诉求明确,且 `ChatPanel` 内已有
  `BackgroundJobsStatusBar` / `GoalStatusBar` 先例 —— 挂点位置与视觉语义
  已经过产品验证,只需新起一个容器。

B 档锚点(composer.dock / sidebar.menu badge / chat.header)在审计文档中
逐项论证过:要么与 A 档视觉重叠(composer.dock),要么语义存疑(chat.header),
要么需要扩展既有组件形状(sidebar.menu badge)。**一次只开一个,是 R7 收官
时定下的纪律**;锚点系统同样遵守 —— 先开两个,跑通契约,再按需扩展。

### 3.3 扩展锚点的代价(写进代码注释)

新增一个锚点要动**四处**:`UI_ANCHORS` 常量、`UI_ANCHOR_CAPACITY` 表、
renderer 侧挂点组件、拆除快照测试。锚点清单的测试守卫:
`UI_ANCHOR_CAPACITY` 的键集合与 `UI_ANCHORS` 的产出集合必须相等
(类型层面:Record 索引 + 一条运行时断言)。

---

## 4. 协议扩展

### 4.1 manifest(静态存在感)

```jsonc
// plugin.json
{
  "name": "plan-status",
  "contributes": {
    "uiSlots": [
      { "anchor": "composer.above", "id": "plan-status", "label": "Plan 状态" },
      { "anchor": "chat.status-bar", "id": "jobs", "label": "任务" }
    ]
  }
}
```

`PluginContributionUiSlot`(新类型,进 `core/plugins/types.ts`):

```ts
export interface PluginContributionUiSlot {
  /**
   * 必须是宿主锚点清单中的一员。
   *
   * **未知锚点不拒绝加载**:丢弃该条 contribution,清单投影标记 `unsupported`
   * (设置页可见),插件其余能力照常 —— 多宿主与版本偏斜下"宿主不认识这个锚点"
   * 不是代码错误,不该吃 registration 熔断(阈值 1 = 直接禁用整个插件)。
   * (对照:VS Code 对未知 contribution point 同样是忽略 + 警告。)
   */
  anchor: string
  /** 块 id —— 同一插件内唯一;与 manifest 声明一致才能注册行为。 */
  id: string
  label: string
}
```

`PluginContributes` 增加 `uiSlots?: PluginContributionUiSlot[]`。
**命名说明**:不叫 `contributes.ui` —— `contributes.settings.ui`(设置项 UI hint,
R3 已存在)已经占了这个词的另一种含义;`uiSlots` 与请求通道的 `ui:` 前缀、
renderer 的 `UiSlot*` 组件保持同一词根,一处改名全链可读。

### 4.2 api(行为绑定)

```ts
// 进 CorePluginAPI(泛型参数 TUiSlot 占位,与 TPanelRegistration 同规)
api.registerUiSlot({
  anchor: 'composer.above',          // 必须与 manifest contributes.uiSlots 匹配
  id: 'plan-status',                 // 同上
  render(ctx): PluginPanelTree | Promise<PluginPanelTree>,
  onAction?(input: { actionId: string; payload?: unknown }, ctx): PluginPanelActionResult | void | Promise<...>,
})
```

**render/onAction 的 ctx** 在面板 ctx(requestId / abortSignal / refresh)之上
增加两个字段,**v1 就带上**:

- `anchor: string` —— 插件知道自己在哪个锚点,返回"单行友好"或"整页友好"的树;
- `sessionId: string | null` —— 该块当前所属的会话。宿主在**会话切换时对本锚点
  全部块重拉 render**;返回不依赖 sessionId 的树即天然"全局块"。
  (没有它,"plan 插件显示当前会话执行状态"在多窗口/多会话下必然显示错误会话
  的状态 —— 这是验收判据 1 的硬性依赖,不能推迟到二期再改协议。)

落地位置:`api-builder.ts` 的 `registerUiSlot`,与 `registerWorkspacePanel`
同构 —— 校验声明匹配 → 拒绝未声明 id(计 `registration` 熔断)→ 拒绝重复
注册 → 把 render/onAction 挂到请求通道的 `ui:render:<anchor>:<id>` /
`ui:action:<anchor>:<id>`。

**为什么复用 `PluginPanelTree` 而不是新定义块协议**:块是"小面板"。
同一棵树,宿主在 MediaPanel 里画成整页,在 composer.above 里画成单行
(按锚点容量裁剪)。**协议不因位置而分叉** —— 校验器、渲染器、action
结果处理三处复用,插件学一次 API 两处能用。

### 4.3 渲染(宿主侧)

```vue
<!-- InputBox.vue:composer-stack 顶部,composer-dock 之前 -->
<UiSlotHost anchor="composer.above" :max-height="32" />

<!-- ChatPanel.vue:MessageList 之下、BackgroundJobsStatusBar 之旁 -->
<UiSlotHost anchor="chat.status-bar" :max-height="24" />
```

`UiSlotHost`(新组件,`packages/renderer/components/plugins/UiSlotHost.vue`):

1. 从注册表(`ui-anchor-registry.ts`,renderer 侧新模块)取"该锚点上的
   插件块清单"—— 数据来自 IPC 插件清单投影(与 `setPluginWorkspacePanels`
   同一条刷新路径,`onething:plugins-changed` 事件驱动)。
2. 每块一个 `<UiSlotBlock>`:内部复用 `PluginPanelHost` 的渲染逻辑
   (loading / error / degraded / tree 四态,latest-wins render token,
   trailing debounce + 合流)—— **把 PluginPanelHost 拆出可复用内核**,
   或直接参数化复用它(它现在只吃 `PluginWorkspacePanel`,需要泛化成
   "一个可寻址的插件 UI 块"的通用描述)。
3. 排列顺序:**跨插件按全局规范顺序,同一插件内按 manifest 声明顺序**。
   全局规范顺序只有**一个出处**:插件启用时间 `enabledAt`,平局按 pluginId
   字典序 —— 由 manager 的清单投影产出时就排好,renderer 不再二次发明
   (截断、主题覆盖冲突的"后者胜"也引用同一顺序,见表达力文档 §3.2)。
   超过 `maxBlocks` 截断(截断要可见:设置页插件详情里显示"该锚点已满")。
4. **加载失败的块不计入 `maxBlocks`**:块位保留并显示失败说明,但失败块只
   折叠为一个聚合指示(点开见详情)—— 否则 3 个加载失败的插件能永久占满
   composer.above 的 3 个槽,健康插件永远上不来。
5. `maxHeight` 裁剪:块内容溢出时滚动(composer.above 场景块内滚动)。
6. **多实例去重**:composer.above 挂在主窗聊天面 + 浮层侧栏聊天面,是两个
   UiSlotHost 实例;同一次 panel-refresh 触发的 render 结果按
   `(pluginId, anchor, id)` 复用,不重复打请求通道(200ms 合流在 emit 侧,
   render 侧的去重是这里的职责)。

### 4.4 数据流(完整链路)

```
[main] 插件订阅 step:updated(EventBus 会话面)
   → 状态变化 → api 内部调 refresh() → emitPanelRefresh(pluginId, anchor+id)
   → 通知通道 plugin:notification { kind: 'panel-refresh', panelId: 'ui:composer.above:plan-status' }
   → IPCBridge 多窗口广播 → renderer 收到
   → UiSlotHost 对该块重拉 ui:render:composer.above:plan-status
   → 请求通道(30s 预算 / abort / progress / 熔断账)
   → 插件 render() → 描述树 → 通道形状校验(describePluginPanelResultProblem 扩展 ui: 前缀)
   → UiSlotBlock 渲染描述树
[用户] 点块内按钮 → emit action → platformApi.pluginRequest(ui:action:composer.above:plan-status)
   → 请求通道 → 插件 onAction() → { refresh: true } → 重拉 render
[会话] ChatPanel 切换会话 → UiSlotHost 对本锚点全部块重拉 render
   → render ctx 的 sessionId 随之变化(返回不依赖 sessionId 的树即全局块)
```

**通道守卫扩展**(`core/plugins/panel.ts` 的
`describePluginPanelResultProblem`):把 `ui:` 前缀的 render/action 结果
纳入同一套树校验 —— 守卫钉在通道层,不是注册包装层(与 panel 同规)。

---

## 5. 隔离与故障

| 故障 | 处置 | 依据 |
| --- | --- | --- |
| render 超时(30s) | 块显示错误态 + Retry,不计插件级熔断 | R7 策略表 `ui-request` 家族:用户主动触发的失败降级界面 |
| 连败达阈(3) | 该块降级(degraded),插件其他能力照常;重试带 bypassDegraded | R7 `PLUGIN_SEVERITY_TABLE` |
| 描述树校验失败 | 块显示"插件返回了非法内容",不渲染 | 通道级守卫(§4.4) |
| 插件被禁用/卸载 | 块消失(清单投影按 enabled 过滤);卸载时该插件全部在飞请求 abort | R4 abortForPlugin |
| 插件加载失败 | 块位保留,显示"该插件加载失败";失败块**不计入 maxBlocks**(折叠聚合指示) | R5 §5.5 拍板同构 + §4.3.4 |
| 未知锚点(前向兼容) | 丢弃该条 contribution,清单投影标记 `unsupported`(设置页可见);插件其余能力照常,**不计 registration 熔断** | §4.1:版本偏斜下"宿主不认识"不是代码错误 |
| 锚点已满 | 超出块不渲染,设置页显示"锚点已满" | §4.3.3 |

> **上表的熔断语义依赖 policy.ts 的显式接线,不是自动继承**:
> `classifyPluginScope` 目前只把 `request:panel:render:/invoke:` 归入
> `ui-request` 家族;`request:ui:*` 会落进通配 `request:` → `plugin-request`
> 家族 —— remedy 碰巧相同,但 `describePluginSurface` 只折叠 `panel:`,
> 同一锚点块的 render/action 会被当成**两个独立 surface** 分别降级,
> 出现 policy.ts 自己警告的"画得出来但点不动"。落地时必须:①
> `classifyPluginScope` 在通配 `request:` **之前**识别 `request:ui:render:` /
> `request:ui:action:`;② `describePluginSurface` 把同块的 render/action 折叠为
> `ui:<anchor>:<id>` 单 surface(该函数在热路径上,沿用预编译 RegExp 的
> 模块级常量模式)。清单与验收见 rollout 文档 §2。

**`ui:` 命名空间保留**(api-builder 的 `registerRequestHandler` 拒绝
`ui:` 前缀 —— 与 `panel:` 同一条检查,扩展前缀集合)。

---

## 6. 与 R5 工作区面板的关系

| 维度 | 工作区面板(R5) | 锚点块(本设计) |
| --- | --- | --- |
| 形态 | 独立页面(MediaPanel 内) | 嵌入式块(宿主 UI 固定位置) |
| 入口 | ⋯ 菜单 + 面板导航条 | 无独立入口,位置即入口 |
| 渲染 | PluginPanelNode(整页) | PluginPanelNode(按容量裁剪) |
| 通道 | panel:render / panel:action | ui:render / ui:action |
| 状态推送 | panel-refresh 通知 | 同一条通知轨(panelId 带 ui: 前缀) |
| 停用 | 入口消失 | 块消失 |
| 加载失败 | 入口保留 + 失败说明 | 块位保留 + 失败说明 |

**两者共享**:描述树协议、校验器、渲染器、请求通道、熔断账、清单投影刷新
路径。实现上把 PluginPanelHost 的"一个可寻址 UI 块"内核抽出来,面板与
锚点块各包一层壳 —— 而不是复制一份渲染逻辑。

---

## 7. 未决问题与拍板

| 问题 | 倾向 | 状态 |
| --- | --- | --- |
| 锚点块是否支持 `refreshIntervalMs`(宿主轮询重拉) | 支持 —— 插件不必自己写 timer;频率上限 1Hz,且只在块可见时轮询 | **已拍板**(随描述树 v2 落地,rollout §3) |
| 块级 `visible-when` 条件渲染 | 二期 —— 第一版插件自己决定 render 返回空树(`empty-state`) | 待拍板 |
| web 端锚点块显示什么 | "仅桌面可用"态(方案 A 降级面),与面板一致 | 已拍板(方案 A) |
| 锚点块是否需要 session 作用域(不同会话显示不同块) | render ctx 携带 `sessionId: string | null`,v1 就带;宿主在会话切换时重拉;"全局块" = 返回不依赖 sessionId 的树,协议层不做全局/会话之分 | **已拍板**(§4.2) |
| chat.status-bar 是否并入既有 BackgroundJobsStatusBar | **不并入** —— 既有状态栏有专属交互逻辑,降级到描述树损失 UX | 已拍板(§2 审计) |

---

## 8. 验收判据

1. **plan-status demo 插件**(sample-plugins/):composer.above 锚点块显示
   当前流式执行状态(空闲 / 流式中 / 步骤 n/m / 完成),数据来自 main 进程
   事件订阅,宿主零改动。
2. **拆除快照测试**:内置插件贡献的锚点块,禁用/卸载后 renderer 注册表
   与 DOM 均无残留(与 R5 拆除测试同构)。
3. **协议测试**:未知锚点名(降级为 unsupported,不计熔断)、未声明 id、
   重复注册、`ui:` 前缀抢占 —— 后三类违规全部被拒且计熔断。
4. **熔断分类与 surface 折叠**:`request:ui:*` 归入 `ui-request` 家族;
   同块 render 连败降级后 action 被短路;一次 render 成功整块恢复。
5. **顺序确定性**:同一插件集合两次加载,锚点块排列与截断结果逐字节一致
   (全局规范顺序由清单投影唯一产出)。
6. **前向兼容**:声明未知锚点的插件照常加载,该 contribution 标记
   `unsupported`,不计 registration 熔断。
7. **既有面板零回归**:PluginPanelHost 重构为共享内核后,工作区面板
   全部既有测试绿。
8. **typecheck / lint / vitest 全绿**;boundary 守卫无新增越界。

---

## 9. 锚点分类学 v2(2026-08-09)

> 起因:A/B/C 三期落地后,真机使用暴露出第一版设计的结构性缺口 ——
> 已开的三个锚点**全是"常显块"**,而真实诉求(消息 ⋯ 菜单里按需看 token
> 明细、输入框工具条上的插件按钮)属于另一个物种:**触发式**。第一版没有
> 分类学,每个锚点靠散文各自描述,再开新锚点就会继续散文下去。本节把锚点
> 钉在五根正交的轴上,给出全量地址地图与治理规则 —— 以后开锚点是查表填格,
> 不是重新发明。

### 9.1 五根轴(每个锚点 = 五个轴上各取一个值)

| 轴 | 取值 | 含义 |
| --- | --- | --- |
| **address** | `<region>.<slot>`(全小写) | 在宿主 UI 的哪个位置。编译期常量,插件不能发明。 |
| **kind** | `block` \| `trigger` | **常显块**(内容始终渲染在位)/ **触发式**(平时只有宿主画的入口 —— 菜单项或图标钮,由 address 决定形态;点击才按需渲染内容弹层)。 |
| **cardinality** | `singleton` \| `per-item` | 每窗口一个实例,还是按宿主条目繁殖(如按消息一个)。**per-item 是成本乘数**:N 条消息 = N 个实例。 |
| **context** | `global` \| `session` \| `message` | render ctx 携带什么坐标(`sessionId` / `+messageId`)。协议上是"ctx 带什么",不是块的属性 —— 全局块 = 忽略 ctx 的块。 |
| **expression** | `tree` \| `tree+webview` | 内容用什么表达。**webview 只允许出现在 `singleton` 的 `block`**(今天 = 仅工作区面板);per-item 永不 webview(iframe 按条目繁殖 = 性能自杀,消息列表未虚拟化是宿主事实);trigger 的**入口**永远是宿主原语(label/icon),webview 与否说的是弹层内容(v1 一律 tree)。 |

kind 只有两个值 —— "菜单项"和"工具条按钮"不是两种 kind,是 trigger 在
不同 address 上的宿主呈现:菜单里的 trigger 画成菜单项,工具条上的 trigger
画成图标钮。呈现权在宿主,这正是宪法第 1 条在入口上的体现。

### 9.2 全量地址地图(单一事实源;审计文档 §2 的候选全部收编)

| address | kind | cardinality | context | expression | 容量 | 状态 |
| --- | --- | --- | --- | --- | --- | --- |
| `composer.above` | block | singleton | session | tree | 3 块 / 32px | ✅ 已开(R5.x) |
| `chat.status-bar` | block | singleton | session | tree | 8 块 / 24px | ✅ 已开(R5.x) |
| `message.footer` | block | **per-item** | message | tree | 6 块 / 24px | ✅ 已开(消息态一期) |
| `message.actions` | **trigger** | per-item(入口) | message | 入口=宿主原语;弹层=tree | 3 项,超出折叠 | ✅ 已开(D 期) |
| `composer.actions` | **trigger** | singleton | session | 同上 | 3 项,超出折叠 | ✅ 已开(D 期) |
| `chat.header` | trigger | singleton | session | 同上 | — | 候选,不排期(价值待证) |
| `sidebar.menu` | — | — | — | — | — | 已由面板导航收编(72c983d0),不是锚点 |
| `composer.dock` | — | — | — | — | — | 不开:与 composer.above 同位,语义属草稿上下文 |
| `workbench.tab` | — | — | — | — | — | 不开:tab 类型是编译期联合(审计 B-4) |
| `markdown.block` | — | — | — | — | — | **永不**:插件残留进消息历史(审计红线) |
| `settings.tab` | — | — | — | — | — | **永不**:插件配置已有归口 |
| `sidebar.rail` | — | — | — | — | — | **永不**:纯图标导航,语义固定(审计红线) |

(工作区面板不在此表 —— 它不是锚点,是独立 surface,tree+webview 都开。)

**per-item 的铁律**:per-item 锚点的常显形态(block)必须极小且同步渲染
(message.footer 的 24px 树);任何"重"的内容(表格、明细、webview)在
per-item 位置只能以 **trigger** 形态存在 —— 入口按条目繁殖没问题(一行
菜单文案),内容按需只渲染一份。tps-meter 的"footer 常显徽标 vs ⋯ 菜单
按需明细"之争,本质就是这条铁律的两侧。

### 9.3 trigger 的协议(D 期的设计核心)

1. **声明**:与 block 同一张 `contributes.uiSlots` 表 —— kind 由锚点表
   决定,不是插件声明的(插件说"我要进 message.actions",宿主知道那是
   trigger 位)。条目形状不变:`{ anchor, id, label }`;label 就是入口文案。
2. **入口是宿主画的**:菜单项/图标钮由宿主用自己的组件渲染 label(与内置
   项同一套菜单/按钮组件),插件零参与。v1 入口是静态的(manifest label);
   动态徽标(如"执行中"亮点)登记为演化格 D.2,需要时给入口加一条轻量
   badge 通道,不动协议骨架。
3. **弹层**:点击 → 宿主弹层壳(遵守 ui-system 浮层决策树,与既有浮层同
   一套 z-index/退出语义)→ 走**既有** `ui:render:<anchor>:<id>` 通道拉树
   → PluginPanelNode 渲染。ctx 带 `anchor + sessionId (+ messageId)`。
   关弹层即销毁,无常驻实例。onAction 照旧走 `ui:action:*`。
4. **降级/熔断**:与 block 完全同规 —— surface 仍折叠为 `ui:<anchor>:<id>`,
   render 连败 → 该入口置灰(不是消失:用户该知道"这里有个坏了的插件项"),
   点击显示降级态。失败入口不占容量。
5. **协议零新增**:没有新通道、没有新守卫、没有新熔断家族 —— trigger 是
   既有协议在"按需"时序上的重放。新增的只有 renderer 侧两个挂点 + 一个
   弹层壳。

### 9.4 治理(append-only 的具体含义)

- **开新锚点 = 在 9.2 表里加一行 + 五处代码**:`UI_ANCHOR_CAPACITY` /
  `UI_ANCHORS` / renderer 挂点组件 / 拆除快照测试 / 本表。缺一处 typecheck
  或运行时断言变红(ui-anchor.ts 的一致性守卫)。
- **锚点只加不删不改语义**:已发布锚点的 address/kind/context 永不变更;
  容量数字可放宽不可收紧(收紧会截断既有插件)。真要退役:锚点进
  `unsupported` 降级路径(插件照常加载,块不渲染),与未知锚点同一条路 ——
  这就是 append-only 在锚点上的兑现方式。
- **红线复述**(与审计 §3 一致,放这里防散失):消息正文内嵌、替换
  InputBox/MessageList 本体、全局 CSS、sidebar.rail、settings 独立 tab。

### 9.5 D 期排期概要(**已落地 2026-08-09**;实录与差异见 rollout §6.4)

- **D1**:锚点表加 `message.actions` / `composer.actions`(kind: trigger)
  + core 校验(trigger 锚点同样拒绝 webview)。
- **D2**:renderer 弹层壳(复用 PluginPanelNode + 四态壳)+ 两个挂点
  (MessageItem ⋯ 菜单、InputBox 工具条)。
- **D3**:tps-meter 1.0.3 —— footer 常显徽标保留(轻),新增
  message.actions 入口 "Token usage" → 弹层明细(重);两者取舍交给用户
  (settings 里可各自关)。plan-status 1.1.0 加 composer.actions 入口示范。
- **D4**:拆除快照 + 入口置灰降级测试 + 真机走查。
