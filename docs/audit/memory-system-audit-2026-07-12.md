# Memory 系统整理与审计报告(2026-07-12)

> 目的:系统梳理当前 Memory(soul-memory)子系统的全貌,标出架构问题、逻辑冲突、死代码/死配置与安全隐患,为后续「砍掉不用的功能、收敛繁琐配置」提供决策依据。
> 方法:三路并行代码勘察(runtime 核心 / 传输与多用户 / UI 与配置面),所有结论均附 file:line 证据。

---

## 一、系统全景

### 1.1 组件地图

| 层 | 文件 | 职责 |
| --- | --- | --- |
| 核心库 | `packages/onething-runtime/src/plugins/soul-memory.ts`(~8500 行) | **不是插件**,是核心库:Core* 类型、纯逻辑、manifest、工具定义、active-memory runtime。命名误导(放在 `plugins/` 下) |
| 领域模块 | `packages/onething-runtime/src/memory/*`(19 个模块) | active-memory、hermes-file-memory、dreaming、review、flush、capture-actions、daily-context、prompt-context、canonical、graph(51KB)、database、indexer、search、managed-files、diagnostics-logger、ipc、workspace、types |
| Electron 插件 | `src/main/plugins/builtin/soul-memory.ts`(~3000 行) | 真正注册的插件(`src/main/plugins/loader.ts:29,55-60`):把核心库接到 scheduler、hooks、tools、commands、prompt-context、settings、IPC |
| Server 运行时 | `apps/server/src/runtime.ts`(~9380 行)+ `http.ts` | **重新实现**了一遍 memory/session/permission 逻辑;34 个 `/api/memory/*` 端点(`http.ts:246-278`) |
| IPC 代理 | `src/main/ipc/memory.ts`(live)+ `apps/electron/src/ipc/memory.ts`(注册 helper) | 34 个 `MEMORY_*` channel(`src/shared/ipc/channels.ts:276-308`)全部 1:1 代理到 server HTTP |
| UI | `MemoryPanelContent.vue`(1905 行,数据浏览)+ `MemorySettingsTab.vue`(1166 行,设置)+ `SchedulerPanelContent.vue:1012`(dreaming 配置) | 配置分裂在三个界面(第三处是 `/memory` 聊天命令) |

### 1.2 磁盘布局(memory workspace)

```
<memoryRoot>/
├── SOUL.md        # 人格/灵魂上下文,review 任务写入
├── USER.md        # hermes 稳定用户画像(target:'user')
├── MEMORY.md      # hermes 长期事实(target:'memory'),dreaming 晋升写入
├── DREAMS.md      # review 任务伴随写入
├── memory/        # 每日笔记 <YYYY-MM-DD>.md,capture/flush 写入
└── <sqlite db>    # graph 图谱记忆 + FTS/向量索引
```

沙箱访问控制在核心库统一执行(仅上述文件可达,`isSoulMemoryPathContained`)。

### 1.3 九个子功能及其触发链

| 功能 | 触发 | 写入目标 | 门控 |
| --- | --- | --- | --- |
| Rules 注入 | 每次 prompt | —(注入 `memory-rules.md`) | 插件启用 |
| Active Memory 召回 | 每次 prompt(异步) | — | `activeMemory.enabled` |
| Capture | 聊天后 hook | `memory/<date>.md` | `capture.enabled` + `mode` |
| Review | 聊天后 hook(~每 10 轮) | `SOUL.md` + `DREAMS.md` | `review.enabled`(**无 UI**) |
| Flush | 上下文压缩前 hook | 日记 | `memoryFlush.enabled` |
| Daily Context | 会话开始注入 | — | `dailyContext.enabled` |
| Dreaming 晋升 | cron(默认关) | `MEMORY.md` | `dreaming.enabled` |
| Hermes 文件记忆 | 模型工具调用 | `USER.md`/`MEMORY.md` | 插件启用 |
| Canonical/Graph 图谱 | capture/dreaming 内部 | SQLite | `canonicalMemory.enabled` |

写入所有权干净:MEMORY.md 的所有写入都走 `hermes-file-memory.addHermesMemoryEntry` 单一原子写路径,无双写方冲突。

### 1.4 请求链路(Electron Memory 面板)

```
MemoryPanelContent.vue
  → preload bridge(apps/electron/src/preload/bridge.ts:1006+)
  → ipcMain.handle(apps/electron/src/ipc/memory.ts 注册)
  → postMemory()(src/main/ipc/memory.ts:18-44)
  → HTTP POST http://127.0.0.1:8787/api/memory/*
  → apps/server http.ts matchRoute → runtime.ts handleMemory*
```

server 不在线时优雅降级:所有调用返回结构化 `{success:false, error}`,面板显示错误/空态,不崩溃。

---

## 二、架构问题

### A1. 三条运行时路径,同一份记忆(最大架构债)

记忆的**读**和**写**走的是不同进程的不同实现:

- **UI 浏览/编辑**:Electron 面板 → HTTP → `apps/server/runtime.ts`(server 自己那套 ~9380 行的重新实现);
- **后台生成**(capture/review/dreaming/flush):Electron 主进程 `builtin/soul-memory.ts` 插件,进程内直接读写文件;
- **网关多用户**:`packages/gateway` 完全不调 `/api/memory/*`,走进程内 `CoreConversationRuntime`,记忆是会话处理的副作用(`gateway/src/core/bridge.ts:231`)。

三条路径只有在指向同一数据根时才碰巧一致;server 的语义已经和主进程实现发散(审计 §5.6 也指出了这点)。**任何一处改动都要三处对齐,这是「混乱感」的根源。**

### A2. 三套目录布局并存,设计目标未落地

1. server:`owners/<userId>/<workspaceId>/...`(`runtime.ts:954-956` 等);
2. Electron/设计文档目标:`<memoryRoot>/users/<userId>/`(`docs/design/multi-user-memory-notes.md`,notes→memory 改名);
3. 遗留(清理中):`agents/<profileId>/` workspace + `scope_<sha16>__` canonical 前缀(`scripts/cleanup-legacy-user-memory.mjs` 手动清)。

设计文档的目标布局与 server 的 `owners/` 方案**互不认识**,尚未收敛。

### A3. `memoryScopeId`:算了、存了、从不使用

每个 profile 都计算并存储 `memoryScopeId`(`runtime.ts:7276-7516`),但**从不参与任何路径计算**——实际隔离只靠可伪造的 `context.userId`。设计文档 §4 已宣布该字段 deprecated(改用 `session.memoryProfileId`),代码却还在维护它。死概念,应删除。

### A4. 核心库伪装成插件 + 巨石文件

`packages/onething-runtime/src/plugins/soul-memory.ts` 是 8500 行的单文件核心库,却放在 `plugins/` 目录里,与真正注册的 `src/main/plugins/builtin/soul-memory.ts` 同名。两者不是重复(库 vs wiring),但命名和位置制造了持续的认知成本。server 端 `runtime.ts` 9380 行同理。

### A5. 配置入口分裂在三处

- `MemorySettingsTab.vue`:~40 个可调项;
- `SchedulerPanelContent.vue`(Tasks):dreaming 的日程配置,Settings 里只放一个「Configure in Tasks」跳转;
- `/memory` 聊天命令:review 只能从这里控制,设置页完全不可见。

---

## 三、安全问题

### S1.【Critical】server owner 作用域由未认证 header 决定

`apps/server/src/http.ts:2175`:`userId` / `workspaceId` 直接取自 `x-onething-user-id` / `x-onething-workspace-id` 请求头;Bearer token 被读取但**全程无校验、无 401 分支**。伪造 header 即可跨用户读写 memory/会话;监听 `0.0.0.0` 时远程可利用。(对应 2026-07-11 系统审计 finding #2 / §5.1。)

讽刺的是:**Electron 代理根本不发这些 header**(`postMemory` 只发 `content-type`),永远落在 `defaultUserId`。即 header 机制唯一的现实用户是攻击者。

### S2.【High】Telegram 群成员坍缩为同一记忆 scope

`gateway/channels/telegram/index.ts:165` 用 `chat.id` 当 `userId`,群里所有成员共享一个 session 和一个记忆 scope(审计 finding #10)。

### S3. hermes-file-memory 并发丢写风险

`hermes-file-memory.ts:98-175` 读-改-写只有原子写(temp+rename),无 `AsyncSaveQueue` 串行化。多用户网关会话、或「当轮聊天 + 后台 dreaming/flush」并发时可能静默丢条目。

---

## 四、逻辑冲突与不一致

| # | 问题 | 位置 |
| --- | --- | --- |
| L1 | **capture 双字段编码一个状态**:`enabled: boolean` + `mode: 'off'`,可表示 `enabled:true, mode:'off'` 的矛盾组合;UI 在 `updateCaptureMode`(`MemorySettingsTab.vue:978`)手工对齐两者 | types.ts / settings.ts:97 |
| L2 | **隐式依赖不可见**:`search.enabled:false` 会静默废掉 Active Memory 召回,即使 `activeMemory.enabled:true`;UI 无任何提示 | soul-memory.ts:849+ |
| L3 | **flush 提示词是 daily-note 提示词的别名**:无独立 `memory-flush.md`,`CORE_SOUL_MEMORY_MEMORY_FLUSH_SYSTEM_PROMPT = CORE_SOUL_MEMORY_DAILY_NOTE_EXTRACTION_SYSTEM_PROMPT`(`prompts/tasks/index.ts:13-14`)。改日记提示词会静默改变 flush 行为 | prompts/tasks/index.ts |
| L4 | **Review 完全隐身**:6 个配置项驱动一个活跃后台任务(`soul-memory.ts:7453+`),但设置页零绑定——用户无法从 UI 关闭或调节奏 | settings.ts:104 |
| L5 | **channel 用户与本机 agent 行为分叉**:channel 用户强制关 canonical/graph(builtin:445),per-user workspace;是有意设计但缺乏文档,易被当成 feature parity 假设踩坑 | builtin:440-445 |
| L6 | `/api/channel-identity/*` 端点不经 memory IPC 桥,身份面板与记忆面板走两套传输 | http.ts:279-286 |

---

## 五、死代码与死配置

### 5.1 死配置(schema/默认值里有,运行时从不读)

| 字段 | 现状 |
| --- | --- |
| `dreaming.maxSessions` | 无任何消费者 |
| `dreaming.maxMessagesPerSession` | 无任何消费者 |
| `dreaming.minRecallCount` | 无任何消费者 |
| `dreaming.minUniqueSources` | 无任何消费者 |
| `dreaming.model` | 只作为诊断日志的 label(`soul-memory.ts:7093`)出现,**并不用于选模型**——「dreaming 用独立模型」是个没兑现的承诺 |
| `dreaming.sources` | 类型只允许 `['daily']`,scheduler 保存时强制覆写为 `['daily']`(`SchedulerPanelContent.vue:1012`),恒定值。是被删掉的「sessions 来源」的残骸(这也解释了上面 maxSessions 等孤儿字段的来历) |
| `canonicalMemory.store` | 恒为 `'sqlite'`,类型只允许这一个值,未暴露 UI。残留字段 |

### 5.2 读了但不暴露(半死)

- `review.*` 全组 6 项(见 L4);
- `read.defaultLines=200` / `read.maxLines=1000`(`managed-files.ts:79-80` 在读)。

### 5.3 遗留物

- `resources/templates/partials/memory/soul-memory-rules.hbs`:只存在于两个 `.claude/worktrees/` 快照里,主树已迁移到 `content/memory-rules.md?raw`。worktree 快照属陈旧遗留;
- `scripts/cleanup-legacy-user-memory.mjs` + `CANONICAL_MIGRATION_STORE_KEY`/`GRAPH_MIGRATION_STORE_KEY`(workspace.ts:50-51):一次性迁移护栏,迁移确认完成后可删;
- platformApi 暴露了大量面板从未使用的方法(`searchMemory`、`appendMemory`、`rebuildMemoryIndex`、profile 全套 CRUD、graph entity CRUD 等)——传输层 34 个 channel 全部接通,但 UI 只消费其中一小部分。

---

## 六、配置繁琐度诊断

**总量:~60 个设置项、11 个分组;设置页暴露约 40 个。** 与「设置只暴露必填项、技术参数走默认值、调参收敛成档位」的既定原则严重背离。

具体病灶:

1. **Active Memory 12 个旋钮**:含 4 个 `recent{User,Assistant}{Turns,Chars}` 细分参数和 2 个熔断器参数(`circuitBreakerMaxTimeouts`/`circuitBreakerCooldownMs`)——纯内部实现调参,不该面向用户;
2. **7 个互不相干的字符预算**:`bootstrapMaxChars=12000`、`dailyContext.maxChars=12000`、`capture.maxInputChars=6000`、`review.maxInputChars=16000`、`memoryFlush.maxInputChars=32000`、`dreaming.maxInputChars=48000`、`activeMemory.maxSummaryChars=220`,无交叉校验;
3. **主开关 + 9 个子开关**的组合空间里藏着 L2 那类隐式依赖;
4. **Settings 页把「塑造 prompt 的设置」和「后台管道设置」混排**:真正影响系统提示词的只有 `enabled`/`bootstrapMaxChars`/`canonicalMemory.enabled`/`dailyContext.*`/`activeMemory.*`;capture/review/dreaming/flush/embeddings/search.chunk* 全是后台作业参数,却被摆成同等地位;
5. **Embeddings 6 项全暴露**(providerId/model/customProviderId/apiKey/baseUrl/dimensions),多数用户永远用 `auto`。

---

## 七、建议(按优先级)

> **注:本节是使用情况确认前的通用建议。2026-07-12 与用户确认实际使用情况后,以 §八/§九 的结论为准**(其中 P0 安全项不变)。

### P0 — 安全
1. server 端修复未认证 header 越权:校验 Bearer token 或至少在非 loopback 监听时拒绝 identity header(S1);
2. Telegram `userId` 改用 `from.id` 而非 `chat.id`(S2)。

### P1 — 删除死物(纯减法,零行为变化)
3. 删 `dreaming.{maxSessions, maxMessagesPerSession, minRecallCount, minUniqueSources, sources}` 和 `canonicalMemory.store`;`dreaming.model` 要么真正接上模型选择,要么删;
4. 删 `memoryScopeId` 计算与存储(设计文档已判死刑);
5. 迁移确认后删 cleanup 脚本与迁移 store key;清理 worktree 里的 hbs 残留。

### P2 — 收敛配置(直接回应「配置繁琐」)
6. 设置页收敛为一屏:**总开关、记忆目录、capture 三态(合并 enabled+mode 为单一 `mode`)、dreaming 开关+频率、embeddings 的 provider(auto/自定义)**;其余 ~50 项全部退到 settings.json 默认值,做成「高级配置」不入 UI;
7. 7 个字符预算收敛成一个全局预算或「小/中/大」档位;
8. Review 二选一:要么在 UI 给一个开关(不暴露调参),要么把它的 6 项调参面砍掉只留 `enabled`+`interval`;
9. dreaming 配置从 Tasks 收回 Settings(或反之),消灭双入口。

### P3 — 架构收敛(中期)
10. 定一个记忆域的**单一权威运行时**:memory 逻辑全部收敛到 `packages/onething-runtime`,`apps/server` 与 Electron 插件都只做 host wiring,消灭 server 里的平行实现;
11. 目录布局按设计文档统一到 `<memoryRoot>/users/<userId>/`,并与 server 的 `owners/` 方案二选一;
12. 给 `hermes-file-memory` 的读改写加串行化队列(复用 `AsyncSaveQueue`);
13. 把 `plugins/soul-memory.ts` 核心库改名挪位(如 `memory/core.ts`)并拆分,消除「两个 soul-memory.ts」的命名陷阱;
14. 给 flush 一个独立的 `memory-flush.md`(或在 daily-note.md 顶部注明双重用途)。

### 功能取舍参考(哪些可以考虑砍)

| 功能 | 复杂度占比 | 砍掉的影响 |
| --- | --- | --- |
| Canonical/Graph 图谱记忆 | **最高**(graph.ts 51KB + SQLite + embeddings + 去重阈值 + 14 个 graph IPC channel) | 失去结构化事实/实体面板;文件记忆(USER/MEMORY.md)不受影响。若平时只用 Notes 和 Profile 文本,这是性价比最高的减法 |
| Review(SOUL/DREAMS) | 中 | SOUL.md 停止自动演化;可保留手动编辑 |
| Active Memory 熔断器/细分预算 | 低(但 UI 占比大) | 收成固定默认值即可,无功能损失 |
| Embeddings 自定义 provider | 中 | 收成 auto + 一个自定义入口 |

---

## 八、实际使用情况(2026-07-12 用户确认)

| 功能 | 在用? | 说明 |
| --- | --- | --- |
| Capture(聊天后 → daily note) | ✅ | 但见推论 2:产出目前没人消费 |
| Review(~10 轮 → SOUL/DREAMS) | ✅ | **痛点**:固定 10 轮节奏太笨——短会话永远等不到晋升,期间内容只停留在 daily note |
| Hermes 文件记忆(USER/MEMORY.md 工具) | ✅ | 抄 Hermes 的设计,体验可以 |
| Rules + bootstrap 全量注入 | ✅(被动) | 实际承担了 100% 的"记忆召回":SOUL/USER/MEMORY.md 整体进 system prompt |
| Dreaming(cron 晋升) | ❌ | 默认关,从未启用 |
| Canonical/Graph 图谱 | ❌ | 主要因为**设计不好**,弃用 |
| Active Memory 召回 | ❌ | 机制被根本性否定:发请求前要先做一跳记忆搜索,延迟不可接受。不是调参问题,是不要这条机制 |
| Flush(压缩前) | ❌ | |
| Daily Context(会话开始注入日记) | ❌ | |

### 三个结构性推论

1. **实际记忆模式 = 「全量注入」,「检索式记忆」整条线已弃用。** active-memory、search、indexer、embeddings、SQLite 索引、graph——这一整条基础设施的存在理由就是"按需检索",而用户已明确不走这条路。它们不是"可以优化的功能",是**可以整体删除的死基础设施**(约占 memory 域一半以上的代码和 2/3 的设置项)。
2. **daily note 目前是只写不读的黑洞。** capture 在用、往日记写;但日记的三个消费者(dreaming、daily-context、review 不读日记)全部关闭/不存在 → capture 的产出没有任何路径回到 AI 的上下文。用户感知到的"capture 了但没进记忆",在代码层面是事实。
3. **「10 轮才晋升」的痛点是结构性的,不是参数问题。** 长期记忆(MEMORY.md)当前只有两条进入通道:手动 hermes 工具、dreaming(关着)。review 每 10 轮写的是 SOUL/DREAMS,不写 MEMORY.md。所以短会话里 capture 到的高价值事实,在现有架构下**永远**不会自动晋升——调 `review.interval` 也解决不了。

---

## 九、基于使用现状的收敛方案(v2,取代 §七 的取舍矩阵)

> **架构定稿与执行路线见 `docs/design/memory-system-v2.md`**(2026-07-12),本节保留为方案雏形。

### 目标形态

**文件记忆 + 全量注入 + 两条写入链**,没有检索、没有图谱、没有 cron。

```
写入:
  capture(聊天后,双通道)
    ├─ 日常观察 ──────────→ memory/<date>.md   (原始底账,不注入)
    └─ 高置信稳定事实 ────→ MEMORY.md          (直接晋升,吸收 dreaming 的判断职责)
  review(触发条件放宽)──→ SOUL.md            (人格演化,保留)
  hermes 工具(显式记/忘)→ USER.md / MEMORY.md (保留不动)

读取:
  system prompt 静态注入:rules + SOUL + USER + MEMORY(单一 bootstrapMaxChars 预算)
```

### 关键改造点

1. **capture 双通道晋升(解决「10 轮」痛点)**:把 dreaming 的"值不值得进长期记忆"判断合并进 capture 的提示词,capture 输出两类 action——`daily`(写日记)和 `promote`(经 `addHermesMemoryEntry` 直接写 MEMORY.md,复用现有原子写路径与去重)。晋升发生在**当轮聊天后**,不再等 10 轮、不再等凌晨 cron。
2. **review 触发条件放宽**:从"硬性每 10 用户轮"改为"会话结束/空闲超时 且 距上次 review ≥N 条用户消息"(或累计 capture 条数触发)。review 职责收窄为 SOUL.md 演化,不再兼任晋升。
3. **daily note 降级为审计底账**:保留写入(便于回溯、也给 dreaming 将来复活留门),但明确它不注入、不被读,UI 里作为 Notes 浏览即可。

### 删除清单

**代码**(`packages/onething-runtime/src/memory/`):
- 检索线:`active-memory.ts`、`search.ts`、`indexer.ts`、`database.ts`、embeddings 依赖
- 图谱线:`graph.ts`(51KB)、`canonical.ts`
- 其余:`flush.ts`、`daily-context.ts`、`dreaming.ts`(晋升逻辑并入 capture 后删)
- 相应清理核心库 `plugins/soul-memory.ts` 与 builtin 插件中的接线、hooks、scheduler task

**传输**:34 个 IPC channel → 约 10 个(files/notes + capture + logs);graph×14、profile×6 随图谱一起删;server 端对应 `/api/memory/graph/*`、`/profile/*`、`/index`、`/dreaming/run` 端点删除。

**UI**:
- `MemoryPanelContent.vue`:删 Profile/Facts 表格区(靠 graph observations 支撑),面板收敛为 Notes/文件浏览与编辑 + reveal 目录;
- `MemorySettingsTab.vue`:~40 项 → **约 8 项**:`enabled`、`directoryMode`/`customDirectory`、`bootstrapMaxChars`、`capture.mode`(三态,合并 enabled)、`review.enabled` + 一个触发阈值、`logging.level`。`activeMemory`/`search`/`embeddings`/`canonicalMemory`/`dreaming`/`memoryFlush`/`dailyContext` 整组删除;
- `SchedulerPanelContent.vue` 的 dreaming 配置块删除,消灭双入口。

**设置项总量:~60 → ~8。**

### 分阶段实施

| 阶段 | 内容 | 性质 |
| --- | --- | --- |
| Phase 1 | 删死配置字段 + 设置页收敛到一屏(§六病灶全清) | 纯减法,低风险 |
| Phase 2 | 删检索线 + 图谱线(代码、IPC、server 端点、Facts UI、SQLite) | 大减法,用户已确认不用 |
| Phase 3 | capture 双通道晋升 + review 触发条件放宽 | 行为改造,解决核心痛点 |
| Phase 4 | server 平行实现收敛、目录布局统一、hermes 写入加队列(§七 P3) | 架构,可独立排期 |

P0 安全项(server header 越权、Telegram chat.id)独立于以上,仍需尽快修。

---

## 附:证据索引

- 端点清单:`apps/server/src/http.ts:246-278`;鉴权缺失:`http.ts:2175`
- IPC channel:`src/shared/ipc/channels.ts:276-308`;代理:`src/main/ipc/memory.ts:18-44`
- 插件注册:`src/main/plugins/loader.ts:29,55-60`
- 设置默认值:`src/shared/defaults/settings.ts:58-174`;类型:`packages/onething-runtime/src/memory/types.ts:119`
- prompt 注入:`packages/onething-runtime/src/memory/prompt-context.ts:24`,经 `prompts/builder.ts:437` 插件 hook
- dreaming 死字段消费缺失:对照 `dreaming.ts:44-45,73-74` 与 `soul-memory.ts:7087,7112-7132`
- 既往审计:`docs/audit/system-audit-2026-07-11.md`(§5.1、§5.2、§5.6);设计文档:`docs/design/multi-user-memory-notes.md`
