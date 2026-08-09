# pi 扩展体系对标与采纳清单(2026-08-10)

> 依据:对 `~/data/code/pi-mono` 的全量研究(核心 4 文件 + 2987 行扩展文档 +
> 79 个官方示例逐个过 + `.pi/extensions` 自用 4 件 + pi-intercom v0.9.3 真实现
> ~11.8K 行)。完整报告在会话记录;本文只留决策要点与采纳排序。

## 0. 判决

**用户直觉正确,但归因要精确**:pi 能让用户自己写出 intercom(会话互聊),
不是因为 API 面宽,而是因为它有一个我们没有的具体原语 ——
**"把一个外部事件变成一轮对话"**:`sendMessage(msg, {triggerTurn:true})` +
`ctx.isIdle()`。传输/花名册/信箱/回执那 11.8K 行全是扩展自己写的,宿主零改动。
**我们缺的是那两个函数,不是那 11.8K 行。**

两系的本质差异:**pi 在时间轴的每个关节开可改写/可否决的口(介入流程);
我们在空间上开受管贡献点(贡献内容)。** intercom 恰好需要前者的一小块。

## 1. pi 姿态的实测账单(为什么不整体倒向它)

- **裸 string 订阅面零校验**:pi 团队自用扩展 `prompt-url-widget.ts:230` 订阅了
  不存在的事件名 `session_switch`(真名 `session_before_switch`),handler 永远
  不会被调用,没人发现。拼错 = 静默死订阅。
- **无超时/无熔断/无沙箱**(文档明写 "No Built-in Sandbox" / "Only install from
  sources you trust"):一个 `await` 挂住的 handler 无限期挂住整条链;唯一
  fail-closed 的点是 `tool_call`(刻意,且是对的)。
- **无版本承诺**:pi-intercom 的 `peerDependencies: "*"` —— 第三方连版本下界都
  表达不了。
- 它能承受这些,因为**用户即作者**、单进程 TUI、崩了重启即可。我们有市场分发
  给陌生人、多窗口 GUI 日常工作台 —— 威胁模型不同,治理层保留。

## 2. 采纳清单(N 线,按 解锁÷成本 排序)

| # | 原语 | 形态 | 备注 |
|---|---|---|---|
| **N1** ✅ | **triggerTurn 三态投递 + isIdle + peek** | `api.sendMessage(sessionId, content, {triggerTurn: true\|false} \| {deliverAs: 'steer'\|'followUp'\|'nextTurn'})` + `api.sessions.peek/list` + `api.isIdle(sessionId)`;engine 侧走既有 command:send-message 路径 | **已落地(2026-08-10)**,见 §6。**与跨会话信使(原 M3)是同一块砖**。第一个"插件可自发耗 token"的口:manifest 声明 `sessions:post` / `sessions:trigger` / `sessions:peek` + 装前披露 + 默认 fail-closed;照抄三态矩阵,不是布尔 |
| N2 | input 事件(发送前改写/接管) | `{action:'continue'\|'transform'\|'handled'}` 三态链式;handled 短路不走 LLM | 第一个"返回值被消费"的事件族,新开变体类型,不污染观察型 |
| N3 | executionMode 工具级并发声明 | `ToolDefinition.executionMode: 'sequential'\|'parallel'` | 成本近零、纯声明式、治工具并发审计线的真问题 |
| N4 | tool_call 拦截 + 参数改写 | `{block, reason}` + input 原地改写;**fail-closed**(hook 抛错=阻断);多我们一道题:**熔断即阻断**+告警 | |
| N5 | tool_result 改写 | 中间件链,后手看前手 | 脱敏/摘要/富化 |
| N6 | terminate | 工具结果 `terminate: true` 直接结束 agent loop | 结构化产出省一轮 |
| N7 | compact 可替换 + 受管 LLM 调用口 | beforeContextCompact 升级可返回替换结果;`api.llm.complete()` **受管**版(走宿主 provider 解析+计费账本+超时配额),不递 modelRegistry | 插件从"搬运"升到"判断"的钥匙 |
| N8 | 会话控制(newSession/fork) | 多窗口 GUI 语义复杂,殿后 | |

**通用前置(配 N2/N4/N5,成本近零)**:可返回值事件族的订阅名必须是
**枚举常量**,未知名报错不静默 —— pi 那个死订阅就是不做这件事的账单。

**轻通道(独立小期)**:pi 自用扩展是 48 行单文件丢目录、零 manifest 零构建。
我们三件套对市场分发是对的,对"给自己加个仪表"过重 —— 补一条本地脚本形态:
不进市场、不参与更新、能力面自动收窄,单文件即插件。

## 3. 不抄清单(理由经复核)

| 不抄 | 理由 |
|---|---|
| 活组件 UI(返回 Component/接管 footer/吞终端字节/ui.custom 摸宿主对象) | 我们隔着 IPC 无法序列化;且市场分发给陌生人时这是钓鱼面。描述树+锚点+webview 分层保留 |
| 裸跑(无超时/熔断/沙箱) | 我们的威胁模型里有"不读代码就装的用户" |
| on("context") 整数组重写 | 历史重建已有五个未修问题,再叠插件级重写=不可归因;要做也只做"追加" |
| registerProvider | PLUGIN_DEFERRED_REGISTRIES 推迟理由复核仍成立(在飞请求/历史重建/能力协商无局部解) |
| 无版本承诺/裸 string 订阅 | minAppVersion + append-only + 枚举订阅面保留 |

## 4. 感知的修正(用户指正,已采纳)

"A 知道 B 在干什么"= **压缩快照动词**(`api.sessions.peek(id)` →
`{状态, 正在做, 最后活动}` 一句话级),agent 想看才调;事件流是给插件代码
在 main 进程消化的,不进模型上下文。二者在架构图分开标注。

## 5. 与既有排期的合并

N1 吸收原 M3(跨会话信使);M 线并入 N 线成为统一的"动作完备"战役:
**N1(triggerTurn+isIdle+peek)→ 通用前置+N2(input)→ N3(executionMode)→
N4(tool_call)→ M1(通知音)→ M2(搜索供给方)→ N5-N7 → 轻通道**。
呈现/触达线(G2/H1/H3/H4/H2)顺延,优先级由用户随时调。

## 6. N1 落地实录(2026-08-10)与**与规格的差异**

三段式照旧:core 出协议(`packages/core/plugins/sessions.ts`)→ api-builder 出
声明门与矩阵 → 装配层出实现(`packages/onething-runtime/src/app/plugins/sessions.ts`)。
样本插件 `@onething-plugins/session-link`(市场仓 `packages/session-link`)。

**逐条差异(规格 → 实际,及理由):**

1. **`nextTurn` 的映射**。引擎只有两条队列(steering:本轮插话;follow-up:
   本轮 agent-loop 下一次迭代)。`deliverAs:'nextTurn'` **诚实映射到 follow-up**,
   不发明第三条队列。措辞写在 `PLUGIN_DELIVER_AS_NOTES` 里,插件作者读得到。
2. **`triggerTurn:false` 用的是 steering 队列**。"持久化 + 显示、不起轮"没有
   独立机制:`steerMessage` 恰好就是这个语义(立刻持久化并显示,空闲会话不因此
   起轮,留给下一轮消费)。于是 `posted` 与忙时降级的 `steered` 走**同一条**既有
   路径,只是结果里如实报不同的 `delivered`。副作用要说清:posted 的文本**也会**
   被下一轮读到 —— 那正是 pi 的 import-repro 用法所要的。
3. **默认档是 `triggerTurn:false`**。规格没定缺省;取 fail-closed(不声明就不
   花 token)。
4. **状态判定优先序**:`awaiting-permission` > `tool-running` > `generating` >
   `idle`。权限排最前的理由:挂着一张没人点的审批卡时活跃流仍在(而且工具很可能
   还是 executing),但这轮**一步也不会动** —— 说成 generating 就是在说谎。
   pending 不区分 actionable/queued:排队中的那张卡同样意味着被人卡住了。
5. **hop 的口径是保守上界,不是精确链**。`api.sendMessage(sessionId, …)` 不携带
   **调用方所在的会话**(插件可以在事件 handler / 定时任务 / 工具执行里任何地方
   调它)。让插件自己传 `fromSessionId` 会让闸可被规避(传假的或不传就永远
   hop 0),所以取
   `hop = 1 + max(此刻仍在飞的、由插件投递引发的回合的 hop)`。
   代价:并发时偏保守(无关的插件链在跑会让这次投递算高一跳);收益:不需要
   调用方配合,规避不了。**只有会引发/汇入回合的投递才记账**(起轮那一格,以及
   投进一个正在生成的会话)—— 往空闲会话贴十条备忘不会把闸撑爆。
6. **闸的常量**:`PLUGIN_TRIGGER_MAX_HOP = 8`、
   `PLUGIN_TRIGGER_RATE_LIMIT = 10` / `PLUGIN_TRIGGER_RATE_WINDOW_MS = 60_000`
   (每 `(pluginId, targetSessionId)` 对)、在飞判定的宽限期 30s。
7. **`list()` 不带 `contextPercent`**。规格的 peek 形状里有它,但它要按会话解析
   模型上下文窗口 —— N 个会话就是 N 次。列表是拿来"找到那个会话"的,找到之后
   再 peek 一次拿细节。`list()` = `{sessionId, title, state, currentTool?, updatedAt}`。
8. **协作房 / agent 执行会话拒绝插件投递**。它们由协调者独占驱动,引擎本来就会
   当场拒绝内部来源的命令(而那是一次插件观察不到的静默失败),所以在投递口
   前置判掉并回 `reason:'unsupported'`。
9. **`plugin:<id>` 归入 `SYSTEM_INTERNAL_MESSAGE_SOURCES` 那一类**(以**前缀族**
   而不是集合成员的形式,因为 id 是运行期的)。两个必须的后果:
   (a) 渠道路由**绕过** —— 否则插件推给会话 X 的消息会被解析成匿名渠道身份、
   改派到一条 identity 会话去(与 goal/radio/collab 同一个病);为此
   `steerMessage` / `followUpMessage` 也补上了与 `handleSendMessage` 同款的
   bypass;(b) 权限提示按"系统驱动的回合"处理 —— 120s 后自动降级而不是永远挂着,
   这对"没人看着的插件回合"是正确的。
10. **`channel` 刻意不设**(默认 `'ipc'`)。它决定权限提示的目标通道,给一个花名
    会让桌面 UI 上弹出的审批卡永远点不动。
11. **UI 归因**:注入消息带 `origin.source = 'plugin:<id>'` 与结构化
    `origin.plugin = {id, hop}`(shared 的 `MessageOrigin` append-only 加了一个
    可选键)。渲染层今天**不**为它画特殊样式(数据层先带上,呈现列为后续)。
12. **未声明权限的拒绝不计熔断**,与 `theme.updateBackground` 同规:那是作者写错
    了 manifest,不该为一次笔误连坐整个插件。宿主**抛错**才计(scope
    `sendMessage`,归 `conversation-control` 族)。

## 7. N2 落地实录(2026-08-10)与**与规格的差异**

三段式照旧:core 出协议(`packages/core/plugins/input-intercept.ts`:三态、
归一化、链的次序与 fail-open 的注册表)→ api-builder 出声明门(`input:intercept`)
→ 装配层出实现(`packages/onething-runtime/src/app/plugins/input-intercept.ts`
接熔断,`app/engine/stream-engine.ts` 出挂点)。样本插件
`@onething-plugins/input-macros`(市场仓 `packages/input-macros`)。

**订阅面的形态(通用前置的最强兑现)**:`api.interceptInput(id, handler)`,与
`beforeContextCompact` 同构。**不开** `api.on('input')` —— 于是"订阅名枚举化"
不是加一张白名单,而是**根本没有名字可以拼错**:拦截点是一个函数名,拼错就是
TypeError。观察族(`api.on`)的返回值继续被忽略,零污染。

**逐条差异(规格 → 实际,及理由):**

1. **超时预算取 1.5s**(`CORE_PLUGIN_INPUT_INTERCEPT_TIMEOUT_MS`),不是沿用生命
   周期钩子的 5s。那两个钩子挂在压缩路径与回合结束后,用户不在等;这一条挂在
   **回车与消息出现之间**,五秒的空白就已经是"应用卡了"。1.5s 高于任何本地计算,
   低于用户开始重复按回车的阈值。逐 handler 计,链本身**不设总预算** —— 设了就要
   回答"总预算用完时后半条链算 continue 还是算没跑",那是一个不可归因的状态。
2. **熔断罚则是 degrade-surface 而不是 disable-plugin**(新家族 `input-intercept`,
   surface 折成 `input-intercept`)。规格只说"熔断降级后该插件的拦截被跳过";
   在严重度表里这句话只有 degrade-surface 说得出来。理由:拦截 fail-open,失败
   对用户完全无害(他的消息发出去了),为一个无害的失败面砍掉插件的工具/命令/
   面板是把小故障放大成大故障。闸在**链的入口**(拦截不走请求通道),没有"用户
   点重试"的逃生口,所以靠时间半开(`PLUGIN_SURFACE_PROBE_INTERVAL_MS`)——
   与 IM 渠道同一个先例。
3. **`handled` 用新的 `persistOnly`,不复用 steering 队列**。N1 的 `posted` 是
   steerMessage,而 steering 队列的语义包含"这段文本会被下一轮读到" —— 对一条
   已经被本地答掉的 `=1+2` 来说那是错的(它会被再注入一次)。于是 core 的
   `SendMessageCommandLike` 加了 `persistOnly`:持久化 + 显示 + `message:user-created`
   之后**就地返回**,不解析 provider、不建 assistant 消息、不起流。它刻意排在
   **标题生成之前**:handled 必须零模型调用,而标题也是一次调用。
4. **`reply` 复用 N1 的 posted 那一格,但不过链长闸/频率闸**
   (`pluginPostInterceptReply`)。闸存在的理由是插件能自己驱动自己;这里每一条
   回应都由用户刚按下的那次回车一比一引出,不发就不答,天然收敛。套上 10 条/分钟
   的窗口,唯一效果是用户连算十一次之后宏"莫名其妙不答了"。`origin.plugin.hop`
   记 **0**,如实表示"这不是插件发起的链"。
5. **改写痕迹只记归因,不存原文**:`origin.inputTransformed = { by: [pluginId…] }`
   (shared 的 `MessageOrigin` append-only 又加了一个可选键)。存原文 = 每条被改写
   的消息在盘上有两份内容,而历史重建要回答"喂给模型的是哪一份"、编辑重发要回答
   "编辑框里放哪一份"、压缩要决定摘要哪一份 —— 三个已经很复杂的地方各多一个分叉,
   换来的只是一次事后取证。**改写的结果就是这条消息的真相**。
6. **挂点是 `StreamEngine.handleSendMessage`(装配层)的一处**,位置精确:
   在系统内部源早退**之后**、协作房 ingress 门**之后**、渠道路由**之后**、
   `super.handleSendMessage` 之前。四个"之后"各有理由:内部源(goal/radio/collab/
   `plugin:` 前缀族)不进链,否则 N1 的插件投递会被别的插件二次改写、盘上那条消息
   再也说不清是谁写的;协作房由协调者独占驱动,handled 在那里没有意义;路由之后
   才有消息**真正落地**的 sessionId(网关消息会被改派到身份会话)。
7. **"真实用户发送"的口径 = 系统内部源的补集**,而不是另立一张"用户源"白名单。
   代价:网关(微信/Telegram)消息也进链 —— 那确实是一个真人在打字,但它意味着
   一个宏插件也会改写渠道来的消息。收益:不需要第二份"什么算用户"的定义,而这个
   仓库里同一个定义分两份的病已经犯过多次。`ctx.source` 今天恒为 `'user'`,
   字段留着是给将来的第二类源一个位置。
8. **`handleEditAndResend` / `handleRetryMessage` 不进链**。前者改的是一条已经
   存在的消息(在那里 transform 等于原地改写历史),后者根本没有新文本。
   "发送前拦截"就是字面意思:**新发出的那一条**。
9. **返回值不合规 fail-open 但不静默**:未知 action、`transform` 少 `text`、
   `reply` 不是字符串 —— 一律收敛成 continue(或丢掉 reply),同时记一条 error
   日志点名说明。收敛与告警是两件事,少了后者就是又一个 pi 式的静默死订阅。
   这类"作者写错了"**不计熔断**(与未声明权限同规)。
10. **重复的 `(pluginId, id)` 被拒绝**并计 registration 熔断(阈值 1):让第二条
    悄悄顶掉第一条,作者看到的是"我的第一个宏不生效了"。而**未声明
    `input:intercept`** 只报错不计熔断 —— 那是 manifest 笔误,与 N1 的
    `sendMessage`、`theme.updateBackground` 同规。
11. **披露口径挪进 `sessions.ts`**。`input:intercept` 与它的人话文案定义在那里
    (那个文件是零依赖叶子,渲染层按子路径直接引它做装前披露),
    `input-intercept.ts` 原样再导出。渲染层**一行没改**就把新权限念给了用户 ——
    "宿主判了、界面没说"的漂移在结构上不成立。
12. **`InputTransformStamp` 没有从 `packages/shared/ipc/index.ts` 再导出**。
    它今天只在引擎内以结构字面量构造,没有消费方需要这个名字;而那个 barrel
    是一个高危脏文件(工作树里带着未提交的用户改动)。需要时再加一行。

## 8. N3 落地实录(2026-08-10)与**与规格的差异**

### 8.1 先考古:今天同一批工具调用到底怎么排

规格假定"executionMode 是新东西",实测**它已经在,而且是生产路径的判据**。
工具并发审计时代的"生产 runner 严格串行、并发 B 链路空转"早已被 diff 竞态
根治那一轮翻页,今天的事实是:

- **调度器只有一处**:`packages/core/agent-loop/runner.ts:397`
  —— `const barrier = toolsByName.get(event.toolCall.name)?.executionMode !== 'parallel'`,
  交给 `scheduler.enqueue(fn, { barrier })`(`runner.ts:363` 每回合一个
  `ToolExecutionScheduler`)。
- **屏障语义**(`packages/core/agent-loop/tool-execution-scheduler.ts:20-53`):
  非屏障任务挂在当前段里彼此重叠;屏障任务先等上一道屏障、再
  `allSettled` 当前段所有在飞任务、然后独占执行,并成为下一道屏障。
  即"读并行、写串行",粒度是**工具**,不是文件/资源 —— 没有读写锁,
  屏障就是锁。
- **上限**:`createConcurrencyGate(options.maxConcurrentTools ?? 8)`
  (`runner.ts:510-512`),今天全仓无人传该选项,即默认 8 并发。
- **缺省 = 屏障**:未声明的工具走 `!== 'parallel'` 的那一侧。
  `packages/core/agent-loop/tools.ts:87-93` 还把**任何未知值**安全降级成
  屏障。
- **内置工具早已逐个声明**:read / find / grep / glob / notebook / history /
  time / fart / bash-jobs(查询面)= `parallel`;edit / write / variable /
  goal / practice / say / radio / bash-jobs(写面)= `sequential`。
- **一条死线**:`resolveCoreToolExecutionMode`(`packages/core/tools/registry.ts:571`,
  带 `SEQUENTIAL_TOOL_ID_FALLBACKS` 与 mcp 前缀强制串行)只被
  `OnethingToolRegistry.getToolExecutionMode` 调,而后者**零生产消费方**
  (只有测试)。生产路径读的是定义上的 `executionMode` 字段本身,不经过它。
  本期没有动它 —— 删死码是另一次评审。

**唯一真缺口**:插件。`CorePluginToolDefinition` 里根本没有这个字段,
`app/plugins/api.ts` 的 `Tool.define(...)` 也没有这一行,于是**每个插件工具
都恒定落在屏障侧**,作者无从表达"我这个只读工具可以并发"。N3 补的就是这一格。

### 8.2 逐条差异(规格 → 实际,及理由)

1. **声明面加在 `CorePluginToolDefinition`,不是 `packages/core/tools/types.ts`
   的 `ToolDefinition`**。后者是 `executeToolCalls`(严格 for-await 串行)那条
   遗留小路的类型,加上字段不会有任何人读 —— 那是造第二个说法。我们**对应
   pi `ToolDefinition` 的类型是 `AgentTool`**(`agent-loop/types.ts:182`),
   它早就有这个字段。
2. **内置工具一行没动**(规格要求),但要如实记账:它们**不是"未声明"**,
   而是早就逐个声明过了(见 8.1 清单)。"本期不给内置补声明"在这里等于
   "本期不重审内置的声明"。
3. **`'parallel'` 不是空声明**。规格给了"若现状无并行通道则声明如实记录但
   当前无效果"的退路 —— 用不上:并行通道真实存在且是默认路径,插件工具声明
   `'parallel'` 立刻生效。
4. **`'sequential'` 的实现强于 pi 的字面语义**。pi 说的是"不与兄弟并发";
   我们的屏障还额外**挡住它后面的调用**。没有为它新造一个"只是不并发但不
   阻塞后续"的第三种档位:那要求第二套排队原语,而它能救的场景(共享游标)
   本来就要求独占。文档按屏障口径写。
5. **调度器读声明的落点仍然只有一处**(`runner.ts:397`),本期**一行没改**。
   N3 全部的改动都在"让声明流到那一跳",不在那一跳本身 —— 这是"纯声明式
   小期"的字面意思。
6. **校验闸放在 core 的 `api.registerTool`,只此一处**
   (`packages/core/plugins/api-builder.ts`,调
   `assertCorePluginToolExecutionMode`)。不在 `OnethingToolRegistry.registerTool`
   再加一道:那里的值来自我们自己的代码(编译期就是联合类型),再校验一次
   等于同一个判据两份。闸只设在**不可信数据进门的地方**。
7. **非法值拒注册这一个工具,不计熔断**。处置与既有的工具注册失败**同规**:
   `api-builder` 的 `registerTool` 本来就把 `host.registerTool` 包在 try/catch
   里 —— 抛错 = 该 toolId 不进 `toolIds`、不进注册表、日志里一条点名错误、
   插件其余的面照常。这与"未声明权限"、"钩子返回值不合规"是同一档:**作者
   写错了,不是运行时故障**,所以不进熔断计数。
8. **不做未知值静默降级**(与 `agent-loop/tools.ts:87-93` 的宿主侧降级看似
   矛盾,实则分工):宿主侧那次降级面对的是**已经过闸**的自家数据,兜的是
   类型系统之外的意外;插件侧这一次面对的是作者手写的字面量,降级的代价是
   `'paralell'` 永远拿不到任何线索。**入口严、内部宽**。
9. **没有新建样本插件**(规格允许)。覆盖落在
   `packages/core/plugins/__tests__/tool-execution-mode.test.ts`(透传 / 缺省 /
   非法值只拒一个工具)、`packages/core/agent-loop/runner.test.ts` 新增
   "declared sequential 夹在两个 parallel 兄弟中间零重叠"、
   `packages/onething-runtime/src/tools/__tests__/registry.test.ts` 新增
   "声明活到注入模型的那份定义上"(补住 8.1 那条死线造成的假绿风险:
   `getToolExecutionMode` 绿不代表调度器看得见)。
10. **`packages/shared/ipc` 一行没碰**。`ToolExecutionMode` 那边早就有,
    插件侧用的是 core 自己的 `CorePluginToolExecutionMode`(零依赖叶子
    `packages/core/plugins/tool-execution-mode.ts`)—— 插件协议不该反向依赖
    宿主的 IPC 契约,而那个 barrel 是高危脏文件。
