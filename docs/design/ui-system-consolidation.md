# UI 系统收敛方案 — 浮层原语、交互规则与执法棘轮

日期:2026-08-04
状态:方案(未实施)
底账来源:两路全量盘点(浮层/弹出类组件 × 交互样式/token),数字均为 2026-08-04 实测。

---

## 0. 一句话诊断

**不是没有基建,是没有规则和执法。** 通用组件(Tooltip/Select/ContextMenu/Switch)和 token 体系(878 个变量、9 档 z-index)早已存在,但:

- 组件采纳率个位数:`Tooltip` 7 个文件在用,原生 `title=` 却有 **467 处/127 文件**;`Select.vue`(1353 行、功能完备)只有 3 个使用者,原生 `<select>` 在 **21 个文件**里是事实标准;`Switch` 三套并存(common 组件 1 个使用者 + 全局 CSS 类 + 30 个文件自绘)。
- 浮层机制零收口:`<Teleport to="body">` 27 处/23 文件,9 个文件各自 `getBoundingClientRect()` + 手拼 `top/left:${x}px`;**16 个对话框**各自实现 Teleport+遮罩+键盘处理,其中 6 个把层级错用成 `--z-toast`;13 处原生 `confirm()/alert()`。
- token 与事实脱节:`--duration-fast: 0.15s` 但代码事实标准是 **0.12s(209 处)**;`--radius-sm: 8px` 但最常用圆角是 **6px(61 处)**;`--space-*` 全库仅 7 处引用;transition 走 token 的约 5%。
- 双轨并行无终止线:`--ui-state-hover-bg`(50 次)与 legacy `--hover`(46 次)几乎 1:1,`css-mapper.ts` 的 `UI_LEGACY_VAR_MAP` 持续双写。
- z-index 变量被 15+ 处硬编码绕过(10000/1200/1000/999/998/960/900/650/499…),且大量 `var(--z-dropdown, 1000)` 式 **fallback 与真值(100)不符**——变量一旦调整,层叠顺序当场炸。
- 交互配方各自为政:同是"行 hover",sidebar 用 ink 4.5% color-mix、settings 用 accent 5%、chat 用 `--ui-state-hover-bg`;focus ring 有四种写法;`:focus`(115) 与 `:focus-visible`(150) 混用。

机制性根因(引 `docs/audit/ui-production-gap-audit-2026-07-22.md`):**没有共享构件层 → 模式靠复制粘贴传播 → 微观值漂移**。只补组件不上执法,半年后会烂回原样——boundary checker 的棘轮模式已经证明了什么方式在这个仓库有效。

---

## 1. 目标体系:三层 + 一条执法线

```
┌──────────────────────────────────────────────────────────┐
│ 控件层  Select / Switch / Checkbox / Radio / Input        │  用户可见的表单与选择
├──────────────────────────────────────────────────────────┤
│ 原语层  useFloatingLayer() 定位内核                        │  一切浮层的唯一机制
│         Popover / Dropdown(=ContextMenu) / Dialog /       │
│         Toast / Tooltip(已有)                             │
├──────────────────────────────────────────────────────────┤
│ 规则层  token(校准后) + 交互态配方(hover/selected/focus)   │  数值与状态的唯一出处
│         + z-index 层级表 + 阴影档位                        │
├──────────────────────────────────────────────────────────┤
│ 执法线  docs/design/ui-system.md 规则文档                  │  仿 boundary:gate 的
│         + scripts/ui-style-check.mjs + ui:gate 棘轮        │  只挡新增、可收紧基线
└──────────────────────────────────────────────────────────┘
```

核心原则:

1. **业务组件不再写浮层机制。** 任何"浮在别的东西上面"的 UI 只能通过原语层获得:定位、Teleport、z-index、遮罩、Esc/outside-click、焦点管理全部内置。业务组件只提供内容 slot。
2. **token 记录事实,不记录理想。** 校准阶段按实测众数重排梯度,之后 token 是唯一权威;新代码禁止字面量,由棘轮执法。
3. **只挡新增,存量分期还债。** 一次性全量迁移不现实(467 处 title=、557 处圆角字面量);棘轮保证曲线只降不升,每期消一个类别。
4. **不引第三方 UI 库。** 与仓库现状一致(floating-ui/popper/headlessui 均为 0 依赖,AI SDK 已手写化);定位内核手写,接口按 floating-ui 语义设计(placement/flip/offset/autoUpdate),复杂度失控时可换芯不换接口。

---

## 2. 规则层设计

### 2.1 z-index 层级表(修表 + 收口)

现有 9 档(`packages/renderer/styles/variables.css:167-175`)保留,语义审定如下:

| 变量 | 值 | 允许的东西 |
|---|---|---|
| `--z-base` | 0 | 常规流 |
| `--z-sticky` | 10 | sticky 头、resize 手柄、局部悬浮按钮 |
| `--z-dropdown` | 100 | 锚定浮层:下拉、picker、popover、context menu、flyout |
| `--z-sidebar` | 200 | 浮动侧栏(启用,替 `Sidebar.vue` 的 650/1000) |
| `--z-overlay` | 500 | 全屏遮罩类面板:语音 overlay/通话、搜索结果阅读器(启用,替 900/960/999) |
| `--z-modal` | 600 | 对话框及其遮罩(修正 6 处错用 `--z-toast` 的 dialog) |
| `--z-tooltip` | 700 | tooltip 专用 |
| `--z-toast` | 800 | toast 专用 |
| `--z-max` | 9999 | 图片全屏预览、SelectionToolbar 等确需压一切的 |

规则:

- 业务代码**只允许 `var(--z-*)`,禁止数字字面量**(局部堆叠 ≤5 的除外,如卡片内角标)。
- **禁止给 `--z-*` 写 fallback**(`var(--z-dropdown, 1000)` 这类 fallback 漂移是实测事故源;variables.css 全局加载,fallback 无存在意义)。
- 同档内的相对顺序用 `calc(var(--z-dropdown) + n)`,n ≤ 30。

一次性机械修(P0 内完成,共 ~25 处):10000→`--z-max`、1200/1000/999/998→按语义归档、6 处 dialog 的 `--z-toast`→`--z-modal`、所有带错误 fallback 的 `var(--z-*, n)` 去掉 fallback。

### 2.2 token 向事实校准

| token | 现值 | 校准 | 依据 |
|---|---|---|---|
| `--duration-fast` | 0.15s | **120ms** | 事实标准 0.12s×209 处 vs 0.15s×100 处 |
| `--duration-normal` | 0.2s | 保留 200ms | 0.2s×37 + 0.18s/0.16s 长尾归并 |
| `--duration-slow` | 0.3s | 保留 300ms | |
| `--radius-xs` | 4px | **3px** | 3px×24 处 |
| `--radius-sm` | 8px | **6px** | 6px×61 处是最大众数;`docs/design/browser-ui/_tokens.css` 镜像早已写成 6px |
| `--radius-md` | 12px | **10px** | 10px×20、9px×6 归并 |
| `--radius-lg` | 16px | 保留 | |
| `--radius-full` | 9999px | 保留 | 999px×65、50%×83 迁入 |

注意:改 `--radius-sm/md` 的值会影响现有 ~75 处 var 引用(8px→6px 视觉变化 2px)。执行时先 grep 现有引用逐一过目,视觉敏感处(消息气泡、输入框)在真机走查清单里点名。

阴影收敛为浮层三档 + 既有签名影:

- `--shadow-floating`(锚定浮层:popover/dropdown/menu)
- `--shadow-elevated`(对话框)
- `--shadow-paper`(纸墨签名影,已推广 14 处,不动)
- 浮层组件内**禁止 box-shadow 字面量**;121 种字面值只在存量里逐期消。

### 2.3 交互态配方(唯一出处)

| 态 | 唯一写法 | 说明 |
|---|---|---|
| hover 背景 | `background: var(--ui-state-hover-bg)` | sidebar 的 ink 4.5%、settings 的 accent 5% 等派生配方**下沉到主题层**:`role-mapping.ts` 的 `deriveStateOverlays()` 已有此能力但零消费,让各区域的 `--ui-sidebar-item-hover-bg` 等由它派生,组件端只引用 |
| selected 背景 | `var(--ui-state-selected-bg)`(或区域别名 `--ui-sidebar-item-active-bg` 等,它们已定义为其别名) | 消灭直接拿 `--ui-accent-primary-fg`(17 处)/`--accent`(16 处)当选中底色的写法 |
| focus ring | 全局 utility 类 `.u-focus-ring`(定义于 components.css):`outline: none; box-shadow: 0 0 0 2px var(--ui-surface-app-bg), 0 0 0 4px var(--ui-state-focus-ring)` | 四种现存写法收敛为一;输入框类保留 `--ui-surface-input-focus-ring` 单环变体 `.u-focus-ring-input` |
| focus 伪类 | 一律 `:focus-visible`,禁裸 `:focus`(输入框 caret 场景除外) | 现状 115 处裸 :focus 分期迁 |
| 过渡 | `transition: <prop> var(--duration-fast) var(--ease-default)` | 禁字面时长;`120ms`/`0.12s` 单位混用随迁移消失 |

**fallback 纪律**(新代码即刻生效):

- `--ui-*` 引用**禁止 hex/rgba 字面 fallback**(`var(--ui-state-hover-bg, #f4f2ed)` 在 dark 主题下 token 缺失即爆白,实测已有两处)。
- fallback 链最多一层 legacy 别名:`var(--ui-x, var(--legacy-x))`,不再嵌三四层。
- 双轨终止线:P4 起 `css-mapper.ts` 的 `UI_LEGACY_VAR_MAP` 停止双写 legacy 变量,renderer 内 `--hover`/`--bg-hover`/`--text-muted` 等引用须已清零(棘轮保证)。

### 2.4 规则文档

`docs/design/ui-system.md`(P0 交付),定位是**开发时的查表卡**,不是论文,目标 ≤150 行:

1. "我要做一个 X" → 用哪个组件/composable 的速查表(浮层决策树:提示→Tooltip;锚定面板→Popover;菜单→Dropdown;确认/表单→Dialog;通知→Toast)。
2. 交互态配方表(§2.3 原样)。
3. z-index 层级表(§2.1 原样)。
4. 禁令清单(= ui:gate 检测项,人和棘轮看同一张表)。
5. CLAUDE.md 加一行指向此文档("UI 组件与样式规则见 docs/design/ui-system.md,新代码须过 bun run ui:gate")。

---

## 3. 原语层设计

### 3.1 `useFloatingLayer()` — 唯一定位内核

位置:`packages/renderer/composables/floating/useFloatingLayer.ts`

签名(草案):

```ts
interface FloatingLayerOptions {
  anchor: MaybeRef<HTMLElement | VirtualAnchor | null>  // VirtualAnchor = {x,y}(右键菜单场景)
  placement?: 'top' | 'bottom' | 'left' | 'right' | `${side}-${'start'|'end'}`
  offset?: number
  flip?: boolean            // 越界翻转,默认 true
  clamp?: boolean           // 视口内钳制,默认 true
  autoUpdate?: boolean      // scroll/resize/ResizeObserver 跟踪,默认 true
  zLayer?: 'dropdown' | 'sidebar' | 'overlay' | 'modal' | 'tooltip' | 'toast' | 'max'
  closeOn?: { esc?: boolean; outside?: boolean; scroll?: boolean }
  trapFocus?: boolean       // Dialog 用
  returnFocus?: boolean     // 关闭后焦点还给 anchor
}
function useFloatingLayer(opts): {
  open: Ref<boolean>; show(): void; hide(): void; toggle(): void
  floatingStyle: Ref<CSSProperties>   // position:fixed + top/left + z-index
  layerProps: 事件与 aria 绑定
}
```

实施要点:

- **整合而非重写现有资产**:`common/safe-triangle.ts`(hover 安全三角)和 `common/interactive-tooltip-registry.ts`(垂直列表 hover 接管)作为可选插件挂进来;`Tooltip.vue`/`Select.vue`/`Table.vue` 内部的三套成熟定位逻辑是提炼母本。
- 内核只管**定位与生命周期**,不管样式;`position: fixed` + Teleport to body 是唯一模式(消灭 27 处各自 Teleport)。
- 预估 ~250 行 + 测试。手写理由见 §1 原则 4;接口对齐 floating-ui 语义,留换芯余地。

### 3.2 组件清单

| 组件 | 状态 | 吸收谁 |
|---|---|---|
| `Popover.vue` | **新建**(壳很薄:useFloatingLayer + 浮层表面样式 `--shadow-floating`/`--radius-sm`/`--ui-surface-*`) | ComposerExtensionPanel、AgentSelector flyout、ModelSelector flyout、ProviderModels 能力编辑 popover、SayMessageRow emoji 面板、ThemeSelectorPanel 菜单、PromptReferenceCard、MusicStatusBar 浮层 |
| `Dropdown.vue` | **新建**(Popover 特化:menu 语义、键盘导航、items 数组或 slot) | MessageActions 的 more-menu/branch-menu、FileExplorer 右键菜单、PracticeStrip 菜单、Table 列筛选菜单 |
| `ContextMenu.vue` | **改造合流**:成为 Dropdown 的坐标触发模式(VirtualAnchor) | 干掉 `sidebar/SessionContextMenu.vue` 的平行实现 |
| `Dialog.vue` | **新建**:基于现有 `.dialog-*` CSS 约定(components.css:107-172)组件化;props: title/size/danger;slots: body/actions;内置遮罩、`--z-modal`、Esc、focus trap、returnFocus | 16 个手写对话框 |
| `useConfirm()` | **新建**:promise 风格 `await confirm({ title, danger })`,基于 Dialog | 13 处原生 `confirm()/alert()` |
| `Toast` + `useToast()` | **新建服务**:CSS 已有(components.css:393-425),补渲染宿主 + 队列 | 各页面 v-if 自绘的 .toast |
| `Tooltip.vue` | **保留即标准**,内部改用 useFloatingLayer(行为不变) | 467 处 `title=` 分期迁(仅用户可见的功能性提示;调试残留直接删) |
| `Select/Input/Switch/Slider` | 保留,内部浮层部分接 useFloatingLayer | — |
| `Checkbox.vue` / `Radio.vue` | **新建**(现状为零,24 文件 67 处原生 checkbox) | — |

明确**不新建**的:hover 工具条不做组件(MessageActions 的三个 Teleport 浮层改接 useFloatingLayer 即可,工具条本体是业务布局);Drawer 暂缓(仅 MediaPanel 一处,不够抽象成本)。

---

## 4. 执法线:ui:gate 棘轮

仿 `boundary:gate` 的成熟模式(diff 检查器输出 vs 基线,只挡新增,打印已治愈项供收紧基线):

- `scripts/ui-style-check.mjs`:纯文本/AST-lite 扫描 `packages/renderer`,输出 `[ui] failed: <file>:<line> <rule>` 行。
- `scripts/ui-gate.mjs` + `docs/audit/ui-baseline-<date>.txt`:基线一次性生成(预计 1500+ 条存量),CI/提交前跑 `bun run ui:gate`,只对**新增**行报错。
- package.json 加 `ui:check` / `ui:gate` 两个脚本。

检测规则(与 ui-system.md 禁令清单一一对应):

| 规则 | 检测方式 |
|---|---|
| `z-literal` | style 块内 `z-index:\s*\d{2,}`(≥10 的字面量) |
| `z-fallback` | `var(--z-[a-z]+,\s*` |
| `raw-teleport` | `.vue` 模板含 `<Teleport to="body"` 且文件不在原语层白名单 |
| `native-select` | 模板含 `<select`(白名单:无) |
| `native-confirm` | script 含 `confirm(`/`alert(`(word boundary) |
| `title-attr` | 模板含 ` title="` 或 ` :title="`(白名单:img/abbr 等语义场景) |
| `ui-hex-fallback` | `var(--ui-[^,)]+,\s*(#\|rgba?\()` |
| `transition-literal` | `transition[^;]*\d+m?s`(未含 `var(--duration`) |
| `shadow-literal-floating` | 浮层类选择器(popover/dropdown/menu/dialog/tooltip 命名)内的 box-shadow 字面量 |
| `focus-bare` | `:focus\s*[{,]`(非 :focus-visible/:focus-within,白名单 input/textarea caret 场景) |

维护成本控制:规则全部是行级正则,不做 CSS 解析;误报走文件级白名单注释 `/* ui-gate-allow: <rule> */`。

---

## 5. 分期总览

| 期 | 主题 | 交付物 | 规模感 | 验收 |
|---|---|---|---|---|
| **P0** | 规则定稿 + 执法上线 + z-index 收口 | ui-system.md、token 校准(duration/radius)、z-index 修表(~25 处机械修 + 6 处 dialog 层级错配)、ui:check/ui:gate + 基线、CLAUDE.md 指针 | 小,无行为变化 | `bun run ui:gate` 绿;真机走查:radius 校准点名处、浮动侧栏/语音/搜索阅读器层叠正确 |
| **P1** | 浮层内核 + Popover/Dropdown | useFloatingLayer(整合 safe-triangle/registry)、Popover.vue、Dropdown.vue、ContextMenu 合流;迁 4 个代表点:AgentSelector、ProviderModels caps popover、MessageActions more-menu、SayMessageRow emoji 面板 | 中大,本方案技术核心 | 4 个迁移点真机行为等价(含翻转/滚动跟踪);SessionContextMenu 删除 |
| **P2** | Dialog + Toast | Dialog.vue、useConfirm()、Toast 服务;16 个手写对话框全量迁入,13 处 confirm()/alert() 换 useConfirm | 中,重复劳动多但机械 | 对话框全走 `--z-modal`;Esc/焦点行为统一;raw-teleport 棘轮清零(白名单仅原语层) |
| **P3** | 表单控件收敛 | Checkbox.vue、Radio.vue 新建;Switch 三套并一(删 .toggle-switch 全局类 + 30 文件自绘);21 文件原生 select 迁 Select.vue(settings 区集中歼灭) | 中,settings 区为主 | native-select 棘轮清零;设置页真机走查 |
| **P4** | 交互态配方 + 双轨清算 | hover/selected 派生配方下沉 deriveStateOverlays;.u-focus-ring 落地、:focus 迁 :focus-visible;字面 fallback 清理;`UI_LEGACY_VAR_MAP` 停止双写(renderer 内 legacy 引用先清零) | 中,散但每处小 | legacy 变量引用 0;16 个 builtin 主题逐一切换走查(hover/selected/focus 三态) |
| **P5** | 长尾清偿 + 基线收紧 | title= 长尾迁 Tooltip、transition/radius/shadow 字面量按目录分批消、棘轮基线随治愈重生成 | 长尾,可穿插进行 | 基线条数单调下降;报告采用率复测(目标:z/浮层 100%,transition/radius >80%) |

依赖关系:P1 依赖 P0 的 z-index 表;P2 依赖 P1 的内核(Dialog 用 trapFocus);P3/P4 相互独立,可并行或换序;P5 持续。

**执行顺序的理由**:执法先行(P0)——否则迁移速度赶不上新增速度,这是 token 采用率停在 10% 的直接教训;浮层内核(P1)是最大结构缺口且被后续期依赖;Dialog(P2)是单点最高杠杆(16 份重复实现);表单(P3)是纯采纳问题,机械但收益直观;配方(P4)动主题层,放在组件收敛之后,避免同时动两层难定位回归。

---

## 6. 风险与既有教训(来自本仓库实测)

1. **scoped CSS 陷阱**:`:global(X) .y` 会被静默截断成 X;子组件根元素会被父级 scoped CSS 命中——迁移到 Popover/Dialog(子组件化)时,原先压在浮层上的父级样式会失效或误伤,每个迁移点必须真机比对,不能只看编译过。
2. **fallback 即事故**:`var(--z-dropdown, 1000)` 真值是 100——P0 修表时若先删 fallback 后改引用,顺序错了层叠当场崩;先改引用、后删 fallback。
3. **主题回归面**:P4 动 `css-mapper.ts`/`role-mapping.ts` 影响全部 16 个 builtin 主题,`one-dark`/`solarized-dark` 当前有未提交改动,动手前先确认工作区干净。
4. **radius 校准是视觉变更**:8px→6px 会真实改变 ~75 处外观,虽然方向是"向众数看齐",消息气泡/输入框等高感知区要点名走查。
5. **UI 改动走查前必须重 build**(collab W1/W2 教训);vite 首次依赖优化会掐断 Playwright evaluate,走查脚本注意。
6. **`title=` 迁移别一刀切**:467 处里大量是调试/冗余信息,迁移时逐处判断"删"还是"迁 Tooltip",盲迁会把 Tooltip 变成新的噪音源。

## 7. 本方案不做什么

- 不引入第三方 UI 库/浮层库(理由见 §1 原则 4;若 P1 内核在真机上处理不好嵌套滚动容器跟踪,再议 @floating-ui/dom 换芯,接口不变)。
- 不做视觉改版:本方案是机制与纪律收敛,纸墨方向、Flexoki 色板、既有主题全部不动。
- 不动 `packages/renderer` 之外的 UI(搜索窗/todo 窗等独立窗口共用 renderer 组件,自然受益,不单列)。
- 不做 components/common barrel(现有直接路径 import 约定不变,避免无谓 churn)。
