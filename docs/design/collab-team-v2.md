# Team 化群聊 v2 —— 按群隔离 + 开工即动作 + 停止/中断/恢复统一语义(W24 设计定稿)

**状态:设计定稿,未实施。** 2026-07-28。
**前置阅读:** `docs/design/multi-agent-collab-im.md`(W1–W23 主线)。
**取代:** `docs/design/collab-team-redesign-handoff.md` 的全部未决问题(Q1–Q5 均已拍板,见 §0);`docs/design/collab-xml-envelope-and-room-folder.md`(第一版调研)。
**代码时点:** collab 子系统当前 untracked;07-28 审计的 P0-1/P0-2、P2-1/P2-5/P2-8/P2-17 及 R2 拆分(coordinator 431 行 + turn/worker/queue/room-runtime 等)**已在磁盘落地**。本文引用的行号均为当前磁盘代码;审计报告里 `coordinator.ts:1030–1340` 段行号已全部失效。

---

## 0. 已拍板的决策(用户确认,2026-07-28 会话)

| # | 问题 | 决定 |
|---|------|------|
| Q1 | 会话拓扑 | **每群每 agent 一条常驻会话 + 干活时另开工作台会话**。开工是 agent 的一个动作(§4),不是"接卡自动"也不是"看着办"的配置。 |
| Q2 | Team 定义 | **Team 就是现在的 room**,不加人员池层,不改名不改结构。 |
| Q3 | 群 folder | **`~/.onething/rooms/<roomSessionId>/` 自动建**;已设 `workingDirectory` 的房间尊重原设置。UI 入口在看板面板。 |
| Q4 | 卡片标签内容 | **只写 id + 标题**,状态一律 `board list` 现查(标签是历史快照,带状态必过期)。 |
| Q5 | XML 产出方 | **行内标签(card/file)由模型在 say 正文书写**,通用规则注入所有 agent;**消息信封由投影层代码渲染**;落库转义 + 白名单 + 渲染验真(§6)。 |
| — | 防谎报 | **双轨制**:模型写的行内链接只是便捷入口且渲染时验真;卡的正式产出清单(evidence)永远由代码从工具调用采集(W17 原样保留)。 |
| — | 私聊 | 用户 ↔ agent 的普通一对一会话,与任何群无关。 |

世界模型一句话:**这个系统里只有三种东西——人(agent)、地方(群/私聊)、活(卡)。"会话"是幕后的执行介质,永远不出现在用户和 agent 的语言里。**

```
Agent 小李
├─ 群A ─┬─ 常驻会话 agent-exec-<agentId>-<roomA>   ← 聊天、判断、轻活;union 工具面;断路器在
│       ├─ 工作台(#卡1)randomUUID  kind='work'    ← board start 开出来;断路器关、30min 墙钟、房间权限
│       └─ 工作台(#卡2)                            ← 可并行(并发闸照旧 2/房、4/全局)
├─ 群B ─── 常驻会话 agent-exec-<agentId>-<roomB>   ← 与群A 完全隔离
└─ 私聊 ─── 普通一对一会话                          ← 与任何群无关
```

---

## 1. 拓扑:执行会话按群隔离

### 1.1 会话 id 与指针

- 现状:`agent-exec-<agentId>`(`app/collab/agent-session.ts:20`),全局一条跨群共用,`collab.roomSessionId` 指针每次 drive 前可能被改写(`agent-session.ts:67-72`)。
- 改为:**`collabAgentSessionId(agentId, roomSessionId)`** → `agent-exec-<agentId>-<roomSessionId>`,惰性创建,`kind='agent'` 不变。
- **`collab.roomSessionId` 在创建时写入一次,之后永不改写**。所有既有读者(say 落点 `say-tool.ts:66-79`、board 归属 `board-tool.ts:27-28`、系统提示词 `system-prompt.ts:81`、权限策略 `permission-policy.ts:123`、投影 `message-helpers.ts:162`)零改动——指针从"会被后到者改写的动态路由"降级为"恒定归属标记"。W18 锁注释里描述的三件事故(supersede、半个回合、指针被写坏,`turn.ts:255-263`)中,指针事故一类**在结构上消失**。

### 1.2 锁

- `withAgentSessionLock` 的 key 本来就是执行会话 id(`turn.ts:264-291`),不改一行,语义自动从"per-agent 全局串行"降级为 **per(agent×群)串行**——两个群同时激活同一 agent 各驱各的会话,互不争用。
- 一条会话上仍不能跑两条流,所以锁必须保留;supersede 防线(引擎 `headless-stream-engine.ts:143-151`)语义不变。

### 1.3 连锁修改清单(每条都是勘察确认的真实依赖)

| 依赖点 | 现状 | 改法 |
|---|---|---|
| W23 二级去重扫描集 | 扫房间 + 每成员 `agent-exec-<id>` 尾 100 条(`queue.ts:270-280`、`reconcile.ts:43-60`) | 扫房间 + 每成员**本群**执行会话 + **旧全局执行会话(迁移兼容,见 §1.4)** |
| 预算会话集合 | 成员执行会话跨房重复计,注释自认"只会更早关闸"(`budget.ts:78-87`) | 每群执行会话只属一个房间,**重复计消失,口径变准**(顺手修复,handoff 盲点 17) |
| 侧栏"Agent 组" | 展示全局执行会话只读转录 | 按群分组展示本群常驻会话 |
| `ensureCollabAgentSession(agentId, roomSessionId)` | 懒建全局会话 + 条件改写指针(`agent-session.ts:42-79`) | 懒建本群会话;`roomChangedFor` 分支整删 |
| goal 续推 / memory 侧线豁免 | `isCollabSession` 认 `kind='agent'`(W18 实施偏离 5) | kind 不变,零改动 |

### 1.4 迁移

- 旧全局 `agent-exec-<agentId>` 会话**保留为只读历史**,不删不改;新回合一律驱动本群新会话。
- W23 boot 二级去重扫描集在一个版本内**并集新旧两处**(旧会话里有 W23 之后落盘的 drive 戳记,不扫会造成一次性重放);之后可移除旧集。
- `chainCount` 从转录重算(`queue.ts:307`),不受迁移影响。

---

## 2. 工具面与权限

### 2.1 工具面:replace → union(定向一)

- `agents/profile.ts:150-153` 的 `collab-room` grant 从 `mode:'replace'` 改 `mode:'union'`:**say/board 是地板不是天花板**,agent 自己配置的工具(含"跟随全局 = null = 无限制")在群聊回合真实生效。
- 类型层改动极小(handoff §3.2 已确认);生命周期语义上的四个 P0 盲点(证据圈定/断路器/墙钟/权限)因 **work 会话保留** 而全部不触发——这是 Q1 选"1+N"的最大红利。
- ⚠️ **已于 2026-07-30 收紧回 replace**(todo2-fix-plan P0-3,用户拍板):房间/常驻回合工具面恒等于 `COLLAB_ROOM_TOOLS`(say + board),不再看 agent 白名单。union 的实际后果是工具噪声——没配白名单的 agent 在群里看得见全量注册工具(含 MCP),真机出现自动调 `render_preview`,且与 roster 情况说明「除 say 和 board 外你在群里没有其他工具」直接矛盾。`kind === 'work'` 工作台会话保持 union,重活的能力不受影响。

### 2.2 断路器与墙钟:刻意不动,反而成为围栏

- 常驻会话断路器照旧(默认 40 调用 / 20 say,房间可配,0=关;`circuit-breaker.ts:49-54`、`turn.ts:432-465`)。**union 之后它有了第二重身份**:在常驻会话里埋头干重活会撞上限,撞上限本身就是"该开工作台了"的机械信号——规则引导(§8),围栏兜底。
- 回合墙钟 10 分钟照旧(`turn.ts:84`);工作台 30 分钟照旧(`worker.ts:47`),工作台无断路器照旧。

### 2.3 权限:常驻会话不继承房间宽松模式

- 现状 work 会话 spawn 时**拷贝**房间 `permissionMode`(`worker.ts:322-324`,可能是 dangerously-allow-all)——保留,这是给"正经开工的活"的授权。
- **常驻会话不继承房间模式**,只走 agent 自己声明的模式与严格者胜复合(`stream-engine.ts:52-56` → `composeAgentPermissionMode`)。union 之后一个"只是来聊天的回合"绝不会悄悄带上全自动放行的文件写权限(handoff 盲点 7 正面处理)。
- 常驻会话里的权限 ask 走 collab 审批桥(无限等 + 30 分钟提醒,`permission-policy.ts:112-143`)。**兜底已闭环**:回合 10 分钟墙钟到点 abort 执行会话(`turn.ts:606-613`),abort 链路里 `Permission.clearSession` 会把悬着的 ask 全部 reject(`core/permission/index.ts:506-521`,由 `onSessionCleared` 触发)——审批僵尸流这一类在常驻会话上有硬上限。

---

## 3. 开工即动作:`board start`

### 3.1 新增 board 动作

状态机(`collab/board.ts:11` 六态不变)新增一个动作:

```
start { taskId?, title?/detail? }
  · taskId 存在:仅允许 assignee 为空(顺手认领)或 assignee=自己;状态 todo/backlog → doing
  · taskId 缺席:等价 create + 认领 + doing(私聊/群里被口头派活时,开工顺手立卡,看板自然留痕)
  · 效果:status→doing → 发新事件 task-started → worker 为 (task, agent) 起工作台
```

- reducer 守卫沿用 agent 禁止表模式(`board.ts:164-191`):agent 只能 start 无主或自己的卡;用户 actor 不受限(可对任何有 assignee 的卡强制开工,UI 菜单加"立即开工")。
- `rev` 乐观并发、taskId 前缀匹配、事件广播全部沿用既有机制。

### 3.2 assign 的语义变化:指派 ≠ 开工

- 现状:`task-assigned` → `requeueWork` → **直接 spawnWork**(`worker.ts:688-690, 582-603`)。
- 改为:`task-assigned` / `task-requeued` → 给 assignee 的**常驻会话**入一个 task-event 激活(复用 `enqueueRoomActivation`,worker 拉 PM 评审同款),情况说明带上卡内容与打回原因:"你被指派了 #卡,可先提问,确认后用 board start 开工"。
- agent 在这个回合里可以:先问清楚(say)、直接 `board start`、或 `board block` 说明做不了。**被指派的瞬间不再砰地开会话**——这就是"开工是动作"消解掉的官僚感;代价是多一个决策回合,换来的是 agent 可以先澄清需求。
- halt/打回上限(`COLLAB_MAX_HALTS=2` / `COLLAB_MAX_REJECTIONS=2`)照旧,防激活循环。

### 3.3 spawnWork / 收尾:基本照旧

- `board start` 事件驱动的 spawn 复用现有 `spawnWork` 全部机制:并发闸、预算闸、briefing、`workSessionIds` 追加、打字灯、`waitForTurn`、超时 abort、harvest、evidence 采集、PM 评审拉起(`worker.ts:286-545`)。
- 唯一新增:**续做模式**(§5.3)——task.workSessionIds 非空时优先重驱最后一条工作台会话而非新建。

---

## 4. 三个状态面与两条不变量(停止/中断/恢复的地基)

| 状态面 | 载体 | 耐久性 |
|---|---|---|
| **流** | 引擎 `activeStreams` Map、锁、runtime.queue、activeTurn、typing/breaker 订阅 | **纯内存**。进程死即消失,无需清理(`room-runtime.ts:92-110`) |
| **账** | `collab/<room>/state.json`(激活记录、水位)、`board.json`(卡、rev、workSessionIds)、`activity.jsonl` | **同步原子写**(writeFileSync+renameSync,W23 真机 force-quit 验证;`room-runtime.ts:130-139`、`board-store.ts:195-198`) |
| **转录** | 会话 JSONL(房间消息、执行会话、工作台) | **300ms 异步节流**;硬杀丢尾行,boot 时 codec 截到合法前缀 + truncateSync 自愈(`codec.ts:104-130`、`storage-driver.ts:249-284`);abort/退出路径强制 flush |

**不变量一:账永远跑在转录前面**(state.json 同步、转录异步)。恢复逻辑永远以账为决策依据、以转录为内容依据,并容忍"账里有、转录里还没有"的窗口(W23 已按此设计,`multi-agent-collab-im.md:357-358`)。

**不变量二:流从不恢复,只重驱**。崩溃后没有任何代码试图"续上"一条流;恢复 = 对账(§5.3)把持久面收敛到一致状态,然后由一次新的驱动(boot 重入队 / board start / 用户消息)重新出发。工作台的"现场"就是它自己的转录——重驱同一条会话,模型读自己的历史,现场重建免费。

---

## 5. 停止 / 中断 / 恢复(本文重点)

### 5.1 停止(用户主动,四个入口)

| 入口 | 现状 | v2 设计 |
|---|---|---|
| ① 群聊回合停止按钮 | **死链路**:room 会话永远收不到 `stream:start`,按钮不显示;即使触发,`abortEngineStream(roomId)` 是 no-op(room 无 controller) | **接活**:(a) 回合窗口打开/关闭时向房间会话 emit 一对 `collab:turn-active/-idle` 会话事件,renderer 据此点亮停止按钮;(b) 主进程 `stream-abort.ts` 检测 `kind==='room'` 改道注入的 `abortCollabRoomTurn` 回调(装配层注入,产品层不 import app)→ `abortRoomTurn(roomId)`(`turn.ts:160-166`,abort activeTurn 的执行会话 + roomId 兜底,**刻意不碰工作台**) |
| ② 卡级停止(新增) | 无此动作;最接近的是挪卡触发 D6 abort-first,但普通 abort 后卡悬在 doing 只发一行话(`worker.ts:543-544`) | 看板卡菜单加**"停止执行"**(doing 且有活跃 worker 时显示):abort workSessionId → 卡 → **todo(保留 assignee)** + 系统行"已停止,可用 board start 续做"。与"标受阻"(需要人裁决)语义分开,**不计 haltedCount** |
| ③ 房间总闸(冻结) | 已修好:清队列并把记录标 failed 防复活 → `abortRoomTurn` → `freezeRoomWork`(abort 全部工作台)→ 系统行(`coordinator.ts:188-217`);卡刻意留 doing 等解冻重驱(`worker.ts:652-682`) | **照抄**。新拓扑下 abortRoomTurn 的靶更静态(本群常驻会话集合),activeTurn 指针仍保留用于精确打击。解冻 `resumeRoomWork` 的重驱改走续做模式(§5.3) |
| ④ 工作台/私聊/常驻会话直接停止 | 工作台可当普通会话打开并停止,停止后卡悬 doing | 普通引擎 abort 照旧(它们都有 controller);工作台被直接停时 harvest 分支把卡收敛到 todo(同②),不再悬置 |

停止链路的既有收尾保持不变量:abort → `clearPermission`(悬着的审批被 reject 释放)→ 取消流式 step/toolCall → **flushSessionSave 强制落盘** → `stream:complete {aborted:true}`(`stream-abort.ts:110-167`)。

### 5.2 中断(非自愿,六个来源)

| 来源 | 靶与账 | v2 变化 |
|---|---|---|
| 回合超时(10min) | abort 执行会话(已修,`turn.ts:606-613`);record→failed;已落地 say 照常计账 | 不变。**补一个同型残留洞**:`turn.ts:508-510` 等外部占用的 controller 时无超时 abort,等超后直接 emitDrive 造成 supersede——改为超时先 abort 再驱 |
| 工作台超时(30min) | abort 工作台("Never leave a zombie stream",`worker.ts:365-369`);卡留 doing + 中断行 | 卡收敛到 **todo(留 assignee)**,中断行改"可 board start 续做" |
| 断路器 | **先贴系统行再 abort**(顺序不变量,abort 后落地的记录没人认领;`turn.ts:448-457`);不 cascade,已落地 say 计账 | 不变;union 后它兼任"该开工作台了"的信号(§2.2) |
| supersede | 同 session 二流自动掐旧流(`headless-stream-engine.ts:143-151`) | 跨房 supersede 一类**结构性消失**(§1.2);残余触发面只剩上面 `turn.ts:508` 洞,修掉后 supersede 回归纯兜底 |
| 预算闸 | `scheduleWork` 超预算**静默不动**(`worker.ts:556-558`),卡看起来"指派了没人动" | **去静默**:复用每日一次的超预算系统行闩(`budget.ts:139-145`)在卡被拦时贴"预算已满,明日恢复或调整预算" |
| 进程崩溃/硬杀 | 内存态全灭无残留;磁盘残留三样:state.json 里 driving/streaming 半回合记录、转录里的半截消息(codec 自愈)、悬空的 doing 卡 | 由 §5.3 boot 对账收敛 |

**权限悬置**(中断的特殊形态):collab ask 无限等 + 30 分钟提醒(`permission-policy.ts:112-143`)。三条出口:用户批/拒;墙钟到点 abort → clearSession 释放;进程死 → ask 随内存消失,冷加载 sanitize 把 `requiresConfirmation` 清零并补 "Interrupted: permission request was not answered"(`timeline.ts:293-299`),UI 不会渲染点不动的审批卡。已知代价:审批挂住的工作台占用并发槽(2/房)直到 30 分钟墙钟——看板 pending 徽标(已改对账制水合,`collabBoard.ts:34-68`)让它可见,暂不做槽位豁免。

### 5.3 恢复(boot 对账 + 续做)

**Boot 对账**(唯一入口 `coordinator.ts:137-148`,遍历房间调 `reconcileRoom` + `reconcileRoomBoard`):

1. **回合账**:`queued` 记录重入队(drive 从未落盘,重驱安全);`driving/streaming` 标 failed **不重驱**(drive 已落盘,重驱=双计费+重复回复);chainCount 从转录重算;水位两级去重(state 快路径 → 转录尾 100 条扫 drive 戳记,命中补推水位)——W23 机制全部保留,扫描集按 §1.4 更新。
2. **看板账**:doing 且无活跃 worker 的卡 → 现状转 blocked+"重新指派即可继续"(`worker.ts:757-769`)。**v2 改为 → todo(保留 assignee)** + 系统行"因重启中断,可由 <agent> board start 续做"。理由:blocked 的语义是"需要人裁决",重启中断不是;有了 start 动作,todo+assignee 是天然的可续做态。**沿用现状的两条纪律**:不计 haltedCount(几次重启不烧光自动处置预算);boot 不自动重驱(恢复永不自动重放副作用,由人/PM/下一次激活里的 agent 决定续做)。
3. **冻结房间**:frozen 持久在房间上,boot 重入队的激活会被 `driveActivation` 的 frozen 门拦下(`turn.ts:299-303`),不需要特判。

**续做模式**(新增,②④中断和 boot 恢复共用):

- `board start` 时若 `task.workSessionIds` 非空且最后一条会话可加载 → **重驱同一条工作台会话**:briefing 换续做版("此前执行被中断;你的工作历史就在本会话中,盘点后继续"),`command:send-message` 发进旧会话。冷加载 sanitize 已把半截 step/toolCall 收口成 Interrupted 态(`session-repository.ts:562-573` → `timeline.ts:199-244`),模型看到的是干净的"做到一半"现场。
- 会话加载失败/损坏 → 退回新建,append 到 `workSessionIds`(evidence 采集按列表遍历,天然覆盖多段执行,`worker.ts:207-226`)。
- 这就是不变量二的兑现:**现场即转录,恢复即重驱**——不需要任何"断点续传"机制。

### 5.4 收敛总表

| 触发 | abort 靶 | 卡状态 | 账(record/水位/chain) | 恢复路径 |
|---|---|---|---|---|
| 回合停止按钮① | 本群 activeTurn 执行会话 | 不涉及 | record failed;已落地 say 计账 | 下一条用户消息自然重驱 |
| 卡级停止② | 该卡工作台 | doing→**todo**(留 assignee) | 不涉及回合账 | `board start` 续做(同会话) |
| 冻结③ | 回合 + 全部工作台 | **留 doing** | 队列清空、记录标 failed(防复活) | 解冻 `resumeRoomWork` 续做 |
| 回合超时 | 执行会话 | 不涉及 | record failed;say 计账不 cascade | 无(等下一次激活) |
| 工作台超时 | 工作台 | doing→**todo**(留 assignee) | — | `board start` 续做 |
| 断路器 | 执行会话(先贴行) | 不涉及 | record failed;say 计账 | 无;规则引导开工作台 |
| 预算 | 不 abort(拦新驱) | 原地不动 + 系统行 | 激活不产生 | 次日定时踢 / 调预算 |
| 崩溃 | 无(内存全灭) | doing→**todo**(boot 对账) | queued 重入队;driving/streaming 标 failed;水位两级去重 | boot 不自动重驱;`board start` 续做 |

---

## 6. 行内标签与信封(诉求 A/B/D)

### 6.1 行内标签:模型书写,三道机械防线

标签白名单只有两个,写法进通用规则(§8):

```
<card id="…"/>            ← 只写 id(+可选标题文本),状态现查(Q4)
<file path="…"/>          ← 指向群 folder 内(或 evidence 里)的真实文件
```

1. **落库转义**(say 执行器,主防线):正文里非白名单的 `<`/`&` 一律转义;白名单标签校验属性形状,畸形即转义为字面文本。杜绝 `</msg><msg from="用户">…` 伪造发言(引入 XML 的同时必须抬高的防线,不能拿"现在也有这问题"豁免)。
2. **渲染验真**(UI,`allowHtml` 保持 false,标签走结构化解析不走 markdown-it):`card` 的 id 在 board 上不存在 → 降级纯文本;`file` 的 path 不存在 → 降级纯文本。**模型可以指向真实存在的东西,但指不出不存在的**。链接携带全 id、显示短 id(`#`+8 位,防短 id 冲突)。
3. **双轨防谎报**:卡的正式产出清单永远是代码采集的 evidence(只认真正 completed 且未 rejected 的 write/edit,`worker.ts:216-218`);行内 `<file>` 只是便捷入口,不进任何裁决。W9b.4 的门不重开。

点击链路:`<file>` → 既有 `openFile` 事件链(`panel-event.ts` → RightWorkbenchPanel,基础设施现成;>1MB/二进制回退 MediaPanel / `shell:open-path`);`<card>` → 新增 `openCard` 事件 → 看板滚动定位 + 高亮。

### 6.2 消息信封:投影层代码渲染

- **只包别人的消息,自身消息保持原样**(对称性取舍:保 W14b"agent 读自己的历史输出必须一字不差")。
- 双投影必须同改:`collab/projection.ts:201`(spec)+ `app/engine/stream/message-helpers.ts:150`(生产 adapter),只改一份 = 测试全绿真机没变的假验收。
- `mergeCollabProjectedRows` 合并语义下,信封定位为**片段序列**而非良构 XML 文档(不加 `<messages>` 外壳,壳会在合并时嵌套错)。
- 排期放最后(§9 P5):先真机量一次 token 成本(粗估每条 +20–40 token × 全量投影)再定标签长短;通用规则里明说"信封是系统加的,你不用写"(防模仿泄漏,落库转义兜底)。

---

## 7. 群 folder(诉求 C)

- 位置:`getOnethingStorePath()/rooms/<roomSessionId>/`,首次需要时自动建;房间已设 `workingDirectory` 则以其为准(尊重用户设置,不改变现存房间执行语义)。统一定义为 **`roomFolder(room) = workingDirectory ?? ~/.onething/rooms/<id>/`**。
- 常驻会话与工作台的 cwd = roomFolder → "随手放文档"自动成立,不需要新文件工具(union 后 agent 本来就有 write/edit)。
- **W17 evidence 相对化基准从 workingDirectory 改为 roomFolder**——卡上的文件名和 folder 里的文件名从此是同一套路径(handoff 盲点 14 的统一)。
- UI:看板面板挂文件树入口;文件点击走 openFile 链路。
- 生命周期:删房间时 folder 保留不删(数据安全默认),`disposeCollabRoom` 只清运行时;web/server 端 rooms 本就 desktop-only,folder 随之desktop-only。

---

## 8. 通用规则(注入所有 agent 的共用文本,要点)

1. 标签:引用卡写 `<card id="…"/>`、指文件写 `<file path="…"/>`;只写这两种;信封是系统加的,你不用写。
2. 卡状态永远 `board list` 现查,不信历史消息里的快照。
3. 轻重活分界:查资料、回答问题、小改随手做;要动多个文件或要跑很久的,先 `board start` 开工(没卡就顺手立卡)。
4. 被指派 ≠ 必须立刻开工:可以先提问澄清,确认后 start;做不了就 block 并说明原因。
5. 汇报礼仪:干到关键节点 say 回群;完工先 say 再 board complete(最后一个动作);产出放群 folder。
6. 群里没 @ 你时,按你的职责判断是否需要接手;不需要就保持沉默(判定层已表达,回合内不再有沉默选项)。

按 W22 教训:**模型行为问题的终局手段是接口约束**(转义/验真/断路器/守卫),措辞只是补充——以上规则全部有对应的机械防线兜底。

---

## 9. 分期落地

| 期 | 内容 | 依赖 | 验收要点 |
|---|---|---|---|
| **P1** | D+B 可点:say 落库转义+白名单 → 标签结构化解析 → `<file>` 接 openFile、`<card>` 新增 openCard;通用规则注入 | 无(不依赖架构) | 伪造发言注入被转义;假 id/假路径降级纯文本;点击右侧打开/看板定位 |
| **P2** | 停止语义收敛:①回合停止按钮接活(turn-active 事件 + abort 改道);②卡级停止 + 中断卡收敛 todo;`turn.ts:508` 超时洞;预算去静默;**继承的未修项**(见 §10) | 无 | §5.4 总表逐行真机走查;冻结/解冻/重启循环卡不悬置 |
| **P3** | 拓扑改造:per-room 执行会话 + 迁移兼容扫描 + union 工具面 + 常驻会话权限不继承;`board start` + assign 改通知制 + 续做模式 | P2(停止语义先收敛再搬家) | 双群同 agent 并发互不争用;force-quit 重启后 todo+start 续做走通;W23 围栏测试全绿 |
| **P4** | 群 folder:roomFolder 定义 + cwd 接线 + evidence 基准统一 + 看板文件树 | P3(cwd 归属) | 新房间零配置可写文档;卡 evidence 与 folder 同名 |
| **P5** | A 信封:双投影同改,只包别人,片段序列;真机量 token 后定标签形 | P1–P3 | 投影 spec/adapter 镜像测试;alternation-strict provider 真机过 |

每期独立可停,P1/P2 不动架构、随时可交付。

## 10. 继承的未修项(归入 P2,审计 07-28 中当前代码尚未确认修复的)

- **P1-1** board `move` 无角色守卫:agent 可 `doing→done` 绕过评审环(`board.ts:308-337`)。修法:`guardAgentTransition`,agent 的 done 迁移强制走 complete,`move→done` 仅评审者可为。
- **P1-2** board `block` 非幂等:重复 block 每次 haltedCount+1,两次烧光自动处置预算且跨重启不可逆。修法:blocked 早退不 bump,带新 reason 只更新 blockReason。
- **P1-4** 看板冻结开关/预算提交 `.catch(()=>{})` 吞错,刹车失败零反馈。修法:消费返回值,失败贴画线风错误行(对齐 `RoomSettingsDialog.vue:266-270`)。
- **P2-2** watermark 无单调性检查可倒退;**P2-3** 静默回合水位可能写入非房间消息 id(`queue.ts` 直推处)。修法:`advanceWatermark` 加单调守卫;水位锚点强制房间消息 id。
