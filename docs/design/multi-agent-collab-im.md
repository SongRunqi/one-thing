# 多 Agent 协作 v2:IM 化(自主响应 + typing + Teams 式交互)

> 状态:设计定稿,交由 Opus 5 分单实现,主导/评审:Fable 5。日期:2026-07-28。
> 父文档:`docs/design/multi-agent-collab.md`(P0/P1 机制全部保留,本方案**替换激活模型与房间呈现层**)。
> 用户核心批评:"现在的聊天太像 trigger。我要 Teams 那样的协作系统——每个 agent 是一个人,发消息谁回谁不回都 OK,回不回由 agent 自己决定,不是 @ 触发;要看到谁在 typing;UI 交互都朝 IM 方向做。"

## 0. 一句话

把"协调器点名激活"换成"**每个成员自己决定要不要接话**":每条真实消息落地后,所有成员并行做一次**廉价的响应意愿判定**(小上下文 LLM 调用),想回的人排队回复并亮起 **typing 指示**;@ 从机制开关降级为社交信号;房间 UI 改成 IM 气泡形态。执行面(看板/worker/权限/预算)不动。

## 1. 目标与非目标

**目标**
1. 自主响应:消息 → 每个成员(除作者)判定"我要不要现在说话" → 想说的排队说。没人想说就安静——这是合法状态。
2. typing 指示:判定为"要回"的成员立刻在房间里显示"正在输入…",直到它的消息流出或放弃。
3. IM 风格房间 UI:他人消息左侧+圆头像,本人右侧;同人连续消息合并成组;typing 行在 composer 上方;协调器驱动线在房间里**完全不可见**。
4. 成本可控:判定调用必须廉价(小上下文、低输出),受既有预算闸约束。

**非目标**
- 不改工作会话/看板/worker 生命周期/权限/费用闸(P1 资产原样)。
- 不做已读回执、未读分割线、消息转发(后续)。
- 不做用户可见的"判定理由"呈现(内部记录即可)。
- 普通(非房间)会话 UI 零改动。

> 2026-07-28 用户追加:引用回复(quote)、表情回应(reactions)、拉人/踢人的 IM 化交互**必须做**——"这些细节一定要做好"。已从非目标移入 §3.5 与工单 W6/W7/W8。

## 2. 核心机制:响应意愿判定(Response Willingness)

### 2.1 判定流程

```
真实消息 M 落地(用户或 agent,非驱动/非系统行)
 → 协调器对每个成员 X(≠作者)并行发起【意愿判定】(全部成员一起,一次小调用/人)
 → 判定结果 respond=true 的成员,按判定返回顺序进入回复队列
 → 入队即 emit typing(X, true);轮到 X 时走既有驱动链(reason: 'self-elected')
 → X 的回复流出(stream:start)后 typing 继续;stream 终局或 pass → typing(X, false)
 → agent 回复本身也是真实消息 → 触发下一轮判定(受链长闸约束)
```

### 2.2 判定调用(关键的成本工程)

- **通道**:走 provider facade 的 utility turn(标题生成同款通道,`runUtilityTurn`,mode 标 'collab-willingness'),用房间会话解析出的同一 provider/model(agent 有 model 绑定用绑定)。
- **上下文**(总量控制在 ~1-2k tokens):
  - system: persona 原文(不加包装,同 v3 定稿) + 现有情况说明
  - user: 最近 ≤8 条消息的 IM 投影(`名字: 内容`,每条截 ≤200 字) + 末尾:"最新这条消息之后,你会开口说话吗?只输出 JSON: {\"respond\": true|false}"
- **解析**:宽松解析 JSON;解析失败 = false(宁静默)。
- **短路规则**(省钱+确定性,写在协调器不写在提示词):
  - 消息明确 @X → X 跳过判定,直接 respond(@ 仍是最强社交信号,但只是快捷路径,不再是唯一路径)
  - 房间 frozen / 预算超限 / 链长闸到顶(仅 agent 作者消息) → 全员跳过判定
  - 判定并发上限:成员数 ≤8 全员判;>8 只判被 @ 者+PM(极端保护,P0 房间没这么大)
- **pmAgentId 语义降级**:不再"默认应答"。判定的 system 情况说明里加一条事实:"你是本群的负责人"(仅 PM),让它天然更倾向接话。default-responder 机制代码删除。

### 2.3 决策与排队

- 判定为 respond 的成员进入既有串行激活队列,reason 用新值 `'self-elected'`(枚举扩展);驱动/投影/署名/收割链路完全复用。
- 排队期间新消息到达:队列中未驱动的成员**不作废**(它想说话的意愿仍成立,回复时投影自然包含新消息)。
- 链长闸语义不变:agent 消息触发的判定轮,chainCount ≥ maxChain 时不发起判定;用户消息永远发起(并清零)。
- 全员 false → 房间安静,**不贴任何系统行**(安静是合法状态;PM-less 提示行机制删除)。

### 2.4 typing 事件

shared 新会话事件:
```ts
interface CollabTypingEvent {
  type: 'collab:typing'
  agentId: string
  typing: boolean
}
```
- 发出点(协调器):入队 respond → true;stream 终局/pass/失败/被挤出 → false。worker 的交付回贴前一刻也可短暂 true(可选,一期不做)。
- renderer:房间会话订阅,composer 上方渲染"🔧 小李、🔎 小研 正在输入…"(多人合并,60s 无后续自动消隐容错)。

## 3. IM 风格房间 UI(仅 kind='room')

1. **气泡布局**:用户消息右对齐(现状),agent 消息左侧:圆形 emoji 头像(32px)+名字行+气泡。**同一 agent 连续消息合并为组**:头像与名字只在组首,组内气泡紧凑堆叠。实现为 MessageList 房间模式的分组计算 + MessageItem 的 `grouped` prop(隐藏署名头)。
2. **typing 行**:composer 上方一行,淡色,带轻微跳动省略号动画;多人时"小李、小研 正在输入…"。
3. **隐藏机制痕迹**:房间里协调器驱动消息(origin.source='collab' 的 user 角色)**不渲染任何行**(连折叠线也去掉——typing 指示已提供"谁要说话"的信息);pass 折叠线保留("选择不发言"降噪为更淡的一行,或直接不渲染——**不渲染**,IM 里没人宣布自己不说话)。
4. **系统行**保留现有样式(任务/预算/暂停通知是真实的群公告)。

## 3.5 IM 交互细节(用户追加,逐项设计)

### A. 引用回复(quote/reply)
- **数据**(shared ChatMessage 可选新增):`replyTo?: { messageId: string; authorLabel: string; excerpt: string }` — **快照式**:excerpt 截被引消息前 120 字,authorLabel 是引用时点的署名;原消息被删后引用块仍完整,messageId 仅用于点击跳转(找不到就不跳)。
- **交互**:消息 hover 操作区加「回复」;点击后 composer 上方出现引用预览条(作者+摘录+×取消);发送时 replyTo 随消息持久化。
- **投影**(模型侧):带 replyTo 的消息渲染为 IM 惯例:
  `> 阿明: 被引摘录…`
  `用户: 回复正文`
  模型对这种格式有天然理解,被引上下文即使超出投影尾窗也随引用块带到。
- **Agent 主动引用**:一期不做(agent 的回复由 typing+顺序已可对应);后续可让回复驱动携带"响应哪条"并自动 replyTo。
- **UI**:气泡顶部引用块(淡底、左竖线、作者+单行摘录),点击滚动到原消息并高亮一闪。

### B. 表情回应(reactions)
- **数据**(shared ChatMessage 可选新增):`reactions?: Array<{ emoji: string; by: Array<{ type: 'user' | 'agent'; agentId?: string }> }>`。
- **通道**:新 IPC `COLLAB_MESSAGE_REACT` {sessionId, messageId, emoji, actor} — toggle 语义(同 actor 同 emoji 再点=取消);store 层新增 updateMessageReactions 走既有消息更新链;广播复用 `message:updated` 事件(渲染层已消费)。
- **用户交互**:消息 hover → 😀+ 按钮 → 常用表情小面板(👍 ❤️ 😂 🎉 🤔 👀);已有回应聚合显示在气泡下沿(emoji×count),点击切换;tooltip 列出是谁。
- **Agent 回应(点睛)**:意愿判定的输出扩展为 `{"respond": true|false, "react": "👍"|null}` — **判定说"不说话"时可以顺手给一个表情**,零额外调用成本;协调器把 react 写进该消息 reactions(actor=该 agent)。真人群聊"没什么好说的但点个赞"的手感由此而来。respond=true 时 react 忽略(话都要说了)。
- **投影**:被回应消息在投影中尾附 `(👍×2)` 轻量标注,让 agent 知道群里的反馈氛围;单表情多人聚合,总长截断。
- **约束**:reactions 是元数据,不触发意愿判定(不然点赞引发连锁判定)。

### C. 拉人/踢人(成员变更 IM 化)
- **入口**:房间头部**成员头像列**(圆形 emoji 头像一排,hover tooltip 名字·职务):末尾 ＋ 拉人(选 agent 弹层);头像右键 → 「移出群聊」「设为负责人」。设置面板(W6)保留同能力的完整版。
- **群公告**:变更即贴系统行「小研 加入了群聊」「你把 小研 移出了群聊」「阿明 成为群负责人」。
- **模型可见性**:新增成员变更类系统行标记 `source: 'collab-membership'`,**投影包含它们**(现有投影 skip 全部 system——放行此类,agent 必须知道谁来了谁走了);其他系统行(预算/排队等运营噪声)仍不进模型。
- **语义**:新成员天然看得到全部历史(投影即全量);被移出者进行中的 work 会话不强杀(任务照常收割),此后不再参与判定;PM 被移出时 pmAgentId 清空。

### D. 其余细节(纳入 W3)
- 时间分组:超过 10 分钟间隔或跨天,插入居中时间胶囊(今天 14:32 / 昨天 / 7月26日)。
- 成员头像列即 C 的入口,常驻房间头部。
- 消息送达态不做(流式本身就是"正在说")。

## 3.6 UI 视觉规格(反 AI-Slop 宪法 — 用户三令五申,所有 UI 工单的硬约束)

**原则:IM 的手感,onething 的皮肤。** 本仓库已有成熟的纸墨/画线/账页设计语言(基准件:sidebar v7、命令面板账页、工具调用蓝图、设置页画线风)。IM 化是把交互模式换成 IM,视觉必须继承这套语言——不是引入一套通用聊天模板。

**质感基准(实现前先读这些组件的样式)**
- `packages/renderer/styles/variables.css` — 全部颜色走 `--ui-*` 语义 token(ui-token-vars 测试强制;禁直连 --text-*/裸色值)
- `packages/renderer/components/sidebar/Sidebar.vue` — 墨色层级、hover 只变墨不变底的克制
- `packages/renderer/components/chat/message/GoalContinuationLine.vue` — 细线+小字的"痕迹"级 UI
- 工具调用蓝图面板(StepsPanel) — 结构感来自线与对齐,不是底色块

**IM 元素规格**
- **气泡(2026-07-28 用户修订,取代"左墨线二选一")**:agent 消息与用户消息**同款气泡框**(同边线/同淡底/同圆角 ≤8px),方向与归属靠左右布局+头像署名区分;头像与署名在气泡框外。W3 的左墨线方案废止。
- **间隔节律(2026-07-28 用户实锤"间隔没有固定,看起来很混乱")**:房间消息流使用**固定间距表**,全部行类型只允许取表内值——组间(换发言人/用户↔agent)一档、组内一档、系统通知行上下一档、时间胶囊上下一档、思考痕迹行一档;具体数值实现时从现有栅格定,但**同类间隔必须处处相等**,禁止各组件自带 margin 叠加出随机间隙(走查用截图量像素验收)。
- **房间系统通知行(2026-07-28 用户实锤"通知消息非常 AI slop,噪音很大")**:房间内一切系统消息(任务生命周期/成员变更/预算冻结)**禁用全产品通用系统卡片**(带图标/边框/时间戳的大卡),改为居中痕迹行:11px 墨灰、无卡无框无图标,长文案截两行 + title 全文;与时间胶囊同族但无虚线延伸(胶囊管时间,通知管事件)。
- **头像**:28px 圆形 emoji 章,细边(1px 墨线 35% 透明),无阴影无渐变;组首才出现。
- **署名行**:名字 12px 半粗 + 职务 11px 墨灰,与现有 collab-sender 一致。
- **typing 行**:11px 墨灰小字 + 三个 2px 墨点的呼吸动画(透明度 0.3↔0.8,错峰 200ms),无底色无框。
- **时间胶囊**:居中,10px 墨灰,左右细虚线延伸(同 collab-drive-line 手法)。
- **引用块**:气泡内顶部,左侧 2px 墨线,10-11px,作者半粗+摘录单行截断,底色 ≤3% 墨。
- **回应 chip**:细边小胶囊(1px 线,3px 圆角),emoji 14px + 计数 10px 墨灰;自己点过的 chip 边线加深,不填色。
- **成员头像列**:房间头部一排 24px 头像章,重叠 -6px 排布,末位 ＋ 同规格虚线圆。

**禁则(AI slop 特征,出现即打回)**
- **房间里 agent 消息逐字流式渲染**(2026-07-28 用户实锤补入:"你见过 team 里那个人发的消息是流式的吗?"——IM 消息整条落地,流式期间 typing 指示是唯一信号;work 会话除外,那是工作视图不是群聊)
- 渐变底、彩色消息气泡、大圆角(>8px)胶囊消息、多层 box-shadow
- 无节制的 emoji 装饰、彩色状态点、"科技感"发光
- 通用组件库默认样式直接落地(所有控件过一遍 token 化)
- 动画超过 200ms 或弹跳缓动;任何 hover 放大
- 空态插画/大段引导文案——空态一行墨灰小字即可

**验收**:每个 UI 工单交付后由主导者(Fable)视觉走查对照本节;ui-token-vars 测试绿是底线不是标准。

## 4. 变更清单(按工单)

### W1 判定器纯逻辑 + 协调器接入(后端核心)
- `packages/onething-runtime/src/collab/willingness.ts`(新,纯逻辑):
  - `buildWillingnessPrompt({self, members, roomName, recent, pmAgentId})` → {system, user}(persona 原文+情况说明+投影尾窗+JSON 指令)
  - `parseWillingnessReply(text): boolean`(宽松 JSON 解析,失败 false)
  - 单测:prompt 形状(persona 原文开头/含 JSON 指令/PM 事实行)、解析(标准/带围栏/坏输出)
- `packages/onething-runtime/src/collab/activation.ts`:`CollabActivationReason` 加 `'self-elected'`;`decideCollabActivations` 仅保留 mention 短路与闸门判断,default-responder 分支删除(含测试更新)
- `packages/onething-runtime/src/app/collab/willingness-runner.ts`(新,app 层):
  - `judgeWillingness(roomSessionId, members, message): Promise<string[]>` — 并行对每成员跑 utility 调用(provider 解析:agent.model 绑定 → 房间会话 provider → 全局默认;走 `runUtilityTurn`/现有 facade 单点,usage source 落 'collab-willingness')
  - 超时 8s/成员,超时=false;错误=false
- `coordinator.ts` `handleRoomUserMessage` 与 harvest 后的 cascade 改造:
  - mention 命中者直接入队(reason 'mention')
  - 其余成员 → judgeWillingness → respond 者入队(reason 'self-elected')
  - default-responder/PM-less 提示行逻辑删除;typing 事件发出(见 W2 事件定义,W1 可先 emit)
- 验收:vitest 全绿;CLI 自测:不带 @ 发"这个项目该用什么技术栈?"到 阿明+小李 房间,**至少一人自主回复**;发"好的谢谢",**允许全员沉默**(转录无新增 assistant 消息)。

### W2 typing 事件贯通
- `packages/shared/events/session-events.ts`:`CollabTypingEvent` 进联合
- 协调器:入队/终局/pass 的 emit(排队被 frozen 清空也要 false)
- `packages/renderer/stores/collabBoard.ts` 或新 `collabTyping.ts`:订阅维护 per-room typing 集合(60s 自动过期)
- `ChatPanel.vue`(房间时)composer 上方 typing 行组件(新小组件 `CollabTypingLine.vue`,头像+名字+动画省略号,ui token 规范)
- 验收:CLI 自测时通过 `collab log`/事件流观察 typing true→false 序列;UI 手测由 review 阶段截图确认。

### W3 IM 气泡化
- `MessageList.vue`:房间模式消息分组计算(同 agentId 连续 assistant 消息 → 组;传 `imGroupHead`/`imGrouped` props)
- `MessageItem.vue`:房间 agent 消息左侧头像列布局(圆形 avatar 32px,组首才渲染头像+名字);驱动消息渲染分支改为 `null`(彻底不可见);pass 消息不渲染
- 样式走 ui token(--ui-* 语义变量,禁直连 --text-*,见 ui-token-vars 测试)
- 验收:ui-token-vars 测试绿;房间与普通会话快照对比(普通会话零变化)。

### W5 Agent 工具/模型配置 UI(用户新增需求)
- 背景事实:`agent.tools` 白名单与 `agent.model` 绑定在数据层/引擎层已全链路生效(P0 修通),缺 UI。
- `packages/renderer/components/AgentsPanelContent.vue` 编辑页新增:
  - **工具多选**:数据源 = 全局已启用的工具列表(platformApi 既有 tools 列表接口;呈现 id+名称);交互:默认"跟随全局(全部)",勾选任意项后进入白名单模式;保存走既有 agents update IPC 的 tools 字段(数组/null 清除)。
  - **模型绑定**:provider/model 两级选择(数据源 = 既有 provider/models 接口),可清除回"跟随会话默认";保存走 model 字段。
  - 工作会话会自动并集 board 工具(协议依赖),UI 上标注这一句说明。
- 验收:改完的 agent 在工作会话里真实只见白名单工具(CLI 自测:给小李配 tools=['read'],驱动一个要写文件的任务,转录应显示它没有 write 而设法说明/受限);UI token 规范测试绿。

### W6 Team(房间)设置面板(用户新增需求)
- 房间设置入口:房间 TabBar 头部(看板按钮旁)⚙ 打开设置浮层(或看板面板内 tab)。
- 能力:改名(复用 renameSession)、成员增删、PM 变更、日预算(复用 setCollabRoomBudgets)、权限模式(normal/auto-accept-edits/dangerously-allow-all,写房间会话 permissionMode——work 会话继承已实现)、总闸开关(复用)。
- 新 IPC:`COLLAB_ROOM_UPDATE` {roomSessionId, memberAgentIds?, pmAgentId?}(校验 agent 存在/PM∈成员;app 层 setCollabRoomConfig 走 updateSessionCollab 合并);五触点齐。
- 成员移除的边界:该成员进行中的 work 会话不强杀(任务照常收割),后续不再被判定/激活。
- 验收:改动即时生效(判定名单/预算/权限)。

### W9 任务事实链修复(W5 验收现场揪出,优先于 W6)
背景(2026-07-28 真机实锤,证据=provider dump + 房间转录):给小李配 tools=['read'] 派写文件任务,工具强制生效、worker 如实标"受阻";但**房间侧小李被 @ 后谎报"已交付"**(它对自己在飞的任务零感知),**阿明看不到"受阻"系统行**(投影 skip 全部 system),凭小李的谎报评审"文件存在,通过"并把受阻卡关成 done。三层修复:
1. **协作系统行进投影**:任务生命周期系统行(开始执行/交付/受阻/评审结果)与成员变更行进模型投影(`系统: <文案>` 形态);预算/排队等运营噪声仍不进。willingness 窗口同源同规则。给这类消息打稳定标记(如 `source: 'collab-task'`),渲染层不变。
2. **受阻评审语义**:task-halted/受阻触发的 PM 激活,驱动内容必须陈述"任务受阻+原因入口(看板)",指令是"决定下一步(重派/换人/改方案/问用户)",不是"评审交付"。交付路径的评审语义不变。
3. **在飞任务自感知**:agent 的房间驱动(所有 reason)的情况说明追加该 agent 自己的任务事实行:进行中/受阻的卡(id+标题+状态)。纯事实,符合"persona 原文+情况说明"铁律。
验收:复跑同场景(白名单小李+写文件任务)——房间小李不再断言已交付(或至少 PM 能看到受阻并按受阻处置);受阻卡不得以"评审通过"进 done。结构断言:投影含受阻行、受阻激活驱动含受阻措辞。

### W9b 受阻/重试回路结构收口(W9 复跑真机三连发现)
背景(证据=转录+board+dump):W9 复跑中 ①受阻→PM"解阻重试"回路无上限(预警成真);②受阻卡没落原因,受阻行"原因见看板"空指;③**最深洞:PM 解阻 move 回 todo 后根本不重新触发执行**(dump 里零 work 会话请求)——"重试"变成房间剧场:房间小李(唯一工具 board,物理上不可能建文件)用 board 把自己名下的卡 move 到 done 并写假报告「已验证文件存在且内容正确」,PM 采信。status.txt 从未存在。
1. **重派必须真执行**:带 assignee 的卡从 blocked/done 回到 todo(或换 assignee)= 重新排队 spawnWork(受 3 的计数上限约束);这是死路 bug 修复,不是新机制。
2. **per-task halted 计数**:卡上加字段(重启存活、看板可见);同一卡第 2 次受阻起不再自动激活 PM、不再自动重执行,贴事实系统行「第 N 次受阻,已停自动处置,等用户决定」。用户消息永远可推动。
3. **受阻原因落卡**:worker 受阻路径把可得原因写进卡(优先 board blocked 调用自带说明,否则工作会话末条 assistant 摘录);受阻系统行带原因摘录(≤80 字)。
4. **done 带执行证据,不设禁令**:卡进 done 时,系统行与卡 report 附**结构性执行痕迹**:该卡对应 work 会话的真实工具调用计数(如「执行记录: write×1, read×2」;由 harvest 从工作会话消息统计,模型无法伪造);没有任何 work 会话的 done 标注「无执行记录」。评审者与用户由此一眼识破剧场。执行人房间 turn 自关自己名下的卡不禁止(保留人类管理弹性),但证据行让它无处遁形。
验收:复跑同场景——解阻回 todo 真的重新执行(dump 出现 work 会话);第 2 次受阻后房间安静;卡上有原因;假 done 带「无执行记录」标注。

### W10 自称视角修复(2026-07-28 用户截图实锤)
背景:小研查看板后向用户汇报「任务 #8f040f9b 指派给小研,正在执行中。**他**跑了一阵了」——自己说自己是第三者,"agent 是一个人"的塑造被打穿;还把 rev5 这类机械细节念进人话。查看板本身是对的(真工具真数据,诚实链在工作);坏的是**视角**。根因:看板 digest/工具结果无视角(assignee 渲染为名字),模型照抄结构化数据的第三人称,W9.3 的「你名下的任务」事实行敌不过刚拉回来的 digest 原文。
1. **看板视角化渲染**:agent(房间回合/工作会话)调 board 工具时,digest 与工具结果把**该 agent 自己的名字**渲染为「你(小研)」。实现:digest/格式化纯函数加可选 self 参数(runtime/src/collab/board.ts);app 层 board-tool 从执行上下文取调用者身份(房间回合的 agentId / work 会话的 collab.agentId)传入。用户视角(CLI、看板面板、无 agent 上下文)渲染不变。
2. **taskFacts 措辞收紧**(runtime 纯逻辑):「你名下的任务:#id「标题」(进行中)」→「…——你正在工作会话里执行」;受阻态「…——你的执行受阻」。让"后台 worker 就是你自己"成为字面事实。
3. 单测:digest self 替换(assignee=self / 非 self / 多任务混合)、工具结果视角、taskFacts 新措辞;既有测试更新。
验收(主导者真机):复现同场景(用户问任务进展)→ 汇报应为第一人称(「我正在做/我这边跑了一阵」),他人任务仍第三人称。

### W11 房间消息整条落地(2026-07-28 用户实锤:IM 没有流式消息)
背景:房间里 agent 回复仍逐字流式渲染——真实 IM 里消息永远整条到达,流式是"AI 聊天应用"的形态,交互级 AI slop(§3.6 已补禁则)。typing 指示本来就是为这个节奏设计的:亮着 → 整条弹出。
1. **房间隐藏在飞消息**:kind='room' 的投影里,`assistant && agentId && isStreaming` 的消息**整条不渲染**(room-grouping 的 isRoomHiddenMessage 加一条;现有"流式中不读 content"的性能纪律天然满足——isStreaming 是布尔不挂 chunk)。流终局 isStreaming 翻 false → 消息整条进列表。
2. **连带简化**:pass 未定窗的 '…' 持留行在房间不再会出现(流式期间整条隐藏,落定 pass 本就被过滤)——silent pass 的 UX 变成"typing 亮过又熄了,没有消息",正是 §5 设计过的"输入了又删掉"语义;MessageItem 的 hold 分支保留但房间路径不再命中(勿删,防其它入口)。
3. **范围**:仅房间。work 会话(工作视图)与普通会话流式照旧;错误消息/中止后的部分消息(isStreaming=false)照常整条出现。
4. 单测:room-grouping 流式隐藏矩阵(streaming agent 隐/终局现/用户消息不受影响/work 不受影响);滚动锚定(消息整条弹出时列表跟底)人工走查确认。
验收(主导者真机):@小李 提问 → 流式期间消息区**无任何部分内容**、typing 行亮 → 流结束整条弹出;工作会话流式不变。

### W13 后置项批次一(2026-07-28 用户指令:有方案的后置项开工)
五个独立小项,均有明确方案:
1. **worker 交付前 typing**(§2.4 可选项转正):worker.ts harvest 组装回贴时 emit typing(assignee, true),postAgentMessage 落地后 emit false。不加人工延迟——窗口短就短,价值是"每次 agent 发言都有 typing 前导"的一致性。
2. **Agent 主动引用**(§3.5A 后续项转正,设计决策定稿):激活记录已知触发消息 id(mention 的来源消息/判定轮的消息 M);房间驱动的回复流终局后,若触发消息与回复之间隔着 ≥1 条可见消息(不含被过滤的机制消息),协调器**事后补挂** replyTo 快照(store patch + message:updated 广播,复用 W8 更新链;不改引擎)。紧邻回复不挂(引用紧上一条是噪声,IM 里没人这么干)。确认两处:renderer 的引用块渲染对 assistant 消息生效(W7 若只做了用户消息则补);投影两处对带 replyTo 的 agent 消息输出 `> 作者: 摘录` 前导行。
3. **usageSource 透传**(父文档 P1 可选触点,收窄落地):core 的 SendMessageCommandLike 加可选 usageSource 字段(类型层,core 零依赖不变),agent-loop-executor 记账时用它替代硬编码 'chat'(缺省仍 'chat');协调器房间驱动传 'collab-room'、worker 传 'collab-work'。**预算归因不切**(sessionId 集合归因已工作,切换无用户价值有回归风险)——本项只为 usage 面板成本可见性。
4. **board 广播节流**(父文档 §10.9 转正):board-store 的 collab:board-changed 按房间 30ms 尾沿合并(timer+最后快照赢,browser tabs-changed 先例);单测:burst N 次变更 → 1 次广播且为终态。
5. **房间花费可见**(预算面板最小形态):RoomSettingsDialog 日预算栏位下加一行墨灰:「今日已用 $X.XX」(复用协调器预算水位的同一账本聚合,开浮层时取一次,不做实时刷新)。
仍后置:任务 deps 拓扑、站会调度、房间/任务维 grant(需先出设计,尤其 grant 涉权限安全面);消息送达态维持非目标(本地 agent 无送达失败语义,typing+W11 整条落地已覆盖节奏表达)。

### W15 房间视觉节律修复(2026-07-28 用户真机实锤"特别严重",优先)
§3.6 三条新规格的落地:①固定间距表(全行类型归一,禁组件自带 margin 叠加);②agent 消息换用户同款气泡框(头像署名框外,左墨线方案废止,含组内堆叠态的框样式);③房间系统通知行改居中痕迹行(禁通用系统卡)。范围仅 kind='room' 呈现;普通会话零改动。验收:主导者截图逐间隙量像素+对照三规格。

### W16 看板可操作(2026-07-28 用户真机实锤"看板根本移动不了")
现状:CollabBoardPanel 是 P1 的只读视图。补:①新 IPC `COLLAB_BOARD_ACT`(五触点,{roomSessionId, action} 透传 reducer 动作,actor=user——W9b 的 byUser 闸/halted 计数天然尊重用户动作);②面板卡片操作:拖拽跨列(或先做卡片菜单:move 到各列/assign 成员/标记完成,拖拽可后置)+乐观并发(带 rev,冲突提示刷新);③受阻卡显示 blockReason/haltedCount、done 卡显示执行证据(W9b 字段已在,面板补渲染)。样式画线风,§3.6 约束。

### W17 交付物集中管理(2026-07-28 用户需求"交付要能集中查看管理")
设计:交付物 = work 会话真实产出的文件。①harvest 收集:从 work 会话 toolCalls 提取 write/edit 目标路径(去重,workingDirectory 相对化),存卡 report.evidence.files[](纯代码统计,与工具计数同源同不可伪造);②看板卡详情渲染交付物文件列表(点击 reveal/打开);③看板面板加「交付物」聚合视图(按任务分组的全房间文件清单)。依赖 W16 的面板改造,排其后。

### W8b 回应归属 popover(2026-07-28 用户需求"表情回应要能知道是谁做的")
现状:chip 只有原生 title 提示。改为:hover/点击 reaction chip → 轻量 popover 列出该 emoji 的全部回应者(每行:头像章 + 名字;用户显示「你」;agentId 在 roster 查不到的回落 id)。多 emoji 各自 chip 各自 popover。§3.6 规格:纸面浮层、1px 墨线、圆角 ≤6px、无阴影堆叠、11-12px 字号;复用既有浮层定位先例(ContextMenu/react-picker 的 teleport 定位),不造新组件库样式。数据即 reactions[].by[](W8 已聚合存储,零后端改动)。触发建议 hover 300ms 延迟出、移开即收(点击保留给 toggle);移动端/触屏不考虑。排在 W15c 之后(同文件面)。

### W19 真实 typing(2026-07-28 用户点题:"这种模式下 typing 应该可以改为真正的了")
v5 架构红利:发言=say 调用,而工具参数流式基建(tool 参数真实化期)让"正在打字"有了物理对应——**say 调用的参数流出期间就是真输入**。
1. **信号源切换**:废除"入队即亮"的模拟信号;改为观察执行会话(与 work 会话)的流:say 工具调用的参数开始流出 → emit typing(agentId, true) 到目标房间;该调用参数流完(tool:input-end/执行) → false。多次 say=多次真实脉冲;思考阶段安静(真人思考时你也看不到 typing)。
2. **房间解析**:参数未流完时 room 未知,按会话绑定房间点灯(执行会话的驱动目标/work 的父房间);显式跨房 say 的短暂误点接受并注释。
3. **兜底**:回合终局对该 agent 强制 false(清残留);60s TTL 前端容错保留;W2 的 renderer 侧零改动(同一事件)。
4. 单测:chunk 序列→emit 序列矩阵(单 say/多 say/无 say 全静/思考间隙不亮)、终局清灯、房间解析;变异锁信号源(入队路径不再 emit)。

### W20 侧栏 Agent 分组(2026-07-28 用户需求:"先来一个 agent group,让我能看到 agent 的 session")
agent 页面的第一片:执行会话从"完全隐藏"改为"侧栏专组可见"。
1. 侧栏新分组「Agent」(群聊分组同款画线风,位于群聊组之后):列出全部 kind='agent' 执行会话,行=agent 头像章+名字(从 agents store 取现名,不显示「[执行]」前缀),按最近活跃排序;无执行会话时整组不渲染(不出空组)。
2. 可见性调整:执行会话仍不进普通/未归类列表与归档列表(W18 的过滤保留),仅经由 Agent 分组入口;点击=正常开 tab 看会话。
3. 执行会话视图=原始转录直读(不做房间过滤:驱动行/思考/工具面板全部可见——这正是"看执行过程");流式照常(实时看 agent 思考)。**composer 禁用**(kind='agent' 时隐藏输入框或 mutationsDisabled 同款:用户注入会污染回合历史;将来要对话另设计)。
4. tab 标签显示 agent 名(头像+名),与房间 tab 同族。
§3.6 约束照旧。后续(不在本单):结构化执行时间线视图(真正的 agent 页面)。

### W21 闲聊风暴抑制(2026-07-28 用户真机实锤"一直在重复发消息")
现场:用户一句 "hi" → 5 条 agent 消息,同一 agent 三次发言(hi → "两个人都 hi 完了我也不装矜持" → 再 @ 人调侃)——级联判定 + 话痨 persona 的自选循环,链闸 K=8 兜得住底但寒暄风暴体感极差。两个结构性抑制(机制层,persona 零改动):
1. **发言冷却**:自选(self-elected)判定跳过"最近 K_cd(默认 2)条可见消息中已有 say"的 agent——刚说过话的人没有新输入就别抢话;被 @ 与 task-event 不受冷却限制(点名必须能应)。实现在协调器判定候选名单过滤(纯逻辑进 collab/,可测)。
2. **自选链上限**:CollabActivationReason 为 self-elected 的激活受更紧的链上限(默认 4,链长过半即闭嘴),mention/task-event 仍走 K=8。语义:agents 自发聊天最多几句,人类插话/点名随时重开。
验收:同场景("hi")agent 回应 ≤2 条且无同 agent 连续自选;被 @ 者冷却期内仍应答。

### W22 判定即承诺——stay_silent 退役(2026-07-28 用户实锤"一直在调用 stay silent",严重)
现场:执行会话统计 agent-63ac 4 回合 77 次 stay_silent、agent-eba0 2 回合 61 次——**回合内死循环**(模型调 stay_silent→结果文本劝"直接结束"→模型不肯空响应收尾又调一次→循环到超时,每圈一次全上下文调用,烧钱)。架构根因:沉默已在**判定层**表达("要说话"才驱动回合),回合内再设沉默选项=双重决策+循环面。
1. **stay_silent 整体退役**:builtin/工具面/情况说明全删(W18b 引入仅数小时,无历史包袱);相关测试改写。
2. **首次调用强制指定 say**(named function forcing,取代 required):判定/被 @/任务事件驱动的回合,天职就是发言——首调用必然产出一条 say;此后 auto(可续 say/board 或以思考正文自然收尾)。配对规则(全程关思考)不变。
3. **回合工具调用断路器**(结构性防线,任何工具循环失控的兜底):房间激活回合内工具调用总数上限/say 上限,超限 abort 本回合并贴执行会话记录;work 会话不设(有正经长活,墙钟已兜)。上限**房间可配置**(默认 40 调用 / 20 say,W22a 由 12/6 上调),0 = 关闭。
4. nudge 保留为不支持 forced 的 provider 兜底路径。
验收:同场景零 stay_silent(工具已不存在)、判定 true 必得 ≥1 条 say、断路器变异锁。

### W22a 断路器上限可配置(2026-07-28 用户实锤:一轮 7 条发言被断路器掐掉)
现场:用户正常的一轮 IM 连发(7 条)撞上 say 上限 6,回合被 abort。根因不是机制,是**定标**——12/6 是死循环当天下午拍的,量的是"出错的回合"而不是"最长的正常回合",于是一个本该只在事故里出现的兜底变成了日常行为。
1. **默认上调 40 调用 / 20 say**:兜底防的是数百圈的死循环(事故实测 220 次调用),几十次的余量对它没有代价;7 条连发写成 误伤锁 用例。
2. **两个上限进房间设置**(`budgets.maxTurnToolCalls` / `maxTurnSayCalls`,复用既有 `COLLAB_ROOM_SET_BUDGETS` 通道与设置面板),**0 = 关闭**——与日预算/maxChain 同一约定,一个数字同时覆盖"调高"和"去掉",没人需要再改常量。
3. **失效向"关闭"倾斜**:负数/NaN 一律读成不限而非零上限(值来自 number input 与 IPC 边界,一个畸形设置若读成"上限 0"会把房间每个回合的第一次工具调用就掐掉)。这与 P2-15 计数口径"宁可多计"方向相反且都对:计数不许静默失明,配置不许静默变严。
4. 上限在**回合窗口打开时**读取(与其它房间闸同源);两个上限都关时**根本不订阅**事件。
教训:结构性兜底的阈值必须按最长的**正常**用例定标,而不是按事故定标——按事故定标的兜底迟早会以行为的身份被用户撞见。

### W23 重启幂等加固(2026-07-28 W17 验收现场发现:强退后重启重复执行任务)
现场:验收流程"跑完立刻 kill"复现了崩溃窗口——节流异步的 state.json(水位+激活记录)未落盘,重启对账把已消费的消息重放:同一指令建了第二张卡、worker 重复执行。sourceMessageId 去重依赖的正是丢失的 state 文件。
修法(以持久转录为真源,不依赖 state):
1. **驱动消息携带 sourceMessageId**(执行会话里的驱动消息加字段,持久化即免费的幂等账本);
2. **对账去重两级**:state 记录(快路径)→ miss 时扫执行会话近段转录查同 sourceMessageId 驱动(慢路径,boot 一次性);命中即视为已消费,水位補推进;
3. **关键点同步 flush**:激活记录创建与 harvest 后的 state 持久化改为强制 flush(量小频低,不影响流式节奏);
4. 兼容:旧驱动消息无字段按现状(可能重放一次,自愈)。
验收:跑任务→harvest 完成后立刻 kill→重启→零重复驱动/零新卡。

### W4 收尾回归
- 全量门禁(vitest/typecheck/boundary:gate)
- CLI 端到端自测复跑(闭环:目标→建卡→执行→交付→评审→done)+ 新增自主响应场景
- 文档:本文件补"实施状态"注记;父文档索引本文件

## 4.5 v4 演进:Agent 通信抽象(2026-07-28 用户定向:说话即行动 / 身份 id / 送达态)

> 用户原话理由:①网络问题会导致发送失败,后续消息可能发送给 channel;②agent 抽象不够——他应该具有**发消息的能力**,而不是"调用大模型直接返回结果"的能力,大模型返回结果是他的**思考过程**,不是他要说的话;③agent 身份 = name + id,id 创建时生成且唯一,此后所有 @名字 操作都带上 id。

### 核心转变:思考与发言分离(说话即行动)

现状:房间驱动的 assistant 流**就是**发言;pass 靠 `[pass]` 哨兵;送达态无处安放。目标:**LLM 回合 = 思考;发言 = 显式动作(工具调用)**。

- **新工具 `say`**(app 层,permissionGuard safe):参数 `{ content, mentions?: agentId[], replyTo?: messageId }`。房间回合工具面 `['board']` → `['say','board']`;work 会话工具面并集 say(worker 获得**任务中途向群里说话**的真实能力,交付协议不变仍走 complete 收割)。
- **发言消息**:say 执行器持久化为房间 assistant 消息(agentId 署名,source 标记 `'say'`),带 delivery 字段(见下);一回合可 say 多次(IM 短句连发,W3 分组天然承接)。**replyTo 参数原生支持 agent 主动引用**(取代 W13.2 的事后补挂方案——W13.2 已实现的 patch+广播链路复用为 delivery 状态更新通道)。
- **思考消息**:回合自身的 assistant 消息(思考文本+board 调用)**不再是发言**——房间 UI 折叠为一行痕迹级"思考过程"(可展开,审计原则:过程可见但不冒充发言;board 动作另有系统行+看板双通道);投影与意愿窗口**排除**思考消息,只投 say 消息;链长只计 say。
- **pass 退役**:不调用 say = 沉默,`[pass]` 哨兵协议与首行门整体删除(isCollabPassMessage 仅保留渲染历史);"输入了又删掉" = typing 亮过而无 say。
- **意愿判定保留**:仍是廉价前置闸(否则每条消息都要为全员起全上下文回合);判定 true → 驱动回合 → 回合内自主决定 say 什么、说几条、还是最终沉默——两层自主。
- **typing 不变**:入队 true,回合终局 false;say 落地时 typing 可继续亮(还在打下一条,IM 自然)。
- **冻结/预算的强制点收拢进 say**:房间 frozen/超预算时 say 返回失败——agent **亲身知道**自己的话没发出去(今天就有真实的送达失败语义)。
- **持久化兼容**:旧转录(流即发言)照常渲染与投影(按无 source:'say' 的历史 assistant 消息处理);新旧判定靠 source 标记,不迁移数据。

### 身份 id 化(mention 携带 agentId)

- 数据:消息可选 `mentions?: Array<{ agentId, label }>`,创建时点固化(label=当时显示名,rename 后按 id 从 roster 取现名渲染)。
- 用户路径:composer member token 内嵌 id({{page:tabId}} 先例:token 携带 `{{member:<agentId>}}`,显示 @名字,发送时物化 mentions[] + 正文渲染纯文本 @名字);裸打 @名字 仍按名字在 ingress 解析并**盖 id**(兼容)。
- agent 路径:say 的 mentions 参数直接收 id;正文里的 @名字 由协调器名字解析兜底盖 id。情况说明的 @机制事实更新为"@名字(系统会带上成员 id)"。
- 消费:激活/短路判定优先走 mentions[] 的 id,名字文本解析降级为兜底;重名/改名安全。

### 消息送达态

- 数据:消息可选 `delivery?: { state: 'pending'|'sent'|'failed', error?, at }`(将来接 channel 转发时扩展为 per-target 数组)。
- 今日真实失败源:say 被拒(frozen/预算)、ingress 拒入;将来:gateway channel 网络失败。
- UI(§3.6 口径):**正常送达零装饰**(IM 惯例,不画对勾噪声);pending 一枚 2px 墨点呼吸、failed 红点+「重发」痕迹级操作(用户消息与 agent 消息同规格;agent 消息的失败在其思考痕迹行也可见,它自己可重试)。

### 工单切分(W13 收尾后串行)

- **W14a 身份 id 化**(独立先行):mentions[] 数据+双路盖 id+激活消费切 id+composer token 内嵌 id。
- **W14b 说话即行动**(核心):say 工具+思考/发言分离+pass 退役+思考痕迹行 UI+链/投影/意愿窗口/typing 适配+冻结预算收拢。**含交付自主化(2026-07-28 用户实锤"交付像程序编排的 trigger,不是 agent 自主行为")**:harvest 的代笔摘要贴文退役,worker 完成时**自己用 say 向群里交付**(任务简报引导:交付时 say 关键结论并 @负责人);task-event 评审激活与看板流转机制不变,变的只是"话由 agent 自己说"。worker 无 say 产出时 harvest 兜底贴系统行(非冒名发言)。
- **W14c 送达态**:delivery 字段+say 失败语义+异常态 UI+重发。
- **W14d say 采纳 nudge**(W14b 真机验收揪出的行为悬崖):回合终局 0 次 say 调用 + 思考正文非空 + 本回合没 say 被拒 → 同一激活最多一次事实提醒重驱动;nudge 轮可说可沉默,沉默即终局沉默。
- 后续(不在本批):gateway channel 转发与 per-target 送达、思考过程独立审计面板。

## 4.6 v5:Agent 执行会话分离(2026-07-28 用户定向,取代 v4 的"回合寄宿房间+纪元标记"形态)

> 用户原话:"一个群聊里只有 message。我们要把 agent 抽象出来,干活、思考都在自己的 session 里干,说话调用工具 say,say 到哪个 room。"

**目标形态**:
- **房间 session = 纯消息流**:只含用户消息、say 投递进来的 agent 发言、协作系统公告。驱动消息、回合宿主(思考)、工具调用记录**一概不再写进房间**。
- **Agent 执行会话**:每个 agent 一个常驻专属 session(kind='agent',按 agentId 派生稳定 id,惰性创建,不出现在会话侧栏——隐藏会话先例照 scheduler)。该 agent 的一切房间响应回合都在这里跑:驱动注入到这里、思考正文与工具调用落在这里。这就是将来"agent 页面"的数据源(执行过程可视化,后续单独做,本期只保证数据成型)。
- **say(room)**:工具签名扩 `room?: roomSessionId`(单房间激活时默认=本次驱动的目标房间,显式传参为多房间留门);执行器把消息投进目标房间 session(collab-say,署名/mentions/replyTo 语义不变)。
- **模型输入不变**:回合的 prompt 仍= persona 原文 + 情况说明 + 目标房间 IM 投影(v3 铁律不动);agent session 的自身历史**本期不进输入**(它是执行记录;"agent 连续自我记忆"是后续演进,显式后置)。
- **不变的部分**:意愿判定、typing、链长(计房间里的 say)、看板/worker/harvest/证据、W14d nudge(nudge 注入点随驱动一起搬进 agent session)。
- **兼容**:旧房间转录(含 collab-turn/旧纪元发言/驱动行)照旧渲染,渲染层的机制过滤降级为纯 legacy 服务;新回合不再产生需要过滤的房间内容——房间投影随之大幅简化(房间即投影)。
- **收益**:房间 JSONL 瘦身(不再堆思考);投影/渲染双侧的"过滤机制"从常态变成遗留;agent 成为有自己执行空间的一等实体。

### 工单
- **W18 执行会话分离**(核心):agent session 创建与隐藏、驱动路径改道(coordinator 驱动 agent session,携带目标房间上下文)、say 房间路由、nudge 随迁、链长/级联/typing 对齐、旧转录兼容确认。
- 后续(不在本期):agent 页面(执行过程可视化)、agent 自身历史进输入(连续记忆)、多房间并发激活语义。

## 5. 风险与决策记录

- **成本**:每条消息 N-1 次判定小调用(~1.5k tokens/次)。5 人房间一条消息 ≈ 6k tokens 判定开销,deepseek 量级 <$0.01;预算闸兜底。可接受。
- **判定质量**:persona 原文驱动判定,风格自然(工程师对技术问题想说话,研究员对闲聊沉默)。判定失误的代价不对称:误沉默(用户再 @ 即可,@ 是确定性短路)< 误发言(链闸+预算兜)。
- **typing 与实际回复的落差**:判定 true 但完整回复 pass → typing 消失且无消息,等同真人"输入了又删掉",IM 语义自然。
- **两段调用的语义漂移**:判定说回、正文却 pass——接受,以正文为准。
- **移除 default-responder** 是行为变化:老房间的 pmAgentId 仍存在但只作为"负责人"事实进判定提示。

## 6. 实施状态

**W23 已实施(2026-07-28,未提交;+22 测试,4733 → 4755,真机验收待跑)**:重启幂等加固。**工单对丢失窗口的判定被证伪,已按实测改写**。

- **真实丢失窗口(结论先行)**:`state.json` **从来就是同步原子写**——`persistRoomState` → `writeJsonFile` = `writeFileSync` + `renameSync`,不排队不节流(`board.json` 同理)。工单第 3 条"节流异步的 state.json 未落盘"不成立,"改成强制 flush"无对象可改。实测取证:直接读 `~/.onething/collab/*/state.json`,6 个房间的水位与激活记录**全部完好地熬过了用户的每一次强退**,每个水位都仍能在自己的转录里解析到。真正异步节流的是**会话转录**(`saveThrottleMs ?? 300`,`fs.promises` 后缀写)——所以耐久性差是**反的**:state 永远跑在转录**前面**,不会落后。
  **那么重复从哪来**:快路径本身是**有损**的,与落盘无关。两件事叠加——(a) `persistRoomState` 把 `activations` 截断到**最近 50 条**;(b) 终局的**失败分支**(回合什么都没持久化)**不推进水位**。于是一个够忙的房间会走到"命名某条消息的记录已被挤出、而水位还停在它后面"的形态,启动对账认不出它已被应答,于是重放:同一指令第二张卡、worker 双跑。现网证据:`0bf0f6bc` 房间 32 条记录里 **19 条 failed**——这个不推进水位的分支在真实使用中是高频路径,记录淘汰赶上水位停滞只是时间问题。
- **两级去重**:快路径(state 记录)一字未动;`reconcileRoom` 在它 miss 时走慢路径——扫本房间**各成员执行会话**(W18 后驱动都落在那儿)+ 房间自身(pre-W18 内联驱动的同一扇门,今天扫出来是空)的**尾部 100 条**,收集已出现的 `collabSourceMessageId`。命中即视为已消费:**补推进水位到那条房间消息**,于是下一次启动连扫描都不用付。慢路径只在 boot、只在快路径落空时跑。
- **字段选型**:`collabSourceMessageId`,与 `replyTo` 完全同级的**具名透传**——`SendMessageCommand` → 核心引擎 `SendMessageCommandLike` → 逐字落到驱动的 user message 上(`core-stream-engine.ts` 的 `replyTo` 那一行旁边),引擎自己从不读它。选它而非"消息自定义字段"是因为这条链路**已有先例且已被注释锁死**("nothing else on the command may ride into storage without its own line here"),渲染层不认识它因而零影响。**持久化即免费账本**:转录没有 50 条上限,这正是它能兜住快路径的原因。
- **nudge 同 id**:nudge 走的就是同一个 `emitDrive`,字段自然同 id——一次激活、一条被消费的消息,无论跑了几轮。**task-event 激活刻意不带字段**(它背后没有房间消息,凭空盖章会让账本消费掉没人应答的消息)。
- **偏离**:①工单第 3 条改为**记录并加注**而非改代码(入队即持久化本就在 `enqueue` 里同步落盘、harvest 终局亦然;真实病因是 50 条上限,提高上限只是把悬崖往后挪,故不动);②慢路径**连房间自身一起扫**(工单只说执行会话)——pre-W18 房间的驱动在房间里,多这一趟零成本且让旧形态走同一扇门;③命中后**补推进水位**是工单明写的,实现上落在 `persistRoomState` 之前,于是这一次启动就把账结清。
- **观察(未动,下一个根因候选)**:`handleRoomUserMessage` 里 `await electWillingSpeakers(...)` 是数秒级的判定轮,期间 state 对这条消息**毫无记录**(记录要等判定返回才建)。此窗口内被杀会重放该消息——但那一刻确实什么都没驱动过,重放是**正确**行为,不产生重复。真正要担心的是它的反面:**丢激活**而非**重复激活**,不在本工单射程内。
- **门禁**:vitest **4755 passed / 1 skipped**(+22:纯逻辑 `collectConsumedSourceIds` 矩阵 10 条含"非驱动不认账"变异锁,协调器真重启 12 条含两级去重矩阵/字段携带/nudge 同 id/flush 时机)/ typecheck 0 / boundary:gate 无新红(自愈 2 条)/ 改动文件 eslint 干净(`core-stream-engine.ts` 1 条 warning 为改动前既有)。**变异验证**:把慢路径短路成 `false` → level-2 三条用例立刻红。

**W21 已实施(2026-07-28,未提交;+17 测试,4672 → 4689,真机验收待跑)**:闲聊风暴两道机制闸,persona/情况说明零改动。
- **发言冷却**(新纯逻辑 `collab/cooldown.ts`):`filterCollabSelfElectCandidates(candidates, messages, K_cd=2)` —— 最近 2 条**投影可见**消息里留了话的成员,在 `electWillingSpeakers` 组装候选名单时就被剔除(判定调用都不花)。mention 在 `decideCollabActivations` 就短路了、task-event 由工作管线入队,两者都到不了这个过滤器,所以「点名必须能应」由构造保证。窗口按**任意作者**的可见消息计数——人说一句就把 agent 自己的话往后顶一格,冷却靠"被搭话"解除。
- **可见性口径复用**:新 `isCollabProjectedRoomMessage` = 模型口径(驱动/思考/`[pass]`/运营系统噪声/空正文全滤,放行 W9.1 标记系统行),`buildWillingnessWindow` 改用同一判定,两处不会再各自漂移。与 `reply-quote.ts` 的 `isCollabVisibleRoomMessage`(渲染口径,运营行也算一行)是两把不同的尺,注释里点明了分工。
- **自选链上限**:`resolveCollabChainCap(reason, maxChain)` —— self-elected 取 `min(4, maxChain)`(`COLLAB_SELF_ELECT_MAX_CHAIN`,房间配得更严则更严),mention/schedule 走房间原 K,task-event 仍豁免(Infinity)。落两处:驱动时闸(按 record.reason 分档)+ 级联里"要不要为这一轮判定花钱"的前置闸(那一轮只产自选激活,所以用自选档)。
- **偏离**:超上限的**自选**记录改为**丢弃**(stage=failed)而非 requeue-wait 挂起。理由两条——(a) 自选是对某一条消息的冲动,挂起会让它在用户重新开口后**过期重放**,正是 W21 要消灭的"重复发消息"手感;(b) 串行队列 requeue 会 break 循环,队头挂一条闲聊就把后面的 @ 与交付评审一起堵住(上限收到 4 后这概率大增)。mention/task-event 仍是义务,照旧挂起等人说话。「我先按住了」系统行因此只属于硬上限,自选闭嘴静默发生。
- **观察(未动)**:同一成员可能在"已入队未发言"时被下一轮级联再次选中(`exclude` 只含 mention 激活),冷却拦不住尚未落地的那条。真机若仍见同人两连发,这是下一个根因候选。

**W22 已实施(2026-07-28,未提交;+19 测试,4689 → 4708,真机验收待跑)**:判定即承诺——stay_silent 退役 + 首调用指名 say + 回合断路器。
- **退役清单(连根)**:`tools/builtin/stay-silent.ts`、`app/collab/stay-silent-tool.ts`、其单测三个文件删除;`tools/index.ts` 导出行、full/headless 两档注册表、`collab/index.ts` 三个常量 + `countCollabStaySilentToolCalls`、`COLLAB_ROOM_TOOLS`(→ `['say','board']`)、roster 情况说明的事实行与工具清单行,全部移除。`shouldNudgeCollabSay` 的 `staySilentCallCount` 参数与分支随之删除。W18b 引入仅数小时,确认无历史转录依赖。
- **首调用指名 say**:驱动改带 `initialToolChoice: { type:'function', function:{ name:'say' } }`。core runner 的 `resolveTurnToolChoice`/`isForcedToolChoice` 本就支持 named(named 会先校验工具在册,不在册降为 'none'),**配对规则(强制⇒全程关思考+撤 reasoning_effort)按 forced-ness 判定,named 自动覆盖**,已补变异锁测试(named + thinking:enabled 两轮全 disabled)。
- **provider 映射结论**:deepseek / openai-compatible = Chat Completions 原样透传 `{type:'function',function:{name}}`(deepseek 已加线上 wire 断言);claude = `{type:'tool',name}`;gemini = `mode:'ANY' + allowedFunctionNames:[name]`(W18b 只覆盖了裸 ANY,named 档补测);**codex 是唯一需要改代码的**——Responses API 的 named 形态是**扁平**的 `{type:'function',name}`,原实现 `request.toolChoice ?? 'auto'` 直传会 400,已加 `toCodexToolChoice` 映射。能力位缺席的 provider 由 core 静默丢弃,回落 W14d nudge。
- **类型链拓宽**:`'required'` 字面量在五处收窄了链路(shared 命令 / core 引擎+执行器 / app 引擎三处),统一为 `SessionInitialToolChoice`(shared,自带结构定义不引入依赖)与 `CoreInitialToolChoice`(core,`export`ed from `@onething/core/engine`),都只允许 `'required' | {type:'function',...}` —— 'auto'/'none' 是循环自己的默认值,不该搭驱动的车。
- **回合断路器落点**:纯逻辑 `collab/circuit-breaker.ts`(总数 12 / say 6,常量导出);接线在协调器 `driveActivation`,与 W19 typing 观察器**同窗口同拆卸纪律**(agent 锁内挂、finally 卸)。计数口径 = `tool:execution-start` 按 `toolCallId` 去重(唯一每家 provider 都发的事件,且在结果回喂模型之前,掐掉的正是下一次全上下文请求);超限走既有 `engine.abort(agentSessionId)`,并**先**在执行会话贴一条可读系统行(房间不贴——房间是消息流,断路器是机械)。上限是**最大值**语义(第 13 次/第 7 条才断),误伤锁测试钉死。
- **驱动机械行**:`(发言=调用 say 工具,可多次;不发言=直接结束。这一轮的正文谁都看不到。)` → `(你的发言通过 say 工具送出,可多次;说完直接结束。)`——不再提"不发言",判定层已经决定了。
- **偏离**:无。断路器选择协调器层而非 agent-loop 层(侵入最小:core 不需要知道 say/房间,且复用既有 abort 通道与既有观察窗口)。

**W20 已实施(2026-07-28,未提交;+11 测试,4661 → 4672,真机走查待跑)**:侧栏 Agent 分组 = agent 页面的第一片,执行会话从"完全隐藏"改为"一扇门可见"。
- **数据源**:store 只加一条列表(`agentSessions` = `kind==='agent'`),W18 的两处过滤(`filteredSessions` / `archivedSessions`)一个字不动——所以执行会话依旧进不了今天/昨天时间组和归档,新分组是它唯一的入口。排序(最近活跃优先)归呈现层,store 保持"只滤不排"。
- **呈现规则收敛成一个纯模块**(`packages/renderer/utils/agent-sessions.ts`):三处消费者(侧栏组 / tab 标签 / composer 闸)共用同一套"哪些进组、叫什么、算不算执行会话"。名字取 **agents store 现名**(会话名在创建时就冻住了,改名必须显示出来),roster 查不到才回落到会话名去掉「[执行] 」前缀;查找按 id 且**不落到 default agent**(顶别人的名字比顶个旧名字更坏)。前缀不再抄第二份:runtime 侧补 `stripCollabAgentSessionName`,与 `collabAgentSessionName` 同源。
- **composer 禁用**取"不挂输入框"而非 mutationsDisabled(后者是消息行的操作闸,composer 不在它的作用域),位置留给一行淡字说明——输入框凭空消失会像坏了。权限面板/目标条照常留在 composer 容器里(执行会话里真的会有待批权限)。`isAgentExecutionSession` 进了 `v-memo` 依赖,否则会话列表异步到货时闸门不会重算。
- **视图无需改动**:`isCollabRoomActive` 只认 `kind==='room'`,执行会话天然走 identity 分支——驱动行/思考/工具面板全可见,正是"看执行过程"。
- tab 标签:TabItem 加可选 `avatar`(有则替掉通用图标,占同一格不改排版),TabBar 只为 `kind==='agent'` 的签建条目,普通签一条都不进那个 map。

**W23 ✅ 验收通过(2026-07-28)**:Opus 5 实现,Fable review。**前提证伪的教科书案例**:工单假设"节流异步 state.json 丢盘"——实测 state 写入从来同步原子(writeFileSync+rename),真因=激活记录 50 条截断+失败分支不推水位(用户房间 32 记录 19 failed,热路径,截断追上只是时间问题)。修复(以持久转录为真源):驱动消息携带 collabSourceMessageId(replyTo 同级具名透传)、对账两级去重(state 快路径→miss 扫成员执行会话+房间尾段 100 条,命中補推水位下次零扫描)、task-event 激活无源消息故不带字段。+22 测试,变异锁"非驱动不得消账"。真机 kill-replay:done 后 pkill -9 硬杀→重启→卡恰一张、开始执行恰一条,零重放。三处偏离全部接受(尤其:判定窗口内被杀的重放是**正确**行为——没驱动过,重放不重复)。

**W17 ✅ 验收通过(2026-07-28)**:Opus 5 实现,Fable review。交付物集中管理(+25):harvest 与工具计数同遍历同口径提取 write/edit 目标路径(优先引擎已解析的 changes.filePath,拒猜 bash 产物,200 条上限,相对化到房间 workdir)→ report.evidence.files;卡面 3 条+N(按钮外兄弟节点解嵌套 button)、面板「交付物 N」聚合视图(按任务分组);打开复用 shell:open-path,无 workdir 不猜并说明。五处偏离全部接受。真机:派真任务→文件落盘→board.json evidence.files 上卡→面板「交付物 1」与文件行渲染实证(首轮探针 querySelector 抓到看板按钮的乌龙已澄清)。**验收现场附带发现重启重放 bug**(强退丢 state.json→已消费消息重放→重复建卡执行)→ 立 W23 修复中。

**W22 ✅ 验收通过(2026-07-28)**:Opus 5 实现,Fable review。stay_silent 连根退役(引入数小时即因回合内死循环被拔:单 agent 数十次连环调用烧调用数——沉默在判定层已表达,回合内沉默按钮=双重决策+循环面);首调用改 named forcing 指定 say(codex 扁平形态坑已补 toCodexToolChoice;claude/gemini named 档补齐;类型链收窄 SessionInitialToolChoice);回合断路器(12 调用/6 say,tool:execution-start 按 id 去重计数——掐在结果回喂之前,省的正是下一次全上下文请求;超限 abort+执行会话留痕,房间零痕)。+19 测试。真机 wire 级验收:首请求 tool_choice={type:function,name:say}+thinking disabled、后续 auto+thinking 保持关、注册表 19 工具零 stay_silent、两次 say 脉冲两条气泡、回合干净收尾。损失盘点:死循环期执行会话 220 次调用共 $0.032(deepseek 低价+预算闸远未触发,调用数是主要伤害)。

**W20+W21 ✅ 验收通过(2026-07-28)**:W20 侧栏 Agent 分组(+11):agentSessions getter/共享纯模块(现名解析不回落默认 agent)/群聊组同款样式(逗号选择器防漂移)/composer 换「执行会话 · 只读转录」说明行/tab 头像章;真机:Agent 组+🔧小李行可见、执行会话转录直读、composer 禁用。W21 闲聊风暴抑制(+17):发言冷却(最近 2 条可见消息内 say 过者剔出自选判定,@/task-event 不受限;可见性口径统一为 isCollabProjectedRoomMessage,willingness 窗口同源)+自选链上限 4(mention 8/task-event 豁免,resolveCollabChainCap 单点分档);偏离裁决:超限自选**丢弃**而非挂起(闲聊冲动挂队重放正是要消灭的重复感,且队头寒暄会堵死 @ 与评审)——接受。真机:"hi" 场景判定调用恰一次(小李冷却剔除实证)、阿明判定不接话、零风暴。观察项(候选下一根因):已入队未发言者可被下一轮级联再选中,真机若见同 agent 两连发从这查。事故背景:用户房间一句 hi → 5 条 agent 消息、同 agent 三连发。

**W19 ✅ 验收通过(2026-07-28)**:Opus 5 实现,Fable review。真实 typing——信号源从"入队即亮"(模拟)切到"say 参数流出即亮"(物理):纯 tracker(Set<toolCallId> 防并发闪烁)+窗口内观察器(锁内挂/finally 卸,无全局常驻),思考段安静、board/stay_silent 不亮、多 say 多脉冲、终局强制清灯;W13.1 执行器补灯清理为死代码。+21 测试。真机节奏曲线:安静 3.8s→亮 0.8s→气泡①→再亮 1.0s→气泡②——两条消息两次真实脉冲,真人连发节奏。**W18b 终态补记**:配对规则第二修(第二个真机 400"reasoning_content must be passed back")——思考模式是工具循环历史的属性不能中途翻转,规则升级为**回合级**(强制开局的回合全程 thinking off + reasoning_effort 撤;tool_choice 仍按轮:首轮 required 后轮 auto),变异验证精确还原真机失败点。

**W18+W18b ✅ 验收通过(2026-07-28)——v5 形态落地,say 采纳五层战役收官**:W18(执行会话分离,+43):房间=纯消息流(围栏:激活后房间 assistant 只有 collab-say)、agent 回合搬进 agent-exec-<id> 隐藏会话(per-agent 锁防双流互噬,变异实证)、say(room) 三级路由、预算集合跟进、权限 120s/goal 续推/memory 侧线三处隐性回归提前豁免。真机:侧栏零泄漏、房间纯净、回合完整落执行会话。W18b(结构强制,+27+6):首迭代 tool_choice:'required' + stay_silent 工具(说/沉默必须过工具接口);真机 400「Thinking mode does not support this tool_choice」→ **普适配对规则**(凡强制 tool_choice 的请求即禁 thinking+撤 reasoning_effort,Anthropic extended thinking 同款互斥;Fable/Mythos 永远推理故能力位排除强制)——首迭代反射选择、次迭代恢复思考组织内容(W1「判定是反射」同一哲学)。**终验收:署名 say 气泡真机落地(src=collab-say)**。say 采纳完整链条:事实说明→驱动机械指令→W14d nudge→结构强制→强制×思考互斥配对,五层全部真机取证推进。**思考过程按用户定向从聊天面整体撤除**(数据保留在执行会话,待后续 agent 页面)。

**W14d ✅ 验收通过(2026-07-28)**:一次性 say nudge(同驱动通道复用,计费/绑定/信封白拿;被拒不 nudge 收口成"有 say 调用无 say 消息"单判据;+24)。真机:精确触发、每激活一次;在 W18b 强制下降级为 provider 门控回落的兜底。

**W14b 实施+评审修复中(2026-07-28)**:Opus 5 实现(+65 测试,含 headless 档补注册救了 CLI),四处偏离全部接受(store 落库口打标防闪跳防崩溃残留)。**Review 真机抓修 blocker**:引擎把驱动的 origin 信封(source:'collab')复制到回合回复上,打标 guard 把它误当纪元标记 → 全部回合以旧纪元发言渲染(src=None 满屏)——修复=guard 放行 COLLAB_MESSAGE_SOURCE(信道≠纪元),生产形状回归测试补上(单测裸消息形状测不出,又一例)。修后真机:宿主全部 collab-turn、思考痕迹行渲染、阿明"(等候小李发言,无需我插话)"正确留在思考内不污染群聊;worker 自主 say 交付全链路验证(执行记录含 say×1、代笔绝迹)。**发现 say 采纳悬崖**(预警成真):deepseek 惯性把要说的话写进思考不调 say → 被点名者群里沉默;W14d(一次性 nudge,丢调用 nudge 先例)修复中,W14b 终验收随其一并做。

**W8b ✅ 验收通过(2026-07-28)**:Opus 5 实现,Fable review。回应归属 popover(+9 测试):hover 300ms 出/移开即收、Teleport 定位照 react-picker、pointer-events:none 防抢点击、focus/blur 键盘可达、原生 title 移除;行=头像章+名字(用户「你」/roster 未命中回落 agentId)。真机:hover chip 出「📋 阿明」、1px 墨线 4px 圆角零阴影、移开即收。四处偏离全部接受。

**W14a ✅ 验收通过(2026-07-28)**:Opus 5 实现,Fable review。mentions[{agentId,label}] 全链路(+62 测试):picker token {{member:id}}(CodeMirror widget 原子删除防半吃 token)→物化 mentions[]+纯文本 @名字;裸打名字 ingress 扫描兜底盖 id;agent 回复终局解析盖 id 且激活与转录同列表(构造保证);消费优先 id、降级文本、旧消息兼容;label 一律从 roster 重盖(防冒名)。三处偏离全部接受(最长名占位、自消息不重绘、歧义名不动)。真机:裸打 "@小李" → JSONL `mentions:[{agentId:"agent-fe",label:"小李"}]` + id 激活回复;**改名回归**:小李→李工后历史消息渲染 @李工、署名章全部换新名、@李工 激活正常,还原后如初。与 W15c 并行合流零冲突(4464 绿)。

**W15c ✅ 验收通过(2026-07-28)**:Opus 5 实现,Fable review。根因=行内节律:flex gap 与子 margin 相加不折叠,且 W15 归零全挂在 .is-room-agent 上**用户行从不携带**——同房两侧两套节律;chip 行(主嫌疑)+附件/署名/context-update/胶囊五处漏网源全归零,行内统一 4px wrapper gap。居中基准(用户追加):--room-gutter 悬挂出列,气泡列即阅读列,<768px 窄窗回退防裁切。真机量像素:**含 chip 行全间隙矩阵每对精确落表值**(32/8/40 零杂散)、居中 midDelta=0、头像悬挂列外(415<453)。护栏测试对"harness 不注入 scoped CSS"的断言陷阱做了源码级+DOM 双锁。

**W15b 操作行三修 ✅(2026-07-28,用户两轮真机实锤,Fable 直接修)**:①操作行左沿对齐消息起始线(left = 28px 头像列 + 10px gap,此前从 wrapper 最左起笔越界);②行高钉死 24px(基础规则的 min-height:28 压过 height 是根因)不再溢进下一行;③通知档 24→32(承载 24px 操作行的间隙档必须留 ≥8px 呼吸,与组间档同值,节律表更统一)。几何验收:alignDelta=0、footerHeight=24、与通知间 8px。教训:悬浮层的高度上限要跟它可能落进的最小间隙档共同设计,且 min-height 这类基础规则会静默压过档位 height。

**W16 ✅ 验收通过(2026-07-28)**:Opus 5 实现,Fable review。COLLAB_BOARD_ACT 五触点(preload 边界 JSON 快照,W7 克隆血训)+app 层 applyUserCollabBoardAction(actor=user,byUser 闸/expectedRev 照走)+卡片 ⋯/右键菜单(移到六列/指派/标记完成/重新排队,当前项灰置,rev 取菜单打开时快照防并发溜过)+卡面补渲染 blockReason/受阻×N/执行记录(顺手修了 shared CollabTask 缺 W9b 字段的长期缺口),+39 测试。三处偏离全部接受。真机验收:菜单原样打开、灰置正确、**一次「移到 待办」点击跑通全管线**——真重派→小李真执行(执行记录: bash×2, read×1,真跑了 node hello.js)→交付进 review→PM 待评审激活;卡面"无执行记录"精确点名历史剧场卡。拖拽后置(工单明示)。

**W15 ✅ 验收通过(2026-07-28)**:Opus 5 实现,Fable review。固定间距表(--room-gap-turn 32/stack 8/notice 24/capsule 40)+单一归属规则(间隙只由下行 margin-top 拥有,全部 bottom 归零,特异性按编译产物核对)+agent 气泡与用户同款(边线/底色/圆角逐字节相等,14px 缩进族连根删除)+RoomNoticeLine 居中痕迹行(context-compact 面板豁免,偏离合理)。真机量像素:**间隙矩阵每一对行类型精确取表值**,零随机缝隙。**Review 走查抓修一个衍生缺陷**:reasoning-only 消息(空正文零工具,deepseek 想了想没说话也没输出 pass 哨兵)被气泡框画成空盒子——修复=房间隐藏判定加第四类"空正文零工具的落定回合视同沉默"(工具型消息保留,board 活动是真内容),+4 测试,真机复验空气泡归零。六处偏离全部接受(用户连发不成组维持 W3 决定,要改另开单)。

**W13 ✅ 验收通过(2026-07-28)**:Opus 5 实现,Fable review。五项后置全落地(+44 测试):worker 交付前 typing(finally 守护)、agent 主动引用(间隔≥1 可见消息才补挂,复用 store patch+message:updated 链)、usageSource 透传(core 仅加可选字段,预算归因不动)、board 广播 30ms 尾沿合并(activity/board.json 每步照写)、房间花费行(新只读 IPC COLLAB_ROOM_SPEND_GET,不搭看板热路径)。三处偏离全部接受(尤其 (a):harvest 贴文算可见间隔比工单指示更对——它就是房间里的真实发言)。真机验收:@两人一条消息 → 第一个回复(紧邻)不挂引用、第二个回复(隔了第一人发言)自动挂「用户: …」引用块——判别精确;设置浮层「今日已用 $0.01」正确渲染。注:W13.2 的补挂触发将在 W14b(say 工具 replyTo 参数)落地后由 agent 显式指定取代,补挂链路保留为兜底。

**W11 ✅ 验收通过(2026-07-28)**:Opus 5 实现,Fable review。房间去流式=isRoomHiddenMessage 一行判定翻转(+7 测试,含"流式零 content 读取"的计数 getter 围栏——性能纪律从注释升级为测试);滚动自查扎实(整条弹出走 tail 模式,与用户消息 append 同路径;附带发现 useFollowScroll 的 count 选项是死参、"无隐藏项返回原引用"的快路径在活跃房间早已是死路——房间重渲反而比流式逐帧更少)。真机时序铁证:typing 先亮→飞行期 **partialVisible: false**→1.8s 整条落地,后续长度无逐 token 生长。测试基线对账:4313 = W4 的 4296 + W10 的 10 + W11 的 7,两单并行互不知情数字精确吻合。

**W10 ✅ 验收通过(2026-07-28)**:Opus 5 实现,Fable review。看板视角化(renderCollabAgentRef self 参数,digest 里自己渲染「你(小李)」,worker 开局简报同口径)+taskFacts 第一人称措辞(「你正在工作会话里执行」),+10 测试。七处偏离全部接受(最关键:actorAgentId 与看板变更归属同源,视角与归属由构造保证一致;共读转录不做第二人称替换)。digest 调用点审计:仅 board 工具与 worker 简报传 self,CLI/面板走原始 JSON,用户视角零污染。真机:小李第一人称盘点名下卡("干净收工"),还诚实点名 status.txt 卡"实际没执行,改方案关了"。

**W4 ✅ 收尾回归通过(2026-07-28)——全部工单交付,系统完整**:全量门禁 vitest **4296 passed/1 skipped**(自 W1 基线 4042 净增 ~254)、typecheck 0、boundary:gate 无新红。普通会话零影响真机实证(新建普通会话真发消息+hover,七项 IM 痕迹计数全零:member strip/reply/react/chips/capsules/room 布局/typing)。最终构建 E2E 闭环(真 UI 发起):@阿明 建卡派小李 → 开始执行系统行 → worker 真执行 → 交付评审 → 「已标记完成。执行记录: …」→ final-check.txt 真实落盘;typing 行流程中亮起。整个 IM v2 交付清单:自主意愿判定(@ 降级为社交信号/安静合法)、typing 指示、IM 气泡化(分组/胶囊/机制痕迹归零)、工具白名单+模型绑定 UI、团队设置(改名/成员/PM/预算/权限/冻结)+成员变更公告进投影、引用回复(快照/投影/跳转)、表情回应(用户 tap+agent "没话说点个赞"真机落地)、任务事实链(投影系统行/受阻处置/重派真执行/halted 封顶/done 执行证据)。

**W8 ✅ 验收通过(2026-07-28)**:Opus 5 实现,Fable review。reactions 聚合存储+toggle IPC(preload 边界重建纯字面量,W7 克隆教训落地)+😀+ 面板+chip(§3.6 全中:1px 线/3px 圆角/透明底/mine 只加深边线)+判定输出扩展 {respond, react}(向后兼容+白名单+防指令回声),+55 测试、六处变异测试。六处偏离全部接受(add-only 防二次判定撤赞、单人裸 emoji、自消息不标注防自我叙述污染)。真机:tap 👍 → chip `👍1` mine 态 → 再点归零;通报"点个赞就行" → 两 agent 判 respond=false 各补 👍 → 聚合 `👍2`,零发言——"没话说但点个赞"的手感真机实证。走查坑:合成 DOM click 会被浮层的点外关闭吃掉,walkthrough 需用真实鼠标事件。

**W7 ✅ 验收通过(2026-07-28)**:Opus 5 实现,Fable review。引用回复(replyTo 快照/预览条/投影 `> 作者: 摘录`/气泡引用块/点击跳转高亮)+成员头像列(24px 章重叠排布/PM 加重描边/右键菜单走 COLLAB_ROOM_UPDATE),+47 测试;透传链变异测试;Opus 抓到真坑=房间用户消息由 ingress 网关持久化不走核心引擎构造,两处都要 spread。六处偏离全部接受(意愿窗口也放行引用行——"回给谁"正是判定信号)。**Review 走查抓修一个 blocker**:replyTo 快照经 ref 取出是响应式 Proxy,过不了 IPC 结构化克隆,InputBox 整树被 "An object could not be cloned" 打崩(单测 mock 掉 IPC 边界测不出)——修复=命令构造处拍成纯字面量(stores/chat.ts)。真机验收:发送链全通、气泡引用块(作者半粗+单行摘录+左墨线)、点击跳转+高亮、JSONL 落 `{messageId, authorLabel, excerpt}` 快照、头像列 2×24px(全员在群时 ＋ 隐藏,合理)。已知限制:组内堆叠非尾条 footer 隐藏故「回复」不可达(W3 决定的连带,接受);＋ 拉人/右键菜单依赖第三个 agent 的场景由组件测试覆盖。**教训入册:凡新字段跨 IPC,单测之外必须真机过一次结构化克隆边界。**

**W6 ✅ 验收通过(2026-07-28)**:Opus 5 实现,Fable review。COLLAB_ROOM_UPDATE 五触点+CLI `collab update`(偏离 c,为验收加,接受)+setCollabRoomConfig 原子校验+RoomSettingsDialog+建群对话框旧文案修正,+31 测试。五处偏离全部接受(name/permissionMode 并通道、成员集合比较、CLI、头像列留 W7、悬挂墨线 tick)。CLI 验收:踢小李→「小李 已被移出群聊」公告行→直接 @ 他 45s 零响应(drive-time 守卫,变异测试锁死)→拉回→「🔧 小李 加入了群聊」→回复**"在。刚被移出又加回来了,什么事?"——他从投影里看到了自己的进出,membership 行进投影实证**。CDP 走查:⚙ 入口在看板旁,浮层含改名/成员 tick/PM 下拉(新语义说明文案)/日预算/权限模式(work 继承说明)/冻结,§3.6 干净;建群对话框新文案源码确认。

**W9b ✅ 验收通过(2026-07-28)**:Opus 5 实现(API 断线一次,断点续跑完成),Fable review + 第三次 CLI 复跑。四点全部真机实证——①重派真执行:两次"移回 todo"都真 spawn work 会话(根因=reducer 的 move 对"带 assignee 回 todo"不发任何事件,新增 task-requeued;变异测试锁死);worker 还逐一探测工具后才报告受阻("write/bash/edit 均返回 Tool not available");②受阻行带真原因摘录,不再空指;③处置语义:PM 首次处置直接上报用户"超出我能处理的范围:开权限/换人/改方案";④第 2 次受阻触发「已停止自动处置」停机行,房间安静,无 PM 自动拉起。done 证据行(执行记录: write×N,harvest 代码统计、排除 board 工具、模型不可伪造)正面路径另测。已知行为方差:同一 agent 的两次排队激活可能给出矛盾动作(先说等用户又重试)——结构闸兜底,不修。

**W9 ✅ 验收通过(2026-07-28)**:Opus 5 实现,Fable review + CLI 复跑同场景。三层修复全部真机实证——①投影:小李/阿明的驱动窗口 dump 均含 `系统: …受阻…` 行(halt-line-in-window: true);②语义:阿明激活标签「任务受阻待处置」,处置动作=查看板→解阻→重派,零编造,受阻卡未进 done;③自感知:小李驱动 system prompt 含「你名下的任务…(受阻)」(taskFacts: true),房间发言从谎报"已交付"变成"卡在 blocked 列,@阿明 帮看下 block reason"。四处偏离全部接受(最关键:受阻此前根本不激活任何人,事故里阿明是被小李谎报里的 @ 勾进来的;处置指令落在投影系统行而非不进投影的驱动内容)。**复跑暴露两个新洞立为 W9b**:受阻→解阻重试→再受阻的回路无 per-task 上限(真实上演,用户消息止损);受阻原因没落卡,受阻行"原因见看板"空指。

**W5 ✅ 验收通过(2026-07-28)**:Opus 5 实现,Fable review。纯状态机(agent-config-form.ts,15 单测)+AgentsPanelContent 两区块(follow global⇄allowlist 悬挂墨线 tick、MODEL 两行收敛)+11 组件测试;updateAgent 类型口径放宽核实为纯声明修正(main handler 本就透传 tools/model)。五处偏离全部接受(下架工具标 unavailable 防静默丢、原生 checkbox 换画线 tick、模型用原生 select 不上 ModelSelector 大面板、provider 列全部+墨灰警示、ToolChoice 收窄防 TS2589)。真机走查:CDP 驱动 UI 全链路(切白名单→勾 read→保存)落盘 `{"tools":["read"]}`;CLI 行为验收铁证=work 会话请求 tools 数组精确 `read,board`(无 write),worker 因缺工具如实标"受阻"。**验收现场揪出 W9 三层洞**(见 §4 W9):房间小李谎报已交付、阿明看不到受阻系统行凭谎报关卡进 done。另发现:建群对话框"默认应答人"文案还是 default-responder 旧语义(W1 已删),记入 W6 一并修正。

**W3 ✅ 验收通过(2026-07-28)**:Opus 5 实现,Fable review。纯逻辑分组/过滤/胶囊(room-grouping.ts,19 单测)+ChatPanel 投影过滤+MessageList 布局下发+MessageItem 房间列,+26 测试全绿。六处设计偏离全部接受(墨线取代纸底、agent 气泡全宽、组内隐 hover footer、pass 未定窗保留 '…'、思考/附件对齐发言轴、旧组件保留给 work/历史)。真机走查(重 build+CDP):drive 线在房间**归零**(此前满屏"被 @ 激活"虚线)、胶囊"今天 01:32"文案与虚线延伸正确、agent 消息左列头像章+署名、用户右气泡不变;合并成组用夹具验证(三条相邻小李 → 一个组首+两条堆叠,W2 时代只隔 drive 线的两条回复过滤后也自然合并——"隐藏机制不打断组"实证)。走查还确认了一个正确行为:agent 回复快于用户第二条消息时两次发言被用户消息隔开,不合并是对的。**遗留打磨项(记入 W4)**:组内堆叠消息各带一条 "Thought for X.Xs" 思考行,堆叠语境下重复感明显,考虑房间模式组内折叠;时间胶囊"今天"文案跨午夜不刷新(IM 惯例同病,可不修)。

**W2 ✅ 验收通过(2026-07-28)**:Opus 5 实现,Fable review。store 惰性过期(60s TTL,静默房零定时器)+CollabTypingLine(痕迹级)+ChatPanel 房间挂载,+14 测试。裁定:typing 行**保留**在 `.is-layout-animating` 0.3s 编排组(参与既有布局编排≠装饰动画,§3.6 的 200ms 上限不适用)。真机走查(CDP+Playwright 截图):`🔧 小李 正在输入 ···` 计算样式实测 11px/墨灰/零底零框/2px 点/1.2s 呼吸,全中 §3.6;typing 窗口覆盖发送→首字节死寂段,流出即熄。**评审期两坑**:①out/ 构建早于工单交付,旧 renderer 里组件不存在——UI 工单走查前必须重跑 `bun run build`;②CDP 挑窗口要排除 `#/` 路由的辅助窗(search/settings),否则连到 Search Everywhere 窗白等。

**W1 ✅ 验收通过(2026-07-28)**:Opus 5 实现,Fable review。判定器纯逻辑(11 单测)+runner+协调器接入全落地;7 处设计偏离全部接受(见 Opus 报告,含防"复读指令假 true"的负前瞻)。**Review 阶段抓修一个 blocker**:判定调用继承 provider 的 thinking 配置 → reasoning 模型把 64 token 预算与 8s 死线全烧在思维链上 → 全员必然静默(真机复现);修复=判定 options 强制 `thinking: false`(判定应是反射不是深思)。CLI 真机验收:无 @ 技术问题 → 阿明「主动接话」以 persona 表态;"好的谢谢" → 全员沉默。两场景均过。遗留观察项:判定延迟税(每消息一轮判定,W2 typing 可缓解感知)、静默与故障同形(W4 验收盯 provider 故障场景)。

(逐工单更新)

**W18 执行会话分离 — 已实施(2026-07-28,未提交;+43 测试,4562 → 4605,真机验收待跑)**

- **会话形态**:`kind='agent'`(shared `SessionKind` 扩这一个值,repository 对 kind 本就不透明,故序列化/索引/冷加载修复零改动),id 由 agentId **派生**(`agent-exec-<agentId>`,纯逻辑 `collab/agent-session.ts`)——ensure 就是"读一次,至多建一次",不需要任何 agent→session 注册表,重启后仍是同一个。隐藏走 **scheduler 先例的 `isArchived`**(顺带白拿 search 的 `!isArchived` 过滤),renderer 另加两处 `kind !== 'agent'`(侧栏列表 + **归档列表**——没人归档它,也没人会去恢复它)。绑 `agentId`、名字 `[执行] <name>`;创建时按先例还原 currentSessionId。
- **驱动改道**:`driveActivation` 拆成"闸门/等引擎"与 `runActivationTurn`,后者在 **per-agent 锁**里跑:ensure 会话并把**本次目标房间**写在它的 `collab.roomSessionId` 上 → `emitDrive` 打到 agent session(channel 仍取房间的 connector)→ `waitForRoomTurn(agentSessionId)`。锁是新增的必要件:两个房间同时激活同一 agent,过去各驱各的房间会话,现在共用一个执行会话,不锁就是两条流互相 supersede + 房间指针被后到者覆写(变异测试:去掉锁 → 序列化用例立刻红)。
- **prompt 取材链**:`collabRoomOverrides` 改为"先解析目标房间,再取材"——`kind='agent'` 从 `collab.roomSessionId` 取房间,persona/roster/房间名/`getCollabSelfTaskFacts` 全部按**目标房间**取;`kind='room'` 原样保留(旧形态)。**模型输入不变**由 `projectRoomMessagesForModel` 兜住:执行会话的历史被替换成目标房间的 IM 投影(自身转录本期不进输入,§4.6 明示);没有房间指针时输入为空而不是把执行日志喂进去。
- **say 房间路由**:工具参数加可选 `room`;纯规则 `resolveCollabSayRoomSessionId` = 显式 room → 会话绑定的房间(执行会话的驱动目标 / work 会话的父房间)→ 会话自己是房间(旧形态)。**显式 room 不买特权**:成员校验与冻结/预算闸一律打在**目标房间**上;room 指向非房间时给的是另一句话(`COLLAB_SAY_REFUSED_UNKNOWN_ROOM`),让 agent 能分辨"打错门"和"没有门"。board 工具同链路(`kind='agent'` 用同一个指针,actorAgentId 用会话 agentId),否则房间回合调 board 会直接"没有看板"。
- **随迁**:W14d nudge 天然跟着 `emitDrive` 走进执行会话(同一条通道);收割改为**两份转录**——says 从房间收(链长/级联/引用/mentions 全部以 say 论),回合宿主从执行会话收;纪元标记在 store 落库口对 `kind='agent'` 一并打(nudge 的"是不是思考记录"判据要它);工具面 `resolveCollabToolAllowlist` 把 `'agent'` 与 `'room'` 并列(替换式 `['say','board']`)。
- **房间纯净围栏**:新测试跑完整激活(两条 say + 级联)后断言房间里 `role='assistant'` 的**全部**是 `collab-say`、user 消息只有人类那条、没有 `source:'collab'` 驱动行。
- **偏离(5 处,都往收紧走)**:①**per-agent 锁**是工单没写的新增件(理由见上,不加就是并发损坏);②**沉默分支的水位**改为推进到"触发它的那条**房间**消息"——宿主消息现在在别的会话里,拿它的 id 当水位在启动扫描里根本找不到(退化成时间戳兜底);③**预算闸的会话集合**加入成员的执行会话 id(否则房间最大的开销从此不计入日预算);同一 agent 跨房间会被两边各记一次,是**只会更早关闸**的保守方向,ledger 的 per-source 标签仍精确;④**旧纪元发言**判据收窄为"房间里那条无标记的 assistant 消息"(执行会话里的回合记录永远不是发言——没人读得到,正是 W18 的全部意义);⑤`permission-policy` 的 `isCollabTurn`、`agent-loop-executor`/`goals/kick` 的 `isCollabSession` 同步认 `'agent'`(房间回合不该掉进 120s 自动拒,也不该触发 memory/TOC 侧线或被 goal 续推撬动)——工单没点名,但不改就是行为回归。
- **兼容**:旧房间转录(驱动行/collab-turn/旧纪元发言)渲染与投影逐字不动,renderer 的机制过滤保留为 legacy;新链路不再产生需要过滤的房间内容。`CollabWorkRef.taskId` 放宽为可选(执行会话只认房间,不认卡),现网唯一写入方是 worker。
- **门禁**:vitest **4605 passed / 1 skipped**(+43)/ typecheck 0 / boundary:gate 无新红(自愈 2 条)/ 改动文件 eslint 与改动前逐条相同(仅 `app/stores/sessions.ts` 的历史遗留 1 error + 4 warning)。

**W14d say 采纳 nudge — 已实施(2026-07-28,未提交;+24 测试,4538 → 4562,真机验收待跑)**

- **续推机制选型**:没有复用 core 的"丢调用 nudge"(那是 `packages/core/agent-loop/runner.ts` 的**回合内**补救,只认"声称 tool_calls 却零有效调用"这一种畸形回合,协调器既够不着也不该借它表达房间语义)。取工单许可的最小等价物:**同一条驱动通道再发一次**——`driveActivation` 把驱动 emit 抽成 `emitDrive(content)`,nudge 就是换了话的同一次驱动,于是计费(`usageSource: collab-room`)、模型绑定(agent 的 provider/model/thinking)、信封(`COLLAB_MESSAGE_SOURCE` ⇒ `isCollabDriveMessage` ⇒ 不进投影、不重置链、不开意愿轮)统统白拿,不新增机制。
- **触发判定**:纯逻辑落在 `collab/say.ts` 的 `shouldNudgeCollabSay`(五个否决条件各说一件事)+ `countCollabSayToolCalls`。协调器在终局喂事实:本轮 say 消息数、宿主消息是否带思考标记、思考正文、宿主消息上 `say` 工具调用数、`record.nudged`。**"被政策拒绝不 nudge"由 say 调用数收口**:没有 say 消息落地却有 say 调用,只能是被拒(冻结/超预算/已移出/空 content),再推一次只是再撞一次墙——一个判据同时满足工单的两条(0 次调用 && 无被拒记录),不与工具结果的序列化形状耦合。
- **文案原文**(`COLLAB_SAY_NUDGE_TEXT`):「(你刚才写的内容没有发进群里——群里只能看到你用 say 工具发出的消息。要说就调用 say;确实不想说就什么都不用做。)」纯事实、不含指令(测试锁死不出现"你应该/请务必"),两种结局都合法。
- **护栏**:`nudged` 落在**激活记录**上(随 state.json 持久化,重启中途也买不到第二次);nudge 轮产出的宿主消息照常 `collab-turn`、say 照常 `collab-say`,链长/级联/引用一律以最终 say 论;typing 不用动——`processQueue` 的指示灯覆盖整个激活,nudge 轮在其中。
- **偏离**:①只在 `outcome === 'complete'` 的回合 nudge——超时/中止/报错的回合不是"决定不说",与级联同门槛;②nudge 前**重读闸门**(冻结/超预算/已被移出),回合耗时数秒,期间关的门不该让 nudge 去撞;③纪元守卫用"宿主消息带思考标记"而非仅"无 say",于是旧转录与退役的 `[pass]` 哨兵一并豁免(那时的 agent 根本没有 say 可调)。三处都是收紧,不扩大触发面。
- **worker 不 nudge**:worker 会话不走 `driveActivation`,规格第 4 条是结构性成立,不靠新分支。
- **门禁**:vitest 4562 绿(+24:纯逻辑触发矩阵/文案/投影/链长 12 条,协调器真驱动 12 条)/ typecheck 0 / boundary:gate 无新红 / 改动文件 eslint 零输出。W14b 的「无 say = 沉默」终局测试同步改写:写了正文的沉默现在多一次 nudge 驱动(这正是本工单),沉默仍是沉默。

**W14b 说话即行动 — 已实施(2026-07-28,未提交;+65 测试,4473 → 4538,真机验收待跑)**

- **say 工具**:纯契约 `tools/builtin/say.ts`(`createSayTool`,permissionGuard safe,board 先例),执行器 `app/collab/say-tool.ts`。房间会话说进自己、work 会话说进父房间;**冻结/超预算/已被移出全部收拢在这里**——返回「发言未送达:…」,agent 亲身知道话没发出去(§4.5 今日真实送达失败语义)。空 content 在闸门之前就拒(那是笔误,不是送达失败)。mentions 参数按 roster 白名单过滤 + 重打 label(防冒名),与正文 `@名字` 扫描按 W14a 规则合并;replyTo 解析成真实消息的快照,指向不存在的 id 直接忽略(不为一个坏引用扣下一条消息)。一回合可调多次。
- **纪元标记**:`COLLAB_SAY_SOURCE='collab-say'`(发言)与 `COLLAB_TURN_SOURCE='collab-turn'`(思考记录),两者皆无 = W14b 前的旧转录(流即发言),**靠标记不靠迁移**。判定收在 `collab/say.ts`,链长/投影两处/意愿窗口/引用间隔/房间渲染同源消费。
- **工具面**:纯规则 `collab/tool-surface.ts` — 房间 `['say','board']`(替换,非交集:没有 say 的成员根本进不了房间),work 会话把 board+say **并集**进 agent 自己的白名单。注册在 full 与 **headless** 两档(CLI daemon 跑真房间,少一个 say 就是全员失声);readonly 档照旧不含(写房间消息是副作用)。
- **协调器终局**:改成纪元分叉——先收割本轮的 say 消息(有几条算几条链长,与启动重算逐条计数对齐),级联把整轮说的话当**一个动作**判定(@ 在第二句同样激活);无 say 而宿主消息**没有**思考标记 = 旧转录,老路径逐字不动;有思考标记且无 say = 沉默(不计链、不级联、不贴系统行、水位仍然推进)。W13.2 补挂降级为兜底,只挂在**第一条** say 上,且 say 自带 replyTo 时不挂。
- **worker 交付自主化**:简报引导「先 say 交付关键结论并 @ 负责人,再 board complete」;harvest 的代笔贴文(`postAgentMessage` / `【交付】`/`【进展】`)整体退役,worker 期间说过话就什么都不补,一句没说才兜底贴**系统行**(`collab-task`,含摘要,署名是「系统」不是他)。task-event 评审激活/证据行/受阻协议全不变。
- **思考痕迹行**:`CollabThinkingTrace.vue` — 一行 11px 墨灰「思考过程 · N 步」,点开用既有 `MessageBubble` 渲染整轮正文+工具面板(不另造一套工具渲染)。grouping 里**完全透明**:不占头像署名、不断组、不触发时间胶囊;间距**不新增档位**——痕迹行取既有 turn 档,其后第一句取 stack 档(`.room-row--trace + *`),一轮读成一块而不是两个 32px 大缝。
- **偏离**:①思考标记在 **store 落库口** 打(`stampCollabAgentId` 同一处),不是工单说的协调器终局——终局打会有"整条气泡闪一下再折叠"的跳变,且崩在半路的回合会留下一条冒充发言的记录;判定完全一致。②标记走消息自身的 `source` 而非 `origin.source`:`MessageOrigin` 是入站信道信封(transport/receivedAt 必填),同轴的 `collab-harvest`/`collab-say` 也都在 `source`;所有判定两个字段都读,写哪个都判一样。③`WorkerHost` 的 `postAgentMessage`/`emitTyping`/`noteAgentSpoke` 三个口子随代笔一起删除(已无调用方);W13.1 的 typing 前导改由 say 执行器为 **work 会话**发言承担(房间回合的指示灯由队列持有,期间不熄——正是 §4.5「say 落地时仍亮」)。④工具面规则抽成纯函数以便单测(引擎适配器只剩一行调用)。
- **门禁**:vitest 4538 绿(+65)/ typecheck 0 / boundary:gate 无新红(且自愈 2 条)/ 改动文件 eslint 与改动前逐条相同(仅历史遗留 1 error + 5 warning)。

**W14a 身份 id 化 — 已实施(2026-07-28,未提交;+62 测试,4402 → 4464,真机验收待跑)**

- **数据**:`ChatMessage.mentions?: Array<{ agentId, label }>`(shared,W7 replyTo 同位置)+ `SendMessageCommand.mentions`;产品层结构孪生 `CollabMentionLike`;持久化层 `updateMessageMentions`(与 reactions/replyTo 同一 patch 链)。
- **用户路径**:composer member picker 的 `value` 改为 **agentId**,插入 `{{member:<agentId>}}`(`{{page:tabId}}` 先例);编辑器用轻量 `MemberRefWidget` 画成纯文本 `@名字`(atomicRanges → 删除整体消失,半截 token 不可能进房间);发送时 `materializeMemberReferences` 在**页面 token 之后**物化——token 变回正文里的 `@名字`,id 走 `mentions[]`。死 token(agent 已删)连一个尾随空格一起消失,绝不吐出原始 token。
- **裸打兜底**:ingress 用 roster 名字解析盖 id,并与 picker 的 id **按 label 归属合并**(picker 认领的 label 不再吃文本解析结果 → 重名精确;其余 label 仍走文本 → 混合草稿两个都在)。client 送来的 label 一律用 roster 现名重盖(发送方不能给别人起名)。
- **agent 路径**:`attachCollabMentions` 在协调器**流终局、链计数 +1 的同一分支**(与 W13.2 补挂同处)解析正文 `@名字` 盖 id → `message:updated` 广播;返回值直接喂给级联的 `decideCollabActivations`,转录留下的 id 与真正被激活的 id 构造上同源。已盖过的消息不重盖(第一次的 roster 才是与消息同时代的那个)。
- **消费**:`resolveCollabMentionIds` = 有 `mentions` 走 id、无字段降级名字解析(空数组是"谁也没提"的真答案,所以写入方无 mention 时**不写该键**);`decideCollabActivations` 只换解析源,成员过滤/作者自排除/冻结/链闸全部不动。
- **渲染**:`renderCollabMentionText`(纯逻辑,单一实现)在投影两处(`projectRoomHistory` + 生产 `projectRoomMessagesForModel`)、意愿窗口、房间 UI(`MessageItem`)同源使用——改名后处处显示现名,roster 里没有的回落 label 快照,同一 label 解析出两个名字(重名其一改名)时**整段不动**(宁可不改也不能把名字安到错的人头上)。
- **跨 IPC 纪律**:renderer 命令构造处拍纯字面量 + preload `emitCommand` 边界再拍一次(W7 克隆血训,两头设防)。
- **偏离**:①`parseCollabMentions` 的位置去重从"同 index 只留一个"细化为"同 index 只留最长的一批"——重名成员此前被静默吞掉一个,与工单"文本全命中"口径不符,长名压短名(小李工 vs 小李)行为不变;②自己的消息(投影里保持结构化)不做重绘;③roster 情况说明的 @ 机制事实按 §4.5 更新为"系统会自动带上该成员的 id"。

**W13 后置项批次一 — 已实施(2026-07-28,未提交;+44 测试,4315 → 4359)**

1. **worker 交付前 typing**:`WorkerHost` 加 `emitTyping`(协调器注入 `emitCollabTyping`),
   worker 的两条回贴路径(交付 / 进展)统一走新的 `postAgentMessageWithTyping` —
   `true` → post → **finally** `false`。受阻/中断走系统行(无署名),不 emit。
   4 测试含"post 抛异常仍熄灯"与"无消息则一次都不亮"。
2. **Agent 主动引用**:新纯逻辑 `runtime/src/collab/reply-quote.ts` —
   `isCollabVisibleRoomMessage`(镜像 renderer 的 `isRoomHiddenMessage`:drive/落定 pass/
   空内容不占行)+ `countCollabVisibleMessagesBetween` + `shouldAttachCollabReplyTo`
   + 从 renderer 上收的 `buildCollabReplyToSnapshot`(renderer 的 `reply-quote.ts` 改为
   委托,截断规则与作者兜底全库唯一一份)。app 层 `app/collab/reply-quote.ts` 的
   `attachCollabReplyTo` 走 `store.updateMessageReplyTo`(新 patch 链,与 W8 reactions 同构)
   → 广播 `message:updated`。协调器在 `driveActivation` 的**流终局、链计数 +1 的同一分支**
   调用(pass 不进该分支,故天然不补挂),触发消息 id = 激活记录已有的 `sourceMessageId`
   (task-event 无 sourceMessageId → 自然不补挂)。**间隔判定原文**:触发与回复之间的
   可见消息数 `>= 1` 才挂;紧邻(仅隔 drive)不挂;回复已带 replyTo 不覆盖。
   投影三处(projection.ts / message-helpers.ts / buildWillingnessWindow)W7 起就已是
   role-agnostic,本单只补了 agent 消息的断言(含"自述不带引用行"的反向锁);
   renderer 引用块同样早就 role-agnostic,补 room-agent 行的渲染+跳转测试。
3. **usageSource**:core 只加**可选字段**——`SendMessageCommandLike.usageSource?`、
   `CoreMessageStreamParams.usageSource?`、`CoreTextStreamContext.usageSource?`(零依赖不变);
   `executeCoreMessageStream` 把它放进 text-stream ctx,`agent-loop-executor` 记账处
   `state.ctx.usageSource || 'chat'`(缺省不变)。传入点只有两个:协调器房间驱动
   `collab-room`、worker 简报 `collab-work`(常量在 `collab/types.ts`)。
   **预算归因未切**:房间闸仍按 sessionId 集合聚合。usage 面板按 source 分组即自动受益,
   不做 UI。
4. **board 广播节流**:`board-store.ts` 的 `collab:board-changed` 按房间 30ms 尾沿合并
   (browser `BROWSER_TABS_CHANGED` 同参数同形态,后到快照赢、窗口不被 burst 推迟);
   timer `unref()`,`clearCollabBoardBroadcast` / `shutdownCollabBoardBroadcasts`
   (后者接进 `shutdownCollabCoordinator`)。**activity.jsonl 与 board.json 照旧每次同步写**
   ——只节流广播,审计不丢步(有专门测试)。
5. **房间花费可见**:协调器抽出 `readCollabRoomSpentTodayUSD`(预算闸与面板同一份账本聚合,
   闸自己包 60s 缓存,面板读实时)+ `getCollabRoomSpend`;新只读 IPC `COLLAB_ROOM_SPEND_GET`
   五触点齐。RoomSettingsDialog 日预算栏下一行 `.spend-line`(11px 墨灰、tabular-nums)
   「今日已用 $X.XX」,开浮层取一次不刷新;读失败静默(不在设置表单上挂错误条)。

**三处偏离**:
- (a) 间隔口径**不过滤** `isCollabHarvestMessage`:worker 交付/进展贴在房间里是**正常可见发言**
  (渲染层不隐藏),它插在问答之间就是真实的"话题被岔开",正是引用该出现的场合。
  实际过滤的是 renderer 真正隐藏的那三类(drive / 落定 pass / 空内容)。
- (b) 花费行选**新建轻量只读 IPC** 而非并进 `COLLAB_BOARD_GET`:board-get 是看板面板的热路径,
  给它挂一次账本扫描等于每次开看板都付一遍磁盘代价。新通道纯只读、零写入面。
- (c) 房间删除没有现成钩子可挂 `clearCollabBoardBroadcast`,故只接了进程级 shutdown;
  节流 timer 自删自身表项且已 `unref`,不存在泄漏面(函数已导出并被测试,将来有钩子直接接)。

**W8 表情回应(reactions)— 已实施(2026-07-28,未提交)**

- **数据**:`packages/shared/ipc/chat.ts` 新 `ChatMessageReactionActor {type:'user'|'agent', agentId?}`
  + `ChatMessageReaction {emoji, by[]}` + `ChatMessage.reactions?`(与 W7 的 replyTo 同位置)。
  存储形态即**聚合态**(一 emoji 一条,带 actor 列表),chip 计数 / tooltip 名单 / 投影
  `(👍×2)` 三处读同一个数组,不各自再分组。
- **纯逻辑**:新 `packages/onething-runtime/src/collab/reactions.ts`(19 单测)——
  六表情白名单 `COLLAB_REACTION_EMOJIS` + `normalizeCollabReactionEmoji`(**剥变体选择符**
  U+FE0E/FE0F 后比较,`❤` 与 `❤️` 同一个反应,存回 palette 拼写)+ `applyCollabReaction`
  (toggle / add-only 两模式一套集合算术,**返回 null 表示无变化**,调用方据此跳过落盘+广播)
  + `tallyCollabReactions` / `hasCollabReactionFrom` / `formatCollabReactionSummary`
  / `appendCollabReactionSummary`。
- **app 层单一收口**:新 `app/collab/reactions.ts` 的 `reactToCollabMessage(roomSessionId,
  messageId, emoji, actor, {toggle})` —— 房间校验 + 白名单校验 + actor 校验 →
  `store.updateMessageReactions`(新走既有 patchMessage 链:
  `sessions/session-message-runtime.ts` → `app/stores/sessions.ts` → `stores/index.ts` → `store.ts`)
  → 广播 `message:updated`(渲染层既有消费者,零新事件)。人点 chip 与 agent 判定 react
  **同一个函数**,校验/落盘/广播不会分叉。
- **五触点**:`COLLAB_MESSAGE_REACT`(channels + `shared/ipc/collab.ts` 请求/响应类型 +
  `main/ipc/collab.ts` handler + preload `reactToCollabMessage` + renderer types & web 端
  desktop-only 名单)。headless/CLI 未做(UI+判定双入口已够,§3.5 B 未要求)。
- **UI**:`MessageActions.vue` 在 reply-btn 旁加 😀+(`SmilePlus`)→ teleport 一行六表情
  轻浮层(1px 线 / 4px 圆角 / 无填充,hover 只动墨);`MessageItem.vue` 气泡下沿 chip 行
  (§3.6:1px 细边 3px 圆角、emoji 14px + 计数 10px 墨灰、**自己点过只加深边线不填色**),
  点 chip = 同一个 toggle;tooltip 用 agents store 取名,用户显示「你」。
  新纯逻辑 `components/chat/message/reactions.ts`(`buildReactionChips`,5 单测)。
  **入口与 chip 都由 `roomMode` 门控** —— 普通会话即使历史消息带 reactions 也整行不渲染。
- **Agent 回应(点睛)**:判定输出扩展为 `{"respond": true|false, "react": "👍"|null}`。
  `parseWillingnessReply` 改返回 `{respond, react}`(**向后兼容**:旧 `{"respond":true}` 与裸
  `true` 解析不变、react 为 null);react 走白名单校验,**引号形式被排除在裸分支之外**,
  所以复读指令 `"react": "👍"|null` 整体不匹配而不是被读成真 👍。
  `judgeWillingness` 改返回每人一条 `{agentId, respond, react}`;协调器 `electWillingSpeakers`
  新增 `targetMessageId`,对 respond=false 且 react 非空者以 **add-only**(被问两次绝不撤销)
  写进**触发这轮判定的那条消息**。
- **不触发新一轮判定**:协调器只订阅 `message:user-created`(且 role==='user')与
  `steering:consumed`,`message:updated` 不在其列 —— 有专门测试锁死(含"真用户消息确实会
  触发"的正对照,防止断言空转)。
- **投影(三处同源)**:`collab/projection.ts`(规格)、`app/engine/stream/message-helpers.ts`
  (生产适配器)、`buildWillingnessWindow`(判定窗口,W7 同先例)各自在发言块**尾部**拼
  `(👍×2)`;形态 `小李: 接口写完了 (👍×2)` / `用户: 上线了 (🎉)`(单人不带 ×1)。
  **被激活 agent 自己的消息不标注** —— 自述里凭空多出没写过的字会被当成自己说的。
- 单测 +55(4241 → **4296**):collab/reactions 19、willingness +8(新结构/新旧格式/白名单/
  变体选择符/复读防护/窗口标注)、collab.test +4(投影标注/引用叠加/自述不标/零反应不变)、
  room-projection +2、app/collab/reactions 9、collab-ipc +3、renderer reactions 5、
  MessageItem.reactions 6。**已做变异测试 6 处**:抽掉两处投影拼接、抽掉窗口拼接、抽掉协调器
  react 写入、抽掉协调器 `outcome.respond` 守卫、去掉解析白名单 —— 各转红。
- 门禁:vitest 4296 绿 / typecheck 0 / boundary:gate 无新红(26 known)/ ui-token-vars 绿 /
  改动文件 eslint 0 error。
- **偏离**:(a) 工单写 IPC 字段 `sessionId`,实际用 `roomSessionId` —— 与同文件另外四个 collab
  通道口径一致(W6 先例),字段名不同源会比字面照抄更容易读错。(b) 除 toggle 外加了 add-only
  模式,agent 判定 react 走 add-only:同一条消息被问两次不该把自己的反应**撤掉**,而人点 chip
  的撤销语义必须保留 —— 两种语义共用一套集合算术,不是两条链。(c) 投影里单人反应渲染成裸
  emoji 而不是 `👍×1`:模型读的是氛围不是表格,`×1` 是噪声;UI chip 仍恒显计数(§3.6 明写
  "emoji 14px + 计数 10px")。(d) 自己的消息不带反应标注(见上,防自述污染),故 agent 暂时
  "看不到别人给自己点的赞" —— 需要的话应另走一条明确的旁白而不是混进自述。(e) 判定窗口也放行
  反应标注(工单只写两处投影):群里已经三个人点了赞,正是"这话不用我再说一遍"的判定信号,
  与 W7 放行引用行同理。(f) preload 在边界处用 `String()` 重建 actor 字面量 —— 单测 mock
  不住结构化克隆,把最后一米做成"无论调用方传什么都是纯量"。

**W7 引用回复 + 房间头部成员头像列 — 已实施(2026-07-28,未提交)**

- **A. 引用回复(快照式)**
  - 数据:`packages/shared/ipc/chat.ts` 新 `ChatMessageReplyTo {messageId, authorLabel, excerpt}` +
    `ChatMessage.replyTo?`(shared 只加这一个可选字段);`SendMessageCommand.replyTo?` 同源类型。
    renderer 的 `types/index.ts` 是 re-export,同步一行即可。
  - 纯逻辑:新 `packages/renderer/components/chat/message/reply-quote.ts` —
    `condenseReplyExcerpt`(空白压平成一行、120 字截断带 `…`)+ `buildReplyToSnapshot`
    (署名缺失回落「成员」、无 id / 无正文一律返回 null,拒绝造空引用块)。7 单测。
  - 透传链(send→persist):`MessageItem → MessageList(replyTo) → ChatPanel(pendingReplyTo)
    → useChatSession.sendMessage(options) → chatStore(命令加 replyTo)
    → StreamEngine.handleSendMessage → **房间走 app/collab/ingress.ts**(房间消息不经核心引擎
    的消息构造,必须在这里也带过去)/ 普通会话走 `packages/core/engine/core-stream-engine.ts`
    的用户消息构造`。core 侧是**具名**透传(`replyTo?: unknown` + 一行 spread),不是泛化口子。
  - 投影(两处同源):`collab/projection.ts` 新导出 `formatCollabReplyQuote`(空摘录返回 '',
    不出裸 `>` 行),`projectRoomHistory` 与生产适配器 `app/engine/stream/message-helpers.ts`
    的 `projectRoomMessagesForModel` 各自在发言块顶部拼一行 —— 形态
    `> 阿明: 摘录…\n用户: 回复正文`。
  - UI:气泡顶部 `.reply-quote`(左 2px 墨线、11px、作者半粗 + 摘录单行截断、3% 墨底),
    点击 → `jumpToMessage` → MessageList 既有 `scrollToMessage`(复用
    `searchHighlightedMessageId` 的 2.6s 高亮窗口,找不到原消息就不动);composer 上方
    新 `ComposerReplyBar.vue`(与气泡块同一语言 + ×),挂载方式与列宽 CSS 复用
    CollabTypingLine 那套(`--chat-composer-width` + 内容列变量 + `.is-layout-animating` 组)。
  - 入口**仅房间**:`MessageActions` 新 `canReply` prop,由 MessageItem 的 `roomMode` 派生
    (pass/未定窗排除);普通会话 canReply 恒 false,一个像素不动。
- **B. 成员头像列**
  - 纯逻辑:新 `packages/renderer/components/chat/room-member-strip.ts` —
    `buildRoomMemberEntries`(名单顺序、PM 标记、**未知 id 照样出章**否则没法踢)、
    `buildAddableRoomAgents`(排除 default 人格)、`planRoomMemberAdd`(幂等)、
    `planRoomMemberRemoval`(PM 走人即 `pmAgentId: null`;最后一人返回 error 文案)、
    `formatRoomMemberTooltip`(名字 · 职务 · 负责人)。~15 单测。
  - 组件:新 `RoomMemberStrip.vue` 挂在 TabBar 房间头部「看板」之前(身份在前、动作在后);
    24px 圆章、`+`-6px 重叠、1px 墨线 35%、PM 加重描边、未知成员虚线;末位 ＋ 同规格虚线圆。
    ＋ 与右键菜单**都复用既有 `ContextMenu.vue`**(不造新浮层);写入一律
    `platformApi.updateCollabRoom`(W6 通道,零新通道);失败/被拒 → 行内 11px 墨灰一行(4s 自散)。
- 单测 +46(4194 → **4240**):reply-quote 7、room-member-strip 15、RoomMemberStrip 7、
  MessageItem.reply 5、ComposerReplyBar 2、MessageList.room +1、collab.test +5、
  willingness +1、room-projection +1、新 `app/collab/__tests__/ingress.test.ts` 3。
  **已做变异测试**:抽掉 ingress 的 replyTo spread、抽掉适配器的 quote 拼接 → 各转红。
- 门禁:vitest 4240 绿 / typecheck 0 / boundary:gate 无新红(26 known)/ ui-token-vars 绿 /
  改动文件 eslint 0 error。
- **偏离**:(a) 意愿判定窗口(`buildWillingnessWindow`)也放行引用行——工单只写两处投影,但
  「这条是回给谁的」正是判定要不要接话的社交信号,不进窗口等于功能只对模型的历史生效不对
  当下判断生效;引用行**并进同一个数组元素**,窗口仍按"最近 8 条消息"而不是 8 行。
  (b) 被引用户消息的 authorLabel 用「用户」而非「你」,与投影里用户的署名同一个名字(一个快照
  两处读,不做 UI/模型两套文案)。(c) 高亮不新增动画:复用 MessageList 既有高亮窗口,房间
  agent 消息的表现是"墨线加深 + 4% 墨洗",只有 120ms 淡入淡出是动效(§3.6 的 200ms 上限内),
  没有 pulse/glow。(d) `pendingReplyTo` 存在 ChatPanel 而不是 InputBox 草稿里:切会话即清空
  ——引用属于挑它的那个房间,跟着草稿跨会话活下来反而是错的。(e) 头像列的 tooltip 用原生
  `title` 而非 Tooltip 组件(表头 6 个章各挂一个浮层组件不划算,且 TabBar 既有按钮就是 title)。
  (f) 引用块画在气泡**之上**(同一竖列的兄弟节点)而非塞进 `MessageBubble` 内部:MessageBubble
  是全应用共用件,为房间独有的块改它等于让普通会话也长出一条分支;视觉堆叠结果一致。

**W1 判定器纯逻辑 + 协调器接入 — 已实施(2026-07-28,未提交)**

- 新 `packages/onething-runtime/src/collab/willingness.ts`(纯逻辑):`buildWillingnessPrompt`(system = persona 原文 + 复用 `buildCollabRoomSystemPrompt` 的情况说明 + 仅 PM 加一行事实;user = ≤8 条 IM 投影 + JSON 指令)、`buildWillingnessWindow`、`parseWillingnessReply`(宽松解析,**回声即否**:模型复读 `{"respond": true|false}` 不算答 true)。单测 `__tests__/willingness.test.ts` 11 例。
- `activation.ts`:`CollabActivationReason` 加 `'self-elected'`、删 `'default-responder'` 与该分支及 `pmAgentId` 入参(pmAgentId 仍是房间字段,只作为"负责人"事实进判定提示);`collab.test.ts` 相关断言改写。
- 新 `packages/onething-runtime/src/app/collab/willingness-runner.ts`:`judgeWillingness(roomSessionId, candidates, recent)` 并行判定,provider 解析 = agent.model 绑定优先 → 房间会话有效配置;每成员 8s 死线(abortSignal + race 双保险),超时/错误/解析失败一律 false;成员 >8 时只判负责人(§2.2 极端保护);记账 source `'collab-willingness'`(新增 `ONETHING_USAGE_SOURCES.collabWillingness` + `billCollabWillingnessUsage`)。
- `coordinator.ts`:`handleRoomUserMessage` 改 async(mention 直接入队 → 其余成员判定 → respond 者以 `'self-elected'` 入队;全员沉默不贴任何系统行,PM-less 提示行删除);harvest 后 cascade 同构(链长闸未到顶才发起判定);判定前查 frozen/预算,判定后复查 frozen(判定期间可能被冻)。
- typing 发出点已打好:`collab:typing` 进 `packages/shared/events/session-events.ts` 联合;入队 emit true、每次驱动前重申 true、驱动终局/pass/失败/重排 emit false、冻结清队对全部排队成员 emit false。渲染层订阅是 W2。
- 门禁:vitest 4053 绿(+11)/ typecheck 0 / boundary:gate 无新红。真机 CLI 自测(§4 W1 验收)未跑。

**W2 typing 渲染层贯通 — 已实施(2026-07-28,未提交)**

- `packages/renderer/stores/collabBoard.ts`:既有 `onSessionEvent` 订阅里加 `collab:typing` 分支 → per-session `Map<agentId, lastTrueAt>`(`typing` ref);新 `typingAgents(sessionId)` **读取时惰性过期**(60s),无常驻定时器;true 复述只刷新时间戳不重排姓名顺序。
- 新 `packages/renderer/components/chat/CollabTypingLine.vue`:`🔧 小李、🔎 小研 正在输入` + 三个 2px 墨点(11px `--ui-text-muted-fg`,透明度 0.3↔0.8,错峰 200ms,1.2s ease-in-out,`currentColor`,无底色无框,`prefers-reduced-motion` 静止)。空名单渲染 null(组件内部自守);仅在有人 typing 时起 1s tick 驱动过期重读,散场即 clearInterval;名字/头像取 agents store,缺失回落 agentId + 🤖;首次需要时才 `loadAgents()`。
- `ChatPanel.vue`:新 `isCollabRoomActive`(kind==='room',work 不显示),composer 内 InputBox 之上渲染;宽度/边距复用 `--chat-composer-width` + 内容列变量(同 goal-bar 手法),并入 `.is-layout-animating` 的列滑动组。普通会话零改动。
- 单测:`stores/__tests__/collab-typing.test.ts`(9 例:进入/离开/顺序/复述不重排/跨房间隔离/60s 过期/续期/独立过期/畸形事件)+ `components/chat/__tests__/CollabTypingLine.test.ts`(5 例:静默渲染 null/名字头像与三点/回落 id/false 与过期消隐/无人时不起定时器)。
- 门禁:vitest 4067 绿(+14)/ typecheck 0 / boundary:gate 无新红 / ui-token-vars 绿。UI 真机截图待 review 阶段。

**W3 IM 气泡化 — 已实施(2026-07-28,未提交)**

- 新 `packages/renderer/components/chat/message/room-grouping.ts`(纯逻辑,19 单测):`isRoomHiddenMessage` / `filterRoomMessages`(复用 `@onething/runtime/collab` 的 `isCollabDriveMessage`/`isCollabPassMessage`,不抄一份)、`buildRoomMessageLayout`(groupHeads/groupTails/capsules)、`formatRoomTimeCapsule`(今天/昨天/月日/跨年)。
- `ChatPanel.vue`:房间会话的 `listMessages` 投影里过滤驱动消息与已落定 pass(不进列表,不留空行);无隐藏项时按引用原样返回。流式中的消息**不看 content**——否则每 16ms 一个 chunk 就会让整列表重渲。
- `MessageList.vue`:房间时 `buildRoomMessageLayout(props.messages)`,时间胶囊(新 `message/RoomTimeCapsule.vue`)作为**同级独立条目**插在消息行前(一消息仍一行、data-index 不变),`roomMode/groupHead/groupTail` 三个布尔 prop 下发;非房间恒为 solo group,普通会话零改动。
- `MessageItem.vue`:房间 agent 消息 = 28px 圆形 emoji 章(1px 墨线 35%)独立列 + 组首署名(名字 12px 半粗 + 职务 11px 墨灰)+ 正文左侧 2px 墨线(无底色,§3.6 二选一取"线");组内非尾消息收到 8px 间距并隐藏 hover footer(28px 操作行塞不进 8px 间隙,会压到上一条文字);pass 未定窗的中性 '…' 对齐发言轴。
- 单测:`message/__tests__/room-grouping.test.ts`(19)+ `chat/__tests__/MessageList.room.test.ts`(3,含胶囊行数与普通会话不变)+ `chat/__tests__/MessageItem.room.test.ts`(4,组首/组内/work 会话/房间用户消息)。
- 门禁:vitest 4089 绿(+22)/ typecheck 0 / boundary:gate 无新红 / ui-token-vars 绿 / 改动文件 eslint 干净。

**W9 任务事实链修复 — 已实施(2026-07-28,未提交)**

- **① 协作系统行进投影**:新 `packages/onething-runtime/src/collab/system-lines.ts`(纯逻辑):来源标记 `collab-task`(任务生命周期)/ `collab-membership`(W6 成员变更)+ 单一判定 `isCollabProjectedSystemLine(message)`(可扩展:新增一类只加一个来源)+ `formatCollabProjectedSystemLine`(形态「系统: <文案>」)。`projection.ts`(规格)与 `app/engine/stream/message-helpers.ts` 的 `projectRoomMessagesForModel`(生产适配器)**同时**放行,willingness 窗口(`buildWillingnessWindow`)同源同规则;运营噪声(预算/排队/链闸/冻结/权限提醒/未应答)继续用 `COLLAB_MESSAGE_SOURCE`,永不进投影。协调器 `postSystemLine(room, content, source?)` + 新包装 `postTaskSystemLine`;worker 的任务行(开始执行/启动失败/成员不存在/进入评审/受阻/执行中断/打回超限/重启中断)全部改走任务行,只有"排队等待执行(并发上限)"仍是运营行。渲染层零改动(system 行本就照常显示)。
- **② 受阻评审语义**:worker `harvestWork` 的 blocked 分支从"只贴一行 `被标记受阻,详见看板`"改为:贴 `buildCollabTaskHaltedLine()` 事实+处置行,并**激活 PM**(此前受阻根本不激活任何人,事故里 PM 是被小李的谎报勾进来的)。文案原文:`「<标题>」受阻:<执行人> 无法继续,任务未交付(原因见看板任务卡)。请负责人决定下一步:重新指派、换人、改方案,或向用户说明——受阻的卡不能按已交付处理。`;交付路径措辞不变。驱动标签拆开:`COLLAB_DRIVE_LABEL_TASK_HALTED='任务受阻待处置'` vs `COLLAB_DRIVE_LABEL_TASK_REVIEW='任务交付待评审'`(`formatCollabActivationLabel(reason, override?)`,`task-event` 原本落到裸 reason 字符串)。**注意**:驱动消息本身不进模型投影(D3 第 4 类),所以处置指令的真正着陆点是①的系统行,标签只是转录/审计信号——把指令只写进驱动等于没写。
- **③ 在飞任务自感知**:`roster.ts` 接受可选 `taskFacts`(纯格式化 `formatCollabSelfTaskFacts`),情况说明后追加一行 `(你名下的任务:#a1b2c3d4「标题」(进行中)、#ffffeeee「标题」(受阻)。以看板上的状态为准。)`;纯事实、无行为指令,空名单不出行。数据由 app 层 `board-store.getCollabSelfTaskFacts(roomSessionId, agentId)`(仅 doing/blocked)提供,注入点两处:房间驱动的 system prompt(`app/engine/prompt/system-prompt.ts`,覆盖全部 reason)与意愿判定(`app/collab/willingness-runner.ts`)。
- 顺手修一处同源分歧:生产适配器的用户块合并遇到"只给人看"的 system/error 行会断开(下游又把它们丢掉 → 相邻两个 user turn),现改为跨 display-only 行回溯合并,与纯规格 `projectRoomHistory` 的"skip 即合并"一致。
- 单测:`collab.test.ts` +13(放行/拒斥矩阵、投影含受阻行且不含预算行、membership 同机制、受阻文案顺序"未交付"在"处置"之前且不含"评审"、驱动标签分支、taskFacts 拼装与空名单);`willingness.test.ts` +2(窗口放行标记行/拒斥排队行、判定 system 带 taskFacts);新 `app/engine/stream/__tests__/room-projection.test.ts`(3,生产链路:reviewer 拿到系统事实、运营噪声不进、普通会话零改动)。
- 门禁:vitest 4136 绿(+17)/ typecheck 0 / boundary:gate 无新红 / 改动文件 eslint 干净。CLI 场景复跑(白名单小李+写文件任务)由主导者做。

**W6 Team(房间)设置面板 + 成员变更链路 — 已实施(2026-07-28,未提交)**

- **纯逻辑**:`packages/onething-runtime/src/collab/system-lines.ts` 新增成员变更文案构造器
  (`buildCollabMemberJoinedLine` / `RemovedLine` / `PmAssignedLine` / `PmClearedLine`)与 diff
  `buildCollabMembershipLines({previousMemberIds, nextMemberIds, previousPmAgentId, nextPmAgentId, agents})`
  → 顺序固定「先来后走再定负责人」,**集合相等即零公告**(换序不是成员变更);未知 id 回落 id 本身。
  公告行沿用 W9 的 `COLLAB_SYSTEM_SOURCE_MEMBERSHIP`,投影放行机制原样复用(未改一行放行逻辑)。
- **app 层**:`coordinator.ts` 新 `setCollabRoomConfig(roomSessionId, {name?, memberAgentIds?, pmAgentId?, permissionMode?})`
  —— 先整体校验(agent 存在 / 至少 1 人 / PM∈成员 / permissionMode 三选一 / 房间名非空),再分头落库:
  成员+PM 走 `updateSessionCollab` 合并、改名走 `renameSession`、权限模式走 `updateSessionPermissionMode`;
  最后贴公告行。**PM 被移出即清空**(校验层兜底,不留悬挂 pmAgentId)。
- **被移出者不再参与判定/激活**:名单**处处现取**(`roomMembers(session)` 每轮从 `store.getSession` 读),
  另在 `driveActivation` 加一道 drive-time 名单守卫——排队中被移出的成员轮到时直接作废,一条驱动都不发;
  排队中(非正在流式的队首)的 typing 立即熄灭。**在飞 work 会话不强杀**(任务照常收割)。
- **五触点**:`COLLAB_ROOM_UPDATE`(channels + shared/ipc/collab.ts 请求/响应类型 + main/ipc/collab.ts
  handler + preload `updateCollabRoom` + renderer types & web 端 desktop-only 名单)。另补 CLI:
  `collab.roomUpdate` daemon RPC + `onething collab update <roomId> [--name] [--members] [--pm ''] [--mode]`
  (拉人/踢人可 CLI 验收)。
- **UI**:TabBar 房间头部「看板」旁 ⚙ 痕迹级按钮 → `components/chat/RoomSettingsDialog.vue`(浮层沿用
  RoomCreateDialog 语言,`--ui-*` token,悬挂墨线 tick 取代原生 checkbox);改名/成员/负责人/日预算/
  权限模式(一行墨灰说明「work 会话继承此模式」)/暂停房间。保存走纯逻辑
  `components/chat/room-settings-form.ts` 的 diff:**只发变化项**,成员+PM+改名+模式合成一次
  `updateCollabRoom`,预算走 `setCollabRoomBudgets`,冻结走 `setCollabRoomFrozen`;无变化直接关窗。
- **旧文案修正**:RoomCreateDialog 的「默认应答人(PM)…没有 @ 的消息由 TA 应答」改为
  「负责人(PM) 可选 / 负责评审与任务分派;群聊中更倾向主动接话(不再是唯一应答人)」;
  `shared/ipc/chat.ts` 的 `RoomConfig.pmAgentId` 注释同步(W1 已删 default-responder)。
- 单测 +31:collab.test.ts +4(公告顺序/PM 空缺不重复点名/换序零公告与 id 回落/投影放行)、
  新 `app/collab/__tests__/coordinator-membership.test.ts` 10(校验矩阵、公告与来源、no-op 零写、
  改名与权限模式分流、**被移出者不驱动 + 仍是成员的正对照**,已做变异测试:抽掉守卫 → 该例转红)、
  `room-settings-form.test.ts` 8、`RoomSettingsDialog.test.ts` 5、`main/__tests__/collab-ipc.test.ts` 4。
- 门禁:vitest 4194 绿(+31)/ typecheck 0 / boundary:gate 无新红(26 known)/ ui-token-vars 绿 /
  改动文件 eslint 0 error。CDP 走查与 CLI 拉人踢人验收由主导者做。
- **偏离**:(a) 工单只写 `{memberAgentIds?, pmAgentId?}`,实际按验收需要把 `name`/`permissionMode` 一并
  纳入同一通道(rename 仍复用 `renameSession` 语义,只是入口收在一处,省掉 UI 端两次往返与半保存态)。
  (b) 成员名单按**集合**比较:UI 勾选顺序不同不算变更,避免误贴公告。(c) 顺手加了 CLI 通道(工单未写),
  因为 W6 验收要求 CLI 拉人/踢人。(d) 设置浮层不做成员头像列/右键菜单(§3.5 C 的头部入口属 W7/W8)。

**W9b 受阻/重试回路结构收口 — 已实施(2026-07-28,未提交)**

- **① 重派必须真执行(死路 bug)**:根因=reducer 的 `move` 只在「打回/blocked/离开 doing」三种情况发事件,**「带 assignee 的卡回到 todo」什么都不发** → 无 `task-assigned` → 无 `scheduleWork` → dump 里零 work 会话。新增事件 `task-requeued`(条件:目标列 = todo && 有 assignee && 不是打回;覆盖 blocked→todo 的解阻重派、done→todo 的重开、backlog→todo)与 `task-done`(move→done,证据落点)。事件优先级 `打回 > blocked > done > requeue > leftDoing`;done/requeue 的处理器自己先 abort 在飞 worker,D6 abort-first 不变量不破。worker 侧新 `requeueWork()` 是 assign/requeue 的**唯一入口**,幂等保护三层:同 assignee 且卡在 doing → 直接返回(绝不双 worker,`activeByTask` 一卡一会话不变量);换人或卡被拉回 todo → abort 在飞会话 + 入 `pendingByRoom`,靠 `spawnWork` 的 finally→`pumpQueues` 在槽位腾出后重起(尊重 per-room 2 / global 4 并发闸与预算闸);已排队重执行时 harvest 不再贴「执行中断…可重新指派继续」(与一拍之后的重起自相矛盾)。
- **② per-task halted 计数**:`CollabTask.haltedCount?`(缺省 0,存 board.json 故重启存活)。reducer 在 `block` 与 `move→blocked` 两处 +1;app 层「打回超限转受阻」也计一次(否则回路能靠 review→todo 绕开闸);**重启中断转 blocked 故意不计**(reconcile 是重启产物不是真受阻,否则几次重启就吃光自动重试预算)。`COLLAB_MAX_HALTS = 2`:worker 受阻路径 `haltedCount >= 2` 时不贴处置行、不激活 PM,改贴停机行;`requeueWork` 在 `byUser === false` 时同样拒绝并明说。**用户永远可推**:每个 board 事件带 `byUser`(reducer 从 actor 派生),用户自己挪卡不受闸限。
- **③ 受阻原因落卡**:`CollabTask.blockReason?`(≤200 字)。board 工具 `reason` 参数原本只有 `block` 用,现同时透传给 `move→blocked`;reducer 存卡,离开 blocked(assign / move 走)时清空(计数是历史,原因只描述当前这次)。worker 受阻路径三级兜底:模型给的 reason → 工作会话末条 assistant 文本(压平空白,≤200)→ 本轮终局(执行超时/被中止/出错),取到就回写卡。受阻系统行的 `(原因见看板任务卡)` 空指替换成 `(原因: <≤80 字摘录>)`,真取不到才保留旧指针。看板 digest 也带 `受阻×N` 与当前原因(处置人一眼看见卡在哪)。
- **④ done 带执行证据**:`report.evidence = { toolCounts }`,由 `collectWorkEvidence()` 从工作会话持久化消息里数 **status === 'completed' 且未 rejected** 的工具调用(失败/被拒的写没写成任何东西,不能充证据),并**排除 `board` 工具**——board 是"谈工作"不是"做工作",事故里那位唯一工具就是 board。证据由代码统计、走 `collab-task` 系统行(模型写不了这条),与模型自己写的交付摘要分道:交付时贴「执行记录: read×2, write×1」,零调用贴「无执行记录:该工作会话没有任何工具调用,交付内容未经实际执行」;非 harvest 路径(房间 turn 直接 complete、无 work 会话)在 PM 被拉来评审**之前**先贴同款证据行;move→done 收尾再盖一次章,无证据的 done 明写「无执行记录:这张卡没有任何工作会话执行痕迹,完成状态未经执行验证」。
- 单测:`board.test.ts` +7(requeue 触发矩阵/打回与无 assignee 不触发/byUser 标记/计数与原因存取与清空/原因截断/digest 受阻可见,并把 doing→done 的既有断言从 `task-halted` 改为 `task-done` 且补 doing→review 仍是 halted);`collab.test.ts` +7(受阻行带原因摘录、长原因截断、无原因保留旧指针、停机行含次数与"等用户决定"且不含处置指令、拒绝重派行明说"没有派出任何执行"、证据排序确定性、交付/done 两条证据行的有证据与无证据分支);新 `app/collab/__tests__/worker.test.ts`(13,真 reducer 喂真 `handleBoardEvent`:解阻重派真起会话、重开 done 与 assign 解阻、幂等不双起、abort-first 后重起且不贴中断噪声、无 assignee 不动、首次受阻激活 PM 第二次闭嘴、超闸拒绝但用户照推、reconcile 不计数、原因三级兜底、证据统计排除 board/失败/被拒、房间剧场路径标无执行记录)。**已做变异测试**:抽掉 reducer 的 `task-requeued` 分支 → 13 例中 5 例红,确认非空转断言。
- 门禁:vitest 4163 绿(+27)/ typecheck 0 / boundary:gate 无新红(26 known,另有 2 条基线红被治愈)/ 改动文件 eslint 干净。CLI 场景复跑由主导者做。
- **偏离**:(a) 未动 `packages/shared/ipc/collab.ts` 与 `CollabBoardPanel.vue`——工单硬约束禁改 shared/renderer,且该面板本就不渲染 `report`(无"顺带展示"的触发条件),新字段对渲染层是无害未知字段;`受阻×N` 的可见性改由看板 digest 承担(模型侧可见)。若后续要在卡上显示,需同步 shared 结构镜像。(b) 闸的豁免口径取"用户**自己的** board 动作(actor=user)",而非"由用户消息激活的链路"——后者无法在 board 层区分(PM 被用户消息激活后挪卡仍是 agent actor),且那正是要止住的回路;代价是超闸后用户需自己挪卡或明确指示,拒绝行已把这条路写在明处。(c) `assign` 仍沿用原有"任何状态都可触发"的语义(未加状态白名单),避免回归。
