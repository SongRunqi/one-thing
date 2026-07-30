# todo2 十项问题修复方案

> 2026-07-30。对应 `todo2.md` 的 10 条问题。四路代码调查已完成，本文按「根因 → 修法 → 动哪些文件」组织，并按优先级分批。
>
> 有两处修法会**推翻此前的刻意设计**（W22 判定即承诺、team-v2 §2.1 工具面 union），已在文中显式标注，实施前请确认。

---

## 全景表

| # | 问题 | 根因（一句话） | 批次 |
|---|------|--------------|------|
| 1 | edit 失败歧义 | 底层文案够详细，坏在包裹前缀 + UI 只取首行截断 + 一个误标"已取消"的真 bug | P0 |
| 2 | 群聊消息重复 | say 无幂等 + 回合首调被硬性钉成 say，模型把同一段话 say 两次；doom-loop 阈值 4 拦不住 2 次 | P0 |
| 3 | 群聊 preview 自动调用 | agent 无工具白名单时房间工具面 = 不限制，外部 MCP 工具（如 render_preview）全量进场，与提示词"只有 say 和 board"矛盾 | P0 |
| 4 | say "不说了/保持静默" | `turn.ts:610` named-force 第一调必须是 say，无话可说的 agent 只能用 say 说废话（W22 设计后果） | P0 |
| 5 | agent 响应逻辑文档 | 纯文档产出 | P1 |
| 4b | agent 提示词组装文档 | 纯文档产出 | P1 |
| 6 | 群聊可折叠 | room 分组只有 head/tail 边界，无 group 身份，UI 无折叠开关 | P1 |
| 9 | agent 列表重复 | 执行会话 id 变成每群一条（`agent-exec-<agentId>-<roomId>`），侧栏按 session 列且不按 agentId 去重 | P1 |
| 10 | 群聊中设置更新不生效 | 命令级 model override 永远压死会话选择 + permissionMode spawn 时快照且续做时重抄覆盖用户改动 | P1 |
| 7 | 图片头像 | avatar 现为纯 emoji 字符串，8+ 处 `{{ avatar }}` 直出，无图片支持 | P2 |
| 8 | 角色卡文件是什么 | 已有答案，见下，无代码改动 | — |

**#8 直接回答**：角色卡存在 `~/.onething/agents.json`（单 JSON 文件，`{version:1, agents:[...]}`），persona 原文就是每个 agent 的 `systemPrompt` 字段（schema：`packages/onething-runtime/src/agents/store.ts:24-61`）。注意 `~/.onething/agents/` 目录不是角色卡，是 soul-memory 的 per-agent 记忆工作区。

---

## P0-1　edit 失败歧义（todo #1）

### 现状与根因

引擎层（`packages/onething-runtime/src/tools/edit-engine.ts`）的错误文案其实已经很详细——找不到时给 `Closest match` 上下文片段（`:179-217`）、多处匹配时提示 replaceAll（`:235-240`）。歧义产生在三层包裹/展示上：

1. **前缀噪声**：`tools/builtin/edit.ts:126` 包一层 `Failed to edit <path>: `，与引擎文案里的路径重复；审批重放失败时三层嵌套（`edit.ts:366` + `:126` + engine）。真正可行动的信息被推到最后。
2. **UI 看不到原因**：
   - 折叠行 `StepsPanel.vue:111-114` 的错误摘要由 `tool-activity-view.ts:267-288 compactFailureReason` 生成——**只取第一行、截 180 字**，CSS 再 `nowrap + ellipsis`，屏幕上只剩半句泛化建议；
   - 失败无徽标（`StepsPanel.vue:401-411` 对 failed 返回 `''`），失败行与成功行同形，只差文字颜色；
   - 失败的 edit **默认折叠**（`tool-step-view.ts:412` 对 failed/rejected 返回 false）；
   - rejected 直接返回空串，一个字不解释（`tool-activity-view.ts:236-237`）。
3. **真 bug（最硬的一处）**：`packages/core/engine/direct-tool-execution.ts:227` 用子串 `message.includes('cancelled'|'aborted')` 判取消。edit 的"找不到"错误内嵌了文件正文片段，目标文件那 20 行里只要出现 `aborted`/`abortSignal`/`cancelled` 字样（本仓库极常见），**匹配失败就被误标成 CANCELLED**，且因 status ≠ failed 连错误摘要都不显示。
4. **模型侧**：`agent-loop/providers/claude.ts:337-347` 构造 tool_result 从不设 `is_error`；`core/engine/history.ts:848` 审批恢复路径的失败结构只剩光秃秃 `{error}`。

### 修法

**a) 误标取消 bug（最先修）** — `direct-tool-execution.ts:227` 废除子串判定，只信 `context.abortSignal?.aborted` 与结构化中止标记（可让工具层抛带 `name: 'AbortError'` 或 `aborted: true` 属性的错误，取消路径显式标记）。

**b) 错误文案结构化：首行 = 简短原因，细节在后**。改 `edit.ts:122-127` 的包裹：不再拼 `Failed to edit <path>: ` 前缀（路径引擎文案里已有），并约定每个失败分支首行是一句短原因，例如：

| 分支 | 首行 |
|---|---|
| oldText 找不到 | `Edit failed: target text not found in <basename>.` |
| 多处匹配 | `Edit failed: text matches N places in <basename> (need unique text or replaceAll).` |
| 文件不存在 | `Edit failed: file not found: <path>` |
| 审批后文件被改 | `Edit failed: file changed after approval, retry needed.` |

第二行起保留现有细节（Closest match 片段等）。`edit.ts:362-368` 的三层嵌套改为只保留最内层引擎文案 + 一行审批场景说明。

**c) UI 三处**：
- `tool-activity-view.ts` 的 `compactFailureReason`：改为取"首行短原因"完整展示（配合 b 后首行天然 ≤ 80 字），不再截 180；rejected 分支返回拒绝理由（数据在 `toolCall.error` 里，现在被丢弃）。
- `StepsPanel.vue:401-411`：failed 返回徽标文字（如 `失败`），与 cancelled/rejected 同级呈现。
- `tool-step-view.ts:412`：失败的 edit 默认展开（至少 failed 保持展开，rejected 可维持折叠）。

**d) 模型侧（低成本顺手修）**：`claude.ts` tool_result 构造处对 `status === 'failed'` 设 `is_error: true`；`history.ts:848` 的降级 failureResultForAI 补齐 `status: 'failed'` 字段。`toolFailureResultForAI` 回灌整份 edits 参数的噪声问题（`tool-result.ts:127-147`）本期不动，只在 parameterSummary 里补上失败那条的 `edits[i]` oldText 首行。

### 验证
- 单测：edit-engine 各失败分支首行断言；direct-tool-execution 对"错误文案含 aborted 字样但未中止"断言 status = failed。
- 真机：故意用过期 oldText 触发失败，确认折叠行能读出原因、徽标显示"失败"、详情默认展开。

---

## P0-2　群聊一次 say 出两条（todo #2）

### 根因（两个，按可能性）

**A（首选）：say 无幂等 + 回合首调被强制为 say。** `app/collab/say-tool.ts:174-193` 每次调用无条件 `randomUUID()` 新建消息落库，没有任何幂等键。唯一护栏是 doom-loop 检测，阈值 4（`core/agent-loop/tool-signature.ts:26-30`）——重复 2 次完全落在护栏之下。而 `turn.ts:610` 的 `initialToolChoice` 把第一调钉成 say，本想正文作答的模型被强制先 say，下一圈容易把同一段话再 say 一次当"正式作答"。

**B（次选）：nudge 轮误触发且同样带强制 say。** `turn.ts:682-707` 的 nudge 复用同一个 `emitDrive` 闭包（携带 `:610` 的强制 say）；判定输入 `sayCallCount` 只扫执行会话**最后一条** assistant 消息的 toolCalls（`:690` + `harvestTurnMessages:241-248`），多轮回合里 round2 纯正文收尾时 sayCallCount 误判为 0 → nudge 再驱一轮 → 被强制再 say 一次。

### 修法

1. **say 幂等**（结构保证）：`speakIntoCollabRoom` 维护 per-activation（或 5s 窗口）的 `(roomSessionId, agentId, content)` 指纹缓存，命中时不再落库，直接返回上次的 messageId 回执。改动集中在 `app/collab/say-tool.ts`。
2. **nudge 判定修正**：`sayCallCount` 改为扫 harvest 窗口内**全部** assistant 消息的 toolCalls，而非只看最后一条。
3. **nudge 轮去掉强制 say**：nudge 的 drive 不带 `initialToolChoice`（nudge 文案本身已明说"确实不想说就什么都不用做"，强制与文案矛盾）。
4. P0-4 移除首调强制后，根因 A 的诱发面同步消失。

顺手加固（可选）：`queue.ts:124 enqueue` 加 `(agentId, sourceMessageId, reason)` 去重，把今天散在上游的去重变成入队处的结构保证。

### 验证
- 单测：同 content 连调两次 say → 房间只有一条消息、第二次回执复用 messageId；多轮回合 round1 有 say + round2 纯正文 → 不触发 nudge。

---

## P0-3　群聊 preview 自动调用（todo #3）

### 根因

仓库里**没有**叫 preview 的内建工具。`collab/tool-surface.ts:44-63` 的规则是：agent 档案配了 `tools` 白名单 → own ∪ {say, board}；**没配（= null = 跟随全局）→ 返回 null = 完全不限制**。于是所有已注册工具——包括 MCP 动态注册的（`app/mcp/bridge.ts:155`，比如设计类 MCP 的 `render_preview`）——都进了群聊工具面。而情况说明 `collab/roster.ts:87` 却写着「除 say 和 board 外你在群里没有其他工具」。**提示词与真实工具面不一致，模型看见有 preview 就顺手调。**

（另一个"preview"是 write/edit 权限请求前的 `phase:"preview"` 计划元数据——那是代码内部机制不是工具调用，若用户指的是它，属于 diff-UI 呈现问题，另议。落地前先在真机群聊里确认一次实际被调的工具名。）

### 修法

**房间回合的工具面收紧为恒等于 `COLLAB_ROOM_TOOLS`（say + board）**，与提示词对齐：

- `collab/tool-surface.ts`：`kind === 'room' | 'agent'` 分支不再依赖 own 是否为 null，直接返回 `[...COLLAB_ROOM_TOOLS]`（agent 白名单只影响 `kind === 'work'` 工作台会话——重活本来就该建卡到工作台做，这正是通用规则里"轻重活分界"的语义）。
- ⚠️ **这推翻 collab-team-v2 §2.1 的 union 取舍**（`tool-surface.ts:54-62` 注释）。理由：union 设计的收益（房间里顺手用自己的工具）在实践中表现为工具噪声（preview 自动调用），且与"只陈述不指挥"的情况说明直接矛盾；工作台会话不受影响，能力没有损失。
- 同步检查 `agents/profile.ts:152-178 resolveAgentToolSurface` 的同形规则。

### 验证
- 单测：无白名单 agent 的 room/agent 回合工具面 = ['say','board']。
- 真机：配置了 MCP 的环境里发起群聊，确认 agent 不再出现 MCP 工具调用。

---

## P0-4　say "不说了/保持静默"废话消息（todo #4 后半）

### 根因

提示词全链路都说"可以沉默"（`roster.ts:82`、say 工具描述、nudge 文案），但 `app/collab/turn.ts:610`：

```ts
initialToolChoice: { type: 'function', function: { name: COLLAB_SAY_TOOL_NAME } },
```

把回合第一次模型调用**硬性钉成 say**（W22"判定即承诺"）。被 @、被任务事件拉起来但实际无话可说的 agent 没有"不说"的出口，只能调 say 输出「不说了 / 保持静默」。**行为由代码决定，提示词说什么都没用。**

### 修法

⚠️ **推翻 W22 决策**（论述在 `collab/say.ts:131-149`）。删除 `turn.ts:610` 的 `initialToolChoice`，回归"提示词允许沉默 + nudge 事实提醒"：

- W22 想防的"双重决策"问题由既有机制兜住：nudge（每 activation 一次，`turn.ts:682-707`）负责"写了正文没进群"的场景；静默收尾分支（`turn.ts:804-826`）已经能正确处理不说话的回合（不计链、不级联、推水位）。
- W18b 的 `stay_silent` 77 次循环事故不会回归——那个工具已删除，沉默 = 不调用任何工具，没有可空转的落点（`tool-surface.ts:20-28` 自己就是这么论证的）。
- 与 P0-2 联动：去掉强制后"被迫 say → 再 say 一次真话"的重复诱因同步消失。

**回归风险与观察项**：可能重新出现"判定说要发言、回合却沉默"的空转回合（浪费一次模型调用但无用户可见伤害）。若真机观察到明显回升，退路是把意愿判定的 respond 阈值调严，而不是恢复强制。

### 验证
- 真机：@ 一个与话题无关的 agent，确认其可以整轮沉默、群里无"不说了"类消息。

---

## P1-1　两份文档：提示词组装 + 响应逻辑（todo #4 前半、#5）

调查材料已齐，落成两份 `docs/reference/`（纯文档，不改代码）：

**`docs/reference/collab-prompt-assembly.md`** — agent 提示词组装：
- 房间回合 system = persona 原文（一字不动）→ 情况说明（`roster.ts:66-91`）→ 通用规则（`agent-rules.ts:21-44`）→ `Current date`；13 个产品 developer 段全关（`app/engine/prompt/system-prompt.ts:127-140`）；工具说明走 tools schema 不进 system。
- 每回合 drive 文案（`turn.ts:637-639`）与 reasonLabel 来源（`activation.ts`）。
- 意愿判定的另一套 prompt（`willingness.ts:137-163`，不含通用规则，PM 加一行）。
- "persona 原文即 system 不可包装"铁律的出处与锚点。

**`docs/reference/collab-response-logic.md`** — agent 响应判定：
- 入口分流（用户消息 → coordinator；agent say 不重开判定）；
- 激活决策（@ 短路 / 无 @ 走意愿选举 / frozen 全灭）；
- 意愿判定细节（temperature 0、maxTokens 64、**thinking:false 及其真机原因**、8s 超时即静默、>8 人只问 PM、宽松 JSON 解析）；
- 冷却（self-elect cooldown = 2）与链闸（task-event 豁免、self-elected 撞闸即弃）；
- 回合收尾与级联、断路器（40/20）、nudge 条件。

---

## P1-2　群聊发言块可折叠（todo #6）

### 现状

群聊复用普通 `MessageList → MessageItem → MessageBubble`，工具/思考层的折叠（ProcessRail / CollapsePanel / CollabThinkingTrace）已继承；缺的是**"一个 agent 的一段发言块（groupHead→groupTail）"整体折叠**。`room-grouping.ts` 只产出边界 Set，没有 group 身份。

### 修法

1. `packages/renderer/components/chat/message/room-grouping.ts`：`RoomMessageLayout`（`:138-151`）增加 group 标识——每条消息映射到 `groupKey`（可用 head 消息 id），并给出每组的成员区间。
2. `MessageList.vue:60-67` room 分支：groupHead 行的署名区加折叠开关（复用 `CollapsePanel` 的 inline 图标风格），折叠时 `v-show` 掉组内 head 之后的行，head 行显示 `N 条消息` 摘要。注意同步 `:439-447` 的 `room-row--stacked/--trace` class 与 gap 表。
3. 状态存储：仿 `stores/chat.ts:760 sessionExpandedToolCalls` 增加 `sessionCollapsedRoomGroups: Map<sessionId, Set<groupKey>>`（持久于会话切换；默认全部展开）。
4. 测试参照 `message/__tests__/room-grouping` 既有用例。

---

## P1-3　agent 列表唯一化（todo #9）

### 根因

collab-team-v2 之后执行会话按 (agent × 房间) 常驻（`collab/agent-session.ts:47-54`，id = `agent-exec-<agentId>-<roomId>`），一个 agent 进 N 个群就有 N 条 `kind='agent'` session。侧栏 `Sidebar.vue:68-97` 直接列 `buildAgentSessionRows`（`utils/agent-sessions.ts:96-109`，**无 agentId 去重**），且各行 name/avatar 完全相同 → N 行一模一样的条目。（`agent-sessions.ts:5` 注释还停在 W18"每 agent 一条"的旧假设。）

### 修法

1. `utils/agent-sessions.ts`：新增 `buildAgentRosterRows(sessions, agents)` —— 按 agentId 聚合，一 agent 一行，携带其名下 exec sessions 列表（按 updatedAt 排序）；修正 `:5` 过期注释。
2. `Sidebar.vue:72-97`：改渲染 roster 行。单击行为分两种情况：只有一条 exec session → 直接打开；多条 → 行内嵌套 `CollapsePanel` 展开该 agent 的各群会话（`群「xx」` 标签），或直接跳 agent 详情。
3. **点开查看信息**：跳转工作区 Agents 面板（`AgentsPanelContent.vue` 的列表+详情壳已存在，`MediaPanel` nav id `'agents'`），详情区补两个入口：
   - **私聊**：创建/复用一条普通 chat 会话并 `updateSessionAgent(sessionId, agentId)` 绑定（`sessions.ts:849` 已有，无需新 IPC）；复用策略：查找已有 `kind='chat' && agentId=<id>` 的最近会话，无则新建。
   - **TA 的群聊**：列出该 agent 所属房间（从 room sessions 的成员表反查），点击 openRoom。
4. 注意：exec 会话是基础设施视图（`ChatPanel.vue:306` 禁输入），私聊必须走普通会话而不是 exec 会话——两者入口文案要区分（"执行现场" vs "私聊"）。

---

## P1-4　群聊中设置更新不生效（todo #10）

> 原文"设置全新无法生效"按"设置**更新**无法生效（agent 在做自己任务时）"理解；若实际指别的现象，此节前提需要重核。

### 根因（三处叠加）

1. **模型选择永远打不赢 agent 档案**：`worker.ts:417-421` / `turn.ts:611-617` 每次驱动都把 agent 档案的 model binding 写进**命令级 override**，而 `app/engine/stream-engine.ts:183 withAgentModelBinding` 对带 providerId 的命令直接短路 → **在群聊/工作台会话 UI 里换模型永远不生效**。
2. **pinned 语义被抹掉**：`worker.ts:382` 系统抄写 model 时标 `pinned:false`，与用户手选在存储上不可区分；`agents/profile.ts:202-203` 只有 `modelPinned === true` 才能盖住档案绑定。
3. **permissionMode 是 spawn 时快照且续做时重抄**：`worker.ts:376-378` 每次 spawnWork 都把房间 permissionMode 抄到 work 会话——房间改了，跑着的会话不变；用户手改了 work 会话，下一次续做又被抄回来覆盖。另有暗坑：`agents/profile.ts:82-88` 不认识的 permissionMode rank = -1 = 最严（fail closed），agents.json 里拼错一个值会静默压死房间/全局设置。

### 修法

1. **model：会话 pinned 优先**。`turn.ts:611-617` / `worker.ts:417-421` 下发命令级 override 前检查执行/工作会话的 `modelPinned`——已 pin 则不下发 override（`withAgentModelBinding` 的会话级解析自然生效）。UI 侧确认群聊相关会话里用户手动选模型时写 `pinned: true`（现有普通会话已是如此，主要是别被 worker 的 `pinned:false` 抄写盖掉：`worker.ts:379-383` 改为仅在会话无 pinned 记录时抄写）。
2. **permissionMode：只在创建时抄，续做不重抄**。`worker.ts:376-378` 加 `resuming` 判断（`:343-345` 已有该标记）：resuming 时保留会话现值；房间设置变更希望立即生效的场景，靠 ask 时的 strict-and-fresh 合成（`agents/profile.ts:193-197` 已实时读房间值参与合成，快照只是初值）。
3. **拼错的 permissionMode 显式告警**：`composeAgentPermissionMode` 遇到未知模式时 log warning + 按默认值处理（而不是静默最严），或在 agents.json normalize 时校验白名单。
4. 文档化"哪些设置是快照、哪些是实时读"（并入 P1-1 的响应逻辑文档附录）。

### 验证
- 真机：群聊运行中在 work 会话换模型 → 下一轮生效；改房间权限 → 新 ask 按新值判定；改 agent 档案模型 → 未 pin 的会话下一轮跟随。

---

## P2　图片头像（todo #7）

### 现状

`avatar` 是纯 emoji 字符串（schema `agents/store.ts:38-39`，无格式校验），8+ 处渲染点全是 `{{ avatar || '🤖' }}` 文本直出，fallback 常量散在 3 个文件；编辑入口是一个 `maxlength=16` 的文本框（`AgentsPanelContent.vue:123-135`）。无现成图片选择控件，但媒体管线齐备（`useAttachments.createImagePreview`、`stores/media.ts saveImage/getImageUrl`），且 `MediaUsageTag` 已预留 `'persona-avatar'`（`packages/shared/ipc/media.ts:5`，纯类型声明无实现——最自然的挂点）。

### 修法

1. **schema**：新增独立字段 `avatarImage?: string`（媒体库引用），**不复用 avatar 字段**——避免 8 处 `{{ avatar }}` 文本直出把路径当字符渲染。改动：`agents/store.ts`（schema + normalize + create/update 入参）、`packages/shared/ipc/agents.ts` 镜像、`collab/types.ts CollabAgentLike`、server HTTP create/update 透传（`apps/server/src/runtime.ts:4481/4517`）。
2. **抽共用组件 `AgentAvatar.vue`**：props `{avatar, avatarImage, size}`，有图渲 `<img>`（圆形裁切），无图渲 emoji，统一 fallback `🤖`。8+ 处渲染点全部替换为该组件（MessageItem 群沟槽/署名 chip、RoomMemberStrip、Sidebar、TabItem/TabBar、RoomCreateDialog、RoomSettingsDialog、CollabTypingLine、reactions、collab-board-card），顺便把散落的 3 个 fallback 常量收敛。
3. **选择器**：`AgentsPanelContent.vue` avatar 字段旁加"选择图片"——隐藏 `<input type="file" accept="image/*">` + `createImagePreview` 压缩为小尺寸（建议 ≤128px、webp/png dataURL 或落媒体库文件），存储走 `mediaStore.saveImage` 打 `'persona-avatar'` tag；提供"清除图片回退 emoji"。
4. 尺寸/性能注意：头像在消息流里每个 groupHead 渲一次，若存 dataURL 直接进 agents.json 会让 26KB 的文件膨胀——**建议落媒体库文件存路径引用**，agents.json 只存 id/路径。

---

## 实施顺序与验收

```
P0（一批提交，先修行为正确性）
  1. direct-tool-execution 误标取消 bug + edit 错误文案结构化 + UI 三处
  2. say 幂等 + nudge 判定修正
  3. 房间工具面收紧 say+board（⚠️ 推翻 team-v2 §2.1）
  4. 移除 turn.ts:610 强制 say（⚠️ 推翻 W22）
P1（第二批）
  5. 两份 reference 文档
  6. 发言块折叠
  7. agent 列表唯一化 + 私聊入口
  8. 设置生效链修正（pinned 优先 / resuming 不重抄 / 未知 permissionMode 告警）
P2（第三批）
  9. 图片头像（schema + AgentAvatar.vue + 选择器）
```

门禁：每批过 `bun run typecheck` + `bun run test` + `bun run boundary:gate`；P0 的 2/3/4 需真机群聊回归（发消息、@ 无关 agent、看板指派开工各一轮）。
