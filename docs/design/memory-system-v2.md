# Memory 系统 v2 架构设计与执行路线(2026-07-12)

> ⚠️ **已失效 —— 本文描述的系统于 2026-08-06 整树退役。**
> soul-memory 插件连同 SOUL.md / MEMORY.md / 日记、面板、设置页、`/api/memory/*`
> 已全部删除，产品**不再有任何记忆子系统**，也没有继任者。
> 退役记录见 `docs/audit/soul-memory-retirement-2026-08-06.md`。
> 本文保留为历史设计记录，**不要照它实现任何东西**。

> 输入:`docs/audit/memory-system-audit-2026-07-12.md`(全量审计 + §八 使用情况确认 + §九 收敛方向)。
> 本文档是 v2 的**架构定稿**与**执行路线图**。原则:先定架构,再按问题点分期执行;每期结束系统都处于可用状态。

---

## 0. 决策输入(已确认)

- 保留:capture、review、hermes 文件记忆、全量注入(rules + SOUL + USER + MEMORY)。
- 删除:图谱 canonical/graph、active-memory 召回、search/indexer/embeddings/SQLite、flush、daily-context、dreaming(其"晋升判断"职责并入 capture)。
- 「请求前先搜记忆再发 AI」的机制被根本性否定(额外一跳延迟不可接受),**不是调参问题**——检索线整体删除,不保留复活开关。
- 核心痛点:长期记忆晋升被 review 的 10 轮节奏卡死;daily note 只写不读。

### 一个重要的成本修正

审计曾断言 server 是 memory 的平行重实现。核实后修正:`apps/server/src/runtime.ts:171,194` 已从 `@onething/runtime/memory`、`@onething/runtime/plugins` 导入几十个领域函数,**领域逻辑本来就是共享的**;真正发散的是 host 接线层——workspace/scope 解析(`owners/<userId>/<workspaceId>` vs 设计目标 `users/<profileId>`)、调度注册、传输。架构收敛 = 收敛接线层,不需要重写领域层。
(顺带:`apps/server/package.json` 只声明了 `@onething/core`,`@onething/runtime` 靠 workspace 解析裸跑——Phase 2 补上依赖声明。)

---

## 1. 目标架构

### 1.1 分层:一个领域库,一个门面,N 个薄 host

```
packages/onething-runtime/src/memory/   ← 唯一权威领域层(现有,做减法+补门面)
  ├── service.ts        MemoryService 门面(新增,唯一对外入口)
  ├── workspace.ts      目录解析 + 路径沙箱(收敛为唯一实现)
  ├── files.ts          托管文件读写(SOUL/USER/MEMORY/DREAMS/daily)
  ├── hermes.ts         hermes-file-memory(改名自 hermes-file-memory.ts)
  ├── capture.ts        capture 双通道(observe → daily / promote → MEMORY.md)
  ├── review.ts         SOUL.md 演化(触发条件放宽)
  ├── prompt-context.ts 全量注入组装(rules + SOUL + USER + MEMORY,单预算)
  ├── diagnostics-logger.ts
  └── types.ts          v3 settings + 领域类型

hosts(只做接线,不含领域逻辑):
  src/main/plugins/builtin/soul-memory.ts   Electron:hooks/tools/commands/IPC → service(进程内)
  apps/server/src/…                         Headless:HTTP handlers → service
  packages/gateway                          经 CoreConversationRuntime 间接使用(不变)
```

**删除**(整条检索/图谱线):`graph.ts`、`canonical.ts`、`database.ts`、`indexer.ts`、`search.ts`、`active-memory.ts`、`flush.ts`、`daily-context.ts`、`dreaming.ts`,以及 embeddings 在 memory 域的挂点。核心库 `plugins/soul-memory.ts`(8500 行)中对应的类型/纯逻辑/工具定义同步瘦身,幸存部分按上表就近归位,消灭「plugins/ 下的伪插件核心库」命名陷阱。

### 1.2 MemoryService 门面

```ts
createMemoryService({ memoryRoot, settings, logger }) → {
  workspaceFor(profileId?)   // undefined = owner 根;有值 = users/<profileId>/
  files:   { list(), read(path), save(path, text), appendDaily(text) }
  hermes:  { add(target, text), replace(...), remove(...), status(), promptFragment(budget) }
  capture: { run(turnCtx), pending: { save(), discard() } }
  review:  { run(sessionCtx), shouldRun(sessionCtx) }
  prompt:  { buildContext(profileId?) }                  // 全量注入片段
}
```

- 所有 host 只认这个门面;host 内不再出现路径拼接、沙箱判断、提示词组装。
- 写入并发:门面内部对每个 workspace 持有串行写队列,读-改-写(hermes add/replace/remove)在队列内执行;跨进程(Electron + server 同时跑)复用 sessions 已落地的跨进程文件锁方案(commit 5dcf6249 同款),锁粒度 = 单个托管文件。

### 1.3 数据布局(唯一方案,弃用 owners/)

```
<memoryRoot>/                    默认 ~/.onething/memory(settings.memory.directory 覆盖)
├── SOUL.md USER.md MEMORY.md DREAMS.md
├── memory/<YYYY-MM-DD>.md       daily 底账(只写不注入,保留供回溯)
└── users/<profileId>/           channel 用户(懒创建)
    ├── MEMORY.md
    └── memory/<YYYY-MM-DD>.md
```

- 与 `docs/design/multi-user-memory-notes.md` 对齐:`profileId` 来自 channel-identity,已路径安全;channel 用户只注入自己的 MEMORY + daily,永不注入 owner 的 SOUL/USER。
- **`memoryScopeId` 彻底删除**(计算、存储、类型字段);session 上只留 `memoryProfileId`。
- server 的 `owners/<userId>/<workspaceId>/` 布局对 memory 域废弃;server 解析 memoryRoot 的方式与 Electron 完全一致(同一 workspace.ts)。
- 没有 SQLite:检索线删除后 memory 域纯 markdown,Electron 主进程持有它不违反「不在主进程加数据库」的架构规则。

### 1.4 读写链(行为定稿)

```
写:
  capture(afterAssistantResponse,双通道)
    ├─ observe 动作 → appendDaily()                    日常观察进日记
    └─ promote 动作 → hermes.add('memory', …)          高置信稳定事实当轮直接晋升
  review(触发:会话结束/空闲超时 且 距上次 ≥N 条用户消息)→ SOUL.md(+DREAMS.md)
  hermes 工具(模型显式调用)→ USER.md / MEMORY.md

读:
  system prompt = rules(memory-rules.md)+ SOUL + USER + MEMORY,单一 promptBudgetChars 预算
  无请求前检索;daily 不注入
```

- capture 提示词(`memory-capture.md`)吸收 dreaming 判断标准(稳定性、置信度、非一次性),输出动作带 `kind: 'observe' | 'promote'`;晋升复用 hermes 原子写与去重,天然与手动工具一致。
- flush 删除后,`memory-daily-note.md` 恢复单一职责(消除别名耦合)。
- review 不再兼任任何晋升职责;`interval` 语义从「硬性每 10 轮」改为「触发下限」。

### 1.5 传输面:Electron 去代理化

```
现状:面板 → IPC → 主进程 postMemory() → HTTP :8787 → server(读),而写发生在主进程插件(裂脑)
目标:面板 → IPC → 主进程 → MemoryService(进程内)          ← 桌面版不再依赖 server
      HTTP /api/memory/*(幸存端点)→ 同一 MemoryService     ← 仅 headless/gateway 部署使用
```

IPC channel 34 → **9**:`memory:overview`、`memory:read`、`memory:save-file`、`memory:append`、`memory:reveal`、`memory.capture:save`、`memory.capture:discard`、`memory.logs:list`、`memory.logs:cleanup`。graph×14、profile×6、index、dreaming/run、search 及对应 server 端点全部删除。`src/shared/ipc/memory.ts` 类型与 preload bridge 同步瘦身。

### 1.6 Settings v3(~60 → 8 项)

```ts
memory: {
  enabled: boolean            // true
  directory: string           // '' = 默认 ~/.onething/memory(合并 directoryMode+customDirectory)
  promptBudgetChars: number   // 12000(原 bootstrapMaxChars,唯一注入预算)
  capture: 'auto' | 'explicit-only' | 'off'   // 单字段,消灭 enabled+mode 双编码
  review: { enabled: boolean, minUserMessages: number }  // true / 10
  logLevel: 'off' | 'info' | 'debug'
}
```

- 各任务的 timeoutMs/maxInputChars 等技术参数**退出 schema**,成为代码内常量(要调走 settings.json 手工覆盖的逃生门即可,不进类型不进 UI)。
- 迁移:一次性从 `general.soulMemory` 映射(capture.enabled+mode → capture;bootstrapMaxChars → promptBudgetChars;其余丢弃),旧结构读到即改写,不留双向兼容。
- UI:`MemorySettingsTab.vue` 收敛为一屏(上述 8 项);`SchedulerPanelContent.vue` 的 dreaming 配置块删除;`MemoryPanelContent.vue` 删 Facts 表格区,收敛为 Notes 浏览/编辑 + reveal。

### 1.7 安全(独立于功能收敛,优先修)

- server:非 loopback 监听时拒绝 `x-onething-user-id`/`x-onething-workspace-id`,或强制 Bearer token 校验(`http.ts:2175` 增加验证分支);Electron 去代理化后,桌面版彻底不暴露在这个面上。
- gateway:Telegram `userId` 改用 `from.id`,群成员不再坍缩为同一 scope。

---

## 2. 执行路线

顺序原则:**先减法清场,再收敛架构,最后做行为改造**——删掉检索/图谱线之后,门面抽取和去代理化只需要搬 9 个 channel 而不是 34 个,返工最少。安全项独立,随时可插队。

| 阶段 | 内容 | 交付判据 |
| --- | --- | --- |
| **P0 安全**(可与任何阶段并行)✅ 2026-07-13 已完成 | header 越权修复 + Telegram from.id | ✅ 未配 token 时 identity header 一律 401;配 token 后全 API 强制 Bearer(常量时间比较);Telegram userId=from.id、conversationId=chat.id 拆分,群聊回归测试通过 |
| **Phase 1 减法** ✅ 2026-07-13 已完成 | 删检索线+图谱线(§1.1 删除清单):runtime 模块、核心库瘦身、builtin 插件接线、34→10 IPC、server 端点、preload、Facts UI、SQLite/embeddings 挂点;删全部死配置字段 | ✅ 判据全部达成:rg 无残留;node+web typecheck 全绿;memory 域测试全绿。统计:核心库 10769→~5100 行、builtin 插件 3028→1276 行、server runtime -~850 行、MemoryPanelContent/MemorySettingsTab/SchedulerPanel -2034 行、runtime 删 9 模块 + embeddings 双侧整删、IPC/端点/channel/preload/platform 五层全部 34→10;settings 死组(activeMemory/search/embeddings/canonicalMemory/dreaming/memoryFlush/dailyContext)从类型、默认值、normalize、UI 全链路移除 |
| **Phase 2 架构收敛** ✅ 2026-07-13 主体完成 | MemoryService 门面抽取;Electron 去代理化(IPC 进程内直连);server 幸存端点挂同一门面;目录布局统一 `users/<profileId>/` + 删 `memoryScopeId`;hermes 写入队列+跨进程锁;server package.json 补 `@onething/runtime` 依赖 | ✅ 已完成:Electron 去代理化(`src/main/ipc/memory.ts` 直连 soul-memory 插件,桌面版不再依赖 :8787,Electron 与 server 共用 `createOnethingMemoryIpcHandlers` 工厂);hermes RMW 加 per-file 进程内队列 + `withFileLockSync` 跨进程锁(原子写保留);`memoryScopeId` 全链路删除(profile 改为显式 connector/workspaceId/externalUserId 字段 + 旧值惰性迁移,session 只认 memoryProfileId);server 依赖声明补齐;CLAUDE.md 同步。**遗留到 Phase 3/后续**:builtin 内的领域编排(overview/capture/review runner 接线)下沉 runtime 成完整 MemoryService;server 多用户部署的 `owners/` 布局与 `users/<profileId>/` 的最终统一 |
| **Phase 3 行为改造** ✅ 2026-07-13 已完成(晋升通道经用户确认后回滚) | capture 双通道(observe/promote,提示词吸收 dreaming 判断);review 触发放宽(会话结束/空闲 + minUserMessages);flush/daily-note 提示词解耦随删除自然完成 | ✅ review 改为空闲触发(assistant 回复后 5 分钟无新回合才执行,core 的 ≥interval 用户消息下限保留,/memory review run 强制运行不变)。**capture→MEMORY.md 直接晋升曾实现,2026-07-13 用户判定"没必要"后完整回滚**:capture 维持只写日记;MEMORY.md 的进入通道 = hermes memory 工具(模型显式调用)+ /memory remember(手动)。若将来长期记忆积累不足,可选项是强化 memory-rules.md 引导模型更主动调用 memory 工具,而非再给 capture 加写权 | review 不再每 10 轮打断;长期记忆完全由显式动作写入 |
| **Phase 4 配置与 UI 定稿** ✅ 2026-07-13 已完成 | Settings v3 schema + 迁移;MemorySettingsTab 一屏化;Scheduler 面板 dreaming 块删除 | ✅ capture 的 enabled+mode 双字段合并为单一 `mode`('off' 即关;旧 `enabled:false` 在 normalize 中自动折叠为 mode 'off',核心 gate/命令/状态同步改造);Review 补进设置页(开关 + interval,消灭"活跃后台任务零 UI"缺口);设置页单屏四组(Basics/Capture/Review/Diagnostics,~11 控件);Scheduler 面板 dreaming 块已在 Phase 1 随 UI 收敛删除。**决策记录**:§1.6 提议的字段改名(directoryMode+customDirectory→directory、bootstrapMaxChars→promptBudgetChars、logging→logLevel)有意放弃——纯改名无行为收益,还要背一次 settings 迁移;繁琐度目标(单屏、少旋钮、无死字段、无双编码)已全部达成 |

依赖关系:Phase 1 → 2 → 3 严格串行;Phase 4 的 schema 定义可提前到 Phase 1(死字段删除本来就动 schema),UI 一屏化放最后。P0 无依赖。

### 风险与回退

- Phase 1 触点最广(核心库 8500 行瘦身),靠现有测试网兜底:`memory/__tests__/` 10 个套件 + `soul-memory-capture.test.ts` 端到端路由;删除后同步删对应测试,幸存路径测试必须全绿。
- Phase 2 去代理化改变面板数据来源,保留 `postMemory` 一个 commit 的回退窗口(单独提交)。
- Phase 3 改 capture 提示词,用 L1 逐轮追踪(评估体系已落地)对比改造前后同一会话的晋升行为。
- 数据无迁移风险:markdown 文件原地不动;唯一目录动作是沿用 notes→memory 改名逻辑(已有)。

---

## 3. 开放问题(带默认取向,不阻塞 Phase 1)

1. **DREAMS.md 去留**:review 仍写它,但无消费者。默认:保留写入(成本为零),v2.1 再议。
2. **logs 面板去留**:diagnostics-logger 保留(排查 capture/review 行为需要),logs IPC 只留 list/cleanup 两个。
3. **channel 用户是否有 capture**:默认有(写到 `users/<id>/`),promote 只进该用户自己的 MEMORY.md。
4. **`memory:append` channel**:面板目前不用(appendDaily 只被 capture 内部调),默认保留 channel 但可在 Phase 2 复核后删,IPC 面变 8。
