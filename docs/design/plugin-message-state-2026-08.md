# 插件消息作用域状态存储(坐标系设计)

> 2026-08-09 定稿。起因:tps-meter(消息级锚点 `message.footer` 的首个
> 插件)的 TPS 记录是纯内存 Map —— 重启/重载即失忆,插件安装前的消息
> 永远没有徽标。讨论逐轮升格:为 TPS 修存储 → 为插件系统立**存储坐标
> 系**,TPS 是第一个住户。
>
> 设计宪法不变:UI 不执行插件代码;声明先于代码;窄腰复用;宿主拥有
> **坐标系**(实体/作用域/生命周期),插件拥有**内容**(opaque,宿主零
> 解释)。

## 1. 存储坐标系(taxonomy)

插件系统的存储能力 = 一张"作用域 × 生命期 × 主人"的坐标表。新需求来
了放进格子,不为单个需求发明一次性设施。

| 作用域 | 主人 | 生命期 | 坐标 | 级联 | 状态 |
|--------|------|--------|------|------|------|
| app 级(插件自身) | 插件 | 跨重启;卸载归档 | 无 | 卸载归档 | ✅ `kv.json`(P1) |
| **message 级** | 插件 | 持久或即时(**声明**) | `(sessionId, messageId)` | 消息删→删;会话删→删 | 🔨 本期建设 |
| session 级 | 插件 | 跨重启,随会话消亡 | `(sessionId)` | 会话删→删 | 📋 登记,等真实需求 |
| run 级 | 插件 | 卸载即丢 | 无 | 卸载即清 | ✅ 内存(ephemeral 默认) |
| host 级(设置) | **宿主写,插件读** | 跨重启 | 无 | 设置系统 | ✅ `config.json`(P1) |

**session 级空缺是 taxonomy 照出的真实一层**(对应 VS Code 的
`workspaceState`),但本期不建 —— 设计系统 ≠ 预建所有格子。

## 2. 先例调研(2026-08-09,四条系统实查)

| 系统 | 架构 | 存储 | 消息流 | 卸载清理 |
|------|------|------|--------|---------|
| **Figma** | 插件跑主线程 sandbox(无浏览器 API);UI 在 iframe;两上下文**只能 postMessage** | `node.setPluginData(key,value)` —— **数据存在节点身上**,pluginId 命名空间,100KB/条,节点删→数据亡;`clientStorage` 本机不随文档;`getPluginDataKeys` 枚举;`setSharedPluginData` 跨插件 opt-in | 宿主→插件=事件;插件→宿主=sandbox API;UI↔插件=postMessage | 数据随节点/文档,无所谓卸载 |
| **VS Code** | 独立 Extension Host 进程;webview=插件控制的 iframe,双向 postMessage;RPC 代理 | `globalState`/`workspaceState`(Memento)→ SQLite `state.vscdb`;`globalStorageUri`;`secrets`(钥匙串);`setKeysForSync` 选择性同步 | 事件+命令+RPC | **不清**([#119022](https://github.com/microsoft/vscode/issues/119022));v1.21 起给卸载钩子 |
| **Chrome 扩展** | service worker(**随时被杀**)+content scripts+popup;`runtime.sendMessage` 互发;`storage.onChanged` 变更事件 | **三个区=三种生命周期**:`local`(10MB 落盘)/`sync`(100KB+跨设备)/`session`(内存,浏览器关就没);manifest `storage` **权限**闸门 | 事件驱动 SW + sendMessage | 清除 |
| **Obsidian** | 进程内直接调用 | `loadData()/saveData()` → 一个 `data.json` blob | 直接函数调用+事件 | 残留;无实体作用域 → **孤儿数据坑**(笔记改名/删除后旧条目永留) |

**三条收敛规律**:

1. **宿主管"区",插件管"内容"**——无一例外。宿主定义存储区(生命周
   期/作用域),拥有放置、配额、清理;插件拥有存什么、什么形状。
2. **"是否持久"是存储区的属性**,不是插件运行时行为(Chrome 三区即
   三种生命周期)。
3. **认真做实体注解的系统(Figma/WordPress)都让实体携带数据、宿主
   管级联;不做的(VS Code/Obsidian)全掉进孤儿数据坑** —— 插件在自
   己的大 KV 里按 URI/路径记账,实体消亡无从知晓。

## 3. 裁决

### 3.1 API 形态:复用窄腰

```js
api.storage.message(sessionId, messageId)
// → { readJson(name?, fallback?), writeJson(value), exists() } 同形 scoped 视图
```

复用 `api.storage` 整条管线:熔断记账(`withStorageFailureReport`)、
§7.4 拆除闩(`rejectDisposedWrite`)、家目录、卸载归档。粒度 = 一条消
息一个 blob(JSON 对象,插件自己管内键);Figma 按键粒度等真实多键需
求再开。

### 3.2 生命周期声明:slot 级声明 + 插件级闸门

```jsonc
// plugin.json
{ "contributes": { "uiSlots": [
  { "anchor": "message.footer", "id": "tps-meter", "label": "TPS",
    "lifetime": "persistent" }   // 默认 'ephemeral'
] } }
```

- loader 校验枚举;**未知值降级 ephemeral + unsupported 提示,不拒载**
  (与未知锚点同规,版本偏斜友好)。
- **闸门**:插件有任一 slot 声明 `persistent` → 消息态落盘+启动水合;
  否则纯内存(重启即丢)。声明是闸门不是装饰(Chrome `storage` 权限同
  效);槽级声明保持语义诚实(哪个块需要),闸门插件级是因为存储分不清
  一次写服务哪个槽 —— v1 接受。
- **披露**:安装确认页 persistent 槽显示"在消息上留下持久内容";市场
  索引 contributes 原样流出。

### 3.3 物理布局与级联

```
~/.onething/plugins/<id>/message-state/<sessionId>/<messageId>.json
```

- 家目录体系全复用:防 node_modules 闩、损坏挪 `.corrupt-<ts>`、卸载整
  目录归档(**归档/恢复零新代码**)。
- 宿主"知道"坐标的方式 = **结构性归属,不是语义识别**:写入时插件经
  scoped API 亲手递交 (sid, mid);级联时删除事件携带同坐标,存在即删;
  水合时目录遍历即索引。宿主对 JSON 内容零解释。
- 级联订阅:`message:deleted`(session 事件)→ 删文件;`session:deleted`
  (全局事件)→ 删目录。store 创建时自订阅、dispose 退订,生命周期与
  store 对齐。
- 文件名校验复用 `assertSafePluginFileName`(UUID 天然过)。

### 3.4 配额:宿主硬顶(调研唯一新增)

成熟系统全部持有配额(Chrome 10MB、Figma 100KB/条);自律 FIFO 在插件
手里,坏插件能写爆磁盘。**每插件 message-state 5MB 硬顶**:写超 → 拒
绝 + 熔断账(写面抛,与既有存储错误语义一致)。

### 3.5 行为归属检验(TPS 插件逐步)

| 步骤 | 主人 |
|------|------|
| 订阅什么事件、何时算账 | 插件 |
| complete→messageId 归属(自记账) | 插件 |
| TPS 公式、tone 判断 | 插件 |
| 写什么记录、何时写、形状迁移(建议带 `v` 字段) | 插件 |
| 放哪、落盘/内存闸门、水合、级联、配额、归档 | 宿主 |
| 显示什么、何时显示、何时 refresh | 插件 |

宿主新增的全部是基础设施,对 TPS 零知识;删了 tps-meter,设施原样服
务下一个插件。

## 4. 登记不做(防想象需求)

- 跨插件共享态(Figma `setSharedPluginData`)—— 无需求
- 按键粒度 API —— blob 够,插件对象内自管键
- `getPluginDataKeys` 式键枚举 —— 调试/迁移有用,等真实场景
- ephemeral 的"老消息跳过挂载"渲染优化 —— 等渲染扇出信号
- **同步/多人注解**(Chrome sync、Figma 实体携带):单机本地无需求;
  若 collab 房间将来共享插件注解,坐标键本地存储不随房间走,需走事件
  同步 —— 挂 collab 名下登记
- session 级持久态(§1 表)—— 布局已留位(`message-state/<sid>/` 平
  级),等第一个真实插件

## 5. 实施清单

| 层 | 改动 |
|---|------|
| core | `PluginContributionUiSlot.lifetime` + loader 枚举校验;`storage.ts` 消息态 store(两级路径+水合+级联自订阅+配额+拆除闩) |
| api-builder | `api.storage.message(sid, mid)` scoped 视图(复用熔断/拒写闩) |
| runtime | manager 接线:store 工厂 + 按 manifest 投影传 persistent 闸门 |
| renderer | 确认页 lifetime 披露 + 类型 |
| 插件仓 | tps-meter 换 API + manifest 声明 + 1.0.2 |
| 测试 | core 存储(布局/级联/损坏/配额/闸门)+loader+确认页+插件冒烟 |

落地状态(2026-08-09):代码 + 测试 + 文档已提交(宿主 `d0df3fa3` / `71ff2c36`,
插件仓 `ba06ef0`),typecheck node+web 绿、全量 7785 绿、boundary:gate 无新红。
消息态 API 面 11 条 + core 存储 10 条。**未做**:真机走查(下表)与 1.0.2 发布
(等走查通过再推 `tps-meter-v1.0.2` 标签)。

## 6. 真机走查清单(1.0.2)

前置:改 `~/.onething` 前先停掉 headless server/daemon;dev 下 main 进程的
改动要重启 electron(renderer 热重载不覆盖它)。

| # | 步骤 | 通过判据 |
|---|------|---------|
| 1 | 设置 → Plugins → Install:包名 `@onething-plugins/tps-meter`,本地路径 `<plugin 仓>/packages/tps-meter/dist/onething-plugins-tps-meter-1.0.2.tgz` | 卡片版本变 1.0.2 |
| 2 | 看该卡片的声明摘要 | 出现 `leaves persistent content on your messages` |
| 3 | 新会话发一条短消息 | 回复尾部出现 `⚡ x.x tok/s ↑ N tokens · T s` |
| 4 | `ls -R ~/.onething/plugins/tps-meter/message-state/` | 有 `<sessionId>/<messageId>.json`,内容含 `"v": 1` |
| 5 | 完全退出并重启,回到该会话 | **徽标还在**(1.0.1 在这一格必空 —— 这是本期的全部意义) |
| 6 | 删掉那条 assistant 消息 | 对应 `<mid>.json` 消失,同会话其他记录不动 |
| 7 | 删掉整条会话 | 整个 `<sessionId>/` 目录消失,其他会话目录不动 |
| 8 | (可选,反证闸门)临时删掉 node_modules 里该插件 `plugin.json` 的 `lifetime` 并重启 | 本次运行内徽标照常,**重启后老消息不再有徽标**;验完重装 tarball 恢复代码区 |
| 9 | (发布后)市场 → tps-meter → Install 确认页 | `ui slot "TPS" on anchor "message.footer" — leaves persistent content on your messages` |

注意两件事:

- 走查用的是 `file:` 开发通道,装完 `plugins/package.json` 里该条会变成本地路径。
  1.0.2 发布后**从市场重装一次**,让账本指回已发布 tarball —— 否则更新通道拿
  file: 条目去比,更新语义失真。
- **已在册的干扰项**(distribution 文档 §5.4 第 4 条):快速连续重载时事件订阅与
  请求处理器可能分属两个插件闭包 —— 表现为装完立刻不显示徽标,重启或手动
  disable/enable 即恢复。撞到照此判定,别记成消息态的账。
