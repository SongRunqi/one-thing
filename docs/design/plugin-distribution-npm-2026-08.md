# 插件分发与配置归位设计:npm 包形态 + GitLab registry(2026-08)

> 前置:`plugin-system-redesign-2026-08.md`(宪法与 R0–R7)、
> `plugin-ui/`(R5.x 锚点与描述树)。本文只动两件事 —— **插件怎么来**
> (分发/安装/卸载/更新)与**插件的配置住哪**;宪法六条、api 注入、
> 熔断账、请求通道、描述树协议一行不动。

## 0. 一句话

插件从"手动放的源码目录"变成"GitLab npm registry 里的打包 npm 包",
安装/卸载/更新退化成 npm 原语;配置从中央 `plugin-settings.json` 搬出来,
住进每个插件在 `plugins/` 下的同名家目录,`plugin-data/` 区整体退休。

## 1. 背景:今天的形态痛在哪

今天一个用户插件是 `~/.onething/plugins/<id>/` 下的**源码目录**:

- **安装没有命令**。放一个目录(或软链)+ 刷新,就是全部。有
  `uninstallPlugin`(含数据归档),没有 `installPlugin`。
- **运行时 npm install**。首次加载在插件目录里跑 `npm install`
  (`checkPluginNeedsInstall`,loader.ts:216),一轮 refresh 里带安装的
  插件占住最长 120s 窗口(manager.ts:491 注释)。装插件的联网成本
  摊在**加载期** —— 而加载本该是毫秒级、不该联网的动作。
- **版本/更新没有答案**。plugin.json 有 version 字段,但没有任何东西
  消费它。
- **配置挤在一个中央文件**。`plugin-settings.json` 的 `config` 段装着
  所有插件的自有配置:一处损坏全部遭殃(有 `.corrupt-*` 兜底但仍是
  单点),卸载残留靠自觉,没有所有权边界。
- **`plugin-data/<id>/` 与 `plugins/<id>/` 两区并立**。代码一区、数据
  一区,本身合理;但数据区游离在插件的生命周期管理之外,孤儿要靠
  专门的扫描+归档机制(`findCorePluginDataOrphans` /
  `archiveCorePluginData`)收尸。

## 2. 裁决(先拍板,后展开)

1. **分发形态 = npm 包,打包产物,不是源码**。CI 侧 esbuild 把依赖全部
   bundle 进 `plugin-entry.js`,npm 包零运行时依赖是目标;运行时
   npm install 机制(首载 120s 窗口)随本期**废除**。
2. **安装账 = `plugins/package.json` 的 dependencies**。装没装、装的
   什么版本,npm 自己记账;loader 的清单来源从"目录扫描"换成
   "dependencies 列表 + 逐个 resolve"。账和货天然一致。
3. **`node_modules/` 是一次性代码区,任何数据永不许进**。npm 每次
   update/uninstall 整目录抹掉重建 —— 这是铁律,配置、KV、storage
   都不许写进去。
4. **插件家目录 = `plugins/<id>/`**(node_modules 的兄弟,app 全权
   拥有的数据区):`config.json`、`kv.json`、`storage/` 都住这。
   `plugin-data/` 退休,存量惰性迁移,空壳归档。
5. **`enabled` / `health` 留在中央 `plugin-settings.json`**。那是宿主
   *关于*插件的账(启动要读 enabled 决定加载谁;health 是熔断账本),
   不是插件自己的配置 —— 不搬。`config` 段搬空后中央文件只剩这两节。
6. **pluginId = npm 包名去 scope**。v1 认单一 scope
  (`@onething-plugins`),跨 scope 冲突拒绝加载并在日志明说
   —— pluginId 要当目录名用(`assertSafePluginDirName` 拒 `/`),
   全名含 `/` 的映射不在本期发明。

## 3. 目标形态

### 3.1 GitLab 侧

```
插件仓库(group: onething-plugins)
├── packages/plan-status/            # 每个插件一个 npm 包
│   ├── src/plugin-entry.ts          # 源码(开发态)
│   ├── plugin.json                  # manifest(分发物的一部分)
│   ├── package.json                 # name: @onething-plugins/plan-status
│   └── README.md
├── scripts/build-plugin.mjs         # esbuild --bundle → dist/plugin-entry.js
├── .gitlab-ci.yml                   # build → bundle → npm publish → 更新 index.json
└── index.json                       # CI 生成的市场索引(见 §8)
```

发布通道:GitLab Package Registry(npm 类型,平台自带,不架新服务)。

### 3.2 本地侧

```
~/.onething/plugins/
├── package.json                     # 已装插件账(npm 维护,不许手编)
│                                    #   dependencies: {"@onething-plugins/plan-status": "^1.0.0"}
├── package-lock.json                # 版本锁定 + integrity,免费
├── .npmrc                           # registry 指向 + token(见 §9)
├── node_modules/                    # 【一次性代码区,数据禁入】
│   └── @onething-plugins/
│       └── plan-status/
│           ├── plugin.json          # manifest 照旧
│           └── plugin-entry.js      # bundled,宿主直接 import()
├── plan-status/                     # 【插件家目录:数据区】
│   ├── config.json                  # 自有配置(从中央文件搬来)
│   ├── kv.json                      # KV(从 plugin-data 搬来)
│   └── storage/                     # api.storage 的 scratch(同上)
├── ui-demo/                         # 另一个插件的家目录
└── legacy-backup/                   # 归档区(plugin-data 退休收尸、卸载归档,沿用现有机制)
```

中央 `~/.onething/plugin-settings.json` 缩编为:

```jsonc
{
  "enabled": { "plan-status": true },   // 宿主的启用开关
  "health":  { ... }                    // 宿主的熔断账本
  // config 段:搬空,读取路径留惰性迁移
}
```

### 3.3 开发者流(不破坏)

- `npm link` / `file:` 依赖:开发中的插件以 `file:../../sample-plugins/plan-status`
  写进 plugins/package.json,npm 自动建软链 —— 标准 npm 开发流,
  替代今天的手工 `ln -s`。
- **配置对开发者同样住 `plugins/<id>/`**(app 拥有的数据区),不再出现
  "软链插件把配置写进源码仓库"的事故。
- 存量手工目录插件(今天 `plugins/<id>/` 直接是代码):见 §5.4 兼容。

## 4. manifest 强化

`plugin.json` 从"半可选"(缺失时兜底 `{name, version: 0.0.0}`)升级为
npm 形态下的**强制文件**,字段增:

| 字段 | 现状 | 变化 |
| --- | --- | --- |
| name/version/description/author | 有 | npm 形态下必填且须与 package.json 一致(loader 校验不一致拒载) |
| contributes | 有 | 照旧;市场索引的摘要由 CI 从它生成 |
| minAppVersion | 有 | 市场索引必填(装前版本闸,不只装后) |
| entry | 有 | 照旧(默认 plugin-entry.js) |
| repository / homepage | 无 | 可选,市场卡片回跳链接 |

`package.json` 里新增(插件作者侧,CI 模板给出):

```jsonc
{
  "name": "@onething-plugins/plan-status",
  "version": "1.0.0",
  "files": ["plugin.json", "plugin-entry.js"],   // 发布物白名单
  "publishConfig": { "registry": "https://gitlab.example.com/api/v4/projects/<id>/packages/npm/" }
}
```

## 5. 加载器改造

### 5.1 清单来源

`packages/core/plugins/loader.ts` 的扫描从"遍历 plugins/ 下每个目录"
改为:

1. 读 `plugins/package.json` 的 `dependencies`(读失败/不存在 = 空账,
   warn,**不删任何东西**);
2. 逐个 resolve `node_modules/<dep>/plugin.json` → manifest、入口
   (`manifest.entry` 照旧);dep 存在但包里**没有 plugin.json** = 它不是
   onething 插件,跳过(普通依赖与插件可以共存于同一棵 node_modules);
3. pluginId = 包名去 scope;同 id 冲突(两个 scope 装了同名包)拒绝
   后到的那个,日志明说。

### 5.2 入口加载

不变:`import(buildPluginEntryImportSpecifier(entryPath, reloadToken))`,
缓存破坏 token 照旧支持 refresh 重载。

### 5.3 废除运行时 npm install

`checkPluginNeedsInstall` 与首载 install 路径**整段删除**。npm 包在
install 时已带全部依赖(bundle 进入口或随包 node_modules),加载期
出现缺失依赖 = 包没打好,按加载失败记账(既有熔断),不再现装。

### 5.4 存量兼容(手工目录插件)

今天直接住在 `plugins/<id>/` 的代码目录(非 npm 形态):

- 发现规则:目录里有 `plugin.json` 且**不在** dependencies 账里 →
  按 legacy 形态照常加载,日志 + 设置页标记 `legacy`(提示"以 npm
  形式重装可获更新通道")。
- 注意与裁决 4 的交叠:`plugins/<id>/` 同时是数据家目录。**判别顺序**:
  有 plugin.json = legacy 代码目录(其数据仍在 `plugin-data/<id>/`,
  不搬,直到用户重装为 npm 形态);没有 = 纯数据家目录。
- 这条兼容路径在市场落地后保留一个版本周期,之后随 legacy 插件清零
  再删。

## 6. 生命周期命令链

core manager 增(`PluginManager`,与 uninstallPlugin 对称):

```ts
installPlugin(input: { pkg: string; version?: string }): Promise<InstallResult>
// 1. 在 plugins/ 下跑 npm install <pkg>[@version](install 是显式动作,联网合理)
// 2. refreshPlugins()(既有,含 catalog-changed 广播,R5 为面板加的通道直接复用)
// 3. 新装插件默认 enabled;失败回滚 npm 状态,错误原样透传

updatePlugin(pluginId: string): Promise<UpdateResult>
// npm install <pkg>@latest;版本闸 minAppVersion 在装后重校,不够则回退旧版并明示

checkPluginUpdates(): Promise<Array<{ pluginId: string; current: string; latest: string }>>
// npm outdated --json 的薄封装;设置页"有更新"徽标的来源
```

`uninstallPlugin` 基本不动,两处适配:源码目录改走 `npm uninstall`;
数据归档目标从 `plugin-data/<id>/` 改为 `plugins/<id>/` 家目录
(归档机制 `archiveCorePluginData` 原样复用,只换 dataRoot)。

IPC(`shared/ipc/plugins.ts` + preload + 主进程 handler):新增
`plugin:install` / `plugin:update` / `plugin:check-updates` 三个通道;
设置页 `PluginsSettingsTab.vue` 增 Install/Update 按钮与"有更新"徽标
(已有 Uninstall 按钮,对称即可)。

## 7. 配置与数据搬家(plugin-data 退休)

### 7.1 新位置

| 数据 | 今天 | 之后 |
| --- | --- | --- |
| 自有配置 | `plugin-settings.json` 的 `config.<id>` | `plugins/<id>/config.json` |
| KV(api.store) | `plugin-data/<id>/kv.json` | `plugins/<id>/kv.json` |
| api.storage scratch | `plugin-data/<id>/` | `plugins/<id>/storage/` |
| 启用开关/熔断账 | `plugin-settings.json` | **不动** |

### 7.2 迁移(惰性,KV 迁移先例 `migrateLegacyPluginKv`)

- **配置**:首次读写某插件配置时,若 `plugins/<id>/config.json` 不存在
  且中央 `config.<id>` 有行 → 写入新文件,从中央抹掉该行(中央文件
  只在有实际搬移时重写)。读写路径的校验/默认值填充/剥未知键
  (`config.ts`)一行不动 —— 它只看 host 接口,host 实现
  (`readPluginConfig`/`writePluginConfig`,runtime loader.ts:136-142)
  换存储位置。
- **KV/storage**:首次访问时 `plugin-data/<id>/` 内容 `renameSync` 进
  `plugins/<id>/`(rename 是原子同盘操作;目标已存在则保留目标,
  旧目录留着等归档,与 KV 迁移同一条先例)。
- **收尸**:启动时扫 `plugin-data/`,空的/已搬净的目录经既有
  `archiveCorePluginData` 归档进 `legacy-backup/`;有内容但插件已不
  存在的,维持现有孤儿处理不动。
- **回退**:不发明双向迁移。搬过的行从中央抹掉即完成;要回滚版本,
  `legacy-backup` 里有尸可捞。

### 7.3 铁律的执行点

`plugins/node_modules/` 下任何写操作 = 架构违规。在
`assertSafePluginDirName` 同层加一个 `assertNotInNodeModules(path)`
断言,storage/config/KV 三条写路径各调一次;测试用例:试图把
config 写进 node_modules 必须当场抛。

## 8. 市场(v1:能搜、能装、能更新)

### 8.1 索引

CI 在每个插件发布时重生成根 `index.json`:

```jsonc
{
  "version": 1,
  "generatedAt": "2026-08-08T00:00:00Z",
  "plugins": [{
    "id": "plan-status",
    "pkg": "@onething-plugins/plan-status",
    "version": "1.1.0",
    "description": " composer.above 的执行状态块",
    "author": "onething",
    "minAppVersion": "1.4.0",
    "contributes": { "uiSlots": [{ "anchor": "composer.above", "label": "Plan 执行状态" }] },
    "sha256": "…",                    // npm publish 产物的 integrity
    "repository": "https://gitlab.example.com/onething-plugins/repo/-/tree/main/packages/plan-status"
  }]
}
```

为什么自维护 index.json 而不是直接查 GitLab packages API:API 列得出
包,但**给不了 contributes/权限/minAppVersion 摘要** —— 装前展示
"这个插件要在你的输入框上方放东西、要哪些权限"是市场的信任根基,
值得一个 CI 生成物。

### 8.2 应用内

- 设置页新增"市场"区:拉取 index.json(启动时 + 手动刷新,失败用
  上次缓存),搜索框纯前端过滤(id/description/author);
- 卡片显示:描述、contributes 摘要(复用 `contributesSummary`)、
  minAppVersion 与当前宿主版本的比对结果、已装/有更新徽标;
- 动作 = §6 的命令链:Install / Update / Uninstall。
- 装前确认页列出 contributes 与 permissions —— **声明先于代码**在
  分发环节的延伸:用户点头前看到的就是 manifest,不是营销文案。

## 9. 安全与边界

1. **装插件 = 远程执行代码**,文档与 UI 都必须明说,不粉饰。兜底
   体系已就位:R6/R7 的熔断/降级账、权限声明、请求通道预算,对
   npm 形态插件原样生效。
2. **完整性**:index.json 的 sha256 与 npm install 后实际产物比对,
   不符即拒载并提示。签名(PGP/sigstore)不在本期。
3. **token**:`plugins/.npmrc` 持有私有 registry 的 read token
   (`//gitlab.example.com/api/v4/projects/<id>/packages/npm/:_authToken=…`),
   设置页提供粘贴入口,写入时 0600。token 永不进日志、不进
   plugin-settings.json。
4. **原生模块(node-gyp)**:CI 模板把依赖全部 bundle,包内不该有
   运行时 node_modules 依赖;loader 发现包带 `binding.gyp`/原生
   依赖时 warn(软约束),不拒 —— 但市场索引由 CI 生成,可以在
   CI 侧直接卡死(硬约束放 CI,不放运行时)。
5. **registry 单点**:v1 一个 registry URL(应用配置项,不进插件)。
   多 registry 不发明。

## 10. 分期落地与验收

### P1:npm 形态 + 配置搬家(地基,独立可用)

- loader:dependencies 清单 + resolve + legacy 目录兼容(§5);
- 废除运行时 npm install(§5.3);
- manager:installPlugin/updatePlugin/checkPluginUpdates(§6),uninstall 适配;
- 配置/KV/storage 搬家 + 惰性迁移 + legacy-backup 收尸(§7);
- IPC 三通道 + 设置页 Install/Update(先吃 `file:` 与本地 registry 包);
- **验收**:以 `file:sample-plugins/plan-status` 安装 → 加载 → 配置写入
  `plugins/plan-status/config.json`(中央 config 段对应行消失)→
  update → config.json 原样保留 → uninstall → 家目录归档、
  node_modules 无残留;`plugin-data/` 空壳进 legacy-backup;
  全量 vitest + 双端 typecheck 绿。

### P2:GitLab registry + CI 模板

- 插件仓库骨架:packages/* + build-plugin.mjs(esbuild bundle)+
  .gitlab-ci.yml(publish + 重生成 index.json);
- sample-plugins/plan-status 改造为首个 npm 形态示范(zod 依赖的
  log-monitor 作为 bundle 示范第二例);
- **验收**:CI 发布后,应用以 registry 形态安装 plan-status,功能与
  file: 形态逐字节一致;包内无运行时 node_modules 依赖。

### P3:市场 UI

- index.json 拉取/缓存/搜索;装前确认页(contributes + permissions);
- 有更新徽标(checkPluginUpdates);
- **验收**:断网时市场区显示上次缓存 + 明示过期;minAppVersion 不够
  的插件 Install 置灰并说明;sha256 不符拒载有测试。

### P4:收尾

- 插件作者指南(打包/发布/manifest 字段);CLAUDE.md 插件条目更新;
- legacy 目录插件清零计划;apps/server 的独立插件树
  (`owners/<uid>/<wid>/plugin-store/plugins`)登记为"本期不动",
  其 npm 化随 server 插件策略单独立项。

## 11. 风险与对策

| 风险 | 对策 |
| --- | --- |
| install 时网络/token 失败 | install 是显式动作,错误原样透传到 UI;token 走 .npmrc,不见日志 |
| 用户手编 plugins/package.json 搞坏账 | 读失败 = 空账 + warn,不删任何文件;设置页给"修复"(npm install 全量重装)入口 |
| 两个 scope 同名包装出同 pluginId | 拒绝后到者,日志明说;v1 引导单 scope |
| npm 重装抹 node_modules 连带数据 | 铁律 3 + assertNotInNodeModules 断言 + 测试(§7.3) |
| legacy 目录插件与数据家目录撞名 | §5.4 判别顺序:有 plugin.json = 代码目录,数据留 plugin-data 不搬 |
| 老插件配置没搬完就回滚版本 | legacy-backup 有尸;中央文件只在实际搬移时重写,不会半吊子 |
| CI 生成的 index.json 与 registry 实际版本漂移 | CI 同一 job 内 publish → 读 registry 验证 → 才写 index.json |

## 12. 不在本期

- 包签名/可信发布者体系;
- 多 registry 与 registry 镜像;
- 付费插件与许可校验;
- CLI/gateway 的插件装配(CLI daemon 今天就不装插件,安装命令的
  CLI 入口随 CLI 插件策略单独立项);
- apps/server 插件树的 npm 化(§10 P4 只登记);
- 插件间依赖(插件依赖插件)—— npm 语义上可行,但激活序/熔断账
  要重想,真实需求出现前不动。
