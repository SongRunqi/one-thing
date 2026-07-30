# Agent 能力档案 + Agent Store 缓存化

> 状态：**已实施**（B0/B1/A0/A1/A2；A3 按方案后置未做）—— 2026-07-28
> 日期：2026-07-28
> 覆盖两件事：**A. Agent 从「人设」升为「能力档案」**（建议 2）、**B. Agent store 缓存化**（建议 3）。
> 实施顺序：**B 先于 A**——A 会把 `getAgent()` 的调用频次再抬一档，B 是它的地基。
> 修订：2026-07-28 审查后——热点画像更正（getAgent 成员循环，非 listAgents 回写）、permissionMode 接线移到 app 层子类（product 层直连是反向依赖）、原 A1「接线」与 A2「回合快照」合并、model stamp 补 UI 同步链与显式选择判据。

---

## 0. 现状盘点（已核实）

`OnethingAgentDefinition`（`packages/onething-runtime/src/agents/store.ts:22`）现有字段：
`id / name / systemPrompt / tools / isDefault / createdAt / updatedAt / title / avatar / color / description / model`。

其中真正影响运行行为的只有三个，分别在三处被消费：

| 字段 | 消费点 | 说明 |
| --- | --- | --- |
| `systemPrompt` | `prompts/builder.ts:106-113`（`agent` 段） | 房间回合走 `app/engine/prompt/system-prompt.ts:66` 的 override，persona 直接当 system |
| `tools` | `agent-loop/stream-runtime.ts:687-694` → adapter `app/engine/stream/agent-loop-runtime.ts:155-165` | adapter 里硬编码了 collab 特判 |
| `model` | `app/collab/worker.ts:355-359`、`coordinator.ts:848-853`、`willingness-runner.ts:85` | **只有 collab 路径 stamp**，普通会话切 agent 不切模型 |

**不受 agent 影响**的运行边界（各自独立的解析链）：

| 边界 | 现在的解析链 | 位置 |
| --- | --- | --- |
| 权限模式 | `session.permissionMode ?? settings.tools.permissionMode ?? 'normal'` | `packages/core/engine/core-stream-engine.ts:110-116`，经 `stream-engine.ts:45` → `app/backend.ts:150` 注入 Permission |
| 回合上限 | `settings.chat.maxTurns ?? DEFAULT_CHAT_MAX_TURNS` | `agent-loop/stream-runtime.ts:850` |
| 上下文压缩 | `settings.chat.contextCompactEnabled / KeepRecentTurns` | `app/engine/stream/agent-loop-runtime.ts:104-105` |
| 目录范围 | 全局 sandbox roots + `session.workingDirectory(Roots)` | `app/tools/core/sandbox.ts` |

后果：切 agent 只换提示词和工具列表，「研究员」和「运维」拿到同一套权限策略与回合预算；而 collab 需要的「房间回合额外拿 say+board」表达不了，只能在通用装配路径 `agent-loop-runtime.ts:155-165` 写特判。

Store 侧：`app/agents/store.ts` 每个导出函数都 `getStore()` → `createOnethingAgentStore()` 新建实例 → `readJsonFile()`（`core/storage/json-file.ts:124`：`existsSync` + `readFileSync` + `JSON.parse`）+ 全量 normalize。**无缓存、同步 I/O、在 Electron 主进程**。真正的热点是 `getAgent()` 被**成员循环放大**：`say-tool.ts:97`（roomMembers 每成员一次）、`system-prompt.ts:101`（roster 每成员一次）、`coordinator.ts:1419/1474`、`willingness-runner.ts:187`——N 个成员 = N 次全量读盘 + parse；另有 reply-quote、board digest、ingress、worker 等单次调用点。`listAgents()` 的纯读回写（`store.ts:198-202`：normalize 结果与原文 stringify 不等即 `saveFile`）**不在 runtime 热路径**——它只有 IPC 入口调用者（`apps/server/src/runtime.ts:4384`、`apps/electron/src/main/ipc/agents.ts:26`）；删它属于卫生与正确性（读不产生写），不是性能。

---

## 1. 分期总览

| 期 | 名称 | 交付 | 依赖 |
| --- | --- | --- | --- |
| **B0** | Store 缓存化 | `agents/store.ts` 走 core cached-json + 文件锁；读路径不再回写 | — |
| **B1** | 单例 + 生命周期 | `app/agents/store.ts` 单例、`initializeAgents()` 接进 `backend.ts`、`invalidateAgentsCache()` | B0 |
| **A0** | Profile 纯函数 | `agents/profile.ts`：类型 + `resolveAgentProfile()`，纯函数 + 表驱动测试，**不接线** | B1 |
| **A1** | 快照 + 接线 | 回合开始在 app 层解析一次 profile 挂 `StreamContext`，四条链路（tools 含 collab 特判收编、permissionMode、maxTurns、model）全部读快照 | A0 |
| **A2** | 编辑 UI | agent 编辑页新增「边界」区（只暴露两项，其余走 agents.json） | A1 |
| **A3**（后置） | 目录范围 / 上下文策略 | `workspace.roots`、`context.*` | A1 |

每一期都可独立提交、独立回滚。A3 建议先不做，等 A1-A2 真机跑过再评估。

> 原方案把「接线」和「回合快照」分成两期，已合并：product 层的消费点（`agent-loop/stream-runtime.ts`）拿得到 agentId 但拿不到 agent 定义（`getAgent` 在 app 层，product 直连是反向依赖），接线本身就必须以「app 层解析一次、注入下传」为形态；分两期会让同一批文件动两次。

---

## 2. B 期：Agent store 缓存化

### B0 —— `packages/onething-runtime/src/agents/store.ts`

复用 settings 已经在用的同一套 core 原语（`packages/onething-runtime/src/settings/settings-repository.ts` 是现成先例）：

```
createCoreCachedJsonState / initializeCoreCachedJsonFile / getCoreCachedJsonFile
saveCoreCachedJsonFile / invalidateCoreCachedJsonFile / withFileLockSync   // @onething/core/storage
```

改动：

1. `createOnethingAgentStore()` 内部持有一个 `CoreCachedJsonState<OnethingAgentsFile>`，`loadFile()` 走 `getCoreCachedJsonFile`（normalize 作为 `normalize` 回调传入，仍然每次读都规范化，但只在缓存 miss 时）。
2. 新增 `initialize(): Promise<OnethingAgentsFile>` 与 `invalidate(): void`。
3. **写路径加锁**：`saveFile()` 包一层 `withFileLockSync(`${agentsPath}.lock`, …)`——desktop / daemon / server 三个宿主可能开同一个 store，settings 已经是这个取舍。
4. **删掉读路径回写**：`listAgents()` 里的 `if (shouldPersist) saveFile(file)` 整段移除；normalize 结果只留在内存缓存里。迁移（补默认 agent、补字段）在**下一次真实写入**时自然落盘，或由 B1 的 `initializeAgents()` 显式做一次。

### B1 —— `packages/onething-runtime/src/app/agents/store.ts`

1. 模块级单例：`const store = createOnethingAgentStore({ agentsPath: getAgentsPath })`（路径传函数，跟 settings 一致，避免 store 根在 boot 前被固化）。
2. 导出 `initializeAgents()` / `invalidateAgentsCache()`。
3. `packages/onething-runtime/src/app/backend.ts`：在 stores 阶段（`initializeSettings()` 旁边，约 `:125`）加 `await initializeAgents()`。
4. `apps/server/src/runtime.ts:53` 已经在 import `invalidateSettingsCache`，同一处加 agents 的失效调用（外部改文件后的逃生口）。

### B 期验收

- `agents/__tests__/store.test.ts` 补三条：① 连续两次 `getAgent()` 只触发一次文件读（注入 fs spy）；② `listAgents()` 不产生写；③ 并发 `updateAgent` 不丢写（锁生效）。
- 真机：房间发一条消息，`agents.json` 的读次数从「几十」降到「1」。

---

## 3. A 期：能力档案

### A0 —— `packages/onething-runtime/src/agents/profile.ts`（新文件，product 层纯函数）

> 放 product 层、只吃入参，不 import `@onething/app`（架构门禁 `packages/core/__tests__/architecture-boundaries.test.ts` 会管）。
> 从 `agents/index.ts` 再导出即可，**不需要新的 alias 条目**（`@onething/runtime/agents` 已是 barrel）。

定义新增字段（**全部可选，缺省 = 完全继承现状，零行为变更**）：

```ts
interface OnethingAgentDefinition {
  // …现有字段不动
  /** 基础工具白名单（保留原语义：absent = 全部启用工具） */
  tools?: string[]
  /** 能力包：以组合替代特判，例如 'collab-room' | 'collab-work' */
  toolGrants?: string[]
  /** 权限模式；与 session/settings 合成，见下 */
  permissionMode?: string
  /** 回合上限；缺省落回 settings.chat.maxTurns */
  maxTurns?: number
  /** A3 后置 */
  workspace?: { roots?: string[]; readOnly?: boolean }
  context?: { compactEnabled?: boolean; keepRecentTurns?: number }
}
```

解析函数：

```ts
export interface EffectiveAgentProfile {
  agentId: string
  name: string
  systemPrompt: string
  tools: string[] | null          // null = 不限制
  permissionMode: string
  maxTurns: number
  model?: OnethingAgentModelBinding
}

export function resolveAgentProfile(input: {
  agent: OnethingAgentDefinition
  session?: { kind?: string; permissionMode?: string; providerId?: string; model?: string }
  settings: { tools?: { permissionMode?: string }; chat?: { maxTurns?: number } }
  defaults?: { permissionMode?: string; maxTurns?: number }
}): EffectiveAgentProfile
```

**解析规则（唯一权威，全部表驱动测试）**：

- `tools`：`grants` 决定「替换」还是「并集」——`collab-room` 是替换（成员没有 `say` 就不在房间里），`collab-work` 是并集。规则本体从 `collab/tool-surface.ts` 平移过来，语义一字不改。**注意替换分支实际覆盖 `kind === 'room' || kind === 'agent'`**（W18 后房间回合跑在 agent 自己的执行会话里）——表驱动测试的用例表必须包含 `'agent'` 这个 kind，不止 room/work 两种。
- `maxTurns`：`agent ?? settings.chat.maxTurns ?? DEFAULT`（后者覆盖前者的常规链）。
- `model`：`session 显式选择 > agent.model > 会话有效配置`。这一条会**补上普通会话的缺口**——目前只有 collab stamp。前置条件：「显式选择」的判据要先定义——session 上的 providerId/model 是用户亲手选的还是继承默认落下来的，两者必须可区分；若现状不可区分，需要先加显式标记位再接这条链。
- `permissionMode`：**取更严者**，不是常规覆盖链。见下方决策点。

> ### ⚠️ 需要拍板：`permissionMode` 的合成语义
>
> session = `auto-approve`、agent = `normal`（要问）时谁赢？
>
> - **推荐：取更严者**（安全默认；「研究员」agent 标了要问，就不该因为会话开了自动批准而静默执行 bash）。
> - **冲突**：`app/collab/worker.ts:317` 现在让工作会话继承房间的 permissionMode，注释明说是为了「headless 自测 / 受信项目不卡在没人回答的审批上」。取更严者会让「房间自动批准 + agent 未标注」这条路继续通（agent 不标就不参与合成），但一旦有人给 agent 标了 `normal`，房间自动批准就失效。
> - **备选**：常规覆盖链 `session ?? agent ?? settings`，简单但丢掉安全收益。
>
> 建议先按「取更严者 + agent 不标注则不参与」实现，collab 那条路不受影响；如果真机发现卡审批，再退回覆盖链（一行改动）。
>
> 附带两条实现约束：
>
> - **严度偏序要显式**：合成按一张显式偏序表实现（当前两档：`normal`（要问）严于 `auto-approve`）。未来加新模式（plan / readonly 之类）必须先扩这张表，否则「更严」无定义。
> - **一致性边界**：权限模式在 `Permission.ask` 时经 `(sessionId) => mode` 回调**现读活值**，不走 A1 的回合快照——用户回合中途改 agent 的 permissionMode 会对后续 ask 立即生效。这是有意的（权限从严从新），但要写进测试预期，别当 bug 修。

### A1 —— 快照 + 接线（一次解析、注入下传）

**形态先行**：product 层的消费点（`agent-loop/stream-runtime.ts`）拿得到 `agentId` 但**拿不到 agent 定义**——`getAgent` 在 app 层，product 直连是反向依赖，架构门禁会红。所以接线不是「各消费点自己调 `resolveAgentProfile`」，而是 **app 层在回合开始解析一次 `EffectiveAgentProfile`，挂到 `StreamContext.agentProfile`，下游全部读快照**。快照同时解决「半新半旧」一致性（中途改 agent 不会拿到提示词新、白名单旧的混合组合）；B0 的缓存让解析本身几乎零成本。

1. **工具**：`app/engine/stream/agent-loop-runtime.ts:155-165` 的 adapter 收缩成读快照（`ctx.agentProfile.tools`；adapter 在 app 层，快照就在这里解析）。`resolveCollabToolAllowlist` 的调用从这里消失；`collab/tool-surface.ts` 保留为 grant 常量表（`COLLAB_ROOM_TOOLS` / `COLLAB_WORK_REQUIRED_TOOLS` 原样），由 profile 消费。**现有 collab 测试全部保留**，它们守的是语义不变。
2. **权限模式**：接线点是 **app 层子类** `app/engine/stream-engine.ts:37` 的 `getPermissionMode` override（那里现在只做 `as PermissionMode` 收窄），在 override 里取 `getAgent(session.agentId)?.permissionMode` 参与合成。core 的 `resolveStreamPermissionMode()`（`core/engine/core-stream-engine.ts:110`）扩一个可选 `agentPermissionMode?: string` 参数，保持纯函数、无 agent store 依赖。**不能**放在 `packages/onething-runtime/src/stream-engine.ts:45`——该文件在 product 根层、只 import `@onething/core/engine`，引入 `getAgent` 是 product → app 反向依赖。注入点 `app/backend.ts:150` 不动。这条链走 `(sessionId) => mode` 回调、现读活值，不经过回合快照（一致性边界见 A0 的决策点附注）。
3. **回合上限**：`agent-loop/stream-runtime.ts:850` 从 `ctx.settings.chat?.maxTurns ?? DEFAULT` 改成读 `ctx.agentProfile.maxTurns`（快照经 StreamContext 注入；product 层不直查 agent。`preparation.agentId` 在同文件 `:689` 已有，可用于校验快照与当前 agent 一致）。
4. **模型**：普通会话发送命令时，若 session 没有显式模型选择（判据见 A0）且 agent 有 `model` 绑定，则 stamp（与 `worker.ts:355-359` 同一形态）。注意 store.ts:9 注释明说 agent.model **不进** `getEffectiveProviderConfig` 的解析链——保持这个约定，只在命令 stamp 层做。**UI 侧必须同步**：ModelSelector 的显示链要感知 agent 绑定并展示同一结果，否则「界面显示 A 模型、实际请求 B 模型」——这正是 provider 解析统一那次事故的形态（UI/引擎两套解析链）；按当时定下的规矩：改一侧必须同步另一侧 + 镜像测试。

### A2 —— 编辑 UI

按 `feedback_settings_minimal`（设置 UI 只暴露必填项、技术参数走默认值/文件、调参收敛成档位）：

- agent 编辑页新增「边界」区，**只放两项**：权限模式（继承 / 每次询问 / 自动批准）、回合上限（继承 / 标准 / 长任务，映射成数字）。
- `toolGrants`、`workspace`、`context` 不进 UI，只从 `agents.json` 读。
- 链路：`packages/shared/ipc/agents.ts` 的 `AgentDefinition` / `AgentCreateRequest` / `AgentUpdateRequest` 加字段 → `agents/ipc-operations.ts` 的 create/update 透传（`:75-81` / `:119-125` 也是手写清单）→ `app/agents/store.ts` 包装函数的入参类型（`:26` / `:30` 现在只透传 4 个字段）→ 渲染层表单。**别漏 product 层 `agents/store.ts` 自己的 interface（×3）与 `normalizeAgent`**——那里字段被剥同样静默。全链路手写清单共 **4 个文件约 8 处**。

---

## 4. 风险与护栏

| 风险 | 处理 |
| --- | --- |
| 新字段被静默丢弃 | 手写字段清单共 4 个文件约 8 处：`agents/store.ts`（interface ×3 + `normalizeAgent` + create/update）、`agents/ipc-operations.ts:75-81/:119-125`、`app/agents/store.ts:26/:30`、渲染层表单；`zod` object 默认 strip 未知键（历史教训见 `project_edit_tool_replaceall`）。加一条「create → 落盘 → 重新 normalize 读回 → get 往返所有新字段」的测试。 |
| collab 语义被改坏 | `collab/tool-surface.ts` 的规则**原样平移**（含 `kind === 'agent'` 走替换分支），其现有测试不改一行地继续跑；`app/collab/__tests__/*` 是第二道网。 |
| model 解析链 UI/引擎分叉 | 命令层 stamp 后 ModelSelector 显示与实际请求可能不一致（`project_provider_resolution` 事故同形态：UI/引擎两套链）。UI 显示链同步感知 agent 绑定 + 镜像测试，两侧改动必须成对。 |
| 提示词字节漂移 | `app/engine/prompt/__tests__/system-prompt.baseline.test.ts` / `system-prompt-snapshot.test.ts` / `collab-room-overrides.test.ts` 是护栏，A 期不应让它们变红（本方案不动提示词内容）。 |
| 缓存过期（外部手改 agents.json） | `invalidateAgentsCache()` + server 侧失效点；与 settings 同一取舍。 |
| 跨进程写冲突 | `withFileLockSync`，与 settings 同一机制。 |
| 架构门禁 | `profile.ts` 在 product 层，不得 import `@onething/app`；`bun run boundary:gate` 必须无新红。 |

## 5. 验收

- `bun run typecheck` + `bun run test` 全绿（当前基线以实施前一次 run 为准）。
- `bun run boundary:gate` 无新增失败。
- 真机：① 建一个 `permissionMode: 'normal'` 的 agent，在自动批准会话里发 bash，应当弹审批；② 房间发一条消息，agents.json 读次数为 1（对准 `getAgent` 的成员循环，不是 listAgents）；③ 给 agent 绑模型后在普通会话切到它，请求确实走绑定模型，**且 ModelSelector 显示与请求一致**；④ 回合中途改 agent 的 permissionMode，后续 ask 按新值合成（活值语义，非快照）。

---

## 6. 实施记录（2026-07-28）

门禁：`bun run typecheck` 绿；`bun run test` 705 文件 / 4908 用例全绿（实施前基线 701 / 4823）；`bun run boundary:gate` 无新增失败（另有 2 条基线失败被本分支既有改动治愈）。真机四条未跑。

与方案的偏离，都在实现时才拿得到判据：

1. **permissionMode 不改 core**。方案要给 `resolveStreamPermissionMode()` 加 `agentPermissionMode?` 参数，但「更严」的偏序表在 product 层（`agents/profile.ts`），塞进 core 等于把产品决策下沉、或者把表变成参数传两遍。改为：app 子类 `app/engine/stream-engine.ts` 的 `getPermissionMode` override 里调 product 的 `composeAgentPermissionMode(agentMode, super.getPermissionMode())`，core 一行未动，偏序表仍只有一处。
2. **偏序表是三档不是两档**：`normal` > `auto-accept-edits` > `dangerously-allow-all`（`packages/shared/ipc/tools.ts` 的实际取值）。表外的模式按**最严**处理（fail closed）——agents.json 里写错一个字不该反而放宽权限。
3. **「显式选择」判据落成 `session.modelPinned`**。方案预判的前置条件成立：`lastProvider/lastModel` 每条 assistant 消息都会自动盖章（`core/session/store-helpers.ts` 的 `appendSessionMessage`），与用户亲手选的不可区分。新增标记位由 `updateSessionModel(..., { pinned })` 写，默认 `true`（该函数就是选择器的入口）；collab worker 套用 agent 自己的绑定时显式传 `false`——那不是用户的选择。字段贯穿 `CoreSessionMeta` / `extractSessionMeta` / `ChatSession` / `SessionMeta` / 渲染层乐观更新，**server 侧另有一份**：`applySessionPatch` 是白名单，`/api/sessions/:id/model` 路由要显式带 `modelPinned: true`，否则 web 端选完模型仍被 agent 绑定压过（已补断言）。
4. **UI 镜像做成可执行的**。`resolveProviderModelSelection` 新增 `agentModel` 入参，次序为「pinned 会话 > agent 绑定 > 未 pin 的会话 > 全局」；`provider-model.test.ts` 里新增的一组用例**真的跑引擎那两个函数**（`resolveAgentProfile` + `getEffectiveProviderConfig`）并比对，而不是把规则再抄一遍。三个显示点（ModelSelector / ThinkToggle / 发送前 override）走同一个 `useSessionAgentModel` composable。
5. **无 agentId 的会话跟随 Default Agent 的工具白名单**。旧 adapter 是 `agentId ? getAgent(agentId).tools : null`，而提示词侧一直是 `getAgent(undefined)` → Default Agent。两处口径不一致，收敛到 store 的既有契约（提示词那一侧）。实践上 Default Agent 通常没有白名单，影响面为零。
6. **server 的第二套 agent store 加了失效钩子**。`apps/server` 仍为每个 owner 持有独立 `createOnethingAgentStore`；默认 context 写的是引擎在读的同一个 agents.json，缓存化之后必须打掉 app 单例的缓存，否则 HTTP 改完 agent 要重启才生效（形态与上方 settings store 的包装一致）。
7. **app 层包装函数不再手抄字段**：`app/agents/store.ts` 的 create/update 直接吃 `CreateOnethingAgentInput` / `UpdateOnethingAgentInput`，方案里点名的「4 个文件约 8 处」少了一处，且以后不会再漏。
8. `DEFAULT_CHAT_MAX_TURNS` 改为 `DEFAULT_AGENT_MAX_TURNS` 的别名，数字只剩一处。
9. 顺手修了一处与本方案无关的既有 typecheck 断裂：`app/stores/index.ts` 漏出 `onSessionsDeleted`（`app/store.ts` 已在转出）。
