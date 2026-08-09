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
| `panels` | `[{id,label}]` | 工作区面板(描述树,UI 不执行插件代码) |
| `uiSlots` | `[{anchor,id,label,lifetime?}]` | 锚点块;未知锚点按"此版本不支持"呈现。`lifetime: "persistent"` 是**消息态落盘的闸门**(见下),缺省 `"ephemeral"` |
| `theme` | `{overrides:{token:color}}` | 主题 token 覆盖(见下);装前确认页列出被改的 token |
| `settings` | `{schema}` | JSON Schema 子集,宿主渲染并校验设置表单 |
| `permissions` | `string[]` | 装前确认页如实列出 |
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
- 覆盖叠在**用户当前主题之上**,主题切换时保留;停用/卸载即刻撤除,
  `:root` 回到主题原值。
- 装前确认页会写 `overrides theme colors (<token 清单>)` —— 用户在装之前就知道
  你要动他的配色。

**动画:描述树里没有,也不会有。** 描述树是纯数据,动画是"执行"的一种,
按宪法第 1 条划给宿主。宿主自带一小撮受限动效,你只声明状态:

- `progress` 的 `indeterminate: true` → 宿主的循环进度动画;
- `list` 项增删 → 宿主的进出场过渡;
- `tabs` 切换 → 宿主的页签与内容过渡;
- `badge` 的 `tone` 变化 → 宿主的颜色过渡。

**完全自定义动画 = webview(C 期)**,没有第二条路。别在描述树里找
`style` / `className` / `transition` 字段 —— 它们不存在,而且是明确不做的红线
(节点级内联样式 = 半开的 CSS 注入)。

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
| 消息态重启就没了 | manifest 没声明 `lifetime: "persistent"` |
| 写消息态抛 `quota` | 该插件消息态超 5MB 硬顶;记录该瘦身,宿主不替你淘汰 |
