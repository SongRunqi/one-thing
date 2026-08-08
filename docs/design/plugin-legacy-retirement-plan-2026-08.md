# legacy 目录插件清零计划

> 状态:计划(2026-08-08 登记,P4 交付物)。
> 前置:P1(npm 形态)✅、P2(市场仓库 + CI)✅、P3(市场 UI)✅。
> 本文是 legacy 兼容路径的**退役时间表与操作单**,不是新设计。

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

## 验收(移除期到时照此核对)

1. `scanCorePlugins` 无 `scanLegacyPluginDirectories` 调用,`legacy` 标记字段删除;
2. loader 无 needsInstall 探测与门控安装机器;
3. `plugin-data/` 仅作为归档目录名出现在 `legacy-backup` 路径里;
4. 分发设计 §5.4 与本计划的"兼容路径"描述更新为历史注记;
5. 全量测试与双端 typecheck 绿。
