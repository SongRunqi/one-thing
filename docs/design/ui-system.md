# UI 系统查表卡

写 UI 时翻这一页。方案与理由在 [ui-system-consolidation.md](./ui-system-consolidation.md);这里只有结论。
**本页每条禁令都由 `bun run ui:gate` 执法** —— 存量在基线里,新增会被挡下。

---

## 1. 我要做一个 X → 用哪个

| 想做的东西 | 用 | 状态 |
|---|---|---|
| 悬停提示 | `components/common/Tooltip.vue` | 已有,**别再写 `title=`** |
| 锚定在某元素旁的面板 | `components/common/Popover.vue` | 已有(P1) |
| 菜单(含右键) | `components/common/Dropdown.vue` / `ContextMenu.vue` | 已有(P1;ContextMenu = Dropdown 的坐标触发包装) |
| 确认框 / 表单弹窗 | `components/common/Dialog.vue` + `composables/useConfirm.ts` | 已有(P2)。**别再写 `.dialog-overlay`/`.dialog` 全局类**,它们只剩存量 |
| 通知条 | `composables/useToast.ts` | 已有(P2);皮肤仍是 components.css 的 `.toast` |
| 下拉选择 | `components/common/Select.vue` | 已有,**别用原生 `<select>`** |
| 多选 | `components/common/Checkbox.vue` | 已有(P3);挂线 tick,支持 `indeterminate` |
| 单选 | `components/common/Radio.vue`(+ `RadioGroup.vue`) | 已有(P3);墨环+点。组可选,单个 `v-model` 也成立 |
| 开关 | `components/common/Switch.vue` | 已有,别自绘。设置区传 `variant="ledger"` |

**表单控件的三个"皮肤"**(P3 起由组件自己出,不许消费者用 scoped 规则重画 ——
根元素上的类和组件自己的规则同为 (0,2,0),平局归注入顺序):

| 场景 | Select | Switch |
|---|---|---|
| 聊天/面板 | `variant="box"`(默认,圆角输入面) | `variant="pill"`(默认) |
| 设置区 | `variant="ledger"`(方角发丝框,= SettingsPage `:deep(select)` 画的那个) | `variant="ledger"`(虚线轨+空心环 → 实线+实心点) |
| 纸墨对话框/房间表单 | `variant="underline"`(线即控件) | —— |

**列表行的两种状态不能是同一种记号。**
`hover`/键盘 active 是**瞬时**的,`selected` 是**持久**的;两者若都画成满底色块,紧邻时
各自的圆角会被邻居的直边填平,渲染成一整条通板,行与行读不开(真机报告:复合器的
permission 选择器)。规则:

- **所有列表行留 2px 缝**:行上 `margin-block: 2px`,面板 block padding 相应减去。
  注意面板是普通块容器,**相邻行的纵向 margin 会合并**取大值 —— 写 `1px` 得到的是
  1px 缝而不是 2px(实测)。
- **面 register(box)**:两态都可以是底色块 —— 有 2px 缝 + ✓ 就够读。
- **画线 register(ledger / underline)**:`selected` **不画底色**,改左缘 2px 墨线 +
  主色字(与 `sidebar-entry.is-active` 的 `inset 2px 0 0 accent`、`.member-line.is-on`
  同一套说法);`hover` 保留淡底。两条通道正交,所以紧邻可读,且同一行可以同时是
  "选中的 + 手正指着的"。
- **选中行必须保留 hover 反馈**:`selected` 不是"这一行不再响应指针"。两态各自成立
  还不够,**叠在同一行时也要看得出手指着它** —— 否则选中行就是死区(真机报告:
  Select 的 box 变体,`.selected` 写在 `:hover` 之后、同为 (0,2,0),底色块把 hover
  整个吞掉)。做法:`selected:hover` / `selected.highlighted` 在 **selected 自己的底**
  上加深一档,配方是"往对立色调混" ——
  `color-mix(in srgb, <selected 底> 92~94%, var(--ui-text-primary-fg))`,与全局
  `.btn.primary:hover` 同一个说法。**禁止写死 alpha 或 hex**:`--ui-text-primary-fg`
  在浅色主题是深的、深色主题是浅的,所以"更深一档"两边都成立;单纯抬 accent 的 alpha
  在深色主题里几乎不动(实测 One Dark 下 `--ui-state-hover-bg` 只比面板亮 5 级)。
  画线 register 同理 —— `hover` 的淡底照旧画在墨线**下面**,两条通道不互相取消。
  这一档要贴着 `selected` 的静息态写(共享一个自定义属性),别让两处数值各自漂移。
- **键盘 active 与鼠标 hover 是同一视觉通道**:几何只写在基类上,状态只改 paint,
  两者共用一条选择器 —— 别给其中一个单独加内外边距。加深一档也照此办理:
  `:hover` 与 `.highlighted` 必须挂在同一条规则上。
- `Dropdown.vue` / `Mention.vue` **不需要这条缝**:它们只有瞬时态(`ContextMenuItem`
  没有 `selected`),两行不可能同时上色。菜单按惯例就是紧排的,别去加缝。

**铁律:业务组件不写浮层机制。** 定位、Teleport、z-index、遮罩、Esc、outside-click 归原语层;
业务组件只给内容。P1 起唯一的定位内核是 `composables/floating/useFloatingLayer.ts`
(纯几何在同目录 `compute-position.ts`,有单测),`Popover.vue` 是它的薄壳,`Dropdown.vue`
是 Popover 的菜单特化。可以 `<Teleport to="body">` 的文件只有 `common/` 下这几个:
`Popover.vue`、`Dropdown.vue`、`ContextMenu.vue`、`Dialog.vue`、`Tooltip.vue`、
`Select.vue`、`ImagePreview.vue`、`Table.vue`。(Teleport 到自定义容器不算浮层机制,不受限。)

**Dialog 不是 Popover 的特化**:它不锚定任何元素,自己居中,所以没接定位内核 ——
共用的只有焦点管理(`composables/floating/useFocusTrap.ts`,P2 从内核里抽出来的,
两边同一份 Tab 算术)。两个变体:`default`(圆角、elevated 面、黑色遮罩)与
`paper`(方角、app-bg 面、`--shadow-paper`、遮罩是 app-bg 的淡洗 —— 设置区用它)。
尺寸、内边距、遮罩色都走 `--app-dialog-*` 自定义属性;**这些属性写在 `:style` 上,
Dialog 把 `style` 挂在遮罩(根)上**,因为自定义属性只向下继承 —— 挂在面板上时
`--app-dialog-overlay-bg` 会静默失效。`class` 仍然落在面板上。

**scoped 与全局同名 = 靠注入顺序活着的平局(P2 实测事故)。**
一条 scoped 单类选择器 `.btn` 编译成 `.btn[data-v-x]`,特异性 (0,2,0) —— 和全局的
`.btn.primary` **一模一样**。平局由样式表注入顺序裁决,而注入顺序会随组件增删被洗牌:
P2 新增 Dialog/ConfirmHost 后它当场翻边,全局实心 `background` 赢了、scoped 的 `color`
还在,于是「Add Server」变成蓝底蓝字。
规则:**局部样式不要复用全局组件类名**(`.btn`/`.form-*`/`.dialog-*`/`.toast` …)。
要么用全局那套(别再 scoped 重写一遍),要么换个自己的名字。提特异性只是换个方向掷同一枚
硬币,不算修。对话框页脚的墨线文本按钮用 Dialog.vue 非 scoped 块发布的
`.app-dialog-text-btn`(修饰符 `is-primary` / `is-danger`,刻意不叫 `primary`/`danger`)。

**同一族的第二种变体:组件内部规则 vs 消费者 scoped(根元素即他人组件)。**
`<Button class="x">` / `<BorderBox class="x">` 里那个 `.x` 落在**别人组件的根元素**上,
而组件自己的 scoped 规则也在给同一个元素刷同样的属性。数一下:
`.app-button[data-v-组件]` = (0,2,0),消费者 `.x[data-v-消费者]` = (0,2,0) —— 又是平局;
更糟的是 `.border-box.is-interactive[data-v]:hover` = **(0,4,0)**,消费者
`.x:hover[data-v]` = (0,3,0),**消费者根本赢不了**,写了也白写。
(实测:`MCPServerDialog` 的 transport 卡片 hover 时边框整条消失;`Dropdown.vue` 早就为此
改用原生 `<button>` 绕开。)

- **组件侧**:声明"我不画"的模式必须真的**不发出声明**,而不是发出一个 transparent。
  `Button unstyled` / `BorderBox unstyled` 现在把整组 paint 声明(border / radius /
  background / shadow / padding / color / transition)用 `:where(:not(.is-unstyled))`
  整条关掉 —— `:where()` 特异性为 0,已上色的用法权重分毫不变,零爆炸半径。
- **消费者侧**:别在别人组件的根元素上抢属性。要么用组件暴露的确定性 API,要么——
  当你其实不需要这个组件的任何能力时——**直接写原生 `<button>`**。对话框页脚就是后者:
  它们不需要 loading/icon/group,套 `Button unstyled` 只会换来一场必输的特异性官司
  (`.app-button` 的 `font: inherit` + `font-size` 会盖掉页脚自己的 mono 12px)。

**用 Popover 时的一条坑**(方案 §6.1):Popover 的根元素**拿不到**调用方的 scoped 作用域
(它的根是 Teleport,Vue 只把 scopeId 传给单个根元素)。浮层的皮肤要么写进插槽里的那层
`div`(插槽内容仍在调用方作用域内),要么写进调用方的**非 scoped** `<style>` 块。
`SayMessageRow` 走前者,`MessageActions` 的 `.more-menu`/`.branch-menu` 走后者。

---

## 2. 交互态配方(唯一出处)

| 态 | 唯一写法 |
|---|---|
| hover 背景 | `background: var(--ui-state-hover-bg)`(区域别名如 `--ui-sidebar-item-hover-bg` 由主题层派生,组件端只引用) |
| selected 背景 | `var(--ui-state-selected-bg)` 或其区域别名。**不要**拿 `--ui-accent-primary-fg` / `--accent` 当选中底色 |
| focus ring | `.u-focus-ring`(components.css);输入框用 `.u-focus-ring-input` |
| focus 伪类 | 一律 `:focus-visible`。裸 `:focus` 只留给输入框 caret 场景 |
| 过渡 | `transition: <prop> var(--duration-fast) var(--ease-default)`。**禁字面时长** |
| 圆角 | `var(--radius-xs|sm|md|lg|full)` = 3 / 6 / 10 / 16 / 9999px |
| 浮层阴影 | 锚定浮层 `--shadow-floating`,对话框 `--shadow-elevated`,纸墨签名影 `--shadow-paper` |

**区域墨阶(P4a 起住在主题层)。** 侧栏与设置区的行状态不走通用 state ramp ——
它们要的是**同一条墨色上的等比阶梯**(分组头全墨 > 行文 72% > 选中 14% > hover 8% >
rail 底 2.5%),直接引通用 token 时这几档的相对关系不可控(实测:分组头与行文同色、
hover 看不见)。配方表在 `themes/role-mapping.ts` 的 `REGION_OVERLAY_STEPS`,
`css-mapper.ts` 按各主题的**区域底色**解析成实色发出来:

| token | 是什么 |
|---|---|
| `--ui-sidebar-row-ink` / `--ui-sidebar-row-fg` | 侧栏行的墨 / 行文(72%) |
| `--ui-sidebar-item-hover-bg` / `--ui-sidebar-item-active-bg` | 侧栏行 hover(8%)/ 选中(14%) |
| `--ui-sidebar-rail-bg` / `-hover-bg` / `-active-bg` / `-muted-fg` | rail 与 ActiveWorkCard 这类嵌套面(2.5 / 4.5 / 7.5 / 47%,**叠在 rail 底上**) |
| `--ui-settings-row-hover-bg` / `--ui-settings-row-active-bg` | 设置区行(accent 5% / 10%) |

**组件端只引用,不再自造 `color-mix`。** 要加新档位就改 `REGION_OVERLAY_STEPS`,
改完跑 `themes/__tests__/state-overlay-audit.test.ts`(16 主题 × 声明模式,断言
"有值 / 是实色 / ΔRGB ≥ 5 / 阶梯单调")。混色一律 `in srgb` —— oklch 在近中性色上泛粉。

**focus ring 的三个 shadow token**(拿不到全局工具类的 scoped 规则直接引,别手抄双环):
`--ui-focus-ring-shadow`(双环)/ `--ui-focus-ring-input-shadow`(输入框单环 15%)/
`--ui-focus-ring-soft-shadow`(浮面、侧栏 rail 的半透明单环 36%)。

**双轨已终止(P4b)。** `--accent` / `--text` / `--muted` / `--hover` / `--border` 这一批
**159 个 legacy 变量名,主题层不再写了**(`css-mapper.ts` 的 `UI_LEGACY_VAR_MAP` 已缩成
`UI_ALIAS_VAR_MAP`,只剩两类真别名:`--shadow-floating`/`--shadow-elevated` 档位名,
以及 `--ui-table-*`/`--ui-category-N-*` 这种比自动名好听的短名)。它们在
`variables.css` 里还有静态定义,但**不再跟主题变** —— 新代码引用它们 = 拿到一个死值。

**只用 `--ui-*` 正主。** 忘了对应关系就查 `UI_LEGACY_VAR_MAP` 的 git 历史,或直接看
`css-mapper.ts` 的 `CSS_VAR_MAP`。语法高亮那套(`--text-code-*` / `--hljs-*`)不在此列,
hljs-theme.css 与 StreamingCodeBlock 仍按那套名字消费,照旧双写。

**fallback 纪律:**
- `--ui-*` 引用**禁止 hex/rgba 字面 fallback**。`var(--ui-state-hover-bg, #f4f2ed)` 在 dark 主题下 token 一缺就爆白。
- fallback 链最多一层别名:`var(--ui-x, var(--ui-y))`,不嵌三四层。
- **写之前先确认 `--ui-x` 真的存在。** P4a 抓到 15 个拼错/臆造的名字(`--ui-surface-hover-bg`
  该是 `--ui-state-hover-bg`、`--ui-border-subtle` 该是 `--ui-border-subtle-border`…),
  其中 3 处连 fallback 都是不存在的变量 —— 整条声明在计算期作废,那块颜色一直没画出来过,
  而且**没有任何报错**。P4b 已全部修掉;别再造新的。

---

## 3. z-index 层级表

| 变量 | 值 | 允许的东西 |
|---|---|---|
| `--z-base` | 0 | 常规流 |
| `--z-sticky` | 10 | sticky 头、resize 手柄、滚动条轨、局部悬浮触发区 |
| `--z-dropdown` | 100 | 锚定浮层:下拉、picker、popover、flyout、hover 卡 |
| `--z-sidebar` | 200 | 浮动侧栏 |
| `--z-overlay` | 500 | 全屏遮罩类面板:语音悬浮/通话、搜索结果阅读器 |
| `--z-modal` | 600 | 对话框及其遮罩 |
| `--z-tooltip` | 700 | tooltip 专用 |
| `--z-toast` | 800 | toast 专用 |
| `--z-max` | 9999 | 图片全屏预览、SelectionToolbar 等确需压一切的 |

规则:
- **只允许 `var(--z-*)`,禁数字字面量**(个位数的局部堆叠除外,如卡片内角标)。内联 style 同样适用:写 `zIndex: 'var(--z-dropdown)'`。
- **禁给 `--z-*` 写 fallback**。variables.css 全局加载,fallback 永远用不上,却会在改档位时误导人 —— `var(--z-dropdown, 1000)` 的真值是 100。
- 同档内相对顺序用 `calc(var(--z-x) + n)`,`n ≤ 30`。

**`--z-dropdown` 档内的既定次序**(加塞前先看这里):

| n | 谁 |
|---|---|
| +0 | 普通锚定浮层(nav rail、SubMenu、主题菜单、emoji 面板底、MediaPanel 抽屉、prompt 引用卡) |
| +1 / +2 / +3 | 复合器三兄弟:ComposerExtensionPanel / InputBox 浮层 / AgentSelector flyout |
| +5 | MediaPanel 工具条 |
| +20 | 表单下拉:Select、Mention、ProviderModels 能力 popover |
| +24 | 表格筛选菜单、emoji 面板遮罩 |
| +25 | 消息级浮层:MessageActions 三个菜单、branch-menu、MessageItem 反应卡、emoji 面板 |

**两处层级裁量**(不按表面语义走,理由记在这里):

- `chat/permission/RejectReasonDialog.vue` 原来写死 `--z-max`,P2 迁 Dialog 时**归回
  `--z-modal`**:它是从权限卡里抬起来的,而权限卡是普通页面内容,没有需要压过的
  modal 级宿主。要压宿主的对话框走 Dialog 的 `zOffset`(同档 `+n`)或 `baseZ`。
  `editor/FileExplorer.vue` 的两个文件操作框用 `zOffset: 1`,保留它原先的
  `calc(var(--z-modal) + 1)`。

- `common/ContextMenu.vue` 留在 `--z-modal` 而不是 `--z-dropdown`:右键菜单要能在对话框内部弹出并压住宿主。
  P1 起这是**显式的 `zLayer` prop**(默认 `'modal'`),不再是写死的例外;不需要压宿主的调用点
  传 `z-layer="dropdown"` 即可回到 dropdown 档。同档内的相对顺序用 Popover/Dropdown 的
  `zOffset`(= `calc(var(--z-x) + n)`),完全跳出档位表则用 `baseZ` 传整条表达式。
- `evals/EvalsWorkbench.vue` 用 `calc(var(--z-modal) + 10)` 而不是 `--z-overlay`:它是从设置弹层里打开的,
  掉到 overlay 档就会被设置弹层盖住。

`Select.vue` / `Mention.vue` 默认在 dropdown+20(=120),**压不过 modal(600)**。
P3 起 Select 接了内核,这条不再是陷阱而是一个 prop:**在 Dialog 里放 Select 就传
`z-layer="modal"`**(→ `calc(var(--z-modal) + 20)` = 620,压过 600 的遮罩),
并且要 `teleported` —— 否则面板会被对话框的滚动体裁掉。`Mention.vue` 尚未接内核,
同样的场景仍需手改。

**Esc 归谁**:`composables/floating/esc-stack.ts`。浮层开着时把自己的 token 压栈,
只有栈顶那层响应 Esc。Dialog 与 Select 都用它 —— 两者的监听都挂在 `window` 捕获期,
**同一目标的捕获监听按注册顺序跑**,Dialog 永远先注册,所以内层 `stopPropagation`
来不及(实测:对话框里开着下拉按 Esc,整张表连同下拉一起关了)。新写浮层照办,
且**卸载时必须出栈**,否则 Esc 全局失灵。

---

## 4. 禁令清单(= `ui:gate` 的 10 条检测项)

| 规则 | 禁什么 |
|---|---|
| `z-literal` | `z-index: 100` / `zIndex: 1000` —— ≥10 的数字层级 |
| `z-fallback` | `var(--z-dropdown, 1000)` —— `--z-*` 一律不带 fallback |
| `raw-teleport` | 原语层白名单之外的 `<Teleport to="body">` |
| `native-select` | 原生 `<select>` —— 用 `Select.vue` |
| `native-confirm` | 原生 `confirm()` / `alert()` —— 用 `useConfirm()`。引了 `composables/useConfirm` 的文件整体豁免(`await confirm({…})` 是治愈后的样子) |
| `title-attr` | 模板里的 `title=` / `:title=` —— 用 `Tooltip.vue`;纯调试信息直接删 |
| `ui-hex-fallback` | `var(--ui-x, #fff)` / `var(--ui-x, rgba(…))` |
| `transition-literal` | `transition: … 0.15s` —— 用 `var(--duration-*)` |
| `shadow-literal-floating` | 浮层类选择器(popover/dropdown/menu/dialog/tooltip/flyout/popup/modal)里的字面 `box-shadow` |
| `focus-bare` | 裸 `:focus`(输入框元素选择器除外)—— 用 `:focus-visible` |

误报出口:文件里加一行 `/* ui-gate-allow: <规则名> */`(也认 `// …` 和 `<!-- … -->`,
多条逗号分隔,`all` 全放)。**用之前先确认它真是误报** —— 白名单是给语义场景留的,不是给赶工留的。

已知盲区(行级正则的代价,不是可以钻的空子):跨行的 `transition:` 续行、
多行属性写法的 `<Teleport\n to="body">`、CSS-in-JS 里的浮层阴影。

---

## 5. 执法

```bash
bun run ui:check   # 全量清单(存量 + 新增),按规则分类计数
bun run ui:gate    # 棘轮:只对基线之外的新增 exit 1;治愈的行会打印出来
```

基线:`docs/audit/ui-baseline-2026-08-05.txt`(**768 条**存量,按 [分期表](./ui-system-consolidation.md#5-分期总览) 逐期消)。
P0 首录 1144 条 → P2 实测 1044(`native-confirm` 归零、`raw-teleport` 12→4,未重录)
→ P4 收官 768(`ui-hex-fallback` 151→0、`focus-bare` 65→27),**此处已重录**。
清掉一批之后重新生成基线把棘轮收紧:

```bash
node scripts/ui-style-check.mjs > docs/audit/ui-baseline-<date>.txt   # 记得同步改 scripts/ui-gate.mjs 里的路径
```
