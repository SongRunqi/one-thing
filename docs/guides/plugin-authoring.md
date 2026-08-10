# onething 插件作者指南

面向插件作者的全流程契约:从三件套到发布上架,每条规则都注明**为什么**
以及**违反时宿主会做什么**(大多不是警告,是拒装/回滚)。

市场仓库:[`github.com/monotasking/plugin`](https://github.com/monotasking/plugin)
(仓库机制详见其 README;本文是作者视角的完整契约)。

## 三分钟上手

```bash
# 1. 克隆市场仓库,在 packages/ 下建你的插件(三件套)
mkdir packages/my-plugin
#    packages/my-plugin/plugin.json      —— 声明(manifest)
#    packages/my-plugin/plugin-entry.ts  —— 唯一源码入口
#    packages/my-plugin/package.json     —— 账(name/version)

# 2. 构建(根目录先 npm install 一次,装 esbuild)
node scripts/build-plugin.mjs packages/my-plugin
#    → packages/my-plugin/dist/ 是一个完整的零依赖 npm 包

# 3. 本地装(file: 开发通道,软链秒装秒卸)
#    onething 设置页 → Plugins → Install Plugin:
#      包名  @onething-plugins/my-plugin
#      路径  <仓库>/packages/my-plugin/dist
```

## manifest(plugin.json)字段表

| 字段 | 必填 | 说明 |
|---|---|---|
| `name` | ✅ | 显示名;建议与目录名(= pluginId)一致 |
| `version` | ✅ | **版本单源铁规**,见下 |
| `description` | 推荐 | 市场卡片与已装列表都显示 |
| `author` | 推荐 | 市场卡片显示 `by <author>` |
| `entry` | 否 | 入口文件名,缺省 `plugin-entry.js`(指 dist 里的产物名) |
| `minAppVersion` | 否 | 宿主版本不足时:市场 Install 置灰、装了也一行不跑(加载闸) |
| `contributes` | 否 | **声明先于代码**的全部贡献点,见下 |

`contributes` 子字段(装前确认页展示的就是这份声明,不是营销文案):

| 子字段 | 形状 | 宿主行为 |
|---|---|---|
| `commands` | `string[]` | 斜杠命令声明 |
| `panels` | `[{id,label,view?,entry?}]` | 工作区面板。缺省 `view: "descriptor"`(描述树,UI 不执行插件代码);`view: "webview"` + `entry` 走逃生舱,见下 |
| `webviewRoot` | `string` | webview 面板的静态资源根,**相对包目录**,缺省 `webview` |
| `uiSlots` | `[{anchor,id,label,lifetime?,drawer?}]` | UI 锚点(常显块或触发式,**由锚点决定**,见下);未知锚点按"此版本不支持"呈现。`lifetime: "persistent"` 是**消息态落盘的闸门**(见下),缺省 `"ephemeral"`;`drawer: true` 开抽屉三态(**仅 `composer.above`**,别处声明被忽略,见下) |
| `theme` | `{overrides?:{token:color}, background?:{image,darkImage?,opacity?,blur?,fit?}}` | 主题 token 覆盖 + 背景图(见下);装前确认页列出被改的 token 与"会铺背景图" |
| `settings` | `{schema}` | JSON Schema 子集,宿主渲染并校验设置表单 |
| `permissions` | `string[]` | 装前确认页如实列出(已登记的枚举翻成人话)。**被消费的三个**:`sessions:peek` / `sessions:post` / `sessions:trigger`,见「跨会话信使」;未登记的名字原样显示、不参与判定 |
| `activationEvents` | `string[]` | 激活事件声明 |

## 打包铁规(每条都有宿主侧硬闸)

1. **零运行时依赖**。依赖尽管写进 `package.json` 的 `dependencies` ——
   构建时 esbuild 全部 bundle 进单文件 `plugin-entry.js`,dist 的
   package.json 会被剥光。宿主安装时再校验一次:**有运行时依赖 = 拒装
   并回滚**(bundle 规则)。
2. **版本单源**:`plugin.json` 的 `version` 必须等于 `package.json` 的
   `version`。索引版本来自 tag(= package.json),而宿主的更新通道拿
   运行时 manifest 版本(plugin.json)去比 —— 漂移 = 更新徽标永不灭。
   build-plugin.mjs 硬校验,过不了构建。
3. **不要依赖 install 脚本**。宿主一律 `npm install --ignore-scripts`
   安装,你的 postinstall **永远不会被执行**。构建期(bundle)能做的
   事不要推到安装期。
4. **命名契约**:包名必须 `@onething-plugins/<id>`(v1 单一 scope),
   目录名必须等于 `<id>`;**pluginId = 包名去 scope**。id 撞上宿主内置
   插件(当前 `log-monitor`、`note-skills`)会被**装前拒绝**。
5. **tarball 即全部**。宿主从 GitHub Releases 的 tarball URL 安装,
   只认 `https://`;索引的 sha512-SRI 与 package-lock 条目逐字符比对,
   不符拒装并回滚。

## 发布流

```bash
# 1. bump 两处 version(plugin.json + package.json,保持一致)
# 2. 提交,打标签 —— 标签名是唯一的发布动作:
git tag my-plugin-v1.1.0 && git push origin main --tags
# 3. CI:版本一致性校验 → bundle → npm pack → Release 挂 tarball →
#    重生成 index.json(SRI 对 asset 实体现算)→ 提交回 main
```

- 市场卡片的事实(描述/contributes/minAppVersion)取自**那个 tag** 上的
  plugin.json,不是 HEAD —— 用户装前看到的就是他将装的那一份。
- 发布后索引可能有秒级延迟(CI 重试兜底),手动核对:
  `node scripts/regen-index.mjs --expect-tag=my-plugin-v1.1.0`。

## 更新通道语义(作者需要理解的)

- 用户侧的"有更新"= 索引版本 > 该插件**运行时 manifest 版本**
  (plugin.json 的 version)。所以版本漂移的后果是用户永远看到更新徽标。
- 更新 = 安装新 tarball URL(不走 `npm update`);装后宿主会重校
  minAppVersion,不够则**自动回退旧版**并告知用户。
- 数据不随更新动:config/KV/storage 住在家目录(见下),npm 只碰
  node_modules。

## 工具(api.registerTool)

```js
api.registerTool({
  name: 'peek_index',
  description: '读一份只读索引',
  parameters: z.object({ key: z.string() }),
  executionMode: 'parallel',        // 可选,见下
  async execute(args, ctx) {
    return { title: 'peek', output: '…', metadata: {} }
  },
})
```

工具 id 由宿主加命名空间:`plugin:<你的插件 id>:<name>`。
`permissionGuard` **不由你决定** —— 插件工具一律 `permission-gated`
(填别的值只会收到一条警告,判定不变)。

### `executionMode`:这个工具能不能和兄弟并发

模型可以在**同一条回复里**一次开出多个 tool_use。宿主的调度器按每个工具的
声明决定它们怎么排:

| 声明 | 调度行为 |
| --- | --- |
| `'parallel'` | 与同批**其它同样声明 parallel 的**兄弟重叠执行 |
| `'sequential'` | **执行屏障**:等前面所有调用落定,并挡住后面的,全程独占 |
| 不声明(缺省) | 同 `'sequential'` |

缺省就是屏障 —— 不写这个字段,你的工具行为与今天**一字不差**。
`'sequential'` 与不声明在调度上等价,写出来的意义是:**这是我的判断,
不是我忘了**。

**什么时候必须声明 `sequential`**:工具内部抓着一份**跨调用共享的可变
状态** —— 一个游标 / 偏移量、一个连接的读写位置、一份边读边改的缓存、
一个只能有一个 owner 的外部会话。两个并发的调用会互相踩,而症状是间歇性
的错数据,不是异常。(这是 pi 的原始判例:多个调用抢同一个共享游标。)

**什么时候可以声明 `parallel`**:纯函数、纯读取、每次调用自带全部状态、
对外部只做幂等查询。收益是几个慢查询能重叠,一次回合少等几秒。

**拼错就装不上**:`executionMode` 只接受这两个字面量。写成 `'paralell'`
或 `true`,**这一个工具**会被拒绝注册(插件其余的命令 / 面板 / 事件照常
工作),日志里有一条点名的错误。宿主刻意不做"未知值默默当 sequential"
的降级 —— 降级是安全的,但你永远不会知道自己拼错了,只会觉得"我的工具
好像没并发起来"。

## 事件订阅(api.on)

`api.on(type, handler)` 订阅宿主事件面(`stream:start`、`stream:complete`、
`stream:aborted`、`stream:error`、`step:updated` …)。handler 收到的是**信封**:

```js
api.on('stream:start', (env) => {
  env.sessionId   // 事件所属会话(顶层字段)
  env.sequence    // 会话内单调序号
  env.timestamp   // 提交时间戳
  env.event       // 事件本体 —— 不是 env.payload!
  env.event.type        // 如 'stream:start'
  env.event.messageId   // stream:start 携带;stream:complete 不携
  env.event.data        // stream:complete/error 的业务载荷(usage 在 data.usage)
})
```

> 教训实录:`env.payload` 不存在,用它取字段会得到一串静默 undefined
> (tps-meter / plan-status 1.0.0 都咬过)。跨事件关联靠 `env.sessionId` +
> 自己记账(stream:complete 无 messageId,需拿最近一次 stream:start 归属)。

## 数据落盘约定

- 插件家目录 = `~/.onething/plugins/<id>/`:`config.json`(宿主写,
  设置表单)、`kv.json`(`api.storage` KV)、`storage/`(自留地)、
  `message-state/`(消息作用域状态,见下)。
- **`node_modules/` 是代码区,任何数据永不许写进去** —— npm 每次
  update/uninstall 整目录抹掉重建,写进去等于丢。
- 卸载 = 家目录整体归档到 `plugins/legacy-backup/<id>-<date>/`
  (可恢复;目录名是纯归档名,与已退役的"legacy 目录插件"无关),
  代码从账与 node_modules 拆除。

### 消息作用域状态(`api.storage.message`)

要给**某一条消息**记东西(徽标、注解、评分),不要在自己的 KV 里按
messageId 记账 —— 那样消息删了你不知道,数据变孤儿。用消息态:

```js
// 写:坐标随调用递交,一条消息一个 blob(JSON 对象,内键你自己管)
api.storage.message(sessionId, messageId).writeJson({ v: 1, tps: 34.2 })
// 读:render 时按坐标现取;没有就是没有
const rec = api.storage.message(ctx.sessionId, ctx.messageId).readJson()
api.storage.message(sessionId, messageId).exists()
```

```jsonc
// 落盘要在 manifest 开闸(声明是闸门,不是装饰):
{ "contributes": { "uiSlots": [
  { "anchor": "message.footer", "id": "tps", "label": "TPS",
    "lifetime": "persistent" }   // 缺省 "ephemeral" = 纯内存,重启即丢
] } }
```

分工照抄这张表(**坐标是宿主的,内容是你的**):

| 归你 | 归宿主 |
|---|---|
| 记什么、何时记、形状怎么迁(建议带 `v` 字段) | 放哪(`plugins/<id>/message-state/<sid>/<mid>.json`) |
| 显示什么、何时 `ctx.refresh()` | 落不落盘(lifetime 闸门)、启动水合 |
| 读不懂的旧/新形状怎么办 | 消息删→删该条;会话删→删整个会话;卸载→随家目录归档 |
| —— | 每插件 5MB 硬顶(写超抛 `quota`)、损坏记录隔离 |

要点与坑:

- **有任一 slot 声明 `persistent`,这个插件的消息态就全部落盘**(存储分不清
  一次写服务哪个槽);全都不声明 = 纯内存。装前确认页会就那条 slot 告诉
  用户"会在消息上留下持久内容" —— 这是它该被声明出来的原因。
- 写面**会抛**(配额超、值不可 JSON 序列化、插件已拆除)。别 catch 掉当
  没事:抛了就是没存住,宿主同时记熔断账。
- 没有键枚举 API,也**不需要**自建索引:render 时你手里就有
  `ctx.sessionId` / `ctx.messageId`(消息级锚点的 ctx 携带),按坐标现取。
- 插件不在场时发生的流没有记录,装上之后也不会追认 —— 老消息就是空的。

## 跨会话信使:让一个会话给另一个会话发消息(N1)

`api.steer` / `api.followUp` 是**纯入队**:空闲的会话不会因为它们醒过来。要把
一个外部事件(另一个会话的一句话、一封邮件、一次定时)变成**一轮对话**,用
`api.sendMessage`。它是插件第一个能自发花掉用户 token 的口,所以它有声明门和
循环闸。

### 先声明(不声明就调不动)

```jsonc
{ "contributes": { "permissions": [
  "sessions:peek",     // 读别人的会话快照
  "sessions:post",     // 往会话里投递(不起轮)
  "sessions:trigger"   // 可以**起一轮**(花 token) —— 单独一档
] } }
```

装前确认页会把它们念成人话("can start a model turn on its own (spends tokens)")。
未声明就调:宿主拒绝并回 `{ok:false, reason:'not-declared'}`,记一条 error 日志,
**不计熔断**(那是 manifest 写错了,不该连坐插件其余能力)。

### 三态投递矩阵(照抄矩阵,不是布尔)

```js
// 目标空闲 → 起一轮;目标在忙 → 自动降级为 steer(插进它正在跑的那轮)
await api.sendMessage(id, text, { triggerTurn: true })

// 只落盘 + 显示,不起轮(缺省档 —— 不声明就不花 token)
await api.sendMessage(id, text, { triggerTurn: false })

// 显式选既有队列。nextTurn 诚实映射到 follow-up(引擎没有第三条队列)
await api.sendMessage(id, text, { deliverAs: 'steer' })
await api.sendMessage(id, text, { deliverAs: 'followUp' })
```

它**从不抛错**,回一份结构化结果:

```ts
{ ok, delivered?: 'triggered'|'steered'|'followed-up'|'posted',
  targetWasBusy?, hop?,
  reason?: 'not-declared'|'empty-content'|'unknown-session'
         | 'hop-limit'|'rate-limited'|'unsupported'|'error', detail? }
```

`delivered` **如实**说明走了哪一格 —— 你要求起轮而对面在忙时它是 `'steered'`,
把这句话原样写进工具结果,模型才知道对面会不会当场回你。

### 感知快照:先看它在干什么

```js
const peek = await api.sessions.peek(id)
// { sessionId, title, state, currentTool?, lastMessage?{role,preview,at},
//   contextPercent?, updatedAt }
// state: 'idle' | 'generating' | 'tool-running' | 'awaiting-permission'
//   判定优先序:awaiting-permission > tool-running > generating > idle
//   (挂着没人点的审批卡时,活跃流还在,但这轮一步也不会动)

const all = await api.sessions.list()   // peek-lite:无 lastMessage / contextPercent
const free = await api.isIdle(id)       // 读不到会话 = false
```

`preview` 硬截 120 字符、换行折成空格 —— 正文永不整条出境。`list()` 是拿来
**找到那个会话**的;找到之后再 `peek` 一次拿细节。

### 循环闸(为什么你的第 9 条被拒了)

两个会话互相"回个话"天然是一条不收敛的链。宿主兜两道:

1. **跳数**:由插件投递引发的回合所产生的再投递 hop+1,**上限 8**,超限
   `reason:'hop-limit'`。口径是保守上界(取此刻所有在飞的插件链里最深的那一跳
   +1)—— 它不需要你配合,也因此规避不了;并发时可能偏保守。
2. **频率**:每 `(插件, 目标会话)` 对 **10 次 / 分钟**,超限 `reason:'rate-limited'`。

被拒了就**停下**并把原因写进工具结果,别重试 —— 那正是闸要挡的行为。

### 提示词即控制流

"收到别的会话来的消息要不要回"不该是一段插件代码,而是**工具描述里的一句
礼仪**:回话本身就是再调一次你的发送工具。样板见市场仓
`packages/session-link`(`message_session` / `list_sessions`)。

### 两个必须知道的语义

- 注入的消息带 `origin.source = 'plugin:<你的 id>'` 与 `origin.plugin = {id, hop}`
  —— 它**不冒充用户**。因为它算"系统驱动的回合",这一轮里的权限提示 120s 无人
  应答会自动降级(而不是永远挂着)。
- **协作房 / agent 执行会话不接受插件投递**(它们由协调者独占驱动),回
  `reason:'unsupported'`。

## 锚点清单与两种形态(常显块 / 触发式)

宿主认识的锚点是**编译期常量**,你不能发明。今天有七个:

| anchor | 形态 | 在哪 | ctx 带什么 | 容量 |
|---|---|---|---|---|
| `composer.above` | 常显块(**可选抽屉**) | 输入框上方横条 | `sessionId`(抽屉块另带 `drawerState`) | 3 块 / 32px,展开档 240px |
| `chat.status-bar` | 常显块 | 聊天面底部状态带(穿 chip 壳) | `sessionId` | 8 块 / 24px |
| `message.footer` | 常显块 | 每条 assistant 消息尾部 | `sessionId` + `messageId` | 6 块 / 24px |
| `message.actions` | **触发式** | 每条 assistant 消息的 ⋯ 菜单 | `sessionId` + `messageId` | 3 项,超出折叠 |
| `composer.actions` | **触发式** | 输入框工具条(附件按钮之前) | `sessionId` | 3 项,超出折叠 |
| `composer.aside` | 常显块(**分侧**) | 输入框左右两翼(边距空间) | `sessionId` | **每侧 1 块** / 宽 ≤ 48px、高 ≤ 输入框 |
| `composer.below` | 常显块 | 输入框正下方(后勤带) | `sessionId` | 2 块 / 每块 ≤ 24px,宽随输入框 |

- **`composer.aside`(两翼)**:容量是**每侧 1 块**,用 `"side": "left" \| "right"`
  点名(缺省 `right`);同侧的第二条声明按容量截断,设置页会说"锚点已满"。
  **降级**:窄窗(≤768px)整侧隐藏 —— 边距摆不下 48px 的翼时它第一个让路。
  **语义**:只放**辅助性内容**(一枚指示、一个计数);核心功能只住这里 =
  窄窗下这个功能对用户就是消失了。
- **`composer.below`(后勤带)**:**没有降级**,纵向恒在。**语义**:与
  `composer.above` 上下分工 —— above 放"这一轮带着什么"(草稿上下文),
  below 放"发出去之后会怎样"(提示、配额、状态)。

**形态由宿主的锚点表决定,不是你声明的** —— 声明形状两种一字不差:

```jsonc
{ "contributes": { "uiSlots": [
  { "anchor": "message.footer",  "id": "tps",       "label": "TPS" },
  { "anchor": "message.actions", "id": "tps-usage", "label": "Token usage" },
  // 分侧锚点上多一个可选字段;别的锚点上写了它会被忽略(不拒载)。
  { "anchor": "composer.aside",  "id": "tps-wing",  "label": "TPS", "side": "left" },
  { "anchor": "composer.below",  "id": "tps-hint",  "label": "TPS hint" }
] } }
```

### 触发式锚点(trigger)

平时**只有宿主画的入口**:`message.actions` 上是一行菜单项、
`composer.actions` 上是一枚图标钮 —— 文案就是你 manifest 里的 `label`
(v1 静态,没有动态徽标)。用户点它,宿主才开一层弹层,**这时才调你的
`render`**;关弹层即销毁,没有常驻实例。

时序是唯一的差别,协议一个字都没变:

```js
api.registerUiSlot({
  anchor: 'message.actions',
  id: 'tps-usage',                 // 必须与 manifest 里同 anchor 的某条 id 一致
  render(ctx) {
    // ctx.anchor === 'message.actions'
    // ctx.sessionId / ctx.messageId —— 与 message.footer 同款坐标
    const rec = api.storage.message(ctx.sessionId, ctx.messageId).readJson()
    if (!rec) return { version: 2, body: { type: 'empty-state', title: '没有记录' } }
    return { version: 2, body: { type: 'stack', gap: 'small', children: [
      { type: 'table',
        columns: [{ key: 'k', label: '指标' }, { key: 'v', label: '值' }],
        rows: [{ key: 'tps', cells: { k: '生成速度', v: `${rec.tps.toFixed(1)} tok/s` } }] },
    ] } }
  },
  onAction(input, ctx) { /* 与常显块同规,走 ui:action:* */ },
})
```

选形态只有一条判据(**per-item 铁律**):按条目繁殖的位置上(今天是消息级),
常显形态必须**极小且一行装得下**;表格、明细、长清单这类"重"内容只能走
触发式 —— 入口按消息繁殖没问题(一行文案),内容按需只渲染一份。
tps-meter 就是标准姿势:footer 一枚 24px 徽标常显,⋯ 菜单里一张明细表按需。

坑与语义:

- **弹层内容不开 webview**(与常显块同规,声明了拒载);它只画描述树。
- **`refreshIntervalMs` 在弹层里照常生效**,而且关掉弹层轮询自动停 ——
  按需时序自带省电,你不用自己管。
- **render 连败被降级闸关掉后,入口置灰但不消失**:用户点得进去,看到
  降级态并可以"再试一次"。失败的入口不占容量。
- 超出容量(3 项)的入口被折叠掉,只在菜单/工具条上报个数;详情在设置页。
- 一个插件可以同时住常显块与触发式(tps-meter / plan-status 都是),
  两条声明各写各的 `id`。

### 抽屉块(drawer,只在 `composer.above`)

常显块的老问题:它**一直挂着**。一条永远在输入框上方的状态行,大多数时候
没有信息量,却一直占着高度。抽屉是这条的解法 —— 加一个字段,你的块就有了
三态:

```jsonc
{ "contributes": { "uiSlots": [
  { "anchor": "composer.above", "id": "plan-status", "label": "Plan 执行状态", "drawer": true }
] } }
```

| 档 | 用户看到 | 你要返回什么 |
|---|---|---|
| **展开** `expanded` | 整块内容,高度预算 240px,超出块内滚动 | 一棵完整的树(stack:状态行 + 清单) |
| **半收** `peek`(默认) | 单行摘要(就是没有抽屉时的老形态) | 一行装得下的树(row) |
| **全收** `collapsed` | 块完全离场,S 状态带上剩一枚 chip(拼图 + 你的 label) | **什么都不用返回** —— 宿主不会调你的 render |

**三态是宿主的,不是你的**:开合钮由宿主画在块壳右侧(`⌄/⌃` 展开⇄半收、
`✕` 全收),用户选的档由宿主记住(按 `(插件, 锚点, id)`,重启还在)。
你唯一的感知是 render ctx 上多的一个字段:

```js
api.registerUiSlot({
  anchor: 'composer.above',
  id: 'plan-status',
  render(ctx) {
    // ctx.drawerState === 'expanded' | 'peek'(老宿主上是 undefined)
    if (ctx.drawerState === 'expanded') {
      return { version: 2, body: { type: 'stack', gap: 'small', children: [
        { type: 'row', children: [{ type: 'badge', text: '执行中', tone: 'accent' }] },
        { type: 'list', items: recentSteps(ctx.sessionId) },
      ] } }
    }
    // 半收 = 一行摘要。**默认档是它** —— 不判 drawerState 的老代码原样能跑。
    return { version: 2, body: { type: 'row', children: [
      { type: 'badge', text: '执行中' }, { type: 'markdown', text: '步骤 3/5' },
    ] } }
  },
})
```

坑与语义:

- **`drawer` 只在 `composer.above` 上算数**。写在别的锚点上不会拒载,
  但那个字段会被**忽略**(设置页能看到它被忽略了)。
- **不声明 = 一个字节都不变**:没有壳、没有钮、payload 里没有 `drawerState`。
- **切档 = 一次新的 render**(宿主重拉),不是你自己 poll 出来的;
  `onAction` 的 ctx 同样带当前档 —— 在展开档点按钮后别返回一行的树,
  块会当场塌回去。
- **全收档不会调你的 render**,所以取值域里没有 `'collapsed'`;
  未知值(未来新档)在老宿主上读成 `undefined` = 半收,向后兼容白送。
- 全收的块**不占** `composer.above` 的 3 块容量 —— 你收起来,别人顶上来。

## 布局动词:开合侧栏、打开工作台(手势锚定)

两个动词,都在 `api.ui` 上:

```js
await api.ui.toggleSidebar()          // 开合左栏
await api.ui.openWorkbench()          // 只展开右工作台
await api.ui.openWorkbench('logs')    // 展开 + 聚焦你自己的这个面板 tab
```

**它们没有 manifest 权限**,治理走的是另一条路 —— **手势锚定**:

> 布局动词只在**你的某个 ui slot 刚刚被用户点过**之后的 **5 秒**内有效。

理由:一句"我要能开合侧栏"申报在 manifest 里,用户读不出它会在**什么时候**
动;而"你刚点了它、它才动得了"是用户当场就能验证的因果。所以授权从一次性的
申报,挪到了每一次的互动。

- **窗内**(在 `registerUiSlot` 的 `onAction` 里调,或它触发的异步收尾里):照常生效。
- **窗外**(定时器里、事件订阅里、启动时):回
  `{ ok: false, error: 'gesture-required' }`。
- **没有窗口的宿主**(CLI daemon、headless server):回
  `{ ok: false, error: 'unsupported' }`。

两种错误码**都是规则拒绝,不是你的插件故障** —— 它们不计熔断、不会让你被
自动停用,而且**从不抛错**:动词永远回一份结果,你得自己看 `ok`。

```js
api.registerUiSlot({
  anchor: 'composer.above',
  id: 'plan',
  render: () => ({ /* … */ }),
  async onAction({ actionId }) {
    if (actionId !== 'open-details') return
    const result = await api.ui.openWorkbench('plan-details')
    if (!result.ok) api.ui.notify(`打不开:${result.error}`, 'warn')
  },
})
```

两条容易踩的:

- **`render` 不算手势**。宿主重画你的块不等于用户点了它 —— 否则每次重拉都
  等于开一次门。只有 `ui:action`(块里的按钮、trigger 弹层里的操作)记账。
- **`openWorkbench(panelId)` 只认你自己的面板**,而且那个面板必须在
  `contributes.panels[].placements` 里声明了 `'workbench'`。传别人的 id 不会
  报错,只是什么也不会发生(右栏仍然展开)。

## 样式与动画:你能改颜色,不能写动画

**默认就跟随主题**:描述树的每个节点都用宿主的 `--ui-*` 变量画,用户切深色
模式你的块自动变深色 —— 什么都不用做。这是绝大多数插件的正确选择。

真要品牌色,只有一条路:`contributes.theme`。

```jsonc
{ "contributes": { "theme": { "overrides": {
  "primary": "#ff4d00",
  "bg.app": "oklch(0.2 0.02 250)"
} } } }
```

规矩(每条都有硬闸):

- **只能覆盖既有 token,不能新增**。键必须是宿主主题表里的 token 路径
  (`packages/onething-runtime/src/themes/css-mapper.ts` 的 `CSS_VAR_MAP` 键)。
  不认识的键会被**丢掉**,插件照常加载,设置页卡片写明"dropped — not a theme token"。
- **值只能是颜色字面量**:`#hex`(3/4/6/8 位)、`rgb()/rgba()`、`hsl()/hsla()`、
  `oklch()/oklab()`、CSS 标准命名色。`url(...)`、`var(...)`、带 `;`/`}` 的串、
  空串、超过 128 字符一律丢弃(同样不拒载,卡片写明
  "dropped — not an allowed color value")。
- **一个插件最多 32 条**;超了是形状错,插件进 error 态。
- **覆盖是全局的**。两个插件覆盖同一个 token 时,按 pluginId 字典序**后者胜**;
  被压的那条在卡片上标 `theme "<token>" overridden by "<pluginId>"`。
- 覆盖是**参数,不是贴纸**:它在主题算色之前落位,所以 `--ui-*` 语义层、
  `-rgb` 变体、primary 色阶(hover/bg/border/text)会一起按你的颜色重算 ——
  覆盖一个 `primary` 就能把界面真的换个色系,不必逐条列几十个 token。
  同理:覆盖只写 `primary` 时,`accent`/`accentMain` 跟随它(与主题作者写
  `primary` 时同规);想让强调色跟主色分开,就把 `accent` 也显式写出来。
- 覆盖跟着**用户当前主题**每次重算,主题/明暗切换时保留;停用/卸载即刻撤除,
  `:root` 逐字回到主题原值。
- 装前确认页会写 `overrides theme colors (<token 清单>)` —— 用户在装之前就知道
  你要动他的配色。

### 背景图:`contributes.theme.background`

颜色之外唯一开出来的外观能力(L2.5)。图必须是**包内资产** —— 路径相对
`contributes.webviewRoot`(缺省 `webview/`),由 `onething-plugin://` 协议服务,
和 webview 面板同一条协议、同一批闸。**没有远程 URL 这个选项**。

```jsonc
{ "contributes": {
  "webviewRoot": "webview",
  "theme": { "background": {
    "image": "bg.svg",          // 必填,相对静态根
    "darkImage": "bg-dark.svg", // 可选;不写就深浅共用一张
    "opacity": 0.35,            // 0–1,缺省 1
    "blur": 0,                  // 0–40 px,缺省 0
    "fit": "cover"              // cover | contain | tile,缺省 cover
  } }
} }
```

规矩:

- **扩展名白名单**:png / jpg / jpeg / webp / svg / gif。相对路径、不许 `..`、
  不许 scheme、不许百分号编码 —— 判据与 webview entry 逐字相同。
- **越界即丢弃**:`opacity` 不在 0–1、`blur` 不在 0–40、`fit` 不在三选一里,
  整条 background 被丢掉,插件照常加载,设置页卡片写明
  `background dropped — <原因>`。声明是你写死的常量,宿主宁可说出来。
- **全局只有一块**。两个插件都声明时按 pluginId 字典序**后者胜**,被压的那条
  在卡片上标 `background overridden by "<pluginId>"`。停用/卸载即刻撤层。
- 背景铺的是**主内容区**(聊天 + 工作台),左栏与右侧工作台保留自己的底色。
- 装前确认页会写 `sets an app background image`。

**让用户能调透明度** —— 走 R3 设置 schema + 运行期 `api.theme.updateBackground`:

```jsonc
// plugin.json
{ "contributes": { "settings": { "schema": {
  "type": "object",
  "properties": { "opacity": { "type": "number", "default": 0.35, "minimum": 0, "maximum": 1 } }
} } } }
```

```js
// index.js
export default function (api) {
  const apply = () => {
    const { opacity } = api.settings.get()
    if (typeof opacity === 'number') api.theme.updateBackground({ opacity })
  }
  apply()                      // ← 启动时读一次:持久化归你自己
  api.settings.onChange(apply) // ← 用户在设置页改了就跟着变
}
```

`updateBackground` 只收 `opacity` / `blur` / `fit`;**`image` 换不了** ——
换图 = 发新版本。值同样钳制(越界钳进区间,坏类型忽略)。**它不持久**:
重启后回 manifest 缺省,所以上面那句"启动时读一次"是必须的,不是可选的。
没在 manifest 里声明 background 就调它,是一条 error 日志 + 拒绝(不熔断)。

**动画:描述树里没有,也不会有。** 描述树是纯数据,动画是"执行"的一种,
按宪法第 1 条划给宿主。宿主自带一小撮受限动效,你只声明状态:

- `progress` 的 `indeterminate: true` → 宿主的循环进度动画;
- `list` 项增删 → 宿主的进出场过渡;
- `tabs` 切换 → 宿主的页签与内容过渡;
- `badge` 的 `tone` 变化 → 宿主的颜色过渡。

**完全自定义动画 = webview(见下一章)**,没有第二条路。别在描述树里找
`style` / `className` / `transition` 字段 —— 它们不存在,而且是明确不做的红线
(节点级内联样式 = 半开的 CSS 注入)。

## webview 面板:逃生舱(C 期,L3)

图表、编辑器、拖拽、画布、任意动画 —— 描述树做不了的东西走这里。
**只有工作区面板能用**;锚点(`uiSlots`)永远不开 webview —— 常显块是
32px 单行(塞 iframe 没有正经场景),触发式的弹层同样只画描述树;
声明了会**拒载**。

### 声明

```jsonc
{
  "contributes": {
    "webviewRoot": "webview",              // 可省,缺省就是 "webview"
    "panels": [
      { "id": "chart", "label": "Revenue", "view": "webview", "entry": "index.html" }
    ]
  }
}
```

`entry` 的硬规矩(违反 = **这一条面板被丢弃**,插件其余能力照常,设置页卡片
写明 `panel "<label>" dropped — <原因>`):相对路径、不含 `..`、不含 `:`(所以
`javascript:x.html` 这类当场出局)、不含 `%`(编码变体)、不含反斜杠,
以 `.html` 结尾。

静态资源要跟着**包**走(`webviewRoot` 是相对包目录的),不是家目录 ——
家目录 `plugins/<id>/` 是数据区(`config.json` / `kv.json` / `storage/`),
协议一个字节都不服务那里。

### 页面跑在什么环境里

- **独立 origin**:`onething-plugin://<pluginId>/…`,协议只服务你的静态根内、
  白名单扩展名(html/js/css/json/svg/png/jpg/jpeg/webp/gif/woff2)的文件。
  别的扩展名回 415,穿越/软链逃逸回 404。
- **sandbox iframe**:`sandbox="allow-scripts"`,**没有** `allow-same-origin` ——
  你的页面是 opaque origin:没有 cookie、没有 localStorage、
  `document.domain` 无意义。要存东西用 `api.storage`(main 进程侧)。
- **CSP 钉死**:`default-src 'none'; script-src 'self' onething-plugin://<你的 id>;
  style-src … 'unsafe-inline'; img-src … data:; connect-src 'none'`。
  **`connect-src 'none'` = 页面不能出网**:没有 fetch、没有 XHR、没有 WebSocket。
  要联网在 main 进程侧做(你的插件代码在那里),结果经 `invoke` 递进来。
- **没有宿主对象**:`window.electronAPI`、`require`、`process` 一个都没有。
  与宿主之间只有 postMessage。

### 通信协议(全部内容)

宿主 → 页面:

| 消息 | 何时 | 形状 |
|---|---|---|
| `init` | 页面 `load` 之后的第一帧 | `{ type:'init', token, data }` |
| `refresh` | 你在 main 侧调了 `ctx.refresh()`,宿主重拉初始化数据之后 | `{ type:'refresh', token, data }` |
| `result` | 你的 `invoke` 的回帖 | `{ type:'result', token, requestId, result }` 或 `{ …, error }` |

页面 → 宿主(**每一条都必须带 `token`**,否则静默丢弃):

| 消息 | 形状 |
|---|---|
| `ready` | `{ token, type:'ready' }` |
| `invoke` | `{ token, type:'invoke', requestId, actionId, payload }` |

`invoke` 走的是既有的 `panel:action:<panelId>` 请求通道 —— 30s 预算、abort、
熔断账、`payload` 的可序列化守卫全部照常继承。它落到你在 main 侧写的
`onAction({ actionId, payload }, ctx)`。

**握手是必须的。** 宿主读不到 opaque origin 的 document,判断"这一页起来了没有"
的唯一信号就是你回的那条带 token 的消息。**10 秒内不回,面板显示加载失败**
(附一个 Reload 按钮)。协议 404 会渲染一张宿主的纯文本错误页 —— 它不会回握手,
于是"entry 写错了"也走同一条错误态。

### 一段可以直接拷走的 vanilla JS

```html
<!doctype html>
<meta charset="utf-8">
<div id="app">Loading…</div>
<script>
  let token = null
  let seq = 0
  const pending = new Map()

  window.addEventListener('message', event => {
    const msg = event.data
    if (!msg || typeof msg !== 'object') return
    if (msg.type === 'init') {
      token = msg.token
      // 握手确认:回一条,宿主的看门狗就撤了。
      parent.postMessage({ token, type: 'ready' }, '*')
      render(msg.data)
      return
    }
    // init 之后的消息校验 token —— 宿主也在校验你,两边对称。
    if (!token || msg.token !== token) return
    if (msg.type === 'refresh') render(msg.data)
    if (msg.type === 'result') {
      const waiter = pending.get(msg.requestId)
      if (!waiter) return
      pending.delete(msg.requestId)
      msg.error ? waiter.reject(new Error(msg.error)) : waiter.resolve(msg.result)
    }
  })

  /** 调一个 main 侧的 action;返回 onAction 的返回值。 */
  function invoke(actionId, payload) {
    const requestId = 'r' + (++seq)
    return new Promise((resolve, reject) => {
      pending.set(requestId, { resolve, reject })
      parent.postMessage({ token, type: 'invoke', requestId, actionId, payload }, '*')
    })
  }

  function render(data) {
    document.getElementById('app').textContent = JSON.stringify(data)
  }
</script>
```

main 侧(可选 —— 纯静态面板完全合法):

```js
export default function (api) {
  api.registerWorkspacePanel({
    id: 'chart',
    // webview 面板的 render 返回的是**初始化数据**,不是描述树。
    // 宿主不解释它,原样 postMessage 给页面(必须 JSON-可序列化)。
    render: () => ({ series: loadSeries() }),
    onAction: async ({ actionId, payload }, ctx) => {
      if (actionId === 'export') await exportCsv(payload)
      // 想让页面拿到新数据:调 refresh,宿主重拉 render 再推一条 refresh。
      ctx.refresh()
    },
  })
}
```

### 披露与降级

- 装前确认页与已装卡片都会写 **`runs sandboxed UI code`** —— 用户在装之前就
  知道你会在应用里跑自己的界面代码。
- iframe 加载失败(entry 不存在、握手超时)是**宿主/文件问题**,不计你的熔断账;
  `onAction` 连败照常计账,达阈之后这个面板被降级(`panel:<id>` surface),
  插件的工具/命令/提示词照常。
- 停用或卸载之后,`onething-plugin://<你的 id>/…` 立刻 404。

## 氛围层(ambient):全窗动画覆盖层 + 地标词表

webview 的第三个住址(前两个是工作区/工作台面板)。声明:

```json
{ "contributes": { "webviewRoot": "webview", "ambient": { "entry": "ambient.html" } } }
```

页面环境与 webview 面板同一套(sandbox iframe、独立 origin、CSP 只放行包内
同源资源、token 握手),另加三条**住址特性**:铺满整窗、`pointer-events: none`
(永远点击穿透,你画不出可交互的东西 —— 这是住址属性不是限制)、层级压在
菜单/对话框**之下**(浮层永远盖住你)。窗口失焦/隐藏时宿主推 `pause`,
回来推 `resume` —— 收到 pause 必须停 rAF。

### 协议(全部消息)

```
host → 你   ambient-init        首帧握手,带 token(此后出入境消息都带它)
你 → host   ambient-ready       回握手
host → 你   ambient-vocabulary  地标词表,握手后只发一次
host → 你   ambient-geometry    地标矩形,布局变化时 rAF 合并推送
host → 你   ambient-pause / ambient-resume
```

`vocabulary`:`{ anchors: { <name>: { kind, cardinality } } }` —— 屏幕语义
地图的静态表。kind 目前有 `surface`(可落面:带边框/底色的**可见**元素)与
`envelope`(**参考几何,不是落面** —— 它是布局盒,含不可见 padding,把东西
"放"上去会悬空);cardinality `singleton | per-item`。

`geometry`:`{ viewport, composerRect, anchors, surfaces }`。
`surfaces: [{ name, index, rect }]` 是你该用的那份 —— **在列即在场,离场即
缺席**(没有 null 占位);`rect` 是视口坐标,iframe 铺满整窗,**视口坐标即
你的 canvas 坐标**,不用换算。`composerRect`/`anchors` 是 v1 兼容字段。

### 五条铁律(每条都有真机判例垫底)

1. **按 kind 分流,不对名字硬编码**。词表 append-only,将来会加新 kind
   (如 region);未知 kind 一律忽略。你的物理对着 kind 写,换个宿主版本
   不用改代码。
2. **envelope 不是落面**。判例:把 composer 容器当落面,雪悬空堆在
   "看不见的容器上沿"、雪人挂半空。需要"兜底"时,兜到视口底,不是兜到包络。
3. **`index` 不是跨帧身份**。它只在同一条 geometry 内稳定。进出场判定用
   "这一帧在不在列";要跟踪同一个面,自己用 `name + 水平位置` 做签名
   (对**垂直**位移免疫 —— 抽屉 240↔32 过渡时 rect.top 逐帧在变,签名不变,
   你的堆积物才能骑着顶边走而不是被判离场重来)。
4. **离散化别越可见边**。判例:按列切画布 + "重叠即归属"判据,边缘列搭上
   1px 就整列归属,画出来的东西探出可见元素几个像素。要么用列中心点判据
   (窄于一列的矩形特判),要么绘制时把横向范围钳到 rect 的 left/right 内
   ——最好两个都做。
5. **面离场时,它上面的东西要有个交代**。宿主不发"即将消失"预告(那要求
   宿主为你延迟卸载,不可能给);你 diff 前后两帧 surfaces 自察进出场,
   用最后一次的 rect 做退场演出(解冻重落、淡出、扬尘,随你)。

### 预算与降级

粒子/绘制预算自律(参考:全窗粒子 ≤ 60、堆积转静态路径而非粒子、单面堆积
高度设上限)。宿主不强制预算,但真机走查会看帧。设置页有"氛围层"总闸 +
每插件开关,被关时 iframe 直接销毁 —— 不需要你配合,但别把状态只存在
iframe 里(重开就没了;要持久用 `api.storage`)。

## 安全与边界(速查)

- UI 不执行插件代码:面板/锚点块都是**描述树**,宿主渲染。
- 入口只有默认导出函数,`api` 由宿主注入;不要 import 宿主模块。
- 权限/熔断:钩子超时、事件 handler 抛错会进熔断账,严重按策略表
  禁用插件或只降级一个界面(`packages/core/plugins/policy.ts`)。
- 撞内置 id 装前拒。**手工往 `~/.onething/plugins/` 里放目录不再是安装方式**
  (2026-08-09 legacy 目录插件清零):那种目录不会被加载,也不会被报错或删除。
  唯一入口是 npm 账(市场安装或 `file:` 开发通道)。

## 排障

| 症状 | 多半是这个 |
|---|---|
| 装了但插件表里没有 | id 撞内置(装前就该被拒);或入口文件缺失/加载闸(minAppVersion) |
| 更新徽标永不灭 | plugin.json 与 package.json 版本漂移 |
| 拒装:"runtime dependencies" | 依赖没被 bundle 进单文件(检查 dist/package.json 应为零依赖) |
| 拒装:"Integrity mismatch" | 索引 SRI 与 tarball 实体不符;重新发 tag,不要手改 asset |
| 拒装:"name mismatch" | 索引/包名写错;包内 name 必须等于 `@onething-plugins/<id>` |
| 手工放的目录不出现在插件表 | 预期行为:2026-08-09 起只认 npm 账,目录形态不再加载 |
| webview 面板一直转圈然后报"did not load" | entry 路径写错(协议 404),或页面没回 `ready` 握手 |
| webview 页面里 `fetch` 全部 TypeError | 预期行为:CSP `connect-src 'none'`,页面不出网。联网在 main 侧做 |
| 面板在卡片上写 `dropped — …` | webview 声明非法(缺 entry / 有 `..` / 不是 .html / 静态根非法) |
| 装不上:`uiSlots[i].view is not supported` | 锚点块不开 webview,把它改成 `contributes.panels` 里的面板 |
| 消息态重启就没了 | manifest 没声明 `lifetime: "persistent"` |
| 写消息态抛 `quota` | 该插件消息态超 5MB 硬顶;记录该瘦身,宿主不替你淘汰 |
