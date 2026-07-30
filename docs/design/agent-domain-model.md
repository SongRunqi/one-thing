# Agent 域模型:从「提示词预设」到「同事」

**状态:A0–A3 四期已全部实施(未提交),2026-07-30。** 实施与设计的偏离见文末「实施勘误」。
**前置阅读:** `docs/design/agent-im-dm.md`(IM 化第二幕,本文是它的地基)、`docs/design/agent-capability-profile.md`(能力档案,B0–A2 已落地)。
**定位:** 本文只管「Agent 是什么」——域模型、分类、生命周期、解析纪律、归属推导。IM 的房间/履历/UI 在 agent-im-dm.md;两文共用决策编号不共用。

---

## 0. 现状诊断:一个字段袋,三个时代,四类住户

`AgentDefinition`(`packages/shared/ipc/agents.ts:13`)是三个时代叠加的沉积层:

1. **预设时代**:id/name/systemPrompt/tools——「给会话换个系统提示词」(AgentSelector);
2. **群聊时代**:title/avatar/avatarImage/color/description——roster 署名与成员条(W 系列);
3. **能力档案时代**:model/toolGrants/permissionMode/maxTurns——执行期守卫(`resolveAgentProfile`,`app/agents/profile.ts:32`)。

字段袋本身问题不大,真正的债在**语义层**:

- **四类角色混居无分类**:default 主助理、用户创建的"同事"、`radio-dj` 这类系统后台角色、(前瞻)外部 agent 连接器,全是同一张表里的平等一行。后果是硬编码过滤散落——renderer 会话列表里 `s.agentId !== "radio-dj"` 写了两处(`packages/renderer/stores/sessions.ts:90,122`),每加一个系统角色就要再撒一遍。
- **身份解析有静默冒充**:`getAgent` 找不到时回退 default agent(`packages/onething-runtime/src/agents/store.ts:297-301`)。调用方要自己防(`agent-session.ts` 的 `agent.id !== agentId` 校验),漏防一处 = default agent 冒充别人。删 agent 后这不是理论风险,是必然现场。
- **删除是硬删**:历史消息署名、房间 roster、履历引用全部悬空,由上一条的冒充机制"兜底"——双重错误互相掩护。
- **id 约定开始蔓延**:`agent-exec-<id>-<room>` 在 `@onething/runtime/collab`,IM 方案又要加 `agent-dm-<id>`、`agent-dm-room-<a>--<b>`——没有单点属主,迟早有人反解字符串。

接下来的开发(联系人、私聊、履历、agent 互聊、外部 agent)全部踩在「agent 是谁」上。先把地基抽象清楚,IM 化才不是在流沙上盖楼。

---

## 1. 已拍板的决策(全相)

| # | 问题 | 决定 | 理由 |
|---|------|------|------|
| M1 | 域模型形状 | **四面模型:身份/心智/能力 三面存储,在场一面推导**(§2)。不拆接口,拆**投影**:`AgentDefinition` 存储形状兼容,新增三个投影 selector 声明调用方要哪一面 | 拆接口 = 全量 churn 零收益;拆投影 = 调用点自文档化(roster 拿身份、引擎拿心智、守卫拿能力),还能挡住"roster 里带出 systemPrompt"这类越面引用 |
| M2 | 分类 | 新增 **`kind: 'colleague' \| 'service'`**,缺省 colleague。radio-dj 迁 service;联系人区、roster 候选、群成员选择器、AgentSelector **只收 colleague**;service 不进任何社交面 | "IM 里的朋友"只对同事成立;系统角色(DJ、未来的调度执行体)是后台设施。分类落库后,renderer 两处 radio-dj 硬编码换成 `kind` 过滤,以后加系统角色零散点 |
| M3 | 生命周期 | 新增 **`status: 'active' \| 'retired'`**。UI 的"删除"= 退休:身份面永久保留(墓碑),退出联系人/roster 候选/激活目标;真硬删只留给"从未被引用过"的 agent | 历史消息署名、履历、房间成员引用永不悬空;这是 IM 化「履历页」成立的前提——人走了,档案还在 |
| M4 | 解析纪律 | **废除静默 fallback**(`store.ts:297-301`)。三态 API:`findAgent(id): A\|null`(严格)/ `requireAgent(id): A\|throw`(执行链)/ `displayAgent(id): 身份投影`(渲染,retired 也返回,未知 id 返回占位墓碑"已注销") | 冒充机制连根拔;渲染永不炸、执行永不冒充——两个诉求分开满足,而不是用一个 fallback 同时糊两个 |
| M5 | default agent 定位 | **default = 主助理,kind colleague,联系人区置顶,不可退休不可删**。它就是"这个 app 本人"作为第一个同事 | IM 心智里主助理是第一位好友;`DEFAULT_AGENT_ID` 的既有兜底语义(无 agentId 会话的 persona)不变 |
| M6 | id 约定属主 | **单点模块** `@onething/runtime/agents/identity.ts`:所有 `agent-*` 派生 id 的构造函数集中于此(exec/dm/dm-room,吸收 `collab.ts` 里的 `collabAgentSessionId`);**全库纪律:id 只做幂等键,归属永远读 `collab.roomSessionId` / `room.memberAgentIds` / `session.agentId`,禁止反解字符串** | IM 方案新增两族 id,蔓延前收口;"禁反解"写进 CLAUDE.md 级纪律 |
| M7 | 执行体前瞻 | 预留 **`executor?: { type: 'native' } \| { type: 'external'; connectorId: string }`**,缺省 native。本期只定义语义不接线 | 外部 agent(ClaudeCodeConnector 'claude-code-agent')终局是"通讯录里一个由外部执行体驱动的同事"——身份/能力面共用,只有心智面的驱动方式不同。现在留缝,将来不用改形状 |
| M8 | session.agentId 语义 | **按 kind 定义一次,写进类型注释**:`chat`=直聊 persona 绑定;`agent`=执行会话属主;`work`=工作台执行者;`room`=禁用(房间无单一 agent) | 同名字段四种含义靠口口相传是事故温床;不改数据,只把契约写死 |

---

## 2. 四面模型

```
AgentDefinition(agents.json,存储真源)
┌─ 身份 Identity ────────────────────────────────┐  被引用的最小面。变更要广播(署名/联系人跟随),
│  id · name · title · avatar · avatarImage      │  retired 后永久保留(墓碑)。
│  color · description · kind · status           │  消费方:联系人区、roster、签名气泡、履历页、
└────────────────────────────────────────────────┘  联系人卡、墓碑渲染。
┌─ 心智 Mind ────────────────────────────────────┐  驱动一个回合时装配的东西。
│  systemPrompt · model(AgentModelBinding)       │  消费方:prompt builder(system-prompt.ts:99)、
│  · executor(M7 前瞻)                            │  coordinator 模型盖章、(前瞻)外部连接器。
└────────────────────────────────────────────────┘
┌─ 能力 Capability ──────────────────────────────┐  执行期守卫。经 resolveAgentProfile 与
│  tools · toolGrants · permissionMode · maxTurns │  session/settings 复合成 EffectiveAgentProfile
└────────────────────────────────────────────────┘  (app/agents/profile.ts,已落地,不动)。
┌─ 在场 Presence(不存储,永远现算)──────────────┐  这个人「在哪、干过什么」。
│  dmRoom · rooms[] · execSessions[] · work[]    │  从 sessions 索引 + board 按 id 推导
└────────────────────────────────────────────────┘  (agent-im-dm.md D8 的履历数据面)。
```

三条铁律:

1. **在场面永不落库。** agent 记录里不出现 roomIds/sessionIds 列表——归属存在房与会话上(`memberAgentIds`/`agentId`/`collab`),agent 侧只有推导视图。存两边必分叉,这是 sessions 双仓储教训的同款。
2. **投影是访问路径,不是新真源。** `agentIdentity(a)` / `agentMind(a)` / `agentCapability(a)` 三个纯函数(shared 层),调用方按需取面。lint 级约束可后补,先靠 review 纪律。
3. **能力复合链不动。** `EffectiveAgentProfile` 的 agent×session×settings 复合已经是对的抽象,本文只是给它一个名分(能力面)。

---

## 3. 分类与生命周期

### 3.1 kind:同事与设施

- `colleague`(缺省):人格化,进联系人、可私聊、可进群、有履历。
- `service`:后台角色(radio-dj;将来的调度执行体、评审器等)。有身份面(日志/账单里要认得出),**无社交面**:不进联系人、不可被 dm、不进 roster 候选、AgentSelector 不列。
- 迁移:`radio-dj` 落库 `kind:'service'`;`stores/sessions.ts:90,122` 两处硬编码换 kind 过滤(保留 id 兜底一版,防旧数据无 kind)。
- 判定归一:`isColleague(a)` 进 shared 投影层,所有社交面消费点用它,不再各自写条件。

### 3.2 status:退休不是删除

```
active ──退休(UI「删除」)──▶ retired ──(仅从未被引用时)──▶ 硬删
   ▲──────恢复(可选,低优)──────┘
```

- retired 的行为矩阵:

| 面 | active | retired |
|---|---|---|
| 联系人/roster 候选/激活目标/AgentSelector | ✓ | ✗ |
| 历史消息署名、履历页、房间成员条(旧房) | ✓ | ✓(灰显 + "已注销"徽标) |
| 私聊房/dm 房 | 正常 | 房保留转只读,系统行"小李已注销" |
| `findAgent` | 返回 | 返回(带 status,调用方按场景过滤) |
| 激活链(coordinator/willingness/dm 工具) | ✓ | ✗(dm 到 retired → 工具报错文案) |

- "从未被引用"的判定:presence 推导为空(无任何会话/房/卡引用该 id)。引用过就只能退休——这条让 M4 的墓碑渲染永远有据可查。

### 3.3 default agent

- `DEFAULT_AGENT_ID='default'`:主助理。不可退休、不可删、kind 恒 colleague、联系人区置顶。
- 它同时继续承担"无 agentId 会话的 persona 兜底"——这是**功能语义**(谁来当默认人格),与 M4 废除的**解析 fallback**(查无此人时冒充)是两件事:前者保留,后者根除。

---

## 4. 解析纪律(M4 的落地形状)

```ts
// packages/onething-runtime/src/agents/store.ts — 替换现 getAgent
findAgent(id): AgentDefinition | null        // 严格查找,查无此人 = null
requireAgent(id): AgentDefinition            // 执行链用,null 即 throw(工具报错文案兜底)
displayAgent(id): AgentIdentity              // 渲染用:active/retired 均返回身份投影;
                                             // 未知 id 返回占位墓碑 { id, name:'已注销', kind:'colleague', status:'retired' }
defaultAgent(): AgentDefinition              // 功能兜底,语义显式化(替代 fallback 的正当用途)
```

- 迁移:全库 `getAgent(...)` 调用点逐个归位到四者之一(勘察显示调用点集中在 collab/prompt/ipc 三片;`agent.id !== agentId` 的手工防冒充校验随迁移**整删**——机制解决后纪律代码退役)。
- renderer 侧 `agentsStore.getAgent`(`stores/agents.ts` 的 `|| defaultAgent.value` 同款 fallback)同步改造,镜像同一套三态。
- 过渡期兼容:保留旧 `getAgent` 一个版本,内部 = `findAgent ?? defaultAgent()` + `console.warn` 埋点,烧完调用点后删。

---

## 5. 归属推导单点(M6)

`packages/onething-runtime/src/agents/identity.ts`(product 层,Electron-free):

```ts
execSessionId(agentId, roomSessionId)   // agent-exec-<a>-<room>   ← 从 collab.ts 迁入
userDmRoomId(agentId)                   // agent-dm-<a>
agentDmRoomId(a, b)                     // agent-dm-room-<x>--<y>(字典序)
isAgentInfraSessionId(id)               // 供列表排除:exec/dm 前缀族的唯一判定点
```

- **只有构造,没有解析**——不提供 `parseAgentIdFrom(sessionId)` 之类的反函数,让"禁反解"在 API 形状上成立。
- 在场推导 `app/agents/presence.ts`(app 层,吃 sessions store):`listAgentPresence(agentId)` → `{ dmRoomId, rooms[], execSessions[], workSessions[] }`,即 agent-im-dm.md 履历页(D8)与"删除前引用检查"(§3.2)的共用数据面。renderer 端从 sessionsStore 现算的镜像 selector 同步一份(desktop IPC 省一跳;两份逻辑以 shared 纯函数收敛,吃 `SessionIndexEntry[]` 进、presence 出,避免两处口径漂移)。
- 新 runtime 子路径 `@onething/runtime/agents/identity` 照例登记 `onething.aliases.ts`(唯一一处,四配置自动继承;vitest 易漏的教训记在案)。

---

## 6. 与在途开发的对齐

| 在途线 | 对齐点 |
|---|---|
| agent-im-dm P1(托管私聊) | `userDmRoomId` 出自 identity.ts;联系人区 = `listAgents().filter(isColleague & active)`;死房兜底里"agent 不存在"分支直接用 `findAgent===null` 判 |
| agent-im-dm P2(履历页) | 四栏数据 = `listAgentPresence`,不再各栏自写过滤 |
| agent-im-dm P3(互聊) | `dm` 工具的 to 校验 = `requireAgent` + `isColleague` + active;retired/service 目标一律工具报错 |
| 外部 agent 线 | M7 executor 字段留缝;ClaudeCodeConnector 将来登记为 `kind:'colleague', executor:{type:'external', connectorId:'claude-code-agent'}`,身份/能力面全复用 |
| 能力档案线(已落地) | 零改动,`EffectiveAgentProfile` 即能力面的复合结果;`lastProvider` 自动盖章不算用户选择的既有纪律不变 |
| 群聊审计未修项 | 无交集,互不阻塞 |

---

## 7. 分期落地

| 期 | 内容 | 依赖 | 验收要点 |
|---|---|---|---|
| **A0 类型与分类** | `kind`/`status`/`executor` 三字段落库(全可选,旧数据零迁移);shared 三投影 + `isColleague`;radio-dj 落 service + renderer 两处硬编码换 kind 过滤 | 无 | 旧 agents.json 原样可读;radio-dj 从任何社交面消失;typecheck 全绿 |
| **A1 解析纪律** | store 三态 API + defaultAgent 显式化;全库 getAgent 调用点归位;手工防冒充校验整删;renderer 镜像 | A0 | 删一个被引用的 agent(测试夹具)后:无任何调用点拿到 default 冒充;warn 埋点零命中后删旧 API |
| **A2 生命周期** | 退休/墓碑:UI 删除改退休、引用检查、retired 行为矩阵逐面落地(灰显/只读房/激活拒绝) | A1 | §3.2 矩阵逐行真机走查;退休 agent 的历史署名与履历完整可读 |
| **A3 归属单点** | identity.ts(迁 collabAgentSessionId)+ presence.ts + alias 登记;既有 id 构造点全部改经此处 | A0 | 全库 grep 无第二处 `agent-exec-` 字面量拼接;presence 与侧栏 Agent 组现状呈现对齐 |

A0/A1 是 agent-im-dm P1 的**前置**(联系人区需要 kind 过滤与严格解析);A2 可与 IM P2 并行;A3 在 IM P1 动手前完成(dm 房 id 不能再散着造)。

## 8. 开放问题(实施期再拍)

- **恢复退休**:是否提供"重新入职"?倾向提供(status 翻回 active 即可),但入口收在 Agents 管理页,不进联系人区。
- **service 的可见面**:usage/账单里 service agent 的花费如何署名——用身份面即可,是否需要独立分组待真机。
- **agent 改名的历史署名**:quote-reply 是快照纪律(authorLabel 存快照),消息署名是现算——改名后新旧并存是既有行为,墓碑机制不改变它;是否要"曾用名"记录,等真实困扰出现。
- **kind 的第三值**:外部 agent 是否需要独立 kind(而非 colleague+executor)——当前判断不需要,"是不是同事"与"谁在驱动"正交;若将来出现"非人格化的外部执行体",再议。

---

## 9. 实施勘误(2026-07-30 落地时与设计的偏离,均已按此为准)

- **§2 铁律 2 修订**:投影"shared 层纯函数"与 boundary 规则(runtime 产品层禁 `@shared/ipc`)矛盾。实际落位:三投影与判定在产品层 `agents/model.ts`,shared 侧只镜像 renderer 需要的判定,镜像测试盯语义一致。
- **radio-dj 需存量 backfill**:它是运行期写入用户 agents.json 的,`ensureRadioSession` 的 else 分支已加 `kind !== 'service'` 一次性补写,否则已装机用户的 DJ 永远是 colleague。
- **引用判定比"presence 为空"宽一格**:`hasAgentReference` = 在场四路 ∪ 任何会话的 `agentId` 绑定(直聊 persona 绑定的历史署名也算引用),否则有直聊历史的 agent 会被误判"从未被引用"而硬删。
- **恢复已实施**(§8 第一条落定):独立 `AGENTS_RESTORE` 通道,入口只在 Agents 管理页;`status` 不经普通 update 写(白名单结构性排除,有测试钉住)。
- **dm 房 id 命名空间残余歧义**:`agent-dm-room-` 是 `agent-dm-` 的子命名空间,id 形如 `room-x--y` 的 agent 会与 pair 房同形;归属仍读成员表不会认错人,记录在 `identity.ts` 注释,IM 实施期若要消歧再改前缀。
- **字典序 = UTF-16 码元序**(非 localeCompare):id 要落库,不能依赖 locale。`agentDmRoomId(a,a)` 返回 null。
- **presence 栏位名**:`{ dmRoomId, roomSessionIds, execSessionIds, workSessionIds }`(明示装的是 session id)。
- **coordinator 对 retired 只拒新拉入**:已在房的 retired 成员留在 `memberAgentIds` 原样放行(否则含退休成员的旧房连改名都被整体拒);激活拒绝单一收口在 `turn.ts` 驱动处。
- **墓碑统一的唯一遗留点**:`message/reactions.ts` 的归属条保留"roster miss 显示原始 id"的自有取舍,未并入墓碑语义。
