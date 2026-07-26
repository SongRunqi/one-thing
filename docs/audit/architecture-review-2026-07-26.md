# 系统架构审查 2026-07-26

- **基点**：commit `00d24126`（分支 `redesign/prompt-assembly`，P0-P6 统一装配层改造全部落地之后）
- **方法**：四路并行审查（分层边界 / 装配与多宿主 / 数据与存储 / 事件与流式链路），全部结论由独立校验代理逐条到代码核实（22 条 confirmed、4 条 adjusted），另补查测试架构、provider 扩展面、契约包三个盲区。所有证据均为亲读代码取得的 file:line。
- **规模**：全仓约 30 万行。core 129 文件 / runtime 922 文件（外层 571 + app 树 351）/ renderer 358 文件 / server 6 文件 1.1 万行。

---

## 总评

**方向是健康的，形态在付息。** P0-P6 统一装配层改造的核心承诺经核实基本兑现：依赖方向单向（core 零上行、gateway 只依赖 core、runtime 无 electron、外层→app 反向引用实测为零）、`createOnethingBackend` 确实是 Electron / server / CLI 三宿主共用的唯一引擎装配配方、会话持久化（JSONL 双驱动、LRU 丢写防护、启动扫描取消）质量扎实、权限核心状态机真统一、SSE coalescer 在两个 sink 间真复用。

真正的债集中在四条主线上：

1. **一个 P0 正在造成损害**：server 的流中止走一个从未被填充的僵尸账本，web 端停止按钮停不掉真引擎。
2. **层的形态与层的方向脱节**：onething-runtime 一包两层、近 30 个目录重名；core→runtime→app 三层改名流水线的中间层只有单消费者；引擎栈 4 层继承 + 4 层工厂、类型逐层 `as` 洗掉。
3. **契约层定位不自洽**：core 拒依赖 shared 而镜像出 63 个 Like 类型；shared 自己却反向依赖 runtime 形成包级环，且是唯一不设防的包；同一事件流存在四套互不编译期对齐的词表。
4. **server 的"统一"只完成一半**：引擎收敛了，但引擎之上又长出一整套平行应用层（16 个 ByOwner Map、变量/调度/MCP 双真源），8865 行单文件、真实装配路径零测试——P0 正是这个盲区的直接漏网样本。

---

## 已核实成立的架构承诺（不要过度矫正）

| 承诺 | 核实结论 |
| --- | --- |
| 依赖方向单向 | core 内 `@shared` 引用 0；runtime 外层→app 引用 0；app→外层经 67 个别名子路径单向 |
| 唯一装配配方 | Electron（`apps/electron/src/app/main-process.ts`）、server（`runtime.ts:1196`）、CLI（`app/headless/backend.ts:92`）都经 `createOnethingBackend` 起引擎 |
| import 零副作用 | `app/__tests__/import-side-effect-free.test.ts` 真实有效 |
| 会话持久化 | steps/toolCalls 落盘冗余已由 dehydrate/rehydrate 消除（`session-dehydrate.ts:114-139`）；启动全量 sanitize 已改冷加载修复；2026-07-11 审计的 LRU 丢写竞态已用强引用快照修复（`session-repository.ts:137-164`） |
| 权限核心 | 单一状态机（pending/promptOrder/合并等价请求）三宿主共享；targetChannel 亲和是引擎级设计（`headless-stream-engine.ts:47-56`），非补丁 |
| 流式 sink 复用 | SessionStreamCoalescer 在 Electron IPC 与 server SSE 语义一致复用；gateway 按 IM 语义分段合理；断连清理（unbind/dispose/SSE close/gateway finally）均有 |
| renderer 收口 | 生产代码无 `window.electronAPI` 直摸（仅 platform/ 白名单） |
| CLAUDE.md | `00d24126` 已重写，与迁移后世界一致（审查期间曾以旧版为据，已修正） |

---

## 问题清单

严重度标尺：**P0** = 正在造成损害或随时爆；**P1** = 结构性债务持续付息；**P2** = 异味/一致性问题；**P3** = 可改进。

### A. 当下就在造成损害

#### A1. 【P0】server 流中止走从未填充的僵尸账本，web 停止按钮停不掉真引擎

`apps/server/src/runtime.ts:1238` 创建 `activeControllers` Map，但全仓**没有任何一处 `.set()`**往里放 AbortController——它是 P4"接真 StreamEngine"后遗留的僵尸账本。三条生产路径仍在读它：

- `streams.abort`（`runtime.ts:3135-3142`）在空 map 上 no-op，仍返回 `{success:true}`；
- `streams.active`（`:3154-3158`）恒返回空数组；
- scheduler 的 `getStreamHost().abort`（`:2074-2078`）同样空转。

真正能停引擎的 `backend.abortSession`（→ `engine.abort`，`:1211-1213`）只挂在 `command:abort` 分支（`:3046-3049`）。web 前端停止按钮的链路是 `chat.ts:2228` `stopGeneration` → `web.ts:1239` `POST /api/streams/abort` → 僵尸 map；Electron 同一个按钮却直连 `getStreamEngine().abort()`（`apps/electron/src/main/ipc/chat.ts:107-121`）。`http.test.ts`（4299 行）对 `/api/streams/abort` 零用例。

校验补充：`app/engine/stream/stream-processor.ts:43` 导出的 `activeStreams` 是同病账本——Electron legacy abort 路径（`main/ipc/chat.ts:26-28,107-115`）读它，但全仓无写入者，**有读者无写者**，该分支同样空转。

**影响**：web 用户点停止后 UI 显示已停，引擎继续烧 provider token 并继续推 SSE；`/api/streams/active` 恒报无活跃流；调度器超时中止在 server 宿主完全失效。

**建议**：删掉两个僵尸账本，`streams.abort/active` 直接委托 `engine.abort` / `engine.getActiveSessionIds`；为 `/api/streams/abort` 补一条"真引擎流被停"的回归测试。

---

### B. 层的形态：一包两层与改名流水线

#### B1. 【P1】onething-runtime 一包两层：src/app 假包 + 近 30 个目录与外层两两重名

原 Electron main 整树（351 个 ts 文件）迁入 `packages/onething-runtime/src/app`，与外层 runtime（571 个文件）同居一包。两棵树近 30 个同名目录（agent-loop、providers、tools、storage、memory、themes、prompts、mcp、media、scheduler…），同一概念常有三个同名文件分居三层（`stream-processor.ts` 在 core/engine、src/、src/app/engine/stream/ 各一份）。

- `@onething/app` 靠别名伪装独立包；package.json 虽有 `"./app"` 出口但整个 exports map 是死配置（`onething.aliases.ts:4-5` 头注释自认）。
- 围栏漏洞：`architecture-boundaries.test.ts:54` 的相对路径 pattern 只枚举 `app/(engine|stores|tools|providers|channel)/` 5 个子目录，其余 35 个 app 子目录的相对路径反向引用不设防。
- 宿主绕过门面：`apps/server/src/runtime.ts:50-80` 除 backend 工厂外深 import 了 `@onething/app` 的 8 个内部模块（store.js、stores/settings.js、skills/…、engine/prompt/system-prompt-snapshot.js），`http.ts:14` 直 import `events/stream-coalescer.js`。

**影响**：grep 一个模块名命中两三棵树，无法从路径判断所在层；"唯一装配门面"名不副实，重构 app 内部会波及 server。
**建议**：把 src/app 提为真独立包（自有 package.json、显式出口、收窄宿主可见面），或给两层目录立可区分的命名约定；围栏 pattern 覆盖 app 全部子目录；server 的 8 个深 import 收进 backend 工厂返回面。

#### B2. 【P1】core→runtime→app 三层改名流水线：中间层每个模块只有 1 个消费者

runtime 外层的 `stream-engine.ts`、`stream-processor.ts`、`stream-runtime.ts`、`runtime.ts`、`product-stream-runtime.ts` 是把 Core\* 符号改名为 Onething\* 的薄包装，其别名级消费者各自恰好只有一个对应的 app/ 模块（stream-runtime 甚至为 0）。同构遍地：

- `src/agent-loop/providers/` 与 `src/app/agent-loop/providers/` 文件名完全同构，app 版每个 15-48 行只做 fetch 绑定（claude 15 行壳 vs 外层 790 行真实现、codex 48/1450、gemini 15/561）；
- `app/engine/stream/message-queue.ts` 全文 7 行，纯 re-export core 的 PendingMessageQueue。

（校验修正：`gateway-runtime.ts` 不是纯改名层——除 re-export 外还有约 120 行真实工厂。）

**影响**：跳转一个符号穿三次改名（CoreX→OnethingX→X），每加一个引擎概念要在三层各登记一次；中间层没有第二个消费者，抽象没有摊薄成本，纯付息。
**建议**：单消费者的 Onething\* 改名层整体塌缩，app/ 直接消费 core 符号；fetch 绑定这类真增量合并进外层模块，砍纯 re-export 文件。

#### B3. 【P1】流式引擎栈 4 层继承 + 4 层工厂，中间层零行为、类型逐层 as 洗掉

继承链 `HeadlessStreamEngine → CoreStreamEngine（1343 行）→ OnethingStreamEngine（67 行，除一行逻辑全是 super 转发）→ app StreamEngine`；配套四层 runtime 工厂链，其中：

- `stream-runtime.ts:108-125` 十处 `options.x as CoreStreamEngineRuntime['x']` 逐字段洗型；
- `product-stream-runtime.ts` 12 个泛型参数三次整段照抄，结尾 `as unknown as`；
- `app/engine/stream-engine-runtime.ts` 结尾又一个 `as unknown as MainStreamEngineRuntime`；
- 核心引擎的事件出口是 `emit(sessionId, event: any)`（`core-stream-engine.ts:39-41`）；
- `core/engine/agent-loop-executor.ts` 2498 行导出 50+ 个 adapter interface。

对照：app/events 的 event-bus/ring-buffer/stream-channel 三文件各 4 行纯 `extends CoreX<SharedType>` 壳——说明事件层迁移已收干净，引擎层留下了双份中间壳。

**影响**：每个流式行为改动跨 3 个包 4-8 个文件找落点；`as` 洗型让编译器在装配层失明，接口不合只有运行时才炸。
**建议**：砍 runtime 包两层纯转发；core 的 adapter 面收敛成按子系统分组的 Runtime 接口，替代 50 个散装 interface。

---

### C. 契约层不自洽

#### C1. 【P1】core 拒依赖 shared，催生 63 个 Core\*Like 镜像类型 + 42 个 \*WithAdapters 泛型函数

域类型真源在 `packages/shared/ipc`，core 全包零 `@shared` import。core 为承接下沉的引擎逻辑，用结构镜像（`CoreStreamToolCallLike` 与 shared `ToolCall` 逐字段对应，`core/engine/stream-processor.ts:28-41` vs `shared/ipc/tools.ts:100`）加泛型参数化重述同一套域模型。app 树 87 个非测试文件 import `@shared`，外层 runtime 为 0——域类型真源被隔在 app 层，core 只能镜像。这是 B2 改名流水线存在的根因。

**影响**：域类型加一个字段要同步 shared 真类型 + core Like 镜像 + 各层 adapter 签名，三处漂移；2498 行全泛型 executor 读不出具体类型。
**建议**：提一个 core 可合法依赖的纯类型层（或允许 core 依赖 @shared 的类型子集，围栏改为只禁 IPC_CHANNELS/运行时代码），用真类型替换 Like，逐步去泛型化。

#### C2. 【P1】shared 反向依赖 runtime：值级 re-export + 类型真源倒挂，包级依赖环，围栏零覆盖

四路审查都把 @shared 当最底部的中立契约层，实际它至少在 8 个文件里向上 import `@onething/runtime`，其中三处是**值级** re-export：

- `shared/backend/store-lock.ts:1-13` — re-export StoreLock 类等 from `@onething/runtime/storage`；
- `shared/voice/segmenter.ts:1-5`（及 tts-stream/speak-markup）— re-export 分句函数；
- `shared/ipc/search.ts:5-11` — re-export 常量与函数 from `@onething/runtime/search/protocol`（renderer 4 处 import 它，目前恰好都是 `import type`，一个值 import 之差就把 runtime 拖进 web bundle）；
- `shared/ipc/evals.ts:6`、`practice.ts:5-13`、`usage.ts:1-6` — 契约类型真源在 runtime 实现模块（practice 正是 renderer 因 node:fs 污染被迫手拷贝默认值的那个模块）；
- `shared/json.ts`、`tool-errors.ts`、`ipc/router.ts`、`events/stream-chunks.ts` 等还值级依赖 `@onething/core` 五个子路径。

app 树 87 个文件 import @shared → 包级环 `onething-runtime ↔ shared`。`architecture-boundaries.test.ts` 7 条规则**没有一条扫描 packages/shared**——唯一完全不设防的包。

**影响**：renderer 被围栏强制走 @shared 取型，而 @shared 本身是后端实现代码的洗白通道，加一个值 re-export（已有三处先例）web bundle 就静默吞进 runtime，无任何测试变红；改 runtime 实现类型等于在改跨宿主 wire 契约而无人把关。与 C1 合看，"契约层"的层级定位在仓库里已不自洽。
**建议**：把 shared 恢复成真叶子——契约类型下沉进 shared、runtime 反向 re-export；store-lock 类纯后端出口移回 runtime；给围栏补"shared 禁 import runtime/app"，现存违规挂基线逐清。

#### C3. 【P1】同一事件流四套词表，互不编译期对齐

wire 契约在 `shared/events/session-events.ts`（38 种事件），但：

- core 自造镜像：`CoreEventOnlySessionEvent` 16 种（`event-only-emitter.ts:25-49`）+ `PermissionBusEvent` 3 种 + 9 个 `command:*` 裸字符串订阅（`headless-stream-engine.ts:195-240`），发射口是 `event: any`；
- server 底盘的类型参数是 `AgentEngineSessionEvent`（9 种）——这词表属于只在测试 helper 里实例化过的 echo 引擎（`core/agent/agent-engine.ts:16-27`），真实流量是 38 种 shared 事件，靠 17 处 `as unknown as` 缝合（`runtime.ts:1208` 等）；
- renderer 再私造第四套 chunk 词表（`chat.ts:91-117`），`ipc-hub.ts:263` 以 `chunk: any` 入口手工翻译。

**影响**：事件契约演进（如 `tool:input-end` 加字段）无编译期护栏，漏翻译表现为 UI 静默缺数据；server 的类型标注对读者是误导。
**建议**：让 shared/events 成为唯一词表——core 以 type-only import 或代码生成对齐（type import 不构成运行时依赖，可放行）；server 直接用 shared SessionEvent；ipc-hub/chat store 淘汰翻译层。

---

### D. server：统一装配只完成一半

#### D1. 【P1】server 在装配工厂之上又私建一整套平行应用层，同进程双真源

`createRealServerBackend` 确实走 `createOnethingBackend`（引擎收敛成立），但随后 `runtime.ts:1248-1285` 连排 **16 个 \*ByOwner Map**，为 variables、scheduler、MCP、media、memory、agents、prompts、plugin catalog、todo-plan、auth 等子系统各自 new 出 per-owner 实例，而引擎内部同名子系统已由工厂以 app 单例装配。最尖锐三例：

1. **variables 双真源**：引擎走 app 的 `bootstrapVariableSystem`（`backend.ts:148`，无条件执行），HTTP API 走 server 自建 `VariablesStore`（`runtime.ts:2166-2198`）；默认用户两个内存缓存写**同一个 variables.json**（`:8662-8663`），互不失效、整文件写回互踩。`:1227-1229` 代码自己的注释早已点破："a second local repository over the same files would fork the in-memory truth and race writes"——session 修了，variables/scheduler/media 未修。
2. **MCP split-brain**：工厂调用不传 `mcpAcp`（`:1196-1206`），引擎侧从不 `registerMCPTools`（全文件 0 命中）；HTTP 层却自建 per-owner `HeadlessMCPManager`（`:7504-7516`）。即使开 `ONETHING_SERVER_MCP_CONNECTIONS=1`，AI 也调不到 MCP 工具，设置页却显示已连接。同一 MCP 子系统三宿主三种装配路径（CLI 走工厂 `mcpAcp:true`、Electron 走 `initializeMCP()`）。
3. **多租户假面**：per-owner Map 铺满全文件，底下引擎却钉死单一 `ONETHING_STORE_PATH`（`:1171-1173`）单租户；settings 靠 `invalidateAppSettingsCache` 手动补丁同步双缓存（`:1310-1324`）。另 scoped context 的记忆工作区手写 `memoryDir=join(root,'memory')`（`:1833`），与共享 plan 的 `join(root,'daily')` 已分叉。

**影响**：HTTP 写入的变量/调度任务引擎看不到或被覆盖丢写；server 部署下 MCP 功能是幻觉；每加一个子系统都要决定并维护两套装配，P4/P5 型"隔离泄漏"会持续再生产。
**建议**：把 P4 "换 app 真源"路线推到剩余子系统——默认单用户一律委托 app 单例（照 `createAppBackedServerSessionStore` 模式做 AppBacked 适配器），per-owner 平行实例只留给真正多租户的域；引擎侧 MCP 经工厂 `mcpAcp` 初始化后再由 HTTP 层管理。

#### D2. 【P1】server 单体巨文件：8865 行 runtime.ts、4331 行单函数、210 条手写路由，真实装配路径零测试

- `createDevelopmentOnethingServerRuntime` 一个函数从 1218 行跨到约 5549 行，闭包内混装会话仓储、权限镜像、设置脱敏、变量、调度、媒体、OAuth、workspace 沙箱等全部域；
- `http.ts` 是 210 条 `if (method === … && pathname === …)` 串行路由（`'/api/'` 出现 176 次，`Router` 0 命中——而 preload 侧的 `createRouterAPI` 证明生成式方案已存在，只落在 IPC 一种运输上）;
- 测试全经 echo 桩（`:560-563` 注释自认 "tests inject a stub … never boots providers"），`createRealServerBackend` 零覆盖；13 处 `persistsMessages` 分叉让 echo/真实两种模式纠缠同一函数体；
- 生产入口 `main.ts:13` 调的函数名带 "Development" 前缀，名实不符。

**影响**：改 server 任何域都在同一个 4300 行闭包里动刀；真实装配只能真机验证——P5 真机揪出的两处隔离泄漏、以及本次的 P0 僵尸 abort，正是这条无测试路径的产物。
**建议**：按域拆文件（闭包状态显式传参）、路由改声明式注册、为 `createRealServerBackend` 加最小冒烟测试、函数去掉 Development 前缀。

---

### E. 多宿主 API 表面

#### E1. 【P1】平台契约以 ElectronAPI 为锚：非桌面宿主批量手写 unsupported 桩

`packages/renderer/platform/types.ts:16` — `PlatformApi = ElectronAPI & {...}`：宿主中立的抽象以单一宿主的 API 定形（ElectronAPI 定义在 1801 行的手写类型文件 `renderer/types/index.ts:636`）。实测桩规模：

- `platform/web.ts` 1341 行手工逐方法映射 HTTP，其中 goal（`:984-993` "Electron-only for now"）、music（`:696`）、evals（`:870`）、practice 全是桩；对照 `platform/electron.ts` 仅 28 行——桌面几乎免费，其它宿主全价；
- server 为 voice 实现 12 条路由 + 12 个 facade 方法全部返回 unavailable，gateway 8 条路由全部返回 disabled，ACP connect 固定抛错。

**能力矩阵实况**：Electron 全量；web/server 无 goal、practice、music、evals；gateway 仅 chat+permission。

**影响**：每个新功能默认桌面独占，其它宿主的差距以桩代码形式静默累积；新增第五个宿主要么再抄 1300 行映射要么再写几百行桩。
**建议**：契约的锚反转为宿主中立的 domain facade（core 的 `OnethingRuntimeFacade` 已是雏形），ElectronAPI 变成它的一个投影；能力缺席用 PlatformCapabilities 声明式表达，UI 按 capability 降级。

#### E2. 【P1】跨宿主 API 零生成机制：加一个方法手写 4-6 处

同一套 API 三种运输（Electron IPC、HTTP、web fetch），除 preload 的 `createRouterAPI`（`create-api.ts:28-36`，按 Router.methods 自动生成）外全是人肉镜像：shared 类型 → electron handler → preload → web.ts → http.ts → runtime.ts，约 4-6 处手工同步，无任何一处生成或校验另一处，漏一处只在对应宿主运行时暴露。web/server 长期滞后于 Electron 的功能面差距正是这个成本的直接后果。

**建议**：Router 定义扩展为三运输共用真源，自动生成 HTTP 路由表与 web fetch 客户端（与 preload 对称）。

#### E3. 【P2】IM 网关只能寄生在桌面进程内，包依赖方向与宿主现实倒置

gateway 包层纪律是 Electron-free、只依赖 core（围栏强制），但唯一装配点在 Electron 主进程（`main-process.ts:227-229` `initializeGateway`、`:273-276` 注入桌面进程的 conversationRuntime）；天然适合 7x24 的 apps/server 反而明确禁用 gateway（8 条 disabled 路由）。一个本质 headless 的常驻服务（微信/Telegram 收发 + 远程审批）要求桌面 app 保持运行，合盖即掉线——包层为 headless 化做的全部纪律没有兑换成任何部署自由。

**建议**：把 gateway 装配点移到（或复制到）apps/server——server 已有真 StreamEngine，缺的只是一个 `configureGatewayLifecycle` 等价装配；Electron 内嵌保留为无 server 部署的便利选项。

---

### F. 数据与存储

#### F1. 【P1】ONETHING_STORE_PATH 隔离仍有多处同类泄漏，且没有围栏防复发

`94110356` 刚修掉两处，同类至少还有四处直拼 `homedir + '.onething'`：

- `themes/index.ts:64-69, 388-393`（388 处还带 `mkdirSync` 副作用）；
- **最重的一处**：`variables/schema.ts:17` 默认 `ai_note_dir: '~/.onething/memory'`；隔离的 server 起来后 variables.json 必然缺失，`runtime.ts:1383-1394` 回退默认值，`:1848-1851` 随即 mkdir 并写 SOUL.md——**隔离 server 写穿真实用户的 `~/.onething/memory`**；
- `apps/electron/src/main/ipc/evals.ts:82-84` 重新硬编码（而 `storage/paths.ts:293-297` 已有现成 helper——泄漏模式在持续再生产）；
- `app/login-shell-env.ts:67-69`（缓存内容含完整登录 shell 环境，注释自认可能含密钥）。

围栏测试只查 import 方向，完全不查路径拼接，所以修一批长一批。

**建议**：围栏加一条路径规则——除 `storage/paths.ts` 等白名单外禁止 `homedir()` 与 `'.onething'` 组合；`ai_note_dir`/themes 默认值改从 `getOnethingStorePath()` 派生。

#### F2. 【P1】desktop 与 server 并发共写同一 store，跨进程互斥只有单边执行

`settings-repository.ts:81-89` 注释承诺"desktop 与 headless server 共写同一 settings.json，用文件锁互斥"，但只有 desktop 真取锁：

- server 的 `createSingleFileServerSettingsStore.save`（`runtime.ts:6347-6372`）裸 tmp+rename，不取 `.lock`；`:1589, 1621` 还有无锁的 load→merge→save 读改写；
- `StoreLockOwner` 枚举专门有 `'server'`（`store-lock.ts:6`），但 apps/server 全目录 StoreLock 零引用——单写者守卫对 server 完全失效；
- 而默认开发命令 `bun run dev` 就是 electron+server 同时跑、都不设 ONETHING_STORE_PATH、共写 `~/.onething`。

**影响**：日常开发常态就是双进程双写，新填的 API key/档位可能被另一侧整文件回写覆盖丢失。
**建议**：server settings 写入复用同一 `OnethingSettingsRepository`（或至少取同一把 .lock）；server 启动 acquire `StoreLock('server')`。

#### F3. 【P2】存储路径定义三层近重复，sqlite 死概念遗留满身接缝

同一套目录布局三处定义：`core/storage/paths.ts`（208 行，默认 `.headless-core`，绝大多数 getter 全仓零消费者）、`runtime/src/storage/paths.ts`（339 行）、`app/stores/paths.ts`（234 行纯转发）。sqlite 会话线早已整删，但 `'onething.sqlite'`/`'sessions.sqlite'` 常量、session-repository 里完整的 sqlite 适配器接口（24 处 `sqlite?.*` 调用点）、根 package.json 的 `migrate:sessions:sqlite` 脚本全部还在。

**建议**：删 core 版无消费者 getter；app/stores/paths.ts 收敛为 re-export；sqlite 接缝删除或改名为通用扩展点。

#### F4. 【P2】数据格式演进无版本号与迁移框架

全仓唯一的存储格式版本号是 jsonl 会话 meta 的 `formatVersion`（`storage-driver.ts:91,153`）；settings.json、variables.json、agents、媒体 index、channel-identity 等顶层 JSON 真源全部无版本字段，格式演进靠约 30 个文件里散落的 ad-hoc migrate/legacy 分支。没有版本标记就无法判定数据代龄，兼容分支只能永远保留，且三宿主各读同一批文件、旧格式处理逻辑漂移无从察觉。

**建议**：顶层 JSON 真源加 schemaVersion，集中 migrations 注册表（推广 session formatVersion 模式），读取入口统一走版本升级管道。

---

### G. 跨宿主状态与权限策略

#### G1. 【P1】"活跃流"账本五处、权限 pending 四处镜像、无人应答超时三套数值互不相认

跨宿主状态没有单一居所：

- **流账本 ×5**：core 引擎真源（`headless-stream-engine.ts:46`）、app stream-processor 的有读无写僵尸（A1）、server 僵尸（A1）、CLI daemon 一份（`headless/backend.ts:76`）、renderer UI 一份；
- **权限 pending ×4**：core Permission 内存真源（进程死即丢——"审批跨重启存活"因此迟迟做不了）、server 镜像（`188c03b3` 后职责已缩为 echo 源 + requestId 索引，但机制仍在）、renderer store、gateway coordinator；
- **无人应答超时 ×3**：引擎侧 system-driven 120s 自动拒（`permission-policy.ts:70`）、CLI daemon 60s 硬编码（`headless/backend.ts:436`）、gateway 默认 300s（`gateway/config.ts:11`）——CLI 的 60s 会抢在引擎 120s 之前拒掉。

**影响**：每接一个新宿主都要重新发明三件套（server 这次就发明错了一件，即 A1）；同一个权限请求在 CLI 60 秒被拒、桌面等 120 秒、微信等 300 秒。
**建议**："无人应答降级"收进 core Permission（ask 带 timeoutMs/policy，宿主只声明数值）；core 提供 pending 权限与活跃流的官方查询/订阅面，宿主镜像只做缓存不做真源。

#### G2. 【P2】亲和校验被 adopt 惯例架空，安全语义全押在宿主入口鉴权上

server 的 HTTP 应答路径无条件采纳 pending ask 的 targetChannel 作为应答 channel（`runtime.ts:3061-3079`，注释自认 "guards against cross-channel spoofing on the bus, not against the owner approving over HTTP"），使 core 的亲和校验（`permission/index.ts:263-269`）对经 HTTP 的应答永真。core 无从表达"哪些采纳是合法的"；未来新宿主照抄 adopt 惯例时没有任何围栏阻止真正的跨渠道冒批。

**建议**：为 adopt 建显式 API（如 `respondAsOwner`）替代宿主手工覆写 channel 字段，让核心能区分"已鉴权的所有者应答"与"总线上的渠道应答"。

---

### H. 围栏、测试与构建

#### H1. 【P1】632 个测试文件共同绕开装配层：唯一装配工厂零功能测试

全仓 632 个 .test.ts 共 11.9 万行，几乎全部打在子系统层。P0-P5 改造的核心交付物——`createOnethingBackend` 与三宿主装配序列——没有任何功能级测试：

- `createOnethingBackend` 在测试里唯一出现是 import 纯度围栏（不 boot）；
- `app/headless/`（CLI 唯一装配路径，461 行）无 __tests__；
- `http.test.ts` 4299 行全经 echo 桩，恰好没有 `/api/streams/abort` 用例——**A1 的 P0 正落在唯一没有用例的路由上：装配错了，3900+ 测试全绿**；
- 围栏测试自身跳过 `__tests__` 目录，测试代码可任意跨界 import。

**建议**：三条装配路径各加一条冒烟测试（临时 ONETHING_STORE_PATH + 桩 provider，真调工厂，断言"发 command:abort 能停流""mcpAcp 开关决定工具注册""变量/设置读写走同一实例"这类接线事实）；http.test.ts 增加真 backend profile 跑 streams/permissions 核心路由子集。

#### H2. 【P2】围栏双轨：1.2 万行检查脚本 28 条失败挂账，棘轮锁不住存量恶化

- `boundary-gate.mjs:14-18` 只按 `[boundary] failed:` 标题行做集合比对——同一条失败检查下再新增十个违规文件，棘轮不响；
- 基线 198 ok / 28 failed，失败里混着检查对象已消亡的死账（`checkRuntimeOwnsSessionSqliteFailoverPolicy` 检查的 `resilient-sqlite-adapters.ts` 文件已不存在；soul-memory 系列十余条），真债务（gateway 越界 import、settings IPC 缺口）与死检查无人能分辨；
- `headless-boundary-check.ts` 本身 11950 行，已成无人敢动的债务。

**建议**：棘轮粒度降到违规明细行；28 条失败分拣一次（死检查删、真债务开条目）；长期让 vitest pattern 围栏吸收仍有效的规则、退役巨型脚本。

#### H3. 【P2】renderer 反向伸手进后端包，browser-safe 契约无正位

renderer 生产代码 5 处绕过 @shared 直接 import 后端包（`ThinkToggle.vue:67`、`model-capabilities.ts:7` 摸 `@onething/runtime/providers/model-capability`；`useAttachments.ts:2` 等 3 处摸 `@onething/core` 深路径）。为防 node 依赖进 web bundle，别名表靠**条目顺序**维持安全（`onething.aliases.ts:27-30` "must be registered BEFORE the engine barrel"）；`practice-strip-defaults.ts` 则干脆手拷贝默认值——伸手与拷贝两种反模式并存，而 C2 显示第三条通道（经 shared 洗白）也开着。缺一个 renderer 可依赖的 browser-safe 契约正位。

**建议**：model-capability、attachment-mime、streaming-args、slash-commands、practice 默认值这类"渲染层也要用的纯逻辑/契约"迁入 @shared（配合 C2 先把 shared 变回真叶子）；renderer fence 加禁 import runtime/core 深路径规则。

#### H4. 【P2】别名解析 typecheck 与 build 判定不一致，runtime family 人肉登记 ~115 条且策略三轨

tsconfig 用 `@onething/runtime/*` 通配全收，vite 侧却要逐条登记（漏登记 typecheck 绿、build/run 才爆——头注释自认）；表尾兜底项把未登记子路径替换成 `src/index.ts/<sub>` 假路径，报错离真因很远；同一张表三种策略并存（@onething/app 前缀通配、sessions regex 通配、其余逐条手登）。@shared/@main/@renderer 不在单源表里，electron.vite/vitest/apps 各自重复。这一坑在项目记忆里已反复付费。

**建议**：runtime family 收敛成一条前缀 + 少数例外（或推广 sessions 的 regex 方案）；@shared 等纳入单源表；删产出假路径的兜底项。

#### H5. 【P2】dev 验证脚手架常驻生产：Session 全量累积流文本、桌面 ring buffer 纯写不读

- core `SessionManager` 在每次 stream:start 自动孵化 Session、逐 delta 累积整条流全文（`session-manager.ts:25-39`、`session.ts:151-160`），其唯一消费者 `setupValidation` 生产 no-op，但孵化本身不受 NODE_ENV 门控（`backend.ts:121` 无条件 `initializeSessionLayer`）；
- EventBus 每会话建 1000 容量 ring buffer 存含 content:part 全量 payload 的事件，全仓 `.replay(` 非测试消费仅 server SSE 一处——**Electron 桌面的 ring buffer 纯写不读**，"per-session ring buffers for event replay"的承诺在主宿主名不副实；且 replay 无缺口检测，SSE 断线重连超 1000 事件静默缺档；
- `useSessionEvents.ts`（192 行 Phase 4b 迁移件）零引用。

**建议**：SessionManager/validation 整体挂 dev 门控；ring buffer 容量按宿主声明（桌面 0 或极小）；replay 返回缺口信息；删死文件。

---

### I. 扩展轴与文档

#### I1. 【P2】provider 扩展面无单一注册表：id 与家族知识散布约 28 个文件、两棵树两套 builtin

加一个 provider 要同步：shared 手写 union（`AIProviderId` 尾部 `|string` 使 union 实际不设防）、外层 `builtin-providers.ts` 定义注册表、agent-loop `factory.ts` 内多份硬编码 id/家族列表（`:126,:221,:428,:465,:537`）、app 树 fetch 绑定壳与另一套 OAuth builtin、`model-capability.ts:132-134` 家族 if 链、renderer 图标/解析——至少 6-8 处横跨 4 个包。`provider-model.ts:34` 注释自认的 "选 deepseek, billed on codex" 事故证明这不是理论风险，当时只以规则+镜像测试压住，结构未收敛。

**建议**：单一 provider descriptor 注册表（id、家族、能力档、agent-loop 工厂、OAuth、图标 key 同源），shared union 与 renderer 映射由注册表派生。

#### I2. 【P2】两份架构文档描述已不存在的世界

CLAUDE.md 已随 `00d24126` 重写对齐（正面确认），但 `docs/codebase-structure.md:16` 仍描述已删除的根 `src/` 四棵树（"正在被逐步瘦身迁移"——实际已整体删除），`AGENTS.md:35-38` 仍写 `src/renderer/` + `window.electronAPI` 直连。三份地图对"代码在哪"给出不同答案，文档失去围栏作用。

**建议**：codebase-structure.md 重写或标失效日期删除；AGENTS.md 对齐 CLAUDE.md 或直接指向它。

#### I3. 【P3】消息三重表示（落盘冗余已治理，正面确认为主）

`ChatMessage` 同时携带 toolCalls / steps（内嵌 toolCall 副本）/ contentParts 三套表示（`shared/ipc/chat.ts:122-130`）。好消息已核实：盘上冗余已由 dehydrate/rehydrate 消除、启动全量 sanitize 已取消、LRU 丢写已修。剩余的是内存/IPC 层三份一致性的维护税。长期向单一 contentParts 时间线收敛，steps/toolCalls 退化为派生视图。

---

## 修复路线图

### 立即（本周，P0 + 低风险高杠杆）

1. **修 A1**：删两个僵尸账本，`streams.abort/active` 委托 `engine.abort`/`engine.getActiveSessionIds`；补 `/api/streams/abort` 真引擎回归测试。
2. **围栏三补**（都是加测试，不动生产代码）：shared 禁 import runtime/app（C2）；路径拼接禁 `homedir()+'.onething'`（F1）；app 相对路径 pattern 覆盖全部子目录（B1）。现存违规挂基线。
3. **F2 半修**：server settings 写入取同一把 `.lock`；server 启动 acquire `StoreLock('server')`。
4. **H2 分拣**：28 条基线失败一次性分类（死检查删、真债务开条目）；棘轮粒度降到明细行。
5. **I2**:两份过期文档处理。

### 短期（1-2 周）

6. **H1 装配冒烟测试**：三条装配路径各一条（这是防止 A1 复发的结构性手段）。
7. **F1 剩余泄漏**：themes/ai_note_dir/evals/login-shell-env 四处改走 `getOnethingStorePath()` 派生。
8. **D1 逐域换真源**：variables → scheduler → media → prompts/agents → MCP（经工厂 `mcpAcp`），照 settings/sessions 已验证的 AppBacked 模式，一域一 PR。
9. **G1 超时收敛**：三套数值合并为 core Permission 的 ask 参数。

### 中期（伴随后续功能迭代）

10. **D2 拆 server**：runtime.ts 按域拆文件、路由声明式注册、去 Development 前缀。
11. **B2/B3 塌缩中间层**：单消费者 Onething\* 改名层并入 app 或 core；四层工厂合成一个真实校验类型的工厂。
12. **C1+C2 契约归位**：契约类型下沉 shared（恢复真叶子）→ core 获准 type-only 依赖 → Like 镜像与 WithAdapters 面逐步消解。这三条是一个连续工程，C2 是前置。
13. **C3 词表统一**：server 删 AgentEngineSessionEvent 台面角色；ipc-hub 淘汰翻译层。
14. **I1 provider descriptor 注册表**。

### 长期（方向性决策）

15. **E2 Router 三运输生成**：单一 Router 真源生成 IPC/HTTP/web fetch 三套绑定——这是消灭"加一个方法改 6 处"的根治手段。
16. **E1 PlatformApi 反转**：宿主中立 facade + capability 声明式降级。
17. **B1 src/app 提独立包**（或与外层合并——二选一，维持现状最差）。
18. **E3 gateway 迁 server 宿主**。
19. **F4 schemaVersion + migrations 注册表**。
20. **I3 contentParts 单一时间线**。

---

## 附：审查方法与置信度说明

- 四路审查代理各自独立读代码取证，互不知晓对方结论；校验代理对全部 P0/P1 逐条重新到代码核实，P2/P3 抽查。
- 4 条 adjusted 的修正已并入正文：exports map 实有 `./app` 条目（但仍是死配置）；gateway-runtime.ts 含约 120 行真工厂（非纯改名层）；CLAUDE.md 已在 HEAD 重写（文档问题降级为两份）；app stream-processor 的 activeStreams 有读者无写者（比"零消费者"更糟）。
- 本文引用的行号以 commit `00d24126` 为准。
