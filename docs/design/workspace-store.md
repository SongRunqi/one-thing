# Workspace Store：tab / 分屏状态上收为单一 store（方案 B）

- 日期：2026-07-18
- 状态：已实施（同日，P0-P4 一次落地，见 §11 实施记录）
- 关联：方案 A（会话身份稳定化，另行实施）；tab 消失/幽灵 New Chat 调查（本文 §1）

## 1. 背景与问题

当前"打开了哪些会话 tab、分屏布局是什么、焦点在哪"这组状态没有单一归属，由三个互不知情的玩家拼接：

| 玩家 | 位置 | 生命周期 |
| --- | --- | --- |
| `useTabs` | `src/renderer/composables/useTabs.ts`，每个 `ChatWindow` 实例私有一份 | 随组件挂载/卸载生灭 |
| `usePanelLayout` | `src/renderer/composables/usePanelLayout.ts`，`ChatContainer` 本地实例 | 随 ChatContainer 生灭，不持久化 |
| `sessionsStore.currentSessionId` | `src/renderer/stores/sessions.ts` | 全局单例，通过 watch 反向驱动 tab 增减 |

三者靠 watch 缝合，已确认的缝合层 bug：

1. **分屏互相覆盖**：每个 `ChatWindow` 在 `onMounted` 里从同一个全局 `appState.openTabs` restore 整套 tab（`ChatWindow.vue:165-176`），且每次变动都写同一个 key（`useTabs.persistTabs`）。last-writer-wins，另一个面板的 tab 在下次恢复时消失。
2. **组件卸载即状态蒸发**：`ChatContainer.vue:63` 的 `PanelTree v-if="currentSessionId"`，currentSessionId 变空（删最后一个会话、丢弃 draft）时整棵树卸载，内存 tab 全丢。
3. **恢复错乱**：`ChatWindow.vue:170` 恢复时 activeIndex 写死 0；draft 序列化成 `sessionId: ''`、恢复时变形为 `initialSessionId`（`useTabs.ts:154, 184`）；restore 不去重 → 重复 tab / 空 id 死 tab。
4. **会话生命周期与 tab 脱钩**：删除/归档会话不关 tab（`closeTabForSession` 只在拖拽分屏时被调用）；尸体 tab 的名字 fallback 成 "New Chat"（`ChatWindow.vue:196`）。
5. **watch 缝合层本身是补丁堆**：`ChatWindow.vue:182` 的 `watch(effectiveSessionId) → openChatTab`（materialize 时凭空追加新 tab 的元凶）；`ChatContainer.vue:221-231` 的 `watch(currentSessionId) → activeLeaf.sessionId`（注释自述是上一个 bug 的补丁）。

## 2. 目标与非目标

### 目标

- G1：tab + 分屏树 + 焦点收进一个 Pinia store（`workspaceStore`），全应用唯一实例，组件全部退化为视图。
- G2：持久化只有一个 owner，序列化整棵 workspace 树（含分屏布局与每面板 activeTab），启动时恢复一次。
- G3：删除 watch 缝合层，数据流单向化：用户操作 → workspace 变更 → `currentSessionId` 跟随。
- G4：会话删除/归档/materialize 联动关闭或改写 tab。
- G5：`workspaceStore` 不依赖 Electron（经 `platformApi` 抽象），web 构建可直接共享。

### 非目标

- 不改会话身份模型（`draft:` id → 稳定 id 是方案 A，另行实施；本方案提供 `retargetSession` 作为 A 落地前的过桥）。
- 不做多 BrowserWindow 的 workspace 同步（模型为其留出空间，但本期不实现）。
- 不动 `sessionsStore` 的会话数据职责（列表、加载、消息分页维持原状）。
- `currentSessionId` 本期不删除、不改为 computed：保留为 `sessionsStore` 字段，但**只允许 workspace 层写入**（保守版收口，见 §5.3）。

## 3. 数据模型

新文件 `src/renderer/stores/workspace.ts`。树结构沿用 `usePanelLayout` 的形状，但 leaf 不再持有单个 `sessionId`，而是持有 tab 列表：

```ts
// ── 树 ──────────────────────────────────────────────
export interface WorkspaceLeaf {
  type: 'leaf'
  id: string                 // 稳定 id；主面板固定 'main'
  size: number               // flex 份额，沿用现有 Splitter 语义
  tabs: WorkspaceTab[]       // 有序；至少含一个 chat tab
  activeTabId: string
}

export interface WorkspaceSplit {
  type: 'split'
  id: string
  orientation: 'horizontal' | 'vertical'
  size: number
  children: WorkspaceNode[]
}

export type WorkspaceNode = WorkspaceLeaf | WorkspaceSplit

// ── tab ─────────────────────────────────────────────
export interface ChatTab {
  id: string                 // tab 自身 id，运行时生成，不持久化
  type: 'chat'
  sessionId: string
}

export interface WorkbenchTab {
  id: string
  type: 'workbench'
  workspaceRoot: string
  initialFilePath: string
  activeFilePath: string
  title: string
}

export type WorkspaceTab = ChatTab | WorkbenchTab

// ── store state ─────────────────────────────────────
interface WorkspaceState {
  root: WorkspaceNode
  activeLeafId: string
  hydrated: boolean          // 启动恢复完成前为 false，期间不持久化
}
```

### 不变量（store 内部维护，mutation 出口统一校验）

- I1：每个 leaf 至少有一个 chat tab；关不掉最后一个 chat tab（除非整个 leaf 被关闭，且树中还有其他 leaf）。
- I2：`activeTabId` 恒指向本 leaf `tabs` 中的成员；`activeLeafId` 恒指向树中存在的 leaf。
- I3：同一 leaf 内 chat tab 按 `sessionId` 唯一（跨 leaf 允许同一会话出现在两个面板——现状允许，保留）。
- I4：树中任何 split 节点的 `children.length >= 2`；降为 1 时自动收缩（沿用 `usePanelLayout.closeLeaf` 的收缩逻辑）。

### 派生值

```ts
const activeLeaf   = computed<WorkspaceLeaf>(...)
const activeTab    = computed<WorkspaceTab | undefined>(...)
/** 焦点面板当前激活的 chat 会话；currentSessionId 的唯一合法来源 */
const activeSessionId = computed<string>(() =>
  activeTab.value?.type === 'chat' ? activeTab.value.sessionId : findLastChatTab(activeLeaf.value)?.sessionId ?? '')
const openSessionIds = computed<Set<string>>(...)   // 全树所有 chat tab 的 sessionId
```

## 4. Store API

树操作从 `usePanelLayout.ts` 迁移为纯函数（`src/renderer/stores/workspace-tree.ts`，供 store 调用，独立可测）：`findNode / findLeaf / collectLeaves / splitLeaf / closeLeaf / equalizeSiblings / firstLeafId`。签名不变，仅数据形状从 `LeafPanel.sessionId` 换成 `WorkspaceLeaf.tabs`。

Store actions（全部为同步状态变更；IPC 副作用见 §5.4）：

```ts
// ── tab ──
openSession(sessionId: string, opts?: { leafId?: string })
  // 唯一的"打开会话"入口。目标 leaf（默认 activeLeaf）内已有该会话的 tab
  // → 激活之；否则新建 chat tab 并激活。取代 watch(effectiveSessionId)。
activateTab(leafId: string, tabId: string)
closeTab(leafId: string, tabId: string): ClosedTabInfo | undefined
  // 处理 I1：最后一个 chat tab 时返回 { cascade: 'close-leaf' } 由调用方决策
moveTab(leafId: string, fromId: string, toId: string)
openWorkbenchTab(filePath: string, workspaceRoot?: string)   // 沿用 useTabs.addWorkbenchTab 语义
closeAllWorkbenchTabs()

// ── 会话生命周期联动 ──
closeSessionTabs(sessionId: string)
  // 全树移除该会话的 tab；被移除的 activeTab 按"右邻优先"顶替。
  // 由 sessionsStore.deleteSession / archiveSession 调用。
retargetSession(oldId: string, newId: string)
  // 全树把 oldId 的 chat tab 原地改指 newId(位置、激活态不动)。
  // 由 materializeNewChatDraft 调用 —— 方案 A 落地后此方法退役。

// ── 面板 ──
splitLeaf(leafId: string, sessionId: string, direction: SplitDirection): string | undefined
closeLeaf(leafId: string)
equalizeSiblings(leafId: string)
setActiveLeaf(leafId: string)

// ── 持久化 ──
hydrate(): Promise<void>     // 启动时调用一次；含 v1 迁移(§6)
```

## 5. 数据流

### 5.1 单向化

```
用户操作(点 tab / 点侧栏 / 分屏 / 搜索跳转 / 网关切换)
    → workspaceStore mutation
        → activeSessionId (computed) 变化
            → 唯一一个 effect：sessionsStore.switchSession(activeSessionId)
                → 会话数据加载、currentSessionId 赋值
```

反向 watch 全部删除：

- 删 `ChatWindow.vue:182` `watch(effectiveSessionId) → openChatTab`
- 删 `ChatContainer.vue:221-231` `watch(currentSessionId) → activeLeaf.sessionId`
- 删 `ChatWindow.vue` `onMounted` 的 per-window restore（`165-176`）

### 5.2 调用方迁移

所有"切会话"的入口不再直接调 `switchSession`，改调 `workspaceStore.openSession(sessionId)`：

- 侧栏点击（`SessionList` → 现走 `switchSession` 的路径）
- Search Everywhere 跳转（`ChatContainer.jumpToMessage`，含 split-panel intent 的 `openSession(sessionId, { leafId })`）
- `goToParentSession`（`ChatWindow.vue:222`）
- ChatPanel 的 `switch-session` 事件链
- `openNewChatDraft` / `createSession` 后的落点

`switchSession` 本体保留（数据加载职责不变），但其中不再有任何 tab 语义。

### 5.3 currentSessionId 写入收口

保守版：字段保留在 `sessionsStore`，写入点收敛到两处——`switchSession`（由 §5.1 的唯一 effect 触发）与启动恢复。`discardNewChatDraft` / `deleteSession` 中现有的 `currentSessionId.value = ''` 直接删除：会话被删后由 `closeSessionTabs` 的顶替逻辑产生新的 `activeSessionId`，effect 顺势切换；全部 tab 关光时 workspace 进入空态（§5.5）。

grep 断言（进架构测试）：`src/renderer` 内对 `currentSessionId.value =` 的赋值只允许出现在 `sessions.ts` 的 `switchSession` 与 hydrate 路径。

### 5.4 IPC 副作用归属

`workspaceStore` 只做状态与持久化（经 `platformApi.saveUIState/getAppState`，与 useTabs 现状一致，满足 G5）。以下副作用留在视图/容器层：

- `evictSessionCache`：`ChatWindow.handleCloseTab` 现有逻辑保留，改为在 `closeTab` 返回后执行；
- `getSessionCacheStats`（冷 tab 虚描）：留在 `ChatWindow`，消费 `openSessionIds` 变化后刷新。

### 5.5 空态

`PanelTree` 的挂载条件从 `v-if="currentSessionId"` 改为 `v-if="workspaceStore.hasAnyChatTab"`。全部会话删光时进入现有的 "New Chat" 空态页；workspace 树重置为单 leaf 空 tabs（hydrated 保持 true，后续 `openSession` 直接填充）。**卸载不再意味着状态丢失**——即使挂载条件翻转，store 数据原地不动。

## 6. 持久化

### 6.1 v2 格式

`saveUIState` 增加 `workspace` 字段（v1 的 `openTabs`/`activeTabIndex` 停写、保留读取用于迁移）：

```ts
interface PersistedWorkspaceV2 {
  version: 2
  activeLeafId: string
  root: PersistedNode        // 同构于 WorkspaceNode，差异如下
}
```

序列化规则：

- chat tab 只存 `sessionId`；**draft 会话的 tab 直接跳过不序列化**（renderer-only 概念，重启后无意义——v1 序列化成 `''` 的变形源就此消灭）；
- tab 的运行时 `id` 不持久化，恢复时重新生成；
- `activeTabId` 持久化为 tab 在数组中的下标（`activeTabIndex` per leaf）；
- workbench tab 沿用 v1 字段（workspaceRoot/initialFilePath/activeFilePath/title）。

### 6.2 恢复与校验（`hydrate()`）

启动时（App.vue 现有 `getAppState` 时序内）执行一次：

1. 读 `workspace` 字段；无则走 v1 迁移：`openTabs + activeTabIndex` → 单 leaf 树；
2. 逐 tab 校验：空 `sessionId` 丢弃；`sessionId` 不在 `sessionsStore.sessions` 中的 chat tab 丢弃（**前置条件：hydrate 在会话列表加载完成之后执行**，App.vue 启动序列已保证 `loadSessions` 先行，需在实现时加断言）；
3. leaf 内按 sessionId 去重（保序取首个）；
4. 校验不变量 I1-I4，不满足则收缩/补默认 leaf；
5. 恢复 `activeLeafId` 与各 leaf 的 activeTab（越界回退 0——不再是写死 0，而是持久化的真实值）；
6. 置 `hydrated = true`，触发一次 §5.1 的 effect 完成初始会话激活。

### 6.3 写入

store 内单一 `persist()`，debounce（150ms trailing），`hydrated === false` 期间不写。所有 mutation 结尾统一调用，替代 useTabs 里散落的 `persistTabs()`。

### 6.4 类型与主进程

- `src/renderer/types/index.ts:1697-1723`：`getAppState`/`saveUIState` 形状增加 `workspace?: PersistedWorkspaceV2`；
- `src/main/ipc/app-state.ts`：透传存储新字段（app-state 是无脑存取，改动很小）；
- `src/renderer/platform/web.ts`：web 平台的对应 stub 同步。

## 7. 视图层改造

### 7.1 `ChatWindow.vue`

- 删：`useTabs()` 实例、onMounted restore、`watch(effectiveSessionId)`、`syncSessionFromTab`；
- 增：props 收一个 `leafId`，tabs/activeTabId 从 `workspaceStore` 按 leafId 读；
- 事件处理改为薄委托：`activateTab → store.activateTab + (无需手动切会话，effect 接管)`；`handleCloseTab → store.closeTab`，返回 cascade 时沿用现有 `emit('close')` 面板级联逻辑，eviction 副作用保留；
- `effectiveSessionId` 改为 `computed(() => activeChatTabOf(leafId).sessionId)`，`props.sessionId` 输入路径删除。

### 7.2 `ChatContainer.vue`

- 删：`const layout = usePanelLayout()` 本地实例，全部 `layout.*` 改 `workspaceStore.*`；
- 删：`watch(currentSessionId)` 缝合块（221-231）；
- `handlePanelEvent` 各分支改调 store actions；`splitPanel/switchLeafSession/handleSplitDrop` 中的 `ensurePanelSessionLoaded` 保留；
- `closeTabForSession` 面板间转移路径改为 `store.closeTab`（跨面板语义由 store 内 `closeSessionTabs` 变体覆盖）。

### 7.3 `PanelTree.vue` / `TabBar.vue` / `TabItem.vue`

- PanelTree：props 形状从 `LeafPanel`（含 sessionId）换成 `WorkspaceLeaf`（含 tabs），透传 leafId；挂载条件见 §5.5；
- TabBar/TabItem：纯展示，仅 props 类型跟随；
- **tab 标题解析修正**（G4 附带）：`chatSessionNames` 的 fallback 从一律 `'New Chat'` 改为——draft id（方案 A 前按前缀判断）→ `'New Chat'`；真实 id 解析不到 → 显示会话 id 短横线占位并打 stale 标记（正常情况下 hydrate 校验 + 生命周期联动已保证解析不到的 tab 不存在，此为最后防线）。

### 7.4 `sessionsStore` 挂钩

- `deleteSession` / `archiveSession`（含子会话递归归档分支）：成功后调 `workspaceStore.closeSessionTabs(id)`（归档的子会话逐个调用）；其中的 `currentSessionId.value = ''` 与"切到邻近会话"的手工逻辑删除——顶替由 workspace 完成；
- `materializeNewChatDraft`：createSession 成功后调 `workspaceStore.retargetSession(draftId, created.id)`，且 **`switchSession(created.id)` 由 retarget 后的 effect 自然触发**，`createSession` 内的显式 `switchSession` 需要按新时序核对（避免双触发，`switchSession` 幂等早退已兜底）。

## 8. 实施分期

每期独立可提交、测试全绿；P1 结束前新旧路径并存的时间窗尽量短（P1+P2 建议同一工作日完成）。

### P0 — store 与纯函数落地（不接线）

- 新增 `src/renderer/stores/workspace-tree.ts`（树纯函数，自 `usePanelLayout.ts` 迁移改形）；
- 新增 `src/renderer/stores/workspace.ts`（state/actions/派生值/persist/hydrate）；
- 新增 `src/renderer/stores/__tests__/workspace.test.ts`：不变量 I1-I4、openSession 幂等、closeTab 级联、closeSessionTabs 顶替、retargetSession、v1→v2 迁移、hydrate 校验各分支、去重；
- 类型与 IPC 形状（§6.4）。

### P1 — ChatWindow/TabBar 切读 store

- §7.1、§7.3 改造；删 `useTabs.ts` 与其测试（用例迁入 workspace.test）；
- `TabBar.focus.test.ts` 更新数据源。

### P2 — ChatContainer/PanelTree 接线，删缝合层

- §7.2 改造；删 `usePanelLayout.ts`（纯函数已迁走）与其测试；
- §5.2 调用方迁移、§5.3 写入收口 + grep 断言测试;
- `ChatContainer.search.test.ts` 更新。

### P3 — 持久化 v2 + 启动恢复

- §6 全量；App.vue 启动序列接 `hydrate()`；
- 手工验证矩阵：单面板重启还原（含 activeTab）、分屏重启还原布局、v1 旧数据迁移、含 draft 状态退出后重启无 `''` tab。

### P4 — 会话生命周期联动

- §7.4 挂钩；删除/归档当前会话、归档带子会话、删光全部会话（空态）各补测试；
- 顺手清理：`commands/index.ts:460`、`chat.ts:2080` 的 materialize 路径核对 retarget 时序。

### 方案 A 衔接

A 落地（renderer 生成稳定 id + `persisted` flag）后：删 `retargetSession`、§7.3 的 draft 前缀判断、§6.1 的 draft 跳过规则退化为 `persisted === false` 跳过。本文其余部分不受影响。

## 9. 风险与回滚

- **时序风险**：hydrate 依赖会话列表先加载（§6.2）。实现时在 hydrate 入口断言 `sessionsStore.isLoading === false`，违反即 console.error + 降级为空 workspace，避免静默丢 tab。
- **双触发风险**：effect(activeSessionId → switchSession) 与遗留显式 switchSession 并存期间可能重复调用；`switchSession` 首行的幂等早退（`currentSessionId === sessionId return`）是安全网，P2 完成后遗留调用应清零（grep 复查）。
- **数据风险**：v2 写入前 v1 字段不删除，回滚到旧版代码仍可读 v1（v2 期间 v1 停更，回滚损失的只是 v2 期间的 tab 布局变更）。
- **回滚粒度**：按期提交，任一期出问题单独 revert；P1/P2 是同一语义变更的两半，回滚时成对处理。

## 10. 文件清单汇总

| 操作 | 文件 |
| --- | --- |
| 新增 | `src/renderer/stores/workspace.ts` |
| 新增 | `src/renderer/stores/workspace-tree.ts` |
| 新增 | `src/renderer/stores/__tests__/workspace.test.ts` |
| 删除 | `src/renderer/composables/useTabs.ts`（+ 测试，用例迁移） |
| 删除 | `src/renderer/composables/usePanelLayout.ts`（+ 测试，纯函数迁移） |
| 修改 | `src/renderer/components/chat/ChatWindow.vue` |
| 修改 | `src/renderer/components/ChatContainer.vue` |
| 修改 | `src/renderer/components/chat/PanelTree.vue` |
| 修改 | `src/renderer/components/chat/TabBar.vue` / `TabItem.vue`（props 类型） |
| 修改 | `src/renderer/stores/sessions.ts`（生命周期挂钩、写入收口、删手工切换逻辑） |
| 修改 | `src/renderer/stores/chat.ts`（materialize 路径核对） |
| 修改 | `src/renderer/services/commands/index.ts`（同上） |
| 修改 | `src/renderer/App.vue`（启动 hydrate 时序） |
| 修改 | `src/renderer/types/index.ts`（uiState v2 形状） |
| 修改 | `src/main/ipc/app-state.ts`（新字段透传） |
| 修改 | `src/renderer/platform/web.ts`（stub 同步） |
| 修改 | `src/renderer/components/chat/__tests__/TabBar.focus.test.ts`、`src/renderer/components/__tests__/ChatContainer.search.test.ts` |

## 11. 实施记录（2026-07-18）

P0-P4 一次落地，607 文件 / 3641 测试全绿；typecheck 仅剩 `SchedulerPanelContent.vue` 一处预存在的 TS2589（用户未提交的大改所致，与本方案无关，已用 stash 对照验证）。

### 与设计的偏差

1. **workspace 模型只含 chat tab**。实施前核实：`useTabs` 的 workbench/file tab API 在生产代码零调用（右侧 workbench `RightWorkbenchPanel` 自有独立 tab 系统），聊天 tab 栏实际只有 chat tab。因此 `WorkspaceTab = ChatTab`，v1 持久化里的 workbench 条目在迁移时丢弃（它们本来就是渲染不出来的僵尸数据）。§3/§6 相应简化。
2. **§5.2 调用方迁移改为 switchSession 内部对齐**。没有把全部调用方改成 `openSession`，而是在 `switchSession` 顶部调用 `workspace.openSession(sessionId)`（幂等，hydrated 前跳过）。十几处既有 `switchSession` 调用方零改动即获得正确 tab 语义；`openSession` 仍是显式入口（ChatContainer 面板级操作用）。效应回路：workspace 变更 → effect → switchSession → 对齐早退，无递归。
3. **closeTab 级联内化进 store**：leaf 最后一个 tab 关闭 = 关 leaf（唯一 leaf 拒绝），不再走 `emit('close')` → panel-event 链；PanelEvent 的 `close` 变体删除。`closeTab`/`closeLeaf` 返回 released session 信息，eviction/draft-discard 副作用留在 ChatWindow。
4. **`ensurePanelSessionLoaded` 删除**：分屏/换会话的数据加载统一由 effect → `switchSession` 承担，不再有第二条加载路径。
5. **持久化 leaf 格式**为 `sessions: string[]` + `activeIndex`（tab 运行时 id 不落盘，恢复时重生成）；leaf/split 的 id 原样保留使 `activeLeafId` 可恢复。
6. **hydrate 接收 App.vue 已取到的 appState**，不自行再发 getAppState。
7. **删除/归档保留旧 UX**：当前会话被删/归档且 workspace 已无任何 tab 时，仍跳转侧栏邻居会话（有邻居 tab 时由 effect 接管，优于旧行为）。顺手修复预存在 bug：`deleteSession(draftId)` 之前误删当前 draft 而非目标 draft。
8. **围栏测试** `stores/__tests__/workspace-ownership.test.ts`：`currentSessionId` 赋值只允许出现在 `stores/sessions.ts`；任何代码不得再写 v1 `openTabs` 字段。

### 落地文件清单（相对设计 §10 的修正）

| 操作 | 文件 |
| --- | --- |
| 新增 | `src/renderer/stores/workspace.ts`、`workspace-tree.ts`、`workspace-persistence.ts` |
| 新增 | `src/renderer/stores/__tests__/workspace.test.ts`（24 例）、`workspace-ownership.test.ts`（围栏） |
| 删除 | `composables/useTabs.ts`、`composables/usePanelLayout.ts` 及各自测试 |
| 改写 | `components/chat/ChatWindow.vue`（sessionId prop 删除，纯视图化）、`__tests__/ChatWindow.test.ts` |
| 修改 | `components/ChatContainer.vue`、`components/chat/PanelTree.vue`、`panel-event.ts`、`App.vue` |
| 修改 | `stores/sessions.ts`（clearCurrentSession、switchSession 对齐、draft/删除/归档钩子、materialize 改 retarget） |
| 修改 | `types/index.ts`、`packages/onething-runtime/src/storage/app-state.ts`（v2 `workspace` 字段） |
| 改写 | `components/__tests__/ChatContainer.search.test.ts`（新数据流语义） |

### 待真机验证清单

- [ ] 新建聊天 → 发送首条消息：draft tab 原地变为真实会话 tab（不再出现第二个 tab / 幽灵 New Chat）
- [ ] 分屏 A/B 各开若干 tab → 重启：两个面板的布局、tab、各自 activeTab 完整还原（v2 首次覆盖此场景）
- [ ] 旧版数据（只有 openTabs 的 v1 state）首启迁移正常
- [ ] 删除/归档当前会话：有其他 tab 时切邻居 tab；全关时回空态或跳侧栏邻居
- [ ] 删光全部会话 → 空态 → 新建：面板树重挂载后 tab 状态正确（不再蒸发）
- [ ] 拖 tab 到分屏 drop zone：源面板 tab 消失、新面板出现，无缓存误逐出

## 12. 方案 A 实施记录（2026-07-18，同日随后落地）

会话身份稳定化：**draft id 即未来的正式 session id**（纯 v4 UUID），"draft" 降级为纯状态（`newChatDrafts` 成员资格），不再是 id 前缀。materialize 时 main process 用同一个 id 落盘，全链路（tab、composer draft、snapshot）零迁移。

- `createNewChatDraftId()` 生成纯 v4 UUID（`crypto.randomUUID` + 手写 v4 兜底）；`draft:` 前缀在生产代码中绝迹。
- `platformApi.createSession(name, { sessionId? })` 全链路打通：preload bridge → 主进程 `CREATE_SESSION` handler → `store.createSession(id, name)`；web 平台 → `POST /api/sessions` → server runtime `sessions.create(name, ctx, requestedSessionId?)`（`RuntimeSessionsAdapter.create` 接口加了可选第三参，向后兼容）。
- **安全校验（两端一致）**：客户端 id 会成为存储路径段，只接受严格 v4 UUID 正则；已存在的 id 直接拒绝（不静默改配、不收养既有会话）。防回归测试 `apps/server/src/session-create-id.test.ts`（路径穿越/前缀/非 v4/重复 id 全拒）。
- `materializeNewChatDraft`：`createSessionWithoutSwitch(name, draft.id)`；**`workspaceStore.retargetSession` 按计划退役删除**。因 id 相同 `switchSession` 会幂等早退，materialize 里显式补一次 `platformApi.activateSession(created.id)`，保证主进程 current-session 指针（todo 窗口等）跟上。
- workspace 持久化的 draft 判定从 id 前缀改为**注入谓词**：`serializeWorkspace(root, activeLeafId, isDraft)`，由 store 传 `sessionsStore.isNewChatDraftId`；hydrate 校验只需会话列表成员资格（draft 永不落盘也永不在列表里）。
- server 的 system-prompt snapshot 曾用 `draft:` 前缀放行未知会话，改为：未知 id 一律按 draft 处理返回默认快照（只读预览，无需严格 404）。
- 测试：`sessions-draft.test.ts` 更新为新契约（含 draft id 格式 pin）；workspace retarget 用例移除。全量 609 文件 / 3644 用例绿。
