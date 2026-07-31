# 工作台式外壳(方案 C):以活为脊 + say 聊天面 + 线程常驻

**状态:仅设计,2026-07-31。** 视觉样稿 `docs/design/im-redesign/c-workbench.html`(四方案对比见同目录 `index.html`)。
**前置阅读:** `docs/design/agent-im-chat-ui.md`(messenger 形态)、`docs/design/agent-domain-model.md`(同事/在场四面模型)、`docs/design/multi-agent-collab.md`(看板与工作卡)。
**定位:** 只管**外壳形态**——左栏导航、消息流排版、右栏落位。消息内容渲染(markdown/工具卡/diff)与引擎零改动。

---

## 0. 宪法(用户已拍板)

| # | 决定 |
|---|------|
| **W0** | **整体走方案 C**,不与方案 D 并存 |
| **W1** | 左栏**第一区是"活"不是"对话"**:进行中的卡片(名字 + 负责人 + 状态 + 进度),对话列表降到它下面 |
| **W2** | 中栏**只展示 say**(群聊/私聊),走一棵新组件树,排版取方案 A 形态;后台执行不进聊天面 |
| **W3** | 右栏**常驻**:线程 / 看板 / 空间 |

一句话:**跟一群 agent 说话,本质是在盯一堆活——所以先看活,再看话。**

---

## 1. 与方案 D 的关系:哪些取件,哪些作废

方案 D(舞台式外壳)的 P0–P2 已完整落地,**存放在分支 `design/im-stage-d`(提交 `c3aa3b8d`)**,主线已回退。C 从它那儿取件而不是从零开始:

| D 的产出 | 在 C 下 | 说明 |
|---|---|---|
| `settings.ui.shellMode` + classic 回滚闸 | **取件** | 档位换成 `'workbench' \| 'classic'`,机制与测试原样搬 |
| `data-shell-mode` 根属性门控 | **取件** | C 的聊天面同样要门控,classic 逐像素不变 |
| `agent-activity.ts`(`findAgentDoingTask`) | **取件** | 正是左栏活卡片与在场状态要的"这个人在忙什么" |
| `useStageScenes`(未读/在忙场聚合) | **取件** | C 的左栏未读点与"在忙"计数同一口径 |
| `speaker-runs.ts`(连续合并署名) | **取件** | 方案 A 的署名合并按说话人走,正是这套 |
| `useCollabTyping`(打字信号) | **取件** | 卡片"正在执行"与账页流的进行中态 |
| `--chat-measure-cap` 拆分 | **取件** | 保住窄窗 `@media` 特异性的那道手法照用 |
| 去侧栏 / 浮层唯一化(P0 主体) | **作废** | C 要常驻左栏 |
| StageBar 人物条 + compact 档 + drawer-top 事件(P1 主体) | **作废** | C 没有顶部人物条;在场靠左栏卡片头像与右栏 |
| 43rem 阅读列收窄 + 15px/1.85 排版档(P2 主体) | **作废** | C 反着来:不收窄,高密度 |

**净结论:纯逻辑层几乎全部可搬,作废的集中在三处视觉层。** 取件方式:从分支 cherry-pick 或直接复制文件,不要凭记忆重写。

---

## 2. 现状勘察 —— C 的工作量比 D 更小

1. **左栏本来就是常驻的。** `App.vue` 的 `sidebarDockedVisible` → `SplitterPanel` 分支现成,C **不动布局只重排内容**(D 当初要删的正是这条)。
2. **右栏基建现成。** `RightWorkbenchPanel` 已有 tab 机制,`WorkbenchTabType = 'files' | 'file' | 'terminal' | 'browser' | 'review' | 'board'`(`RightWorkbenchPanel.vue:226`),开合由 `App.vue` 的 `inspectorOpen` / `workbenchMounted` / `workbenchRevealed` 管。**C 要做的只是加一个 `'thread'` 类型 + 默认常驻打开。**
3. **"活"的数据面全现成。** `CollabTask`(`packages/shared/ipc/collab.ts:28`)已带 `status`(`backlog|todo|doing|review|done|blocked`)、`assigneeAgentId`、`workSessionIds`、`report.evidence.toolCounts/files`、`updatedAt`。左栏卡片的名字/负责人/状态/进度**一个字段都不用新增**。
4. **权限审批已经在会话里**(`ChatPanel.vue:43` 的 `session-permission-panel`,账页栏位)。样稿把审批画在右栏,**实施不照做**——见 W6。
5. **消息列表不是虚拟滚动。** `MessageList.vue` 是 `Scrollbar` 里的朴素 `v-for`;`@tanstack/vue-virtual` 已不是依赖,`VirtualTable` 是手搓的且只用于表格。改行高/密度不涉及任何测量表。(顺带:`CLAUDE.md` 技术栈表里"Virtual Scroll | @tanstack/vue-virtual"与 `MessageList.vue:823` 的 `estimateSize=150` 注释都是过期残留。)

---

## 3. 已定形态(W1–W7)

### W1 左栏:以活为脊

自上而下四区,**顺序即优先级**:

| 区 | 内容 | 数据源 |
|---|---|---|
| **进行中** | 卡片:标题 + 负责人头像 + 状态标(执行中/待审批/已交付)+ 进度条 | `collabBoard` 的 `CollabTask`,取 `status ∈ {doing, review, blocked}`;进度由 `workSessionIds` 与 evidence 推导 |
| 群聊 | 现有群房行 + 成员头像堆 + 未读墨点 | 现有 selector |
| 同事 | 联系人行(含 retired 灰显墓碑) | 现有 selector |
| 直聊 | 工程会话列表,**降为最后一区** | 现有 selector |

- 卡片点击 = 打开该卡对应的房 + 右栏切到该卡的线程。
- **状态标只有三种呈现**:执行中(绿)/ 待审批(橙)/ 已交付(墨)。`blocked` 归入待审批档并带 `blockReason` 的 title。
- 未读与"在忙"计数复用 `useStageScenes`(取件自 D 分支),**不新起口径**。
- **四区在同一个滚动容器里**(R4,真机走查后的要求):不是"只有会话列表能滚、其余平铺撑着",而是四区一起滚,脚栏钉在滚动区之外。会话列表因此交出它的内部滚动。
- **四区都可折叠**(含「进行中」),折叠态持久化在 localStorage 一个键里;「进行中」没有在跑的活时**整区不显示**(见 §7)。

### W2 中栏:聊天面 = 只展示 say 的新组件树

**「聊天」的定义(2026-07-31 用户澄清,本文按此为准):群聊与私聊里,聊天面只展示 agent `say` 的内容。**
say 里本来就会有表格、代码、列表——**markdown 必须留着**。而工具卡、diff、执行步骤这些"某个 agent 后台干活的内容"**根本不是聊天**,它们的归属是右栏线程(W4),那儿复用既有 UI。

因此中栏走**一棵新的组件树**,而不是给既有 `MessageItem` 再加分支:

| | 新聊天面(群聊/私聊) | 既有组件树(直聊/工程会话) |
|---|---|---|
| 渲染什么 | say 正文(markdown)、署名、附件、引用 | 全套:工具卡、StepsPanel、diff、图片生成、权限账页栏位… |
| 为什么分开 | 只有 say 的面不该背着后台执行那一整套分支 | 直聊**本身就是后台**,它需要那些 |

**排版走方案 A(频道台)那一套**(样稿 `docs/design/im-redesign/a-channels.html`),不是账页栏位:

- 头像 30px 在左,**署名行在上**(名字带身份色 + 角色徽标 + 时间),正文在下。
- **连续消息合并署名**:同一人短时间内的后续消息不重复头像与署名;复用 `speaker-runs.ts`,时间窗与房间时间胶囊的关系不变(必须短于胶囊)。
- **不带气泡、不左右横跳**;我方消息与他人同一排版,只在署名与底色上区分。
- `@我` 的那条加一条左墨条;系统行居中细线。
- 宽度不收窄,吃满 panel;窄窗 `@media` 降级照旧。

**分层(C2′ 实施时定的一条边界)**:新树是**消息呈现层**,不是列表外壳。
`MessageList.vue` 继续持有滚动跟随/锚点、历史分页、权限审批桥
(`confirmTool`/`rejectTool` 被 `ChatPanel` 的权限账页栏位按 ref 调用)、导航轨;
分流门就写在它身上(`saySurfaceActive`),两棵呈现树互斥挂载。
把整个 `MessageList` 换掉会把权限桥一起换掉 —— 那是 W6 明令不动的东西。
新树的行仍然带 `data-index` / `data-message-id`,锚点与跳转逐字段照旧命中。

> **已废弃**:本文早先版本的「92px 固定署名列 + 细横线 + 12.8px/1.7 高密度账页流」。C2 曾按它把账页排版做在**非房间**会话(直聊/普通会话)上——方向装反了(账页署名列是为"多人说话的场"设计的,而直聊只有两方且需要工具卡),该改造整体撤回,直聊回到现状。

### W3 执行细节:不进聊天面

**本文早先版本的「活动线逐行摊在中栏」已废弃。** 它把后台执行摊进了聊天面,与 W2 的「聊天只有 say」冲突。

- 执行细节**全部在右栏线程**(W4),复用既有 `StepsPanel / ToolStepDetails / DiffView` 渲染链。
- 中栏最多留**一个入口**:`展开执行 →`,派 `onething:open-thread` 事件(契约见 W4)。拿不到 `workSessionId` 就不画这个入口,不要派空事件。

### W4 右栏:常驻三 tab

- `RightWorkbenchPanel` 加 `'thread'` tab:某次执行会话的步骤流(步号 + 动词 + 目标 + 耗时 + 真 diff),底部一个"在这条线程里回复"的输入框。
- **workbench 模式下右栏默认展开**(`inspectorOpen` 初值按 shellMode 推导),宽度默认 330px,可折叠。
- 三 tab = 线程 / 看板 / 空间。看板从 `'board'` tab 原地留用(不迁全屏——那是 D 的取向);空间 = Agent 空间页,沿用现有 `openAgentSpace` 落位。

### W5 顶部三档过滤:**已废弃**

原设计的 `全部 / 只看说话 / 只看我` 是为"活动线摊在中栏"配的信息焦虑闸。W3 改掉之后**聊天面本来就只有 say**,这道闸没有了要闸的东西,整档取消。
(若将来真出现"消息太多想只看自己"的诉求,那是独立的过滤需求,与本方案无关。)

### W6 权限审批:不动

样稿把审批画在右栏排队,**实施不照做**:审批已经是 `ChatPanel` 的账页栏位,按 toolCallId 应答,就在你说话的地方。搬到右栏等于把"待你动作的事"挪出视线主轴,是退步。右栏只承载"已发生的执行"(线程)。

### W7 在场呈现

C 没有人物条,在场分三处落地,**同一份数据三种粒度**:

- 左栏活卡片:负责人头像 + 状态标(谁在干什么活)
- 群聊行:成员头像堆 + 未读墨点(房里有谁)
- 右栏线程:当前执行的实时步骤(此刻在干什么)

数据一律取自 `findAgentDoingTask` + board + roster,不新增第四套。

---

## 4. 待拍板(W-Q1–W-Q3)

| # | 问题 | 建议 | 何时定 |
|---|------|------|--------|
| **W-Q1** | 左栏"进行中"取哪些状态 | `doing` + `review` + `blocked`;`todo` 不进(那是待办不是在做),入口在看板 | C1 开工前 |
| **W-Q2** | 右栏默认展开会不会太挤(1200px 以下) | 按窗宽:≥1400 默认展开,否则默认收起但保留入口。用 `@container`/`@media` 一档判定 | C0 |
| ~~W-Q3~~ | ~~活动线默认展开到什么粒度~~ | **作废**:活动线不进聊天面(W3),没有粒度可定 | — |
| **W-Q4** | 新聊天面覆盖哪些会话 | 群聊房 + 私聊房(单成员 dm)+ agent 互聊 pair 房;**直聊/普通会话仍走既有组件树** | C2′ 开工前 |

---

## 5. 分期落地

| 期 | 内容 | 依赖 | 验收要点 |
|---|------|------|---------|
| **C0 外壳与开关** | 从 `design/im-stage-d` 取件 `shellMode` 机制(档位改 `'workbench' \| 'classic'`,默认 workbench)+ `data-shell-mode` 门控 + `useStageScenes` / `agent-activity` / `speaker-runs` / `useCollabTyping` 四件逻辑;右栏按 W-Q2 决定默认展开 | 无 | classic 逐像素回滚可用并有测试钉住;取件的四件逻辑连同其测试一起进来,不重写 |
| **C1 左栏以活为脊** | "进行中"卡片区(标题/负责人/状态标/进度)+ 四区重排;卡片点击 = 开房 + 右栏切线程 | C0 | 卡片状态与看板一致(同一 store,不另存);未读/在忙与 `useStageScenes` 同口径;classic 下左栏原样 |
| ~~C2 账页流~~ | ~~92px 固定署名列 + 细横线 + 密度档~~ | — | **已落地并已整体撤回**(W2 说明):方向装反了,账页排版做在了直聊/普通会话上。撤回时保留了两件可复用逻辑:「用户排版设置退让闸」(已随 C2′ 搬进 `chat/say/say-typography.ts`,`ledger-density.ts` 已删)、`speaker-runs.ts` |
| **C2′ 新聊天组件树** ✅ | 群聊/私聊的 say-only 聊天面:新的列表 + 条目 + 正文渲染(markdown 保留)+ 署名合并 + 附件 + 引用;排版走方案 A 形态;中栏只留一个「展开执行 →」入口 | C0 | **已落地**:新树在 `packages/renderer/components/chat/say/`(`say-rows.ts` 纯投影 + `say-typography.ts` 排版档 + `SayChatFlow.vue` + `SayMessageRow.vue`);分流门 = `MessageList.vue` 的 `saySurfaceActive`(`kind==='room'` && workbench),直聊/工作会话/classic 一律留在既有 `MessageItem` 树上,两棵树永不同时挂载;markdown / 滚动锚定 / 附件 / 引用 / 表情 / 身份全部复用既有链路 |
| ~~C3-A 活动线~~ | ~~活动线逐行摊在中栏~~ | — | **已取消**(W3):执行细节不进聊天面。启动后即停,无产出 |
| **C3-B 右栏线程** ✅ | `RightWorkbenchPanel` 新增 `'thread'` tab(复用 StepsPanel/DiffView 渲染链)+ 事件入口 + 左栏活卡片入口 | C1 | **已落地**:193 文件 / 1763 测试绿;审批未进右栏(W6) |
| ~~C4 三档过滤~~ | ~~全部 / 只看说话 / 只看我~~ | — | **已取消**(W5):聊天面本来就只有 say,没有要闸的东西 |
| **C5 收尾** | 快捷键总表、classic 开关去留、死 CSS 清理、`CLAUDE.md` 过期条目(虚拟滚动)一并修正 | C0–C3 | `bun run typecheck` + 全量测试绿 |

---

## 6. 风险与回滚

- ~~**信息焦虑是 C 的固有风险**(活动线永远在)~~ —— **已消解**:W3 改掉后执行细节根本不进聊天面,聊天面只有 say,无需闸门(W5 因此整档取消)。
- **两棵呈现树的长期成本**:房/私聊走新树、直聊走既有 `MessageItem` 树。两棵树共用 `MessageList` 这层外壳(滚动/分页/权限桥),但呈现层各自演进——新增消息类型时要想清楚它属于"聊天"还是"后台",否则会出现只在一棵树上支持的元素。
- **右栏常驻吃 330px**:1200px 以下的窗口会明显憋屈,W-Q2 的按窗宽默认值是必须项而不是优化项。
- **回滚闸** = `settings.ui.shellMode: 'classic'`,与 D 同款,C0 落地时一并做。
- **D 分支不要删**:`design/im-stage-d` 是取件源,也是"若 C 真机不如 D"时的回头路。
- **不在范围**:引擎、权限内核、apps/server;`apps/web` 共用 `packages/renderer`,C 的形态同步生效,C0 起在浏览器过一遍。

---

## 7. 开放问题

- ~~**左栏"进行中"为空时**(没有任何活在跑)第一区是留空还是塌陷?倾向塌陷成一行"没有在跑的活",否则常态是一块空白。C1 真机后定。~~
  **已定(2026-07-31,真机走查后用户拍板):没有在跑的活时「进行中」整区不显示。** 旧的"塌陷成一行"倾向被推翻 —— 一行永远在那儿的说明文字既不提供信息,又占着左栏最贵的那段视线;活来了这一区自然长出来,活没了它就该消失。判定落在 `packages/renderer/components/sidebar/sidebar-sections.ts` 的 `shouldShowActiveWorkSection`(挂载与否仍是 `Sidebar.vue` 的 `isWorkbenchShell && roomsEnabled` 两道门 —— 那一层带着一次看板取数,CSS 与内层 `v-if` 关不住一次 IPC)。
- **活动线与工具卡的关系**:现有消息里的工具卡(StepsPanel/ToolStepDetails)与新的活动线是两种呈现同一批数据,C3 要决定是替换还是共存(倾向:活动线替换掉行内工具卡,细节全部去右栏)。
- **多房并行时左栏卡片的排序**:按 `updatedAt` 还是按房分组?倾向前者(活是主体,房是属性)。

---

## 8. 去复用重构(2026-07-31 定,样板已批准)

**样板:`docs/design/im-redesign/final.html`** —— 四块拼成一面:C 的左栏 + C 的线程栏 + A 的消息流/输入框/成员列表/空间页。**样板是这次实施的唯一形态依据**,与本文早先段落冲突时以样板为准。

### 8.1 这次改的是什么

前面 C0–C3 是「在旧壳上加门控」,代价是 TabBar 与 SidePanel 拿不掉。这次**房与私聊整体脱离旧壳**:

```
旧:  ChatWindow → TabBar + ChatPanel(→ MessageList → say 树) + ChatSidePanel
新:  ChatWindow → RoomSurface(房头 + say 流 + composer + 权限栏位 + 右栏三 tab)
     直聊/工程会话:原样走旧壳,一个字节不动
```

### 8.2 这一面上被拿掉的东西(样板末节)

TabBar header · ChatSidePanel · 行内工具卡/StepsPanel/diff/图片生成卡 · AgentSelector/模型选择/think 档/ctx 量尺 · GoalStatusBar/大纲导航轨/练习条。

### 8.3 铁律

1. **权限账页栏位必须随 R1 同期迁移。** 位置(中栏底部、composer 上方)与语义(按 toolCallId 应答、scope 档位)**一个像素/一个字段都不许变**,只换实现属主——旧壳的权限桥是 `ChatPanel` 通过 ref 调 `MessageList`,新面不再经过它们,所以必须自带。**没有它的中间版本不许存在**(房里审批会断)。
2. **不许出现"两套聊天面同时挂载"**;分流在 `ChatWindow` 层,`kind === 'room' && shellMode === 'workbench'` 走新面,否则旧壳。
3. **classic 逐像素回滚仍然成立**——classic 下永远走旧壳。
4. **组件级复用照旧,壳级复用禁止**:markdown 渲染链、滚动跟随/锚定 composable、附件/引用/表情组件、`ThreadWorkbench`、`CollabBoardPanel`、`displayAgent` 身份解析——这些继续复用;被禁的是"套在旧壳里"。
5. **composer 不重写**:沿用 `InputBox` 的 messenger 形态(IME 三重护栏/草稿/附件/录音/@提及/slash 都在里面),外观按样板图对齐即可。

### 8.4 分期

| 期 | 内容 | 验收要点 |
|---|------|---------|
| **R1 新面骨架** ✅ | `ChatWindow` 分流 + 房头(群/私聊两态)+ say 流从 `MessageList` 提出 + composer + **权限账页栏位**(铁律 1)+ 滚动跟随/锚定/历史分页;右栏容器先只做「线程」tab(挂既有 `ThreadWorkbench`) | **已落地**:分流 = `ChatWindow.vue` 的 `roomSurfaceActive`(`kind==='room' && shellMode==='workbench'`,`v-if`/`v-else` 级);新面 = `chat/room/{RoomHeader,RoomSurface}.vue` + 纯投影 `room-head.ts`;审批栏位抬成 `chat/permission/PermissionLedger.vue`(旧壳与新面**共用同一个组件**,零字段差异不靠比对)+ `RejectReasonDialog.vue` + `usePermissionResponder`;分页抬成 `useHistoryPagination`(阈值与锚点还原逐字不变),跟随/锚定直接复用 `useFollowScroll` / `useMessageScrollCoordinator`;composer 沿用 `InputBox`(未改本体,它自己在 room 会话切 messenger 形态);右栏**不另起一根** —— App 级 `RightWorkbenchPanel` 已有 `thread` tab 与 ≥1400 默认展开,房面只在右栏已开时落座默认线程。**遗留**:composer 外框仍是蓝图框(样板是圆角 12px + 深色圆形发送),要动就得改 `InputBox` 自己的样式(hook 现成:`.composer-toolbar[data-profile='messenger']`),留给视觉一轮 |
| **R2 右栏补全** | 「成员」tab(样板图2:在忙/空闲/已注销)+ 点成员**下钻**空间页(样板图4,带返回)+ 「看板」tab(复用 `CollabBoardPanel`);私聊态 tab 集合为 线程/空间/看板 | 三 tab 与下钻可用;成员数据与左栏活卡片同口径(`findAgentDoingTask` + roster) |
| **R3 清理** ✅ | 撤掉 `MessageList` 的 `saySurfaceActive` 分流门与 C2′ 的挂载残留;房/私聊路径上的旧壳死代码;文档与样板对齐 | **已落地**:①`MessageList` 的 `saySurfaceActive` + `SayChatFlow` 挂载 + 聊天面排版档(`shouldUseSayTypography` / `SAY_METRICS`)整段拆除,DOM 断言搬到 `RoomSurface.say.test.ts`;②样板占位符落地 —— `InputBox` 新增可选只读 prop `placeholder`(不传即从前那句,直聊零变化并有测试钉住),房面按 `buildComposerPlaceholder` 给「发送到 #房名」/「给小林发消息」;③私聊房头头像口径归一为**下钻右栏空间页**(与中栏 say 署名头像同一条),降级规则同 say 行;④`CLAUDE.md` 虚拟滚动条目与 `MessageList` 的 `estimateSize` 注释按事实改写。**注意:`MessageList` / `ChatPanel` / `TabBar` 里所有 room 分支都是活代码** —— classic 下房会话仍走旧壳,那是逐像素回滚闸,一条都不许清 |
| **R4 左栏按样板重构** ✅ | 统一滚动容器 + 各区可折叠(含「进行中」)+ 「进行中」空态整区隐藏 + 撤掉平铺 dock(功能收进脚栏「⋯」)+ 群聊行成员头像堆 | **已落地**:①四区收进 `.sidebar-sections` —— classic 下它是 `display: contents`(不生成盒子,排版逐像素不变),workbench 下才成为**唯一**的滚动体;`SessionList` 同期交出内部滚动(`overflow: visible` + 解开 `contain: strict`,否则那一段会塌成 0 高),不出双滚动条;②四区(进行中/群聊/同事/直聊)分区头即折叠钮,折叠态一个 localStorage 键(`onething:sidebar-sections-collapsed`),纯逻辑在 `sidebar-sections.ts`;classic 不读折叠态;③「进行中」无活整区隐藏(见 §7);④平铺 dock 只留在 classic,workbench 换成样板的脚栏 —— 五个工作区面板收进「⋯」菜单(复用 `ContextMenu`,清单直接吃 `workspaceActions`,少一项就是少一个进不去的面板),设置照旧单列一枚;⑤群聊行成员头像堆复用房头成员条那一处 `buildRoomMemberEntries`(墓碑口径一并继承),截前三枚 + `+N`;⑥**顺带挖出 C1「order 一直是死规则」的真因** —— `@vue/compiler-sfc`(3.5.26)会把 `:global(X) .y` **静默截断成 `X`**:那五条 `:global(html[data-shell-mode='workbench']) .sidebar-content > .xxx { order: N }` 编译出来是 `html[data-shell-mode='workbench'] { order: N }`,声明扣在 `<html>` 头上,四区一条都没碰到。**不是**「父级不是 flex」(`.sidebar-content` 是 `Space` 的根,`.app-space--vertical` 本来就是 flex 列;`Space` 也只在传了 `spacer`/`fill` 时才包 `.app-space__item`,侧栏两者都没传,四区一直是直接子)。形态门一律改写成 `html[...] .xxx`(祖先是 `html` 时不需要 `:global`,scoped 只给最后一个复合选择器补 `[data-v-xxx]`,作用域仍在),并加了两条围栏测试(禁 `:global(X) 后代`、order 选择器必须指向 `.sidebar-sections >`)。同一写法在 `packages/renderer/components/common/SplitterPanel.vue:145` 还有一处,不在本路改动面内 |
