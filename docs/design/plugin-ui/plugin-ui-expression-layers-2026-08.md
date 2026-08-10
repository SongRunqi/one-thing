# 插件 UI 表达力分层与限制(2026-08)

> 承接 [`plugin-ui-anchors-audit-2026-08.md`](./plugin-ui-anchors-audit-2026-08.md)
> 与 [`plugin-ui-anchors-2026-08.md`](./plugin-ui-anchors-2026-08.md)。
> 本文回答第二个问题:**描述树表达力受限,插件 UI 能做多复杂?边界在哪?
> 哪些诉求(动画、自定义样式、接管输入)走哪条路?**

---

## 1. 问题定义与三层模型

用户诉求拆解:

| 诉求 | 例子 | 表达路径 |
| --- | --- | --- |
| 数据展示 | plan 执行状态、日志列表、配置表单 | **L1 描述树(现在就能做)** |
| 交互反馈 | 按钮、下拉、提交、刷新 | **L1 描述树(现在就能做)** |
| 动态视觉 | 进度、徽标、状态色 | **L1 描述树 v2(本期扩展)** |
| 自定义样式 | 品牌色、圆角、字体 | **L2 主题 token 覆盖(二期)** |
| 动画 | 转场、动效、live 更新 | **L2 受限动画原语 / L3 webview(H 线)** |
| 任意 UI | 图表、编辑器、拖拽、画布 | **L3 webview 逃生舱(H 线)** |
| 接管输入 | 替换输入框本体、改写输入状态 UI | **红线:不做(宪法第 1 条)** |

```
L1 描述树(纯数据,宿主渲染)   ← 默认路径,覆盖管理型 UI 的 ~80%
  ↑ 原语扩展(v2):table/tabs/progress/badge 等
L2 主题与动画(宿主给 token / 受限动画原语)  ← 二期
L3 webview 逃生舱(iframe 沙箱,postMessage-only)  ← H 线,配方已备
```

**为什么描述树不能"无限加原语直到够用"**:每加一个原语,宿主渲染器、
校验器、类型、测试四处都要动;原语越多,"表达力天花板"越高但永远追不上
需求 —— 第三方插件生态里总有下一个要的原语(VS Code 的 TreeView 到今天
也没有图表节点,它的答案不是"加 chart 节点",是 webview)。**描述树做
"数据密集型、交互稀疏"的 UI,webview 做"视觉密集型、交互密集"的 UI**,
中间地带用主题与动画原语过渡。

---

## 2. L1:描述树现状与 v2 扩展

### 2.1 现状盘点(已核实)

协议:`packages/core/plugins/panel.ts`(`PLUGIN_PANEL_PROTOCOL_VERSION = 1`)

| 节点 | 字段 | 渲染器 | 用途 |
| --- | --- | --- | --- |
| `stack` | gap: none/small/medium | PluginPanelNode.vue | 纵向堆叠 |
| `row` | children | 同上 | 横向排列 |
| `list` | title/items[{id,title,subtitle,badge,actionId,payload}]/emptyText | 同上 | 数据列表 |
| `markdown` | text | MessageMarkdown | 富文本(宿主渲染) |
| `button` | label/actionId/payload/variant/disabled | Button | 动作 |
| `form` | fields[{key,label,hint,control,options,value}]/submitActionId | SettingsGroup+SettingsField | 表单 |
| `empty-state` | title/description/actionId/actionLabel | SettingsEmptyState | 空态 |

控件:`switch` / `text` / `number` / `select` / `string-list`(5 种)

校验器:`validatePluginPanelTree`(节点类型白名单、深度 ≤12、
`describeNonSerializable` 全树扫描 PANEL_TREE_SCAN_DEPTH=32、禁函数成员)

限制(现状,全部核实):

- 节点类型白名单是 `Set` 字面量 —— 加节点 = 改 `PANEL_NODE_TYPES` +
  `validateNode` 的 switch + renderer 的 v-else-if 链 + 类型联合。
- 表单控件白名单 `FORM_CONTROLS` 同样四处同步。
- **无动画**:渲染器零 transition 语义(除 list 进入时宿主自带的)。
- **无轮询**:插件要自己起 timer 调 `ctx.refresh()`(有 200ms 合流 + debounce,
  但"定时重拉"这件事没有协议级表达)。
- **无条件渲染**:插件要为显示/隐藏整树重渲染(或返回 empty-state 占位)。
- **无局部更新**:每次 render 整树替换(有 latest-wins 防旧盖新,但无 diff/patch)。

### 2.2 v2 原语扩展(本期,与锚点系统同批)

**新节点**(四处同步的完整清单):

| 节点 | 字段(草案) | 渲染 | 场景 |
| --- | --- | --- | --- |
| `table` | columns[{key,label,width?}], rows[{key, cells}], emptyText | 宿主表格 | 数据矩阵 |
| `tabs` | items[{id,label,body}] | 宿主 tab 条 | 分组内容 |
| `progress` | value?: number(0-100), indeterminate?: boolean, label? | 宿主进度条 | 长任务 |
| `spinner` | label? | 宿主 spinner | 加载中 |
| `badge` | text, tone?: 'default'/'accent'/'danger'/'success' | 宿主徽标 | 状态标记 |
| `image` | url, alt, maxWidth? | 宿主 img | 图片(url 加载策略见 §2.4,安全面) |
| `link` | text, url, actionId? | 宿主 a | 外链/内联动作 |
| `code` | text, language? | 宿主代码块(只读,无高亮或宿主高亮) | 代码展示 |
| `divider` | — | 宿主分割线 | 区块分隔 |

**新控件**(对齐 R3 设置页渲染能力):

| 控件 | 渲染 | 场景 |
| --- | --- | --- |
| `textarea` | Input 多行 | 长文本 |
| `slider` | InputNumber 变体或宿主 slider | 数值范围 |
| `checkbox-group` | 宿主多选 | 多选集合 |
| `radio` | 宿主单选 | 互斥选择 |
| `date` | 宿主日期输入 | 日期 |
| `color` | 宿主色板 | 颜色 |

**新语义**:

| 语义 | 表达 | 场景 |
| --- | --- | --- |
| `refreshIntervalMs`(树级) | 宿主在块可见时按周期重拉 render(上限 1Hz) | 监控类面板,省掉插件自写 timer |
| `visible-when`(节点级) | 条件表达式(受限:字段存在性/相等,不执行代码) | 表单联动显示 |
| 节点级 `style` | **明确不做**(见 §3.3) | — |

**协议版本**:v2 加节点 = 联合加成员,`version: 2` 的树宿主能画,
`version: 1` 的树照旧 —— 校验器按 version 放行新旧两套(`PLUGIN_PANEL_PROTOCOL_VERSION` 升到 2,校验逻辑按成员放行,不做"版本分叉渲染")。

### 2.4 image / link 节点的 URL 策略(v2 新增,安全面)

描述树是插件控制的数据,url 字段是插件伸向渲染进程的一根管子,必须收拢。
(本文档初版在 §2.2 写"见 §4",但 §4 是 webview 章节,并未覆盖 —— 此处补上。)

- **`image.url` 只允许两个 scheme**:`data:`(内联小图)与 `https:`。
  `http:`、协议相对 `//`、其余 scheme 在校验器里拒绝(反例测试钉住)。
  https 远程图的内容可随时间变化(追踪像素/内容替换),渲染端以
  `referrerpolicy="no-referrer"` 加载;H 线的 `onething-plugin://<pluginId>/`
  落地后再放行插件目录静态资源。
- **`link.url` 只允许 `https:` / `mailto:`**;点击外链一律走宿主确认
  (与消息正文外链同一条路径);`javascript:` 等 scheme 校验期拒绝。

### 2.5 v2 的边界(能做什么,不能做什么)

能:管理型 UI 全覆盖 —— 数据表、分页列表(宿主分页原语?不,list 已够)、
配置表单、状态仪表盘(progress+badge+spinner)、多页签内容。

不能:任何"像素级控制"(精确布局、任意间距、渐变、阴影)、任何动画、
任何第三方组件复用、任何 DOM 事件级交互(拖拽、滚轮缩放、键盘组合)。

---

## 3. L2:主题与动画 —— 插件的样式定制面

### 3.1 现状(已核实)

- 主题系统:JSON 主题 → 语义 token → `CSS_VAR_MAP`
  (`packages/onething-runtime/src/themes/css-mapper.ts`,130+ 变量)→ renderer
  `packages/renderer/stores/themes.ts` 的 `applyThemeVariables` 写 `:root`。
- 描述树渲染器全部用 `--ui-*` 变量,零内联样式 —— 主题切换自动跟随。

### 3.2 三条路径

1. **跟随主题(默认,零成本)**:插件给数据,宿主给样式。这是宪法第 2 条
   的自然结果,也是绝大多数插件的正确选择 —— 用户切深色模式,插件块
   自动变深色,不用插件做任何事。
2. **主题 token 覆盖(二期,受限)**:manifest `contributes.theme` 声明对
   **既有 token** 的覆盖(如 `primary` 换成品牌色)。
   - **只允许覆盖既有 token,不允许新增 token** —— 新增 = 全局 CSS 注入
     的变体,红线。
   - 覆盖是**全局的**(主题变量是全局的) —— 两个插件同时覆盖 `primary`
     是冲突,按**全局规范顺序**后者胜(与锚点块排列/截断同一出处:
     `enabledAt`,平局 pluginId 字典序 —— 顺序不能是目录发现序,否则同一
     插件集合在不同机器上生效结果不同),设置页要能显示"谁的覆盖生效"。
   - 与主题文件的关系:覆盖挂在"用户当前主题"之上,主题切换时保留。
3. **webview(H 线)**:iframe 内完全自定义样式,不影响宿主。

### 3.3 红线:节点级 style 字段

描述树**不加** `style` / `className` 字段。理由:

- 节点级内联样式 = 半开 CSS 注入:单个节点看着无害,但"任意样式"的
  组合空间就是全局样式污染,而且校验器要维护一份 CSS 子集白名单
  (比 JSON Schema 子集难一个数量级)。
- "想要一点自定义"的正确出口是 **L2 主题 token 覆盖**(全局语义化)或
  **L3 webview**(完全隔离)。中间态是最坏的:既有全局风险,又不满足
  完全自定义。

### 3.3.5 L2.5:背景/材质层(2026-08-09 立项,G 期)

真实需求(用户):"给应用设置背景图片、调透明度"。现有 L2 只有颜色 token,
值白名单**刻意禁了 `url()`**(远程加载/追踪)——那条禁令针对的是任意 URL,
对**包内资产**不成立:C 期的 `onething-plugin://<id>/` 协议只服务已启用
插件的包内文件,天然就是安全的图源。于是背景能力不必打破任何红线:

1. **声明**:`contributes.theme.background = { image, darkImage?, opacity?,
   blur?, fit? }` —— image/darkImage 是包内相对路径(校验同 webview entry:
   相对、无 `..`、扩展名图片白名单);opacity 0–1、blur 0–40px 钳制;
   fit ∈ cover/contain/tile。装前确认页披露 `sets an app background image`。
2. **宿主渲染**:App 壳新增一个专属背景层(`.app-background-layer`,
   z 在一切内容之下、pointer-events: none),由宿主按**胜出声明**绘制
   (多插件冲突按全局规范顺序后者胜,与 token 覆盖同一出处);深浅模式
   分别取 image/darkImage;禁用/卸载即时撤除(拆除快照)。
3. **设置回路**:透明度等用户可调项走既有 R3 设置 schema;运行时
   `api.theme.updateBackground(partial)`(**仅 manifest 声明了 background
   的插件可调** —— 声明先于代码;值同样钳制)→ 走 plugins-changed 重推。
4. **不做**:任意 CSS、远程 URL、per-元素背景。背景层是**枚举出的一块
   宿主自留地**,不是 CSS 注入的口子。

**"插件系统何去何从"的定调**(回应用户的元问题):表达面按三条泳道演进 ——
**位置**(锚点/面板,五轴分类学治理)、**内容**(描述树/webview 双形态)、
**外观**(L2 token → L2.5 背景材质 → 将来逐个枚举:字体档位、气泡密度…)。
每一步都是"往窄腰上加一块枚举能力",**永不开放通用 CSS/DOM 注入** ——
撞到能力墙时的正确动作是给墙上开一扇有闸的门,而不是拆墙。

### 3.3.6 L2.6:皮肤包 —— 枚举档位(2026-08-10 落地,H3)

§3.3.5 结尾把"外观"泳道的下一步写成"将来逐个枚举:字体档位、气泡密度…"。
H3 是这条泳道上的第一块:**token 表达不了的"形"**。

分工一句话:**`overrides` 管色,`skin` 管形**。

- 颜色**不进** H3。已是 token 的配色由 L2 覆盖;尚不是 token 的,正确动作是
  **把它补成 token**(进 `CSS_VAR_MAP`,L2 顺势覆盖),而不是在 H3 开第二个
  颜色口 —— 两个口意味着两套冲突裁决,迟早对不上。
- 形**不进** L2。主题系统"不许主题定义圆角/字体"那条裁决**没有被推翻**:
  H3 绕开的是"主题**自由定义**形",不是"形可以被改"。区别在于
  **枚举档位、宿主执行** —— 插件递的是档位名,CSS 值由宿主查表得到。

这带来一个比 L2 更强的安全性质,值得单独记一笔:L2 的插件递进来的是一个
颜色**字符串**,于是需要一整套字面量白名单去挡 `url(` / `var(` / `;`;
H3 的插件递进来的是**档位名**,它永远不会出现在 CSS 里 —— 注入面为零,
不需要任何值的消毒。**新增旋钮时不要退回收自由值**,那会把这个性质丢掉。

声明形状(并进既有 `contributes.theme` 家族):

```jsonc
{ "contributes": { "theme": { "skin": { "bubbleRadius": "round" } } } }
```

治理**照抄 L2 一字不改**:不认识的旋钮 / 枚举外的档位 → 丢弃该键 + 目录投影里
标出,**绝不是加载错误**;多插件冲突按 pluginId 字典序 canonical order 后者胜;
装前确认页披露(与"改配色"分两句说)。

缺省档(`standard`)的 CSS 值是 **`null` = 不写变量**,不是"写一个等于现状的值"。
现状值只存在于组件 CSS 的 `var(--skin-*, 现状)` 兜底里那**一份** —— 于是
"没插件"与"选了 standard"逐字节相同是一条恒等式,而不是一条需要人去核对的巧合;
应用调整自己的默认值时,选 `standard` 的插件自动跟随。

**合成点**:皮肤变量与主题变量名**不相交**(`--skin-*` 前缀),没有任何东西从
皮肤变量派生,所以它可以安全地在主题算完之后合并进同一张出口表。这**不是**对
§6.1.1 那条教训的反例,而正是它的边界条件:颜色覆盖必须前移到 `resolveThemeUI`
之前,恰恰因为反过来 —— 派生层整片挂在颜色上。判据是"有没有下游派生",不是
"早合成总比晚合成好"。

### 3.4 动画

描述树**不可表达动画**(纯数据 + 宿主渲染,这是特性不是缺陷 —— 动画是
"执行"的一种,宪法第 1 条把它划给了宿主)。

宿主侧受限动画原语(二期,低风险):

- `progress` 节点的 indeterminate 态(宿主 CSS 动画,插件只声明状态);
- `list` / `tabs` 切换的宿主过渡(与内置面板同一套 Transition);
- badge/状态的进入退出(宿主统一)。

**完全自定义动画 = webview 专属**(L3)。这是"动画完全自定义"诉求的
唯一答案,必须在文档与插件指南里写清楚,避免插件作者在描述树里找动画
找不到而绕路。

---

## 4. L3:webview 逃生舱(配方,当前不排期)

### 4.1 前置条件(设计文档 §5 R5 已写,此处展开)

1. **R1 软隔离完成** ✓(已实施:`a3114b48`、`888a25e8`)
2. **独立 origin**:自定义协议 `onething-plugin://<pluginId>/<path>`,
   Electron `protocol.handle` 只服务插件目录内文件;禁目录穿越、禁 node
   能力。协议注册为 privileged(supportFetchAPI)。
3. **CSP 强制**:webview 面板的 HTML 响应带 CSP 头:
   `default-src 'none'; script-src 'self'; connect-src 'none'` ——
   iframe 内 JS 不能出网,通信唯一通道是 postMessage。
4. **postMessage-only**:host 与 iframe 之间只有 postMessage;
   iframe 不获得任何宿主对象(window.parent 访问被 CSP/sandbox 拦)。
5. **ui.\* token 注入**:host 生成一次性 token 注入 iframe,iframe 发消息
   必须带 token —— 防其他 iframe 冒充。

### 4.2 渲染容器

- Electron 侧:`<webview>` 标签已废弃;用 **WebContentsView** 或
  sandbox iframe + 自定义协议(推荐后者 —— 与 web 端同构,协议 host-neutral)。
- web 端:同款 sandbox iframe,协议换成宿主静态资源路径 —— 但方案 A
  下 web 端不跑插件,此路不通,记录在案。

### 4.3 通信协议(草案)

```
iframe → host:  { token, type: 'invoke', actionId, payload }
               { token, type: 'ready' }
host → iframe:  { requestId, type: 'render', tree | error }
               { requestId, type: 'result', result | error }
               { type: 'push', event: ... }   // 插件主动推送(二期)
```

- `invoke` 走既有请求通道 `panel:action:<panelId>`(或 `ui:action:...`),
  自动继承 30s 预算 / abort / progress / 熔断。
- render 结果 = 插件直接给 HTML?不 —— webview 面板的**内容由插件目录
  静态文件提供**(entry 声明 HTML 路径),render 通道退化为"初始化数据 +
  事件桥"。这保持了"声明先于代码":manifest 声明 entry,宿主就能渲染
  占位,加载失败也说得出。

### 4.4 排期归属(2026-08-09 修订:与 ext host 解耦)

本节初版把 webview 与 H 线(backend 子进程 ext host)绑成同一波
("同一波安全面加固的产物")。**2026-08-09 拍板推翻这个绑定**:两者是
独立的隔离面 —— webview 的插件**逻辑代码仍在 main 进程**(与描述树同一
执行模型),iframe 内只有插件目录的静态 HTML/JS,隔离靠独立 origin +
CSP + postMessage-only,与插件代码跑在哪个进程无关;真正的技术前置只有
R1 软隔离(已完成)。绑定是排期偏好,不是依赖。

修订后顺序:R5.x 跑透 L1 ✓ → B 期 L2 → **C 期 webview 单独落地**
(清单见 rollout 文档 §6.2),backend ext host 留在 H 线终局。

---

## 5. 红线:接管输入 / 替换宿主组件

用户诉求"接管输入状态 UI、改变 inputbox 样式"。**明确不做**:

- 替换 InputBox 本体 = 插件代码获得宿主核心交互控制权。输入框承载
  发送、引用、附件、语音、命令模式 —— 插件接管任何一个,宿主都失去
  对"用户如何与 AI 对话"的控制,宪法第 1 条(唯一通道)直接崩塌。
- "改变 inputbox 样式"的**合法路径**:L2 主题 token 覆盖(`bg.input` /
  `bg.inputFocus` 等 token 已存在,CSS_VAR_MAP 已映射)—— 改颜色可以,
  改结构不行。
- "显示当前执行状态"的**合法路径**:composer.above 锚点块(L1 描述树,
  现在就能做)—— 用户要的 plan 插件场景,不需要碰输入框本体。

**这个边界要在插件指南里写成人话**:你能在输入框**旁边**放东西,
不能进输入框**里面**。

---

## 6. 表达力决策表(插件作者视角)

| 我要做 | 用 | 例 |
| --- | --- | --- |
| 数据列表 / 表单 / 状态展示 | L1 描述树 | log-monitor 面板、plan 状态条 |
| 进度 / 徽标 / 多页签 | L1 v2(本期) | 任务进度、日志级别徽标 |
| 品牌色 / 全局换肤 | L2 token 覆盖(二期) | 企业插件 |
| 过渡动画 / 加载动效 | L2 受限动画原语(二期) | 面板进入、进度条 |
| 图表 / 编辑器 / 拖拽 / 任意动画 | L3 webview(H 线) | 数据可视化插件 |
| 接管输入框 / 消息列表 | **不做** | — |

---

## 7. 本设计的限制声明(诚实边界)

1. L1 永远追不上"任意 UI" —— 这是设计选择,不是缺陷;追不上的场景
   有 L3 接住。
2. L2 token 覆盖是全局的,多插件冲突靠"声明顺序后者胜" —— 没有
   per-block 样式隔离(那是 webview 的领域)。
3. L3 是 H 线后才开放 —— 在此之前"动画完全自定义"没有答案,文档
   必须明说,不能假装有。
4. 锚点块与面板共享描述树协议,但**容量语义不同**(composer.above
   单行 vs 面板整页)—— 插件要写"两种尺寸都好看"的树,或按锚点
   返回不同树(render ctx 里带 anchor 与 `sessionId: string | null`,
   一期就带上;宿主在会话切换时重拉)。
