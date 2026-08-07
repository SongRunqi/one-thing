> **基于 e3f91cde 更新**(`fix(plugin): 整体验收修复——两处生命周期竞态/onDispose 持久化/降级恢复/文档失真`)。原脚本写在该提交**之前**,步骤 1/2/3/4 当时标注"预期会翻车";这些路径已修,预期改为"应当通过",**失败信号一律保留** —— 它们从"预告"变成"回归探针"。步骤 6 与步骤 8B 经核对**没有**被这次提交碰到,仍标"预期会翻车"。

## 真机走查脚本(按最可能翻车排序)

### 修复对照表(e3f91cde)

| # | 修的是什么 | 落点 | 对应步骤 | 现在的预期 |
| --- | --- | --- | --- | --- |
| 1 | refresh 在飞时 disable→enable 双份加载 | `core/plugins/manager.ts` per-plugin `loadTokens` | 步骤 1 | 应当通过 |
| 2 | shutdown 撞在飞 refresh,插件被复活 | 同上 `shuttingDown` 闩 + generation + 弃 refreshInFlight | 步骤 2 | 应当通过 |
| 3 | onDispose 里持久化必定失败 | `api-state.ts` 拆 `disposed` / `disposing` 两个闩 | 步骤 3 | **文件面**应当通过;**KV 面**仍有残留(见步骤 3 追加) |
| 4 | uninstall 不广播 catalog-changed | `app/plugins/manager.ts` override `uninstallPlugin` | 步骤 4 | 应当通过 |
| 5 | connector 降级是单向死门 | `runtime-guard.probeDegradedSurface` + 60s 时间半开 | 步骤 5 追加 | 应当通过(真机需要一条渠道) |
| 6 | 插件可自封 `permissionGuard: 'safe'` | `app/plugins/api.ts` 一律 `permission-gated` | 步骤 10(新增) | 应当通过 |
| — | recordSuccess 不清 lastError | **未修** | 步骤 6 | 仍会翻车 |
| — | 流结束后 show 出永不消失的状态 | **未修** | 步骤 8B | 仍会翻车 |

---

### 0. 准备(必须先做,否则会污染真实数据)

- 停掉 headless server:`lsof -ti:8787 | xargs kill` —— 改 `~/.onething` 前先停 server,否则两个进程抢同一份 plugin-settings。
- 备份三样:`cp ~/.onething/plugin-settings.json /tmp/ps.bak`;`cp -R ~/.onething/plugins /tmp/plugins.bak`;`cp -R ~/.onething/plugin-data /tmp/plugin-data.bak`。
- 起 app:`bun run dev:electron`(日志在 `~/.onething/log/dev.log`,全程 `tail -f` 它)。
- **准备一个探针插件**(多数步骤都需要可控的失败)。新建 `~/.onething/plugins/probe/`,放两个文件:

`plugin.json`
```json
{ "name": "probe", "version": "1.0.0", "description": "walkthrough probe",
  "contributes": {
    "panels": [{ "id": "probe", "label": "Probe" }],
    "settings": { "title": "Probe", "schema": { "type": "object", "properties": { "failPanel": { "type": "boolean", "default": false } } } }
  } }
```

`plugin-entry.js`
```js
export default function probe(api) {
  let n = 0
  api.registerWorkspacePanel({
    id: 'probe',
    render() {
      if (api.settings.get().failPanel) throw new Error('panel boom')
      return { version: 1, title: 'Probe', body: { type: 'markdown', text: `renders: ${++n}` } }
    },
  })
  api.on('stream:complete', (env) => { api.status.show(env.sessionId, { id: 'late', label: 'late status' }) })
  api.onDispose(() => {
    // 文件面 —— 修复 3 之后应当落盘。
    api.storage.writeJson('goodbye.json', { at: Date.now() })
    // KV 面 —— 修复 3 **没有**覆盖到,见步骤 3 的追加检查。
    api.store.set('bye', Date.now())
  })
  console.log('[probe] loaded')
}
```
- 设置 → Plugins → Refresh,确认 probe 出现且 Active。

**探针源码为什么是这个形状(e3f91cde 之后重新核对)**:

- `api.settings.get()` 是快照读、**有意不带 disposed 闩**(`core/plugins/api-builder.ts:438`),拆除竞速里不会拿到 undefined —— render 里直接读是安全的。
- 探针**不注册工具**:插件工具的 zod 参数校验意味着第三方插件要自带 zod 依赖(走 `needsInstall` 的 npm install 路径)。修复 6 的真机验证改走内置 log-monitor,见步骤 10;想在探针上验"插件填别的值会收到警告",按步骤 10 的可选做法加一个 `package.json`。
- `onDispose` 里现在写两处(文件 + KV)是**故意的**:修复 3 拆了 `disposed` / `disposing` 两个闩,但只有写面里的 `storage.*` 真的放行了;`store` 的关闭是另一条队列顺序问题。一次操作同时区分两者。

---

### 步骤 1 —— refresh 在飞时 disable→enable(涉及 R1/R4,**修复 1 之后应当通过**)

**操作**:让 probe 的加载变慢:在 `plugin-entry.js` 顶部加一行 `await new Promise(r => setTimeout(r, 8000))`(顶层 await)。设置页点 **Refresh**,立刻(3 秒内)把 probe 的开关 **关→开**。等 30 秒(两次加载各自要跑满 8 秒),然后在 dev.log 里搜 `probe`。

**预期(修复后)**:

- `[probe] loaded` 出现 **两次是正常的**。领号只在**写回**那一刻裁决,被超过的那一次早就把 entry 跑完了 —— 它是事后被 dispose 的,不是被拦在门外。**原脚本"只出现一次"的写法是错的**,改按下面三条判。
- `[PluginManager] Dropping superseded load of "probe"` 恰好 **一次**。
- `[PluginManager] Plugin "probe" loaded successfully` 恰好 **一次**。
- **不应**出现 `[PluginManager] Replacing an orphaned state for "probe"` —— 那是 Map.set 静默覆盖的兜底网,它响了说明领号那条没兜住,虽然结果被救回来了,仍要记一条。
- 副作用复核:发一条消息让会话跑完一轮,probe 的事件回调只跑一次;然后把 probe **停用**,此后 dev.log 里不该再有任何 probe 的日志或写盘。

**失败信号(保留,用于确认修复真的生效)**:`loaded successfully` 出现两次;或停用之后 probe 仍在处理事件、仍在写 `~/.onething/plugin-data/probe/`;或同一条事件被处理两遍。这就是 F1 复发 —— 两份 state 同时活着,先落的那份成了永远拆不掉的孤儿(事件双份、停用后仍写盘、注册的连接器无人撤下)。

**涉及**:R1(逐插件隔离加载)× R4(卸载/启停生命周期)× 修复 1(`loadTokens` 领号)。

---

### 步骤 2 —— 退出时机(涉及 R7,**修复 2 之后应当通过**)

**操作**:把顶层那句 await 改成 **2 秒**(`await new Promise(r => setTimeout(r, 2000))`)。完全退出 app,重新 `bun run dev:electron`,在启动后 **1 秒内** 用 Cmd+Q 退出。

> **为什么把 8 秒改成 2 秒**:原脚本用 8 秒 + 5 秒内退出 —— 加载回来时进程多半已经没了,什么也不打印,这跟"修好了"长得一模一样,**这一步本来就不可判定**。2 秒/1 秒把加载的返回点压进退出流程仍在跑的那个窗口里。

**预期(修复后)**:退出流程的日志之后 **不再出现** `[probe] loaded` / `Plugin "probe" loaded successfully`;若进程还活着到那一刻,应当看到 `[PluginManager] Dropping load of "probe": the plugin system is shutting down`。

**失败信号(保留)**:退出流程的日志之后仍打印 `[probe] loaded` / `loaded successfully`,或出现向已关闭 EventBus 发事件的报错。这是 F2 —— 插件在拆除之后被复活,那份 state 永不 dispose。

**追加(闩不能是单向的)**:退出流程里既没有 `Dropping load` 也没有 `loaded`,说明进程先退了 → 这一步**判为不可判定**,以 `packages/onething-runtime/src/app/plugins/__tests__/lifecycle-races.test.ts` 的两条用例为准(`does not resurrect a plugin when shutdown lands during an in-flight refresh` / `can be assembled again after shutdown`)。另外在 dev 下改一次插件代码触发热重载,确认插件**仍能装上** —— `initialize` 会把拆除闩放开,放不开的话 shutdown 之后一个插件也装不上。

**涉及**:R7(shutdownPlugins 进 beforeQuit)× R1(在飞加载)× 修复 2(`shuttingDown` 闩 + generation + 弃 refreshInFlight)。

---

### 步骤 3 —— onDispose 存盘(涉及 R4,**修复 3 之后:文件面应当通过,KV 面仍是缺口**)

**操作**:去掉那句顶层 await,Refresh 让 probe 正常加载。然后在设置页把 probe **停用**。检查 `ls ~/.onething/plugin-data/probe/` 与 `cat ~/.onething/plugin-data/probe/kv.json`。

**预期(修复后)**:

- 目录里出现 `goodbye.json`(`api.storage.writeJson` 在 onDispose 期间被放行);
- dev.log 里**没有** `Ignoring "storage.writeJson" after dispose — the plugin resumed past its teardown`。

**失败信号(保留)**:`goodbye.json` 不存在,且 dev.log 里有那行 `Ignoring "storage.writeJson" after dispose`。这是 F3 复发:插件的收尾持久化被闩死,异常被吞,日志还把原因说成「插件超时后复活」——完全误导。

**追加检查(修复 3 的覆盖边界,**预期这一半仍会翻车**)**:同一次停用里,看 `api.store.set('bye', …)` 有没有落进 `kv.json`。

- **现在的预期**:**落不进去**,并且 dev.log 出现 `[PluginStore:probe] Ignoring store.set after dispose — the plugin resumed past its teardown.`
- **理由**:修复 3 把写面的闩延后了(`state.disposing`),`api.storage.*` 因此放行;但 KV 那侧关的是 `PluginStore` 自己的 `disposed`,而 `closeStore` 是在 `createPluginAPI` **返回时**就 push 进 `schedulerDisposeCallbacks` 的(`app/plugins/api.ts`),插件的 onDispose 回调要等 `entry(api)` 跑起来才追加 —— `drainCallbacks` 是 FIFO,`store.dispose()` 仍排在所有插件回调**之前**。提交信息说"移到回调队列末尾",实际只是从"数组最前"挪到了"宿主回调之后、插件回调之前"。
- **判定**:出现上面那行日志 → **不是回归**,是修复 3 的覆盖边界,记一条待办(要么把 closeStore 改成在 drain 之后单独跑,要么让 `PluginStore` 也认 `disposing`)。若它居然落盘了,说明有人已经补过,把这条追加检查删掉。

**涉及**:R4(api.storage + 卸载语义)× R1(disposed 闩)× 修复 3(`disposed` / `disposing` 拆闩)。

---

### 步骤 4 —— 卸载后主窗口的面板入口(涉及 R4×R5,**修复 4 之后应当通过**)

**操作**:重新启用 probe。**主窗口**打开工作区侧面板(能看到导航条上那个拼图图标 "Probe")。保持主窗不动,在**设置窗**里对 probe 点 Uninstall 并确认。回到主窗口,不要刷新、不要重启。

**预期(修复后)**:

- 主窗导航条上的 "Probe" 入口消失;若当时正停在该面板上,视图**自动退回 media**(`MediaPanel` 的 `falls back to media when the open plugin panel disappears`);
- dev.log / renderer 侧能看到一条 `plugin-catalog-changed:probe` 的机械通知,并且**不弹 toast** —— 带 `kind` 的一律不弹(`kind: 'catalog-changed'` 这次已经进了 `shared/ipc/plugins.ts` 的契约,renderer 那两处 cast 也随之删掉了)。

**失败信号(保留)**:入口还在;点进去后显示一个普通错误(文案类似 `Unknown plugin "probe"`),而不是自动退回 media。这是 F4 —— uninstall 不发 catalog-changed,跨窗口的清单永远不更新。另一个新的失败形态:弹出了一条内容是 `plugin-catalog-changed:probe` 的 toast(机械信号漏进了给人看的通道)。

**涉及**:R4(真卸载)× R5(声明式面板入口)× R6 的通知轨 × 修复 4(override `uninstallPlugin` + 失效面板声明缓存)。

---

### 步骤 5 —— 降级与恢复的完整回合(涉及 R7×R5×R1,这是主线,预期基本会过)

**操作**:重新把 probe 装回去(`cp -R /tmp/plugins.bak/probe ~/.onething/plugins/` 或重建),Refresh 启用。设置页把 probe 的 `failPanel` 打开并保存。到工作区打开 Probe 面板,**连续点三次**导航切走再切回(每次切换触发一次 render)。

**预期**:
- 前两次:面板显示普通错误态 + 一个 **Retry** 按钮;
- 第三次(达阈)之后:面板换成**专门的降级态**,标题类似 "Probe is switched off after repeated failures",按钮文案是 **Try once more**(不是 Retry);
- 设置页 probe 卡片徽章变成 **Partly degraded**(**不是** Failed、**不是** Disabled),工具/命令仍在;
- 弹一条 toast 说明是哪个 surface 停了。

**失败信号**:
- 达阈后仍是普通错误态 + Retry(降级没牙齿);
- 卡片直接变成 Failed / 开关被自动关掉(连坐——面板失败不该禁插件);
- 同一句原因在卡片上被印了两遍(R7 第 6 项修的就是这个)。

**接着**:把 `failPanel` 关掉保存,回到降级态的面板点 **Try once more**。

**预期**:这一次成功渲染,面板恢复正常,设置页徽章回到 Active,degradedSurfaces 清空。

**失败信号**:点了 Try once more 仍被挡回降级态(说明 bypassDegraded 没透传),或渲染成功了但徽章仍停在 Partly degraded(说明恢复没有按 surface 聚合)。

**追加 5B —— 连接器降级的时间半开(修复 5,应当通过)**

面板靠"用户点按钮"逃生,**渠道投递没有按钮**:降级后闸在 `sendReply` 之前抛,而解除降级唯一的路是 `onSendSuccess`(要 sendReply 成功返回)—— 修复 5 之前这是一扇**单向死门**,接上 gateway 那天就是一条永久哑掉的渠道。现在按时间半开:降级满 `PLUGIN_SURFACE_PROBE_INTERVAL_MS`(60s)放行一次真投递,成功即恢复,失败重新计账;放行会把计时推到现在,所以探测本身有节流。

- **真机做法(需要一条能收发的 IM 渠道)**:让插件注册的 connector 连续投递失败 3 次进入降级 → 立刻再投递,应当被拒(`IM connector "…" is switched off after repeated failures`);**等满 60 秒**再投递一次,这一次应当真的进到插件里;若投递成功,徽章与 degradedSurfaces 当场清空。
- **失败信号**:等过 60 秒仍被拒(半开没接上,`probeSurface` 钩子没配);或冷却期内每次都放行(节流失效,`info.at` 没被推到现在)。
- **没有渠道可用时**:这一步判为不可判定,以 `app/plugins/__tests__/im-connector.test.ts` 的 `half-opens after a cooldown so a degraded channel is not a one-way door` 与 `__tests__/policy.test.ts` 的 `half-opens a degraded surface after the cooldown, and throttles the probe` 为准。

**涉及**:R7(严重度策略表 + 降级闸)× R5(面板)× R1(熔断计数)× R3(配置驱动)× 修复 5(时间半开)。

---

### 步骤 6 —— 残留的红字(涉及 R1,**e3f91cde 没有修它,预期仍会翻车**)

**操作**:紧接步骤 5——面板已经恢复正常了。现在只看设置页 probe 那张卡片。

**预期(应然)**:徽章 Active,**没有**任何错误行。

**现在的预期(实然)**:**仍会翻车**。徽章是 Active,底下却挂着一行 `request:panel:render:probe: panel boom`,而且刷新设置页、重开设置窗都不消失(只有重启或 disable→enable 才没)。

**核对结论**:e3f91cde **没有**碰这条路径。`CorePluginHealthTracker.recordSuccess`(`packages/core/plugins/runtime-guard.ts`)清的是 `degradedSurfaces`、各车道计数、`status` 与 `disabledReason` —— `lastError` / `lastErrorScope` / `lastErrorAt` 三个字段一个都没清,而设置页的红字读的正是它们。更糟一层:`restore()` 会把这三个字段从盘上读回来,所以重启也未必清干净(清干净靠的是 `clear()`,只有显式启用才走)。

**失败信号(即现症状)**:上述红字。**修好的样子**是:恢复渲染成功之后那一行当场消失,且不需要 disable→enable。

**涉及**:R1(健康态)× R7(设置页文案分叉)。**待修**。

---

### 步骤 7 —— 熔断整体禁用(涉及 R1×R7,预期会过)

**操作**:换一条会 disable 的车道。临时把探针的 `api.on('stream:complete', ...)` 改成 `api.on('stream:complete', () => { throw new Error('handler boom') })`,disable→enable 让新代码生效(热重载靠 reloadToken)。发三条消息,每条都让它跑完一轮。

**预期**:第三轮之后 —— 一条 error toast「Plugin "probe" was disabled automatically: …」;设置页 probe 徽章 **Failed**,开关自动变成关;卡片上写着 `Auto-disabled — 3 consecutive failures in event:stream:complete (last: handler boom)`;probe 的工具/命令从列表消失。

**失败信号**:失败了 3 次却没有禁用(事件家族应当是 disable-plugin);或者禁用了但重启后**没有原因**(说明 health 没落盘);或者禁用了而工具/命令还留在注册表里(半禁用)。

**验证跨重启**:退出 app 重开 → probe 仍是关闭状态,且卡片仍写着 Auto-disabled 与原因。

**再验证清账**:手动点开关启用 probe → 红字与 Failed 徽章应当**当场全清**(不是重启后才清)。这一条走的是 `clear()`,与步骤 6 的 `recordSuccess` 是两条路 —— 它过了不代表步骤 6 也过。

**涉及**:R1(熔断 + 落盘原因)× R7(严重度表:事件家族禁用 vs 面板家族降级)。

---

### 步骤 8 —— 流内状态与清扫(涉及 R6,**第二问 e3f91cde 没有修,预期仍会翻车**)

**操作 A**:把探针改成在工具执行里 show 状态(而不是 stream:complete),发一条消息触发它。

**预期 A**:会话气泡里出现一行状态指示器;流一结束(正常完成 / 报错 / 手动中止 三种都试)它**当场消失**。

**失败信号 A**:流结束后指示器还在转;或者它贴到了下一条毫不相干的消息上。

**操作 B**:恢复成脚本给的原版(在 `stream:complete` 的 handler 里 show)。发一条消息,等它跑完。

**预期 B(应然)**:什么也不出现——「状态只在流内有意义」,而流已经结束,应当被闸拒绝并在日志里 warn 一句 `tried to show a status on session … with no active stream`。

**现在的预期(实然)**:**仍会翻车**。气泡上出现一个 "late status" 指示器,并且**永远不消失**(切走再回来还在,直到停用插件或重启)。

**核对结论**:e3f91cde 的改动清单里没有 `core/plugins/status.ts` 与 `app/plugins/status.ts`,这条一个字没动。机制没变:清扫挂在终止事件的 **interceptor 相位**(commit 与 fan-out 之前),而插件的 `stream:complete` handler 跑在 fan-out **之后**;流内闸问的是 `streamEngine.getController(sessionId)`,那一拍控制器还没撤下 → `show` 被放行,而清扫已经跑过了,没有第二个人再来收。这就是 F9:**清扫跑在终止事件之前,流内闸要到更晚才关,中间那一拍能重新挂上一个没人再来清的状态。**

**失败信号(即现症状)**:上述永不消失的 "late status"。**修好的样子**是:要么 show 被拒并 warn,要么清扫的相位挪到闸关上之后。

**涉及**:R6(流状态 + 生命周期清扫)。**待修**。

---

### 步骤 9 —— 卸载的足迹与残留(涉及 R4×R5)

**操作**:先在 Probe 面板里让它渲染出一些内容(步骤 5 里已经渲染过若干次)。然后卸载 probe(确认框里会列出足迹)。卸载后检查:
- `ls ~/.onething/plugins/` —— 不应再有 probe;
- `ls ~/.onething/plugin-data/legacy-backup/` —— 应有 `probe-YYYY-MM-DD`;
- `cat ~/.onething/plugin-settings.json | grep probe` —— 三个键(enabled/config/health)都不应残留。

**预期**:以上三条全中,toast 报出归档路径。

**失败信号**:任一条残留;或者 plugins 目录被删了而 plugin-data 里还有 probe 目录(顺序错了,应当先归档再删源)。

**追加检查(F8)—— 手删目录这条卸载路径的孤儿归档**

> 原脚本在此处被截断(文件止于「**追加检查(F8)***」),下面按 R4 的孤儿扫描语义补全。

**操作**:把 probe 装回去并启用(让它在 `plugin-settings.json` 里留下三个键、在 `plugin-data/probe/` 里留下数据),然后**绕过 UI 直接手删源目录**:`rm -rf ~/.onething/plugins/probe`。回到设置页点 **Refresh**。

**预期**:
- dev.log 出现 `"probe" has plugin data but is no longer installed (…); archived to …` 与 `[PluginManager] Archived orphaned plugin data: probe`;
- `~/.onething/plugin-data/probe/` 已经不在,`plugin-data/legacy-backup/probe-YYYY-MM-DD` 里有它;
- `plugin-settings.json` 里 probe 的三个键(enabled/config/health)一并清掉 —— 数据搬走了键还留着的话,下一个同名插件会继承一具前世的启停位与配置。

**失败信号**:
- 数据仍在 `plugin-data/probe/`,且日志里没有任何孤儿相关行 —— 手删目录这条真实存在的卸载路径宿主仍然零感知;
- 或者出现 `Refusing to auto-archive …` 而当时插件目录明明是好的 —— 安全闸误判(扫描不可信 / 用户插件数为 0 / 候选超阈值三条之一),把原因抄下来;
- 或者数据归档了但 `plugin-settings.json` 里三个键还在。

**收尾**:走查做完把三份备份还原(`cp /tmp/ps.bak ~/.onething/plugin-settings.json`;`rm -rf ~/.onething/plugins/probe`;按需从 `/tmp/plugin-data.bak` 恢复),再重启 app。

---

### 步骤 10 —— 插件工具的权限门(涉及修复 6,**新增,预期应当通过**)

修复 6 之前,`permissionGuard` 这个字段是**交给插件自己填**的,宿主只给缺省值;而 `'safe'` 落在 `CORE_AUTO_EXECUTE` 集里 —— 任何插件写一行就绕过整套权限系统,manifest 的 `contributes.permissions` 纯装饰、不参与任何判定。**示例插件当时正在教这个写法。**现在插件注册的工具一律 `permission-gated`。

**操作(主路,不需要改探针)**:确认内置 **log-monitor** 插件已启用。在会话里让 AI 用它的工具查日志(例如「用 search_agent_logs 搜一下上一轮跑了哪些工具」)。

**预期**:工具调用**弹权限提示**,由用户决定放不放行;不再直接执行。

**失败信号**:工具无提示直接跑完 —— `permissionGuard` 又被交回给插件填了,或者 `Tool.define` 那一行的硬编码被改回 `tool.permissionGuard ?? …`。

**可选(验"插件填别的值会收到警告")**:给探针加一个工具。插件工具走真实工具注册表、带 zod 参数校验,所以探针要自带依赖 —— 在 `~/.onething/plugins/probe/` 放一个 `package.json`(`{ "dependencies": { "zod": "^3" } }`,加载器会跑 npm install),entry 里 `import { z } from 'zod'` 后注册:

```js
api.registerTool({
  name: 'probe_noop', description: 'probe', parameters: z.object({}),
  permissionGuard: 'safe',
  async execute() { return { ok: true } },
})
```

**预期**:dev.log 出现一条明确警告 `Tool "probe_noop" asked for permissionGuard "safe"; plugin tools are always permission-gated. Declare capabilities in contributes.permissions instead.`,而工具实际以 permission-gated 注册(调用时仍弹提示)。

**失败信号**:没有警告(宿主默默改写,插件作者永远不知道自己写的东西没生效),或工具真的自动执行了。

**涉及**:修复 6 × H 线(等 manifest 的 `permissions` 真正参与判定之后,再考虑按声明降级)。
