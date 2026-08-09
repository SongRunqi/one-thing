# 输入区带系统(composer bands)设计(2026-08-09)

> 起因:真机反馈"电台条和 composer.above 插件带冲突、输入区表达能力有限"。
> 盘点发现冲突只是切面 —— 消息列表与光标之间最多可叠 **7 层各自为政的横条**,
> 三套系统(内置状态条 / 插件锚点 / 草稿 dock)各有各的显隐逻辑、间距、字号,
> 层序是历史顺序不是设计。已拍板:**带系统 + chips 收敛**(2026-08-09,
> 三档方案中的最深一档)。

## 1. 现状(问题即清单)

```
MessageList
├ 1. UiSlotHost chat.status-bar   插件块带(R5.x)
├ 2. BackgroundJobsStatusBar     内置,整行,v-if running>0
├ 3. GoalStatusBar               内置,整行,带就地编辑(objective/budget)
╭─ InputBox composer-stack
├ 4. UiSlotHost composer.above   插件块带(R5.x)
├ 5. composer-dock               队列/引用/附件(TransitionGroup,最多再叠 3 行)
├ 6. composer-anchor             MusicStatusBar(926 行,hover 展开浮层,
│                                 --music-bar-reserve 占位)+ 语音/命令帧标签
╰ 7. composer                    输入区 + 工具条
```

结构性问题:
- **语义错位**:MusicStatusBar 是全局播放状态,却物理长在输入框骨架
  (composer-anchor)里;真正属于骨架的只有语音/命令**帧标签**。
- **一态一整行**:后台任务、目标各占一整行,两三个状态同时活跃时输入区
  上方糊一摞条。
- **三套视觉语法**:内置条、插件块、dock 行的间距/字号/分隔各自为政。

## 2. 四带模型(从远到近)

| 带 | 内容 | 住址 | 形态 |
| --- | --- | --- | --- |
| **S 状态带** | 后台任务、目标、电台、插件 chat.status-bar 块 | ChatPanel(MessageList 之下)= 现 chat.status-bar 位置 | **一行 chips**,空态零高度 |
| **P 插件带** | composer.above 插件块 | InputBox composer-stack 顶部(现状) | 不动 |
| **D 草稿带** | 队列/引用/附件 | composer-dock(现状) | 不动(跟草稿走,贴近输入框) |
| **F 帧带** | 语音/命令帧标签 | composer-anchor(现状) | 不动;**music 标签角色退役** |

裁决理由:P/D/F 的语义本来就对(插件内容 / 草稿上下文 / 帧状态),错的只有
S 一族 —— 三个内置整行条 + 电台寄居骨架。所以本战役**只重整 S 带**,
P/D/F 零改动,爆炸半径可控。

## 3. S 带:chip 语法

### 3.1 chip 壳(共享组件,组件化而不是创建新组件的"新")

一个 `StatusChip` 壳组件统一:高度(24px)、字号、内边距、圆角、分隔、
hover 态 —— 全走既有 ui token,过 `bun run ui:gate`。**成员保留各自的
Vue 组件与全部交互**,只是内容装进壳、展开态改为从 chip 弹出的浮层
(遵守 docs/design/ui-system.md 浮层决策树,与既有浮层同 z-index 层级表)。

### 3.2 成员迁移表

| 成员 | 收起态(chip) | 展开态(flyout) | 迁移要点 |
| --- | --- | --- | --- |
| BackgroundJobs | `⚙ N jobs` | 现整行内容(逐 job + 端口) | v-if running>0 逻辑不变,只换形态 |
| Goal | `🎯 <目标名> · 进度` | 现整行内容,含 objective/budget 就地编辑 | 编辑交互整体进 flyout,不降级 |
| Music(电台) | `♪ <曲名>`(播放中才出现) | **现 926 行组件的展开面板整体保留**,重新锚定到 chip | 从 composer-anchor 迁出;`--music-bar-reserve` 占位机制退役;composer-frame-label 的 music 分支(showsMusicTag 一族)退役 |
| Context(上下文,**不进 S 带**) | —(住工具条驾驶舱,现状:`ctx ▮▮▯▯▯ 41%` 格子仪表,InputBox L251 起) | **增强既有仪表**:点击弹明细浮层 —— 窗口占比进度条 + 分项(历史/工具定义/附件/系统提示)+ 自动压缩阈值说明 + "立即压缩"(走既有 compact 命令) | 勘误(2026-08-09):本文初版误判"上下文没有任何 UI"并给 S 带新建了 context chip —— 实际 `context-meter` 已在工具条工程驾驶舱(模型/ctx/think/guard 一族),再造一个是重复。裁决:仪表留在驾驶舱,E 期只加"点击 → 明细浮层"(hover 的既有 Tooltip 保留);分项数据源:context-compact 统计口径 + provider 窗口大小 |
| 插件块(chat.status-bar 锚点) | 描述树直接以 chip 壳渲染 | 无(树自身就是内容;要展开的插件走 D 期 trigger) | **锚点契约零变化**:容量 8、24px、row 树 —— 本来就是 chip 形状 |

### 3.3 规则

- **空态零高度**:无任何活跃成员时 S 带不渲染(现三条各自 v-if 的行为守恒)。
- **顺序**:内置成员写死(jobs → goal → music),插件块按全局规范顺序排后。
- **溢出**:超宽横向滚动(共享 Table 的 overflow-x 判例),不换行。
- **过渡**:chip 进出用既有 Transition token;不做位移动画(FLIP 判例:
  composer 区域跳变过 FLIP,见 project_composer_sidebar_glide)。
- **浮层必须 teleport**(demo 实测判例,2026-08-09):S 带是横向滚动容器,
  `overflow-x: auto` 会连带把纵轴也变 auto,绝对定位在带内的浮层直接被
  剪没。展开浮层走 Tooltip 同款 Teleport-to-body + 锚定定位,不留在带内。
- **chip 入口是 `<button>`,浮层是它的兄弟**(demo 实测判例):浮层里有
  真按钮(停止/编辑/播放控制),嵌在入口 `<button>` 里会被 HTML 解析器
  强闭外层、内容全部溢出 —— 入口与浮层必须是兄弟节点,包一层定位容器。

## 4. 不做 / 红线

- 不把内置成员降级成描述树(审计已裁决:专属交互降级损失 UX)。
- 不动 P/D/F 三带;不动消息列表;不新开插件锚点(S 带对插件的面就是
  既有 chat.status-bar,契约不变)。
- RoomSurface(协作房)的 BackgroundJobsStatusBar 同步换 chip 形态,
  但协作房不挂插件块(现状守恒)。

## 5. 排期与验收(E 期)

- **E1** chip 壳 + S 带容器(ChatPanel 侧),jobs/goal 迁入。
- **E2** 电台迁入:MusicStatusBar 锚定改造、reserve/帧标签 music 分支退役、
  InputBox composer-anchor 瘦身。
- **E3** 插件块接入 chip 壳(UiSlotHost chat.status-bar 换壳,锚点协议零改)。
- **E4** 走查:三成员单独/并存/全空;电台 hover 展开、音量、up-next 全交互;
  goal 就地编辑;多窗口;深浅主题;`ui:gate` 无新红;既有测试全绿。

与 D 期(trigger 锚点)的关系:**E 先 D 后**,两者都动 InputBox 一带的
文件,不并行(用户当前优先级在输入区观感)。

## 6. 落地状态(2026-08-09)

E1–E4 已提交(`d21d9e0a` / `d4f28329` / `ee996456` / `9b6595c5`),全量
7914 测试绿、双闸无新红。**与本文规格的偏差(review 已裁决接受)**:

1. **S 带住址**:规格写 ChatPanel 的 MessageList 之下,实际落在
   **composer-container 内**(现 jobs/goal 位置)—— 那里吃得到
   `--chat-composer-width` 测量列,chip 左沿与输入框对齐(demo 的样子),
   且随 teleport 的 composer 走。代价:面板 `active=false` 时插件块随
   `v-show` 隐藏(此前常显),已注释登记。
2. **电台 chip 出现条件**:规格"播放中才出现"照字面会删掉唯一的开台入口
   (原常驻 RADIO 帧标签)。守恒为 **`configured` 即显**:播放中显曲名 +
   脉冲点,空闲显「电台」;未配 ncm-cli 的用户一枚不显,空态零高度对
   多数会话仍成立。
3. **电台 hover/held 双态原样保留**(未降级为点击展开):expanded 改
   chip 自持,held 的指针几何判定与 250ms 行程宽限一字未动,量尺换浮层
   根元素;点击 = 固定/解除。退役的只有"固定即预留高度"。
4. **ctx 明细只画真拿得到的数**:窗口大小 / 本轮送入 / 累计输入·输出·
   合计 / 会话计费 / 压缩阈值与开关。设计稿的「历史 / 工具定义 / 附件 /
   系统提示」四分项**没有统计口径**(compact 按轮次切,不按来源记账),
   一行未画且测试钉死"不许出现" —— 要补需在 provider 请求组装处加按
   来源的 token 记账,另立一期。
5. goal chip 的进度用真数据(`run N` / `retry N` / 状态词),demo 的
   `n/m` 任务计数不存在。
6. jobs 浮层 Refresh 挪到摘要行右侧(交互不变)。

真机走查清单见实施报告(10 条,含电台全交互、窄窗溢出滚动、协作房、
多窗口)。
