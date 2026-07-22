# Goal 系统 v3：从「当前状态」到「有始有终的记录」

2026-07-19。承接 v1（`goal-system.md`）与 v2（`goal-system-v2.md`），只改**存储形态**，不改 v2 确立的「继续是模型的声明、停止是默认」决策范式。

## 0. 解决什么

goal 现在是 session 上的一个可变字段（`ChatSession.goal?: SessionGoal`），非活跃即蒸发。三条丢失路径：

1. **complete 后新建 goal → 直接覆盖**。`createGoal` 只用 `isGoalUnfinished` 挡「未完成」的，complete 的直接放行覆写（`src/main/goals/index.ts:77-91`）。讽刺的是 goal 恰在 complete 的那一刻才被 `enrichCompletedGoalWithFileChanges` 扫审计记录填满 `fileChanges`（`index.ts:126-128`）—— 信息最全的一版，正是被扔掉的那版。
2. **`clearGoal` → `persistGoal(sessionId, null)`**（`index.ts:108-112`），丢的是 paused/blocked/budget_limited 的 goal —— 恰恰是「悬案」信号，最值得留的那种。
3. 全仓无任何历史副本（`goalHistory|previousGoal|archivedGoal` 零命中）。

这不是设计取舍的结果。v1 §1/§3 关于「一会话同时只允许一个未完成 goal」的全部理由是照抄 codex（代码注释亦仅 `mirrors codex`，`state.ts:65`），文档对「完成后去哪」零讨论。

## 1. 核心原则

**保留「同时只有一个未终结 goal」的不变量，改掉「非活跃 goal 就地蒸发」的存储形态。**

前者是对的，且 `isGoalUnfinished` 把 paused/blocked/budget_limited 都算作未完成是**故意的** —— 这三个都可 resume，不该被静默顶掉。要改的只是：让位 ≠ 销毁。

goal 从「session 的当前状态」变成「session 里一串有始有终的记录 + 一个派生的 current」。

## 2. 数据模型

```ts
// ChatSession / SessionDetails
goals?: SessionGoal[]        // 按 createdAt 升序；替代 goal?: SessionGoal
```

`current` 不再是存储字段，而是派生值：**最后一条且状态非终结**的记录。没有则无当前 goal。

`SessionGoal` 新增三个字段：

```ts
endedAt?: number          // 进终结态时写一次，之后不再改
startMessageId?: string   // createGoal 时取会话最后一条消息
endMessageId?: string     // 进终结态时取
```

`endedAt` 必须独立于 `updatedAt`，因为 `updatedAt` 会被 fileChanges 回填二次刷新（`index.ts:152`）。这顺手修掉一个现存 bug：`MessageList.goalSummaryIndex`（`:717-726`）用 `goal.updatedAt` 反查锚点消息，所以 goal 完成后 fileChanges 一回填，摘要卡片会自己跳一格。改用 `endedAt` 后锚点不可变。

## 3. 状态机

新增终结态 `abandoned`（用户主动放弃）。状态分三类：

| 类别 | 状态 | 语义 |
| --- | --- | --- |
| 活跃 | `active` | 唯一会被续推的状态 |
| 占位 | `paused` / `blocked` / `budget_limited` | 停滞但可 resume，占着「当前 goal」的位置 |
| 终结 | `complete` / `abandoned` | 让位给新 goal，沉淀为历史 |

`isGoalUnfinished(goal)` → `isGoalTerminal(goal)` 的反面，判据从 `status !== 'complete'` 改为 `status ∉ {complete, abandoned}`。守卫行为不变：占位态仍然拒绝新建。

**`clearGoal` 语义从「删除」改为「归档为 abandoned」。** v1 把 clear 定位成「complete 之外的第二条脱身通道」，是 `isGoalUnfinished` 严格性的泄压阀 —— 这个定位保留，只是脱身不再等于销毁。用户放弃一个 blocked 的 goal，那条记录带着 `statusReason` 和 `fileChanges` 留在历史里。

`abandoned` 属**用户/系统专属**，不进 `GOAL_MODEL_SETTABLE_STATUSES`（仍为 `['complete','paused']`）。

## 4. 时间线锚定

`goal-set` 消息目前只带 `source: 'goal-set'`（`src/renderer/services/commands/index.ts:244`），与 goal 之间无 id 关联，`GoalSetMessage.vue:44-47` 靠 **objective 字符串匹配**取 live goal。有了历史后同一 objective 可重复出现，此路必错。

改为消息携带 `goalId`。老消息无此字段，fallback 保留字符串匹配（只在 `goals` 长度为 1 时启用，避免歧义）。

## 5. 迁移

坏消息：**没有字段级 migration 机制**。`storage-driver.ts:270-271` 把 `formatVersion` 读出即丢（`void formatVersion`），唯一的 migration 是 legacy-json → jsonl 的存储格式迁移，不是 schema 迁移。

方案：**读时 normalize + 过渡期双写**。

- 读：`goal` 存在而 `goals` 不存在 → 包成单元素数组。两者都存在且尾条 id 与 `goal.id` 不一致 → **以 `goal` 为准**修正尾条（和解回滚往返产生的偏差）。
- 写：`goals` 写全量；`goal` 继续写当前活跃那条（无则不写）。
- 过渡期结束后删除 `goal` 的写入，读时 normalize 保留更久。

双写的代价是冗余和潜在不一致，收益是**回滚安全** —— 老代码读 `goal` 行为完全正常，且往返后能被和解规则修回。考虑到本仓有大量未提交分支、且 `settings.storage.sessionFormat` 已有回滚开关的先例，这个代价值得付。

不 bump `JSONL_META_FORMAT_VERSION`：normalize 是幂等的读时逻辑，不需要版本分派。

## 6. 影响面

**Main —— 出乎意料地轻。** 所有读取都经过唯一底层入口 `storedGoal()`（`index.ts:58-60`），改它 + `persistGoal` 即可，上层 8 个调用点（update/model-status/usage/flush/continuation/error/success/abort）逻辑不动。`session-repository.updateSessionGoal` 对 goal 完全不透明（泛型 `TGoal`），仓储层无需改。

**续推链路零改动。** `canAutoContinueGoal` 只认 `status === 'active'`，作用于 current，语义不变。

**apps/server / apps/web 零改动** —— 两者完全没有 goal 实现（web 侧三个方法硬编码返回 "not supported"）。

**类型双份镜像**：`packages/onething-runtime/src/goals/types.ts` 与 `src/shared/ipc/goal.ts` 是结构性副本，两边都得改。

**IPC**：`GOAL_GET` 返回体从单个 goal 改为 `{ goals }`，current 由 renderer 派生。`GOAL_SET` 的 action 三元组保留 `'create' | 'update' | 'clear'`（`clear` 名字不变、行为改为归档，避免波及 slash command 与 UI 文案）。`GOAL_DIFFS` 需新增 `goalId` 参数 —— 它现在用 `goal.createdAt` 当审阅窗口起点（`src/main/ipc/goal.ts:96`），历史记录下必须指定是哪一条。

**Renderer**：`sessionGoals: Map<string, SessionGoal | null>` → `Map<string, SessionGoal[]>`，6 个消费组件跟改。其中：

- `GoalStatusBar` 只显示 current，改成读派生值，逻辑不变
- `GoalSummaryCard` 从「只渲染一张」改为按 `goals` 逐条锚定 —— `MessageList.vue:71` 的 `index === goalSummaryIndex` 变成 `goalSummaryIndexMap`
- `GoalSetMessage` 改按 `goalId` 关联（见 §4）

## 7. 分期

| 期 | 内容 | 状态 |
| --- | --- | --- |
| P0 | 数据模型 + 状态机 + 归档语义 + 读时 normalize/双写；UI 仍只显示 current | ✅ 已实施 |
| P1 | `endedAt`/`startMessageId`/`endMessageId` 锚点 + 摘要卡片锚点改用 `endedAt` | ✅ 已实施 |
| P1' | `goal-set` 消息带 goalId | ⬜ 未做，见下 |
| P2 | IPC 返回体改造 + `GOAL_DIFFS` 带 goalId + renderer store 携历史 + 多卡片渲染 | ✅ 已实施 |
| P3 | 文档收敛（见 §8） | ✅ 已实施 |

P0 单独上线即可止血，且不改任何用户可见行为 —— 这是本方案最重要的性质。

### 实施记录（2026-07-19）

落地文件：

- `packages/onething-runtime/src/goals/records.ts`（新）—— 列表纯函数：
  `currentGoalOf` / `isGoalTerminal` / `normalizeGoalRecords` / `mergeGoalRecord` /
  `pruneGoalHistory`。配套 `__tests__/records.test.ts`（24 测试）。
- `goals/types.ts` —— 新增 `abandoned` 状态、`TERMINAL_GOAL_STATUSES`、
  `endedAt`/`startMessageId`/`endMessageId`；修正与代码矛盾的文件头注释。
- `goals/state.ts` —— `isGoalUnfinished` 改判据、新增 `abandonGoal` 与
  `applyGoalSettlement`。
- `src/main/goals/index.ts` —— `storedGoals`/`persistGoal`/`persistGoalRecord`
  三个收口点；`clearGoal` 改归档；`createGoal` 记 `startMessageId`。
  配套 `__tests__/history.test.ts`（16 测试）。
- 仓储层 `updateSessionGoals`（双写单次 mutation）+ store/barrel 透传。
- IPC：`GOAL_GET` 带 `goals`、`GOAL_SET.clear` 带 `reason`、`GOAL_DIFFS` 带 `goalId`。
- 事件 `session:goal-updated` 带 `goals`；renderer store 加 `sessionGoalHistory`。
- UI：`GoalStatusBar` 排除 abandoned、`GoalSummaryCard` 加 DROPPED 淡墨态、
  `MessageList` 改多卡片 + 锚点改用 `endedAt`。

与设计的偏差：

1. **`persistGoalRecord` 是设计时未预见的第二条写入路径。** 完成后的 fileChanges
   回填要修改一条**已终结**的记录，而 `persistGoal` 会拿它跟当前 goal 比较并可能
   盖上错误的 `endedAt`。原实现用 `storedGoal()` 找回自己，在 v3 下必然返回
   undefined（终结的 goal 不再是 current）——**回填会永久失效**，已加回归测试锁定。
2. **`endedAt` 语义从「终结时刻」放宽为「最后一次离开 active」。** 摘要卡片在
   paused/blocked 时也显示，只覆盖终结态不足以锚定；resume 时清除。paused → abandoned
   不覆盖它 —— 工作停止的时刻是 pause，不是用户事后写销的时刻。
3. **`goal-set` 消息带 goalId 未做。** 它要改 `sendMessage` 签名与命令链路，而在
   renderer 仍以 current 匹配 objective 的前提下，行为与 v2 完全一致 —— 这个错乱只
   在「同一会话里设了两个同名 objective 的 goal」时才浮现。留作独立小改。

## 8. 顺手要修的文档/注释不一致

调研中发现的既有失配，与本次改动同批处理：

1. `goal-system.md`（v1）全文已被 v2 推翻大半（计数器盲推、模型只能置 complete/blocked），但**无 superseded 标记**，先读 v1 会被直接误导。顶部加指向 v2/v3 的说明。
2. `types.ts` 文件头注释仍写「model may only mark 'complete' or 'blocked'」，与同文件下方 `GOAL_MODEL_SETTABLE_STATUSES = ['complete','paused']` **直接矛盾**。
3. v1 §9/§11.5 称默认 token 上限 1,000,000 并据此做风险论证；代码实为**默认无上限**，该论证已失效。
4. `DEFAULT_GOAL_CONTINUATION_LIMIT` 语义已从 v1 的「续跑寿命额度」演化为 v2 的**失速检测器**（连续无进展计数），v1 §5c 描述不准确。
5. 多个代码实体无任何文档覆盖：`fileChanges`、`errorRetryCount`、`statusReason`、`GoalSummaryCard` 及其时间戳锚定、`kick.ts` 的 channel 保真设计。

## 9. 风险

1. **测试盲区大。** 状态机测试很完备（`state.test.ts`，107 处引用），但 `GoalManager`（pendingUsage 批量刷盘、`roundsSinceContinuation`、fileChanges 回填）、持久化、IPC handler、全部 goal UI **零测试**。本次改的恰是持久化形态 —— P0 必须补 `GoalManager` + 仓储层测试，否则是在没有安全网的地方动地基。
2. **`goals` 数组无界增长。** 一个长期 session 反复设 goal 会让 meta.json 持续变大，而 goal 写入是 whole-file rewrite。`fileChanges` 尤其可能很大（一个大 goal 改几十个文件）。建议：历史记录只保留最近 N 条完整体，更老的裁掉 `fileChanges` 仅留摘要计数。N 待定。
3. **双写和解规则是新的复杂度**，且只在回滚往返时才被触发 —— 属于「难以自然测到」的路径，必须有针对性单测。
4. `abandoned` 是新状态值，所有 `status` 的 switch/映射（UI 状态色、`GOAL_OUTCOME_STATUSES`、prompt 渲染）都要覆盖到，漏一处就是静默降级。

## 10. 与后续「会话分段」的关系

本方案是分段功能的地基，但**不依赖它**，可独立成立。分段需要的三样东西恰好由本方案产出：goal 的 `objective` 是用户显式声明的意图（比模型事后概括准）、`fileChanges` 是事实性的文件指纹、`blocked`/`budget_limited` 是**引擎记录而非模型自述**的「悬案」信号。锚点字段（§4）让这些能映射回消息时间线。

分段的其余部分（非 goal 段的边界判定、模型命名、缺席时间信号）不在本方案范围内。
