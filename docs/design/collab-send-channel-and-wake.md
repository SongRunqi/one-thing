# 发送面统一(channel)与跨房唤醒(wake)

**状态:P0(工具合并)+ P1(wake)+ 修订 R1(§9,send_message 唯一化)均已实施(未提交),2026-08-02。P2/P3 未做。** 实施与设计的偏离见文末「实施勘误」;真机走查未做。
**前置阅读:** `docs/design/agent-im-dm.md`(dm 房拓扑、D4 透明制、D5 送达即激活、D7 union 工具面)、`docs/design/collab-turn-protocol-and-identity.md`(A 改名 say→send_message、C 链长闸解冻)、`docs/design/agent-self-state-variables.md`(agent scope 状态板)。
**缘起:** 狼人杀场景 —— 上帝在私聊发身份牌后,需要一个**机械保证**让玩家回到群里响应。2026-08-01 事故(agent 断言"没收到牌",牌躺在各自私聊房里)补上了认知边界句,但"收到私聊后到群里露面"至今只能靠措辞嘱咐,而 W22 的结论是措辞不构成保证。

---

## 0. 一句话与世界模型

把 `send_message` 与 `dm` 合并成**一个带 channel 的发送面**,并新增 **wake**:私聊送达并被消化后,系统以发送者身份在指定群里补一条 @ 收件人的可见消息,把 TA 在那个群里的存在叫起来。

世界模型只加一条正交原语,不动任何既有底线:

| 原语 | 载体 | 状态 |
|---|---|---|
| **知识跨房** | 状态板(`scope: 'agent'` 变量,每轮整份重发) | 已建成 |
| **注意力跨房** | wake(本方案) | 新增 |

**内容永不跨房**:wake 只搬运"有事找你"这个事实,一个字的私聊正文都不进群。每间房独立上下文、透明制零破例、激活总有理由 —— 三条铁律原样保持。

---

## 1. 现状盘点:这个方案为什么便宜

设计前的走查发现,四件"要新造"的东西里三件已经存在:

1. **`send_message` 已有 `room` 参数**(W18 §4.6,`resolveCollabSayRoomSessionId` 第一优先级),带全套门:成员校验(`COLLAB_SAY_REFUSED_NOT_MEMBER`)、冻结、房间预算、指错房的专用拒绝语(`COLLAB_SAY_REFUSED_UNKNOWN_ROOM`)。跨房发送**机械上已通**,只是工具描述写着"Leave it out",提示词从未教过跨房用法,而且模型没有任何途径学到别的房的 session id(见 §7 开放问题)。
2. **`dm` 落库本来就是 say 执行器**(`dm-tool.ts`:`speakIntoCollabRoom` + 显式 `room`)。合并不是把两条链路拧成一条,是承认它们本来就是一条 —— dm 比 say 多的只有收件人解析、建房、送达即激活三步前奏。
3. **跨房注入清链闸有先例**(collab-turn-protocol-and-identity.md C):dm 注入 pair 房时 `chainCount = 0`,理由是"别处的某个回合决定来这间房说句话,本来就是新输入"。wake 的 poke 落群适用同一条规则。
4. **退役名表只认名字不认参数**(`core/agent-loop/tool-names.ts`)——`say` 别名靠它转发得无缝(参数同形);`dm` 参数不同形(`message`/`to` vs `content`),名字级转发会让 `message` 被 zod strip 后**静默**失效(edit replaceAll 事故的同款陷阱)。初版据此给 dm 造了一个"隐藏真工具",**已被 R1 推翻**(§9):`dm` 同样走退役名表,靠一句逐字的可操作拒绝把"静默失效"变成"一轮重试"(§5 R1)。

---

## 2. 统一发送面

### 2.1 Schema

```ts
send_message({
  content:  string,           // 消息正文(私聊档也用它;吸收 dm 的 message)
  channel?: 'room' | 'dm' | 'gateway',
                              // 缺省按参数推断:有 to → dm,否则 room。
                              // 显式给出时必须与参数自洽(矛盾即拒绝,见 2.3)。
                              // 'gateway' 本期只占坑(P3),调用即拒绝并说明。
  to?:      string,           // dm 档必填:名字#句柄 / #句柄 / 唯一裸名 / 「用户」
  room?:    string,           // room 档:发进哪间群。缺省 = 本回合在答的那间房
  wake?:    boolean,          // dm 档可选:TA 消化完这条私聊后,在群里 @ TA 请 TA 回应
  wakeRoom?: string,          // wake 的目标群。缺省 = 本回合关联的群
  mentions?: string[],        // 原样保留(room 档)
  replyTo?:  string,          // 原样保留
})
```

channel 显式存在而不是纯推断,为的是 `gateway`:远程投递(微信/Telegram,走 `app/channel/` outbound dispatch)的收件人同样是一个 `to` 字符串,届时"有 to = dm"的推断就失效了。本期推断规则覆盖全部两档,模型可以完全不写 channel。

### 2.2 执行器路由

`speakIntoCollabRoom` 与 `sendCollabDm` 保持为两个执行函数不变(它们各自的门与拒绝文案是资产),合并发生在**工具层**:统一入口按 channel 分发。

```
send_message(args)
 ├─ channel=room  → speakIntoCollabRoom(content, room?, mentions?, replyTo?)   [现 say 链路,零改动]
 ├─ channel=dm    → sendCollabDm(to, content)                                   [现 dm 链路]
 │                    └─ wake=true → 登记 wake-followup(§3)
 └─ channel=gateway → 拒绝:「远程投递还没接入。」                                [P3]
```

`tools/builtin/dm.ts` 的契约文件删除,其描述中的四条负重事实(不搬运上下文/用户看得见/可 dm 用户/谈事不干活)并入 `tools/builtin/say.ts` 的合并描述。

### 2.3 校验矩阵

| 情形 | 结果 |
|---|---|
| `channel:'room'` + `to` | 拒绝:「to 是私聊的参数 —— 发给某个人就不要指定 channel:'room'。」 |
| `channel:'dm'` 无 `to` | 拒绝(沿用 `DM_REFUSED_EMPTY_TARGET`) |
| `wake` + `to:'用户'` | 拒绝:「用户没有可唤醒的执行会话 —— TA 收到通知就会看到。」 |
| `wake` + 收件人不在 wakeRoom 成员表 | 拒绝(调用时 fail fast,不等 followup) |
| `wake` + 发送者不在 wakeRoom 成员表 | 拒绝(poke 由发送者署名落群,说话的门就是这道门) |
| `wake` + 本回合无关联群且未给 `wakeRoom` | 拒绝:「不知道该到哪个群唤醒 TA。」 |
| `room`/`wakeRoom` 指向非群或非成员 | 拒绝(沿用 `COLLAB_SAY_REFUSED_UNKNOWN_ROOM`) |

所有拒绝都在调用时给出、措辞可操作(既有纪律)。

---

## 3. wake 机制

### 3.1 三个设计决定

**① 唤醒的载体是一条普通的 @ 消息,不是新激活原语。**
poke = 以发送者署名、经 `speakIntoCollabRoom` 落进 wakeRoom 的一条 say 消息,内容为固定模板(3.4)。@ 短路激活、rel 标注、UI 渲染、幂等窗、冻结/预算门全部免费继承。机械上它等价于"发送者自己回群 @ 了一声" —— 这正是 W22 要的:把措辞嘱咐(「请到群里报到」)换成接口保证。

**② poke 全员可见,不做私密通知。**
透明制零破例,不引入"只给一个人的房内便签"这种新可见性概念。狼人杀里这恰好是对的画面:全群看着上帝挨个点名,玩家逐个报到 —— 仪式公开,秘密的只是牌面,而牌面不在这条链路里。

**③ 兑现时机:收件人的 dm 房回合 settle 之后,不是 dm 落库之后。**
立即兑现会让群房回合与 dm 回合竞速 —— 状态板可能还没写,群里那声"收到"就是空心的。时序护栏做进机制:

```
dm 落库 → 对方 dm 房激活(现 D5 链路,reason 'mention')
        → 对方 dm 回合:读牌、写状态板、(可选)回执
        → 回合 settle ──→ wake 兑现:poke 落 wakeRoom
                            → @ 短路激活对方群房回合(explicit enqueue,同 dm 注入)
                            → 对方带着状态板在群里发言
        └─ 120s 未 settle → 超时兑现(宁可对方没准备好,不能让发起方永远等不到)
```

### 3.2 wake-followup(唯一的新机械件)

`packages/onething-runtime/src/app/collab/wake-followup.ts`(新文件):

- **登记**:`sendCollabDm` 成功且 `wake` 时,记 `{ dmRoomSessionId, targetAgentId, wakeRoomSessionId, senderAgentId, sinceMessageId }`;
- **观察**:订阅目标 agent 在 dm 房、`sinceMessageId` 之后第一个回合的完成(`turn.ts` 已有 settle 语义/`waitForRoomTurn` 可复用);120s 超时兜底(对齐权限降级的 120s 惯例);激活在驱动侧被门拦掉(退休/预算)同样触发超时路径;
- **兑现**:`speakIntoCollabRoom({ room: wakeRoom, content: poke模板 })`,随后 explicit `enqueue(reason: 'mention')` + `chainCount = 0`(与 dm 注入同规则同注释:由头来自别处的回合,是新输入;预算闸照常兜底);
- **失败面**:兑现时撞上冻结/预算,poke 不落、记 crash-log + inspector,不再回执(发起回合早已结束)。发起时能预判的失败都已在 §2.3 调用时拒绝;
- **进程内存活即可**:不做跨重启持久化 —— wake 是秒级跟手的事,重启丢一个 pending wake 的代价是"上帝再 @ 一声",不值得一张持久化表。

### 3.3 预算与链闸归属(已拍板)

poke 落在哪个房就吃哪个房的闸:冻结、预算、幂等全走 wakeRoom 的既有门。发送侧只占一次工具调用。链长按 §3.2 清零 —— 有验真风暴的前科(collab-team-v2 实施),把"poke 风暴绕过断路器"列为真机观察点,预算闸是最后防线。

### 3.4 poke 文案(已拍板:固定模板,不可自定义)

```
@名字#句柄 我在私聊里给你发了消息 —— 看完后请回到这里回应。
```

不可自定义的理由:开放文案 = 开了"用 wake 在群里代言"的口子,与"内容不跨房"打架。要说的话应该发在私聊正文里,或作为普通消息发在群里。

### 3.5 回执

dm 档带 wake 时,成功回执追加一句:
`已发给 小明;TA 会在你们的私聊里回复。TA 读完后,我会在「房名」替你 @ TA 一声。`

---

## 4. 提示词与认知层

- **工具描述**:`tools/builtin/say.ts` 合并版承载全部契约 —— say 现描述 + dm 四条负重事实 + wake 一行("wake: after they read it, an @ goes out in the room asking them to respond there")。`tools/builtin/dm.ts` 契约文件删除;
- **`agent-rules.ts`**:`<rules>` 里三条 dm 规则文字不动,工具写法从 `` `dm` `` 改为 `` `send_message` with `to` ``;
- **`roster.ts`**:`<messaging>` 段补一行事实:「`to` 送进你和某个人的私聊;`wake` 会在 TA 读完后到群里 @ TA」。判定薄档不受影响(它本来就不带 `<your_tools>`);
- **typing 观察器与断路器**(`typing.ts`,按 `COLLAB_SEND_MESSAGE_TOOL_NAME` 认调用):合并后 dm 档的调用也顶着这个名字 —— 打字指示器必须学会看 args(有 `to` 或显式非本房 `room` 的调用,不在当前房亮打字灯),断路器计数语义按现 dm 的口径对齐。**这是合并唯一的行为陷阱,P0 必须带测试。**

---

## 5. Legacy 兼容(R1 修订版,原文见 §9)

**`send_message` 是唯一的发送工具**(用户裁决,2026-08-02):`dm` 不作为工具存在——连隐藏的都不留。

- **`say`**:现有退役名转发(参数同形)原样保留;
- **`dm`**:同样走退役名表(`registerRetiredAgentToolName('dm', 'send_message')`,注册点与 say 别名同处)。参数不同形,所以这是一次**刻意接受的降级**而不是无缝转发:
  - 旧转录模仿出的 `dm` 调用映射到 send_message 后,`to` 是合并面的正式参数,**存活**——调用被正确路由进 dm 档;
  - `message` 被 zod strip 丢弃 → 拒绝语逐字复用 `COLLAB_SAY_REFUSED_EMPTY`(「没发出去:content 是空的」);
  - 模型手里还持有原文,下一轮改用 `content` 重发。代价 = 一轮重试;消息不丢;零额外机械件。
  - 「有收件人、没正文」有**两个入口**,两处必须给同一句话(落地形态见 §8 勘误):
    - `content` 缺席(legacy `dm` 的真实形状)—— `content` 是必填,zod 校验先一步拦下,由工具的 `formatValidationError` 逐字给出那句拒绝;
    - `content: ""`(空串过得了 zod)—— 由 `sendCollabDm` 入口的**空正文提前判**接住,而它必须在**建房之前**:一次空调用不能留下一间空的私聊房。
  - 拆除条件与 say 别名相同(旧转录被摘要压掉/危险区清空)。

被此修订推翻的「隐藏真工具」方案及其 core `hidden` 机制已整体回滚,理由与过程记录在 §9。

---

## 6. 分期与验收

| 期 | 内容 | 新机械件 |
|---|---|---|
| **P0 合并** | channel 参数 + 路由;dm 契约并入 say 契约;`dm` 走退役名表 + 空正文降级(R1);提示词三处同步;typing/断路器适配 + 测试 | 无(纯重排) |
| **P1 wake** | §2.3 校验矩阵;wake-followup(settle 订阅 + 120s 超时);poke 模板;回执;链闸清零;crash-log | wake-followup |
| **P2 房间寻址** | 房间句柄/花名册进提示词,`room`/`wakeRoom` 显式跨房成文化(见 §7) | 待单独设计 |
| **P3 gateway** | `channel:'gateway'` 接 outbound dispatch | 待单独设计 |

**验收走查(狼人杀发牌,P1 完成后真机):**

1. 上帝在游戏群回合内:`send_message({ to:'小明#3f9c', content:'你是狼人。用 variable set scope=agent 记下身份。', wake:true })` —— wakeRoom 缺省命中游戏群;
2. 小明 dm 房回合:读牌、写状态板;
3. 回合 settle → 游戏群出现「上帝:@小明 我在私聊里给你发了消息 —— 看完后请回到这里回应。」;
4. 小明群房回合被 @ 激活,状态板已有身份,答「收到」;不泄露牌面;
5. 上帝对 N 名玩家重复,收齐后开局;
6. 反向验证:dm 房被冻结时 poke 走超时路径照发;`wake` + `to:'用户'` 被调用时拒绝;typing 灯在 dm 档调用时不在群房亮。

---

## 7. 开放问题(不阻塞 P0/P1)

1. **房间寻址**:`room`/`wakeRoom` 显式指定需要模型能"说出一间房",而房间没有句柄体系,session id 从不出现在提示词里。P0/P1 靠缺省值(本回合关联的群)覆盖主用例,显式跨房留给 P2 —— 可能的形状是房间句柄进花名册,与 agent 句柄同一套 codec;
2. **poke 降噪**:上帝连发 8 张牌 = 群里 8 条 poke。幂等窗只挡同目标重复,不挡多目标刷屏。先真机看噪音水平,再决定要不要合并窗(「上帝 @小明 @小王 …」);
3. **`channel:'gateway'` 的收件人语法**:`to` 如何编码渠道身份(`微信:张三`?),与 `packages/gateway/` 的 identity 体系对齐,P3 再议。

---

## 8. 实施勘误(2026-08-02 P0/P1 落地时与设计的偏离,均已按此为准)

- ~~**§5「隐藏真工具」需要一个新机制,已加**~~ **已被 R1 撤销**(见 §9):`hidden` 标志与 runner 派发表/请求 tools 分家已整体回滚,`dm` 改走退役名表 + 空正文降级。
- **legacy `dm` 的降级出口在校验层,不在执行器**(R1 收尾时发现,§9.3 偏离):§5 原文以为 `message` 被 strip 之后调用会带着一个空 `content` 落到 `sendCollabDm` 的提前判上 —— 到不了。`content` 是**必填**,zod `safeParse` 在工具执行之前就失败了,而默认的失败文案是一坨 zod issue,不是一句模型能照做的话。落地形态:`tools/builtin/say.ts` 加一个 `formatValidationError`,`content` 那一档的校验错误逐字翻成 `COLLAB_SAY_REFUSED_EMPTY`,其余照旧逐条列出(把 `mentions` 传错也说成「content 是空的」会把模型引到错的地方)。**没有**改成 `content` 可选:必填是模型面的正确契约,不该为一次过渡期兼容让全体调用失去这条约束。`sendCollabDm` 的提前判**保留**并仍在建房之前 —— 它接的是另一半(`content: ""` 过得了 zod)。两处同一句话,合起来才是「有收件人、没正文一律给同一句可操作的拒绝」。
- **打字灯只能"参数一看得见就熄"**,做不到"一次都不亮":`tool:input-start` 发生在参数开始流的那一刻,那时 args 是空的,而 `tool-input-delta`(带部分参数)走的是 stream channel,不进 EventBus —— 观察器物理上看不到。所以判据在**每一个能看见参数的时刻**生效(非流式 provider 的 input-start 自带参数、input-end、execution-start);流式 provider 的私聊档仍会在参数流的几秒里亮一下随即熄灭,与 W19 §2 已接受的「显式 room 指向别处」是同一种残留,不是新的一类。已带测试。
- **断路器只对 dm 档松口**:§4 说「按现 dm 的口径对齐」,落地为「有 `to`(或显式 `channel:'dm'`)的调用不计进 say 那一格,总数照计」。显式 `room` 指向别的群的调用**仍然**计进 say —— 合并前它就是一次 say,口径不动。
- **多了一条校验:房间档带 `wake` 即拒绝**(§2.3 矩阵没有这一行)。静默忽略会让发起方以为唤醒已经安排好,而它永远不会发生 —— 与矩阵那七条同一条纪律(调用时说清楚)。
- **`send_message` 的 `sendDm` 适配器走动态 import**:模块图上 `dm-tool → say-tool` 这条边早就存在(私聊落库就是 say 的执行器),反向再加一条静态边就是一个环。`SayTool` 的 dm 适配器因此 `await import('./dm-tool.js')`,只在真的发私聊时解析一次。
- **wake 的 settle 信号复用 `collab:turn-active` 的落边**,而不是新造 settle 事件:它就是 `turn.ts` 里回合窗口的 finally,per(房 × 人),已经存在。`waitForRoomTurn` 不适用 —— 回合跑在**执行会话**里,而 wake 只知道那间私聊房。
- **兑现失败留痕落在 inspector 的 `blocked` 那一格**(detail 写明「唤醒未送达:…」)+ 一条 `console.warn`。设计写的「crash-log」是 renderer 侧的机制,主进程没有对应物。
- **`dm` 执行器的两句拒绝改了措辞**(「dm 发不出去」→「私聊发不出去」):模型已经看不到一个叫 `dm` 的工具,拿它当术语说话是指向一个不存在的东西。
- **`<messaging>` 的 wake 那一行只在群房出现**(`mentions: true` 那一档):wake 的缺省目标是"本回合关联的群",而私聊房的回合没有那样一个群,在那里陈述它就是一句用不上的话。`to` 那一行三档都有。

---

## 9. 修订 R1:send_message 唯一化(2026-08-02,用户裁决)

### 9.1 裁决与理由

实施汇报后用户裁定:**send_message 必须是唯一的发送消息工具**。§5 初版的「dm 降为隐藏真工具」被推翻——它为一个 legacy 兼容需求新造了一整套 core 机制(`AgentTool.hidden`、runner 派发表与请求 tools 分家、`planAgentLoopTools` 特判),违背两条仓库惯例:

1. **不为单一消费者造通用机械件**——隐藏工具机制全仓只有 `dm` 一个用户,而它自己就是待拆除的过渡物;
2. **连根拆**(nudge 拆除同款判断)——保留一个模型看不见但真实存在的第二发送工具,是把"两个工具"藏进了地毯下,不是合并。

### 9.2 收缩清单(目标终态)

| 项 | 终态 |
|---|---|
| `tools/builtin/dm.ts` | 删除(含契约、描述、测试引用) |
| `app/collab/dm-tool.ts` 的 `DmTool` | 删除;`sendCollabDm` 执行函数**保留**(它是 send_message dm 档的执行器) |
| core `hidden` 机制 | 全部回滚:`agent-loop/types.ts`、`runner.ts`、`tools.ts`、`engine/agent-loop-runtime.ts`、`tools/registry.ts` 及 runtime 侧 `tools/tool.ts`、`tools/registry.ts`、`app/agent-loop/tools.ts` 的透传;相关新增测试删除 |
| legacy `dm` | 退役名表注册(与 say 别名同处、同注释纪律、同拆除条件),降级语义见 §5 R1 修订版 |
| dm 档空正文提前判 | `sendCollabDm` 入口、**建房之前**,拒绝语逐字 `COLLAB_SAY_REFUSED_EMPTY`(接 `content: ""` 那一半) |
| 校验层降级出口 | `tools/builtin/say.ts` 的 `formatValidationError`:`content` 缺席时逐字 `COLLAB_SAY_REFUSED_EMPTY`(接 legacy `dm` 那一半,见 §8 勘误) |
| 降级路径测试 | 模拟 `dm` 名 + `{to, message}` 参数经退役名派发:断言收到 REFUSED_EMPTY、无消息落库、**无私聊房被创建** |

### 9.3 实施中断与收尾记录

第一次收缩执行到约八成时被用户中止,工作区留有 4 处 typecheck 报错。**已于同日收尾完成**,逐项:

1. ~~`app/collab/__tests__/dm-tool.test.ts:122` 仍引用已删除的 `DmTool`~~ → 该文件改为在测试内自接一次合并面的适配器(`createSayTool({ speak, sendDm: sendCollabDm })`)。不能直接取 `../say-tool.js` 的 `SayTool`:那个模块在这个文件里被 mock 掉了(挡的是落库那一条),它导出的工具也就跟着是假的;
2. ~~`app/collab/dm-tool.ts:134` 缺 `normalizeCollabSayContent` 的 import~~ → 补上;提前判位置不变(建房之前);
3. ~~`tools/builtin/__tests__/send-message.test.ts:11` 仍 import 已删除的 `../dm.js`~~ → 该 describe 改写为「降级出口」契约测试;
4. ~~同文件 `:140` 仍断言 `.hidden`~~ → 删除。

收尾时补上/发现的:

- **`'dm'` 的退役名注册此前没落**,已补在 `app/collab/say-tool.ts` 的 `registerCollabSendMessageLegacyAlias()` 里(与 say 别名同处、同注释纪律、同拆除条件);名字常量 `COLLAB_DM_LEGACY_TOOL_NAME` 与 `COLLAB_SEND_MESSAGE_LEGACY_TOOL_NAME` 并排;
- **偏离一条**:legacy `dm` 的降级出口落在**校验层**而不是执行器的空正文提前判 —— 原因与落地形态见 §8 新增的那条勘误。§5/§9.2 已按此改写;
- 测试落点:`app/collab/__tests__/say-tool.test.ts` 守整条降级(退役名派发 → 逐字 REFUSED_EMPTY → 无消息落库、`createSession` 未被调用即无私聊房);`app/collab/__tests__/dm-tool.test.ts` 守执行器那一半(`content: ""` 在建房之前被拒);`tools/builtin/__tests__/send-message.test.ts` 守契约层(唯一工具名 + 拒绝语不被别的校验错误冒充);
- 验证:`typecheck` 全过、改动文件 eslint 0 error、`boundary:gate` 无新红(26 known,另有 2 条历史红转绿)、`architecture-boundaries` 与 `import-side-effect-free` 通过。~~`src/collab/__tests__` 另有 7 处失败(`collab.test.ts` / `dm.test.ts` / `say.test.ts` / `agent-pair-dm.test.ts` / `willingness.test.ts`),全部是 P0 提示词改写留下的**先存**文案断言(`「房名」` vs `<room name="…">`),与本次收缩无关,未处理。~~ → **已解决 / 已过时(2026-08-03 核实)**:全仓测试基线 **6416 个全绿**,该 7 处不再存在。断言已跟着提示词改写更新到新形态——`collab.test.ts:141`「房名进 name 属性,没房名就不编一个出来」及 `:150` 的转义用例,连同 `plan.test.ts` / `willingness.test.ts` 都已按 `<room name="…">` 标签形态断言(三份文件均可 grep 到 `room name=`);`drive-room-context.test.ts:129` 另立了「不套 `<ChatRoom>` 壳——房名与花名册归 system prompt」的对侧断言。本条保留仅作历史记录,不再是待办。

### 9.4 验收补充(在 §6 走查之外)

- 旧转录风格的 `dm({to, message})` 调用 → 一轮 REFUSED_EMPTY → 模型以 `send_message({to, content})` 重发成功;
- 全仓 grep 无 `hidden` 工具残留、无 `DmTool` 残留;
- 模型视野里(请求 tools 参数、提示词工具清单)有且只有一个发送工具。
