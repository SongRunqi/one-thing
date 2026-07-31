# 房/私聊外壳重构 —— 汇报与偏移台账

**状态:代码全部落地,真机走查未做。2026-07-31。**
**读法:** §1 是这条线发生了什么;§2 是最终形态与落点;**§3 偏移台账是本文的主体** —— 设计怎么写的、实际怎么做的、为什么;§4 是白做与撤回;§5 是遗留与仓库债。

---

## 1. 时间线:这条线是怎么走的

| 阶段 | 事 |
|---|---|
| 选型 | 出四套**信息架构截然不同**的方案样稿(`docs/design/im-redesign/`):A 频道台(Discord)、B 收件箱(Telegram)、C 工作台(Slack/Linear)、D 舞台(无列表沉浸) |
| 第一次拍板 | 用户选 **D**,拍定"全 app 去侧栏 / 重面板全屏切换";设计文档 `im-stage-layout.md`;P0–P2 全量落地 |
| **改向** | 用户改选 **C**。D 的成果整体存到分支 **`design/im-stage-d`(`c3aa3b8d`)**,主线回退;C 从它那儿**取件**(纯逻辑几乎全可搬,作废的集中在三处视觉层) |
| C 期 | C0 外壳与开关 → C1 左栏以活为脊 → C2 账页流(**装反,已撤回**)→ C2′ say 聊天面 → C3-B 右栏线程(C3-A 活动线**已取消**) |
| **定义澄清** | 用户澄清「聊天」= 群聊/私聊**只展示 say**;工具卡/diff/执行步骤是"后台干活的内容",归右栏;直聊本身就是后台。这条推翻了我两处设计(见 §3.0) |
| 最终样板 | 用户从四套里挑块拼成 **`docs/design/im-redesign/final.html`**(C 的左栏 + C 的线程栏 + A 的消息流/输入框/成员列表/空间页),批准为**形态的唯一依据** |
| 去复用重构 | R1 房/私聊脱离旧壳(**已提交 `add6582f`**)→ R2 右栏补全 + 输入框皮相 → R3 清理 |

---

## 2. 最终形态与落点

```
左栏(常驻)          中栏(房/私聊)             右栏(App 级 dock)
以活为脊            房头(取代 TabBar)          线程 / 成员→空间页 / 看板
 进行中活卡片        say 消息流(只有 say)
 群聊               权限账页栏位
 同事               composer(InputBox messenger 形态)
 直聊
```

| 面 | 落点 |
|---|---|
| 外壳开关 | `settings.ui.shellMode: 'workbench' \| 'classic'`;`composables/useShellMode.ts`;`data-shell-mode` 根属性 |
| 左栏 | `components/sidebar/`:`active-work.ts` / `useActiveWork.ts` / `ActiveWorkCard.vue` / `ActiveWorkSection.vue` |
| 中栏骨架 | `components/chat/room/`:`RoomSurface.vue` / `RoomHeader.vue` / `room-head.ts` |
| 消息呈现 | `components/chat/say/`:`say-rows.ts` / `say-typography.ts` / `SayChatFlow.vue` / `SayMessageRow.vue` |
| 权限 | `components/chat/permission/`(**ChatPanel 与 RoomSurface 共用同一个组件**)+ `composables/usePermissionResponder.ts` |
| 右栏线程 | `components/workbench/ThreadWorkbench.vue` / `thread-entries.ts` |
| 抬出的共享件 | `composables/useHistoryPagination.ts` / `useCollabReactions.ts` / `useSceneLedger.ts` / `useCollabTyping.ts` / `components/chat/agent-activity.ts` / `message/speaker-runs.ts` |

**直聊 / 工程会话 / classic 一律走旧壳,逐像素不变**,均有测试钉住。

---

## 3. 偏移台账

### 3.0 我的两处设计错误(根因,不是执行偏差)

| # | 错在哪 | 后果 | 已怎么处理 |
|---|---|---|---|
| E1 | 把"执行呈现"算进了聊天面,于是设计里写了「活动线逐行摊在中栏」(原 W3) | C3-A 照此开工 | 用户澄清后**整档取消**,执行细节全部归右栏;C3-A 启动即停,无产出 |
| E2 | 账页排版(92px 署名列)本该服务"多人说话的场",却被写成通用形态 | C2 把它做在**直聊/普通会话**上,方向装反 | **整体撤回**,直聊回到现状;可复用的两件(排版退让闸、`speaker-runs`)保留 |

两次都是文档写错、agent 照做。作废原因已写进 `im-workbench-layout.md` 对应小节,防止有人照旧段落再做一遍。

### 3.1 方案 D 期(在 `design/im-stage-d` 分支上)

| # | 设计怎么写 | 实际怎么做 | 为什么 |
|---|---|---|---|
| D-1 | P0「停靠侧栏分支**整删**」 | 关进 `classic` 分支,不删 | 同文档 §5 又要求 classic 能完整回滚,两条互斥;按回滚闸走,真删留给收尾期 |
| D-2 | 只规定 `⌘\` | `⌘B` 在 stage 下也等价开合抽屉 | 否则 TabBar 上那颗折叠按钮点了没反应 |
| D-3 | — | `⌘\` 在 classic 下显式 no-op | "classic 一个像素不变"按"一个行为也不加"执行 |
| D-4 | — | 钉住态加一道描边 | `⌘\` 按第二下若毫无反馈,钉住功能对用户不可见 |
| D-5 | Q3 建议直聊驾驶舱整体上移人物条 | **只上移模型/think**,ctx 量尺与权限档留在 composer | ctx 拖着约 80 行按轮计算状态;权限档绑着 InputBox keydown 里的 `Shift+Tab`。分界是"这轮的状态 vs 这个会话的身份" |
| D-6 | 「不改 tab 的任何行为」 | TabBar 仍渲染成员条 → 造成人物条与 TabBar **同一批人画两遍** | agent 守纪律不敢动;**由我补** `identityOwnedByStageBar` prop 修掉(只让身份不让动作) |
| D-7 | 人物条右段:未读 + 搜索 + 面板入口 + ⌘K 提示 | **只留未读徽标** | 搜索与面板入口已在 TabBar 右侧;⌘K 提示在 P4 之前是空头支票 |
| D-8 | 「署名 = 头像 + 名字 + 时间」 | 我方署名**不带头像** | 普通会话里"用户头像"这个概念根本不存在,凭空造是产品决策不是排版活 |
| D-9 | 阅读列收窄 | `--content-measure` **下沉到 `.chat-panel`** 作用域,不改全局 `:root` | 全局那枚会话外也有人读;要的是"舞台的阅读列"不是"全 app 的测量" |
| D-10 | 一屏 ≥12 条 | 单行消息 17 条,**两行消息只有 11 条** | 没有为了凑数字继续压行高(12.8/1.7 是明文规定);差额记在测试注释里 |
| D-11 | 文档 S1 写「抽屉从人物条下方起(`top: 96px`)」 | 改为 `--shell-drawer-top` 变量 | S1 写于"人物条是窗口级"时,S7 已把它定成 panel 级,窗口顶部没有全宽条;**这是我自己埋的矛盾,派单前修掉** |
| D-12 | — | 未读徽标点击走 `openShellDrawer` 而非 toggle | 抽屉已钉开时再点徽标不该把它关上;**由我补** |

### 3.2 方案 C 期

| # | 设计怎么写 | 实际怎么做 | 为什么 |
|---|---|---|---|
| C-1 | 从 D 取件 | D 的抽屉半套(`isSidebarDockedVisible` / hover trigger / `⌘\` / `--shell-drawer-top`)**不取** | C 要常驻左栏,取进来就是死代码 |
| C-2 | — | 发现 `mergeWithDefaults` 漏 `storage`/`evals`,**不修**,加漏键审计测试 | 一修就会让开关突然生效:写过 `sessionFormat:'legacy-json'` 的人当场回退存储格式。要单独排期单独验证(详见 §5) |
| C-3 | 形态判定统一走 CSS 门 | 左栏第一区的判定用 **JS** | CSS 门关得掉渲染,关不掉一次 IPC(第一区带取数) |
| C-4 | — | 第一区多一道 `roomsEnabled` 门 | `apps/web` 没有 rooms 协调器,否则那边常驻一行永远为空的"没有在跑的活"还白发请求 |
| C-5 | 状态标:`blocked` → 待审批 | 多一档:**`doing` 且尾条工作会话有未决权限 → 也报待审批** | 样板里"等你放行 bash"正是这种卡;信号取既有 `hasPendingAsk`,不新增账 |
| C-6 | 卡片带「进度条」 | 改成**四档阶段刻度**(assigned/started/producing/delivered) | 系统不知道"干完了 72%";进度条这个词是我用松了 |
| C-7 | 四区重排 | 用 CSS `order`,不写两套模板 | classic 下这些声明一条不生效,三区实现零改动 |
| C-8 | 跨房聚合 | 「已加载 + 广播白拿 + 一次定向补齐」(候选从内存会话列表推导、截 8 间、`requestIdleCallback` 串行) | 拒绝"启动时把每间房 board 全量 load"。代价明写:极端情况冷启漏一张卡,直到开房或广播落地 |
| C-9 | 「在 ChatPanel 内部把消息列表换成新树」 | 分流门放在 **`MessageList` 内部** | `ChatPanel` 的权限栏位通过 ref 调 `MessageList.confirmTool/rejectTool`;整个换掉 `MessageList` 会断掉房间里的审批 —— 撞 W6。(此偏移在 R1 被正式化解:权限件抬成共享组件) |
| C-10 | `@我` 加左墨条 | 判据换成「这条 agent 消息**引的是我说的话**」 | `ChatMessage.mentions` 只装 agent 身份,用户在房里没有 roster id;不做正文文本猜测 |
| C-11 | 复用 `room-grouping` | 只复用它的 **`capsules`**,**不用 `groupHeads`** | `groupHeads` 只在 `assistant && 同 agentId` 之间合并,用户连发的两条各自成头;方案 A 的合并是按说话人的。署名口径统一走 `speaker-runs` |
| C-12 | — | `context-compact` 系统消息整行不画;`GoalSummaryCard`/大纲轨不进新树 | 引擎记账不是聊天;goal 与大纲轨是直聊的概念 |
| C-13 | 线程步号 = 全局连续(33/34/35) | 步号落在**执行级**(01/02) | `StepsPanel` 不接受起始步号,改它是禁区;步级编号要么改它、要么 CSS counter 穿透 scoped 子树(有 `container-type` 困住 counter 的旧坑) |

### 3.3 去复用重构 R1

| # | 设计/样板怎么写 | 实际怎么做 | 为什么 |
|---|---|---|---|
| R1-1 | 样板把右栏画在房面里 | **不另起第二根右栏**,复用 App 级 `RightWorkbenchPanel` | 否则两条右栏并排;房面只回答"这间房该看哪条线程",且**只在右栏已开着时**才派事件——窄窗上不许由房面把右栏顶开,那会架空按窗宽的默认策略 |
| R1-2 | 房头两颗图标(搜索 + ⋯) | **三颗**(多一颗线程栏开合) | 三栏壳里右栏开合是高频动作,埋进 ⋯ 不合适 |
| R1-3 | 权限栏位"迁移" | 抬成**共享组件**,`ChatPanel` 与 `RoomSurface` 消费同一个 | 比"新写一份对齐旧的"更强:"一个字段没变"成为结构保证而不是逐条比对 |
| R1-4 | composer 外观按样板 | **本期未做**,留给 R2 | 改它要动 `InputBox` 样式,撞"不重写"铁律且 InputBox 与直聊共用;安全出口是房独有的 `.composer-toolbar[data-profile='messenger']` |

### 3.4 R2 右栏补全 + 输入框皮相

| # | 设计/样板怎么写 | 实际怎么做 | 为什么 |
|---|---|---|---|
| R2-1 | 样板 composer 三颗图标(附件 / ＋ / 麦克风) | **两颗**(附件 + 麦克风) | messenger 形态下「＋」没有对应动作;凭空加按钮就不是皮相而是行为(撞铁律 5) |
| R2-2 | 占位符 `发送到 #浏览器重构` / `给小林发消息` | **R2 未做**,留给 R3 | 它是 `InputBox` 的 `composerPlaceholder` computed,CSS 够不着;改它要动 InputBox,R2 明令禁止 |
| R2-3 | — | 私聊房头头像点击仍开**全屏**空间页 | R2 未获授权改;与 say 署名头像的"下钻右栏"不一致,**已交 R3 归一** |
| R2-4 | 空间页优先复用既有组件 | **呈现层新写,数据层整条复用** | 既有的是 `AgentsPanelContent.vue`(3026 行全屏 master-detail),塞不进 330px 右栏;计数走既有 `buildAgentHistory`,深面「文件/配置」点一下去既有全屏页 |
| R2-5 | — | `RoomMemberStrip` 加 **opt-in** prop `openSpaceOnClick`(左键下钻、名册管理退到右键) | 默认档(旧壳 TabBar)一个字节不变,新面才 opt-in |
| R2-6 | — | `openMembers` 全局只找 `type === 'members'`,**不按 sessionId 去重** | 逛三间房也只有一条页签;换房只换靶子不加页签 |

一处**没有偏移但值得记**的实现纪律:members tab 的"在忙"判定**不传 `requireWorkSession`** —— 那个选项是「点得开线程」的场合(私聊房头徽标)专用的;左栏活卡片这一档,没开过工作台的 `doing` 卡照样算在忙。两处口径靠这一个开关区分,已有测试钉住。

### 3.5 R3 清理与收口

| # | 要求怎么写 | 实际怎么做 | 为什么 |
|---|---|---|---|
| R3-1 | `InputBox` 的 `placeholder` prop「有值即覆盖 computed」 | 放在**最后一档**:录音中 `Listening...` / 转写中 `Transcribing...` / 放歌时 `♪ 歌词` 三种**活状态**仍然优先 | 房里也会录音,把实时反馈顶掉是行为回归而不是外观对齐 |
| R3-2 | 私聊房头头像点击口径归一 | 统一成下钻右栏;全屏降级分支保留但**结构性不可达** | 私聊态由 `session` 推出,`session` 又要 `props.sessionId`,拿不到房 id 的分支到不了。留着只为与 say 行逐字同口径,并加测试把这个结构事实钉住 |
| R3-3 | 线程步号(样板画的是全局连续 33/34/35) | 仍是**执行级 01/02** | `StepsPanel` 不接受 `startIndex`,改它是禁区(C3-B 已提接口需求,未做) |
| R3-4 | — | **退让闸失联**:`RoomSurface.flowStyles` 无条件写 `SAY_METRICS` | R1 把房面移出 `MessageList` 时,长在旧壳上的那道闸没跟过来;R3 拆死门时暴露。**已由我修**:接回 `shouldUseSayTypography`,补两条测试(显式调过字号→整档退让 / 仍是出厂默认→档照常生效) |

R3-4 的连带修正两条(都是我做的):

- 三个 `RoomSurface.*.test.ts` 补 `@/stores/settings` mock —— 真 store 在**模块作用域**读 `localStorage`,测试里直接引会在 import 阶段炸。这个坑本次踩过两回(Sidebar 一回、这里一回),已写进注释。
- `say-typography.test.ts` 里逐字比对整行 import 的断言改成正则(只钉「数值来自 SAY_METRICS 这张表」)。逐字断言会把「再引一个 `shouldUseSayTypography`」这种正当增补误判成回归 —— **过紧的测试也是债**。

**交接时纠正过的一处误解**(记录在案,防止以后有人照 R2 报告原话动手):R2 交接说"`MessageList` 的 `is-room` 分组在房路径空转,是 R3 的活"——**这句是错的**。`classic` 下房会话仍走旧壳(分流条件带 `shellMode==='workbench'`),所以旧壳里所有 room 分支在 classic 下都是活代码,删了就等于废掉回滚闸。真正死掉的只有 `MessageList` 里那道 `saySurfaceActive` 门。

---

## 4. 白做与撤回清单

| 东西 | 结局 | 代价 |
|---|---|---|
| 方案 D 的 P0–P2 | 整体改向,存 `design/im-stage-d` | 视觉三处作废(去侧栏 / 人物条 / 43rem 阅读列);纯逻辑四件全部取件复用 |
| C2 账页排版 | 整体撤回 | `MessageItem` / `MessageBubble` / `variables.css` 零 diff 回到 HEAD;保留两件可复用逻辑 |
| C3-A 活动线 | 取消,启动即停 | 无产出 |
| C4 三档过滤 | 取消 | 未开工。它是为"活动线在中栏"配的闸,活动线走了就没有要闸的东西 |

---

## 5. 遗留与仓库债

**本次发现、有意未修的:**

1. **`mergeWithDefaults` 白名单漏键**(`packages/shared/defaults/settings.ts`):`merged` 是逐键重建 + `return merged as AppSettings`,那个 `as` 掩盖了漏键。`storage` / `evals` 从来没被列进去 → **CLAUDE.md 写的 `settings.storage.sessionFormat='legacy-json'` 回滚开关是死的**;`evals.*` 同理。已加漏键审计测试(断言被丢弃的键恰好是这两个),第三个漏项一出现就红。**修它要单独排期**:修完那一刻,写过 legacy-json 的用户会真的回退存储格式。
2. **`CLAUDE.md` 技术栈表过期**:写着 `Virtual Scroll | @tanstack/vue-virtual`,但该依赖已不在 `package.json`,`VirtualTable` 是手搓的且只用于表格;`MessageList.vue` 里 `estimateSize=150` 的注释是同时代残留。**消息列表从来不是虚拟滚动**(`Scrollbar` 里的朴素 `v-for`)。
3. **pre-existing 红**:`app/agents/__tests__/profile.test.ts`(群聊工具白名单多了 `bash`/`dm`)、`app/tools/builtin/__tests__/file-revalidation.test.ts`(报错文案变了)。全程未碰。
4. **pre-existing lint**:`ChatContainer.vue` 的 `FrameRequestCallback is not defined`、`RightWorkbenchPanel.vue` 的 `Duplicate key 'workspaceRoot'`。

**接口需求(提出但未做):**

- `StepsPanel` 需要 `focusStepId` / `expandStepIds`(中栏点某一步 → 右栏高亮到那一步)与 `startIndex`(线程里的全局连续步号)。C3-B 提出,没有擅自改。

---

## 6. 验证状态

- `bun run typecheck`:**绿**(node + web)。
- `npx vitest run packages/renderer packages/shared`:**209 文件 / 1855 测试全绿**。
- `bun run boundary:gate`:**0 条新增失败**(26 条已知;另有 2 条 baseline 已自愈,可考虑重录)。
- **真机走查:一次都没做过** —— 全程禁止 agent 起 dev server / electron,所以**这套 UI 至今没有任何人用眼睛看过**。

真机走查的四个落点:

1. **左栏最上方有没有「进行中」分区** —— 这是"改动是否生效"的试纸。注意 `roomsEnabled = platformApi.capabilities.collabRooms` 在 **web 端为 false**,那边第一区整个不挂。
2. **打开一间群聊房或私聊房**(不是直聊)看新面:无 TabBar、无 SidePanel、署名合并、composer 皮相。
3. **右栏**:线程 / 成员(点人下钻空间页) / 看板;窗口 ≥1400px 默认展开。
4. **切 `settings.ui.shellMode: 'classic'` 验回滚**:一切回到改造前 —— 这是整条线唯一的安全绳,必须真机确认它还有效。
