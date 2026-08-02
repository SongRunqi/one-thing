# Agent 私聊用户:用户身份 + dm 反向通道 + 消息提示

> 设计稿。三件事一条线:①用户有一份「我的资料」(名字/句柄/头像);②`dm` 工具认识用户,agent 可以主动发起对用户的私聊;③用户不在场时收到消息有系统级提示。
>
> 需求原文:「agent 可以私聊用户,用户给他一个设置(名字,id,头像);收到消息后有提示」。
> 解读:agent 已有完整身份(name/id/avatar,`AgentDefinition`),缺的是**用户**这一侧的身份
> ——所以「名字/id/头像」做的是用户资料,让 agent 有一个可称呼、可定位的对象,让 UI 有一个
> 可渲染的「我」。

## 0. 现状锚点(为什么这三件事现在做不了)

| 缺口 | 现状 |
|---|---|
| agent → 用户没有通道 | `dm` 工具的 `to` 只认 agent(`app/collab/dm-tool.ts:68` 走 `resolveCollabAgentHandle`,候选池是全体 agent);用户没有 agentId,永远解析失败。用户 ↔ agent 私聊房(`agent-dm-<agentId>`)只有**用户侧**入口(`ensureUserDmRoom`,由联系人点击触发) |
| 用户没有身份 | `AppSettings.userProfile`(`packages/shared/ipc/settings.ts:172`)**已定义但零读取、零写入、零 UI**,且没有头像字段;模型面 `userLabel` 参数(projection/willingness/roster 三处 builder 都接受)**调用方从不传**,永远回退「用户」;renderer 署名写死「我」(`SayMessageRow.vue` `senderName`),用户头像走独立分支不吃 `AgentAvatar` |
| 没有提示 | 全仓零系统通知(`new Notification`/`setBadgeCount`/`flashFrame` 均 0 命中);renderer 的 Web Notification 权限被 session 安全策略**明确拒绝**(`apps/electron/src/window/` 权限检查器);已有的只有未读墨点(read marks 水位,`packages/renderer/stores/session-read-marks.ts`) |

已经在的、可以直接骑上去的:

- `ensureUserDmRoom(agentId)`(`app/collab/user-dm-room.ts:35`)——幂等建房,校验齐全;
- `speakIntoCollabRoom`——唯一写消息路径,转义/幂等窗/冻结/预算门全在;
- 已读水位三件套:`noteInboundActivity` / `isUnreadSession` / `windowFocused`(`packages/renderer/stores/sessions.ts:285-410`),`ipc-hub.ts:325` 已按 role 分流;
- `AgentAvatar.vue` 是通用的 emoji/图片头像组件,不含 agent 语义,可直接给用户用;
- `<store>/user-profile/` 路径已在 `packages/core/storage/paths.ts:96` 预留(本方案**不用**它,见 P0 取舍)。

## 1. 总览(三期)

| 期 | 内容 | 产出 |
|---|---|---|
| **P0 我的资料** | `userProfile` 补字段 + 设置 UI + 身份贯通(模型面 userLabel / renderer 署名与头像 / @ 识别) | 用户在全链路里有名字、句柄、头像 |
| **P1 dm 认识用户** | `dm` 工具 `to` 增加用户目标分支:ensure 用户私聊房 → 落消息 → **不 enqueue** | agent 在群/工作会话里可以主动私聊用户 |
| **P2 消息提示** | 主进程 Notification + dock 徽标 + 点击跳会话;触发决策留在 renderer(它握有焦点与水位) | 用户不在场时,私聊来消息有系统通知 |

三期独立可验收:P0 单独有价值(用户身份补全是老债);P1 依赖 P0 的句柄;P2 不依赖 P1(用户主动开的私聊来消息同样该提示)。

## 2. P0 我的资料

### 2.1 数据契约

扩展 `packages/shared/ipc/settings.ts` 的 `UserProfileSettings`(已有 name/timezone/language/customInfo):

```ts
export interface UserProfileSettings {
  name?: string          // 显示名,如「一天」。缺省时全链路回退「用户」
  handle?: string        // 句柄(需求里的 "id"),如 'yitian'。用于 @ 与 dm 定位;缺省 'user'
  avatar?: string        // emoji 头像
  avatarImage?: string   // media 库文件名,胜过 emoji —— 与 AgentDefinition 同一套约定
  timezone?: string; language?: string; customInfo?: string   // 既有字段不动
}
```

**取舍:存 settings,不启用 `<store>/user-profile/profile.json`。**
资料就是几个标量,settings 已有缓存/同步/落盘全套;单独一个 json 文件要新开读写链路和
水合时机,收益为零。core 里预留的路径继续闲置,不删(别的功能可能用)。

**句柄归一**:小写、`[a-z0-9_-]{1,24}`,写入时清洗。canonical actor 不变——消息仍是
`role:'user'`,**不引入 userId 进消息结构**;句柄只是称呼层的定位符。这样旧会话零迁移。

### 2.2 身份解析收口(单一属主)

新文件 `packages/onething-runtime/src/app/collab/user-identity.ts`:

```ts
export interface CollabUserIdentity {
  label: string      // profile.name || '用户'
  handle: string     // profile.handle || 'user'
  avatar?: string
  avatarImage?: string
}
export function resolveUserIdentity(): CollabUserIdentity   // 读 settings 缓存,每次现取
```

纪律与 `dm.ts` 形态判定同款:**全仓禁止直接读 `settings.userProfile` 拼默认值**,
消费方一律走这一个函数。每次现取(settings 缓存本来就是同步热路径),改名即时生效,
不做跨模块镜像。

### 2.3 模型面贯通(把 `userLabel` 真正传下去)

三处 builder 早就接受 `userLabel`,只是没人传:

| 调用点 | 改法 |
|---|---|
| `projection.ts:242`(房间历史投影) | app 层调用处传 `resolveUserIdentity().label` |
| `willingness.ts:99`(意愿判定窗口) | 同上 |
| `roster.ts:97`(花名册/情况说明) | 传 label,且用户行补句柄:`一天#yitian(用户)`——与同事行 `名字#句柄` 同一书写法,为 P1 的 dm 目标写法铺路 |

引用回复的 `COLLAB_REPLY_USER_LABEL`(`say-tool.ts:114`、`reply-quote.ts:28`)改为
调用点从 `resolveUserIdentity().label` 取。注意 replyTo 是**快照**(excerpt + authorLabel
落库),改名后旧引用保留旧名字——这是快照语义的既有取舍,不追改。

### 2.4 Renderer 侧

**设置 UI**:`GeneralSettingsTab.vue` 最顶(Mode 之前)加 `<SettingsSection title="我的资料">`:
名字、句柄、头像(emoji 输入 + 图片选取走 media 库,复用 agent 头像的同一套
`media://<name>` 解析)。同步 `SettingsPage.vue` general navItem 的 `sections` 数组首位
(滚动锚点按标题文本匹配,漏了会断锚)。

**署名与头像**(`SayMessageRow.vue`):

- `senderName`:`isUser ? profile.name || '我' : sender?.name`——有名字显示名字,没配置保持「我」;
- 用户头像分支改走 `AgentAvatar`(传 profile 的 avatar/avatarImage;该组件本无 agent 语义,
  兜底 emoji 由调用点传 `'🙂'` 之类的用户缺省,不动组件的 `🤖` 缺省);
- 普通 chat 会话的 `MessageItem.vue` 用户头像同步(如果那里有头像位)。

**@ 识别**(`collabInlineTags.ts:93`):`MENTION_USER_LABELS` 从静态数组改为计算:
`['用户', '我', profile.name, profile.handle]` 去重——agent 写 `@一天` 或 `@yitian`
都能点亮用户高亮。`MENTION_SELF_TEXT` 渲染仍显示为「我」(自己看自己被 @,「我」比名字直觉)。

### 2.5 边界

- **不进 roster 成员**:`memberAgentIds` 仍是纯 agent 数组,用户不是成员,是「房间的属主
  观众」——这是 D1 以来的结构决定,本方案不动;
- **多用户网关场景不管**:channel identity(微信/飞书对端画像)是另一条线,已有自己的
  profile 体系;本方案的 userProfile 是桌面单用户的「我」。

## 3. P1 `dm` 工具认识用户

### 3.1 目标写法与解析

`dm` 的 `to` 增加用户目标。写法与同事一致:`名字#句柄` / `#句柄` / 唯一命中的裸名字,
外加两个常量词:`用户`、`user`(即使用户没配置资料也永远可达)。

解析收口在 app 层新函数(不动 `resolveCollabAgentHandle` 的纯 agent 语义):

```ts
// app/collab/dm-target.ts
type DmTarget = { kind: 'user' } | { kind: 'agent'; agentId: string }
export function resolveDmTarget(raw: string, agents: AgentDefinition[]): 
  { ok: true; target: DmTarget } | { ok: false; error: string }
```

顺序:先按用户身份匹配(`用户`/`user`/profile.name/profile.handle/`名字#句柄` 组合),
命中即 user;否则落回 `resolveCollabAgentHandle`。**重名冲突**(用户句柄或名字撞上某个
agent):拒绝并列出两个候选,提示用精确写法(`用户` 或 `#句柄`)——与 agent 重名的既有
拒绝语义同款,绝不 default 冒充。

### 3.2 发送链路(`sendCollabDm` 加一个分支)

`app/collab/dm-tool.ts` 在 `resolveDmTarget` 返回 user 时:

```
selfId = session.agentId              // 既有推导,不变
roomSessionId = ensureUserDmRoom(selfId)   // 幂等;selfId 非 colleague/active 时返回 null → 拒绝
speakIntoCollabRoom({ sessionId, content: message, room: roomSessionId })
                                      // 冻结/预算/转义/幂等窗全部继承,拒绝文案透传
不 enqueue                            // ← 与 agent 分支唯一的结构差异
return { ok: true, roomSessionId, messageId, peerName: resolveUserIdentity().label }
```

**为什么不 enqueue**:enqueue 是「把对端模型拉起来答话」;对端是人,没有模型可拉。
消息落库即触发 `message:user-created` 事件 → renderer 水位 `noteInboundActivity` →
未读墨点 + P2 通知。用户回话时走 D6 免判激活(用户在单成员 dm 房说话等价 @ 唯一成员),
闭环天然成立,零新机制。

**回执文案**(工具 output)与 agent 分支区分:

> `已发给 <用户名>;TA 不一定在线,看到后会在你们的私聊里回复——不用等,先继续手头的事。`

这句是行为约束:防止 agent 发完就停轮空等用户回复(用户可能几小时后才看)。

### 3.3 门禁与防骚扰

- **场子门**:沿用既有判断(`session.kind` ∈ room/agent/work 才可 dm)——普通 chat
  会话里 agent 就在用户眼前说话,没有「私聊用户」这件事;
- **发起人门**:`ensureUserDmRoom` 自带三道校验(严格解析/isColleague/isActiveAgent),
  service agent、退休 agent 发不出;
- **频控**:先不做每日条数闸。已有的够用:冻结房(`room.frozen`)用户可随手关掉某个
  agent 的嘴;`speakIntoCollabRoom` 的 `maxTurnSayCalls` 预算管单轮轰炸。真机观察到
  骚扰模式再加(候选:同房冷却窗,agent 在用户未回复期间最多追加 N 条);
- **caller 就在自己的用户私聊房里**:允许(等价于 say,落同一间房),不做特判。

### 3.4 工具描述更新

`packages/onething-runtime/src/tools/builtin/dm.ts` description 补一段:

> `- You can also dm the user themselves (to: "用户" or their name/handle from the roster). Use it when something needs their eyes but doesn't belong in the group — a question only they can answer, a heads-up, a deliverable. They may be away; the message waits with a notification, don't block on a reply.`

roster 的 dm 情况说明(`roster.ts` dm 版)同步一句「你也可以 dm 用户本人」——两处措辞
必须一致(该文件既有纪律)。

## 4. P2 消息提示

### 4.1 结构:决策在 renderer,执行在主进程

**为什么决策放 renderer**:窗口焦点(`windowFocused`)、会话可见性(`isSessionOnScreen`)、
未读水位全在 renderer store 里;主进程对「用户是否正看着这间房」一无所知。搬这些状态
去主进程是造第二份真源。

**为什么执行放主进程**:renderer 的 Web Notification 权限被 session 安全策略明确拒绝
(`session-security` 权限检查器返回 false)——这道门是对的(嵌入的浏览器页面不该弹通知),
不放行。系统通知走 Electron 主进程 `Notification` 模块,与该门无关。

### 4.2 新 IPC 面

按五步纪律加通道(channels → types → handler → bridge → web 平替):

```
packages/shared/ipc/channels.ts   NOTIFY_SHOW: 'notify:show'
                                  NOTIFY_BADGE: 'notify:set-badge'
packages/shared/ipc/notify.ts     ShowNotificationRequest { title, body, sessionId }
                                  SetBadgeRequest { hasUnread: boolean }
apps/electron/src/main/ipc/notify.ts
    show → new Notification({title, body, silent:false});
           click → 主窗 show()+focus() → webContents.send('notify:activate', {sessionId})
    badge → macOS: app.dock.setBadge(hasUnread ? '•' : '')
            win/linux: 留空实现(overlay icon 后补)
apps/electron/src/preload/bridge.ts   electronAPI.notify.{show,setBadge} + onActivate 订阅
packages/renderer/platform/web.ts     show → no-op(web 端降级为仅墨点;Web Notification 留白)
```

徽标是「有/无」不是数字——沿用 agent-im-dm.md D9 的定调(系统只知道有没有,编数字
不可靠),所以 dock 用墨点字符不用 `setBadgeCount`。

### 4.3 触发规则(ipc-hub 一处收口)

`packages/renderer/services/ipc-hub.ts:325` 已是唯一的 inbound 分流点,在
`noteInboundActivity` 旁挂通知判定:

```
收到落库消息(role !== 'user' 且非 system/drive 行)
  且 !isSessionOnScreen(sessionId)        // 覆盖「窗口失焦」与「开着别的房」两种不在场
  且 会话 ∈ 通知范围(见 Q3)
  且 该会话冷却窗外(60s 去抖,首条即发、窗内静默)
→ platformApi.notify.show({
    title: 发言 agent 名字,
    body: 正文摘要(剥 mention token 与 markdown 标记,截 80 字),
    sessionId,
  })
```

- **通知范围(P2)**:仅用户私聊房(`isUserDmRoomSession`)。群聊被 @、pair 房结论等
  留 P3(agent-im-dm.md:178 的留白按原计划分步兑现);
- **冷却窗**:per-session 60s。agent 常常连发几条(say 拆段),逐条弹是骚扰;首条弹出
  已足够把人叫回来,回来后看到的是全部;
- **点击跳转**:renderer 订阅 `notify:activate` → workspace store 打开/聚焦该会话 tab
  (复用 `openSettingsWindow({tab})` 深链的先例手法)→ 落焦后水位自然转已读;
- **dock 墨点**:watch `sessionsStore.unreadSessionIds`(已有 computed),非空→有点、
  空→清,经 `notify:set-badge` 下发。只主窗口驱动(与水位「只主窗口 hydrate/落盘」
  同一纪律,避免多窗互相抢写)。

### 4.4 静音面

设置项一个就够(`feedback_settings_minimal` 纪律):「我的资料」区块旁加一行开关
`私聊消息系统通知`(缺省开)。粒度更细的(按 agent 静音)挂在冻结房上已经有了,不重复造。

## 5. 拍板项

| # | 问题 | 建议 |
|---|---|---|
| Q1 | 用户句柄的语义边界 | 只是称呼层定位符(@ 与 dm 目标),**不是** userId,不进消息结构,旧会话零迁移。缺省 `user` |
| Q2 | 自己的消息署名显示「我」还是名字 | 配置了名字显示名字(IM 直觉:群里每个说话者含自己都有名有头像),未配置回退「我」;被 @ 时渲染仍是「我」 |
| Q3 | 通知范围 | P2 只做用户私聊房;群聊被 @ / pair 房留 P3 |
| Q4 | agent 主动 dm 用户要不要频控 | 先不做,靠冻结房 + 真机观察;骚扰模式出现再加「未回复期间追加上限」 |

## 6. 测试面

- `dm-target` 解析:用户常量词/名字/句柄命中、与 agent 重名拒绝并列候选、空资料时 `用户`/`user` 仍可达;
- `sendCollabDm` user 分支:落库成功、**未 enqueue**(spy queue)、冻结房拒绝透传、service/退休 caller 拒绝;
- `user-identity`:缺省回退链(`用户`/`user`)、句柄清洗;
- projection/willingness/roster 快照测试:userLabel 注入后模型面文案(既有测试改断言);
- renderer:`SayMessageRow` 署名/头像分支、`MENTION_USER_LABELS` 动态化(`MessageItem.mentions.test.ts` 补 case);
- 通知触发:on-screen 不弹、失焦弹、冷却窗合并、role:'user' 不弹(自己说话)、web 平台 no-op。

## 7. 不做清单

- 用户 id 进消息结构 / 多用户账号体系(网关多用户是 channel identity 的线);
- 数字未读徽标(定调:墨点);
- Web 端系统通知(留白,先降级墨点);
- 群聊被 @ 的系统通知(P3);
- `<store>/user-profile/profile.json` 启用(资料进 settings)。
