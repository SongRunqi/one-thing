# Agent 空间进右栏:头像可点 + 就地配置

选型已定:面板体取**案一 · 分面**,右栏页签条取**丙 · 正字下划线**。
对比稿留档:`docs/design/agent-space/options.html`(四案面板体)、
`docs/design/agent-space/tab-header.html`(五种页签条)。
样板:`docs/design/agent-space/mockup.html` —— **它就是交付形态**(已按选型更新)。

样板不是效果图:它 `<link>` 了项目的 `styles/variables.css` + `flexoki-colors.css`,
控件全部用 `Tabs.vue` / `RightWorkbenchPanel.vue` / `MembersWorkbench.vue` /
`AgentsPanelContent.vue` 现有的类(样式段里逐块注明了出处),所以颜色、字号、边线、
卡尺括号页签都是应用里真解出来的那一套,`data-theme` 切换即跟随。
**这次真正新写的 CSS 只有 6 条**,在样板文件末尾单列。

样板的三条边界(说在前头,免得当成没画到):

- 悬停提示走**系统原生 `title`**(今天已经是「小林 · 打开空间」),不做浮层名片组件;
- 搜索面是**现有的本地过滤**(会话名 / 群名 / 卡标题 / 文件名),不是全文检索;
- 面板宽 336px = 右栏默认宽,高度是样板为了一屏看全拉长的,实际跟窗口走;
- 左栏与中栏聊天面这次不动,所以样板里没有重画它们。
上游:`docs/design/agent-im-chat-ui.md`(空间页四面)、`docs/design/im-workbench-layout.md`(右栏)、
`docs/design/im-redesign/final.html`(房/私聊最终样板 —— 它早就把空间页画在右栏了)。

## 1 · 现状与病灶

| 入口 | 今天的落点 | 病灶 |
| --- | --- | --- |
| 私聊房头身份块 `RoomHeader.vue:27` | `agentsStore.openAgentSpace` → 全屏 Agents 管理页 | 抢占整个工作区 |
| say 行头像/署名 `SayMessageRow.vue:314` | 同上 | 同上 |
| 房内消息头像/署名 `MessageItem.vue:745` | 同上 | 同上 |
| 群聊房头成员堆 `RoomMemberStrip`(`open-space-on-click`) | 右栏 `members` tab 下钻 ✔ | 只有浅层 |
| 右栏空间页的「会话/文件/配置」`MembersWorkbench.vue:254 openDeepFace` | `openAgentSpace(agentId, tab)` → 全屏管理页 | **深面全部跳出去** |
| 管理页里的会话行 `AgentsPanelContent.vue:1443` / 文件行 `:1615` | 打开会话/文件后 `emit('close')` 关掉整页 | 进出一次废掉当前视野 |

一句话:`openAgentSpace` 的语义是"打开管理页并停在某人某面",而用户要的是"这个人就显示在右栏,配置就在那儿改"。

## 2 · 规则(改完之后只剩这一条)

> **右栏是人的家。** 任何"点这个人"的动作都在右栏落地;右栏里的每一行都在它该去的地方打开
> —— 会话去主区页签,文件去右栏文件页签,配置就地改。Agents 管理页退回名册管理(新建 /
> 退休 / 恢复 / 通览),不再是点头像的目的地。

派生的落点表(与样板 §三 的「点击落点一览」逐条对齐):

| 点了什么 | 去哪 |
| --- | --- |
| 房内成员的头像 / 署名 | 右栏 `members` tab 内下钻(不占新页签);私聊房该 tab 标题显示为「空间」 |
| 非成员的头像(直聊助理、已退休同事) | 右栏新开 `agent` tab,标题 = TA 的名字 |
| 空间页的会话行 | `workspaceStore.openSession(id)` → 主区页签;右栏不关不跳 |
| 空间页的文件行 | `COLLAB_TAG_OPEN_FILE_EVENT` → 右栏 `file` tab(既有链路) |
| 空间页的「配置」面 | 就地表单,就地保存 |

## 3 · 分期

### P0 · 组件化(只搬不改,是后面三期的地基)

`AgentsPanelContent.vue` 3026 行里,资料块与四面的**逻辑与模板**抽进 `packages/renderer/components/agents/`,
管理页与右栏消费同一份(项目铁律:组件化而不是新造一个第二实现):

| 新组件 | 从哪搬 | 职责 |
| --- | --- | --- |
| `AgentProfileHero.vue` | `AgentsPanelContent.vue:152-206` | 头像 + 名字 + 职位 + 墓碑 + 说明 + 动作(发消息 / 看线程 / 打开文件夹) |
| `AgentConfigForm.vue` | 同文件 config 面(Name / Avatar / Picture / Role / Conversations / System Prompt / Tools / Model / Boundaries + save/cancel) | 唯一的配置表单;逻辑仍走 `agents/agent-config-form.ts` |
| `AgentSessionsPane.vue` | `showSessions` 段(四栏 + 干过的活分组) | 只读列表 |
| `AgentFilesPane.vue` | `showFiles` 段(私聊文件 + 交付物) | 只读列表 |
| `AgentSearchPane.vue` | `showSearch` 段 | 本地过滤 |
| `AgentSpace.vue` | 上面五个的壳 | hero + 四 tab;`density: 'wide' \| 'narrow'` 决定栏宽排版 |

约束:

- 搬的过程**不改任何数据口径** —— `buildAgentHistory` / `agentPresence` / `agentDirectChatSessions` /
  `collab:room-folder-list` 全部原样复用,一份账都不新增。
- 出口做成 props/emit,不在组件内部硬编码 `emit('close')`:
  `@open-session` / `@open-file` / `@saved`,由宿主决定关不关自己。管理页照旧关页,右栏不关。
- `density='narrow'`(右栏 ≈336px):表单单列、label 在上、chips 换行、保存条 `position: sticky` 吸底。
  `density='wide'`:管理页现在的排版,像素不动。

### P1 · 路由改向(把跳转掐掉)

1. `stores/agents.ts` 的 `openAgentSpace(agentId, tab)` 改成派 `onething:open-agent-space`
   (detail: `{ agentId, tab, roomSessionId? }`),不再 dispatch `AGENT_OPEN_WORKSPACE_EVENT`。
   `pendingDetailAgentId/Tab` 与 `consumeAgentDetailRequest` 保留 —— 管理页的深链(侧栏右键
   「配置 Agent」)仍走那条,语义不变。
2. `App.vue` 新增 `openAgentInRightWorkbench(detail)`,与 `openThread`/`openMembers` 同款三步
   (`inspectorOpen = true` → `nextTick` → `rightWorkbenchRef.*`),内部分流:
   - 当前会话是房,且 `agentId ∈ room.memberAgentIds` → `openMembers(roomSessionId, agentId)`;
   - 否则 → `openAgentTab(agentId, tab)`。
3. `RightWorkbenchPanel.vue`:
   - `WorkbenchTabType` 加 `'agent'`(`:242`),`tabIcon` 给 `UserRound`,`categorySlot` 与
     `members` 同族(2);
   - `openAgentTab(agentId, tab)`:tab id `agent-<agentId>`,同一人复用已开的那个,
     标题 = `displayAgent(agentId).name`(agent 改名后跟着改);
   - `defineExpose` 补 `openAgentTab`;
   - 单成员房的 `members` tab,`tabDisplayTitle` 显示为「空间」(样板 §三)。
   - 注:`agent` 不进 `+` 号的 tab 选单(它没有"凭空新建"的语义,只能由某个人带出来)。
4. 侧栏右键「打开空间」(`Sidebar.vue:748`)也改走新事件;「配置 Agent」保持进管理页 ——
   那是名册面的动作。

### P2 · 深面就地(病灶的正面)

- `MembersWorkbench.vue`:删掉 `openDeepFace`(`:254`),下钻层直接挂 `AgentSpace`
  (`density='narrow'`),`showBack` 由 `canGoBack` 控。它原来那套 hero + stabs + 计数行
  (`:12-72` 与对应 CSS)由 `AgentSpace` 接管,重复的一份删掉。
- 计数行升级成真列表:`buildAgentSpaceCounts` 的四个数字仍留在 hero 下当摘要,点进
  「会话」面看到的是 `AgentSessionsPane` 的分栏明细。
- 会话行 → `workspaceStore.openSession`,**不再** `emit('close')`;文件行 → 既有
  `COLLAB_TAG_OPEN_FILE_EVENT`。管理页那两个函数(`:1443` / `:1615`)的 `emit('close')`
  下沉成宿主行为。

### P3 · 头像可点(样板 §三)

统一一套 hover 语汇,三处共用,静止态零变化:

- `.agent-open-target`:`cursor: pointer` + hover 时 3px 外扩细环,取 `--ui-accent-primary-fg`;
- `title` 统一为「X · 打开空间」(今天就是这个文案),`aria-label` 同文案 —— **不做浮层名片**;
- `.agent-open-name`:署名文字 hover 出 accent 色下划线(`text-underline-offset: 3px`)。

落点:`RoomHeader.vue`(私聊 solo 块整块起底)、`SayMessageRow.vue`(`.say-avatar-btn` /
`.say-sig-name.is-contact`)、`MessageItem.vue`(`.room-avatar-btn` / `.collab-sender-name.is-contact`)、
右栏成员行。群聊房头成员堆已可点,只补 hover 提示。

### P4 · 右栏页签条改「丙 · 正字下划线」

只动 `RightWorkbenchPanel.vue` 的 `:deep` 覆盖块,`Tabs.vue` 一个字不改
(`app-tabs--line` 的基础规则本来就画满宽底线,今天是被工作台覆盖成括号的)。

**删**

- `.right-workbench-tabs :deep(.app-tabs-nav)::before / ::after`(基线两端的尺寸线止点);
- `.right-workbench .right-workbench-tabs :deep(.app-tabs--line .app-tabs-tab)::after`
  那条三边卡尺括号 ⌞⌟ 的覆盖 —— 删掉后回到 `Tabs.vue` 自带的满宽 2px 底线;
- `.right-workbench-tabs { --app-tabs-active-text: var(--workbench-accent); --app-tabs-accent: … }`
  两行:活动页签的字回到 `--ui-text-primary-fg`,底线回到 `--ui-accent-primary-fg`。

**改**

- `.workbench-tab-label`:`font-family: var(--font-mono…)` / `font-size: 11px` / `letter-spacing`
  三条去掉,改 `font: inherit`(正文 12.5px),`gap: 6px → 7px`;
- `.right-workbench-tabs :deep(.app-tabs-tab)`:`min-width: 64px → 0`、`padding: 0 10px → 0 13px`、
  加 `min-height: 38px`(条更高一档,和面板里的面签拉开层级)、`.is-active` 加 `font-weight: 600`;
- 每格的关闭 ✕ 改成只在 `.is-active` / `:hover` 时显形(今天是常显)。

**留**

- `--workbench-accent`(制图黛蓝)保留 —— 工具卡与图标仍在用,只是不再出现在页签条上;
- 右上角 `＋`(tab 选单)与 `✕`(关右栏)两颗按钮位置不变。

影响面:右栏**所有**页签(线程 / 成员 / 文件 / 终端 / 浏览器 / 看板 / 新的 agent 页),这是要的一致。
主区 TabBar 与设置页的 tab 不受影响(它们不套 `right-workbench-tabs`)。

## 3.5 · 交付契约(样板 ↔ 代码)

样板里每个类的归宿,落地时照抄:

| 样板里的类 | 落地位置 | 状态 |
| --- | --- | --- |
| `.app-tabs*` / `.workbench-close` | `Tabs.vue` | 已存在,不改 |
| `.right-workbench-tabs …` / `.workbench-tab-label` | `RightWorkbenchPanel.vue` | **改**:按 P4 删 3 组、改 3 条(页签条形态「丙」) |
| `'agent'` tab 类型 + `openAgentTab` | `RightWorkbenchPanel.vue` | **新**:一个 tab 类型 + 一个方法 |
| `.space-back` / `.space-hero` / `.space-avatar` / `.space-name` / `.space-subtitle` / `.space-desc` / `.space-tabs` / `.space-tab` | `MembersWorkbench.vue` | 已存在,原样;`.space-tabs` 从三格变四格(加「搜索」) |
| `.member-row` / `.member-dot` / `.member-name` / `.member-detail` | `MembersWorkbench.vue` | 已存在,不动 |
| `.editor-scroll` / `.editor-body` / `.agent-field` / `.field-label` / `.ledger-input` / `.ledger-textarea` / `.mode-switch` / `.tool-grid` / `.tool-line` / `.model-row` / `.ledger-select` / `.editor-footer` / `.text-action` / `.field-hint` / `.prompt-counter` | `AgentsPanelContent.vue` → 抽进 `agents/AgentConfigForm.vue` | 已存在,搬家不改样式 |
| `.history-rows` / `.history-line` / `.history-name` / `.history-note` / `.history-meta` / `.history-group*` | 同上 → `AgentSessionsPane.vue` / `AgentFilesPane.vue` | 已存在,搬家不改样式 |
| `.agent-open-target` / `.agent-open-name` | 新增(共享,三处头像 + 署名共用) | **新** 1 |
| `.space-actions` | 新增(右栏 hero 下的动作行) | **新** 2 |
| `.space-face` | 新增(四面的滚动容器) | **新** 3 |
| `.is-narrow …`(5 行密度覆盖) | 新增(窄栏密度,字段一个不改) | **新** 4 |
| `.face-group` / `.face-rows` | 新增(三个列表面的分组头) | **新** 5 |
| `.face-search` | 新增(搜索输入行) | **新** 6 |
| `*::-webkit-scrollbar*`(6px 发丝,轨道透明) | `styles/main.css:65` | 已存在,全局,不改 |
| `.space-face:not(:hover)` / `.editor-scroll:not(:hover)` 的 thumb 透明 | 新增(滚动条只在鼠标进这一栏时显形) | **新** 7 |

### P4.5 · 滚动条

上一版样板里那条"白底带 + 粗灰条"是**样板自己的问题**(没引 `main.css`,吃了浏览器默认条),
项目里早有一条全局规范:`styles/main.css:65` —— 宽 6px、轨道透明、thumb 是 30% 墨色发丝。
样板已补上,那条白带随之消失。

在此之上加一条(新 7):**空间页的两个滚动容器,鼠标不在里面时 thumb 透明**。
手法照抄 `styles/markdown.css:353` 对代码块的处理,不是新发明:

```css
.right-workbench .space-face:not(:hover)::-webkit-scrollbar-thumb,
.right-workbench .editor-scroll:not(:hover)::-webkit-scrollbar-thumb { background: transparent; }
```

范围只到右栏。想让全应用都这样,是 `main.css` 里加同款一条 —— 那是另一个决定,这里不夹带。

## 4 · 不动的东西

- 直聊(工程驾驶舱)的壳、TabBar、分屏:一个像素不改。
- 权限审批、线程栏、看板:不碰。
- `agents.json` 的字段与更新通道:不碰,配置面只是换了个宿主。
- Agents 管理页仍在,`shellMode: 'classic'` 回滚闸也仍在。

## 5 · 测试

- `AgentConfigForm` 挂载测试:窄栏下字段齐全、保存 payload 与今天逐字相同(镜像
  `agent-config-form.ts` 既有单测)。
- `MembersWorkbench`:点 stabs 不再调 `openAgentSpace`(反向断言,钉住"不许跳出去")。
- `RightWorkbenchPanel`:同一 agent 连点两次只开一个 tab;agent 改名后 tab 标题跟着改。
- `App.vue` 分流:成员 → `openMembers`,非成员 → `openAgentTab`。
- 三处头像的 click 落点镜像测试(既有 `MessageItem.room.test.ts` / `SayMessageRow.space.test.ts`
  改断言到新事件)。
- 坑:真 settings store 在模块作用域读 `localStorage`,挂载这些组件的测试要
  `vi.mock('@/stores/settings')`。

## 6 · 真机走查清单

1. 群聊里点消息头像 → 右栏「成员」下钻,主区不动;
2. 私聊里点房头 → 右栏第二格叫「空间」,无「返回成员」;
3. 配置面改职位 → 保存 → 群聊署名那一行立刻变;
4. 会话行 → 主区多一个页签,右栏原样;文件行 → 右栏多一个文件页签;
5. 直聊里点助理头像 → 右栏新开一个以 TA 命名的页签;
6. 侧栏右键「配置 Agent」→ 仍进管理页(名册面没被误伤)。

---

## 7 · 实施记录(2026-07-31 落地,未提交)

P0–P4.5 全部实施。门禁:`typecheck` 绿、renderer 1878 条测试全绿、`web:build` 通过、
`boundary:gate` 无新增失败。仓库里另有两条**既有**红(`profile.test.ts` /
`file-revalidation.test.ts`,runtime 侧,与本次无关)。

### 落了什么

| 期 | 文件 |
| --- | --- |
| P0 | 新 `styles/agent-space.css`(`.agent-ledger` 前缀的账页表)、`components/agents/`:`AgentConfigForm.vue` / `AgentSessionsPane.vue` / `AgentFilesPane.vue` / `AgentSearchPane.vue` / `AgentSpace.vue` / `use-agent-history.ts` / `use-agent-dm.ts`;`AgentsPanelContent.vue` 3026 → 1006 行,改为消费这四面 |
| P1 | `stores/agents.ts` 加 `AGENT_OPEN_SPACE_EVENT` + `openAgentManager`;`App.vue` 加 `openAgentSpaceInRightWorkbench`(成员→下钻 / 非成员→独立页签);`RightWorkbenchPanel.vue` 加 `'agent'` tab 类型 + `openAgentTab` |
| P2 | `MembersWorkbench.vue` 删 `openDeepFace`,下钻层换成 `AgentSpace`;会话行 → 主区页签、文件行 → 右栏文件页签 |
| P3 | `SayMessageRow` / `MessageItem` / `RoomHeader` / `RoomMemberStrip` / `MembersWorkbench` 五处 hover 墨环 |
| P4 | `RightWorkbenchPanel.vue` 页签条改「丙」 |
| P4.5 | `AgentSpace` 的 `.space-face` 滚动条 hover 才显形 |

新测试:`components/agents/__tests__/AgentSpace.test.ts`(8 条,含"一次都不许 openAgentSpace"的
反向断言)、`stores/__tests__/agents-open-space.test.ts`(3 条)、`RightWorkbenchPanel.members.test.ts`
+2 条(agent 页签去重 / 会话行去主区)、`MembersWorkbench.test.ts` 重写为对 `AgentSpace` 的契约断言。

### 与本文的偏移(照实记)

1. **hover 环没做成一个共享 class**。三处的 DOM 不同形(`<button>` / 包一层 `<span>` / 圆环 chip),
   共享类还是要为每处补定位规则,不如各写四行。**`RoomHeader` 多包了一层 `.room-solo-avatar-wrap`**:
   图片头像是 `<img>`,`::after` 在替换元素上根本不渲染 —— 环必须画在外层元素上。
   `RoomMemberStrip` 的环用 `is-space-target` 门控,只在**真会下钻**的形态上给。
2. **顺手修了 `stores/settings.ts` 的 `localStorage` 模块作用域访问**(`getInitialTheme` /
   `isThemeDebugEnabled` 两处加了 `typeof localStorage?.getItem === 'function'`)。
   不修不行:`AgentConfigForm` 一 import 这个 store,三个 workbench 测试套件就在 **import 阶段**
   集体炸,报错还长得像"组件坏了"。这是本仓库踩过两次的老坑,这次从根上按住。
3. **退休 / 恢复的回执留在管理页**(`lifecycleNote` / `lifecycleError`),没跟着表单走 ——
   那是名册面的动作,回执归名册面;保存那条才在表单里。抽件时一度把它弄丢了,是测试抓回来的。
4. **`openAgentManager` 是新增的分岔**:侧栏右键「配置 Agent」仍进管理页,「打开空间」才落右栏。
   本文 §2 的落点表只说了后者,前者写在这里。
5. **共享样式抽成一份普通 CSS**(`.agent-ledger` 前缀)而不是留在 scoped 块里:markup 搬进子组件
   之后,scoped 属性只落在子组件根元素上,内部的 `.ledger-input` / `.history-line` 会集体掉样式。
6. **墓碑 agent 的配置面给一句话**,不摆空表单 —— 否则 save 是一颗按了什么也不发生的按钮。
7. **单成员房的页签标题「空间」由 App 传 `title`** 实现(`openMembers(roomId, agentId, '空间')`),
   不是 `tabDisplayTitle` 内部判形态 —— 判形态是房面的事,右栏只照着写。

### 还没做

- **真机走查一次没做**(没起 dev server)。四个落点:①群聊点消息头像 → 右栏成员内下钻;
  ②私聊点房头 → 第二格叫「空间」;③配置面改职位 → save → 群聊署名跟着变;
  ④会话行开主区页签、文件行开右栏文件页签。
- 页签条改「丙」之后,右栏**所有**页签(线程/文件/终端/浏览器/看板)都换了脸,一起看一眼。
