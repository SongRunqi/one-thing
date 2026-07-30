# Agent 好友化:托管式私聊、Agent 互聊与个人履历(IM 化第二幕)

**状态:P1–P4 四期已全部实施(未提交),2026-07-30。** 实施与设计的偏离见文末「实施勘误」;真机走查未做。
**前置阅读:** `docs/design/multi-agent-collab-im.md`(W1–W23)、`docs/design/collab-team-v2.md`(W24,按群隔离拓扑)。
**代码时点:** collab-team-v2 五期已在磁盘落地(per-room 执行会话 `agent-exec-<agentId>-<roomSessionId>`、`board start`、群 folder 均为现状);本文引用行号为当前磁盘代码。

---

## 0. 一句话与世界模型

collab-team-v2 的世界模型:**人(agent)、地方(群/私聊)、活(卡)**。本方案把"人"补全成 IM 里的**好友**,并新增一种聊天形式:

- 每个 agent 是通讯录里的一个联系人,点开就是和 TA 的**托管式私聊**(A):你说话 → agent 在幕后干活 → 需要说话时 `say` 回来。**对话面上只有对话,没有工作流水**——这正是群聊已经验证的形态,搬到一对一;
- agent 之间也能**私下沟通**(B),用户全程可旁观可插话;
- 每个 agent 有自己的**履历页**(C):和你聊过什么、在哪些群、私下和谁聊过、干过哪些活,分栏可查;
- 侧栏与会话 UI 按 IM 心智重排(D)。

**核心结构决定:私聊就是房。** 用户↔agent 私聊 = 单成员 dm 房;agent↔agent 私聊 = 双成员 dm 房。两者是同一个 `kind='room'` + `room.dm` 机制的两个人数档,coordinator/say/断路器/看板/停止恢复全套围栏一次继承,不新造任何消息通道。

不变的底线:**"会话"仍是幕后执行介质,永不出现在用户和 agent 的语言里**。用户看到的是"和小李聊天";执行会话、工作台是履历页里的"工作过程"。

```
通讯录(侧栏「联系人」区)
├─ 小李 ── 私聊 agent-dm-<agentId>            kind='room', dm, members=[小李]
│    │       ├─ 常驻会话 agent-exec-<小李>-<该房>   ← 判断、轻活、say(自动成立)
│    │       └─ 工作台(#卡n)                       ← board start,重活
│    └─ 履历页(Agents 面板「历史」tab)
├─ 小王
└─ …
群聊
├─ 群A (kind='room')
└─ 小李⇄小王 (kind='room', dm, members=[小李,小王])   ← agent 互聊,用户可旁观插话
```

与现状「直聊」的关系:普通 `kind='chat'` 会话绑 agent(composer AgentSelector)**原样保留**,那是"拉这个 agent 进一场流式对话/任务",工作内容在对话里直播。联系人点开的主线是托管形态;两类在履历页第一栏并列可见。

---

## 1. 已拍板的核心决策(先看全相,细节在 §2–§5)

| # | 问题 | 决定 | 理由 |
|---|------|------|------|
| D1 | 用户↔agent 私聊的载体 | **单成员 dm 房**:`kind='room'` + `room.dm=true` + `memberAgentIds=[a]`,id 约定 `agent-dm-<agentId>`,惰性创建 | 「说话走 say、干活在幕后」的全部机制(ingress 门、执行会话、板卡、断路器、停止/恢复)在 room 上现成;chat 会话形态做不到"工作内容不进对话" |
| D2 | 直聊(chat 会话绑 agent)去留 | **共存**。AgentSelector 现状不动;联系人主线固定托管形态 | 两种形式各有其用:直播式适合"看着它干",托管式适合"交给它干";不没收既有能力 |
| D3 | agent↔agent 私聊的载体 | **双成员 dm 房**,同一机制,id 约定 `agent-dm-room-<a>--<b>`(字典序) | 与 D1 同构;另造 session 间直邮通道 = 零围栏裸奔,否决 |
| D4 | agent 互聊对用户的可见性 | **透明制**:dm 房在侧栏可见,用户可旁观、可随时插话 | 对齐底线——不允许"背着用户密谋"的暗通道;ingress 本就支持用户消息进 room |
| D5 | 谁能发起 agent 互聊 | agent 用新工具 `dm`(惰性建房+捎首条消息);用户也可手动建 | 发起是 agent 的一个动作,与 `board start` 同款哲学 |
| D6 | dm 房的意愿判定 | **免判**:单成员房用户消息直接激活该 agent;双成员房 agent 的 say 直接激活对方 | 一对一里"要不要接话"没有悬念,省 willingness 调用;防乒乓交给链长闸(§3.4) |
| D7 | dm 房常驻会话工具面 | **union(say+board, agent 白名单)**——不同于群房的 replace 收紧(todo2 P0-3) | 私聊托管的本义就是 agent 替你干活;群房收紧的动机(N 个 agent 的工具噪声、与 roster 文案矛盾)在一对一不存在。重活仍由断路器引导 `board start` 开工作台 |
| D8 | 履历页数据从哪来 | **renderer 端从 sessions 全量索引现算**,不新增聚合 IPC | 侧栏 Agent 组已这么做(`Sidebar.vue:305` 注释);archived 隐藏会话已在 `agentSessions` computed 可达(`stores/sessions.ts:115`) |
| D9 | 未读徽标 | **P4 再做**(lastReadAt 水位) | 系统目前无已读概念,独立一层;先立结构 |

---

## 2. A — 托管式私聊(单成员 dm 房)

### 2.1 房间形态与消息流

- id 约定 **`agent-dm-<agentId>`**,`kind='room'`,`room.dm=true`,`memberAgentIds=[agentId]`,惰性创建(联系人首次点开)。`ensureUserDmRoom(agentId)` 与 `ensureCollabAgentSession` 同构(`app/collab/agent-session.ts:44` 手法:derive id → get → create → 恢复 current-session 指针)。房名 = agent name,改名跟随。
- 消息流即群聊现状:用户消息被 ingress 门拦下不自动流(`app/collab/ingress.ts` 头注释),coordinator 观察 `message:user-created` → **免判直接激活唯一成员**(D6,单成员房跳过 `judgeWillingness`)→ drive 进该房的常驻执行会话 `agent-exec-<agentId>-<dmRoomId>`(per-room 拓扑自动成立)→ 思考、工具调用全部留在执行会话,**只有 say 落回对话面**。
- 打字灯(CollabTypingLine)、say 落库转义/验真、回合墙钟 10min、权限审批桥(collab ask 无限等+30min 提醒)全部原样继承。

### 2.2 轻重活分界(与群同款,体验却是私聊的核心)

- 轻活(查资料、回答、小改):常驻会话回合内直接做——D7 的 union 工具面让 agent 白名单真实生效,工具流水天然不在对话面。
- 重活:`board start` 开工作台(没卡顺手立卡),30min 墙钟、并发闸、evidence 采集、卡级停止/续做全套免费。**单成员房的看板就是"我交给小李的活"清单**——看板面板入口保留(默认收起),卡片语义自然成立。
- 断路器照旧(默认 40 调用/20 say),在私聊里同样兼任"该开工作台了"的机械信号。
- 干完 say 汇报;产出落房 folder(`~/.onething/rooms/agent-dm-<id>/`,collab-team-v2 §7 自动成立),`<file>` 行内标签点开——"发文件给你"的 IM 体验由既有机制拼出来,零新代码。

### 2.3 身份、权限与规则

- persona:roster/系统提示词链路对单成员房照常工作;roster 只有自己+用户,情况说明措辞按 dm 场景微调("这是你和用户的私聊,你替 TA 办事")——提示词层小改,机制零改。
- 权限:常驻会话不继承房间宽松模式、与 agent 声明严格者胜复合(collab-team-v2 §2.3)原样;工作台 spawn 拷贝房间 permissionMode 原样——用户可在这间房上给小李配"放手干"模式,只影响正经开工的活。
- 停止/中断/恢复:collab-team-v2 §5.4 收敛总表逐行适用(回合停止按钮、卡级停止、房间总闸、boot 对账、`board start` 续做)。**私聊获得了 chat 会话从未有过的可恢复性**——这是选 room 载体的最大红利。

---

## 3. B — agent ↔ agent 私聊(双成员 dm 房)

### 3.1 房间形态

- `kind='room'`,`room.dm=true`,`memberAgentIds=[a,b]`(字典序),id 约定 **`agent-dm-room-<a>--<b>`**(双横线防 agentId 内含横线歧义),幂等:同一对 agent 永远同一间房。
- 房名 = "小李 ⇄ 小王"(现算,改名跟随)。无 pmAgentId。
- RoomConfig 增 **`dm?: true`** 可选布尔(`packages/shared/ipc/chat.ts:139`),向后兼容;单/双成员房共用此标记,人数即形态。

### 3.2 复用清单(全部零改动或近零改动)

| 机制 | 复用情况 |
|---|---|
| ingress 门、用户插话 | 原样。用户消息即普通房间消息 |
| per-room 执行会话 | 自动成立,dm 房就是 room |
| say 落库转义/白名单/验真、幂等窗 | 原样 |
| 断路器、回合墙钟、水位、boot 对账、冻结、预算 | 原样;预算每房独立计 |
| 权限桥、常驻会话不继承房间模式 | 原样 |

### 3.3 差异点

1. **免判激活**(D6):双成员房里 **agent 的 say 直接激活对方**;用户插话仍走既有 mention/判定逻辑(旁注一句不该强制拉起两个回合)。
2. **工具面**:双成员房维持群房的 replace 收紧(say+board+dm)——它是沟通场不是干活现场,正经活回大群立卡(规则引导,§5)。
3. **链长闸默认收紧**:双成员 dm 房 `budgets.maxChain` 默认 6。最大风险是客套乒乓("收到""辛苦了"无限循环,W14d 重复发言的变体);链长闸机械止损。

### 3.4 发起:`dm` 工具

- 新工具 `dm { to: agentId, message: string }`,注入群房工具面(`COLLAB_ROOM_TOOLS` 扩为 say+board+dm)与私聊房常驻会话。
- 执行:校验 to 存在且 ≠ 自己 → `ensureAgentDmRoom(self, to)` → 以 self 身份把 message 作为 say 落进 dm 房 → 复用 `enqueueRoomActivation` 激活 to。
- 防滥用:say 幂等窗生效;dm 房链长闸独立;**dm 不自动搬运上下文**——发起方要背景自己在 message 里写,或引导对方 `board list` 现查,杜绝群历史整段转运的 token 洪水与信息越权。
- 用户↔agent 私聊房里 agent 也可 `dm` 第三方("我去问下小王")——形成 用户→小李→小王 的转办链,链长闸与预算逐房独立兜底。

---

## 4. C+D — 履历页与 UI

### 4.1 侧栏 IM 化(`Sidebar.vue`)

现状区块:群聊 / Agent 组(执行会话只读)/ 会话。改为:

```
联系人                         ← 新增,agents 列表(AgentAvatar + 名字 + title)
  小李 [产品经理]                 点击 → 打开/惰性创建 agent-dm-<id> 私聊房
  小王 [工程师]                   右键 → 查看履历 / 配置 Agent(requestAgentDetail 现成)
群聊
  群A
  ▸ 私下                       ← 双成员 dm 房折叠分组,房名"小李 ⇄ 小王"
会话                            ← 现状(直聊会话在此;单成员 dm 房从群聊列表排除,归联系人区)
```

- 联系人数据源:`agentsStore.agents`(已含 avatar/avatarImage/color/title)。
- `roomSessions` computed 按 `room.dm` + 人数拆三路:普通群 → 群聊区;双成员 dm → "私下"分组;单成员 dm → 不在群聊区出现(联系人行即其入口)。
- "Agent 组"区退役,其只读转录入口迁进履历页(§4.2)——基础设施转录放通讯录层级是错位的。

### 4.2 履历页:Agents 面板「历史」tab(`AgentsPanelContent.vue`)

agent 详情增加"历史"tab,四栏分组(画线风列表,行=会话,列=名称/最后活跃/条数):

| 栏 | 过滤条件 | 点击行为 |
|---|---|---|
| 与你的对话 | 私聊房 `agent-dm-<id>` 置顶 + 直聊会话(`kind='chat'` 且 `agentId=<id>`) | 打开该会话 |
| 群聊 | `kind='agent'` 且 id 前缀 `agent-exec-<id>-`,按 `collab.roomSessionId` 映射群名;私聊房的执行会话标注"私聊·工作过程" | 只读转录(侧栏 Agent 组既有呈现平移) |
| 私下 | 双成员 dm 房且成员含该 agent | 打开 dm 房 |
| 干过的活 | `kind='work'` 且执行 agent 为该 agent,按卡分组 | 只读转录;卡状态 `board list` 现查不入快照(Q4 纪律) |

- 全部 renderer 端现算(D8):`sessionsStore` 全量列表 + `collabBoard` store 既有数据面。
- 空态:"还没和小李聊过 → 发起对话"。

### 4.3 会话 UI

- **私聊房(单成员)**:header = AgentAvatar(大)+ 名字 + title;隐藏成员条与签名气泡(一对一无需署名,say 即 TA 说话);CollabTypingLine 保留("小李正在输入…");composer 无 AgentSelector(身份即房间)。**工作状态透出**:有活跃工作台时 header 侧挂徽标"正在干活 · #卡"(数据 = collabBoard store 既有 doing+worker 对账),点击 → 工作台只读转录——"想看过程点进去看,不看就等 say"。
- **双成员 dm 房**:复用群聊全套(签名气泡、RoomNoticeLine);`RoomMemberStrip` 换紧凑双头像形态;用户插话气泡加"旁观插话"弱标识(样式区分,不改数据)。看板面板隐藏(沟通场)。
- **群聊 → 私聊动线**:群里 agent 签名气泡头像/名字点击 → 联系人卡(头像、title、description + 两按钮:私聊 / 履历)。**群里认识的人,点头像就能私聊**——IM 心智的关键一跳。
- **停止按钮**:collab-team-v2 P2 的 `collab:turn-active/-idle` 事件对私聊房同样点亮——私聊里"让它停下"与群聊同一套语义。

---

## 5. 通用规则增补(注入所有 agent,机械防线兜底)

1. 私聊里用户交代的事就是你的活:轻活直接做完 say 结果;重活先 `board start` 立卡再干,干到节点 say 汇报(兜底:断路器、墙钟)。
2. 想和某个成员单独对齐细节,用 `dm`;聊出的结论回大群 say 一句(兜底:透明制 UI,用户看得见)。
3. dm(双成员)是沟通不是干活现场;要动手的活回大群立卡(兜底:双成员房无重活工具面)。
4. 不要客套空转;没有新信息就停(兜底:链长闸 6 + say 幂等窗)。
5. 被问到群里的事,用工具现查不凭记忆(兜底:卡状态验真,Q4)。

---

## 6. 分期落地

| 期 | 内容 | 依赖 | 验收要点 |
|---|---|---|---|
| **P1 托管私聊** | RoomConfig.dm 字段;`ensureUserDmRoom`;单成员房免判激活;dm 房常驻会话 union 工具面;侧栏联系人区;私聊房 UI(header/隐署名/隐 AgentSelector) | collab-team-v2 P3 拓扑(已落地) | 点联系人即聊;工具流水不进对话面;轻活回合内完成、重活 board start;停止/重启对账走 §5.4 总表 |
| **P2 履历页** | 「历史」tab 四栏聚合;侧栏 Agent 组迁入退役;工作状态徽标+工作台只读跳转 | P1 | 四栏过滤准确;archived 执行会话可达;卡标题现查 |
| **P3 agent 互聊** | `ensureAgentDmRoom`;`dm` 工具+工具面扩容;双成员免判激活;链长闸收紧;侧栏"私下"分组+双人房 UI;通用规则注入 | P1(共用 dm 标记与免判分支) | 群回合里 dm 建房送达;乒乓被链长闸掐断;用户插话/停止/冻结/重启全绿 |
| **P4 已读水位** | lastReadAt per 会话;联系人/群聊未读徽标;dm 房新内容提示 | P1–P3 | 徽标不误报;水位持久化 |

每期独立可停;P2 纯读不碰引擎。

## 7. 开放问题(非 blocker,实施期再拍)

- **dm 工具滥用面**:恶意注入诱导 agent 给全员群发 dm——链长闸+预算止损,可再加建房频率闸(每 agent 每日 N 间新房)。
- **通知**:用户不在场时私聊/互聊房聊出重要结论,除未读徽标外是否系统通知?倾向不做,等真机诉求。
- **server/web 端**:rooms 现为 desktop-only,托管私聊随之 desktop-only;直聊(chat 会话)全端可用。P 后期如要 web 私聊,走 rooms 上服务器的大议题,不在本方案内。
- **agent 记忆**:私聊多了之后"小李记得你说过什么"是否需要 per-agent 记忆侧线——当前 memory 是用户维度,本方案不动,留给 memory 路线。
- **直聊与托管的迁移感**:用户习惯直播式后切托管可能觉得"看不见过程"——工作状态徽标+工作台只读转录是解法,若不够再考虑对话面内联"过程摘要行"(慎做,别把工作流水又请回来)。

---

## 8. 实施勘误(2026-07-30 落地时与设计的偏离,均已按此为准)

- **免判激活的手法**:两档人数统一为「在纯规则里合成一条隐式 mention」(`collab/activation.ts` 的 `dmSoleMember`/`dmPairPeer` → `resolveDmImplicitMentionId`),因此与 @ 走完全同一条 enqueue→driveActivation 路径,冻结/预算/链长/断路器/退休全部围栏自动继承,免的只有 judgeWillingness。
- **§2.3 引用的"矛盾文案"落地时已不存在**:群房 roster 文案已随工具面 union 回滚一起改写,dm 版情况说明是新写(`buildCollabDmContext`/`buildCollabPairDmContext`),群版零改动。
- **工具面隔离**:单成员私聊走独立 `collab-dm` grant(union);pair 房走 `collab-room` grant 与群房同解——群房那格将来若收紧,私聊不被连带、pair 被连带(符合 D 差异点 2 意图)。群房 union/replace 的在途冲突(先存红 profile.test.ts)原样保留未裁决。
- **§5 规则 3 在单成员 dm 版改写**:「正经活回大群立卡」对用户↔agent 私聊是假话,改为「该你干的活在这间私聊里立卡干」;群版与 pair 版保留原文。
- **dm 工具加了 kind 门**:普通 chat 会话不但不注入,执行器还直接拒(注册表对无白名单 agent 全量可见,纸面注入面拦不住)。
- **死房兜底落了 11 条路径**(退休/查无此人/冻结/预算/名册变更/会话打不开/合法沉默/回合失败等),含 dm-only 的「这一轮没有说话」;引擎未绑定是轮询重试不是死路。
- **改名同步点**:dm 房名在 ensure(点开)时同步,不挂 agent 改名链路;房名只是显示层,归属读 memberAgentIds。
- **renderer 用 identity/presence 须走叶子 alias**(`@onething/runtime/agents/{identity,presence}`,已登记):agents barrel 拖 node fs,进浏览器包会炸;已用 web:build 产物取证。
- **P4 水位是两个时间戳**(readAt+inboundAt,单 readAt 重启后红点凭空消失),落 renderer 侧 app-state 补丁通道,不动 session meta;徽标是墨点不是数字(系统只知道"有没有",编数字不可靠);只主窗口 hydrate/落盘(副窗口跟写会让红点诈尸);web 端刷新丢水位(rooms 本就 desktop-only)。
- **RoomSettingsDialog 对 dm 房收窄**:成员编辑改只读、PM 格隐藏(pair 加人会把私聊变群,P1b 发现的形态破坏口)。
- **看板对单成员 dm 房保留**(「我交给 TA 的活」),对 pair 房隐藏(沟通场)——与 §4.3 原文一致,但 CollabBoardPanel 的房间选择器对两者都可见(板数据本身不藏)。
- **遗留待真机**:全链路未做 UI 走查;`agent-loop-runtime.ts` 的工具白名单兜底口径未接 dm 分支(今天与主口径同解,群房收紧时需同步)。
