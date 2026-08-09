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
