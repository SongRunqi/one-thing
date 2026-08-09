# legacy 目录插件清零计划

> 状态:**已完成(2026-08-09 移除期一次性执行完毕,验收见文末)**。
> 前置:P1(npm 形态)✅、P2(市场仓库 + CI)✅、P3(市场 UI)✅。
> 本文是 legacy 兼容路径的**退役时间表与操作单**,不是新设计。

## 2026-08-09 裁决:时间表压缩,一期做完

原时间表横跨三个 minor 版本(警告→切换→移除),那套缓冲是为"第三方作者
生态"设计的 —— 现实是存量 legacy 插件的作者只有我们自己,且真机核查
(2026-08-09)发现**存量已经自然清零**:`~/.onething/plugins/` 下已无任何
legacy 目录,plan-status 已是市场 npm 形态(账本 v1.0.1),ui-demo 已不在
(其能力演示由 plan-status/tps-meter 覆盖,不转正、不保留)。警告期保护的
对象不存在,压缩为一期直接执行移除期。

原"时间表"与"存量转正操作单"两节保留为历史注记(操作单对将来手工目录
形态的一次性迁移仍有参考价值)。

## 对象

"legacy 目录插件" = `~/.onething/plugins/<id>/` 下有 `plugin.json` 但**不在**
npm 账(`plugins/package.json` dependencies)里的存量手工目录(判别见
分发设计 §5.4)。围绕它的兼容设施有三处,清零 = 三处都撤:

1. **扫描分支**:`scanLegacyPluginDirectories`(core/loader)— 兼容加载;
2. **needsInstall 门控**:legacy 插件缺依赖时首载 npm install 的旧机器
   (npm 形态已废除运行时安装);
3. **`plugin-data/` 数据根**:legacy 的数据旧家(家目录布局后已退休,
   空壳已由孤儿扫描自动收尸进 `plugin-data/legacy-backup/`)。

## 为什么不清(现在)

- 存量只有两个真实插件(plan-status、ui-demo),都是开发演示;
- legacy 与 npm 共享运行时,兼容成本目前只是一次扫描分支 + 一个徽标;
- **同 id 共存陷阱**(§5.4 已知限制 1)在 legacy 存在期间只能靠规矩规避
  (装 npm 形态前先删同名目录)——清零后此坑自然消失。

## 时间表

| 阶段 | 窗口 | 动作 |
|---|---|---|
| 警告期(当前) | 市场落地后一个版本周期 | 启动日志警告 + 设置页 Legacy 徽标(已有);本计划公示 |
| 切换期 | 下一个 minor 版本 | 作者指南与设置页提示升级为"下版本移除";存量逐个转正(见下) |
| 移除期 | 再下一个 minor | 撤扫描分支与 needsInstall 门控;`plugin-data/` 读取路径删除(只剩 `legacy-backup/` 作为纯归档);§5.4 已知限制条目 1 随删 |

## 存量转正操作单(每个 legacy 插件一次)

```bash
# 1. 确认 id:目录名。查它有没有中央配置(决定是否无痛):
#    ~/.onething/plugin-settings.json 的 config 段有无该 id 的行
# 2. 删目录(或先挪到 /tmp 兜底):
rm -rf ~/.onething/plugins/<id>          # symlink 则删链即可
# 3. 装同名 npm 形态(市场或 file:):
#    设置页 → Plugin Market → <id> → Install
#    或 Install Plugin 表单:pkg @onething-plugins/<id> + 路径
# 4. 验证:
#    - 插件表出现,legacy 徽标消失;
#    - 中央 config 行在首次读取时已迁入 plugins/<id>/config.json(同 id 才谈得上迁移);
#    - plugin-data/<id>/(若有)已空壳收尸或被家目录取代。
```

注意:**id 不同则不是迁移是新装**(包名去 scope 才是 id;如 plan-status 的
市场包 `@onething-plugins/plan-status` id 恰为 `plan-status`,config 续得上;
若包名不同,旧配置留在旧 id 名下,需手动誊)。

## server 独立插件树:登记"本期不动"

`apps/server` 扫描的是**另一棵树**:`owners/<uid>/<wid>/plugin-store/plugins`
(不是 `<store>/plugins`),且只做目录投影(`noopEntry`,不执行),其
`/api/plugins/{enable,disable,refresh}` 路由写的 enabled 标志 desktop 从不读。
P1–P3 的全部 npm 化(账制扫描/生命周期命令/市场)**不适用于这棵树**;
其 npm 化随 server 插件策略单独立项(评估已登记:分发设计 §12.0,
含 H 线子进程隔离在 server 上升级为"强烈建议同期"的结论)。

## 验收(2026-08-09 逐条核对,全部通过)

1. ✅ `scanCorePlugins` 无 `scanLegacyPluginDirectories` 调用 —— 函数本身连同
   `packages/core/plugins/index.ts` 的导出一并删除;`CorePluginDefinition.legacy`
   标记字段删除,manager 的两处"legacy 没有更新通道"分支、清单投影
   (`plugin-list.ts`)与设置页徽标/更新按钮门控随之撤下。
2. ✅ loader 无 needsInstall 探测与门控安装机器:`checkPluginNeedsInstall`、
   `needsInstallCheck`、`CorePluginDefinition.needsInstall`、`loadCorePluginEntry`
   里的首载安装段全删;连带删掉已无调用者的
   `installCorePluginDependencies(/Async)`、runtime 的 `installPluginDeps`、
   `CORE_PLUGIN_INSTALL_TIMEOUT_MS`、健康态的 `installing` 状态与
   `pluginLoadLabel.npmInstall`。manager 的加载预算退化为固定 entry 预算。
3. ✅ `plugin-data/` 只剩归档用途:`migratePluginDataToHome` / `migrateLegacyPluginKv`
   与 `legacyDataRoot` 参数链删除,`createCorePluginStorage` / `CorePluginStore`
   不再做惰性搬家(两处 root 参数改为可选,家目录是桌面宿主的唯一根);
   `getPluginDataRoot()` 只被孤儿收尸使用,注释已收窄。
   `legacy-backup/` 与 `kv.legacy.json` 是**另外两种含义**的 legacy,原样保留。
4. ✅ 分发设计 §5.4 改为历史注记(含"同 id 共存陷阱已消失"的勘误)、
   §5.3 去掉"唯一例外"、风险表两行划掉;`CLAUDE.md` 与
   `docs/guides/plugin-authoring.md` 的目录形态描述同步。
5. ✅ 全量测试(908 文件 / 7780 用例)与双端 typecheck 绿,`boundary:gate` 无新红。

### 语义变化的登记(拆除带来的)

- **账外的手工目录**(有 `plugin.json` 但不在 dependencies 里):**不加载、不报错**;
  家目录孤儿扫描继续按 `plugin.json` 在场跳过它 —— 它既不是插件也不是宿主管的
  数据,不归档、不删除,原地留给人处置。`plugin-data/<id>/` 的所有权判定用的是
  源目录条目名(`scanPluginSourceEntries`,与"能否加载"解耦),因此这类目录的
  旧数据同样不会被误判成孤儿。
- **配置/KV/storage/消息态不再分叉**:此前 `plugins/<id>/plugin.json` 在场会把
  配置留在中央 plugin-settings、数据留在 `plugin-data/`、消息态强制 ephemeral;
  现在一律走家目录,消息态的 persistent 闸门只剩 manifest 的 lifetime 声明。
- **`plugin-data/` 里的存量不再被读取**:P1 之前写入的数据若还留在旧根,
  拆除后没有读路径会去取(存量已清零,故无实际影响);id 已不在存活集合的
  会被孤儿收尸归档,仍在存活集合的则原地不动、不再被使用。
