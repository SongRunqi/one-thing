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
| `uiSlots` | `[{anchor,id,label}]` | 锚点块;未知锚点按"此版本不支持"呈现 |
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
   插件(当前 `log-monitor`、`note-skills`)会被**装前拒绝**;
   撞上一个已存在的 legacy 目录插件 id 则是设计好的转正路径(npm 赢)。
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

## 数据落盘约定

- 插件家目录 = `~/.onething/plugins/<id>/`:`config.json`(宿主写,
  设置表单)、`kv.json`(`api.storage` KV)、`storage/`(自留地)。
- **`node_modules/` 是代码区,任何数据永不许写进去** —— npm 每次
  update/uninstall 整目录抹掉重建,写进去等于丢。
- 卸载 = 家目录整体归档到 `plugins/legacy-backup/<id>-<date>/`
  (可恢复),代码从账与 node_modules 拆除。

## 安全与边界(速查)

- UI 不执行插件代码:面板/锚点块都是**描述树**,宿主渲染。
- 入口只有默认导出函数,`api` 由宿主注入;不要 import 宿主模块。
- 权限/熔断:钩子超时、事件 handler 抛错会进熔断账,严重按策略表
  禁用插件或只降级一个界面(`packages/core/plugins/policy.ts`)。
- 撞内置 id 装前拒;同 id legacy 目录在 npm 装上期间被扫描跳过,
  卸载 npm 形态后它会复活 —— 转正请先删旧目录。

## 排障

| 症状 | 多半是这个 |
|---|---|
| 装了但插件表里没有 | id 撞内置(装前就该被拒);或入口文件缺失/加载闸(minAppVersion) |
| 更新徽标永不灭 | plugin.json 与 package.json 版本漂移 |
| 拒装:"runtime dependencies" | 依赖没被 bundle 进单文件(检查 dist/package.json 应为零依赖) |
| 拒装:"Integrity mismatch" | 索引 SRI 与 tarball 实体不符;重新发 tag,不要手改 asset |
| 拒装:"name mismatch" | 索引/包名写错;包内 name 必须等于 `@onething-plugins/<id>` |
| legacy 徽标 | 目录安装的旧形态;装 npm 形态转正(先删旧目录) |
