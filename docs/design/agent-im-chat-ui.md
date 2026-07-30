# IM 原生对话面(IM 化第三幕):messenger composer、Agent 空间页、布局对齐

**状态:P0/P1/P2 已实施(未提交,真机走查未做);P3 全文搜索、P4 三栏布局待做。** 2026-07-30 设计,同日实施。Q1–Q4 按建议拍板:附件保留、群房同步精简、slash chips 移除、speak 复用点击录音链;P1 实施时权限档位选择器一并从 messenger 移除(控制归属主:房间权限在 RoomSettingsDialog)。
**前置阅读:** `docs/design/agent-im-dm.md`(P1–P4 已实施)、`docs/design/agent-domain-model.md`(A0–A3 已实施)。

---

## 0. 用户设定(本文的宪法)

**应用的 agent 对话就是 IM**——Teams / Telegram / Discord 的交互习惯:

- 我跟 agent 只是**说话**,我只看到 TA say 的内容;一切执行动作都在后台的执行会话/工作台里。
- 因此现有 ChatUI 的**工程驾驶舱**(模型选择、context 量尺、think 档位、TTS/通话、命令 chips……)不属于这种对话。对话面上只需要:**@ 一个人、发消息、说话(speak)**。
- 点开对方**头像**,进入"我与 TA"的空间:能搜历史、看 TA 的会话、看文件。
- 当前 UI 的形态比例是"工具型 chat app",不是 IM——布局要向 IM 靠。

一句话:**直聊(kind='chat',直连 provider)保留工程驾驶舱;dm 房与群房是 IM 场,要一套 messenger 形态的对话面。**

---

## 1. 已定决策与待拍板项(全相)

| # | 问题 | 决定 | 状态 |
|---|------|------|------|
| C0 | 头像设不上(CSP 拦 blob 预览) | `session-security.ts:52` 的 `img-src` 加 `blob:`(头像上传走 `createObjectURL` → `<img>` → canvas 降采样,`blob:` 不在白名单整条链路死)。CSP 由主进程 `onHeadersReceived` 单点注入,index.html 无第二份 | **已修**,重启 electron dev 生效 |
| C1 | messenger composer 怎么来 | **不新写第二个输入框**(InputBox 2790 行,复制即死路):InputBox 改造成**形态驱动**,`engineering`(直聊,现状全量)/ `messenger`(dm 房+群房)两个 profile,形态由会话 kind/dm 现算。messenger = 文本 + @ + speak + 发送 + 附件,其余一律不渲染 | 定 |
| C2 | 工程控制去哪了 | **控制归属主**:model/think 是 **agent 的属性**(能力档案 model binding + thinking 已有),入口在 agent 配置页;context 在托管形态属于执行会话,引擎管(compact 链路),用户面不出现 | 定 |
| C3 | 点头像进什么 | **Agent 空间页**(Telegram chat-info 式):P2 的 AgentContactCard 升格为完整信息面,四块=资料 / 搜索历史 / 会话 / 文件(§3)。dm 房房头头像、群聊署名头像、联系人行三个入口同归 | 定 |
| C4 | 布局比例 | 方向 = **三栏 IM**:左「最近对话」统一列表(联系人/群/私下合流,按活跃排序+未读),中消息流,右空间页/工作台。**大改版,单独一期**,先做 C1–C3 再真机对比拍板 | 方向定,细节 P4 拍 |
| Q1 | 附件保留吗 | **建议保留**(IM 发图/文件是基本能力,引擎附件链路现成);拖拽/粘贴照旧 | 待拍板 |
| Q2 | 群房 composer 同步精简吗 | **建议同步**(群房也是 IM 场,@ 本来就在群房用得最多) | 待拍板 |
| Q3 | slash 命令 chips 在 messenger 形态去留 | **建议移除**(工程命令不属于对话面;需要时去直聊) | 待拍板 |
| Q4 | speak 形态 | **建议先复用现有点击录音→转写链路**(voice 模块现成);"按住说话"是纯交互皮,后置 | 待拍板 |
| Q5 | AgentContactCard 去留 | **退役**——升格为空间页后小卡是冗余中间层;群聊点头像直接开空间页 | **已拍板,P2 已实施**(组件与其测试已删) |

---

## 2. C1 — messenger composer(形态分装)

### 2.1 手法:拆形态不拆组件

InputBox 内部以一个 `composerProfile` 计算属性分流(`isUserDmRoom / isAgentPairDmRoom / kind==='room'` → messenger;其余 → engineering),模板上工程面板全部挂 `v-if="profile==='engineering'"`。**不新建 DmComposer.vue**——2790 行里 IME/草稿/发送/录音这些底盘两个形态完全共用,分叉的只是周边按钮带。

### 2.2 messenger 形态清单

| 保留 | 移除(messenger 不渲染) |
|---|---|
| 文本框 + IME 护栏 + 草稿 | ModelSelector |
| **@** mention popover(既有 W14a;**单成员 dm 房隐藏**——房里没有第三个人,@ 无意义) | context 量尺(ctx meter) |
| **speak**:录音→转写进输入框(既有 voice 链) | ThinkToggle |
| 发送(走既有 room 用户消息 ingress 链路,零引擎改动) | TTS 回复开关、通话按钮(语音的"被动播报/通话"是直聊能力;dm 房后续要语音消息另立设计) |
| 附件(Q1 默认保留:拖拽/粘贴/attach 按钮) | slash 命令 chips(Q3)、queue dock 等工程 dock |
| 停止按钮(collab turn-active 事件已接) | AgentSelector(room 会话现状已隐藏,钉住) |

### 2.3 边界

- 直聊(kind='chat',含绑 agent 的直聊)**一个像素不变**——工程驾驶舱是它的本体。
- 引擎零改动:messenger 只是渲染面收窄,发送/附件/语音全走现有链路。

---

## 3. C3 — Agent 空间页(点头像进入)

### 3.1 形态与入口

- 载体:右侧工作台面板(RightWorkbenchPanel 多实例基建现成)或 workspace panel,**复用 P2 履历页的实现做底**,不另起炉灶——空间页 = 履历页(已有「配置/历史」两 tab)升格重排为四块。
- 入口:① dm 房房头 `.dm-identity` 头像;② 群聊署名头像(现开 AgentContactCard 处,Q5 退役后直开);③ 联系人行右键/点击长按。三处同归一个 `openAgentSpace(agentId)`。

### 3.2 四块

| 块 | 内容 | 基建 |
|---|---|---|
| **资料** | 大头像、名字、title、description、「发消息」按钮(ensureCollabDmRoom 链)、「配置」入口(现有配置 tab) | 全现成 |
| **搜索** | 搜"我与 TA"的历史:范围 = 私聊房 + TA 的执行会话 + 工作台 + 绑 TA 的直聊(即 presence 四路 ∪ 直聊,P2 口径现成)。**P2 先做标题+近期消息的本地过滤;全文检索接 Search Everywhere 基建加 scope 参数,单独一期**(跨会话索引属 apps/server 的既有纪律,不往 Electron 主进程塞数据库) | 部分新 |
| **会话** | P2 履历四栏(与你的对话/群聊/私下/干过的活)原样平移 | 现成 |
| **文件** | dm 房 roomFolder 文件树(`collabRoomFolder` 现成)+ 各卡 evidence 文件(按卡分组);点击走 openFile 链路(>1MB/二进制回退既有降级) | 半现成(文件树 UI 新) |

---

## 4. C4 — 布局对齐(方向,单独一期)

- 左栏:联系人/群聊/私下三区合流为**「最近对话」单列表**(按最后消息时间排序,未读墨点已有,置顶可选);「会话」区(直聊)保留但降为次级入口——直聊是工具,对话是主场。
- 中栏:消息流(messenger composer)。
- 右栏:空间页 / 看板 / 工作台(现有 RightWorkbenchPanel 语义)。
- **不在 C1–C3 之前动**:布局是感受问题,先把对话面和空间页做对,真机对比再拍三栏细节(参考 Telegram 桌面端的栏宽比例)。

---

## 5. 分期落地

| 期 | 内容 | 依赖 | 验收要点 |
|---|---|---|---|
| **P0 头像 CSP** | `img-src` 加 `blob:` | 无 | **已修**;重启 dev 后头像上传预览/保存走通(真机) |
| **P1 messenger composer** | InputBox 形态分装;dm/群房收窄到 §2.2 清单;单成员房隐藏 @ | Q1–Q4 拍板 | 直聊零变化(快照钉住);dm 房无任何工程控件;发消息/录音/附件全通 |
| **P2 Agent 空间页** | 履历页升格四块;三入口归一;搜索先做本地过滤;文件树;AgentContactCard 按 Q5 处置 | P1 可并行 | 点头像即空间页;文件点开;retired 墓碑态照常 —— **已实施**:tab = 配置/会话/文件/搜索,入口归一到 agents store 的 `openAgentSpace`,文件走新增只读通道 `collab:room-folder-list` |
| **P3 历史全文搜索** | Search Everywhere 基建加 agent-scope 参数,空间页搜索接线 | P2;搜索基建勘察 | 搜出的消息可跳转定位 |
| **P4 三栏布局** | 最近对话合流列表 + 栏比例 | P1–P2 真机体感 | 用户拍板后实施 |

## 6. 开放问题

- 语音消息(发一段语音而非转写文本)要不要——IM 标配,但涉及消息形态与存储,单独设计。
- 「最近对话」合流后,直聊会话与 IM 对话的心智分界怎么呈现(次级入口的具体形态)。
- 群房与 dm 房的通知(系统级)仍按 agent-im-dm §7 缓做。
