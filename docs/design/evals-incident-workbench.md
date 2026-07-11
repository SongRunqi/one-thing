# 事故工作台:让评估系统真正可用的重设计

状态:W1-W5 已实施(2026-07-10,见文末实施附录)。
日期:2026-07-10
前置阅读:`docs/design/prompt-evaluation.md`、`docs/design/evals-ui.md`、`docs/design/evals-scene-snapshot.md`(均已实施)
取代关系:本方案**重构**上述三者的人机交互层与数据组织;信号采集、快照捕获、section hash 等底层机制保留复用。

---

## 1. 背景:为什么已建成的系统"完全没有用"

三轮建设后系统有了采集、快照、离线 runner、settings 面板,但实际使用中无法定位问题。
逐条对证过的缺陷(全部在代码中实锤):

| # | 缺陷 | 实锤 |
|---|------|------|
| C1 | records 内容对人无意义 | `TurnEvalRecord` 无 userMessage、无 assistant 输出;一行=日期+emoji 徽标+截断 hex id;`userMessagePreview` 在 IPC 填了但视图未渲染 |
| C2 | fixture promote 无法表达"这是什么问题" | 表单只有机械断言(contains/hasToolCalls/minLength),没有字段承载"出了什么问题、期望什么行为" |
| C3 | run 看不到输入输出过程 | `EvalRunCaseAttempt={index,pass,reason}`,模型收到什么/回了什么/调了什么工具全部丢弃 |
| C4 | settings 看板不适合查看 | 要读的是长提示词/长对话/多次 attempt 过程,给的是小列表+裸 JSON |
| C5 | 重放保真度低 | runner 给模型的工具定义是 `Tool: <name>` 空壳,不是真实 schema;单次调用,无 agent loop |
| C6 | 分析层是占位符 | judge 未接线→所有失败归类 general-poor-response→归因恒为"Core";triage 报表无信息量 |
| C7 | 诊断靠人肉 | 消融/复现/归因的零件都有,但无工作流串联,全靠手动 |

**根源(一句话)**:系统围绕"机器可聚合的元数据"(hash/布尔/id/分数)设计,
而调试提示词需要"人可阅读的对话"与"机器可执行的分析"。两头都没给。

**指导原则**:本产品自身就是提供 AI 能力的系统——分析事故、提炼期望、判定重放、撰写诊断,
没有道理让人手工做。人只做两件事:**点 👎 + 一句话说明问题**;其余全部自动化。

## 2. 目标

- G1:**完整现场还原**——👎 一次,当轮的提示词(分段)、上下文(请求视图)、真实工具定义、
  调用参数、轮内工具执行过程(含真实结果)全部自包含落盘,构成 incident bundle。
- G2:**现场重放(mock 工具)**——以现场的环境与参数重跑完整 agent loop,工具调用不真实执行,
  走"录制回放 → AI 模拟 → 标记桩"三级阶梯;可指定消融段落、可 k 次重复。
- G3:**过程全可见**——每次重放的请求、每轮模型输出、每个 mock 工具结果(带来源标记)、
  判定结论,全部持久化为 transcript,并用**聊天组件**渲染阅读。
- G4:**AI 代替人工分析**——事故摘要/标题/归类/期望 rubric 由 app 自己的模型生成;
  重放判定用 rubric;诊断报告(复现率+消融矩阵+版本回溯+结论)自动产出。
- G5:修复 C1-C7 全部缺陷;records 降级为信号索引,人面向的对象是 incident。

### 非目标

- 不真实执行工具(安全、确定性、速度三重理由;真实执行属未来沙箱课题)。
- 不做多用户/云端;不做全局 judge 校准(rubric 按事故私有,窄判定绕开校准死锁)。
- 不迁移历史 records/快照(旧数据保留可读,新链路只向前)。

## 3. 总体架构

```
👎 + 一句话"哪里不对/该怎么做"(人,5 秒,唯一人工输入)
   │ 同步:完整现场捕获
   ▼
incident bundle(自包含目录)
   │ 异步:AI 事故分析(app 自有 provider,可配便宜模型)
   ▼
incident.md(标题/摘要/归类/期望 rubric/硬断言建议)     ←── C1/C2 修复
   │ 人在 Workbench 一瞥确认(可改可跳过)
   ▼
┌─ Workbench 独立页(聊天组件渲染)──────────────────┐   ←── C4 修复
│ 现场 tab:原始对话 + 分段提示词 + 参数            │
│ 重放 tab:mock agent-loop 重放 → transcript 列表   │   ←── C3/C5 修复
│ 诊断 tab:复现率 + 消融矩阵 + AI 诊断报告          │   ←── C6/C7 修复
│ 动作:一键转回归 case(AI 预填) / 标记已修复        │
└──────────────────────────────────────────────────┘
```

## 4. 关键设计决策

### D1:incident 是第一公民,一个事故一个自包含目录

```
~/.onething/evals/incidents/<yyyy-mm-dd>-<ai-slug>-<shortid>/
├── incident.json          # 机器元数据(ids/版本/信号/状态/rubric/归类)
├── incident.md            # AI 生成的人读封面(可编辑)
├── scene/                 # 完整现场(G1)
│   ├── prompt.json        #   分段提示词(沿用现有格式)
│   ├── context.jsonl      #   请求视图历史(沿用现有格式)
│   ├── tools.json         #   真实工具定义 name/description/parameters(新)
│   ├── params.json        #   model/provider/temperature/maxTokens/toolChoice/thinking(新)
│   └── turn-trace.jsonl   #   轮内实际过程:模型输出、每个工具调用(args)与真实 result(新)
└── runs/<runId>/          # 每次重放(G2/G3)
    ├── run.json           #   配置+汇总:promptVersion/disabled/k/judge 结论
    └── attempt-<n>.jsonl  #   完整 transcript(见 D4)
```

records.jsonl 保留原样继续每轮记信号(趋势/统计用),新增 `incidentRef` 字段;
Records 视图降级为索引:每行渲染 userMessage 摘要 + 结果摘要,负信号行可"升级为事故"。
旧的 fixtures/auto 四件套机制被 incident bundle 取代(负信号自动捕获也改走 bundle,无 md/AI 分析,标记 auto)。

### D2:现场捕获的两个新数据源(均已验证可得)

- **tools.json** ← `prepared.runtime.tools`(真实 AgentTool 的 name/description/parameters,
  修复 C5 的"空壳工具定义")。
- **turn-trace.jsonl** ← 本轮 assistant 消息的 `toolCalls[]`(ChatMessage.ToolCall 自带
  `arguments` 与 `result`)+ 分轮文本。这是 mock 回放的"录制带"。

捕获点不变(post-response hooks + promptCaptureCache LRU),👎 时从 LRU 或已持久化的
assistant 消息组装。

### D3:mock agent-loop 重放器(G2 核心)

新组件 `packages/onething-runtime/src/evals/replay.ts`:一个**独立于生产 ToolRegistry**
的轻量循环(无权限系统、无真实执行):

```
prompt = buildOnethingPrompt(scene 参数, 可选 disabledSections, 当前或指定代码版本)
loop (最多 maxRounds=8):
  out = callModel(prompt + history + 本轮累积, tools=scene/tools.json, params=scene/params.json)
  若无 toolCalls → 结束
  对每个 toolCall 依次走 mock 阶梯:
    ① 录制回放:与 turn-trace 中调用按 (toolName, args 相似度) 匹配 → 返回真实录制 result   [source: recorded]
    ② AI 模拟:无匹配(模型行为已改变)→ 便宜模型依据工具 schema + turn-trace 中相邻结果
       生成合理结果                                                                    [source: simulated]
    ③ 标记桩:模拟失败 → 返回 {"error":"tool result unavailable in replay"}              [source: stub]
  把 toolCalls + mock results 追加进对话,继续循环
产出:transcript(每轮请求增量/输出/工具调用/结果+来源标记) + 最终回答
```

args 相似度:同名工具按关键参数字段字符串相似度取最优,低于阈值视为无匹配。
判定:rubric judge(见 D5)对 transcript 打 pass/fail + 理由;另提供"与原始事故对照"模式
(把 turn-trace 原始行为给 judge 作参照:是否犯同样的错)。

### D4:transcript 格式与"用聊天组件看对话"

attempt-<n>.jsonl:首行 header(runId/promptVersion/disabled/judge),此后每行一个事件:

```jsonl
{"t":"round","n":1}
{"t":"assistant","content":"...","toolCalls":[{"name":"edit","args":{...}}]}
{"t":"tool-result","name":"edit","source":"recorded","result":"..."}
{"t":"assistant","content":"最终回答..."}
{"t":"judge","pass":false,"reason":"仍未先切换目录","rubric":"应先切到 transreader 目录"}
```

渲染:transcript 事件可无损映射为 `ChatMessage[]`,Workbench 用现有消息渲染栈
(MessageItem/MessageBubble/工具调用展示)只读渲染——现场原始对话与重放 transcript
获得与正式聊天一致的阅读体验;mock 结果加 `source` 徽标。修复 C3/C4。

### D5:AI 全面接管分析(G4)

统一走 app 的 provider 体系,新增 `settings.evals.analysisModel`(默认 deepseek 便宜档):

| 分析任务 | 输入 | 输出 | 时机 |
|---|---|---|---|
| 事故摘要 | 用户消息+assistant 输出+turn-trace+👎 一句话 | incident.md(标题 slug/发生了什么/期望/疑点段落) | 👎 后异步 |
| 期望提炼 | 👎 一句话+现场 | 结构化 rubric + 硬断言建议(如 firstToolCall) | 同上 |
| 重放判定 | transcript + rubric | pass/fail + 理由 | 每次 attempt |
| 诊断报告 | 复现率+消融矩阵+版本回溯 | 结论:上下文缺失/不可复现/段 X 实锤/与提示词无关/版本回归 | 点"诊断" |
| 周聚类 | 一段时间的 incidents | triage 账本(真实类别,取代 general-poor-response 占位) | 每周 |

rubric 按事故私有 → judge 只回答"是否符合这句话"的窄问题,不需要全局校准(解开 C6 死锁)。

### D6:诊断自动化(五格结论)

Workbench 诊断 tab 一键执行:
① 复现:原现场重放 k=5 → 失败率;0/5 → **不可复现** 结案。
② 上下文检查(纯本地):👎 一句话与用户消息中的关键实体是否存在于 context/prompt;
   compaction/截断标记 → **上下文缺失** 结案方向。
③ 消融矩阵:逐段 disable × k → 翻转表;某段去掉后转好 → **段 X 实锤**;全不变 → **与提示词无关**。
④ 版本回溯:实锤段的 sectionHash 历史 vs 同类事故首现时间 → **版本回归**。
成本:mock 工具后每次调用只有模型费,一次全量诊断 ≈ 11 段 × 5 次 × ~3 轮 ≈ 150 次
deepseek 调用,约 ¥1-2,可接受;UI 提供"快速模式"(k=3,仅疑点段)。

### D7:case 从 incident 生成,携带完整语义

case.yaml 增加:`incidentRef`(为什么存在,可回溯)、`rubric`(AI 判定标准)、
`scene: <incident 拷贝>`(promote 时把 bundle 拷入 repo `evals/cases/<id>/`,自包含);
旧 expect 硬断言保留为快速档。修复 C2:问题语义在事故发生当下由人一句话+AI 展开写定,
promote 变成一次确认点击。runner 跑 case 改用 D3 重放器,attempt 落 transcript(修复 C3/C5)。

## 5. Phase 总览

| Phase | 内容 | 修复 | 预估 |
|---|---|---|---|
| W1 | 现场捕获升级 + 👎 一句话输入 + incident bundle 生成(模板版 md) | C1,C2(半),C5(数据) | ~1.5 天 |
| W2 | mock 重放引擎 + transcript 持久化 + rubric judge | C3(数据),C5,C6(判定) | ~2 天 |
| W3 | Workbench 独立页:事故列表/现场/重放 tab,聊天组件渲染 | C1,C3,C4 | ~2 天 |
| W4 | AI 分析接管:事故摘要/期望提炼/一键转 case;runner 接重放器 | C2,C6 | ~1 天 |
| W5 | 自动诊断 tab(复现/上下文检查/消融矩阵/版本回溯/报告)+ 周聚类升级 | C7 | ~1.5 天 |

依赖:W2 依赖 W1 的 scene;W3 可与 W2 并行(先渲染现场);W4/W5 依赖 W2。

## 6. Phase 要点与落点

### W1 现场捕获升级

- `CorePromptCapture` 增加 `tools`(来自 prepared.runtime.tools)与 params 字段。
- turn-trace:trigger 从本轮 assistant 消息提取 `toolCalls[]`(args+result+status+时序)
  与分轮文本,写 `scene/turn-trace.jsonl`。
- 👎 交互:MessageActions 弹极简输入框("哪里不对/该怎么做?",可跳过)→ IPC 增加 `note` 字段。
- `packages/onething-runtime/src/evals/incident.ts`:bundle 组装/读取;incident.md 模板版
  (无 AI 时直接填 用户消息/assistant 摘要/note)。
- 负信号自动捕获改产 bundle(标记 `origin: auto`);amend/LRU 机制沿用。

### W2 mock 重放引擎

- `evals/replay.ts`(D3)+ `evals/mock-tools.ts`(三级阶梯+args 匹配)+ transcript 写读
  (`evals/transcript.ts`,复用 jsonl codec)。
- judge rubric 模式接线(`judge.ts` 扩展);"与原始对照"模式。
- IPC:`EVALS_REPLAY_START/CANCEL` + `EVALS_REPLAY_PROGRESS`(round 级事件)。

### W3 Workbench

- 独立路由页(非 settings):`src/renderer/views/EvalsWorkbench.vue` + 入口(侧栏/👎 toast
  "已记录·查看")。
- transcript→ChatMessage[] 适配器 + 只读 MessageList;分段提示词查看器(折叠+归因高亮,
  复用 scene-snapshot 的 READ_SNAPSHOT 通道扩展)。
- 事故列表:AI 标题(W4 前显示 note/用户消息摘要)+状态徽标
  (new/analyzed/reproduced/diagnosed/case-created/fixed)。

### W4 AI 分析

- `evals/analysis.ts`:摘要/期望提炼/诊断报告三个 prompt,走 provider 注入(复用
  evals-provider-adapter,`settings.evals.analysisModel`)。
- 一键转 case:AI 预填 id/description/rubric/硬断言 → 人确认 → bundle 拷入 repo。
- runner 的 runSingleCase 切换到 replay 引擎(带 scene 的 case 走 mock loop,
  旧扁平 case 走单轮兼容路径)。

### W5 自动诊断

- `evals/diagnose.ts`:D6 四步编排 + 报告生成;诊断结论写回 incident.json.status。
- triage 周报改为对 incidents 聚类(真实类别),CATEGORY_TO_SECTION 占位映射废弃。

## 7. 风险与开放问题

- **AI 模拟工具结果的失真**:simulated 结果可能与真实环境不符,导致重放结论偏差。
  缓解:来源徽标醒目;judge 输入中声明哪些结果是模拟的;诊断报告注明模拟比例;
  匹配阈值偏保守(宁可 stub 不可瞎编)。
- **args 匹配阈值**:初版用关键字段精确+其余相似度;失配率高时再引入 AI 匹配。
- **turn-trace 完整性**:continuation/多 assistant 消息的轮次归并需按 messageId 时序拼接;
  W1 需覆盖多轮工具用例的捕获测试。
- **成本控制**:分析与判定全走 `analysisModel`(便宜档);诊断有快速模式;
  重放 maxRounds=8 硬上限防循环。
- **隐私/体积**:bundle 含完整对话,留在用户数据目录;promote 拷入 repo 时提示确认;
  bundle 复用现有截断策略(单段 32KB/context 2MB)。
- **旧机制退役节奏**:fixtures/auto 四件套在 W1 后停止新增,读取兼容保留一个版本周期。

---

## 实施附录(2026-07-10)

### 新增模块

| 层 | 文件 | 职责 |
|---|---|---|
| runtime | `evals/incident.ts` | bundle 组装/读写/turn-trace 提取/模板封面 |
| runtime | `evals/mock-tools.ts` | 三级 mock 阶梯(录制回放 bigram 相似度匹配 → AI 模拟 → 桩),来源标记 |
| runtime | `evals/transcript.ts` | attempt 级 transcript 读写(jsonl,header+事件流) |
| runtime | `evals/replay.ts` | mock agent-loop 重放器(当前 builder 重建提示词+可消融+rubric judge),loadSceneFromDir |
| runtime | `evals/analysis.ts` | AI 事故分析(标题/类别/rubric/摘要)、AI 工具模拟器、上下文完整性检查、诊断结论/报告 |
| runtime | `evals/diagnose.ts` | 五步诊断编排(复现→上下文→消融矩阵→结论→报告),状态回写 |
| main | `ipc/evals-workbench.ts` | incident CRUD/read-file(路径收容)、replay/diagnose 后台执行+进度推送、analyze/promote、单实例锁 |
| renderer | `stores/evalsWorkbench.ts` | 工作台状态+进度订阅 |
| renderer | `components/evals/EvalsWorkbench.vue` | 全屏 overlay:事故列表+现场/重放/诊断三 tab+动作区 |
| renderer | `components/evals/IncidentTranscript.vue` | 对话式 transcript 渲染(StaticMarkdown+工具卡+来源徽标+judge 横幅) |

### 关键接线

- 👎 弹一句话输入(MessageActions popover),`note` 经 IPC 进 bundle;成功后主进程 fire-and-forget AI 分析。
- retry/edit amend 与负信号 turn 结束统一走 `createIncidentForTurn`/trigger 内 bundle 创建,records 带 `incidentRef`(amend 合并)。
- 模型 caller 协议升级:`EvalChatMessage` 支持 assistant `toolCalls`+tool `toolCallId`,CLI 与 provider adapter 均映射 OpenAI wire 格式;温度/maxTokens 来自现场 params。
- 促升 case = bundle 拷贝进 repo `evals/cases/<id>/`(scene+case.yaml 带 incidentRef/rubric);runner 识别 `scene:` 用例走重放引擎,legacy 扁平用例不变。
- 周报(`evals:diagnose`)追加事故聚类段(类别×诊断结论)。

### 与设计的偏差

- 事故目录名为 `<date>-<turnId 前 8 位>`(非 AI slug),AI 标题存于 meta——目录名需在创建时固定而 AI 分析是异步的。
- Workbench 为全屏 overlay(showDiffOverlay 同款模式)而非路由页——App.vue 无路由,overlay 是该应用的既有形态。
- transcript 渲染复用 StaticMarkdown+自建气泡,而非整套 MessageItem(后者深度耦合会话 store)。

### 验证

新增 4 个测试文件(incident 6、replay 6、diagnose 2、快照/重放上下文合计 32 项 evals 断言);
诊断编排端到端:脚本化模型"仅在 known-projects 段存在时犯错"→ 消融矩阵翻转 → `section-implicated: known-projects` 结论+报告落盘+状态回写。
全量 vitest 3037 通过,双端 typecheck 0 错误,样式守卫通过。

### 现场保真度补强(2026-07-10 下午,实测反馈驱动)

实测暴露:capture 在内存 LRU(5 条,重启即空),👎 老消息 → scene 缺 prompt/context/tools/params,
提示词展不开、重放无上下文。三层修复:

| 层 | 机制 | 覆盖 |
|---|---|---|
| LRU 扩容 | 5 → 24 轮 | 近期 👎 快路径 |
| **Route B:capture 磁盘环形缓存** | `evals/capture-store.ts`:每轮落盘(`~/.onething/evals/captures/`,默认 200 条按 mtime 滚动);超 512KB 时**丢 requestMessages 保 prompt/tools/params**(前者 Route A 可重建,后三样 jsonl 永远给不了) | 跨重启 ~200 轮的逐字提示词/工具 schema/参数 |
| **Route A:生产管线重建发送视图** | capture 无 requestMessages 时,读 session jsonl 持久化消息 + compaction 状态(`session.summary/summaryUpToMessageId`),经**生产的** `buildHistoryMessages`(脱水/compaction/图片处理,与真实请求同一条管线)重建 context;手写存储视图合成降为最后兜底 | 任意历史消息的上下文,永不过期 |

capture 解析链:内存 LRU → 磁盘环 → Route A 重建 → 存储视图合成。
另:重放新增"用当时的提示词"开关(scene/prompt.json 原文逐字重放,与消融互斥);
工作台关闭四重保障(overlay no-drag + 顶部让出 titlebar drag 带 + 遮罩点击 + 全局 ESC)——
设置窗口 titlebar 的 `-webkit-app-region: drag` 会吞掉 fixed sibling 顶部的点击。
新增测试:capture-store(4);Route A 用生产 buildHistoryMessages 实测重建含完整工具链的发送视图。
全量 3041 测试通过。

### L1 逐轮追踪(2026-07-10 晚,ground truth 层)

"为什么模型这么做"的最终答案不再靠重建:agent loop 每一轮的 (request, response) 在循环边界逐字落盘。
一轮的决策 = f(model, 该轮 request) —— 单轮重发无需 loop、无需工具执行、无需环境,历史工具结果就是请求里的字节,不可能发散。

| 层 | 文件 | 职责 |
|---|---|---|
| core hook | `packages/core/agent-loop/types.ts` / `runner.ts` / `runtime.ts` | `onTurnTrace` 纯观察事件:**每轮**都触发(区别于只在最终无工具轮触发的 `afterTurn`),在 `messages.push` 之前带上本轮 request 切片 + AgentTurn + 本轮工具结果;异常被吞,观察不影响循环 |
| 落盘 | `packages/onething-runtime/src/evals/trace-store.ts` | `~/.onething/evals/traces/<sessionId>/<turnId>/round-<n>.json`;**前缀增量存储**(第 1 轮全量,后续轮存 appended 尾部,序列化前缀校验,compaction 改写历史时自动回退全量);**同步序列化 + 异步写链**(live 数组随后就会变,但写盘永不阻塞请求路径);环形清理(300 turn 目录 / 512MB,按 mtime);`flush()` 供收尾/测试 |
| 注入 | `agent-loop/stream-runtime.ts` | recorder 以 `ctx.sessionId`/`ctx.assistantMessageId` 为键,每次聊天 turn 自动记录 |
| 事故关联 | `evals/incident.ts` | 建 bundle 时把 trace dir 的 `round-*.json` 拷进 `scene/rounds/`(bundle 内自包含,不怕环形滚动),`meta.scene.rounds` 记数量 |
| 单轮重放 | `evals/round-replay.ts` | `replayRound`:原样(或替换 editedMessages)重发 k 次,返回每次的决策;traced AgentMessage → EvalChatMessage 完整保留工具协议 |
| IPC | `EVALS_ROUND_LIST` / `EVALS_ROUND_REPLAY`(evals-workbench.ts) | list:bundle rounds 优先、live trace 兜底,水化后映射 `EvalsRoundView`;replay:凭据预检 + `createEvalsModelCaller` + `replayRound` |
| UI | `components/evals/RoundTimeline.vue`(现场 tab) | 每轮一行:轮号/消息数/决策一瞥(→ 调用 X 或 → 文本回复);展开 = 逐字请求消息(默认展开最后两条)+ 当时决策 + "原样重发×N";任意 string content 消息可**编辑后重发**(归因验证:改了这句话决策变不变),结果带"决策一致/不同"徽标(按 tool-call 序列比对) |

新增测试 12 项:trace-store 7(增量存储/水化/观察时快照/中途改写回退/断链 best-effort/参数完整/环形清理)、round-replay 5(工具协议/developer→system/图片标记/合成 id/原样与编辑重发)。
全量 3053 测试通过,双端 typecheck 干净(仅存与本工作无关的 core-stream-engine 既有报错)。

已知边界:辅助 LLM 调用(compaction 摘要器等)尚未接 recorder(purpose 标签架构已留);多模态消息在重发时降级为 `[image content]` 文本标记;编辑重发仅支持 string content 消息。
