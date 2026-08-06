# 一个产品，两种形态 —— 对话 / 协作，外壳照 ChatGPT 收敛

> 状态：**U0 / U0b / U1 / U2 / U3 / U3b / U4 / U5 全部已实施（未提交）**。2026-08-05 起，2026-08-06 收口。
> 触发：用户要求「把老模式的 session 聊天和群聊/私聊变成一个产品的两种形态，参考 ChatGPT；
> 老模式整体照 ChatGPT 布局，tabheader 取消多 tab，取消关闭 tab 后关窗口的行为」。

---

## 0. 一句话

**形态 = 左栏装什么 + 「新建」建什么；呈现永远由 `session.kind` 推。**
外壳（左栏 / 会话头 / composer 底盘 / 右栏工作台）收敛成一套，消息树保持两棵。

---

## 1. 先划边界：统一什么、不统一什么

「一个产品的两种形态」这句话有两种读法，必须先钉死是哪一种。

### ✅ 要统一的：外壳

| 面 | 今天 | 改后 |
|---|---|---|
| 左栏 | rail 四格（消息/进行中/通讯录/会话）+ 面板 | 单列 + 顶部形态下拉（ChatGPT 位） |
| 会话头 | 直聊走 `TabBar`（多页签），房走 `RoomHeader` | 一条 `SessionHeader`，右侧动作按 kind 增减 |
| 输入区 | `InputBox` 一个底盘两个 profile | 不变（本来就是一套） |
| 右栏 | `RightWorkbenchPanel` 对所有会话都在 | 不变（本来就是一套） |
| 窗口/拖拽区 | `TabBar` 兼任 titlebar | `SessionHeader` 原样继承 |

### ❌ 不统一的：消息树

`ChatPanel`（MessageItem 树）与 `RoomSurface`（say 树）**不合并**。这不是偷懒，是四条结构性事实：

1. **房会话永不起流。** `stream-engine.ts:138` 的 room ingress gate 把房内用户消息落库 + emit 后直接 `return`，回合跑在 `kind='agent'` 的执行会话里，`say` 再写回房。所以「生成中/停止/steering/排队追问」这套直聊的核心状态机在房上整个不成立，`RoomSurface` 的停止钮是硬关的（`allow-stop-action="false"`）。
2. **编辑重发被引擎显式拒绝。** `stream-engine.ts:212` `emitCollabRefusal`「群聊房间不支持编辑重发」——重放会用当前 persona 而非原作者。
3. **消息实体字段集不同。** 房消息带 `agentId`（署名）/ `mentions` / `replyTo` / `reactions` / `collabSourceMessageId`；直聊一条都没有，也没有「消息有作者」这个概念。
4. **房的可见流 ≠ 落库流。** `filterRoomMessages` 丢掉协调器 drive、pass 轮、流式中的 agent 消息；直聊是恒等映射。

ChatGPT / Codex 本身也正是这样：**同一个壳，正文完全不同构**（Codex 的正文是 diff 和任务卡）。强行合并只会得到一个满是 `if (isRoom)` 的巨型组件——而那正是今天 `MessageList` 里刚拆掉的东西。

---

## 2. 现状：三条正交的门叠在一起

今天决定「你看到什么」的有三个互不相关的开关：

| 门 | 位置 | 值 | 语义 |
|---|---|---|---|
| G1 内容形态 | `session.kind` | `chat` \| `room` \| `work` \| `agent` | 这条会话是什么（`shared/ipc/chat.ts:137`） |
| G2 外壳回滚闸 | `settings.ui.shellMode` | `workbench` \| `classic` | 逐像素回滚（`composables/useShellMode.ts:32`） |
| G3 宿主能力 | `platformApi.capabilities.collabRooms` | desktop=true / web=false | 有没有协调器（`platform/web.ts:25`） |

**直接后果：房今天有两套渲染。** 唯一分流门是 `ChatWindow.vue:24` 的
`kind==='room' && shellMode==='workbench'`——classic 下的房走的是旧壳（`TabBar` + `MessageList` + `TabBar:148` 里那条 `RoomMemberStrip`）。任何本次改造的动作，在 classic 那一侧都要再做一遍。

私聊没有独立 kind：私聊 = `kind='room'` + `room.dm`，群/私由人数决定（`isUserDmRoom` / `isAgentPairDmRoom`，`collab/dm.ts:29`）。

---

## 3. 目标形态

### 3.1 对话形态（老模式，照 ChatGPT）

```
┌──────────────────────┬────────────────────────────────────────────┐
│ ●●●  onething ▾   🔍 │  📁 你用go帮我写一个…            ⋯   ⊞  ▤ │  ← SessionHeader(单会话，兼 titlebar)
├──────────────────────┼────────────────────────────────────────────┤
│ Pinned            ›  │                                            │
│                      │            (消息流 · MessageItem 树)        │
│ Projects             │                                            │
│ 📁 start-electron    │                                            │
│    看下这个问题…      │                                            │
│    tool call ui…     │                                            │
│ 📁 netease           │                                            │
│    修复触发动作…      │                                            │
│                      ├────────────────────────────────────────────┤
│ 未归类               │  ┌──────────────────────────────────────┐  │
│    …                 │  │ 说点什么                              │  │
│ Show more            │  │ ＋  🤖 Agent   模型 ▾   think ▾  🎤 ↑ │  │
├──────────────────────┤  └──────────────────────────────────────┘  │
│ (YS) yitian song   ⚙ │                                            │
└──────────────────────┴────────────────────────────────────────────┘
```

好消息：左栏的分组**今天已经是这个形状**。`useSessionOrganizer.getProjectGroupedSessions`
（`:430`，生产唯一消费者 `Sidebar.vue:1151`）的口径就是「置顶 → 各项目（label = `workingDirectory` 末段）→ 未归类」= Pinned / Projects / 其他。差的只有三样：**文件夹图标行、Show more 截断、底部用户条**。

### 3.2 协作形态（群聊 + 私聊）

```
┌──────────────────────┬────────────────────────────────────────────┐
│ ●●●  协作 ▾       🔍 │  # 浏览器重构   主题…      👤👤👤  看板 ⚙ │  ← 同一条 SessionHeader，右侧按 kind 换
├──────────────────────┼──────────────────────────────┬─────────────┤
│ 进行中               │                              │ 线程 成员    │
│  ▸ 浏览器重构 · 小林 │      (say 流 · SayChatFlow)   │ 看板 调度    │
│  ▸ 电台改版 · 阿澈   │                              │             │
│                      │                              │  (右栏常驻) │
│ 消息                 │                              │             │
│  # 浏览器重构    ●   ├──────────────────────────────┤             │
│  小林                │  ┌────────────────────────┐  │             │
│  # 电台改版          │  │ 发送到 #浏览器重构      │  │             │
│                      │  │ 📎          🎤    ↑    │  │             │
│ 同事              ＋ │  └────────────────────────┘  │             │
├──────────────────────┤                              │             │
│ (YS) yitian song   ⚙ │                              │             │
└──────────────────────┴──────────────────────────────┴─────────────┘
```

两个形态左栏**刻意不同构**：协作形态第一区仍是「活」（`im-workbench-layout.md` W1 宪法，
2026-07-31 用户拍板「跟一群 agent 说话本质是在盯一堆活」）。Codex 的左栏也不是对话列表而是任务列表——这恰好证明形态之间左栏可以不同构。

---

## 4. 六条设计决定

### D1 —— 形态是「列表过滤器 + 新建默认值」，不是「呈现开关」

```
formMode: 'chat' | 'collab'     ← 左栏装什么、＋建什么
session.kind                     ← 主区画什么（不受 formMode 影响）
```

**为什么必须这样切**：如果形态直接决定呈现，从协作形态搜到一条老直聊、点开就会画错。
更实际的理由是 **`kind` 已经存在，不需要给 session 加字段**——而给 session 加字段会撞上本仓最阴的一个坑（见 §6.1）。

`formMode` 只影响两件事：
- 左栏渲染哪一棵（对话 = `getProjectGroupedSessions(filteredSessions)`；协作 = `buildRecentEntries` + `useActiveWork` + 同事名册）
- ＋ 建什么（对话 = `createSession`；协作 = `RoomCreateDialog` / `ensureCollabDmRoom`）

点开任何会话，主区一律 `kind==='room' ? RoomSurface : ChatPanel`。**跨形态点开会话时，`formMode` 自动跟随**（点开一条房 → 切到协作形态），这样左栏永远反映"你在哪儿"。

### D2 —— 退役 `shellMode: 'classic'`，这是第一步

classic 是 C 期（2026-07-31）落地时设的逐像素回滚闸。今天它已经**事实上不可回滚**：C 之上叠了 D0–D7 的 Actor v3 大 break（净删 v2 链 14575 行），回退到 classic 的房走旧壳，而 Actor v3 的 say/drive 语义只有新壳画得对。

留着它有三个代价：本次改造每一条都要做两遍；它同时占用了「形态」这个词的第二个含义，与新切换器同名不同物；`useActiveWork`、`sidebar-sections`、`MessageList:337`、`TabBar:148`、`ChatPanel` 的 CollabTypingLine gate 各挂着一条 classic 分支。

退役动作是**净删**：`resolveShellMode` 恒返回 `'workbench'` → 删 `data-shell-mode` 的 classic CSS 分支 → 删旧壳里所有 `isRoomSession` 分支。

### D3 —— `TabBar` → `SessionHeader`：删的是页签条，不是这一层

`TabBar` 今天兼任 titlebar，这些职责必须**原样继承**，不能顺手丢：
- 整条 40px `-webkit-app-region: drag`
- 侧栏收起时 84px 交通灯保留位 + 寄宿 `SidebarActionGroup`（三颗按钮必须是 drag 元素的**真实子孙**，Chromium 只让子孙用 no-drag 挖洞——这是 `feedback_electron_drag_region` 那条教训的落点）
- 右侧动作全套：dm 身份块 / `RoomMemberStrip` / 看板 / 房设置 / `AgentSelector` / 回父会话 / 分栏 / 等宽 / 侧面板 / 工作台 / ⋯ 溢出菜单

`ChatHeader.vue` 是前 tab 时代的这个组件，**今天全仓零引用（死代码）**——可以当骨架翻新，但它的右侧动作已过时，要搬 `TabBar` 那一套。改完 `RoomHeader` 也并进来（它今天是 TabBar 的平行替代）。

**resource tab 的去处**：`TabBar` 今天还装文件 tab（`openFileTab`）。取消 tab 后文件回右栏工作台的 `files` / `file` 页签——那本来就是它的家。这是一条净收敛，不是搬迁成本。

### D4 —— workspace store v2 → v3：leaf 从「tabs[]」退化成「单会话」

`stores/workspace.ts` 那棵树（leaf / split / tabs / activeTabId）是为多 tab + 分栏建的。取消 tab 后：

```ts
// 今天
WorkspaceLeaf { type:'leaf', id, size, tabs: ChatTab[], activeTabId }
// 改后
WorkspaceLeaf { type:'leaf', id, size, sessionId: string | null }
```

不变式 I1–I4 收敛成两条：**每个 leaf 恰好一条会话（或空）**；**split ≥2 子**。
`openSession` 从「加一个 tab 并激活」变成「就地换靶子」。唯一那条
`watch(activeSessionId) → switchSession`（`workspace.ts:333`）**结构不变**——这是整个数据流的脊梁，不能碰。

**分栏（split）保留。** 左右两条会话对着看（对比两个 agent 的回答、一边看执行一边聊）是这个产品的真实价值，ChatGPT 没有是因为它没有这个需求。取消的是「一个格子里叠很多会话」，不是「屏幕上只能有一个格子」。

> ⚠️ 迁移不能只 bump 版本号：`workspace-persistence.ts` 的 `hydrate` 只认 `version===2`，
> 版本不匹配会**静默丢掉所有 tab**。v3 reader 必须能读 v2 存档（每个 leaf 取 `activeTab` 那一条，其余丢弃），并保留 v1 legacy 那条路径。

### D5 —— 取消「关最后一个 tab 就关窗口」，顺带取消「关闭会话」

`ChatWindow.vue:315-325`：store 拒绝清空最后一个 leaf 的最后一个 tab → 回退成
`platformApi.closeWindow()`。这是 macOS ⌘W 语义的收尾。

改后：
- **⌘W 恢复标准语义 = 关窗口**（由主进程菜单接管，不再经过会话逻辑）
- **「关闭会话」这个动作整个消失**。ChatGPT 里没有它——会话不是文档，没有"关掉"这回事，只有归档/删除（`archiveSession` 已存在）。
- 关掉最后一条会话（通过归档/删除）→ 落到**空态**（"开始新对话"），不是关窗。`ChatContainer.vue:26` 的 empty-state 已经在了，翻新皮相即可。

### D6 —— 形态切换器吃掉 rail 四格，存 localStorage

切换器落在**左栏顶部**（ChatGPT 原位），今天的 rail 整条消失：

| 今天 rail | 改后归属 |
|---|---|
| 「会话」 | → **对话形态**的整个左栏 |
| 「消息」 | → 协作形态的「消息」分段 |
| 「进行中」 | → 协作形态的「进行中」分段（第一区，W1 宪法） |
| 「通讯录」 | → 协作形态的「同事」分段 + ＋ 新建入口 |
| rail 底部 ⋯ / ＋ / ⚙ | → ⋯ 与 ⚙ 进**底部用户条**；＋ 上提到形态下拉旁 |

信息架构上这是本方案最大的收益：**今天要在 4 个 rail 类别之间点来点去，改完只有 2 个形态。**

**存哪**：`localStorage`（照 `SIDEBAR_RAIL_STORAGE_KEY` 的先例）。「我停在哪个形态」是本机视图偏好，不该跨端同步；而且 web 端只有一个形态，跨端同步反而会把 web 拽到一个不存在的形态。

**web 降级**：`capabilities.collabRooms === false` → 只剩「对话」一项 → **不画切换器**（单项下拉是死控件）。判定写死在一个纯函数里，照 `resolveRailCategories` 的先例。

> 旁注：`docs/design/sidebar-spaces/spaces-mockup.html` 是一份**从未实施**的「空间切换器」样板（全仓零引用），立意与本方案的切换器高度重合，但它选的是「一个空间一棵分栏树、workspace 升 v3」。本方案**不采纳**那条路——空间是"一件事的工作现场"，形态是"产品的哪一面"，两者正交；把它们焊在一起会让 v3 存档同时背两个语义。样板留着，日后要做空间可以在形态之内再切。

### D7 —— 形态 = 一个完整的工作现场（每形态一棵工作区树）

> 2026-08-05 真机发现的缺口，**修正了 D1 的一半和 D6 的一句**。

D1 只写了单向跟随 `session.kind → formMode`（点开一条房 → 左栏切到协作）。反向的 `formMode → session` 漏了：切到对话形态，主区还停在上一个形态的那间房。用户原话：「如果是协作形态，那么这个 chat window 应该就是显示协作形态的内容」。

根因是**归属放错了层**：D6 说 formMode 是「本机视图偏好，存 localStorage」，那是把它当侧栏的私事。它现在决定主区显示哪条会话、哪棵分栏树是活的——**归属必须在 workspace store**（落点仍是 localStorage）。

形状：

```
workspace store
├── formMode: 'chat' | 'collab'          ← 归属在这里，不在 Sidebar
├── roots:         { chat: Tree, collab: Tree }
└── activeLeafIds: { chat: id,   collab: id   }
     ↑ root / activeLeafId 是 computed，指向当前形态那一棵
```

- **切形态 = 换整个工作现场**：会话与分栏布局一起换，切回来原样还在。
- **`openSession` 自己认形态**：打开一条房先切到协作再落座。它是「打开会话」的唯一入口（`switchSession` 内部也调它），所以跟随判定挂在这一处就不会漏——不必在搜索窗 / 唤醒 / `openAgentSpace` / 建完私聊后导航各写一遍。
- **目标形态一条会话都没有 → 空态屏**，不凭空拉一条进来（那还会顺手把它标成已读）。
- **`closeSession` 要扫两棵树**：会话删了/归档了，不能在另一个形态的树里留一个指向不存在会话的空壳。

> ⚠️ 落地时踩到的一条：`formOfSession` 一开始在 `kind` 缺省时返回 `null`（＝别动），但 **`SessionKind` 缺省即 `'chat'`**（`shared/ipc/chat.ts:137` 的零回归设计，老会话没这个字段）。判成 null 的后果是老直聊被留在协作那棵树上。只有**真的查无此会话**才该返回 null。

---

---

## 5. 分期

每期可独立提交、独立真机验证、独立回滚。

### U0 · 退役 classic 回滚闸 —— 净删 ✅ 已完成（2026-08-05）

原计划一期做完，落地时拆成 **U0（JS/契约层）** 与 **U0b（CSS 层）** 两个提交。拆的理由是特异性：CSS 里有 ~60 条 `html[data-shell-mode='workbench'] …` 的门，解开会把选择器从 (0,2,1) 降到 (0,1,0)，足以翻转既有的 CSS 平局。把它和 JS 删除混在一个提交里，一旦像素动了就没法二分。

**U0 已做：**

- 删 `ShellMode` / `UISettings` / `settings.ui` 整段（`shared/ipc/settings.ts`、`shared/defaults/settings.ts` 的 `DEFAULT_UI_SETTINGS` + `normalizeUISettings` + 两处 merge、两份 re-export）
- `composables/useShellMode.ts` → `useInspectorDefault.ts`（`resolveShellMode` 删除，只剩右栏初值）
- 三个纯函数摘掉 `shellMode` 入参：`resolveInspectorDefaultOpen`、`shouldUseSayTypography`、`resolveRoomPanelTarget`
- 分流判据收敛成 `kind === 'room'` 一条：`ChatWindow.vue` 的 `roomSurfaceActive`、`ChatContainer.vue` 的 `activeLeafOnRoomSurface`
- `RightWorkbenchPanel` 删 `shellMode` prop；`App.vue` 删 `shellMode`/`isWorkbenchShell` computed 与 watch
- `Sidebar.vue` 删全部 9 处 `isWorkbenchShell` 门：classic 专属的顶部「＋ 新会话」与平铺胶囊 dock 整块删除，rail / 面板头 / 组头 / ⋯ 菜单转为无条件
- `data-shell-mode="workbench"` 降级为**常量属性**（挂载时写一次，不再由设置驱动）

**验收结果：** `typecheck` 绿；`bun run test` 7192 passed / 1 skipped，853 文件全绿；`ui:gate` 70 known, none new；`boundary:gate` 27 known, none new；改动文件的 eslint 输出与改前逐字节相同（2 error + 4 warning 全部先于本次存在）。

### U0b · 解 CSS 形态门 —— ✅ 已完成（2026-08-06）

原估「~60 条」是把注释也数进去了，**实际只有 14 条**（Sidebar 12 + SessionList 2）。

- 解开 12 条 `html[data-shell-mode='workbench'] .sidebar-*`：只脱掉门，规则本身一字未动
- 删 classic 那份 `display: contents` 基线——它是解门后唯一会打成 (0,2,0) 平局的对手，删掉平局就不存在了
- 删已无 DOM 的 CSS：`.sidebar-dock*`（含深色变体）、`.sidebar-newchat`、`.sidebar-rooms-header/-label`
- 删根属性 `data-shell-mode` 本身（`App.vue`）
- **SessionList 那两条不是解门而是删**：「会话列表交出内部滚动」是给「会话」还是 rail 一格时准备的（那时列表住在 `.sidebar-pane` 里，面板才是滚动体）。U3 之后它只在对话形态渲染，宿主 `.sidebar-chat-pane` 不滚，**列表得把滚动拿回来**，否则对话形态的左栏根本滚不动。

> 特异性验算（这是拆 U0/U0b 两个提交的全部理由）：解门后 `.sidebar-pane .sidebar-rooms[data-v-x]` 是 (0,3,0)，基线 `.sidebar-rooms[data-v-x]` 是 (0,2,0)，仍然赢；裸的 `.sidebar-split/.sidebar-pane/.sidebar-sections` 在删掉 `display: contents` 之后没有对手。SessionList 那两条本来就排在基线之后，源序也站得住。

### U1 + U2 · 单会话头 + workspace v3 —— ✅ 已完成（2026-08-05，合并为一次改动）

原计划 U1 先让页签条隐身、store 不动，留一个像素检查点。落地时**合并了**：页签条一消失，`selectTabByIndex` / `closeActiveTab` 就在操作看不见的页签，这个中间态比检查点本身更糟。

**做法：不新写组件，把 `TabBar.vue` 就地改造成 `SessionHeader.vue`** —— titlebar 的三件事（40px drag / 84px 交通灯位 / 侧栏收起时寄宿 `SidebarActionGroup`）逐字继承，diff 读起来是「删」。

两个让工作量大幅缩水的发现：

- **`resourceTabs` 早就是死码**：`leaf.tabs` 类型是 `ChatTab[]`，`createChatTab` 是唯一构造器，`openFileTab` 直接 `emit('open-file')` 走 App 级右栏 —— 文件页签从没进过 workspace 树。原计划的「迁右栏」是不存在的工作。
- **TabBar 里所有房 UI 也是死码**：TabBar 只在 `kind !== 'room'` 时渲染，而 dm 身份块 / `RoomMemberStrip` / 看板 / 房设置全 gate 在 `kind === 'room'` 上。U0 之后恒不可达，随组件一起删。

落地清单：

- 新 `SessionHeader.vue`（标题 + 双击改名 + 冷标记 + agent 执行会话头像章；右侧动作与分档 full/mid/slim 照旧）；删 `TabBar.vue` / `TabItem.vue` 及三个 TabBar 测试
- `workspace-tree.ts`：`WorkspaceLeaf.tabs[]/activeTabId` → `sessionId`；删 `createChatTab` / `activeTabOf`
- `workspace.ts`：`openSession` 改**就地换靶子**；`tabsOf`/`activeTabIdOf`/`activateTab`/`isLastRemainingTab`/`closeTab`/`moveTab` 退役；`hasAnyChatTab`→`hasAnySession`，`closeSessionTabs`→`closeSession`；不变式 I1–I4 收敛成两条
- `workspace-persistence.ts`：v3 writer + **v2/v1 reader**（v2 每格取当时的当前页签，其余丢弃）
- 删 `ChatWindow.vue:315-325` 的 closeWindow 回退；⌘W 交还主进程菜单（菜单项 `Close Tab`→`Close`，仲裁仍先给渲染层，因为内嵌浏览器是唯一还有真页签的面）；「关闭会话」动作整个下线
- ⌘1..9 随多页签退役（`useShortcuts.ts`），键位留白

**验收结果：** `typecheck` 绿；`bun run test` **7226 passed / 1 skipped**，855 文件全绿；`ui:gate` 70 known, none new；`boundary:gate` 27 known, none new；eslint 只剩 2 个先于本次存在的 error。

> 踩到并已修的一条：`ui:gate` 拦下 6 条 `title-attr` —— 从 TabBar 抄来的 `title=` 是被基线豁免的旧代码，新文件必须走 `Tooltip` + `aria-label`。基线只剩 70 条，容错极小。

### U3 · 形态切换器 —— ✅ 已完成（2026-08-05）

**口径按你 2026-08-05 的拍板改了**：原计划让协作形态把 rail 四格「摊平成三段叠着」，落地时改成 **rail 原样保留、只搬走「会话」那一格**。

改口径的理由：翻历史发现方案三（rail + 单类面板）当初正是为了替掉「四区平铺」而做的（`sidebar-sections.ts`：「分区折叠…在方案三下由**类别切换**替代，整套已删」）。摊平等于把已经否掉的形状搬回来一半。

最终形状：

```
对话形态                          协作形态
┌──────────────┐                 ┌──┬───────────┐
│ 对话 ▾       │                 │  │ 消息 ▾    │   ← 形态切换器
├──────────────┤                 ├──┼───────────┤
│ (会话表)     │                 │▪ │ (消息)    │   ← rail 三格 + 面板
│  Pinned      │                 │▫ │           │      原样保留
│  Projects    │                 │▫ │           │
│  …           │                 │  │           │
├──────────────┤                 │⋯ │           │
│ ⋯  ＋      ⚙ │                 │＋│           │
└──────────────┘                 │⚙ │           │
                                 └──┴───────────┘
```

- 新纯函数模块 `sidebar-form-mode.ts`：`SidebarFormMode = 'chat' | 'collab'`、`resolveFormModes`（web 降级）、`resolveFormMode`（含**老用户搬迁**：停在旧 rail 「会话」格的落对话形态，其余落协作）、`formModeForSessionKind`（跟随）
- `sidebar-sections.ts`：rail 从四格降三格，`resolveRailCategories` 在 web 下返回 `[]`（协作形态整个不存在），`resolveRailBadges` 不再吃 `unreadChatSessions`
- `Sidebar.vue`：`SidebarHeader` 下加一行形态切换器；`sidebar-split`（rail + 面板）gate 在 `formMode === 'collab'`；`SessionList` 摘出来成对话形态的 `sidebar-chat-pane`，底下补一条 ⋯/＋/⚙（协作形态那三颗在 rail 底部，入口一个不丢）
- **跟随挂在 `currentSessionId` 上**而不是各个入口里——入口不只有左栏（搜索窗、唤醒、`openAgentSpace`、建完私聊后导航）
- 直聊未读从 rail 挪到**形态切换器上的一枚点**：rail 是协作形态专属的三格，替另一个形态报数就是同一条未读被数两遍

**对 Room 零影响**（这正是 D1 那条切法的目的）：`RoomHeader`/`RoomSurface`、右栏四条固定页签、composer 的 messenger profile、权限收窄——全按 `session.kind` 判，不看 `formMode`。**在对话形态下点开一条群聊，画出来的仍是完整的群聊面。**

**验收结果：** `typecheck` 绿（我的范围）；`bun run test` **7245 passed / 1 skipped**，857 文件；`ui:gate` 70 known, none new；`boundary:gate` 27 known, none new。

### U3b · 每形态一棵工作区树（存档 v4）—— ✅ 已完成（2026-08-05）

补 D7 那个缺口。

- `sidebar-form-mode.ts` → **`stores/form-mode.ts`**（它不再是侧栏的私有模块）
- 形态归属搬进 `workspace` store：`formMode` + `roots`/`activeLeafIds` 两份；`root`/`activeLeafId` 变成指向当前形态的 computed，组件一个字不用改
- 存档 **v3 → v4**：`{ version: 4, forms: { chat: {root, activeLeafId}, collab: {...} } }`；**v3/v2/v1 全部仍读得进来**——v2/v3 的单树按它当前会话的 kind 整棵认领给某个形态，另一个形态从空开始，且 `hydrate` 会把 `formMode` 跟到被认领的那一边（否则老用户一进来落在空形态上）
- `Sidebar.vue` 只剩「画那枚下拉」：形态读 `workspaceStore.formMode`，点击走 `setFormMode`

**验收结果：** `typecheck` 绿（我的范围）；`bun run test` **7313 passed / 1 skipped**，861 文件；`ui:gate` 70 known, none new；`boundary:gate` 27 known, none new；改动文件 eslint 无新增。

### U4 · 对话形态左栏照 ChatGPT —— ✅ 已完成（2026-08-06，一项如实留空）

四项里三项落地，一项没有数据源：

| | |
|---|---|
| Pinned / Projects / 未归类 分组 | ✅ 本来就有（`getProjectGroupedSessions`），一行没动 |
| Show more 截断 | ✅ 本来就有（`DEFAULT_VISIBLE = 5` + `hasMore`/`loadMore`），一行没动 |
| 文件夹图标行 | ✅ 新增。`SessionGroup` 加了 `kind: 'pinned' \| 'project' \| 'other'`——呈现层据此判，**不解析 `key` 前缀**（那是内部标识不是分类依据） |
| 底部用户条 | ❌ **没做**：全仓没有任何「用户」数据源。`ChannelUserProfile` 是 IM 渠道身份不是「我」，渲染层也没有账号/登录面。ChatGPT 那条的另一半（⚙ 设置）已经在 U3 的脚栏里了；账号那一半要先有账号 |

顺手删死码：`getFlatSessions` / `getGroupedSessions`（纯时间分组，生产零调用，只剩测试引用）。

### U5 · 收敛 `createSession` 三份手抄类型 —— ✅ 已完成（2026-08-06）

`platformApi.createSession(name, options)` 的 options 类型此前在三处**各手抄一遍**，而且已经抄岔了——只有 `renderer/types/index.ts` 带 `room.dm`，`preload/bridge.ts` 与 `platform/web.ts` 都漏了。

现在只有一份：`@shared/ipc` 的 `CreateSessionOptions`，三处一律 import。

> 协作形态左栏的「收口」在 U3 就没有工作量了——按你 2026-08-05 的拍板，那条 rail 原样保留，只搬走了「会话」一格。

---

## 6. 已知地雷

### 6.1 会话列表索引是**字段白名单** —— 本方案刻意绕过

`core/session/store-helpers.ts:961` `extractSessionMeta` 与 `:1344` `createSessionWithAdapters`
都是逐字段构造。新加的 session 字段**能落盘、能在 activate 后读到，唯独在会话列表里是空的，且不报错**——症状是「侧栏分不出组，点进去才对」。

`kind` 之所以能出现在侧栏，靠的是 `updateSessionCollab` 显式 `mutateMeta` 写 index。
**这正是 D1 选「形态 = 列表过滤器」而不是「给 session 加 mode 字段」的第二个理由**：不加字段，这条坑天然踩不到。

### 6.2 workspace 存档版本不匹配会静默丢盘

`workspace.ts:146` hydrate 只认 `version===2` 与 legacy `openTabs`。v3 若不写 v2 reader，
所有人冷启动后工作区清空且无任何报错。**U2 的第一条测试就该钉这个。**

### 6.3 「哪些会话进哪条列表」的口径散在 6 处互为反面的过滤器

`filteredSessions`（排除 room/work/agent）、`archivedSessions`（排除 agent）、`agentSessions`、
`radioSessions`/`isServiceAgentSession`、`sidebar-recent` 的「只装 dm+group」、
`getProjectGroupedSessions`。漏一处的症状是同一条会话出现两次，或整段消失。
本方案不新增 kind，但 U3/U4/U5 改左栏渲染时要对着这 6 处逐一确认。

### 6.4 `createSession` 的 options 类型手抄三份且已不一致

`renderer/types/index.ts:782`（有 `dm?: true`）、`preload/bridge.ts:363`（**没有**）、
`platform/web.ts:1179`（**没有**）；再加 `apps/electron/src/main/ipc/sessions.ts:166` 的
`kind !== 'room'` → `Invalid session kind` 白名单，与 `apps/server/src/http.ts:1793` 的
「任何 kind 一律 400」。U5 顺手收敛成一份。

### 6.5 已读水位

`isKnownSessionId` 依赖 `sessions.value`；本方案不动会话数组，安全。
`visibleSessionIds` 在取消 tab 后语义**反而更准**（今天后台 tab 不算可见，改后没有后台 tab）。
但 `hydrateReadMarks` 有一次性闸，形态切换若触发 store 重建会静默退化成全已读——**形态切换不许重建 store**，只换渲染源。

### 6.6 UI 棘轮

`docs/audit/ui-baseline-2026-08-06.txt` 只剩 **70 条**既有红线（P5 收官后逐条确认过的语义保留），`bun run ui:gate` 只拦**新增**。基线这么干净意味着容错极小：
新写的 `SessionHeader` / 形态下拉 / 用户条必须零新红：z-index 走 `--z-*` 变量（禁字面量、禁 fallback）、
浮层走既有原语（禁裸 `<Teleport to="body">`）、禁原生 `<select>`（形态下拉用既有 `ContextMenu` / 下拉原语）、
禁 `title` 属性（用既有 tooltip）、禁 `var(--ui-*, #hex)` fallback、禁 transition/shadow 字面量。

### 6.7 `:global(X) .y` 会被静默截断成 `X`

本仓最容易再踩的 CSS 坑，只有真机看得出来。新组件的 scoped CSS 里别写这个形状。

---

## 7. 宪法（2026-08-05 用户拍板）

| # | 决定 |
|---|------|
| **Q1** | **分栏保留。** 取消的是「一格叠多会话」，不是「只能一格」——每格恰好一条会话，格子仍可拖分。`workspace` 是一次 v2→v3 迁移，不是重写。 |
| **Q2** | **「关闭会话」这个动作取消**，归档/删除接管。⌘W 恢复标准语义 = 关窗口，交还主进程菜单。 |
| **Q3** | **协作形态左栏第一区是「进行中」的活**（沿用 W1 宪法）。两个形态的左栏刻意不同构。 |

三条都与 §4 的 D4/D5/§3.2 一致，方案正文无需改口径。

---

## 8. 不在范围

- 引擎、权限内核、`apps/server`（`apps/web` 共用 `packages/renderer`，形态同步生效，U3 起在浏览器过一遍）
- 消息树合并（§1 已否决）
- 「空间」切换（`sidebar-spaces` 样板，正交，日后可在形态之内再切）
- `RoomSurface` 的 say 排版、右栏四条固定页签（`room-tabs.ts:88`）—— 本次只换外壳，不动房内呈现
