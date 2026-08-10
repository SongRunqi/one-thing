# renderer 自绘 UI 审计(hover / tooltip / 浮层 / 控件皮肤)

2026-08-10,只读审计。范围:packages/renderer 全树 497 文件(254 vue / 232 ts / 11 css,
排除 __tests__),**145 个文件**至少命中一类违例。动机:壁纸模式(背景图为全局行为)
要求所有表面可被 token 级覆盖 —— 自绘样式是任何全局面色行为永远覆盖不全的根因。
App.vue 壁纸区块自己的注释就是全部理由:"透明化白名单是枚举制,新的不透明包装
元素进树时必须来登记一行" —— 枚举制之所以必要,正是因为 C 类的 109 条 hover
不认任何可覆写的 token。

## 一句话结论

统一组件族其实相当完整(Tooltip 存在且 49 个文件在用、Teleport 完全收口、
原生 select 清零)。**真正的窟窿只有两个**:

1. **99 条自造 `color-mix` 的 hover** —— 根因是"想叠 accent 淡底"时没有可引的
   token(缺口 G6);
2. **浮面皮肤留在消费者手里** —— 根因是 Popover 根为 Teleport、拿不到调用方
   scoped 作用域,组件未提供 surface 档位(缺口 G1;d1e58936"三类浮层统一菜单面"
   逐处改了 3 个文件,只要皮肤在消费者手里,下次改面色还得逐处改)。

这两个缺口不补,任何迁移都只是把手搓从 A 处搬到 B 处。

## 违例计数

| 类 | 条数 | 文件数 |
| --- | --- | --- |
| A 自绘 tooltip(真) | 1(UsageSettingsPanel `.chart-tip`,字面阴影+自绘面)+1 待判 | 1 |
| A 原生 title=(真,已判定保留) | 2(MenuItem/SubMenu,ui-system §1 判例) | 2 |
| A title-attr **假红** | 45(全是组件的 title prop:SettingsSection×30 等)→ **改检查器豁免名单,baseline 58→~11** | 20 |
| B-1 完全自绘浮层 | 8(theme-dropdown、practice-menu+悬浮子菜单、workbench-tab-picker、todo-popover、prompt-cards 的 JS 拼 fixed、evals/voice 遮罩、两条 nav-card) | 8 |
| B-2 走机制但自绘浮面皮肤 | 4(MessageActions 菜单、ModelSelector/AgentSelector/MusicStatusBar flyout) | 4 |
| C1 自造 color-mix hover | **99** | 45 |
| C2 字面 hex/rgba hover | 10 | 6 |
| D 自画控件皮肤 | ~40 文件(309 个原生控件;20 个既不 import Button/Input 又自画) | ~40 |

关键对照:`--ui-state-hover-bg` 全库 111 处引用,而 `color-mix(` 全库 **861 处**。
`raw-teleport` 违例 = 0;`native-select` = 0(比 baseline 还少 2)。

侧栏机制性教训:壁纸模式唯一被 token 打通的一族里仍有 4 条自绘
(Sidebar:2065 直接混 `--sidebar-row-ink` 绕开被覆写的 token)——这就是
"真机三轮修了 hover 又漏 active"的根因形态。

## 统一组件缺口(先补能力,再迁移)

| # | 缺口 | 补法 |
| --- | --- | --- |
| G1 | Popover 无 surface 档位,scoped 作用域坑逼消费者自绘浮面 | `surface="menu"\|"floating"\|"elevated"` prop,面色/边框/阴影/圆角收进组件 |
| G2 | Tooltip 无坐标/虚拟锚点(图表气泡场景) | 复用 ContextMenu 内核加 `virtual-anchor: {x,y}` |
| G3 | 无浮层版子菜单(SubMenu 是内联折叠组) | Dropdown 支持嵌套项(safe-triangle.ts 已有) |
| G4 | Dropdown 只有 1 个消费者,搜索头/分组/双列都不支持 | `#header` 插槽 + 分组 + 双列 |
| G5 | useFloatingLayer 无命令式出口(CodeMirror 插件手拼 fixed) | 从 compute-position.ts 导纯函数 API |
| G6 | 无"叠 accent 的 hover 档位"token(C1 99 条的根因) | REGION_OVERLAY_STEPS 加 `--ui-state-hover-accent-bg/-strong` 族,过 state-overlay-audit 16 主题 |
| G7 | 壁纸分级无组件端声明位(App.vue 枚举白名单) | 长期:组件端声明 tier,App.vue 只写 4 条规则 |
| G8 | 私有 token 岛(--todo-* / --permission-* / --ps-* / --settings-*) | 逐个评估:区域墨阶并入 REGION_OVERLAY_STEPS,纯几何保留 |

## 迁移波次(6+1 波,每波独立可验)

| 波 | 内容 | 依赖 |
| --- | --- | --- |
| 0(前置必做) | G6 token 族 + G1 Popover surface + title-attr 豁免名单 + 重录 ui baseline | 无 |
| 1 | common/ 自身 C 类 9 件(Select/Table/VirtualTable/SessionSegmentList/PromptReferenceCard/ImagePreview/Checkbox/Dropdown/Input) | 波0;Input.vue 待用户提交 |
| 2 | 侧栏族 C 类 5 件(壁纸 token 已打通,收益立见) | 波0 |
| 3 | 消息/聊天族 C 类 ~15 件 | 波0 |
| 4 | 浮层族:G2/G3/G4/G5 补能力 → 迁 B-1×8 + B-2×4 + chart-tip | 波0 |
| 5 | 设置/工作台/编辑器族 ~12 件(多为脏文件,待提交) | 波0 |
| 6 | D 类控件皮肤 ~20 件(可随时插队) | 独立 |
| 7(可选) | G7 壁纸分级声明化,删"新面必须来登记"的规矩 | 波1-5 后 |

## 待用户提交后迁移(脏文件里的违例,21 个文件)

真 P1 落在脏文件里的两个:`common/Input.vue`(C:675,统一组件自身)、
`settings/UsageSettingsPanel.vue`(chart-tip + 唯一 ui:gate NEW focus-bare)。
其余多为 SettingsSection title prop 假红与 D_button。

完整逐行清单见审计原始报告(会话 2026-08-10);本文档保留决策所需的全部结论。
