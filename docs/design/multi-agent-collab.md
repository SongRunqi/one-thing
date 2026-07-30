# 多 Agent 协作系统:群聊 + 看板 + 分工执行

> **2026-07-28:IM v2 全量交付。** 激活模型与房间呈现层已被 `multi-agent-collab-im.md` 整体替换并逐单验收(意愿判定/typing/IM 气泡/引用/表情/团队设置/任务事实链;W1-W9b+W4,4296 测试绿)。本文件保留为执行面(看板/worker/权限/预算)与 P0/P1 机制的真源;激活与 UI 的现状以 IM 文档 §6 为准。
>
> 状态:设计定稿(经三路对抗评审:仓库事实核查 / 架构工程批判 / 产品成本安全批判;v1 的 3 blocker + 9 major 已全部吸收,见各节"评审修订"标注。**核心机制已过行为探针**:投影方案在真实模型上实测 §2.3)。日期:2026-07-27。
>
> **实施状态(2026-07-27,`experiment/castlabs-electron` 未提交)**:**P0 已全量落地并过实现级三路对抗评审**(正确性竞态 / 设计符合性 / 渲染层数据流),评审的 1 blocker + 8 major 已全部修复:入口门 + 内部源(goal/radio)房间拒入、水位改为收割时推进 + 对账带 sourceMessageId 防双驱、驱动时链闸复查(防多 @ 超射)、协调器等待 sender 绑定(修死代码对账)、edit/retry 房间全隐 + 引擎拒绝改发 stream:error(防 composer 卡死)、InputBox 房间发送绕过本地队、web 端 capability 门控(collabRooms)+ server 拒绝 kind、pass 首行门中性持留、失败激活贴系统行、per-agent thinking 盖章。门禁:4030 测试全绿 / typecheck 0 / boundary 无新红。**真机反馈修正(2026-07-27,两轮)**:①用户实测"像在模拟房间"——根因是房间回合套完整产品提示词(assistant 身份/工具指南/soul-memory 段全在,persona 只是 developer 帽子);已改为房间专属 system 经 `collabRoomOverrides`(app/engine/prompt/system-prompt.ts)接管 baseSystemPrompt 并禁用全部产品 developer 段(含 plugins)。②用户进一步要求"**角色的 system prompt 就该是他的 agent 提示词本身,不加任何包装与行为规则,只可附加房间成员等情况说明**"——v3 定稿:system = **persona 原文一字不动** + 括注式情况说明(群名/成员/「名字: 内容」转发格式),规则块、具身宣言、沉默铁律、[pass] 指令全部移除;投影署名从剧本式 `[名字 · 职务]` 改为 IM 转发式 `名字: 内容`。防冒充/防旁白/静默全部改由**结构保证**(他人话语永远从 user 轮进入;未被点名者根本不被激活;pass 检测仍在编排层容错但不再教模型)。注:§2.3 探针的"铁律措辞敏感"结论针对"未点名却被激活"场景,生产结构上不发生;若默认应答人房间出现过度接话,调节杆是情况说明措辞而非规则块(P1 观察项)。**test2 真机事故补充(同日)**:零工具面 + 不告知 → 集体编造事实(伪造 `[调用: list_files]`、"我扫了项目结构");agent 喊人不写 @ → 讨论死链。情况说明补两条**事实**:①"你没有任何工具/读不了文件/只知道对话里出现过的内容"(打掉幻觉干活);②"写 @名字 可让成员看到并回应"(机制说明,让 agent 间讨论成立)。P0 的诚实边界:会说话的团队,不是会干活的团队——干活是 P1(工具面+工作会话)。

**P1 已全量落地(2026-07-27,同分支未提交)**:权限 collab 交互分支(不进 120s 自动拒 + 30min 房间软提醒)、看板真源(`<store>/collab/<roomId>/board.json` + rev 乐观并发 + activity.jsonl + `collab:board-changed` 会话事件广播)、单一 `board` 工具(list/create/assign/move/update/comment/complete/block,safe 类,房间工具面=`['board']` 替换语义——board 是房间成员资格而非个人工具偏好,是对 D5 交集设计的有意偏离;work 会话=agent.tools ∪ board)、worker 全生命周期(assign→spawn kind='work' 会话(血缘/绑人/pin model/任务简报+群聊尾部上下文)→执行→complete 收割→限长摘要以 worker 名义回贴→PM 评审激活→打回≤2 再执行)、并发闸(房 2/全局 4 + FIFO)、总闸(冻结=abort 全部 work 流+清队+系统行;解冻自动恢复 todo 任务)、看板面板(RightWorkbenchPanel 'board' 五点位,collabRooms 门控,任务卡开工作现场,等待授权 ⚠ 角标)、启动对账(doing→blocked+系统行,assign 即解锁续做)。**实现级评审(2 路)1 blocker+5 major 已全修**:work 白名单并集 board(否则配白名单的 agent 无法 complete,交付闭环断裂)、超时 abort 幽灵流(护单任务单活跃会话不变量)、总闸停 worker、blocked+assign 解锁(pumpQueues 不再静默丢弃)、doing 卡挪走先 abort(task-halted 事件)、审批 30min 软提醒+角标;minor:complete 仅限 assignee 且仅 doing/todo、链闸解冻补 kick。门禁:4042 测试全绿/typecheck 0/boundary 无新红。**真机验收待跑**(P1 验收清单见 §9)。

**CLI/headless 支持 + 端到端自测(2026-07-27 深夜)**:HeadlessBackend 开 collab(board 进 headless 注册表;work 会话继承房间 permissionMode——无人值守自测的钥匙);新增 `onething collab new/list/send/board/log` 五个 CLI 命令(daemon RPC collab.*);**修复 castlabs 打包回归**(cli 动态加载 collab 时被 Rollup 迫使从 electron 主入口取共享导出→Node 下崩;collab 改 backend 静态 import 后拆进共享 chunk;electron-builder 需 npmRebuild:false + electronDist 本地 dist,`41.1.1+wvcus` 版本号 node-abi/官方源都不认)。**费用闸落地**(第三道闸:房间日预算默认 $5,按房间+work 会话集合从 usage 账本读当日 costUSD,60s 缓存,超限一切激活与新 worker 等待);**审批档位收窄落地**(collab 会话权限卡仅 once/拒)。**首次全自动端到端自测通过**(CLI 驱动隔离 store+真实 deepseek):用户目标→阿明真调 board 建卡指派→小李 work 会话真实产出 hello.js(运行验证 ✓)→署名交付回贴→task-event 评审激活→阿明口头通过;抓出并修复「看板摘要短 id 模型回传导致 move/assign Unknown task」(现支持唯一前缀匹配)。

**P0 已知缺口(待 P0.5/P1)**:~~composer @ 成员触发未做~~(已补:房间内裸 @ 弹成员补全,选中插入精确 `@名字 `,文件走显式 `@files`;editor triggers 'member' 类型 + FilePicker 复用);房间 ingress 跳过 resolveUserReferences/媒体入库/turn contextUpdate(附件仍随消息持久化);协调器无单测(纯逻辑 18 用例全绿);真机验收清单未跑。**P1 硬前置**:board 工具落地前必须先做 permission-policy 的 collab 交互分支——房间驱动是系统内部源,一旦房间有工具,权限询问会走 timeoutAskBridge 的 120s 自动拒(评审实证)。
> 涉及:packages/shared、packages/onething-runtime(产品层 + app 装配层)、packages/renderer、apps/electron。**packages/core 零改动**——署名盖章、房间入口门、触发器/记忆门控全部收在 app 层既有收口点(§3 逐一指明);唯一放弃的硬保证是"房间禁自动 compact"(机制在 core send 路径内,P0 接受其低概率触发,列 §10 风险)。

## 0. 一句话

在 onething 现有"一会话一 Agent"的地基上,长出一个**房间(Room)= 特殊会话**的协调层:用户与 N 个虚拟角色(PM、工程师、研究员…)在一个群聊里对话;PM 把目标拆成**看板任务**;任务指派后由**独立工作会话**并发执行(引擎已天然支持 N 会话并行);结果以署名消息回贴群里、走 PM 评审。三个面各司其职:**群聊是人可读的协调面,看板是任务真源,工作会话是执行现场**。

## 1. 目标与非目标

**目标**

1. **多角色群聊**:用户创建多个 Agent(有名字、头像、职务、人格提示词、专属模型与工具面),拉进一个房间;@ 谁谁应答,消息带署名与头像;连续 agent 对话有硬性链长上限,人始终在环。
2. **看板分派**:房间配一块看板(backlog/todo/doing/review/done/blocked),PM(或用户)把目标拆成任务卡、指派给成员;看板是结构化真源,agent 通过工具读写,UI 实时同步。
3. **分工执行**:被指派的 agent 在自己的工作会话里跑完整工具循环(bash/read/write/搜索…按其白名单),多任务并发;权限审批流到用户 UI 并**耐心等待**(不 120 秒自动拒,见 D8);完成后署名报告贴回群里,任务进评审。
4. **可审计、可预算**:一切 agent 间通信只走群聊与看板(无隐藏信道);每次发言有显式激活理由且 UI 可见;房间有链长/并发/费用三道闸 + 逐激活上限;成本按会话归因可查。

**非目标(明确不做,堵住预期)**

- 不做通用多 agent 编排框架(AutoGen/CrewAI 那类 SDK)——编排规则写死在产品里,不暴露编排 DSL。
- 不做 agent 间私聊或隐藏通信——一切过房间与看板,对用户全量可见。
- 不做无人值守自由对话——每次发言必须有激活理由(§6),链长闸到顶即停(含任务事件激活),等待人类。
- P0-P2 不做 web/server 宿主 parity——桌面先行;新 IPC 方法进 `WEB_DESKTOP_ONLY_PLATFORM_METHODS`(`packages/renderer/platform/web.ts:433-476` 先例),UI 用 capability flag 门控。
- 不迁移 radio-dj / scheduler 既有后台会话到新的 kind 机制(可后置统一,见 D7)。
- 不做多人类成员房间——gateway 群聊现状是刻意把人拆进私有会话(`packages/gateway/src/core/bridge.ts:381-388`),反向合并是另一个项目。
- 不做跨房间 agent 运行态共享——同一 Agent 定义可进多个房间,运行态互不相干。
- P0 房间内禁用 agent 消息的 edit/retry/branch(persona 重放语义未定,§10)。

## 2. 现状事实(设计依据,已逐条核查;评审复核 20+ 条引文基本全中,两处更正已吸收)

### 2.1 已有地基(直接复用)

- **Agent 实体端到端存在**:`OnethingAgentDefinition {id, name, systemPrompt, tools?(工具白名单), isDefault}` 持久化 `<store>/agents.json`(`packages/onething-runtime/src/agents/store.ts`),CRUD 走 AGENTS_* IPC + `/api/agents`;会话绑定 `ChatSession.agentId`(`packages/shared/ipc/chat.ts:227`);人格作为**第一个 developer 段**注入系统提示词(`packages/onething-runtime/src/prompts/builder.ts`,`host.getAgent`);工具白名单在循环层真实生效(`app/engine/stream/agent-loop-runtime.ts:154` getAgentToolAllowlist → planAgentLoopTools);技能按 agent 过滤(`skills/session-skills.ts:117`)。管理 UI `AgentsPanelContent.vue` + 会话头切换器 `AgentSelector.vue`。
- **引擎天然支持 N 会话并发**:全部活跃流状态按 sessionId 键——`activeStreams = new Map<sessionId, AbortController>`(`packages/core/engine/headless-stream-engine.ts:46`),每次 run 独立实例化 ToolExecutionScheduler(`packages/core/agent-loop/runner.ts:270`);并发 worker 就是并发会话。同一会话二次驱动会顶替中止前一条流("Superseded by a new stream",headless-stream-engine.ts:143-151)。
- **"agent 在独立会话跑任务并收割结果"的完整先例**:`runOnethingSchedulerAgentTask`(`packages/onething-runtime/src/scheduler/agent-task-runner.ts`)——建隐藏(archived)会话 + `updateSessionAgent` 绑人格 + EventBus 发 `command:send-message`(channel 'scheduler')+ `eventBus.onAny(sessionId)` 观察到 stream:complete/error/aborted + 收割最终 assistant 消息 + 权限自动拒。radio DJ(`app/music/radio.ts:91,277`)补充:工厂建常驻人格 + `markSessionUnattended` + `getController` 防双驱 + **逐条命令 model override** + `suppressTitleGeneration`。
- **协调者可观察一切、注入任何会话**:`EventBus.onAnySession(type)/onAnySessionAny`(`packages/core/events/event-bus.ts`);桌面 IPCBridge 已把**所有会话**的事件转发渲染进程(`apps/electron/src/main/bridges/ipc-bridge.ts`,onAnySessionAny),renderer ipc-hub 全局路由;后台会话的 `permission:request` 今天就能送达桌面。`SendMessageCommandLike` 支持逐命令 providerId/model/thinking/suppressTitleGeneration(`packages/core/engine/core-stream-engine.ts:199`)。`emitGoalDrive`(`app/goals/kick.ts`)是系统注入的规范样板。
- **app 层 StreamEngine 子类已 override handleSendMessage**(`packages/onething-runtime/src/app/engine/stream-engine.ts:56`,做 channel-identity 路由)——房间入口门的现成挂点(D2)。
- **驱动消息折叠先例**:`collapseSupersededGoalDrives`(`app/engine/stream/message-helpers.ts:109-121`)存在的原因正是"合成驱动消息逐字重放会让模型以为用户在复读"——房间投影对驱动消息的处理直接复用此思路。
- **回合后钩子**:CoreTriggerManager.runPostResponse 仅成功路径(`packages/core/engine/triggers.ts:161-179`);goal-continuation 证明 trigger 可回驱引擎。
- **成本归因**:每条 LLM 调用落月度 JSONL 账本且带 sessionId + costUSD(`packages/onething-runtime/src/usage/types.ts`),`getOnethingSessionUsageTotal`(`usage/summary.ts:266`)可得单会话成本。**注意**:主聊天回合的记账 source 硬编码 'chat'(`app/engine/stream/agent-loop-executor.ts:400-409`)——按 source 归因协作成本today 不可用,预算按 sessionId 集合归因(§6,评审修订)。
- **每 agent 记忆工作区已存在**:session.agentId → `agentsDir/<agentId>/`(`app/memory/workspace.ts` resolveSessionAgentId),与 memoryProfileId 正交且注释明令不得混淆(workspace.ts:67-73)。
- **消息级发言人类型已定义未渲染**:`MessageOrigin.actor {displayName, avatarUrl}`(`packages/shared/ipc/channel-identity.ts:42`)持久化在 ChatMessage.origin,UI 无组件读取。
- **会话血缘**:`parentSessionId / branchFromMessageId`(chat.ts:228-229)。
- **面板注册五点位**:`RightWorkbenchPanel.vue`(union ~l.223 / tabOptions ~l.253 / TabPane 分支 ~l.98-173 / icon+slot ~l.397,405 / capability 过滤 ~l.276);terminals store 的"主进程注册表 + 渲染层领养"多实例模式。
- **IPC 五触点配方**经 browser 域验证:channels.ts → shared/ipc/<domain>.ts → apps/electron/src/main/ipc/<domain>.ts(+ apps/electron/src/ipc/ 可移植工厂树)→ preload/bridge.ts → platform/web.ts。
- **外部代理接缝**:ExternalAgentConnector + ClaudeCodeConnector('claude-code-agent'),externallyExecuted 契约,supportsTools:false(外部 agent 无 onething 内建工具)。

### 2.2 关键缺口(本方案要新建的全部)

- **ChatMessage 无 assistant 侧归属**(role 仅 user/assistant/error/system,`chat.ts:117`)——N 个 persona 同 transcript 不可表示。
- **无房间实体、无"只落消息不驱动"的路径**:引擎对**每条** command:send-message 无条件持久化用户消息、建 assistant 占位、起流(`core-stream-engine.ts:488-590`;订阅在 `headless-stream-engine.ts:197` 无任何 kind 门)——这是 v1 评审最大 blocker 的根源,D2 正面解决。
- **无任务/看板模型**(todo-plan=markdown;goals=单目标状态机)。
- **无 agent 间路由、无 spawn/delegate 工具**。
- **无 per-agent 模型绑定**(getEffectiveProviderConfig 不查 agentId;radio DJ 用逐命令 override 绕过)。
- **Agent 定义无 avatar/职务;tools 字段 IPC/UI 断链**(AgentCreate/UpdateRequest 不带 tools,ipc-operations 丢弃)。
- **隐藏会话是 hack**(isArchived + `renderer stores/sessions.ts:86` 硬编码过滤)。
- **无并发上限/预算/队列**(activeStreams 无界)。
- **后台权限现状与"等用户批"冲突**:系统内部源(SYSTEM_INTERNAL_MESSAGE_SOURCES)驱动的回合,权限询问走 `timeoutAskBridge`,**120 秒自动拒**(`app/tools/core/permission-policy.ts:63-108`,UNATTENDED_ASK_TIMEOUT_MS=120_000);`permission:timeout` 事件在桌面无生产者(仅 gateway 通道机制)。D8 必须为 collab 开新分支(评审 blocker,已修订)。
- **assistant 消息有四个创建位**:handleSendMessage(core-stream-engine.ts:560)、handleEditAndResend(:698)、handleRetryMessage(:777)、回合中续写 createNextAssistantWriter(`app/engine/stream/agent-loop-executor.ts:141-172`)——署名盖章必须选覆盖全部四处的收口点(D3,评审修订)。
- **goal-continuation 触发器无 kind 门控**(`app/engine/triggers/goal-continuation.ts:36-45`,对任何有可续目标的会话回驱)——房间/工作会话必须门控,否则绕开协调器(评审 major,已修订)。
- **soul-memory 在回合后钩子里实时解析 session.agentId**(`app/plugins/builtin/soul-memory.ts:1153` → resolveSessionAgentId)+ review 延迟 5 分钟——协调器翻转 agentId 会把 X 的回合记进 Y 的记忆;房间转录也会污染单 agent 的全局私有记忆(评审 major,已修订:P0 对 collab 会话关记忆钩子)。
- **workdir 授权无 agent/任务维度**(`packages/core/permission/permission-grants.ts:110-120`,workspace scope 只按 {type, pattern, workspaceRoot} 匹配)——一次批准跨 agent/任务/未来会话全免(评审 major,D8 收窄应对)。
- **人类插话经 steering 走 persistInjectedChatMessage**(`agent-loop-runtime.ts:171-173`),不发 message:user-created——链长闸的"人类信号"必须同时听 steering:consumed(评审修订)。
- **CreateSessionRequest 仅 {name}**(chat.ts:358-360)——建房间要扩 IPC 五触点 + session-repository meta 变更器(评审修订,进 P0 清单)。
- **AgentSelector 的流中禁切是纯渲染层护栏**(主进程 updateOnethingSessionAgent 无活流检查)——房间必须隐藏该控件 + 主进程侧拒绝(评审修订)。
- **事件环形缓冲是内存态**(1000 条/会话)——协调器状态必须自持久化并含转录水位(§6.3)。

### 2.3 模型行为实测(投影探针,2026-07-27,deepseek-v4-pro)

设计最大的非代码假设——"投影之下人格不串线"——已用探针脚本按 D3 投影格式原样实测(3 人格房间、含压平的 board 调用行,直接调 provider API,两轮共 11 次激活):

| 场景 | 结果 |
| --- | --- |
| 点名应答(@小李 技术问题) | ✅ 完全在人格内,不替人发言 |
| 人格区分(@小研 评价阿明的拆解) | ✅ 研究员视角,拆解归属正确 |
| 接力决策(小李 @阿明 要拍板) | ✅ PM 人格逐条回应风险,自然使用 board 调用格式 |
| 自我归因(问小李"你刚才说的风险") | ✅ 准确认领自己的发言,不混入他人内容 |
| 抗指使(用户要小李"替小研汇报") | ✅ 明确拒绝:"这个我替不了,小研的调研数据我不掌握" |
| pass 纪律(激活未被点名者) | ⚠️ **软措辞规则失败**(插话 + 编造不存在的成员);改用"沉默铁律"措辞后 **4/4 通过**(含职责外场景),且默认应答人该接话时不过度沉默 |

结论:投影方案成立;pass 哨兵可用但**对提示词措辞敏感**(必须是铁律式:「最新消息 @ 了别人而没有 @ 你 → 必须只输出 [pass]」+ 反例),且**主防线永远是编排层不激活未被点名者**——被激活却无话可说的 agent 有幻觉插话风险(软措辞轮实测编造了成员"@codingcat"),这正是 D4 激活式编排的实证依据。探针脚本:会话 scratchpad `room-projection-probe.mjs` / `room-probe-pass2.mjs`(P0 实施时移植进 evals)。

### 2.4 必守约束(违反即翻车,均有实证)

- **新系统 source 必须登记 `SYSTEM_INTERNAL_MESSAGE_SOURCES`**(`app/channel/origin.ts:79`):否则命令被 channel-identity 路由重映射、改写 session.memoryProfileId、记忆归因损坏(origin.ts:90-101)。登记后的权限后果见 §2.2 → D8 分支解决。
- **权限 channel affinity**:respond 的 channel ≠ ask 的 targetChannel 会被静默丢弃(`core/permission/index.ts:263-269`);targetChannel 来自最后一条驱动命令的 channel(core-stream-engine.ts:493);跨端应答采纳 `pending.info.targetChannel`(`apps/server/src/runtime.ts:2725` 先例)。
- **权限队列按会话,头部独占**:每会话只出队 promptOrder[0],对未发出的排队询问按 toolCallId 应答会被当盲批忽略(core/permission/index.ts:253);**跨会话则并行**——M 个 worker 可同时各挂一张可应答卡(§8 审批聚合应对)。
- **系统驱动必须 `suppressTitleGeneration:true`**。
- **无人观察的会话必须 markSessionUnattended**(仅工作会话在"用户明确关闭审批"的模式下用;默认交互模式不用,见 D8)。
- **createSession 会挪动全局 current-session 指针**,必须复原(agent-task-runner.ts:159-165 先例)。
- **桌面后台驱动要求 sender 已 bind**(agent-task-runner.ts:144)。
- **persona 段是提示词缓存前缀第一段**(builder.ts:110);易变内容(看板摘要/房间状态/活任务行)走尾部注入链(builder.ts:135-137、contextUpdate 先例)。
- **agentId undefined 与 'default' 拼写歧义**(白名单不归一/技能归一)——新代码统一归一。
- **渲染层折叠现状(评审更正)**:今天**只有 'goal' 被折叠,且 keyed on `message.origin?.source === 'goal'`**(`MessageItem.vue:311-313`);不存在 'radio' 分支(radio 会话被整体隐藏);另有独立的 `message.source === 'goal-set'` 检查(:317)。协作驱动消息照 emitGoalDrive 先例**同时盖 cmd.source 与 origin.source = 'collab'**,新折叠分支 keyed on origin.source(P0 清单)。
- **层边界**:触 @shared/ipc 的协作代码只在 `src/app`;electron 面走 configure*Host 端口;初始化进 createOnethingBackend 配方或 hooks,模块导入零副作用。
- **新 runtime 子路径登记 `onething.aliases.ts`**(漏登只在 build/运行期爆)。
- **session meta.json 整文件重写**——不放无界数组;不加数据库;跨会话索引归 apps/server。
- **deleteAgent 被任何会话引用即拒**(ipc-operations.ts:150)——工作会话钉死 agent,清理策略见 §10。
- **agents.json 每次调用整文件读写、无锁**(store.ts:127)——协调器串行化写入。
- **MessageList.vue 有两个已知未修分页 bug**——高流量房间继承,列风险。

## 3. 总体决策

### D1 Agent 实体 = 扩展现有 OnethingAgentDefinition,不另起炉灶

新增**可选**字段:`title`(职务)、`avatar`(emoji)、`color`、`description`(一句话职责,供花名册)、`model?: { providerId?; modelId?; thinking? }`。修通三处断链:请求类型带 tools+新字段、ipc-operations 透传、AgentsPanelContent 编辑面。

**per-agent 模型不动 getEffectiveProviderConfig 单一解析规则**(双侧解析链镜像同步的既有教训)。照 radio DJ 先例,协调器在每条驱动命令上盖 `providerId/model/thinking`;工作会话创建时同步 pin session model,保证会话头显示一致。

### D2 房间 = `session.kind='room'` + **房间入口门**(评审 blocker 修订)

房间是一个 session,整个聊天栈(JSONL 持久化、流式合帧、ChatWindow、openSession、附件)免费获得;独立实体案与镜像案的否决理由同 v1(重复建设 / 真源发散)。

**入口门(v1 缺失的关键机制)**:引擎对每条 command:send-message 无条件起流(§2.2),用户在房间发言会立刻以"上一个发言者"的错误 persona 出流,并与协调器互相 supersede-abort。解决:**app 层 StreamEngine 子类的 handleSendMessage override(现成挂点,今天已做 channel 路由)加 kind 门**——

- `session.kind === 'room'` 且命令**非协调器内部驱动**(判据:cmd.source !== 'collab'):**不落引擎流**——经 store 持久化用户消息 + 发 message:user-created 事件 + 移交协调器判定激活。renderer 发送路径零改动(照旧 emit command:send-message)。
- 协调器自己的驱动(cmd.source === 'collab')走原路进 core 起流。
- 房间上的 edit-and-resend / retry-message 命令同门拦截,P0 直接拒绝并 toast(§1 非目标)。
- core 零改动;工作会话(kind='work')不拦——它就是普通的单 agent 会话。

引擎"一会话一流"的约束由此完全成立:房间会话的流**只可能**由协调器串行发起;用户消息永不直接起流,只产生激活判定。

### D3 消息归属 = app 层收口盖章 + 四类投影(评审修订:盖章点、工具消息、驱动消息)

- **Schema**:`ChatMessage.agentId?: string` 可选新增。**盖章点不在 core**:assistant 消息有四个创建位(§2.2),全部最终经 app 层 store 落盘——在 `app/stores/sessions.ts` 的 addMessage 收口处,对 `session.kind ∈ {room, work}` 且 role='assistant' 的消息盖当时 session.agentId。单点覆盖四处,流式期间 UI 即可署名(占位消息创建即落库广播)。
- **历史投影(激活 agent X 在房间发言时的请求重建,挂在 app/engine/stream 既有能力感知重建收口,kind 门控)**,消息分四类:
  1. **X 自己的 assistant 消息**(含 toolCalls 与配对 tool 结果):保持结构化原样;
  2. **其他 agent 的 assistant 消息**:压平为署名 user 侧文本 `[小李 · 工程师] …`;其中的工具调用内联为文本 `〔调用 board(create …) → ok〕`,**配对的 role:'tool' 消息一并丢弃**(否则孤儿 tool_result 直接 provider 400——buildHistoryMessages 会把带 toolCalls 的消息展开成 assistant+tool 对,`message-helpers.ts:45-57`);
  3. **用户真实消息**:署名 user 侧 `[用户] …`;
  4. **协调器驱动消息**(origin.source='collab' 的合成 user 消息):**折叠为一行激活标记或整体剔除**(collapseSupersededGoalDrives 同思路——逐字重放会让模型以为用户复读);
  最后**合并相邻的 user 侧块**(严格角色交替的 provider 防护)。
- **提示词结构**:花名册(名字/职务/职责,稳定)进稳定段;看板摘要、**成员活任务状态行**(status + activity.jsonl 最近一条,防"@ 一个正在干活的 agent 时房间人格编造进展")走尾部注入;花名册协议写明"进展类问题以看板为准"。

### D4 发言编排 = RoomCoordinator 激活式,永不自由放养

`packages/onething-runtime/src/app/collab/`。每次 agent 发言 = 一次显式激活,理由封闭枚举:`mention`(用户或 agent 的 @)/ `default-responder`(无 @ 时的默认应答人,通常 PM,可设无)/ `task-event`(指派→认领;进 review→评审)/ `schedule`(P2 站会)。激活理由随驱动消息折叠行展示,编排永远可解释。协调器状态持久化规格见 §6.3(评审修订:必须含转录水位与逐激活阶段记录)。

### D5 任务执行 = 独立工作会话;房间只允许 board 工具(评审修订:措辞与机制)

**工作执行的工具循环绝不进房间**——执行细节淹没协调面、单流约束串行化一切。**例外且仅此一个:board 工具可以在房间回合调用**(毫秒级、无外部副作用、其调用记录经投影规则 2 可安全压平)——§5 主流程里 PM 在房间拆卡就是这条路径。机制保障而非仅约定:**工具白名单适配器按 session.kind 收窄**(`app/engine/stream/agent-loop-runtime.ts` getAgentToolAllowlist 处):kind='room' 的回合,有效工具面 = `agent.tools ∩ {board}`;未配 tools 的 agent 今天拿全量注册表(adapter 返回 null),收窄同时堵住"工程师在房间跑 bash"。

工作会话:`kind='work'`、`parentSessionId=房间`、绑 assignee、pin model、种子提示词 = 任务简报(任务卡全文 + 房间上下文摘录 + 汇报协议),驱动按 goal kick 范式。**权限交互式等待**(D8)。终局:worker 调 `board action:'complete'` 附**必填限长摘要(≤2000 字符)** → 协调器收割 → 房间贴署名消息 = **摘要 + 工作会话链接**(全文留执行现场,防房间被多 KB 报告灌爆 + 防投影逐轮复读长文)→ 任务进 review → 评审激活(受链长闸与打回计数约束,§6)。回合结束无 complete → 最终消息作为进展/提问贴回(同样限长截断 + 链接),任务停 doing 或 worker 主动 `action:'block'`。点任务卡打开工作会话 tab 旁观全程。

### D6 看板 = 房间级 JSON 真源 + 单一 `board` 工具 + 版本前置条件(评审修订)

存储:`<store>/collab/<roomSessionId>/board.json` + `activity.jsonl`(append-only 流水)+ `state.json`(协调器)。变更只走 app 层 BoardStore API(工具与 UI 同一入口),广播走 EventBus + `configureCollabHost` 端口(configureTodoPlanHost 模式)。工具面收敛为一个 `board` 工具(action: `create|update|move|assign|comment|complete|block|list`)。

**并发防线(v1 缺失)**:
- `CollabTask.rev` 单调递增;所有改状态的 action 带 `expectedRev`,不匹配即拒绝并返回最新快照(agent 重读再动)——防"PM 基于陈旧快照推理时用户拖了卡,PM 的 move 静默回滚用户操作"。**W12(2026-07-28)补齐**:`complete`/`block` 此前无此字段(绕过前置校验),现与 assign/move/update 同走 reducer 的同一道 rev 校验;字段可选,不带 rev 照旧通过(向后兼容协调器内部调用与老模型)。
- 不变量:**每任务至多一个活跃工作会话**;doing 卡被挪离 doing(用户或 PM)→ 协调器**先 abort 其活跃流**再落状态;assign 事件幂等(重复 assign 不重复起 worker)。

### D7 会话可见性 = 正式 `kind` 字段

`SessionMeta.kind?: 'chat' | 'room' | 'work'`(缺省 'chat')。sidebar 主列表只显示 'chat';房间进"群聊"分区;工作会话仅从任务卡进入。替代 isArchived+硬编码 hack(radio/scheduler 迁移后置)。**房间/工作会话隐藏 AgentSelector,且主进程侧 UPDATE_SESSION_AGENT 对 kind='room' 拒绝**(渲染层 disabled 不是引擎不变量,评审修订;协调器直写 store 不走该 IPC)。

### D8 权限 = collab 专属交互分支(评审 blocker 修订)+ 授权面收窄

**v1 的自相矛盾**:'collab' 登记进 SYSTEM_INTERNAL_MESSAGE_SOURCES(必须,否则路由劫持)会让权限询问按现状走 `timeoutAskBridge` 的 **120 秒自动拒**(permission-policy.ts:63-108)——"审批等用户"就死了。而 §7 v1 引用的 permission:timeout 桌面无生产者。修订:

- **permission-policy 增加 collab 分支**:`session.kind ∈ {room, work}` 的询问走**交互桥**——不挂 120s 自动拒,耐心等待;30 分钟无人应答 → 房间贴系统行软提醒 + 看板卡"等待授权"态,继续等;总闸与 abort 永远可停。用户可在房间设置里显式改为"无人值守拒绝"模式(那才用 markSessionUnattended 语义)。
- **授权面收窄(防 workdir 泄漏)**:workspace 级 grant 只按 {type, pattern, workspaceRoot} 匹配、无 agent/任务维度(permission-grants.ts:110-120)——一次 workdir 批准会让**所有 agent 的所有未来任务**在该目录免检,也击穿注入防线的"人肉后门"。P0/P1 的 collab 审批卡**只提供 once / 拒绝**两档(不出 workdir/session 按钮);房间/任务维度的 grant 是 P2 的设计前提,做好才放开。
- 通道:驱动带会话真实 channel(goal kick 推导);应答采纳 targetChannel;重启丢 pending ask 是已知现状(内存 Map,跨重启存活明确未建)——恢复语义见 §6.3。

### D9 角色 = 软角色(提示词模板),仅 PM 有结构性地位

PM/工程师/研究员/评审员作为出厂 Agent 模板进既有模板库;角色语义全在 systemPrompt(PM 教拆解与 board 协议;worker 教简报/汇报协议;全员带**沉默铁律**——措辞按 §2.3 实测版,软措辞已被证伪)。结构上只有房间的 `pmAgentId`(默认应答人 + review 激活对象)。不引入角色类型系统。

## 4. 数据模型

```ts
// packages/onething-runtime/src/agents/store.ts — 全部可选、向后兼容
interface OnethingAgentDefinition {
  id: string; name: string; systemPrompt: string;
  tools?: string[]; isDefault?: boolean;
  createdAt: number; updatedAt: number;
  // 新增:
  title?: string; avatar?: string; color?: string; description?: string;
  model?: { providerId?: string; modelId?: string; thinking?: string };
}

// packages/shared/ipc/chat.ts — 可选新增
interface SessionMeta /* & ChatSession */ {
  kind?: 'chat' | 'room' | 'work';
  room?: {
    memberAgentIds: string[];
    pmAgentId?: string;
    budgets?: { maxChain?: number; maxConcurrentWork?: number; dailyCostUSD?: number };
    frozen?: boolean;              // 总闸
  };
  collab?: { roomSessionId: string; taskId: string };  // kind='work'
}
interface ChatMessage {
  agentId?: string;                // assistant 署名(app 层 addMessage 收口盖章)
  // pass 回合复用 metadata 打标,不新增字段
}
// CreateSessionRequest 扩展:{ name, kind?, room? }(或独立 ROOM_CREATE channel,实现取舍)

// packages/shared/ipc/collab.ts — 新
interface CollabTask {
  id: string; roomSessionId: string; rev: number;         // rev: 乐观并发
  title: string; description?: string;
  status: 'backlog' | 'todo' | 'doing' | 'review' | 'done' | 'blocked';
  assigneeAgentId?: string;
  createdBy: { type: 'user' | 'agent'; agentId?: string };
  priority?: 'low' | 'normal' | 'high';
  deps?: string[];                                        // P2
  workSessionIds: string[];                               // 不变量:至多一个"活跃"
  rejections?: number;                                    // 打回计数(§6.2)
  report?: { summary: string; messageId?: string };
  createdAt: number; updatedAt: number;
}

// <store>/collab/<roomSessionId>/state.json — 协调器自持久化(§6.3)
interface CollabRoomState {
  lastProcessedMessageId?: string;    // 转录水位(重启对账锚点)
  chainCount: number;
  budgetSpentTodayUSD: number; budgetDay: string;
  frozen: boolean;
  activations: Array<{
    id: string; reason: 'mention' | 'default-responder' | 'task-event' | 'schedule';
    agentId: string; taskId?: string;
    stage: 'queued' | 'driving' | 'streaming' | 'harvested' | 'failed';
    driveMessageId?: string;          // 幂等去重锚点
  }>;
}
```

## 5. 关键流程

**主流程:目标 → 拆解 → 执行 → 评审**

```
用户(房间): "@阿明 我要做官网改版,本周上线"
 → 入口门:消息只落库,不起流;协调器判定 mention 激活阿明
 → 阿明发言(房间回合,工具面=board):方案 + board(create ×4) + board(assign ×3)
 → assign 事件 → 起 2 个工作会话(并发闸 M=2,第 3 个排队,看板可见排队态)
 → 小李在 work 会话跑完整工具循环;权限 ask 流到 UI,交互等待(30min 软提醒,不自动拒)
 → 小李 board(complete, summary≤2000字) → 协调器收割
 → 房间贴 [小李] 摘要 + 会话链接;任务 → review;task-event 激活阿明(受链长闸)
 → 阿明评审:通过 board(move done) / 打回 board(comment + move todo)(打回计数 ≤2)
 → 全部 done → 阿明收尾汇总
用户全程可插话(房间消息 = 纯落库 + 激活判定;对活跃流 steering 照旧)
```

**闲聊流(P0 即有)**:`@小研 竞品你怎么看` → 入口门落库 → 激活小研 → 投影 + 人格 → 署名回复 → 回复里 @ 别人则链计数 -1 续,链尽即停。

**权限流**:worker ask → permission:request 经 IPCBridge 到 UI(现成)→ 房间审批队列面板(按 agent/任务分组,跨会话多卡并存是常态)→ respond 以 **worker 的 sessionId** 发 command:permission-respond 并采纳 ask 的 targetChannel(新渲染层管道)→ worker 继续。

## 6. 编排细则与收敛控制

### 6.1 激活管线(协调器单队列串行,房间会话的流只由它发起)

```
消息落库(入口门)/ 看板事件
 → 解析激活理由(mention > task-event > default-responder;schedule 独立)
 → 三道闸(§6.2)
 → 记 activation(stage=queued → driving)→ updateSessionAgent(store 直写)
 → 驱动命令(source:'collab'、origin.source:'collab'、盖 model override、
    suppressTitleGeneration、goal-kick 式 channel;房间回合另带 kind 收窄的工具面)
 → 流结束 → stage=harvested;pass 判定(§6.4);解析 @ 与看板动作,进下一轮判定
```

### 6.2 三道闸 + 逐激活上限(评审修订:计数规则精确化、预算单位、上限缺口)

**链长闸(K,默认 4)**——精确计数规则:
- **计入**:agent 的实际发言(非 pass 的房间 assistant 消息)。**真机实测修订(2026-07-27):收割/交付贴文不再计入**——计入会让干活越多越快冻嘴(coordinator.ts noteAgentSpoke 对 harvest 贴文 noop)。**W12(2026-07-28)已补齐 live/replay 口径**:postAgentMessage 给收割贴文盖 `source='collab-harvest'`(`COLLAB_HARVEST_SOURCE`,与驱动的 `'collab'` 分开且只判 assistant 角色,不撞 isCollabDriveMessage),`collabMessageCountsTowardChain` 按标记跳过,boot 重算与实时计数一致;W12 之前的老转录无标记仍会被重算多算一次,一条真人消息即归零(一次性,自愈)。
- **不计**:驱动消息、协调器系统行、pass 回合;
- **重置**:用户真实房间消息(非 collab 来源的 message:user-created)**或 steering:consumed**(人类插话经 steering 持久化走 persistInjectedChatMessage,不发 user-created——只听后者会漏);
- **到顶**:聊天类激活(mention/self-elected)冻结;**真机实测修订(2026-07-27,取代本段 v2 设计):task-event 豁免链长闸**——含 task-event 全冻在 P1 真机把真实工作流卡死(工单进展被闸拦),评审环的无界风险改由独立的 per-task 打回计数(≤2)+ 受阻计数(W9b,≤2)+ 预算闸兜;"评审已排队"排队行随之不存在。K 默认已调至 8(IM 文档 §2.3)。
- **独立的 per-task 打回计数**(默认 2):无人类输入时,同一任务的"评审打回→重执行"最多 2 轮,到顶任务标 blocked 等人——评审环的专用保险,与链长闸解耦。

**并发闸**:房间活跃 work 会话 ≤ M(默认 2)+ 全局(所有房间)≤ 4;超出 FIFO 排队,看板可见。

**预算闸**——单位与归因(v1 双错已修):
- **单位 = costUSD**(账本现成字段;token 数混入 cacheRead/Write 不可比)。房间日预算默认 $5。**用户指令修订(2026-07-27,取代"硬上限 $20")**:限额必须完全可配置——任意正数或 0=不限额(setCollabRoomBudgets + 建群/设置 UI + CLI --budget),不设硬顶。
- **归因按 sessionId 集合**(房间 + 其 work 会话):主回合记账 source 硬编码 'chat'(agent-loop-executor.ts:400-409),"按 source:'collab' 归因"today 不可实现;协调器从账本增量累计水位存 state.json。P1 可选把 usageSource 从命令透传进 recordUsage(一处引擎触点,列清单)后再切 source 归因。
- **逐激活上限——实际落地形态(2026-07-28 审计对齐)**:maxTurns 逐激活透传**未实现**(引擎 send-message 命令契约无此字段,加字段是引擎面改动);实际兜底 = 墙钟超时(房间激活 10min / work 会话 30min,超时 abort 僵尸流)+ 日预算闸。房间回合工具面仅 board,失控面有限。maxTurns 透传列为 backlog(若真机出现单激活烧穿预算的案例再做)。
- pass 回合**照常扣预算**(它是一次全上下文调用)。

### 6.3 协调器状态与崩溃恢复(评审修订:v1 的 state.json 规格不足)

state.json 结构见 §4,关键是两个 v1 没有的字段:
- **lastProcessedMessageId(转录水位)**:事件流是内存态、消息是持久态——重启后从水位向后重放持久转录,补处理错过的 mention(否则崩溃前一瞬的 @ 静默丢失,房间死等)。
- **逐激活阶段记录 + driveMessageId**:重启对账规则——`queued` 重驱;`driving/streaming` 且引擎无活流 → 标 `failed` **不重驱**(driveMessageId 已落库即视为已消费,防双驱动双计费双回复);`harvested` 无操作。
- **看板对账**:doing 且无活跃流的任务 → 标 blocked + 房间系统行;"续"是显式用户/PM 动作(新驱动携带既有 work 会话为上下文)。**pending 权限询问随进程死亡**(内存 Map,跨重启存活未建)——恢复即上述 blocked 路径,续跑时该工具调用自然重新 ask。

### 6.4 pass 语义(评审修订:不做"流完再删")

v1 的"删除该 assistant 消息"有三连问题:用户眼睁睁看消息流出来再消失(群聊语境=「有人撤回了悄悄话」,违背全量可见承诺)、崩溃残留 [pass] 文本、孤儿驱动消息。修订:
- **渲染侧首行门**:collab 激活的 assistant 消息,流式期间正文渲染延迟到首行判定;首行为 `[pass]` → 整条折叠为"小研 选择不发言"细线,不展示正文。
- **消息保留不删**:打 metadata 标;投影与链计数排除;其驱动消息随折叠规则一并收起。崩溃残留由启动清扫补标(扫房间会话首行 [pass] 的 assistant 消息)。
- 协议提示词写死:pass 必须单独成消息、首行顶格;`[pass]\n但是…` 按正常发言处理(内容不丢,模型自己承担说了废话计链)。
- **措辞已实测(§2.3)**:软规则("没有需要说的就 pass")实测失败;必须用铁律式措辞(「最新消息 @ 了别人而没有 @ 你,或不在你职责范围 → 必须只输出一行 [pass]」+「宁可 pass,不可插话」反例),实测 4/4 通过且默认应答人不过度沉默。

## 7. 权限、预算与安全

| 面 | 策略 |
| --- | --- |
| 工具权限 | collab 会话走 permission-policy 新增的**交互分支**:不 120s 自动拒(现状 timeoutAskBridge 会拒,§2.2),耐心等待 + 30min 房间软提醒 + 看板"等待授权"态;房间设置可显式切"无人值守拒绝"模式 |
| 授权面 | P0/P1 审批卡只有 **once / 拒绝**(workdir grant 无 agent/任务维度会跨 agent 全目录免检并击穿注入防线;房间/任务维 grant 是 P2 前提) |
| 通道 | 驱动带会话真实 channel(goal kick 推导);应答采纳 pending.info.targetChannel;'collab' 进 SYSTEM_INTERNAL_MESSAGE_SOURCES(路由豁免)且权限走上行分支(两件事解耦,v1 的矛盾即在此) |
| 费用 | 单位 costUSD;房间日预算(默认 $5)按 sessionId 集合归因;逐激活 maxTurns(房间 8 / work 40)+ 事件观察软超限 abort;pass 计费 |
| 并发 | 房间 M=2 + 全局 4,协调器闸(activeStreams 本身无界) |
| 总闸 | 房间"全部暂停":abort 所有 work 流 + 冻结激活;跨重启持久(state.json.frozen) |
| prompt injection | 看板文本会进其他 agent 的提示词——投影与简报中一律数据块包裹 + 来源标注,不当指令解释;审批面收窄保住"人肉后门"防线(workdir 免检=防线击穿,见授权面行) |
| 可审计 | 无隐藏信道;activity.jsonl 全量流水;每条 agent 消息的激活理由在驱动折叠行可见;pass 也留痕("选择不发言"细线) |

## 8. UI 方案(组件化复用,不另造轮子)

- **房间**:就是会话——ChatWindow/MessageItem/InputBox 全复用。增量:MessageItem 读 message.agentId → agents store 渲染署名头(kind 门控);**协作驱动消息折叠行**(keyed origin.source==='collab',isGoalInjected 同款,行内展示激活理由);**首行门 + "选择不发言"细线**(§6.4);composer @ 触发复用编辑器 trigger 机制({{page:tabId}} 先例);会话头成员头像列 + 暂停总闸;**隐藏 AgentSelector**;agent 消息隐藏 edit/retry 菜单。
- **看板**:RightWorkbenchPanel 新 tab 'board'(五点位);列 + 卡(标题/assignee 头像/状态/**等待授权角标**/排队态);点卡开工作会话 tab;复用共享 Table/ContextMenu。
- **审批聚合**:房间侧一个审批队列面板,按 agent/任务分组展示跨会话并存的多张卡(每会话头部独占、跨会话并行是引擎语义),respond 带 worker sessionId + 采纳 targetChannel(新渲染层管道,防相似 bash 卡误点)。
- **建房间**:sidebar "群聊"分区 + 建房对话框(成员、PM、预算默认值);Agent 管理复用 AgentsPanelContent(增字段 + 角色模板)。
- **web 宿主**:全部新 IPC 进 WEB_DESKTOP_ONLY 列表,capability 门控,P3 再议。

## 9. 分阶段落地

先总览,再细化。每期独立可用、独立可验收。

| 期 | 交付 | 一句话验收 |
| --- | --- | --- |
| **P0 群聊骨架** | Agent 字段扩展 + kind + 入口门 + 署名 + @ 激活 + 投影 + 链长闸 + 触发器/记忆门控 | 建房拉 3 角色,@ 谁谁以其人格署名应答,用户消息永不引发错误 persona 出流,连续 agent 对话到 4 条冻结 |
| **P1 看板 + 执行** | BoardStore(rev)+ board 工具 + 看板面板 + worker 生命周期 + 交互权限分支 + 审批聚合 + 恢复对账 | 下目标 → 拆卡指派 → 两 worker 并发(审批可等可批、现场可看)→ 摘要回贴 → 评审(打回≤2)→ done;重启后 doing 任务被对账为 blocked 且可续 |
| **P2 编排升级** | default-responder 路由、deps、站会、预算面板、房间/任务维 grant、打回环强化 | 不 @ 也有人接话(预算内);任务链按依赖推进;workdir 级授权带房间维度后放开 |
| **P3 深化** | 团队共享记忆 scope、外部成员(claude-code-agent)、web parity、artifacts | Claude Code 作为"外包工程师"接卡干活;web 端可看房间 |

### P0 群聊骨架(评审修订:清单补齐五触点/仓储/门控)

- `packages/shared/ipc/chat.ts`:ChatMessage.agentId? / SessionMeta.kind?+room / **CreateSessionRequest 扩展 {kind?, room?}**;`agents.ts` 请求类型补 tools+新字段。
- **建房 IPC 走全五触点**:channels.ts、shared 类型、`apps/electron/src/main/ipc/sessions.ts`(或新 collab.ts)+ `apps/electron/src/ipc/` 工厂树、`preload/bridge.ts`、`platform/web.ts`(WEB_DESKTOP_ONLY)+ renderer ElectronAPI 类型。
- `packages/onething-runtime/src/sessions/session-repository.ts`:kind/room 字段的显式 meta 变更器(仓储字段是显式白名单式)。
- `packages/onething-runtime/src/agents/{store,ipc-operations}.ts` 字段扩展与透传修复。
- 新 `packages/onething-runtime/src/collab/`(纯逻辑:投影四类变换、mention 解析、激活规则、pass 判定、链计数)——登记 onething.aliases.ts。
- 新 `packages/onething-runtime/src/app/collab/`:coordinator(激活队列 / 三闸 / state.json 含水位与阶段 / updateSessionAgent+驱动 / 启动对账);`app/channel/origin.ts` 登记 'collab'。
- **入口门**:`app/engine/stream-engine.ts` handleSendMessage override 加 kind 门(含 edit/retry 拦截)。
- **署名盖章**:`app/stores/sessions.ts` addMessage 收口(kind 门控)。
- **投影**:接入 `app/engine/stream/` 历史重建收口(kind 门控)。
- **门控三件套**:goal-continuation 等 post-response 触发器对 kind∈{room,work} 关闭(`app/engine/triggers/`);soul-memory after-response capture/review 对 collab 会话关闭(`app/plugins/builtin/soul-memory.ts`);工具白名单适配器按 kind 收窄(`app/engine/stream/agent-loop-runtime.ts`,房间=∩{board},P0 房间可先=∅ 纯聊)。
- prompt:花名册稳定段 + 看板/活任务尾部注入(`app/engine/prompt/`)。
- `backend.ts`:opt-in 初始化(仿 sessionSkills/mcpAcp)。
- renderer:sidebar 群聊分区 + 建房对话框;MessageItem 署名头 + collab 折叠行(origin.source)+ 首行门;@ trigger;sessions store kind 过滤;AgentSelector 隐藏;agent 消息 edit/retry 隐藏。
- 主进程:UPDATE_SESSION_AGENT 对 kind='room' 拒绝。
- 验收补充:重启后房间/署名/链计数/水位对账完好;用户消息在任何时刻(含 agent 正在流式时)发出都不产生未协调的流;老会话零回归(kind 缺省路径);流式期间署名即时正确。

### P1 看板 + 执行

- 新 `packages/shared/ipc/collab.ts` + COLLAB_* channels,五触点走全;`app/collab/board-store.ts`(rev 前置条件 + activity.jsonl + configureCollabHost 广播;单任务单活跃会话不变量;doing 挪出先 abort;assign 幂等)。
- `app/tools/builtin/board.ts` 单工具多 action,进 full 注册表;PM/工程师/研究员模板入库。
- worker 生命周期:spawn(kind='work'/血缘/pin model/简报)→ 观察 → complete 收割(摘要限长)→ 回贴+链接 → review 激活;打回计数。
- **权限**:permission-policy collab 交互分支(不 120s 拒 + 30min 软提醒);审批卡 once/拒 两档;renderer 审批聚合面板(worker sessionId + targetChannel 应答管道)。
- **恢复对账**:协调器启动扫描(§6.3)。
- 可选引擎触点(择机):usageSource 从命令透传进 recordUsage(`app/engine/stream/agent-loop-executor.ts:400-409`)。
- renderer:BoardPanel 五点位、任务卡→openSession、等待授权角标。
- 验收补充:并发闸生效(第 3 任务排队);预算闸按 costUSD 生效且逐激活 maxTurns 兜底;两张相似审批卡可正确分辨与分别应答。

### P2 / P3(要点)

- P2:default-responder 路由判定(规则先行,LLM 选人独立计费后议)、deps 拓扑、Scheduler 站会、预算面板、**房间/任务维度 grant 设计**(做好才放开 workdir 档)、评审环强化。
- P3:团队共享记忆(房间级 workspace,与 agentsDir/memoryProfile 正交,先解决写权规则)、外部成员(**约束**:claude-code-agent supportsTools:false 无 board 工具——完成信号只能靠协调器收割连接器事件,协议降级)、web/server parity、artifacts 面板。

## 10. 风险与开放问题

1. **房间自动 compact 未硬禁**:maybeCompactBeforeSend 在 core send 路径(core-stream-engine.ts:557),app 层无门可关——P0 接受低概率触发(房间规模小、阈值高),后果是 compact 摘要丢署名导致投影退化;P2 做带署名 compact 模板,若需硬禁则是一处小 core 触点。这是本方案唯一放弃的硬保证。
2. **edit/retry/branch 在房间的正确语义**(按 message.agentId 重放)后议;P0 一律禁用。
3. **deleteAgent 钉死**:工作会话引用会阻止删 agent——策略开放(任务完结解除引用 vs 放宽 guard)。
4. **MessageList 既有两个分页 bug** 被高流量房间放大——修复在另一条线,房间不新增机制。
5. **pass 纪律对措辞敏感(已实测收敛)**:铁律措辞 4/4 通过(§2.3),但残余风险是"被激活却无话可说"时的幻觉插话(软措辞轮实测编造过不存在的成员)——主防线是编排层不激活未被点名者;hedge(`[pass]\n但是…`)按正常发言处理;首行门实现有流式渲染细节风险。跨模型覆盖(claude/gemini 等)待 P0 移植进 evals 后补测。
6. **投影缓存经济学**:每发言者独立缓存前缀,房间人多成本线性升;预算闸兜底,花名册/人格稳定段最大化复用。摘要回贴(非全文)已压掉最大的复读项。
7. **收割边界**:complete 之后的输出并入报告;协议提示词写死"complete 是最后一个动作"。
8. **agents.json 并发写**:协调器串行化自身写入;用户 UI 同时编辑沿用 last-write-wins 现状,观察项。
9. **board 高频广播**:30ms 级节流聚合(browser tabs-changed 先例)可后置,P1 先直发。
10. **多人类房间、agent 主动建房、房间嵌套**:显式不做(§1)。

## 11. 业界对照(为什么长这样)

| 方案 | 核心机制 | 我们的取舍 |
| --- | --- | --- |
| AutoGen GroupChat | selector LLM 每步选发言人 | 选人 LLM 是持续成本与不可解释源;我们用"激活理由枚举 + 默认应答人",P2 才谨慎引入受预算约束的路由 |
| CrewAI hierarchical | Manager agent 隐式派工(内存态) | "经理的派工"外化成看板真源——可见、可改、可审计,重启不失忆 |
| OpenAI Swarm | handoff 静默转交控制权 | @ 与指派就是 handoff,但永远经过房间(可见)而非静默 |
| Claude Code subagents | 隔离上下文执行 + 结果回报 | 工作会话与之同构;差异是回报落在人类所在的群聊且有看板状态机 |

共同差异定位:**人在群里、看板是共享真源、预算是第一公民、一切通信可审计**。这不是 agent 框架,是一个"你雇了一支看得见的小团队"的产品。
