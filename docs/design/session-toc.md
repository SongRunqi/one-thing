# 会话目录（Session TOC）：把一段会话变成可读、可导航的意图脉络

2026-07-19。依赖 `goal-system-v3.md` 产出的 goal 历史记录，但不被它阻塞。

## 0. 解决什么

会话列表现在能告诉你的只有 `name` 和 `previewText`（第一条 user 消息截 100 字，`store-helpers.ts:929-960`）。隔一天回到一个会话，你想知道的三件事一件都答不上来：**里面做过什么、碰了哪些文件、哪件事没收尾。**

侧栏的 `Tooltip` 只显示会话名；side panel 的 outline（`assistant-message-outline.ts`）是「当前视口内那条最长 assistant 消息的 DOM 标题提取」，绑单条消息、绑渲染结果、还有「消息高度 ≥620px 且占视口 78%」的门槛 —— 它是**长回复内部导航**，与会话级脉络是两个东西，本方案不改造它，两者并存。

## 1. 形态

```
① 修复会话重命名吞空格                          3 轮 · 08:12–08:31
   MenuItem 把 Space 当菜单激活键吃掉了输入，顺带修了 IME
   回车提前提交、全局裸键快捷键吞字。
   MenuItem.vue · SessionItem.vue · useShortcuts.ts · editable-target.ts

② 给 tab header 加内联重命名                     1 轮 · 08:31–08:40
   双击标题进入编辑，墨签虚线下划线。
   TabItem.vue · TabBar.vue · ChatWindow.vue

③ 探讨 session preview 与会话分段                 6 轮 · 08:40–09:15
   （纯讨论，未改文件）

④ Goal 存储形态改造 v3                     12 轮 · 09:15–10:44   ✓
   单 goal 字段改成历史数组，clear 改归档，补时间线锚点；
   过程中发现 fileChanges 回填会永久失效。
   goals/records.ts · goals/state.ts · main/goals/index.ts · +9
```

**三段式：标题（做什么）→ 一句细节（怎么回事）→ 文件（碰了哪些）。** 目标是「详细而不模棱两可」——「改了某文件的某功能」要说清是哪个功能，而不是「进行了一些修改」。

纯讨论段不硬凑文件（③）。段涉及哪些消息**不展示**，但每段带锚点，点击跳转。

## 2. 数据模型

```ts
interface SessionSegment {
  id: string
  kind: 'task' | 'question'
  title: string                  // 短，一行
  detail: string                 // 一到两句
  files: string[]                // 从审计记录算出，不由模型给
  startMessageId: string
  endMessageId: string
  turnCount: number
  startedAt: number
  updatedAt: number
  /** 由 goal 投影而来的段，带上来源；此类段不调模型 */
  goalId?: string
  /** 仅 goal 段有：引擎记录的事实性结局 */
  outcome?: 'complete' | 'abandoned' | 'blocked' | 'budget_limited' | 'paused'
  /** 被模型修订过几次，用于观测收敛情况 */
  revision: number
}
```

## 3. 段有两个来源，可信度完全不同

**goal 段 —— 零推断、零成本。** `goals[]` 现在直接给出 `[startMessageId, endMessageId]`（v3 P1 落地）。`objective` 是用户显式声明的意图，比任何事后概括都准；`fileChanges` 是审计事实；`blocked` / `budget_limited` 是**引擎依据事实记录**的，模型碰不到（`state.ts` 的 `GOAL_MODEL_SETTABLE_STATUSES` 只放行 complete/paused）。这类段直接投影，模型不参与。

**推断段 —— 模型产出。** goal 之外的区间。大部分会话没设 goal，所以这是主体，但 goal 段给了它天然的锚点和分隔。

**结局（outcome）只在 goal 段展示。** 非 goal 段不显示完成状态 —— 模型有强烈倾向说「做完了」，一栏看起来权威实则是猜的信息，会毁掉整个面板的可信度。宁可留白。

## 4. 每轮机制：更新，而不是堆积

段不是 note 的集合，而是**一个被不断修订的描述**。每个实质轮次调用一次，模型输出三选一：

```ts
{ action: 'update' | 'new' | 'skip', kind: 'task' | 'question', title: string, detail: string }
```

- `update` —— 本轮延续当前段，用新的 title/detail **覆盖**（`revision++`）。段随时都是最新形态。
- `new` —— 本轮开了新意图，封存当前段，起一段新的。
- `skip` —— 本轮太琐碎，归入当前段，不改描述。

这样段边界**增量长出来**，不需要事后回溯切分；也不需要「段收尾再汇总一次」的第二级调用 —— 段结束时描述已经是最终形态。

代价：早期轮次的描述会被后期覆盖。这是**期望行为**——「上次做到哪」要的是最终结论，不是最初印象。

## 5. 事实与推断的分工

**能从事实拿的一律不问模型。**

`FileMutationAuditRecord`（`file-mutation-audit.ts:14-30`）带 `sessionId` / `timestamp` / `messageId` / `toolCallId`，所以段的文件清单可以按 messageId 区间**精确算出**，完全不用读 `messages.jsonl`。让模型给文件名，它会编、会漏、会把「提到过」当成「改过」。

模型的输出因此只剩四个字段，出错面小得多。

两个已知的实现细节：

1. 底层 `readRecordsForWindow(sinceMs, untilMs)`（`src/main/goals/file-changes.ts:41`）已经通用，但对外的 `collectGoalFileChanges` 把 until 硬编码成 `Date.now()`（`:84`）。加 `untilMs` 是纯增量改动。
2. **`collectGoalFileSpans` 做的是净效果聚合** —— 同一文件取窗口内最早 before 与最晚 after，中途改了又改回去的文件**整个消失**（`packages/onething-runtime/src/goals/file-changes.ts:120-124`）。对 goal 的交付摘要这是对的，对分段是错的：**分段要的是「碰过什么」，改了又改回去恰恰说明这段在这个文件上挣扎过。** 需要一个不折叠的变体。

**bash 改动不入账**（`goals/file-changes.ts:11-13` 明示），这是既有限制，本方案继承。

## 6. 成本控制

按拦截成本从低到高，五层：

### 6.1 调用前用免费信号拦掉（零成本 skip）

无工具调用 + 无文件改动 + user 消息短 → 直接归入当前段，**不进模型**。判据全部免费（审计记录 + `toolIterations`）。

代价：可能漏掉「短消息但重大转向」（比如只说了句「换个思路」）。下一条正好补上这个洞。

### 6.2 默认不带 reasoning

**长 user 消息自带意图，短消息才需要去思考里捞上下文。**「帮我把 goal 的形态改一下」已经说清楚了，思考里没有额外信息；「继续」「这个不对」才必须从 AI 的思考里才知道指的是什么。

规则简单到不需要任何判断成本：**user 消息超过 N 字就不带 reasoning**。这一条预计砍掉大部分轮次的思考输入。

### 6.3 硬预算 + 头尾挑选

给模型的输入设**硬上限**（建议 3000 token），按优先级填充，填满即止：

| 优先级 | 内容 | 理由 |
| --- | --- | --- |
| 1 | user 消息 | 意图最直接的声明 |
| 2 | 本轮碰的文件 | 事实，极短 |
| 3 | 当前段 title/detail | 判断 update/new 用，很短 |
| 4 | assistant 回复**结尾** | 结论在最后 |
| 5 | reasoning **头部**（剩余 ×0.7） | 意图几乎总在开头 |
| 6 | reasoning **尾部**（剩余 ×0.3） | 结论 |

reasoning 优先级最低、第一个被砍 —— **这保证了思考再长，输入也不突破上限**。中间省略处用 `…（省略 N 字）…` 标出，让模型知道有断裂。

不做简单截断而做头尾挑选，是因为思考的典型结构是「理解要求 → 探索试错 → 结论」，中间最长也最没用。

### 6.4 输出与辅助模型自身

`maxTokens` 设 200（标题 + 一句细节足够）。**必须确认 `settings.tools.toolCallModel.thinking` 保持 `false`**（默认值，`src/shared/defaults/settings.ts:262`）—— 否则辅助模型自己开始长考，那才是真正的失控。

### 6.5 熔断：降级而不是停

per-session 的 TOC token 预算，照 goal 那套记账 + 阈值翻转（`applyGoalUsage` / `statusAfterBudgetLimit` 是现成范式）。超限后**降级**为纯免费信号分段（缺席时间 + 文件集合切，标题用该段第一条 user 消息的 preview），功能还在，只是变糙。

### 6.6 量级参照

这个功能有个结构性优势：**输入有硬上限，不随会话长度增长**，而主聊天的输入随会话线性膨胀（每轮重发全量历史）。会话越长，本功能的相对成本越低。

对照用户最担心的长思考场景：`history.ts:566-569` 现在把完整 reasoning **每轮全量回灌**给模型，且全仓库对 reasoning **零截断**（`grep -iE "reasoning.*(slice|substring|truncat|MAX_|limit)"` 零命中）。DeepSeek V4 单轮思考 10k token、聊 30 轮，既有回灌约 `10k × 29 ≈ 290k` token 的纯重复传输；本功能大部分轮次不带 reasoning，带的时候封顶 3k，约 `3k × 8 ≈ 24k`。**差一个量级还多。**

> 附带结论：真正值得单独决策的是那个既有的全量回灌。`getMessageReasoningContent`（`packages/core/engine/history.ts:491`）是单一收口点，改一处覆盖全部历史重建路径。不在本方案范围内。

## 7. 边界情况

| 情况 | 处理 |
| --- | --- |
| 纯问答，不是任务 | `kind: 'question'`，不列文件。这本身是有效信息 |
| 模型没有 reasoning | 退化成 user 消息 + 回复。思考是加分项不是必需品 |
| reasoning 极长 | §6.3 硬预算兜住，reasoning 第一个被砍 |
| 一轮跑了 30 个工具调用 | 输入仍受硬预算约束；文件清单由审计记录给，与轮次大小无关 |
| goal 覆盖的区间 | 直接投影，不调模型（§3） |
| 会话正在流式中 | trigger 只在成功路径跑，天然不会撞上 |

## 8. 存储

**`sessions/<id>/segments.jsonl`**，紧挨 `messages.jsonl`。

理由：这份数据**按 session 查**而不是按时间窗查。全局账本（usage 那种按月分片）在这里是错的 —— 查一个 session 的分段要扫全月。放 `meta.json` 也不行，它是 whole-file rewrite（`storage-driver.ts:148-160`），而段描述会被反复修订。

per-session 文件还天然跟着会话一起被删除/迁移。

注意：现有代码**没有 per-session 派生数据文件的先例**（除 meta 外没有 `summary.json` 之类），这是开新范式而不是套现成的。

## 9. 触发时机

落点是 **`TriggerManager`**（`src/main/engine/triggers/`），不是插件的 `afterAssistantResponse`。理由是 `TriggerContext`（`packages/core/engine/triggers.ts:68`）信息更全：`lastUserMessage` / `lastAssistantMessage`（本轮 assistant 全文）/ `messages` / `toolIterations` / `promptCapture`，且 `turn-evaluation.ts` 已经完整演示了「trigger 里写旁路 JSONL」这套。

工具调用列表不在 context 顶层，需从 `ctx.messages` 里挖最后一条 assistant 消息的 `toolCalls`（`turn-evaluation.ts:41-60` 是现成写法）。

触发时机是**每个 assistant 回复后一次**，不是每个 tool loop 轮次 —— 正好是「一轮对话」的粒度。

**必须异步化。** `CoreTriggerManager.runPostResponse`（`triggers.ts:147`）按 priority 升序**串行 await**，同步跑一次模型调用会直接拖长每个回合的收尾（用户看到「回复完了还在转」）。照 soul-memory 的做法：`setTimeout` + `unref`，并用它那套双保险防陈旧 —— 定时器未被 clear **且** 触发时回查最后一条 assistant 消息仍是当初那条（`soul-memory.ts:1063-1096`）。

## 10. 缺失的封装

**没有通用的 `callModel(prompt, {provider, model})`。** 现状是三套各自为政：`resolveToolCallModel`（`packages/core/engine/title.ts:27`，只解析 provider/model 不发请求）、evals 的 `createEvalsModelCaller`（绑死 OpenAI 兼容 HTTP）、memory 的 `createSoulMemoryToolProvider`。

完整样板在 `skill-review.ts:72-106` 写过一遍（含 auth 解析与 thinking 透传）。**抽成 `createUtilityProvider(settings, ...)` 是本方案的必要前置**，抽出来之后 title / memory 那几处重复也能顺带收敛。

## 11. 前置：把侧线记账接上

**这一步独立成立，且应该先做。**

用户要求能看到「TOC 功能花了多少钱」。好消息是 `source` 字段**早就持久化在 ledger 记录里**（`packages/onething-runtime/src/usage/types.ts:27`），只是聚合时被丢掉了 —— `computeOnethingUsageSummary` 只 accumulate `byProvider` / `byModel` / `byPlatform`，**从头到尾没读过 `record.source`**。

加 `bySource` 是纯增量、**历史数据不用回填**：

| # | 文件 | 改动 |
| --- | --- | --- |
| 1 | `packages/onething-runtime/src/usage/summary.ts:30` | `OnethingUsageBucket` 加 `bySource` |
| 2-5 | 同文件 `:182 / :187 / :210 / :216` | 初始化、map、accumulate、收集 |
| 6 | `src/renderer/components/settings/UsageSettingsPanel.vue:~320` | 仿 `selectedModels` 加 `selectedSources` |

`src/shared/ipc/usage.ts` 与 `src/main/ipc/usage.ts` 不用动（类型 re-export + handler 透传）。

**坑：现在只有 `chat` 和 `evals` 两个 producer 在流通。** 拆出来只会看到两行。要让标签有意义，得同时把 title / memory capture / memory review / skill-review 四处接上 `recordUsage` —— 它们都已经在用 `toolCallModel`，接线位置很清楚。

顺带修两个既有失配：

- `src/main/usage/index.ts:2-5` 的文件头注释宣称 "every LLM call — main chat path and side-line calls (title/memory/evals/goal) — lands in the same append-only JSONL ledger"，**与实际不符**（`docs/design/token-billing.md:103` 确认只有 P1 落地）。
- `byProvider` / `byPlatform` 后端已在返回，UI 直接丢弃 —— 可一并捡回。

另注：`src/main/goals/runtime-hooks.ts:68` 有一个**同名但无关**的 `recordUsage(sessionId, usage)`，那是 goal 预算限流，不写 ledger。搜索时勿混。

## 12. 分期

| 期 | 内容 | 独立价值 |
| --- | --- | --- |
| P0 | `bySource` 记账 + title/memory/skill-review 四处接线 | ✅ **已实施**（见下） |
| P1 | `createUtilityProvider` 封装 | ✅ **已实施** |
| P2 | 段数据模型 + goal 段投影 + 免费信号粗切（**不调模型**） | ✅ **已实施**（粗切改作降级路径） |
| P3 | 推断段：trigger + 每轮 update/new/skip + 五层成本控制 | ✅ **已实施**，未真机跑过 |
| P4 | hover preview 出口 | ✅ **已实施**，未真机跑过 |
| P5 | side panel 会话级 outline（与现有消息内 outline 并存） | ✅ **已实施**，未真机跑过 |

**P2 有意做成不调模型的版本**：goal 段直接投影，非 goal 区间按缺席时间 + 文件集合粗切、标题取第一条 user 消息 preview。几乎不花钱，但能立刻回答「分段这件事本身对不对」。如果粗切结果就已经离谱，说明边界必须靠语义，P3 的设计要重想；如果大致对，模型就只负责命名，风险很小。

### P0 实施记录（2026-07-19）

**调研否定了原估计。** §11 原说「接线位置很清楚」，实际上 title / memory 这两条路上
**usage 根本没往上传**：`OnethingTextChatResponseResult` 只有 `{ text }`。根因是
`runOnethingUtilityAgentTurn`（`providers/agent-turn.ts`）丢弃了 `turn.usage`，而它的
stream 孪生函数 `streamOnethingUtilityAgentTurn` 一直正常 yield —— 补这一行是解锁
title + memory 的单点撬动。

四条路的真实状况（与 §11 的假设有出入）：

| 场景 | 原假设 | 实际 |
| --- | --- | --- |
| skill-review | 漏账 | 漏账，但 `AgentLoopResult.usage` 现成，零类型改动 |
| soul-memory | 漏账 | 漏账，走 `generateChatResponse` 文本路，usage 被丢 |
| title | 漏账 | 漏账，同上；且主路径在引擎内（`stream-engine-runtime`）而非 IPC handler |
| goal / radio | 未提 | **已记为 `chat`** —— 它们 re-drive 完整主聊天回合，无需接线 |

落地：

- `providers/agent-turn.ts` —— `OnethingChatResponseResult` 加 `usage`，返回 `turn.usage`。
- `providers/provider-routing.ts` / `provider-facade.ts` —— usage 走 **side-channel 回调**
  （`onUsage`）而非加宽返回类型：`generateChatResponse` 返回 `Promise<string>` 是遍布
  全仓的契约，改它会引发大面积连锁修改。facade 层把 `onUsage` 从 options 里剥掉，
  不让它进 provider 请求。
- `src/main/usage/bill-side-line.ts`（新）—— `billTitleUsage` / `billSkillUsage`，各自
  吞掉自己的异常：记账不能弄坏它在计量的工作。
- 接线四处：`stream-engine-runtime.ts`（title 主路径，sessionId 由 `debugSessionId` 携带）、
  `ipc/chat.ts`（title 次路径）、`plugins/builtin/soul-memory.ts`（capture + review）、
  `engine/triggers/skill-review.ts`。
- `usage/summary.ts` —— `bySource` 聚合（历史 ledger 已存 `source`，**无需回填**）。
- `UsageSettingsPanel.vue` —— "By activity" 明细，内部 key 映射成用户认得的名字
  （`title` → Chat naming）。单一来源时整段隐藏。
- `usage/types.ts` —— `ONETHING_USAGE_SOURCES` 常量表。**有意不把 record 上的 `source`
  收成闭合 union**：ledger 是 append-only 且已存历史值，收窄会让旧记录读不出来。

偏差：

1. **`bySource` 在 renderer 侧做了 `?? []` 防御。** 它跨 IPC 边界而来，老 main 进程或
   其他 host 可能不带；降级成隐藏该行，好过整个面板崩掉。
2. **`generateOnethingChatTitle` 的 adapters 未加 `onUsage`。** 一度加了又回滚 ——
   main 侧的 adapter 实现本来就能看到 providerId / model / `debugSessionId`，
   在那里接线不用碰 core 和 runtime。

### P1 / P2 实施记录（2026-07-19）

**P1** —— `src/main/providers/utility-provider.ts`：`createUtilityProvider(settings, options)`
把「解析 tool-call 模型 → 查 provider 配置 → 解析 auth → 建 agent provider」四步收成
一处。skill-review 已改用它（真实消费者验证抽象），原来那 30 行开码删除。

一个设计决定：**`fallbackToChatProvider` 默认关**。skill-review 原本就是「没配 tool-call
模型就不跑」，而 title 走的是「回退到主 provider」——两套规则此前散在各处、彼此不知道。
默认关是保守的一侧：后台任务悄悄跑在昂贵的主聊天模型上，比它不跑更糟。

**P2 纯逻辑** —— `packages/onething-runtime/src/toc/`（21 测试）：

- `segmentsFromGoals` —— goal 历史投影成段。**跳过 active 的 goal**（那段还没结束，
  当成已结算条目展示是撒谎）；`endedAt` 优先于 `updatedAt`（后者在完成后仍会被
  fileChanges 回填改写）。
- `userWasAway` —— 缺席时间**从最后一条 assistant 消息算起**，不是从上一条 user 消息。
  这是设计讨论里被用户当场否掉的那版：agent 可以为一条指令干三小时，按 user→user 间隔
  会把「等它干完后五分钟的追问」判成新意图。测试直接钉住这个反例。
- `touchesDisjointFiles` —— 任一侧没碰文件时**返回 false**（没有证据 ≠ 反证）。
- `coarseSegments` —— 免费信号粗切。**过滤 `source: 'goal' | 'radio'` 的合成 user 消息**：
  它们在 transcript 里长得和真实用户轮一模一样，不滤会把一个续推十次的 goal 炸成十段。
- `mergeSegments` —— goal 段与粗切段合流，**重叠处 goal 胜**（事实压推测）；落在 goal
  跨度内的粗切段整段丢弃而非裁剪，因为裁剪会宣称一个免费信号从未确立过的边界。

新建 runtime 子路径必须登记 alias：`electron.vite.config.ts` 与 `vitest.config.ts` 是
**逐项列举**的（tsconfig 用通配符所以自动覆盖，会掩盖遗漏），且末尾有 `@onething/runtime`
兜底项会静默吞掉未登记子路径。已加临时用例走 alias 导入验证解析成功后删除。

未做（P2 剩余）：`segments.jsonl` 存储、IPC、UI 出口。

### P3 实施记录（2026-07-19）

用户决定跳过 P2 的可见验证直接做 P3；粗切逻辑保留为 §6.5 熔断降级路径。存储是 P3
的必需前提，并入本期。

落地：

- `toc/input.ts` —— 五层成本控制里的输入构建。**预算不变量有扫描测试**（4 档预算 ×
  4 档 reasoning × 3 档回复，含 20 万字符思考），因为这是整个功能的成本保证，单个
  手挑用例不足以当证据。
- `toc/decide.ts` —— 免费 skip 判据 + 模型输出的防御式解析。无标题的段**判为解析失败**
  而不是接受：一个空标题在面板上是用户无法处置的空行。
- `toc/apply.ts` —— update **覆盖**而非追加；`skip` 仍记录 turn（文件与尾锚点前移），
  因为这一轮确实发生了，只是没改变这段是关于什么的。`openSegmentOf` **绝不延续 goal 段**
  （它是已完成 goal 的投影，延续会让投影和 goal 记录打架）。
- `toc/store.ts` —— `sessions/<id>/segments.jsonl`，**append-only + 读时按 id 折叠**
  （段几乎每轮被改写，全量重写是纯写放大），超阈值compact；坏行跳过而非整份读失败。
- `toc/content/toc-turn.md` —— 提示词按仓库惯例分离到 content。明确要求不在标题/细节
  里列文件名（文件另行展示，重复是浪费）。
- `main/toc/index.ts` + `engine/triggers/session-toc.ts` —— trigger **只排定时器不做调用**，
  照 soul-memory 的空闲双保险（定时器重新武装 + 触发时回查最后一条 assistant 消息仍是
  当初那条）。
- usage source 新增 `toc`，面板显示为 "Session outline"。

测试抓到的真 bug：`previousTurnEndedAt` 为 `0` 时被 `&&` 判为 falsy，缺席时间信号
静默丢失。已改为显式 `!== undefined`。

偏差：§6.5 的 per-session token 预算熔断**未实施** —— 目前的约束是硬输入上限 +
免费 skip + 「未配置 tool-call 模型即整个功能关闭」。等 `bySource` 有真实数字之后
再定阈值，比现在拍一个更有依据。

### P4 实施记录（2026-07-19）

- `Tooltip.vue` **加 `content` 插槽**而非新建组件（遵循 CLAUDE.md「组件化而不是创建
  新的组件」）。`text` prop 变为可选，既有调用点零改动；富内容时去掉为单行标签设计的
  深色胶囊与箭头。
- `SessionPreviewCard.vue` —— 账页画线风。goal 段的序号走朱砂（它是事实投影而非推断）；
  **outcome 只在有的时候显示**，非 goal 段留白。文件只显示 basename。
- `SessionItem.vue` —— **首次 hover 才拉取**。侧栏 200 个会话若随列表一起读，就是 200
  次分段文件读取去渲染没人看的行；await 后回查 session id，防指针已移走。
- IPC 全链路：channel / handler / preload / renderer 类型 / web stub。web 端没有 TOC
  管线（它跑在 Electron 主进程），stub 返回空而不是报错 —— hover 时静默隐藏预览。

两个实现中发现的真问题：

1. **`.tooltip` 原本是 `pointer-events: none` 的**，所以卡片里的 `overflow-y: auto`
   永远滚不动 —— 内容被裁掉且用户够不着。**随后由安全三角区解决**（见下），卡片改为
   可达且可滚动。
2. **`left`/`right` 定位是垂直居中的**，高卡片在列表顶/底会溢出视口。给 Tooltip 加了
   视口钳制（测量已渲染高度，首次显示前回退到粗略值）——这对所有 left/right tooltip
   都是改进，不只是本功能。

### P4' 安全三角区（2026-07-19）

hover 卡片要能「看得舒服」，指针就必须够得着它。但从会话行斜着移向卡片的路径会扫过
中间的其他行 —— 朴素的 mouseleave 会把这段路读成「换了个 hover」，卡片在半路就没了。

`common/safe-triangle.ts`（纯几何，10 测试）：以指针离开触发元素的位置为顶点、卡片朝向
它的那条边为底边构成楔形。在楔形内视为「正在赶路」，**离开楔形立刻关闭** —— 宽限期是
给行程的，不是给已经走去别处的指针。底边向外扩 12px，因为指针很少精确瞄准角点。

`Tooltip` 新增 `interactive` prop（默认关：单行标签没有可赶的路，让它可命中只会白白吞
点击）。开启后：卡片 `pointer-events: auto`；离开触发元素时建楔形 + 400ms 宽限；指针
进入卡片则交由卡片自身的 mouseleave 接管；回到触发元素视作从未离开。

因为卡片够得着了，`SessionPreviewCard` 恢复滚动（`max-height: min(60vh, 460px)` +
`overscroll-behavior: contain` 防滚动链穿透到侧栏），条数上限从 6 放宽到 14 —— 它现在
只是为了约束 DOM，不再是为了藏内容。

回归验证：把三角区判定短路掉（等价于没有它），「指针朝卡片移动时保持打开」这条立刻挂。

**触发区改为整行。** 原先只有会话名那个 `<span>` 能唤出预览。直觉做法是把 `Tooltip`
包在整行外面，但 **`.session-item` 用 `margin-left: -12px` 把自己拉满行宽，且必须保持是
`MenuItem` slot 的直接子元素** —— 中间插一层 wrapper 会让负边距失效。

改为给 `Tooltip` 加 `triggerEl` prop：它在这个外部元素上监听 hover、也用它定位与构建
安全三角区，DOM 层级一动不动。此模式下 wrapper 本身 `display: none` —— 一个空的
`inline-flex` 盒子仍会在父级 flex 行里占一个 item 并吃到 `gap`，把旁边的东西挤位。
重命名期间 `:disabled` 关掉预览，免得浮层盖住正在编辑的输入框。

### 首次真机的失败与修复（2026-07-20）

功能上线后一条段都没生成。诊断链（每一步都有日志佐证，未靠猜测）：trigger 已注册
（`Running 4 triggers`）→ 已执行（`Executing trigger: Session TOC`）→ 45 秒静默期分秒
吻合 → prompt 已构建（日志里就是本方案的 `<user_message>…<user_away_minutes>` 格式）
→ 模型请求已发出（`messageCount: 2, toolCount: 0`）→ **之后什么都没有**。

根因：**`thinking` 没有显式传给 `runAgentLoop`**，走了 provider 默认。deepseek-v4-flash
是混合推理模型，把整个 200-token 输出预算烧在推理通道里，正文返回空串。每一轮都照常
计费，却什么都没产出。§6.4 写明了「必须确认 `toolCallModel.thinking` 保持 false」——
**文档说对了，实现只读了设置值却没把它传下去**。

修复三件，前两件是根因，第三件是让下一次失败不再需要这样从头查一遍：

1. `thinking: "disabled"` **无条件传**，不看 `toolCallModel` 的开关 —— 那个开关管的是
   用户自己的聊天；这里一个空回复比不推理糟得多。`maxTokens` 200 → 500 作为「provider
   无视该标志」时的余量。
2. **JSON 提取改为括号配对扫描**（原来是 `/\{[\s\S]*\}/` 贪婪跨度）。小模型常在答案外
   加一段话或补第二个对象，贪婪跨度会把它们一并吞下导致解析失败 —— **丢掉一个本来就
   在那里的答案**。扫描时跟踪字符串状态，标题里的 `{` 不会截断。
3. **每条早退都打日志**，解析失败时附模型原话前 300 字；模型调用加 60 秒超时。
   在此之前 skip / 无 provider / 解析失败三条路径全部静默，「失败了」与「功能没开」
   在外部无法区分 —— 这才是这次要从日志一路倒查的真正原因。

`recordTocTurn` 补测试（8 条），撤掉 `thinking: "disabled"` 会立刻挂两条。

### P5 实施记录（2026-07-20）

side panel 新增 **Contents** section，排在既有 **Outline** 之前（会话脉络比单条消息内的
标题更宏观），两者**并存不替换**。段行可点击，经 `ChatContainer.jumpToMessage` 跳到
`startMessageId` —— 那条链路已处理「目标不在当前分页窗口内 → `loadMessagesAround` → 再滚」。

段列表抽成 `common/SessionSegmentList.vue` 供 hover 卡片与 side panel 共用（CLAUDE.md
「组件化而不是创建新的组件」），`clickable` 决定行渲染成 button 还是 div；没有
`startMessageId` 的段渲染为 disabled，而不是给一个点了没反应的按钮。

draft 会话不渲染 Contents：它没有落盘的会话，也就没有段，空 section 是纯噪音。

加载时机：session 变化或该 section 获得焦点时重新读。段是会话静默后才写的，列表按构造
就是陈旧的 —— 聚焦时重读比定时轮询文件便宜。

实施中撞到的既有 bug：**`readStoredFocus` 用手写的 `stored === 'system' || ...` 链校验**，
新增 section 不在其中就静默回退 `outline`。表现是「点了 Contents，重载后又跳回 Outline」。
改为从一个 `RESTORABLE_SECTIONS` 常量判定；该常量必须声明在 `SectionId` 旁而非
`readStoredFocus` 附近 —— 后者在 setup 早期就被调用，`const` 的暂时性死区会直接抛错。

## 13. 风险

1. **`skip` 的免费判据可能漏掉「短消息重大转向」。** §6.2 的「短消息才带 reasoning」正好是这个洞的补丁，但两条规则的阈值需要一起调，不能各调各的。
2. **段描述被反复覆盖 ⇒ 写放大。** 每个实质轮次改写一次 `segments.jsonl`。段数量小、记录小，但要确认走 append + 读时取最新，而不是每次重写全文件。
3. **推断段的边界无法回溯修正。** 增量决策是局部的：第 3 轮时不知道第 5 轮会把话题拉回来。本方案接受这个代价（全量重切留作后手，见 v3 里 memory review 的先例）。
4. **`abandoned` / `question` 类段容易被误当成「没做完」。** 展示时要区分「主动放弃」「纯讨论」「真卡住」，否则面板会显得到处是烂尾。
5. **模型倾向宣称完成。** 已通过「非 goal 段不显示 outcome」（§3）规避，但如果后续有人想给推断段加状态栏，这条必须重新论证。
6. **首个 per-session 派生文件。** 会话删除 / 迁移 / JSONL↔legacy 切换的路径都要覆盖到，否则会留下孤儿文件。
